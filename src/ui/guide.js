// src/ui/guide.js  (owner: ui) — WARM_ADVENTURE_SPEC §7.5 (ON §4.4, §7.1, §7.4): the guide bubble of Morning Practice.
//
//  • A `story:prompt` with `speaker` ('pearl' | 'mochi' | …) shows ONE bubble at the top-centre, 8 px under the 18 %
//    HUD strip: a 44 px portrait, the speech line (`say`), a pink hint chip (`textKey`, device glyphs, ≤ 7 words) and
//    7 paw dots (`stepDots`). A second prompt replaces the first (never two bubbles).
//  • After `chipAfter` (6 s) without success the speech folds away (200 ms) and only the chip stays.
//  • Progress inside a step (`progress` grows, a dot half-fills): the chip wiggles 120 ms.
//  • `done`: the chip turns mint with a ✓ for 0.5 s, then the bubble goes (the next step's prompt replaces it).
//  • Ghost paw: after `idleDemo` (8 s) of no progress, a 64 px cream paw demonstrates the step (`demo`: tap / hold /
//    swipe) at the world target (`target`: a point or an actor; one transform per frame) or on the touch button of
//    `action`; on keyboard / pad it bounces the key glyph instead. 2 cycles, then it waits 8 s again. Off with
//    `settings.tutorialHints`. TOKENTAILS-PLAN §10.2 (G1): with no prompt target it demonstrates on the beacon's guide
//    target, and an off-screen target is tapped next to the gold coin edge arrow (never on the chip); the step dots and
//    the ghost paw are Token Tails love pink #FF7AA2 (guidance.css).
// The bubble is `pointer-events: none` and never a SafeFrame occluder. Old prompts (no `speaker`) keep prompts.js's card.
import * as THREE from 'three';
import { el, flag, setText, setHtml, setVar, place, pulse } from './dom.js';
import { tx, txt, glyphify, actionGlyph } from './text.js';
import { portraitSVG } from './portraits.js';
import * as I from './icons.js';

/** ON §4.1 PRACTICE timings the bubble falls back to when a payload does not carry them. */
export const GUIDE = Object.freeze({ chipAfter: 6, idleDemo: 8, demoCycle: 1.2, demoCycles: 2, doneShow: 0.5, wiggle: 0.12, dots: 7, edgePull: 70 });

/**
 * Normalise `stepDots` to an array of fills (0 | 0.5 | 1). Accepts an array of numbers, or `{ n, of, half }` (n steps
 * done of `of`, the current one half-filled when `half`). Pure; writes into `out` when given.
 * @param {any} d @param {number[]} [out]
 * @returns {number[]}
 */
export function dotFills(d, out = []) {
  out.length = 0;
  if (Array.isArray(d)) { for (const v of d) out.push(v >= 1 ? 1 : v > 0 ? 0.5 : 0); return out; }
  if (d && typeof d === 'object') {
    const of = Math.max(0, Math.min(12, d.of ?? d.total ?? GUIDE.dots)), n = Math.max(0, Math.min(of, d.n ?? d.done ?? 0));
    for (let i = 0; i < of; i++) out.push(i < n ? 1 : i === n && d.half ? 0.5 : 0);
  }
  return out;
}

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3();

/**
 * The pure prompt model behind the bubble (node-tested): ONE live prompt; a prompt for another step / line replaces it
 * ('new'); more progress or a dot change on the same step is 'progress'; `done` is 'done' (the chip turns mint).
 * `cur` = { key, p, t, idle, demoT, doneT, progress, dots }.
 */
export class GuideModel {
  constructor() { this.cur = null; }

  /** @returns {'new'|'progress'|'done'|null} */
  prompt(p) {
    if (!p) return null;
    const c = this.cur;
    if (p.done) {
      if (!c) return null;
      c.doneT = GUIDE.doneShow; c.idle = 0; c.demoT = -1;
      return 'done';
    }
    const key = `${p.speaker}|${p.textKey ?? ''}|${p.say ?? ''}|${p.step ?? p.id ?? ''}`;
    if (!c || c.key !== key) {
      this.cur = { key, p, t: 0, idle: 0, demoT: -1, doneT: 0, progress: p.progress ?? 0, dots: JSON.stringify(p.stepDots ?? null) };
      return 'new';
    }
    const dots = JSON.stringify(p.stepDots ?? null);
    if ((p.progress ?? 0) > c.progress + 1e-3 || dots !== c.dots) {
      c.progress = p.progress ?? c.progress; c.dots = dots; c.idle = 0; c.demoT = -1; c.p = p;
      return 'progress';
    }
    return null;
  }

  hide() { this.cur = null; }
}

export class Guide {
  /** @param {any} ctx @param {HTMLElement} parent */
  constructor(ctx, parent) {
    this.ctx = ctx;
    this.root = el('div', 'ui-guide', { parent });
    this.root.innerHTML = '<div class="gd-bubble"><div class="gd-face"></div><div class="gd-say"></div></div>'
      + '<div class="gd-chip"><span class="gd-tick"></span><span class="gd-hint"></span></div><div class="gd-dots"></div>';
    this.face = this.root.querySelector('.gd-face');
    this.say = this.root.querySelector('.gd-say');
    this.chip = this.root.querySelector('.gd-chip');
    this.hintEl = this.root.querySelector('.gd-hint');
    this.tickEl = this.root.querySelector('.gd-tick');
    this.tickEl.innerHTML = I.tick();
    this.dotsEl = this.root.querySelector('.gd-dots');
    this.dotEls = [];
    this.paw = el('div', 'ui-ghostpaw', { parent, html: `<div class="gp-ring"></div><div class="gp-hand">${I.ghostPaw()}</div><kbd class="ui-key gp-key"></kbd>` });
    this.pawKey = this.paw.querySelector('.gp-key');
    this.model = new GuideModel();
    this.open = false;
    this._fills = [];
    this.demos = 0;              // ghost-paw demos started (tests / smoke)
    this._pt = { x: 0, y: 0 };
  }

  get device() { return this.ctx.input?.device ?? 'kbm'; }

  /** The live prompt (the pure model's). */
  get cur() { return this.model.cur; }

  /** A `story:prompt` with a speaker. */
  onPrompt(p) {
    const a = this.model.prompt(p);
    if (a === 'done') { flag(this.chip, 'is-done', true); this._paw(false); }
    else if (a === 'new') {
      this._draw(p);
      flag(this.root, 'is-folded', false);
      flag(this.chip, 'is-done', false);
      flag(this.root, 'is-on', true);
      pulse(this.root, 'is-enter');
      this.open = true;
      this._paw(false);
    } else if (a === 'progress') {
      this._drawDots(p.stepDots);
      pulse(this.chip, 'is-wiggle');
      this._paw(false);
    }
  }

  _draw(p) {
    const ctx = this.ctx;
    setHtml(this.face, portraitSVG(p.speaker, { expression: 'happy' }));
    const say = p.say ? txt(ctx, p.say, p.vars) : '';
    setText(this.say, say);
    flag(this.root, 'has-say', !!say);
    this._drawHint();
    this._drawDots(p.stepDots);
  }

  _drawHint() {
    const p = this.cur?.p;
    if (!p) return;
    const t = p.textKey ? txt(this.ctx, p.textKey, p.vars) : '';
    setHtml(this.hintEl, glyphify(t, this.device, this.ctx.input));
    flag(this.chip, 'is-empty', !t);
  }

  _drawDots(d) {
    const f = dotFills(d, this._fills);
    while (this.dotEls.length < f.length) this.dotEls.push(el('i', 'gd-dot', { parent: this.dotsEl }));
    for (let i = 0; i < this.dotEls.length; i++) {
      const e = this.dotEls[i];
      flag(e, 'is-hidden', i >= f.length);
      flag(e, 'is-full', f[i] === 1);
      flag(e, 'is-half', f[i] === 0.5);
    }
    flag(this.dotsEl, 'is-on', f.length > 0);
  }

  /** Redraw the device glyphs (input device / preset change). */
  redraw() { this._drawHint(); }

  /** Hide the bubble now (level load, tutorial end, the old card took over). */
  hide() {
    this.model.hide(); this.open = false;
    flag(this.root, 'is-on', false);
    this._paw(false);
  }

  _paw(on) { flag(this.paw, 'is-on', on); if (!on) { flag(this.paw, 'is-hold', false); flag(this.paw, 'is-swipe', false); flag(this.paw, 'is-key', false); } }

  /** Screen point of the demo target (CSS px) or null: the world target, else the touch button of the action. */
  _demoPoint(p) {
    const ctx = this.ctx, cam = ctx.camera, bc = ctx.ui?.beacon;
    // TOKENTAILS-PLAN §10.2: the ghost paw points at the target (the prompt's, else the guide's), never at the chip
    const tgt = p.target ?? (bc?.guide?.pos ? bc.guide : null);
    if (tgt && cam) {
      const pos = tgt.pos ?? tgt.position ?? tgt;
      const x = pos.x ?? pos[0], y = (pos.y ?? (pos.length === 3 ? pos[1] : 0) ?? 0) + 0.3, z = pos.z ?? (pos.length === 3 ? pos[2] : pos[1]);
      if (Number.isFinite(x) && Number.isFinite(z)) {
        _v.set(x, y || 0, z);
        cam.getWorldDirection(_f); _d.copy(_v).sub(cam.position);
        if (_d.dot(_f) > 0) {
          _v.project(cam);
          if (Math.abs(_v.x) < 1 && Math.abs(_v.y) < 1) { this._pt.x = (_v.x * 0.5 + 0.5) * innerWidth; this._pt.y = (-_v.y * 0.5 + 0.5) * innerHeight; return this._pt; }
        }
      }
    }
    // the target is off screen: tap next to the gold coin on the edge (pulled toward the centre)
    const e = bc?.edgeAt;
    if (tgt && e) {
      const cx = innerWidth / 2, cy = innerHeight / 2, dx = cx - e.x, dy = cy - e.y, l = Math.hypot(dx, dy) || 1, k = Math.min(GUIDE.edgePull, l);
      this._pt.x = e.x + (dx / l) * k; this._pt.y = e.y + (dy / l) * k;
      return this._pt;
    }
    if (this.device === 'touch' && p.action) {
      const b = ctx.ui?.touch?.layout?.buttons?.[p.action === 'chargeRelease' ? 'attack' : p.action];
      if (b) { this._pt.x = b.x; this._pt.y = b.y; return this._pt; }
    }
    return null;
  }

  /** @param {number} dt real seconds @param {boolean} vis the HUD is up */
  render(dt, vis) {
    const c = this.cur;
    flag(this.root, 'is-dim', !vis);
    if (!c) return;
    // §10.2.6: the HUD objective line already says the chip's words: phones drop the chip (guidance.css) so the bubble
    // stays small and off Clem
    const ok = this.ctx.ui?.beacon?.objective?.textKey;
    flag(this.root, 'is-dup', !!ok && ok === c.p?.textKey);
    c.t += dt;
    if (c.doneT > 0 && (c.doneT -= dt) <= 0) { this.hide(); return; }
    const p = c.p;
    if (!this.root.classList.contains('is-folded') && c.t >= (p.chipAfter ?? GUIDE.chipAfter)) flag(this.root, 'is-folded', true);
    // ghost paw
    const hints = this.ctx.state?.settings?.tutorialHints !== false;
    if (!vis || !hints || c.doneT > 0) { if (c.demoT >= 0) { c.demoT = -1; this._paw(false); } return; }
    c.idle += dt;
    const idleDemo = p.idleDemo ?? GUIDE.idleDemo, run = GUIDE.demoCycle * GUIDE.demoCycles;
    if (c.demoT < 0 && c.idle >= idleDemo) {
      c.demoT = 0; this.demos++;
      const demo = p.demo ?? 'tap', kbm = this.device !== 'touch' && !p.target && !this.ctx.ui?.beacon?.guide?.pos;
      flag(this.paw, 'is-hold', demo === 'hold');
      flag(this.paw, 'is-swipe', demo === 'swipe');
      flag(this.paw, 'is-key', kbm);
      setText(this.pawKey, kbm && p.action ? actionGlyph(p.action === 'chargeRelease' ? 'attack' : p.action, this.device, this.ctx.input) : '');
      flag(this.paw, 'is-on', true);
      pulse(this.paw, 'is-play');
      try { this.ctx.audio?.play2D?.('ghostPawPip'); } catch { /* audio optional */ }
    }
    if (c.demoT >= 0) {
      c.demoT += dt;
      const pt = this.paw.classList.contains('is-key') ? null : this._demoPoint(p);
      if (pt) place(this.paw, pt.x, pt.y);
      else { const r = this.chip.getBoundingClientRect?.(); if (r) place(this.paw, r.left + r.width / 2, r.bottom + 28); }
      if (c.demoT >= run) { c.demoT = -1; c.idle = 0; this._paw(false); }       // then wait idleDemo s again
    }
  }

  dispose() { this.root.remove(); this.paw.remove(); }
}
