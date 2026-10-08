// src/ui/touch.js  (owner: ui) — GAME_DESIGN §15.3 touch controls in #touch (tech.md §7 TouchControls):
//  • left 45%: a floating joystick (input.setVirtualMove); right side: drag to look (input.addLook × INPUT.touchLookSens);
//  • right cluster (64–88 px × settings.touchSize): big ⚔ (hold to charge; a ring fills), 🛡 Stand (hold), Tumble, Jump;
//  • above it: the kitten-ability portrait (cooldown ring), Milk, a cat-face Meow; contextual "!" Interact while
//    interact:available, a gold Golden Hour button at Valor 100 (with Shard 2);
//  • ❚❚ at the top centre (tap = pause, hold 1 s = skip a cutscene: the ui's skip ring reads the held `pause`);
//  • shown when (pointer: coarse) matches or on the first touchstart; a "rotate" hint in portrait orientation.
import { INPUT, PLAYER } from '../core/config.js';
import { E } from '../core/events.js';
import { SIGNATURE } from '../characters/palette.js';
import { el, flag, setVar, place, setText } from './dom.js';
import { tx } from './text.js';
import { portraitSVG } from './portraits.js';
import * as I from './icons.js';

export const TOUCH = Object.freeze({ stickR: 60, leftFrac: 0.45, deadZone: 0.08 });

/** Joystick vector from a drag offset (px) → {x, y} in [-1, 1] (y+ = forward = drag up) and the clamped knob px. Pure. */
export function stickVector(dx, dy, R = TOUCH.stickR) {
  const L = Math.hypot(dx, dy);
  const k = L > R ? R / L : 1;
  const kx = dx * k, ky = dy * k;
  let x = kx / R, y = -ky / R;
  if (Math.hypot(x, y) < TOUCH.deadZone) { x = 0; y = 0; }
  return { x, y, kx, ky };
}

const BUTTONS = [
  { action: 'attack', cls: 'tb-attack', icon: () => I.sword(), ring: true },
  { action: 'guard', cls: 'tb-guard', icon: () => I.shield() },
  { action: 'dodge', cls: 'tb-dodge', icon: () => I.tumble() },
  { action: 'jump', cls: 'tb-jump', icon: () => I.jump() },
  { action: 'ability', cls: 'tb-ability', icon: () => '', ring: true },
  { action: 'milk', cls: 'tb-milk', icon: () => I.milkBottle(true) },
  { action: 'meow', cls: 'tb-meow', icon: () => I.meowFace() },
  { action: 'interact', cls: 'tb-interact', icon: () => '<b>!</b>' },
  { action: 'golden', cls: 'tb-golden', icon: () => I.sun() },
];

export class TouchControls {
  /** @param {any} ctx @param {HTMLElement} host #touch @param {HTMLElement} uiRoot #ui (for the rotate hint) */
  constructor(ctx, host, uiRoot) {
    this.ctx = ctx; this.host = host;
    this.enabled = false;
    this.root = el('div', 'touch-root', { parent: host });
    this.base = el('div', 'stick-base', { parent: this.root, html: '<div class="stick-knob"></div>' });
    this.knob = this.base.firstChild;
    this.stick = { id: null, ox: 0, oy: 0 };
    this.look = { id: null, x: 0, y: 0 };
    this.cluster = el('div', 'touch-cluster', { parent: this.root });
    this.btns = new Map();
    for (const b of BUTTONS) {
      const e = el('div', `tbtn ${b.cls}`, { parent: this.cluster, html: `${b.ring ? I.ring('tb-ring') : ''}<span class="tb-ico">${b.icon()}</span>` });
      e.dataset.action = b.action;
      this.btns.set(b.action, e);
      this._wireButton(e, b.action);
    }
    this.attackRing = this.btns.get('attack').querySelector('.ring-fg');
    this.abilityRing = this.btns.get('ability').querySelector('.ring-fg');
    this.pauseBtn = el('div', 'tbtn tb-pause', { parent: this.root, html: I.pauseIcon() });
    this._wireButton(this.pauseBtn, 'pause');
    this.rotate = el('div', 'ui-rotate', { parent: uiRoot, html: `<div class="rot-card"><div class="rot-phone"></div><div class="rot-txt"></div></div>` });
    this.rotTxt = this.rotate.querySelector('.rot-txt');
    this._dom = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); this._dom.push(() => t.removeEventListener(ev, fn, o)); };
    on(this.root, 'pointerdown', (e) => this._down(e));
    on(this.root, 'pointermove', (e) => this._move(e));
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) on(this.root, ev, (e) => this._up(e));
    on(window, 'touchstart', () => this.enable(true), { passive: true, once: true });
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

  _wireButton(e, action) {
    const inp = () => this.ctx.input;
    e.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation(); ev.preventDefault();
      try { e.setPointerCapture(ev.pointerId); } catch { /* synthetic events */ }
      inp()?.setVirtual(action, true);
      flag(e, 'is-down', true);       // ability: CompanionManager reads the `ability` action (Q / LT / this portrait)
    });
    const up = (ev) => { ev?.stopPropagation?.(); if (!e.classList.contains('is-down')) return; inp()?.setVirtual(action, false); flag(e, 'is-down', false); };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) e.addEventListener(ev, up);
  }

  _release() {
    const inp = this.ctx.input;
    for (const [a, e] of this.btns) if (e.classList.contains('is-down')) { inp?.setVirtual(a, false); flag(e, 'is-down', false); }
    if (this.stick.id !== null) { this.stick.id = null; flag(this.base, 'is-on', false); inp?.setVirtualMove(0, 0); }
    this.look.id = null;
  }

  _down(e) {
    if (!this.enabled) this.enable(true);
    const W = window.innerWidth;
    if (e.clientX < W * TOUCH.leftFrac && this.stick.id === null) {
      Object.assign(this.stick, { id: e.pointerId, ox: e.clientX, oy: e.clientY });
      place(this.base, e.clientX, e.clientY);
      place(this.knob, 0, 0);
      flag(this.base, 'is-on', true);
    } else if (this.look.id === null) Object.assign(this.look, { id: e.pointerId, x: e.clientX, y: e.clientY });
    try { this.root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    // a tap anywhere advances dialogue
    const m = this.ctx.game?.mode;
    if (m === 'dialog' || m === 'cutscene') this.ctx.input?.pulse?.('confirm');
  }

  _move(e) {
    const inp = this.ctx.input;
    if (e.pointerId === this.stick.id) {
      const R = TOUCH.stickR * this._scale();
      const v = stickVector(e.clientX - this.stick.ox, e.clientY - this.stick.oy, R);
      place(this.knob, v.kx, v.ky);
      inp?.setVirtualMove(v.x, v.y);
    } else if (e.pointerId === this.look.id) {
      inp?.addLook((e.clientX - this.look.x) * INPUT.touchLookSens, (e.clientY - this.look.y) * INPUT.touchLookSens);
      this.look.x = e.clientX; this.look.y = e.clientY;
    }
  }

  _up(e) {
    if (e.pointerId === this.stick.id) { this.stick.id = null; flag(this.base, 'is-on', false); this.ctx.input?.setVirtualMove(0, 0); }
    if (e.pointerId === this.look.id) this.look.id = null;
  }

  _scale() { return this.ctx.state?.settings?.touchSize ?? 1; }

  /** @param {number} dt @param {{ play: boolean, any: boolean }} vis */
  render(dt, vis) {
    if (!this.enabled) { flag(this.rotate, 'is-on', false); return; }
    const ctx = this.ctx, p = ctx.player;
    setVar(this.host, '--ts', this._scale().toFixed(2));
    flag(this.root, 'is-play', !!vis.play);
    flag(this.root, 'is-any', !!vis.any);
    if (!vis.play && (this.stick.id !== null)) this._release();
    // attack charge ring
    const ch = p?.charge ?? 0;
    this.attackRing?.setAttribute('stroke-dashoffset', (I.RING_LEN * (1 - Math.min(1, ch))).toFixed(1));
    flag(this.btns.get('attack'), 'is-charge', ch > 0.02);
    flag(this.btns.get('attack'), 'is-gold', (p?.chargeTier ?? 0) >= 2);
    // ability portrait + ring
    const c = ctx.companions?.active?.[0];
    const ab = this.btns.get('ability');
    flag(ab, 'is-hidden', !c);
    if (c) {
      const id = c.kittenId ?? c.id;
      if (ab._id !== id) { ab._id = id; ab.querySelector('.tb-ico').innerHTML = portraitSVG(id, { expression: 'happy' }); setVar(ab, '--sig', SIGNATURE[id] ?? '#D9B26A'); }
      const r = Math.max(0, Math.min(1, c.readiness ?? 1));
      this.abilityRing?.setAttribute('stroke-dashoffset', (I.RING_LEN * (1 - r)).toFixed(1));
      flag(ab, 'is-nap', (c.napT ?? 0) > 0);
    }
    // contextual buttons
    flag(this.btns.get('interact'), 'is-hidden', !this.interactOn);
    const goldReady = !!p && (p.valor ?? 0) >= PLAYER.valor.max && (ctx.state?.shards ?? 0) >= 2 && !p.golden;
    flag(this.btns.get('golden'), 'is-hidden', !goldReady);
    flag(this.btns.get('milk'), 'is-empty', (p?.milk ?? 0) <= 0);
    // rotate hint (portrait orientation)
    const portrait = window.innerHeight > window.innerWidth * 1.05;
    flag(this.rotate, 'is-on', portrait);
    if (portrait) setText(this.rotTxt, tx(ctx, 'rotate.hint'));
  }

  dispose() {
    this._release();
    for (const off of this._dom) off();
    for (const off of this._offs) off();
    this.root.remove(); this.rotate.remove();
    flag(this.host, 'on', false);
  }
}
