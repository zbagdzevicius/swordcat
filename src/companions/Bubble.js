// src/companions/Bubble.js  (owner: companions) — world-space speech bubbles (§6: "a small speech bubble over the
// speaker for 1.6 s") and the napping "zzz" (§9.1), as screen-sized sprites with CanvasTexture text.
// Parchment + ink look per art.md §13 (cute medieval parchment, pink accent). No DOM at import: canvases are
// created on first use and the whole thing is a no-op where `document` is missing (node unit tests).
// TOKENTAILS-PLAN §10.2.9: a bubble whose speaker is off screen (or behind the lens) is pinned to the screen edge on
// the speaker's side (where the guide's coin arrow points), `pinned` true; the tail then points at that edge.
import * as THREE from 'three';
import { easeOutBack, clamp01 } from '../core/math.js';

const HAS_DOM = () => typeof document !== 'undefined' && typeof document.createElement === 'function';
// TOKENTAILS-PLAN §10.4 (G1): Token Tails' Nunito (700 text, 800 zzz) on the canvas, rounded system faces until it loads
const FONT = '"Nunito", "Segoe UI Rounded", "SF Pro Rounded", "Trebuchet MS", "Segoe UI", sans-serif';
export const BUBBLE_FONT = FONT;
export const BUBBLE_WEIGHT = Object.freeze({ text: 700, zzz: 800 });
const INK = '#3B2A20', PAPER = '#F7EFDD', PAPER_EDGE = '#E2D2B0', PINK = '#F2A2B8';

/** Word-wrap `text` to at most `maxChars` per line (3 lines max, ellipsis after). */
export function wrapText(text, maxChars = 24, maxLines = 3) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\W*$/, '') + '…'; }
  return lines.length ? lines : [''];
}

/** Screen-edge margin for speech bubbles, in CSS px (review r2: barks were clipped by the screen edge). */
export const BUBBLE_MARGIN_PX = 16;

/**
 * The HUD's safe insets (CSS px from each canvas edge, plus the canvas size they were measured against: {top, bottom,
 * w, h}) — `ctx.ui.safeInsets` (UI._measureSafe: the ability bar at the bottom, the boss plate at the top). Bubbles are
 * kept clear of them so an iso-view bark near the bottom edge never slides under the ability bar. Set once by the
 * CompanionManager (every TextSprite — companions, NPCs, story/enemy barks — shares it); null = screen margins only.
 * @type {null | (() => ({top?: number, bottom?: number, h?: number} | null | undefined))}
 */
let safeInsetsOf = null;
/** @param {null | (() => ({top?: number, bottom?: number, h?: number} | null | undefined))} fn */
export function setBubbleSafeInsets(fn) { safeInsetsOf = typeof fn === 'function' ? fn : null; }

/**
 * Pure clamp: how far (in NDC) to shift a bubble so its rect stays inside the screen minus a margin.
 * The rect is given relative to the anchor (the speaker's projected point): x from ax+l to ax+r, y from ay+b to ay+t.
 * A rect larger than the usable span is centred in it. Returns {dx, dy}.
 * @param {number} ax @param {number} ay @param {number} l @param {number} r @param {number} b @param {number} t
 * @param {number} mx margin in NDC x @param {number} my margin in NDC y
 * @param {number} [myLo] bottom margin in NDC (defaults to `my`; the HUD-safe bottom) @param {number} [myHi] top margin
 */
export function clampShift(ax, ay, l, r, b, t, mx, my, myLo = my, myHi = my) {
  const axis = (a, lo, hi, mLo, mHi) => {
    const min = -1 + mLo, max = 1 - mHi;
    if (hi - lo >= max - min) return (min + max) / 2 - (a + (lo + hi) / 2); // too big: centre it in the usable span
    if (a + lo < min) return min - (a + lo);
    if (a + hi > max) return max - (a + hi);
    return 0;
  };
  return { dx: axis(ax, l, r, mx, mx), dy: axis(ay, b, t, myLo, myHi) };
}

const _anchor = new THREE.Vector3();
const _size = new THREE.Vector2();
const _sx = new THREE.Vector3(), _sy = new THREE.Vector3();

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/**
 * One reusable text sprite (speech bubble or zzz). `object` is added under the speaker's object3d.
 */
export class TextSprite {
  /** @param {{kind?: 'bubble'|'zzz', y?: number, scale?: number}} [o] */
  constructor({ kind = 'bubble', y = 1.2, scale = kind === 'zzz' ? 0.05 : 0.125 } = {}) {
    this.kind = kind; this.y = y; this.baseScale = scale;
    this.object = new THREE.Group(); this.object.name = 'bubble:' + kind;
    this.object.position.y = y;
    this.t = 0; this.dur = 0; this.on = false; this.text = '';
    /** the speaker is off screen: the bubble is pinned to the screen edge (§10.2.9) */
    this.pinned = false;
    this.sprite = null; this.canvas = null; this.tex = null; this.aspect = 1;
    if (!HAS_DOM()) return;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512; this.canvas.height = kind === 'zzz' ? 256 : 256;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    // colour 0.85: the paper stays under the bloom threshold (RENDER.bloom 0.85), so the ink stays crisp
    const mat = new THREE.SpriteMaterial({ map: this.tex, color: new THREE.Color(0.85, 0.85, 0.85), transparent: true, depthTest: false,
      depthWrite: false, fog: false, toneMapped: false, sizeAttenuation: false });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.center.set(0.5, 0);
    this.sprite.renderOrder = 999;
    this.sprite.visible = false;
    /** tail tip x on the canvas (px) the texture was last drawn with; bubble body rect (canvas px) */
    this.tailX = 256; this.body = null;
    if (kind === 'bubble') this.sprite.onBeforeRender = (renderer, _scene, camera) => this._clampToScreen(renderer, camera);
    this.object.add(this.sprite);
  }

  /** Show `text` for `dur` seconds (Infinity = until hide()). */
  show(text, dur = 1.6) {
    this.on = true; this.t = 0; this.dur = dur;
    if (this.sprite && text !== this.text) { this.sprite.center.set(0.5, 0); this._draw(text, this.canvas.width / 2); }
    this.text = text;
    if (this.sprite) this.sprite.visible = true;
  }

  hide() { this.on = false; this.t = 0; if (this.sprite) this.sprite.visible = false; }

  get visible() { return this.on; }

  /**
   * Keep the bubble's body inside the viewport (BUBBLE_MARGIN_PX) and off the HUD (setBubbleSafeInsets) by sliding the sprite around its anchor
   * (sprite.center), and redraw the tail so its tip still sits on the speaker. Runs right before the sprite renders,
   * with the rendering camera, so it works for any camera/viewport. Exposed for tests.
   * @param {{getSize: (v: THREE.Vector2) => THREE.Vector2}} renderer @param {THREE.Camera} camera
   */
  _clampToScreen(renderer, camera) {
    const sp = this.sprite, body = this.body;
    if (!sp || !body || !camera?.projectionMatrix) return;
    renderer?.getSize?.(_size);
    const pw = _size.x > 0 ? _size.x : 1280, ph = _size.y > 0 ? _size.y : 720;
    _anchor.setFromMatrixPosition(sp.matrixWorld);
    _anchor.applyMatrix4(camera.matrixWorldInverse);
    const behind = camera.isPerspectiveCamera && _anchor.z >= 0;
    _anchor.applyMatrix4(camera.projectionMatrix);
    // behind the lens: mirror it so it pins to the edge on the speaker's side (a guide line must stay readable)
    if (behind) { _anchor.x = -_anchor.x * 4; _anchor.y = -_anchor.y * 4; if (Math.abs(_anchor.x) + Math.abs(_anchor.y) < 1e-3) _anchor.y = -2; }
    this.pinned = behind || Math.abs(_anchor.x) > 1 || Math.abs(_anchor.y) > 1;
    // sizeAttenuation:false sprite → its NDC size is worldScale × P00 / P11 regardless of depth
    const e = camera.projectionMatrix.elements;
    const W = _sx.setFromMatrixColumn(sp.matrixWorld, 0).length() * e[0];
    const H = _sy.setFromMatrixColumn(sp.matrixWorld, 1).length() * e[5];
    if (!(W > 0 && H > 0)) return;
    const cw = this.canvas.width, ch = this.canvas.height;
    // body rect relative to the anchor at the default centre (0.5, 0): x right, y up (the tail tip is the bottom)
    const l = (body.x / cw - 0.5) * W, r = ((body.x + body.w) / cw - 0.5) * W;
    const t = (1 - body.y / ch) * H, b = 0;
    // HUD-safe insets (CSS px of the canvas rect they were measured on → this viewport's px), on top of the margin
    let si = null;
    try { si = safeInsetsOf?.(); } catch { si = null; }
    const k = si?.h > 0 ? ph / si.h : 1;
    const insB = Math.min(ph * 0.45, Math.max(0, (si?.bottom ?? 0) * k)), insT = Math.min(ph * 0.45, Math.max(0, (si?.bubbleTop ?? si?.top ?? 0) * k));
    const { dx, dy } = clampShift(_anchor.x, _anchor.y, l, r, b, t, (BUBBLE_MARGIN_PX * 2) / pw, (BUBBLE_MARGIN_PX * 2) / ph,
      ((insB + BUBBLE_MARGIN_PX) * 2) / ph, ((insT + BUBBLE_MARGIN_PX) * 2) / ph);
    sp.center.set(0.5 - dx / W, -dy / H);
    // tail tip stays on the speaker (canvas u = center.x), kept inside the body's rounded corners
    const want = Math.round(Math.min(body.x + body.w - 34, Math.max(body.x + 34, sp.center.x * cw)) / 4) * 4;
    if (want !== this.tailX) this._draw(this.text, want);
  }

  _draw(text, tailX = this.canvas.width / 2) {
    const c = this.canvas, g = c?.getContext?.('2d');
    if (!g) return;
    // drawn before Nunito arrived (a fallback face): redraw once the document's fonts are ready
    const fonts = typeof document !== 'undefined' ? document.fonts : null;
    if (fonts && !this._fontWait && typeof fonts.check === 'function' && !fonts.check(`${BUBBLE_WEIGHT.text} 40px "Nunito"`)) {
      this._fontWait = true;
      Promise.resolve(fonts.ready).then(() => { if (this.canvas && this.text) this._draw(this.text, this.tailX); }).catch(() => {});
    }
    g.clearRect(0, 0, c.width, c.height);
    if (this.kind === 'zzz') {
      g.font = `${BUBBLE_WEIGHT.zzz} 88px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = 'rgba(59,42,32,0.85)'; g.fillStyle = '#EAF2FF';
      const parts = [['z', 40, 220, 64], ['Z', 150, 160, 88], ['z', 280, 96, 64]];
      for (const [s, x, y, size] of parts) { g.font = `${BUBBLE_WEIGHT.zzz} ${size}px ${FONT}`; g.strokeText(s, x, y); g.fillText(s, x, y); }
      this.aspect = c.width / c.height;
    } else {
      const lines = wrapText(text, 24, 3);
      const fs = 40, lh = 48, padX = 26, padY = 18, tail = 26;
      g.font = `${BUBBLE_WEIGHT.text} ${fs}px ${FONT}`;
      let w = 0; for (const l of lines) w = Math.max(w, g.measureText(l).width);
      const bw = Math.min(c.width - 8, Math.ceil(w + padX * 2)), bh = lines.length * lh + padY * 2;
      // fixed 512 × 256 canvas (a CanvasTexture can't change size once uploaded): the bubble sits on the bottom edge,
      // its tail tip at the sprite's anchor; 3 lines (bh 180 + tail) still fit
      const x = (c.width - bw) / 2, y = Math.max(4, c.height - 6 - tail - bh);
      const tx = Math.min(x + bw - 34, Math.max(x + 34, tailX));
      this.body = { x, y, w: bw, h: bh }; this.tailX = tailX;
      g.fillStyle = 'rgba(40,28,20,0.25)'; roundRect(g, x + 4, y + 6, bw, bh, 22); g.fill();
      g.fillStyle = PAPER; g.strokeStyle = INK; g.lineWidth = 5;
      roundRect(g, x, y, bw, bh, 22); g.fill();
      // tail
      g.beginPath(); g.moveTo(tx - 16, y + bh - 3); g.lineTo(tailX, y + bh + tail); g.lineTo(tx + 16, y + bh - 3); g.closePath(); g.fill();
      roundRect(g, x, y, bw, bh, 22); g.stroke();
      g.beginPath(); g.moveTo(tx - 16, y + bh); g.lineTo(tailX, y + bh + tail); g.lineTo(tx + 16, y + bh); g.stroke();
      g.fillStyle = PAPER; g.fillRect(tx - 13, y + bh - 6, 26, 7);
      g.strokeStyle = PAPER_EDGE; g.lineWidth = 2; roundRect(g, x + 7, y + 7, bw - 14, bh - 14, 16); g.stroke();
      g.fillStyle = PINK; g.beginPath(); g.arc(x + 14, y + 14, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
      lines.forEach((l, i) => g.fillText(l, c.width / 2, y + padY + lh * (i + 0.5)));
      this.aspect = c.width / c.height;
    }
    this.tex.needsUpdate = true;
  }

  /** Per rendered frame (visual only). */
  update(dt) {
    if (!this.on || !this.sprite) return;
    this.t += dt;
    if (this.t >= this.dur) { this.hide(); return; }
    const s = this.baseScale;
    if (this.kind === 'zzz') {
      const k = 0.75 + 0.25 * Math.sin(this.t * 2.2);
      this.sprite.scale.set(s * this.aspect * k, s * k, 1);
      this.sprite.position.y = 0.08 * Math.sin(this.t * 1.6);
      this.sprite.position.x = 0.12;
      this.sprite.material.opacity = 0.65 + 0.35 * Math.sin(this.t * 2.2 + 1);
    } else {
      const pop = easeOutBack(clamp01(this.t / 0.16));
      const fade = this.dur === Infinity ? 1 : clamp01((this.dur - this.t) / 0.25);
      this.sprite.scale.set(s * this.aspect * pop, s * pop, 1);
      this.sprite.material.opacity = fade;
    }
  }

  dispose() {
    this.object.removeFromParent();
    this.tex?.dispose(); this.sprite?.material.dispose();
    this.sprite = null; this.canvas = null;
  }
}
