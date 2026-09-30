// Stand-in 3D model until licensed Mercedes-Benz models are supplied.
// Source: Khronos glTF sample "Car Concept" (CC BY 4.0) — logos removed, repainted silver
// by tools/vehicles/prepare-concept-demo.mjs.
export default {
  enabled: false, // Hidden from customers: stand-in model kept for development/testing.
  id: 'concept-demo',
  make: 'DNA Studio',
  model: 'Concept Coupe',
  badge: '3D demo',
  bodyType: 'sedan',
  modelUrl: 'assets/vehicles/concept-demo/concept-demo.glb',
  photo: null,
  thumb: 'assets/vehicles/concept-demo/thumb.webp',
  poster: 'assets/vehicles/concept-demo/poster.webp',
  credit: '3D demo model: “Car Concept” by Eric Chadwick / Darmstadt Graphics Group, CC BY 4.0 (modified).',
  rotation: [0, 0, 0],
  camera: { azimuth: 38, elevation: 9, distance: 1 },
  // Found with inspect_model.mjs: five glass meshes; both rear side windows share one mesh.
  windshield: { meshes: ['BodyWindshield'], strip: { depth: 0.1 } },
  glass: {
    frontDriver: { meshes: ['BodyDoorLWindow'] },
    frontPassenger: { meshes: ['BodyDoorRWindow'] },
    rearDriver: { meshes: ['BodyWindowsRearSides'], side: 'driver' },
    rearPassenger: { meshes: ['BodyWindowsRearSides'], side: 'passenger' },
    rearWindow: { meshes: ['BodyRearwindow'] },
  },
};
