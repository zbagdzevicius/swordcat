// src/ui/beacon.js  (owner: ui) — the always-on "where next" cue (review: no wayfinding to the objective), rebuilt as
// the TOKENTAILS-PLAN §10.2 guidance system (package G1): one system for every objective, onboarding first.
//
//  • Target: `ctx.story.guideTarget()` (§10.7 contract: { id, x, z, arriveR, textKey, vars?, kind, speaker? } | null),
//    else the running practice lesson's demo point (Tutorial._demoTarget), else the quest step's target
//    (`questTarget`: the owners' APIs, then QUEST_TARGETS). Practice is no longer "off".
//  • The Pink Paw trail: world-space Token Tails paw prints on the ground along the nav path (fx GroundDecals'
//    GuideTrail, fed through `ctx.fx.decals.setGuide()` every frame; `settings.guideTrail === false` hides it only).
//  • A gold Token Tails ":3" coin with a pink paw-tip pointer on the screen edge while the target is off screen
//    (56 px desktop / 44 px phones, slid off the HUD / ability bar / touch clusters with dodgeRects); the gold coin
//    badge over the target (where the trail ends) while it is on screen. A tap / click on the coin (or on the badge of a
//    `tapMove` target) is a move order toward the target's ground point, never an actor pick (`edgeOrder`, TT3 R3 / fix 1).
//  • The objective line text (`objective`: the target's textKey + vars) that hud.js draws at the top centre.
// Hidden in cutscenes, blocking dialogue (`story.sceneActive`, dialog / cutscene modes, the letterbox), boss fights,
// the results card and within the target's `arriveR`; dimmed to 35 % while foes are alerted nearby (an ordinary fight).
// DOM only for the arrow and badge (transform / opacity), the prints ride the decal batch (0 extra draws).
import * as THREE from 'three';
import { E } from '../core/events.js';
import { el, flag, place, setVar, hasDom } from './dom.js';
import * as I from './icons.js';
import { edgePoint, onScreen } from './threatArrows.js';
import { alertedNear } from './celebrate.js';
import { inPractice } from './reveal.js';
import guidanceCss from './guidance.css?inline';

/** Beacon numbers. */
export const BEACON = Object.freeze({
  lift: 2.6,          // m: the coin badge floats this high over the target
  arriveR: 4.5,       // m: a quest step's arrival radius (closer: the beacon steps aside, she is there)
  guideArriveR: 2.2,  // m: default arrival radius of a guide target (§10.2 "arriveR (default 2.2 m)")
  resolveHz: 4,       // target re-resolves per second (actors move: caged kittens, NPCs)
  edgeMargin: 62,     // px from the screen edge (the 56 px coin + its paw tip stay inside the screen)
  edgeMarginPhone: 46, // px on phones (the 44 px coin + its tip): at 844×390 the 62 px band put the coin on Clem's feet
  clemClear: 70,      // px: the edge coin slides along its border until it is this far from Clem's screen spot
  edgePad: 28,        // px kept between the edge pointer and a HUD block
  combatR: 14,        // m: alerted foes this close dim the guide (an ordinary fight)
  topPx: 56,          // px: the badge never floats higher than this (the top-centre HUD column / notch)
  coinPx: 56,         // px: the edge coin on desktop
  coinPxPhone: 44,    // px: the edge coin on phones
  objectiveMax: 40,   // characters: the objective line
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

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3();
const _edge = { x: 0, y: 0, angle: 0 };
const _demo = { x: 0, y: 0, z: 0 };

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
 * The current guide target into `out` (§10.7): `{ has, pos, id, kind, x, y, z, arriveR, textKey, vars, speaker, text,
 * src }`. `has` = there is an objective at all (the objective line); `pos` = it has a world position (trail, arrow,
 * badge). Order: `ctx.story.guideTarget()`, the running practice lesson's demo point, the quest step. Reads ctx
 * defensively; pure otherwise.
 * @param {any} ctx @param {string|null} questId @param {string|null} questText @param {object} out
 */
export function resolveGuide(ctx, questId, questText, out) {
  out.has = false; out.pos = false; out.id = null; out.kind = null; out.textKey = null; out.vars = null; out.speaker = null;
  out.text = null; out.src = null; out.arriveR = BEACON.guideArriveR; out.y = NaN; out.tapMove = false; out.ring = null;
  let g = null;
  try { g = typeof ctx?.story?.guideTarget === 'function' ? ctx.story.guideTarget() : null; } catch { g = null; }
  if (g) {
    out.has = true; out.src = 'story';
    out.id = g.id ?? null; out.kind = g.kind ?? 'lesson'; out.textKey = g.textKey ?? null; out.vars = g.vars ?? null;
    out.speaker = g.speaker ?? null; out.text = g.text ?? null; out.tapMove = !!g.tapMove;
    out.ring = g.ring && Number.isFinite(g.ring.x) && Number.isFinite(g.ring.z) ? g.ring : null;
    out.arriveR = Number.isFinite(g.arriveR) ? g.arriveR : BEACON.guideArriveR;
    out.pos = readPos(g, out);
    return out;
  }
  const tut = ctx?.story?.tutorial, step = tut?.active ? tut.log?.step : null;
  if (step) {
    out.has = true; out.src = 'tutorial'; out.id = `tut.${step.id}`; out.kind = 'lesson'; out.textKey = step.textKey ?? null;
    out.speaker = step.guide ?? null;
    let pt = null;
    try { pt = typeof tut._demoTarget === 'function' ? tut._demoTarget(step) : null; } catch { pt = null; }
    const p = ctx.player?.pos;
    // a lesson whose demo point is her own spot (Stand / parry) has no place to go: objective line only
    if (Array.isArray(pt) && pt.length >= 3) { _demo.x = pt[0]; _demo.y = pt[1]; _demo.z = pt[2]; }       // [x, y, z]
    else if (!readPos(pt, _demo)) _demo.x = NaN;
    if (Number.isFinite(_demo.x) && Number.isFinite(_demo.z) && !(p && Math.hypot(_demo.x - p.x, _demo.z - p.z) < 0.05)) {
      out.pos = true; out.x = _demo.x; out.y = Number.isFinite(_demo.y) ? _demo.y : NaN; out.z = _demo.z;
    }
    return out;
  }
  if (questId && questTarget(ctx, questId, out)) {
    out.has = true; out.pos = true; out.src = 'quest'; out.id = questId; out.kind = 'quest'; out.text = questText ?? null;
    out.arriveR = BEACON.arriveR;
    return out;
  }
  return out;
}

/**
 * What the beacon shows this frame. Pure. `practice` no longer hides it (§10.2: the guide leads practice too).
 * @param {{ world: boolean, has: boolean, boss: boolean, dist: number, scene?: boolean, arriveR?: number, practice?: boolean }} s
 * @returns {'off'|'on'}
 */
export function beaconState(s) {
  if (!s.world || !s.has || s.boss || s.scene) return 'off';
  return s.dist < (Number.isFinite(s.arriveR) ? s.arriveR : BEACON.arriveR) ? 'off' : 'on';
}

/**
 * Is a scene up that hides every guide cue (§10.2.4 / §10.10.4)? Cutscenes, blocking dialogue (`story.sceneActive`),
 * the dialog / cutscene modes, the letterbox and the results card. Pure apart from reading ctx.
 * @param {any} ctx
 */
export function guideHidden(ctx) {
  const mode = ctx?.game?.mode;
  if (mode === 'dialog' || mode === 'cutscene' || mode === 'menu') return true;
  if (ctx?.story?.sceneActive) return true;
  const ui = ctx?.ui;
  return !!(ui?.dialog?.visible || ui?.overlay?.letterboxOn || ui?.results?.open || ui?.inScene);
}

/**
 * The objective line's text (≤ BEACON.objectiveMax characters; longer text ends in an ellipsis). Pure.
 * @param {string} s
 */
export function clipObjective(s, max = BEACON.objectiveMax) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1), sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:!?-]+$/, '')}…`;
}

/**
 * Slide an edge point (`p.x`, `p.y`, px) out of the HUD's occluder rects (the counters, the portrait, the ability bar):
 * along the border it sits on, to the nearer free side of the rect it hits, staying `BEACON.edgeMargin` inside the
 * screen. A few passes (rects can touch). Pure; mutates `p`.
 * @param {{x:number, y:number}} p @param {{x:number, y:number, w:number, h:number}[]|null|undefined} rects
 * @param {number} W @param {number} H
 */
export function dodgeRects(p, rects, W, H, m = BEACON.edgeMargin) {
  if (!rects?.length) return p;
  const pad = BEACON.edgePad;
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

/**
 * fix round 2: keep the edge point (on a screen border, `m` px in) at least `r` px from (cx, cy) (Clem's screen spot):
 * slide it along its own border, away from her, never off the border band. Pure; mutates `p`.
 * @param {{x:number, y:number}} p @param {number} cx @param {number} cy @param {number} r @param {number} W @param {number} H @param {number} m
 */
export function clearOf(p, cx, cy, r, W, H, m) {
  const dx = p.x - cx, dy = p.y - cy;
  if (!(Math.hypot(dx, dy) < r)) return p;
  const onSide = p.x <= m + 1 || p.x >= W - m - 1;
  if (onSide) {
    const need = Math.sqrt(Math.max(0, r * r - dx * dx));
    p.y = Math.max(m, Math.min(H - m, dy >= 0 ? cy + need : cy - need));
  } else {
    const need = Math.sqrt(Math.max(0, r * r - dy * dy));
    p.x = Math.max(m, Math.min(W - m, dx >= 0 ? cx + need : cx - need));
  }
  return p;
}

/**
 * TT3 R3: a tap / click on the edge coin is a move order toward the guide target, through the same `Orders.order('move')`
 * a ground tap / right-click ends in (the coin no longer swallows it). Only in live play with a positioned target.
 * Returns whether the order was accepted.
 * @param {any} ctx @param {{ pos?: boolean, x: number, y?: number, z: number }} g the beacon's guide @param {'mouse'|'touch'} [source]
 */
export function edgeOrder(ctx, g, source = 'mouse') {
  if (!g?.pos || !Number.isFinite(g.x) || !Number.isFinite(g.z)) return false;
  if (ctx?.game?.mode !== 'play' || guideHidden(ctx)) return false;
  const ph = ctx.physics;
  const y = Number.isFinite(g.y) ? g.y : ph?.topAt?.(g.x, g.z) ?? ph?.heightAt?.(g.x, g.z) ?? ctx.player?.pos?.y ?? 0;
  const pt = { x: g.x, y, z: g.z };
  const o = ctx.player?.orders;
  if (typeof o?.order === 'function') return !!o.order('move', pt, { source });
  return !!ctx.player?.order?.('move', pt, { source });
}

/** Local fallback art (icons.js `ttCoin` / `pinkPaw` are G3's; these keep the beacon working without them). */
function coinSvg(px) {
  if (typeof I.ttCoin === 'function') return I.ttCoin(px);
  return `<svg class="ico-ttcoin" width="${px}" height="${px}" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#C9862A" stroke="#4A1D08" stroke-width="2.2"/>`
    + '<circle cx="20" cy="19" r="15" fill="#FFCC55"/><circle cx="14.5" cy="16.5" r="2.4" fill="#4A1D08"/><circle cx="25.5" cy="16.5" r="2.4" fill="#4A1D08"/>'
    + '<path d="M13.5 22.5q3.2 4.4 6.5 0q3.3 4.4 6.5 0" fill="none" stroke="#4A1D08" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M18.4 25.2q1.6 2.6 3.2 0Z" fill="#FF7AA2"/></svg>';
}
function pawSvg(px) {
  if (typeof I.pinkPaw === 'function') return I.pinkPaw(px);
  return `<svg class="ico-pinkpaw" width="${px}" height="${px}" viewBox="0 0 48 48" aria-hidden="true"><g stroke="#4A1D08" stroke-width="2" fill="#FF7AA2">`
    + '<ellipse cx="24" cy="30" rx="8.6" ry="7.2"/><ellipse cx="15.4" cy="20.6" rx="3.5" ry="4.4"/><ellipse cx="20.6" cy="16" rx="3.5" ry="4.4"/>'
    + '<ellipse cx="27.4" cy="16" rx="3.5" ry="4.4"/><ellipse cx="32.6" cy="20.6" rx="3.5" ry="4.4"/></g></svg>';
}
/** The pink paw-tip pointer (points +x; the rotor turns it toward the target). */
const TIP_SVG = '<svg class="bc-tip-svg" viewBox="0 0 30 30" aria-hidden="true"><path d="M27 15 9 4.5q-3-1.6-3 1.8v17.4q0 3.4 3 1.8Z" fill="#FF7AA2" stroke="#4A1D08" stroke-width="2.4" stroke-linejoin="round"/>'
  + '<circle cx="12" cy="15" r="2.6" fill="#F3EEE6"/></svg>';

/** Is this a phone-sized / touch layout (44 px coin, objective line under the hearts)? Pure apart from the args. */
export function isPhone(device, W, H) { return device === 'touch' || Math.min(W, H) < 500; }

export class Beacon {
  /** @param {any} ctx @param {HTMLElement} parent */
  constructor(ctx, parent) {
    this.ctx = ctx;
    if (hasDom() && !document.getElementById('ui-guidance-style')) {
      this.style = el('style', '', { attrs: { id: 'ui-guidance-style' }, text: guidanceCss });
      document.head.appendChild(this.style);
    }
    this.root = el('div', 'ui-beacon', { parent });
    this.marker = el('div', 'bc-marker', { parent: this.root, html: `<div class="bc-col"></div><div class="bc-badge">${coinSvg(BEACON.coinPxPhone)}</div><i class="bc-spark s1"></i><i class="bc-spark s2"></i><i class="bc-spark s3"></i>` });
    this.edge = el('div', 'bc-edge', { parent: this.root, html: `<div class="bc-edge-rot"><i class="bc-tip">${TIP_SVG}</i></div><div class="bc-coin">${coinSvg(BEACON.coinPx)}</div>` });
    this.edgeRot = this.edge.querySelector('.bc-edge-rot');
    // TT3 R3: the coin takes its own taps / clicks (guidance.css: pointer-events while shown) and walks her toward the target
    /** whether the last edge-coin tap issued an order (tests) */
    this.lastEdgeOrder = null;
    this._onEdge = (e) => {
      if (!this.edge.classList.contains('is-on') || !this.root.classList.contains('is-on')) return;
      e.preventDefault?.(); e.stopPropagation?.();
      this.lastEdgeOrder = edgeOrder(this.ctx, this.guide, e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'mouse');
    };
    this.edge.addEventListener?.('pointerdown', this._onEdge);
    this.edge.addEventListener?.('contextmenu', (e) => e.preventDefault());
    // fix round 1: a guide target marked `tapMove` (Sir Wobble's stand spot) lets its on-screen badge take its own taps /
    // clicks. The badge floats over the spot, right on Wobble's body: a tap that fell through to the canvas picked him and
    // became an engage order that stopped at weapon reach, short of the drill's closeR. Such a tap is a plain move order to
    // the guide's ground point. Other badges stay click-through (a click on the cage / dummy under them still acts on it).
    this.badge = this.marker.querySelector?.('.bc-badge') ?? null;
    this._onBadge = (e) => {
      if (!this.guide.tapMove || !this.marker.classList.contains('is-on') || !this.root.classList.contains('is-on')) return;
      e.preventDefault?.(); e.stopPropagation?.();
      this.lastEdgeOrder = edgeOrder(this.ctx, this.guide, e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'mouse');
    };
    this.badge?.addEventListener?.('pointerdown', this._onBadge);
    this.badge?.addEventListener?.('contextmenu', (e) => e.preventDefault());
    this.questId = null;
    this.questText = null;
    this.bossOn = false;
    this.has = false;
    /** the resolved guide (resolveGuide's shape); `target` = its world point (kept for older readers) */
    this.guide = { has: false, pos: false, tapMove: false, ring: null, id: null, kind: null, x: 0, y: 0, z: 0, arriveR: BEACON.guideArriveR, textKey: null, vars: null, speaker: null, text: null, src: null };
    this.target = { x: 0, y: 0, z: 0 };
    this._resolveT = 0;
    this.state = 'off';
    this.offscreen = false;
    this.hidden = true;
    this.dim = false;
    this.phone = false;
    /** screen points of the last frame (__GAME__.guide()): the edge coin / badge centre, or null */
    this.edgeAt = null; this.badgeAt = null;
    this._edgePt = { x: 0, y: 0 }; this._badgePt = { x: 0, y: 0 };
    /** what fx's trail is fed (one object, rewritten per frame) */
    this._spec = { on: false, hard: false, dim: false, reduced: false, touch: false, trail: true, id: null, x: 0, y: 0, z: 0, arriveR: BEACON.guideArriveR, ring: null };
    const bus = ctx.bus;
    this._offs = [
      bus.on(E.QUEST_UPDATE, (p) => this._onQuest(p)),
      bus.on(E.BOSS_START, () => { this.bossOn = true; }),
      bus.on(E.BOSS_DEFEATED, () => { this.bossOn = false; }),
      bus.on(E.LEVEL_LOADING, () => { this.bossOn = false; this.has = false; this.guide.has = false; this.guide.pos = false; this._resolveT = 0; }),
      bus.on(E.LEVEL_LOADED, () => { this._resolveT = 0; }),
      bus.on(E.PROMPT, () => { this._resolveT = 0; }),                 // a lesson moved on: re-resolve this frame
    ];
  }

  _onQuest(p) {
    if (!p) return;
    if (p.state === 'done' && p.questId === this.questId) { this.questId = null; this.questText = null; this._resolveT = 0; return; }
    if (p.state !== 'active') return;
    this.questId = p.questId ?? null;
    this.questText = p.text ?? null;
    this._resolveT = 0;
  }

  /** The objective line for hud.js: `{ textKey, vars, text, kind }` or null (no objective / a scene is up). */
  get objective() {
    const g = this.guide;
    if (!g.has || this.hidden) return null;
    if (!g.textKey && !g.text) return null;
    return g;
  }

  /** @param {number} dt real seconds @param {boolean} world the world layer is visible */
  render(dt, world) {
    const ctx = this.ctx, cam = ctx.camera, p = ctx.player?.pos;
    const W = window.innerWidth, H = window.innerHeight;
    if ((this._resolveT -= dt) <= 0) {
      this._resolveT = 1 / BEACON.resolveHz;
      resolveGuide(ctx, this.questId, this.questText, this.guide);
      const g = this.guide;
      if (g.pos && !Number.isFinite(g.y)) g.y = ctx.physics?.heightAt?.(g.x, g.z) ?? p?.y ?? 0;
      this.target.x = g.x; this.target.y = g.y; this.target.z = g.z;
      this.has = g.pos;
    }
    const g = this.guide, t = this.target;
    const boss = ctx.ui?.hud ? !!ctx.ui.hud.boss : this.bossOn;
    const scene = guideHidden(ctx);
    this.hidden = !world || !cam || scene || boss;
    const dist = this.has && p ? Math.hypot(t.x - p.x, t.z - p.z) : Infinity;
    this.state = beaconState({ world: !!world && !!cam, has: this.has, boss, scene, dist, arriveR: g.arriveR, practice: inPractice(ctx) });
    this.dim = alertedNear(ctx, BEACON.combatR);
    this.phone = isPhone(ctx.input?.device, W, H);
    this._feedTrail(dist);
    const on = this.state === 'on';
    flag(this.root, 'is-on', on);
    flag(this.root, 'is-phone', this.phone);
    this.edgeAt = null; this.badgeAt = null;
    if (!on) { flag(this.marker, 'is-on', false); flag(this.edge, 'is-on', false); return; }
    flag(this.root, 'is-calm', !this.dim);
    cam.getWorldDirection(_f);
    // the target's ground point decides on / off screen (the lifted badge may poke past the top: it is clamped down)
    _v.set(t.x, t.y, t.z);
    const behind = _d.copy(_v).sub(cam.position).dot(_f) <= 0;
    _v.project(cam);
    const vis = onScreen(_v.x, _v.y, behind, 0.92);
    this.offscreen = !vis;
    flag(this.marker, 'is-on', vis);
    flag(this.marker, 'is-tap', vis && !!this.guide.tapMove);
    flag(this.edge, 'is-on', !vis);
    if (vis) {
      const bx = (_v.x * 0.5 + 0.5) * W, gy = (-_v.y * 0.5 + 0.5) * H;
      _v.set(t.x, t.y + BEACON.lift, t.z).project(cam);
      const by = Math.max(BEACON.topPx, Math.min(gy - 12, (-_v.y * 0.5 + 0.5) * H));
      setVar(this.marker, '--col', `${Math.max(12, gy - by).toFixed(0)}px`);
      place(this.marker, bx, by);
      this._badgePt.x = bx; this._badgePt.y = by - 22; this.badgeAt = this._badgePt;
    } else {
      const em = this.phone ? BEACON.edgeMarginPhone : BEACON.edgeMargin;
      edgePoint(_v.x, _v.y, behind, W, H, em, _edge);
      dodgeRects(_edge, ctx.ui?.screenOccluders?.()?.rects, W, H, em);
      if (p) { _v.set(p.x, p.y + 0.4, p.z).project(cam); clearOf(_edge, (_v.x * 0.5 + 0.5) * W, (-_v.y * 0.5 + 0.5) * H, BEACON.clemClear, W, H, em); }
      place(this.edge, _edge.x, _edge.y);
      const deg = (_edge.angle * 180 / Math.PI).toFixed(0);
      if (this.edgeRot._deg !== deg) { this.edgeRot._deg = deg; this.edgeRot.style.transform = `rotate(${deg}deg)`; }
      this._edgePt.x = _edge.x; this._edgePt.y = _edge.y; this.edgeAt = this._edgePt;
    }
  }

  /** Feed fx's Pink Paw trail (GroundDecals.setGuide) for this frame. */
  _feedTrail(dist) {
    const decals = this.ctx.fx?.decals;
    if (!decals?.setGuide) return;
    const s = this._spec, g = this.guide, st = this.ctx.state?.settings;
    s.on = this.has && !this.hidden;
    s.hard = this.hidden;
    s.dim = this.dim;
    s.reduced = !!st?.reduceCameraMotion;
    s.touch = this.ctx.input?.device === 'touch';
    s.trail = st?.guideTrail !== false;
    s.id = g.id; s.x = g.x; s.y = g.y; s.z = g.z; s.arriveR = g.arriveR; s.ring = g.ring ?? null;
    s.dist = dist;
    decals.setGuide(s);
  }

  /**
   * fix round 2: is a lit Pink Paw print drawn under CSS px (x, y) (within `slop` px of its centre)? touch.js lets a tap
   * there through its button dead ring: the trail's far prints can sit beside the right-thumb cluster at 844×390, and a
   * tap on a print the guide asks for must walk her (the Q1 bot tapped the Mochi trail beside Dodge / Meow for 15 s).
   * @param {number} x @param {number} y @param {number} [slop]
   */
  printAt(x, y, slop = 24) {
    const cam = this.ctx.camera, list = this.ctx.fx?.decals?.guidePrints?.() ?? [];
    if (!cam || !list.length || this.state !== 'on') return false;
    const W = window.innerWidth, H = window.innerHeight;
    cam.getWorldDirection(_f);
    for (const q of list) {
      if (!q.lit) continue;
      _v.set(q.x, q.y, q.z);
      if (_d.copy(_v).sub(cam.position).dot(_f) <= 0) continue;
      _v.project(cam);
      if (Math.hypot((_v.x * 0.5 + 0.5) * W - x, (-_v.y * 0.5 + 0.5) * H - y) <= slop) return true;
    }
    return false;
  }

  /**
   * What a player can see of the guide (§10.7 `__GAME__.guide()`; dev / build:test hooks only): the projected prints,
   * the edge coin, the badge, the objective line, the visible prompt text and the skip chip rectangle.
   */
  snapshot() {
    const ctx = this.ctx, cam = ctx.camera, g = this.guide, W = window.innerWidth, H = window.innerHeight;
    const prints = [];
    const list = ctx.fx?.decals?.guidePrints?.() ?? [];
    if (cam && list.length) {
      cam.getWorldDirection(_f);
      _r.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
      for (const q of list) {
        _v.set(q.x, q.y, q.z);
        if (_d.copy(_v).sub(cam.position).dot(_f) <= 0) continue;
        _v.project(cam);
        if (Math.abs(_v.x) > 1 || Math.abs(_v.y) > 1) continue;
        const sx = (_v.x * 0.5 + 0.5) * W, sy = (-_v.y * 0.5 + 0.5) * H;
        _d.set(q.x, q.y, q.z).addScaledVector(_r, q.r).project(cam);
        const w = Math.abs((_d.x * 0.5 + 0.5) * W - sx) * 2;
        prints.push({ sx: Math.round(sx), sy: Math.round(sy), lit: !!q.lit, w: Math.round(w * 10) / 10 });
      }
    }
    const textOf = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return '';
      const r = e.getBoundingClientRect?.();
      if (!r || !(r.width > 0 && r.height > 0)) return '';
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || +cs.opacity < 0.05) return '';
      return (e.innerText ?? e.textContent ?? '').replace(/\s+/g, ' ').trim();
    };
    const prompt = ['.ui-guide.is-on .gd-hint', '.ui-guide.is-on .gd-say', '.ui-prompt.is-on', '.ui-hint.is-on', '.ui-tag.is-on']
      .map(textOf).filter(Boolean).join(' | ');
    let skipChip = null;
    const chip = document.querySelector('.cin-skip-chip');
    if (chip) {
      const r = chip.getBoundingClientRect(), cs = getComputedStyle(chip);
      if (r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05) skipChip = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    }
    // fix round 2: the ring of lit prints round a lesson's object (she is there: act on it), its centre in CSS px
    let ring = null;
    const rc = ctx.fx?.decals?.guideRing?.();
    if (cam && rc) {
      const y = ctx.physics?.heightAt?.(rc.x, rc.z) ?? ctx.player?.pos?.y ?? 0;
      cam.getWorldDirection(_f);
      _v.set(rc.x, y, rc.z);
      if (_d.copy(_v).sub(cam.position).dot(_f) > 0) { _v.project(cam); ring = { sx: Math.round((_v.x * 0.5 + 0.5) * W), sy: Math.round((-_v.y * 0.5 + 0.5) * H) }; }
    }
    const st = ctx.state;
    const phase = ctx.ui?.menus?.titleActive ? 'title' : ctx.ui?.isLoading ? 'loading' : this.hidden && guideHidden(ctx) ? 'scene'
      : inPractice(ctx) ? 'practice' : !st?.getFlag?.('prologue.done') && (ctx.levels?.current?.id ?? st?.levelId) === 'meadow' ? 'prologue'
        : !st?.getFlag?.('onboard.done') && g.has && g.kind !== 'quest' ? 'onboard' : 'play';
    return {
      phase,
      target: g.has ? { id: g.id, kind: g.kind, textKey: g.textKey } : null,
      objective: ctx.ui?.hud?.guideText ?? '',
      prompt,
      prints,
      edge: this.edgeAt ? { sx: Math.round(this.edgeAt.x), sy: Math.round(this.edgeAt.y) } : null,
      badge: this.badgeAt ? { sx: Math.round(this.badgeAt.x), sy: Math.round(this.badgeAt.y) } : null,
      ring,
      skipChip,
    };
  }

  dispose() {
    for (const off of this._offs) off();
    this.edge.removeEventListener?.('pointerdown', this._onEdge);
    this.badge?.removeEventListener?.('pointerdown', this._onBadge);
    this.ctx.fx?.decals?.setGuide?.(null);
    this.root.remove();
    this.style?.remove();
  }
}
