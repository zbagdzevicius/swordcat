// src/enemies/scripted/Pilfer.js  (owner: enemies) — Pilfer, the Post Stealer (§3.7).
//
// 1. `pilfer`: an AI-less cutscene actor (CS-02 shot 10 "Mine." / "Also mine."; CS-06; the L4 winch pin). Rogue_Hooded.glb
//    at 1.2 m with a skinny hyena head and a "POST STEALER" plate. Props (ScriptedActor.prop):
//      prop('signpost', true)   the lane signpost tucked under his left arm (CS-02 plucks it)
//      prop('post_bag', true)   the Royal Post bag in his right paw
//    Spawn: ctx.enemies.spawn('pilfer', pos, { id: 'pilfer', facing }).
//
// 2. `pilfer_chase` (GAME_DESIGN §12.5 Bakery Street → Post Office): ctx.enemies.pilferChase({ path?, onDrop? }) or
//    ctx.enemies.spawn('pilfer', 'chase_0', { id: 'pilfer', chase: true }). He runs the anchors `chase_0..5` (or
//    `path`: anchor names / points) at 6.0 m/s with the post bag, keeping a lead on her (he trots and taunts when she
//    falls behind, sprints when she closes in), drops crates (obstacles: player-only colliders) at chase_1 / chase_3
//    and flutters cosmetic letters. Each hit stumbles him 0.6 s; he can't be defeated. **3 hits drop the bag**:
//    `item:returned` {item: 'post_bag', amount: 1, bonus: 0, thief}, the bag falls, he sits down dazed and becomes an
//    AI-less cutscene actor (story's CS-06 takes him from there; `chase.done` resolves). If she falls more than 25 m
//    behind, the chase fades and restarts at chase_0 (she is put just behind him; no life is lost). The path loops
//    until the bag drops.
import * as THREE from 'three';
import { ENEMIES } from '../../core/config.js';
import { E } from '../../core/events.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { M2 } from '../tuning.js';
import { makeProp } from '../props.js';
import { dressKayKit, addHeldProp, loadedCharacters } from '../types/kaykitGear.js';

const HIDE = [...ENEMIES.stealer.hide, 'Knife', 'Knife_Offhand'];
const C = M2.pilferChase;
const _d = new THREE.Vector3();

/** Pilfer's props: built on first use, then toggled. The signpost rides his left hand (characters' carry offsets);
 *  the post bag hangs from his right fist like a pendulum. */
function setProp(e, name, on) {
  e.wantProps[name] = !!on;
  const d = e.dress, CH = loadedCharacters();
  if (!d || !CH || !e.model) return;                          // applied in build() once the model is dressed
  let p = e.extraProps[name];
  if (!p && on) {
    if (name === 'signpost') { p = d.hold('signpost', 'l'); p?.traverse((x) => { if (x.isMesh) x.castShadow = true; }); }
    else if (name === 'post_bag') p = addHeldProp(e, e.model, 'post_bag', 'handslot.r', { down: 0.28, scale: 1.1 }, CH);
    if (p) e.extraProps[name] = p;
  }
  if (p) p.visible = !!on;
}

const BASE = {
  model: ENEMIES.stealer.model, fit: 'pilfer', hide: HIDE,
  faction: 'enemy', radius: 0.35, height: 1.2, mass: 1, hp: 30, poise: 1, walk: 2.0, run: 6.0, sight: 0, fov: 2.79, leash: 999,
  smallHeart: false, fish: null,
  anims: { ...CLIP_MAPS.kaykit.roles },
  init(e) { e.wantProps = {}; },
  async build(e, m) {
    await dressKayKit(e, m, { look: 'pilfer', headNode: 'Rogue_Head_Hooded', expression: 'sneer' });
    for (const [n, on] of Object.entries(e.wantProps)) setProp(e, n, on);       // props asked for before the model loaded
  },
  onProp: setProp,
};

export default {
  ...BASE,
  id: 'pilfer',
  aiLess: true, hurtable: false, tags: ['cutscene'],
};

// ------------------------------------------------------------------ the town chase
/** Resolve the chase path (anchors chase_0..N-1, or `path` entries) into points; null without a usable path. */
export function chasePath(ctx, path = null) {
  const pts = [];
  const list = path ?? Array.from({ length: C.anchors }, (_, i) => `chase_${i}`);
  for (const q of list) {
    if (typeof q === 'string') { const a = ctx.levels?.anchor?.(q); if (a?.pos) pts.push(a.pos.clone()); }
    else if (Array.isArray(q)) pts.push(new THREE.Vector3(q[0], q.length > 2 ? q[1] : 0, q[q.length - 1]));
    else if (q && typeof q.x === 'number') pts.push(new THREE.Vector3(q.x, q.y ?? 0, q.z));
  }
  return pts.length >= 2 ? pts : null;
}

/**
 * Chase pace: full sprint when she is within `lead` m, a trot when she's further than `waitLead` (he taunts), in
 * between a lerp. Pure; exported for tests.
 */
export function chasePace(gap, run = ENEMIES.stealer.run ?? 6, walk = 2.0) {
  if (gap <= C.lead) return run;
  if (gap >= C.waitLead) return walk * 0.6;
  const u = (gap - C.lead) / (C.waitLead - C.lead);
  return run + (walk * 0.6 - run) * u;
}

function dropCrate(e, at) {
  const ctx = e.ctx;
  const crate = makeProp('crate');
  crate.position.copy(at);
  crate.rotation.y = e.facing + 0.4;
  ctx.scene?.add(crate);
  const col = { x: at.x, z: at.z, hx: 0.36, hz: 0.36, yaw: crate.rotation.y, y0: at.y - 0.1, y1: at.y + 0.7, factions: ['player'] };
  ctx.physics?.addCollider?.(col);
  (e.chaseCrates ??= []).push({ mesh: crate, col });
  ctx.bus.emit(E.BURST, { kind: 'dust', position: at.clone(), count: 6 });
}

function clearCrates(e) {
  for (const c of e.chaseCrates ?? []) { c.mesh.removeFromParent(); e.ctx.physics?.removeCollider?.(c.col); }
  if (e.chaseCrates) e.chaseCrates.length = 0;
}

/** A cosmetic letter flutters out of the bag (EnemyManager debris: spins, bounces once, shrinks away). */
function flutterLetter(e) {
  const mgr = e.ctx.enemies;
  if (!mgr?.spawnDebris || !e.ctx.scene) return;
  const l = makeProp('letter', { castShadow: false });
  l.position.set(e.pos.x - Math.sin(e.facing) * 0.3, e.pos.y + 0.8, e.pos.z - Math.cos(e.facing) * 0.3);
  e.ctx.scene.add(l);
  _d.set(-Math.sin(e.facing) + e.ctx.rng.range(-0.6, 0.6), 0, -Math.cos(e.facing) + e.ctx.rng.range(-0.6, 0.6));
  mgr.spawnDebris(l, e, _d, { up: 1.6, side: 0.8, life: 2.2, spin: 6 });
}

/** The bag drops (3rd hit): item:returned, the bag falls as debris, he sits dazed and hands over to the story. */
function dropBag(e) {
  if (e.bagDropped) return;
  e.bagDropped = true;
  const bag = e.extraProps?.post_bag;
  if (bag && e.ctx.enemies?.spawnDebris) e.ctx.enemies.spawnDebris(bag, e, _d.set(Math.sin(e.facing), 0, Math.cos(e.facing)), { up: 2.4, side: 1.2, life: 999, keep: true });
  e.extraProps.post_bag = null;
  for (let i = 0; i < 6; i++) flutterLetter(e);
  e.ctx.bus.emit(E.ITEM_RETURNED, { item: 'post_bag', amount: 1, bonus: 0, thief: e });
  e.ctx.bus.emit(E.BURST, { kind: 'stars', position: e.pos.clone().setY(e.pos.y + e.height), count: 6 });
  clearCrates(e);
  e.endTelegraph(); e.releaseToken();
  e.vel.set(0, e.vel.y, 0);
  e.ai = false; e.hurtable = false; e.tags.add('cutscene'); e.tags.add('scripted');
  e.setState('idle');
  e.pose?.('sitDown');
  e.head?.setExpression?.('sad');
  e.chaseResolve?.({ dropped: true });
  e.chaseOnDrop?.(e);
}

const RUN = {
  anim: 'move',
  enter(e) { e.alerted = true; },
  update(e, dt) {
    const pts = e.chasePts;
    if (!pts) { e.setState('idle'); return; }
    const p = e.ctx.player;
    const tgt = pts[e.chaseIdx];
    const gap = p?.pos ? Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) : 0;
    // she fell too far behind: fade, restart at chase_0
    if (gap > C.tooFar && e.chaseT > 1.5) return restart(e);
    e.chaseT += dt;
    if (e.pauseT > 0) {                                      // a taunt at an anchor
      e.pauseT -= dt; e.brake(dt, 10);
      if (p) e.faceTo(p.pos, dt, 8);
      if (gap < C.lead * 0.6) e.pauseT = 0;
      return;
    }
    const left = e.steerTo(tgt.x, tgt.z, chasePace(gap, e.def.run), dt);
    e.faceVel(dt, 12);
    if ((e.letterT -= dt) <= 0) { e.letterT = C.letterEvery; flutterLetter(e); }
    if (left < C.arrive) {
      if (C.crates.includes(e.chaseIdx) && !e.cratesAt.has(e.chaseIdx)) {
        e.cratesAt.add(e.chaseIdx);
        _d.set(e.pos.x - Math.sin(e.facing) * 1.2, e.pos.y, e.pos.z - Math.cos(e.facing) * 1.2);
        _d.y = e.ctx.physics?.groundAt?.(_d.x, _d.z, e.pos.y + 0.5) ?? e.pos.y;
        dropCrate(e, _d.clone());
      }
      if (gap > C.waitLead) { e.pauseT = 0.8; e.head?.setExpression?.('laugh'); e.ctx.audio?.laugh?.(e.pos, { volume: 0.7, rate: 1.4 }); }
      e.chaseIdx = (e.chaseIdx + 1) % pts.length;
    }
  },
};

function restart(e) {
  const pts = e.chasePts, ctx = e.ctx, p = ctx.player;
  ctx.bus.emit(E.BURST, { kind: 'smoke', position: e.pos.clone(), count: 10 });
  e.pos.copy(pts[0]); e.vel.set(0, 0, 0); e.snap();
  e.chaseIdx = 1; e.chaseT = 0; e.pauseT = 0.6;
  if (p?.teleport) {
    _d.set(pts[0].x - pts[1].x, 0, pts[0].z - pts[1].z).normalize().multiplyScalar(C.lead * 0.8);
    const at = new THREE.Vector3(pts[0].x + _d.x, 0, pts[0].z + _d.z);
    at.y = ctx.physics?.topAt?.(at.x, at.z) ?? ctx.physics?.heightAt?.(at.x, at.z) ?? pts[0].y;
    p.teleport({ pos: at, facing: Math.atan2(pts[0].x - at.x, pts[0].z - at.z) });
  }
  ctx.bus.emit(E.BURST, { kind: 'smoke', position: e.pos.clone(), count: 10 });
}

const STUMBLE = {
  anim: () => ['hit', { once: true, clampEnd: true, speed: 1.2 }],
  enter(e) { e.brakeHard(); },
  update(e, dt) {
    e.brake(dt, 10);
    if (e.stateT >= C.stumble) e.setState(e.bagDropped ? 'idle' : 'run');
  },
};

export const PILFER_CHASE = {
  ...BASE,
  id: 'pilfer_chase',
  hp: 9999, poise: 99, expression: 'sneer',
  states: {
    run: RUN, stumble: STUMBLE,
    idle: { anim: 'idle', update(e, dt) { e.brake(dt); if (!e.bagDropped && e.ai && !e.scripted && e.chasePts) e.setState('run'); } },
  },
  init(e) {
    e.wantProps = { post_bag: true };
    e.chasePts = chasePath(e.ctx, e.spawnOpts?.path ?? null);
    e.chaseIdx = 1; e.chaseT = 0; e.pauseT = 0; e.letterT = C.letterEvery; e.hits = 0; e.bagDropped = false;
    e.cratesAt = new Set();
    e.chaseOnDrop = e.spawnOpts?.onDrop ?? null;
    e.done = new Promise((res) => { e.chaseResolve = res; });
    e.alerted = true;
  },
  resolveIncoming(e) { return e.bagDropped ? 'immune' : 'hit'; },
  onLethal(e) { e.hp = e.maxHp; return true; },              // never defeated: three stumbles drop the bag
  onHit(e, hit) {
    if (e.bagDropped) return;
    e.hp = e.maxHp;
    e.hits++;
    e.ctx.story?.barks?.enemy?.(e, 'hit');
    if (e.hits >= C.hits) { dropBag(e); return; }
    e.staggerT = 0;
    e.setState('stumble');
  },
  onDispose(e) { clearCrates(e); e.chaseResolve?.({ dropped: !!e.bagDropped, disposed: true }); },
};
