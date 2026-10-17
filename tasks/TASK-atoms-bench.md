---
kind: tests
push: false
---
# TASK — atoms-bench (phase B: frame cost of every heavy atom as a sphere, Metal; 1BNA / 1KX5 / 5FLM / 4UG0; phone and desktop viewports)

Everything repeatable is code in this repo (`tools/verify.sh` → `tools/mac/atoms.sh` →
`web/scripts/bench-atoms.mjs`). Your job is to trigger it, read its output and report truthfully.

1. Write the file `.enjambre-lane` with the single word `atoms`.
2. Run `bash tools/verify.sh` (Bash tool timeout 600000). The lane runs detached: exit 90 means
   "still running" — run the same command again. Repeat until it prints `atoms: finished, exit <n>`
   (at most 60 calls).
3. Read `evidence/identidad/atoms-bench.json` with the Read tool.

If anything fails: do not change any other file and do not retry a different way; report the
failing lines verbatim.

## Files you may touch
- `.enjambre-lane` only. Written by the run, not by you: `evidence/identidad/atoms-bench.json`.

## Done criteria
- [ ] the output ends with `atoms: finished, exit 0`
- [ ] `evidence/identidad/atoms-bench.json` exists with 8 rows (2 views x 4 structures)

## Report back
- The full content of `evidence/identidad/atoms-bench.json`, verbatim (it is small).
- The last 20 lines of the final verify.sh output, verbatim.
