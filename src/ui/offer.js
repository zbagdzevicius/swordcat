// src/ui/offer.js  (owner: ui) — WARM_ADVENTURE_SPEC §6.3 / ON §3.3 "offer, don't ask": the Kitten-mode offer.
//
// A friend's bubble (Mochi once he has joined, else Pearl) asks "Want gentler bonks? You can switch anytime." with two
// chips [Yes please] [I got this]. Yes → difficulty 'kitten' (through applySetting, so the player re-reads its rules)
// and the toast `offer.kitten.toast`. Shown ONCE per save (flag `seen.offer.kitten`), never on Kitten / Nine Lives.
// Triggers: the 2nd knock-out within STORY.kittenOffer.windowS s (counted here), or story's own call
// `ui.offerKitten()` (the 3rd failed parry in practice). The chips take input, so while open they are a SafeFrame
// occluder of kind `chip` (occluders.js). Not modal: the game keeps running; the bubble goes by itself after OFFER.ttl.
// TT5 (messages.js): the offer is a P0 message. It waits (up to OFFER.waitMax s) while a celebration card, the shelter
// card or the results card is up or queued, and hides the lower layers while it shows.
import { STORY } from '../core/config.js';
import { E } from '../core/events.js';
import { el, flag, setText, setHtml, pulse } from './dom.js';
import { tx } from './text.js';
import { applySetting } from './settings.js';
import { portraitSVG } from './portraits.js';

export const OFFER = Object.freeze({ flag: 'seen.offer.kitten', ttl: 12, waitMax: 30, ...(STORY?.kittenOffer ?? { knockouts: 2, windowS: 180, failedParries: 3 }) });

/**
 * Should the offer show now? Pure. `kos` = knock-out times (s, game clock), `now` = the clock.
 * @param {{ difficulty?: string, seen?: boolean, kos?: number[], now?: number, force?: boolean }} s
 */
export function offerDue(s) {
  if (s.seen || s.difficulty === 'kitten' || s.difficulty === 'nine') return false;
  if (s.force) return true;
  const kos = s.kos ?? [], now = s.now ?? 0;
  let n = 0;
  for (const t of kos) if (now - t <= OFFER.windowS) n++;
  return n >= OFFER.knockouts;
}

export class KittenOffer {
  /** @param {any} ctx @param {HTMLElement} parent @param {any} ui the facade (toast, occluders) */
  constructor(ctx, parent, ui) {
    this.ctx = ctx; this.ui = ui;
    this.root = el('div', 'ui-offer', { parent });
    this.root.innerHTML = '<div class="of-bubble"><div class="of-face"></div><div class="of-q"></div></div>'
      + '<div class="of-chips"><button type="button" class="of-chip of-yes"></button><button type="button" class="of-chip of-no"></button></div>';
    this.face = this.root.querySelector('.of-face');
    this.q = this.root.querySelector('.of-q');
    this.yes = this.root.querySelector('.of-yes');
    this.no = this.root.querySelector('.of-no');
    const stop = (e) => { e.stopPropagation(); };
    for (const b of [this.yes, this.no]) { b.addEventListener('pointerdown', stop); b.addEventListener('pointerup', stop); }
    this.yes.addEventListener('click', (e) => { e.stopPropagation(); this.answer(true); });
    this.no.addEventListener('click', (e) => { e.stopPropagation(); this.answer(false); });
    this.open = false; this.t = 0;
    this.kos = [];
    this._resolve = null;
    this._pending = null;          // TT5: an offer waiting for a card / modal to clear { speaker, t, resolve }
    this._offs = [
      ctx.bus.on(E.PLAYER_LIFE_LOST, (p) => {
        if (p?.gameOver) return;
        const now = ctx.game?.time ?? 0;
        this.kos.push(now);
        if (this.kos.length > 8) this.kos.shift();
        if (this._due()) this.ui?._after?.(2.2, () => this.offer());     // after the boing-back (WA §5.7)
      }),
      ctx.bus.on(E.LEVEL_LOADING, () => { if (this.open) this._close(); this._drop(); }),
    ];
  }

  _seen() { return !!this.ctx.state?.getFlag?.(OFFER.flag); }

  _due(force = false) {
    return offerDue({ difficulty: this.ctx.state?.difficulty, seen: this._seen(), kos: this.kos, now: this.ctx.game?.time ?? 0, force });
  }

  /**
   * Show the offer (story calls this for the practice parry rule). Resolves true (switched), false (declined /
   * timed out) or null (not shown: already seen, already Kitten, a screen is open).
   * @param {{ speaker?: string }} [o]
   */
  offer({ speaker = null } = {}) {
    if (this.open || !this._due(true) || this.ui?.busy) return Promise.resolve(null);
    // TT5: never over a celebration card, the shelter card or the results: wait for them (messages.js)
    const m = this.ui?.messages;
    if (m && !m.modalMayOpen('offer')) {
      if (this._pending) return Promise.resolve(null);
      return new Promise((r) => { this._pending = { speaker, t: 0, resolve: r }; });
    }
    return this._show(speaker);
  }

  /** A waiting offer gives up (level load, waited too long). */
  _drop() { const p = this._pending; this._pending = null; p?.resolve?.(null); }

  _show(speaker) {
    const ctx = this.ctx;
    try { ctx.state?.setFlag?.(OFFER.flag, true); } catch { /* state optional */ }
    const who = speaker ?? (ctx.companions?.active?.some?.((c) => (c.kittenId ?? c.id) === 'mochi') ? 'mochi' : 'pearl');
    setHtml(this.face, portraitSVG(who, { expression: 'happy' }));
    setText(this.q, tx(ctx, 'offer.kitten.q'));
    setText(this.yes, tx(ctx, 'offer.kitten.yes'));
    setText(this.no, tx(ctx, 'offer.kitten.no'));
    this.open = true; this.t = 0;
    flag(this.root, 'is-on', true);
    this.ui?.messages?.placeOffer?.(this.root);          // TT5: off the HUD block and the touch buttons
    pulse(this.root, 'is-enter');
    this.ui?.occluders?.invalidate?.();
    return new Promise((r) => { this._resolve = r; });
  }

  /** The player picked a chip. */
  answer(yes) {
    if (!this.open) return;
    const ctx = this.ctx;
    if (yes) {
      applySetting(ctx, 'difficulty', 'kitten');
      this.ui?.toast?.(tx(ctx, 'offer.kitten.toast'), { key: 'offer.kitten.toast' });
      try { ctx.audio?.play2D?.('ui.confirm'); } catch { /* audio optional */ }
    } else { try { ctx.audio?.play2D?.('ui.click'); } catch { /* audio optional */ } }
    this._close(yes);
  }

  _close(v = false) {
    this.open = false;
    flag(this.root, 'is-on', false);
    this.ui?.occluders?.invalidate?.();
    const r = this._resolve; this._resolve = null; r?.(v);
  }

  /** @param {number} dt real seconds @param {boolean} vis */
  render(dt, vis) {
    const p = this._pending;
    if (p && !this.open) {
      if ((p.t += dt) > OFFER.waitMax) this._drop();
      else if (vis && !this.ui?.busy && this.ui?.messages?.modalMayOpen?.('offer') !== false) {
        this._pending = null;
        if (!this._due(true)) p.resolve(null);
        else this._show(p.speaker).then(p.resolve);
      }
    }
    if (!this.open) return;
    // the HUD or the touch buttons moved (play just started, rotation, layout edit): find a free spot again
    const m = this.ui?.messages, v = this.ui?.screenOccluders?.()?.version;
    if (m && v !== undefined && v !== m.offerVer) m.placeOffer?.(this.root);
    flag(this.root, 'is-dim', !vis);
    if ((this.t += dt) >= OFFER.ttl) this._close(false);
  }

  dispose() { for (const off of this._offs) off(); this.root.remove(); }
}
