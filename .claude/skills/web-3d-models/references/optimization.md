# Optimization

## Budgets (per model, for a page that must feel fast on a mid-range phone)

| Metric | Good | Acceptable | Too much |
|---|---|---|---|
| GLB download | < 3 MB | 3–8 MB (hero feature, lazy-loaded) | > 15 MB |
| Triangles | < 150k | 150–500k | > 1.5M |
| Draw calls (meshes × materials) | < 50 | 50–150 | > 300 |
| Texture max edge | 1024–2048 | 4096 for one hero texture | 8192 |
| GPU texture memory (inspector estimate) | < 64 MB | 64–150 MB | > 256 MB (iOS Safari may crash the tab) |

GPU memory is what kills phones, not download size. A 4096² texture costs ~90 MB of VRAM whether it downloaded as a 300 KB WebP or a 20 MB PNG. KTX2 (Basis) is the only format that stays compressed on the GPU.

## The script

`node scripts/optimize_model.mjs in.glb out.glb [flags]`

Pipeline:
1. `dedup`
2. `instance` (5+ copies become GPU instancing)
3. `weld`
4. `simplify` (optional)
5. `resample` (animation keys)
6. `prune`
7. `sparse`
8. `textureCompress` (resize, then WebP/AVIF/JPEG. Normal maps get near-lossless WebP, because lossy artifacts show as bumpy reflections)
9. `meshopt` or `draco`

| Flag | When |
|---|---|
| `--texture-size 1024` | Mobile-heavy audience, small on-screen model, or many textures |
| `--texture-format avif` | ~20% smaller than WebP, slower to decode. Fine for 2025+ browsers |
| `--compress draco` | Pure static geometry where the smallest file matters more than decode time. Meshopt is the default because its decoder is tiny, decodes faster, and also compresses animations and morph targets |
| `--simplify 0.5` | Over 500k triangles, or scans and CAD. Always compare visually. Thin parts (grilles, text) degrade first |
| `--unit-scale 0.01` | cm → m (FBX/Max/Maya). Use `0.001` for mm (CAD) |
| `--merge` | Display-only models with many small meshes (reduces draw calls). **Destroys part targeting.** Never use it for configurators |

Always re-run `inspect_model.mjs` on the output. Confirm that the variants, part names, and texture slots survived.

## KTX2 / Basis (lowest GPU memory)

Requires KTX-Software's `toktx` binary (https://github.com/KhronosGroup/KTX-Software/releases). Then:

```bash
npx --prefix ~/.cache/web3d-tools gltf-transform uastc out.glb out.glb --slots "{normalTexture,occlusionTexture,metallicRoughnessTexture}"   # data maps: high quality
npx --prefix ~/.cache/web3d-tools gltf-transform etc1s out.glb out.glb   # color maps: smallest
```

Worth it when the GPU memory estimate is over ~100 MB, or the audience is iPhones. Both templates already wire up `KTX2Loader`.

## Beyond the file

- **Lazy-load the viewer.**
  - Vanilla: mount it when the section nears the viewport (`IntersectionObserver` with `rootMargin: '200px'`).
  - React: `lazy(() => import('./3d/ModelViewer'))`.
  - Either way, show the poster image first.
- **Preload the model** only when the 3D is above the fold. Use `<link rel="preload" href="model.glb" as="fetch" crossorigin>`. For below-the-fold 3D, preloading steals bandwidth from the hero image.
- **Server headers.**
  - Serve `.glb` as `model/gltf-binary`.
  - Enable gzip/brotli. Geometry that isn't Meshopt-compressed still gzips well, while Meshopt output is already entropy-coded (tiny additional gain).
  - Use long `Cache-Control` with a version in the filename (`car.v3.glb`).
- **CDN for decoders.** The templates load Draco/Basis decoders from jsdelivr (pinned to the three.js version). To self-host, copy `three/examples/jsm/libs/{draco,basis}` and set `config.decoders`.
- **LODs.** For big scenes, use `THREE.LOD` or `gltf-transform` + `@gltf-transform/functions` `simplify` at several ratios. Rarely needed for single-product viewers.
- **Textures you control.** Pack occlusion/roughness/metalness into one ORM texture. Use one 2048 atlas instead of twenty 512s (also fewer draw calls).
