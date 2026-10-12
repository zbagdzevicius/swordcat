// src/ui/touch.js  (owner: ui) — research/CONTROLS_SPEC.md §9 touch controls in #touch (rewrite for the iso controls):
//  • a FLOATING joystick in the left zone (42 % × bottom 80 %; portrait 55 % × bottom 38 %; the base follows a thumb
//    dragged past 1.6 R; its base is kept a stick radius off the edges; a second finger on a fresh stick = pinch)
//    → input.setVirtualMove;
//  • the Wild Rift cluster (touchLayout.js geometry, × settings.touchSize, ≥ 56 px, mirrored when left-handed): a big ⚔
//    (tap / hold to charge / drag ≥ 16 px to aim; a quick flick aims the first slash), 🛡 Stand (hold), Tumble (press fires, a drag within 0.08 s steers it),
//    Jump, the kitten portrait (tap = smart cast, drag = aim, ✕ cancels), Milk, Meow, a contextual "!" and the gold
//    Golden Hour sun; a 40 px dead ring around every button;
//  • the free area: tap = `input.addTap` (the player's tap orders: enemy → select + attack, object / NPC → use,
//    ground → move), long-press ≥ 0.35 s = hold-to-follow, swipe ≥ 48 px in ≤ 150 ms = Tumble that way, two-finger pinch =
//    zoom (input.addZoom), a two-finger double-tap resets it (§6.4); taps within 0.3 s of a cluster release are ignored;
//  • ❚❚ at the top centre (tap = pause, hold 1 s = skip a cutscene), the ✕ chip while aiming;
//  • shown when (pointer: coarse) matches or on the first touchstart; portrait shows a one-time "plays best sideways"
//    toast (no blocking card any more, C8).
import { PLAYER, TOUCH as TC } from '../core/config.js';
import { E } from '../core/events.js';
import { SIGNATURE } from '../characters/palette.js';
import { el, flag, setVar, place } from './dom.js';
import { tx } from './text.js';
import { portraitSVG } from './portraits.js';
import { computeLayout, buttonAt, inDeadRing, inStickZone, classifyGesture, stickVector as stickVec, clampTs, clampStickBase } from './touchLayout.js';
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
/** A second finger within this long of the stick's touch-down (or before the stick goes live) starts a pinch instead. */
const STICK_PINCH_S = 0.2;
/** ⚔ flick-aim (§9.4): the first slash waits this long (or for a 16 px drag) so a quick drag can aim it. */
const FLICK_S = 0.1;

export class TouchControls {
  /** @param {any} ctx @param {HTMLElement} host #touch @param {HTMLElement} uiRoot #ui */
  constructor(ctx, host, uiRoot) {
    this.ctx = ctx; this.host = host; this.uiRoot = uiRoot;
    this.enabled = false;
    this.root = el('div', 'touch-root', { parent: host });
    this.base = el('div', 'stick-base', { parent: this.root, html: '<div class="stick-knob"></div>' });
    this.knob = this.base.firstChild;
    /** the joystick pointer: id, base centre (ox, oy; clamped off the edges), touch-down point (x0, y0), last point, start time */
    this.stick = { id: null, ox: 0, oy: 0, x0: 0, y0: 0, x: 0, y: 0, t0: 0, moved: 0, live: false };
    /** free-area pointers: id → { x0, y0, x, y, t0, moved, long, lastMoveT } */
    this.free = new Map();
    this.pinch = null;
    this._two = null; this._twoTapT = -1;
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
    this.milkN = el('span', 'tb-count', { parent: this.btns.get('milk') });
    /** the §9.2 layout editor while it is open (touchEditor.js); `layoutOverride` is its draft */
    this.editing = null;
    this.layoutOverride = undefined;
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
    // Mobile browsers fire resize when the URL bar / soft keyboard / PiP toggles: only a real rotation
    // (portrait flag flips) or a large (>20 %) viewport change drops held input; otherwise just relayout.
    this._vp = { w: window.innerWidth, h: window.innerHeight };
    on(window, 'resize', () => this._onViewport());
    on(window, 'orientationchange', () => this._onViewport());
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
    if (typeof document !== 'undefined') { flag(document.body, 'ui-touch', this.enabled); if (!this.enabled) { flag(document.body, 'ui-lefty', false); flag(document.body, 'has-tc-band', false); flag(document.body, 'tc-narrow', false); this._unfitHud(); } }
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
    const custom = this.layoutOverride !== undefined ? this.layoutOverride : st.touchLayout;     // the editor's draft wins
    const keepOut = this._keepOut();
    const hs = this.ctx.cam?.heroScreen?.();                           // the camera's own rest point, when it offers one
    const hero = hs && Number.isFinite(hs.x) && Number.isFinite(hs.y) ? { x: Math.round(hs.x / 8) * 8, y: Math.round(hs.y / 8) * 8 } : undefined;
    const key = `${W}x${H}:${this._ts()}:${!!st.leftHanded}:${!!this.editing}:${JSON.stringify(custom ?? null)}:${JSON.stringify(keepOut)}:${hero ? `${hero.x},${hero.y}` : ''}`;
    if (key === this._layoutKey && this.layout) return this.layout;
    this._layoutKey = key;
    this.layout = computeLayout(W, H, { touchSize: this._ts(), leftHanded: !!st.leftHanded, safe: this._safe(), layout: custom, keepOut, noDrop: !!this.editing, hero });
    for (const [name, e] of this.btns) {
      const b = this.layout.buttons[name];
      flag(e, 'is-dropped', !b);
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
    return !!e && !e.classList.contains('is-hidden') && !e.classList.contains('is-dropped');
  }

  /** Undo _fitHud's inline caps (touch controls off: the desktop HUD lays itself out). */
  _unfitHud() {
    for (const e of [this.uiRoot?.querySelector?.('.hud-hearts'), this.uiRoot?.querySelector?.('.hud-valor')]) {
      if (!e) continue;
      e.style.maxWidth = ''; e.style.width = ''; e.style.removeProperty('--heart-w'); flag(e, 'is-capped', false);
    }
    this._fitT = null;
  }

  /**
   * Fit the HUD around the touch controls (≤ 4 Hz, layout reads): the left-handed HUD mirror class; the hearts row and
   * Valor bar capped short of ❚❚ (portrait: max-HP upgrades wrap to a second row instead of running under it); in
   * landscape the top-centre column (boss bar, objective line) narrowed to the widest free band between the top-left
   * HUD block and any cluster button that reaches its height (the boss bar used to cover '!' and Golden Hour).
   */
  _fitHud(force = false) {
    const t = nowS();
    if (!force && this._fitT != null && t - this._fitT < 0.25) return;
    this._fitT = t;
    if (typeof document === 'undefined') return;
    const body = document.body, ui = this.uiRoot, L = this.layout;
    flag(body, 'ui-lefty', this.enabled && !!this.ctx.state?.settings?.leftHanded);
    if (!ui?.querySelector || !L) return;
    // hearts / Valor vs ❚❚
    const pr = this.pauseBtn.getBoundingClientRect();
    const hearts = ui.querySelector('.hud-hearts'), valor = ui.querySelector('.hud-valor');
    for (const e of [hearts, valor]) {
      if (!e) continue;
      const prop = e === hearts ? 'maxWidth' : 'width';
      if (e.style[prop]) e.style[prop] = '';
      if (e === hearts) e.style.removeProperty('--heart-w');
      flag(e, 'is-capped', false);
      const r = e.getBoundingClientRect();
      if (!(pr.width > 0) || !(r.width > 0) || r.top > pr.bottom || r.bottom < pr.top || r.left > pr.right) continue;
      const room = pr.left - 8 - r.left;
      if (r.right <= pr.left - 8 || room <= 0) continue;
      const k = r.width / Math.max(1, e.offsetWidth);                  // the portrait strip scales the HUD block
      const roomU = room / Math.max(0.1, k);
      e.style[prop] = `${Math.floor(roomU)}px`;
      flag(e, 'is-capped', true);
      if (e === hearts) {
        // at most two rows: past that the hearts shrink a little instead of stacking a third row into the card below
        const n = e.children.length, hw = e.firstElementChild?.offsetWidth || 0, gap = parseFloat(getComputedStyle(e).columnGap) || 0;
        const perRow = hw > 0 ? Math.max(1, Math.floor((roomU + gap) / (hw + gap))) : n;
        let w = hw, cols = perRow;
        if (Math.ceil(n / perRow) > 2) { cols = Math.ceil(n / 2); w = Math.max(10, (roomU + gap) / cols - gap); setVar(e, '--heart-w', `${w.toFixed(2)}px`); }
        if (hw > 0) e.style.maxWidth = `${(cols * (w + gap) - gap + 0.5).toFixed(2)}px`;   // exactly `cols` per row
      }
    }
    // the lesson card / top-centre column sit under the (possibly two-row) HUD block
    const tlr = ui.querySelector('.hud-tl')?.getBoundingClientRect();
    if (tlr && tlr.height > 0) setVar(body, '--tl-b', `${Math.ceil(tlr.bottom)}px`);
    // landscape: the top-centre band
    const tc = ui.querySelector('.hud-tc'), tl = ui.querySelector('.hud-tl');
    if (L.portrait || !tc || !tl) { flag(body, 'has-tc-band', false); flag(body, 'tc-narrow', false); return; }
    const W = window.innerWidth, top = tc.getBoundingClientRect().top, bot = top + 96;
    const blocks = [];
    const tr = tl.getBoundingClientRect();
    if (tr.width > 0) blocks.push([tr.left - 10, tr.right + 10]);
    for (const b of Object.values(L.buttons)) if (b.y - b.r < bot && b.y + b.r > top) blocks.push([b.x - b.r - 10, b.x + b.r + 10]);
    blocks.sort((a, b) => a[0] - b[0]);
    let x = 12, best = { l: 12, w: 0 };
    for (const [a, b] of blocks) { if (a - x > best.w) best = { l: x, w: a - x }; x = Math.max(x, b); }
    if (W - 12 - x > best.w) best = { l: x, w: W - 12 - x };
    const max = Math.min(640, W * 0.58);                                 // never wider than the desktop column
    if (best.w > max) { best.l += (best.w - max) / 2; best.w = max; }
    setVar(body, '--tc-l', `${Math.round(best.l)}px`);
    setVar(body, '--tc-w', `${Math.round(best.w)}px`);
    setVar(body, '--tc-r', `${Math.round(W - best.l - best.w)}px`);
    flag(body, 'has-tc-band', best.w >= 120);
    flag(body, 'tc-narrow', best.w < 300);
  }

  /**
   * The HUD blocks the cluster and the ✕ chip must stay off (computeLayout keepOut): the top-left portrait / hearts /
   * Valor block, the top-right counters and ❚❚, as rects grown by 6 px and snapped outward to 16 px so a heart more
   * or less doesn't shuffle the buttons. Re-read at most every 0.5 s (a layout read).
   */
  _keepOut() {
    const t = nowS();
    if (this._koT != null && t - this._koT < 0.5) return this._ko;
    this._koT = t;
    const out = [];
    const ui = this.uiRoot;
    for (const e of [ui?.querySelector?.('.hud-tl'), ui?.querySelector?.('.hud-tr'), this.pauseBtn]) {
      const r = e?.getBoundingClientRect?.();
      if (!r || !(r.width > 0) || !(r.height > 0)) continue;
      out.push({ x0: Math.floor((r.left - 6) / 16) * 16, y0: Math.floor((r.top - 6) / 16) * 16, x1: Math.ceil((r.right + 6) / 16) * 16, y1: Math.ceil((r.bottom + 6) / 16) * 16 });
    }
    this._ko = out;
    return out;
  }

  // ------------------------------------------------------------------ cluster buttons
  _wireButton(e, b) {
    const action = b.action, inp = () => this.ctx.input;
    e.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation(); ev.preventDefault();
      if (this.editing) { this.editing.down(action, ev, e); return; }
      if (!this.enabled) this.enable(true);
      try { e.setPointerCapture(ev.pointerId); } catch { /* synthetic events */ }
      const m = this.ctx.game?.mode;
      // §9.4 flick-aim: in play the first ⚔ press waits FLICK_S (or a 16 px drag, which then aims it explicitly) so a
      // quick drag-and-release slashes where it points instead of at the auto-target; a plain tap fires on release
      const pending = action === 'attack' && m === 'play';
      if (!pending) inp()?.setVirtual(action, true);
      inp()?.haptic?.('button');
      flag(e, 'is-down', true);
      this.held.set(action, { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, t0: nowS(), aiming: false, dx: 0, dy: 0, steered: false, aim: !!b.aim, pending });
      // a tap anywhere advances dialogue
      if ((m === 'dialog' || m === 'cutscene') && action !== 'pause') this.ctx.input?.pulse?.('confirm');
    });
    e.addEventListener('pointermove', (ev) => {
      if (this.editing) { this.editing.move(action, ev); return; }
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
        if (h.pending) { h.pending = false; inp()?.setVirtualAim(h.dx, -h.dy, true); inp()?.setVirtual(action, true); }
      }
      if (h.aiming) {
        if (action === 'ability' && len < TC.aimPx) { this.ctx.companions?.cancelAbilityAim?.(); h.aiming = false; inp()?.setVirtualAim(0, 0, false); return; }
        inp()?.setVirtualAim(h.dx, -h.dy, true);
        this._showAim(h, ev.clientX, ev.clientY, action);
      }
    });
    const up = (ev) => {
      ev?.stopPropagation?.();
      if (this.editing) { this.editing.up(action, ev); return; }
      if (!e.classList.contains('is-down')) return;
      const h = this.held.get(action);
      this.held.delete(action);
      flag(e, 'is-down', false);
      const overCancel = h?.aiming && this._overCancel(ev?.clientX ?? -1, ev?.clientY ?? -1);
      if (overCancel) this._cancelAim(action);
      if (h?.pending && ev?.type === 'pointerup') inp()?.setVirtual(action, true);      // a quick tap: press + release this step
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
    flag(this.root, 'is-aiming', true);
    flag(this.cancelChip, 'is-hot', this._overCancel(x, y));
  }

  _hideAim() {
    if ([...this.held.values()].some((v) => v.aiming)) return;
    flag(this.aimPad, 'is-on', false);
    flag(this.cancelChip, 'is-on', false);
    flag(this.root, 'is-aiming', false);
  }

  _onViewport() {
    const w = window.innerWidth, h = window.innerHeight, p = this._vp;
    const isP = (W, H) => H > W * 1.05;                       // same rule as computeLayout
    const big = Math.abs(w - p.w) > p.w * 0.2 || Math.abs(h - p.h) > p.h * 0.2;
    if (isP(w, h) !== isP(p.w, p.h) || big) { this._vp = { w, h }; this._release(); }   // baseline moves only on release,
    else if (this.enabled) this._relayout();                                            // so small steps can't add up silently
  }

  _release() {
    const inp = this.ctx.input;
    for (const [a, e] of this.btns) if (e.classList.contains('is-down')) { inp?.setVirtual(a, false); flag(e, 'is-down', false); }
    if (this.pauseBtn.classList.contains('is-down')) { inp?.setVirtual('pause', false); flag(this.pauseBtn, 'is-down', false); }
    this.held.clear();
    if (this.stick.id !== null) { this.stick.id = null; flag(this.base, 'is-on', false); inp?.setVirtualMove(0, 0); }
    for (const f of this.free.values()) if (f.long) inp?.addTap?.(f.x, f.y, 'longEnd');
    this.free.clear();
    this.pinch = null; this._two = null; this._twoTapT = -1;
    inp?.setVirtualAim?.(0, 0, false);
    this._hideAim();
    this._layoutKey = '';
  }

  // ------------------------------------------------------------------ joystick + free area
  _down(e) {
    if (this.editing) return;
    if (!this.enabled) this.enable(true);
    const L = this._relayout(), x = e.clientX, y = e.clientY;
    try { this.root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const m = this.ctx.game?.mode;
    if (m === 'dialog' || m === 'cutscene') { this.ctx.input?.pulse?.('confirm'); return; }
    if (m !== 'play') return;
    const onBtn = buttonAt(L, x, y, (n) => this._visible(n));
    // a second finger while the stick is still fresh (just down, or not yet dragged past a tap) is a pinch, not a
    // second stick: the stick lets go and both fingers zoom (a pinch centred on her puts one finger in the stick zone)
    let fromStick = false;
    if (this.stick.id !== null && !onBtn && this.free.size === 0 && (nowS() - this.stick.t0 <= STICK_PINCH_S || !this.stick.live)) {
      fromStick = true;
      const s = this.stick;
      this.free.set(s.id, { x0: s.x0, y0: s.y0, x: s.x, y: s.y, t0: s.t0, moved: s.moved, long: false, lastMoveT: 0, swiped: false });
      s.id = null; s.live = false;
      flag(this.base, 'is-on', false);
      this.ctx.input?.setVirtualMove(0, 0);
    } else if (inStickZone(L, x, y) && this.stick.id === null && !onBtn) {
      // the base never sits closer than a stick radius to the left / right / bottom edge: a thumb landing in a corner
      // can still push all the way toward it (the knob starts off-centre; she only walks once the thumb moves)
      const R = TC.stickR * this._ts(), sf = this._safe();
      const c = clampStickBase(x, y, window.innerWidth, window.innerHeight, R, sf);
      Object.assign(this.stick, { id: e.pointerId, ox: c.x, oy: c.y, x0: x, y0: y, x, y, t0: nowS(), moved: 0, live: false });
      place(this.base, c.x, c.y);
      place(this.knob, x - c.x, y - c.y);
      flag(this.base, 'is-on', true);
      return;
    }
    // (HUD cards take their own pointer events now, so the rest of the top strip is open: foes up-screen are tappable)
    // the dead ring swallows only ground taps: an enemy / NPC / interactable under the finger still wins (a fat-thumb
    // miss next to a button must not walk her off, but a foe standing beside the cluster must stay tappable)
    if (!fromStick && inDeadRing(L, x, y, (n) => this._visible(n)) && (this.ctx.cam?.pick?.(x, y, { touch: true, ground: false })?.kind ?? 'ground') === 'ground') return;
    this.free.set(e.pointerId, { x0: x, y0: y, x, y, t0: nowS(), moved: 0, long: false, lastMoveT: 0, swiped: false });
    if (this.free.size === 2) {
      const [a, b] = [...this.free.values()];
      this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), last: Math.hypot(a.x - b.x, a.y - b.y) };
      for (const f of this.free.values()) f.pinching = true;
      this._two = { t0: nowS(), moved: 0 };                              // a two-finger tap candidate (double-tap = reset)
    }
  }

  /**
   * Drive the floating stick from the thumb's last point. She starts walking once the thumb travels past a tap (or
   * rests past a tap's time): a quick tap stays a tap order, and a base clamped off an edge doesn't lurch her toward
   * the corner on touch-down. The base follows a thumb dragged past 1.6 R (kept clamped inside the edges).
   */
  _applyStick() {
    const s = this.stick, inp = this.ctx.input;
    if (s.id === null) return;
    if (!s.live && (s.moved > TC.tapPx || nowS() - s.t0 > TC.tapMs / 1000)) s.live = true;
    const R = TC.stickR * this._ts();
    let dx = s.x - s.ox, dy = s.y - s.oy;
    const v = stickVec(dx, dy, R);
    if (v.follow > 0) {
      const l = Math.hypot(dx, dy);
      const c = clampStickBase(s.ox + (dx / l) * v.follow, s.oy + (dy / l) * v.follow, window.innerWidth, window.innerHeight, R, this._safe());
      s.ox = c.x; s.oy = c.y;
      place(this.base, s.ox, s.oy);
      dx = s.x - s.ox; dy = s.y - s.oy;
    }
    const w = stickVec(dx, dy, R);
    place(this.knob, w.kx, w.ky);
    if (s.live) inp?.setVirtualMove(w.x, w.y);
  }

  _move(e) {
    const inp = this.ctx.input;
    if (e.pointerId === this.stick.id) {
      const s = this.stick;
      s.x = e.clientX; s.y = e.clientY;
      s.moved = Math.max(s.moved, Math.hypot(s.x - s.x0, s.y - s.y0));
      this._applyStick();
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
      const s = this.stick, moved = Math.max(s.moved, Math.hypot(e.clientX - s.x0, e.clientY - s.y0));
      s.live = false;
      if (e.type === 'pointerup' && classifyGesture({ dt: nowS() - s.t0, dist: moved, up: true, sinceButton: nowS() - this._lastButtonUp }) === 'tap') this.tapAt(s.x0, s.y0);
      return;
    }
    const f = this.free.get(e.pointerId);
    if (!f) return;
    this.free.delete(e.pointerId);
    if (this.free.size < 2) this.pinch = null;
    if (f.pinching) this._twoFingerUp(f, e.type === 'pointerup');
    if (f.pinching || e.type !== 'pointerup') { if (f.long) this.ctx.input?.addTap?.(f.x, f.y, 'longEnd'); return; }
    if (f.long) { this.ctx.input?.addTap?.(f.x, f.y, 'longEnd'); return; }
    if (f.swiped) return;
    const g = classifyGesture({ dt: nowS() - f.t0, dist: f.moved, up: true, sinceButton: nowS() - this._lastButtonUp });
    if (g === 'tap') this.tapAt(f.x0, f.y0);
  }

  /**
   * CONTROLS_SPEC §6.4: a two-finger tap = both fingers down and up within 0.25 s, neither travelling > 12 px; a
   * second one within 0.35 s of the first resets the zoom to the player's camZoom setting.
   */
  _twoFingerUp(f, clean) {
    const two = this._two;
    if (!two) return;
    two.moved = Math.max(two.moved, f.moved);
    if (!clean) two.bad = true;
    for (const g of this.free.values()) if (g.pinching) return;        // wait for the last finger of the pair
    this._two = null;
    const t = nowS();
    if (two.bad || two.moved > 12 || t - two.t0 > 0.25) { this._twoTapT = -1; return; }
    if (this._twoTapT >= 0 && two.t0 - this._twoTapT <= 0.35) {
      this._twoTapT = -1;
      this.ctx.input?.consumeZoom?.();                                   // drop any pinch jitter from the taps
      this.ctx.cam?.zoom?.(this.ctx.state?.settings?.camZoom ?? 1);
      this.ctx.input?.haptic?.('button');
    } else this._twoTapT = t;
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
    this._fitHud();
    flag(this.root, 'is-play', !!vis.play);
    flag(this.root, 'is-any', !!vis.any);
    if (!vis.play && (this.stick.id !== null || this.free.size)) this._release();
    const fc = ctx.game?.frameCount ?? 0;
    if (this._swipeRelease && fc >= this._swipeRelease) { this._swipeRelease = 0; inp?.setVirtual('dodge', false); inp?.setVirtualAim(0, 0, false); }
    if (this._clearAimAt >= 0 && fc >= this._clearAimAt) { this._clearAimAt = -1; if (![...this.held.values()].some((h) => h.aiming)) inp?.setVirtualAim(0, 0, false); }
    if (vis.play) this._longPress();
    if (this.stick.id !== null && !this.stick.live) this._applyStick();            // a thumb resting past a tap goes live
    for (const [a, h] of this.held) if (h.pending && nowS() - h.t0 >= FLICK_S) { h.pending = false; inp?.setVirtual(a, true); }
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
    const mt = `×${p?.milk ?? 0}`;
    if (this.milkN.textContent !== mt) this.milkN.textContent = mt;
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
