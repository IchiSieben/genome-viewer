"""Capa de adquisicion contra el Atlas API.

Responsabilidades, y solo estas: pedir, reintentar, reanudar y sellar. No
transforma nada. La transformacion vive en ``freeze/``, para que un cambio en la
forma de los artefactos no obligue a volver a gastar cuota.

Por que hay reanudacion
-----------------------
Sin reanudacion, un corte de red a mitad de un lote cuesta la cuota entera del
lote. El cache en disco guarda cada variante por separado apenas llega, asi que
volver a correr el mismo comando solo pide lo que falta.

Nota de coste
-------------
``AtlasClient.query_interval`` trocea el intervalo en bloques de 32 pb y asume
tres alelos alternativos por posicion. Sobre 1 Mb son ~32 768 sub-peticiones y
~3,1 millones de variantes. **Nunca se usa aqui.** Los loci se consultan con
listas explicitas de variantes.
"""

from __future__ import annotations

import json
import logging
import os
import pathlib
import time
from typing import Any, Iterable, Iterator, Sequence

from alphagenome_platform import provenance

_log = logging.getLogger(__name__)

DEFAULT_SCORERS = ("AVI_SCORE", "AVI_SCORE_FEATURE_IMPORTANCE")
"""Scorers del Atlas que necesita la vista V1.

Los nombres son server-side: el paquete cliente 0.9.0 no los contiene (``grep``
sobre todo el paquete no encuentra 'AVI'). Si el servidor usa otros, se cambian
aqui y ``probe`` lo dira en su primera corrida.
"""


class MissingApiKey(RuntimeError):
    """No hay llave. Es un estado esperado, no un fallo del programa."""


def _read_env_lines(path: pathlib.Path) -> list[str]:
    """Lee un archivo .env sin suponer la codificacion.

    En Windows, `Out-File` y la redireccion `>` de PowerShell 5.1 escriben
    **UTF-16 LE con BOM**, no UTF-8. Un lector que asuma UTF-8 falla al
    decodificar y el programa reporta 'no hay llave' cuando la llave si esta,
    que es un diagnostico enganoso y costoso de perseguir.

    Se detecta el BOM y, si no lo hay, se prueba UTF-8 antes de caer a la
    codificacion ANSI del sistema.
    """
    raw = path.read_bytes()
    text: str | None = None
    # Se usan los codecs que CONSUMEN el BOM ("utf-16", "utf-8-sig"). Con
    # "utf-16-le" el BOM sobrevive como un ﻿ invisible al principio de la
    # primera linea, y str.strip() no lo quita: el nombre de la variable deja de
    # coincidir y vuelve el mismo diagnostico enganoso de "no hay llave".
    for bom, encoding in (
        (b"\xff\xfe", "utf-16"),
        (b"\xfe\xff", "utf-16"),
        (b"\xef\xbb\xbf", "utf-8-sig"),
    ):
        if raw.startswith(bom):
            text = raw.decode(encoding)
            break
    if text is None:
        for encoding in ("utf-8", "cp1252", "latin-1"):
            try:
                text = raw.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
    if text is None:
        return []
    # Cinturon y tirantes: se quita cualquier marca de orden residual.
    return [line.lstrip("﻿") for line in text.splitlines()]


def load_api_key(env_path: pathlib.Path | None = None) -> str:
    """Lee la llave del entorno o de ``~/.env``.

    La llave de AlphaGenome es personal e intransferible segun los terminos de
    uso, incluso dentro de la misma organizacion. Por eso vive fuera del
    repositorio y nunca se escribe a un log ni a un artefacto.

    Raises:
      MissingApiKey: Si no aparece en ninguna de las dos fuentes.
    """
    key = os.environ.get("ALPHAGENOME_API_KEY")
    if key:
        return key.strip().strip('"').strip("'")

    path = env_path or pathlib.Path.home() / ".env"
    if path.exists():
        for line in _read_env_lines(path):
            line = line.strip().removeprefix("export ").strip()
            if line.startswith("ALPHAGENOME_API_KEY"):
                _, _, value = line.partition("=")
                return value.strip().strip('"').strip("'")

    raise MissingApiKey(
        "No hay ALPHAGENOME_API_KEY en el entorno ni en ~/.env. "
        "Pon la llave ahi (nunca en el repositorio) y vuelve a intentar. "
        "Sin llave se puede seguir trabajando con fixtures sinteticas: "
        "python -m alphagenome_platform.cli fixtures"
    )


class ResumableCache:
    """Cache en disco, una variante por archivo.

    Un archivo por variante y no un unico JSON grande: escribir el archivo
    completo en cada variante seria O(n^2), y un corte a mitad de escritura
    dejaria el archivo entero ilegible en vez de perder una sola consulta.
    """

    def __init__(self, root: pathlib.Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> pathlib.Path:
        return self.root / f"{key}.json"

    def has(self, key: str) -> bool:
        return self._path(key).exists()

    def get(self, key: str) -> Any:
        return json.loads(self._path(key).read_text(encoding="utf-8"))

    def put(self, key: str, value: Any) -> None:
        # Escritura atomica: se escribe a un temporal y se renombra. Un corte
        # durante la escritura deja el temporal, no un JSON a medias.
        path = self._path(key)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(
            json.dumps(value, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        tmp.replace(path)

    def missing(self, keys: Iterable[str]) -> list[str]:
        return [key for key in keys if not self.has(key)]


def variant_key(chromosome: str, position: int, ref: str, alt: str) -> str:
    """Clave de cache y de ruta. El Atlas usa '>' y no vale en un nombre."""
    return f"{chromosome}-{position}-{ref}-{alt}"


def batched(items: Sequence[Any], size: int) -> Iterator[Sequence[Any]]:
    """Trocea en lotes. La reanudacion es por lote, no por corrida."""
    for start in range(0, len(items), size):
        yield items[start : start + size]


class AtlasSource:
    """Cliente del Atlas con reanudacion y sello de proveniencia.

    Se construye perezosamente: importar ``alphagenome`` y abrir el canal gRPC
    solo ocurre cuando de verdad hace falta pedir algo, de modo que el resto del
    pipeline corre sin el paquete instalado.
    """

    def __init__(
        self,
        cache_dir: pathlib.Path,
        *,
        api_key: str | None = None,
        scorers: Sequence[str] = DEFAULT_SCORERS,
        max_workers: int = 4,
    ):
        self.cache = ResumableCache(cache_dir)
        self.scorers = tuple(scorers)
        self.max_workers = max_workers
        self._api_key = api_key
        self._client: Any | None = None

    @property
    def client(self) -> Any:
        """Cliente del Atlas, creado en el primer uso."""
        if self._client is None:
            from alphagenome.atlas import atlas

            self._client = atlas.create(self._api_key or load_api_key())
        return self._client

    def provenance(self, config: Any, *, has_quantiles: bool | None = None):
        """Sello para los artefactos derivados de esta fuente."""
        return provenance.Provenance(
            source="atlas-api",
            config=config,
            scorers=self.scorers,
            has_quantiles=has_quantiles,
        )

    def fetch_variants(
        self,
        variants: Sequence[tuple[str, int, str, str]],
        *,
        batch_size: int = 50,
        retries: int = 3,
    ) -> dict[str, Any]:
        """Consulta variantes, saltando las que ya estan en cache.

        Args:
          variants: Tuplas ``(chromosome, position, ref, alt)``.
          batch_size: Variantes por lote.
          retries: Reintentos por lote ante error transitorio.

        Returns:
          Diccionario de clave de variante a su respuesta serializada.

        Raises:
          RuntimeError: Si un lote agota los reintentos.
        """
        from alphagenome.data import genome

        keys = [variant_key(*v) for v in variants]
        pending = [
            v for v, key in zip(variants, keys) if not self.cache.has(key)
        ]
        _log.info(
            "%d variantes pedidas, %d ya en cache, %d por consultar",
            len(variants),
            len(variants) - len(pending),
            len(pending),
        )

        for batch in batched(pending, batch_size):
            objects = [genome.Variant(c, p, r, a) for c, p, r, a in batch]
            for attempt in range(1, retries + 1):
                try:
                    result = self.client.query_variants(
                        objects,
                        requested_scorers=self.scorers,
                        max_workers=self.max_workers,
                        progress_bar=False,
                    )
                    for variant, anndata_by_scorer in _split_by_variant(result, batch):
                        self.cache.put(variant_key(*variant), anndata_by_scorer)
                    break
                except Exception as error:  # noqa: BLE001 - se reintenta y se relanza
                    if attempt == retries:
                        raise RuntimeError(
                            f"El lote fallo tras {retries} intentos. Lo ya "
                            f"descargado quedo en cache; volver a correr el "
                            f"comando reanuda desde ahi. Causa: {error}"
                        ) from error
                    espera = 2**attempt
                    _log.warning(
                        "Lote fallido (intento %d/%d): %s. Reintento en %ds",
                        attempt,
                        retries,
                        error,
                        espera,
                    )
                    time.sleep(espera)

        return {key: self.cache.get(key) for key in keys if self.cache.has(key)}


def _split_by_variant(
    result: Any, batch: Sequence[tuple[str, int, str, str]]
) -> Iterator[tuple[tuple[str, int, str, str], dict[str, Any]]]:
    """Reparte la respuesta por variante para poder cachear una a una.

    ``query_variants`` devuelve un AnnData por scorer con TODAS las variantes
    del lote apiladas en ``.obs``. Para que la reanudacion sea por variante hay
    que deshacer ese apilado.
    """
    for variant in batch:
        key = f"{variant[0]}:{variant[1]}:{variant[2]}>{variant[3]}"
        per_scorer: dict[str, Any] = {}
        for scorer, adata in result.items():
            # Mismo caso que en freeze/run.py: un scorer sin ninguna pista
            # cerca responde n_obs=0 y sin columna "variant". No es un lote
            # corrupto, es que no hay nada que reportar para esa modalidad.
            if adata.n_obs == 0 or "variant" not in adata.obs.columns:
                continue
            mask = [str(v) == key for v in adata.obs["variant"]]
            if not any(mask):
                continue
            subset = adata[mask]
            per_scorer[scorer] = {
                "X": subset.X.tolist(),
                "var": subset.var.reset_index().to_dict(orient="list"),
                "obs": {
                    column: [str(value) for value in subset.obs[column]]
                    for column in subset.obs.columns
                },
                "quantiles": (
                    subset.layers["quantiles"].tolist()
                    if subset.layers is not None and "quantiles" in subset.layers
                    else None
                ),
            }
        yield variant, per_scorer
