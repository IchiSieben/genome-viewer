"""Congela un locus real en artefactos del contrato v1.

Coste por locus, medido en H0 y no estimado:

  * 1 llamada a ``query_interval`` de 1 pb por posicion, para resolver que
    variantes existen de verdad sin inventar la base de referencia.
  * 1 llamada a ``query_variants`` para todas las variantes del locus a la vez,
    con todos los scorers pedidos. Da V1 y V2.
  * 1 llamada a ``predict_variant`` POR VARIANTE. Da V3, V4 y V5 de una vez.
  * 1 peticion a Ensembl por locus, para el carril de genes.

`predict_variant` construye una sola peticion, verificado en el codigo fuente:
no hay troceo. El troceo de 32 pb es exclusivo de ``atlas.query_interval``.
"""

from __future__ import annotations

import logging
import pathlib
import time
from typing import Any, Sequence

import numpy as np

from alphagenome_platform import SCHEMA_VERSION, avi, contract, provenance, quantize
from alphagenome_platform.acquire import atlas_source, ensembl
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
                "path": f"signals/{level}/{modality}.bin",
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
