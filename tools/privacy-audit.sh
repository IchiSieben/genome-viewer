#!/usr/bin/env bash
# Privacy audit before every push of this public repo. Two passes over the commits that are about
# to leave this machine (default range: origin/main..HEAD; pass another as $1):
#   1. gitleaks on those commits (keys, tokens, credentials);
#   2. the lines those commits ADD, searched for what must never be public here: third-party
#      names (portfolio rule), e-mail addresses other than the commit trailers' noreply ones,
#      local user paths, private IPs, an API key variable with a value.
# Exit 0 = clean; anything else = do not push. Prints what it found, redacted where it can.
set -uo pipefail
cd "$(dirname "$0")/.."
RANGE="${1:-origin/main..HEAD}"
fail=0

n=$(git rev-list --count "$RANGE" 2>/dev/null || echo 0)
echo "privacy-audit: $n commit(s) in $RANGE"
[ "$n" = 0 ] && { echo "privacy-audit: nothing to push"; exit 0; }

if command -v gitleaks >/dev/null 2>&1; then
  if gitleaks git --no-banner --redact --log-opts="$RANGE" . >/tmp/agp-gitleaks.txt 2>&1; then
    echo "  OK    gitleaks: no leaks"
  else
    echo "  FALLA gitleaks:"; tail -20 /tmp/agp-gitleaks.txt; fail=1
  fi
else
  echo "  FALLA gitleaks is not installed: refusing to call this clean"; fail=1
fi

# Only added lines, without the diff headers; binary files are skipped by git diff -U0 text mode.
added=$(git diff -U0 --no-color "${RANGE%%..*}" "${RANGE##*..}" -- . ':(exclude)tools/privacy-audit.sh' | grep -E '^\+' | grep -vE '^\+\+\+ ')
# Commit messages leave too: scanned with the same patterns.
added="$added
$(git log --format='%B' "$RANGE" | grep -v '^Co-Authored-By:')"
scan() {
  local label="$1" re="$2" hits
  hits=$(printf '%s\n' "$added" | grep -nEi -- "$re" | head -5)
  if [ -n "$hits" ]; then echo "  FALLA $label:"; printf '%s\n' "$hits" | cut -c1-160 | sed 's/^/        /'; fail=1
  else echo "  OK    $label"; fi
}
scan "third-party names" '\b(SIS|OGTI)\b|digital ?city|dulzura'
# E-mail: every address except the commit trailers' noreply and example.* domains.
mails=$(printf '%s\n' "$added" | grep -Eio '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' | grep -viE '^noreply@anthropic\.com$|@example\.(com|org)$' | sort -u | head -5)
if [ -n "$mails" ]; then echo "  FALLA e-mail addresses: $(printf '%s ' $mails)"; fail=1; else echo "  OK    e-mail addresses"; fi
scan "local user paths" '[A-Za-z]:(\\|/)Users(\\|/)|/Users/[a-z]+/|/home/[a-z]+/'
scan "private IPs" '\b(10\.[0-9]+\.[0-9]+\.[0-9]+|192\.168\.[0-9]+\.[0-9]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]+\.[0-9]+)\b'
scan "API key with a value" '(ALPHAGENOME|API)_?KEY *[=:] *["'"'"']?[A-Za-z0-9_-]{12,}'

[ "$fail" = 0 ] && echo "privacy-audit: TODO OK" || echo "privacy-audit: NO SUBIR"
exit "$fail"
