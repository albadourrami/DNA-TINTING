// Mercedes-AMG C63 sedan — sedan/coupe slot.
// Built by tools/vehicles/build_vehicle.py (recipe 'c63'): real scale, premium blue paint,
// generated cabin, per-window glass meshes, DNA Tinting plates, quad exhaust, diffuser and
// red brake calipers (the source model has none of those).
export default {
  id: 'amg-c63',
  make: 'Mercedes-AMG',
  model: 'C63',
  bodyType: 'sedan',                                   // which price table (pricing.js)
  modelUrl: 'assets/vehicles/amg-c63/amg-c63.glb',
  thumb: 'assets/vehicles/amg-c63/thumb.webp',
  poster: 'assets/vehicles/amg-c63/poster.webp',
  credit: '',
  rotation: [0, 0, 0],
  camera: { azimuth: 36, elevation: 9, distance: 1 },
  glass: {
    frontDriver: { meshes: ['Glass_FrontDriver'] },
    frontPassenger: { meshes: ['Glass_FrontPassenger'] },
    rearDriver: { meshes: ['Glass_RearDriver'] },
    rearPassenger: { meshes: ['Glass_RearPassenger'] },
    rearWindow: { meshes: ['Glass_RearWindow'] },
  },
  // depth = how far down from the top edge the strip reaches, along the glass (0.127 m = 5 in).
  // The full windshield can be tinted too (a separate, pricier option).
  windshield: { meshes: ['Glass_Windshield'], strip: { depth: 0.127 }, full: true },
  pricing: {},                                         // overrides for pricing.js defaults
};
