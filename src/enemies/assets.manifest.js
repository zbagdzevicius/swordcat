// src/enemies/assets.manifest.js  (owner: enemies) — every file this area loads, relative to public/assets/ (GAME_DESIGN §18.4, §19.6).
// Enemy gear (helms, spears, bucklers, hoods, crow hoods), beast heads, plates and cages are procedural (props.js +
// characters). `levels` = what LevelManager preloads per level (§10.2 "Levels" column + the boss and CS-02 casts).
const RAT = 'models/creatures/polypizza/Rat.glb';
const PIGEON = 'models/creatures/monsters-flying/Pigeon.glb';
const XBOW = 'models/weapons/kaykit/crossbow_1handed.glb';
const BARBARIAN = 'models/characters/kaykit/Barbarian.glb';
const ROGUE = 'models/characters/kaykit/Rogue_Hooded.glb';
const KNIGHT = 'models/characters/kaykit/Knight.glb';
const BLADE = 'models/weapons/skeleton/Skeleton_Blade.glb';   // Squeakybones (+ the hyenas' missing-prop fallback only)
const SPIDER = 'models/creatures/polypizza/Spider.glb';
const SLIME = 'models/creatures/polypizza/Slime.glb';
const SKELETONS = ['models/creatures/skeletons/Skeleton_Minion.glb', 'models/creatures/skeletons/Skeleton_Warrior.glb',
  'models/creatures/skeletons/Skeleton_Rogue.glb', 'models/creatures/skeletons/Skeleton_Mage.glb'];
const SKELETON_GEAR = ['models/weapons/skeleton/Skeleton_Axe.glb', 'models/weapons/skeleton/Skeleton_Staff.glb',
  'models/weapons/skeleton/Skeleton_Shield_Small_A.glb'];
const SABRE = 'models/weapons/quaternius/Sword_B.glb';
const CLEAVER = 'models/weapons/quaternius/Claymore.glb';
const MVP_PLUS = ['models/creatures/animals/Husky.glb', 'models/creatures/polypizza/Bat.glb', 'models/creatures/polypizza/Wasp.glb'];

export default [RAT, PIGEON, XBOW, BARBARIAN, ROGUE, KNIGHT, BLADE, SPIDER, SLIME, ...SKELETONS, ...SKELETON_GEAR, SABRE, CLEAVER, ...MVP_PLUS];

// Gloomjellies are procedural since M2 (Slime.glb stays listed: the §10.2 fallback model and its U11 clip map).
export const levels = {
  meadow: [RAT, XBOW, PIGEON, BARBARIAN, ROGUE, KNIGHT],                        // rats, crows + the CS-02 cast (squeaky bones are procedural)
  forest: [RAT, XBOW, PIGEON, SPIDER, SABRE],                                    // + B1 Grizzlechop (Rat.glb ×2 + sabre)
  town: [RAT, XBOW, PIGEON, ROGUE, KNIGHT],                                      // stealers, pugs, Pilfer's chase
  gate: [BARBARIAN, ROGUE, KNIGHT, RAT, XBOW, PIGEON],                           // The Line + B2 Cacklejaw (+ clones)
  bog: [RAT, XBOW, PIGEON, SPIDER, ROGUE, KNIGHT],
  keep: [BARBARIAN, BLADE, KNIGHT, PIGEON, RAT, XBOW, ...SKELETONS, ...SKELETON_GEAR, CLEAVER],
};
