// src/fx/Encounters.js  (owner: fx) — M2 gameplay-driven effects that key off bus events (visuals only):
//   JeerFog     `enemy:jeer {enemy, on}`: purple #B07CFF sound-wave rings racing out to the aura radius (8 m, Jeer Duet
//               10 m) and a low violet "jeer fog" rolling in around the hyena while the aura lasts (§10.3 Jeer: "Env fog
//               +0.01"); stops on `on:false`, a choke or death.
//   Theft       `item:stolen {thief, item, amount}`: the loot (fish / a milk bottle) arcs from her to the Post Stealer's
//               paws with a purple grab puff; a gold "loot" twinkle marks the thief while it runs; if the thief vanishes
//               with the loot (despawned, not killed) → the stealer smoke-bomb poof where it was. `item:returned` → the
//               loot bursts back out in a fish fountain.
//   LineRepair  `objective:progress {id:'line', value, max, frozen, done}`: welding sparks, hammer "tink" stars and gold
//               motes at the winch while the repair runs; a gold ring every 10%; grey stall puffs when it freezes
//               (an enemy within 4 m, Pilfer's pin theft); confetti + a gold flare at 100%.
// Pure helpers at the top are unit-tested.
import * as THREE from 'three';
import { SHAPE, FADE, GROW } from './Particles.js';
import { MARK } from './Marks.js';
import { isActor, actorWorldPos, headPoint, toVec3, groundY } from './util.js';

export const JEER = Object.freeze({ color: '#B07CFF', fog: '#8B7AA8', r: 8, ringEvery: 0.5, puffEvery: 0.12, max: 4, maxDur: 6 });
export const LINE = Object.freeze({ ids: Object.freeze(['line', 'the_line', 'gate_line']), winch: Object.freeze([0, 41]), sparkEvery: 0.16,
  tinkEvery: 0.7, milestone: 10, idleAfter: 1.5 });

/** Is this objective id The Line's repair objective? (pure) */
export const isLineObjective = (id) => typeof id === 'string' && (LINE.ids.includes(id) || /^line(\b|_)/.test(id));

/** Repair percent 0..100 from an objective payload (value / max; max defaults to 100). Pure. */
export function repairPct(p) {
  const v = Number(p?.value), m = Number(p?.max);
  if (!Number.isFinite(v)) return 0;
  const pct = m > 0 ? (v / m) * 100 : v;
  return Math.max(0, Math.min(100, pct));
}

/** The 10% milestones crossed going from `a` to `b` percent (pure; e.g. 18 → 31 = [20, 30]). */
export function milestonesCrossed(a, b, step = LINE.milestone) {
  const out = [];
  if (!(b > a)) return out;
  for (let m = (Math.floor(a / step) + 1) * step; m <= b && m < 100; m += step) out.push(m);
  return out;
}

/** Loot particle count for a theft (pure): fish → 1 per 5 (2..8); milk → 1; anything else → 2. */
export function lootCount(item, amount) {
  if (item === 'fish') return Math.max(2, Math.min(8, Math.ceil((+amount || 0) / 5)));
  if (item === 'milk' || item === 'pin') return 1;
  return 2;
}

/** Ballistic launch velocity to land `d` (dx, dy, dz) away after `T` seconds under gravity `g` (pure). */
export function lobVelocity(dx, dy, dz, T, g) {
  return { x: dx / T, y: dy / T + 0.5 * g * T, z: dz / T };
}

/** How each stolen item flies (fish, a milk bottle, the winch pin at The Line). */
const LOOT = {
  fish: { shape: SHAPE.FISH, rgb: [0.75, 0.83, 0.88], size: 0.2 },
  milk: { shape: SHAPE.DROPLET, rgb: [1, 1, 1], size: 0.18 },
  pin: { shape: SHAPE.SHARD, rgb: [0.62, 0.64, 0.67], size: 0.22 },
};

const PURPLE = new THREE.Color(JEER.color), GOLD = new THREE.Color('#FFD34D'), WARM = new THREE.Color('#FFB347');
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _col = new THREE.Color();

export class Encounters {
  /** @param {any} ctx @param {{ particles: any, marks: any, holyFx: any, rng: () => number, screen?: any }} o */
  constructor(ctx, { particles, marks, holyFx, rng, screen = null }) {
    this.ctx = ctx; this.particles = particles; this.marks = marks; this.holyFx = holyFx; this.rng = rng; this.screen = screen;
    this.jeers = new Map();         // enemy → { t, ringT, puffT, r }
    this.thieves = new Map();       // thief → { item, amount, t, last: Vector3, glintT }
    this.lastThiefPos = new THREE.Vector3(); this.hasLastThief = false;
    this.line = { active: false, pct: 0, frozen: false, done: false, lastT: -99, sparkT: 0, tinkT: 0, stallT: 0, site: new THREE.Vector3(), hasSite: false };
    this.lowQ = false;
    this.counts = { jeers: 0, thefts: 0, returns: 0, vanishes: 0, repairSparks: 0, milestones: 0, repairDone: 0, stalls: 0 };
  }

  get jeerCount() { return this.jeers.size; }

  // ------------------------------------------------------------------ jeer fog
  jeer(enemy, on, opts = {}) {
    if (!isActor(enemy)) return;
    if (!on) { this.jeers.delete(enemy); return; }
    if (this.jeers.size >= JEER.max && !this.jeers.has(enemy)) {
      const oldest = [...this.jeers.entries()].reduce((m, e) => (e[1].t > m[1].t ? e : m));
      this.jeers.delete(oldest[0]);
    }
    this.jeers.set(enemy, { t: 0, ringT: 0, puffT: 0, r: opts.r ?? enemy.jeerRadius ?? JEER.r, dur: opts.dur ?? JEER.maxDur });
    this.counts.jeers++;
  }

  _renderJeers(dt, time) {
    const M = this.marks;
    for (const [e, s] of this.jeers) {
      s.t += dt;
      if (e.alive === false || !e.object3d?.parent || s.t > s.dur) { this.jeers.delete(e); continue; }
      actorWorldPos(e, _p);
      const fade = Math.min(1, s.t / 0.3);
      if (dt > 0 && (s.ringT -= dt) <= 0) {
        s.ringT = JEER.ringEvery;
        this.holyFx.arc({ x: _p.x, y: _p.y + 0.1, z: _p.z, ring: true, r0: 0.6, r1: s.r, thick: 0.32, life: 0.95, grow: 0.9, intensity: 0.85, color: JEER.color });
      }
      if (dt > 0 && (s.puffT -= dt) <= 0) {
        s.puffT = JEER.puffEvery * (this.lowQ ? 2 : 1);
        for (let k = 0; k < 2; k++) {
          const a = this.rng() * Math.PI * 2, d = Math.sqrt(0.08 + this.rng() * 0.92) * s.r;
          _q.set(_p.x + Math.sin(a) * d, 0, _p.z + Math.cos(a) * d);
          _q.y = groundY(this.ctx, _q.x, _q.z, _p.y) + 0.35 + this.rng() * 0.4;
          this.particles.burst(_q, { n: 1, shape: SHAPE.PUFF, color: JEER.fog, tint: 0.08, alpha: 0.26, size: [1.2, 2.2], sizeEnd: 1.6,
            grow: GROW.OUT, life: [1.6, 2.4], speed: [0.1, 0.35], spread: Math.PI, drag: 0.8, fade: FADE.IN_OUT });
        }
      }
      // sound waves pulsing at the mouth
      headPoint(e, _q, 0.05);
      for (let k = 0; k < 2; k++) {
        const u = ((time * 1.8 + k * 0.5) % 1);
        M.push(_q.x, _q.y, _q.z, 0.35 + u * 1.1, MARK.RING, PURPLE, 1.6, (1 - u) * 0.8 * fade);
      }
    }
  }

  // ------------------------------------------------------------------ theft
  stolen(p) {
    const thief = p?.thief, pl = this.ctx.player;
    if (!isActor(thief)) return;
    this.counts.thefts++;
    const n = lootCount(p.item, p.amount);
    // from her chest to the thief's paws
    if (isActor(pl)) { actorWorldPos(pl, _p); _p.y += (pl.height ?? 1) * 0.6; } else { actorWorldPos(thief, _p); _p.y += 0.6; }
    actorWorldPos(thief, _q); _q.y += (thief.height ?? 1.2) * 0.55;
    const T = 0.45, g = 9;
    for (let k = 0; k < n; k++) {
      const v = lobVelocity(_q.x - _p.x + (this.rng() - 0.5) * 0.4, _q.y - _p.y, _q.z - _p.z + (this.rng() - 0.5) * 0.4, T, g);
      const P = this.particles, s = P.begin();
      s.x = _p.x + (this.rng() - 0.5) * 0.2; s.y = _p.y; s.z = _p.z + (this.rng() - 0.5) * 0.2;
      s.vx = v.x; s.vy = v.y + (this.rng() - 0.5) * 0.6; s.vz = v.z;
      s.life = T + 0.05; s.gravity = g;
      const L = LOOT[p.item] ?? LOOT.fish;
      s.shape = L.shape;
      s.r = L.rgb[0]; s.g = L.rgb[1]; s.b = L.rgb[2];
      s.size0 = L.size; s.size1 = s.size0 * 0.8; s.spin = (this.rng() * 2 - 1) * 9; s.fade = FADE.HOLD;
      P.emit(false);
    }
    // the grab: a purple swirl puff and an eye glint
    this.particles.burst(_q, { n: 5, shape: SHAPE.PUFF, color: '#9B7CC8', alpha: 0.6, size: [0.14, 0.22], sizeEnd: 2, grow: GROW.OUT,
      life: [0.4, 0.6], speed: [0.4, 1.0], spread: Math.PI, drag: 3, fade: FADE.HOLD });
    this.particles.single(_q, { shape: SHAPE.STAR8, color: '#C9A6FF', intensity: 2.4, size0: 0.2, size1: 0.8, life: 0.3, fade: FADE.POP, spin: 3 });
    const prev = this.thieves.get(thief);
    this.thieves.set(thief, { item: p.item, amount: (prev?.amount ?? 0) + (+p.amount || 0), t: 0, last: actorWorldPos(thief, new THREE.Vector3()), glintT: 0 });
  }

  returned(p) {
    this.counts.returns++;
    let at = null;
    // the loot comes out of the thief who had it (killed / hit): the nearest tracked or the last known position
    let pick = null;
    for (const [th, s] of this.thieves) { if (s.died) { pick = [th, s]; break; } if (!pick) pick = [th, s]; }
    if (pick) { at = _q.copy(pick[1].last); this.thieves.delete(pick[0]); }
    if (!at && toVec3(p?.position, _p)) at = _p;
    if (!at && this.hasLastThief) at = this.lastThiefPos;
    if (!at && isActor(this.ctx.player)) at = actorWorldPos(this.ctx.player, _p);
    if (!at) return;
    _q.copy(at); _q.y += 0.7;
    const n = lootCount(p?.item ?? 'fish', (p?.amount ?? 0) + (p?.bonus ?? 0));
    const L = LOOT[p?.item] ?? LOOT.fish;
    this.particles.burst(_q, { n, shape: L.shape, color: _col.setRGB(L.rgb[0], L.rgb[1], L.rgb[2]), tint: 0.1,
      size: [0.16, 0.22], sizeEnd: 0.8, life: [0.7, 0.95], speed: [2.2, 3.4], dir: _up, spread: 0.85, gravity: 9, drag: 0.5, spin: 8, fade: FADE.HOLD, grow: GROW.BACK });
    this.particles.burst(_q, { additive: true, n: 12, shape: SHAPE.STAR4, color: '#FFE3A3', intensity: 2.2, size: [0.1, 0.18], sizeEnd: 0.3,
      life: [0.5, 0.8], speed: [1.0, 2.4], spread: Math.PI, drag: 2, fade: FADE.TWINKLE, jitter: 0.2 });
    this.particles.single(_q, { shape: SHAPE.RING, color: '#FFD34D', intensity: 1.8, size0: 0.3, size1: 1.8, life: 0.35, grow: GROW.OUT });
  }

  /** `enemy:died` for a tracked thief: it was beaten, not escaped (no smoke bomb; the loot comes out on item:returned). */
  died(enemy) {
    const s = this.thieves.get(enemy);
    if (s) { s.died = true; s.t = 0; if (isActor(enemy)) actorWorldPos(enemy, s.last); }
  }

  /** The Post Stealer's smoke-bomb exit (also burst 'stealerPoof'). */
  stealerPoof(pos, S = 1) {
    this.counts.vanishes++;
    const P = this.particles;
    _q.copy(pos); _q.y += 0.55 * S;
    P.burst(_q, { n: Math.round(12 * S), shape: SHAPE.PUFF, color: '#8F88A0', tint: 0.12, alpha: 0.9, size: [0.3 * S, 0.5 * S], sizeEnd: 2.2, grow: GROW.OUT,
      life: [0.6, 1.0], speed: [1.2, 2.6], spread: Math.PI, drag: 3.2, fade: FADE.HOLD, jitter: 0.25 * S });
    P.burst(_q, { n: Math.round(5 * S), shape: SHAPE.PUFF, color: '#5E5770', alpha: 0.85, size: [0.25 * S, 0.4 * S], sizeEnd: 2.4, grow: GROW.OUT,
      life: [0.7, 1.1], speed: [0.4, 1.2], up: 0.5, spread: Math.PI, drag: 2.5, fade: FADE.HOLD });
    P.single(_q, { shape: SHAPE.STAR8, color: '#FFFFFF', intensity: 2.6, size0: 0.4 * S, size1: 1.6 * S, life: 0.2, fade: FADE.POP });
    P.burst(_q, { additive: true, n: 5, shape: SHAPE.STAR5, color: '#FFE88A', intensity: 1.8, size: [0.12, 0.18], sizeEnd: 0.4, life: [0.45, 0.7],
      speed: [2.0, 3.2], spread: Math.PI, gravity: 3, drag: 2.5, spin: 8, fade: FADE.HOLD });
  }

  _renderThieves(dt, time) {
    for (const [th, s] of this.thieves) {
      s.t += dt;
      if (s.died) { this.lastThiefPos.copy(s.last); this.hasLastThief = true; continue; }   // killed: kept for item:returned
      if (!th.object3d?.parent || th.disposed || th.alive === false) {   // despawned (escaped) with the loot: the smoke bomb
        this.stealerPoof(s.last);
        this.lastThiefPos.copy(s.last); this.hasLastThief = true;
        this.thieves.delete(th);
        continue;
      }
      if (s.t > 30) { this.thieves.delete(th); continue; }
      actorWorldPos(th, s.last);
      // a gold loot twinkle over the bag
      headPoint(th, _q, 0.15);
      const tw = 0.6 + 0.4 * Math.sin(time * 9 + s.t);
      this.marks.push(_q.x, _q.y + 0.15, _q.z, 0.28 * tw, MARK.STAR4, GOLD, 2.4, 0.9, time * 2);
    }
    // forget dead thieves that never returned anything after a while
    for (const [th, s] of this.thieves) if (s.died && s.t > 3) this.thieves.delete(th);
  }

  // ------------------------------------------------------------------ The Line
  objective(p) {
    if (!p || !isLineObjective(p.id)) return;
    const L = this.line, pct = repairPct(p), now = this.ctx.game?.time ?? 0;
    if (!L.hasSite) this._lineSite(p);
    const wasFrozen = L.frozen;
    for (const m of milestonesCrossed(L.pct, pct)) this._milestone(m);
    const progressed = pct > L.pct + 1e-6;
    L.active = !p.done && pct < 100;
    L.frozen = !!p.frozen;
    if (progressed) L.lastT = now;
    if (L.frozen && !wasFrozen) { L.stallT = 0; this.counts.stalls++; this._stall(); }
    if ((p.done || pct >= 100) && !L.done) { L.done = true; this._repairDone(); }
    if (pct < L.pct - 5) L.done = false;      // a restart (debug / retry)
    L.pct = pct;
  }

  /** Point the repair effects at a world position (default: the `winch` anchor, else the payload's position, else gate (0, 41)). */
  setRepairSite(pos) { if (toVec3(pos, this.line.site)) this.line.hasSite = true; }

  _lineSite(p) {
    const L = this.line, lv = this.ctx.levels;
    const a = lv?.anchor?.('winch') ?? lv?.anchor?.('line_winch') ?? null;
    if (a?.pos) L.site.set(a.pos.x, a.pos.y ?? 0, a.pos.z);
    else if (!toVec3(p?.position, L.site)) L.site.set(LINE.winch[0], 0, LINE.winch[1]);
    L.site.y = groundY(this.ctx, L.site.x, L.site.z, L.site.y);
    L.hasSite = true;
  }

  _sparkPoint(out) { const L = this.line; return out.set(L.site.x + (this.rng() - 0.5) * 0.8, L.site.y + 1.0 + this.rng() * 0.5, L.site.z + (this.rng() - 0.5) * 0.8); }

  _milestone(m) {
    this.counts.milestones++;
    const L = this.line;
    this.holyFx.arc({ x: L.site.x, y: L.site.y + 0.08, z: L.site.z, ring: true, r0: 0.4, r1: 3.2, thick: 0.3, life: 0.6, grow: 0.5, intensity: 1.0 });
    _q.copy(L.site); _q.y += 1.3;
    this.particles.burst(_q, { additive: true, n: 14, shape: SHAPE.STAR4, color: '#FFE3A3', intensity: 2.4, size: [0.12, 0.22], sizeEnd: 0.3,
      life: [0.6, 1.0], speed: [1.0, 2.6], up: 0.8, spread: Math.PI, drag: 2, fade: FADE.TWINKLE, jitter: 0.3 });
    if (m % 50 === 0) this.particles.single(_q, { shape: SHAPE.STAR8, color: '#FFD34D', intensity: 3, size0: 0.3, size1: 1.6, life: 0.4, fade: FADE.POP, spin: 2 });
  }

  _stall() {
    const L = this.line;
    _q.copy(L.site); _q.y += 1.1;
    this.particles.burst(_q, { n: 4, shape: SHAPE.PUFF, color: '#9A968E', alpha: 0.7, size: [0.16, 0.24], sizeEnd: 2.2, grow: GROW.OUT,
      life: [0.7, 1.0], speed: [0.3, 0.8], up: 0.6, spread: Math.PI, drag: 2.2, fade: FADE.HOLD });
    this.particles.burst(_q, { n: 4, shape: SHAPE.STAR5, color: '#B9B2A4', alpha: 0.9, size: [0.1, 0.14], sizeEnd: 0.5, life: [0.4, 0.6],
      speed: [1.0, 1.8], dir: _up, spread: 0.9, gravity: 5, spin: 6, fade: FADE.HOLD });
  }

  _repairDone() {
    this.counts.repairDone++;
    const L = this.line;
    _q.copy(L.site); _q.y += 1.4;
    this.holyFx.arc({ x: L.site.x, y: L.site.y + 0.08, z: L.site.z, ring: true, r0: 0.5, r1: 6, thick: 0.45, life: 0.9, grow: 0.7, intensity: 1.4 });
    this.particles.single(_q, { shape: SHAPE.STAR8, color: '#FFE9A8', intensity: 3.2, size0: 0.4, size1: 2.4, life: 0.5, fade: FADE.POP, spin: 2 });
    this.particles.burst(_q, { additive: true, n: 36, shape: SHAPE.STAR4, color: '#FFE3A3', intensity: 2.6, size: [0.14, 0.26], sizeEnd: 0.3,
      life: [0.8, 1.3], speed: [1.5, 4.0], up: 1.0, spread: Math.PI, gravity: -0.3, drag: 1.8, fade: FADE.TWINKLE, jitter: 0.4 });
    const cols = ['#FF8FB1', '#FFD34D', '#7FD38A', '#8FC8FF', '#FFFFFF'];
    for (const c of cols) {
      this.particles.burst(_q, { n: 6, shape: SHAPE.SHARD, color: c, size: [0.06, 0.1], life: [1.0, 1.5], speed: [2.5, 4.5], dir: _up, spread: 0.9,
        gravity: 5, drag: 2.2, spin: 12, fade: FADE.HOLD });
    }
    this.screen?.spike(1.0, 0.4);
  }

  _renderLine(dt, time) {
    const L = this.line;
    if (!L.active || !L.hasSite || dt <= 0) return;
    const now = this.ctx.game?.time ?? 0;
    const running = !L.frozen && now - L.lastT < LINE.idleAfter;
    if (L.frozen) {
      if ((L.stallT += dt) > 1.2) { L.stallT = 0; this._stall(); }
      return;
    }
    if (!running) return;
    // a warm work-light glow at the winch
    _q.copy(L.site); _q.y += 1.15;
    this.marks.push(_q.x, _q.y, _q.z, 1.2 + 0.2 * Math.sin(time * 11), MARK.SOFT, WARM, 1.6, 0.55);
    const lowMul = this.lowQ ? 2 : 1;
    if ((L.sparkT -= dt) <= 0) {
      L.sparkT = LINE.sparkEvery * lowMul * (0.7 + this.rng() * 0.6);
      this.counts.repairSparks++;
      this._sparkPoint(_p);
      this.particles.burst(_p, { additive: true, n: this.lowQ ? 6 : 9, shape: SHAPE.SPARK, color: '#FFB347', intensity: 3, size: [0.05, 0.08], life: [0.3, 0.5],
        speed: [2.0, 4.0], dir: _up, spread: 1.2, gravity: 10, drag: 1.5, stretch: 4, fade: FADE.LINEAR, floor: true, bounce: 0.35 });
      this.particles.single(_p, { shape: SHAPE.SOFT, color: '#FFE0A8', intensity: 2.4, size0: 0.35, size1: 0.7, life: 0.1 });
    }
    if ((L.tinkT -= dt) <= 0) {
      L.tinkT = LINE.tinkEvery * (0.8 + this.rng() * 0.4);
      this._sparkPoint(_p);
      this.particles.single(_p, { shape: SHAPE.STAR8, color: '#FFF1C4', intensity: 2.6, size0: 0.15, size1: 0.6, life: 0.2, fade: FADE.POP, spin: 3 });
      this.particles.burst(_p, { additive: true, n: 3, shape: SHAPE.STAR4, color: '#FFE3A3', intensity: 2, size: [0.08, 0.14], sizeEnd: 0.3,
        life: [0.8, 1.2], speed: [0.2, 0.5], up: 0.6, spread: Math.PI, drag: 1.2, fade: FADE.TWINKLE });
    }
  }

  render(dt, time) {
    if (this.jeers.size) this._renderJeers(dt, time);
    if (this.thieves.size) this._renderThieves(dt, time);
    this._renderLine(dt, time);
  }

  clear() {
    this.jeers.clear(); this.thieves.clear(); this.hasLastThief = false;
    const L = this.line;
    L.active = false; L.pct = 0; L.frozen = false; L.done = false; L.hasSite = false; L.lastT = -99;
  }
}
