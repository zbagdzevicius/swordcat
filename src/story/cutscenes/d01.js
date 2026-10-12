// src/story/cutscenes/d01.js  (owner: story) — D-01 Mochi Joins (GAME_DESIGN §5.4) [MVP], ~10 s dialogue.
// `meadow` Old Bridge: companions call `story.play('d01')` when the cage lock breaks and Mochi has hopped out (he is
// the cutscene actor `mochi` wherever he landed); they add him to the party when the promise resolves.
//   Mochi: "Squire Mochi reporting! Well. Reject Mochi. Too clumsy, they said."   Clem: "Too small, they said."
//   Mochi: "Then we're a team!"   Mochi: "I'll do the shield. You do the... pointy part."
//   Toast: "Mochi joined! [Ability] Shield Wall" (ui resolves the glyph per preset / device)
import * as THREE from 'three';
import { say, cam, wait } from './lib.js';

/** Two-shot spacing (m): TWO_SHOT_LOW frames two cats about this far apart. */
const PAIR_GAP = 1.3;

/**
 * Mochi lands wherever the cage hop put him (up to ~4 m from her in play): she trots up to PAIR_GAP first so the
 * low two-shot holds both faces. Resolves when she is there (or at once when already close).
 */
function approach(ctx, cs) {
  const me = cs.actor('swordcat'), m = cs.actor('mochi');
  if (!me || !m) return null;
  const dx = m.pos.x - me.pos.x, dz = m.pos.z - me.pos.z, d = Math.hypot(dx, dz);
  if (d <= PAIR_GAP + 0.3) return null;
  const k = (d - PAIR_GAP) / d;
  const x = me.pos.x + dx * k, z = me.pos.z + dz * k;
  const y = ctx.physics?.heightAt?.(x, z) ?? me.pos.y;
  return me.moveTo?.(new THREE.Vector3(x, Number.isFinite(y) ? y : me.pos.y, z), 2.6) ?? null;
}

export default {
  id: 'd01', kind: 'dialog', skippable: true,
  steps: [
    { t: 'call', fn: approach, max: 3 },
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
