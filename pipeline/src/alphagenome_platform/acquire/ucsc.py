"""Enriquecimiento de rsid desde el track dbSnp155 de UCSC.

Por que esto es un enriquecimiento y no un requisito
-----------------------------------------------------
El Atlas puntua cualquiera de los ~9 000 millones de SNVs posibles del genoma,
incluidos los que nadie ha catalogado. Un rsid es una propiedad de "alguien lo
vio y lo registro en dbSNP", no una propiedad de la variante ni de su efecto
predicho: `featured_pointer` NO exige rsid por eso (ver `contract.py`). Esta
consulta es puramente para *mostrar* el identificador cuando existe, para que
quien llega de fuera pueda pegarlo en dbSNP.

Por que UCSC y no dbSNP directo
--------------------------------
dbSNP no tiene una API REST de consulta por coordenada sin registro. El track
`dbSnp155` de UCSC (bigDbSnp, hg38) si, sin llave: una peticion por posicion
devuelve el rsid y los alelos que dbSNP conoce ahi, verificado contra la
consola de este mismo pipeline.

`chromStart` es 0-based (la convencion BED de UCSC), a diferencia de `position`
en `VariantSpec`, que es 1-based en todo el resto del pipeline.

Esto corre en el PIPELINE, nunca en la web.
"""

from __future__ import annotations

import hashlib
import json
import logging
import pathlib
import time
import urllib.error
import urllib.request
from typing import Any

_log = logging.getLogger(__name__)

BASE = "https://api.genome.ucsc.edu/getData/track"
USER_AGENT = "alphagenome-platform/0.1 (pipeline offline, uso no comercial)"

CACHE_DIR = pathlib.Path(__file__).resolve().parents[4] / "data" / "cache" / "ucsc"
"""Cache en disco. Una posicion no cambia de rsid entre corridas."""


class UcscError(RuntimeError):
    """UCSC no respondio o respondio algo que no se puede usar."""


def _get(chromosome: str, start: int, end: int, *, retries: int = 2) -> Any:
    """GET con cache en disco y reintento ante error transitorio."""
    query = f"genome=hg38;track=dbSnp155;chrom={chromosome};start={start};end={end}"
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = CACHE_DIR / (hashlib.sha256(query.encode()).hexdigest()[:24] + ".json")
    if cached.exists():
        return json.loads(cached.read_text(encoding="utf-8"))

    url = f"{BASE}?{query}"
    for attempt in range(1, retries + 1):
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                payload = json.loads(response.read().decode("utf-8"))
            cached.write_text(
                json.dumps(payload, separators=(",", ":")), encoding="utf-8"
            )
            return payload
        except urllib.error.HTTPError as error:
            if error.code in (429, 500, 502, 503) and attempt < retries:
                time.sleep(min(4, 2**attempt))
                continue
            raise UcscError(f"UCSC respondio {error.code} a {url}") from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            if attempt < retries:
                time.sleep(min(4, 2**attempt))
                continue
            raise UcscError(f"No se pudo contactar UCSC: {error}") from error
    raise UcscError(f"UCSC agoto los reintentos para {url}")


def lookup_rsid(chromosome: str, position: int, ref: str, alt: str) -> str | None:
    """Busca el rsid catalogado para una variante puntual exacta.

    Args:
      chromosome: Con prefijo ``chr``.
      position: 1-based, igual que en ``VariantSpec``.
      ref: Alelo de referencia.
      alt: Alelo alternativo.

    Returns:
      El rsid (``"rsNNNN"``) si dbSnp155 tiene una entrada con ese ref y ese
      alt exactos en esa posicion; ``None`` si no hay ninguna, si el sitio es
      multialelico y ``alt`` no es uno de los alelos catalogados, o si la
      consulta falla. Nunca levanta: es un enriquecimiento, no una compuerta.
    """
    try:
        payload = _get(chromosome, position - 1, position)
    except UcscError as error:
        _log.warning("rsid de %s:%d no verificado (UCSC): %s", chromosome, position, error)
        return None

    for feature in payload.get("dbSnp155") or []:
        if feature.get("ref") != ref:
            continue
        alts = [a for a in (feature.get("alts") or "").split(",") if a]
        if alt in alts:
            return feature.get("name")
    return None
