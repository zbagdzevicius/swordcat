// src/story/cutscenes/d01.js  (owner: story) — D-01 Mochi Joins (GAME_DESIGN §5.4) [MVP], ~10 s dialogue.
// `meadow` Old Bridge: companions call `story.play('d01')` when the cage lock breaks and Mochi has hopped out (he is
// the cutscene actor `mochi` wherever he landed); they add him to the party when the promise resolves.
//   Mochi: "Squire Mochi reporting! Well. Reject Mochi. Too clumsy, they said."   Clem: "Too small, they said."
//   Mochi: "Then we're a team!"   Mochi: "I'll do the shield. You do the... pointy part."
//   Toast: "Mochi joined! [Q] Shield Wall"
import { say, cam, wait } from './lib.js';

export default {
  id: 'd01', kind: 'dialog', skippable: true,
  steps: [
    { t: 'actor', id: 'mochi', face: 'swordcat', faceDur: 0.3 },
    { t: 'actor', id: 'swordcat', face: 'mochi', faceDur: 0.3, pose: 'idle' },
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'mochi', pos: [1.7, 0.78, 1.5], fov: 38 }),
    { t: 'actor', id: 'mochi', clip: 'cheer' },
    say('mochi', 'd01.1', 3.4),
    { t: 'actor', id: 'mochi', pose: 'idle', emote: 'earsFlat' },
    { t: 'actor', id: 'swordcat', expression: 'earnest' },
    say('swordcat', 'd01.2', 1.8),
    { t: 'actor', id: 'mochi', clip: 'jump', emote: 'tailPuff' },
    say('mochi', 'd01.3', 1.8),
    { t: 'actor', id: 'swordcat', expression: 'happy', emote: 'blink' },
    { t: 'actor', id: 'mochi', clip: 'nod' },
    say('mochi', 'd01.4', 3.0),
    wait(0.3),
  ],
  end: {
    flags: { 'meadow.mochi': true },
    toasts: ['toast.mochi'],
    cam: 'follow',
    save: true,
  },
};
