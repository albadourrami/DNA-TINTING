// ─────────────────────────────────────────────────────────────────────────────
//  model.config.js — the ONLY file you edit to swap the model or its options.
//
//  To replace the model:
//   1. node <skill>/scripts/inspect_model.mjs new-model.glb   → note mesh/material names
//   2. node <skill>/scripts/optimize_model.mjs new-model.glb models/model.glb
//   3. Update `model.url`, then point `parts` at the new names. Options/UI follow automatically.
//
//  Names in `parts` match glTF material names, or mesh/node names (exact, case-insensitive,
//  `*` wildcards allowed). Prefer materials: one material usually covers the whole part.
// ─────────────────────────────────────────────────────────────────────────────

export default {
  model: {
    url: '/models/model.glb',        // files in /public are served from the site root
    poster: '/models/poster.webp',     // static image: loading placeholder + no-WebGL fallback
    alt: 'Product in 3D',               // screen-reader description
    center: true,                       // center on x/z and rest on the ground
    normalizeSize: null,                // e.g. 4 → largest side becomes 4 units (null = keep real size)
    rotation: [0, 0, 0],                // degrees — fix models exported facing the wrong way
    animation: false,                   // true = autoplay first clip, or a clip name
  },

  camera: {
    fov: 35,                            // 30–40 looks "product photo"; wider distorts
    start: { azimuth: 30, elevation: 12, distance: 1 }, // degrees; distance × auto-fit distance
    minDistance: 0.45,
    maxDistance: 2.2,
    minElevation: -2,                   // keep the camera above the floor
    maxElevation: 80,
    enablePan: false,                   // panning mostly confuses shoppers; keep off
    autoRotate: true,                   // pauses on interaction, off with reduced-motion
    autoRotateSpeed: 0.6,
    views: [
      { id: 'front', label: 'Front', azimuth: 0, elevation: 8, distance: 0.95 },
      { id: 'side', label: 'Side', azimuth: 90, elevation: 5, distance: 0.95 },
      { id: 'rear', label: 'Rear', azimuth: 180, elevation: 10, distance: 0.95 },
      { id: 'top', label: 'Top', azimuth: 30, elevation: 70, distance: 1.1 },
    ],
  },

  environment: {
    preset: 'room',                     // 'room' (built-in studio, zero download) or an .hdr URL
    intensity: 1,
    rotation: 0,                        // degrees — rotate reflections to taste
    background: 'transparent',          // 'transparent' (CSS stage bg shows), '#hex', or 'environment'
  },

  lighting: {
    toneMapping: 'neutral',             // 'neutral' (true colors) | 'agx' | 'aces' (punchy) | 'none'
    exposure: 1,
    keyLight: { intensity: 1.2, azimuth: 40, elevation: 55 },
    shadows: 'soft',                    // 'soft' (shadow map) | 'blob' (cheap) | 'none'
    shadowOpacity: 0.35,
  },

  quality: {
    maxPixelRatio: 2,                   // retina is plenty; 3x phones waste GPU
    mobileMaxPixelRatio: 1.5,
    antialias: true,
    shadowMapSize: 2048,
    mobileShadowMapSize: 1024,
  },

  interaction: {
    touchGuard: 'auto',                 // phones: "tap to interact" so page scrolling still works
  },

  ui: {
    panel: 'auto',                      // 'auto' | 'none' (canvas only)
    toolbar: true,
    hint: true,
    screenshot: false,                  // adds a "save image" button
  },

  // Friendly part names → what they are in the model file.
  parts: {
    // windows: { materials: ['Glass'] },
    // paint:   { materials: ['Paint*'] },
    // wheels:  { meshes: ['Wheel*'] },
  },

  // Each option becomes a UI control and can be driven from your own code:
  //   viewer.setOption('tint', '20')
  //
  // type 'swatches': choices apply `material` props to every material of `part`.
  //   material props: any three.js material property (color, roughness, metalness, opacity,
  //   emissive, clearcoat…), or { glass: { tint, visibleLight } } for tinted glass.
  // type 'variants': KHR_materials_variants baked into the file (choices optional).
  // type 'toggle':   show/hide `part`.
  // type 'views':    buttons for camera.views.
  options: [
    // {
    //   id: 'tint', label: 'Window tint', type: 'swatches', part: 'windows', default: '35',
    //   choices: [
    //     { id: '70', label: '70%', swatch: '#8d969c', description: 'Lightest legal film', material: { glass: { visibleLight: 0.7 } } },
    //     { id: '35', label: '35%', swatch: '#4a5157', material: { glass: { visibleLight: 0.35 } } },
    //     { id: '5',  label: '5%',  swatch: '#121518', description: 'Limo', material: { glass: { visibleLight: 0.05 } } },
    //   ],
    // },
    // { id: 'finish', label: 'Color', type: 'variants' },
    // { id: 'wheels', label: 'Show wheels', type: 'toggle', part: 'wheels', default: true },
    { id: 'view', label: 'View', type: 'views' },
  ],

  // Labels pinned to the model. `position` is in the model's own coordinates (as in Blender/
  // glTF, before centering), or use `node: 'MeshName'` to pin to a part's center.
  hotspots: [
    // { id: 'glass', label: 'Ceramic film', node: 'Windshield', view: 'front' },
  ],
};
