"""Contrato de datos: validacion de esquema y presupuesto de bytes.

Dos invariantes, y las dos se prueban en ``tests/``:

1. **Todo artefacto valida contra su JSON Schema** de ``contracts/v1/``. Se usa
   un validador real (``jsonschema``), no confianza.
2. **Todo artefacto cabe en su presupuesto de bytes.** Un visor que tarda en
   cargar no es un visor, asi que el presupuesto es parte del contrato y su
   incumplimiento rompe el build.
"""

from __future__ import annotations

import dataclasses
import gzip
import json
import pathlib
from typing import Any, Iterator

from alphagenome_platform import SCHEMA_VERSION

ROOT = pathlib.Path(__file__).resolve().parents[3]
CONTRACTS = ROOT / "contracts" / "v1"
DIST = ROOT / "data" / "dist"


# --------------------------------------------------------------------------
# Presupuesto de bytes
# --------------------------------------------------------------------------


@dataclasses.dataclass(frozen=True)
class Budget:
    """Presupuesto de un tipo de artefacto.

    Attributes:
      kind: Nombre del tipo, para los mensajes de error.
      max_bytes: Tope del archivo tal como se sirve, SIN comprimir.
      rationale: Por que ese numero y no otro. Un presupuesto sin justificacion
        es un numero inventado.
    """

    kind: str
    max_bytes: int
    rationale: str


# Los topes salen del calculo de docs/02-data-contract.md. El del bloque de
# senal es el unico que se deriva de una formula cerrada:
#   4 tracks x 2 arreglos (REF, DELTA) x 8192 valores x 2 bytes = 131 072 B
# mas cabecera. El tope deja ~22 % de holgura para modalidades con mas tracks.
BUDGETS: dict[str, Budget] = {
    "index": Budget(
        "index",
        32 * 1024,
        "Se descarga en el arranque y bloquea la primera pintura. Solo punteros.",
    ),
    "locus": Budget(
        "locus",
        64 * 1024,
        "Se descarga al entrar al locus. Lista de variantes y mapa de bloques.",
    ),
    "card": Budget(
        "card",
        50 * 1024,
        "18 features + ~20 tracks destacados + proveniencia. V1 es la vista mas barata.",
    ),
    "tracks": Budget(
        "tracks",
        120 * 1024,
        "Escalares dispersos: ~300 biosamples x ~11 modalidades en formato indexado.",
    ),
    "signal": Budget(
        "signal",
        160 * 1024,
        "4 tracks x (REF+DELTA) x 8192 x 2 B = 131 072 B + cabecera, con holgura.",
    ),
    "study": Budget(
        "study",
        96 * 1024,
        "Manifiesto mas paneles embebidos pequenos; los datos grandes van aparte.",
    ),
    "annotations": Budget(
        "annotations",
        128 * 1024,
        "Genes y transcritos de 1 Mb, con exones en coordenadas GRCh38 absolutas.",
    ),
}


class BudgetExceeded(Exception):
    """Un artefacto supera su presupuesto. Rompe el build a proposito."""


def check_budget(kind: str, payload: bytes, label: str = "") -> dict[str, Any]:
    """Verifica el presupuesto y devuelve la medicion.

    Mide tambien el tamano con gzip porque es lo que viaja por la red en
    Hostinger, pero el tope se aplica sobre el tamano SIN comprimir: el ratio
    de compresion depende del contenido y no se puede garantizar por contrato.

    Args:
      kind: Clave de ``BUDGETS``.
      payload: Bytes del artefacto tal como se escribiran a disco.
      label: Identificador para el mensaje de error.

    Returns:
      Diccionario con ``bytes``, ``gzipBytes``, ``budget`` y ``usedFraction``.

    Raises:
      KeyError: Si el tipo no tiene presupuesto declarado.
      BudgetExceeded: Si se pasa del tope.
    """
    budget = BUDGETS[kind]
    size = len(payload)
    gz = len(gzip.compress(payload, compresslevel=9))
    if size > budget.max_bytes:
        raise BudgetExceeded(
            f"{kind} {label or ''}: {size:,} B supera el presupuesto de "
            f"{budget.max_bytes:,} B ({size / budget.max_bytes:.1%}). "
            f"Razon del tope: {budget.rationale}"
        )
    return {
        "bytes": size,
        "gzipBytes": gz,
        "budget": budget.max_bytes,
        "usedFraction": round(size / budget.max_bytes, 4),
    }


# --------------------------------------------------------------------------
# Validacion de esquema
# --------------------------------------------------------------------------


def _registry():
    """Construye el registro de esquemas para resolver los ``$ref`` locales."""
    from referencing import Registry, Resource

    registry = Registry()
    for path in CONTRACTS.glob("*.schema.json"):
        schema = json.loads(path.read_text(encoding="utf-8"))
        resource = Resource.from_contents(schema)
        registry = registry.with_resource(uri=path.name, resource=resource)
        if "$id" in schema:
            registry = registry.with_resource(uri=schema["$id"], resource=resource)
    return registry


_VALIDATORS: dict[str, Any] = {}


def validator_for(kind: str):
    """Devuelve, cacheado, el validador de un tipo de artefacto."""
    if kind not in _VALIDATORS:
        import jsonschema

        schema = json.loads(
            (CONTRACTS / f"{kind}.schema.json").read_text(encoding="utf-8")
        )
        cls = jsonschema.validators.validator_for(schema)
        _VALIDATORS[kind] = cls(schema, registry=_registry())
    return _VALIDATORS[kind]


class ContractViolation(Exception):
    """Un artefacto no cumple su esquema."""


def validate(kind: str, document: Any, label: str = "") -> None:
    """Valida un documento contra su esquema, con todos los errores a la vez.

    Args:
      kind: ``index``, ``locus``, ``card``, ``tracks`` o ``study``.
      document: El documento ya deserializado.
      label: Identificador para el mensaje de error.

    Raises:
      ContractViolation: Si hay uno o mas errores de esquema.
    """
    errors = sorted(validator_for(kind).iter_errors(document), key=lambda e: e.path)
    if not errors:
        return
    detail = "\n".join(
        f"  - {'/'.join(str(p) for p in e.path) or '<raiz>'}: {e.message}"
        for e in errors[:20]
    )
    more = "" if len(errors) <= 20 else f"\n  ... y {len(errors) - 20} mas"
    raise ContractViolation(
        f"{kind} {label or ''} incumple el contrato v{SCHEMA_VERSION}:\n{detail}{more}"
    )


# --------------------------------------------------------------------------
# Escritura
# --------------------------------------------------------------------------


def write_json(
    path: pathlib.Path, kind: str, document: Any, *, label: str = ""
) -> dict[str, Any]:
    """Valida, mide el presupuesto y solo entonces escribe.

    El orden importa: un artefacto que no cumple no debe llegar al disco, porque
    ``data/dist/`` es lo que se despliega y un archivo invalido ahi es un fallo
    en produccion, no en el build.
    """
    validate(kind, document, label)
    try:
        # allow_nan=False es la linea que importa. Por defecto Python emite
        # `NaN`, `Infinity` y `-Infinity` SIN COMILLAS, que no son JSON valido:
        # json.loads los acepta de vuelta, asi que el error es invisible desde
        # Python, pero JSON.parse del navegador los rechaza y la vista muere con
        # "no es JSON valido". Mejor fallar aqui, en el build.
        payload = json.dumps(
            document, ensure_ascii=False, separators=(",", ":"), allow_nan=False
        ).encode("utf-8")
    except ValueError as error:
        raise ContractViolation(
            f"{kind} {label or ''}: el documento contiene NaN o Infinity, que no "
            f"son JSON valido. Conviertelos a null antes de escribir "
            f"(un feature que no aplica es null, no NaN). Causa: {error}"
        ) from error
    measured = check_budget(kind, payload, label)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return measured


def write_blob(path: pathlib.Path, payload: bytes, *, label: str = "") -> dict[str, Any]:
    """Escribe un bloque de senal verificando su presupuesto."""
    measured = check_budget("signal", payload, label)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return measured


def iter_dist(dist: pathlib.Path | None = None) -> Iterator[tuple[str, pathlib.Path]]:
    """Recorre ``data/dist/`` clasificando cada archivo por tipo de artefacto.

    Es lo que usa el test de integridad para afirmar que TODO lo que se va a
    desplegar cumple esquema y presupuesto, no solo lo que el pipeline acaba de
    escribir en esta corrida.
    """
    dist = dist or DIST
    if not dist.exists():
        return
    for path in sorted(dist.rglob("*")):
        if not path.is_file():
            continue
        name = path.name
        if name == "index.json":
            yield "index", path
        elif name == "locus.json":
            yield "locus", path
        elif name == "card.json":
            yield "card", path
        elif name == "tracks.json":
            yield "tracks", path
        elif name == "manifest.json":
            yield "study", path
        elif name == "annotations.json":
            yield "annotations", path
        elif path.suffix == ".bin":
            yield "signal", path
