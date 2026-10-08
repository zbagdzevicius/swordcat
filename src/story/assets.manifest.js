// src/story/assets.manifest.js  (owner: story) — every file this area loads, relative to public/assets/ (GAME_DESIGN §18.4,
// §19.6). The fonts are the story overlay's (Overlay.js: logo, chapter cards, captions, dialogue fallback); the chest
// is CS-01's "M. — my first" (Kenney Mini Dungeon; its sibling Textures/colormap.png ships with it).
export default [
  'fonts/CinzelDecorative-Bold.ttf',
  'fonts/Cinzel-Variable.ttf',
  'fonts/UncialAntiqua-Regular.ttf',
  'fonts/Fredoka-Variable.ttf',
  'models/env/dungeon-mini/chest.glb',
];

/** Per-level preloads: CS-01's chest lives in the meadow prologue. */
export const levels = {
  meadow: ['models/env/dungeon-mini/chest.glb'],
};
