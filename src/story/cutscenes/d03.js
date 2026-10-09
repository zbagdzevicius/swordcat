// src/story/cutscenes/d03.js  (owner: story) — D-03 On Loan (GAME_DESIGN §5.4) [MVP], ~15 s dialogue.
// `town` Bakery Street cleared (StoryManager plays it on arena:clear {bakery} / objective {bakery, done}, or a world
// zone `play: 'd03'`). Marmalade pokes his head out of the bakery door, flour on his nose.
//   Marmalade: "Clem? Is that... my armour?"   Clem: "...It's borrowed."
//   (long pause; he looks her up and down) "Is it now."   "That armour's on loan, then. Bring it back with a story in it."
//   "That hooded thief took the Royal Post. Get it back, would you? My knees don't run anymore."
// end: flag town.marmalade; objective "Catch the Post Stealer" (`chase`) — the Pilfer chase is world / enemies'.
import { say, cam, wait, sfx } from './lib.js';

/** §12.5: Marmalade's bakery at (−26,−20); its door faces the street (east). */
export const DOOR = [-23.2, -19.6];
const MEET = [-21.6, -19.6];

/** She trots to the door (from wherever the Bakery Street fight ended; far away = she is placed near it first). */
function walkUp(ctx, cs) {
  const me = ctx.player, at = cs.point({ anchor: 'bakery_meet', or: MEET });
  if (!me || !at) return null;
  if (Math.hypot(at.x - me.pos.x, at.z - me.pos.z) > 7) cs.place(me, [at.x + 3.2, at.z], -Math.PI / 2);
  return me.moveTo?.(at, 2.6) ?? null;
}

export default {
  id: 'd03', kind: 'dialog', skippable: true,
  steps: [
    { t: 'spawn', id: 'marmalade', type: 'marmalade', at: { anchor: 'bakery_door', or: DOOR }, facing: Math.PI / 2 },
    sfx('d03.door', 'marmalade'),
    { t: 'call', fn: walkUp, max: 4 },
    { t: 'actor', id: 'swordcat', face: 'marmalade', faceDur: 0.3, pose: 'idle' },
    { t: 'actor', id: 'marmalade', face: 'swordcat', faceDur: 0.3, expression: 'surprised' },
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'marmalade', pos: [2.2, 0.8, 0.75], fov: 38, lookMid: 0.85 }),
    say('marmalade', 'd03.1', 2.6),
    { t: 'actor', id: 'swordcat', expression: 'worried', emote: 'earsFlat' },
    say('swordcat', 'd03.2', 1.6),
    { t: 'actor', id: 'marmalade', expression: 'grumpy' },
    wait(1.4),
    cam(null, 'marmalade', { pos: [0.5, 1.0, 1.5], look: [0, 0.75, 0], fov: 36 }),
    { t: 'actor', id: 'marmalade', emote: 'blink' },
    say('marmalade', 'd03.3', 1.6),
    { t: 'actor', id: 'marmalade', expression: 'happy', emote: 'nod' },
    say('marmalade', 'd03.4', 3.4),
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'marmalade', pos: [2.2, 0.8, 0.75], fov: 38, lookMid: 0.85 }),
    { t: 'actor', id: 'swordcat', expression: 'happy' },
    { t: 'actor', id: 'marmalade', expression: 'worried' },
    say('marmalade', 'd03.5', 3.6),
    { t: 'actor', id: 'swordcat', expression: 'determined', emote: 'nod' },
    wait(0.4),
  ],
  end: {
    flags: { 'town.marmalade': true },
    objective: { id: 'chase', textKey: 'obj.stealer', max: 1 },
    cam: 'follow',
    save: true,
  },
};
