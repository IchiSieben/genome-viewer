"""Escenario: nubes de puntos AGSC.

Tres cosas se comprueban aqui y no se afirman en otro sitio:
1. El formato ida y vuelta, y la formula de la amplitud termica (B = 8 pi^2 <u^2>).
2. Que el emparejamiento de los morphs no se parece a uno aleatorio (no "explota").
3. Que data/stage/ esta completo, sellado y dentro del presupuesto de bytes. Este test rompe
   el build igual que los presupuestos del contrato v1.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pytest

from alphagenome_platform.stage import clouds

ROOT = Path(__file__).resolve().parents[2]
STAGE = ROOT / "data" / "stage"
MAX_GZ_PER_STRUCTURE = 150 * 1024
MAX_GZ_CATALOG = 1024 * 1024
MAX_PAIR_RATIO = 0.8
"""Distancia media emparejada / distancia con emparejamiento aleatorio. Medido el 2026-10-15
con orden de Morton + permutacion compartida: 0,63-0,75 en los 8 pares del catalogo."""


def test_thermal_amplitude_formula():
    b = np.array([8 * math.pi ** 2, 0.0, -5.0, 4 * 8 * math.pi ** 2])
    assert np.allclose(clouds.thermal_amplitude(b), [1.0, 0.0, 0.0, 2.0])


def test_roundtrip_synthetic():
    rng = np.random.default_rng(1)
    c = clouds.synthetic_torus(4096, rng)
    unit, radius, _ = clouds.normalize(c.xyz)
    pad = np.zeros(len(unit), bool)
    pad[-10:] = True
    blob = clouds.encode(unit, c.u, c.cls, pad, {"pdbId": "TORUS", "radiusA": radius})
    assert (12 + int.from_bytes(blob[8:12], "little")) % 8 == 0  # payload aligned for typed-array views
    header, rec = clouds.decode(blob)
    assert header["points"] == 4096 and header["recordBytes"] == 8
    back = np.stack([rec["x"], rec["y"], rec["z"]], 1) / 32767
    assert np.abs(back - unit).max() < 1.0 / 32767 + 1e-9
    assert np.abs(rec["amp"] * clouds.AMP_STEP_A - np.clip(c.u, 0, 2.55)).max() <= clouds.AMP_STEP_A / 2 + 1e-9
    assert ((rec["cls"] & clouds.PAD_FLAG) > 0).sum() == 10
    assert (len(blob) - 12 - int.from_bytes(blob[8:12], "little")) == 4096 * 8


def test_subsample_pads_small_structures_with_duplicates_only():
    rng = np.random.default_rng(2)
    idx, pad = clouds.subsample(100, 1000, rng)
    assert len(idx) == 1000 and pad.sum() == 900
    assert set(idx[:100]) == set(range(100))  # every real atom appears once before padding
    idx2, pad2 = clouds.subsample(5000, 1000, rng)
    assert len(set(idx2)) == 1000 and not pad2.any()


def test_shared_order_pairs_better_than_random():
    rng = np.random.default_rng(3)
    a = clouds.normalize(clouds.synthetic_torus(8000, rng).xyz)[0]
    b = clouds.normalize(rng.normal(size=(8000, 3)) * [3, 1, 1])[0]
    perm = np.random.default_rng(4).permutation(8000)
    a, b = a[clouds.canonical_order(a, perm)], b[clouds.canonical_order(b, perm)]
    rep = clouds.pairing_report(a, b, np.random.default_rng(5))
    assert rep["ratio"] < MAX_PAIR_RATIO


def test_prefix_is_uniform_subsample():
    """Cualquier prefijo es una submuestra uniforme: el presupuesto por dispositivo = k puntos."""
    rng = np.random.default_rng(6)
    unit = clouds.normalize(rng.normal(size=(20000, 3)))[0]
    perm = np.random.default_rng(7).permutation(20000)
    ordered = unit[clouds.canonical_order(unit, perm)]
    for k in (2000, 5000):
        assert np.abs(ordered[:k].mean(0)).max() < 0.05
        assert abs(np.linalg.norm(ordered[:k], axis=1).mean() - np.linalg.norm(unit, axis=1).mean()) < 0.02


# ---- data/stage/ ----------------------------------------------------------------------------

def _index():
    p = STAGE / "index.json"
    if not p.exists():
        pytest.fail("data/stage/index.json no existe: python -m alphagenome_platform.stage.clouds")
    return json.loads(p.read_text(encoding="utf-8"))


def test_stage_catalog_complete_and_sealed():
    idx = _index()
    assert idx["format"] == "AGSC" and idx["formatVersion"] == clouds.FORMAT_VERSION
    assert 6 <= len(idx["structures"]) <= 8
    files = {p.name for p in STAGE.glob("*.agsc")}
    assert files == {e["file"] for e in idx["structures"]}, "archivos .agsc sin indexar o faltantes"
    for e in idx["structures"]:
        prov = e["provenance"]
        assert prov["source"] == "rcsb-pdb", e["id"]
        for key in ("pdbId", "entryRevisionDate", "experimentalMethod", "resolutionA", "configHash",
                    "builtAt", "reader", "url", "license"):
            assert prov.get(key), f"{e['id']}: falta {key}"
        cite = prov["citation"]
        assert cite.get("title") and cite.get("year") and (cite.get("doi") or cite.get("pmid")), e["id"]
        blob = (STAGE / e["file"]).read_bytes()
        assert hashlib.sha256(blob).hexdigest()[:10] in e["file"], f"{e['id']}: hash del nombre no coincide"
        header, rec = clouds.decode(blob)
        assert header["pdbId"] == e["id"] and len(rec) == idx["points"]
        assert e["maxExtentA"] > 0 and e["radiusA"] > 0


def test_stage_byte_budget():
    idx = _index()
    total = 0
    for e in idx["structures"]:
        gz = clouds.gz_size((STAGE / e["file"]).read_bytes())
        assert gz <= MAX_GZ_PER_STRUCTURE, f"{e['id']}: {gz} B gz > {MAX_GZ_PER_STRUCTURE}"
        total += gz
    assert total <= MAX_GZ_CATALOG, f"catalogo {total} B gz > {MAX_GZ_CATALOG}"


def test_stage_pairing_does_not_explode():
    idx = _index()
    for pair, rep in idx["pairing"].items():
        assert rep["ratio"] < MAX_PAIR_RATIO, f"{pair}: {rep}"
        assert rep["midRadiusP95"] > 0.4, f"{pair}: la nube colapsa a mitad del morph {rep}"
