---
kind: tests
push: false
---
# TASK — stage-clouds (recompute the stage point clouds from scratch and compare)

Everything repeatable is code in this repo (`tools/verify.sh` → `tools/mac/clouds.sh`): it builds
its own Python env, downloads the 8 mmCIF entries from files.rcsb.org, runs the point-cloud
pipeline into `data/stage-node/`, compares every `.agsc` with the committed `data/stage/`, and runs
the stage tests. Your job is to trigger it, read its output and report truthfully.

1. Write the file `.enjambre-lane` with the single word `clouds`.
2. Run `bash tools/verify.sh` (Bash tool timeout 600000). The lane runs detached: exit 90 means
   "still running" — run the same command again until it prints `clouds: finished, exit <n>`
   (at most 40 calls).

If anything fails: do not change any other file and do not retry a different way; report the
failing lines verbatim. A DIFF is a finding, not an error of yours: report it.

## Files you may touch
- `.enjambre-lane` only. Written by the run, not by you: `data/stage-node/**`, `docs/evidence/stage/**`.

## Done criteria
- [ ] `bash tools/verify.sh` printed `clouds: finished, exit 0`
- [ ] the output says `8 identical, 0 different` and the stage tests passed

## Report back
- The last 30 lines of the final verify.sh output, verbatim.
