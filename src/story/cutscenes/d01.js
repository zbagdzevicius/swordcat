// src/story/cutscenes/d01.js  (owner: story) — D-01 Mochi Joins (GAME_DESIGN §5.4; WA16, ON §6.3) [MVP], TT2 §10.3 cut:
// measured 11.3 s (in the browser; sceneLength 10.9 s; ≤ ONBOARD.sceneCap.d01 = 12 s), skippable from second 0 (the Skip chip).
// `meadow` Mochi's tipped cart at `STORY.mochiCage` (−14, −41), ~45 m up the lane from the barn: 3 rats, Mochi cheering
// each bonk from his carrier; normal hits "tink" off the cracked lock (the `tut.bright` hint), Bright Slash breaks it.
// Companions call `story.play('d01')` when the lock breaks and Mochi has hopped out (he is the cutscene actor `mochi`
// wherever he landed); they add him to the party when the promise resolves.
//   Mochi: "Almost-squire Mochi! Too clumsy, they said."   Clem: "Too small, they said."
//   Mochi: "Then we're the Almost Knights!"
// end: flag meadow.mochi; the `friend` card "Mochi joined the party!" (E.REWARD; it names his Shield Wall). From here
// Mochi speaks the contextual hints.
import * as THREE from 'three';
import { say, cam } from './lib.js';

/** Two-shot spacing (m): TWO_SHOT_LOW frames two cats about this far apart. */
const PAIR_GAP = 1.3;
/** The measured length (s; tests compare sceneLength against ONBOARD.sceneCap.d01). */
export const D01_LEN = 11.3;

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
  return me.moveTo?.(new THREE.Vector3(x, Number.isFinite(y) ? y : me.pos.y, z), 3.4) ?? null;
}

export default {
  id: 'd01', kind: 'dialog', skippable: true,
  steps: [
    { t: 'call', fn: approach, max: 1.5 },
    { t: 'actor', id: 'mochi', face: 'swordcat', faceDur: 0.2 },
    { t: 'actor', id: 'swordcat', face: 'mochi', faceDur: 0.2, pose: 'idle' },
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'mochi', pos: [1.7, 0.78, 1.5], fov: 38 }),
    { t: 'actor', id: 'mochi', clip: 'cheer', nowait: true },
    say('mochi', 'd01.1', 2.4),
    { t: 'actor', id: 'mochi', pose: 'idle', emote: 'earsFlat' },
    { t: 'actor', id: 'swordcat', expression: 'earnest' },
    say('swordcat', 'd01.2', 1.6),
    { t: 'actor', id: 'mochi', clip: 'jump', emote: 'tailPuff', nowait: true },
    { t: 'actor', id: 'swordcat', expression: 'happy', emote: 'blink' },
    say('mochi', 'd01.3', 1.8),
  ],
  end: {
    flags: { 'meadow.mochi': true },
    toasts: ['toast.mochi'],      // → the `friend` reward (rewards.js), plus the toast until ui celebrates
    cam: 'follow',
    save: true,
  },
};
