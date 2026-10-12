// src/camera/framing/Subjects.js  (owner: camera) — research/next/AUTOCAM_SPEC.md §6.2: the framing subjects.
// A Float32Array pool (stride 8 = [x, y, z, ρ, w, flags, class, ttl], max CAMERA.iso.framing.maxSubjects) keyed by the
// actor (or any object) it frames, so a subject keeps its slot from one 20 Hz gather to the next and its weight fades
// in over weightIn s and out over weightOut s (R6). Slot 0 is always her (hard, w 1). A fading subject counts as hard
// only while w ≥ hardMinW. Zero allocation after construction.
//
// `TelegraphTrack` (attach(bus, clock)) keeps the live `combat:telegraph` wind-ups aimed at her: THREAT subjects from
// `activeAt − windup` until `combat:telegraphEnd` + 0.3 s, plus the lane end point of boss lane / line telegraphs.
import { E } from '../../core/events.js';
import { CAMERA } from '../../core/config.js';
import { STRIDE, SX, SY, SZ, SR, SW, SF, SC, ST, F_HARD, F_SOFT, F_TOKEN, CLS } from './FramingSolver.js';

const FR = CAMERA.iso.framing;

export class Subjects {
  /** @param {number} [max] */
  constructor(max = FR.maxSubjects) {
    this.max = max;
    this.data = new Float32Array(max * STRIDE);
    /** the framed object per slot (null = free); slot 0 = her */
    this.keys = new Array(max).fill(null);
    /** target weight per slot (the weight eases toward it; 0 when not re-wanted this gather) */
    this.wt = new Float32Array(max);
    /** wanted as hard this gather */
    this.hardWant = new Uint8Array(max);
    this.seen = new Uint8Array(max);
    /** used slots are 0..n-1 (compacted on end()) */
    this.n = 1;
    /** a hard subject entered during the last gather (an immediate re-solve; hysteresis never holds it) */
    this.hardAdded = false;
    /** the engaged subjects counted this gather (crowd term) */
    this.nEngaged = 0;
    this.keys[0] = HER;
    this.data[SW] = 1; this.data[SF] = F_HARD; this.data[SC] = CLS.HER;
  }

  /** Her slot (feet + 0.4 m, ρ = framing.pad.her; reads her CAPSULE, never the visual bbox: WA5). */
  setHer(x, y, z, rho) { const d = this.data; d[SX] = x; d[SY] = y; d[SZ] = z; d[SR] = rho; d[SW] = 1; d[SF] = F_HARD; d[SC] = CLS.HER; }

  /** Start a gather: nothing is wanted yet. */
  begin() {
    for (let i = 1; i < this.n; i++) { this.seen[i] = 0; this.hardWant[i] = 0; }
    this.hardAdded = false; this.nEngaged = 0;
    return this;
  }

  /**
   * Want `key` as a subject this gather. An existing slot is updated (a higher-priority class wins); a new one starts
   * at w 0 (it fades in). Returns the slot or −1 when the pool is full.
   * @param {object} key @param {number} cls CLS.* @param {number} x @param {number} y vertical centre
   * @param {number} z @param {number} rho framing radius @param {number} w target weight @param {boolean} hard
   * @param {boolean} [token] holds an attack token (never dropped by the ladder)
   */
  want(key, cls, x, y, z, rho, w, hard, token = false) {
    if (!key) return -1;
    let i = this.indexOf(key);
    const d = this.data;
    if (i < 0) {
      if (this.n >= this.max) return -1;
      i = this.n++;
      this.keys[i] = key;
      const o = i * STRIDE;
      d[o + SW] = 0; d[o + SC] = cls; d[o + ST] = 0; d[o + SF] = 0;
      if (hard) this.hardAdded = true;
    } else if (this.seen[i] && d[i * STRIDE + SC] < cls) return i;       // already wanted this gather by a higher class
    else if (hard && !(d[i * STRIDE + SF] & F_HARD) && !this.hardWant[i]) this.hardAdded = true;
    const o = i * STRIDE;
    d[o + SX] = x; d[o + SY] = y; d[o + SZ] = z; d[o + SR] = rho; d[o + SC] = cls;
    this.wt[i] = w; this.hardWant[i] = hard ? 1 : 0; this.seen[i] = 1;
    d[o + SF] = (d[o + SF] & ~(F_TOKEN | F_SOFT)) | (token ? F_TOKEN : 0) | (hard ? 0 : F_SOFT);
    if (cls === CLS.ENGAGED) this.nEngaged++;
    return i;
  }

  /** Slot of `key` or −1. */
  indexOf(key) {
    for (let i = 1; i < this.n; i++) if (this.keys[i] === key) return i;
    return -1;
  }

  /**
   * End a gather and advance the weights by `dt`: wanted subjects ease to their target (weightIn), the rest fade out
   * (weightOut) and free their slot at 0. Hard = wanted hard and w ≥ hardMinW. Compacts the pool (keeps order).
   * @param {number} dt seconds since the last gather (0 = snap: weights jump to their targets)
   */
  end(dt, cfg = FR) {
    const d = this.data;
    let j = 1;
    for (let i = 1; i < this.n; i++) {
      const o = i * STRIDE, tgt = this.seen[i] ? this.wt[i] : 0;
      let w = d[o + SW];
      if (dt <= 0) w = tgt;
      else if (w < tgt) w = Math.min(tgt, w + (dt / Math.max(1e-3, cfg.weightIn)) * Math.max(1, tgt));
      else if (w > tgt) w = Math.max(tgt, w - (dt / Math.max(1e-3, cfg.weightOut)) * Math.max(1, this.wt[i]));
      d[o + SW] = w;
      const hard = this.seen[i] && this.hardWant[i] && w >= cfg.hardMinW;
      d[o + SF] = hard ? d[o + SF] | F_HARD : d[o + SF] & ~F_HARD;
      if (w <= 0 && !this.seen[i]) { this.keys[i] = null; continue; }
      if (j !== i) {
        for (let k = 0; k < STRIDE; k++) d[j * STRIDE + k] = d[o + k];
        this.keys[j] = this.keys[i]; this.keys[i] = null;
        this.wt[j] = this.wt[i]; this.seen[j] = this.seen[i]; this.hardWant[j] = this.hardWant[i];
      }
      j++;
    }
    this.n = j;
    return this;
  }

  /** Forget every subject but her. */
  clear() { for (let i = 1; i < this.max; i++) this.keys[i] = null; this.n = 1; this.nEngaged = 0; return this; }

  /** Number of hard subjects (her included). */
  hardCount() { let c = 0; for (let i = 0; i < this.n; i++) if (this.data[i * STRIDE + SF] & F_HARD) c++; return c; }

  /** Is any live THREAT (wind-up on her) or BOSS_LANE subject present (beats never run then)? */
  hasThreat() {
    for (let i = 1; i < this.n; i++) {
      const o = i * STRIDE, c = this.data[o + SC];
      if ((c === CLS.THREAT || c === CLS.LANE) && this.seen[i] && this.data[o + SW] > 0) return true;
    }
    return false;
  }
}

/** her slot key */
const HER = Object.freeze({ id: 'her' });

/** Max simultaneous wind-ups tracked. */
const MAX_TEL = 8;

/**
 * Live telegraphs aimed at her (THREAT) and boss lane ends (BOSS_LANE). Fixed slots, zero allocation per event.
 * `clock()` returns game time (s); `activeAt` is absolute game time (CONTROLS_SPEC §8.5).
 */
export class TelegraphTrack {
  constructor() {
    this.actor = new Array(MAX_TEL).fill(null);
    this.id = new Array(MAX_TEL).fill(null);
    this.t0 = new Float64Array(MAX_TEL);        // wind-up start (game s)
    this.t1 = new Float64Array(MAX_TEL);        // drop after (game s; Infinity until telegraphEnd)
    this.lane = new Uint8Array(MAX_TEL);        // has a lane end
    this.lx = new Float32Array(MAX_TEL); this.lz = new Float32Array(MAX_TEL); this.ly = new Float32Array(MAX_TEL);
    this.boss = new Uint8Array(MAX_TEL);
    this.player = null;
    /** set on every new wind-up: FollowCamera re-solves at once (a hard-subject add) */
    this.dirty = false;
    this._offs = [];
  }

  /**
   * Listen to combat:telegraph / combat:telegraphEnd. Returns an unsubscribe function list.
   * @param {any} bus @param {() => number} clock @param {() => any} player @param {() => any} boss
   */
  attach(bus, clock, player, boss) {
    if (!bus?.on) return this;
    this._offs.push(
      bus.on(E.TELEGRAPH, (p) => {
        if (!p) return;
        const isBoss = !!p.actor && p.actor === boss?.();
        const lane = (p.shape === 'lane' || p.shape === 'line') && p.end && Number.isFinite(p.end.x);
        const me = player?.();
        // THREAT: aimed at her (targetsPlayer, guaranteed by combat; also a telegraph whose target is her); boss lanes always
        const aimed = p.targetsPlayer === true || (me && p.target === me);
        if (!aimed && !(isBoss && lane)) return;
        const now = clock();
        const start = Number.isFinite(p.activeAt) ? p.activeAt - (Number.isFinite(p.windup) ? p.windup : 0) : now;
        this.add(p.id ?? p.actor, p.actor ?? null, Math.min(start, now), lane ? p.end : null, isBoss);
      }),
      bus.on(E.TELEGRAPH_END, (p) => this.end(p?.id, clock() + TEL_TAIL)),
    );
    return this;
  }

  detach() { for (const off of this._offs) off(); this._offs.length = 0; this.clearAll(); }

  /** Track a wind-up (the oldest slot is reused when full). */
  add(id, actor, t0, laneEnd, isBoss) {
    let s = -1, oldest = 0, ot = Infinity;
    for (let i = 0; i < MAX_TEL; i++) {
      if (this.id[i] === null) { s = i; break; }
      if (this.t0[i] < ot) { ot = this.t0[i]; oldest = i; }
    }
    if (s < 0) s = oldest;
    this.dirty = true;
    this.id[s] = id ?? actor; this.actor[s] = actor; this.t0[s] = t0; this.t1[s] = Infinity;
    this.boss[s] = isBoss ? 1 : 0;
    if (laneEnd) { this.lane[s] = 1; this.lx[s] = laneEnd.x; this.ly[s] = laneEnd.y ?? 0; this.lz[s] = laneEnd.z; } else this.lane[s] = 0;
  }

  /** combat:telegraphEnd: drop it at `at` (game s). */
  end(id, at) { for (let i = 0; i < MAX_TEL; i++) if (this.id[i] !== null && this.id[i] === id) this.t1[i] = Math.min(this.t1[i], at); }

  /** Free finished slots (game time `now`); a slot whose actor died is freed too. */
  prune(now) {
    for (let i = 0; i < MAX_TEL; i++) {
      if (this.id[i] === null) continue;
      const a = this.actor[i];
      // a wind-up that never got its telegraphEnd (the attacker was interrupted) expires TEL_MAX s after it began
      if (now > this.t1[i] || now - this.t0[i] > TEL_MAX || (a && (a.alive === false || a.dead))) this._free(i);
    }
  }

  /** Is slot i live at `now` (inside its wind-up window)? */
  live(i, now) { return this.id[i] !== null && now >= this.t0[i] && now <= this.t1[i]; }

  _free(i) { this.id[i] = null; this.actor[i] = null; this.lane[i] = 0; this.boss[i] = 0; }
  clearAll() { for (let i = 0; i < MAX_TEL; i++) this._free(i); }
  get size() { return MAX_TEL; }
}

/** THREAT leaves `combat:telegraphEnd` + this (s) (AUTOCAM §6.2). */
export const TEL_TAIL = 0.3;
/** a wind-up without a telegraphEnd expires after this (s). */
export const TEL_MAX = 4;
