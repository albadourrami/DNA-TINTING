// Audi A3 (3-door Sportback) — sedan/coupe slot.
// Built from the purchased model by tools/vehicles/build_vehicle.py (recipe 'a3'): real scale,
// PBR materials, generated cabin, per-window glass meshes, DNA Tinting plates.
export default {
  id: 'audi-a3',
  make: 'Audi',
  model: 'A3',
  bodyType: 'sedan',                                   // which price table (pricing.js)
  modelUrl: 'assets/vehicles/audi-a3/audi-a3.glb',
  thumb: 'assets/vehicles/audi-a3/thumb.webp',
  poster: 'assets/vehicles/audi-a3/poster.webp',
  credit: '',
  rotation: [0, 0, 0],
  camera: { azimuth: 36, elevation: 10, distance: 1 },
  // Window meshes (named by the build script). This model is a 3-door, so the "rear"
  // windows are its rear quarter windows.
  glass: {
    frontDriver: { meshes: ['Glass_FrontDriver'] },
    frontPassenger: { meshes: ['Glass_FrontPassenger'] },
    rearDriver: { meshes: ['Glass_RearDriver'] },
    rearPassenger: { meshes: ['Glass_RearPassenger'] },
    rearWindow: { meshes: ['Glass_RearWindow'] },
  },
  // The windshield is never tinted as a whole; the strip is its top band.
  // depth = how far down from the top edge, measured along the glass (0.127 m = 5 in).
  windshield: { meshes: ['Glass_Windshield'], strip: { depth: 0.127 } },
  pricing: {},                                         // overrides for pricing.js defaults, e.g. { perWindow: 55 }
};
