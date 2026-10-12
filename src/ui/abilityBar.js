// src/ui/abilityBar.js  (owner: ui) — research/CONTROLS_SPEC.md §10.1 the LoL-style ability bar (desktop and pad; the
// touch cluster shows the same states). The §10.2 cursors are in cursor.js.
//
//   [Stand + 3 Grit pips] [Tumble] [Jump] [Kitten portrait] [Golden Hour] | [Milk ×n] [Meow] [Interact]
// Bottom centre, candy skin (WA §4.2: cream slots, 3 px cocoa border, a cocoa lip; geometry unchanged, X22): 56 px
// slots (48 under 900 px width). Key glyphs (white pill keycaps) follow the preset / device.
// Cooldowns [X21]: a clockwise lilac sweep (55 %) run as ONE CSS animation per cooldown start (`@property --cd`,
// `animation-duration` = the time left), never per-frame style writes; whole seconds when ≥ 1 s is left (written on
// whole-second changes only); on ready a scale 1.12 pop + a white shine stripe + a soft tick (ui/glass_001 at −20 dB)
// for cooldowns ≥ 2 s. Hover a slot: a cream tooltip with the move's one-line rule (`bar.*` strings).
// The companion portrait and the Milk bottles live here on desktop / pad (the HUD hides its own copies).
// Clicking a slot fires it (the `mouseOnly` preset relies on it; harmless elsewhere).
// Data: player.abilityState(out), companions.cooldownLeft / readiness / canCast.
import { E } from '../core/events.js';
import { SIGNATURE } from '../characters/palette.js';
import { el, flag, setVar, setText, pulse } from './dom.js';
import { tx, actionGlyph, codeLabel, preferredCode } from './text.js';
import { portraitSVG } from './portraits.js';
import * as I from './icons.js';

/** Slot rows: action, icon, divider before. */
const SLOTS = [
  { id: 'guard', icon: () => I.shield(), tip: 'bar.guard' },
  { id: 'dodge', icon: () => I.tumble(), tip: 'bar.dodge' },
  { id: 'jump', icon: () => I.jump(), tip: 'bar.jump' },
  { id: 'ability', icon: () => '', tip: 'bar.ability' },
  { id: 'golden', icon: () => I.sun(), tip: 'bar.golden' },
  { id: 'milk', icon: () => I.milkBottle(true), tip: 'bar.milk', sep: true },
  { id: 'meow', icon: () => I.meowFace(), tip: 'bar.meow' },
  { id: 'interact', icon: () => I.paw('#6B4A2B'), tip: 'bar.interact' },
];

export { codeLabel };

/** The glyph shown for `action` (active preset bindings on KBM; pad glyphs on pad). */
export function slotGlyph(input, action) {
  const dev = input?.device ?? 'kbm';
  if (dev === 'pad') return actionGlyph(action, 'pad');
  const key = preferredCode(action, input?.codesFor?.(action) ?? []);
  return key ? codeLabel(key) : actionGlyph(action, 'kbm');
}

/**
 * [X21] Should a cooldown sweep (re)start this frame? Pure on the slot record `sl` ({ wasCd, lastCd }): a cooldown
 * that just began, or one that jumped up (re-triggered), returns { deg, dur } (the sweep's start angle and the
 * seconds left); otherwise null (the running CSS animation carries on by itself).
 * @param {{ wasCd?: boolean, lastCd?: number }} sl @param {number} cd seconds left @param {number} max full length
 */
export function cooldownStart(sl, cd, max) {
  if (!(cd > 0.02)) return null;
  if (sl.wasCd && !(cd > (sl.lastCd ?? 0) + 0.05)) return null;
  const f = max > 0 ? Math.max(0, Math.min(1, cd / max)) : 1;
  return { deg: +(f * 360).toFixed(1), dur: +cd.toFixed(2) };
}

/** Tick volume: −20 dB. */
const TICK_VOL = 0.1;

export class AbilityBar {
  /** @param {any} ctx @param {HTMLElement} parent the ui root */
  constructor(ctx, parent) {
    this.ctx = ctx;
    this.root = el('div', 'ability-bar', { parent });
    this.slots = new Map();
    for (const s of SLOTS) {
      if (s.sep) el('div', 'ab-sep', { parent: this.root });
      const e = el('div', `ab-slot ab-${s.id}`, { parent: this.root, html: `<span class="ab-ico">${s.icon()}</span><span class="ab-sweep"></span><span class="ab-num"></span><span class="ab-key"></span>` });
      e.dataset.action = s.id;
      this.slots.set(s.id, { el: e, ico: e.querySelector('.ab-ico'), sweep: e.querySelector('.ab-sweep'), num: e.querySelector('.ab-num'), key: e.querySelector('.ab-key'), wasCd: false });
      // only the slots catch the pointer (the panel and its gutters pass clicks to the world, ui.css); a right click on
      // a slot does nothing (it must never fire an ability by accident)
      e.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); ev.preventDefault(); if (ev.button === 0) this._fire(s.id, true); });
      e.addEventListener('contextmenu', (ev) => ev.preventDefault());
      for (const t of ['pointerup', 'pointerleave', 'pointercancel']) e.addEventListener(t, () => this._fire(s.id, false));
    }
    // §10.1 hover tooltip (parchment, one line)
    this.tip = el('div', 'ab-tip', { parent: this.root });
    for (const [id, sl] of this.slots) {
      const def = SLOTS.find((d) => d.id === id);
      sl.el.addEventListener('pointerenter', (ev) => { if (ev.pointerType !== 'touch') this._showTip(id, def.tip); });
      sl.el.addEventListener('pointerleave', () => this._showTip(null));
    }
    const g = this.slots.get('guard');
    this.gritPips = el('span', 'ab-grit', { parent: g.el });
    this.milkN = el('span', 'ab-count', { parent: this.slots.get('milk').el });
    this.state = {};
    this.interactOn = false;
    this._offs = [
      ctx.bus.on(E.INTERACT_AVAILABLE, () => { this.interactOn = true; }),
      ctx.bus.on(E.INTERACT_CLEAR, () => { this.interactOn = false; }),
      ctx.bus.on(E.PLAYER_PARRY, () => pulse(g.el, 'is-flash')),
    ];
    this._held = new Set();
    /** viewport y (CSS px) of the bar's top edge while it is shown, else null (the camera's safe rect, §2.4) */
    this.topY = null;
    /** CSS px of the canvas bottom the bar covers (kept while a dialogue hides it; 0 on touch); the camera frames above it */
    this.insetBottom = 0;
    this._measT = 0;
  }

  /**
   * Bottom safe inset: CSS px of `rect` (the canvas rect) the bar covers from the bottom; 0 while it is hidden.
   * The bar is re-measured at 4 Hz in render (one layout read), so this is cheap to call every frame.
   * @param {{top:number, height:number}} rect
   */
  safeInset(rect) {
    if (this.topY == null || !rect) return 0;
    return Math.max(0, rect.top + rect.height - this.topY);
  }

  _showTip(id, key) {
    if (!id) { flag(this.tip, 'is-on', false); this._tipId = null; return; }
    this._tipId = id;
    const raw = tx(this.ctx, key), i = raw.indexOf(' · ');
    const head = i > 0 ? raw.slice(0, i) : raw, body = i > 0 ? raw.slice(i + 3) : '';
    const key2 = slotGlyph(this.ctx.input, id);
    this.tip.innerHTML = '';
    el('b', 'ab-tip-h', { parent: this.tip, text: head });
    if (key2) el('kbd', 'ui-key', { parent: this.tip, text: key2 });
    if (body) el('span', 'ab-tip-b', { parent: this.tip, text: body });
    const sl = this.slots.get(id).el;
    setVar(this.tip, '--x', `${sl.offsetLeft + sl.offsetWidth / 2}px`);
    flag(this.tip, 'is-on', true);
  }

  /** A slot click: hold / release the action's virtual source (mouseOnly fires abilities by clicking). */
  _fire(action, on) {
    const inp = this.ctx.input;
    if (!inp?.setVirtual) return;
    if (on) { this._held.add(action); inp._press?.(action, 'bar'); }
    else if (this._held.has(action)) { this._held.delete(action); inp._release?.(action, 'bar'); }
  }

  /** @param {number} dt @param {boolean} visible */
  render(dt, visible) {
    const ctx = this.ctx, input = ctx.input;
    const on = visible && input?.device !== 'touch' && ctx.cam?.isIso !== false;
    flag(this.root, 'is-on', on);
    if (typeof document !== 'undefined') flag(document.body, 'ui-bar', on);
    if (!on) {
      // the reserve stays while a dialogue / menu hides the bar on KBM / pad (no framing jump); 0 on touch / classic
      this.topY = null; this._measT = 0;
      if (input?.device === 'touch' || ctx.cam?.isIso === false) this.insetBottom = 0;
      return;
    }
    // the safe inset: the top of the bar's box (the hover tooltip excluded; the 12 px enter slide included)
    if ((this._measT -= dt) <= 0 || this.topY == null) {
      this._measT = 0.25;
      // shrink to fit a viewport narrower than the bar (offsetWidth ignores the transform; 8 px gutters each side)
      const bw = this.root.offsetWidth, vw = typeof innerWidth !== 'undefined' ? innerWidth : 0;
      const fit = bw > 0 && vw > 0 ? Math.min(1, (vw - 16) / bw) : 1;
      if (fit !== this._fit) { this._fit = fit; setVar(this.root, '--fit', fit.toFixed(3)); }
      const r = this.root.getBoundingClientRect?.();
      this.topY = r && r.height > 0 ? r.top : null;
      const cv = ctx.renderer?.domElement?.getBoundingClientRect?.();
      this.insetBottom = this.safeInset(cv && cv.height > 0 ? cv : { top: 0, height: typeof innerHeight !== 'undefined' ? innerHeight : 720 });
    }
    const p = ctx.player, s = p?.abilityState ? p.abilityState(this.state) : null;
    if (!s) return;
    const small = typeof innerWidth !== 'undefined' && innerWidth < 900;
    flag(this.root, 'is-small', small);
    flag(this.root, 'is-pad', input?.device === 'pad');
    flag(this.root, 'is-mouse-only', input?.preset === 'mouseOnly' || ctx.state?.settings?.controlPreset === 'mouseOnly');
    this._keysDue = (this._keyT = (this._keyT ?? 0) - dt) <= 0;
    if (this._keysDue) this._keyT = 0.5;
    const gd = this._set('guard', 0, 0);
    flag(gd, 'is-active', !!s.guard); flag(gd, 'is-broken', (s.grit ?? 1) <= 0); flag(gd, 'is-holy', !!s.holyReady);
    this._set('dodge', s.dodgeCd, s.dodgeMax);
    this._set('jump', 0, 0);
    this._set('meow', s.meowCd, s.meowMax);
    const go = this._set('golden', 0, 0);
    flag(go, 'is-ready', !!s.goldenReady); flag(go, 'is-locked', !s.goldenReady && s.golden < 1);
    setVar(go, '--fill', (s.golden ?? 0).toFixed(2));
    flag(this._set('milk', 0, 0), 'is-empty', (s.milk ?? 0) <= 0);
    const mn = s.milk ?? 0;
    if (this._milk !== mn) { this._milk = mn; setText(this.milkN, `×${mn}`); }
    flag(this._set('interact', 0, 0), 'is-lit', this.interactOn);
    // grit pips
    const gk = `${s.grit}/${s.gritMax}`;
    if (this.gritPips._k !== gk) {
      this.gritPips._k = gk;
      let h = '';
      for (let i = 0; i < (s.gritMax ?? 3); i++) h += `<i class="${i < (s.grit ?? 0) ? 'f' : ''}"></i>`;
      this.gritPips.innerHTML = h;
    }
    // kitten slot: portrait, cooldown, zzz
    const comp = ctx.companions, c = comp?.active?.[0];
    const ks = this.slots.get('ability');
    flag(ks.el, 'is-empty', !c);
    if (c) {
      const id = c.kittenId ?? c.id;
      if (ks._id !== id) { ks._id = id; ks.ico.innerHTML = portraitSVG(id, { expression: 'happy' }); setVar(ks.el, '--sig', SIGNATURE[id] ?? '#D9B26A'); }
      const left = comp.cooldownLeft?.() ?? 0, r = comp.readiness?.() ?? 1;
      const max = left > 0 && r < 1 ? left / Math.max(1e-3, 1 - r) : 0;
      flag(this._set('ability', left, max), 'is-nap', (c.napT ?? 0) > 0);
      if ((c.napT ?? 0) > 0) setText(ks.num, 'zzz');
    } else this._set('ability', 0, 0);
  }

  /**
   * One slot's cooldown state. [X21] A cooldown that starts (or jumps up) launches one CSS sweep animation from the
   * current fraction to 0 over the time left; nothing is written per frame after that. Returns the slot element.
   */
  _set(id, cd, max) {
    const sl = this.slots.get(id), on = cd > 0.02;
    if (on) {
      const st = cooldownStart(sl, cd, max);
      if (st) { setVar(sl.sweep, '--cd0', `${st.deg}deg`); setVar(sl.sweep, '--cdd', `${st.dur}s`); pulse(sl.sweep, 'is-run'); }
      sl.maxSeen = Math.max(sl.maxSeen ?? 0, max);
    } else if (sl.wasCd) {
      flag(sl.sweep, 'is-run', false);
      if ((sl.maxSeen ?? 0) >= 2) { pulse(sl.el, 'is-flash-ready'); try { this.ctx.audio?.play2D?.('ui/glass_001', { volume: TICK_VOL }); } catch { /* audio optional */ } }
      sl.maxSeen = 0;
    }
    flag(sl.el, 'is-cd', on);
    sl.wasCd = on;
    sl.lastCd = on ? cd : 0;
    const n = cd >= 1 ? Math.ceil(cd) : 0;                       // the label on whole seconds only
    if (sl.n !== n) { sl.n = n; setText(sl.num, n ? String(n) : ''); }
    if (this._keysDue) setText(sl.key, slotGlyph(this.ctx.input, id));   // key glyphs re-read at 2 Hz (no per-frame strings)
    return sl.el;
  }

  dispose() {
    for (const off of this._offs) off();
    this.root.remove();
  }
}

// §10.2 cursors live in cursor.js (re-exported for older callers)
export { CURSORS, cursorFor } from './cursor.js';
