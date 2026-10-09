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
// Acts I–II (M2), driven by gameplay events (world / enemies / companions may also call play() directly; a second
// request for a running or queued id is merged): forest D-02 (Sage's cage, companions) → CS-04 (trigger `camp`) →
// CS-05 (B1 defeated); town D-03 (Bakery Street cleared) → the Pilfer chase → CS-06 (post bag returned) → D-04 ×3
// (rescues) → CS-07 (trigger `steps`; results; the hub); gate: the yard dialogue on arrival → D-06 (war-wagon) →
// "Back to the Line" → The Line: CS-08 at 70% (after ≤ 2 enemies / no telegraph, ≤ 10 s), G-02 at 85%, the gate test at
// 100% → B2 → CS-09 → CS-10 (results; `town` hub, grey). The quest log follows the §19.7 flags (quest:update).
// Boss defeats start CS-05 / CS-09 / D-05; scenes of later milestones run as placeholders that apply their end state.
import { E } from '../core/events.js';
import { LEVEL_IDS } from '../core/config.js';
import { Cutscene } from './Cutscene.js';
import { Overlay } from './Overlay.js';
import { Tutorial } from './tutorial.js';
import { BarkDirector } from './dialogue/barks.js';
import { CUTSCENES, ALIASES, placeholderScene } from './cutscenes/index.js';
import { t as tr, text as textOf } from './strings.js';
import { currentQuest, nextLevel, levelCards, entrySpawn } from './quests.js';
import { hubLine } from './dialogue/hub.js';
import { aliveEnemies, levelResults } from './cutscenes/cast.js';

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
/** The Line beats (§12.6): repair fraction → scene, plus the CS-08 pre-roll (≤ 2 alive, no telegraph, ≤ 10 s). */
export const LINE_BEATS = Object.freeze([{ at: 0.70, id: 'cs08', flag: 'gate.spoons', preroll: true }, { at: 0.85, id: 'g02', flag: 'gate.leap' }]);
export const PREROLL = Object.freeze({ maxAlive: 2, maxWait: 10 });
/** Items whose return ends the Pilfer chase (CS-06) / the winch pin (gate.pin). */
export const POST_ITEMS = Object.freeze(['post_bag', 'postbag', 'mailbag', 'post']);
export const PIN_ITEMS = Object.freeze(['pin', 'winch_pin']);

/** Which Line beat (if any) a repair fraction triggers, given what already ran. Pure. */
export function lineBeat(frac, hasRun) {
  for (const b of LINE_BEATS) if (frac >= b.at - 1e-6 && !hasRun(b)) return b;
  return null;
}

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
    /** the letter card on screen ({ label, title, text, key }) or null */
    this.letterOn = null;
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
    if (step.letter !== undefined) this.letter(step.letter, step.vars);
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

  /**
   * The full-screen parchment letter card (§5.4 CS-06 shot 4, §6.7 letters): `{ key, title?, label? }` (strings keys or
   * text) or null to hide. ui draws it when `handles.letter`, else the story overlay.
   */
  letter(l, vars = null) {
    const card = !l ? null : { label: l.label ? textOf(l.label) : '', title: l.title ? textOf(l.title) : '', text: textOf(l.key ?? l.text ?? '', vars), key: l.key ?? null };
    this.letterOn = card;
    if (this.handles('letter') && this._toUi({ letter: card })) { this.overlay.letter(null); return; }
    this.overlay.letter(card);
  }

  dialog(line) { if (!this.handles('dialog')) this.overlay.dialog(line); else this.overlay.dialog(null); }

  prompt(p) {
    const feature = p?.kind === 'tutorial' ? 'tutorial' : 'prompt';
    if (!this.handles(feature)) this.overlay.prompt(p);
  }

  clear() { this.letterOn = null; this.overlay.clear(); if (this.handles('cinema')) this._toUi({ clear: true }); }

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
    /** pending pre-rolled scene: { id, t } (CS-08 waits for the field to calm down) */
    this.preroll = null;
    this.telegraphs = new Set();
    /** the quest step on screen ({ id, textKey, text }) */
    this.quest = null;
    /** auto beats on level load (the gate yard dialogue); off in ?test so smoke loads stay in play mode */
    this.autoBeats = !ctx.params?.test;
    this._lastHub = new Map();
    this._resultsP = null;
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
    on(E.OBJECTIVE, (p) => this._onObjective(p));
    on(E.ARENA_CLEAR, (p) => { if (p?.id === 'bakery') this._beat('d03', 'town.marmalade', 'town'); });
    on(E.ITEM_RETURNED, (p) => this._onReturned(p));
    on(E.ENEMY_DIED, () => this._checkBattlefield());
    on(E.TELEGRAPH, (p) => { if (p?.id != null) this.telegraphs.add(p.id); });
    on(E.TELEGRAPH_END, (p) => { this.telegraphs.delete(p?.id); });
    on(E.CUTSCENE_START, (p) => { if (this.preroll && p?.id === this.preroll.id) this.preroll = null; });
    on(E.CUTSCENE_END, (p) => { if (p?.id === 'd03') this._startChase(); else if (p?.id === 'cs06') this._endChase(); });
    on(E.FLAG_SET, () => this._questTick());
    on(E.PLAYER_SPAWNED, () => this._beltLetter());
    on(E.PROMPT, (p) => this.cinema.prompt(p));
    on(E.LEVEL_LOADED, (p) => this._onLevelLoaded(p));
    on(E.LEVEL_LOADING, () => { this.barks.clear(); });
    if (HAS_DOM()) {
      this._onGesture = (e) => {
        if (e?.repeat) return;                                       // a held key's auto-repeat is not a new press
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
    if (ALIASES[id]) id = ALIASES[id](this.ctx.state);
    // the same scene asked for twice (world's Line controller and story's own listener): one run, both promises
    if (this.current?.id === id && !this.current.finished && id !== 'cs00') return this._waitEnd(id);
    if (this.queue.some((e) => e.id === id)) return this._waitEnd(id);
    const def = this.registry[id] ?? placeholderScene(id);
    return new Promise((resolve) => {
      const entry = { id, def, resolve };
      if (this.current && this.current.id === 'cs00' && id !== 'cs00') this.current.skip();
      if (this.current) { this.queue.push(entry); return; }
      this._start(entry);
    });
  }

  _waitEnd(id) {
    return this.ctx.bus.wait(E.CUTSCENE_END, (p) => p?.id === id).then((p) => ({ id, skipped: !!p?.skipped }));
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
    if (cs.def?.results) this._afterResults(cs.def.results);
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
    // ui toasts `state:unlock` with the display name (requests/ui.md: a second toast here doubled it)
    this.ctx.bus.emit(E.UNLOCK, { kind, id });
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
    this.preroll = null;
    this.telegraphs.clear();
    this._beltLetter();
    this._questTick(true);
    // town reloaded mid-chapter (after D-03, before CS-06): Pilfer runs again (not in ?test: smoke loads town a lot)
    if (this.autoBeats && p?.id === 'town') this._startChase();
    // gate: the yard dialogue on the first arrival (§12.6 step 1)
    if (this.autoBeats && p?.id === 'gate' && (p.spawnId ?? 'start') === 'start' && !ctx.state?.getFlag?.('gate.yard')) this._beat('gate_yard', 'gate.yard', 'gate');
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

  // ------------------------------------------------------------------ M2 beats driven by gameplay events
  get levelId() { return this.ctx.levels?.current?.id ?? null; }

  /** Play `id` once: not while `flag` is set, only in `level` (when given). Returns the play promise or null. */
  _beat(id, flag = null, level = null) {
    if (flag && this.ctx.state?.getFlag?.(flag)) return null;
    if (level && this.levelId && this.levelId !== level) return null;
    return this.play(id);
  }

  _onObjective(p) {
    if (!p?.id) return;
    if (p.id === 'net_ropes' && p.done) this._puddingFollows();
    else if (p.id === 'bakery' && p.done) this._beat('d03', 'town.marmalade', 'town');
    else if (p.id === 'chase' && p.done) this._beat('cs06', 'town.letters', 'town');
    else if (p.id === 'line') {
      const frac = p.max > 0 ? p.value / p.max : 0;
      if (p.done || frac >= 1) { if (!this.ctx.state?.getFlag?.('gate.line')) this.play('gate_open'); return; }
      const st = this.ctx.state;
      const b = lineBeat(frac, (x) => !!st?.getFlag?.(x.flag) || this.current?.id === x.id || this.queue.some((e) => e.id === x.id) || this.preroll?.id === x.id);
      if (!b) return;
      if (b.preroll) this.preroll = { id: b.id, t: 0 };
      else this.play(b.id);
    }
  }

  _onReturned(p) {
    const item = String(p?.item ?? '');
    if (POST_ITEMS.includes(item)) this._beat('cs06', 'town.letters', 'town');
    else if (PIN_ITEMS.includes(item) && !this.ctx.state?.getFlag?.('gate.pin')) {
      if (p?.by === 'pip' || p?.pip) this.play('gate_pin'); else this.flag('gate.pin', true);
    }
  }

  /**
   * §12.5 Bakery Street → Post Office: after D-03 (town.marmalade, before town.letters) Pilfer runs the chase
   * (enemies' `pilferChase`); his 3rd hit drops the post bag (item:returned → CS-06). Idempotent.
   */
  _startChase() {
    const ctx = this.ctx, st = ctx.state, en = ctx.enemies;
    if (this.levelId !== 'town' || !st?.getFlag?.('town.marmalade') || st.getFlag('town.letters') || st.getFlag('town.free')) return null;
    if (typeof en?.pilferChase !== 'function') return null;
    if (en.list?.some?.((e) => e?.alive && e.type === 'pilfer_chase')) return null;
    try {
      if (!ctx.objectives?.get?.('chase')) ctx.objectives?.start?.('chase', { textKey: 'obj.stealer', max: 1 });
      this.chase = en.pilferChase();
      return this.chase;
    } catch (e) { console.warn('[story] pilfer chase failed', e); return null; }
  }

  /** CS-06 is over: the dazed Pilfer slips away in a puff of smoke. */
  _endChase() {
    const en = this.ctx.enemies;
    for (const e of [...(en?.list ?? [])]) {
      if (e?.type !== 'pilfer_chase') continue;
      try { this.ctx.bus.emit(E.BURST, { kind: 'smoke', position: e.pos.clone(), count: 10 }); en.despawn(e); } catch { /* optional */ }
    }
    this.chase = null;
  }

  /** §12.6: S1 + S2 clear (after the war-wagon) → the far horn and "Back to the Line!". */
  _checkBattlefield() {
    const st = this.ctx.state;
    if (this.levelId !== 'gate' || !st?.getFlag?.('gate.pip') || st.getFlag('gate.back') || st.getFlag('gate.line')) return;
    for (const e of this.ctx.enemies?.list ?? []) if (e?.alive && !e.dormant && !e.scripted && e.faction === 'enemy' && e.pos.z < -45) return;
    st.setFlag?.('gate.back', true);
    this.play('gate_back');
  }

  /** CS-08's pre-roll: play it once ≤ 2 enemies are alive and no telegraph is up, or after 10 s at the most. */
  _prerollTick(dt) {
    const pr = this.preroll;
    if (!pr || this.current) return;
    pr.t += dt;
    const calm = aliveEnemies(this.ctx) <= PREROLL.maxAlive && this.telegraphs.size === 0;
    if (calm || pr.t >= PREROLL.maxWait) { this.preroll = null; this.play(pr.id); }
  }

  /** CS-06 → CS-10: Marmalade's letter rides on her belt (re-attached after every load / respawn). */
  _beltLetter() {
    const st = this.ctx.state, p = this.ctx.player;
    if (!st || !p?.prop) return;
    const on = !!st.getFlag?.('town.letters') && !st.getFlag?.('gate.done');
    if (!on && !p.__storyBelt) return;
    p.__storyBelt = on;
    try { p.prop('letter@belt', on); } catch (e) { console.warn('[story] belt letter failed', e); }
  }

  /** quest:update when the current quest step changes (`force`: re-announce, e.g. after a load). */
  _questTick(force = false) {
    const q = currentQuest(this.ctx.state, this.levelId);
    if (!force && this.quest?.id === q.id) return;
    const prev = this.quest;
    this.quest = q;
    if (prev && prev.id !== q.id) this.ctx.bus.emit(E.QUEST_UPDATE, { questId: prev.id, state: 'done', text: prev.text });
    this.ctx.bus.emit(E.QUEST_UPDATE, { questId: q.id, state: q.id === 'done' ? 'done' : 'active', text: q.text, textKey: q.textKey });
  }

  /** Quest Board data (§14.3) for ui / world: level cards, the next level and its entry spawn. */
  board() { const st = this.ctx.state, next = nextLevel(st); return { cards: levelCards(st), next, spawn: next ? entrySpawn(next) : null }; }

  /**
   * §6.5 hub line for an NPC actor (or id): picks one (never the same twice in a row), shows it as a bubble over the
   * speaker with babble, returns { key, vars, text } (null when that NPC has no lines).
   */
  hubTalk(who) {
    const actor = typeof who === 'string' ? this.ctx.actors?.get?.(who) ?? null : who;
    const id = typeof who === 'string' ? who : (who?.npcId ?? who?.kittenId ?? who?.actorId ?? null);
    const row = hubLine(id, this.ctx.state, this.ctx.rng ?? (() => 0), this._lastHub.get(id) ?? null);
    if (!row) return null;
    this._lastHub.set(id, row.key);
    if (actor) this.barks.say(actor, row.text, id, Math.max(2.2, row.text.length / 18));
    return row;
  }

  /** The chapter results card after a scene that ends a level (CS-07: town). Runs once the scene hands back. */
  _afterResults(levelId) {
    if (this._resultsP) return;
    this._resultsP = levelResults(this.ctx, levelId).catch((e) => console.warn('[story] results failed', e)).finally(() => { this._resultsP = null; });
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
    if (this.preroll && (mode === 'play' || mode === 'memecam')) this._prerollTick(dt);
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
