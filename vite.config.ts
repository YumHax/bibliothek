import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { youtubeSearchApi } from './server/youtubeSearchPlugin';
import { artCacheApi } from './server/artCachePlugin';
import { libretroIndexApi } from './server/libretroIndexPlugin';

export default defineConfig({
  plugins: [youtubeSearchApi(), artCacheApi(), libretroIndexApi()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // three.js is ~700 kB minified and changes only on upgrade: keep it in its own long-cached chunk.
        manualChunks: (id) => (id.includes('node_modules/three/') ? 'three' : undefined),
      },
    },
  },
});
