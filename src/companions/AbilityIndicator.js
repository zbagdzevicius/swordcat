// src/companions/AbilityIndicator.js  (owner: companions) — the ground indicator while a kitten ability is aimed
// (CONTROLS_SPEC §7.5): Mochi's Shield Wall 3.0 × 0.4 m rect, Sage's 14 m range ring + pips under the chosen targets,
// Clover's soft green ring. It draws from CompanionManager.aim (the same data fx's GroundDecals reads); once fx draws
// ability indicators itself (`ctx.fx.drawsAbilityAim === true`, requests/companions.md) this one stays hidden.
// Visual only: built lazily on the first aim, updated in render(), 1 draw per visible part, no per-frame allocation.
import * as THREE from 'three';
import { groundY } from './steering.js';

/** Colours and sizes (§7.3 indicator family: rims ≥ 0.06 m; lifted above the ground, under the actors). */
export const IND = Object.freeze({
  wall: { color: '#EEF3FF', fill: 0.22, rim: 0.85, rimW: 0.07 },
  bad: { color: '#9AA0A8', fill: 0.12, rim: 0.45 },
  range: { color: '#FFE9A8', fill: 0.0, rim: 0.55, rimW: 0.09 },
  pip: { color: '#FFD34D', fill: 0.18, rim: 0.95, rimW: 0.07, r: 0.55 },
  purr: { color: '#8EE6A0', fill: 0.12, rim: 0.7, rimW: 0.08 },
  lift: 0.08, order: 7, maxPips: 3,
});

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// uShape 0 = rounded rect (uSize = metres), 1 = ring / disc (uSize.x = radius in metres)
const FRAG = /* glsl */`
uniform vec3 uColor; uniform vec2 uSize; uniform float uShape; uniform float uFill; uniform float uRim; uniform float uRimW;
uniform float uPulse;
varying vec2 vUv;
void main() {
  float e;
  float inside;
  if (uShape < 0.5) {
    vec2 d = min(vUv, 1.0 - vUv) * uSize;
    e = min(d.x, d.y);
    inside = 1.0;
  } else {
    float r = length(vUv - 0.5) * 2.0 * uSize.x;
    e = uSize.x - r;
    inside = step(0.0, e);
  }
  float aa = fwidth(e) * 1.2 + 1e-4;
  float rim = (1.0 - smoothstep(uRimW - aa, uRimW + aa, e)) * smoothstep(-aa, aa, e);
  float fill = uFill * inside * smoothstep(-aa, aa, e) * (0.75 + 0.25 * uPulse);
  float a = max(rim * uRim, fill);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}`;

function decal(name, shape) {
  const m = new THREE.ShaderMaterial({
    name: 'companionIndicator', vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { uColor: { value: new THREE.Color() }, uSize: { value: new THREE.Vector2(1, 1) }, uShape: { value: shape },
      uFill: { value: 0.2 }, uRim: { value: 0.8 }, uRimW: { value: 0.07 }, uPulse: { value: 0 } },
    // depth-tested (she and the rats stand on it, not behind it) but never z-fighting the ground: lifted, offset
    transparent: true, depthTest: true, depthWrite: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, m);
  mesh.name = name; mesh.renderOrder = IND.order; mesh.frustumCulled = false; mesh.visible = false;
  mesh.castShadow = false; mesh.receiveShadow = false;
  return mesh;
}

function style(mesh, s, size, extra = {}) {
  const u = mesh.material.uniforms;
  u.uColor.value.set(s.color); u.uFill.value = s.fill; u.uRim.value = s.rim; u.uRimW.value = s.rimW ?? 0.07;
  if (size) u.uSize.value.copy(size);
  if (extra.pulse != null) u.uPulse.value = extra.pulse;
}

const _size = new THREE.Vector2();

export class AbilityIndicator {
  /** @param {any} ctx @param {{aim: any}} mgr CompanionManager (reads mgr.aim) */
  constructor(ctx, mgr) {
    this.ctx = ctx; this.mgr = mgr;
    this.root = null; this.t = 0;
    /** what is drawn now ('rect' | 'targets' | 'self' | null): smoke tests read it */
    this.showing = null;
  }

  _build() {
    this.root = new THREE.Group(); this.root.name = 'companionAbilityIndicator';
    this.rect = decal('abilityRect', 0);
    this.ring = decal('abilityRing', 1);
    this.pips = [];
    for (let i = 0; i < IND.maxPips; i++) { const p = decal('abilityPip' + i, 1); this.pips.push(p); this.root.add(p); }
    this.root.add(this.rect, this.ring);
    this.ctx.scene?.add(this.root);
  }

  /** fx took over the ability indicator (its GroundDecals pool reads the same `companions.aim`). */
  get delegated() { return this.ctx.fx?.drawsAbilityAim === true; }

  render(dt = 0) {
    const a = this.mgr.aim, pl = a?.plan;
    const on = !!(a?.active && pl?.shape) && !this.delegated && this.ctx.game?.mode === 'play';
    if (!on) {
      if (this.root?.visible) this.root.visible = false;
      this.showing = null;
      return;
    }
    if (!this.root) this._build();
    if (this.root.parent !== this.ctx.scene) this.ctx.scene?.add(this.root);
    this.root.visible = true;
    this.t += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    const ok = pl.valid;
    this.rect.visible = false; this.ring.visible = false;
    for (const p of this.pips) p.visible = false;
    const ctx = this.ctx;
    if (pl.shape === 'rect') {
      const y = groundY(ctx, pl.center.x, pl.center.z, pl.center.y) + IND.lift;
      this.rect.position.set(pl.center.x, y, pl.center.z);
      this.rect.rotation.set(0, pl.yaw, 0);
      this.rect.scale.set(pl.width, 1, pl.length);
      style(this.rect, ok ? IND.wall : IND.bad, _size.set(pl.width, pl.length), { pulse });
      this.rect.visible = true;
    } else if (pl.shape === 'targets') {
      const R = pl.range;
      this.ring.position.set(pl.origin.x, pl.origin.y + IND.lift, pl.origin.z);
      this.ring.rotation.set(0, 0, 0);
      this.ring.scale.set(R * 2, 1, R * 2);
      style(this.ring, ok ? IND.range : IND.bad, _size.set(R, R), { pulse });
      this.ring.visible = true;
      for (let i = 0; i < this.pips.length && i < pl.targets.length; i++) {
        const e = pl.targets[i], p = this.pips[i];
        if (!e?.pos) continue;
        const r = Math.max(IND.pip.r, (e.radius ?? 0.35) * 1.3 + 0.15);
        p.position.set(e.pos.x, groundY(ctx, e.pos.x, e.pos.z, e.pos.y) + IND.lift, e.pos.z);
        p.scale.set(r * 2, 1, r * 2);
        style(p, IND.pip, _size.set(r, r), { pulse });
        p.visible = true;
      }
    } else if (pl.shape === 'self') {
      const p = ctx.player?.pos ?? pl.center;
      const R = pl.radius * (0.92 + 0.08 * pulse);
      this.ring.position.set(p.x, p.y + IND.lift, p.z);
      this.ring.scale.set(R * 2, 1, R * 2);
      style(this.ring, ok ? IND.purr : IND.bad, _size.set(R, R), { pulse });
      this.ring.visible = true;
    }
    this.showing = pl.shape;
  }

  dispose() {
    if (!this.root) return;
    this.root.removeFromParent();
    for (const m of [this.rect, this.ring, ...this.pips]) { m.geometry.dispose(); m.material.dispose(); }
    this.root = null; this.showing = null;
  }
}
