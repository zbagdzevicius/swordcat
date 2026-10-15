// src/player/tricks/PawTricks.js  (owner: player, TT3 package A) — the Paw Trick controller (docs/TOKENTAILS-PLAN.md §11.3,
// §11.4). Player.js builds it as `player.tricks`.
//
//   One swappable slot (`trick`: F / RT / the ":3" button): the ":3" Coin Toss or the Catnip Cloud. Tap = cast at the
//   aim (KBM cursor; pad / touch: the locked or nearest foe), hold = an aim line, release = cast; `back` or a Stand
//   press while aiming calls it off. `trick1..3` (1 / 2 / 3, RT + D-pad, the touch long-press picker) pick
//   coin / cloud / (3) the Ribbon Twirl hint. The Ribbon Twirl is not in the slot: a second Jump press in the air, held.
//   Owned tricks and the equipped one are save flags (`trick.coin`, `trick.twirl`, `trick.cloud`, `trick.equipped`).
//   Unlocks (unlocks.js) never come before the first fight. Events: `trick:unlocked {id}`, `trick:used {id}`
//   (TRICK_EVENTS; the catalog keys TRICK_UNLOCKED / TRICK_USED once core adds them, requests/tt3-t.md).
import { E } from '../../core/events.js';
import { AIM } from '../../core/config.js';
import { hostileTo } from '../../core/ActorRegistry.js';
import { TRICKS, TRICK_IDS, SLOT_TRICKS, TRICK_FLAGS } from './tuning.js';
import { CoinToss } from './CoinToss.js';
import { CatnipCloud, landPoint } from './CatnipCloud.js';
import { canTwirl, twirlLimits, twirlSpin } from './RibbonTwirl.js';
import { inCrowFields, ownedOnLoad, pastFirstFight } from './unlocks.js';
import { TrickFX } from '../../fx/TrickFX.js';

/** Bus names (core's catalog spells them the catalog keys TRICK_UNLOCKED / TRICK_USED once added; the strings match). */
export const TRICK_EVENTS = Object.freeze({ unlocked: E['TRICK_UNLOCKED'] ?? 'trick:unlocked', used: E['TRICK_USED'] ?? 'trick:used' });

/** The §11.4 string keys with their exact text (story's strings.js gets the same rows; this is the fallback). */
export const TRICK_TEXT = Object.freeze({
  'trick.coin.name': ':3 Coin Toss', 'trick.coin.bark': 'Take my lucky coin. Throw it, it comes back!',
  'trick.coin.hint': '[Trick] Toss the coin at that crow!',
  'trick.twirl.name': 'Ribbon Twirl', 'trick.twirl.bark': 'Twirl your bow!', 'trick.twirl.hint': '[Jump] again in the air and hold to twirl',
  'trick.cloud.name': 'Catnip Cloud', 'trick.cloud.bark': "Catnip! They can't stay grumpy in this.", 'trick.cloud.hint': '[Trick] Puff catnip on the pack',
  'trick.swap': 'Paw Trick: {name}',
});

/** Who hands each trick over (bark voice). */
const GIVER = Object.freeze({ coin: 'ttcat', twirl: 'pearl', cloud: 'pearl' });
const _hostile = hostileTo('player');
const _cands = [];
const _lp = { x: 0, z: 0 };

/** States a Paw Trick may be cast from (a swing only in its recovery). */
const CAST_FROM = new Set(['move', 'guard', 'charge', 'attack']);

export class PawTricks {
  /** @param {any} ctx @param {any} player */
  constructor(ctx, player) {
    this.ctx = ctx; this.player = player;
    this.coin = new CoinToss(ctx, player);
    this.cloudSim = new CatnipCloud(ctx, player);
    /** seconds of cooldown left per slot trick */
    this.cd = { coin: 0, cloud: 0 };
    /** the press being held: aiming once past TRICKS.aim.holdT */
    this.holding = false; this.holdT = 0; this.cancelled = false; this.swapLatch = false;
    /** the live aim (TrickFX draws the line / landing ring): { on, id, dir, point, target, source, len } */
    this.aim = { on: false, id: null, dir: { x: 0, z: 1 }, point: { x: 0, z: 0 }, hasPoint: false, target: null, source: 'facing', len: 0 };
    // ---- twirl bookkeeping (per jump)
    this.airT = 0; this.twirlUsed = false; this.pogo = false; this.twirlT = 0; this.twirlLim = twirlLimits(false);
    /** visual cues for the model / fx: the last cast and when (sim time) */
    this.lastCast = { id: null, t: -9 };
    this._offs = [];
    this._checkT = 0;
    this._later = [];
    /** TrickFX (fx/TrickFX.js) once a scene renders it; created lazily by render() */
    this.fx = null;
    this.stats = { casts: { coin: 0, cloud: 0, twirl: 0 }, unlocks: [], denied: 0, swaps: 0 };
  }

  // ------------------------------------------------------------------ ownership (save flags)
  owns(id) { return !!this.ctx.state?.getFlag?.(TRICK_FLAGS[id]); }
  anyOwned() { for (const id of TRICK_IDS) if (this.owns(id)) return true; return false; }
  /** The slot trick (coin / cloud) or null. */
  get equipped() {
    const e = this.ctx.state?.getFlag?.(TRICK_FLAGS.equipped);
    if (SLOT_TRICKS.includes(e) && this.owns(e)) return e;
    for (const id of SLOT_TRICKS) if (this.owns(id)) return id;
    return null;
  }
  ownedList() { return TRICK_IDS.filter((id) => this.owns(id)); }

  /** Put a slot trick in the slot (announced with a toast). Returns true on a change. */
  equip(id, { quiet = false } = {}) {
    if (!SLOT_TRICKS.includes(id) || !this.owns(id)) return false;
    const was = this.equipped;
    this.ctx.state?.setFlag?.(TRICK_FLAGS.equipped, id);
    if (was === id) return false;
    this.stats.swaps++;
    if (!quiet) {
      this.ctx.bus.emit(E.TOAST, { text: this.text('trick.swap', { name: this.text(`trick.${id}.name`) }), icon: 'trick', key: 'trick.swap' });
      try { this.ctx.audio?.play2D?.('ui.click'); } catch { /* audio optional */ }
    }
    return true;
  }

  /**
   * Hand a trick over (save flag + event). `bark`: the giver's line in a bubble beside her and a toast; quiet on a
   * catch-up load. Never before the first fight. Returns true when newly owned.
   */
  grant(id, { bark = true, force = false } = {}) {
    if (!TRICK_IDS.includes(id) || this.owns(id)) return false;
    if (!force && !pastFirstFight(this.ctx.state)) return false;
    const st = this.ctx.state;
    st?.setFlag?.(TRICK_FLAGS[id], true);
    if (SLOT_TRICKS.includes(id) && !SLOT_TRICKS.includes(st?.getFlag?.(TRICK_FLAGS.equipped))) st?.setFlag?.(TRICK_FLAGS.equipped, id);
    this.stats.unlocks.push(id);
    this.ctx.bus.emit(TRICK_EVENTS.unlocked, { id, bark });
    if (bark) {
      this.ctx.bus.emit(E.TOAST, { text: this.text(`trick.${id}.name`), icon: 'trick', key: `trick.${id}.name` });
      this._say(id);
      try { this.ctx.audio?.play2D?.('trickUnlock'); } catch { /* audio optional */ }
    }
    return true;
  }

  /** Text for a §11.4 key: story's strings when it has the row, else the plan's exact text. */
  text(key, vars = null) {
    const S = this.ctx.strings;
    let s = S?.has?.(key) ? S.t(key, vars) : (TRICK_TEXT[key] ?? key);
    if (vars && !S?.has?.(key)) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  }

  /** The giver's bark in a bubble a step beside her (the giver is not on the field; the voice tells who it is). */
  _say(id) {
    const story = this.ctx.story, p = this.player, key = `trick.${id}.bark`;
    const line = this.ctx.strings?.has?.(key) ? key : TRICK_TEXT[key];
    try {
      const b = story?.barks;
      if (b?.sayAt) {
        const side = { x: p.pos.x + Math.cos(p.facing) * 1.1, y: p.pos.y, z: p.pos.z - Math.sin(p.facing) * 1.1 };
        b.sayAt(side, 1.3, line, GIVER[id], 3.0);
      } else if (b?.say) b.say(p, line, GIVER[id], 3.0);
    } catch (e) { console.warn('[tricks] bark', e); }
  }

  // ------------------------------------------------------------------ lifecycle
  init() {
    const bus = this.ctx.bus;
    this._offs.push(
      bus.on(E.LEVEL_LOADED, (p) => this._onLevelLoaded(p?.id)),
      bus.on(E.LEVEL_LOADING, () => this.reset()),
      bus.on(E.ENEMY_ALERTED, (p) => this._onAlert(p?.enemy)),
      bus.on(E.PLAYER_LAND, () => { this.twirlUsed = false; this.pogo = false; }),
      bus.on(E.GAME_MODE, (p) => { if (p?.mode !== 'play' && p?.mode !== 'memecam') this.cancelAim(); }),
    );
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    this.fx?.dispose?.();
    this.fx = null;
  }

  /** Drop everything in flight (level change). */
  reset() {
    this.coin.reset(); this.cloudSim.reset(); this.cancelAim();
    this.twirlUsed = false; this.pogo = false; this._later.length = 0;
  }

  cancelAim() { this.holding = false; this.cancelled = true; this.aim.on = false; }

  _levelId() { return this.ctx.levels?.current?.id ?? this.ctx.state?.levelId ?? null; }

  _onLevelLoaded(id) {
    if (!id) return;
    // catch-up: a save already past a hand-over owns it (quietly)
    for (const t of ownedOnLoad(id, this.ctx.state, false)) this.grant(t, { bark: false });
    // this level's own hand-over at the door (forest, town): a moment after she arrives
    if (id === 'forest' || id === 'town') {
      const t = id === 'forest' ? 'twirl' : 'cloud';
      if (!this.owns(t) && pastFirstFight(this.ctx.state)) this._later.push({ t: 1.6, fn: () => this.grant(t) });
    }
  }

  _onAlert(e) {
    if (!e || this.owns('coin') || this._levelId() !== 'meadow') return;
    if ((e.type ?? e.def?.id) === 'crow' && this.ctx.state?.getFlag?.('prologue.done')) this.grant('coin');
  }

  // ------------------------------------------------------------------ fixed step (Player._readInput calls readInput)
  /** Input for this step: picks, the slot press / aim / release. */
  readInput(dt) {
    const p = this.player, input = this.ctx.input;
    this.airT = p.onGround ? 0 : this.airT + dt;
    if (!input) return;
    const any = this.anyOwned();
    if (!any) { this.holding = false; this.aim.on = false; return; }
    for (let n = 1; n <= 3; n++) if (input.pressed(`trick${n}`)) { this.pick(n); if (input.down('trick')) this.swapLatch = true; }
    if (input.pressed('trick')) { this.holding = true; this.holdT = 0; this.cancelled = false; this.swapLatch = false; }
    if (!this.holding) return;
    this.holdT += dt;
    if (!this.cancelled && this.holdT > 0 && (input.pressed('back') || (input.pressed('guard') && this.holdT > 1e-3))) {
      this.cancelled = true;
      try { this.ctx.audio?.play2D?.('ui.back'); } catch { /* optional */ }
    }
    const id = this.equipped;
    this.aim.on = !!id && !this.cancelled && !this.swapLatch && this.holdT >= TRICKS.aim.holdT && p.alive;
    if (this.aim.on) this.resolveAim(id);
    if (input.usedAsModifier?.('trick')) this.swapLatch = true;          // RT + D-pad picked a trick: no tap-cast
    if (!input.down('trick')) {
      this.holding = false; this.aim.on = false;
      if (!this.cancelled && !this.swapLatch) {
        if (id) this.tryCast(id);
        else if (this.owns('twirl')) this._hint('twirl');
      }
    }
  }

  /** 1 = coin, 2 = cloud, 3 = the twirl (always on: its hint). */
  pick(n) {
    const id = TRICK_IDS[n - 1];
    if (!id) return false;
    if (id === 'twirl') { if (this.owns('twirl')) this._hint('twirl'); return false; }
    if (!this.owns(id)) { this.stats.denied++; try { this.ctx.audio?.play2D?.('ui.error'); } catch { /* optional */ } return false; }
    return this.equip(id);
  }

  _hint(id) { this.ctx.bus.emit(E.TOAST, { text: this.text(`trick.${id}.hint`), icon: 'trick', key: `trick.${id}.hint` }); }

  /** Seconds left / the full cooldown of a slot trick. */
  cooldownLeft(id = this.equipped) { return id ? (this.cd[id] ?? 0) : 0; }
  cooldownMax(id = this.equipped) { return id ? (TRICKS[id]?.cooldown ?? 0) : 0; }
  /** Ready to cast now (owned, off cooldown, a coin not already out)? */
  ready(id = this.equipped) {
    if (!id || !this.owns(id)) return false;
    if ((this.cd[id] ?? 0) > 0) return false;
    if (id === 'coin' && this.coin.active) return false;
    return true;
  }

  /**
   * Cast `id` now if allowed (owned, ready, a state that may cast). `at` overrides the aim: { x, z } a world point
   * or { dir: { x, z } }. Returns true when the toss started.
   */
  tryCast(id = this.equipped, at = null) {
    const p = this.player;
    if (!id || !SLOT_TRICKS.includes(id) || !p.alive || p.scripted) return false;
    const g = this.ctx.game?.mode;
    if (g && g !== 'play') return false;
    if (!this.ready(id) || !this._stateOk()) {
      this.stats.denied++;
      try { this.ctx.audio?.play2D?.('ui.error'); } catch { /* optional */ }
      return false;
    }
    const aim = at ? this._aimFromArg(id, at) : this.resolveAim(id);
    if (p.state === 'attack') p.endSwing?.();
    if (p.state === 'charge') p.cancelCharge?.();
    p.facing = Math.atan2(aim.dir.x, aim.dir.z);
    p.setState('toss', { id, dir: { x: aim.dir.x, z: aim.dir.z }, point: aim.hasPoint ? { x: aim.point.x, z: aim.point.z } : null });
    return true;
  }

  _stateOk() {
    const p = this.player, s = p.state;
    if (!CAST_FROM.has(s)) return false;
    if (s === 'attack') { const sw = p.swing; return !!sw && sw.t >= (sw.def?.active?.[1] ?? 0) && !sw.def?.noCancel; }
    return true;
  }

  /** The toss state's release frame: the coin leaves / the pouch flies; the cooldown starts. */
  release(arg) {
    const id = arg?.id, p = this.player;
    if (!id) return false;
    let ok = false;
    if (id === 'coin') ok = this.coin.throw(arg.dir?.x ?? Math.sin(p.facing), arg.dir?.z ?? Math.cos(p.facing));
    else if (id === 'cloud') {
      const pt = arg.point ?? { x: p.pos.x + (arg.dir?.x ?? Math.sin(p.facing)) * Math.min(5, TRICKS.cloud.range), z: p.pos.z + (arg.dir?.z ?? Math.cos(p.facing)) * Math.min(5, TRICKS.cloud.range) };
      this.cloudSim.throw(pt.x, pt.z); ok = true;
    }
    if (!ok) return false;
    this.cd[id] = TRICKS[id].cooldown;
    this.stats.casts[id]++;
    this.lastCast.id = id; this.lastCast.t = this.ctx.game?.time ?? 0;
    p.combatT = Math.max(p.combatT ?? 0, 3);
    this.ctx.bus.emit(TRICK_EVENTS.used, { id });
    try { this.ctx.audio?.play2D?.(id === 'coin' ? 'trickCoinThrow' : 'trickPouch'); } catch { /* optional */ }
    return true;
  }

  // ------------------------------------------------------------------ the twirl (PlayerStates.move / twirl)
  /** A twirl may start this step (a fresh Jump press in the air, owned, once per jump). */
  wantTwirl() {
    const p = this.player, input = this.ctx.input;
    return canTwirl({ owned: this.owns('twirl'), onGround: p.onGround, pressed: !!input?.pressed('jump'), airT: this.airT,
      used: this.twirlUsed, coyoteT: p.coyoteT, state: p.state, alive: p.alive });
  }

  /** The twirl starts: once per jump, the spin hit, the limits for this jump (further after a pogo). */
  startTwirl() {
    this.twirlUsed = true;
    this.twirlLim = twirlLimits(this.pogo);
    this.twirlT = 0;
    this.stats.casts.twirl++;
    this.lastCast.id = 'twirl'; this.lastCast.t = this.ctx.game?.time ?? 0;
    const n = twirlSpin(this.ctx, this.player);
    this.ctx.bus.emit(TRICK_EVENTS.used, { id: 'twirl', hits: n });
    try { this.ctx.audio?.play2D?.('trickTwirl'); if (n > 0) this.ctx.audio?.play2D?.('trickFwip'); } catch { /* optional */ }
    return n;
  }

  /** A Pounce pogo: the next twirl this jump carries further, and a fresh twirl is allowed. */
  onPogo() { this.pogo = true; this.twirlUsed = false; }

  // ------------------------------------------------------------------ aim
  /**
   * The aim for `id` this step (also mirrored into this.aim): explicit (touch drag / pad RS) → the KBM cursor →
   * the locked foe → the nearest foe in front within range → her facing.
   */
  resolveAim(id = this.equipped) {
    const ctx = this.ctx, p = this.player, input = ctx.input, cam = ctx.cam, a = this.aim;
    const range = id === 'cloud' ? TRICKS.cloud.range : TRICKS.coin.range;
    a.id = id; a.target = null; a.hasPoint = false;
    const yaw = cam?.stickYaw ?? cam?.yaw ?? Math.PI;
    const va = input?.virtualAim, as = input?.aimStick;
    let dx = 0, dz = 0, src = null;
    if (va?.active && Math.hypot(va.x, va.y) > 1e-3) {
      dx = -Math.sin(yaw) * va.y + Math.cos(yaw) * va.x; dz = -Math.cos(yaw) * va.y - Math.sin(yaw) * va.x; src = 'explicit';
      const l = Math.hypot(va.x, va.y), far = Math.min(1, l / 90);                  // the drag length sets the lob (touch)
      if (id === 'cloud') { a.hasPoint = true; const n = Math.hypot(dx, dz) || 1; a.point.x = p.pos.x + (dx / n) * range * Math.max(0.3, far); a.point.z = p.pos.z + (dz / n) * range * Math.max(0.3, far); }
    } else if (input?.device === 'pad' && as && Math.hypot(as.x, as.y) > 0.35) {
      dx = -Math.sin(yaw) * as.y + Math.cos(yaw) * as.x; dz = -Math.cos(yaw) * as.y - Math.sin(yaw) * as.x; src = 'explicit';
    } else if (input?.device === 'kbm' && input?.preset !== 'keyboardOnly' && cam?.cursorValid && (input.pointerIdle?.() ?? 99) < (AIM.cursorIdle ?? 3)) {
      const c = cam.cursorGround;
      dx = c.x - p.pos.x; dz = c.z - p.pos.z; src = 'cursor';
      landPoint(p.pos.x, p.pos.z, c.x, c.z, _lp);
      a.hasPoint = true; a.point.x = _lp.x; a.point.z = _lp.z;
    }
    if (!src) {
      const lock = p.lockTarget?.();
      const t = lock && Math.hypot(lock.pos.x - p.pos.x, lock.pos.z - p.pos.z) <= range + 1 ? lock : this._nearest(range, id);
      if (t) {
        a.target = t; src = lock === t ? 'selected' : 'auto';
        dx = t.pos.x - p.pos.x; dz = t.pos.z - p.pos.z;
        a.hasPoint = true; landPoint(p.pos.x, p.pos.z, t.pos.x, t.pos.z, _lp); a.point.x = _lp.x; a.point.z = _lp.z;
      }
    }
    if (!src || Math.hypot(dx, dz) < 1e-4) { dx = Math.sin(p.facing); dz = Math.cos(p.facing); src = src ?? 'facing'; }
    const l = Math.hypot(dx, dz);
    a.dir.x = dx / l; a.dir.z = dz / l; a.source = src;
    if (!a.hasPoint) { const r = id === 'cloud' ? Math.min(5, range) : range; a.point.x = p.pos.x + a.dir.x * r; a.point.z = p.pos.z + a.dir.z * r; }
    a.len = id === 'cloud' ? Math.hypot(a.point.x - p.pos.x, a.point.z - p.pos.z) : range;
    return a;
  }

  _aimFromArg(id, at) {
    const a = this.aim, p = this.player;
    a.id = id; a.target = null;
    if (at.dir) { const l = Math.hypot(at.dir.x, at.dir.z) || 1; a.dir.x = at.dir.x / l; a.dir.z = at.dir.z / l; a.hasPoint = false; a.source = 'api'; return a; }
    const dx = at.x - p.pos.x, dz = at.z - p.pos.z, l = Math.hypot(dx, dz) || 1;
    a.dir.x = dx / l; a.dir.z = dz / l; a.source = 'api';
    landPoint(p.pos.x, p.pos.z, at.x, at.z, _lp); a.hasPoint = true; a.point.x = _lp.x; a.point.z = _lp.z;
    return a;
  }

  /** The best foe within `range`: distance + 2·|angle off her facing|/π; the coin skips crows out of reach. */
  _nearest(range, id) {
    const p = this.player, ctx = this.ctx;
    _cands.length = 0;
    for (const a of ctx.actors?.queryRadius?.(p.pos, range + 1, _hostile) ?? []) _cands.push(a);
    let best = null, bs = Infinity;
    for (const e of _cands) {
      if (!e?.pos || e.alive === false || e.hidden || e.dormant || e.hurtable === false || e.breakable) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz) - (e.radius ?? 0);
      if (d > range) continue;
      if (id === 'coin' && (e.def?.fly || e.tags?.has?.('flyer'))) {
        const g = ctx.physics?.heightAt?.(e.pos.x, e.pos.z);
        if (e.pos.y - (Number.isFinite(g) ? g : 0) > TRICKS.coin.crowMaxAlt && !e.grounded) continue;
      }
      let ang = Math.atan2(dx, dz) - p.facing;
      ang = Math.atan2(Math.sin(ang), Math.cos(ang));
      const sc = d + 2 * Math.abs(ang) / Math.PI;
      if (sc < bs) { bs = sc; best = e; }
    }
    _cands.length = 0;
    return best;
  }

  // ------------------------------------------------------------------ step (Player.update, after the state machine)
  update(dt) {
    for (const id of SLOT_TRICKS) if (this.cd[id] > 0) this.cd[id] = Math.max(0, this.cd[id] - dt);
    this.coin.update(dt);
    this.cloudSim.update(dt);
    if (this.player.state === 'twirl') this.twirlT += dt;
    for (let i = this._later.length - 1; i >= 0; i--) {
      const l = this._later[i];
      if ((l.t -= dt) <= 0 && this.ctx.game?.mode === 'play') { this._later.splice(i, 1); try { l.fn(); } catch (e) { console.warn('[tricks] later', e); } }
    }
    // the coin hand-over: in the meadow, on the way into the Crow Fields
    if ((this._checkT -= dt) <= 0) {
      this._checkT = 0.25;
      const p = this.player;
      if (!this.owns('coin') && this._levelId() === 'meadow' && this.ctx.state?.getFlag?.('prologue.done') && p.alive && inCrowFields(p.pos.x, p.pos.z)) this.grant('coin');
    }
  }

  /** UI data (ability bar, touch button) → out. */
  uiState(out = {}) {
    const id = this.equipped;
    out.any = this.anyOwned();
    out.equipped = id;
    out.cd = this.cooldownLeft(id); out.cdMax = this.cooldownMax(id);
    out.ready = this.ready(id);
    out.coinOut = this.coin.active;
    out.aiming = this.aim.on;
    out.twirl = this.owns('twirl');
    out.owned = this.ownedList();
    return out;
  }

  // ------------------------------------------------------------------ visuals
  render(alpha, frameDt) {
    if (!this.fx && this.ctx.scene && typeof document !== 'undefined') this.fx = new TrickFX(this.ctx, this);
    this.fx?.render?.(alpha, frameDt);
  }
}
