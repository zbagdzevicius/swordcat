// src/ui/occluders.js  (owner: ui) — AUTOCAM_SPEC §7.1 inputs for the camera's SafeFrame (M:ui.1):
//
//  • `screenOccluders()` → `{ version, rects: [{ x, y, w, h, kind }] }` in CSS px, kind ∈ hud | cluster | stick | bar |
//    dialog | chip. These are the MEASURED rects of the real elements that take input or hide the world (the HUD
//    blocks, the touch cluster buttons, the ability bar, an open dialogue, the kitten-mode offer chips) plus the
//    joystick's rest zone. `version` bumps only when a rect changes (layout, rotation, touch size / layout edits, the
//    mirror toggle, dialogue open / close, the calm-HUD tuck); value changes (hearts, Valor) never bump it.
//    [X22] pointer-events-none decoration (`#ui-vignette`, `#ui-flash`, toasts, damage numbers, world HP bars, the
//    guide bubble, `?perf`) is never an occluder.
//  • `safeArea` — `env(safe-area-inset-*)` read from a hidden probe div once per layout.
//  • live thumb state (read-only, see touch.js `thumbs`).
//
// Measuring reads layout, so it runs at most OCCL.hz times a second (and on demand after a layout event); the result
// object and its rect entries are reused (no per-frame allocation for readers).

/** Re-measure rate (Hz) and the px quantum rects are snapped to before comparing (sub-pixel jitter never bumps). */
export const OCCL = Object.freeze({ hz: 4, quantum: 2, maxRects: 24 });

/**
 * Write a rect into a pooled entry, snapped outward to OCCL.quantum px. Pure on its inputs; returns the entry.
 * @param {{x:number,y:number,w:number,h:number,kind:string}} out @param {number} l @param {number} t
 * @param {number} r @param {number} b @param {string} kind
 */
export function snapRect(out, l, t, r, b, kind) {
  const q = OCCL.quantum;
  const x0 = Math.floor(l / q) * q, y0 = Math.floor(t / q) * q, x1 = Math.ceil(r / q) * q, y1 = Math.ceil(b / q) * q;
  out.x = x0; out.y = y0; out.w = Math.max(0, x1 - x0); out.h = Math.max(0, y1 - y0); out.kind = kind;
  return out;
}

/** A cheap order-sensitive signature of `n` rects (numbers only; no string building). Pure. */
export function rectsHash(rects, n) {
  let h = n * 2654435761 >>> 0;
  for (let i = 0; i < n; i++) {
    const r = rects[i];
    h = Math.imul(h ^ (r.x | 0), 16777619) >>> 0;
    h = Math.imul(h ^ (r.y | 0), 16777619) >>> 0;
    h = Math.imul(h ^ (r.w | 0), 16777619) >>> 0;
    h = Math.imul(h ^ (r.h | 0), 16777619) >>> 0;
    h = Math.imul(h ^ KIND_ID[r.kind] | 0, 16777619) >>> 0;
  }
  return h;
}
const KIND_ID = { hud: 1, cluster: 2, stick: 3, bar: 4, dialog: 5, chip: 6 };

/** Is an element really on screen (laid out, not hidden by display / visibility / opacity ≈ 0)? */
function shown(e) {
  if (!e || !e.isConnected) return false;
  const cs = getComputedStyle(e);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0.05;
}

export class Occluders {
  /** @param {any} ui the UI facade (hud, bar, touch, dialog, offer) */
  constructor(ui) {
    this.ui = ui;
    this.version = 0;
    this._pool = [];
    for (let i = 0; i < OCCL.maxRects; i++) this._pool.push({ x: 0, y: 0, w: 0, h: 0, kind: 'hud' });
    /** the published object: { version, rects } (rects is a stable array; entries are reused) */
    this.out = { version: 0, rects: [] };
    this._n = 0; this._hash = -1;
    this._t = 0;
    this._dirty = true;
    /** env(safe-area-inset-*) in CSS px */
    this.safeArea = { top: 0, right: 0, bottom: 0, left: 0 };
    this._probe = null;
  }

  /** Re-measure on the next render (resize, settings, dialogue open / close …). */
  invalidate() { this._dirty = true; }

  /** The hidden probe div that resolves env(safe-area-inset-*) (created on first use). */
  _readSafeArea() {
    if (typeof document === 'undefined') return this.safeArea;
    if (!this._probe) {
      const p = document.createElement('div');
      p.className = 'ui-safe-probe';
      p.setAttribute('aria-hidden', 'true');
      p.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
        + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
      document.body.appendChild(p);
      this._probe = p;
    }
    const cs = getComputedStyle(this._probe), s = this.safeArea;
    s.top = parseFloat(cs.paddingTop) || 0; s.right = parseFloat(cs.paddingRight) || 0;
    s.bottom = parseFloat(cs.paddingBottom) || 0; s.left = parseFloat(cs.paddingLeft) || 0;
    return s;
  }

  _push(l, t, r, b, kind) {
    if (this._n >= OCCL.maxRects || !(r > l) || !(b > t)) return;
    snapRect(this._pool[this._n++], l, t, r, b, kind);
  }

  _pushEl(e, kind) {
    if (!shown(e)) return;
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) this._push(r.left, r.top, r.right, r.bottom, kind);
  }

  /** One rect around every shown element of `list` (nothing when none is shown). */
  _unionEls(list, kind) {
    if (!list) return;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!shown(e)) continue;
      const q = e.getBoundingClientRect();
      if (!(q.width > 0 && q.height > 0)) continue;
      if (q.left < l) l = q.left; if (q.top < t) t = q.top; if (q.right > r) r = q.right; if (q.bottom > b) b = q.bottom;
    }
    if (r > l) this._push(l, t, r, b, kind);
  }

  /** Measure now (layout reads). Bumps `version` when the snapped rect set changed. */
  measure() {
    const ui = this.ui;
    this._n = 0;
    if (typeof document === 'undefined') return this.out;
    this._readSafeArea();
    const hud = ui.hud;
    if (hud?.visible !== false && hud?.root && !hud.root.classList.contains('is-hidden')) {
      // the calm HUD (WA §4.1) fades parts out: each block is the union of its children that are really shown
      this._unionEls(hud.tlParts, 'hud');
      this._unionEls(hud.trParts, 'hud');
      if (hud.bossEl?.classList.contains('is-on')) this._pushEl(hud.bossEl, 'hud');
      if (hud.compEl?.classList.contains('is-on')) this._pushEl(hud.compEl, 'hud');
    }
    const bar = ui.bar;
    if (bar?.root?.classList.contains('is-on')) this._pushEl(bar.root, 'bar');
    const tc = ui.touch;
    if (tc?.enabled && tc.root?.classList.contains('is-play')) {
      // the cluster from its LAYOUT geometry, so a lesson-veiled button (visibility hidden, WA §7.5) still counts
      const L = tc.layout;
      if (L?.buttons) for (const name in L.buttons) { const b = L.buttons[name]; if (b && tc.occludes(name)) this._push(b.x - b.r, b.y - b.r, b.x + b.r, b.y + b.r, 'cluster'); }
      this._pushEl(tc.pauseBtn, 'hud');
      const st = tc.stickRest?.();
      if (st) this._push(st.x - st.r, st.y - st.r, st.x + st.r, st.y + st.r, 'stick');
    }
    if (ui.dialog?.visible) this._pushEl(ui.dialog.box ?? ui.dialog.root, 'dialog');
    if (ui.offer?.open) this._pushEl(ui.offer.root, 'chip');
    const rects = this.out.rects;
    rects.length = 0;
    for (let i = 0; i < this._n; i++) rects.push(this._pool[i]);
    const h = rectsHash(rects, this._n);
    if (h !== this._hash) { this._hash = h; this.version++; this.out.version = this.version; }
    return this.out;
  }

  /** Per frame: re-measure at OCCL.hz, or right away after invalidate(). */
  render(dt) {
    this._t -= dt;
    if (!this._dirty && this._t > 0) return;
    this._dirty = false;
    this._t = 1 / OCCL.hz;
    this.measure();
  }

  dispose() { this._probe?.remove(); this._probe = null; }
}
