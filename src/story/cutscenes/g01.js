// src/story/cutscenes/g01.js  (owner: story) — G-01 Sir Tallbert (GAME_DESIGN §5.4) [MVP], TT2 §10.3: a non-blocking
// gag bark now (measured: 2.6 s; ambient: no letterbox, no input lock, the HUD and the camera stay; nothing to skip).
// Chapter 1 (WA §8.4, ON §5.5): armed on `prologue.done`, right on her way north from the barn. World's `tallbert`
// trigger may play it; StoryManager's prologue director plays it by proximity. Once per save (`seen.g01`).
//   she glances up at the 6 m stone knight beside the gate, a soft wind gust: "...Hello." (the statue does not answer)
import { wait } from './lib.js';

/** The old stage spot and the statue (kept: world places Tallbert at G01_STATUE; the director arms on its z). */
export const G01_SPOT = Object.freeze([2.65, -57.5]);
export const G01_STATUE = Object.freeze([4, -55.5]);
/** Her back to the statue: facing from the statue through her spot (old staging; kept for tests / tools). */
export const G01_FACING = Math.atan2(G01_SPOT[0] - G01_STATUE[0], G01_SPOT[1] - G01_STATUE[1]);
/** The bark's length (s). */
export const G01_BARK = 2.6;

export default {
  id: 'g01', kind: 'ambient', skippable: false, prologue: true, letterbox: false, hud: true, player: false, once: true,
  steps: [
    { t: 'env', wind: 1.2, dur: 0.8, nowait: true },
    { t: 'call', fn: (ctx, cs) => { if (ctx.player) cs.host?.barks?.say?.(ctx.player, 'g01.1', 'swordcat', G01_BARK - 0.4); } },
    wait(G01_BARK),
  ],
  end: {
    env: { wind: 0.4, dur: 1 },
    ui: { letterbox: false },
    cam: false,
  },
};
