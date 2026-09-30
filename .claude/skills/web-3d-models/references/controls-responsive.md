# Controls, responsiveness, performance

## Orbit controls (tuned defaults in both templates)

| Setting | Value | Why |
|---|---|---|
| `enableDamping` / `dampingFactor` | true / 0.08 | Smooth, "weighty" rotation. Requires calling `controls.update()` every frame while it settles (render loop handles it) |
| `enablePan` | false | Shoppers lose the model when panning. Enable only for scenes/architecture |
| `rotateSpeed` | 0.7 desktop, 0.9 touch | Default 1.0 feels twitchy on trackpads |
| `zoomSpeed` | 0.8 | Mouse wheels vary; slower is safer |
| distance limits | 0.45×–2.2× fit distance | Can't clip into or lose the model |
| polar limits | elevation −2° … 80° | Stay above the floor, no upside-down |
| `touches` | ONE: ROTATE, TWO: DOLLY_ROTATE (or DOLLY_PAN) | One finger orbits; pinch zooms |
| auto-rotate | 0.6, pauses on interaction, resumes after 6 s, off for reduced-motion | Attracts attention without fighting the user |

Keyboard (template): container is focusable; ← → orbit 20°, ↑ ↓ elevation, + − zoom, 0 reset. Needed for accessibility (WCAG 2.1.1).

## Mobile: the scroll trap

A full-width WebGL canvas with `touch-action: none` makes the page impossible to scroll past on phones — the #1 mobile 3D complaint. The template's **touch guard** (`interaction.touchGuard: 'auto'`):
- On coarse pointers the canvas starts with `touch-action: pan-y` and controls disabled → vertical swipes scroll the page.
- "Tap to rotate & zoom" button (bottom, doesn't cover the model) enables controls; a "Done" button (and scrolling away) disables them.
- Fullscreen enables interaction automatically.

Alternatives: keep the viewer ≤ 70% of viewport height so there's always scrollable page around it; or two-finger-to-rotate (feels unnatural to most users).

## Responsive layout

- Stage height `clamp(340px, 62vh, 720px)`; panel under the stage on phones, 320px sidebar ≥ 960px.
- **Portrait framing**: the camera fit uses the tighter of vertical/horizontal FOV and the model's box from the start angle — a 4 m car on a 390 px-wide phone still fits. Re-fit runs on every container resize (ResizeObserver, not window resize, so it works in tabs/accordions).
- Option choices scroll horizontally on phones (one row, snap) instead of stacking.
- Tap targets ≥ 44×44 px; toolbar top-right, touch-guard "Done" top-left.
- `viewport-fit=cover` + safe-area padding if the viewer goes fullscreen on notched phones.
- iPhone Safari has no element fullscreen → template falls back to a fixed overlay (`.is-fullscreen`).

## Performance checklist

Built into the templates (don't remove):
- Render on demand (vanilla: `needsRender` flag; R3F: `frameloop="demand"`), pause off-screen (IntersectionObserver), rAF naturally pauses in background tabs.
- DPR cap: `min(devicePixelRatio, 2)`; 1.5 on touch devices. A 3× phone at full DPR renders 2.25× the pixels of 2×.
- Shadow map rendered once for static models; 1024² on mobile.
- No transmission glass by default; no post-processing by default.

Measure:
- Chrome DevTools → Performance (CPU 4× slowdown) and `renderer.info.render.calls/triangles` in the console.
- Real phone via remote debugging (Safari Web Inspector / chrome://inspect) — emulators don't throttle the GPU.
- Target: first render < 3 s on 4G after the section is visible; 60 fps while dragging on a 3-year-old mid-range phone.

If slow:
1. Too many draw calls → fewer materials, `optimize_model --merge` for non-configurable parts (or split: configurable parts separate, everything else merged in Blender).
2. Too many triangles → `--simplify`.
3. GPU memory / texture-bound → `--texture-size 1024`, KTX2.
4. Fill-rate bound (big screen, heavy shaders) → lower `maxPixelRatio`, drop transmission/clearcoat on distant parts, `antialias: false` at DPR ≥ 2 (pixels are small enough).
5. Janky first interaction → shader compile; call `renderer.compile(scene, camera)` after load (or drei `<Preload all />`).
