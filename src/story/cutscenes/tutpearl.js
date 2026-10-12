// src/story/cutscenes/tutpearl.js  (owner: story) — Morning Practice P7 "Found You!" (WA §7.4, ON §5.1), ~6 s.
// The Meow wakes the Very Suspicious Cow (world: moo, Idle_HitReact1, walks 6 m east) and there is Pearl, curled in its
// lee, giggling. "Found me! Okay, okay, you're good." … "...You're getting REALLY good, Clem." She does not run back to
// the barn any more: she stays as the guide and leads Clem to the height chart (tutorial → StoryManager.toChart).
import { say, cam, wait } from './lib.js';

/** Curled up in the cow's lee, just south of where it slept: the woken cow ambles east past her, out of the shot. */
export const HIDE = Object.freeze([12.3, -73.9]);

export default {
  id: 'tutpearl', kind: 'dialog', skippable: true, prologue: true,
  steps: [
    { t: 'spawn', id: 'pearl', type: 'npc', at: HIDE, facing: -1.6, pose: 'sit', keep: true },
    { t: 'actor', id: 'swordcat', face: 'pearl', faceDur: 0.35, expression: 'surprised' },
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'pearl', pos: [3.3, 0.85, 0.55], fov: 46 }),   // from the south: the cow stays behind them
    { t: 'fx', burst: 'sparkle', at: 'pearl', count: 8, color: '#FFD2DE' },
    { t: 'sfx', id: 'cat/meow_baby_01', at: 'pearl', vol: 0.8 },
    wait(0.5),
    { t: 'actor', id: 'pearl', pose: 'idle', clip: 'jump', face: 'swordcat', faceDur: 0.3 },
    say('pearl', 'tut.pearl1', 2.0),
    { t: 'actor', id: 'swordcat', expression: 'happy', emote: 'blink' },
    { t: 'actor', id: 'pearl', clip: 'nod' },
    say('pearl', 'tut.pearl2', 2.4),
    { t: 'actor', id: 'pearl', clip: 'wave', nowait: true },
    wait(0.3),
  ],
  end: {
    keep: ['pearl'],
    cam: 'follow',
  },
};
