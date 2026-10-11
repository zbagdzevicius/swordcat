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
// Emits E.MEME_CAM { on } entering / leaving 'meme'. Listens: E.SHAKE, E.CAM_MODE, E.BOSS_START / BOSS_DEFEATED,
// E.ARENA_CLEAR, E.LEVEL_LOADING / LEVEL_LOADED / LEVEL_UNLOAD, E.PLAYER_SPAWNED, E.PLAYER_HOLY (FOV punch),
// E.PLAYER_GOLDEN (punch-in), E.BOSS_DIZZY (the §8.2 dizzy shake), E.CUTSCENE_END (handback), E.GAME_MODE.
// Hit / parry / block / guard-break shakes arrive as E.SHAKE from combat (one source, no double shake).
//
// Follow camera (tech.md §8): orbit around a pivot at the player's head (CAMERA.pivotY) with a spring arm
// (physics.sphereCast; pulls in fast, eases out slowly), never below the terrain; auto-follow after 1.5 s without
// look input; lock-on frames the midpoint over her right shoulder at 4.5 m; boss arenas ease to 6.0 m over 0.6 s.
// The arm collides with terrain, architecture and solid static props (houses, walls, statues, big rocks); thin
// statics (trunks, posts, fences: see camTransparent) and colliders tagged `cam: false` are skipped: they fade.
// When the arm would be cut below ARM_SHORT (a low wall, standing stone or cart right behind her) the boom lifts its
// pitch over the obstacle and / or swings to the nearest clear side instead (see _avoid; `cam.avoid = false` disables).
// Everything runs in render() with the interpolated player position (no 120 Hz jitter); input edges in update().
//
// M2 additions:
// - Boss framing (B1 Grizzlechop, B2 Cacklejaw, later bosses): the 6.0 m arm (or `boss.camDist`), and while not
//   locked a soft "boss assist" that orbits just enough to keep the boss inside BOSS_EDGE of the screen centre once
//   the player stops steering the view (BOSS_LOOK_GRACE); it replaces auto-follow during the fight. Tall bosses
//   (> 1.6 m) lift the look point a little when close (bossLift). Arena fog walls never pull the arm in, and in boss
//   fights slender solid props (millstone pillars, posts; footprint ≤ BOSS_PASS_R) let the arm through and fade.
// - Solid occluders (town / hub buildings, towers, statues, pillars): auto-registered on level load from the props
//   group + the level's solid colliders (OccluderFader.scanSolids; world may tag `camFade: 'solid'` instead). They
//   still stop the spring arm, but fade whenever they hide her (overhanging eaves, corners in lock / boss framing,
//   cutscene shots).
// - Cutscene shots: `collide` rails (PULLBACK) use this camera's arm cast; `scale: 'height'` presets (BOSS_INTRO).
import * as THREE from 'three';
import { E } from '../core/events.js';
import { CAMERA, PLAYER, JUICE } from '../core/config.js';
import { damp, dampAngle, clamp, lerp, wrapAngle, easeInOutSine } from '../core/math.js';
import { hostileTo } from '../core/ActorRegistry.js';
import { CameraShake } from './CameraShake.js';
import { CamPose, blendPose, applyPose, resolveEase } from './pose.js';
import { CutsceneCamera, SHOT_MODES } from './CutsceneCamera.js';
import { MemeCam } from './MemeCam.js';
import { acquireLockTarget, RECENT_ATTACKER_TIME, handoverLockTarget, switchLockTarget, lockable, FlickDetector, StickFlick, LockMarker } from './LockOn.js';
import { OccluderFader, SOLID_MIN_H } from './Occluders.js';
import { PRESETS, localToWorld } from './presets.js';
import { toRecord } from '../physics/StaticColliders.js';
import { RENDER, AIM, TELEGRAPH } from '../core/config.js';
import { ISO, isoFrame, isoPosition, isoLead, fitDist, pxAt, screenToWorldDir, capXZ } from './IsoRig.js';
import { screenToGround, pickAt, worldToScreen as w2s, canvasRect } from './Picker.js';
import { setXray } from '../characters/Readability.js';

const LOCK = PLAYER.lockOn;
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
/** near-lens fade: fadeable props within this depth (m) in front of the lens fade (fence rails, posts, trunks) */
export const LENS_FADE_DIST = 2.2;
/** near-lens fade: the grid (NDC) the lens segments pass through */
const LENS_GRID = Object.freeze([[0, 0], [-0.5, 0], [0.5, 0], [-0.95, 0], [0.95, 0], [0, -0.6], [0, 0.6], [0, -0.95], [0, 0.95],
  [-0.5, -0.6], [0.5, -0.6], [-0.5, 0.6], [0.5, 0.6], [-0.95, -0.6], [0.95, -0.6], [-0.95, 0.6], [0.95, 0.6]]);
/** enemy states that count as engaged even without the `alerted` flag */
const ENGAGED = new Set(['alert', 'chase', 'windup', 'strike', 'recover', 'circle', 'attack', 'aim']);
/** min/max spring-arm length (m) */
const ARM_MIN = 0.8, ARM_MARGIN = 0.3, ARM_RADIUS = 0.2;
/** what the spring arm and the lock-on line of sight test: terrain + architecture + static props (thin ones skipped) */
const ARM_OPTS = Object.freeze({ terrain: true, mesh: true, statics: true });
/** static circles up to this radius (trunks, posts, pillars of a fence) never pull the camera in (m) */
export const THIN_RADIUS = 0.6;
/** segment colliders (fences, thin walls) up to this half-thickness are skipped too (m) */
const THIN_SEGMENT = 0.2;
const MAX_SKIPS = 6;
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
/** tree fade only while the camera is this close to its subject (m): follow / lock / boss arms, close shots */
export const FADE_MAX_DIST = 9;
/** solid occluders (houses, towers) fade up to this camera-to-subject distance (m): a house never hides her in a
 *  medium cutscene shot either; only far establishing shots keep them solid */
export const SOLID_FADE_MAX_DIST = 18;
/** Meme Cam: rotations of the MEME_LOOP framing around her (rad) tried in order until the lens has a clear view */
export const MEME_YAWS = Object.freeze([0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]);
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

const GAMEPLAY = new Set(['follow', 'lock', 'boss']);
/** the player moving more than this between two rendered frames is a teleport (m²: 6 m) */
const TELEPORT_SQ = 36;
const ZERO_LOOK = Object.freeze({ x: 0, y: 0, px: 0, py: 0 });

const _dir = new THREE.Vector3(), _piv = new THREE.Vector3(), _right = new THREE.Vector3(), _tmp = new THREE.Vector3();
const _org = new THREE.Vector3(), _lookPt = new THREE.Vector3(), _tgt = new THREE.Vector3(), _ray = new THREE.Ray();
const _blendPivot = new THREE.Vector3(), _castOrg = new THREE.Vector3(), _sideOrg = new THREE.Vector3(), _losDir = new THREE.Vector3();
const _subjects = Array.from({ length: 7 }, () => new THREE.Vector3());
const _ZV = Object.freeze({ x: 0, y: 0, z: 0 }), _ZV2 = Object.freeze({ x: 0, y: 0 });
const _xrSet = new Set();
const _projView = new THREE.Matrix4();
const _lens = LENS_GRID.map(() => new THREE.Vector3());
const _body = new THREE.Vector3(), _tgtPt = new THREE.Vector3(), _q = new THREE.Vector3();
const _cOrg = new THREE.Vector3(), _cDir = new THREE.Vector3(), _cRight = new THREE.Vector3();

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
    this._fader = new OccluderFader({ minOpacity: CAMERA.treeFadeOpacity });
    this._marker = new LockMarker();
    this._flick = new FlickDetector(LOCK.flickPx, LOCK.flickTime);
    this._stick = new StickFlick(0.7, 0.35);
    this._gamePose = new CamPose();
    this._outPose = new CamPose();
    this._holdPose = new CamPose();
    this._blendFrom = new CamPose();
    this._blend = { active: false, t: 0, dur: 0, ease: easeInOutSine, pivot: null, sim: false };
    this._dist = { from: CAMERA.dist, to: CAMERA.dist, t: CAMERA.ease };
    this._snap = true;
    this._recenter = false;
    this._losT = 0;
    this._chargeW = 0;
    this._fovPunchT = 0;
    this._goldenT = 0;
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
    /** zoom multiplier (wheel / pinch / R3; starts at settings.camZoom) and its smoothed value */
    this.zoomMul = 1; this._zoomS = 1; this._zoomSeeded = false;
    /** §2.3 camera lock (Y): unlocked = edge pan + leash; the pan offset and the peek offset (focus − her) */
    this.camLocked = true;
    this._pan = new THREE.Vector3(); this._peek = new THREE.Vector3();
    this._lead = { x: 0, z: 0 }; this._leadT = { x: 0, z: 0 };
    /** combat / boss extra distance (m) eased out fast, back in slowly after `holdIn` */
    this._extraS = 0; this._extraHold = 0;
    this._groundY = 0;
    /** the ground point under the mouse (cached once per rendered frame) */
    this.cursorGround = new THREE.Vector3(); this.cursorValid = false;
    /** the hover pick (§5.5: at most once per rendered frame) */
    this.hover = { kind: 'ground', actor: null, id: null, interact: null, point: new THREE.Vector3(), px: 0 };
    /** iso weight (1 = gameplay iso, 0 = preset / meme / cutscene): drives the focus-fog mode and the frame offset */
    this._isoW = this.isIso ? 1 : 0;
    this._viewOff = null;
    this._near = -1; this._far = -1;
    /** the engaged set (alerted hostiles within combat.radius + the selection) of the last frame */
    this.engaged = [];
    this._engPts = [];
    this._punchT = -1; this._holyT = -1; this._dodgeT = 0;
    this._xrayT = 0; this._xrayOn = false; this._xrayCheckT = 0; this._xrayEnemies = new Set();
    /** last iso framing numbers (cam.iso()) */
    this.isoInfo = { yaw: ISO.yaw, pitch: 0.9, dist: ISO.dist, fov: ISO.fov, catPx: 0, portrait: false, phone: false, frameOffset: ISO.frameOffset };
    this._fr0 = {}; this._fr1 = {};
    this._yawT = 1; this._yawFrom = ISO.yaw; this._yawTo = ISO.yaw; this._yawDur = 1;
    this._isoD = NaN; this._isoP = NaN;
    this._frustum = new THREE.Frustum(); this._frustumOk = false;
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
      bus.on(E.BOSS_START, () => this._setBoss(true)),
      bus.on(E.BOSS_DEFEATED, () => this._setBoss(false)),
      bus.on(E.ARENA_CLEAR, () => { if (!this.ctx.enemies?.boss?.alive) this._setBoss(false); }),
      bus.on(E.PLAYER_HOLY, () => { this._fovPunchT = 0.15; }),
      // Golden Hour activation punch-in, unless the player already framed it with a preset shot (§7.5 HERO_LOW)
      bus.on(E.PLAYER_GOLDEN, (p) => { if (p?.on && GAMEPLAY.has(this.modeName)) this._goldenT = PLAYER.golden.activate; }),
      bus.on(E.BOSS_DIZZY, (p) => { if (p?.dizzy && !this._dizzyShaken) { this._dizzyShaken = true; this.shake(JUICE.dizzy.shake); } else if (!p?.dizzy) this._dizzyShaken = false; }),
      // safety handback when a scene ends with the camera still held (story normally calls mode('follow') itself).
      // Deferred to the next frame so a chained scene (CS-09 → CS-10, `end.cam: false`) keeps its shot instead.
      bus.on(E.CUTSCENE_END, (p) => { if (this.modeName === 'preset' || this.modeName === 'cutscene') this._handback = p?.skipped ? 0 : this.isIso ? ISO.cut.handback : CAMERA.ease; }),
      bus.on(E.CUTSCENE_START, () => { this._handback = -1; }),
      bus.on(E.GAME_MODE, (p) => { if (p?.mode === 'cutscene' || p?.mode === 'dialog') this.unlock(); }),
      bus.on(E.HIT, (p) => { if (p && p.target === this.ctx.player) this._noteAttacker(p.attacker); }),
      bus.on(E.PLAYER_DAMAGED, (p) => { this._noteAttacker(p?.source); if (!this.camLocked) this._recentrePan = true; }),
      // §2.4 punches (real time): parry −0.6 m, Holy +3° FOV, Purrfect Dodge −0.4 m through its slow motion
      bus.on(E.PLAYER_PARRY, () => { this._punchT = 0; }),
      bus.on(E.PLAYER_HOLY, () => { this._holyT = 0; }),
      bus.on(E.PLAYER_PERFECT_DODGE, (p) => { if (!p?.graze) this._dodgeT = PLAYER.dodge.perfectDur; }),
      bus.on(E.ENEMY_ALERTED, (p) => { if (!this.camLocked && p?.enemy?.pos && this.ctx.player && p.enemy.pos.distanceTo(this.ctx.player.pos) < 8) this._recentrePan = true; }),
    );
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
          const blend = opts.blend === false ? 0 : typeof opts.blend === 'number' ? opts.blend : def;
          if (prev === 'meme') { this._meme.exit(); this.ctx.bus.emit(E.MEME_CAM, { on: false }); }
          else { this._cut.stop(); if (opts.keepYaw !== true) this._behind(); }
          this._snap = true;
          this._markPlayerPos();            // a cutscene may have moved her: that is not a teleport (keep the blend)
          this._startBlend(blend, opts.ease, this._playerPivot(_blendPivot), false);
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
        this.unlock();
        this._cut.stop();
        this.presetState = null;
        this._meme.enter(p, opts.yawOffset ?? this.memeYawOffset(p));
        this.modeName = 'meme';
        this._startBlend(typeof opts.blend === 'number' ? opts.blend : PLAYER.memeCam.blendIn, opts.ease ?? 'inOutSine', this._playerPivot(_blendPivot), false);
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
        this._holdPose.copy(this._outPose);
        this._blend.active = false;
        this.presetState = null;
        this.modeName = 'cutscene';
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
    if (s.mode === 'blend' && s.dur > 0) {
      _blendPivot.copy(this._cut.subject); _blendPivot.y += 0.8;
      this._startBlend(s.dur, s.ease, _blendPivot, true);
    } else this._blend.active = false;
    return promise;
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
   * Rotation (rad) of the MEME_LOOP framing around `actor` that gives the lens a clear view of her face: the first
   * of MEME_YAWS whose line from her eyes to the camera (a 0.12 m sphere: the near plane) hits no terrain,
   * architecture or static prop. 0 when every candidate is blocked or there is no physics.
   * @param {any} actor
   */
  memeYawOffset(actor) {
    const ph = this.ctx.physics;
    if (!actor || !ph?.raycast) return 0;
    const P = PRESETS.MEME_LOOP, o = actor.object3d?.position ?? actor.pos, f = actor.facing ?? 0;
    const sphere = typeof ph.sphereCast === 'function';
    _org.set(o.x, o.y + MEME_EYE_Y, o.z);
    for (const off of MEME_YAWS) {
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

  /** Zoom multiplier (0.70–1.40, × settings.camZoom). Returns the clamped value. Emits E.CAM_ZOOM. */
  zoom(mul) {
    const z = clamp(+mul || 1, ISO.zoom[0], ISO.zoom[1]);
    if (z !== this.zoomMul) { this.zoomMul = z; this.ctx.bus?.emit?.(E.CAM_ZOOM, { dist: this.isoInfo.dist, mul: z }); }
    return z;
  }

  /** §2.2 zone hint: `{ yaw?, pitch?, dist? }` blended over `blend` s (yaw only today; pitch / dist follow the rig). */
  setHint(h, blend = ISO.hint.blend) {
    if (!h) return;
    if (Number.isFinite(h.yaw)) { this._yawFrom = this.isoYaw; this._yawTo = h.yaw; this._yawT = blend > 0 ? 0 : 1; this._yawDur = Math.max(1e-3, blend); }
  }

  /** CSS px → walkable ground point (Picker.screenToGround). */
  screenToGround(x, y, out = new THREE.Vector3()) { return screenToGround(this.ctx, x, y, out); }
  /** World point → CSS px { x, y, z, on }. */
  worldToScreen(p, out) { return w2s(this.ctx, p, out); }
  /** Is world point `p` on screen, with the frustum shrunk by `margin` m? (§8.5 no off-screen snipes) */
  onScreen(p, margin = 0) {
    const cam = this.ctx.camera;
    if (!cam || !p) return true;
    if (!this._frustumOk) return true;
    const pl = this._frustum.planes;
    for (let i = 0; i < 6; i++) if (pl[i].distanceToPoint(p) < margin) return false;
    return true;
  }
  /** §7.6 pick at CSS px: { kind, actor, id, interact, point }. `opts.touch` widens the tolerance. */
  pick(x, y, opts = {}) { return pickAt(this.ctx, x, y, opts, { kind: 'ground', actor: null, id: null, interact: null, point: new THREE.Vector3(), px: 0 }); }
  /** Debug / smoke: the live iso framing { yaw, pitch, dist, fov, focus: [x, y, z], catPx, portrait, phone, locked }. */
  iso() {
    const i = this.isoInfo;
    return { yaw: i.yaw, pitch: i.pitch, dist: i.dist, fov: i.fov, focus: this.focus.toArray(), catPx: i.catPx, portrait: i.portrait, phone: i.phone, locked: this.camLocked, zoom: this.zoomMul };
  }
  /** §2.3 camera lock (Y): locked = always centred on her; unlocked = edge pan within the leash. Toasts the change. */
  setCamLock(on, toast = true) {
    this.camLocked = !!on;
    if (this.camLocked) this._pan.set(0, 0, 0);
    if (toast) this.ctx.bus?.emit?.(E.TOAST, { text: this.ctx.strings?.t?.(this.camLocked ? 'toast.cam.locked' : 'toast.cam.unlocked') ?? '' });
    return this.camLocked;
  }

  /** Fixed step (play): zoom, camera lock, centre, peek bookkeeping and selection input. */
  _isoInput(dt) {
    const input = this.ctx.input, I = ISO;
    // zoom (wheel ticks / pinch via input.addZoom; pad R3 cycles)
    const z = input.consumeZoom?.() ?? 0;
    if (z) this.zoom(this.zoomMul * Math.pow(1 - I.zoomStep, z));
    if (input.pressed('zoomCycle')) {
      const steps = I.padZoom, cur = this.zoomMul;
      let i = steps.findIndex((s) => s > cur + 1e-3);
      this.zoom(steps[i < 0 ? 0 : i]);
    }
    if (input.pressed('camLock') && input.device !== 'touch') this.setCamLock(!this.camLocked);
    if (input.pressed('centre')) { this._pan.set(0, 0, 0); this._centreT = 0.25; }
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
    this._pan.set(0, 0, 0); this._peek.set(0, 0, 0);
  }

  /** The engaged set (§2.4): alerted / engaged hostiles within combat.radius of her, plus the selection. */
  _engagedSet(ppos) {
    const out = this.engaged;
    out.length = 0;
    const list = this.ctx.actors?.queryRadius?.(ppos, ISO.combat.radius, hostileTo('player'));
    if (list) for (const a of list) {
      if (!a || a === this.ctx.player || a.alive === false || a.dead || a.hidden || (a.hp !== undefined && a.hp <= 0)) continue;
      if (a.alerted || ENGAGED.has(a.stateName)) out.push(a);
    }
    const t = this.lockTarget;
    if (t && !out.includes(t) && lockable(t)) out.push(t);
    return out;
  }

  /** Iso gameplay framing (follow / lock / boss) → this._gamePose. CONTROLS_SPEC §2.1, §2.3, §2.4. */
  _isoGameplay(dt) {
    const ctx = this.ctx, p = ctx.player, out = this._gamePose, I = ISO, input = ctx.input;
    if (!p) return out.copy(this._outPose);
    const ppos = p.object3d?.position ?? p.pos;
    if (!this._hadPlayer) this._snap = true;
    else if (ppos.distanceToSquared(this._lastPlayerPos) > TELEPORT_SQ) { this._snap = true; this._blend.active = false; }
    this._hadPlayer = true;
    this._lastPlayerPos.copy(ppos);
    const snap = this._snap, st = ctx.state?.settings ?? {};
    const calm = !!st.reduceCameraMotion;
    if (!this._zoomSeeded) { this._zoomSeeded = true; this.zoomMul = clamp(st.camZoom ?? 1, I.zoom[0], I.zoom[1]); this._zoomS = this.zoomMul; }
    // yaw (zone hints blend; the level yaw otherwise)
    if (this._yawT < 1) {
      this._yawT = Math.min(1, this._yawT + dt / this._yawDur);
      this.isoYaw = this._yawFrom + wrapAngle(this._yawTo - this._yawFrom) * easeInOutSine(this._yawT);
    }
    const yaw = this.isoYaw;
    this.yaw = yaw;

    // ---- the vertical follow: during a jump the focus takes 30 % of her rise (50 % off a mushroom bounce)
    if (p.onGround || snap) { this._groundY = ppos.y; this._bounceRise = false; }
    if (p.bounced > 0) this._bounceRise = true;
    const rise = ppos.y - this._groundY;
    const fy = rise > 0 ? this._groundY + rise * (this._bounceRise ? I.bounceFollow : I.jumpFollow) : ppos.y;

    // ---- framing targets
    const W = this._viewW(), H = this._viewH();
    const boss = this.bossActive ? this._liveBoss() : null;
    const eng = this._engagedSet(ppos);
    const combat = eng.length > 0;
    const still = p.stateName === 'guard' || p.stateName === 'charge' || (p.charge ?? 0) > 0;
    const portrait = H > W * 1.05;
    // lead (explore only): velocity + the KBM cursor; damped λ4; off with Reduce camera motion
    let cursorRel = null;
    if (input?.device === 'kbm' && this.cursorValid && (input.pointerIdle?.() ?? 99) < AIM.cursorIdle) {
      _q.set(this.cursorGround.x - ppos.x, 0, this.cursorGround.z - ppos.z); cursorRel = _q;
    }
    if (calm || combat || boss) { this._leadT.x = 0; this._leadT.z = 0; }
    else isoLead(p.vel ?? _ZV, cursorRel, yaw, { portrait, still }, this._leadT);
    if (snap) { this._lead.x = this._leadT.x; this._lead.z = this._leadT.z; }
    else { this._lead.x = damp(this._lead.x, this._leadT.x, I.lead.damp, dt); this._lead.z = damp(this._lead.z, this._leadT.z, I.lead.damp, dt); }
    _piv.set(ppos.x + this._lead.x, fy + I.focusY, ppos.z + this._lead.z);
    // combat bias: 0.3 × (centroid of the engaged set − her), ≤ 2.5 m (the selection weighs 1.5)
    if (combat && !boss) {
      let cx = 0, cz = 0, w = 0;
      for (const a of eng) { const k = a === this.lockTarget ? I.combat.selWeight : 1; cx += a.pos.x * k; cz += a.pos.z * k; w += k; }
      _tgt.set((cx / w - ppos.x) * I.combat.bias, 0, (cz / w - ppos.z) * I.combat.bias);
      capXZ(_tgt, I.combat.biasMax);
      _piv.x += _tgt.x; _piv.z += _tgt.z;
    }
    // boss: focus = lerp(her, boss, 0.35), ≤ 5 m from her; a tall boss lifts the focus
    if (boss) {
      const bp = boss.object3d?.position ?? boss.pos;
      _tgt.set((bp.x - ppos.x) * I.boss.weight, 0, (bp.z - ppos.z) * I.boss.weight);
      capXZ(_tgt, I.boss.maxOff);
      _piv.x = ppos.x + _tgt.x; _piv.z = ppos.z + _tgt.z;
      _piv.y += Math.max(0, ((boss.height ?? 1.6) - I.boss.liftAbove)) * I.boss.lift;
    }
    // §2.3 unlocked camera: edge pan (KBM), leash 25 m; peek (Alt / MMB / pad D-pad ↓ + RS)
    this._panStep(dt, ppos, W, H, yaw);
    _piv.add(this._pan);
    const peeking = input?.down?.('peek') && !combat;
    if (peeking) {
      if (input.device === 'pad') {
        const a = input.aimStick ?? _ZV2;
        screenToWorldDir(a.x, a.y, yaw, _tmp); _tmp.y = 0; _tmp.multiplyScalar(I.peek.max);
      } else if (this.cursorValid) _tmp.set(this.cursorGround.x - ppos.x, 0, this.cursorGround.z - ppos.z);
      else _tmp.set(0, 0, 0);
      capXZ(_tmp, I.peek.max);
      this._peek.x = damp(this._peek.x, _tmp.x, I.peek.damp, dt); this._peek.z = damp(this._peek.z, _tmp.z, I.peek.damp, dt);
    } else {
      const k = Math.min(1, dt / Math.max(1e-3, I.peek.back) * 4);
      this._peek.x += (0 - this._peek.x) * k; this._peek.z += (0 - this._peek.z) * k;
    }
    _piv.add(this._peek);
    if (snap) this.focus.copy(_piv);
    else {
      this.focus.x = damp(this.focus.x, _piv.x, I.followDamp, dt);
      this.focus.z = damp(this.focus.z, _piv.z, I.followDamp, dt);
      this.focus.y = damp(this.focus.y, _piv.y, I.followDampY, dt);
    }

    // ---- distance: zoom × base, combat zoom-out / boss fit (extra), punches; the cat-size clamp last (isoFrame)
    this._zoomS = snap ? this.zoomMul : damp(this._zoomS, this.zoomMul, I.zoomDamp, dt);
    const dev = input?.device ?? 'kbm';
    const base = isoFrame({ w: W, h: H, device: dev, zoom: this._zoomS }, this._fr0);
    let extraWant = 0;
    if (!calm && (combat || boss)) {
      const pts = this._engPts; let n = 0;
      pts[n++] = ppos;
      if (boss) pts[n++] = boss.object3d?.position ?? boss.pos;
      for (const a of eng) { if (n >= 12) break; pts[n++] = a.pos; }
      const marginB = boss ? (boss.radius ?? 1) + 1.5 : I.combat.margin;
      const need = fitDist(pts, n, this.focus, yaw, boss ? I.pitchBoss : base.pitch, base.fov, base.aspect, boss ? 0.7 : I.combat.inner, marginB);
      extraWant = Math.max(0, need - base.dist);
      if (!boss) extraWant = Math.min(extraWant, I.combat.zoomOut);
    }
    if (extraWant >= this._extraS) { this._extraS = snap ? extraWant : damp(this._extraS, extraWant, I.combat.outDamp, dt); this._extraHold = I.combat.holdIn; }
    else if ((this._extraHold -= dt) <= 0) this._extraS = damp(this._extraS, extraWant, I.combat.outDamp * 0.5, dt);
    const fr = isoFrame({ w: W, h: H, device: dev, zoom: this._zoomS, boss: !!boss, extra: this._extraS }, this._fr1);
    // charge push-in, parry punch, Holy, Purrfect Dodge, Golden Hour dolly (real time; none with Reduce camera motion)
    const charging = p.stateName === 'charge' || (p.charge ?? 0) > 0;
    this._chargeW = damp(this._chargeW, charging && !calm ? 1 : 0, 5, dt);
    let dd = I.charge.dd * this._chargeW, dfov = I.charge.dfov * this._chargeW;
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
      if (this._dodgeT > 0) { this._dodgeT = Math.max(0, this._dodgeT - dt); dd += I.perfectDodge.dd; }
    }
    let d = Math.max(I.distMin * 0.7, fr.dist + dd), pitch = fr.pitch;
    const g = calm ? 0 : this._goldenEnvelope();
    if (g > 0) { d = lerp(d, Math.min(d, I.golden.dist), g); pitch = lerp(pitch, I.golden.pitch, g); }
    if (ctx.game?.mode === 'dialog') d *= I.dialog.mul;
    if (snap || !Number.isFinite(this._isoD)) this._isoD = d;
    else this._isoD = damp(this._isoD, d, d < this._isoD ? 10 : 6, dt);
    if (snap || !Number.isFinite(this._isoP)) this._isoP = pitch;
    else this._isoP = damp(this._isoP, pitch, 6, dt);

    isoPosition(this.focus, yaw, this._isoP, this._isoD, out.pos);
    out.look.copy(this.focus);
    out.roll = 0;
    out.fov = fr.fov + dfov;
    const info = this.isoInfo;
    info.yaw = yaw; info.pitch = this._isoP; info.dist = this._isoD; info.fov = out.fov; info.portrait = fr.portrait; info.phone = fr.phone;
    info.frameOffset = fr.frameOffset;
    info.catPx = pxAt(p.height ?? I.catH, this._isoD, out.fov, H);
    this.distance = this._isoD;
    this.pitch = this._isoP;
    this._snap = false;
    return out;
  }

  /** §2.3 unlocked camera: edge pan within the leash, the auto-recentre, the centre key. */
  _panStep(dt, ppos, W, H, yaw) {
    const input = this.ctx.input, U = ISO.unlock, pan = this._pan;
    if (this.camLocked || input?.device !== 'kbm' || this.ctx.game?.mode !== 'play') {
      if (pan.lengthSq() > 1e-6) { const k = Math.min(1, dt / U.recentre * 3); pan.multiplyScalar(1 - k); } else pan.set(0, 0, 0);
      return;
    }
    if (this._recentrePan || input.down?.('centre')) {
      const k = Math.min(1, dt / U.recentre * 3); pan.multiplyScalar(1 - k);
      if (pan.lengthSq() < 0.01) { pan.set(0, 0, 0); this._recentrePan = false; }
      return;
    }
    const P = input.pointer;
    if (!P?.inside) return;
    const r = canvasRect(this.ctx), ex = U.edgePx;
    let sx = 0, sy = 0;
    if (P.x - r.left <= ex) sx = -1; else if (r.left + r.width - P.x <= ex) sx = 1;
    if (P.y - r.top <= ex) sy = 1; else if (r.top + r.height - P.y <= ex) sy = -1;
    if (sx || sy) {
      const v = U.panSpeed * (this.ctx.state?.settings?.edgePanSpeed ?? 1) * dt;
      screenToWorldDir(sx, sy, yaw, _tmp);
      const l = Math.hypot(_tmp.x, _tmp.z) || 1;
      pan.x += (_tmp.x / l) * v; pan.z += (_tmp.z / l) * v;
    }
    // leash: soft over the last 3 m, hard at 25 m
    const L = Math.hypot(pan.x, pan.z);
    if (L > U.leash) { pan.x *= U.leash / L; pan.z *= U.leash / L; }
  }

  _viewW() { const el = this.ctx.renderer?.domElement; return el?.clientWidth || (typeof innerWidth !== 'undefined' ? innerWidth : 1280); }
  _viewH() { const el = this.ctx.renderer?.domElement; return el?.clientHeight || (typeof innerHeight !== 'undefined' ? innerHeight : 720); }

  /** Per rendered frame: the cursor ground point and the hover pick (§5.5: once per frame). */
  _isoCursor() {
    const input = this.ctx.input, P = input?.pointer;
    this.cursorValid = false;
    if (!P || input.device !== 'kbm' || !P.inside) return;
    const g = screenToGround(this.ctx, P.x, P.y, this.cursorGround);
    this.cursorValid = !!g && Number.isFinite(g.x);
    if (this.ctx.game?.mode === 'play') pickAt(this.ctx, P.x, P.y, { ground: false }, this.hover);
    else { this.hover.kind = 'ground'; this.hover.actor = null; this.hover.id = null; this.hover.interact = null; }
    this.hover.point.copy(this.cursorGround);
  }

  /**
   * Iso occlusion (§3): fade props between the lens and her chest / head, the engaged enemies within 8 m (≤ 4) and the
   * selection; her x-ray silhouette when the line to her chest is blocked for 0.1 s; enemies in a wind-up behind cover.
   */
  _isoOcclusion(dt, cam) {
    const p = this.ctx.player;
    if (!p) return;
    const O = ISO.occl, pos = p.object3d?.position ?? p.pos, h = p.height ?? 1;
    let n = 0;
    _subjects[n++].set(pos.x, pos.y + h * 0.5, pos.z);
    _subjects[n++].set(pos.x, pos.y + h * 1.05, pos.z);
    for (const e of this.engaged) {
      if (n >= _subjects.length) break;
      if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) > O.enemyRange) continue;
      _subjects[n++].set(e.pos.x, e.pos.y + (e.height ?? 1) * 0.6, e.pos.z);
    }
    this._fader.update(dt, cam.position, _subjects, n, null, 0, false);
    // x-ray: a ray from the lens to her chest (props + architecture) at 20 Hz
    if ((this._xrayCheckT -= dt) <= 0) {
      this._xrayCheckT = 0.05;
      const blocked = this._blocked(cam.position, _subjects[0]);
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
  }

  _clearXray() {
    if (this._xrayOn) { this._xrayOn = false; try { setXray(this.ctx.player, false); } catch { /* */ } }
    for (const e of this._xrayEnemies) { try { setXray(e, false); } catch { /* */ } }
    this._xrayEnemies.clear();
    this._xrayT = 0;
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

  _startBlend(dur, ease, pivot, sim) {
    const b = this._blend;
    if (!(dur > 0)) { b.active = false; return; }
    this._blendFrom.copy(this._outPose);
    b.active = true; b.t = 0; b.dur = dur; b.ease = resolveEase(ease); b.sim = !!sim;
    b.pivot = pivot ? (b._pv ?? (b._pv = new THREE.Vector3())).copy(pivot) : null;
  }

  _onLevelUnload() {
    this._clearXray?.();
    this._attacker = null; this._attackerT = 0;
    this.unlock();
    this._bossForced = false;
    this._setBoss(false);
    this._fader.clear();
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

  /** Gameplay framing (follow / lock / boss) → this._gamePose. */
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

  /** Golden Hour activation punch-in (0 → 1 → 0 over PLAYER.golden.activate). */
  _goldenEnvelope() {
    const T = PLAYER.golden.activate, t = this._goldenT;
    if (t <= 0) return 0;
    const u = 1 - t / T;                                   // 0 → 1 over the activation
    return u < 0.2 ? easeInOutSine(u / 0.2) : u > 0.65 ? easeInOutSine((1 - u) / 0.35) : 1;
  }

  /** Lock switching from mouse flicks / right-stick flicks (render time, raw look deltas). */
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
    const ctx = this.ctx, cam = ctx.camera, game = ctx.game;
    const dt = Math.min(Math.max(frameDt || 0, 0), 0.1);
    const paused = game?.mode === 'menu';
    const sdt = paused ? 0 : dt * (game?.loop?.timeScale ?? 1);         // sim-time for cutscene timelines
    const look = ctx.input?.consumeLook?.() ?? ZERO_LOOK;
    if (this._handback >= 0) {
      const b = this._handback;
      this._handback = -1;
      if (this.modeName === 'preset' || this.modeName === 'cutscene') this.mode('follow', { blend: b > 0 ? b : false });
    }
    if (this.isIso) this._isoCursor();
    let pose;
    switch (this.modeName) {
      case 'meme': pose = this._meme.update(dt); break;
      case 'preset': pose = this._cut.update(sdt); if (this._cut.landed && !this._landShaken) { this._landShaken = true; this.shake(0.2); } break;
      case 'cutscene': pose = this._holdPose; break;
      default:
        if (this.isIso) pose = this._isoGameplay(paused ? 0 : dt);
        else { pose = this._gameplay(dt, paused ? ZERO_LOOK : look); this._flicks(dt, look); }
    }
    // iso weight: 1 in the gameplay rig, 0 in presets / cutscenes / Meme Cam (eased with the blends)
    const isoGoal = this.isIso && GAMEPLAY.has(this.modeName) ? 1 : 0;
    const bw = this._blend.active ? Math.max(0.3, this._blend.dur) : 0.25;
    this._isoW = this._snapIso ? isoGoal : clamp(this._isoW + Math.sign(isoGoal - this._isoW) * dt / bw, 0, 1);
    if (Math.abs(isoGoal - this._isoW) < 1e-3) this._isoW = isoGoal;
    if (this.modeName !== 'preset') this._landShaken = false;
    if (this._goldenT > 0) this._goldenT = Math.max(0, this._goldenT - dt);       // real time, in every mode

    const b = this._blend, out = this._outPose;
    if (b.active) {
      b.t += b.sim ? sdt : dt;
      const k = b.ease(clamp(b.t / b.dur, 0, 1));
      if (b.pivot && GAMEPLAY.has(this.modeName)) this._playerPivot(b.pivot);
      blendPose(this._blendFrom, pose, k, b.pivot, out);
      if (b.t >= b.dur) b.active = false;
    } else out.copy(pose);

    applyPose(cam, out);

    // FOV: pose FOV + the Holy punch; widened on narrow (portrait) screens (classic / presets; the iso rig has its own)
    if (this._fovPunchT > 0) this._fovPunchT = Math.max(0, this._fovPunchT - dt);
    const punch = this._fovPunchT > 0 && this._isoW < 1 ? JUICE.holy.fovPunch * Math.sin(Math.PI * (1 - this._fovPunchT / 0.15)) : 0;
    this.fov = out.fov + punch;
    const fov = lerp(aspectFov(this.fov, cam.aspect), this.fov, this._isoW);
    let proj = false;
    if (Math.abs(fov - this._appliedFov) > 1e-3) { cam.fov = fov; this._appliedFov = fov; proj = true; }
    // §2.1 near / far 0.3 / 90 in the iso rig (RENDER near / far for presets, Meme Cam and classic)
    const near = this._isoW > 0.5 ? ISO.near : RENDER.near, far = this._isoW > 0.5 ? ISO.far : RENDER.far;
    if (near !== this._near || far !== this._far) { cam.near = near; cam.far = far; this._near = near; this._far = far; proj = true; }
    // §2.1 framing: setViewOffset places her 4 % below centre (portrait: 40 % from the top)
    const offK = this._isoW * (this.isoInfo.frameOffset ?? ISO.frameOffset);
    const vw = this._viewW(), vh = this._viewH();
    const offKey = Math.abs(offK) < 1e-4 ? 0 : Math.round(offK * vh * 4) / 4;
    if (offKey !== this._viewOff || (offKey && (cam.view?.fullWidth !== vw || cam.view?.fullHeight !== vh))) {
      this._viewOff = offKey;
      if (offKey) cam.setViewOffset(vw, vh, 0, -offKey, vw, vh); else cam.clearViewOffset();
      proj = false;                                              // set/clearViewOffset update the projection
    }
    if (proj) cam.updateProjectionMatrix();

    this.shaker.apply(cam, dt, (ctx.state?.settings?.shake ?? 1) * (this._isoW > 0.5 ? ISO.shake.scale : 1));    // camera-space rotations after lookAt
    cam.updateMatrixWorld();
    _projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(_projView);
    this._frustumOk = true;
    // §4.1 focus fog: Env owns the uniforms; mode follows the iso weight, the clear radius widens in combat
    if (this.isIso) {
      const p = ctx.player;
      if (this._isoW <= 0 && p) this.focus.copy(p.object3d?.position ?? p.pos);
      ctx.env?.setFocusFog?.({ focus: this.focus, mode: this._isoW, combat: this.engaged.length > 0 || this.bossActive, boss: this.bossActive });
    }
    if (this.isIso && GAMEPLAY.has(this.modeName)) {
      this._isoOcclusion(dt, cam);
      this._marker.update(null, cam, dt, false);
      return;
    }
    if (this.isIso) this._clearXray();

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
}

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
