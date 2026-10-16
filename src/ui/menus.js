// src/ui/menus.js  (owner: ui) — every menu screen of §14.3 in the candy skin: the Title (WA §4.3 / ON §3: over the
// live CS-00 with a warm peach rim, the logo pops in at 1.0 s and bobs; NO main-menu panel and NO difficulty picker on a
// new save: one candy button "Tap to play!" / "Press any key to play!" appears at 1.4 s and the whole screen is the hit
// target; with a save, "Keep going!" (with the save line) + "New adventure" (asks "Skip the prologue?" only when the
// save is past the prologue); a 48 px Settings gear top-right (Credits live inside Settings); the co-brand footer: the
// Token Tails logo + 'title.foot', "A Token Tails game"), Settings (§14.3 list + §14.4 accessibility + the camera / performance / calm-HUD rows, saved
// immediately), Pause (Resume · Kittens · Letters · Sticker book · Settings · Return to Pawsbury · Quit to Title), the
// Kittens grid (18 portraits, "???" when missing), Letters, the Sticker book (WA §5.4: flags `sticker.<id>`), Credits
// (scrolls the asset attribution from LICENSES.md), the Vigil Stone menu (Rest · Swap kitten · Difficulty) and Game
// over ("Time for a cat nap.": Wake up · Back to Pawsbury). The first title input unlocks audio and on touch asks for
// fullscreen. New games start at Knight; Kitten mode is offered later, never asked (offer.js).
// Embed mode (`<html data-embed="1">`, set by core when tokentails.com hosts the game in an iframe): the host page owns
// fullscreen and leaving the game, so the touch fullscreen request and the pause menu's Quit to Title are left out.
//
// One stack of screens; keyboard / gamepad navigate through input actions (navUp/Down/Left/Right, confirm, back,
// pause) with hold-repeat, the mouse hovers + clicks, touch taps. `MenuNav` is the pure focus model (node-tested).
import { KITTEN_IDS, KITTENS_BY_LEVEL, LEVEL_IDS } from '../core/config.js';
import { el, flag, setText, setVar, pulse } from './dom.js';
import { tx, esc, actionGlyph, presetGlyph, codeLabel, PRESET_IDS, glyphHtml, glyphWords } from './text.js';
import { codeWords } from './inputGlyph.js';
import { SETTINGS, SETTING_GROUPS, visibleSettings, readSetting, stepSetting, formatSetting, applySetting, settingLocked, sliderFrac, sliderFromFrac, resetSettings, CONTROL_ROWS, controlRowLabel,
  REBIND_ACTIONS, rebindAction, rebindRefusal } from './settings.js';
import { defaultState } from '../core/GameState.js';
import { portraitSVG } from './portraits.js';
import * as I from './icons.js';
import { REWARD_ART } from './celebrate.js';
import { rescueBioHtml, realCat, catPhotoHtml } from './portraits.js';
import { CONTEXT_JINGLES } from '../audio/musicMap.js';
import { BRAND } from '../core/brand.js';

/** WA §4.3 title timings: the logo pops at `logo` s, the button(s) appear at `buttons` s. */
export const TITLE = Object.freeze({ logo: 1.0, buttons: 1.4, quick: 0.35 });

/** The sticker book (ON §7.2 sticker set, in the order they are earned). */
export const STICKER_IDS = Object.freeze(['bonk', 'bow', 'hop', 'roll', 'stand', 'parry', 'found', 'knight', 'mochi']);

/** Sticker-book cells: id, label, colour, owned (flag `sticker.<id>`). Pure. */
export function stickerCells(ctx) {
  return STICKER_IDS.map((id) => ({ id, owned: !!ctx.state?.getFlag?.(`sticker.${id}`), label: tx(ctx, `sticker.${id}`), color: REWARD_ART[id]?.color ?? '#FFE9A8' }));
}

/** True when the game runs inside the Token Tails host page (core sets `<html data-embed="1">`). Node-safe. */
export function embedMode(doc = typeof document !== 'undefined' ? document : null) {
  return doc?.documentElement?.dataset?.embed === '1';
}

/**
 * Pause menu entries after the always-on ones (Resume · Kittens · Letters · Stickers · Settings), as ids. Pure.
 * `hub`: Return to Pawsbury is offered; `embed`: the host page provides the exit, so Quit to Title is left out.
 * @param {{ hub?: boolean, embed?: boolean }} o @returns {string[]}
 */
export function pauseExtras({ hub = false, embed = false } = {}) {
  const out = [];
  if (hub) out.push('hub');
  if (!embed) out.push('quit');
  return out;
}

/**
 * The co-brand line under the title and atop the credits: the Token Tails logo and 'title.foot' ("A Token Tails game").
 * The image is decorative (the text names the brand). Returns HTML.
 * @param {any} ctx
 */
export function coBrandHtml(ctx) {
  const src = ctx?.assets?.url?.('ui/tokentails-logo.webp') ?? 'assets/ui/tokentails-logo.webp';
  return `<img class="tt-logo" src="${esc(src)}" alt="" width="28" height="28" decoding="async" draggable="false"><span class="tt-foot">${esc(tx(ctx, 'title.foot'))}</span>`;
}

/**
 * The Token Tails wordmark for wide title screens (TOKENTAILS-PLAN §10.4; © Token Tails, LICENSES.md). Decorative: the
 * co-brand footer names the brand in text. Returns HTML.
 * @param {any} ctx
 */
export function wordmarkHtml(ctx) {
  const src = ctx?.assets?.url?.('ui/tokentails-logo-text.webp') ?? 'assets/ui/tokentails-logo-text.webp';
  return `<img class="title-wordmark" src="${esc(src)}" alt="" width="600" height="337" decoding="async" draggable="false">`;
}

/**
 * The co-brand pill at the foot of the pause menu and on the results card (TOKENTAILS-PLAN §10.4): the Token Tails
 * logo, "A Token Tails game" and the catnip note ("Catnip here stays in this game for now."). No link out: the host
 * page owns navigation. Returns HTML.
 * @param {any} ctx @param {'pause'|'results'} [where]
 */
export function brandPillHtml(ctx, where = 'pause') {
  const src = ctx?.assets?.url?.('ui/tokentails-logo.webp') ?? 'assets/ui/tokentails-logo.webp';
  const brand = tx(ctx, `${where}.brand`), note = tx(ctx, `${where}.catnipNote`);
  return `<div class="tt-pill tt-pill--${where}"><img class="tt-logo" src="${esc(src)}" alt="" width="22" height="22" decoding="async" draggable="false">`
    + `<span class="tt-pill-txt">${esc(brand === `${where}.brand` ? tx(ctx, 'title.foot') : brand)}</span></div>`
    + (note && note !== `${where}.catnipNote` ? `<p class="tt-note">${I.fish()}<span>${esc(note)}</span></p>` : '');
}

/**
 * The title's buttons for the save state (WA §4.3). Pure: ids only; labels resolve in the menu.
 * @param {boolean} hasSave @returns {string[]}
 */
export function titleButtons(hasSave) { return hasSave ? ['continue', 'newAdventure'] : ['play']; }

export const NAV = Object.freeze({ repeatDelay: 0.38, repeatEvery: 0.11, stick: 0.55 });

/** Pure focus model over a list of items ({ disabled? }). Wraps; skips disabled items. */
export class MenuNav {
  constructor(items = [], index = 0) { this.items = items; this.index = -1; this.set(index); }
  get current() { return this.items[this.index] ?? null; }
  /** Focus `i` (or the next enabled item after it). Returns the focused index. */
  set(i) {
    const n = this.items.length;
    if (!n) { this.index = -1; return -1; }
    for (let k = 0; k < n; k++) { const j = (((i + k) % n) + n) % n; if (!this.items[j]?.disabled) { this.index = j; return j; } }
    this.index = -1; return -1;
  }
  /** Move by `dir` (±1), wrapping and skipping disabled items. Returns true when the focus changed. */
  move(dir) {
    const n = this.items.length;
    if (!n || !dir) return false;
    const from = this.index;
    for (let k = 1; k <= n; k++) {
      const j = ((((from < 0 ? 0 : from) + dir * k) % n) + n) % n;
      if (!this.items[j]?.disabled) { this.index = j; return j !== from; }
    }
    return false;
  }
}

/** Kitten grid cell data (§14.3 Pause → Kittens: name and where found; "???" if missing). Pure. */
export function kittenCells(ctx) {
  const have = new Set(ctx.state?.kittens ?? []);
  return KITTEN_IDS.map((id) => {
    const level = Object.keys(KITTENS_BY_LEVEL).find((l) => KITTENS_BY_LEVEL[l].includes(id)) ?? null;
    const found = have.has(id);
    // TT4 §12.1: a found kitten shows its real Pink Paw cat's name and live status (status '' for snapshot cats)
    const cat = found ? realCat(ctx, id) : null;
    const st = cat && !cat.gone && cat.status ? tx(ctx, `shelter.status.${cat.status}`) : '';
    return { id, found, name: found ? (cat?.name ?? tx(ctx, `name.${id}`)) : tx(ctx, 'pause.missing'), where: found && level ? tx(ctx, `region.${level}`) : '',
      status: st.startsWith('shelter.') ? '' : st };
  });
}

/** Letters list (§6.7): one per level, l1..l6. Pure. */
export function letterCards(ctx) {
  const have = new Set(ctx.state?.letters ?? []);
  return LEVEL_IDS.map((lv, i) => {
    const id = `l${i + 1}`, found = have.has(id);
    return { id, found, level: lv, title: found ? tx(ctx, `letter.${id}.title`) : tx(ctx, 'pause.missing'), text: found ? tx(ctx, `letter.${id}`) : '' };
  });
}

/**
 * @typedef {object} Item
 * @property {HTMLElement} el
 * @property {() => void} [activate]
 * @property {(dir: number) => void} [adjust]
 * @property {boolean} [disabled]
 */
/**
 * @typedef {object} Screen
 * @property {string} id @property {HTMLElement} el @property {Item[]} items @property {MenuNav} nav
 * @property {() => boolean|void} [back]  return false to block
 * @property {'title'|'pause'|'modal'} layer
 * @property {() => void} [onClose]
 */

export class Menus {
  /**
   * @param {any} ctx @param {HTMLElement} parent
   * @param {any} ui  the UI facade (flows: startNewGame, continueGame, resume, quitToTitle, retry, toHub, sfx, hasSave)
   */
  constructor(ctx, parent, ui) {
    this.ctx = ctx; this.ui = ui;
    this.root = el('div', 'ui-menus', { parent });
    this.backdrop = el('div', 'menu-backdrop', { parent: this.root });
    this.titleEl = el('div', 'ui-title', { parent: this.root });
    // WA §4.3: no dark `.title-shade` any more: a static warm peach rim
    // TOKENTAILS-PLAN §10.4: the tagline under the logo, the Token Tails wordmark on wide screens
    this.titleEl.innerHTML = `<div class="title-rim"></div><div class="title-logo">${I.logoHtml(tx(ctx, 'game.title'), esc(tx(ctx, 'game.subtitle')))}`
      + `<div class="title-tagline">${esc(tx(ctx, 'title.tagline'))}</div></div>${wordmarkHtml(ctx)}`
      + `<div class="title-press"><span class="press-paw">${I.paw('#FFF6DA')}</span><span class="press-txt"></span></div>`
      + `<button type="button" class="title-gear" aria-label="${esc(tx(ctx, 'title.settings'))}">${I.gear()}</button>`
      + `<div class="title-foot tt-cobrand">${coBrandHtml(ctx)}</div>`;
    this.pressTxt = this.titleEl.querySelector('.press-txt');
    this.gearEl = this.titleEl.querySelector('.title-gear');
    this.stack = /** @type {Screen[]} */ ([]);
    this.titleActive = false; this.titleT = 0; this.titlePress = false;
    this._inputGuard = 0;
    this._rep = { dir: 0, t: 0, axis: '' };
    this._domOffs = [];
    if (typeof window !== 'undefined') {
      // WA §4.3: before the buttons, any key / tap opens them (or, without a save, plays); on the one-button home any
      // key plays ("Press any key to play!") and the whole screen is the hit target
      const onKey = (e) => {
        if (!this.titleActive || e.repeat) return;
        // a focused "Skip practice" link takes its own Enter / Space (the click handler starts the game)
        if (typeof document !== 'undefined' && document.activeElement?.closest?.('.title-skip') && (e.key === 'Enter' || e.key === ' ')) return;
        if (!this.stack.length) this._titleGo(e);
        else if (this.top?.anyKey && e.key !== 'Escape' && e.key !== 'Tab') this._homePlay(e);
      };
      const onPtr = (e) => {
        if (!this.titleActive || e.target?.closest?.('.title-gear, .title-skip')) return;
        if (!this.stack.length) this._titleGo(e);
        else if (this.top?.anyKey) this._homePlay(e);
      };
      this.gearEl?.addEventListener('click', (e) => { e.stopPropagation(); if (this.titleActive && !this.has('settings')) { this.sfx('ui.confirm'); this.openSettings(); } });
      window.addEventListener('keydown', onKey);
      this._ptr = null;   // last known cursor position (hover arming compares against it when a screen opens)
      const onMove = (e) => { this._ptr = { x: e.clientX, y: e.clientY }; };
      window.addEventListener('pointermove', onMove, { capture: true, passive: true });
      this._domOffs.push(() => window.removeEventListener('pointermove', onMove, { capture: true }));
      this.titleEl.addEventListener('pointerdown', onPtr);
      this._domOffs.push(() => window.removeEventListener('keydown', onKey));
    }
  }

  get active() { return this.titleActive || this.stack.length > 0; }
  get top() { return this.stack[this.stack.length - 1] ?? null; }
  /** Is a pause-type screen (world frozen by the ui) open? */
  get paused() { return this.stack.some((s) => s.layer === 'pause'); }
  has(id) { return this.stack.some((s) => s.id === id); }

  sfx(id) { this.ui.sfx?.(id); }

  // ------------------------------------------------------------------ stack
  push(s, { sound = 'ui.page' } = {}) {
    const prev = this.top;
    if (prev) flag(prev.el, 'is-on', false);
    this.stack.push(s);
    this.root.appendChild(s.el);
    s.nav ??= new MenuNav(s.items, s.focus ?? 0);
    s.hoverArmed = false;
    s.ptrAt = this._ptr ? { x: this._ptr.x, y: this._ptr.y } : null;
    this._focus(s, s.nav.index, false);
    this._inputGuard = 1;            // the edge that opened this screen must not also activate its first item
    requestFrame(() => { if (this.top === s) flag(s.el, 'is-on', true); });   // a screen pushed on top meanwhile keeps this one hidden
    this._sync();
    if (sound) this.sfx(sound);
    return s;
  }

  pop({ sound = 'ui.back' } = {}) {
    const s = this.stack.pop();
    if (!s) return;
    s.onClose?.();
    s.el.remove();
    const top = this.top;
    if (top) { this._refresh(top); flag(top.el, 'is-on', true); }
    this._sync();
    if (sound) this.sfx(sound);
  }

  /** Close every screen (and the title). */
  closeAll() {
    while (this.stack.length) { const s = this.stack.pop(); s.onClose?.(); s.el.remove(); }
    this.setTitle(false);
    this._sync();
  }

  /** Pop screens down to (and excluding) the first with `layer` (or all). */
  popLayer(layer) {
    while (this.stack.length && this.top.layer === layer) { const s = this.stack.pop(); s.onClose?.(); s.el.remove(); }
    if (this.top) { this._refresh(this.top); flag(this.top.el, 'is-on', true); }
    this._sync();
  }

  _sync() {
    const any = this.stack.length > 0;
    flag(this.root, 'is-on', this.active);
    flag(this.backdrop, 'is-on', any && !this.titleActive);
    flag(this.backdrop, 'is-dark', this.stack.some((s) => s.dark));
    flag(this.titleEl, 'has-menu', this.titleActive && any && this.top?.id !== 'main');   // the home keeps the big logo
    flag(this.titleEl, 'has-home', this.titleActive && this.has('main'));
  }

  _focus(s, i, sound = true) {
    if (!s) return;
    if (i !== s.nav.index) s.nav.set(i);
    s.items.forEach((it, k) => flag(it.el, 'is-focus', k === s.nav.index));
    const cur = s.nav.current;
    if (cur?.el?.scrollIntoView && s.scroll) cur.el.scrollIntoView({ block: 'nearest' });
    s.onFocus?.(cur);
    if (sound) this.sfx('ui.click');
  }

  _refresh(s) { for (const it of s.items) it.refresh?.(); }

  // ------------------------------------------------------------------ input (fixed step; menus own input while open)
  /** @param {any} input @param {number} dt */
  update(input, dt) {
    if (!input) return;
    if (this._inputGuard > 0) { this._inputGuard--; return; }
    if (this.titleActive && !this.stack.length) {
      // gamepads have no DOM event: any button press starts
      if (this.titleT > 0.4 && input.device === 'pad' && input.anyActivity?.()) this._titleGo(null);
      return;
    }
    const s = this.top;
    if (!s) return;
    // WA §4.3: "Press any key to play!" on the one-button home also means any pad button
    if (s.anyKey && input.device === 'pad' && this.titleT > 0.4 && (input.pressed('confirm') || input.pressed('jump') || input.pressed('attack') || input.pressed('pause'))) { this._homePlay(null); return; }
    // vertical navigation with hold-repeat (keys / d-pad; the left stick when a pad is in use)
    const pad = input.device === 'pad';
    const my = pad ? (input.move?.y ?? 0) : 0, mx = pad ? (input.move?.x ?? 0) : 0;
    // edges count too: a key pressed and released between two fixed steps is never `down` during a step
    const held = (a) => input.pressed(a) || input.down(a);
    const v = held('navUp') || my > NAV.stick ? -1 : held('navDown') || my < -NAV.stick ? 1 : 0;
    const h = held('navLeft') || mx < -NAV.stick ? -1 : held('navRight') || mx > NAV.stick ? 1 : 0;
    const fire = (axis, dir) => {
      const r = this._rep;
      if (dir === 0) { if (r.axis === axis) { r.dir = 0; r.axis = ''; } return false; }
      const edge = axis === 'v' ? input.pressed(dir < 0 ? 'navUp' : 'navDown') : input.pressed(dir < 0 ? 'navLeft' : 'navRight');
      if (r.axis !== axis || r.dir !== dir || edge) { r.axis = axis; r.dir = dir; r.t = NAV.repeatDelay; r.fc = this.ctx.game?.frameCount; return true; }
      // hold-repeat counts rendered frames, not catch-up steps: a long (loaded) frame that runs many fixed steps
      // between a key's down and up events must not read as a held key
      const fc = this.ctx.game?.frameCount;
      if (fc != null && r.fc === fc) return false;
      r.fc = fc;
      r.t -= dt;
      if (r.t <= 0) { r.t = NAV.repeatEvery; return true; }
      return false;
    };
    if (fire('v', v)) { const step = s.vstep ? s.vstep(s.nav.index, v) : (s.cols ?? 1); if (s.nav.move(v * step)) this._focus(s, s.nav.index); }
    const cur = s.nav.current;
    if (fire('h', h)) {
      if (cur?.adjust) cur.adjust(h);
      else if (s.cols && s.cols > 1 && s.nav.move(h)) this._focus(s, s.nav.index);
    }
    if (input.pressed('confirm') || (input.pressed('jump') && input.device === 'pad')) {
      if (cur && !cur.disabled) { if (cur.activate) { this.sfx('ui.confirm'); cur.activate(); } else if (cur.adjust) cur.adjust(1); }
    } else if (input.pressed('back') || input.pressed('pause')) {
      this.back();
    }
  }

  back() {
    const s = this.top;
    if (!s) return;
    if (s.back) { if (s.back() === false) return; } else this.pop();
  }

  render(dt) {
    if (this.titleActive) {
      this.titleT += dt;
      const quick = this.titleEl.classList.contains('is-quick');
      const dev = this.ctx.input?.device ?? 'kbm';
      if (this._lblDev !== dev) { this._lblDev = dev; this._homeLabel(); this._pressLabel(); }
      const logo = this.titleT >= (quick ? 0 : TITLE.logo);
      flag(this.titleEl, 'is-logo', logo);
      if (logo && !this._jingleDone && !this._jinglePending) this._jingle();
      // WA §4.3: the candy button(s) appear by themselves at 1.4 s (story's press:false holds them back)
      if (!this.stack.length && this.pressForced !== false && this.titleT >= (quick ? TITLE.quick : TITLE.buttons)) this._openHome();
    }
  }

  // ------------------------------------------------------------------ title
  /** Title screen on / off. `quick`: the logo is already due (CS-00 timed it), so it fades in without the 1.5 s wait. */
  setTitle(on, { quick = false } = {}) {
    on = !!on;
    if (this.titleActive === on) return;
    this.titleActive = on; this.titleT = 0; this.pressText = null; this.pressForced = null;
    this._jingleDone = false; this._jinglePending = false;
    flag(this.titleEl, 'is-on', on);
    flag(this.titleEl, 'is-quick', on && quick);
    flag(this.titleEl, 'is-ready', false);
    this._pressLabel();
    this._sync();
  }

  /** story's `press` command: show the prompt now (text, or null = the default), or hide it (false). */
  setPress(p) {
    if (p === false) { this.pressForced = false; flag(this.titleEl, 'is-ready', false); return; }
    this.pressForced = true;
    if (typeof p === 'string' && p) this.pressText = p;
    this._pressLabel();
    flag(this.titleEl, 'is-ready', true);
  }

  _pressLabel() {
    const dev = this.ctx.input?.device ?? 'kbm';
    setText(this.pressTxt, dev === 'touch' ? tx(this.ctx, 'title.tap') : tx(this.ctx, 'title.press'));
  }

  /** The first title input: audio unlock, fullscreen on touch, then the home (or play, without a save). */
  _titleGo(e) {
    if (this.titleT < 0.25) return;
    this._unlock(e);
    this.openMain();
  }

  /**
   * The Token Tails jingle on the title reveal (TOKENTAILS-PLAN §10.4; audio/musicMap CONTEXT_JINGLES.title). Browsers
   * keep audio locked until the first gesture, so a reveal before it waits and plays on the unlock instead.
   */
  _jingle() {
    const a = this.ctx.audio;
    if (!a?.ready) { this._jinglePending = true; return; }
    this._jinglePending = false; this._jingleDone = true;
    try { a.glock?.(CONTEXT_JINGLES.title, { volume: 0.8 }); } catch { /* audio optional */ }
  }

  _unlock(e) {
    try {
      const p = this.ctx.audio?.unlock?.();
      if (this._jinglePending && !this._jingleDone) Promise.resolve(p).then(() => { if (this._jinglePending && !this._jingleDone) this._jingle(); }).catch(() => {});
    } catch { /* audio optional */ }
    if (e && e.pointerType === 'touch' && typeof document !== 'undefined' && !document.fullscreenElement && !embedMode()) {
      try { document.documentElement.requestFullscreen?.()?.catch?.(() => {}); } catch { /* not allowed */ }
    }
  }

  /** "Tap to play!" / any key on the one-button home (no save). */
  _homePlay(e) {
    if (this._starting || this.titleT < 0.25) return;
    this._unlock(e);
    const it = this.top?.items?.[0];
    if (it?.activate) { this.sfx('ui.confirm'); it.activate(); }
  }

  // ------------------------------------------------------------------ builders
  /** Panel shell. */
  _panel(id, title, cls = '') {
    const e = el('div', `ui-screen menu-screen menu--${id} ${cls}`);
    const p = el('div', 'panel menu-panel', { parent: e });
    if (title) el('div', 'menu-title', { parent: p, html: `<span>${esc(title)}</span>` });
    const body = el('div', 'menu-body', { parent: p });
    return { e, p, body };
  }

  /** A candy-ribbon button item. */
  _button(parent, label, activate, { disabled = false, cls = '', sub = '' } = {}) {
    const b = el('button', `mi btn btn--candy ${cls}`, { parent, attrs: { type: 'button' }, html: `<span class="btn-lbl">${esc(label)}</span>${sub ? `<span class="btn-sub">${esc(sub)}</span>` : ''}` });
    const it = { el: b, activate, disabled };
    if (disabled) b.classList.add('is-disabled');
    return it;
  }

  _wire(s) {
    s.items.forEach((it, i) => {
      // Hover focuses only after the pointer really moved since the screen opened: Chrome fires enter/move events for a
      // panel that appears under a resting cursor (pointer lock releases it mid-screen), which would steal focus from
      // the first item (Resume) and send a pad / keyboard confirm to the wrong screen.
      it.el.addEventListener('pointermove', (e) => {
        if (this.top !== s || it.disabled) return;
        if (!s.hoverArmed) {
          const at = s.ptrAt;
          const moved = (e.movementX || 0) !== 0 || (e.movementY || 0) !== 0 || (at && (e.clientX !== at.x || e.clientY !== at.y));
          if (!moved) return;
          s.hoverArmed = true;
        }
        if (s.nav.index !== i) this._focus(s, i);
      });
      it.el.addEventListener('click', (e) => {
        if (this.top !== s || it.disabled) { if (it.disabled) this.sfx('ui.error'); return; }
        if (e.target.closest?.('.ch-l')) { it.adjust?.(-1); return; }
        if (e.target.closest?.('.ch-r')) { it.adjust?.(1); return; }
        if (it.slider) return;
        this._focus(s, i, false);
        if (it.activate) { this.sfx('ui.confirm'); it.activate(); } else it.adjust?.(1);
      });
    });
    return s;
  }

  /**
   * The title input (story's "any key" → ui.openMainMenu, or our own listeners): open the home; without a save a
   * gesture IS "Tap to play!" (WA §4.3: the whole screen is the hit target).
   */
  openMain() {
    this.setTitle(true);
    if (!this.ui.hasSave?.()) { if (!this._starting) this._play(); return; }
    this._openHome();
  }

  /** WA §4.3 the title home: one candy button (no save) or "Keep going!" + "New adventure"; no panel, no picker. */
  _openHome() {
    if (this.has('main')) return;
    const ctx = this.ctx;
    const e = el('div', 'ui-screen menu-screen menu--main menu--home menu--title');
    const row = el('div', 'home-row', { parent: e });
    const items = [];
    const hasSave = !!this.ui.hasSave?.();
    for (const id of titleButtons(hasSave)) {
      if (id === 'play') {
        const it = this._button(row, '', () => this._play(), { cls: 'btn--home btn--play' });
        it.el.insertAdjacentHTML('afterbegin', `<span class="btn-paw">${I.paw('#FFFFFF')}</span>`);
        this._playLbl = it.el.querySelector('.btn-lbl');
        items.push(it);
      } else if (id === 'continue') items.push(this._button(row, tx(ctx, 'menu.continue'), () => this._go(() => this.ui.continueGame()), { cls: 'btn--home', sub: continueSub(ctx, this.ui.resumePoint ?? this.ui.saveSummary?.()) }));
      else items.push(this._button(row, tx(ctx, 'menu.newGame'), () => this._newAdventure(), { cls: 'btn--home btn--sky' }));
    }
    this._homeLabel();
    // TOKENTAILS-PLAN §10.3 / §10.7: new players may skip Morning Practice (story.newGame({ skipPractice }), G2)
    if (!hasSave) {
      const skip = el('button', 'title-skip', { parent: e, attrs: { type: 'button' }, html: `<span>${esc(tx(ctx, 'title.skipPractice'))}</span><span class="title-skip-arr" aria-hidden="true">▸▸</span>` });
      skip.addEventListener('click', (ev) => { ev.stopPropagation(); if (this.titleActive) { this._unlock(ev); this.sfx('ui.confirm'); this._skipPractice(); } });
    }
    this.push(this._wire({ id: 'main', el: e, items, layer: 'title', anyKey: !hasSave, back: () => false }), { sound: null });
  }

  /** "Skip practice": a new game that starts after Morning Practice (story's newGame({ skipPractice }) when it has one). */
  _skipPractice() {
    const story = this.ctx.story;
    if (typeof story?.newGame !== 'function') { this._play(); return; }
    this._go(async () => {
      this.closeAll();
      try { this.ui._giveBackMode?.(); } catch { /* ui optional */ }
      this.ui.resumePoint = null;
      await story.newGame({ difficulty: 'knight', skipPractice: true });
    });
  }

  /** The one button follows the device: "Tap to play!" / "Press any key to play!". */
  _homeLabel() {
    if (!this._playLbl) return;
    setText(this._playLbl, (this.ctx.input?.device ?? 'kbm') === 'touch' ? tx(this.ctx, 'title.tap') : tx(this.ctx, 'title.press'));
  }

  /** Run a start flow once (a double tap / key repeat must not start two games). */
  _go(fn) {
    if (this._starting) return;
    this._starting = true;
    Promise.resolve().then(fn).catch((e) => console.warn('[ui] start failed', e)).finally(() => { this._starting = false; });
  }

  /** A new save: straight into Morning Practice at Knight (ON §3.3: offer, don't ask). */
  _play() { this._go(() => this.ui.startNewGame({ difficulty: 'knight', skipPrologue: false })); }

  /** "New adventure" with a save: ask "Skip the prologue?" only when that save is past the prologue (ON §3.3). */
  _newAdventure() {
    if (!this.ui.savePastPrologue?.()) { this._play(); return; }
    const ctx = this.ctx;
    const { e, body } = this._panel('skip', tx(ctx, 'newgame.skipPrologue'), 'menu--title menu--small');
    const items = [
      this._button(body, tx(ctx, 'menu.yes'), () => this._go(() => this.ui.startNewGame({ difficulty: 'knight', skipPrologue: true }))),
      this._button(body, tx(ctx, 'menu.no'), () => this._play(), { cls: 'btn--sky' }),
    ];
    this.push(this._wire({ id: 'skip', el: e, items, layer: 'title', focus: 1 }));
  }

  openNewGame() {
    const ctx = this.ctx;
    const { e, body } = this._panel('newgame', tx(ctx, 'difficulty.title'), 'menu--title');
    const items = [];
    for (const d of ['kitten', 'knight', 'nine']) {
      const b = this._button(body, tx(ctx, `difficulty.${d}`), () => this._chooseDifficulty(d), { cls: `btn--card diff--${d}`, sub: tx(ctx, `difficulty.${d}.desc`) });
      items.push(b);
    }
    items.push(this._button(body, tx(ctx, 'menu.back'), () => this.pop(), { cls: 'btn--plain' }));
    this.push(this._wire({ id: 'newgame', el: e, items, layer: 'title', focus: 1 }));
  }

  _chooseDifficulty(d) {
    const ctx = this.ctx;
    if (!this.ui.hasSave?.()) { this.ui.startNewGame({ difficulty: d, skipPrologue: false }); return; }
    const { e, body } = this._panel('skip', tx(ctx, 'newgame.skipPrologue'), 'menu--title menu--small');
    const items = [
      this._button(body, tx(ctx, 'menu.yes'), () => this.ui.startNewGame({ difficulty: d, skipPrologue: true })),
      this._button(body, tx(ctx, 'menu.no'), () => this.ui.startNewGame({ difficulty: d, skipPrologue: false })),
    ];
    this.push(this._wire({ id: 'skip', el: e, items, layer: 'title', focus: 1 }));
  }

  openSettings() {
    const ctx = this.ctx;
    const layer = this.top?.layer === 'pause' ? 'pause' : this.titleActive ? 'title' : 'modal';
    const { e, body } = this._panel('settings', tx(ctx, 'settings.title'), layer === 'title' ? 'menu--title' : '');
    body.classList.add('menu-scroll');
    const items = [];
    let group = '';
    const iso = ctx.cam?.isIso !== false;
    // rows that do nothing on the current device are hidden; on touch the Controls group (touch rows first) leads
    const dev = ctx.input?.device ?? 'kbm', touch = dev === 'touch';
    // §9.2 Edit layout (touch): drag the cluster buttons; stored in settings.touchLayout
    const canEdit = !!this.ui.touch?.enabled && layer !== 'title';
    const editBtn = () => items.push(this._button(body, tx(ctx, 'ui.touch.edit'), () => this.ui.editTouchLayout?.(), { cls: 'btn--plain' }));
    const cardBtn = () => items.push(this._button(body, tx(ctx, 'ui.settings.controls'), () => this.openControls(), { cls: 'btn--plain' }));
    const touchExtras = () => { if (canEdit) editBtn(); cardBtn(); };   // on touch they close the leading Controls group
    for (const def of visibleSettings(iso, dev)) {
      if (def.group !== group) {
        if (touch && group === 'controls') touchExtras();
        group = def.group; el('div', 'srow-group', { parent: body, text: SETTING_GROUPS[group] ?? group });
      }
      items.push(this._settingRow(body, def));
      if (def.key === 'quality') {          // §14.3 language placeholder [STRETCH]: shown, not changeable yet
        const row = el('div', 'mi srow srow--choice is-disabled srow--lang', { parent: body });
        row.innerHTML = `<span class="srow-lbl">${esc(tx(ctx, 'ui.settings.language'))}</span><div class="srow-ctl"><span class="ch"><span class="ch-val">${esc(tx(ctx, 'ui.settings.languageVal'))}</span></span></div>`;
        items.push({ el: row, disabled: true });
      }
    }
    if (touch && group === 'controls') touchExtras();   // (only if Controls were the whole list)
    else if (!touch) {
      el('div', 'srow-group', { parent: body, text: tx(ctx, 'ui.settings.controls') });
      cardBtn();
      if (canEdit) editBtn();
    }
    // WA §4.3: Credits live inside Settings now
    items.push(this._button(body, tx(ctx, 'menu.credits'), () => this.openCredits(), { cls: 'btn--plain' }));
    items.push(this._button(body, tx(ctx, 'ui.settings.reset'), () => this.openConfirm(tx(ctx, 'ui.settings.resetConfirm'), () => {
      resetSettings(ctx, defaultState().settings);
      if (this.top) this._refresh(this.top);
    }), { cls: 'btn--plain' }));
    items.push(this._button(body, tx(ctx, 'menu.back'), () => this.pop(), { cls: 'btn--plain' }));
    this.push(this._wire({ id: 'settings', el: e, items, layer, scroll: true }));
  }

  /**
   * Controls card (CONTROLS_SPEC §10.7: one page per preset / pad / touch): every action with its glyph on keyboard +
   * mouse (the previewed preset; ◀ ▶ flips through the five), gamepad and touch; the active device is highlighted.
   * TT3 §11.5 K8: on the active preset the keyboard-and-mouse cells of REBIND_ACTIONS are buttons: click (or Enter)
   * one, then press a key or mouse button ("Press a key"); a key another action used is swapped; Ctrl, Alt, Meta, the
   * F-keys and Esc are refused (Esc cancels), so are the walking keys; "Reset keys to default" clears the bindings.
   */
  openControls() {
    const ctx = this.ctx, dev = ctx.input?.device ?? 'kbm';
    const layer = this.top?.layer ?? 'modal';
    const { e, body } = this._panel('controls', tx(ctx, 'ui.controls.title'), `menu--wide${layer === 'title' ? ' menu--title' : ''}${dev === 'touch' ? ' is-touch' : dev === 'pad' ? ' is-pad' : ''}`);
    const ps = ctx.input?.padKind === 'ps';
    /** TT6: a cell is an input icon (mouse with a lit button, keycap, pad button, the touch button), never "RMB". */
    const cellHtml = (g, d, act) => (g === '—' ? '<span class="ctl-na" aria-label="not used">—</span>' : glyphHtml(g, d, { action: act, ps: d === 'pad' && ps, cls: 'ctl-ig' }));
    const presetDef = SETTINGS.find((d) => d.key === 'controlPreset');
    const active = () => ctx.input?.preset ?? ctx.state?.settings?.controlPreset ?? 'hybrid';
    let preset = active();
    if (!PRESET_IDS.includes(preset)) preset = 'hybrid';
    const pick = el('div', 'mi srow srow--choice ctl-preset', { parent: body });
    pick.innerHTML = `<span class="srow-lbl">${esc(tx(ctx, 'ui.controls.preset'))}</span><div class="srow-ctl"><span class="ch"><span class="ch-l">◀</span><span class="ch-val"></span><span class="ch-r">▶</span></span></div>`;
    const msg = el('div', 'ctl-msg', { parent: body, attrs: { 'aria-live': 'polite' } });
    const tbl = el('div', 'ctl-table menu-scroll', { parent: body });
    // TT6: the device in use comes first (a phone player reads the touch column first)
    const devs = [dev, ...['kbm', 'pad', 'touch'].filter((d) => d !== dev)];
    const devName = { kbm: 'Keyboard and mouse', pad: 'Gamepad', touch: 'Touch' };
    const head = el('div', 'ctl-row ctl-head', { parent: tbl });
    head.innerHTML = `<span></span>${devs.map((d) => `<span class="${d === dev ? 'is-dev' : ''}" role="img" aria-label="${devName[d]}" title="${devName[d]}">${d === 'kbm' ? I.keyboardIco() : d === 'pad' ? I.padIco() : I.touchIco()}</span>`).join('')}`;
    /** @type {Map<string, { row: HTMLElement, kbm: HTMLElement, bind: HTMLButtonElement|null, label: string }>} */
    const rows = new Map();
    const bindItems = [];
    for (const [act, label] of CONTROL_ROWS) {
      const row = el('div', 'ctl-row', { parent: tbl, attrs: { 'data-act': act } });
      const lbl = controlLabel(ctx, act, controlRowLabel(act, label, dev));
      el('span', 'ctl-lbl', { parent: row, text: lbl });
      let kbm = null, bind = null;
      for (const d of devs) {
        const cell = el('span', d === dev ? 'is-dev' : '', { parent: row });
        if (d === 'kbm') {
          kbm = cell;
          if (REBIND_ACTIONS.includes(act)) {
            bind = el('button', 'mi ctl-bind', { parent: cell, attrs: { type: 'button', 'data-act': act, 'aria-label': `${lbl}: change key` } });
            bindItems.push({ el: bind, disabled: false, activate: () => capture(act) });
          }
        } else {
          cell.innerHTML = cellHtml(actionGlyph(act, d), d, act);
        }
      }
      rows.set(act, { row, kbm, bind, label: lbl.split(' · ')[0] });
    }
    const note = el('div', 'ctl-note', { parent: body, text: tx(ctx, 'ui.controls.sticky') });
    void note;
    const say = (key, vars) => setText(msg, key ? tx(ctx, key, vars) : '');
    const draw = () => {
      const i = PRESET_IDS.indexOf(preset), live = preset === active();
      setText(pick.querySelector('.ch-val'), formatSetting(presetDef, preset, (k) => tx(ctx, k)) + (live ? ' ✓' : ''));
      flag(pick, 'is-first', i <= 0); flag(pick, 'is-last', i >= PRESET_IDS.length - 1);
      const bindings = ctx.state?.settings?.bindings ?? null;
      for (const [act, r] of rows) {
        const g = presetGlyph(act, preset, bindings);
        const cap = cellHtml(g, 'kbm', act);
        if (r.bind) {
          r.bind.innerHTML = cap;
          r.bind.setAttribute('aria-label', `${r.label}: ${glyphWords(g, 'kbm') || 'not set'}. Change key`);
          flag(r.bind, 'is-disabled', !live);
          r.bind.disabled = !live;
          const it = bindItems.find((x) => x.el === r.bind);
          if (it) it.disabled = !live;
        } else r.kbm.innerHTML = cap;
      }
      flag(resetIt.el, 'is-disabled', !live || !Object.keys(bindings ?? {}).length);
      resetIt.disabled = !live;
      if (!this._cap && msgFor !== preset) { msgFor = preset; say(live ? 'ui.controls.rebindHint' : null); }
    };
    let msgFor = null;
    // ---- "Press a key": a capture-phase listener takes the next key / mouse button before the game and the menus
    const stop = (mouse = false) => {
      const c = this._cap;
      if (!c) return;
      this._cap = null;
      window.removeEventListener('keydown', c.onKey, true);
      window.removeEventListener('mousedown', c.onMouse, true);
      window.removeEventListener('contextmenu', c.noMenu, true);
      flag(rows.get(c.act)?.bind, 'is-capturing', false);
      if (!mouse || typeof window === 'undefined') return;
      // the click that follows a captured mouse button must not re-open the capture or press a menu button
      const swallow = (ev) => { ev.preventDefault(); ev.stopImmediatePropagation(); window.removeEventListener('click', swallow, true); };
      window.addEventListener('click', swallow, true);
      setTimeout(() => window.removeEventListener('click', swallow, true), 350);
    };
    const finish = (act, code) => {
      const lbl = rows.get(act)?.label ?? act;
      const why = rebindRefusal(code, { wasd: ctx.input?.wasd !== false });
      if (why) { say(why === 'walk' ? 'ui.controls.walk' : 'ui.controls.refused', { key: codeWords(code, codeLabel(code)) }); this.sfx('ui.error'); return; }
      const table = ctx.input?.keyTable ?? {};
      const r = rebindAction(table, ctx.state?.settings?.bindings ?? null, act, code);
      stop(code.startsWith('Mouse'));
      applySetting(ctx, 'bindings', r.bindings);
      this.sfx('ui.confirm');
      if (r.swapped.length) {
        const other = r.swapped.find((a) => rows.has(a)) ?? r.swapped[0];
        say('ui.controls.swapped', { other: rows.get(other)?.label ?? other, key: glyphWords(presetGlyph(other, active(), r.bindings), 'kbm') });
      } else say('ui.controls.saved', { action: lbl, key: codeWords(code, codeLabel(code)) });
      draw();
    };
    const capture = (act) => {
      if (preset !== active() || typeof window === 'undefined') return;
      stop();
      const c = { act };
      c.onKey = (ev) => {
        ev.preventDefault(); ev.stopImmediatePropagation();
        if (ev.repeat) return;
        if (ev.code === 'Escape') { stop(); say('ui.controls.rebindHint'); return; }
        if (ev.ctrlKey || ev.metaKey || ev.altKey) { say('ui.controls.refused', { key: (ev.ctrlKey ? 'Control + ' : ev.metaKey ? 'Command + ' : 'Alt + ') + codeWords(ev.code, codeLabel(ev.code)) }); this.sfx('ui.error'); return; }
        finish(act, ev.code);
      };
      c.onMouse = (ev) => { ev.preventDefault(); ev.stopImmediatePropagation(); finish(act, 'Mouse' + ev.button); };
      c.noMenu = (ev) => ev.preventDefault();
      this._cap = c;
      // armed on the next tick: the click / Enter that opened it is not the new key
      setTimeout(() => {
        if (this._cap !== c) return;
        window.addEventListener('keydown', c.onKey, true);
        window.addEventListener('mousedown', c.onMouse, true);
        window.addEventListener('contextmenu', c.noMenu, true);
      }, 0);
      flag(rows.get(act)?.bind, 'is-capturing', true);
      say('ui.controls.press', { action: rows.get(act)?.label ?? act });
    };
    const step = (dir) => {
      const i = Math.max(0, Math.min(PRESET_IDS.length - 1, PRESET_IDS.indexOf(preset) + dir));
      if (PRESET_IDS[i] === preset) return;
      stop();
      preset = PRESET_IDS[i]; draw(); this.sfx('ui.toggle');
    };
    pick.querySelector('.ch-l').addEventListener('click', (ev) => { ev.stopPropagation(); step(-1); });
    pick.querySelector('.ch-r').addEventListener('click', (ev) => { ev.stopPropagation(); step(1); });
    const resetIt = this._button(body, tx(ctx, 'ui.controls.reset'), () => {
      if (preset !== active()) return;
      stop();
      applySetting(ctx, 'bindings', {});
      say('ui.controls.resetDone');
      draw();
    }, { cls: 'btn--plain ctl-reset' });
    draw();
    // TT6 fix round: touch and pad players get no keyboard-only lines (ui.css hides them), so focus skips them too
    const kbmOnly = dev === 'kbm' ? [{ el: pick, disabled: false, adjust: step, activate: () => step(1) }, ...bindItems, resetIt] : [];
    const items = [
      ...kbmOnly,
      this._button(body, tx(ctx, 'menu.back'), () => this.pop(), { cls: 'btn--plain' }),
    ];
    const s = this._wire({ id: 'controls', el: e, items, layer, focus: 0 });
    s.onClose = () => stop();
    this.push(s);
  }

  _settingRow(parent, def) {
    const ctx = this.ctx, st = ctx.state;
    const row = el('div', `mi srow srow--${def.type}`, { parent });
    el('span', 'srow-lbl', { parent: row, text: tx(ctx, def.label) });
    const ctl = el('div', 'srow-ctl', { parent: row });
    const it = { el: row, disabled: false, slider: def.type === 'slider' };
    const t = (k) => tx(ctx, k);
    let valEl, fillEl, knobEl;
    if (def.type === 'slider') {
      ctl.innerHTML = '<div class="sl"><div class="sl-track"><div class="sl-fill"></div><div class="sl-knob"></div></div></div><span class="sl-val"></span>';
      valEl = ctl.querySelector('.sl-val'); fillEl = ctl.querySelector('.sl-fill'); knobEl = ctl.querySelector('.sl-knob');
      const track = ctl.querySelector('.sl-track');
      const setFromX = (x) => { const r = track.getBoundingClientRect(); set(sliderFromFrac(def, (x - r.left) / Math.max(1, r.width)), false); };
      track.addEventListener('pointerdown', (ev) => { ev.preventDefault(); track.setPointerCapture?.(ev.pointerId); setFromX(ev.clientX); it._drag = true; });
      track.addEventListener('pointermove', (ev) => { if (it._drag) setFromX(ev.clientX); });
      const end = () => { if (it._drag) { it._drag = false; this.sfx('ui.toggle'); } };
      track.addEventListener('pointerup', end); track.addEventListener('pointercancel', end);
    } else if (def.type === 'toggle') {
      ctl.innerHTML = '<span class="tg"><i></i></span><span class="tg-val"></span>';
      valEl = ctl.querySelector('.tg-val');
    } else {
      ctl.innerHTML = '<span class="ch"><span class="ch-l">◀</span><span class="ch-val"></span><span class="ch-r">▶</span></span>';
      valEl = ctl.querySelector('.ch-val');
    }
    const refresh = () => {
      const v = readSetting(st, def.key);
      it.disabled = settingLocked(st, def.key);
      flag(row, 'is-disabled', it.disabled);
      setText(valEl, it.disabled ? tx(ctx, 'difficulty.nine') : formatSetting(def, v, t));
      if (def.type === 'slider') { const f = sliderFrac(def, v); setVar(fillEl, '--f', f.toFixed(3)); setVar(knobEl, '--f', f.toFixed(3)); }
      if (def.type === 'toggle') flag(row, 'is-checked', !!v);
    };
    const set = (v, sound = true) => {
      if (it.disabled) { this.sfx('ui.error'); return; }
      const cur = readSetting(st, def.key);
      if (v === cur) return;
      applySetting(ctx, def.key, v);
      refresh();
      if (sound) this.sfx('ui.toggle');
    };
    it.adjust = (dir) => set(stepSetting(def, readSetting(st, def.key), dir));
    if (def.type === 'toggle') it.activate = () => set(!readSetting(st, def.key));
    it.refresh = refresh;
    refresh();
    return it;
  }

  openCredits() {
    const ctx = this.ctx;
    const { e, body } = this._panel('credits', tx(ctx, 'credits.title'), this.titleActive ? 'menu--title' : '');
    const roll = el('div', 'credits-roll', { parent: body });
    roll.innerHTML = `<div class="cr-logo">${I.logoHtml(tx(ctx, 'game.title'), esc(tx(ctx, 'game.subtitle')))}</div>`
      + `<div class="cr-brand tt-cobrand">${coBrandHtml(ctx)}</div>${creditsTopHtml(ctx)}${creditsPinkPawHtml(ctx)}`
      + `<p class="cr-big">${esc(tx(ctx, 'credits.made'))}</p><h3>${esc(tx(ctx, 'credits.assets'))}</h3><div class="cr-lic">…</div>`;
    const lic = roll.querySelector('.cr-lic');
    this.ui.licenses?.().then((txt) => { lic.innerHTML = licensesHtml(txt); }).catch(() => { lic.textContent = ''; });
    const items = [this._button(body, tx(ctx, 'menu.back'), () => this.pop(), { cls: 'btn--plain' })];
    const s = this._wire({ id: 'credits', el: e, items, layer: this.titleActive ? 'title' : 'modal' });
    this._creditsRoll = roll; this._creditsT = 0;
    s.onClose = () => { this._creditsRoll = null; };
    this.push(s);
  }

  /** Auto-scroll the credits (real seconds). */
  scrollCredits(dt) {
    const r = this._creditsRoll;
    if (!r) return;
    this._creditsT += dt;
    if (this._creditsT > 1.2 && !r.matches(':hover')) r.scrollTop += dt * 38;
  }

  // ------------------------------------------------------------------ in-game screens
  openPause() {
    const ctx = this.ctx, st = ctx.state;
    const { e, body } = this._panel('pause', tx(ctx, 'pause.title'));
    const inBoss = !!ctx.enemies?.boss && ctx.enemies.boss.alive !== false;
    const items = [
      this._button(body, tx(ctx, 'pause.resume'), () => this.ui.resume()),
      this._button(body, tx(ctx, 'pause.kittens'), () => this.openKittens(), { sub: tx(ctx, 'pause.kittensCount', { n: (st?.kittens ?? []).length, max: KITTEN_IDS.length }) }),
      this._button(body, tx(ctx, 'pause.letters'), () => this.openLetters(), { sub: tx(ctx, 'pause.lettersCount', { n: (st?.letters ?? []).filter((l) => /^l\d$/.test(l)).length, max: LEVEL_IDS.length }) }),
      this._button(body, tx(ctx, 'menu.stickers'), () => this.openStickers(), { sub: tx(ctx, 'ui.stickers.count', { n: stickerCells(ctx).filter((c) => c.owned).length, max: STICKER_IDS.length }) }),
      this._button(body, tx(ctx, 'pause.settings'), () => this.openSettings()),
      // TT3 §11.2: the controls card lives in the pause menu (the pad's View button zooms now)
      this._button(body, tx(ctx, 'pause.controls'), () => this.openControls()),
    ];
    for (const id of pauseExtras({ hub: !!st?.cond?.('town.free') && !inBoss && ctx.levels?.current?.id !== 'town', embed: embedMode() })) {
      if (id === 'hub') items.push(this._button(body, tx(ctx, 'pause.hub'), () => this.ui.toHub()));
      else items.push(this._button(body, tx(ctx, 'pause.quit'), () => this.openConfirm(tx(ctx, 'menu.quitConfirm'), () => this.ui.quitToTitle())));
    }
    // TOKENTAILS-PLAN §10.4: the co-brand pill and the catnip note at the foot (no link out)
    el('div', 'pause-brand', { parent: body, html: brandPillHtml(ctx, 'pause') });
    this.push(this._wire({ id: 'pause', el: e, items, layer: 'pause', back: () => this.ui.resume() }), { sound: 'ui.bookOpen' });
  }

  /** WA §5.4 the sticker book: every sticker earned (flags `sticker.<id>`), the rest as soft silhouettes. */
  openStickers() {
    const ctx = this.ctx;
    const cells = stickerCells(ctx), n = cells.filter((c) => c.owned).length;
    const { e, body } = this._panel('stickers', `${tx(ctx, 'ui.stickers.title')} ${n}/${cells.length}`, 'menu--wide');
    const grid = el('div', 'stk-grid', { parent: body });
    for (const c of cells) {
      const art = REWARD_ART[c.id];
      const cell = el('div', `stk-cell${c.owned ? ' is-owned' : ''}`, { parent: grid });
      cell.innerHTML = `<div class="stk-art">${I.sticker(c.owned ? c.color : '#E9DCCB', c.owned ? (art?.icon ? art.icon() : art?.portrait ? '' : '') : I.paw('#FFF8EE'))}</div>`
        + `<div class="stk-lbl">${esc(c.owned ? c.label : tx(ctx, 'pause.missing'))}</div>`;
      if (c.owned && art?.portrait) cell.querySelector('.stk-art').insertAdjacentHTML('beforeend', `<div class="stk-face">${portraitSVG(art.portrait, { expression: 'happy' })}</div>`);
    }
    if (!n) el('div', 'stk-none', { parent: body, text: tx(ctx, 'ui.stickers.none') });
    const items = [this._button(body, tx(ctx, 'menu.back'), () => this.pop(), { cls: 'btn--plain' })];
    this.push(this._wire({ id: 'stickers', el: e, items, layer: this.top?.layer ?? 'pause' }));
  }

  openKittens() {
    const ctx = this.ctx;
    const cells = kittenCells(ctx);
    const n = cells.filter((c) => c.found).length;
    const { e, body } = this._panel('kittens', `${tx(ctx, 'pause.kittens')} ${n}/${cells.length}`, 'menu--wide');
    const grid = el('div', 'kit-grid', { parent: body });
    const items = cells.map((c) => {
      const cell = el('div', `mi kit-cell${c.found ? ' is-found' : ''}`, { parent: grid });
      cell.innerHTML = `<div class="kit-face">${c.found ? portraitSVG(c.id, { expression: 'happy' }) + catPhotoHtml(ctx, c.id) : '<span class="kit-q">?</span>'}</div>`
        + `<div class="kit-name">${esc(c.name)}</div><div class="kit-where">${esc(c.where)}</div>`
        + `${c.status ? `<div class="kit-status">${esc(c.status)}</div>` : ''}${c.found ? rescueBioHtml(ctx, c.id) : ''}`;
      return { el: cell };
    });
    items.push(this._button(body, tx(ctx, 'menu.back'), () => this.pop(), { cls: 'btn--plain' }));
    this.push(this._wire({ id: 'kittens', el: e, items, layer: this.top?.layer ?? 'pause', cols: 1, scroll: true }));
  }

  /** §6.7 / §14.3 Pause → Letters: a two-pane letter viewer (envelopes on the left, the open letter on the right). */
  openLetters(focusId = null) {
    const ctx = this.ctx;
    const cards = letterCards(ctx);
    const { e, body } = this._panel('letters', tx(ctx, 'pause.letters'), 'menu--wide');
    const wrap = el('div', 'lv', { parent: body });
    const list = el('div', 'lv-list', { parent: wrap });
    const sheet = el('div', 'lv-sheet', { parent: wrap });
    sheet.innerHTML = '<div class="lv-paper"><div class="lv-num"></div><div class="lv-title"></div><div class="lv-text"></div><div class="lv-from"></div>'
      + `<div class="lv-seal"></div></div>`;
    const num = sheet.querySelector('.lv-num'), ttl = sheet.querySelector('.lv-title'), txt = sheet.querySelector('.lv-text');
    const from = sheet.querySelector('.lv-from'), seal = sheet.querySelector('.lv-seal'), paper = sheet.querySelector('.lv-paper');
    const show = (c, i) => {
      if (!c || paper._id === c.id) return;
      paper._id = c.id;
      flag(paper, 'is-found', c.found);
      setText(num, `${i + 1} / ${cards.length}`);
      setText(ttl, c.found ? c.title : tx(ctx, 'pause.missing'));
      setText(txt, c.found ? c.text : tx(ctx, 'ui.letters.none'));
      setText(from, c.found ? tx(ctx, 'ui.letters.from', { region: tx(ctx, `region.${c.level}`) }) : '');
      seal.innerHTML = I.waxSeal(c.found ? I.PINK_DEEP : '#9A8B7C', c.found ? 'paw' : 'none');
      pulse(paper, 'is-flip');
    };
    const items = cards.map((c, i) => {
      const tab = el('div', `mi lv-tab${c.found ? ' is-found' : ''}`, { parent: list });
      tab.innerHTML = `<span class="lt-env">${I.letter(c.found)}</span><span class="lt-txt"><b>${i + 1}.</b> ${esc(c.found ? c.title : tx(ctx, 'pause.missing'))}</span>`;
      return { el: tab, letter: c, idx: i, activate: () => { show(c, i); pulse(paper, 'is-flip'); this.sfx('ui.page'); } };
    });
    items.push(this._button(body, tx(ctx, 'menu.back'), () => this.pop(), { cls: 'btn--plain' }));
    const first = Math.max(0, focusId ? cards.findIndex((c) => c.id === focusId) : cards.findIndex((c) => c.found));
    const s = { id: 'letters', el: e, items, layer: this.top?.layer ?? 'pause', scroll: true, focus: first };
    s.onFocus = (it) => { if (it?.letter) show(it.letter, it.idx); };
    this.push(this._wire(s));
  }

  openConfirm(text, yes, no = null) {
    const ctx = this.ctx;
    const { e, body } = this._panel('confirm', '', 'menu--small');
    el('p', 'menu-q', { parent: body, text });
    const items = [
      this._button(body, tx(ctx, 'menu.yes'), () => { this.pop({ sound: null }); yes?.(); }),
      this._button(body, tx(ctx, 'menu.no'), () => { this.pop(); no?.(); }),
    ];
    this.push(this._wire({ id: 'confirm', el: e, items, layer: this.top?.layer ?? 'modal', focus: 1 }));
  }

  /** §7.6 / §14.3 Vigil Stone menu: Rest (save) · Swap kitten · Difficulty. */
  openVigil() {
    const ctx = this.ctx;
    const { e, body } = this._panel('vigil', tx(ctx, 'vigil.title'), 'menu--small');
    const items = [this._button(body, tx(ctx, 'vigil.rest'), () => this.ui.vigilRest())];
    const unlocked = ctx.state?.companions?.unlocked ?? [];
    const active = new Set((ctx.companions?.active ?? []).map((c) => c.kittenId ?? c.id));
    const swapRow = el('div', 'vigil-swap', { parent: body });
    el('div', 'vigil-lbl', { parent: swapRow, text: tx(ctx, 'vigil.swap') });
    if (!unlocked.length) el('div', 'vigil-none', { parent: swapRow, text: tx(ctx, 'vigil.swapNone') });
    for (const id of unlocked) {
      const b = el('button', `mi vigil-kit${active.has(id) ? ' is-active' : ''}`, { parent: swapRow, attrs: { type: 'button' } });
      b.innerHTML = `<span class="vk-face">${portraitSVG(id, { expression: 'happy' })}</span><span class="vk-name">${esc(tx(ctx, `name.${id}`))}</span>`;
      items.push({ el: b, activate: () => { this.ui.swapCompanion(id); for (const x of swapRow.querySelectorAll('.vigil-kit')) flag(x, 'is-active', x === b); } });
    }
    const diffDef = SETTINGS.find((d) => d.key === 'difficulty');
    items.push(this._settingRow(body, diffDef));
    items.push(this._button(body, tx(ctx, 'menu.close'), () => this.ui.resume(), { cls: 'btn--plain' }));
    this.push(this._wire({ id: 'vigil', el: e, items, layer: 'pause', back: () => this.ui.resume() }), { sound: 'ui.bookOpen' });
  }

  /** §14.3 Game over: "Time for a cat nap." Wake up (retry level) · Back to Pawsbury (Quit to Title until the town is free). */
  openGameOver() {
    const ctx = this.ctx;
    const { e, body } = this._panel('gameover', '', 'menu--gameover');
    el('div', 'go-art', { parent: body, html: I.sleepingCat() });
    el('div', 'go-title', { parent: body, text: tx(ctx, 'gameover.title') });
    const items = [this._button(body, tx(ctx, 'gameover.retry'), () => this.ui.retry())];
    // Back to Pawsbury once the town is free; before that (M1) Quit to Title so the player is never forced to retry.
    if (ctx.state?.cond?.('town.free')) items.push(this._button(body, tx(ctx, 'gameover.hub'), () => this.ui.toHub()));
    else items.push(this._button(body, tx(ctx, 'pause.quit'), () => this.ui.quitToTitle(), { cls: 'btn--plain' }));
    const s = this._wire({ id: 'gameover', el: e, items, layer: 'pause', back: () => false });
    s.dark = true;
    this.push(s, { sound: null });
  }

  dispose() { for (const off of this._domOffs) off(); this.root.remove(); }
}

/** Continue button sub-line: "Purrdale Meadows · 5/18 kittens" from a save summary / resume point. Pure. */
export function continueSub(ctx, sum) {
  if (!sum?.levelId) return '';
  const region = tx(ctx, `region.${sum.levelId}`);
  const n = Array.isArray(sum.kittens) ? sum.kittens.length : Number.isFinite(sum.kittens) ? sum.kittens : ctx.state?.kittens?.length;
  return Number.isFinite(n) ? `${region} · ${n}/${KITTEN_IDS.length}` : region;
}

/**
 * The credits' top lines: 'credits.team' ("Token Tails") and, when strings carries it, 'credits.pinkpaw' (the Pink Paw
 * cat-names note). A missing key is skipped, never shown as a raw key. Returns HTML.
 */
export function creditsTopHtml(ctx) {
  const has = (k) => k === 'credits.team' || !!ctx?.strings?.has?.(k);
  return ['credits.team', 'credits.pinkpaw'].filter(has).map((k) => `<p class="cr-${k.slice(8)}">${esc(tx(ctx, k))}</p>`).join('');
}

/**
 * The credits' Pink Paw block (TOKENTAILS-PLAN §10.5): 'credits.pinkpaw.about' with the site as a link (new tab,
 * rel=noopener) and 'credits.fiction'. Rows strings does not carry are left out. Returns HTML.
 * @param {any} ctx
 */
export function creditsPinkPawHtml(ctx) {
  const has = (k) => !!ctx?.strings?.has?.(k);
  let out = '';
  if (has('credits.pinkpaw.about')) {
    const site = BRAND.site, text = esc(tx(ctx, 'credits.pinkpaw.about'));
    out += `<p class="cr-pinkpaw-about">${text.replace(site, `<a href="https://${site}" target="_blank" rel="noopener">${site}</a>`)}</p>`;
  }
  if (has('credits.fiction')) out += `<p class="cr-fiction">${esc(tx(ctx, 'credits.fiction'))}</p>`;
  return out;
}

/** A Controls-card row label: strings key `controls.<action>` when present, else the row's built-in label. */
export function controlLabel(ctx, act, fallback) {
  const k = `controls.${act}`;
  return ctx?.strings?.has?.(k) ? tx(ctx, k) : fallback;
}

/** A credits heading that must never be shown (F2: "Not included ..." lists packs that do not ship). */
const SKIP_HEADING = /^not included/i;

/**
 * LICENSES.md → simple credit HTML (headings, list items, table rows as "a — b — c"). Pure. A section whose heading
 * starts with "Not included" is skipped up to the next heading of the same or a higher level.
 */
export function licensesHtml(md) {
  const out = [];
  let skipDepth = 0;
  for (const raw of String(md ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    const hd = /^(#+)\s*(.*)$/.exec(line);
    if (hd) {
      const depth = hd[1].length;
      if (skipDepth && depth > skipDepth) continue;
      skipDepth = SKIP_HEADING.test(hd[2].replace(/[*_`]/g, '').trim()) ? depth : 0;
      if (skipDepth) continue;
    } else if (skipDepth) continue;
    if (!line || /^\|?\s*-{3,}/.test(line) || /^\|\s*:?-+/.test(line)) continue;
    const plain = (s) => esc(s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '').replace(/<[^>]+>/g, ''));
    if (line.startsWith('#')) { out.push(`<h4>${plain(line.replace(/^#+\s*/, ''))}</h4>`); continue; }
    if (line.startsWith('|')) {
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length) out.push(`<p class="cr-row">${cells.map(plain).join(' — ')}</p>`);
      continue;
    }
    out.push(`<p>${plain(line.replace(/^[-*]\s+/, ''))}</p>`);
  }
  return out.join('');
}

/** Run `fn` on the next animation frame (CSS transitions need one frame after insertion). */
function requestFrame(fn) {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => fn());
  else fn();
}
