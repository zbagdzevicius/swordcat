// src/companions/Bubble.js  (owner: companions) — world-space speech bubbles (§6: "a small speech bubble over the
// speaker for 1.6 s") and the napping "zzz" (§9.1), as screen-sized sprites with CanvasTexture text.
// Parchment + ink look per art.md §13 (cute medieval parchment, pink accent). No DOM at import: canvases are
// created on first use and the whole thing is a no-op where `document` is missing (node unit tests).
import * as THREE from 'three';
import { easeOutBack, clamp01 } from '../core/math.js';

const HAS_DOM = () => typeof document !== 'undefined' && typeof document.createElement === 'function';
const FONT = '"Fredoka", "Trebuchet MS", "Segoe UI", sans-serif';
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
  constructor({ kind = 'bubble', y = 1.2, scale = 0.06 } = {}) {
    this.kind = kind; this.y = y; this.baseScale = scale;
    this.object = new THREE.Group(); this.object.name = 'bubble:' + kind;
    this.object.position.y = y;
    this.t = 0; this.dur = 0; this.on = false; this.text = '';
    this.sprite = null; this.canvas = null; this.tex = null; this.aspect = 1;
    if (!HAS_DOM()) return;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512; this.canvas.height = kind === 'zzz' ? 256 : 256;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    const mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false, sizeAttenuation: false });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.center.set(0.5, 0);
    this.sprite.renderOrder = 999;
    this.sprite.visible = false;
    this.object.add(this.sprite);
  }

  /** Show `text` for `dur` seconds (Infinity = until hide()). */
  show(text, dur = 1.6) {
    this.on = true; this.t = 0; this.dur = dur;
    if (this.sprite && text !== this.text) this._draw(text);
    this.text = text;
    if (this.sprite) this.sprite.visible = true;
  }

  hide() { this.on = false; this.t = 0; if (this.sprite) this.sprite.visible = false; }

  get visible() { return this.on; }

  _draw(text) {
    const c = this.canvas, g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    if (this.kind === 'zzz') {
      g.font = `700 88px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = 'rgba(59,42,32,0.85)'; g.fillStyle = '#EAF2FF';
      const parts = [['z', 40, 220, 64], ['Z', 150, 160, 88], ['z', 280, 96, 64]];
      for (const [s, x, y, size] of parts) { g.font = `700 ${size}px ${FONT}`; g.strokeText(s, x, y); g.fillText(s, x, y); }
      this.aspect = c.width / c.height;
    } else {
      const lines = wrapText(text, 24, 3);
      const fs = 40, lh = 48, padX = 26, padY = 18, tail = 26;
      g.font = `600 ${fs}px ${FONT}`;
      let w = 0; for (const l of lines) w = Math.max(w, g.measureText(l).width);
      const bw = Math.min(c.width - 8, Math.ceil(w + padX * 2)), bh = lines.length * lh + padY * 2;
      c.height = Math.min(512, bh + tail + 8);                  // resizing clears the canvas
      g.font = `600 ${fs}px ${FONT}`;
      const x = (c.width - bw) / 2, y = 4;
      g.fillStyle = 'rgba(40,28,20,0.25)'; roundRect(g, x + 4, y + 6, bw, bh, 22); g.fill();
      g.fillStyle = PAPER; g.strokeStyle = INK; g.lineWidth = 5;
      roundRect(g, x, y, bw, bh, 22); g.fill();
      // tail
      g.beginPath(); g.moveTo(c.width / 2 - 16, y + bh - 3); g.lineTo(c.width / 2, y + bh + tail); g.lineTo(c.width / 2 + 16, y + bh - 3); g.closePath(); g.fill();
      roundRect(g, x, y, bw, bh, 22); g.stroke();
      g.beginPath(); g.moveTo(c.width / 2 - 16, y + bh); g.lineTo(c.width / 2, y + bh + tail); g.lineTo(c.width / 2 + 16, y + bh); g.stroke();
      g.fillStyle = PAPER; g.fillRect(c.width / 2 - 13, y + bh - 6, 26, 7);
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
