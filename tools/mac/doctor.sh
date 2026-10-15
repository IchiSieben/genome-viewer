#!/usr/bin/env bash
# Lane `doctor`: what this node can do for the stage work, written to docs/evidence/stage/doctor.txt.
# Read-only except for that file. Answers, before any heavy lane: is there a GPU-backed Chromium,
# Python with gemmi, ffmpeg with AV1, Blender with Molecular Nodes? Missing pieces become owner
# actions in NEEDS-OWNER.md (installing software is the owner's call, not a node's).
set -uo pipefail
cd "$(dirname "$0")/../.."
mkdir -p docs/evidence/stage
OUT=docs/evidence/stage/doctor.txt
have() { command -v "$1" >/dev/null 2>&1; }
{
  echo "doctor $(date '+%F %T') $(uname -sm) commit $(git rev-parse --short HEAD)"
  echo "node: $(node -v 2>/dev/null || echo MISSING)  npm: $(npm -v 2>/dev/null || echo MISSING)"
  echo "python3: $(python3 -V 2>&1)"
  echo "uv: $(uv --version 2>/dev/null || echo MISSING)"
  python3 -c "import gemmi; print('gemmi', gemmi.__version__)" 2>/dev/null || echo "gemmi: MISSING (python3)"
  python3 -c "import numpy; print('numpy', numpy.__version__)" 2>/dev/null || echo "numpy: MISSING (python3)"
  echo "ffmpeg: $(ffmpeg -hide_banner -version 2>/dev/null | head -1 || echo MISSING)"
  if have ffmpeg; then
    ffmpeg -hide_banner -encoders 2>/dev/null | grep -E "libsvtav1|libaom-av1|av1_videotoolbox|libx264|h264_videotoolbox" | awk '{print "  encoder:", $2}'
  fi
  for b in /Applications/Blender.app/Contents/MacOS/Blender "$(command -v blender 2>/dev/null)"; do
    [ -n "$b" ] && [ -x "$b" ] && { echo "blender: $b"; "$b" -b --version 2>/dev/null | head -1; break; }
  done
  have blender || [ -x /Applications/Blender.app/Contents/MacOS/Blender ] || echo "blender: MISSING"
  ls -d "$HOME/Library/Application Support/Blender/"*/extensions/*/molecularnodes* \
        "$HOME/Library/Application Support/Blender/"*/scripts/addons/molecularnodes* 2>/dev/null \
    | head -2 | sed 's/^/molecularnodes: /' || true
  echo "GPU:"; system_profiler SPDisplaysDataType 2>/dev/null | grep -E "Chipset|Metal|Cores" | sed 's/^/  /'
  echo "playwright chromium:"
  ls "$HOME/Library/Caches/ms-playwright" 2>/dev/null | sed 's/^/  /' || echo "  none cached"
  echo "memory: $(sysctl -n hw.memsize 2>/dev/null) bytes, free pct: $(memory_pressure 2>/dev/null | awk -F': ' '/free percentage/{print $2}')"
} > "$OUT" 2>&1
cat "$OUT"
echo "doctor: exit 0"
