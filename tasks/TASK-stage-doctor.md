---
kind: tests
push: false
---
# TASK — stage-doctor (what this Mac can do for the stage work)

Everything repeatable is code in this repo (`tools/verify.sh` → `tools/mac/doctor.sh`). Your job
is to trigger it, read its output and report truthfully.

1. Write the file `.enjambre-lane` with the single word `doctor`.
2. Run `bash tools/verify.sh` once (Bash tool timeout 300000).
3. Read `docs/evidence/stage/doctor.txt`.

If anything fails: do not change any other file and do not retry; report the failing lines verbatim.

## Files you may touch
- `.enjambre-lane` only. Written by the run, not by you: `docs/evidence/stage/doctor.txt`.

## Done criteria
- [ ] `bash tools/verify.sh` printed `doctor: exit 0`
- [ ] `docs/evidence/stage/doctor.txt` exists and is non-empty

## Report back
- The full content of `docs/evidence/stage/doctor.txt`, verbatim.
