// src/core/Input.js  (owner: core) — keyboard/mouse/gamepad + touch hooks → actions.
// tech.md §7 + GAME_DESIGN §15 + §19.1 A2 (RMB = guard; actions guard/ability/milk/meow/golden/recenter;
// heldTime(action); gamepad lock-on is RB only, R3 = recenter).
//
// Edge semantics (tech.md §6): `pressed`/`released` are latched from DOM events until the FIRST fixed step
// consumes them (Game calls endStep() after each non-hitstop step), so edges are never lost or doubled.
// `heldTime(a)` counts fixed-step (sim) seconds while held; on the step a button is released it still
// returns the final hold duration (for charge release), then resets.
//
// The constructor touches no DOM (node-safe); `attach(canvas)` adds the listeners.
import { INPUT } from './config.js';
import { E } from './events.js';

/** @typedef {{ sources: Set<string>, down: boolean, pressed: boolean, released: boolean, held: number }} ActionState */

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export class Input {
  constructor(ctx = null) {
    this.ctx = ctx;
    /** @type {Map<string, ActionState>} */
    this.actions = new Map();
    for (const a of INPUT.actions) this.actions.set(a, { sources: new Set(), down: false, pressed: false, released: false, held: 0 });
    /** Movement intent, y+ = forward (camera-relative mapping is the player's job). Length ≤ 1. */
    this.move = { x: 0, y: 0 };
    /** Look deltas (radians, sensitivity applied) accumulated since the last consumeLook(). */
    this.look = { x: 0, y: 0 };
    /** Raw mouse pixel deltas since the last consumeLook() (camera flick detection). */
    this.lookPx = { x: 0, y: 0 };
    this._consumed = { x: 0, y: 0, px: 0, py: 0 };
    this.keys = new Set();
    this.keyMove = { x: 0, y: 0 }; this.padMove = { x: 0, y: 0 }; this.virtualMove = { x: 0, y: 0 };
    this.padLook = { x: 0, y: 0 };
    /** 'kbm' | 'pad' | 'touch' — last used device (E.INPUT_DEVICE on change). */
    this.device = 'kbm';
    this.pointerLocked = false;
    this.pointerLockEnabled = true;     // Game turns this off in ?test
    /** Re-capture the mouse when the pause menu closes (set once the lock was ever held). */
    this.relockOnResume = false;
    this._lockLost = false;
    this.padConnected = false;
    /** Seconds (sim) since any input activity / any look input (Meme Cam idle, camera auto-follow). */
    this.idleTime = 0; this.lookIdleTime = 0;
    this._activity = false; this._lookActivity = false;
    this._padPrev = new Map();
    this._wheelCooldown = 0;
    this._listeners = [];
    this.canvas = null;

    // code → actions lookup
    /** @type {Map<string, string[]>} */
    this._bind = new Map();
    for (const [action, codes] of Object.entries(INPUT.keys)) for (const c of codes) {
      if (!this._bind.has(c)) this._bind.set(c, []);
      this._bind.get(c).push(action);
    }
    this._moveCodes = new Set(Object.values(INPUT.move).flat());
  }

  // ------------------------------------------------------------------ system contract
  async init() {}
  /** Fixed step: advance hold timers + idle timers. */
  update(dt) {
    this._resolveLockLoss();
    for (const s of this.actions.values()) if (s.down) s.held += dt;
    if (this._activity) { this.idleTime = 0; this._activity = false; } else this.idleTime += dt;
    if (this._lookActivity) { this.lookIdleTime = 0; this._lookActivity = false; } else this.lookIdleTime += dt;
  }
  render() {}
  dispose() { this.detach(); }

  // ------------------------------------------------------------------ queries
  down(a) { return this.actions.get(a)?.down ?? false; }
  pressed(a) { return this.actions.get(a)?.pressed ?? false; }
  released(a) { return this.actions.get(a)?.released ?? false; }
  /** Seconds held (sim time). On the release step: the final duration. 0 otherwise. */
  heldTime(a) { return this.actions.get(a)?.held ?? 0; }
  /** True if any action edge or movement happened this step. */
  anyActivity() {
    if (Math.abs(this.move.x) + Math.abs(this.move.y) > 0.1) return true;
    for (const s of this.actions.values()) if (s.pressed || s.down) return true;
    return false;
  }

  /** Returns look deltas since the previous call ({x, y} radians, {px, py} raw mouse px) and resets them. */
  consumeLook() {
    const o = this._consumed;
    o.x = this.look.x; o.y = this.look.y; o.px = this.lookPx.x; o.py = this.lookPx.y;
    this.look.x = this.look.y = this.lookPx.x = this.lookPx.y = 0;
    return o;
  }

  /** Clears pressed/released edges; resets hold time of released actions. Called by Game after a step. */
  endStep() {
    for (const s of this.actions.values()) {
      s.pressed = false; s.released = false;
      if (!s.down) s.held = 0;
    }
  }

  // ------------------------------------------------------------------ sources
  _press(action, src) {
    const s = this.actions.get(action); if (!s) return;
    const was = s.sources.size > 0;
    s.sources.add(src);
    if (!was) { s.down = true; s.pressed = true; s.held = 0; }
    this._activity = true;
  }

  _release(action, src) {
    const s = this.actions.get(action); if (!s) return;
    if (!s.sources.delete(src)) return;
    if (s.sources.size === 0) { s.down = false; s.released = true; }
  }

  /** A one-step edge with no hold (wheel ticks). */
  pulse(action) {
    const s = this.actions.get(action); if (!s) return;
    s.pressed = true; s.released = true; this._activity = true;
  }

  /** Release everything (window blur, mode switches). */
  releaseAll() {
    for (const s of this.actions.values()) {
      if (s.sources.size) { s.sources.clear(); s.down = false; s.released = true; }
    }
    this.keys.clear(); this.keyMove.x = this.keyMove.y = 0;
    this.virtualMove.x = this.virtualMove.y = 0;
    this._composeMove();
  }

  setDevice(d) {
    if (this.device === d) return;
    this.device = d;
    this.ctx?.bus?.emit(E.INPUT_DEVICE, { device: d });
  }

  get sensitivity() { return this.ctx?.state?.settings?.sensitivity ?? 1; }

  // ------------------------------------------------------------------ touch hooks (ui/touch.js)
  /** Hold / release an action from an on-screen button. */
  setVirtual(action, on) {
    if (on) this._press(action, 'v'); else this._release(action, 'v');
    this.setDevice('touch');
  }
  /** Virtual joystick, x/y in [-1, 1], y+ = forward. */
  setVirtualMove(x, y) {
    this.virtualMove.x = x; this.virtualMove.y = y;
    if (x || y) this._activity = true;
    this.setDevice('touch'); this._composeMove();
  }
  /** Add look in radians (touch drag already scaled by INPUT.touchLookSens). */
  addLook(dx, dy) {
    const k = this.sensitivity;
    this.look.x += dx * k; this.look.y += dy * k;
    if (dx || dy) { this._activity = true; this._lookActivity = true; }
  }

  // ------------------------------------------------------------------ per-frame poll (gamepads)
  /** Called once per rendered frame before the fixed steps. */
  poll(frameDt) {
    if (this._wheelCooldown > 0) this._wheelCooldown -= frameDt;
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const pads = nav?.getGamepads ? nav.getGamepads() : null;
    let any = false;
    const merged = this._mergedButtons || (this._mergedButtons = new Array(20).fill(false));
    merged.fill(false);
    let lx = 0, ly = 0, rx = 0, ry = 0;
    if (pads) {
      for (const p of pads) {
        if (!p || !p.connected) continue;
        any = true;
        for (let i = 0; i < p.buttons.length && i < merged.length; i++) {
          const b = p.buttons[i];
          if (b.pressed || b.value > INPUT.triggerThreshold) merged[i] = true;
        }
        const ax = p.axes;
        if (Math.abs(ax[0] ?? 0) > Math.abs(lx)) lx = ax[0] ?? 0;
        if (Math.abs(ax[1] ?? 0) > Math.abs(ly)) ly = ax[1] ?? 0;
        if (Math.abs(ax[2] ?? 0) > Math.abs(rx)) rx = ax[2] ?? 0;
        if (Math.abs(ax[3] ?? 0) > Math.abs(ry)) ry = ax[3] ?? 0;
      }
    }
    this.padConnected = any;
    let padUsed = false;
    for (const [action, idxs] of Object.entries(INPUT.pad)) {
      for (const i of idxs) {
        const now = merged[i] ?? false, src = 'p' + i;
        const prev = this._padPrev.get(src + action) ?? false;
        if (now && !prev) { this._press(action, src); padUsed = true; }
        else if (!now && prev) this._release(action, src);
        this._padPrev.set(src + action, now);
      }
    }
    const ls = deadZone(lx, ly, INPUT.deadZone, _dz), mx = ls.x, my = ls.y;
    this.padMove.x = mx; this.padMove.y = -my;
    const rs = deadZone(rx, ry, INPUT.deadZone, _dz), lkx = rs.x, lky = rs.y;
    if (lkx || lky) {
      const k = INPUT.padLookSpeed * this.sensitivity * frameDt;
      this.look.x += lkx * k; this.look.y += lky * k;
      this._activity = true; this._lookActivity = true; padUsed = true;
    }
    if (mx || my) { this._activity = true; padUsed = true; }
    if (padUsed) this.setDevice('pad');
    this._composeMove();
  }

  _composeMove() {
    let x = this.keyMove.x + this.padMove.x + this.virtualMove.x;
    let y = this.keyMove.y + this.padMove.y + this.virtualMove.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.move.x = x; this.move.y = y;
  }

  _updateKeyMove() {
    const k = this.keys, M = INPUT.move;
    const has = (arr) => arr.some((c) => k.has(c));
    let x = (has(M.right) ? 1 : 0) - (has(M.left) ? 1 : 0);
    let y = (has(M.up) ? 1 : 0) - (has(M.down) ? 1 : 0);
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    this.keyMove.x = x; this.keyMove.y = y;
    this._composeMove();
  }

  // ------------------------------------------------------------------ DOM
  /** Add DOM listeners. `canvas` receives mouse buttons, pointer lock and wheel. */
  attach(canvas) {
    this.canvas = canvas;
    const on = (t, type, fn, opts) => { t.addEventListener(type, fn, opts); this._listeners.push(() => t.removeEventListener(type, fn, opts)); };

    on(window, 'keydown', (e) => {
      if (EDITABLE.has(e.target?.tagName)) return;
      if (INPUT.preventDefault.includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.setDevice('kbm');
      for (const a of this._bind.get(e.code) ?? []) this._press(a, 'k:' + e.code);
      if (this._moveCodes.has(e.code)) this._updateKeyMove();
      this._activity = true;
    });
    on(window, 'keyup', (e) => {
      this.keys.delete(e.code);
      for (const a of this._bind.get(e.code) ?? []) this._release(a, 'k:' + e.code);
      if (this._moveCodes.has(e.code)) this._updateKeyMove();
    });
    on(window, 'blur', () => this.releaseAll());
    on(document, 'visibilitychange', () => { if (document.hidden) this.releaseAll(); });

    on(canvas, 'mousedown', (e) => {
      this.setDevice('kbm');
      const mode = this.ctx?.game?.mode ?? 'play';
      if (this.pointerLockEnabled && !this.pointerLocked && e.button === 0 && (mode === 'play' || mode === 'memecam')) {
        this.requestPointerLock();
        return;                                   // the click that captures the mouse does not attack
      }
      const code = 'Mouse' + e.button;
      for (const a of this._bind.get(code) ?? []) this._press(a, 'm:' + code);
      if (e.button === 1) e.preventDefault();      // no autoscroll
    });
    on(window, 'mouseup', (e) => {
      const code = 'Mouse' + e.button;
      for (const a of this._bind.get(code) ?? []) this._release(a, 'm:' + code);
    });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on(window, 'mousemove', (e) => {
      if (!this.pointerLocked) return;
      const k = INPUT.mouseSens * this.sensitivity;
      this.look.x += e.movementX * k; this.look.y += e.movementY * k;
      this.lookPx.x += e.movementX; this.lookPx.y += e.movementY;
      if (e.movementX || e.movementY) { this._activity = true; this._lookActivity = true; }
    });
    on(canvas, 'wheel', (e) => {
      if (this._wheelCooldown > 0 || !e.deltaY) return;
      this._wheelCooldown = INPUT.wheelRepeat;
      this.pulse(e.deltaY > 0 ? 'lockNext' : 'lockPrev');
    }, { passive: true });
    on(document, 'pointerlockchange', () => this._onPointerLockChange(document.pointerLockElement === canvas));
    on(window, 'touchstart', () => this.setDevice('touch'), { passive: true });
    on(window, 'gamepadconnected', () => { this.padConnected = true; });
    on(window, 'gamepaddisconnected', () => this.releaseAll());
  }

  detach() {
    for (const off of this._listeners) off();
    this._listeners.length = 0;
    if (typeof document !== 'undefined' && document.pointerLockElement === this.canvas) document.exitPointerLock?.();
  }

  requestPointerLock() {
    const c = this.canvas;
    if (!c?.requestPointerLock) return;
    try {
      const r = c.requestPointerLock({ unadjustedMovement: true });
      if (r && typeof r.catch === 'function') r.catch(() => { try { c.requestPointerLock()?.catch?.(() => {}); } catch { /* ignore */ } });
    } catch { /* ignore: unsupported */ }
  }

  exitPointerLock() { if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock(); }

  /**
   * Pointer lock gained / lost. Browsers spend the player's Esc on leaving the lock (Chrome does not even
   * deliver that keydown), so a lock lost mid-play is treated as a pause request: it is latched here and
   * resolved in the next fixed step (`_resolveLockLoss`), where mode / ui / story state is consistent.
   * @param {boolean} locked
   */
  _onPointerLockChange(locked) {
    const was = this.pointerLocked;
    this.pointerLocked = locked;
    if (locked) { this.relockOnResume = true; this._lockLost = false; }
    else {
      for (const a of ['attack', 'guard', 'lockon']) {
        const s = this.actions.get(a);
        for (const src of [...s.sources]) if (src.startsWith('m:')) this._release(a, src);
      }
      if (was && this.pointerLockEnabled) this._lockLost = true;
    }
    if (was !== locked) this.ctx?.bus?.emit(E.INPUT_POINTER_LOCK, { locked });
  }

  /** Fixed step: a pointer lock lost during play / memecam opens the pause menu (unless a screen, scene or load owns the moment). */
  _resolveLockLoss() {
    if (!this._lockLost) return;
    this._lockLost = false;
    const ctx = this.ctx, mode = ctx?.game?.mode;
    if (mode !== 'play' && mode !== 'memecam') return;           // menu (our own exit), cutscene, dialog: nothing to do
    if (ctx.levels?.loading || ctx.ui?.busy || typeof ctx.ui?.pause !== 'function') return;
    ctx.ui.pause();
    // the Esc that broke the lock may still arrive as a key edge this step: don't let it close the menu again
    const p = this.actions.get('pause');
    if (p) p.pressed = false;
  }

  /** Called by Game when leaving the pause menu back to play: re-capture the mouse if it was captured before. */
  relock() {
    if (!this.pointerLockEnabled || this.pointerLocked || !this.relockOnResume || this.device !== 'kbm') return;
    this.requestPointerLock();
  }

  /** Gamepad rumble (GAME_DESIGN §8.2: [weak, strong, ms]); silently ignored where unsupported. */
  rumble(weak, strong, ms) {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav?.getGamepads || this.device !== 'pad') return;
    const scale = this.ctx?.state?.settings?.shake ?? 1;
    for (const p of nav.getGamepads()) {
      const act = p?.vibrationActuator;
      if (!act?.playEffect) continue;
      act.playEffect('dual-rumble', { duration: ms, weakMagnitude: Math.min(1, weak * scale), strongMagnitude: Math.min(1, strong * scale) }).catch?.(() => {});
    }
  }
}

const _dz = { x: 0, y: 0 };
/** Radial dead zone with rescale, written into `out` ({x, y}). */
export function deadZone(x, y, dz, out = { x: 0, y: 0 }) {
  const l = Math.hypot(x, y);
  if (l < dz) { out.x = 0; out.y = 0; return out; }
  const s = Math.min(1, (l - dz) / (1 - dz)) / l;
  out.x = x * s; out.y = y * s;
  return out;
}
