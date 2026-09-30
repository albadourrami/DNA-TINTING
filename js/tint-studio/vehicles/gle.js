// Mercedes-Benz GLE (SUV).
// Waiting on a licensed 3D model: drop it at assets/vehicles/gle/gle.glb, set modelUrl,
// then map the glass (start with glass: 'auto' and ?studio-debug).
export default {
  id: 'gle',
  make: 'Mercedes-Benz',
  model: 'GLE',
  bodyType: 'suv_truck',
  modelUrl: null, // 'assets/vehicles/gle/gle.glb'
  photo: 'assets/vehicles/gle/photo.webp',
  thumb: 'assets/vehicles/gle/thumb.webp',
  credit: '',
  rotation: [0, 0, 0],
  camera: { azimuth: 35, elevation: 8, distance: 1 },
  glass: 'auto',
};
