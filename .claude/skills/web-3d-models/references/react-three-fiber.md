# React Three Fiber template (`assets/r3f-template/`)

Tested with react 19, three 0.186.1, @react-three/fiber 9.8, @react-three/drei 10.7, and Vite 8.

## Files

```
r3f-template/
├── package.json / vite.config.js / index.html   (standalone demo app)
├── public/models/            model.glb + poster
└── src/
    ├── App.jsx               example: React-owned option panel driving the viewer
    └── 3d/
        ├── ModelViewer.jsx   the component (copy this folder into any React app)
        ├── core.js           parts / materials / variants / camera fit (same logic as vanilla)
        ├── model.config.js   same schema as the vanilla template
        └── viewer.css        same styles (.m3d-*)
```

## Using it in an existing React app

```bash
npm i three@0.186.1 @react-three/fiber @react-three/drei
```

Copy `src/3d/` over, then:

```jsx
const ModelViewer = lazy(() => import('./3d/ModelViewer.jsx'));   // keeps ~290 KB gz of 3D off the critical path

<Suspense fallback={<div className="m3d-stage" />}>
  <ModelViewer config={config} selections={selections} view={view} onLoad={({ variants }) => ...} onError={...} />
</Suspense>
```

- **Controlled component.** You own `selections` (`{ optionId: choiceId | boolean }`) and `view`, so 3D state can live next to prices and forms in your state manager.
- **Next.js (App Router).** Put it in a `'use client'` component and load it with `dynamic(() => import('./3d/ModelViewer'), { ssr: false })`. Put models in `/public/models`.
- **Remix/Astro.** Render client-only (Astro: `client:visible`, which also lazy-loads on scroll).

## Why these choices

- **`frameloop`** is `'demand'` when idle, `'always'` only while auto-rotating, and `'never'` off-screen (IntersectionObserver). This mirrors the vanilla render-on-demand approach.
- **Studio environment from `<Lightformer>`s**, not `preset="studio"`. drei presets download HDRs from a third-party CDN at runtime. Lightformers are generated locally, look crisp on car paint, and cost nothing to download. For a real HDR, set `environment.preset` to a self-hosted `.hdr` URL (it becomes `<Environment files>`).
- **Shadows** use a directional light plus a `shadowMaterial` ground, rendered once (`gl.shadowMap.autoUpdate = false`) and re-rendered when options change. drei's `<ContactShadows>` rendered nothing with three r186 + drei 10.7 in testing. If you prefer it, verify it visually first.
- **`useGLTF(url, true, true)`** enables Draco (decoder from gstatic CDN by default; pass a path string to self-host) and Meshopt.
- **Camera framing** uses the same box-based fit as vanilla (`core.js → fitDistance`), recomputed on canvas resize. `<Bounds>` from drei also works, but it fits a sphere, so long objects look small.
- **OrbitControls** (`makeDefault`) with damping, polar limits, auto-rotate, and `enabled` toggled by the touch guard.

## Common R3F patterns

- **Typed JSX for a known model.** `npx gltfjsx model.glb --transform --types` generates a component with named meshes and materials, and also optimizes the file. Great for a one-off hero model with bespoke animation. Avoid it for "swappable" models: generated JSX is tied to one file's structure. The config approach isn't.
- **Clone for multiple instances.** `useGLTF` caches by URL and returns the same scene. For two viewers of the same model, use `const scene = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf])` so they don't share state.
- **Animations.** `const { actions } = useAnimations(gltf.animations, ref); actions.Idle?.play()`.
- **Selection highlight.** `<Outlines>` from drei, or swap `emissive` on hover via `onPointerOver`. Always `e.stopPropagation()`.
- **HTML labels.** `<Html position={[x, y, z]} occlude>` from drei (hotspots).
- **Performance.** `<AdaptiveDpr pixelated />` plus `<PerformanceMonitor onDecline={() => setDpr(1)} />` for heavy scenes. `<Preload all />` compiles shaders before the first frame (avoids a hitch when a variant first appears).
- **Postprocessing.** `@react-three/postprocessing` (`<EffectComposer><Bloom/></EffectComposer>`). Desktop only, unless the budget allows it.

## Pitfalls

- Mismatched `three` versions between your app and drei's peer range give duplicate-three warnings and broken instanceof checks. Pin one version.
- StrictMode double-mounts effects in dev. Effects in `ModelViewer` are idempotent. Keep yours that way.
- Don't `setState` inside `useFrame`. Mutate refs, then `invalidate()`.
- Suspense boundaries: a throw from `useGLTF` (404) is caught by the component's `LoadBoundary`. The overlay shows the error and `onError` fires.
