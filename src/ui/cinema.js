// src/ui/cinema.js  (owner: ui) — full-screen overlays: the cutscene layer (§14.3 "Cutscene overlay": letterbox bars
// 10% each in cocoa-plum with a scalloped inner edge, captions, title and chapter cards, colour fades, the "Hold to
// skip" ring), the Boot / Loading veil (the warm cream card with a paw progress bar fed by ui:progress, a random
// loading tip) and the Photo Cam caption (Fredoka, bottom-left).
// WA §2.7 / §4.2: every load / cutscene fade is cream FADE_COLOR (#FFF1DE), never black: `'black'`, `'out'`, `true`
// and any near-black colour resolve to cream; a scene that really wants a dark fade asks for cocoa-plum #3A2630.
// WA §5.7: a lost life shows no card and no ghost any more (the ui toasts `life.lost` and pops the lives badge).
//
// `Cinema.api` is the object story's Cutscene runner talks to as `host.cinema` (requests/ui.md):
//   letterbox(on) · hud(on) · apply(step, cutscene, isEnd) for `ui` steps { letterbox, hud, title, caption, chapter,
//   fade, toast } · clear()
import { E } from '../core/events.js';
import { FADE_COLOR } from '../core/config.js';
import { el, flag, setText, setHtml, setVar, pulse } from './dom.js';
import { tx, txt, chapterInfo, esc } from './text.js';
import * as I from './icons.js';

export const CINEMA = Object.freeze({ chapterSec: 3.0, lifeLostSec: 1.5, tipCount: 12, skipHold: 1.0, ringDelay: 0.12, fade: FADE_COLOR ?? '#FFF1DE', darkFade: '#3A2630' });

/** Relative luma (0..1) of a #rgb / #rrggbb colour, or null for anything else. Pure. */
function hexLuma(c) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c).trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WA §2.7: the colour a fade really uses. 'black' / near-black (luma < 0.12, except the allowed cocoa-plum dark fade)
 * becomes the cream FADE_COLOR. Pure.
 */
export function fadeColor(c) {
  if (c == null) return null;
  const s = String(c).trim();
  if (/^(black|out)$/i.test(s)) return CINEMA.fade;          // (near-black hex is caught by the luma test below)
  if (s.toUpperCase() === CINEMA.darkFade) return CINEMA.darkFade;
  const l = hexLuma(s);
  return l != null && l < 0.12 ? CINEMA.fade : s;
}

/** Normalise a cutscene `fade` field → { color, alpha, dur } or null (no change). Pure. */
export function parseFade(f) {
  if (f == null) return null;
  if (f === false || f === 'none' || f === 'clear' || f === 'in') return { color: null, alpha: 0, dur: 0.6 };
  if (f === true || f === 'out' || f === 'black' || f === 'cream') return { color: CINEMA.fade, alpha: 1, dur: 0.6 };
  if (f === 'white') return { color: '#FFFFFF', alpha: 1, dur: 0.6 };
  if (f === 'dark') return { color: CINEMA.darkFade, alpha: 1, dur: 0.6 };
  if (typeof f === 'number') return { color: null, alpha: Math.max(0, Math.min(1, f)), dur: 0.6 };
  if (typeof f === 'string') return { color: fadeColor(f), alpha: 1, dur: 0.6 };
  if (typeof f === 'object') {
    const to = f.to ?? f.color;
    const clear = to == null || to === false || to === 'none' || to === 'clear' || f.alpha === 0;
    return { color: clear ? null : fadeColor(to === 'black' ? CINEMA.fade : to === 'dark' ? CINEMA.darkFade : String(to)), alpha: clear ? 0 : Math.max(0, Math.min(1, f.alpha ?? 1)), dur: Math.max(0, f.dur ?? 0.6) };
  }
  return null;
}

export class Cinema {
  /** @param {any} ctx @param {HTMLElement} parent @param {{ onHud: (on: boolean) => void, rand?: () => number }} hooks */
  constructor(ctx, parent, hooks) {
    this.ctx = ctx;
    this.hooks = hooks;
    const root = this.root = el('div', 'ui-cinema', { parent });
    this.barTop = el('div', 'cin-bar cin-bar--top', { parent: root });
    this.barBot = el('div', 'cin-bar cin-bar--bot', { parent: root });
    this.fadeEl = el('div', 'cin-fade', { parent: root });
    this.caption = el('div', 'cin-caption', { parent: root });
    this.titleEl = el('div', 'cin-title', { parent: root });
    this.chapter = el('div', 'cin-chapter', { parent: root });
    this.chapter.innerHTML = '<div class="chap-band"><div class="chap-label"></div><div class="chap-title"></div><div class="chap-region"></div>'
      + `<div class="chap-seal">${I.waxSeal(I.PINK_DEEP, 'paw')}</div></div>`;
    this.memeCap = el('div', 'cin-meme', { parent: root });
    this.skip = el('div', 'cin-skip', { parent: root, html: `${I.ring('skip-ring')}<span class="skip-txt"></span>` });
    this.skipRing = this.skip.querySelector('.ring-fg');
    this.skipTxt = this.skip.querySelector('.skip-txt');
    // loading veil
    this.veil = el('div', 'ui-loading', { parent: root });
    this.veil.innerHTML = '<div class="load-card"><div class="load-title"></div><div class="load-paws"></div><div class="load-tip"></div></div>';
    this.loadTitle = this.veil.querySelector('.load-title');
    this.loadPaws = this.veil.querySelector('.load-paws');
    this.loadTip = this.veil.querySelector('.load-tip');
    let paws = '';
    for (let i = 0; i < 6; i++) paws += `<span class="lp" style="--i:${i}">${I.paw()}</span>`;
    this.loadPaws.innerHTML = paws;
    this.pawEls = [...this.loadPaws.children];

    this.letterboxOn = false; this.hudOn = true;
    this.loadingOn = false; this.loadT = 0; this.prog = 0; this.progTarget = 0; this._p0 = null;
    this.chapterT = 0; this._chapterResolve = null;
    this.memeT = -1;
    this.skipHold = 0;
    this._tipI = -1;
    this._fadeResolve = null;

    const bus = ctx.bus;
    this._offs = [bus.on(E.PROGRESS, (p) => this._progress(p))];

    /** The `host.cinema` object for story's Cutscene runner. */
    this.api = {
      letterbox: (on) => this.letterbox(on),
      hud: (on) => this.hud(on),
      apply: (step, cs, isEnd) => this.apply(step, cs, isEnd),
      clear: () => this.clear(),
      chapter: (c, o) => this.showChapter(c, o),
      fade: (f) => this.fade(f),
      caption: (c) => this.setCaption(c),
      title: (t) => this.setTitle(t),
    };
  }

  // ------------------------------------------------------------------ cutscene layer
  letterbox(on) {
    this.letterboxOn = !!on;
    flag(this.root, 'is-letterbox', this.letterboxOn);
    flag(this.root.parentElement, 'is-letterbox', this.letterboxOn);     // the dialogue scroll sits above the bar
  }

  hud(on) { this.hudOn = on !== false; this.hooks?.onHud?.(this.hudOn); }

  /**
   * One cutscene `ui` step (or the end block's `ui`). Unknown keys are ignored; `toast` is emitted by the runner.
   * @param {any} step @param {any} [cs] @param {boolean} [isEnd]
   */
  apply(step, cs, isEnd = false) {
    if (!step || typeof step !== 'object') return;
    if ('letterbox' in step) this.letterbox(step.letterbox);
    if ('hud' in step) this.hud(step.hud);
    if ('caption' in step) this.setCaption(step.caption, step.vars);
    if ('title' in step) this.setTitle(step.title);
    if (step.chapter != null && step.chapter !== false) this.showChapter(step.chapter, { level: step.level });
    if ('fade' in step) this.fade(step.fade);
    if (isEnd) this.skipProgress(0);
  }

  /** Remove every cutscene element (skip / cutscene end). Fades clear over 0.4 s. */
  clear() {
    this.letterbox(false);
    this.setCaption(null);
    this.setTitle(null);
    this._endChapter();
    this.fade({ to: null, dur: 0.4 });
    this.skipProgress(0);
  }

  setCaption(c, vars) {
    const s = c == null || c === false ? '' : txt(this.ctx, typeof c === 'object' ? (c.text ?? c.key ?? '') : c, vars);
    setText(this.caption, s);
    flag(this.caption, 'is-on', !!s);
  }

  /** Title card: `{ text, sub }` (keys or literal); the game title gets the logo with the bow on the "O". */
  setTitle(t) {
    if (t == null || t === false) { flag(this.titleEl, 'is-on', false); return; }
    const o = typeof t === 'object' ? t : { text: t };
    const text = txt(this.ctx, o.text ?? 'game.title'), sub = o.sub != null ? txt(this.ctx, o.sub) : '';
    const isLogo = (o.text ?? 'game.title') === 'game.title' || text === tx(this.ctx, 'game.title');
    setHtml(this.titleEl, isLogo ? I.logoHtml(text, esc(sub)) : `<div class="title-txt">${esc(text)}</div>${sub ? `<div class="title-sub">${esc(sub)}</div>` : ''}`);
    flag(this.titleEl, 'is-on', true);
    pulse(this.titleEl, 'is-enter');
  }

  /**
   * Chapter card (§14.3 in the WA candy skin: a cream card, the chapter title and the region in Fredoka, a wax-seal
   * stamp; 3.0 s). Resolves when it has gone.
   */
  showChapter(chapter, o = {}) {
    const info = chapterInfo(this.ctx, chapter, o.level ?? this.ctx.levels?.current?.id ?? null);
    setText(this.chapter.querySelector('.chap-label'), info.label);
    setText(this.chapter.querySelector('.chap-title'), info.title);
    setText(this.chapter.querySelector('.chap-region'), info.region);
    this._endChapter();
    this.chapterT = o.sec ?? CINEMA.chapterSec;
    flag(this.chapter, 'is-on', true);
    flag(this.chapter, 'is-stamped', false);
    this._stampT = 0.35;
    this._stampSound = o.sound !== false;      // story's chapterCard plays the stamp itself
    return new Promise((r) => { this._chapterResolve = r; });
  }

  /** Hide the chapter card now (story times its card and sends `chapter: null`). */
  hideChapter() { this._endChapter(); }

  _endChapter() {
    this.chapterT = 0;
    flag(this.chapter, 'is-on', false);
    const r = this._chapterResolve; this._chapterResolve = null; r?.();
  }

  /** Colour fade. Returns a Promise resolved when the transition ends. */
  fade(f) {
    const p = parseFade(f);
    if (!p) return Promise.resolve();
    if (p.color) this.fadeEl.style.background = p.color;
    this.fadeEl.style.transitionDuration = `${p.dur}s`;
    this.fadeEl.style.opacity = String(p.alpha);
    this.fadeAlpha = p.alpha;
    const prev = this._fadeResolve; prev?.();
    return new Promise((r) => { this._fadeResolve = r; this._fadeT = p.dur; });
  }

  /** Hold-to-skip ring progress 0..1 (0 hides it). */
  skipProgress(f, label) {
    const on = f > 0;
    flag(this.skip, 'is-on', on);
    if (!on) return;
    if (label) setText(this.skipTxt, label);
    this.skipRing.setAttribute('stroke-dashoffset', (I.RING_LEN * (1 - Math.min(1, f))).toFixed(1));
  }

  // ------------------------------------------------------------------ Photo Cam caption (§7.8 step 4)
  memeCaption(text) {
    if (text) { setText(this.memeCap, text); flag(this.memeCap, 'is-on', true); }
    else flag(this.memeCap, 'is-on', false);
  }

  // ------------------------------------------------------------------ life lost (WA §5.7)
  /** The `life.*` line for a lost life (the ui toasts it; no card, no ghost). Pure on ctx. */
  lifeLostText(lives, { infinite = false } = {}) {
    if (infinite) return '';
    const n = lives | 0;
    return n <= 1 ? tx(this.ctx, n === 1 ? 'life.lost1' : 'life.last', { n }) : tx(this.ctx, 'life.lost', { n });
  }

  // ------------------------------------------------------------------ loading veil (§14.3 Boot / Loading)
  loading(on) {
    on = !!on;
    if (on === this.loadingOn) return;
    this.loadingOn = on;
    if (on) {
      this.loadT = 0; this.prog = 0; this.progTarget = 0.05; this._p0 = null;
      setText(this.loadTitle, tx(this.ctx, 'loading.title'));
      this._tip();
    } else this.progTarget = 1;
    flag(this.veil, 'is-on', on);
  }

  _tip() {
    const r = this.hooks?.rand ?? Math.random;               // the ui's own forked stream (never the gameplay rng)
    let i = Math.floor(r() * CINEMA.tipCount);
    if (i === this._tipI) i = (i + 1) % CINEMA.tipCount;
    this._tipI = i;
    const key = `loading.tip.${i + 1}`;
    setText(this.loadTip, this.ctx.strings?.has?.(key) ? tx(this.ctx, key) : '');
  }

  _progress(p) {
    if (!this.loadingOn || !p) return;
    if (this._p0 == null) this._p0 = { n: Math.max(0, (p.n ?? 1) - 1), total: Math.max(0, (p.total ?? 1) - 1) };
    const n = (p.n ?? 0) - this._p0.n, total = Math.max(1, (p.total ?? 1) - this._p0.n);
    this.progTarget = Math.max(this.progTarget, Math.min(0.97, n / total));
  }

  // ------------------------------------------------------------------ frame
  /** @param {number} dt real seconds */
  render(dt) {
    if (this.chapterT > 0) {
      if (this._stampT > 0 && (this._stampT -= dt) <= 0) {
        pulse(this.chapter, 'is-stamped');
        if (this._stampSound) { try { this.ctx.audio?.play2D?.('ui.stamp'); } catch { /* audio optional */ } }
      }
      if ((this.chapterT -= dt) <= 0) this._endChapter();
    }
    if (this._fadeT != null && (this._fadeT -= dt) <= 0) { this._fadeT = null; const r = this._fadeResolve; this._fadeResolve = null; r?.(); }
    // loading bar: creep while waiting so it never looks frozen; snap to full at the end
    if (this.loadingOn || this.prog < 1) {
      this.loadT += dt;
      if (this.loadingOn) this.progTarget = Math.min(0.97, Math.max(this.progTarget, 1 - Math.exp(-this.loadT * 0.35)) );
      this.prog += (this.progTarget - this.prog) * Math.min(1, dt * 6);
      const lit = Math.round(this.prog * this.pawEls.length * 100) / 100;
      for (let i = 0; i < this.pawEls.length; i++) setVar(this.pawEls[i], '--o', Math.max(0, Math.min(1, lit - i)).toFixed(2));
      if (!this.loadingOn && this.prog > 0.995) this.prog = 1;
    }
  }

  dispose() { for (const off of this._offs) off(); this.root.remove(); }
}
