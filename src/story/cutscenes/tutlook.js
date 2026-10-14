// src/story/cutscenes/tutlook.js  (owner: story) — the old Morning Practice "look" shot (WA §7.2). TT2 §10.3 drops it:
// the Pink Paw trail and the camera look-ahead show the way to the dummy now, so practice never plays it (measured:
// 0 s). The id stays registered as a no-op ambient scene (old callers / tools); `lookAnchor` stays for tests.
import { PRACTICE } from '../tutorial.js';

/** The old look shot's numbers (kept for reference; nothing plays it). */
export const LOOK = Object.freeze({ mid: 0.6, pos: Object.freeze([0, 11.5, -9.8]), look: Object.freeze([0, 0.3, 0]), fov: 46, blendIn: 0.6, hold: 1.1 });

/** The point `k` of the way from (x, z) to the middle dummy. Pure. */
export function lookAnchor(x, z, cfg = PRACTICE, k = LOOK.mid) {
  const [dx, dz] = cfg.dummies[1];
  return [x + (dx - x) * k, z + (dz - z) * k];
}

export default {
  id: 'tutlook', kind: 'ambient', skippable: false, prologue: true, letterbox: false, hud: true, player: false,
  steps: [],
  end: {
    ui: { letterbox: false },
    cam: false,
  },
};
