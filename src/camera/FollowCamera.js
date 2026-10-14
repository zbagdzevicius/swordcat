// src/camera/FollowCamera.js  (owner: camera) — ctx.cam (GAME_DESIGN §19.3 frozen contract + additions):
//   mode(name, opts)          'follow' | 'lock' ({ target }) | 'boss' | 'meme' | 'preset' ({ preset, anchor, ... }) | 'cutscene'
//                             opts.blend (s) = transition time (defaults: cutscene handback 0.6, Meme Cam 2.0 in / 0.6 out)
//   preset(name, anchor, opts) §5.2 framing relative to an actor id / level anchor / Actor / point; opts = the §5.1 cam step
//   shake(trauma)             also driven by E.SHAKE and the §8.2 juice events
//   yaw, pitch                orbit angles; the player moves camera-relative: forward = (-sin yaw, 0, -cos yaw)
// Additions (camera-owned, additive):
//   shot(step) → Promise      run a §5.1 `cam` step; resolves after its `dur` (cut: at once)
//   lockTarget                the locked enemy (Actor) or null; lock(target?) / unlock() / switchLock(dir)
//   memeT, memePhase          Meme Cam loop time (0..3.8 s) / phase (0..1) for the cape sway + grass wind sync
//                             (also while a cutscene holds a MEME_LOOP shot, e.g. the CS-00 title loop)
//   addFadeable(obj) / removeFadeable(obj) / refreshFadeable(obj)   tree fade registration (or tag
//                             userData.camFade = true / camFadeIds on a BatchedMesh; see Occluders.js)
//   memeYawOffset(actor)      the MEME_LOOP framing's rotation around her that clears walls / fences / trunks in
//                             front of her face (mode('meme') uses it; opts.yawOffset overrides)
//   snapBehind(), recenter(), modeName, distance, showLockMarker
// AUTOCAM additions (research/next/AUTOCAM_SPEC.md, IMPLEMENTATION_PLAN §7.2; the MOBA auto-camera):
//   footprint {q, cx, cz, ahead, behind, halfW, halfWTop, slantMax, d, version, valid} + inFootprint(x, z, pad)
//   frustum, frameId (one frustum per rendered frame), inView(p, r), activityOf(actor) (PERF §4.3 tiers 0–3)
//   onScreen(p, margin)       = SafeFrame-visible (HUD / thumb holes count as hidden; gameplay fairness only, X13)
//   safeFrame (read-only SafeFrame), groundAxes(outU, outR), heroScreen() → {x, y} CSS px (her rest point)
//   closeUp (lens < 6.0 m on / > 6.3 m off; calls view.setCloseUp), camLockMode ('locked' | 'semi' | 'free')
//   blendTo(mode, dur, ease), probe(), framing()  (debug / smoke)
// Emits E.MEME_CAM { on } entering / leaving 'meme'. Listens: E.SHAKE, E.CAM_MODE, E.BOSS_START / BOSS_DEFEATED,
// E.ARENA_CLEAR, E.LEVEL_LOADING / LEVEL_LOADED / LEVEL_UNLOAD, E.PLAYER_SPAWNED, E.PLAYER_HOLY (FOV punch),
// E.PLAYER_GOLDEN (punch-in), E.BOSS_DIZZY (the §8.2 dizzy shake), E.CUTSCENE_END (handback), E.GAME_MODE.
// Hit / parry / block / guard-break shakes arrive as E.SHAKE from combat (one source, no double shake).
//
// Gameplay camera (research/CONTROLS_SPEC.md §2-§3 + AUTOCAM, the default): the fixed-yaw three-quarter top-down ISO
// RIG (IsoRig.js maths) for `follow` / `lock` / `boss`. The yaw is the level's (level.cam.yaw, default π: the camera
// south of her looking +Z) and never orbits with her (R1). AUTOCAM §4.2 per render: her XZ followed RIGIDLY on the
// interpolated render pose, the ground Y through a spring, then every offset (screen-up bias, intent lead, combat
// lean, aim pan, beat, peek, semi pan) is its own critically damped spring (core smoothDamp: no overshoot, R2),
// clamped so she never leaves `herFrame` (R7); the distance is the rest frame (zoom × base × zone hints) plus the
// FramingSolver fit (20 Hz, out fast / in slow) and the beat / boss / punch envelopes. SafeFrame gives the anchor
// (setViewOffset, whole px) and the visibility test. Picking for click-to-move
// and targeting lives in Picker.js (screenToGround / pickAt; the hover pick runs once per rendered frame,
// _isoCursor). Occlusion (§3, _isoOcclusion): props between the lens and the subject capsules (her chest, engaged
// enemies, the selection, the next waypoint) fade dithered through OccluderFader; crowns and roofs have their own
// rules; her x-ray silhouette shows when a solid thing hides her. Everything runs in render() with the interpolated
// player position (no 120 Hz jitter); input edges in update().
//
// Solid occluders (town / hub buildings, towers, statues, pillars): auto-registered on level load from the props group
// + the level's solid colliders (OccluderFader.scanSolids; world may tag `camFade: 'solid'` instead).
// Cutscene shots (CutsceneCamera) and the Meme Cam (MemeCam) are shared by both rigs; `collide` rails (PULLBACK) use
// the spring-arm cast (_cast), `scale: 'height'` presets (BOSS_INTRO).
//
// LEGACY `?cam=classic` (kept until M3 ends, CONTROLS_SPEC §0; everything tagged `CLASSIC (remove after M3)`): the old
// third-person orbit around a pivot at her head (CAMERA.pivotY) with a spring arm (physics.sphereCast; thin statics
// and `cam: false` colliders skipped, camTransparent), auto-follow after 1.5 s without look input, lock-on over her
// right shoulder (lockYawBias / LOCK_SEP, dead-target hand-over HANDOVER_RATE), the boom avoidance (_avoid,
// ARM_SHORT / AVOID_CANDIDATES), the boss assist orbit (BOSS_EDGE / bossFrameYaw / bossLift), mouse / stick lock
// flicks (_flicks). (The positional near-lens fade in render() stays: cutscene / Meme Cam shots use it.) Removing classic = deleting the tagged blocks,
// the `isIso` false branches and the `cam=classic` param.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { CAMERA, PLAYER, JUICE } from '../core/config.js';
import { damp, dampAngle, clamp, lerp, wrapAngle, easeInOutSine, easeOutCubic, smoothstep, smoothDamp, smoothDamp2 } from '../core/math.js';
import { hostileTo } from '../core/ActorRegistry.js';
import { CameraShake } from './CameraShake.js';
import { CamPose, blendPose, blendPoseIso, applyPose, resolveEase } from './pose.js';
import { CutsceneCamera, SHOT_MODES } from './CutsceneCamera.js';
import { MemeCam } from './MemeCam.js';
import { acquireLockTarget, RECENT_ATTACKER_TIME, handoverLockTarget, switchLockTarget, lockable, FlickDetector, StickFlick, LockMarker } from './LockOn.js';
import { OccluderFader, SOLID_MIN_H } from './Occluders.js';
import { PRESETS, localToWorld } from './presets.js';
import { toRecord } from '../physics/StaticColliders.js';
import { RENDER, AIM, TELEGRAPH, TOUCH, NAV, ATTACKS, FADE_COLOR as CORE_FADE } from '../core/config.js';
import { ISO, isoFrame, isoPosition, isoPitch, pxAt, apparentH, screenToWorldDir, capXZ, camProfile, distRange, intentLead,
  LeadGate, herLimits, clampToLimits, footprintOf, inQuad, fogRadius, farPlane } from './IsoRig.js';
import { SafeFrame, fallbackOccluders } from './SafeFrame.js';
import { Subjects, TelegraphTrack } from './framing/Subjects.js';
import { makeView, setYaw, solveFrame, holdGoal, allHardInside, needD, CLS, CLS_NAMES, STRIDE, SX, SY, SZ, SR, SW, SF, SC, F_HARD, F_DROP } from './framing/FramingSolver.js';
import { BeatRunner, BEATS } from './framing/beats.js';
import { screenToGround, pickAt, worldToScreen as w2s, canvasRect } from './Picker.js';
/** the per-frame hover pick's options (no literal per frame) */
const HOVER_OPTS = Object.freeze({ ground: false });
/** setProfiling(): fold the time since `t0` into the EMA `T[key]` (ms); returns now (the next lap's start) */
function lap(T, key, t0) {
  const now = performance.now(), ms = now - t0;
  T[key] = T.n <= 1 ? ms : T[key] + (ms - T[key]) * 0.05;
  return now;
}
/** rendered frames a cached cursor ground ray may serve at most (_cursorKeyFresh) */
const CURSOR_TTL = 8;
import { setXray } from '../characters/Readability.js';

const LOCK = PLAYER.lockOn;
/** faded opacity of roofs and solid occluders until core adds ISO.occl.archOpacity (requests/core.md): 0.1 = 2 of the
 *  16 dither cells; at the tree opacity (0.22 = 4 cells) a saturated roof still reads as a heavy tint over the street */
const ARCH_FADE_OPACITY = 0.1;
// ==================== CLASSIC (remove after M3): ?cam=classic orbit only ====================
/** default orbit pitch (rad): slightly above her, looking a touch down the path ahead */
export const DEFAULT_PITCH = 0.2;
/** lateral offset over her right shoulder while locked (m, at lockDist) */
export const SHOULDER = 0.9;
/**
 * Combat framing (an alerted hostile within COMBAT_RADIUS m, or a lock): the orbit pitch is raised to at least
 * COMBAT_PITCH (rad) and the look point lifted COMBAT_LIFT (m) above her head, so she sits in the lower third and the
 * sight line to a rat in melee range clears her silhouette (its wind-up stays visible).
 */
export const COMBAT_PITCH = 0.4;
export const COMBAT_LIFT = 0.4;
export const COMBAT_RADIUS = 4;
/** unlocked combat: right-shoulder offset (m) so an enemy straight ahead of her is not hidden behind her body */
export const COMBAT_SHOULDER = 0.6;
/**
 * lock-on: minimum horizontal screen separation (NDC units, 2 = full width; 0.32 = 205 px at 1280) of the target
 * from her body, for targets 4 m+ away; it relaxes to LOCK_SEP_NEAR (154 px) at 1.2 m so a lunging rat doesn't
 * swing the camera round to her side (see lockSepGoal)
 */
export const LOCK_SEP = 0.32;
export const LOCK_SEP_NEAR = 0.24;
/** @param {number} d horizontal distance her → target (m) @returns {number} separation goal (NDC) */
export function lockSepGoal(d) { return LOCK_SEP_NEAR + (LOCK_SEP - LOCK_SEP_NEAR) * clamp((d - 1.2) / 2.8, 0, 1); }
/** lock-on: largest yaw swing (rad) away from "straight behind her" used to reach LOCK_SEP */
export const LOCK_BIAS_MAX = 1.0;
/** her body point (below the head pivot, m) the lock separation is measured from */
const BODY_DROP = 0.3;
// ==================== /CLASSIC ==================
/** near-lens fade: fadeable props within this depth (m) in front of the lens fade (fence rails, posts, trunks) */
export const LENS_FADE_DIST = 2.2;
/** near-lens fade: the grid (NDC) the lens segments pass through */
const LENS_GRID = Object.freeze([[0, 0], [-0.5, 0], [0.5, 0], [-0.95, 0], [0.95, 0], [0, -0.6], [0, 0.6], [0, -0.95], [0, 0.95],
  [-0.5, -0.6], [0.5, -0.6], [-0.5, 0.6], [0.5, 0.6], [-0.95, -0.6], [0.95, -0.6], [-0.95, 0.6], [0.95, 0.6]]);
/** enemy states that count as engaged even without the `alerted` flag */
const ENGAGED = new Set(['alert', 'chase', 'windup', 'strike', 'recover', 'circle', 'attack', 'aim']);
/** Reduce camera motion: a per-step ground-height change below this (m) is followed rigidly; bigger ones ease (steps) */
export const CALM_GROUND_STEP = 0.08;
/**
 * TOKENTAILS-PLAN §10.2.7 guide look-ahead (package G1): while ui's guide target (ctx.ui.beacon.guide) is off screen
 * and she is not fighting or locked on, the framing leans toward it by up to `max` m, eased in / out over `ease` s.
 * Once engaged it holds until the target is within `release` m of her or changes (no on / off flutter at the edge).
 * Kept here, not in core/config.js. The herFrame clamp (R7) still wins. Off with Reduce camera motion (the frame holds still).
 */
export const GUIDE_LOOK = Object.freeze({ max: 2.5, ease: 0.6, release: 6, near: 1.2 });
/**
 * TOKENTAILS-PLAN §10.2.12: no Photo Cam during the prologue / practice or while an onboarding target is active
 * (pure; unit-tested). `s` = { prologueDone, onboardDone, practice, tutorial, guideKind, guideHas, meadow }.
 */
export function photoCamBlocked(s) {
  if (s.tutorial || s.practice) return true;
  if (s.meadow && !s.prologueDone) return true;
  return !!s.guideHas && !s.onboardDone && s.guideKind !== 'quest';
}
/** min/max spring-arm length (m) */
const ARM_MIN = 0.8, ARM_MARGIN = 0.3, ARM_RADIUS = 0.2;
/** what the spring arm and the lock-on line of sight test: terrain + architecture + static props (thin ones skipped) */
const ARM_OPTS = Object.freeze({ terrain: true, mesh: true, statics: true });
/** static circles up to this radius (trunks, posts, pillars of a fence) never pull the camera in (m) */
export const THIN_RADIUS = 0.6;
/** segment colliders (fences, thin walls) up to this half-thickness are skipped too (m) */
const THIN_SEGMENT = 0.2;
const MAX_SKIPS = 6;
/** x-ray: statics that never count as hiding her (arena mist walls, explicit `cam: false`) */
function xrayIgnored(src) { return !!src && typeof src === 'object' && (!!src.arenaWall || src.cam === false); }
/** x-ray line of sight: everything (thin props included) except xrayIgnored */
const XRAY_OPTS = Object.freeze({ terrain: true, mesh: true, statics: true, ignore: xrayIgnored });
// ==================== CLASSIC (remove after M3): ?cam=classic orbit only ====================
/**
 * Boom avoidance (a low wall, a standing stone or a cart right behind her): when the arm would be cut shorter than
 * ARM_SHORT the camera looks for a clear boom instead of collapsing onto her head: it lifts the pitch over a low
 * obstacle and / or swings the orbit to the nearest clear side (AVOID_CANDIDATES, cheapest first) until the arm is
 * at least ARM_GOOD long (or `want`). Re-evaluated every AVOID_EVAL s; the pitch lift / yaw swing ease in.
 */
export const ARM_SHORT = 2.2;
export const ARM_GOOD = 2.8;
/** below this (m) the avoidance takes any candidate that is clearly longer, even short of ARM_GOOD */
export const ARM_FLOOR = 1.8;
const AVOID_EVAL = 0.1;
/** highest orbit pitch the avoidance may reach (rad) */
export const AVOID_PITCH_MAX = 1.15;
/** largest yaw swing while locked (the target must stay in frame) */
const AVOID_LOCK_YAW = 0.9;
/** the player's own look input suppresses the yaw swing for this long (s): never fight the mouse / stick */
const AVOID_LOOK_GRACE = 0.4;
/** [yaw offset, pitch lift] candidates (rad), sorted by cost (a pitch lift is cheaper than a swing) */
export const AVOID_CANDIDATES = (() => {
  const c = [];
  for (const dp of [0.15, 0.3, 0.45, 0.6, 0.8]) c.push([0, dp]);
  for (const dy of [0.45, 0.9, 1.3]) for (const dp of [0, 0.3]) { c.push([dy, dp]); c.push([-dy, dp]); }
  const cost = ([dy, dp]) => Math.abs(dy) * 0.8 + dp;
  return Object.freeze(c.sort((a, b) => cost(a) - cost(b)).map((x) => Object.freeze(x)));
})();
/** dead-target hand-over: the lock orbit turns at most this fast (rad/s, eased in over HANDOVER_EASE s) */
export const HANDOVER_RATE = Math.PI;
const HANDOVER_EASE = 0.3;
const HANDOVER_MAX_T = 2.5;
// ==================== /CLASSIC ==================
/** tree fade only while the camera is this close to its subject (m): follow / lock / boss arms, close shots */
export const FADE_MAX_DIST = 9;
/** solid occluders (houses, towers) fade up to this camera-to-subject distance (m): a house never hides her in a
 *  medium cutscene shot either; only far establishing shots keep them solid */
export const SOLID_FADE_MAX_DIST = 18;
/** Meme Cam: rotations of the MEME_LOOP framing around her (rad) tried in order until the lens has a clear view */
export const MEME_YAWS = Object.freeze([0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]);
const _memeOffs = [];
/** Meme Cam view test: everything solid counts (a fence or trunk 1 m in front of her face spoils the shot too) */
const MEME_CAST = Object.freeze({ terrain: true, mesh: true, statics: true });
const MEME_LENS_R = 0.12;
/** her eye height (m, the ECU_EYES look): the Meme Cam view test runs from her face to the lens */
export const MEME_EYE_Y = PRESETS.ECU_EYES.look[1];

/**
 * Static colliders that are the footprint of a camera-fadeable prop (a `fade` prop set such as the practice-field
 * fence, whose world colliders carry no camFade tag): found on level load by matching collider footprints against
 * the registered fadeables (OccluderFader.covers). The camera fades those props instead of colliding into her.
 * @type {WeakSet<object>}
 */
export const FADE_COLLIDERS = new WeakSet();

/** Static colliders matched to a solid occluder (a house, tower, statue or pillar that fades when it hides her). */
export const SOLID_COLLIDERS = new WeakSet();
/** Solid-occluder colliders slender enough (footprint half-size ≤ BOSS_PASS_R m) that a boss-fight arm passes them. */
export const BOSS_PASS = new WeakSet();
export const BOSS_PASS_R = 1.0;
// ==================== CLASSIC (remove after M3): ?cam=classic orbit only ====================
/** boss assist: keep the boss within this angle (rad) of the screen centre (horizontal) */
export const BOSS_EDGE = 0.35;
/** boss assist: starts this long (s) after the player's last look input */
export const BOSS_LOOK_GRACE = 0.8;
/** boss assist: orbit damping rate (1/s) */
export const BOSS_YAW_RATE = 2.2;
/** boss assist: no assist while the boss is this close (m, horizontal): he fills the frame anyway */
const BOSS_NEAR = 1.2;

/**
 * Signed horizontal angle (rad) of point (bx, bz) off the view axis of a follow camera orbiting (px, pz) at `yaw`,
 * `dist` m (looking at the pivot).
 */
export function bossBearing(px, pz, bx, bz, yaw, dist) {
  const cx = px + Math.sin(yaw) * dist, cz = pz + Math.cos(yaw) * dist;
  return wrapAngle(Math.atan2(bx - cx, bz - cz) - Math.atan2(px - cx, pz - cz));
}

/**
 * Orbit yaw closest to `yaw` that shows the boss within `edge` rad of the view axis: `yaw` itself when he already is,
 * else bisection along the short arc toward "straight behind her, facing him" (where his bearing is 0).
 */
export function bossFrameYaw(px, pz, bx, bz, yaw, dist, edge = BOSS_EDGE) {
  if (Math.abs(bossBearing(px, pz, bx, bz, yaw, dist)) <= edge) return yaw;
  const behind = Math.atan2(bx - px, bz - pz) + Math.PI;
  const delta = wrapAngle(behind - yaw);
  let lo = 0, hi = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (Math.abs(bossBearing(px, pz, bx, bz, yaw + delta * mid, dist)) <= edge) hi = mid; else lo = mid;
  }
  return yaw + delta * hi;
}

/**
 * Look-point lift (m) for a tall boss close to her, so his head stays in frame: 0.35 m per metre above 1.6 m (max
 * 0.3 m), fading out between 3 and 7 m.
 * @param {number} height boss height (m) @param {number} d horizontal distance to her (m)
 */
export function bossLift(height, d) {
  const h = Math.min(0.3, Math.max(0, ((height ?? 1.6) - 1.6) * 0.35));
  return h * clamp((7 - d) / 4, 0, 1);
}
// ==================== /CLASSIC ==================

/**
 * Should the camera ignore this static collider (it fades instead / is too thin to matter)?
 * Collider descriptions (physics/StaticColliders) may carry `cam: false` (always skip) / `cam: true` (always block);
 * `camFade: true` also skips. Otherwise thin circles and segments are skipped; boxes and big circles block.
 * @param {any} src the collider description (physics hit.object for kind 'static')
 */
export function camTransparent(src) {
  if (!src || typeof src !== 'object') return false;
  if (src.arenaWall) return true;                                     // arena fog walls (mist): never pull the arm in
  if (src.cam === false || src.camFade === true || FADE_COLLIDERS.has(src)) return true;
  if (src.cam === true) return false;
  if (src.ax !== undefined || Array.isArray(src.a)) return (src.r ?? 0.1) <= THIN_SEGMENT;                // segment
  const isBox = src.minX !== undefined || src.hx !== undefined || src.w !== undefined || src.d !== undefined;
  if (!isBox && typeof src.r === 'number') return src.r <= THIN_RADIUS && !(src.kind === 'ring' || src.ring || src.inside);
  return false;
}

/**
 * Distance along the cast (from `o`, unit `d`) at which a sphere of `radius` has fully left the skipped static
 * `src`: exact for circles (2D exit of the swept vertical cylinder r + radius), a short step otherwise.
 */
function exitDistance(src, o, d, radius, hitDist) {
  if (src && typeof src.r === 'number' && Number.isFinite(src.x) && Number.isFinite(src.z) && src.ax === undefined && !Array.isArray(src.a)) {
    const R = src.r + radius, ox = o.x - src.x, oz = o.z - src.z, a = d.x * d.x + d.z * d.z;
    if (a > 1e-6) {
      const b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - R * R, disc = b * b - 4 * a * c;
      if (disc >= 0) { const t = (-b + Math.sqrt(disc)) / (2 * a); if (t > hitDist) return t + 0.02; }
    }
  }
  return hitDist + 2 * radius + 0.25;
}

// ==================== CLASSIC (remove after M3): ?cam=classic orbit only ====================
/**
 * Lock-on look point: `out` = pivot + half the way to the target (capped 2.2 m horizontally, -0.6..1.2 m vertically),
 * lifted by `lift`.
 */
export function lockLookPoint(pivot, tgt, lift, out) {
  out.subVectors(tgt, pivot).multiplyScalar(0.5);
  const h = Math.hypot(out.x, out.z);
  if (h > 2.2) { out.x *= 2.2 / h; out.z *= 2.2 / h; }
  out.y = clamp(out.y, -0.6, 1.2) + lift;
  return out.add(pivot);
}

const _sPos = new THREE.Vector3(), _sLook = new THREE.Vector3(), _sF = new THREE.Vector3(), _sR = new THREE.Vector3(), _sV = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

/**
 * Horizontal screen separation (NDC, target minus body; positive = target right of her) of the lock framing with
 * orbit `yaw` / `pitch`, arm `dist`, right-shoulder offset `shoulder`, look lift `lift` and the horizontal half-FOV
 * tangent `tanH`.
 */
export function lockScreenSep(pivot, body, tgt, yaw, pitch, dist, shoulder, lift, tanH) {
  const cp = Math.cos(pitch);
  _sPos.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).multiplyScalar(dist).add(pivot);
  _sPos.x += Math.cos(yaw) * shoulder; _sPos.z -= Math.sin(yaw) * shoulder;
  lockLookPoint(pivot, tgt, lift, _sLook);
  _sF.subVectors(_sLook, _sPos).normalize();
  _sR.crossVectors(_sF, _UP).normalize();                            // three.js lookAt: camera +X = forward x up
  const ndc = (p) => { _sV.subVectors(p, _sPos); const z = Math.max(0.05, _sV.dot(_sF)); return _sV.dot(_sR) / (z * tanH); };
  return ndc(tgt) - ndc(body);
}

/**
 * Smallest yaw bias (rad, >= 0: the camera swings further round to her right) for which the target sits at least
 * `sep` NDC to the right of her body on screen (bisection; LOCK_BIAS_MAX if even that is not enough).
 * `yaw0` is the orbit yaw straight behind her, facing the target.
 */
export function lockYawBias(pivot, body, tgt, yaw0, pitch, dist, shoulder, lift, tanH, sep = LOCK_SEP, maxBias = LOCK_BIAS_MAX) {
  if (lockScreenSep(pivot, body, tgt, yaw0, pitch, dist, shoulder, lift, tanH) >= sep) return 0;
  if (lockScreenSep(pivot, body, tgt, yaw0 + maxBias, pitch, dist, shoulder, lift, tanH) < sep) return maxBias;
  let lo = 0, hi = maxBias;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (lockScreenSep(pivot, body, tgt, yaw0 + mid, pitch, dist, shoulder, lift, tanH) >= sep) hi = mid; else lo = mid;
  }
  return hi;
}
// ==================== /CLASSIC ==================

const GAMEPLAY = new Set(['follow', 'lock', 'boss']);
/** the player moving more than this between two rendered frames is a teleport (m²: 6 m) */
const TELEPORT_SQ = 36;
const ZERO_LOOK = Object.freeze({ x: 0, y: 0, px: 0, py: 0 });

const _dir = new THREE.Vector3(), _piv = new THREE.Vector3(), _right = new THREE.Vector3(), _tmp = new THREE.Vector3();
const _org = new THREE.Vector3(), _tgt = new THREE.Vector3(), _ray = new THREE.Ray();
const _blendPivot = new THREE.Vector3(), _castOrg = new THREE.Vector3(), _sideOrg = new THREE.Vector3(), _losDir = new THREE.Vector3();
const _subjects = Array.from({ length: 7 }, () => new THREE.Vector3());
const _radii = new Float32Array(7);
const _feet = new THREE.Vector3();
const _xrPt = new THREE.Vector3();
const _hidP = new THREE.Vector3();
const _ZV2 = Object.freeze({ x: 0, y: 0 });
const _xrSet = new Set();
const _projView = new THREE.Matrix4();
const _lens = LENS_GRID.map(() => new THREE.Vector3());
const _body = new THREE.Vector3(), _tgtPt = new THREE.Vector3(), _q = new THREE.Vector3();
const _cOrg = new THREE.Vector3(), _cDir = new THREE.Vector3(), _cRight = new THREE.Vector3();

// ==================== AUTOCAM (research/next/AUTOCAM_SPEC.md) ====================
const FR = ISO.framing;
/** the engaged set is capped at this many actors (the subject pool holds 16 incl. her) */
const MAX_ENG = 24;
/** her framing subject: ρ = framing.pad.her at feet + this (m; AUTOCAM §6.2 "0.6 at y + 0.4") */
const HER_CENTRE_Y = 0.4;
/** player states whose motion is not intent (tumble, Pounce, lunge magnetism, knockback, scripted): lead 0 (D5) */
const OTHER_STATES = new Set(['dodge', 'pounce', 'attack', 'hurt', 'stagger', 'dead', 'scripted', 'rise', 'vigil', 'memecam', 'sip', 'golden']);
/** smooth times (s) of the iso springs that AUTOCAM §12 leaves to the rig: zoom / elastic, pitch (≤ 20°/s cap on top),
 *  the beat lean (the beat envelope already eases), the charge push-in weight */
const ZOOM_ST = 0.12, PITCH_ST = 0.15, BEAT_ST = 0.12, CHARGE_ST = 0.1;
/** R10 base-FOV smoothing (s); the rate cap is framing.rate.fovDeg (12°/s) */
const FOV_ST = 0.2;
/** settings.camCursorLead upper bound (AUTOCAM §5.4; SETTINGS range [0, 0.15]) */
const CURSOR_LEAD_MAX = 0.15;
/** Purrfect Dodge punch in / out (s; ISO.perfectDodge.in / out when core adds them — requests/core.md) */
const pdIn = (P) => P.in ?? 0.08, pdOut = (P) => P.out ?? 0.3;

/**
 * Trapezoid punch envelope: 0 → 1 linearly over `tin`, 1 for `hold`, 1 → 0 linearly over `tout` (0 outside).
 * @param {number} t seconds since the trigger @param {number} tin @param {number} hold @param {number} tout
 * @returns {number} weight in [0, 1]
 */
export function dodgeEnvelope(t, tin, hold, tout) {
  if (!(t >= 0)) return 0;
  if (t < tin) return t / tin;
  if (t < tin + hold) return 1;
  return Math.max(0, 1 - (t - tin - hold) / Math.max(1e-3, tout));
}
/** a beat trigger that cannot fire within this long (s) is dropped (never a late beat) */
const BEAT_QUEUE_T = 1.0;
/** PERF §4.3 activity tiers (until core adds CAMERA.iso.activity, requests/core.md): bounding sphere + margin in the
 *  frustum = 0; ≤ near m from the focus = 1; ≤ far = 2; beyond = 3; classic: tier 0 within `classic` m */
const ACT = Object.freeze({ margin: 2, near: 30, far: 60, classic: 40, ...(ISO.activity ?? {}) });
/** ART §6.1 close-up flag hysteresis (lens → her, m) until core adds CAMERA.iso.closeUp */
const CLOSE = Object.freeze({ on: 6.0, off: 6.3, ...(ISO.closeUp ?? {}) });
/** Reduce camera motion: Meme Cam sway scale (AUTOCAM §10.1) */
const REDUCE_MEME_SWAY = ISO.reduce.memeSway ?? 0.3;
/** cream veil colour (WA §2.7; core FADE_COLOR) */
const FADE_COLOR = CORE_FADE ?? '#FFF1DE';
/** zoom changes are written to settings (camZoom / camZoomPortrait) after this long without another (s) */
const ZOOM_SAVE_T = 0.6;
const LOCK_MODES = Object.freeze(['locked', 'semi', 'free']);
const EMPTY = Object.freeze({});
/** SafeFrame anchor hysteresis (normalised): smaller target moves are ignored for the same viewport, so ui's touch
 *  layout (which clears a disc around heroScreen()) and the anchor (from that layout's rects) cannot ping-pong */
const ANCHOR_EPS = 0.012;
const _look = { x: 0, z: 0, rem: 0 }, _tmp2 = new THREE.Vector3(), _F = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _sph = new THREE.Sphere();
/** the iso shake mix (CONTROLS §2.5; rotation ×touchShakeRot on touch), refreshed per frame, never reallocated */
const _shakeMix = { rotMul: 0.5, transMul: 2, rotMaxDeg: 1.2, transMax: 0.35 };
/** a boss intro / any cutscene that ended this recently (s) counts as "just played" (no room read / establishing read) */
const CUT_RECENT = 1.5;

/** A live hostile actor (not her, alive, not hidden). */
function liveHostile(a, me) {
  // `disposed`: a despawned actor (arena reset, a getaway, level cleanup) never stays engaged / framed
  return !!a && a !== me && !a.disposed && a.alive !== false && !a.dead && !a.hidden && !(a.hp !== undefined && a.hp <= 0) && !!(a.object3d?.position ?? a.pos);
}
/** Alerted / engaged (the AI's flag or an engaged state). */
function isAlerted(a) { return !!(a.alerted || ENGAGED.has(a.stateName)); }
/** Insert `a` (timer t, distance d) into the parallel arrays by distance. */
function insertByDist(arr, T, D, a, t, d) {
  if (arr.length >= MAX_ENG) return;
  let i = arr.length;
  arr.push(a); D.push(d);
  while (i > 0 && D[i - 1] > d) { arr[i] = arr[i - 1]; D[i] = D[i - 1]; T[i] = T[i - 1]; i--; }
  arr[i] = a; D[i] = d; T[i] = t;
}
/** Cheap signature of a ui touch layout (rounded button centres) for the SafeFrame rebuild key. */
function layoutSig(L) {
  let h = 0;
  for (const k in L.buttons) { const b = L.buttons[k]; if (b) h = (h * 31 + Math.round(b.x) * 7 + Math.round(b.y) * 13 + Math.round(b.r)) | 0; }
  return h;
}

export class FollowCamera {
  constructor(ctx) {
    this.ctx = ctx;
    /** orbit yaw: the camera sits at pivot + (sin yaw·cos pitch, sin pitch, cos yaw·cos pitch)·dist */
    this.yaw = Math.PI;
    this.pitch = DEFAULT_PITCH;
    /** wanted arm length (eased between follow / lock / boss) and the current (collision-limited) one */
    this.distance = CAMERA.dist;
    this.curDist = CAMERA.dist;
    this.pivot = new THREE.Vector3();
    this.shaker = new CameraShake();
    /** 'follow' | 'lock' | 'boss' | 'meme' | 'preset' | 'cutscene' */
    this.modeName = 'follow';
    this.modeOpts = {};
    /** the locked enemy or null */
    this.lockTarget = null;
    /** boss arena framing (6.0 m) */
    this.bossActive = false;
    /** current vertical FOV (deg, before the aspect correction) */
    this.fov = CAMERA.fov;
    /** draw the gold lock marker over the target (ui may switch it off if it draws its own reticle) */
    this.showLockMarker = true;
    /** the running cutscene / preset shot as { name, anchor, opts } (M0 stub compatible), else null */
    this.presetState = null;

    this._cut = new CutsceneCamera(ctx);
    this._meme = new MemeCam(ctx);
    this._fader = new OccluderFader({ minOpacity: CAMERA.treeFadeOpacity, fadeIn: ISO.occl.fadeIn, fadeOut: ISO.occl.fadeOut,
      crownR: ISO.occl.crownR, roofPad: ISO.occl.roofPad, dither: true, archOpacity: ISO.occl.archOpacity ?? ARCH_FADE_OPACITY });
    this._marker = new LockMarker();
    // PERF (AUTOCAM §9.6 ≤ 0.08 ms): the viewport size read once per canvas-rect refresh (a clientWidth read after a
    // DOM write forces a synchronous layout), the isoFrame base re-derived only when one of its inputs changes, the
    // x-ray capsule test skipped while lens and her stand still, and option objects reused (no literal per frame)
    this._vs = { w: 0, h: 0, rect: null, el: null };
    this._fr0Key = new Float64Array(10); this._fr0Ok = false;
    this._occOpts = { n: 0, radii: null, her: null };
    this._fogArg = { focus: null, mode: 0, combat: false, boss: false };
    this._xrq = { ok: false, age: 0, cx: 0, cy: 0, cz: 0, hx: 0, hy: 0, hz: 0, h: 0, yaw: 0, sc: -1, frac: 0 };
    /** opt-in per-function render timings (setProfiling(true)): { name: EMA ms }, else null (no timer calls at all) */
    this.timing = null;
    this._flick = new FlickDetector(LOCK.flickPx, LOCK.flickTime);
    this._stick = new StickFlick(0.7, 0.35);
    this._gamePose = new CamPose();
    this._outPose = new CamPose();
    this._holdPose = new CamPose();
    this._blendFrom = new CamPose();
    this._blend = { active: false, t: 0, dur: 0, ease: easeInOutSine, pivot: null, sim: false, isoFrom: 1 };
    this._dist = { from: CAMERA.dist, to: CAMERA.dist, t: CAMERA.ease };
    this._snap = true;
    this._recenter = false;
    this._losT = 0;
    this._chargeW = 0;
    this._fovPunchT = 0;
    this._goldenT = 0;
    /** §2.4 dialogue framing: the current speaker's actor id and the eased framing weight (0 → 1 over 0.5 s) */
    this._speakerId = null; this._dlgW = 0; this._dlgMid = new THREE.Vector3();
    this._lastPlayerPos = new THREE.Vector3();
    this._hadPlayer = false;
    this._appliedFov = -1;
    this._bossForced = false;
    this._dizzyShaken = false;
    this._landShaken = false;
    this._lockLook = new THREE.Vector3();
    /** pending safety handback after E.CUTSCENE_END: blend seconds, or −1 for none */
    this._handback = -1;
    /** the hostile that last hit her (lock-on fallback when the cone is empty) and the seconds left to remember it */
    this._attacker = null;
    this._attackerT = 0;
    /** an alerted hostile is within COMBAT_RADIUS (refreshed in update) and the eased combat-framing weight */
    this._threat = false;
    this._combatW = 0;
    /** current lock yaw bias (rad, see lockYawBias) */
    this.lockBias = 0;
    /** boom avoidance (see ARM_SHORT): on/off, the eased pitch lift / lock yaw offset and the current choice */
    this.avoid = true;
    this._avoidPitch = 0;
    this._avoidYaw = 0;
    this._avoidActive = false;
    this._avoidEvalT = 0;
    this._avoidDy = 0;
    this._avoidDp = 0;
    /** dead-target hand-over in progress: seconds since it (-1 = none) */
    this._handoverT = -1;
    /** boss assist: the yaw correction (rad) it is steering toward this frame (0 = the boss is in frame / no assist) */
    this.bossAssist = 0;
    /** solid occluders registered for the current level (houses, towers, statues, pillars) */
    this.solidOccluders = 0;
    this._offs = [];

    // ---- CONTROLS_SPEC §2 iso rig (the default; `?cam=classic` keeps the orbit above)
    /** true: follow / lock / boss run the fixed-yaw three-quarter top-down rig */
    this.isIso = ctx?.params?.cam !== 'classic';
    /** the point the iso camera looks at (her feet + 0.6 m + lead / combat bias / pan / peek); read-only for others */
    this.focus = new THREE.Vector3();
    /** the level's fixed camera yaw (level.cam.yaw, default π) and the movement yaw latched while a stick is held */
    this.isoYaw = ISO.yaw;
    this.stickYaw = ISO.yaw;
    this._stickFree = 0;
    /** zoom multiplier (wheel / pinch / R3 / the Camera distance slider; per orientation: settings.camZoom /
     *  camZoomPortrait, §10.3) and its smoothed value (+ the elastic give at a limit) */
    this.zoomMul = 1; this._zoomS = 1; this._zoomSS = { v: 0 }; this._zoomSeeded = false; this._zoomPortrait = false;
    this._give = 0; this._giveS = { v: 0 }; this._zoomSaveT = -1;
    /** §10.4 lock modes (KBM): 'locked' | 'semi' | 'free'; `camLocked` = locked (Y toggles locked ↔ the last unlocked) */
    this.camLocked = true; this.camLockMode = 'locked'; this._lastUnlocked = 'free';
    /** free-mode leash pan (after the herFrame clamp), the peek offset, the semi pan (inside herFrame) */
    this._pan = new THREE.Vector3(); this._panS = { vx: 0, vz: 0 }; this._edgeT = 0;
    this._peek = new THREE.Vector3(); this._peekS = { vx: 0, vz: 0 };
    this._semi = { x: 0, z: 0 }; this._semiS = { vx: 0, vz: 0 }; this._semiFrom = new THREE.Vector3();
    this._semiActive = false; this._semiIdle = 0; this._semiReturn = false; this._semiHome = false;
    // ---- AUTOCAM springs (§4.2; each its own smoothDamp state, zero allocation)
    /** the spring-smoothed intent lead (world XZ; read-only for others) */
    this.lead = { x: 0, z: 0 };
    this._lead = { x: 0, z: 0 }; this._leadT = { x: 0, z: 0 }; this._leadS = { vx: 0, vz: 0 }; this._leadGate = new LeadGate();
    this._int = { x: 0, z: 0, kind: 'idle' };
    this._bias = 0; this._biasT = 0; this._biasS = { v: 0 };
    this._lean = { x: 0, z: 0 }; this._leanT = { x: 0, z: 0 }; this._leanS = { vx: 0, vz: 0 };
    this._aim = { x: 0, z: 0 }; this._aimT = { x: 0, z: 0 }; this._aimS = { vx: 0, vz: 0 }; this._aimHoldT = 0; this._aimHeld = false;
    this._beatOff = { x: 0, z: 0 }; this._beatS = { vx: 0, vz: 0 };
    this._off = { x: 0, z: 0 };
    /** §10.2.7 guide look-ahead: the offset (world XZ), its 0..1 ease weight, direction and engaged target id */
    this.guideLook = { x: 0, z: 0 }; this._glW = 0; this._glDir = { x: 0, z: 0 }; this._glOn = null;
    /** combat / boss fit above the rest distance (m): out fast, in slowly after holdIn (§6.5) */
    this._extra = 0; this._extraS = { v: 0 }; this._lastNeedOut = -1e9; this._calmFit = 0;
    this._needHeld = false; this._wasCombat = false;
    this._snug = 0; this._snugS = { v: 0 }; this._snugArmed = true;
    /** the rate-capped automatic distance above dBase (R3; see _isoGameplay) */
    this._autoD = NaN;
    this._rubber = 0; this._rubberS = { v: 0 }; this._pinchInT = 0; this._fitToast = false;
    this._fovB = NaN; this._fovS = { v: 0 }; this._fovPortrait = false;
    this._pitch = NaN; this._pitchS = { v: 0 }; this._chargeS = { v: 0 }; this._dCur = 0;
    this._gy = 0; this._gyS = { v: 0 }; this._gyPrevT = NaN;
    this._groundY = 0;
    /** real (rendered) seconds since construction */
    this._realT = 0;
    // ---- AUTOCAM framing: SafeFrame, subjects, the solver, beats
    /** SafeFrame (AUTOCAM §7; read-only for others: ui threat arrows, enemies' fairness rules) */
    this.safeFrame = new SafeFrame(); this._occl = [];
    /** the anchor (where her focus is drawn; eased 0.4 s on change, applied in whole px) */
    this._anc = { x: 0.5, y: 0.54, fromX: 0.5, fromY: 0.54, toX: 0.5, toY: 0.54, t: 1, seeded: false };
    this._vo = { x: NaN, y: NaN, w: 0, h: 0 };
    this.subjects = new Subjects();
    this._tel = new TelegraphTrack();
    this._laneKeys = Array.from({ length: this._tel.size }, (_, i) => Object.freeze({ lane: i }));
    this._tok = [];
    this._view = makeView();
    this._goal = { d: ISO.dist, need: ISO.dist, leanR: 0, leanU: 0, dropped: 0, holes: 0, capped: false };
    this._goalNext = { d: ISO.dist, need: ISO.dist, leanR: 0, leanU: 0, dropped: 0, holes: 0, capped: false, cap: ISO.dist };
    this._solveOpts = { dBase: 0, cap: 0, dMin: 0, capUp: 0, capDown: 0, limR: 0, limL: 0, limUp: 0, limDown: 0, nEngaged: 0, crowd: true, visible: null, holeRepair: true };
    this._visibleFn = (sx, sy) => this.safeFrame.visible(sx, sy);
    this._solveT = 0; this._forceSolve = true;
    this._lim = { up: 2, down: 4, left: 3, right: 3 };
    /** herLimits at the dialogue-dollied distance (d × dialog.mul; R7 through the two-shot) */
    this._limDlg = { up: 2, down: 4, left: 3, right: 3 };
    this._tmpPool = new Float32Array(2 * STRIDE);
    this.beat = new BeatRunner();
    this._beatQ = { id: null, x: 0, z: 0, r: 0, t: 0 };
    /** the locked arena (arena:lock { center, r }) for the room read / establishing read */
    this._arena = { id: null, x: 0, z: 0, r: 0, locked: false };
    this._lastCutEnd = -1e9; this._bossHoldT = 0; this._breathT = -1; this._dizzy = { on: false, t: 0, w: 0 };
    /** engaged-set hysteresis (two swapped arrays + their not-alerted timers) */
    this._engA = []; this._engB = []; this._engTA = new Float32Array(MAX_ENG); this._engTB = new Float32Array(MAX_ENG);
    // ---- AUTOCAM perf surface (§9; PERF §4.3 / K1 / K2)
    /** the visible ground footprint (§9.1), refreshed once per rendered frame from the iso pose */
    this.footprint = { q: new Float32Array(8), cx: 0, cz: 0, ahead: 0, behind: 0, halfW: 0, halfWTop: 0, slantMax: 0, d: 0, version: 0, valid: false };
    this._fpQ = new Float64Array(5);
    /** the merged iso far plane (X12) */
    this.farPlane = ISO.foot.farFallback ?? ISO.far;
    /** increments once per rendered frame after `frustum` is rebuilt */
    this.frameId = 0;
    /** ART §6.1: the lens is within 6.0 m of the framed character (off above 6.3 m) */
    this.closeUp = false; this._closeUpActor = null;
    this._cinematic = false;
    /** the ground point under the mouse (cached once per rendered frame) */
    this.cursorGround = new THREE.Vector3(); this.cursorValid = false;
    /** _isoCursor's ground-ray cache key (_cursorKeyFresh) */
    this._ck = { ok: false, age: 0, x: 0, y: 0, rl: 0, rt: 0, rw: 0, rh: 0, p0: 0, p5: 0, p8: 0, p9: 0, hx: 0, hy: 0, hz: 0, level: null, nv: -1, nl: -1, sc: -1, m: new Float64Array(16) };
    /** the hover pick (§5.5: at most once per rendered frame) */
    this.hover = { kind: 'ground', actor: null, id: null, interact: null, point: new THREE.Vector3(), px: 0 };
    /** iso weight (1 = gameplay iso, 0 = preset / meme / cutscene): drives the focus-fog mode and the anchor */
    this._isoW = this.isIso ? 1 : 0;
    this._near = -1; this._far = -1;
    /** the engaged set (AUTOCAM D9 hysteresis) + the selection, of the last frame */
    this.engaged = [];
    /** punch clocks (real s since the trigger; −1 = idle) */
    this._punchT = -1; this._holyT = -1; this._dodgeT = -1;
    this._xrayT = 0; this._xrayOn = false; this._xrayCheckT = 0; this._xrayEnemies = new Set();
    /** last iso framing numbers (cam.iso()) */
    this.isoInfo = { yaw: ISO.yaw, pitch: 0.9, dist: ISO.dist, fov: ISO.fov, catPx: 0, portrait: false, phone: false, frameOffset: 0, profile: 'desktop' };
    this._fr0 = {};
    this._engD = [];
    this._pitchHint = NaN; this._pitchHintW = 0; this._pitchFixed = NaN;
    /** the pitch the rig gives a lens distance (zone hint blend; portrait / boss fixed): the solver's pitch(d) */
    this._pitchOf = (d) => this._pitchAt(d);
    this._view.pitchOf = this._pitchOf;
    this._yawT = 1; this._yawFrom = ISO.yaw; this._yawTo = ISO.yaw; this._yawDur = 1;
    /** §2.2 zone hint dist / pitch blends: { from, to (NaN = no hint), t (0 → 1), dur } */
    this._hDist = { from: NaN, to: NaN, t: 1, dur: 1 }; this._hPitch = { from: NaN, to: NaN, t: 1, dur: 1 };
    /** the zone hint in effect ({ yaw, pitch, dist, clear, zone }) or null; world drives setHint (zoneHints false) */
    this.hint = null; this.zoneHints = false;
    this._hv = { dist: NaN, distW: 0, pitch: NaN, pitchW: 0 };
    this._isoD = NaN; this._isoP = NaN;
    /** one frustum per rendered frame (read-only for others: occluders, onscreen, activity tiers, LOD) */
    this._frustum = new THREE.Frustum(); this._frustumOk = false;
    this.frustum = this._frustum;
    this._recentrePan = false; this._centreT = 0; this._selSource = null;
    // the arm cast for a physics that honours opts.ignore: camera-transparent statics, plus slender solids in boss fights
    this._armOptsIgnore = Object.freeze({ terrain: true, mesh: true, statics: true, ignore: (src) => this._transparent(src) });
    this._cut.castFn = (o, d, max, r) => this._cast(o, d, max, r);
  }

  /** Is this static collider see-through for the arm right now (camTransparent + boss-fight slender solids)? */
  _transparent(src) {
    return camTransparent(src) || (this.bossActive && !!src && typeof src === 'object' && BOSS_PASS.has(src));
  }

  // ------------------------------------------------------------------ system contract
  async init() {
    const bus = this.ctx.bus;
    this._offs.push(
      bus.on(E.SHAKE, (p) => this.shake(p?.trauma ?? 0)),
      bus.on(E.CAM_MODE, (p) => {
        if (!p) return;
        if (p.preset) this.preset(p.preset, p.anchor, p);
        else if (p.mode) this.mode(p.mode, p);
      }),
      bus.on(E.PLAYER_SPAWNED, () => this.snapBehind()),
      bus.on(E.LEVEL_LOADING, () => this._onLevelUnload()),
      bus.on(E.LEVEL_UNLOAD, () => this._onLevelUnload()),
      bus.on(E.LEVEL_LOADED, (p) => this._onLevelLoaded(p)),
      bus.on(E.BOSS_START, () => { this._setBoss(true); this._onBossStart(); }),
      bus.on(E.BOSS_DEFEATED, () => { this._setBoss(false); this._bossHoldT = ISO.boss.defeatHold; this._dizzy.on = false; }),
      bus.on(E.ARENA_CLEAR, (p) => {
        if (!this.ctx.enemies?.boss?.alive) this._setBoss(false);
        this._arena.locked = false;
        this._queueBeat('exhale', 0, 0, 0);
      }),
      // AUTOCAM §8: beats and boss moments
      bus.on(E.KITTEN_REVEAL, (p) => {
        const k = p?.kittenId ?? null, pos = p?.position;
        if (!pos || !Number.isFinite(pos.x) || this.beat.fired.has(`peek:${k}`)) return;
        this.beat.fired.add(`peek:${k}`);
        this._queueBeat('peekaboo', pos.x, pos.z, 0);
      }),
      bus.on(E.KITTEN_RESCUED, (p) => { const pos = p?.position; if (pos && Number.isFinite(pos.x)) this._queueBeat('cosy', pos.x, pos.z, 0); }),
      bus.on(E.ARENA_LOCK, (p) => {
        const c = p?.center, r = Number.isFinite(p?.r) ? p.r : 0;
        const A = this._arena;
        A.id = p?.id ?? null; A.locked = true;
        if (c && Number.isFinite(c.x)) { A.x = c.x; A.z = c.z; A.r = r; } else A.r = 0;
        // room read: once per arena, never right after a boss intro cutscene (the boss establishing read covers it)
        const key = `room:${A.id}`;
        if (A.r > 0 && !this.beat.fired.has(key) && this._realT - this._lastCutEnd > CUT_RECENT) { this.beat.fired.add(key); this._queueBeat('roomRead', A.x, A.z, A.r); }
      }),
      bus.on(E.BOSS_PHASE, () => { if (!this.ctx.state?.settings?.reduceCameraMotion) this._breathT = 0; }),
      bus.on(E.TARGET_CHANGED, () => { this._forceSolve = true; }),
      bus.on(E.PLAYER_HOLY, () => { this._fovPunchT = 0.15; }),
      // Golden Hour activation punch-in, unless the player already framed it with a preset shot (§7.5 HERO_LOW)
      bus.on(E.PLAYER_GOLDEN, (p) => { if (p?.on && GAMEPLAY.has(this.modeName)) this._goldenT = this._goldenTotal(); }),
      bus.on(E.DIALOG_LINE, (p) => { this._speakerId = p?.speaker ?? null; }),
      bus.on(E.DIALOG_START, () => { this._speakerId = null; this._dlgMid.set(0, 0, 0); }),
      bus.on(E.DIALOG_END, () => { this._speakerId = null; }),
      bus.on(E.BOSS_DIZZY, (p) => {
        if (p?.dizzy && !this._dizzyShaken) { this._dizzyShaken = true; this.shake(JUICE.dizzy.shake); } else if (!p?.dizzy) this._dizzyShaken = false;
        // §8.2 Dizzy punch (D11): −1.0 m while dizzy (≤ 3 s), only with every hard subject inside fitRect
        if (p?.dizzy && !this._dizzy.on) { this._dizzy.on = true; this._dizzy.t = 0; } else if (!p?.dizzy) this._dizzy.on = false;
      }),
      // safety handback when a scene ends with the camera still held (story normally calls mode('follow') itself).
      // Deferred to the next frame so a chained scene (CS-09 → CS-10, `end.cam: false`) keeps its shot instead.
      bus.on(E.CUTSCENE_END, (p) => {
        this._lastCutEnd = this._realT;
        if (this.modeName === 'preset' || this.modeName === 'cutscene') this._handback = p?.skipped ? 0 : this.isIso ? ISO.cut.handback : CAMERA.ease;
      }),
      bus.on(E.CUTSCENE_START, () => { this._handback = -1; }),
      bus.on(E.GAME_MODE, (p) => { if (p?.mode === 'cutscene' || p?.mode === 'dialog') this.unlock(); }),
      bus.on(E.HIT, (p) => { if (p && p.target === this.ctx.player) this._noteAttacker(p.attacker); }),
      bus.on(E.PLAYER_DAMAGED, (p) => { this._noteAttacker(p?.source); if (!this.camLocked) { this._recentrePan = true; this._semiHome = true; } }),
      // §10.4 semi: dealing damage springs the pan home too
      bus.on(E.HIT, (p) => { if (p && p.attacker === this.ctx.player && this.camLockMode === 'semi') this._semiHome = true; }),
      // §2.4 punches (real time): parry −0.6 m, Holy +3° FOV, Purrfect Dodge −0.4 m through its slow motion
      bus.on(E.PLAYER_PARRY, () => { this._punchT = 0; }),
      bus.on(E.SETTINGS_CHANGED, (p) => this._onSetting(p)),
      bus.on(E.PLAYER_HOLY, () => { this._holyT = 0; }),
      bus.on(E.PLAYER_PERFECT_DODGE, (p) => { if (!p?.graze) this._dodgeT = 0; }),
      bus.on(E.ENEMY_ALERTED, (p) => { if (!this.camLocked && p?.enemy?.pos && this.ctx.player && p.enemy.pos.distanceTo(this.ctx.player.pos) < 8) this._recentrePan = true; }),
    );
    // AUTOCAM §6.2: live wind-ups aimed at her (THREAT) and boss lane ends (BOSS_LANE), with game-time windows
    this._tel.attach(this.ctx.bus, () => this.ctx.game?.time ?? this._realT, () => this.ctx.player, () => this._liveBoss());
    this._offs.push(() => this._tel.detach());
    this._lockModeFromSettings(false);
    this._marker.build(this.ctx.scene);
    this._outPose.pos.copy(this.ctx.camera.position);
    this.ctx.camera.getWorldDirection(_tmp);
    this._outPose.look.copy(this.ctx.camera.position).addScaledVector(_tmp, 4);
    this._outPose.fov = this.ctx.camera.fov;
  }

  /** Fixed step: input edges (lock-on, switch, recenter) and lock validation. */
  update(dt) {
    const ctx = this.ctx, input = ctx.input, gm = ctx.game?.mode;
    if (this._attackerT > 0 && (this._attackerT -= dt) <= 0) this._attacker = null;
    this._photoCamGuard();
    if (this.isIso) {
      if (gm === 'play' && GAMEPLAY.has(this.modeName)) this._isoInput(dt);
      this._validateLock(dt);
      this._threat = this._nearThreat();
      if (this.bossActive && !this._bossForced && ctx.enemies && !ctx.enemies.boss?.alive && !ctx.levels?.loading) this._setBoss(false);
      return;
    }
    if (gm === 'play' && GAMEPLAY.has(this.modeName)) {
      if (input.pressed('recenter')) this.recenter();
      if (input.pressed('lockon')) { if (this.lockTarget) this.unlock(); else if (!this.lock()) this.recenter(); }
      if (input.pressed('lockNext')) this.switchLock(1, true);
      if (input.pressed('lockPrev')) this.switchLock(-1, true);
    }
    this._validateLock(dt);
    this._threat = this._nearThreat();
    if (this.bossActive && !this._bossForced && ctx.enemies && !ctx.enemies.boss?.alive && !ctx.levels?.loading) this._setBoss(false);
  }

  /** §10.2.12: is the Photo Cam held off right now (prologue / practice / an onboarding target)? Reads ctx defensively. */
  photoCamBlocked() {
    const ctx = this.ctx, st = ctx.state, g = ctx.ui?.beacon?.guide, cur = ctx.levels?.current;
    const flag = (f) => !!st?.getFlag?.(f);
    return photoCamBlocked({
      prologueDone: flag('prologue.done'), onboardDone: flag('onboard.done'),
      practice: !flag('prologue.practice') && !flag('prologue.tutorial') && !flag('prologue.done') && cur?.id === 'meadow' && cur?.spawnId === 'practice',
      tutorial: !!ctx.story?.tutorial?.active, guideKind: g?.kind ?? null, guideHas: !!g?.has, meadow: (cur?.id ?? st?.levelId) === 'meadow',
    });
  }

  /**
   * §10.2.12 (the player's MemeCamTrigger owns the trigger; requests/tokentails-tt2-g1.md asks it to read
   * photoCamBlocked() itself): after the player's step, keep its idle / Stand clocks at zero while blocked, so the idle
   * and manual triggers never reach their thresholds. Fixed step.
   */
  /** A blocked Photo Cam entry: hand the mode straight back (the trigger finishes on its next step). */
  _refuseMeme() {
    const g = this.ctx.game;
    if (g?.mode === 'memecam') g.setMode('play');
  }

  _photoCamGuard() {
    const tr = this.ctx.player?.memeCamTrigger;
    if (!tr || tr.active || this.ctx.params?.test || !this.photoCamBlocked()) return;   // ?test: deterministic smoke hooks stay
    tr.idleT = 0; tr.standT = 0; tr.bonus = 0;
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    this._cut.stop();
    this._fader.dispose();
    this._marker.dispose();
  }

  // ------------------------------------------------------------------ public API
  /** Switch camera mode (see header). Returns the camera (chainable). */
  mode(name, opts = {}) {
    opts = opts ?? {};
    const prev = this.modeName;
    this._handback = -1;
    switch (name) {
      case 'follow':
      case 'lock':
      case 'boss': {
        if (name === 'boss') { this._bossForced = !this.ctx.enemies?.boss?.alive; this._setBoss(true); }   // with a live boss it ends with the boss
        if (name === 'follow') { this._bossForced = false; if (!this.ctx.enemies?.boss?.alive) this._setBoss(false); }
        if (!GAMEPLAY.has(prev)) {
          const def = prev === 'meme' ? PLAYER.memeCam.blendOut : this.isIso ? ISO.cut.handback : CAMERA.ease;
          let blend = opts.blend === false ? 0 : typeof opts.blend === 'number' ? opts.blend : def;
          if (prev === 'meme') { this._meme.exit(); this.ctx.bus.emit(E.MEME_CAM, { on: false }); }
          else { this._cut.stop(); if (opts.keepYaw !== true) this._behind(); }
          // AUTOCAM §8.3 hand-back pre-solve: the springs re-seed and the solver runs on this frame's subjects, so
          // the blend lands on the real gameplay frame and no second move follows; §10.1: a veil cut instead
          this._snap = true; this._forceSolve = true;
          if (this.isIso && blend > 0 && this.ctx.state?.settings?.reduceCameraMotion) { blend = 0; this._veil(); }
          this._markPlayerPos();            // a cutscene may have moved her: that is not a teleport (keep the blend)
          this._startBlend(blend, opts.ease, this._playerPivot(_blendPivot), false, this.isIso);
          this._setCinematic(false, blend);
        }
        this.modeName = 'follow';
        this.presetState = null;
        if (name === 'lock') this.lock(opts.target ?? null);
        else if (name === 'follow') this.unlock();
        this._syncGameplayMode();
        break;
      }
      case 'meme': {
        if (prev === 'meme') break;
        const p = this.ctx.player;
        if (!p) { console.warn('[camera] meme mode needs the player'); break; }
        // §10.2.12: the player's Photo Cam trigger (game mode 'memecam') never enters during the prologue / practice or an
        // onboarding target (real play; ?test keeps the hook; scripted callers are not refused)
        if (this.ctx.game?.mode === 'memecam' && !this.ctx.params?.test && opts.force !== true && this.photoCamBlocked()) { this._refuseMeme(); break; }
        this.unlock();
        this._cut.stop();
        this.beat.stop();
        this.presetState = null;
        const calm = !!this.ctx.state?.settings?.reduceCameraMotion;
        this._meme.swayMul = calm ? REDUCE_MEME_SWAY : 1;
        this._meme.enter(p, opts.yawOffset ?? this.memeYawOffset(p));
        this.modeName = 'meme';
        // §10.1: with Reduce camera motion the descent is a veil crossfade
        let blend = typeof opts.blend === 'number' ? opts.blend : PLAYER.memeCam.blendIn;
        if (calm && this.isIso && blend > 0) { blend = 0; try { this.ctx.ui?.flash?.(FADE_COLOR, 1, ISO.reduce.memeVeil ?? 0.4); } catch { /* no veil */ } }
        this._startBlend(blend, opts.ease ?? 'inOutSine', this._playerPivot(_blendPivot), false, this.isIso);
        this._setCinematic(false, 0);                           // never on the Meme Cam (ART §3.3, X25)
        this.ctx.bus.emit(E.MEME_CAM, { on: true });
        break;
      }
      case 'preset':
        this.preset(opts.preset ?? 'HERO_LOW', opts.anchor ?? 'swordcat', opts);
        break;
      case 'cutscene':
        if (prev === 'meme') { this._meme.exit(); this.ctx.bus.emit(E.MEME_CAM, { on: false }); }
        this.unlock();
        this._cut.stop();
        this.beat.stop();
        this._holdPose.copy(this._outPose);
        this._blend.active = false;
        this.presetState = null;
        this.modeName = 'cutscene';
        this._setCinematic(true, 0);
        break;
      default:
        console.warn(`[camera] unknown mode "${name}"`);
        return this;
    }
    this.modeOpts = opts;
    return this;
  }

  /** Hold a §5.2 preset framing relative to `anchor` (opts = the rest of the §5.1 cam step). Chainable. */
  preset(name, anchor = 'swordcat', opts = {}) {
    const step = { ...(opts ?? {}), preset: name, anchor: anchor ?? opts?.anchor ?? 'swordcat' };
    if (step.mode && !SHOT_MODES.includes(step.mode)) delete step.mode;          // e.g. a camera:mode payload's mode 'preset'
    if (!step.mode && typeof step.blend === 'number' && step.blend > 0) { step.mode = 'blend'; step.dur ??= step.blend; }
    this.shot(step);
    return this;
  }

  /**
   * Run one §5.1 `cam` step. Resolves after its `dur` (cut / zero dur: right away).
   * @param {object} step @returns {Promise<void>}
   */
  shot(step) {
    this._handback = -1;
    if (this.modeName === 'meme') { this._meme.exit(); this.ctx.bus.emit(E.MEME_CAM, { on: false }); }
    if (this.lockTarget) this.unlock();
    const promise = this._cut.start(step ?? {}, this._outPose);
    const s = this._cut.shot;
    this.modeName = 'preset';
    /** M0-compatible view of the running shot: { name, anchor, opts } */
    this.presetState = { name: s.preset, anchor: step?.anchor ?? 'swordcat', opts: step ?? {} };
    this.beat.stop();                                         // entering a shot drops a beat, no exit blend (§8.1)
    const fromPlay = this._blend.iso || this._isoW > 0.5;
    if (s.mode === 'blend' && s.dur > 0) {
      _blendPivot.copy(this._cut.subject); _blendPivot.y += 0.8;
      // gameplay → shot: the iso pose-space blend (log distance, yaw arc); shot → shot: the cylindrical arc
      this._startBlend(s.dur, s.ease, _blendPivot, true, this.isIso && fromPlay);
    } else this._blend.active = false;
    // ART §3.3: the cinematic look on preset / cutscene shots (High only; core no-ops elsewhere), never the title loop
    if (!this._cut.looping) this._setCinematic(true, s.mode === 'blend' ? s.dur : 0);
    return promise;
  }

  /**
   * AUTOCAM / story hand-off helper (WA camera.W1): blend into `mode` over `dur` s with `ease` (e.g. the title
   * MEME_LOOP → follow over 1.1 s inOutSine on New game). Input never waits for it. Chainable.
   * @param {string} mode @param {number} dur @param {string|Function} [ease]
   */
  blendTo(mode, dur, ease = 'inOutSine') { return this.mode(mode, { blend: Math.max(0, +dur || 0), ease }); }

  /** postfx.setCinematic on change only (ART §3.3: on at shot / cutscene enter, off on the hand-back). */
  _setCinematic(on, dur) {
    if (this._cinematic === !!on) return;
    this._cinematic = !!on;
    try { this.ctx.postfx?.setCinematic?.(!!on, { dur: Math.max(0, dur || 0) }); } catch (e) { console.warn('[camera] setCinematic', e); }
  }

  /** Add camera trauma (0..1). */
  shake(trauma) { this.shaker.add(Math.max(0, +trauma || 0)); return this; }

  /** Put the camera behind the player immediately (level load, respawn, teleport). */
  snapBehind() {
    this._behind();
    this._snap = true;
    if (GAMEPLAY.has(this.modeName)) this._blend.active = false;
  }

  /** Swing behind the player quickly (R3 / lock-on with nothing to lock). */
  recenter() { this._recenter = true; }

  /** Lock onto `target` (or the best candidate). Returns the target or null. */
  lock(target = null) {
    const p = this.ctx.player;
    if (!p) return null;
    const t = target && lockable(target) ? target
      : acquireLockTarget(this._candidates(), p.pos, this.yaw, LOCK, this._attackerT > 0 ? this._attacker : null);
    if (!t) return null;
    const prev = this.lockTarget;
    this.lockTarget = t;
    this._losT = 0;
    this._flick.reset();
    this._syncGameplayMode();
    if (prev !== t) this.ctx.bus?.emit?.(E.TARGET_CHANGED, { actor: t, prev, source: this._selSource ?? 'auto' });
    return t;
  }

  /** §7.4 select `actor` (a hostile) as the target, or clear with null. `source` for E.TARGET_CHANGED. */
  select(actor, source = 'click') {
    this._selSource = source;
    try {
      if (!actor) { this.unlock(); return null; }
      return this.lock(actor);
    } finally { this._selSource = null; }
  }

  /** Remember who just hit her (a projectile counts as its owner). */
  _noteAttacker(att) {
    const a = att?.isProjectile ? (att.owner ?? null) : att;
    if (!a || a === this.ctx.player || !a.pos) return;
    this._attacker = a;
    this._attackerT = RECENT_ATTACKER_TIME;
  }

  unlock() {
    if (!this.lockTarget) return;
    const prev = this.lockTarget;
    this.lockTarget = null;
    this._syncGameplayMode();
    this.ctx.bus?.emit?.(E.TARGET_CHANGED, { actor: null, prev, source: this._selSource ?? 'clear' });
  }

  /** Switch the lock to the next target on the right (+1) / left (−1). */
  switchLock(dir, wrap = false) {
    const p = this.ctx.player;
    if (!p || !this.lockTarget) return null;
    const t = switchLockTarget(this._candidates(), p.pos, this.yaw, this.lockTarget, dir > 0 ? 1 : -1, LOCK.range, wrap);
    if (t) { this.lockTarget = t; this._losT = 0; }
    return t;
  }

  /** Register / unregister a fadeable prop (static; see Occluders.js). */
  addFadeable(obj) { const n = this._fader.add(obj, this.ctx.scene); if (n) this._markFadeColliders(); return n; }
  removeFadeable(obj) { this._fader.remove(obj); }
  /** Re-register a fadeable whose instances / matrices changed (e.g. a BatchedMesh that grew). */
  refreshFadeable(obj) { return this._fader.refresh(obj, this.ctx.scene); }

  /**
   * Loop time (0..memePeriod s) of the running Meme Cam, or of a cutscene shot holding the MEME_LOOP sway
   * (CS-00 title, CS-02 shot 7); 0 otherwise. The cape sway shader and the grass wind use it (same 3.8 s period).
   */
  get memeT() {
    if (this._meme.active) return this._meme.t;
    if (this.modeName === 'preset' && this._cut.looping) return this._cut.loopT;
    return 0;
  }
  get memePhase() { return this.memeT / this._meme.period; }
  get memePeriod() { return this._meme.period; }
  /** true while the Meme Cam or a MEME_LOOP-style looping shot is on screen */
  get memeLooping() { return this._meme.active || (this.modeName === 'preset' && this._cut.looping); }
  /** true while a cutscene shot is running or held */
  get inShot() { return this.modeName === 'preset'; }
  /** the running shot's normalized step (read-only) or null */
  get currentShot() { return this._cut.shot; }
  /**
   * Seconds left of the running pose blend (hand-back, mode blend, shot blend), 0 when none (requests/fx.md: fx fades
   * her decals back in over the last 0.3 s of the hand-back).
   */
  get blendLeft() { const b = this._blend; return b.active ? Math.max(0, b.dur - b.t) : 0; }

  /**
   * Rotation (rad) of the MEME_LOOP framing around `actor` that gives the lens a clear view of her face: the first
   * of MEME_YAWS whose line from her eyes to the camera (a 0.12 m sphere: the near plane) hits no terrain,
   * architecture or static prop. 0 when every candidate is blocked or there is no physics. Within `r` m of the level's
   * `memeSpot` its authored yaw is tried first (§2.7).
   * @param {any} actor
   */
  memeYawOffset(actor) {
    const ph = this.ctx.physics;
    if (!actor || !ph?.raycast) return 0;
    const P = PRESETS.MEME_LOOP, o = actor.object3d?.position ?? actor.pos, f = actor.facing ?? 0;
    const sphere = typeof ph.sphereCast === 'function';
    _org.set(o.x, o.y + MEME_EYE_Y, o.z);
    // §2.7: idling within r (ISO.meme.spotR) of the level's memeSpot → its authored yaw (if that view is clear)
    const spot = this.ctx.levels?.current?.memeSpot;
    const offs = _memeOffs; offs.length = 0;
    if (spot?.at && Number.isFinite(spot.yaw) && Math.hypot(o.x - spot.at[0], o.z - spot.at[1]) <= (spot.r ?? ISO.meme.spotR)) offs.push(wrapAngle(spot.yaw - f));
    for (const off of MEME_YAWS) offs.push(off);
    for (const off of offs) {
      localToWorld(P.pos, o, f + off, _tgt);
      _losDir.subVectors(_tgt, _org);
      const len = _losDir.length();
      if (len < 1e-3) return 0;
      _losDir.multiplyScalar(1 / len);
      _ray.set(_org, _losDir);
      const hit = sphere ? ph.sphereCast(_ray, MEME_LENS_R, len, MEME_CAST) : ph.raycast(_ray, len + MEME_LENS_R, MEME_CAST);
      if (!hit) return off;
    }
    return 0;
  }

  // ------------------------------------------------------------------ iso API (CONTROLS_SPEC §12 camera 2)
  /** The lens → focus distance of the iso rig (m; `distance` is the classic arm). */
  get isoDistance() { return this.isoInfo.dist; }

  /**
   * Zoom multiplier (0.70–1.40; per orientation, AUTOCAM §10.3). Returns the clamped value. Emits E.CAM_ZOOM. A zoom
   * from input (`save` true) is written to settings.camZoom / camZoomPortrait a moment later.
   * @param {number} mul @param {boolean} [save]
   */
  zoom(mul, save = true) {
    const z = clamp(+mul || 1, ISO.zoom[0], ISO.zoom[1]);
    if (z !== this.zoomMul) {
      this.zoomMul = z;
      this.ctx.bus?.emit?.(E.CAM_ZOOM, { dist: this.isoInfo.dist, mul: z });
      if (save) this._zoomSaveT = ZOOM_SAVE_T;
    }
    return z;
  }

  /**
   * §2.2 zone hint `{ yaw?, pitch?, dist?, clear?, zone? }` blended over `blend` s (easeInOutSine; 0 = snap). A missing
   * yaw means the level yaw; a missing pitch / dist eases back to the rig's own (the distance curve, 13 / 12 m). `dist`
   * is the base distance before the player's zoom and every clamp (cat size, [9, 18]); `pitch` is in rad. `null`
   * clears the hint. World calls it on zone changes, out of combat only (Level.js); `clear` is Env's.
   */
  setHint(h, blend = ISO.hint.blend) {
    const level = this.ctx.levels?.current;
    const lvlYaw = Number.isFinite(level?.cam?.yaw) ? level.cam.yaw : Number.isFinite(level?.def?.cam?.yaw) ? level.def.cam.yaw : ISO.yaw;
    const yaw = Number.isFinite(h?.yaw) ? h.yaw : lvlYaw;
    const b = Math.max(0, +blend || 0);
    this.hint = h ? { ...h } : null;
    if (Math.abs(wrapAngle(yaw - (this._yawT < 1 ? this._yawTo : this.isoYaw))) > 1e-4) {
      this._yawFrom = this.isoYaw; this._yawTo = yaw; this._yawT = b > 0 ? 0 : 1; this._yawDur = Math.max(1e-3, b);
      if (b <= 0) this.isoYaw = yaw;
    }
    const slot = (s, to) => {
      const cur = this._hintNow(s);
      if (Number.isNaN(to) && Number.isNaN(s.to) && s.t >= 1) return;
      if (to === s.to && s.t >= 1) return;
      s.from = cur; s.to = to; s.t = b > 0 ? 0 : 1; s.dur = Math.max(1e-3, b);
    };
    slot(this._hDist, Number.isFinite(h?.dist) ? h.dist : NaN);
    slot(this._hPitch, Number.isFinite(h?.pitch) ? h.pitch : NaN);
  }

  /** The value a hint slot holds now (NaN = no hint; a blend toward / from "no hint" reports its hinted end). */
  _hintNow(s) {
    if (s.t >= 1) return s.to;
    if (Number.isNaN(s.from)) return s.to;
    if (Number.isNaN(s.to)) return s.from;
    return s.from + (s.to - s.from) * easeInOutSine(s.t);
  }

  /** Advance a hint slot and write { v, w } (value, weight 0..1) into `o` under `kv` / `kw`. */
  _hintStep(s, dt, o, kv, kw) {
    if (s.t < 1) s.t = Math.min(1, s.t + dt / s.dur);
    const e = easeInOutSine(s.t);
    if (Number.isNaN(s.from) && Number.isNaN(s.to)) { o[kv] = NaN; o[kw] = 0; }
    else if (Number.isNaN(s.from)) { o[kv] = s.to; o[kw] = e; }
    else if (Number.isNaN(s.to)) { o[kv] = s.from; o[kw] = 1 - e; }
    else { o[kv] = s.from + (s.to - s.from) * e; o[kw] = 1; }
  }

  /** CSS px → walkable ground point (Picker.screenToGround). */
  screenToGround(x, y, out = new THREE.Vector3()) { return screenToGround(this.ctx, x, y, out); }
  /** World point → CSS px { x, y, z, on }. */
  worldToScreen(p, out) { return w2s(this.ctx, p, out); }
  /**
   * Is world point `p` visible to the player (AUTOCAM §7.3, X13: gameplay fairness only)? In the iso rig: projected
   * inside SafeFrame's `threat` rect and outside every HUD / thumb hole, with `margin` m of clearance around it (metres
   * → screen via the footprint). Cutscenes / classic: the frustum shrunk by `margin` m. Perf code uses inView / activityOf.
   */
  onScreen(p, margin = AIM.onScreenMargin ?? 0) {
    const cam = this.ctx.camera;
    if (!cam || !p) return true;
    if (!this._frustumOk) {                                  // not rendered by this rig yet: the camera as it stands
      if (!(this.ctx.game?.frameCount > 0)) return true;     // boot / node tests: no meaningful pose → unknown = on screen
      cam.updateMatrixWorld();
      _projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      this._frustum.setFromProjectionMatrix(_projView);
    }
    if (!this.isIso || this._isoW < 0.5) {
      const pl = this._frustum.planes;
      for (let i = 0; i < 6; i++) if (pl[i].distanceToPoint(p) < margin) return false;
      return true;
    }
    _v3.set(p.x, p.y, p.z).project(cam);
    if (_v3.z > 1 || _v3.z < -1) return false;
    const sx = (_v3.x + 1) / 2, sy = (1 - _v3.y) / 2, f = this.safeFrame, fp = this.footprint;
    const gw = fp.valid && fp.halfW > 0 ? 2 * fp.halfW : 20, gh = fp.valid && fp.ahead + fp.behind > 0 ? fp.ahead + fp.behind : 14;
    const mx = Math.max(0, margin) / gw, my = Math.max(0, margin) / gh;
    return f.visible(sx, sy) && f.visible(sx - mx, sy) && f.visible(sx + mx, sy) && f.visible(sx, sy - my) && f.visible(sx, sy + my);
  }

  /** PERF §4.3 / X13: is the sphere (p, r) inside this frame's frustum? (perf only; true before the first frame) */
  inView(p, r = 0) {
    if (!this._frustumOk || !p) return true;
    _sph.center.set(p.x, p.y, p.z); _sph.radius = Math.max(0, r);
    return this._frustum.intersectsSphere(_sph);
  }

  /**
   * PERF §4.3 activity tier of an actor, cached per frame on the actor (_tier / _tierFrame): 0 = its bounding sphere
   * (+ 2 m) is in the frustum; 1 = within 30 m of the focus; 2 = within 60 m; 3 = beyond. Classic: 0 within 40 m, 3
   * beyond. Characters / enemies / companions drive `setActivity(tier)` from it.
   */
  activityOf(actor) {
    if (!actor) return 3;
    if (actor._tierFrame === this.frameId && actor._tier !== undefined) return actor._tier;
    const pos = actor.object3d?.position ?? actor.pos;
    let tier = 0;
    if (pos && this._frustumOk) {
      const dx = pos.x - this.focus.x, dz = pos.z - this.focus.z, d = Math.hypot(dx, dz);
      if (!this.isIso) tier = d <= ACT.classic ? 0 : 3;
      else {
        const h = actor.height ?? 1, r = Math.max(actor.radius ?? 0.5, h * 0.5) + ACT.margin;
        _sph.center.set(pos.x, pos.y + h * 0.5, pos.z); _sph.radius = r;
        tier = this._frustum.intersectsSphere(_sph) ? 0 : d <= ACT.near ? 1 : d <= ACT.far ? 2 : 3;
      }
    }
    actor._tier = tier; actor._tierFrame = this.frameId;
    return tier;
  }

  /** AUTOCAM §9.1: is ground point (x, z) inside the visible footprint grown by `pad` m? (true when unknown) */
  inFootprint(x, z, pad = 0) {
    const fp = this.footprint;
    return fp.valid ? inQuad(fp.q, x, z, pad) : true;
  }

  /** AUTOCAM §6.6: the ground screen axes at the current yaw → outU (screen-up) / outR (screen-right), {x, z}. */
  groundAxes(outU, outR) {
    const y = this.isIso ? this.isoYaw : this.yaw;
    if (outU) { outU.x = -Math.sin(y); outU.z = -Math.cos(y); if ('y' in outU) outU.y = 0; }
    if (outR) { outR.x = Math.cos(y); outR.z = -Math.sin(y); if ('y' in outR) outR.y = 0; }
    return outU;
  }

  /**
   * Her resting screen point (CSS px of the canvas: her focus at the SafeFrame anchor, no lead) for ui's touch layout
   * (requests/camera.md). Follows the mirrored (left-handed) cluster automatically: SafeFrame reads the layout.
   * @param {{x:number,y:number}} [out]
   */
  heroScreen(out = { x: 0, y: 0 }) {
    const A = this._anc;
    out.x = A.toX * this._viewW(); out.y = A.toY * this._viewH();
    return out;
  }

  /**
   * Debug / smoke probe (AUTOCAM §11.2): her feet / head on screen (CSS px), d, fov, the anchor, lead, lean, footprint,
   * the engaged set with their SafeFrame visibility. Allocates (debug only).
   */
  probe() {
    const cam = this.ctx.camera, p = this.ctx.player, W = this._viewW(), H = this._viewH();
    const scr = (x, y, z) => { _v3.set(x, y, z).project(cam); return [(_v3.x + 1) / 2 * W, (1 - _v3.y) / 2 * H]; };
    const pos = p?.object3d?.position ?? p?.pos;
    const fp = this.footprint, A = this._anc, sf = this.safeFrame;
    return {
      t: this._realT, frame: this.frameId, mode: this.modeName, yaw: this.yaw,
      feet: pos ? scr(pos.x, pos.y, pos.z) : null, head: pos ? scr(pos.x, pos.y + (ISO.catHView ?? 1), pos.z) : null,
      d: this.isoInfo.dist, pitch: this.isoInfo.pitch, fov: this.isoInfo.fov, fx: A.x, fy: A.y, W, H,
      lead: [this._lead.x, this._lead.z], lean: [this._lean.x, this._lean.z], bias: this._bias, aim: [this._aim.x, this._aim.z], guideLook: [this.guideLook.x, this.guideLook.z],
      extra: this._extra, snug: this._snug, beat: this.beat.id, beatW: this.beat.w, closeUp: this.closeUp, far: cam?.far,
      core: { ...sf.core }, herFrame: { ...sf.herFrame }, threat: { ...sf.threat }, profile: this.profile,
      footprint: { q: Array.from(fp.q), cx: fp.cx, cz: fp.cz, ahead: fp.ahead, behind: fp.behind, halfW: fp.halfW, halfWTop: fp.halfWTop, slantMax: fp.slantMax, d: fp.d, version: fp.version, valid: fp.valid },
      engaged: this.engaged.map((a) => { const q = a.object3d?.position ?? a.pos; return { id: a.id ?? null, visible: q ? this.onScreen(q, 0) : false }; }),
    };
  }

  /**
   * AUTOCAM §7.4 / gate camera:threat-visibility: every engaged foe the player cannot see this frame (dropped by the
   * framing ladder, past the zoom cap, or under a HUD / thumb hole: `onScreen` false), whether or not it is winding up.
   * ui threatArrows arrows each one. Zero allocation: fills and returns `out` (cleared first).
   * @param {object[]} out @returns {object[]}
   */
  hiddenEngagedInto(out) {
    out.length = 0;
    const eng = this._engA;
    for (let i = 0; i < eng.length; i++) {
      const a = eng[i], q = a?.object3d?.position ?? a?.pos;
      if (!q || a.alive === false || a.dead) continue;
      _hidP.set(q.x, q.y + (a.height ?? 1) * 0.6, q.z);
      if (!this.onScreen(_hidP, 0)) out.push(a);
    }
    return out;
  }

  /** Debug / smoke: the framing solve { need, d, lean, subjects, dropped, beat } (AUTOCAM core.5). Allocates. */
  framing() {
    const S = this.subjects, g = this._goal, subs = [];
    for (let i = 0; i < S.n; i++) {
      const o = i * STRIDE, d = S.data;
      subs.push({ cls: CLS_NAMES[d[o + SC]] ?? d[o + SC], x: d[o + SX], y: d[o + SY], z: d[o + SZ], r: d[o + SR], w: d[o + SW], hard: !!(d[o + SF] & F_HARD), dropped: !!(d[o + SF] & F_DROP), id: S.keys[i]?.id ?? null });
    }
    return { need: g.need, d: g.d, lean: [g.leanR, g.leanU], subjects: subs, dropped: g.dropped, holes: g.holes, capped: g.capped, cap: this._goalNext.cap ?? null, beat: this.beat.id, limits: { ...this._lim } };
  }

  /**
   * §7.6 pick at CSS px: { kind, actor, id, interact, point }. `opts.touch` widens the tolerance. Pass `out` (a
   * previous result) to reuse it; a fresh object otherwise (callers may keep it).
   */
  pick(x, y, opts = {}, out = { kind: 'ground', actor: null, id: null, interact: null, point: new THREE.Vector3(), px: 0 }) { return pickAt(this.ctx, x, y, opts, out); }
  /** Debug / smoke: the live iso framing { yaw, pitch, dist, fov, focus: [x, y, z], catPx, portrait, phone, locked }. */
  iso() {
    const i = this.isoInfo;
    return { yaw: i.yaw, pitch: i.pitch, dist: i.dist, fov: i.fov, focus: this.focus.toArray(), catPx: i.catPx, portrait: i.portrait, phone: i.phone, locked: this.camLocked, lockMode: this.camLockMode, zoom: this.zoomMul, hint: this.hint, profile: i.profile, far: this.farPlane, anchor: [this._anc.x, this._anc.y] };
  }

  /**
   * §2.3 / AUTOCAM §10.4 camera lock (Y): on = 'locked'; off = the last unlocked mode ('free' by default, 'semi' once
   * chosen in Settings). Toasts the change. Returns whether it is locked.
   */
  setCamLock(on, toast = true) { return this.setCamLockMode(on ? 'locked' : this._lastUnlocked, toast) === 'locked'; }

  /**
   * Set the desktop lock mode ('locked' | 'semi' | 'free'; pad / touch are always locked in play). Writes
   * settings.camLockMode (+ the retired boolean camLock, kept in sync, K7) and emits settings:changed on change.
   */
  setCamLockMode(mode, toast = true) {
    const m = LOCK_MODES.includes(mode) ? mode : 'locked';
    const was = this.camLockMode;
    this.camLockMode = m; this.camLocked = m === 'locked';
    if (m !== 'locked') this._lastUnlocked = m;
    if (this.camLocked) { this._pan.set(0, 0, 0); this._semi.x = 0; this._semi.z = 0; }
    const st = this.ctx.state?.settings;
    if (st && (st.camLockMode !== m || st.camLock !== this.camLocked)) {
      st.camLockMode = m; st.camLock = this.camLocked;
      this._writing = true;
      try { this.ctx.bus?.emit?.(E.SETTINGS_CHANGED, { key: 'camLockMode', value: m }); } finally { this._writing = false; }
    }
    if (toast && was !== m) this.ctx.bus?.emit?.(E.TOAST, { text: this.ctx.strings?.t?.(this.camLocked ? 'toast.cam.locked' : 'toast.cam.unlocked') ?? '' });
    return m;
  }

  /**
   * Read the lock mode from settings: `camLockMode` (GameState migrates the retired boolean on load); a `camLock`
   * change (ui's legacy toggle) maps true → 'locked', false → the last unlocked mode.
   * @param {boolean} toast @param {string} [key] the setting that changed
   */
  _lockModeFromSettings(toast, key = 'camLockMode') {
    const st = this.ctx.state?.settings ?? {};
    let mode;
    if (key === 'camLock') mode = st.camLock === false ? this._lastUnlocked : 'locked';
    else mode = LOCK_MODES.includes(st.camLockMode) ? st.camLockMode : st.camLock === false ? 'free' : 'locked';
    if (mode !== 'locked') this._lastUnlocked = mode;
    const was = this.camLockMode;
    this.camLockMode = mode; this.camLocked = mode === 'locked';
    if (this.camLocked) { this._pan.set(0, 0, 0); this._semi.x = 0; this._semi.z = 0; }
    if (st.camLockMode !== mode) st.camLockMode = mode;
    if (st.camLock !== this.camLocked) st.camLock = this.camLocked;
    if (toast && was !== mode) this.ctx.bus?.emit?.(E.TOAST, { text: this.ctx.strings?.t?.(this.camLocked ? 'toast.cam.locked' : 'toast.cam.unlocked') ?? '' });
  }

  /** settings:changed → zoom per orientation, lock mode, reduce motion (re-solve + re-anchor). */
  _onSetting(p) {
    if (!p || this._writing) return;
    const k = p.key;
    if ((k === 'camZoom' && !this._zoomPortrait) || (k === 'camZoomPortrait' && this._zoomPortrait)) { if (Number.isFinite(p.value)) this.zoom(p.value, false); }
    else if (k === 'camLockMode' || k === 'camLock') this._lockModeFromSettings(false, k);
    else if (k === 'reduceCameraMotion' || k === 'biggerHero' || k === 'leftHanded' || k === 'touchSize' || k == null) { this._forceSolve = true; this.safeFrame.key = ''; }
  }

  /** Fixed step (play): zoom, camera lock, centre, peek bookkeeping and selection input. */
  _isoInput(dt) {
    const input = this.ctx.input, I = ISO;
    // zoom (wheel ticks / pinch via input.addZoom; pad R3 cycles). Zooming in during a fit is the pinch rubber band.
    const z = input.consumeZoom?.() ?? 0;
    if (z) {
      if (z > 0) this._pinchInT = I.pinch.rubberBack * 0.5;
      const want = this.zoomMul * Math.pow(1 - I.zoomStep, z);
      // §10.3: at a limit a small elastic give (+ a haptic tick on touch) instead of a dead stop
      if ((want < I.zoom[0] - 1e-6 && this.zoomMul <= I.zoom[0] + 1e-6) || (want > I.zoom[1] + 1e-6 && this.zoomMul >= I.zoom[1] - 1e-6)) {
        this._give = Math.sign(want - this.zoomMul) * I.pinch.elastic;
        if (input.device === 'touch') { try { input.haptic?.('button'); } catch { /* no haptics */ } }
      }
      this.zoom(want);
    }
    if (input.pressed('zoomCycle')) {
      const steps = I.padZoom, cur = this.zoomMul;
      let i = steps.findIndex((s) => s > cur + 1e-3);
      this.zoom(steps[i < 0 ? 0 : i]);
    }
    if (input.pressed('camLock') && input.device === 'kbm') this.setCamLock(!this.camLocked);
    if (input.pressed('centre')) { this._pan.set(0, 0, 0); this._semiHome = true; this._centreT = 0.25; }
    // selection (§7.4): Tab / RB select the best / cycle (Shift+Tab back); D-pad ← → cycle; LMB / RMB / taps select
    // through the player's orders
    if (input.pressed('lockon')) {
      const back = input.keys?.has?.('ShiftLeft') || input.keys?.has?.('ShiftRight');
      if (input.device === 'pad' && this.lockTarget) this.select(null, 'pad');
      else if (this.lockTarget) { this._selSource = 'tab'; this.switchLock(back ? -1 : 1, true); this._selSource = null; }
      else this.select(this._bestSelectable(), input.device === 'pad' ? 'pad' : 'tab');
    }
    if (input.pressed('lockNext') && this.lockTarget) this.switchLock(1, true);
    if (input.pressed('lockPrev') && this.lockTarget) this.switchLock(-1, true);
    // stick latch (§2.2): movement keeps the yaw sampled when the stick engaged; re-latch 0.15 s after release
    const m = input.move, held = Math.hypot(m?.x ?? 0, m?.y ?? 0) > 0.1;
    if (held) this._stickFree = 0;
    else if ((this._stickFree += dt) >= I.stickRelatch) this.stickYaw = this.isoYaw;
    // the zoom is saved per orientation a moment after the last change (camZoom / camZoomPortrait)
    if (this._zoomSaveT > 0 && (this._zoomSaveT -= dt) <= 0) this._saveZoom();
  }

  /** Write the current zoom to settings (camZoom landscape / camZoomPortrait) and emit settings:changed. */
  _saveZoom() {
    this._zoomSaveT = -1;
    const st = this.ctx.state?.settings, key = this._zoomPortrait ? 'camZoomPortrait' : 'camZoom';
    if (!st || Math.abs((st[key] ?? 1) - this.zoomMul) < 1e-4) return;
    st[key] = Math.round(this.zoomMul * 1000) / 1000;
    this._writing = true;
    try { this.ctx.bus?.emit?.(E.SETTINGS_CHANGED, { key, value: st[key] }); } finally { this._writing = false; }
  }

  /** Tab with nothing selected: the hostile nearest the cursor on screen (KBM), else the nearest to her. */
  _bestSelectable() {
    const p = this.ctx.player;
    if (!p) return null;
    let best = null, bd = Infinity;
    const useCursor = this.ctx.input?.device === 'kbm' && this.cursorValid;
    for (const a of this._candidates()) {
      if (!lockable(a)) continue;
      const d = useCursor ? Math.hypot(a.pos.x - this.cursorGround.x, a.pos.z - this.cursorGround.z) : Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z);
      if (Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) > LOCK.range) continue;
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  /** The level's fixed yaw (level.cam.yaw, default π) on level load. */
  _isoLevelYaw(level) {
    const y = level?.cam?.yaw ?? level?.def?.cam?.yaw;
    this.isoYaw = Number.isFinite(y) ? y : ISO.yaw;
    this.stickYaw = this.isoYaw;
    this._yawT = 1;
    this.hint = null;
    for (const s of [this._hDist, this._hPitch]) { s.from = NaN; s.to = NaN; s.t = 1; }
    this._pan.set(0, 0, 0); this._peek.set(0, 0, 0);
  }

  // ------------------------------------------------------------------ AUTOCAM: engaged set, intent, subjects, solve
  /**
   * The engaged set (AUTOCAM D9): alerted / engaged hostiles enter within framing.engage.in (10 m) and leave beyond
   * engage.out (12.5 m) or after engage.hold (1.5 s) without being alerted; nearest first. `this.engaged` (occlusion,
   * focus fog, ui) also carries the selection. Zero allocation (two swapped arrays).
   * @param {{x:number,z:number}} feet @param {number} dt
   */
  _engagedSet(feet, dt) {
    const EN = FR.engage, me = this.ctx.player;
    const prev = this._engA, prevT = this._engTA, next = this._engB, nextT = this._engTB, D = this._engD;
    next.length = 0; D.length = 0;
    for (let i = 0; i < prev.length; i++) {
      const a = prev[i];
      if (!liveHostile(a, me)) continue;
      const ap = a.object3d?.position ?? a.pos;
      const d = Math.hypot(ap.x - feet.x, ap.z - feet.z);
      if (d > EN.out) continue;
      const t = isAlerted(a) ? 0 : prevT[i] + dt;
      if (t > EN.hold) continue;
      insertByDist(next, nextT, D, a, t, d);
    }
    const list = this.ctx.actors?.queryRadius?.(feet, EN.in, hostileTo('player'));
    if (list) for (const a of list) {
      if (next.length >= MAX_ENG || !liveHostile(a, me) || !isAlerted(a) || next.includes(a)) continue;
      const ap = a.object3d?.position ?? a.pos;
      const d = Math.hypot(ap.x - feet.x, ap.z - feet.z);
      if (d <= EN.in) insertByDist(next, nextT, D, a, 0, d);
    }
    this._engA = next; this._engB = prev; this._engTA = nextT; this._engTB = prevT;
    const out = this.engaged;
    out.length = 0;
    for (let i = 0; i < next.length; i++) out.push(next[i]);
    const t = this.lockTarget;
    if (t && !out.includes(t) && lockable(t)) out.push(t);
    return next;
  }

  /**
   * Her movement intent (AUTOCAM §5.3) → out { x, z (m/s, world), kind }. Reads `player.moveIntent` when player
   * publishes it; until then derives it: tumble / Pounce / lunge / knockback / scripted states → 'other'; a live order
   * → toward the path point orderLook (2.5 m) ahead at run speed (easing inside NAV.slowR of the end); the stick / WASD
   * wish direction; else her own walk.
   */
  _intent(p, out) {
    out.x = 0; out.z = 0; out.kind = 'idle';
    const mi = p.moveIntent;
    if (mi && typeof mi.kind === 'string') {
      const L = Math.hypot(mi.x ?? 0, mi.z ?? 0), sp = Number.isFinite(mi.speed) ? mi.speed : L;
      if (L > 1e-6) { out.x = (mi.x / L) * sp; out.z = (mi.z / L) * sp; }
      out.kind = mi.kind;
      return out;
    }
    if (OTHER_STATES.has(p.stateName)) { out.kind = 'other'; return out; }
    const pos = p.object3d?.position ?? p.pos, ord = p.orders;
    if (ord?.moving && this._orderLook(p, ISO.lead.orderLook, _look)) {
      const dx = _look.x - pos.x, dz = _look.z - pos.z, L = Math.hypot(dx, dz);
      if (L > 1e-3) {
        const sp = (PLAYER.run ?? 5.5) * clamp(_look.rem / Math.max(1e-3, NAV.slowR), 0, 1);
        out.x = (dx / L) * sp; out.z = (dz / L) * sp; out.kind = 'order';
      }
      return out;
    }
    const input = this.ctx.input, m = input?.move;
    const mag = m ? Math.hypot(m.x, m.y) : 0;
    if (mag > (TOUCH.stickDead ?? 0.1)) {
      screenToWorldDir(m.x / mag, m.y / mag, this.stickYaw, _tmp);
      const l = Math.hypot(_tmp.x, _tmp.z) || 1;
      const touch = input.device === 'touch';
      const sp = touch ? (PLAYER.run ?? 5.5) * smoothstep(TOUCH.stickDead ?? 0.1, 1, Math.min(1, mag)) : Math.hypot(p.vel?.x ?? 0, p.vel?.z ?? 0);
      out.x = (_tmp.x / l) * sp; out.z = (_tmp.z / l) * sp;
      out.kind = touch ? 'stick' : sp > (PLAYER.walk ?? 2) + 0.5 ? 'run' : 'walk';
      return out;
    }
    const vx = p.vel?.x ?? 0, vz = p.vel?.z ?? 0;
    if (p.stateName === 'move' && Math.hypot(vx, vz) > 0.5) { out.x = vx; out.z = vz; out.kind = 'walk'; }
    return out;
  }

  /**
   * The point `dist` m ahead of her along her live path (player.orders.lookAhead when player has it) → out { x, z, rem }
   * (rem = path length left). False without a path.
   */
  _orderLook(p, dist, out) {
    const ord = p.orders, pos = p.object3d?.position ?? p.pos;
    if (typeof ord?.lookAhead === 'function') {
      const r = ord.lookAhead(dist, _tmp2);
      if (r && Number.isFinite(_tmp2.x)) { out.x = _tmp2.x; out.z = _tmp2.z; out.rem = Number.isFinite(r.rem) ? r.rem : dist; return true; }
    }
    const path = ord?.path;
    if (!Array.isArray(path) || ord.wp >= path.length) return false;
    let px = pos.x, pz = pos.z, left = dist, rem = 0, found = false;
    for (let i = ord.wp; i < path.length; i++) {
      const q = path[i], dx = q.x - px, dz = q.z - pz, L = Math.hypot(dx, dz);
      if (!found && L >= left) { out.x = px + (dx / L) * left; out.z = pz + (dz / L) * left; found = true; rem += L; }
      else if (!found) { left -= L; rem += L; out.x = q.x; out.z = q.z; }
      else rem += L;
      px = q.x; pz = q.z;
    }
    out.rem = rem;
    return true;
  }

  /**
   * Gather the framing subjects (AUTOCAM §6.2) at the 20 Hz solver tick: her capsule (never the visual bbox, WA5),
   * live wind-ups on her (THREAT, + lane ends), the boss and its lanes, the selection (hard ≤ 12 m, soft ≤ 16 m),
   * the engaged set (ENGAGED; soft w 0.5 adds around a boss) and the melee token holders (soft pre-attend).
   */
  _gather(feet, boss, tick) {
    const S = this.subjects, P = FR.pad, Wt = FR.w, now = this.ctx.game?.time ?? this._realT, tel = this._tel;
    S.setHer(feet.x, feet.y + HER_CENTRE_Y, feet.z, P.her);
    S.begin();
    tel.prune(now);
    for (let i = 0; i < tel.size; i++) {
      if (!tel.live(i, now)) continue;
      const a = tel.actor[i];
      if (tel.lane[i]) S.want(this._laneKeys[i], CLS.LANE, tel.lx[i], tel.ly[i] + 0.5, tel.lz[i], P.lane, Wt.lane, true);
      if (a && !a.disposed && !tel.boss[i]) {
        const ap = a.object3d?.position ?? a.pos;
        if (ap) S.want(a, CLS.THREAT, ap.x, ap.y + (a.height ?? 1) * 0.5, ap.z, (a.radius ?? 0.4) + P.threat, Wt.threat, true);
      }
    }
    if (boss) {
      const bp = boss.object3d?.position ?? boss.pos, h = boss.height ?? 1.6;
      S.want(boss, CLS.BOSS, bp.x, bp.y + h / 2, bp.z, (boss.radius ?? 1) + P.boss, Wt.boss, true);
    }
    const sel = this.lockTarget;
    if (sel && lockable(sel) && sel !== boss) {
      const sp = sel.object3d?.position ?? sel.pos, d = Math.hypot(sp.x - feet.x, sp.z - feet.z);
      if (d <= FR.selSoft) S.want(sel, CLS.SELECTED, sp.x, sp.y + (sel.height ?? 1) * 0.5, sp.z, (sel.radius ?? 0.4) + P.enemy, Wt.selected, d <= FR.selHard);
    }
    const tok = this._tok;
    tok.length = 0;
    try { this.ctx.combat?.tokens?.holdersInto?.('melee', tok); } catch { tok.length = 0; }
    const eng = this._engA;
    for (let i = 0; i < eng.length; i++) {
      const a = eng[i];
      if (a === boss) continue;
      const ap = a.object3d?.position ?? a.pos, held = tok.includes(a);
      S.want(a, CLS.ENGAGED, ap.x, ap.y + (a.height ?? 1) * 0.5, ap.z, (a.radius ?? 0.4) + P.enemy, boss ? Wt.add : Wt.engaged, !boss, held);
    }
    for (let i = 0; i < tok.length; i++) {
      const a = tok[i];
      if (!a || a === boss || !liveHostile(a, this.ctx.player)) continue;
      const ap = a.object3d?.position ?? a.pos;
      if (ap) S.want(a, CLS.PRE, ap.x, ap.y + (a.height ?? 1) * 0.5, ap.z, (a.radius ?? 0.4) + 0.6, Wt.preAttend, false, true);
    }
    S.end(tick);
  }

  /**
   * One solve (AUTOCAM §6.3–§6.4, §6.7 reduce-motion discrete mode, §8.2 boss caps) → this._goal. dBase = the rest
   * distance (zoom × base × hints), dMax = the cat clamp.
   */
  _solve(feet, boss, base, prof, calm) {
    const S = this.subjects, v = this._view, g = this._goal, nx = this._goalNext, L = FR.lean;
    const combat = S.n > 1;
    const dBase = base.dist;
    if (!combat) {
      g.d = dBase; g.need = dBase; g.leanR = 0; g.leanU = 0; g.dropped = 0; g.holes = 0; g.capped = false;
      this._calmFit = 0;
      return g;
    }
    const rng = distRange(base.portrait);
    const cap = boss ? Math.min(ISO.boss.dist[1], Math.max(ISO.boss.dist[0], base.dMax))
      : Math.max(dBase, Math.min(dBase + FR.zoomOut, base.dMax, rng[1]));
    // any hard subject down-screen of her → the wide down cap (D7)
    let down = false;
    for (let i = 1; i < S.n; i++) {
      const o = i * STRIDE;
      if (!(S.data[o + SF] & F_HARD)) continue;
      if ((S.data[o + SX] - feet.x) * v.Ux + (S.data[o + SZ] - feet.z) * v.Uz < 0) { down = true; break; }
    }
    const lim = this._lim, o = this._solveOpts;
    o.dBase = boss ? Math.max(dBase, ISO.boss.dist[0]) : dBase; o.cap = cap; o.dMin = o.dBase;
    o.capUp = boss ? L.boss : L.capUp;
    o.capDown = boss ? L.boss : (down ? L.capDown : L.capDownCalm)[prof] ?? 2;
    const noLean = calm;
    o.limR = noLean ? 0 : lim.right; o.limL = noLean ? 0 : lim.left; o.limUp = noLean ? 0 : lim.up; o.limDown = noLean ? 0 : lim.down;
    // D8 crowd term rides on top of the +3 m budget, up to the cat clamp / range ceiling (never past it; boss: none)
    o.capMax = boss ? cap : Math.max(cap, Math.min(base.dMax, rng[1]));
    o.nEngaged = S.nEngaged; o.crowd = !calm; o.visible = this._visibleFn; o.holeRepair = true;
    _F.set(feet.x, this._gy, feet.z);
    solveFrame(S.data, S.n, _F, v, o, nx);
    if (calm) {
      // §6.7 discrete: fit once at encounter start; only ever zoom out (a new hard subject); never ease in until the end
      if (!(this._calmFit > 0) || nx.d > this._calmFit + 1e-3) this._calmFit = Math.max(this._calmFit || 0, nx.d);
      g.d = this._calmFit; g.need = nx.need; g.leanR = 0; g.leanU = 0; g.dropped = nx.dropped; g.holes = nx.holes; g.capped = nx.capped;
      return g;
    }
    // R5 goal hysteresis: keep the goal for small changes while every hard subject is inside the 92 % frame
    const inside = allHardInside(S.data, S.n, _F, v, Math.max(this._dCur, o.dBase), g.leanR, g.leanU, ISO.frame.hysteresisFrame);
    if (!holdGoal(g, nx, inside, S.hardAdded || this._forceSolve)) {
      g.d = nx.d; g.leanR = nx.leanR; g.leanU = nx.leanU;
    }
    g.need = nx.need; g.dropped = nx.dropped; g.holes = nx.holes; g.capped = nx.capped;
    return g;
  }

  /**
   * SafeFrame refresh (AUTOCAM §7): rebuilt only when the occluder set changes (ui.screenOccluders().version when ui has
   * it, else the fallback rects' signature); the live thumb holes every frame. Sets the anchor target (eased 0.4 s).
   */
  _refreshSafeFrame(W, H, dev, st, calm, portrait) {
    const ui = this.ctx.ui, sf = this.safeFrame, touch = dev === 'touch';
    let key;
    const so = typeof ui?.screenOccluders === 'function' ? ui.screenOccluders() : null;
    if (so && Array.isArray(so.rects)) {
      key = -((((so.version | 0) * 4099 + W) * 4099 + H) | 0) - 1;
      if (key !== sf.key) { sf.rebuild(W, H, ui?.safeArea ?? null, so.rects, portrait); sf.key = key; }
    } else {
      const si = ui?.safeInsets, k = si?.h > 0 ? H / si.h : 1;
      const lay = touch ? ui?.touch?.layout ?? null : null;
      const bar = touch ? 0 : Math.max((si?.bottom ?? 0) * k, Number.isFinite(ui?.bar?.insetBottom) ? ui.bar.insetBottom : 0);
      const top = touch ? 0 : (si?.top ?? 0) * k;
      // numeric signature (no per-frame string): viewport, device, bar / plate px, touch size, mirror, layout
      let h = (W * 4099 + H) | 0;
      h = (h * 31 + (touch ? 1 : 2)) | 0; h = (h * 31 + Math.round(bar)) | 0; h = (h * 31 + Math.round(top)) | 0;
      h = (h * 31 + Math.round((st.touchSize ?? 1) * 100)) | 0; h = (h * 31 + (st.leftHanded ? 7 : 3)) | 0;
      h = (h * 31 + (lay ? layoutSig(lay) : 0)) | 0;
      key = h;
      if (key !== sf.key) {
        fallbackOccluders({ w: W, h: H, touch, layout: lay, touchSize: st.touchSize, leftHanded: !!st.leftHanded, hudTop: top, barInset: bar }, this._occl);
        sf.rebuild(W, H, null, this._occl, portrait);
        sf.key = key;
      }
    }
    // live thumb holes (visible() only; never core / anchor)
    sf.clearLive();
    const stick = touch ? ui?.touch?.stick : null;
    if (stick && stick.id != null && Number.isFinite(stick.ox)) {
      const R = (TOUCH.stickR ?? 60) * (st.touchSize ?? 1) + ISO.frame.thumbPad;
      sf.addLive(stick.ox - R, stick.oy - R, stick.ox + R, stick.oy + R);
    }
    const held = touch ? ui?.touch?.heldRect?.() : null;
    if (held && Number.isFinite(held.x)) { const p = ISO.frame.thumbPad; sf.addLive(held.x - p, held.y - p, held.x + held.w + p, held.y + held.h + p); }
    // the anchor target: SafeFrame's; Reduce camera motion puts her at y 0.50 in landscape (static compensation)
    const tx = sf.ax, ty = calm && !portrait ? ISO.reduce.anchorY : sf.ay, A = this._anc;
    const eps = A.seeded && A.vw === W && A.vh === H && A.calm === calm ? ANCHOR_EPS : 1e-4;
    if (Math.abs(tx - A.toX) > eps || Math.abs(ty - A.toY) > eps) {
      A.fromX = A.x; A.fromY = A.y; A.toX = tx; A.toY = ty; A.vw = W; A.vh = H; A.calm = calm;
      const instant = !A.seeded || calm;
      A.t = instant ? 1 : 0;
      if (instant) { A.x = tx; A.y = ty; }
      if (calm && A.seeded) this._veil();
      A.seeded = true;
      this._forceSolve = true;
    }
  }

  /** Reduce camera motion: a 0.25 s cream veil instead of a camera move (AUTOCAM §10.1). */
  _veil() {
    try { this.ctx.ui?.flash?.(FADE_COLOR, 1, ISO.cut.veil); } catch { /* no veil layer */ }
  }

  /** Iso gameplay framing (follow / lock / boss) → this._gamePose. AUTOCAM §4.2 per-render pipeline. */
  _isoGameplay(dt) {
    const ctx = this.ctx, p = ctx.player, out = this._gamePose, I = ISO, input = ctx.input;
    if (!p) return out.copy(this._outPose);
    const feet = p.object3d?.position ?? p.pos;
    // §4.2 discontinuities: > resetJump (4 m) in one frame → every spring resets to its goal
    if (!this._hadPlayer) this._snap = true;
    else if (feet.distanceToSquared(this._lastPlayerPos) > I.follow.resetJump * I.follow.resetJump) { this._snap = true; this._blend.active = false; }
    this._hadPlayer = true;
    this._lastPlayerPos.copy(feet);
    const snap = this._snap, st = ctx.state?.settings ?? EMPTY;
    const calm = !!st.reduceCameraMotion, gmPlay = (ctx.game?.mode ?? 'play') === 'play';
    if (this._bossHoldT > 0) this._bossHoldT = Math.max(0, this._bossHoldT - dt);
    // D12: the goals freeze in hitstop (and through the boss-defeat hold); springs and shake keep running
    const frozen = !snap && ((ctx.game?.hitstopT ?? 0) > 0 || this._bossHoldT > 0);
    // yaw (zone hints blend; the level yaw otherwise)
    if (this._yawT < 1) {
      this._yawT = Math.min(1, this._yawT + dt / this._yawDur);
      this.isoYaw = this._yawFrom + wrapAngle(this._yawTo - this._yawFrom) * easeInOutSine(this._yawT);
    }
    const yaw = this.isoYaw, v = this._view;
    this.yaw = yaw;
    setYaw(v, yaw);
    const ux = v.Ux, uz = v.Uz;
    const W = this._viewW(), H = this._viewH(), dev = input?.device ?? 'kbm';
    const prof = camProfile(W, H, dev), portrait = prof === 'portrait';
    this.profile = prof;
    this._zoomOrientation(st, portrait);
    // zoom (wheel / pinch / slider) and its elastic give: smoothDamp, never a lerp
    if (snap) { this._zoomS = this.zoomMul; this._zoomSS.v = 0; this._give = 0; this._giveS.v = 0; }
    else {
      this._give = smoothDamp(this._give, 0, this._giveS, ZOOM_ST, dt);
      this._zoomS = smoothDamp(this._zoomS, this.zoomMul * (1 + this._give), this._zoomSS, ZOOM_ST, dt);
    }
    const hv = this._hv;
    this._hintStep(this._hDist, dt, hv, 'dist', 'distW');
    this._hintStep(this._hPitch, dt, hv, 'pitch', 'pitchW');
    const boss = this.bossActive ? this._liveBoss() : null;
    const base = this._isoBase(W, H, dev, !!boss, hv, !!st.biggerHero);
    // the pitch the rig gives a distance (zone hint blend; portrait / boss fixed): the solver's and the springs' curve
    this._pitchFixed = portrait ? I.pitchPortrait : boss ? I.pitchBoss : NaN;
    this._pitchHintW = !portrait && !boss && Number.isFinite(hv.pitch) ? clamp(hv.pitchW ?? 1, 0, 1) : 0;
    this._pitchHint = hv.pitch;
    // SafeFrame + anchor, the view for the solver
    this._refreshSafeFrame(W, H, dev, st, calm, portrait);
    const A = this._anc;
    v.tanV = Math.tan((base.fov * Math.PI) / 360); v.tanH = v.tanV * base.aspect;
    v.offX = 2 * A.toX - 1; v.offY = 1 - 2 * A.toY;
    this.safeFrame.fitRectNdc(v);
    // ---- §4.2 step 3: the ground under her (player.groundY when published; the last grounded feet Y otherwise) +
    // focusY + a jump lift (30 %, 50 % off a mushroom bounce); a tall boss lifts the focus
    if (p.onGround || snap) { this._groundY = feet.y; this._bounceRise = false; }
    if (p.bounced > 0) this._bounceRise = true;
    const gy0 = Number.isFinite(p.groundY) ? p.groundY : this._groundY, rise = Math.max(0, feet.y - gy0);
    const lift = boss ? Math.max(0, (boss.height ?? 1.6) - I.boss.liftAbove) * I.boss.lift : 0;
    const gyT = gy0 + I.focusY + rise * (this._bounceRise ? I.bounceFollow : I.jumpFollow) + lift;
    // Reduce camera motion: rolling ground is followed rigidly (her feet keep their screen spot over bumps; the eased
    // follow left a ≈ 10 px swell, smoke camera:reduce-motion std 3.7 px vs 1.5); only steps (a ledge, a stair, a jump
    // landing: > CALM_GROUND_STEP m in one step) still ease in
    if (!snap && calm && Number.isFinite(this._gyPrevT) && Math.abs(gyT - this._gyPrevT) < CALM_GROUND_STEP) this._gy += gyT - this._gyPrevT;
    this._gyPrevT = gyT;
    this._gy = snap ? gyT : smoothDamp(this._gy, gyT, this._gyS, I.follow.groundST, dt);
    if (snap) this._gyS.v = 0;
    // ---- engaged set, subjects and the 20 Hz solve (an immediate one on a hard add / snap)
    this._engagedSet(feet, frozen ? 0 : dt);
    const still = p.stateName === 'guard' || p.stateName === 'charge' || (p.charge ?? 0) > 0;
    this._solveT -= dt;
    if (!frozen && (snap || this._solveT <= 0 || this._forceSolve || this._tel.dirty)) {
      const tick = snap ? 0 : Math.max(dt, 1 / FR.hz - Math.max(0, this._solveT));
      this._solveT = 1 / FR.hz;
      this._tel.dirty = false;
      this._gather(feet, boss, tick);
      herLimits(this._pitch || base.pitch, Math.max(base.dist, this._dCur || base.dist), v.tanV, v.tanH, A.toX, A.toY, this.safeFrame.herFrame, this._lim);
      this._solve(feet, boss, base, prof, calm);
      this._forceSolve = false;
    }
    const combat = this.subjects.n > 1;
    // ---- goals (frozen in hitstop)
    const L = I.lead, aim = this._aimStep(p, dt, prof, frozen, calm);
    if (!frozen) {
      const leadOn = !calm && !combat && !still && !aim && !this.beat.active && this.modeName === 'follow' && gmPlay;
      if (leadOn) { this._intent(p, this._int); intentLead(this._int.x, this._int.z, this._int.kind, yaw, prof, this._leadT); }
      else { this._leadT.x = 0; this._leadT.z = 0; }
      this._leadGate.step(this._leadT, this._lead, dt);
      // §5.4 / D6 KBM cursor look-ahead (settings.camCursorLead 0–0.15, default 0): gain × (cursor − her), ≤ cursorMax,
      // after the intent debounce (a wandering cursor is not an intent); read per frame, so a SETTINGS_CHANGED applies
      const cg = leadOn && dev === 'kbm' && !portrait && this.cursorValid ? clamp(+st.camCursorLead || 0, 0, CURSOR_LEAD_MAX) : 0;
      if (cg > 0) {
        _tmp.set((this.cursorGround.x - feet.x) * cg, 0, (this.cursorGround.z - feet.z) * cg);
        capXZ(_tmp, L.cursorMax);
        this._leadT.x += _tmp.x; this._leadT.z += _tmp.z;
        capXZ(this._leadT, L.max);
      }
      this._biasT = !calm && !portrait && !combat && !boss && !this._arena.locked ? (L.up ?? 0.8) : 0;
      const g = this._goal;
      this._leanT.x = g.leanR * v.Rx + g.leanU * v.Ux; this._leanT.z = g.leanR * v.Rz + g.leanU * v.Uz;
    }
    // ---- beats (§8.1) and the boss envelopes (§8.2)
    this._beatStep(dt, p, feet, calm, gmPlay);
    const bw = this.beat.w, beat = this.beat;
    // ---- springs (real dt; each its own smoothDamp state)
    if (snap) {
      this._lead.x = this._leadT.x; this._lead.z = this._leadT.z; this._leadS.vx = this._leadS.vz = 0;
      this._bias = this._biasT; this._biasS.v = 0;
      this._lean.x = this._leanT.x; this._lean.z = this._leanT.z; this._leanS.vx = this._leanS.vz = 0;
      this._aim.x = this._aimT.x; this._aim.z = this._aimT.z; this._aimS.vx = this._aimS.vz = 0;
      this._beatOff.x = beat.lx * bw; this._beatOff.z = beat.lz * bw; this._beatS.vx = this._beatS.vz = 0;
      this._peek.set(0, 0, 0); this._peekS.vx = this._peekS.vz = 0;
    } else {
      const grow = Math.hypot(this._leadT.x, this._leadT.z) >= Math.hypot(this._lead.x, this._lead.z);
      smoothDamp2(this._lead, this._leadT.x, this._leadT.z, this._leadS, grow ? L.build : L.release, dt, L.vmax);
      this._bias = smoothDamp(this._bias, this._biasT, this._biasS, L.biasST, dt);
      smoothDamp2(this._lean, this._leanT.x, this._leanT.z, this._leanS, FR.lean.st, dt, FR.lean.vmax);
      smoothDamp2(this._aim, this._aimT.x, this._aimT.z, this._aimS, aim || this._aimHoldT > 0 ? I.aimPan.in : I.aimPan.out, dt, FR.lean.vmax);
      smoothDamp2(this._beatOff, beat.lx * bw, beat.lz * bw, this._beatS, BEAT_ST, dt, FR.lean.vmax);
    }
    // §2.3 peek (Alt / MMB / pad D-pad ↓ + RS), out of combat
    this._peekStep(dt, p, feet, combat, snap);
    // desktop lock modes (§10.4): semi = a pan inside herFrame that springs home; free = the leash pan (after the clamp)
    this._panStep(dt, feet, W, H, yaw, combat);
    // TOKENTAILS-PLAN §10.2.7 the guide look-ahead (off-screen objective, out of combat)
    this._guideLookStep(frozen ? 0 : dt, feet, combat || !!boss, snap, gmPlay && !calm);
    // ---- compose the offset (focus − her), clamp it to the herFrame limits (R7: she always wins)
    const off = this._off;
    off.x = ux * this._bias + this._lead.x + this._lean.x + this._aim.x + this._beatOff.x + this._peek.x + this._semi.x + this.guideLook.x;
    off.z = uz * this._bias + this._lead.z + this._lean.z + this._aim.z + this._beatOff.z + this._peek.z + this._semi.z + this.guideLook.z;
    // §2.4 dialogue: the focus eases to the speaker midpoint and d × 0.8 over 0.5 s (no cut). The midpoint is part of
    // the offset, and the herFrame limits are re-derived at the dollied distance, so R7 holds through the two-shot
    const dlg = ctx.game?.mode === 'dialog';
    this._dlgW = snap ? (dlg ? 1 : 0) : clamp(this._dlgW + (dlg ? dt : -dt) / I.dialog.t, 0, 1);
    const dlgW = calm ? (dlg ? 1 : 0) : easeInOutSine(this._dlgW);
    let lim = this._lim;
    if (dlgW > 0) {
      const sp = this._speaker(feet);
      if (sp) this._dlgMid.set((sp.x - feet.x) * 0.5, 0, (sp.z - feet.z) * 0.5);
      off.x += this._dlgMid.x * dlgW; off.z += this._dlgMid.z * dlgW;
      const dl = Math.max(base.dist, this._dCur || base.dist) * (1 + (I.dialog.mul - 1) * dlgW);
      lim = herLimits(this._pitch || base.pitch, dl, v.tanV, v.tanH, A.toX, A.toY, this.safeFrame.herFrame, this._limDlg);
    }
    clampToLimits(off, yaw, lim);
    this.lead.x = this._lead.x; this.lead.z = this._lead.z;
    _piv.set(feet.x + off.x + this._pan.x, this._gy, feet.z + off.z + this._pan.z);
    this.focus.copy(_piv);
    // ---- distance: rest (zoom × base × hints) + the combat / boss fit (out fast, in slow after a 1.5 s hold, §6.5)
    const dBase = base.dist, g = this._goal, D = FR.dist;
    const extraGoal = combat ? Math.max(0, g.d - dBase) : 0;
    const outward = extraGoal > this._extra + 1e-3;
    // §6.5 / R4 'out fast, in slow': the 1.5 s hold counts from the moment the need DROPS below the fit, so stamp
    // while it is still at / above it (zooming out or settled), and on the frame the fight ends with the need held
    const needHeld = combat && extraGoal >= this._extra - 1e-3;
    if (needHeld || (this._wasCombat && !combat && this._needHeld)) this._lastNeedOut = this._realT;
    this._needHeld = needHeld; this._wasCombat = combat;
    let tgt = extraGoal;
    // a hold freezes the fit where it is: the spring's velocity goes too, or a fight that ends mid zoom-out kept
    // drifting outward for ~1.5 m (integrator, camera:teamfight)
    if (!outward && this._realT - this._lastNeedOut < D.holdIn && combat) { tgt = this._extra; this._extraS.v = 0; }
    if (!combat && this._realT - this._lastNeedOut < D.holdIn) { tgt = this._extra; this._extraS.v = 0; }   // after a fight: hold, then ease in
    if (snap) { this._extra = extraGoal; this._extraS.v = 0; }
    else if (calm) this._extra = smoothDamp(this._extra, tgt, this._extraS, I.reduce.combatFitEase / 3, dt);
    else this._extra = smoothDamp(this._extra, tgt, this._extraS, outward ? D.outST : D.inST, dt, outward ? D.outVmax : D.inVmax);
    // §10.3 pinch rubber band below an active fit: visible d may drop to fit − 0.25·(fit − dUser), springs back 0.6 s
    this._rubberStep(dt, combat);
    let d = dBase + this._extra * (1 - I.pinch.rubber * this._rubber);
    // snuggle (§5.6): one-shot −0.6 m after 5 s idle out of combat (never below the range minimum)
    this._snuggleStep(dt, p, combat, calm, gmPlay, snap);
    const rng = distRange(portrait);
    d = Math.max(Math.min(d, dBase), d + this._snug);
    if (this._snug < 0) d = Math.max(d, rng[0]);
    // beat Δd (the Cosy two-shot never goes below beats.cosy.dMin)
    if (bw > 0 && beat.dd) {
      const dd = beat.dd * bw;
      d = dd < 0 ? Math.max(d + dd, Math.min(d, beat.id === 'cosy' ? BEATS.cosy.dMin : rng[0])) : d + dd;
    }
    // R3 rate caps on the automatic part of d (fit + snuggle + beats, everything above the player's own rest
    // distance): out ≤ outVmax, in ≤ inVmax m/s. A clamp toward the goal, so it never overshoots; the zoom, hints and
    // orientation (dBase), the boss envelopes and the punches below stay exempt.
    const auto = d - dBase;
    if (snap || !Number.isFinite(this._autoD)) this._autoD = auto;
    else this._autoD = clamp(auto, this._autoD - D.inVmax * dt, this._autoD + D.outVmax * dt);
    d = dBase + this._autoD;
    if (boss) d = clamp(d, I.boss.dist[0], I.boss.dist[1]);
    d = Math.min(d, Math.max(base.dMax, Math.min(dBase, base.dMax)));
    const dCurve = d;
    // §8.2 / D11 boss punches (own envelopes, exempt from R3 and the boss floor): phase breath (+1.5 m for 1 s), Dizzy
    // (−1.0 m; may dip below the 14 m floor to dist[0] + dizzy.dd, so the beat reads from the at-rest two-shot)
    const bossDd = this._bossEnvelopes(dt, calm);
    if (bossDd) d = boss ? clamp(d + bossDd, I.boss.dist[0] + I.boss.dizzy.dd, I.boss.dist[1] + I.boss.phaseBreath.dd) : d + bossDd;
    // ---- punches (exempt from the rate caps): charge push-in, parry, Holy, Purrfect Dodge; Golden Hour; dialogue
    const charging = p.stateName === 'charge' || (p.charge ?? 0) > 0;
    this._chargeW = snap ? (charging && !calm ? 1 : 0) : smoothDamp(this._chargeW, charging && !calm ? 1 : 0, this._chargeS, CHARGE_ST, dt);
    let dd = I.charge.dd * this._chargeW, dfov = calm ? 0 : I.charge.dfov * this._chargeW;
    if (!calm) {
      if (this._punchT >= 0) {
        const P = I.parryPunch, t = (this._punchT += dt);
        dd += P.dd * (t < P.in ? t / P.in : Math.max(0, 1 - (t - P.in) / P.out));
        if (t > P.in + P.out) this._punchT = -1;
      }
      if (this._holyT >= 0) {
        const t = (this._holyT += dt);
        if (t < I.holy.fovT) dfov += I.holy.dfov * Math.sin(Math.PI * t / I.holy.fovT);
        if (t < I.holy.ddT) dd += I.holy.dd * Math.sin(Math.PI * t / I.holy.ddT);
        else if (t > Math.max(I.holy.fovT, I.holy.ddT)) this._holyT = -1;
      }
      if (this._dodgeT >= 0) {
        // Purrfect Dodge: in 0.08 s, held through the slow motion (perfectDur), out 0.3 s (R2: no step in / out)
        const P = I.perfectDodge, t = (this._dodgeT += dt), hold = Math.max(0, PLAYER.dodge.perfectDur - pdIn(P));
        dd += P.dd * dodgeEnvelope(t, pdIn(P), hold, pdOut(P));
        if (t > pdIn(P) + hold + pdOut(P)) this._dodgeT = -1;
      }
    } else { this._punchT = -1; this._holyT = -1; this._dodgeT = -1; }
    if (bw > 0 && beat.dfov && !calm) dfov += beat.dfov * bw;
    d = Math.max(I.distMin * 0.7, d + dd);
    // pitch from the distance curve, rate-capped (R3 ≤ 20°/s); boss / portrait fixed
    const pitchGoal = this._pitchOf(dCurve);
    if (snap || !Number.isFinite(this._pitch)) { this._pitch = pitchGoal; this._pitchS.v = 0; }
    else this._pitch = smoothDamp(this._pitch, pitchGoal, this._pitchS, PITCH_ST, dt, (FR.rate.pitchDeg * Math.PI) / 180);
    let pitch = this._pitch;
    const gw = calm ? 0 : this._goldenEnvelope();
    if (gw > 0) { d = lerp(d, Math.min(d, I.golden.dist), gw); pitch = lerp(pitch, I.golden.pitch, gw); }
    d *= 1 + (I.dialog.mul - 1) * dlgW;
    this._dCur = dCurve;
    isoPosition(this.focus, yaw, pitch, d, out.pos);
    out.look.copy(this.focus);
    out.roll = 0;
    // R10: the base FOV (isoFrame fov / fovPortrait, Bigger hero, device profile) changes at ≤ rate.fovDeg °/s; a snap or
    // an orientation change (already under a veil) jumps; the punch / beat dfov above keeps its own envelopes
    if (snap || portrait !== this._fovPortrait || !Number.isFinite(this._fovB)) { this._fovB = base.fov; this._fovS.v = 0; }
    else {
      const f0 = this._fovB, cap = FR.rate.fovDeg * dt;
      this._fovB = clamp(smoothDamp(f0, base.fov, this._fovS, FOV_ST, dt, FR.rate.fovDeg), f0 - cap, f0 + cap);
    }
    this._fovPortrait = portrait;
    out.fov = this._fovB + dfov;
    const info = this.isoInfo;
    info.yaw = yaw; info.pitch = pitch; info.dist = d; info.fov = out.fov; info.portrait = base.portrait; info.phone = base.phone;
    info.frameOffset = A.toY - 0.5; info.profile = prof;
    info.catPx = pxAt(apparentH(pitch, I), d, out.fov, H);
    this.distance = d;
    this.pitch = pitch;
    this._isoD = d; this._isoP = pitch;
    this._snap = false;
    return out;
  }

  /** The pitch the iso rig gives a lens distance (curve + zone-hint blend; portrait / boss: fixed). */
  _pitchAt(d) {
    if (Number.isFinite(this._pitchFixed)) return this._pitchFixed;
    const c = isoPitch(d);
    return this._pitchHintW > 0 ? c + (this._pitchHint - c) * this._pitchHintW : c;
  }

  /**
   * §5.5 aim pan: while an aimed action with player.aim.range ≥ 5 m is held (the Holy wave charge until player
   * publishes `aim`), pan = aimDir × min(cap, 0.40 × max(0, |aim − her| − 3)); hold 0.35 s after release, then ease
   * back. Returns whether an aim is held.
   */
  _aimStep(p, dt, prof, frozen, calm) {
    const AP = ISO.aimPan, T = this._aimT;
    if (frozen) return this._aimHeld;
    const pos = p.object3d?.position ?? p.pos, aimed = p.aim;
    let range = Number.isFinite(aimed?.range) ? aimed.range : 0, held = aimed ? aimed.held !== false && range > 0 : false;
    if (!aimed && p.stateName === 'charge' && (p.charge ?? 0) >= (PLAYER.charge?.tier2 ?? 1.1)) { range = ATTACKS.holyWave?.range ?? 10; held = true; }
    held = held && range >= AP.minRange && !calm && GAMEPLAY.has(this.modeName);
    this._aimHeld = held;
    if (held) {
      let ax, az;
      const pt = aimed?.point;
      if (pt && Number.isFinite(pt.x)) { ax = pt.x; az = pt.z; }
      else if (this.ctx.input?.device === 'kbm' && this.cursorValid) { ax = this.cursorGround.x; az = this.cursorGround.z; }
      else { const f = p.facing ?? 0; ax = pos.x + Math.sin(f) * range; az = pos.z + Math.cos(f) * range; }
      const dx = ax - pos.x, dz = az - pos.z, L = Math.hypot(dx, dz);
      const cap = AP.cap[prof] ?? AP.cap.desktop, m = Math.min(cap, AP.gain * Math.max(0, Math.min(L, range) - AP.dead));
      T.x = L > 1e-3 ? (dx / L) * m : 0; T.z = L > 1e-3 ? (dz / L) * m : 0;
      this._aimHoldT = AP.hold;
    } else if (this._aimHoldT > 0) this._aimHoldT = Math.max(0, this._aimHoldT - dt);
    else { T.x = 0; T.z = 0; }
    return held;
  }

  /** §2.3 peek offset (smoothDamp; pad: the right stick, KBM: toward the cursor), out of combat only. */
  _peekStep(dt, p, feet, combat, snap) {
    const input = this.ctx.input, I = ISO;
    const peeking = !combat && !!input?.down?.('peek') && GAMEPLAY.has(this.modeName);
    if (peeking) {
      if (input.device === 'pad') { const a = input.aimStick ?? _ZV2; screenToWorldDir(a.x, a.y, this.isoYaw, _tmp); _tmp.y = 0; _tmp.multiplyScalar(I.peek.max); }
      else if (this.cursorValid) _tmp.set(this.cursorGround.x - feet.x, 0, this.cursorGround.z - feet.z);
      else _tmp.set(0, 0, 0);
      capXZ(_tmp, I.peek.max);
    } else _tmp.set(0, 0, 0);
    if (snap) { this._peek.set(_tmp.x, 0, _tmp.z); return; }
    smoothDamp2(this._peek, _tmp.x, _tmp.z, this._peekS, peeking ? 1 / I.peek.damp : I.peek.back / 3, dt);
  }

  /** §10.3 the pinch rubber band weight: 1 while the player zooms in below an active fit, then back over 0.6 s. */
  _rubberStep(dt, combat) {
    const on = combat && this._extra > 0.05 && this._pinchInT > 0;
    if (this._pinchInT > 0) this._pinchInT = Math.max(0, this._pinchInT - dt);
    if (on && !this._fitToast) {
      this._fitToast = true;
      const text = this.ctx.strings?.t?.('toast.cam.fitHold');
      if (text && text !== 'toast.cam.fitHold') this.ctx.bus?.emit?.(E.TOAST, { text });
    }
    this._rubber = on ? 1 : smoothDamp(this._rubber, 0, this._rubberS, ISO.pinch.rubberBack / 3, dt);
    if (on) this._rubberS.v = 0;
  }

  /** §5.6 snuggle: after 5 s with no input, no fight, no order and no beat: −0.6 m (st 1.2 s); any input: back (0.35 s). */
  /**
   * §10.2.7: lean the framing toward ui's guide target (≤ GUIDE_LOOK.max m, eased over GUIDE_LOOK.ease s) while it is
   * off screen and she is not fighting / locked on / in a cutscene. Reads `ctx.ui.beacon` defensively (no beacon: 0).
   */
  _guideLookStep(dt, feet, fight, snap, gmPlay) {
    const G = GUIDE_LOOK, bc = this.ctx.ui?.beacon, g = bc?.guide, L = this.guideLook;
    const ok = gmPlay && !fight && !this.lockTarget && this.modeName === 'follow' && !this._arena.locked && !!g?.pos && bc.state === 'on' && !bc.hidden;
    let on = false;
    if (ok) {
      const dx = g.x - feet.x, dz = g.z - feet.z, d = Math.hypot(dx, dz), id = g.id ?? '?';
      // fix round 2: a near target off screen (the barn chest 4.5 m south of her, below the bottom edge at 844×390) leans
      // too; it releases once she arrives (arriveR) instead of at `release` m, which a near target never passed
      const rel = Math.min(G.release, Math.max(G.near, Number.isFinite(g.arriveR) ? g.arriveR : 0));
      if (this._glOn !== null && (this._glOn !== id || d < rel)) this._glOn = null;
      if (this._glOn === null && bc.offscreen && d >= rel) this._glOn = id;
      on = this._glOn !== null && d > 1e-3;
      if (on) { this._glDir.x = dx / d; this._glDir.z = dz / d; }
    } else this._glOn = null;
    this._glW = snap ? (on ? 1 : 0) : clamp(this._glW + (on ? dt : -dt) / G.ease, 0, 1);
    const k = easeInOutSine(this._glW) * G.max;
    L.x = this._glDir.x * k; L.z = this._glDir.z * k;
  }

  _snuggleStep(dt, p, combat, calm, gmPlay, snap) {
    const S = ISO.snuggle, idle = this.ctx.input?.idleTime ?? 0;
    if (idle < S.after) this._snugArmed = true;
    // never inside the post-fight hold / fit release (§6.5: hold 1.5 s, then the fit eases in; an idle timer that ran
    // through a stand-still fight must not dolly in over it)
    const fitDone = this._extra < 0.05 && this._realT - this._lastNeedOut >= FR.dist.holdIn;
    const want = !calm && gmPlay && !combat && fitDone && !p.orders?.active && !this.beat.active && this.modeName === 'follow'
      && idle >= S.after && this._snugArmed;
    const tgt = want ? S.dd : 0;
    if (snap) { this._snug = 0; this._snugS.v = 0; return; }
    this._snug = smoothDamp(this._snug, tgt, this._snugS, want ? S.st : S.back, dt);
  }

  /**
   * §8.1 beats: triggers queued by the listeners, the guards (no live THREAT, gameplay mode in play, Reduce camera
   * motion off, one at a time), the opposing-input cancel (0.3 s) and the envelope step.
   */
  _beatStep(dt, p, feet, calm, gmPlay) {
    const B = this.beat, q = this._beatQ;
    const blocked = calm || !gmPlay || !GAMEPLAY.has(this.modeName) || this.subjects.hasThreat();
    if (B.active) {
      if (blocked) B.cancel();
      else {
        const m = this.ctx.input?.move, L = Math.hypot(B.lx, B.lz);
        if (m && L > 0.1 && Math.hypot(m.x, m.y) > 0.3) {
          screenToWorldDir(m.x, m.y, this.isoYaw, _tmp);
          if ((_tmp.x * B.lx + _tmp.z * B.lz) / (Math.hypot(_tmp.x, _tmp.z) * L) < -0.3) B.cancel();
        }
      }
    }
    if (q.id && !B.active && !blocked) {
      const id = q.id, pos = feet;
      if (id === 'peekaboo') {
        const T = BEATS.peekaboo, dx = (q.x - pos.x) * T.frac, dz = (q.z - pos.z) * T.frac;
        B.start(id, T.t, dx, dz, T.dd, 0);
      } else if (id === 'cosy') {
        if (!this._hostileNear(pos, BEATS.cosy.calmR)) B.start(id, BEATS.cosy.t, (q.x - pos.x) / 2, (q.z - pos.z) / 2, BEATS.cosy.dd, BEATS.cosy.dfov);
      } else if (id === 'roomRead' || id === 'establish') {
        const T = BEATS[id], dx = q.x - pos.x, dz = q.z - pos.z;
        B.start(id, T.t, dx, dz, Math.min(T.ddMax ?? ISO.beats.maxDd, this._fitDd(q.x, q.z, q.r)), 0);
      } else if (id === 'exhale') B.start(id, BEATS.exhale.t, 0, 0, BEATS.exhale.dd, 0);
      q.id = null;
    } else if (q.id && blocked && this._realT - q.t > BEAT_QUEUE_T) q.id = null;    // a stale trigger never fires late
    B.step(dt);
  }

  /** Δd (≥ 0) that frames a disc (x, z, r) around her at the current distance (room read / establishing read). */
  _fitDd(x, z, r) {
    if (!(r > 0)) return 0;
    const pool = this._tmpPool, v = this._view, p = this.ctx.player, feet = p?.object3d?.position ?? p?.pos;
    if (!feet) return 0;
    pool[SX] = feet.x; pool[SY] = feet.y + 0.4; pool[SZ] = feet.z; pool[SR] = FR.pad.her; pool[SW] = 1; pool[SF] = F_HARD;
    const o = STRIDE;
    pool[o + SX] = x; pool[o + SY] = feet.y; pool[o + SZ] = z; pool[o + SR] = r; pool[o + SW] = 1; pool[o + SF] = F_HARD;
    _F.set(feet.x, this._gy, feet.z);
    const lx = x - feet.x, lz = z - feet.z, L = Math.hypot(lx, lz), cap = ISO.beats.maxLean, k = L > cap ? cap / L : 1;
    const lr = (lx * v.Rx + lz * v.Rz) * k, lu = (lx * v.Ux + lz * v.Uz) * k;
    const need = needD(pool, 2, _F.x, _F.y, _F.z, lr, lu, v, this._dCur || ISO.dist);
    return Math.max(0, need - (this._dCur || ISO.dist));
  }

  /** Is any live hostile within r m of `pos`? */
  _hostileNear(pos, r) {
    const list = this.ctx.actors?.queryRadius?.(pos, r, hostileTo('player'));
    if (list) for (const a of list) if (liveHostile(a, this.ctx.player)) return true;
    return false;
  }

  /** §8.2 boss envelopes (real time): the phase breath (+dd for t s) and the Dizzy punch (−1.0 m). Returns Δd. */
  _bossEnvelopes(dt, calm) {
    const BO = ISO.boss;
    let dd = 0;
    if (this._breathT >= 0) {
      const t = (this._breathT += dt), T = BO.phaseBreath.t;
      dd += BO.phaseBreath.dd * Math.sin(Math.PI * Math.min(1, t / T));
      if (t >= T) this._breathT = -1;
    }
    const Z = BO.dizzy, dz = this._dizzy;
    if (dz.on && !calm) {
      dz.t += dt;
      if (dz.t > Z.maxHold) dz.on = false;
    }
    const want = dz.on && !calm && this._dizzyFits() ? 1 : 0;
    dz.w = want > dz.w ? Math.min(1, dz.w + dt / Z.in) : Math.max(0, dz.w - dt / Z.out);
    dd += Z.dd * easeInOutSine(dz.w);
    return dd;
  }

  /** Dizzy punch guard: every hard subject stays inside fitRect after the −1 m. */
  _dizzyFits() {
    const S = this.subjects, v = this._view, g = this._goal;
    const feet = this.ctx.player?.object3d?.position;
    if (!feet) return false;
    _F.set(feet.x, this._gy, feet.z);
    return allHardInside(S.data, S.n, _F, v, Math.max(ISO.boss.dist[0] + ISO.boss.dizzy.dd, (this._dCur || g.d) + ISO.boss.dizzy.dd), g.leanR, g.leanU, 1);
  }

  /** Orientation change: the zoom value of that orientation (camZoom / camZoomPortrait, §10.3). */
  _zoomOrientation(st, portrait) {
    if (this._zoomPortrait === portrait && this._zoomSeeded) return;
    const key = portrait ? 'camZoomPortrait' : 'camZoom';
    this._zoomPortrait = portrait; this._zoomSeeded = true;
    this.zoomMul = clamp(Number.isFinite(st[key]) ? st[key] : 1, ISO.zoom[0], ISO.zoom[1]);
  }

  /**
   * Desktop lock modes (AUTOCAM §10.4; KBM only, pad / touch always locked): `semi` = edge pan into an offset clamped
   * by herFrame that springs home (st 0.4 s) when she moves > 2 m, takes or deals damage, or after 3 s idle; `free` =
   * the spec's unlocked leash pan (25 m). Edge speed 18 × edgePanSpeed × easeOutCubic(held / 0.35 s).
   */
  _panStep(dt, feet, W, H, yaw, combat) {
    const input = this.ctx.input, U = ISO.unlock, SM = ISO.semi, pan = this._pan, semi = this._semi;
    const mode = input?.device === 'kbm' ? this.camLockMode : 'locked';
    const play = this.ctx.game?.mode === 'play';
    // edge push (CSS px from the canvas edge) and its ramp
    let sx = 0, sy = 0;
    const P = input?.pointer;
    if (mode !== 'locked' && play && P?.inside) {
      const r = canvasRect(this.ctx), ex = U.edgePx;
      if (P.x - r.left <= ex) sx = -1; else if (r.left + r.width - P.x <= ex) sx = 1;
      if (P.y - r.top <= ex) sy = 1; else if (r.top + r.height - P.y <= ex) sy = -1;
    }
    this._edgeT = sx || sy ? this._edgeT + dt : 0;
    const speed = U.panSpeed * (this.ctx.state?.settings?.edgePanSpeed ?? 1) * easeOutCubic(Math.min(1, this._edgeT / SM.edgeAccel));
    // free: the leash pan
    if (mode !== 'free' || !play) {
      if (pan.lengthSq() > 1e-6) smoothDamp2(pan, 0, 0, this._panS, U.recentre / 3, dt); else { pan.set(0, 0, 0); this._panS.vx = this._panS.vz = 0; }
    } else if (this._recentrePan || input.down?.('centre')) {
      smoothDamp2(pan, 0, 0, this._panS, U.recentre / 3, dt);
      if (pan.lengthSq() < 0.01) { pan.set(0, 0, 0); this._recentrePan = false; }
    } else if (sx || sy) {
      screenToWorldDir(sx, sy, yaw, _tmp);
      const l = Math.hypot(_tmp.x, _tmp.z) || 1;
      pan.x += (_tmp.x / l) * speed * dt; pan.z += (_tmp.z / l) * speed * dt;
      const Lp = Math.hypot(pan.x, pan.z);
      if (Lp > U.leash) { pan.x *= U.leash / Lp; pan.z *= U.leash / Lp; }
    }
    // semi: the clamped pan that springs home
    if (mode !== 'semi' || !play) { semi.x = 0; semi.z = 0; this._semiS.vx = this._semiS.vz = 0; return; }
    if (sx || sy) {
      if (!this._semiActive) { this._semiActive = true; this._semiFrom.set(feet.x, 0, feet.z); }
      this._semiIdle = 0;
      screenToWorldDir(sx, sy, yaw, _tmp);
      const l = Math.hypot(_tmp.x, _tmp.z) || 1;
      semi.x += (_tmp.x / l) * speed * dt; semi.z += (_tmp.z / l) * speed * dt;
      clampToLimits(semi, yaw, this._lim);
    } else this._semiIdle += dt;
    const moved = this._semiActive && Math.hypot(feet.x - this._semiFrom.x, feet.z - this._semiFrom.z) > SM.returnMove;
    if (moved || this._semiIdle > SM.returnIdle || this._semiHome) {
      this._semiActive = false; this._semiHome = false;
      this._semiReturn = true;
    }
    if (this._semiReturn) {
      smoothDamp2(semi, 0, 0, this._semiS, SM.returnST, dt);
      if (Math.hypot(semi.x, semi.z) < 0.01) { semi.x = 0; semi.z = 0; this._semiReturn = false; }
    }
  }

  _viewW() { return this._viewSize().w; }
  /** Bottom safe inset (CSS px): the desktop / pad ability bar's reserved height (ui/abilityBar.js; 0 on touch). */
  _insetBottom() { const v = this.ctx.ui?.bar?.insetBottom; return Number.isFinite(v) ? v : 0; }
  _viewH() { return this._viewSize().h; }

  /**
   * The canvas size (CSS px; clientWidth / clientHeight, window size without a canvas). PERF: re-read only when Picker's
   * cached canvas rect was refreshed (resize / scroll / ResizeObserver / its TTL), so the read never forces a layout
   * after the frame's DOM writes; a canvas without getBoundingClientRect (node tests) is read every call.
   * @returns {{w:number, h:number}}
   */
  _viewSize() {
    const vs = this._vs, el = this.ctx.renderer?.domElement;
    const r = el?.getBoundingClientRect ? canvasRect(this.ctx) : null;
    if (r === null || r !== vs.rect || el !== vs.el || !(vs.w > 0)) {
      vs.rect = r; vs.el = el ?? null;
      vs.w = el?.clientWidth || (typeof innerWidth !== 'undefined' ? innerWidth : 1280);
      vs.h = el?.clientHeight || (typeof innerHeight !== 'undefined' ? innerHeight : 720);
    }
    return vs;
  }

  /**
   * isoFrame for the current viewport / zoom / boss / hint / Bigger-hero inputs into this._fr0, re-derived only when one
   * of them changed (PERF: most frames have a settled zoom and no hint blend).
   */
  _isoBase(W, H, dev, boss, hv, bigger) {
    const k = this._fr0Key, devN = dev === 'touch' ? 1 : dev === 'pad' ? 2 : 0;
    const flags = devN | (boss ? 4 : 0) | (bigger ? 8 : 0);
    if (this._fr0Ok && k[0] === W && k[1] === H && k[2] === flags && k[3] === this._zoomS && Object.is(k[4], hv.dist) && k[5] === hv.distW
      && Object.is(k[6], hv.pitch) && k[7] === hv.pitchW) return this._fr0;
    k[0] = W; k[1] = H; k[2] = flags; k[3] = this._zoomS; k[4] = hv.dist; k[5] = hv.distW; k[6] = hv.pitch; k[7] = hv.pitchW;
    this._fr0Ok = true;
    const a = this._fr0Arg ?? (this._fr0Arg = {});
    a.w = W; a.h = H; a.device = dev; a.zoom = this._zoomS; a.boss = boss; a.hintDist = hv.dist; a.hintDistW = hv.distW;
    a.hintPitch = hv.pitch; a.hintPitchW = hv.pitchW; a.bigger = bigger;
    return isoFrame(a, this._fr0);
  }

  /**
   * Per rendered frame: the cursor ground point and the hover pick (§5.5: once per frame). PERF §4.5 (≤ 0.05 ms): the
   * ground ray is skipped while the pointer px, the rendered camera pose, her feet and the nav / prop versions are all
   * unchanged (_cursorKeyFresh); one cached canvas rect serves the ground ray and the actor pick.
   */
  _isoCursor() {
    const input = this.ctx.input, P = input?.pointer;
    // no live mouse cursor (touch / pad, or the pointer left the canvas): nothing is hovered — a stale pick would keep
    // pinning an enemy's HP bar (ui/hpBars) and winning interact priority (world/Level) with no cursor over it
    if (!P || input.device !== 'kbm' || !P.inside) { this.cursorValid = false; this._ck.ok = false; this._clearHover(); return; }
    const rect = canvasRect(this.ctx);
    if (!this._cursorKeyFresh(P.x, P.y, rect)) {
      const g = screenToGround(this.ctx, P.x, P.y, this.cursorGround, rect);
      this.cursorValid = !!g && Number.isFinite(g.x);
    }
    if (this.ctx.game?.mode === 'play') pickAt(this.ctx, P.x, P.y, HOVER_OPTS, this.hover, rect);
    else this._clearHover();
    this.hover.point.copy(this.cursorGround);
  }

  /**
   * Is the last cursor ground ray still valid? Compares (and then stores) the pointer px, the canvas rect, the camera's
   * world matrix + projection terms, her feet (the fallback plane / top tests use them), the level, the nav and link
   * versions and the static collider count; re-cast anyway every CURSOR_TTL frames (a prop collider moved in place via
   * StaticColliders.update bumps no version). No allocation: the key lives in `this._ck`.
   */
  _cursorKeyFresh(x, y, rect) {
    const k = this._ck, cam = this.ctx.camera, ph = this.ctx.physics, her = this.ctx.player?.pos, nav = ph?.nav;
    if (!cam) { k.ok = false; return false; }
    cam.updateMatrixWorld();
    const m = cam.matrixWorld.elements, pr = cam.projectionMatrix.elements, km = k.m;
    let same = k.ok && ++k.age < CURSOR_TTL && k.x === x && k.y === y && k.rl === rect.left && k.rt === rect.top && k.rw === rect.width && k.rh === rect.height
      && k.p0 === pr[0] && k.p5 === pr[5] && k.p8 === pr[8] && k.p9 === pr[9]
      && k.hx === (her?.x ?? 0) && k.hy === (her?.y ?? 0) && k.hz === (her?.z ?? 0)
      && k.level === (this.ctx.levels?.current ?? null) && k.nv === (nav?.version ?? -1) && k.nl === (nav?.linkVersion ?? -1)
      && k.sc === (ph?.statics?.count ?? -1);
    for (let i = 0; same && i < 16; i++) if (km[i] !== m[i]) same = false;
    if (same) return true;
    k.ok = true; k.age = 0; k.x = x; k.y = y; k.rl = rect.left; k.rt = rect.top; k.rw = rect.width; k.rh = rect.height;
    k.p0 = pr[0]; k.p5 = pr[5]; k.p8 = pr[8]; k.p9 = pr[9];
    k.hx = her?.x ?? 0; k.hy = her?.y ?? 0; k.hz = her?.z ?? 0;
    k.level = this.ctx.levels?.current ?? null; k.nv = nav?.version ?? -1; k.nl = nav?.linkVersion ?? -1; k.sc = ph?.statics?.count ?? -1;
    for (let i = 0; i < 16; i++) km[i] = m[i];
    return false;
  }

  /** Reset the hover pick to bare ground (drops the actor / interactable references). */
  _clearHover() {
    const h = this.hover;
    h.kind = 'ground'; h.actor = null; h.id = null; h.interact = null;
  }

  /**
   * Iso occlusion (§3): fade props between the lens and her chest / head, the engaged enemies within 8 m (≤ 4) and the
   * selection; her x-ray silhouette when the line to her chest is blocked for 0.1 s; enemies in a wind-up behind cover.
   */
  _isoOcclusion(dt, cam) {
    const p = this.ctx.player;
    if (!p) return;
    const O = ISO.occl, pos = p.object3d?.position ?? p.pos, h = p.height ?? 1;
    let n = 0, ne = 0;
    _radii[n] = O.herR; _subjects[n++].set(pos.x, pos.y + h * 0.5, pos.z);       // her chest capsule (covers the head)
    const sel = this.lockTarget;
    for (const e of this.engaged) {
      if (n >= _subjects.length - 2 || ne >= O.enemies) break;
      if (e === sel || Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) > O.enemyRange) continue;
      _radii[n] = O.enemyR; _subjects[n++].set(e.pos.x, e.pos.y + (e.height ?? 1) * 0.6, e.pos.z); ne++;
    }
    if (sel?.pos && sel.alive !== false) { _radii[n] = O.enemyR; _subjects[n++].set(sel.pos.x, sel.pos.y + (sel.height ?? 1) * 0.6, sel.pos.z); }
    const ord = p.orders, wp = ord?.moving ? ord.path?.[ord.wp] : null;
    if (wp && Math.hypot(wp.x - pos.x, wp.z - pos.z) <= 3) { _radii[n] = O.pathR; _subjects[n++].set(wp.x, (wp.y ?? pos.y) + 0.3, wp.z); }
    _feet.set(pos.x, pos.y, pos.z);
    const oo = this._occOpts;
    oo.n = n; oo.radii = _radii; oo.her = _feet;
    const T = this.timing;
    let t0 = T ? performance.now() : 0;
    this._fader.update(dt, cam.position, _subjects, oo);
    if (T) t0 = lap(T, 'fader', t0);
    // x-ray: a ray from the lens to her chest (props + architecture) at 20 Hz
    if ((this._xrayCheckT -= dt) <= 0) {
      this._xrayCheckT = 0.05;
      const blocked = this._herOccludedFracCached(cam.position, pos, h) > O.xrayFrac;   // > 30 % of her capsule
      this._xrayT = blocked ? this._xrayT + 0.05 : 0;
      const on = this._xrayT >= O.xrayDelay && GAMEPLAY.has(this.modeName);
      if (on !== this._xrayOn) { this._xrayOn = on; try { setXray(p, on); } catch { /* no proxy yet */ } }
      // enemies winding up behind cover (≤ 4; Low quality: her only)
      const low = this.ctx.quality?.id === 'low';
      const keep = _xrSet; keep.clear();
      if (!low) for (const e of this.engaged) {
        if (keep.size >= 4) break;
        if (e.stateName !== 'windup' && e.stateName !== 'aim') continue;
        _tgtPt.set(e.pos.x, e.pos.y + (e.height ?? 1) * 0.6, e.pos.z);
        if (this._blocked(cam.position, _tgtPt)) keep.add(e);
      }
      for (const e of this._xrayEnemies) if (!keep.has(e)) { try { setXray(e, false); } catch { /* */ } this._xrayEnemies.delete(e); }
      for (const e of keep) if (!this._xrayEnemies.has(e)) {
        const kind = e.telegraph?.kind ?? e.windupKind ?? 'parry';
        try { setXray(e, true, { color: TELEGRAPH.colors[kind] ?? '#FFFFFF' }); this._xrayEnemies.add(e); } catch { /* */ }
      }
    }
    if (T) lap(T, 'xray', t0);
  }

  _clearXray() {
    if (this._xrayOn) { this._xrayOn = false; try { setXray(this.ctx.player, false); } catch { /* */ } }
    for (const e of this._xrayEnemies) { try { setXray(e, false); } catch { /* */ } }
    this._xrayEnemies.clear();
    this._xrayT = 0;
  }

  /**
   * §3: the share of her capsule hidden from the lens (architecture and thin props, see _hides): 6 sample points (feet, hips, chest, head and
   * both flanks at chest height, screen-left / right) tested against the colliders.
   */
  /**
   * _herOccludedFrac, reused while the lens, her feet, her height and the yaw all moved < 1 cm / 0.001 rad and the
   * static collider count is unchanged (PERF: 6 physics casts per 20 Hz tick otherwise); re-cast every 10 ticks anyway.
   */
  _herOccludedFracCached(camPos, pos, h) {
    const q = this._xrq, sc = this.ctx.physics?.statics?.count ?? -1, E = 0.01;
    if (q.ok && ++q.age < 10 && q.sc === sc && q.h === h && Math.abs(q.yaw - this.yaw) < 1e-3
      && Math.abs(q.cx - camPos.x) < E && Math.abs(q.cy - camPos.y) < E && Math.abs(q.cz - camPos.z) < E
      && Math.abs(q.hx - pos.x) < E && Math.abs(q.hy - pos.y) < E && Math.abs(q.hz - pos.z) < E) return q.frac;
    q.ok = true; q.age = 0; q.sc = sc; q.h = h; q.yaw = this.yaw;
    q.cx = camPos.x; q.cy = camPos.y; q.cz = camPos.z; q.hx = pos.x; q.hy = pos.y; q.hz = pos.z;
    return (q.frac = this._herOccludedFrac(camPos, pos, h));
  }

  _herOccludedFrac(camPos, pos, h) {
    const sx = Math.cos(this.yaw), sz = -Math.sin(this.yaw), w = 0.28;          // screen-right in XZ at this yaw
    let n = 0;
    for (let i = 0; i < 6; i++) {
      const y = i === 0 ? 0.15 : i === 1 ? h * 0.35 : i === 2 || i > 3 ? h * 0.6 : h * 0.95;
      const o = i === 4 ? w : i === 5 ? -w : 0;
      _xrPt.set(pos.x + sx * o, pos.y + y, pos.z + sz * o);
      if (this._hides(camPos, _xrPt)) n++;
    }
    return n / 6;
  }

  /**
   * x-ray line of sight: does anything that hides her cut the segment a → b? Architecture and solid statics
   * (_blocked) and also the thin props the arm passes through (fence / gate rails, posts, trunks: a meadow gate
   * crossing her body hides her just as well). Arena mist walls and `cam: false` colliders never hide her.
   * One physics ray in the common case; falls back to _blocked when the first hit is one of the ignored ones.
   */
  _hides(a, b) {
    const ph = this.ctx.physics;
    if (!ph?.raycast) return this._blocked(a, b);
    _losDir.subVectors(b, a);
    const len = _losDir.length();
    if (len < 0.5) return false;
    _losDir.multiplyScalar(1 / len);
    _ray.set(a, _losDir);
    const hit = ph.castIgnore === true ? ph.raycast(_ray, len, XRAY_OPTS) : ph.raycast(_ray, len, ARM_OPTS);
    if (!hit) return false;
    if (hit.kind === 'static' && xrayIgnored(hit.object)) return ph.castIgnore === true ? false : this._blocked(a, b);
    return hit.distance < len - 0.35;
  }

  /** Does solid geometry (architecture, solid statics; not camera-transparent ones) cut the segment a → b? */
  _blocked(a, b) {
    _losDir.subVectors(b, a);
    const len = _losDir.length();
    if (len < 0.5) return false;
    _losDir.multiplyScalar(1 / len);
    const d = this._cast(a, _losDir, len, 0);
    return d >= 0 && d < len - 0.35;
  }

  // ------------------------------------------------------------------ internals
  /** Is an alerted / engaged hostile within COMBAT_RADIUS of her? */
  _nearThreat() {
    const p = this.ctx.player;
    const list = p && this.ctx.actors?.queryRadius?.(p.pos, COMBAT_RADIUS, hostileTo('player'));
    if (!list) return false;
    for (const a of list) {
      if (a === p || a.alive === false || a.dead || (a.hp !== undefined && a.hp <= 0)) continue;
      if (a.alerted || ENGAGED.has(a.stateName)) return true;
    }
    return false;
  }

  _candidates() {
    return this.ctx.actors?.queryRadius?.(this.ctx.player.pos, Math.max(LOCK.range, LOCK.breakRange), hostileTo('player')) ?? [];
  }

  _syncGameplayMode() {
    if (!GAMEPLAY.has(this.modeName)) return;
    this.modeName = this.lockTarget ? 'lock' : this.bossActive ? 'boss' : 'follow';
  }

  /** The live boss (enemies.boss while alive), or null. */
  _liveBoss() {
    const b = this.ctx.enemies?.boss;
    return b && b.alive !== false && !b.dead && (b.pos || b.object3d) ? b : null;
  }

  _setBoss(on) {
    this.bossActive = !!on;
    this._syncGameplayMode();
  }

  _behind() {
    const p = this.ctx.player;
    if (this.isIso) { this.yaw = this.isoYaw; this.pitch = this._isoP || ISO.pitchNear; this._recenter = false; return; }
    if (p) this.yaw = (p.facing ?? 0) + Math.PI;
    this.pitch = DEFAULT_PITCH;
    this._recenter = false;
  }

  /** Remember where the player is now (the gameplay framing's teleport detector compares against it). */
  _markPlayerPos() {
    const p = this.ctx.player;
    if (!p) return;
    this._lastPlayerPos.copy(p.object3d?.position ?? p.pos);
    this._hadPlayer = true;
  }

  _playerPivot(out) {
    const p = this.ctx.player;
    if (!p) return out.copy(this.pivot);
    out.copy(p.object3d?.position ?? p.pos);
    out.y += 0.8;
    return out;
  }

  /**
   * Start a pose blend from the current output pose. `iso`: the AUTOCAM §8.3 pose-space blend (log distance, yaw arc)
   * for the iso rig's hand-offs; otherwise the cylindrical arc around `pivot`.
   */
  _startBlend(dur, ease, pivot, sim, iso = false) {
    const b = this._blend;
    if (!(dur > 0)) { b.active = false; b.iso = false; return; }
    this._blendFrom.copy(this._outPose);
    b.active = true; b.t = 0; b.dur = dur; b.ease = resolveEase(ease); b.sim = !!sim; b.iso = !!iso; b.isoFrom = this._isoW;
    b.pivot = pivot ? (b._pv ?? (b._pv = new THREE.Vector3())).copy(pivot) : null;
  }

  _onLevelUnload() {
    this._clearHover();   // never carry the old level's actor / interactable across a level change
    this._clearXray?.();
    this._attacker = null; this._attackerT = 0;
    this.unlock();
    this._bossForced = false;
    this._setBoss(false);
    this._fader.clear();
    // AUTOCAM state of the old level: subjects, wind-ups, beats, the arena, the engaged set
    this.subjects.clear(); this._tel.clearAll(); this.beat.stop(); this.beat.fired.clear();
    this._arena.locked = false; this._arena.r = 0; this._engA.length = 0; this.engaged.length = 0;
    this._dizzy.on = false; this._breathT = -1; this._bossHoldT = 0; this._calmFit = 0;
    this.footprint.valid = false;
  }

  /** boss:start without an intro cutscene: the establishing read (lean to the arena centre, fit its radius; §8.2). */
  _onBossStart() {
    this._forceSolve = true;
    const story = this.ctx.story;
    if (story?.isPlaying || this._realT - this._lastCutEnd < CUT_RECENT || this.modeName === 'preset' || this.modeName === 'cutscene') return;
    const A = this._arena, b = this._liveBoss(), bp = b?.object3d?.position ?? b?.pos;
    const x = A.r > 0 ? A.x : bp?.x, z = A.r > 0 ? A.z : bp?.z;
    if (!Number.isFinite(x)) return;
    this.beat.stop();
    this._queueBeat('establish', x, z, A.r > 0 ? A.r : (b?.radius ?? 1) + ISO.framing.pad.boss);
  }

  /** Queue a beat trigger (fired by _beatStep when its guards allow, within BEAT_QUEUE_T s). */
  _queueBeat(id, x, z, r) {
    const q = this._beatQ;
    q.id = id; q.x = x; q.z = z; q.r = r; q.t = this._realT;
  }

  _onLevelLoaded(p) {
    const level = p?.level ?? this.ctx.levels?.current;
    if (this.isIso) this._isoLevelYaw(level);
    this._fader.clear();
    if (level?.root) this._fader.scan(level.root, this.ctx.scene);
    this._markFadeColliders(level);
    this._scanSolids(level);
    if (GAMEPLAY.has(this.modeName)) this.snapBehind();
  }

  /**
   * Register the level's solid occluders (see OccluderFader.scanSolids): props in the level's props group (never the
   * actors) standing on solid static colliders at least SOLID_MIN_H tall. Breakable / moving prop visuals (PropActors'
   * batch handles) are skipped. Marks the matched colliders (SOLID_COLLIDERS, slender ones BOSS_PASS).
   * @param {any} [level] defaults to the current level
   */
  _scanSolids(level = this.ctx.levels?.current) {
    this.solidOccluders = 0;
    const cols = level?.colliders, root = level?.groups?.props ?? level?.root;
    if (!cols || !root) return 0;
    const feet = [];
    for (const key of ['boxes', 'circles']) {
      for (const c of cols[key] ?? []) {
        if (!c || typeof c !== 'object' || camTransparent(c) || c.arenaWall) continue;
        const r = toRecord(c);
        if (!r || r.kind === 2) continue;                                  // rings (inside walls)
        if (Number.isFinite(r.y1) && Number.isFinite(r.y0) && r.y1 - r.y0 < SOLID_MIN_H) continue;
        feet.push(r);
      }
    }
    if (!feet.length) return 0;
    // batch instances that belong to PropActors (breakables, doors, cages) move or vanish: never part of a unit
    const skipIds = new Map();
    for (const a of level.actors ?? []) {
      const v = a?.visual;
      if (!v?.batch?.mesh || !v.handle) continue;
      const id = v.batch.items?.[v.handle.index]?.id;
      if (id == null) continue;
      let set = skipIds.get(v.batch.mesh);
      if (!set) skipIds.set(v.batch.mesh, set = new Set());
      set.add(id);
    }
    const skip = (obj, id) => (id >= 0 ? !!skipIds.get(obj)?.has(id) : false);
    let res;
    try { res = this._fader.scanSolids(root, feet, { skip, proxyParent: this.ctx.scene }); } catch (e) { console.warn('[camera] solid occluder scan failed', e); return 0; }
    for (const src of res.matched) {
      if (!src || typeof src !== 'object') continue;
      SOLID_COLLIDERS.add(src);
      const r = toRecord(src);
      if (r && Math.max(r.maxX - r.minX, r.maxZ - r.minZ) / 2 <= BOSS_PASS_R) BOSS_PASS.add(src);
    }
    this.solidOccluders = this._fader.solidCount;
    return res.units;
  }

  /**
   * Tag (FADE_COLLIDERS) the level's static colliders that are footprints of registered fadeable props, so the spring
   * arm passes them (and the fader fades the prop) instead of being pulled into her. Explicit `cam: true` blocks.
   * @param {any} [level] defaults to the current level
   */
  _markFadeColliders(level = this.ctx.levels?.current) {
    const cols = level?.colliders;
    if (!cols || !this._fader.count) return 0;
    let n = 0;
    for (const key of ['boxes', 'circles', 'segments']) {
      for (const c of cols[key] ?? []) {
        if (!c || typeof c !== 'object' || c.cam === true || camTransparent(c)) continue;
        const r = toRecord(c);
        if (!r || r.kind === 2) continue;                                  // arena fog rings never
        if (this._fader.covers(r.minX, r.maxX, r.minZ, r.maxZ, r.y1)) { FADE_COLLIDERS.add(c); n++; }
      }
    }
    return n;
  }

  _validateLock(dt) {
    const t = this.lockTarget, p = this.ctx.player;
    if (!t) return;
    if (!p || !GAMEPLAY.has(this.modeName)) { this.unlock(); return; }
    const reg = this.ctx.actors?.has ? this.ctx.actors.has(t) : true;
    if (!reg || !lockable(t)) {
      const next = handoverLockTarget(this._candidates(), p.pos, this.yaw, LOCK.range, t);
      if (next) { this.lockTarget = next; this._losT = 0; this._handoverT = 0; } else this.unlock();
      return;
    }
    const d = Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
    if (d > LOCK.breakRange) { this.unlock(); return; }
    // line of sight: pivot → target chest (terrain, architecture, solid props; a thin trunk doesn't break the lock)
    if (this.ctx.physics?.raycast) {
      _org.copy(p.pos); _org.y += CAMERA.pivotY;
      _tgt.copy(t.pos); _tgt.y += (t.height ?? 1) * 0.6;
      _losDir.subVectors(_tgt, _org);
      const len = _losDir.length();
      let blocked = false;
      if (len > 0.5) {
        _losDir.multiplyScalar(1 / len);
        const d = this._cast(_org, _losDir, len, 0);
        blocked = d >= 0 && d < len - 0.3;
      }
      this._losT = blocked ? this._losT + dt : 0;
      if (this._losT > LOCK.losTimeout) this.unlock();
    }
  }

  /**
   * Cast from `origin` along unit `dir` (a sphere of `radius`, or a ray for 0) against terrain + architecture +
   * static props, skipping camera-transparent statics (camTransparent). Returns the hit distance or −1.
   * @param {THREE.Vector3} origin @param {THREE.Vector3} dir @param {number} maxDist @param {number} radius
   */
  _cast(origin, dir, maxDist, radius) {
    const ph = this.ctx.physics;
    if (!ph?.raycast) return -1;
    const sphere = radius > 0 && typeof ph.sphereCast === 'function';
    // physics that honours opts.ignore(src) (requests/camera.md) does it in one exact cast
    const opts = ph.castIgnore === true ? this._armOptsIgnore : ARM_OPTS;
    _castOrg.copy(origin);
    let travelled = 0, thinAt = -1;
    for (let i = 0; i <= MAX_SKIPS; i++) {
      const rem = maxDist - travelled;
      if (rem <= 1e-4) return -1;
      _ray.set(_castOrg, dir);
      const hit = sphere ? ph.sphereCast(_ray, radius, rem, opts) : ph.raycast(_ray, rem, opts);
      if (!hit) return -1;
      if (hit.kind !== 'static' || !this._transparent(hit.object)) {
        // restarted inside a solid right behind a thin prop: its surface is somewhere in the skipped stretch;
        // stop at the thin prop (conservative: never inside the wall)
        if (thinAt >= 0 && hit.distance < 1e-3) return thinAt;
        return travelled + hit.distance;
      }
      thinAt = travelled + hit.distance;
      const skip = exitDistance(hit.object, _castOrg, dir, radius, hit.distance);
      travelled += skip;
      _castOrg.addScaledVector(dir, skip);
    }
    return -1;
  }

  /**
   * Spring-arm length along `dir` from `origin`: a sphere cast (r 0.2) against terrain, architecture and solid
   * static props (thin props / trees don't pull the camera in; they fade). Without physics.sphereCast: 3 rays
   * (centre + both sides).
   */
  _armLength(origin, dir, want, right) {
    const ph = this.ctx.physics;
    if (!ph?.raycast) return want;
    if (typeof ph.sphereCast === 'function') {
      const d = this._cast(origin, dir, want + ARM_RADIUS, ARM_RADIUS);
      return d >= 0 ? clamp(d - 0.05, ARM_MIN, want) : want;
    }
    let allowed = want;
    for (let i = 0; i < 3; i++) {
      const side = i === 0 ? 0 : i === 1 ? ARM_RADIUS : -ARM_RADIUS;
      _sideOrg.copy(origin).addScaledVector(right, side);
      const d = this._cast(_sideOrg, dir, want + ARM_MARGIN, 0);
      if (d >= 0) allowed = Math.min(allowed, Math.max(ARM_MIN, d - ARM_MARGIN));
    }
    return allowed;
  }

  // ==================== CLASSIC (remove after M3): orbit framing, lock yaw, boom avoidance ====================
  /** CLASSIC: gameplay framing (follow / lock / boss) → this._gamePose. */
  _gameplay(dt, look) {
    const ctx = this.ctx, p = ctx.player, out = this._gamePose, gm = ctx.game?.mode;
    if (!p) return out.copy(this._outPose);
    const ppos = p.object3d?.position ?? p.pos;
    if (!this._hadPlayer) this._snap = true;
    else if (ppos.distanceToSquared(this._lastPlayerPos) > TELEPORT_SQ) {        // teleport / respawn: cut, never sweep
      this._snap = true;
      this._blend.active = false;
    }
    this._hadPlayer = true;
    this._lastPlayerPos.copy(ppos);

    const lookOk = gm === 'play' || gm === 'memecam';
    const invert = ctx.state?.settings?.invertY ? -1 : 1;
    const t = this.lockTarget;
    if (lookOk) {
      if (!t) this.yaw -= look.x;
      this.pitch = clamp(this.pitch + look.y * invert, CAMERA.pitch[0], CAMERA.pitch[1]);
    }
    const lookIdle = ctx.input?.lookIdleTime ?? 0;
    const sp = Math.hypot(p.vel?.x ?? 0, p.vel?.z ?? 0);

    // ---- arm length: follow 3.6 / lock 4.5 / boss 6.0, eased over CAMERA.ease; charge push-in; golden punch-in
    const boss = this.bossActive ? this._liveBoss() : null;
    const base = this.bossActive ? (boss?.camDist > 0 ? boss.camDist : CAMERA.bossDist) : t ? CAMERA.lockDist : CAMERA.dist;
    const D = this._dist;
    if (base !== D.to) { D.from = this._snap ? base : this.distance; D.to = base; D.t = this._snap ? CAMERA.ease : 0; }
    D.t = Math.min(CAMERA.ease, D.t + dt);
    this.distance = lerp(D.from, D.to, easeInOutSine(CAMERA.ease > 0 ? D.t / CAMERA.ease : 1));
    const charging = p.stateName === 'charge' || (p.charge ?? 0) > 0;
    this._chargeW = damp(this._chargeW, charging ? 1 : 0, 5, dt);
    const g = this._goldenEnvelope();
    let want = this.distance - (CAMERA.dist - PLAYER.charge.camDist) * this._chargeW;
    want = lerp(want, 2.0, g);
    let fov = CAMERA.fov + (PLAYER.charge.camFov - CAMERA.fov) * this._chargeW;
    fov = lerp(fov, 36, g);

    // ---- combat framing: raised pitch + lifted look point while a fight is on (locked, or an alerted hostile near)
    const engaged = t || this._threat ? 1 : 0;
    this._combatW = this._snap ? engaged : damp(this._combatW, engaged, engaged > this._combatW ? 3 : 1.2, dt);
    const cw = this._combatW * (1 - g);
    const bp = boss ? (boss.object3d?.position ?? boss.pos) : null;
    const bossD = bp ? Math.hypot(bp.x - ppos.x, bp.z - ppos.z) : Infinity;
    const lift = COMBAT_LIFT * cw + (bp ? bossLift(boss.height, bossD) * (1 - g) : 0);
    const shoulder = t ? SHOULDER * (want / CAMERA.lockDist) : COMBAT_SHOULDER * cw;

    // ---- pivot (head height), smoothed: XZ fast, Y slow so jumps don't bob the view
    _piv.copy(ppos); _piv.y += lerp(CAMERA.pivotY, 0.85, g);
    if (this._snap) this.pivot.copy(_piv);
    else {
      this.pivot.x = damp(this.pivot.x, _piv.x, 20, dt);
      this.pivot.y = damp(this.pivot.y, _piv.y, 8, dt);
      this.pivot.z = damp(this.pivot.z, _piv.z, 20, dt);
    }
    const framePitch = () => this.pitch + Math.max(0, COMBAT_PITCH - this.pitch) * cw;
    let baseYaw = this.yaw;

    if (t) {
      // lock: face the target, then swing round to her right until the target stands clear of her on screen
      const tp = t.object3d?.position ?? t.pos;
      _tgtPt.set(tp.x, tp.y + (t.height ?? 1) * 0.6, tp.z);
      _body.copy(this.pivot); _body.y -= BODY_DROP;
      const yaw0 = Math.atan2(tp.x - ppos.x, tp.z - ppos.z) + Math.PI;
      const aspect = ctx.camera?.aspect > 0 ? ctx.camera.aspect : 16 / 9;
      const tanH = Math.tan((aspectFov(fov, aspect) * Math.PI) / 360) * aspect;
      const goal = lockSepGoal(Math.hypot(tp.x - ppos.x, tp.z - ppos.z));
      const bias = lockYawBias(this.pivot, _body, _tgtPt, yaw0, framePitch(), want, shoulder, lift, tanH, goal);
      this.lockBias = this._snap ? bias : damp(this.lockBias, bias, 6, dt);
      baseYaw = yaw0 + this.lockBias;
      this._lockYaw(baseYaw + this._avoidYaw, dt);
      this._recenter = false;
    } else {
      this.lockBias = 0;
      this._handoverT = -1;
      if (!bp) this.bossAssist = 0;
      if (this._recenter) {
        const w = (p.facing ?? 0) + Math.PI;
        this.yaw = dampAngle(this.yaw, w, 10, dt);
        this.pitch = damp(this.pitch, DEFAULT_PITCH, 8, dt);
        if (Math.abs(wrapAngle(this.yaw - w)) < 0.02) this._recenter = false;
      } else if (bp && lookOk && bossD > BOSS_NEAR) {
        // boss assist (replaces auto-follow in the fight): orbit just enough to keep him on screen
        this.bossAssist = 0;
        if (lookIdle > BOSS_LOOK_GRACE && !this._avoidActive) {
          const goal = bossFrameYaw(ppos.x, ppos.z, bp.x, bp.z, this.yaw, want);
          this.bossAssist = wrapAngle(goal - this.yaw);
          this.yaw = this._snap ? goal : dampAngle(this.yaw, goal, BOSS_YAW_RATE, dt);
        }
      } else if (lookOk && sp > 0.5 && lookIdle > CAMERA.autoFollowAfter && !this._avoidActive) {
        const w = (p.facing ?? 0) + Math.PI;
        const off = Math.abs(wrapAngle(w - this.yaw));               // 0 = camera already behind her
        if (off < 2.3) this.yaw = dampAngle(this.yaw, w, 1.5 * Math.min(1, sp / 4), dt);   // not when running at the camera
        this.pitch = damp(this.pitch, DEFAULT_PITCH, 0.8, dt);
      }
    }

    // boom avoidance: a low wall / standing stone / cart behind her lifts the boom over it or swings it clear
    const p0 = framePitch();
    this._avoid(dt, t ? baseYaw : this.yaw, p0, want, shoulder, !!t, lookOk ? lookIdle : Infinity);
    const pitch = p0 + Math.max(0, Math.min(this._avoidPitch, AVOID_PITCH_MAX - p0));
    const cp = Math.cos(pitch);
    _dir.set(Math.sin(this.yaw) * cp, Math.sin(pitch), Math.cos(this.yaw) * cp);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));            // screen right (tech.md §8)

    // lock / combat: the arm starts over her right shoulder
    _org.copy(this.pivot);
    if (shoulder > 0) _org.addScaledVector(_right, shoulder);
    const armOrigin = _tmp.copy(_org);
    const allowed = this._armLength(armOrigin, _dir, want, _right);
    this.curDist = this._snap ? allowed : damp(this.curDist, allowed, allowed < this.curDist ? 25 : 3, dt);
    out.pos.copy(armOrigin).addScaledVector(_dir, this.curDist);
    const gy = (ctx.physics?.heightAt?.(out.pos.x, out.pos.z) ?? -Infinity) + 0.3;
    if (out.pos.y < gy) out.pos.y = gy;

    if (t) lockLookPoint(this.pivot, _tgtPt, lift, out.look);
    else { out.look.copy(this.pivot); out.look.y += lift; }
    if (this._snap) this._lockLook.copy(out.look);
    else { this._lockLook.lerp(out.look, 1 - Math.exp(-10 * dt)); out.look.copy(this._lockLook); }
    out.roll = 0;
    out.fov = fov;
    this._snap = false;
    return out;
  }

  /**
   * Lock orbit yaw toward `goal`: damped; right after a dead-target hand-over the turn is rate-limited
   * (HANDOVER_RATE, eased in) so the new target never snap-orbits the camera round her mid-combo.
   */
  _lockYaw(goal, dt) {
    if (this._snap) { this.yaw = goal; this._handoverT = -1; return; }
    let ny = dampAngle(this.yaw, goal, 8, dt);
    if (this._handoverT >= 0) {
      this._handoverT += dt;
      const rate = HANDOVER_RATE * Math.min(1, 0.15 + this._handoverT / HANDOVER_EASE);
      const m = rate * dt, d = wrapAngle(ny - this.yaw);
      ny = this.yaw + clamp(d, -m, m);
      if (Math.abs(wrapAngle(goal - ny)) < 0.05 || this._handoverT > HANDOVER_MAX_T) this._handoverT = -1;
    }
    this.yaw = ny;
  }

  /** Arm length for orbit (yaw, pitch) with the right-shoulder offset (candidate test of the boom avoidance). */
  _armAt(yaw, pitch, want, shoulder) {
    const cp = Math.cos(pitch);
    _cDir.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    _cRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
    _cOrg.copy(this.pivot);
    if (shoulder > 0) _cOrg.addScaledVector(_cRight, shoulder);
    return this._armLength(_cOrg, _cDir, want, _cRight);
  }

  /**
   * Boom avoidance (ARM_SHORT / AVOID_CANDIDATES): when the arm at the base orbit (`yaw`, `pitch`) is cut short,
   * pick the cheapest candidate pitch lift / yaw swing whose arm reaches ARM_GOOD (else the longest one, if clearly
   * longer), then ease this._avoidPitch toward its lift and swing the yaw (follow: this.yaw itself, unless the
   * player is steering the view; lock: the this._avoidYaw offset, at most AVOID_LOCK_YAW).
   */
  _avoid(dt, yaw, pitch, want, shoulder, locked, lookIdle) {
    const ph = this.ctx.physics;
    if (!this.avoid || !ph?.raycast || want < ARM_SHORT) { this._avoidReset(); return; }
    const good = Math.min(want, ARM_GOOD);
    const base = this._armAt(yaw, pitch, want, shoulder);
    const need = this._avoidActive ? good : ARM_SHORT;           // hysteresis: once avoiding, keep at it until good
    const canYaw = locked || (lookIdle > AVOID_LOOK_GRACE && !this._recenter);
    if (base >= need - 1e-3) {
      this._avoidActive = false; this._avoidDy = 0; this._avoidDp = 0;
    } else if (this._snap || !this._avoidActive || (this._avoidEvalT -= dt) <= 0) {      // newly short: at once
      this._avoidEvalT = AVOID_EVAL;
      let pick = null, best = null, bestLen = base + (base < ARM_FLOOR ? 0.15 : 0.3);
      const prefer = Math.sign(this._avoidDy || this._avoidYaw) || 1;
      for (let pass = 0; pass < 2 && !pick; pass++) {
        for (const [dy, dp] of AVOID_CANDIDATES) {
          // equal cost: the side we already swung to first (pass 0), the other side on pass 1
          if (dy === 0 ? pass === 1 : (Math.sign(dy) === prefer) !== (pass === 0)) continue;
          if (dy !== 0 && (!canYaw || (locked && Math.abs(dy) > AVOID_LOCK_YAW))) continue;
          if (dp > 0 && pitch + dp > AVOID_PITCH_MAX + 1e-6) continue;
          const len = this._armAt(yaw + dy, pitch + dp, want, shoulder);
          if (len >= good - 1e-3) { pick = [dy, dp]; break; }
          if (len > bestLen) { bestLen = len; best = [dy, dp]; }
        }
      }
      pick ??= best;
      if (pick) { this._avoidActive = true; this._avoidDy = pick[0]; this._avoidDp = pick[1]; }
      else if (base >= ARM_SHORT - 1e-3) { this._avoidActive = false; this._avoidDy = 0; this._avoidDp = 0; }
    }
    const dp = this._avoidDp, dy = this._avoidDy;
    this._avoidPitch = this._snap ? dp : damp(this._avoidPitch, dp, dp > this._avoidPitch ? 6 : 2, dt);
    if (locked) this._avoidYaw = this._snap ? dy : damp(this._avoidYaw, dy, 3, dt);
    else {
      this._avoidYaw = 0;
      if (dy !== 0 && canYaw) this.yaw = this._snap ? this.yaw + dy : dampAngle(this.yaw, this.yaw + dy, 3, dt);
    }
  }

  _avoidReset() {
    this._avoidActive = false; this._avoidDy = 0; this._avoidDp = 0;
    this._avoidPitch = 0; this._avoidYaw = 0;
  }
  // ==================== /CLASSIC ==================

  /** Golden Hour activation dolly length: in (iso 0.25 s) + the 0.8 s Oath + out (iso 0.6 s); classic: the Oath only. */
  _goldenTotal() {
    return this.isIso ? ISO.golden.in + PLAYER.golden.activate + ISO.golden.out : PLAYER.golden.activate;
  }

  /**
   * Golden Hour activation envelope (0 → 1 → 0). Iso (§2.4): dolly in over 0.25 s, hold through the 0.8 s Oath, back
   * over 0.6 s. Classic: the old punch-in over PLAYER.golden.activate.
   */
  _goldenEnvelope() {
    const t = this._goldenT;
    if (t <= 0) return 0;
    if (this.isIso) {
      const G = ISO.golden, T = this._goldenTotal(), e = T - t;          // elapsed
      if (e < G.in) return easeInOutSine(e / G.in);
      if (e < G.in + PLAYER.golden.activate) return 1;
      return easeInOutSine(Math.max(0, t / G.out));
    }
    const T = PLAYER.golden.activate;
    const u = 1 - t / T;                                   // 0 → 1 over the activation
    return u < 0.2 ? easeInOutSine(u / 0.2) : u > 0.65 ? easeInOutSine((1 - u) / 0.35) : 1;
  }

  /** §2.4 dialogue: the speaking actor (not her) within 12 m of her, else null. */
  _speaker(ppos) {
    const id = this._speakerId;
    if (!id || id === 'swordcat' || id === 'player') return null;
    const a = this.ctx.actors?.get?.(id);
    const ap = a?.object3d?.position ?? a?.pos;
    if (!ap || a === this.ctx.player) return null;
    return Math.hypot(ap.x - ppos.x, ap.z - ppos.z) <= 12 ? ap : null;
  }

  // ==================== CLASSIC (remove after M3): lock flicks ====================
  /** CLASSIC: lock switching from mouse flicks / right-stick flicks (render time, raw look deltas). */
  _flicks(dt, look) {
    if (!this.lockTarget || this.ctx.game?.mode !== 'play') { this._flick.reset(); return; }
    let dir = this._flick.push(look.px || 0, dt);
    const input = this.ctx.input;
    if (!dir && input?.device === 'pad') {
      let sx = input.padLook?.x ?? 0;
      if (!sx && dt > 0) sx = clamp(look.x / (this.ctx.config.INPUT.padLookSpeed * (input.sensitivity ?? 1) * dt), -1, 1);
      dir = this._stick.push(sx);
    }
    if (dir) this.switchLock(dir, false);
  }
  // ==================== /CLASSIC ==================

  /**
   * End points of the near-lens fade segments: the LENS_GRID view directions, `depth` m deep (camera space z).
   * @param {THREE.PerspectiveCamera} cam @param {number} depth @returns {number} how many points were written
   */
  _lensPoints(cam, depth) {
    if (!(depth > 0.2)) return 0;
    cam.updateMatrixWorld();
    const tanV = Math.tan((cam.fov * Math.PI) / 360), tanH = tanV * (cam.aspect > 0 ? cam.aspect : 16 / 9);
    for (let i = 0; i < LENS_GRID.length; i++) {
      const [gx, gy] = LENS_GRID[i];
      _q.set(gx * tanH * depth, gy * tanV * depth, -depth).applyMatrix4(cam.matrixWorld);
      _lens[i].copy(_q);
    }
    return LENS_GRID.length;
  }

  // ------------------------------------------------------------------ per frame
  render(alpha, frameDt) {
    const T = this.timing;
    if (T === null) { this._render(alpha, frameDt); return; }
    const t0 = performance.now();
    this._render(alpha, frameDt);
    lap(T, 'render', t0);
  }

  /**
   * Opt-in per-function camera timings (PERF report, perf:frame / camera:perf): `on` installs `this.timing` = { render,
   * cursor, gameplay, occlusion, fader, xray, footprint, fog } as exponential moving averages (ms, α 0.05) and `n`
   * (frames measured); off (the default) costs one null check per render.
   * @param {boolean} [on] @returns {Record<string, number>|null}
   */
  setProfiling(on = true) {
    this.timing = on ? { n: 0, render: 0, cursor: 0, gameplay: 0, occlusion: 0, fader: 0, xray: 0, footprint: 0, fog: 0 } : null;
    return this.timing;
  }

  _render(alpha, frameDt) {
    const ctx = this.ctx, cam = ctx.camera, game = ctx.game, T = this.timing;
    let t0 = 0;
    const dt = Math.min(Math.max(frameDt || 0, 0), ISO.follow.dtMax ?? 0.1);    // D12: real time, clamped
    this._realT += dt;
    const paused = game?.mode === 'menu';
    const sdt = paused ? 0 : dt * (game?.loop?.timeScale ?? 1);         // sim-time for cutscene timelines
    const look = ctx.input?.consumeLook?.() ?? ZERO_LOOK;
    if (this._handback >= 0) {
      const b = this._handback;
      this._handback = -1;
      if (this.modeName === 'preset' || this.modeName === 'cutscene') this.mode('follow', { blend: b > 0 ? b : false });
    }
    if (T) { T.n++; t0 = performance.now(); }
    if (this.isIso) this._isoCursor();
    else if (this.hover.kind !== 'ground') this._clearHover();   // follow / cutscene: no hover pick runs
    let pose;
    switch (this.modeName) {
      case 'meme': pose = this._meme.update(dt); break;
      case 'preset': pose = this._cut.update(sdt); if (this._cut.landed && !this._landShaken) { this._landShaken = true; this.shake(0.2); } break;
      case 'cutscene': pose = this._holdPose; break;
      default:
        if (T) t0 = lap(T, 'cursor', t0);
        if (this.isIso) pose = this._isoGameplay(paused ? 0 : dt);
        else { pose = this._gameplay(dt, paused ? ZERO_LOOK : look); this._flicks(dt, look); }
        if (T) lap(T, 'gameplay', t0);
    }
    // iso weight: 1 in the gameplay rig, 0 in presets / cutscenes / Meme Cam. It moves the anchor (setViewOffset), so it
    // only changes WITH the pose: a held cutscene pose keeps the anchor it was frozen with (no unauthored slide); a
    // blend drives it with the blend's own eased k (her screen position stays put through a hand-back); a cut snaps
    const isoGoal = this.isIso && GAMEPLAY.has(this.modeName) ? 1 : 0, bl = this._blend;
    if (this._snapIso) this._isoW = isoGoal;
    else if (bl.active) this._isoW = lerp(bl.isoFrom, isoGoal, bl.ease(clamp((bl.t + (bl.sim ? sdt : dt)) / bl.dur, 0, 1)));
    else if (this.modeName !== 'cutscene') this._isoW = isoGoal;
    if (Math.abs(isoGoal - this._isoW) < 1e-3) this._isoW = isoGoal;
    if (this.modeName !== 'preset') this._landShaken = false;
    if (this._goldenT > 0) this._goldenT = Math.max(0, this._goldenT - dt);       // real time, in every mode

    const b = this._blend, out = this._outPose;
    if (b.active) {
      b.t += b.sim ? sdt : dt;
      const k = b.ease(clamp(b.t / b.dur, 0, 1));
      if (b.iso) blendPoseIso(this._blendFrom, pose, k, out);
      else {
        if (b.pivot && GAMEPLAY.has(this.modeName)) this._playerPivot(b.pivot);
        blendPose(this._blendFrom, pose, k, b.pivot, out);
      }
      if (b.t >= b.dur) { b.active = false; b.iso = false; }
    } else out.copy(pose);

    applyPose(cam, out);

    // FOV: pose FOV + the Holy punch; widened on narrow (portrait) screens (classic / presets; the iso rig has its own)
    if (this._fovPunchT > 0) this._fovPunchT = Math.max(0, this._fovPunchT - dt);
    const punch = this._fovPunchT > 0 && this._isoW < 1 ? JUICE.holy.fovPunch * Math.sin(Math.PI * (1 - this._fovPunchT / 0.15)) : 0;
    this.fov = out.fov + punch;
    const fov = lerp(aspectFov(this.fov, cam.aspect), this.fov, this._isoW);
    let proj = false;
    if (Math.abs(fov - this._appliedFov) > 1e-3) { cam.fov = fov; this._appliedFov = fov; proj = true; }
    // near / far: the iso rig's 0.3 m and the merged footprint / fog far (X12; quantised to 5 m, so a handful of
    // projection updates per minute); RENDER near / far for presets, Meme Cam and classic
    const isoView = this._isoW > 0.5;
    const near = isoView ? ISO.near : RENDER.near, far = isoView ? this.farPlane : RENDER.far;
    if (near !== this._near || far !== this._far) { cam.near = near; cam.far = far; this._near = near; this._far = far; proj = true; }
    // §5.1 anchor: SafeFrame's (fx, fy), eased 0.4 s on change, weighted to the centre by the iso weight (presets,
    // cutscenes and the Meme Cam are authored centred); applied as a whole-px setViewOffset, only on change
    const A = this._anc;
    if (A.t < 1) {
      A.t = Math.min(1, A.t + dt / Math.max(1e-3, ISO.frame.anchorEase));
      const k = easeInOutSine(A.t);
      A.x = lerp(A.fromX, A.toX, k); A.y = lerp(A.fromY, A.toY, k);
    } else { A.x = A.toX; A.y = A.toY; }
    const vw = this._viewW(), vh = this._viewH();
    const fx = 0.5 + (A.x - 0.5) * this._isoW, fy = 0.5 + (A.y - 0.5) * this._isoW;
    if (this._applyAnchor(cam, vw, vh, fx, fy)) proj = false;     // setViewOffset updates the projection
    if (proj) cam.updateProjectionMatrix();

    // camera-space rotations after lookAt; the iso rig mixes less rotation, more screen-plane jolt (§2.5); on touch
    // no roll / rotation at all (AUTOCAM §10.2: rotation on a small screen reads as nausea)
    const isoShake = isoView, st = ctx.state?.settings;
    const calmShake = st?.reduceCameraMotion && st?.shake == null ? 0 : 1;
    if (isoShake) {
      const m = _shakeMix, S = ISO.shake;
      m.rotMul = S.rotMul * (ctx.input?.device === 'touch' ? (ISO.touchShakeRot ?? 0) : 1);
      m.transMul = S.transMul; m.rotMaxDeg = S.rotMaxDeg; m.transMax = S.transMax;
    }
    this.shaker.apply(cam, dt, (st?.shake ?? 1) * calmShake * (isoShake ? ISO.shake.scale : 1), isoShake ? _shakeMix : null);
    cam.updateMatrixWorld();
    _projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(_projView);
    this._frustumOk = true;
    this.frameId++;
    // §9.1 footprint + §9.3 far (applied next frame) from the gameplay pose
    if (T) t0 = performance.now();
    if (this.isIso) this._publishFootprint(isoView, vw, vh, fx, fy);
    if (T) t0 = lap(T, 'footprint', t0);
    this._closeUpStep(cam);
    // §4.1 focus fog: Env owns the uniforms; mode follows the iso weight, the clear radius widens in combat
    if (this.isIso) {
      const p = ctx.player;
      if (this._isoW <= 0 && p) this.focus.copy(p.object3d?.position ?? p.pos);
      const fa = this._fogArg;
      fa.focus = this.focus; fa.mode = this._isoW; fa.combat = this.engaged.length > 0 || this.bossActive; fa.boss = this.bossActive;
      if (T) t0 = performance.now();
      ctx.env?.setFocusFog?.(fa);
      if (T) lap(T, 'fog', t0);
    }
    if (this.isIso && GAMEPLAY.has(this.modeName)) {
      if (T) t0 = performance.now();
      this._isoOcclusion(dt, cam);
      if (T) lap(T, 'occlusion', t0);
      this._marker.update(null, cam, dt, false);
      return;
    }
    if (this.isIso) this._clearXray();

    // cutscene / preset / meme shots (both rigs) and the CLASSIC gameplay orbit: positional tree fade.
    // tree fade: anything between the camera and the subject (her, or the shot's subject); establishing / long-lens
    // shots (camera far from the subject) keep their foreground trees solid
    const subj = this.modeName === 'preset' ? this._cut.subject : ctx.player ? (ctx.player.object3d?.position ?? ctx.player.pos) : null;
    if (subj) {
      const h = this.modeName === 'preset' ? (this._cut.frame.height ?? 1) : (ctx.player?.height ?? 1);
      _subjects[0].copy(subj); _subjects[0].y += h * 0.5;
      _subjects[1].copy(subj); _subjects[1].y += h * 1.05;
      const d2 = cam.position.distanceToSquared(_subjects[0]);
      const near = d2 <= FADE_MAX_DIST * FADE_MAX_DIST;
      // lens segments: never deeper than most of the way to her (props behind her are not in the way)
      const nLens = near ? this._lensPoints(cam, Math.min(LENS_FADE_DIST, 0.85 * Math.sqrt(d2))) : 0;
      const nearSolid = d2 <= SOLID_FADE_MAX_DIST * SOLID_FADE_MAX_DIST;
      this._fader.update(dt, cam.position, _subjects, near || nearSolid ? 2 : 0, _lens, nLens, !near);
    }
    this._marker.update(GAMEPLAY.has(this.modeName) ? this.lockTarget : null, cam, dt, this.showLockMarker);
  }

  /**
   * AUTOCAM §5.1 applyAnchor: the focus drawn at (fx, fy) of the view via a whole-pixel setViewOffset (no sub-pixel
   * shimmer; frustum culling stays exact), only on change. Returns true when the projection was rebuilt.
   */
  _applyAnchor(cam, vw, vh, fx, fy) {
    const ox = Math.round((0.5 - fx) * vw), oy = Math.round((0.5 - fy) * vh), vo = this._vo;
    if (ox === vo.x && oy === vo.y && vw === vo.w && vh === vo.h) return false;
    vo.x = ox; vo.y = oy; vo.w = vw; vo.h = vh;
    if (ox || oy) cam.setViewOffset(vw, vh, ox, oy, vw, vh); else cam.clearViewOffset();
    return true;
  }

  /**
   * AUTOCAM §9.1 / §9.3: the visible ground footprint of the iso pose (valid in the gameplay rig only; `version` bumps
   * when a quantised consumer value changes) and the merged far plane for the next frame (X12; farKeep landmarks).
   */
  _publishFootprint(isoView, vw, vh, fx, fy) {
    const fp = this.footprint, info = this.isoInfo, I = ISO;
    if (!isoView || !GAMEPLAY.has(this.modeName)) { fp.valid = false; return; }
    const tanV = Math.tan((info.fov * Math.PI) / 360), tanH = tanV * (vw / Math.max(1, vh));
    const gy = this._gy - (I.focusY ?? 0.6);
    if (!footprintOf(this.focus, this.isoYaw, info.pitch, info.dist, tanV, tanH, fx, fy, gy, fp)) { fp.valid = false; return; }
    fp.valid = true;
    const q = I.foot.shadowQuant || 1, Q = this._fpQ;
    const a = Math.round(fp.cx / q), b = Math.round(fp.cz / q), c = Math.round(fp.ahead / q), d = Math.round(fp.behind / q), e = Math.round(fp.halfW / q);
    if (a !== Q[0] || b !== Q[1] || c !== Q[2] || d !== Q[3] || e !== Q[4]) { Q[0] = a; Q[1] = b; Q[2] = c; Q[3] = d; Q[4] = e; fp.version++; }
    // far: the footprint term and the fog radius (no fog model, e.g. a bare node ctx: the legacy far stays)
    const env = this.ctx.env, rho = env?.fogDensity;
    if (!Number.isFinite(rho) || rho <= 0) { this.farPlane = I.foot.farFallback ?? I.far; return; }     // X12 fallback 60
    const F = I.fog, lf = this.ctx.levels?.current?.cam?.fog ?? EMPTY;
    const combat = this.engaged.length > 0 || this.bossActive;
    const clear = combat ? (lf.clearCombat ?? F.clearCombat) : (lf.clear ?? F.clear);
    let far = farPlane(fp.slantMax, info.dist, info.pitch, fogRadius(rho, clear, lf.topMul ?? F.topMul));
    // world `farKeep` landmarks inside the frustum side planes stay drawn
    const keep = this.ctx.levels?.current?.farKeep;
    if (Array.isArray(keep) && keep.length) {
      const cam = this.ctx.camera, pl = this._frustum.planes, fq = I.foot.farQuant;
      for (let i = 0; i < keep.length; i++) {
        const k = keep[i], p = k?.position ?? k, r = k?.r ?? k?.userData?.farKeepR ?? 2;
        if (!p || !Number.isFinite(p.x)) continue;
        _v3.set(p.x, p.y ?? 0, p.z);
        let inside = true;
        for (let j = 0; j < 4 && inside; j++) if (pl[j].distanceToPoint(_v3) < -r) inside = false;
        if (inside) far = Math.max(far, Math.ceil((cam.position.distanceTo(_v3) + r) / fq) * fq);
      }
    }
    this.farPlane = far;
  }

  /**
   * ART §6.1 `closeUp`: the lens within CLOSE.on (6.0 m) of the framed character (her; a shot's anchor actor), off
   * beyond CLOSE.off (6.3 m); on change the character's view gets setCloseUp(on) (shells, cape grid, close-up set).
   */
  _closeUpStep(cam) {
    const p = this.ctx.player;
    const a = this.modeName === 'preset' ? (this._cut.frame?.actor ?? p) : p;
    let on = false;
    if (a) {
      const pos = a.object3d?.position ?? a.pos;
      const d = pos ? Math.hypot(cam.position.x - pos.x, cam.position.y - (pos.y + (a.height ?? 1) * 0.5), cam.position.z - pos.z) : Infinity;
      on = this.closeUp && a === this._closeUpActor ? d <= CLOSE.off : d < CLOSE.on;
    }
    if (on === this.closeUp && a === this._closeUpActor) return;
    const prev = this._closeUpActor;
    if (prev && this.closeUp && prev !== a) viewOf(prev)?.setCloseUp?.(false);
    this.closeUp = on; this._closeUpActor = a;
    try { viewOf(a)?.setCloseUp?.(on); } catch (e) { console.warn('[camera] setCloseUp', e); }
  }
}

/** The character view of an actor (player.model / companion.visual / view). */
function viewOf(a) { return a ? (a.view ?? a.model ?? a.visual ?? null) : null; }

/**
 * Keep at least a 4:3 horizontal field on narrow screens (portrait phones): the vertical FOV grows so the
 * horizontal FOV matches what `fov` gives at 4:3 (capped at 80°).
 * @param {number} fov vertical degrees @param {number} aspect width / height
 */
export function aspectFov(fov, aspect) {
  const minAspect = 4 / 3;
  if (!(aspect > 0) || aspect >= minAspect) return fov;
  const r = Math.tan((fov * Math.PI) / 360) * (minAspect / aspect);
  return Math.min(80, (Math.atan(r) * 360) / Math.PI);
}

export { PRESETS };
