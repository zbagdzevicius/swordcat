// src/shelter/card.js  (owner: R, TOKENTAILS-PLAN §12.3 card contract): the rescued cat card, and the shelter boot.
//
// installShelter(ctx, ui): builds the roster (ctx.shelter), gives the slots their real names through strings, keeps the
// saved slots in sync with the save file and opens a ShelterCard after each save.
//
// The card: after the celebration (and any join scene) it pauses the game like a lesson card and shows the real photo
// (or the card art, else the procedural portrait), the name, the live status and "Meet them at Pink Paw, Kaunas.". It
// emits SHELTER_CARD_OPEN { slot, kind, cat, actionsEl, alreadySaved } where `actionsEl` is a container T (treat.js)
// mounts its button and panel into, and SHELTER_CARD_CLOSE { slot } on close. Continue (Esc / pad B) always works,
// also while a treat is sending. Saves that arrive in a burst (the war-wagon cage) show one after another.
// Nav: the buttons / links in actionsEl (rebuilt on its `shelter:actions-changed` event) come before Continue; Enter /
// pad A clicks the focused one; the focus starts on `[data-treat="send"]` when it is there.
import css from './card.css?inline';
import { E } from '../core/events.js';
import { Roster, imageUrl, slotKind, SLOTS, LOST_SLOTS, SQUIRE_SLOTS, SERVICE_SLOTS, CAT_SAVED } from './roster.js';
export { emitCatSaved, catSavedPayload } from './roster.js';
import { setRealNames, storyName, addStrings, has as hasString } from '../story/strings.js';
import { UI_STRINGS } from '../ui/text.js';
import { FALLBACK as LINE_FALLBACK } from '../companions/lines.js';
import { SERVICE_FLAGS } from '../companions/steering.js';
import { portraitSVG } from '../ui/portraits.js';
import { alertedNear } from '../ui/celebrate.js';
import { CELEBRATE } from '../core/config.js';

const CARD_OPEN = E.SHELTER_CARD_OPEN ?? 'shelter:card-open';
const CARD_CLOSE = E.SHELTER_CARD_CLOSE ?? 'shelter:card-close';

/** Seconds after the save before the card may open (the reunion boop plays first). */
export const CARD_DELAY = 1.2;
/** TT5 integration: the longest a queued card waits on an alerted foe nearby (s); a foe that cannot reach her never holds it */
export const CARD_FIGHT_WAIT_MAX = 25;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Slots the save file says are saved (lost kittens, squires, service flags). */
export function savedSlotsFromState(st) {
  if (!st) return [];
  const out = [];
  for (const k of st.kittens ?? []) if (LOST_SLOTS.includes(k)) out.push(k);
  for (const k of st.companions?.unlocked ?? []) if (SQUIRE_SLOTS.includes(k)) out.push(k);
  for (const k of SERVICE_SLOTS) { try { if (SERVICE_FLAGS[k] && st.getFlag?.(SERVICE_FLAGS[k])) out.push(k); } catch { /* state optional */ } }
  return out;
}

/**
 * Rows the ui or the companions keep outside strings.js that use a slot's story name ("Mochi joined the party!") are
 * copied into strings so t() swaps in the real name. Returns the number copied.
 */
export function mirrorNamedRows() {
  const names = SLOTS.map(storyName).filter(Boolean);
  const re = new RegExp(`(?<![\\p{L}])(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}])`, 'u');
  const rows = {};
  for (const table of [UI_STRINGS, LINE_FALLBACK]) {
    for (const [k, v] of Object.entries(table ?? {})) if (typeof v === 'string' && !hasString(k) && re.test(v)) rows[k] = v;
  }
  return addStrings(rows);
}

/** Card view data (pure): what the card shows for a slot. */
export function cardInfo(ctx, cat, slot) {
  const t = (k, v) => ctx?.strings?.t?.(k, v) ?? k;
  const status = cat && !cat.gone && cat.status ? t(`shelter.status.${cat.status}`) : '';
  return {
    name: cat?.name ?? t(`name.${slot}`),
    kicker: cat ? t('shelter.card.kicker') : '',
    status: status.startsWith('shelter.') ? '' : status,
    meet: cat ? t('shelter.card.meet') : '',
    img: cat ? imageUrl(cat.photo ?? cat.art ?? null) : null,
    continue: t('shelter.card.continue'),
  };
}

export class ShelterCard {
  /** @param {any} ctx @param {HTMLElement} parent the ui root @param {any} ui the UI facade (freeze / unfreeze) */
  constructor(ctx, parent, ui) {
    this.ctx = ctx; this.ui = ui;
    this.queue = [];
    this.open = false;
    this.cur = null;
    this.shown = 0;
    this.waitT = 0;
    if (typeof document !== 'undefined' && !document.getElementById('shelter-card-style')) {
      const st = document.createElement('style'); st.id = 'shelter-card-style'; st.textContent = css; document.head.appendChild(st);
    }
    const root = this.root = document.createElement('div');
    root.className = 'sh-card';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('data-testid', 'shelter-card');
    root.innerHTML = '<div class="sh-sheet"><div class="sh-pic"></div><div class="sh-body">'
      + '<div class="sh-kicker"></div><h2 class="sh-name"></h2><div class="sh-status"></div><p class="sh-meet"></p>'
      + '<div class="sh-actions" data-testid="shelter-actions"></div>'
      + '<button type="button" class="sh-continue" data-testid="shelter-continue"></button></div></div>';
    parent.appendChild(root);
    this.pic = root.querySelector('.sh-pic');
    this.kicker = root.querySelector('.sh-kicker');
    this.nameEl = root.querySelector('.sh-name');
    this.statusEl = root.querySelector('.sh-status');
    this.meetEl = root.querySelector('.sh-meet');
    this.actionsEl = root.querySelector('.sh-actions');
    this.contBtn = root.querySelector('.sh-continue');
    // the game must not read these taps as world clicks (or celebrate skips)
    for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'touchstart', 'click', 'wheel']) root.addEventListener(ev, (e) => e.stopPropagation(), { passive: ev !== 'click' });
    // A tap on the card never reaches window's touchstart, so stamp the touch here too. Otherwise the compatibility
    // mousemove after the tap flips the HUD to keyboard hints.
    root.addEventListener('touchstart', () => this.ctx.input?.noteTouch?.(), { passive: true });
    this.contBtn.addEventListener('click', () => this.close());
    this.actionsEl.addEventListener('shelter:actions-changed', () => this._rebuildNav());
    // One action per press: Enter on a focused button or link already clicks it natively (a real user gesture, so a
    // new-tab link is not blocked), so the game's own confirm for that same press is skipped in _input.
    this._nativeEnter = false;
    root.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat && e.target?.closest?.('button, a[href]')) this._nativeEnter = true;
    });
    this.items = []; this.index = 0;
    this._offs = [];
    // ?test runs (smoke, bots) keep the card off unless asked for (`?shelterCard=1` or __GAME__.shelter.cards(true)), so
    // older smoke blocks that save a kitten are not paused by it
    const qs = typeof location !== 'undefined' ? location.search : '';
    this.enabled = !ctx.params?.test || /[?&]shelterCard=1\b/.test(qs);
  }

  /** Queue a card for a save. */
  push(p) {
    if (!this.enabled) return false;
    if (!p?.slot || this.queue.some((q) => q.slot === p.slot) || this.cur?.slot === p.slot) return false;
    this.queue.push({ slot: p.slot, kind: p.kind ?? slotKind(p.slot), alreadySaved: !!p.alreadySaved });
    if (this.waitT < CARD_DELAY) this.waitT = 0;
    return true;
  }

  /**
   * Can a card open now? (play mode, no menu, no scene, no celebration on screen or waiting, no Kitten-mode offer, not
   * mid-fight, not loading). TT5: it waits while an alerted foe is within CELEBRATE.safeR m (it opened mid-fight).
   */
  canOpen() {
    const ctx = this.ctx, g = ctx.game, ui = this.ui;
    if (!g || (g.mode !== 'play' && g.mode !== 'memecam')) return false;
    if (ctx.levels?.loading || ctx.story?.isPlaying || ui?.busy || ui?.isLoading) return false;
    if (ui?.celebrations?.busy) return false;
    if (ui?.offer?.open) return false;
    if (ui?.messages && !ui.messages.modalMayOpen('shelter')) return false;
    if (ui?.menus?.titleActive) return false;
    if ((this.fightWaitT ?? 0) < CARD_FIGHT_WAIT_MAX && alertedNear(ctx, CELEBRATE?.safeR ?? 15)) return false;
    return true;
  }

  /** Per fixed step (UI.update): opens a queued card when it may, runs the open card's input. */
  update(dt, input) {
    if (this.open) { this._input(input, dt); return true; }
    if (!this.queue.length) { this.fightWaitT = 0; return false; }
    this.waitT += dt;
    // only waiting on a fight counts toward CARD_FIGHT_WAIT_MAX (menus, scenes and other modals do not)
    if (this.waitT >= CARD_DELAY && alertedNear(this.ctx, CELEBRATE?.safeR ?? 15)) this.fightWaitT = (this.fightWaitT ?? 0) + dt;
    if (this.waitT < CARD_DELAY || !this.canOpen()) return false;
    this.fightWaitT = 0;
    this._show(this.queue.shift());
    return true;
  }

  _show(q) {
    const ctx = this.ctx;
    const cat = ctx.shelter?.getCat?.(q.slot) ?? null;
    const info = cardInfo(ctx, cat, q.slot);
    this.cur = { ...q, cat };
    this.kicker.textContent = info.kicker;
    this.nameEl.textContent = info.name;
    this.statusEl.textContent = info.status;
    this.statusEl.hidden = !info.status;
    this.meetEl.textContent = info.meet;
    this.meetEl.hidden = !info.meet;
    this.contBtn.textContent = info.continue;
    this.pic.innerHTML = '';
    const portrait = () => { this.pic.innerHTML = `<div class="sh-portrait">${portraitSVG(q.slot, { expression: 'happy' })}</div>`; };
    if (info.img) {
      const img = document.createElement('img');
      img.alt = info.name; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', portrait, { once: true });
      img.src = info.img;
      this.pic.appendChild(img);
    } else portrait();
    this.actionsEl.innerHTML = '';
    this.ui?._freeze?.();
    this.open = true; this.shown++;
    this.root.classList.add('is-on');
    this._guard = 2;                                   // the press that saved the cat must not close the card
    this._rebuildNav();
    ctx.bus.emit(CARD_OPEN, { slot: q.slot, kind: q.kind, cat: cat ? { ...cat } : null, actionsEl: this.actionsEl, alreadySaved: q.alreadySaved || !!cat?.gone });
    this._rebuildNav();
    try { ctx.audio?.play2D?.('ui.bookOpen'); } catch { /* audio optional */ }
  }

  /** Close the card (Continue). Always allowed. */
  close() {
    if (!this.open) return;
    const slot = this.cur?.slot;
    this.open = false;
    this.root.classList.remove('is-on');
    this.ctx.bus.emit(CARD_CLOSE, { slot });
    this.actionsEl.innerHTML = '';
    this.cur = null; this.waitT = 0;
    this.ui?._unfreeze?.();
    if (this.ctx.game?.mode === 'menu' && !this.ui?.menus?.active) this.ctx.game.setMode?.('play');
  }

  _rebuildNav() {
    const acts = [...this.actionsEl.querySelectorAll('button:not([disabled]), a[href]')];
    const prev = this.items[this.index];
    this.items = [...acts, this.contBtn];
    const send = this.actionsEl.querySelector('[data-treat="send"]:not([disabled])');
    let i = prev && this.items.includes(prev) ? this.items.indexOf(prev) : -1;
    if (i < 0 || (send && prev === this.contBtn && !this._moved)) i = send ? this.items.indexOf(send) : this.items.length - 1;
    this._focus(i);
  }

  _focus(i) {
    const n = this.items.length;
    if (!n) return;
    this.index = ((i % n) + n) % n;
    for (const e of this.items) e.classList.remove('is-focus');
    const e = this.items[this.index];
    e.classList.add('is-focus');
    try { e.focus({ preventScroll: true }); } catch { /* old browsers */ }
  }

  _input(input, dt) {
    if (!input) return;
    const nativeEnter = this._nativeEnter; this._nativeEnter = false;
    if (this._guard > 0) { this._guard--; return; }
    if (input.pressed('back') || input.pressed('pause')) { this.close(); return; }
    const up = input.pressed('navUp') || input.pressed('navLeft'), down = input.pressed('navDown') || input.pressed('navRight');
    if (up || down) { this._moved = true; this._focus(this.index + (up ? -1 : 1)); }
    if (input.pressed('confirm') || (input.device === 'pad' && input.pressed('jump'))) {
      if (nativeEnter && input.device !== 'pad') return;
      const e = this.items[this.index];
      if (e && e.isConnected && !e.disabled) e.click();
    }
    void dt;
  }

  /** Smoke / debug: what the card shows. */
  snapshot() {
    return { open: this.open, slot: this.cur?.slot ?? null, queued: this.queue.map((q) => q.slot), shown: this.shown,
      name: this.nameEl.textContent, status: this.statusEl.hidden ? '' : this.statusEl.textContent,
      meet: this.meetEl.hidden ? '' : this.meetEl.textContent, img: this.pic.querySelector('img')?.getAttribute('src') ?? null,
      text: this.root.innerText ?? this.root.textContent };
  }

  dispose() { for (const off of this._offs) off(); this.root.remove(); }
}

/**
 * Boot the shelter roster and its card (UI.init calls this once). Returns { roster, card }.
 * @param {any} ctx @param {any} ui the UI facade (its root, freeze / unfreeze)
 */
export function installShelter(ctx, ui, { parent = ui?.root ?? null, rosterOpts = {} } = {}) {
  const apply = (r) => setRealNames(r.names());
  const roster = new Roster({ ...rosterOpts, onChange: apply });
  ctx.shelter = roster;
  apply(roster);
  mirrorNamedRows();
  roster.syncSaved(savedSlotsFromState(ctx.state));
  roster.refresh();
  const card = parent && typeof document !== 'undefined' ? new ShelterCard(ctx, parent, ui) : null;
  const offs = [
    ctx.bus.on(CAT_SAVED, (p) => {
      if (!p?.slot) return;
      const wasSaved = roster.isSaved(p.slot) && roster.getCat(p.slot)?.gone;
      roster.markSaved(p.slot);
      card?.push({ slot: p.slot, kind: p.kind, alreadySaved: !!wasSaved });
    }),
    ctx.bus.on(E.SAVE_LOADED, () => roster.syncSaved(savedSlotsFromState(ctx.state))),
  ];
  if (card) card._offs.push(...offs);
  return { roster, card };
}
