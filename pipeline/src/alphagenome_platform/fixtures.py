"""Generador de fixtures sinteticas que cumplen el contrato v1.

Para que existe
---------------
El trabajo de interfaz no puede quedar bloqueado por la cuota de la API ni por
la red, y en este momento tampoco hay llave. El frontend se desarrolla entero
contra estas fixtures; cuando llegue la llave, el pipeline real escribe en el
mismo esquema y la web no se entera del cambio.

Honestidad
----------
Todo lo que sale de aqui lleva ``source: "synthetic"`` en su proveniencia. La
web lo muestra en pantalla. Ninguna figura hecha con estos datos puede
presentarse como una prediccion de AlphaGenome, porque no lo es.

Los 18 features del AVI llevan nombres PROVISIONALES: los reales son
server-side y no estan en el cliente 0.9.0 (verificado con grep, ver
docs/00-h0-access-verification.md). El contrato los trata como lista ordenada
justamente para que sustituirlos no toque el codigo del visor.
"""

from __future__ import annotations

import dataclasses
import hashlib
import pathlib
from typing import Any

import numpy as np

from alphagenome_platform import SCHEMA_VERSION, contract, provenance, quantize

# --------------------------------------------------------------------------
# Catalogos
# --------------------------------------------------------------------------

MODALITIES: tuple[tuple[str, str, bool], ...] = (
    ("RNA_SEQ", "RNA-seq", True),
    ("ATAC", "ATAC", True),
    ("DNASE", "DNase", True),
    ("CAGE", "CAGE", True),
    ("PROCAP", "PRO-cap", True),
    ("CHIP_TF", "ChIP TF", True),
    ("CHIP_HISTONE", "ChIP histonas", True),
    ("SPLICE_SITES", "Sitios de splicing", True),
    ("SPLICE_SITE_USAGE", "Uso de sitio de splicing", True),
    ("POLYADENYLATION", "Poliadenilacion", True),
    ("CONTACT_MAPS", "Mapas de contacto", True),
)
"""Las 11 modalidades reales de ``dna_output.OutputType``, verificadas en H0."""

ORGAN_SYSTEMS: tuple[tuple[str, str], ...] = (
    ("blood", "Sangre e inmune"),
    ("nervous", "Sistema nervioso"),
    ("digestive", "Digestivo"),
    ("cardiovascular", "Cardiovascular"),
    ("respiratory", "Respiratorio"),
    ("endocrine", "Endocrino"),
    ("musculoskeletal", "Musculoesqueletico"),
    ("reproductive", "Reproductor"),
    ("integumentary", "Piel y anexos"),
    ("renal", "Renal y urinario"),
)

_BIOSAMPLES: tuple[tuple[str, str, str, str], ...] = (
    ("K562", "UBERON:0000178", "cell_line", "blood"),
    ("GM12878", "UBERON:0000178", "cell_line", "blood"),
    ("CD4+ T", "CL:0000624", "primary_cell", "blood"),
    ("CD8+ T", "CL:0000625", "primary_cell", "blood"),
    ("Monocito", "CL:0000576", "primary_cell", "blood"),
    ("Celula NK", "CL:0000623", "primary_cell", "blood"),
    ("Sangre completa", "UBERON:0000178", "tissue", "blood"),
    ("Bazo", "UBERON:0002106", "tissue", "blood"),
    ("Corteza frontal", "UBERON:0001870", "tissue", "nervous"),
    ("Hipocampo", "UBERON:0002421", "tissue", "nervous"),
    ("Cerebelo", "UBERON:0002037", "tissue", "nervous"),
    ("Sustancia negra", "UBERON:0002038", "tissue", "nervous"),
    ("Nervio tibial", "UBERON:0001323", "tissue", "nervous"),
    ("Higado", "UBERON:0002107", "tissue", "digestive"),
    ("HepG2", "UBERON:0002107", "cell_line", "digestive"),
    ("Colon transverso", "UBERON:0001157", "tissue", "digestive"),
    ("Estomago", "UBERON:0000945", "tissue", "digestive"),
    ("Pancreas", "UBERON:0001264", "tissue", "digestive"),
    ("Esofago mucosa", "UBERON:0002469", "tissue", "digestive"),
    ("Ventriculo izquierdo", "UBERON:0006566", "tissue", "cardiovascular"),
    ("Auricula derecha", "UBERON:0002078", "tissue", "cardiovascular"),
    ("Aorta", "UBERON:0000947", "tissue", "cardiovascular"),
    ("Arteria coronaria", "UBERON:0001621", "tissue", "cardiovascular"),
    ("HUVEC", "CL:0002618", "primary_cell", "cardiovascular"),
    ("Pulmon", "UBERON:0002048", "tissue", "respiratory"),
    ("A549", "UBERON:0002048", "cell_line", "respiratory"),
    ("Tiroides", "UBERON:0002046", "tissue", "endocrine"),
    ("Suprarrenal", "UBERON:0002369", "tissue", "endocrine"),
    ("Hipofisis", "UBERON:0000007", "tissue", "endocrine"),
    ("Musculo esqueletico", "UBERON:0001134", "tissue", "musculoskeletal"),
    ("Fibroblasto dermico", "CL:0002620", "primary_cell", "integumentary"),
    ("Piel expuesta", "UBERON:0004264", "tissue", "integumentary"),
    ("Rinon cortex", "UBERON:0001225", "tissue", "renal"),
    ("Vejiga", "UBERON:0001255", "tissue", "renal"),
    ("Testiculo", "UBERON:0000473", "tissue", "reproductive"),
    ("Ovario", "UBERON:0000992", "tissue", "reproductive"),
    ("Utero", "UBERON:0000995", "tissue", "reproductive"),
    ("Placenta", "UBERON:0001987", "tissue", "reproductive"),
)

AVI_FEATURES: tuple[tuple[str, str, str], ...] = (
    ("splicing_fused", "Splicing (fusionado)", "regulatory"),
    ("atac", "ATAC", "regulatory"),
    ("dnase", "DNase", "regulatory"),
    ("chip_tf", "ChIP-TF", "regulatory"),
    ("chip_histone", "ChIP-histonas", "regulatory"),
    ("cage", "CAGE", "regulatory"),
    ("procap", "PRO-cap", "regulatory"),
    ("rna_seq", "RNA-seq", "regulatory"),
    ("polyadenylation", "Poliadenilacion", "regulatory"),
    ("contact_maps", "Mapas de contacto", "regulatory"),
    ("alphamissense", "AlphaMissense", "protein"),
    ("stop_gained", "Stop ganado (VEP)", "protein"),
    ("stop_lost", "Stop perdido (VEP)", "protein"),
    ("start_lost", "Inicio perdido (VEP)", "protein"),
    ("phylop", "phyloP Cactus 241-way", "conservation"),
    ("phastcons", "PhastCons 470-way", "conservation"),
    ("is_insertion", "Es insercion", "indel"),
    ("is_deletion", "Es delecion", "indel"),
)
"""Los 18 features del AVI segun el documento 01. Nombres PROVISIONALES."""

FEATURE_FAMILIES: tuple[dict[str, Any], ...] = (
    {"id": "regulatory", "label": "Regulatorio (AlphaGenome)", "expectedCount": 10},
    {"id": "protein", "label": "Proteina", "expectedCount": 4},
    {"id": "conservation", "label": "Conservacion", "expectedCount": 2},
    {"id": "indel", "label": "Indel", "expectedCount": 2},
)

# --------------------------------------------------------------------------
# Loci
# --------------------------------------------------------------------------


@dataclasses.dataclass(frozen=True)
class LocusSpec:
    """Un locus a generar.

    Las coordenadas son las del documento 02, verificadas contra Ensembl
    (GRCh38). El intervalo emitido es de 2^20 pb centrado en el gen, que es la
    longitud recomendada y la unica que divide exacto en bins de 128.
    """

    id: str
    label: str
    chromosome: str
    center: int
    genes: tuple[str, ...]
    variants: tuple[tuple[int, str, str, str | None], ...]


WINDOW = 1 << 20
OVERVIEW_BIN = 128
DETAIL_HALF_WIDTH = 4096

LOCI: tuple[LocusSpec, ...] = (
    LocusSpec(
        id="ppp1r1a-pde1b",
        label="PPP1R1A / PDE1B",
        chromosome="chr12",
        center=54582115,
        genes=("PPP1R1A", "PDE1B"),
        variants=(
            (54578515, "T", "C", "rs884510"),
            (54580210, "G", "A", "rs10876566"),
            (54584902, "C", "T", "rs7954532"),
        ),
    ),
    LocusSpec(
        id="egln1",
        label="EGLN1",
        chromosome="chr1",
        center=231391154,
        genes=("EGLN1",),
        variants=(
            (231389514, "C", "T", "rs479200"),
            (231395210, "A", "G", "rs2064766"),
        ),
    ),
    LocusSpec(
        id="epas1",
        label="EPAS1",
        chromosome="chr2",
        center=46340184,
        genes=("EPAS1",),
        variants=((46337512, "G", "A", "rs570553380"),),
    ),
)


def _rng(*parts: object) -> np.random.Generator:
    """Generador determinista derivado de una clave textual.

    Determinista a proposito: dos corridas del generador producen bytes
    identicos, asi que un cambio en ``data/dist/`` significa siempre un cambio
    real y no ruido de muestreo.
    """
    key = "|".join(str(p) for p in parts).encode("utf-8")
    return np.random.default_rng(int.from_bytes(hashlib.sha256(key).digest()[:8], "big"))


def _variant_id(chromosome: str, position: int, ref: str, alt: str) -> str:
    """Identificador seguro para rutas: el Atlas usa '>' y no vale en un archivo."""
    return f"{chromosome}-{position}-{ref}-{alt}"


# --------------------------------------------------------------------------
# Senal sintetica
# --------------------------------------------------------------------------


def _synthetic_signal(
    rng: np.random.Generator,
    length: int,
    peaks: int,
    focus: int | None = None,
    focus_width: float = 24.0,
) -> np.ndarray:
    """Senal de cobertura con picos, parecida en forma a la real.

    No pretende imitar biologia: solo tener la estadistica que estresa al
    visor, que es cola pesada, fondo bajo y picos estrechos. Si el visor se ve
    bien con esto, se vera bien con datos reales.

    Args:
      rng: Generador determinista.
      length: Numero de muestras.
      peaks: Picos de fondo repartidos al azar.
      focus: Si se da, se garantiza un pico ahi. Sin el, la variante caeria en
        una zona de fondo en la mayoria de los tracks y la diferencia REF/ALT
        seria invisible: la vista no demostraria lo que dice demostrar.
      focus_width: Ancho del pico garantizado, en muestras.
    """
    x = np.abs(rng.normal(0.0, 0.08, length))
    grid = np.arange(length)
    for _ in range(peaks):
        center = rng.integers(0, length)
        width = max(2.0, rng.gamma(2.0, 6.0))
        height = rng.gamma(2.0, 1.4)
        x += height * np.exp(-0.5 * ((grid - center) / width) ** 2)
    if focus is not None:
        x += rng.uniform(2.5, 6.0) * np.exp(
            -0.5 * ((grid - focus) / focus_width) ** 2
        )
    return x


def _synthetic_delta(
    rng: np.random.Generator, ref: np.ndarray, focus: int, reach: float
) -> np.ndarray:
    """Efecto de la variante: local, con signo, y cero lejos del sitio.

    Que el delta sea casi todo ceros no es un atajo, es la propiedad que hace
    que el formato REF+DELTA comprima tanto mejor que REF+ALT.
    """
    grid = np.arange(ref.size)
    envelope = np.exp(-0.5 * ((grid - focus) / reach) ** 2)
    direction = -1.0 if rng.random() < 0.5 else 1.0
    delta = direction * ref * envelope * rng.uniform(0.3, 0.8)
    delta[envelope < 1e-4] = 0.0
    return delta


def _tracks_for(modality: str) -> int:
    """Cuantos tracks emite cada modalidad en la fixture."""
    return {"CONTACT_MAPS": 1, "SPLICE_SITES": 2, "SPLICE_SITE_USAGE": 2}.get(
        modality, 4
    )


def _write_signal_level(
    out: pathlib.Path,
    spec: LocusSpec,
    level: str,
    bin_size: int,
    length: int,
    interval: dict[str, Any],
    focus_fraction: float,
) -> dict[str, Any]:
    """Genera y escribe los bloques de senal de un nivel de resolucion."""
    modalities: dict[str, Any] = {}
    for modality, _label, _signed in MODALITIES:
        n_tracks = _tracks_for(modality)
        rng = _rng(spec.id, level, modality)
        arrays: list[np.ndarray] = []
        track_headers: list[dict[str, Any]] = []
        focus = int(length * focus_fraction)
        reach = max(3.0, length / 256)

        for t in range(n_tracks):
            ref = _synthetic_signal(
                rng,
                length,
                peaks=max(3, length // 900),
                focus=focus,
                focus_width=max(6.0, reach * 0.8),
            )
            delta = _synthetic_delta(rng, ref, focus, reach)
            q_ref = quantize.quantize(ref, "linear")
            q_delta = quantize.quantize(delta, "linear")
            arrays.extend([q_ref.values, q_delta.values])
            biosample = _BIOSAMPLES[(t * 7 + len(modality)) % len(_BIOSAMPLES)]
            track_headers.append(
                {
                    "name": f"{modality}:{biosample[0]}",
                    "biosample": biosample[0],
                    "ontologyCurie": biosample[1],
                    "strand": "." if modality != "RNA_SEQ" else ("+" if t % 2 else "-"),
                    "ref": q_ref.to_header(),
                    "delta": q_delta.to_header(),
                }
            )

        blob = quantize.pack_block(
            {
                "schemaVersion": SCHEMA_VERSION,
                "locus": spec.id,
                "level": level,
                "modality": modality,
                "binSize": bin_size,
                "length": length,
                "interval": interval,
                "layout": "por track: arreglo REF seguido de arreglo DELTA",
                "tracks": track_headers,
            },
            arrays,
        )
        path = out / "signals" / level / f"{modality}.bin"
        measured = contract.write_blob(path, blob, label=f"{spec.id}/{level}/{modality}")
        modalities[modality] = {
            "path": f"signals/{level}/{modality}.bin",
            "bytes": measured["bytes"],
            "tracks": n_tracks,
        }

    return {
        "binSize": bin_size,
        "length": length,
        "interval": interval,
        "modalities": modalities,
    }


# --------------------------------------------------------------------------
# Artefactos por variante
# --------------------------------------------------------------------------


def _build_card(spec: LocusSpec, position: int, ref: str, alt: str, rsid: str | None):
    """Construye la ficha de variante (V1)."""
    rng = _rng(spec.id, position, "card")
    vid = _variant_id(spec.chromosome, position, ref, alt)

    # Contribuciones SHAP: los regulatorios dominan en variantes no codificantes,
    # que es el caso de uso central de AlphaGenome.
    contributions = []
    for fid, label, family in AVI_FEATURES:
        if family == "regulatory":
            c = rng.normal(0.0, 0.9)
        elif family == "conservation":
            c = rng.normal(0.4, 0.6)
        elif family == "protein":
            c = rng.normal(0.0, 0.15)
        else:
            c = 0.0  # SNV: los indicadores de indel no aportan
        contributions.append(
            {
                "id": fid,
                "label": label,
                "family": family,
                "contribution": round(float(c), 4),
                "value": round(float(rng.normal(0, 1)), 4) if family != "indel" else 0.0,
            }
        )

    base_value = 6.0
    total = base_value + sum(f["contribution"] for f in contributions)
    phred = float(np.clip(total, 0.0, 60.0))
    quantile = float(1.0 - 10.0 ** (-phred / 10.0))

    top_tracks = []
    for i in range(20):
        modality, _label, _signed = MODALITIES[i % len(MODALITIES)]
        biosample = _BIOSAMPLES[(i * 5) % len(_BIOSAMPLES)]
        top_tracks.append(
            {
                "name": f"{modality}:{biosample[0]}",
                "modality": modality,
                "biosample": biosample[0],
                "ontologyCurie": biosample[1],
                "strand": ".",
                "score": round(float(rng.normal(0, 1.2)), 4),
                "quantile": round(float(rng.uniform(0.5, 1.0)), 4),
            }
        )
    top_tracks.sort(key=lambda t: abs(t["score"]), reverse=True)

    return {
        "schemaVersion": SCHEMA_VERSION,
        "variant": {
            "id": vid,
            "chromosome": spec.chromosome,
            "position": position,
            "ref": ref,
            "alt": alt,
            "rsid": rsid,
            "gene": spec.genes[0],
        },
        "provenance": provenance.synthetic(position).to_dict(),
        "avi": {
            "phred": round(phred, 3),
            "quantile": round(quantile, 6),
            "baseValue": base_value,
        },
        "featureFamilies": [dict(f) for f in FEATURE_FAMILIES],
        "features": contributions,
        "topTracks": top_tracks,
    }, phred


def _build_tracks(spec: LocusSpec, position: int, ref: str, alt: str, rsid: str | None):
    """Construye el mapa de calor biosample x modalidad (V2)."""
    rng = _rng(spec.id, position, "heatmap")
    vid = _variant_id(spec.chromosome, position, ref, alt)

    # Un efecto especifico de tejido: un sistema de organos responde y el resto
    # no. Es justamente el patron que la vista tiene que dejar ver de un vistazo.
    hot_system = ORGAN_SYSTEMS[rng.integers(0, len(ORGAN_SYSTEMS))][0]

    cells: list[list[Any]] = []
    for bi, (_name, _curie, _btype, system) in enumerate(_BIOSAMPLES):
        amplitude = 1.5 if system == hot_system else 0.35
        for mi, (_mid, _mlabel, _signed) in enumerate(MODALITIES):
            value = float(rng.normal(0.0, amplitude))
            if abs(value) < 0.05:
                continue  # disperso: omitir lo indistinguible de cero
            cells.append(
                [bi, mi, round(value, 4), round(float(rng.uniform(0.5, 1.0)), 4)]
            )

    return {
        "schemaVersion": SCHEMA_VERSION,
        "variant": {
            "id": vid,
            "chromosome": spec.chromosome,
            "position": position,
            "ref": ref,
            "alt": alt,
            "rsid": rsid,
            "gene": spec.genes[0],
        },
        "provenance": provenance.synthetic(position).to_dict(),
        "modalities": [
            {"id": m, "label": label, "signed": signed, "unit": None}
            for m, label, signed in MODALITIES
        ],
        "organSystems": [{"id": i, "label": label} for i, label in ORGAN_SYSTEMS],
        "biosamples": [
            {
                "id": name,
                "label": name,
                "ontologyCurie": curie,
                "biosampleType": btype,
                "organSystem": system,
            }
            for name, curie, btype, system in _BIOSAMPLES
        ],
        "cells": cells,
    }


def _build_annotations(spec: LocusSpec, start: int, end: int) -> dict[str, Any]:
    """Genes y transcritos del locus, para el carril de anotacion de V3."""
    rng = _rng(spec.id, "annotations")
    genes = []
    for i, gene in enumerate(spec.genes):
        span = int(rng.integers(20_000, 90_000))
        g_start = spec.center - span // 2 + (i - len(spec.genes) / 2) * span
        g_start = int(np.clip(g_start, start, end - span))
        strand = "+" if i % 2 == 0 else "-"
        n_exons = int(rng.integers(4, 12))
        bounds = sorted(rng.uniform(0, span, n_exons * 2))
        exons = [
            [int(g_start + bounds[2 * k]), int(g_start + bounds[2 * k + 1])]
            for k in range(n_exons)
        ]
        genes.append(
            {
                "name": gene,
                "strand": strand,
                "start": g_start,
                "end": g_start + span,
                "transcripts": [
                    {"id": f"ENST{rng.integers(1e10, 9.9e10):011d}", "exons": exons}
                ],
            }
        )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "locus": spec.id,
        "interval": {"chromosome": spec.chromosome, "start": start, "end": end},
        "provenance": provenance.synthetic(0).to_dict(),
        "genes": genes,
    }


# --------------------------------------------------------------------------
# Orquestacion
# --------------------------------------------------------------------------


def generate(dist: pathlib.Path | None = None) -> dict[str, Any]:
    """Genera el arbol completo de fixtures en ``data/dist/``.

    Returns:
      Resumen con las mediciones de presupuesto de cada artefacto escrito.
    """
    dist = dist or contract.DIST
    report: dict[str, Any] = {"artifacts": [], "worst": {}}

    def record(kind: str, label: str, measured: dict[str, Any]) -> None:
        row = {"kind": kind, "label": label, **measured}
        report["artifacts"].append(row)
        worst = report["worst"].get(kind)
        if worst is None or measured["usedFraction"] > worst["usedFraction"]:
            report["worst"][kind] = row

    index_loci = []

    for spec in LOCI:
        start = spec.center - WINDOW // 2
        end = start + WINDOW
        interval = {"chromosome": spec.chromosome, "start": start, "end": end}
        out = dist / "loci" / spec.id

        overview = _write_signal_level(
            out, spec, "overview", OVERVIEW_BIN, WINDOW // OVERVIEW_BIN, interval, 0.5
        )
        for modality, ref in overview["modalities"].items():
            record(
                "signal",
                f"{spec.id}/overview/{modality}",
                {
                    "bytes": ref["bytes"],
                    "gzipBytes": 0,
                    "budget": contract.BUDGETS["signal"].max_bytes,
                    "usedFraction": round(
                        ref["bytes"] / contract.BUDGETS["signal"].max_bytes, 4
                    ),
                },
            )

        focus = spec.variants[0][0]
        d_start = focus - DETAIL_HALF_WIDTH
        d_interval = {
            "chromosome": spec.chromosome,
            "start": d_start,
            "end": d_start + 2 * DETAIL_HALF_WIDTH,
        }
        detail = _write_signal_level(
            out, spec, "detail", 1, 2 * DETAIL_HALF_WIDTH, d_interval, 0.5
        )
        for modality, ref in detail["modalities"].items():
            record(
                "signal",
                f"{spec.id}/detail/{modality}",
                {
                    "bytes": ref["bytes"],
                    "gzipBytes": 0,
                    "budget": contract.BUDGETS["signal"].max_bytes,
                    "usedFraction": round(
                        ref["bytes"] / contract.BUDGETS["signal"].max_bytes, 4
                    ),
                },
            )

        record(
            "annotations",
            spec.id,
            contract.write_json(
                out / "annotations.json",
                "annotations",
                _build_annotations(spec, start, end),
                label=spec.id,
            ),
        )

        variants_entries = []
        for position, ref_base, alt_base, rsid in spec.variants:
            vid = _variant_id(spec.chromosome, position, ref_base, alt_base)
            vdir = out / "variants" / vid

            card, phred = _build_card(spec, position, ref_base, alt_base, rsid)
            record(
                "card",
                vid,
                contract.write_json(vdir / "card.json", "card", card, label=vid),
            )

            heatmap = _build_tracks(spec, position, ref_base, alt_base, rsid)
            record(
                "tracks",
                vid,
                contract.write_json(
                    vdir / "tracks.json", "tracks", heatmap, label=vid
                ),
            )

            variants_entries.append(
                {
                    "variant": card["variant"],
                    "aviPhred": card["avi"]["phred"],
                    "artifacts": {
                        "card": f"variants/{vid}/card.json",
                        "tracks": f"variants/{vid}/tracks.json",
                        "splice": None,
                        "contact": None,
                    },
                }
            )

        locus_doc = {
            "schemaVersion": SCHEMA_VERSION,
            "id": spec.id,
            "label": spec.label,
            "interval": interval,
            "provenance": provenance.synthetic(0).to_dict(),
            "genes": list(spec.genes),
            "annotations": "annotations.json",
            "variants": variants_entries,
            "signals": {"overview": overview, "detail": detail},
        }
        measured = contract.write_json(
            out / "locus.json", "locus", locus_doc, label=spec.id
        )
        record("locus", spec.id, measured)

        index_loci.append(
            {
                "id": spec.id,
                "label": spec.label,
                "chromosome": spec.chromosome,
                "start": start,
                "end": end,
                "genes": list(spec.genes),
                "variantCount": len(spec.variants),
                "path": f"loci/{spec.id}/locus.json",
                "bytes": measured["bytes"],
            }
        )

    study = _build_study()
    record(
        "study",
        study["id"],
        contract.write_json(
            dist / "studies" / study["id"] / "manifest.json",
            "study",
            study,
            label=study["id"],
        ),
    )

    index_doc = {
        "schemaVersion": SCHEMA_VERSION,
        "generated": provenance.Provenance(source="synthetic", config={}).queried_at,
        "provenance": provenance.synthetic(0).to_dict(),
        "loci": index_loci,
        "studies": [
            {
                "id": study["id"],
                "label": study["label"],
                "status": study["status"],
                "path": f"studies/{study['id']}/manifest.json",
            }
        ],
    }
    record(
        "index",
        "index",
        contract.write_json(dist / "index.json", "index", index_doc, label="index"),
    )

    return report


def _build_study() -> dict[str, Any]:
    """Manifiesto del estudio 1, declarado como planificado.

    Se emite en estado ``planned`` a proposito: el estudio del documento 02 aun
    no corrio, y la plataforma tiene que poder mostrar un estudio sin resultados
    sin mentir sobre ellos.
    """
    return {
        "schemaVersion": SCHEMA_VERSION,
        "id": "atlas-andino",
        "label": "Calibracion del AVI y ascendencia amerindigena",
        "summary": (
            "Evalua si el mismo PHRED de AVI compra la misma fuerza de evidencia "
            "en variantes enriquecidas en tramos de ancestria amerindigena que en "
            "variantes europeas emparejadas. La hipotesis es de INFLACION, no de "
            "subestimacion: una variante que segrega en haplotipos indigenas y se "
            "diluye dentro del grupo agregado AMR recibe FAF baja, y la FAF baja "
            "es justamente la etiqueta de 'proxy impactful' con la que se entreno "
            "el AVI."
        ),
        "status": "planned",
        "provenance": provenance.synthetic(0).to_dict(),
        "honesty": {
            "sampleSize": {
                "gnomad_lai_amr_muestras": 7612,
                "gnomad_lai_amr_snps": 14804206,
                "replica_pel": 85,
                "replica_mxl": 64,
                "replica_clm": 94,
                "replica_pur": 104,
            },
            "power": {
                "achieved": None,
                "target": 0.8,
                "effectiveUnits": None,
                "note": (
                    "Sin medir. La compuerta G6 del documento 03 decide si hay "
                    "poder: si el conteo genome-wide extrapolado baja de ~2000 "
                    "variantes, el estudio se publica declarando que no alcanzo."
                ),
            },
            "limitations": [
                "PEL esta dentro del callset de entrenamiento de gnomAD v4: "
                "evaluar en PEL es evaluar en train. Se reporta como brazo aparte.",
                "En una poblacion con cuello de botella las variantes viajan en "
                "pocos haplotipos largos; tratarlas como independientes es "
                "anticonservador. Se reporta el numero efectivo de haplotipos.",
                "Radivojac et al. 2026 muestran reversion de Simpson: comparar "
                "sin condicionar por frecuencia alelica hace significativo casi "
                "todo. El analisis estratifica dentro de bins de FAF.",
                "Las variantes andinas comunes estan enriquecidas en funcion "
                "adaptativa: si el AVI las puntua alto, puede estar acertando. "
                "Por eso el desenlace es la curva de calibracion, no la media.",
                "Los cuantiles del AVI se recalibraron el 2026-06-18 y los indels "
                "el 2026-07-14. Solo se comparan artefactos de la misma cosecha.",
            ],
            "preregistered": False,
            "ethics": (
                "Solo datos agregados de consentimiento abierto. Ninguna "
                "afirmacion sobre individuos ni sobre comunidades quechuas o "
                "aymaras, que no consintieron este encuadre. Adhesion a los "
                "principios CARE de gobernanza de datos indigenas."
            ),
        },
        "panels": [
            {
                "id": "estado",
                "type": "note",
                "title": "Estado del estudio",
                "caption": None,
                "data": {
                    "body": (
                        "El estudio aun no ha corrido. Esta ficha existe para "
                        "demostrar que la plataforma publica un estudio sin "
                        "resultados sin disfrazarlo de resultado."
                    )
                },
                "options": {"tone": "pending"},
            }
        ],
    }
