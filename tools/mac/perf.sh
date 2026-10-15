#!/usr/bin/env bash
# Lane `perf`: frame cost of the stage island on the LIVE subdomain, real GPU (Metal), at 10k/20k/40k
# points and 1x/4x CPU throttling, EN only (the island is the same code in both languages). Detached.
#   PERF_SITE  default https://genome.ichisieben.dev/
# Report: docs/evidence/stage-perf.json (web/scripts/measure-stage.mjs --gpu).
[ "${1:-}" = run ] || exec bash "$(dirname "$0")/detach.sh" perf "$0"
set -uo pipefail
cd "$(dirname "$0")/../.."
SITE="${PERF_SITE:-https://genome.ichisieben.dev/}"
cd web && { [ -d node_modules ] || npm ci --no-audit --no-fund --loglevel=error; } || exit 20
npx playwright install chromium >/dev/null 2>&1 || true
echo "perf: site=$SITE"
node scripts/measure-stage.mjs "$SITE" --gpu --seconds 8 --out ../docs/evidence/stage-perf.json
