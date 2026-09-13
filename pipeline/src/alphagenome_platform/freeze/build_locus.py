"""Congela un locus real en artefactos del contrato v1.

Coste por locus, medido en H0 y no estimado:

  * 1 llamada a ``query_interval`` de 1 pb por posicion, para resolver que
    variantes existen de verdad sin inventar la base de referencia.
  * 1 llamada a ``query_variants`` para todas las variantes del locus a la vez,
    con todos los scorers pedidos. Da V1 y V2.
  * 1 llamada a ``predict_variant`` POR VARIANTE para los perfiles de V3.
  * 1 llamada a ``predict_variant`` MAS por variante con sashimi (V4), porque
    lleva su propio termino de ontologia. Ver abajo.
  * 1 peticion a Ensembl por locus, para el carril de genes.

`predict_variant` construye una sola peticion, verificado en el codigo fuente:
no hay troceo. El troceo de 32 pb es exclusivo de ``atlas.query_interval``.

Una llamada NO sirve para todas las modalidades
-----------------------------------------------
Esta cabecera decia que la llamada de V3 daba "V3, V4 y V5 de una vez". Es
cierto para los *outputs* y falso para lo que sirve: esa llamada fija
``ontology_terms=ONTOLOGY_TERMS`` (sangre, pulmon, higado), asi que pedirle
SPLICE_JUNCTIONS habria dibujado el splicing de DNM1 en sangre -simetrico, sin
error y sin aviso-. Cada familia de modalidad se pide aparte, con el curie que
corresponde a la biologia que se enseña. Ver D11 en docs/01-architecture.md.
"""

from __future__ import annotations

import logging
import pathlib
import time
from typing import Any, Sequence

import numpy as np

from alphagenome_platform import SCHEMA_VERSION, avi, contract, provenance, quantize
from alphagenome_platform.acquire import atlas_source, ensembl, ucsc
from alphagenome_platform.loci import LocusConfig, VariantSpec

_log = logging.getLogger(__name__)

WINDOW = 1 << 20
OVERVIEW_BIN = 128
DETAIL_HALF_WIDTH = 4096
MAX_TRACKS_PER_MODALITY = 4
MAX_TOP_TRACKS = 20
TOP_TRACKS_PER_MODALITY = 3
"""Tope por modalidad en la lista de tracks destacados."""
MAX_BIOSAMPLES = 240
"""Tope de filas del mapa de calor.

Con datos reales la union de biosamples entre las once modalidades se pasa del
presupuesto de 120 kB, y el test de presupuesto lo detecto en la primera
corrida real. Por encima de ~240 filas el mapa tampoco se lee: se conservan los
biosamples de mayor efecto y el documento declara cuantos habia en total, para
que la vista pueda decirlo en vez de fingir que los muestra todos.
"""

CELL_EPSILON = 1e-3
"""Por debajo de esto una celda no se distingue del cero en pantalla."""

AVI_SCORERS = ("AVI_SCORE", "AVI_SCORE_FEATURE_IMPORTANCE", "AVI_SCORE_MODEL_FEATURES")

HEATMAP_SCORERS = (
    "RNA_SEQ",
    "ATAC",
    "DNASE",
    "CAGE",
    "PROCAP",
    "CHIP_TF",
    "CHIP_HISTONE",
    "SPLICE_SITE_USAGE",
    "SPLICE_JUNCTIONS",
    "POLYADENYLATION",
    "CONTACT_MAPS",
)
"""Escalares por track para el mapa de calor. `MAX_VARIANT_SCORERS_PER_REQUEST`
es 20 en el cliente, asi que 3 + 11 entran holgados en una sola peticion."""

SIGNAL_OUTPUTS = ("RNA_SEQ", "DNASE", "ATAC", "CAGE", "CHIP_HISTONE", "PROCAP")
"""Modalidades de perfil para V3. Los mapas de contacto son 2D y van en V5."""

SATURATION_WINDOW = 512
"""Ancho de la ventana del mapa de saturacion, en pares de bases.

512 pb son 16 sub-peticiones de 32 pb y unas 1.536 variantes. Es el unico
sitio del pipeline donde se usa `query_interval`, que es el metodo caro, y a
esta escala su coste es de un par de segundos.
"""

ALT_BASES = ("A", "C", "G", "T")

ONTOLOGY_TERMS = (
    "UBERON:0000178",  # sangre
    "UBERON:0002048",  # pulmon
    "UBERON:0002107",  # higado
)

# Sistemas de organos para agrupar el mapa de calor. La agrupacion por ontologia
# es lo que hace legible la vista: alfabetico esparce los tejidos de un mismo
# sistema por todo el mapa.
_SYSTEM_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("blood", ("blood", "lymph", "spleen", "thymus", "leukocyte", "lymphocyte",
               "monocyte", "macrophage", "T cell", "B cell", "killer", "myeloid",
               "erythro", "megakaryo", "K562", "GM12878", "bone marrow")),
    ("nervous", ("brain", "cortex", "neuron", "astrocyte", "cerebell", "nerve",
                 "spinal", "hippocamp", "glia", "retina", "substantia")),
    ("digestive", ("liver", "hepato", "intestin", "colon", "stomach", "pancrea",
                   "esophag", "duoden", "rectum", "gastro", "HepG2")),
    ("cardiovascular", ("heart", "cardiac", "ventricle", "atrium", "aorta",
                        "artery", "vein", "endothel", "vascular", "HUVEC")),
    ("respiratory", ("lung", "bronch", "trachea", "alveol", "A549")),
    ("endocrine", ("thyroid", "adrenal", "pituitar", "pancreatic islet",
                   "ovary follicle", "parathyroid")),
    ("musculoskeletal", ("muscle", "myo", "osteo", "chondro", "bone", "skeletal",
                         "tendon", "cartilage")),
    ("reproductive", ("testis", "ovary", "uterus", "placenta", "prostate",
                      "sperm", "embryo", "vagina", "endometri")),
    ("integumentary", ("skin", "keratinocyte", "fibroblast", "epiderm", "melano")),
    ("renal", ("kidney", "renal", "bladder", "urothel", "nephro")),
)


def _organ_system(biosample: str) -> str:
    """Clasifica un biosample en un sistema de organos por palabras clave.

    Es una heuristica declarada, no una ontologia real: UBERON tiene la relacion
    parte-de que haria esto exacto, pero resolverla exige descargar la ontologia
    entera. Lo que no encaja cae en "otros" y se muestra como tal, sin fingir
    precision que no hay.
    """
    low = biosample.lower()
    for system, needles in _SYSTEM_RULES:
        if any(n.lower() in low for n in needles):
            return system
    return "otros"


SYSTEM_LABELS: dict[str, str] = {
    "blood": "Sangre e inmune",
    "nervous": "Sistema nervioso",
    "digestive": "Digestivo",
    "cardiovascular": "Cardiovascular",
    "respiratory": "Respiratorio",
    "endocrine": "Endocrino",
    "musculoskeletal": "Musculoesqueletico",
    "reproductive": "Reproductor",
    "integumentary": "Piel y anexos",
    "renal": "Renal y urinario",
    "otros": "Otros",
}

MODALITY_LABELS: dict[str, str] = {
    "RNA_SEQ": "RNA-seq",
    "ATAC": "ATAC",
    "DNASE": "DNase",
    "CAGE": "CAGE",
    "PROCAP": "PRO-cap",
    "CHIP_TF": "ChIP TF",
    "CHIP_HISTONE": "ChIP histonas",
    "SPLICE_SITE_USAGE": "Uso de sitio de splicing",
    "SPLICE_JUNCTIONS": "Uniones de splicing",
    "POLYADENYLATION": "Poliadenilacion",
    "CONTACT_MAPS": "Mapas de contacto",
}


def variant_id(chromosome: str, position: int, ref: str, alt: str) -> str:
    """Identificador seguro para rutas. El Atlas usa '>', que no vale en una."""
    return f"{chromosome}-{position}-{ref}-{alt}"


# --------------------------------------------------------------------------
# Resolucion de variantes
# --------------------------------------------------------------------------


def resolve_variants(
    client: Any, config: LocusConfig
) -> list[VariantSpec]:
    """Confirma contra el servidor que cada variante existe.

    Una variante con ``ref``/``alt`` vacios se resuelve enumerando lo que el
    Atlas conoce en esa posicion. Una con alelos dados se verifica: si la base
    de referencia no coincide, el servidor lo dice y aqui se corrige en vez de
    dejar fallar la corrida entera mas tarde.
    """
    from alphagenome.data import genome

    resolved: list[VariantSpec] = []
    by_position: dict[int, list[str]] = {}

    for spec in config.variants:
        if spec.position not in by_position:
            interval = genome.Interval(
                config.chromosome, spec.position - 1, spec.position
            )
            found = client.query_interval(
                interval, requested_scorers=["AVI_SCORE"], progress_bar=False
            )
            by_position[spec.position] = [
                str(v) for v in found["AVI_SCORE"].obs["variant"]
            ]
            _log.info(
                "posicion %d: %s", spec.position, by_position[spec.position]
            )

        available = by_position[spec.position]
        parsed = []
        for text in available:
            _, pos, alleles = text.split(":")
            ref, alt = alleles.split(">")
            parsed.append((int(pos), ref, alt))

        if spec.ref and spec.alt:
            match = [p for p in parsed if p[1] == spec.ref and p[2] == spec.alt]
            if match:
                resolved.append(spec)
                continue
            real_ref = parsed[0][1] if parsed else "?"
            _log.warning(
                "La variante %s:%s>%s no existe; la referencia real es %s. "
                "Se corrige al mismo alelo alternativo.",
                spec.position, spec.ref, spec.alt, real_ref,
            )
            fixed = [p for p in parsed if p[2] == spec.alt]
            chosen = fixed[0] if fixed else parsed[0]
            resolved.append(
                dataclass_replace(
                    spec,
                    ref=chosen[1],
                    alt=chosen[2],
                    note=(spec.note or "")
                    + f" Corregida: la referencia real es {chosen[1]}.",
                )
            )
        else:
            # Sin alelos: se toma el primero que el servidor conoce.
            chosen = parsed[0]
            resolved.append(
                dataclass_replace(spec, ref=chosen[1], alt=chosen[2])
            )

    # ------------------------------------------------- enriquecimiento de rsid
    # Solo cuando `loci.py` no trae uno ya verificado a mano (por ejemplo,
    # rs884510 contra la fuente primaria). No es una compuerta: dbSNP no tiene
    # entrada para la mayoria de los ~9 000 millones de SNVs posibles, y eso
    # no dice nada del efecto que el Atlas predice, asi que un fallo o una
    # ausencia aqui no descarta la variante, solo la deja sin identificador
    # pegable en dbSNP.
    for i, spec in enumerate(resolved):
        if spec.rsid:
            continue
        rsid = ucsc.lookup_rsid(config.chromosome, spec.position, spec.ref, spec.alt)
        if rsid:
            _log.info(
                "%s:%d:%s>%s -> %s (UCSC dbSnp155)",
                config.chromosome, spec.position, spec.ref, spec.alt, rsid,
            )
            resolved[i] = dataclass_replace(spec, rsid=rsid)

    return resolved


def dataclass_replace(spec: VariantSpec, **changes: Any) -> VariantSpec:
    """`dataclasses.replace` con un nombre que no choque con el modulo."""
    import dataclasses

    return dataclasses.replace(spec, **changes)


# --------------------------------------------------------------------------
# V1 y V2 desde el Atlas
# --------------------------------------------------------------------------


def build_card(
    chromosome: str,
    spec: VariantSpec,
    importance: np.ndarray,
    values: np.ndarray,
    feature_names: Sequence[str],
    raw_score: float,
    quantile: float | None,
    top_tracks: list[dict[str, Any]],
    prov: dict[str, Any],
    gene: str | None,
) -> dict[str, Any]:
    """Construye `card.json` con los nombres reales de los features."""
    avi.validate_feature_set(list(feature_names))

    features = []
    for name, contribution, value in zip(feature_names, importance, values):
        features.append(
            {
                "id": name,
                "label": avi.label_of(name),
                "family": avi.family_of(name),
                "contribution": _finite(contribution, default=0.0),
                # AlphaMissense solo aplica a variantes missense: en una no
                # codificante el Atlas devuelve NaN. Eso es "no aplica", y en el
                # contrato "no aplica" se escribe null.
                "value": _finite(value),
            }
        )

    finite_importance = np.where(np.isfinite(importance), importance, 0.0)
    base_value = float(raw_score) - float(np.sum(finite_importance))
    phred = (
        avi.phred_from_quantile(quantile)
        if quantile is not None and np.isfinite(quantile)
        else 0.0
    )
    if not np.isfinite(phred):
        phred = 0.0

    return {
        "schemaVersion": SCHEMA_VERSION,
        "variant": {
            "id": variant_id(chromosome, spec.position, spec.ref, spec.alt),
            "chromosome": chromosome,
            "position": spec.position,
            "ref": spec.ref,
            "alt": spec.alt,
            "rsid": spec.rsid,
            "gene": gene,
        },
        "provenance": prov,
        "avi": {
            "phred": _finite(phred, default=0.0, digits=4) or 0.0,
            "quantile": _finite(quantile, digits=8) if quantile is not None else None,
            "baseValue": _finite(base_value, default=0.0),
            "rawScore": _finite(raw_score),
        },
        "featureFamilies": [
            {
                "id": family,
                "label": label,
                "expectedCount": avi.FAMILY_EXPECTED_COUNT[family],
            }
            for family, label in (
                ("regulatory", "Regulatorio (AlphaGenome)"),
                ("protein", "Proteina"),
                ("conservation", "Conservacion"),
                ("indel", "Indel"),
            )
        ],
        "features": features,
        "topTracks": top_tracks,
    }


def build_tracks(
    chromosome: str,
    spec: VariantSpec,
    per_scorer: dict[str, tuple[np.ndarray, Any]],
    prov: dict[str, Any],
    gene: str | None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Construye `tracks.json` agregando cada modalidad por biosample.

    Un scorer como CHIP_TF devuelve 1 617 tracks, la mayoria del mismo
    biosample con distinto factor de transcripcion. La vista compara TEJIDOS, no
    experimentos, asi que se agrega por biosample quedandose con el efecto de
    mayor magnitud, que es el que la vista quiere destacar.

    Returns:
      El documento y la lista de tracks mas afectados para V1.
    """
    biosample_index: dict[str, int] = {}
    biosamples: list[dict[str, Any]] = []
    modalities: list[dict[str, Any]] = []
    cells: list[list[Any]] = []
    top: list[dict[str, Any]] = []

    for modality_index, (scorer, (row, metadata)) in enumerate(per_scorer.items()):
        modalities.append(
            {
                "id": scorer,
                "label": MODALITY_LABELS.get(scorer, scorer),
                "signed": bool(np.any(np.asarray(row) < 0)),
                "unit": None,
            }
        )
        if metadata is None or "biosample_name" not in metadata.columns:
            continue

        names = list(metadata["biosample_name"])
        curies = (
            list(metadata["ontology_curie"])
            if "ontology_curie" in metadata.columns
            else [None] * len(names)
        )
        types = (
            list(metadata["biosample_type"])
            if "biosample_type" in metadata.columns
            else [None] * len(names)
        )

        best: dict[str, tuple[float, int]] = {}
        for i, name in enumerate(names):
            if name is None or (isinstance(name, float) and np.isnan(name)):
                continue
            value = float(row[i])
            if not np.isfinite(value):
                continue
            current = best.get(name)
            if current is None or abs(value) > abs(current[0]):
                best[name] = (value, i)

        for name, (value, i) in best.items():
            if name not in biosample_index:
                biosample_index[name] = len(biosamples)
                biosamples.append(
                    {
                        "id": name,
                        "label": name,
                        "ontologyCurie": _clean(curies[i]),
                        "biosampleType": _clean(types[i]),
                        "organSystem": _organ_system(name),
                    }
                )
            if abs(value) < CELL_EPSILON:
                continue  # disperso: se omite lo indistinguible de cero
            cells.append([biosample_index[name], modality_index, round(value, 4)])
            top.append(
                {
                    "name": f"{scorer}:{name}",
                    "modality": scorer,
                    "biosample": name,
                    "ontologyCurie": _clean(curies[i]),
                    "strand": ".",
                    "score": round(value, 5),
                    "quantile": None,
                }
            )

    # Los tracks destacados se diversifican POR MODALIDAD antes de recortar.
    # Ordenar solo por magnitud deja las veinte filas ocupadas por la modalidad
    # que mas tracks tiene (SPLICE_JUNCTIONS trae 367), y el panel deja de
    # informar sobre las demas.
    top.sort(key=lambda t: abs(t["score"]), reverse=True)
    per_modality: dict[str, int] = {}
    diversified: list[dict[str, Any]] = []
    for track in top:
        count = per_modality.get(track["modality"], 0)
        if count >= TOP_TRACKS_PER_MODALITY:
            continue
        per_modality[track["modality"]] = count + 1
        diversified.append(track)
    top = diversified

    # Tope de filas: se conservan los biosamples de mayor efecto y se reindexan
    # las celdas. El total original se declara para que la vista lo diga.
    total_biosamples = len(biosamples)
    if total_biosamples > MAX_BIOSAMPLES:
        strength: dict[int, float] = {}
        for bi, _mi, value, *_ in cells:
            strength[bi] = max(strength.get(bi, 0.0), abs(value))
        keep = sorted(strength, key=lambda i: strength[i], reverse=True)[:MAX_BIOSAMPLES]
        keep_set = set(keep)
        remap = {old_i: new_i for new_i, old_i in enumerate(sorted(keep_set))}
        biosamples = [biosamples[i] for i in sorted(keep_set)]
        cells = [
            [remap[c[0]], c[1], *c[2:]] for c in cells if c[0] in keep_set
        ]

    systems = sorted({b["organSystem"] for b in biosamples})
    document = {
        "schemaVersion": SCHEMA_VERSION,
        "variant": {
            "id": variant_id(chromosome, spec.position, spec.ref, spec.alt),
            "chromosome": chromosome,
            "position": spec.position,
            "ref": spec.ref,
            "alt": spec.alt,
            "rsid": spec.rsid,
            "gene": gene,
        },
        "provenance": prov,
        "modalities": modalities,
        "organSystems": [
            {"id": s, "label": SYSTEM_LABELS.get(s, s)}
            for s in sorted(systems, key=lambda s: (s == "otros", s))
        ],
        "biosamples": biosamples,
        "biosampleTotal": total_biosamples,
        "cells": cells,
    }
    return document, top[:MAX_TOP_TRACKS]


def _finite(value: Any, *, default: float | None = None, digits: int = 6) -> float | None:
    """Redondea, y convierte lo no finito en `default`.

    NaN e infinito no son JSON valido. Ademas, en este dominio significan algo
    concreto: el feature no aplica a esta variante. Se escriben como null.
    """
    number = float(value)
    if not np.isfinite(number):
        return default
    return round(number, digits)


def _clean(value: Any) -> Any:
    """Convierte NaN de pandas a None, que es lo que el esquema admite."""
    if value is None:
        return None
    if isinstance(value, float) and np.isnan(value):
        return None
    return str(value)


# --------------------------------------------------------------------------
# V3: bloques de senal desde el Model API
# --------------------------------------------------------------------------


def build_signal_blocks(
    out_dir: pathlib.Path,
    locus_id: str,
    chromosome: str,
    spec: VariantSpec,
    model_output: Any,
    interval_start: int,
    prov_note: str,
    path_prefix: str = "",
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Emite los bloques AGSB de una variante y devuelve su descripcion.

    Se eligen los tracks de MAYOR efecto absoluto, no los primeros: un bloque
    lleno de tracks sin senal es un grafico vacio que igual ocupa 131 kB.
    """
    levels: dict[str, Any] = {}
    measurements: list[dict[str, Any]] = []

    detail_start = spec.position - DETAIL_HALF_WIDTH
    detail_end = detail_start + 2 * DETAIL_HALF_WIDTH

    for level, bin_size, start, length in (
        ("overview", OVERVIEW_BIN, interval_start, WINDOW // OVERVIEW_BIN),
        ("detail", 1, detail_start, 2 * DETAIL_HALF_WIDTH),
    ):
        modalities: dict[str, Any] = {}
        for modality in SIGNAL_OUTPUTS:
            attribute = modality.lower()
            ref_td = getattr(model_output.reference, attribute, None)
            alt_td = getattr(model_output.alternate, attribute, None)
            if ref_td is None or alt_td is None:
                continue

            ref_all = np.asarray(ref_td.values, dtype=np.float64)
            alt_all = np.asarray(alt_td.values, dtype=np.float64)
            if ref_all.shape != alt_all.shape or ref_all.ndim != 2:
                continue

            # Recorte a la ventana del nivel, en indices del arreglo completo.
            offset = start - interval_start
            if level == "overview":
                sl = slice(0, WINDOW)
            else:
                sl = slice(offset, offset + length)
            if sl.start < 0 or sl.stop > ref_all.shape[0]:
                continue

            ref_win = ref_all[sl]
            delta_win = alt_all[sl] - ref_win

            # Los tracks que mas se mueven son los que vale la pena guardar.
            strength = np.max(np.abs(delta_win), axis=0)
            order = np.argsort(strength)[::-1][:MAX_TRACKS_PER_MODALITY]

            arrays: list[np.ndarray] = []
            headers: list[dict[str, Any]] = []
            for t in order:
                ref_col = ref_win[:, t]
                delta_col = delta_win[:, t]
                if bin_size > 1:
                    ref_col = quantize.bin_signal(ref_col, bin_size, "mean")
                    # El delta se agrega por MAXIMO en magnitud: promediar un
                    # efecto estrecho lo borra, y borrarlo es el unico error
                    # imperdonable en esta vista.
                    delta_col = quantize.bin_signal(delta_col, bin_size, "max")

                q_ref = quantize.quantize(ref_col)
                q_delta = quantize.quantize(delta_col)
                arrays.extend([q_ref.values, q_delta.values])

                meta = ref_td.metadata.iloc[int(t)]
                headers.append(
                    {
                        "name": str(meta.get("name", f"{modality}:{t}")),
                        "biosample": _clean(meta.get("biosample_name")),
                        "ontologyCurie": _clean(meta.get("ontology_curie")),
                        "strand": str(meta.get("strand", ".")),
                        "ref": q_ref.to_header(),
                        "delta": q_delta.to_header(),
                    }
                )

            if not arrays:
                continue

            blob = quantize.pack_block(
                {
                    "schemaVersion": SCHEMA_VERSION,
                    "locus": locus_id,
                    "level": level,
                    "modality": modality,
                    "binSize": bin_size,
                    "length": len(arrays[0]),
                    "interval": {
                        "chromosome": chromosome,
                        "start": start,
                        "end": start + (len(arrays[0]) * bin_size),
                    },
                    "layout": "por track: arreglo REF seguido de arreglo DELTA",
                    "note": prov_note,
                    "tracks": headers,
                },
                arrays,
            )
            path = out_dir / "signals" / level / f"{modality}.bin"
            measured = contract.write_blob(
                path, blob, label=f"{locus_id}/{level}/{modality}"
            )
            measurements.append({"kind": "signal", "label": path.name, **measured})
            modalities[modality] = {
                "path": f"{path_prefix}signals/{level}/{modality}.bin",
                "bytes": measured["bytes"],
                "tracks": len(headers),
            }

        if modalities:
            first = next(iter(modalities))
            levels[level] = {
                "binSize": bin_size,
                "length": length,
                "interval": {
                    "chromosome": chromosome,
                    "start": start,
                    "end": start + length * bin_size,
                },
                "modalities": modalities,
            }
            del first

    return levels, measurements


# --------------------------------------------------------------------------
# N1: mapa de saturacion
# --------------------------------------------------------------------------


def build_saturation(
    client: Any,
    config: LocusConfig,
    spec: VariantSpec,
    prov: dict[str, Any],
    *,
    window: int = SATURATION_WINDOW,
) -> dict[str, Any]:
    """Consulta todas las variantes de una ventana y arma el mapa.

    La secuencia de referencia NO se pide aparte: cada variante llega como
    ``chr:pos:REF>ALT``, asi que la referencia se deduce de la propia respuesta.
    Una fuente menos que sincronizar y un fallo menos que tener.

    Args:
      client: Cliente del Atlas.
      config: Locus al que pertenece la ventana.
      spec: Variante sobre la que se centra.
      prov: Sello de proveniencia ya construido.
      window: Ancho de la ventana en pares de bases.

    Returns:
      El documento del mapa, listo para validar y escribir.
    """
    from alphagenome.data import genome

    half = window // 2
    start = spec.position - half
    end = start + window
    interval = genome.Interval(config.chromosome, start, end)

    _log.info(
        "[%s] saturacion: %d pb -> ~%d sub-peticiones de 32 pb",
        config.id,
        window,
        -(-window // 32),
    )
    t0 = time.perf_counter()
    result = client.query_interval(
        interval, requested_scorers=["AVI_SCORE"], progress_bar=False
    )
    _log.info("[%s] saturacion en %.2fs", config.id, time.perf_counter() - t0)

    adata = result["AVI_SCORE"]
    quantiles = (
        np.asarray(adata.layers["quantiles"]).ravel()
        if adata.layers and "quantiles" in adata.layers
        else None
    )

    raw_scores = np.asarray(adata.X).ravel()
    reference = ["N"] * window
    grid: list[list[float | None]] = [[None] * window for _ in ALT_BASES]
    raw_grid: list[list[float | None]] = [[None] * window for _ in ALT_BASES]
    filled = 0

    for row, variant in enumerate(adata.obs["variant"]):
        _chrom, pos_text, alleles = str(variant).split(":")
        ref_base, alt_base = alleles.split(">")
        # Solo SNVs: un indel no cabe en una rejilla de una base por columna.
        if len(ref_base) != 1 or len(alt_base) != 1:
            continue
        column = int(pos_text) - 1 - start
        if not 0 <= column < window:
            continue
        reference[column] = ref_base
        if alt_base not in ALT_BASES:
            continue
        value = 0.0
        if quantiles is not None and row < quantiles.size:
            q = float(quantiles[row])
            if np.isfinite(q):
                value = avi.phred_from_quantile(q)
        if not np.isfinite(value):
            value = 0.0
        index = ALT_BASES.index(alt_base)
        grid[index][column] = round(float(value), 3)
        if row < raw_scores.size and np.isfinite(raw_scores[row]):
            raw_grid[index][column] = round(float(raw_scores[row]), 4)
        filled += 1

    possible = window * (len(ALT_BASES) - 1)
    values = [v for fila in grid for v in fila if v is not None]

    return {
        "schemaVersion": SCHEMA_VERSION,
        "locus": config.id,
        "interval": {"chromosome": config.chromosome, "start": start, "end": end},
        "provenance": prov,
        "focus": spec.position,
        "reference": "".join(reference),
        "alts": list(ALT_BASES),
        "phred": grid,
        "raw": raw_grid,
        "maxPhred": round(max(values), 3) if values else None,
        "coverage": round(filled / possible, 4) if possible else None,
    }


# --------------------------------------------------------------------------
# V4: uniones de splicing, REF vs ALT, sobre un biosample declarado
# --------------------------------------------------------------------------

SASHIMI_HALF_WIDTH = DETAIL_HALF_WIDTH
"""Mismo ancho que el nivel `detail` de V3 (variante +-4096 pb). Un sitio de
splicing que la variante desplaza esta, por definicion, pegado a ella; no hay
motivo para inventar una tercera medida de ventana."""

SASHIMI_MIN_VALUE = 0.01
"""Piso de magnitud para incluir una union en el artefacto.

Medido sobre DNM1/glutamatergic neuron (CL:0000679), no supuesto: de las 5553
uniones que el Atlas conoce en la ventana de 1 Mb, el percentil 99 es 0,0207 y
el 98,7 % no llega a 0,02. El lado debil de la union que esta variante
desplaza -el efecto real que la vista existe para mostrar- vale 0,03, tres
veces el piso. 0,01 deja fuera el ruido de fondo con margen sin arriesgar la
senal."""


def biosample_name_for(client: Any, ontology_curie: str) -> str:
    """Nombre legible de un termino de ontologia, leido del servidor.

    No se hardcodea el nombre junto al curie en `loci.py`: `scorer_metadata()`
    es una consulta de metadata (lista de tracks disponibles), no una
    prediccion, asi que verificar el nombre en cada build no cuesta cuota de
    la misma clase que `query_variants`/`predict_variant`. Si el curie no
    aparece en ningun track de SPLICE_JUNCTIONS, se devuelve el propio curie:
    mejor un identificador tecnico visible que un nombre inventado.
    """
    try:
        meta = client.scorer_metadata().get("SPLICE_JUNCTIONS")
        if meta is not None and "ontology_curie" in meta.track_metadata.columns:
            match = meta.track_metadata[
                meta.track_metadata["ontology_curie"] == ontology_curie
            ]
            if len(match):
                return str(match.iloc[0]["biosample_name"])
    except Exception as error:  # noqa: BLE001 - metadata es un enriquecimiento
        _log.warning("no se pudo leer el nombre de %s: %s", ontology_curie, error)
    return ontology_curie


def build_splice(
    chromosome: str,
    spec: VariantSpec,
    model: Any,
    interval: Any,
    prov: dict[str, Any],
    ontology_term: str,
    biosample_name: str,
    finding: str | None = None,
    *,
    half_width: int = SASHIMI_HALF_WIDTH,
    min_value: float = SASHIMI_MIN_VALUE,
) -> dict[str, Any]:
    """Arcos REF/ALT de splicing (V4) para UN biosample declarado.

    Llamada a ``predict_variant`` APARTE de la que arma V3: pedir
    SPLICE_JUNCTIONS en esa misma llamada usaria ``ONTOLOGY_TERMS`` (sangre,
    pulmon, higado en H4), y en un biosample donde la variante no actua el
    grafico sale simetrico sin que nada falle. El biosample viene declarado por
    quien llama, no por un default compartido.

    ``status: "no_data"`` es el caso "modalidad silenciosa": el Atlas devolvio
    CERO uniones en TODA la ventana de 1 Mb para este biosample (no solo en la
    ventana estrecha que se muestra). Es distinto de una ventana estrecha vacia
    tras el piso de magnitud, que es ``status: "ok"`` con ``junctions: []``.
    """
    from alphagenome.data import genome
    from alphagenome.models import dna_output

    output = model.predict_variant(
        interval=interval,
        variant=genome.Variant(chromosome, spec.position, spec.ref, spec.alt),
        requested_outputs=[dna_output.OutputType.SPLICE_JUNCTIONS],
        ontology_terms=[ontology_term],
    )
    ref_jd = output.reference.splice_junctions
    alt_jd = output.alternate.splice_junctions
    biosample = {"name": biosample_name, "ontologyCurie": ontology_term}

    # Un curie NO garantiza un solo track. Medido en los metadatos de
    # CONTACT_MAPS para V5: EFO:0003042 (H1-hESC) y EFO:0003045 (H9) traen
    # seis tracks cada uno bajo el mismo termino. Aqui abajo se lee `values[i, 0]`, que con varios tracks
    # devolveria el primero en silencio y dibujaria un sashimi de un ensayo
    # sin decir cual. Agregar seria una decision de modelado que nadie tomo:
    # se para y se nombran los tracks para que quien elija el curie elija.
    for name, jd in (("reference", ref_jd), ("alternate", alt_jd)):
        if jd is None or len(jd.values) == 0:
            continue
        n_tracks = jd.values.shape[1]
        if n_tracks != 1:
            meta = getattr(jd, "metadata", None)
            tracks = [] if meta is None else list(meta.get("name", []))
            raise ValueError(
                f"SPLICE_JUNCTIONS devolvio {n_tracks} tracks para "
                f"{ontology_term} ({name}); el contrato asume uno. "
                f"Tracks: {tracks}. Elige un curie de un solo track o decide "
                f"explicitamente como agregarlos."
            )

    if ref_jd is None or alt_jd is None or (len(ref_jd) == 0 and len(alt_jd) == 0):
        return {
            "schemaVersion": SCHEMA_VERSION,
            "variant": {
                "id": variant_id(chromosome, spec.position, spec.ref, spec.alt),
                "chromosome": chromosome,
                "position": spec.position,
                "ref": spec.ref,
                "alt": spec.alt,
                "rsid": spec.rsid,
            },
            "provenance": prov,
            "biosample": biosample,
            "interval": {
                "chromosome": chromosome,
                "start": spec.position - half_width,
                "end": spec.position + half_width,
            },
            "status": "no_data",
            "minValueShown": min_value,
            "totalJunctionsInWindow": 0,
            "junctions": [],
        }

    # REF y ALT pueden, en principio, no compartir el mismo conjunto exacto de
    # coordenadas -verificado que SI lo comparten en DNM1, pero no se asume
    # para cualquier variante futura-, asi que se reconcilian por clave en vez
    # de dar por hecho que las filas estan alineadas.
    win_start = spec.position - half_width
    win_end = spec.position + half_width

    def _in_window(j: Any) -> bool:
        return j.start < win_end and j.end > win_start

    ref_map: dict[tuple[int, int, str], float] = {
        (j.start, j.end, j.strand): float(ref_jd.values[i, 0])
        for i, j in enumerate(ref_jd.junctions)
        if _in_window(j)
    }
    alt_map: dict[tuple[int, int, str], float] = {
        (j.start, j.end, j.strand): float(alt_jd.values[i, 0])
        for i, j in enumerate(alt_jd.junctions)
        if _in_window(j)
    }
    keys = set(ref_map) | set(alt_map)
    total_in_window = len(keys)

    junctions = []
    for start, end, strand in sorted(keys):
        r = ref_map.get((start, end, strand), 0.0)
        a = alt_map.get((start, end, strand), 0.0)
        if max(r, a) < min_value:
            continue
        junctions.append(
            {
                "start": int(start),
                "end": int(end),
                "strand": strand,
                "ref": round(r, 4),
                "alt": round(a, 4),
            }
        )

    return {
        "schemaVersion": SCHEMA_VERSION,
        "variant": {
            "id": variant_id(chromosome, spec.position, spec.ref, spec.alt),
            "chromosome": chromosome,
            "position": spec.position,
            "ref": spec.ref,
            "alt": spec.alt,
            "rsid": spec.rsid,
        },
        "provenance": prov,
        "biosample": biosample,
        **({"finding": finding} if finding else {}),
        "interval": {"chromosome": chromosome, "start": win_start, "end": win_end},
        "status": "ok",
        "minValueShown": min_value,
        "totalJunctionsInWindow": total_in_window,
        "junctions": junctions,
    }


# --------------------------------------------------------------------------
# V5: diff de mapas de contacto, REF vs ALT, sobre un biosample declarado
# --------------------------------------------------------------------------

CONTACT_DOMAIN = 1.0
"""Dominio ABSOLUTO y FIJO del color del diff. No se autoescala jamas.

La prueba que separa un dominio fijo de un autoescalado disfrazado: *si el
dominio cambia cuando cambian los datos, es autoescalado*, por mucho que se
vista de constante redondeada. Un "redondo por encima del grueso de |delta|"
cambia con cada variante; este no.

Por que 1 y no otro fijo: el mapa que devuelve el modelo ya viene en espacio
logaritmico (ver `CONTACT_VALUES_ARE_LOG`), asi que 1 es del orden de duplicar
o partir por la mitad el contacto -exactamente el doble si la base es 2, que es
la premisa de partida; la base NO se pudo medir y el SDK no la documenta-. Esa
es la magnitud de un cambio estructural de verdad -un limite de TAD que se
rompe, un bucle de CTCF que se pierde-, de modo que saturacion plena significa
"esto reorganizo el locus".
El ancla es externa a los datos e identica en todos los loci: dos variantes se
comparan mirando dos mapas, sin leer dos leyendas distintas.

Consecuencia medida y buscada: en CELSR2/rs12740374 el cambio maximo es 0,0391,
un 3,9 % del dominio. El mapa sale casi plano. Eso ES el resultado. Lo que la
vista no puede hacer es callar el color Y el numero a la vez, asi que la
leyenda marca donde cae el maximo observado dentro del dominio fijo y el texto
lo dice con cifras."""

CONTACT_VISIBLE_FRACTION = 0.1
"""Fraccion del dominio por debajo de la cual se declara "no se ve".

Un cambio menor que el 10 % del dominio no llega a un paso de color
distinguible en la escala divergente (siete paradas). Si `maxAbsDelta` no
llega aqui, el artefacto lo dice y la vista lo escribe en palabras: el usuario
no tiene que deducir de un mapa blanco si no paso nada o si fallo la carga."""

CONTACT_HALF_BINS = 64
"""Semiventana del recorte, en bins de 2048 pb (+-131 kb).

Medido contra la biologia del caso, no elegido redondo: el TSS de SORT1 -el
gen diana publicado de rs12740374, y por tanto el unico sitio de la ventana
donde un cambio de contacto significaria algo- cae 61 bins rio abajo de la
variante. +-32 y +-48 no lo alcanzan. +-64 lo alcanza con tres bins de
margen. Recortar importa: la matriz completa es 512x512, que en JSON no cabe
en ningun presupuesto razonable."""

CONTACT_REF_SCALE = 0.001
CONTACT_DELTA_SCALE = 0.00001
"""Escalas de cuantizacion para guardar enteros en vez de decimales.

El modelo ya entrega valores cuantizados -835 valores distintos de |delta| en
las 262 144 celdas-, asi que guardar decimales largos seria guardar ruido de
punto flotante. Enteros: 26,0 KB para el delta frente a 53,9 KB en decimales,
con error maximo de 5e-6 contra un maximo de 0,039."""

CONTACT_VALUES_ARE_LOG = """El mapa NO viene en probabilidades.

El docstring del SDK dice "probability that two DNA bases are in contact", y
la medicion lo desmiente: el 79,1 % de los valores de REF son NEGATIVOS -el
97,9 % en la diagonal principal-, el rango es -0,746 a 1,938, y exp(REF) no
decae como ley de potencias con la distancia: se queda rondando 1. El propio
test del SDK genera contact maps con `np.random.normal(0, 1, ...)`.

Es decir: el mapa ya viene en espacio logaritmico y con el decaimiento por
distancia retirado, del tipo log(observado/esperado). Tres consecuencias, y
las tres van contra lo que uno haria por defecto:

1. `ALT - REF` YA ES el log del cociente. No hay que dividir, y por tanto no
   hace falta pseudoconteo: no hay denominador que se vaya a cero.
2. No hay celdas "sin contacto" que enmascarar. Las 262 144 tienen valor
   finito, y un valor bajo significa DEPLECION, no ausencia. Una mascara
   contra un suelo inexistente pintaria una afirmacion falsa.
3. No hay que normalizar por distancia. Se cancelaria en la resta de todos
   modos -mismo locus en REF y en ALT-, y encima el modelo ya lo hizo."""


def build_contacts(
    chromosome: str,
    spec: VariantSpec,
    model: Any,
    interval: Any,
    prov: dict[str, Any],
    ontology_term: str,
    biosample_name: str,
    finding: str | None = None,
    *,
    half_bins: int = CONTACT_HALF_BINS,
    domain: float = CONTACT_DOMAIN,
) -> dict[str, Any]:
    """Diff de mapa de contacto REF vs ALT (V5) para UN biosample declarado.

    Llamada a ``predict_variant`` APARTE, por la misma razon que
    ``build_splice``: CONTACT_MAPS no esta en ``SIGNAL_OUTPUTS`` y su menu de
    ontologias no se parece en nada al de las senales. Los 28 tracks de
    CONTACT_MAPS son TODOS de 4D Nucleome y TODOS lineas celulares: cero
    tejido primario, cero neuronal. El biosample lo declara quien llama.

    Ver ``CONTACT_VALUES_ARE_LOG`` para por que el diff es una resta a secas.
    """
    import numpy as np
    from alphagenome.data import genome
    from alphagenome.models import dna_output

    output = model.predict_variant(
        interval=interval,
        variant=genome.Variant(chromosome, spec.position, spec.ref, spec.alt),
        requested_outputs=[dna_output.OutputType.CONTACT_MAPS],
        ontology_terms=[ontology_term],
    )
    ref_td = output.reference.contact_maps
    alt_td = output.alternate.contact_maps
    base = {
        "schemaVersion": SCHEMA_VERSION,
        "variant": {
            "id": variant_id(chromosome, spec.position, spec.ref, spec.alt),
            "chromosome": chromosome,
            "position": spec.position,
            "ref": spec.ref,
            "alt": spec.alt,
            "rsid": spec.rsid,
        },
        "provenance": prov,
        "biosample": {"name": biosample_name, "ontologyCurie": ontology_term},
    }

    if ref_td is None or alt_td is None or ref_td.values.size == 0:
        return {**base, "status": "no_data"}

    # Un curie NO garantiza un solo track: EFO:0003042 (H1-hESC) y EFO:0003045
    # (H9) traen seis cada uno. En un mapa de contacto los tracks son el ULTIMO
    # eje -la forma es (bins, bins, tracks)-, no el segundo como en una senal
    # 1D. Coger `[:, :, 0]` con varios tracks dibujaria un ensayo sin decir
    # cual. Se para y se nombran, igual que en build_splice.
    for name, td in (("reference", ref_td), ("alternate", alt_td)):
        n_tracks = td.values.shape[-1]
        if n_tracks != 1:
            meta = getattr(td, "metadata", None)
            tracks = [] if meta is None else list(meta.get("name", []))
            raise ValueError(
                f"CONTACT_MAPS devolvio {n_tracks} tracks para "
                f"{ontology_term} ({name}); el contrato asume uno. "
                f"Tracks: {tracks}. Elige un curie de un solo track o decide "
                f"explicitamente como agregarlos."
            )

    ref_m = np.asarray(ref_td.values[:, :, 0], dtype=np.float64)
    alt_m = np.asarray(alt_td.values[:, :, 0], dtype=np.float64)
    if ref_m.shape[0] != ref_m.shape[1] or ref_m.shape != alt_m.shape:
        raise ValueError(
            f"mapa no cuadrado o desalineado: {ref_m.shape} vs {alt_m.shape}"
        )

    # La simetria se COMPRUEBA, no se supone: de ella depende guardar solo el
    # triangulo superior, que es la mitad de los bytes.
    for name, m in (("reference", ref_m), ("alternate", alt_m)):
        if not np.array_equal(m, m.T):
            raise ValueError(
                f"el mapa {name} no es simetrico (max|m-m.T| = "
                f"{np.abs(m - m.T).max():.3e}); el artefacto guarda solo el "
                f"triangulo superior y eso dejaria de ser reversible."
            )

    n_full = ref_m.shape[0]
    resolution = (interval.end - interval.start) // n_full
    full_bin = (spec.position - 1 - interval.start) // resolution
    lo = max(0, min(full_bin - half_bins, n_full - (2 * half_bins + 1)))
    hi = lo + 2 * half_bins
    ref_w = ref_m[lo : hi + 1, lo : hi + 1]
    alt_w = alt_m[lo : hi + 1, lo : hi + 1]
    delta_w = alt_w - ref_w
    n = ref_w.shape[0]
    vbin = full_bin - lo

    iu = np.triu_indices(n)
    ref_q = np.round(ref_w[iu] / CONTACT_REF_SCALE).astype(int).tolist()
    delta_q = np.round(delta_w[iu] / CONTACT_DELTA_SCALE).astype(int).tolist()

    # El maximo se mide sobre la VENTANA COMPLETA de 1 Mb, no sobre el recorte:
    # afirmar "el cambio maximo es X" mirando solo lo que se dibuja seria
    # afirmarlo sobre una muestra elegida por conveniencia.
    delta_full = alt_m - ref_m
    flat = np.abs(delta_full)
    fi, fj = np.unravel_index(int(flat.argmax()), flat.shape)
    max_abs = float(flat[fi, fj])

    # La cruz que midio el AVI: "all interactions involving the
    # variant-containing bin". Como la matriz es simetrica, fila y columna son
    # el mismo conjunto, asi que la cruz del AVI es literalmente UNA fila.
    row_mean_abs = float(np.abs(delta_full[full_bin, :]).mean())

    return {
        **base,
        **({"finding": finding} if finding else {}),
        "status": "ok",
        "interval": {
            "chromosome": chromosome,
            "start": interval.start + lo * resolution,
            "end": interval.start + (hi + 1) * resolution,
        },
        "predictedInterval": {
            "chromosome": chromosome,
            "start": interval.start,
            "end": interval.end,
        },
        "resolution": int(resolution),
        "bins": int(n),
        "variantBin": int(vbin),
        "domain": domain,
        "visibleThreshold": round(domain * CONTACT_VISIBLE_FRACTION, 6),
        "maxAbsDelta": round(max_abs, 6),
        "maxAbsDeltaAt": {
            # En coordenadas de la matriz COMPLETA, no del recorte: por eso se
            # llama `fullBin` y no `bin`. `variantBin`, en cambio, va en
            # coordenadas del recorte porque es donde la vista lo dibuja.
            # Mezclar los dos marcos sin decirlo es como se construye una
            # frase cierta que el dibujo no respalda.
            "fullBin": int(fj if fi == full_bin else fi),
            # El maximo se mide sobre el megabase entero, asi que puede caer
            # FUERA de lo que se dibuja. Si la vista no lo supiera, diria "el
            # mayor cambio esta en la cruz" y el lector recorreria la fila
            # resaltada sin encontrarlo nunca.
            "insideDrawnWindow": bool(lo <= int(fi) <= hi and lo <= int(fj) <= hi),
            "involvesVariantBin": bool(full_bin in (int(fi), int(fj))),
            "separationBp": int(abs(int(fi) - int(fj)) * resolution),
            "ref": round(float(ref_m[fi, fj]), 6),
            "alt": round(float(alt_m[fi, fj]), 6),
        },
        "variantRowMeanAbsDelta": round(row_mean_abs, 6),
        "referenceRange": {
            "min": round(float(ref_m.min()), 6),
            "max": round(float(ref_m.max()), 6),
            "p1": round(float(np.percentile(ref_m, 1)), 6),
            "p99": round(float(np.percentile(ref_m, 99)), 6),
        },
        "scales": {"reference": CONTACT_REF_SCALE, "delta": CONTACT_DELTA_SCALE},
        "reference": ref_q,
        "delta": delta_q,
    }
