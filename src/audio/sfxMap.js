// src/audio/sfxMap.js  (owner: audio) — GAME_DESIGN §16.2 SFX map + §8.1 telegraph sounds + §8.2 juice audio,
// bound to bus events by `bindSfx(am)`. Data first (pure, node-safe), then the bindings.
//
// Sound ids accepted by ctx.audio.play2D / play3D:
//   - a name from SFX below            'swishLight', 'parry', 'ui.click', 'kittenFound', ...
//   - a file id under audio/sfx/        'pickup/bubble2', 'creature/creature_roar_02'
//   - a GAME_DESIGN pattern              'impact/chain_0x', 'impact/impactSoft_heavy_00x', 'sword/swish_01–13',
//                                        'creature/c80_scream_01/02'  (a random existing variant is picked)
//   - a full path                        'audio/sfx/pickup/bubble2.ogg'
import { E } from '../core/events.js';
import { ATTACKS, ECONOMY } from '../core/config.js';

/** 'sword/swish_', 1, 13 → ['sword/swish_01', …, 'sword/swish_13'] (pad = digits; 0 = no padding). */
export function seq(prefix, from, to, pad = 2) {
  const out = [];
  for (let i = from; i <= to; i++) out.push(prefix + (pad ? String(i).padStart(pad, '0') : String(i)));
  return out;
}

/**
 * @typedef {object} SfxDef
 * @property {string[]} files   ids under audio/sfx/ (no extension); one is picked at random per play
 * @property {number} [vol]     gain (default 1; > 1 lifts quiet source files — levels in tests/unit/audio.test.js notes)
 * @property {number} [rate]    playback rate (default 1)
 * @property {number} [rateVar] ± random fraction (default 0.03)
 * @property {'player'|'world'|'ui'} [bus]  default: 'player' for 2D, 'world' for 3D
 * @property {number} [dur]     max seconds (faded out over the last 0.25 s)
 * @property {number} [minGap]  seconds between two starts of this def (default MIX.minGap)
 * @property {string[]} [also]  layered defs played with it (same position / options)
 * @property {string} [zzfx]    sfxDefs.js fallback when no file buffer is ready
 */

/** @type {Record<string, SfxDef>} */
export const SFX = {
  // ---------------------------------------------------------------- player (2D)
  swishLight:      { files: seq('sword/swish_', 1, 13), vol: 0.5, rateVar: 0.05 },
  swishHeavy:      { files: ['sword/swing', 'sword/swing2', 'sword/swing3'], vol: 0.65, rateVar: 0.04 },
  block:           { files: seq('impact/impactMetal_medium_', 0, 4, 3), vol: 0.8 },
  parry:           { files: seq('sword/sword_clash_', 1, 10), vol: 0.9, also: ['parryRing'] },
  parryRing:       { files: ['impact/metal_ringing'], vol: 0.45 },
  guardBreak:      { files: ['impact/metal_small1'], vol: 0.85, also: ['guardBreakPlate'] },
  guardBreakPlate: { files: ['impact/impactPlate_heavy_000'], vol: 0.9 },
  guardOn:         { files: ['impact/chainmail1'], vol: 0.22, minGap: 0.25 },
  chargeT1:        { files: ['pickup/powerup_rise01'], vol: 1, rateVar: 0 },
  chargeT2:        { files: ['pickup/powerup_rise03'], vol: 0.9, rateVar: 0 },
  chargeFizzle:    { files: ['ui/glitch_001'], vol: 0.3 },
  holySlash:       { files: ['magic/spell_fire_03'], vol: 3.5, also: ['holyImpact'] },
  holyImpact:      { files: seq('impact/impactMetal_heavy_', 0, 4, 3), vol: 0.7 },
  holyWave:        { files: ['magic/magic1'], vol: 0.7 },
  goldenOn:        { files: ['pickup/powerup_upper01'], vol: 0.8, rateVar: 0, also: ['goldenJingle'] },
  goldenJingle:    { files: seq('jingles/jingles_STEEL', 0, 4), vol: 0.55, rateVar: 0 },
  sunburst:        { files: ['magic/spell_fire_07'], vol: 2.5, also: ['sunburstImpact'] },
  sunburstImpact:  { files: seq('impact/impactPlate_heavy_', 0, 4, 3), vol: 0.8 },
  dodge:           { files: ['impact/cloth_heavy'], vol: 0.55, also: ['dodgeMail'] },
  dodgeMail:       { files: ['impact/chainmail2'], vol: 0.35 },
  perfectDodge:    { files: ['ui/glass_001'], vol: 0.4, rate: 1.2, rateVar: 0 },
  jump:            { files: ['impact/cloth'], vol: 0.4 },
  land:            { files: seq('impact/impactSoft_medium_', 0, 4, 3), vol: 0.55 },
  hurt:            { files: seq('impact/impactPlate_light_', 0, 4, 3), vol: 0.85, also: ['hurtVoice'] },
  hurtVoice:       { files: seq('cat/cute_creature_', 1, 10), vol: 0.7, rate: 1.2 },
  faint:           { files: ['cat/cat_softmew'], vol: 0.8, rate: 0.8, rateVar: 0 },
  ghostLife:       { files: ['pickup/powerup_downer01'], vol: 0.7, rateVar: 0 },
  meow:            { files: ['cat/kitten_mew_01', 'cat/meow_baby_01'], vol: 0.85, rateVar: 0.06, minGap: 0.2 },
  milkSip:         { files: ['pickup/bubble', 'pickup/bubble2', 'pickup/bubble3'], vol: 0.6 },
  vigil:           { files: ['cat/cat_purrsleepy_loop'], vol: 0.6, dur: 2, rateVar: 0, also: ['vigilMagic'] },
  vigilMagic:      { files: ['magic/magic1'], vol: 0.55 },
  stillStanding:   { files: ['magic/spell_02'], vol: 0.85, rateVar: 0 },
  // footsteps (2D for her, 3D for everyone else)
  footGrass:       { files: seq('footsteps/footstep_grass_', 0, 4, 3), vol: 0.75, rateVar: 0.06, minGap: 0.06 },
  footStone:       { files: ['footsteps/stone_l1', 'footsteps/stone_l2', 'footsteps/stone_l3', 'footsteps/stone_r1', 'footsteps/stone_r2', 'footsteps/stone_r3'], vol: 0.3, rateVar: 0.06, minGap: 0.06 },
  footWood:        { files: seq('footsteps/footstep_wood_', 0, 4, 3), vol: 0.3, rateVar: 0.06, minGap: 0.06 },
  footMud:         { files: ['footsteps/sand_l1', 'footsteps/sand_l2', 'footsteps/sand_l3', 'footsteps/sand_r1', 'footsteps/sand_r2', 'footsteps/sand_r3'], vol: 0.5, rateVar: 0.06, minGap: 0.06 },
  footDirt:        { files: ['footsteps/sand_l1', 'footsteps/sand_l2', 'footsteps/sand_l3', 'footsteps/sand_r1', 'footsteps/sand_r2', 'footsteps/sand_r3'], vol: 0.38, rate: 1.12, rateVar: 0.06, minGap: 0.06 },
  footSnow:        { files: seq('footsteps/footstep_snow_', 0, 4, 3), vol: 0.3, rateVar: 0.06, minGap: 0.06 },
  footWater:       { files: seq('creature/splash_', 1, 5), vol: 0.35, rate: 1.5, rateVar: 0.08, minGap: 0.06 },
  armorStep:       { files: ['impact/armor_light'], vol: 0.25, rateVar: 0.08, minGap: 0.1 },

  // ---------------------------------------------------------------- hits (3D at the hit point)
  hitFur:          { files: seq('sword/sword_attack_', 1, 10), vol: 0.8, rateVar: 0.05 },
  hitPlateLight:   { files: seq('impact/impactPlate_light_', 0, 4, 3), vol: 0.8, rateVar: 0.05 },
  hitPlateMedium:  { files: seq('impact/impactPlate_medium_', 0, 4, 3), vol: 0.85 },
  hitBone:         { files: seq('impact/impactWood_light_', 0, 4, 3), vol: 0.85 },
  hitBoneHeavy:    { files: seq('impact/impactWood_medium_', 0, 4, 3), vol: 0.9 },
  hitWood:         { files: seq('impact/impactWood_light_', 0, 4, 3), vol: 0.7 },
  hitWoodHeavy:    { files: seq('impact/impactWood_medium_', 0, 4, 3), vol: 0.8 },
  hitSlime:        { files: seq('creature/slime_', 1, 16), vol: 0.7 },
  hitHeavySword:   { files: ['sword/melee_sword'], vol: 0.8 },
  hitHeavyPunch:   { files: seq('impact/impactPunch_heavy_', 0, 4, 3), vol: 0.55 },
  hitStraw:        { files: seq('impact/impactSoft_medium_', 0, 4, 3), vol: 0.45, rate: 1.1, rateVar: 0.06, also: ['hitStrawRustle'] },
  hitStrawRustle:  { files: ['impact/cloth'], vol: 0.35, rate: 1.3 },
  hitStone:        { files: seq('impact/impactGeneric_light_', 0, 4, 3), vol: 0.8, rate: 0.8 },
  hitMetal:        { files: seq('impact/impactMetal_light_', 0, 4, 3), vol: 0.75 },
  hitRope:         { files: ['impact/cloth_heavy'], vol: 0.6, rate: 1.2 },
  killPoof:        { files: ['creature/creature_die_01'], vol: 0.7, also: ['killSparkle'] },
  killSparkle:     { files: ['pickup/powerup_fx01'], vol: 1, rate: 1.3, rateVar: 0.02 },
  reflect:         { files: seq('sword/sword_clash_', 1, 10), vol: 0.8, also: ['reflectMagic'] },
  reflectMagic:    { files: ['magic/spell_01'], vol: 0.5, rate: 1.4 },
  companionHurt:   { files: seq('cat/cute_creature_', 1, 10), vol: 0.6, rate: 1.25 },

  // ---------------------------------------------------------------- telegraphs (§8.1)
  tgParry:         { files: ['ui/glass_002'], vol: 0.55, rateVar: 0 },
  tgGold:          { files: ['ui/pluck_001'], vol: 0.65, rateVar: 0 },
  tgRed:           { files: seq('creature/c80_grunt_', 1, 5), vol: 0.75, rate: 0.7 },
  tgAoe:           { files: ['magic/spell_01'], vol: 0.6, rate: 0.8 },
  tgAim:           { files: ['world/metalClick'], vol: 1 },
  tgGrab:          { files: ['creature/c80_eat_01'], vol: 0.7 },
  tgShadow:        { files: ['impact/cloth'], vol: 0.6, rate: 0.85 },
  bossDizzy:       { files: ['jingles/jingles_NES03'], vol: 0.6, rateVar: 0 },

  // ---------------------------------------------------------------- creatures
  ratAttack:       { files: ['creature/rat_squeak_attack'], vol: 0.35, rateVar: 0.08, minGap: 0.15 },
  ratPain:         { files: ['creature/rat_squeak_pain'], vol: 0.4, rateVar: 0.08, minGap: 0.15 },
  ratDeath:        { files: ['creature/rat_squeak_death'], vol: 0.45, rateVar: 0.06 },
  crowCaw:         { files: ['creature/c80_scream_01', 'creature/c80_scream_02'], vol: 0.55, rate: 1.4, rateVar: 0.06, zzfx: 'crowCaw', minGap: 0.3 },
  crowWings:       { files: ['impact/cloth'], vol: 0.5, rate: 1.2 },
  spider:          { files: seq('creature/c80_bug_', 1, 4), vol: 0.6, rate: 1.3, minGap: 0.15 },
  jelly:           { files: [...seq('creature/slime_', 1, 16), ...seq('creature/rpg_slime', 1, 10, 0)], vol: 0.6, minGap: 0.1 },
  jellySplit:      { files: seq('creature/splash_', 1, 5), vol: 0.7 },
  hyenaHurt:       { files: seq('creature/c80_hurt_', 1, 5), vol: 0.65, rate: 1.2, minGap: 0.15 },
  hyenaChoke:      { files: ['creature/c80_cough_01'], vol: 0.75 },
  stealerSnatch:   { files: ['creature/c80_eat_01'], vol: 0.75 },
  pugBark:         { files: ['creature/c80_barking_01', 'creature/c80_barking_02', 'creature/animal_bark'], vol: 0.7, minGap: 0.25 },
  pugSnort:        { files: ['creature/c80_nose'], vol: 0.6 },
  boneClack:       { files: seq('impact/impactWood_light_', 0, 4, 3), vol: 0.6, rate: 1.15 },
  boneCollapse:    { files: seq('impact/impactWood_medium_', 0, 4, 3), vol: 0.8 },
  puddingRoar:     { files: [...seq('creature/creature_roar_', 1, 3), ...seq('creature/c80_roar_', 1, 3)], vol: 0.9, rate: 0.75, rateVar: 0.04 },
  puddingNervous:  { files: ['creature/c80_ooh'], vol: 0.7, rate: 0.8 },
  puddingSnore:    { files: ['creature/c80_snore'], vol: 1, rate: 0.6, rateVar: 0 },
  puddingPurr:     { files: ['cat/cat_purractive_loop'], vol: 0.45, rate: 0.6, rateVar: 0 },
  grizzleRoar:     { files: ['creature/rat_squeak_attack', 'creature/rat_squeak_pain'], vol: 0.5, rate: 0.8, also: ['grizzleMonster'] },
  grizzleMonster:  { files: seq('creature/rpg_mnstr', 1, 15, 0), vol: 0.7 },
  brutus:          { files: seq('creature/rpg_giant', 1, 5, 0), vol: 0.85, minGap: 0.3 },
  barkusBark:      { files: ['creature/c80_barking_01', 'creature/c80_barking_02'], vol: 0.95, rate: 0.7, also: ['barkusGiant'], minGap: 0.3 },
  barkusGiant:     { files: seq('creature/rpg_giant', 1, 5, 0), vol: 0.6 },
  barkusHowl:      { files: ['creature/c80_howl'], vol: 0.95, rate: 0.9, rateVar: 0 },
  ballista:        { files: seq('impact/impactWood_heavy_', 0, 4, 3), vol: 0.85 },
  bolt:            { files: ['sword/blade_01'], vol: 0.7 },
  cow:             { files: ['creature/animal_moo'], vol: 0.85, rateVar: 0.02 },
  donkey:          { files: ['creature/animal_whinny'], vol: 0.8 },
  coo:             { files: ['creature/animal_peeps'], vol: 0.7, rate: 0.7 },
  farDrums:        { files: seq('creature/c80_monster_', 1, 7), vol: 0.7, rate: 0.6 },

  // ---------------------------------------------------------------- pickups, rescues, world
  fish:            { files: seq('pickup/coins_', 1, 4), vol: 0.55, minGap: 0.05 },
  goldFish:        { files: ['pickup/coin2'], vol: 0.7 },
  smallHeart:      { files: ['pickup/gem_01'], vol: 0.6 },
  heartBell:       { files: ['pickup/powerup_rise05'], vol: 2, rateVar: 0, also: ['heartBellJingle'] },
  heartBellJingle: { files: ['jingles/jingles_NES02'], vol: 0.6, rateVar: 0 },
  letter:          { files: ['ui/bookFlip1'], vol: 0.7, also: ['letterJingle'] },
  letterJingle:    { files: ['jingles/jingles_NES00'], vol: 0.6, rateVar: 0 },
  milkPickup:      { files: ['pickup/bottle'], vol: 0.6 },
  kittenFound:     { files: seq('jingles/jingles_PIZZI', 0, 4), vol: 0.6, rateVar: 0, also: ['kittenMew'] },
  kittenMew:       { files: ['cat/kitten_mew_01'], vol: 0.75, rate: 1.3 },
  kittenChirp:     { files: seq('cat/cute_creature_', 1, 10), vol: 0.6 },
  nap:             { files: ['cat/cat_purrsleepy_loop'], vol: 0.45, dur: 1.5, rateVar: 0 },
  crateHit:        { files: seq('world/wood_hit_', 1, 3), vol: 0.75 },
  crateBreak:      { files: seq('world/wood_breaking_', 1, 2), vol: 0.8 },
  cageOpen:        { files: ['world/metal_open_01'], vol: 0.8 },
  lockOpen:        { files: ['world/lock_open_01'], vol: 0.8 },
  keys:            { files: ['world/keys_01'], vol: 0.7 },
  gateOpen:        { files: ['world/metal_open_01'], vol: 0.85 },
  gateClose:       { files: ['world/metal_close_01'], vol: 0.85 },
  winch:           { files: seq('impact/chain_', 1, 3), vol: 0.6 },
  splash:          { files: seq('creature/splash_', 1, 5), vol: 0.6 },
  shieldWall:      { files: seq('impact/impactMetal_heavy_', 0, 4, 3), vol: 0.7 },
  bellLayer:       { files: ['impact/metal_ringing'], vol: 0.3, rate: 0.5, rateVar: 0 },
  bellClunkLayer:  { files: ['impact/impactMetal_heavy_000'], vol: 0.5, rate: 0.6, rateVar: 0 },
  heartThump:      { files: [], zzfx: 'heartThump', vol: 0.9, rateVar: 0 },

  // ---------------------------------------------------------------- UI (2D, ui bus) — ui calls these by name
  'ui.click':      { files: seq('ui/click_', 1, 5, 3), vol: 0.5, bus: 'ui', rateVar: 0.02 },
  'ui.select':     { files: seq('ui/select_', 1, 8, 3), vol: 0.45, bus: 'ui', rateVar: 0.02 },
  'ui.confirm':    { files: ['ui/confirmation_001'], vol: 0.3, bus: 'ui', rateVar: 0 },
  'ui.back':       { files: ['ui/back_001'], vol: 0.5, bus: 'ui', rateVar: 0 },
  'ui.bookOpen':   { files: ['ui/bookOpen'], vol: 1, bus: 'ui' },
  'ui.bookClose':  { files: ['ui/bookClose'], vol: 0.6, bus: 'ui' },
  'ui.page':       { files: ['ui/bookFlip1'], vol: 0.55, bus: 'ui' },
  'ui.dialogOpen': { files: ['ui/scroll_001'], vol: 0.45, bus: 'ui' },
  'ui.stamp':      { files: ['ui/drop_002'], vol: 0.6, bus: 'ui' },
  'ui.error':      { files: ['ui/error_001'], vol: 0.45, bus: 'ui', rateVar: 0 },
  'ui.toggle':     { files: ['ui/toggle_001'], vol: 0.45, bus: 'ui', rateVar: 0 },
  'ui.blip':       { files: [], zzfx: 'blip', vol: 0.4, bus: 'ui' },
};

/**
 * Sounds the cutscenes (§5) name directly as file ids (`sfx` steps). Listed so the manifest ships them;
 * they are played by id, e.g. ctx.audio.play3D('creature/creature_roar_02', pos).
 */
export const CUTSCENE_SFX = [
  'ui/drop_001', 'ui/drop_002', 'ui/drop_003', 'cat/cat_purrsleepy_loop', 'cat/cat_purractive_loop', 'world/creak1', 'world/creak2',
  'sword/sword_unsheathe', 'sword/sword_unsheathe2', 'sword/sword_unsheathe3', 'impact/armor_light', 'impact/cloth', 'impact/cloth_heavy',
  ...seq('creature/c80_monster_', 1, 7), ...seq('impact/chain_', 1, 3), 'pickup/bubble', 'pickup/bubble2', ...seq('impact/impactSoft_heavy_', 0, 4, 3),
  ...seq('creature/creature_roar_', 1, 3), ...seq('creature/c80_roar_', 1, 3), 'creature/animal_moo', 'creature/animal_whinny',
  'impact/impactMetal_heavy_003', 'impact/impactPlate_heavy_002', 'jingles/jingles_STEEL03', 'jingles/jingles_STEEL06', 'jingles/jingles_SAX02',
  'magic/magic1', 'magic/spell_fire_03', 'pickup/powerup_rise05', 'pickup/powerup_rise07', 'world/wood_hit_01', 'impact/metal_small2',
  'creature/c80_howl', 'creature/c80_snore', 'creature/c80_ooh', 'jingles/jingles_PIZZI03',
];

/** Hit material → layered defs (light / heavy hits). §16.2 fur / armour / bone + §8.2 heavy. */
export const MATERIAL_HIT = {
  fur:    { light: ['hitFur'], heavy: ['hitHeavySword', 'hitHeavyPunch'] },
  armour: { light: ['hitPlateLight'], heavy: ['hitPlateMedium', 'hitHeavyPunch'] },
  bone:   { light: ['hitBone'], heavy: ['hitBoneHeavy', 'hitHeavyPunch'] },
  slime:  { light: ['hitSlime'], heavy: ['hitSlime', 'hitHeavyPunch'] },
  wood:   { light: ['hitWood'], heavy: ['hitWoodHeavy'] },
  straw:  { light: ['hitStraw'], heavy: ['hitStraw', 'hitHeavyPunch'] },
  stone:  { light: ['hitStone'], heavy: ['hitStone', 'hitHeavyPunch'] },
  metal:  { light: ['hitMetal'], heavy: ['hitMetal', 'hitPlateMedium'] },
  rope:   { light: ['hitRope'], heavy: ['hitRope', 'hitWood'] },
};

/**
 * Per enemy type (Enemy.def.id, matched exactly, then by the longest key prefix). `laugh` = procedural laugh build.
 * Fields: material (hit sound), alert, telegraph (windup voice), pain, death, phase (boss), laughRate.
 */
export const ENEMY_VOICE = {
  rat:              { material: 'fur', telegraph: 'ratAttack', pain: 'ratPain', death: 'ratDeath' },
  crow:             { material: 'fur', alert: 'crowCaw', telegraph: 'crowWings', pain: 'crowCaw', death: 'crowCaw' },
  spider:           { material: 'fur', telegraph: 'spider', pain: 'spider', death: 'spider' },
  jelly:            { material: 'slime', pain: 'jelly', death: 'jellySplit' },
  hyena:            { material: 'fur', alert: 'laugh', laughRate: 1.0, pain: 'hyenaHurt', death: 'hyenaHurt' },
  stealer:          { material: 'fur', alert: 'laugh', laughRate: 1.4, pain: 'hyenaHurt', death: 'hyenaHurt' },
  pilfer:           { material: 'fur', alert: 'laugh', laughRate: 1.4, pain: 'hyenaHurt', death: 'hyenaHurt' },
  pug:              { material: 'armour', alert: 'pugBark', telegraph: 'pugSnort', pain: 'pugBark', death: 'pugBark' },
  warhound:         { material: 'fur', alert: 'pugBark', pain: 'pugBark', death: 'pugBark' },
  bonehead:         { material: 'bone', alert: 'boneClack', pain: 'boneClack', death: 'boneCollapse' },
  // world PropActors (kind) — §5.4 tutorial set, breakables, cages
  dummy:            { material: 'straw' },
  sack:             { material: 'straw' },
  wobble_knight:    { material: 'armour' },
  crate:            { material: 'wood' },
  barrel:           { material: 'wood' },
  boulder:          { material: 'stone' },
  cage:             { material: 'metal' },
  lock:             { material: 'metal' },
  rope:             { material: 'rope' },
  post:             { material: 'wood' },
  cow:              { material: 'fur', alert: 'cow' },
  pudding:          { material: 'fur', alert: 'puddingRoar', pain: 'puddingNervous' },
  cacklejaw:        { material: 'fur', alert: 'laugh', laughRate: 0.85, pain: 'hyenaHurt', death: 'laugh', phase: 'laugh' },
  boss_grizzlechop: { material: 'fur', alert: 'grizzleRoar', telegraph: 'ratAttack', pain: 'ratPain', death: 'grizzleRoar', phase: 'grizzleRoar' },
  boss_cacklejaw:   { material: 'fur', alert: 'laugh', laughRate: 0.85, pain: 'hyenaHurt', death: 'laugh', phase: 'laugh' },
  boss_brutus:      { material: 'armour', alert: 'brutus', pain: 'brutus', death: 'brutus', phase: 'brutus' },
  boss_barkus:      { material: 'armour', alert: 'barkusBark', pain: 'barkusBark', death: 'barkusHowl', phase: 'barkusHowl' },
};

const VOICE_KEYS = Object.keys(ENEMY_VOICE).sort((a, b) => b.length - a.length);

/** Voice row for an enemy type id ('rat_pike', 'bonehead:warrior', 'jelly_l', 'boss_barkus'), or null. */
export function enemyVoiceFor(typeId) {
  if (!typeId) return null;
  const id = String(typeId).toLowerCase();
  if (ENEMY_VOICE[id]) return ENEMY_VOICE[id];
  const base = id.split(':')[0];
  if (ENEMY_VOICE[base]) return ENEMY_VOICE[base];
  for (const k of VOICE_KEYS) if (base.startsWith(k)) return ENEMY_VOICE[k];
  return null;
}

/** Type id of any actor-ish target (Enemy.def.id, NPC/kitten ids, tags). */
export function actorTypeId(a) {
  if (!a) return null;
  return a.def?.id ?? a.type ?? a.npcId ?? a.actorId ?? a.kind ?? (a.tags?.has?.('dummy') ? 'dummy' : null);
}

/** §8.1 telegraph sounds. `lead` = seconds before the strike (duration − lead after the start); else at the start. */
export const TELEGRAPH_SFX = {
  parry:  { name: 'tgParry', lead: 0.25 },
  gold:   { name: 'tgGold', lead: 0.25 },
  red:    { name: 'tgRed' },
  aoe:    { name: 'tgAoe' },
  aim:    { name: 'tgAim' },
  grab:   { name: 'tgGrab' },
  jeer:   { name: 'laugh' },
  shadow: { name: 'tgShadow' },
};

/** Footstep defs by surface (world `level.surfaceAt`: grass / dirt (the paths) / stone / wood / water; bog mud). */
export const FOOTSTEP = { grass: 'footGrass', dirt: 'footDirt', path: 'footDirt', stone: 'footStone', wood: 'footWood', mud: 'footMud', sand: 'footMud', snow: 'footSnow', water: 'footWater' };
/** Per-level default surface (levels without `surfaceAt`, emitters without a position). */
export const LEVEL_SURFACE = { meadow: 'grass', forest: 'grass', town: 'stone', gate: 'stone', bog: 'mud', keep: 'stone' };
/** Fallback cadence for her footsteps when nobody emits actor:footstep: interval = clamp(k / (speed + c), min, max). */
export const STEP_CADENCE = { k: 0.9, c: 0.8, min: 0.17, max: 0.45, minSpeed: 0.6, armorEvery: 2 };

/** item:pickup → def. */
export const PICKUP_SFX = { fish: 'fish', goldFish: 'goldFish', smallHeart: 'smallHeart', heartBell: 'heartBell', letter: 'letter', milk: 'milkPickup' };

/** fx:burst kinds that make a sound (world breakables etc.). 'poof' is covered by enemy:died. */
export const BURST_SFX = { crate: 'crateBreak', barrel: 'crateBreak', wood: 'crateHit', cage: 'cageOpen', lock: 'lockOpen', splash: 'splash', bones: 'boneCollapse', slime: 'jellySplit' };

/** companion:ability → def. */
export const ABILITY_SFX = { shieldWall: 'shieldWall', shield: 'shieldWall', default: 'kittenChirp' };

/** Every file id referenced by this map (manifest generation + U15 checks). */
export function sfxFileIds() {
  const out = new Set(CUTSCENE_SFX);
  for (const d of Object.values(SFX)) for (const f of d.files) out.add(f);
  return [...out];
}

// =====================================================================================================
// Bindings (§16.2: audio listens to bus events). `am` is the AudioManager.
// =====================================================================================================

/**
 * Subscribe the SFX map to the bus. Returns the unsubscribe functions.
 * @param {import('./AudioManager.js').AudioManager} am
 */
export function bindSfx(am) {
  const ctx = am.ctx, bus = ctx.bus, offs = [];
  const on = (ev, fn) => offs.push(bus.on(ev, (p) => { try { fn(p ?? {}); } catch (e) { console.warn(`[audio] ${ev} handler`, e); } }));
  const isPlayer = (a) => !!a && (a === ctx.player || a.tags?.has?.('player'));
  const posOf = (a, fallback) => a?.pos ?? a?.position ?? fallback ?? null;

  /** Play an enemy voice line (rate-limited per actor). */
  const voice = (actor, name, pos, opts) => {
    if (!name) return null;
    const key = (actor?.id ?? 'x') + ':' + name;
    if (!am.gate(key, 0.35)) return null;
    if (name === 'laugh') {
      const v = enemyVoiceFor(actorTypeId(actor));
      return am.laugh(actor ?? pos, { rate: v?.laughRate ?? 1, ...opts });
    }
    return am.play3D(name, actor ?? pos, opts);
  };

  // ---- player ----
  on(E.PLAYER_SWING, ({ attackId }) => {
    am.endCharge(0.15);                                            // a release swing ends the rising charge tone
    if (attackId === 'holy' || attackId === 'holyWave' || attackId === 'gleam') return;   // PLAYER_HOLY / projectile sounds
    if (attackId === 'sunburst') { am.play2D('sunburst'); return; }
    am.play2D(ATTACKS[attackId]?.heavy ? 'swishHeavy' : 'swishLight');
  });
  on(E.PLAYER_HOLY, (p) => {
    am.endCharge(0.1);
    am.play2D('holySlash');
    const minShards = ATTACKS.holy?.projectileMinShards ?? 2;
    if (p.wave || p.golden || (ctx.player?.shards ?? ctx.state?.shards ?? 0) >= minShards) am.play2D('holyWave', { delay: 0.12 });
  });
  // charge (§7.2): 0 on entering / cancelling the charge, 0.5 at tier 1, 1 at tier 2 (Holy); `fizzle` = tier 2 reached
  // without the Valor or a Shard for Holy
  on(E.PLAYER_CHARGE, ({ level = 0, fizzle = false }) => {
    const prev = am._chargeLevel ?? 0;
    am._chargeLevel = level;
    if (fizzle) { am.play2D('chargeFizzle'); return; }
    if (level >= 1 && prev < 1) am.chargeTone('chargeT2');
    else if (level > 0 && level < 1 && prev <= 0) am.chargeTone('chargeT1');
    else if (level <= 0 && prev > 0) am.endCharge(0.12);           // cancelled (guard, dodge, hurt, fell)
  });
  on(E.PLAYER_GOLDEN, ({ on: isOn }) => { if (isOn) am.play2D('goldenOn'); am.shimmer(!!isOn); });
  on(E.PLAYER_DODGE, () => am.play2D('dodge'));
  on(E.PLAYER_PERFECT_DODGE, ({ graze }) => { if (!graze) am.play2D('perfectDodge'); });
  on(E.PLAYER_JUMP, () => am.play2D('jump'));
  on(E.PLAYER_LAND, ({ impact = 0 }) => am.play2D('land', { volume: Math.min(1, 0.45 + Math.max(0, impact) / 14) }));
  on(E.PLAYER_GUARD, ({ on: isOn }) => { if (isOn) am.play2D('guardOn'); });
  on(E.PLAYER_GRIT, ({ broken }) => { if (broken) am.play2D('guardBreak'); });
  on(E.PLAYER_PARRY, ({ gold }) => am.play2D('parry', gold ? { rate: 1.12, volume: 1 } : undefined));
  on(E.PLAYER_DAMAGED, ({ amount = 1 }) => { if (amount > 0) am.play2D('hurt'); });
  on(E.PLAYER_DIED, () => am.play2D('faint'));
  on(E.PLAYER_LIFE_LOST, () => am.play2D('ghostLife', { delay: 0.4 }));
  on(E.PLAYER_MEOW, () => am.play2D('meow'));
  on(E.PLAYER_MILK, ({ phase }) => { if (phase === 'start' || phase === 'heal') am.play2D('milkSip'); });
  on(E.PLAYER_STILL_STANDING, () => { am.play2D('stillStanding'); am.heartbeat({ beats: 2, volume: 1 }); });
  on(E.CHECKPOINT, () => am.play2D('vigil'));
  on(E.FOOTSTEP, (p) => am.footstep(p.actor, p.position, p.surface));

  // ---- combat ----
  on(E.HIT, (h) => {
    const tgt = h.target, pos = h.position ?? posOf(tgt);
    if (!pos) return;
    if (h.blocked) {                                               // her parries sound via player:parry
      if (isPlayer(tgt)) am.play2D('block'); else am.play3D(h.parried ? 'parry' : 'block', pos);
      return;
    }
    if (isPlayer(tgt)) return;                                     // PLAYER_DAMAGED plays her hurt layer
    if (tgt?.faction === 'player') { am.play3D('companionHurt', pos); return; }
    const v = enemyVoiceFor(actorTypeId(tgt));
    const mat = MATERIAL_HIT[tgt?.material] ? tgt.material : (v?.material ?? 'fur');
    const heavy = !!(h.heavy ?? ATTACKS[h.attackId]?.heavy) || !!h.crit;     // crits land with the heavy layer
    for (const n of MATERIAL_HIT[mat][heavy ? 'heavy' : 'light']) am.play3D(n, pos);
    if (!h.killed && v?.pain && v.pain !== 'laugh') voice(tgt, v.pain, pos);
  });
  on(E.REFLECT, ({ projectile, by }) => am.play3D('reflect', posOf(projectile) ?? posOf(by)));
  on(E.TELEGRAPH, (t) => am.telegraph(t));
  on(E.TELEGRAPH_END, ({ id }) => am.cancelTelegraph(id));

  // ---- enemies / bosses ----
  on(E.ENEMY_ALERTED, ({ enemy }) => {
    const v = enemyVoiceFor(actorTypeId(enemy));
    if (v?.alert && am.gate('alert:' + (actorTypeId(enemy) ?? '?'), 0.8)) voice(enemy, v.alert, posOf(enemy));
  });
  on(E.ENEMY_DIED, ({ enemy, type, position }) => {
    const pos = position ?? posOf(enemy);
    if (!pos) return;
    am.play3D('killPoof', pos);
    const v = enemyVoiceFor(type ?? actorTypeId(enemy));
    if (v?.death) voice(enemy, v.death, pos);
  });
  on(E.ENEMY_JEER, ({ enemy, on: isOn }) => { if (isOn) voice(enemy, 'laugh', posOf(enemy)); });
  on(E.ENEMY_CHOKE, ({ enemy }) => am.play3D('hyenaChoke', enemy ?? null));
  on(E.ITEM_STOLEN, ({ thief }) => {
    am.play3D('stealerSnatch', thief ?? ctx.player);
    if (thief) am.laugh(thief, { rate: 1.4, delay: 0.35 });
  });
  on(E.ITEM_RETURNED, () => am.play2D('fish'));
  on(E.BOSS_START, ({ boss }) => { const v = enemyVoiceFor(actorTypeId(boss)); if (v?.alert) voice(boss, v.alert, posOf(boss)); });
  on(E.BOSS_PHASE, ({ boss }) => { const v = enemyVoiceFor(actorTypeId(boss)); if (v?.phase) voice(boss, v.phase, posOf(boss)); });
  on(E.BOSS_DIZZY, ({ dizzy }) => { if (dizzy) am.play2D('bossDizzy'); });

  // ---- pickups / kittens / companions / world ----
  on(E.ITEM_PICKUP, ({ item, id, amount, gold }) => {
    let name = PICKUP_SFX[item];
    if (item === 'fish' && (gold || id === 'gold' || id === 'goldFish' || amount >= (ECONOMY?.fish?.gold ?? 10))) name = 'goldFish';
    if (name) am.play2D(name);
  });
  on(E.KITTEN_REVEAL, ({ position }) => am.play3D('kittenMew', position ?? null));
  on(E.KITTEN_RESCUED, () => am.play2D('kittenFound'));
  on(E.COMPANION_ABILITY, ({ ability, position, kittenId }) => {
    am.play3D(ABILITY_SFX[ability] ?? ABILITY_SFX.default, position ?? ctx.actors?.get?.(kittenId) ?? ctx.player);
  });
  on(E.COMPANION_NAP, ({ kittenId, on: isOn }) => { if (isOn) am.play3D('nap', ctx.actors?.get?.(kittenId) ?? ctx.player); });
  on(E.BURST, ({ kind, position }) => { const n = BURST_SFX[kind]; if (n && position) am.play3D(n, position); });
  on(E.DIALOG_START, () => am.play2D('ui.dialogOpen'));

  return offs;
}
