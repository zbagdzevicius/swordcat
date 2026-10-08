// src/ui/dialog.js  (owner: ui) — the §14.2 dialogue scroll (bottom-centre): portrait, speaker name on a pink ribbon,
// typewriter text at 30 chars/s × settings.dialogSpeed, a bouncing paw when the line is complete, subtitle size from
// settings.subtitleSize (§14.4). Driven by dialog:start / dialog:line / dialog:end (story's `say` steps; audio babbles
// on the same events). The story runner owns advancing (it reads confirm / interact / attack / jump); when its live line
// (`ctx.story.line`) is visible the reveal follows it exactly, otherwise the box keeps its own clock. A tap / click on
// the scroll pulses `confirm` so touch and an unlocked mouse can advance too.
import { E } from '../core/events.js';
import { el, flag, setText, setHtml, setVar } from './dom.js';
import { segments, segLength, revealHtml, revealCount, revealDuration, txt } from './text.js';
import { portraitSVG } from './portraits.js';
import { speakerName } from '../story/strings.js';
import * as I from './icons.js';

export const DIALOG = Object.freeze({ cps: 30, autoTail: 0.35, closeDelay: 0.12 });

export class Dialog {
  /** @param {any} ctx @param {HTMLElement} parent */
  constructor(ctx, parent) {
    this.ctx = ctx;
    this.root = el('div', 'ui-dialog', { parent });
    this.root.innerHTML = '<div class="dlg-scroll"><div class="dlg-portrait"><div class="dlg-face"></div></div>'
      + '<div class="dlg-body"><div class="dlg-name"><span></span></div><div class="dlg-text"></div></div>'
      + `<div class="dlg-next">${I.paw('#D9668A')}</div></div>`;
    this.face = this.root.querySelector('.dlg-face');
    this.nameEl = this.root.querySelector('.dlg-name span');
    this.textEl = this.root.querySelector('.dlg-text');
    this.open = false;
    /** @type {null | {who:string, name:string, text:string, segs:any[], len:number, t:number, n:number, auto:number, key?:string, standalone:boolean}} */
    this.line = null;
    this._closeT = 0;
    this._session = false;      // inside a dialog:start … dialog:end pair
    this.root.addEventListener('pointerdown', (e) => { if (!this.open) return; e.preventDefault(); this._tap(); });
    const bus = ctx.bus;
    this._offs = [
      bus.on(E.DIALOG_START, () => { this._session = true; this._closeT = 0; if (this.line) this._show(true); }),
      bus.on(E.DIALOG_LINE, (p) => this.setLine(p)),
      bus.on(E.DIALOG_END, () => { this._session = false; this.close(); }),
      bus.on(E.CUTSCENE_END, () => this.close(true)),
      bus.on(E.LEVEL_LOADING, () => this.close(true)),
    ];
  }

  get visible() { return this.open; }

  /** Show a line (payload of dialog:line: { speaker, name?, text, portrait?, key?, auto? }). */
  setLine(p) {
    if (!p) return;
    const ctx = this.ctx;
    const who = p.speaker ?? p.who ?? '';
    const text = p.text != null ? String(p.text) : txt(ctx, p.key ?? '');
    const segs = segments(text);
    this.line = { who, name: p.name ?? (who ? speakerName(who) : ''), text, segs, len: segLength(segs), t: 0, n: -1, auto: +p.auto || 0, key: p.key, standalone: !this._session };
    this._closeT = 0;
    const pid = p.portrait ?? who;
    if (this._pid !== pid) { this._pid = pid; this.face.innerHTML = pid ? portraitSVG(String(pid), { expression: 'normal' }) : ''; }
    flag(this.root, 'no-portrait', !pid);
    setText(this.nameEl, this.line.name);
    flag(this.root, 'no-name', !this.line.name);
    setHtml(this.textEl, '');
    flag(this.root, 'is-complete', false);
    this._show(true);
  }

  /** Close the box (`now`: no grace period — cutscene end / level load). */
  close(now = false) {
    if (!this.open) return;
    if (now) { this._show(false); this.line = null; this._session = false; return; }
    this._closeT = DIALOG.closeDelay;       // a following dialog:start keeps it open without a flicker
  }

  _show(on) {
    this.open = on;
    flag(this.root, 'is-on', on);
    if (!on) { this._pid = null; }
  }

  _tap() {
    const inp = this.ctx.input, story = this.ctx.story;
    if (typeof story?.advance === 'function') story.advance();
    else if (inp?.pulse) inp.pulse('confirm');
    else { inp?.setVirtual?.('confirm', true); inp?.setVirtual?.('confirm', false); }
    if (this.line && this.line.n < this.line.len && !this._storyLine()) this.line.t = 1e3;   // complete our own reveal
  }

  /** The story runner's live line object when it matches the shown text. */
  _storyLine() {
    const sl = this.ctx.story?.line ?? this.ctx.story?.current?.line ?? null;
    return sl && this.line && sl.text === this.line.text ? sl : null;
  }

  /** @param {number} dt real seconds */
  render(dt) {
    const st = this.ctx.state?.settings;
    setVar(this.root, '--sub', (st?.subtitleSize ?? 1).toFixed(2));
    if (this._closeT > 0 && (this._closeT -= dt) <= 0) { this._show(false); this.line = null; }
    const L = this.line;
    if (!this.open || !L) return;
    L.t += dt;
    const sl = this._storyLine();
    let n;
    if (sl) n = sl.complete ? L.len : Math.round((sl.revealed ?? 0) * L.len);
    else n = revealCount(L.len, L.t, st?.dialogSpeed ?? 1, DIALOG.cps);
    if (n !== L.n) { L.n = n; setHtml(this.textEl, revealHtml(L.segs, n)); }
    const complete = n >= L.len;
    flag(this.root, 'is-complete', complete);
    // a stray line with no dialog:start / dialog:end (e.g. an ambient call) closes itself after its auto time
    if (L.standalone && L.auto > 0 && L.t >= Math.max(L.auto, revealDuration(L.len, st?.dialogSpeed ?? 1) + DIALOG.autoTail) + 0.5) this.close(true);
  }

  dispose() { for (const off of this._offs) off(); this.root.remove(); }
}
