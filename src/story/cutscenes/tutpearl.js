// src/story/cutscenes/tutpearl.js  (owner: story) — Midnight Practice step 8 (GAME_DESIGN §5.4 tutorial): the Meow
// wakes the sleeping cow (world: moo, Idle_HitReact1, walks 6 m east) and reveals Pearl, who sneaked out of the
// squires' barn to watch. Pearl: "Shh! I'm not here." … "...You're getting good, Clem." She scampers back to the barn
// (moveTo the barn door, despawn). This teaches "Meow finds hidden friends" before any kitten is lost. No letterbox.
import { say, cam, wait } from './lib.js';

/** The cow's sleeping spot (it has wandered off by now); Pearl was curled up behind it. */
const HIDE = [12.6, -72.5];

export default {
  id: 'tutpearl', kind: 'dialog', skippable: true, prologue: true,
  steps: [
    { t: 'spawn', id: 'pearl', type: 'npc', at: HIDE, facing: -1.6, pose: 'sit' },
    { t: 'actor', id: 'swordcat', face: 'pearl', faceDur: 0.35, expression: 'surprised' },
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'pearl', pos: [1.8, 0.8, 1.6], fov: 40 }),
    { t: 'fx', burst: 'sparkle', at: 'pearl', count: 8, color: '#FFD2DE' },
    { t: 'sfx', id: 'cat/meow_baby_01', at: 'pearl', vol: 0.8 },
    wait(0.5),
    { t: 'actor', id: 'pearl', pose: 'idle', clip: 'jump', face: 'swordcat', faceDur: 0.3 },
    say('pearl', 'tut.pearl1', 2.0),
    { t: 'actor', id: 'swordcat', expression: 'happy', emote: 'blink' },
    { t: 'actor', id: 'pearl', clip: 'nod' },
    say('pearl', 'tut.pearl2', 2.6),
    { t: 'actor', id: 'pearl', clip: 'wave' },
    wait(0.4),
    { t: 'actor', id: 'pearl', moveTo: 'barn_door', speed: 3.4, nowait: true },
    wait(2.4),
    { t: 'fx', burst: 'poof', at: 'pearl', scale: 0.6 },
    { t: 'despawn', id: 'pearl' },
    wait(0.4),
  ],
  end: {
    despawns: ['pearl'],
    cam: 'follow',
  },
};
