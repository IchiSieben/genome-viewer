#!/usr/bin/env bash
# Lane `clouds`: recompute the stage point clouds FROM SCRATCH on this node (fresh mmCIF download
# from files.rcsb.org, own Python env) and compare against the committed data/stage/. Detached.
# Same bytes on two machines, two operating systems and two downloads = the pipeline is
# reproducible; any difference is reported file by file. The node's output stays in
# data/stage-node/ (committed by the worker) for review; data/stage/ is never touched here.
[ "${1:-}" = run ] || exec bash "$(dirname "$0")/detach.sh" clouds "$0"
set -uo pipefail
cd "$(dirname "$0")/../.."
if [ ! -x .venv/bin/python ]; then
  if command -v uv >/dev/null 2>&1; then uv venv --python 3.12 .venv >/dev/null || exit 20
  else python3 -m venv .venv || exit 20; fi
fi
PY=.venv/bin/python
if command -v uv >/dev/null 2>&1; then uv pip install --python "$PY" -q -e "pipeline[stage,dev]" || exit 21
else "$PY" -m pip install -q -e "pipeline[stage,dev]" || exit 21; fi
echo "clouds: python $("$PY" -V 2>&1), gemmi $("$PY" -c 'import gemmi; print(gemmi.__version__)'), numpy $("$PY" -c 'import numpy; print(numpy.__version__)')"
rm -rf /tmp/agp-pdb-cache
PYTHONPATH=pipeline/src "$PY" -m alphagenome_platform.stage.clouds --out data/stage-node --cache /tmp/agp-pdb-cache || exit 22
echo "== compare with committed data/stage/"
same=0; diff=0
for f in data/stage/*.agsc; do
  b=$(basename "$f")
  if [ -f "data/stage-node/$b" ]; then same=$((same+1)); echo "  SAME  $b"
  else diff=$((diff+1)); echo "  DIFF  $b (node produced: $(ls data/stage-node | grep "^${b%%.*}\." | tr '\n' ' '))"; fi
done
echo "clouds: $same identical, $diff different"
echo "== tests on the node"
PYTHONUTF8=1 PYTHONPATH=pipeline/src "$PY" -m pytest pipeline/tests/test_stage.py -q 2>&1 | tail -3
[ "$diff" -eq 0 ]
