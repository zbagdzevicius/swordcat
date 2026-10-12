// src/fx/SwordTrail.js  (owner: fx) — tech.md §11.3: a ring buffer of (hilt, tip) world samples, one per rendered frame
// while swinging, built into a pre-allocated triangle strip (Catmull-Rom subdivided so fast arcs stay round), additive,
// depthWrite off, alpha fading with age. Gold for holy / Golden Hour, white-blue for normal swings, and the colour of the
// equipped skin otherwise (GAME_DESIGN §13.4: "the trail colour changes").
import * as THREE from 'three';
import { FOG_FACTOR, OUTPUT, fogUniforms, fxShaderMaterial } from './shaders.js';
import { resolveBlade, actorWorldPos } from './util.js';
import { easeSwing } from '../core/math.js';

/** Trail colour per sword skin (§13.4). */
export const TRAIL_COLORS = Object.freeze({
  borrowed: '#CFE3FF', twig: '#CDEB9C', fishbone: '#BDEFFF', baguette: '#FFD9A0', diamond: '#8FEAFF', toobig: '#E6ECF6', dawnblade: '#FFD34D',
});
const HOLY = '#FFD34D';

/**
 * Trail style for an attack (pure; unit-tested).
 * @param {string} attackId @param {string} [skin] @param {boolean} [golden]
 * @returns {{color: string, intensity: number, life: number}}
 */
export function trailStyle(attackId, skin = 'borrowed', golden = false) {
  if (attackId === 'holy' || attackId === 'sunburst' || attackId === 'holyWave') return { color: HOLY, intensity: 1.8, life: 0.3 };
  if (golden) return { color: HOLY, intensity: 1.4, life: 0.22 };
  if (attackId === 'bright') return { color: '#F6F9FF', intensity: 1.5, life: 0.24 };
  if (attackId === 'riposte') return { color: '#FFE9A8', intensity: 1.4, life: 0.2 };
  const c = TRAIL_COLORS[skin] ?? TRAIL_COLORS.borrowed;
  return { color: c, intensity: skin === 'dawnblade' ? 1.4 : 0.95, life: attackId === 'slash3' || attackId === 'pounce' ? 0.2 : 0.17 };
}

/** Sampling window of a swing in swing time (s): [from, to]. Pure. */
export function trailWindow(def) {
  if (!def) return [0, 0];
  if (Array.isArray(def.active)) return [Math.max(0, def.active[0] - 0.06), def.active[1] + 0.05];
  if (def.hang != null) return [def.hang, Infinity];                  // pounce: the dive, until landing
  return [0, def.dur ?? 0.4];
}

const CAP = 40;          // samples
const HILT_INSET = 0.3;  // the ribbon's inner edge, as a fraction of the way from the blade's hilt point to its tip
const SUB = 4;           // Catmull-Rom subdivisions per sample gap
const MAXV = (CAP - 1) * SUB + 1 + CAP * 2;   // + invisible bridge vertices between swings

const VERT = /* glsl */`
attribute vec2 aT;       // x = freshness (1 newest → 0 oldest), y = 0 hilt … 1 tip
varying vec2 vT;
#include <fog_pars_vertex>
void main() {
  vT = aT;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uIntensity, uAlpha;
varying vec2 vT;
#include <fog_pars_fragment>
${FOG_FACTOR}
void main() {
  float a = clamp( vT.x, 0.0, 1.0 ), v = clamp( vT.y, 0.0, 1.0 );
  // a crisp white-hot rim along the tip's path over a translucent body that feathers out toward the hilt;
  // old samples fade quadratically (the rim stays a little longer than the body)
  float body = smoothstep( 0.1, 0.95, v ) * 0.24;
  float rim = smoothstep( 0.7, 1.0, v );
  float k = ( body * a * a + rim * ( 0.45 + 0.75 * a ) * a ) * uAlpha;
  if ( k < 0.003 ) discard;
  vec3 col = mix( uColor, vec3( 1.0 ), rim * a * 0.7 ) * uIntensity * ( 1.0 + 0.8 * rim * a );
  gl_FragColor = vec4( col * k * ( 1.0 - fxFog() ), 1.0 );
  ${OUTPUT}
}`;

const _h = new THREE.Vector3(), _t = new THREE.Vector3(), _c = new THREE.Vector3();

export class SwordTrail {
  constructor() {
    this.h = new Float32Array(CAP * 3); this.tp = new Float32Array(CAP * 3); this.age = new Float32Array(CAP);
    this.brk = new Uint8Array(CAP);  // 1 = this sample starts a new ribbon (not connected to the previous one)
    this.n = 0;                  // samples in the buffer (oldest first)
    this._w0 = 0; this._w1 = 0; this._newRibbon = true;
    this.life = 0.18;
    this.style = trailStyle('slash1');
    this.color = new THREE.Color(this.style.color);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAXV * 2 * 3); this.at = new Float32Array(MAXV * 2 * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aT', new THREE.BufferAttribute(this.at, 2).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint16Array((MAXV - 1) * 6);
    for (let i = 0; i < MAXV - 1; i++) { const a = i * 2; idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6); }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.material = fxShaderMaterial({
      name: 'fx.swordTrail', vertexShader: VERT, fragmentShader: FRAG, fog: true,
      uniforms: { ...fogUniforms(), uColor: { value: this.color }, uIntensity: { value: 1.4 }, uAlpha: { value: 1 } },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'fx.swordTrail';
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.renderOrder = 7; this.mesh.visible = false;
    this._swing = null;
    this.samples = 0;            // total samples taken (tests/smoke)
  }

  /** Set the style for the current swing. */
  setStyle(style) {
    this.style = style; this.life = style.life;
    this.color.set(style.color);
    this.material.uniforms.uIntensity.value = style.intensity;
  }

  /** Append a (hilt, tip) sample. */
  push(h, t) {
    if (this.n >= CAP) this._drop(1);           // drop the oldest
    const i = this.n++;
    this.h[i * 3] = h.x; this.h[i * 3 + 1] = h.y; this.h[i * 3 + 2] = h.z;
    this.tp[i * 3] = t.x; this.tp[i * 3 + 1] = t.y; this.tp[i * 3 + 2] = t.z;
    this.age[i] = 0;
    this.brk[i] = this._newRibbon ? 1 : 0;
    this._newRibbon = false;
    this.samples++;
  }

  _drop(k) {
    const n = this.n;
    this.h.copyWithin(0, k * 3, n * 3); this.tp.copyWithin(0, k * 3, n * 3);
    this.age.copyWithin(0, k, n); this.brk.copyWithin(0, k, n);
    this.n = n - k;
    if (this.n > 0) this.brk[0] = 1;
  }

  clear() { this.n = 0; this.geometry.setDrawRange(0, 0); this.mesh.visible = false; this._swing = null; this._newRibbon = true; }

  /**
   * Per frame for an actor: sample while its swing is in the trail window, age the samples, rebuild the strip.
   * `o.widthMul`: the ribbon is widened about its centre line (×1.3 in the iso camera, CONTROLS_SPEC §12 fx 4: seen
   * from 13 m above, the stock ribbon reads as a thread).
   * @param {any} actor @param {number} dt visual dt (0 while hitstop) @param {{skin?: string, golden?: boolean, widthMul?: number}} [o]
   */
  track(actor, dt, o = {}) {
    // age + drop old samples
    if (dt > 0) {
      for (let i = 0; i < this.n; i++) this.age[i] += dt;
      let drop = 0;
      while (drop < this.n && this.age[drop] > this.life) drop++;
      if (drop > 0) this._drop(drop);
    }
    const sw = actor?.swing;
    if (sw && sw.def && actor.alive !== false) {
      if (sw !== this._swing) {
        this._swing = sw;
        this.setStyle(trailStyle(sw.def.id, o.skin, o.golden));
        const w = trailWindow(sw.def);
        this._w0 = w[0]; this._w1 = w[1];
        this._newRibbon = true;                        // each swing is its own ribbon
      }
      if (sw.t >= this._w0 && sw.t <= this._w1 && dt > 0) {
        let ok = false;
        if (resolveBlade(actor, _h, _t)) { _h.lerp(_t, HILT_INSET); ok = true; }       // the ribbon covers the outer blade
        else ok = this._arc(actor, sw, _h, _t);
        if (ok) {
          const k = o.widthMul ?? 1;
          if (k !== 1) { _c.addVectors(_h, _t).multiplyScalar(0.5); _h.sub(_c).multiplyScalar(k).add(_c); _t.sub(_c).multiplyScalar(k).add(_c); }
          this.push(_h, _t);
        }
      }
    } else if (this._swing) { this._swing = null; this._newRibbon = true; }
    this._build();
  }

  /** Fallback when no blade can be found: the swing's hit arc (tech.md §9.2) around the actor. */
  _arc(actor, sw, outH, outT) {
    const d = sw.def, arc = d.arc;
    if (!arc) return false;
    const t0 = d.active ? d.active[0] : 0, t1 = d.active ? d.active[1] : (d.dur ?? 0.4);
    const u = easeSwing(Math.min(1, Math.max(0, (sw.t - t0) / Math.max(1e-3, t1 - t0))));
    const ang = (actor.object3d?.rotation?.y ?? actor.facing ?? 0) + arc.from + (arc.to - arc.from) * u;
    actorWorldPos(actor, outH);
    const y = outH.y + ((arc.y0 ?? 0) + (arc.y1 ?? 1.2)) * 0.5;
    const s = Math.sin(ang), c = Math.cos(ang), reach = Math.min(arc.range ?? 1.8, 2.2);
    outT.set(outH.x + s * reach * 0.92, y, outH.z + c * reach * 0.92);
    outH.set(outH.x + s * 0.35, y, outH.z + c * 0.35);
    return true;
  }

  _build() {
    const n = this.n;
    if (n < 2) { this.geometry.setDrawRange(0, 0); this.mesh.visible = false; return; }
    const P = this.pos, A = this.at, H = this.h, T = this.tp, life = this.life;
    let v = 0, a = 0;
    while (a < n) {
      let b = a + 1;                                   // run [a, b) of connected samples
      while (b < n && !this.brk[b]) b++;
      if (b - a >= 2) {
        if (v > 0) v = this._bridge(v, a);             // invisible join from the previous ribbon
        for (let i = a; i < b - 1; i++) {
          const i0 = Math.max(a, i - 1), i1 = i, i2 = i + 1, i3 = Math.min(b - 1, i + 2);
          const steps = i === b - 2 ? SUB + 1 : SUB;
          for (let s = 0; s < steps; s++) {
            const u = s / SUB;
            for (let k = 0; k < 3; k++) {
              P[v * 6 + k] = cr(H[i0 * 3 + k], H[i1 * 3 + k], H[i2 * 3 + k], H[i3 * 3 + k], u);
              P[v * 6 + 3 + k] = cr(T[i0 * 3 + k], T[i1 * 3 + k], T[i2 * 3 + k], T[i3 * 3 + k], u);
            }
            const age = this.age[i1] + (this.age[i2] - this.age[i1]) * u;
            const fresh = Math.max(0, 1 - age / life) * Math.min(1, ((i - a) * SUB + s + 1) / 3);
            A[v * 4] = fresh; A[v * 4 + 1] = 0; A[v * 4 + 2] = fresh; A[v * 4 + 3] = 1;
            v++;
          }
        }
      }
      a = b;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aT.needsUpdate = true;
    this.geometry.setDrawRange(0, Math.max(0, v - 1) * 6);
    this.mesh.visible = v > 1;
  }

  /** Two zero-alpha vertex pairs (last of the previous run, first sample `i`) so ribbons of different swings never join. */
  _bridge(v, i) {
    const P = this.pos, A = this.at;
    for (let k = 0; k < 6; k++) P[v * 6 + k] = P[(v - 1) * 6 + k];
    A[v * 4] = 0; A[v * 4 + 1] = 0; A[v * 4 + 2] = 0; A[v * 4 + 3] = 1;
    v++;
    for (let k = 0; k < 3; k++) { P[v * 6 + k] = this.h[i * 3 + k]; P[v * 6 + 3 + k] = this.tp[i * 3 + k]; }
    A[v * 4] = 0; A[v * 4 + 1] = 0; A[v * 4 + 2] = 0; A[v * 4 + 3] = 1;
    return v + 1;
  }

  dispose() { this.mesh.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}

/** Catmull-Rom (uniform) interpolation of one scalar. */
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
