"""Orquesta el congelado de uno o varios loci reales."""

from __future__ import annotations

import json
import logging
import pathlib
import time
from typing import Any

import numpy as np

from alphagenome_platform import SCHEMA_VERSION, contract, provenance
from alphagenome_platform.acquire import atlas_source, ensembl
from alphagenome_platform.freeze import build_locus as bl
from alphagenome_platform.loci import LOCI, LocusConfig

_log = logging.getLogger(__name__)


def _provenance(source: str, config: Any, **extra: Any) -> dict[str, Any]:
    return provenance.Provenance(
        source=source, config=config, **extra
    ).to_dict()


def build_locus(
    config: LocusConfig,
    *,
    dist: pathlib.Path | None = None,
    max_workers: int = 4,
    with_signals: bool = True,
    with_saturation: bool = True,
) -> dict[str, Any]:
    """Congela un locus completo. Devuelve su entrada de indice y mediciones."""
    from alphagenome.atlas import atlas
    from alphagenome.data import genome
    from alphagenome.models import dna_client, dna_output

    dist = dist or contract.DIST
    out_dir = dist / "loci" / config.id
    # Un locus se reconstruye ENTERO. Sin esto, los artefactos de una corrida
    # anterior sobreviven, y si el visor resuelve una ruta hacia uno de ellos
    # muestra datos viejos con la proveniencia nueva, que es la peor forma de
    # equivocarse en este proyecto.
    if out_dir.exists():
        import shutil

        shutil.rmtree(out_dir)
        _log.info("[%s] artefactos anteriores eliminados", config.id)
    key = atlas_source.load_api_key()
    client = atlas.create(key)

    start = config.center - bl.WINDOW // 2
    end = start + bl.WINDOW
    interval_dict = {"chromosome": config.chromosome, "start": start, "end": end}
    measurements: list[dict[str, Any]] = []

    # ---------------------------------------------------------- variantes
    _log.info("[%s] resolviendo variantes contra el servidor", config.id)
    specs = bl.resolve_variants(client, config)

    variants = [
        genome.Variant(config.chromosome, s.position, s.ref, s.alt) for s in specs
    ]
    scorers = list(bl.AVI_SCORERS) + list(bl.HEATMAP_SCORERS)
    _log.info("[%s] query_variants: %d variantes x %d scorers",
              config.id, len(variants), len(scorers))
    t0 = time.perf_counter()
    result = client.query_variants(
        variants,
        requested_scorers=scorers,
        max_workers=max_workers,
        progress_bar=False,
    )
    _log.info("[%s] atlas en %.2fs", config.id, time.perf_counter() - t0)

    atlas_prov = _provenance(
        "atlas-api",
        {"locus": config.id, "scorers": scorers},
        scorers=tuple(scorers),
        has_quantiles="quantiles" in (result["AVI_SCORE"].layers or {}),
    )

    # --------------------------------------------------------- anotacion
    # La anotacion es un enriquecimiento, no el contenido. Si Ensembl esta
    # caido o lento, el locus se congela igual y el carril de genes lo dice en
    # pantalla: perder la senal por una anotacion seria el orden de prioridades
    # al reves.
    _log.info("[%s] anotacion de genes desde Ensembl", config.id)
    try:
        genes = ensembl.trim_transcripts(
            ensembl.fetch_genes(config.chromosome, start, end, focus=config.center)
        )
    except ensembl.EnsemblError as error:
        _log.warning("[%s] sin anotacion de genes: %s", config.id, error)
        genes = []
    annotations = {
        "schemaVersion": SCHEMA_VERSION,
        "locus": config.id,
        "interval": interval_dict,
        "provenance": _provenance(
            "atlas-api",
            {"source": "ensembl-rest", "region": f"{config.chromosome}:{start}-{end}"},
            notes=(
                "Genes y exones de Ensembl REST, GRCh38. No es una prediccion."
                if genes
                else "Ensembl no respondio; el locus se congelo sin anotacion."
            ),
        ),
        "genes": genes,
    }
    measurements.append(
        {
            "kind": "annotations",
            "label": config.id,
            **contract.write_json(
                out_dir / "annotations.json", "annotations", annotations,
                label=config.id,
            ),
        }
    )

    gene_names = [g["name"] for g in genes]
    primary_gene = next(
        (g for g in config.genes if g in gene_names), config.genes[0] if config.genes else None
    )

    # ------------------------------------------------- artefactos por variante
    score_ad = result["AVI_SCORE"]
    imp_ad = result["AVI_SCORE_FEATURE_IMPORTANCE"]
    val_ad = result.get("AVI_SCORE_MODEL_FEATURES")
    feature_names = list(imp_ad.var["name"])
    quantiles = (
        np.asarray(score_ad.layers["quantiles"])
        if score_ad.layers and "quantiles" in score_ad.layers
        else None
    )

    obs_keys = [str(v) for v in score_ad.obs["variant"]]
    entries: list[dict[str, Any]] = []

    model = dna_client.create(key) if with_signals else None

    for spec in specs:
        key_text = f"{config.chromosome}:{spec.position}:{spec.ref}>{spec.alt}"
        if key_text not in obs_keys:
            _log.warning("El servidor no devolvio %s; se omite", key_text)
            continue
        row = obs_keys.index(key_text)
        vid = bl.variant_id(config.chromosome, spec.position, spec.ref, spec.alt)
        vdir = out_dir / "variants" / vid

        per_scorer: dict[str, tuple[np.ndarray, Any]] = {}
        for scorer in bl.HEATMAP_SCORERS:
            ad = result.get(scorer)
            # Un scorer sin ninguna pista cerca (sin union de splicing, sin
            # sitio de poliadenilacion) responde con n_obs=0 y por lo tanto
            # SIN columna "variant": no es un error, es "no hay nada que
            # decir aqui". Se descubrio con APOA1 (sin splicing/poliA en la
            # ventana), no con una AnnData vacia inventada.
            if ad is None or ad.n_obs == 0 or "variant" not in ad.obs.columns:
                continue
            scorer_keys = [str(v) for v in ad.obs["variant"]]
            if key_text not in scorer_keys:
                continue
            per_scorer[scorer] = (
                np.asarray(ad.X[scorer_keys.index(key_text)]).ravel(),
                ad.var,
            )

        tracks_doc, top_tracks = bl.build_tracks(
            config.chromosome, spec, per_scorer, atlas_prov, primary_gene
        )
        measurements.append(
            {
                "kind": "tracks",
                "label": vid,
                **contract.write_json(
                    vdir / "tracks.json", "tracks", tracks_doc, label=vid
                ),
            }
        )

        card = bl.build_card(
            config.chromosome,
            spec,
            np.asarray(imp_ad.X[row]).ravel(),
            np.asarray(val_ad.X[row]).ravel()
            if val_ad is not None
            else np.zeros(len(feature_names)),
            feature_names,
            float(np.asarray(score_ad.X[row]).ravel()[0]),
            float(quantiles[row].ravel()[0]) if quantiles is not None else None,
            top_tracks,
            atlas_prov,
            primary_gene,
        )
        measurements.append(
            {
                "kind": "card",
                "label": vid,
                **contract.write_json(vdir / "card.json", "card", card, label=vid),
            }
        )

        entry: dict[str, Any] = {
            "variant": card["variant"],
            "aviPhred": card["avi"]["phred"],
            "artifacts": {
                "card": f"variants/{vid}/card.json",
                "tracks": f"variants/{vid}/tracks.json",
                "splice": None,
                "contact": None,
                "saturation": None,
            },
        }

        # N1: mapa de saturacion. Solo para la variante que ancla el locus. Las
        # tres variantes de una misma posicion comparten ventana, asi que
        # repetirlo multiplicaria las sub-peticiones sin anadir nada.
        if with_saturation and spec is specs[0]:
            try:
                saturation = bl.build_saturation(client, config, spec, atlas_prov)
                measurements.append(
                    {
                        "kind": "saturation",
                        "label": vid,
                        **contract.write_json(
                            vdir / "saturation.json",
                            "saturation",
                            saturation,
                            label=vid,
                        ),
                    }
                )
                entry["artifacts"]["saturation"] = f"variants/{vid}/saturation.json"
            except Exception as error:  # noqa: BLE001
                _log.warning("[%s] sin mapa de saturacion: %s", config.id, error)
        if spec.note:
            entry["note"] = spec.note

        # ------------------------------------------------ perfiles del modelo
        if model is not None:
            iv = genome.Interval(config.chromosome, start, end)
            _log.info("[%s] predict_variant 1 Mb para %s", config.id, vid)
            t0 = time.perf_counter()
            output = model.predict_variant(
                interval=iv,
                variant=genome.Variant(
                    config.chromosome, spec.position, spec.ref, spec.alt
                ),
                requested_outputs=[
                    getattr(dna_output.OutputType, m) for m in bl.SIGNAL_OUTPUTS
                ],
                ontology_terms=list(bl.ONTOLOGY_TERMS),
            )
            _log.info("[%s] modelo en %.2fs", config.id, time.perf_counter() - t0)
            levels, signal_measurements = bl.build_signal_blocks(
                vdir, config.id, config.chromosome, spec, output, start,
                prov_note="Perfiles de predict_variant, una sola peticion.",
                path_prefix=f"variants/{vid}/",
            )
            measurements.extend(signal_measurements)
            if levels:
                entry["signals"] = levels

        # ------------------------------------------------------- V4: sashimi
        # Llamada APARTE de la de arriba: esa usa ONTOLOGY_TERMS (sangre,
        # pulmon, higado), y en un biosample donde la variante no actua el
        # sashimi saldria simetrico sin que nada falle. Solo se pide cuando la
        # variante declara un termino; sin eso no hay artefacto (`splice`
        # queda `None`), que es distinto de "sin uniones" (`status: "no_data"`
        # dentro de un artefacto que si se pidio).
        if model is not None and spec.sashimi_ontology:
            biosample_name = bl.biosample_name_for(client, spec.sashimi_ontology)
            _log.info(
                "[%s] predict_variant SPLICE_JUNCTIONS (%s, %s) para %s",
                config.id, spec.sashimi_ontology, biosample_name, vid,
            )
            splice_doc = bl.build_splice(
                config.chromosome,
                spec,
                model,
                genome.Interval(config.chromosome, start, end),
                _provenance(
                    "model-api",
                    {
                        "locus": config.id,
                        "variant": vid,
                        "output": "SPLICE_JUNCTIONS",
                        "ontologyTerm": spec.sashimi_ontology,
                    },
                    notes="predict_variant aparte, con ontology_terms fijado al biosample declarado.",
                ),
                spec.sashimi_ontology,
                biosample_name,
                spec.sashimi_finding,
            )
            measurements.append(
                {
                    "kind": "splice",
                    "label": vid,
                    **contract.write_json(
                        vdir / "splice.json", "splice", splice_doc, label=vid
                    ),
                }
            )
            entry["artifacts"]["splice"] = f"variants/{vid}/splice.json"

        # -------------------------------------------- V5: diff de contactos
        # Tercera llamada aparte, por lo mismo (D11): CONTACT_MAPS no esta en
        # SIGNAL_OUTPUTS y su menu de ontologias no se parece al de las
        # senales -28 tracks, todos de 4D Nucleome y todos lineas celulares-.
        # Sin termino declarado no hay artefacto, que no es lo mismo que
        # `status: "no_data"` dentro de uno que si se pidio.
        if model is not None and spec.contacts_ontology:
            biosample_name = bl.biosample_name_for(client, spec.contacts_ontology)
            _log.info(
                "[%s] predict_variant CONTACT_MAPS (%s, %s) para %s",
                config.id, spec.contacts_ontology, biosample_name, vid,
            )
            contacts_doc = bl.build_contacts(
                config.chromosome,
                spec,
                model,
                genome.Interval(config.chromosome, start, end),
                _provenance(
                    "model-api",
                    {
                        "locus": config.id,
                        "variant": vid,
                        "output": "CONTACT_MAPS",
                        "ontologyTerm": spec.contacts_ontology,
                    },
                    notes="predict_variant aparte, con ontology_terms fijado al biosample declarado.",
                ),
                spec.contacts_ontology,
                biosample_name,
                spec.contacts_finding,
            )
            measurements.append(
                {
                    "kind": "contacts",
                    "label": vid,
                    **contract.write_json(
                        vdir / "contacts.json", "contacts", contacts_doc, label=vid
                    ),
                }
            )
            entry["artifacts"]["contact"] = f"variants/{vid}/contacts.json"

        entries.append(entry)

    # ------------------------------------------------------------- locus.json
    locus_doc = {
        "schemaVersion": SCHEMA_VERSION,
        "id": config.id,
        "label": config.label,
        "interval": interval_dict,
        "provenance": atlas_prov,
        "genes": list(config.genes),
        "annotations": "annotations.json",
        "variants": entries,
    }
    measured = contract.write_json(
        out_dir / "locus.json", "locus", locus_doc, label=config.id
    )
    measurements.append({"kind": "locus", "label": config.id, **measured})

    return {
        "index": {
            "id": config.id,
            "label": config.label,
            "chromosome": config.chromosome,
            "start": start,
            "end": end,
            "genes": list(config.genes),
            "variantCount": len(entries),
            "path": f"loci/{config.id}/locus.json",
            "bytes": measured["bytes"],
        },
        "measurements": measurements,
    }


def build_all(
    locus_ids: list[str] | None = None,
    *,
    dist: pathlib.Path | None = None,
    max_workers: int = 4,
    with_signals: bool = True,
    with_saturation: bool = True,
) -> dict[str, Any]:
    """Congela los loci pedidos y reescribe el indice."""
    dist = dist or contract.DIST
    wanted = [c for c in LOCI if not locus_ids or c.id in locus_ids]
    if not wanted:
        raise SystemExit(f"Ningun locus coincide con {locus_ids}")

    index_loci: list[dict[str, Any]] = []
    measurements: list[dict[str, Any]] = []
    for config in wanted:
        outcome = build_locus(
            config,
            dist=dist,
            max_workers=max_workers,
            with_signals=with_signals,
            with_saturation=with_saturation,
        )
        index_loci.append(outcome["index"])
        measurements.extend(outcome["measurements"])

    # Se conservan los loci ya presentes que no se acaban de reconstruir.
    index_path = dist / "index.json"
    existing: dict[str, Any] = {}
    studies: list[dict[str, Any]] = []
    if index_path.exists():
        old = json.loads(index_path.read_text(encoding="utf-8"))
        existing = {entry["id"]: entry for entry in old.get("loci", [])}
        studies = old.get("studies", [])
    for entry in index_loci:
        existing[entry["id"]] = entry

    # El puntero de portada se DERIVA de los locus.json recien escritos, no de
    # un config: asi no puede sobrevivir al artefacto al que apunta.
    featured = contract.featured_pointer(dist)
    index_doc = {
        "schemaVersion": SCHEMA_VERSION,
        "generated": provenance.Provenance(source="atlas-api", config={}).queried_at,
        "provenance": _provenance("atlas-api", {"loci": [c.id for c in wanted]}),
        **({"featured": featured} if featured else {}),
        "loci": sorted(existing.values(), key=lambda e: e["id"]),
        "studies": studies,
    }
    measurements.append(
        {
            "kind": "index",
            "label": "index",
            **contract.write_json(index_path, "index", index_doc, label="index"),
        }
    )
    return {"measurements": measurements, "loci": [c.id for c in wanted]}
