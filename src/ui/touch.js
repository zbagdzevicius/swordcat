// src/ui/touch.js  (owner: ui) — research/CONTROLS_SPEC.md §9 touch controls in #touch (rewrite for the iso controls):
//  • a FLOATING joystick in the left zone (42 % × bottom 80 %; portrait 55 % × bottom 38 %; the base follows a thumb
//    dragged past 1.6 R) → input.setVirtualMove;
//  • the Wild Rift cluster (touchLayout.js geometry, × settings.touchSize, ≥ 56 px, mirrored when left-handed): a big ⚔
//    (tap / hold to charge / drag ≥ 16 px to aim), 🛡 Stand (hold), Tumble (press fires, a drag within 0.08 s steers it),
//    Jump, the kitten portrait (tap = smart cast, drag = aim, ✕ cancels), Milk, Meow, a contextual "!" and the gold
//    Golden Hour sun; a 40 px dead ring around every button;
//  • the free area: tap = `input.addTap` (the player's tap orders: enemy → select + attack, object / NPC → use,
//    ground → move), long-press ≥ 0.35 s = hold-to-follow, swipe ≥ 48 px in ≤ 150 ms = Tumble that way, two-finger pinch =
//    zoom (input.addZoom); taps within 0.3 s of a cluster release are ignored;
//  • ❚❚ at the top centre (tap = pause, hold 1 s = skip a cutscene), the ✕ chip while aiming;
//  • shown when (pointer: coarse) matches or on the first touchstart; portrait shows a one-time "plays best sideways"
//    toast (no blocking card any more, C8).
import { PLAYER, TOUCH as TC } from '../core/config.js';
import { E } from '../core/events.js';
import { SIGNATURE } from '../characters/palette.js';
import { el, flag, setVar, place } from './dom.js';
import { tx } from './text.js';
import { portraitSVG } from './portraits.js';
import { computeLayout, buttonAt, inDeadRing, inStickZone, classifyGesture, stickVector as stickVec, clampTs } from './touchLayout.js';
import * as I from './icons.js';

/** Legacy constants (the M1 tap-to-lock pick and stick maths; kept for tests and old callers). */
export const TOUCH = Object.freeze({ stickR: TC.stickR, leftFrac: TC.stickZone[0], deadZone: TC.stickDead, tapPx: TC.tapPx, tapMs: TC.tapMs, tapPickPx: 60, tapRange: 22 });

/**
 * Tap-to-lock pick. Pure. `cands` are actors; `project(a)` returns the actor's chest in CSS px {x, y} or null when off
 * screen / behind the camera. Returns the candidate whose projection is nearest (sx, sy) within `maxPx`, or null.
 * (CONTROLS_SPEC §7.6: the live game picks through `cam.pick`; this stays as the pure helper.)
 * @template T @param {T[]} cands @param {(a: T) => ({x:number,y:number}|null)} project
 * @param {number} sx @param {number} sy @param {number} [maxPx]
 * @returns {T|null}
 */
export function pickTapTarget(cands, project, sx, sy, maxPx = TOUCH.tapPickPx) {
  let best = null, bd = maxPx;
  for (const a of cands) {
    const p = project(a);
    if (!p) continue;
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d <= bd) { bd = d; best = a; }
  }
  return best;
}

/** Joystick vector from a drag offset (px) → {x, y} in [-1, 1] (y+ = forward = drag up) and the clamped knob px. Pure. */
export function stickVector(dx, dy, R = TOUCH.stickR) { return stickVec(dx, dy, R); }

const BUTTONS = [
  { action: 'attack', cls: 'tb-attack', icon: () => I.sword(), ring: true, aim: true },
  { action: 'guard', cls: 'tb-guard', icon: () => I.shield() },
  { action: 'dodge', cls: 'tb-dodge', icon: () => I.tumble(), aim: true },
  { action: 'jump', cls: 'tb-jump', icon: () => I.jump() },
  { action: 'ability', cls: 'tb-ability', icon: () => '', ring: true, aim: true },
  { action: 'milk', cls: 'tb-milk', icon: () => I.milkBottle(true) },
  { action: 'meow', cls: 'tb-meow', icon: () => I.meowFace() },
  { action: 'interact', cls: 'tb-interact', icon: () => '<b>!</b>' },
  { action: 'golden', cls: 'tb-golden', icon: () => I.sun() },
];
const nowS = () => performance.now() / 1000;

export class TouchControls {
  /** @param {any} ctx @param {HTMLElement} host #touch @param {HTMLElement} uiRoot #ui */
  constructor(ctx, host, uiRoot) {
    this.ctx = ctx; this.host = host; this.uiRoot = uiRoot;
    this.enabled = false;
    this.root = el('div', 'touch-root', { parent: host });
    this.base = el('div', 'stick-base', { parent: this.root, html: '<div class="stick-knob"></div>' });
    this.knob = this.base.firstChild;
    /** the joystick pointer: id, base centre, start time */
    this.stick = { id: null, ox: 0, oy: 0, t0: 0, moved: 0 };
    /** free-area pointers: id → { x0, y0, x, y, t0, moved, long, lastMoveT } */
    this.free = new Map();
    this.pinch = null;
    this.cluster = el('div', 'touch-cluster', { parent: this.root });
    this.btns = new Map();
    /** a cluster button being held / dragged: action → { id, x0, y0, t0, aiming, dx, dy } */
    this.held = new Map();
    for (const b of BUTTONS) {
      const e = el('div', `tbtn ${b.cls}`, { parent: this.cluster, html: `${b.ring ? I.ring('tb-ring') : ''}<span class="tb-ico">${b.icon()}</span>` });
      e.dataset.action = b.action;
      this.btns.set(b.action, e);
      this._wireButton(e, b);
    }
    this.attackRing = this.btns.get('attack').querySelector('.ring-fg');
    this.abilityRing = this.btns.get('ability').querySelector('.ring-fg');
    this.abilityCd = el('span', 'tb-cd', { parent: this.btns.get('ability') });
    this.pauseBtn = el('div', 'tbtn tb-pause', { parent: this.root, html: I.pauseIcon() });
    this._wireButton(this.pauseBtn, { action: 'pause' });
    this.aimPad = el('div', 'tb-aimpad', { parent: this.root, html: '<div class="tb-aimdot"></div>' });
    this.aimDot = this.aimPad.firstChild;
    this.cancelChip = el('div', 'tb-cancel', { parent: this.root, html: '<b>✕</b>' });
    this.layout = null;
    this._layoutKey = '';
    this._lastButtonUp = -9;
    this._clearAimAt = -1;
    this._dom = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); this._dom.push(() => t.removeEventListener(ev, fn, o)); };
    on(this.root, 'pointerdown', (e) => this._down(e));
    on(this.root, 'pointermove', (e) => this._move(e));
    for (const ev of ['pointerup', 'pointercancel']) on(this.root, ev, (e) => this._up(e));
    on(window, 'touchstart', () => this.enable(true), { passive: true, once: true });
    on(window, 'resize', () => this._release());
    on(window, 'orientationchange', () => this._release());
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) this.enable(true);
    this.interactOn = false;
    const bus = ctx.bus;
    this._offs = [
      bus.on(E.INTERACT_AVAILABLE, () => { this.interactOn = true; }),
      bus.on(E.INTERACT_CLEAR, () => { this.interactOn = false; }),
      bus.on(E.LEVEL_LOADING, () => { this.interactOn = false; this._release(); }),
      bus.on(E.GAME_MODE, () => this._release()),
    ];
  }

  enable(on = true) {
    this.enabled = !!on;
    flag(this.host, 'on', this.enabled);
    if (typeof document !== 'undefined') flag(document.body, 'ui-touch', this.enabled);
    if (this.enabled) this.ctx.input?.setDevice?.('touch');
  }

  _ts() { return clampTs(this.ctx.state?.settings?.touchSize ?? 1); }
  _safe() {
    const cs = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
    const v = (k) => parseFloat(cs?.getPropertyValue(k) || '0') || 0;
    return { top: v('--sat'), right: v('--sar'), bottom: v('--sab'), left: v('--sal') };
  }

  /** Recompute the cluster geometry when the viewport / settings change; place the buttons. */
  _relayout() {
    const W = window.innerWidth, H = window.innerHeight, st = this.ctx.state?.settings ?? {};
    const key = `${W}x${H}:${this._ts()}:${!!st.leftHanded}:${JSON.stringify(st.touchLayout ?? null)}`;
    if (key === this._layoutKey && this.layout) return this.layout;
    this._layoutKey = key;
    this.layout = computeLayout(W, H, { touchSize: this._ts(), leftHanded: !!st.leftHanded, safe: this._safe(), layout: st.touchLayout });
    for (const [name, e] of this.btns) {
      const b = this.layout.buttons[name];
      if (!b) continue;
      Object.assign(e.style, { left: `${b.x - b.r}px`, top: `${b.y - b.r}px`, width: `${b.size}px`, height: `${b.size}px`, right: 'auto', bottom: 'auto' });
    }
    const c = this.layout.cancel;
    Object.assign(this.cancelChip.style, { left: `${c.x - c.r}px`, top: `${c.y - c.r}px`, width: `${c.r * 2}px`, height: `${c.r * 2}px` });
    flag(this.root, 'is-portrait', this.layout.portrait);
    return this.layout;
  }

  _visible(name) {
    const e = this.btns.get(name);
    return !!e && !e.classList.contains('is-hidden');
  }

  // ------------------------------------------------------------------ cluster buttons
  _wireButton(e, b) {
    const action = b.action, inp = () => this.ctx.input;
    e.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation(); ev.preventDefault();
      if (!this.enabled) this.enable(true);
      try { e.setPointerCapture(ev.pointerId); } catch { /* synthetic events */ }
      inp()?.setVirtual(action, true);
      inp()?.haptic?.('button');
      flag(e, 'is-down', true);
      this.held.set(action, { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, t0: nowS(), aiming: false, dx: 0, dy: 0, steered: false, aim: !!b.aim });
      // a tap anywhere advances dialogue
      const m = this.ctx.game?.mode;
      if ((m === 'dialog' || m === 'cutscene') && action !== 'pause') this.ctx.input?.pulse?.('confirm');
    });
    e.addEventListener('pointermove', (ev) => {
      const h = this.held.get(action);
      if (!h || h.id !== ev.pointerId || !h.aim) return;
      h.dx = ev.clientX - h.x0; h.dy = ev.clientY - h.y0;
      const len = Math.hypot(h.dx, h.dy);
      if (!h.aiming && len >= TC.aimPx) {
        if (action === 'dodge') {
          // Tumble: a drag inside the first 0.08 s steers the roll once
          if (!h.steered && nowS() - h.t0 <= TC.steerWindow + 0.05) { h.steered = true; this._steerDodge(h.dx, h.dy); }
          return;
        }
        h.aiming = true;
      }
      if (h.aiming) {
        if (action === 'ability' && len < TC.aimPx) { this.ctx.companions?.cancelAbilityAim?.(); h.aiming = false; inp()?.setVirtualAim(0, 0, false); return; }
        inp()?.setVirtualAim(h.dx, -h.dy, true);
        this._showAim(h, ev.clientX, ev.clientY, action);
      }
    });
    const up = (ev) => {
      ev?.stopPropagation?.();
      if (!e.classList.contains('is-down')) return;
      const h = this.held.get(action);
      this.held.delete(action);
      flag(e, 'is-down', false);
      const overCancel = h?.aiming && this._overCancel(ev?.clientX ?? -1, ev?.clientY ?? -1);
      if (overCancel) this._cancelAim(action);
      inp()?.setVirtual(action, false);
      if (h?.aiming) this._clearAimAt = this.ctx.game?.frameCount + 2;     // keep the aim until the step reads the release
      this._hideAim();
      this._lastButtonUp = nowS();
    };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) e.addEventListener(ev, up);
  }

  /** ✕: an aimed charge or ability is called off (no swing, no cast). */
  _cancelAim(action) {
    const ctx = this.ctx;
    ctx.input?.setVirtualAim(0, 0, false);
    if (action === 'ability') ctx.companions?.cancelAbilityAim?.();
    if (action === 'attack') { const p = ctx.player; if (p?.state === 'charge') { p.cancelCharge?.(); p.setState?.('move'); } if (p) p.attackBuf = 0; }
  }

  _steerDodge(dx, dy) {
    const p = this.ctx.player, cam = this.ctx.cam;
    const yaw = cam?.stickYaw ?? cam?.yaw ?? Math.PI;
    const sx = dx, sy = -dy, l = Math.hypot(sx, sy) || 1;
    const wx = (-Math.sin(yaw) * sy + Math.cos(yaw) * sx) / l, wz = (-Math.cos(yaw) * sy - Math.sin(yaw) * sx) / l;
    if (p?.steerDodge) p.steerDodge(wx, wz);
    else this.ctx.input?.setVirtualAim(sx, sy, true);
  }

  _overCancel(x, y) {
    const c = this.layout?.cancel;
    return !!c && Math.hypot(x - c.x, y - c.y) <= c.r + 8;
  }

  _showAim(h, x, y, action) {
    const b = this.layout?.buttons?.[action];
    const cx = b?.x ?? h.x0, cy = b?.y ?? h.y0, R = (TC.aimPad / 2) * this._ts();
    place(this.aimPad, cx, cy);
    setVar(this.aimPad, '--r', `${R}px`);
    const L = Math.hypot(h.dx, h.dy), k = L > R ? R / L : 1;
    place(this.aimDot, h.dx * k, h.dy * k);
    flag(this.aimPad, 'is-on', true);
    flag(this.cancelChip, 'is-on', true);
    flag(this.cancelChip, 'is-hot', this._overCancel(x, y));
  }

  _hideAim() {
    if ([...this.held.values()].some((v) => v.aiming)) return;
    flag(this.aimPad, 'is-on', false);
    flag(this.cancelChip, 'is-on', false);
  }

  _release() {
    const inp = this.ctx.input;
    for (const [a, e] of this.btns) if (e.classList.contains('is-down')) { inp?.setVirtual(a, false); flag(e, 'is-down', false); }
    if (this.pauseBtn.classList.contains('is-down')) { inp?.setVirtual('pause', false); flag(this.pauseBtn, 'is-down', false); }
    this.held.clear();
    if (this.stick.id !== null) { this.stick.id = null; flag(this.base, 'is-on', false); inp?.setVirtualMove(0, 0); }
    for (const f of this.free.values()) if (f.long) inp?.addTap?.(f.x, f.y, 'longEnd');
    this.free.clear();
    this.pinch = null;
    inp?.setVirtualAim?.(0, 0, false);
    this._hideAim();
    this._layoutKey = '';
  }

  // ------------------------------------------------------------------ joystick + free area
  _down(e) {
    if (!this.enabled) this.enable(true);
    const L = this._relayout(), x = e.clientX, y = e.clientY;
    try { this.root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const m = this.ctx.game?.mode;
    if (m === 'dialog' || m === 'cutscene') { this.ctx.input?.pulse?.('confirm'); return; }
    if (m !== 'play') return;
    if (inStickZone(L, x, y) && this.stick.id === null && !buttonAt(L, x, y, (n) => this._visible(n))) {
      Object.assign(this.stick, { id: e.pointerId, ox: x, oy: y, t0: nowS(), moved: 0 });
      place(this.base, x, y);
      place(this.knob, 0, 0);
      flag(this.base, 'is-on', true);
      return;
    }
    if (y < L.hudBottom) return;                                        // the HUD strip: no taps pass through
    if (inDeadRing(L, x, y, (n) => this._visible(n))) return;
    this.free.set(e.pointerId, { x0: x, y0: y, x, y, t0: nowS(), moved: 0, long: false, lastMoveT: 0, swiped: false });
    if (this.free.size === 2) {
      const [a, b] = [...this.free.values()];
      this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), last: Math.hypot(a.x - b.x, a.y - b.y) };
      for (const f of this.free.values()) f.pinching = true;
    }
  }

  _move(e) {
    const inp = this.ctx.input;
    if (e.pointerId === this.stick.id) {
      const R = TC.stickR * this._ts();
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const v = stickVec(dx, dy, R);
      if (v.follow > 0) {                                               // the base follows a thumb dragged past 1.6 R
        const l = Math.hypot(dx, dy);
        this.stick.ox += (dx / l) * v.follow; this.stick.oy += (dy / l) * v.follow;
        place(this.base, this.stick.ox, this.stick.oy);
        dx = e.clientX - this.stick.ox; dy = e.clientY - this.stick.oy;
      }
      const w = stickVec(dx, dy, R);
      place(this.knob, w.kx, w.ky);
      this.stick.moved = Math.max(this.stick.moved, Math.hypot(dx, dy));
      inp?.setVirtualMove(w.x, w.y);
      return;
    }
    const f = this.free.get(e.pointerId);
    if (!f) return;
    f.x = e.clientX; f.y = e.clientY;
    f.moved = Math.max(f.moved, Math.hypot(f.x - f.x0, f.y - f.y0));
    if (this.pinch && this.free.size >= 2) {
      const [a, b] = [...this.free.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch.last > 8 && d > 8) {
        const ratio = d / this.pinch.last;
        if (Math.abs(ratio - 1) > 0.01) { inp?.addZoom?.(Math.log(ratio) / -Math.log(1 - (this.ctx.config?.CAMERA?.iso?.zoomStep ?? 0.07))); this.pinch.last = d; }
      }
      return;
    }
    const g = classifyGesture({ dt: nowS() - f.t0, dist: f.moved, up: false, sinceButton: nowS() - this._lastButtonUp });
    if (g === 'swipe' && !f.swiped && !f.long && this.ctx.state?.settings?.swipeTumble !== false) {
      f.swiped = true;
      this._swipeTumble(f.x - f.x0, f.y - f.y0);
      return;
    }
    if (f.long && nowS() - f.lastMoveT >= 0.1) { f.lastMoveT = nowS(); inp?.addTap?.(f.x, f.y, 'move'); }
  }

  _up(e) {
    if (e.pointerId === this.stick.id) {
      this.stick.id = null; flag(this.base, 'is-on', false); this.ctx.input?.setVirtualMove(0, 0);
      // a quick touch in the stick zone that never became a drag is a tap (tap-to-move / tap a foe works everywhere)
      const moved = Math.max(this.stick.moved, Math.hypot(e.clientX - this.stick.ox, e.clientY - this.stick.oy));
      if (e.type === 'pointerup' && classifyGesture({ dt: nowS() - this.stick.t0, dist: moved, up: true, sinceButton: nowS() - this._lastButtonUp }) === 'tap') this.tapAt(this.stick.ox, this.stick.oy);
      return;
    }
    const f = this.free.get(e.pointerId);
    if (!f) return;
    this.free.delete(e.pointerId);
    if (this.free.size < 2) this.pinch = null;
    if (f.pinching || e.type !== 'pointerup') { if (f.long) this.ctx.input?.addTap?.(f.x, f.y, 'longEnd'); return; }
    if (f.long) { this.ctx.input?.addTap?.(f.x, f.y, 'longEnd'); return; }
    if (f.swiped) return;
    const g = classifyGesture({ dt: nowS() - f.t0, dist: f.moved, up: true, sinceButton: nowS() - this._lastButtonUp });
    if (g === 'tap') this.tapAt(f.x0, f.y0);
  }

  /** A free-area tap at CSS px: the player's tap order (cam.pick: enemy → attack, object / NPC → use, ground → move). */
  tapAt(x, y) {
    if (this.ctx.game?.mode !== 'play') return false;
    this.ctx.input?.addTap?.(x, y, 'tap');
    return true;
  }

  /** §9.3 swipe on the free area: Tumble in the swipe's world direction. */
  _swipeTumble(dx, dy) {
    const inp = this.ctx.input;
    inp?.setVirtualAim(dx, -dy, true);
    inp?.setVirtual('dodge', true);
    this._swipeRelease = (this.ctx.game?.frameCount ?? 0) + 2;
  }

  /** Long-press detection runs per frame (no pointer events while the finger rests). */
  _longPress() {
    const st = this.ctx.state?.settings ?? {};
    for (const f of this.free.values()) {
      if (f.long || f.swiped || f.pinching || this.free.size > 1) continue;
      const g = classifyGesture({ dt: nowS() - f.t0, dist: f.moved, up: false, sinceButton: nowS() - this._lastButtonUp });
      if (g === 'long' && st.tapToMove !== false) { f.long = true; f.lastMoveT = nowS(); this.ctx.input?.addTap?.(f.x, f.y, 'long'); }
    }
  }

  /** @param {number} dt @param {{ play: boolean, any: boolean }} vis */
  render(dt, vis) {
    if (!this.enabled) return;
    const ctx = this.ctx, p = ctx.player, inp = ctx.input;
    const ts = this._ts().toFixed(2);
    setVar(this.host, '--ts', ts);
    setVar(document.body, '--ui-ts', ts);
    setVar(this.host, '--tb-op', String(Math.max(0.4, Math.min(1, ctx.state?.settings?.buttonOpacity ?? 0.85))));
    this._relayout();
    flag(this.root, 'is-play', !!vis.play);
    flag(this.root, 'is-any', !!vis.any);
    if (!vis.play && (this.stick.id !== null || this.free.size)) this._release();
    const fc = ctx.game?.frameCount ?? 0;
    if (this._swipeRelease && fc >= this._swipeRelease) { this._swipeRelease = 0; inp?.setVirtual('dodge', false); inp?.setVirtualAim(0, 0, false); }
    if (this._clearAimAt >= 0 && fc >= this._clearAimAt) { this._clearAimAt = -1; if (![...this.held.values()].some((h) => h.aiming)) inp?.setVirtualAim(0, 0, false); }
    if (vis.play) this._longPress();
    // attack charge ring
    const ch = p?.charge ?? 0;
    this.attackRing?.setAttribute('stroke-dashoffset', (I.RING_LEN * (1 - Math.min(1, ch))).toFixed(1));
    flag(this.btns.get('attack'), 'is-charge', ch > 0.02);
    flag(this.btns.get('attack'), 'is-gold', (p?.chargeTier ?? 0) >= 2);
    // ability portrait + ring + seconds
    const comp = ctx.companions, c = comp?.active?.[0];
    const ab = this.btns.get('ability');
    flag(ab, 'is-hidden', !c);
    if (c) {
      const id = c.kittenId ?? c.id;
      if (ab._id !== id) { ab._id = id; ab.querySelector('.tb-ico').innerHTML = portraitSVG(id, { expression: 'happy' }); setVar(ab, '--sig', SIGNATURE[id] ?? '#D9B26A'); }
      const r = Math.max(0, Math.min(1, comp.readiness?.() ?? c.readiness ?? 1));
      this.abilityRing?.setAttribute('stroke-dashoffset', (I.RING_LEN * (1 - r)).toFixed(1));
      const left = comp.cooldownLeft?.() ?? 0;
      const txt = (c.napT ?? 0) > 0 ? 'zzz' : left >= 1 ? String(Math.ceil(left)) : '';
      if (this.abilityCd.textContent !== txt) this.abilityCd.textContent = txt;
      flag(ab, 'is-nap', (c.napT ?? 0) > 0);
      flag(ab, 'is-cd', left > 0);
    }
    // contextual buttons
    flag(this.btns.get('interact'), 'is-hidden', !this.interactOn);
    const goldReady = !!p && (p.valor ?? 0) >= PLAYER.valor.max && (ctx.state?.shards ?? 0) >= 2 && !p.golden;
    flag(this.btns.get('golden'), 'is-hidden', !goldReady);
    flag(this.btns.get('milk'), 'is-empty', (p?.milk ?? 0) <= 0);
    // portrait: a one-time "plays best sideways" toast (C8: no blocking card)
    const portrait = window.innerHeight > window.innerWidth * 1.05;
    if (portrait && vis.play && !this._rotToast && !ctx.state?.getFlag?.('seen.tut.rotate')) {
      this._rotToast = true;
      ctx.state?.setFlag?.('seen.tut.rotate', true);
      ctx.bus.emit(E.TOAST, { text: tx(ctx, 'tut.rotate') });
    }
  }

  dispose() {
    this._release();
    for (const off of this._dom) off();
    for (const off of this._offs) off();
    this.root.remove();
    flag(this.host, 'on', false);
  }
}
