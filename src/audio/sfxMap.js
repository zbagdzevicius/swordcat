// src/audio/sfxMap.js  (owner: audio) — GAME_DESIGN §16.2 SFX map + §8.1 telegraph sounds + §8.2 juice audio,
// bound to bus events by `bindSfx(am)`. Data first (pure, node-safe), then the bindings.
//
// Sound ids accepted by ctx.audio.play2D / play3D:
//   - a name from SFX below            'swishLight', 'parry', 'ui.click', 'kittenFound', ...
//   - a file id under audio/sfx/        'pickup/bubble2', 'creature/creature_roar_02'
//   - a GAME_DESIGN pattern              'impact/impactWood_light_00x', 'impact/impactSoft_heavy_00x', 'sword/swish_01–13',
//                                        'creature/crow_caw_01/02'    (a random existing variant is picked)
//   - a full path                        'audio/sfx/pickup/bubble2.ogg'
import { E } from '../core/events.js';
import { ATTACKS, ECONOMY } from '../core/config.js';
import { PitchLadder } from './cues.js';
import { ZZFX_DEFS } from './sfxDefs.js';

/**
 * TT3 Paw Trick synth sounds (zzfx 1.4 parameter order, see sfxDefs.js). They join ZZFX_DEFS at import so the idle
 * bake and the AudioManager unlock treat them like every other zzfx def (sfxMap is imported before either runs).
 *   trickTing    the coin leaves her paw: a bright "ting" with a little pitch jump
 *   trickTink    the coin bonks a foe: a short high "tink"
 *   trickChime   back in her paw: a soft two-note chime
 *   trickWhoosh  a quick air swish (coin throw, pouch lob)
 *   trickWhirr   the Ribbon Twirl: a rising propeller whirr
 *   trickFwip    the twirl's spin hits: a cloth "fwip"
 *   trickPoof    the catnip pouch bursts: a soft low "poof"
 *   trickGiggle  giddy foes: a wobbly giggle babble
 *   trickSparkle a Paw Trick handed over: a sparkly up-arpeggio
 */
export const TRICK_ZZFX = Object.freeze({
  trickTing: [0.6, 0, 1760, 0, 0.02, 0.16, 0, 1.5, 0, 0, 520, 0.045, 0, 0, 0, 0, 0, 0.7, 0.02, 0, 0],
  trickTink: [0.5, 0, 2400, 0, 0.01, 0.07, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.01, 0, 0],
  trickChime: [0.45, 0, 1320, 0.01, 0.08, 0.32, 0, 1, 0, 0, 660, 0.08, 0, 0, 0, 0, 0.05, 0.6, 0.05, 0.1, 0],
  trickWhoosh: [0.35, 0, 500, 0.02, 0.04, 0.1, 4, 1, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.03, 0, -2400],
  trickWhirr: [0.4, 0, 260, 0.05, 0.3, 0.2, 1, 1, 6, 0, 0, 0, 0.06, 0, 12, 0, 0, 0.6, 0.05, 0.3, 0],
  trickFwip: [0.5, 0, 900, 0.005, 0.03, 0.08, 4, 1, -8, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.02, 0, 1500],
  trickPoof: [0.7, 0, 180, 0.01, 0.08, 0.25, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.05, 0, -900],
  trickGiggle: [0.4, 0, 1100, 0.01, 0.12, 0.1, 1, 1.2, 3, 0, 0, 0, 0.04, 0, 20, 0, 0, 0.7, 0.02, 0.4, -4000],
  trickSparkle: [0.5, 0, 880, 0.01, 0.12, 0.3, 0, 1, 0, 0, 440, 0.07, 0.07, 0, 0, 0, 0, 0.7, 0.03, 0, 0],
});
for (const [k, v] of Object.entries(TRICK_ZZFX)) if (!(k in ZZFX_DEFS)) ZZFX_DEFS[k] = v;

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
 * @property {string} [zzfx]    sfxDefs.js fallback when no file buffer is ready (or the sound itself when `files` is empty)
 * @property {number} [lowpass] low-pass cutoff (Hz) on this play (ART §9.3: the softened crow)
 */

/** @type {Record<string, SfxDef>} */
export const SFX = {
  // ---------------------------------------------------------------- player (2D)
  swishLight:      { files: seq('sword/swish_', 1, 13), vol: 0.5, rateVar: 0.05 },
  swishHeavy:      { files: ['sword/swing', 'sword/swing2', 'sword/swing3'], vol: 0.65, rateVar: 0.04 },
  block:           { files: seq('impact/impactMetal_medium_', 0, 4, 3), vol: 0.8 },
  parry:           { files: seq('sword/sword_clash_', 1, 10), vol: 0.9, also: ['parryRing'] },
  parryRing:       { files: ['impact/metal_ringing'], vol: 0.45 },
  guardBreak:      { files: ['impact/metal_small1'], vol: 0.85, also: ['guardBreakPlate', 'shieldPop'] },
  guardBreakPlate: { files: ['impact/impactPlate_heavy_000'], vol: 0.9 },
  guardOn:         { files: ['impact/chainmail1'], vol: 0.22, minGap: 0.25, also: ['shieldUp'] },
  // TT6 the Pink Paw shield (zzfx, no files): bloop up, boing on a block, chime on a parry, pop on a break
  shieldUp:        { files: [], zzfx: 'shieldUp', vol: 0.4, rateVar: 0.03 },
  shieldBoing:     { files: [], zzfx: 'shieldBoing', vol: 0.45, rateVar: 0.05 },
  shieldChime:     { files: [], zzfx: 'shieldChime', vol: 0.4 },
  shieldPop:       { files: [], zzfx: 'shieldPop', vol: 0.5 },
  chargeT1:        { files: ['pickup/powerup_rise01'], vol: 1, rateVar: 0 },
  chargeT2:        { files: ['pickup/powerup_rise03'], vol: 0.9, rateVar: 0 },
  // ART §9.3: a soft noise "pfft" + a low bubble, not a digital glitch
  chargeFizzle:    { files: ['pickup/bubble'], vol: 0.35, rate: 0.7, rateVar: 0.02, also: ['chargePfft'] },
  chargePfft:      { files: [], zzfx: 'pfft', vol: 0.55, rateVar: 0.04 },
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
  // WA §5.7 / audio.W3 knock-out "dizzy sit, boing back" (BEAT_CUES.respawnBoing): happy mew-purr at the cream wipe,
  // a low bubble "boing" as she pops up. No downer sting.
  respawnPurr:     { files: ['cat/cat_mewpurr'], vol: 0.7, rateVar: 0 },
  respawnPop:      { files: ['pickup/bubble'], vol: 0.85, rate: 0.8, rateVar: 0 },
  // WA §5.6: a tap / click on her out of combat (player plays it; a pat, not a meow)
  tapPurr:         { files: ['cat/cat_mewpurr2'], vol: 0.5, rateVar: 0.04, minGap: 0.4 },
  meow:            { files: ['cat/kitten_mew_01', 'cat/meow_baby_01'], vol: 0.85, rateVar: 0.06, minGap: 0.2 },
  milkSip:         { files: ['pickup/bubble', 'pickup/bubble2', 'pickup/bubble3'], vol: 0.6 },
  vigil:           { files: ['cat/cat_purrsleepy_loop'], vol: 0.6, dur: 2, rateVar: 0, also: ['vigilMagic'] },
  vigilMagic:      { files: ['magic/magic1'], vol: 0.55 },
  stillStanding:   { files: ['magic/spell_02'], vol: 0.85, rateVar: 0 },
  stillStandingPurr: { files: ['cat/cat_purrsleepy_loop'], vol: 0.55, dur: 1.2, rateVar: 0 },     // ART §9.3 (no heartbeat)
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
  bossDizzy:       { files: ['jingles/jingles_PIZZI09'], vol: 0.6, rateVar: 0 },          // ART §9.3: no NES chiptune

  // ---------------------------------------------------------------- creatures
  ratAttack:       { files: ['creature/rat_squeak_attack'], vol: 0.35, rateVar: 0.08, minGap: 0.15 },
  ratPain:         { files: ['creature/rat_squeak_pain'], vol: 0.4, rateVar: 0.08, minGap: 0.15 },
  ratDeath:        { files: ['creature/rat_squeak_death'], vol: 0.45, rateVar: 0.06 },
  // ART §9.3 / WA §9: a cartoon "kaw" (crow_caw_*, played at rate 1.7), low-passed at 3 kHz, quieter
  crowCaw:         { files: ['creature/crow_caw_01', 'creature/crow_caw_02'], vol: 0.4, rate: 1.7, rateVar: 0.06, lowpass: 3000, zzfx: 'crowCaw', minGap: 0.3 },
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
  // WA26 Squeakybones: a rubber squeak when they pop back together; WA §9 Barkus's Big Squeaky Bone squeaks on a hit
  squeak:          { files: [], zzfx: 'squeak', vol: 0.75, rateVar: 0.08, minGap: 0.06 },
  boneSqueak:      { files: [], zzfx: 'squeak', vol: 0.7, rate: 0.9, rateVar: 0.1, also: ['boneClack'] },
  squeakyBone:     { files: [], zzfx: 'squeak', vol: 0.95, rate: 0.72, rateVar: 0.06, minGap: 0.1 },
  boneCollapse:    { files: seq('impact/impactWood_medium_', 0, 4, 3), vol: 0.8 },
  puddingRoar:     { files: [...seq('creature/creature_roar_', 1, 3), ...seq('creature/c80_roar_', 1, 3)], vol: 0.9, rate: 0.75, rateVar: 0.04 },
  puddingNervous:  { files: ['creature/c80_ooh'], vol: 0.7, rate: 0.8 },
  puddingSnore:    { files: ['creature/c80_snore'], vol: 1, rate: 0.6, rateVar: 0 },
  puddingPurr:     { files: ['cat/cat_purractive_loop'], vol: 0.45, rate: 0.6, rateVar: 0 },
  grizzleRoar:     { files: ['creature/rat_squeak_attack', 'creature/rat_squeak_pain'], vol: 0.5, rate: 0.8, also: ['grizzleMonster'] },
  // WA §8.7 / §9: Grizzlechop is a comic, befriendable boss — a low rat-squeak grumble + a wooden thump, no monster growl
  grizzleMonster:  { files: ['creature/rat_squeak_pain', 'creature/rat_squeak_attack'], vol: 0.55, rate: 0.55, rateVar: 0.05, also: ['grizzleThump'] },
  grizzleThump:    { files: seq('impact/impactWood_heavy_', 0, 4, 3), vol: 0.55, rate: 0.85, rateVar: 0.05 },
  brutus:          { files: seq('creature/rpg_giant', 1, 5, 0), vol: 0.85, minGap: 0.3 },
  barkusBark:      { files: ['creature/c80_barking_01', 'creature/c80_barking_02'], vol: 0.95, rate: 0.7, also: ['barkusGiant'], minGap: 0.3 },
  barkusGiant:     { files: seq('creature/rpg_giant', 1, 5, 0), vol: 0.6 },
  barkusHowl:      { files: ['creature/c80_howl'], vol: 0.9, rate: 1.05, rateVar: 0.05, dur: 0.8 },   // ART §9.3: Barkus only, short
  ballista:        { files: seq('impact/impactWood_heavy_', 0, 4, 3), vol: 0.85 },
  bolt:            { files: ['sword/blade_01'], vol: 0.7 },
  cow:             { files: ['creature/animal_moo'], vol: 0.85, rateVar: 0.02 },
  donkey:          { files: ['creature/animal_whinny'], vol: 0.8 },
  coo:             { files: ['creature/animal_peeps'], vol: 0.7, rate: 0.7 },
  woodKnock:       { files: seq('impact/impactWood_medium_', 0, 4, 3), vol: 0.5, rate: 0.6, rateVar: 0.05 },

  // ---------------------------------------------------------------- pickups, rescues, world
  fish:            { files: seq('pickup/coins_', 1, 4), vol: 0.55, minGap: 0.05 },
  goldFish:        { files: ['pickup/coin2'], vol: 0.7 },
  smallHeart:      { files: ['pickup/gem_01'], vol: 0.6 },
  heartBell:       { files: ['pickup/powerup_rise05'], vol: 2, rateVar: 0, also: ['heartBellJingle'] },
  heartBellJingle: { files: ['jingles/jingles_STEEL02'], vol: 0.6, rateVar: 0 },
  letter:          { files: ['ui/bookFlip1'], vol: 0.7, also: ['letterJingle'] },
  letterJingle:    { files: ['jingles/jingles_PIZZI01'], vol: 0.6, rateVar: 0 },
  milkPickup:      { files: ['pickup/bottle'], vol: 0.6 },
  kittenFound:     { files: seq('jingles/jingles_PIZZI', 0, 4), vol: 0.6, rateVar: 0, also: ['kittenMew'] },
  rescuePurr:      { files: ['cat/cat_purrsleepy_loop'], vol: 0.45, dur: 1.6, rateVar: 0 },   // AUTOCAM X24 (BEAT_CUES.rescueBeat)
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
  winch:           { files: seq('impact/impactWood_light_', 0, 4, 3), vol: 0.55, rate: 1.1 },   // WA §9: a rope winch, no chains
  splash:          { files: seq('creature/splash_', 1, 5), vol: 0.6 },
  shieldWall:      { files: seq('impact/impactMetal_heavy_', 0, 4, 3), vol: 0.7 },
  bellLayer:       { files: ['impact/metal_ringing'], vol: 0.3, rate: 0.5, rateVar: 0 },
  bellClunkLayer:  { files: ['impact/impactMetal_heavy_000'], vol: 0.5, rate: 0.6, rateVar: 0 },
  heartThump:      { files: [], zzfx: 'heartThump', vol: 0.9, rateVar: 0 },

  // ---------------------------------------------------------------- M2: forest (§12.4)
  mushroomBounce:  { files: seq('impact/impactSoft_heavy_', 0, 4, 3), vol: 0.7, rate: 1.35, also: ['bouncePluck'] },
  bouncePluck:     { files: ['ui/pluck_002'], vol: 0.5, rate: 0.55, rateVar: 0.04 },
  ropePostCut:     { files: seq('world/wood_breaking_', 1, 2), vol: 0.8, also: ['ropeSnap'] },
  ropeSnap:        { files: ['impact/cloth_heavy'], vol: 0.7, rate: 1.5 },
  cageLower:       { files: ['world/creak3'], vol: 0.8, rate: 0.8, also: ['winch'] },
  webTear:         { files: seq('creature/c80_spit_', 1, 3), vol: 0.5, rate: 1.3 },
  rockBreak:       { files: seq('impact/impactPunch_heavy_', 0, 4, 3), vol: 0.75, rate: 0.7, also: ['rockCrumble'] },
  rockCrumble:     { files: seq('impact/impactGeneric_light_', 0, 4, 3), vol: 0.8, rate: 0.55 },
  hitCheese:       { files: seq('impact/impactSoft_heavy_', 0, 4, 3), vol: 0.7, rate: 0.85 },
  // ---------------------------------------------------------------- M2: town (§12.5)
  lanternLight:    { files: ['magic/spell_fire_01'], vol: 0.55, rate: 1.3, also: ['lanternGlow'] },
  lanternGlow:     { files: ['pickup/powerup_fx02'], vol: 0.35, rate: 0.8, rateVar: 0 },
  pilferStumble:   { files: seq('creature/c80_hurt_', 1, 5), vol: 0.6, rate: 1.45, also: ['jump'] },
  mailbagDrop:     { files: seq('impact/impactSoft_heavy_', 0, 4, 3), vol: 0.7, also: ['letterFan'] },
  letterFan:       { files: ['ui/bookFlip2', 'ui/bookFlip3'], vol: 0.65 },
  stocksOpen:      { files: ['world/creak3'], vol: 0.75, also: ['latch'] },
  latch:           { files: ['world/metalLatch'], vol: 0.7 },
  jellyRise:       { files: seq('creature/bubble_', 1, 3), vol: 0.75, rate: 0.7, also: ['splash'] },
  doorOpen:        { files: ['world/doorOpen_1', 'world/doorOpen_2'], vol: 0.7 },
  doorClose:       { files: seq('world/doorClose_', 1, 4, 0), vol: 0.7 },
  wings:           { files: ['impact/cloth'], vol: 0.45, rate: 1.6, rateVar: 0.1, minGap: 0.08 },
  // ---------------------------------------------------------------- M2: gate / The Line (§12.6)
  farHorn:         { files: ['jingles/jingles_SAX02'], vol: 0.6, rate: 0.85, rateVar: 0 },    // ART §9.3: the howl is Barkus's only
  repairFreeze:    { files: ['world/metalLatch'], vol: 0.8, rate: 0.8, also: ['repairFreezeClunk'] },
  repairFreezeClunk: { files: ['impact/impactMetal_heavy_001'], vol: 0.5, rate: 0.7, rateVar: 0 },
  repairResume:    { files: ['world/metalClick'], vol: 0.9, also: ['winch'] },
  portcullisOpen:  { files: ['world/metal_open_01'], vol: 0.95, rate: 0.85, rateVar: 0, also: ['winch'] },
  portcullisClose: { files: ['world/metal_close_01'], vol: 0.95, rate: 0.85, rateVar: 0, also: ['portcullisSlam'] },
  portcullisSlam:  { files: ['impact/impactMetal_heavy_003'], vol: 0.7, rate: 0.6, rateVar: 0 },
  ballistaFire:    { files: seq('impact/impactWood_heavy_', 0, 4, 3), vol: 0.9, also: ['boltWhoosh'] },
  boltWhoosh:      { files: ['sword/blade_02'], vol: 0.8, rate: 0.7 },
  flourPuff:       { files: seq('impact/impactSoft_heavy_', 0, 4, 3), vol: 0.75, rate: 0.9, also: ['flourCloth'] },
  flourCloth:      { files: ['impact/cloth_heavy'], vol: 0.6, rate: 0.8 },
  marmaladeOof:    { files: ['cat/meow_01'], vol: 0.85, rate: 0.6, rateVar: 0, dur: 0.4 },
  spoonClink:      { files: seq('impact/metal_small', 1, 3, 0), vol: 0.4, rate: 1.6, rateVar: 0.12, minGap: 0.05 },
  spoonThrow:      { files: seq('sword/swish_', 1, 13), vol: 0.3, rate: 1.6, rateVar: 0.08, minGap: 0.05 },
  causewayFall:    { files: seq('creature/splash_', 1, 5), vol: 0.9, rate: 0.85 },
  // ---------------------------------------------------------------- M2: bosses B1 / B2 (§11.2, §11.3)
  bossIntro:       { files: seq('impact/impactMetal_heavy_', 0, 4, 3), vol: 0.8, rate: 0.6, rateVar: 0, also: ['bossIntroBoom'] },
  bossIntroBoom:   { files: seq('impact/impactPunch_heavy_', 0, 4, 3), vol: 0.8, rate: 0.5, rateVar: 0 },
  bossIntroB1:     { files: seq('impact/impactWood_heavy_', 0, 4, 3), vol: 0.85, rate: 0.6, rateVar: 0, also: ['bossIntroBoom'] },   // the Cheese Mill's fog wall
  bossIntroB2:     { files: seq('impact/impactWood_heavy_', 0, 4, 3), vol: 0.8, rate: 0.7, rateVar: 0, also: ['bossIntro'] },     // the causeway gate thump
  bossPhase:       { files: seq('impact/impactPlate_heavy_', 0, 4, 3), vol: 0.7, rate: 0.7, also: ['bossIntroBoom'] },
  // ---------------------------------------------------------------- M2: objectives (objective:progress)
  objectiveTick:   { files: ['ui/pluck_002'], vol: 0.45, rateVar: 0, bus: 'ui' },
  objectiveDone:   { files: ['jingles/jingles_PIZZI07'], vol: 0.5, rateVar: 0, bus: 'ui' },
  unlock:          { files: ['jingles/jingles_PIZZI06'], vol: 0.55, rateVar: 0, bus: 'ui' },
  // ---------------------------------------------------------------- TT3 Paw Tricks (TOKENTAILS-PLAN §11.3; zzfx, TRICK_ZZFX)
  trickCoinThrow:  { files: [], zzfx: 'trickTing', vol: 0.6, rateVar: 0.04, also: ['trickWhoosh'] },
  trickCoinHit:    { files: [], zzfx: 'trickTink', vol: 0.7, rateVar: 0.05, minGap: 0.05 },
  trickCoinCatch:  { files: [], zzfx: 'trickChime', vol: 0.5, rateVar: 0 },
  trickWhoosh:     { files: [], zzfx: 'trickWhoosh', vol: 0.4, rateVar: 0.06 },
  trickTwirl:      { files: [], zzfx: 'trickWhirr', vol: 0.5, rateVar: 0.03, minGap: 0.2 },
  trickFwip:       { files: [], zzfx: 'trickFwip', vol: 0.6, rateVar: 0.05 },
  trickPouch:      { files: [], zzfx: 'trickWhoosh', vol: 0.45, rate: 0.8, rateVar: 0.04 },
  trickPoof:       { files: [], zzfx: 'trickPoof', vol: 0.75, rateVar: 0.04, also: ['trickGiggle'] },
  trickGiggle:     { files: [], zzfx: 'trickGiggle', vol: 0.45, rateVar: 0.08, minGap: 0.15 },
  trickUnlock:     { files: [], zzfx: 'trickSparkle', vol: 0.5, rateVar: 0, bus: 'ui', also: ['unlock'] },

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
  'ui.ready':      { files: ['ui/glass_001'], vol: 0.1, bus: 'ui', rateVar: 0, minGap: 0.08 },          // CONTROLS §10.1 cooldown ready

  // ---------------------------------------------------------------- M2: hub shops + Quest Board (§13.3; ui calls these)
  'shop.open':     { files: ['ui/open_001'], vol: 0.45, bus: 'ui', rateVar: 0 },              // + the counter bell (shop())
  'shop.close':    { files: ['ui/close_001'], vol: 0.45, bus: 'ui', rateVar: 0 },
  'shop.hover':    { files: ['ui/tick_002'], vol: 0.35, bus: 'ui', rateVar: 0.03, minGap: 0.04 },
  'shop.select':   { files: seq('ui/select_', 1, 8, 3), vol: 0.45, bus: 'ui' },
  'shop.buy':      { files: ['pickup/handleCoins', 'pickup/handleCoins2'], vol: 0.7, bus: 'ui', also: ['shop.buyJingle'] },
  'shop.buyJingle': { files: ['jingles/jingles_PIZZI05'], vol: 0.45, bus: 'ui', rateVar: 0 },
  'shop.coin':     { files: ['pickup/coin3'], vol: 0.35, bus: 'ui', rate: 1.2, rateVar: 0.06, minGap: 0.03 },
  'shop.denied':   { files: ['ui/error_003'], vol: 0.5, bus: 'ui', rateVar: 0, also: ['shop.deniedCoin'] },
  'shop.deniedCoin': { files: ['pickup/coin'], vol: 0.3, bus: 'ui', rate: 0.6, rateVar: 0 },
  'shop.equip':    { files: ['world/beltHandle1', 'world/beltHandle2'], vol: 0.6, bus: 'ui' },
  'shop.equipSword': { files: ['sword/sword_unsheathe4', 'sword/sword_unsheathe5'], vol: 0.6, bus: 'ui' },
  'shop.equipCape': { files: ['impact/cloth_heavy'], vol: 0.6, bus: 'ui', rate: 1.15 },
  // station flavour on a purchase (shop(action, {station}))
  'shop.bakery':   { files: ['pickup/bottle'], vol: 0.6, bus: 'ui', also: ['milkSip'] },
  'shop.anvil':    { files: seq('impact/metal_hit_', 1, 5), vol: 0.6, bus: 'ui', also: ['shop.anvilRing'] },
  'shop.anvilRing': { files: seq('impact/rpg_metal_', 1, 3), vol: 0.35, bus: 'ui' },
  'shop.library':  { files: ['ui/bookFlip2', 'ui/bookFlip3'], vol: 0.6, bus: 'ui', also: ['shop.libraryMagic'] },
  'shop.libraryMagic': { files: ['magic/spell'], vol: 0.45, bus: 'ui' },
  'shop.wardrobe': { files: ['impact/cloth_heavy'], vol: 0.6, bus: 'ui', rate: 1.2, also: ['shop.wardrobeTwirl'] },
  'shop.wardrobeTwirl': { files: ['ui/maximize_001'], vol: 0.4, bus: 'ui', rateVar: 0 },
  'shop.barracks': { files: ['impact/cloth_heavy'], vol: 0.55, bus: 'ui', rate: 0.9, also: ['kittenChirp'] },
  'quest.open':    { files: ['ui/scroll_002'], vol: 0.5, bus: 'ui' },
  'quest.select':  { files: seq('ui/switch_', 1, 7, 3), vol: 0.45, bus: 'ui' },
  'quest.pin':     { files: ['ui/drop_003'], vol: 0.6, bus: 'ui', also: ['quest.pinClick'] },
  'quest.pinClick': { files: ['world/metalClick'], vol: 0.4, bus: 'ui', rate: 1.4 },
  'quest.go':      { files: ['jingles/jingles_STEEL05'], vol: 0.45, bus: 'ui', rateVar: 0 },

  // ---------------------------------------------------------------- Phase W (WA §5, §9; AUTOCAM X24) — ui / fx call these
  comicPop:        { files: ['pickup/bubble'], vol: 0.6, rate: 1.15, rateVar: 0.05, bus: 'ui', minGap: 0.08 },   // WA §5.3 pop words
  ghostPawPip:     { files: ['ui/glass_001'], vol: 0.3, rate: 1.4, rateVar: 0, bus: 'ui' },                  // WA §7.5 ghost paw
  rankStamp:       { files: ['jingles/jingles_PIZZI03'], vol: 0.6, rateVar: 0, bus: 'ui', also: ['ui.stamp'] },   // WA21 results
  roomReadSting:   { files: ['jingles/jingles_PIZZI08'], vol: 0.42, rateVar: 0, bus: 'ui' },              // AUTOCAM room read
};

/** Ids other areas have used that are not files: read as these SFX names (keeps old calls sounding). */
export const SFX_ALIASES = { 'fire/fire_ignite': 'lanternLight', 'fire/ignite': 'lanternLight' };

/** ctx.audio.shop(action, { station }) → SFX names (§13.3). A purchase also plays the station's own flavour. */
export const SHOP_SFX = {
  open: 'shop.open', close: 'shop.close', hover: 'shop.hover', select: 'shop.select', buy: 'shop.buy', coin: 'shop.coin',
  denied: 'shop.denied', equip: 'shop.equip', equipSword: 'shop.equipSword', equipCape: 'shop.equipCape',
};
export const STATION_SFX = {
  bakery: 'shop.bakery', forge: 'shop.anvil', library: 'shop.library', wardrobe: 'shop.wardrobe', barracks: 'shop.barracks',
  questboard: 'quest.pin', quest: 'quest.pin',
};

/**
 * objective:progress feedback by objective id or textKey (§12.4–12.6). tick = each value step up (count objectives),
 * done = completion, freeze / resume = The Line's repair pausing (Pilfer has the pin), doneSeq = timed SFX on done
 * (the portcullis test: open, then close). Objectives not listed are silent (rescues have their own jingles).
 */
export const OBJECTIVE_SFX = {
  'obj.lanterns': { done: 'objectiveDone' },                       // each lantern: world plays its ignite at the lantern
  'obj.ropes':    { tick: 'objectiveTick', done: 'objectiveDone' },
  'obj.stealer':  { done: 'objectiveDone' },
  'obj.keys':     { tick: 'keys', done: 'objectiveDone' },
  // freeze / resume = Pilfer has the pin (not the enemy-near-winch pause); the 100 % portcullis test is story's
  // `line.portcullis` cue (gate_open), so no doneSeq here
  'obj.line':     { freeze: 'repairFreeze', resume: 'repairResume' },
};
export const OBJECTIVE_ALIASES = { lanterns: 'obj.lanterns', ropes: 'obj.ropes', net_ropes: 'obj.ropes', tree_ropes: 'obj.ropes', stealer: 'obj.stealer', line: 'obj.line', keys: 'obj.keys' };

/** OBJECTIVE_SFX row for an objective:progress payload. */
export function objectiveSfxFor(p) {
  if (!p) return null;
  return OBJECTIVE_SFX[p.textKey] ?? OBJECTIVE_SFX[OBJECTIVE_ALIASES[p.id]] ?? OBJECTIVE_SFX[p.id] ?? null;
}

/**
 * Sounds the cutscenes (§5) name directly as file ids (`sfx` steps). Listed so the manifest ships them;
 * they are played by id, e.g. ctx.audio.play3D('creature/creature_roar_02', pos).
 */
export const CUTSCENE_SFX = [
  'ui/drop_001', 'ui/drop_002', 'ui/drop_003', 'cat/cat_purrsleepy_loop', 'cat/cat_purractive_loop', 'world/creak1', 'world/creak2',
  'sword/sword_unsheathe', 'sword/sword_unsheathe2', 'sword/sword_unsheathe3', 'impact/armor_light', 'impact/cloth', 'impact/cloth_heavy',
  'pickup/bubble', 'pickup/bubble2', ...seq('impact/impactSoft_heavy_', 0, 4, 3), ...seq('impact/impactWood_heavy_', 0, 4, 3),
  ...seq('creature/creature_roar_', 1, 3), ...seq('creature/c80_roar_', 1, 3), 'creature/animal_moo', 'creature/animal_whinny',
  'impact/impactMetal_heavy_003', 'impact/impactPlate_heavy_002', 'jingles/jingles_STEEL03', 'jingles/jingles_STEEL06', 'jingles/jingles_SAX02',
  'magic/magic1', 'magic/spell_fire_03', 'pickup/powerup_rise05', 'pickup/powerup_rise07', 'world/wood_hit_01', 'impact/metal_small2',
  'creature/c80_snore', 'creature/c80_ooh', 'jingles/jingles_PIZZI03', 'cat/cat_mewpurr', 'cat/cat_mewpurr2',
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
  cheese: { light: ['hitCheese'], heavy: ['hitCheese', 'hitHeavyPunch'] },     // Grizzlechop's cheese shield (§11.2)
};

/**
 * Per enemy type (Enemy.def.id, matched exactly, then by the longest key prefix). `laugh` = procedural laugh build.
 * Fields: material (hit sound), alert, telegraph (windup voice), pain, death, phase (boss), laughRate, revive (the
 * Squeakybone reassembly: enemies play `enemyVoiceFor(id).revive`), weaponHit (its weapon landing on anyone).
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
  bonehead:         { material: 'bone', alert: 'boneClack', pain: 'boneClack', death: 'boneCollapse', revive: 'boneSqueak' },   // WA26 Squeakybone
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
  rope_post:        { material: 'rope' },
  post:             { material: 'wood' },
  lantern:          { material: 'metal' },
  stocks:           { material: 'wood' },
  wagon:            { material: 'wood' },
  winch:            { material: 'metal' },
  cow:              { material: 'fur', alert: 'cow' },
  pudding:          { material: 'fur', alert: 'puddingRoar', pain: 'puddingNervous' },
  cacklejaw:        { material: 'fur', alert: 'laugh', laughRate: 0.85, pain: 'hyenaHurt', death: 'laugh', phase: 'laugh' },
  boss_grizzlechop: { material: 'fur', alert: 'grizzleRoar', telegraph: 'ratAttack', pain: 'ratPain', death: 'grizzleRoar', phase: 'grizzleRoar' },
  boss_cacklejaw:   { material: 'fur', alert: 'laugh', laughRate: 0.85, pain: 'hyenaHurt', death: 'laugh', phase: 'laugh' },
  boss_brutus:      { material: 'armour', alert: 'brutus', pain: 'brutus', death: 'brutus', phase: 'brutus' },
  boss_barkus:      { material: 'armour', alert: 'barkusBark', pain: 'barkusBark', death: 'barkusHowl', phase: 'barkusHowl', weaponHit: 'squeakyBone' },
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

/** Pickups that climb the WA §5.5 pitch ladder (fish, gold fish, small hearts). */
export const LADDER_PICKUPS = new Set(['fish', 'goldFish', 'smallHeart']);

/** item:pickup → def. */
export const PICKUP_SFX = { fish: 'fish', goldFish: 'goldFish', smallHeart: 'smallHeart', heartBell: 'heartBell', letter: 'letter', milk: 'milkPickup' };

/** fx:burst kinds that make a sound (world breakables etc.). 'poof' is covered by enemy:died. */
export const BURST_SFX = {
  crate: 'crateBreak', barrel: 'crateBreak', wood: 'crateHit', cage: 'cageOpen', lock: 'lockOpen', splash: 'splash', bones: 'boneCollapse',
  slime: 'jellySplit',
  // M2 (§12.4–12.6): breakables and set pieces world / fx may burst
  boulder: 'rockBreak', rock: 'rockBreak', web: 'webTear', rope: 'ropePostCut', rope_post: 'ropePostCut',
  lantern: 'lanternLight', letters: 'letterFan', mailbag: 'mailbagDrop', flour: 'flourPuff', cheese: 'hitCheese',
  bounce: 'mushroomBounce', stocks: 'stocksOpen', fall: 'causewayFall',
};

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
  on(E.PLAYER_PARRY, ({ gold }) => { am.play2D('parry', gold ? { rate: 1.12, volume: 1 } : undefined); am.play2D('shieldChime', gold ? { rate: 1.2 } : undefined); });   // TT6 the paw shield chimes
  on(E.PLAYER_DAMAGED, ({ amount = 1 }) => { if (amount > 0) am.play2D('hurt'); });
  on(E.PLAYER_DIED, () => am.play2D('faint'));
  on(E.PLAYER_LIFE_LOST, () => am.play2D('respawnBoing'));            // WA §5.7: wipe purr at 1.2 s, boing at 1.55 s
  on(E.PLAYER_MEOW, () => am.play2D('meow'));
  on(E.PLAYER_MILK, ({ phase }) => { if (phase === 'start' || phase === 'heal') am.play2D('milkSip'); });
  // ART §9.3: the sleepy purr + a rising glock third (G5 → B5) replace the heartbeat
  on(E.PLAYER_STILL_STANDING, () => { am.play2D('stillStanding'); am.play2D('stillStandingBeat'); });
  on(E.CHECKPOINT, () => am.play2D('vigil'));
  on(E.FOOTSTEP, (p) => am.footstep(p.actor, p.position, p.surface));

  // ---- combat ----
  on(E.HIT, (h) => {
    const tgt = h.target, pos = h.position ?? posOf(tgt);
    if (!pos) return;
    if (h.blocked) {                                               // her parries sound via player:parry
      // TT6: a boing off the Pink Paw shield on her blocks
      if (isPlayer(tgt)) { am.play2D('block'); am.play2D('shieldBoing'); } else am.play3D(h.parried ? 'parry' : 'block', pos);
      return;
    }
    const av = h.attacker ? enemyVoiceFor(actorTypeId(h.attacker)) : null;
    if (av?.weaponHit) am.play3D(av.weaponHit, pos);               // WA §9: Barkus's Big Squeaky Bone squeaks on a hit
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
  const ladder = new PitchLadder();
  on(E.ITEM_PICKUP, ({ item, id, amount, gold }) => {
    let name = PICKUP_SFX[item];
    if (item === 'fish' && (gold || id === 'gold' || id === 'goldFish' || amount >= (ECONOMY?.fish?.gold ?? 10))) name = 'goldFish';
    if (!name) return;
    // WA §5.5 pitch ladder: a run of pickups climbs 6 % per step (≤ 8 steps), reset after 1.5 s
    if (LADDER_PICKUPS.has(name)) am.play2D(name, { rate: ladder.next(am.time), rateVar: 0 });
    else am.play2D(name);
  });
  on(E.KITTEN_REVEAL, ({ position }) => am.play3D('kittenMew', position ?? null));
  // AUTOCAM X24 Cosy two-shot twin: glock arpeggio over a purr (+ her mew), 2D so it reads as her moment
  on(E.KITTEN_RESCUED, () => am.play2D('rescueBeat'));
  on(E.ARENA_LOCK, (p) => am.roomRead(p));
  on(E.COMPANION_ABILITY, ({ ability, position, kittenId }) => {
    am.play3D(ABILITY_SFX[ability] ?? ABILITY_SFX.default, position ?? ctx.actors?.get?.(kittenId) ?? ctx.player);
  });
  on(E.COMPANION_NAP, ({ kittenId, on: isOn }) => { if (isOn) am.play3D('nap', ctx.actors?.get?.(kittenId) ?? ctx.player); });
  on(E.BURST, ({ kind, position }) => { const n = BURST_SFX[kind]; if (n && position) am.play3D(n, position); });
  on(E.DIALOG_START, () => am.play2D('ui.dialogOpen'));

  return offs;
}
