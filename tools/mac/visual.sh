#!/usr/bin/env bash
# Lane `visual`: build the site on this node and run verify:stage (EN/ES, desktop + mobile, WebGL,
# ?nowebgl and reduced-motion posters, zero external requests, zero console errors) with the
# node's GPU. Screenshots land in web/qa/stage/; a copy goes to docs/evidence/stage/visual/. Detached.
[ "${1:-}" = run ] || exec bash "$(dirname "$0")/detach.sh" visual "$0"
set -uo pipefail
cd "$(dirname "$0")/../.."
cd web && { [ -d node_modules ] || npm ci --no-audit --no-fund --loglevel=error; } || exit 20
npx playwright install chromium >/dev/null 2>&1 || true
AGP_SITE=https://genome.ichisieben.dev AGP_BASE=/ npm run build >/tmp/agp-visual-build.txt 2>&1 || { tail -20 /tmp/agp-visual-build.txt; exit 21; }
# One browser per language: on Metal the second language of a shared browser fell back to the
# poster with no console error (visual4); apart, each run starts from a fresh GPU process.
rc=0
for L in en es; do
  echo "== visual: $L"
  AGP_STAGE_LANGS=$L npm run verify:stage 2>&1 | tail -40; r=${PIPESTATUS[0]}
  [ "$r" != 0 ] && rc=$r
done
mkdir -p ../docs/evidence/stage/visual && cp -R qa/stage/. ../docs/evidence/stage/visual/ 2>/dev/null || true
exit "$rc"
