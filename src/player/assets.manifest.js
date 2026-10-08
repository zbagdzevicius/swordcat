// src/player/assets.manifest.js  (owner: player) — every file this area loads, relative to public/assets/.
// M0: the placeholder Swordcat (Cat_Blocky + KayKit two-handed sword), preloaded for every level.
const placeholder = ['models/cats/Cat_Blocky.glb', 'models/weapons/kaykit/sword_2handed.glb'];
export const levels = { '*': placeholder };
export default [...placeholder];
