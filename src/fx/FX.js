// src/fx/FX.js  (owner: fx) — M0 STUB satisfying the ctx.fx contract (§19.3):
//   burst(kind, pos, opts);  telegraph(desc) → id (also via combat:telegraph);  holy(actor, 0..1);
//   mistRing(center, r) → handle { dispose() };  horde(on, anchor)
// Visuals only. The stub draws a tiny pooled puff for bursts / kills so hits are visible during M0.
import * as THREE from 'three';
import { E } from '../core/events.js';

const POOL = 24;

export class FX {
  constructor(ctx) {
    this.ctx = ctx;
    this._teleId = 1000000;      // ids for telegraphs started directly through ctx.fx (enemies use their own)
    this.holyLevels = new Map();
    this.puffs = [];
    this._next = 0;
    this._offs = [];
  }

  async init() {
    const { bus, scene } = this.ctx;
    const geo = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < POOL; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false; m.userData.t = 0; m.userData.life = 0.35;
      scene.add(m);
      this.puffs.push(m);
    }
    this._geo = geo;
    this._offs.push(
      bus.on(E.BURST, (p) => this.burst(p.kind, p.position, p)),
      bus.on(E.HIT, (h) => { if (!h.blocked && h.position) this.burst(h.killed ? 'poof' : 'hit', h.position, { scale: h.killed ? 0.7 : 0.3 }); }),
    );
  }

  /** Spawn a one-shot effect (`kind`: 'hit' | 'poof' | 'sparkle' | ...). */
  burst(kind, pos, opts = {}) {
    if (!pos || !this.puffs.length) return;
    const m = this.puffs[this._next++ % this.puffs.length];
    m.position.set(pos.x ?? pos[0] ?? 0, (pos.y ?? pos[1] ?? 0) + (kind === 'poof' ? 0.4 : 0.6), pos.z ?? pos[2] ?? 0);
    m.userData.t = 0; m.userData.scale = opts.scale ?? (kind === 'poof' ? 0.7 : 0.3);
    m.material.color.set(kind === 'poof' ? 0xffffff : kind === 'sparkle' ? 0xffe3a3 : 0xfff6dd);
    m.visible = true;
  }

  /** Draw a telegraph from a §19.5 descriptor; returns its id. */
  telegraph(desc = {}) { return desc.id ?? this._teleId++; }

  /** Holy glow level 0..1 on an actor (aura hull, sparkles, light in the real fx). */
  holy(actor, level) { this.holyLevels.set(actor, Math.max(0, Math.min(1, level))); }

  /** Mist-card ring (arena fog wall); returns a handle with dispose(). */
  mistRing(center, r) { return { center, r, dispose() {} }; }

  /** Horde silhouettes on/off around an anchor (CS-02, CS-08). */
  horde(on, anchor) { this.hordeOn = !!on; this.hordeAnchor = anchor ?? null; }

  update(dt) {}

  render(alpha, dt) {
    for (const m of this.puffs) {
      if (!m.visible) continue;
      m.userData.t += dt;
      const u = m.userData.t / m.userData.life;
      if (u >= 1) { m.visible = false; continue; }
      m.scale.setScalar(m.userData.scale * (0.4 + u * 1.0));
      m.material.opacity = 0.85 * (1 - u);
    }
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    for (const m of this.puffs) { m.removeFromParent(); m.material.dispose(); }
    this.puffs.length = 0;
    this._geo?.dispose();
  }
}
