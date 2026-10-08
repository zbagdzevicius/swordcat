// src/story/StoryManager.js  (owner: story) — ctx.story (GAME_DESIGN §5, §19.3): flags, chapters, triggers → cutscenes.
//   play(id) → Promise<{id, skipped}>   run cutscene `id` (src/story/cutscenes/<id>.js); queued if one is running
//   flag(k, v?)                         get / set a story flag (setting emits story:flag)
//   isPlaying                           a scene is running (world triggers / interacts wait for it)
//   skip() / skipAll()                  skip the running scene (its `end` block applies) / it and every queued one
// Additive: current, playingId, line, advance(), seen(id), newGame(opts), continueGame(), toTitle(), chapterCard(n),
// tutorial (Midnight Practice), barks (§6), cinema (overlay routing: ui when it says it handles a feature, else the
// story's own Overlay.js). See requests/story.md for the ui contract.
//
// Flow: boot loads `meadow` spawn `title` → CS-00 (title loop) → "Press any key" → ui's main menu (or, until the ui
// lands, continue / new game) → newGame(): CS-01 → Midnight Practice → G-01 (trigger) → CS-02 (trigger) → Chapter 1:
// CS-03 (picnic interact) → the net ropes → `cs03b` (Pudding follows) → D-01 (Mochi's cage, companions call it).
// Boss defeats start CS-05 / CS-09 / D-05; scenes of later milestones run as placeholders that apply their end state.
import { E } from '../core/events.js';
import { LEVEL_IDS } from '../core/config.js';
import { Cutscene } from './Cutscene.js';
import { Overlay } from './Overlay.js';
import { Tutorial } from './tutorial.js';
import { BarkDirector } from './dialogue/barks.js';
import { CUTSCENES, placeholderScene } from './cutscenes/index.js';
import { t as tr, text as textOf } from './strings.js';

/** Hold Pause this long to skip a skippable scene (§5.1). */
export const SKIP_HOLD = 1.0;
/** Boss defeated → its scene (§5.4). Keys are the boss key (`boss_` prefix stripped). */
export const BOSS_SCENES = Object.freeze({ grizzlechop: 'cs05', cacklejaw: 'cs09', brutus: 'd05' });
/** Actions that advance dialogue (§14.2: confirm / interact / ⚔ / jump; a click or tap calls advance()). */
export const ADVANCE_ACTIONS = Object.freeze(['confirm', 'interact', 'attack', 'jump']);
/** Chapter card length (§14.3) and when the wax seal stamps. */
export const CARD = Object.freeze({ dur: 3.0, stamp: 0.35 });
/** Chapter number per level (§4.2; the prologue is `meadow` before `prologue.done`). */
export const LEVEL_CHAPTER = Object.freeze({ meadow: 1, forest: 2, town: 3, gate: 4, bog: 5, keep: 6 });
/** Title: the "Press any key" prompt accepts input after the logo has faded in. */
export const TITLE_ACCEPT_AFTER = 1.2;

/**
 * Chapter card text for `n` (number, 'prologue' / 'epilogue', or a level id). Pure (strings only).
 * @returns {{label: string, title: string, region: string, n: number|string}}
 */
export function chapterInfo(n) {
  if (typeof n === 'string' && LEVEL_CHAPTER[n]) n = LEVEL_CHAPTER[n];
  if (n === 'prologue') return { n, label: tr('ch.label.prologue'), title: tr('ch.prologue'), region: tr('region.meadow') };
  if (n === 'epilogue') return { n, label: tr('ch.label.epilogue'), title: tr('ch.epilogue'), region: tr('region.town') };
  const lvl = LEVEL_IDS[(n | 0) - 1];
  return { n, label: tr('ch.label', { n }), title: tr(`ch.${n}`), region: lvl ? tr(`region.${lvl}`) : '' };
}

/** The current chapter from flags + level (§4.2). Pure-ish (reads a GameState-like object). */
export function chapterOf(state, levelId) {
  if (!levelId || levelId === 'meadow') return state?.getFlag?.('prologue.done') ? 1 : 'prologue';
  if (levelId === 'town' && state?.getFlag?.('ending.seen')) return 'epilogue';
  return LEVEL_CHAPTER[levelId] ?? 1;
}

const HAS_DOM = () => typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * Routes cinema commands to the ui when `ctx.ui.handles[feature]` is set (and `ctx.ui.cinema` is a function), else to
 * the story's own Overlay. Strings are resolved here, so both renderers get display text.
 */
export class Cinema {
  constructor(ctx, story) {
    this.ctx = ctx; this.story = story;
    this.overlay = new Overlay(ctx, story);
    this.letterboxOn = false; this.hudOn = true;
    /** what is on screen (for tests and other areas): the title card, the caption, the chapter card, the fade */
    this.titleOn = false; this.captionText = null; this.chapterOn = null; this.fadeAlpha = 0;
  }

  init() { this.overlay.init(); }

  /** Does the ui draw `feature` itself ('dialog' | 'cinema' | 'prompt' | 'skip' | 'title' | 'tutorial')? */
  handles(feature) { return !!this.ctx.ui?.handles?.[feature]; }

  _toUi(cmd) {
    const ui = this.ctx.ui;
    if (typeof ui?.cinema !== 'function') return false;
    try { ui.cinema(cmd); } catch (e) { console.warn('[story] ui.cinema failed', e); }
    return true;
  }

  letterbox(on) {
    this.letterboxOn = !!on;
    if (this.handles('cinema') && this._toUi({ letterbox: !!on })) { this.overlay.letterbox(false); return; }
    this.overlay.letterbox(!!on);
  }

  /** The HUD is the ui's; story only asks. */
  hud(on) {
    this.hudOn = !!on;
    const ui = this.ctx.ui;
    if (typeof ui?.cinema === 'function') this._toUi({ hud: !!on });
    else if (typeof ui?.setHud === 'function') { try { ui.setHud(!!on); } catch (e) { console.warn(e); } }
  }

  /** A cutscene `ui` step / end.ui (letterbox, hud, title, caption, chapter, fade, press). */
  apply(step, cs = null, isEnd = false) {
    if (!step) return;
    const cmd = {};
    if (step.letterbox !== undefined) this.letterbox(step.letterbox);
    if (step.hud !== undefined) this.hud(step.hud);
    if (step.caption !== undefined) cmd.caption = step.caption ? textOf(step.caption, step.vars) : null;
    if (step.title !== undefined) {
      const t = step.title;
      cmd.title = !t ? null : typeof t === 'string' ? { text: textOf(t), sub: '', logo: false }
        : { text: textOf(t.text ?? 'game.title'), sub: t.sub ? textOf(t.sub) : '', logo: t.logo !== false };
    }
    if (step.chapter !== undefined) cmd.chapter = step.chapter == null || step.chapter === false ? null : (typeof step.chapter === 'object' ? step.chapter : chapterInfo(step.chapter));
    if (step.fade !== undefined) {
      cmd.fade = step.fade;
      const f = step.fade;
      this.fadeAlpha = f == null || f === false ? 0 : typeof f === 'number' ? f : (f.alpha ?? 1);
    }
    if (step.press !== undefined) cmd.press = step.press ? textOf(typeof step.press === 'string' ? step.press : 'title.prompt') : false;
    if (step.clear) cmd.clear = true;
    if ('title' in cmd) this.titleOn = !!cmd.title;
    if ('caption' in cmd) this.captionText = cmd.caption;
    if ('chapter' in cmd) this.chapterOn = cmd.chapter;
    if (cmd.clear) { this.titleOn = false; this.captionText = null; this.chapterOn = null; }
    if (!Object.keys(cmd).length) return;
    const uiDraws = (k) => (k === 'title' || k === 'press' ? this.handles('title') : this.handles('cinema'));
    const toUi = {}, toOverlay = {};
    for (const [k, v] of Object.entries(cmd)) (uiDraws(k) ? toUi : toOverlay)[k] = v;
    if (Object.keys(toUi).length) this._toUi(toUi);
    if (Object.keys(toOverlay).length) this.overlay.apply(toOverlay);
    void cs; void isEnd;
  }

  /** Hold-to-skip ring progress (0 hides it). */
  skip(p, label = null) {
    if (this.handles('skip') && this._toUi({ skip: p, skipText: label })) return;
    this.overlay.skipRing(p, label ?? tr('prompt.skip'));
  }

  dialog(line) { if (!this.handles('dialog')) this.overlay.dialog(line); else this.overlay.dialog(null); }

  prompt(p) {
    const feature = p?.kind === 'tutorial' ? 'tutorial' : 'prompt';
    if (!this.handles(feature)) this.overlay.prompt(p);
  }

  clear() { this.overlay.clear(); if (this.handles('cinema')) this._toUi({ clear: true }); }

  render(frameDt) { this.overlay.render(frameDt); }

  dispose() { this.overlay.dispose(); }
}

export class StoryManager {
  constructor(ctx) {
    this.ctx = ctx;
    /** @type {Cutscene|null} the running scene */
    this.current = null;
    /** @type {{id: string, def: any, resolve: Function}[]} */
    this.queue = [];
    this.registry = CUTSCENES;
    this.cinema = new Cinema(ctx, this);
    this.tutorial = new Tutorial(ctx, this);
    this.barks = new BarkDirector(ctx, this);
    /** the dialogue line on screen (Cutscene's line object) */
    this.line = null;
    /** test / skipAll: every dialogue line and wait completes at once */
    this.fastDialog = false;
    this.skipHeld = 0;
    this.title = { active: false, t: 0, pressed: false, done: false, prompted: false };
    this._advance = false;
    this._gestures = 0; this._gestureSeen = 0;
    this._card = null;
    this._offs = [];
  }

  // ------------------------------------------------------------------ contract
  get isPlaying() { return !!this.current; }
  get playingId() { return this.current?.id ?? null; }
  /** M0 compatibility: the running scene's handle. */
  get playing() { return this.current; }
  get chapter() { return chapterOf(this.ctx.state, this.ctx.levels?.current?.id); }

  async init() {
    const ctx = this.ctx, bus = ctx.bus, on = (ev, fn) => this._offs.push(bus.on(ev, fn));
    this.cinema.init();
    this.tutorial.init();
    this.barks.init();
    on(E.BOSS_DEFEATED, (p) => { const id = BOSS_SCENES[String(p?.id ?? '').replace(/^boss_/, '')]; if (id) this.play(id); });
    on(E.OBJECTIVE, (p) => { if (p?.id === 'net_ropes' && p.done) this._puddingFollows(); });
    on(E.PROMPT, (p) => this.cinema.prompt(p));
    on(E.LEVEL_LOADED, (p) => this._onLevelLoaded(p));
    on(E.LEVEL_LOADING, () => { this.barks.clear(); });
    if (HAS_DOM()) {
      this._onGesture = () => {
        this._gestures++;
        if (this.title.active && this.title.t >= TITLE_ACCEPT_AFTER && !this.title.pressed) { try { ctx.audio?.unlock?.(); } catch { /* optional */ } }
      };
      for (const ev of ['keydown', 'pointerdown', 'touchstart']) window.addEventListener(ev, this._onGesture, { passive: true });
    }
  }

  /**
   * Play cutscene `id`. A running scene keeps playing and this one waits in the queue (the title loop is cut).
   * @param {string} id @returns {Promise<{id: string, skipped: boolean}>}
   */
  play(id) {
    const def = this.registry[id] ?? placeholderScene(id);
    return new Promise((resolve) => {
      const entry = { id, def, resolve };
      if (this.current && this.current.id === 'cs00' && id !== 'cs00') this.current.skip();
      if (this.current) { this.queue.push(entry); return; }
      this._start(entry);
    });
  }

  _start(entry) {
    const cs = new Cutscene(this.ctx, entry.def, this);
    cs.resolve = entry.resolve;
    this.current = cs;
    this.skipHeld = 0;
    this.barks.hideAll();
    try { cs.start(); } catch (e) { console.error(`[story] ${entry.id} failed to start`, e); cs.finish(true); }
  }

  /** Called by a Cutscene right before it emits cutscene:end: next queued scene, else back to play. */
  ended(cs, skipped) {
    if (this.current === cs) this.current = null;
    this.line = null; this.cinema.dialog(null);
    this.cinema.skip(0);
    this.skipHeld = 0;
    if (cs.id === 'cs00') this._endTitle();
    const next = this.queue.shift();
    if (next) { this._start(next); return; }
    const g = this.ctx.game;
    if (g && (g.mode === 'cutscene' || g.mode === 'dialog')) g.setMode('play');
    void skipped;
  }

  /** Get (one arg) or set (two args) a story flag; setting emits story:flag. */
  flag(key, value) {
    if (arguments.length < 2) return this.ctx.state?.getFlag?.(key);
    this.ctx.state?.setFlag?.(key, value);
    this.ctx.bus.emit(E.FLAG_SET, { key, value });
    return value;
  }

  /** Skip the running scene (its end block runs: flags, spawns, env, positions, camera handback). */
  skip() { this.current?.skip(); }

  /** Skip the running scene and everything queued (test hook `skipDialog`). */
  skipAll() {
    const q = this.queue.splice(0);
    this.current?.skip();
    for (const e of q) {
      const cs = new Cutscene(this.ctx, e.def, this);
      cs.resolve = e.resolve;
      this.current = cs;
      try { cs.start(); } catch (err) { console.warn(err); }
      cs.skip();
    }
  }

  /** Has the player already watched `id` (seen scenes can be hold-skipped)? */
  seen(id) { return !!this.ctx.state?.getFlag?.('seen.' + id); }
  seenSet(id) { this.ctx.state?.setFlag?.('seen.' + id, true); }

  /** Latch one "next" press (click / tap on the dialogue box). */
  advance() { this._advance = true; }

  /** Did the player ask for the next line this step? (consumes the latch) */
  advancePressed() {
    const input = this.ctx.input;
    let p = this._advance;
    this._advance = false;
    if (!p && input) for (const a of ADVANCE_ACTIONS) if (input.pressed(a)) { p = true; break; }
    return p;
  }

  /** Any fresh input this step (G-01's "any input after 1.0 s skips"). */
  anyPressed() {
    const input = this.ctx.input;
    if (this._gestures !== this._gestureSeen) { this._gestureSeen = this._gestures; return true; }
    if (!input) return false;
    for (const s of input.actions?.values?.() ?? []) if (s.pressed) return true;
    return false;
  }

  /** The dialogue line changed (Cutscene `say`). */
  onLine(line) { this.line = line; this.cinema.dialog(line); }

  /** Unlock a cosmetic / ability (§13.4, §13.5): adds it to state and announces it. */
  unlock(kind, id) {
    const st = this.ctx.state;
    if (!st || !id) return;
    let fresh = true;
    if (kind === 'cape') { const l = st.cosmetics.capes; fresh = !l.includes(id); if (fresh) l.push(id); }
    else if (kind === 'skin') { const l = st.cosmetics.swords; fresh = !l.includes(id); if (fresh) l.push(id); }
    if (!fresh) return;
    this.ctx.bus.emit(E.UNLOCK, { kind, id });
    const key = kind === 'cape' ? 'toast.cape' : kind === 'skin' ? 'toast.skin' : null;
    if (key) this.ctx.bus.emit(E.TOAST, { text: tr(key, { name: id }), key, icon: kind });
  }

  /** Show the chapter card (§14.3: 3.0 s, the wax seal stamps with `ui/drop_002`). */
  chapterCard(n = this.chapter, dur = CARD.dur) {
    const info = chapterInfo(n);
    this.cinema.apply({ chapter: info });
    this._card = { t: 0, dur, stamped: false };
    if (n !== 'prologue' && n !== 'epilogue') this.ctx.state?.setFlag?.(`seen.card.${info.n}`, true);
    return info;
  }

  // ------------------------------------------------------------------ title, new game, continue
  _onLevelLoaded(p) {
    const ctx = this.ctx;
    if (p?.spawnId === 'title') { if (!this.current || this.current.id !== 'cs00') this.play('cs00'); return; }
    // later chapters: the card on the first visit (meadow's come from CS-01 / CS-02; not in ?test, where smoke loads
    // levels all the time and the card would sit over every area's screenshots)
    const n = LEVEL_CHAPTER[p?.id];
    if (!ctx.params?.test && n && p.id !== 'meadow' && !ctx.state?.getFlag?.(`seen.card.${n}`) && !this.current) this.chapterCard(n);
  }

  /** CS-00 hook: the title is up (story waits for "any key"). */
  titleBegin() { this.title = { active: true, t: 0, pressed: false, done: false, prompted: false }; }

  /** CS-00's `until`: the title is over (new game / continue chosen). */
  get titleDone() { return this.title.done; }

  _endTitle() { this.title.active = false; this.title.done = true; this.cinema.apply({ title: null, press: false }); }

  _titleTick(dt) {
    const T = this.title;
    if (!T.active || T.pressed) return;
    T.t += dt;
    const pad = this.ctx.input?.anyActivity?.() && this.ctx.input.device === 'pad';
    if (T.t < TITLE_ACCEPT_AFTER) { this._gestureSeen = this._gestures; return; }
    if (this._gestures !== this._gestureSeen || pad) {
      this._gestureSeen = this._gestures;
      T.pressed = true;
      this._titleGo();
    }
  }

  /** "Press any key" (§5.4 CS-00): audio unlock + the menu music, then ui's main menu or our fallback. */
  _titleGo() {
    const ctx = this.ctx;
    try { ctx.audio?.unlock?.(); ctx.audio?.music?.('village_bards_tale', 2); } catch (e) { console.warn(e); }
    this.cinema.apply({ press: false });
    if (typeof ctx.ui?.openMainMenu === 'function') { try { ctx.ui.openMainMenu(); return; } catch (e) { console.warn('[story] main menu failed', e); } }
    const st = ctx.state;
    if (st?.getFlag?.('prologue.armour')) this.continueGame(); else this.newGame();
  }

  /** Wait `sec` real seconds (rendered frames; works in any mode). */
  _sleep(sec) {
    const g = this.ctx.game;
    if (!g?.addFrameHook) return new Promise((r) => setTimeout(r, sec * 1000));
    return new Promise((resolve) => { let t = 0; const off = g.addFrameHook((dt) => { t += dt; if (t >= sec) { off(); resolve(); } }); });
  }

  /**
   * New game (§14.3): reset progress (settings kept), then the prologue (CS-01 → Midnight Practice), or straight to
   * Chapter 1 with `skipPrologue`.
   * @param {{ difficulty?: string, skipPrologue?: boolean }} [o]
   */
  async newGame({ difficulty = null, skipPrologue = false } = {}) {
    const ctx = this.ctx, st = ctx.state;
    this.cinema.apply({ fade: { to: '#000', alpha: 1, dur: 0.7 } });
    await this._sleep(0.75);
    if (this.current?.id === 'cs00') this.current.skip();
    this._endTitle();
    this.queue.length = 0;
    if (st) {
      const settings = { ...st.settings };
      st.reset({ settings, difficulty: difficulty ?? st.difficulty ?? 'knight' });
    }
    try {
      if (skipPrologue) {
        for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) this.flag(k, true);
        await ctx.levels.load('meadow', 'start');
        this.cinema.apply({ fade: { alpha: 0, dur: 1.0 } });
        this.chapterCard(1);
        ctx.bus.emit(E.SAVE_REQUEST, {});
        return;
      }
      await ctx.levels.load('meadow', 'practice');
    } catch (e) { console.error('[story] new game load failed', e); }
    this.play('cs01');
  }

  /** Continue the saved game: its level and spawn (a save that never got past CS-01 starts the prologue). */
  async continueGame() {
    const ctx = this.ctx, st = ctx.state;
    if (!st?.getFlag?.('prologue.armour')) return this.newGame();
    this.cinema.apply({ fade: { to: '#000', alpha: 1, dur: 0.6 } });
    await this._sleep(0.65);
    if (this.current?.id === 'cs00') this.current.skip();
    this._endTitle();
    const level = LEVEL_IDS.includes(st.levelId) ? st.levelId : 'meadow';
    let spawn = st.spawnId || 'start';
    if (spawn === 'title') spawn = st.getFlag('prologue.done') ? 'start' : 'practice';
    try { await ctx.levels.load(level, spawn); } catch (e) { console.error('[story] continue failed', e); }
    this.cinema.apply({ fade: { alpha: 0, dur: 0.9 } });
  }

  /** Pause → Quit to Title: drop every scene and go back to the title loop. */
  async toTitle() {
    this.queue.length = 0;
    this.current?.skip();
    this.tutorial.reset();
    try { await this.ctx.levels.load('meadow', 'title'); } catch (e) { console.error('[story] to title failed', e); }
  }

  // ------------------------------------------------------------------ Chapter 1 beats driven by gameplay events
  /** Net ropes 3/3 and the glade clear (§5.4 after CS-03): Pudding sniffs, nods and follows "from a distance". */
  _puddingFollows() {
    if (this.ctx.state?.getFlag?.('meadow.pudding') === true) return;
    this.flag('meadow.pudding', true);
    this.play('cs03b');
  }

  // ------------------------------------------------------------------ loop
  update(dt) {
    const ctx = this.ctx, mode = ctx.game?.mode;
    const cs = this.current;
    if (cs) {
      this._skipHold(dt, cs);
      if (this.current === cs) cs.update(dt);
    } else if (mode === 'play' || mode === 'memecam') this.tutorial.update(dt);
    if (this.title.active) this._titleTick(dt);
    this.barks.update(dt);
    this._advance = false;
  }

  _skipHold(dt, cs) {
    const input = this.ctx.input;
    const held = !!input?.down?.('pause') && cs.canSkip;
    if (held) {
      this.skipHeld += cs._realDt ?? dt;
      this.cinema.skip(Math.min(1, this.skipHeld / SKIP_HOLD));
      if (this.skipHeld >= SKIP_HOLD) { this.skipHeld = 0; this.cinema.skip(0); cs.skip(); }
    } else if (this.skipHeld > 0) { this.skipHeld = 0; this.cinema.skip(0); }
  }

  render(alpha, frameDt) {
    this.current?.render(frameDt);
    this.cinema.render(frameDt);
    this.barks.render(frameDt);
    const c = this._card;
    if (c) {
      c.t += frameDt;
      if (!c.stamped && c.t >= CARD.stamp) { c.stamped = true; try { this.ctx.audio?.play2D?.('ui/drop_002', { vol: 0.9 }); } catch { /* optional */ } }
      if (c.t >= c.dur) { this._card = null; this.cinema.apply({ chapter: null }); }
    }
  }

  dispose() {
    this.queue.length = 0;
    this.current?.skip();
    this.current = null;
    for (const off of this._offs) off();
    this._offs.length = 0;
    if (HAS_DOM() && this._onGesture) for (const ev of ['keydown', 'pointerdown', 'touchstart']) window.removeEventListener(ev, this._onGesture);
    this.tutorial.dispose();
    this.barks.dispose();
    this.cinema.dispose();
  }
}
