// vite.config.js  (owner: core) — tech.md §1 + GAME_DESIGN §19.1 A9 + PERF_SPEC §10.2 (chunk groups).
import { defineConfig } from 'vite';

/**
 * PERF §10.2 chunk groups (Rolldown `codeSplitting.groups`; scripts/bundle-budget.mjs checks each against its gz
 * budget after `vite build`): `three` (core build) and `three-addons` (loaders, utils, decoders) are long-cached vendor
 * chunks. C16: `core/systems.js` loads every system with a dynamic import, so each system is its own chunk and the
 * boot / play / story groups are read from the chunk graph (`build.manifest`) by the budget script instead of being
 * forced here (a group pulls its dependencies in, so a `boot` group would swallow core modules play shares). Levels,
 * cutscenes and debug.js / lil-gui / stats stay lazy chunks.
 */
export const CHUNK_GROUPS = [
  { name: 'three', test: /node_modules[\/]three[\/]build[\/]/, priority: 30 },
  { name: 'three-addons', test: /node_modules[\/]three[\/]examples[\/]jsm[\/](?!libs[\/](?:stats|lil-gui|meshopt_simplifier))/, priority: 25 },
];

export default defineConfig({
  base: './',                       // relative paths: dist/ works from any static host or subfolder
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
    assetsDir: 'bundle',
    manifest: true,                 // dist/.vite/manifest.json: the chunk graph scripts/bundle-budget.mjs groups by            // hashed JS/CSS never mix with the copied dist/assets/ library (R17)
    rolldownOptions: {
      output: {
        // levels (src/world/levels/*) are lazy chunks via LevelManager's dynamic imports
        codeSplitting: { groups: CHUNK_GROUPS },
      },
    },
  },
  // SMOKE_NOHMR=1 npx vite --port <p> --strictPort : no HMR / file watching, so other agents' saves cannot
  // full-reload a page mid-smoke (changed files are still served fresh on the next page load).
  server: process.env.SMOKE_NOHMR ? { port: 5173, hmr: false, watch: null } : { port: 5173 },
  preview: { port: 4173, strictPort: true },
});
