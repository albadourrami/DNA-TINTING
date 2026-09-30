# Inspection & conversion

## Contents
1. Reading the inspector report
2. Format cheat-sheet
3. Converting (OBJ, FBX, glTF, others)
4. Fixing models in Blender (when config can't)
5. Sourcing models

## 1. Reading the inspector report

`node scripts/inspect_model.mjs model.glb [--json] [--full]`

| Section | What to look for | Action |
|---|---|---|
| Size / Generator | MB split into geometry, textures, and animation. The generator tells you which exporter made the file | Over 5 MB → optimize. "RapidPipeline/Sketchfab" exports are usually clean. "FBX2glTF/obj2gltf" need material review |
| Extensions | `KHR_draco_mesh_compression` / `EXT_meshopt_compression` / `KHR_texture_basisu` | The viewer needs the matching decoder. Both templates set up all three |
| Dimensions / Units | A largest side over 50 suggests cm; over 1000 suggests mm | `optimize_model.mjs --unit-scale 0.01` (or 0.001) |
| Totals / Render cost | Triangles, draw calls, GPU texture MB | Budgets are in optimization.md |
| Materials | alphaMode, doubleSided, maps, extensions, and `(×N)` usage count | `(×0)` = variant-only material (fine) or unused. "spec/gloss" → convert with `gltf-transform metalrough` |
| Meshes | Largest first, with materials used | Unnamed meshes can't be targeted by name. Target them via material, or name them in Blender |
| Textures | Size, format, color space, slots | Over 2048px → resize. A missing file → the model renders white or black |
| Animations | Clip names, duration, targets | Autoplay one with `model.animation: 'ClipName'` |
| Variants | KHR_materials_variants names | `{ type: 'variants' }` option: free colorways |
| Likely interactive parts | Name-based guesses grouped by glass, paint, wheel, and light | Starting point for `config.parts`. **Verify visually.** Toggle each part in the viewer once |
| Warnings | ERROR, then WARN, then INFO | Fix errors before building |

The hints use regexes with exclusions (window *gaskets*, *steering* wheels, light *panels* are excluded). Unusual naming ("Mat.012") produces no hints. Then find parts by toggling candidates in the browser console:

```js
viewer.part('test') // after adding parts.test = { materials: ['Mat.012'] }
viewer.setPartVisible('test', false)
```

## 2. Format cheat-sheet

| Format | Web-ready? | Notes |
|---|---|---|
| **.glb** | ✅ best | Binary glTF: one file with geometry, PBR materials, textures, animations, and variants |
| .gltf | ✅ | JSON plus separate .bin and images. All files must stay together with the same relative paths. Pack to GLB for delivery |
| .obj (+.mtl) | ❌ convert | Geometry and Phong materials only: no PBR, no animation, no hierarchy. The .mtl and textures must sit next to it |
| .fbx | ❌ convert | Autodesk format. Often in cm, may have spec/gloss materials, embedded or external textures, animations |
| .usdz | ❌ | Apple AR format. `<model-viewer ios-src>` can use it for iOS Quick Look. Convert via Blender for the web |
| .blend, .dae, .stl, .ply, .3ds, .abc | ❌ convert | Via Blender CLI. STL/PLY have no materials (assign in config) |
| .splat/.ply (Gaussian splats) | special | Not a mesh; needs a splat renderer. Out of scope for this workflow |

## 3. Converting

`bash scripts/convert_to_glb.sh <input> [output.glb]` picks the right tool and inspects the result.

**OBJ → obj2gltf**
- It reads `mtllib`, so keep the .mtl and textures beside the .obj. Texture filenames are case-sensitive on Linux servers.
- It converts Phong to PBR. Results look plasticky. Fix `roughness`/`metalness` per part in config swatches, or re-author in Blender.
- If the .mtl was exported from a PBR tool (Substance, Blender 4), re-run with `--metallicRoughness`.
- OBJ has no units. Most OBJs from CAD or 3ds Max are cm or mm, so check the inspector's units line.

**FBX → FBX2glTF** (via the `fbx2gltf` npm package, which bundles binaries for Linux, macOS, and Windows)
- Flags used: `--pbr-metallic-roughness` (reads Physical/Stingray materials) and `--compute-normals missing`.
- The script converts leftover spec/gloss materials with `gltf-transform metalrough`.
- Expect cm units (Mixamo, Maya, Max). Warnings about "transform inheritance" come from Maya "Segment Scale Compensate". Usually harmless for display.
- "Take 001 has zero channels" is harmless.
- Textures missing? FBX often stores absolute paths from the author's PC. Place the images next to the FBX with the same filenames, or embed them on export.

**.gltf → .glb.** `gltf-transform copy in.gltf out.glb` packs everything. It fails with ENOENT if any referenced file is missing, and the error names the file.

**Everything else → Blender CLI.** The script builds a Python import/export call. Without Blender: File › Import in Blender, then File › Export › glTF 2.0 with Format **GLB**, **Apply Modifiers** on, +Y up, and **Materials: Export**, **Images: Automatic**.

## 4. Fixing models in Blender

Some problems can't be solved in config:
- **Parts not separated.** The windows are part of the body mesh with the body material. Select the faces, press `P` (separate), and give them their own material named "Glass". This is the single most valuable fix for configurators.
- **Unnamed or generic names.** Rename objects and materials in the Outliner ("Paint_Body," "Glass_Side," "Wheel_FL").
- **Pivot and origin.** Object › Set Origin › Origin to Geometry for parts that rotate (doors, wheels).
- **Transforms.** Ctrl+A › All Transforms before export, so negative scales don't flip normals.
- **Too heavy.** Decimate modifier (ratio 0.3–0.5) on dense, non-hero parts. Or `optimize_model.mjs --simplify`.
- **Baked lighting.** Some store models have shadows painted into the albedo. They look wrong under real-time lights. Find a clean PBR version.
- **Glass as opaque.** Set Blend Mode to "Alpha Blend" and give it its own material. Our viewer's `glass` shorthand then takes over anyway.

## 5. Sourcing models

- **Client's own CAD or product files.** Best fidelity, but usually way too heavy. Convert, then optimize with `--simplify` and check visually.
- **Sketchfab (download as glTF), Fab, TurboSquid, CGTrader.** Check the license allows web use. Prefer "PBR", "game-ready", or "low-poly" listings with separate materials per part.
- **Poly Haven** for HDRIs. **Khronos glTF-Sample-Assets** (CarConcept, ToyCar, MaterialsVariantsShoe, DamagedHelmet) are good test models.
- **Photogrammetry/scans** (Polycam, Luma, RealityScan) are great for real objects. They come as one mesh with one baked texture, so there are no separable parts.
- Commissioning a model: ask for glTF/GLB, real-world scale in meters, +Y up, named parts, one material per configurable part, and under 150k triangles for web. Textures 2048 max, PBR metal/rough.
