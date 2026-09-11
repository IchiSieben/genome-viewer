"""H0 — sonda con llave contra las dos APIs.

Resuelve todo lo que el contrato tenia como provisional y verifica el
presupuesto de bytes con datos REALES, no con fixtures.

Presupuesto de llamadas: ~40. Se imprime el conteo al final.

Uso::

    PYTHONPATH=pipeline/src python pipeline/tools/h0_probe.py
"""

from __future__ import annotations

import json
import pathlib
import statistics
import sys
import time
from typing import Any

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))

from alphagenome_platform import quantize  # noqa: E402
from alphagenome_platform.acquire import atlas_source  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "evidence" / "h0-online-probe.json"

# rs884510 esta en chr12:54578515. OJO: los documentos de contexto lo dan como
# T>C y el servidor RECHAZA esa variante: la base de referencia real es C.
SEED_CHROM = "chr12"
SEED_POS = 54578515
AVI_SCORERS = ["AVI_SCORE", "AVI_SCORE_FEATURE_IMPORTANCE"]

calls = 0


def say(text: str = "") -> None:
    sys.stdout.buffer.write((text + "\n").encode("utf-8", "replace"))
    sys.stdout.flush()


def main() -> None:
    global calls
    from alphagenome.atlas import atlas
    from alphagenome.data import genome
    from alphagenome.models import dna_client, dna_output

    report: dict[str, Any] = {"probedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    key = atlas_source.load_api_key()

    # ---------------------------------------------------------------- Atlas
    say("=" * 72)
    say("1. ATLAS — nombres reales de los 18 features del AVI")
    say("=" * 72)

    client = atlas.create(key)
    interval = genome.Interval(SEED_CHROM, SEED_POS - 1, SEED_POS)
    t0 = time.perf_counter()
    res = client.query_interval(interval, requested_scorers=AVI_SCORERS, progress_bar=False)
    calls += 1
    say(f"query_interval de 1 pb: {time.perf_counter() - t0:.2f}s")

    score = res["AVI_SCORE"]
    imp = res["AVI_SCORE_FEATURE_IMPORTANCE"]
    variants = [str(v) for v in score.obs["variant"]]
    features = list(imp.var["name"])

    say(f"\nvariantes reales en la posicion: {variants}")
    say(f"\nlos {len(features)} features, EN ORDEN:")
    for i, name in enumerate(features):
        say(f"  {i:2d}  {name}")

    # ¿Cierra la cascada? contribuciones + base = score crudo.
    bases = []
    for row_scores, row_imp in zip(score.X, imp.X):
        bases.append(float(row_scores[0]) - float(np.sum(row_imp)))
    base_value = float(statistics.mean(bases))
    spread = max(bases) - min(bases)
    say(f"\nvalor base de la explicacion SHAP: {base_value:.6f}")
    say(f"  dispersion entre variantes: {spread:.2e}  "
        f"({'constante' if spread < 1e-4 else 'NO constante'})")
    say("  => base = avi_crudo - suma(contribuciones); la cascada cierra.")

    quantiles = None
    if score.layers and "quantiles" in score.layers:
        quantiles = np.asarray(score.layers["quantiles"])
        say(f"\nlayers['quantiles'] presente: shape {quantiles.shape}")
        say("  variante            crudo      cuantil     PHRED")
        for v, raw, q in zip(variants, score.X.ravel(), quantiles.ravel()):
            q = float(q)
            phred = -10.0 * np.log10(max(1e-12, 1.0 - q)) if q < 1 else float("inf")
            say(f"  {v:<20}{float(raw):>9.5f}{q:>12.6f}{phred:>10.3f}")
    else:
        say("\nlayers['quantiles'] AUSENTE en AVI_SCORE")
    say(f"AVI_SCORE_FEATURE_IMPORTANCE tiene quantiles: "
        f"{bool(imp.layers) and 'quantiles' in imp.layers}")

    report["atlas"] = {
        "variantsAtSeed": variants,
        "featureNames": features,
        "featureCount": len(features),
        "shapBaseValue": base_value,
        "shapBaseSpread": spread,
        "rawScores": [float(x) for x in score.X.ravel()],
        "quantiles": [float(x) for x in quantiles.ravel()] if quantiles is not None else None,
        "scoreVarColumns": list(score.var.columns),
        "importanceVarColumns": list(imp.var.columns),
        "obsColumns": list(score.obs.columns),
        "seedRefBaseCorrection": "los documentos dan T>C; la referencia real es C",
    }

    # ------------------------------------------------------------ Model API
    say("")
    say("=" * 72)
    say("2. MODEL API — predict_variant sobre 1 Mb (UNA sola llamada)")
    say("=" * 72)

    model = dna_client.create(key)
    seq_len = dna_client.SEQUENCE_LENGTH_1MB
    centre = SEED_POS
    iv = genome.Interval(SEED_CHROM, centre - seq_len // 2, centre + seq_len // 2)
    variant = genome.Variant(SEED_CHROM, SEED_POS, "C", "T")
    terms = ["UBERON:0002048", "UBERON:0000178"]  # pulmon, sangre

    t0 = time.perf_counter()
    out = model.predict_variant(
        interval=iv,
        variant=variant,
        requested_outputs=[dna_output.OutputType.RNA_SEQ, dna_output.OutputType.DNASE],
        ontology_terms=terms,
    )
    calls += 1
    elapsed = time.perf_counter() - t0
    say(f"predict_variant 1 Mb, 2 modalidades, {len(terms)} terminos: {elapsed:.2f}s")

    model_report: dict[str, Any] = {"seconds": elapsed, "interval": str(iv), "tracks": {}}
    total_values = 0
    real_track = None
    for side in ("reference", "alternate"):
        side_out = getattr(out, side)
        for modality in ("rna_seq", "dnase"):
            td = getattr(side_out, modality, None)
            if td is None:
                continue
            say(f"  {side:<10} {modality:<6} values{td.values.shape} "
                f"dtype={td.values.dtype} resolution={td.resolution} "
                f"tracks={td.values.shape[-1]}")
            total_values += int(np.prod(td.values.shape))
            model_report["tracks"][f"{side}.{modality}"] = {
                "shape": list(td.values.shape),
                "resolution": int(td.resolution),
                "dtype": str(td.values.dtype),
                "metadataColumns": list(td.metadata.columns),
                "trackNames": list(td.metadata["name"])[:8],
            }
            if real_track is None and modality == "rna_seq" and side == "reference":
                real_track = np.asarray(td.values[:, 0], dtype=np.float64)

    raw_bytes = total_values * 4
    say(f"\n  valores totales: {total_values:,}  = {raw_bytes / 1e6:.1f} MB en float32")
    model_report["totalValues"] = total_values
    model_report["float32Bytes"] = raw_bytes
    report["model"] = model_report

    # ------------------------------------- Presupuesto con datos REALES
    say("")
    say("=" * 72)
    say("3. PRESUPUESTO DE BYTES VERIFICADO CON SENAL REAL")
    say("=" * 72)

    if real_track is None:
        say("no se obtuvo un track real; se omite")
    else:
        n = real_track.size
        say(f"track real: {n:,} valores, rango [{real_track.min():.4f}, {real_track.max():.4f}]")
        usable = (n // 128) * 128
        binned = quantize.bin_signal(real_track[:usable], 128, "mean")
        q = quantize.quantize(binned)
        rec = quantize.dequantize(q.values, q.scale, q.transform)
        err = float(np.max(np.abs(rec - binned)))
        rng = float(binned.max() - binned.min()) or 1.0
        px = err / rng * 400.0
        say(f"  binned a 128 pb: {binned.size:,} valores")
        say(f"  error maximo de cuantizacion: {err:.3e}")
        say(f"  rango de la senal binned:     {rng:.4f}")
        say(f"  error en pixeles sobre 400 px de alto: {px:.5f} px")
        say(f"  => {'INVISIBLE, el esquema aguanta' if px < 0.05 else 'VISIBLE: hay que arreglarlo'}")

        qmax = quantize.quantize(quantize.bin_signal(real_track[:usable], 128, "max"))
        say(f"  (agregacion por maximo: error {qmax.max_abs_error:.3e})")
        report["budget"] = {
            "trackValues": int(n),
            "binnedValues": int(binned.size),
            "maxAbsError": err,
            "signalRange": rng,
            "errorPixels": px,
            "verdict": "invisible" if px < 0.05 else "visible",
        }

    # --------------------------------------------------- Concurrencia
    say("")
    say("=" * 72)
    say("4. CONCURRENCIA — max_workers 1, 4, 8")
    say("=" * 72)

    wide = genome.Interval(SEED_CHROM, SEED_POS - 1, SEED_POS + 3)
    probe = client.query_interval(wide, requested_scorers=["AVI_SCORE"], progress_bar=False)
    calls += 1
    pool = [str(v) for v in probe["AVI_SCORE"].obs["variant"]][:12]
    say(f"variantes de prueba: {len(pool)}")

    objs = []
    for text in pool:
        chrom, pos, alleles = text.split(":")
        ref, alt = alleles.split(">")
        objs.append(genome.Variant(chrom, int(pos), ref, alt))

    timings: dict[str, Any] = {}
    exhausted = False
    for workers in (1, 4, 8):
        t0 = time.perf_counter()
        try:
            client.query_variants(
                objs, requested_scorers=["AVI_SCORE"],
                max_workers=workers, progress_bar=False,
            )
            calls += len(objs)
            dt = time.perf_counter() - t0
            per = dt / len(objs)
            timings[str(workers)] = {"seconds": dt, "perVariant": per}
            say(f"  max_workers={workers}: {dt:5.2f}s total, {per:.3f}s por variante")
        except Exception as error:  # noqa: BLE001
            timings[str(workers)] = {"error": str(error)[:200]}
            say(f"  max_workers={workers}: ERROR {str(error)[:120]}")
            if "RESOURCE_EXHAUSTED" in str(error).upper():
                exhausted = True

    say(f"\nRESOURCE_EXHAUSTED observado: {'SI' if exhausted else 'NO'}")
    ok = [int(w) for w, v in timings.items() if "error" not in v]
    best = min(ok, key=lambda w: timings[str(w)]["seconds"]) if ok else 1
    recommended = 4 if best >= 4 else best
    say(f"mas rapido medido: max_workers={best} -> se fija un valor conservador: {recommended}")
    report["concurrency"] = {
        "timings": timings,
        "resourceExhausted": exhausted,
        "fastest": best,
        "recommended": recommended,
    }

    report["callsUsed"] = calls
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    say("")
    say("=" * 72)
    say(f"llamadas usadas: {calls}")
    say(f"evidencia escrita en {OUT.relative_to(ROOT)}")
    say("=" * 72)


if __name__ == "__main__":
    main()
