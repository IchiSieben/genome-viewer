# HANDOFF — AlphaGenome viewer, publication phase  (updated: 2026-09-25)

## Goal (1-2 lines)
Publish the existing viewer as a bilingual (ES/EN) portfolio piece in a subfolder of ichisieben.dev,
in 5 phases: 1 language, 2 visual identity, 3 narrative, 4 publish, 5 close. The full brief is the user's
2026-09-25 prompt; read NOTES.md first.

## Current state
- DONE: required reading (NOTES.md, README.md, docs/01, docs/03, alphagenome-docs/01, 02).
- DONE: name collision check (Quipu/Khipu/RefAlt, all discarded by user) and trademark check (see Decisions).
- DONE: phase 1a diagnosis (see Decisions). No repo file edited yet.
- IN PROGRESS: phase 1a — plan sent to the user; waiting for OK on 3 questions (below) before any edit.
- BLOCKED: every edit, until the user answers the open questions.

## Decisions (with the reason, one line each)
- "PheniGnom" was a voice-transcription error; never use it.
- Name is descriptive, not a brand; BRAND_NAME is an ordinary i18n string per language.
- "Visor AlphaGenome"/"AlphaGenome Viewer" as product name conflicts with Google's trademark guideline ("Don't incorporate Google Brand Features into your own product names"); AlphaGenome terms defer to Google APIs ToS §6. "Unofficial" does not cure it.
- Plan B proposed (pending OK): ES "Visor del genoma" / EN "Genome Viewer", slug `/genome-viewer/`. Plan C: "GenomaViz"/"GenomeViz", `/genomeviz/`.
- Tagline, always visible with "no oficial"/"unofficial": ES "Qué le hace una variante al genoma, predicho" / EN "What a variant does to the genome, predicted".
- Destination: subfolder, mirrored into `Landing/public/<slug>/` like Botanica (landing = Astro 4, git auto-deploy on push to `IchiSieben/portfolio-landing@main`). Not a zip deploy to a separate site.
- Proposed URL layout: EN at `/<slug>/`, ES at `/<slug>/es/`, matching the landing and Botanica.
- Landing cards already have one file per language (`Landing/src/content/projects/{en,es}/<slug>.md`: title = name, oneLine = tagline, summary = description, demoUrl per language). Add a check that the title is equal in both.
- Missing accents: an accident, not policy. Source code was ASCII since the first commit (`2f98b5e`); docs have accents; the toolchain is UTF-8 end to end (meta charset, explicit utf-8 in .mjs/.py, dev server charset). The risk is Windows: PS 5.1 Get-Content/Set-Content use ANSI, and the Python console uses cp1252.

## Tried and failed (so nobody retries it)
- WebFetch on deepmind.google.com/science/alphagenome/terms returns an empty shell (JS-rendered); read it via Chrome + `document.body.innerText`.
- The Bash tool here has no curl/gh/ls on PATH; use PowerShell + `python -`.

## Next steps (ordered, each with its verification)
1. Get user answers (open questions). → verify: answers recorded here.
2. Phase 1a:
   - `.editorconfig` (utf-8), `PYTHONUTF8=1` in NOTES.md commands;
   - a pytest that fails on mojibake markers (cp1252 read-back sequences, U+FFFD, BOM);
   - a missing-accent guard limited to unambiguous patterns (-cion/-sion, analisis, sintetic*, senal*, biologia, numero, pagina, tambien, despues, segun…), never que/como/esta/mas;
   - fix accents in `web/index.html`, README, NOTES.
   → verify: `PYTHONPATH=pipeline/src python -m pytest pipeline/tests -q`, then `cd web && npm run build && npm run verify && npm run verify:links && npm run measure` (record before/after).
3. Phase 1b design doc in `docs/`:
   - dictionaries es.json/en.json;
   - hash routing (D2) blocks per-view sitemap/canonical unless path shells are prerendered, which reopens D2 and needs the landing .htaccess;
   - `Intl.NumberFormat('es')` does not group 4-digit numbers, so a custom formatter is likely needed;
   - the TS string accent fixes go straight into es.json during extraction.
   → verify: same suite.

## Commands that matter
- test: `PYTHONPATH=pipeline/src python -m pytest pipeline/tests -q`
- run: `cd web && npm run dev` · build+checks: `npm run build && npm run verify && npm run verify:links && npm run measure`
- deploy (new flow): copy `web/dist` into `Landing/public/<slug>/`, push landing `main`, check the Hostinger build.

## Open questions for iC7
1. Confirm plan B name "Visor del genoma"/"Genome Viewer", `/genome-viewer/` (or accept the trademark risk).
2. Visible Spanish text inside `data/dist/`: feature/modality/organ-system labels, the DNM1 and CELSR2 findings, the study manifest, the index study label.
   - (A) recommended: override from web dictionaries by stable id, with a test that ES dictionary text == artifact text modulo accents; data/dist untouched.
   - (B) fix in `loci.py`/`avi.py`/manifest and re-emit text fields without quota; touches data/dist.
3. OK to fix TS string accents during 1b extraction into es.json, instead of in place now?
4. ES at `/es/` and EN at root: OK?
