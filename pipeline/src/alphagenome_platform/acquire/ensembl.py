"""Anotacion de genes desde Ensembl REST.

Por que Ensembl y no un GTF
---------------------------
El paquete `alphagenome` trae utilidades para leer anotaciones pero **no incluye
ninguna**: `gene_annotation.py` y `transcript.py` esperan que el usuario aporte
un GTF de GENCODE, que son decenas de megabytes comprimidos para el genoma
entero. Para dibujar el carril de genes de un locus de 1 Mb hace falta una
fraccion minuscula de eso.

Ensembl REST devuelve exactamente los genes, transcritos y exones que solapan
una region, en GRCh38, sin llave y sin registro. Es una peticion por locus y el
resultado se congela en `annotations.json` como cualquier otro artefacto.

Esto corre en el PIPELINE, nunca en la web: la web no hace ninguna peticion de
red mas alla de sus propios archivos.
"""

from __future__ import annotations

import json
import logging
import pathlib
import time
import urllib.error
import urllib.request
from typing import Any

_log = logging.getLogger(__name__)

BASE = "https://rest.ensembl.org"
USER_AGENT = "alphagenome-platform/0.1 (pipeline offline, uso no comercial)"

# Se piden solo transcritos con soporte; el resto ensucia el carril sin aportar.
INTERESTING_BIOTYPES = {
    "protein_coding",
    "lncRNA",
    "miRNA",
    "snoRNA",
    "snRNA",
}


class EnsemblError(RuntimeError):
    """Ensembl no respondio o respondio algo que no se puede usar."""


CACHE_DIR = pathlib.Path(__file__).resolve().parents[4] / "data" / "cache" / "ensembl"
"""Cache en disco de las respuestas de Ensembl.

La anotacion de un locus no cambia entre corridas y Ensembl responde 500 de
forma intermitente bajo carga. Cachear evita perder una respuesta buena y hace
que reconstruir un locus no dependa de que el servicio este de buen humor.
"""


def _get(path: str, *, retries: int = 2) -> Any:
    """GET con cache en disco, reintento y espera exponencial.

    Ensembl limita por frecuencia y responde 429, y devuelve 500 transitorios
    bajo carga. Reintentar con espera es lo que pide su propia documentacion.
    """
    import hashlib

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = CACHE_DIR / (hashlib.sha256(path.encode()).hexdigest()[:24] + ".json")
    if cached.exists():
        return json.loads(cached.read_text(encoding="utf-8"))

    url = f"{BASE}{path}"
    for attempt in range(1, retries + 1):
        request = urllib.request.Request(
            url, headers={"Content-Type": "application/json", "User-Agent": USER_AGENT}
        )
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                payload = json.loads(response.read().decode("utf-8"))
            cached.write_text(
                json.dumps(payload, separators=(",", ":")), encoding="utf-8"
            )
            return payload
        except urllib.error.HTTPError as error:
            if error.code in (429, 500, 502, 503) and attempt < retries:
                wait = float(error.headers.get("Retry-After", min(6, 2**attempt)))
                _log.warning("Ensembl %d; esperando %.1fs", error.code, wait)
                time.sleep(wait)
                continue
            raise EnsemblError(f"Ensembl respondio {error.code} a {url}") from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            # Un timeout de lectura llega como TimeoutError crudo desde socket,
            # no como URLError: hay que atraparlo explicitamente o se escapa y
            # tumba la corrida entera por una anotacion que es opcional.
            if attempt < retries:
                time.sleep(min(4, 2**attempt))
                continue
            raise EnsemblError(f"No se pudo contactar Ensembl: {error}") from error
    raise EnsemblError(f"Ensembl agoto los reintentos para {url}")


REGION_CHUNK = 256 * 1024
"""Ancho del trozo de region. 1 Mb de una vez agota el tiempo de Ensembl."""

MAX_GENES_WITH_EXONS = 12
"""Cuantos genes reciben estructura exonica detallada.

Pedir genes, transcritos y exones de 1 Mb en una sola llamada hace que Ensembl
responda **HTTP 500**: son varios miles de features y supera su tope por
respuesta. Verificado, no supuesto. La solucion es dos niveles: una llamada por
region para los genes, y una llamada por gen para su estructura.
"""


def fetch_genes(
    chromosome: str,
    start: int,
    end: int,
    *,
    focus: int | None = None,
    max_detailed: int = MAX_GENES_WITH_EXONS,
) -> list[dict[str, Any]]:
    """Devuelve genes con sus transcritos y exones, en coordenadas GRCh38.

    Hace una llamada por la region para listar genes, y luego una por gen para
    su estructura exonica. Los genes mas alejados del foco se quedan sin exones
    y se dibujan como cuerpo: el carril sigue siendo correcto y el numero de
    peticiones queda acotado.

    Args:
      chromosome: Con o sin el prefijo ``chr``; Ensembl lo quiere sin el.
      start: Inicio 0-based inclusivo.
      end: Fin 0-based exclusivo.
      focus: Posicion de interes; los genes cercanos son los que reciben exones.
      max_detailed: Tope de genes con estructura detallada.

    Returns:
      Lista de genes en el formato de ``annotations.schema.json``.

    Raises:
      EnsemblError: Si la peticion falla.
    """
    name = chromosome.removeprefix("chr")
    region = f"{name}:{start + 1}-{end}"

    # La region se pide por TROZOS de 256 kb. Un solo overlap de 1 Mb agota el
    # tiempo de lectura o devuelve 500 bajo carga; medido, no supuesto. Ademas
    # cada trozo se cachea por separado, asi que un fallo a mitad no tira lo que
    # ya se habia traido.
    raw_genes: list[dict[str, Any]] = []
    failures = 0
    for chunk_start in range(start, end, REGION_CHUNK):
        chunk_end = min(chunk_start + REGION_CHUNK, end)
        try:
            raw_genes.extend(
                _get(
                    f"/overlap/region/human/{name}:{chunk_start + 1}-{chunk_end}"
                    "?feature=gene;content-type=application/json"
                )
            )
        except EnsemblError as error:
            failures += 1
            _log.warning("trozo %d-%d sin genes: %s", chunk_start, chunk_end, error)
    if failures and not raw_genes:
        raise EnsemblError(f"Ensembl no devolvio ningun gen para {region}")

    genes: list[dict[str, Any]] = []
    ids: list[str] = []
    seen: set[str] = set()
    for item in raw_genes:
        if item.get("biotype") not in INTERESTING_BIOTYPES:
            continue
        # Un gen que cruza el borde de dos trozos aparece en ambos.
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        genes.append(
            {
                "name": item.get("external_name") or item["id"],
                "strand": "+" if item.get("strand", 1) >= 0 else "-",
                # Ensembl entrega 1-based cerrado; el contrato usa 0-based
                # semiabierto, igual que genome.Interval.
                "start": int(item["start"]) - 1,
                "end": int(item["end"]),
                "transcripts": [],
            }
        )
        ids.append(item["id"])

    centre = focus if focus is not None else (start + end) // 2
    order = sorted(
        range(len(genes)),
        key=lambda i: abs((genes[i]["start"] + genes[i]["end"]) // 2 - centre),
    )

    detailed = 0
    for i in order[:max_detailed]:
        built: list[dict[str, Any]] = []
        try:
            # /lookup/id?expand=1 devuelve los transcritos con su lista de
            # exones en UNA sola respuesta, cuando responde.
            record = _get(f"/lookup/id/{ids[i]}?expand=1;content-type=application/json")
            for transcript in record.get("Transcript", []) or []:
                if transcript.get("biotype") not in INTERESTING_BIOTYPES:
                    continue
                exons = [
                    [int(e["start"]) - 1, int(e["end"])]
                    for e in transcript.get("Exon", []) or []
                ]
                if exons:
                    exons.sort()
                    built.append({"id": transcript["id"], "exons": exons})
        except EnsemblError as error:
            _log.info("lookup fallo para %s (%s); se prueba por region",
                      genes[i]["name"], error)

        if not built:
            # Respaldo: /lookup devuelve 500 de forma PERSISTENTE para ciertos
            # genes, PPP1R1A entre ellos, mientras que /overlap/region sobre el
            # tramo del gen si responde. Un solo gen abarca pocos kb, asi que la
            # peticion es pequena.
            try:
                built = _structure_by_region(
                    chromosome, genes[i]["start"], genes[i]["end"], ids[i]
                )
            except EnsemblError as error:
                _log.warning("sin estructura para %s: %s", genes[i]["name"], error)

        genes[i]["transcripts"] = built
        if built:
            detailed += 1
        # Ensembl pide no pasar de ~15 peticiones por segundo.
        time.sleep(0.08)

    genes.sort(key=lambda g: g["start"])
    _log.info(
        "Ensembl: %d genes en %s, %d con estructura exonica",
        len(genes), region, detailed,
    )
    return genes


def _structure_by_region(
    chromosome: str, start: int, end: int, gene_id: str
) -> list[dict[str, Any]]:
    """Saca transcritos y exones de un gen pidiendo su tramo por region."""
    name = chromosome.removeprefix("chr")
    features = _get(
        f"/overlap/region/human/{name}:{start + 1}-{end}"
        "?feature=transcript;feature=exon;content-type=application/json"
    )
    transcripts: dict[str, dict[str, Any]] = {}
    for item in features:
        if (
            item.get("feature_type") == "transcript"
            and item.get("Parent") == gene_id
            and item.get("biotype") in INTERESTING_BIOTYPES
        ):
            transcripts[item["id"]] = {"id": item["id"], "exons": []}
    for item in features:
        if item.get("feature_type") != "exon":
            continue
        parent = item.get("Parent")
        if parent in transcripts:
            transcripts[parent]["exons"].append(
                [int(item["start"]) - 1, int(item["end"])]
            )
    built = []
    for transcript in transcripts.values():
        if transcript["exons"]:
            transcript["exons"].sort()
            built.append(transcript)
    return built


def trim_transcripts(genes: list[dict[str, Any]], keep: int = 2) -> list[dict[str, Any]]:
    """Se queda con los transcritos de mas exones por gen.

    Un gen puede tener decenas de transcritos y dibujarlos todos convierte el
    carril en una mancha. Se conservan los mas completos, que son los que dan la
    estructura exonica reconocible, y el presupuesto de bytes deja de depender
    de cuantas isoformas tenga anotado el gen.
    """
    for gene in genes:
        gene["transcripts"].sort(key=lambda t: len(t["exons"]), reverse=True)
        gene["transcripts"] = gene["transcripts"][:keep]
    return genes
