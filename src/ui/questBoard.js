// src/ui/questBoard.js  (owner: ui) — the hub Quest Board (GAME_DESIGN §12.5 "level select and replays; exit to the
// next level", §14.3 "Level cards (cleared ✓; kittens n/3; letter ✓; best rank); 'Next: {chapter}' button").
// A wooden notice board with six parchment cards pinned by pink wax seals, one per chapter. Cleared chapters can be
// replayed; the next chapter is marked; unreached ones are folded "???" notes. Picking a card resolves the board with
// { levelId, replay } — the ui then travels (world can pass `onPick` to travel itself).
//
// Model (questCards, nextLevel) is pure and node-tested; `openQuestBoard(menus)` builds the screen.
import { LEVEL_IDS } from '../core/config.js';
import { el, flag } from './dom.js';
import { tx, esc, levelKittens, levelLetterId, formatTime, chapterInfo, RANK_KEYS } from './text.js';
import * as I from './icons.js';

/** The hub's own level: never a destination from its own board. */
export const HUB_LEVEL = 'town';
const flagOn = (st, k) => !!(st?.cond ? st.cond(k) : st?.flags?.[k]);
const isDone = (st, id) => flagOn(st, `${id}.done`) || !!st?.levels?.[id]?.cleared;

/** The next chapter to play: the first level (in order) not yet done, skipping the hub. null = all done. Pure. */
export function nextLevel(st) {
  for (const id of LEVEL_IDS) if (id !== HUB_LEVEL && !isDone(st, id)) return id;
  return null;
}

/**
 * One card per level. Pure.
 * @returns {{ id:string, n:number, label:string, title:string, region:string, cleared:boolean, kittens:{n:number,max:number},
 *   letter:boolean, bestRank:string|null, bestTime:number|null, here:boolean, next:boolean, open:boolean }[]}
 */
export function questCards(ctx, currentLevel = null) {
  const st = ctx?.state, nxt = nextLevel(st);
  return LEVEL_IDS.map((id, i) => {
    const info = chapterInfo(ctx, i + 1, id);
    const rec = st?.levels?.[id] ?? {};
    const cleared = isDone(st, id);
    const here = id === (currentLevel ?? HUB_LEVEL);
    const lid = levelLetterId(id);
    return {
      id, n: i + 1, label: info.label, title: info.title, region: info.region, cleared,
      kittens: levelKittens(st, id), letter: !!lid && (st?.letters ?? []).includes(lid),
      bestRank: RANK_KEYS[rec.bestRank] ? rec.bestRank : null, bestTime: Number.isFinite(rec.bestTime) ? rec.bestTime : null,
      here, next: id === nxt, open: !here && (cleared || id === nxt),
    };
  });
}

/**
 * Open the board. Resolves with { levelId, replay } when a card / Next is chosen, or null when closed.
 * @param {import('./menus.js').Menus} menus
 */
export function openQuestBoard(menus) {
  const ctx = menus.ctx, ui = menus.ui;
  return new Promise((resolve) => {
    let picked = null;
    const cur = ctx.levels?.current?.id ?? HUB_LEVEL;
    const cards = questCards(ctx, cur);
    const e = el('div', 'ui-screen menu-screen menu--board');
    const p = el('div', 'board-frame', { parent: e });
    el('div', 'shop-sign board-sign', { parent: p, html: `<i class="sg-rope"></i><span>${esc(tx(ctx, 'board.title'))}</span>` });
    const grid = el('div', 'board-grid', { parent: p });
    const items = [];
    const choose = (c) => { picked = { levelId: c.id, replay: c.cleared }; ui.closeShop?.(); };
    cards.forEach((c, i) => {
      const card = el('div', `mi qcard${c.open ? '' : ' is-closed'}${c.cleared ? ' is-cleared' : ''}${c.next ? ' is-next' : ''}${c.here ? ' is-here' : ''}`, { parent: grid });
      card.style.setProperty('--tilt', `${[-2.2, 1.6, -1, 2, -1.6, 1.1][i % 6]}deg`);
      const known = c.cleared || c.next || c.here;
      let kits = '';
      for (let k = 0; k < c.kittens.max; k++) kits += `<span class="qc-kit${k < c.kittens.n ? ' f' : ''}">${I.catHead({ fur: k < c.kittens.n ? '#E3C9A2' : '#C9B999', deep: '#9A8B6E', bow: false, eyes: k < c.kittens.n ? '#5E8FA8' : '#8C7B66' })}</span>`;
      const rank = c.bestRank ? `<span class="qc-rank qc-rank--${c.bestRank}">${esc(tx(ctx, RANK_KEYS[c.bestRank]))}</span>` : '';
      card.innerHTML = `<span class="qc-pin">${I.waxSeal(c.next ? I.PINK_DEEP : c.cleared ? '#C28A3A' : '#B8A88A', c.cleared ? 'check' : 'paw')}</span>`
        + `<div class="qc-label">${esc(c.label)}</div>`
        + `<div class="qc-title">${esc(known ? c.title : tx(ctx, 'pause.missing'))}</div>`
        + `<div class="qc-region">${esc(known ? c.region : '')}</div>`
        + (known ? `<div class="qc-stats"><span class="qc-kits">${kits}</span><span class="qc-letter${c.letter ? ' f' : ''}">${I.letter(c.letter)}</span></div>` : '<div class="qc-stats qc-fold"></div>')
        + (c.cleared ? `<div class="qc-stamp">${esc(tx(ctx, 'board.cleared'))}</div>` : '')
        + `<div class="qc-foot">${c.bestTime != null ? `<span class="qc-time">${I.sun('#D9B26A')}<b>${esc(formatTime(c.bestTime))}</b></span>` : ''}${rank}</div>`
        + (c.here ? `<span class="qc-here">${esc(tx(ctx, 'ui.board.here'))}</span>` : c.next ? `<span class="qc-new">${esc(tx(ctx, 'ui.board.new'))}</span>` : '')
        + (c.open && c.cleared ? `<span class="qc-act">${esc(tx(ctx, 'ui.board.replay'))}</span>` : '');
      items.push({ el: card, disabled: !c.open, card: c, activate: c.open ? () => choose(c) : undefined });
    });
    const foot = el('div', 'board-foot', { parent: p });
    const nx = cards.find((c) => c.next);
    if (nx) items.push(menus._button(foot, tx(ctx, 'board.next', { chapter: `${nx.label} · ${nx.title}` }), () => choose(nx), { cls: 'board-next' }));
    else el('div', 'board-all', { parent: foot, text: tx(ctx, 'ui.board.all') });
    items.push(menus._button(foot, tx(ctx, 'menu.close'), () => ui.closeShop?.(), { cls: 'btn--plain' }));
    const s = { id: 'board', el: e, items, layer: 'pause', cols: 3, focus: nx ? cards.length : 0 };
    s.onClose = () => resolve(picked);
    s.back = () => { ui.closeShop?.(); };
    // vertical moves jump a row of cards inside the grid, but step one at a time through the footer buttons
    s.vstep = (idx, dir) => (idx < cards.length && idx + dir * 3 >= 0 && idx + dir * 3 < cards.length ? 3 : idx < cards.length && dir > 0 ? cards.length - idx : 1);
    menus.push(menus._wire(s), { sound: 'ui.bookOpen' });
    flag(e, 'has-next', !!nx);
  });
}
