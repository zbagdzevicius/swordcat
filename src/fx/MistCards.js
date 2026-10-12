// src/fx/MistCards.js  (owner: fx) — art.md §9.2 mist cards: vertical, cylindrically billboarded planes (8 × 2.5 m) at
// ground level with scrolling 2-octave noise alpha (max 0.22, colour fogLow → fog), fading to 0 within 3 m of the
// camera, depthWrite off. Two uses:
//   - the ambient drift field (30–60 cards recycled around the camera, drifting with the wind; ×2 speed in Meme Cam,
//     PLAYER.memeCam.mist; faster while she holds her ground);
//   - fog walls: `mistRing(center, r | [w, d])` = cards every 1.5 m on a ring (arena template §12.1) or along the four
//     edges of a rectangle (rectangular arenas, level bounds). The wall rises on creation; `dispose()` dissolves it
//     over 1.5 s (arena clear) and `remove()` drops it at once. Each wall / the field is ONE instanced draw call.
// Iso camera (research/CONTROLS_SPEC.md §4.2): seen from above a vertical card is a sliver, so in the play camera the
// cards sit 0.3–1.2 m above the ground (walls: capped at 2.5 m) and lean 60° toward the lens; every fog wall also
// lays a 2 m-wide ground mist band along its line (one more draw per wall, iso only). The ground mist sheets
// (GroundMist.js) carry the misty screen edges; this field stays for texture, cutscenes and the classic camera.
import * as THREE from 'three';
import { FOG_FACTOR, NOISE, OUTPUT, fogUniforms, fxShaderMaterial } from './shaders.js';
import { PLAYER } from '../core/config.js';
import { groundY, toVec3, hash01, actorWorldPos } from './util.js';

export const WALL = Object.freeze({ spacing: 1.5, w: 5.5, h: 4.6, maxA: 0.62, rise: 0.8, dissolve: 1.5,
  near: 5,          // camera near-fade (m): wall cards are tall and dense, the ambient 3 m is too short for them
  focusIn: 0.5, focusOut: 1.2, focusMin: 0.08 });   // cards up to her depth (+ a margin) fade to focusMin

export const AMBIENT = Object.freeze({ w: 8, h: 2.5, maxA: 0.22, radius: 34 });
/** Iso placement (CONTROLS_SPEC §4.2): lean toward the lens, base lift and height caps (m), the wall's ground band. */
// ambientA: the ambient field's alpha in the iso view. Its wide cards, leaned toward a lens 50° above them, read as long
// pale streaks over the ground; the GroundMist sheets carry the iso mist instead, so the field only lingers faintly.
export const MIST_ISO = Object.freeze({ tilt: Math.PI / 3, lift: 0.3, ambientH: 0.9, wallH: 2.5, bandW: 2, bandA: 0.42, ease: 3, ambientA: 0.12 });
/** Ambient density per level id (× the quality count). */
export const AMBIENT_DENSITY = Object.freeze({ meadow: 1, forest: 0.85, town: 0.45, gate: 1, bog: 1.3, keep: 0.6, sky: 0 });

/** Card centres every `spacing` m on a circle (pure; unit-tested). Returns a flat [x, z, …] array. */
export function ringCardPositions(cx, cz, r, spacing = WALL.spacing) {
  const n = Math.max(6, Math.round((Math.PI * 2 * r) / spacing));
  const out = new Array(n * 2);
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out[i * 2] = cx + Math.sin(a) * r; out[i * 2 + 1] = cz + Math.cos(a) * r; }
  return out;
}

/** Card centres every `spacing` m along the four edges of a w × d rectangle centred on (cx, cz), rotated by `yaw` (pure). */
export function rectCardPositions(cx, cz, w, d, spacing = WALL.spacing, yaw = 0) {
  const out = [], c = Math.cos(yaw), s = Math.sin(yaw);
  const edge = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / spacing));
    for (let i = 0; i < n; i++) {
      const u = i / n, lx = x0 + (x1 - x0) * u, lz = z0 + (z1 - z0) * u;
      out.push(cx + lx * c + lz * s, cz - lx * s + lz * c);
    }
  };
  const hw = w / 2, hd = d / 2;
  edge(-hw, -hd, hw, -hd); edge(hw, -hd, hw, hd); edge(hw, hd, -hw, hd); edge(-hw, hd, -hw, -hd);
  return out;
}

const VERT = /* glsl */`
attribute vec3 iPos;      // card base centre (world)
attribute vec4 iCard;     // width, height, seed, alpha
uniform float uTilt;      // iso: the card leans toward the lens by this angle from vertical (rad)
uniform vec2 uIsoH;       // iso: x = base lift (m), y = height cap (m; 0 = none)
varying vec2 vUv;
varying float vSeed, vAlpha, vCamDist;
#include <fog_pars_vertex>
void main() {
  vec2 corner = position.xy;                       // x −0.5..0.5, y 0..1
  vec2 tc = cameraPosition.xz - iPos.xz;
  float l = length( tc );
  vec2 side = l > 1e-4 ? vec2( tc.y, -tc.x ) / l : vec2( 1.0, 0.0 );
  float h = iCard.y * ( 0.35 + 0.65 * clamp( iCard.w * 1.4, 0.0, 1.0 ) );
  if ( uIsoH.y > 0.0 ) h = min( h, uIsoH.y );
  vec2 toCam = l > 1e-4 ? tc / l : vec2( 0.0, 1.0 );
  vec3 upv = vec3( -toCam.x * sin( uTilt ), cos( uTilt ), -toCam.y * sin( uTilt ) );   // top leans away: the face looks up at the lens
  vec3 wp = iPos + vec3( 0.0, uIsoH.x, 0.0 ) + vec3( side.x, 0.0, side.y ) * corner.x * iCard.x + upv * corner.y * h;
  vUv = vec2( corner.x + 0.5, corner.y );
  vSeed = iCard.z; vAlpha = iCard.w;
  vCamDist = distance( cameraPosition, wp );
  vec4 mvPosition = viewMatrix * vec4( wp, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uTime, uMaxA, uNear;
uniform vec2 uFocus;      // x = player's camera distance, y = 1 to fade cards in front of her (walls)
uniform vec2 uScroll;
uniform vec2 uLoop;       // x = Meme Cam loop phase 0..1, y = loop weight 0..1
uniform vec2 uLoopDrift;  // scroll distance per loop period
varying vec2 vUv;
varying float vSeed, vAlpha, vCamDist;
#include <fog_pars_fragment>
${FOG_FACTOR}
${NOISE}
void main() {
  vec2 q0 = vec2( vUv.x * 2.2 + vSeed * 17.0, vUv.y * 1.1 + vSeed * 5.3 );
  float n = fxFbm2( ( q0 + uScroll ) * 1.5 );
  if ( uLoop.y > 0.001 ) {
    // Meme Cam (§7.8: seamless 3.8 s loop): two layers scroll by uLoopDrift per period half a period apart and
    // cross-fade (each is invisible when it jumps back), so the drift keeps moving yet repeats exactly
    float pA = uLoop.x, pB = fract( uLoop.x + 0.5 );
    float nA = fxFbm2( ( q0 + uLoopDrift * pA ) * 1.5 );
    float nB = fxFbm2( ( q0 + uLoopDrift * pB + vec2( 0.37, 0.61 ) ) * 1.5 );
    float wA = 1.0 - abs( 2.0 * pA - 1.0 );
    float nL = mix( nB, nA, wA );
    nL = 0.5 + ( nL - 0.5 ) * ( 1.0 + 0.42 * ( 1.0 - abs( 2.0 * wA - 1.0 ) ) );   // restore the contrast lost in the mix
    n = mix( n, nL, uLoop.y );
  }
  float a = smoothstep( 0.3, 0.8, n );
  a *= sin( clamp( vUv.x, 0.0, 1.0 ) * 3.14159 );
  // soft foot (bottom ~30%): where a card meets sloped ground it no longer cuts a hard line (requests/world.md)
  a *= smoothstep( 0.0, 0.32, vUv.y ) * ( 1.0 - smoothstep( 0.45, 1.0, vUv.y ) );
  a *= uMaxA * vAlpha * smoothstep( uNear * 0.33, uNear, vCamDist );
  // walls: a card between the lens and Swordcat thins out so she never greys out on a bridge / arena edge
  if ( uFocus.y > 0.5 ) a *= mix( ${WALL.focusMin.toFixed(3)}, 1.0, smoothstep( uFocus.x - ${WALL.focusIn.toFixed(3)}, uFocus.x + ${WALL.focusOut.toFixed(3)}, vCamDist ) );
  if ( a < 0.003 ) discard;
  vec3 col = mix( uColor, fxFogColor(), clamp( 0.3 + 0.55 * vUv.y, 0.0, 1.0 ) );
  col = mix( col, fxFogColor(), fxFog() );
  gl_FragColor = vec4( col, a );
  ${OUTPUT}
}`;

let _plane = null;
function cardPlane() {
  if (_plane) return _plane;
  _plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  return _plane;
}

/** An instanced set of mist cards (one draw call). */
export class CardSet {
  constructor(count, { maxA = AMBIENT.maxA, name = 'fx.mist', renderOrder = 4 } = {}) {
    this.count = count;
    const g = new THREE.InstancedBufferGeometry();
    const p = cardPlane();
    g.index = p.index; g.setAttribute('position', p.getAttribute('position'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCard = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCard', this.aCard);
    g.instanceCount = count;
    this.geometry = g;
    this.material = fxShaderMaterial({
      name, vertexShader: VERT, fragmentShader: FRAG, fog: true,
      uniforms: { ...fogUniforms(), uColor: { value: new THREE.Color('#9AA196') }, uTime: { value: 0 }, uMaxA: { value: maxA },
        uNear: { value: 3 }, uFocus: { value: new THREE.Vector2() }, uScroll: { value: new THREE.Vector2() }, uLoop: { value: new THREE.Vector2() },
        uLoopDrift: { value: new THREE.Vector2() }, uTilt: { value: 0 }, uIsoH: { value: new THREE.Vector2() } },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = name;
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.renderOrder = renderOrder;
    this.scroll = this.material.uniforms.uScroll.value;
    this.loop = this.material.uniforms.uLoop.value;
    this.loopDrift = this.material.uniforms.uLoopDrift.value;
  }

  /** Meme Cam loop sync: phase 0..1, weight 0..1, scroll speed (uv / s) and period (s). */
  setLoop(phase, weight, sx, sy, period) {
    this.loop.set(phase, weight);
    this.loopDrift.set(sx * period, sy * period);
  }

  setCard(i, x, y, z, w, h, seed, alpha) {
    const P = this.aPos.array, C = this.aCard.array;
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    C[i * 4] = w; C[i * 4 + 1] = h; C[i * 4 + 2] = seed; C[i * 4 + 3] = alpha;
  }

  setAlpha(a) { const C = this.aCard.array; for (let i = 0; i < this.count; i++) C[i * 4 + 3] = a; this.aCard.needsUpdate = true; }

  dirty() { this.aPos.needsUpdate = true; this.aCard.needsUpdate = true; }

  /** Iso lean / lift / cap (k = 0 classic … 1 iso). */
  setIso(k, cap) {
    const u = this.material.uniforms;
    u.uTilt.value = MIST_ISO.tilt * k;
    u.uIsoH.value.set(MIST_ISO.lift * k, k > 0.01 ? cap + (8 - cap) * (1 - k) : 0);
  }

  dispose() { this.mesh.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}

// ------------------------------------------------------------------ the wall's ground band (iso)
const BAND_VERT = /* glsl */`
attribute float aAcross;  // −1..1 across the band
varying vec3 vW;
varying float vAcross;
void main() {
  vW = position; vAcross = aAcross;
  gl_Position = projectionMatrix * viewMatrix * vec4( position, 1.0 );
}`;
const BAND_FRAG = /* glsl */`
uniform vec3 uColor;
uniform vec2 uScroll;
uniform float uAlpha;
varying vec3 vW;
varying float vAcross;
${NOISE}
void main() {
  float n = fxFbm2( vW.xz * 0.35 + uScroll );
  float a = ( 1.0 - smoothstep( 0.35, 1.0, abs( vAcross ) ) ) * smoothstep( 0.2, 0.75, n ) * uAlpha;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( uColor, a );
  ${OUTPUT}
}`;

/**
 * A closed band `width` m wide along the card line `pts` ([x, z, …]), heights from `ground` (pure geometry; one draw).
 * @returns {THREE.BufferGeometry}
 */
export function bandGeometry(pts, width, ground) {
  const n = pts.length / 2, pos = new Float32Array(n * 2 * 3), acr = new Float32Array(n * 2), idx = [];
  for (let i = 0; i < n; i++) {
    const ip = (i - 1 + n) % n, inx = (i + 1) % n;
    let tx = pts[inx * 2] - pts[ip * 2], tz = pts[inx * 2 + 1] - pts[ip * 2 + 1];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = tz, nz = -tx, x = pts[i * 2], z = pts[i * 2 + 1];
    for (let s = 0; s < 2; s++) {
      const k = s ? 1 : -1, vx = x + nx * k * width / 2, vz = z + nz * k * width / 2, v = i * 2 + s;
      pos[v * 3] = vx; pos[v * 3 + 1] = ground(vx, vz) + 0.06; pos[v * 3 + 2] = vz; acr[v] = k;
    }
    const a = i * 2, b = inx * 2;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aAcross', new THREE.BufferAttribute(acr, 1));
  g.setIndex(idx);
  return g;
}

const _v = new THREE.Vector3();
const _fogLow = new THREE.Color(), _white = new THREE.Color('#FFFFFF');

/** Fog-low tint derived from the current fog colour (greener and darker near the ground, art.md §9.2). */
function fogLowFrom(fogColor, out) {
  return out.setRGB(fogColor.r * 0.84, fogColor.g * 0.88, fogColor.b * 0.8);
}

export class MistCards {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = null;
    this.ambient = null;
    this.ambientOn = false;
    this.density = 1;
    this.walls = new Set();
    this.speedMul = 1;           // Meme Cam / Standing Ground
    this._speed = 1;
    this.loopW = 0;              // Meme Cam loop weight (0 free drift … 1 locked to the camera's 3.8 s loop)
    this._loopPhase = 0;
    this._drift = new THREE.Vector2();
    this._offs = null;           // Float32Array of ambient base offsets
    this.iso = 0;                // eased iso weight (lean / lift / ground bands)
  }

  init(scene, count) {
    this.scene = scene;
    this._buildAmbient(count);
  }

  _buildAmbient(count) {
    this.ambient?.dispose();
    const n = Math.max(0, count | 0);
    this.ambient = new CardSet(n, { name: 'fx.mist.ambient', maxA: AMBIENT.maxA });
    this._offs = new Float32Array(n * 3);
    const R = AMBIENT.radius;
    for (let i = 0; i < n; i++) {
      this._offs[i * 3] = (hash01(i * 3 + 11) * 2 - 1) * R;
      this._offs[i * 3 + 1] = (hash01(i * 3 + 12) * 2 - 1) * R;
      this._offs[i * 3 + 2] = hash01(i * 3 + 13);
    }
    this.ambient.mesh.visible = false;
    this.scene?.add(this.ambient.mesh);
  }

  /** Change the ambient card budget (quality). */
  setCount(count) { if (!this.ambient || this.ambient.count !== count) this._buildAmbient(count); }

  /** Ambient field on/off (density multiplier per level). */
  setAmbient(on, density = 1) { this.ambientOn = !!on && density > 0; this.density = density; }

  /**
   * A fog wall. `r` = radius, or `[w, d]` / `{w, d}` for a rectangle (also `opts.size`, as world's Arena passes it).
   * Options: { size, spacing, height, width, yaw, alpha, rise, id }.
   * @returns {{ center: THREE.Vector3, r: number, size: number[]|null, readonly alive: boolean, dissolve(sec?: number): void, dispose(sec?: number): void, remove(): void }}
   */
  ring(center, r, opts = {}) {
    const c = toVec3(center, new THREE.Vector3()) ?? new THREE.Vector3();
    const sz = opts.size ?? r;
    const rect = Array.isArray(sz) ? sz : (sz && typeof sz === 'object' ? [sz.w ?? sz.x ?? 10, sz.d ?? sz.z ?? sz.h ?? 10] : null);
    const radius = rect ? Math.hypot(rect[0], rect[1]) / 2 : Math.max(1, +r || 10);
    const spacing = opts.spacing ?? WALL.spacing;
    const pts = rect ? rectCardPositions(c.x, c.z, rect[0], rect[1], spacing, opts.yaw ?? 0) : ringCardPositions(c.x, c.z, radius, spacing);
    const n = pts.length / 2, set = new CardSet(n, { name: 'fx.mist.wall', maxA: opts.alpha ?? WALL.maxA, renderOrder: 4 });
    set.material.uniforms.uNear.value = WALL.near;
    const w = opts.width ?? WALL.w, h = opts.height ?? WALL.h;
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2], z = pts[i * 2 + 1];
      set.setCard(i, x, groundY(this.ctx, x, z, c.y) - 0.3, z, w * (0.85 + 0.3 * hash01(i + 7)), h * (0.85 + 0.3 * hash01(i + 19)), hash01(i * 7 + 3), 0);
    }
    set.dirty();
    this.scene?.add(set.mesh);
    // iso: a 2 m-wide ground mist band along the wall line (shown with the iso weight)
    const band = new THREE.Mesh(bandGeometry(pts, MIST_ISO.bandW, (x, z) => groundY(this.ctx, x, z, c.y)), new THREE.ShaderMaterial({
      name: 'fx.mist.band', vertexShader: BAND_VERT, fragmentShader: BAND_FRAG, fog: false, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { uColor: { value: new THREE.Color('#9AA196') }, uScroll: { value: new THREE.Vector2() }, uAlpha: { value: 0 } },
    }));
    band.material.userData.noHeightFog = true;
    band.name = 'fx.mist.band'; band.frustumCulled = false; band.matrixAutoUpdate = false; band.renderOrder = 2; band.visible = false;
    this.scene?.add(band);
    const wall = { set, band, t: 0, rise: opts.rise ?? WALL.rise, out: -1, outDur: WALL.dissolve, alpha: 0 };
    this.walls.add(wall);
    const self = this;
    return {
      center: c, r: radius, size: rect,
      get alive() { return self.walls.has(wall); },
      dissolve(sec = WALL.dissolve) { if (self.walls.has(wall) && wall.out < 0) { wall.out = 0; wall.outDur = Math.max(0.01, sec); } },
      dispose(sec = WALL.dissolve) { this.dissolve(sec); },
      remove() { self._removeWall(wall); },
    };
  }

  _removeWall(wall) {
    if (!this.walls.delete(wall)) return;
    wall.set.dispose();
    if (wall.band) { wall.band.removeFromParent(); wall.band.geometry.dispose(); wall.band.material.dispose(); }
  }

  /** Remove every wall immediately (level unload). */
  clearWalls() { for (const w of [...this.walls]) this._removeWall(w); }

  get wallCount() { return this.walls.size; }

  /** Per frame. `dt` = visual dt. */
  render(dt) {
    const ctx = this.ctx, fog = ctx.scene?.fog, time = ctx.game?.realTime ?? 0;
    this._speed += (this.speedMul - this._speed) * (1 - Math.exp(-3 * (dt || 0)));
    // Meme Cam: lock the drift to the camera's loop (§7.8 "loops seamlessly with a 3.8 s period")
    const cam = ctx.cam, looping = !!cam?.memeLooping && Number.isFinite(cam.memePhase);
    if (looping) this._loopPhase = cam.memePhase - Math.floor(cam.memePhase);
    this.loopW += ((looping ? 1 : 0) - this.loopW) * (1 - Math.exp(-2.5 * (dt || 0)));
    if (!looping && this.loopW < 0.002) this.loopW = 0;
    const period = PLAYER.memeCam?.loop ?? 3.8, free = 1 - this.loopW;
    const wind = Math.max(0.15, ctx.env?.wind ?? 0.6);
    this._drift.x += dt * this._speed * wind * 0.9 * free; this._drift.y += dt * this._speed * wind * 0.35 * free;
    if (fog?.color) fogLowFrom(fog.color, _fogLow); else _fogLow.set('#9AA196');
    // iso weight: the play camera's three-quarter top-down view (eased, so a cutscene hand-off never pops the cards)
    const c = ctx.cam, isoOn = !!c?.isIso && ctx.params?.cam !== 'classic' && (c.modeName === 'follow' || c.modeName === 'lock' || c.modeName === 'boss');
    this.iso += ((isoOn ? 1 : 0) - this.iso) * (dt > 0 ? 1 - Math.exp(-MIST_ISO.ease * dt) : 1);
    if (Math.abs(this.iso - (isoOn ? 1 : 0)) < 0.002) this.iso = isoOn ? 1 : 0;
    // ---- ambient field (recycled around the camera)
    const A = this.ambient;
    if (A) {
      A.mesh.visible = this.ambientOn && A.count > 0;
      if (A.mesh.visible) {
        const cam = ctx.camera.position, R = AMBIENT.radius, n = A.count;
        const shown = Math.min(n, Math.round(n * Math.min(1, this.density)));
        for (let i = 0; i < n; i++) {
          let x = this._offs[i * 3] + this._drift.x * 1.2 - cam.x, z = this._offs[i * 3 + 1] + this._drift.y * 1.2 - cam.z;
          x = ((x + R) % (2 * R) + 2 * R) % (2 * R) - R; z = ((z + R) % (2 * R) + 2 * R) % (2 * R) - R;
          const wx = cam.x + x, wz = cam.z + z;
          const seed = this._offs[i * 3 + 2];
          A.setCard(i, wx, groundY(ctx, wx, wz, cam.y - 2) - 0.35, wz, AMBIENT.w * (0.8 + 0.4 * seed), AMBIENT.h * (0.85 + 0.3 * seed), seed,
            i < shown ? Math.min(1, this.density) : 0);
        }
        A.dirty();
        const u = A.material.uniforms;
        u.uColor.value.copy(_fogLow); u.uTime.value = time;
        u.uMaxA.value = AMBIENT.maxA * (1 - (1 - MIST_ISO.ambientA) * this.iso);
        A.setIso(this.iso, MIST_ISO.ambientH);
        A.scroll.set(time * 0.035 * this._speed, -time * 0.012 * this._speed);
        A.setLoop(this._loopPhase, this.loopW, 0.035 * this.speedMul, -0.012 * this.speedMul, period);
      }
    }
    // ---- walls
    const pl = ctx.player, camPos = ctx.camera?.position;
    const focus = pl?.object3d && camPos ? actorWorldPos(pl, _v).setY(_v.y + 0.5 * (pl.height ?? 0.6)).distanceTo(camPos) : 0;
    for (const w of this.walls) {
      w.t += dt;
      let a = Math.min(1, w.t / Math.max(0.01, w.rise));
      if (w.out >= 0) { w.out += dt; a *= Math.max(0, 1 - w.out / w.outDur); if (w.out >= w.outDur) { this._removeWall(w); continue; } }
      if (Math.abs(a - w.alpha) > 0.002) { w.alpha = a; w.set.setAlpha(a); }
      const u = w.set.material.uniforms;
      u.uColor.value.copy(_fogLow); u.uTime.value = time;
      u.uFocus.value.set(focus, focus > 0 ? 1 : 0);
      w.set.scroll.set(time * 0.06 * this._speed, -time * 0.02 * this._speed);
      w.set.setLoop(this._loopPhase, this.loopW, 0.06 * this.speedMul, -0.02 * this.speedMul, period);
      w.set.setIso(this.iso, MIST_ISO.wallH);
      if (w.band) {
        const bu = w.band.material.uniforms;
        bu.uAlpha.value = MIST_ISO.bandA * a * this.iso;
        bu.uColor.value.copy(_fogLow).lerp(_white, 0.15);
        bu.uScroll.value.set(time * 0.05 * this._speed, -time * 0.02 * this._speed);
        w.band.visible = bu.uAlpha.value > 0.003;
      }
    }
  }

  dispose() { this.clearWalls(); this.ambient?.dispose(); this.ambient = null; }
}
