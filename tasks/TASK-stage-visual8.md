---
kind: tests
push: false
---
# TASK — stage-visual8 (phase A on the node GPU, after F-12: verify:stage + motion, layout, register switch and tour, EN/ES)

Everything repeatable is code in this repo (`tools/verify.sh` → `tools/mac/visual.sh`). Your job
is to trigger it, read its output and report truthfully.

1. Write the file `.enjambre-lane` with the single word `visual`.
2. Run `bash tools/verify.sh` (Bash tool timeout 600000). The lane runs detached: exit 90 means
   "still running" — run the same command again. Repeat until it prints `visual: finished, exit <n>`
   (at most 60 calls). The `blender` lane is not detached: one call is enough.
3. Read the end of the output.

If anything fails: do not change any other file and do not retry a different way; report the
failing lines verbatim.

## Files you may touch
- `.enjambre-lane` only. Written by the run, not by you: docs/evidence/stage/visual/**.

## Done criteria
- [ ] for each language the output shows `verify-stage: TODO OK`, `verify-motion: TODO OK`,
  `verify-layout: TODO OK`, `verify-register: TODO OK` and `verify-tour: TODO OK`, and no `FALLA` line

## Report back
- The last 80 lines of the final verify.sh output, verbatim.
