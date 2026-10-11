// src/enemies/types/boss_cacklejaw.js  (owner: enemies) — B2 Warchief Cacklejaw (GAME_DESIGN §11.3), the Low Gate causeway.
// Barbarian.glb fitted to 2.2 m, characters' hyena head (mane, chipped left ear) under the Barbarian_Hat (it hides
// the ear until phase 3), the "HATER-IN-CHIEF" plate, Skeleton_Blade ×1.6. HP 700, poise 15, Dizzy max 120.
//   Gloat (all phases)            after any hit on her he laughs 1.5 s; a hit chokes him ("hrk— that's rude!",
//                                 enemy:choke → +10 Valor) and fills Dizzy (a §11.1 lesson event).
//   P1 "The Roast" (100–60%)      Cackle Combo: 2 hits, windups 0.6 / 0.35 (white), 2 / 2 damage, range 2.4, arc ±1.2.
//                                 Laugh Quake: head back 0.8 s (`jeer` rings), then a 0.3 m tall ring expands at
//                                 8 m/s out to 7 m, 2 damage — jump it. A hit during the 0.8 s windup chokes him.
//   P2 "Ratio Rush" (60–30%)      3 dashes along the causeway at 12 m/s, each lane telegraphed 0.8 s with a GOLD glint
//                                 on the blade: a parry makes him stumble ("How are you STILL there?") and fills
//                                 Dizzy; a block pushes her back 2 m (2 Grit). 2 damage per dash. Cackle Combo between.
//                                 At phase start: 2 stealers, once — they Jeer together (the Duet: aura r 10 for 3 s).
//   P3 "Who's Laughing Now" (<30%) fog 0.05 → 0.09 over 2 s; his hat flies off; himself + 3 shadow clones (dark,
//                                 no shadow, one hit poofs them, Cackle Combo at windups ×1.2; max 3, respawn every
//                                 10 s). Only the real one casts a blob shadow and laughs (positional). Meow: only the
//                                 real one answers "WHAT?" and stops laughing for 2.0 s. Real-one windups ×0.85.
//   Defeat → boss:defeated (story plays CS-09); +120 fish.
import * as THREE from 'three';
import { BOSSES, ENEMIES } from '../../core/config.js';
import { E } from '../../core/events.js';
import { dampAngle } from '../../core/math.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { TUNING, M2, rangeOf } from '../tuning.js';
import { windupFor } from '../Enemy.js';
import { bossDef } from '../bossBase.js';
import { CHAIN_STATE, laneTo, minLead, ringAt } from '../moves.js';
import { dressKayKit, characters, seatHat } from './kaykitGear.js';
import { CACKLEJAW_HIDE, CACKLEJAW_LOOK } from '../scripted/Cacklejaw.js';
import { GLOAT } from './hyenaStates.js';

const B = BOSSES.cacklejaw;
const P2 = B.phases[1], P3 = B.phases[2];
const RUSH = P2.rush, CLONES = P3.clones;
const BM = M2.boss;
const _d = new THREE.Vector3();

/** Cackle Combo (§11.3): shared by the boss and his shadow clones. */
export const CACKLE_COMBO = Object.freeze({
  state: 'chain', range: 2.4, recover: 0.8,
  chain: [
    { atk: 'cackle_combo1', telegraph: 'parry', windup: 0.6, dmg: 2, range: 2.4, arc: 1.2, knock: 5, poise: 3 },
    { atk: 'cackle_combo2', telegraph: 'parry', windup: 0.35, dmg: 2, range: 2.4, arc: 1.2, knock: 6, poise: 3 },
  ],
});
const QUAKE = Object.freeze({ id: 'cackle_quake', telegraph: 'jeer', windup: 0.8, dmg: 2, knock: 5, poise: 3, speed: 8, rMax: 7, height: 0.3, unblockable: true, recover: 0.9 });
const DASH = Object.freeze({ id: 'cackle_rush', telegraph: 'gold', dmg: 2, knock: 6, poise: 3 });

/** The causeway rectangle (arena centre + half sizes) or a circle fallback, for the rush lanes. */
function arenaShape(e) {
  const a = e.homeArena?.();
  const c = a?.center ?? e.home;
  if (a?.size) return { cx: c.x, cz: c.z, hw: a.size[0] / 2, hd: a.size[1] / 2 };
  if (a?.r) return { cx: c.x, cz: c.z, r: a.r };
  return { cx: c.x, cz: c.z, hw: 6, hd: 20 };                  // §11.3: 12 × 40 m between the fog walls
}

/** A rush lane toward her, along the causeway: { len, dx, dz }. Pure-ish; exported for tests. */
export function rushLane(e, target) {
  _d.set(target.x - e.pos.x, 0, target.z - e.pos.z);
  if (_d.lengthSq() < 1e-6) _d.set(Math.sin(e.facing), 0, Math.cos(e.facing));
  _d.normalize();
  const { len } = laneTo(e.pos.x, e.pos.z, _d.x, _d.z, { arena: arenaShape(e), edgePad: BM.rushPad, max: 40 });
  return { len: Math.max(2, len), dx: _d.x, dz: _d.z };
}

// ------------------------------------------------------------------ blob shadow (the real one only, P3 tell)
let _blobTex = null, _blobGeo = null;
function blobMesh(r) {
  if (typeof document === 'undefined') return null;
  if (!_blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    if (!g) return null;
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.3)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    _blobTex = new THREE.CanvasTexture(c);
    _blobGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  }
  const m = new THREE.Mesh(_blobGeo, new THREE.MeshBasicMaterial({ map: _blobTex, transparent: true, depthWrite: false, color: '#000000', fog: true }));
  m.material.userData.enemyOwned = true;
  m.userData.sharedProp = true;                                   // no hit flash
  m.name = 'blob-shadow';
  m.position.y = 0.03;
  m.renderOrder = 1;
  m.scale.setScalar(r);
  return m;
}

// ------------------------------------------------------------------ states
const QUAKE_STATE = {
  attacking: true,
  anim: (e) => (e.quakePhase === 'windup' ? ['cheer', { once: true, clampEnd: true }] : ['idle', null]),
  enter(e) {
    e.brakeHard();
    e.quakePhase = 'windup';
    e.windupDur = windupFor(QUAKE, e.windupMul());
    e.quakeR = 0; e.quakeHit = new Set();
    e.head?.setExpression?.('laugh');
    e.telegraph('jeer', { shape: 'rings', pos: e.pos, r: QUAKE.rMax * 0.5, size: QUAKE.rMax * 0.5, duration: e.windupDur, follow: true });
    e.telegraphExtra('aoe', { shape: 'ring', pos: e.pos.clone(), r: QUAKE.rMax, size: QUAKE.rMax, inner: 0, duration: e.windupDur + QUAKE.rMax / QUAKE.speed, follow: false });
    if (!e.quiet()) e.ctx.audio?.laugh?.(e.pos, { volume: 1.0, rate: 0.85 });
  },
  update(e, dt) {
    e.brake(dt, 12);
    if (e.quakePhase === 'windup') {
      if (e.stateT >= e.windupDur) {
        e.endTelegraphId(e.telegraphId);
        e.quakePhase = 'ring'; e.quakeT = 0;
        e.ctx.bus.emit(E.BURST, { kind: 'dustRing', position: e.pos.clone(), scale: 2 });
        e.ctx.fx?.shockwave?.(e.pos, { r: QUAKE.rMax, speed: QUAKE.speed, height: QUAKE.height, color: 'jeer' });
        e.ctx.bus.emit(E.SHAKE, { trauma: 0.3 });
      }
      return;
    }
    e.quakeT += dt;
    const ring = ringAt(e.quakeT, QUAKE.speed, QUAKE.rMax, BM.quakeBand);
    if (ring.r > 0.1) e.ctx.combat?.areaHit?.(e, QUAKE, { center: e.pos, r: ring.r, rInner: ring.inner, y0: -0.2, y1: QUAKE.height, hitSet: e.quakeHit });
    if (ring.done) { e.endTelegraph(); e.head?.setExpression?.('sneer'); e.attack = { id: 'laughQuake', def: QUAKE, range: 6 }; e.setState(e.gloatPending ? 'gloat' : 'recover'); }
  },
  exit(e) { e.head?.setExpression?.('sneer'); },
};

const RUSH_STATE = {
  attacking: true,
  anim: (e) => (e.rushPhase === 'dash' ? ['run', { loop: true, speed: 1.6 }] : ['windup', { once: true, clampEnd: true, fitDur: e.rushTele }]),
  enter(e) { e.brakeHard(); e.rushN = 0; aimRush(e); },
  update(e, dt) {
    e.rushT += dt;
    const p = e.targetActor();
    if (e.rushPhase === 'aim') {
      e.brake(dt, 12);
      e.facing = dampAngle(e.facing, Math.atan2(e.rushLane.dx, e.rushLane.dz), 12, dt);
      if (e.rushT >= e.rushTele) {
        e.endTelegraph();
        e.rushPhase = 'dash'; e.rushT = 0; e.rushFrom = e.pos.clone(); e.dashHit = false;
        e.ctx.bus.emit(E.SHAKE, { trauma: 0.1 });
      }
      return;
    }
    if (e.rushPhase === 'dash') {
      const L = e.rushLane;
      e.vel.x = L.dx * RUSH.speed; e.vel.z = L.dz * RUSH.speed;
      e.facing = Math.atan2(L.dx, L.dz);
      if (!e.dashHit) e.dashContact(DASH);
      const went = Math.hypot(e.pos.x - e.rushFrom.x, e.pos.z - e.rushFrom.z);
      if (went >= L.len - 0.05 || e.rushT > L.len / RUSH.speed + 0.5) {
        e.brakeHard();
        e.rushN++;
        if (e.rushN >= RUSH.dashes) { e.attack = { id: 'ratioRush', def: { recover: 0.9 }, range: 40 }; return e.setState(e.gloatPending ? 'gloat' : 'recover'); }
        e.rushPhase = 'turn'; e.rushT = 0;
      }
      return;
    }
    // turn between dashes
    e.brake(dt, 12);
    if (p) e.faceTo(p.pos, dt, 8);
    if (e.rushT >= 0.3) aimRush(e);
  },
  exit(e) { e.endTelegraph(); },
};

function aimRush(e) {
  const p = e.targetActor();
  const tgt = p?.pos ?? new THREE.Vector3(e.pos.x + Math.sin(e.facing), 0, e.pos.z + Math.cos(e.facing));
  e.rushLane = rushLane(e, tgt);
  e.rushPhase = 'aim'; e.rushT = 0;
  e.rushTele = Math.max(minLead('gold'), RUSH.tele * e.windupMul());
  e.telegraph('gold', { duration: e.rushTele, attackId: DASH.id, attackDef: DASH, range: e.rushLane.len,           // the gold glint on the blade
    lane: { w: BM.rushW, l: e.rushLane.len, dir: new THREE.Vector3(e.rushLane.dx, 0, e.rushLane.dz) } });
  e.telegraphExtra('aoe', { shape: 'lane', pos: e.pos.clone(), dir: new THREE.Vector3(e.rushLane.dx, 0, e.rushLane.dz),
    w: BM.rushW, l: e.rushLane.len, size: [BM.rushW, e.rushLane.len], duration: e.rushTele, follow: false });
}

// ------------------------------------------------------------------ clones (P3)
function spawnClone(e, i) {
  const mgr = e.ctx.enemies;
  if (!mgr?.spawn) return null;
  const a = e.facing + Math.PI / 2 + i * ((Math.PI * 2) / CLONES.n) + e.ctx.rng.range(-0.3, 0.3);
  const pos = new THREE.Vector3(e.pos.x + Math.sin(a) * BM.cloneRing, e.pos.y, e.pos.z + Math.cos(a) * BM.cloneRing);
  const sh = arenaShape(e);
  if (sh.hw != null) { pos.x = Math.max(sh.cx - sh.hw + 1, Math.min(sh.cx + sh.hw - 1, pos.x)); pos.z = Math.max(sh.cz - sh.hd + 1, Math.min(sh.cz + sh.hd - 1, pos.z)); }
  const arena = e.spawnOpts?.arena;
  const c = mgr.spawn('cacklejaw_clone', pos, { noCap: true, alerted: true, ...(arena ? { arena } : {}) });
  if (!c) return null;
  c.bossAdd = e;
  e.adds.push(c);
  mgr.joinArena?.(c, arena);
  e.ctx.bus.emit(E.BURST, { kind: 'smoke', position: pos.clone(), count: 10 });
  return c;
}

function liveClones(e) { return e.adds.filter((a) => a.alive && a.type === 'cacklejaw_clone').length; }

function enterP3(e) {
  e.p3 = true; e.p3T = 0;
  e.fogFrom = e.ctx.env?.fogDensity ?? 0.05;
  // the hat flies off: the chipped ear shows
  const hat = e.model?.scene?.getObjectByName('Barbarian_Hat');
  if (hat?.visible) { hat.visible = false; e.ctx.bus.emit(E.BURST, { kind: 'fur', position: e.pos.clone().setY(e.pos.y + e.height), count: 8 }); }
  for (let i = 0; i < CLONES.n; i++) spawnClone(e, i);
  e.cloneT = CLONES.respawnEvery;
  e.laughT = rangeOf(e.ctx.rng, BM.laughEvery);
}

function exitP3(e) {
  if (e.p3Fog) { e.ctx.env?.clear?.('cacklejaw:p3'); e.p3Fog = false; }
  e.p3 = false;
}

const base = bossDef('cacklejaw', { hide: CACKLEJAW_HIDE });

export default {
  ...base,
  radius: 0.6,
  expression: 'sneer',
  anims: {
    ...CLIP_MAPS.kaykit.roles, idle: '2H_Melee_Idle',
    cackle_combo1: { windup: { clip: '1H_Melee_Attack_Slice_Horizontal', from: 0, to: 0.35, speed: 'fit' }, strike: { clip: '1H_Melee_Attack_Slice_Horizontal', from: 0.35, to: 1, speed: 1.3 } },
    cackle_combo2: { windup: { clip: '1H_Melee_Attack_Slice_Diagonal', from: 0, to: 0.35, speed: 'fit' }, strike: { clip: '1H_Melee_Attack_Slice_Diagonal', from: 0.35, to: 1, speed: 1.4 } },
  },
  moves: {
    cackleCombo: CACKLE_COMBO,
    laughQuake: { state: 'laughQuake', range: 5.5, cooldown: 4 },
    ratioRush: { state: 'ratioRush', range: 40, minRange: 4, cooldown: 6 },
  },
  states: { chain: CHAIN_STATE, laughQuake: QUAKE_STATE, ratioRush: RUSH_STATE, gloat: GLOAT },
  onHitWhile: { gloat: 'choke' },
  init(e) { e.p3 = false; e.quietT = 0; e.gloatPending = false; e.quiet = () => e.quietT > 0; },

  /** Gloat after any landed hit on her (after a rush ends, if it landed mid-dash). */
  onDealtHit(e, h) {
    if (!e.alive || h.target !== e.ctx.player || e.staggerT > 0) return;
    if (e.stateName === 'ratioRush' || e.stateName === 'laughQuake' || e.stateName === 'chain') { e.gloatPending = true; return; }
    if (e.stateName !== 'gloat') e.setState('gloat');
  },
  /** A hit during the Laugh Quake windup chokes him (§11.3). */
  onHit(e) {
    if (e.stateName === 'laughQuake' && e.quakePhase === 'windup') e.choke();
  },
  onChoke(e) { e.bark('cacklejaw.choked'); e.gloatPending = false; },
  onParried(e) {
    if (e.stateName === 'ratioRush') e.bark('cacklejaw.stumble');
    return false;
  },
  /** A block during a dash shoves her back 2 m (the guard already took 2 Grit: the dash's poise 3). */
  onBlocked(e, by) {
    if (e.stateName !== 'ratioRush' || !by?.vel) return false;
    const k = RUSH.blockPush * 5;                             // ≈ 2 m against her block-push damping
    by.vel.x += e.rushLane.dx * k; by.vel.z += e.rushLane.dz * k;
    return true;
  },
  onPhaseChange(e, i) {
    if (i === 1) e.forceMove = 'ratioRush';
    if (i === 2) enterP3(e);
  },
  /** P2's stealers: the Jeer Duet as they arrive. */
  onAdds(e, adds, phase) {
    if (phase !== 1) return;
    for (const a of adds) {
      if (a.type !== 'stealer' || !a.states?.jeer) continue;
      a.jeerOverride = { ...ENEMIES.hyena.jeer, r: M2.jeer.duetR, dur: M2.jeer.duetDur, onlyWithin: 99, maxPerPack: 2 };
      a.setState('jeer');
    }
  },
  /** §7.7 Meow in P3: the real one answers "WHAT?" and stops laughing for 2.0 s (clones don't react). */
  onMeow(e) {
    if (!e.p3 || !e.alive) return;
    e.quietT = BM.meowQuiet;
    e.bark('cacklejaw.meowed');
    e.head?.setExpression?.('surprised');
    e.emoteT = BM.meowQuiet;
  },
  tick(e, dt) {
    if (e.quietT > 0) e.quietT = Math.max(0, e.quietT - dt);
    if (e.emoteT > 0 && (e.emoteT -= dt) <= 0) e.head?.setExpression?.('sneer');
    if (!e.p3 || !e.alive) return;
    // fog 0.05 → 0.09 over 2 s
    if (e.p3T < BM.p3FogDur + dt) {
      e.p3T += dt;
      const u = Math.min(1, e.p3T / BM.p3FogDur);
      e.ctx.env?.contribute?.('cacklejaw:p3', { fogSet: e.fogFrom + (P3.fog - e.fogFrom) * u });
      e.p3Fog = true;
    }
    // clones respawn (max 3) every 10 s
    if ((e.cloneT -= dt) <= 0) {
      e.cloneT = CLONES.respawnEvery;
      const n = liveClones(e);
      for (let i = n; i < CLONES.n; i++) spawnClone(e, i);
    }
    // the real one's positional laughter
    if ((e.laughT -= dt) <= 0) {
      e.laughT = rangeOf(e.ctx.rng, BM.laughEvery);
      if (!e.quiet() && e.stateName !== 'stagger') e.ctx.audio?.laugh?.(e.pos, { volume: 0.9, rate: 0.85 });
    }
  },
  onRestart(e) {
    e.gloatPending = false;
    if (e.phase === 2) { exitP3(e); enterP3(e); }
  },
  onDefeat(e) { exitP3(e); },
  onBossDispose(e) { exitP3(e); },
  async build(e, m) {
    await dressKayKit(e, m, { ...CACKLEJAW_LOOK, expression: 'sneer' });
    if (e.disposed) return;
    seatHat(e, m);
    const blob = blobMesh(e.radius * 1.7);
    if (blob) { e.object3d.add(blob); e.blob = blob; }
  },
};

// ------------------------------------------------------------------ the shadow clone (an Enemy, not a Boss)
export const CACKLEJAW_CLONE = {
  id: 'cacklejaw_clone',
  model: ENEMIES.hyena.model, fit: 'cacklejaw', hide: [...CACKLEJAW_HIDE, 'Barbarian_Hat'],
  faction: 'enemy', radius: 0.6, height: 2.2, mass: 3, hp: 1, poise: 0, walk: 2.0, run: 4.5, sight: 30, fov: 6.28, leash: 60,
  smallHeart: false, fish: null, tags: ['clone'], expression: 'sneer', token: 'melee', noFlash: true,
  attacks: [{ id: 'cackleCombo', weight: 1, range: CACKLE_COMBO.range }],
  moves: { cackleCombo: CACKLE_COMBO },
  anims: {
    ...CLIP_MAPS.kaykit.roles, idle: '2H_Melee_Idle',
    cackle_combo1: { windup: { clip: '1H_Melee_Attack_Slice_Horizontal', from: 0, to: 0.35, speed: 'fit' }, strike: { clip: '1H_Melee_Attack_Slice_Horizontal', from: 0.35, to: 1, speed: 1.3 } },
    cackle_combo2: { windup: { clip: '1H_Melee_Attack_Slice_Diagonal', from: 0, to: 0.35, speed: 'fit' }, strike: { clip: '1H_Melee_Attack_Slice_Diagonal', from: 0.35, to: 1, speed: 1.4 } },
  },
  states: { chain: CHAIN_STATE },
  init(e) { e.phaseWindupMul = CLONES.windupMul; },
  onDeath(e) { if (e.visual) e.visual.visible = false; },       // one hit: it poofs
  dieDur() { return 0.3; },
  async build(e, m) {
    await dressKayKit(e, m, { ...CACKLEJAW_LOOK, expression: 'sneer' });
    if (e.disposed) return;
    (await characters()).silhouette(m.root, BM.cloneTint, { fog: true, castShadow: false });
    m.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  },
};
