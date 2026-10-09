// src/companions/Pudding.js  (owner: companions) — Pudding, the huge, nervous red dragon (GAME_DESIGN §3.6, CS-03).
// Model: creatures/monsters-flying/Dragon_Evolved.glb fitted to 6 m (MODEL_FIT), tinted `#E0503A`; clips S13
// (Flying_Idle, Fast_Flying, Headbutt, HitReact, Yes, No, Punch, Death). Modes:
//   idle    hovering Flying_Idle (cutscenes drive him through the ScriptedActor API)
//   netted  CS-03 end: crouched under a procedural rope net tethered to the 3 rope posts; a static collider r 2.5;
//           each cut rope (objective `net_ropes`) drops a tether and the net sags; flinches at nearby hits
//   free    ropes cut (flag `meadow.pudding` = true): the net falls, he sniffs her, nods (`Yes`), lifts off
//   perch   "hides" at the level's `pud_1..4` anchors (behind trees far smaller than he is); when she comes
//           within 12 m he flies (Fast_Flying, an arc over 6 m) to the next perch further along
//   sleep   CS-04 Lantern Night: the clamped last frame of `Death`, slow breathing (R16)
import * as THREE from 'three';
import { Actor } from '../core/Actor.js';
import { ScriptedActorMixin } from '../core/ScriptedActor.js';
import { Animator } from '../core/Animator.js';
import { E } from '../core/events.js';
import { damp, dampAngle, clamp01, easeInOutSine, lerp } from '../core/math.js';
import { visualDt } from '../characters/index.js';
import { disposeInstance } from '../core/Assets.js';

export const PUDDING_MODEL = 'models/creatures/monsters-flying/Dragon_Evolved.glb';
export const PUDDING = {
  tint: '#E0503A', red: [8, 0.72], radius: 2.5, height: 3.5,
  /** CS-03 net (meadow glade): Pudding at (2,24), rope posts at (−2,24), (6,24), (2,28) (§12.3). */
  net: { at: [2, 24], facing: Math.PI, posts: [[-2, 24], [6, 24], [2, 28]], dome: [2.9, 2.5, 3.2] },
  /** Netted: hunched small under the dome (whole-model scale) with the wings folded in (Wing1 bone scale). */
  netted: { scale: 0.78, wing: 0.42 },
  perch: { anchors: ['pud_1', 'pud_2', 'pud_3', 'pud_4'], approach: 12, firstMin: 14, speed: 9, arc: 6, duck: 0.45 },
  free: { sniff: 1.6, nod: 1.2, lift: 1.4, lean: 0.55 },
};

const _v = new THREE.Vector3();

// ------------------------------------------------------------------ the red recolour (§3.6: red #E0503A)

/** RGB (0..255) → HSL (h in degrees, s, l in 0..1). */
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-6) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/**
 * Pudding's palette remap: the atlas cells in the purple / magenta / maroon family (his body and wings) move to the
 * design red (#E0503A, hue 8°) and get lighter, so he reads as a big friendly red dragon in the fog instead of the
 * near-black a plain colour multiply gives. Eyes, claws, horns and belly cells keep their colours. Pure.
 * @param {number} r @param {number} g @param {number} b 0..255 @returns {[number, number, number]} 0..255
 */
export function puddingRecolour(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
  const body = s > 0.18 && l > 0.06 && l < 0.75 && (h >= 280 || h <= 18);
  if (!body) return [r, g, b];
  const [th, ts] = PUDDING.red;
  const nl = Math.min(0.68, l * 1.15 + 0.16), ns = Math.max(ts, s);
  const c = new THREE.Color().setHSL(th / 360, ns, nl);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}

const _recoloured = new WeakMap();

/** Swap every material map under `root` for the recoloured atlas (cached per source texture). Browser only. */
function paintPudding(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m?.map) { m?.color?.set(PUDDING.tint); continue; }
      let tex = _recoloured.get(m.map);
      if (tex === undefined) { tex = recolourTexture(m.map); _recoloured.set(m.map, tex); }
      if (tex) { m.map = tex; m.color?.setRGB(1, 1, 1); } else m.color?.multiply(new THREE.Color(PUDDING.tint));
      m.needsUpdate = true;
    }
  });
}

function recolourTexture(src) {
  const img = src.image;
  if (typeof document === 'undefined' || !img?.width) return null;
  try {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const [r, gg, b] = puddingRecolour(px[i], px[i + 1], px[i + 2]);
      px[i] = r; px[i + 1] = gg; px[i + 2] = b;
    }
    g.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c);
    for (const k of ['flipY', 'colorSpace', 'magFilter', 'minFilter', 'wrapS', 'wrapT', 'generateMipmaps', 'anisotropy']) t[k] = src[k];
    t.channel = src.channel ?? 0;
    t.needsUpdate = true;
    return t;
  } catch (e) { console.warn('[pudding] recolour failed', e); return null; }
}

/** Build the rope net: a dome of meridians + rings (tubes) plus tether ropes to the posts. */
function buildNet(dome, tethers) {
  const g = new THREE.Group(); g.name = 'puddingNet';
  const mat = new THREE.MeshStandardMaterial({ color: '#8C6A4A', roughness: 0.95 });
  const [rx, ry, rz] = dome;
  const tubes = [];
  const pt = (u, v) => new THREE.Vector3(Math.cos(u) * Math.sin(v) * rx, Math.cos(v) * ry, Math.sin(u) * Math.sin(v) * rz);
  for (let i = 0; i < 14; i++) {
    const u = (i / 14) * Math.PI * 2, pts = [];
    for (let j = 0; j <= 10; j++) pts.push(pt(u, 0.08 + (j / 10) * (Math.PI / 2 - 0.08)));
    tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.035, 4, false));
  }
  for (let j = 1; j <= 5; j++) {
    const v = (j / 5.4) * (Math.PI / 2), pts = [];
    for (let i = 0; i <= 28; i++) pts.push(pt((i / 28) * Math.PI * 2, v));
    tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 56, 0.03, 4, true));
  }
  const domeMesh = new THREE.Group(); domeMesh.name = 'netDome';
  for (const t of tubes) { const m = new THREE.Mesh(t, mat); m.castShadow = true; domeMesh.add(m); }
  g.add(domeMesh);
  const ropes = [];
  for (const [x, z] of tethers) {
    const a = new THREE.Vector3(x * 0.55, 0.5, z * 0.55), b = new THREE.Vector3(x, 0.9, z);
    const mid = a.clone().lerp(b, 0.5); mid.y -= 0.25;
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 10, 0.04, 4, false), mat);
    m.castShadow = true; ropes.push(m); g.add(m);
  }
  return { group: g, dome: domeMesh, ropes, mat };
}

export class Pudding extends ScriptedActorMixin(Actor) {
  /** @param {any} ctx @param {{pos?: THREE.Vector3, facing?: number}} [o] */
  constructor(ctx, { pos, facing = 0 } = {}) {
    super(ctx, { faction: 'neutral', radius: PUDDING.radius, height: PUDDING.height, maxHp: 1, mass: 50 });
    this.tags.add('pudding'); this.tags.add('npc');
    this.npcId = 'pudding';
    this.hurtable = false; this.fixed = true;
    if (pos) this.pos.copy(pos);
    this.facing = facing;
    this.object3d.name = 'pudding';
    this.anim = null; this.model = null; this.net = null;
    this.mode = 'idle'; this.modeT = 0;
    this.ropesCut = 0; this.netDrop = -1;
    this.perchIndex = -1; this.flight = null;
    this.flinchT = 3 + (ctx.rng?.() ?? 0.5) * 6;
    this._pendingPose = null;
    this.snap();
  }

  get netted() { return this.mode === 'netted'; }

  async loadVisual() {
    try {
      const m = await this.ctx.assets.model(PUDDING_MODEL, { cloneMaterials: true, castShadow: true });
      if (this.disposed) return;
      paintPudding(m.root);
      this.model = m;
      this.object3d.add(m.root);
      this.anim = new Animator(m.scene, m.animations);
      this._applyModeClip();
    } catch (e) { console.error('[pudding] model failed', e); }
  }

  // ------------------------------------------------------------------ modes

  /** CS-03 end state: tangled in the hound net (static collider r 2.5 via `fixed`). */
  setNetted(on = true) {
    if (on) {
      this.mode = 'netted'; this.modeT = 0;
      if (!this.net) this._buildNet();
      this._updateRopes();
    } else if (this.net) { this.netDrop = 0; }
    this._applyModeClip();
  }

  /** The net over him, tethered to the 3 rope posts (world positions, §12.3). */
  _buildNet() {
    if (!this.ctx.scene) return;
    const off = PUDDING.net.posts.map(([x, z]) => [x - this.pos.x, z - this.pos.z]);
    this.net = buildNet(PUDDING.net.dome, off);
    this.net.group.position.copy(this.pos);
    this.ctx.scene.add(this.net.group);
  }

  /** Keep the net on him if a cutscene moved him after netting him (the CS-03 `end` sets pose and position). */
  _syncNet() {
    const n = this.net;
    if (!n || this.netDrop >= 0 || this.mode !== 'netted') return;
    if (Math.hypot(n.group.position.x - this.pos.x, n.group.position.z - this.pos.z) < 0.25) { n.group.position.y = this.pos.y; return; }
    this._disposeNet();
    this._buildNet();
    this._updateRopes();
  }

  /** A rope post was cut (objective progress): drop that tether, the net sags, he flinches. */
  setRopesCut(n) {
    if (n === this.ropesCut) return;
    this.ropesCut = n;
    this._updateRopes();
    if (this.mode === 'netted') { if (this.anim) this._once('HitReact'); this.sound('puddingRoar', { vol: 0.45 }); }
  }

  _updateRopes() {
    if (!this.net) return;
    this.net.ropes.forEach((r, i) => { r.visible = i >= this.ropesCut; });
    const sag = 1 - 0.12 * this.ropesCut;
    this.net.dome.scale.set(1 + 0.05 * this.ropesCut, sag, 1 + 0.05 * this.ropesCut);
  }

  /** The ropes are cut: net falls, sniff, nod, lift off, then perch along the level. */
  free() {
    if (this.mode === 'free' || this.mode === 'perch' || this.mode === 'fly') return;
    this.setNetted(false);
    this.mode = 'free'; this.modeT = 0; this._freeStep = 0;
    this._applyModeClip();
  }

  /** Perch at the best `pud_*` anchor for where she is now (level reload after the rescue). */
  perchNow() {
    const i = this._firstPerch();
    if (i < 0) return false;
    const a = this.ctx.levels.anchor(PUDDING.perch.anchors[i]);
    this.perchIndex = i;
    this.pos.set(a.pos.x, this.ctx.physics?.heightAt?.(a.pos.x, a.pos.z) ?? 0, a.pos.z);
    this.mode = 'perch'; this.modeT = 0;
    this._facePlayer(0);
    this.snap();
    this._applyModeClip();
    return true;
  }

  sleep() { this.mode = 'sleep'; this.modeT = 0; this._applyModeClip(); }

  /** Nervous roar (Headbutt lunge + camera shake + the roar). */
  roar(trauma = 0.5) {
    if (this.anim) this._once('Headbutt');
    this.ctx.bus.emit(E.SHAKE, { trauma });
    this.sound('puddingRoar');
  }

  /** A positional sound that follows him (audio ids: requests/audio.md). Gameplay only: cutscenes cue their own. */
  sound(id, opts) {
    if (this.scripted) return null;
    try { return this.ctx.audio?.play3D?.(id, this, opts) ?? null; } catch (e) { console.warn('[pudding] sound failed', e); return null; }
  }

  _firstPerch() {
    const names = PUDDING.perch.anchors, p = this.ctx.player;
    const pts = names.map((n) => this.ctx.levels?.anchor?.(n)?.pos ?? null);
    if (!pts.some(Boolean)) return -1;
    let near = 0, nd = Infinity;
    pts.forEach((q, i) => { if (q && p) { const d = Math.hypot(q.x - p.pos.x, q.z - p.pos.z); if (d < nd) { nd = d; near = i; } } });
    for (let i = near; i < pts.length; i++) if (pts[i] && (!p || Math.hypot(pts[i].x - p.pos.x, pts[i].z - p.pos.z) >= PUDDING.perch.firstMin)) return i;
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i]) return i;
    return -1;
  }

  _flyTo(index) {
    const a = this.ctx.levels?.anchor?.(PUDDING.perch.anchors[index]);
    if (!a?.pos) return false;
    const to = new THREE.Vector3(a.pos.x, this.ctx.physics?.heightAt?.(a.pos.x, a.pos.z) ?? 0, a.pos.z);
    const d = Math.hypot(to.x - this.pos.x, to.z - this.pos.z);
    this.flight = { from: this.pos.clone(), to, t: 0, dur: Math.max(1.6, d / PUDDING.perch.speed + 0.8), index };
    this.mode = 'fly'; this.modeT = 0; this.flying = true;
    this._applyModeClip();
    return true;
  }

  _facePlayer(dt) {
    const p = this.ctx.player;
    if (!p) return;
    const yaw = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    this.facing = dt > 0 ? dampAngle(this.facing, yaw, 1.5, dt) : yaw;
  }

  _applyModeClip() {
    const a = this.anim;
    if (!a) return;
    switch (this.mode) {
      case 'netted': a.play('Flying_Idle', { speed: 0.45, fade: 0.3 }); break;
      case 'sleep': {
        const clip = a.actions.Death?.getClip();
        if (clip) a.pose('Death', clip.duration - 1e-3); else a.play('Flying_Idle', { speed: 0.3 });
        break;
      }
      case 'fly': a.play('Fast_Flying', { fade: 0.25 }); break;
      case 'perch': a.play('Flying_Idle', { speed: 0.7, fade: 0.4 }); break;
      default: a.play('Flying_Idle', { fade: 0.3 }); break;
    }
  }

  _once(name, opts = {}) {
    const a = this.anim;
    if (!a?.has(name)) return Promise.resolve();
    const p = a.play(name, { once: true, fade: 0.15, ...opts });
    if (!opts.clampEnd) p.then(() => { if (!this.disposed && this.anim?.currentName === name) this._applyModeClip(); });
    return p;
  }

  // ------------------------------------------------------------------ ScriptedActor hooks

  onPose(name) {
    if (name === 'netted') this.setNetted(true);
    else if (name === 'sleep') this.sleep();
    else if (name === 'perch') this.perchNow();
    else { if (this.mode === 'netted' && name === 'free') this.free(); else if (this.mode !== 'netted') { this.mode = 'idle'; this._applyModeClip(); } }
  }
  onEmote(name) {
    if (name === 'nod') this._once('Yes');
    else if (name === 'shake') this._once('No');
    else if (name === 'tailPuff' || name === 'earsFlat') this._once('HitReact');
    else if (name === 'meow' || name === 'roar') this.roar(0.3);
  }
  playClip(clip, { once = false, speed = 1, clampEnd = false } = {}) {
    if (!this.anim) return Promise.resolve();
    if (once) return this._once(clip, { speed, clampEnd });
    this.anim.play(clip, { speed });
    return Promise.resolve();
  }
  onScripted(on) { if (on && this.mode === 'fly') { this.flight = null; this.mode = 'idle'; this.flying = false; this._applyModeClip(); } }

  // ------------------------------------------------------------------ fixed step

  update(dt) {
    if (!this.ctx.game.simActive(this)) return;
    this.modeT += dt;
    this._syncNet();
    if (this.scripted || this.attachedTo) {
      this.scriptedStep(dt);
      if (!this.attachedTo) this.ctx.physics.moveActor(this, dt);
      return;
    }
    const p = this.ctx.player;
    switch (this.mode) {
      case 'netted':
        this.vel.set(0, 0, 0);
        this.flinchT -= dt;
        if (this.flinchT <= 0) {                                       // nervous: flinches (and roars, which is always)
          this.flinchT = 5 + (this.ctx.rng?.() ?? 0.5) * 7;
          const r = this.ctx.rng?.() ?? 0.5;
          this._once(r < 0.5 ? 'HitReact' : 'No');
          if (r < 0.3) this.sound('puddingRoar', { vol: 0.35 });
        }
        break;
      case 'free': {
        this.vel.set(0, 0, 0);
        const F = PUDDING.free;
        this._facePlayer(dt);
        // sniff: lean down toward her and shuffle half a step closer (the purr is the audio's), then nod
        if (this._freeStep === 0 && this.modeT >= 0.3) {
          this._freeStep = 1;
          this.sound('cat/cat_purractive_loop', { rate: 0.6, vol: 0.9, dur: F.sniff + F.nod });
        }
        if (this._freeStep === 1 && p) {
          const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
          if (d > this.radius + 1.2) { this.pos.x += (dx / d) * 0.5 * dt; this.pos.z += (dz / d) * 0.5 * dt; }
        }
        if (this._freeStep === 1 && this.modeT >= F.sniff) { this._freeStep = 2; this._once('Yes'); }
        if (this._freeStep === 2 && this.modeT >= F.sniff + F.nod) {
          this._freeStep = 3;
          const i = this._firstPerch();
          if (i < 0 || !this._flyTo(i)) { this.mode = 'idle'; this._applyModeClip(); }
        }
        break;
      }
      case 'fly': {
        const f = this.flight;
        if (!f) { this.mode = 'idle'; break; }
        f.t += dt;
        const u = clamp01(f.t / f.dur), e = easeInOutSine(u);
        const gx = lerp(f.from.x, f.to.x, e), gz = lerp(f.from.z, f.to.z, e);
        const g = this.ctx.physics?.heightAt?.(gx, gz) ?? lerp(f.from.y, f.to.y, e);
        const yaw = Math.atan2(f.to.x - f.from.x, f.to.z - f.from.z);
        this.facing = dampAngle(this.facing, yaw, 4, dt);
        this.pos.set(gx, g + Math.sin(u * Math.PI) * PUDDING.perch.arc, gz);
        this.vel.set(0, 0, 0);
        if (u >= 1) {
          this.flight = null; this.flying = false; this.perchIndex = f.index;
          this.mode = 'perch'; this.modeT = 0; this.onGround = true;
          this._applyModeClip();
        }
        return;
      }
      case 'perch': {
        this.vel.set(0, 0, 0);
        this._facePlayer(dt);
        const d = p ? Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) : Infinity;
        if (d < PUDDING.perch.approach && this.modeT > 1.5) {
          const next = this.perchIndex + 1;
          if (next < PUDDING.perch.anchors.length && this.ctx.levels?.anchor?.(PUDDING.perch.anchors[next])) this._flyTo(next);
        }
        this.flinchT -= dt;
        if (this.flinchT <= 0) { this.flinchT = 7 + (this.ctx.rng?.() ?? 0.5) * 8; this._once('No'); }
        break;
      }
      default:
        this.vel.x = damp(this.vel.x, 0, 6, dt); this.vel.z = damp(this.vel.z, 0, 6, dt);
        break;
    }
    this.ctx.physics.moveActor(this, dt);
  }

  render(alpha, dt) {
    super.render(alpha);
    const vdt = visualDt(this.ctx, dt ?? 0);         // 0 in hitstop / the pause menu, × slow-mo
    this.anim?.update(vdt);
    if (this.model) {
      // netted: crouched low and squashed under the net; perch: ducking "behind" a tree half his size;
      // free: leaning down to sniff her; sleep: slow breathing
      const crouch = this.mode === 'netted' ? 1 : this.mode === 'perch' ? PUDDING.perch.duck
        : this.mode === 'free' && this._freeStep === 1 ? PUDDING.free.lean : 0;
      this._crouch = damp(this._crouch ?? crouch, crouch, 4, vdt);
      const fold = this.mode === 'netted' || (this.mode === 'free' && this._freeStep === 0) ? 1 : 0;   // unfolds as the net drops
      this._fold = damp(this._fold ?? fold, fold, 4, vdt);
      const breathe = this.mode === 'sleep' ? 1 + Math.sin(this.ctx.game.realTime * 1.3) * 0.015 : 1;
      const k = lerp(1, PUDDING.netted.scale, this._fold);
      this.model.root.scale.set((1 + 0.06 * this._crouch) * k, (1 - 0.22 * this._crouch) * breathe * k, (1 + 0.06 * this._crouch) * k);
      this.model.root.position.y = -0.35 * this._crouch * k;
      this._foldWings(lerp(1, PUDDING.netted.wing, this._fold));
    }
    if (this.net) {
      if (this.netDrop >= 0) {
        this.netDrop += vdt;
        const u = clamp01(this.netDrop / 0.8);
        this.net.dome.scale.y = Math.max(0.05, (1 - 0.12 * this.ropesCut) * (1 - u));
        this.net.group.position.y = this.pos.y - 0.2 * u;
        for (const r of this.net.ropes) r.visible = false;
        if (u >= 1) this._disposeNet();
      }
    }
  }

  /** Wings tucked in under the net: scale the wing roots (after the mixer, so it overrides this frame's pose). */
  _foldWings(w) {
    if (!this.model) return;
    if (!this._wings) {
      this._wings = [];
      this.model.root.traverse((o) => { if (o.isBone && /^Wing1\.?[LR]$/.test(o.name)) this._wings.push(o); });
    }
    if (w >= 0.999 && !this._wingsFolded) return;
    for (const b of this._wings) b.scale.setScalar(w);
    this._wingsFolded = w < 0.999;
  }

  _disposeNet() {
    if (!this.net) return;
    this.net.group.removeFromParent();
    this.net.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.net.mat.dispose();
    this.net = null;
  }

  dispose() {
    this.disposed = true;
    this._disposeNet();
    this.anim?.dispose();
    if (this.object3d) disposeInstance(this.object3d, { detach: false });   // bone texture + cloned materials
    super.dispose();
  }
}
