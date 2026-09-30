# Vanilla Three.js template (`assets/viewer-template/`)

## Contents
1. Anatomy
2. Setup in a project
3. Config reference
4. JavaScript API
5. Integrating with site logic
6. Extending the engine

## 1. Anatomy

```
viewer-template/
├── index.html          demo page: import map (three@0.186.1), preload, mount call
├── model.config.js     ← the only model-specific file
├── models/             model.glb, poster.webp (you add these)
└── viewer/
    ├── viewer.js       engine: renderer, env, loaders, fit, controls, parts, variants, hotspots, render loop
    ├── ui.js           builds loading/error/toolbar/touch-guard/option panel from config
    └── viewer.css      themeable via --m3d-* custom properties
```

What the engine does for you:
- **Rendering.** sRGB output, Neutral tone mapping, and a PMREM `RoomEnvironment` (a studio with zero download).
- **Shadows.** One directional key light with a shadow onto a `ShadowMaterial` ground. The shadow is rendered once for static models.
- **Loading.** Draco, Meshopt, and KTX2 decoders are wired in, with progress events.
- **Framing.** Auto-center and grounding, then a box-based camera fit. It re-fits on resize, so portrait phones never crop the model.
- **Controls.** OrbitControls with damping, distance and elevation limits, auto-rotate that pauses on interaction and resumes after 6 s, and keyboard support (arrows, +/−, 0).
- **Performance.** Render-on-demand (no GPU work when nothing moves), a pause when off-screen, and DPR capped at 2 (1.5 on touch devices).
- **Touch guard.** Phones must tap before rotating, so page scrolling keeps working.
- **Reduced motion.** `prefers-reduced-motion` turns off auto-rotate and camera tweens.

## 2. Setup in a project

1. Copy `viewer/` and `model.config.js` into the site (for example `assets/3d/`).
2. Add the CSS link, the import map, and a mount point (see `index.html`).
3. The import map must appear before any module script. If the site already has one, merge the `three` entries into it.
4. Put the optimized GLB and a poster at the paths in the config. Make the poster a screenshot at the start angle, 1600px WebP.
5. Mount:

   ```js
   import config from './model.config.js';
   import { mountViewer } from './viewer/ui.js';
   const { viewer } = await mountViewer(document.getElementById('viewer'), config);
   ```

6. For a below-the-fold section, defer the mount until it's near the viewport:

   ```js
   new IntersectionObserver(([e], io) => { if (e.isIntersecting) { io.disconnect(); mountViewer(el, config); } }, { rootMargin: '300px' }).observe(el);
   ```

Must be served over HTTP(S). ES modules and fetch fail on `file://`.

## 3. Config reference

Everything is optional except `model.url`. Defaults live at the top of `viewer.js` (`DEFAULTS`).

```js
model: { url, poster, alt, center: true, normalizeSize: null, rotation: [x°, y°, z°], animation: false|true|'Clip' }
camera: {
  fov: 35, start: { azimuth, elevation, distance },   // distance is a multiple of the auto-fit distance
  minDistance: 0.45, maxDistance: 2.2, minElevation: -2, maxElevation: 80, fitMargin: 1.12,
  enablePan: false, autoRotate: true, autoRotateSpeed: 0.6, autoRotateResumeMs: 6000,
  views: [{ id, label, azimuth, elevation, distance, target?: [x,y,z] }],
}
environment: { preset: 'room' | 'url.hdr', intensity: 1, rotation: 0°, background: 'transparent' | '#hex' | 'environment', backgroundBlur }
lighting: { toneMapping: 'neutral'|'agx'|'aces'|'none', exposure: 1, keyLight: { intensity, azimuth, elevation }, shadows: 'soft'|'blob'|'none', shadowOpacity }
quality: { maxPixelRatio: 2, mobileMaxPixelRatio: 1.5, antialias: true, shadowMapSize: 2048, mobileShadowMapSize: 1024 }
interaction: { touchGuard: 'auto' | true | false }
ui: { panel: 'auto'|'none', toolbar: true, hint: true, screenshot: false }
decoders: { draco: url, basis: url }                   // default: jsdelivr, pinned to three's version
parts: { partId: { materials: [...], meshes: [...], nodes: [...] } }   // exact names or * wildcards
options: [
  { id, label, type: 'swatches', part, default, choices: [{ id, label, swatch: '#hex', description, material: {...}, variant?, visible?: { partId: bool } }] },
  { id, label, type: 'variants', default?, choices? },   // choices optional: auto-listed from the file
  { id, label, type: 'toggle', part, default: true },
  { id, label, type: 'views' },
]
hotspots: [{ id, label, position: [x,y,z] | node: 'Name', view?: 'viewId' }]
```

**Angles.** Azimuth 0° means the camera is on +Z looking at the model's front. glTF's convention is that models face +Z. Azimuth 90° is the model's right side (+X). Elevation is degrees above the horizon.

**Material props in swatches.** Any property on the three.js material works. Colors are hex strings. Examples:
- `{ color: '#b00000', roughness: 0.3, metalness: 0.6, clearcoat: 1 }`
- `{ emissive: '#ffd27a', emissiveIntensity: 3 }` (lights on)
- `{ glass: { tint: '#0b0f14', visibleLight: 0.2 } }` (tinted glass, see interactivity.md)

## 4. JavaScript API

```js
viewer.setOption('tint', '20')          // same as clicking in the panel; emits 'change'
viewer.setOption('wheels', false)
viewer.setPartMaterial('paint', { color: '#0a3d91' })   // ad-hoc, outside of options
viewer.setPartVisible('roofRack', true)
viewer.goToView('side')                 // animated; returns a Promise
viewer.resetView()
viewer.setAutoRotate(false)
viewer.playAnimation('DoorOpen', { loop: false })
viewer.screenshot()                     // PNG data URL
viewer.listVariants()                   // ['midnight', 'beach', ...]
viewer.part('windows')                  // { meshes, materials } — debug your selectors
viewer.selections                       // { tint: '20', wheels: false }
viewer.on('load' | 'progress' | 'error' | 'change' | 'interaction' | 'hotspot' | 'visibility', fn)  // returns unsubscribe
viewer.dispose()                        // on SPA route change
viewer.scene / camera / renderer / controls / model / gltf   // escape hatches
```

## 5. Integrating with site logic

The 3D must never be the only way to make a choice. Keep the site's existing form as the source of truth and mirror both ways:

```js
// form → 3D
form.addEventListener('change', (e) => {
  if (e.target.name === 'tintLevel') viewer.setOption('tint', e.target.value);
});
// 3D → form
viewer.on('change', ({ id, value }) => {
  if (id === 'tint') form.querySelector(`[name=tintLevel][value="${value}"]`)?.click();
});
```

Guard against loops: a `.click()` fires `change`, which calls `setOption` with the same value. That's idempotent here, but debounce if the handler does expensive work.

Use `ui: { panel: 'none' }` when the site's own controls replace the panel.

## 6. Extending the engine

- **Extra scene objects** (a floor, a backdrop, a logo): add them to `viewer.scene` after `load`, then call `viewer.invalidate()`.
- **Post-processing** (bloom for headlights, SSAO): import `EffectComposer` from `three/addons/postprocessing/…`. Replace `renderer.render` in the loop with `composer.render()`. It costs 2–4× fill rate, so disable it on mobile.
- **Scroll-driven camera:** map scroll progress to `azimuth`/`elevation`, call `animateCamera`-style updates, and disable the touch guard on that section.
- Keep additions config-driven when they're model-specific.
