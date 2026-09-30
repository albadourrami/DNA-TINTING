# 3D viewer template (vanilla Three.js, no build step)

1. Put your optimized model at `models/model.glb` (and a `models/poster.webp` screenshot).
2. Edit `model.config.js`: model path, parts (material/mesh names from `inspect_model.mjs`), options.
3. Serve over HTTP: `python3 -m http.server` → open http://localhost:8000.

Everything model-specific is in `model.config.js`; `viewer/` never needs editing to swap models.
Re-theme with CSS custom properties (`--m3d-accent`, `--m3d-font`, … in `viewer/viewer.css`).
Full docs: `references/vanilla-threejs.md` in the web-3d-models skill.
