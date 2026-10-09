// src/story/Cutscene.js  (owner: story) — the §5.1 step runner. One `Cutscene` instance plays one data file
// (`src/story/cutscenes/<id>.js`, format Appendix B.2: `{ id, skippable, anchor, steps: [...], end: {...} }`).
//
// Model: a tick-driven interpreter (no free-running async chains, so skipping is exact and nothing dangles).
// Every step becomes a Task that the parent sequence advances in `update(dt)` (SIM seconds: `time` steps slow the
// whole scene like the camera timelines). A step lasts `dur` (default 0) AND until whatever it waits on settles
// (camera shot, moveTo, a `once` clip, a dialogue line, a prompt, a level load); `nowait: true` fires and moves on.
// Every awaited thing has a safety timeout (a cutscene can never soft-lock). `skip()` cancels the running tasks
// and applies the `end` block (§5.1: flags, spawns/despawns, env end state, actor final positions, camera handback).
//
// Step types (§5.1 + additive `par seq if call`):
//   cam    { preset | pos+look, anchor, target, fov, mode, path, dur, ease, noise, roll, ... } → ctx.cam.shot(step)
//   actor  { id, at, pose, moveTo, speed, face, faceDur, clip, once, emote, visible, prop, attach, outfit, holy,
//            expression, scripted }                                 → the ScriptedActor API (§19.4)
//   say    { who, key, auto, name, portrait, sfx, talk }           → dialog:start/line/end (ui + babble)
//   sfx    { id, at, vol, rate, delay, loop, handle, stop }         → ctx.audio.play3D / play2D
//   music  { track, fade }                                          → ctx.audio.music
//   env    { preset, fogDensity, fogColor, wind, sun, grade, dur, dawnstone, visible } → ctx.env / ctx.levels
//   fx     { burst, at, count, color, scale | holy, id | shake | bloomSpike | horde, ... | fovPunch }
//   ui     { letterbox, hud, title, caption, chapter, fade, toast } → host.cinema (ui or the story overlay)
//   time   { scale, dur }                                           → ctx.game.slowMo / setTimeScale (never blocks)
//   spawn  { id, type | asset | prop, at, facing, count, layout, keep, opts } / despawn { id | ids }
//   flag   { key, value }   wait { dur | input | dialog }   prompt { action, hold, textKey }
//   objective { id, textKey, max, value, complete, add }   arena { id, lock, clear }   load { level, spawn }
//   par { steps } · seq { steps } · if { cond, then, else } · call { fn(ctx, cutscene, step) → value | Promise }
// Scene options: { id, kind: 'cutscene' | 'dialog' | 'ambient', skippable, prologue (skippable on the first viewing),
//   letterbox (default true for full scenes), hud, player (false = don't script her), inputSkip (s: any input after it
//   skips, G-01), steps, end }. `cs.every(fn(dt, cs))` registers a per-step ticker for the scene's lifetime.
import * as THREE from 'three';
import { Animator } from '../core/Animator.js';
import { E } from '../core/events.js';
import { clamp01, lerp, easeInOutSine } from '../core/math.js';
import { text as stext, speakerName } from './strings.js';

/** Every step type the runner knows (U13: cutscene data may use only these). */
export const STEP_TYPES = Object.freeze(['cam', 'actor', 'say', 'sfx', 'music', 'env', 'fx', 'ui', 'time', 'spawn', 'despawn', 'flag',
  'wait', 'prompt', 'objective', 'arena', 'load', 'par', 'seq', 'if', 'call']);

/** Every key an `end` block may carry. */
export const END_KEYS = Object.freeze(['flags', 'env', 'actors', 'spawns', 'despawns', 'load', 'objective', 'arena', 'music', 'ui', 'cam',
  'player', 'toast', 'toasts', 'save', 'play', 'tutorial', 'shards', 'unlock', 'companions', 'chapter', 'keep', 'call', 'scripted']);

/** Cutscene kinds: full scenes (letterbox, mode 'cutscene'), dialogue-only (mode 'dialog'), ambient (no mode change). */
export const KINDS = Object.freeze(['cutscene', 'dialog', 'ambient']);

/** Reveal speed of dialogue text (§14.2: 30 chars/s, × settings.dialogSpeed). */
export const CHARS_PER_SEC = 30;
/** Minimum time on a line before input may complete / advance it (no accidental double skips). */
export const LINE_MIN = 0.15;
/** Extra hold after an auto line is fully revealed. */
export const AUTO_TAIL = 0.35;
/** Safety timeouts (sim seconds). */
export const TIMEOUT = Object.freeze({ default: 30, cam: 3, load: 90, asset: 8, prop: 5 });
/** Actions that advance dialogue / `wait: 'input'`. */
export const ADVANCE_ACTIONS = Object.freeze(['confirm', 'interact', 'attack', 'jump']);
/** Prompt step action → input action. */
export const PROMPT_INPUT = Object.freeze({ guard: 'guard', attack: 'attack', chargeRelease: 'attack', interact: 'interact', meow: 'meow', jump: 'jump' });

const _v = new THREE.Vector3();

/** Seconds a line of `n` characters takes to reveal at `speed` (settings.dialogSpeed). Pure. */
export function revealTime(n, speed = 1) { return Math.max(0, n) / (CHARS_PER_SEC * Math.max(0.1, speed || 1)); }

/** Is this step instant (no waiting, no duration)? Used for dialogue look-ahead. Pure. */
export function isInstant(step) {
  if (!step || step.nowait) return true;
  if ((step.dur ?? 0) > 0) return false;
  switch (step.t) {
    case 'flag': case 'sfx': case 'music': case 'env': case 'fx': case 'ui': case 'time': case 'despawn': case 'objective': case 'arena': return true;
    case 'actor': return step.moveTo == null && !(step.clip && step.once) && !((step.faceDur ?? 0) > 0);
    case 'cam': return !step.dur && !step.wait;
    default: return false;
  }
}

/** Walk every step (recursing into par / seq / if) and call fn(step, path). Pure. */
export function walkSteps(steps, fn, path = 'steps') {
  (steps ?? []).forEach((s, i) => {
    const p = `${path}[${i}]`;
    fn(s, p);
    if (s && (s.t === 'par' || s.t === 'seq')) walkSteps(s.steps, fn, p + '.steps');
    if (s && s.t === 'if') { walkSteps(s.then, fn, p + '.then'); walkSteps(s.else, fn, p + '.else'); }
  });
}

/** Keyframe sample: `v` is a number or an array of evenly spaced keys over u ∈ [0, 1]. Pure. */
export function sampleKeys(v, u) {
  if (!Array.isArray(v)) return v;
  if (v.length === 1) return v[0];
  const x = clamp01(u) * (v.length - 1), i = Math.min(v.length - 2, Math.floor(x));
  return lerp(v[i], v[i + 1], easeInOutSine(x - i));
}

// ==================================================================================================== tasks
class Task {
  /** @param {Cutscene} cs @param {any} step */
  constructor(cs, step) {
    this.cs = cs; this.step = step;
    this.t = 0; this.min = Math.max(0, +step?.dur || 0); this.max = TIMEOUT.default;
    this.pending = 0; this.hold = false; this.done = false; this.cancelled = false;
    /** @type {null | ((dt:number, task:Task) => void)} */
    this.tick = null;
    /** @type {null | (() => void)} */
    this.onCancel = null;
    this.onDone = null;
  }

  /** Wait for a promise (settles in a microtask; the step finishes on the next tick). */
  wait(p, max = null) {
    if (!p || typeof p.then !== 'function') return this;
    this.pending++;
    if (max != null) this.max = Math.max(this.max === TIMEOUT.default ? 0 : this.max, max);
    const settle = () => { this.pending = Math.max(0, this.pending - 1); };
    p.then(settle, (e) => { console.warn(`[story] ${this.cs.id}: ${this.step?.t} step failed`, e); settle(); });
    return this;
  }

  update(dt) {
    if (this.done) return true;
    this.t += dt;
    if (this.tick) this.tick(dt, this);
    if (this.done) return true;
    if (this.t >= this.max) {
      if (this.pending > 0 || this.hold) console.warn(`[story] ${this.cs.id}: ${this.step?.t} step timed out after ${this.max.toFixed(1)} s`);
      this.finish();
    } else if (this.pending <= 0 && !this.hold && this.t >= this.min) this.finish();
    return this.done;
  }

  finish() { if (this.done) return; this.done = true; this.onDone?.(); }
  cancel() { if (this.done) return; this.cancelled = true; this.done = true; this.onCancel?.(); }
}

class SeqTask {
  constructor(cs, steps, parent = null) {
    this.cs = cs; this.steps = steps ?? []; this.parent = parent;
    this.i = 0; this.cur = null; this.done = false; this.cancelled = false;
  }
  /** Is the next step that actually takes time a `say`? (keeps the dialogue box open across instant beats) */
  nextIsSay() {
    for (let k = this.i; k < this.steps.length; k++) {
      const s = this.steps[k];
      if (s?.t === 'say') return true;
      if (!isInstant(s)) return false;
    }
    return this.parent?.nextIsSay?.() ?? false;
  }
  update(dt) {
    let guard = 0;
    while (!this.done && guard++ < 256) {
      if (!this.cur) {
        if (this.i >= this.steps.length) { this.done = true; break; }
        this.cur = this.cs.startStep(this.steps[this.i++], this);
        if (!this.cur.update(0)) break;
        this.cur = null;
        continue;
      }
      if (!this.cur.update(dt)) break;
      this.cur = null; dt = 0;
    }
    return this.done;
  }
  cancel() { this.cancelled = true; this.done = true; this.cur?.cancel?.(); }
}

class ParTask {
  constructor(cs, steps, parent) {
    this.cs = cs; this.done = false; this.cancelled = false;
    this.kids = (steps ?? []).map((s) => cs.startStep(s, parent));
  }
  update(dt) {
    if (this.done) return true;
    let all = true;
    for (const k of this.kids) if (!k.done && !k.update(dt)) all = false;
    this.done = all;
    return all;
  }
  cancel() { this.cancelled = true; this.done = true; for (const k of this.kids) k.cancel?.(); }
}

const DONE = Object.freeze({ done: true, update: () => true, cancel() {} });

// ==================================================================================================== Cutscene
export class Cutscene {
  /**
   * @param {any} ctx
   * @param {any} def  cutscene data ({ id, kind, skippable, prologue, letterbox, steps, end })
   * @param {any} host StoryManager (flags, dialogue state, cinema/ui, actor lookup)
   */
  constructor(ctx, def, host) {
    this.ctx = ctx; this.def = def; this.host = host;
    this.id = def.id;
    this.kind = KINDS.includes(def.kind) ? def.kind : 'cutscene';
    this.t = 0; this.realT = 0;
    this.started = false; this.finished = false; this.finishing = false; this.skipped = false;
    /** @type {SeqTask|null} */
    this.root = null;
    /** spawned cast: { id, kind: 'enemy'|'npc'|'asset'|'prop', obj, keep } */
    this.spawned = [];
    /** cutscene-local aliases id → actor (spawned actors, `spawn.id` differing from the registry id) */
    this.aliases = new Map();
    /** actors this scene switched to scripted (released at the end) */
    this.scriptedActors = new Set();
    /** audio handles to stop at the end ({ name → handle }) */
    this.sounds = new Map();
    /** holy levels this scene set (reset to 0 at the end unless `end.keep.holy`) */
    this.holyActors = new Set();
    this.timeScaled = false;
    /** current dialogue line (also host.line) */
    this.line = null;
    this.dialogOpen = false;
    this.promptActive = null;
    this._warned = new Set();
    /** per-step callbacks registered by `call` steps (title holy pulse, trembling paws…) */
    this.tickers = [];
    this.resolve = null;
  }

  get isPlaying() { return this.started && !this.finished; }

  /** May the player hold-skip this scene right now? (§5.1: after the first viewing; prologue scenes always) */
  get canSkip() {
    if (!this.started || this.finished || this.finishing) return false;
    if (this.def.skippable === false || this.kind === 'ambient') return false;
    if (this.promptActive) return false;                       // interactive prompts can't be skipped (§5.1)
    return !!(this.def.prologue || this.host?.seen?.(this.id));
  }

  // ------------------------------------------------------------------ lifecycle
  start() {
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx;
    this.prevMode = ctx.game?.mode ?? 'play';
    if (this.kind === 'cutscene') ctx.game?.setMode?.('cutscene');
    else if (this.kind === 'dialog') ctx.game?.setMode?.('dialog');
    // the heroine is a cutscene actor in every non-ambient scene (input off; scripted actors keep simulating)
    if (this.kind !== 'ambient' && this.def.player !== false) {
      const p = ctx.player;
      if (p?.setScripted && !p.scripted) { p.setScripted(true); this.scriptedActors.add(p); }
    }
    if (this.kind === 'cutscene') {
      ctx.cam?.mode?.('cutscene');
      if (this.def.letterbox !== false) this.host?.cinema?.letterbox(true);
      this.host?.cinema?.hud(false);
    } else if (this.kind === 'dialog' && this.def.hud === false) this.host?.cinema?.hud(false);
    ctx.bus.emit(E.CUTSCENE_START, { id: this.id, kind: this.kind });
    this.root = new SeqTask(this, this.def.steps ?? []);
  }

  /** Advance (sim seconds). Returns true while the scene still runs. */
  update(dt) {
    if (!this.started || this.finished) return false;
    if (this.finishing) return true;
    const ts = this.ctx.game?.loop?.timeScale ?? 1;
    this.t += dt; this.realT += dt / Math.max(0.01, ts);
    this._dt = dt; this._realDt = dt / Math.max(0.01, ts);
    for (let i = this.tickers.length - 1; i >= 0; i--) {
      let keep = true;
      try { keep = this.tickers[i](dt, this) !== false; } catch (e) { console.warn(`[story] ${this.id}: ticker failed`, e); keep = false; }
      if (!keep) this.tickers.splice(i, 1);
    }
    if (this.def.inputSkip != null) {
      // drain presses every step so input from before the scene / its first second never counts (G-01)
      const fresh = !!this.host?.anyPressed?.();
      if (fresh && this.t >= this.def.inputSkip) { this.skip(); return true; }
    }
    if (this.root && !this.root.done) this.root.update(dt);
    if (this.root?.done && !this.finishing) this.finish(false);
    return !this.finished;
  }

  /** Register `fn(dt, cutscene)` to run every fixed step while the scene plays (return false to stop). */
  every(fn) { if (typeof fn === 'function') this.tickers.push(fn); return this; }

  /** Per rendered frame: animated asset spawns (the CS-01 chest lid…). */
  render(frameDt) {
    const dt = (this.ctx.game?.hitstopT ?? 0) > 0 ? 0 : frameDt * (this.ctx.game?.loop?.timeScale ?? 1);
    for (const r of this.spawned) r.anim?.update(dt);
    const p = this.ctx.player, k = p?.model?.k;
    if (p?.__storyExpr && k && k.__storyExpr !== p.__storyExpr) holdKittenExpression(k, p.__storyExpr);
  }

  /** Skip: cancel every running step and apply the end block. */
  skip() {
    if (!this.started || this.finished || this.finishing) return;
    this.skipped = true;
    this.finish(true);
  }

  /** Apply the end block (also on a normal finish), hand everything back, emit cutscene:end. */
  finish(skipped) {
    if (this.finished || this.finishing) return this._finishP;
    this.finishing = true;
    this.root?.cancel();
    this._finishP = this._applyEnd(!!skipped).catch((e) => console.error(`[story] ${this.id}: end block failed`, e)).finally(() => {
      this.finished = true;
      this.resolve?.({ id: this.id, skipped: !!skipped });
    });
    return this._finishP;
  }

  // ------------------------------------------------------------------ helpers used by steps / data
  warnOnce(msg) { if (this._warned.has(msg)) return; this._warned.add(msg); console.warn(`[story] ${this.id}: ${msg}`); }

  /** Cutscene actor by id: aliases (this scene's spawns) → registry → the player / Pudding fallbacks. */
  actor(id) {
    if (id == null) return null;
    if (typeof id === 'object') return id.object3d ? id : null;
    if (this.aliases.has(id)) return this.aliases.get(id);
    const ctx = this.ctx;
    const a = ctx.actors?.get?.(id);
    if (a) return a;
    if (id === 'swordcat' || id === 'player') return ctx.player ?? null;
    if (id === 'pudding') return ctx.companions?.pudding ?? null;
    return ctx.companions?.get?.(id) ?? null;
  }

  /** Make an actor scripted for this scene (released at the end). */
  script(a) {
    if (!a || a.scripted || typeof a.setScripted !== 'function') return a;
    a.setScripted(true);
    this.scriptedActors.add(a);
    return a;
  }

  /** World point (Vector3, into `out`) for `[x, z]`, `[x, y, z]`, an anchor name, an actor id/actor, or {x, z}. */
  point(target, out = new THREE.Vector3()) {
    if (target == null) return null;
    const ctx = this.ctx;
    if (typeof target === 'string') {
      const a = this.actor(target);
      if (a) return out.copy(a.pos);
      const rec = this.spawned.find((r) => r.id === target && r.obj?.isObject3D);
      if (rec) return rec.obj.getWorldPosition(out);
      const an = ctx.levels?.anchor?.(target);
      if (an?.pos) return out.copy(an.pos);
      this.warnOnce(`unknown point "${target}"`);
      return null;
    }
    if (Array.isArray(target)) {
      if (target.length >= 3) return out.set(target[0], target[1], target[2]);
      const y = ctx.physics?.heightAt?.(target[0], target[1]) ?? 0;
      return out.set(target[0], Number.isFinite(y) ? y : 0, target[1]);
    }
    if (target.anchor != null) {                          // { anchor: 'camp', or: [x, z] }: a level anchor with a fallback
      const an = ctx.levels?.anchor?.(target.anchor);
      if (an?.pos) return out.copy(an.pos);
      return target.or != null ? this.point(target.or, out) : null;
    }
    if (target.object3d && target.pos) return out.copy(target.pos);
    if (typeof target.x === 'number' && typeof target.z === 'number') return out.set(target.x, target.y ?? 0, target.z);
    return null;
  }

  /** Facing (yaw) for a `face`/`facing` value: number, actor id / anchor (toward it from `from`), [x, z]. */
  yawFor(v, from = null) {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && !from) { const an = this.ctx.levels?.anchor?.(v); if (an) return an.facing ?? 0; }
    const p = this.point(v, _v);
    if (!p || !from) return null;
    return Math.atan2(p.x - from.x, p.z - from.z);
  }

  /** Text for a key or literal. */
  text(k, vars) { return stext(k, vars); }

  // ------------------------------------------------------------------ step dispatch
  /** Create the task for one step. */
  startStep(step, parent) {
    if (!step || typeof step !== 'object') return DONE;
    if (this.finishing) return DONE;
    try {
      switch (step.t) {
        case 'par': return new ParTask(this, step.steps, parent);
        case 'seq': return new SeqTask(this, step.steps, parent);
        case 'if': {
          const ok = typeof step.cond === 'function' ? !!step.cond(this.ctx, this) : !!this.ctx.state?.cond?.(step.cond);
          const list = ok ? step.then : step.else;
          return list?.length ? new SeqTask(this, list, parent) : DONE;
        }
        case 'cam': return this._cam(step);
        case 'actor': return this._actor(step);
        case 'say': return this._say(step, parent);
        case 'sfx': return this._sfx(step);
        case 'music': return this._music(step);
        case 'env': return this._env(step);
        case 'fx': return this._fx(step);
        case 'ui': return this._ui(step);
        case 'time': return this._time(step);
        case 'spawn': return this._spawn(step);
        case 'despawn': return this._despawn(step);
        case 'flag': this.host?.flag?.(step.key, step.value === undefined ? true : step.value); return this._timed(step);
        case 'wait': return this._wait(step);
        case 'prompt': return this._prompt(step);
        case 'objective': this._objective(step); return this._timed(step);
        case 'arena': this._arena(step); return this._timed(step);
        case 'load': return this._load(step);
        case 'call': return this._call(step);
        default:
          this.warnOnce(`unknown step type "${step.t}"`);
          return DONE;
      }
    } catch (e) {
      console.error(`[story] ${this.id}: ${step.t} step threw`, e);
      return DONE;
    }
  }

  /** A plain task that only lasts `dur` (or nothing). */
  _timed(step) { const task = new Task(this, step); if (step.nowait) task.min = 0; return task; }

  // ---- cam
  _cam(step) {
    const task = new Task(this, step);
    const cam = this.ctx.cam;
    if (!cam?.shot) { this.warnOnce('ctx.cam.shot missing'); return task; }
    const { t, wait, nowait, ...shot } = step;
    void t; void wait;
    if (shot.anchor && typeof shot.anchor === 'string' && this.aliases.has(shot.anchor)) shot.anchor = this.aliases.get(shot.anchor);
    if (shot.target && typeof shot.target === 'string' && this.aliases.has(shot.target)) shot.target = this.aliases.get(shot.target);
    if (shot.look && typeof shot.look === 'string' && this.aliases.has(shot.look)) shot.look = this.aliases.get(shot.look);
    const p = cam.shot(shot);
    if (nowait) { task.min = 0; return task; }
    task.wait(p);
    task.max = (step.dur ?? 0) + TIMEOUT.cam;
    return task;
  }

  // ---- actor
  _actor(step) {
    const task = new Task(this, step);
    const a = this.actor(step.id);
    if (!a) { this.warnOnce(`actor "${step.id}" not found`); return task; }
    const ctx = this.ctx;
    if (step.scripted === false) { a.setScripted?.(false); this.scriptedActors.delete(a); }
    else this.script(a);
    if (step.visible != null && a.object3d) a.object3d.visible = !!step.visible;
    if (step.outfit && typeof a.setOutfit === 'function') a.setOutfit(step.outfit);
    if (step.at != null) this.place(a, step.at, step.facing ?? null);
    else if (step.facing != null && typeof step.facing === 'number') { a.facing = step.facing; a.snap?.(); }
    if (step.pose !== undefined) a.pose?.(step.pose ?? 'idle', { hold: step.hold !== false });
    if (step.prop != null) this.applyProps(a, step.prop);
    if (step.emote) for (const e of [].concat(step.emote)) a.emote?.(e);
    if (step.expression !== undefined) setExpression(a, step.expression);
    if (step.attach !== undefined) {
      const at = step.attach;
      if (at === null || at === false) a.attach?.(null);
      else if (typeof at === 'string') a.attach?.(this.actor(at));
      else a.attach?.(this.actor(at.to), at.bone);
    }
    const nw = !!step.nowait;
    if (step.face != null) {
      const yaw = this.yawFor(step.face, a.pos);
      if (yaw != null) {
        const p = a.face?.(yaw, step.faceDur ?? 0.3);
        if (!nw && (step.faceDur ?? 0) > 0) task.wait(p);
      }
    }
    if (step.moveTo != null) {
      const target = this.point(step.moveTo, new THREE.Vector3());
      if (target) {
        const p = a.moveTo?.(target, step.speed ?? 2);
        if (!nw) task.wait(p);
      }
    }
    if (step.clip) {
      const p = a.play?.(step.clip, { once: !!step.once, speed: step.clipSpeed ?? step.rate ?? 1, clampEnd: !!step.clampEnd });
      if (step.once && !nw) task.wait(p);
    }
    if (step.holy != null) this._holyTween(task, a, step.holy, step.dur ?? 0);
    if (nw) task.min = 0;
    return task;
  }

  /** Teleport an actor (keeps her on the ground unless a y is given). */
  place(a, at, facing = null) {
    const p = this.point(at, new THREE.Vector3());
    if (!p) return;
    const yaw = facing != null ? (typeof facing === 'number' ? facing : this.yawFor(facing, p)) : a.facing;
    if (a === this.ctx.player && typeof a.teleport === 'function') { a.teleport({ pos: p, facing: yaw ?? a.facing }); return; }
    a.pos.copy(p); a.vel?.set(0, 0, 0);
    if (yaw != null) a.facing = yaw;
    a.snap?.(); a.visual?.snap?.();
  }

  /** prop: 'milk_cup' (on) | ['a', 'b'] (on) | { milk_cup: false } | '-milk_cup' (off). */
  applyProps(a, prop) {
    if (typeof prop === 'string') { if (prop.startsWith('-')) a.prop?.(prop.slice(1), false); else a.prop?.(prop, true); return; }
    if (Array.isArray(prop)) { for (const p of prop) this.applyProps(a, p); return; }
    if (prop && typeof prop === 'object') for (const [k, v] of Object.entries(prop)) a.prop?.(k, !!v);
  }

  _holyTween(task, a, v, dur) {
    const fx = this.ctx.fx;
    if (!fx?.holy) return;
    this.holyActors.add(a);
    if (!Array.isArray(v) || !(dur > 0)) { fx.holy(a, Array.isArray(v) ? v[v.length - 1] : v); return; }
    fx.holy(a, v[0]);
    const prev = task.tick;
    task.tick = (dt, tk) => { prev?.(dt, tk); fx.holy(a, sampleKeys(v, tk.t / dur)); };
    task.min = Math.max(task.min, dur);
    task.onDone = () => fx.holy(a, v[v.length - 1]);
  }

  // ---- say (dialogue lines; the box stays open across consecutive lines)
  _say(step, parent) {
    const task = new Task(this, step);
    task.max = Infinity;
    task.hold = true;
    const ctx = this.ctx, host = this.host;
    // `who` / `name` may be functions (ctx, cs) → value: casts chosen at run time (CS-08's Kitten A / B)
    const dyn = (v) => (typeof v === 'function' ? v(ctx, this) : v);
    const who = dyn(step.who) ?? 'swordcat';
    const nameKey = dyn(step.name);
    const speed = ctx.state?.settings?.dialogSpeed ?? 1;
    const textStr = stext(step.key, step.vars);
    const line = {
      id: this.id, key: step.key, who, text: textStr,
      name: nameKey ? stext(nameKey) : speakerName(who),
      portrait: dyn(step.portrait) ?? who,
      auto: Math.max(0, +step.auto || 0),
      t: 0, revealDur: revealTime(textStr.length, speed), revealed: 0, complete: false,
    };
    this.line = line;
    if (!this.dialogOpen) { this.dialogOpen = true; ctx.bus.emit(E.DIALOG_START, { id: this.id }); }
    ctx.bus.emit(E.DIALOG_LINE, { speaker: who, name: line.name, text: line.text, portrait: line.portrait, key: line.key, auto: line.auto, id: this.id });
    host?.onLine?.(line);
    // talk: the speaker's mouth / a little nod (visual only, no-op where unsupported)
    const speaker = this.actor(who);
    const talk = step.talk !== undefined ? step.talk : (isCat(this.ctx, speaker) ? 'meow' : null);
    if (talk && speaker) speaker.emote?.(talk);
    if (step.expression !== undefined && speaker) setExpression(speaker, step.expression);
    const ambient = this.kind === 'ambient';
    if (step.sfx) { const s = typeof step.sfx === 'string' ? { id: step.sfx } : step.sfx; this._playSound(s); }
    task.tick = (dt) => {
      line.t += dt;
      line.revealed = line.revealDur > 0 ? clamp01(line.t / line.revealDur) : 1;
      if (line.revealed >= 1) line.complete = true;
      const press = ambient ? false : (host?.advancePressed?.() ?? false);
      if (press && line.t >= LINE_MIN) {
        if (!line.complete) { line.complete = true; line.revealed = 1; line.t = Math.max(line.t, line.revealDur); }
        else { task.hold = false; return; }
      }
      if (host?.fastDialog) { task.hold = false; return; }
      if (line.auto > 0 && line.t >= Math.max(line.auto, line.revealDur + AUTO_TAIL)) task.hold = false;
    };
    const close = () => {
      if (this.line === line) this.line = null;
      host?.onLine?.(null);
      const keep = !this.finishing && parent?.nextIsSay?.();
      if (!keep && this.dialogOpen) { this.dialogOpen = false; ctx.bus.emit(E.DIALOG_END, { id: this.id }); }
    };
    task.onDone = close;
    task.onCancel = close;
    return task;
  }

  // ---- audio
  _playSound(s) {
    const a = this.ctx.audio;
    if (!a || !s?.id) return null;
    const opts = { vol: s.vol, rate: s.rate, delay: s.delay, loop: s.loop, dur: s.dur, offset: s.offset, count: s.count, r: s.r, on: s.on, beats: s.beats };
    for (const k of Object.keys(opts)) if (opts[k] === undefined) delete opts[k];
    let at = s.at ?? null;
    if (typeof at === 'string' && this.aliases.has(at)) at = this.aliases.get(at);
    let h = null;
    try { h = at != null ? a.play3D?.(s.id, at, opts) : a.play2D?.(s.id, opts); } catch (e) { console.warn(`[story] ${this.id}: sfx ${s.id} failed`, e); }
    if (h && (s.handle || s.loop)) this.sounds.set(s.handle ?? s.id, h);
    return h;
  }

  _sfx(step) {
    if (step.stop) {
      const h = this.sounds.get(step.stop);
      try { h?.stop?.(step.fade ?? 0.3); } catch { /* already gone */ }
      this.sounds.delete(step.stop);
      if (step.stop === 'march') this._playSound({ id: 'march', at: step.at ?? 'swordcat', on: false });
    } else this._playSound(step);
    return this._timed(step);
  }

  _music(step) {
    try { this.ctx.audio?.music?.(step.track ?? null, step.fade ?? 1); } catch (e) { console.warn(`[story] ${this.id}: music failed`, e); }
    return this._timed(step);
  }

  // ---- env (Env tween; also the level's Dawnstone glow and group visibility)
  _env(step) {
    applyEnv(this.ctx, step);
    return this._timed(step);
  }

  // ---- fx
  _fx(step) {
    const task = this._timed(step);
    const ctx = this.ctx, fx = ctx.fx;
    const at = (v) => (typeof v === 'string' && this.aliases.has(v) ? this.aliases.get(v) : v);
    if (step.burst) fx?.burst?.(step.burst, at(step.at ?? 'swordcat'), { count: step.count, color: step.color, scale: step.scale, type: step.type });
    if (step.holy != null) {
      const a = this.actor(step.id ?? step.at ?? 'swordcat');
      if (a) this._holyTween(task, a, step.holy, step.dur ?? 0);
    }
    if (step.shake != null) { if (ctx.cam?.shake) ctx.cam.shake(step.shake); else ctx.bus.emit(E.SHAKE, { trauma: step.shake }); }
    if (step.bloomSpike) fx?.bloomSpike?.(typeof step.bloomSpike === 'number' ? step.bloomSpike : undefined, step.bloomDur);
    if (step.fovPunch) fx?.fovPunch?.(step.fovPunch, step.fovDur ?? 0.15);
    if (step.horde !== undefined) {
      const { t, horde, at: hat, dur, nowait, ...opts } = step;
      void t; void dur; void nowait;
      for (const k of ['avoid', 'from', 'face']) if (typeof opts[k] === 'string') opts[k] = at(opts[k]);
      fx?.horde?.(horde, at(hat ?? 'horde_a'), opts);
    }
    if (step.rumble) ctx.input?.rumble?.(...step.rumble);
    return task;
  }

  // ---- ui (ui area or the story overlay)
  _ui(step) {
    this.host?.cinema?.apply?.(step, this);
    if (step.toast) this.ctx.bus.emit(E.TOAST, { text: stext(step.toast, step.vars), key: step.toast });
    return this._timed(step);
  }

  // ---- time (real seconds; never blocks the sequence)
  _time(step) {
    const g = this.ctx.game;
    if (step.dur > 0 && step.realtime !== false) g?.slowMo?.(step.scale ?? 1, step.dur);
    else { g?.setTimeScale?.(step.scale ?? 1); this.timeScaled = (step.scale ?? 1) !== 1; }
    return DONE;
  }

  // ---- spawn / despawn
  _spawn(step) {
    const task = this._timed(step);
    const n = Math.max(1, step.count ?? 1);
    for (let i = 0; i < n; i++) {
      const id = n > 1 ? `${step.id}_${i + 1}` : step.id;
      const at = n > 1 ? layoutPoint(step, i, n) : step.at;
      const p = this.spawnOne({ ...step, id, at, index: i });
      if (p && typeof p.then === 'function' && !step.nowait) task.wait(p, step.asset ? TIMEOUT.asset : TIMEOUT.prop);
    }
    if (step.nowait) task.min = 0;
    return task;
  }

  /** Spawn one cast member; returns a promise for async kinds (asset / prop). */
  spawnOne(s) {
    const ctx = this.ctx;
    const kind = s.kind ?? spawnKind(ctx, s);
    const pos = this.point(s.at ?? s.id, new THREE.Vector3()) ?? new THREE.Vector3();
    if (s.y != null && Array.isArray(s.at) && s.at.length < 3) pos.y += s.y;
    const facing = s.facing != null ? (typeof s.facing === 'number' ? s.facing : this.yawFor(s.facing, pos)) : 0;
    const rec = { id: s.id, kind, obj: null, keep: !!s.keep };
    this.spawned.push(rec);
    if (kind === 'enemy') {
      const e = ctx.enemies?.spawn?.(s.type, pos, { id: s.id, facing, scripted: true, ai: false, ...(s.opts ?? {}) });
      if (!e) { this.warnOnce(`enemy spawn ${s.type} failed`); return null; }
      rec.obj = e; this.aliases.set(s.id, e); this.script(e);
      if (s.visible === false && e.object3d) e.object3d.visible = false;
      if (s.pose) e.pose?.(s.pose);
      if (s.prop) this.applyProps(e, s.prop);
      return null;
    }
    if (kind === 'npc') {
      const npcId = s.type && s.type !== 'npc' ? s.type : s.id;
      const a = ctx.companions?.spawnNpc?.(npcId, pos, facing);
      if (!a) { this.warnOnce(`npc spawn ${npcId} failed`); return null; }
      rec.obj = a; rec.npc = npcId;
      this.aliases.set(s.id, a); this.script(a);
      if (a.facing !== facing && s.facing != null) { a.facing = facing; a.snap?.(); }
      if (s.visible === false && a.object3d) a.object3d.visible = false;
      if (s.pose) a.pose?.(s.pose);
      if (s.prop) this.applyProps(a, s.prop);
      if (s.clip) a.play?.(s.clip, {});
      return null;
    }
    if (kind === 'prop') {
      const name = s.prop ?? s.type;
      const p = ctx.levels?.spawnProp?.(name, [pos.x, pos.z], { y: s.y ?? 0, yaw: facing, scale: s.scale, opts: s.opts });
      return Promise.resolve(p).then((obj) => {
        if (!obj) return;
        if (this.finishing && !rec.keep) { ctx.levels?.despawnProp?.(obj); return; }
        rec.obj = obj; obj.name = obj.name || `story:${s.id}`;
        if (s.ry != null) obj.rotation.y = s.ry;
        if (s.rx != null) obj.rotation.x = s.rx;
        if (s.rz != null) obj.rotation.z = s.rz;
        if (s.visible === false) obj.visible = false;
      });
    }
    if (kind === 'asset') {
      const opts = { castShadow: true, receiveShadow: true };
      if (s.fit != null) opts.fit = s.fit;
      if (s.tint != null) opts.tint = s.tint;
      if (s.hide) opts.hide = s.hide;
      if (s.show) opts.show = s.show;
      return Promise.resolve(ctx.assets?.model?.(s.asset, opts)).then((m) => {
        if (!m?.root) return;
        if (this.finishing && !rec.keep) return;
        const root = m.root;
        root.position.copy(pos);
        root.rotation.y = facing;
        if (s.rx != null) root.rotation.x = s.rx;
        if (s.rz != null) root.rotation.z = s.rz;
        root.name = `story:${s.id}`;
        ctx.scene?.add(root);
        rec.obj = root; rec.model = m;
        if (m.animations?.length) {
          rec.anim = new Animator(m.scene ?? root, m.animations);
          if (s.clip) rec.anim.play(s.clip, { once: !!s.once, clampEnd: s.once !== false, speed: s.clipSpeed ?? 1 });
        }
        this.host?.onAssetSpawned?.(rec);
      });
    }
    if (kind === 'object') {             // a procedural Object3D built by the data (story/props.js)
      const obj = typeof s.build === 'function' ? s.build(ctx, s) : null;
      if (obj) { obj.position.copy(pos); obj.rotation.y = facing; ctx.scene?.add(obj); rec.obj = obj; obj.name = obj.name || `story:${s.id}`; }
      return null;
    }
    this.warnOnce(`cannot spawn "${s.type ?? s.asset ?? s.id}" (kind ${kind})`);
    return null;
  }

  _despawn(step) {
    for (const id of [].concat(step.ids ?? step.id ?? [])) this.despawnId(id);
    return this._timed(step);
  }

  /** Despawn a cast member by id (this scene's spawns first, else a registered actor). Idempotent. */
  despawnId(id) {
    const ctx = this.ctx;
    const recs = this.spawned.filter((r) => r.id === id || (typeof id === 'string' && id.endsWith('*') && r.id.startsWith(id.slice(0, -1))));
    if (recs.length) { for (const r of recs) this._despawnRec(r); return; }
    const a = this.actor(id);
    if (a) despawnActor(ctx, a);
  }

  _despawnRec(r) {
    const ctx = this.ctx;
    const i = this.spawned.indexOf(r);
    if (i >= 0) this.spawned.splice(i, 1);
    if (this.aliases.get(r.id) === r.obj) this.aliases.delete(r.id);
    if (!r.obj) return;
    this.scriptedActors.delete(r.obj);
    this.holyActors.delete(r.obj);
    r.anim?.mixer?.stopAllAction?.(); r.anim = null;
    if (r.kind === 'enemy' || r.kind === 'npc') despawnActor(ctx, r.obj);
    else if (r.kind === 'prop') ctx.levels?.despawnProp?.(r.obj);
    else {
      r.obj.removeFromParent?.();
      if (r.kind === 'object') { try { r.obj.userData?.dispose?.(); } catch (e) { console.warn(e); } }
      this.host?.onAssetDespawned?.(r);
    }
    r.obj = null;
  }

  // ---- wait / prompt
  _wait(step) {
    const task = new Task(this, step);
    const host = this.host;
    const mode = step.input ? 'input' : step.for ?? (typeof step.dur === 'string' ? step.dur : null);
    if (mode === 'input') {
      task.min = 0; task.hold = true; task.max = step.max ?? Infinity;
      task.tick = (dt, tk) => { if (tk.t >= LINE_MIN && (host?.advancePressed?.() || host?.fastDialog)) tk.hold = false; };
    } else if (mode === 'dialog') {
      task.min = 0; task.hold = true;
      task.tick = (dt, tk) => { if (!this.line) tk.hold = false; };
    } else if (typeof step.until === 'function') {
      task.min = Math.max(0, +step.minDur || 0); task.hold = true; task.max = step.max ?? TIMEOUT.default;
      task.tick = (dt, tk) => { try { if (step.until(this.ctx, this)) tk.hold = false; } catch (e) { console.warn(e); tk.hold = false; } };
    }
    return task;
  }

  _prompt(step) {
    const task = new Task(this, step);
    const ctx = this.ctx, bus = ctx.bus;
    const action = step.action ?? 'interact', input = PROMPT_INPUT[action] ?? action;
    const need = Math.max(0, step.hold ?? 0);
    const st = { held: 0, lastEmit: -1, armed: action !== 'chargeRelease' };
    task.min = 0; task.hold = true; task.max = Infinity;
    this.promptActive = step;
    const emit = (done) => bus.emit(E.PROMPT, { action, hold: need, textKey: step.textKey ?? null, progress: need > 0 ? clamp01(st.held / need) : (done ? 1 : 0), done: !!done, id: this.id });
    emit(false);
    task.tick = (dt, tk) => {
      const rdt = this._realDt ?? dt;
      const inp = ctx.input;
      if (this.host?.fastDialog) { tk.hold = false; return; }
      if (action === 'chargeRelease') {
        if (inp?.down?.(input)) { st.held += rdt; if (st.held >= need) st.armed = true; }
        else if (st.armed && st.held >= need && inp?.released?.(input) !== false) { tk.hold = false; }
        else st.held = 0;
      } else if (need > 0) {
        if (inp?.down?.(input)) st.held += rdt; else st.held = 0;      // releasing early restarts the fill (no penalty)
        if (st.held >= need) tk.hold = false;
      } else if (inp?.pressed?.(input)) tk.hold = false;
      if (tk.t - st.lastEmit >= 0.1) { st.lastEmit = tk.t; emit(false); }
    };
    const end = () => { if (this.promptActive === step) this.promptActive = null; emit(true); };
    task.onDone = end; task.onCancel = end;
    return task;
  }

  // ---- world
  _objective(step) { applyObjective(this.ctx, step); }
  _arena(step) { applyArena(this.ctx, step); }

  _load(step) {
    const task = new Task(this, step);
    const p = this.ctx.levels?.load?.(step.level, step.spawn ?? 'start');
    task.wait(p, TIMEOUT.load);
    return task;
  }

  _call(step) {
    const task = this._timed(step);
    let r;
    try { r = step.fn?.(this.ctx, this, step); } catch (e) { console.error(`[story] ${this.id}: call step threw`, e); return task; }
    if (r && typeof r.then === 'function') { if (!step.nowait) task.wait(r, step.max ?? TIMEOUT.default); }
    else if (typeof r === 'number' && !step.nowait) task.min = Math.max(task.min, r);
    return task;
  }

  // ------------------------------------------------------------------ the end block
  async _applyEnd(skipped) {
    const ctx = this.ctx, host = this.host, end = this.def.end ?? {};
    const keep = new Set([].concat(end.keep ?? []));
    // close dialogue / prompts / looping sounds
    this.line = null; host?.onLine?.(null);
    if (this.dialogOpen) { this.dialogOpen = false; ctx.bus.emit(E.DIALOG_END, { id: this.id }); }
    if (this.promptActive) { ctx.bus.emit(E.PROMPT, { action: this.promptActive.action, hold: 0, textKey: this.promptActive.textKey ?? null, progress: 1, done: true, id: this.id }); this.promptActive = null; }
    for (const [name, h] of this.sounds) { try { h?.stop?.(0.4); } catch { /* gone */ } if (name === 'march') this._playSound({ id: 'march', at: 'swordcat', on: false }); }
    this.sounds.clear();
    if (this.timeScaled) ctx.game?.setTimeScale?.(1);
    if (typeof end.call === 'function') { try { end.call(ctx, this, skipped, 'before'); } catch (e) { console.error(e); } }
    // the cast goes (unless kept)
    for (const r of [...this.spawned]) if (!r.keep && !keep.has(r.id)) this._despawnRec(r);
    for (const id of [].concat(end.despawns ?? [])) this.despawnId(id);
    // flags
    for (const [k, v] of Object.entries(end.flags ?? {})) host?.flag?.(k, v);
    if (end.shards != null && ctx.state) { ctx.state.shards = Math.max(ctx.state.shards ?? 0, end.shards); ctx.bus.emit(E.SHARD, { n: ctx.state.shards }); }
    for (const u of [].concat(end.unlock ?? [])) host?.unlock?.(u.kind, u.id);
    // actor final states (an explicit end pose survives the release below)
    const posed = new Set();
    for (const [id, st] of Object.entries(end.actors ?? {})) {
      const a = this.actor(id);
      if (!a || !st) continue;
      if (st.despawn) { this.despawnId(id); continue; }
      if (st.outfit && typeof a.setOutfit === 'function') a.setOutfit(st.outfit);
      if (st.pos != null) this.place(a, st.pos, st.facing ?? null);
      else if (typeof st.facing === 'number') { a.facing = st.facing; a.snap?.(); }
      if (st.visible != null && a.object3d) a.object3d.visible = !!st.visible;
      if (st.prop != null) this.applyProps(a, st.prop);
      if (st.attach === null) a.attach?.(null);
      if (st.pose !== undefined) { a.pose?.(st.pose ?? 'idle'); if (st.pose && st.pose !== 'idle') posed.add(a); }
      if (st.expression !== undefined) setExpression(a, st.expression);
      if (st.scripted === true) this.scriptedActors.delete(a);
    }
    if (!keep.has('holy')) for (const a of this.holyActors) ctx.fx?.holy?.(a, 0);
    this.holyActors.clear();
    // release the actors this scene drove (the player gets her input back)
    for (const a of this.scriptedActors) {
      try { if (!posed.has(a)) a.pose?.('idle'); setExpression(a, null); a.setScripted?.(false); } catch (e) { console.warn(e); }
    }
    this.scriptedActors.clear();
    this.tickers.length = 0;
    for (const s of [].concat(end.spawns ?? [])) this.spawnOne({ ...s, keep: true });
    // env, world
    if (end.env) applyEnv(ctx, typeof end.env === 'string' ? { preset: end.env, dur: skipped ? 0 : (end.envDur ?? 0) } : { ...end.env, dur: skipped ? 0 : (end.env.dur ?? 0) });
    if (end.objective) applyObjective(ctx, end.objective);
    if (end.arena) applyArena(ctx, end.arena);
    if (end.music !== undefined) { const m = end.music; try { ctx.audio?.music?.(m?.track ?? m ?? null, m?.fade ?? 1); } catch (e) { console.warn(e); } }
    if (end.companions) ctx.companions?.setActive?.(end.companions);
    // ui + camera handback (§5.1: letterbox off, HUD restored, 0.6 s blend; a skip cuts)
    host?.cinema?.apply?.({ letterbox: false, hud: true, fade: { alpha: 0, dur: skipped ? 0 : 0.5 }, ...(end.ui ?? {}), caption: null, title: null }, this, true);
    if (skipped) host?.cinema?.clear?.();
    if (host?.cinema?.letterOn && !end.ui?.letter) host.cinema.letter?.(null);
    const camOpt = end.cam ?? 'follow';
    if (camOpt !== false) {
      const m = typeof camOpt === 'string' ? camOpt : camOpt.mode ?? 'follow';
      const blend = skipped ? false : (typeof camOpt === 'object' && camOpt.blend != null ? camOpt.blend : ctx.config?.CAMERA?.ease ?? 0.6);
      try { ctx.cam?.mode?.(m, { blend }); } catch (e) { console.warn(e); }
    }
    // level change
    // (a function may decide at run time and await things first, e.g. CS-10's results card when skipped early)
    let load = end.load;
    if (typeof load === 'function') { try { load = await load(ctx, this, skipped); } catch (e) { console.error(`[story] ${this.id}: end load failed`, e); load = null; } }
    if (load?.level) {
      try { await ctx.levels?.load?.(load.level, load.spawn ?? 'start'); } catch (e) { console.error(`[story] ${this.id}: end load failed`, e); }
    }
    if (end.player?.spawn) {
      const sp = ctx.levels?.anchor?.(end.player.spawn);
      if (sp && ctx.player?.teleport) ctx.player.teleport({ pos: sp.pos.clone(), facing: sp.facing ?? 0 });
    }
    if (end.player?.outfit) ctx.player?.setOutfit?.(end.player.outfit);
    if (typeof end.call === 'function') { try { end.call(ctx, this, skipped, 'after'); } catch (e) { console.error(e); } }
    for (const k of [].concat(end.toasts ?? end.toast ?? [])) ctx.bus.emit(E.TOAST, { text: stext(k), key: k });
    if (end.chapter) host?.chapterCard?.(end.chapter);
    // back to play (the host clears `current`, restores the mode or starts the next queued scene)
    host?.seenSet?.(this.id);
    host?.ended?.(this, skipped);
    ctx.bus.emit(E.CUTSCENE_END, { id: this.id, skipped });
    if (end.save) ctx.bus.emit(E.SAVE_REQUEST, {});
    if (end.play) host?.play?.(end.play);
  }
}

// ==================================================================================================== shared appliers
/** Is `a` a cat (talks with a little mouth-open "meow" emote)? Pudding roars instead; enemies have their own faces. */
export function isCat(ctx, a) {
  if (!a) return false;
  if (a === ctx?.player) return true;
  if (a.npcId === 'pudding' || a.tags?.has?.('pudding') || a.npcId === 'coo') return false;
  return a.faction !== 'enemy' && (a.kittenId != null || a.npcId != null);
}

/**
 * Face expression on any cast member (null = back to the pose's own): player.setExpression (requested in
 * requests/story.md) → companions' KittenVisual.setExpression → the player's kitten rig (`model.k`).
 */
export function setExpression(a, name) {
  if (!a) return;
  try {
    if (typeof a.setExpression === 'function') { a.setExpression(name); return; }
    if (a.visual?.setExpression) { a.visual.setExpression(name ?? 'neutral'); return; }
    if (a.head?.setExpression) { a.head.setExpression(name ?? 'neutral'); return; }      // beast heads (enemies)
    if (a.model?.k?.setExpression) {
      a.__storyExpr = name || null;
      holdKittenExpression(a.model.k, a.__storyExpr);
      if (!name) a.model.expr = null;                   // let the player's own face logic re-apply next frame
    }
  } catch (e) { console.warn('[story] expression failed', e); }
}

/**
 * Hold `name` on a kitten rig (player.model.k) against its owner's per-frame face logic: the rig's setExpression is
 * wrapped once so every call shows the held face while one is set (null releases it). A fallback until
 * `player.setExpression` exists (requests/story.md); re-applied by Cutscene.render after an outfit rebuild.
 */
export function holdKittenExpression(k, name) {
  if (!k?.setExpression) return;
  if (!k.__storySetExpr) {
    const orig = k.setExpression;
    k.__storySetExpr = orig;
    k.setExpression = function setExpressionHeld(n, instant) { return orig.call(this, this.__storyExpr ?? n, instant); };
  }
  k.__storyExpr = name || null;
  if (name) k.__storySetExpr.call(k, name);
}

/** Which factory spawns `s.type` (enemy / npc / prop / asset). Pure-ish (reads ctx.config). */
export function spawnKind(ctx, s) {
  if (s.asset) return 'asset';
  if (s.prop) return 'prop';
  if (s.build) return 'object';
  const type = s.type ?? s.id;
  if (type === 'pudding' || type === 'npc') return 'npc';
  const E_ = ctx?.config?.ENEMIES ?? {};
  if (E_[type] || ['cacklejaw', 'pilfer', 'barkus_silhouette'].includes(type) || /^(boss_|bonehead:|jelly_)/.test(type)) return 'enemy';
  return 'npc';
}

/** Layout point i of n for a multi-spawn: 'line' along `dir` (default), 'files' (two files), 'ring', 'grid'. Pure. */
export function layoutPoint(s, i, n) {
  const at = Array.isArray(s.at) ? s.at : [0, 0];
  const [x0, z0] = at.length >= 3 ? [at[0], at[2]] : at;
  const sp = s.spacing ?? 1.0;
  const yaw = s.dir ?? s.facing ?? 0;
  const fx = Math.sin(typeof yaw === 'number' ? yaw : 0), fz = Math.cos(typeof yaw === 'number' ? yaw : 0);
  const rx = fz, rz = -fx;                                 // the actor's right... (+X local is her left; this is "across")
  switch (s.layout) {
    case 'ring': { const a = (i / n) * Math.PI * 2; const r = s.r ?? sp * n / (Math.PI * 2); return [x0 + Math.sin(a) * r, z0 + Math.cos(a) * r]; }
    case 'files': { const row = Math.floor(i / 2), side = i % 2 ? 1 : -1, w = (s.width ?? 2.5); return [x0 + rx * side * w - fx * row * sp, z0 + rz * side * w - fz * row * sp]; }
    case 'grid': { const cols = s.cols ?? 6, row = Math.floor(i / cols), col = i % cols; const off = (col - (Math.min(cols, n) - 1) / 2) * sp; return [x0 + rx * off - fx * row * sp, z0 + rz * off - fz * row * sp]; }
    default: { const off = (i - (n - 1) / 2) * sp; return [x0 + rx * off, z0 + rz * off]; }
  }
}

/** Despawn an actor through its owning area (never the player or a party companion). */
export function despawnActor(ctx, a) {
  if (!a || a === ctx.player) return;
  if (ctx.companions?.active?.includes?.(a)) return;
  try {
    if (ctx.enemies?.list?.includes?.(a) || a.faction === 'enemy' || a.def?.aiLess) { ctx.enemies?.despawn?.(a); return; }
    if (ctx.companions?.actors?.includes?.(a) || ctx.companions?.pudding === a) { ctx.companions?.despawn?.(a); return; }
    ctx.actors?.unregister?.(a); a.dispose?.();
  } catch (e) { console.warn('[story] despawn failed', e); }
}

/** env step / end.env → ctx.env (preset + fields), the Dawnstone glow and level group visibility. */
export function applyEnv(ctx, s) {
  const env = ctx.env, dur = s.dur ?? 0;
  if (env) {
    if (s.preset) env.preset?.(s.preset, s.presetDur ?? dur);
    const f = {};
    for (const k of ['fogDensity', 'fogColor', 'fogLow', 'wind', 'grade', 'hemi', 'skyTop', 'sun']) if (s[k] !== undefined) f[k] = s[k];
    if (Object.keys(f).length) env.set?.(f, dur);
  }
  if (s.dawnstone !== undefined) ctx.levels?.setDawnstone?.(!!s.dawnstone);
  if (s.visible) for (const [g, on] of Object.entries(s.visible)) ctx.levels?.setVisible?.(g, !!on);
  if (s.contribute) for (const [k, c] of Object.entries(s.contribute)) { if (c == null) env?.clear?.(k); else env?.contribute?.(k, c); }
}

/** objective step / end.objective → ctx.objectives. Doesn't restart a live objective unless `restart`. */
export function applyObjective(ctx, s) {
  const ob = ctx.objectives;
  if (!ob || !s?.id) return;
  if (s.complete) { ob.complete?.(s.id); return; }
  if (s.add != null) { ob.add?.(s.id, s.add); return; }
  if (s.freeze != null) { ob.freeze?.(s.id, !!s.freeze); return; }
  if (!s.restart && ob.get?.(s.id)) return;
  ob.start?.(s.id, { max: s.max ?? 1, value: s.value ?? 0, textKey: s.textKey ?? null, rate: s.rate ?? 0, needClear: s.needClear ?? null });
}

/** arena step / end.arena → ctx.levels.arena(id).lock() / clear(). */
export function applyArena(ctx, s) {
  if (!s?.id) return;
  const a = ctx.levels?.arena?.(s.id) ?? null;
  if (!a) { console.warn(`[story] arena "${s.id}" not in this level`); return; }
  try {
    if (s.lock && !a.locked && !a.cleared) a.lock?.();
    if (s.clear) a.clear?.();
  } catch (e) { console.warn('[story] arena step failed', e); }
}
