// src/ui/menus.js  (owner: ui) — every menu screen of §14.3 in the candy skin: the Title (WA §4.3 / ON §3: over the
// live CS-00 with a warm peach rim, the logo pops in at 1.0 s and bobs; NO main-menu panel and NO difficulty picker on a
// new save: one candy button "Tap to play!" / "Press any key to play!" appears at 1.4 s and the whole screen is the hit
// target; with a save, "Keep going!" (with the save line) + "New adventure" (asks "Skip the prologue?" only when the
// save is past the prologue); a 48 px Settings gear top-right (Credits live inside Settings); the footer "Made with
// lots of purrs"), Settings (§14.3 list + §14.4 accessibility + the camera / performance / calm-HUD rows, saved
// immediately), Pause (Resume · Kittens · Letters · Sticker book · Settings · Return to Pawsbury · Quit to Title), the
// Kittens grid (18 portraits, "???" when missing), Letters, the Sticker book (WA §5.4: flags `sticker.<id>`), Credits
// (scrolls the asset attribution from LICENSES.md), the Vigil Stone menu (Rest · Swap kitten · Difficulty) and Game
// over ("Time for a cat nap.": Wake up · Back to Pawsbury). The first title input unlocks audio and on touch asks for
// fullscreen. New games start at Knight; Kitten mode is offered later, never asked (offer.js).
//
// One stack of screens; keyboard / gamepad navigate through input actions (navUp/Down/Left/Right, confirm, back,
// pause) with hold-repeat, the mouse hovers + clicks, touch taps. `MenuNav` is the pure focus model (node-tested).
import { KITTEN_IDS, KITTENS_BY_LEVEL, LEVEL_IDS } from '../core/config.js';
import { el, flag, setText, setVar, pulse } from './dom.js';
import { tx, esc, actionGlyph, presetGlyph, PRESET_IDS } from './text.js';
import { SETTINGS, SETTING_GROUPS, visibleSettings, readSetting, stepSetting, formatSetting, applySetting, settingLocked, sliderFrac, sliderFromFrac, resetSettings, CONTROL_ROWS } from './settings.js';
import { defaultState } from '../core/GameState.js';
import { portraitSVG } from './portraits.js';
import * as I from './icons.js';
import { REWARD_ART } from './celebrate.js';

/** WA §4.3 title timings: the logo pops at `logo` s, the button(s) appear at `buttons` s. */
export const TITLE = Object.freeze({ logo: 1.0, buttons: 1.4, quick: 0.35 });

/** The sticker book (ON §7.2 sticker set, in the order they are earned). */
export const STICKER_IDS = Object.freeze(['bonk', 'bow', 'hop', 'roll', 'stand', 'parry', 'found', 'knight', 'mochi']);

/** Sticker-book cells: id, label, colour, owned (flag `sticker.<id>`). Pure. */
export function stickerCells(ctx) {
  return STICKER_IDS.map((id) => ({ id, owned: !!ctx.state?.getFlag?.(`sticker.${id}`), label: tx(ctx, `sticker.${id}`), color: REWARD_ART[id]?.color ?? '#FFE9A8' }));
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
    return { id, found, name: found ? tx(ctx, `name.${id}`) : tx(ctx, 'pause.missing'), where: found && level ? tx(ctx, `region.${level}`) : '' };
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
    this.titleEl.innerHTML = `<div class="title-rim"></div><div class="title-logo">${I.logoHtml(tx(ctx, 'game.title'), esc(tx(ctx, 'game.subtitle')))}</div>`
      + `<div class="title-press"><span class="press-paw">${I.paw('#FFF6DA')}</span><span class="press-txt"></span></div>`
      + `<button type="button" class="title-gear" aria-label="${esc(tx(ctx, 'title.settings'))}">${I.gear()}</button>`
      + `<div class="title-foot">${esc(tx(ctx, 'title.foot'))}</div>`;
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
        if (!this.stack.length) this._titleGo(e);
        else if (this.top?.anyKey && e.key !== 'Escape' && e.key !== 'Tab') this._homePlay(e);
      };
      const onPtr = (e) => {
        if (!this.titleActive || e.target?.closest?.('.title-gear')) return;
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
      flag(this.titleEl, 'is-logo', this.titleT >= (quick ? 0 : TITLE.logo));
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

  _unlock(e) {
    try { this.ctx.audio?.unlock?.(); } catch { /* audio optional */ }
    if (e && e.pointerType === 'touch' && typeof document !== 'undefined' && !document.fullscreenElement) {
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
    this.push(this._wire({ id: 'main', el: e, items, layer: 'title', anyKey: !hasSave, back: () => false }), { sound: null });
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
   */
  openControls() {
    const ctx = this.ctx, dev = ctx.input?.device ?? 'kbm';
    const layer = this.top?.layer ?? 'modal';
    const { e, body } = this._panel('controls', tx(ctx, 'ui.controls.title'), `menu--wide${layer === 'title' ? ' menu--title' : ''}`);
    const presetDef = SETTINGS.find((d) => d.key === 'controlPreset');
    let preset = ctx.input?.preset ?? ctx.state?.settings?.controlPreset ?? 'hybrid';
    if (!PRESET_IDS.includes(preset)) preset = 'hybrid';
    const pick = el('div', 'mi srow srow--choice ctl-preset', { parent: body });
    pick.innerHTML = `<span class="srow-lbl">${esc(tx(ctx, 'ui.controls.preset'))}</span><div class="srow-ctl"><span class="ch"><span class="ch-l">◀</span><span class="ch-val"></span><span class="ch-r">▶</span></span></div>`;
    const tbl = el('div', 'ctl-table menu-scroll', { parent: body });
    const draw = () => {
      const i = PRESET_IDS.indexOf(preset);
      setText(pick.querySelector('.ch-val'), formatSetting(presetDef, preset, (k) => tx(ctx, k)) + (preset === (ctx.state?.settings?.controlPreset ?? 'hybrid') ? ' ✓' : ''));
      flag(pick, 'is-first', i <= 0); flag(pick, 'is-last', i >= PRESET_IDS.length - 1);
      const bind = ctx.state?.settings?.bindings ?? null;
      const devs = ['kbm', 'pad', 'touch'];
      let html = `<div class="ctl-row ctl-head"><span></span>${devs.map((d) => `<span class="${d === dev ? 'is-dev' : ''}">${d === 'kbm' ? I.keyboardIco() : d === 'pad' ? I.padIco() : I.touchIco()}</span>`).join('')}</div>`;
      for (const [act, label] of CONTROL_ROWS) {
        html += `<div class="ctl-row"><span class="ctl-lbl">${esc(label)}</span>${devs.map((d) => {
          const g = d === 'kbm' ? presetGlyph(act, preset, bind) : actionGlyph(act, d);
          const cap = g === '—' ? '<span class="ctl-na">—</span>' : `<kbd class="ui-key${act === 'attack' ? ' ui-key--sword' : ''}">${esc(g)}</kbd>`;
          return `<span class="${d === dev ? 'is-dev' : ''}">${cap}</span>`;
        }).join('')}</div>`;
      }
      tbl.innerHTML = html;
    };
    const step = (dir) => {
      const i = Math.max(0, Math.min(PRESET_IDS.length - 1, PRESET_IDS.indexOf(preset) + dir));
      if (PRESET_IDS[i] === preset) return;
      preset = PRESET_IDS[i]; draw(); this.sfx('ui.toggle');
    };
    pick.querySelector('.ch-l').addEventListener('click', (ev) => { ev.stopPropagation(); step(-1); });
    pick.querySelector('.ch-r').addEventListener('click', (ev) => { ev.stopPropagation(); step(1); });
    draw();
    const items = [
      { el: pick, disabled: false, adjust: step, activate: () => step(1) },
      this._button(body, tx(ctx, 'menu.back'), () => this.pop(), { cls: 'btn--plain' }),
    ];
    this.push(this._wire({ id: 'controls', el: e, items, layer, focus: 1 }));
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
      + `<p class="cr-big">${esc(tx(ctx, 'credits.made'))}</p><p>${esc(tx(ctx, 'credits.team'))}</p><h3>${esc(tx(ctx, 'credits.assets'))}</h3><div class="cr-lic">…</div>`;
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
    ];
    if (st?.cond?.('town.free') && !inBoss && ctx.levels?.current?.id !== 'town') items.push(this._button(body, tx(ctx, 'pause.hub'), () => this.ui.toHub()));
    items.push(this._button(body, tx(ctx, 'pause.quit'), () => this.openConfirm(tx(ctx, 'menu.quitConfirm'), () => this.ui.quitToTitle())));
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
      cell.innerHTML = `<div class="kit-face">${c.found ? portraitSVG(c.id, { expression: 'happy' }) : '<span class="kit-q">?</span>'}</div>`
        + `<div class="kit-name">${esc(c.name)}</div><div class="kit-where">${esc(c.where)}</div>`;
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

/** LICENSES.md → simple credit HTML (headings, list items, table rows as "a — b — c"). Pure. */
/** Continue button sub-line: "Purrdale Meadows · 5/18 kittens" from a save summary / resume point. Pure. */
export function continueSub(ctx, sum) {
  if (!sum?.levelId) return '';
  const region = tx(ctx, `region.${sum.levelId}`);
  const n = Array.isArray(sum.kittens) ? sum.kittens.length : Number.isFinite(sum.kittens) ? sum.kittens : ctx.state?.kittens?.length;
  return Number.isFinite(n) ? `${region} · ${n}/${KITTEN_IDS.length}` : region;
}

export function licensesHtml(md) {
  const out = [];
  for (const raw of String(md ?? '').split(/\r?\n/)) {
    const line = raw.trim();
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
