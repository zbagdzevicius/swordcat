// src/fx/ShieldBubble.js  (owner: fx) — TT6: the Pink Paw shield the player can SEE.
//
// While Clem holds her guard ("the Stand") a pink heater shield with a cream paw print floats in front of her chest,
// inside a soft pink bubble that covers her guard arc (±70°, ±90° on touch). It is the very icon the HUD, the touch
// button and the input glyphs draw (ui/icons.js pawShield), rasterised once per state into a canvas texture, so
// "[icon] Shield" in a prompt points at something on screen.
//   up        pops in with a squash (0.12 s)
//   parry     gold rim while the parry window is open (the fresh press)
//   block     a ripple: the shield punches out and the bubble flashes
//   cracks    one crack per Grit point lost
//   lockout   grey and dim (a whiffed tap, 0.3 s)
//   break     shatters into pink hearts and petals, then is gone for the stagger
//   parry hit a gold flash and a gold paw ring
// The parry cue: while a parry-able foe winds up, a gold shield with a pink "!" (icons.alertShield, unlike her pink one)
// floats well over its head (small), and pops big with a halo at the "ting" 0.25 s before the strike (Telegraphs pushes the cue; constant screen size, drawn on top).
// Cost: 2 draws while guarding (shield sprite + bubble sprite), 1 per cue sprite while a cue shows; nothing otherwise.
// Sprites only (fog off, a map): no shader program of its own (PERF programs-per-level budget).
import * as THREE from 'three';
import { pawShield, alertShield } from '../ui/icons.js';
import { actorWorldPos } from './util.js';

/** Tunables (pure data; tests read them). */
export const SHIELD_FX = Object.freeze({
  size: 0.74,            // shield sprite height (m)
  ahead: 0.42,           // in front of her chest (m)
  chest: 0.58,           // × her height
  bubbleR: 0.78,         // bubble radius (m)
  bubbleOpacity: 0.34,
  popIn: 0.12,           // s
  ripple: 0.22,          // s
  cuePx: 34,             // parry cue height (CSS px) over a winding-up foe
  cuePopPx: 58,          // ... at the ting
  cueLift: 0.55,         // m over the head
  cueLiftPx: 30,         // CSS px further up the screen (it sat on Clem's own shield when she stood behind the foe)
  cueMax: 4,
});

/**
 * The look of the in-world shield for a guard state. Pure (unit-tested). `s`: { guarding, parryOpen, lockout, grit,
 * gritMax, broken }. → { visible, state: 'ready'|'active'|'parry'|'lockout'|'broken', cracks 0..2, tint }.
 */
export function shieldLook(s) {
  const max = s?.gritMax ?? 3, g = Math.max(0, s?.grit ?? max);
  const broken = !!s?.broken || g <= 0;
  const cracks = Math.max(0, Math.min(2, max - g));
  if (broken) return { visible: false, state: 'broken', cracks: 2 };
  if (!s?.guarding) return { visible: false, state: s?.lockout ? 'lockout' : 'ready', cracks };
  if (s.lockout) return { visible: true, state: 'lockout', cracks };
  return { visible: true, state: s.parryOpen ? 'parry' : 'active', cracks };
}

/** Back-out ease (pop with a small overshoot). */
const backOut = (k) => { const c = 1.70158, x = Math.min(1, Math.max(0, k)) - 1; return 1 + (c + 1) * x ** 3 + c * x ** 2; };

/** A soft pink bubble (a billboard: a clear middle, a glowing rim). Sprites only: no new shader program (PERF budget). */
function bubbleTexture() {
  if (typeof document === 'undefined') return null;
  const n = 128, cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const c = cv.getContext('2d');
  if (!c) return null;
  const g = c.createRadialGradient(n / 2, n / 2, n * 0.18, n / 2, n / 2, n / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.68, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.9, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, n, n);
  c.fillStyle = 'rgba(255,255,255,0.9)';                     // a little highlight
  c.beginPath(); c.ellipse(n * 0.34, n * 0.28, n * 0.08, n * 0.045, -0.6, 0, Math.PI * 2); c.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ShieldBubble {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = false; this.sprite = null; this.bubble = null;
    /** state-key → { tex, ready } (lazily rasterised paw-shield icons) */
    this.tex = new Map();
    this.t = 0; this.wasOn = false; this.popT = 1; this.rippleT = 1; this.flashT = 1; this.goldT = 1; this.goldBig = 0.3;
    /** parry cues pushed by Telegraphs this frame */
    this.cues = [];
    this._nCues = 0;
    this.cueSprites = [];
    /** what the last frame showed (tests / smoke read it) */
    this.shown = { visible: false, state: 'ready', cracks: 0, cues: 0 };
    this.counts = { ups: 0, blocks: 0, parries: 0, breaks: 0, cues: 0 };
  }

  init(scene) {
    if (!scene) return;
    this.group = true;     // bubble + sprite are scene children (FX warm-up shows them one by one)
    // drawn over a foe standing in front of her (her own shield must never hide behind Sir Wobble)
    const sm = new THREE.SpriteMaterial({ map: null, transparent: true, depthTest: false, depthWrite: false, fog: false });
    this.sprite = new THREE.Sprite(sm);
    this.sprite.name = 'fx:pawShield'; this.sprite.visible = false;
    this.sprite.renderOrder = 8;            // over the parry / block particles (7): the gold shield stays visible
    this.sprite.center.set(0.5, 0.45);
    // the same sprite program as the shield (fog off, a map): the bubble adds no shader program
    this.bubbleMat = new THREE.SpriteMaterial({ map: bubbleTexture(), color: new THREE.Color('#FF8FB1'), transparent: true, depthWrite: false, fog: false });
    this.bubble = new THREE.Sprite(this.bubbleMat);
    this.bubble.name = 'fx:shieldBubble'; this.bubble.visible = false;
    this.bubble.renderOrder = 5;
    scene.add(this.bubble, this.sprite);
    // the parry cue sprites (over a winding-up foe): constant screen size, on top
    for (let i = 0; i < SHIELD_FX.cueMax; i++) {
      const m = new THREE.SpriteMaterial({ map: null, transparent: true, depthTest: false, depthWrite: false, fog: false });
      const s = new THREE.Sprite(m);
      s.name = 'fx:parryCue'; s.visible = false; s.renderOrder = 20; s.center.set(0.5, 0);
      scene.add(s);
      this.cueSprites.push(s);
    }
    // warm the common looks (the image decode is async; the first guard is rarely in the first 100 ms)
    for (const k of ['active|0', 'parry|0', 'cue|0', 'cueGold|0']) this._texFor(k);
  }

  /** The paw-shield texture for 'state|cracks' (cue / cueGold = the parry cue looks). */
  _texFor(key) {
    let e = this.tex.get(key);
    if (e) return e;
    e = { tex: null, ready: false };
    this.tex.set(key, e);
    if (typeof document === 'undefined' || typeof Image === 'undefined') return e;
    const [st, cr] = key.split('|');
    const cue = st === 'cue' || st === 'cueGold';
    const W = 120, H = 140;
    // the cue is the gold "!" shield (icons.alertShield), never Clem's pink one
    const svg = (cue ? alertShield({ pop: st === 'cueGold' }) : pawShield(st, { cracks: +cr || 0 }))
      .replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" `);
    const cv = document.createElement('canvas');
    cv.width = W + 16; cv.height = H + 16;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 2;
    e.tex = tex;
    const img = new Image();
    img.onload = () => {
      const c2 = cv.getContext('2d');
      if (!c2) return;
      // a soft glow behind it so it reads on grass and on dark floors
      c2.shadowColor = st === 'parry' || st === 'cueGold' ? 'rgba(255,211,77,.95)' : 'rgba(255,255,255,.9)';
      c2.shadowBlur = 10;
      c2.drawImage(img, 8, 8, W, H);
      tex.needsUpdate = true; e.ready = true;
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return e;
  }

  /** A blow landed on her shield (combat:hit blocked, her the target). */
  block() { this.rippleT = 0; this.flashT = 0; this.counts.blocks++; }
  /** She parried: a gold flash on the shield. */
  parry(perfect = false) { this.goldT = 0; this.flashT = 0; this.goldBig = perfect ? 0.55 : 0.3; this.counts.parries++; }
  /** Grit ran out: the shield shatters (FX draws the hearts and petals). */
  shatter() { this.counts.breaks++; this.popT = 1; this.wasOn = false; }

  /** Telegraphs: called before telegraphs.render(). */
  beginCues() { this._nCues = 0; }
  /** Telegraphs: one parry cue this frame at (x, y, z) world (over the foe's head); `k` 0..1 = the pop at the ting. */
  pushCue(x, y, z, k, gold = false, alpha = 1) {
    if (this._nCues >= SHIELD_FX.cueMax) return;
    let c = this.cues[this._nCues];
    if (!c) { c = { x: 0, y: 0, z: 0, k: 0, gold: false, alpha: 1 }; this.cues[this._nCues] = c; }
    c.x = x; c.y = y; c.z = z; c.k = k; c.gold = gold; c.alpha = alpha;
    this._nCues++;
  }

  render(dt) {
    if (!this.group) return;
    const ctx = this.ctx, pl = ctx.player;
    this.t += dt;
    this.popT = Math.min(1, this.popT + dt / SHIELD_FX.popIn);
    this.rippleT = Math.min(1, this.rippleT + dt / SHIELD_FX.ripple);
    this.flashT = Math.min(1, this.flashT + dt / 0.25);
    this.goldT = Math.min(1, this.goldT + dt / 0.35);
    const gs = pl?.guardState;
    const on = !!pl && pl.alive !== false && pl.object3d?.visible !== false && pl.state === 'guard' && !!gs?.guarding;
    const look = shieldLook({
      guarding: on, parryOpen: !!gs && gs.parryT <= gs.parryWindow && !(gs.lockoutT > 0), lockout: (gs?.lockoutT ?? 0) > 0,
      grit: pl?.grit, gritMax: pl?.gritMax,
    });
    if (on && !this.wasOn) { this.popT = 0; this.counts.ups++; }
    this.wasOn = on;
    this.bubble.visible = look.visible; this.sprite.visible = look.visible;
    const sh = this.shown;
    sh.visible = look.visible; sh.state = look.state; sh.cracks = look.cracks;
    if (look.visible) {
      actorWorldPos(pl, _p);
      const f = pl.object3d?.rotation?.y ?? pl.facing ?? 0;
      const h = (pl.height ?? 1) * (pl.object3d?.scale?.y ?? 1);
      // the bubble sits a little toward her guard side (wider on touch, where the guard arc is ±90°)
      const lean = 0.1 * Math.min(1.5, (gs?.arc ?? 1.22) / 1.22);
      this.bubble.position.set(_p.x + Math.sin(f) * lean, _p.y + h * 0.48, _p.z + Math.cos(f) * lean);
      const pop = backOut(this.popT);
      const rip = this.rippleT < 1 ? Math.sin(this.rippleT * Math.PI) : 0;
      const gold = this.goldT < 1 ? 1 - this.goldT : 0;
      // squash in: wide then tall
      // (TT6 fix round: a stronger block punch, a bigger gold pop on a perfect parry)
      const sx = pop * (1 + 0.18 * (1 - this.popT)) * (1 + 0.3 * rip + this.goldBig * gold);
      const sy = pop * (1 - 0.12 * (1 - this.popT)) * (1 + 0.3 * rip + this.goldBig * gold);
      const bob = 0.02 * Math.sin(this.t * 5);
      const ah = SHIELD_FX.ahead + 0.16 * rip;
      this.sprite.position.set(_p.x + Math.sin(f) * ah, _p.y + h * SHIELD_FX.chest + bob, _p.z + Math.cos(f) * ah);
      this.sprite.scale.set(SHIELD_FX.size * (120 / 140) * 1.12 * sx, SHIELD_FX.size * 1.12 * sy, 1);
      const key = `${gold > 0 ? 'parry' : look.state}|${look.cracks}`;
      const e = this._texFor(key);
      const ready = e.ready ? e : this._texFor(`active|0`);
      if (this.sprite.material.map !== ready.tex) { this.sprite.material.map = ready.tex; this.sprite.material.needsUpdate = true; }
      this.sprite.material.opacity = ready.ready ? (look.state === 'lockout' ? 0.6 : 0.97) : 0;
      this.bubble.scale.setScalar(2 * SHIELD_FX.bubbleR * pop * (1 + 0.14 * rip));
      const BM = this.bubbleMat, fl = this.flashT < 1 ? 1 - this.flashT : 0;
      BM.color.set(gold > 0 || look.state === 'parry' ? '#FFD34D' : look.state === 'lockout' ? '#C9C2C6' : '#FF8FB1');
      if (fl > 0) BM.color.lerp(_white, 0.5 * fl);
      BM.opacity = Math.min(0.95, SHIELD_FX.bubbleOpacity * 1.9 * (look.state === 'lockout' ? 0.5 : 1) + 0.4 * fl);
    }
    this._renderCues();
  }

  _renderCues() {
    const cam = this.ctx.camera, n = this._nCues;
    const H = this.ctx.renderer?.domElement?.clientHeight || (typeof innerHeight === 'number' ? innerHeight : 720);
    for (let i = 0; i < this.cueSprites.length; i++) {
      const s = this.cueSprites[i];
      if (i >= n || !cam) { s.visible = false; continue; }
      const c = this.cues[i];
      const e = this._texFor(c.gold || c.k > 0 ? 'cueGold|0' : 'cue|0');
      if (!e.ready) { s.visible = false; continue; }
      if (s.material.map !== e.tex) { s.material.map = e.tex; s.material.needsUpdate = true; }
      const px = SHIELD_FX.cuePx + (SHIELD_FX.cuePopPx - SHIELD_FX.cuePx) * backOut(c.k);
      // sizeAttenuation off: a constant screen size (perspective: NDC height = scale / tan(fov / 2); ortho: frustum)
      // a constant screen size with the shared (attenuated) sprite program: world height = px × metres per px at
      // the cue's view depth (perspective) or the frustum height (ortho)
      cam.updateMatrixWorld?.();
      const depth = Math.max(0.1, -_v.set(c.x, c.y, c.z).applyMatrix4(cam.matrixWorldInverse).z);
      const k = cam.isPerspectiveCamera ? (2 * depth * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / H
        : cam.isOrthographicCamera ? (cam.top - cam.bottom) / (cam.zoom || 1) / H : 2 / H;
      const hgt = px * 1.12 * k;
      s.scale.set(hgt * (136 / 156), hgt, 1);
      // lifted along the camera's up axis by a constant number of screen px
      _up.setFromMatrixColumn(cam.matrixWorld, 1).multiplyScalar(SHIELD_FX.cueLiftPx * k);
      s.position.set(c.x + _up.x, c.y + _up.y, c.z + _up.z);
      s.material.opacity = Math.max(0, Math.min(1, c.alpha));
      s.visible = true;
    }
    this.shown.cues = n;
    if (n) this.counts.cues++;
  }

  clear() {
    if (this.bubble) { this.bubble.visible = false; this.sprite.visible = false; }
    this.wasOn = false; this._nCues = 0;
    for (const s of this.cueSprites) s.visible = false;
  }

  dispose() {
    this.bubble?.parent?.remove(this.bubble); this.sprite?.parent?.remove(this.sprite);
    for (const s of this.cueSprites) { s.parent?.remove(s); s.material.dispose(); }
    this.bubbleMat?.map?.dispose(); this.bubbleMat?.dispose(); this.sprite?.material.dispose();
    for (const e of this.tex.values()) e.tex?.dispose();
    this.tex.clear();
  }
}

const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3();
const _white = new THREE.Color('#FFFFFF');
