#!/usr/bin/env bash
# The ONE command an enjambre agent may run in this repo (AGENTS.md `tests-cmd`). enjambre grants
# a `tests` job exactly `Bash(bash tools/verify.sh)`: no npm, no node, no python by hand. So this
# script is the whole runtime, and it dispatches on a one-word LANE the agent writes with its
# Write tool into `.enjambre-lane` (gitignored):
#   (absent) / verify  -> pytest + web build + verify + verify:links
#   doctor             -> tools/mac/doctor.sh  (what the node has: node, python, gemmi, chromium, GPU, blender, ffmpeg)
#   lh                 -> tools/mac/lh.sh      (Lighthouse mobile, median of 5, live EN + ES; detached, exit 90 = running)
#   clouds             -> tools/mac/clouds.sh  (stage point clouds from RCSB mmCIF, recomputed from scratch; detached)
#   perf               -> tools/mac/perf.sh    (stage frame cost 10k/20k/40k points, GPU + throttled; detached)
#   visual             -> tools/mac/visual.sh  (stage captures: 2 languages x 2 widths x motion x webgl; detached)
#   posters            -> tools/mac/posters.sh (stage posters + OG images from the real render; detached)
#   media              -> tools/mac/media.sh   (demo video 1280x720@60, AV1 + H.264, burnt subtitles; detached)
#   blender            -> tools/mac/blender.sh (Molecular Nodes render, only if installed; fails fast otherwise)
#   atoms              -> tools/mac/atoms.sh   (phase B: frame cost of every atom as a sphere, Metal; detached)
# A lane that does not exist yet on this commit says so and exits 41: the TASK was launched before
# the push that brings it.
# LEARN: the "layer" rule made concrete. The model only names an intent; everything that must be
# repeatable is code here, the same on Windows (Git Bash) and macOS.
set -uo pipefail
cd "$(dirname "$0")/.."
lane=$(tr -d '[:space:]' < .enjambre-lane 2>/dev/null || echo verify)
lane=${lane:-verify}
echo "verify.sh: lane=$lane node=$(node -v 2>/dev/null) platform=$(uname -s) commit=$(git rev-parse --short HEAD 2>/dev/null)"

if [ "$lane" != verify ]; then
  script="tools/mac/$lane.sh"
  [ -f "$script" ] || { echo "verify.sh: lane '$lane' does not exist on this commit"; exit 41; }
  exec bash "$script"
fi

if python3 -c pass >/dev/null 2>&1; then PY=python3; else PY=python; fi
rc=0
echo "== pytest"
PYTHONUTF8=1 PYTHONPATH=pipeline/src "$PY" -m pytest pipeline/tests -q 2>&1 | tail -3 || rc=10
cd web
[ -d node_modules ] || npm ci --no-audit --no-fund --loglevel=error || { echo "verify.sh: npm ci FAILED"; exit 11; }
echo "== build"
npm run build >/tmp/agp-build.txt 2>&1 || { tail -20 /tmp/agp-build.txt; rc=12; }
echo "== verify"
npm run verify 2>&1 | tail -3 || rc=13
echo "== verify:links"
npm run verify:links 2>&1 | tail -3 || rc=14
echo "verify.sh: exit $rc"
exit $rc
