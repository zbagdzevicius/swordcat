// src/ui/assets.manifest.js  (owner: ui) — every file this area loads, relative to public/assets/ (GAME_DESIGN §18.4, §19.6).
// The ui is pure HTML/CSS/SVG plus the Token Tails brand files: the Nunito (Latin, Latin Extended), Passion One 900 and
// Fredoka woff2 faces with their OFL licences (registered by fonts.js through ctx.assets.url; index.html preloads the
// Nunito Latin file) and the Token Tails logo on the title / credits co-brand line. The credits screen reads LICENSES.md,
// which the prune step always keeps.
export default [
  'fonts/nunito-latin-wght-normal.woff2',
  'fonts/nunito-latin-ext-wght-normal.woff2',
  'fonts/passion-one-latin-900-normal.woff2',
  'fonts/Fredoka-Latin.woff2',
  'fonts/licenses/LICENSE-nunito.txt',
  'fonts/licenses/LICENSE-passion-one.txt',
  'fonts/licenses/Fredoka-OFL.txt',
  'ui/tokentails-logo.webp',
  'ui/tokentails-logo-text.webp',
];
