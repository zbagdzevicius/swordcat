// src/enemies/Boss.js  (owner: enemies) — the boss base (GAME_DESIGN §11.1; Appendix B.4 shapes): an Enemy with a
// phase runner, the Dizzy meter (Dizzy.js), an HP floor and phase retry.
//   Frozen contract (§19.4): fields phase, dizzy, dizzyMax, hpFloor; methods addDizzy(n), fillDizzy(), setHpFrac(f),
//   freeShard() (Barkus); events boss:start, boss:phase (exactly once per threshold, in order), boss:dizzy,
//   boss:defeated.
//   - Phase rows `{ at, moves, weights, windupMul, events: [{ at, spawn | env }] }`: crossing `at` (HP fraction)
//     fires boss:phase once, 1.0 s invulnerability and a short roar; the row's moves / weights / windupMul apply.
//   - Dizzy: poise × 4 per hit, +35 per parry, full on a gold parry / lesson; 2 s idle → decay 8/s; full → 3 s
//     dizzy (staggered; `critMul` 2 for Combat), then 0.
//   - Death and retry: when she loses a life, the current phase restarts at full phase HP and the adds despawn.
//   - Barkus: `hpFloor` (any phase row's) holds until freeShard(); with the shard freed, reaching `rallyAt` plays
//     CS-15 (`onRally.play`) instead of dying (CS-15's `end` emits boss:defeated).
import { Enemy, BASE_STATES } from './Enemy.js';
import { Dizzy } from './Dizzy.js';
import { E } from '../core/events.js';
import { ATTACKS, DIZZY, PLAYER } from '../core/config.js';
import { TUNING } from './tuning.js';
import * as THREE from 'three';

const _p = new THREE.Vector3();

/** Phase index for HP fraction `frac` (pure; exported for tests). */
export function phaseFor(phases, frac) {
  let i = 0;
  for (let k = 1; k < (phases?.length ?? 0); k++) if (frac <= phases[k].at) i = k;
  return i;
}

const BOSS_STATES = {
  phase: {
    anim: (e) => (e.roleSpec('cheer') ? ['cheer', { once: true }] : ['idle', null]),
    enter(e) { e.endTelegraph(); e.swing = null; e.releaseToken(); e.attack = null; },
    update(e, dt) {
      e.brake(dt);
      const p = e.targetActor();
      if (p) e.faceTo(p.pos, dt, 4);
      if (e.stateT >= TUNING.boss.phaseInvuln) e.setState(p ? 'chase' : 'idle');
    },
  },
  idle: {
    anim: 'idle',
    update(e, dt) { e.brake(dt); if (e.started && e.targetActor()) e.setState('chase'); else if (e.sees) e.alert(); },
  },
  return: {          // bosses never leash home; they wait in their arena
    anim: 'idle',
    update(e, dt) { e.brake(dt); if (e.targetActor()) e.setState('chase'); },
  },
};

export class Boss extends Enemy {
  constructor(ctx, def, spawn = {}) {
    super(ctx, { ...def, states: { ...BOSS_STATES, ...(def.states ?? {}) } }, spawn);
    this.tags.add('boss');
    this.phase = 0;
    this.meter = new Dizzy(def.dizzyMax ?? 100);
    this.dizzyMax = this.meter.max;
    this.shardFreed = false; this.rallied = false; this.started = false;
    this._rallyPending = false;
    this._phasesFired = new Set([0]);
    this._eventsFired = new Set();
    /** @type {Enemy[]} adds this boss spawned (despawned on retry / defeat) */
    this.adds = [];
    this._moves = new Map();
    this._dizzyEmitT = 0;
    this._offLife = null;
    this.phaseWindupMul = def.phases?.[0]?.windupMul ?? 1;
  }

  /** Dizzy meter value (0..dizzyMax). */
  get dizzy() { return this.meter?.value ?? 0; }
  set dizzy(v) { if (this.meter) this.meter.value = Math.max(0, Math.min(this.meter.max, v)); }
  get isDizzy() { return !!this.meter?.dizzy; }
  /** Crit multiplier Combat applies to hits on this boss (×2 while dizzy). */
  get critMul() { return this.meter?.critMul ?? 1; }

  /** HP floor fraction (null = none): any phase row's `hpFloor` (Barkus P3: 0.10) holds until freeShard(). */
  get hpFloor() {
    if (this.shardFreed || !this.def) return null;
    let f = this.def.hpFloor ?? null;
    for (const row of this.def.phases ?? []) if (row.hpFloor != null) f = Math.max(f ?? 0, row.hpFloor);
    return f;
  }

  // hp is an accessor so hpFloor / rally hold no matter who writes it (Combat, hooks)
  get hp() { return this._hp ?? 0; }
  set hp(v) {
    if (this.maxHp > 0 && this.def) {
      const floor = this.hpFloor;
      if (floor != null) v = Math.max(v, Math.ceil(this.maxHp * floor));
      if (this.def.rallyAt != null && this.shardFreed && !this.rallied && v <= this.maxHp * this.def.rallyAt) {
        v = Math.max(v, Math.ceil(this.maxHp * this.def.rallyAt) - 1, 1);
        this._rallyPending = true;
      }
    }
    this._hp = v;
  }

  /** Called by EnemyManager after registration: boss:start, then it fights. */
  start() {
    if (this.started) return;
    this.started = true;
    this.alerted = true;
    this._offLife = this.ctx.bus.on(E.PLAYER_LIFE_LOST, () => this.restartPhase());
    this.ctx.bus.emit(E.BOSS_START, { boss: this, id: this.def.id, name: this.def.name ?? this.def.id, maxHp: this.maxHp,
      phases: (this.def.phases ?? []).map((p) => p.at), dizzyMax: this.dizzyMax });
  }

  // ------------------------------------------------------------------ phases
  /** Fire every threshold crossed since the last check, in order, exactly once each; then row events. */
  checkPhases() {
    const rows = this.def.phases ?? [], frac = this.hp / this.maxHp;
    for (let i = 1; i < rows.length; i++) {
      if (frac <= rows[i].at && !this._phasesFired.has(i)) {
        this._phasesFired.add(i);
        this.phase = i;
        this.phaseWindupMul = rows[i].windupMul ?? 1;
        this.attackChoice = null;
        this.invulnT = Math.max(this.invulnT, TUNING.boss.phaseInvuln);
        this.ctx.bus.emit(E.BOSS_PHASE, { boss: this, phase: i });
        this.def.onPhaseChange?.(this, i);
        if (this.alive && !this.scripted && this.started && !this.isDizzy) this.setState('phase');
      }
    }
    this._phaseEvents(frac);
  }

  _phaseEvents(frac) {
    const rows = this.def.phases ?? [];
    for (let i = 0; i < rows.length; i++) {
      const evs = rows[i].events ?? [];
      for (let j = 0; j < evs.length; j++) {
        const ev = evs[j], key = `${i}:${j}`;
        if (this._eventsFired.has(key) || frac > ev.at) continue;
        this._eventsFired.add(key);
        if (ev.spawn) this.spawnAdds(ev.spawn);
        if (ev.env) this.ctx.env?.set?.(ev.env, ev.env.dur ?? 1);
      }
    }
  }

  /** Spawn adds on a ring around the boss (they despawn on retry and defeat). */
  spawnAdds(list) {
    const pts = [], n = 6, r = TUNING.boss.addsRing;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.facing;
      pts.push(new THREE.Vector3(this.pos.x + Math.sin(a) * r, this.pos.y, this.pos.z + Math.cos(a) * r));
    }
    const out = this.ctx.enemies?.spawnWave?.(list, pts) ?? [];
    for (const a of out) { a.bossAdd = this; a.alerted = true; a.wake?.(0.2); }
    this.adds.push(...out);
    return out;
  }

  despawnAdds() {
    for (const a of this.adds) if (this.ctx.enemies?.list?.includes(a)) this.ctx.enemies.despawn(a);
    this.adds.length = 0;
  }

  /** §11.1 death and retry: restart the current phase at full phase HP; adds despawn. */
  restartPhase() {
    if (!this.alive || !this.started) return;
    const rows = this.def.phases ?? [], top = rows[this.phase]?.at ?? 1;
    this._hp = Math.max(1, Math.round(this.maxHp * top));
    for (const k of [...this._eventsFired]) {
      const [i, j] = k.split(':').map(Number), ev = rows[i]?.events?.[j];
      if (ev && ev.at < top) this._eventsFired.delete(k);
    }
    this.despawnAdds();
    this.meter.reset();
    this.endTelegraph(); this.swing = null; this.releaseToken(); this.attack = null; this.staggerT = 0;
    this.emitDizzy();
    if (!this.scripted) this.setState('idle');
  }

  // ------------------------------------------------------------------ attacks
  /** Current phase row's moves (weights), resolved from the type's `moves`, ATTACKS, or a generic swing. */
  pickAttack(d = this.distToPlayer()) {
    if (this.attackChoice && this.stateName === 'chase') return this.attackChoice;
    const row = this.def.phases?.[this.phase];
    if (!row?.moves?.length) return super.pickAttack(d);
    const w = row.weights ?? row.moves.map(() => 1);
    let total = 0; for (let i = 0; i < row.moves.length; i++) total += w[i] ?? 1;
    if (total <= 0) return super.pickAttack(d);
    let r = this.ctx.rng() * total, pick = row.moves[0];
    for (let i = 0; i < row.moves.length; i++) { r -= w[i] ?? 1; if (r <= 0 && (w[i] ?? 1) > 0) { pick = row.moves[i]; break; } }
    const def = this.attackDef(pick);
    this.attackChoice = { id: pick, def, range: def.range ?? def.arc?.range ?? TUNING.boss.fallbackRange, kind: def.projectile ? 'ranged' : 'melee' };
    return this.attackChoice;
  }

  attackDef(id) {
    const own = this.def.moves?.[id];
    if (own && !own.chain) return own;
    if (ATTACKS[id]) return ATTACKS[id];
    let m = this._moves.get(id);
    if (!m) {
      // generic stand-in swing sized to the boss (the boss type files replace these in M2/M3)
      const h = this.height, r = TUNING.boss.fallbackRange * Math.max(1, h / 2), first = own?.chain?.[0] ?? {};
      m = { id: `${this.def.id}:${id}`, telegraph: first.telegraph ?? own?.telegraph ?? 'parry', windup: first.windup ?? own?.windup ?? 0.6, dur: 0.55, active: [0.05, 0.22],
        arc: { range: r, from: 1.1, to: -1.1, y0: 0, y1: h }, dmg: first.dmg ?? own?.dmg ?? 2, knock: 6, poise: 2, recover: 0.9, unblockable: (first.telegraph ?? own?.telegraph) === 'red' };
      this._moves.set(id, m);
    }
    return m;
  }

  // ------------------------------------------------------------------ dizzy
  emitDizzy() {
    this._dizzyEmitT = 0;
    this.ctx.bus.emit(E.BOSS_DIZZY, { boss: this, value: this.dizzy, max: this.dizzyMax, dizzy: this.isDizzy });
  }

  _dizzyResult(res) {
    if (!res) return;
    if (res === 'dizzy') { this.stagger(DIZZY.dur); this.wobbleT = DIZZY.dur; }
    this.emitDizzy();
  }

  addDizzy(n) { this._dizzyResult(this.meter.add(n)); }

  fillDizzy() { this._dizzyResult(this.meter.fill()); }

  /** Test hook: set hp to f × maxHp (respects hpFloor) and fire crossed thresholds. */
  setHpFrac(f) { this.hp = Math.max(1, this.maxHp * f); this.checkPhases(); this._maybeRally(); }

  /** Barkus: the third phase-3 parry frees the shard (hpFloor off). */
  freeShard() { this.shardFreed = true; }

  /** §11.1: +35 per parry (full on a gold glint); a parried boss is briefly interrupted. */
  onParried(by, { gold = false } = {}) {
    if (!this.alive) return;
    const res = this.meter.addParry(gold);
    if (res !== 'dizzy') this.stagger(PLAYER.guard.eliteParryStagger);
    this._dizzyResult(res || 'gain');
  }

  onHit(hit) {
    super.onHit(hit);
    if (!this.alive) return;
    this._dizzyResult(this.meter.addPoise(hit.def?.poise ?? 1));
    this.checkPhases();
    this._maybeRally();
  }

  _maybeRally() {
    if (!this._rallyPending || this.rallied) return;
    this._rallyPending = false; this.rallied = true;
    this.despawnAdds();
    this.ctx.story?.play?.(this.def.onRally?.play ?? 'cs15');
  }

  onDeath(hit) {
    super.onDeath(hit);
    this.despawnAdds();
    this.ctx.bus.emit(E.BOSS_DEFEATED, { boss: this, id: this.def.id });
  }

  dieDur() { return TUNING.die.dur * 1.5; }

  update(dt) {
    if (this.meter && this.started && this.ctx.game.simActive(this) && !this.dormant) {
      const res = this.meter.update(dt);
      if (res === 'recovered') this.emitDizzy();
      else if (res === 'decay') { this._dizzyEmitT += dt; if (this._dizzyEmitT >= TUNING.boss.dizzyEventEvery) this.emitDizzy(); }
    }
    super.update(dt);
  }

  dispose() {
    this._offLife?.(); this._offLife = null;
    super.dispose();
  }
}

export { BASE_STATES };
export const _bossTmp = _p;
