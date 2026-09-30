# `<model-viewer>`: the lightweight path

Google's web component (v4.x). It's one script tag and gives you orbit controls, lazy loading, a poster, and **AR on phones** (Scene Viewer on Android, Quick Look on iOS with a `.usdz`). Pick it when the user wants "show the product, rotate it, maybe AR" with minimal code, or the site is a builder (Shopify, Webflow, WordPress) where custom modules are awkward.

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@google/model-viewer@4.3.1/dist/model-viewer.min.js"></script>

<model-viewer
  src="/models/model.glb"
  poster="/models/poster.webp"
  alt="Product in 3D"
  camera-controls
  touch-action="pan-y"
  auto-rotate auto-rotate-delay="3000"
  shadow-intensity="1" shadow-softness="0.8"
  environment-image="neutral" exposure="1" tone-mapping="neutral"
  camera-orbit="30deg 78deg auto" min-camera-orbit="auto 5deg auto" max-camera-orbit="auto 95deg auto"
  ar ar-modes="webxr scene-viewer quick-look" ios-src="/models/model.usdz"
  loading="lazy" reveal="auto"
  style="width:100%;height:clamp(340px,62vh,720px);--poster-color:transparent">
</model-viewer>
```

- `touch-action="pan-y"` keeps page scrolling on phones. Horizontal drags rotate.
- Draco and Meshopt work out of the box. KTX2 works too.

## Interactivity via its API

```js
const mv = document.querySelector('model-viewer');
await mv.updateComplete;
mv.addEventListener('load', () => {
  // Materials by name (from inspect_model.mjs)
  const glass = mv.model.getMaterialByName('Glass');
  glass.pbrMetallicRoughness.setBaseColorFactor([0.05, 0.06, 0.07, 0.65]); // RGBA, linear
  glass.setAlphaMode('BLEND');
  // KHR_materials_variants
  console.log(mv.availableVariants); mv.variantName = 'beach';
  // Camera
  mv.cameraOrbit = '90deg 80deg auto';
});
```

- Hotspots: `<button slot="hotspot-1" data-position="x y z" data-normal="0 1 0">Label</button>`.
- Limits compared to the Three.js templates:
  - Material edits cover only glTF PBR factors: no custom shaders and no per-mesh visibility (hiding needs a variant or a separate model).
  - Less control over lighting.
  - The bundle is about 280 KB gzipped, similar to three.js.
- When a configurator outgrows it (per-mesh toggles, glass tint realism, custom UI states), move to `assets/viewer-template`. The same GLB and inspection notes carry over.
