// vite.config.js  (owner: core) — tech.md §1 + GAME_DESIGN §19.1 A9 + PERF_SPEC §10.2 (chunk groups).
import { defineConfig } from 'vite';
import { absoluteSocialUrls, brandHtml } from './scripts/social-meta.mjs';
import { BRAND } from './src/core/brand.js';

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
  // share cards need absolute image URLs (scripts/social-meta.mjs); build only, so the dev server keeps og.jpg relative
  plugins: [
    // TOKENTAILS-PLAN §10.4: index.html's %GAME_TITLE% / %GAME_SUBTITLE% / … placeholders come from src/core/brand.js
    // (dev and build; 'pre' so it runs before Vite's own %ENV% replacement)
    { name: 'tt-brand', transformIndexHtml: { order: 'pre', handler: (html) => brandHtml(html, BRAND) } },
    { name: 'tt-social-meta', apply: 'build', transformIndexHtml: (html) => absoluteSocialUrls(html, process.env.VITE_SITE_URL, process.env.VITE_PAGE_URL) },
  ],
  base: './',                       // relative paths: dist/ works from any static host or subfolder
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
    assetsDir: 'bundle',            // hashed JS/CSS never mix with the copied dist/assets/ library (R17)
    manifest: true,                 // dist/.vite/manifest.json: the chunk graph scripts/bundle-budget.mjs groups by
    rolldownOptions: {
      output: {
        // levels (src/world/levels/*) are lazy chunks via LevelManager's dynamic imports
        codeSplitting: { groups: CHUNK_GROUPS },
      },
    },
  },
  // `vite build --outDir dist-test` (npm run build:test) overrides build.outDir; nothing here pins it.
  // SMOKE_NOHMR=1 npx vite --port <p> --strictPort : no HMR and no file watcher, so other agents' saves cannot
  // full-reload a page mid-smoke. Without the watcher Vite never invalidates its transform cache either: an edited
  // module keeps being served in its old form until that dev server restarts (restart it after your own edits).
  // Dev default 5175 (5173 is the Token Tails catnip-heist dev server; the Token Tails embed uses
  // NEXT_PUBLIC_SWORDCAT_URL=http://localhost:5175/).
  server: process.env.SMOKE_NOHMR ? { port: 5175, hmr: false, watch: null } : { port: 5175 },
  preview: { port: 4173, strictPort: true },
});
