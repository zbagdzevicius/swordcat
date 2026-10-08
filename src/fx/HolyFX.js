// src/fx/HolyFX.js  (owner: fx) — the holy ladder's fx side (GAME_DESIGN §17, art.md §8 + §10.2):
//   sparkles (art.md §8 shader, 160 HDR motes rising around her), the warm point light (~0.6 cd, decay 2, ~0.5 m in front
//   of her face; requests/characters.md), the aura and the blade streak, plus the bloom level for ScreenFX.
//   - Actors that render their own aura hull + blade streak (they expose `setHoly(v)`, e.g. a characters buildKitten
//     rig) get explicit levels forwarded; fx then only adds sparkles, light and bloom.
//   - Actors without `setHoly` (the M0 placeholder, NPC stand-ins) get fx's fallback: a silhouette halo (a soft gold
//     billboard pushed just behind them so their body occludes the centre) and a gold streak running up the blade.
// The player is driven automatically from her read fields: `charge` (silver sparkles build; tier 1 silver flash;
// tier 2 gold when holy-ready — Shard 1 + Valor ≥ 50 — else the gold sparkles fizzle), and `golden` (full aura).
// Explicit levels come from `fx.holy(actor, 0..1)` (cutscenes: CS-00 pulse, CS-02 shot 12, the ending).
import * as THREE from 'three';
import { PLAYER, ATTACKS } from '../core/config.js';
import { FOG_FACTOR, OUTPUT, fogUniforms } from './shaders.js';
import { MARK } from './Marks.js';
import { SHAPE, FADE, GROW } from './Particles.js';
import { actorWorldPos, resolveBlade, isActor, auraOwner } from './util.js';

const GOLD = new THREE.Color('#FFD57A'), GOLD_CORE = new THREE.Color('#FFF1C4'), SILVER = new THREE.Color('#E4EAF6');
const HALO_GOLD = new THREE.Color('#FFD98A');
export const HOLY_LIGHT = { color: '#FFD38A', intensity: 0.6, distance: 3, decay: 2, ahead: 0.5 };

/**
 * Player charge → holy visual state (pure; unit-tested). Prefers the player's own `chargeTier` / `chargeFizzled`
 * (PlayerStates decides tier 2 with `canHoly()`); falls back to the §7.2 thresholds on `charge` (0..1).
 */
export function chargeState(p) {
  if (!p) return { level: 0, gold: 0, ready: false, tier: 0 };
  const ready0 = (p.valor ?? 0) >= PLAYER.charge.holyMinValor && (p.shards ?? 0) >= (ATTACKS.holy.minShards ?? 1);
  if (p.golden) return { level: 1, gold: 1, ready: true, tier: 2 };
  const c = p.charge ?? 0;
  const hasTier = Number.isFinite(p.chargeTier);
  if (!(c > 0) && !(hasTier && p.chargeTier > 0)) return { level: 0, gold: 0, ready: ready0, tier: 0 };
  const t1 = (PLAYER.charge.tier1 - PLAYER.charge.start) / (PLAYER.charge.tier2 - PLAYER.charge.start);
  const tier = hasTier ? p.chargeTier : c >= 0.999 ? 2 : c >= t1 ? 1 : 0;
  const ready = hasTier ? tier >= 2 || (!p.chargeFizzled && ready0) : ready0;
  if (tier >= 2 && ready) return { level: 0.85, gold: 1, ready, tier: 2 };
  return { level: 0.2 + 0.45 * Math.min(1, c), gold: 0, ready, tier: Math.min(tier, 1) };
}

// ------------------------------------------------------------------ sparkles (art.md §8)
const SPARK_VERT = /* glsl */`
uniform float uTime, uPx, uRise;
attribute float aPhase, aSize;
varying float vA;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float life = fract( uTime * 0.18 * uRise + aPhase );
  p.y += life * 1.25;
  p.x += sin( uTime * 0.7 + aPhase * 6.28 ) * 0.06;
  p.z += cos( uTime * 0.6 + aPhase * 9.0 ) * 0.06;
  float tw = 0.55 + 0.45 * sin( uTime * ( 3.0 + aPhase * 5.0 ) + aPhase * 40.0 );
  vA = sin( life * 3.14159 ) * tw;
  vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
  gl_PointSize = min( 64.0, aSize * uPx / max( -mvPosition.z, 0.2 ) * ( 0.6 + 0.4 * tw ) );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const SPARK_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uI;
varying float vA;
#include <fog_pars_fragment>
${FOG_FACTOR}
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length( c );
  float core = pow( max( 1.0 - smoothstep( 0.0, 0.5, d ), 0.0 ), 3.0 );
  float star = max( 0.0, 1.0 - abs( c.x ) * 16.0 ) * ( 1.0 - smoothstep( 0.0, 0.5, abs( c.y ) ) )
             + max( 0.0, 1.0 - abs( c.y ) * 16.0 ) * ( 1.0 - smoothstep( 0.0, 0.5, abs( c.x ) ) );
  float a = ( core + star * 0.5 ) * vA * uI;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( uColor * a * 3.0 * ( 1.0 - fxFog() ), 1.0 );
  ${OUTPUT}
}`;

export class SparkleField {
  /** @param {number} count @param {() => number} rng @param {{w?: number, h?: number}} [box] */
  constructor(count, rng, { w = 1.6, h = 1.2 } = {}) {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), ph = new Float32Array(count), sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // denser near the body (ref1: the motes cling to her outline)
      const a = rng() * Math.PI * 2, r = (0.18 + 0.82 * Math.sqrt(rng())) * w * 0.5;
      pos[i * 3] = Math.sin(a) * r; pos[i * 3 + 1] = rng() * h; pos[i * 3 + 2] = Math.cos(a) * r;
      ph[i] = rng(); sz[i] = 0.6 + rng();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    this.material = new THREE.ShaderMaterial({
      name: 'fx.holy.sparkles', vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, fog: true,
      uniforms: { ...fogUniforms(), uTime: { value: 0 }, uI: { value: 0 }, uColor: { value: new THREE.Color('#FFF1C4') }, uPx: { value: 36 }, uRise: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.name = 'fx.holy.sparkles';
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
    this.points.visible = false;
    this.geometry = g;
    this.actor = null;
  }
  dispose() { this.points.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}

// ------------------------------------------------------------------ gold arcs: holy crescent, ground rings, sunburst
const ARC_VERT = /* glsl */`
attribute vec2 aArc;          // x = 0..1 along the arc, y = 0 inner .. 1 outer
uniform float uR, uThick, uTheta0, uSweep;
varying vec2 vArc;
#include <fog_pars_vertex>
void main() {
  vArc = aArc;
  float th = uTheta0 + uSweep * aArc.x;
  float r = max( uR - uThick * ( 1.0 - aArc.y ), 0.0 );
  vec3 p = vec3( sin( th ) * r, 0.0, cos( th ) * r );
  vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const ARC_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uI, uRing;
varying vec2 vArc;
#include <fog_pars_fragment>
${FOG_FACTOR}
void main() {
  float along = uRing > 0.5 ? 1.0 : smoothstep( 0.0, 0.85, vArc.x ) * ( 1.0 - smoothstep( 0.97, 1.0, vArc.x ) );
  float across = uRing > 0.5 ? sin( clamp( vArc.y, 0.0, 1.0 ) * 3.14159 ) : pow( clamp( vArc.y, 0.0, 1.0 ), 1.6 ) * ( 1.0 - smoothstep( 0.9, 1.0, vArc.y ) );
  float a = along * across * uI;
  if ( a < 0.003 ) discard;
  vec3 col = mix( uColor, vec3( 1.0, 0.98, 0.9 ), across * along * 0.5 );
  gl_FragColor = vec4( col * a * ( 1.0 - fxFog() ), 1.0 );
  ${OUTPUT}
}`;

let _arcGeo = null;
function arcGeometry() {
  if (_arcGeo) return _arcGeo;
  const SEG = 64, g = new THREE.BufferGeometry(), arc = new Float32Array((SEG + 1) * 2 * 2), pos = new Float32Array((SEG + 1) * 2 * 3);
  const idx = [];
  for (let i = 0; i <= SEG; i++) {
    arc.set([i / SEG, 0, i / SEG, 1], i * 4);
    if (i < SEG) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aArc', new THREE.BufferAttribute(arc, 2));
  g.setIndex(idx);
  _arcGeo = g;
  return g;
}

class GoldArc {
  constructor() {
    this.material = new THREE.ShaderMaterial({
      name: 'fx.holy.arc', vertexShader: ARC_VERT, fragmentShader: ARC_FRAG, fog: true,
      uniforms: { ...fogUniforms(), uR: { value: 1 }, uThick: { value: 0.3 }, uTheta0: { value: 0 }, uSweep: { value: Math.PI },
        uColor: { value: new THREE.Color('#FFD34D') }, uI: { value: 0 }, uRing: { value: 0 } },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(arcGeometry(), this.material);
    this.mesh.name = 'fx.holy.arc';
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 7; this.mesh.visible = false;
    this.o = null; this.t = 0;
  }
}

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _h = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3();
const _c = new THREE.Color();

class HolyState {
  constructor() { this.explicit = 0; this.level = 0; this.gold = 0; this.field = null; this.t = 0; this.streakT = 0; this.forwarded = -1; }
}

export class HolyFX {
  /**
   * @param {any} ctx @param {{ particles: import('./Particles.js').Particles, marks: import('./Marks.js').Marks, screen: import('./ScreenFX.js').ScreenFX, rng: () => number }} o
   */
  constructor(ctx, { particles, marks, screen, rng }) {
    this.ctx = ctx; this.particles = particles; this.marks = marks; this.screen = screen; this.rng = rng;
    /** @type {Map<any, HolyState>} */
    this.states = new Map();
    this.fields = []; this.arcs = [];
    this.light = null;
    this.bloomLevel = 0;
    this.fizzles = 0; this.flashes = 0; this.casts = 0;   // counts (tests/smoke)
  }

  init(scene) {
    const q = this.ctx.quality ?? {};
    const count = (q.particles ?? 2000) < 1000 ? 80 : 160;
    for (let i = 0; i < 3; i++) { const f = new SparkleField(count, this.rng); this.fields.push(f); scene.add(f.points); }
    for (let i = 0; i < 8; i++) { const a = new GoldArc(); this.arcs.push(a); scene.add(a.mesh); }
    // one persistent point light (intensity 0 when idle): adding / removing lights at runtime recompiles every material
    this.light = new THREE.PointLight(HOLY_LIGHT.color, 0, HOLY_LIGHT.distance, HOLY_LIGHT.decay);
    this.light.name = 'fx.holy.light';
    this.light.castShadow = false;
    scene.add(this.light);
  }

  /** Explicit level for an actor (0 removes it). Forwards to `actor.setHoly(v)` when the actor renders its own aura. */
  set(actor, level) {
    if (!isActor(actor)) return;
    const v = Math.max(0, Math.min(1, +level || 0));
    const own = auraOwner(actor);
    let s = this.states.get(actor);
    if (!s) { if (v <= 0) return; s = new HolyState(); this.states.set(actor, s); }
    s.explicit = v;
    if (own && s.forwarded !== v) { own.setHoly(v); s.forwarded = v; }
  }

  level(actor) { return this.states.get(actor)?.level ?? 0; }

  /** Holy Slash cast (PLAYER_HOLY): gold crescent (full turn), ground ring, sparkle burst. */
  cast(pos, dir) {
    this.casts++;
    const r = ATTACKS.holy.arc?.range ?? 3.6;
    const y = pos.y;
    const yaw = dir ? Math.atan2(dir.x, dir.z) : 0;
    // the gold crescent follows the blade's full turn at chest height; the ground ring decal races out to the reach
    this.arc({ x: pos.x, y: y + 0.75, z: pos.z, theta0: yaw + 1.2, sweep: -Math.PI * 2, r0: 1.1, r1: r * 0.9, thick: 0.32, life: 0.3, grow: 0.16, intensity: 1.15 });
    this.arc({ x: pos.x, y: y + 0.06, z: pos.z, ring: true, r0: 0.4, r1: r + 0.4, thick: 0.28, life: 0.45, grow: 0.45, intensity: 0.95 });
    _p.set(pos.x, y + 0.9, pos.z);
    this.particles.burst(_p, { additive: true, n: 24, shape: SHAPE.STAR4, color: '#FFE3A3', intensity: 2.2, size: [0.16, 0.3], sizeEnd: 0.2,
      life: [0.5, 0.9], speed: [2.5, 5.0], spread: Math.PI, gravity: -0.5, drag: 2.2, fade: FADE.TWINKLE, jitter: 0.3 });
  }

  /** Sunburst (end of Golden Hour, `ATTACKS.sunburst` r 6). */
  sunburst(pos) {
    const r = ATTACKS.sunburst?.arc?.range ?? 6;
    this.arc({ x: pos.x, y: pos.y + 0.08, z: pos.z, ring: true, r0: 0.5, r1: r, thick: 0.45, life: 0.6, grow: 0.5, intensity: 1.4 });
    this.arc({ x: pos.x, y: pos.y + 0.8, z: pos.z, theta0: 0, sweep: Math.PI * 2, r0: 1, r1: r * 0.85, thick: 0.4, life: 0.45, grow: 0.3, intensity: 1.3 });
    _p.set(pos.x, pos.y + 1.0, pos.z);
    this.particles.burst(_p, { additive: true, n: 40, shape: SHAPE.STAR4, color: '#FFE3A3', intensity: 2.6, size: [0.18, 0.32], sizeEnd: 0.2,
      life: [0.6, 1.0], speed: [3, 7], spread: Math.PI, gravity: -0.3, drag: 2, fade: FADE.TWINKLE, jitter: 0.4 });
  }

  /** Golden Hour activation burst (§7.5). */
  goldenOn(pos) {
    this.arc({ x: pos.x, y: pos.y + 0.06, z: pos.z, ring: true, r0: 0.3, r1: PLAYER.golden.staggerRadius ?? 8, thick: 0.4, life: 0.8, grow: 0.7, intensity: 1.4 });
    _p.set(pos.x, pos.y + 0.8, pos.z);
    this.particles.burst(_p, { additive: true, n: 36, shape: SHAPE.STAR4, color: '#FFF1C4', intensity: 2.8, size: [0.18, 0.3], sizeEnd: 0.3,
      life: [0.8, 1.3], speed: [1.5, 4], spread: Math.PI, gravity: -1.2, drag: 1.5, fade: FADE.TWINKLE, jitter: 0.3 });
  }

  /**
   * Start a flat arc / ground ring (pooled; gold unless `o.color`): { x, y, z, ring?, theta0?, sweep?, r0, r1, thick, life,
   * grow, intensity, color? }. When every arc is busy the oldest is recycled.
   */
  arc(o) {
    let a = this.arcs.find((x) => !x.mesh.visible);
    if (!a) a = this.arcs.reduce((m, x) => (x.t / Math.max(0.01, x.o?.life ?? 1) > m.t / Math.max(0.01, m.o?.life ?? 1) ? x : m));
    a.o = o; a.t = 0;
    a.mesh.position.set(o.x, o.y, o.z);
    const u = a.material.uniforms;
    u.uColor.value.set(o.color ?? '#FFD34D');
    u.uRing.value = o.ring ? 1 : 0; u.uSweep.value = o.ring ? Math.PI * 2 : (o.sweep ?? Math.PI); u.uTheta0.value = o.theta0 ?? 0;
    u.uThick.value = o.thick ?? 0.3; u.uR.value = o.r0 ?? 1; u.uI.value = 0;
    a.mesh.visible = true;
  }

  clear() {
    for (const [actor, s] of this.states) { if (s.field) { s.field.actor = null; s.field.points.visible = false; } if (s.forwarded > 0) auraOwner(actor)?.setHoly(0); }
    this.states.clear();
    for (const a of this.arcs) a.mesh.visible = false;
    if (this.light) this.light.intensity = 0;
    this.bloomLevel = 0;
  }

  /** Per frame. `dt` = visual dt, `realDt` = real frame dt. */
  render(dt, realDt) {
    const ctx = this.ctx, player = ctx.player, time = ctx.game?.realTime ?? 0;
    // ---- player auto level (charge / Golden Hour)
    let autoLevel = 0, autoGold = 0;
    if (isActor(player) && player.alive !== false) {
      const cs = chargeState(player);
      autoLevel = cs.level; autoGold = cs.gold;
      if (autoLevel > 0 && !this.states.has(player)) this.states.set(player, new HolyState());
    }
    let best = null, bestL = 0, bloom = 0;
    for (const actor of this.states.keys()) {
      const s = this.states.get(actor);
      const isP = actor === player;
      const tgt = Math.max(s.explicit, isP ? autoLevel : 0);
      const tgtGold = s.explicit > 0 ? 1 : (isP ? autoGold : 0);
      s.level += (tgt - s.level) * (1 - Math.exp(-(tgt > s.level ? 14 : 6) * (realDt || 0.016)));
      s.gold += (tgtGold - s.gold) * (1 - Math.exp(-8 * (realDt || 0.016)));
      const gone = actor.alive === false || !actor.object3d?.parent;
      if ((s.level < 0.003 && tgt === 0) || gone) {
        if (s.field) { s.field.actor = null; s.field.points.visible = false; s.field = null; }
        if (s.forwarded > 0 && gone) auraOwner(actor)?.setHoly(0);
        if (tgt === 0 || gone) { this.states.delete(actor); continue; }
      }
      s.t += dt;
      this._sparkles(actor, s, time);
      const own = !!auraOwner(actor);
      if (!own) { this._halo(actor, s); this._streak(actor, s, dt); }
      const L = s.level * s.gold;
      if (L > bestL) { bestL = L; best = actor; }
      bloom = Math.max(bloom, L);
    }
    // ---- light (strongest gold actor)
    if (this.light) {
      if (best) {
        actorWorldPos(best, _p);
        const h = (best.height ?? 1) * (best.object3d?.scale?.y ?? 1);
        _d.subVectors(ctx.camera.position, _p); _d.y = 0;
        const l = _d.length();
        if (l > 1e-3) _d.multiplyScalar(1 / l); else _d.set(Math.sin(best.facing ?? 0), 0, Math.cos(best.facing ?? 0));
        this.light.position.set(_p.x + _d.x * HOLY_LIGHT.ahead, _p.y + h * 0.78, _p.z + _d.z * HOLY_LIGHT.ahead);
        this.light.intensity = HOLY_LIGHT.intensity * bestL * (0.92 + 0.08 * Math.sin(time * 9));
      } else this.light.intensity = 0;
    }
    this.bloomLevel = bloom;
    // ---- arcs
    for (const a of this.arcs) {
      if (!a.mesh.visible) continue;
      const o = a.o;
      a.t += dt;
      const u = a.t / o.life;
      if (u >= 1) { a.mesh.visible = false; continue; }
      const g = Math.min(1, a.t / Math.max(0.01, o.grow ?? o.life));
      const e = 1 - (1 - g) * (1 - g) * (1 - g);
      const un = a.material.uniforms;
      un.uR.value = o.r0 + (o.r1 - o.r0) * e;
      un.uI.value = (o.intensity ?? 2) * (u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9);
      if (!o.ring) un.uSweep.value = (o.sweep ?? Math.PI) * Math.min(1, a.t / Math.max(0.01, o.grow ?? 0.16));
    }
  }

  _sparkles(actor, s, time) {
    if (!s.field) {
      const f = this.fields.find((x) => !x.actor);
      if (!f) return;
      f.actor = actor; s.field = f;
    }
    const f = s.field, u = f.material.uniforms;
    actorWorldPos(actor, f.points.position);
    const sc = Math.max(0.6, (actor.height ?? 1) * (actor.object3d?.scale?.y ?? 1));
    f.points.scale.setScalar(sc);
    f.points.visible = s.level > 0.004;
    u.uTime.value = time;
    u.uI.value = s.level;
    u.uRise.value = 0.8 + 0.6 * s.gold;
    _c.copy(SILVER).lerp(s.gold > 0.5 ? GOLD_CORE : GOLD, s.gold);
    u.uColor.value.copy(_c);
    const r = this.ctx.renderer;
    u.uPx.value = 36 * (r ? Math.max(0.5, r.getContext().drawingBufferHeight / 1080) : 1) * 1.6;
  }

  /** Fallback aura: a soft gold silhouette halo behind the actor (bloom does the rest). */
  _halo(actor, s) {
    const L = s.level * (0.25 + 0.75 * s.gold);
    if (L < 0.01) return;
    actorWorldPos(actor, _p);
    const h = (actor.height ?? 1) * (actor.object3d?.scale?.y ?? 1);
    _p.y += h * 0.55;
    _d.subVectors(_p, this.ctx.camera.position); _d.y = 0;
    const l = _d.length();
    if (l > 1e-3) _p.addScaledVector(_d, 0.38 / l);
    _c.copy(SILVER).lerp(HALO_GOLD, s.gold);
    this.marks.push(_p.x, _p.y, _p.z, h * 1.45, MARK.HALO, _c, 1.3 + 1.2 * L, Math.min(1, L * 1.1), 0, 0, 1.3);
  }

  /** Fallback blade streak: a gold spark runs hilt → tip every ~1.1 s while gold (art.md §4.3; CS-02 shot 12). */
  _streak(actor, s, dt) {
    const L = s.level * s.gold;
    if (L < 0.08) { s.streakT = 0; return; }
    if (!resolveBlade(actor, _h, _t)) return;
    s.streakT += dt;
    const period = 1.1, run = 0.5, u = (s.streakT % period) / run;
    if (u <= 1) {
      const e = u * u * (3 - 2 * u);
      _q.copy(_h).lerp(_t, e);
      this.marks.push(_q.x, _q.y, _q.z, 0.22 + 0.1 * L, MARK.STAR4, GOLD_CORE, 3.5 * L + 1, Math.min(1, L * 2), e * 2);
      for (let k = 1; k <= 2; k++) {
        const e2 = Math.max(0, e - k * 0.07);
        _q.copy(_h).lerp(_t, e2);
        this.marks.push(_q.x, _q.y, _q.z, 0.14, MARK.SOFT, GOLD, 2.2 * L, Math.min(1, L * 1.5) * (1 - k * 0.3));
      }
    } else if (u < 1.6) {
      const k = Math.sin(((u - 1) / 0.6) * Math.PI);
      this.marks.push(_t.x, _t.y, _t.z, 0.4 * k + 0.05, MARK.STAR4, GOLD_CORE, 3 * L + 1, Math.min(1, L * 2) * k, u);
    }
  }

  /**
   * player:charge {level, fizzle, holy}: tier flashes at the blade tip — silver at tier 1 (Bright Slash ready), a gold
   * 8-point star at tier 2 (Holy ready), or the §7.2 fizzle (the gold sparkles visibly fizzle) when Holy is not ready.
   */
  chargeEvent(p, e) {
    if (!isActor(p) || !e) return;
    const lvl = e.level ?? 0;
    if (!(lvl > 0)) return;
    const at = resolveBlade(p, _h, _t) ? _t : actorWorldPos(p, _t).setY(_t.y + 0.8);
    if (e.fizzle) {
      this.fizzles++;
      this.particles.burst(at, { additive: true, n: 16, shape: SHAPE.SPARK, color: '#E8B04A', intensity: 1.4, size: [0.05, 0.08], sizeEnd: 0.2,
        life: [0.35, 0.6], speed: [0.8, 2.0], spread: 1.2, dir: _q.set(0, 1, 0), gravity: 9, drag: 1.5, stretch: 3, fade: FADE.TWINKLE });
      this.particles.burst(at, { n: 3, shape: SHAPE.PUFF, color: '#9C968A', alpha: 0.5, size: [0.08, 0.12], sizeEnd: 2.2, grow: GROW.OUT,
        life: [0.4, 0.6], speed: [0.2, 0.5], up: 0.6, drag: 2 });
    } else if (lvl >= 1 || e.holy) {
      this.flashes++;
      this.particles.single(at, { shape: SHAPE.STAR8, color: '#FFD34D', intensity: 3, size0: 0.2, size1: 1.1, life: 0.32, grow: GROW.OUT, fade: FADE.POP, spin: 2 });
      this.particles.burst(at, { additive: true, n: 18, shape: SHAPE.STAR4, color: '#FFE3A3', intensity: 2.8, size: [0.14, 0.26], sizeEnd: 0.3,
        life: [0.4, 0.7], speed: [1.5, 3.2], spread: Math.PI, drag: 2.5, fade: FADE.TWINKLE });
    } else {
      this.flashes++;
      this.particles.single(at, { shape: SHAPE.STAR4, color: '#EEF3FF', intensity: 2.6, size0: 0.15, size1: 0.7, life: 0.22, grow: GROW.OUT, fade: FADE.POP });
      this.particles.burst(at, { additive: true, n: 10, shape: SHAPE.STAR4, color: '#EEF3FF', intensity: 2.6,
        size: [0.14, 0.24], sizeEnd: 0.3, life: [0.3, 0.45], speed: [1.0, 2.4], spread: Math.PI, drag: 3, fade: FADE.POP });
    }
  }

  dispose() {
    this.clear();
    for (const f of this.fields) f.dispose();
    for (const a of this.arcs) { a.mesh.removeFromParent(); a.material.dispose(); }
    this.light?.removeFromParent(); this.light?.dispose?.();
    this.fields.length = 0; this.arcs.length = 0;
  }
}
