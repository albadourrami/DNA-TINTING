# Tint Studio vehicles

Each vehicle has a folder here (model, poster, thumbnail, photo) and a config file in
`js/tint-studio/vehicles/`. The 3D viewer never names a mesh itself, so adding a car means
adding files, not changing code.

## Adding a vehicle (e.g. the C-Class once a licensed model is available)

1. **Get a model you're licensed to use on a commercial website.** Check the license says it
   allows commercial use and real-time/web display. Many branded car models on TurboSquid and
   CGTrader are "Editorial use only", which does not cover advertising. Ask for:
   - GLB/glTF (FBX or OBJ also work; we convert)
   - real-world scale in meters
   - an interior (tint only reads realistic if there's a cabin behind the glass)
   - separate glass meshes, or at least a separate glass material
   - under ~300k triangles
2. **Inspect, then optimize:**
   ```bash
   node .claude/skills/web-3d-models/scripts/inspect_model.mjs c-class.glb
   node .claude/skills/web-3d-models/scripts/optimize_model.mjs c-class.glb assets/vehicles/c-class/c-class.glb --texture-size 1024
   ```
   Aim for under 4 MB. Add `--simplify 0.5` if it's over ~300k triangles.
3. **Point the config at it.** In `js/tint-studio/vehicles/c-class.js`, set
   `modelUrl: 'assets/vehicles/c-class/c-class.glb'`.
4. **Map the windows.** Leave `glass: 'auto'` and open the site with `?studio-debug`. Each
   window zone is painted a different color:

   | Color  | Zone            |
   |--------|-----------------|
   | Red    | Windshield      |
   | Green  | Front driver    |
   | Blue   | Front passenger |
   | Yellow | Rear driver     |
   | Purple | Rear passenger  |
   | Orange | Rear windshield |

   The console prints every glass piece and the zone it was given. If anything is wrong,
   replace `'auto'` with an explicit mapping (see `concept-demo.js`). A mesh that holds
   several windows is split with `side: 'driver' | 'passenger'` and `part: 'front' | 'rear'`.
5. **Poster + thumbnail.** In the browser console on the studio:
   `copy(tintStudio.viewer.screenshot())` gives you the current view as an image. Save it as
   `poster.webp` (about 1600×1000) and a 360×270 crop as `thumb.webp`.
6. **Make it the default.** Set `DEFAULT_VEHICLE_ID` in `js/tint-studio/vehicles/index.js`.
   Remove the demo coupe from `VEHICLES` once both Mercedes models are in.

## Current assets

| Folder | What | License |
|---|---|---|
| `concept-demo/` | Stand-in 3D model, built by `tools/vehicles/prepare-concept-demo.mjs` | "Car Concept" by Eric Chadwick / Darmstadt Graphics Group, **CC BY 4.0**. Modified: logos removed, repainted, simplified. The credit line under the studio must stay while it's used. |
| `c-class/`, `gle/` | Photos for the vehicle cards and placeholder stage | Owner-supplied photos |
