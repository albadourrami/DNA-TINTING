# 3D viewer template (React Three Fiber)

```bash
npm install
# put your optimized model at public/models/model.glb, edit src/3d/model.config.js
npm run dev
```

Copy `src/3d/` into any React app (`npm i three@0.186.1 @react-three/fiber @react-three/drei`).
`<ModelViewer config selections view />` is controlled: your React state owns the choices.
Next.js: load it with `dynamic(..., { ssr: false })`. Docs: `references/react-three-fiber.md`.
