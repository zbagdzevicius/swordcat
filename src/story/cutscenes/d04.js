// src/story/cutscenes/d04.js  (owner: story) — D-04 Rescues in town (GAME_DESIGN §5.4) [MVP], 3 dialogues ~8 s each.
// Ids `d04tofu`, `d04earlgrey`, `d04clover` (`d04` alone picks the next one not done, for generic world hooks).
//   Tofu (Forge Yard, third barrel): "Is it over? ...Is that a sword or a door?"  Clem: "A sword."
//     Tofu: "Huh. Want it sharper? I can barely lift it, but I can sharpen it."              → flag town.tofu
//   Earl Grey (popped out of the fountain Gloomjelly): "Do you MIND? I was nearly at the good chapter."
//     (he looks around) "...Oh. You're rescuing me. How embarrassing. Carry on."              → flag town.earlgrey
//   Clover (the stocks, interact): "Well, aren't you a tiny thing in a big tin."
//     "Somebody has to keep you lot alive. Hold still, sweetpea."  Toast "Clover joined!"       → flag town.clover
// The rescued cat is the actor registered under its id when world / companions placed one; otherwise the scene stands
// it 1.5 m in front of her. Tofu and Earl Grey head for the hub (despawned); Clover joins the roster.
import * as THREE from 'three';
import { say, cam, wait, sfx } from './lib.js';

/** The rescue spots of §12.5 (fallbacks only: the real actor wins). */
export const SPOTS = Object.freeze({ tofu: [18, -12.6], earlgrey: [0, 4.6], clover: [10, 13] });

/** Make sure `who` is on stage, facing her, 1.5 m away (she walks up if needed). */
function stage(who) {
  return (ctx, cs) => {
    const me = ctx.player;
    let a = cs.actor(who);
    if (!a && me) {
      const x = me.pos.x + Math.sin(me.facing) * 1.5, z = me.pos.z + Math.cos(me.facing) * 1.5;
      cs.spawnOne({ id: who, type: who, kind: 'npc', at: [x, z], facing: 'swordcat' });
      a = cs.actor(who);
    }
    if (!a || !me) return null;
    cs.script(a);
    const dx = a.pos.x - me.pos.x, dz = a.pos.z - me.pos.z, d = Math.hypot(dx, dz) || 1;
    if (d <= 1.9) return null;
    const k = (d - 1.5) / d, x = me.pos.x + dx * k, z = me.pos.z + dz * k;
    const y = ctx.physics?.heightAt?.(x, z);
    return me.moveTo?.(new THREE.Vector3(x, Number.isFinite(y) ? y : me.pos.y, z), 2.6) ?? null;
  };
}

const faceUp = (who) => [
  { t: 'actor', id: who, face: 'swordcat', faceDur: 0.3 },
  { t: 'actor', id: 'swordcat', face: who, faceDur: 0.3, pose: 'idle' },
  cam('TWO_SHOT_LOW', 'swordcat', { target: who, pos: [2.2, 0.8, 0.75], fov: 38 }),
];

/** Clover joins the companion roster (party swaps happen at Vigil Stones). */
function cloverJoins(ctx) {
  const c = ctx.companions;
  try {
    if (typeof c?.unlock === 'function') c.unlock('clover', { activate: !(c.active?.length > 0) });
    else if (ctx.state && !ctx.state.companions.unlocked.includes('clover')) ctx.state.companions.unlocked.push('clover');
  } catch (e) { console.warn('[story] clover unlock failed', e); }
}

export const d04tofu = {
  id: 'd04tofu', kind: 'dialog', skippable: true,
  steps: [
    { t: 'call', fn: stage('tofu'), max: 3 },
    ...faceUp('tofu'),
    sfx('d04.barrel', 'tofu'),
    { t: 'actor', id: 'tofu', expression: 'worried', emote: 'earsFlat' },
    say('tofu', 'd04.tofu.1', 2.8),
    { t: 'actor', id: 'swordcat', expression: 'earnest' },
    say('swordcat', 'd04.tofu.2', 1.0),
    { t: 'actor', id: 'tofu', expression: 'happy', emote: 'blink' },
    say('tofu', 'd04.tofu.3', 3.6),
    wait(0.3),
  ],
  end: { flags: { 'town.tofu': true }, despawns: ['tofu'], cam: 'follow', save: true },
};

export const d04earlgrey = {
  id: 'd04earlgrey', kind: 'dialog', skippable: true,
  steps: [
    { t: 'call', fn: stage('earlgrey'), max: 3 },
    ...faceUp('earlgrey'),
    sfx('jelly', 'earlgrey', { vol: 0.6 }),
    { t: 'actor', id: 'earlgrey', expression: 'grumpy', emote: 'shake' },
    say('earlgrey', 'd04.earlgrey.1', 2.8),
    { t: 'actor', id: 'earlgrey', face: -0.8, faceDur: 0.5 },
    wait(0.5),
    { t: 'actor', id: 'earlgrey', face: 'swordcat', faceDur: 0.4, expression: 'surprised' },
    say('earlgrey', 'd04.earlgrey.2', 3.6),
    wait(0.3),
  ],
  end: { flags: { 'town.earlgrey': true }, despawns: ['earlgrey'], cam: 'follow', save: true },
};

export const d04clover = {
  id: 'd04clover', kind: 'dialog', skippable: true,
  steps: [
    { t: 'call', fn: stage('clover'), max: 3 },
    ...faceUp('clover'),
    sfx('d04.stocks', 'clover'),
    { t: 'actor', id: 'clover', expression: 'happy' },
    say('clover', 'd04.clover.1', 2.8),
    { t: 'actor', id: 'swordcat', expression: 'worried', emote: 'earsFlat' },
    wait(0.3),
    { t: 'actor', id: 'clover', emote: 'nod' },
    say('clover', 'd04.clover.2', 3.4),
    { t: 'actor', id: 'swordcat', expression: 'happy' },
    wait(0.3),
  ],
  end: {
    call: (ctx, cs, skipped, phase) => { if (phase === 'after') cloverJoins(ctx); },
    flags: { 'town.clover': true }, despawns: ['clover'], toasts: ['toast.clover'], cam: 'follow', save: true,
  },
};

/** The D-04 rescue that comes next (for a generic `play('d04')`). Pure-ish (reads flags). */
export function nextD04(state) {
  if (!state?.getFlag?.('town.tofu')) return 'd04tofu';
  if (!state?.getFlag?.('town.earlgrey')) return 'd04earlgrey';
  if (!state?.getFlag?.('town.clover')) return 'd04clover';
  return null;
}
