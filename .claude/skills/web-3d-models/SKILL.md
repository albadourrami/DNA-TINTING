---
name: web-3d-models
description: End-to-end workflow for putting real 3D models (GLB, glTF, OBJ, FBX, and other formats) on websites as fast, interactive, mobile-friendly experiences with Three.js or React Three Fiber. It covers inspecting a model's meshes, materials, textures, and animations; converting and optimizing it (Draco/Meshopt, WebP/KTX2); realistic lighting, shadows, and reflections; orbit/touch controls; configurators that recolor, tint, or hide parts; professional viewer UI; and troubleshooting. Use this skill whenever the user mentions a 3D model, .glb/.gltf/.obj/.fbx file, Three.js, R3F, @react-three/fiber, drei, model-viewer, product configurator, 360° viewer, "rotate the car/product," 3D hero section, or WebGL on a website, even if they only say "add 3D" or "show my model."
---

# Web 3D Models

Turn a 3D model file into a polished, fast, interactive website feature. The model should be swappable later without touching code.

The skill ships tested tools, so don't reinvent them:

| Path | What it is |
|---|---|
| `scripts/setup_tools.sh` | One-time install of the model toolchain into `~/.cache/web3d-tools` (keeps the site free of a package.json) |
| `scripts/inspect_model.mjs` | Reports structure, meshes, materials, textures, animations, variants, scale/units, size and GPU cost, warnings, and likely interactive parts |
| `scripts/convert_to_glb.sh` | Converts OBJ/FBX/glTF (and DAE/STL/BLEND/USD via Blender) to one GLB, then inspects it |
| `scripts/optimize_model.mjs` | Safe web optimization: dedup, weld, prune, WebP textures (resized), and Meshopt/Draco geometry. Keeps part names |
| `assets/viewer-template/` | **Vanilla Three.js** viewer, no build step (import map). Config-driven engine plus auto-built UI |
| `assets/r3f-template/` | **React Three Fiber** version: a controlled `<ModelViewer>` component using the same config schema |

Scripts run from anywhere: `node <skill-dir>/scripts/inspect_model.mjs model.glb`. The first time, run `bash <skill-dir>/scripts/setup_tools.sh` (npm, ~1 min).

## The workflow

Work through these phases in order. Skipping inspection is the most common cause of wasted time: you end up guessing mesh names, discovering the model is in centimeters, or shipping a 40 MB file.

### 1. Intake

Find out, or infer from context:
- **The file(s).** Format, and whether the textures come with it (OBJ+MTL+images, or a .gltf with its .bin).
- **The goal.** Pick one:
  - hero or showcase: look good, light interaction
  - product viewer: rotate, zoom, views
  - configurator: change parts
  - storytelling: scroll or animation
- **The stack.** Plain HTML site, React/Next, or a builder (Webflow/Shopify/WordPress).
- **What should be interactive.** Which parts change and how (e.g. "window tint shades," "paint colors," "show or hide roof rack").

If the user has no model yet, see "Sourcing models" in `references/inspection-and-conversion.md`.

### 2. Inspect (always)

```bash
node scripts/inspect_model.mjs model.glb          # human-readable
node scripts/inspect_model.mjs model.glb --json   # to save next to the model / feed a config
```

Read the report and decide:
- **Scale/units.** "likely centimeters" means you'll use `--unit-scale 0.01` during optimization. The viewer auto-fits either way, but real units matter for lighting and AR.
- **Weight.** File MB, triangles, texture sizes and GPU MB set your optimization targets (budgets are in `references/optimization.md`).
- **Parts.** The "Likely interactive parts" section lists materials and meshes by category (glass, paint, wheel, light). Prefer **material names** as selectors, because one material usually covers a whole part across many meshes. Use mesh names when a material is shared with things that shouldn't change.
- **Variants.** If `KHR_materials_variants` exists, the colorways are already authored: use `type: 'variants'`.
- **Problems.** Unnamed meshes, spec/gloss materials, missing textures, BLEND on glass, far-off origin. See `references/troubleshooting.md`.

Tell the user what you found in plain language: size, what the model contains, what can be made interactive, and what needs fixing.

### 3. Convert (if not already GLB)

```bash
bash scripts/convert_to_glb.sh model.fbx             # → model.glb + inspection report
```

GLB is the delivery format for the web: one file, PBR materials, fast loaders. FBX usually comes out in centimeters. OBJ materials are Phong guesses, so plan to fix materials in config or in Blender. Details and gotchas are in `references/inspection-and-conversion.md`.

### 4. Optimize

```bash
node scripts/optimize_model.mjs model.glb site/models/model.glb                     # desktop-first default
node scripts/optimize_model.mjs model.glb site/models/model.glb --texture-size 1024  # mobile-heavy audience
```

Defaults are Meshopt geometry, WebP textures at max 2048px (normal maps near-lossless), and names preserved. Typical savings are 60–80% (tested: an 11.2 MB car went to 3.9 MB, a 7.5 MB shoe to 1.6 MB).
- Use `--simplify 0.5` only for very dense meshes (over 500k triangles), and check it visually afterwards.
- Never use `--merge` on a configurable model, because it destroys the part names your config depends on.
- Re-run the inspector on the output to confirm the parts and variants survived.

See `references/optimization.md` for budgets, KTX2, LODs, and when to use Draco instead.

### 5. Choose the rendering approach

| Situation | Use |
|---|---|
| Plain HTML/CSS/JS site, or you want zero build tooling | **`assets/viewer-template`** (vanilla Three.js via import map) |
| React / Next.js / Vite-React project | **`assets/r3f-template`** (R3F + drei) |
| Just "show it, rotate it, AR on phones," no configurator, or a site builder | **`<model-viewer>`** web component (`references/model-viewer.md`) |
| Heavy custom effects, physics, or scroll choreography | R3F (the ecosystem pays off), or vanilla if the site isn't React |

Don't add React to a non-React site just for 3D. The vanilla template covers the full configurator feature set.

### 6. Build from the template

Copy the template into the project, put the optimized GLB in `models/`, and write **`model.config.js`**. It's the only model-specific file:
- `model`: URL, poster image, alt text, rotation fix, auto-center.
- `camera`: start angle, zoom limits, named `views`.
- `environment` / `lighting`: studio environment or HDR, tone mapping, shadow mode.
- `parts`: friendly names mapped to material or mesh names from the inspection report.
- `options`: `swatches` (material props, including `{ glass: { visibleLight } }` for tint), `variants`, `toggle`, and `views`. The UI builds itself from this.
- `hotspots`: labels pinned to parts.

Then wire it into the site. Site code can drive the viewer with `viewer.setOption(id, value)` and listen with `viewer.on('change', ...)`, so the 3D stays in sync with pricing forms, carts, or quote builders.

Read these as needed:
- `references/vanilla-threejs.md`: template anatomy, full config schema, JS API, and embedding.
- `references/react-three-fiber.md`: the R3F component, Next.js SSR, and drei patterns.
- `references/lighting-materials.md`: making it look expensive (environment, tone mapping, glass, paint, shadows).
- `references/controls-responsive.md`: orbit and touch tuning, scroll-trap prevention, DPR, and the mobile checklist.
- `references/interactivity.md`: parts, swatches, tint, variants, toggles, hotspots, animations, syncing with forms.
- `references/ui-patterns.md`: loading, fallback, panel layout, accessibility, and theming to the site's brand.

### 7. Verify in a real browser

A model that "should work" often renders black, tiny, sideways, or not at all. Always look at it:
- Serve over HTTP (`python3 -m http.server`). `file://` blocks module and fetch loading.
- Screenshot at desktop (1280×800) and phone (390×844, touch) sizes. In headless Chromium, launch with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` to get WebGL. If the sandbox proxy blocks the CDN, route `cdn.jsdelivr.net/npm/three@…` to a local `npm i three@<same version>` with Playwright's `context.route`.
- Check for these:
  - no console errors
  - model framed and upright
  - textures present
  - every option visibly changes the right part
  - toggles hide the right meshes
  - phone: the page still scrolls past the viewer (touch guard)
  - loading and error states work (point the URL at a missing file once)
- Check the performance budget in `references/controls-responsive.md`.

Symptoms and fixes are in `references/troubleshooting.md`: black model, missing textures, wrong scale, dark or flat look, z-fighting, jagged edges, slow phones, CORS/404, Draco errors, and more.

### 8. Hand off

Tell the user:
- How to swap the model: inspect, optimize, then edit `model.url` and `parts`.
- Where the colors, tints, and views live (`model.config.js`).
- What to supply for best results: a poster image, a real-scale GLB with named parts, and separate materials for anything configurable.

## Principles that hold across projects

- **Config over code.** Everything model-specific lives in `model.config.js`. The engine never names a mesh. That's what makes "replace the model later" a 10-minute job.
- **Materials are the handles.** Ask for, or create, one material per configurable part with a clear name ("Glass," "Paint_Body"). This makes the config trivial and survives re-exports.
- **Performance is a feature.** Budget up front: under 5 MB, under 300k triangles, textures at 2048px or less, and under 100 draw calls for mobile-friendly scenes. Render on demand, cap DPR, and pause when off-screen. The templates already do this; don't undo it.
- **Mobile first.** Around 60% of traffic is phones. The viewer must not trap page scrolling (touch guard). Tap targets must be 44px or more, and portrait framing must fit (the templates' box-based fit handles this).
- **Always a fallback.** Show a poster image while loading and if WebGL fails. Say something useful on error and offer retry.
- **Pin versions.** Use one exact three.js version for core, addons, and decoders. Mismatches cause cryptic loader errors.
