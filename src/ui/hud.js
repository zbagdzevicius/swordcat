// src/ui/hud.js  (owner: ui) — the §14.2 HUD in the candy skin (ART §9.1, WA §4): portrait (worried at HP ≤ 2,
// determined + glowing in Golden Hour), hearts (half-hearts, wobble on hit, a soft coral pulse at HP ≤ 2), Grit shields,
// the sword-shaped Valor meter (lilac well, fills from the hilt; butter notch at 50; all gold with a CSS shine at 100),
// lives (cat head + ×9; the badge pops on a lost life, WA §5.7), snack tins (id `milk`), catnip (id `fish`) / kittens n/3 / letter / the
// sticker-book corner (bump when a fly-to-HUD icon lands, WA §5.5), the companion portrait with its cooldown ring, the
// boss bar (plum ribbon, coral fill + butter chip trail, phase pips, Dizzy bar, the "BONKED!" stamp), the objective
// line + bar, the classic-camera lock reticle / pips and the "⚔ Riposte!" prompt.
// WA §4.1 calm HUD (`settings.hudMode`, HudTuck): Grit / Valor / lives / counters tuck away out of combat (class
// toggles only). DOM writes only on change; counters polled at 10 Hz (PERF §10.5).
// Reads player / companion / boss fields (§19.4) + bus events; counters from ctx.state at 10 Hz (tech.md §15).
import * as THREE from 'three';
import { PLAYER, HUD as HUD_CFG } from '../core/config.js';
import { E } from '../core/events.js';
import { SIGNATURE } from '../characters/palette.js';
import { el, setText, setHtml, flag, setVar, pulse, place } from './dom.js';
import { tx, txt, glyphify, glyphText, heartStates, frac, objectiveText, levelKittens, levelLetterId, actionGlyph, actionGlyphHtml, esc } from './text.js';
import { clipObjective, isPhone } from './beacon.js';
import { portraitSVG } from './portraits.js';
import * as I from './icons.js';
import { alertedNear } from './celebrate.js';
import { companionJoined } from './reveal.js';

/** "{n} catnip" for the currency counter's accessible label: strings key 'shop.cost', the copy the shops use. Pure. */
export function catnipLabel(ctx, n) {
  return tx(ctx, 'shop.cost', { n });
}

/**
 * TOKENTAILS-PLAN §10.2.10 (TT3 R3) phone toasts: on a phone the toast stack leaves the top-centre column (where it sat
 * over Clem and pushed the guide bubble onto her) for its own slot. Landscape: the left column under the HUD block, never
 * reaching the middle third of the width (Clem stands there); left-handed play mirrors it. Portrait: the band under the
 * HUD strip, short of the Skip chip. CSS px.
 */
export const TOAST_PHONE = Object.freeze({ gutter: 16, gap: 8, maxW: 260, minW: 150, visible: 1, bubbleTop: 150, clemUp: 40, clemDown: 30, toastH: 58, pad: 10, rate: 0.125 });

/**
 * Where the phone toast slot goes. Pure. `top`: the bottom of the top-left HUD block (and the objective line under it);
 * `chip`: the Skip chip rect or null; `lefty`: the mirrored HUD.
 * @param {{ W: number, H: number, top: number, chip?: {x:number, y:number, w:number, h:number}|null, lefty?: boolean }} s
 * @returns {{ x: number, y: number, w: number, right: boolean }}
 */
export function phoneToastBox(s) {
  const T = TOAST_PHONE, g = T.gutter, y = Math.round(s.top + T.gap);
  if (s.W > s.H) {
    // the left third minus its gutters: the slot's right edge stays ≥ T.gap short of W / 3
    const w = Math.max(T.minW, Math.min(T.maxW, Math.floor(s.W / 3) - g - T.gap));
    return { x: s.lefty ? s.W - g - w : g, y, w, right: !!s.lefty };
  }
  let w = s.W - 2 * g;
  const c = s.chip;
  if (c && c.x > s.W / 2 && c.y < y + 96 && c.y + c.h > y) w = Math.max(T.minW, Math.floor(c.x - T.gap - g));
  return { x: g, y, w, right: false };
}

/**
 * Portrait phones: how many toasts may stack in `room` px (from the slot's top down to just above Clem; NaN = she is
 * off screen): TOAST_PHONE.visible when there is room for them, never fewer than 1. Pure.
 * @param {number} room
 */
export function toastCap(room) {
  if (!Number.isFinite(room)) return TOAST_PHONE.visible;
  return Math.max(1, Math.min(TOAST_PHONE.visible, Math.floor((room - TOAST_PHONE.pad) / TOAST_PHONE.toastH)));
}

/**
 * Portrait phones: the guide bubble's top, kept off Clem. `base` is its usual top; when that box would cover her
 * (`clemTop`..`clemBottom`, CSS px) it goes just above her when it fits under `floor` (the toasts / HUD strip), else just
 * below her when it stays above `ceil` (the touch clusters), else stays. Pure.
 * @param {{ base: number, h: number, clemTop: number, clemBottom: number, floor: number, ceil: number }} s
 */
export function bubbleTop(s) {
  const { base, h } = s, pad = TOAST_PHONE.pad;
  if (!(h > 0) || !Number.isFinite(s.clemTop) || !Number.isFinite(s.clemBottom)) return base;
  if (base + h + pad <= s.clemTop || base >= s.clemBottom + pad) return base;
  const above = s.clemTop - pad - h;
  if (above >= s.floor) return Math.round(above);
  const below = s.clemBottom + pad;
  if (below + h <= s.ceil) return Math.round(below);
  return base;
}

/**
 * Where the phone objective line goes (it hangs under the hearts). Pure. It steps below any top-band rect to its right
 * that it would cover (the portrait ❚❚, the counters), starts at the HUD block's left edge once it is below the
 * portrait, and gets a max width (two lines) short of the Skip chip when the chip shares its row. CSS px.
 * @param {{ x: number, y: number, pw: number, ph: number, H: number, rects: {x:number, y:number, w:number, h:number}[],
 *   chip?: {x:number, y:number, w:number, h:number}|null, left: number, leftBottom: number }} s
 * @returns {{ x: number, y: number, maxW: number|null }}
 */
export function pillPlace(s) {
  let x = s.x, y = s.y, maxW = null;
  const pw = s.pw > 0 ? s.pw : 0, ph = s.ph > 0 ? s.ph : 0;
  if (pw > 0) {
    for (let pass = 0; pass < 2; pass++) {
      for (const q of s.rects ?? []) {
        if (q.x < x - 1 || q.y > s.H / 3) continue;                       // the HUD block it hangs from / the lower screen
        if (q.x < x + pw && q.x + q.w > x && q.y < y + ph && q.y + q.h > y) y = Math.round(q.y + q.h + 6);
      }
    }
  }
  if (y >= s.leftBottom && Number.isFinite(s.left)) x = Math.min(x, s.left);
  const c = s.chip;
  if (pw > 0 && c && c.x > x && c.y < y + ph && c.y + c.h > y && x + pw > c.x - 6) maxW = Math.max(120, Math.floor(c.x - 6 - x));
  return { x, y, maxW };
}

const PIP_LIFE = 3.0;          // §14.2: the pip bar fades 3 s after the last hit
const CHIP_HOLD = 0.55, CHIP_RATE = 0.45;
export const HUD_SAVE_SEC = 1.8;  // the "Saved" seal stays up this long
const _v = new THREE.Vector3();

/** WA §4.1 calm-HUD numbers (config HUD.tuck; fallbacks for older configs). */
export const TUCK = Object.freeze({ combatR: 15, after: 4, fade: 0.3, popShow: 3, livesLow: 3, valorShow: 50, ...(HUD_CFG?.tuck ?? {}) });

/**
 * WA §4.1 the calm HUD (`settings.hudMode` 'calm', the default; 'full' shows everything as before). Pure model:
 * portrait + hearts always; Grit / Valor while in combat (an alerted enemy within TUCK.combatR m), the Stand is held,
 * and TUCK.after s past the last of it (Valor also at ≥ TUCK.valorShow); lives on change (TUCK.popShow s), in menus
 * and at ≤ TUCK.livesLow; fish / kittens / letter on change (TUCK.popShow s), in the hub and while peeked.
 */
export class HudTuck {
  constructor() {
    this.calmT = TUCK.after;       // starts calm: nothing to fight yet
    this.livesT = 0; this.countsT = 0;
    this.show = { grit: true, valor: true, lives: true, counts: true };
  }

  /** Something the counters show changed (pickup, rescue, letter): show them for TUCK.popShow s. */
  countsChanged() { this.countsT = TUCK.popShow; }
  livesChanged() { this.livesT = TUCK.popShow; }

  /**
   * @param {number} dt @param {{ mode?: string, combat?: boolean, guarding?: boolean, valor?: number, lives?: number,
   *   menu?: boolean, hub?: boolean, peek?: boolean }} s
   * @returns {{ grit: boolean, valor: boolean, lives: boolean, counts: boolean }}
   */
  update(dt, s) {
    const o = this.show;
    if (s.combat || s.guarding) this.calmT = 0; else this.calmT += dt;
    if (this.livesT > 0) this.livesT -= dt;
    if (this.countsT > 0) this.countsT -= dt;
    if (s.mode === 'full') { o.grit = o.valor = o.lives = o.counts = true; return o; }
    const fight = this.calmT < TUCK.after;
    o.grit = fight || !!s.guarding;
    o.valor = fight || (s.valor ?? 0) >= TUCK.valorShow;
    o.lives = this.livesT > 0 || !!s.menu || (Number.isFinite(s.lives) && s.lives <= TUCK.livesLow);
    o.counts = this.countsT > 0 || !!s.hub || !!s.peek || !!s.menu;
    return o;
  }
}

/**
 * WA §4.2: may the boss bar wear the "BONKED!" stamp? Only after `boss:defeated` for a boss with no HP left (the final
 * hit); a defeat signal while it still has HP (a scripted hand-off, a debug jump) never stamps it mid-fight. Pure.
 * @param {{ hp?: number, alive?: boolean } | null} boss @param {boolean} defeated
 */
export function bonkedShown(boss, defeated) {
  if (!defeated) return false;
  if (!boss) return true;
  return boss.alive === false || !((boss.hp ?? 0) > 0);
}

/** The sword-shaped Valor meter (viewBox 0 0 220 40). Blade 40 → 204 (tip 214). */
const BLADE = { x0: 40, x1: 204, tip: 214 };
function valorSvg() {
  const g = I.uid('vg');
  const blade = `M${BLADE.x0} 13.5H${BLADE.x1}L${BLADE.tip} 20 ${BLADE.x1} 26.5H${BLADE.x0}Z`;
  return `<svg class="valor-svg" viewBox="0 0 222 40" aria-hidden="true"><defs>`
    + `<linearGradient id="${g}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="#CDD3DB"/><stop offset="1" stop-color="#8E949E"/></linearGradient>`
    + `<linearGradient id="${g}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF6DA"/><stop offset=".45" stop-color="#FFD34D"/><stop offset="1" stop-color="#D99A2B"/></linearGradient>`
    + `<clipPath id="${g}c"><path d="${blade}"/></clipPath></defs>`
    // blade well
    + `<path d="${blade}" fill="#5A4A7A" fill-opacity=".35"/>`
    + `<g clip-path="url(#${g}c)"><rect class="v-fill" x="${BLADE.x0}" y="10" width="0" height="20" fill="url(#${g}s)"/>`
    + `<rect class="v-gold" x="${BLADE.x0}" y="10" width="0" height="20" fill="url(#${g}g)"/>`
    + `<rect class="v-shine" x="${BLADE.x0 - 30}" y="10" width="26" height="20" fill="#fff"/></g>`
    + `<path d="M${BLADE.x0 + 2} 20H${BLADE.x1 - 4}" stroke="#5A3B2E" stroke-width="1.2" opacity=".35"/>`
    + `<path d="${blade}" fill="none" stroke="#5A3B2E" stroke-width="2" stroke-linejoin="round"/>`
    // the 50 notch
    + `<path class="v-notch" d="M${(BLADE.x0 + BLADE.x1) / 2} 8.5l3.6 4.6-3.6 4.6-3.6-4.6Z" stroke="#5A3B2E" stroke-width="1.4"/>`
    // hilt: pommel, grip, crossguard
    + '<circle cx="8.5" cy="20" r="6" fill="#FFD86B" stroke="#5A3B2E" stroke-width="1.8"/><circle cx="7" cy="18.4" r="1.8" fill="#FFF8EE"/>'
    + '<rect x="13.5" y="16" width="20" height="8" rx="3" fill="#FF9EC0" stroke="#5A3B2E" stroke-width="1.8"/>'
    + '<path d="M17 16.5v7M21.5 16.5v7M26 16.5v7" stroke="#E07396" stroke-width="1.6"/>'
    + '<rect x="33.5" y="5" width="7" height="30" rx="3.2" fill="#FFD86B" stroke="#5A3B2E" stroke-width="1.8"/><path d="M35.6 8v8" stroke="#FFF8EE" stroke-width="1.6" stroke-linecap="round"/>'
    + '<g class="v-sparks" fill="#FFF6DA"><path d="M70 9l1.4 3.4 3.4 1.4-3.4 1.4L70 18.6l-1.4-3.4-3.4-1.4 3.4-1.4Z"/><path d="M128 25l1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8-2.8-1.2 2.8-1.2Z"/><path d="M176 8l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1Z"/></g>'
    + '</svg>';
}

export class Hud {
  /** @param {any} ctx @param {HTMLElement} parent */
  constructor(ctx, parent) {
    this.ctx = ctx;
    const root = this.root = el('div', 'hud', { parent });
    // ---- top-left cluster
    const tl = this.tlEl = el('div', 'hud-tl', { parent: root });
    this.portraitWrap = el('div', 'hud-portrait', { parent: tl });
    this.portraitImg = el('div', 'hud-portrait-img', { parent: this.portraitWrap });
    el('div', 'hud-portrait-bow', { html: I.bowSvg(), parent: this.portraitWrap });
    this.livesEl = el('div', 'hud-lives', { parent: this.portraitWrap, html: `<span class="lives-ico">${I.catHead()}</span><span class="lives-n"></span>` });
    this.livesN = this.livesEl.querySelector('.lives-n');
    const stats = el('div', 'hud-stats', { parent: tl });
    this.heartsEl = el('div', 'hud-hearts', { parent: stats });
    this.gritEl = el('div', 'hud-grit', { parent: stats });
    this.valorEl = el('div', 'hud-valor', { parent: stats, html: valorSvg() + `<span class="valor-sun">${I.sun()}</span>` });
    this.vFill = this.valorEl.querySelector('.v-fill');
    this.vGold = this.valorEl.querySelector('.v-gold');
    this.vShine = this.valorEl.querySelector('.v-shine');
    // ---- bottom-left: milk
    this.milkEl = el('div', 'hud-milk', { parent: root });
    // ---- top-right: fish, kittens, letter
    const tr = this.trEl = el('div', 'hud-tr', { parent: root });
    this.fishEl = el('div', 'hud-count hud-fish', { parent: tr, attrs: { role: 'img' }, html: `<span class="c-ico">${I.fish()}</span><span class="c-n">0</span>` });
    this.kitEl = el('div', 'hud-count hud-kits', { parent: tr, html: `<span class="c-ico">${I.catHead({ fur: '#E3C9A2', deep: '#C9A47A', bow: false, eyes: '#5E8FA8' })}</span><span class="c-n">0/3</span>` });
    this.letterEl = el('div', 'hud-count hud-letter', { parent: tr, html: `<span class="c-ico"></span>` });
    /** the sticker book's corner (WA §5.4: stickers fly here) */
    this.stickerEl = el('div', 'hud-stickers', { parent: tr, html: I.sticker('#FFD86B', I.star4('#FFF8EE')) });
    // ---- bottom-right: companion
    this.compEl = el('div', 'hud-comp', { parent: root });
    this.compEl.innerHTML = `<div class="comp-ring">${I.ring('comp-ring-svg')}</div><div class="comp-face"></div><div class="comp-key"></div><div class="comp-zzz">z<span>z</span><span>z</span></div>`;
    this.compRing = this.compEl.querySelector('.ring-fg');
    this.compFace = this.compEl.querySelector('.comp-face');
    this.compKey = this.compEl.querySelector('.comp-key');
    // ---- bottom-right, above the companion: the "Saved" wax seal (§14.1; polls ctx.save.lastSave, requests/save.md)
    this.saveEl = el('div', 'hud-save', { parent: root, html: `<span class="save-seal">${I.waxSeal(I.PINK_DEEP, 'paw')}</span><span class="save-txt"></span>` });
    this.saveTxt = this.saveEl.querySelector('.save-txt');
    this.saveT = 0;
    // ---- top-centre: boss bar + objective line
    const tc = this.tcEl = el('div', 'hud-tc', { parent: root });
    this.bossEl = el('div', 'hud-boss', { parent: tc });
    this.bossEl.innerHTML = '<div class="boss-name"><span></span></div>'
      + '<div class="boss-row"><div class="boss-medal"><div class="boss-face"></div></div><div class="boss-bars">'
      + '<div class="boss-bar"><div class="boss-chip"></div><div class="boss-fill"></div><div class="boss-shine"></div><div class="boss-pips"></div></div>'
      + `<div class="boss-dizzy"><span class="dizzy-ico">${I.dizzyStars()}</span><div class="dizzy-track"><div class="dizzy-fill"></div></div><span class="dizzy-lbl"></span></div>`
      + '</div><div class="boss-cap"></div></div><div class="boss-bonked"></div>';
    this.bossFace = this.bossEl.querySelector('.boss-face');
    this.bossName = this.bossEl.querySelector('.boss-name span');
    this.bossFill = this.bossEl.querySelector('.boss-fill');
    this.bossChip = this.bossEl.querySelector('.boss-chip');
    this.bossPips = this.bossEl.querySelector('.boss-pips');
    this.dizzyFill = this.bossEl.querySelector('.dizzy-fill');
    this.dizzyLbl = this.bossEl.querySelector('.dizzy-lbl');
    this.bonkedEl = this.bossEl.querySelector('.boss-bonked');
    this.objEl = el('div', 'hud-obj', { parent: tc });
    this.objEl.innerHTML = `<div class="obj-line"><span class="obj-ico">${I.flag()}</span><span class="obj-txt"></span><span class="obj-pct"></span></div><div class="obj-bar"><div class="obj-fill"></div><div class="obj-marks"></div></div>`;
    this.objPct = this.objEl.querySelector('.obj-pct');
    this.objMarks = this.objEl.querySelector('.obj-marks');
    this.objTxt = this.objEl.querySelector('.obj-txt');
    this.objFill = this.objEl.querySelector('.obj-fill');
    this.toastSlot = el('div', 'hud-toast-slot', { parent: tc });
    // TOKENTAILS-PLAN §10.2.6 the guide's objective line (one line ≤ 40 characters, pink paw, device-aware glyphs):
    // top centre on desktop, under the hearts on phones; text from the beacon's guide target (shown in practice too)
    this.guideEl = el('div', 'hud-guide', { parent: tc, attrs: { role: 'status' } });
    tc.insertBefore(this.guideEl, tc.firstChild);
    this.guideEl.innerHTML = `<span class="hg-ico">${typeof I.pinkPaw === 'function' ? I.pinkPaw(22) : I.paw('#FF7AA2')}</span><span class="hg-txt"></span>`;
    this.guideTxt = this.guideEl.querySelector('.hg-txt');
    /** the objective line's plain text (tests / __GAME__.guide()); '' when hidden */
    this.guideText = '';
    this._guideKey = ''; this._guidePosT = 0;
    /** TT3 R3: the phone toast slot / guide bubble placement (re-measured at 1 / TOAST_PHONE.rate Hz) */
    this._toastT = 0; this.toastBox = null;
    // ---- world-anchored: lock reticle, enemy pips, riposte prompt
    this.reticle = el('div', 'hud-reticle', { parent: root, html: '<div class="ret-ring"></div><div class="ret-pips"></div>' });
    this.retPips = this.reticle.querySelector('.ret-pips');
    this.pipEls = [0, 1, 2, 3].map(() => el('div', 'hud-epips', { parent: root }));
    this.riposte = el('div', 'hud-riposte', { parent: root });
    /** the blocks the SafeFrame reads (occluders.js: the union of the shown parts) */
    this.tlParts = [this.portraitWrap, this.heartsEl, this.gritEl, this.valorEl];
    this.trParts = [this.fishEl, this.kitEl, this.letterEl, this.stickerEl];
    /** WA §4.1 calm HUD */
    this.tuck = new HudTuck();
    this._tuckKey = '';

    // ---- model
    this.v = {};                 // last written values (DOM writes only on change)
    this.valorShown = 0;
    this.hits = new Map();       // enemy → seconds since the player's last hit
    this.boss = null; this.bossMax = 1; this.bossChipV = 1; this.bossHold = 0; this.bossOut = 0; this.bonked = false;
    this.objs = new Map(); this.objCur = null; this.objDoneT = 0;
    this.lastHit = 0;
    this.stillT = 0;
    this.visible = true; this.meme = false;
    const bus = ctx.bus, on = (n, f) => this._offs.push(bus.on(n, f));
    this._offs = [];
    on(E.PLAYER_DAMAGED, () => { pulse(this.heartsEl, 'is-hit'); pulse(this.portraitWrap, 'is-hit'); this.poll(true); });
    on(E.PLAYER_HEALED, () => { pulse(this.heartsEl, 'is-heal'); this.poll(true); });
    on(E.PLAYER_GRIT, (p) => { if (p?.broken) pulse(this.gritEl, 'is-broken'); else pulse(this.gritEl, 'is-tick'); this.poll(true); });
    on(E.PLAYER_VALOR, () => this.poll(true));
    on(E.PLAYER_GOLDEN, () => this.poll(true));
    on(E.PLAYER_MILK, (p) => this._milkEvent(p));
    // WA §5.7: no ghost; the lives badge pops (scale 1.25 → 1, 0.2 s) and shows for a moment
    on(E.PLAYER_LIFE_LOST, () => { this.tuck.livesChanged(); pulse(this.livesEl, 'is-pop'); this.poll(true); });
    on(E.PLAYER_STILL_STANDING, () => { this.stillT = 1.4; pulse(this.heartsEl, 'is-still'); });
    on(E.ITEM_PICKUP, (p) => { if (p?.item === 'fish' || p?.item === 'letter') this.tuck.countsChanged(); this.poll(true); });
    on(E.KITTEN_RESCUED, () => { this.tuck.countsChanged(); this._pop(this.kitEl); this.poll(true); });
    on(E.HIT, (h) => this._onHit(h));
    on(E.BOSS_START, (p) => this._bossStart(p));
    on(E.BOSS_PHASE, () => pulse(this.bossEl, 'is-phase'));
    on(E.BOSS_DIZZY, (p) => this._bossDizzy(p));
    on(E.BOSS_PHASE, () => this._bonk(false));
    // WA §4.2: only the final hit stamps "BONKED!" on the boss bar (hud.boss.bonked): never while the bar's boss has HP
    on(E.BOSS_DEFEATED, (p) => {
      if (!this.boss || (p?.boss && p.boss !== this.boss)) return;
      if (!bonkedShown(this.boss, true)) return;
      this.bossOut = 1.6;
      this._bonk(true);
    });
    on(E.OBJECTIVE, (p) => this._objective(p));
    on(E.LEVEL_LOADING, () => { this._bossHide(); this.objs.clear(); this.objCur = null; flag(this.objEl, 'is-on', false); this.hits.clear(); });
    on(E.LEVEL_LOADED, () => this.poll(true));
    on(E.COMPANION_CHANGED, () => this.poll(true));
    on(E.COMPANION_NAP, () => this.poll(true));
    on(E.INPUT_DEVICE, () => this.poll(true));
    this._pollT = 0;
  }

  setVisible(on) { if (this.visible !== on) { this.visible = on; flag(this.root, 'is-hidden', !on); } }
  setMeme(on) { this.meme = on; flag(this.root, 'is-meme', on); }

  _pop(e) { pulse(e, 'is-pop'); }

  /** A counter bump when a fly-to-HUD icon lands (WA §5.5: 1.25 → 1 over 0.2 s). */
  bump(key) {
    const e = key === 'fish' ? this.fishEl : key === 'kits' ? this.kitEl : key === 'hearts' ? this.heartsEl : key === 'milk' ? this.milkEl
      : key === 'valor' ? this.valorEl : key === 'comp' ? this.compEl : key === 'stickers' ? this.stickerEl : key === 'portrait' ? this.portraitWrap : null;
    if (e) { if (key === 'fish' || key === 'kits' || key === 'stickers') this.tuck.countsChanged(); pulse(e, 'is-bump'); }
  }

  /** The HUD element a reward / icon flies to (WA §5.4 / §5.5), or null. */
  homeEl(key) {
    switch (key) {
      case 'fish': return this.fishEl; case 'kits': return this.kitEl; case 'hearts': return this.heartsEl; case 'milk': return this.milkEl;
      case 'valor': return this.valorEl; case 'comp': return this.compEl; case 'stickers': return this.stickerEl; case 'portrait': return this.portraitWrap;
      default: return null;
    }
  }

  /** WA §4.1: apply the calm-HUD tuck (class toggles only; 'full' mode shows everything). Called at 10 Hz. */
  _tick(dt) {
    const ctx = this.ctx, p = ctx.player, st = ctx.state;
    const lvl = ctx.levels?.current?.id ?? st?.levelId;
    const o = this.tuck.update(dt, {
      mode: st?.settings?.hudMode ?? 'calm',
      combat: alertedNear(ctx, TUCK.combatR) || !!this.boss,
      guarding: !!p?.guarding,
      valor: p?.valor ?? 0,
      lives: p?.infiniteLives ? Infinity : p?.lives,
      menu: ctx.game?.mode === 'menu',
      hub: lvl === 'town' && !!st?.cond?.('town.free'),
      peek: ctx.input?.device === 'kbm' && !!ctx.input?.down?.('peek'),   // TT3: the Z / MMB peek hold, not Tab
    });
    // WA §7.5: Morning Practice reveals the armour shields with the Stand lesson; Valor and milk wait until after it
    const rv = ctx.ui?.reveal;
    flag(this.root, 'tuck-grit', !o.grit || rv?.grit === false);
    flag(this.root, 'tuck-valor', !o.valor || rv?.valor === false);
    flag(this.root, 'tuck-milk', rv?.milk === false);
    flag(this.root, 'tuck-lives', !o.lives);
    flag(this.root, 'tuck-counts', !o.counts);
  }

  /** Flash the "Saved" wax seal for HUD_SAVE_SEC. */
  showSaved() {
    setText(this.saveTxt, tx(this.ctx, 'toast.saved'));
    this.saveT = HUD_SAVE_SEC;
    flag(this.saveEl, 'is-on', true);
    pulse(this.saveEl, 'is-stamp');
  }

  // ------------------------------------------------------------------ events
  _milkEvent(p) {
    if (!p) return;
    if (p.phase === 'heal') {
      const bottles = this.milkEl.children, i = Math.max(0, Math.min(bottles.length - 1, p.left ?? 0));
      if (bottles[i]) pulse(bottles[i], 'is-sip');
    } else if (p.phase === 'start') pulse(this.milkEl, 'is-wiggle');
    this.poll(true);
  }

  _onHit(h) {
    if (!h || !h.target || h.blocked) return;
    const att = h.attacker, tgt = h.target;
    const byPlayer = att && (att === this.ctx.player || att.faction === 'player' || att.owner === this.ctx.player);
    if (!byPlayer || tgt === this.ctx.player || tgt === this.boss) return;
    if (!(tgt.tags?.has?.('enemy') || tgt.faction === 'enemy')) return;
    this.hits.set(tgt, 0);
    if (this.hits.size > 8) this.hits.delete(this.hits.keys().next().value);
  }

  _bossStart(p) {
    if (!p) return;
    this.boss = p.boss ?? null;
    this.bossMax = Math.max(1, p.maxHp ?? this.boss?.maxHp ?? 1);
    this.bossChipV = frac(this.boss?.hp ?? this.bossMax, this.bossMax); this.bossHold = 0; this.bossOut = 0; this._bossLast = null;
    setText(this.bossName, tx(this.ctx, p.name ?? p.id ?? ''));
    this.bossFace.innerHTML = portraitSVG(String(p.id ?? this.boss?.type ?? 'boss').replace(/^boss_/, ''), { expression: 'normal' });
    let pips = '';
    for (const at of p.phases ?? []) if (at > 0 && at < 1) pips += `<i style="left:${(at * 100).toFixed(1)}%"></i>`;
    setHtml(this.bossPips, pips);
    this._bossDizzy({ value: 0, max: p.dizzyMax ?? 100, dizzy: false });
    this._bonk(false);
    flag(this.bossEl, 'is-on', true);
    pulse(this.bossEl, 'is-enter');
  }

  _bossDizzy(p) {
    if (!p) return;
    setVar(this.dizzyFill, '--f', frac(p.value ?? 0, p.max ?? 100).toFixed(3));
    if (p.dizzy && !this.bossEl.classList.contains('is-dizzy')) pulse(this.bossEl, 'is-dizzy-in');
    flag(this.bossEl, 'is-dizzy', !!p.dizzy);
    setText(this.dizzyLbl, p.dizzy ? `${tx(this.ctx, 'hud.boss.dizzy')} ${tx(this.ctx, 'ui.boss.crit')}` : '');
  }

  _bossHide() { this.boss = null; this.bossOut = 0; this._bonk(false); flag(this.bossEl, 'is-on', false); }

  /** Show / clear the "BONKED!" stamp (WA §4.2). `bonked` is what tests and the smoke read. */
  _bonk(on) {
    this.bonked = !!on;
    setText(this.bonkedEl, on ? tx(this.ctx, 'hud.boss.bonked') : '');
    if (on) pulse(this.bossEl, 'is-bonked'); else flag(this.bossEl, 'is-bonked', false);
  }

  _objective(p) {
    if (!p || !p.id) return;
    const prev = this.objs.get(p.id);
    this.objs.set(p.id, { ...p });
    if (p.done) {
      if (this.objCur === p.id || !this.objCur) { this.objCur = p.id; this.objDoneT = 2.2; }
      if (!prev?.done) pulse(this.objEl, 'is-done');
    } else this.objCur = p.id;
    this._drawObjective();
  }

  _drawObjective() {
    const p = this.objCur ? this.objs.get(this.objCur) : null;
    flag(this.objEl, 'is-on', !!p);
    if (!p) return;
    const t = p.done ? tx(this.ctx, 'obj.done') : objectiveText(this.ctx, p);
    setText(this.objTxt, t);
    const showBar = (p.max ?? 0) > 1 && !p.done;
    flag(this.objEl, 'has-bar', showBar);
    flag(this.objEl, 'is-frozen', !!p.frozen);
    flag(this.objEl, 'is-complete', !!p.done);
    setVar(this.objFill, '--f', frac(p.value ?? 0, p.max ?? 1).toFixed(3));
    // percentage objectives (The Line: max 100) show the number beside the bar unless the text already carries it
    const pct = showBar && (p.max ?? 0) >= 100 && !/%/.test(t) ? `${Math.floor(frac(p.value ?? 0, p.max) * 100)}%` : '';
    setText(this.objPct, pct);
    // optional milestone ticks (`marks`: fractions 0..1, e.g. The Line's wave thresholds); passed ones turn gold
    const marks = Array.isArray(p.marks) ? p.marks : null, f = frac(p.value ?? 0, p.max ?? 1);
    setHtml(this.objMarks, marks ? marks.filter((m) => m > 0 && m < 1).map((m) => `<i class="${f >= m ? 'f' : ''}" style="left:${(m * 100).toFixed(1)}%"></i>`).join('') : '');
  }

  // ------------------------------------------------------------------ polling (10 Hz + on events)
  poll(force = false) {
    const ctx = this.ctx, p = ctx.player, st = ctx.state, v = this.v;
    if (p) {
      const hp = Math.max(0, Math.round(p.hp ?? 0)), maxHp = Math.max(2, p.maxHp ?? 8);
      const hs = heartStates(hp, maxHp).join(',');
      if (force || v.hearts !== hs) {
        v.hearts = hs;
        const list = hs.split(',');
        const kids = this.heartsEl.children;
        while (kids.length < list.length) el('span', 'heart', { parent: this.heartsEl });
        while (kids.length > list.length) kids[kids.length - 1].remove();
        list.forEach((s, i) => { const k = kids[i]; if (k._s !== s) { k._s = s; k.innerHTML = I.heart(s); k.className = 'heart heart--' + s; } });
      }
      flag(this.heartsEl, 'is-low', hp > 0 && hp <= 2);
      // grit
      const gMax = p.gritMax ?? PLAYER.guard.grit, g = Math.max(0, p.grit ?? gMax);
      const gs = `${g}/${gMax}`;
      if (force || v.grit !== gs) {
        v.grit = gs;
        let html = '';
        for (let i = 0; i < gMax; i++) html += `<span class="grit">${I.gritShield(i < g ? 'full' : g <= 0 ? 'cracked' : 'empty')}</span>`;
        this.gritEl.innerHTML = html;
      }
      flag(this.gritEl, 'is-guard', !!p.guarding);
      // valor target (animated in render)
      this.valorTarget = Math.max(0, Math.min(PLAYER.valor.max, p.valor ?? 0));
      this.golden = !!p.golden;
      this.goldenFrac = p.golden ? frac(p.goldenT ?? 0, PLAYER.golden.dur) : 0;
      flag(this.root, 'is-golden', this.golden);
      // portrait
      const expr = p.golden ? 'determined' : p.alive === false || p.stateName === 'dead' ? 'sleep' : hp > 0 && hp <= 2 ? 'worried' : 'normal';
      const outfit = st?.cosmetics?.cape === 'red' ? 'swordcat_red' : 'swordcat';
      const pk = expr + outfit;
      if (force || v.portrait !== pk) { v.portrait = pk; this.portraitImg.innerHTML = portraitSVG(outfit, { expression: expr }); }
      flag(this.portraitWrap, 'is-worried', expr === 'worried');
      // lives
      const inf = !!p.infiniteLives || !Number.isFinite(p.lives);
      flag(this.livesEl, 'is-inf', inf);
      const ln = inf ? '' : tx(ctx, 'hud.lives', { n: p.lives ?? 9 });
      if (v.lives != null && v.lives !== p.lives) this.tuck.livesChanged();
      v.lives = p.lives;
      setText(this.livesN, ln);
      flag(this.livesEl, 'is-last', !inf && p.lives === 1);
      // milk
      const mm = Math.max(0, p.milkMax ?? 2), m = Math.max(0, Math.min(mm, p.milk ?? 0));
      const ms = `${m}/${mm}`;
      if (force || v.milk !== ms) {
        v.milk = ms;
        const kids = this.milkEl.children;
        while (kids.length < mm) el('span', 'milk', { parent: this.milkEl });
        while (kids.length > mm) kids[kids.length - 1].remove();
        for (let i = 0; i < mm; i++) { const k = kids[i], s = i < m ? 'f' : 'e'; if (k._s !== s) { k._s = s; k.innerHTML = I.milkBottle(s === 'f'); flag(k, 'is-empty', s === 'e'); } }
      }
    }
    // counters (§14.2: pop and bounce on change)
    if (st) {
      const fish = st.fish ?? 0;
      if (v.fish !== fish) {
        if (v.fish != null && fish !== v.fish) { this.tuck.countsChanged(); this._pop(this.fishEl); }
        v.fish = fish; setText(this.fishEl.lastChild, String(fish));
        this.fishEl.setAttribute('aria-label', catnipLabel(ctx, fish));
      }
      const lvl = ctx.levels?.current?.id ?? st.levelId;
      const k = levelKittens(st, lvl), ks = `${k.n}/${k.max}`;
      if (v.kits !== ks) { v.kits = ks; setText(this.kitEl.lastChild, tx(ctx, 'hud.kittens', { n: k.n, max: k.max })); }
      const lid = levelLetterId(lvl), has = !!lid && (st.letters ?? []).includes(lid);
      if (v.letter !== has) { if (v.letter === false && has) { this.tuck.countsChanged(); this._pop(this.letterEl); } v.letter = has; this.letterEl.firstChild.innerHTML = I.letter(has); flag(this.letterEl, 'is-found', has); }
    }
    // save seal: a successful write since the last poll (the first poll only records the count)
    const ls = ctx.save?.lastSave;
    if (ls && Number.isFinite(ls.count)) {
      if (v.saveN != null && ls.count !== v.saveN && ls.ok !== false) this.showSaved();
      v.saveN = ls.count;
    }
    // companion portrait + ring
    // the kitten portrait waits for the kitten to join (no Mochi before D-01 sets meadow.mochi)
    const c0 = ctx.companions?.active?.[0] ?? null, c = c0 && companionJoined(ctx, c0.kittenId ?? c0.id) ? c0 : null;
    flag(this.compEl, 'is-on', !!c);
    if (c) {
      const id = c.kittenId ?? c.id;
      if (v.comp !== id) {
        v.comp = id;
        this.compFace.innerHTML = portraitSVG(id, { expression: 'happy' });
        setVar(this.compEl, '--sig', SIGNATURE[id] ?? '#D9B26A');
      }
      const dev = ctx.input?.device ?? 'kbm';
      const ck = `${dev}|${ctx.input?.padKind}|${actionGlyph('ability', dev, ctx.input)}`;
      if (v.compKey !== ck) { v.compKey = ck; setHtml(this.compKey, actionGlyphHtml('ability', dev, ctx.input)); }   // TT6: an icon
      flag(this.compEl, 'is-nap', (c.napT ?? 0) > 0);
    }
  }

  // ------------------------------------------------------------------ per frame
  /** @param {number} dt real seconds */
  /**
   * TOKENTAILS-PLAN §10.2.6: the objective line from the beacon's guide (`ctx.ui.beacon.objective`: textKey + vars, or
   * a quest's text), clipped to 40 characters, glyphs for the current device. DOM writes only on change; the phone
   * placement under the hearts is re-measured at 4 Hz.
   */
  _guideLine(dt) {
    const ctx = this.ctx, g = ctx.ui?.beacon?.objective ?? null, dev = ctx.input?.device ?? 'kbm';
    const raw = g ? (g.textKey ? txt(ctx, g.textKey, g.vars) : txt(ctx, g.text, g.vars)) : '';
    const text = raw ? clipObjective(raw) : '';
    const key = `${text}|${dev}|${ctx.input?.preset ?? ''}`;
    if (key !== this._guideKey) {
      this._guideKey = key;
      this.guideRaw = text;                // TT5: the line as written ([action] tokens kept; prompts.js dedupes the hint)
      this.guideText = glyphText(text, dev, ctx.input);      // TT6: plain words ("right mouse button"), never "RMB"
      setHtml(this.guideTxt, text ? glyphify(text, dev, ctx.input) : '');
      flag(this.guideEl, 'is-on', !!text);
    }
    const uiRoot = ctx.ui?.root;
    if (!text) { if (uiRoot) flag(uiRoot, 'has-guide-under', false); return; }
    flag(this.guideEl, 'is-dim', !!ctx.ui?.beacon?.dim);
    // TT4: while a guide bubble (Pearl's practice lines) shows the same line in its chip, the pill steps aside (the
    // controls pass saw every practice step twice)
    const gp = ctx.ui?.prompts?.guide, gc = gp?.open ? gp.cur?.p : null;
    flag(this.guideEl, 'is-dup', !!gc?.textKey && txt(ctx, gc.textKey, gc.vars) === raw);
    if ((this._guidePosT -= dt) > 0) return;
    this._guidePosT = 0.25;
    const W = typeof innerWidth === 'number' ? innerWidth : 1280, H = typeof innerHeight === 'number' ? innerHeight : 720;
    const under = isPhone(dev, W, H);
    flag(this.guideEl, 'is-under', under);
    // (under the hearts it leaves the top-centre column: .hud-tc is transformed, so it is positioned from the hud root)
    const home = under ? this.root : this.tcEl;
    if (this.guideEl.parentNode !== home) { if (under) home.appendChild(this.guideEl); else home.insertBefore(this.guideEl, home.firstChild); }
    if (under) {
      const r = this.heartsEl.getBoundingClientRect?.();
      // under the last shown stats row: once the Grit shields / Valor sword are revealed the line no longer covers them
      if (r && r.width > 0) {
        // TT3 R3: never over a top-band button to its right (the portrait ❚❚ sat under it, the counters can) or the Skip
        // chip: below them, from the HUD's left edge, wrapping to two lines short of the chip (pillPlace)
        flag(this.guideEl, 'is-wrap', false);
        const pr = this.guideEl.getBoundingClientRect?.(), tl = this.tlEl.getBoundingClientRect?.();
        const at = pillPlace({
          x: Math.round(r.left), y: Math.round(this._statsBottom(r.bottom) + 6), pw: pr?.width ?? 0, ph: pr?.height ?? 0, H,
          rects: ctx.ui?.screenOccluders?.()?.rects ?? [], chip: ctx.ui?.skipChipRect?.() ?? null,
          left: tl?.width > 0 ? Math.round(tl.left) : Math.round(r.left), leftBottom: tl?.height > 0 ? tl.bottom : 0,
        });
        flag(this.guideEl, 'is-wrap', at.maxW != null);
        setVar(this.guideEl, '--gw', at.maxW != null ? `${at.maxW}px` : '');
        const gx = at.x, gy = at.y;
        setVar(this.guideEl, '--gx', `${gx}px`); setVar(this.guideEl, '--gy', `${gy}px`);
        // TT4: the lesson card (.ui-hint) steps below the line on phones (it covered the objective pill at 390×844)
        const gb = this.guideEl.getBoundingClientRect?.();
        if (uiRoot && gb?.height > 0) setVar(uiRoot, '--guide-b', `${Math.ceil(gb.bottom)}px`);
      }
    }
    if (uiRoot) flag(uiRoot, 'has-guide-under', under);
  }

  /** The bottom (CSS px) of the shown stats rows: the hearts, plus Grit / Valor while they are not tucked away. */
  _statsBottom(heartsBottom) {
    let b = heartsBottom;
    const cl = this.root.classList;
    for (const [e, tuck] of [[this.gritEl, 'tuck-grit'], [this.valorEl, 'tuck-valor']]) {
      if (cl.contains(tuck)) continue;
      const q = e.getBoundingClientRect?.();
      if (q && q.height > 0) b = Math.max(b, q.bottom);
    }
    return b;
  }

  /**
   * TT3 R3 (§10.2.10): on phones the toast slot leaves the top-centre column for its own place (`phoneToastBox`), and in
   * portrait the guide bubble keeps off Clem (`bubbleTop`, written as `--gd-top` on the bubble; guidance.css reads it).
   * Desktop puts the slot back in the column. Measured at 1 / TOAST_PHONE.rate Hz, DOM writes only on change.
   */
  _phoneLayout(dt) {
    if ((this._toastT -= dt) > 0) return;
    this._toastT = TOAST_PHONE.rate;
    const slot = this.toastSlot, ctx = this.ctx;
    if (!slot || typeof innerWidth !== 'number') return;
    const W = innerWidth, H = innerHeight, phone = isPhone(ctx.input?.device ?? 'kbm', W, H);
    const bubble = ctx.ui?.prompts?.guide?.root ?? null;
    flag(slot, 'is-phone', phone);
    if (!phone) {
      if (slot.parentNode !== this.tcEl) this.tcEl.appendChild(slot);
      this.toastBox = null;
      if (bubble) setVar(bubble, '--gd-top', '');
      return;
    }
    if (slot.parentNode !== this.root) this.root.appendChild(slot);
    // the top-left block: the portrait / stats, and the objective line under the hearts
    let top = 0;
    const tl = this.tlEl.getBoundingClientRect?.();
    if (tl && tl.height > 0) top = tl.bottom;
    const hr = this.heartsEl.getBoundingClientRect?.();
    if (hr && hr.height > 0) top = Math.max(top, this._statsBottom(hr.bottom));
    // the companion portrait under the left block (a toast covered 8 % of it on a 667 × 375 phone)
    const cp = this.compEl?.isConnected && this.compEl.offsetParent !== null ? this.compEl.getBoundingClientRect?.() : null;
    if (cp && cp.height > 0 && cp.top < H / 2) top = Math.max(top, cp.bottom);
    if (this.guideEl.classList.contains('is-on') && this.guideEl.classList.contains('is-under')) {
      const g = this.guideEl.getBoundingClientRect?.();
      if (g && g.height > 0) top = Math.max(top, g.bottom);
    }
    const lefty = typeof document !== 'undefined' && document.body?.classList?.contains('ui-lefty');
    const box = this.toastBox = phoneToastBox({ W, H, top, chip: ctx.ui?.skipChipRect?.() ?? null, lefty });
    setVar(slot, '--tx', `${box.x}px`); setVar(slot, '--ty', `${box.y}px`); setVar(slot, '--tw', `${box.w}px`);
    flag(slot, 'is-right', box.right);
    // portrait: Clem stands under the top band (the guide look-ahead lifts her toward it): the toasts stack only as deep
    // as fits above her (at least one), and the guide bubble goes under the toasts but never over her
    const toasts = ctx.ui?.toasts;
    const p = ctx.player?.pos, sp = W < H && p ? ctx.cam?.worldToScreen?.({ x: p.x, y: p.y + 0.5, z: p.z }) : null;
    const cy = sp && Number.isFinite(sp.y) && sp.y > 0 && sp.y < H ? sp.y : NaN;
    if (toasts) toasts.cap = W < H ? toastCap(cy - TOAST_PHONE.clemUp - box.y) : null;
    if (!bubble) return;
    if (W > H || !bubble.classList.contains('is-on')) { setVar(bubble, '--gd-top', ''); return; }
    const sr = slot.getBoundingClientRect?.(), floor = Math.max(box.y, sr && sr.height > 0 ? sr.bottom : box.y) + TOAST_PHONE.gap;
    const tcb = parseFloat(ctx.ui?.root?.style?.getPropertyValue?.('--tc-b')) || 0;
    const base = Math.max(TOAST_PHONE.bubbleTop, tcb + TOAST_PHONE.gap, floor);
    let ceil = H - TOAST_PHONE.gutter;
    for (const r of ctx.ui?.screenOccluders?.()?.rects ?? []) if (r.y > H / 2) ceil = Math.min(ceil, r.y - TOAST_PHONE.gap);
    const h = bubble.getBoundingClientRect?.()?.height ?? 0;
    const t = bubbleTop({ base, h, clemTop: cy - TOAST_PHONE.clemUp, clemBottom: cy + TOAST_PHONE.clemDown, floor, ceil });
    setVar(bubble, '--gd-top', `${Math.round(t)}px`);
  }

  render(dt) {
    this._guideLine(dt);
    this._phoneLayout(dt);
    this._pollT += dt;
    if (this._pollT >= 0.1) { const pt = this._pollT; this._pollT = 0; this.poll(false); this._tick(pt); }
    const ctx = this.ctx, p = ctx.player;
    // valor: ease toward the target; gold state at 100 / Golden Hour drain
    const vt = this.valorTarget ?? 0;
    this.valorShown += (vt - this.valorShown) * Math.min(1, dt * 10);
    if (Math.abs(vt - this.valorShown) < 0.05) this.valorShown = vt;
    const w = BLADE.x1 - BLADE.x0 + (BLADE.tip - BLADE.x1);
    const full = vt >= PLAYER.valor.max - 0.01;
    const gold = this.golden || full;
    const fv = this.golden ? this.goldenFrac : this.valorShown / PLAYER.valor.max;
    const fw = (fv * w).toFixed(1);
    if (this.v.vw !== fw || this.v.vgold !== gold) {
      this.v.vw = fw; this.v.vgold = gold;
      this.vFill.setAttribute('width', gold ? '0' : fw);
      this.vGold.setAttribute('width', gold ? fw : '0');
    }
    flag(this.valorEl, 'is-half', vt >= PLAYER.valor.max * 0.5);
    flag(this.valorEl, 'is-full', full || this.golden);
    // the sun glyph promises Golden Hour: only once it is possible (Shard 2, same check as the touch Golden button)
    flag(this.valorEl, 'can-golden', this.golden || (full && (ctx.state?.shards ?? 0) >= 2));
    // a shine sweeps the blade while full: a CSS animation on .is-full (PERF §10.5: no per-frame attribute writes)
    // companion ring
    const c = this.v.comp != null && this.compEl.classList.contains('is-on') ? ctx.companions?.active?.[0] : null;
    if (c && this.compRing) {
      const r = Math.max(0, Math.min(1, c.readiness ?? (c.cooldown > 0 ? 0 : 1)));
      const off = (I.RING_LEN * (1 - r)).toFixed(1);
      if (this.v.ring !== off) { this.v.ring = off; this.compRing.setAttribute('stroke-dashoffset', off); }
      flag(this.compEl, 'is-ready', r >= 1 && !((c.napT ?? 0) > 0));
    }
    // boss bar
    this._renderBoss(dt);
    // objective done flourish → hide
    if (this.objDoneT > 0 && (this.objDoneT -= dt) <= 0) {
      const cur = this.objCur ? this.objs.get(this.objCur) : null;
      if (cur?.done) { this.objs.delete(this.objCur); this.objCur = null; for (const [id, o] of this.objs) if (!o.done) this.objCur = id; }
      this._drawObjective();
    }
    if (this.stillT > 0) this.stillT -= dt;
    if (this.saveT > 0 && (this.saveT -= dt) <= 0) flag(this.saveEl, 'is-on', false);
    this._renderWorld(dt, p);
  }

  _renderBoss(dt) {
    const b = this.boss;
    if (!b) return;
    if (this.bossOut > 0 && (this.bossOut -= dt) <= 0) { this._bossHide(); return; }
    if (b.alive === false && this.bossOut <= 0) this.bossOut = 1.6;
    if (this.bonked && !bonkedShown(b, true)) this._bonk(false);      // back on its feet (a rally): no stamp over a live boss
    const f = frac(b.hp ?? 0, this.bossMax);
    if (f < this.bossChipV) {
      if (this._bossLast != null && f < this._bossLast - 1e-4) this.bossHold = CHIP_HOLD;
      if (this.bossHold > 0) this.bossHold -= dt; else this.bossChipV = Math.max(f, this.bossChipV - CHIP_RATE * dt);
    } else this.bossChipV = f;
    this._bossLast = f;
    setVar(this.bossFill, '--f', f.toFixed(4));
    setVar(this.bossChip, '--f', this.bossChipV.toFixed(4));
  }

  /** World point (actor feet + `up`) → screen px, or null when behind the camera / far off screen. */
  _proj(a, up, W, H) {
    const cam = this.ctx.camera;
    _v.copy(a.pos); _v.y += up;
    _d.copy(_v).sub(cam.position);
    if (_d.dot(cam.getWorldDirection(_dir)) <= 0) return null;
    _v.project(cam);
    if (Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) return null;
    _sp.x = (_v.x * 0.5 + 0.5) * W; _sp.y = (-_v.y * 0.5 + 0.5) * H;
    return _sp;
  }

  /** Lock reticle, enemy HP pips, riposte prompt (world → screen via the camera). */
  _renderWorld(dt, p) {
    const ctx = this.ctx, cam = ctx.camera;
    const W = window.innerWidth, H = window.innerHeight;
    const iso = ctx.cam?.isIso === true;
    const lock = this.visible && !this.meme && cam ? ctx.cam?.lockTarget : null;
    // CONTROLS_SPEC C8: no centre-screen reticle in iso (fx draws the gold ground ring); the selection shows its HP pips
    const lp = !iso && lock && lock.alive !== false ? this._proj(lock, (lock.height ?? 1) * 0.55, W, H) : null;
    flag(this.reticle, 'is-on', !!lp);
    // iso: hpBars.js draws the §10.4 world pills (damaged / selected / hovered); these pips are the classic camera's
    if (lp) {
      place(this.reticle, lp.x, lp.y);
      this._pips(this.retPips, lock, lock !== this.boss && this.hits.has(lock));
    }
    // recent hits → pip bars above heads (not the locked one: its pips sit under the reticle)
    let i = 0;
    for (const [e, t] of this.hits) {
      const nt = t + dt;
      if (nt > PIP_LIFE || e.alive === false || e.hp <= 0) { this.hits.delete(e); continue; }
      this.hits.set(e, nt);
      if (iso || e === lock || i >= this.pipEls.length || !this.visible || this.meme || !cam) continue;
      const sp = this._proj(e, (e.height ?? 1) + 0.35, W, H);
      if (!sp) continue;
      const pe = this.pipEls[i++];
      flag(pe, 'is-on', true);
      setVar(pe, '--a', Math.min(1, (PIP_LIFE - nt) / 0.6).toFixed(2));
      place(pe, sp.x, sp.y);
      this._pips(pe, e, true);
    }
    for (; i < this.pipEls.length; i++) flag(this.pipEls[i], 'is-on', false);
    // riposte prompt (§7.3: "Parried! ... a Riposte prompt")
    const rt = p && (p.riposteT ?? 0) > 0 && p.riposteTarget && this.visible && !this.meme && cam ? p.riposteTarget : null;
    flag(this.riposte, 'is-on', !!rt);
    if (rt) {
      const sp = this._proj(rt, (rt.height ?? 1) + 0.9, W, H);
      const dev = ctx.input?.device ?? 'kbm', rk = `${dev}|${actionGlyph('attack', dev, ctx.input)}`;
      if (this._riposteK !== rk) { this._riposteK = rk; setHtml(this.riposte, `${actionGlyphHtml('attack', dev, ctx.input)}<span>${esc(tx(ctx, 'hud.riposte'))}</span>`); }
      if (sp) place(this.riposte, sp.x, sp.y); else place(this.riposte, W * 0.5, H * 0.38);
    }
  }

  _pips(host, e, on) {
    flag(host, 'has-pips', on);
    if (!on) return;
    const max = Math.max(1, e.maxHp ?? 1), n = Math.max(1, Math.min(10, Math.ceil(max / 10)));
    const filled = Math.max(0, Math.min(n, Math.ceil(((e.hp ?? 0) / max) * n)));
    const key = `${n}/${filled}`;
    if (host._pk === key) return;
    host._pk = key;
    let html = '';
    for (let k = 0; k < n; k++) html += `<i class="${k < filled ? 'f' : ''}"></i>`;
    host.innerHTML = html;
  }

  dispose() { for (const off of this._offs) off(); this._offs.length = 0; this.root.remove(); }
}

const _dir = new THREE.Vector3(), _d = new THREE.Vector3(), _sp = { x: 0, y: 0 };
