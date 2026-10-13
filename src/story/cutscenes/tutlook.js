// src/story/cutscenes/tutlook.js  (owner: story) — Morning Practice P1 "Race you to the dummy!" look (WA §7.2), ~1.7 s
// in-engine. The title spawn (0, −64) faces the practice field from its north gate, and the iso camera (yaw π: north is
// up) frames her with the dummies 12 m below the bottom edge. When the move lesson starts that far from them, the
// camera glides out to a high framing that holds her AND the gold sun ring at the middle dummy, holds it while Pearl
// runs ahead, then blends back to follow. No letterbox, the HUD stays; any input after 0.3 s skips it.
import { PRACTICE } from '../tutorial.js';
import { wait } from './lib.js';

/**
 * The look shot: anchored on the point `mid` of the way from her to the dummy (yaw 0, so +Z = north and the camera
 * sits south like the iso rig), high enough that both ends are inside the frame on landscape and portrait.
 */
export const LOOK = Object.freeze({ mid: 0.6, pos: Object.freeze([0, 11.5, -9.8]), look: Object.freeze([0, 0.3, 0]), fov: 46, blendIn: 0.6, hold: 1.1 });

/** The shot's anchor point between (x, z) and the middle dummy. Pure. */
export function lookAnchor(x, z, cfg = PRACTICE, k = LOOK.mid) {
  const [dx, dz] = cfg.dummies[1];
  return [x + (dx - x) * k, z + (dz - z) * k];
}

export default {
  id: 'tutlook', kind: 'cutscene', skippable: true, prologue: true, letterbox: false, hud: true, inputSkip: 0.3, player: false,
  steps: [
    { t: 'call', fn: (ctx, cs) => { const p = ctx.player; cs.lookAt = p ? lookAnchor(p.pos.x, p.pos.z) : lookAnchor(0, -64); } },
    { t: 'call', fn: (ctx, cs) => ctx.cam?.shot?.({ anchor: cs.lookAt, mode: 'blend', pos: LOOK.pos, look: LOOK.look, fov: LOOK.fov, dur: LOOK.blendIn, ease: 'inOutSine' }), max: LOOK.blendIn + 0.4 },
    wait(LOOK.hold),
  ],
  end: {
    ui: { letterbox: false, hud: true },
    cam: 'follow',
  },
};
