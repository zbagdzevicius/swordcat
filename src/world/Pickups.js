// src/world/Pickups.js  (owner: world) — GAME_DESIGN §12.1 / §13.2 pickups: fish (silver 1, gold 10, magnetised from
// ECONOMY.fish.magnet), small hearts (PLAYER.smallHeart), milk bottles, Lost Letters (parchment + pink seal) and
// Heart Bells (gold bell + pink ribbon on a pedestal). Fish and hearts drop from defeated enemies (E.ENEMY_DIED,
// def.fish) and from crates; letters/bells are placed by level zones. Collecting updates GameState / the player and
// emits item:pickup. Fish render as ONE InstancedMesh; letters/bells/bottles are a few small meshes.
// WA §5.5 / CL §6 juice (0 draws): pickups spin (CLASS_MARKS.pickup.spin), kill drops pop out in a hop arc (apex 0.9 m,
// 0.45 s, 2 bounces), the magnet pull is a 0.35 m hop arc (PICKUP_FX.hop), collecting squashes 1.3 → 0 over 0.1 s,
// and `twinkles` lists the resting pickups fx sparkles (`STAR4` cream / gold). Materials are Lambert (ART §4.2).
import * as THREE from 'three';
import { E } from '../core/events.js';
import { ECONOMY, PLAYER, CLASS_MARKS, PICKUP_FX } from '../core/config.js';
import { mulberry32, hashSeed } from '../core/rng.js';
import { procTemplate, worldMaterial } from './Props.js';

const MAX_FISH = 240;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
const _silver = new THREE.Color('#E8EEF4'), _gold = new THREE.Color('#FFD57A');

/**
 * Pickup motion (WA §5.5): the kill-drop pop (apex `popApex` m in `popT` s → its gravity, `bounces` hops each keeping
 * `bounceK` of the speed), the collect squash (`squash` → 0 over `collectT` s), the bob, and the magnet hop speed.
 */
export const PICKUP_MOTION = Object.freeze({ popApex: 0.9, popT: 0.45, bounces: 2, bounceK: 0.45, rest: 0.35, collectT: 0.1, squash: 1.3,
  bob: 0.06, magnetSpeed: 4, magnetGain: 6 });
/** Gravity of the pop arc: apex h in half of T → g = 8 h / T². */
export const POP_G = (8 * PICKUP_MOTION.popApex) / (PICKUP_MOTION.popT * PICKUP_MOTION.popT);

/**
 * The magnet hop (WA §5.5): height above the straight pull at progress u (0 = where the pull began, 1 = at her). Pure.
 * @param {number} u 0..1 @param {number} [hop] apex (m)
 */
export const magnetHop = (u, hop = PICKUP_FX?.hop ?? 0.35) => 4 * hop * Math.max(0, Math.min(1, u)) * (1 - Math.max(0, Math.min(1, u)));

/** One Lambert material for pickup meshes (dithered, toon-patched like the world). */
function pickupMat(color, emissive = '#000000', ei = 0) {
  const m = new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: ei });
  m.dithering = true;
  m.userData.owned = true;
  return m;
}

/** Save flag of a placed fish line (bitmask of the fish collected). Pure. */
export const placedFishFlag = (levelId, key) => `${levelId}.fish.${key}`;

/** Fish mesh (body + tail), ~0.32 m long, facing +Z, centred. */
export function makeFishGeometry() {
  // PERF §1.2: 6 × 5 segments (56 tris with the tail, was 88): every live fish of the level draws, on screen or not
  const body = new THREE.SphereGeometry(0.1, 6, 5); body.scale(0.55, 0.85, 1.35);
  const tail = new THREE.ConeGeometry(0.09, 0.14, 4); tail.rotateX(-Math.PI / 2); tail.scale(0.35, 1.2, 1); tail.translate(0, 0, -0.17);
  const g = mergeSimple([body, tail]);
  body.dispose(); tail.dispose();
  return g;
}

/** Small heart (two spheres + a cone), ~0.28 m. */
export function makeHeartGeometry() {
  const a = new THREE.SphereGeometry(0.075, 10, 8); a.translate(-0.06, 0.05, 0);
  const b = new THREE.SphereGeometry(0.075, 10, 8); b.translate(0.06, 0.05, 0);
  const c = new THREE.ConeGeometry(0.105, 0.17, 12); c.rotateZ(Math.PI); c.translate(0, -0.05, 0);
  const g = mergeSimple([a, b, c]);
  a.dispose(); b.dispose(); c.dispose();
  return g;
}

function mergeSimple(list) {
  let n = 0, idx = 0;
  for (const g of list) { n += g.attributes.position.count; idx += g.index.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), index = new Uint32Array(idx);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3);
    for (let i = 0; i < g.index.count; i++) index[io + i] = g.index.getX(i) + vo;
    vo += g.attributes.position.count; io += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

/** Parchment letter with a pink wax seal (0.5 m read radius), lying slightly tilted. ONE mesh (vertex colours). */
export function makeLetterMesh() {
  const flap = new THREE.ConeGeometry(0.17, 0.09, 4, 1);
  flap.rotateX(Math.PI / 2); flap.rotateZ(Math.PI / 4); flap.scale(1.4, 1, 0.12); flap.translate(0, 0.012, 0.04);
  const seal = new THREE.CylinderGeometry(0.035, 0.035, 0.016, 14); seal.translate(0, 0.02, 0);
  const t = procTemplate('letter', [[new THREE.BoxGeometry(0.34, 0.012, 0.24), '#FFF6E0'], [flap, '#F2DFB4'], [seal, '#FF6F9C']]);
  // PERF §1.2: a world material (the world-static program every plain vertex-coloured world mesh uses)
  const mat = worldMaterial({ emissive: '#FFE6C8', emissiveIntensity: 0.18 });
  const m = new THREE.Mesh(t.geometry, mat);
  m.name = 'pickup:letter'; m.castShadow = false;
  m.userData.owned = true; mat.userData.owned = true;
  return m;
}

/**
 * A plain pickup mesh: `geometry` coloured per vertex with `color`, drawn with a world material (PERF §1.2: the
 * world-static program every vertex-coloured plain world mesh uses, instead of a colour-only Lambert program).
 * @param {THREE.BufferGeometry} geometry @param {string} color @param {string} [emissive] @param {number} [ei]
 */
function pickupMesh(geometry, color, emissive = '#000000', ei = 0) {
  const c = new THREE.Color(color), n = geometry.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(geometry, worldMaterial({ emissive, emissiveIntensity: ei }));
}

/** Heart Bell: a small gold bell with a pink ribbon on a stone pedestal (≈1.0 m). */
export function makeHeartBellMesh() {
  const g = new THREE.Group(); g.name = 'pickup:heartbell';
  const ped = pickupMesh(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 8), '#E6DAC4'); ped.position.y = 0.35;
  const cap = pickupMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 8), '#E6DAC4'); cap.position.y = 0.74;
  const bellG = new THREE.LatheGeometry([[0.0, 0.0], [0.14, 0.0], [0.13, 0.04], [0.1, 0.14], [0.08, 0.22], [0.04, 0.26], [0, 0.27]].map(([x, y]) => new THREE.Vector2(x, y)), 16);
  const bell = pickupMesh(bellG, '#E8C27A', '#FFD57A', 0.3);
  bell.position.y = 0.95; bell.name = 'bell';
  const ribbon = pickupMesh(new THREE.TorusGeometry(0.05, 0.022, 6, 12), '#FF9EC0');
  ribbon.position.y = 1.23; ribbon.scale.set(1.6, 1, 0.6);
  for (const m of [ped, cap, bell, ribbon]) { m.castShadow = m === ped; g.add(m); }
  g.traverse((o) => { o.userData.owned = true; });
  return g;
}

/** Milk bottle (cream glass + red cap), ~0.3 m. */
export function makeMilkMesh() {
  const g = new THREE.Group(); g.name = 'pickup:milk';
  const glass = pickupMesh(new THREE.LatheGeometry([[0, 0], [0.07, 0], [0.075, 0.14], [0.04, 0.2], [0.035, 0.26], [0, 0.26]].map(([x, y]) => new THREE.Vector2(x, y)), 14),
    '#FFFBF2', '#FFF6E8', 0.15);
  const capM = pickupMesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), '#E0605A');
  capM.position.y = 0.27;
  for (const m of [glass, capM]) { m.castShadow = false; g.add(m); }
  g.traverse((o) => { o.userData.owned = true; });
  return g;
}

/** Upward speed of a kill-drop pop (apex PICKUP_MOTION.popApex ± 15 % by `r` in 0..1). */
function popVy(r) { return Math.sqrt(2 * POP_G * PICKUP_MOTION.popApex * (0.85 + 0.3 * r)); }

/** Remove a pickup mesh (group) from the scene and free its geometry / materials. */
function disposeMesh(o) {
  if (!o) return;
  o.removeFromParent();
  o.traverse((c) => { c.geometry?.dispose?.(); if (c.material && !Array.isArray(c.material)) c.material.dispose(); });
}

/**
 * Per-level pickups manager (created by LevelKit; LevelManager drives update/render).
 */
export class Pickups {
  /** @param {any} ctx @param {{heightAt:(x:number,z:number)=>number, levelId:string, root:THREE.Object3D}} o */
  constructor(ctx, { heightAt, levelId, root }) {
    this.ctx = ctx; this.heightAt = heightAt; this.levelId = levelId; this.root = root;
    this.items = [];
    /** collected items squashing out (WA §5.5) */
    this._fading = [];
    this.collected = { fish: 0, letters: [], heartBells: [], milk: 0, hearts: 0 };
    this.rnd = mulberry32(hashSeed('pickups:' + levelId));
    this.fishMat = pickupMat('#FFFFFF', '#FFF1C4', 0.22);
    this.fishMesh = new THREE.InstancedMesh(makeFishGeometry(), this.fishMat, MAX_FISH);
    // PERF §7.1: pickups never cast (a blob / their twinkle grounds them)
    this.fishMesh.name = 'pickups:fish'; this.fishMesh.count = 0; this.fishMesh.castShadow = false; this.fishMesh.frustumCulled = false;
    this.fishMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FISH * 3), 3);
    this.heartMat = pickupMat('#FF6F9C', '#FF8FB1', 0.35);
    this.heartMesh = new THREE.InstancedMesh(makeHeartGeometry(), this.heartMat, 24);
    this.heartMesh.name = 'pickups:hearts'; this.heartMesh.count = 0; this.heartMesh.frustumCulled = false;
    // PERF §1.2: a (white) instance colour like the fish, so hearts and fish share one program
    this.heartMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(24 * 3).fill(1), 3);
    root.add(this.fishMesh, this.heartMesh);
    for (const o of [this.fishMesh, this.heartMesh, this.fishMat, this.heartMat]) o.userData.owned = true;
    this._t = 0;
    /** WA §3.2 / W21: resting pickups fx twinkles (`STAR4` cream, gold fish faster); rebuilt in render, no allocation */
    this.twinkles = [];
    this._offs = [ctx.bus.on(E.ENEMY_DIED, (p) => this._onEnemyDied(p))];
  }

  /** Spawn `n` fish worth `value` each at `pos` (popping out with a little arc when `pop`). Returns how many spawned. */
  spawnFish(pos, n = 1, { value = ECONOMY.fish.silver, pop = true } = {}) {
    let live = 0, made = 0;
    for (const it of this.items) if (it.alive && it.kind === 'fish') live++;
    for (let i = 0; i < n && live < MAX_FISH; i++, live++) {
      const a = this.rnd() * Math.PI * 2, sp = pop ? 1.6 + this.rnd() * 2.2 : 0;
      this.items.push({ kind: 'fish', value, gold: value >= ECONOMY.fish.gold, pos: new THREE.Vector3(pos.x, pos.y + (pop ? PICKUP_MOTION.rest : 0.35), pos.z),
        vel: new THREE.Vector3(Math.sin(a) * sp, pop ? popVy(this.rnd()) : 0, Math.cos(a) * sp), air: pop, bounces: 0, t: this.rnd() * 6, delay: pop ? 0.35 : 0, alive: true });
      made++;
    }
    return made;
  }

  /**
   * A line of `n` (≤ 31) silver fish from a to b ([x, z]). With a `key`, the fish collected are saved as a bitmask in
   * the flag `<level>.fish.<key>` and stay gone on later loads (Continue / Retry never re-offer placed fish).
   */
  fishLine(a, b, n, key = null) {
    const flag = key != null ? placedFishFlag(this.levelId, key) : null;
    const mask = flag ? (Number(this.ctx.state?.getFlag?.(flag)) | 0) : 0;
    for (let i = 0; i < n; i++) {
      if (flag && i < 31 && (mask & (1 << i))) continue;
      const t = n === 1 ? 0.5 : i / (n - 1), x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const made = this.spawnFish(new THREE.Vector3(x, this.heightAt(x, z), z), 1, { pop: false });
      const it = made ? this.items[this.items.length - 1] : null;
      if (it && flag && i < 31) { it.flag = flag; it.bit = i; }
    }
  }

  spawnHeart(pos) {
    this.items.push({ kind: 'heart', pos: new THREE.Vector3(pos.x, pos.y + PICKUP_MOTION.rest, pos.z), vel: new THREE.Vector3(0, popVy(0.5), 0), air: true, bounces: 0, t: 0, delay: 0.35, alive: true });
  }

  spawnMilk(pos) {
    const mesh = makeMilkMesh();
    this.root.add(mesh);
    this.items.push({ kind: 'milk', pos: new THREE.Vector3(pos.x, pos.y + PICKUP_MOTION.rest, pos.z), vel: new THREE.Vector3(0, popVy(0.5), 0), air: true, bounces: 0, t: 0, delay: 0.35, alive: true, mesh });
  }

  /** A Lost Letter on the ground (skipped if already collected this save). */
  placeLetter(id, x, z) {
    if (this.ctx.state?.letters?.includes(id)) return null;
    const mesh = makeLetterMesh();
    const y = this.heightAt(x, z);
    mesh.position.set(x, y + 0.03, z); mesh.rotation.set(0.08, this.rnd() * 6.28, -0.05);
    this.root.add(mesh);
    const it = { kind: 'letter', id, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), air: false, t: 0, delay: 0, alive: true, mesh };
    this.items.push(it);
    return it;
  }

  /** A Heart Bell on its pedestal (skipped if already collected). */
  placeHeartBell(id, x, z) {
    if (this.ctx.state?.heartBells?.includes(id)) return null;
    const mesh = makeHeartBellMesh();
    const y = this.heightAt(x, z);
    mesh.position.set(x, y, z);
    this.root.add(mesh);
    const it = { kind: 'heartBell', id, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), air: false, t: 0, delay: 0, alive: true, mesh };
    this.items.push(it);
    return it;
  }

  /**
   * enemy:died → drops. Enemies roll the payload (requests/enemies.md): `fish` (silver count for a [min, max] row,
   * the total value for a numeric boss row → gold fish) and `smallHeart` (bool); we drop exactly those. Without them
   * (older payloads) we roll from the enemy's def ourselves.
   */
  _onEnemyDied(p) {
    const e = p?.enemy, at = p?.position ?? e?.pos;
    if (!at) return;
    const f = e?.def?.fish, rolled = typeof p?.fish === 'number';
    let n = 0, value = ECONOMY.fish.silver;
    if (typeof f === 'number' && !Array.isArray(f)) { value = ECONOMY.fish.gold; n = f > 0 ? Math.max(1, Math.round((rolled ? p.fish : f) / value)) : 0; }
    else if (rolled) n = Math.max(0, Math.round(p.fish));
    else if (Array.isArray(f)) n = f[0] + Math.floor(this.rnd() * ((f[1] ?? f[0]) - f[0] + 1));
    if (n > 0) this.spawnFish(at, n, { value });
    const heart = typeof p?.smallHeart === 'boolean' ? p.smallHeart
      : (!e?.def?.boss && e?.def?.smallHeart !== false && !!this.ctx.rng?.chance?.(PLAYER.smallHeart.chance));
    if (heart) this.spawnHeart(at);
  }

  /** Crate / barrel contents (§12.1: 1–3 fish; milk bottles only from crates). */
  dropCrate(pos, { milk = false } = {}) {
    if (milk) this.spawnMilk(pos);
    const [a, b] = ECONOMY.fish.crate;
    this.spawnFish(pos, a + Math.floor(this.rnd() * (b - a + 1)));
  }

  update(dt) {
    const p = this.ctx.player, st = this.ctx.state;
    this._t += dt;
    const pp = p?.alive ? p.pos : null;
    const PM = PICKUP_MOTION;
    for (const it of this.items) {
      if (!it.alive) continue;
      it.t += dt;
      if (it.delay > 0) it.delay -= dt;
      if (it.air) {
        // WA §5.5 kill-drop hop arc: apex 0.9 m, 0.45 s, then 2 smaller bounces
        it.vel.y -= POP_G * dt;
        it.pos.addScaledVector(it.vel, dt);
        const g = this.heightAt(it.pos.x, it.pos.z) + PM.rest;
        if (it.pos.y <= g && it.vel.y < 0) {
          it.pos.y = g;
          if ((it.bounces ?? PM.bounces) < PM.bounces) { it.bounces = (it.bounces ?? 0) + 1; it.vel.y *= -PM.bounceK; it.vel.x *= PM.bounceK; it.vel.z *= PM.bounceK; }
          else { it.vel.set(0, 0, 0); it.air = false; }
        }
      }
      if (!pp || it.delay > 0) continue;
      const dx = pp.x - it.pos.x, dz = pp.z - it.pos.z, dy = (pp.y + 0.4) - it.pos.y, d = Math.hypot(dx, dz);
      const magnet = it.kind === 'fish' ? ECONOMY.fish.magnet : it.kind === 'heart' ? PLAYER.smallHeart.magnet : 0;
      if (magnet && d < magnet && Math.abs(dy) < 2) {
        // the magnet pull is a little hop toward her (PICKUP_FX.hop), radius unchanged
        if (!it.mag) { it.mag = { d0: Math.max(d, 0.05), y0: it.pos.y }; it.air = false; it.vel.set(0, 0, 0); }
        const sp = PM.magnetSpeed + (magnet - d) * PM.magnetGain;
        it.pos.x += (dx / Math.max(d, 1e-3)) * Math.min(d, sp * dt); it.pos.z += (dz / Math.max(d, 1e-3)) * Math.min(d, sp * dt);
        const nd = Math.hypot(pp.x - it.pos.x, pp.z - it.pos.z), u = 1 - nd / it.mag.d0;
        it.mag.y0 += ((pp.y + 0.4) - it.mag.y0) * Math.min(1, dt * 8);
        it.pos.y = it.mag.y0 + magnetHop(u);
      } else if (it.mag) { it.mag = null; it.air = true; it.bounces = PICKUP_MOTION.bounces; }     // out of reach: drop back down
      const reach = it.kind === 'letter' ? 0.5 + p.radius : it.kind === 'heartBell' ? 0.9 : 0.55;
      if (Math.hypot(pp.x - it.pos.x, pp.z - it.pos.z) <= reach && Math.abs(dy) < 1.6) this._collect(it, p, st);
    }
    if (this.items.length > 64 && this.items.some((i) => !i.alive)) this.items = this.items.filter((i) => i.alive);
  }

  _collect(it, p, st) {
    it.alive = false;
    // WA §5.5: the item squashes 1.3 → 0 over 0.1 s where it was caught (visual only; the effect applies now)
    if (it.mesh) { it.collectT = PICKUP_MOTION.collectT; this._fading.push(it); } else if (it.kind === 'fish' || it.kind === 'heart') { it.collectT = PICKUP_MOTION.collectT; this._fading.push(it); }
    const bus = this.ctx.bus, position = it.pos.clone();
    switch (it.kind) {
      case 'fish':
        if (st) st.fish = (st.fish ?? 0) + it.value;
        this.collected.fish += it.value;
        if (it.flag && st?.setFlag) st.setFlag(it.flag, (Number(st.getFlag?.(it.flag)) | 0) | (1 << it.bit));
        bus.emit(E.ITEM_PICKUP, { item: 'fish', amount: it.value, gold: it.gold, position });
        break;
      case 'heart': {
        const heal = PLAYER.smallHeart.heal;
        if (typeof p.heal === 'function') p.heal(heal); else p.hp = Math.min(p.maxHp, p.hp + heal);
        this.collected.hearts++;
        bus.emit(E.ITEM_PICKUP, { item: 'smallHeart', amount: heal, position });
        break;
      }
      case 'milk':
        if (p.milk < p.milkMax) p.milk++;
        if (st) st.milk = p.milk;
        this.collected.milk++;
        bus.emit(E.ITEM_PICKUP, { item: 'milk', amount: 1, position });
        break;
      case 'letter':
        if (st && !st.letters.includes(it.id)) st.letters.push(it.id);
        this.collected.letters.push(it.id);
        bus.emit(E.ITEM_PICKUP, { item: 'letter', id: it.id, amount: 1, position });
        break;
      case 'heartBell': {
        if (st && !st.heartBells.includes(it.id)) st.heartBells.push(it.id);
        const max = Math.min(PLAYER.hpMax, (p.maxHp ?? PLAYER.hpStart) + 2);
        p.maxHp = max; if (st) st.maxHp = max;
        if (typeof p.heal === 'function') p.heal(2); else p.hp = Math.min(max, p.hp + 2);
        this.collected.heartBells.push(it.id);
        bus.emit(E.ITEM_PICKUP, { item: 'heartBell', id: it.id, amount: 1, position });
        break;
      }
    }
  }

  render(alpha, dt) {
    const t = this._t, spin = CLASS_MARKS?.pickup?.spin ?? 1.2, PM = PICKUP_MOTION;
    let nf = 0, nh = 0;
    const tw = this.twinkles; tw.length = 0;
    // collected items squash out (0.1 s) where they were caught
    for (let i = this._fading.length - 1; i >= 0; i--) {
      const it = this._fading[i];
      it.collectT -= dt;
      const k = Math.max(0, it.collectT / PM.collectT) * PM.squash;
      if (it.collectT <= 0) { this._fading.splice(i, 1); disposeMesh(it.mesh); it.mesh = null; continue; }
      if (it.mesh) it.mesh.scale.setScalar(k);
      else if (it.kind === 'fish' && nf < MAX_FISH) {
        _e.set(0.25, t * spin + it.t, 0); _q.setFromEuler(_e); _s.setScalar((it.gold ? 1.35 : 1) * k);
        this.fishMesh.setMatrixAt(nf, _m.compose(_v.copy(it.pos), _q, _s)); this.fishMesh.setColorAt(nf, it.gold ? _gold : _silver); nf++;
      } else if (it.kind === 'heart' && nh < 24) {
        _e.set(0, t * spin, 0); _q.setFromEuler(_e); _s.setScalar(k);
        this.heartMesh.setMatrixAt(nh++, _m.compose(_v.copy(it.pos), _q, _s));
      }
    }
    // PERF §1.2: the fish draw is one InstancedMesh (never frustum-culled as a whole), so resting fish outside the
    // camera frustum are simply not written this frame (flying / magnetised ones always are)
    const cam = this.ctx.cam, cull = typeof cam?.inView === 'function';
    for (const it of this.items) {
      if (!it.alive) continue;
      const bob = it.air || it.mag ? 0 : Math.sin(t * 2.2 + it.t * 0.3) * PM.bob;
      if (!it.air && !it.mag && it.delay <= 0) tw.push(it);
      if (it.kind === 'fish' && cull && !it.air && !it.mag && !cam.inView(it.pos, 0.4)) continue;
      if (it.kind === 'fish' && nf < MAX_FISH) {
        _e.set(0.25, t * spin + it.t, Math.sin(t * 3 + it.t) * 0.2); _q.setFromEuler(_e);
        _s.setScalar(it.gold ? 1.35 : 1);
        this.fishMesh.setMatrixAt(nf, _m.compose(_v.set(it.pos.x, it.pos.y + bob, it.pos.z), _q, _s));
        this.fishMesh.setColorAt(nf, it.gold ? _gold : _silver);
        nf++;
      } else if (it.kind === 'heart' && nh < 24) {
        _e.set(0, t * spin * 2, 0); _q.setFromEuler(_e); _s.setScalar(1 + Math.sin(t * 6) * 0.08);
        this.heartMesh.setMatrixAt(nh++, _m.compose(_v.set(it.pos.x, it.pos.y + bob, it.pos.z), _q, _s));
      } else if (it.mesh) {
        if (it.kind === 'milk') { it.mesh.position.set(it.pos.x, it.pos.y - 0.15 + bob, it.pos.z); it.mesh.rotation.y = t * spin; }
        else if (it.kind === 'letter') it.mesh.position.y = it.pos.y + 0.03 + Math.max(0, Math.sin(t * 2 + it.t)) * 0.02;
        else if (it.kind === 'heartBell') { const b = it.mesh.getObjectByName('bell'); if (b) b.rotation.z = Math.sin(t * 2.4) * 0.12; }
      }
    }
    this.fishMesh.count = nf; this.heartMesh.count = nh;
    this.fishMesh.visible = nf > 0; this.heartMesh.visible = nh > 0;
    if (nf) { this.fishMesh.instanceMatrix.needsUpdate = true; this.fishMesh.instanceColor.needsUpdate = true; }
    if (nh) this.heartMesh.instanceMatrix.needsUpdate = true;
  }

  /** Counts for tests / results. */
  count(kind) { return this.items.filter((i) => i.alive && (!kind || i.kind === kind)).length; }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    for (const it of this.items) disposeMesh(it.mesh);
    for (const it of this._fading) disposeMesh(it.mesh);
    this.items.length = 0; this._fading.length = 0; this.twinkles.length = 0;
    this.fishMesh.removeFromParent(); this.heartMesh.removeFromParent();
    this.fishMesh.geometry.dispose(); this.heartMesh.geometry.dispose();
    this.fishMesh.dispose?.(); this.heartMesh.dispose?.();
  }
}
