// src/fx/Beats.js  (owner: fx) — the feel-good moments (ART_WARM_SPEC §8.6, WARM_ADVENTURE_SPEC §5, AUTOCAM §13 fx
// beat twins), all on the EXISTING pools: Particles (2 draws), Marks (1 draw), HolyFX's arcs and ScreenFX. 0 new draws.
//   rescue      kitten:rescued {kittenId, position}: white-gold flash α 0.22 / 0.18 s; 60 confetti (#FF8FB1 #FFD84A
//               #8FD3FF #9BE3C4 #FFFFFF #C9A8FF, 3–5.5 m/s, gravity 3.2, drag 1.4, 1.6–2.2 s); +0.05 s 10 STAR5 #FFE066;
//               +0.15 s 8 HEART #FF6F9C rising 0.8 m/s; a pink ring 0 → 2.2 m in 0.35 s; then the kitten's sparkle trail
//               (10 STAR4 over 1.2 s along a Bézier toward the level exit / the hub). Also AUTOCAM's Cosy-beat twin (X24).
//   reveal      kitten:reveal: a STAR4 burst (the reveal beat twin).
//   arena clear arena:clear: SHAPE.CONFETTI petals drifting down over the arena (the exhale beat twin).
//   reward      reward {kind}: the WA §5.4 world burst at her for `card` / `friend` (60 confetti, 10 STAR5, 8 HEART,
//               the pink ring); `sticker` a small sparkle; in combat (an alerted enemy within CELEBRATE.safeR) only
//               the small sparkle (the card docks; ui owns the card and its flash).
//   hit spark   WA §5.1: 3 STAR4 #FFFFFF / #FFE066 + a #FFF6DA ring 0 → 0.6 m, 0.14 s (every hit on an enemy).
//   collect     WA §5.5: 4 STAR4 + 1 ring (pickups; the squash / hop / fly-to-HUD are world's and ui's).
//   twinkles    WA §3.2: pickups twinkle `#FFF1C4` every 1.2 ± 0.3 s (gold fish `#FFD57A` every 0.6 s), interactables a
//               white → mint STAR4 every 2.5 s (≤ 6 within 8 m) — Marks, deterministic phases, no particles.
//   knock-out   WA §5.7: player:died → 3 dizzy STAR4 orbiting her head (r 0.35 m, 2.5 rev/s) while she sits, then the
//               boing back: 6 HEART + a pink ring when she is up again (KO.sitT + KO.wipeT).
//   paw-bump / boop / cheer / ripple  small heart + star bursts for companions and her order taps.
// Low tier: every count ×0.5 and flat confetti (Particles.setTier). No allocation per frame (pooled jobs).
import * as THREE from 'three';
import { CELEBRATE, CLASS_MARKS, KO } from '../core/config.js';
import { SHAPE, FADE, GROW } from './Particles.js';
import { MARK } from './Marks.js';
import { CONFETTI_COLORS, FX_COLORS } from './palette.js';
import { actorWorldPos, headPoint, hash01, isActor } from './util.js';

/** ART §8.6 / WA §5 numbers (fx-owned). */
export const BEATS = Object.freeze({
  confetti: 60, confettiSpeed: [3, 5.5], confettiGravity: 3.2, confettiDrag: 1.4, confettiLife: [1.6, 2.2],
  stars: 10, starsAt: 0.05, star: '#FFE066', hearts: 8, heartsAt: 0.15, heartRise: 0.8, ringR: 2.2, ringT: 0.35,
  trail: 10, trailT: 1.2, trailLift: 3, revealStars: 12, petals: 40, petalColors: ['#FFC2D6', '#FFF1DC', '#FFD8E6', '#FFFFFF'],
  hitStars: 3, hitRing: 0.6, hitLife: 0.14, collectStars: 4, sticker: 6, flashGap: 0.5,
  pickupRange: 14, pickupMax: 20, twinkleT: 0.35, twinkleSize: 0.22,
});

/** Total particles of a rescue / card burst at a count scale (pure; unit-tested: must stay under the pool caps). */
export const burstParticleCount = (scale = 1) => ['confetti', 'stars', 'hearts'].reduce((s, k) => s + Math.max(1, Math.round(BEATS[k] * scale)), 0);

/**
 * Twinkle alpha 0..1 of a pickup / interactable at `time` (pure; unit-tested): one 0.35 s twinkle per `period`
 * (±30 % jitter from the seed), phase-shifted by the seed.
 */
export function twinkleAlpha(time, period, seed, len = BEATS.twinkleT) {
  const p = period * (0.75 + 0.5 * seed);
  const t = ((time + seed * p) % p + p) % p;
  return t < len ? Math.sin((t / len) * Math.PI) : 0;
}

/** Point on a quadratic Bézier a → c → b at u (written into out). */
function bezier(a, c, b, u, out) {
  const v = 1 - u;
  return out.set(v * v * a.x + 2 * v * u * c.x + u * u * b.x, v * v * a.y + 2 * v * u * c.y + u * u * b.y, v * v * a.z + 2 * v * u * c.z + u * u * b.z);
}

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color(), WHITE = new THREE.Color('#FFFFFF'), MINT = new THREE.Color(CLASS_MARKS.interact.color);
const TW = new THREE.Color(CLASS_MARKS.pickup.twinkle), TW_GOLD = new THREE.Color(CLASS_MARKS.pickup.gold), STARC = new THREE.Color(BEATS.star);

export class Beats {
  /** @param {any} ctx @param {{ particles: any, marks: any, holyFx: any, screen: any }} o */
  constructor(ctx, { particles, marks, holyFx, screen }) {
    this.ctx = ctx; this.particles = particles; this.marks = marks; this.holyFx = holyFx; this.screen = screen;
    /** delayed emissions: { t, kind, x, y, z, on } (pooled) */
    this.jobs = Array.from({ length: 24 }, () => ({ t: 0, kind: '', x: 0, y: 0, z: 0, on: false }));
    /** sparkle trails: { t, a, c, b, emit, on } */
    this.trails = Array.from({ length: 4 }, () => ({ t: 0, a: new THREE.Vector3(), c: new THREE.Vector3(), b: new THREE.Vector3(), emit: 0, on: false }));
    this.ko = { t: -1, popped: true };
    this._flashAt = -Infinity;
    this.counts = { rescues: 0, rewards: 0, reveals: 0, clears: 0, hitSparks: 0, collects: 0, kos: 0, respawns: 0, trails: 0 };
    this.twinkles = 0;          // twinkles drawn last frame (tests)
  }

  _time() { return this.ctx.game?.realTime ?? 0; }

  _later(sec, kind, pos) {
    const j = this.jobs.find((x) => !x.on);
    if (!j) return;
    j.t = sec; j.kind = kind; j.x = pos.x; j.y = pos.y; j.z = pos.z; j.on = true;
  }

  /** A screen flash at most once per 0.5 s from the beats (a rescue and its reward card arrive together). */
  _flash(kind) {
    const now = this._time();
    if (now - this._flashAt < BEATS.flashGap) return;
    this._flashAt = now;
    this.screen?.flash?.(kind);
  }

  _confetti(pos, n, S = 1) {
    const P = this.particles, per = Math.ceil(P.scaled(n) / CONFETTI_COLORS.length);
    for (const col of CONFETTI_COLORS) {
      P.burst(pos, { n: per, exact: true, shape: SHAPE.CONFETTI, color: col, size: [0.09 * S, 0.13 * S], life: BEATS.confettiLife,
        speed: BEATS.confettiSpeed, dir: _up, spread: 1.05, gravity: BEATS.confettiGravity, drag: BEATS.confettiDrag, spin: 9, fade: FADE.HOLD, jitter: 0.15 });
    }
  }

  _stars(pos, n, color = BEATS.star, S = 1) {
    this.particles.burst(pos, { additive: true, n, shape: SHAPE.STAR5, color, intensity: 1.9, size: [0.16 * S, 0.24 * S], sizeEnd: 0.5,
      life: [0.6, 0.9], speed: [2.0, 3.6], dir: _up, spread: 1.2, gravity: 4, drag: 1.4, spin: 7, fade: FADE.HOLD });
  }

  _hearts(pos, n, S = 1) {
    this.particles.burst(pos, { n, shape: SHAPE.HEART, color: FX_COLORS.heart, size: [0.18 * S, 0.26 * S], sizeEnd: 1.2, grow: GROW.BACK,
      fade: FADE.HOLD, life: [1.0, 1.4], speed: [0.3, 0.8], dir: _up, spread: 0.9, up: BEATS.heartRise, drag: 1.2, jitter: 0.3 * S });
  }

  _ring(pos, r, color = FX_COLORS.pink, life = BEATS.ringT, intensity = 1.1) {
    this.holyFx?.arc({ x: pos.x, y: pos.y + 0.06, z: pos.z, ring: true, r0: 0.1, r1: r, thick: 0.22, life: life + 0.15, grow: life, intensity, color });
  }

  /** ART §8.6 kitten rescue (and AUTOCAM's Cosy-beat twin). `pos` = the carrier / kitten (feet). */
  rescue(pos, to = null) {
    this.counts.rescues++;
    this._flash('rescue');
    _p.copy(pos); _p.y += 0.6;
    this._confetti(_p, BEATS.confetti);
    this._later(BEATS.starsAt, 'stars', _p);
    this._later(BEATS.heartsAt, 'hearts', _p);
    this._ring(pos, BEATS.ringR);
    this.trail(_p, to);
  }

  /** WA §5.4 reward world burst at her (`card` / `friend`; `sticker` = a small sparkle). */
  reward(kind) {
    const pl = this.ctx.player;
    if (!isActor(pl)) return;
    this.counts.rewards++;
    actorWorldPos(pl, _p); _p.y += (pl.height ?? 1) * 0.7;
    if (kind === 'sticker' || this._inCombat(pl)) {
      this.particles.burst(_p, { additive: true, n: BEATS.sticker, shape: SHAPE.STAR4, color: FX_COLORS.twinkle, intensity: 2.2, size: [0.12, 0.2], sizeEnd: 0.3,
        life: [0.5, 0.8], speed: [0.8, 1.8], spread: Math.PI, drag: 2, fade: FADE.TWINKLE, jitter: 0.2 });
      return;
    }
    const S = kind === 'friend' ? 1.2 : 1;
    this._confetti(_p, BEATS.confetti * S, S);
    this._stars(_p, BEATS.stars);
    this._later(BEATS.heartsAt, 'hearts', _p);
    actorWorldPos(pl, _q);
    this._ring(_q, BEATS.ringR * S);
  }

  /** Is there an alerted enemy within CELEBRATE.safeR of her (the card docks, the world stays calm)? */
  _inCombat(pl) {
    const list = this.ctx.enemies?.list, R = CELEBRATE.safeR ?? 15;
    if (!list) return false;
    for (const e of list) if (e?.alerted && e.alive !== false && e.pos && Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z) <= R) return true;
    return false;
  }

  /** The kitten-reveal beat twin: a white → gold STAR4 burst. */
  reveal(pos) {
    this.counts.reveals++;
    _p.copy(pos); _p.y += 0.7;
    this.particles.single(_p, { shape: SHAPE.STAR8, color: '#FFF1C4', intensity: 2.6, size0: 0.3, size1: 1.4, life: 0.3, fade: FADE.POP, spin: 2 });
    this.particles.burst(_p, { additive: true, n: BEATS.revealStars, shape: SHAPE.STAR4, color: '#FFE9A8', intensity: 2.4, size: [0.12, 0.22], sizeEnd: 0.3,
      life: [0.6, 1.0], speed: [1.0, 2.4], spread: Math.PI, drag: 2, fade: FADE.TWINKLE, jitter: 0.2 });
  }

  /** The arena-clear exhale twin: confetti petals drifting down over the arena (`r` its radius). */
  arenaClear(center, r = 6) {
    this.counts.clears++;
    const P = this.particles, n = P.scaled(BEATS.petals), cols = BEATS.petalColors;
    for (let k = 0; k < n; k++) {
      const a = hash01(k * 31 + 7) * Math.PI * 2, d = Math.sqrt(hash01(k * 17 + 3)) * Math.min(8, r);
      _p.set(center.x + Math.sin(a) * d, center.y + 3.5 + hash01(k * 5 + 1) * 1.5, center.z + Math.cos(a) * d);
      P.burst(_p, { n: 1, exact: true, shape: SHAPE.CONFETTI, color: cols[k % cols.length], size: [0.1, 0.14], life: [2.2, 3.0], speed: [0.1, 0.5],
        spread: Math.PI, gravity: 0.6, drag: 1.8, spin: 4, fade: FADE.HOLD });
    }
  }

  /** WA §5.1 hit spark: 3 STAR4 (#FFFFFF / #FFE066) + a #FFF6DA ring 0 → 0.6 m over 0.14 s. */
  hitSpark(pos, S = 1) {
    this.counts.hitSparks++;
    const P = this.particles;
    for (let k = 0; k < BEATS.hitStars; k++) {
      P.burst(pos, { additive: true, n: 1, exact: true, shape: SHAPE.STAR4, color: k & 1 ? BEATS.star : '#FFFFFF', intensity: 2.6, size: [0.18 * S, 0.26 * S], sizeEnd: 0.4,
        life: [0.22, 0.32], speed: [2.0, 3.2], spread: Math.PI, drag: 4, fade: FADE.POP });
    }
    P.single(pos, { shape: SHAPE.RING, color: FX_COLORS.goldCore, intensity: 1.6, size0: 0.05, size1: BEATS.hitRing * 2 * S, life: BEATS.hitLife, grow: GROW.OUT });
  }

  /** WA §5.5 collect: 4 STAR4 + 1 ring (gold fish: gold). */
  collect(pos, gold = false) {
    this.counts.collects++;
    const col = gold ? FX_COLORS.twinkleGold : FX_COLORS.twinkle;
    this.particles.burst(pos, { additive: true, n: BEATS.collectStars, shape: SHAPE.STAR4, color: col, intensity: 2.3, size: [0.12, 0.2], sizeEnd: 0.3,
      life: [0.35, 0.55], speed: [1.2, 2.2], spread: Math.PI, drag: 3, fade: FADE.TWINKLE });
    this.particles.single(pos, { shape: SHAPE.RING, color: col, intensity: 1.4, size0: 0.1, size1: 0.9, life: 0.22, grow: GROW.OUT });
  }

  /** The kitten's sparkle trail: 10 STAR4 over 1.2 s along a Bézier from `from` toward `to` (default: the exit / hub). */
  trail(from, to = null) {
    const T = this.trails.find((x) => !x.on);
    if (!T) return;
    this.counts.trails++;
    T.a.copy(from);
    if (to) T.b.copy(to);
    else {
      const ex = this.ctx.levels?.anchor?.('exit')?.pos ?? this.ctx.levels?.anchor?.('hub')?.pos ?? null;
      if (ex) { _q.subVectors(ex, from); _q.y = 0; const l = _q.length() || 1; T.b.copy(from).addScaledVector(_q, Math.min(6, l) / l); }
      else { const cp = this.ctx.camera?.position; _q.set(from.x - (cp?.x ?? from.x), 0, from.z - (cp?.z ?? from.z - 1)); const l = _q.length() || 1; T.b.copy(from).addScaledVector(_q, 5 / l); }
      T.b.y = from.y + BEATS.trailLift;
    }
    T.c.addVectors(T.a, T.b).multiplyScalar(0.5); T.c.y = Math.max(T.a.y, T.b.y) + 2;
    T.t = 0; T.emit = 0; T.on = true;
  }

  /** WA §5.7 knock-out: the dizzy sit (stars via FX.dizzyFor) and, once she is up again, the boing. */
  knockOut() {
    const pl = this.ctx.player;
    this.counts.kos++;
    this.ko.t = 0; this.ko.popped = false;
    if (isActor(pl)) this.ctx.fx?.dizzyFor?.(pl, KO.sitT + KO.wipeT, { r: KO.starR, rev: KO.starRev });
  }

  _respawnPop() {
    const pl = this.ctx.player;
    if (!isActor(pl)) return;
    this.counts.respawns++;
    actorWorldPos(pl, _p);
    this._ring(_p, 1.4);
    _p.y += (pl.height ?? 1) * 0.8;
    this._hearts(_p, KO.hearts ?? 6);
  }

  /** Small companion / tap beats: 'pawBump' (3 STAR4 + HEART), 'boop' (a HEART), 'cheer' (stars), 'ripple' (2 STAR4). */
  small(kind, pos) {
    const P = this.particles;
    switch (kind) {
      case 'pawBump':
        P.burst(pos, { additive: true, n: 3, shape: SHAPE.STAR4, color: '#FFF1C4', intensity: 2.2, size: [0.12, 0.18], sizeEnd: 0.3, life: [0.4, 0.6],
          speed: [0.8, 1.6], dir: _up, spread: 1.2, drag: 2.5, fade: FADE.TWINKLE });
        this._hearts(pos, 1, 0.8);
        break;
      case 'boop': this._hearts(pos, 1, 0.7); break;
      case 'cheer': this._stars(pos, 4, BEATS.star, 0.8); break;
      case 'ripple':
        P.burst(pos, { additive: true, n: 2, shape: SHAPE.STAR4, color: '#FFF1C4', intensity: 2.0, size: [0.1, 0.15], sizeEnd: 0.3, life: [0.3, 0.45],
          speed: [0.6, 1.2], dir: _up, spread: 1.3, drag: 3, fade: FADE.TWINKLE });
        break;
      default:
    }
  }

  /** Per frame (visual dt for jobs / trails; real time for twinkles and the knock-out clock). */
  render(dt, realDt) {
    for (const j of this.jobs) {
      if (!j.on) continue;
      if ((j.t -= dt) > 0) continue;
      j.on = false;
      _p.set(j.x, j.y, j.z);
      if (j.kind === 'stars') this._stars(_p, BEATS.stars);
      else if (j.kind === 'hearts') this._hearts(_p, BEATS.hearts);
    }
    for (const T of this.trails) {
      if (!T.on) continue;
      T.t += dt;
      const every = BEATS.trailT / BEATS.trail;
      while (T.emit < BEATS.trail && T.emit * every <= T.t) {
        bezier(T.a, T.c, T.b, Math.min(1, (T.emit * every) / BEATS.trailT), _p);
        this.particles.burst(_p, { additive: true, n: 1, exact: true, shape: SHAPE.STAR4, color: T.emit & 1 ? '#FFF1C4' : BEATS.star, intensity: 2.4,
          size: [0.16, 0.22], sizeEnd: 0.3, life: [0.5, 0.7], speed: [0.05, 0.2], drag: 2, fade: FADE.TWINKLE });
        T.emit++;
      }
      if (T.emit >= BEATS.trail) T.on = false;
    }
    // knock-out: the boing once she is alive again after the sit + wipe (player owns the timing)
    if (this.ko.t >= 0) {
      this.ko.t += realDt;
      const pl = this.ctx.player;
      if (!this.ko.popped && this.ko.t >= KO.sitT + KO.wipeT && pl?.alive !== false) { this.ko.popped = true; this._respawnPop(); }
      if (this.ko.popped || this.ko.t > KO.sitT + KO.wipeT + 3) this.ko.t = -1;
    }
    this._twinkles();
  }

  /** WA §3.2 twinkles over pickups (≤ 20 within 14 m) and interactables (≤ 6 within 8 m) — marks only. */
  _twinkles() {
    const ctx = this.ctx, pl = ctx.player, lv = ctx.levels?.current, M = this.marks;
    this.twinkles = 0;
    if (!pl?.pos || !lv || !M || ctx.game?.mode !== 'play') return;
    const time = this._time(), PK = CLASS_MARKS.pickup, I = CLASS_MARKS.interact;
    const items = lv.pickups?.items;
    if (items?.length) {
      let n = 0;
      for (let i = 0; i < items.length && n < BEATS.pickupMax; i++) {
        const it = items[i];
        if (!it?.alive || !it.pos || it.air) continue;
        if (Math.hypot(it.pos.x - pl.pos.x, it.pos.z - pl.pos.z) > BEATS.pickupRange) continue;
        const seed = hash01(((it.pos.x * 73) | 0) ^ ((it.pos.z * 151) | 0) ^ i);
        const a = twinkleAlpha(time, it.gold ? PK.goldEvery : PK.every, seed);
        if (a <= 0.01) continue;
        M.push(it.pos.x + (seed - 0.5) * 0.3, it.pos.y + 0.32, it.pos.z + (0.5 - seed) * 0.2, BEATS.twinkleSize * (0.7 + 0.5 * a), MARK.STAR4,
          it.gold ? TW_GOLD : TW, 2.4, a, time * 0.8);
        n++;
      }
      this.twinkles += n;
    }
    const ints = lv.interactables;
    if (ints?.length) {
      let n = 0;
      for (let i = 0; i < ints.length && n < (I.maxZones ?? 6); i++) {
        const it = ints[i];
        if (!it?.pos || (it.enabled && !it.enabled())) continue;
        if (Math.hypot(it.pos.x - pl.pos.x, it.pos.z - pl.pos.z) > (I.range ?? 8)) continue;
        n++;
        const seed = hash01(i * 97 + 13), a = twinkleAlpha(time, I.twinkleEvery ?? 2.5, seed, 0.45);
        if (a <= 0.01) continue;
        _c.copy(WHITE).lerp(MINT, Math.min(1, a * 1.4));
        M.push(it.pos.x, (it.pos.y ?? pl.pos.y) + 1.0, it.pos.z, 0.26 * (0.7 + 0.5 * a), MARK.STAR4, _c, 2.2, a, time);
        this.twinkles++;
      }
    }
  }

  clear() {
    for (const j of this.jobs) j.on = false;
    for (const T of this.trails) T.on = false;
    this.ko.t = -1; this.ko.popped = true;
  }
}

export { STARC as BEAT_STAR_COLOR };
