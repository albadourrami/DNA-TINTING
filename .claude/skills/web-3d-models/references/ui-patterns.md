# UI around the 3D model

## Layout patterns

| Pattern | When | Template setting |
|---|---|---|
| **Configurator**: stage plus side panel (desktop), panel below (phone) | Choices matter (tints, colors, packages) | default |
| **Hero**: full-bleed stage, no panel, slow auto-rotate, CTA overlaid | Landing pages | `ui: { panel: 'none' }`, CSS `--m3d-stage-height: 80vh` |
| **Inline**: stage in a content column, views only | Feature explanation | one `views` option |
| **Split story**: text steps on scroll drive camera views | Explainers | panel none, IntersectionObserver per step → `goToView` |

## States (every viewer needs all of them)

1. **Before load: poster image** at the start angle. It stops the layout jumping and is the only thing crawlers and no-JS users see. Render it once from the viewer (`viewer.screenshot()`) or in Blender. WebP, about 1600px wide.
2. **Loading:** a thin progress bar plus a percentage. Use an indeterminate bar when the server sends no Content-Length (gzip). Keep it at the bottom, not a full-screen spinner covering the poster.
3. **Ready:** the poster fades out, the hint "Drag to rotate · Scroll/Pinch to zoom" shows until the first interaction, and auto-rotate is gentle.
4. **Error:** a short human message plus "Try again". The poster remains as the fallback. Log details to the console.
5. **No WebGL:** the poster, with "Your browser can't display 3D here." No retry.

## Controls

- **Toolbar:** reset view, auto-rotate toggle (`aria-pressed`), fullscreen, and optional "save image". Place it top-right, with icon buttons 44px or larger and tooltips (`title`).
- **Option groups:** uppercase small label, then choices. Swatches show color chip plus text, because color alone fails color-blind users. The selected state gets an accent border, a tinted background, and `aria-checked`.
- **Choice descriptions:** one line under the group ("35%: the most popular legal shade"). Update them live (`aria-live="polite"`).
- **Prices:** show deltas on the choice ("+ $100") and the total near the CTA, not inside the canvas.
- **Primary CTA** ("Get a quote," "Add to cart") sits outside the viewer and is always visible. Carry the selections into it.

## Accessibility

- Give the stage `tabindex="0"` and an `aria-label` describing the model and the keyboard controls. The canvas has `role="img"` plus a label.
- Radio groups use `role="radiogroup"` / `role="radio"`, with arrow-key navigation and a roving tabindex. Toggles use `role="switch"`.
- Keyboard orbit and zoom are built in. Focus rings are visible (`:focus-visible`).
- `prefers-reduced-motion`: no auto-rotate, no camera tweens, no CSS transitions.
- The 3D view must never be the only way to see or choose something. Provide the poster, text descriptions, and the plain form.

## Theming to the site's brand

Override the tokens instead of editing rules:

```css
#viewer.m3d {
  --m3d-accent: #d4a24c;          /* brand accent */
  --m3d-font: 'Inter', sans-serif;
  --m3d-radius: 20px;
  --m3d-stage-height: clamp(360px, 70vh, 780px);
}
```

Add `data-theme="dark"` to the mount element for the dark palette, then override `--m3d-stage-bg` (a radial gradient reads as a "studio floor") and `--m3d-surface`.

- Keep the stage background close to the environment's tone. A dark stage with a bright studio environment looks pasted in.
- For dark themes, lower `environment.intensity` slightly (0.8), or use `lighting.exposure: 0.9`.

## Copy that helps

- Hint: "Drag to rotate · Pinch to zoom" (touch) / "Drag to rotate · Scroll to zoom" (mouse).
- Touch guard: "Tap to rotate & zoom" / "Done".
- Error: "The 3D model couldn't load. Check your connection and try again."
- Name options in customer language ("Window tint," "35% (popular)"), not model language ("Glass material").
