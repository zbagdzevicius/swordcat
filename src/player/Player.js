// src/player/Player.js  (owner: player) — Swordcat, the player Actor (GAME_DESIGN §7, frozen contract §19.4).
//   read fields: stateName, hp, maxHp, lives, milk, milkMax, grit, guarding, guardT, charge (0..1), golden, valor,
//                shards, swing, god   (+ gritMax, chargeTier, zoomies, goldenT, memeCamTrigger, model)
//   methods:     teleport({pos, facing}), heal(n), addValor(n, reason), setValor(n), resolveIncoming(att, def, dir)
//                + ScriptedActor (core/ScriptedActor.js), setOutfit(name)
//   emits:       player:* (§19.5) — see the event list in core/events.js; combat emits player:parry.
// The fixed-step logic lives in PlayerStates.js; Guard / Valor / Lives / SafeGround are pure modules; the visual
// kitten (characters' buildKitten + procedural animation) is SwordcatModel.js.
import * as THREE from 'three';
import { Actor } from '../core/Actor.js';
import { ScriptedActorMixin } from '../core/ScriptedActor.js';
import { E } from '../core/events.js';
import { PLAYER, ATTACKS, ECONOMY, COMPANIONS, JUICE, ENEMIES, AIM, GRAVITY, NAV, TOUCH, KO, FADE_COLOR, HUD, CAMERA } from '../core/config.js';
import { wrapAngle, dampAngle, smoothstep } from '../core/math.js';
import { IdleLadder, HIT_WORDS, ORDER_FX, wordFor, koRespawnT } from './juice.js';
import { hostileTo } from '../core/ActorRegistry.js';
import { GuardState, parryWindowFor } from './Guard.js';
import { Valor } from './Valor.js';
import { Lives } from './Lives.js';
import { SafeGround } from './SafeGround.js';
import { MemeCamTrigger } from './MemeCamTrigger.js';
import { STATES } from './PlayerStates.js';
import { TUNING, threatens } from './tuning.js';
import { SwordcatModel, OUTFITS } from './SwordcatModel.js';
import { Orders } from './Orders.js';
import { resolveAim, autoTarget, magnetPick, threatSnap, jumpAssistPlan } from './Aim.js';
import { assistCone, lungeSpeed } from '../combat/targeting.js';
import { isFinalBlow } from '../combat/Combat.js';

const _v = new THREE.Vector3(), _dir = new THREE.Vector3(), _ex = { x: 0, z: 0 }, _mv = { x: 0, z: 0, mag: 0 };
const _aimS = { her: null, facing: 0, riposte: null, explicit: null, cursor: null, selected: null, range: 2, auto: null, move: null };
const _cands = [], _snapOut = { at: null };
const _hostile = hostileTo('player');
const AIM_RECENT = 2.0;
const COMBO_INDEX = { slash1: 1, slash2: 2, slash3: 3 };
const JEER_R = ENEMIES.hyena?.jeer?.r ?? 8;
/** AUTOCAM §5.3: an order's intent points at the path 2.5 m ahead (CAMERA.iso.lead.orderLook). */
/** Arrival turn toward the lens after a plain move order (requests/characters.md): ≤ 0.35 rad over 0.25 s. */
const ARRIVE_TURN = Object.freeze({ max: 0.35, dur: 0.25 });
const CAMERA_ORDER_LOOK = CAMERA.iso?.lead?.orderLook ?? 2.5;

export class Player extends ScriptedActorMixin(Actor) {
  constructor(ctx) {
    super(ctx, { faction: 'player', radius: PLAYER.radius, height: PLAYER.height, maxHp: PLAYER.hpStart, mass: PLAYER.mass, maxPoise: 1 });
    this.tags.add('player');
    // ---- state machine
    this.state = 'move'; this.stateName = 'idle'; this.stateT = 0;
    // ---- pure sub-systems
    this.guardState = new GuardState(PLAYER);
    this.valorState = new Valor(PLAYER);
    this.livesState = new Lives(ctx.state?.difficultyCfg, PLAYER);
    this.safeGround = new SafeGround();
    this.memeCamTrigger = new MemeCamTrigger(this);
    // ---- contract fields
    this.milk = PLAYER.milk.start; this.milkMax = PLAYER.milk.start;
    this.charge = 0; this.chargeTier = 0; this.chargeT = 0; this.chargeFizzled = false;
    this.golden = false; this.goldenT = 0; this.goldenActivating = false;
    /** active Combat swing or null */
    this.swing = null;
    this.god = false;
    // ---- input buffers and timers
    this.attackBuf = 0; this.dodgeBuf = 0; this.jumpBuf = 0; this.coyoteT = 0;
    this.lastGuardPress = -1; this.lastAttackPress = -1;
    /** touch auto-combo (§14.4): the follow-up of the last naturally finished Snip / Snap and when it ended */
    this.comboNext = null; this.comboEndT = -Infinity;
    this.guardToggle = false; this.chargeToggleRelease = false; this.milkPressed = false;
    this.dodgeCd = 0; this.dodgeDir = new THREE.Vector3(0, 0, 1); this.dodgeRewarded = false;
    this.riposteT = 0; this.riposteTarget = null; this.autoStandT = 0; this.pushT = 0;
    this.critT = 0; this.immuneT = 0; this.meowT = 0; this.meowCd = 0; this.combatT = 0;
    /** splash (§7.1): move input ignored while > 0; repeat splashes free while splashCdT > 0 */
    this.moveLockT = 0; this.splashCdT = 0;
    /** set by resolveIncoming for a Grit-exhaustion break: Combat then deals 0 damage (damageTakenMul) */
    this._softBreak = false;
    this.pounceReady = true; this.pouncePhase = 'hang'; this.landT = 0;
    this.jumping = false; this.jumpCutDone = false;
    this.zoomies = false; this.zoomT = 0; this.zoomHeading = 0;
    this.gait = 0; this.stepCount = 0;
    this.sipHealed = false; this.sipActive = false;
    this.swingSerial = 0; this.comboIndex = 0; this.swingGuardLatch = false;
    this.gravityMul = 1; this.terminalFall = PLAYER.terminalFall; this.landImpact = 0;
    /** respawn point (level spawn or the last Lantern Stone) */
    this.respawnPoint = { pos: new THREE.Vector3(), facing: 0 };
    /** jeering enemies (enemy:jeer on/off) */
    this.jeerers = new Set();
    this.inJeer = false; this.threatened = false; this.threatT = 0;
    /** last applied shop upgrades (§13.3: satchel, Valor Gain); applyUpgrades() re-reads state.upgrades on change */
    this._upgSatchel = -1; this._upgValorGain = null;
    this.inShallow = false;
    /** status slow (§10.3 spider_web): `slow` = fraction of speed removed, `slowT` = seconds left (Clover's mend zeroes both) */
    this.slow = 0; this.slowT = 0;
    /** visual-only fields the model consumes: squash cue, hurt blink timer (i-frames after a hurt / respawn) */
    this.squashEvent = null;
    this.blinkT = 0; this.stepAccum = 0; this.hurtDur = PLAYER.hurt.stun;
    this._valorAcc = 0; this._valorAccReason = '';
    this._stillStandingPending = false;
    this._offs = [];
    this.model = new SwordcatModel(this);
    // ---- CONTROLS_SPEC §5.2 / §7 iso controls
    /** point-and-go orders (move / attack / attackMove / use / stop) and their path follower */
    this.orders = new Orders(this);
    /** the resolved aim (§7.1) of the current / last directional verb: fx draws the aim ring notch from it */
    this.aim = { active: false, held: false, kind: 'attack', dir: { x: 0, z: 1 }, point: null, target: null, range: 0, width: 0, source: 'facing' };
    this._aimOut = { dir: { x: 0, z: 1 }, point: null, target: null, source: 'facing' };
    /** soft auto-target memory (§7.2 sticky) and the cursor position the Stand re-aims after (§8.1: 30 px) */
    this._autoPrev = null;
    this._guardPtr = { x: 0, y: 0, armed: false };
    /** §7.2 "hit her within the last 2 s": attacker → game time of its last attack on her */
    this._recentAttackers = new Map();
    this._autoInfoOut = { windup: false, recentHit: false };
    this._autoInfo = (a) => {
      const o = this._autoInfoOut;
      o.windup = this.ctx.combat?.threats?.windingUp?.(a) ?? false;
      o.recentHit = this._recentHit(a);
      return o;
    };
    /** §8.1 Auto-Riposte: counts down after a parry (sim s); at 0 the Riposte fires if the parried enemy is in reach */
    this.autoRiposteT = 0;
    /** §5.4 jump assist: the extra air velocity (x, z) the assisted take-off holds until she lands */
    this.airAssist = { x: 0, z: 0, on: false };
    /** §5.4 Pounce dive point while airborne with Pounce ready (fx draws the 0.9 m dive circle): { x, z, valid } */
    this.diveAt = { x: 0, z: 0, valid: false };
    // ---- AUTOCAM §5.3 / §4 (the camera reads these every frame; written every sim step, zero allocation)
    /**
     * Where she means to go: `kind` 'stick' (touch joystick, before her velocity), 'walk' / 'run' (WASD / pad), 'order'
     * (click / tap path: toward the path point 2.5 m ahead), 'other' (Tumble, Pounce, swings, knockback, scripted
     * motion) or 'idle'; (x, z) a unit XZ direction (0, 0 when idle / other); `speed` m/s.
     */
    this.moveIntent = { x: 0, z: 0, speed: 0, kind: 'idle' };
    /** The Y of her last ground contact (heightfield or a collider top: bridges, decks), updated every step. */
    this.groundY = 0;
    this._la = { x: 0, z: 0 };
    // ---- WA §5.6 life between fights
    /** the hero idle ladder (glance → look → groom → twirl → Meme Cam; hub: sit) */
    this.idleLadder = new IdleLadder({ rand: ctx.rng?.fork ? ctx.rng.fork('idle') : undefined });
    /** taps on her (WA §5.6, wall-clock s), the word rate limit (WA §5.3) and the knock-out wipe flag (WA §5.7) */
    this._selfTaps = [];
    this._wordT = -Infinity; this._wordSerial = -1;
    this._koWiped = false;
    /** the arrival turn toward the lens (onArrive): target yaw, time left, her last turning side */
    this._arriveYaw = 0; this._arriveT = 0; this._turnSign = 1; this._prevFacing = 0;
  }

  /** WA §5.6 "in combat": recent combat activity, a Standing Ground threat, or an alerted enemy within 15 m. */
  inCombat() {
    return this.combatT > 0 || this.threatened || this._alertedWithin(HUD?.tuck?.combatR ?? ORDER_FX.combatR);
  }

  /**
   * WA §5.6 a click / tap on her (Orders decides): out of combat a meow + bow bounce + a heart; three within 1.5 s →
   * a twirl. In combat it is ignored (no emote, no order). Returns what played ('pat' | 'twirl' | null).
   */
  onSelfTap() {
    if (!this.alive || this.scripted || this.state !== 'move' || this.inCombat()) return null;
    const now = performance.now() / 1000, T = this._selfTaps;
    while (T.length && now - T[0] > ORDER_FX.tripleT) T.shift();
    T.push(now);
    if (T.length >= ORDER_FX.tripleN) {
      T.length = 0;
      this.model.idleStep('twirl');
      this.selfTapped = 'twirl';
      return 'twirl';
    }
    this.model.emote('meow'); this.model.emote('bowBounce'); this.model.happy?.();
    try { this.ctx.audio?.play2D?.('tapPurr'); } catch { /* audio not ready */ }
    this.ctx.bus.emit(E.BURST, { kind: 'heart', position: _v.set(this.pos.x, this.pos.y + this.height * 1.1, this.pos.z).clone() });
    this.selfTapped = 'pat';
    return 'pat';
  }

  /**
   * WA §5.3 one comic word above her head ("Snip!", "Ting!", "Bonk!"): `settings.hitWords`, at most one per 0.25 s.
   * fx draws it (`fx.word` once fx ships the word style, else a damage number). Returns true when shown.
   */
  sayWord(key, force = false) {
    const S = this.ctx.strings, sk = 'word.' + key;
    const text = S?.has?.(sk) ? S.t(sk) : wordFor(key);              // story may own the strings (word.<kind>)
    if (!text || this.ctx.state?.settings?.hitWords === false) return false;
    const now = this.ctx.game?.time ?? 0;
    if (!force && now - this._wordT < HIT_WORDS.every - 1e-6) return false;
    this._wordT = now;
    const at = _v.set(this.pos.x, this.pos.y + this.height + HIT_WORDS.lift, this.pos.z);
    const fx = this.ctx.fx;
    try {
      if (typeof fx?.word === 'function') fx.word(at, text, { kind: key, actor: this });
      else fx?.damageNumber?.(at, text, 'word');
    } catch (e) { console.warn('[player] word failed', e); }
    this.lastWord = text;
    this.words = (this.words ?? 0) + 1;
    return true;
  }

  /** Is this kill the last of the encounter? WA §5.1 final blow: the same rule as Combat's slow-mo (one copy). */
  _finalBlow(target) {
    return isFinalBlow(this, target, this.ctx.enemies?.list, this.pos);
  }

  /** §7.2: remember who just attacked her (the auto-target prefers them for 2 s). */
  _noteAttacker(att) {
    const a = att?.isProjectile ? att.owner : att;
    if (!a || a === this) return;
    const now = this.ctx.game?.time ?? 0;
    this._recentAttackers.set(a, now);
    if (this._recentAttackers.size > 16) for (const [k, t] of this._recentAttackers) if (now - t > AIM_RECENT || k.alive === false) this._recentAttackers.delete(k);
  }
  _recentHit(a) {
    if (this.ctx.combat?.hitRecently?.(a, AIM_RECENT)) return true;          // combat's record (hits that landed)
    const t = this._recentAttackers.get(a);                                   // ours: every attack on her (blocks too)
    return t != null && (this.ctx.game?.time ?? 0) - t <= AIM_RECENT;
  }

  /** §8.1 Auto-Riposte setting: 'auto' = on for touch, off otherwise; 'on' / true; 'off' / false. */
  autoRiposteOn() {
    const v = this.ctx.state?.settings?.autoRiposte ?? 'auto';
    if (v === true || v === 'on') return true;
    if (v === false || v === 'off') return false;
    return this.ctx.input?.device === 'touch';
  }

  /**
   * PERF L2: the model writes her glow position (chest height) into ENV_U.uGlow every rendered frame once it is built;
   * Env then leaves it alone (it otherwise rides her feet).
   */
  get writesGlow() { return !!this.model?.ready && !this.model?.fallback; }

  /** ART G14 probes (core's __GAME__.art.featurePx): her view's { eyeL, eyeR, bow } once characters ship them. */
  debugFeatures() { return this.model?.view?.debugFeatures?.() ?? null; }

  /** The hover pick under the cursor (camera's Picker, once per rendered frame): { kind, actor, id, point }. */
  get hover() { return this.ctx.cam?.hover ?? null; }

  /** ctx.player.order(kind, arg) (§15.1): issue an order from code (smoke, ui buttons). */
  order(kind, arg, o = {}) { return this.orders.order(kind, arg, { source: 'api', ...o }); }

  /**
   * §7.1 resolve the aim for `kind` ('attack' | 'charge' | 'pounce' | 'dodge' | 'guard' | 'ability') into
   * this._aimOut { dir, point, target, source } (also mirrored into this.aim).
   */
  resolveAim(kind = 'attack', range = ATTACKS.slash1.arc.range) {
    const ctx = this.ctx, input = ctx.input, cam = ctx.cam, s = _aimS;
    const iso = cam?.isIso !== false;
    s.her = this.pos; s.facing = this.facing; s.range = range;
    s.riposte = this.riposteReady() ? this.riposteTarget : null;
    s.explicit = null; s.cursor = null; s.auto = null; s.move = null;
    const yaw = cam?.stickYaw ?? cam?.yaw ?? Math.PI;
    const va = input?.virtualAim, as = input?.aimStick;
    if (va?.active && Math.hypot(va.x, va.y) > 1e-3) {
      _ex.x = -Math.sin(yaw) * va.y + Math.cos(yaw) * va.x; _ex.z = -Math.cos(yaw) * va.y - Math.sin(yaw) * va.x; s.explicit = _ex;
    } else if (iso && input?.device === 'pad' && as && Math.hypot(as.x, as.y) > 0.35) {
      _ex.x = -Math.sin(yaw) * as.y + Math.cos(yaw) * as.x; _ex.z = -Math.cos(yaw) * as.y - Math.sin(yaw) * as.x; s.explicit = _ex;
    }
    const kbOnly = input?.preset === 'keyboardOnly';
    if (iso && input?.device === 'kbm' && !kbOnly && cam?.cursorValid && (input.pointerIdle?.() ?? 99) < AIM.cursorIdle) s.cursor = cam.cursorGround;
    const sel = this.lockTarget();
    s.selected = sel;
    const mag = this.wishDir(_dir);
    if (mag > 0.3) { _mv.x = _dir.x; _mv.z = _dir.z; _mv.mag = mag; s.move = _mv; }
    // soft auto-target (touch, pad, keyboard-only; the classic camera keeps its own assist)
    if (iso && !s.explicit && !s.cursor && !s.riposte && (input?.device !== 'kbm' || kbOnly)) {
      const dev = input?.device;
      const r = dev === 'touch' ? AIM.touchRange : dev === 'pad' ? AIM.padRange : AIM.kbRange;
      _cands.length = 0;
      for (const a of ctx.actors?.queryRadius?.(this.pos, r + 1.5, _hostile) ?? []) _cands.push(a);
      const refYaw = mag > 0.3 ? Math.atan2(_dir.x, _dir.z) : this.facing;
      s.auto = autoTarget(this.pos, refYaw, _cands, r, this._autoInfo, sel, this._autoPrev, this.pos.y);
      this._autoPrev = s.auto;
    }
    const out = resolveAim(kind, s, this._aimOut);
    const a = this.aim;
    a.kind = kind; a.dir.x = out.dir.x; a.dir.z = out.dir.z; a.point = out.point; a.target = out.target; a.source = out.source; a.range = range;
    return out;
  }

  /**
   * Keep `player.aim` live for fx / ui / companions (§12 player 2): while she is free (move / guard / charge) the
   * aim of her next swing is re-resolved every step; swings keep the aim they started with. `active` is true while a
   * directional verb is being aimed (a charge, the Stand, a swing, a Pounce, a kitten ability). Also the Pounce dive
   * point while airborne with Pounce ready (`diveAt`, fx's 0.9 m dive circle).
   */
  _refreshAim() {
    const st = this.state, a = this.aim;
    if (this.ctx.cam?.isIso === false) { a.active = false; this.diveAt.valid = false; return; }
    if (st === 'move' || st === 'guard' || st === 'charge') {
      const kind = st === 'move' ? 'attack' : st;
      this.resolveAim(kind, ATTACKS.slash1.arc.range);
      const arc = st === 'guard' ? null : ATTACKS.slash1.arc;
      a.width = arc ? Math.abs(arc.from - arc.to) : 2 * (this.guardState.arc ?? PLAYER.guard.arc);
    }
    const comp = this.ctx.companions?.aim;
    a.active = st === 'attack' || st === 'charge' || st === 'guard' || st === 'pounce' || !!comp?.active;
    // AUTOCAM §5.5 aim pan: `range` is the reach of the HELD aimed action (Holy wave 10 m, Golden Hour gleam 8 m, a
    // companion ability's own reach); `held` says one is being held right now
    const held = st === 'charge' ? this.heldAimRange() : comp?.active ? (comp.range ?? comp.plan?.range ?? 0) : 0;
    a.held = held > 0;
    if (a.held) a.range = Math.max(a.range ?? 0, held);
    if (!this.onGround && this.pounceReady && st === 'move' && this.alive) this.pouncePlan(this.diveAt);
    else this.diveAt.valid = false;
  }

  /**
   * The reach of the aimed shot the current charge would release (AUTOCAM §5.5): tier 2 Holy Slash with Shard 2 → the
   * holy wave (10 m, the Wave Reach upgrade 15 m); in Golden Hour every slash sends a gleam (8 m); else 0 (melee only).
   */
  heldAimRange() {
    if (this.state !== 'charge') return 0;
    const holy = ATTACKS.holy, wave = ATTACKS[holy.projectile];
    if (this.chargeTier >= 2 && wave && this.shards >= (holy.projectileMinShards ?? 2)) {
      const R = ECONOMY.shops.waveReach;
      return this.ctx.state?.upgrades?.waveReach && this.shards >= (R?.needShards ?? 2) ? (R?.range ?? wave.range) : wave.range;
    }
    if (this.golden && ATTACKS.gleam) return ATTACKS.gleam.range;
    return 0;
  }

  /** Face the resolved aim now (her facing = the aim direction). */
  faceAim(kind, range) {
    const o = this.resolveAim(kind, range);
    this.facing = Math.atan2(o.dir.x, o.dir.z);
    return o;
  }

  /**
   * §10.1 ability-bar data → out: { dodgeCd, dodgeMax, meowCd, meowMax, milk, milkMax, golden 0..1, goldenReady,
   * goldenLocked, holyReady, grit, gritMax, guard, interact, charge, chargeTier, shards, riposteReady, airborne }.
   */
  abilityState(out = {}) {
    out.dodgeCd = this.dodgeCd; out.dodgeMax = PLAYER.dodge.cooldown;
    out.meowCd = this.meowCd; out.meowMax = PLAYER.meow.cooldown;
    out.milk = this.milk; out.milkMax = this.milkMax;
    out.golden = Math.min(1, (this.valor ?? 0) / PLAYER.valor.max);
    out.goldenReady = this.canGolden?.() ?? false;
    out.holyReady = this.shards >= (ATTACKS.holy.minShards ?? 1) && (this.valor ?? 0) >= PLAYER.charge.holyMinValor;
    out.grit = this.grit; out.gritMax = this.gritMax;
    out.guard = this.state === 'guard';
    out.interact = !!this.ctx.levels?.current?._interact;
    out.charge = this.charge; out.chargeTier = this.chargeTier;
    // lock states (§10.1: desaturated + a lock pip) and the Stand slot's parry flash
    out.shards = this.shards;
    out.goldenLocked = this.shards < TUNING.goldenMinShards;
    out.riposteReady = this.riposteReady();
    out.airborne = !this.onGround;
    return out;
  }

  // ------------------------------------------------------------------ contract fields (§19.4)
  get lives() { return this.livesState.lives; }
  set lives(v) { this.livesState.lives = v; }
  get grit() { return this.guardState.grit; }
  set grit(v) { this.guardState.grit = v; }
  get gritMax() { return this.guardState.gritMax; }
  get guarding() { return this.guardState.guarding; }
  get guardT() { return this.guardState.guardT; }
  get valor() { return this.valorState.value; }
  get shards() { return this.ctx.state?.shards ?? 0; }
  set shards(n) { if (this.ctx.state) this.ctx.state.shards = n; }
  /** Standing Ground paying out right now (visuals / barks). */
  get standingGround() { return this.valorState.standing; }
  /** Combat hook (requests/combat.md): Golden Hour halves damage taken, rounded down (1-HP hits do nothing). */
  get damageTakenMul() { return this._softBreak ? 0 : this.golden ? PLAYER.golden.takenMul : 1; }
  /** Combat hook: no knockback / stagger during Golden Hour (super armour) and its activation. */
  get superArmor() { return this.golden || this.state === 'golden'; }
  /** Unlimited lives (Kitten difficulty: the HUD hides the counter). */
  get infiniteLives() { return this.livesState.infinite; }

  // ------------------------------------------------------------------ lifecycle
  async init() {
    const ctx = this.ctx, st = ctx.state, bus = ctx.bus;
    this.applyUpgrades();
    this._recomputeMax();
    this.hp = Math.min(st?.hp ?? this.maxHp, this.maxHp) || this.maxHp;
    this.milk = Math.min(st?.milk ?? PLAYER.milk.start, this.milkMax);
    this.livesState.setDifficulty(st?.difficultyCfg);
    if (this.livesState.scope === 'game' && Number.isFinite(st?.lives)) this.livesState.lives = st.lives;
    this.object3d.name = 'swordcat';
    this.object3d.userData.perfCat = 'hero';                           // PERF perf() categories (requests/characters.md)
    ctx.scene.add(this.object3d);
    ctx.actors.register(this, 'swordcat');
    this._offs.push(
      bus.on(E.LEVEL_LOADING, () => this._onLevelLoading()),
      bus.on(E.LEVEL_LOADED, () => this._onLevelLoaded()),
      bus.on(E.CHECKPOINT, (p) => this._onCheckpoint(p)),
      bus.on(E.HIT, (h) => this._onHitEvent(h)),
      bus.on(E.KITTEN_RESCUED, () => this.addValor(PLAYER.valor.kitten, 'kitten')),
      bus.on(E.ENEMY_CHOKE, () => this.addValor(PLAYER.valor.choke, 'choke')),
      bus.on(E.ENEMY_JEER, (p) => { if (!p?.enemy) return; if (p.on) this.jeerers.add(p.enemy); else this.jeerers.delete(p.enemy); }),
      bus.on(E.ENEMY_ALERTED, (p) => this._onEnemyAlerted(p?.enemy)),
      bus.on(E.ITEM_PICKUP, (p) => this._onPickup(p)),
      bus.on(E.COMPANION_CHANGED, () => this._recomputeMax()),
      bus.on(E.GAME_MODE, (p) => this._onMode(p)),
      bus.on(E.CUTSCENE_START, () => this.memeCamTrigger.reset()),
      bus.on(E.SETTINGS_CHANGED, (p) => { if (p?.key === 'difficulty') this.livesState.setDifficulty(ctx.state.difficultyCfg); }),
      bus.on(E.SAVE_LOADED, () => { this._upgSatchel = -1; this._upgValorGain = null; this.applyUpgrades(); }),
      bus.on(E.PLAYER_PARRY, () => this.sayWord('parry')),
      bus.on(E.PLAYER_PERFECT_DODGE, (p) => { if (!p?.graze) this.sayWord('perfectDodge'); }),
    );
    await this.model.init();
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    if (this.golden) this.ctx.env?.clear?.('golden');
    this.model.dispose();
    this.ctx.actors.unregister(this);
    super.dispose();
  }

  // ------------------------------------------------------------------ contract methods
  teleport({ pos, facing = 0 }) {
    this.orders?.clear('teleport');
    this.pos.copy(pos); this.vel.set(0, 0, 0); this.facing = facing;
    this.onGround = false; this.gravityMul = 1;
    if (this.goldenActivating) this.finishGoldenActivation();
    if (this.swing) this.endSwing();
    if (this.state !== 'dead' && this.state !== 'scripted' && this.state !== 'memecam') this.setState('move');
    this.safeGround.clear();
    this.zoomies = false; this.zoomT = 0;
    this.groundY = this.pos.y;
    this.snap();
    this.model.snap();
    this.ctx.bus.emit(E.PLAYER_SPAWNED, { player: this });
  }

  heal(n) {
    if (!(n > 0) || !this.alive) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    const d = this.hp - before;
    if (d > 0) this.ctx.bus.emit(E.PLAYER_HEALED, { amount: d, hp: this.hp, maxHp: this.maxHp });
    return d;
  }

  addValor(n, reason = '') { return this._valorChanged(this.valorState.add(n, reason), reason); }

  setValor(n) { return this._valorChanged(this.valorState.set(n), 'set'); }

  /**
   * §19.4 hook called by Combat.applyHit / projectiles before damage. → 'hit' | 'block' | 'parry' | 'break' | 'immune'
   * @param {any} att attacker (Actor or projectile) @param {any} def attack def @param {THREE.Vector3} hitDir unit dir INTO her
   */
  resolveIncoming(att, def, hitDir) {
    const ctx = this.ctx;
    if (!this.alive || this.scripted || this.immuneT > 0 || this.state === 'golden' || this.state === 'dead') return 'immune';
    const s = this.swing;
    if (s && s.def.iframes && s.t >= s.def.iframes[0] && s.t <= s.def.iframes[1]) return 'immune';   // Holy Slash
    if (this.memeCamTrigger.active) this.memeCamTrigger.exit();
    const g = this.guardState;
    g.dodging = this.state === 'dodge';
    const touch = ctx.input?.device === 'touch';
    g.parryWindow = parryWindowFor(ctx.state?.difficultyCfg, touch);
    g.arc = touch && ctx.cam?.isIso !== false ? (PLAYER.guard.touchArc ?? PLAYER.guard.arc) : PLAYER.guard.arc;   // §8.1
    this._noteAttacker(att);
    const r = g.resolve(def, hitDir, this.facing);
    this.combatT = TUNING.combatStance;
    switch (r) {
      case 'perfectDodge': case 'graze': {
        if (!this.dodgeRewarded) {
          this.dodgeRewarded = true;
          const graze = r === 'graze', D = PLAYER.dodge;
          ctx.bus.emit(E.PLAYER_PERFECT_DODGE, { attacker: att?.isProjectile ? (att.owner ?? att) : att, graze });
          if (graze) this._valorChanged(this.valorState.gain('graze'), 'graze');
          else {
            ctx.game.slowMo?.(D.perfectTimeScale, D.perfectDur);
            this._valorChanged(this.valorState.gain('perfectDodge'), 'perfectDodge');
            this.critT = D.perfectCritWindow;
          }
        }
        return 'immune';
      }
      case 'parry': {
        // Combat owns the parry juice (hitstop, slow motion, shake, rumble) and emits player:parry.
        const G = PLAYER.guard;
        this._valorChanged(this.valorState.gain('parry'), 'parry');
        this.riposteTarget = att?.isProjectile ? null : att;
        this.riposteT = this.riposteTarget ? G.riposteWindow : 0;
        if (ctx.state?.settings?.autoStand || ctx.input?.device === 'touch') this.autoStandT = TUNING.autoStand;
        this.autoRiposteT = this.riposteTarget && this.autoRiposteOn() ? AIM.autoRiposte : 0;   // §8.1 Auto-Riposte
        return 'parry';
      }
      case 'block':
        this.pushT = TUNING.blockPushT;
        ctx.bus.emit(E.PLAYER_GRIT, { value: g.grit, max: g.gritMax, broken: false });
        return 'block';
      case 'break':
        // §7.3: only red / unblockable attacks deal full damage through a broken guard; a Grit-exhaustion break is
        // the 0.8 s stagger with no damage (Combat reads damageTakenMul right after this hook).
        this._softBreak = g.lastBreakExhaust;
        ctx.bus.emit(E.PLAYER_GRIT, { value: Math.max(0, g.grit), max: g.gritMax, broken: true });
        return 'break';
      default:
        return 'hit';
    }
  }

  /**
   * Combat hook (requests/combat.md): a lethal blow. Still Standing (§7.6) — once per checkpoint segment she
   * survives at 1 HP. Returns true when she survives.
   */
  onLethal() {
    if (!this.alive || !this.livesState.tryStillStanding()) return false;
    this.hp = PLAYER.stillStanding.hp;
    this._stillStandingPending = true;
    return true;
  }

  /** Combat applied a hit (after damage, knockback, i-frames). `hit` = combat's info {dmg, broke, def, killed, ...}. */
  onHit(hit) {
    const ctx = this.ctx;
    this._softBreak = false;
    const dmg = hit?.dmg ?? 0;
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    ctx.bus.emit(E.PLAYER_DAMAGED, { amount: dmg, hp: this.hp, maxHp: this.maxHp, source: hit?.attacker ?? null, broke: !!hit?.broke });
    this.combatT = TUNING.combatStance;
    if (dmg > 0) { this._valorChanged(this.valorState.hurt(), 'hurt'); this.blinkT = PLAYER.hurt.iframes; }
    if (hit?.killed || !this.alive) return;
    if (this.memeCamTrigger.active) this.memeCamTrigger.exit();
    if (this._stillStandingPending) { this._triggerStillStanding(); return; }
    if (this.golden) return;                                        // super armour: no stagger
    if (this.state === 'sip' && !this.sipHealed) this.cancelSip();
    if (this.state === 'charge') this.cancelCharge();
    if (this.swing) this.endSwing();
    if (hit?.broke) { this.setState('stagger'); return; }
    // a harmless bump (tutorial dummy, swinging sack: 0 damage, knock only) staggers her for half the stun
    if (dmg > 0 || (hit?.def?.knock ?? 0) > 0) this.setState('hurt', dmg > 0 ? 1 : TUNING.bumpStunMul);
  }

  /** Combat (or env damage) killed her. */
  onDeath() {
    const ctx = this.ctx;
    this.alive = false;
    if (this.golden) this.endGolden(false);
    if (this.swing) this.endSwing();
    if (this.state === 'guard') this.stopGuard();
    this.memeCamTrigger.reset();
    const r = this.livesState.loseLife();
    this._koWiped = false;
    this.idleLadder.reset();
    this.setState('dead');
    // WA §5.7 knock-out look: a dizzy sit (the model) with stars circling her head until the cream wipe
    try { ctx.fx?.dizzyFor?.(this, r.gameOver ? KO.sitT : koRespawnT()); } catch (e) { console.warn('[player] dizzy stars', e); }
    ctx.bus.emit(E.PLAYER_DIED, {});
    ctx.bus.emit(E.PLAYER_LIFE_LOST, { lives: r.lives, gameOver: r.gameOver, infinite: this.livesState.infinite });
    this._syncState();
  }

  // ------------------------------------------------------------------ ScriptedActor visual hooks
  onScripted(on) {
    if (on) {
      if (this.swing) this.endSwing();
      if (this.state === 'guard') this.stopGuard();
      if (this.golden) this.endGolden(false);
      this.memeCamTrigger.reset();
      this.clearCharge();
      this.vel.x = this.vel.z = 0;
      this.setState('scripted');
    } else {
      this.poseName = 'idle';
      this.model.setScriptPose(null);
      this.setState(this.alive ? 'move' : 'dead');
    }
  }
  onPose(name, o) { this.model.setScriptPose(name === 'idle' ? null : name, o); }
  onEmote(name) { this.model.emote(name); }
  onProp(name, on) { this.model.prop(name, on); }
  onAttach(host) { if (host) this.vel.set(0, 0, 0); }
  playClip(clip, o) { return this.model.playClip(clip, o); }

  /** Story: outfit for the prologue ('tunic' | 'tunic_bow' | 'armour'). */
  setOutfit(name) { this.model.setOutfit(name); }

  /** @param {string} name @returns {boolean} can her model wear this outfit (story's practiceOutfit probe) */
  hasOutfit(name) { return OUTFITS.includes(name); }

  /** Hold a face expression for story (null = back to the state's own face). requests/story.md */
  setExpression(name) { this.model?.setExpressionOverride?.(name ?? null); }

  /** Show cape `id` regardless of the equipped cosmetic (null = equipped). requests/story.md */
  setCapeOverride(id) { this.model?.setCapeOverride?.(id ?? null); }

  // ------------------------------------------------------------------ state machine
  setState(name, arg) {
    if (!STATES[name]) { console.warn(`[player] unknown state ${name}`); return; }
    STATES[this.state]?.exit?.(this, name);
    this.state = name; this.stateT = 0;
    STATES[name].enter?.(this, arg);
  }

  // ------------------------------------------------------------------ fixed step
  update(dt) {
    const ctx = this.ctx;
    if (!ctx.game.simActive(this)) return;
    this.stateT += dt;
    this._tickTimers(dt);
    if (this.slowT > 0) { this.slowT = Math.max(0, this.slowT - dt); if (this.slowT <= 0) this.slow = 0; }

    if (this.scripted || this.attachedTo) {
      if (this.state !== 'scripted') this.setState('scripted');
      this.scriptedStep(dt);
      if (!this.attachedTo) ctx.physics.moveActor(this, dt);
      STATES.scripted.update(this, dt);
      if (this.onGround) this.groundY = this.pos.y;
      this._setIntent('other', 0, 0, 0);
      this.idleLadder.reset();
      return;
    }
    if (this.state === 'scripted') this.setState('move');

    this._readInput(dt);
    this.orders.update(dt);
    if (this.alive && (ctx.game.mode === 'play' || ctx.game.mode === 'memecam')) this.memeCamTrigger.update(dt);
    if (this.memeCamTrigger.active && this.state !== 'memecam' && this.alive) this.setState('memecam');

    STATES[this.state].update(this, dt);
    this._refreshAim();

    // gravity: snappier falls; pounce sets its own
    if (this.state !== 'pounce') this.gravityMul = this.vel.y < 0 ? PLAYER.fallGravityMul : 1;
    // variable jump height: releasing Jump cuts the rise (not on touch: a finger tap is 50–120 ms, and the copy says
    // "tap [Jump]" to clear the practice fence, §14)
    if (this.jumping && !this.jumpCutDone && !this.onGround && this.vel.y > 0 && !ctx.input.down('jump') && ctx.input.device !== 'touch') {
      this.vel.y *= PLAYER.jumpCut; this.jumpCutDone = true;
    }
    const wasGround = this.onGround;
    this.landImpact = 0; this.bounced = 0;
    ctx.physics.moveActor(this, dt);
    if (this.stepY > 0) this.stepAccum += this.stepY;                   // visual step-up smoothing (model)
    if (this.bounced > 0) this._bounced();
    else if (!wasGround && this.onGround) this._landed();
    if (this.onGround) this.groundY = this.pos.y;                       // AUTOCAM §4: the same contact physics used
    this._postStep(dt);
    this._arriveTick(dt);
    this._updateIntent();
    this._idleTick(dt);
    this._syncState();
  }

  /**
   * Arrival from a plain move order (no target, attack-move or interact; requests/characters.md QA "her face is almost
   * never visible"): ease her facing up to ARRIVE_TURN.max (≈ 20°) toward the camera over ARRIVE_TURN.dur, so the
   * idle glance reads her face. With the lens straight behind her she keeps turning the way she was already turning.
   */
  onArrive() {
    const cam = this.ctx.camera?.position;
    if (!cam || !Number.isFinite(cam.x) || this.state !== 'move' || this.scripted || this.inCombat()) return false;
    const bearing = Math.atan2(cam.x - this.pos.x, cam.z - this.pos.z);
    let d = wrapAngle(bearing - this.facing);
    if (Math.abs(d) > Math.PI - 0.15) d = (this._turnSign || 1) * Math.PI;      // lens behind her: her turning side
    const step = Math.max(-ARRIVE_TURN.max, Math.min(ARRIVE_TURN.max, d));
    if (Math.abs(step) < 0.02) return false;
    this._arriveYaw = wrapAngle(this.facing + step); this._arriveT = ARRIVE_TURN.dur;
    return true;
  }

  /** @private the arrival turn (fixed step); any input, order or swing cancels it. */
  _arriveTick(dt) {
    const df = wrapAngle(this.facing - this._prevFacing);
    if (Math.abs(df) > 1e-3 && this._arriveT <= 0) this._turnSign = Math.sign(df);
    this._prevFacing = this.facing;
    if (!(this._arriveT > 0)) return;
    const m = this.ctx.input?.move;
    if (this.state !== 'move' || this.orders.kind || this.swing || (m && Math.hypot(m.x, m.y) >= 0.15)) { this._arriveT = 0; return; }
    this._arriveT = Math.max(0, this._arriveT - dt);
    this.facing = dampAngle(this.facing, this._arriveYaw, 3 / ARRIVE_TURN.dur, dt);
    if (this._arriveT === 0) this.facing = this._arriveYaw;
  }

  /** @private write moveIntent in place (no allocation). */
  _setIntent(kind, x, z, speed) {
    const m = this.moveIntent;
    m.kind = kind; m.x = x; m.z = z; m.speed = speed;
  }

  /**
   * AUTOCAM §5.3 move intent, after the step. Direct input wins (touch stick → 'stick' with the thumb-wobble deadzone,
   * else 'walk' / 'run' at her locomotion speed); a walking order → 'order' toward the path point 2.5 m ahead at run
   * speed, easing to 0 inside NAV.slowR of the end; swings, Tumble, Pounce, knockback, the hop of a nav link → 'other'.
   */
  _updateIntent() {
    const st = this.state, input = this.ctx.input;
    if (!this.alive || st === 'dead' || st === 'memecam' || st === 'vigil' || st === 'golden' || st === 'rise') { this._setIntent('idle', 0, 0, 0); return; }
    if (st === 'dodge' || st === 'pounce' || st === 'attack' || st === 'hurt' || st === 'stagger' || this.moveLockT > 0) {
      this._setIntent('other', 0, 0, 0); return;
    }
    const mx = input?.move?.x ?? 0, my = input?.move?.y ?? 0, mag = Math.min(1, Math.hypot(mx, my));
    if (mag >= 0.15) {
      const l = this.wishDir(_dir);
      if (l < 1e-3) { this._setIntent('idle', 0, 0, 0); return; }
      const n = Math.hypot(_dir.x, _dir.z) || 1;
      if (input.device === 'touch') {
        this._setIntent('stick', _dir.x / n, _dir.z / n, PLAYER.run * smoothstep(TOUCH.stickDead ?? 0.1, 1, mag));
      } else {
        this._setIntent(mag > TUNING.walkStick ? 'run' : 'walk', _dir.x / n, _dir.z / n, Math.hypot(this.vel.x, this.vel.z));
      }
      return;
    }
    const o = this.orders;
    if (o.moving && o.lookAhead(CAMERA_ORDER_LOOK, this._la)) {
      const dx = this._la.x - this.pos.x, dz = this._la.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 1e-3) {
        const left = o.remaining();
        this._setIntent('order', dx / d, dz / d, PLAYER.run * Math.min(1, left / (NAV.slowR || 1)));
        return;
      }
    }
    this._setIntent('idle', 0, 0, 0);
  }

  /** WA §5.6 idle ladder (fixed step): fires glance / look / groom / twirl / sneeze / sit on the model. */
  _idleTick(dt) {
    const ctx = this.ctx;
    // ?test never counts real idle time (deterministic smoke, like the Meme Cam), unless a test opts in
    if (ctx.params?.test && !ctx.params?.idleLadder) { this.idleLadder.reset(); return; }
    const st = this.state;
    const still = st === 'move' && this.alive && this.onGround && !this.swing && !this.orders.kind && !this.scripted &&
      Math.hypot(this.vel.x, this.vel.z) < 0.1 && ctx.game?.mode === 'play';
    const meme = st === 'memecam' || this.memeCamTrigger.active;
    const calm = still && !this.inCombat();
    const hub = !!(ctx.companions?.hub?.isHub?.() ?? ctx.levels?.current?.hub?.active?.());
    const step = this.idleLadder.update(dt, { still, calm, meme, hub });
    if (step) { this.model.idleStep(step); this.idleEmote = step; }
    else if (!still && this.model.idlePose) this.model.idleStep(null);
  }

  _tickTimers(dt) {
    const dec = (k) => { if (this[k] > 0) this[k] = Math.max(0, this[k] - dt); };
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.staggerT = Math.max(0, this.staggerT - dt);
    dec('dodgeCd'); dec('riposteT'); dec('autoStandT'); dec('pushT'); dec('critT'); dec('immuneT'); dec('meowT'); dec('meowCd'); dec('combatT');
    dec('blinkT'); dec('splashCdT');
    this._softBreak = false;
    if (this.moveLockT > 0) {
      this.moveLockT = Math.max(0, this.moveLockT - dt);
      // after the minimum lock, releasing the stick ends it (a still-held stick keeps her out of the water)
      const m = this.ctx.input?.move;
      if (this.moveLockT <= TUNING.splashLockMax - TUNING.splashLockMin && (!m || Math.hypot(m.x, m.y) < 0.2)) this.moveLockT = 0;
    }
    if (this.riposteT <= 0) this.riposteTarget = null;
    if (this.autoRiposteT > 0) {
      this.autoRiposteT = Math.max(0, this.autoRiposteT - dt);
      // §8.1: 0.15 s after the parry, a Riposte at the parried enemy if it is within reach (4 m); the state machine
      // starts it from the Stand / neutral through the attack buffer (a swing / Tumble already running is left alone)
      if (this.autoRiposteT === 0 && this.riposteReady() && (this.state === 'guard' || this.state === 'move') && this.onGround) {
        this.attackBuf = Math.max(this.attackBuf, PLAYER.assist.buffer);
        this.autoRiposted = (this.autoRiposted ?? 0) + 1;
      }
    }
    this.valorState.update(dt);
    this.applyUpgrades();
    if (this.guardState.update(dt)) this.ctx.bus.emit(E.PLAYER_GRIT, { value: this.guardState.grit, max: this.guardState.gritMax, broken: false });
  }

  _readInput(dt) {
    const input = this.ctx.input, now = this.ctx.game.time, A = PLAYER.assist;
    this.orders.handleInput(dt);
    const pa = input.pressed('attack') && !this.orders.suppressAttack, pg = input.pressed('guard');
    if (pa) this.orders.onAttackInput();
    if (pa) { this.attackBuf = A.buffer; this.lastAttackPress = now; } else this.attackBuf = Math.max(0, this.attackBuf - dt);
    if (pg) {
      this.lastGuardPress = now;
      if (this.ctx.state?.settings?.holdStand === false) this.guardToggle = !this.guardToggle;
    }
    if (input.pressed('dodge')) this.dodgeBuf = A.buffer; else this.dodgeBuf = Math.max(0, this.dodgeBuf - dt);
    this.jumpBuf = input.pressed('jump') ? PLAYER.jumpBuffer : Math.max(0, this.jumpBuf - dt);
    this.coyoteT = this.onGround ? PLAYER.coyote : Math.max(0, this.coyoteT - dt);
    this.milkPressed = input.pressed('milk');
    this.chargeToggleRelease = pa && this.state === 'charge';
    if (input.pressed('meow')) this.tryMeow();
  }

  _landed() {
    const impact = this.landImpact || 0;
    this.airAssist.on = false;
    this.jumping = false; this.jumpCutDone = false; this.pounceReady = true;
    this.ctx.bus.emit(E.PLAYER_LAND, { impact });
    if (impact > PLAYER.hardLandSpeed && this.state === 'move') this.setState('land');
  }

  /** Physics sprang her off a bounce surface (mushroom caps, §7.1): a jump that can't be cut short. */
  _bounced() {
    this.jumping = false; this.jumpCutDone = true; this.pounceReady = true; this.coyoteT = 0;
    this.squashEvent = 'bounce';
    this.lastBounceT = this.ctx.game?.time ?? 0;               // Orders steers a bounce link from here
    this.ctx.bus.emit(E.PLAYER_JUMP, { bounce: this.bounced });
  }

  /** After physics: safe ground, water / pits, Standing Ground + Jeer, Golden Hour clock, zoomies, footsteps. */
  _postStep(dt) {
    const ctx = this.ctx, phys = ctx.physics;
    // ---- water and pits (§7.1)
    const deep = this.onGround && phys.isDeepWater?.(this.pos.x, this.pos.z, this.pos.y);
    this.inShallow = !deep && this.onGround && !!phys.isShallowWater?.(this.pos.x, this.pos.z, this.pos.y);
    if (this.alive && (deep || this.pos.y < TUNING.pitY)) this._splash();
    this.safeGround.update(dt, this.pos, this.alive && this.onGround && !deep && this.state !== 'dodge' && this.state !== 'pounce');
    // ---- threats, Standing Ground and Jeer (§7.3, §7.4)
    this._scanThreats(dt);
    if (this.alive) {
      // "planted" = she isn't walking in the Stand: a block's pushback (0.4 m) and its brake-out are not her moving,
      // so she stays planted through the hits she is standing against. With the stick held, her real speed counts.
      const m = this.ctx.input?.move, stick = m ? Math.hypot(m.x, m.y) : 0;
      const speed = this.pushT > 0 || stick < 0.1 ? 0 : Math.hypot(this.vel.x, this.vel.z);
      const d = this.valorState.standTick(dt, { guarding: this.state === 'guard', speed, threatened: this.threatened, inJeer: this.inJeer });
      if (d !== 0) this._valorAccumulate(d, d > 0 ? 'stand' : 'jeer');
    }
    // ---- Golden Hour clock (§7.5)
    if (this.golden && !this.goldenActivating) {
      this.goldenT -= dt;
      if (this.goldenT <= 0) this.endGolden(true);
    }
    // ---- footsteps (sim cadence: the model's gait reads `gait`)
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && sp > 0.4 && (this.state === 'move' || this.state === 'charge' || this.state === 'guard' || this.state === 'sip')) {
      const before = Math.floor(this.gait);
      this.gait += sp * TUNING.stepsPerMetre * dt;
      if (Math.floor(this.gait) !== before) this._footstep();
    }
  }

  _footstep() {
    const ctx = this.ctx;
    this.stepCount++;
    const surface = this.inShallow ? 'water' : (ctx.levels?.current?.surfaceAt?.(this.pos.x, this.pos.z) ?? 'grass');
    ctx.bus.emit(E.FOOTSTEP, { actor: this, position: this.pos.clone(), surface });
    if (this.zoomies && this.stepCount % TUNING.zoomiesDustEvery === 0) ctx.bus.emit(E.BURST, { kind: 'dust', position: this.pos.clone() });
  }

  /**
   * Standing Ground threat (§7.3: an alerted enemy within 6 m that is targeting her; `threatens()` in tuning.js) with a
   * short grace so a token flicker / wind-up turn doesn't stall the payout, plus the Jeer aura test (§7.4).
   */
  _scanThreats(dt = 0) {
    const list = this.ctx.enemies?.list;
    let threatened = false, jeer = false;
    const R = PLAYER.standingGround.radius;
    if (list) for (const e of list) if (threatens(e, this, R)) { threatened = true; break; }
    this.threatT = threatened ? TUNING.threatGrace : Math.max(0, this.threatT - dt);
    for (const e of this.jeerers) {
      if (!e.alive) { this.jeerers.delete(e); continue; }
      const r = e.jeerR ?? e.def?.jeer?.r ?? JEER_R;
      if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) <= r) { jeer = true; break; }
    }
    this.threatened = threatened || this.threatT > 0; this.inJeer = jeer;
  }

  _syncState() {
    const st = this.ctx.state; if (!st) return;
    st.hp = this.hp; st.maxHp = this.maxHp; st.lives = this.lives; st.milk = this.milk; st.milkMax = this.milkMax;
  }

  // ------------------------------------------------------------------ helpers used by PlayerStates
  /** Camera-relative stick direction into `out` (XZ, length ≤ 1). Returns the stick magnitude. */
  wishDir(out) {
    const input = this.ctx.input, cam = this.ctx.cam;
    // iso: screen-relative through the latched stick yaw (§2.2); classic: the orbit yaw
    const yaw = (cam?.isIso ? cam.stickYaw : null) ?? cam?.yaw ?? Math.PI;
    // forward = (-sin yaw, 0, -cos yaw), screen-right = (cos yaw, 0, -sin yaw)  (tech.md §8; move.y+ = forward)
    if (this.moveLockT > 0) { out.set(0, 0, 0); return 0; }      // after a splash (§7.1)
    const mx = input.move.x, my = input.move.y;
    // §5.1 direct input always wins: |move| >= 0.15 cancels any order; otherwise an order steers her (§5.2)
    // (an armed attack-move with no order yet is disarmed by direct input too)
    if (Math.hypot(mx, my) >= 0.15) { if (this.orders.kind || this.orders.attackMoveArmed) this.orders.cancelByDirect(); }
    else if (this.orders.kind) return this.orders.steer(out);
    out.set(-Math.sin(yaw) * my + Math.cos(yaw) * mx, 0, -Math.cos(yaw) * my - Math.sin(yaw) * mx);
    const l = out.length();
    if (l > 1) out.divideScalar(l);
    return Math.min(1, l);
  }

  /** Speed multiplier: Golden Hour ×1.1, shallow water ×0.6. */
  get speedMul() {
    const slowed = this.slowT > 0 ? 1 - Math.min(0.9, Math.max(0, this.slow)) : 1;
    return (this.golden ? PLAYER.golden.speedMul : 1) * (this.inShallow ? PLAYER.water.shallowMul : 1) * slowed;
  }

  /** Status slow (requests/enemies.md; §10.3 web: ×0.5 for 2 s, a roll clears it). The strongest / longest wins. */
  applySlow(mul, sec, source = null) {
    if (!this.alive || this.scripted || !(sec > 0)) return;
    if (this.state === 'dodge') return;
    this.slowT = Math.max(this.slowT, sec);
    this.slow = Math.max(this.slow, 1 - mul);
    this.slowSource = source;
  }
  isSlowed() { return this.slowT > 0 && this.slow > 0; }
  /** Clears status effects (Clover's Purr of Mending; a tumble clears the slow). */
  cleanse() { this.slow = 0; this.slowT = 0; this.slowSource = null; }
  /** Public: re-derive maxHp / milkMax (Heart Bells, satchel, Mochi). */
  recomputeMax() { this._recomputeMax(); }

  /** The camera's lock-on target (camera owns lock-on), if alive. */
  lockTarget() { const t = this.ctx.cam?.lockTarget; return t && t.alive !== false && t.pos ? t : null; }

  wantGuard() {
    const st = this.ctx.state;
    if (this.autoStandT > 0) return true;
    return st?.settings?.holdStand === false ? this.guardToggle : this.ctx.input.down('guard');
  }

  /** The Stand is held, or a fresh press of it is still inside the input buffer (newer than the last ⚔ press). */
  standPending() {
    if (this.wantGuard()) return true;
    const now = this.ctx.game.time;
    return this.lastGuardPress >= 0 && this.lastGuardPress > this.lastAttackPress && now - this.lastGuardPress <= PLAYER.assist.buffer;
  }
  /** A real ⚔ press within the last `win` s. */
  attackPressedSince(win) { return this.lastAttackPress >= 0 && this.ctx.game.time - this.lastAttackPress <= win; }

  chargeHeld() {
    if (this.ctx.state?.settings?.holdCharge === false && this.state === 'charge') return !this.chargeToggleRelease;
    return this.ctx.input.down('attack');
  }
  attackHeldTime() { return this.ctx.input.heldTime('attack'); }

  canDodge() { return this.alive && this.onGround && this.dodgeCd <= 0; }
  startDodge() {
    const mag = this.wishDir(_dir);
    if (mag < 0.1 && this.ctx.cam?.isIso !== false) {
      // §6.2 / §6.4: WASD / stick, else toward the cursor (KBM) / the drag (touch) / RS, else away from the soonest
      // threat (touch), else facing
      const o = this.resolveAim('dodge');
      if (o.source === 'cursor' || o.source === 'explicit') _dir.set(o.dir.x, 0, o.dir.z);
      else if (this.ctx.input?.device === 'touch') {
        const t = this.ctx.combat?.nextParryable?.(this, 6)?.attacker;
        if (t?.pos) _dir.set(this.pos.x - t.pos.x, 0, this.pos.z - t.pos.z); else _dir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
      } else _dir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
      if (_dir.lengthSq() < 1e-6) _dir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    } else if (mag < 0.1) _dir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    this.orders.onDodge();
    this.dodgeDir.copy(_dir.normalize());
    this.facing = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
    this.dodgeBuf = 0; this.zoomies = false; this.zoomT = 0; this._steered = false;
    this.cleanse();
    this.setState('dodge');
    this.ctx.bus.emit(E.PLAYER_DODGE, { dir: this.dodgeDir.clone() });
  }

  /** §6.4 touch Tumble steer: a drag inside the roll's first 0.08 s re-aims it once (world unit x, z). */
  steerDodge(x, z) {
    if (this.state !== 'dodge' || this._steered || (this.guardState?.dodgeT ?? 1) > (this.ctx.config?.TOUCH?.steerWindow ?? 0.08) + 0.05) return false;
    const l = Math.hypot(x, z);
    if (l < 1e-6) return false;
    this._steered = true;
    this.dodgeDir.set(x / l, 0, z / l);
    this.facing = Math.atan2(x, z);
    return true;
  }

  doJump() {
    this.vel.y = PLAYER.jumpV; this.onGround = false; this.coyoteT = 0; this.jumpBuf = 0;
    this.jumping = true; this.jumpCutDone = false;
    this.squashEvent = 'jump';
    this.ctx.bus.emit(E.PLAYER_JUMP, {});
  }

  /**
   * A jump from her own input (F / A / the Jump button). §5.4 jump direction: along the path when an order walks her
   * (the follower keeps steering in the air), else her current velocity, else straight up; plus the jump assist toward
   * a raised walkable top within 2.4 m (iso only).
   */
  inputJump() {
    this.doJump();
    this._jumpAssist();
  }

  _jumpAssist() {
    const aa = this.airAssist;
    aa.on = false; aa.x = 0; aa.z = 0;
    const ph = this.ctx.physics, A = AIM.jumpAssist;
    if (!A || this.ctx.cam?.isIso === false || this.orders.kind || typeof ph?.topAt !== 'function') return;
    const probe = (x, z) => ({ top: ph.topAt(x, z), walkable: ph.navWalkable ? ph.navWalkable(x, z) !== false : true });
    const plan = jumpAssistPlan(this.pos, this.vel, probe, { ...A, v0: PLAYER.jumpV, g: GRAVITY, fallMul: PLAYER.fallGravityMul });
    if (!plan) return;
    aa.x = plan.vx - this.vel.x; aa.z = plan.vz - this.vel.z; aa.on = true;
    this.vel.x = plan.vx; this.vel.z = plan.vz;
    this.jumpCutDone = true;                                          // an assisted hop always reaches its top
    this.jumpAssists = (this.jumpAssists ?? 0) + 1;
  }

  /**
   * §6.2 / §6.4 Pounce aim: KBM → the cursor point (≤ AIM.pounceMax m horizontal), a hostile (crows first) within
   * AIM.pounceMagnet m of it magnetised; touch / pad → the best hostile in an AIM.pounceTouchDisc m disc around her,
   * else the resolved aim. Writes out { x, z, valid, target }.
   */
  pouncePlan(out = this.diveAt) {
    const ctx = this.ctx, input = ctx.input, cam = ctx.cam;
    out.valid = false; out.target = null;
    if (cam?.isIso === false) return out;
    const kbm = input?.device === 'kbm' && input?.preset !== 'keyboardOnly';
    let cx, cz, R;
    if (kbm && cam?.cursorValid && (input.pointerIdle?.() ?? 99) < AIM.cursorIdle) {
      const c = cam.cursorGround;
      let dx = c.x - this.pos.x, dz = c.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > AIM.pounceMax) { dx *= AIM.pounceMax / d; dz *= AIM.pounceMax / d; }
      cx = this.pos.x + dx; cz = this.pos.z + dz; R = AIM.pounceMagnet;
    } else { cx = this.pos.x; cz = this.pos.z; R = AIM.pounceTouchDisc; }
    let best = null, bs = Infinity;
    for (const a of ctx.actors?.queryRadius?.(_v.set(cx, this.pos.y, cz), R + 1, _hostile) ?? []) {
      if (!a?.pos || a.alive === false || a.hidden || a.hurtable === false || a.breakable || a.dormant) continue;
      const d = Math.hypot(a.pos.x - cx, a.pos.z - cz);
      if (d > R + (a.radius ?? 0)) continue;
      if (Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) > AIM.pounceMax + (a.radius ?? 0)) continue;
      const sc = d - (a.tags?.has?.('flyer') ? 1 : 0);
      if (sc < bs) { bs = sc; best = a; }
    }
    if (best) { out.x = best.pos.x; out.z = best.pos.z; out.target = best; out.valid = true; return out; }
    if (kbm && R === AIM.pounceMagnet) { out.x = cx; out.z = cz; out.valid = true; return out; }
    const o = this.resolveAim('pounce', ATTACKS.pounce.arc.range);
    const reach = o.target?.pos ? Math.min(AIM.pounceMax, Math.hypot(o.target.pos.x - this.pos.x, o.target.pos.z - this.pos.z)) : 0.6;
    out.x = this.pos.x + o.dir.x * reach; out.z = this.pos.z + o.dir.z * reach; out.target = o.target ?? null; out.valid = true;
    return out;
  }

  updateZoomies(dt, mag) {
    if (!this.onGround) return;                                          // airborne keeps the run going
    if (mag < TUNING.zoomiesMinStick || this.state !== 'move' || this._alertedWithin(PLAYER.zoomiesClearRadius)) {
      this.zoomies = false; this.zoomT = 0; return;
    }
    this.wishDir(_dir);
    const heading = Math.atan2(_dir.x, _dir.z);
    if (this.zoomT === 0 || Math.abs(wrapAngle(heading - this.zoomHeading)) > TUNING.zoomiesTurnReset) {
      if (this.zoomT > 0) this.zoomies = false;
      this.zoomHeading = heading; this.zoomT = dt; return;
    }
    this.zoomHeading = dampAngle(this.zoomHeading, heading, 2, dt);
    this.zoomT += dt;
    if (!this.zoomies && this.zoomT >= PLAYER.zoomiesAfter) this.zoomies = true;
  }

  _alertedWithin(r) {
    const list = this.ctx.enemies?.list;
    if (!list) return false;
    for (const e of list) if (e.alive && e.alerted && Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < r) return true;
    return false;
  }

  // ---- attacks
  riposteReady() {
    const t = this.riposteTarget;
    return this.riposteT > 0 && !!t && t.alive !== false && Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) <= PLAYER.guard.riposteRange;
  }

  startGroundAttack() {
    if (this.riposteReady()) { this.startAttack('riposte'); return; }
    // §14.4 / §15.3 auto-combo taps: a tap shortly after a Snip / Snap ended continues the chain
    // (§7.2) every device gets a short grace too, so a press in rhythm with the visible swing still chains
    const grace = this.autoCombo() ? TUNING.autoComboGrace : TUNING.comboGrace;
    const graceOk = this.comboNext && (this.ctx.game.time - this.comboEndT) <= grace + 1e-6;
    this.startAttack(graceOk ? this.comboNext : 'slash1');
  }

  /** Touch assist "auto-combo taps": repeated taps continue the chain without needing the timing window. */
  autoCombo() { return this.ctx.input?.device === 'touch' || this.ctx.state?.settings?.autoCombo === true; }

  /** A chained swing ran to its end without a follow-up: remember the next hit for the auto-combo grace. */
  noteComboEnd(def) {
    if (def?.next && def.combo) { this.comboNext = def.next; this.comboEndT = this.ctx.game.time; }
  }

  /** Start a swing by attack id (slash1-3, bright, holy, riposte, sunburst). */
  startAttack(id) {
    const ctx = this.ctx, def = ATTACKS[id];
    if (!def) return;
    if (this.swing) this.endSwing();
    this.comboNext = null;
    // facing: riposte → the parried enemy; the attack order's target; else (iso, §7.1) the one aim resolver —
    // explicit (touch drag / RS) → the cursor (KBM) → the selected target → the soft auto-target → the stick → facing.
    // Classic: the lock-on target, else a fresh stick direction.
    const lock = this.lockTarget();
    let lungeAt = null;
    if (id === 'riposte' && this.riposteTarget) this._faceActor(this.riposteTarget);
    else if (this.orders.kind === 'attack' && this.orders.engaged && this.orders.target?.pos) this._faceActor(this.orders.target);
    else if (this.ctx.cam?.isIso !== false) { if (id !== 'sunburst') lungeAt = this._lungeCandidate(this.faceAim('attack', def.arc?.range ?? ATTACKS.slash1.arc.range)); }
    else if (lock && Math.hypot(lock.pos.x - this.pos.x, lock.pos.z - this.pos.z) < PLAYER.lockOn.range) this._faceActor(lock);
    else if (this.wishDir(_dir) > 0.3) this.facing = Math.atan2(_dir.x, _dir.z);
    this._riposteFace = id === 'riposte' ? this.riposteTarget : null;
    if (id === 'riposte') { this.riposteT = 0; this.riposteTarget = null; }
    // §7.1 lunge magnetism from the first frame of the lunge window (touch / pad / auto-target swings)
    this.swing = ctx.combat.beginSwing(this, def, this._riposteFace ? { target: this._riposteFace } : lungeAt && def.lunge ? { lungeTo: lungeAt } : undefined);
    this.applySwingOpts(this.swing);
    // the aim this swing was released with: an explicit aim (a touch drag / RS) keeps its narrow magnet on the active
    // frame, even when the drag pad already let go (ui clears virtualAim ~2 frames after release)
    if (this.swing) this.swing.aimSource = this.ctx.cam?.isIso !== false && id !== 'riposte' ? this.aim.source : null;
    this.swingSerial++;
    // a Stand held into the swing can't cancel it (PlayerStates.attack): ⚔ out of the Stand, a Riposte, Auto-Stand.
    // A Stand pressed AFTER the ⚔ press behind this swing (an auto-chain / queued combo hit) is a fresh parry intent
    // and is not latched, so it still cancels the wind-up / recovery
    const freshStand = this.lastGuardPress >= 0 && this.lastGuardPress > this.lastAttackPress && this.autoStandT <= 0;
    this.swingGuardLatch = this.wantGuard() && (id === 'riposte' || !freshStand);
    this.attackBuf = 0;
    this.comboIndex = COMBO_INDEX[id] ?? 0;
    this.zoomies = false; this.zoomT = 0;
    this.combatT = TUNING.combatStance;
    this.setState('attack');
    if (id === 'holy') {
      if (!this.golden) this._valorChanged(this.valorState.spend(def.cost ?? PLAYER.valor.holyCost), 'holy');
      ctx.bus.emit(E.PLAYER_HOLY, { position: this.pos.clone(), dir: new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)), golden: this.golden });
    }
    this.emitSwing(id, this.comboIndex);
  }

  emitSwing(id, combo) { this.ctx.bus.emit(E.PLAYER_SWING, { attackId: id, combo, golden: this.golden }); }

  /**
   * Crit for Combat.applyHit via swing.opts (Purrfect Dodge: the next hit within 1.2 s crits ×1.5). Combat already
   * applies sharpness × Golden Hour (`dealtMul`), i-frames, Holy slow motion, the holyWave and the gleams.
   */
  applySwingOpts(s) {
    if (!s) return;
    s.opts = s.opts ?? {};
    s.opts.crit = this.critT > 0 ? PLAYER.dodge.perfectCrit : 1;
  }

  endSwing() { this.swing = null; this.comboIndex = 0; }

  /** First active frame: aim assist (Combat defers to ours), the crit window is re-read. */
  onActiveStart(s) {
    const def = s.def, full = def.arc && Math.abs(def.arc.from - def.arc.to) >= Math.PI * 2 - 1e-3;
    const rt = def.id === 'riposte' ? this._riposteFace : null;                // Riposte: auto-turn to the parried enemy
    if (rt && rt.alive !== false && Math.hypot(rt.pos.x - this.pos.x, rt.pos.z - this.pos.z) <= PLAYER.guard.riposteRange + (rt.radius ?? 0)) this._faceActor(rt);
    else if (!full) this.aimAssist();
    this.applySwingOpts(s);
  }

  /**
   * §7.1 magnet (first active frame): turn fully to the best hostile inside a cone around the resolved aim — KBM 25°
   * (selected 40°) at range + 1.0 m, pad with RS 45° / 3.5 m, touch and auto 90° / 4.5 m (360° with the stick idle).
   * Lunge magnetism (touch / pad / auto): a target beyond reach lengthens the lunge. Classic camera: the old assist.
   */
  aimAssist() {
    if (this.ctx.cam?.isIso === false) return this._aimAssistClassic();
    const input = this.ctx.input, dev = input?.device === 'touch' ? 'touch' : input?.device === 'pad' ? 'pad' : 'kbm';
    const def = this.swing?.def, range = def?.arc?.range ?? ATTACKS.slash1.arc.range;
    const aim = this.aim, sel = this.lockTarget();
    // a swing released with an explicit aim (touch drag / RS) uses the pad-RS cone (±45°, 3.5 m) around that aim: never
    // the 360° "stick idle" cone, which would turn a deliberate drag back toward a foe behind her
    const explicit = this.swing?.aimSource === 'explicit';
    const stickIdle = !explicit && Math.hypot(input?.move?.x ?? 0, input?.move?.y ?? 0) < 0.3 && !input?.virtualAim?.active;
    const padAim = dev === 'pad' && Math.hypot(input?.aimStick?.x ?? 0, input?.aimStick?.y ?? 0) > 0.35;
    const auto = !explicit && (aim.source === 'auto' || aim.source === 'facing' || aim.source === 'move' || input?.preset === 'keyboardOnly');
    const cone = explicit ? { angle: AIM.padCone, range: AIM.padRange }
      : assistCone(dev, { arcRange: range, selected: aim.target != null && aim.target === sel, auto: dev === 'kbm' && auto, padAim, stickIdle });
    _cands.length = 0;
    for (const a of this.ctx.actors.queryRadius(this.pos, cone.range + 1.5, _hostile)) _cands.push(a);
    _dir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    const t0 = aim.target;
    let best = t0 && t0.alive !== false && t0.pos && !t0.breakable && Math.hypot(t0.pos.x - this.pos.x, t0.pos.z - this.pos.z) - (t0.radius ?? 0) <= cone.range
      && (!explicit || Math.abs(wrapAngle(Math.atan2(t0.pos.x - this.pos.x, t0.pos.z - this.pos.z) - this.facing)) <= cone.angle) ? t0 : null;
    best ??= magnetPick(this.pos, _dir, _cands, cone.angle, cone.range);
    if (best) {
      this._faceActor(best);
      if ((dev !== 'kbm' || auto) && this.swing && def?.lunge) {
        const d = Math.hypot(best.pos.x - this.pos.x, best.pos.z - this.pos.z) - (best.radius ?? 0);
        this.swing.lungeOverride = lungeSpeed(def, d, range);
      }
    } else if (this.orders.kind === 'attack' && this.orders.target?.breakable) this._faceActor(this.orders.target);
    return best;
  }

  /** §7.2 (classic camera) assists: turn toward the nearest enemy within 60° / 3 m (touch 90° / 4 m); the lock-on target wins. */
  _aimAssistClassic() {
    const A = PLAYER.assist, touch = this.ctx.input?.device === 'touch';
    const ang = touch ? A.touchAngle : A.angle, range = touch ? A.touchRange : A.range;
    const lock = this.lockTarget();
    if (lock && Math.hypot(lock.pos.x - this.pos.x, lock.pos.z - this.pos.z) <= range + (lock.radius ?? 0)) { this._faceActor(lock); return lock; }
    let best = null;
    if (typeof this.ctx.combat?.assistTarget === 'function') best = this.ctx.combat.assistTarget(this, range, ang, null);
    else {
      let bd = Infinity;
      for (const a of this.ctx.actors.queryRadius(this.pos, range + 1, _hostile)) {
        if (!a.alive || a.hurtable === false || a.hidden) continue;
        const dx = a.pos.x - this.pos.x, dz = a.pos.z - this.pos.z, d = Math.hypot(dx, dz) - (a.radius ?? 0);
        if (d > range || Math.abs(wrapAngle(Math.atan2(dx, dz) - this.facing)) > ang) continue;
        if (d < bd) { bd = d; best = a; }
      }
    }
    if (best) this._faceActor(best);
    return best;
  }

  /** The aim's target when the swing should lunge at it (§7.1: touch / pad / the soft auto-target; never a KBM cursor swing). */
  _lungeCandidate(o) {
    const t = o?.target, dev = this.ctx.input?.device;
    if (!t?.pos || t.alive === false || t.breakable || t.faction === this.faction) return null;
    if (dev === 'touch' || dev === 'pad' || o.source === 'auto' || this.ctx.input?.preset === 'keyboardOnly') return t;
    return null;
  }

  _faceActor(a) { this.facing = Math.atan2(a.pos.x - this.pos.x, a.pos.z - this.pos.z); }

  /**
   * Held verbs that keep turning toward the aim (§6.2 / §8.1): the charge (540°/s toward the cursor / drag / RS) and
   * the Stand (KBM: toward the cursor at 360°/s once it moved 30 px; touch: auto-faces the soonest threat; pad: RS).
   * Returns true when it set the facing (locomote must not turn her).
   */
  aimTurn(dt, kind) {
    if (this.ctx.cam?.isIso === false) return false;
    const input = this.ctx.input, dev = input?.device;
    let yaw = null;
    const rate = kind === 'charge' ? AIM.chargeTurn : PLAYER.guard.turnRate;
    if (kind === 'guard') {
      if (dev === 'touch' && this.ctx.state?.settings?.standAutoFace !== false) {
        const nx = this.ctx.combat?.nextParryable?.(this, 6);
        const t = nx?.pos ? { pos: nx.pos } : nx?.attacker ?? this.lockTarget();   // a bolt: face the bolt
        if (t?.pos) yaw = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      } else if (dev === 'kbm') {
        const P = input.pointer, g = this._guardPtr;
        if (!g.armed && P && Math.hypot(P.x - g.x, P.y - g.y) >= AIM.cursorReaimPx) g.armed = true;
        if (g.armed && this.ctx.cam?.cursorValid) { const c = this.ctx.cam.cursorGround; yaw = Math.atan2(c.x - this.pos.x, c.z - this.pos.z); }
        else return true;                                           // planted: the stick strafes without turning
      }
    }
    if (yaw == null) {
      const o = this.resolveAim(kind);
      if (o.source === 'cursor' || o.source === 'explicit' || (kind === 'charge' && (o.source === 'selected' || o.source === 'auto'))) yaw = Math.atan2(o.dir.x, o.dir.z);
    }
    if (yaw == null) return false;
    const d = wrapAngle(yaw - this.facing), step = rate * dt;
    this.facing += Math.abs(d) <= step ? d : Math.sign(d) * step;
    return true;
  }

  // ---- charge (§7.2)
  tier1Time() { return this.ctx.state?.upgrades?.quickCharge ? ECONOMY.shops.quickCharge.tier1 : PLAYER.charge.tier1; }
  tier2Time() {
    const t2 = this.ctx.state?.upgrades?.quickCharge ? ECONOMY.shops.quickCharge.tier2 : PLAYER.charge.tier2;
    return this.golden ? Math.min(t2, PLAYER.golden.holyChargeTime) : t2;
  }
  canHoly() {
    return this.shards >= (ATTACKS.holy.minShards ?? 1) && (this.golden || this.valorState.canSpend(PLAYER.charge.holyMinValor));
  }
  emitCharge(level, fizzle = false) { this.ctx.bus.emit(E.PLAYER_CHARGE, { level, fizzle, holy: level >= 1 }); }
  clearCharge() { this.charge = 0; this.chargeTier = 0; this.chargeT = 0; this.chargeFizzled = false; }
  cancelCharge() { if (this.charge > 0 || this.chargeTier > 0 || this.state === 'charge') { this.clearCharge(); this.emitCharge(0); } }

  // ---- the Stand
  startGuard() {
    // §8.1 threat snap on press: a parryable wind-up (or an incoming bolt) within 5 m landing within 0.7 s: face it at
    // once; else face the resolved aim (the cursor on KBM). The Stand plants her: move orders clear.
    this.orders.onGuard();
    if (this.ctx.cam?.isIso !== false) {
      const nx = this.ctx.combat?.nextParryable?.(this, AIM.standSnapRange);
      const snap = nx ? threatSnap(this.pos, [nx], this.ctx.game.time, _snapOut) : null;
      if (snap) { const at = _snapOut.at ?? snap.pos; this.facing = Math.atan2(at.x - this.pos.x, at.z - this.pos.z); }
      else if (!this.lockTarget()) { const o = this.resolveAim('guard'); if (o.source !== 'move' && o.source !== 'facing') this.facing = Math.atan2(o.dir.x, o.dir.z); }
      const P = this.ctx.input?.pointer;
      this._guardPtr.x = P?.x ?? 0; this._guardPtr.y = P?.y ?? 0; this._guardPtr.armed = false;
    }
    // the parry window opens only on a real press: re-entering the Stand with the button held is a plain block
    const now = this.ctx.game.time, held = this.lastGuardPress >= 0 ? now - this.lastGuardPress : Infinity;
    this.guardState.start(held);
    this.zoomies = false; this.zoomT = 0;
    this.combatT = TUNING.combatStance;
    this.model.emote('earsFlat');                                         // §7.7 ear tell
    this.ctx.bus.emit(E.PLAYER_GUARD, { on: true });
  }
  stopGuard() {
    if (!this.guardState.guarding) return;
    const whiff = this.guardState.stop();
    this.pushT = 0;
    this.ctx.bus.emit(E.PLAYER_GUARD, { on: false, whiff });
  }

  // ---- Milk Break (§7.6)
  canSip() { return this.alive && this.onGround && this.milk > 0 && this.hp < this.maxHp; }
  startSip() {
    this.sipHealed = false; this.sipActive = true; this.zoomies = false;
    this.ctx.bus.emit(E.PLAYER_MILK, { phase: 'start', left: this.milk, max: this.milkMax });
  }
  sipHeal() {
    this.sipHealed = true;
    this.milk = Math.max(0, this.milk - 1);
    this.heal(PLAYER.milk.heal);
    this.ctx.bus.emit(E.PLAYER_MILK, { phase: 'heal', left: this.milk, max: this.milkMax });
  }
  cancelSip() {
    if (!this.sipActive || this.sipHealed) return;
    this.sipActive = false;
    this.ctx.bus.emit(E.PLAYER_MILK, { phase: 'cancel', left: this.milk, max: this.milkMax });
  }

  // ---- Meow (§7.7)
  tryMeow() {
    if (this.meowCd > 0 || !this.alive || this.state === 'dead' || this.state === 'golden' || this.state === 'memecam') return false;
    const M = PLAYER.meow;
    this.meowT = M.dur; this.meowCd = M.cooldown;
    this.model.emote('meow');
    this.ctx.bus.emit(E.PLAYER_MEOW, { position: this.pos.clone() });
    return true;
  }

  // ---- Golden Hour (§7.5)
  canGolden() {
    if (!this.alive || this.golden || !this.onGround || this.shards < TUNING.goldenMinShards) return false;
    if (!this.valorState.full || this.valorState.lockT > 0) return false;
    const s = this.state;
    if (s === 'attack') return !!this.swing && this.swing.t < (this.swing.def.active?.[0] ?? 0);
    return s === 'move' || s === 'guard' || s === 'charge';
  }

  /** V / RT / gold button, or Stand + ⚔ pressed within 0.1 s of each other. */
  tryGolden() {
    if (!this.canGolden()) return false;
    const input = this.ctx.input, G = PLAYER.golden;
    const combo = (input.pressed('guard') || input.pressed('attack')) && this.lastGuardPress >= 0 && this.lastAttackPress >= 0 &&
      Math.abs(this.lastGuardPress - this.lastAttackPress) <= G.inputWindow + 1e-6;
    if (!input.pressed('golden') && !combo) return false;
    this.startGolden();
    return true;
  }

  startGolden() {
    const ctx = this.ctx, G = PLAYER.golden;
    if (this.swing) this.endSwing();
    if (this.state === 'guard') this.stopGuard();
    this.cancelCharge();
    this.attackBuf = 0; this.lastGuardPress = -1; this.lastAttackPress = -1;
    this._valorChanged(this.valorState.spend(PLAYER.valor.goldenCost), 'golden');
    this.golden = true; this.goldenActivating = true;
    this.goldenT = G.dur + (ctx.state?.getFlag?.('ending.seen') ? G.postGameBonus : 0);
    ctx.env?.contribute?.('golden', { fogMul: G.fogMul });                // the Gloom recedes
    if (typeof ctx.combat?.staggerArea === 'function') ctx.combat.staggerArea(this, G.staggerRadius, G.staggerDur);
    else for (const e of ctx.actors.queryRadius(this.pos, G.staggerRadius, _hostile)) {
      if (!e.alive) continue;
      if (typeof e.stagger === 'function') e.stagger(G.staggerDur); else e.staggerT = Math.max(e.staggerT ?? 0, G.staggerDur);
    }
    // the camera punches in on player:golden by itself (FollowCamera), fx/audio key off it too (bloom, stinger)
    this._rumble(JUICE.holy.rumble);
    this.combatT = TUNING.combatStance;
    this.setState('golden');
    ctx.bus.emit(E.PLAYER_GOLDEN, { on: true, dur: this.goldenT });
  }

  finishGoldenActivation() {
    this.goldenActivating = false;
    if (this.state === 'golden') this.setState('move');
  }

  /** Golden Hour ends: automatic Sunburst, Valor locked at 0 for 3 s. */
  endGolden(sunburst = true) {
    const ctx = this.ctx;
    if (!this.golden) return;
    if (this.goldenActivating) this.finishGoldenActivation();
    this.golden = false; this.goldenT = 0; this.goldenActivating = false;
    ctx.env?.clear?.('golden');
    this._valorChanged(this.valorState.lock(PLAYER.golden.valorLockAfter), 'goldenEnd');
    ctx.bus.emit(E.PLAYER_GOLDEN, { on: false });
    if (sunburst && this.alive && !this.scripted && this.state !== 'dead' && this.state !== 'memecam') {
      if (this.state === 'guard') this.stopGuard();
      this.cancelCharge();
      this.startAttack('sunburst');
    }
  }

  // ---- Still Standing (§7.6)
  _triggerStillStanding() {
    const ctx = this.ctx, S = PLAYER.stillStanding;
    this._stillStandingPending = false;
    this.immuneT = S.invuln;
    if (this.swing) this.endSwing();
    if (this.state === 'guard') this.stopGuard();
    this.cancelCharge();
    if (this.state === 'sip' && !this.sipHealed) this.cancelSip();
    this._valorChanged(this.valorState.gain('stillStanding'), 'stillStanding');
    ctx.game.slowMo?.(S.riseTimeScale, S.riseDur);
    ctx.bus.emit(E.PLAYER_STILL_STANDING, {});
    this.setState('rise');
  }

  // ---- respawn (§7.6)
  respawn() {
    const ctx = this.ctx;
    this.alive = true; this.hurtable = true;
    this.hp = this.maxHp;
    this.invulnT = TUNING.respawnInvuln; this.blinkT = TUNING.respawnInvuln;
    this._valorChanged(this.valorState.respawn(), 'respawn');
    this.guardState.reset();
    this.setState('move');
    this.teleport({ pos: this.respawnPoint.pos, facing: this.respawnPoint.facing });
    ctx.bus.emit(E.PLAYER_HEALED, { amount: this.maxHp, hp: this.hp, maxHp: this.maxHp });
    // WA §5.7 boing back: the cream wipe clears over her and she pops up (Squash +2, hearts, a hop)
    if (this._koWiped) { this._koWiped = false; this._wipe(false); }
    this.model.respawnPop?.();
    ctx.bus.emit(E.BURST, { kind: 'hearts', position: this.pos.clone(), count: KO.hearts });
    this._syncState();
  }

  /** The WA §5.7 cream wipe (ui cinema fade, FADE_COLOR, KO.wipeT): `on` covers, else clears. */
  _wipe(on) {
    const ui = this.ctx.ui;
    try {
      if (typeof ui?.fade === 'function') ui.fade(on ? { to: FADE_COLOR, alpha: 1, dur: KO.wipeT } : { to: null, dur: KO.wipeT });
    } catch (e) { console.warn('[player] knock-out wipe', e); }
  }

  /** dead state (fixed step): at KO.sitT the cream wipe starts (not on a game over); the respawn follows at sitT + wipeT. */
  koTick() {
    if (this.livesState.gameOver) return;
    if (!this._koWiped && this.stateT >= KO.sitT) { this._koWiped = true; this._wipe(true); }
    if (this.stateT >= koRespawnT() - 1e-9) this.respawn();
  }

  /**
   * Deep water / pit: −1 HP, back to the last safe ground, no life lost (§7.1). She is put back on a sample at least
   * `splashReturnDist` from the splash, clear of deep water, facing away from it, with move input ignored until
   * the stick is released (so a held stick can't walk her straight back in). Repeat splashes inside the cooldown or
   * her i-frames cost nothing, and water never takes her below 1 HP.
   */
  _splash() {
    const ctx = this.ctx, phys = ctx.physics;
    const sx = this.pos.x, sz = this.pos.z;
    ctx.bus.emit(E.BURST, { kind: 'splash', position: this.pos.clone() });
    const clearR = TUNING.splashClearRadius;
    const dry = typeof phys?.isDeepWater === 'function'
      ? (p) => {
        if (phys.isDeepWater(p.x, p.z, p.y)) return false;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          if (phys.isDeepWater(p.x + Math.sin(a) * clearR, p.z + Math.cos(a) * clearR, p.y)) return false;
        }
        return true;
      }
      : null;
    const minDist = Math.max(TUNING.safeMinDist, TUNING.splashReturnDist);
    if (!this.safeGround.best(_v, this.pos, minDist, dry)) _v.copy(this.respawnPoint.pos);
    if (this.swing) this.endSwing();
    if (this.state === 'guard') this.stopGuard();
    if (this.state === 'charge') this.cancelCharge();
    // face away from the water
    const ax = _v.x - sx, az = _v.z - sz;
    if (Math.hypot(ax, az) > 0.1) this.facing = Math.atan2(ax, az);
    this.pos.copy(_v); this.vel.set(0, 0, 0); this.onGround = false;
    this.snap(); this.model.snap();
    this.setState('move');
    this.moveLockT = TUNING.splashLockMax;
    this.attackBuf = 0; this.dodgeBuf = 0; this.jumpBuf = 0;
    if (!(this.splashCdT > 0 || this.invulnT > 0)) {
      this.splashCdT = TUNING.splashCooldown;
      this._envDamage(PLAYER.water.deepDamage, 'water', true);
    }
    if (this.alive) this.invulnT = Math.max(this.invulnT, TUNING.splashInvuln);
  }

  /**
   * Damage that doesn't come through Combat (water, pits). Honours god, Golden Hour and Still Standing.
   * `nonLethal` floors her at 1 HP (§7.1 water / pits never cost a life).
   */
  _envDamage(n, source, nonLethal = false) {
    if (this.god || !this.alive || !(n > 0)) return;
    const diff = this.ctx.state?.difficultyCfg;
    let dmg = diff?.roundTaken ? Math.round(diff.roundTaken(n)) : n;
    if (this.golden) dmg = Math.floor(dmg * PLAYER.golden.takenMul);
    if (nonLethal) dmg = Math.min(dmg, this.hp - 1);
    if (dmg <= 0) return;
    this.hp = Math.max(0, this.hp - dmg);
    if (this.hp <= 0) this.onLethal();
    this.ctx.bus.emit(E.PLAYER_DAMAGED, { amount: dmg, hp: this.hp, maxHp: this.maxHp, source });
    this._valorChanged(this.valorState.hurt(), 'hurt');
    this.blinkT = PLAYER.hurt.iframes;
    if (this.hp <= 0) { this.alive = false; this.onDeath(); }
    else if (this._stillStandingPending) this._triggerStillStanding();
  }

  // ---- Meme Cam
  onMemeCam(on) {
    if (on) {
      if (this.state === 'guard') this.stopGuard();
      if (this.alive && !this.scripted) this.setState('memecam');
    } else if (this.state === 'memecam') this.setState('move');
    this.model.memeCam(on);
  }

  // ------------------------------------------------------------------ event handlers
  _valorChanged(delta, reason) {
    if (delta !== 0) {
      this._flushValor();
      this.ctx.bus.emit(E.PLAYER_VALOR, { value: this.valorState.value, max: this.valorState.max, delta, reason });
    }
    return delta;
  }

  /** Continuous Valor (Standing Ground, Jeer): emitted in ≥ 1-point chunks (and at 0 / max). */
  _valorAccumulate(delta, reason) {
    if (this._valorAccReason && this._valorAccReason !== reason) this._flushValor();
    this._valorAcc += delta; this._valorAccReason = reason;
    const v = this.valorState.value;
    if (Math.abs(this._valorAcc) >= 1 || v <= 0 || v >= this.valorState.max) this._flushValor();
  }

  _flushValor() {
    if (this._valorAcc === 0) { this._valorAccReason = ''; return; }
    const delta = this._valorAcc, reason = this._valorAccReason;
    this._valorAcc = 0; this._valorAccReason = '';
    this.ctx.bus.emit(E.PLAYER_VALOR, { value: this.valorState.value, max: this.valorState.max, delta, reason });
  }

  /** Her hits: Valor (light cap 8 per swing, heavy +6, Riposte +8) and the Purrfect Dodge crit is used up. */
  _onHitEvent(h) {
    if (!h || h.attacker !== this || h.blocked) return;
    const tgt = h.target;
    // WA §5.3 / §5.1 words: the first hit of each swing says its word; the kill that ends an encounter says "Bonk!"
    if (!tgt?.breakable) {
      if (h.killed && this._finalBlow(tgt)) { this.sayWord('finalBlow', true); this._wordSerial = this.swingSerial; }
      else if (this._wordSerial !== this.swingSerial && !h.projectile) {
        this._wordSerial = this.swingSerial;
        this.sayWord(h.attackId === 'pounce' || this.swing?.def?.id === 'pounce' ? 'pounce' : (h.attackId ?? this.swing?.def?.id));
      }
    }
    if (tgt && (tgt.breakable || tgt.tags?.has?.('prop'))) return;      // cage locks, crates, boulders: no Valor
    const def = ATTACKS[h.attackId];
    this.combatT = TUNING.combatStance;
    if (this.critT > 0 && !h.projectile) this.critT = 0;
    if (!def) return;
    const key = this.swingSerial;
    if (def.valorFlat) {
      if (this._riposteValorKey !== key) { this._riposteValorKey = key; this._valorChanged(this.valorState.add(def.valorFlat, 'riposte'), 'riposte'); }
    } else if (def.valor) this._valorChanged(this.valorState.hit(def.valor, key), def.valor);
  }

  _onEnemyAlerted(e) {
    if (!e?.pos) return;
    const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
    if (d < PLAYER.zoomiesClearRadius) { this.zoomies = false; this.zoomT = 0; }
    if ((e.height ?? 0) > TUNING.tailPuffHeight && d < 30) this.model.emote('tailPuff');
  }

  _onPickup(p) {
    if (!p) return;
    const st = this.ctx.state;
    switch (p.item) {
      case 'milk': this.milk = Math.min(this.milkMax, this.milk + (p.amount ?? 1)); break;
      case 'smallHeart': this.heal(p.amount ?? PLAYER.smallHeart.heal); break;
      case 'heartBell': {
        if (st) {
          const id = p.id ?? `bell${st.heartBells.length + 1}`;
          if (!st.heartBells.includes(id)) st.heartBells.push(id);
        }
        const before = this.maxHp;
        this._recomputeMax();
        if (this.maxHp > before) this.heal(this.maxHp - before);
        break;
      }
      default: break;
    }
    this._syncState();
  }

  /**
   * Shop upgrades the player owns the effect of (§13.3): Bigger Satchel (milk capacity 2 → 3 → 4; a freshly bought
   * slot comes filled) and Valor Gain (+25 % on every Valor gain). Sharpness, Holy Wave Reach (combat) and Quick
   * Charge (read live by tier1Time / tier2Time) need nothing here. Cheap: called every step, acts only on a change of
   * `state.upgrades` (ui's shops write it; a loaded save replaces it). ui may also call it right after a purchase.
   */
  applyUpgrades() {
    const u = this.ctx.state?.upgrades;
    const vg = !!u?.valorGain, satchel = Math.max(0, Math.floor(+u?.satchel || 0));
    if (vg !== this._upgValorGain) {
      this._upgValorGain = vg;
      this.valorState.gainMul = vg ? (ECONOMY.shops.valorGain?.mul ?? 1) : 1;
    }
    if (satchel !== this._upgSatchel) {
      const first = this._upgSatchel < 0, before = this.milkMax;
      this._upgSatchel = satchel;
      this._recomputeMax();
      if (!first && this.milkMax > before) this.milk = Math.min(this.milkMax, this.milk + (this.milkMax - before));
      this._syncState();
    }
  }

  /** maxHp from Heart Bells (start 8 + 2 per bell, ≤ 14); milkMax from the satchel + Mochi (§7.6). */
  _recomputeMax() {
    const st = this.ctx.state;
    const bells = st?.heartBells?.length ?? 0;
    this.maxHp = Math.min(PLAYER.hpMax, PLAYER.hpStart + TUNING.heartBellHp * bells);
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    const satchel = st?.upgrades?.satchel ?? 0;
    const base = satchel > 0 ? (ECONOMY.shops.satchel.max[Math.min(satchel, ECONOMY.shops.satchel.max.length) - 1] ?? PLAYER.milk.start) : PLAYER.milk.start;
    const comp = this.ctx.companions;
    let bonus;
    if (typeof comp?.milkBonus === 'number') bonus = comp.milkBonus;                // CompanionManager: Mochi's passive
    else {
      const active = comp?.active?.map?.((c) => c.kittenId ?? c) ?? st?.companions?.active ?? [];
      bonus = active.includes('mochi') ? (COMPANIONS.mochi?.milkBonus ?? 0) : 0;
    }
    this.milkMax = base + bonus;
    if (this.milk > this.milkMax) this.milk = this.milkMax;
  }

  _onLevelLoading() {
    this.orders.clear('level');
    if (this._koWiped) { this._koWiped = false; this._wipe(false); }
    this.idleLadder.reset();
    if (this.golden) this.endGolden(false);
    this.memeCamTrigger.reset();
    if (this.swing) this.endSwing();
    if (this.state === 'guard') this.stopGuard();
    this.cancelCharge();
    this.jeerers.clear();
  }

  _onLevelLoaded() {
    const st = this.ctx.state;
    this._valorChanged(this.valorState.reset(), 'level');
    this.livesState.setDifficulty(st?.difficultyCfg);
    this.livesState.levelStart(st?.lives);
    this._recomputeMax();
    if (!this.alive || this.state === 'dead') { this.alive = true; this.hurtable = true; }
    this.hp = this.maxHp;
    this.invulnT = 0; this.immuneT = 0; this.critT = 0; this.riposteT = 0; this.autoStandT = 0; this.autoRiposteT = 0;
    this.moveLockT = 0; this.splashCdT = 0; this._softBreak = false;
    this.guardState.reset();
    this.respawnPoint.pos.copy(this.pos); this.respawnPoint.facing = this.facing;
    this.safeGround.clear();
    if (!this.scripted) this.setState('move');
    this._syncState();
  }

  _onCheckpoint(p) {
    const ctx = this.ctx;
    const at = p?.position ?? p?.pos;
    if (at) this.respawnPoint.pos.set(at.x ?? at[0] ?? this.pos.x, at.y ?? (Array.isArray(at) ? at[1] : this.pos.y), at.z ?? at[2] ?? this.pos.z);
    else this.respawnPoint.pos.copy(this.pos);
    this.respawnPoint.facing = p?.facing ?? this.facing;
    this.livesState.checkpoint();
    this.guardState.refill();
    this.heal(this.maxHp - this.hp);
    this.milk = this.milkMax;
    if (this.alive && this.state === 'move' && this.onGround) this.setState('vigil');
    this._syncState();
    ctx.bus.emit(E.PLAYER_GRIT, { value: this.grit, max: this.gritMax, broken: false });
  }

  _onMode(p) {
    const m = p?.mode;
    if (m === 'cutscene' || m === 'dialog') {
      this.orders.clear('mode');
      this.ctx.input?.clearClicks?.();
      if (this.scripted) return;
      if (this.state === 'guard') this.stopGuard();
      if (this.state === 'charge') this.cancelCharge();
      if (this.state === 'sip' && !this.sipHealed) this.cancelSip();
      if (this.swing) this.endSwing();
      this.vel.x = this.vel.z = 0;
      if (this.alive && this.state !== 'dead') this.setState('move');
    }
  }

  _rumble(r) { if (r && this.ctx.input?.rumble) this.ctx.input.rumble(r[0], r[1], r[2]); }

  // ------------------------------------------------------------------ visuals
  render(alpha, frameDt) {
    super.render(alpha);
    this.model.render(alpha, frameDt);
  }
}

