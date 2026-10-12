// src/world/Bunting.js  (owner: world) — WA §2.6 / LI W12 candy bunting: the ONE added play draw of Phase W.
// One InstancedMesh per level: triangular pennants (2 tris, 0.28 × 0.34 m) and / or round paper lanterns (4-sided
// bicone, 8 tris), hung along catenary strings (sag 12 % of the span, 0.55 m spacing, ≥ 3.2 m above the ground).
// Lambert + the global toon patch (shares the world program family), castShadow false, per-instance colour from the
// level accent set (cycled, ±4 % L jitter), flutter on the free vertices in the vertex shader (no CPU per frame).
// Caps (config BUNTING, WA28): ≤ 240 pennants (Low 120), ≤ 60 lanterns (Low 30), and the drawn triangles
// ≤ 480 (Low 240). Level data: `def.bunting: [{ a: [x, y, z], b: [x, y, z], set?: 'accent' | ['#hex', ...],
// kind?: 'pennant' | 'lantern' }]` (y = height above the ground under the anchor). Node-safe (three only).
import * as THREE from 'three';
import { BUNTING } from '../core/config.js';
import { mulberry32 } from '../core/rng.js';

/** Default accent sets (LI §4: the only colours bunting may use on a level). */
export const BUNTING_ACCENT = Object.freeze({
  meadow: Object.freeze(['#FFD84A', '#8FD3FF', '#FF8FB1']),
  forest: Object.freeze(['#9BE3C4', '#FF8A7A', '#FFD84A']),
  town: Object.freeze(['#FF8FB1', '#FFD84A', '#8FD3FF', '#9BE3C4', '#C9A8FF']),
  townOccupied: Object.freeze(['#7A4E9A', '#E0B043']),
  gate: Object.freeze(['#FF9E7A', '#3FC1C9', '#FFF6E8']),
  bog: Object.freeze(['#8FF0D8', '#C9A8FF', '#FFC46B']),
  keep: Object.freeze(['#5A7FD6', '#F2D06B', '#4FD1B0']),
});

/** Shape constants (m): pennant width / drop, lantern radius / height / hang, colour jitter. */
export const BUNTING_SHAPE = Object.freeze({ pennantW: 0.28, pennantH: 0.34, lanternR: 0.13, lanternH: 0.34, hang: 0.04, jitterL: 0.04, triPennant: 2, triLantern: 8, maxTris: 480, maxTrisLow: 240 });

/**
 * Lay out the instances of a set of strings (pure): catenary points every `spacing` m, clamped ≥ minH above the
 * ground, kinds and caps applied. Returns { items: [{ x, y, z, yaw, kind, color }], pennants, lanterns, tris, dropped }.
 * @param {{a:number[], b:number[], set?:any, kind?:'pennant'|'lantern'}[]} strings
 * @param {{low?: boolean, heightAt?: (x:number, z:number) => number, accent?: string[], seed?: number}} [o]
 */
export function layoutBunting(strings, { low = false, heightAt = () => 0, accent = BUNTING_ACCENT.meadow, seed = 1 } = {}) {
  const B = BUNTING, S = BUNTING_SHAPE;
  const capP = low ? B.maxLow : B.max, capL = low ? B.lanternMaxLow : B.lanternMax, capT = low ? S.maxTrisLow : S.maxTris;
  const items = [];
  let pennants = 0, lanterns = 0, dropped = 0;
  const rnd = mulberry32((seed >>> 0) + 977);
  const col = new THREE.Color();
  for (const st of strings ?? []) {
    if (!Array.isArray(st?.a) || !Array.isArray(st?.b)) continue;
    const kind = st.kind === 'lantern' ? 'lantern' : 'pennant';
    const set = Array.isArray(st.set) && st.set.length ? st.set : accent;
    const ax = st.a[0], az = st.a[2], bx = st.b[0], bz = st.b[2];
    const ya = heightAt(ax, az) + Math.max(B.minH, st.a[1] ?? B.minH), yb = heightAt(bx, bz) + Math.max(B.minH, st.b[1] ?? B.minH);
    const span = Math.hypot(bx - ax, bz - az);
    if (!(span > B.spacing)) continue;
    const n = Math.max(1, Math.floor(span / B.spacing));
    const yaw = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const sagY = ya + (yb - ya) * t - B.sag * span * 4 * t * (1 - t);
      const y = Math.max(sagY, heightAt(x, z) + B.minH);
      if (kind === 'pennant' ? pennants >= capP : lanterns >= capL) { dropped++; continue; }
      col.set(set[(items.length) % set.length]).offsetHSL(0, 0, (rnd() * 2 - 1) * S.jitterL);
      items.push({ x, y, z, yaw, kind, color: col.getHex() });
      if (kind === 'pennant') pennants++; else lanterns++;
    }
  }
  // one geometry per mesh: single-kind levels draw exactly 2 or 8 tris per instance; mixed levels draw both shapes
  // (the other one collapsed), so the triangle cap drops instances from the end until it holds
  const per = () => (pennants && lanterns ? S.triPennant + S.triLantern : pennants ? S.triPennant : S.triLantern);
  while (items.length && items.length * per() > capT) {
    const it = items.pop(); dropped++;
    if (it.kind === 'pennant') pennants--; else lanterns--;
  }
  return { items, pennants, lanterns, tris: items.length ? items.length * per() : 0, dropped };
}

/** Pennant (aKind 0) and lantern (aKind 1) geometry; aFree marks the vertices that flutter / sway. */
export function makeBuntingGeometry({ pennant = true, lantern = false } = {}) {
  const S = BUNTING_SHAPE, P = [], N = [], K = [], F = [];
  const v = (x, y, z, k, f, nx = 0, ny = 1, nz = 0) => { P.push(x, y, z); N.push(nx, ny, nz); K.push(k); F.push(f); };
  if (pennant) {
    const w = S.pennantW / 2;
    // hangs from the string (y 0) down to the tip; normal mostly up so both faces shade like the ground
    v(-w, 0, 0, 0, 0, 0, 0.85, 0.53); v(w, 0, 0, 0, 0, 0, 0.85, 0.53); v(0, -S.pennantH, 0, 0, 1, 0, 0.85, 0.53);
  }
  if (lantern) {
    const r = S.lanternR, h = S.lanternH, top = -S.hang, mid = top - h / 2, bot = top - h;
    const eq = [[r, 0], [0, r], [-r, 0], [0, -r]];
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = eq[i], [x1, z1] = eq[(i + 1) % 4], nx = (x0 + x1) / 2 / r, nz = (z0 + z1) / 2 / r;
      v(0, top, 0, 1, 0, nx, 0.7, nz); v(x1, mid, z1, 1, 1, nx, 0.7, nz); v(x0, mid, z0, 1, 1, nx, 0.7, nz);
      v(0, bot, 0, 1, 1, nx, -0.2, nz); v(x0, mid, z0, 1, 1, nx, -0.2, nz); v(x1, mid, z1, 1, 1, nx, -0.2, nz);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(K, 1));
  g.setAttribute('aFree', new THREE.Float32BufferAttribute(F, 1));
  return g;
}

/** Lambert + toon patch; flutter on free vertices (wind), the other kind collapsed per instance. Constant cache key. */
export function makeBuntingMaterial(uniforms) {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  m.dithering = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aKind, aFree;\nattribute vec2 aBunt;\nuniform float uTime, uWind, uFlutter;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float keep = 1.0 - abs(aKind - aBunt.x);
  float ph = aBunt.y;
  transformed.z += sin(uTime * 2.3 + ph) * uFlutter * uWind * aFree * 2.5;
  transformed.x += cos(uTime * 1.9 + ph * 1.3) * uFlutter * uWind * aFree;
  transformed *= keep;
}`);
  };
  m.customProgramCacheKey = () => 'world-bunting-v1';
  m.userData.owned = true;
  return m;
}

export class Bunting {
  /**
   * @param {{a:number[], b:number[], set?:any, kind?:'pennant'|'lantern'}[]} strings
   * @param {{quality?: any, heightAt?: (x:number, z:number) => number, seed?: number, accent?: string[]|string}} [o]
   */
  constructor(strings, { quality = null, heightAt = () => 0, seed = 1, accent = null } = {}) {
    const acc = Array.isArray(accent) ? accent : BUNTING_ACCENT[accent] ?? BUNTING_ACCENT.meadow;
    this.layout = layoutBunting(strings, { low: quality?.id === 'low', heightAt, accent: acc, seed });
    this.mesh = null;
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 0.6 }, uFlutter: { value: BUNTING.flutter } };
    const L = this.layout, n = L.items.length;
    if (!n) return;
    this.geometry = makeBuntingGeometry({ pennant: L.pennants > 0, lantern: L.lanterns > 0 });
    const bunt = new Float32Array(n * 2);
    L.items.forEach((it, i) => { bunt[i * 2] = it.kind === 'lantern' ? 1 : 0; bunt[i * 2 + 1] = i * 0.7; });
    this.geometry.setAttribute('aBunt', new THREE.InstancedBufferAttribute(bunt, 2));
    this.material = makeBuntingMaterial(this.uniforms);
    const mesh = this.mesh = new THREE.InstancedMesh(this.geometry, this.material, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    L.items.forEach((it, i) => {
      e.set(0, it.yaw + Math.PI / 2, 0); q.setFromEuler(e);
      mesh.setMatrixAt(i, m.compose(p.set(it.x, it.y, it.z), q, s));
      mesh.setColorAt(i, c.setHex(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); mesh.computeBoundingBox?.();
    mesh.name = 'bunting';
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.userData.camFade = true;            // CONTROLS camFade: strings across the lens segment fade like canopies
    mesh.userData.owned = true;
    this.geometry.userData.owned = true;
  }

  /** Drawn triangles (renderer.info) of this mesh. */
  get tris() { return this.layout.tris; }

  /** Per frame: time + wind for the flutter (uniform writes only). */
  update(t, env) { this.uniforms.uTime.value = t; this.uniforms.uWind.value = env?.wind ?? 0.6; }

  dispose() { this.mesh?.removeFromParent(); this.mesh?.dispose?.(); this.geometry?.dispose(); this.material?.dispose(); }
}
