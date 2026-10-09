// src/ui/threatArrows.js  (owner: ui) — GAME_DESIGN §8.1 off-screen threat arrows: any active telegraph whose actor is
// off-screen and within TELEGRAPH.arrowRadius (15 m) shows a chevron at the screen edge, coloured by kind (white parry,
// gold, red, purple grab / jeer), at most TELEGRAPH.maxArrows (4), nearest first. Listens to combat:telegraph /
// combat:telegraphEnd. Also draws the §7.7 "HUD edge ping" when a Meow reveals a hidden kitten (pink paw).
import * as THREE from 'three';
import { TELEGRAPH } from '../core/config.js';
import { E } from '../core/events.js';
import { el, flag, place } from './dom.js';
import { chevron, paw } from './icons.js';

/** Arrow colour per telegraph kind (§8.1: white, gold, red, purple; aoe orange; the dark `shadow` reads as ink). */
export const ARROW_COLORS = Object.freeze({ ...TELEGRAPH.colors, shadow: '#3A2A1F', aoe: TELEGRAPH.colors.aoe ?? '#FF6A3D' });

/**
 * Place an off-screen marker on the screen edge. `nx, ny` are NDC (−1..1, y up) of the projected point; `behind` is true
 * when the point is behind the camera (its projection is mirrored, so it is flipped back). Returns the clamped screen
 * position (px, y down) and the angle (rad, 0 = pointing right) from the centre toward the target. Pure.
 * @returns {{x:number, y:number, angle:number}}
 */
export function edgePoint(nx, ny, behind, w, h, margin = 36) {
  let x = nx, y = ny;
  if (behind) { x = -x; y = -y; }
  let dx = x * w * 0.5, dy = -y * h * 0.5;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) dy = 1;      // straight behind: point down
  const hw = Math.max(1, w * 0.5 - margin), hh = Math.max(1, h * 0.5 - margin);
  const s = Math.min(hw / Math.max(1e-6, Math.abs(dx)), hh / Math.max(1e-6, Math.abs(dy)));
  return { x: w * 0.5 + dx * s, y: h * 0.5 + dy * s, angle: Math.atan2(dy, dx) };
}

/** Is an NDC point on screen (inside the frustum, with a small inset)? Pure. */
export function onScreen(nx, ny, behind, inset = 0.92) {
  return !behind && Math.abs(nx) <= inset && Math.abs(ny) <= inset;
}

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3();

export class ThreatArrows {
  /** @param {any} ctx @param {HTMLElement} parent */
  constructor(ctx, parent) {
    this.ctx = ctx;
    this.root = el('div', 'ui-arrows', { parent });
    /** @type {Map<any, {actor:any, kind:string, t:number, dur:number}>} */
    this.tells = new Map();
    this.max = TELEGRAPH.maxArrows ?? 4;
    this.radius = TELEGRAPH.arrowRadius ?? 15;
    this.arrows = [];
    for (let i = 0; i < this.max; i++) {
      const a = el('div', 'ui-arrow', { html: chevron() + '<i class="arrow-pat"></i>', parent: this.root });
      this.arrows.push(a);
    }
    /** kitten pings: { pos: Vector3, t } */
    this.pings = [];
    this.pingEls = [0, 1].map(() => el('div', 'ui-ping', { html: paw('#D9668A'), parent: this.root }));
    this._cand = [];
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
    this.tells.set(p.id ?? p.actor, { actor: p.actor, kind: p.kind ?? 'parry', t: 0, dur: (p.duration ?? 1) + 0.6 });
  }

  _ping(pos) {
    if (!pos) return;
    const v = pos.isVector3 ? pos.clone() : new THREE.Vector3(pos[0] ?? pos.x ?? 0, pos[1] ?? pos.y ?? 0, pos[2] ?? pos.z ?? 0);
    this.pings.push({ pos: v, t: 0 });
    if (this.pings.length > this.pingEls.length) this.pings.shift();
  }

  /** @param {number} dt real seconds @param {boolean} visible */
  render(dt, visible) {
    const ctx = this.ctx, cam = ctx.camera, p = ctx.player;
    const w = window.innerWidth, h = window.innerHeight;
    const cand = this._cand; cand.length = 0;
    const set = ctx.state?.settings;
    this.patterns = !!set?.patterns;
    flag(this.root, 'is-calm', !!set?.reduceFlashes);
    for (const [id, tl] of this.tells) {
      tl.t += dt;
      const a = tl.actor;
      if (tl.t > tl.dur || !a || a.alive === false || a.dead) { this.tells.delete(id); continue; }
      if (!visible || !p || !cam) continue;
      const d = a.pos ? a.pos.distanceTo(p.pos) : Infinity;
      if (d > this.radius) continue;
      _v.copy(a.pos); _v.y += (a.height ?? 1) * 0.6;
      const behind = isBehind(cam, _v);
      _v.project(cam);
      if (onScreen(_v.x, _v.y, behind)) continue;
      cand.push({ d, x: _v.x, y: _v.y, behind, kind: tl.kind });
    }
    cand.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.arrows.length; i++) {
      const e = this.arrows[i], c = cand[i];
      flag(e, 'is-on', !!c);
      if (!c) continue;
      const ep = edgePoint(c.x, c.y, c.behind, w, h, 34);
      const col = ARROW_COLORS[c.kind] ?? '#FFFFFF';
      if (e._col !== col) { e._col = col; e.style.color = col; }
      flag(e, 'is-red', c.kind === 'red');
      // §14.4 accessibility: the optional pattern overlay (stripes for red, dots for gold) and no pulsing with reduce flashes
      flag(e, 'pat-stripes', this.patterns && (c.kind === 'red' || c.kind === 'aoe'));
      flag(e, 'pat-dots', this.patterns && c.kind === 'gold');
      place(e, ep.x, ep.y, ` rotate(${(ep.angle * 180 / Math.PI).toFixed(1)}deg) scale(${(1.25 - Math.min(1, c.d / this.radius) * 0.45).toFixed(2)})`);
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
      else { const ep = edgePoint(_v.x, _v.y, behind, w, h, 40); x = ep.x; y = ep.y; }
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
