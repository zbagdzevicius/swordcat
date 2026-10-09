// src/companions/SpoonBrigade.js  (owner: companions) — The Spoon Brigade (GAME_DESIGN §9.3, CS-08 shot 4, §12.6):
// in L4 the rescued kittens stand behind the Line in pot helmets and colanders, holding spoons. From CS-08 (wave W4)
// and through the Cacklejaw fight, every 2.0 s they throw ceil(count / 3) spoons (at least 1) at random enemies
// within 12 m of the Line marker: 5 damage each, no knockback, a "plink" (`impact/metal_small2`). They can't be
// targeted or hurt (neutral, unhurtable NpcActors).
//   count  max(3, rescued kittens), capped at 18, in rows of 6 at 1.0 m spacing starting 2.5 m behind her (§5.4
//          CS-08); fewer than 3 rescued → seeded Pawsbury villager kittens fill the rows, never still-lost kittens.
//   ids    each kitten registers as its kittenId (CS-08 "Kitten A / B" = the first two ids in state.kittens), or
//          `spoon_<i>` when that id is taken; villagers are `villager_spoon_<i>`.
// API (ctx.companions.spoons): start({ at, facing, arm }), arm(on), stop(), reset(), active, armed, kittens, count,
// stats; pure helpers spoonRoster(), spoonRows(), spoonsPerVolley() for story's CS-08 staging.
import * as THREE from 'three';
import { COMPANIONS, KITTEN_IDS } from '../core/config.js';
import { E } from '../core/events.js';
import { spoonBrigadeConfig, buildProp } from '../characters/index.js';
import { NpcActor } from './NpcActor.js';
import { groundY } from './steering.js';

const S = COMPANIONS.spoons;
/** CS-08 shot 4 layout (§5.4). */
export const SPOON_LAYOUT = Object.freeze({ min: 3, max: 18, perRow: 6, spacing: 1.0, back: 2.5, rowGap: 1.0 });
/** Where the Line marker is when the level has no `line` anchor (§12.6: the chalk line at z +10; foes come from −Z). */
export const LINE_MARKER = Object.freeze({ at: [0, 10], facing: Math.PI });
/** A thrown spoon (no knockback, no stagger, no juice: helpers, not carries). */
export const SPOON_HIT = Object.freeze({ id: 'spoon', dmg: S.dmg, knock: 0, poise: 0, hitstop: 0, shake: 0 });
const POOL = 14;

const _a = new THREE.Vector3();

/**
 * Who stands in the brigade: rescued kittens (state order, real lost-kitten ids only), filled with villagers up to
 * SPOON_LAYOUT.min, capped at SPOON_LAYOUT.max. Pure.
 * @param {string[]} rescued @returns {{ id: string, villager: boolean }[]}
 */
export function spoonRoster(rescued = []) {
  const ids = [...new Set((rescued ?? []).filter((id) => KITTEN_IDS.includes(id)))].slice(0, SPOON_LAYOUT.max);
  const out = ids.map((id) => ({ id, villager: false }));
  for (let i = 0; out.length < SPOON_LAYOUT.min; i++) out.push({ id: 'villager_spoon_' + i, villager: true });
  return out;
}

/**
 * Brigade spots behind `at` (her position on the Line) for a line facing `facing`: rows of 6, 1.0 m apart, the first
 * row 2.5 m behind her, each row centred. Returns [{x, z}] in roster order. Pure.
 */
export function spoonRows(count, at, facing, L = SPOON_LAYOUT) {
  const out = [];
  const bx = -Math.sin(facing), bz = -Math.cos(facing);          // behind her
  const sx = Math.cos(facing), sz = -Math.sin(facing);           // across the causeway
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / L.perRow), col = i % L.perRow;
    const inRow = Math.min(L.perRow, count - row * L.perRow);
    const across = (col - (inRow - 1) / 2) * L.spacing;
    const back = L.back + row * L.rowGap;
    out.push({ x: at[0] + bx * back + sx * across, z: at[1] + bz * back + sz * across });
  }
  return out;
}

/** Spoons per volley: ceil(count / 3), at least 1 (§9.3). Pure. */
export function spoonsPerVolley(count) { return Math.max(1, Math.ceil(count / 3) * (S.perThree ?? 1)); }

/** One spoon in flight (pooled mesh, fixed-step ballistic arc to the target's chest). */
class Spoon {
  constructor() { this.from = new THREE.Vector3(); this.to = new THREE.Vector3(); this.pos = new THREE.Vector3(); this.alive = false; this.mesh = null; }
}

export class SpoonBrigade {
  /** @param {any} ctx @param {import('./CompanionManager.js').CompanionManager} mgr */
  constructor(ctx, mgr) {
    this.ctx = ctx; this.mgr = mgr;
    /** kittens are standing behind the Line */
    this.active = false;
    /** they are throwing (after CS-08, during B2) */
    this.armed = false;
    /** @type {NpcActor[]} */
    this.kittens = [];
    this.at = new THREE.Vector3();
    this.facing = LINE_MARKER.facing;
    this.t = 0;
    this.spoons = [];
    this.stats = { volleys: 0, thrown: 0, hits: 0 };
    this._spoonMesh = null;
  }

  get count() { return this.kittens.length; }

  /** The Line marker: world's `line` anchor, else §12.6 (0, 10). */
  marker() {
    const a = this.ctx.levels?.anchor?.('line') ?? this.ctx.levels?.anchor?.('line_marker');
    if (a?.pos) return { x: a.pos.x, z: a.pos.z, facing: a.facing ?? LINE_MARKER.facing };
    return { x: LINE_MARKER.at[0], z: LINE_MARKER.at[1], facing: LINE_MARKER.facing };
  }

  /**
   * Stand the brigade behind her on the Line (idempotent; a second call only (dis)arms). `at` [x, z] defaults to her
   * position when she is within 6 m of the marker, else the marker.
   * @param {{ at?: number[], facing?: number, arm?: boolean }} [o]
   */
  start({ at = null, facing = null, arm = true } = {}) {
    if (!this.active) {
      const m = this.marker(), p = this.ctx.player;
      let x = m.x, z = m.z;
      if (at) { x = at[0]; z = at[1]; }
      else if (p && Math.hypot(p.pos.x - m.x, p.pos.z - m.z) < 6) { x = p.pos.x; z = p.pos.z; }
      this.facing = facing ?? m.facing;
      this.at.set(x, 0, z);
      this._place();
      this.active = true;
      this.ctx.bus.emit(E.BURST, { kind: 'sparkle', position: this.at.clone(), count: 6 });
    }
    this.arm(arm);
    return this;
  }

  _place() {
    const roster = spoonRoster(this.ctx.state?.kittens ?? []);
    const spots = spoonRows(roster.length, [this.at.x, this.at.z], this.facing);
    roster.forEach(({ id }, i) => {
      const cfg = spoonBrigadeConfig(id, i);
      const { x, z } = spots[i];
      const y = groundY(this.ctx, x, z, this.ctx.player?.pos?.y ?? 0);
      const npc = new NpcActor(this.ctx, id, { pos: new THREE.Vector3(x, y, z), facing: this.facing, cfg });
      npc.tags.add('spoonBrigade');
      npc.homeFacing = this.facing;
      npc.throwT = -1;
      // CS-08 speakers: the kitten's own id when free, else spoon_<i>
      const taken = !!this.ctx.actors?.get?.(id) || this.mgr.actors.some((a) => a.npcId === id || a.kittenId === id);
      this.mgr._add(npc, taken ? 'spoon_' + i : id);
      npc.actorId = taken ? 'spoon_' + i : id;
      npc.visual?.setExpression('determined');
      npc.visual?.setStance('relaxed');
      this.kittens.push(npc);
    });
  }

  /** Throwing on / off (kittens cheer when they stop). */
  arm(on) {
    on = !!on;
    if (on && !this.armed) this.t = S.every * 0.5;
    if (!on && this.armed) for (const k of this.kittens) { k.visual?.setPose('cheer', 0.2); k.visual?.hop(0.25); }
    this.armed = on && this.active;
    return this.armed;
  }

  /** Stop throwing (the kittens stay until the level unloads). */
  stop() { this.arm(false); }

  /** Drop everything (level unload): the NpcActors are despawned by the manager's clearLevel. */
  reset() {
    for (const sp of this.spoons) if (sp.mesh) sp.mesh.removeFromParent();
    this.spoons.length = 0;
    this.kittens.length = 0;
    this.active = false; this.armed = false;
    if (this._spoonMesh) { this._spoonMesh.geometry?.dispose(); this._spoonMesh = null; }
  }

  /** Enemies the brigade may pelt: alive, hurtable, hostile, not scripted, within 12 m of the Line marker. */
  targets(out = []) {
    out.length = 0;
    const r = S.range;
    for (const e of this.ctx.enemies?.list ?? []) {
      if (!e?.alive || e.hurtable === false || e.faction !== 'enemy' || e.scripted) continue;
      if (Math.hypot(e.pos.x - this.at.x, e.pos.z - this.at.z) <= r) out.push(e);
    }
    return out;
  }

  _spoonFor(sp) {
    if (!this.ctx.scene) return null;
    if (!this._spoonMesh) {
      this._spoonMesh = buildProp('spoon');
      if (this._spoonMesh) this._spoonMesh.scale.setScalar(1.8);
    }
    if (!this._spoonMesh) return null;
    if (!sp.mesh) { sp.mesh = this._spoonMesh.clone(); sp.mesh.castShadow = false; sp.mesh.name = 'thrownSpoon'; }
    this.ctx.scene.add(sp.mesh);
    return sp.mesh;
  }

  /** One spoon from kitten `k` at enemy `e`. */
  throwAt(k, e) {
    let sp = this.spoons.find((s) => !s.alive);
    if (!sp) { if (this.spoons.length >= POOL) return false; sp = new Spoon(); this.spoons.push(sp); }
    sp.alive = true; sp.owner = k; sp.target = e; sp.t = 0;
    sp.from.set(k.pos.x, k.pos.y + (k.height ?? 0.7) * 0.85, k.pos.z);
    sp.to.set(e.pos.x, e.pos.y + (e.height ?? 0.8) * 0.55, e.pos.z);
    const d = sp.from.distanceTo(sp.to);
    sp.dur = Math.min(0.95, Math.max(0.35, d / 14));
    sp.h = 0.6 + d * 0.12;
    sp.pos.copy(sp.from);
    this._spoonFor(sp);
    k.facing = Math.atan2(e.pos.x - k.pos.x, e.pos.z - k.pos.z);
    k.visual?.attack('swipe');
    k.visual?.hop(0.12, 0.3);
    this.stats.thrown++;
    return true;
  }

  update(dt) {
    if (!this.active) return;
    const g = this.ctx.game;
    const live = g?.mode === 'play' || g?.mode === 'memecam';
    // spoons in flight (follow the target; the arc is cosmetic)
    for (const sp of this.spoons) {
      if (!sp.alive) continue;
      if (!live) continue;
      sp.t += dt;
      const e = sp.target;
      if (e?.alive) sp.to.set(e.pos.x, e.pos.y + (e.height ?? 0.8) * 0.55, e.pos.z);
      const u = Math.min(1, sp.t / sp.dur);
      sp.pos.lerpVectors(sp.from, sp.to, u);
      sp.pos.y += 4 * sp.h * u * (1 - u);
      if (u >= 1) {
        sp.alive = false;
        if (sp.mesh) sp.mesh.removeFromParent();
        if (e?.alive && e.hurtable !== false) {
          const r = this.ctx.combat?.applyHit?.(sp.owner, e, SPOON_HIT, { from: sp.owner.pos });
          if (r && r !== 'none' && r !== 'immune') {
            this.stats.hits++;
            this.ctx.audio?.play3D?.('impact/metal_small2', e.pos, { volume: 0.7, rate: 1 + ((this.ctx.rng?.() ?? 0.5) - 0.5) * 0.3 });
          }
        }
      }
    }
    if (!this.armed || !live) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t += S.every;
    const tg = this.targets(this._tg ?? (this._tg = []));
    if (!tg.length || !this.kittens.length) return;
    this.stats.volleys++;
    const n = spoonsPerVolley(this.kittens.length), rng = this.ctx.rng ?? Math.random;
    for (let i = 0; i < n; i++) {
      const k = this.kittens[Math.floor(rng() * this.kittens.length) % this.kittens.length];
      const e = tg[Math.floor(rng() * tg.length) % tg.length];
      this.throwAt(k, e);
    }
  }

  render() {
    for (const sp of this.spoons) {
      if (!sp.alive || !sp.mesh) continue;
      sp.mesh.position.copy(sp.pos);
      _a.subVectors(sp.to, sp.from);
      sp.mesh.rotation.set(sp.t * 18, Math.atan2(_a.x, _a.z), 0);
    }
  }
}
