"""Sello de proveniencia de los artefactos.

Esto no es contabilidad decorativa. Dos fechas lo vuelven obligatorio:

* **2026-06-18** los cuantiles del AVI se recalibraron: antes se estimaban sobre
  chr22, ahora genome-wide. Rompe la comparabilidad con cualquier analisis
  anterior.
* **2026-07-14** se corrigio la inferencia de indels.

Comparar artefactos de cosechas distintas es invalido, y un PHRED no lleva
escrito de que cosecha viene. El sello es lo unico que hace detectable el error.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import hashlib
import json
from typing import Any, Literal

CALIBRATION_EPOCH = "quantiles>=2026-06-18,indels>=2026-07-14"
"""Epoca de calibracion vigente.

Si DeepMind vuelve a recalibrar, se cambia esta constante y todo artefacto
emitido despues queda marcado como de otra cosecha, sin tocar nada mas.
"""

Source = Literal["atlas-api", "model-api", "synthetic"]


def config_hash(config: Any) -> str:
    """Hash estable de una configuracion, para detectar que cambio entre corridas.

    Normaliza ordenando claves y sin espacios, de modo que reordenar el archivo
    de configuracion no cambie el hash pero cambiar un valor si.

    Args:
      config: Cualquier estructura serializable a JSON.

    Returns:
      Los primeros 16 caracteres del sha256 hexadecimal.
    """
    blob = json.dumps(config, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def client_version() -> str:
    """Version instalada del paquete alphagenome, o 'not-installed'."""
    try:
        import importlib.metadata as md

        return md.version("alphagenome")
    except Exception:  # pragma: no cover - depende del entorno
        return "not-installed"


@dataclasses.dataclass(frozen=True)
class Provenance:
    """Sello que acompana a todo artefacto emitido por el pipeline."""

    source: Source
    config: dataclasses.InitVar[Any] = None
    client_version: str = dataclasses.field(default_factory=client_version)
    queried_at: str = dataclasses.field(
        default_factory=lambda: dt.datetime.now(dt.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    calibration_epoch: str = CALIBRATION_EPOCH
    scorers: tuple[str, ...] = ()
    has_quantiles: bool | None = None
    notes: str | None = None
    _config_hash: str = dataclasses.field(default="", init=False)

    def __post_init__(self, config: Any) -> None:
        object.__setattr__(self, "_config_hash", config_hash(config))

    def to_dict(self) -> dict[str, Any]:
        """Serializa al esquema ``common.schema.json#/$defs/provenance``."""
        from alphagenome_platform import __version__

        out: dict[str, Any] = {
            "source": self.source,
            "clientVersion": self.client_version,
            "pipelineVersion": __version__,
            "queriedAt": self.queried_at,
            "configHash": self._config_hash,
            "calibrationEpoch": self.calibration_epoch,
        }
        if self.scorers:
            out["scorers"] = list(self.scorers)
        if self.has_quantiles is not None:
            out["hasQuantiles"] = self.has_quantiles
        if self.notes:
            out["notes"] = self.notes
        return out


def synthetic(seed: int, notes: str | None = None) -> Provenance:
    """Sello para fixtures sinteticas.

    Marcar el origen como ``synthetic`` es lo que impide que una figura hecha
    con datos inventados se publique como si fuera una prediccion real. El
    validador del contrato lo verifica y la web lo muestra en pantalla.
    """
    return Provenance(
        source="synthetic",
        config={"seed": seed},
        notes=notes or f"Fixture sintetica, semilla {seed}. NO son predicciones.",
    )
