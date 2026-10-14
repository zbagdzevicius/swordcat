// Breastplate words (GAME_DESIGN §2.4, §18.3; TREND V2; ART_WARM_SPEC §9.2 / K9: Fredoka 700, ±3° per-glyph jitter;
// WARM_ADVENTURE_SPEC §8.3 / characters.W4): ONE CanvasTexture holds BOTH words in two rows (the foe word on top, the
// index-paired friend word below). The decal shows one row through the texture's repeat / offset; `flipPlate()` swaps
// `offset.y` only (0 canvas work after spawn, no texture swap, no material change).
import * as THREE from 'three';
import { ENEMIES } from '../core/config.js';
import { assetUrl, canvas2d, mulberry32, hashString, GeoBuilder, mat, rgb, mixRgb, fbm3, smoothstep } from './util.js';
import { kitMaterial, makeToonMaterial } from './materials.js';

/** Snickerpack titles (ENEMIES.hyena.plateWords + the stealer's word, GAME_DESIGN §2.4). */
export const PLATE_WORDS = Object.freeze(['GRUMP', 'GRUMBLER', 'NAYSAYER', 'SCOFFER', 'SNEERER', 'SPOILER', 'SNACK SNATCHER', 'GRUMP-IN-CHIEF']);
/** Friend words for plates whose foe word has no config pair (bosses; WA §8.3). */
export const FRIEND_WORDS = Object.freeze({ 'GRUMP-IN-CHIEF': 'CHEER-IN-CHIEF', 'SNACK SNATCHER': 'SNACK SHARER' });
/** The plate font (K9: Fredoka only; the Latin woff2 ui ships). */
export const PLATE_FONT = 'Fredoka';
/**
 * Plate look: texture size (two rows), per-glyph jitter (±3°), ink colours (cocoa foe word, warm pink friend word,
 * cream on black plates), the soft scratch tone, and the row offsets (`offset.y` of the foe / friend row).
 */
export const PLATE = Object.freeze({
  w: 256, h: 256, jitter: 3 * Math.PI / 180, weight: 700,
  ink: '#4A2A1F', friendInk: '#D9467A', inkOnBlack: '#F6EFE4', scratch: 'rgba(255,240,220,0.35)',
  foeOffset: 0.5, friendOffset: 0,
});

let _fontPromise = null, _fontReady = false;
const _waiting = new Set();
/** Load Fredoka once (FontFace API); textures drawn before it loads redraw themselves afterwards. */
export function ensurePlateFont() {
  if (_fontPromise) return _fontPromise;
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') { _fontPromise = Promise.resolve(false); return _fontPromise; }
  // ui may have registered Fredoka already (ui/fonts.js): then nothing to download
  try { if (document.fonts?.check?.(`${PLATE.weight} 20px ${PLATE_FONT}`)) { _fontReady = true; _fontPromise = Promise.resolve(true); return _fontPromise; } } catch { /* old engines */ }
  const ff = new FontFace(PLATE_FONT, `url(${assetUrl('fonts/Fredoka-Latin.woff2')})`, { weight: '300 700' });
  _fontPromise = ff.load().then((f) => {
    document.fonts.add(f); _fontReady = true;
    for (const redraw of _waiting) redraw();
    _waiting.clear();
    return true;
  }).catch(() => false);
  return _fontPromise;
}

/**
 * The friend word paired with a foe word (WA §8.3): the same index in some `ENEMIES.*.plateWordsFriend` row, else
 * FRIEND_WORDS, else null.
 * @param {string} word
 */
export function friendWordFor(word) {
  if (!word) return null;
  for (const row of Object.values(ENEMIES)) {
    const i = row?.plateWords?.indexOf?.(word) ?? -1;
    if (i >= 0 && row.plateWordsFriend?.[i]) return row.plateWordsFriend[i];
  }
  return FRIEND_WORDS[word] ?? null;
}

/** Draw one word row into [y0, y0 + rowH) of the canvas. */
function drawRow(g, word, y0, Wd, rowH, ink, rnd, family) {
  if (!word) return;
  const lines = word.length > 9 && word.includes(' ') ? word.split(' ') : [word];
  lines.forEach((line, li) => {
    let size = rowH * (lines.length > 1 ? 0.36 : 0.52);
    g.font = `${PLATE.weight} ${size}px ${family}`;
    const maxW = Wd * 0.9, wTot = g.measureText(line).width;
    if (wTot > maxW) { size *= maxW / wTot; g.font = `${PLATE.weight} ${size}px ${family}`; }
    const total = g.measureText(line).width;
    let x = (Wd - total) / 2;
    const yBase = y0 + (lines.length > 1 ? rowH * (0.46 + li * 0.38) : rowH * 0.68);
    g.lineJoin = 'round';
    for (const ch of line) {
      const cw = g.measureText(ch).width;
      const rot = (rnd() - 0.5) * 2 * PLATE.jitter, dy = (rnd() - 0.5) * size * 0.08;
      g.save(); g.translate(x + cw / 2, yBase + dy); g.rotate(rot);
      // a soft cream outline under the ink keeps the word readable on any plate tone
      g.globalAlpha = 0.85; g.strokeStyle = 'rgba(255,246,230,0.9)'; g.lineWidth = Math.max(2, size * 0.1);
      g.strokeText(ch, -cw / 2, 0);
      g.globalAlpha = 1; g.fillStyle = ink;
      g.fillText(ch, -cw / 2, 0);
      g.restore();
      x += cw * 1.01;
    }
  });
}

/**
 * Paint a plate texture: the foe word in the top row, the friend word in the bottom row (transparent background).
 * The texture comes back showing the foe row (`repeat.y` 0.5, `offset.y` PLATE.foeOffset).
 * @param {string} word
 * @param {{seed?: number, w?: number, h?: number, ink?: string, scratch?: string, friend?: string|null, friendInk?: string}} [o]
 * @returns {THREE.CanvasTexture|null}
 */
export function makePlateTexture(word = 'GRUMP', o = {}) {
  const Wd = o.w ?? PLATE.w, Ht = o.h ?? PLATE.h;
  const c = canvas2d(Wd, Ht);
  if (!c) return null;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1, 0.5); tex.offset.set(0, PLATE.foeOffset);
  const friend = o.friend === undefined ? friendWordFor(word) : o.friend;
  const draw = () => {
    const g = c.getContext('2d');
    const rnd = mulberry32((o.seed ?? 1) * 7919 + hashString(word));
    g.clearRect(0, 0, Wd, Ht);
    const family = _fontReady ? `'${PLATE_FONT}', sans-serif` : 'sans-serif';
    const rowH = Ht / 2;
    drawRow(g, word, 0, Wd, rowH, o.ink ?? PLATE.ink, rnd, family);
    drawRow(g, friend, rowH, Wd, rowH, o.friendInk ?? PLATE.friendInk, rnd, family);
    // a few soft scuffs (toy-tin wear, never drips or gashes)
    g.globalAlpha = 0.5; g.strokeStyle = o.scratch ?? PLATE.scratch; g.lineWidth = 0.8;
    for (let i = 0; i < 5; i++) {
      const x0 = rnd() * Wd, y0 = rnd() * Ht, a = (rnd() - 0.5) * 1.2, l = 8 + rnd() * 24;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * l, y0 + Math.sin(a) * l); g.stroke();
    }
    g.globalAlpha = 1;
    tex.needsUpdate = true;
  };
  draw();
  tex.userData.word = word; tex.userData.friend = friend;
  if (!_fontReady) { _waiting.add(draw); ensurePlateFont(); }
  return tex;
}

/**
 * Show the foe row (false) or the friend row (true) of a plate texture: an `offset.y` swap, nothing else.
 * @param {THREE.Texture} tex @param {boolean} friend
 */
export function setPlateRow(tex, friend) { if (tex) tex.offset.y = friend ? PLATE.friendOffset : PLATE.foeOffset; }

/** Decal material: WarmToon with the word map, alpha-tested, depth-offset (one per texture; same program). */
function decalMaterial(tex) {
  const m = makeToonMaterial({ map: tex, alphaTest: 0.3, kind: 'plain' });
  m.polygonOffset = true; m.polygonOffsetFactor = -2;
  return m;
}

/** Plate tones (warm toy tin; ART §2.6: nothing in an enemy darker than luma 0.12). */
const TONES = Object.freeze({
  rusty: { base: '#A39A90', rust: '#B07A52', trim: '#7A5A44', rivet: '#C9BCA6' },
  iron: { base: '#8E96A2', rust: '#9C8470', trim: '#6A5A50', rivet: '#C9D0D8' },
  black: { base: '#4A3A5E', rust: '#5D4A6E', trim: '#C2353B', rivet: '#9C88B4' },
});

/**
 * A breastplate with a word, built in a unit frame: width 1, centre at the origin, front facing +Z, curved about the Y
 * axis (radius `curve` in widths). Scale it to the body. `group.userData.flip(on)` shows the friend word.
 * @param {string} word
 * @param {{seed?: number, style?: 'rusty'|'iron'|'black', curve?: number, height?: number, trim?: string, friend?: string|null}} [o]
 */
export function buildPlate(word = 'GRUMP', o = {}) {
  const group = new THREE.Group(); group.name = 'plate:' + word;
  const R = o.curve ?? 0.85, h = o.height ?? 0.72, span = 1.0 / R; // arc length 1 → angle
  const style = o.style || 'rusty', T = TONES[style] ?? TONES.rusty;
  const base = rgb(T.base), rust = rgb(T.rust), trim = rgb(o.trim ?? T.trim);
  const bulge = (geo) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / h, x = p.getX(i);
      p.setZ(i, p.getZ(i) + (1 - (2 * y) ** 2) * 0.06 * Math.cos(x * 2.5));
    }
    geo.computeVertexNormals();
  };
  const gb = new GeoBuilder();
  const plate = new THREE.CylinderGeometry(R, R * 1.06, h, 24, 6, true, -span / 2, span);
  plate.translate(0, 0, -R);
  bulge(plate);
  const rustCol = (v) => mixRgb(base, rust, smoothstep(0.5, 0.72, fbm3(v.x * 6 + (o.seed ?? 1), v.y * 6, v.z * 6, 3)) * (style === 'rusty' ? 0.6 : 0.25));
  gb.add(plate, { color: rustCol, rmse: style === 'black' ? [0.45, 0.5, 0.4, 0] : [0.62, 0.6, 0.4, 0] });
  const inner = plate.clone(); const ii = inner.index.array;
  for (let i = 0; i < ii.length; i += 3) { const t = ii[i + 1]; ii[i + 1] = ii[i + 2]; ii[i + 2] = t; }
  gb.add(inner, { color: mixRgb(base, [0, 0, 0], 0.45), rmse: [0.8, 0, 0, 0] });
  for (const yy of [h / 2, -h / 2]) {
    const rim = new THREE.TorusGeometry(R * (yy > 0 ? 1.0 : 1.06), 0.022, 6, 24, span);
    gb.add(rim, { matrix: mat([0, yy, -R * (yy > 0 ? 1.0 : 1.06)], [Math.PI / 2, 0, Math.PI / 2 - span / 2]), color: trim, rmse: [0.5, 0.3, 0.3, 0] });
  }
  for (let i = 0; i < 4; i++) {
    const a = -span / 2 + 0.08 + (i / 3) * (span - 0.16);
    for (const yy of [h * 0.42, -h * 0.42]) gb.add(new THREE.SphereGeometry(0.026, 8, 6), { matrix: mat([Math.sin(a) * R * 1.02, yy, Math.cos(a) * R * 1.02 - R]), color: rgb(T.rivet), rmse: [0.45, 0.8, 0, 0] });
  }
  const plateMesh = new THREE.Mesh(gb.build(), kitMaterial('plain'));
  plateMesh.castShadow = false; plateMesh.name = 'plateBody';
  group.add(plateMesh);
  if (word) {
    const friend = o.friend === undefined ? friendWordFor(word) : o.friend;
    const ink = style === 'black' ? PLATE.inkOnBlack : undefined;
    const tex = makePlateTexture(word, { seed: o.seed, ink, friend });
    // the decal patch spans only the word area (UV 0..1 exactly: the hidden row can never bleed in)
    const textW = span * 0.86, textH = h * 0.62;
    const rAt = (y) => R * (1 + 0.06 * (0.5 - y / h));   // the plate's taper (R at the top, 1.06 R at the bottom)
    const dg = new THREE.CylinderGeometry(rAt(0.02 + textH / 2), rAt(0.02 - textH / 2), textH, 16, 4, true, -textW / 2, textW);
    dg.translate(0, 0.02, -R);
    bulge(dg);
    const dp = dg.attributes.position, dn = dg.attributes.normal;
    for (let i = 0; i < dp.count; i++) dp.setXYZ(i, dp.getX(i) + dn.getX(i) * 0.007, dp.getY(i) + dn.getY(i) * 0.007, dp.getZ(i) + dn.getZ(i) * 0.007);
    const decal = new THREE.Mesh(dg, decalMaterial(tex));
    decal.name = 'plateWord'; decal.renderOrder = 1; decal.castShadow = false;
    group.add(decal);
    group.userData.texture = tex;
    group.userData.friend = friend;
    group.userData.flipped = false;
    /** Show the friend word (true) or the foe word (false). Returns false when this plate has no friend word. */
    group.userData.flip = (on = true) => {
      if (on && !friend) return false;
      setPlateRow(tex, !!on); group.userData.flipped = !!on;
      return true;
    };
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
 * @param {{bodyNode?: string, bone?: string, seed?: number, style?: string, scale?: number, offset?: number[], friend?: string|null}} [o]
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
    cy = (box.min.y + box.max.y) * 0.5 + (box.max.y - box.min.y) * 0.12;
  }
  const s = width * (o.scale ?? 1);
  plate.scale.setScalar(s);
  plate.position.set(0, cy, front + 0.01 * s);
  if (o.offset) plate.position.add(new THREE.Vector3(...o.offset));
  bone.add(plate);
  return plate;
}
