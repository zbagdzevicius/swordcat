// src/story/assets.manifest.js  (owner: story) — every file this area loads, relative to public/assets/ (GAME_DESIGN §18.4,
// §19.6). No fonts (ART §9.2: the overlay uses ui's one Fredoka woff2 through the --f-* variables). The chest
// is CS-01b's "M. — my first" (Kenney Mini Dungeon; its sibling Textures/colormap.png ships with it).
export default [
  'models/env/dungeon-mini/chest.glb',
];

/** Per-level preloads: CS-01's chest lives in the meadow prologue. */
export const levels = {
  meadow: ['models/env/dungeon-mini/chest.glb'],
};
