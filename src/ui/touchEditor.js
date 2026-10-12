// src/ui/touchEditor.js  (owner: ui) — research/CONTROLS_SPEC.md §9.2 "Edit layout": drag the cluster buttons where
// the thumbs like them. Opened from Settings (touch only) while the game is paused. Every button shows (also the
// contextual ones: "!", Golden Hour, the kitten portrait); a button that comes closer than 8 px to another turns red
// and Done refuses until it is fixed. Done writes settings.touchLayout (offsets from the ⚔ anchor in unscaled,
// unmirrored px, portrait entries keyed `portrait:<name>`; see touchLayout.js), Reset clears this orientation's
// entries, Cancel drops the draft.
import { el, flag } from './dom.js';
import { tx, esc } from './text.js';
import { applySetting } from './settings.js';
import { offsetFor, layoutKey, layoutConflicts } from './touchLayout.js';

export class TouchLayoutEditor {
  /**
   * @param {any} ctx @param {import('./touch.js').TouchControls} touch
   * @param {() => void} onClose
   */
  constructor(ctx, touch, onClose) {
    this.ctx = ctx; this.touch = touch; this.onClose = onClose;
    const cur = ctx.state?.settings?.touchLayout;
    /** the working copy of settings.touchLayout */
    this.draft = cur && typeof cur === 'object' ? { ...cur } : {};
    this.drag = null;
    touch.editing = this;
    touch.layoutOverride = this.draft;
    touch._release();
    flag(touch.root, 'is-edit', true);
    this.panel = el('div', 'tedit-panel', { parent: touch.root });
    this.panel.innerHTML = `<p class="tedit-hint">${esc(tx(ctx, 'ui.touch.editHint'))}</p>`
      + `<div class="tedit-btns"><button class="tedit-b tedit-reset">${esc(tx(ctx, 'ui.touch.reset'))}</button>`
      + `<button class="tedit-b tedit-cancel">${esc(tx(ctx, 'menu.back'))}</button>`
      + `<button class="tedit-b tedit-done">${esc(tx(ctx, 'ui.touch.done'))}</button></div>`;
    const stop = (ev) => { ev.stopPropagation(); };
    this.panel.addEventListener('pointerdown', stop);
    this.panel.querySelector('.tedit-reset').addEventListener('click', () => this.reset());
    this.panel.querySelector('.tedit-cancel').addEventListener('click', () => this.close(false));
    this.panel.querySelector('.tedit-done').addEventListener('click', () => this.close(true));
    this._refresh();
  }

  get portrait() { return !!this.touch.layout?.portrait; }

  /** Pointer down on a cluster button (routed here by touch.js while editing). */
  down(action, ev, btnEl) {
    if (action === 'pause') return;
    const L = this.touch.layout, b = L?.buttons?.[action];
    if (!b) return;
    try { btnEl.setPointerCapture(ev.pointerId); } catch { /* synthetic */ }
    this.drag = { action, id: ev.pointerId, gx: ev.clientX - b.x, gy: ev.clientY - b.y, el: btnEl };
    flag(btnEl, 'is-drag', true);
  }

  move(action, ev) {
    const d = this.drag;
    if (!d || d.id !== ev.pointerId || d.action !== action) return;
    const L = this.touch.layout, mirror = !!this.ctx.state?.settings?.leftHanded;
    this.draft[layoutKey(action, L.portrait)] = offsetFor(L, ev.clientX - d.gx, ev.clientY - d.gy, mirror);
    this._refresh();
  }

  up(action, ev) {
    const d = this.drag;
    if (!d || (ev && d.id !== ev.pointerId)) return;
    flag(d.el, 'is-drag', false);
    this.drag = null;
    this._refresh();
  }

  /** Clear this orientation's custom positions. */
  reset() {
    const port = this.portrait;
    for (const k of Object.keys(this.draft)) if (k.startsWith('portrait:') === port) delete this.draft[k];
    this._refresh();
    this._sfx('ui.toggle');
  }

  /** Re-lay the cluster from the draft and mark buttons that break the 8 px rule. Returns the conflicts. */
  _refresh() {
    const t = this.touch;
    t.layoutOverride = this.draft;
    t._layoutKey = '';
    const L = t._relayout();
    const bad = new Set(layoutConflicts(L));
    for (const [name, e] of t.btns) flag(e, 'is-bad', bad.has(name));
    flag(this.panel.querySelector('.tedit-done'), 'is-off', bad.size > 0);
    return bad;
  }

  /** @param {boolean} save */
  close(save) {
    if (save) {
      if (this._refresh().size) { this._sfx('ui.error'); flag(this.panel, 'is-shake', false); void this.panel.offsetWidth; flag(this.panel, 'is-shake', true); return false; }
      applySetting(this.ctx, 'touchLayout', Object.keys(this.draft).length ? { ...this.draft } : null);
      this._sfx('ui.confirm');
    } else this._sfx('ui.back');
    const t = this.touch;
    t.editing = null;
    t.layoutOverride = undefined;
    t._layoutKey = '';
    for (const e of t.btns.values()) { flag(e, 'is-bad', false); flag(e, 'is-drag', false); }
    flag(t.root, 'is-edit', false);
    this.panel.remove();
    this.onClose?.();
    return true;
  }

  _sfx(id) { try { this.ctx.audio?.play2D?.(id); } catch { /* audio optional */ } }
}
