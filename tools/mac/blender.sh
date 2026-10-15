#!/usr/bin/env bash
# Lane `blender`: Molecular Nodes stills of the stage structures. Fails FAST when Blender or the
# Molecular Nodes add-on is missing: installing software is the owner's call (NEEDS-OWNER.md).
set -uo pipefail
cd "$(dirname "$0")/../.."
B=$(command -v blender || ls /Applications/Blender.app/Contents/MacOS/Blender 2>/dev/null || true)
[ -n "$B" ] || { echo "blender: MISSING (no blender on PATH, no /Applications/Blender.app)"; exit 30; }
"$B" -b --python-expr "import addon_utils,sys; ok=any(m.__name__.startswith('molecularnodes') for m in addon_utils.modules()); print('molecularnodes:', ok); sys.exit(0 if ok else 31)" 2>&1 | tail -3
rc=${PIPESTATUS[0]}
[ "$rc" -eq 0 ] || { echo "blender: Molecular Nodes add-on MISSING"; exit 31; }
echo "blender: available; render script not written yet in this session (see MORNING-REPORT.md)"
exit 32
