---
kind: tests
push: false
---
# TASK — stage-lh-base (Lighthouse baseline of the live viewer, before the stage exists)

Everything repeatable is code in this repo (`tools/verify.sh` → `tools/mac/lh.sh`): Lighthouse
mobile, five runs per page, on https://genome.ichisieben.dev/ and https://genome.ichisieben.dev/es/.
Your job is to trigger it, read its output and report truthfully.

1. Write the file `.enjambre-lane` with the single word `lh`.
2. Run `bash tools/verify.sh` (Bash tool timeout 600000). The lane runs detached: exit 90 means
   "still running" — run the same command again. Repeat until it prints `lh: finished, exit <n>`
   (at most 40 calls).
3. Read the two `**median**` lines.

If anything fails: do not change any other file and do not retry a different way; report the
failing lines verbatim.

## Files you may touch
- `.enjambre-lane` only. Written by the run, not by you: `docs/evidence/stage/**`.

## Done criteria
- [ ] `bash tools/verify.sh` printed `lh: finished, exit 0`
- [ ] `docs/evidence/stage/lighthouse-en.json` and `docs/evidence/stage/lighthouse-es.json` exist

## Report back
- The last 30 lines of the final verify.sh output, verbatim.
