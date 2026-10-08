// src/companions/assets.manifest.js  (owner: companions) — every file this area loads, relative to public/assets/.
// Kittens, cages, nets, bubbles and the Shield Wall are procedural (characters' buildKitten / buildCage + ours).
export default [
  'models/creatures/monsters-flying/Dragon_Evolved.glb',     // Pudding (Pudding.js)
  'models/creatures/monsters-blob/Pigeon.glb',               // Coo the courier pigeon (NpcActor.js)
  'models/env/village-kaykit/decoration/barrel.glb',         // lost-kitten hiding barrel (LostKitten.js HIDE_PROPS)
  'models/env/nature/plant_bushLarge.glb',                   // lost-kitten hiding bush (LostKitten.js HIDE_PROPS)
];

/** Per-level preloads (each path is also in the default list). Pudding appears in meadow (CS-03 on). */
export const levels = {
  meadow: ['models/creatures/monsters-flying/Dragon_Evolved.glb', 'models/env/village-kaykit/decoration/barrel.glb'],
  town: ['models/creatures/monsters-blob/Pigeon.glb'],
};
