// src/world/Objectives.js  (owner: world) — the ctx.objectives system (§19.3) and The Line (§12.6):
//   start(id, cfg) → objective;  progress(id) → value;  freeze(id, on);  complete(id)
//   + add(id, n), set(id, value), get(id), list (active objectives), clear(id), block(id, on) (pause a rate-driven one
//     while something stands in the way), startLine(hooks) → LineController (`line`, the gate's repair), counter(id, max)
// cfg: { max = 1, value = 0, textKey, rate (units per second, The Line 100/240 %/s), needClear (arena id: reaches max
// but is only `done` once that arena is cleared, the glade's net_ropes §12.3), flag (story flag set true when done:
// `town.lanterns`, `forest.ropes`, `keep.keys`, `gate.line`) }.
// Counted objectives (§19.2 "ropes, lanterns, The Line, keys"): COUNTERS lists the ids and their text keys / flags.
// Every change emits objective:progress { id, value, max, textKey, frozen, paused, done } (rate-driven ones at most 4×/s).
// Objectives are level-scoped: cleared on level unload. Pure logic (no three), node-safe.
import { E } from '../core/events.js';
import { LINE } from '../core/config.js';

/** The counted objectives of Acts I–III: id → { max, textKey, flag }. */
export const COUNTERS = Object.freeze({
  net_ropes: { max: 3, textKey: 'obj.ropes' },                                   // meadow glade (needClear 'glade')
  treetop_ropes: { max: 3, textKey: 'obj.ropes', flag: 'forest.ropes' },          // forest treetop (Sage's cage)
  lanterns: { max: 3, textKey: 'obj.lanterns', flag: 'town.lanterns' },          // town Lantern Alley
  keys: { max: 2, textKey: 'obj.keys', flag: 'keep.keys' },                       // keep cellars (M3)
});

/** The Line (§12.6 step 3): repair % per second, the pause radius, Pilfer's escape and Pip's return times. */
export const LINE_RULES = Object.freeze({ max: 100, rate: 100 / LINE.durationAtFullRate, pinEscape: 8, pipReturn: 5, cs08MaxWait: 10, cs08Alive: 2,
  respawnDelay: 2.5, finishLock: 4.0 });

export class Objectives {
  constructor(ctx) {
    this.ctx = ctx;
    /** @type {Map<string, {id:string, value:number, max:number, textKey:string|null, rate:number, frozen:boolean, paused:boolean, done:boolean, needClear:string|null, flag:string|null, _emitT:number}>} */
    this.map = new Map();
    /** arena ids cleared in the current level */
    this.cleared = new Set();
    /** @type {LineController|null} The Line, while the gate runs it */
    this.line = null;
    this._offs = [];
  }

  async init() {
    const bus = this.ctx.bus;
    this._offs.push(
      bus.on(E.LEVEL_UNLOAD, () => { this.line?.dispose(); this.line = null; this.map.clear(); this.cleared.clear(); }),
      bus.on(E.ARENA_CLEAR, (p) => this.onArenaClear(p?.id)),
    );
  }

  /** Active objectives (not done). */
  get list() { return [...this.map.values()].filter((o) => !o.done); }

  /** Start (or restart) an objective. Known counters (COUNTERS) fill in their max / text / flag. */
  start(id, cfg = {}) {
    const k = COUNTERS[id] ?? {};
    const o = { id, value: Math.max(0, cfg.value ?? 0), max: cfg.max ?? k.max ?? 1, textKey: cfg.textKey ?? k.textKey ?? null, rate: cfg.rate ?? 0,
      frozen: !!cfg.frozen, paused: false, done: false, needClear: cfg.needClear ?? null, flag: cfg.flag ?? k.flag ?? null, _emitT: 0 };
    this.map.set(id, o);
    this._emit(o);
    if (o.value >= o.max) this._reached(o);
    return o;
  }

  /** A counted objective (COUNTERS row): started unless it already runs. */
  counter(id, cfg = {}) { return this.map.get(id) ?? this.start(id, cfg); }

  get(id) { return this.map.get(id) ?? null; }

  /** Current value (0 if the objective does not exist). */
  progress(id) { return this.map.get(id)?.value ?? 0; }

  /** Add `n` (ignored while frozen or done). */
  add(id, n = 1) {
    const o = this.map.get(id);
    if (!o || o.done || o.frozen) return;
    this.set(id, o.value + n);
  }

  /** Set the value (clamped to 0..max). */
  set(id, value) {
    const o = this.map.get(id);
    if (!o || o.done) return;
    const v = Math.max(0, Math.min(o.max, value));
    if (v === o.value) return;
    o.value = v;
    if (v >= o.max) this._reached(o); else this._emit(o);
  }

  freeze(id, on = true) { const o = this.map.get(id); if (!o || o.done || o.frozen === !!on) return; o.frozen = !!on; this._emit(o); }

  /** Pause / resume a rate-driven objective (The Line: an enemy within 4 m of the winch). */
  block(id, on = true) { const o = this.map.get(id); if (!o || o.done || o.paused === !!on) return; o.paused = !!on; this._emit(o); }

  /** Mark done now (value = max). */
  complete(id) {
    const o = this.map.get(id);
    if (!o || o.done) return;
    o.value = o.max; o.done = true; o.frozen = false; o.paused = false;
    this._emit(o);
    if (o.flag) { const c = this.ctx; if (c.story?.flag) c.story.flag(o.flag, true); else c.state?.setFlag?.(o.flag, true); }
  }

  /** Drop an objective without completing it. */
  clear(id) { this.map.delete(id); }

  _reached(o) {
    if (o.needClear && !this.cleared.has(o.needClear)) { this._emit(o); return; }   // waits for the arena (§12.3 glade)
    this.complete(o.id);
  }

  onArenaClear(id) {
    if (!id) return;
    this.cleared.add(id);
    for (const o of this.map.values()) if (!o.done && o.needClear === id && o.value >= o.max) this.complete(o.id);
  }

  _emit(o) {
    this.ctx.bus.emit(E.OBJECTIVE, { id: o.id, value: o.value, max: o.max, textKey: o.textKey, frozen: o.frozen || o.paused, paused: o.paused, done: o.done });
  }

  /** Start The Line (§12.6). `hooks`: see LineController. Returns the controller (also `this.line`). */
  startLine(hooks = {}) {
    this.line?.dispose();
    this.line = new LineController(this.ctx, this, hooks);
    this.line.start();
    return this.line;
  }

  update(dt) {
    this.line?.update(dt);
    for (const o of this.map.values()) {
      if (o.done || o.frozen || o.paused || !(o.rate > 0) || o.value >= o.max) continue;
      o.value = Math.min(o.max, o.value + o.rate * dt);
      if (o.value >= o.max) { this._reached(o); continue; }
      if ((o._emitT += dt) >= 0.25) { o._emitT = 0; this._emit(o); }
    }
  }

  dispose() { for (const off of this._offs) off(); this._offs.length = 0; this.line?.dispose(); this.line = null; this.map.clear(); this.cleared.clear(); }
}

/**
 * The Line (§12.6 step 3, U10): objective `line` 0 → 100 % at 100/240 % per second while no enemy stands within
 * LINE.winchRadius (horizontal) of the winch; the LINE.waves rows fire once each as the repair passes their `at`:
 *   W1 0 %, W2 20 % (2 stealer runners; the first to reach the winch is Pilfer: he takes the pin and the repair
 *   freezes; a hit makes him drop it; if he escapes (8 s) Pip brings it back 5 s after W2 is clear), W3 45 %,
 *   70 % CS-08 (waits for ≤ 2 alive and no live telegraph, at most 10 s, despawns the leftovers; W4 + the Spoon
 *   Brigade start when it ends), 85 % G-02, then a trickle (2 hyena, 1 runner) every 15 s after W4 until 100 %.
 * Enemies come up the lanes (z −58, x −4 / 0 / 4) heading north; runners (`objectiveRunner`) path for the winch.
 * Dying keeps the progress and re-spawns only the current wave. 100 % → flag `gate.line` and `hooks.onDone()`.
 * hooks: { onDone(), onWave(index, row), onPin(state), spawn(type, pos, opts) (default ctx.enemies.spawn) }.
 */
export class LineController {
  constructor(ctx, objectives, hooks = {}) {
    this.ctx = ctx; this.obj = objectives; this.hooks = hooks;
    this.cfg = hooks.cfg ?? LINE;
    this.rules = LINE_RULES;
    this.waves = [...this.cfg.waves].sort((a, b) => a.at - b.at);
    this.fired = new Set();
    /** @type {any[][]} enemies per wave index (W4 under the 70 % row) */
    this.byWave = this.waves.map(() => []);
    this.trickled = [];
    this.current = -1;            // the wave index whose enemies a death re-spawns ('trickle' = -2)
    this.active = false; this.done = false;
    this.pin = { state: 'home', thief: null, t: 0, pipT: -1 };
    this.cs08 = null;             // { t, row, index } while CS-08 waits for a quiet moment
    this.g02Pending = false;
    this.w4 = false; this.trickleT = 0;
    this.respawnT = -1; this.respawnWave = null;
    this.telegraphs = new Set();
    this.lanes = this.cfg.lanes.map(([x, z]) => ({ x, z }));
    this._lane = 0;
    this.winch = { x: this.cfg.winch[0], z: this.cfg.winch[1] };
    this._offs = [];
  }

  get value() { return this.obj.progress('line'); }

  start() {
    if (this.active) return this;
    const bus = this.ctx.bus;
    this.active = true;
    this.obj.start('line', { max: this.rules.max, rate: this.rules.rate, textKey: 'obj.line', value: this.hooks.value ?? 0 });
    this._offs.push(
      bus.on(E.TELEGRAPH, (p) => { if (p?.id != null) this.telegraphs.add(p.id); }),
      bus.on(E.TELEGRAPH_END, (p) => { this.telegraphs.delete(p?.id); }),
      bus.on(E.HIT, (h) => { if (this.pin.state === 'stolen' && h?.target && h.target === this.pin.thief && !h.blocked) this._pinBack('hit'); }),
      // enemies' stealer AI may run the theft itself (item:stolen / item:returned {item: 'pin'}): adopt it
      bus.on(E.ITEM_STOLEN, (p) => { if (p?.item === 'pin' && this.pin.state === 'home' && !this._emitting) this._steal(p.thief ?? null, false); }),
      bus.on(E.ITEM_RETURNED, (p) => { if (p?.item === 'pin' && this.pin.state !== 'returned' && !this._emitting) this._pinBack(p.by ?? 'hit', false); }),
      bus.on(E.ENEMY_DIED, (p) => { if (this.pin.state === 'stolen' && p?.enemy === this.pin.thief) this._pinBack('hit'); }),
      bus.on(E.OBJECTIVE, (p) => { if (p?.id === 'line' && p.done && !this.done) this._finish(); }),
      bus.on(E.PLAYER_DIED, () => this._onDeath()),
      bus.on(E.PLAYER_SPAWNED, () => { if (this.respawnWave) this.respawnT = Math.min(this.respawnT < 0 ? Infinity : this.respawnT, this.rules.respawnDelay); }),
      // story may start CS-08 / G-02 on its own (objective:progress thresholds): a started scene counts as ours
      bus.on(E.CUTSCENE_START, (p) => { if (p?.id === 'cs08' && this.cs08 && !this.cs08.done) this.cs08.playing = true; if (p?.id === 'g02') { this.g02Seen = true; this.g02Pending = false; } }),
      bus.on(E.CUTSCENE_END, (p) => { if (p?.id === 'cs08' && this.cs08 && !this.cs08.done) this._afterCs08(); }),
    );
    this._checkWaves();                          // W1 (0 %) comes up the causeway at once
    return this;
  }

  // ------------------------------------------------------------------ queries
  _list() { return this.ctx.enemies?.list ?? []; }
  _alive(e) { return !!e && e.alive !== false && !e.disposed && this._list().includes(e); }
  /** Line enemies still in play. */
  aliveCount() { let n = 0; for (const w of this.byWave) for (const e of w) if (this._alive(e)) n++; for (const e of this.trickled) if (this._alive(e)) n++; return n; }
  /** Is any enemy within the winch radius (horizontal)? */
  enemyNearWinch() {
    const r = this.cfg.winchRadius ?? 4, r2 = r * r;
    for (const e of this._list()) {
      if (!e || e.alive === false || !e.pos) continue;
      const dx = e.pos.x - this.winch.x, dz = e.pos.z - this.winch.z;
      if (dx * dx + dz * dz <= r2) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ step
  update(dt) {
    if (!this.active || this.done) return;
    const o = this.obj.get('line');
    if (!o) return;
    this.obj.block('line', this.enemyNearWinch());
    this._checkWaves(o);
    this._updatePin(dt);
    this._updateCs08(dt);
    if (this.g02Pending && !this.g02Seen && !this.ctx.story?.isPlaying) { this.g02Pending = false; this.ctx.story?.play?.('g02'); }
    // the trickle after W4, until 100 %
    if (this.w4 && !o.done) {
      this.trickleT += dt;
      const tr = this.cfg.trickle;
      if (tr && this.trickleT >= tr.every) { this.trickleT = 0; this.trickled.push(...this._spawn(tr.spawn, tr.runners ?? 0)); this.current = -2; }
    }
    if (this.respawnT >= 0 && (this.respawnT -= dt) < 0) this._respawn();
  }

  /** Thresholds: once each, in order; a jump over several fires them all. */
  _checkWaves(o = this.obj.get('line')) {
    if (!o) return;
    const frac = o.value / o.max;
    for (let i = 0; i < this.waves.length; i++) if (!this.fired.has(i) && frac >= this.waves[i].at - 1e-9) this._fire(i);
  }

  _fire(i) {
    this.fired.add(i);
    const w = this.waves[i];
    this.hooks.onWave?.(i, w);
    if (w.cutscene === 'cs08') { this.cs08 = { t: 0, index: i, row: w, playing: false }; return; }
    if (w.cutscene) { if (this.g02Seen) return; if (this.ctx.story?.isPlaying) this.g02Pending = true; else this.ctx.story?.play?.(w.cutscene); return; }
    this.byWave[i].push(...this._spawn(w.spawn ?? [], w.runners ?? 0, { pinThief: !!w.pinThief }));
    this.current = i;
  }

  /**
   * Spawn a wave list at the lanes: `runners` of them (stealers first) path for the winch (`objectiveRunner`).
   * @returns {any[]} the spawned enemies
   */
  _spawn(list, runners = 0, { pinThief = false } = {}) {
    const flat = [];
    for (const [type, n = 1, extra] of list) for (let k = 0; k < n; k++) flat.push({ type, extra });
    // runners: stealers first (W2: both stealers run), then in list order
    const order = [...flat.keys()].sort((a, b) => (flat[b].type === 'stealer') - (flat[a].type === 'stealer'));
    const run = new Set(order.slice(0, runners));
    const out = [];
    let pilfer = pinThief && !this._pilferSent;
    const spawn = this.hooks.spawn ?? ((t, p, op) => this.ctx.enemies?.spawn?.(t, p, op));
    flat.forEach(({ type, extra }, k) => {
      const lane = this.lanes[this._lane++ % this.lanes.length];
      const row = Math.floor(k / this.lanes.length);
      const pos = { x: lane.x + (row % 2 ? 0.8 : -0.4) * Math.min(1, row), y: 0, z: lane.z - row * 1.6 };
      pos.y = this.ctx.physics?.heightAt?.(pos.x, pos.z) ?? 0;
      const isRunner = run.has(k);
      // runners (`runner` / `objectiveRunner`) head for the winch (`goal`); the first W2 stealer is Pilfer
      const opts = { facing: 0, alerted: true, zone: 'line', line: true, runner: isRunner, objectiveRunner: isRunner, goal: [this.winch.x, this.winch.z],
        objectiveTarget: [this.winch.x, this.winch.z], noCap: true, ...(extra ?? {}) };
      if (pinThief && type === 'stealer') { opts.pinThief = true; if (pilfer) { opts.look = 'pilfer'; opts.id = 'pilfer'; pilfer = false; this._pilferSent = true; } }
      const vec = this.hooks.vec ? this.hooks.vec(pos) : pos;
      const e = spawn(type, vec, opts);
      if (!e) return;
      e.lineRole = opts.pinThief ? 'pinThief' : isRunner ? 'runner' : 'raider';
      e.tags?.add?.('line'); if (isRunner) e.tags?.add?.('runner');
      out.push(e);
      this.ctx.bus.emit(E.BURST, { kind: 'spawn', position: vec });
    });
    return out;
  }

  // ------------------------------------------------------------------ Pilfer and the pin
  _updatePin(dt) {
    const pin = this.pin, ctx = this.ctx;
    if (pin.state === 'home') {
      if (ctx.enemies && 'pinThief' in ctx.enemies) return;      // enemies' stealer AI steals (item:stolen) by itself
      const r = this.cfg.winchRadius ?? 4;
      for (const w of this.byWave) for (const e of w) {
        if (e.lineRole !== 'pinThief' || !this._alive(e) || !e.pos) continue;
        if (Math.hypot(e.pos.x - this.winch.x, e.pos.z - this.winch.z) > r) continue;
        this._steal(e);
        return;
      }
    } else if (pin.state === 'stolen') {
      pin.t += dt;
      if (pin.t >= this.rules.pinEscape || !this._alive(pin.thief)) {
        // he got away into the fog with it
        const th = pin.thief;
        if (this._alive(th)) { try { ctx.enemies?.despawn?.(th); } catch { /* gone */ } }
        pin.state = 'lost'; pin.thief = null; pin.pipT = -1;
        this.hooks.onPin?.('lost');
      }
    } else if (pin.state === 'lost') {
      // Pip runs it back once W2 is clear
      const w2 = this.waves.findIndex((w) => w.pinThief);
      const clear = w2 < 0 || !this.byWave[w2].some((e) => this._alive(e));
      if (clear && pin.pipT < 0) pin.pipT = this.rules.pipReturn;
      if (pin.pipT >= 0 && (pin.pipT -= dt) < 0) this._pinBack('pip');
    }
  }

  /** The pin is gone (our proximity check, or enemies' stealer AI reported it: `emit` false). */
  _steal(e, emit = true) {
    const ctx = this.ctx, pin = this.pin;
    pin.state = 'stolen'; pin.thief = e ?? ctx.enemies?.pinThief ?? null; pin.t = 0;
    if (pin.thief) { pin.thief.carrying = 'pin'; pin.thief.tags?.add?.('pilfer'); }
    this.obj.freeze('line', true);
    if (emit) {
      this._emitting = true;
      try { ctx.bus.emit(E.ITEM_STOLEN, { thief: pin.thief, item: 'pin', amount: 1 }); } finally { this._emitting = false; }
      this._say('line.pilfer', "It's a post! Technically!");
      // run for the fog (enemies' stealer flees with loot on its own; this is the fallback)
      const away = ctx.levels?.anchor?.('fog_edge_4')?.pos ?? null;
      try { if (typeof pin.thief?.flee === 'function') pin.thief.flee(away); else if (away && pin.thief) pin.thief.fleeTo = away; } catch { /* optional */ }
    }
    this.hooks.onPin?.('stolen', pin.thief);
  }

  _pinBack(how, emit = true) {
    const ctx = this.ctx, pin = this.pin;
    if (pin.state === 'returned') return;
    if (pin.thief) pin.thief.carrying = null;
    pin.state = 'returned'; pin.thief = null;
    this.obj.freeze('line', false);
    if (ctx.story?.flag) ctx.story.flag('gate.pin', true); else ctx.state?.setFlag?.('gate.pin', true);
    if (emit) {                            // story's gate_pin scene (Pip: "Stole it back.") listens for `by: 'pip'`
      this._emitting = true;
      try { ctx.bus.emit(E.ITEM_RETURNED, { item: 'pin', amount: 1, bonus: 0, by: how }); } finally { this._emitting = false; }
    }
    this.hooks.onPin?.('returned', how);
  }

  // ------------------------------------------------------------------ CS-08 (70 %)
  _updateCs08(dt) {
    const c = this.cs08;
    if (!c || c.playing) return;
    c.t += dt;
    const quiet = this.aliveCount() <= this.rules.cs08Alive && this.telegraphs.size === 0;
    if (!quiet && c.t < this.rules.cs08MaxWait) return;
    if (this.ctx.story?.isPlaying) return;
    // despawn the leftovers, then the scene
    for (const w of this.byWave) for (const e of w) if (this._alive(e) && e !== this.pin.thief) this.ctx.enemies?.despawn?.(e);
    c.playing = true;
    const p = this.ctx.story?.play?.('cs08');
    if (!p || typeof p.then !== 'function') this._afterCs08();
    else p.then(() => this._afterCs08(), () => this._afterCs08());
  }

  _afterCs08() {
    const c = this.cs08;
    if (!c || c.done) return;
    c.done = true;
    const row = c.row;
    this.byWave[c.index].push(...this._spawn(row.then ?? [], row.runners ?? 0));
    this.current = c.index;
    this.w4 = true; this.trickleT = 0;
    if (row.spoons) {
      const st = this.ctx.state;
      if (st?.runtime) st.runtime.spoons = true;          // (companions start the Spoon Brigade on CS-08 themselves)
    }
  }

  // ------------------------------------------------------------------ death: keep the %, redo the current wave
  _onDeath() {
    if (!this.active || this.done) return;
    const i = this.current;
    const list = i === -2 ? this.trickled : i >= 0 ? this.byWave[i] : [];
    for (const e of list) if (this._alive(e) && e !== this.pin.thief) this.ctx.enemies?.despawn?.(e);
    if (i === -2) { this.trickled = []; this.respawnWave = null; return; }   // the trickle simply resumes
    if (i < 0) return;
    this.byWave[i] = list.filter((e) => e === this.pin.thief && this._alive(e));
    const w = this.waves[i];
    this.respawnWave = { index: i, list: w.cutscene ? (w.then ?? []) : (w.spawn ?? []), runners: w.runners ?? 0, pinThief: !!w.pinThief && this.pin.state === 'home' };
    this.respawnT = this.rules.respawnDelay + 1.5;       // without a player:spawned event, after the death beat
  }

  _respawn() {
    const r = this.respawnWave;
    this.respawnWave = null; this.respawnT = -1;
    if (!r || this.done) return;
    this.byWave[r.index].push(...this._spawn(r.list, r.runners, { pinThief: r.pinThief }));
    this.current = r.index;
  }

  // ------------------------------------------------------------------ 100 %
  _finish() {
    if (this.done) return;
    this.done = true;
    if (this.ctx.story?.flag) this.ctx.story.flag('gate.line', true); else this.ctx.state?.setFlag?.('gate.line', true);
    for (const e of this.trickled) if (this._alive(e)) this.ctx.enemies?.despawn?.(e);
    this.hooks.onDone?.(this);
  }

  /** A one-liner as a toast (strings key, English fallback). */
  _say(key, text) {
    const st = this.ctx.strings;
    const t = st?.has?.(key) ? st.t(key) : text;
    this.ctx.bus.emit(E.TOAST, { text: t, icon: 'bark', key });
  }

  dispose() { for (const off of this._offs) off(); this._offs.length = 0; this.active = false; this.cs08 = null; }
}
