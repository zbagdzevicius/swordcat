// src/ui/prompts.js  (owner: ui) — on-screen instructions:
//  • interaction tags (§14.2 world space: a cream candy tag plus a wax-seal key glyph) from interact:available / clear;
//  • story prompts (§14.3 "prompt overlays ('HOLD THE STAND' with a filling ring)") from story:prompt;
//  • the tutorial hint card (§6.6 tut.* strings with keyboard / gamepad / touch glyphs swapped in), driven by
//    `ui.hint(keyOrText, opts)` or quest:update { questId, state, text }.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { el, flag, setHtml, setText, setVar, place, pulse } from './dom.js';
import { tx, txt, glyphify, actionGlyph, actionGlyphHtml, actionWords } from './text.js';
import * as I from './icons.js';
import { Guide } from './guide.js';
import { sameLine } from './messages.js';

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3();
const HINT_CALM = 2;      // s clear before a faded hint card comes back
const HINT_POLL = 0.1;    // s between occlusion checks
const HINT_PAD = 24;      // px around the card that still counts as covering a foe
const TAG_ABOVE = 1.25;   // m above the target where the interaction tag sits
const TAG_BELOW = -0.15;  // m: the fallback anchor under the target when the top band is taken (the boss bar)
const TAG_GAP = 10;       // px kept clear under the boss bar / objective line
const TAG_SIDE = 70;      // px either side of that column that still counts (half a tag)
const KEEP_POLL = 0.25;   // s between boss-bar rect reads

/** Interaction kinds hidden while a boss fight is on (no "Rest" pill over the fight, review: tag over the boss bar). */
export const BOSS_HIDDEN_TAGS = Object.freeze(['vigil', 'rest']);

/**
 * Where the interaction tag goes (screen px). Above the object normally; when that point would sit inside the top
 * keep-out band (the boss bar), the tag anchors under the object instead, and never higher than the band. Pure.
 * @param {number} yAbove tag y when placed above the object @param {number} yBelow tag y under the object
 * @param {number} keepTop px from the top that must stay clear (0 = none)
 * @returns {number}
 */
export function tagY(yAbove, yBelow, keepTop) {
  if (!(keepTop > 0) || yAbove >= keepTop) return yAbove;
  return Math.max(yBelow, keepTop);
}

/** May the interaction tag for `kind` show? Rest stops wait while a boss encounter is active. Pure. */
export function tagAllowed(kind, bossOn) {
  return !(bossOn && BOSS_HIDDEN_TAGS.includes(kind));
}

/**
 * Does a hint layer (screen rect) sit over an alerted foe, or (`stick`) the live joystick? Reads ctx.ui.touch (stick)
 * and ctx.enemies.list (alive / alerted / pos) defensively.
 * @param {{ left: number, top: number, right: number, bottom: number }} r @param {any} ctx @param {boolean} [stick]
 */
export function hintCovers(r, ctx, stick = true) {
  if (!r || r.right <= r.left) return false;
  const tc = ctx?.ui?.touch;
  if (stick && tc?.stick?.id != null && tc.base) {
    const b = tc.base.getBoundingClientRect();
    if (b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom) return true;
  }
  const cam = ctx?.camera, list = ctx?.enemies?.list;
  if (!cam || !list?.length) return false;
  cam.getWorldDirection(_f);
  const W = window.innerWidth, H = window.innerHeight;
  for (const e of list) {
    if (!e?.alive || !e.alerted || !e.pos) continue;
    _v.set(e.pos.x, e.pos.y + 0.5, e.pos.z);
    if (_d.copy(_v).sub(cam.position).dot(_f) <= 0) continue;
    _v.project(cam);
    const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
    if (x > r.left - HINT_PAD && x < r.right + HINT_PAD && y > r.top - HINT_PAD && y < r.bottom + HINT_PAD) return true;
  }
  return false;
}

/**
 * May the hint / prompt layers (lesson card, guide bubble, tips) show? Only in live play: never in a cutscene, a
 * dialogue scene, under the letterbox, in a menu or the Photo Cam. Pure.
 * @param {{ hud?: boolean, meme?: boolean, mode?: string, dialog?: boolean, letterbox?: boolean, menu?: boolean, cinema?: boolean }} s
 */
export function hintLayerOn(s) {
  return !!s.hud && !s.meme && s.mode === 'play' && !s.dialog && !s.letterbox && !s.menu && !s.cinema;
}

/** Short label for an interaction tag: `prompt.<kind>` beats a long tutorial sentence. Pure. */
export function tagLabel(ctx, kind, promptKey) {
  // TT2: an interactable's own short `prompt.*` key wins (the barn chest, kind 'interact', says "Open", not the raw
  // "[Interact]" that `prompt.interact` resolves to)
  if (typeof promptKey === 'string' && promptKey.startsWith('prompt.') && promptKey !== 'prompt.interact' && ctx?.strings?.has?.(promptKey)) {
    const s = tx(ctx, promptKey).replace(/\s*\[[^\]]*\]\.?\s*$/, '');
    if (s) return s;
  }
  const k = kind ? `prompt.${kind}` : null;
  if (k && ctx?.strings?.has?.(k)) return tx(ctx, k);
  const s = txt(ctx, promptKey ?? 'prompt.interact');
  return s.replace(/\s*\[[^\]]*\]\.?\s*$/, '');      // "Vigil Stone: rest… [E]." → the glyph sits on the seal
}

export class Prompts {
  /** @param {any} ctx @param {HTMLElement} parent */
  constructor(ctx, parent) {
    this.ctx = ctx;
    this.tag = el('div', 'ui-tag', { parent, html: `<div class="tag-in"><span class="tag-seal">${I.waxSeal(I.PINK_DEEP, 'none')}<b></b></span><span class="tag-txt"></span></div>` });
    this.tagKey = this.tag.querySelector('.tag-seal b');
    this.tagTxt = this.tag.querySelector('.tag-txt');
    this.target = null;           // { id, kind, position }
    this.prompt = el('div', 'ui-prompt', { parent, html: `<div class="pr-ring">${I.ring('pr-ring-svg')}<span class="pr-key"></span></div><div class="pr-txt"></div>` });
    this.prRing = this.prompt.querySelector('.ring-fg');
    this.prKey = this.prompt.querySelector('.pr-key');
    this.prTxt = this.prompt.querySelector('.pr-txt');
    this.prState = null;          // last story:prompt payload
    this.prDoneT = 0;
    this.hintEl = el('div', 'ui-hint', { parent, html: '<div class="hint-step"></div><div class="hint-txt"></div>' });
    this.hintStep = this.hintEl.querySelector('.hint-step');
    this.hintTxt = this.hintEl.querySelector('.hint-txt');
    this.hintData = null;         // { text, step, total, t, sec }
    /** WA §7.5 guide bubble (story:prompt payloads with a `speaker`) */
    this.guide = new Guide(ctx, parent);
    this._hintB = { t: 0, poll: 0 }; this._guideB = { t: 0, poll: 0 }; this._promptB = { t: 0, poll: 0 };
    this.bossOn = false;          // a boss encounter is running (boss:start … boss:defeated / level change)
    this._keepTop = 0; this._keepL = 0; this._keepR = 0; this._keepPoll = 0;
    const bus = ctx.bus;
    this._offs = [
      bus.on(E.INTERACT_AVAILABLE, (p) => { this.target = p?.target ?? null; this.tagPrompt = p?.prompt ?? null; this._drawTag(); }),
      bus.on(E.INTERACT_CLEAR, () => { this.target = null; }),
      bus.on(E.INTERACT, () => { if (this.target) pulse(this.tag, 'is-press'); }),
      bus.on(E.PROMPT, (p) => this._onPrompt(p)),
      bus.on(E.QUEST_UPDATE, (p) => this._onQuest(p)),
      bus.on(E.INPUT_DEVICE, () => this._redraw()),
      bus.on(E.INPUT_SCHEME, () => this._redraw()),          // CONTROLS_SPEC §12 ui 3: glyphs follow the preset
      bus.on(E.SETTINGS_CHANGED, (p) => { if (p?.key === 'bindings' || p?.key === 'controlPreset') this._redraw(); }),
      bus.on(E.BOSS_START, () => { this.bossOn = true; this._keepPoll = 0; }),
      bus.on(E.BOSS_DEFEATED, () => { this.bossOn = false; this._keepTop = 0; }),
      bus.on(E.LEVEL_LOADING, () => { this.bossOn = false; this._keepTop = 0; this.target = null; this.hint(null); this.prState = null; flag(this.prompt, 'is-on', false); this.guide.hide(); }),
    ];
  }

  get device() { return this.ctx.input?.device ?? 'kbm'; }

  _redraw() { this._drawTag(); this._drawHint(); this._drawPrompt(); this.guide.redraw(); }

  _drawTag() {
    if (!this.target) return;
    // §10.4: the tag carries the device glyph ("Tap" / "E" / "Y")
    // TT6: a pad shows the Y button glyph (an icon), a keyboard its key letter, touch "Tap"
    if (this.device === 'pad') setHtml(this.tagKey, actionGlyphHtml('interact', 'pad', this.ctx.input));
    else setText(this.tagKey, this.device === 'touch' ? tx(this.ctx, 'ui.tag.tap') : actionGlyph('interact', this.device, this.ctx.input));
    setText(this.tagTxt, tagLabel(this.ctx, this.target.kind, this.tagPrompt));
    flag(this.tag, 'is-long', this.device !== 'pad' && this.tagKey.textContent.length > 2);
  }

  // ------------------------------------------------------------------ story:prompt
  _onPrompt(p) {
    if (!p) return;
    // WA §7.5: a speaker turns the prompt into the guide bubble (one bubble; the old card steps aside)
    if (p.speaker) { if (this._tutKey) { this._tutKey = null; this.hint(null); } this.guide.onPrompt(p); return; }
    if (p.kind === 'tutorial' && this.guide.open && !p.done) this.guide.hide();
    if (p.kind === 'tutorial') {                 // the lesson card for a prompt without a guide (requests/story.md)
      if (p.done || !p.textKey) { if (!this._tutKey || this._tutKey === p.textKey || p.done) { this._tutKey = null; this.hint(null); } return; }
      this._tutKey = p.textKey;
      this.hint(p.textKey, { step: p.step, total: p.total, vars: p.vars });
      return;
    }
    const first = !this.prState || this.prState.textKey !== p.textKey || this.prState.action !== p.action;
    this.prState = p;
    if (p.done) { this.prDoneT = 0.6; pulse(this.prompt, 'is-done'); this._drawPrompt(); return; }
    this.prDoneT = 0;
    flag(this.prompt, 'is-on', true);
    if (first) { this._drawPrompt(); pulse(this.prompt, 'is-enter'); }
    const f = Math.max(0, Math.min(1, p.progress ?? 0));
    this.prRing.setAttribute('stroke-dashoffset', (I.RING_LEN * (1 - f)).toFixed(1));
    flag(this.prompt, 'is-hold', (p.hold ?? 0) > 0);
  }

  _drawPrompt() {
    const p = this.prState;
    if (!p) return;
    const act = p.action === 'chargeRelease' ? 'attack' : p.action === 'guard' ? 'guard' : p.action ?? 'interact';
    setHtml(this.prKey, actionGlyphHtml(act, this.device, this.ctx.input));      // TT6: an icon, never "RMB"
    this.prKey.setAttribute?.('aria-label', actionWords(act, this.device, this.ctx.input));
    const t = p.textKey ? txt(this.ctx, p.textKey) : '';
    setHtml(this.prTxt, glyphify(t, this.device, this.ctx.input));
  }

  // ------------------------------------------------------------------ tutorial hint
  /**
   * Show a tutorial / instruction card (glyphs swapped per device), or hide it with null.
   * @param {string|null} keyOrText @param {{ step?: number, total?: number, sec?: number, vars?: object }} [o]
   */
  hint(keyOrText, o = {}) {
    if (!keyOrText) { this.hintData = null; flag(this.hintEl, 'is-on', false); return; }
    const text = txt(this.ctx, keyOrText, o.vars);
    const same = this.hintData?.text === text;
    this.hintData = { text, step: o.step ?? null, total: o.total ?? null, t: 0, sec: o.sec ?? 0 };
    this._drawHint();
    flag(this.hintEl, 'is-on', true);
    if (!same) pulse(this.hintEl, 'is-enter');
  }

  _drawHint() {
    const h = this.hintData;
    if (!h) return;
    setHtml(this.hintTxt, glyphify(h.text, this.device, this.ctx.input));
    const step = h.step != null && h.total ? tx(this.ctx, 'tut.step', { n: h.step, total: h.total }) : '';
    setText(this.hintStep, step);
    flag(this.hintEl, 'has-step', !!step);
  }

  _onQuest(p) {
    if (!p) return;
    if (p.state === 'done' || p.state === 'clear' || p.state === 'hidden' || p.text === null) { if (!p.questId || this._questId === p.questId) this.hint(null); return; }
    this._questId = p.questId;
    this.hint(p.text ?? p.textKey ?? p.questId, { step: p.step, total: p.total });
  }

  /** @param {number} dt real seconds @param {{ world: boolean }} vis */
  render(dt, vis) {
    const ctx = this.ctx, cam = ctx.camera;
    // interaction tag above the target
    let tagOn = false;
    this._keepOut(dt);
    const hud = ctx.ui?.hud, bossOn = hud ? !!hud.boss : this.bossOn;           // the hud's boss is the truth (a stray defeat signal never ends it)
    if (this.target && vis.world && cam && tagAllowed(this.target.kind, bossOn)) {
      const pos = this.target.position;
      if (pos) {
        const px = pos.x ?? pos[0] ?? 0, py = pos.y ?? pos[1] ?? 0, pz = pos.z ?? pos[2] ?? 0;
        _v.set(px, py + TAG_ABOVE, pz);
        cam.getWorldDirection(_f); _d.copy(_v).sub(cam.position);
        if (_d.dot(_f) > 0) {
          _v.project(cam);
          if (Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05) {
            tagOn = true;
            const H = window.innerHeight, x = (_v.x * 0.5 + 0.5) * window.innerWidth, yA = (-_v.y * 0.5 + 0.5) * H;
            let y = yA;
            if (this._keepTop > 0 && yA < this._keepTop && x > this._keepL && x < this._keepR) {   // the top column owns that band: hang the tag below
              _v.set(px, py + TAG_BELOW, pz).project(cam);
              y = tagY(yA, (-_v.y * 0.5 + 0.5) * H, this._keepTop);
            }
            place(this.tag, x, y);
          }
        }
      }
    }
    flag(this.tag, 'is-on', tagOn);
    // story prompt fade after done
    if (this.prDoneT > 0 && (this.prDoneT -= dt) <= 0) { flag(this.prompt, 'is-on', false); this.prState = null; }
    // timed hints
    const h = this.hintData;
    if (h) { h.t += dt; if (h.sec > 0 && h.t >= h.sec) this.hint(null); }
    flag(this.hintEl, 'is-dim', !vis.hint);
    // TT5: the lesson card never repeats the objective line word for word (the same line showed twice)
    flag(this.hintEl, 'is-dup', !!h && !!hud?.guideEl?.classList?.contains('is-on') && sameLine(h.text, hud.guideRaw ?? hud.guideText));
    this.guide.render(dt, !!vis.hint);
    flag(this.hintEl, 'is-guided', this.guide.open);      // one bubble on screen (WA §6.1 rule 6)
    this._busy(this.hintEl, this._hintB, dt, !!h && vis.hint);
    this._busy(this.prompt, this._promptB, dt, !!this.prState && vis.hint);   // 'HOLD THE STAND' never hides a foe
    this._busy(this.guide.root, this._guideB, dt, this.guide.open && vis.hint);
    setVar(this.hintEl, '--sub', (ctx.state?.settings?.subtitleSize ?? 1).toFixed(2));
  }

  /**
   * The top keep-out band: the top-centre column (the boss bar while it is up, the objective line) as its bottom edge
   * plus a gap (`_keepTop`, px; 0 = none) and its horizontal span (`_keepL` … `_keepR`). Rects are read at most every
   * KEEP_POLL s.
   * @param {number} dt
   */
  _keepOut(dt) {
    if ((this._keepPoll -= dt) > 0) return;
    this._keepPoll = KEEP_POLL;
    const hud = this.ctx.ui?.hud;
    this._keepTop = 0; this._keepL = Infinity; this._keepR = -Infinity;
    this._keepAdd(hud?.bossEl); this._keepAdd(hud?.objEl);
    this._keepL -= TAG_SIDE; this._keepR += TAG_SIDE;
  }

  /** Grow the keep-out band by element `b` when it is up. */
  _keepAdd(b) {
    if (!b?.classList?.contains('is-on')) return;
    const q = b.getBoundingClientRect();
    if (!(q.bottom > 0) || q.width <= 0) return;
    this._keepTop = Math.max(this._keepTop, q.bottom + TAG_GAP); this._keepL = Math.min(this._keepL, q.left); this._keepR = Math.max(this._keepR, q.right);
  }

  /**
   * Fade a hint layer (the lesson / objective card, the guide bubble) back while it covers an alerted foe (every
   * device: a hint never sits on top of the fight) or, on touch, the floating stick; full again after HINT_CALM s
   * clear. The rect is re-read at most every HINT_POLL s (one layout read).
   * @param {HTMLElement} e @param {{ t: number, poll: number }} b its busy state @param {number} dt @param {boolean} on it is up and visible
   */
  _busy(e, b, dt, on) {
    if (!on) { b.t = 0; b.poll = 0; flag(e, 'is-busy', false); return; }
    if ((b.poll -= dt) <= 0) {
      b.poll = HINT_POLL;
      if (hintCovers(e.getBoundingClientRect(), this.ctx, this.device === 'touch')) b.t = HINT_CALM;
    }
    b.t = Math.max(0, b.t - dt);
    flag(e, 'is-busy', b.t > 0);
  }

  dispose() { for (const off of this._offs) off(); this.tag.remove(); this.prompt.remove(); this.hintEl.remove(); this.guide.dispose(); }
}

