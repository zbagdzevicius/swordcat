// src/player/Orders.js  (owner: player) — research/CONTROLS_SPEC.md §5.2 point-and-go orders and their path follower.
//
//   move(point)        RMB on the ground / a tap on the ground; Ctrl+RMB queues (≤ NAV.queueMax). Paths over the
//                      physics nav grid, always runs (Zoomies after 2 s as usual), auto-jumps nav links (assisted hop)
//   follow             RMB held / a touch long-press: re-targets under the pointer every NAV.follow s
//   attack(actor)      RMB / tap on a hostile or breakable: selects it, paths to reach (arc + radius − 0.25), faces it,
//                      then `settings.autoAttack` (chain: one Snip–Snap–Swoosh; loop: keep chaining; off: just face)
//   attackMove(point)  X then a click: path there, fighting any hostile within NAV.attackMoveR m of her on the way
//   use(target)        a click / tap on an interactable or NPC: path to it, face it, then levels.interact / companions.use
//   stop               H: clears the path, the queue and the order target
// Direct input (|move| ≥ 0.15) cancels any order at once (Player.wishDir). The follower feeds Player.wishDir, so every
// state that locomotes (move, charge, Milk Break, the Stand's shuffle) follows the path with its own speed caps.
// Clicks and taps arrive through `input.takeClick()`; picks go through `cam.pick` (camera/Picker.js).
import * as THREE from 'three';
import { NAV, AIM, ATTACKS, PLAYER, GRAVITY } from '../core/config.js';
import { E } from '../core/events.js';
import { hostileTo } from '../core/ActorRegistry.js';
import { wrapAngle } from '../core/math.js';
import { autoTarget, hopSpeed } from './Aim.js';

const _hostile = hostileTo('player');
const SWING = ATTACKS.slash1;
const ORDER_KINDS = new Set(['move', 'follow', 'attack', 'attackMove', 'use', 'stop']);

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
    /** queued move points (Ctrl+RMB) */
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
    const pt = kind === 'attack' ? arg.pos : kind === 'use' ? (arg.usePos ?? arg.pos) : arg;
    this.point.set(pt.x, pt.y ?? p.pos.y, pt.z);
    if (kind === 'attack') this.ctx.cam?.select?.(arg, o.source === 'touch' ? 'tap' : 'click');
    const ok = this._plan(this.point);
    if (p.state === 'attack' && (kind === 'move' || kind === 'attackMove')) this.pendingSwingCancel = true;
    if (p.state === 'guard' && kind !== 'attack') { /* the Stand plants her: the order waits until she lets go */ }
    this._emit(kind, this.point, this.target, ok, false);
    if (!ok || this.partial) this.ctx.input?.haptic?.('orderRejected');
    return ok;
  }

  /** Clear the order (and the queue). `reason` for debugging. */
  clear(reason = '') {
    this.kind = null; this.target = null; this.path.length = 0; this.wp = 0; this.queue.length = 0;
    this.engaged = false; this.follow = false; this._resume = null; this.pendingSwingCancel = false; this._hop = null;
    this.lastClear = reason;
  }

  /** Direct movement input took over (WASD / stick past 0.15): any order ends (§5.1). */
  cancelByDirect() { if (this.kind) this.clear('direct'); this.attackMoveArmed = false; }
  /** Attack input (LMB / ⚔ / X) cancels a move order (§5.2 interplay). */
  onAttackInput() { if (this.kind === 'move') this.clear('attack'); }
  /** Tumble keeps a move order (it resumes after the roll), drops attack / use. */
  onDodge() { if (this.kind === 'attack' || this.kind === 'use') this.clear('dodge'); this._hop = null; }
  /** The Stand plants her: move orders clear; an attack order pauses. */
  onGuard() { if (this.kind === 'move' || this.kind === 'attackMove' || this.kind === 'use') this.clear('guard'); }

  _validTarget(a) { return !!a && a.alive !== false && !!a.pos && a.hurtable !== false; }

  _emit(kind, point, target, valid, queued) {
    this.ctx.bus?.emit?.(E.PLAYER_ORDER, { kind, point: point ? new THREE.Vector3(point.x, point.y ?? this.p.pos.y, point.z) : null, target: target ?? null, valid: !!valid, queued: !!queued, partial: !!this.partial });
  }

  /** Path to `goal` (a nav path, else a straight line). Returns false when nothing at all is reachable. */
  _plan(goal) {
    const p = this.p, ph = this.ctx.physics;
    this._goal.copy(goal);
    this.wp = 0;
    this.path.length = 0;
    this.partial = false;
    if (typeof ph?.findPath !== 'function' || !ph.nav) {
      this.path.push({ x: goal.x, y: goal.y, z: goal.z });
      return true;
    }
    const r = ph.findPath(p.pos, goal);
    this._pathsThisSec++;
    if (!r?.points?.length) {
      // she stands on the goal cell already, or nothing is reachable
      if (Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z) < NAV.arriveMid) return true;
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
    if (ctx.game?.mode !== 'play' || p.scripted) { input.clearClicks?.(); this.follow = false; return; }
    if (input.pressed('attackMove')) this.attackMoveArmed = true;
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
          else if (this._pathsThisSec < NAV.pathsPerSec) this._plan(this.point);
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
    if (this.attackMoveArmed && (isMove || isAttack)) {
      this.attackMoveArmed = false;
      if (point) this.order('attackMove', point, { source: 'mouse' });
      this.suppressAttack = isAttack;
      return;
    }
    if (isMove) {
      if (pk.kind === 'enemy' || pk.kind === 'breakable') { this.order('attack', pk.actor, { source: 'mouse' }); return; }
      if ((pk.kind === 'interact' || pk.kind === 'npc') && this._useTarget(pk)) { this.order('use', this._useTarget(pk), { source: 'mouse' }); return; }
      if (point) {
        this.order('move', point, { queued: !!c.mods?.ctrl, source: 'mouse' });
        if (!c.mods?.ctrl) { this.follow = true; this._followSrc = 'mouse'; this._followT = NAV.follow * 2; }
      }
      return;
    }
    // LMB (hybrid): swings toward the cursor; on a hostile it also selects it; on a friend / object it uses it when no
    // hostile is alerted within 10 m (she never swings at friends)
    if (pk.kind === 'enemy') { cam.select?.(pk.actor, 'click'); return; }
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
    if (cam.lockTarget) cam.select?.(null, 'tap');
    if (st.tapToMove !== false && point) this.order('move', point, { source: 'touch' });
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
    if (p.state === 'hurt' || p.state === 'stagger' || p.state === 'dead') { this.clear('hurt'); return; }
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
        if (this.queue.length) { const q = this.queue.shift(); this.point.copy(q); this._plan(q); }
        else if (!this.follow) this.clear('arrived');
      }
      return;
    }
    const w = this.path[this.wp], last = this.wp === this.path.length - 1;
    const dx = w.x - p.pos.x, dz = w.z - p.pos.z, d = Math.hypot(dx, dz);
    // a link take-off: jump once she is close and facing it
    if (w.link && p.onGround && !this._hop) {
      const to = w.to ?? this.path[this.wp + 1];
      if (d <= NAV.linkStart && to) {
        const ax = to.x - p.pos.x, az = to.z - p.pos.z, yaw = Math.atan2(ax, az);
        if (Math.abs(wrapAngle(yaw - p.facing)) <= NAV.linkFacing || d < 0.25) {
          this._jumpLink(to);
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
          if (++S.fails > NAV.stuck.retries) { this.partial = true; this._emit(this.kind, this.point, this.target, false, false); this.clear('stuck'); this.ctx.input?.haptic?.('orderRejected'); return; }
          this._plan(this.kind === 'attack' && this.target?.pos ? this.target.pos : this._goal);
        } else S.fails = Math.max(0, S.fails - 1);
      }
    } else { S.t = 0; S.x = p.pos.x; S.z = p.pos.z; }
  }

  /** Assisted hop over a nav link (§5.4): a full jump with the horizontal speed that lands on `to`. */
  _jumpLink(to) {
    const p = this.p;
    const dx = to.x - p.pos.x, dz = to.z - p.pos.z, dist = Math.hypot(dx, dz);
    const dh = (to.y ?? p.pos.y) - p.pos.y;
    let v = hopSpeed(dist + 0.15, dh, PLAYER.jumpV, GRAVITY, NAV.hopMaxH, PLAYER.fallGravityMul);
    if (v == null) v = Math.min(NAV.hopMaxH, PLAYER.run);
    v = Math.max(v, 2.0);
    p.facing = Math.atan2(dx, dz);
    p.doJump();
    p.jumpCutDone = true;                                            // an order hop is never cut short
    p.vel.x = (dx / (dist || 1)) * v; p.vel.z = (dz / (dist || 1)) * v;
    this._hop = { v, x: to.x, z: to.z };
    this.hops = (this.hops ?? 0) + 1;
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
    if (mode === 'auto') mode = this.ctx.input?.device === 'touch' || this.ctx.state?.difficulty === 'kitten' ? 'loop' : 'chain';
    if (mode === 'off') return;
    if (mode === 'chain' && this._chainStrings >= 1 && p.state === 'move') { this.engaged = true; return; }
    // count finished strings (the last combo step of a string ran)
    if (p.state === 'attack' && p.comboIndex >= 3) this._sawCombo = 3;
    if (p.state === 'move' && this._sawCombo >= 3) { this._sawCombo = 0; this._chainStrings++; this._chainRest = AIM.autoChainRest; if (mode === 'chain') return; }
    if (this._chainRest > 0) { this._chainRest -= dt; return; }
    if (!p.onGround) return;
    // press: from neutral, and inside each swing's combo window (the auto-combo grace chains Snip → Snap → Swoosh)
    if (p.state === 'move' || (p.state === 'attack' && p.swing?.def?.next && !p.swing.queued)) p.attackBuf = Math.max(p.attackBuf, PLAYER.assist.buffer * 0.5);
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
}

/** §8 LMB on a friend uses it only when no hostile is alerted within this many metres (she never swings at friends). */
const ATTACK_SAFE_R = 10;

/** Stick magnitude whose locomotion speed (walk ≤ 0.5, run at 1) is `v` m/s. */
function magForSpeed(v) {
  if (v <= PLAYER.walk) return 0.5 * (v / PLAYER.walk);
  return Math.min(1, 0.5 + 0.5 * (v - PLAYER.walk) / (PLAYER.run - PLAYER.walk));
}
