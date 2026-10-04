# Tint Studio vehicles

Each vehicle has a folder here (`<id>.glb`, `poster.webp`, `thumb.webp`) and a config file in
`js/tint-studio/vehicles/`. The 3D viewer never names a mesh itself. Adding or swapping a car
means adding files, not changing code.

## Live vehicles

| Id | Slot | Source | Notes |
|---|---|---|---|
| `amg-c63` | Sedan / Coupe pricing | Owner-supplied model (confirm its license allows commercial website use) | Four-door sedan in satin grey-silver with DNA Tinting logo decals (doors + trunk). The source has no interior, plates, exhaust or brakes, so the build generates a cabin, US plates, a rear diffuser with quad exhaust tips, and brake discs with red calipers (`details` in the recipe). |
| `mercedes-gls` | SUV / Truck pricing | Purchased model (commercial license, owner-supplied) | Satin grey-silver with DNA Tinting logo decals on both sides. Full interior. The panoramic roof stays factory glass. Rear windows = rear door glass; the third-row glass is a separate pair of optional "extra" windows (`quarterDriver` / `quarterPassenger`). |

Hidden but kept working (`enabled: false`; preview with `?studio-vehicle=<id>`):
- `audi-a3`: the earlier sedan, replaced by the AMG C63.
- `concept-demo`: the CC BY 4.0 stand-in coupe.
- `c-class`, `gle`: photo-only placeholders, waiting on licensed models.

Keep the source `.blend` / `.fbx` files and the license receipts **out of this repo**, in your
own storage. Only the web-optimized GLBs live here.

## Adding or replacing a vehicle

1. **Model license.** It must allow commercial and advertising use on a website. Do not use
   anything marked "Editorial use only". A 3D-model license covers the model, not the
   carmaker's trademarks, so don't imply the carmaker endorses DNA Tinting.

2. **Build a web GLB** with the Blender pipeline. It rescales to real size, cleans the mesh,
   rebuilds all materials as PBR, and splits the glass into per-window meshes:
   ```bash
   python -m venv .bpy && .bpy/bin/pip install "bpy==4.2.*" pillow
   # add a recipe to tools/vehicles/recipes.py (copy 'gls' or 'a3'), then:
   .bpy/bin/python tools/vehicles/build_vehicle.py <recipe> source.blend /tmp/car.glb --render /tmp/check.png
   node .claude/skills/web-3d-models/scripts/optimize_model.mjs /tmp/car.glb assets/vehicles/<id>/<id>.glb --texture-size 1024
   ```
   `--render` writes Cycles check images with every window zone in its own color. Aim for a
   GLB under 1.5 MB and under 150k triangles.

   The build names the glass meshes:
   - Windows: `Glass_Windshield`, `Glass_FrontDriver`, `Glass_FrontPassenger`, `Glass_RearDriver`, `Glass_RearPassenger`, `Glass_RearWindow`
   - SUV extras (recipe `quarter_glass=True`): `Glass_QuarterDriver`, `Glass_QuarterPassenger` — glass behind the rear doors.
     Map them as `quarterDriver` / `quarterPassenger` in the config and the studio asks the customer whether their
     SUV has them (each is an extra window, `EXTRA_WINDOW_PRICE` in pricing.js).
   - Not tintable: `Glass_Roof`, `Glass_Lamp`, `Glass_Other`

3. **Config.** Copy `js/tint-studio/vehicles/mercedes-gls.js` to `<id>.js`, set its fields
   (`bodyType`, `modelUrl`, `glass`, `windshield`, `pricing`), import it in `vehicles/index.js`
   and add it to `ALL_VEHICLES`. With the build above, the glass names match the GLS config as-is.
   For a model that didn't go through the build, use `glass: 'auto'` and open the site with
   `?studio-debug`. Each window then gets its own color and the console lists every glass piece.

4. **Poster + thumbnail.** On the studio, run `tintStudio.viewer.skipIntro()` and then
   `copy(tintStudio.viewer.screenshot())` in the browser console. Save it as `poster.webp`
   (about 1600×1000) and a 360×270 crop as `thumb.webp`.

When a car is selected the viewer plays a short fly-through (from the driver's seat, out through
the rear glass, round to the start view). The path is built from the car's own glass, so new
vehicles get it automatically; customers can skip or replay it.

## Paint + logo decals

Both cars use the `paint_silver` role in `tools/vehicles/recipes.py`. The DNA Tinting decals come
from `details.decals` in a recipe (`side_width`, `side_z`, `side_y`, optional `rear_width` /
`rear_z`, all in meters or fractions of the car's height/length): the build turns
`assets/logo.png` into a transparent decal and ray-casts a fine grid onto the body so the vinyl
follows the panels, reading correctly from each side. Change the logo file and rebuild to update.

## Windshield: top strip or full

`windshield: { meshes: ['Glass_Windshield'], strip: { depth: 0.127 }, full: true }`

Customers tap the windshield (or use step 4) and pick the top strip or the full windshield, plus
a shade. The strip is the top band, `depth` meters down from the top edge, measured along the
glass (0.127 m = 5 in); the viewer cuts it with a clipping plane, so no separate mesh is needed.
Remove `strip` or `full` to stop offering that option for a vehicle. Prices:
`WINDSHIELD_STRIP_PRICE` ($25) and `WINDSHIELD_FULL_PRICE` ($75) in `js/tint-studio/pricing.js`,
or per vehicle with `pricing: { windshieldStrip: 30, windshieldFull: 80 }`.
