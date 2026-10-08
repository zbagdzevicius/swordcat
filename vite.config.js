// vite.config.js  (owner: core) — tech.md §1 + GAME_DESIGN §19.1 A9.
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',                       // relative paths: dist/ works from any static host or subfolder
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
    assetsDir: 'bundle',            // hashed JS/CSS never mix with the copied dist/assets/ library (R17)
  },
  server: { port: 5173 },
  preview: { port: 4173, strictPort: true },
});
