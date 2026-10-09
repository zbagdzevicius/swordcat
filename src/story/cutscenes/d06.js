// src/story/cutscenes/d06.js  (owner: story) — D-06 Pip Joins (GAME_DESIGN §5.4) [MVP], ~8 s dialogue.
// `gate` Old Battlefield: the hyena war-wagon cage at (6,−80) is struck (companions / world call `story.play('d06')`
// when its 3 hits land; Tater and Mittens are rescued by their own LostKitten flow). The door was already unlocked;
// Pip strolls out.
//   Pip: "Took you long enough. I was waiting for dramatic effect."
//   Pip: "That pin they pinched? I know who's got it. Leave him to me."
//   She runs off to the gatehouse.
// end: flag gate.pip (Pip works the winch in The Line; her Lookout opens in the hub after gate.done).
import { say, cam, wait, sfx } from './lib.js';
import { stepUp } from './cast.js';

/** §12.6 war-wagon (`cart-high` + bars) and the way back up the causeway. */
export const WAGON = [6, -80];
const OUT = [5.2, -78.4];
const RUN = [0, -52];

function castPip(ctx, cs) {
  if (!cs.actor('pip')) cs.spawnOne({ id: 'pip', type: 'pip', kind: 'npc', at: OUT, facing: 'swordcat' });
}

export default {
  id: 'd06', kind: 'dialog', skippable: true,
  steps: [
    { t: 'call', fn: castPip },
    sfx('d06.wagon', 'pip'),
    { t: 'actor', id: 'swordcat', face: 'pip', faceDur: 0.3, pose: 'idle' },
    { t: 'call', fn: (ctx, cs) => stepUp(ctx, cs, 'pip', 1.4, 1.2), max: 4 },
    { t: 'actor', id: 'pip', face: 'swordcat', faceDur: 0.4, expression: 'smug' },
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'pip', pos: [2.2, 0.8, 0.75], fov: 40 }),
    say('pip', 'd06.1', 3.4),
    { t: 'actor', id: 'swordcat', expression: 'surprised', emote: 'blink' },
    { t: 'actor', id: 'pip', emote: 'nod', expression: 'determined' },
    say('pip', 'd06.2', 3.6),
    cam(null, 'swordcat', { pos: [1.4, 1.2, -2.0], look: [0, 0.6, 3], fov: 46 }),
    { t: 'actor', id: 'pip', moveTo: RUN, speed: 4.5, nowait: true },
    { t: 'actor', id: 'swordcat', expression: 'happy' },
    wait(1.4),
  ],
  end: { flags: { 'gate.pip': true }, despawns: ['pip'], cam: 'follow', save: true },
};
