// src/enemies/tuning.js  (owner: enemies) — enemy/boss numbers that GAME_DESIGN states in prose (§8, §10, §11) but
// Appendix A doesn't carry. Since M2 the table lives in core/config.js as `ENEMY_TUNING` (enemies still own the
// values; nothing there overrides an Appendix A value); `TUNING` re-exports it so existing imports keep working.
//
// M2 additions (`M2`, below): core adopted them as `config.ENEMY_TUNING.m2` (the values below are the fallbacks and
// match it); `ENEMY_TUNING.m2` overrides them key by key.
import { ENEMY_TUNING } from '../core/config.js';
export const TUNING = ENEMY_TUNING;

const M2_DEFAULTS = {
  // objective runners (§12.6 The Line): path straight for the goal (the winch), fight only if she is this close
  runner: { fightWithin: 3, arrive: 1.4, hold: 0.6 },
  // hyena pack (§10.3): flankers circle to her back (the "behind" slot), giggle, then attack
  flank: { behindArc: 1.0, maxApproach: 3.0, keepMul: 0.9 },
  jeer: { packRadius: 16, maxFogContrib: 3, duetR: 10, duetDur: 3.0 },
  gloat: { laughVol: 0.9 },
  // spider (§10.3): web patches that slow her; the abdomen pulses during the web windup
  web: { maxPatches: 16, refresh: 0.25, cutRange: 0.6, cutArc: 1.2, fade: 0.6, pulse: 0.12 },
  // stealer (§10.3): getaway to the nearest fog edge; the loot drops in front of it
  stealer: { fogEdges: 8, snatchRecover: 0.4, dropSpread: 0.6, pinArrive: 1.6 },
  // pug (§10.3): shield; the raised-shield guard clip plays when it stands its ground near her
  pug: { guardWithin: 4.5, shieldBack: 0.5, slamBand: 0.5 },
  // Gloomjelly (§10.3): hop timing; squash anticipation; children pop out on a little arc
  jelly: { hopAir: 0.42, squash: 0.18, popUp: 4.0, wobble: 0.05, opacity: 0.66, wanderEvery: [1.5, 3.0] },
  // Pilfer's town chase (§12.5): anchors chase_0..5, 3 stumbles drop the bag, too far behind restarts it
  pilferChase: { anchors: 6, hits: 3, stumble: 0.6, tooFar: 25, lead: 7, waitLead: 12, arrive: 1.0, crates: [1, 3], letterEvery: 1.2 },
  // world requests: far pre-placed enemies sleep (no AI / mixer / draw); prewarm stand-ins for the shader warm-up
  sleep: { dist: 42, hysteresis: 4, every: 0.25 },
  prewarm: { ring: 2.5, timeout: 8000 },
  // bosses (§11.2-11.3)
  boss: {
    approachSlack: 0.3, wheelMount: 0.6, wheelLapGap: 0.45, wheelRideY: 1.45, wheelContact: 0.9, wheelArenaPad: 1.2,
    tossSpeed: 7, tossR: 0.45, tossLife: 6, bombSpread: 2.6, bombFly: 1.0, snackMinDist: 3.5,
    rushW: 2.4, rushPad: 1.0, quakeBand: 0.6, quakeHeight: 0.3, cloneRing: 4.5, laughEvery: [2.5, 4.0], meowQuiet: 2.0,
    cloneTint: '#1B1C24', p3FogDur: 2.0, hatPop: true, critBoost: 1.5,
  },
};

const OVR = ENEMY_TUNING.m2 ?? {};
/** M2 tuning: defaults merged (one level deep) with `config.ENEMY_TUNING.m2` once core adopts it. */
export const M2 = Object.freeze(Object.fromEntries(Object.entries(M2_DEFAULTS).map(([k, v]) => [k, Object.freeze({ ...v, ...(OVR[k] ?? {}) })])));

/** Seeded pick in [a, b] (rng = ctx.rng). */
export function rangeOf(rng, v) {
  if (!Array.isArray(v)) return v;
  return v[0] + (v[1] - v[0]) * rng();
}
