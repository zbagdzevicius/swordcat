// src/world/Pickups.js  (owner: world) — GAME_DESIGN §12.1 / §13.2 pickups: fish (silver 1, gold 10, magnetised from
// ECONOMY.fish.magnet), small hearts (PLAYER.smallHeart), milk bottles, Lost Letters (parchment + pink seal) and
// Heart Bells (gold bell + pink ribbon on a pedestal). Fish and hearts drop from defeated enemies (E.ENEMY_DIED,
// def.fish) and from crates; letters/bells are placed by level zones. Collecting updates GameState / the player and
// emits item:pickup. Fish render as ONE InstancedMesh; letters/bells/bottles are a few small meshes.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { ECONOMY, PLAYER, GRAVITY } from '../core/config.js';
import { mulberry32, hashSeed } from '../core/rng.js';
import { procTemplate } from './Props.js';

const MAX_FISH = 240;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
const _silver = new THREE.Color('#D7DEE6'), _gold = new THREE.Color('#F2C94C');

/** Fish mesh (body + tail), ~0.32 m long, facing +Z, centred. */
export function makeFishGeometry() {
  const body = new THREE.SphereGeometry(0.1, 10, 7); body.scale(0.55, 0.85, 1.35);
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
  const t = procTemplate('letter', [[new THREE.BoxGeometry(0.34, 0.012, 0.24), '#F4E7C9'], [flap, '#E8D5AA'], [seal, '#E86A92']]);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, emissive: '#3A1E24', emissiveIntensity: 0.25 });
  const m = new THREE.Mesh(t.geometry, mat);
  m.name = 'pickup:letter'; m.castShadow = true;
  m.userData.owned = true; mat.userData.owned = true;
  return m;
}

/** Heart Bell: a small gold bell with a pink ribbon on a stone pedestal (≈1.0 m). */
export function makeHeartBellMesh() {
  const g = new THREE.Group(); g.name = 'pickup:heartbell';
  const stone = new THREE.MeshStandardMaterial({ color: '#8C8F88', roughness: 0.9 });
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 8), stone); ped.position.y = 0.35;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 8), stone); cap.position.y = 0.74;
  const bellG = new THREE.LatheGeometry([[0.0, 0.0], [0.14, 0.0], [0.13, 0.04], [0.1, 0.14], [0.08, 0.22], [0.04, 0.26], [0, 0.27]].map(([x, y]) => new THREE.Vector2(x, y)), 16);
  const bell = new THREE.Mesh(bellG, new THREE.MeshStandardMaterial({ color: '#D9B26A', metalness: 0.85, roughness: 0.3, emissive: '#6A4A10', emissiveIntensity: 0.35 }));
  bell.position.y = 0.95; bell.name = 'bell';
  const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.022, 6, 12), new THREE.MeshStandardMaterial({ color: '#F2A2B8', roughness: 0.55 }));
  ribbon.position.y = 1.23; ribbon.scale.set(1.6, 1, 0.6);
  for (const m of [ped, cap, bell, ribbon]) { m.castShadow = true; g.add(m); }
  g.traverse((o) => { o.userData.owned = true; });
  return g;
}

/** Milk bottle (cream glass + red cap), ~0.3 m. */
export function makeMilkMesh() {
  const g = new THREE.Group(); g.name = 'pickup:milk';
  const glass = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.07, 0], [0.075, 0.14], [0.04, 0.2], [0.035, 0.26], [0, 0.26]].map(([x, y]) => new THREE.Vector2(x, y)), 14),
    new THREE.MeshStandardMaterial({ color: '#F6F1E4', roughness: 0.25 }));
  const capM = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), new THREE.MeshStandardMaterial({ color: '#C2353B', roughness: 0.5 }));
  capM.position.y = 0.27;
  for (const m of [glass, capM]) { m.castShadow = true; g.add(m); }
  g.traverse((o) => { o.userData.owned = true; });
  return g;
}

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
    this.collected = { fish: 0, letters: [], heartBells: [], milk: 0, hearts: 0 };
    this.rnd = mulberry32(hashSeed('pickups:' + levelId));
    this.fishMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', metalness: 0.65, roughness: 0.3, emissive: '#2A2A20', emissiveIntensity: 0.25 });
    this.fishMesh = new THREE.InstancedMesh(makeFishGeometry(), this.fishMat, MAX_FISH);
    this.fishMesh.name = 'pickups:fish'; this.fishMesh.count = 0; this.fishMesh.castShadow = true; this.fishMesh.frustumCulled = false;
    this.fishMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FISH * 3), 3);
    this.heartMat = new THREE.MeshStandardMaterial({ color: '#F0668E', roughness: 0.4, emissive: '#7A1F3A', emissiveIntensity: 0.5 });
    this.heartMesh = new THREE.InstancedMesh(makeHeartGeometry(), this.heartMat, 24);
    this.heartMesh.name = 'pickups:hearts'; this.heartMesh.count = 0; this.heartMesh.frustumCulled = false;
    root.add(this.fishMesh, this.heartMesh);
    for (const o of [this.fishMesh, this.heartMesh, this.fishMat, this.heartMat]) o.userData.owned = true;
    this._t = 0;
    this._offs = [ctx.bus.on(E.ENEMY_DIED, (p) => this._onEnemyDied(p))];
  }

  /** Spawn `n` fish worth `value` each at `pos` (popping out with a little arc when `pop`). */
  spawnFish(pos, n = 1, { value = ECONOMY.fish.silver, pop = true } = {}) {
    let live = 0;
    for (const it of this.items) if (it.alive && it.kind === 'fish') live++;
    for (let i = 0; i < n && live < MAX_FISH; i++, live++) {
      const a = this.rnd() * Math.PI * 2, sp = pop ? 1.2 + this.rnd() * 2 : 0;
      this.items.push({ kind: 'fish', value, gold: value >= ECONOMY.fish.gold, pos: new THREE.Vector3(pos.x, pos.y + (pop ? 0.6 : 0.35), pos.z),
        vel: new THREE.Vector3(Math.sin(a) * sp, pop ? 3.5 + this.rnd() * 2 : 0, Math.cos(a) * sp), air: pop, t: this.rnd() * 6, delay: pop ? 0.35 : 0, alive: true });
    }
  }

  /** A line of `n` silver fish from a to b ([x, z]). */
  fishLine(a, b, n) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1), x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      this.spawnFish(new THREE.Vector3(x, this.heightAt(x, z), z), 1, { pop: false });
    }
  }

  spawnHeart(pos) {
    this.items.push({ kind: 'heart', pos: new THREE.Vector3(pos.x, pos.y + 0.6, pos.z), vel: new THREE.Vector3(0, 4, 0), air: true, t: 0, delay: 0.35, alive: true });
  }

  spawnMilk(pos) {
    const mesh = makeMilkMesh();
    this.root.add(mesh);
    this.items.push({ kind: 'milk', pos: new THREE.Vector3(pos.x, pos.y + 0.6, pos.z), vel: new THREE.Vector3(0, 3.5, 0), air: true, t: 0, delay: 0.35, alive: true, mesh });
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

  _onEnemyDied(p) {
    const e = p?.enemy, at = p?.position ?? e?.pos;
    if (!at) return;
    const f = e?.def?.fish;
    let n = 0, value = ECONOMY.fish.silver;
    if (Array.isArray(f)) n = f[0] + Math.floor(this.rnd() * (f[1] - f[0] + 1));
    else if (typeof f === 'number') { value = ECONOMY.fish.gold; n = Math.max(1, Math.round(f / value)); }
    if (n > 0) this.spawnFish(at, n, { value });
    if (!e?.def?.boss && this.ctx.rng?.chance?.(e?.def?.smallHeart ?? PLAYER.smallHeart.chance)) this.spawnHeart(at);
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
    for (const it of this.items) {
      if (!it.alive) continue;
      it.t += dt;
      if (it.delay > 0) it.delay -= dt;
      if (it.air) {
        it.vel.y -= GRAVITY * 0.7 * dt;
        it.pos.addScaledVector(it.vel, dt);
        const g = this.heightAt(it.pos.x, it.pos.z) + 0.35;
        if (it.pos.y <= g && it.vel.y < 0) { it.pos.y = g; it.vel.set(0, 0, 0); it.air = false; }
      }
      if (!pp || it.delay > 0) continue;
      const dx = pp.x - it.pos.x, dz = pp.z - it.pos.z, dy = (pp.y + 0.4) - it.pos.y, d = Math.hypot(dx, dz);
      const magnet = it.kind === 'fish' ? ECONOMY.fish.magnet : it.kind === 'heart' ? PLAYER.smallHeart.magnet : 0;
      if (magnet && d < magnet && Math.abs(dy) < 2) {
        it.air = false;
        const sp = 4 + (magnet - d) * 6;
        it.pos.x += (dx / Math.max(d, 1e-3)) * Math.min(d, sp * dt); it.pos.z += (dz / Math.max(d, 1e-3)) * Math.min(d, sp * dt);
        it.pos.y += dy * Math.min(1, dt * 8);
      }
      const reach = it.kind === 'letter' ? 0.5 + p.radius : it.kind === 'heartBell' ? 0.9 : 0.55;
      if (Math.hypot(pp.x - it.pos.x, pp.z - it.pos.z) <= reach && Math.abs(dy) < 1.6) this._collect(it, p, st);
    }
    if (this.items.length > 64 && this.items.some((i) => !i.alive)) this.items = this.items.filter((i) => i.alive);
  }

  _collect(it, p, st) {
    it.alive = false;
    disposeMesh(it.mesh);
    const bus = this.ctx.bus, position = it.pos.clone();
    switch (it.kind) {
      case 'fish':
        if (st) st.fish = (st.fish ?? 0) + it.value;
        this.collected.fish += it.value;
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
    const t = this._t;
    let nf = 0, nh = 0;
    for (const it of this.items) {
      if (!it.alive) continue;
      const bob = it.air ? 0 : Math.sin(t * 2.2 + it.t * 0.3) * 0.06;
      if (it.kind === 'fish' && nf < MAX_FISH) {
        _e.set(0.25, t * 2.4 + it.t, Math.sin(t * 3 + it.t) * 0.2); _q.setFromEuler(_e);
        _s.setScalar(it.gold ? 1.35 : 1);
        this.fishMesh.setMatrixAt(nf, _m.compose(_v.set(it.pos.x, it.pos.y + bob, it.pos.z), _q, _s));
        this.fishMesh.setColorAt(nf, it.gold ? _gold : _silver);
        nf++;
      } else if (it.kind === 'heart' && nh < 24) {
        _e.set(0, t * 2.6, 0); _q.setFromEuler(_e); _s.setScalar(1 + Math.sin(t * 6) * 0.08);
        this.heartMesh.setMatrixAt(nh++, _m.compose(_v.set(it.pos.x, it.pos.y + bob, it.pos.z), _q, _s));
      } else if (it.mesh) {
        if (it.kind === 'milk') { it.mesh.position.set(it.pos.x, it.pos.y - 0.15 + bob, it.pos.z); it.mesh.rotation.y = t * 1.5; }
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
    this.items.length = 0;
    this.fishMesh.removeFromParent(); this.heartMesh.removeFromParent();
    this.fishMesh.geometry.dispose(); this.heartMesh.geometry.dispose();
    this.fishMesh.dispose?.(); this.heartMesh.dispose?.();
  }
}
