// Mercedes-Benz C-Class (sedan).
// Waiting on a licensed 3D model: drop it at assets/vehicles/c-class/c-class.glb, set
// modelUrl, then map the glass (start with glass: 'auto' and ?studio-debug).
export default {
  id: 'c-class',
  make: 'Mercedes-Benz',
  model: 'C-Class',
  bodyType: 'sedan',
  modelUrl: null, // 'assets/vehicles/c-class/c-class.glb'
  photo: 'assets/vehicles/c-class/photo.webp',
  thumb: 'assets/vehicles/c-class/thumb.webp',
  credit: '',
  rotation: [0, 0, 0],
  camera: { azimuth: 35, elevation: 8, distance: 1 },
  glass: 'auto',
};
