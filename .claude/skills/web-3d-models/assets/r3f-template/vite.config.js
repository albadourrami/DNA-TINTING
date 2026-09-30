import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // .glb/.hdr imported from src/ get hashed URLs; files in public/ are copied as-is.
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.hdr', '**/*.ktx2'],
  // three + R3F + drei is ~290 KB gzipped; it's lazy-loaded (see App.jsx), so the warning is noise.
  build: { chunkSizeWarningLimit: 1200 },
});
