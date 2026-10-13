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

/**
 * Warm look + perf + auto-camera numbers for this area (research/next: ART §5.1 / §5.4 / §7, WARM_ADVENTURE §3.2-§5.1,
 * §8.3, PERF §3.4 / §4.2-§4.3 / §7, AUTOCAM §6.6). `config.ENEMY_TUNING.warm` overrides them key by key (one level
 * deep) once core adopts the table (requests/core.md); until then these are the binding spec values.
 */
const WARM_DEFAULTS = {
  // ART §7.1 "faint and poof": squash flat (0.6 over 0.12 s), 3 dizzy stars for 0.5 s, then the puff and gone. Death
  // clips play 0.25 s at most. WA §8.3: the HATER plate flips to its friend word `plateFlip` s before the puff.
  faint: { squash: 0.6, squashT: 0.12, starsT: 0.5, stars: 3, clipMax: 0.25, plateFlip: 0.25, after: 0.05, lift: 0.15 },
  // WA §5.1 hitstop juice (unscaled time): uFlash 1 → 0 over the freeze + `flashTail`, Squash.kick(kick), a `shake` m
  // jitter at `shakeHz` while the world is frozen. Hits outside hitstop flash for `minFlash` s.
  hit: { flash: 1.0, flashTail: 0.06, minFlash: 0.12, kick: -2.0, shake: 0.04, shakeHz: 60 },
  // WA §3.2 / §3.4 motion language: wind-up squash −0.10, parry-window stretch +0.12 (eased in `ease` s);
  // hover boing (WA §3.6): Squash.kick(hoverKick) + the rim highlight
  pose: { windup: -0.10, parry: 0.12, ease: 0.08, hoverKick: -0.8 },
  // volume-preserving squash spring (sy = 1 + s): stiffness, damping, clamp
  spring: { k: 320, d: 16, min: -0.35, max: 0.35 },   // = characters SQUASH (k, c, clamp)
  // ART §5.1 wind-up rim: uHighlight = (TONE.telegraph, amount) from wind-up start to activeAt, then → 0 over `fade` s
  highlight: { color: '#FF8A3D', amount: 0.8, fade: 0.15, emissive: 0.35 },
  // PERF §4.2 / §4.3 activity tiers: perception rate per tier (Hz; arena-bound fights keep ≥ arenaMin), mixer cadence
  // per tier (1 = every frame, 3 = every 3rd frame with the accumulated dt, 0 = frozen)
  activity: { perceptHz: [10, 5, 2, 0], arenaMin: 5, mixEvery: [1, 3, 0, 0], legacyFar: 40 },
  // ART §5.4 hulls per QUALITY.outline: enemies 1.6 px, bosses 2.4 px; ≤ `maxEngaged` engaged enemies nearest-first on
  // Med; the hull fades in over `fadeIn` s; checked at `hz`
  outline: { px: 1.6, bossPx: 2.4, maxEngaged: 4, fadeIn: 0.2, hz: 4, engagedR: 14 },
  // PERF §1.2 triangle budget (lod.js): skinned bodies draw an index-simplified LOD (~`ratio` of the triangles within
  // `error` of the extent) on Low, and on Med / High beyond `far` m from the iso focus (± `hyst`) or in activity
  // tier ≥ 1; re-picked at `hz`. Outline hulls are simplified to `hullRatio`.
  lod: { far: 10, hyst: 0.75, ratio: 0.38, error: 0.025, hz: 4, hullRatio: 0.4 },
  // PERF §3.4 visual pool: prefill max(waveSize) per type under the veil (capped), pool sizes per type
  pool: { maxPerType: 8, prefillCap: 6 },
  // AUTOCAM §6.6 orbit penalty fallbacks (CAMERA.iso.framing.orbitPenalty wins): tokenless orbit slots scored by how
  // far down-screen past `free` m they sit, `k` per metre; `probe` candidate slots each side
  orbit: { k: 1.5, free: 3.0, probe: 2 },
  // ART §2.6 / §7.1: no near-black silhouettes. WA §3.1: Cacklejaw's P3 clones are playful light-lilac copies (marching
  // sparkle rim + wobble, his face kept, confetti pop); Barkus's cape stays plum ink
  boss: { cloneTint: '#B7A2E0', cloneSparkle: '#FFF1C4', cloneWobble: 0.06, cloneWobbleHz: 2.2, barkusCape: '#4A3A5E' },
};
const WOVR = ENEMY_TUNING.warm ?? {};
/** Warm-adventure / perf / auto-camera tuning (see WARM_DEFAULTS). */
export const WARM = Object.freeze(Object.fromEntries(Object.entries(WARM_DEFAULTS).map(([k, v]) => [k, Object.freeze({ ...v, ...(WOVR[k] ?? {}) })])));

/**
 * CONTROLS_SPEC §8.5 / §12 enemies (iso camera pacing). `config.ENEMY_TUNING.controls` overrides key by key once core
 * adopts it (requests/core.md). `xbowKeep` replaces ENEMIES.rat_xbow.keep [7, 11]: inside the 9 m "near" band, so a
 * crossbowman in its comfort band can always shoot and is on screen at the default zoom.
 */
export const CONTROLS = Object.freeze({ xbowKeep: [6, 9], ...(ENEMY_TUNING.controls ?? {}) });
