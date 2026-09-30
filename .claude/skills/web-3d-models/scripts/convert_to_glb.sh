#!/usr/bin/env bash
# Convert any common 3D format to a single self-contained .glb, then inspect it.
#
#   bash convert_to_glb.sh <input> [output.glb]
#
#   .glb           → copied through (already web-ready format)
#   .gltf          → packed into one .glb (external .bin + textures embedded)
#   .obj (+ .mtl)  → obj2gltf  (keep the .mtl and textures next to the .obj)
#   .fbx           → FBX2glTF  (Autodesk FBX SDK build via the `fbx2gltf` npm package)
#   .dae .stl .ply .3ds .blend .usd/.usdz/.usdc .abc .x3d → Blender CLI (needs `blender` on PATH)
#
# Converted models almost always need a check afterwards: units (FBX is often centimeters),
# missing textures, and Phong→PBR material guesses. This script runs inspect_model.mjs for you.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_DIR="${WEB3D_TOOLS_DIR:-$HOME/.cache/web3d-tools}"
BIN="$TOOLS_DIR/node_modules/.bin"

IN="${1:-}"
if [ -z "$IN" ] || [ ! -f "$IN" ]; then
  echo "Usage: bash convert_to_glb.sh <model.obj|.fbx|.gltf|.dae|.stl|.blend|...> [output.glb]" >&2
  [ -n "$IN" ] && echo "File not found: $IN" >&2
  exit 1
fi
EXT="$(echo "${IN##*.}" | tr '[:upper:]' '[:lower:]')"
OUT="${2:-${IN%.*}.glb}"
[ "$(cd "$(dirname "$IN")" && pwd)/$(basename "$IN")" = "$(cd "$(dirname "$OUT")" 2>/dev/null && pwd)/$(basename "$OUT")" ] && OUT="${IN%.*}.converted.glb"

need_tools() { [ -d "$TOOLS_DIR/node_modules/@gltf-transform/core" ] || bash "$SCRIPT_DIR/setup_tools.sh"; }
LOG="$(mktemp)"; trap 'rm -f "$LOG"' EXIT

case "$EXT" in
  glb)
    cp "$IN" "$OUT" ;;

  gltf)
    need_tools
    # `copy` reads the .gltf with all its external resources and writes a single GLB.
    "$BIN/gltf-transform" copy "$IN" "$OUT" 2>&1 | tee "$LOG" ;;

  obj)
    need_tools
    MTL_REF="$(grep -m1 -i '^mtllib' "$IN" | sed 's/^mtllib[[:space:]]*//I' | tr -d '\r' || true)"
    if [ -n "$MTL_REF" ] && [ ! -f "$(dirname "$IN")/$MTL_REF" ]; then
      echo "WARNING: $IN references '$MTL_REF' but it's not next to the .obj — materials/textures will be missing." >&2
    fi
    # obj2gltf converts Phong (.mtl) values to PBR. If the .mtl was exported from a PBR tool,
    # re-run with:  "$BIN/obj2gltf" -i in.obj -o out.glb -b --metallicRoughness
    "$BIN/obj2gltf" -i "$IN" -o "$OUT" -b --checkTransparency 2>&1 | tee "$LOG" ;;

  fbx)
    need_tools
    [ -d "$TOOLS_DIR/node_modules/fbx2gltf" ] || (cd "$TOOLS_DIR" && npm install --no-audit --no-fund fbx2gltf >/dev/null)
    case "$(uname -s)" in
      Darwin) FBX="$TOOLS_DIR/node_modules/fbx2gltf/bin/Darwin/FBX2glTF" ;;
      Linux)  FBX="$TOOLS_DIR/node_modules/fbx2gltf/bin/Linux/FBX2glTF" ;;
      *)      FBX="$TOOLS_DIR/node_modules/fbx2gltf/bin/Windows_NT/FBX2glTF.exe" ;;
    esac
    chmod +x "$FBX" 2>/dev/null || true
    # --pbr-metallic-roughness reads PBR data where the FBX has it (Maya Stingray/3ds Max Physical);
    # FBX2glTF appends .glb to the output name itself.
    "$FBX" --binary --pbr-metallic-roughness --compute-normals missing --anim-framerate bake30 \
      --input "$IN" --output "${OUT%.glb}" 2>&1 | tee "$LOG"
    # FBX2glTF sometimes emits the deprecated spec/gloss workflow; three.js handles it poorly.
    if grep -q KHR_materials_pbrSpecularGlossiness "$OUT" 2>/dev/null; then
      "$BIN/gltf-transform" metalrough "$OUT" "$OUT"
    fi ;;

  dae|stl|ply|3ds|blend|usd|usda|usdc|usdz|abc|x3d|wrl)
    if ! command -v blender >/dev/null 2>&1; then
      echo "'.$EXT' needs Blender (free): install it, make sure 'blender' is on PATH, and re-run." >&2
      echo "Or open the file in Blender manually → File › Export › glTF 2.0 (.glb), 'Apply Modifiers' on." >&2
      exit 1
    fi
    PY="$(mktemp --suffix=.py)"
    cat >"$PY" <<'PYEOF'
import bpy, sys, os
src, dst = sys.argv[sys.argv.index('--') + 1:][:2]
ext = os.path.splitext(src)[1].lower()
if ext != '.blend':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    importers = {
        '.dae': lambda: bpy.ops.wm.collada_import(filepath=src),
        '.stl': lambda: (bpy.ops.wm.stl_import if hasattr(bpy.ops.wm, 'stl_import') else bpy.ops.import_mesh.stl)(filepath=src),
        '.ply': lambda: (bpy.ops.wm.ply_import if hasattr(bpy.ops.wm, 'ply_import') else bpy.ops.import_mesh.ply)(filepath=src),
        '.3ds': lambda: bpy.ops.import_scene.max3ds(filepath=src),
        '.abc': lambda: bpy.ops.wm.alembic_import(filepath=src),
        '.x3d': lambda: bpy.ops.import_scene.x3d(filepath=src),
        '.wrl': lambda: bpy.ops.import_scene.x3d(filepath=src),
    }
    importers.get(ext, lambda: bpy.ops.wm.usd_import(filepath=src))()
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_apply=True, export_yup=True)
PYEOF
    if [ "$EXT" = "blend" ]; then blender -b "$IN" --python "$PY" -- "$IN" "$OUT" 2>&1 | tee "$LOG"
    else blender -b --python "$PY" -- "$IN" "$OUT" 2>&1 | tee "$LOG"; fi
    rm -f "$PY" ;;

  *)
    echo "Unsupported format: .$EXT" >&2; exit 1 ;;
esac

if [ ! -s "$OUT" ]; then
  echo "Conversion failed — no output written. See the converter log above." >&2
  exit 1
fi

# Converters print missing-texture problems but keep going; surface them loudly.
if grep -Eiq "could not read|not found|no such file|missing|failed to load" "$LOG"; then
  echo
  echo "⚠  The converter reported missing files (usually textures). Put them next to the source file"
  echo "   with the exact filenames the .mtl/.fbx expects (case-sensitive on Linux) and re-run."
fi

echo
echo "Converted → $OUT"
echo
node "$SCRIPT_DIR/inspect_model.mjs" "$OUT"
