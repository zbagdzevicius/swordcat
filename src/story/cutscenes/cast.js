// src/story/cutscenes/cast.js  (owner: story) — M2 cast helpers for the Act I–II scenes (CS-04…CS-10, D-02…D-06, G-02):
// defensive lookups of the actors other areas own (the defeated boss, party companions), the procedural set pieces the
// scenes build themselves (the camp lantern light, fireflies, a Dawnstone shard, the ballista bolt) and the CS-08
// pull-back rows of spoon kittens. Every helper is a no-op / falls back when a feature is missing, so a scene never
// crashes on a level that is still a stub. Pure parts (rows, arcs) are exported for unit tests.
import * as THREE from 'three';
import { E } from '../../core/events.js';
import { KITTEN_IDS } from '../../core/config.js';
import { claimLamp, releaseLamp } from './rig.js';
import { announce } from '../rewards.js';

// ==================================================================================================== pure layout
/**
 * CS-08 shot 4 (§5.4): the kittens behind her. Count = max(3, rescued), capped at 18, rows of 6 at 1.0 m spacing,
 * starting 2.5 m behind her. Rescued kittens come first (in state order); the rest are Pawsbury villagers (seeded),
 * never kittens that are still lost. Returns [{ id, npc, kittenId|null, at: [x, z], facing, row, col }]. Pure.
 * @param {string[]} rescued  state.kittens
 * @param {[number, number]} at  her position  @param {number} facing  her yaw (the kittens face the same way)
 */
export function spoonRows(rescued = [], at = [0, 0], facing = 0, o = {}) {
  const max = o.max ?? 18, perRow = o.perRow ?? 6, gap = o.gap ?? 1.0, back = o.back ?? 2.5, rowGap = o.rowGap ?? 1.0;
  const known = (rescued ?? []).filter((k) => KITTEN_IDS.includes(k));
  const n = Math.min(max, Math.max(3, known.length));
  const fx = Math.sin(facing), fz = Math.cos(facing);       // her forward
  const rx = fz, rz = -fx;                                  // across
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow), col = i % perRow;
    const inRow = Math.min(perRow, n - row * perRow);
    const off = (col - (inRow - 1) / 2) * gap;
    const d = back + row * rowGap;
    const kittenId = known[i] ?? null;
    out.push({
      id: `spoon_${i + 1}`, npc: kittenId ?? `villager_${101 + i}`, kittenId,
      at: [at[0] - fx * d + rx * off, at[1] - fz * d + rz * off], facing, row, col,
      prop: i % 3 === 1 ? 'colander' : 'pot_helm',
    });
  }
  return out;
}

/** Kitten A / B of CS-08 (§5.4): the first two rescued ids, else villagers. Pure. */
export function spoonSpeakers(rows) {
  return [rows[0] ?? null, rows[1] ?? null].map((r) => (r ? { id: r.id, name: r.kittenId ? `name.${r.kittenId}` : 'name.villager' } : null));
}

/** A point on a parabolic arc from a to b (Vector3-likes) at u ∈ [0, 1], peaking `h` above the chord. Pure. */
export function arcPoint(a, b, u, h, out = new THREE.Vector3()) {
  const k = Math.max(0, Math.min(1, u));
  out.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k + 4 * h * k * (1 - k), a.z + (b.z - a.z) * k);
  return out;
}

// ==================================================================================================== cast lookups
/**
 * The defeated boss `key` ('grizzlechop' | 'cacklejaw') as this scene's actor `id`. Reuses the real boss when it is
 * still in the level (scripted, its death shrink undone, kneeling), else spawns `standIn` (an AI-less cutscene type,
 * e.g. enemies' 'cacklejaw') at `fallback`. Registers the alias, so later steps can address `id`. Returns the actor.
 */
export function castBoss(ctx, cs, { key, id = key, standIn = null, fallback = null }) {
  const en = ctx.enemies;
  const match = (e) => e && !e.disposed && (e.def?.key === key || e.def?.id === `boss_${key}`);
  let b = match(en?.boss) ? en.boss : (en?.list ?? []).find(match) ?? null;
  if (b) {
    try {
      cs.script(b);
      b.hurtable = false;
      if (b.stateName === 'die') { b.stateName = 'yield'; b.stateT = 0; }      // stop the death shrink (scripted: no FSM)
      if (b.visual) b.visual.scale.setScalar(b.def?.visualScale ?? 1);
      b.endTelegraph?.();
      if (b.object3d) b.object3d.visible = true;
      cs.aliases.set(id, b);
      cs.spawned.push({ id, kind: 'enemy', obj: b, keep: false, borrowed: true });
      return b;
    } catch (e) { console.warn('[story] boss cast failed', e); }
  }
  if (standIn) {
    const at = fallback ?? [ctx.player?.pos.x ?? 0, (ctx.player?.pos.z ?? 0) + 2.5];
    cs.spawnOne({ id, type: standIn, kind: 'enemy', at, facing: 'swordcat' });
    return cs.actor(id);
  }
  return null;
}

/**
 * A named companion for a scene: the party member when active, else a scripted NPC of the same look spawned at `at`
 * (despawned at the end). `force` (CS-08: "Mochi is spawned even if another companion is active").
 */
export function castFriend(ctx, cs, id, at, facing = 0) {
  const active = (ctx.companions?.active ?? []).find((c) => c.kittenId === id);
  if (active) {
    cs.script(active);
    if (at) cs.place(active, at, facing);
    cs.aliases.set(id, active);
    return active;
  }
  cs.spawnOne({ id, type: id, kind: 'npc', at, facing });
  return cs.actor(id);
}

/** Party companions (not `except`) step out of frame: hidden for the scene, shown again at the end. */
export function hideParty(ctx, cs, except = []) {
  for (const c of ctx.companions?.active ?? []) {
    if (except.includes(c.kittenId) || !c.object3d?.visible) continue;
    c.object3d.visible = false;
    cs.script(c);
    (cs._hidden ??= []).push(c);
  }
}
export function showParty(cs) { for (const c of cs._hidden ?? []) if (c.object3d) c.object3d.visible = true; if (cs._hidden) cs._hidden.length = 0; }

/** Despawn every free (AI) enemy that isn't a boss (CS-08: the leftovers; CS-09: the horde flees). */
export function clearEnemies(ctx, { bosses = false } = {}) {
  const en = ctx.enemies;
  if (!en?.list) return 0;
  let n = 0;
  for (const e of [...en.list]) {
    if (!e || e.scripted || (!bosses && e.def?.boss) || e.tags?.has?.('cutscene')) continue;
    try { en.despawn(e); n++; } catch (err) { console.warn(err); }
  }
  return n;
}

/** Enemies still fighting (alive, AI, not a boss / cutscene actor). */
export function aliveEnemies(ctx) {
  let n = 0;
  for (const e of ctx.enemies?.list ?? []) if (e?.alive && !e.dormant && !e.scripted && e.faction === 'enemy' && !e.tags?.has?.('cutscene')) n++;
  return n;
}

/** Light a level's Vigil Stone from code (CS-04: `vigil_3` set active). */
export function activateVigil(ctx, id, silent = true) {
  try {
    if (typeof ctx.levels?.activateVigil === 'function') return ctx.levels.activateVigil(id, { silent });
    const v = (ctx.levels?.current?.vigils ?? []).find((x) => x.id === id);
    if (v) { v.activate?.({ silent }); return true; }
  } catch (e) { console.warn('[story] vigil activate failed', e); }
  return false;
}

/** Explore music of the current level (music "back to explore"). */
export const exploreTrack = (ctx) => ctx.levels?.current?.def?.music?.explore ?? null;

/**
 * Results card for a level that ends in a cutscene (§12.1: town CS-07, gate CS-10): flag `<level>.done`, best results
 * in state.levels, level:results, then ui.showResults (awaited, at most `maxSec`). Never loads a level.
 */
export async function levelResults(ctx, levelId, maxSec = 12) {
  const st = ctx.state;
  ctx.story?.flag?.(`${levelId}.done`, true);
  let res = null;
  try { res = ctx.levels?.results?.() ?? null; } catch (e) { console.warn(e); }
  if (!res) res = { levelId, time: 0, kittens: 0, letter: false, fish: 0, lives: ctx.player?.lives ?? null, rank: 'pawsome' };
  res = { ...res, levelId };
  if (st) {
    st.levels ??= {};
    const prev = st.levels[levelId] ?? {};
    const order = ['mewtiful', 'purrfect', 'pawsome'];
    st.levels[levelId] = { ...prev, cleared: true,
      bestRank: order.indexOf(res.rank) > order.indexOf(prev.bestRank ?? '') ? res.rank : (prev.bestRank ?? res.rank),
      bestTime: prev.bestTime ? Math.min(prev.bestTime, res.time || prev.bestTime) : res.time };
  }
  ctx.bus.emit(E.LEVEL_RESULTS, res);
  if (typeof ctx.ui?.showResults === 'function') {
    const g = ctx.game, prevMode = g?.mode;
    try {
      await Promise.race([Promise.resolve(ctx.ui.showResults(res)), new Promise((r) => setTimeout(r, (ctx.params?.test ? 1.5 : maxSec) * 1000))]);
    } catch (e) { console.warn('[story] results card failed', e); }
    // give the scene its mode back only while it still runs (a skipped scene has ended: forcing 'cutscene' here soft-locked play)
    if (g && prevMode && g.mode !== prevMode && (prevMode === 'cutscene' || prevMode === 'dialog') && ctx.story?.isPlaying) g.setMode(prevMode);
  }
  return res;
}

// ==================================================================================================== built set pieces
const disposeTree = (g) => () => g.traverse((o) => {
  o.geometry?.dispose?.();
  for (const m of [].concat(o.material ?? [])) { m.map?.dispose?.(); m.dispose?.(); }
});

/**
 * CS-04: the lantern's warm light (§5.4 #FFC46B, 1.5, 6 m). PERF S5t / ART X6: no PointLight; the holder claims the
 * cutscene lamp (`ENV_U.uLamps` slot 0, uniforms only) at its world position on its first render and gives it back on
 * dispose. Returns a builder for the cutscene `spawn` step: `build: buildLanternLight` (called with ctx).
 */
export function buildLanternLight(ctx) {
  const g = new THREE.Group();
  g.name = 'story:lanternLight';
  const owner = g, w = new THREE.Vector3();
  let claimed = false;
  g.userData.lamp = { color: '#FFC46B', r: 6, str: 1 };
  g.userData.tick = () => {
    if (claimed || !g.parent) return;
    g.updateWorldMatrix(true, false);
    w.set(0, 0.32, 0); g.localToWorld(w);
    claimed = claimLamp(ctx, owner, w, g.userData.lamp) || true;
  };
  g.userData.dispose = () => releaseLamp(ctx, owner);
  return g;
}

/** Fireflies (`#E8FF9A`): a drifting cloud of additive points; `userData.tick(dt)` animates them. */
export function buildFireflies(n = 36, r = 7, seed = 7) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const base = new Float32Array(n * 4), pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r;
    base[i * 4] = Math.sin(a) * d; base[i * 4 + 1] = 0.4 + rnd() * 2.2; base[i * 4 + 2] = Math.cos(a) * d; base[i * 4 + 3] = rnd() * 10;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: '#E8FF9A', size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.9,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'story:fireflies';
  pts.frustumCulled = false;
  let t = 0;
  const tick = (dt) => {
    t += dt;
    for (let i = 0; i < n; i++) {
      const p = base[i * 4 + 3];
      pos[i * 3] = base[i * 4] + Math.sin(t * 0.4 + p) * 0.6;
      pos[i * 3 + 1] = base[i * 4 + 1] + Math.sin(t * 0.9 + p * 1.7) * 0.25;
      pos[i * 3 + 2] = base[i * 4 + 2] + Math.cos(t * 0.35 + p) * 0.6;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = 0.65 + 0.3 * Math.sin(t * 2.3);
  };
  tick(0);
  pts.userData.tick = tick;
  pts.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return pts;
}

/** A Dawnstone shard (CS-05 / CS-09): a glowing gold crystal with a halo. */
export function buildShard() {
  const g = new THREE.Group();
  g.name = 'story:shard';
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshStandardMaterial({ color: '#FFE3A3', emissive: '#FFC046',
    emissiveIntensity: 2.2, roughness: 0.25, metalness: 0.1 }));
  crystal.scale.set(0.7, 1.4, 0.7);
  g.add(crystal);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshBasicMaterial({ color: '#FFD98A', transparent: true, opacity: 0.35,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  g.add(halo);
  let t = 0;
  g.userData.tick = (dt) => { t += dt; crystal.rotation.y += dt * 2.4; halo.scale.setScalar(1 + 0.15 * Math.sin(t * 6)); };
  g.userData.dispose = disposeTree(g);
  return g;
}

/** G-02: the ballista bolt (a 1.4 m iron-tipped shaft with fletching), pointing along local +Z. */
export function buildBolt() {
  const g = new THREE.Group();
  g.name = 'story:bolt';
  const wood = new THREE.MeshStandardMaterial({ color: '#7A5A3A', roughness: 0.8 });
  const iron = new THREE.MeshStandardMaterial({ color: '#5A5E66', roughness: 0.4, metalness: 0.8 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 8), wood);
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 8), iron);
  tip.rotation.x = Math.PI / 2; tip.position.z = 0.82;
  g.add(tip);
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.12, 0.22), new THREE.MeshStandardMaterial({ color: '#D8D0C0', roughness: 0.9 }));
    f.position.z = -0.6; f.rotation.z = (i / 3) * Math.PI * 2;
    f.position.x = Math.sin(f.rotation.z) * 0.05; f.position.y = Math.cos(f.rotation.z) * 0.05;
    g.add(f);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.dispose = disposeTree(g);
  return g;
}

/** The record of a `build` spawn (its Object3D) by id, or null. */
export const built = (cs, id) => cs.spawned.find((r) => r.id === id)?.obj ?? null;

/**
 * Tween a built object (or an actor's position) from → to over `dur` sim seconds on an arc (`h` m). Returns a promise
 * that resolves when it lands (or the scene ends). `onTick(u, obj)` runs every step.
 */
export function flyObject(cs, getObj, from, to, dur, h = 0, onTick = null) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3();
  if (!cs.point(from, a) || !cs.point(to, b)) return null;
  if (Array.isArray(from) && from.length >= 3) a.set(from[0], from[1], from[2]);
  if (Array.isArray(to) && to.length >= 3) b.set(to[0], to[1], to[2]);
  return new Promise((resolve) => {
    let t = 0;
    cs.every((dt) => {
      const o = getObj();
      t += dt;
      const u = Math.min(1, t / Math.max(0.01, dur));
      arcPoint(a, b, u, h, p);
      if (o) {
        if (o.object3d && o.pos) { o.pos.copy(p); o.vel?.set(0, 0, 0); o.snap?.(); } else o.position.copy(p);
      }
      onTick?.(u, o);
      if (u >= 1) { resolve(); return false; }
      return !cs.finishing;
    });
  });
}

/** Run `obj.userData.tick(dt)` of built pieces every step while the scene plays. */
export function animateBuilt(cs, id) {
  cs.every((dt) => { const o = built(cs, id); if (!o) return !cs.finishing; o.userData?.tick?.(dt); return !cs.finishing; });
}

/** `who` walks up to stand `gap` m in front of her (a clean side-on two-shot). Returns the moveTo promise. */
export function stepUp(ctx, cs, who, gap = 1.4, speed = 1.6) {
  const me = ctx.player, a = cs.actor(who);
  if (!me || !a) return null;
  return a.moveTo?.([me.pos.x + Math.sin(me.facing) * gap, me.pos.z + Math.cos(me.facing) * gap], speed) ?? null;
}

/** Emit strings-key toasts (`{ text, key, icon }`). */
export function toast(ctx, keys, icon = null) {
  for (const k of [].concat(keys)) announce(ctx, k, null, icon);
}

/** Show `cape` on her now and make it the equipped (saved) cape (CS-07: cream → red). */
export function equipCape(ctx, cape) {
  const st = ctx.state;
  if (st?.cosmetics) { if (!st.cosmetics.capes.includes(cape)) st.cosmetics.capes.push(cape); st.cosmetics.cape = cape; }
  const p = ctx.player;
  try {
    if (typeof p?.setCapeOverride === 'function') p.setCapeOverride(null);       // re-applies the equipped cape
    else p?.model?.k?.setCape?.(cape);
  } catch (e) { console.warn('[story] cape swap failed', e); }
}
