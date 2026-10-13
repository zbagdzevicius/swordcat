// src/ui/results.js  (owner: ui) — the §14.3 Results screen, warm redo (WA §4.4 / CL §8.4, ui.W5):
//
//   a warm scrim (`radial-gradient(circle at 50% 40%, #FFF1E2CC, #FFB98ACC)`) over the frozen frame (no blur, no post),
//   "Hooray! Chapter clear!" in the butter → gold logo style with the chapter's region on a lilac ribbon, her happy
//   portrait, rows that pop in on an 80 ms stagger and COUNT UP over 0.4 s (tabular numbers, a tick each), then the
//   rank stamp SLAMS (scale 2.2 → 0.92 → 1, rotate −14° → −8°, 0.3 s) with a ring of 8 DOM stars, the PIZZI sting and
//   ≤ 24 DOM confetti. Ranks are words, never letter grades: PAW-SOME! · PURR-FECT! · CLAW-SOME! · Good kitty!
//
// `levels.exit` awaits `ui.showResults(payload)`; it resolves on confirm / click ("Onward"), or by itself after a short
// beat in ?test so smoke runs that walk through an exit never wait on a human.
import { el, flag, pulse, setText } from './dom.js';
import { tx, formatTime, esc, rankFor, RANK_KEYS, RANK_ORDER } from './text.js';
import { portraitSVG } from './portraits.js';
import * as I from './icons.js';

export const RESULTS = Object.freeze({ rowGap: 0.08, countUp: 0.4, stampAt: 0.25, minShow: 0.9, testAuto: 1.6, stars: 8, confetti: 24 });

/** Stamp colour per rank (candy roles: pink, butter, sky, mint). */
const RANK_COLOR = Object.freeze({ pawsome: '#FF8FB1', purrfect: '#FFC94D', clawsome: '#8FD3FF', mewtiful: '#9BE3C4' });

/**
 * Display rows for a results payload ({levelId, time, kittens, kittensTotal, letter, fish, lives, livesLost, rank}). Pure.
 * `num` is the number a row counts up to (null for rows that only pop in).
 * @returns {{ rows: {id:string, label:string, value:string, num:number|null, good?:boolean}[], rank: string, rankText: string }}
 */
export function resultRows(ctx, p) {
  const r = p ?? {};
  const rank = RANK_KEYS[r.rank] ? r.rank : rankFor(r.livesLost ?? 0);
  const total = r.kittensTotal ?? 3;
  const finite = r.lives != null && Number.isFinite(r.lives);
  const lives = finite ? String(r.lives) : tx(ctx, 'results.infinite');
  const fish = Math.max(0, r.fish ?? 0);
  return {
    rows: [
      { id: 'time', label: tx(ctx, 'results.time'), value: formatTime(r.time ?? 0), num: Math.max(0, r.time ?? 0) },
      { id: 'kittens', label: tx(ctx, 'results.kittens'), value: `${r.kittens ?? 0}/${total}`, num: r.kittens ?? 0, good: (r.kittens ?? 0) >= total },
      { id: 'letter', label: tx(ctx, 'results.letter'), value: r.letter ? '✓' : '—', num: null, good: !!r.letter },
      { id: 'fish', label: tx(ctx, 'results.fish'), value: `+${fish}`, num: fish },
      { id: 'lives', label: tx(ctx, 'results.lives'), value: lives, num: finite ? r.lives : null },
    ],
    rank, rankText: tx(ctx, RANK_KEYS[rank]),
  };
}

/**
 * The text of a counting row at fraction `f` (0..1) of its count-up. Pure.
 * @param {{id:string, value:string, num:number|null}} row @param {number} f @param {number} [total]
 */
export function countText(row, f, total = 3) {
  if (row.num == null || f >= 1) return row.value;
  const k = Math.max(0, Math.min(1, f)), v = row.num * k;
  switch (row.id) {
    case 'time': return formatTime(v);
    case 'kittens': return `${Math.floor(v)}/${total}`;
    case 'fish': return `+${Math.floor(v)}`;
    default: return String(Math.floor(v));
  }
}

/**
 * §14.3 results per level: this run against the level's record as it stood when the level started (`prev` =
 * state.levels[id] snapshot, or null when unknown). Pure.
 * @returns {{ first: boolean, newTime: boolean, newRank: boolean, bestTime: number|null, bestRank: string|null }}
 */
export function resultBest(p, prev) {
  const r = p ?? {}, rank = RANK_KEYS[r.rank] ? r.rank : rankFor(r.livesLost ?? 0);
  const time = Number.isFinite(r.time) && r.time > 0 ? r.time : null;
  if (!prev) return { first: false, newTime: false, newRank: false, bestTime: time, bestRank: rank };
  const first = !prev.cleared;
  const pt = Number.isFinite(prev.bestTime) && prev.bestTime > 0 ? prev.bestTime : null;
  const newTime = !first && time != null && pt != null && time < pt - 0.5;
  const newRank = !first && !!prev.bestRank && RANK_ORDER.indexOf(rank) > RANK_ORDER.indexOf(prev.bestRank);
  const bestTime = pt == null ? time : time == null ? pt : Math.min(pt, time);
  const bestRank = !prev.bestRank || RANK_ORDER.indexOf(rank) > RANK_ORDER.indexOf(prev.bestRank) ? rank : prev.bestRank;
  return { first, newTime, newRank, bestTime, bestRank };
}

export class Results {
  /** @param {any} ctx @param {HTMLElement} parent @param {{ onClose?: () => void, sfx?: (id: string, o?: object) => void }} hooks */
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
  show(payload, { prev = null } = {}) {
    if (this.open) this.close();
    const ctx = this.ctx, d = resultRows(ctx, payload), b = resultBest(payload, prev);
    const ribbons = [b.first && 'ui.results.first', b.newTime && 'ui.results.newBest', b.newRank && 'ui.results.newRank'].filter(Boolean)
      .map((k) => `<span class="res-ribbon">${esc(tx(ctx, k))}</span>`).join('');
    const bestLine = prev && prev.cleared && b.bestTime != null ? `<div class="res-best">${esc(tx(ctx, 'ui.results.best', { time: formatTime(b.bestTime), rank: tx(ctx, RANK_KEYS[b.bestRank]) }))}</div>` : '';
    const icons = { time: I.sun('#FFC94D'), kittens: I.catHead({ fur: '#E3C9A2', deep: '#C9A47A', bow: false, eyes: '#5E8FA8' }), letter: I.letter(!!payload?.letter), fish: I.fish(), lives: I.catHead() };
    const region = payload?.levelId ? tx(ctx, `region.${payload.levelId}`) : '';
    let rows = '';
    d.rows.forEach((r, i) => {
      rows += `<div class="res-row${r.good ? ' is-good' : ''}" style="--i:${i}"><span class="res-ico">${icons[r.id] ?? ''}</span><span class="res-lbl">${esc(r.label)}</span><span class="res-val">${esc(countText(r, 0, payload?.kittensTotal ?? 3))}</span></div>`;
    });
    let stars = '';
    for (let i = 0; i < RESULTS.stars; i++) stars += `<i class="res-star" style="--a:${(i * 360) / RESULTS.stars}deg">${I.star4(i % 2 ? '#FFE066' : '#FFF6DA')}</i>`;
    let conf = '';
    for (let i = 0; i < RESULTS.confetti; i++) conf += `<i class="cf cf${i % 6}" style="--x:${(i * 37) % 100}vw;--d:${(1.1 + ((i * 13) % 7) * 0.12).toFixed(2)}s;--r:${((i * 53) % 360) - 180}deg;--dl:${((i * 7) % 6) * 0.07}s"></i>`;
    this.root.innerHTML = `<div class="res-confetti">${conf}</div>`
      + `<div class="panel res-panel"><div class="res-hero">${portraitSVG('swordcat', { expression: 'happy' })}</div>`
      + `<div class="res-head"><div class="res-title">${esc(tx(ctx, 'results.title'))}</div>${region ? `<div class="res-region"><span>${esc(region)}</span></div>` : ''}</div>`
      + (ribbons ? `<div class="res-ribbons">${ribbons}</div>` : '') + `<div class="res-rows">${rows}</div>`
      + `<div class="res-rank"><span class="res-rank-lbl">${esc(tx(ctx, 'results.rank'))}</span><div class="res-stamp res-stamp--${d.rank}" style="--rc:${RANK_COLOR[d.rank] ?? '#FF8FB1'}"><span class="res-stars">${stars}</span><span class="res-word">${esc(d.rankText)}</span></div></div>${bestLine}`
      + `<button class="btn btn--candy res-next" type="button">${esc(tx(ctx, 'results.next'))}</button></div>`;
    this.rows = [...this.root.querySelectorAll('.res-row')];
    this.vals = this.rows.map((r) => r.querySelector('.res-val'));
    this.data = d.rows;
    this.total = payload?.kittensTotal ?? 3;
    this.stamp = this.root.querySelector('.res-stamp');
    this.btn = this.root.querySelector('.res-next');
    this.confetti = this.root.querySelector('.res-confetti');
    this.rank = d.rank;
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

  /** Rows pop in on a stagger and count up, then the stamp slams. @param {number} dt real seconds */
  render(dt) {
    if (!this.open) return;
    this.t += dt;
    const n = Math.min(this.rows.length, Math.floor(this.t / RESULTS.rowGap) + 1);
    for (; this._shown < n; this._shown++) { flag(this.rows[this._shown], 'is-in', true); this.hooks.sfx?.('ui.select'); }
    // count up (text writes only while a row is counting; tabular numbers keep it still)
    for (let i = 0; i < this._shown; i++) {
      const f = (this.t - i * RESULTS.rowGap) / RESULTS.countUp;
      const s = countText(this.data[i], f, this.total);
      setText(this.vals[i], s);
    }
    const stampAt = (this.rows.length - 1) * RESULTS.rowGap + RESULTS.countUp + RESULTS.stampAt;
    if (!this._stamped && this.t >= stampAt) {
      this._stamped = true;
      pulse(this.stamp, 'is-stamped');
      pulse(this.confetti, 'is-on');
      this.hooks.sfx?.('rankStamp');                       // audio: PIZZI03 + the stamp (WA21)
      this.hooks.sfx?.('jingles/jingles_PIZZI03', { volume: 0.7 });
      flag(this.btn, 'is-in', true);
    }
    if (this.autoContinue && this.t >= Math.max(RESULTS.testAuto, stampAt + 0.3)) this.close();
  }

  dispose() { this.close(); this.root.remove(); }
}
