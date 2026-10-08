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
//   addFadeable(obj) / removeFadeable(obj)   tree fade registration (or tag userData.camFade = true)
//   snapBehind(), recenter(), modeName, distance, showLockMarker
// Emits E.MEME_CAM { on } entering / leaving 'meme'. Listens: E.SHAKE, E.CAM_MODE, E.BOSS_START / BOSS_DEFEATED,
// E.ARENA_CLEAR, E.LEVEL_LOADING / LEVEL_LOADED / LEVEL_UNLOAD, E.PLAYER_SPAWNED, E.PLAYER_HOLY, E.PLAYER_GOLDEN,
// E.PLAYER_PARRY, E.HIT (blocked), E.PLAYER_GRIT (broken), E.BOSS_DIZZY, E.CUTSCENE_END, E.GAME_MODE.
//
// Follow camera (tech.md §8): orbit around a pivot at the player's head (CAMERA.pivotY) with a spring arm
// (physics.raycast; pulls in fast, eases out slowly), never below the terrain; auto-follow after 1.5 s without
// look input; lock-on frames the midpoint over her right shoulder at 4.5 m; boss arenas ease to 6.0 m over 0.6 s.
// Everything runs in render() with the interpolated player position (no 120 Hz jitter); input edges in update().
import * as THREE from 'three';
import { E } from '../core/events.js';
import { CAMERA, PLAYER, JUICE } from '../core/config.js';
import { damp, dampAngle, clamp, lerp, wrapAngle, easeInOutSine } from '../core/math.js';
import { hostileTo } from '../core/ActorRegistry.js';
import { CameraShake } from './CameraShake.js';
import { CamPose, blendPose, applyPose, resolveEase } from './pose.js';
import { CutsceneCamera, SHOT_MODES } from './CutsceneCamera.js';
import { MemeCam } from './MemeCam.js';
import { pickLockTarget, nearestLockTarget, switchLockTarget, lockable, FlickDetector, StickFlick, LockMarker } from './LockOn.js';
import { OccluderFader } from './Occluders.js';
import { PRESETS } from './presets.js';

const LOCK = PLAYER.lockOn;
/** default orbit pitch (rad): slightly above her, looking a touch down the path ahead */
export const DEFAULT_PITCH = 0.2;
/** lateral offset over her right shoulder while locked (m, at lockDist) */
export const SHOULDER = 0.55;
/** min/max spring-arm length (m) */
const ARM_MIN = 0.8, ARM_MARGIN = 0.3, ARM_RADIUS = 0.2;
/** what blocks the spring arm and the lock-on line of sight: terrain + architecture, not props (trees fade) */
const ARM_OPTS = Object.freeze({ terrain: true, mesh: true, statics: false });

const GAMEPLAY = new Set(['follow', 'lock', 'boss']);
const ZERO_LOOK = Object.freeze({ x: 0, y: 0, px: 0, py: 0 });

const _dir = new THREE.Vector3(), _piv = new THREE.Vector3(), _right = new THREE.Vector3(), _tmp = new THREE.Vector3();
const _org = new THREE.Vector3(), _lookPt = new THREE.Vector3(), _tgt = new THREE.Vector3(), _ray = new THREE.Ray();
const _blendPivot = new THREE.Vector3();
const _subjects = [new THREE.Vector3(), new THREE.Vector3()];

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
    this._offs = [];
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
      bus.on(E.PLAYER_GOLDEN, (p) => { if (p?.on) this._goldenT = PLAYER.golden.activate; }),
      bus.on(E.PLAYER_PARRY, () => this.shake(JUICE.parry.shake)),
      bus.on(E.HIT, (h) => { if (h?.blocked && h.target === this.ctx.player) this.shake(JUICE.block.shake); }),
      bus.on(E.PLAYER_GRIT, (p) => { if (p?.broken) this.shake(JUICE.guardBreak.shake); }),
      bus.on(E.BOSS_DIZZY, (p) => { if (p?.dizzy && !this._dizzyShaken) { this._dizzyShaken = true; this.shake(JUICE.dizzy.shake); } else if (!p?.dizzy) this._dizzyShaken = false; }),
      bus.on(E.CUTSCENE_END, () => { if (this.modeName === 'preset' || this.modeName === 'cutscene') this.mode('follow', { blend: CAMERA.ease }); }),
      bus.on(E.GAME_MODE, (p) => { if (p?.mode === 'cutscene' || p?.mode === 'dialog') this.unlock(); }),
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
    if (gm === 'play' && GAMEPLAY.has(this.modeName)) {
      if (input.pressed('recenter')) this.recenter();
      if (input.pressed('lockon')) { if (this.lockTarget) this.unlock(); else if (!this.lock()) this.recenter(); }
      if (input.pressed('lockNext')) this.switchLock(1, true);
      if (input.pressed('lockPrev')) this.switchLock(-1, true);
    }
    this._validateLock(dt);
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
    switch (name) {
      case 'follow':
      case 'lock':
      case 'boss': {
        if (name === 'boss') { this._bossForced = !this.ctx.enemies?.boss?.alive; this._setBoss(true); }   // with a live boss it ends with the boss
        if (name === 'follow') { this._bossForced = false; if (!this.ctx.enemies?.boss?.alive) this._setBoss(false); }
        if (!GAMEPLAY.has(prev)) {
          const def = prev === 'meme' ? PLAYER.memeCam.blendOut : CAMERA.ease;
          const blend = opts.blend === false ? 0 : typeof opts.blend === 'number' ? opts.blend : def;
          if (prev === 'meme') { this._meme.exit(); this.ctx.bus.emit(E.MEME_CAM, { on: false }); }
          else { this._cut.stop(); if (opts.keepYaw !== true) this._behind(); }
          this._snap = true;
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
        this._meme.enter(p);
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
    const t = target && lockable(target) ? target : pickLockTarget(this._candidates(), p.pos, this.yaw, LOCK);
    if (!t) return null;
    this.lockTarget = t;
    this._losT = 0;
    this._flick.reset();
    this._syncGameplayMode();
    return t;
  }

  unlock() {
    if (!this.lockTarget) return;
    this.lockTarget = null;
    this._syncGameplayMode();
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
  addFadeable(obj) { return this._fader.add(obj, this.ctx.scene); }
  removeFadeable(obj) { this._fader.remove(obj); }

  get memeT() { return this._meme.active ? this._meme.t : 0; }
  get memePhase() { return this._meme.active ? this._meme.phase : 0; }
  get memePeriod() { return this._meme.period; }
  /** true while a cutscene shot is running or held */
  get inShot() { return this.modeName === 'preset'; }
  /** the running shot's normalized step (read-only) or null */
  get currentShot() { return this._cut.shot; }

  // ------------------------------------------------------------------ internals
  _candidates() {
    return this.ctx.actors?.queryRadius?.(this.ctx.player.pos, Math.max(LOCK.range, LOCK.breakRange), hostileTo('player')) ?? [];
  }

  _syncGameplayMode() {
    if (!GAMEPLAY.has(this.modeName)) return;
    this.modeName = this.lockTarget ? 'lock' : this.bossActive ? 'boss' : 'follow';
  }

  _setBoss(on) {
    this.bossActive = !!on;
    this._syncGameplayMode();
  }

  _behind() {
    const p = this.ctx.player;
    if (p) this.yaw = (p.facing ?? 0) + Math.PI;
    this.pitch = DEFAULT_PITCH;
    this._recenter = false;
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
    this.unlock();
    this._bossForced = false;
    this._setBoss(false);
    this._fader.clear();
  }

  _onLevelLoaded(p) {
    const level = p?.level ?? this.ctx.levels?.current;
    this._fader.clear();
    if (level?.root) this._fader.scan(level.root, this.ctx.scene);
    if (GAMEPLAY.has(this.modeName)) this.snapBehind();
  }

  _validateLock(dt) {
    const t = this.lockTarget, p = this.ctx.player;
    if (!t) return;
    if (!p || !GAMEPLAY.has(this.modeName)) { this.unlock(); return; }
    const reg = this.ctx.actors?.has ? this.ctx.actors.has(t) : true;
    if (!reg || !lockable(t)) {
      const next = nearestLockTarget(this._candidates(), p.pos, LOCK.range, t);
      if (next) { this.lockTarget = next; this._losT = 0; } else this.unlock();
      return;
    }
    const d = Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
    if (d > LOCK.breakRange) { this.unlock(); return; }
    // line of sight: pivot → target chest (terrain + architecture; a thin trunk doesn't break the lock)
    const ph = this.ctx.physics;
    if (ph?.lineOfSight || ph?.raycast) {
      _org.copy(p.pos); _org.y += CAMERA.pivotY;
      _tgt.copy(t.pos); _tgt.y += (t.height ?? 1) * 0.6;
      let blocked = false;
      if (typeof ph.lineOfSight === 'function') blocked = !ph.lineOfSight(_org, _tgt, ARM_OPTS);
      else {
        _dir.subVectors(_tgt, _org);
        const len = _dir.length();
        if (len > 0.5) {
          _ray.set(_org, _dir.multiplyScalar(1 / len));
          const hit = ph.raycast(_ray, len);
          blocked = !!hit && hit.distance < len - 0.3;
        }
      }
      this._losT = blocked ? this._losT + dt : 0;
      if (this._losT > LOCK.losTimeout) this.unlock();
    }
  }

  /**
   * Spring-arm length along `dir` from `origin`: physics.sphereCast (r 0.2) against terrain + architecture
   * (props / trees don't pull the camera in; they fade). Fallback: 3 rays (centre + both sides).
   */
  _armLength(origin, dir, want, right) {
    const ph = this.ctx.physics;
    if (!ph?.raycast) return want;
    _ray.set(origin, dir);
    if (typeof ph.sphereCast === 'function') {
      const hit = ph.sphereCast(_ray, ARM_RADIUS, want + ARM_RADIUS, ARM_OPTS);
      return hit ? clamp(hit.distance - 0.05, ARM_MIN, want) : want;
    }
    let allowed = want;
    for (let i = 0; i < 3; i++) {
      const side = i === 0 ? 0 : i === 1 ? ARM_RADIUS : -ARM_RADIUS;
      _org.copy(origin).addScaledVector(right, side);
      _ray.set(_org, dir);
      const hit = ph.raycast(_ray, want + ARM_MARGIN);
      if (hit) allowed = Math.min(allowed, Math.max(ARM_MIN, hit.distance - ARM_MARGIN));
    }
    return allowed;
  }

  /** Gameplay framing (follow / lock / boss) → this._gamePose. */
  _gameplay(dt, look) {
    const ctx = this.ctx, p = ctx.player, out = this._gamePose, gm = ctx.game?.mode;
    if (!p) return out.copy(this._outPose);
    const ppos = p.object3d?.position ?? p.pos;
    if (!this._hadPlayer || ppos.distanceToSquared(this._lastPlayerPos) > 36) this._snap = true;      // teleport
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
    if (t) {
      const want = Math.atan2(t.pos.x - p.pos.x, t.pos.z - p.pos.z) + Math.PI;
      this.yaw = this._snap ? want : dampAngle(this.yaw, want, 8, dt);
      this._recenter = false;
    } else if (this._recenter) {
      const want = (p.facing ?? 0) + Math.PI;
      this.yaw = dampAngle(this.yaw, want, 10, dt);
      this.pitch = damp(this.pitch, DEFAULT_PITCH, 8, dt);
      if (Math.abs(wrapAngle(this.yaw - want)) < 0.02) this._recenter = false;
    } else if (lookOk && sp > 0.5 && lookIdle > CAMERA.autoFollowAfter) {
      const want = (p.facing ?? 0) + Math.PI;
      const off = Math.abs(wrapAngle(want - this.yaw));               // 0 = camera already behind her
      if (off < 2.3) this.yaw = dampAngle(this.yaw, want, 1.5 * Math.min(1, sp / 4), dt);   // not when running at the camera
      this.pitch = damp(this.pitch, DEFAULT_PITCH, 0.8, dt);
    }

    // ---- arm length: follow 3.6 / lock 4.5 / boss 6.0, eased over CAMERA.ease; charge push-in; golden punch-in
    const base = this.bossActive ? CAMERA.bossDist : t ? CAMERA.lockDist : CAMERA.dist;
    const D = this._dist;
    if (base !== D.to) { D.from = this._snap ? base : this.distance; D.to = base; D.t = this._snap ? CAMERA.ease : 0; }
    D.t = Math.min(CAMERA.ease, D.t + dt);
    this.distance = lerp(D.from, D.to, easeInOutSine(CAMERA.ease > 0 ? D.t / CAMERA.ease : 1));
    const charging = p.stateName === 'charge' || (p.charge ?? 0) > 0;
    this._chargeW = damp(this._chargeW, charging ? 1 : 0, 5, dt);
    if (this._goldenT > 0) this._goldenT = Math.max(0, this._goldenT - dt);
    const g = this._goldenEnvelope();
    let want = this.distance - (CAMERA.dist - PLAYER.charge.camDist) * this._chargeW;
    want = lerp(want, 2.0, g);
    let fov = CAMERA.fov + (PLAYER.charge.camFov - CAMERA.fov) * this._chargeW;
    fov = lerp(fov, 36, g);

    // ---- pivot (head height), smoothed: XZ fast, Y slow so jumps don't bob the view
    _piv.copy(ppos); _piv.y += lerp(CAMERA.pivotY, 0.85, g);
    if (this._snap) this.pivot.copy(_piv);
    else {
      this.pivot.x = damp(this.pivot.x, _piv.x, 20, dt);
      this.pivot.y = damp(this.pivot.y, _piv.y, 8, dt);
      this.pivot.z = damp(this.pivot.z, _piv.z, 20, dt);
    }

    const cp = Math.cos(this.pitch);
    _dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));            // screen right (tech.md §8)

    // lock: arm starts over her right shoulder; look at the midpoint (capped so she stays in frame)
    const shoulder = t ? SHOULDER * (want / CAMERA.lockDist) : 0;
    _org.copy(this.pivot);
    if (shoulder > 0) _org.addScaledVector(_right, shoulder);
    const armOrigin = _tmp.copy(_org);
    const allowed = this._armLength(armOrigin, _dir, want, _right);
    this.curDist = this._snap ? allowed : damp(this.curDist, allowed, allowed < this.curDist ? 25 : 3, dt);
    out.pos.copy(armOrigin).addScaledVector(_dir, this.curDist);
    const gy = (ctx.physics?.heightAt?.(out.pos.x, out.pos.z) ?? -Infinity) + 0.3;
    if (out.pos.y < gy) out.pos.y = gy;

    if (t) {
      const tp = t.object3d?.position ?? t.pos;
      _lookPt.set(tp.x, tp.y + (t.height ?? 1) * 0.6, tp.z).sub(this.pivot).multiplyScalar(0.5);
      const h = Math.hypot(_lookPt.x, _lookPt.z);
      if (h > 2.2) { _lookPt.x *= 2.2 / h; _lookPt.z *= 2.2 / h; }
      _lookPt.y = clamp(_lookPt.y, -0.6, 1.2);
      out.look.copy(this.pivot).add(_lookPt);
      if (this._snap) this._lockLook.copy(out.look);
      else { this._lockLook.lerp(out.look, 1 - Math.exp(-10 * dt)); out.look.copy(this._lockLook); }
    } else {
      out.look.copy(this.pivot);
      this._lockLook.copy(this.pivot);
    }
    out.roll = 0;
    out.fov = fov;
    this._snap = false;
    return out;
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

  // ------------------------------------------------------------------ per frame
  render(alpha, frameDt) {
    const ctx = this.ctx, cam = ctx.camera, game = ctx.game;
    const dt = Math.min(Math.max(frameDt || 0, 0), 0.1);
    const paused = game?.mode === 'menu';
    const sdt = paused ? 0 : dt * (game?.loop?.timeScale ?? 1);         // sim-time for cutscene timelines
    const look = ctx.input?.consumeLook?.() ?? ZERO_LOOK;
    let pose;
    switch (this.modeName) {
      case 'meme': pose = this._meme.update(dt); break;
      case 'preset': pose = this._cut.update(sdt); if (this._cut.landed && !this._landShaken) { this._landShaken = true; this.shake(0.2); } break;
      case 'cutscene': pose = this._holdPose; break;
      default: pose = this._gameplay(dt, paused ? ZERO_LOOK : look); this._flicks(dt, look);
    }
    if (this.modeName !== 'preset') this._landShaken = false;

    const b = this._blend, out = this._outPose;
    if (b.active) {
      b.t += b.sim ? sdt : dt;
      const k = b.ease(clamp(b.t / b.dur, 0, 1));
      if (b.pivot && GAMEPLAY.has(this.modeName)) this._playerPivot(b.pivot);
      blendPose(this._blendFrom, pose, k, b.pivot, out);
      if (b.t >= b.dur) b.active = false;
    } else out.copy(pose);

    applyPose(cam, out);

    // FOV: pose FOV + the Holy punch; widened on narrow (portrait) screens
    if (this._fovPunchT > 0) this._fovPunchT = Math.max(0, this._fovPunchT - dt);
    const punch = this._fovPunchT > 0 ? JUICE.holy.fovPunch * Math.sin(Math.PI * (1 - this._fovPunchT / 0.15)) : 0;
    this.fov = out.fov + punch;
    const fov = aspectFov(this.fov, cam.aspect);
    if (Math.abs(fov - this._appliedFov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); this._appliedFov = fov; }

    this.shaker.apply(cam, dt, ctx.state?.settings?.shake ?? 1);    // camera-space rotations after lookAt

    // tree fade: anything between the camera and the subject (her, or the shot's subject)
    const subj = this.modeName === 'preset' ? this._cut.subject : ctx.player ? (ctx.player.object3d?.position ?? ctx.player.pos) : null;
    if (subj) {
      const h = this.modeName === 'preset' ? (this._cut.frame.height ?? 1) : (ctx.player?.height ?? 1);
      _subjects[0].copy(subj); _subjects[0].y += h * 0.5;
      _subjects[1].copy(subj); _subjects[1].y += h * 1.05;
      this._fader.update(dt, cam.position, _subjects, 2);
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
