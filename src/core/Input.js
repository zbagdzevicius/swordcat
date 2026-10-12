// src/core/Input.js  (owner: core) — keyboard/mouse/gamepad + touch hooks → actions.
// tech.md §7 + GAME_DESIGN §15 + research/CONTROLS_SPEC.md §6 (iso: no pointer lock, pointer model, click / tap
// queue, zoom, pad aim stick, touch drag-aim, KBM presets + rebinding, haptics; `?cam=classic` keeps the M1/M2
// orbit table: RMB guard, Space jump, R3 recenter, pointer lock).
//
// Edge semantics (tech.md §6): `pressed`/`released` are latched from DOM events until the FIRST fixed step
// consumes them (Game calls endStep() after each non-hitstop step), so edges are never lost or doubled.
// `heldTime(a)` counts fixed-step (sim) seconds while held; on the step a button is released it still
// returns the final hold duration (for charge release), then resets.
//
// The constructor touches no DOM (node-safe); `attach(canvas)` adds the listeners.
import { INPUT, AIM, HAPTICS, CAMERA } from './config.js';
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
    /**
     * CONTROLS_SPEC §6.1: the iso controls (default) never capture the mouse; `?cam=classic` keeps the M1/M2 orbit
     * camera, its binding table and pointer lock.
     */
    this.iso = ctx?.params?.cam !== 'classic';
    this.pointerLocked = false;
    this.pointerLockEnabled = !this.iso;     // Game turns this off in ?test
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

    // ---- CONTROLS_SPEC §6.1 pointer model (CSS px; ndc relative to the canvas)
    /** @type {{x:number, y:number, ndcX:number, ndcY:number, inside:boolean, movedPx:number, speed:number, lastMoveT:number}} */
    this.pointer = { x: 0, y: 0, ndcX: 0, ndcY: 0, inside: false, movedPx: 0, speed: 0, lastMoveT: -Infinity };
    /** Recent pointer samples {t, x, y} (ms, CSS px) for the windowed speed (§6.1). */
    this._ptrHist = [];
    /** The canvas rect, cached (a layout read per mousemove is a forced reflow); null = re-read on next use. */
    this._rect = null;
    /** Pointer position when the Meme Cam started: only a move of ≥ CAMERA.iso.meme.exitPx from it is activity (§2.7). */
    this._memeMark = null;
    /** clicks / taps queued for the next consumer: { button, x, y, down, t, mods: {ctrl, shift, alt}, kind? } */
    this._clicks = [];
    this._zoom = 0;
    /** pad right stick (§6.3 aim; dead zone AIM.padDead), y+ = up on the stick */
    this.aimStick = { x: 0, y: 0 };
    /** touch drag-aim (§9.4): screen-space vector, y+ = up, `active` while a button is being dragged */
    this.virtualAim = { x: 0, y: 0, active: false };
    /** mouse buttons whose press was queued as a click (their release is queued too, wherever it lands) */
    this._clickDown = new Set();
    this._touchT = -Infinity;
    /** active KBM preset (§6.2) and its flags */
    this.preset = 'hybrid';
    this.wasd = true; this.lmbMoves = false;

    // code → actions lookup
    /** @type {Map<string, string[]>} */
    this._bind = new Map();
    this._moveCodes = new Set();
    this._quietRebind = true;
    this.rebind();
    this._quietRebind = false;
  }

  /**
   * (Re)build the code → actions table: `INPUT.keys`, then the active preset's keys (or the classic table with
   * `?cam=classic`), then `settings.bindings` ({action: [codes]}) on top. Emits E.INPUT_SCHEME when the preset changed.
   * @param {string} [preset] defaults to settings.controlPreset
   */
  rebind(preset) {
    const st = this.ctx?.state?.settings;
    const name = preset ?? st?.controlPreset ?? 'hybrid';
    const P = INPUT.presets?.[name] ?? INPUT.presets?.hybrid ?? { keys: {} };
    const table = { ...INPUT.keys, ...(this.iso ? P.keys : INPUT.classicKeys) };
    const over = st?.bindings;
    if (over && typeof over === 'object') for (const [a, codes] of Object.entries(over)) if (Array.isArray(codes) && table[a]) table[a] = codes.slice();
    this.keyTable = table;
    this._bind.clear();
    for (const [action, codes] of Object.entries(table)) for (const c of codes ?? []) {
      if (!this._bind.has(c)) this._bind.set(c, []);
      this._bind.get(c).push(action);
    }
    this.wasd = !this.iso || P.wasd !== false;
    this.lmbMoves = this.iso && !!P.lmbMoves;
    this._moveCodes = new Set(this.wasd ? Object.values(INPUT.move).flat() : []);
    this.padTable = this.iso ? INPUT.pad : { ...INPUT.pad, ...INPUT.classicPad };
    const next = this.iso ? (INPUT.presets?.[name] ? name : 'hybrid') : 'classic';
    const changed = next !== this.preset;
    this.preset = next;
    if (changed && !this._quietRebind) this.ctx?.bus?.emit?.(E.INPUT_SCHEME, { preset: this.preset });
    return this.preset;
  }

  /** The codes bound to `action` right now (preset + rebinding aware; ui glyphs). */
  codesFor(action) { return this.keyTable?.[action] ?? []; }

  // ------------------------------------------------------------------ system contract
  async init() {
    const bus = this.ctx?.bus;
    if (bus?.on) {
      this._offScheme = bus.on(E.SETTINGS_CHANGED, (p) => { if (p?.key === 'controlPreset' || p?.key === 'bindings' || p?.key == null) this.rebind(); });
      this._offHaptics = this._wireHaptics(bus);
    }
    this.rebind();
  }

  /**
   * §10.6: the gameplay moments that buzz a phone. The pad already rumbles from combat / player (JUICE), so these
   * only vibrate on touch; `haptic(kind)` called directly still routes to the pad rumble.
   * @returns {() => void} unsubscribe
   */
  _wireHaptics(bus) {
    const offs = [];
    const on = (ev, fn) => { if (ev) { const off = bus.on(ev, fn); if (typeof off === 'function') offs.push(off); } };
    const buzz = (kind) => { if (this.device === 'touch') this.haptic(kind); };
    const isPlayer = (a) => !!a && a === this.ctx?.player;
    on(E.PLAYER_PARRY, () => buzz('parry'));
    on(E.PLAYER_PERFECT_DODGE, () => buzz('perfectDodge'));
    on(E.PLAYER_DAMAGED, (p) => { if (!(p?.amount > 0)) return; buzz('hurt'); });
    on(E.PLAYER_HOLY, () => buzz('holy'));
    on(E.PLAYER_GOLDEN, (p) => { if (p?.on) buzz('golden'); });
    on(E.KITTEN_RESCUED, () => buzz('kitten'));
    on(E.PLAYER_ORDER, (p) => { if (p && p.valid === false) buzz('orderRejected'); });
    let broken = false;
    on(E.PLAYER_GRIT, (p) => { const b = !!p?.broken; if (b && !broken) buzz('guardBreak'); broken = b; });
    on(E.HIT, (p) => {
      if (!p || p.parried) return;
      if (isPlayer(p.target) && p.blocked) buzz('block');
      else if (isPlayer(p.attacker) && (p.killed || p.crit)) buzz('hitHeavy');
    });
    return () => { for (const off of offs) off(); };
  }
  /** Fixed step: advance hold timers + idle timers. */
  update(dt) {
    this._resolveLockLoss();
    for (const s of this.actions.values()) if (s.down) s.held += dt;
    if (this._activity) { this.idleTime = 0; this._activity = false; } else this.idleTime += dt;
    if (this._memeMark && this.ctx?.game?.mode !== 'memecam') this._memeMark = null;   // the next Meme Cam re-marks
    if (this._lookActivity) { this.lookIdleTime = 0; this._lookActivity = false; } else this.lookIdleTime += dt;
  }
  render() {}
  dispose() { this.detach(); this._offScheme?.(); this._offHaptics?.(); }

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

  /**
   * Returns look deltas since the previous call ({x, y} radians, {px, py} raw mouse px) and resets them.
   * CONTROLS_SPEC C2: zeros in iso (the fixed-yaw camera is never steered), unless the mouse is captured
   * (Photo Mode); `?cam=classic` keeps the orbit look.
   */
  consumeLook() {
    const o = this._consumed;
    const live = !this.iso || this.pointerLocked;
    o.x = live ? this.look.x : 0; o.y = live ? this.look.y : 0; o.px = live ? this.lookPx.x : 0; o.py = live ? this.lookPx.y : 0;
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
    // a held mouse order button (hold-to-follow) ends on blur too: queue its release
    for (const button of this._clickDown) this._queueClick({ button, x: this.pointer.x, y: this.pointer.y, down: false, t: nowMs(), mods: NO_MODS });
    this._clickDown.clear();
    this.virtualMove.x = this.virtualMove.y = 0;
    this.virtualAim.active = false; this.virtualAim.x = this.virtualAim.y = 0;
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
  /**
   * §9.4 touch drag-aim: the drag vector in screen space (CSS px or normalised; y+ = up) while a cluster button is
   * dragged. `active` false clears it.
   */
  setVirtualAim(x, y, active = true) {
    const a = this.virtualAim;
    a.active = !!active; a.x = active ? +x || 0 : 0; a.y = active ? +y || 0 : 0;
    if (active) { this._activity = true; this.setDevice('touch'); }
  }

  /**
   * §6.1 ui touch: a tap / long-press on the free area at CSS px (x, y). `kind`: 'tap' | 'long' | 'longEnd' | 'move'
   * (a long-press drag). Queued with the mouse clicks (`takeClick`, button 'tap').
   */
  addTap(x, y, kind = 'tap') {
    this._queueClick({ button: 'tap', kind, x, y, down: kind !== 'longEnd', t: nowMs(), mods: NO_MODS });
    this._activity = true;
    this.setDevice('touch');
  }

  /** The next queued click / tap edge (FIFO, max INPUT.pointer.clickQueue) or null. */
  takeClick() { return this._clicks.length ? this._clicks.shift() : null; }
  /** Look at the next click without taking it. */
  peekClick() { return this._clicks[0] ?? null; }
  /** Drop every queued click (mode changes, level loads). */
  clearClicks() { this._clicks.length = 0; }
  _queueClick(c) {
    const q = this._clicks, max = INPUT.pointer?.clickQueue ?? 8;
    q.push(c);
    while (q.length > max) q.shift();
  }

  /** §2.3 zoom steps: + = zoom in (closer), − = out. Wheel ticks, pinch (ui) and R3 add here; the camera consumes. */
  addZoom(k) { if (Number.isFinite(k) && k) { this._zoom += k; this._activity = true; } }
  consumeZoom() { const z = this._zoom; this._zoom = 0; return z; }

  /**
   * §10.6 haptics: `navigator.vibrate` on touch, the pad rumble on pad, scaled by settings.haptics (default 1 on touch).
   * Never in menus. Silently ignored where unsupported.
   * @param {string} kind a HAPTICS key
   */
  haptic(kind) {
    const pat = HAPTICS[kind];
    if (pat == null) return false;
    const st = this.ctx?.state?.settings, scale = st?.haptics ?? 1;
    if (!(scale > 0) || this.ctx?.game?.mode === 'menu') return false;
    if (kind === 'button' && !st?.hapticTaps) return false;
    if (this.device === 'pad') {
      const ms = Array.isArray(pat) ? pat.reduce((a, b) => a + b, 0) : pat;
      this.rumble(0.35 * scale, 0.5 * scale, ms);
      return true;
    }
    if (this.device !== 'touch') return false;
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav?.vibrate) return false;
    const p = Array.isArray(pat) ? pat.map((v, i) => (i % 2 ? v : Math.round(v * scale))) : Math.round(pat * scale);
    try { return nav.vibrate(p); } catch { return false; }
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
    for (const [action, idxs] of Object.entries(this.padTable ?? INPUT.pad)) {
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
    if (this.iso) {
      // §6.3: the right stick aims (a ground reticle); it never turns the fixed-yaw camera
      const as = deadZone(rx, ry, AIM.padDead ?? 0.25, _dz);
      this.aimStick.x = as.x; this.aimStick.y = -as.y;
      if (as.x || as.y) { this._activity = true; padUsed = true; }
      if (mx || my) { this._activity = true; padUsed = true; }
      if (padUsed) this.setDevice('pad');
      this._composeMove();
      return;
    }
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
    this._rect = null;
    const on = (t, type, fn, opts) => { t.addEventListener(type, fn, opts); this._listeners.push(() => t.removeEventListener(type, fn, opts)); };
    const stale = () => { this._rect = null; };
    on(window, 'resize', stale);
    on(window, 'scroll', stale, { capture: true, passive: true });
    on(window, 'orientationchange', stale);
    if (typeof ResizeObserver !== 'undefined' && canvas) {
      const ro = new ResizeObserver(stale); ro.observe(canvas); this._listeners.push(() => ro.disconnect());
    }

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
      if (this._touchT > nowMs() - 800) return;   // the compatibility mouse event of a touch: ui's touch layer owns it
      this.setDevice('kbm');
      const mode = this.ctx?.game?.mode ?? 'play';
      if (this.pointerLockEnabled && !this.pointerLocked && e.button === 0 && (mode === 'play' || mode === 'memecam')) {
        this.requestPointerLock();
        return;                                   // the click that captures the mouse does not attack
      }
      this._pointerAt(e.clientX, e.clientY, false);
      if (this.iso) { this._queueClick({ button: e.button, x: e.clientX, y: e.clientY, down: true, t: nowMs(), mods: { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey } }); this._clickDown.add(e.button); }
      const code = 'Mouse' + e.button;
      for (const a of this._bind.get(code) ?? []) this._press(a, 'm:' + code);
      if (e.button === 1 || e.button === 3 || e.button === 4) e.preventDefault();      // no autoscroll / history navigation
      this._activity = true;
    });
    on(window, 'mouseup', (e) => {
      const code = 'Mouse' + e.button;
      // the release of a queued press is queued wherever it lands (over the HUD too), so hold-to-follow always ends
      if (this.iso && this._clickDown.delete(e.button)) this._queueClick({ button: e.button, x: e.clientX, y: e.clientY, down: false, t: nowMs(), mods: { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey } });
      for (const a of this._bind.get(code) ?? []) this._release(a, 'm:' + code);
    });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on(window, 'mousemove', (e) => {
      if (!this.pointerLocked) { if (this._touchT < nowMs() - 800) this._pointerAt(e.clientX, e.clientY, true); return; }
      const k = INPUT.mouseSens * this.sensitivity;
      this.look.x += e.movementX * k; this.look.y += e.movementY * k;
      this.lookPx.x += e.movementX; this.lookPx.y += e.movementY;
      if (e.movementX || e.movementY) { this._activity = true; this._lookActivity = true; }
    });
    on(canvas, 'mouseleave', () => { this.pointer.inside = false; });
    on(canvas, 'wheel', (e) => {
      if (!e.deltaY) return;
      if (this.iso) {
        // §2.3: one wheel tick = one zoom step (no target switching: Tab cycles)
        if (e.cancelable) e.preventDefault();
        this.addZoom(e.deltaY > 0 ? -1 : 1);
        this.pulse(e.deltaY > 0 ? 'zoomOut' : 'zoomIn');
        return;
      }
      if (this._wheelCooldown > 0) return;
      this._wheelCooldown = INPUT.wheelRepeat;
      this.pulse(e.deltaY > 0 ? 'lockNext' : 'lockPrev');
    }, { passive: !this.iso });
    on(window, 'auxclick', (e) => { if (e.button === 1 || e.button === 3 || e.button === 4) e.preventDefault(); });
    on(document, 'pointerlockchange', () => this._onPointerLockChange(document.pointerLockElement === canvas));
    on(window, 'touchstart', () => { this._touchT = nowMs(); this.setDevice('touch'); }, { passive: true });
    on(window, 'gamepadconnected', () => { this.padConnected = true; });
    on(window, 'gamepaddisconnected', () => this.releaseAll());
  }

  detach() {
    for (const off of this._listeners) off();
    this._listeners.length = 0;
    if (typeof document !== 'undefined' && document.pointerLockElement === this.canvas) document.exitPointerLock?.();
  }

  /**
   * Track the mouse (CSS px): ndc relative to the canvas, travel and speed. §6.1: speed is the NET displacement over
   * the last INPUT.pointer.speedWindow s (divided by the full window), so a resting hand's jitter (which cancels out) and a slow drift under
   * INPUT.pointer.idlePxPerSec are not activity. §2.7: while the Meme Cam runs, a move only counts once the cursor is
   * CAMERA.iso.meme.exitPx from where it was when the Meme Cam started.
   */
  _pointerAt(x, y, moved) {
    const P = this.pointer, r = this._canvasRect();
    const w = r?.width || (typeof innerWidth !== 'undefined' ? innerWidth : 1), h = r?.height || (typeof innerHeight !== 'undefined' ? innerHeight : 1);
    const left = r?.left ?? 0, top = r?.top ?? 0;
    const t = nowMs();
    if (moved) {
      const d = Math.hypot(x - P.x, y - P.y);
      P.movedPx += d;
      const win = (INPUT.pointer?.speedWindow ?? 0.25) * 1000, H = this._ptrHist;
      // drop samples older than the window, keeping one at/before its start as the baseline
      while (H.length > 1 && H[1].t <= t - win) H.shift();
      const base = H[0] ?? { x: P.x, y: P.y };
      P.speed = Math.hypot(x - base.x, y - base.y) / (win / 1000);   // net px over the window: jitter cancels out
      H.push({ t, x, y });
      if (H.length > 64) H.shift();
      if (d > 0) {
        P.lastMoveT = t;
        if (P.speed >= (INPUT.pointer?.idlePxPerSec ?? 24) && this._memeAllows(x, y)) this._activity = true;
        if (this.device === 'touch' && d > 2) this.setDevice('kbm');
      }
    }
    P._t = t;
    P.x = x; P.y = y;
    P.ndcX = ((x - left) / w) * 2 - 1; P.ndcY = -(((y - top) / h) * 2 - 1);
    P.inside = x >= left && x <= left + w && y >= top && y <= top + h;
  }

  /** The canvas bounding rect, cached until a resize / scroll / canvas resize. */
  _canvasRect() {
    if (!this.canvas?.getBoundingClientRect) return null;
    return (this._rect ??= this.canvas.getBoundingClientRect());
  }

  /** §2.7: in the Meme Cam, pointer motion is activity only past CAMERA.iso.meme.exitPx from the mark. */
  _memeAllows(x, y) {
    if ((this.ctx?.game?.mode ?? 'play') !== 'memecam') { this._memeMark = null; return true; }
    this._memeMark ??= this.pointerMark();      // called before pointer.x/y take (x, y): the mark is where the cursor rested
    return Math.hypot(x - this._memeMark.x, y - this._memeMark.y) >= (CAMERA.iso?.meme?.exitPx ?? 40);
  }

  /** A mark of the current cursor position, for pointerSince(mark). */
  pointerMark() { return { x: this.pointer.x, y: this.pointer.y }; }
  /** CSS px (straight line) the cursor is from `mark` (jitter around a resting point stays ~0). */
  pointerSince(mark) { return mark ? Math.hypot(this.pointer.x - mark.x, this.pointer.y - mark.y) : 0; }

  /** Seconds since the mouse last moved (KBM aim freshness, §7.1 "pointer moved within the last 3 s"). */
  pointerIdle() { return (nowMs() - this.pointer.lastMoveT) / 1000; }

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
const NO_MODS = Object.freeze({ ctrl: false, shift: false, alt: false });
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** Radial dead zone with rescale, written into `out` ({x, y}). */
export function deadZone(x, y, dz, out = { x: 0, y: 0 }) {
  const l = Math.hypot(x, y);
  if (l < dz) { out.x = 0; out.y = 0; return out; }
  const s = Math.min(1, (l - dz) / (1 - dz)) / l;
  out.x = x * s; out.y = y * s;
  return out;
}
