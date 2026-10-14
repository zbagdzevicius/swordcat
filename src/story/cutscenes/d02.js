// src/story/cutscenes/d02.js  (owner: story) — D-02 Sage Joins (GAME_DESIGN §5.4) [MVP], ~10 s dialogue.
// `forest` treetop (18,−8): the cage lowers when the 3 rope posts are cut, the door pops and Sage tumbles out onto
// Mochi (or onto a hay bale if Mochi isn't the active companion). Companions call `story.play('d02')` from the cage
// (LostKitten opts.play) and add Sage to the roster when the promise resolves.
//   Sage: "Thanks for the landing."   Mochi: "Mrrf."  (only with Mochi)
//   Sage: "You're the one with the sword bigger than you."   Clem: "Yes."   Sage: "...Fair."
//   Toast: "Sage joined! Swap kittens at any Lantern Stone."
import * as THREE from 'three';
import { say, cam, wait, sfx } from './lib.js';

const PAIR_GAP = 1.4;
/** The cage at the treetop when the rope posts are not built yet. */
const CAGE = [18, -8];

const mochiActive = (ctx) => (ctx.companions?.active ?? []).some((c) => c.kittenId === 'mochi');

/** Sage is the freed kitten (registered 'sage'); if the level has no cage yet, she appears beside the heroine. */
function castSage(ctx, cs) {
  if (cs.actor('sage')) return null;
  const me = ctx.player;
  const x = (me?.pos.x ?? CAGE[0]) + Math.sin(me?.facing ?? 0) * 1.6, z = (me?.pos.z ?? CAGE[1]) + Math.cos(me?.facing ?? 0) * 1.6;
  cs.spawnOne({ id: 'sage', type: 'sage', kind: 'npc', at: [x, z], facing: 'swordcat' });
  return null;
}

/** She trots up to a two-shot distance of Sage (like D-01). */
function approach(ctx, cs) {
  const me = cs.actor('swordcat'), s = cs.actor('sage');
  if (!me || !s) return null;
  const dx = s.pos.x - me.pos.x, dz = s.pos.z - me.pos.z, d = Math.hypot(dx, dz);
  if (d <= PAIR_GAP + 0.3) return null;
  const k = (d - PAIR_GAP) / d, x = me.pos.x + dx * k, z = me.pos.z + dz * k;
  const y = ctx.physics?.heightAt?.(x, z);
  return me.moveTo?.(new THREE.Vector3(x, Number.isFinite(y) ? y : me.pos.y, z), 2.6) ?? null;
}

/** Mochi breaks Sage's fall: he stands right under her landing spot. */
function mochiUnder(ctx, cs) {
  const m = cs.actor('mochi'), s = cs.actor('sage');
  if (!m || !s) return;
  cs.script(m);
  cs.place(m, [s.pos.x + 0.35, s.pos.z + 0.2], Math.atan2(s.pos.x - m.pos.x, s.pos.z - m.pos.z));
}

export default {
  id: 'd02', kind: 'dialog', skippable: true,
  steps: [
    { t: 'call', fn: castSage },
    { t: 'if', cond: mochiActive, then: [{ t: 'call', fn: mochiUnder }] },
    { t: 'actor', id: 'sage', clip: 'jump', emote: 'tailPuff' },
    sfx('d02.tumble', 'sage'),
    { t: 'fx', burst: 'dust', at: 'sage', count: 6 },
    { t: 'call', fn: approach, max: 3 },
    { t: 'actor', id: 'sage', face: 'swordcat', faceDur: 0.3 },
    { t: 'actor', id: 'swordcat', face: 'sage', faceDur: 0.3, pose: 'idle' },
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'sage', pos: [2.2, 0.8, 0.75], fov: 38 }),
    say('sage', 'd02.1', 2.2, { expression: 'smug' }),
    { t: 'if', cond: mochiActive, then: [
      { t: 'actor', id: 'mochi', emote: 'earsFlat', expression: 'grumpy' },
      say('mochi', 'd02.2', 1.2),
    ] },
    { t: 'actor', id: 'sage', emote: 'blink' },
    say('sage', 'd02.3', 2.8),
    { t: 'actor', id: 'swordcat', expression: 'earnest', emote: 'nod' },
    say('swordcat', 'd02.4', 1.0),
    wait(0.4),
    { t: 'actor', id: 'sage', emote: 'nod', expression: 'happy' },
    say('sage', 'd02.5', 1.6),
    wait(0.3),
  ],
  end: {
    flags: { 'forest.sage': true },
    toasts: ['toast.sage'],
    cam: 'follow',
    save: true,
  },
};
