// src/ui/threatArrows.js  (owner: ui) — GAME_DESIGN §8.1 off-screen threat arrows, placed on the SafeFrame border
// (AUTOCAM §7.4) and drawn with the telegraph's glyph (WA §3.4 / ui.W5):
//
//  • any active telegraph whose actor is not VISIBLE to the player (off screen, or hidden under a HUD block / a cluster
//    button: `cam.onScreen`, the SafeFrame test, when the camera has it) and within TELEGRAPH.arrowRadius (15 m) shows a
//    chevron, coloured by kind (TELEGRAPH.colors) with its glyph (TELEGRAPH.glyph: shield, 8-point star, double chevron,
//    6-dot burst, paw, crow-foot, arrow) inside; at most TELEGRAPH.maxArrows (4), nearest first; 28 px on touch;
//  • the arrow sits on the `threat` border of `cam.safeFrame` (viewport minus safe area, inset 2 %) inset 10 px; if that
//    point lands in a hole (HUD block, a button) it slides along the border to the nearest free spot (≤ 25 % of the
//    perimeter), else it stacks at the nearest free corner;
//  • a telegraph that targets her (`targetsPlayer`) pulses in the parry-ring colour;
//  • the §7.7 "HUD edge ping" when a Meow reveals a hidden kitten (pink paw).
// Listens to combat:telegraph / combat:telegraphEnd. Per frame: no allocation (pooled candidates, scratch vectors).
import * as THREE from 'three';
import { TELEGRAPH } from '../core/config.js';
import { E } from '../core/events.js';
import { el, flag, place, setHtml } from './dom.js';
import { chevron, paw, glyph } from './icons.js';

/** Arrow colour per telegraph kind (WA §2.7: the crow `shadow` plum is lifted so the chevron reads on the border). */
export const ARROW_COLORS = Object.freeze({ ...TELEGRAPH.colors, shadow: '#6A5A8A', aoe: TELEGRAPH.colors.aoe ?? '#FF9A3D' });

/** Glyph name per telegraph kind (WA §3.4; config TELEGRAPH.glyph). */
export const ARROW_GLYPHS = Object.freeze({ parry: 'shield', gold: 'star8', red: 'chevron2', aoe: 'dots6', grab: 'paw', shadow: 'crowfoot', aim: 'arrow', jeer: 'paw', ...(TELEGRAPH.glyph ?? {}) });

/** Border placement numbers (AUTOCAM §7.4). */
export const ARROW = Object.freeze({ inset: 10, slideMax: 0.25, slideStep: 8, sizeTouch: 28, sizeDesk: 36, threatInset: 0.02 });

/**
 * Place an off-screen marker on the screen edge. `nx, ny` are NDC (−1..1, y up) of the projected point; `behind` is true
 * when the point is behind the camera (its projection is mirrored, so it is flipped back). Returns the clamped screen
 * position (px, y down) and the angle (rad, 0 = pointing right) from the centre toward the target. Pure.
 * @returns {{x:number, y:number, angle:number}}
 */
export function edgePoint(nx, ny, behind, w, h, margin = 36, out = { x: 0, y: 0, angle: 0 }) {
  let x = nx, y = ny;
  if (behind) { x = -x; y = -y; }
  let dx = x * w * 0.5, dy = -y * h * 0.5;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) dy = 1;      // straight behind: point down
  const hw = Math.max(1, w * 0.5 - margin), hh = Math.max(1, h * 0.5 - margin);
  const s = Math.min(hw / Math.max(1e-6, Math.abs(dx)), hh / Math.max(1e-6, Math.abs(dy)));
  out.x = w * 0.5 + dx * s; out.y = h * 0.5 + dy * s; out.angle = Math.atan2(dy, dx);
  return out;
}

/** Is an NDC point on screen (inside the frustum, with a small inset)? Pure. */
export function onScreen(nx, ny, behind, inset = 0.92) {
  return !behind && Math.abs(nx) <= inset && Math.abs(ny) <= inset;
}

/** Is (x, y) inside any hole rect? `holes` = flat [x, y, w, h, …] (px) with `n` rects. Pure. */
export function inHoles(x, y, holes, n) {
  for (let i = 0; i < n; i++) {
    const k = i * 4;
    if (x >= holes[k] && x <= holes[k] + holes[k + 2] && y >= holes[k + 1] && y <= holes[k + 1] + holes[k + 3]) return true;
  }
  return false;
}

/**
 * A point on the perimeter of `r` ({x, y, w, h}, px) at arc length `s` (clockwise from the top-left corner). Pure.
 */
export function perimeterPoint(r, s, out) {
  const P = 2 * (r.w + r.h);
  let t = ((s % P) + P) % P;
  if (t < r.w) { out.x = r.x + t; out.y = r.y; return out; }
  t -= r.w;
  if (t < r.h) { out.x = r.x + r.w; out.y = r.y + t; return out; }
  t -= r.h;
  if (t < r.w) { out.x = r.x + r.w - t; out.y = r.y + r.h; return out; }
  t -= r.w;
  out.x = r.x; out.y = r.y + r.h - t;
  return out;
}

/** Arc length (clockwise from the top-left corner) of a point already on the perimeter of `r`. Pure. */
export function perimeterS(r, x, y) {
  const e = 0.5;
  if (Math.abs(y - r.y) <= e) return x - r.x;
  if (Math.abs(x - (r.x + r.w)) <= e) return r.w + (y - r.y);
  if (Math.abs(y - (r.y + r.h)) <= e) return r.w + r.h + (r.x + r.w - x);
  return 2 * r.w + r.h + (r.y + r.h - y);
}

/**
 * AUTOCAM §7.4 placement: the ray from the border rect's centre toward the target (`ang`, rad, y down) meets the border;
 * if that point is in a hole, slide along the perimeter (alternating sides, ≤ slideMax of it) to the nearest free spot,
 * else take the nearest free corner (or the original point when every corner is covered). Pure; writes `out`.
 * @param {{x:number,y:number,w:number,h:number}} r @param {number} ang @param {Float32Array|number[]} holes @param {number} n
 * @returns {{x:number, y:number}}
 */
export function borderPlace(r, ang, holes, n, out) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const s = Math.min((r.w / 2) / Math.max(1e-6, Math.abs(dx)), (r.h / 2) / Math.max(1e-6, Math.abs(dy)));
  out.x = cx + dx * s; out.y = cy + dy * s;
  if (!n || !inHoles(out.x, out.y, holes, n)) return out;
  const P = 2 * (r.w + r.h), s0 = perimeterS(r, out.x, out.y), max = P * ARROW.slideMax;
  for (let d = ARROW.slideStep; d <= max; d += ARROW.slideStep) {
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      perimeterPoint(r, s0 + sgn * d, out);
      if (!inHoles(out.x, out.y, holes, n)) return out;
    }
  }
  // the nearest free corner
  const tx = cx + dx * s, ty = cy + dy * s;
  let best = -1, bd = Infinity;
  for (let i = 0; i < 4; i++) {
    const qx = i === 1 || i === 2 ? r.x + r.w : r.x, qy = i >= 2 ? r.y + r.h : r.y;
    if (inHoles(qx, qy, holes, n)) continue;
    const dd = (qx - tx) * (qx - tx) + (qy - ty) * (qy - ty);
    if (dd < bd) { bd = dd; best = i; }
  }
  if (best >= 0) { out.x = best === 1 || best === 2 ? r.x + r.w : r.x; out.y = best >= 2 ? r.y + r.h : r.y; }
  else { out.x = tx; out.y = ty; }
  return out;
}

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3();
const _rect = { x: 0, y: 0, w: 0, h: 0 }, _pt = { x: 0, y: 0 }, _ep = { x: 0, y: 0, angle: 0 };
const MAX_HOLES = 24;

export class ThreatArrows {
  /** @param {any} ctx @param {HTMLElement} parent */
  constructor(ctx, parent) {
    this.ctx = ctx;
    this.root = el('div', 'ui-arrows', { parent });
    /** @type {Map<any, {actor:any, kind:string, t:number, dur:number, me:boolean}>} */
    this.tells = new Map();
    this.max = TELEGRAPH.maxArrows ?? 4;
    this.radius = TELEGRAPH.arrowRadius ?? 15;
    this.arrows = [];
    for (let i = 0; i < this.max; i++) {
      const a = el('div', 'ui-arrow', { html: chevron() + '<span class="arrow-glyph"></span><i class="arrow-pat"></i>', parent: this.root });
      a._glyph = a.querySelector('.arrow-glyph');
      this.arrows.push(a);
    }
    /** kitten pings: { pos: Vector3, t } */
    this.pings = [];
    this.pingEls = [0, 1].map(() => el('div', 'ui-ping', { html: paw('#FF8FB1'), parent: this.root }));
    /** pooled candidates (no per-frame allocation) */
    this._cand = [];
    for (let i = 0; i < 24; i++) this._cand.push({ d: 0, x: 0, y: 0, behind: false, kind: '', me: false });
    this._nCand = 0;
    this._holes = new Float32Array(MAX_HOLES * 4);
    this.shown = 0;                 // arrows on screen this frame (tests / smoke)
    const bus = ctx.bus;
    this._offs = [
      bus.on(E.TELEGRAPH, (p) => this._add(p)),
      bus.on(E.TELEGRAPH_END, (p) => { if (p?.id != null) this.tells.delete(p.id); }),
      bus.on(E.KITTEN_REVEAL, (p) => this._ping(p?.position)),
      bus.on(E.LEVEL_LOADING, () => { this.tells.clear(); this.pings.length = 0; }),
    ];
  }

  _add(p) {
    if (!p || !p.actor) return;
    if (this.tells.size > 24) { const k = this.tells.keys().next().value; this.tells.delete(k); }
    this.tells.set(p.id ?? p.actor, { actor: p.actor, kind: p.kind ?? 'parry', t: 0, dur: (p.duration ?? p.windup ?? 1) + 0.6, me: !!p.targetsPlayer });
  }

  _ping(pos) {
    if (!pos) return;
    const v = pos.isVector3 ? pos.clone() : new THREE.Vector3(pos[0] ?? pos.x ?? 0, pos[1] ?? pos.y ?? 0, pos[2] ?? pos.z ?? 0);
    this.pings.push({ pos: v, t: 0 });
    if (this.pings.length > this.pingEls.length) this.pings.shift();
  }

  /**
   * The border rect (px) and holes for this frame: the camera's SafeFrame when it has one (normalised `threat` rect and
   * `holes`), else the viewport minus the safe area inset 2 %, with the ui's own occluder rects as holes.
   */
  _frame(w, h) {
    const sf = this.ctx.cam?.safeFrame, inset = ARROW.inset;
    const thr = sf?.threat;
    if (thr && Number.isFinite(thr.x0 ?? thr.x)) {
      const x0 = (thr.x0 ?? thr.x) * w, y0 = (thr.y0 ?? thr.y) * h;
      const x1 = thr.x1 != null ? thr.x1 * w : x0 + (thr.w ?? 1) * w, y1 = thr.y1 != null ? thr.y1 * h : y0 + (thr.h ?? 1) * h;
      _rect.x = x0 + inset; _rect.y = y0 + inset; _rect.w = Math.max(1, x1 - x0 - 2 * inset); _rect.h = Math.max(1, y1 - y0 - 2 * inset);
    } else {
      const sa = this.ctx.ui?.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 };
      const ix = w * ARROW.threatInset + inset, iy = h * ARROW.threatInset + inset;
      _rect.x = sa.left + ix; _rect.y = sa.top + iy; _rect.w = Math.max(1, w - sa.left - sa.right - 2 * ix); _rect.h = Math.max(1, h - sa.top - sa.bottom - 2 * iy);
    }
    // holes: the SafeFrame's (normalised x, y, w, h quads) or the ui's measured occluders (px)
    let n = 0;
    const H = this._holes;
    if (sf?.holes && sf.holes.length >= 4 && Number.isFinite(sf.holeCount ?? sf.nHoles)) {
      const cnt = Math.min(MAX_HOLES, sf.holeCount ?? sf.nHoles);
      for (let i = 0; i < cnt; i++) { const k = i * 4; H[k] = sf.holes[k] * w; H[k + 1] = sf.holes[k + 1] * h; H[k + 2] = sf.holes[k + 2] * w; H[k + 3] = sf.holes[k + 3] * h; }
      n = cnt;
    } else {
      const occ = this.ctx.ui?.screenOccluders?.();
      const rects = occ?.rects;
      if (rects) for (let i = 0; i < rects.length && n < MAX_HOLES; i++) { const r = rects[i], k = n * 4; H[k] = r.x; H[k + 1] = r.y; H[k + 2] = r.w; H[k + 3] = r.h; n++; }
    }
    return n;
  }

  /** @param {number} dt real seconds @param {boolean} visible */
  render(dt, visible) {
    const ctx = this.ctx, cam = ctx.camera, p = ctx.player, rig = ctx.cam;
    const w = window.innerWidth, h = window.innerHeight;
    const set = ctx.state?.settings;
    this.patterns = !!set?.patterns;
    flag(this.root, 'is-calm', !!set?.reduceFlashes);
    flag(this.root, 'is-touch', ctx.input?.device === 'touch');
    this._nCand = 0;
    const cand = this._cand;
    for (const [id, tl] of this.tells) {
      tl.t += dt;
      const a = tl.actor;
      if (tl.t > tl.dur || !a || a.alive === false || a.dead) { this.tells.delete(id); continue; }
      if (!visible || !p || !cam || !a.pos) continue;
      const d = a.pos.distanceTo(p.pos);
      if (d > this.radius) continue;
      _v.copy(a.pos); _v.y += (a.height ?? 1) * 0.6;
      // AUTOCAM K4: "visible" = the SafeFrame test (a foe under the ⚔ button counts as hidden)
      const vis = typeof rig?.onScreen === 'function' && rig.safeFrame ? rig.onScreen(_v, 0) : null;
      const behind = isBehind(cam, _v);
      _v.project(cam);
      if ((vis === null ? onScreen(_v.x, _v.y, behind) : vis) && !a.hidden) continue;
      if (this._nCand >= cand.length) continue;
      const c = cand[this._nCand++];
      c.d = d; c.x = _v.x; c.y = _v.y; c.behind = behind; c.kind = tl.kind; c.me = tl.me;
    }
    // nearest first (insertion sort over ≤ 24 pooled entries: no allocation)
    for (let i = 1; i < this._nCand; i++) { const c = cand[i]; let j = i - 1; while (j >= 0 && cand[j].d > c.d) { cand[j + 1] = cand[j]; j--; } cand[j + 1] = c; }
    const nh = this._nCand ? this._frame(w, h) : 0;
    const touch = ctx.input?.device === 'touch';
    this.shown = 0;
    for (let i = 0; i < this.arrows.length; i++) {
      const e = this.arrows[i], c = i < this._nCand ? cand[i] : null;
      flag(e, 'is-on', !!c);
      if (!c) continue;
      this.shown++;
      edgePoint(c.x, c.y, c.behind, w, h, 34, _ep);
      borderPlace(_rect, _ep.angle, this._holes, nh, _pt);
      const col = ARROW_COLORS[c.kind] ?? '#FFFFFF';
      if (e._col !== col) { e._col = col; e.style.color = col; }
      const g = ARROW_GLYPHS[c.kind] ?? 'chevron2';
      if (e._g !== g) { e._g = g; setHtml(e._glyph, glyph(g)); }
      flag(e, 'is-red', c.kind === 'red');
      flag(e, 'is-me', c.me);
      // §14.4 accessibility: the optional pattern overlay (stripes for red, dots for gold) and no pulsing with reduce flashes
      flag(e, 'pat-stripes', this.patterns && (c.kind === 'red' || c.kind === 'aoe'));
      flag(e, 'pat-dots', this.patterns && c.kind === 'gold');
      const k = (touch ? ARROW.sizeTouch : ARROW.sizeDesk) / ARROW.sizeDesk;
      place(e, _pt.x, _pt.y, ` rotate(${(_ep.angle * 180 / Math.PI).toFixed(1)}deg) scale(${((1.25 - Math.min(1, c.d / this.radius) * 0.45) * k).toFixed(2)})`);
      const ga = Math.round(-_ep.angle * 180 / Math.PI);            // the glyph stays upright (written on change)
      if (e._ga !== ga) { e._ga = ga; e._glyph.style.transform = `translate(-50%, -50%) rotate(${ga}deg)`; }
    }
    // kitten pings (3 s)
    for (let i = this.pings.length - 1; i >= 0; i--) { this.pings[i].t += dt; if (this.pings[i].t > 3) this.pings.splice(i, 1); }
    for (let i = 0; i < this.pingEls.length; i++) {
      const e = this.pingEls[i], pg = this.pings[i];
      flag(e, 'is-on', !!pg && visible && !!cam);
      if (!pg || !cam) continue;
      _v.copy(pg.pos); _v.y += 0.6;
      const behind = isBehind(cam, _v);
      _v.project(cam);
      let x, y;
      if (onScreen(_v.x, _v.y, behind, 0.95)) { x = (_v.x * 0.5 + 0.5) * w; y = (-_v.y * 0.5 + 0.5) * h; }
      else { edgePoint(_v.x, _v.y, behind, w, h, 40, _ep); x = _ep.x; y = _ep.y; }
      place(e, x, y, ` scale(${(1 + Math.sin(pg.t * 9) * 0.12).toFixed(3)})`);
    }
  }

  dispose() { for (const off of this._offs) off(); this.root.remove(); }
}

function isBehind(cam, v) {
  cam.getWorldDirection(_f);
  _d.copy(v).sub(cam.position);
  return _d.dot(_f) < 0;
}
