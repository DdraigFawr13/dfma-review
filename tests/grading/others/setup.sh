#!/usr/bin/env bash
# Rebuild the two outside recognition engines that tests/grading/grade.py compares against, in the
# git-ignored tests/grading/.cache/ (or $GRADING_CACHE). Idempotent: each step is skipped when its
# result is already there.
#
#   qenv/            Python venv with Quiddity 0.3.12 (github.com/pzfreo/quiddity-python, Apache-2.0)
#                    for tests/grading/qchild.py (--engine quiddity --python .cache/qenv/bin/python)
#   AnalysisSitus/   sparse checkout of Analysis Situs (gitlab.com/ssv/AnalysisSitus, BSD-3-Clause):
#                    recognizer sources, tests/feature-recognition and the data files they load
#   Mobius/          sparse checkout of Mobius (gitlab.com/ssv/Mobius, BSD-3-Clause); headers only
#   as-env77/        conda env with OpenCascade 7.7.2 and a C++ toolchain (OCCT 7.8+ fails to build
#                    Analysis Situs's old hasher API)
#   as-build/build/as_recognize   for tests/grading/schild.py (--engine situs --situs-bin ...)
#
# Run from anywhere:  bash tests/grading/others/setup.sh
# Needs: git, python3 (3.10+), micromamba (D-008; /opt/micromamba/bin/micromamba or on PATH),
# network to pypi.org, conda-forge, gitlab.com. Takes about 10 minutes on 4 cores.
# Self-check afterwards (55/55 exact expected):
#   /opt/mamba/envs/dfma/bin/python tests/grading/grade.py situs tests/grading/.cache/AnalysisSitus \
#     --engine situs --situs-bin tests/grading/.cache/as-build/build/as_recognize
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
CACHE="${GRADING_CACHE:-$REPO/tests/grading/.cache}"
MAMBA="${MAMBA:-$(command -v micromamba || echo /opt/micromamba/bin/micromamba)}"
export MAMBA_ROOT_PREFIX="${MAMBA_ROOT_PREFIX:-/opt/mamba}"
PYTHON="${PYTHON:-python3}"
JOBS="${JOBS:-4}"

# Pinned upstream commits (the ones the 55/55 self-check was run on, 2026-11-07).
AS_URL=https://gitlab.com/ssv/AnalysisSitus.git
AS_SHA=220fe820ff4286d0d20ce79b78288f63c78502bb
MOBIUS_URL=https://gitlab.com/ssv/Mobius.git
MOBIUS_SHA=91040a05e95cea8ac14f925d80d33ecc7a889219

mkdir -p "$CACHE"
cd "$CACHE"

# --- 1. Quiddity venv ---------------------------------------------------------------------------
if ! qenv/bin/python -c "import importlib.metadata as m, sys; sys.exit(m.version('quiddity') != '0.3.12')" 2>/dev/null; then
  echo "== qenv: Quiddity 0.3.12"
  "$PYTHON" -m venv qenv
  qenv/bin/pip install -q quiddity==0.3.12 build123d==0.13.0 cadquery-ocp-novtk==8.0.1.1.0
fi

# --- 2. Sparse, pinned checkouts ----------------------------------------------------------------
# fetch_pinned <dir> <url> <sha> <sparse pattern>...
fetch_pinned() {
  local dir=$1 url=$2 sha=$3; shift 3
  if [ "$(git -C "$dir" rev-parse HEAD 2>/dev/null)" = "$sha" ]; then return; fi
  echo "== $dir at $sha"
  rm -rf "$dir"
  git init -q "$dir"
  git -C "$dir" remote add origin "$url"
  printf '%s\n' "$@" | git -C "$dir" sparse-checkout set --no-cone --stdin
  git -C "$dir" fetch -q --depth 1 --filter=blob:none origin "$sha"
  git -C "$dir" checkout -q FETCH_HEAD
}

fetch_pinned AnalysisSitus "$AS_URL" "$AS_SHA" '/*' '!/*/' /src/asiAlgo/ /src/asiActiveData/ /tests/feature-recognition/
# The data files the hole and cavity test cases load (grade.py reads them from data/).
grep -h '^ *set datafile' AnalysisSitus/tests/feature-recognition/recognize-{holes,cavities}/[A-Z][0-9][0-9] \
  | awk '{print "/data/" $3}' | sort -u | git -C AnalysisSitus sparse-checkout add --stdin

fetch_pinned Mobius "$MOBIUS_URL" "$MOBIUS_SHA" /src/
# Analysis Situs includes Mobius as <mobius/x.h>; its install step flattens src/*/ into include/mobius.
if [ ! -f mobius-inc/mobius/core.h ]; then
  mkdir -p mobius-inc/mobius
  find Mobius/src -name '*.h' -exec cp -f {} mobius-inc/mobius/ \;
fi

# --- 3. OCCT 7.7.2 toolchain env ----------------------------------------------------------------
if ! grep -q 'OCC_VERSION_COMPLETE *"7.7.2"' as-env77/include/opencascade/Standard_Version.hxx 2>/dev/null \
   || [ ! -f as-env77/include/X11/X.h ]; then
  echo "== as-env77: OCCT 7.7.2"
  "$MAMBA" create -y -q -p "$CACHE/as-env77" -c conda-forge \
    occt=7.7.2 cxx-compiler cmake make eigen xorg-xorgproto
fi

# --- 4. Build as_recognize ----------------------------------------------------------------------
ENV="$CACHE/as-env77"
PATH="$ENV/bin:$PATH" cmake -S "$HERE" -B as-build/build -DCMAKE_PREFIX_PATH="$ENV" \
  -DCMAKE_CXX_COMPILER="$ENV/bin/x86_64-conda-linux-gnu-g++" \
  -DAS_DIR="$CACHE/AnalysisSitus" -DMOBIUS_INC="$CACHE/mobius-inc" > /dev/null
PATH="$ENV/bin:$PATH" cmake --build as-build/build -j "$JOBS"

# --- 5. Smoke checks ----------------------------------------------------------------------------
as-build/build/as_recognize AnalysisSitus/data/public/cad/nist/nist_ctc_01.brep cavities 0 | cut -c1-60
qenv/bin/python "$REPO/tests/grading/qchild.py" "$REPO/tests/parts/clean_pocket.step" | tail -c 120
echo "== done: $CACHE/as-build/build/as_recognize and $CACHE/qenv/bin/python"
