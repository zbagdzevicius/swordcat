// src/story/cutscenes/g01.js  (owner: story) — G-01 Sir Tallbert (GAME_DESIGN §5.4) [MVP], ~8 s gameplay gag [TREND V5].
// Trigger `tallbert` (the practice field's north gate; armed by world while `prologue.tutorial && !prologue.done`).
//   1 her input is ignored for 1.0 s; she is moved to G01_SPOT (2.65, −57.5; see below) with her back to the statue; MEME_LOOP
//     holds 2.0 s while she stands in Vigil
//   2 PULLBACK over 6.0 s reveals the 6 m stone knight right behind her, in the same pose
//   3 "...Hello." (the statue does not answer)
//   4 any input after 1.0 s skips to the end; control returns
import { say, wait } from './lib.js';
import { memeLook } from './rig.js';

/**
 * Her stage spot. On g01_mark (4, −58) the statue's footprint collider (centred ~1.9 m in front of the plinth: the
 * sword) pushes her to z ≈ −58.8, which puts the MEME_LOOP lens (1.9 m in front of her) 0.7 m outside the north fence:
 * the shot then looks through half-faded fence panels. She stands just west of that footprint instead and turns
 * her back to the statue, so the lens sits ~1 m inside the fence, Tallbert still fills the frame right behind her,
 * and the PULLBACK rail leaves the field through the open gate (x ≈ 1) rather than through the rails.
 */
export const G01_SPOT = Object.freeze([2.65, -57.5]);
export const G01_STATUE = Object.freeze([4, -55.5]);
/** Her back to the statue: facing from the statue through her spot. */
export const G01_FACING = Math.atan2(G01_SPOT[0] - G01_STATUE[0], G01_SPOT[1] - G01_STATUE[1]);

export default {
  id: 'g01', kind: 'cutscene', skippable: true, prologue: true, letterbox: false, inputSkip: 1.0,
  steps: [
    { t: 'ui', hud: false },
    { t: 'actor', id: 'swordcat', at: G01_SPOT, facing: G01_FACING, pose: 'vigil' },
    { t: 'cam', preset: 'MEME_LOOP', anchor: 'swordcat', mode: 'cut' },
    { t: 'call', fn: (ctx) => memeLook(ctx, true) },
    { t: 'env', wind: 1.2, dur: 0.8 },
    wait(2.0),
    { t: 'cam', preset: 'PULLBACK', anchor: 'swordcat', mode: 'rail', dur: 6.0, nowait: true },
    wait(3.4),
    { t: 'actor', id: 'swordcat', emote: 'blink' },
    say('swordcat', 'g01.1', 1.8),
    wait(1.0),
    { t: 'actor', id: 'swordcat', emote: 'earsFlat' },
    wait(0.9),
  ],
  end: {
    call: (ctx, cs, skipped, phase) => { if (phase === 'before') memeLook(ctx, false); },
    env: { wind: 0.4, dur: 1 },
    cam: 'follow',
  },
};
