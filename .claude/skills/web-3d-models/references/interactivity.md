# Interactivity: changing parts of the model

## Contents
1. Parts: mapping friendly names to the model
2. Option types
3. Tinted glass / window film
4. Recoloring (paint, fabric, trims)
5. Show/hide and swapping parts
6. Hotspots
7. Animations (doors, hoods)
8. Picking parts by clicking
9. Syncing with forms, prices, URLs

## 1. Parts

```js
parts: {
  windows: { materials: ['Glass'] },                  // every mesh using material "Glass"
  sideWindows: { meshes: ['BodyDoor*Window', 'BodyWindowsRearSides'] },   // specific meshes
  wheels: { materials: ['Rim*', 'Tire*'] },
  roofRack: { nodes: ['RoofRack'] },                   // a node and everything under it
}
```

- Matching is case-insensitive. `*` is a wildcard. Names are tried both raw and in GLTFLoader's sanitized form (spaces become `_`; `[]:./` are removed from node names).
- **Materials first.** One material usually spans a whole part (glass across 5 window meshes), and edits apply once.
- **Meshes when a material is shared** with things that shouldn't change. For example, front windows need a different tint from rear windows but share "Glass." The engine clones the material for those meshes, so edits don't leak onto the others.
- If a part matches nothing, the console warns `Part "x" matched nothing`. Debug with `viewer.part('x')`.
- **Can't separate it by name** (windows baked into the body mesh with the body material)? Fix it in Blender: select the faces, press P, and assign a new material (see inspection-and-conversion.md §4). There's no reliable runtime workaround.

## 2. Option types

| type | Value | Effect |
|---|---|---|
| `swatches` | choice id | Applies `choice.material` props to every material in `part`. `choice.variant` selects a KHR variant. `choice.visible` shows or hides parts |
| `variants` | variant name | Switches KHR_materials_variants (authored colorways). Other options are re-applied on top, so a tint survives a color change |
| `toggle` | boolean | Shows or hides `part` |
| `views` | view id | Camera preset buttons |

Options apply in config order on load, from each `default` (or the first choice).

## 3. Tinted glass / window film

`material: { glass: { visibleLight, tint, reflectivity } }` expands to a fast, reflective, transparent material:

| visibleLight (VLT) | Looks like | Opacity used |
|---|---|---|
| 0.70 | Barely tinted, factory glass | ~0.37 |
| 0.50 | Light tint | ~0.54 |
| 0.35 | Medium, the popular legal limit in many states | ~0.66 |
| 0.20 | Dark | ~0.80 |
| 0.05 | Limo | ~0.93 |

- `tint` defaults to a neutral charcoal `#0b0f14`. Try a blue-grey `#0e1620` for ceramic "IR" films, or a bronze `#1a140c`.
- The mapping is perceptual, not physically exact. In real life the look also depends on how bright the interior is. Calibrate against photos of real films: adjust `visibleLight` per choice or add `opacity` explicitly (`{ glass: {...}, opacity: 0.7 }` overrides).
- Transmission (real refraction) is deliberately not used here: it's slow on phones and makes interiors look milky. For a higher-fidelity desktop tier, use `transmission: 1` with `color` set to the VLT: it multiplies what shows through, so 35% film means color 0.35. Keep `thickness: 0` for thin automotive glass.
- For a fast tier that still looks glossy: add a second, additive reflection-only layer on the same geometry (black `MeshPhysicalMaterial` with `blending: AdditiveBlending`, `depthWrite: false`) on top of the tint layer. Additive blending happens after tone mapping, so give that layer a much lower `envMapIntensity` (~0.35) than you'd expect. Pass `envMap` explicitly, or the intensity is ignored (see troubleshooting).
- A production implementation of both tiers, per-window zones, and automatic window detection lives in the DNA Tinting repo: `js/tint-studio/` (`glass.js`, `glass-zones.js`).
- **Different tint for windshield vs. sides** (common legal difference): make two parts (`windshield`, `sideWindows`) by mesh name and two options, or one option whose choices apply to one part and use `visible` or a second option for the other.
- **Show the interior darkening.** With dark tints, the interior should fade. The opacity already does this. For extra realism, lower `envMapIntensity` on interior materials when tint is dark (a custom `change` handler plus `setPartMaterial('interior', …)`).

## 4. Recoloring

```js
{ id: 'paint', label: 'Paint', type: 'swatches', part: 'paint', default: 'red', choices: [
  { id: 'red', label: 'Rosso', swatch: '#9e0b0f', material: { color: '#9e0b0f', metalness: 0.6, roughness: 0.3, clearcoat: 1 } },
  { id: 'white', label: 'Pearl', swatch: '#f2f2ee', material: { color: '#f2f2ee', metalness: 0.3, roughness: 0.25, clearcoat: 1 } },
]}
```

- `color` multiplies with the base-color texture. If the texture itself is red, a blue color gives purple-black. For recolorable parts, the texture should be white or grey (detail only). Otherwise swap the texture: add a `variant` in the file, or extend `applyMaterialProps` to accept `map: url` with a `TextureLoader` (set `colorSpace = SRGBColorSpace` and `flipY = false` for glTF UVs).
- Use the swatch color for the button, but tune the material color by eye under the scene's tone mapping.
- A custom color picker works too: `<input type=color>` → `viewer.setPartMaterial('paint', { color: input.value })`.

## 5. Show/hide and swapping parts

- `toggle` hides or shows a part (roof rack, spoiler, accessories).
- Mutually exclusive parts (3 wheel designs in one file): one swatch option whose choices set `visible: { wheelsA: true, wheelsB: false, wheelsC: false }`.
- Parts in separate files (a large accessory catalog): load them with a second `GLTFLoader` and attach them to a named empty node, e.g. `viewer.model.getObjectByName('Mount_Roof').add(gltf.scene)`. Keep a cache map by URL.

## 6. Hotspots

`hotspots: [{ id, label, node: 'BodyWindshield', view: 'front' }]` puts an HTML button at the node's bounding-box center, or at `position` in model coordinates. Clicking it fires `viewer.on('hotspot')` and optionally flies to a view. Hotspots fade when occluded (a raycast, throttled to about 7 per second). Keep 3–6 per model. More than that is noise, and each raycast costs CPU on dense meshes.

## 7. Animations

- Clips in the file: `viewer.playAnimation('DoorOpen', { loop: false })`. `model.animation: true` autoplays the first clip.
- Procedural (no clip): rotate a node with a tween. Set the node's pivot correctly in Blender first:

  ```js
  const door = viewer.model.getObjectByName('DoorL');
  // animate door.rotation.y to 1.1 over 600 ms, calling viewer.invalidate() each frame
  ```

## 8. Picking parts by clicking

```js
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
viewer.renderer.domElement.addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, viewer.camera);
  const hit = ray.intersectObject(viewer.model, true)[0];
  if (hit) console.log(hit.object.name, hit.object.material.name); // map back to a part
});
```

Ignore clicks that were really drags (compare the pointerdown/up positions, more than 5 px apart). Highlight on hover by nudging `emissive`, and restore it on leave.

## 9. Syncing with forms, prices, URLs

- The site form stays the source of truth. The 3D mirrors it (see vanilla-threejs.md §5).
- Persist the configuration in the URL for sharing: `history.replaceState(null, '', '?' + new URLSearchParams(viewer.selections))`, and read it back on load into each option's default.
- "Save image": `ui.screenshot: true`, or `viewer.screenshot()`. Attach it to quote requests or emails.
- Analytics: `viewer.on('change')` tells you which options people try. Useful for pricing decisions.
