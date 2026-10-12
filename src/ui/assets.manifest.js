// src/ui/assets.manifest.js  (owner: ui) — every file this area loads, relative to public/assets/ (GAME_DESIGN §18.4, §19.6).
// The ui is pure HTML/CSS/SVG; its only file is the Fredoka woff2 Latin subset (ART §9.2, PERF I2; registered by
// fonts.js through ctx.assets.url). The credits screen reads LICENSES.md, which the prune step always keeps.
export default [
  'fonts/Fredoka-Latin.woff2',
];
