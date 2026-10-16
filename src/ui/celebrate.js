// src/ui/celebrate.js  (owner: ui) — WARM_ADVENTURE_SPEC §5.4 (WA7 / WA8): ONE reward system in three sizes.
//
//   sticker  practice lessons, small firsts: an 88 px die-cut sticker at the right-centre, popIn 280 ms + 2° wiggle,
//            flies to the sticker book (the HUD counters corner) after 1.4 s; a glock third up per sticker in a row
//   card     Holy Slash, Golden Hour, Heart Bell, shard, kitten: white-gold `#ui-flash`, her `cheer`, a world burst,
//            the card at the top-centre third on a rotating butter / cream sunburst; flies into its HUD home at 1.6 s
//   friend   Mochi / Sage / Clover joining, Pink Bow, Knight-ish: a card + a 200 px portrait + ≤ 24 DOM confetti + a
//            short sting
//
// One queue, one item at a time, NEVER pauses gameplay (never touches game.timeScale / mode). TT5 (TOKENTAILS-PLAN
// §13.1, messages.js): a card is skipped only by a tap / click on the card itself (or Enter on a keyboard), never by an
// attack tap; stickers are icon toasts in the top slot; in combat (an alerted enemy within CELEBRATE.safeR m) a card /
// friend becomes an icon toast too (no flash, no pose). The card is placed by messages.js (off the HUD, the touch
// buttons and Clem, sized per viewport); its confetti stays inside the card box. A new card waits while a modal (the
// shelter card, the results, the offer) is up. Reduced motion / reduce flashes: a 120 ms fade, no confetti, no flight.
// Sources: `reward {kind, id}` (story / world / companions), `kitten:rescued`, Heart Bell pickups, shards and the
// Holy Slash / Golden Hour unlocks. Stickers also set the save flag `sticker.<id>` (the pause-menu sticker book).
// DOM only, transform / opacity animation only (CSS), 0 draws.
import { CELEBRATE, KITTEN_IDS, KITTENS_BY_LEVEL } from '../core/config.js';
import { E } from '../core/events.js';
import { el, flag, setText, setVar, setHtml, pulse } from './dom.js';
import { tx, levelKittens, glyphify } from './text.js';
import { portraitSVG, rescueBioHtml } from './portraits.js';
import * as I from './icons.js';

/** Fallback numbers when config's table is missing (node tests of older configs). */
const C = CELEBRATE ?? { skipAfter: 0.6, sticker: 1.6, card: 2.2, friend: 2.6, dockScale: 0.6, dockFly: 1.2, safeR: 15, confettiMax: 24 };

/** Seconds into an item at which it flies home (sticker 1.4 s, card / friend 1.6 s; docked: CELEBRATE.dockFly). */
export const CELEBRATE_TIMING = Object.freeze({ stickerFly: 1.4, cardFly: 1.6, fly: 0.45, pop: 0.15, glockReset: 4 });

/** The sticker set (ON §7.2) and the card / friend art: id → colour + icon. Labels are strings keys. */
export const REWARD_ART = Object.freeze({
  bonk: { color: '#F2D27A', icon: () => I.sword('#FFF8EE') },
  bow: { color: '#FF8FB1', icon: () => I.bowSvg() },
  hop: { color: '#9BE3C4', icon: () => I.jump() },
  roll: { color: '#8FCBF2', icon: () => I.tumble() },
  stand: { color: '#C9B8F0', icon: () => I.shield() },
  parry: { color: '#FFD57A', icon: () => I.glyph('star8', '#FFF8EE') },
  found: { color: '#FFB878', icon: () => I.paw('#5A3B2E') },
  knight: { color: '#FFE3A3', icon: () => I.cape('#E8534F') },
  mochi: { color: '#8FD3FF', portrait: 'mochi' },
  sage: { color: '#9BE3C4', portrait: 'sage' },
  clover: { color: '#FFD86B', portrait: 'clover' },
  holy: { color: '#FFE9A8', icon: () => I.sun('#FFD34D') },
  golden: { color: '#FFD57A', icon: () => I.sun('#FFB000') },
  heartbell: { color: '#FFC8D8', icon: () => I.bell() },
  shard: { color: '#FFF1C4', icon: () => I.shard() },
  kitten: { color: '#FFD9B8', icon: () => I.catHead({ fur: '#E3C9A2', deep: '#C9A47A', bow: false, eyes: '#5E8FA8' }) },
});

/** Where each reward flies when it is done (a HUD element id the UI resolves; WA §5.4 "its HUD home"). */
export const REWARD_HOME = Object.freeze({ kitten: 'kits', heartbell: 'hearts', shard: 'valor', holy: 'valor', golden: 'valor', mochi: 'comp', sage: 'comp', clover: 'comp', bow: 'portrait', knight: 'portrait' });

const KINDS = ['sticker', 'card', 'friend'];

/**
 * Display data for one reward (pure). Title / line keys: `sticker.<id>` for stickers; `card.<id>.title` /
 * `card.<id>.line` for cards and friends (WA §5.4 / CL §8.1; `card.kitten.line.1..3` rotate, WA23).
 * @param {any} ctx @param {'sticker'|'card'|'friend'} kind @param {string} id @param {object} [vars] @param {number} [rot]
 */
export function rewardInfo(ctx, kind, id, vars = null, rot = 0) {
  const art = REWARD_ART[id] ?? { color: '#FFE9A8', icon: () => I.star4('#FFE066') };
  if (kind === 'sticker') {
    const key = `sticker.${id}`;
    return { kind, id, title: tx(ctx, key, vars), line: '', color: art.color, art };
  }
  const line = id === 'kitten' ? tx(ctx, `card.kitten.line.${1 + (Math.abs(rot | 0) % 3)}`, vars) : tx(ctx, `card.${id}.line`, vars);
  return { kind, id, title: tx(ctx, `card.${id}.title`, vars), line: line === `card.${id}.line` ? '' : line, color: art.color, art };
}

/** Is an enemy alerted within `r` m of her? (allocation-free; WA §5.4 dock rule and the calm HUD's combat test) */
export function alertedNear(ctx, r) {
  const p = ctx?.player?.pos, list = ctx?.enemies?.list;
  if (!p || !list) return false;
  const r2 = r * r;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || e.alive === false || !e.alerted || !e.pos) continue;
    const dx = e.pos.x - p.x, dz = e.pos.z - p.z;
    if (dx * dx + dz * dz <= r2) return true;
  }
  return false;
}

/**
 * The pure queue model: one item at a time; each runs its size's duration (docked items fly at dockFly); `skip()`
 * after skipAfter jumps straight to the fly-home phase. `update` returns the item that just started (or null).
 */
export class CelebrateQueue {
  constructor() { this.items = []; this.cur = null; }

  /** Queue a reward; duplicates of the item on screen or already waiting are dropped. Returns true when queued. */
  push(kind, id, vars = null, src = 'reward') {
    if (!KINDS.includes(kind) || !id) return false;
    const same = (it) => it && it.kind === kind && it.id === id && JSON.stringify(it.vars ?? null) === JSON.stringify(vars ?? null);
    if (same(this.cur) || this.items.some(same)) return false;
    this.items.push({ kind, id, vars, src, t: 0, dur: C[kind], fly: kind === 'sticker' ? CELEBRATE_TIMING.stickerFly : CELEBRATE_TIMING.cardFly, docked: false, flying: false, started: false });
    if (this.items.length > 12) this.items.shift();
    return true;
  }

  /** Any input after skipAfter: fly home now. */
  skip() {
    const c = this.cur;
    if (!c || c.t < C.skipAfter || c.flying) return false;
    c.fly = c.t;
    c.dur = c.t + CELEBRATE_TIMING.fly;
    return true;
  }

  /**
   * Advance by dt (real seconds). `combat`: dock new cards / friends. Returns { started, fly, done } (items or null).
   * @param {number} dt @param {boolean} combat
   */
  update(dt, combat = false, hold = false) {
    const ev = this._ev ?? (this._ev = { started: null, fly: null, done: null });
    ev.started = ev.fly = ev.done = null;
    if (!this.cur && this.items.length) {
      if (hold) return ev;                                  // TT5: a modal is up, the next card waits
      const c = this.cur = this.items.shift();
      c.t = 0; c.started = true;
      c.docked = combat && c.kind !== 'sticker';
      if (c.docked) { c.fly = C.dockFly; c.dur = C.dockFly + CELEBRATE_TIMING.fly; }
      ev.started = c;
      return ev;
    }
    const c = this.cur;
    if (!c) return ev;
    c.t += dt;
    if (!c.flying && c.t >= c.fly) { c.flying = true; ev.fly = c; }
    if (c.t >= c.dur) { ev.done = c; this.cur = null; }
    return ev;
  }

  clear() { this.items.length = 0; this.cur = null; }
}

/** TT5: the only key that skips a card (keyboard Enter). Attack, jump and the pad's A never do (A is also Jump). */
export const SKIP_ACTIONS = Object.freeze(['confirm']);

/**
 * Did a skip key press on this step? Keyboard only (`input.device` 'kbm' or unset); taps and clicks skip through the
 * card's own pointer listener. No allocation.
 * @param {any} input ctx.input
 */
export function skipPressed(input) {
  const acts = input?.actions;
  if (!acts || (input.device && input.device !== 'kbm')) return false;
  for (const a of SKIP_ACTIONS) if (acts.get?.(a)?.pressed) return true;
  return false;
}

/**
 * Skip the item on screen when a skip key pressed (keeps the queue's skipAfter / already-flying guards). Returns the
 * item that was sent flying, or null.
 * @param {CelebrateQueue} q @param {any} input
 */
export function pollSkip(q, input) {
  return q.cur && skipPressed(input) && q.skip() ? q.cur : null;
}

/** Is the reduced-motion / reduce-flashes look on (120 ms fade, no confetti, no flight)? */
export function calmLook(ctx) {
  if (ctx?.state?.settings?.reduceFlashes) return true;
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** The toast icon (inline SVG) of a reward shown as a toast: the sticker disc, a friend's face, else the card icon. */
export function rewardToastIcon(info, kind, id) {
  const art = info.art ?? {};
  if (kind === 'sticker') return I.sticker(info.color, art.icon ? art.icon() : '');
  const pid = art.portrait ?? (kind === 'friend' ? (id === 'bow' || id === 'knight' ? 'swordcat' : id) : null);
  if (pid) return portraitSVG(pid, { expression: 'happy' });
  return art.icon ? art.icon() : '';
}

export class Celebrate {
  /** @param {any} ctx @param {HTMLElement} parent @param {any} ui the UI facade (flash, home rects, sfx) */
  constructor(ctx, parent, ui) {
    this.ctx = ctx; this.ui = ui;
    this.q = new CelebrateQueue();
    this.root = el('div', 'ui-celebrate', { parent });
    this.card = el('div', 'cel-card', { parent: this.root });
    this.card.innerHTML = '<div class="cel-fly"><div class="cel-fly-y"><div class="cel-pop">'
      + '<div class="cel-burst"></div><div class="cel-portrait"></div><div class="cel-ico"></div>'
      + '<div class="cel-txt"><div class="cel-title"></div><div class="cel-line"></div></div></div></div></div>';
    this.flyX = this.card.querySelector('.cel-fly');
    this.flyY = this.card.querySelector('.cel-fly-y');
    this.ico = this.card.querySelector('.cel-ico');
    this.portrait = this.card.querySelector('.cel-portrait');
    this.titleEl = this.card.querySelector('.cel-title');
    this.lineEl = this.card.querySelector('.cel-line');
    this.confetti = el('div', 'cel-confetti', { parent: this.root });
    this.confettiEls = [];
    for (let i = 0; i < C.confettiMax; i++) this.confettiEls.push(el('i', `cf cf${i % 6}`, { parent: this.confetti }));
    this._confT = 0;
    this._row = 0; this._rowT = 0;           // stickers in a row (glock thirds)
    this._rot = 0;
    this.shown = 0;                          // items shown (tests)
    this.lastStarted = null;
    this.asToast = 0;                        // rewards shown as icon toasts (stickers, combat cards; tests)
    this.pop = this.card.querySelector('.cel-pop');
    const bus = ctx.bus, on = (n, f) => this._offs.push(bus.on(n, f));
    this._offs = [];
    on(E.REWARD, (p) => this.show(p?.kind, p?.id, p?.vars ?? null, 'reward'));
    on(E.KITTEN_RESCUED, (p) => {
      const st = ctx.state, id = p?.kittenId ?? p?.id;
      const lvl = Object.keys(KITTENS_BY_LEVEL).find((l) => KITTENS_BY_LEVEL[l].includes(id)) ?? ctx.levels?.current?.id;
      const k = levelKittens(st, lvl);
      const vars = { ...(k.max ? { n: Math.max(1, k.n), max: k.max } : { n: st?.kittens?.length ?? 1, max: KITTEN_IDS.length }), kitten: id };
      this.show('card', 'kitten', vars, 'kitten');
    });
    on(E.ITEM_PICKUP, (p) => { if (p?.item === 'heartBell') this.show('card', 'heartbell', null, 'ui'); });
    on(E.SHARD, (p) => this.show('card', 'shard', { n: p?.n ?? ctx.state?.shards ?? 1 }, 'ui'));
    on(E.UNLOCK, (p) => { if (p?.kind === 'ability' && (p.id === 'holy' || p.id === 'golden')) this.show('card', p.id, null, 'ui'); });
    on(E.LEVEL_LOADING, () => { this.q.clear(); this._end(); });
    // TT5: only a tap / click on the card itself skips it (any tap used to, and it ate the attack tap under it)
    this._skip = (e) => {
      e?.stopPropagation?.();
      if (this.q.cur && !this.q.cur.flying && this.q.skip()) this._fly(this.q.cur);
    };
    if (typeof this.pop?.addEventListener === 'function') {
      this.pop.addEventListener('pointerdown', this._skip);
      for (const ev of ['pointerup', 'mousedown', 'touchstart', 'click']) this.pop.addEventListener(ev, (e) => e.stopPropagation(), { passive: ev !== 'click' });
    }
  }

  /** Is a celebration on screen or waiting? */
  get busy() { return !!this.q.cur || this.q.items.length > 0; }

  /** Queue a reward. Returns true when queued. Stickers set the save flag `sticker.<id>` right away. */
  show(kind, id, vars = null, src = 'api') {
    if (!kind || !id) return false;
    if (kind === 'sticker') { try { this.ctx.state?.setFlag?.(`sticker.${id}`, true); } catch { /* state optional */ } }
    return this.q.push(kind, id, vars, src);
  }

  _start(c) {
    const ctx = this.ctx;
    const info = rewardInfo(ctx, c.kind, c.id, c.vars, this._rot++);
    this.lastStarted = c; this.shown++;
    flag(this.card, 'is-sticker', c.kind === 'sticker');
    flag(this.card, 'is-card', c.kind === 'card');
    flag(this.card, 'is-friend', c.kind === 'friend');
    flag(this.card, 'is-docked', c.docked);
    flag(this.card, 'is-fly', false);
    setVar(this.card, '--cc', info.color);
    setText(this.titleEl, info.title);
    const bio = c.kind === 'card' && c.id === 'kitten' ? rescueBioHtml(ctx, c.vars?.kitten) : '';   // §10.5: Pink Paw kittens' fictional bios
    setHtml(this.lineEl, (info.line ? glyphify(info.line, ctx.input?.device ?? 'kbm', ctx.input) : '') + bio);
    flag(this.lineEl, 'is-on', !!info.line || !!bio);
    if (c.kind === 'sticker') setHtml(this.ico, I.sticker(info.color, info.art.icon ? info.art.icon() : ''));
    else setHtml(this.ico, info.art.portrait ? '' : info.art.icon ? info.art.icon() : '');
    const pid = info.art.portrait ?? (c.kind === 'friend' ? (c.id === 'bow' || c.id === 'knight' ? 'swordcat' : c.id) : null);
    setHtml(this.portrait, pid ? portraitSVG(pid, { expression: 'happy' }) : '');
    flag(this.card, 'has-portrait', !!pid);
    // TT5: the last card's flight transforms snap back with no transition (they eased back from the HUD corner over
    // 0.45 s, so a card that came soon after another one swept in from the HUD across the screen)
    this.flyX.style.transition = 'none'; this.flyY.style.transition = 'none';
    this.flyX.style.transform = ''; this.flyY.style.transform = '';
    void this.flyX.offsetWidth;
    this.flyX.style.transition = ''; this.flyY.style.transition = '';
    this._calm = calmLook(ctx);
    flag(this.card, 'is-calm', this._calm);
    flag(this.card, 'is-on', true);
    this.ui?.messages?.placeCard?.(this.card, this.pop);
    pulse(this.card, 'is-pop');
    // the moment: flash, pose, world burst (never when docked; stickers stay small)
    // fx already bursts on `reward` (Beats.reward) and on `kitten:rescued` (Beats.rescue, with its own rescue flash),
    // so the ui adds the world burst only for the cards it raises itself (shards, Heart Bells, ability unlocks)
    if (!c.docked && c.kind !== 'sticker') {
      if (c.src !== 'kitten') this.ui?.flash?.('card');
      const p = ctx.player;
      try { if (typeof p?.onEmote === 'function') p.onEmote('cheer'); else p?.emote?.('cheer'); } catch { /* pose optional (characters W2) */ }
      if (c.src !== 'reward' && c.src !== 'kitten' && p) { try { ctx.fx?.burst?.('celebrate', p, { size: c.kind }); } catch { /* fx optional */ } }
    }
    if (c.kind === 'friend' && !c.docked && !this._calm) this._confettiStart();
    this._sound(c);
  }

  /**
   * TT5: a sticker, or a card in combat, is an icon toast in the top slot (it never lands on the play field or covers
   * the fight). The HUD home still bumps; the sound still plays.
   */
  _toast(c) {
    const ctx = this.ctx, info = rewardInfo(ctx, c.kind, c.id, c.vars, c.kind === 'sticker' ? 0 : this._rot++);
    this.lastStarted = c; this.shown++; this.asToast++;
    c.toast = true;
    this.ui?.toast?.(info.title, { svg: rewardToastIcon(info, c.kind, c.id), key: `reward.${c.kind}.${c.id}` });
    this._sound(c);
    const home = c.kind === 'sticker' ? 'stickers' : REWARD_HOME[c.id] ?? null;
    if (home) this.ui?.bumpHome?.(home);
  }

  /**
   * Sound (WA §5.4): audio's baked glock when it exists (stickers a third higher per sticker in a row, a triad for
   * cards, the arpeggio + pizzicato for friends); the old raw ui sounds otherwise.
   */
  _sound(c) {
    const ctx = this.ctx;
    try {
      if (c.kind === 'sticker') {
        this._row = this._rowT > 0 ? this._row + 1 : 0;
        this._rowT = CELEBRATE_TIMING.glockReset;
      }
      const kind = c.kind === 'sticker' || c.kind === 'friend' ? c.kind : 'card';
      if (typeof ctx.audio?.reward === 'function') ctx.audio.reward(kind, { row: this._row });
      else if (kind === 'sticker') ctx.audio?.play2D?.('ui.confirm', { rate: Math.pow(2, (STICKER_THIRDS[this._row % STICKER_THIRDS.length]) / 12) });
      else if (kind === 'friend') ctx.audio?.play2D?.('jingles/jingles_PIZZI06', { volume: 0.6 });
      else ctx.audio?.play2D?.('ui.confirm');
    } catch { /* audio optional */ }
  }

  /** Fly the card into its HUD home (two nested transforms: X linear, Y eased = a soft arc); a calm card just fades. */
  _fly(c) {
    if (this._calm) { this._homeKey = c.kind === 'sticker' ? 'stickers' : REWARD_HOME[c.id] ?? null; flag(this.card, 'is-fly', true); return; }
    const home = this.ui?.homeRect?.(c.kind === 'sticker' ? 'stickers' : REWARD_HOME[c.id] ?? 'portrait');
    const r = (this.pop ?? this.card).getBoundingClientRect?.();      // the card box itself is 0 × 0 (an anchor)
    if (home && r && r.width > 0) {
      // the card may be docked smaller (messages.js --cs scales the whole card, its flight too)
      const k = this.ui?.messages?.placed?.scale || 1;
      const dx = (home.x + home.w / 2 - (r.left + r.width / 2)) / k, dy = (home.y + home.h / 2 - (r.top + r.height / 2)) / k;
      this.flyX.style.transform = `translate3d(${dx.toFixed(0)}px,0,0)`;
      this.flyY.style.transform = `translate3d(0,${dy.toFixed(0)}px,0) scale(.18)`;
      this._homeKey = c.kind === 'sticker' ? 'stickers' : REWARD_HOME[c.id] ?? null;
    } else this._homeKey = null;
    flag(this.card, 'is-fly', true);
  }

  _end() {
    flag(this.card, 'is-on', false);
    flag(this.card, 'is-fly', false);
    flag(this.confetti, 'is-on', false);
    this._confT = 0;
  }

  _confettiStart() {
    for (let i = 0; i < this.confettiEls.length; i++) {
      const e = this.confettiEls[i];
      setVar(e, '--x', `${((i * 37) % 100).toFixed(0)}%`);
      setVar(e, '--d', `${(0.9 + ((i * 13) % 7) * 0.1).toFixed(2)}s`);
      setVar(e, '--r', `${((i * 53) % 360) - 180}deg`);
      setVar(e, '--dl', `${((i * 7) % 5) * 0.06}s`);
    }
    flag(this.confetti, 'is-on', false);
    pulse(this.confetti, 'is-on');
    this._confT = 1.6;           // ART §9.1: confetti removed after 1.6 s
  }

  /** @param {number} dt real seconds */
  render(dt) {
    if (this._rowT > 0) this._rowT -= dt;
    if (this._confT > 0 && (this._confT -= dt) <= 0) flag(this.confetti, 'is-on', false);
    // skippable by any input (WA §5.4): keyboard / pad / touch-button edges here, pointer presses via the listener
    // (the queue's update below sees the moved fly time and sends the card home this same frame)
    const skipped = pollSkip(this.q, this.ctx.input);
    if (skipped) this._fly(skipped);
    const hold = !!this.ui?.messages?.holdCards?.();
    const ev = this.q.update(dt, this.q.cur || !this.q.items.length ? false : alertedNear(this.ctx, C.safeR), hold);
    if (ev.started) {
      const c = ev.started;
      if (c.kind === 'sticker' || c.docked) { this._toast(c); this.q.cur = null; return; }
      this._start(c);
    }
    if (ev.fly && !skipped) this._fly(ev.fly);
    // TT5: re-place a showing card at 10 Hz (the objective line or the HUD can change under it, and Clem walks under it
    // when the camera pans after a modal); it keeps its spot while that is still free (messages.js cardPlace `keep`)
    const c = this.q.cur;
    if (c && !c.flying && !c.toast && (this._placeT = (this._placeT ?? 0) - dt) <= 0) {
      this._placeT = 0.1;
      if (c.t > 0.15) this.ui?.messages?.placeCard?.(this.card, this.pop);
    }
    if (ev.done) { this._end(); if (this._homeKey) this.ui?.bumpHome?.(this._homeKey); this._homeKey = null; }
  }

  dispose() {
    for (const off of this._offs) off();
    this.root.remove();
  }
}

/** Semitone steps of the sticker glock (C5 → E5 → G5 → C6, WA §9: "thirds"). */
const STICKER_THIRDS = [0, 4, 7, 12];

