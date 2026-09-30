#!/usr/bin/env bash
# Installs the model-processing toolchain into a shared cache directory so the
# website project itself never needs a package.json just to inspect/optimize models.
# Idempotent: re-running only installs what's missing.
set -euo pipefail

TOOLS_DIR="${WEB3D_TOOLS_DIR:-$HOME/.cache/web3d-tools}"
mkdir -p "$TOOLS_DIR"
cd "$TOOLS_DIR"

[ -f package.json ] || npm init -y >/dev/null

PKGS=(
  "@gltf-transform/core@4"
  "@gltf-transform/extensions@4"
  "@gltf-transform/functions@4"
  "@gltf-transform/cli@4"
  "meshoptimizer"
  "draco3dgltf"
  "sharp"
  "obj2gltf"
)

MISSING=()
for p in "${PKGS[@]}"; do
  name="${p%@*}"; [ -z "$name" ] && name="$p"   # strip "@version" suffix, keep "@scope/"
  [ -d "node_modules/$name" ] || MISSING+=("$p")
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "Installing into $TOOLS_DIR: ${MISSING[*]}"
  npm install --no-audit --no-fund "${MISSING[@]}" >/dev/null
fi

echo "web3d tools ready in $TOOLS_DIR (gltf-transform $(npx --prefix "$TOOLS_DIR" gltf-transform --version 2>/dev/null || echo '?'))"
echo "CLI: npx --prefix \"$TOOLS_DIR\" gltf-transform <command>"
