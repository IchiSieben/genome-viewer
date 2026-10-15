#!/usr/bin/env bash
# Lane `lh`: Lighthouse mobile, median of 5, on the LIVE subdomain, EN and ES. Detached.
#   LH_PAGES  space-separated paths under the site (default "/ /es/ /app/ /es/app/")
#   LH_SITE   default https://genome.ichisieben.dev
# Report: docs/evidence/stage/lighthouse-<label>.json (+ per-run JSON under lighthouse/).
[ "${1:-}" = run ] || exec bash "$(dirname "$0")/detach.sh" lh "$0"
set -uo pipefail
cd "$(dirname "$0")/../.."
SITE="${LH_SITE:-https://genome.ichisieben.dev}"
PAGES="${LH_PAGES:-/ /es/ /app/ /es/app/}"
RUNS="${LH_RUNS:-5}"
OUT=docs/evidence/stage/lighthouse
mkdir -p "$OUT"
cd web && { [ -d node_modules ] || npm ci --no-audit --no-fund --loglevel=error; } && cd ..
(cd web && npx playwright install chromium >/dev/null 2>&1) || true
CHROME_PATH=$(cd web && node -e "console.log(require('playwright').chromium.executablePath())")
export CHROME_PATH
echo "lh: site=$SITE pages=$PAGES runs=$RUNS chrome=$CHROME_PATH"
rc=0
for p in $PAGES; do
  label=$(echo "$p" | tr -c 'a-z0-9' '-' | sed 's/^-*//;s/-*$//'); label=${label:-en}
  for i in $(seq 1 "$RUNS"); do
    npx -y lighthouse@12 "$SITE$p?lh=$i" --output=json --output-path="$OUT/$label-$i.json" --quiet \
      --chrome-flags="--headless=new --no-sandbox" \
      --only-categories=performance,accessibility,best-practices,seo >/dev/null 2>"$OUT/$label-$i.err" \
      || echo "lh: $label run $i failed: $(tail -c 200 "$OUT/$label-$i.err")"
  done
  node tools/mac/lh-report.mjs "$OUT" "$label" "$SITE$p" || rc=1
done
exit $rc
