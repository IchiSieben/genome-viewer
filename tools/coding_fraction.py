#!/usr/bin/env python3
"""coding_fraction.py — protein-coding fraction of the human genome, COMPUTED from GENCODE.

    python tools/coding_fraction.py            # downloads GENCODE 50 (124 MB, cached in data/raw/)

The narrative never cites "1-2 %": it computes it, and declares how the answer moves with the
method. Every number is the size of a UNION of intervals (isoforms merged per strand-agnostic
base), so a base covered by ten transcripts counts once.

Methods (all on GRCh38 primary chromosomes chr1-22, X, Y, M; GENCODE 50 comprehensive):
  cds_all        CDS of every transcript                        -> the point estimate
  cds_basic      CDS of transcripts tagged "basic"              -> lower edge candidate
  cds_mane       CDS of MANE Select transcripts                 -> lower edge candidate
  exons_pc       all exons (UTRs included) of protein-coding transcripts -> reported apart: a UTR is
                 transcribed but not coding, so it is NOT an edge of the coding range

Denominators (the second axis of the range):
  grch38_primary  sum of chromosome lengths of the primary assembly (the GTF header has no sizes,
                  so the UCSC hg38 chrom sizes are embedded below, chr1-22,X,Y,M)
  t2t_chm13       3 055 000 000 bp (Nurk 2022, "3.055 billion-base pair"), the complete sequence

Output: docs/evidence/coding-fraction.json with every combination, the point estimate
(cds_all / grch38_primary) and the declared range (min..max over the CDS methods x denominators).
"""
from __future__ import annotations

import datetime as dt
import gzip
import json
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_50/gencode.v50.annotation.gtf.gz"
CACHE = ROOT / "data" / "raw" / "gencode" / "gencode.v50.annotation.gtf.gz"
OUT = ROOT / "docs" / "evidence" / "coding-fraction.json"

# UCSC hg38.chrom.sizes, primary chromosomes (GRCh38.p14 primary assembly lengths).
HG38 = {
    "chr1": 248956422, "chr2": 242193529, "chr3": 198295559, "chr4": 190214555, "chr5": 181538259,
    "chr6": 170805979, "chr7": 159345973, "chr8": 145138636, "chr9": 138394717, "chr10": 133797422,
    "chr11": 135086622, "chr12": 133275309, "chr13": 114364328, "chr14": 107043718, "chr15": 101991189,
    "chr16": 90338345, "chr17": 83257441, "chr18": 80373285, "chr19": 58617616, "chr20": 64444167,
    "chr21": 46709983, "chr22": 50818468, "chrX": 156040895, "chrY": 57227415, "chrM": 16569,
}
DENOMINATORS = {
    "grch38_primary": sum(HG38.values()),
    "t2t_chm13": 3_055_000_000,
}


def union_length(intervals: dict[str, list[tuple[int, int]]]) -> int:
    total = 0
    for chrom, ivs in intervals.items():
        ivs.sort()
        cur_s, cur_e = None, None
        for s, e in ivs:
            if cur_e is None or s > cur_e + 1:
                if cur_e is not None:
                    total += cur_e - cur_s + 1
                cur_s, cur_e = s, e
            elif e > cur_e:
                cur_e = e
        if cur_e is not None:
            total += cur_e - cur_s + 1
    return total


def main() -> int:
    if not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {URL}", flush=True)
        urllib.request.urlretrieve(URL, CACHE)
    sets = {k: defaultdict(list) for k in ("cds_all", "cds_basic", "cds_mane", "exons_pc")}
    release = None
    with gzip.open(CACHE, "rt", encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#"):
                if "description" in line or "version" in line:
                    release = (release or "") + line.strip("#! \n") + "; "
                continue
            f = line.rstrip("\n").split("\t")
            chrom, feature, start, end, attrs = f[0], f[2], int(f[3]), int(f[4]), f[8]
            if chrom not in HG38:
                continue
            iv = (start, end)
            if feature == "CDS":
                sets["cds_all"][chrom].append(iv)
                if 'tag "basic"' in attrs:
                    sets["cds_basic"][chrom].append(iv)
                if 'tag "MANE_Select"' in attrs:
                    sets["cds_mane"][chrom].append(iv)
            elif feature == "exon" and 'transcript_type "protein_coding"' in attrs:
                sets["exons_pc"][chrom].append(iv)
    lengths = {k: union_length(v) for k, v in sets.items()}
    table = {m: {d: round(100 * n / den, 3) for d, den in DENOMINATORS.items()} for m, n in lengths.items()}
    point = table["cds_all"]["grch38_primary"]
    cds_values = [table[m][d] for m in ("cds_all", "cds_basic", "cds_mane") for d in DENOMINATORS]
    out = {
        "computedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "source": URL, "gencodeRelease": 50, "gtfHeader": release,
        "command": "python tools/coding_fraction.py",
        "unionBases": lengths, "denominators": DENOMINATORS, "percent": table,
        "pointPct": point,  # 3 decimals: the pages round once, per register
        "pointMethod": "union of all GENCODE 50 CDS / GRCh38 primary assembly length",
        "rangePct": [min(cds_values), max(cds_values)],
        "rangeMethod": "min..max of the CDS union (MANE Select, basic, all) over each denominator (GRCh38 primary, T2T-CHM13)",
        "exonsPct": table["exons_pc"]["grch38_primary"],
        "exonsMethod": "all exons of protein-coding transcripts, UTRs included, / GRCh38 primary: transcribed into mRNA, not all coding",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    print(json.dumps({k: out[k] for k in ("unionBases", "pointPct", "rangePct")}, indent=1))
    for m, row in table.items():
        print(f"{m:10s} " + "  ".join(f"{d}={v:.3f}%" for d, v in row.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
