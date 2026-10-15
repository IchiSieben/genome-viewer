#!/usr/bin/env bash
# detach.sh <name> <script> — run `bash <script> run` outside the agent's Bash call and poll it.
# A lane script starts with: [ "${1:-}" = run ] || exec bash "$(dirname "$0")/detach.sh" <name> "$0"
#
# An enjambre agent's Bash call is cut after a few minutes, which would kill a render or five
# Lighthouse runs halfway. So the first call starts <script> in its own session (perl setsid:
# macOS has no setsid(1)); every call, this one included, waits up to POLL_S for it, prints the
# log tail and exits 90 while it still runs. The agent calls verify.sh again until it finishes.
# Same pattern as Landing/tools/mac/media.sh, which shipped Cert Studio's media on 2026-10-15.
set -uo pipefail
name="$1"; script="$2"
cd "$(dirname "$0")/../.."
ST="$(git rev-parse --git-dir)/lane-$name"   # per-worktree state, never committed
mkdir -p "$ST" docs/evidence/stage
LOG="docs/evidence/stage/$name-run.txt"
alive() { [ -f "$ST/pid" ] && kill -0 "$(cat "$ST/pid")" 2>/dev/null; }

if [ ! -f "$ST/started" ]; then
  date '+%F %T' > "$ST/started"
  echo "== $name started $(cat "$ST/started") on $(uname -sm) commit $(git rev-parse --short HEAD)" > "$LOG"
  nohup perl -MPOSIX=setsid -e 'setsid(); exec @ARGV' \
    bash -c 'bash "$1" run >> "$2" 2>&1; echo $? > "$3/exit"' _ "$script" "$LOG" "$ST" \
    </dev/null >/dev/null 2>&1 &
  echo $! > "$ST/pid"
fi

end=$(( $(date +%s) + ${POLL_S:-100} ))
while [ ! -f "$ST/exit" ] && [ "$(date +%s)" -lt "$end" ]; do
  alive || { sleep 2; break; }
  sleep 5
done
tail -n 30 "$LOG"
if [ -f "$ST/exit" ]; then
  rc=$(cat "$ST/exit")
  echo "$name: finished, exit $rc"
  exit "$rc"
fi
alive || { echo "$name: died without an exit code (see $LOG)"; exit 92; }
echo "$name: still running — run the verification command again (exit 90 is not a failure)"
exit 90
