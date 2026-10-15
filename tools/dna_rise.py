#!/usr/bin/env python3
"""dna_rise.py — axial rise per base pair measured on PDB 1BNA, and what it implies.

    python tools/dna_rise.py      # needs data/raw/pdb/1bna.cif.gz (the stage pipeline caches it)

Each base pair is represented by the midpoint of its two C1' atoms; the helix axis is the first
principal component of those 12 centres (the dodecamer is slightly bent, so this is the mean
axis). Rise = axial span between the second and eleventh pairs / 9 steps (terminal pairs fray).
A phosphate-based version was tried first and discarded: P atoms sit off-axis and the per-step
projection was too noisy (IQR 1.8-4.6 A). Output: docs/evidence/dna-rise.json.

Then: DNA length of one diploid human cell = rise x 2 x 3 055 000 000 bp (T2T-CHM13, Nurk 2022;
a female diploid nucleus; the Y chromosome is not in CHM13). It is our arithmetic, labelled so.
"""
import json
from pathlib import Path

import gemmi
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
st = gemmi.read_structure(str(ROOT / "data/raw/pdb/1bna.cif.gz"))
model = st[0]
chains = [ch for ch in model if len([r for r in ch if r.find_atom("C1'", "*")]) >= 10]
a, b = chains[0], chains[1]
c1a = [np.array(r.find_atom("C1'", "*").pos.tolist()) for r in a if r.find_atom("C1'", "*")]
c1b = [np.array(r.find_atom("C1'", "*").pos.tolist()) for r in b if r.find_atom("C1'", "*")]
n = min(len(c1a), len(c1b))
# Watson-Crick pairing in the dodecamer: residue i of strand A with residue n-1-i of strand B.
centers = np.array([(c1a[i] + c1b[n - 1 - i]) / 2 for i in range(n)])
c = centers.mean(0)
axis = np.linalg.svd(centers - c)[2][0]
proj = (centers - c) @ axis
if proj[-1] < proj[0]:
    proj = -proj
inner = proj[1:-1]   # terminal pairs fray: dropped
steps = np.diff(inner)
rise = float((inner[-1] - inner[0]) / (len(inner) - 1))
bp_haploid = 3_055_000_000
length_m = rise * 1e-10 * 2 * bp_haploid
out = {"pdb": "1BNA", "method": "base-pair centres (midpoint of paired C1' atoms), axis = PCA of the centres; rise = axial span of the 10 inner pairs / 9 steps",
       "steps": int(len(steps)), "riseA": round(rise, 3), "stepMinA": round(float(steps.min()), 3), "stepMaxA": round(float(steps.max()), 3),
       "diploidBp": 2 * bp_haploid, "diploidLengthM": round(length_m, 2),
       "command": "python tools/dna_rise.py"}
(ROOT / "docs/evidence").mkdir(parents=True, exist_ok=True)
(ROOT / "docs/evidence/dna-rise.json").write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
print(json.dumps(out, indent=1))
