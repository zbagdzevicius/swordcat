// src/ui/prompts.js  (owner: ui) — on-screen instructions:
//  • interaction tags (§14.2 world space: "parchment plus a wax-seal key glyph") from interact:available / clear;
//  • story prompts (§14.3 "prompt overlays ('HOLD THE STAND' with a filling ring)") from story:prompt;
//  • the tutorial hint card (§6.6 tut.* strings with keyboard / gamepad / touch glyphs swapped in), driven by
//    `ui.hint(keyOrText, opts)` or quest:update { questId, state, text }.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { el, flag, setHtml, setText, setVar, place, pulse } from './dom.js';
import { tx, txt, glyphify, actionGlyph } from './text.js';
import * as I from './icons.js';

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3();
const HINT_CALM = 2;      // s clear before a faded hint card comes back
const HINT_POLL = 0.1;    // s between occlusion checks
const HINT_PAD = 24;      // px around the card that still counts as covering a foe

/**
 * Does the hint card (screen rect) sit over the live joystick or an alerted foe? Reads ctx.ui.touch (stick) and
 * ctx.enemies.list (alive / alerted / pos) defensively.
 * @param {{ left: number, top: number, right: number, bottom: number }} r @param {any} ctx
 */
export function hintCovers(r, ctx) {
  if (!r || r.right <= r.left) return false;
  const tc = ctx?.ui?.touch;
  if (tc?.stick?.id != null && tc.base) {
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

/** Short label for an interaction tag: `prompt.<kind>` beats a long tutorial sentence. Pure. */
export function tagLabel(ctx, kind, promptKey) {
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
      bus.on(E.LEVEL_LOADING, () => { this.target = null; this.hint(null); this.prState = null; flag(this.prompt, 'is-on', false); }),
    ];
  }

  get device() { return this.ctx.input?.device ?? 'kbm'; }

  _redraw() { this._drawTag(); this._drawHint(); this._drawPrompt(); }

  _drawTag() {
    if (!this.target) return;
    // §10.4: the tag carries the device glyph ("Tap" / "E" / "Y")
    setText(this.tagKey, this.device === 'touch' ? tx(this.ctx, 'ui.tag.tap') : actionGlyph('interact', this.device, this.ctx.input));
    setText(this.tagTxt, tagLabel(this.ctx, this.target.kind, this.tagPrompt));
    flag(this.tag, 'is-long', this.tagKey.textContent.length > 2);
  }

  // ------------------------------------------------------------------ story:prompt
  _onPrompt(p) {
    if (!p) return;
    if (p.kind === 'tutorial') {                 // Midnight Practice: the parchment hint card (requests/story.md)
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
    setText(this.prKey, actionGlyph(act, this.device, this.ctx.input));
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
    if (this.target && vis.world && cam) {
      const pos = this.target.position;
      if (pos) {
        _v.set(pos.x ?? pos[0] ?? 0, (pos.y ?? pos[1] ?? 0) + 1.25, pos.z ?? pos[2] ?? 0);
        cam.getWorldDirection(_f); _d.copy(_v).sub(cam.position);
        if (_d.dot(_f) > 0) {
          _v.project(cam);
          if (Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05) {
            tagOn = true;
            place(this.tag, (_v.x * 0.5 + 0.5) * window.innerWidth, (-_v.y * 0.5 + 0.5) * window.innerHeight);
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
    this._busyHint(dt, !!h && vis.hint);
    setVar(this.hintEl, '--sub', (ctx.state?.settings?.subtitleSize ?? 1).toFixed(2));
  }

  /**
   * Touch: fade the hint card back while it covers the floating stick or an alerted foe, and restore it after
   * HINT_CALM seconds clear. The card rect is re-read at most every HINT_POLL s (a layout read).
   * @param {number} dt @param {boolean} on the card is up and visible
   */
  _busyHint(dt, on) {
    if (!on || this.device !== 'touch') { this._hintBusyT = 0; this._hintPoll = 0; flag(this.hintEl, 'is-busy', false); return; }
    if ((this._hintPoll = (this._hintPoll ?? 0) - dt) <= 0) {
      this._hintPoll = HINT_POLL;
      if (hintCovers(this.hintEl.getBoundingClientRect(), this.ctx)) this._hintBusyT = HINT_CALM;
    }
    this._hintBusyT = Math.max(0, (this._hintBusyT ?? 0) - dt);
    flag(this.hintEl, 'is-busy', this._hintBusyT > 0);
  }

  dispose() { for (const off of this._offs) off(); this.tag.remove(); this.prompt.remove(); this.hintEl.remove(); }
}

