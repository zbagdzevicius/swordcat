// src/story/cutscenes/cs04.js  (owner: story) — CS-04 Lantern Night (GAME_DESIGN §5.4) [MVP] [TREND V6], ~40 s.
// `forest` trigger `camp` (disc r 6 at (6,40)); the env lerps to night over 4 s.
//   1 CRANE_DOWN into the clearing: Pudding sleeps curled around it (Pudding's 'sleep' mode: the clamped last frame of
//     Death), snoring; Clem sits by his nose with a lantern (PointLight #FFC46B, 1.5, 6 m); fireflies; Mochi and Sage
//     lie by the fire. Purr loop + low fire crackle.
//   2 TWO_SHOT_LOW (Sage, Clem): "Can I ask something? Why you? You're the smallest of us." "Because I was there."
//   3 ECU_EYES, 2 s of silence: "I'm not brave. I'm just... here."
//   4 wide: Mochi, half asleep, rolls over: "That's what brave is, I think. Being scared and being here."
//     Sage: "...Don't tell anyone I cried."
//   5 slow push-out (the tail curl is [unverified] on Dragon_Evolved's Body bones: skipped, push-out only); fade out.
// end: flag forest.camp; Vigil Stone `vigil_3` lit; env forest_night; music dark_forest_creepy (its map volume 0.6).
import * as THREE from 'three';
import { say, cam, wait, sfx, yawOf } from './lib.js';
import { castFriend, buildLanternLight, buildFireflies, animateBuilt, activateVigil, hideParty, showParty } from './cast.js';

/** §12.4 camp zone: the campfire and Pudding's sleep anchor (6,48) facing −Z. Anchors win when world places them. */
export const CAMP = [6, 40];
export const PUD = [6, 48];
/** Clem sits by his nose (his head is toward −Z), facing the fire; Sage beside her; Mochi curled by the fire. */
export const SEAT = [5.3, 44.4];
const SAGE_AT = [6.5, 44.0];
const MOCHI_AT = [4.4, 40.9];
const FACE_FIRE = yawOf([CAMP[0] - SEAT[0], CAMP[1] - SEAT[1]]);
/** where she stands when the night starts (gameplay): south of the fire, so the camera looks past it at the sleeping Pudding */
const END_AT = [7.4, 36.2];

const camp = { anchor: 'camp_fire', or: CAMP };
const pud = { anchor: 'pud_sleep', or: PUD };

/** Pudding: the level's own Pudding when there is one (scripted), else spawned for the night (he stays asleep). */
function castPudding(ctx, cs) {
  const p = ctx.companions?.pudding;
  if (p && !p.disposed) {
    cs.script(p);
    cs.place(p, pud, Math.PI);
    cs.aliases.set('pudding', p);
  } else cs.spawnOne({ id: 'pudding', type: 'pudding', kind: 'npc', at: pud, facing: Math.PI, keep: true });
  cs.actor('pudding')?.pose?.('sleep');
}

function castCamp(ctx, cs) {
  hideParty(ctx, cs, ['mochi', 'sage']);
  castFriend(ctx, cs, 'sage', SAGE_AT, FACE_FIRE - 0.5);
  castFriend(ctx, cs, 'mochi', { anchor: 'camp_mochi', or: MOCHI_AT }, 1.2);
  cs.actor('mochi')?.pose?.('sleep');
  cs.actor('sage')?.pose?.('sit');
  const me = ctx.player;
  if (me) {
    // the lantern's light sits a little in front of her and low, so it warms her face instead of blowing it out
    const lx = SEAT[0] + Math.sin(FACE_FIRE) * 0.65, lz = SEAT[1] + Math.cos(FACE_FIRE) * 0.65;
    cs.spawnOne({ id: 'lantern_light', kind: 'object', build: buildLanternLight, at: [lx, lz] });
    // fx's warm glow halo + embers on the held lantern (requests/fx.md); our PointLight stays the real light
    cs.spawnOne({ id: 'lantern_glow', kind: 'object', at: [lx, lz], build: (c) => {
      const holder = new THREE.Object3D();
      let h = null;
      try { h = c.fx?.lantern?.('swordcat', { lit: true }) ?? null; } catch (e) { console.warn('[story] fx lantern', e); }
      holder.userData.dispose = () => { try { h?.remove?.(); } catch { /* fx optional */ } };
      return holder;
    } });
  }
  cs.spawnOne({ id: 'fireflies', kind: 'object', build: () => buildFireflies(40, 8), at: camp });
  animateBuilt(cs, 'fireflies');
}

export default {
  id: 'cs04', kind: 'cutscene', skippable: true,
  steps: [
    { t: 'ui', letterbox: true, hud: false, fade: { to: '#000', alpha: 1, dur: 0.6 } },
    wait(0.65),
    { t: 'music', track: null, fade: 2 },
    { t: 'env', preset: 'forest_night', dur: 4, nowait: true },
    { t: 'actor', id: 'swordcat', at: SEAT, facing: FACE_FIRE, pose: 'sit', prop: 'lantern', expression: 'sleepy' },
    { t: 'call', fn: castPudding },
    { t: 'call', fn: castCamp },
    { t: 'sfx', id: 'cs04.purr', at: 'pudding', loop: true, handle: 'purr' },
    { t: 'sfx', id: 'cs04.camp', at: CAMP, handle: 'camp' },

    // ---- 1 · crane down into the clearing
    { t: 'ui', fade: { alpha: 0, dur: 1.6 } },
    { t: 'cam', anchor: 'swordcat', mode: 'rail', pos: [1.5, 7.5, 9.0], to: [0.9, 1.5, 4.2], look: [0, 1.5, -2.5], lookTo: [0, 0.75, -1.2], fov: [44, 40], dur: 8, ease: 'inOutSine', nowait: true },
    wait(3.5),
    sfx('cs04.crackle', CAMP),
    wait(3.0),
    sfx('cs04.snore', 'pudding'),
    { t: 'fx', burst: 'smoke', at: 'pudding', count: 4, scale: 0.6 },
    wait(1.6),

    // ---- 2 · Sage asks
    { t: 'actor', id: 'swordcat', expression: 'earnest' },
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'sage', pos: [1.3, 0.62, 1.6], fov: 38, lookMid: 0.55 }),
    wait(0.6),
    say('sage', 'cs04.1', 4.0),
    { t: 'actor', id: 'swordcat', face: 'sage', faceDur: 0.5 },
    say('swordcat', 'cs04.2', 2.2),

    // ---- 3 · ECU: silence, then the line
    { t: 'actor', id: 'swordcat', face: FACE_FIRE, faceDur: 0.6, expression: 'glisten' },
    cam('ECU_EYES', 'swordcat', { mode: 'handheld', noise: 0.002, pos: [0.06, 0.6, 0.7], look: [0, 0.6, 0], fov: 26 }),
    wait(2.0),
    { t: 'actor', id: 'swordcat', emote: 'blink' },
    say('swordcat', 'cs04.3', 3.4),

    // ---- 4 · wide: Mochi rolls over
    cam(null, 'swordcat', { pos: [1.6, 1.5, -3.2], look: [-0.4, 0.4, 3.2], fov: 50 }),
    { t: 'actor', id: 'mochi', pose: 'sit', emote: 'blink', expression: 'sleepy' },
    sfx('cs04.rollover', 'mochi'),
    wait(0.8),
    say('mochi', 'cs04.4', 4.2),
    { t: 'actor', id: 'mochi', pose: 'sleep' },
    { t: 'actor', id: 'sage', emote: ['earsFlat', 'blink'], expression: 'glisten' },
    say('sage', 'cs04.5', 2.6),
    { t: 'actor', id: 'swordcat', expression: 'happy' },

    // ---- 5 · the slow push-out over the sleeping dragon; fade to black
    { t: 'cam', anchor: 'swordcat', mode: 'rail', pos: [0.4, 1.0, 2.6], to: [2.5, 6.5, 11], look: [0, 0.6, -1], lookTo: [0, 0.8, -3.5], fov: [38, 46], dur: 7, ease: 'inOutSine', nowait: true },
    wait(4.5),
    { t: 'ui', fade: { to: '#000', alpha: 1, dur: 2.0 } },
    wait(2.2),
    { t: 'sfx', stop: 'purr', fade: 1.0 },
    { t: 'sfx', stop: 'camp', fade: 1.0 },
  ],
  end: {
    call: (ctx, cs, skipped, phase) => {
      if (phase === 'before') showParty(cs);
      else activateVigil(ctx, 'vigil_3', true);
    },
    flags: { 'forest.camp': true },
    // hand-back south of the fire facing on up the path (+Z): the follow camera behind her must not sit inside the sleeping Pudding
    actors: { swordcat: { prop: { lantern: false }, pos: END_AT, facing: yawOf([PUD[0] - END_AT[0], PUD[1] - END_AT[1]]) }, pudding: { pose: 'sleep' } },
    env: 'forest_night',
    music: { track: 'dark_forest_creepy', fade: 2 },
    ui: { letterbox: false, hud: true, fade: { alpha: 0, dur: 1.2 } },
    cam: 'follow',
    save: true,
  },
};
