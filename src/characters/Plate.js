// Breastplate words (GAME_DESIGN §2.4, §18.3; TREND V2): CanvasTexture 256 x 128 in a scratchy hand font
// (MedievalSharp), a random word from the faction list, on a rusty breastplate decal attached to bone `chest`.
import * as THREE from 'three';
import { assetUrl, canvas2d, mulberry32, hashString, GeoBuilder, mat, rgb, mixRgb, fbm3, smoothstep } from './util.js';
import { kitMaterial, own } from './materials.js';

/** Snickerpack titles (ENEMIES.hyena.plateWords + the stealer's word, GAME_DESIGN §2.4). */
export const PLATE_WORDS = Object.freeze(['HATER', 'GRUMBLER', 'NAYSAYER', 'SCOFFER', 'SNEERER', 'SPOILER', 'POST STEALER', 'HATER-IN-CHIEF']);
export const PLATE_FONT = 'MedievalSharp';

let _fontPromise = null, _fontReady = false;
const _waiting = new Set();
/** Load MedievalSharp once (FontFace API); textures drawn before it loads redraw themselves afterwards. */
export function ensurePlateFont() {
  if (_fontPromise) return _fontPromise;
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') { _fontPromise = Promise.resolve(false); return _fontPromise; }
  const ff = new FontFace(PLATE_FONT, `url(${assetUrl('fonts/MedievalSharp-Regular.ttf')})`);
  _fontPromise = ff.load().then((f) => {
    document.fonts.add(f); _fontReady = true;
    for (const redraw of _waiting) redraw();
    _waiting.clear();
    return true;
  }).catch(() => false);
  return _fontPromise;
}

/**
 * Paint a plate word. Transparent background; dark scratched ink with drips and highlight scratches.
 * @param {string} word
 * @param {{seed?: number, w?: number, h?: number, ink?: string, scratch?: string}} [o]
 * @returns {THREE.CanvasTexture|null}
 */
export function makePlateTexture(word = 'HATER', o = {}) {
  const Wd = o.w ?? 256, Ht = o.h ?? 128;
  const c = canvas2d(Wd, Ht);
  if (!c) return null;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const draw = () => {
    const g = c.getContext('2d');
    const rnd = mulberry32((o.seed ?? 1) * 7919 + hashString(word));
    g.clearRect(0, 0, Wd, Ht);
    const ink = o.ink ?? '#16120F', scratch = o.scratch ?? 'rgba(225,215,200,0.55)';
    const lines = word.length > 9 && word.includes(' ') ? word.split(' ') : [word];
    const family = _fontReady ? `'${PLATE_FONT}', serif` : 'Georgia, serif';
    lines.forEach((line, li) => {
      let size = Ht * (lines.length > 1 ? 0.4 : 0.62);
      g.font = `${size}px ${family}`;
      const wTot = g.measureText(line).width;
      const maxW = Wd * 0.9;
      if (wTot > maxW) { size *= maxW / wTot; g.font = `${size}px ${family}`; }
      const total = g.measureText(line).width;
      let x = (Wd - total) / 2;
      const yBase = lines.length > 1 ? Ht * (0.44 + li * 0.42) : Ht * 0.7;
      for (const ch of line) {
        const cw = g.measureText(ch).width;
        const rot = (rnd() - 0.5) * 0.22, dy = (rnd() - 0.5) * size * 0.12, sc = 0.92 + rnd() * 0.16;
        g.save(); g.translate(x + cw / 2, yBase + dy); g.rotate(rot); g.scale(sc, sc * (1.05 + rnd() * 0.1));
        // brushy ink: several jittered passes
        for (let k = 0; k < 4; k++) {
          g.globalAlpha = 0.55 + rnd() * 0.35; g.fillStyle = ink;
          g.fillText(ch, -cw / 2 + (rnd() - 0.5) * 2.2, (rnd() - 0.5) * 2.2);
        }
        // scratched highlight along the stroke edge
        g.globalAlpha = 0.6; g.strokeStyle = scratch; g.lineWidth = 0.8;
        g.strokeText(ch, -cw / 2 + 1.2, -1.0);
        // drips
        if (rnd() < 0.45) {
          g.globalAlpha = 0.8; g.fillStyle = ink;
          const dx = (rnd() - 0.5) * cw * 0.5, len = size * (0.12 + rnd() * 0.3);
          g.fillRect(dx, 0, 1.6 + rnd() * 1.5, len);
          g.beginPath(); g.arc(dx + 1.2, len, 1.8, 0, Math.PI * 2); g.fill();
        }
        g.restore();
        x += cw * (0.98 + rnd() * 0.06);
      }
    });
    // random scratches across the plate
    g.globalAlpha = 0.35; g.strokeStyle = scratch; g.lineWidth = 0.7;
    for (let i = 0; i < 9; i++) {
      const x0 = rnd() * Wd, y0 = rnd() * Ht, a = (rnd() - 0.5) * 1.2, l = 10 + rnd() * 40;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * l, y0 + Math.sin(a) * l); g.stroke();
    }
    g.globalAlpha = 1;
    tex.needsUpdate = true;
  };
  draw();
  if (!_fontReady) { _waiting.add(draw); ensurePlateFont(); }
  return tex;
}

const _decalMats = new Map();
function decalMaterial(tex) {
  const key = tex ? tex.uuid : 'none';
  if (_decalMats.has(key)) return _decalMats.get(key);
  const m = own(new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.25, depthWrite: false, roughness: 0.7, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2 }));
  _decalMats.set(key, m);
  return m;
}

/**
 * A rusty breastplate with a word, built in a unit frame: width 1, centre at the origin, front facing +Z,
 * curved about the Y axis (radius `curve` in widths). Scale it to the body.
 * @param {string} word
 * @param {{seed?: number, style?: 'rusty'|'iron'|'black', curve?: number, height?: number, trim?: string}} [o]
 */
export function buildPlate(word = 'HATER', o = {}) {
  const group = new THREE.Group(); group.name = 'plate:' + word;
  const R = o.curve ?? 0.85, h = o.height ?? 0.72, span = 1.0 / R; // arc length 1 → angle
  const style = o.style || 'rusty';
  const base = rgb(style === 'black' ? '#2E3036' : style === 'iron' ? '#55585E' : '#6E6A66');
  const rust = rgb('#7A4A2E'), trim = rgb(o.trim ?? (style === 'black' ? '#8E1B22' : '#4A3A2E'));
  const gb = new GeoBuilder();
  const plate = new THREE.CylinderGeometry(R, R * 1.06, h, 24, 6, true, -span / 2, span);
  plate.translate(0, 0, -R);
  // bulge the middle outward and round the lower edge
  const p = plate.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / h, x = p.getX(i);
    const k = (1 - (2 * y) ** 2) * 0.06;
    p.setZ(i, p.getZ(i) + k * Math.cos(x * 2.5));
  }
  plate.computeVertexNormals();
  const rustCol = (v) => mixRgb(base, rust, smoothstep(0.5, 0.72, fbm3(v.x * 6 + (o.seed ?? 1), v.y * 6, v.z * 6, 3)) * (style === 'rusty' ? 0.9 : 0.35));
  gb.add(plate, { color: rustCol, rmse: style === 'black' ? [0.45, 0.85, 0, 0] : [0.62, 0.7, 0, 0] });
  // inner face
  const inner = plate.clone(); const ii = inner.index.array;
  for (let i = 0; i < ii.length; i += 3) { const t = ii[i + 1]; ii[i + 1] = ii[i + 2]; ii[i + 2] = t; }
  gb.add(inner, { color: rgb('#2A2624'), rmse: [0.8, 0.4, 0, 0] });
  // rim trim + rivets
  for (const yy of [h / 2, -h / 2]) {
    const rim = new THREE.TorusGeometry(R * (yy > 0 ? 1.0 : 1.06), 0.018, 6, 24, span);
    gb.add(rim, { matrix: mat([0, yy, -R * (yy > 0 ? 1.0 : 1.06)], [Math.PI / 2, 0, Math.PI / 2 - span / 2]), color: trim, rmse: [0.5, 0.6, 0, 0] });
  }
  for (let i = 0; i < 6; i++) {
    const a = -span / 2 + 0.06 + (i / 5) * (span - 0.12);
    for (const yy of [h * 0.42, -h * 0.42]) gb.add(new THREE.SphereGeometry(0.022, 8, 6), { matrix: mat([Math.sin(a) * R * 1.02, yy, Math.cos(a) * R * 1.02 - R]), color: rgb('#8C8478'), rmse: [0.45, 0.85, 0, 0] });
  }
  const plateMesh = new THREE.Mesh(gb.build(), kitMaterial());
  plateMesh.castShadow = true; plateMesh.name = 'plateBody';
  group.add(plateMesh);
  // decal: the plate surface itself, pushed out along its normals, with UVs mapping the word onto the centre
  if (word) {
    const tex = makePlateTexture(word, { seed: o.seed, ink: style === 'black' ? '#D8CFC0' : undefined, scratch: style === 'black' ? 'rgba(142,27,34,0.7)' : undefined });
    if (tex) { tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; }
    const dg = plate.clone();
    const dp = dg.attributes.position, dn = dg.attributes.normal, duv = dg.attributes.uv;
    const textW = span * 0.86, textH = h * 0.62;
    for (let i = 0; i < dp.count; i++) {
      const x = dp.getX(i), y = dp.getY(i), z = dp.getZ(i);
      const th = Math.atan2(x, z + R);
      duv.setXY(i, 0.5 + th / textW, 0.5 + (y - 0.02) / textH);
      dp.setXYZ(i, x + dn.getX(i) * 0.007, y + dn.getY(i) * 0.007, z + dn.getZ(i) * 0.007);
    }
    const decal = new THREE.Mesh(dg, decalMaterial(tex));
    decal.name = 'plateWord'; decal.renderOrder = 1;
    group.add(decal);
    group.userData.texture = tex;
  }
  group.userData.word = word;
  return group;
}

/** Pick a plate word deterministically from a list. */
export function pickPlateWord(list = PLATE_WORDS, seed = 0) {
  const r = mulberry32(seed + 17)();
  return list[Math.floor(r * list.length) % list.length];
}

/**
 * Attach a word plate to a KayKit model's chest bone, sized from its body mesh.
 * @param {THREE.Object3D} model fitted KayKit clone (bind pose)
 * @param {string} word
 * @param {{bodyNode?: string, bone?: string, seed?: number, style?: string, scale?: number, offset?: number[]}} [o]
 * @returns {THREE.Group|null}
 */
export function attachPlate(model, word, o = {}) {
  model.updateMatrixWorld(true);
  const bone = model.getObjectByName(o.bone || 'chest');
  if (!bone) return null;
  let body = o.bodyNode ? model.getObjectByName(o.bodyNode) : null;
  if (!body) model.traverse((c) => { if (!body && c.isMesh && /_Body$/.test(c.name)) body = c; });
  const plate = buildPlate(word, o);
  const inv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
  let width = 0.75, front = 0.37, cy = 0.1;
  if (body) {
    body.geometry.computeBoundingBox();
    const bb = body.geometry.boundingBox, m = new THREE.Matrix4().multiplyMatrices(inv, body.matrixWorld);
    const box = new THREE.Box3();
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) box.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(m));
    width = (box.max.x - box.min.x) * 0.86;
    front = box.max.z;
    cy = Math.min(box.max.y, 0) - (box.max.y - box.min.y) * 0.05 + (box.max.y - box.min.y) * 0.18;
    cy = (box.min.y + box.max.y) * 0.5 + (box.max.y - box.min.y) * 0.12;
  }
  const s = width * (o.scale ?? 1);
  plate.scale.setScalar(s);
  plate.position.set(0, cy, front + 0.01 * s);
  if (o.offset) plate.position.add(new THREE.Vector3(...o.offset));
  bone.add(plate);
  return plate;
}
