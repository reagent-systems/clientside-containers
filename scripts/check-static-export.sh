#!/usr/bin/env bash
# Check that a static export in out/ can actually boot containers.
#
# The build succeeds even when the runtime assets are missing or the base path
# is not inlined. In the browser that failure looks like a container that never
# boots. This script turns those failures into a build failure instead.
#
# Usage: scripts/check-static-export.sh [base-path]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/out"
BASE_PATH="${1-}"

fail() {
  echo "static export check FAILED: $*" >&2
  exit 1
}

[[ -d "$OUT" ]] || fail "out/ does not exist — run the export build first"
[[ -f "$OUT/index.html" ]] || fail "out/index.html is missing"

# The v86 engine and the agent worker must ship, and must be same-origin.
REQUIRED=(
  "v86/libv86.mjs"
  "v86/v86.wasm"
  "workers/headless-worker.js"
)
for rel in "${REQUIRED[@]}"; do
  [[ -f "$OUT/$rel" ]] || fail "out/$rel is missing — the runtime cannot start"
  [[ -s "$OUT/$rel" ]] || fail "out/$rel is empty"
done

# At least one bootable Linux kernel must ship, or the Mini OS tier has nothing
# to boot. The large images are fetched separately and are not required here.
if ! compgen -G "$OUT/v86/images/*bzimage*" > /dev/null; then
  fail "out/v86/images/ has no bzimage — the Mini OS tier cannot boot"
fi

# Under a sub-path, the client needs the base path inlined. Without it every
# asset URL points at the domain root and nothing loads on GitHub Pages.
if [[ -n "$BASE_PATH" ]]; then
  if ! grep -rqF "$BASE_PATH" "$OUT"/index.html "$OUT"/_next/static 2>/dev/null; then
    fail "base path '$BASE_PATH' is not inlined in the export"
  fi
fi

echo "static export check passed (base path: '${BASE_PATH:-<none>}')"
