// src/player/Orders.js  (owner: player) — research/CONTROLS_SPEC.md §5.2 point-and-go orders and their path follower.
//
//   move(point)        the move button on the ground (RMB in `moba` / `mouseOnly`, LMB in `diablo`; `hybrid` walks on
//                      WASD, TOKENTAILS-PLAN §11.2) / a tap on the ground; Shift+RMB queues in `moba` only
//                      (≤ NAV.queueMax; no Ctrl: Ctrl+W closes the tab). Paths over the
//                      physics nav grid, always runs (Zoomies after 2 s as usual), auto-jumps nav links (assisted hop)
//   follow             RMB held / a touch long-press: re-targets under the pointer every NAV.follow s
//   attack(actor)      the move button / LMB (TT3) / tap on a hostile or breakable: selects it, paths to reach (arc + radius − 0.25), faces it,
//                      then `settings.autoAttack` (auto/loop: keep chaining, LoL; chain: one Snip–Snap–Swoosh then the
//                      order ends; off: just face)
//   attackMove(point)  X then a click: path there, fighting any hostile within NAV.attackMoveR m of her on the way
//   use(target)        a click / tap on an interactable or NPC: path to it, face it, then levels.interact / companions.use
//   stop               H: clears the path, the queue and the order target
// A hurt stun pauses any order (it re-plans from wherever the knockback left her); only a guard break (attack orders
// excepted), death, a cutscene or direct input end one.
// Direct input (|move| ≥ 0.15) cancels any order at once (Player.wishDir). The follower feeds Player.wishDir, so every
// state that locomotes (move, charge, Milk Break, the Stand's shuffle) follows the path with its own speed caps.
// Clicks and taps arrive through `input.takeClick()`; picks go through `cam.pick` (camera/Picker.js).
import * as THREE from 'three';
import { NAV, AIM, ATTACKS, PLAYER, GRAVITY } from '../core/config.js';
import { E } from '../core/events.js';
import { hostileTo } from '../core/ActorRegistry.js';
import { wrapAngle } from '../core/math.js';
import { autoTarget, hopSpeed } from './Aim.js';
import { ORDER_FX } from './juice.js';

const _hostile = hostileTo('player');
const SWING = ATTACKS.slash1;
const ORDER_KINDS = new Set(['move', 'follow', 'attack', 'attackMove', 'use', 'stop']);
const _sp = new THREE.Vector3();
/** A* expansion budget for hold-to-follow and stuck re-plans (a fresh click keeps NAV.maxExpand; requests/physics.md). */
const REPLAN_EXPAND = 2000;

export class Orders {
  /** @param {import('./Player.js').Player} p */
  constructor(p) {
    this.p = p;
    this.ctx = p.ctx;
    /** 'move' | 'attack' | 'attackMove' | 'use' | null */
    this.kind = null;
    /** attack / use target (Actor, or a level interactable for use) */
    this.target = null;
    this.point = new THREE.Vector3();
    /** current path (points {x, y, z, link?, to?}) and the waypoint being walked to */
    this.path = [];
    this.wp = 0;
    this.partial = false;
    this._rejectT = -Infinity;                                  // last "mrr?" (s, wall clock)
    /** queued move points (Shift+RMB, `moba` only) */
    this.queue = [];
    /** hold-to-follow (RMB held / touch long-press) */
    this.follow = false;
    this._followT = 0; this._followPt = new THREE.Vector3(); this._followSrc = 'mouse';
    this.attackMoveArmed = false;
    /** attack order: inside reach and swinging; strings done (chain) */
    this.engaged = false;
    this._chainStrings = 0; this._chainRest = 0; this._sawCombo = 0;
    /** attackMove: the point to resume walking to after a fight */
    this._resume = null;
    /** §8.4: a new move order arrived during a swing (PlayerStates.attack honours it) */
    this.pendingSwingCancel = false;
    /** the LMB press that became a use / attack-move order must not swing */
    this.suppressAttack = false;
    this._goal = new THREE.Vector3();
    this._stuck = { t: 0, x: 0, z: 0, fails: 0 };
    this._repathT = 0; this._pathsThisSec = 0; this._pathSecT = 0;
    this._hop = null;
    this._pick = null;
    /** X armed at (s, wall clock): the arm times out after ATTACK_MOVE_ARM s */
    this._armT = 0;
    /** per-order link bookkeeping, kept across re-plans (keyed by the take-off cell): take-offs, run-up done */
    this._linkTries = new Map();
    this._backed = new Set();
    /** a use / attack path that ran out short of reach: the spot it ran out at (one re-plan, then rejected) */
    this._endAt = null;
    /** a hurt stun paused the order: re-plan from the knockback spot when it ends */
    this._hurtPause = false;
    /** WA §3.6 double tap: the last accepted ground order (point + wall-clock s) */
    this._lastTap = { x: 0, z: 0, t: -Infinity };
    /** the pick ray's camera-side ground point for findPath's wall-face snap hint (physics `toward`) */
    this._toward = { x: 0, z: 0 };
  }

  get active() { return this.kind !== null; }
  /** Is she walking a path right now (not arrived / not standing in reach)? */
  get moving() { return this.kind !== null && this.wp < this.path.length && !this.engaged; }

  // ------------------------------------------------------------------ issuing
  /**
   * Issue an order. `arg`: a point ({x, y?, z}) for move / attackMove, an Actor for attack, an Actor or an interactable
   * ({ id, pos, r }) for use. `o.queued` appends a move to the queue; `o.source` 'mouse' | 'touch' | 'pad' | 'api'.
   * Returns true when the order was accepted.
   */
  order(kind, arg, o = {}) {
    if (!ORDER_KINDS.has(kind)) return false;
    const p = this.p;
    if (!p.alive || p.scripted || this.ctx.game?.mode !== 'play') return false;
    if (kind === 'stop') { this.clear('stop'); this._emit('stop', null, null, true, false); return true; }
    if (kind === 'follow') kind = 'move';
    if (kind === 'move' && o.queued && this.kind === 'move' && this.path.length) {
      if (this.queue.length < NAV.queueMax) { this.queue.push(new THREE.Vector3(arg.x, arg.y ?? p.pos.y, arg.z)); this._emit('move', arg, null, true, true); }
      return true;
    }
    this.queue.length = 0;
    this._resume = null;
    if (kind === 'attack' && !this._validTarget(arg)) return false;
    if (kind === 'use' && !arg) return false;
    this.kind = kind;
    this.target = kind === 'attack' || kind === 'use' ? arg : null;
    this.engaged = false; this._chainStrings = 0; this._chainRest = 0; this._sawCombo = 0;
    this._stuck.fails = 0; this._stuck.t = 0;
    this._linkTries.clear(); this._backed.clear(); this._endAt = null; this._hurtPause = false;
    const pt = kind === 'attack' ? arg.pos : kind === 'use' ? (arg.usePos ?? arg.pos) : arg;
    this.point.set(pt.x, pt.y ?? p.pos.y, pt.z);
    if (kind === 'attack') this.ctx.cam?.select?.(arg, o.source === 'touch' ? 'tap' : 'click');
    const ok = this._plan(this.point, o.toward);
    if (p.state === 'attack' && (kind === 'move' || kind === 'attackMove')) this.pendingSwingCancel = true;
    if (p.state === 'guard' && kind !== 'attack') { /* the Stand plants her: the order waits until she lets go */ }
    // WA §3.6: a second ground order on the same spot within 0.35 s → double paw + a happy hop (feedback only)
    let double = false;
    if (ok && (kind === 'move' || kind === 'attackMove') && (o.source === 'mouse' || o.source === 'touch')) {
      const now = performance.now() / 1000, L = this._lastTap;
      double = now - L.t <= ORDER_FX.doubleT && Math.hypot(this.point.x - L.x, this.point.z - L.z) <= ORDER_FX.doubleR;
      L.x = this.point.x; L.z = this.point.z; L.t = double ? -Infinity : now;
    }
    this._emit(kind, this.point, this.target, ok, false, double);
    if (!ok || this.partial) this._rejectFx(ok);
    return ok;
  }

  /** Clear the order (and the queue). `reason` for debugging. */
  clear(reason = '') {
    this.kind = null; this.target = null; this.path.length = 0; this.wp = 0; this.queue.length = 0;
    this.engaged = false; this.follow = false; this._resume = null; this.pendingSwingCancel = false; this._hop = null;
    this._endAt = null; this._hurtPause = false;
    this.lastClear = reason;
  }

  /** Direct movement input took over (WASD / stick past 0.15): any order ends (§5.1). */
  cancelByDirect() { if (this.kind) this.clear('direct'); this.attackMoveArmed = false; }

  /** End an order that can't get there: grey ✕ (player:order valid:false), "mrr?" and the head shake. */
  _fail(reason) {
    this.partial = true;
    this._emit(this.kind, this.point, this.target, false, false);
    this.clear(reason);
    this._rejectFx(false);
  }
  /** Attack input (LMB / ⚔ / X) cancels a move order (§5.2 interplay). */
  onAttackInput() { if (this.kind === 'move') this.clear('attack'); }
  /** Tumble keeps a move order (it resumes after the roll), drops attack / use. */
  onDodge() { if (this.kind === 'attack' || this.kind === 'use') this.clear('dodge'); this._hop = null; }
  /** The Stand plants her: move orders clear; an attack order pauses. */
  onGuard() { if (this.kind === 'move' || this.kind === 'attackMove' || this.kind === 'use') this.clear('guard'); }

  /**
   * §5.2 rejected / partial order feedback (the grey ✕ marker rides player:order): the "mrr?" (`ui.error`) and a little
   * head shake. Core's Input already buzzes on `valid: false`; a partial order she still walks buzzes here.
   */
  _rejectFx(valid) {
    const ctx = this.ctx;
    if (valid) ctx.input?.haptic?.('orderRejected');
    const now = performance.now() / 1000;
    if (now - this._rejectT < 0.25) return;                     // a burst of clicks on deep water: one chirp
    this._rejectT = now;
    try { ctx.audio?.play2D?.('ui.error', { volume: 0.45, bus: 'ui' }); } catch (e) { console.warn('[orders] reject sound failed', e); }
    if (!valid) try { this.p.model?.emote?.('shake'); } catch { /* model mid-swap */ }
  }

  _validTarget(a) { return !!a && a.alive !== false && !!a.pos && a.hurtable !== false; }

  _emit(kind, point, target, valid, queued, double = false) {
    this.ctx.bus?.emit?.(E.PLAYER_ORDER, { kind, point: point ? new THREE.Vector3(point.x, point.y ?? this.p.pos.y, point.z) : null, target: target ?? null, valid: !!valid, queued: !!queued, partial: !!this.partial, double: !!double });
  }

  /**
   * Path to `goal` (a nav path, else a straight line). Returns false when nothing at all is reachable. `toward` ({x, z},
   * optional): the camera side of the pick ray, physics' snap hint for clicks on the far face of a wall.
   */
  _plan(goal, toward = null, maxExpand = 0) {
    const p = this.p, ph = this.ctx.physics;
    this._goal.copy(goal);
    this.wp = 0;
    this.path.length = 0;
    this.partial = false;
    if (typeof ph?.findPath !== 'function' || !ph.nav) {
      this.path.push({ x: goal.x, y: goal.y, z: goal.z });
      return true;
    }
    // a fresh click keeps physics' default budget; hold-to-follow and stuck re-plans use REPLAN_EXPAND (requests/physics.md)
    const r = toward || maxExpand ? ph.findPath(p.pos, goal, maxExpand ? (toward ? { toward, maxExpand } : { maxExpand }) : { toward }) : ph.findPath(p.pos, goal);
    this._pathsThisSec++;
    if (!r?.points?.length) {
      // she stands on the goal cell already, or nothing is reachable
      if (Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z) < NAV.arriveMid) return true;
      this.partial = true;
      return false;
    }
    // a ground order with no progress possible: the path ends where she stands but the click is farther off (deep
    // water, a rock she is already hugging) → rejected (grey ✕ + "mrr?"), not a silent marker under a cat that never
    // moves. attack / use goals sit inside their actor's collider, so standing next to one is "in reach", not rejected.
    const end = r.points[r.points.length - 1];
    if ((this.kind === 'move' || this.kind === 'attackMove') && r.points.length === 1 && !end.link && Math.hypot(end.x - p.pos.x, end.z - p.pos.z) < NAV.arriveMid) {
      if (Math.hypot(goal.x - end.x, goal.z - end.z) < NAV.arriveMid) return true;   // already there
      this.partial = true;
      return false;
    }
    for (const q of r.points) this.path.push(q);
    this.partial = !!r.partial;
    // the first point may be her own cell: skip it when she is on it
    if (this.path.length > 1 && !this.path[0].link && Math.hypot(this.path[0].x - p.pos.x, this.path[0].z - p.pos.z) < NAV.arriveMid) this.wp = 1;
    return true;
  }

  // ------------------------------------------------------------------ input (clicks, taps, hold-to-follow)
  /** Fixed step, from Player._readInput (before the attack buffer is read). */
  handleInput(dt) {
    const ctx = this.ctx, input = ctx.input, p = this.p;
    this.suppressAttack = false;
    if (!input?.takeClick) return;
    if (ctx.game?.mode !== 'play' || p.scripted) { input.clearClicks?.(); this.follow = false; this.attackMoveArmed = false; return; }
    const now = performance.now() / 1000;
    if (input.pressed('attackMove')) { this.attackMoveArmed = true; this._armT = now; }
    // LoL: Esc cancels the targeting; the arm also lapses after a few seconds with no click
    if (this.attackMoveArmed && (input.pressed('back') || input.pressed('pause') || now - this._armT > ATTACK_MOVE_ARM)) this.attackMoveArmed = false;
    if (input.pressed('stop')) {
      this.clear('stop');
      this.attackMoveArmed = false;
      const cg = ctx.cam?.cursorValid ? ctx.cam.cursorGround : null;
      if (cg && input.device === 'kbm') p.facing = Math.atan2(cg.x - p.pos.x, cg.z - p.pos.z);
      this._emit('stop', null, null, true, false);
    }
    for (let c = input.takeClick(); c; c = input.takeClick()) {
      if (c.button === 'tap') this._tap(c);
      else if (c.down) this._click(c);
    }
    // hold-to-follow: re-target under the pointer every NAV.follow s (≤ NAV.pathsPerSec re-paths per second)
    if ((this._pathSecT += dt) >= 1) { this._pathSecT = 0; this._pathsThisSec = 0; }
    if (this.follow) {
      const mouse = this._followSrc === 'mouse';
      if (mouse && !input.down('move')) this.follow = false;
      else if ((this._followT -= dt) <= 0) {
        this._followT = NAV.follow;
        let pt = null;
        if (mouse && ctx.cam?.cursorValid) pt = ctx.cam.cursorGround;
        else if (!mouse) pt = this._followPt;
        if (pt && this.kind === 'move' && Math.hypot(pt.x - this._goal.x, pt.z - this._goal.z) > 0.3) {
          this.point.set(pt.x, pt.y, pt.z);
          if (ctx.physics?.losWalkable?.(p.pos, pt)) { this._goal.copy(pt); this.path.length = 0; this.path.push({ x: pt.x, y: pt.y, z: pt.z }); this.wp = 0; this.partial = false; }
          else if (this._pathsThisSec < NAV.pathsPerSec) this._plan(this.point, null, REPLAN_EXPAND);
        }
      }
    }
  }

  /** A mouse button went down at CSS px (c.x, c.y). */
  _click(c) {
    const ctx = this.ctx, input = ctx.input, cam = ctx.cam;
    if (!cam?.pick) return;
    const code = 'Mouse' + c.button;
    const acts = input.keyTable ? Object.entries(input.keyTable).filter(([, cs]) => cs?.includes(code)).map(([a]) => a) : [];
    const isMove = acts.includes('move'), isAttack = acts.includes('attack');
    if (!isMove && !isAttack) return;
    const pk = cam.pick(c.x, c.y);
    this._pick = pk;
    const point = Number.isFinite(pk.point?.x) ? pk.point : null;
    // LoL: while X is armed the attack button fires the attack-move and a move click cancels the targeting (a plain
    // move). A preset with no mouse attack button (diablo: LMB moves) fires it with the move click.
    const mouseAttack = (input.keyTable?.attack ?? []).some((cs) => /^Mouse/.test(cs));
    if (this.attackMoveArmed && isMove && !isAttack && mouseAttack) this.attackMoveArmed = false;
    if (this.attackMoveArmed && (isMove || isAttack)) {
      this.attackMoveArmed = false;
      if (point) this.order('attackMove', point, { source: 'mouse' });
      this.suppressAttack = isAttack;
      return;
    }
    if (isMove) {
      if (pk.kind === 'enemy' || pk.kind === 'breakable') { this.order('attack', pk.actor, { source: 'mouse' }); return; }
      if ((pk.kind === 'interact' || pk.kind === 'npc') && this._useTarget(pk)) { this.order('use', this._useTarget(pk), { source: 'mouse' }); return; }
      if (this._isSelf(c, pk)) { this.p.onSelfTap?.(); return; }          // WA §5.6: a click on her is a pat, not an order
      if (point) {
        const queued = !!c.mods?.shift && input.preset === 'moba';
        this.order('move', point, { queued, source: 'mouse', toward: this._towardPoint() });
        if (!queued) { this.follow = true; this._followSrc = 'mouse'; this._followT = NAV.follow * 2; }
      }
      return;
    }
    // LMB (hybrid): swings toward the cursor; TT3 §11.5 K3: on a hostile it gives the attack order (walk in, then chain
    // per settings.autoAttack), and the press itself swings only when the foe is already in reach; on a friend / object
    // it uses it when no hostile is alerted within 10 m (she never swings at friends)
    if (pk.kind === 'enemy' || pk.kind === 'breakable') {        // a foe, or a practice dummy / crate / Mochi's lock
      const t = pk.actor, me = this.p.pos;
      const far = !!t?.pos && Math.hypot(t.pos.x - me.x, t.pos.z - me.z) > SWING.arc.range + (t.radius ?? 0.3) + 0.25;
      if (this.order('attack', t, { source: 'mouse' }) && far) this.suppressAttack = true;
      else if (!this.kind && pk.kind === 'enemy') cam.select?.(t, 'click');
      return;
    }
    if ((pk.kind === 'interact' || pk.kind === 'npc') && !this.p._alertedWithin(ATTACK_SAFE_R) && this._useTarget(pk)) {
      this.order('use', this._useTarget(pk), { source: 'mouse' });
      this.suppressAttack = true;
    }
  }

  /** A touch tap / long-press from ui (input.addTap). */
  _tap(c) {
    const ctx = this.ctx, cam = ctx.cam, st = ctx.state?.settings ?? {};
    if (!cam?.pick) return;
    if (c.kind === 'longEnd') { this.follow = false; return; }
    if (c.kind === 'move') {
      if (this.follow) { const g = cam.screenToGround?.(c.x, c.y, this._followPt); if (!g) this._followPt.copy(this.point); }
      return;
    }
    const pk = cam.pick(c.x, c.y, { touch: true });
    this._pick = pk;
    const point = Number.isFinite(pk.point?.x) ? pk.point : null;
    if (c.kind === 'long') {
      if (st.tapToMove === false || !point) return;
      this.order('move', point, { source: 'touch' });
      this.follow = true; this._followSrc = 'touch'; this._followPt.copy(point); this._followT = NAV.follow;
      return;
    }
    if (pk.kind === 'enemy') {
      if (pk.actor === cam.lockTarget && this.kind === 'attack' && this.target === pk.actor) { cam.select?.(null, 'tap'); this.clear('untap'); return; }
      this.order('attack', pk.actor, { source: 'touch' });
      return;
    }
    if (pk.kind === 'breakable') { this.order('attack', pk.actor, { source: 'touch' }); return; }
    if ((pk.kind === 'interact' || pk.kind === 'npc') && this._useTarget(pk)) { this.order('use', this._useTarget(pk), { source: 'touch' }); return; }
    if (this._isSelf(c, pk)) { this.p.onSelfTap?.(); return; }            // WA §5.6: a tap on her is a pat, not an order
    if (cam.lockTarget) cam.select?.(null, 'tap');
    if (st.tapToMove !== false && point) this.order('move', point, { source: 'touch', toward: this._towardPoint() });
  }

  /**
   * WA §5.6 "tap / click her": a ground pick within ORDER_FX.selfR m of her feet, or (with a renderer) a press within
   * ORDER_FX.selfPx CSS px of her body on screen. The picker never returns her, so this is decided here.
   */
  _isSelf(c, pk) {
    const p = this.p, ctx = this.ctx;
    if (pk?.kind && pk.kind !== 'ground') return false;
    const pt = pk?.point;
    if (pt && Number.isFinite(pt.x) && Math.hypot(pt.x - p.pos.x, pt.z - p.pos.z) <= ORDER_FX.selfR) return true;
    const cam = ctx.camera, el = ctx.renderer?.domElement;
    if (!cam?.isCamera || !el || !Number.isFinite(c?.x)) return false;
    const r = el.getBoundingClientRect?.(), w = r?.width || el.clientWidth, h = r?.height || el.clientHeight;
    if (!(w > 0 && h > 0)) return false;
    const H = p.height ?? 0.8;
    for (const f of ORDER_FX.selfH) {
      _sp.set(p.pos.x, p.pos.y + H * f, p.pos.z).project(cam);
      if (_sp.z > 1) continue;
      const sx = (r?.left ?? 0) + (_sp.x * 0.5 + 0.5) * w, sy = (r?.top ?? 0) + (0.5 - _sp.y * 0.5) * h;
      if (Math.hypot(sx - c.x, sy - c.y) <= ORDER_FX.selfPx) return true;
    }
    return false;
  }

  /** The camera's ground position (the pick ray's camera side) for findPath's `toward` hint, or null. */
  _towardPoint() {
    const cp = this.ctx.camera?.position;
    if (!cp || !Number.isFinite(cp.x)) return null;
    this._toward.x = cp.x; this._toward.z = cp.z;
    return this._toward;
  }

  /** The use-order target of a pick: the level interactable, else the NPC / kitten actor. */
  _useTarget(pk) {
    if (pk.interact) return pk.interact;
    if (pk.actor) {
      const id = pk.actor.interactId;
      const it = id ? this.ctx.levels?.current?.interactables?.find?.((i) => i.id === id) : null;
      return it ?? pk.actor;
    }
    return null;
  }

  // ------------------------------------------------------------------ fixed step
  /** Advance the order (before the state machine runs). */
  update(dt) {
    const p = this.p;
    if (!this.kind) return;
    if (!p.alive || p.scripted) { this.clear('dead'); return; }
    // a click is a commitment (LoL): a hurt stun pauses every order and it resumes when the stun ends, re-planned from
    // wherever the knockback left her. A guard break drops walking orders; an attack order waits that out too.
    if (p.state === 'dead') { this.clear('dead'); return; }
    if (p.state === 'stagger' && this.kind !== 'attack') { this.clear('guardBreak'); return; }
    if (p.state === 'hurt' || p.state === 'stagger') { this._hurtPause = true; this._hop = null; return; }
    if (this._hurtPause) {
      this._hurtPause = false;
      const goal = this.kind === 'attack' ? (this.engaged ? null : this.target?.pos) : this.path.length ? (this.kind === 'move' ? this._goal : this.point) : null;
      if (goal && !this._plan(goal)) { this._fail('unreachable'); return; }
    }
    switch (this.kind) {
      case 'attack': this._updateAttack(dt); break;
      case 'use': this._updateUse(dt); break;
      case 'attackMove': this._updateAttackMove(dt); break;
      default: break;
    }
    if (!this.kind) return;
    this._advance(dt);
  }

  /** Walk the waypoints: arrival tolerances, link jumps, stuck re-plans, the queue. */
  _advance(dt) {
    const p = this.p;
    if (this.engaged) return;
    if (this.wp >= this.path.length) {
      if (this.kind === 'move') {
        if (this.queue.length) { const q = this.queue.shift(); this.point.copy(q); if (!this._plan(q)) this._fail('unreachable'); }
        else if (!this.follow) { this.clear('arrived'); p.onArrive?.(); }   // a plain move: a little turn to the lens
      } else if ((this.kind === 'use' || this.kind === 'attack') && p.onGround && p.state === 'move') this._pathSpent();
      return;
    }
    const w = this.path[this.wp], last = this.wp === this.path.length - 1;
    const dx = w.x - p.pos.x, dz = w.z - p.pos.z, d = Math.hypot(dx, dz);
    // a bounce link (§5.4): the take-off is ON a bounce cap. She never stands on a cap (physics springs her off it),
    // so steer the spring itself: right after a bounce near the take-off, aim the airtime at the landing
    const bounceT = (this.ctx.game?.time ?? 0) - (p.lastBounceT ?? -Infinity);
    // a hop that came down on a bounce cap has landed (she never touches ground there): let the waypoints move on
    if (this._hop && !p.onGround && bounceT >= 0 && bounceT < 0.25 && (p.lastBounceT ?? -Infinity) > (this._hop.t0 ?? -Infinity) + 0.05) this._hop = null;
    const bouncing = !p.onGround && bounceT >= 0 && bounceT < 0.25;
    // any link while she springs off a cap is flown as a bounce: a ground take-off (hop / drop) never fires there
    // (she is never onGround on a cap), so a path planned before the nav grid knew the cap would trap her bouncing
    if (w.link && (w.link === 'bounce' || bouncing)) {
      const to = w.to ?? this.path[this.wp + 1];
      if (to && bouncing && d <= NAV.linkStart + 0.9) { this._bounceLink(to); this.wp++; return; }
    }
    // springing off a cap short of the next point (a take-off at the cap's far rim, or plain ground beyond it): steer
    // the spring onto it — walking input alone can't carry her there in the air
    if (bouncing && !this._hop && d > (w.link ? NAV.linkStart : (last ? NAV.arrive : NAV.arriveMid))) { this._bounceLink(w, false); return; }
    // a link take-off: jump once she is close and facing it
    if (w.link && w.link !== 'bounce' && p.onGround && !this._hop) {
      const to = w.to ?? this.path[this.wp + 1];
      if (d <= NAV.linkStart && to) {
        const ax = to.x - p.pos.x, az = to.z - p.pos.z, yaw = Math.atan2(ax, az);
        if (Math.abs(wrapAngle(yaw - p.facing)) <= NAV.linkFacing || d < 0.25) {
          if ((this._linkTries.get(this._linkKey(w)) ?? 0) > NAV.stuck.retries) { this._fail('link'); return; }
          if (this._jumpLink(to)) { this._takeOff(w); this.wp++; return; }
          // too close to the obstacle for any arc to clear it: back up for a run-up (once per link, across re-plans),
          // then retry. The run-up spot must be on the surface she stands on: backing off a crate drops her a level
          // and the re-plan hops her straight back up (an endless crate loop)
          const key = this._linkKey(w);
          if (!this._backed.has(key)) {
            this._backed.add(key);
            const l = Math.hypot(ax, az) || 1, bx = p.pos.x - (ax / l) * 1.1, bz = p.pos.z - (az / l) * 1.1;
            const by = this._sameSurfaceY(bx, bz);
            if (by != null) { this.path.splice(this.wp, 0, { x: bx, y: by, z: bz }); return; }
          }
          if (!this._takeOff(w)) return;
          this._jumpLink(to, true);
          this.wp++;
          return;
        }
      }
    }
    if (this._hop && p.onGround && p.stateT > 0.05 && !p.jumping) this._hop = null;
    const tol = last ? (this.kind === 'move' ? NAV.arrive : NAV.arriveMid) : NAV.arriveMid;
    if (!w.link && d <= tol && !(this._hop && !p.onGround)) { this.wp++; this._stuck.t = 0; return; }
    // stuck: < 0.3 m of progress in 0.4 s → re-plan; 3 failed re-plans → stop (grey marker)
    const S = this._stuck;
    if (this.moving && p.onGround && (p.state === 'move' || p.state === 'sip')) {
      S.t += dt;
      if (S.t >= NAV.stuck.time) {
        const moved = Math.hypot(p.pos.x - S.x, p.pos.z - S.z);
        S.t = 0; S.x = p.pos.x; S.z = p.pos.z;
        if (moved < NAV.stuck.dist) {
          if (++S.fails > NAV.stuck.retries) { this.partial = true; this._emit(this.kind, this.point, this.target, false, false); this.clear('stuck'); this._rejectFx(false); return; }
          // a dynamic collider (cart, gate) may have closed the route: no path is a rejection, not a silent "arrived"
          if (!this._plan(this.kind === 'attack' && this.target?.pos ? this.target.pos : this._goal, null, REPLAN_EXPAND)) { this._fail('unreachable'); return; }
        } else S.fails = Math.max(0, S.fails - 1);
      }
    } else { S.t = 0; S.x = p.pos.x; S.z = p.pos.z; }
  }

  /** Take-off bookkeeping key: the link's take-off cell (stable across re-plans). */
  _linkKey(w) {
    const nav = this.ctx.physics?.nav;
    const k = nav?.index ? nav.index(w.x, w.z) : -1;
    return k >= 0 ? k : `${Math.round(w.x * 2)},${Math.round(w.z * 2)}`;
  }

  /**
   * Count a take-off at link `w`. The same take-off tried more than NAV.stuck.retries + 1 times in one order (she
   * keeps landing back before it: a hop that never sticks) ends the order with the grey ✕ — the stuck detector never
   * sees this, she is moving the whole time. Returns false when the order ended.
   */
  _takeOff(w) {
    const key = this._linkKey(w), n = (this._linkTries.get(key) ?? 0) + 1;
    this._linkTries.set(key, n);
    if (n > NAV.stuck.retries + 1) { this._fail('link'); return false; }
    return true;
  }

  /** The nav height at (x, z) when it is the surface she stands on (within NAV.stepUp), else null. */
  _sameSurfaceY(x, z) {
    const ph = this.ctx.physics, nav = ph?.nav, p = this.p;
    if (ph?.navWalkable?.(x, z) === false) return null;
    if (!nav?.h || !nav.index) return p.pos.y;
    const k = nav.index(x, z);
    if (k < 0 || (nav.walkable && !nav.walkable(k))) return null;
    const h = nav.h[k];
    return Number.isFinite(h) && Math.abs(h - p.pos.y) <= NAV.stepUp ? h : null;
  }

  /**
   * A use / attack path ran out with the target still out of reach (it stands on an island, a ledge, past a partial
   * path): re-plan once; ran out again at the same spot → rejected (grey ✕ + "mrr?"), never a ring that waits forever.
   */
  _pathSpent() {
    const p = this.p, t = this.target;
    if (!t?.pos) return;
    const d = Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
    const reach = this.kind === 'use' ? (t.useR ?? Math.max(0.6, (t.r ?? 1.5) - NAV.useOffset)) : SWING.arc.range + (t.radius ?? 0.3) - 0.25;
    if (d <= reach) return;
    const e = this._endAt;
    if (e && Math.hypot(p.pos.x - e.x, p.pos.z - e.z) < 0.5) { this._fail('unreachable'); return; }
    this._endAt = { x: p.pos.x, z: p.pos.z };
    this._plan(this.kind === 'attack' ? t.pos : this.point);
    // nothing new to walk (she stands on the end already): the re-plan changed nothing → reject now
    if (this.wp >= this.path.length) this._fail('unreachable');
  }

  /** Steer a bounce (already airborne off a cap) onto `to`: the horizontal speed that covers the gap in the airtime left. */
  _bounceLink(to, count = true) {
    const p = this.p, g = GRAVITY * (p.gravityMul ?? 1);
    const dx = to.x - p.pos.x, dz = to.z - p.pos.z, dist = Math.hypot(dx, dz);
    const vy = Math.max(0, p.vel.y), tUp = vy / g, apex = p.pos.y + (vy * vy) / (2 * g);
    const fall = Math.max(0.05, apex - (to.y ?? p.pos.y));
    const T = tUp + Math.sqrt((2 * fall) / (GRAVITY * PLAYER.fallGravityMul));
    const v = Math.min(NAV.hopMaxH, Math.max(1.0, (dist + 0.1) / Math.max(0.15, T)));
    p.facing = Math.atan2(dx, dz);
    p.vel.x = (dx / (dist || 1)) * v; p.vel.z = (dz / (dist || 1)) * v;
    this._hop = { v, x: to.x, z: to.z, t0: this.ctx.game?.time ?? 0 };
    if (count) this.hops = (this.hops ?? 0) + 1;
  }

  /** Assisted hop over a nav link (§5.4): a full jump with the horizontal speed that lands on `to`. */
  _jumpLink(to, force = false) {
    const p = this.p;
    const dx = to.x - p.pos.x, dz = to.z - p.pos.z, dist = Math.hypot(dx, dz);
    const dh = (to.y ?? p.pos.y) - p.pos.y;
    let v = hopSpeed(dist + 0.15, dh, PLAYER.jumpV, GRAVITY, NAV.hopMaxH, PLAYER.fallGravityMul);
    if (v == null) v = Math.min(NAV.hopMaxH, PLAYER.run);
    v = Math.max(v, 2.0);
    // clear what is in between (a fence, a low wall): pick the horizontal speed whose arc is above the obstacle top
    // while her body is over it
    const ob = this._obstacle(dx / (dist || 1), dz / (dist || 1), dist);
    if (ob) {
      const H = ob.top - p.pos.y + 0.08, g = GRAVITY, v0 = PLAYER.jumpV, r = (p.radius ?? 0.32) + 0.08;
      const disc = v0 * v0 - 2 * g * H;
      if (disc > 0) {
        const t0 = (v0 - Math.sqrt(disc)) / g, t1 = (v0 + Math.sqrt(disc)) / g;     // time above the top
        const vMin = (ob.s1 + r) / t1, vMax = t0 > 1e-3 ? (ob.s0 - r) / t0 : Infinity;
        if (vMin <= vMax) v = Math.min(NAV.hopMaxH, Math.max(vMin, Math.min(vMax, Math.max(v, (vMin + Math.min(vMax, NAV.hopMaxH)) / 2))));
        else if (!force) return false;
      }
    }
    p.facing = Math.atan2(dx, dz);
    p.doJump();
    p.jumpCutDone = true;                                            // an order hop is never cut short
    p.vel.x = (dx / (dist || 1)) * v; p.vel.z = (dz / (dist || 1)) * v;
    this._hop = { v, x: to.x, z: to.z, t0: this.ctx.game?.time ?? 0 };
    this.hops = (this.hops ?? 0) + 1;
    return true;
  }

  /**
   * The obstacle a jump along (ux, uz) passes over within `len` m of her (nav grid): { s0, s1 (distances), top } or null.
   */
  _obstacle(ux, uz, len) {
    const nav = this.ctx.physics?.nav, p = this.p;
    if (!nav?.top) return null;
    let s0 = -1, s1 = -1, top = -Infinity;
    for (let s = 0.1; s <= len + 0.05; s += 0.1) {
      const k = nav.index(p.pos.x + ux * s, p.pos.z + uz * s);
      if (k < 0) break;
      const blocked = !nav.walkable(k);
      const h = blocked ? nav.top[k] : nav.h[k];
      if (blocked || h > p.pos.y + NAV.stepUp) {
        if (s0 < 0) s0 = s;
        s1 = s; top = Math.max(top, h);
      }
    }
    if (s0 < 0 || !Number.isFinite(top) || top > p.pos.y + NAV.fence.top + 0.6) return null;
    return { s0, s1, top };
  }

  /** Attack order: approach to reach, then swing per settings.autoAttack. */
  _updateAttack(dt) {
    const p = this.p, t = this.target;
    if (!this._validTarget(t) || t.dead) {
      // a dead target: attack-move resumes its walk; else the order ends
      if (this._resume) { const r = this._resume; this._resume = null; this.kind = 'attackMove'; this.target = null; this.engaged = false; this.point.copy(r); this._plan(r); return; }
      this.clear('target');
      return;
    }
    const d = Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
    if (d > NAV.leash) { this.clear('leash'); return; }
    const reach = SWING.arc.range + (t.radius ?? 0.3) - 0.25;
    if (d <= reach + (this.engaged ? 0.6 : 0)) {
      this.engaged = true;
      if (p.state === 'move' || p.state === 'attack') {
        if (p.state === 'move') p.facing = Math.atan2(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
        this._autoSwing(dt);
      }
      return;
    }
    this.engaged = false;
    // re-path when the target moved more than NAV.retarget m from the planned goal
    if (Math.hypot(t.pos.x - this._goal.x, t.pos.z - this._goal.z) > NAV.retarget && this._pathsThisSec < NAV.pathsPerSec) this._plan(t.pos);
  }

  /** §8.3 auto-attack after an attack order reached its target. */
  _autoSwing(dt) {
    const p = this.p, st = this.ctx.state?.settings ?? {};
    let mode = st.autoAttack ?? 'auto';
    // LoL: a right-click on a foe is continuous auto-attack on every device (the Stand, Tumble, direct input or a new
    // order interrupt it). 'chain' is the opt-in one-string variant
    if (mode === 'auto') mode = 'loop';
    if (mode === 'off') return;
    // §8.3: the Stand pauses the chain. While it is held (or a fresh press is buffered) no auto press is fed, and an
    // auto press still sitting in the buffer is dropped, so a parry is never swallowed by the next auto swing (or by a
    // slash out of the Stand from a stale buffer); a real ⚔ press is left alone (that is a deliberate slash / Riposte)
    if (p.standPending()) {
      if (this._autoBuf && !p.attackPressedSince(PLAYER.assist.buffer)) p.attackBuf = 0;
      this._autoBuf = false;
      return;
    }
    // chain: the string is done → the order ends (no silent "engaged" order with nothing happening; click again)
    if (mode === 'chain' && this._chainStrings >= 1 && p.state === 'move') { this.clear('chainDone'); return; }
    // count finished strings (the last combo step of a string ran)
    if (p.state === 'attack' && p.comboIndex >= 3) this._sawCombo = 3;
    if (p.state === 'move' && this._sawCombo >= 3) { this._sawCombo = 0; this._chainStrings++; this._chainRest = AIM.autoChainRest; if (mode === 'chain') return; }
    if (this._chainRest > 0) { this._chainRest -= dt; return; }
    if (!p.onGround) return;
    // press: from neutral, and inside each swing's combo window (the auto-combo grace chains Snip → Snap → Swoosh)
    if (p.state === 'move' || (p.state === 'attack' && p.swing?.def?.next && !p.swing.queued)) { p.attackBuf = Math.max(p.attackBuf, PLAYER.assist.buffer * 0.5); this._autoBuf = true; }
  }

  /** Use order: walk to the target's reach, face it, use it. */
  _updateUse() {
    const p = this.p, t = this.target, ctx = this.ctx;
    if (!t?.pos) { this.clear('use'); return; }
    if (t.enabled && !t.enabled()) { this.clear('disabled'); return; }
    const reach = t.useR ?? Math.max(0.6, (t.r ?? 1.5) - NAV.useOffset);
    const d = Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
    if (d > reach) return;
    if (p.state !== 'move' || !p.onGround) return;
    p.facing = Math.atan2(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
    p.vel.x *= 0.3; p.vel.z *= 0.3;
    const target = t;
    this.clear('used');
    try {
      if (target.pickKind && typeof ctx.companions?.use === 'function') ctx.companions.use(target);
      else if (target.id != null && !target.object3d) ctx.levels?.current?.interact?.(target.id);
      else target.use?.();
    } catch (e) { console.warn('[player] use order failed', e); }
  }

  /** Attack-move: walking, but any hostile within NAV.attackMoveR m of her becomes an attack order (then resume). */
  _updateAttackMove() {
    const p = this.p;
    const list = this.ctx.actors?.queryRadius?.(p.pos, NAV.attackMoveR + 1, _hostile) ?? [];
    const t = autoTarget(p.pos, p.facing, list, NAV.attackMoveR, null, this.ctx.cam?.lockTarget ?? null, null, p.pos.y);
    if (t && !t.breakable) {
      const resume = this.point.clone();
      this.kind = 'attack'; this.target = t; this.engaged = false; this._chainStrings = 0; this._sawCombo = 0;
      this._resume = resume;
      this.ctx.cam?.select?.(t, 'auto');
      this._plan(t.pos);
      return;
    }
    if (this.wp >= this.path.length) this.clear('arrived');
  }

  // ------------------------------------------------------------------ steering (Player.wishDir)
  /**
   * The order's movement wish into `out` (unit XZ × magnitude; magnitude 1 = run). 0 when the order isn't walking.
   * @param {THREE.Vector3} out @returns {number}
   */
  steer(out) {
    const p = this.p;
    out.set(0, 0, 0);
    if (!this.kind || this.engaged || this.wp >= this.path.length) return 0;
    if (this._hop && !p.onGround) {
      const dx = this._hop.x - p.pos.x, dz = this._hop.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.05) return 0;
      out.set(dx / d, 0, dz / d);
      return Math.max(0.05, magForSpeed(this._hop.v));
    }
    let w = this.path[this.wp];
    let dx = w.x - p.pos.x, dz = w.z - p.pos.z, d = Math.hypot(dx, dz);
    // corner look-ahead: blend toward the next point inside NAV.cornerLook of an intermediate corner
    const next = !w.link ? this.path[this.wp + 1] : null;
    if (next && d < NAV.cornerLook) {
      const k = 1 - d / NAV.cornerLook;
      const nx = next.x - p.pos.x, nz = next.z - p.pos.z, nl = Math.hypot(nx, nz) || 1;
      dx = dx / (d || 1) * (1 - k) + (nx / nl) * k; dz = dz / (d || 1) * (1 - k) + (nz / nl) * k;
      d = Math.max(d, 0.3);
    }
    const l = Math.hypot(dx, dz);
    if (l < 1e-4) return 0;
    out.set(dx / l, 0, dz / l);
    const last = this.wp === this.path.length - 1;
    // attack approach: stop at reach (the target, not its cell)
    if (this.kind === 'attack' && this.target?.pos && last) {
      const t = this.target, reach = SWING.arc.range + (t.radius ?? 0.3) - 0.25;
      const dt = Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) - reach;
      if (dt < NAV.slowR) return Math.max(0.35, Math.max(0, dt) / NAV.slowR);
      return 1;
    }
    if (last && !this.follow && this.kind !== 'use' && d < NAV.slowR) return Math.max(0.3, d / NAV.slowR);
    return 1;
  }

  // ------------------------------------------------------------------ AUTOCAM §5.3 (the camera reads these)
  /**
   * The point `dist` m ahead of her along the live path into `out` ({x, z} or a Vector3; y = that path point's y).
   * The direct-line follower (one point) returns the point on that segment; a hop in flight looks at its landing.
   * Returns false (out = her position) when no order is walking. Zero allocation.
   * @param {number} dist @param {{x:number, y?:number, z:number}} out @returns {boolean}
   */
  lookAhead(dist, out) {
    const p = this.p, hasY = 'y' in out;
    out.x = p.pos.x; out.z = p.pos.z; if (hasY) out.y = p.pos.y;
    if (!this.moving) return false;
    let px = p.pos.x, pz = p.pos.z, left = Math.max(0, dist);
    if (this._hop && !p.onGround) {
      const dx = this._hop.x - px, dz = this._hop.z - pz, d = Math.hypot(dx, dz);
      if (d > 1e-4) { const k = Math.min(1, left / d); out.x = px + dx * k; out.z = pz + dz * k; }
      return true;
    }
    for (let i = this.wp; i < this.path.length; i++) {
      const w = this.path[i], dx = w.x - px, dz = w.z - pz, d = Math.hypot(dx, dz);
      if (d >= left) {
        const k = d > 1e-6 ? left / d : 0;
        out.x = px + dx * k; out.z = pz + dz * k; if (hasY) out.y = w.y ?? p.pos.y;
        return true;
      }
      left -= d; px = w.x; pz = w.z;
      out.x = px; out.z = pz; if (hasY) out.y = w.y ?? p.pos.y;
    }
    return true;
  }

  /** Metres left along the live path (her → the waypoints → the end, an attack order to its reach); 0 when idle. */
  remaining() {
    if (!this.moving) return 0;
    const p = this.p;
    let px = p.pos.x, pz = p.pos.z, sum = 0;
    for (let i = this.wp; i < this.path.length; i++) {
      const w = this.path[i];
      sum += Math.hypot(w.x - px, w.z - pz); px = w.x; pz = w.z;
    }
    if (this.kind === 'attack' && this.target?.pos) {
      const t = this.target, reach = SWING.arc.range + (t.radius ?? 0.3) - 0.25;
      sum = Math.min(sum, Math.max(0, Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) - reach));
    }
    if (this.follow) return Math.max(sum, NAV.slowR);           // hold-to-follow never "arrives"
    return sum;
  }
}

/** §8 LMB on a friend uses it only when no hostile is alerted within this many metres (she never swings at friends). */
const ATTACK_SAFE_R = 10;
/** An armed attack-move (X) with no click lapses after this many seconds. */
const ATTACK_MOVE_ARM = 4;

/** Stick magnitude whose locomotion speed (walk ≤ 0.5, run at 1) is `v` m/s. */
function magForSpeed(v) {
  if (v <= PLAYER.walk) return 0.5 * (v / PLAYER.walk);
  return Math.min(1, 0.5 + 0.5 * (v - PLAYER.walk) / (PLAYER.run - PLAYER.walk));
}
