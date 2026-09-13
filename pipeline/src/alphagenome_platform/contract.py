"""Contrato de datos: validacion de esquema y presupuesto de bytes.

Tres invariantes, y las tres se prueban en ``tests/``:

1. **Todo artefacto valida contra su JSON Schema** de ``contracts/v1/``. Se usa
   un validador real (``jsonschema``), no confianza.
2. **Todo artefacto cabe en su presupuesto de bytes.** Un visor que tarda en
   cargar no es un visor, asi que el presupuesto es parte del contrato y su
   incumplimiento rompe el build.
3. **Todo artefacto de produccion viene de la API.** Ver
   ``assert_production_provenance``. Es la unica defensa mecanica contra un
   artefacto sintetico desplegado con el sello del Atlas encima, que no da ni un
   404 ni un error de consola y por eso no se detecta mirando.
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

# Los dos mundos no comparten directorio. `dist` es la SALIDA DEL PRODUCTO: lo
# que se despliega y lo que el clon trae ya congelado desde la API. `fixtures`
# es una herramienta de DESARROLLO sin cuota, y una herramienta de desarrollo
# que escribe en la salida del producto esta mal aunque se vigile. Separarlos
# quita el defecto en vez de ponerle un guardia.
FIXTURES = ROOT / "data" / "fixtures"


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
    "saturation": Budget(
        "saturation",
        96 * 1024,
        "512 posiciones x 3 alternativas de PHRED, mas la secuencia de referencia.",
    ),
    "annotations": Budget(
        "annotations",
        128 * 1024,
        "Genes y transcritos de 1 Mb, con exones en coordenadas GRCh38 absolutas.",
    ),
    "contacts": Budget(
        "contacts",
        96 * 1024,
        "Triangulo superior de 129x129 (8 385 celdas) x 2 matrices -referencia "
        "y delta- en enteros cuantizados. Medido en CELSR2/HepG2: 69 KB. La "
        "ventana la fija el TSS de SORT1, a 61 bins de la variante.",
    ),
    "splice": Budget(
        "splice",
        64 * 1024,
        "Medido en DNM1/glutamatergic neuron: 21 uniones sobre el piso de "
        "magnitud son unos 2 KB. La holgura cubre una ventana mas cargada de "
        "uniones reales sin acercarse al tope.",
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
        elif name == "saturation.json":
            yield "saturation", path
        elif name == "splice.json":
            yield "splice", path
        elif name == "contacts.json":
            yield "contacts", path
        elif path.suffix == ".bin":
            yield "signal", path


# --------------------------------------------------------------------------
# Puntero de portada: derivado, nunca escrito a mano
# --------------------------------------------------------------------------


FEATURED_MIN_PHRED = 10.0
"""Piso del heroe: percentil 90 en la escala del medidor (``PHRED_AXIS_MAX`` en
``variantCard.ts``, donde 10 = top 10 %). Por debajo de esto el medidor mismo
rotula la variante "por debajo de la mediana del genoma", y featurear algo que
la propia pantalla llama mediocre es peor que no featurear nada.
"""


def featured_pointer(dist: pathlib.Path | None = None) -> dict[str, Any] | None:
    """Elige la variante que la portada muestra ya cargada.

    Se DERIVA de los ``locus.json`` que el pipeline acaba de emitir, en vez de
    fijarse en un config. Es el mismo patron que la compuerta de proveniencia y
    que ``test_palette``: la comprobacion lee el valor que el codigo usa de
    verdad. Un puntero escrito a mano sobrevive al artefacto al que apunta y la
    portada se rompe en la cara del primer visitante; uno derivado no puede
    quedar desfasado porque se recalcula cada vez que los datos cambian.

    Compuertas (no seleccionan, solo excluyen):

    1. Que el locus venga de la API (``provenance.source`` en ``API_SOURCES``).
       Ningun locus sintetico entra al sorteo del heroe.
    2. Que tenga **card** y **mapa de saturacion**. La portada promete acceso
       directo al mapa, y una promesa que lleva a un 404 es peor que no
       hacerla.
    3. Que el ``aviPhred`` alcance ``FEATURED_MIN_PHRED``. Por debajo de eso el
       propio medidor dice "por debajo de la mediana": la regla vieja elegia
       "el mas alto disponible" y con un solo candidato eso podia ser 0,25.

    Entre las que pasan las tres, gana el **aviPhred mas alto**.

    El rsid NO es compuerta. dbSNP no tiene entrada para la enorme mayoria de
    los SNVs que el Atlas puede puntuar -es justo el punto del Atlas-, y exigir
    rsid descartaba sistematicamente a las variantes mas interesantes de
    ensenar: sin catalogar y con un efecto predicho alto es el mejor argumento
    del visor, no una razon para ocultarlas. El rsid sigue viajando en el
    artefacto para mostrarse cuando existe.

    Devuelve ``None`` si nada pasa las tres compuertas: el indice sale sin
    ``featured`` y la portada cae a su version sin heroe. Es preferible a
    featurear una variante que el propio medidor calificaria de mediocre.
    """
    dist = dist or DIST
    candidatos: list[tuple[float, str, str]] = []
    for tipo, path in iter_dist(dist):
        if tipo != "locus":
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        locus_id = doc.get("id")
        if not locus_id:
            continue
        if (doc.get("provenance") or {}).get("source") not in API_SOURCES:
            continue
        for entrada in doc.get("variants", []):
            artifacts = entrada.get("artifacts") or {}
            if not artifacts.get("saturation") or not artifacts.get("card"):
                continue
            variante = entrada.get("variant") or {}
            if not variante.get("id"):
                continue
            phred = entrada.get("aviPhred")
            if not isinstance(phred, (int, float)) or phred < FEATURED_MIN_PHRED:
                continue
            candidatos.append((float(phred), locus_id, str(variante["id"])))
    if not candidatos:
        return None
    # Orden total y estable: phred, y el par (locus, id) como desempate para
    # que dos corridas sobre los mismos datos den siempre el mismo puntero.
    _phred, locus_id, variant_id = max(candidatos, key=lambda c: (c[0], c[1], c[2]))
    return {"locus": locus_id, "variant": variant_id, "saturation": True}


# --------------------------------------------------------------------------
# Compuerta de proveniencia: ningun dato sintetico en produccion
# --------------------------------------------------------------------------

API_SOURCES = frozenset({"atlas-api", "model-api"})
"""Los unicos origenes que cuentan como "de la API".

Se escribe como CONJUNTO EXPLICITO y no como ``"api" in source``. La prueba por
subcadena diria que si a cualquier valor futuro que contenga esas tres letras
-- ``"fake-api"``, ``"api-mock"`` -- y una compuerta que se puede burlar
escribiendo un nombre nuevo no es una compuerta.
"""


class SyntheticInProduction(Exception):
    """Un artefacto de produccion no viene de la API. Rompe el build a proposito.

    Existe por el peor fallo de la sesion 2: el navegador de tracks dibujaba
    bloques SINTETICOS de una corrida anterior con el sello del Atlas encima, sin
    un 404 ni un error de consola. Un artefacto viejo en el sitio equivocado se
    ve exactamente igual que uno correcto, asi que la unica defensa que sirve es
    mecanica y en el build.
    """


def _non_api_exemption(kind: str, document: Any) -> str | None:
    """Dice si un artefacto SIN origen de API es legitimo, y por que.

    La regla es de PROPIEDAD, no una lista de rutas: el artefacto se describe a
    si mismo y no hay un segundo archivo que mantener sincronizado. Un unico caso
    es legitimo hoy: la ficha de un estudio **planificado que no trae ningun
    numero**. Publicar el plan de un estudio antes de correrlo es precisamente lo
    que este proyecto dice querer hacer; lo que no es legitimo es que ese
    documento lleve cifras inventadas.

    Args:
      kind: Tipo de artefacto segun ``iter_dist``.
      document: El documento ya deserializado.

    Returns:
      El motivo de la excepcion si aplica, o ``None`` si no hay excepcion y el
      artefacto tiene que venir de la API.
    """
    if kind != "study":
        return None
    if document.get("status") != "planned":
        return None
    panels = document.get("panels") or []
    if any(panel.get("type") != "note" for panel in panels):
        return None
    return (
        f"estudio 'planned' con {len(panels)} panel(es) de tipo 'note' y ningun "
        f"numero: es un plan publicado, no un resultado disfrazado"
    )


def assert_production_provenance(dist: pathlib.Path | None = None) -> list[str]:
    """Exige que todo artefacto de produccion venga de la API.

    Se aplica sobre ``data/dist/`` entero, que es lo que se despliega, y no sobre
    lo que el generador acaba de escribir: da igual quien dejo ahi el archivo.

    Args:
      dist: Directorio a revisar. Por defecto ``data/dist``.

    Returns:
      Las excepciones concedidas, una linea por artefacto, para que queden a la
      vista en la salida del build en vez de pasar en silencio.

    Raises:
      SyntheticInProduction: Si algun artefacto declara un origen que no esta en
        ``API_SOURCES`` sin cumplir la excepcion, o si un artefacto que deberia
        llevar sello no lo lleva.
    """
    dist = dist or DIST
    problems: list[str] = []
    exemptions: list[str] = []
    seen = 0

    for kind, path in iter_dist(dist):
        if path.suffix != ".json":
            continue
        label = str(path.relative_to(dist)).replace("\\", "/")
        document = json.loads(path.read_text(encoding="utf-8"))
        provenance = document.get("provenance")
        if provenance is None:
            # index y study lo tienen como opcional en el esquema; el resto no.
            # Aqui se exige de todas formas: sin sello no hay forma de saber de
            # donde salieron los numeros, y eso es el fallo que se quiere evitar.
            problems.append(f"{label}: sin sello de proveniencia")
            continue
        seen += 1
        source = provenance.get("source")
        if source in API_SOURCES:
            continue
        reason = _non_api_exemption(kind, document)
        if reason:
            exemptions.append(f"{label}: origen '{source}', permitido porque es {reason}")
            continue
        problems.append(
            f"{label}: declara origen '{source}', que no es de la API "
            f"({', '.join(sorted(API_SOURCES))})"
        )

    if not seen and not problems:
        problems.append(
            f"{dist} no tiene ningun artefacto con sello: no hay nada que verificar"
        )

    if problems:
        raise SyntheticInProduction(
            "Artefactos de produccion que no vienen de la API de AlphaGenome:\n"
            + "\n".join(f"  - {p}" for p in problems)
            + "\n\nUn artefacto sintetico desplegado se ve igual que uno real. "
            "Regenera con `cli build-locus` (necesita la llave) o borra el "
            "artefacto de data/dist/. La unica excepcion permitida es la ficha "
            "de un estudio 'planned' sin ningun numero."
        )
    return exemptions
