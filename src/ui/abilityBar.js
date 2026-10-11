// src/ui/abilityBar.js  (owner: ui) — research/CONTROLS_SPEC.md §10.1 the LoL-style ability bar (desktop and pad; the
// touch cluster shows the same states), and §10.2 the context cursors.
//
//   [Stand + 3 Grit pips] [Tumble] [Jump] [Kitten portrait] [Golden Hour] | [Milk ×n] [Meow] [Interact]
// Bottom centre, parchment and gold; 56 px slots (48 under 900 px width). Key glyphs follow the preset / device.
// Cooldowns: a clockwise dark sweep (conic-gradient) + whole seconds when ≥ 1 s is left, and a white "ready" flash.
// The companion portrait and the Milk bottles live here on desktop / pad (the HUD hides its own copies).
// Clicking a slot fires it (the `mouseOnly` preset relies on it; harmless elsewhere).
// Data: player.abilityState(out), companions.cooldownLeft / readiness / canCast.
import { E } from '../core/events.js';
import { SIGNATURE } from '../characters/palette.js';
import { el, flag, setVar, setText, pulse } from './dom.js';
import { tx, actionGlyph } from './text.js';
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
  { id: 'interact', icon: () => '<b>E</b>', tip: 'bar.interact' },
];

/** Short readable label for a KeyboardEvent.code / mouse code (the slot corner glyph). Pure. */
export function codeLabel(code) {
  if (!code) return '';
  const m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  const n = /^Digit(\d)$/.exec(code);
  if (n) return n[1];
  return ({ Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', AltLeft: 'Alt', Tab: 'Tab', Escape: 'Esc', Enter: 'Enter',
    Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'M4', Mouse4: 'M5', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', F1: 'F1', Home: 'Home' })[code] ?? code;
}

/** The glyph shown for `action` (active preset bindings on KBM; pad glyphs on pad). */
export function slotGlyph(input, action) {
  const dev = input?.device ?? 'kbm';
  if (dev === 'pad') return actionGlyph(action, 'pad');
  const codes = input?.codesFor?.(action) ?? [];
  const key = codes.find((c) => !c.startsWith('Mouse')) ?? codes[0];
  return key ? codeLabel(key) : actionGlyph(action, 'kbm');
}

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
      e.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); ev.preventDefault(); this._fire(s.id, true); });
      for (const t of ['pointerup', 'pointerleave', 'pointercancel']) e.addEventListener(t, () => this._fire(s.id, false));
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
    if (!on) return;
    const p = ctx.player, s = p?.abilityState ? p.abilityState(this.state) : null;
    if (!s) return;
    const small = typeof innerWidth !== 'undefined' && innerWidth < 900;
    flag(this.root, 'is-small', small);
    const set = (id, cd, max, extra = {}) => {
      const sl = this.slots.get(id);
      const f = max > 0 ? Math.max(0, Math.min(1, cd / max)) : 0;
      setVar(sl.sweep, '--cd', (f * 360).toFixed(1) + 'deg');
      setText(sl.num, cd >= 1 ? String(Math.ceil(cd)) : '');
      flag(sl.el, 'is-cd', cd > 0.02);
      if (sl.wasCd && cd <= 0.02 && max >= 2) pulse(sl.el, 'is-ready');
      sl.wasCd = cd > 0.02;
      setText(sl.key, slotGlyph(input, id));
      for (const [k, v] of Object.entries(extra)) flag(sl.el, k, v);
    };
    set('guard', 0, 0, { 'is-active': !!s.guard, 'is-broken': (s.grit ?? 1) <= 0, 'is-holy': !!s.holyReady });
    set('dodge', s.dodgeCd, s.dodgeMax);
    set('jump', 0, 0);
    set('meow', s.meowCd, s.meowMax);
    set('golden', 0, 0, { 'is-ready': !!s.goldenReady, 'is-locked': !s.goldenReady && s.golden < 1 });
    setVar(this.slots.get('golden').el, '--fill', (s.golden ?? 0).toFixed(3));
    set('milk', 0, 0, { 'is-empty': (s.milk ?? 0) <= 0 });
    setText(this.milkN, `×${s.milk ?? 0}`);
    set('interact', 0, 0, { 'is-lit': this.interactOn });
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
      set('ability', left, max, { 'is-nap': (c.napT ?? 0) > 0 });
      if ((c.napT ?? 0) > 0) setText(ks.num, 'zzz');
    } else set('ability', 0, 0);
  }

  dispose() {
    for (const off of this._offs) off();
    this.root.remove();
  }
}

// ------------------------------------------------------------------ §10.2 cursors
const svgCur = (svg, hx, hy) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${hx} ${hy}, auto`;
const PAW = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g stroke="#2A1E18" stroke-width="1.6"><path d="M4 3l12 21 3-8 8-2z" fill="#E7EAEE"/><path d="M9 26c2 3 6 3 7 0" fill="none" stroke="#F7A8C4" stroke-width="2.4"/></g></svg>';
const SWORD = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g stroke="#2A1E18" stroke-width="1.5"><path d="M3 3l17 17-2.5 2.5L1 6z" fill="#FF6A3D"/><path d="M16 22l6-6 3 3-6 6z" fill="#D9B26A"/><path d="M22 22l6 6" stroke-width="3.2"/></g></svg>';
const SEAL = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g stroke="#2A1E18" stroke-width="1.6"><path d="M4 3l12 21 3-8 8-2z" fill="#E7EAEE"/><circle cx="23" cy="23" r="6.5" fill="#D9566F"/><circle cx="23" cy="23" r="2.4" fill="#F7A8C4" stroke="none"/></g></svg>';
const AMOVE = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g stroke="#2A1E18" stroke-width="1.5"><path d="M3 3l17 17-2.5 2.5L1 6z" fill="#FF3B30"/><path d="M20 26h9M25 22l4 4-4 4" fill="none" stroke-width="2.4"/></g></svg>';
const RET = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g fill="none" stroke="#FFF6E6" stroke-width="2.4"><circle cx="16" cy="16" r="9"/><path d="M16 2v6M16 24v6M2 16h6M24 16h6"/></g><circle cx="16" cy="16" r="2" fill="#FF6A3D"/></svg>';
export const CURSORS = Object.freeze({
  ground: svgCur(PAW, 4, 3), enemy: svgCur(SWORD, 3, 3), breakable: svgCur(SWORD, 3, 3), interact: svgCur(SEAL, 4, 3), npc: svgCur(SEAL, 4, 3),
  pickup: svgCur(SEAL, 4, 3), attackMove: svgCur(AMOVE, 3, 3), aim: svgCur(RET, 16, 16),
});

/**
 * §10.2: the cursor over the game canvas from the hover pick (enemy sword, interactable / NPC wax seal, attack-move
 * arrow, the aim reticle while an ability indicator is open); hidden in cutscenes and Meme Cam; the plain arrow in menus.
 */
export function cursorFor(ctx) {
  const mode = ctx.game?.mode, p = ctx.player;
  if (mode === 'cutscene' || mode === 'memecam' || ctx.cam?.modeName === 'meme') return 'none';
  if (mode !== 'play') return 'default';
  if (ctx.companions?.aim?.active) return CURSORS.aim;
  if (p?.orders?.attackMoveArmed) return CURSORS.attackMove;
  const k = ctx.cam?.hover?.kind ?? 'ground';
  return CURSORS[k] ?? CURSORS.ground;
}
