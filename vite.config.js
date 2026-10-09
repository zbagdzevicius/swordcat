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
  // SMOKE_NOHMR=1 npx vite --port <p> --strictPort : no HMR / file watching, so other agents' saves cannot
  // full-reload a page mid-smoke (changed files are still served fresh on the next page load).
  server: process.env.SMOKE_NOHMR ? { port: 5173, hmr: false, watch: null } : { port: 5173 },
  preview: { port: 4173, strictPort: true },
});
