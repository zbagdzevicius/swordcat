// src/enemies/WebPatches.js  (owner: enemies) — Bramble Spider web patches (GAME_DESIGN §10.3 spider_web: "leaves a web
// patch r 1.0 for 8 s with the same slow; one slash cuts a patch"; §12.4 Spider Hollow places 6 permanent ones).
//   ctx.enemies.webs.add(pos, { r, life })  → patch (life Infinity = level dressing until cut)
//   ctx.enemies.webs.cut(patch) / clear() / list
// While she stands in a patch (on the ground) she is slowed (status.js applySlow: ×0.5 for 2.0 s, refreshed).
// A player swing (`player:swing`) cuts the nearest patch inside its reach in front of her (one slash, one patch).
// Visual: one shared canvas texture + geometry; each patch is a flat decal mesh that fades in, then out.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { ATTACKS } from '../core/config.js';
import { wrapAngle } from '../core/math.js';
import { M2 } from './tuning.js';
import { applySlow } from './status.js';

const WEB = ATTACKS.spider_web;
let _tex = null, _geo = null;

/** Radial web texture (spokes + spiral), drawn once (browser only). */
function webTexture() {
  if (_tex || typeof document === 'undefined') return _tex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return null;
  g.clearRect(0, 0, 256, 256);
  g.translate(128, 128);
  g.strokeStyle = 'rgba(240,244,248,0.95)';
  g.lineCap = 'round';
  const spokes = 12;
  g.lineWidth = 2.2;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + (i % 2) * 0.05;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 122, Math.sin(a) * 122); g.stroke();
  }
  g.lineWidth = 1.6;
  for (let ring = 1; ring <= 9; ring++) {
    const r = ring * 12.5;
    g.beginPath();
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * Math.PI * 2, sag = 0.9 + 0.1 * Math.cos(i * 1.7 + ring);
      const x = Math.cos(a) * r * sag, y = Math.sin(a) * r * sag;
      if (i === 0) g.moveTo(x, y); else g.quadraticCurveTo(Math.cos(a - Math.PI / spokes) * r * 0.86, Math.sin(a - Math.PI / spokes) * r * 0.86, x, y);
    }
    g.stroke();
  }
  // dew glints
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 26; i++) { const a = i * 2.39996, r = 16 + (i * 37) % 100; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 2.2, 0, Math.PI * 2); g.fill(); }
  _tex = new THREE.CanvasTexture(c);
  _tex.colorSpace = THREE.SRGBColorSpace;
  _tex.anisotropy = 4;
  return _tex;
}

export class WebPatches {
  constructor(ctx) {
    this.ctx = ctx;
    /** @type {{pos: THREE.Vector3, r: number, life: number, t: number, mesh: THREE.Mesh|null, cut: boolean, fade: number}[]} */
    this.list = [];
    this._refreshT = 0;
    this._offs = [];
    this.mat = null;
  }

  init() {
    this._offs.push(this.ctx.bus.on(E.PLAYER_SWING, (p) => this.onSwing(p)));
  }

  /**
   * Add a patch at `pos` (snapped to the ground). Returns it (null when the cap evicts nothing and it's full).
   * @param {{x: number, y?: number, z: number}} pos @param {{r?: number, life?: number}} [o]
   */
  add(pos, { r = WEB.patch?.r ?? 1.0, life = WEB.patch?.life ?? 8 } = {}) {
    if (!pos) return null;
    if (this.list.length >= M2.web.maxPatches) {                // evict the oldest timed patch
      const i = this.list.findIndex((w) => Number.isFinite(w.life));
      if (i < 0) return null;
      this._remove(i);
    }
    const ph = this.ctx.physics;
    const y = typeof ph?.groundAt === 'function' && Number.isFinite(pos.y) ? ph.groundAt(pos.x, pos.z, pos.y + 0.5) : (ph?.heightAt?.(pos.x, pos.z) ?? pos.y ?? 0);
    const w = { pos: new THREE.Vector3(pos.x, y, pos.z), r, life, t: 0, mesh: null, cut: false, fade: 0, spin: (this.ctx.rng?.() ?? 0.5) * Math.PI * 2 };
    this.list.push(w);
    this._mesh(w);
    return w;
  }

  _mesh(w) {
    const tex = webTexture();
    if (!tex || !this.ctx.scene) return;
    _geo ??= new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.mat ??= new THREE.MeshBasicMaterial({ name: 'enemy-web', map: tex, transparent: true, depthWrite: false, opacity: 0.85,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
    const m = new THREE.Mesh(_geo, this.mat.clone());
    m.name = 'web-patch';
    m.material.opacity = 0;
    m.renderOrder = 2;
    m.position.set(w.pos.x, w.pos.y + 0.03, w.pos.z);
    m.rotation.y = w.spin;
    m.scale.setScalar(w.r * 1.15);
    this.ctx.scene.add(m);
    w.mesh = m;
  }

  /** Cut a patch (a slash): it shrivels away over M2.web.fade s. */
  cut(w) {
    if (!w || w.cut) return;
    w.cut = true; w.t = 0;
    this.ctx.bus.emit(E.BURST, { kind: 'sparkle', position: w.pos.clone().setY(w.pos.y + 0.2), count: 6, color: '#F0F4F8' });
  }

  /** A swing cuts the nearest patch within its reach (+ the patch radius) in front of her. */
  onSwing(p) {
    const pl = this.ctx.player, def = ATTACKS[p?.attackId];
    if (!pl?.pos || !this.list.length) return;
    const reach = (def?.arc?.range ?? 2) + M2.web.cutRange;
    let best = null, bd = Infinity;
    for (const w of this.list) {
      if (w.cut) continue;
      const dx = w.pos.x - pl.pos.x, dz = w.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d > reach + w.r) continue;
      const full = def?.arc && Math.abs(def.arc.from - def.arc.to) >= Math.PI * 1.9;
      if (!full && d > w.r && Math.abs(wrapAngle(Math.atan2(dx, dz) - pl.facing)) > M2.web.cutArc) continue;
      if (d < bd) { bd = d; best = w; }
    }
    if (best) this.cut(best);
  }

  /** Is `pos` (feet) on an uncut patch? */
  at(pos, pad = 0) {
    for (const w of this.list) {
      if (w.cut) continue;
      if (Math.abs(pos.y - w.pos.y) > 0.6) continue;
      if (Math.hypot(pos.x - w.pos.x, pos.z - w.pos.z) <= w.r + pad) return w;
    }
    return null;
  }

  update(dt) {
    if (!this.list.length) return;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i];
      w.t += dt;
      if (w.cut) { if (w.t >= M2.web.fade) this._remove(i); continue; }
      if (Number.isFinite(w.life) && w.t >= w.life) this._remove(i);
    }
    // she's slowed while she stands in a patch (refreshed a few times a second)
    const p = this.ctx.player;
    if ((this._refreshT -= dt) > 0 || !p?.pos || p.alive === false || p.scripted || !p.onGround) return;
    this._refreshT = M2.web.refresh;
    if (this.at(p.pos, (p.radius ?? 0.3) * 0.5)) applySlow(p, WEB.slow ?? 0.5, WEB.slowDur ?? 2, 'web');
  }

  render(dt) {
    for (const w of this.list) {
      const m = w.mesh;
      if (!m) continue;
      let o;
      if (w.cut) { const u = Math.min(1, w.t / M2.web.fade); o = 1 - u; m.scale.setScalar(w.r * 1.15 * (1 - 0.4 * u)); }
      else {
        const fadeIn = Math.min(1, w.t / 0.25), left = Number.isFinite(w.life) ? w.life - w.t : Infinity;
        o = Math.min(fadeIn, left < 1 ? Math.max(0, left) : 1);
      }
      m.material.opacity = 0.85 * o;
    }
  }

  _remove(i) {
    const w = this.list[i];
    this.list.splice(i, 1);
    if (w.mesh) { w.mesh.removeFromParent(); w.mesh.material.dispose(); w.mesh = null; }
  }

  clear() { for (let i = this.list.length - 1; i >= 0; i--) this._remove(i); }

  dispose() {
    this.clear();
    for (const off of this._offs) off?.();
    this._offs.length = 0;
    this.mat?.dispose(); this.mat = null;
  }
}
