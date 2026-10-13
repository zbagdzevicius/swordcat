// src/ui/flyIcons.js  (owner: ui) — WARM_ADVENTURE_SPEC §5.5 (CL §6) fly-to-HUD: a picked-up fish (heart, milk) pops
// out of the world as a DOM icon and flies to its HUD counter along a quadratic Bézier (control point PICKUP_FX.flyLift
// px above the midpoint, PICKUP_FX.flyMs), then the counter bumps 1.25 → 1 over 0.2 s.
//
// Pool of PICKUP_FX.pool (8) elements; each flight is ONE CSS animation (two keyframe tracks driven by `--dx`, `--dy`,
// `--lift` custom properties, sampled at the Bézier's quarter points), so a flight costs a handful of style writes at
// launch and none per frame (PERF §10.5; transform / opacity only). 0 draws.
import * as THREE from 'three';
import { PICKUP_FX } from '../core/config.js';
import { el, flag, setVar, pulse } from './dom.js';
import * as I from './icons.js';

const P = PICKUP_FX ?? { flyMs: 450, flyLift: 120, pool: 8 };

/**
 * A point on the quadratic Bézier from (0,0) to (dx,dy) whose control point is `lift` px above the midpoint. Pure.
 * @returns {{x:number, y:number}}
 */
export function flyPoint(t, dx, dy, lift = P.flyLift, out = { x: 0, y: 0 }) {
  const u = 1 - t, cx = dx / 2, cy = dy / 2 - lift;
  out.x = 2 * u * t * cx + t * t * dx;
  out.y = 2 * u * t * cy + t * t * dy;
  return out;
}

const ICON = { fish: () => I.fish(), smallHeart: () => I.heart('full'), heart: () => I.heart('full'), milk: () => I.milkBottle(true) };
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3();

export class FlyIcons {
  /** @param {any} ctx @param {HTMLElement} parent @param {(key: string) => DOMRect|null} homeRect @param {(key: string) => void} onArrive */
  constructor(ctx, parent, homeRect, onArrive) {
    this.ctx = ctx; this.homeRect = homeRect; this.onArrive = onArrive;
    this.root = el('div', 'ui-fly', { parent });
    this.pool = [];
    for (let i = 0; i < P.pool; i++) {
      const e = el('div', 'fly-ico', { parent: this.root });
      this.pool.push({ el: e, t: -1, home: '', kind: '' });
    }
    this.flights = 0;
  }

  /** Project a world point to CSS px (null when behind the camera). */
  _screen(pos) {
    const cam = this.ctx.camera;
    if (!cam || !pos) return null;
    _v.set(pos.x ?? pos[0] ?? 0, (pos.y ?? pos[1] ?? 0) + 0.4, pos.z ?? pos[2] ?? 0);
    cam.getWorldDirection(_f); _d.copy(_v).sub(cam.position);
    if (_d.dot(_f) <= 0) return null;
    _v.project(cam);
    return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight };
  }

  /**
   * Launch one icon from a world position toward a HUD home ('fish' | 'hearts' | 'milk' …). Returns false when the
   * pool is busy, the home is not on screen or the point is off screen (the counter still updates by itself).
   */
  launch(kind, pos, home) {
    const slot = this.pool.find((s) => s.t < 0);
    const from = this._screen(pos), to = this.homeRect(home);
    if (!slot || !from || !to) return false;
    const e = slot.el;
    if (slot.kind !== kind) { slot.kind = kind; e.innerHTML = (ICON[kind] ?? ICON.fish)(); }
    e.style.left = `${from.x.toFixed(0)}px`; e.style.top = `${from.y.toFixed(0)}px`;
    setVar(e, '--dx', `${(to.x + to.w / 2 - from.x).toFixed(0)}px`);
    setVar(e, '--dy', `${(to.y + to.h / 2 - from.y).toFixed(0)}px`);
    setVar(e, '--lift', `${P.flyLift}px`);
    setVar(e, '--ms', `${P.flyMs}ms`);
    flag(e, 'is-on', false);
    pulse(e, 'is-on');
    slot.t = 0; slot.home = home;
    this.flights++;
    return true;
  }

  /**
   * @param {number} dt real seconds
   * @param {boolean} [vis] the HUD is up: while it is hidden (cutscene, dialogue, letterbox) the layer is hidden and any
   *   flight in the air lands at once, so no icon is left over the letterbox (the fish has nowhere visible to go).
   */
  render(dt, vis = true) {
    flag(this.root, 'is-dim', !vis);
    const dur = P.flyMs / 1000;
    for (const s of this.pool) {
      if (s.t < 0) continue;
      s.t += dt;
      if (s.t >= dur || !vis) { s.t = -1; flag(s.el, 'is-on', false); this.onArrive?.(s.home); }
    }
  }

  /** Flights in the air (tests / smoke). */
  get busy() { let n = 0; for (const s of this.pool) if (s.t >= 0) n++; return n; }

  dispose() { this.root.remove(); }
}
