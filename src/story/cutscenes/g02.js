// src/story/cutscenes/g02.js  (owner: story) — G-02 Marmalade's Leap (GAME_DESIGN §5.4) [MVP], a 3 s gameplay cutaway.
// `gate`, The Line at 85% (StoryManager on objective:progress {line} ≥ 0.85, or world's Line controller).
//   1 time scale 0.3; hard cut to the west flanking tower (−8,+8), where Marmalade has been watching.
//   2 a ballista bolt from the hyena raft (anchor `ballista_raft`, (−16,−4) y 1.2) streaks toward the spoon kittens
//     behind the Line.
//   3 Marmalade leaps from the parapet into its path: "OOF!", a puff of flour; he lies on the causeway (two kittens drag
//     him off toward the gate: he is despawned at the cut back).
//   4 cut back to gameplay; time scale 1.0. No damage to the player.
// No letterbox. end: flag gate.leap (CS-10 pays it off).
import { say, wait, sfx } from './lib.js';
import { buildBolt, built, flyObject, arcPoint } from './cast.js';
import * as THREE from 'three';

export const RAFT = [-16, 1.2, -4];
/** Where the bolt was headed (the spoon kittens behind the Line) and where Marmalade meets it. */
export const TARGET = [0, 1.0, 13];
export const MEET_U = 0.74;
export const TOWER = [-7.4, 9.6, 8.2];
const LAND = [-3.4, 0.05, 9.4];
/** Sim seconds of the slow-motion flight (×1/0.3 in real time). */
const FLIGHT = 0.34;

export function meetPoint() {
  const a = new THREE.Vector3(...RAFT), b = new THREE.Vector3(...TARGET);
  return arcPoint(a, b, MEET_U, 0.6);
}

/** Where Marmalade watches from: the flanking tower's top (its collider top when world built one), else TOWER. */
function towerTop(ctx) {
  const t = ctx.physics?.topAt?.(-8, 8), g = ctx.physics?.heightAt?.(-8, 8) ?? 0;
  return Number.isFinite(t) && t > g + 3 ? [-7.3, t + 0.05, 8.4] : TOWER;
}

function stage(ctx, cs) {
  const top = cs._top = towerTop(ctx);
  cs.spawnOne({ id: 'marmalade', type: 'marmalade', kind: 'npc', at: [TOWER[0], TOWER[2]], facing: Math.PI / 2 + 0.4 });
  const m = cs.actor('marmalade');
  if (m) { m.pos.set(top[0], top[1], top[2]); m.vel?.set(0, 0, 0); m.snap?.(); m.pose?.('vigil'); }
  cs.spawnOne({ id: 'bolt', kind: 'object', build: buildBolt, at: RAFT });
  const b = built(cs, 'bolt');
  if (b) b.lookAt(TARGET[0], TARGET[1], TARGET[2]);
  // he holds his perch until the leap (the tower top may have no collider yet)
  cs.every(() => { const a = cs.actor('marmalade'); if (a && !cs._leaping) { a.pos.set(top[0], top[1], top[2]); a.vel?.set(0, 0, 0); } return !cs._leaping && !cs.finishing; });
}

function launch(ctx, cs) {
  const m = meetPoint();
  cs._leaping = true;
  const p1 = flyObject(cs, () => built(cs, 'bolt'), RAFT, [m.x, m.y, m.z], FLIGHT, 0.3);
  const p2 = flyObject(cs, () => cs.actor('marmalade'), cs._top ?? TOWER, [m.x - 0.15, m.y - 0.5, m.z], FLIGHT, 1.2);
  cs.actor('marmalade')?.pose?.('oath');
  return Promise.all([p1, p2].filter(Boolean));
}

function impact(ctx, cs) {
  const b = built(cs, 'bolt');
  if (b) b.visible = false;
  const m = cs.actor('marmalade');
  m?.pose?.('faint');
  m?.emote?.('earsFlat');
  const from = m ? [m.pos.x, m.pos.y, m.pos.z] : (cs._top ?? TOWER);
  const y = ctx.physics?.heightAt?.(LAND[0], LAND[2]);
  return flyObject(cs, () => cs.actor('marmalade'), from, [LAND[0], Number.isFinite(y) ? Math.max(y, 0) : 0, LAND[2]], 0.18, 0.2);
}

export default {
  id: 'g02', kind: 'cutscene', skippable: true, letterbox: false,
  steps: [
    { t: 'call', fn: stage },
    { t: 'time', scale: 0.3 },
    { t: 'call', fn: (ctx, cs) => ctx.cam?.shot?.({ anchor: [0, 0, 0], mode: 'cut', pos: [1.2, 2.2, 17.5], look: [-5.6, (cs._top?.[1] ?? 9.6) * 0.55, 7.0], fov: 58 }) },
    wait(0.15),
    sfx('g02.ballista', [RAFT[0], RAFT[2]]),
    { t: 'call', fn: launch, max: 2 },
    { t: 'fx', burst: 'poof', at: 'marmalade', count: 18, color: '#F4EEE0', scale: 1.2 },
    sfx('g02.leap', 'marmalade'),
    { t: 'fx', shake: 0.25 },
    { t: 'call', fn: impact, max: 1 },
    { t: 'fx', burst: 'dust', at: 'marmalade', count: 10 },
    { t: 'time', scale: 1 },
    say('marmalade', 'g02.1', 0.7),
    sfx('g02.drag', 'marmalade'),
    wait(0.5),
  ],
  end: {
    flags: { 'gate.leap': true },
    despawns: ['marmalade', 'bolt'],
    ui: { letterbox: false, hud: true },
    cam: { mode: 'follow', blend: false },
  },
};
