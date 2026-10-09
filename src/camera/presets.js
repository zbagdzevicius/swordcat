// src/camera/presets.js  (owner: camera) — GAME_DESIGN §5.2 camera presets + the pure helpers they use.
//
// Placements are in the ANCHOR'S LOCAL FRAME: the anchor faces +Z, feet at the origin, +X is the anchor's
// LEFT (three.js right-handed, +Y up; yaw = atan2(dir.x, dir.z), positive = turn left).
// `pos` / `look` / `to` / `lookTo` are [x, y, z] in that frame. `fov` is the vertical FOV in degrees (a number,
// or [from, to] animated over `dur`). `kind` picks the CutsceneCamera behaviour when a cutscene step gives no
// `mode`: 'static' (cut), 'rail' (pos → to, or along a `path` of level anchors), 'orbit', 'whipfall'.
// Every field can be overridden by the cutscene `cam` step (§5.1): pos, look, fov, roll, noise, dur, ease, ...
import { PLAYER } from '../core/config.js';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

/** Meme Cam loop period (s): the viral clip's length (PLAYER.memeCam.loop = 3.8). */
export const MEME_PERIOD = PLAYER.memeCam.loop;

export const PRESETS = Object.freeze({
  /** [TREND V1] Chest-up medium close-up, slightly low, static. Handheld sway 0.005 m. Loop 3.8 s.
   *  Tuned against research/videos/frames/x_GeckoTerminal_*_f1-f3: she fills ~1/3 of the frame height, the sword
   *  tip stands well above her head, both gauntlets / pauldrons / the cape edges are in frame, the belt sits on the
   *  bottom edge. */
  MEME_LOOP: Object.freeze({ kind: 'static', pos: [0.06, 0.68, 1.9], look: [0.03, 0.9, 0], fov: 38, sway: 0.005, loop: MEME_PERIOD }),
  /** [V2] Low over-the-shoulder from behind her, cape in the foreground, looking along her facing at 25 m. */
  REVERSE_HORDE: Object.freeze({ kind: 'static', pos: [0.35, 0.55, -1.4], look: [0, 0.6, 25], fov: 38 }),
  /** [V5] From MEME_LOOP, dolly to (0, 4.0, 14) over 6.0 s, FOV 38 → 50, ease in-out sine. `lookTo` lifts the
   *  framing so a giant behind her (Tallbert, the kittens of CS-08) is revealed above her head. */
  PULLBACK: Object.freeze({ kind: 'rail', pos: [0.06, 0.68, 1.9], look: [0.03, 0.9, 0], to: [0, 4.0, 14], lookTo: [0, 1.6, -1.0],
    dur: 6.0, fov: Object.freeze([38, 50]), ease: 'inOutSine',
    /** CS-08 rail shape: a dolly that stays low for the first half and cranes up at the end (quadratic Bézier through
     *  this anchor-local control point), so the kittens rows behind her rise into view instead of being looked down on */
    via: Object.freeze([0.04, 1.1, 9.0]),
    /** the rail never passes through solid architecture between her and the lens (pulled in like the spring arm) */
    collide: true }),
  /** [V3] Facing her, roll 6°, handheld noise 0.015 m; her gauntlet edge in frame. */
  SELFIE: Object.freeze({ kind: 'static', pos: [0.25, 0.92, 0.45], look: [0, 0.82, 0], fov: 50, roll: 6 * DEG, noise: 0.015 }),
  /** [V3] From the current shot: yaw +120° in 0.18 s with FOV +15, then roll 90° and drop to y 0.12 over 0.35 s. */
  WHIP_FALL: Object.freeze({ kind: 'whipfall', fov: Object.freeze([50, 65]), dur: 0.53,
    whip: Object.freeze({ yaw: 120 * DEG, dur: 0.18, fovAdd: 15 }),
    fall: Object.freeze({ roll: 90 * DEG, y: 0.12, dur: 0.35 }) }),
  /** Establishing shots along a `path` of level anchors (CatmullRom). Without a path: a 6 m crane down onto the anchor. */
  CRANE_DOWN: Object.freeze({ kind: 'rail', pos: [0, 6, 8], to: [0, 1.6, 4.5], look: [0, 0.8, 0], fov: 40, dur: 8, ease: 'inOutSine' }),
  /** Extreme close-up: trembling eyes, glisten. */
  ECU_EYES: Object.freeze({ kind: 'static', pos: [0, 0.79, 0.35], look: [0, 0.79, 0], fov: 25 }),
  /** Kneels and talks at her eye height; looks at the midpoint of the anchor and `target` at y 0.75. */
  TWO_SHOT_LOW: Object.freeze({ kind: 'static', pos: [1.6, 0.75, 1.6], look: [0, 0.75, 0], lookMid: 0.75, fov: 35 }),
  /** Looks up at her: the scale contrast. */
  HERO_LOW: Object.freeze({ kind: 'static', pos: [0.8, 0.35, 2.2], look: [0, 0.9, 0], fov: 40 }),
  /** Orbits the anchor (Pudding) at r 9, h 2, 8°/s. Starts at `pos` (its angle in the anchor frame). */
  FLIGHT_ORBIT: Object.freeze({ kind: 'orbit', pos: [9, 2, 0], look: [0, 1.5, 0], fov: 45, orbit: Object.freeze({ r: 9, h: 2, degPerSec: 8 }) }),

  // ---- M2 additions (Acts I–II cutscenes; the §5 tables name these framings in words) -------------------------
  /** "wide": the group / the place, from the front-left, a little above head height (CS-04 #4, CS-07 #4, CS-09 #6,
   *  CS-10 #1). */
  WIDE: Object.freeze({ kind: 'static', pos: [3.2, 2.4, 8.5], look: [0, 0.9, 0], fov: 45 }),
  /** "medium": knees-up of the anchor at her eye level, slightly off-axis (CS-06 #1 / #5, CS-10 #5). */
  MEDIUM: Object.freeze({ kind: 'static', pos: [0.55, 0.85, 2.4], look: [0, 0.7, 0], fov: 40 }),
  /** "two-shot" standing: anchor and `target` side by side, the look at their midpoint (CS-06 #2, CS-10 #5). */
  TWO_SHOT: Object.freeze({ kind: 'static', pos: [2.2, 1.15, 2.6], look: [0, 0.8, 0], lookMid: 0.8, fov: 38 }),
  /** "low, from behind her, looking up": cape and ears in the foreground, something big ahead and above (the dark
   *  Sunbell in CS-07 #3, Pudding rising over the gatehouse in CS-09 #4: pass `look: '<anchor or actor>'`). */
  LOW_BEHIND: Object.freeze({ kind: 'static', pos: [0.45, 0.3, -1.5], look: [0, 3.5, 20], fov: 50 }),
  /** "slow push-out" (CS-04 #5): drifts back and up from a close framing, 6 s. */
  PUSH_OUT: Object.freeze({ kind: 'rail', pos: [0.3, 1.0, 2.6], to: [0.9, 2.8, 8.0], look: [0, 0.6, 0], lookTo: [0, 0.4, -0.5],
    dur: 6.0, fov: Object.freeze([38, 42]), ease: 'inOutSine' }),
  /** ECU of the planted blade (CS-09 #3 "then an ECU of the blade"): the shard sinking in, hilt at her chest. */
  ECU_BLADE: Object.freeze({ kind: 'static', pos: [0.18, 0.72, 0.8], look: [0, 0.6, 0.28], fov: 28 }),
  /** Boss reveal: low and to the side in front of the boss (anchor = the boss id); placements scale with its height
   *  (`scale: 'height'`), so it frames a 1.6 m rat captain and a 2.2 m warchief alike. */
  BOSS_INTRO: Object.freeze({ kind: 'static', pos: [0.9, 0.3, 2.0], look: [0, 0.72, 0], fov: 42, scale: 'height' }),
});

export const PRESET_NAMES = Object.freeze(Object.keys(PRESETS));

/**
 * Anchor-local [x, y, z] → world, for an anchor at `origin` (feet) facing `yaw`. Writes into `out`.
 * Rotation about +Y by yaw: local +Z → (sin yaw, 0, cos yaw) (forward), local +X → (cos yaw, 0, -sin yaw) (her left).
 * @param {ArrayLike<number>} local @param {{x:number,y:number,z:number}} origin @param {number} yaw @param {any} out
 */
export function localToWorld(local, origin, yaw, out) {
  const c = Math.cos(yaw), s = Math.sin(yaw), x = local[0], y = local[1] ?? 0, z = local[2] ?? 0;
  out.x = origin.x + x * c + z * s;
  out.y = origin.y + y;
  out.z = origin.z - x * s + z * c;
  return out;
}

/** World point → anchor-local (inverse of localToWorld). Writes {x,y,z} into `out`. */
export function worldToLocal(p, origin, yaw, out) {
  const c = Math.cos(yaw), s = Math.sin(yaw), dx = p.x - origin.x, dz = p.z - origin.z;
  out.x = dx * c - dz * s;
  out.y = p.y - origin.y;
  out.z = dx * s + dz * c;
  return out;
}

/**
 * Seamless Meme Cam sway: integer harmonics of 1/period only, so sway(t) === sway(t + period) exactly.
 * Each axis peaks at roughly `amp` (metres). Writes {x, y, z} into `out`.
 * @param {number} t @param {number} period @param {number} amp @param {{x:number,y:number,z:number}} out
 */
export function memeSway(t, period, amp, out) {
  const w = TAU / period;
  out.x = amp * (0.62 * Math.sin(w * t + 0.4) + 0.38 * Math.sin(2 * w * t + 1.9));
  out.y = amp * (0.55 * Math.sin(w * t + 2.3) + 0.30 * Math.sin(3 * w * t + 0.7) + 0.15 * Math.sin(2 * w * t + 4.1));
  out.z = amp * (0.70 * Math.sin(w * t + 4.0) + 0.30 * Math.sin(2 * w * t + 5.2));
  return out;
}

/**
 * Smooth handheld noise (sum of incommensurate sines, ~0.3–1.3 Hz), roughly ±`amp` per axis. Writes into `out`.
 * @param {number} t seconds @param {number} amp metres @param {{x:number,y:number,z:number}} out @param {number} [seed]
 */
export function handheld(t, amp, out, seed = 0) {
  const s = seed * 1.7;
  out.x = amp * (0.55 * Math.sin(t * 2.1 + 0.3 + s) + 0.30 * Math.sin(t * 5.3 + 1.7 + s) + 0.15 * Math.sin(t * 8.9 + 4.2));
  out.y = amp * (0.50 * Math.sin(t * 1.7 + 2.1 + s) + 0.35 * Math.sin(t * 4.4 + 0.6) + 0.15 * Math.sin(t * 7.7 + 3.3 + s));
  out.z = amp * (0.60 * Math.sin(t * 1.3 + 5.0) + 0.40 * Math.sin(t * 3.7 + 2.2 + s));
  return out;
}
