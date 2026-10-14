// src/story/cutscenes/cs02.js  (owner: story) — CS-02 The Giggling Mist (GAME_DESIGN §5.4 "never removed, may be
// tightened"; WA15, ON §5.3) [MVP]. ~50 s with `STORY.cs02Cut` (default), the long cut (~80 s) without it.
// Played right after the height chart (CS-01 `end.play`). Lavender `meadow_giggle` (fog 0.062, cutscene only): sad
// beats are lavender, never grey; no monster drums, no chains, no trembling close-up. Every story fact stays: the
// Dawnstone glow goes out, the horde, the kitten carriers, Pearl, Cacklejaw's laugh, Pilfer's two thefts, her stand
// (sword ready), her choice to follow.
//   1 the wind drops (orbit)                      2 long lens: the Bell Tower glow goes out, a silly clunk
//   3 giggles from the mist: ears up, tail puff   4 the horde marches out with carriers on wobbly carts; Pearl's has a
//     pink ribbon and a hand-drawn "HELP (please)" sign — "CLEM! Follow the letters!"
//   (5 long cut only: she runs, trips on her cape)
//   6+7 she plants herself; MEME_LOOP 3.8 s       (8 long cut only: REVERSE_HORDE)
//   9 Cacklejaw leans in, laughs, his two lines   10 crane: the horde parts around her; Pilfer's two thefts
//   12 Pearl's carrier last in line: she drops letters one by one behind the cart
//   13 Clem lifts the sword, a gold sparkle runs up it, sunlight breaks through one hole in the mist; she grins —
//      "...Okay. Hold on, Pearl. I'm coming."  → a short cream fade (HUD hidden)
// end: flag prologue.raid; golden `meadow_evening`; she stands ~12 m from Marmalade's barn (the Suit Up chest, `cs01b`).
import { STORY, FADE_COLOR } from '../../core/config.js';
import { say, cam, wait, sfx, along, unit, yawOf, r2 } from './lib.js';
import { memeLook, fillLight, buildSign } from './rig.js';
import { text as stext } from '../strings.js';
import { setTimeoutish } from '../tutorial.js';

/** The horde line (meadow anchors horde_a → horde_b) and where it crosses the lane. */
const A = [-40, -45], B = [30, -55];
export const U = unit(A, B);                                   // march direction
export const LAT = [-U[1], U[0]];                              // across the column (+ = north side)
export const MARK = [-6, r2(A[1] + (B[1] - A[1]) * ((-6 - A[0]) / (B[0] - A[0])))];
/** Facing the oncoming column (toward horde_a). */
export const FACE = yawOf([-U[0], -U[1]]);
/** Where the scene starts her (on the lane, 3.6 m short of the line). */
const START = along(MARK, LAT, -3.6);
const BELL_YAW = yawOf([-130 - START[0], -20 - START[1]]);
const LANE_YAW = yawOf([-6 - 0, -50 - -62]);
const POST = [-4.0, -52.0];
/** Where she stands after the raid: ~12 m east of Marmalade's barn door, facing it (ON §5.4 "run 12 m to the barn"). */
export const RAID_END = Object.freeze([-1.5, -90.5]);
export const RAID_END_FACING = -Math.PI / 2;

const WORDS = ['GRUMP', 'GRUMBLER', 'NAYSAYER', 'SCOFFER', 'SNEERER', 'SPOILER', 'GRUMP', 'GRUMBLER'];
/** 8 raiders in two files ±2.5 m, rows 2.4 m apart starting 19 m up the line; 4 push kitten carriers on carts. */
export const FILES = Array.from({ length: 8 }, (_, i) => {
  const row = i >> 1, side = i % 2 ? 1 : -1;
  return {
    id: `hyena_${i + 1}`,
    from: along(MARK, U, -(19 + 2.4 * row), LAT, 2.5 * side).map(r2),
    to: along(MARK, U, 28 + row * 0.6, LAT, 2.5 * side).map(r2),
    cage: i === 1 || i === 2 || i === 5 || i === 6, word: WORDS[i],
  };
});
const PEARL_HYENA = { from: along(MARK, U, -14, LAT, 0.6).map(r2), to: along(MARK, U, 22, LAT, 0.6).map(r2) };
/** Shot 12: Pearl's carrier comes last, from further up the line, and passes her on the far side. */
const PEARL_LAST = { from: along(MARK, U, -9, LAT, 2.2).map(r2), to: along(MARK, U, 14, LAT, 2.2).map(r2) };
const CACKLE = { from: along(MARK, U, -16).map(r2), stop: along(MARK, U, -1.45).map(r2), off: along(MARK, U, 26, LAT, 1.0).map(r2) };
const PILFER = { from: along(MARK, U, -7, LAT, -2.6).map(r2), at: [POST[0] - 0.55, POST[1] + 0.05], off: along(MARK, U, 30, LAT, -3).map(r2) };
/** Shot 4 close-up on Pearl's carrier (hyena-local: +Z its facing, +X its left = the carrier hand). Low and ahead, so the
 *  carrier sits above the dialogue box and the hyena's head leaves the top of the frame. */
export const PEARL_CU = Object.freeze({ pos: Object.freeze([2.4, 0.9, 1.6]), look: Object.freeze([0.3, 0.3, -0.1]), fov: 42 });
/** The closing cream fade (WA §2.7): short, with the HUD still hidden; the HUD returns once the fade-out is done. */
export const END_FADE = Object.freeze({ in: 0.45, hold: 0.5, out: 0.5 });
/** The letters Pearl drops behind her cart (shot 12): every 1.1 s while it rolls past. */
export const LETTER_DROPS = Object.freeze({ n: 3, every: 1.1 });
/** Sunbreak (ON §5.3): the sun ×2.4 for 2 s and holy 0.15 on her. */
export const SUNBREAK = Object.freeze({ mul: 2.4, dur: 2.0, holy: 0.15 });

const hidden = { visible: false };
/** The cast is spawned at the start (in the mist, hidden) so nothing pops in on screen. */
const castSpawns = [
  { t: 'spawn', id: 'barkus_far', type: 'barkus_silhouette', at: 'bell_far', facing: BELL_YAW + Math.PI, ...hidden },
  { t: 'spawn', id: 'hyena_pearl', type: 'hyena', at: PEARL_HYENA.from, facing: yawOf(U), opts: { cage: 'pearl', word: 'GRUMBLER' }, ...hidden },
  ...FILES.map((h) => ({ t: 'spawn', id: h.id, type: 'hyena', at: h.from, facing: yawOf(U), opts: { cage: h.cage, word: h.word }, ...hidden })),
  { t: 'spawn', id: 'cacklejaw', type: 'cacklejaw', at: CACKLE.from, facing: yawOf(U), ...hidden },
  { t: 'spawn', id: 'pilfer', type: 'pilfer', at: PILFER.from, facing: yawOf(U), ...hidden },
  { t: 'spawn', id: 'signpost', prop: 'signpost', at: POST, facing: Math.PI / 2 },
  { t: 'spawn', id: 'postbag', prop: 'post_bag', at: [POST[0], POST[1] - 0.1], y: 0.7, facing: Math.PI / 2 },
];

/** Drop the post bag off its hook when Pilfer takes the post (it lands at his feet). */
function bagFalls(ctx, cs) {
  const r = cs.spawned.find((x) => x.id === 'postbag');
  if (!r?.obj) return;
  r.obj.position.y = (ctx.physics?.heightAt?.(r.obj.position.x, r.obj.position.z) ?? r.obj.position.y - 0.7) + 0.04;
  r.obj.rotation.z = 1.35;
}

/** Pearl's "HELP (please)" sign rides on her carrier (a child of the hyena pushing it; disposed with the scene). */
function pearlSign(ctx, cs) {
  const h = cs.actor('hyena_pearl');
  if (!h?.object3d) return;
  const sign = buildSign(stext('cs02.sign'));
  sign.position.set(0.32, 1.05, -0.35);
  sign.rotation.y = Math.PI / 2;
  h.object3d.add(sign);
  cs.spawned.push({ id: 'sign', kind: 'object', obj: sign, keep: false });
}

/** Shot 12: a letter lands behind Pearl's cart every LETTER_DROPS.every s (props, gone with the scene). */
function dropLetters(ctx, cs) {
  let t = 0, n = 0;
  cs.every((dt) => {
    if (n >= LETTER_DROPS.n) return;
    t += dt;
    if (t < LETTER_DROPS.every * (n + 1)) return;
    const h = cs.actor('hyena_pearl');
    if (!h?.pos) return;
    n++;
    const at = [h.pos.x - U[0] * 0.9, h.pos.z - U[1] * 0.9];
    cs.spawnOne({ id: `letter_${n}`, prop: 'letter', at, facing: n * 1.3, y: 0.03, rx: -Math.PI / 2 });
    ctx.fx?.burst?.('sparkle', { x: at[0], y: h.pos.y + 0.3, z: at[1] }, { count: 4, color: '#FFF1C4' });
  });
}

/** The sunbreak: one hole in the mist, sun ×2.4 for 2 s (back over 1 s), a gold sparkle up the blade. */
function sunbreak(ctx) {
  const env = ctx.env;
  const base = env?.sun?.intensity ?? env?.current?.sun?.intensity ?? 2.2;
  try {
    env?.set?.({ sun: { intensity: base * SUNBREAK.mul } }, 0.4);
    const g = ctx.game;
    if (g?.addFrameHook) {
      let t = 0;
      const off = g.addFrameHook((dt) => { t += dt; if (t >= SUNBREAK.dur) { off(); try { env?.set?.({ sun: { intensity: base } }, 1.0); } catch { /* gone */ } } });
    }
  } catch (e) { console.warn('[story] sunbreak failed', e); }
}

/** The giggle bed (no drums, WA §9): the procedural laugh at a soft rate, plus wobbly-cart rattles. */
const giggle = (at, vol = 0.6) => sfx('laugh', at, { rate: 0.9, vol });
const rattle = (at, vol = 0.5) => sfx('hitWood', at, { vol, rate: 1.1 });

/**
 * The CS-02 step list. `cut` = the tightened ~50 s scene (WA15); false = the long cut (the trip and REVERSE_HORDE beats,
 * longer holds). Both share the same cast, lines, end and audio. Pure.
 */
export function cs02Steps(cut = true) {
  const k = cut ? 1 : 1.5;          // hold multiplier for the long cut
  return [
    { t: 'ui', letterbox: true, hud: false },
    { t: 'music', track: null, fade: 2.0 },
    { t: 'actor', id: 'swordcat', at: START, facing: LANE_YAW, pose: 'idle' },
    ...castSpawns,

    // ---- 1 · the wind drops; lavender giggle mist
    { t: 'cam', mode: 'orbit', anchor: 'swordcat', r: 3.2, h: 1.15, degPerSec: 9, look: [0, 0.75, 0], fov: 40, dur: 3 * k, nowait: true },
    { t: 'env', preset: 'meadow_giggle', fogDensity: 0.062, wind: 0.1, dur: 2.5, nowait: true },
    { t: 'actor', id: 'swordcat', face: BELL_YAW, faceDur: 1.2, expression: 'worried' },
    wait(1.8 * k),

    // ---- 2 · long lens: the Bell Tower glow goes out (a silly clunk)
    { t: 'actor', id: 'barkus_far', visible: true },
    cam(null, 'swordcat', { pos: [0.55, 1.05, -1.3], look: 'bell_far', fov: 8, noise: 0.006, mode: 'handheld' }),
    wait(1.2 * k),
    { t: 'env', dawnstone: false },
    sfx('bellClunk', 'bell_far', { vol: 0.9 }),
    wait(2.8 * k),

    // ---- 3 · giggles from the mist: ears up, tail puff
    cam(null, 'swordcat', { mode: 'handheld', pos: [0.95, 0.95, 1.45], look: [0, 0.78, 0], fov: 38, noise: 0.02 }),
    { t: 'actor', id: 'barkus_far', visible: false },
    { t: 'sfx', id: 'laughChorus', at: 'swordcat', count: 5, r: 18, dur: 14, vol: 0.6, handle: 'chorus', nowait: true },
    { t: 'actor', id: 'swordcat', emote: 'tailPuff', expression: 'surprised' },
    wait(1.2 * k),
    { t: 'actor', id: 'swordcat', face: BELL_YAW - 1.1, faceDur: 0.4 },
    wait(0.9 * k),
    { t: 'actor', id: 'swordcat', face: yawOf(LAT), faceDur: 0.5, expression: 'worried' },
    wait(1.2 * k),

    // ---- 4 · wide: the horde and its kitten carriers on wobbly carts; Pearl's passes with her sign
    cam(null, 'swordcat', { pos: [-1.5, 1.4, -3.5], look: [1.2, 1.15, 9], fov: 50 }),
    { t: 'fx', horde: true, at: 'horde_a', laugh: 0.6 },
    { t: 'sfx', id: 'march', at: MARK, on: true, vol: 0.7, handle: 'march' },
    rattle(MARK),
    { t: 'call', fn: pearlSign },
    { t: 'actor', id: 'hyena_pearl', visible: true, moveTo: PEARL_HYENA.to, speed: 2.4, nowait: true },
    wait(2.4 * k),
    rattle('hyena_pearl', 0.6),
    giggle('hyena_pearl', 0.5),
    wait(1.0),
    // her call is the hook of the first minutes: a close two-shot of her carrier and the sign while she speaks (the cut
    // tracks the cart; the carrier hangs at the hyena's left hand, +X), then back to Clem's face as she decides
    cam(null, 'hyena_pearl', { pos: PEARL_CU.pos, look: PEARL_CU.look, fov: PEARL_CU.fov }),
    say('pearl', 'cs02.1', 1.7, { portrait: 'pearl' }),
    cam(null, 'swordcat', { pos: [0.95, 0.95, 1.45], look: [0, 0.78, 0], fov: 38 }),
    { t: 'actor', id: 'swordcat', expression: 'determined' },

    // ---- 5 · (long cut) she runs, trips on her cape, gets up
    ...(cut ? [
      { t: 'actor', id: 'swordcat', moveTo: MARK, speed: 4.0, nowait: true },
    ] : [
      cam(null, 'swordcat', { pos: [1.7, 0.85, 1.7], look: [0, 0.55, 0.4], fov: 46 }),
      { t: 'actor', id: 'swordcat', moveTo: along(START, LAT, 1.8), speed: 4.5 },
      { t: 'actor', id: 'swordcat', pose: 'faint', expression: 'surprised' },
      sfx('impact/cloth_heavy', 'swordcat', { vol: 1.0 }),
      { t: 'fx', burst: 'dust', at: 'swordcat', count: 6 },
      wait(0.7),
      { t: 'actor', id: 'swordcat', pose: 'idle', emote: 'shake', expression: 'determined' },
      wait(0.35),
      { t: 'actor', id: 'swordcat', moveTo: MARK, speed: 3.6 },
    ]),

    // ---- 6 · she plants herself in the middle of the lane
    cam(null, 'swordcat', { pos: [1.25, 0.85, 2.7], look: [0, 0.62, 0], fov: 40 }),
    { t: 'actor', id: 'swordcat', at: MARK, face: FACE, faceDur: 0.35 },
    ...FILES.map((h) => ({ t: 'actor', id: h.id, visible: true, moveTo: h.to, speed: 1.8, nowait: true })),
    { t: 'actor', id: 'swordcat', pose: 'vigil', expression: 'earnest' },
    sfx('sword/sword_unsheathe2', 'swordcat', { vol: 1.0 }),
    { t: 'actor', id: 'cacklejaw', visible: true, moveTo: CACKLE.stop, speed: 2.0, nowait: true },
    { t: 'actor', id: 'hyena_pearl', visible: false },
    wait(1.0 * k),

    // ---- 7 · HER STAND (the MEME_LOOP preset id is only the camera's name for this framing; she takes her guard
    // stance, sword ready: Token Tails pass, docs/PROVENANCE.md)
    { t: 'actor', id: 'swordcat', pose: 'ready', expression: 'earnest' },
    { t: 'env', wind: 1.0, dur: 0.8, nowait: true },
    { t: 'call', fn: (ctx) => memeLook(ctx, true) },
    { t: 'cam', preset: 'MEME_LOOP', anchor: 'swordcat', mode: 'cut' },
    wait(3.8),
    { t: 'call', fn: (ctx) => memeLook(ctx, false) },

    // ---- 8 · (long cut) REVERSE_HORDE: they emerge toward camera and split around her
    ...(cut ? [] : [
      cam('REVERSE_HORDE', 'swordcat', { fov: 38 }),
      giggle('hyena_2', 0.8),
      wait(2.2),
      giggle('hyena_5', 0.8),
      wait(2.4),
    ]),

    // ---- 9 · Cacklejaw: snout to her nose, then the laugh
    { t: 'actor', id: 'cacklejaw', face: 'swordcat', faceDur: 0.3 },
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'cacklejaw', pos: [2.3, 0.85, 1.0], fov: 44, lookMid: 1.4 }),
    { t: 'actor', id: 'cacklejaw', pose: 'kneel' },
    wait(1.0 * k),
    { t: 'actor', id: 'cacklejaw', pose: 'sneer' },
    { t: 'actor', id: 'swordcat', emote: 'blink' },
    wait(0.8 * k),
    // his face fills the frame; a warm fill from her side (the cutscene lamp slot, no PointLight) lifts it from the mist
    { t: 'call', fn: (ctx, cs) => fillLight(cs, 'cacklejaw', { intensity: 6 }) },
    cam(null, 'cacklejaw', { pos: [0.7, 1.36, 2.15], look: [0, 1.5, 0.2], fov: 40, noise: 0.008, mode: 'handheld' }),
    { t: 'actor', id: 'cacklejaw', pose: 'laugh', emote: 'laugh' },
    sfx('laugh', 'cacklejaw', { rate: 0.9, vol: 1.2 }),
    say('cacklejaw', 'cs02.2', 2.2),
    say('cacklejaw', 'cs02.3', 4.0),
    { t: 'actor', id: 'cacklejaw', clip: 'Cheer', nowait: true },
    { t: 'call', fn: (ctx, cs) => fillLight(cs, 'cacklejaw', { intensity: 0 }) },

    // ---- 10 · top-down crane: the river parts around the stone; Pilfer's two thefts
    { t: 'env', fogDensity: 0.05, dur: 1.2, nowait: true },
    { t: 'cam', anchor: 'swordcat', mode: 'rail', pos: [0.6, 3.2, 3.0], to: [0.25, 14, 1.1], look: [0, 0.4, 0.3], lookTo: [0, 0, 0.2], fov: [44, 40], dur: 8 * k, ease: 'inOutSine', nowait: true },
    { t: 'fx', horde: true, at: 'swordcat', dir: [U[0], 0, U[1]], avoid: 'swordcat', avoidR: 3.4, near: 0, length: 46, laugh: 0.7 },
    { t: 'actor', id: 'cacklejaw', pose: 'laugh', moveTo: CACKLE.off, speed: 2.0, nowait: true },
    { t: 'actor', id: 'pilfer', visible: true, moveTo: PILFER.at, speed: 3.4 },
    { t: 'actor', id: 'pilfer', face: POST, faceDur: 0.2 },
    { t: 'despawn', id: 'signpost' },
    { t: 'actor', id: 'pilfer', prop: 'signpost' },
    { t: 'call', fn: bagFalls },
    sfx('world/creak1', 'pilfer', { vol: 0.7 }),
    say('pilfer', 'cs02.4', 1.1),
    { t: 'actor', id: 'pilfer', pose: 'kneel' },
    wait(0.4),
    { t: 'despawn', id: 'postbag' },
    { t: 'actor', id: 'pilfer', prop: 'post_bag', pose: 'sneer' },
    say('pilfer', 'cs02.5', 1.2),
    { t: 'actor', id: 'pilfer', moveTo: PILFER.off, speed: 5.0, nowait: true },
    wait(1.4 * k),

    // ---- 12 · Pearl's carrier comes last: she drops letters behind the cart, one by one
    { t: 'actor', id: 'hyena_pearl', visible: true, at: PEARL_LAST.from, facing: yawOf(U) },
    cam(null, 'swordcat', { pos: [-1.2, 1.25, -2.4], look: [2.2, 0.6, 4.0], fov: 44 }),
    { t: 'actor', id: 'hyena_pearl', moveTo: PEARL_LAST.to, speed: 2.6, nowait: true },
    { t: 'call', fn: dropLetters },
    rattle('hyena_pearl', 0.5),
    sfx('cat/meow_baby_01', 'hyena_pearl', { vol: 0.7 }),
    { t: 'actor', id: 'swordcat', face: 'hyena_pearl', faceDur: 0.5, expression: 'worried' },
    wait(4.0),

    // ---- 13 · the sunbreak: she lifts the sword; one hole in the mist; she grins
    { t: 'fx', horde: false },
    { t: 'sfx', stop: 'chorus', fade: 1.2 },
    { t: 'sfx', stop: 'march', fade: 1.5 },
    { t: 'despawn', ids: ['hyena_*', 'cacklejaw', 'pilfer', 'barkus_far'] },
    cam(null, 'swordcat', { pos: [1.1, 0.8, 2.1], look: [0, 0.7, 0], fov: 38 }),
    { t: 'actor', id: 'swordcat', face: FACE, faceDur: 0.3, pose: 'oath', expression: 'determined' },
    sfx('sword/sword_unsheathe3', 'swordcat', { vol: 0.7 }),
    { t: 'call', fn: sunbreak },
    { t: 'music', track: 'battle_theme_a', fade: 0.3 },
    { t: 'actor', id: 'swordcat', holy: [0, SUNBREAK.holy, 0], dur: 0.6 },
    { t: 'fx', burst: 'sparkle', at: 'swordcat', count: 10, color: '#FFE3A3' },
    { t: 'env', fogDensity: 0.04, dur: 1.5, nowait: true },
    { t: 'actor', id: 'swordcat', expression: 'happy', emote: 'blink' },
    say('swordcat', 'cs02.6', 2.4),
    { t: 'ui', hud: false, fade: { to: FADE_COLOR, alpha: 1, dur: END_FADE.in } },
    wait(END_FADE.hold),
  ];
}

export default {
  id: 'cs02', kind: 'cutscene', skippable: true, prologue: true, once: true,
  steps: cs02Steps(STORY.cs02Cut !== false),
  end: {
    call: (ctx, cs, skipped, phase) => {
      if (phase === 'before') { fillLight(cs, null); memeLook(ctx, false); return; }
      cs.host?.barnSet?.(true);
      // the HUD comes back only after the cream fade-out (no gameplay HUD over a half-faded frame)
      const host = cs.host;
      setTimeoutish(ctx, END_FADE.out, () => { if (!host?.current || host.current === cs) host?.cinema?.hud?.(true); });
    },
    flags: { 'prologue.raid': true },
    env: 'meadow_evening',
    actors: { swordcat: { prop: { helmet: false }, pos: RAID_END, facing: RAID_END_FACING, expression: null } },
    music: { track: 'village_bards_tale', fade: 2 },
    ui: { letterbox: false, hud: false, title: null, fade: { alpha: 0, dur: END_FADE.out } },
    cam: 'follow',
    save: true,
  },
};

// (positions are exported for the unit test: MARK is on the horde line, the files pass ±2.5 m from her)
export const CS02_CAST = Object.freeze({ START, MARK, FACE, PEARL_HYENA, PEARL_LAST, CACKLE, PILFER, POST, RAID_END });
