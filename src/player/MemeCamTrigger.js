// src/player/MemeCamTrigger.js  (owner: player) — GAME_DESIGN §7.8 Meme Cam.
//   Idle trigger:   15 s with no input, on an outdoor level, no alerted enemy within 20 m, fog density ≥ 0.02.
//   Manual trigger: hold the Stand 2.5 s while planted with no enemy within 12 m.
//   Both are suppressed while the tutorial runs, on the practice field (the Wobble Knight's Stand drill), and near a
//   hidden kitten's Stand zone (its reveal needs the Stand + the follow camera).
//   Enter: game mode 'memecam' + camera 'meme' (the camera emits camera:meme); the player holds the Oath pose and
//   the cape cross-fades to the looping sway (SwordcatModel). Any input exits (0.6 s blend back, camera side).
//   First trigger: unlocks the Meme White cape and shows `toast.memecam`.
// `fastForward(sec)` is the __GAME__.idle(sec) test hook. In ?test real idle time never counts (deterministic smoke).
import { E } from '../core/events.js';
import { PLAYER } from '../core/config.js';
import { inPractice } from '../story/tutorial.js';

/** Extra metres around a hidden kitten's Stand zone where Meme Cam stays off (its 3 s reveal must play in view). */
const STAND_ZONE_MARGIN = 4;

export class MemeCamTrigger {
  /** @param {import('./Player.js').Player} player */
  constructor(player) {
    this.player = player;
    this.idleT = 0; this.bonus = 0;
    this.active = false;
    /** seconds the Stand has been held planted (manual trigger) */
    this.standT = 0;
    /** seconds since entering (caption / loop phase readers) */
    this.t = 0;
    this._prevCam = 'follow';
    /** 'idle' | 'manual' */
    this.reason = null;
    this._armed = true;          // the exiting input must be released before a new manual trigger counts
  }

  /** Test hook (__GAME__.idle): pretend `sec` more idle seconds have passed. */
  fastForward(sec) { this.bonus += Math.max(0, +sec || 0); }

  get idleSeconds() { return this.idleT + this.bonus; }

  /** Fixed step (play / memecam modes only). */
  update(dt) {
    const p = this.player, ctx = p.ctx, cfg = PLAYER.memeCam, input = ctx.input;
    if (this.active) {
      this.t += dt;
      if (ctx.game.mode !== 'memecam') { this._finish(false); return; }
      if (this._activity(input) || !p.alive) this.exit();
      return;
    }
    if (ctx.game.mode !== 'play') { this.idleT = 0; this.bonus = 0; this.standT = 0; return; }

    if (this.suppressed()) { this.idleT = 0; this.bonus = 0; this.standT = 0; return; }

    // manual: hold the Stand planted for 2.5 s with no enemy within 12 m
    const planted = p.guarding && p.onGround && Math.hypot(p.vel.x, p.vel.z) < PLAYER.standingGround.maxSpeed + 0.05;
    if (!input.down('guard')) this._armed = true;
    if (planted && this._armed && !this._enemyWithin(cfg.manualClearRadius, false)) {
      this.standT += dt;
      if (this.standT >= cfg.manualHold) { this.enter('manual'); return; }
    } else this.standT = 0;

    // idle
    const moving = Math.hypot(p.vel.x, p.vel.z) > 0.2;
    const busy = p.state !== 'move' || moving || !p.onGround || p.swing || p.guarding || p.scripted;
    if (busy || input.anyActivity()) { this.idleT = 0; this.bonus = 0; return; }
    if (!ctx.params?.test) this.idleT += dt;
    if (this.idleSeconds < cfg.idle) return;
    if (!this.canIdleTrigger()) return;
    this.enter('idle');
  }

  /** Meme Cam must not interrupt: the tutorial is running, she is on the practice field, or near a kitten's Stand zone. */
  suppressed() {
    const p = this.player, ctx = p.ctx;
    if (p.golden || p.goldenActivating) return true;                     // never mid Golden Hour
    if (ctx.story?.tutorial?.active) return true;
    if (ctx.levels?.current?.id === 'meadow' && inPractice(p.pos.x, p.pos.z)) return true;
    let kittens = [];
    try { kittens = ctx.companions?.kittens ?? []; } catch { kittens = []; }
    for (const k of kittens) {
      if (k?.hide !== 'stand' || k.stateName !== 'hidden') continue;
      const at = k.opts?.zoneAt ?? k.home ?? k.pos;
      if (!at) continue;
      if (Math.hypot(p.pos.x - at.x, p.pos.z - at.z) <= (k.opts?.zoneR ?? 1.2) + STAND_ZONE_MARGIN) return true;
    }
    return false;
  }

  /** Outdoor level, fog ≥ minFog, no alerted enemy within noEnemyRadius. */
  canIdleTrigger() {
    const ctx = this.player.ctx, cfg = PLAYER.memeCam;
    if (ctx.levels?.current?.indoor) return false;
    if (ctx.levels?.current?.arenas?.some?.((a) => a.locked)) return false;   // never mid-fight (requests/world.md)
    const fog = ctx.env?.fogDensity ?? ctx.scene?.fog?.density ?? 0;
    if (fog < cfg.minFog) return false;
    return !this._enemyWithin(cfg.noEnemyRadius, true);
  }

  _enemyWithin(r, alertedOnly) {
    const p = this.player, list = p.ctx.enemies?.list;
    if (!list) return false;
    for (const e of list) {
      if (!e.alive || (alertedOnly && !e.alerted)) continue;
      if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < r) return true;
    }
    return false;
  }

  enter(reason = 'idle') {
    const p = this.player, ctx = p.ctx;
    if (this.active) return;
    this.active = true; this.t = 0; this.standT = 0; this._armed = false;
    this._prevCam = ctx.cam?.modeName && ctx.cam.modeName !== 'meme' && ctx.cam.modeName !== 'preset' ? ctx.cam.modeName : 'follow';
    p.onMemeCam?.(true);
    ctx.game.setMode('memecam');
    ctx.cam?.mode?.('meme');
    const st = ctx.state;
    if (st) {
      const first = !(st.memeCamSeen > 0);
      st.memeCamSeen = (st.memeCamSeen ?? 0) + 1;
      if (first) {
        const capes = st.cosmetics?.capes;
        if (capes && !capes.includes('memeWhite')) capes.push('memeWhite');
        ctx.bus.emit(E.UNLOCK, { kind: 'cape', id: 'memeWhite' });
        ctx.bus.emit(E.TOAST, { text: ctx.strings?.t?.('toast.memecam') ?? 'toast.memecam', icon: 'cape', key: 'toast.memecam' });
      }
    }
    this.reason = reason;
  }

  /** New input this step: a press, the stick or look (buttons still held from a manual trigger don't count). */
  _activity(input) {
    if (Math.abs(input.move.x) + Math.abs(input.move.y) > 0.1) return true;
    if (input.actions instanceof Map) { for (const s of input.actions.values()) if (s.pressed) return true; }
    else if (input.anyActivity()) return true;
    // CONTROLS_SPEC §2.7: in iso there is no look; a click, a tap or a mouse move ≥ 40 px (Input's activity) exits
    if (input.iso && input.idleTime === 0) return true;
    return input.lookIdleTime === 0;
  }

  /** Any input: back to play with the 0.6 s blend (the camera eases back). */
  exit() { this._finish(true); }

  _finish(restoreMode) {
    const p = this.player, ctx = p.ctx;
    if (!this.active) return;
    this.active = false; this.idleT = 0; this.bonus = 0; this.standT = 0; this.t = 0;
    if (restoreMode && ctx.game.mode === 'memecam') ctx.game.setMode('play');
    if (ctx.cam?.modeName === 'meme' || restoreMode) ctx.cam?.mode?.(this._prevCam || 'follow');
    p.onMemeCam?.(false);
  }

  /** Cancel without touching the mode (level loads, cutscenes). */
  reset() { if (this.active) this._finish(this.player.ctx.game.mode === 'memecam'); this.idleT = 0; this.bonus = 0; this.standT = 0; }
}
