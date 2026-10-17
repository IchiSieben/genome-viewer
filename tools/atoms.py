"""All heavy atoms of a PDB entry, with a meaning code per atom, for the identity mockup (phase B).

Output: <out>/<id>.atoms.bin + <id>.atoms.json
  bin: N records of 8 bytes: x, y, z int16 LE (centred, scaled to radius 1 -> *32767) | code u8 | chain u8
  json: header (pdbId, atoms, radiusA, codes, chains with entity type, provenance)

Codes (the colour carries meaning, not decoration):
  0 A, 1 C, 2 G, 3 T, 4 U       nucleobase atoms, by base
  5 DNA backbone, 6 RNA backbone (sugar-phosphate)
  7 protein (colour by chain index in the shader)
  8 other (ligands, ions); waters and hydrogens are dropped
"""
from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path

import gemmi
import numpy as np

BASES = {"DA": 0, "DC": 1, "DG": 2, "DT": 3, "A": 0, "C": 1, "G": 2, "U": 4}
BACKBONE = {"P", "OP1", "OP2", "OP3", "O5'", "C5'", "C4'", "O4'", "C3'", "O3'", "C2'", "O2'", "C1'"}
DNA_RES = {"DA", "DC", "DG", "DT"}
RNA_RES = {"A", "C", "G", "U"}


def extract(cif: Path, assembly: bool = False) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict]:
    st = gemmi.read_structure(str(cif))
    st.setup_entities()
    st.remove_hydrogens()
    st.remove_waters()
    model = st[0]
    if assembly and st.assemblies:
        model = gemmi.make_assembly(st.assemblies[0], model, gemmi.HowToNameCopiedChain.AddNumber)
    xyz, code, chain = [], [], []
    chains: list[dict] = []
    for ci, ch in enumerate(model):
        kinds = set()
        for res in ch:
            name = res.name.strip()
            is_dna, is_rna = name in DNA_RES, name in RNA_RES
            if is_dna:
                kinds.add("dna")
            elif is_rna:
                kinds.add("rna")
            elif gemmi.find_tabulated_residue(name) and gemmi.find_tabulated_residue(name).is_amino_acid():
                kinds.add("protein")
            for at in res:
                if at.altloc not in ("\0", "A"):
                    continue
                if is_dna or is_rna:
                    c = (5 if is_dna else 6) if at.name in BACKBONE else BASES[name]
                elif "protein" in kinds and gemmi.find_tabulated_residue(name) and gemmi.find_tabulated_residue(name).is_amino_acid():
                    c = 7
                else:
                    c = 8
                xyz.append((at.pos.x, at.pos.y, at.pos.z))
                code.append(c)
                chain.append(min(ci, 255))
        chains.append({"name": ch.name, "kinds": sorted(kinds)})
    return np.asarray(xyz, np.float64), np.asarray(code, np.uint8), np.asarray(chain, np.uint8), {"chains": chains, "title": (st.info["_struct.title"] if "_struct.title" in st.info else "")}


def write(pdb_id: str, xyz: np.ndarray, code: np.ndarray, chain: np.ndarray, meta: dict, out: Path) -> dict:
    c = xyz.mean(axis=0)
    p = xyz - c
    r = float(np.sqrt((p ** 2).sum(axis=1)).max())
    q = np.round(p / r * 32767).astype(np.int16)
    rec = np.zeros(len(q), dtype=[("x", "<i2"), ("y", "<i2"), ("z", "<i2"), ("code", "u1"), ("chain", "u1")])
    rec["x"], rec["y"], rec["z"], rec["code"], rec["chain"] = q[:, 0], q[:, 1], q[:, 2], code, chain
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{pdb_id.lower()}.atoms.bin").write_bytes(rec.tobytes())
    counts = {k: int((code == v).sum()) for k, v in {"A": 0, "C": 1, "G": 2, "T": 3, "U": 4, "dnaBackbone": 5, "rnaBackbone": 6, "protein": 7, "other": 8}.items()}
    head = {"pdbId": pdb_id, "atoms": int(len(q)), "radiusA": round(r, 2), "recordBytes": 8, "counts": counts, **meta}
    (out / f"{pdb_id.lower()}.atoms.json").write_text(json.dumps(head, ensure_ascii=False, indent=1), encoding="utf-8")
    return head


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="+")
    ap.add_argument("--cache", default="data/raw/pdb")
    ap.add_argument("--out", required=True)
    ap.add_argument("--assembly", action="store_true")
    a = ap.parse_args()
    for pid in a.ids:
        f = Path(a.cache) / f"{pid.lower()}.cif.gz"
        xyz, code, chain, meta = extract(f, a.assembly)
        h = write(pid.upper(), xyz, code, chain, meta, Path(a.out))
        print(pid, h["atoms"], "atoms", h["counts"], f"r={h['radiusA']} A")
