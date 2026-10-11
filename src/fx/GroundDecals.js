// src/fx/GroundDecals.js  (owner: fx) — research/CONTROLS_SPEC.md §3, §7.3, §7.4, §10.3 ground indicators for the iso
// controls, all in ONE instanced draw: the hero / aim ring (pink, with a notch along the aim), the Stand fan (silver,
// gold through the parry window), the charge reach (silver → gold Holy circle), the selection ring (gold, rotating; red
// during the target's wind-up), the hover ring (red enemy / gold interactable / white NPC), aggro rings under alerted
// enemies, order markers (pink paw ripple on a move, red / gold rings on attack / use, a grey ✕ when unreachable), the
// dots of the path being walked, the landing ring while she is airborne and the companion ability indicator when
// `ctx.companions.aim` is active (then `ctx.fx.drawsAbilityAim` is true and companions hide their fallback).
//
// Each decal is a flat quad hugging the ground (tilted to the terrain normal, lifted a few cm, polygon offset) with a
// per-instance colour and shape parameters; the fragment shader draws rings, discs, fans, dashes and crosses.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { PLAYER, ATTACKS, TELEGRAPH } from '../core/config.js';

const MAX = 96;
/** decal shapes (aParams.x) */
export const DECAL = Object.freeze({ RING: 0, DISC: 1, FAN: 2, CROSS: 3, DASH: 4, RECT: 5 });
export const DECAL_COLORS = Object.freeze({
  hero: '#F7A8C4', silver: '#E8EEF4', gold: '#FFD34D', red: '#FF6A3D', white: '#FFFFFF', grey: '#9AA0A6', green: '#9BE38B',
  move: '#F7A8C4', aggro: '#FF3B30',
});
const LIFT = 0.05;

const VERT = /* glsl */`
attribute vec4 aColor;
attribute vec4 aParams;
attribute vec4 aExtra;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vParams;
varying vec4 vExtra;
void main() {
  vUv = uv * 2.0 - 1.0;
  vColor = aColor; vParams = aParams; vExtra = aExtra;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vParams;   // x shape, y inner radius (0..1), z aa width, w notch / half-angle (rad)
varying vec4 vExtra;    // x dashes / fill, y rotation (rad), z fill alpha, w unused
uniform float uTime;
const float PI = 3.14159265;
float band(float r, float a, float b, float w) { return smoothstep(a - w, a + w, r) * (1.0 - smoothstep(b - w, b + w, r)); }
void main() {
  float r = length(vUv);
  if (r > 1.35) discard;
  float ang = atan(vUv.x, -vUv.y);             // 0 = local forward (+Z of the quad), counter-clockwise positive
  float shape = vParams.x, inner = vParams.y, aa = max(0.004, vParams.z);
  float a = 0.0;
  if (shape < 0.5) {                           // ring (+ optional notch: a small arrow tick pointing along the aim)
    a = band(r, inner, 1.0, aa);
    if (vParams.w > 0.0) {
      float t = 1.0 - smoothstep(vParams.w * 0.5, vParams.w * 0.5 + 0.06, abs(ang));
      float tip = band(r, 1.0, 1.0 + (1.0 - inner) * 2.6 * (1.0 - abs(ang) / max(0.01, vParams.w * 0.5)), aa);
      a = max(a, t * tip);
    }
    a = max(a, vExtra.z * (1.0 - smoothstep(inner - aa, inner, r)));
  } else if (shape < 1.5) {                    // soft disc
    a = 1.0 - smoothstep(inner, 1.0, r);
  } else if (shape < 2.5) {                    // fan: a rim arc ±w plus a faint fill
    float inside = 1.0 - smoothstep(vParams.w - 0.03, vParams.w + 0.03, abs(ang));
    a = inside * max(band(r, inner, 1.0, aa), vExtra.z * (1.0 - smoothstep(1.0 - aa, 1.0, r)));
    if (vExtra.x > 0.5) {                      // Grit notches
      float k = fract((ang + vParams.w) / (2.0 * vParams.w) * vExtra.x);
      a *= 0.55 + 0.45 * step(0.08, k);
    }
  } else if (shape < 3.5) {                    // cross
    vec2 q = abs(mat2(0.7071, -0.7071, 0.7071, 0.7071) * vUv);
    float bar = min(q.x, q.y);
    a = (1.0 - smoothstep(0.16, 0.16 + aa * 4.0, bar)) * (1.0 - smoothstep(0.85, 0.95, max(q.x, q.y)));
  } else if (shape < 4.5) {                    // dashed rotating ring
    float k = fract((ang + vExtra.y) / (2.0 * PI) * vExtra.x);
    a = band(r, inner, 1.0, aa) * smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.55, 0.63, k));
  } else {                                     // rect outline (x: half width in uv, y half length): ability wall
    vec2 q = abs(vUv);
    float edge = max(q.x / vExtra.x, q.y / vExtra.y);
    a = band(edge, 0.86, 1.0, 0.02) + 0.25 * (1.0 - step(1.0, edge));
  }
  a *= vColor.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb, a);
  #include <colorspace_fragment>
}`;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _s = new THREE.Vector3();
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();

export class GroundDecals {
  /** @param {any} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.mesh = null;
    this.n = 0;
    /** transient markers from orders: { kind, x, y, z, t, dur, actor } */
    this.markers = [];
    this.enabled = ctx?.params?.cam !== 'classic';
    this._offs = [];
    this._parryFlashT = 0;
    this._time = 0;
  }

  init(scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false, uniforms: { uTime: { value: 0 } },
    });
    mat.userData.noHeightFog = true;
    this.colors = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.params = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.extra = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aColor', this.colors);
    geo.setAttribute('aParams', this.params);
    geo.setAttribute('aExtra', this.extra);
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'fx:groundDecals';
    this.mesh.count = 0;
    scene.add(this.mesh);
    const bus = this.ctx.bus;
    this._offs.push(
      bus.on(E.PLAYER_ORDER, (p) => this._onOrder(p)),
      bus.on(E.PLAYER_PARRY, () => { this._parryFlashT = 0.35; }),
      bus.on(E.LEVEL_UNLOAD, () => { this.markers.length = 0; }),
    );
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    this.mesh?.removeFromParent();
    this.mesh?.geometry.dispose();
    this.mesh?.material.dispose();
  }

  _onOrder(p) {
    if (!p) return;
    const pt = p.point, t = p.target;
    let kind = p.kind;
    if (!p.valid || p.partial) kind = 'bad';
    if (kind === 'stop' || (!pt && !t?.pos)) return;
    const at = pt ?? t.pos;
    if (this.markers.length > 12) this.markers.shift();
    this.markers.push({ kind, x: at.x, y: at.y ?? 0, z: at.z, t: 0, dur: kind === 'move' ? 0.6 : 0.7, actor: t?.object3d ? t : null, queued: !!p.queued });
  }

  /** Add one decal: shape, centre (x, y, z), radius (m), yaw (rad, local forward), colour, alpha, params. */
  _add(shape, x, y, z, radius, yaw, color, alpha, inner, aa, w = 0, ex = 0, ey = 0, ez = 0, sx = 1, sz = 1) {
    if (this.n >= MAX) return;
    const i = this.n++;
    // tilt to the ground normal (terrain) so the quad hugs slopes
    const ph = this.ctx.physics;
    if (ph?.normalAt && radius < 4) ph.normalAt(x, z, _n); else _n.copy(_UP);
    if (_n.y < 0.5) _n.copy(_UP);
    _q.setFromUnitVectors(_UP, _n);
    _qy.setFromAxisAngle(_UP, yaw);
    _q.multiply(_qy);
    _p.set(x, y + LIFT, z);
    _s.set(radius * 2 * sx, 1, radius * 2 * sz);
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(i, _m);
    _c.set(color);
    this.colors.setXYZW(i, _c.r, _c.g, _c.b, alpha);
    this.params.setXYZW(i, shape, inner, aa, w);
    this.extra.setXYZW(i, ex, ey, ez, 0);
  }

  /** Per rendered frame (visual dt). */
  render(dt) {
    if (!this.mesh) return;
    this.n = 0;
    this._time += dt;
    const ctx = this.ctx, p = ctx.player, cam = ctx.cam, mode = ctx.game?.mode;
    const play = this.enabled && cam?.isIso && (mode === 'play' || mode === 'dialog') && cam.modeName !== 'preset' && cam.modeName !== 'meme' && cam.modeName !== 'cutscene';
    if (play && p && p.alive !== false && !p.scripted) this._hero(p, dt);
    if (play) {
      this._wedges();
      if (p) this._parryRing(p);
      this._selection(cam, dt);
      this._hover(cam);
      this._aggro(p);
      this._path(p);
      this._ability();
    }
    this._markers(dt, play);
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colors.needsUpdate = true; this.params.needsUpdate = true; this.extra.needsUpdate = true;
    this.mesh.visible = this.n > 0;
  }

  /** The hero / aim ring, the Stand fan, the charge reach, the landing ring. */
  _hero(p, dt) {
    const pos = p.object3d?.position ?? p.pos;
    const gy = p.onGround ? pos.y : (this.ctx.physics?.groundAt?.(pos.x, pos.z, pos.y + 0.05) ?? pos.y);
    const aim = p.aim, yaw = aim && (aim.source === 'cursor' || aim.source === 'explicit') && p.state !== 'move' ? Math.atan2(aim.dir.x, aim.dir.z) : p.facing;
    const cursorYaw = this._cursorYaw(p);
    const ringYaw = cursorYaw ?? yaw;
    // aim ring: pink, notch along the aim
    this._add(DECAL.RING, pos.x, gy, pos.z, 0.75, ringYaw, DECAL_COLORS.hero, 0.42, 0.9, 0.012, 0.26);
    // Stand fan (±70°, touch ±90°): silver, flashes gold through the parry window, grey through the whiff lockout
    if (p.state === 'guard') {
      const touch = this.ctx.input?.device === 'touch';
      const half = touch ? (PLAYER.guard.touchArc ?? Math.PI / 2) : PLAYER.guard.arc;
      const gs = p.guardState, t = gs?.guardT ?? 0;
      const parryWin = t < (PLAYER.guard.parryWindow + (touch ? PLAYER.guard.touchParryBonus : 0));
      const col = this._parryFlashT > 0 || parryWin ? DECAL_COLORS.gold : (p.grit ?? 1) <= 0 ? DECAL_COLORS.grey : DECAL_COLORS.silver;
      this._add(DECAL.FAN, pos.x, gy, pos.z, 1.05, p.facing, col, parryWin ? 0.85 : 0.6, 0.78, 0.015, half, p.gritMax ?? 3, 0, 0.12);
    }
    if (this._parryFlashT > 0) {
      this._parryFlashT -= dt;
      const k = Math.max(0, this._parryFlashT / 0.35);
      this._add(DECAL.RING, pos.x, gy, pos.z, 0.75 + (1 - k) * 1.2, 0, DECAL_COLORS.gold, 0.8 * k, 0.9, 0.02);
    }
    // charge reach: slash3 2.3 m ±97° → Bright 2.6 m (silver) → Holy 3.6 m circle (gold)
    if (p.state === 'charge' && (p.chargeT ?? 0) > PLAYER.charge.start) {
      const tier = p.chargeTier ?? 0;
      const def = tier >= 2 ? ATTACKS.holy : tier >= 1 ? ATTACKS.bright : ATTACKS.slash3;
      const half = tier >= 2 ? Math.PI : Math.abs(def.arc.from - def.arc.to) / 2;
      const col = tier >= 2 ? DECAL_COLORS.gold : DECAL_COLORS.silver;
      if (tier >= 2) this._add(DECAL.RING, pos.x, gy, pos.z, def.arc.range, 0, col, 0.55, 0.95, 0.006, 0, 0, 0, 0.1);
      else this._add(DECAL.FAN, pos.x, gy, pos.z, def.arc.range, p.facing, col, 0.5, 0.94, 0.006, half, 0, 0, 0.1);
    }
    // airborne: the landing ring under her (above 0.4 m)
    if (!p.onGround && pos.y - gy > 0.4) {
      const k = Math.min(1, (pos.y - gy) / 2);
      this._add(DECAL.RING, pos.x, gy, pos.z, 0.45 + 0.25 * (1 - k), 0, DECAL_COLORS.white, 0.5, 0.8, 0.02);
      this._add(DECAL.DISC, pos.x, gy, pos.z, 0.5, 0, '#000000', 0.25 + 0.2 * (1 - k), 0.2, 0.02);
    }
  }

  /** KBM: the ring's notch follows the cursor (the direction LMB swings). */
  _cursorYaw(p) {
    const cam = this.ctx.cam, input = this.ctx.input;
    if (input?.device !== 'kbm' || !cam?.cursorValid || (input.pointerIdle?.() ?? 99) > 3) return null;
    const c = cam.cursorGround;
    if (Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 0.3) return null;
    return Math.atan2(c.x - p.pos.x, c.z - p.pos.z);
  }

  /**
   * §8.2.1 strike wedges: every live melee wind-up (white parry / gold / red / purple grab) draws its attack's own arc
   * from the attacker: a rim plus a fill sweeping outward over the wind-up. It tracks the attacker's facing until 0.15 s
   * before the strike, then freezes (a fair dodge read); at parry-window open the rim flashes and thickens.
   */
  _wedges() {
    const ctx = this.ctx, book = ctx.combat?.threats, now = ctx.game?.time ?? 0;
    if (!book?.live?.size) { this._frozen?.clear?.(); return; }
    this._frozen ??= new Map();
    const win = ctx.state?.difficultyCfg?.parry ?? PLAYER.guard.parryWindow;
    let n = 0;
    for (const e of book.live.values()) {
      if (n >= 8) break;
      const a = e.actor, arc = e.payload?.arc;
      if (!a?.pos || a.alive === false || !arc || e.ended) continue;
      const left = e.activeAt - now;
      if (left < -0.05) continue;
      const range = Math.max(0.6, arc.range ?? e.payload?.range ?? 1.5);
      const half = Math.max(0.25, Math.min(Math.PI, Math.abs((arc.from ?? 0.5) - (arc.to ?? -0.5)) / 2 + 0.12));
      // freeze the facing 0.15 s before the strike
      let yaw = a.facing ?? 0;
      if (left <= 0.15) { if (!this._frozen.has(e)) this._frozen.set(e, yaw); yaw = this._frozen.get(e); } else this._frozen.delete(e);
      const k = e.kind;
      const col = k === 'gold' ? DECAL_COLORS.gold : k === 'red' ? TELEGRAPH.colors.red : k === 'grab' ? TELEGRAPH.colors.grab : DECAL_COLORS.white;
      const prog = e.windup > 0 ? Math.max(0, Math.min(1, 1 - left / e.windup)) : 1;
      const open = left <= win + (ctx.input?.device === 'touch' ? PLAYER.guard.touchParryBonus : 0) && left >= -0.05;
      const pos = a.object3d?.position ?? a.pos, R = range + (a.radius ?? 0.3);
      // rim (2 px → 4 px at the parry window), fill sweeping out; red = filled ("don't be here")
      this._add(DECAL.FAN, pos.x, pos.y, pos.z, R, yaw, col, open ? 0.95 : 0.8, open ? 0.86 : 0.93, 0.01, half, 0, 0, k === 'red' ? 0.32 : 0.12);
      if (prog > 0.02) this._add(DECAL.FAN, pos.x, pos.y, pos.z, Math.max(0.2, R * prog), yaw, col, k === 'red' ? 0.3 : 0.22, 0, 0.02, half, 0, 0, 0.9);
      n++;
    }
    if (this._frozen.size > 32) this._frozen.clear();
  }

  /**
   * §8.2.2 the parry ring (settings.parryRing: auto = touch and Kitten difficulty): for the single most imminent
   * parryable attack on her, a ring shrinking from 2.2 m to her radius exactly at the strike, the parry window drawn
   * as a brighter band; gold for gold kinds.
   */
  _parryRing(p) {
    const ctx = this.ctx, st = ctx.state, mode = st?.settings?.parryRing ?? 'auto';
    const on = mode === 'on' || (mode === 'auto' && (ctx.input?.device === 'touch' || st?.difficulty === 'kitten'));
    if (!on) return;
    const nx = ctx.combat?.nextParryable?.(p, 6);
    if (!nx) return;
    const now = ctx.game?.time ?? 0, left = nx.activeAt - now;
    if (left > 0.6 || left < -0.05) return;
    const R0 = 2.2, r1 = p.radius ?? 0.45, k = Math.max(0, Math.min(1, left / 0.6));
    const r = r1 + (R0 - r1) * k, inWin = left <= (nx.window ?? 0.15);
    const col = nx.kind === 'gold' ? DECAL_COLORS.gold : DECAL_COLORS.white;
    const pos = p.object3d?.position ?? p.pos;
    this._add(DECAL.RING, pos.x, pos.y, pos.z, Math.max(r, r1 + 0.02), 0, col, inWin ? 1 : 0.7, inWin ? 0.78 : 0.88, 0.015);
    // the target band: her radius, where the ring must be when she raises the Stand
    this._add(DECAL.RING, pos.x, pos.y, pos.z, r1 + 0.18, 0, col, 0.35, 0.7, 0.02);
  }

  /** §7.4 the selection: a gold dashed ring rotating 0.5 rev/s, red during its wind-up. */
  _selection(cam) {
    const t = cam.lockTarget;
    if (!t?.pos || t.alive === false) return;
    const pos = t.object3d?.position ?? t.pos;
    const windup = t.stateName === 'windup' || t.telegraph != null;
    const r = Math.max(0.6, (t.radius ?? 0.4) * 1.2 + 0.25);
    this._add(DECAL.DASH, pos.x, pos.y, pos.z, r, 0, windup ? TELEGRAPH.colors.red : DECAL_COLORS.gold, 0.85, 0.86, 0.012, 0, 12, this._time * Math.PI);
  }

  /** §7.4 hover (desktop): a thin ring under what the cursor is over. */
  _hover(cam) {
    const h = cam.hover, input = this.ctx.input;
    if (!h || input?.device !== 'kbm' || h.kind === 'ground') return;
    let pos = null, r = 0.6, col = DECAL_COLORS.white;
    if (h.actor?.pos) { pos = h.actor.object3d?.position ?? h.actor.pos; r = Math.max(0.5, (h.actor.radius ?? 0.4) + 0.25); }
    else if (h.interact?.pos) { pos = h.interact.pos; r = Math.min(1.4, Math.max(0.6, (h.interact.r ?? 1.2) * 0.5)); }
    if (!pos) return;
    if (h.kind === 'enemy') col = DECAL_COLORS.red;
    else if (h.kind === 'interact' || h.kind === 'breakable' || h.kind === 'pickup') col = DECAL_COLORS.gold;
    if (h.actor && h.actor === cam.lockTarget) return;
    this._add(DECAL.RING, pos.x, pos.y ?? 0, pos.z, r, 0, col, 0.75, 0.9, 0.012);
  }

  /** §8.2.6 thin red ground rings under alerted enemies near her. */
  _aggro(p) {
    if (!p) return;
    const list = this.ctx.enemies?.list;
    if (!list) return;
    let n = 0;
    for (const e of list) {
      if (n >= 10) break;
      if (!e?.alerted || e.alive === false || e.hidden || e === this.ctx.cam?.lockTarget) continue;
      if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) > 16) continue;
      const pos = e.object3d?.position ?? e.pos;
      this._add(DECAL.RING, pos.x, pos.y, pos.z, Math.max(0.45, (e.radius ?? 0.4) + 0.15), 0, DECAL_COLORS.aggro, 0.4, 0.86, 0.01);
      n++;
    }
  }

  /** The path she is walking: small dots along the remaining waypoints (≤ 6), the goal as a small ring. */
  _path(p) {
    const o = p?.orders;
    if (!o?.kind || !o.path?.length || o.engaged) return;
    let n = 0, px = p.pos.x, pz = p.pos.z;
    for (let i = o.wp; i < o.path.length && n < 14; i++) {
      const w = o.path[i];
      const dx = w.x - px, dz = w.z - pz, d = Math.hypot(dx, dz);
      const steps = Math.min(4, Math.floor(d / 1.2));
      for (let k = 1; k <= steps && n < 14; k++) {
        const t = k / (steps + 1);
        const x = px + dx * t, z = pz + dz * t;
        this._add(DECAL.DISC, x, (this.ctx.physics?.topAt?.(x, z) ?? w.y), z, 0.09, 0, DECAL_COLORS.move, 0.55, 0.3, 0.02);
        n++;
      }
      px = w.x; pz = w.z;
    }
    if (o.kind === 'move' || o.kind === 'attackMove') {
      const g = o.path[o.path.length - 1];
      this._add(DECAL.RING, g.x, g.y, g.z, 0.32, 0, o.kind === 'attackMove' ? DECAL_COLORS.red : DECAL_COLORS.move, 0.6, 0.72, 0.02);
    }
  }

  /** Companion ability indicator (§7.5) from ctx.companions.aim. */
  _ability() {
    const fx = this.ctx.fx, aim = this.ctx.companions?.aim;
    if (fx) fx.drawsAbilityAim = this.enabled && !!this.ctx.cam?.isIso;
    if (!aim?.active || !aim.plan) return;
    const pl = aim.plan, col = aim.valid === false ? DECAL_COLORS.grey : aim.shape === 'self' ? DECAL_COLORS.green : DECAL_COLORS.white;
    if (aim.shape === 'rect' && pl.center) {
      const L = Math.max(pl.width ?? 3, pl.length ?? 0.4), W = Math.min(pl.width ?? 3, pl.length ?? 0.4);
      const R = L / 2 + 0.1;
      this._add(DECAL.RECT, pl.center.x, pl.center.y ?? this.ctx.player.pos.y, pl.center.z, R, (pl.yaw ?? 0) + Math.PI / 2, col, 0.75, 0, 0.01, 0, (L / 2) / R, (W / 2 + 0.05) / R);
    } else if (aim.shape === 'targets') {
      const o = pl.origin ?? this.ctx.player.pos;
      this._add(DECAL.RING, o.x, o.y ?? this.ctx.player.pos.y, o.z, pl.range ?? 14, 0, col, 0.45, 0.985, 0.002);
      for (const t of pl.targets ?? []) if (t?.pos) this._add(DECAL.RING, t.pos.x, t.pos.y, t.pos.z, 0.55, 0, DECAL_COLORS.gold, 0.85, 0.75, 0.02);
    } else if (aim.shape === 'self') {
      const o = this.ctx.player.pos;
      this._add(DECAL.RING, o.x, o.y, o.z, pl.radius ?? 2, 0, col, 0.6, 0.9, 0.01, 0, 0, 0, 0.12);
    }
  }

  /** Order markers: a pink ripple (move), red (attack) / gold (use) rings, a grey ✕ (unreachable). */
  _markers(dt, play) {
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.t += dt;
      if (m.t >= m.dur || !play) { this.markers.splice(i, 1); continue; }
      const k = m.t / m.dur, grow = Math.min(1, m.t / 0.12), fade = 1 - k;
      if (m.actor?.pos) { m.x = m.actor.pos.x; m.y = m.actor.pos.y; m.z = m.actor.pos.z; }
      switch (m.kind) {
        case 'move': case 'follow':
          this._add(DECAL.RING, m.x, m.y, m.z, 0.25 + 0.5 * grow, 0, DECAL_COLORS.move, 0.9 * fade, 0.78, 0.02);
          this._add(DECAL.DISC, m.x, m.y, m.z, 0.22 * grow, 0, DECAL_COLORS.move, 0.7 * fade, 0.4, 0.02);
          break;
        case 'attackMove':
          this._add(DECAL.RING, m.x, m.y, m.z, 0.25 + 0.5 * grow, 0, DECAL_COLORS.red, 0.9 * fade, 0.78, 0.02);
          break;
        case 'attack':
          this._add(DECAL.RING, m.x, m.y, m.z, 0.9 - 0.3 * grow, 0, DECAL_COLORS.red, 0.95 * fade, 0.82, 0.02);
          break;
        case 'use':
          this._add(DECAL.RING, m.x, m.y, m.z, 0.9 - 0.3 * grow, 0, DECAL_COLORS.gold, 0.95 * fade, 0.82, 0.02);
          break;
        default:
          this._add(DECAL.CROSS, m.x, m.y, m.z, 0.35, Math.PI / 4, DECAL_COLORS.grey, 0.9 * fade, 0, 0.02);
      }
    }
  }
}
