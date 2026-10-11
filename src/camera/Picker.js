// src/camera/Picker.js  (owner: camera) — research/CONTROLS_SPEC.md §7.6 picking for the iso controls.
//   screenToGround(ctx, x, y, out)   CSS px → the walkable ground point under the pointer (terrain + architecture),
//                                    falling back to the horizontal plane at her feet
//   pickAt(ctx, x, y, opts, out)     CSS px → { kind: 'enemy'|'breakable'|'interact'|'npc'|'pickup'|'ground', actor?, id?,
//                                    interact?, point, px } — enemy > breakable > interact / npc > pickup > ground;
//                                    ties → nearest on screen, then nearest to her
// An actor is hit when its projected capsule axis (feet → head) is within max(AIM.pick.px, projected radius +
// AIM.pick.pad) CSS px of the pointer (touch: AIM.pick.touchPx × touchSize). Interactables use a ≥ AIM.pick.interactR m
// pick radius around their spot. Crows are also picked at their shadow on the ground.
import * as THREE from 'three';
import { AIM } from '../core/config.js';

const _ndc = new THREE.Vector2(), _ray = new THREE.Raycaster(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _p = new THREE.Vector3(), _plane = new THREE.Plane(), _UP = new THREE.Vector3(0, 1, 0);
const GROUND_OPTS = Object.freeze({ terrain: true, mesh: true, statics: false });
const RANK = { enemy: 0, breakable: 1, interact: 2, npc: 2, pickup: 3, ground: 9 };
const _list = [];

/** The canvas rect (CSS px). */
export function canvasRect(ctx) {
  const el = ctx.renderer?.domElement;
  const r = el?.getBoundingClientRect?.();
  if (r && r.width > 0) return r;
  const w = typeof innerWidth !== 'undefined' ? innerWidth : 1280, h = typeof innerHeight !== 'undefined' ? innerHeight : 720;
  return { left: 0, top: 0, width: w, height: h };
}

/** CSS px → NDC (writes `out` Vector2). */
export function toNdc(ctx, x, y, out = _ndc) {
  const r = canvasRect(ctx);
  return out.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
}

/**
 * World point → CSS px `out` {x, y, z: ndc depth, on: inside the frustum}. Uses the camera as rendered last frame.
 * @param {any} ctx @param {{x:number,y:number,z:number}} p @param {{x:number,y:number,z?:number,on?:boolean}} out
 */
export function worldToScreen(ctx, p, out = { x: 0, y: 0, z: 0, on: false }) {
  const cam = ctx.camera, r = canvasRect(ctx);
  _p.set(p.x, p.y, p.z).project(cam);
  out.x = r.left + (_p.x + 1) * 0.5 * r.width;
  out.y = r.top + (1 - _p.y) * 0.5 * r.height;
  out.z = _p.z;
  out.on = _p.z > -1 && _p.z < 1 && Math.abs(_p.x) <= 1 && Math.abs(_p.y) <= 1;
  return out;
}

/**
 * The ground under CSS px (x, y): terrain + architecture (bridge decks, ledges, stairs, roofs) by raycast, else the
 * horizontal plane through her feet. Returns `out` (Vector3) or null when the ray never meets the ground.
 */
export function screenToGround(ctx, x, y, out = new THREE.Vector3()) {
  const cam = ctx.camera;
  if (!cam) return null;
  cam.updateMatrixWorld();
  _ray.setFromCamera(toNdc(ctx, x, y), cam);
  const ph = ctx.physics;
  const hit = ph?.raycast?.(_ray.ray, 400, GROUND_OPTS);
  if (hit) return out.copy(hit.point);
  const fy = ctx.player?.pos?.y ?? 0;
  _plane.set(_UP, -fy);
  return _ray.ray.intersectPlane(_plane, out);
}

/** Squared distance (px²) from (px, py) to the segment a–b (screen). */
function segDist2(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
  const dx = px - (ax + vx * t), dy = py - (ay + vy * t);
  return dx * dx + dy * dy;
}

const _sa = { x: 0, y: 0, z: 0, on: false }, _sb = { x: 0, y: 0, z: 0, on: false }, _sr = { x: 0, y: 0, z: 0, on: false };

/**
 * Screen distance (px) from the pointer to an actor's projected capsule, and its pick tolerance (px). null when it is
 * behind the camera.
 */
function actorScreen(ctx, a, x, y, basePx) {
  const pos = a.object3d?.position ?? a.pos;
  if (!pos) return null;
  const h = Math.max(0.3, a.height ?? 1);
  _a.set(pos.x, pos.y + Math.min(0.15, h * 0.2), pos.z);
  _b.set(pos.x, pos.y + h, pos.z);
  worldToScreen(ctx, _a, _sa); worldToScreen(ctx, _b, _sb);
  if (_sa.z >= 1 || _sb.z >= 1) return null;
  // projected radius: a point `radius` m to the side of her chest
  const right = ctx.cam?.yaw != null ? ctx.cam.yaw : Math.PI;
  _a.set(pos.x + Math.cos(right) * (a.radius ?? 0.4), pos.y + h * 0.5, pos.z - Math.sin(right) * (a.radius ?? 0.4));
  worldToScreen(ctx, _a, _sr);
  const mx = (_sa.x + _sb.x) / 2, my = (_sa.y + _sb.y) / 2;
  const rpx = Math.hypot(_sr.x - mx, _sr.y - my);
  let d = Math.sqrt(segDist2(x, y, _sa.x, _sa.y, _sb.x, _sb.y));
  // crows: also at their ground shadow
  if (a.tags?.has?.('flyer') || a.def?.tags?.includes?.('flyer')) {
    const gy = ctx.physics?.heightAt?.(pos.x, pos.z) ?? 0;
    _a.set(pos.x, gy, pos.z); worldToScreen(ctx, _a, _sa);
    d = Math.min(d, Math.hypot(x - _sa.x, y - _sa.y));
  }
  return { d, tol: Math.max(basePx, rpx + AIM.pick.pad), sy: _sb.y };
}

/** Is this actor a live, visible pick candidate? */
function live(a) {
  if (!a || a.alive === false || a.dead || a.hidden) return false;
  if (a.object3d && a.object3d.visible === false) return false;
  return true;
}

/**
 * The pick under CSS px (x, y) (§7.6). `opts.touch` widens the tolerance; `opts.kinds` (a Set) limits the kinds;
 * `opts.ground` false skips the ground ray. Writes `out`.
 * @returns {{kind:string, actor:any, id:string|null, interact:any, point:THREE.Vector3|null, px:number}}
 */
export function pickAt(ctx, x, y, opts = {}, out = { kind: 'ground', actor: null, id: null, interact: null, point: new THREE.Vector3(), px: 0 }) {
  const touch = !!opts.touch, ts = ctx.state?.settings?.touchSize ?? 1;
  const basePx = touch ? AIM.pick.touchPx * ts : AIM.pick.px;
  const kinds = opts.kinds ?? null, her = ctx.player?.pos;
  let best = null, bestRank = 99, bestD = Infinity, bestHer = Infinity;
  const consider = (kind, actor, id, interact, d, herD) => {
    if (kinds && !kinds.has(kind)) return;
    const r = RANK[kind] ?? 5;
    if (r < bestRank || (r === bestRank && (d < bestD - 2 || (Math.abs(d - bestD) <= 2 && herD < bestHer)))) {
      best = { kind, actor, id, interact }; bestRank = r; bestD = d; bestHer = herD;
    }
  };
  const herDist = (p) => (her ? Math.hypot(p.x - her.x, p.z - her.z) : 0);

  // ---- enemies (hostile, hurtable) and breakables (rope posts, cages, crates, cracked boulders)
  _list.length = 0;
  for (const e of ctx.enemies?.list ?? []) _list.push(e);
  for (const e of _list) {
    if (!live(e) || e.hurtable === false || e.scripted) continue;
    const s = actorScreen(ctx, e, x, y, basePx);
    if (s && s.d <= s.tol) consider('enemy', e, null, null, s.d, herDist(e.pos));
  }
  const level = ctx.levels?.current;
  for (const a of ctx.actors?.list ?? []) {
    if (!(a?.breakable === true || a?.assistable === true) || a.faction === 'enemy' || !live(a) || a.hurtable === false) continue;
    if (a.tags?.has?.('player')) continue;
    const s = actorScreen(ctx, a, x, y, basePx);
    if (s && s.d <= s.tol) consider('breakable', a, a.actorId ?? a.id ?? null, null, s.d, herDist(a.pos));
  }
  // ---- interactables (Vigil Stones, stations, the Quest Board, signs, cages to open)
  for (const it of level?.interactables ?? []) {
    if (!it?.pos || (it.enabled && !it.enabled())) continue;
    _a.set(it.pos.x, it.pos.y + 0.5, it.pos.z); worldToScreen(ctx, _a, _sa);
    if (_sa.z >= 1) continue;
    const R = Math.max(AIM.pick.interactR, Math.min(it.r ?? 1.2, 2.0) * 0.6);
    _b.set(it.pos.x + Math.cos(ctx.cam?.yaw ?? Math.PI) * R, it.pos.y + 0.5, it.pos.z - Math.sin(ctx.cam?.yaw ?? Math.PI) * R);
    worldToScreen(ctx, _b, _sb);
    const tol = Math.max(basePx, Math.hypot(_sb.x - _sa.x, _sb.y - _sa.y));
    const d = Math.hypot(x - _sa.x, y - _sa.y);
    if (d <= tol) consider(it.kind === 'npc' ? 'npc' : 'interact', it.actor ?? null, it.id, it, d, herDist(it.pos));
  }
  // ---- NPCs, party kittens and lost kittens (companions' pickables)
  _list.length = 0;
  ctx.companions?.pickables?.(_list);
  for (const a of _list) {
    if (!live(a) || !a.pickKind) continue;
    const s = actorScreen(ctx, a, x, y, basePx);
    if (s && s.d <= s.tol) consider('npc', a, a.interactId ?? null, null, s.d, herDist(a.pos));
  }
  out.kind = best?.kind ?? 'ground';
  out.actor = best?.actor ?? null;
  out.id = best?.id ?? null;
  out.interact = best?.interact ?? null;
  out.px = Number.isFinite(bestD) ? bestD : 0;
  const g = opts.ground === false ? null : screenToGround(ctx, x, y, out.point ?? (out.point = new THREE.Vector3()));
  if (!g && out.point) out.point.set(NaN, NaN, NaN);
  return out;
}
