// src/fx/assets.manifest.js  (owner: fx) — every file this area loads, relative to public/assets/ (GAME_DESIGN §18.4, §19.6).
// fx is procedural (shaders, primitives, pooled sprites); the only file is the damage-number font (§8.3: Fredoka 700),
// loaded by DamageNumbers when the ui stylesheet has not declared Fredoka yet.
export default [
  'fonts/Fredoka-Latin.woff2',
];
