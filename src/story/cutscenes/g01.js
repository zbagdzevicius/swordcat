// src/story/cutscenes/g01.js  (owner: story) — G-01 Sir Tallbert (GAME_DESIGN §5.4) [MVP], ~8 s gameplay gag [TREND V5].
// Trigger `tallbert` (the practice field's north gate; armed by world while `prologue.tutorial && !prologue.done`).
//   1 her input is ignored for 1.0 s; she is moved to (4, −59.5) facing −Z, 2.5 m in front of the statue; MEME_LOOP
//     holds 2.0 s while she stands in Vigil
//   2 PULLBACK over 6.0 s reveals the 6 m stone knight right behind her, in the same pose
//   3 "...Hello." (the statue does not answer)
//   4 any input after 1.0 s skips to the end; control returns
import { say, wait } from './lib.js';
import { memeLook } from './rig.js';

export default {
  id: 'g01', kind: 'cutscene', skippable: true, prologue: true, letterbox: false, inputSkip: 1.0,
  steps: [
    { t: 'ui', hud: false },
    { t: 'actor', id: 'swordcat', at: 'g01_mark', facing: Math.PI, pose: 'vigil' },
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
