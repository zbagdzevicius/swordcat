// src/ui/beacon.js  (owner: ui) — the always-on "where next" cue (review: no wayfinding to the objective).
//
//  • a soft gold sparkle column with a bobbing paw badge over the current quest step's target while it is on screen;
//  • a gold paw pointer on the screen edge (the threat arrows' edgePoint / SafeFrame border, gold + paw style so it
//    never reads as a threat) while the target is off screen;
//  • a faint pink paw-print trail on the ground from her toward the target for BEACON.trailSec after the step changes.
//
// Target: the step's world position. Asked first from the owners (`ctx.story.questTarget(id)`,
// `ctx.levels.current.questTarget(id)`, the level anchor `quest.<id>`: requests/story.md, requests/world.md), then
// from QUEST_TARGETS (zone ids / caged kittens / NPCs the levels already have). Unknown step → no beacon.
// Hidden in practice (the guide leads there), in a boss fight (the boss bar is the goal), within BEACON.arriveR of the
// target and while the world layer is hidden; dimmed while foes are alerted nearby (threat arrows own the edge then).
// DOM only, transform / opacity only, 0 draws. Per frame: no allocation except the transform strings dom.place writes
// when a position changes (shared with every placed ui element). The target is re-resolved at BEACON.resolveHz.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { el, flag, place, setVar } from './dom.js';
import { paw } from './icons.js';
import { edgePoint, onScreen } from './threatArrows.js';
import { alertedNear } from './celebrate.js';
import { inPractice } from './reveal.js';

/** Beacon numbers. */
export const BEACON = Object.freeze({
  lift: 2.6,          // m: the paw badge floats this high over the target
  arriveR: 4.5,       // m: closer than this, the beacon steps aside (she is there)
  trailSec: 3.6,      // s the paw-print trail shows after a step change
  trailN: 7,          // prints
  trailGap: 1.6,      // m between prints
  trailFrom: 1.4,     // m ahead of her for the first print
  resolveHz: 4,       // target re-resolves per second (actors move: caged kittens, NPCs)
  edgeMargin: 44,     // px from the screen edge (fallback frame)
  edgePad: 28,        // px kept between the edge pointer and a HUD block
  combatR: 14,        // m: alerted foes this close dim the beacon
  topPx: 56,          // px: the badge never floats higher than this (the top-centre HUD column / notch)
});

/**
 * Quest step id → where its target is, tried in order. `z:<zone id>` (the level's zone `at`), `k:<id>` (a companions
 * actor: caged kitten `kittenId` or NPC `npcId`), `a:<anchor>` (level anchor). A row may carry `unless: flag` to skip
 * it once that flag is set (the next row then applies). Data only.
 */
export const QUEST_TARGETS = Object.freeze({
  'prologue.chart': ['z:chart'],
  'prologue.suit': ['z:barn_chest'],
  'meadow.mochi': ['k:mochi', 'z:cart'],
  'meadow.follow': ['z:glade'],
  'meadow.pudding': ['z:glade'],
  'meadow.exit': ['z:exit'],
  'forest.sage': ['k:sage'],
  'forest.camp': ['z:camp'],
  'forest.mill': ['z:mill', 'a:mill_center'],
  'forest.exit': ['z:exit', 'a:exit_mill'],
  'town.rescue': [{ ref: 'z:forge', unless: 'town.cleared.forge' }, 'z:square'],
  'town.steps': ['z:steps', 'a:steps'],
  'gate.scout': ['z:battlefield'],
  'gate.line': ['z:winch'],
  'bog.pearl': ['k:pearl'],
  'keep.boss': ['z:roof'],
});

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3();
const _edge = { x: 0, y: 0, angle: 0 };

/** Read an [x, z] / [x, y, z] / {x, y, z} / {pos} position into `out` ({x, y, z}; y NaN when unknown). */
function readPos(p, out) {
  if (!p) return false;
  const q = p.pos ?? p.position ?? p;
  if (Array.isArray(q)) { out.x = q[0]; out.z = q[1]; out.y = NaN; }      // zone `at` [x, z] / anchors [x, z, h?, facing?]
  else if (typeof q.x === 'number' && typeof q.z === 'number') { out.x = q.x; out.y = typeof q.y === 'number' ? q.y : NaN; out.z = q.z; }
  else return false;
  return Number.isFinite(out.x) && Number.isFinite(out.z);
}

/**
 * Resolve one QUEST_TARGETS ref against ctx into `out` ({x, y, z}). Pure apart from reading ctx. Returns true on a hit.
 * @param {any} ctx @param {string} ref @param {{x:number, y:number, z:number}} out
 */
export function resolveRef(ctx, ref, out) {
  const kind = ref.charCodeAt(0), name = ref.slice(2);
  if (kind === 122) {                                                    // 'z' zone
    const zones = ctx?.levels?.current?.def?.zones;
    if (!zones) return false;
    for (let i = 0; i < zones.length; i++) if (zones[i]?.id === name) return readPos(zones[i].at, out);
    return false;
  }
  if (kind === 107) {                                                    // 'k' companions actor (kitten / NPC)
    const list = ctx?.companions?.actors;
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a && (a.kittenId === name || a.npcId === name) && a.pos && a.alive !== false && !a.disposed) return readPos(a.pos, out);
    }
    return false;
  }
  if (kind === 97) return readPos(ctx?.levels?.anchor?.(name), out);    // 'a' anchor
  return false;
}

/**
 * The world position of quest step `questId` into `out`, or false. The owners' APIs first, then QUEST_TARGETS.
 * @param {any} ctx @param {string|null} questId @param {{x:number, y:number, z:number}} out
 */
export function questTarget(ctx, questId, out) {
  if (!questId) return false;
  try {
    if (readPos(ctx?.story?.questTarget?.(questId), out)) return true;
    if (readPos(ctx?.levels?.current?.questTarget?.(questId), out)) return true;
    if (readPos(ctx?.levels?.anchor?.(`quest.${questId}`), out)) return true;
  } catch { /* an owner API mid-load */ }
  const rows = QUEST_TARGETS[questId];
  if (!rows) return false;
  const st = ctx?.state;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], ref = typeof r === 'string' ? r : r.ref;
    if (typeof r !== 'string' && r.unless && st?.getFlag?.(r.unless)) continue;
    if (resolveRef(ctx, ref, out)) return true;
  }
  return false;
}

/**
 * What the beacon shows this frame. Pure.
 * @param {{ world: boolean, has: boolean, boss: boolean, practice: boolean, dist: number }} s
 * @returns {'off'|'on'}
 */
export function beaconState(s) {
  if (!s.world || !s.has || s.boss || s.practice) return 'off';
  return s.dist < BEACON.arriveR ? 'off' : 'on';
}

/**
 * Slide an edge point (`p.x`, `p.y`, px) out of the HUD's occluder rects (the counters, the portrait, the ability bar):
 * along the border it sits on, to the nearer free side of the rect it hits, staying `BEACON.edgeMargin` inside the
 * screen. A few passes (rects can touch). Pure; mutates `p`.
 * @param {{x:number, y:number}} p @param {{x:number, y:number, w:number, h:number}[]|null|undefined} rects
 * @param {number} W @param {number} H
 */
export function dodgeRects(p, rects, W, H) {
  if (!rects?.length) return p;
  const m = BEACON.edgeMargin, pad = BEACON.edgePad;
  for (let pass = 0; pass < 3; pass++) {
    let hit = false;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const l = r.x - pad, t = r.y - pad, rr = r.x + r.w + pad, b = r.y + r.h + pad;
      if (p.x < l || p.x > rr || p.y < t || p.y > b) continue;
      hit = true;
      const onSide = p.x <= m + 1 || p.x >= W - m - 1;           // on the left / right border: slide vertically
      if (onSide) {
        const up = t, down = b;
        p.y = (p.y - up <= down - p.y && up >= m) || down > H - m ? Math.max(m, up) : Math.min(H - m, down);
      } else {
        const left = l, right = rr;
        p.x = (p.x - left <= right - p.x && left >= m) || right > W - m ? Math.max(m, left) : Math.min(W - m, right);
      }
    }
    if (!hit) break;
  }
  return p;
}

export class Beacon {
  /** @param {any} ctx @param {HTMLElement} parent */
  constructor(ctx, parent) {
    this.ctx = ctx;
    this.root = el('div', 'ui-beacon', { parent });
    this.marker = el('div', 'bc-marker', { parent: this.root, html: `<div class="bc-col"></div><div class="bc-badge">${paw('#8A5A1E')}</div><i class="bc-spark s1"></i><i class="bc-spark s2"></i><i class="bc-spark s3"></i>` });
    this.edge = el('div', 'bc-edge', { parent: this.root, html: `<div class="bc-edge-rot"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M30 20 12 8v24Z" fill="#FFD34D" stroke="#5A3B2E" stroke-width="2.4" stroke-linejoin="round"/></svg></div><div class="bc-edge-paw">${paw('#8A5A1E')}</div>` });
    this.edgeRot = this.edge.querySelector('.bc-edge-rot');
    this.prints = [];
    for (let i = 0; i < BEACON.trailN; i++) this.prints.push(el('i', 'bc-print', { parent: this.root, html: paw('#FF8FB1') }));
    this.questId = null;
    this.bossOn = false;
    this.has = false;
    this.target = { x: 0, y: 0, z: 0 };
    this._resolveT = 0;
    this.trailT = 0;
    this.state = 'off';
    this.offscreen = false;
    const bus = ctx.bus;
    this._offs = [
      bus.on(E.QUEST_UPDATE, (p) => this._onQuest(p)),
      bus.on(E.BOSS_START, () => { this.bossOn = true; }),
      bus.on(E.BOSS_DEFEATED, () => { this.bossOn = false; }),
      bus.on(E.LEVEL_LOADING, () => { this.bossOn = false; this.has = false; this.trailT = 0; this._resolveT = 0; }),
      bus.on(E.LEVEL_LOADED, () => { this._resolveT = 0; this.trailT = BEACON.trailSec; }),
    ];
  }

  _onQuest(p) {
    if (!p) return;
    if (p.state === 'done' && p.questId === this.questId) { this.questId = null; this.has = false; return; }
    if (p.state !== 'active') return;
    if (this.questId !== p.questId) { this.questId = p.questId ?? null; this.trailT = BEACON.trailSec; }
    this._resolveT = 0;
  }

  /** @param {number} dt real seconds @param {boolean} world the world layer is visible */
  render(dt, world) {
    const ctx = this.ctx, cam = ctx.camera, p = ctx.player?.pos;
    if ((this._resolveT -= dt) <= 0) {
      this._resolveT = 1 / BEACON.resolveHz;
      this.has = questTarget(ctx, this.questId, this.target);
      if (this.has && !Number.isFinite(this.target.y)) this.target.y = ctx.physics?.heightAt?.(this.target.x, this.target.z) ?? p?.y ?? 0;
    }
    const t = this.target;
    const dist = this.has && p ? Math.hypot(t.x - p.x, t.z - p.z) : Infinity;
    this.state = beaconState({ world: !!world && !!cam, has: this.has, boss: ctx.ui?.hud ? !!ctx.ui.hud.boss : this.bossOn, practice: inPractice(ctx), dist });
    const on = this.state === 'on';
    flag(this.root, 'is-on', on);
    if (this.trailT > 0) this.trailT -= dt;
    if (!on) { this._trail(false); return; }
    flag(this.root, 'is-calm', !alertedNear(ctx, BEACON.combatR));
    const W = window.innerWidth, H = window.innerHeight;
    cam.getWorldDirection(_f);
    // the target's ground point decides on / off screen (the lifted badge may poke past the top: it is clamped down)
    _v.set(t.x, t.y, t.z);
    const behind = _d.copy(_v).sub(cam.position).dot(_f) <= 0;
    _v.project(cam);
    const vis = onScreen(_v.x, _v.y, behind, 0.92);
    this.offscreen = !vis;
    flag(this.marker, 'is-on', vis);
    flag(this.edge, 'is-on', !vis);
    if (vis) {
      const bx = (_v.x * 0.5 + 0.5) * W, gy = (-_v.y * 0.5 + 0.5) * H;
      _v.set(t.x, t.y + BEACON.lift, t.z).project(cam);
      const by = Math.max(BEACON.topPx, Math.min(gy - 12, (-_v.y * 0.5 + 0.5) * H));
      setVar(this.marker, '--col', `${Math.max(12, gy - by).toFixed(0)}px`);
      place(this.marker, bx, by);
    } else {
      edgePoint(_v.x, _v.y, behind, W, H, BEACON.edgeMargin, _edge);
      dodgeRects(_edge, this.ctx.ui?.screenOccluders?.()?.rects, W, H);
      place(this.edge, _edge.x, _edge.y);
      const deg = (_edge.angle * 180 / Math.PI).toFixed(0);
      if (this.edgeRot._deg !== deg) { this.edgeRot._deg = deg; this.edgeRot.style.transform = `rotate(${deg}deg)`; }
    }
    this._trail(this.trailT > 0 && !!p, p, dist, W, H);
  }

  /** The paw-print trail from her toward the target (fades in print by print; CSS does the fade). */
  _trail(on, p, dist, W, H) {
    flag(this.root, 'is-trail', on);
    if (!on) return;
    const cam = this.ctx.camera, t = this.target;
    const dx = t.x - p.x, dz = t.z - p.z, len = Math.max(1e-3, Math.hypot(dx, dz)), ux = dx / len, uz = dz / len;
    const phys = this.ctx.physics;
    for (let i = 0; i < this.prints.length; i++) {
      const e = this.prints[i], s = BEACON.trailFrom + i * BEACON.trailGap;
      if (s > dist - 1) { flag(e, 'is-on', false); continue; }
      const side = (i & 1 ? 0.18 : -0.18);                 // left / right paws
      const x = p.x + ux * s - uz * side, z = p.z + uz * s + ux * side;
      _v.set(x, (phys?.heightAt?.(x, z) ?? p.y) + 0.05, z);
      const back = _d.copy(_v).sub(cam.position).dot(_f) <= 0;
      _v.project(cam);
      const ok = !back && Math.abs(_v.x) < 1 && Math.abs(_v.y) < 1;
      flag(e, 'is-on', ok);
      if (ok) place(e, (_v.x * 0.5 + 0.5) * W, (-_v.y * 0.5 + 0.5) * H);
    }
  }

  dispose() { for (const off of this._offs) off(); this.root.remove(); }
}
