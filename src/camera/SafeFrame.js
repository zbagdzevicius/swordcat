// src/camera/SafeFrame.js  (owner: camera) — research/next/AUTOCAM_SPEC.md §7: "on screen" means "the player can see
// it". Pure, node-tested, zero allocation after construction; never touches the DOM.
//
//   rebuild(vw, vh, insets, rects, portrait)   only when the occluder set changes (ui bumps `version`)
//     core      the largest axis-aligned rect free of every static occluder (exact maximal-rectangle sweep over the
//               occluder edges, inside `threat`), inset CAMERA.iso.frame.coreInset: she always stands inside it
//     herFrame  core ∩ the inner herInner (75 %) of the view (AUTOCAM D3): the lead / lean / pan clamp (§4.4)
//     threat    the viewport minus the safe-area insets, inset threatInset: the combat fit rect (×fitScale) and arrows
//     holes     the static occluder rects + live thumb holes, padded holePad px: visible() is false inside one
//     anchor    (ax, ay): where her focus sits (setViewOffset, §5.1) = clamp(centre(core) + bias, 0.5 ± maxShift)
//   setLive(...) / clearLive()   live thumb holes (the engaged joystick, a held button): affect visible() only, never
//               core or the anchor (her position must not twitch when a thumb lands, §7.1)
//   visible(sx, sy), inCore(sx, sy)   normalised viewport coordinates (0..1, y down)
//
// Until ui publishes `screenOccluders()` (requests/ui.md), `fallbackOccluders()` builds the rects from what the camera
// can read: the touch cluster layout (ui/touchLayout), a thumb column / band for the floating stick, the HUD block, the
// boss plate and the desktop ability bar.
import { CAMERA, TOUCH } from '../core/config.js';
import { computeLayout, clampTs } from '../ui/touchLayout.js';

const FRAME = CAMERA.iso.frame;
/** static occluder slots (rects) and live thumb slots */
export const MAX_STATIC = 24, MAX_LIVE = 4;

/**
 * Fallback HUD geometry (fractions of the viewport) used only until ui's `screenOccluders()` lands: the top-left HUD
 * block (hearts, Valor, lives) on desktop and on touch. Estimates of today's ui.css; replaced by measured rects.
 */
export const FALLBACK_HUD = Object.freeze({ desktopW: 0.30, desktopH: 0.08, touchW: 0.40, portraitH: 0.12 });

export class SafeFrame {
  constructor() {
    /** normalised rects { x0, y0, x1, y1 } (y down) */
    this.core = { x0: 0.06, y0: 0.12, x1: 0.94, y1: 0.88 };
    this.threat = { x0: 0.02, y0: 0.02, x1: 0.98, y1: 0.98 };
    this.herFrame = { x0: 0.125, y0: 0.125, x1: 0.875, y1: 0.875 };
    /** herFrame for calm walking (TT4): the landscape bottom raised by `frame.herBottomPad` */
    this.herFrameCalm = { x0: 0.125, y0: 0.125, x1: 0.875, y1: 0.875 };
    /** the anchor (where her focus sits) */
    this.ax = 0.5; this.ay = 0.54;
    /** holes: [x0, y0, x1, y1] × (static + live), normalised, padded */
    this.holes = new Float32Array(4 * (MAX_STATIC + MAX_LIVE));
    this.nStatic = 0; this.nHoles = 0;
    /** bumps on every rebuild (consumers cache per version) */
    this.version = 0;
    this.portrait = false;
    this.vw = 1280; this.vh = 720;
    /** the occluder signature of the last rebuild (FollowCamera skips identical rebuilds) */
    this.key = '';
    // sweep scratch: compressed edges and the per-column free height
    const E = 2 * MAX_STATIC + 2;
    this._xs = new Float64Array(E); this._ys = new Float64Array(E);
    this._hgt = new Float64Array(E); this._stk = new Int32Array(E + 1); this._pos = new Float64Array(E + 1);
  }

  /**
   * Rebuild every output from the viewport and the static occluders.
   * @param {number} vw @param {number} vh CSS px
   * @param {{top?:number, right?:number, bottom?:number, left?:number}|null} insets safe-area insets (CSS px)
   * @param {ArrayLike<{x:number, y:number, w:number, h:number, kind?:string}>} rects static occluders (CSS px)
   * @param {boolean} [portrait] defaults to vh > 1.05 vw
   * @param {object} [cfg] CAMERA.iso.frame
   * @returns {SafeFrame}
   */
  rebuild(vw, vh, insets, rects, portrait = vh > vw * 1.05, cfg = FRAME) {
    vw = Math.max(1, vw || 1); vh = Math.max(1, vh || 1);
    this.vw = vw; this.vh = vh; this.portrait = !!portrait;
    const ins = insets ?? {}, ti = cfg.threatInset, ci = cfg.coreInset;
    const T = this.threat;
    T.x0 = (ins.left ?? 0) / vw + ti; T.x1 = 1 - (ins.right ?? 0) / vw - ti;
    T.y0 = (ins.top ?? 0) / vh + ti; T.y1 = 1 - (ins.bottom ?? 0) / vh - ti;
    // holes, padded, clipped to the viewport
    const H = this.holes, px = cfg.holePad / vw, py = cfg.holePad / vh;
    let n = 0;
    for (let i = 0; i < (rects?.length ?? 0) && n < MAX_STATIC; i++) {
      const r = rects[i];
      if (!r || !(r.w > 0) || !(r.h > 0)) continue;
      const x0 = Math.max(0, r.x / vw - px), y0 = Math.max(0, r.y / vh - py);
      const x1 = Math.min(1, (r.x + r.w) / vw + px), y1 = Math.min(1, (r.y + r.h) / vh + py);
      if (x1 <= x0 || y1 <= y0) continue;
      const o = n * 4; H[o] = x0; H[o + 1] = y0; H[o + 2] = x1; H[o + 3] = y1; n++;
    }
    this.nStatic = n; this.nHoles = n;
    // core: the largest free rect inside `threat`, then inset
    const best = this._maxRect(vw, vh);
    const C = this.core;
    if (best) {
      C.x0 = best[0] + ci; C.y0 = best[1] + ci; C.x1 = best[2] - ci; C.y1 = best[3] - ci;
      if (C.x1 < C.x0) C.x0 = C.x1 = (best[0] + best[2]) / 2;
      if (C.y1 < C.y0) C.y0 = C.y1 = (best[1] + best[3]) / 2;
    } else { C.x0 = T.x0 + ci; C.y0 = T.y0 + ci; C.x1 = T.x1 - ci; C.y1 = T.y1 - ci; }
    // anchor: the core centre (+ a landscape bias: she sits a little low, more of the path above shows), clamped
    const bx = (C.x0 + C.x1) / 2, by = (C.y0 + C.y1) / 2 + (this.portrait ? 0 : cfg.landBiasY);
    this.ax = Math.min(0.5 + cfg.maxShiftX, Math.max(0.5 - cfg.maxShiftX, bx));
    this.ay = Math.min(0.5 + cfg.maxShiftY, Math.max(0.5 - cfg.maxShiftY, by));
    // herFrame = core ∩ the inner herInner of the view
    const hi = (1 - cfg.herInner) / 2, F = this.herFrame;
    F.x0 = Math.max(C.x0, hi); F.x1 = Math.min(C.x1, 1 - hi); F.y0 = Math.max(C.y0, hi); F.y1 = Math.min(C.y1, 1 - hi);
    if (F.x1 < F.x0) F.x0 = F.x1 = this.ax;
    if (F.y1 < F.y0) F.y0 = F.y1 = this.ay;
    // TT4 calm frame (out of combat, no boss): in landscape her bottom edge sits `herBottomPad` higher (her ring and feet
    // hang below her focus point; walking toward the paw trail put the ring on the desktop ability bar). Fights keep
    // herFrame, so a boss / pack fit keeps its room at the top
    const K = this.herFrameCalm;
    K.x0 = F.x0; K.x1 = F.x1; K.y0 = F.y0;
    K.y1 = Math.max(F.y0, Math.min(F.y1, C.y1 - (this.portrait ? 0 : cfg.herBottomPad ?? 0)));
    this.version++;
    return this;
  }

  /**
   * Exact maximal empty rectangle (largest CSS px area) of `threat` minus the static holes: the free cells of the
   * grid formed by every hole edge, then the stack-based largest rectangle in a histogram, row by row (variable
   * column widths). ≤ (2·24 + 2)² cells; runs only on a rebuild. Returns the module scratch [x0, y0, x1, y1] or null.
   */
  _maxRect(vw, vh) {
    const T = this.threat, H = this.holes, n = this.nStatic;
    const xs = this._xs, ys = this._ys;
    let nx = 0, ny = 0;
    xs[nx++] = T.x0; xs[nx++] = T.x1; ys[ny++] = T.y0; ys[ny++] = T.y1;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (H[o] > T.x0 && H[o] < T.x1) xs[nx++] = H[o];
      if (H[o + 2] > T.x0 && H[o + 2] < T.x1) xs[nx++] = H[o + 2];
      if (H[o + 1] > T.y0 && H[o + 1] < T.y1) ys[ny++] = H[o + 1];
      if (H[o + 3] > T.y0 && H[o + 3] < T.y1) ys[ny++] = H[o + 3];
    }
    nx = sortUnique(xs, nx); ny = sortUnique(ys, ny);
    const cols = nx - 1, hgt = this._hgt, stk = this._stk, pos = this._pos;
    if (cols < 1 || ny < 2) return null;
    for (let j = 0; j < cols; j++) hgt[j] = 0;
    let bestA = 0;
    const out = _best;
    for (let r = 0; r < ny - 1; r++) {
      const yA = ys[r], yB = ys[r + 1], cy = (yA + yB) / 2, rh = yB - yA;
      for (let j = 0; j < cols; j++) {
        const cx = (xs[j] + xs[j + 1]) / 2;
        let free = true;
        for (let i = 0; i < n; i++) { const o = i * 4; if (cx > H[o] && cx < H[o + 2] && cy > H[o + 1] && cy < H[o + 3]) { free = false; break; } }
        hgt[j] = free ? hgt[j] + rh : 0;
      }
      // largest rectangle in the histogram (bars j with x span xs[j]..xs[j+1], height hgt[j]); the rect's bottom is yB
      let sp = 0;
      for (let j = 0; j <= cols; j++) {
        const h = j < cols ? hgt[j] : 0;
        let start = xs[j];
        while (sp > 0 && hgt[stk[sp - 1]] >= h) {
          const top = stk[--sp], ht = hgt[top], x0 = pos[sp], x1 = xs[j];
          const a = (x1 - x0) * vw * ht * vh;
          if (ht > 0 && a > bestA + 1e-9) { bestA = a; out[0] = x0; out[1] = yB - ht; out[2] = x1; out[3] = yB; }
          start = x0;
        }
        if (j < cols) { stk[sp] = j; pos[sp] = start; sp++; }
      }
    }
    return bestA > 0 ? out : null;
  }

  /** Remove every live thumb hole. */
  clearLive() { this.nHoles = this.nStatic; return this; }

  /**
   * Add a live thumb hole (CSS px rect; padded by holePad like the static ones). Up to MAX_LIVE.
   * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
   */
  addLive(x0, y0, x1, y1, cfg = FRAME) {
    if (this.nHoles >= this.nStatic + MAX_LIVE) return this;
    const H = this.holes, o = this.nHoles * 4, px = cfg.holePad / this.vw, py = cfg.holePad / this.vh;
    H[o] = Math.max(0, x0 / this.vw - px); H[o + 1] = Math.max(0, y0 / this.vh - py);
    H[o + 2] = Math.min(1, x1 / this.vw + px); H[o + 3] = Math.min(1, y1 / this.vh + py);
    this.nHoles++;
    return this;
  }

  /** Is the normalised screen point (y down) inside `threat` and outside every hole? */
  visible(sx, sy) {
    const t = this.threat;
    if (!(sx >= t.x0 && sx <= t.x1 && sy >= t.y0 && sy <= t.y1)) return false;
    const h = this.holes;
    for (let i = 0; i < this.nHoles; i++) {
      const o = i * 4;
      if (sx > h[o] && sx < h[o + 2] && sy > h[o + 1] && sy < h[o + 3]) return false;
    }
    return true;
  }

  /** Is the point inside a hole (static or live)? (in `threat` or not) */
  inHole(sx, sy) {
    const h = this.holes;
    for (let i = 0; i < this.nHoles; i++) {
      const o = i * 4;
      if (sx > h[o] && sx < h[o + 2] && sy > h[o + 1] && sy < h[o + 3]) return true;
    }
    return false;
  }

  /** Is the normalised point inside `core`? */
  inCore(sx, sy) { const c = this.core; return sx >= c.x0 && sx <= c.x1 && sy >= c.y0 && sy <= c.y1; }

  /** Is the normalised point inside `herFrame`? */
  inHerFrame(sx, sy) { const c = this.herFrame; return sx >= c.x0 && sx <= c.x1 && sy >= c.y0 && sy <= c.y1; }

  /**
   * The combat fit rect in NDC (y up): `threat` scaled ×fitScale about its centre, its bottom edge raised by
   * fitBottomExtra (AUTOCAM §6.3). Writes out { xL, xR, yB, yT }.
   */
  fitRectNdc(out, cfg = FRAME) {
    const t = this.threat, k = cfg.fitScale, cx = (t.x0 + t.x1) / 2, cy = (t.y0 + t.y1) / 2;
    const hx = (t.x1 - t.x0) * k / 2, hy = (t.y1 - t.y0) * k / 2;
    out.xL = 2 * (cx - hx) - 1; out.xR = 2 * (cx + hx) - 1;
    out.yT = 1 - 2 * (cy - hy); out.yB = 1 - 2 * (cy + hy - cfg.fitBottomExtra);
    return out;
  }
}

const _best = [0, 0, 1, 1];

/** In-place insertion sort + dedupe (≤ 50 values). Returns the new length. */
function sortUnique(a, n) {
  for (let i = 1; i < n; i++) { const v = a[i]; let j = i - 1; while (j >= 0 && a[j] > v) { a[j + 1] = a[j]; j--; } a[j + 1] = v; }
  let m = 0;
  for (let i = 0; i < n; i++) if (m === 0 || a[i] - a[m - 1] > 1e-6) a[m++] = a[i];
  return m;
}

/**
 * Occluder rects (CSS px) the camera can derive without ui's `screenOccluders()`. Appends { x, y, w, h, kind } to `out`
 * (cleared first) and returns it.
 *   touch landscape: the cluster buttons (ui touchLayout, `o.layout` when ui has one, else computed), a thumb column
 *     2 stick radii wide on the stick side from the HUD strip down, a thumb band one stick radius tall along the bottom
 *     (resting thumbs and palms), the HUD block; portrait: the cluster, the stick zone, the HUD strip
 *   desktop / pad: the HUD block, the boss plate (`o.hudTop` px, full width) and the ability bar (`o.barInset` px)
 * @param {{ w:number, h:number, touch?:boolean, layout?:any, touchSize?:number, leftHanded?:boolean,
 *   safe?:{top?:number,right?:number,bottom?:number,left?:number}, hudTop?:number, barInset?:number }} o
 * @param {Array<{x:number,y:number,w:number,h:number,kind:string}>} out
 */
export function fallbackOccluders(o, out = []) {
  out.length = 0;
  const w = o.w, h = o.h, safe = o.safe ?? {}, portrait = h > w * 1.05;
  const left = safe.left ?? 0, right = safe.right ?? 0, top = safe.top ?? 0, bottom = safe.bottom ?? 0;
  if (o.touch) {
    const ts = clampTs(o.touchSize ?? 1), mirror = !!o.leftHanded;
    const L = o.layout?.buttons ? o.layout : computeLayout(w, h, { touchSize: ts, leftHanded: mirror, safe });
    for (const b of Object.values(L.buttons)) if (b && Number.isFinite(b.x)) out.push({ x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r, kind: 'cluster' });
    const hudBottom = Number.isFinite(L.hudBottom) ? L.hudBottom : h * 0.18 + top;
    const R = TOUCH.stickR * ts * (portrait ? TOUCH.portraitScale : 1);
    if (portrait) {
      const z = L.stickZone;
      if (z) out.push({ x: z.x0, y: z.y0, w: z.x1 - z.x0, h: z.y1 - z.y0, kind: 'stick' });
      out.push({ x: 0, y: 0, w, h: FALLBACK_HUD.portraitH * h + top, kind: 'hud' });
    } else {
      const colW = 2 * R + left;
      out.push({ x: mirror ? w - right - 2 * R : 0, y: hudBottom, w: colW + (mirror ? right : 0), h: h - hudBottom, kind: 'stick' });
      out.push({ x: 0, y: h - bottom - R, w, h: R + bottom, kind: 'stick' });
      const hw = FALLBACK_HUD.touchW * w;
      out.push({ x: mirror ? w - hw : 0, y: 0, w: hw, h: hudBottom, kind: 'hud' });
    }
    return out;
  }
  out.push({ x: left, y: top, w: FALLBACK_HUD.desktopW * w, h: FALLBACK_HUD.desktopH * h, kind: 'hud' });
  if (o.hudTop > 0) out.push({ x: 0, y: 0, w, h: o.hudTop, kind: 'hud' });
  if (o.barInset > 0) out.push({ x: 0, y: h - o.barInset, w, h: o.barInset, kind: 'bar' });
  return out;
}
