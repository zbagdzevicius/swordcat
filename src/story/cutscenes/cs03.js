// src/story/cutscenes/cs03.js  (owner: story) — CS-03 Snack Break (GAME_DESIGN §5.4, Appendix B.2) [MVP, NEVER CUT],
// ~30 s [TREND V3]. Interact with the picnic hay bale (`meadow` Picnic Glade, world's `picnic` interactable).
//   1 SELFIE: she sits against the hay bale with a snack cup (the `milk_cup` prop), nibbles, talks to her gauntlet like a camera
//   2 a tremor (shake 0.2): she freezes mid-sip
//   3 WHIP_FALL: the camera falls and lands sideways in the grass; the dropped cup rolls into the foreground
//   4 Pudding rises out of the fog and ROARS into the lens (shake 0.8, a wind spike); hold 1.2 s
//   5 HERO_LOW, upright: she stands over her cup, sword planted, then raised; he is tangled in a hound net
//   6 two-shots, her and his nose: "Is that... a tuna snack?" — he nibbles it with enormous care
// end: `meadow.pudding` = 'netted' (world raises the 3 rope posts, companions keep him netted), objective net_ropes
// 0/3 (needs the glade clear), the glade arena locks, music battle_fast_fight_loop.
import { say, cam, wait, sfx, par, along, yawOf, r2 } from './lib.js';
import { memeLook } from './rig.js';

/** Pudding's net spot (companions' PUDDING.net) and the bale (world's `picnic`). */
export const NET = [2, 24];
const BALE = [0, 16];
/**
 * Her facing on the bale is chosen so the WHIP_FALL (+120° from the selfie view, which looks back at her) lands
 * looking straight at the net — Pudding then rises into that lens.
 */
const WHIP = (120 * Math.PI) / 180;
const SIT_DIR_YAW = 1.214;
const SIT = along(BALE, [Math.sin(SIT_DIR_YAW), Math.cos(SIT_DIR_YAW)], 0.78).map(r2);
export const VIEW_YAW = yawOf([NET[0] - SIT[0], NET[1] - SIT[1]]);
export const FACE = VIEW_YAW - Math.PI - WHIP + Math.PI * 2;
const VIEW = [Math.sin(VIEW_YAW), Math.cos(VIEW_YAW)];
/** The selfie lens (her frame), where the fallen camera lies, and the cup's roll into its foreground. */
const SELFIE_POS = [0.3, 0.98, 0.8];
const LENS = [SIT[0] + SELFIE_POS[0] * Math.cos(FACE) + SELFIE_POS[2] * Math.sin(FACE), SIT[1] - SELFIE_POS[0] * Math.sin(FACE) + SELFIE_POS[2] * Math.cos(FACE)];
const CUP_FROM = along(SIT, [Math.sin(FACE), Math.cos(FACE)], 0.3).map(r2);
const CUP_TO = along(LENS, VIEW, 0.5).map(r2);
/** Upright over her cup with the net behind her (HERO_LOW looks at her front, so Pudding fills the background). */
const HERO = along(SIT, [Math.sin(SIT_DIR_YAW), Math.cos(SIT_DIR_YAW)], 0.45).map(r2);
const AWAY = yawOf([HERO[0] - NET[0], HERO[1] - NET[1]]);
/** Where she stands to talk to his nose (he is ~6 m long, facing her). */
const NOSE = [1.7, 20.2];

/** The cup rolls into the fallen camera's foreground (0.8 s, a little wobble). */
function rollCup(ctx, cs) {
  let t = 0;
  cs.every((dt) => {
    const r = cs.spawned.find((x) => x.id === 'cup')?.obj;
    if (!r) return t < 3;                                          // still building: keep waiting a moment
    t += dt;
    const u = Math.min(1, t / 0.8), e = 1 - (1 - u) * (1 - u);
    r.position.x = CUP_FROM[0] + (CUP_TO[0] - CUP_FROM[0]) * e;
    r.position.z = CUP_FROM[1] + (CUP_TO[1] - CUP_FROM[1]) * e;
    r.rotation.set(0, VIEW_YAW + Math.PI / 2, Math.PI / 2);
    r.rotateY(e * 5.5);
    return u < 1;
  });
}

/**
 * The fallen lens (wherever the WHIP_FALL actually landed): Pudding charges straight down its axis and stops with his
 * jaws ROAR_D m from the glass, so they fill the sideways frame. Falls back to the net when there is no camera.
 */
const ROAR_D = 4.0, ROAR_RUN = 7;
const _roar = { x: NET[0], z: NET[1], dx: 0, dz: -1 };
function lensAxis(ctx) {
  const c = ctx.camera;
  if (!c?.getWorldDirection) return null;
  const d = c.getWorldDirection(new c.position.constructor());
  const l = Math.hypot(d.x, d.z);
  if (l < 1e-3) return null;
  return { x: c.position.x, z: c.position.z, dx: d.x / l, dz: d.z / l };
}
function roarStart(ctx, cs) {
  const ax = lensAxis(ctx), a = cs.actor('pudding');
  if (!ax || !a) { _roar.x = NET[0]; _roar.z = NET[1]; return; }
  _roar.x = ax.x + ax.dx * ROAR_D; _roar.z = ax.z + ax.dz * ROAR_D; _roar.dx = ax.dx; _roar.dz = ax.dz;
  const sx = _roar.x + ax.dx * ROAR_RUN, sz = _roar.z + ax.dz * ROAR_RUN;
  a.pos.set(sx, ctx.physics?.heightAt?.(sx, sz) ?? a.pos.y, sz);
  a.prevPos?.copy?.(a.pos);
  a.facing = Math.atan2(-ax.dx, -ax.dz);
}
function roarIn(ctx, cs) {
  const a = cs.actor('pudding');
  return a?.moveTo?.([_roar.x, _roar.z], 6);
}

const roar = (rate = 0.8, vol = 0.9) => sfx('creature/creature_roar_01', 'pudding', { rate, vol });

export default {
  id: 'cs03', kind: 'cutscene', skippable: true, anchor: 'swordcat',
  steps: [
    { t: 'ui', letterbox: true, hud: false },
    { t: 'music', track: null, fade: 0.8 },
    // ---- 1 · Day one of rescuing everyone
    { t: 'actor', id: 'swordcat', at: SIT, facing: FACE, pose: 'selfie_sit', prop: 'milk_cup', expression: 'happy' },
    cam('SELFIE', 'swordcat', { pos: SELFIE_POS, look: [0, 0.62, 0], fov: 50 }),
    sfx('pickup/bubble2', 'swordcat'),
    say('swordcat', 'cs03.1', 2.6),
    sfx('pickup/bubble', 'swordcat', { vol: 0.8 }),
    { t: 'actor', id: 'swordcat', emote: 'blink' },
    say('swordcat', 'cs03.2', 1.8),
    // ---- 2 · tremor
    { t: 'fx', shake: 0.2 },
    sfx('impact/impactSoft_heavy_00x', null, { vol: 0.9, rate: 0.7 }),
    { t: 'actor', id: 'swordcat', emote: 'earsFlat', expression: 'surprised' },
    wait(0.6),
    // ---- 3 · WHIP_FALL; the cup rolls
    { t: 'spawn', id: 'pudding', type: 'pudding', at: [NET[0], NET[1] + 7], facing: Math.PI, keep: true, visible: false },
    par(
      cam('WHIP_FALL', 'swordcat'),
      sfx('impact/cloth_heavy', null, { vol: 0.9 }),
      { t: 'actor', id: 'swordcat', prop: '-milk_cup' },
      { t: 'spawn', id: 'cup', prop: 'milk_cup', at: CUP_FROM, y: 0.04, nowait: true },
    ),
    { t: 'call', fn: rollCup },
    // ---- 4 · Pudding rises and ROARS into the lens
    { t: 'call', fn: roarStart },
    { t: 'actor', id: 'pudding', visible: true },
    par(
      { t: 'call', fn: roarIn },
      { t: 'actor', id: 'pudding', clip: 'Headbutt', once: true },
      sfx('creature/creature_roar_02', 'pudding', { vol: 1.2 }),
      sfx('creature/c80_roar_01', 'pudding', { rate: 0.8, vol: 1.0 }),
      { t: 'fx', shake: 0.8 },
      { t: 'env', wind: 3.0, dur: 0.1 },
    ),
    wait(1.2),
    { t: 'env', wind: 0.6, dur: 0.5 },
    // ---- 5 · upright: she stands over her cup; the hound net
    { t: 'flag', key: 'meadow.pudding', value: 'netted' },
    { t: 'actor', id: 'pudding', pose: 'netted', at: NET, facing: Math.PI },
    { t: 'actor', id: 'swordcat', at: HERO, facing: AWAY, pose: 'vigil', expression: 'earnest' },   // his netted bulk looms behind her
    cam('HERO_LOW', 'swordcat', { pos: [-0.8, 0.35, 2.2], fov: 42 }),   // mirrored: the lens stays clear of the bale
    { t: 'call', fn: (ctx) => memeLook(ctx, true) },
    wait(1.3),
    { t: 'actor', id: 'swordcat', pose: 'oath', expression: 'determined' },
    sfx('sword/sword_unsheathe3', 'swordcat', { vol: 0.8 }),
    wait(1.7),
    { t: 'call', fn: (ctx) => memeLook(ctx, false) },
    // ---- 6 · her and his nose
    { t: 'actor', id: 'swordcat', pose: 'idle', moveTo: NOSE, speed: 1.3 },
    { t: 'actor', id: 'swordcat', face: NET, faceDur: 0.3, prop: 'milk_cup' },
    // from her right, outside the dome at his eye height: her face 3/4 at the left third, his head at the right; the
    // near rings fall above his brow and below his jaw
    cam(null, 'swordcat', { pos: [-3.9, 1.4, 2.2], look: [-0.3, 0.88, 1.6], fov: 50 }),
    roar(0.8, 0.9),
    { t: 'actor', id: 'pudding', emote: 'nod' },
    say('pudding', 'cs03.3', 2.6),
    { t: 'actor', id: 'swordcat', pose: 'selfie', expression: 'surprised' },
    say('swordcat', 'cs03.4', 1.4),
    sfx('creature/creature_roar_01', 'pudding', { rate: 1.15, vol: 0.45 }),
    say('pudding', 'cs03.5', 2.4),
    say('pudding', 'cs03.5b', 2.4),
    { t: 'actor', id: 'swordcat', expression: 'worried' },
    say('swordcat', 'cs03.6', 1.6),
    { t: 'actor', id: 'pudding', emote: 'shake' },
    say('pudding', 'cs03.7', 2.0),
    // two-shot from outside the dome on her left, level with his eye: his profile at the left third, her (3/4, facing
    // him) at the right third. At this height the near rings project above his horns and below his jaw, so no rope
    // crosses his eyes or mouth.
    cam(null, 'swordcat', { pos: [3.94, 1.5, 2.8], look: [0.1, 1.05, 2.0], fov: 48 }),
    { t: 'actor', id: 'swordcat', expression: 'earnest' },
    say('swordcat', 'cs03.8', 1.2),
    { t: 'actor', id: 'pudding', clip: 'Yes', once: true, nowait: true },
    sfx('pickup/bubble3', 'swordcat', { vol: 0.9 }),
    wait(0.8),
    say('pudding', 'cs03.9', 2.2),
    { t: 'actor', id: 'swordcat', expression: 'happy' },
    say('swordcat', 'cs03.10', 1.6),
    say('pudding', 'cs03.11', 1.6),
    sfx('creature/rat_squeak_attack', [NET[0] - 13, NET[1] - 4], { vol: 0.8 }),
    wait(0.25),
    { t: 'actor', id: 'pudding', emote: 'tailPuff' },
    roar(0.75, 1.1),
    { t: 'fx', shake: 0.35 },
    say('pudding', 'cs03.12', 3.0),
    { t: 'actor', id: 'swordcat', pose: 'idle', expression: 'determined' },
    sfx('sword/sword_unsheathe2', 'swordcat', { vol: 0.8 }),
    say('swordcat', 'cs03.13', 2.2),
  ],
  end: {
    flags: { 'meadow.pudding': 'netted' },
    actors: { swordcat: { prop: { milk_cup: false } }, pudding: { pos: NET, facing: Math.PI, pose: 'netted' } },
    objective: { id: 'net_ropes', textKey: 'obj.ropes', max: 3, needClear: 'glade' },
    arena: { id: 'glade', lock: true },
    music: { track: 'battle_fast_fight_loop', fade: 0.5 },
    ui: { letterbox: false, hud: true },
    call: (ctx, cs, skipped, phase) => { if (phase === 'before') memeLook(ctx, false); },
    cam: 'follow',
    save: true,
  },
};

export const CS03_MARKS = Object.freeze({ SIT, FACE, VIEW_YAW, LENS, CUP_FROM, CUP_TO, NOSE });
