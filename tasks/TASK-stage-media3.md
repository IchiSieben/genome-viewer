---
kind: tests
push: true
---
# TASK — stage-media3 (demo video EN/ES, 1280x720@60, H.264 + AV1, burnt-in subtitles, into docs/media/)

Everything repeatable is code in this repo (`tools/verify.sh` → `tools/mac/media.sh`). Your job
is to trigger it, read its output and report truthfully.

1. Write the file `.enjambre-lane` with the single word `media`.
2. Run `bash tools/verify.sh` (Bash tool timeout 600000). The lane runs detached: exit 90 means
   "still running" — run the same command again. Repeat until it prints `media: finished, exit <n>`
   (at most 60 calls). The `blender` lane is not detached: one call is enough.
3. Read the end of the output.

If anything fails: do not change any other file and do not retry a different way; report the
failing lines verbatim.

## Files you may touch
- `.enjambre-lane` only. Written by the run, not by you: docs/media/**.

## Done criteria
- [ ] `docs/media/stage-en.mp4` and `docs/media/stage-es.mp4` exist

## Report back
- The last 40 lines of the final verify.sh output, verbatim.
