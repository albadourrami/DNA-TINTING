// Mercedes-Benz GLS 580 — SUV slot.
// Built from the purchased model by tools/vehicles/build_vehicle.py (recipe 'gls'): real scale,
// cleaned SketchUp geometry, PBR materials, per-window glass meshes, DNA Tinting plates.
export default {
  id: 'mercedes-gls',
  make: 'Mercedes-Benz',
  model: 'GLS',
  bodyType: 'suv_truck',
  modelUrl: 'assets/vehicles/mercedes-gls/mercedes-gls.glb',
  thumb: 'assets/vehicles/mercedes-gls/thumb.webp',
  poster: 'assets/vehicles/mercedes-gls/poster.webp',
  credit: '',
  rotation: [0, 0, 0],
  camera: { azimuth: 36, elevation: 9, distance: 1 },
  // Rear windows = the rear door glass. The third-row quarter glass is its own pair of
  // windows (quarterDriver/quarterPassenger): the customer says whether their SUV has them.
  // The panoramic roof (Glass_Roof) isn't tintable and stays factory glass.
  glass: {
    frontDriver: { meshes: ['Glass_FrontDriver'] },
    frontPassenger: { meshes: ['Glass_FrontPassenger'] },
    rearDriver: { meshes: ['Glass_RearDriver'] },
    rearPassenger: { meshes: ['Glass_RearPassenger'] },
    rearWindow: { meshes: ['Glass_RearWindow'] },
    quarterDriver: { meshes: ['Glass_QuarterDriver'] },
    quarterPassenger: { meshes: ['Glass_QuarterPassenger'] },
  },
  windshield: { meshes: ['Glass_Windshield'], strip: { depth: 0.127 }, full: true },
  pricing: {},
};
