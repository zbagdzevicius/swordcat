// src/ui/UI.js  (owner: ui) — M0 STUB: the HTML overlay root (#ui), a loading veil (ctx.ui.loading(on),
// called by LevelManager) and plain toasts (ui:toast). Every screen in §14 is the ui agent's M1+ work.
import { E } from '../core/events.js';

export class UI {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = null; this.veil = null; this.toastEl = null;
    this._toastT = 0;
    this._offs = [];
  }

  async init() {
    if (typeof document === 'undefined') return;
    this.root = document.getElementById('ui') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'ui' }));
    this.veil = document.createElement('div');
    this.veil.className = 'ui-loading';
    this.veil.style.cssText = 'position:absolute;inset:0;background:#B7C0C3;opacity:0;transition:opacity .25s;pointer-events:none;' +
      'display:flex;align-items:flex-end;justify-content:flex-end;padding:24px;box-sizing:border-box;font:600 16px system-ui,sans-serif;color:#3A2A1F;';
    this.veil.textContent = 'Loading…';
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'ui-toast';
    this.toastEl.style.cssText = 'position:absolute;left:50%;top:12%;transform:translateX(-50%);padding:8px 16px;border-radius:12px;' +
      'background:#F4E7C9;color:#3A2A1F;font:600 15px system-ui,sans-serif;box-shadow:0 3px 0 #6B4A2B33;opacity:0;transition:opacity .3s;';
    this.root.append(this.veil, this.toastEl);
    this._offs.push(this.ctx.bus.on(E.TOAST, (p) => this.toast(p?.text ?? '')));
  }

  /** Show / hide the loading veil. */
  loading(on) { if (this.veil) this.veil.style.opacity = on ? '1' : '0'; }

  toast(text, sec = 2.5) {
    if (!this.toastEl) return;
    this.toastEl.textContent = text; this.toastEl.style.opacity = '1'; this._toastT = sec;
  }

  update(dt) {
    if (this._toastT > 0 && (this._toastT -= dt) <= 0 && this.toastEl) this.toastEl.style.opacity = '0';
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    this.veil?.remove(); this.toastEl?.remove();
  }
}
