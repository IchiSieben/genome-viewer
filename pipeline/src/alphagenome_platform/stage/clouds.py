"""Nubes de puntos de estructuras reales del PDB, para el escenario (portada y narrativa).

Que es real y que no
--------------------
Cada punto es un atomo pesado con su posicion medida (archivo mmCIF de RCSB, datos CC0). La
agitacion que se dibuja sale del factor B de ese atomo: ``B = 8 pi^2 <u^2>``, asi que la
amplitud media cuadratica es ``u = sqrt(B / (8 pi^2))`` en angstrom. Es dato, no decoracion.
No hay dinamica molecular ni campos de fuerza; las transiciones entre moleculas son visuales.

Por que gemmi y no biopython
----------------------------
gemmi lee mmCIF en C++ (4UG0 tiene 218 776 atomos depositados y la capside de Zika expandida
pasa de 600 000), expande ensamblajes biologicos (``make_assembly``) y da el tipo de polimero
de cada entidad. Biopython (``MMCIFParser``) es Python puro, varias veces mas lento en esas
estructuras y no expande ensamblajes sin codigo propio. Se descarta.

Formato AGSC (hermano de AGSB, no una extension)
------------------------------------------------
AGSB guarda UN arreglo int16 de senal 1-D. Una nube son registros intercalados de 8 bytes por
punto, que el navegador sube tal cual a un buffer de GPU:

    [0:4]   magic b"AGSC"
    [4:8]   version uint32 LE
    [8:12]  longitud de la cabecera JSON uint32 LE
    [12:..] cabecera JSON utf-8, rellena con espacios hasta multiplo de 8
    [..]    N registros: x,y,z int16 LE | amp uint8 | clase uint8

Posiciones: centradas en el centroide y escaladas a radio maximo 1 -> ``round(v * 32767)``.
Amplitud: ``u`` en pasos de 0,01 A, recortada a 255 (2,55 A). Clase: 0 hebra 1 de ADN,
1 hebra 2, 2 proteina, 3 ARN, 4 otro; el bit 7 marca un punto de relleno (duplicado).

Emparejamiento de los morphs (resuelto aqui, offline)
-----------------------------------------------------
Todas las nubes tienen el mismo numero de puntos N. Cada nube se ordena por su codigo de
Morton (orden en Z sobre la caja unitaria) y despues se le aplica LA MISMA permutacion
aleatoria con semilla fija. Asi el punto i de cualquier nube corresponde al punto i de
cualquier otra (mismo rango espacial), y cualquier prefijo de longitud k es una submuestra
uniforme de las dos: el presupuesto por dispositivo es solo "cuantos puntos dibujo".
El navegador interpola, no empareja. Que el emparejamiento no "explota" se mide en
``pairing_report`` contra un emparejamiento aleatorio, y un test lo exige.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import gzip
import hashlib
import json
import math
import struct
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np

from alphagenome_platform.provenance import config_hash

MAGIC = b"AGSC"
FORMAT_VERSION = 1
AMP_STEP_A = 0.01
PAD_FLAG = 0x80
CLASSES = ("dna1", "dna2", "protein", "rna", "other")
RCSB_FILES = "https://files.rcsb.org/download/{id}.cif.gz"

CATALOG: list[dict[str, Any]] = [
    {"id": "1BNA", "role": "helix", "chapter": 1, "assembly": False},
    {"id": "4UG0", "role": "ribosome", "chapter": 2, "assembly": False},
    {"id": "1KX5", "role": "nucleosome", "chapter": 3, "assembly": False},
    {"id": "1CDW", "role": "tbp", "chapter": 4, "assembly": False},
    {"id": "5FLM", "role": "polymerase", "chapter": 5, "assembly": False},
    {"id": "5XJC", "role": "spliceosome", "chapter": 6, "assembly": False},
    {"id": "5KKQ", "role": "ctcf", "chapter": 7, "assembly": False},
    {"id": "5IRE", "role": "virus", "chapter": 0, "assembly": True},
]
"""Catalogo elegido (docs/10-estructuras.md tiene la razon de cada uno y lo descartado)."""

DEFAULT_POINTS = 20_000
DEFAULT_SEED = 20261015


@dataclasses.dataclass
class Cloud:
    """Una nube ya submuestreada, en coordenadas fisicas (angstrom)."""

    pdb_id: str
    xyz: np.ndarray  # (n, 3) float64, angstrom
    u: np.ndarray  # (n,) amplitud termica RMS en angstrom
    cls: np.ndarray  # (n,) uint8, indice en CLASSES
    meta: dict[str, Any]


# ---- lectura ------------------------------------------------------------------------------

def fetch(pdb_id: str, cache: Path) -> Path:
    """Descarga el mmCIF de RCSB una sola vez (cache en data/raw/, fuera de git)."""
    cache.mkdir(parents=True, exist_ok=True)
    dst = cache / f"{pdb_id.lower()}.cif.gz"
    if not dst.exists() or dst.stat().st_size == 0:
        with urllib.request.urlopen(RCSB_FILES.format(id=pdb_id), timeout=120) as r:
            dst.write_bytes(r.read())
    return dst


def _first(block, tag: str) -> str | None:
    v = block.find_value(tag)
    if v is None or v in ("?", "."):
        return None
    import gemmi

    return gemmi.cif.as_string(v)


def entry_meta(path: Path) -> dict[str, Any]:
    """Metadatos de la propia entrada: metodo, resolucion, fecha de revision y cita primaria."""
    import gemmi

    block = gemmi.cif.read(str(path)).sole_block()
    revs = [gemmi.cif.as_string(x) for x in block.find_loop("_pdbx_audit_revision_history.revision_date")]
    cite: dict[str, Any] = {}
    tab = block.find("_citation.", ["id", "title", "journal_abbrev", "year",
                                     "?pdbx_database_id_DOI", "?pdbx_database_id_PubMed"])
    for row in tab:
        if gemmi.cif.as_string(row[0]) == "primary":
            cite = {
                "title": gemmi.cif.as_string(row[1]),
                "journal": gemmi.cif.as_string(row[2]),
                "year": gemmi.cif.as_string(row[3]),
                "doi": gemmi.cif.as_string(row[4]) if row.has(4) and row[4] not in ("?", ".") else None,
                "pmid": gemmi.cif.as_string(row[5]) if row.has(5) and row[5] not in ("?", ".") else None,
            }
    authors = [gemmi.cif.as_string(r[1]) for r in block.find("_citation_author.", ["citation_id", "name"])
               if gemmi.cif.as_string(r[0]) == "primary"]
    if authors:
        cite["firstAuthor"] = authors[0]
    res = _first(block, "_refine.ls_d_res_high") or _first(block, "_em_3d_reconstruction.resolution")
    return {
        "title": _first(block, "_struct.title"),
        "method": _first(block, "_exptl.method"),
        "resolutionA": float(res) if res else None,
        "revisionDate": max(revs) if revs else None,
        "citation": cite,
    }


def read_atoms(path: Path, assembly: bool) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict[str, Any]]:
    """Atomos pesados (sin H, sin agua) con su factor B y su clase de color."""
    import gemmi

    st = gemmi.read_structure(str(path))
    st.setup_entities()
    st.remove_hydrogens()
    st.remove_waters()
    model = st[0]
    asm_note = None
    if assembly and st.assemblies:
        model = gemmi.make_assembly(st.assemblies[0], model, gemmi.HowToNameCopiedChain.Short)
        asm_note = f"assembly {st.assemblies[0].name}"
    # Hebra de ADN: el orden de las cadenas de ADN alterna hebra 1 / hebra 2 (1BNA: A/B,
    # 1KX5: I/J, 1CDW: B/C). Con mas de dos cadenas de ADN el par sigue alternando.
    dna_seen = 0
    xyz, b, cls = [], [], []
    for chain in model:
        poly = chain.get_polymer()
        ptype = poly.check_polymer_type() if len(poly) else gemmi.PolymerType.Unknown
        if ptype in (gemmi.PolymerType.Dna,):
            c = dna_seen % 2
            dna_seen += 1
        elif ptype in (gemmi.PolymerType.Rna, gemmi.PolymerType.DnaRnaHybrid):
            c = 3
        elif ptype in (gemmi.PolymerType.PeptideL, gemmi.PolymerType.PeptideD):
            c = 2
        else:
            c = 4
        for res in chain:
            # ligandos sueltos dentro de una cadena polimerica cuentan como "otro"
            rc = c if (c == 4 or res.het_flag != "H") else 4
            for at in res:
                if at.altloc not in ("\0", "A"):
                    continue
                xyz.append((at.pos.x, at.pos.y, at.pos.z))
                b.append(at.b_iso)
                cls.append(rc)
    xyz_a = np.asarray(xyz, dtype=np.float64)
    b_a = np.asarray(b, dtype=np.float64)
    info = {"heavyAtoms": int(len(xyz_a)), "assembly": asm_note,
            "bIsoMean": float(b_a.mean()) if len(b_a) else None,
            "bIsoStd": float(b_a.std()) if len(b_a) else None}
    return xyz_a, b_a, np.asarray(cls, dtype=np.uint8), info


# ---- submuestreo, orden y emparejamiento --------------------------------------------------

def thermal_amplitude(b_iso: np.ndarray) -> np.ndarray:
    """u = sqrt(B / (8 pi^2)) en angstrom; B negativo o cero -> 0."""
    return np.sqrt(np.clip(b_iso, 0.0, None) / (8.0 * math.pi ** 2))


def subsample(n_atoms: int, n_points: int, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """Indices de atomos a usar y mascara de relleno.

    Con mas atomos que puntos: muestra uniforme sin reemplazo. Con menos (1BNA tiene ~490
    atomos pesados): todos los atomos una vez y el resto son duplicados marcados como relleno,
    que el shader dibuja con baja opacidad. Un duplicado se superpone a su original: no
    inventa una posicion.
    """
    if n_atoms >= n_points:
        return np.sort(rng.choice(n_atoms, size=n_points, replace=False)), np.zeros(n_points, bool)
    extra = rng.choice(n_atoms, size=n_points - n_atoms, replace=True)
    idx = np.concatenate([np.arange(n_atoms), extra])
    pad = np.concatenate([np.zeros(n_atoms, bool), np.ones(n_points - n_atoms, bool)])
    return idx, pad


def normalize(xyz: np.ndarray) -> tuple[np.ndarray, float, list[float]]:
    """Centra en el centroide y escala a radio maximo 1. Devuelve el radio en angstrom y la
    extension (max - min) por eje, que es lo que usa el viaje de escalas."""
    c = xyz.mean(axis=0)
    centered = xyz - c
    radius = float(np.sqrt((centered ** 2).sum(axis=1)).max())
    extent = (xyz.max(axis=0) - xyz.min(axis=0)).tolist()
    return centered / radius, radius, [float(e) for e in extent]


def morton_key(unit_xyz: np.ndarray, bits: int = 10) -> np.ndarray:
    """Codigo de Morton (orden Z) de puntos en [-1, 1]^3, 10 bits por eje."""
    q = np.clip(((unit_xyz + 1.0) * 0.5 * ((1 << bits) - 1)).round(), 0, (1 << bits) - 1).astype(np.uint64)
    key = np.zeros(len(q), dtype=np.uint64)
    for bit in range(bits):
        for axis in range(3):
            key |= ((q[:, axis] >> np.uint64(bit)) & np.uint64(1)) << np.uint64(3 * bit + axis)
    return key


def canonical_order(unit_xyz: np.ndarray, permutation: np.ndarray) -> np.ndarray:
    """Indices que ordenan la nube por rango de Morton y aplican la permutacion compartida."""
    by_rank = np.argsort(morton_key(unit_xyz), kind="stable")
    return by_rank[permutation]


def pairing_report(a: np.ndarray, b: np.ndarray, rng: np.random.Generator) -> dict[str, float]:
    """Distancia media emparejada contra la de un emparejamiento aleatorio (unidades de la caja).

    Un emparejamiento que "explota" en el morph se parece al aleatorio: a mitad de camino los
    puntos cruzan la caja entera. El cociente tiene que ser claramente menor que 1.
    """
    d_pair = float(np.linalg.norm(a - b, axis=1).mean())
    d_rand = float(np.linalg.norm(a - b[rng.permutation(len(b))], axis=1).mean())
    mid = 0.5 * (a + b)
    return {"meanPairDist": round(d_pair, 4), "meanRandomDist": round(d_rand, 4),
            "ratio": round(d_pair / d_rand, 4),
            "midRadiusP95": round(float(np.percentile(np.linalg.norm(mid, axis=1), 95)), 4)}


# ---- binario ---------------------------------------------------------------------------------

def encode(unit_xyz: np.ndarray, u: np.ndarray, cls: np.ndarray, pad: np.ndarray, header: dict) -> bytes:
    n = len(unit_xyz)
    rec = np.zeros(n, dtype=[("x", "<i2"), ("y", "<i2"), ("z", "<i2"), ("amp", "u1"), ("cls", "u1")])
    q = np.clip(np.round(unit_xyz * 32767), -32767, 32767).astype("<i2")
    rec["x"], rec["y"], rec["z"] = q[:, 0], q[:, 1], q[:, 2]
    rec["amp"] = np.clip(np.round(u / AMP_STEP_A), 0, 255).astype(np.uint8)
    rec["cls"] = cls.astype(np.uint8) | np.where(pad, PAD_FLAG, 0).astype(np.uint8)
    head = json.dumps(dict(header, points=n, recordBytes=8), sort_keys=True,
                      separators=(",", ":")).encode("utf-8")
    head += b" " * ((-(12 + len(head))) % 8)
    return MAGIC + struct.pack("<II", FORMAT_VERSION, len(head)) + head + rec.tobytes()


def decode(blob: bytes) -> tuple[dict, np.ndarray]:
    if blob[:4] != MAGIC:
        raise ValueError(f"No es un bloque AGSC: magic={blob[:4]!r}")
    version, hlen = struct.unpack("<II", blob[4:12])
    if version != FORMAT_VERSION:
        raise ValueError(f"Version AGSC desconocida: {version}")
    header = json.loads(blob[12:12 + hlen].decode("utf-8"))
    rec = np.frombuffer(blob[12 + hlen:], dtype=[("x", "<i2"), ("y", "<i2"), ("z", "<i2"),
                                                 ("amp", "u1"), ("cls", "u1")])
    if len(rec) != header["points"]:
        raise ValueError("AGSC truncado")
    return header, rec


def gz_size(blob: bytes) -> int:
    return len(gzip.compress(blob, compresslevel=9, mtime=0))


# ---- construccion del catalogo -----------------------------------------------------------

def synthetic_torus(n_points: int, rng: np.random.Generator) -> Cloud:
    """Toro de puntos con amplitudes inventadas. Solo para tests e integracion: sellado como
    ``synthetic`` y bloqueado por la compuerta de proveniencia antes de llegar al dist."""
    t = rng.uniform(0, 2 * math.pi, n_points)
    p = rng.uniform(0, 2 * math.pi, n_points)
    xyz = np.stack([(30 + 10 * np.cos(p)) * np.cos(t), (30 + 10 * np.cos(p)) * np.sin(t), 10 * np.sin(p)], 1)
    return Cloud("TORUS", xyz, rng.uniform(0.2, 1.2, n_points), (np.arange(n_points) % 3).astype(np.uint8),
                 {"title": "synthetic torus", "method": None, "resolutionA": None, "revisionDate": None,
                  "citation": {}})


def build(out_dir: Path, cache: Path, n_points: int = DEFAULT_POINTS, seed: int = DEFAULT_SEED,
          catalog: list[dict] | None = None, now: str | None = None) -> dict[str, Any]:
    """Construye data/stage/: un .agsc por estructura (nombre con hash) + index.json sellado."""
    import gemmi

    catalog = catalog or CATALOG
    config = {"catalog": catalog, "points": n_points, "seed": seed, "format": FORMAT_VERSION,
              "ampStepA": AMP_STEP_A, "ordering": "morton10+shared-permutation"}
    chash = config_hash(config)
    stamp = now or dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    perm = np.random.default_rng(seed).permutation(n_points)
    out_dir.mkdir(parents=True, exist_ok=True)
    entries, units = [], {}
    for item in catalog:
        pid = item["id"]
        path = fetch(pid, cache)
        meta = entry_meta(path)
        xyz, b_iso, cls, info = read_atoms(path, item.get("assembly", False))
        rng = np.random.default_rng([seed, int.from_bytes(pid.encode(), "little")])
        idx, pad = subsample(len(xyz), n_points, rng)
        unit, radius, extent = normalize(xyz[idx])
        order = canonical_order(unit, perm)
        unit, u, c, pad = unit[order], thermal_amplitude(b_iso[idx])[order], cls[idx][order], pad[order]
        counts = {CLASSES[k]: int(((c == k) & ~pad).sum()) for k in range(len(CLASSES))}
        header = {"pdbId": pid, "radiusA": round(radius, 3), "extentA": [round(e, 2) for e in extent],
                  "ampStepA": AMP_STEP_A, "classes": list(CLASSES), "padFlag": PAD_FLAG}
        blob = encode(unit, u, c, pad, header)
        digest = hashlib.sha256(blob).hexdigest()[:10]
        name = f"{pid.lower()}.{digest}.agsc"
        for old in out_dir.glob(f"{pid.lower()}.*.agsc"):
            if old.name != name:
                old.unlink()
        (out_dir / name).write_bytes(blob)
        units[pid] = unit
        entries.append({
            "id": pid, "role": item["role"], "chapter": item["chapter"], "file": name,
            "bytes": len(blob), "bytesGz": gz_size(blob), "points": n_points,
            "paddedPoints": int(pad.sum()), "classCounts": counts,
            "radiusA": round(radius, 3), "extentA": [round(e, 2) for e in extent],
            "maxExtentA": round(max(extent), 2),
            "thermal": {"uMeanA": round(float(u[~pad].mean()), 3), "uP95A": round(float(np.percentile(u[~pad], 95)), 3),
                        "bIsoMean": round(info["bIsoMean"], 2), "bIsoStd": round(info["bIsoStd"], 2)},
            "heavyAtoms": info["heavyAtoms"], "assembly": info["assembly"],
            "provenance": {
                "source": "rcsb-pdb", "pdbId": pid, "url": f"https://www.rcsb.org/structure/{pid}",
                "entryRevisionDate": meta["revisionDate"], "experimentalMethod": meta["method"],
                "resolutionA": meta["resolutionA"], "title": meta["title"], "citation": meta["citation"],
                "configHash": chash, "builtAt": stamp, "reader": f"gemmi {gemmi.__version__}",
                "license": "CC0 1.0 (RCSB PDB data)",
            },
        })
    rng = np.random.default_rng(seed + 1)
    ids = [e["id"] for e in entries]
    pairing = {f"{a}>{b}": pairing_report(units[a], units[b], rng) for a, b in zip(ids, ids[1:] + ids[:1])}
    index = {"format": "AGSC", "formatVersion": FORMAT_VERSION, "configHash": chash, "builtAt": stamp,
             "points": n_points, "seed": seed, "ordering": config["ordering"], "classes": list(CLASSES),
             "structures": entries, "pairing": pairing,
             "totalBytesGz": sum(e["bytesGz"] for e in entries)}
    (out_dir / "index.json").write_text(json.dumps(index, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return index


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Nubes de puntos del escenario desde mmCIF de RCSB")
    ap.add_argument("--out", default="data/stage")
    ap.add_argument("--cache", default="data/raw/pdb")
    ap.add_argument("--points", type=int, default=DEFAULT_POINTS)
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    a = ap.parse_args(argv)
    idx = build(Path(a.out), Path(a.cache), a.points, a.seed)
    for e in idx["structures"]:
        print(f"{e['id']}  {e['heavyAtoms']:>7} atoms  pad {e['paddedPoints']:>5}  "
              f"{e['bytesGz'] / 1024:6.1f} KiB gz  extent {e['maxExtentA']:7.1f} A  {e['provenance']['experimentalMethod']}")
    print(f"total {idx['totalBytesGz'] / 1024:.1f} KiB gz")
    for k, v in idx["pairing"].items():
        print(f"pair {k}: ratio {v['ratio']}  midR95 {v['midRadiusP95']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
