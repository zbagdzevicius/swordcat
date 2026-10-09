// src/enemies/types/hyenaStates.js  (owner: enemies) — the Snickerpack's shared behaviours (GAME_DESIGN §10.3):
//   gloat   after it lands any hit on her it laughs (`Cheer`) for def.gloat.dur s and doesn't attack; a hit during the
//           gloat chokes it ("hrk!": stagger, enemy:choke → +10 Valor) — `onHitWhile: { gloat: 'choke' }`
//   jeer    0.5 s head-throw (purple `jeer` rings), then an aura r 8 for 2.0 s: enemy:jeer {on} (the player drains
//           −6 Valor/s outside the Stand, +10/s Standing Ground inside it), fog +0.01 (at most +0.03 in total). One
//           jeerer per pack at a time, a 12 s cooldown per hyena, only when she is within 10 m. A hit chokes it.
//   giggle  pack flanking: the 2nd and later hyenas take the "behind" slot, circle to her back and giggle 0.6 s
//           before their windup.
// Stealers reuse gloat-less jeer for the B2 "Jeer Duet" (aura r 10 for 3 s).
import { E } from '../../core/events.js';
import { wrapAngle } from '../../core/math.js';
import { TUNING, M2 } from '../tuning.js';

/** Jeer numbers for `e` (its own override: the stealers' duet; else the hyena row). */
export function jeerCfg(e) {
  return e.jeerOverride ?? e.def.jeer ?? null;
}

/** Gloat length (hyena row `gloat.dur`, Cacklejaw's `gloat` number). */
export function gloatDur(e) {
  const g = e.def.gloat;
  return typeof g === 'number' ? g : (g?.dur ?? 1.0);
}

/**
 * May `e` start a Jeer now? Its cooldown is over, she is within `onlyWithin`, and no pack-mate (an enemy within
 * M2.jeer.packRadius) is jeering. Pure over the enemies list; exported for tests.
 */
export function canJeer(e, list = e.ctx.enemies?.list ?? []) {
  const J = jeerCfg(e);
  if (!J || !e.alive || e.scripted || !e.ai || (e.attackCd.jeer ?? 0) > 0) return false;
  const p = e.targetActor();
  if (!p || p !== e.ctx.player) return false;
  if (e.distToPlayer() > (J.onlyWithin ?? J.r ?? 8)) return false;
  const R = M2.jeer.packRadius, max = J.maxPerPack ?? 1;
  let n = 0;
  for (const o of list) {
    if (o === e || !o.alive || o.stateName !== 'jeer') continue;
    if (Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) <= R && ++n >= max) return false;
  }
  return true;
}

/** Fog keys of the jeers currently contributing (shared across every pack: §10.3 "max +0.03 total"). */
const fogKeys = new Set();
export function jeerFogCount() { return fogKeys.size; }

function jeerOn(e) {
  if (e.jeering) return;
  const J = jeerCfg(e);
  e.jeering = true;
  e.jeerR = J.r;
  e.ctx.bus.emit(E.ENEMY_JEER, { enemy: e, on: true });
  const key = `jeer:${e.id}`;
  if (J.fogAdd && fogKeys.size < M2.jeer.maxFogContrib && e.ctx.env?.contribute) {
    fogKeys.add(key);
    e.ctx.env.contribute(key, { fogAdd: J.fogAdd });
  }
}

/** End the aura (idempotent): enemy:jeer {on: false}, the fog contribution goes. */
export function jeerOff(e) {
  if (!e.jeering) return;
  e.jeering = false;
  e.ctx.bus.emit(E.ENEMY_JEER, { enemy: e, on: false });
  const key = `jeer:${e.id}`;
  if (fogKeys.delete(key)) e.ctx.env?.clear?.(key);
}

export const GLOAT = {
  attacking: true,                                         // a cutscene start (Enemy.interrupt) drops it
  anim: () => ['gloat', { loop: true }],
  enter(e) {
    e.endTelegraph(); e.swing = null; e.followUp = null; e.releaseToken(); e.attack = null;
    e.gloatPending = false;
    e.brakeHard();
    e.head?.setExpression?.('laugh');
    e.ctx.audio?.laugh?.(e.pos, { volume: M2.gloat.laughVol, rate: e.def.boss ? 0.85 : 1.1 });
  },
  update(e, dt) {
    e.brake(dt);
    const p = e.targetActor();
    if (p) e.faceTo(p.pos, dt, TUNING.turnRate * 0.5);
    if (e.stateT >= gloatDur(e)) { e.cooldownT = Math.max(e.cooldownT, 0.3); e.setState(p ? 'chase' : 'return'); }
  },
  exit(e) { e.head?.setExpression?.(e.def.expression ?? 'sneer'); },
};

export const JEER = {
  attacking: true,                                         // a cutscene start (Enemy.interrupt) drops it
  anim: () => ['jeer', { loop: true }],
  enter(e) {
    const J = jeerCfg(e);
    e.endTelegraph(); e.swing = null; e.releaseToken(); e.attack = null;
    e.brakeHard();
    e.attackCd.jeer = J.cooldown ?? 12;
    e.jeering = false;
    e.head?.setExpression?.('laugh');
    // the head-throw: purple sound-wave rings around it for the windup + the aura
    e.telegraph('jeer', { shape: 'rings', pos: e.pos, r: J.r, size: J.r, duration: (J.windup ?? 0.5) + (J.dur ?? 2), follow: true });
  },
  update(e, dt) {
    const J = jeerCfg(e);
    e.brake(dt);
    const p = e.targetActor();
    if (p) e.faceTo(p.pos, dt, TUNING.turnRate * 0.5);
    if (!e.jeering && e.stateT >= (J.windup ?? 0.5)) jeerOn(e);
    if (e.stateT >= (J.windup ?? 0.5) + (J.dur ?? 2)) { e.jeerOverride = null; e.setState(p ? 'chase' : 'return'); }
  },
  exit(e) { jeerOff(e); e.endTelegraph(); e.head?.setExpression?.(e.def.expression ?? 'sneer'); },
};

/** The flanker's pre-attack giggle (0.6 s), then its windup. */
export const GIGGLE = {
  attacking: true,                                         // a cutscene start (Enemy.interrupt) drops it
  anim: () => ['idle', null],
  enter(e) {
    e.brakeHard();
    e.head?.setExpression?.('laugh');
    e.squashT = TUNING.squash.dur;
    e.ctx.audio?.laugh?.(e.pos, { volume: 0.5, rate: 1.5 });
  },
  update(e, dt) {
    e.brake(dt);
    const p = e.targetActor();
    if (!p) { e.releaseBehind(); return e.setState('return'); }
    e.faceTo(p.pos, dt, TUNING.turnRate);
    if (e.stateT >= (e.def.flank?.giggleLead ?? 0.6)) {
      const atk = e.pendingAttack; e.pendingAttack = null;
      e.head?.setExpression?.(e.def.expression ?? 'sneer');
      if (atk && e.hasToken()) e.beginAttack(atk); else e.setState('chase');
    }
  },
};

/**
 * Pack flank: a hyena granted a token while another enemy already holds a melee token takes the manager's "behind"
 * slot (one at a time) and approaches her back. Returns the approach point into `out` (true) or false (front).
 */
export function flankPoint(e, p, keep, out) {
  if (!e.def.flank) return false;
  const mgr = e.ctx.enemies;
  if (!e.flanker) {
    const tokens = e.ctx.combat?.tokens;
    let others = 0;
    if (tokens?.holders) for (const a of tokens.holders('melee')) if (a !== e && a.alive) others++;
    if (others < 1 || !mgr?.claimBehind?.(e)) return false;
    e.flanker = true; e.flankAt = e.ctx.game?.time ?? 0;
  }
  const back = (p.facing ?? 0) + Math.PI, r = keep * M2.flank.keepMul;
  // circle round her (not through her): head for the side point first while we're in front
  const cur = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
  const off = wrapAngle(cur - back);
  const a = Math.abs(off) > 1.2 ? cur - Math.sign(off) * 0.9 : back;
  out.set(p.pos.x + Math.sin(a) * Math.max(r, 1.2), 0, p.pos.z + Math.cos(a) * Math.max(r, 1.2));
  return true;
}

/** Is `e` behind her (within M2.flank.behindArc of her back)? */
export function isBehind(e, p) {
  const back = (p.facing ?? 0) + Math.PI, cur = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
  return Math.abs(wrapAngle(cur - back)) <= M2.flank.behindArc;
}
