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
import { PLAYER, ATTACKS, ECONOMY, COMPANIONS, JUICE, ENEMIES } from '../core/config.js';
import { wrapAngle, dampAngle } from '../core/math.js';
import { hostileTo } from '../core/ActorRegistry.js';
import { GuardState, parryWindowFor } from './Guard.js';
import { Valor } from './Valor.js';
import { Lives } from './Lives.js';
import { SafeGround } from './SafeGround.js';
import { MemeCamTrigger } from './MemeCamTrigger.js';
import { STATES } from './PlayerStates.js';
import { TUNING, threatens } from './tuning.js';
import { SwordcatModel } from './SwordcatModel.js';

const _v = new THREE.Vector3(), _dir = new THREE.Vector3();
const _hostile = hostileTo('player');
const COMBO_INDEX = { slash1: 1, slash2: 2, slash3: 3 };
const JEER_R = ENEMIES.hyena?.jeer?.r ?? 8;

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
    /** respawn point (level spawn or the last Vigil Stone) */
    this.respawnPoint = { pos: new THREE.Vector3(), facing: 0 };
    /** jeering enemies (enemy:jeer on/off) */
    this.jeerers = new Set();
    this.inJeer = false; this.threatened = false; this.threatT = 0;
    /** last applied shop upgrades (§13.3: satchel, Valor Gain); applyUpgrades() re-reads state.upgrades on change */
    this._upgSatchel = -1; this._upgValorGain = null;
    this.inShallow = false;
    /** visual-only fields the model consumes: squash cue, hurt blink timer (i-frames after a hurt / respawn) */
    this.squashEvent = null;
    this.blinkT = 0; this.stepAccum = 0; this.hurtDur = PLAYER.hurt.stun;
    this._valorAcc = 0; this._valorAccReason = '';
    this._stillStandingPending = false;
    this._offs = [];
    this.model = new SwordcatModel(this);
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
    this.pos.copy(pos); this.vel.set(0, 0, 0); this.facing = facing;
    this.onGround = false; this.gravityMul = 1;
    if (this.goldenActivating) this.finishGoldenActivation();
    if (this.swing) this.endSwing();
    if (this.state !== 'dead' && this.state !== 'scripted' && this.state !== 'memecam') this.setState('move');
    this.safeGround.clear();
    this.zoomies = false; this.zoomT = 0;
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
    g.parryWindow = parryWindowFor(ctx.state?.difficultyCfg, ctx.input?.device === 'touch');
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
    this.setState('dead');
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

    if (this.scripted || this.attachedTo) {
      if (this.state !== 'scripted') this.setState('scripted');
      this.scriptedStep(dt);
      if (!this.attachedTo) ctx.physics.moveActor(this, dt);
      STATES.scripted.update(this, dt);
      return;
    }
    if (this.state === 'scripted') this.setState('move');

    this._readInput(dt);
    if (this.alive && (ctx.game.mode === 'play' || ctx.game.mode === 'memecam')) this.memeCamTrigger.update(dt);
    if (this.memeCamTrigger.active && this.state !== 'memecam' && this.alive) this.setState('memecam');

    STATES[this.state].update(this, dt);

    // gravity: snappier falls; pounce sets its own
    if (this.state !== 'pounce') this.gravityMul = this.vel.y < 0 ? PLAYER.fallGravityMul : 1;
    if (this.jumping && !this.jumpCutDone && !this.onGround && this.vel.y > 0 && !ctx.input.down('jump')) {
      this.vel.y *= PLAYER.jumpCut; this.jumpCutDone = true;
    }
    const wasGround = this.onGround;
    this.landImpact = 0; this.bounced = 0;
    ctx.physics.moveActor(this, dt);
    if (this.stepY > 0) this.stepAccum += this.stepY;                   // visual step-up smoothing (model)
    if (this.bounced > 0) this._bounced();
    else if (!wasGround && this.onGround) this._landed();
    this._postStep(dt);
    this._syncState();
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
    this.valorState.update(dt);
    this.applyUpgrades();
    if (this.guardState.update(dt)) this.ctx.bus.emit(E.PLAYER_GRIT, { value: this.guardState.grit, max: this.guardState.gritMax, broken: false });
  }

  _readInput(dt) {
    const input = this.ctx.input, now = this.ctx.game.time, A = PLAYER.assist;
    const pa = input.pressed('attack'), pg = input.pressed('guard');
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
    this.jumping = false; this.jumpCutDone = false; this.pounceReady = true;
    this.ctx.bus.emit(E.PLAYER_LAND, { impact });
    if (impact > PLAYER.hardLandSpeed && this.state === 'move') this.setState('land');
  }

  /** Physics sprang her off a bounce surface (mushroom caps, §7.1): a jump that can't be cut short. */
  _bounced() {
    this.jumping = false; this.jumpCutDone = true; this.pounceReady = true; this.coyoteT = 0;
    this.squashEvent = 'bounce';
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
      const r = e.def?.jeer?.r ?? JEER_R;
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
    const input = this.ctx.input;
    const yaw = this.ctx.cam?.yaw ?? Math.PI;
    // forward = (-sin yaw, 0, -cos yaw), screen-right = (cos yaw, 0, -sin yaw)  (tech.md §8; move.y+ = forward)
    if (this.moveLockT > 0) { out.set(0, 0, 0); return 0; }      // after a splash (§7.1)
    const mx = input.move.x, my = input.move.y;
    out.set(-Math.sin(yaw) * my + Math.cos(yaw) * mx, 0, -Math.cos(yaw) * my - Math.sin(yaw) * mx);
    const l = out.length();
    if (l > 1) out.divideScalar(l);
    return Math.min(1, l);
  }

  /** Speed multiplier: Golden Hour ×1.1, shallow water ×0.6. */
  get speedMul() { return (this.golden ? PLAYER.golden.speedMul : 1) * (this.inShallow ? PLAYER.water.shallowMul : 1); }

  /** The camera's lock-on target (camera owns lock-on), if alive. */
  lockTarget() { const t = this.ctx.cam?.lockTarget; return t && t.alive !== false && t.pos ? t : null; }

  wantGuard() {
    const st = this.ctx.state;
    if (this.autoStandT > 0) return true;
    return st?.settings?.holdStand === false ? this.guardToggle : this.ctx.input.down('guard');
  }

  chargeHeld() {
    if (this.ctx.state?.settings?.holdCharge === false && this.state === 'charge') return !this.chargeToggleRelease;
    return this.ctx.input.down('attack');
  }
  attackHeldTime() { return this.ctx.input.heldTime('attack'); }

  canDodge() { return this.alive && this.onGround && this.dodgeCd <= 0; }
  startDodge() {
    const mag = this.wishDir(_dir);
    if (mag < 0.1) _dir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    this.dodgeDir.copy(_dir.normalize());
    this.facing = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
    this.dodgeBuf = 0; this.zoomies = false; this.zoomT = 0;
    this.setState('dodge');
    this.ctx.bus.emit(E.PLAYER_DODGE, { dir: this.dodgeDir.clone() });
  }

  doJump() {
    this.vel.y = PLAYER.jumpV; this.onGround = false; this.coyoteT = 0; this.jumpBuf = 0;
    this.jumping = true; this.jumpCutDone = false;
    this.squashEvent = 'jump';
    this.ctx.bus.emit(E.PLAYER_JUMP, {});
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
    // facing: riposte → the parried enemy; lock-on target; else a fresh stick direction redirects the swing
    const lock = this.lockTarget();
    if (id === 'riposte' && this.riposteTarget) this._faceActor(this.riposteTarget);
    else if (lock && Math.hypot(lock.pos.x - this.pos.x, lock.pos.z - this.pos.z) < PLAYER.lockOn.range) this._faceActor(lock);
    else if (this.wishDir(_dir) > 0.3) this.facing = Math.atan2(_dir.x, _dir.z);
    this._riposteFace = id === 'riposte' ? this.riposteTarget : null;
    if (id === 'riposte') { this.riposteT = 0; this.riposteTarget = null; }
    this.swing = ctx.combat.beginSwing(this, def, this._riposteFace ? { target: this._riposteFace } : undefined);
    this.applySwingOpts(this.swing);
    this.swingSerial++;
    this.swingGuardLatch = this.wantGuard();        // a Stand held into the swing can't cancel it (PlayerStates.attack)
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

  /** §7.2 Assists: turn toward the nearest enemy within 60° / 3 m (touch 90° / 4 m); the lock-on target wins. */
  aimAssist() {
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

  _faceActor(a) { this.facing = Math.atan2(a.pos.x - this.pos.x, a.pos.z - this.pos.z); }

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
    this._syncState();
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
    this.invulnT = 0; this.immuneT = 0; this.critT = 0; this.riposteT = 0; this.autoStandT = 0;
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

