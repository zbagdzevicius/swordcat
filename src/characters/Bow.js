// The pink satin bow (research/art.md §2.6). HARD RULE (GAME_DESIGN §3.1, §13.5): Swordcat's bow is always pink
// and sits on her LEFT ear (+X, the viewer's right in a front view). The builder parents it to the `earL` joint.
import * as THREE from 'three';
import { PAL } from './palette.js';
import { GeoBuilder, mat, rgb, mixRgb, smoothstep, Spring, segScale } from './util.js';
import { READABILITY, makeToonMaterial } from './materials.js';

const _mats = new Map();
/** Fraction of the bow's albedo added as emission. */
export const BOW_SELF_LIGHT = 0.22;
/** Satin material (shared per colour set). Vertex colours carry base/shade/knot. */
export function bowMaterial(sheenColor = PAL.bowLight) {
  if (_mats.has(sheenColor)) return _mats.get(sheenColor);
  // WarmToon satin (ART §5.1 family, K6: no Physical in play); `sheenColor` keys the cache (bow colour sets).
  // The bow is recognition cue #1 (art.md §0): a touch of self-light keeps it pastel pink in shade, fog and night
  // (+ READABILITY.bowGlow more from above, through the shared top-view factor). PERF §1.2: the shared sc-toon
  // program (self-light and top glow are uniforms there), not a program of its own.
  // FrontSide: the ribbon geometry carries mirrored back faces (`withBackFaces`), so the bow shares the kit's front
  // toon program instead of a DoubleSide variant
  const m = makeToonMaterial({ selfLight: BOW_SELF_LIGHT, topGlow: READABILITY.bowGlow });
  _mats.set(sheenColor, m);
  return m;
}

/**
 * Bow geometry centred at the knot, loops along ±x, facing +z. Width ≈ 0.17 * scale.
 * @param {{color?:string, light?:string, shade?:string, knot?:string, scale?:number}} o
 */
export function bowGeometry(o = {}) {
  const d = o.detail ?? 1;   // tessellation factor (Low: QUALITY.low.charDetail via the kitten)
  const base = rgb(o.color ?? PAL.bow), shade = rgb(o.shade ?? PAL.bowShade), knot = rgb(o.knot ?? PAL.bowKnot), light = rgb(o.light ?? PAL.bowLight);
  const gb = new GeoBuilder();
  for (const s of [1, -1]) {
    // `round` (TT3, Pearl): fuller, rounder loops
    const g = new THREE.SphereGeometry(0.035, segScale(24, d, 14), segScale(16, d, 10)).scale(o.round ? 1.3 : 1.5, o.round ? 1.08 : 0.85, o.round ? 0.58 : 0.5);
    g.translate(s * 0.035, 0, 0);
    // pinch the inner end (art.md §2.6) + a central fold crease
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), k = smoothstep(0, 1, Math.abs(x) / 0.05) * 0.6 + 0.4;
      const crease = 1 - 0.18 * Math.exp(-(((p.getY(i)) / 0.008) ** 2)) * smoothstep(0.02, 0.06, Math.abs(x));
      p.setY(i, p.getY(i) * k); p.setZ(i, p.getZ(i) * (0.55 + 0.45 * k) * crease);
    }
    g.computeVertexNormals();
    gb.add(g, {
      matrix: mat([0, 0, 0], [0, 0, s * 0.35]),
      color: (v, n) => {
        const t = smoothstep(0.012, 0.075, Math.abs(v.x));
        let c = mixRgb(shade, base, t);
        return mixRgb(c, light, Math.max(0, n.y) * 0.25 * t);
      },
      rmse: [0.38, 0, 1, 0],
    });
  }
  // knot
  gb.add(new THREE.SphereGeometry(0.017, segScale(16, d, 10), segScale(12, d, 8)).scale(1.0, 1.15, 0.8), { matrix: mat([0, 0, 0.004]), color: knot, rmse: [0.38, 0, 1, 0] });
  // tails: V-notched ribbons hanging down and outward
  for (const s of [1, -1]) {
    const g = new THREE.PlaneGeometry(0.02, 0.05, 2, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      if (y < -0.024) p.setY(i, y + (Math.abs(x) < 0.001 ? 0.012 : 0)); // V notch
      p.setZ(i, Math.sin((y + 0.025) * 30) * 0.004);
    }
    g.translate(0, -0.025, 0);
    gb.add(g, { matrix: mat([s * 0.008, -0.006, -0.002], [0.15, 0, s * 0.42]), color: (v) => mixRgb(base, shade, smoothstep(0, -0.05, v.y)), rmse: [0.38, 0, 1, 0] });
  }
  const geo = gb.build();
  if (o.scale && o.scale !== 1) geo.scale(o.scale, o.scale, o.scale);
  return geo;
}

/**
 * Append mirrored back faces (reversed winding, flipped normals) to an indexed or non-indexed geometry, in place: a
 * FrontSide material then draws the thin satin ribbon from both sides with the right shading (PERF §1.2: no
 * DoubleSide program variant).
 * @param {THREE.BufferGeometry} g @returns {THREE.BufferGeometry}
 */
export function withBackFaces(g) {
  if (g.userData.backFaces) return g;
  const n = g.attributes.position.count;
  for (const key of Object.keys(g.attributes)) {
    const a = g.attributes[key], src = a.array, out = new src.constructor(src.length * 2);
    out.set(src); out.set(src, src.length);
    if (key === 'normal') for (let i = src.length; i < out.length; i++) out[i] = -out[i];
    g.setAttribute(key, new THREE.BufferAttribute(out, a.itemSize, a.normalized));
  }
  const I = g.index, t = I ? I.count : n, idx = new (n * 2 > 65535 ? Uint32Array : Uint16Array)(t * 2);
  for (let i = 0; i < t; i++) idx[i] = I ? I.getX(i) : i;
  for (let i = 0; i < t; i += 3) { idx[t + i] = idx[i] + n; idx[t + i + 1] = idx[i + 2] + n; idx[t + i + 2] = idx[i + 1] + n; }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.userData.backFaces = true;
  return g;
}

/**
 * A bow mesh with a bounce spring (CS-11 "both bows bounce"). Call `bow.userData.update(dt)` each frame
 * (the kitten does this) and `bow.userData.bounce(k)` to kick it.
 */
export function buildBow(o = {}) {
  const geo = withBackFaces(bowGeometry(o));
  const mesh = new THREE.Mesh(geo, bowMaterial(o.light ?? PAL.bowLight));
  mesh.name = 'bow'; mesh.castShadow = true;
  const holder = new THREE.Group(); holder.name = 'bowHolder'; holder.add(mesh);
  const sx = new Spring(260, 9), rz = new Spring(160, 7);
  holder.userData.bounce = (k = 1) => { sx.v += 6 * k; rz.v += 5 * k; };
  holder.userData.update = (dt) => {
    const s = 1 + sx.step(0, dt) * 0.12;
    mesh.scale.set(s, 2 - s, 1);
    mesh.rotation.z = rz.step(0, dt) * 0.25;
  };
  holder.userData.mesh = mesh;
  return holder;
}
