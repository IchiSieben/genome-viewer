#!/usr/bin/env bash
# Lane `posters`: render the stage posters and OG images on this node's GPU with the same script
# Windows uses (web/scripts/build-posters.mjs), into docs/evidence/stage/posters-node/ for a
# side-by-side with the committed SwiftShader ones in web/public/. Never overwrites web/public. Detached.
[ "${1:-}" = run ] || exec bash "$(dirname "$0")/detach.sh" posters "$0"
set -uo pipefail
cd "$(dirname "$0")/../.."
cd web && { [ -d node_modules ] || npm ci --no-audit --no-fund --loglevel=error; } || exit 20
npx playwright install chromium >/dev/null 2>&1 || true
AGP_SITE=https://genome.ichisieben.dev AGP_BASE=/ npm run build >/tmp/agp-posters-build.txt 2>&1 || { tail -20 /tmp/agp-posters-build.txt; exit 21; }
node scripts/build-posters.mjs --out-dir ../docs/evidence/stage/posters-node
ls -la ../docs/evidence/stage/posters-node ../docs/evidence/stage/posters-node/stage/posters 2>/dev/null
