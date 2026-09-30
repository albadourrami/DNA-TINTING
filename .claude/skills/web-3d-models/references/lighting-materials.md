# Lighting, materials, shadows, cameras

The goal is "product photography," not "video game." Most of the realism comes from four things: image-based lighting, correct color management, a grounding shadow, and a sane camera.

## Color pipeline (get this right first)

- `renderer.outputColorSpace = SRGBColorSpace` (the three.js default since r152). The templates set it explicitly.
- Base color and emissive textures are sRGB. Normal, roughness/metal, and AO are linear. GLTFLoader handles this, but hand-made `TextureLoader` textures need `tex.colorSpace = SRGBColorSpace` for color maps.
- **Tone mapping:**

  | Mode | Use for |
  |---|---|
  | `neutral` (Khronos PBR Neutral) | E-commerce and brand colors: what you pick is what you see. Template default |
  | `agx` | Filmic, handles bright highlights gracefully |
  | `aces` | Punchy and contrasty. Saturated colors shift (reds go orange) |

- Tune `exposure` 0.8–1.3 before touching light intensities.

## Environment (reflections are 70% of realism)

- **`RoomEnvironment`** (built-in, zero download): a neutral studio box. Great for cars, products, and metal. Template default.
- **HDRI**: soft 1k–2k studio HDRs from Poly Haven ("studio_small_09," "photo_studio_loft_hall"). Keep them under 2 MB, and use `.hdr`, not EXR, for the web.
  - Set `environment.preset: './env/studio.hdr'`.
  - `environment.rotation` moves the reflections, and car paint looks best with a long highlight along the body line.
  - `background: 'environment'` plus `backgroundBlur: 0.4` shows the HDR, blurred.
- **Lightformers (R3F)**: rectangular light panels in an environment scene. They give the classic "studio strip" reflections on paint and glass.
- `environmentIntensity` 0.8–1.5. A black or dull model usually means there's no environment at all. Metals are black without one.

## Direct lights

- One **key** directional light for the shadow and a subtle form highlight: intensity 1–2, elevation 45–60°. The environment does the rest.
- Rim or fill lights only if the environment is too even. Every shadow-casting light is an extra render pass.
- Point lights from `KHR_lights_punctual` in the file are imported automatically. Check the inspector's "embedded lights" line if the model looks blown out.

## Shadows

| Mode (`lighting.shadows`) | Cost | Look |
|---|---|---|
| `soft` | One shadow map, rendered once for static models | Directional, soft edges (PCF, `shadow.radius`). Default |
| `blob` | Free | Radial gradient under the model. Fine for phones and busy layouts |
| `none` | – | Floating model. Only for designs that want it |

Key settings:
- Shadow camera bounds must tightly fit the model. The engine sizes them from the bounding radius. Loose bounds give blurry, pixelated shadows.
- `bias -0.0005` and `normalBias ≈ radius × 0.004` prevent shadow acne (striped self-shadowing).
- `receiveShadow = false` on the model itself (acne on glossy paint), and `true` only on the ground.
- Note: `PCFSoftShadowMap` was removed in three r18x. Use `PCFShadowMap` with `shadow.radius`.

## Materials

- **Car paint:**
  - `MeshPhysicalMaterial` with `metalness 0.5–0.9`, `roughness 0.2–0.4`, `clearcoat 1`, `clearcoatRoughness 0.03–0.1`.
  - Pearl or flip paints: `iridescence` or `sheen`.
  - Recolor with `{ color }` swatches. Keep the clearcoat.
- **Glass:**
  - True refraction (`transmission: 1`, `ior 1.5`, `thickness`) looks great but costs an extra full-scene render pass and is often muddy or black on phones.
  - For tint and windows, prefer the template's `glass` shorthand: transparent, reflective, `depthWrite false`, double-sided, with opacity driven by `visibleLight`.
  - Render order issues (interior disappearing behind glass) → set `renderOrder` on the glass meshes higher than the interior, or use `depthWrite: false` (the shorthand does).
- **Chrome/metal:** `metalness 1`, `roughness 0.05–0.2`. Only reads as chrome with an environment.
- **Plastic/rubber:** `metalness 0`, `roughness 0.5–0.9`. Tires: `roughness 0.8`, near-black `#111`.
- **Emissive (lights, screens):** `emissive` color plus `emissiveIntensity 2–5`. Add bloom only on desktop.
- **Fabric:** `sheen 1`, `sheenColor`, `sheenRoughness 0.5`.
- **Texture filtering:** the engine sets max anisotropy on color maps, so grazing-angle textures (tire sidewalls, floors) stay sharp.

## Cameras

- **FOV 30–40°** for products. Wider (50–75°) distorts like a phone selfie; narrower flattens.
- **Start angle**: 3/4 front (azimuth 25–40°, elevation 8–15°) is the universal "hero" shot for vehicles and products.
- **Limits:**
  - `minElevation` just above 0 (don't see under the floor).
  - `maxElevation` ~80°.
  - `minDistance` ~0.45× fit (no clipping inside).
  - `maxDistance` ~2.2× fit.
- **Near/far** from the bounding radius (`r/100`, `r·100`) avoids z-fighting on large or small models.
- **Views:** 3–5 named angles (front, side, rear, interior, detail). Animate between them over 0.6–1 s with ease-in-out, and skip the animation under reduced-motion.
