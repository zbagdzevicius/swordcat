// src/story/cutscenes/cs01.js  (owner: story) — CS-01 Knighting Eve (GAME_DESIGN §5.4) [MVP], ~65 s.
// `meadow`, the practice field: env `meadow_evening`, then `meadow_night`. Played by StoryManager.newGame().
//   1 black + caption "Meow Island. The eve of Knighting Day."; procedural wind
//   2 CRANE_DOWN crane_bell → crane_field: the far Bell Tower glow, down to 6 squires queueing at the height chart
//   3 Sergeant Whiskerbottom measures two kittens — stamp, stamp — "Tall enough! Next!" ×2
//   4 low close on the chart: Clementine (tunic, no bow) is one ear-tuft short; tiptoes; the three lines
//   5 the last sunbeam: every kitten flops into it; Clem sits alone on the fence steps; Pearl ties the pink bow
//   6 night: the armoury barn, a chest painted "M. — my first", a lantern; she lifts the too-big sword
//   7 quick cuts: pauldrons clank, the helmet falls over her eyes (set aside), the cream cape; the dusty mirror:
//     a tiny knight. "...Practice."
// end: flag prologue.armour; player at spawn `practice` in armour + bow; env meadow_night; the Prologue card; Midnight
// Practice starts by itself (story/tutorial.js).
import { say, cam, wait, sfx, par, seq } from './lib.js';
import { outfit, buildMirror, buildSunPatch } from './rig.js';

/** Measuring spot (back to the board, facing south), the queue and the yard where measured kittens wait. */
const SPOT = [-6, -66.5];
const QUEUE = [[-6, -68.0], [-6.05, -68.9], [-5.95, -69.8], [-6.05, -70.7], [-5.95, -71.6], [-6.05, -72.5]];
const CLEM_Q = [-6, -73.5];
const YARD = [[-2.4, -68.6], [-1.7, -69.7], [-2.9, -70.4], [-1.1, -70.9], [-2.2, -71.5], [-0.8, -69.4]];
const SUN = [-1.8, -70.1];
/** Flop marks in the sunbeam: a shallow arc across the closing wide's frame (camera at chart-local [3.6, 2.3, 9.4] ≈
 *  world (−9.6, −75.4), looking at SUN), ~0.66 m apart so every kitten reads on its own; the ends curl toward the
 *  lens. Each faces the camera with a little per-kitten variety. */
const SUN_RIGHT = [-0.58, 0.81];   // screen-right on the ground plane for that shot
const SUN_FWD = [0.81, 0.58];      // away from the lens
export const SUN_MARKS = [0, 1, 2, 3, 4, 5].map((i) => {
  const u = (i - 2.5) * 0.66, k = (i - 2.5) / 2.5;
  const back = 0.35 - 0.55 * k * k + (i % 2 ? 0.12 : -0.12);
  return [SUN[0] + SUN_RIGHT[0] * u + SUN_FWD[0] * back, SUN[1] + SUN_RIGHT[1] * u + SUN_FWD[1] * back];
});
const SUN_FACE = (i) => Math.atan2(-SUN_FWD[0], -SUN_FWD[1]) + (i - 2.5) * 0.12;
const STEPS = [-8, -61.6];
/** Pearl ties the bow from just behind Clem's left shoulder (she sits facing south, so her left is world −X). */
const PEARL_TIE = [STEPS[0] - 0.42, STEPS[1] + 0.3];
const BARN = { clem: [-13.3, -87.4], chest: [-12.85, -88.75], lantern: [-13.75, -88.3], helm: [-13.85, -87.0], mirror: [-13.1, -85.05] };   // 1.25 m in front of where she dresses (clem + [0.3, 1.1])

const squire = (i) => `squire_${i + 1}`;
/** Walk squire i from the queue to the measuring spot, get measured (stamp, line), then into the yard. */
const measure = (i, key, stamp) => [
  { t: 'actor', id: squire(i), moveTo: SPOT, speed: 1.6 },
  { t: 'actor', id: squire(i), face: Math.PI, faceDur: 0.25 },
  { t: 'actor', id: 'whiskerbottom', emote: 'nod' },
  sfx(stamp, 'chart', { vol: 0.9 }),
  say('whiskerbottom', key, 1.3),
  { t: 'actor', id: squire(i), clip: 'jump', nowait: true },
  { t: 'actor', id: squire(i), moveTo: YARD[i], speed: 2.0, nowait: true },
];

export default {
  id: 'cs01', kind: 'cutscene', skippable: true, prologue: true,
  steps: [
    // ---- 1 · black, caption, wind (the set is dressed behind the black)
    { t: 'ui', letterbox: true, hud: false, fade: { to: '#000', alpha: 1, dur: 0 } },
    { t: 'music', track: null, fade: 0.5 },
    { t: 'env', preset: 'meadow_evening', wind: 0.9 },
    { t: 'call', fn: (ctx) => outfit(ctx, 'tunic') },
    { t: 'actor', id: 'swordcat', at: CLEM_Q, facing: 0, pose: 'idle' },
    { t: 'spawn', id: 'whiskerbottom', type: 'npc', at: [-4.85, -66.75], facing: -1.36 },
    ...QUEUE.map((at, i) => ({ t: 'spawn', id: squire(i), type: 'npc', at, facing: 0 })),
    { t: 'spawn', id: 'pearl', type: 'npc', at: [-12.5, -63.5], facing: 1.2, visible: false },
    { t: 'ui', caption: 'cs01.caption' },
    wait(3.4),
    { t: 'ui', caption: null },
    wait(0.5),

    // ---- 2 · crane down from the Bell Tower glow to the queue at the height chart
    { t: 'music', track: 'village_bards_tale', fade: 2 },
    { t: 'cam', anchor: [0, 0, 0], mode: 'rail', path: ['crane_bell', 'crane_field'], look: [-130, 24, -20], lookTo: [-6, 1.6, -69.5], fov: [36, 40], dur: 8, ease: 'inOutSine', nowait: true },
    { t: 'ui', fade: { alpha: 0, dur: 1.6 } },
    wait(8),

    // ---- 3 · stamp, stamp
    cam(null, 'chart', { pos: [-1.7, 1.05, 3.4], look: [-0.4, 0.75, 0.7], fov: 38, noise: 0.004 }),
    ...measure(0, 'cs01.1', 'ui/drop_001'),
    ...QUEUE.slice(1).map((at, k) => ({ t: 'actor', id: squire(k + 1), moveTo: [at[0], at[1] + 0.9], speed: 1.0, nowait: true })),
    ...measure(1, 'cs01.2', 'ui/drop_002'),
    wait(0.6),

    // ---- 4 · low close on the chart: one ear-tuft short
    { t: 'call', fn: (ctx, cs) => {             // the rest of the queue was measured off-screen: they wait in the yard
      for (let i = 2; i < 6; i++) cs.place(cs.actor(squire(i)), YARD[i], -0.6 + i * 0.5);
    } },
    { t: 'actor', id: 'swordcat', at: [SPOT[0], SPOT[1] - 1.6], facing: 0 },
    cam(null, 'chart', { pos: [-0.45, 0.62, 2.1], look: [0, 0.98, 0.2], fov: 34 }),
    { t: 'actor', id: 'swordcat', moveTo: SPOT, speed: 1.2 },
    { t: 'actor', id: 'swordcat', face: Math.PI, faceDur: 0.35 },
    wait(0.5),
    { t: 'actor', id: 'swordcat', clip: 'hop', once: true },
    { t: 'actor', id: 'swordcat', clip: 'hop', once: true },
    { t: 'actor', id: 'swordcat', expression: 'determined', emote: 'blink' },
    wait(0.4),
    say('whiskerbottom', 'cs01.3', 2.4),
    { t: 'actor', id: 'swordcat', expression: 'sad', emote: 'earsFlat' },
    say('swordcat', 'cs01.4', 2.0),
    say('whiskerbottom', 'cs01.5', 2.8),
    sfx('ui/drop_003', 'chart', { vol: 0.7 }),

    // ---- 5 · the last sunbeam: everyone flops into it; Clem alone on the fence steps; Pearl and the bow
    { t: 'spawn', id: 'sunpatch', build: buildSunPatch, at: SUN, y: 0.04 },
    { t: 'env', sun: { intensity: 2.8, elev: 0.12 }, dur: 1.4 },
    cam(null, 'chart', { pos: [3.6, 2.3, 9.4], look: [-4.2, 0.4, 3.8], fov: 46, mode: 'rail', to: [3.1, 1.9, 8.6], dur: 6.5, ease: 'inOutSine', nowait: true }),
    { t: 'sfx', id: 'cat/cat_purrsleepy_loop', at: 'squire_1', loop: true, vol: 0.55, handle: 'purr' },
    par(
      ...[0, 1, 2, 3, 4, 5].map((i) => seq(
        { t: 'actor', id: squire(i), moveTo: SUN_MARKS[i], speed: 2.4 },
        { t: 'actor', id: squire(i), face: SUN_FACE(i), faceDur: 0.25 },
        { t: 'actor', id: squire(i), pose: i % 2 ? 'sleep' : 'sit' })),
      { t: 'actor', id: 'whiskerbottom', face: 'sunpatch', faceDur: 0.6 },
      seq(wait(0.8), { t: 'actor', id: 'swordcat', expression: 'sad', moveTo: STEPS, speed: 1.4 }),
    ),
    { t: 'actor', id: 'whiskerbottom', moveTo: [SUN[0] + 1.9, SUN[1] - 0.6], speed: 1.2, nowait: true },
    { t: 'actor', id: 'swordcat', face: Math.PI, faceDur: 0.4 },
    { t: 'actor', id: 'swordcat', pose: 'sit' },
    { t: 'actor', id: 'pearl', visible: true, at: [-11.2, -62.8], facing: 1.4 },
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'pearl', pos: [1.5, 0.62, 1.7], fov: 36 }),
    wait(0.8),
    { t: 'actor', id: 'pearl', moveTo: PEARL_TIE, speed: 1.6 },
    { t: 'actor', id: 'pearl', face: 'swordcat', faceDur: 0.3 },
    cam(null, 'swordcat', { pos: [0.3, 0.68, 1.1], look: [0.1, 0.8, 0], fov: 32, noise: 0.003 }),
    { t: 'actor', id: 'pearl', pose: 'cheer' },
    wait(0.7),
    { t: 'ui', fade: { to: '#FFF6E2', alpha: 0.4, dur: 0.15 } },
    wait(0.18),
    { t: 'call', fn: (ctx) => outfit(ctx, 'tunic_bow') },
    { t: 'ui', fade: { alpha: 0, dur: 0.45 } },
    { t: 'fx', burst: 'sparkle', at: 'swordcat', count: 14, color: '#FFD2DE' },
    sfx('cat/cat_softmew', 'pearl', { vol: 0.7 }),
    { t: 'actor', id: 'swordcat', emote: 'bowBounce', expression: 'surprised' },
    { t: 'actor', id: 'pearl', pose: 'idle' },
    say('pearl', 'cs01.6', 2.2),
    { t: 'actor', id: 'swordcat', face: 'pearl', faceDur: 0.4 },
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'pearl', pos: [1.45, 0.7, 1.55], fov: 35 }),
    say('swordcat', 'cs01.7', 1.6, { expression: 'grumpy' }),
    say('pearl', 'cs01.8', 1.9),
    { t: 'actor', id: 'swordcat', expression: 'happy', emote: 'blink' },
    say('pearl', 'cs01.9', 3.6),
    { t: 'actor', id: 'pearl', pose: 'sit' },
    wait(0.8),

    // ---- 6 · night: the armoury barn, "M. — my first"
    { t: 'ui', fade: { to: '#000', alpha: 1, dur: 0.7 } },
    wait(0.75),
    { t: 'sfx', stop: 'purr', fade: 0.6 },
    { t: 'despawn', ids: ['sunpatch', 'pearl', 'whiskerbottom', 'squire_*'] },
    { t: 'env', preset: 'meadow_night', dur: 2 },
    { t: 'actor', id: 'swordcat', at: [BARN.clem[0] + 1.6, BARN.clem[1] + 2.4], facing: 3.6, pose: 'idle', expression: 'worried' },
    { t: 'spawn', id: 'chest', asset: 'models/env/dungeon-mini/chest.glb', fit: { x: 0.7 }, at: BARN.chest, facing: 0.1 },
    { t: 'spawn', id: 'lantern', prop: 'lantern', at: BARN.lantern, opts: { light: true, intensity: 1.6, distance: 7 } },
    cam(null, 'barn_door', { pos: [2.3, 0.85, 3.4], look: [0.8, 0.55, 0.6], fov: 40 }),
    { t: 'ui', fade: { alpha: 0, dur: 1.2 } },
    { t: 'actor', id: 'swordcat', moveTo: BARN.clem, speed: 0.9 },
    { t: 'actor', id: 'swordcat', face: 'chest', faceDur: 0.4 },
    cam(null, 'barn_door', { pos: [1.55, 0.62, 1.55], look: [1.05, 0.38, -0.2], fov: 36, noise: 0.003 }),
    { t: 'actor', id: 'swordcat', pose: 'kneel' },
    sfx('world/creak1', 'chest', { vol: 0.9 }),
    { t: 'call', fn: (ctx, cs) => { cs.spawned.find((r) => r.id === 'chest')?.anim?.play?.('open', { once: true, clampEnd: true }); } },
    { t: 'ui', caption: 'cs01.chest' },
    wait(2.4),
    { t: 'ui', caption: null },
    { t: 'actor', id: 'swordcat', pose: 'idle', expression: 'surprised' },
    sfx('sword/sword_unsheathe', 'swordcat', { vol: 0.8 }),
    cam('HERO_LOW', 'swordcat', { pos: [0.9, 0.3, 1.9], fov: 42 }),
    { t: 'actor', id: 'swordcat', moveTo: [BARN.clem[0] + 0.3, BARN.clem[1] + 1.1], speed: 0.6 },
    wait(0.6),

    // ---- 7 · pauldrons, helmet, cape; the mirror
    { t: 'ui', fade: { to: '#000', alpha: 1, dur: 0.18 } },
    wait(0.2),
    { t: 'call', fn: (ctx) => outfit(ctx, 'armour') },
    { t: 'actor', id: 'swordcat', at: [BARN.clem[0] + 0.3, BARN.clem[1] + 1.1], facing: 0, pose: 'idle', expression: 'neutral' },
    cam(null, 'swordcat', { pos: [-0.42, 0.86, 0.42], look: [-0.16, 0.66, 0], fov: 30 }),
    { t: 'ui', fade: { alpha: 0, dur: 0.18 } },
    sfx('impact/armor_light', 'swordcat', { vol: 1 }),
    wait(0.35),
    sfx('impact/impactPlate_light_000', 'swordcat', { vol: 0.8 }),
    wait(0.75),
    { t: 'actor', id: 'swordcat', prop: 'helmet', expression: 'surprised' },
    cam(null, 'swordcat', { pos: [0.08, 0.86, 0.95], look: [0, 0.84, 0], fov: 32 }),
    sfx('impact/impactPlate_light_001', 'swordcat', { vol: 0.9 }),
    { t: 'actor', id: 'swordcat', emote: 'shake' },
    wait(1.1),
    { t: 'actor', id: 'swordcat', prop: '-helmet', expression: 'grumpy' },
    { t: 'spawn', id: 'helm', prop: 'helmet', at: BARN.helm, facing: 2.2 },
    { t: 'actor', id: 'swordcat', face: 'helm', faceDur: 0.3 },
    wait(0.7),
    { t: 'actor', id: 'swordcat', face: 0, faceDur: 0.3, expression: 'determined' },
    cam(null, 'swordcat', { pos: [0.5, 0.95, -1.25], look: [0, 0.62, 0], fov: 40 }),
    sfx('impact/cloth', 'swordcat', { vol: 0.9 }),
    { t: 'env', wind: 1.1, dur: 0.6 },
    wait(1.4),
    { t: 'spawn', id: 'mirror', build: buildMirror, at: BARN.mirror, facing: Math.PI },
    { t: 'actor', id: 'swordcat', pose: 'vigil', expression: 'earnest' },
    // over her right shoulder, wide enough of her that her reflection (a tiny knight) sits beside her head in the glass
    cam(null, 'swordcat', { pos: [-0.72, 0.92, -0.92], look: [-0.12, 0.66, 1.25], fov: 40, mode: 'rail', to: [-0.62, 0.88, -0.78], dur: 3.6, nowait: true }),
    wait(1.6),
    say('swordcat', 'cs01.10', 2.4),
    wait(0.6),
    { t: 'ui', fade: { to: '#000', alpha: 1, dur: 0.8 } },
    wait(0.85),
  ],
  end: {
    flags: { 'prologue.armour': true },
    env: 'meadow_night',
    player: { spawn: 'practice', outfit: 'armour' },
    actors: { swordcat: { prop: { helmet: false } } },
    music: { track: 'village_bards_tale', fade: 1 },
    ui: { letterbox: false, hud: true, fade: { alpha: 0, dur: 1.0 } },
    chapter: 'prologue',
    cam: 'follow',
    save: true,
  },
};
