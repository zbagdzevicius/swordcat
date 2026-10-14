// src/story/cutscenes/cs01.js  (owner: story) — CS-01 "One Ear-Tuft Short" (WA §8.4, ON §5.2) [MVP], TT2 §10.3 cut:
// measured 7.7 s (in the browser; sceneLength 7.7 s; ≤ ONBOARD.sceneCap.cs01 = 10 s). Plays right where practice ended, a moment after the
// bell (StoryManager.toChart → the director); the walk to the height chart is gone. `meadow_day`, no letterbox, HUD
// hidden, skippable from second 0 (the Skip chip). One gag:
//   the stamp sends a squire off ("Tall enough!" is implied); a low close on the chart: Clementine is one ear-tuft
//   short again. Whiskerbottom: "One ear-tuft short! Next year, Clementine."  Clem: "One tuft short. AGAIN."
// end: flag prologue.chart → CS-02 (The Giggling Mist) plays at once; the practice Pearl leaves (she is in the horde).
import { say, cam, wait, sfx } from './lib.js';

/** The scene's measured length (s; tests compare sceneLength against ONBOARD.sceneCap.cs01). */
export const CS01_LEN = 7.7;

/** Measuring spot (back to the board, facing south), where she waits, and the yard the measured squire hops to. */
const SPOT = [-6, -66.5];
const CLEM_Q = [-6, -73.5];
const YARD = [[-2.4, -68.6], [-1.7, -69.7], [-2.9, -70.4], [-1.1, -70.9], [-2.2, -71.5], [-0.8, -69.4]];
const SUN = [-1.8, -70.1];
/** (old long cut) Flop marks in the sunbeam, kept for tools / tests: a shallow arc across the closing wide's frame, ~0.66 m apart so every kitten reads on
 *  its own; the ends curl toward the lens. Each faces the camera with a little per-kitten variety. */
const SUN_RIGHT = [-0.58, 0.81];   // screen-right on the ground plane for that shot
const SUN_FWD = [0.81, 0.58];      // away from the lens
export const SUN_MARKS = [0, 1, 2, 3, 4, 5].map((i) => {
  const u = (i - 2.5) * 0.66, k = (i - 2.5) / 2.5;
  const back = 0.35 - 0.55 * k * k + (i % 2 ? 0.12 : -0.12);
  return [SUN[0] + SUN_RIGHT[0] * u + SUN_FWD[0] * back, SUN[1] + SUN_RIGHT[1] * u + SUN_FWD[1] * back];
});

const squire = (i) => `squire_${i + 1}`;

export default {
  id: 'cs01', kind: 'cutscene', skippable: true, prologue: true, letterbox: false, once: true,
  steps: [
    { t: 'ui', letterbox: false, hud: false },
    { t: 'env', preset: 'meadow_day', dur: 1.2, nowait: true },
    { t: 'spawn', id: 'whiskerbottom', type: 'npc', at: [-4.85, -66.75], facing: -1.36 },
    { t: 'spawn', id: squire(0), type: 'npc', at: SPOT, facing: Math.PI },
    { t: 'actor', id: 'swordcat', at: CLEM_Q, facing: Math.PI, pose: 'idle' },
    // ---- the stamp: a squire is tall enough and hops off; she steps up to the chart (a cut, no walk)
    cam(null, 'chart', { pos: [-0.45, 0.62, 2.1], look: [0, 0.98, 0.2], fov: 34 }),
    sfx('ui/drop_001', 'chart', { vol: 0.9 }),
    { t: 'actor', id: 'whiskerbottom', emote: 'nod' },
    { t: 'actor', id: squire(0), clip: 'jump', nowait: true },
    { t: 'actor', id: squire(0), moveTo: YARD[0], speed: 3.2, nowait: true },
    wait(0.6),
    { t: 'actor', id: 'swordcat', at: SPOT, facing: Math.PI },
    { t: 'actor', id: 'swordcat', clip: 'hop', nowait: true },
    { t: 'actor', id: 'swordcat', expression: 'determined', emote: 'blink' },
    // ---- one ear-tuft short (again)
    say('whiskerbottom', 'cs01.3', 2.0),
    sfx('ui/drop_003', 'chart', { vol: 0.7 }),
    { t: 'actor', id: 'swordcat', expression: 'sad', emote: 'earsFlat' },
    say('swordcat', 'cs01.4', 1.4),
  ],
  end: {
    flags: { 'prologue.chart': true },
    despawns: ['sunpatch', 'pearl', 'whiskerbottom', 'squire_*'],
    ui: { letterbox: false, hud: true },
    cam: 'follow',
    play: 'cs02',
  },
};
