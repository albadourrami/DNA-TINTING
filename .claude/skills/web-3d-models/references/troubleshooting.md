# Troubleshooting (symptom → cause → fix)

First steps for any problem:
1. Open the console.
2. Run `inspect_model.mjs` on the exact file being served.
3. Try the model in https://gltf-viewer.donmccurdy.com. If it looks wrong there too, the file is the problem. If it only looks wrong in your page, the code is.

## Loading

| Symptom | Cause | Fix |
|---|---|---|
| Nothing loads; console: `Failed to resolve module specifier "three"` | Import map missing, after the module script, or a second import map | Put exactly one `<script type="importmap">` before any module script |
| CORS / "blocked by CORS policy" / works locally but not live | Model on another domain without `Access-Control-Allow-Origin`, or opened via `file://` | Serve from the same origin, or add CORS headers. Always test over HTTP |
| 404 on `.glb`, or it downloads as HTML | Wrong path (relative to the page, not the JS file), or the SPA router returns index.html | Use an absolute path (`/models/x.glb`). In R3F, put it in `public/`. Check the Network tab's response type |
| `THREE.GLTFLoader: No DRACOLoader instance provided` | File is Draco-compressed and the decoder isn't set up | Templates set it up. In custom code: `loader.setDRACOLoader(new DRACOLoader().setDecoderPath(...))` |
| `setMeshoptDecoder must be called` / `EXT_meshopt_compression` error | Meshopt file, no decoder | `loader.setMeshoptDecoder(MeshoptDecoder)` |
| KTX2 textures black or error | Transcoder path wrong, or `detectSupport(renderer)` not called | Set `decoders.basis` and call `detectSupport` (the template does both) |
| `Unexpected token '<'` / JSON parse error | Server returned an HTML error page instead of the model | Check the URL and server config. Serve MIME type `model/gltf-binary` |
| Loads forever, progress stuck at 0% then jumps | Gzip response has no Content-Length | Normal. The template shows an indeterminate bar |
| Works on desktop, crashes or reloads tab on iPhone | GPU memory (large textures) | `--texture-size 1024`, KTX2, lower DPR (optimization.md budgets) |
| Duplicate/mismatched three versions ("Multiple instances of Three.js") | Addons from one version, core from another, or two bundles | Pin one version in the import map / package.json |

## Scale, position, orientation

| Symptom | Cause | Fix |
|---|---|---|
| Model invisible / camera inside it | Units: mm or cm model (huge) or tiny model, camera at a fixed position | The templates auto-fit. For custom code, compute a Box3 and fit. Fix the source: `optimize_model --unit-scale 0.01` |
| Model floats or sinks / off-center orbit | Origin far from the geometry | `model.center: true` (template default) centers and grounds it |
| Lying on its side / facing backwards | Z-up export (CAD, some FBX), or it faces −Z | `model.rotation: [-90, 0, 0]` or `[0, 180, 0]`. Better: re-export +Y up |
| Mirrored model / inside-out lighting | Negative scale in the hierarchy | Apply transforms in Blender (Ctrl+A) and re-export |
| Parts in the wrong place after optimize `--merge` | Flatten/join changed the hierarchy | Don't merge configurable models. Re-optimize without `--merge` |
| Hotspot label in the wrong place | `position` given in world units after centering | Positions are model-space (pre-centering). Use `node:` instead |

## Materials & textures

| Symptom | Cause | Fix |
|---|---|---|
| All black | No environment (metals are black without reflections), or no lights at all | Environment on (`room` or HDR). Check `scene.environment` is set |
| All white / pink / missing textures | Texture files missing (.gltf/OBJ/FBX), wrong case in filenames, or absolute paths from the author's PC | The inspector flags missing files. Put the images beside the model or pack to GLB. Converter warnings list the paths |
| Colors washed out or too dark | Color space: sRGB texture treated as linear or vice versa (custom `TextureLoader`) | Color maps: `tex.colorSpace = SRGBColorSpace`. Data maps linear. glTF textures: `flipY = false` |
| Colors shifted (red → orange), overly contrasty | ACES tone mapping | `toneMapping: 'neutral'` |
| Plastic look (OBJ/FBX conversions) | Phong → PBR guesses | Set `roughness`/`metalness` per part in a swatch default. Re-author in Blender |
| Glass opaque grey, or interior invisible behind glass | `alphaMode OPAQUE` on glass, or transparent sorting | Use the `glass` shorthand (transparent, depthWrite false). If still wrong, set `renderOrder` on glass higher than the interior |
| Glass black on phones | `transmission` materials on weak GPUs | Replace with the `glass` shorthand (`transmission: 0`) |
| Recolor turns muddy or black | Color multiplies a colored base texture | Make the texture neutral (white/grey), or swap textures or use variants |
| Recolor affects other parts | Shared material | Select that part by mesh name. The engine clones the material for them |
| Z-fighting (flickering stripes) | Coplanar faces (decals, trims), or a near/far ratio that's too large | Nudge the decal in Blender or use `polygonOffset`. Near/far from the bounding radius (templates) |
| Black patches / seams on smooth surfaces | Bad or missing normals, flipped faces | The inspector warns about missing normals. Recalculate normals in Blender. `doubleSided` as a last resort |
| Striped shadows on the model (shadow acne) | Self-shadowing with low bias | `receiveShadow = false` on the model, `normalBias` (templates) |
| Blurry or pixelated shadow | Shadow camera too large | Fit the bounds to the model radius (templates), `mapSize` 2048 |
| No shadow at all | `renderer.shadowMap.enabled` false, light `castShadow` false, or drei `<ContactShadows>` with three r186 | Check the flags. Use the template's ShadowMaterial ground |

## Interaction & layout

| Symptom | Cause | Fix |
|---|---|---|
| Can't scroll the page on phones | Canvas `touch-action: none` | Touch guard (`interaction.touchGuard: 'auto'`) |
| Model cropped on phones | Fit based on vertical FOV only | Box-based fit with horizontal FOV (templates). Re-fit on container resize |
| Canvas blank after a tab/accordion opens | Initialized at 0×0 | Use ResizeObserver (templates), or mount when visible |
| Blurry canvas | DPR set to 1, or CSS scaling the canvas | `setPixelRatio(min(dpr, 2))`, and size via `setSize(w, h, false)` plus CSS 100% |
| Jagged edges | `antialias: false`, or post-processing without SMAA/FXAA | `antialias: true`, or add an SMAA pass |
| Option does nothing | Part matched nothing (name mismatch, sanitized node names) | The console warning names it. Check with `viewer.part('id')` against the inspector names. Prefer material names |
| First click on an option stutters | Shader compile for a new material | `renderer.compile(scene, camera)` after load. Or pre-warm by applying each option once, hidden, on load |

## Performance

| Symptom | Cause | Fix |
|---|---|---|
| Laggy dragging on phones | Too many draw calls or triangles, or DPR 3 | Inspector numbers vs. budgets. `--simplify`, fewer materials, DPR cap 1.5 |
| Laptop fans spin while idle | Continuous render loop | Render on demand (templates) |
| Page slow even before scrolling to the 3D | Everything loads eagerly | Lazy-mount the viewer near the viewport. Preload only when above the fold |
| Memory grows on SPA navigation | Not disposing | `viewer.dispose()` on unmount (the R3F Canvas does it automatically) |
