// src/enemies/moves.js  (owner: enemies) — building blocks for multi-step enemy / boss moves (GAME_DESIGN §11):
//   - CHAIN_STATE: a combo of melee steps (Sabre Flurry, Cackle Combo). Each step's glint shows for at least its §8.1
//     minimum lead (parry 0.45 s, gold 0.6 s) even when the step's own windup is shorter (0.30 s): the next glint
//     starts during the previous strike, as rat_poke2 does.
//   - lane maths (pillars, arena walls) and the expanding ground ring (Laugh Quake, pug_slam).
// Pure helpers are exported for tests.
import { TELEGRAPH } from '../core/config.js';
import { TUNING } from './tuning.js';

/** §8.1 minimum lead for a telegraph kind (≥ the §10.1 0.45 s floor). */
export function minLead(kind) { return Math.max(TUNING.windupMin, TELEGRAPH.minLead[kind] ?? TUNING.windupMin); }

/**
 * Attack defs for a chain move (`{ chain: [{ atk, telegraph, windup, dmg, range, arc, clip? }] }`), cached on the move.
 * Each step becomes a full attack def Combat can swing: arc (range, ±arc rad, height `h`), dmg, knock, poise.
 * @param {any} move @param {string} moveId @param {number} h attacker height (swing band)
 */
const _stepCache = new WeakMap();
export function chainSteps(move, moveId, h) {
  const key = `${moveId}@${h}`;
  let byKey = _stepCache.get(move);
  if (byKey?.has(key)) return byKey.get(key);
  const steps = (move.chain ?? []).map((c, i) => Object.freeze({
    id: c.atk ?? `${moveId}${i + 1}`, telegraph: c.telegraph ?? 'parry', windup: c.windup ?? 0.5, dur: c.dur ?? 0.42,
    active: c.active ?? [0, 0.13],
    arc: { range: c.range ?? 2, from: c.arc ?? 1.0, to: -(c.arc ?? 1.0), y0: 0, y1: Math.max(1.2, h * 0.8) },
    dmg: c.dmg ?? 1, knock: c.knock ?? 4, poise: c.poise ?? 2, lunge: c.lunge ?? 2.5, recover: c.recover ?? move.recover ?? 0.8,
    unblockable: c.telegraph === 'red', goldStagger: c.goldStagger, clip: c.clip,
  }));
  if (!byKey) _stepCache.set(move, (byKey = new Map()));
  byKey.set(key, steps);
  return steps;
}

/**
 * When, inside step i's strike of length `dur`, the next step's glint must start so it shows `lead` seconds before
 * that step strikes, given its own (scaled) windup `w`: returns [startAt (s into the strike), the next windup].
 * Pure; exported for tests.
 */
export function preTell(dur, lead, w) {
  const pre = Math.max(0, lead - w);                // glint time the windup alone can't cover
  const at = Math.max(0, dur - pre);
  return [at, Math.max(w, lead - (dur - at))];
}

/** Combo state: windup → strike per step, then `recover`. Types put it under `states.<moveId>` with `attacking`. */
export const CHAIN_STATE = {
  attacking: true,
  anim: (e) => (e.chainPhase === 'windup' ? ['windup', { once: true, clampEnd: true, fitDur: e.chainW }] : ['strike', { once: true, clampEnd: true }]),
  enter(e) {
    const move = e.attackDef?.(e.chainMoveId = e.attack?.id) ?? e.attack?.def;
    e.chainSteps = chainSteps(move?.chain ? move : { chain: [] }, e.chainMoveId, e.height);
    if (!e.chainSteps.length) { e.setState('recover'); return; }
    e.chainTold = -1;
    chainStart(e, 0);
  },
  update(e, dt) {
    const s = e.chainSteps[e.chainIdx];
    if (!s) return;
    e.chainT += dt;
    const p = e.targetActor();
    if (e.chainPhase === 'windup') {
      e.brake(dt);
      if (p && e.chainT < e.chainW - TUNING.windupTrackStop) e.faceTo(p.pos, dt, TUNING.windupTurnRate);
      if (e.chainT >= e.chainW) {
        e.endTelegraph();                                 // §19.4: the glint ends on the strike
        e.swing = e.ctx.combat.beginSwing(e, s);
        e.chainPhase = 'strike'; e.chainT = 0; e._animSerial++;
      }
      return;
    }
    // strike
    if (e.swing) e.ctx.combat.updateSwing(e.swing, dt);
    const [a0, a1] = s.active;
    if (s.lunge && e.chainT >= a0 && e.chainT <= a1 + 0.05) { e.vel.x = Math.sin(e.facing) * s.lunge; e.vel.z = Math.cos(e.facing) * s.lunge; }
    else e.brake(dt, 8);
    const next = e.chainSteps[e.chainIdx + 1];
    if (next && e.chainTold !== e.chainIdx + 1 && e.chainT > a1) {
      const lead = minLead(next.telegraph), w = Math.max(0.05, next.windup * e.windupMul());
      const [at] = preTell(s.dur, lead, w);
      if (e.chainT >= at) {
        const left = Math.max(0, s.dur - e.chainT);
        e.telegraph(next.telegraph, { duration: left + Math.max(w, lead - left) });
        e.chainTold = e.chainIdx + 1; e.chainShown = left;      // glint seconds already shown when its windup begins
      }
    }
    if (e.chainT >= s.dur) {
      e.swing = null;
      if (next) chainStart(e, e.chainIdx + 1);
      else { e.attack = { id: s.id, def: s, range: s.arc.range, kind: 'melee' }; e.setState(e.gloatPending && e.states.gloat ? 'gloat' : 'recover'); }
    }
  },
  exit(e) { e.swing = null; },
};

function chainStart(e, i) {
  const s = e.chainSteps[i];
  e.chainIdx = i; e.chainPhase = 'windup'; e.chainT = 0; e._animSerial++;
  e.attack = { id: s.id, def: s, range: s.arc.range, kind: 'melee', move: e.chainMoveId };
  const lead = minLead(s.telegraph), w = Math.max(0.05, s.windup * e.windupMul());
  if (e.chainTold === i && e.telegraphId != null) { e.chainW = Math.max(w, lead - (e.chainShown ?? 0)); return; }
  e.chainW = Math.max(lead, w);
  e.telegraph(s.telegraph, { duration: e.chainW });
  e.chainTold = i;
}

// ------------------------------------------------------------------ geometry
/**
 * Distance along the ray (ox, oz) + t·(dx, dz) (unit) to the first circle {x, z, r} it hits (grown by `pad`), or
 * Infinity. Pure; exported for tests.
 */
export function rayCircle(ox, oz, dx, dz, c, pad = 0) {
  const fx = ox - c.x, fz = oz - c.z, R = (c.r ?? 0) + pad;
  const b = fx * dx + fz * dz, cc = fx * fx + fz * fz - R * R;
  if (cc <= 0) return 0;                                  // starts inside
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : Infinity;
}

/** Distance along a ray from inside a circle (centre c, radius R) to its rim. Pure. */
export function rayExitCircle(ox, oz, dx, dz, cx, cz, R) {
  const fx = ox - cx, fz = oz - cz, b = fx * dx + fz * dz, cc = fx * fx + fz * fz - R * R;
  const disc = b * b - cc;
  if (disc < 0) return 0;
  return Math.max(0, -b + Math.sqrt(disc));
}

/** Distance along a ray from inside an axis-aligned rectangle (centre, half sizes) to its edge. Pure. */
export function rayExitRect(ox, oz, dx, dz, cx, cz, hw, hd) {
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (cx + hw - ox) / dx); else if (dx < -1e-6) t = Math.min(t, (cx - hw - ox) / dx);
  if (dz > 1e-6) t = Math.min(t, (cz + hd - oz) / dz); else if (dz < -1e-6) t = Math.min(t, (cz - hd - oz) / dz);
  return Math.max(0, t);
}

/**
 * A charge lane from (ox, oz) along unit (dx, dz): stops at the first pillar (circle grown by `pad`) or at the arena
 * edge (circle {cx, cz, r} or rect {cx, cz, hw, hd}) minus `edgePad`, capped at `max`.
 * Returns { len, pillar } (pillar = the circle it ends at, or null). Pure; exported for tests.
 */
export function laneTo(ox, oz, dx, dz, { pillars = [], pad = 0, arena = null, edgePad = 0, max = Infinity } = {}) {
  let len = max, pillar = null;
  if (arena) {
    const edge = arena.hw != null ? rayExitRect(ox, oz, dx, dz, arena.cx, arena.cz, arena.hw, arena.hd) : rayExitCircle(ox, oz, dx, dz, arena.cx, arena.cz, arena.r);
    len = Math.min(len, Math.max(0, edge - edgePad));
  }
  for (const c of pillars) {
    const t = rayCircle(ox, oz, dx, dz, c, pad);
    if (t < len) { len = t; pillar = c; }
  }
  return { len, pillar };
}

/**
 * Expanding ground ring (Laugh Quake, pug_slam): radius after `t` s at `speed` m/s, capped at `rMax`, and the hit band
 * [inner, r] of width `band`. Pure.
 */
export function ringAt(t, speed, rMax, band) {
  const r = Math.min(rMax, Math.max(0, t * speed));
  return { r, inner: Math.max(0, r - band), done: r >= rMax };
}
