// src/ui/results.js  (owner: ui) — the §14.3 Results screen: time, kittens n/3, letter, fish, lives left, then the
// rank stamp (§6.8 Paw-some / Purr-fect / Mew-tiful, by lives lost) with a wax-seal thump. `levels.exit` awaits
// `ui.showResults(payload)`; it resolves on confirm / click ("Onward"), or by itself after a short beat in ?test so
// smoke runs that walk through an exit never wait on a human.
import { el, flag, pulse } from './dom.js';
import { tx, formatTime, esc, rankFor, RANK_KEYS } from './text.js';
import * as I from './icons.js';

export const RESULTS = Object.freeze({ rowGap: 0.28, stampAt: 0.25, minShow: 0.9, testAuto: 1.6 });

/**
 * Display rows for a results payload ({levelId, time, kittens, kittensTotal, letter, fish, lives, livesLost, rank}). Pure.
 * @returns {{ rows: {id:string, label:string, value:string, good?:boolean}[], rank: string, rankText: string }}
 */
export function resultRows(ctx, p) {
  const r = p ?? {};
  const rank = RANK_KEYS[r.rank] ? r.rank : rankFor(r.livesLost ?? 0);
  const total = r.kittensTotal ?? 3;
  const lives = r.lives == null || !Number.isFinite(r.lives) ? tx(ctx, 'results.infinite') : String(r.lives);
  return {
    rows: [
      { id: 'time', label: tx(ctx, 'results.time'), value: formatTime(r.time ?? 0) },
      { id: 'kittens', label: tx(ctx, 'results.kittens'), value: `${r.kittens ?? 0}/${total}`, good: (r.kittens ?? 0) >= total },
      { id: 'letter', label: tx(ctx, 'results.letter'), value: r.letter ? '✓' : '—', good: !!r.letter },
      { id: 'fish', label: tx(ctx, 'results.fish'), value: `+${Math.max(0, r.fish ?? 0)}` },
      { id: 'lives', label: tx(ctx, 'results.lives'), value: lives },
    ],
    rank, rankText: tx(ctx, RANK_KEYS[rank]),
  };
}

export class Results {
  /** @param {any} ctx @param {HTMLElement} parent @param {{ onClose?: () => void, sfx?: (id: string) => void }} hooks */
  constructor(ctx, parent, hooks = {}) {
    this.ctx = ctx; this.hooks = hooks;
    this.root = el('div', 'ui-results ui-screen', { parent });
    this.open = false;
    this.t = 0;
    this._resolve = null;
    /** ?test: continue by itself after the stamp (smoke runs walking through an exit never wait on a human). */
    this.autoContinue = !!ctx.params?.test;
    this.root.addEventListener('click', (e) => { if (this.open && e.target.closest('.res-next')) this.close(); });
  }

  /** Show the screen; resolves when the player continues. */
  show(payload) {
    if (this.open) this.close();
    const ctx = this.ctx, d = resultRows(ctx, payload);
    const icons = { time: I.sun('#D9B26A'), kittens: I.catHead({ fur: '#E3C9A2', deep: '#C9A47A', bow: false, eyes: '#5E8FA8' }), letter: I.letter(!!payload?.letter), fish: I.fish(), lives: I.catHead() };
    const region = payload?.levelId ? tx(ctx, `region.${payload.levelId}`) : '';
    let rows = '';
    d.rows.forEach((r, i) => {
      rows += `<div class="res-row${r.good ? ' is-good' : ''}" style="--i:${i}"><span class="res-ico">${icons[r.id] ?? ''}</span><span class="res-lbl">${esc(r.label)}</span><span class="res-val">${esc(r.value)}</span></div>`;
    });
    this.root.innerHTML = `<div class="panel res-panel"><div class="res-head"><div class="res-title">${esc(tx(ctx, 'results.title'))}</div><div class="res-region">${esc(region)}</div></div>`
      + `<div class="res-rows">${rows}</div>`
      + `<div class="res-rank"><span class="res-rank-lbl">${esc(tx(ctx, 'results.rank'))}</span><div class="res-stamp res-stamp--${d.rank}">${I.waxSeal(d.rank === 'pawsome' ? '#D9668A' : d.rank === 'purrfect' ? '#C28A3A' : '#8E7AB5', 'paw')}<span>${esc(d.rankText)}</span></div></div>`
      + `<button class="btn btn--candy res-next" type="button">${esc(tx(ctx, 'results.next'))}</button></div>`;
    this.rows = [...this.root.querySelectorAll('.res-row')];
    this.stamp = this.root.querySelector('.res-stamp');
    this.btn = this.root.querySelector('.res-next');
    this.open = true; this.t = 0; this._stamped = false; this._shown = 0;
    flag(this.root, 'is-on', true);
    return new Promise((r) => { this._resolve = r; });
  }

  close() {
    if (!this.open) return;
    this.open = false;
    flag(this.root, 'is-on', false);
    const r = this._resolve; this._resolve = null;
    this.hooks.onClose?.();
    r?.();
  }

  /** Input (fixed step). */
  update(dt, input) {
    if (!this.open) return;
    if (this.t >= RESULTS.minShow && (input?.pressed('confirm') || input?.pressed('interact') || input?.pressed('attack') || input?.pressed('jump'))) {
      this.hooks.sfx?.('ui.confirm');
      this.close();
    }
  }

  /** Reveal rows one by one, then thump the stamp. @param {number} dt real seconds */
  render(dt) {
    if (!this.open) return;
    this.t += dt;
    const n = Math.min(this.rows.length, Math.floor(this.t / RESULTS.rowGap) + 1);
    for (; this._shown < n; this._shown++) { flag(this.rows[this._shown], 'is-in', true); this.hooks.sfx?.('ui.select'); }
    const stampAt = this.rows.length * RESULTS.rowGap + RESULTS.stampAt;
    if (!this._stamped && this.t >= stampAt) { this._stamped = true; pulse(this.stamp, 'is-stamped'); this.hooks.sfx?.('ui.stamp'); flag(this.btn, 'is-in', true); }
    if (this.autoContinue && this.t >= Math.max(RESULTS.testAuto, stampAt + 0.3)) this.close();
  }

  dispose() { this.close(); this.root.remove(); }
}

