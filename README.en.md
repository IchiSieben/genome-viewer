[Español](README.md)

# Genome Viewer

*Unofficial. What a variant does to the genome, predicted.*

The name avoids Google's **AlphaGenome** trademark in a product name;
AlphaGenome is still named as the data source.

![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-1.48-2EAD33?logo=playwright&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-1f5fd0)
![static](https://img.shields.io/badge/static-0%20API%20calls-6f7c8a)

**Live:** <https://ichisieben.dev/genome-viewer/> ·
<https://ichisieben.dev/genome-viewer/es/> (Spanish)

This is a beta. In this first upload it ships with `noindex`: it does not
show up in search engines yet.

---

## What it is

On September 8, 2026, Google DeepMind released the **AlphaGenome Atlas**:
precomputed effect predictions for ~9 billion human genome variants, with a
summary score (**AVI**) and its SHAP attributions.

The official visualization library draws **static matplotlib images**. This
project is an interactive browser viewer for those same results.

What makes this worth building as an engineering piece isn't calling a new
API. It's that the result is a full chain: a pipeline with sealed
provenance, a versioned and validated data contract, a byte budget defended
with tests, and a presentation layer that respects a real deployment
constraint.

## Status

| Milestone | What it is | Status |
|---|---|---|
| H0 | Access verification | **Done** — 39 calls; all 18 AVI features resolved |
| H1 | Data contract and fixtures | **Done** — 7 schemas, 86 artifacts, 51 tests |
| H2 | Pipeline scaffold | **Done** — resumable acquisition, sealed provenance |
| H3 | Views V1 and V2 | **Done** — both themes, responsive, clean console |
| H4 | Real data for three loci | **Done** — PPP1R1A/PDE1B, RASGEF1B, RPL13A |
| H5 | V3, track browser | **Done** — canvas and SVG, zoom, dual resolution |
| H6 | Deployment | **Done** — [live](https://ichisieben.dev/genome-viewer/) |
| N1 | Saturation map | **Done** — 512 positions × 3 alternates |
| N2 | Cross-linking between views | **Done** |
| N3 | State in the URL | **Done** — locus, variant, view, tracks and zoom |
| i18n | Spanish and English, no framework | **Done** — see [`docs/08-i18n.md`](docs/08-i18n.md) |
| Identity | Mark from the visualization, motion, OG images | **Done** — see [`docs/05-visual-audit.md`](docs/05-visual-audit.md) |
| Narrative | Why, roadmap, how-it's-built and references pages | **Done** |
| N4, N6, N7 | — | Planned |
| H7 | Population study | **Pending** — a null result will be published too |

The data is **real**, from the Atlas API and the Model API. The synthetic
fixture generator still exists for developing without spending quota, and
whatever it produces is sealed `source: "synthetic"` and flagged in the web
UI with an amber band. Nothing synthetic is published.

## The three constraints that shape the architecture

1. **Shared hosting, no persistent processes.** The output is static files
   and nothing else.
2. **The API key is personal and non-transferable.** The web app **never**
   calls the API. The pipeline runs locally, freezes the results, and the
   web app only reads files. This isn't just a limitation: it makes the page
   instant and free of per-visitor quota cost.
3. **Non-commercial, research use.** Results are subject to the *AlphaGenome
   Output Terms of Use*, shown on every page with derived content. No
   clinical use, no medical-advice value.

Constraints 1 and 2 shape the whole thing:

```
pipeline/   Python, local, holds the key.  ->  data/dist/   frozen artifacts
                                                    |
                                              web/  reads files, zero network calls to Google
```

The two layers touch only through `contracts/v1/*.schema.json`.

## Languages

English at the root (`/genome-viewer/`, x-default) and Spanish at
`/genome-viewer/es/`, each its own HTML shell generated at build time. The
bundle is a single one; neither language pays for the other's dictionary.
`data/dist/` is left untouched: its prose is overridden by stable id from the
dictionary (option A), so the artifacts stay the frozen source of data. Full
detail, including what was measured and what was dropped, in
[`docs/08-i18n.md`](docs/08-i18n.md).

## Identity and motion

The mark comes from the visualization itself: four bars of different height
in the first four categorical colors, the same pattern that already lived in
the header. Per-language Open Graph images are generated at build time with
Playwright, from real data in the frozen `card.json` — not a mockup. Motion
respects `prefers-reduced-motion` (with that preference set, nothing
animates) and only animates `opacity`/`transform`, never layout; measured
CLS is 0. Full audit in
[`docs/05-visual-audit.md`](docs/05-visual-audit.md).

## How to run it

Without a key, which is the default path. **There's no bootstrap step**: the
clone already ships the whole `data/dist/` — contract JSON and signal
blocks — because it's real API output and, without a key, it can't be
regenerated.

```bash
python -m pip install -e "pipeline[dev]"
python -m alphagenome_platform.cli validate     # schema + budget

cd web && npm install && npm run dev            # http://localhost:5173
```

Synthetic fixtures are **not** that path. They're a quota-free development
tool — for touching the viewer without real data in front of you — and they
write to a separate tree, `data/fixtures/`, which is not versioned:

```bash
python -m alphagenome_platform.cli fixtures     # -> data/fixtures/, demo-* ids
```

The two worlds share neither directory nor names: every synthetic locus
carries the `demo-` prefix. They used to share both, and `fixtures` once
overwrote real artifacts that had cost quota. What this paragraph claims is
verified by `pipeline/tests/test_dos_mundos.py`, not just written here.

With a key, once you have one. It goes in `~/.env`, **never** in the
repository:

```bash
echo 'ALPHAGENOME_API_KEY="..."' >> ~/.env
python -m alphagenome_platform.cli probe        # ONE variant, completes H0
```

Real data, with the key in `~/.env`:

```bash
python -m alphagenome_platform.cli build-locus          # the whole catalog in loci.py
python -m alphagenome_platform.cli build-locus rpl13a   # just one
```

Build and verification:

```bash
PYTHONUTF8=1 PYTHONPATH=pipeline/src python -m pytest pipeline/tests -q   # 110 tests

cd web
npm run build           # also writes per-language shells, 404, sitemap,
                         # .htaccess, icons and OG images — needs Playwright's Chromium
AGP_NOINDEX=0 npm run build   # same build, without the beta's noindex

npm run verify         # 16 scenarios in Chromium, both themes, mobile width
npm run verify:links   # cross-linking and URL state
npm run measure        # time-to-interactive and per-frame cost

node scripts/measure-ab.mjs <baseline-dist> [rounds]   # A/B against a previous build
AGP_AB_LANG=es node scripts/measure-ab.mjs <baseline-dist>   # same A/B in Spanish
```

`npm run verify` serves the build **from a subfolder**, the way it's
deployed, and checks in a real browser that there are no console errors, no
failed requests, and **no request outside the host**. That last check is how
the "the web app never calls the API" rule gets verified.

## The views

**V1 — Variant card.** The AVI on its PHRED scale with interpretable marks
(10 = top 10%, 20 = top 1%, 30 = top 0.1%), the SHAP contribution waterfall
across the 18 features grouped into their four families, and the
most-affected tracks. The AVI attributions have been public for three days
and there was no visualization of them anywhere.

**V2 — Biosample × modality heatmap.** The effect across dozens of
biosamples, **grouped by organ system rather than alphabetically**: that way
a continuous band of color means a system-specific effect. Diverging scale
with zero as visually neutral and the domain clamped at the 98th
percentile, because using the max lets one extreme cell flatten everything
else.

**V3 — Track browser.** The flagship view. Predicted REF vs. ALT signal
along the locus, with gene/transcript annotation below and a real GRCh38
coordinate axis. Wheel to zoom, drag to pan, keyboard for everything. Below
an 8,192 bp window it switches to the 1 bp block only.

Canvas for the dense signal, SVG on top for axes, genes and interactive
zones. The drawing walks **pixels, not samples**: for every screen column it
takes the min and max of the samples that fall into it, so a narrow peak
doesn't vanish through subsampling and cost depends on pixel width, not
array size. The shaded area between the two lines, colored by sign, is
exactly what the variant does: two overlapping lines without that fill force
the eye to measure small vertical distances, which is exactly what the eye
is bad at.

**N1 — Saturation map.** For every position in a 512 bp window, the AVI of
all **three** possible alternate bases. It's the flagship plot of
deep-learning genomics and it didn't exist in a browser for AlphaGenome.
Motifs show up on their own, as contiguous columns of strong color. The
reference sequence isn't requested from any extra source: every variant
arrives as `chr:pos:REF>ALT`, so it's derived from the Atlas response
itself.

**Sequential** scale, not diverging, even though the visual system reserves
diverging for REF/ALT differences: the AVI measures impact, not direction,
and a diverging ramp would invent an axis the data doesn't have. The signed
raw score is still stored, in case another view wants it.

**V4** (splicing sashimi) and **V5** (contact-map diff) are built, each with
its own `predict_variant` call and its own ontology term: requesting them
alongside the signal tracks would use the locus's default biosamples, and in
a tissue where the variant doesn't act, the plot comes out symmetric without
anything failing.

In V5 the result is that **the 3D structure doesn't move**, and the view
says so with numbers instead of hiding it: the color domain is a contract
constant and doesn't auto-scale to the diff's range, so a 1.5% change in
structural relief shows up as what it is. The study panels (V6) already
render from the manifest.

## Decisions, with the discarded alternative

Full list in [`docs/01-architecture.md`](docs/01-architecture.md), each with
what was discarded and why. The three that most define the project:

- **No frontend framework.** Vite and TypeScript, no React or Astro, and
  **zero runtime dependencies**: the build weighs 28.4 kB of compressed JS,
  all seven views included. Astro was dropped because its real advantage
  (per-file pages) forces server-side rewriting, and the constraint is
  static files and nothing else.
- **Raw int16 in a custom binary block**, not base64 inside JSON. 2.00 bytes
  per value vs. 2.67, and no decoding in JS.
- **REF and DELTA are stored, not REF and ALT.** The initial hypothesis was
  that it would compress better. **It was measured and it was false**: gzip
  is 1.3% worse. The decision survives for a different, also-measured
  reason: storing the delta quantizes it against its own max and is
  **10× to 221× more precise** in the quantity the chart actually draws.

## Honesty, which is part of the design

- Every artifact seals origin, client version, UTC date, config hash and
  **calibration epoch**. AVI quantiles were recalibrated on 2026-06-18 and
  indel inference on 2026-07-14: comparing different harvests is invalid,
  and a PHRED value carries no marker of which one it came from. A test
  walks `data/dist/` and fails if anything is missing it.
- Fixtures are sealed `source: "synthetic"` and the web UI shows it. A
  figure made from invented data can't pass as a prediction.
- A study declares sample size, power, limitations and the sign of the
  result. The schema **does not allow** marking a study conclusive without
  measured power. A null result is shown with the same prominence as a
  positive one.

## What the real-data run corrected

**The seed variant in the context documents was flipped.** The correct
variant is `chr12:54578515:C>T`. The documents had it as `T>C`, and the
server rejects that with *"reference base does not match the expected
reference base: C"*. The alleles the Atlas knows at that position are A, G
and T. The pipeline **resolves every variant against the server before
using it** (`freeze/build_locus.py::resolve_variants`), instead of trusting
a literal.

The direction of the fix was also verified against the primary source. Per
PubMed, Zhu et al. 2026, *Genome Biol Evol* 18(8), PMID 42402195
([DOI](https://doi.org/10.1093/gbe/evag164)), table 2: for `rs884510` at
12:54578515 the **derived allele is C** and the **ancestral is T** (derived
frequency 0.25 in Peruvian Quechua vs. 0.42 in AMR). The GRCh38 reference
carries the derived allele, which is exactly what makes the notation
confusing: `C>T` describes the step *back* to ancestral. The allele with the
effect is the ancestral one — *"the ancestral Peruvian allele (T) was
associated with a 1.39 standard deviation decrease in [Hb]"*.

Two caveats from the same paper, so the finding isn't over-read:

- `rs884510` maps to the 3′ UTR of *PDE1B* and is **not** an eQTL of
  *PDE1B* or *PPP1R1A* in any tissue examined. The actual eQTLs are
  different SNPs: `rs10876566`, `rs7954532`, `rs2669406`.
- The association with [Hb] survives FDR correction in the **gene-level**
  test, not the SNP-level one. No single SNP passes multiple-testing
  correction on its own.

None of this changes what the viewer shows — the AVI knows nothing about
hemoglobin — but it is why this locus is in the catalog, and it's worth
citing where it can be checked.

**The 18 AVI features are no longer provisional.** They came out of a real
query and live in `pipeline/src/alphagenome_platform/avi.py` with their
family made explicit. An unknown name **raises**: better for the pipeline to
stop than for V1's waterfall to silently fall into the wrong family.

**The waterfall closes.** `base + Σ contributions = raw score`, with the
base value measured at **-0.049016** and a cross-variant spread of 3.5e-05.
A test checks it on every card.

## Main risk that's still live

**Ensembl REST is intermittent.** It returns 500s and times out frequently
for certain genes, PPP1R1A among them. Annotation is requested in chunks,
cached on disk, falls back from `lookup` to `overlap`, and **never blocks a
run**: a locus freezes with or without a gene track. Even so, rebuilding
from scratch at a bad moment can leave an incomplete track.

## Structure

```
contracts/v1/     JSON Schema. Normative source of the contract.
pipeline/         Python. Runs locally with the key. Never deployed.
  src/alphagenome_platform/
    quantize.py     int16 quantization and the AGSB binary format
    contract.py     schema validation and byte budget
    provenance.py   provenance seal
    fixtures.py     synthetic generator
    acquire/        resumable acquisition layer
  tests/          110 tests (includes i18n and the accent guard)
data/dist/        frozen artifacts. This is what gets deployed.
web/              static site. Vite + TypeScript, no framework.
  src/i18n/       es/en dictionaries, narrative, number formatting
  scripts/        build-shells, build-icons, verify, verify:links, measure, measure-ab
docs/             architecture decisions, i18n, visual audit and measured evidence
```

## License and terms

Code under the MIT license. **Results derived from AlphaGenome** are subject
to the *AlphaGenome Output Terms of Use*: non-commercial, research use. Not
a medical device, not medical advice, and not for clinical decisions.
Everything the viewer shows is a model's prediction, not an experimental
measurement.

---

Yoichi Palacios (iC7) — <https://ichisieben.dev/>
