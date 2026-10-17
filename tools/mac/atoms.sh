#!/usr/bin/env bash
# Lane `atoms` (phase B): frame cost of every heavy atom as a sphere (mockup renderer), real GPU
# (Metal), 1BNA / 1KX5 / 5FLM / 4UG0, phone and desktop viewports. Detached.
# Report: evidence/identidad/atoms-bench.json (web/scripts/bench-atoms.mjs).
[ "${1:-}" = run ] || exec bash "$(dirname "$0")/detach.sh" atoms "$0"
set -uo pipefail
cd "$(dirname "$0")/../.."
cd web && { [ -d node_modules ] || npm ci --no-audit --no-fund --loglevel=error; } || exit 20
npx playwright install chromium >/dev/null 2>&1 || true
node scripts/bench-atoms.mjs --angle metal --out ../evidence/identidad/atoms-bench.json
