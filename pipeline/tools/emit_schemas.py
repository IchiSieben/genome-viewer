"""Emite los archivos JSON Schema del contrato de datos v1.

Los esquemas son la frontera entre el pipeline y la web. Se generan desde aqui
en vez de escribirse a mano para que las piezas repetidas (proveniencia,
variante, presupuesto) no se desincronicen entre archivos.

Uso::

    python pipeline/tools/emit_schemas.py
"""

from __future__ import annotations

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "contracts" / "v1"
BASE = "https://ic7.dev/alphagenome/contracts/v1/"

SCHEMA_VERSION_PATTERN = r"^1\.\d+\.\d+$"

# --------------------------------------------------------------------------
# Piezas comunes
# --------------------------------------------------------------------------

COMMON = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": BASE + "common.schema.json",
    "title": "Piezas comunes del contrato v1",
    "$defs": {
        "schemaVersion": {
            "type": "string",
            "pattern": SCHEMA_VERSION_PATTERN,
            "description": (
                "Version del contrato. La web rechaza un major que no conoce."
            ),
        },
        "provenance": {
            "type": "object",
            "description": (
                "Sello de proveniencia. Obligatorio en TODO artefacto. Los "
                "cuantiles del AVI se recalibraron el 2026-06-18 y la "
                "inferencia de indels se corrigio el 2026-07-14: comparar "
                "artefactos de cosechas distintas es invalido, y este sello es "
                "lo unico que lo hace detectable."
            ),
            "required": [
                "source",
                "clientVersion",
                "queriedAt",
                "configHash",
                "calibrationEpoch",
            ],
            "additionalProperties": True,
            "properties": {
                "source": {
                    "enum": ["atlas-api", "model-api", "synthetic"],
                    "description": (
                        "'synthetic' marca fixtures. Nunca debe aparecer en un "
                        "artefacto publicado como dato real."
                    ),
                },
                "clientVersion": {
                    "type": "string",
                    "description": "Version del paquete alphagenome usado.",
                },
                "pipelineVersion": {"type": "string"},
                "queriedAt": {
                    "type": "string",
                    "format": "date-time",
                    "description": "UTC ISO-8601 del momento de la consulta.",
                },
                "configHash": {
                    "type": "string",
                    "pattern": "^[0-9a-f]{16,64}$",
                    "description": "sha256 truncado de la configuracion normalizada.",
                },
                "calibrationEpoch": {
                    "type": "string",
                    "description": (
                        "Epoca de calibracion declarada, p.ej. "
                        "'quantiles>=2026-06-18,indels>=2026-07-14'."
                    ),
                },
                "scorers": {"type": "array", "items": {"type": "string"}},
                "hasQuantiles": {
                    "type": "boolean",
                    "description": (
                        "Si el servidor devolvio layers['quantiles']. El cliente "
                        "0.9.0 solo lo crea cuando calibrated_scores no viene "
                        "vacio, asi que es condicional y hay que declararlo."
                    ),
                },
                "notes": {"type": "string"},
            },
        },
        "variant": {
            "type": "object",
            "required": ["id", "chromosome", "position", "ref", "alt"],
            "additionalProperties": False,
            "properties": {
                "id": {
                    "type": "string",
                    "pattern": "^chr[0-9XYM]+-[0-9]+-[ACGT]+-[ACGT]+$",
                    "description": (
                        "Identificador seguro para rutas. El Atlas usa "
                        "'chr:pos:ref>alt' con '>', que no vale en un nombre de "
                        "archivo; aqui se normaliza a guiones."
                    ),
                },
                "chromosome": {"type": "string", "pattern": "^chr[0-9XYM]+$"},
                "position": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "1-based, como genome.Variant.",
                },
                "ref": {"type": "string", "pattern": "^[ACGT]+$"},
                "alt": {"type": "string", "pattern": "^[ACGT]+$"},
                "rsid": {"type": ["string", "null"]},
                "gene": {"type": ["string", "null"]},
            },
        },
        "interval": {
            "type": "object",
            "required": ["chromosome", "start", "end"],
            "additionalProperties": False,
            "properties": {
                "chromosome": {"type": "string", "pattern": "^chr[0-9XYM]+$"},
                "start": {
                    "type": "integer",
                    "minimum": 0,
                    "description": "0-based inclusivo, como genome.Interval.",
                },
                "end": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "0-based exclusivo.",
                },
            },
        },
        "signalRef": {
            "type": "object",
            "required": ["path", "bytes", "tracks"],
            "additionalProperties": False,
            "properties": {
                "path": {"type": "string"},
                "bytes": {"type": "integer", "minimum": 0},
                "tracks": {"type": "integer", "minimum": 1},
                "sha256": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
            },
        },
    },
}

# --------------------------------------------------------------------------
# index.json
# --------------------------------------------------------------------------

INDEX = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": BASE + "index.schema.json",
    "title": "Indice de la plataforma",
    "description": (
        "Catalogo ligero. Es lo unico que la web descarga al arrancar, asi que "
        "no lleva datos de variante: solo punteros. Presupuesto: 32 KB."
    ),
    "type": "object",
    "required": ["schemaVersion", "generated", "loci", "studies"],
    "additionalProperties": False,
    "properties": {
        "schemaVersion": {"$ref": "common.schema.json#/$defs/schemaVersion"},
        "generated": {"type": "string", "format": "date-time"},
        "provenance": {"$ref": "common.schema.json#/$defs/provenance"},
        "loci": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "label", "chromosome", "start", "end", "path"],
                "additionalProperties": False,
                "properties": {
                    "id": {"type": "string", "pattern": "^[a-z0-9-]+$"},
                    "label": {"type": "string"},
                    "chromosome": {"type": "string", "pattern": "^chr[0-9XYM]+$"},
                    "start": {"type": "integer", "minimum": 0},
                    "end": {"type": "integer", "minimum": 1},
                    "genes": {"type": "array", "items": {"type": "string"}},
                    "variantCount": {"type": "integer", "minimum": 0},
                    "path": {"type": "string"},
                    "bytes": {"type": "integer", "minimum": 0},
                },
            },
        },
        "studies": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "label", "status", "path"],
                "additionalProperties": False,
                "properties": {
                    "id": {"type": "string", "pattern": "^[a-z0-9-]+$"},
                    "label": {"type": "string"},
                    "status": {
                        "enum": [
                            "planned",
                            "running",
                            "positive",
                            "null",
                            "inconclusive",
                            "underpowered",
                        ],
                        "description": (
                            "Un resultado nulo o sin poder se declara aqui y se "
                            "muestra con la misma prominencia que uno positivo."
                        ),
                    },
                    "path": {"type": "string"},
                },
            },
        },
    },
}

# --------------------------------------------------------------------------
# locus.json
# --------------------------------------------------------------------------

LOCUS = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": BASE + "locus.schema.json",
    "title": "Locus",
    "description": (
        "Un locus, sus variantes y el mapa de sus bloques de senal. Se descarga "
        "al entrar al locus, nunca antes. Presupuesto: 64 KB."
    ),
    "type": "object",
    "required": [
        "schemaVersion",
        "id",
        "label",
        "interval",
        "provenance",
        "variants",
    ],
    "additionalProperties": False,
    "properties": {
        "schemaVersion": {"$ref": "common.schema.json#/$defs/schemaVersion"},
        "id": {"type": "string", "pattern": "^[a-z0-9-]+$"},
        "label": {"type": "string"},
        "interval": {"$ref": "common.schema.json#/$defs/interval"},
        "provenance": {"$ref": "common.schema.json#/$defs/provenance"},
        "genes": {"type": "array", "items": {"type": "string"}},
        "annotations": {"type": ["string", "null"]},
        "variants": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["variant", "artifacts"],
                "additionalProperties": False,
                "properties": {
                    "variant": {"$ref": "common.schema.json#/$defs/variant"},
                    "aviPhred": {"type": ["number", "null"], "minimum": 0},
                    "note": {"type": ["string", "null"]},
                    "signals": {
                        "type": "object",
                        "description": (
                            "Bloques de senal de ESTA variante. El delta REF/ALT "
                            "pertenece a la variante, no al locus, asi que cada "
                            "una tiene los suyos. Si falta, el visor cae a los "
                            "del locus."
                        ),
                        "additionalProperties": False,
                        "properties": {
                            "overview": {"$ref": "locus.schema.json#/$defs/signalLevel"},
                            "detail": {"$ref": "locus.schema.json#/$defs/signalLevel"},
                        },
                    },
                    "artifacts": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "card": {"type": ["string", "null"]},
                            "tracks": {"type": ["string", "null"]},
                            "splice": {"type": ["string", "null"]},
                            "contact": {"type": ["string", "null"]},
                            "saturation": {"type": ["string", "null"]},
                        },
                    },
                },
            },
        },
        "signals": {
            "type": "object",
            "description": (
                "Bloques de senal por resolucion. La web carga un bloque por "
                "modalidad y solo cuando esa modalidad se muestra."
            ),
            "additionalProperties": False,
            "properties": {
                "overview": {"$ref": "#/$defs/signalLevel"},
                "detail": {"$ref": "#/$defs/signalLevel"},
            },
        },
    },
    "$defs": {
        "signalLevel": {
            "type": "object",
            "required": ["binSize", "length", "interval", "modalities"],
            "additionalProperties": False,
            "properties": {
                "binSize": {"type": "integer", "minimum": 1},
                "length": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "Valores por track y arreglo.",
                },
                "interval": {"$ref": "common.schema.json#/$defs/interval"},
                "modalities": {
                    "type": "object",
                    "additionalProperties": {
                        "$ref": "common.schema.json#/$defs/signalRef"
                    },
                },
            },
        }
    },
}

# --------------------------------------------------------------------------
# card.json  (V1)
# --------------------------------------------------------------------------

CARD = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": BASE + "card.schema.json",
    "title": "Ficha de variante (V1)",
    "description": (
        "AVI sobre su escala PHRED, cascada de contribuciones SHAP y tracks mas "
        "afectados. Presupuesto: 50 KB.\n\n"
        "Los 18 features del AVI se modelan como una LISTA ORDENADA de objetos, "
        "no como 18 campos con nombre fijo. Los nombres exactos son server-side "
        "y no estan en el cliente 0.9.0 (verificado con grep). Si el servidor "
        "devuelve nombres distintos a los supuestos, cambia la fixture, no el "
        "codigo del visor."
    ),
    "type": "object",
    "required": ["schemaVersion", "variant", "provenance", "avi", "features"],
    "additionalProperties": False,
    "properties": {
        "schemaVersion": {"$ref": "common.schema.json#/$defs/schemaVersion"},
        "variant": {"$ref": "common.schema.json#/$defs/variant"},
        "provenance": {"$ref": "common.schema.json#/$defs/provenance"},
        "avi": {
            "type": "object",
            "required": ["phred"],
            "additionalProperties": False,
            "properties": {
                "phred": {
                    "type": "number",
                    "minimum": 0,
                    "description": (
                        "PHRED = -10*log10(1-cuantil). 10 = top 10%, 20 = top "
                        "1%, 30 = top 0,1%."
                    ),
                },
                "quantile": {"type": ["number", "null"], "minimum": 0, "maximum": 1},
                "baseValue": {
                    "type": ["number", "null"],
                    "description": (
                        "Valor base de la explicacion SHAP. La cascada parte de "
                        "aqui y las contribuciones deben sumar hasta el score. "
                        "Medido en H0: -0,049016, constante entre variantes."
                    ),
                },
                "rawScore": {
                    "type": ["number", "null"],
                    "description": (
                        "Score AVI crudo y CON SIGNO, tal cual lo devuelve el "
                        "scorer AVI_SCORE. El PHRED se deriva del cuantil, que "
                        "es otra cosa: el crudo puede ser negativo."
                    ),
                },
            },
        },
        "featureFamilies": {
            "type": "array",
            "description": (
                "Las cuatro familias del AVI: 10 regulatorios, 4 de proteina, "
                "2 de conservacion, 2 de indel."
            ),
            "items": {
                "type": "object",
                "required": ["id", "label"],
                "additionalProperties": False,
                "properties": {
                    "id": {
                        "enum": ["regulatory", "protein", "conservation", "indel"]
                    },
                    "label": {"type": "string"},
                    "expectedCount": {"type": "integer", "minimum": 0},
                },
            },
        },
        "features": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["id", "label", "family", "contribution"],
                "additionalProperties": False,
                "properties": {
                    "id": {"type": "string"},
                    "label": {"type": "string"},
                    "family": {
                        "enum": ["regulatory", "protein", "conservation", "indel"]
                    },
                    "contribution": {
                        "type": "number",
                        "description": "Contribucion SHAP con signo.",
                    },
                    "value": {
                        "type": ["number", "null"],
                        "description": "Valor del feature, si el servidor lo da.",
                    },
                },
            },
        },
        "topTracks": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "modality", "score"],
                "additionalProperties": False,
                "properties": {
                    "name": {"type": "string"},
                    "modality": {"type": "string"},
                    "biosample": {"type": ["string", "null"]},
                    "ontologyCurie": {"type": ["string", "null"]},
                    "strand": {"enum": ["+", "-", ".", None]},
                    "score": {"type": "number"},
                    "quantile": {"type": ["number", "null"]},
                },
            },
        },
    },
}

# --------------------------------------------------------------------------
# tracks.json  (V2)
# --------------------------------------------------------------------------

TRACKS = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": BASE + "tracks.schema.json",
    "title": "Mapa de calor biosample x modalidad (V2)",
    "description": (
        "Efecto escalar de una variante a lo largo de cientos de biosamples. "
        "Las celdas van en formato disperso con indices enteros: una matriz "
        "densa de 300x11 en JSON con nombres repetidos costaria varias veces "
        "mas. Presupuesto: 120 KB."
    ),
    "type": "object",
    "required": [
        "schemaVersion",
        "variant",
        "provenance",
        "modalities",
        "biosamples",
        "cells",
    ],
    "additionalProperties": False,
    "properties": {
        "schemaVersion": {"$ref": "common.schema.json#/$defs/schemaVersion"},
        "variant": {"$ref": "common.schema.json#/$defs/variant"},
        "provenance": {"$ref": "common.schema.json#/$defs/provenance"},
        "modalities": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "label"],
                "additionalProperties": False,
                "properties": {
                    "id": {"type": "string"},
                    "label": {"type": "string"},
                    "signed": {
                        "type": "boolean",
                        "description": (
                            "Si el scorer produce valores con signo. Decide si "
                            "la paleta es divergente o secuencial."
                        ),
                    },
                    "unit": {"type": ["string", "null"]},
                },
            },
        },
        "organSystems": {
            "type": "array",
            "description": (
                "Agrupacion por ontologia, NO alfabetica. Es lo que permite ver "
                "de un vistazo si un efecto es ubicuo o especifico de tejido."
            ),
            "items": {
                "type": "object",
                "required": ["id", "label"],
                "additionalProperties": False,
                "properties": {
                    "id": {"type": "string"},
                    "label": {"type": "string"},
                },
            },
        },
        "biosamples": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "label"],
                "additionalProperties": False,
                "properties": {
                    "id": {"type": "string"},
                    "label": {"type": "string"},
                    "ontologyCurie": {"type": ["string", "null"]},
                    "biosampleType": {"type": ["string", "null"]},
                    "organSystem": {"type": ["string", "null"]},
                },
            },
        },
        "biosampleTotal": {
            "type": "integer",
            "minimum": 0,
            "description": (
                "Cuantos biosamples habia ANTES de recortar al tope de filas. "
                "Si es mayor que la longitud de 'biosamples', la vista debe "
                "decir que muestra un subconjunto."
            ),
        },
        "cells": {
            "type": "array",
            "description": "Disperso: [indice biosample, indice modalidad, valor, cuantil].",
            "items": {
                "type": "array",
                "minItems": 3,
                "maxItems": 4,
                "prefixItems": [
                    {"type": "integer", "minimum": 0},
                    {"type": "integer", "minimum": 0},
                    {"type": "number"},
                    {"type": ["number", "null"]},
                ],
            },
        },
    },
}

# --------------------------------------------------------------------------
# study manifest
# --------------------------------------------------------------------------

STUDY = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": BASE + "study.schema.json",
    "title": "Manifiesto de estudio",
    "description": (
        "Un estudio declara que vistas quiere y con que datos. El visor "
        "renderiza tipos de vista; agregar un estudio NO debe requerir tocar el "
        "codigo del visor. Si hay que tocarlo, la abstraccion esta mal."
    ),
    "type": "object",
    "required": [
        "schemaVersion",
        "id",
        "label",
        "status",
        "honesty",
        "panels",
    ],
    "additionalProperties": False,
    "properties": {
        "schemaVersion": {"$ref": "common.schema.json#/$defs/schemaVersion"},
        "id": {"type": "string", "pattern": "^[a-z0-9-]+$"},
        "label": {"type": "string"},
        "summary": {"type": "string"},
        "status": {
            "enum": [
                "planned",
                "running",
                "positive",
                "null",
                "inconclusive",
                "underpowered",
            ]
        },
        "provenance": {"$ref": "common.schema.json#/$defs/provenance"},
        "honesty": {
            "type": "object",
            "description": (
                "Requisito no negociable: tamano de muestra, poder, limitaciones "
                "y signo del resultado, visibles en pantalla."
            ),
            "required": ["sampleSize", "limitations"],
            "additionalProperties": False,
            "properties": {
                "sampleSize": {
                    "type": "object",
                    "additionalProperties": {"type": ["integer", "string"]},
                },
                "power": {
                    "type": ["object", "null"],
                    "additionalProperties": True,
                    "properties": {
                        "achieved": {"type": ["number", "null"]},
                        "target": {"type": ["number", "null"]},
                        "effectiveUnits": {
                            "type": ["integer", "null"],
                            "description": (
                                "Numero efectivo de haplotipos independientes, "
                                "NO el conteo de variantes. En una poblacion con "
                                "cuello de botella las variantes viajan juntas y "
                                "tratarlas como independientes es anticonservador."
                            ),
                        },
                        "note": {"type": ["string", "null"]},
                    },
                },
                "limitations": {
                    "type": "array",
                    "minItems": 1,
                    "items": {"type": "string"},
                },
                "preregistered": {"type": ["boolean", "null"]},
                "ethics": {"type": ["string", "null"]},
            },
        },
        "panels": {
            "type": "array",
            "description": (
                "Cada panel nombra un TIPO de vista que el visor ya sabe "
                "renderizar y le pasa datos. Nada de codigo por estudio."
            ),
            "items": {
                "type": "object",
                "required": ["id", "type", "title", "data"],
                "additionalProperties": False,
                "properties": {
                    "id": {"type": "string"},
                    "type": {
                        "enum": [
                            "distribution",
                            "calibration",
                            "dosage",
                            "forest",
                            "scatter",
                            "table",
                            "note",
                        ]
                    },
                    "title": {"type": "string"},
                    "caption": {"type": ["string", "null"]},
                    "data": {"type": ["string", "object"]},
                    "options": {"type": "object", "additionalProperties": True},
                },
            },
        },
    },
}

ANNOTATIONS = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": BASE + "annotations.schema.json",
    "title": "Anotacion de genes y transcritos",
    "description": (
        "Carril de anotacion del navegador de tracks (V3). Coordenadas GRCh38 "
        "absolutas, 0-based. Presupuesto: 128 KB."
    ),
    "type": "object",
    "required": ["schemaVersion", "locus", "interval", "provenance", "genes"],
    "additionalProperties": False,
    "properties": {
        "schemaVersion": {"$ref": "common.schema.json#/$defs/schemaVersion"},
        "locus": {"type": "string"},
        "interval": {"$ref": "common.schema.json#/$defs/interval"},
        "provenance": {"$ref": "common.schema.json#/$defs/provenance"},
        "genes": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "strand", "start", "end"],
                "additionalProperties": False,
                "properties": {
                    "name": {"type": "string"},
                    "strand": {"enum": ["+", "-", "."]},
                    "start": {"type": "integer", "minimum": 0},
                    "end": {"type": "integer", "minimum": 1},
                    "transcripts": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["id", "exons"],
                            "additionalProperties": False,
                            "properties": {
                                "id": {"type": "string"},
                                "exons": {
                                    "type": "array",
                                    "description": "Pares [inicio, fin] 0-based.",
                                    "items": {
                                        "type": "array",
                                        "minItems": 2,
                                        "maxItems": 2,
                                        "items": {"type": "integer", "minimum": 0},
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
}

SATURATION = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": BASE + "saturation.schema.json",
    "title": "Mapa de saturacion (N1)",
    "description": (
        "Para cada posicion de una ventana, el AVI de las TRES bases "
        "alternativas posibles. Es el grafico insignia de la genomica con "
        "aprendizaje profundo: deja ver de un vistazo donde el modelo cree que "
        "la secuencia importa, porque los motivos aparecen solos como columnas "
        "contiguas de color fuerte. "
        "Los datos salen de atlas.query_interval, el UNICO metodo que trocea a "
        "32 pb. Una ventana de 512 pb son 16 sub-peticiones y ~1.536 variantes. "
        "Presupuesto: 96 KB."
    ),
    "type": "object",
    "required": [
        "schemaVersion",
        "locus",
        "interval",
        "provenance",
        "reference",
        "alts",
        "phred",
    ],
    "additionalProperties": False,
    "properties": {
        "schemaVersion": {"$ref": "common.schema.json#/$defs/schemaVersion"},
        "locus": {"type": "string"},
        "interval": {"$ref": "common.schema.json#/$defs/interval"},
        "provenance": {"$ref": "common.schema.json#/$defs/provenance"},
        "focus": {
            "type": ["integer", "null"],
            "description": "Posicion 1-based de la variante destacada, si hay.",
        },
        "reference": {
            "type": "string",
            "pattern": "^[ACGTN]*$",
            "description": (
                "Secuencia de referencia de la ventana, una base por posicion. "
                "Se deriva del propio Atlas: cada variante viene como "
                "chr:pos:REF>ALT, asi que la referencia no hay que pedirla "
                "aparte."
            ),
        },
        "alts": {
            "type": "array",
            "items": {"type": "string", "pattern": "^[ACGT]$"},
            "description": "Filas del mapa, en orden fijo.",
        },
        "phred": {
            "type": "array",
            "description": (
                "Una fila por base alternativa, una columna por posicion. "
                "null donde el alelo coincide con la referencia, que no es una "
                "variante, o donde el Atlas no la conoce."
            ),
            "items": {
                "type": "array",
                "items": {"type": ["number", "null"]},
            },
        },
        "raw": {
            "type": "array",
            "description": (
                "El mismo mapa con el score CRUDO y con signo. El PHRED es una "
                "magnitud calibrada y va con escala secuencial; el crudo "
                "conserva el signo por si una vista quiere divergente."
            ),
            "items": {
                "type": "array",
                "items": {"type": ["number", "null"]},
            },
        },
        "maxPhred": {"type": ["number", "null"]},
        "coverage": {
            "type": ["number", "null"],
            "description": "Fraccion de celdas posibles con dato.",
        },
    },
}

SCHEMAS = {
    "common.schema.json": COMMON,
    "index.schema.json": INDEX,
    "locus.schema.json": LOCUS,
    "card.schema.json": CARD,
    "tracks.schema.json": TRACKS,
    "study.schema.json": STUDY,
    "annotations.schema.json": ANNOTATIONS,
    "saturation.schema.json": SATURATION,
}


def main() -> None:
    """Escribe los esquemas en contracts/v1/."""
    OUT.mkdir(parents=True, exist_ok=True)
    for name, schema in SCHEMAS.items():
        path = OUT / name
        path.write_text(
            json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"{path.relative_to(ROOT)}  {path.stat().st_size:>6d} B")


if __name__ == "__main__":
    main()
