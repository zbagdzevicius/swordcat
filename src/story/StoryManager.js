// src/story/StoryManager.js  (owner: story) — ctx.story (GAME_DESIGN §5, §19.3): flags, chapters, triggers → cutscenes.
//   play(id) → Promise<{id, skipped}>   run cutscene `id` (src/story/cutscenes/<id>.js); queued if one is running
//   flag(k, v?)                         get / set a story flag (setting emits story:flag)
//   isPlaying                           a scene is running (world triggers / interacts wait for it)
//   skip() / skipAll()                  skip the running scene (its `end` block applies) / it and every queued one
// Additive: current, playingId, line, advance(), seen(id), newGame(opts), continueGame(at), toTitle(), chapterCard(n),
// tutorial (Morning Practice), barks (§6), cinema (overlay routing: ui when it says it handles a feature, else the
// story's own Overlay.js), hint(key, o) (one-time hints; Mochi says them once he has joined), stage (the prologue
// stage), toChart(), barnSet(on). See requests/story.md for the ui contract.
//
// Flow (WA §6.2, "play first"): boot loads `meadow` spawn `title` → CS-00 (title loop on the sunny practice field,
// Pearl beside her) → the tap → newGame(): no fade, no reload, the camera blends to follow and she plays at once →
// Morning Practice (7 lessons, Pearl guiding; `tutbow` after the bonk) → `tutpearl` → Pearl leads her to the height
// chart → CS-01 (one ear-tuft short, ~20 s) → CS-02 (The Giggling Mist) → she runs to the barn → CS-01b (Suit Up; the
// chest) → Chapter 1: G-01 on her way north → D-01 (Mochi's cart, companions call it) → CS-03 (picnic interact) → the
// net ropes → `cs03b` (Pudding follows). The prologue director (`_prologueTick`) plays each beat by position / flag
// when the level's own triggers do not (or a save resumes mid-prologue). Old saves map through `migrateFlags`.
// Acts I–II (M2), driven by gameplay events (world / enemies / companions may also call play() directly; a second
// request for a running or queued id is merged): forest D-02 (Sage's cage, companions) → CS-04 (trigger `camp`) →
// CS-05 (B1 defeated); town D-03 (Bakery Street cleared) → the Pilfer chase → CS-06 (post bag returned) → D-04 ×3
// (rescues) → CS-07 (trigger `steps`; results; the hub); gate: the yard dialogue on arrival → D-06 (war-wagon) →
// "Back to the Line" → The Line: CS-08 at 70% (after ≤ 2 enemies / no telegraph, ≤ 10 s), G-02 at 85%, the gate test at
// 100% → B2 → CS-09 → CS-10 (results; `town` hub, grey). The quest log follows the §19.7 flags (quest:update).
// Boss defeats start CS-05 / CS-09 / D-05; scenes of later milestones run as placeholders that apply their end state.
import { E } from '../core/events.js';
import { LEVEL_IDS, FADE_COLOR } from '../core/config.js';
import { Cutscene } from './Cutscene.js';
import { Overlay } from './Overlay.js';
import { Tutorial, PRACTICE, TUTORIAL_STEPS, setTimeoutish } from './tutorial.js';
import { BarkDirector } from './dialogue/barks.js';
import { EAGER, LAZY, SCENE_LEVEL, ALIASES, placeholderScene, loadScene } from './cutscenes/registry.js';
import { BARN, levelChest } from './cutscenes/cs01b.js';
import { buildSunPatch } from './cutscenes/rig.js';
import { G01_STATUE } from './cutscenes/g01.js';
import { t as tr, text as textOf } from './strings.js';
import { currentQuest, bossQuest, nextLevel, levelCards, entrySpawn } from './quests.js';
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
/**
 * The prologue director (WA §6.2): the height chart (Pearl waits there), the barn chest (fallback when the level has no
 * chest interactable), G-01's spot (fallback while world's `tallbert` trigger is still keyed to the old flags), and the
 * barn sunbeam's sparkle period. Radii in metres.
 */
export const PROLOGUE = Object.freeze({ chartR: PRACTICE.chartR, chestR: 2.2, g01: Object.freeze([0, -61]), g01R: 2.5, sparkleEvery: 1.6, bellSay: 3.0, pathStep: 0.3 });
/** Mochi cheers from his carrier when a foe within this many metres of it is bonked (WA §8.4), at most every `gap` s. */
export const MOCHI_CHEER = Object.freeze({ r: 16, gap: 2.0, n: 3 });
/** The prologue director runs every this many seconds of play. */
export const PROLOGUE_TICK = 0.1;
/**
 * The Suit Up guide (after CS-02 nothing else names the barn): `delay` s into the suit stage (after the cream fade)
 * Clem's own bubble says "First... armour." with the quest line and the ghost paw on the barn chest, and a trail of
 * `trail` gold sparkles runs from her to the chest, `trailStep` s apart; the trail repeats every `every` s while she is
 * still `farR` m or more from the chest.
 */
export const BARN_GUIDE = Object.freeze({ delay: 0.6, trail: 6, trailStep: 0.18, every: 7, farR: 5, idleDemo: 4 });

/**
 * Map pre-Phase-W prologue flags onto the new order (play first; WA §6.2). Old: CS-01 (night barn) set
 * `prologue.armour`, Midnight Practice set `prologue.tutorial`, CS-02 set `prologue.done`. New: `prologue.start`
 * (new adventure) → `.practice` → `.chart` (CS-01) → `.raid` (CS-02) → CS-01b sets armour / tutorial / done. Returns
 * the flags it set. Pure on a GameState-like object.
 * @returns {string[]}
 */
export function migrateFlags(st) {
  if (typeof st?.getFlag !== 'function' || typeof st?.setFlag !== 'function') return [];
  const f = (k) => !!st.getFlag(k), out = [];
  const set = (...ks) => { for (const k of ks) if (!f(k)) { st.setFlag(k, true); out.push(k); } };
  if (f('prologue.done')) set('prologue.start', 'prologue.practice', 'prologue.chart', 'prologue.raid');
  else if (f('prologue.tutorial')) set('prologue.start', 'prologue.practice', 'prologue.chart');   // old: practice done, CS-02 next
  else if (f('prologue.armour')) set('prologue.start');                                             // old: CS-01 seen, practice running
  return out;
}

/** The prologue stage of a save: 'title' | 'practice' | 'chart' | 'raid' | 'suit' | 'done'. Pure. */
export function prologueStage(st) {
  const f = (k) => !!st?.getFlag?.(k);
  if (f('prologue.done')) return 'done';
  if (f('prologue.raid')) return 'suit';
  if (f('prologue.chart')) return 'raid';
  if (f('prologue.practice')) return 'chart';
  if (f('prologue.start')) return 'practice';
  return 'title';
}

/** Is a fade colour black-ish (#000, #000000, black)? Story fades are cream (WA §2.7, core.W3). Pure. */
export function isBlack(c) {
  if (c == null) return false;
  const v = String(c).trim().toLowerCase();
  return v === 'black' || /^#0{3}(0{3})?$/.test(v) || /^#0{3}f$|^#0{6}ff$/.test(v);
}

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
      // WA §2.7: every story fade is cream, never black (a payload asking for black, or for no colour while fading in)
      let f = step.fade;
      if (f && typeof f === 'object' && (isBlack(f.to) || (f.to === undefined && (f.alpha ?? 1) > 0))) f = { ...f, to: FADE_COLOR };
      cmd.fade = f;
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
    /** every scene that can start this frame: the bundled ones, plus lazy ones once loaded (tests add their own) */
    this.registry = { ...EAGER };
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
    /** lazy scenes being loaded for a play() (PERF S1t); isPlaying stays true meanwhile */
    this._loading = new Set();
    /** the barn sunbeam set piece (Suit Up stage): { obj, off } */
    this.barn = null;
    this._raidAsked = false;
    this._cheer = { t: 0, n: 0 };
    this._directorT = 0;
    /** the boss whose fight is on (`boss:start` id): the objective pill names it until it is beaten / gone */
    this.bossId = null;
    /** the story step under a boss row (quest:update `done` follows the steps, not the boss row) */
    this._step = null;
    /** Suit Up guide state: seconds in the suit stage, shown, seconds to the next sparkle trail */
    this._barnGuide = { t: 0, on: false, trailT: 0 };
    this._chartTrailT = 0;          // s to the next height-chart sparkle trail (stage 'chart')
  }

  // ------------------------------------------------------------------ contract
  get isPlaying() { return !!this.current || this._loading.size > 0; }
  get playingId() { return this.current?.id ?? null; }
  /** M0 compatibility: the running scene's handle. */
  get playing() { return this.current; }
  get chapter() { return chapterOf(this.ctx.state, this.ctx.levels?.current?.id); }
  /** The prologue stage of this save (see prologueStage). */
  get stage() { return prologueStage(this.ctx.state); }

  async init() {
    const ctx = this.ctx, bus = ctx.bus, on = (ev, fn) => this._offs.push(bus.on(ev, fn));
    this.cinema.init();
    this.tutorial.init();
    this.barks.init();
    on(E.BOSS_DEFEATED, (p) => { this._bossQuest(null); const id = BOSS_SCENES[String(p?.id ?? '').replace(/^boss_/, '')]; if (id) this.play(id); });
    on(E.BOSS_START, (p) => this._bossQuest(p?.id ?? p?.boss?.def?.id ?? 'boss'));
    on(E.CUTSCENE_START, (p) => { if (p?.id === 'cs01b') this._barnGuideOff(); });
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
    on(E.LEVEL_LOADING, (p) => {
      this.barks.clear(); this.barnSet(false); this._barnGuideOff();
      this.bossId = null; if (this.quest?.boss) this.quest = null;
      this._prefetch(p?.id);
    });
    on(E.ENEMY_DIED, (p) => this._mochiCheer(p));
    // ?test: smoke blocks start any scene at any time, so every lazy scene is loaded up front there
    if (ctx.params?.test) for (const id of Object.keys(LAZY)) this._prefetchOne(id);
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
    let def = this.registry[id];
    if (!def && LAZY[id]) return this._playLazy(id);
    def ??= placeholderScene(id);
    // once-per-save scenes (the prologue beats, G-01): a second request (world trigger + director) is refused
    if (def.once && this.seen(id) && !this.ctx.params?.test) return Promise.resolve({ id, skipped: true, refused: true });
    return new Promise((resolve) => {
      const entry = { id, def, resolve };
      if (this.current && this.current.id === 'cs00' && id !== 'cs00') this.current.skip();
      if (this.current) { this.queue.push(entry); return; }
      this._start(entry);
    });
  }

  /** Load a lazy scene, then play it (isPlaying is true meanwhile so triggers wait). */
  _playLazy(id) {
    this._loading.add(id);
    return loadScene(id).then((def) => {
      this._loading.delete(id);
      if (def) this.registry[id] = def;
      return def ? this.play(id) : this._playMissing(id);
    });
  }

  _playMissing(id) { this.registry[id] = placeholderScene(id); return this.play(id); }

  /** Prefetch the scenes of a level that is loading (fire and forget). */
  _prefetch(levelId) {
    for (const id of SCENE_LEVEL[levelId] ?? []) this._prefetchOne(id);
  }

  /** Load one lazy scene into the registry (no-op when it is there already). */
  _prefetchOne(id) {
    if (this.registry[id]) return;
    loadScene(id).then((def) => { if (def && !this.registry[id]) this.registry[id] = def; });
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

  /**
   * Stop every scene for a hard context change (Quit to Title; the smoke harness between blocks): the queue is dropped
   * and the running scene is skipped as HALTED, so its end block still hands everything back but neither chains its
   * next scene (CS-09 `play: 'cs10'`) nor changes level. A plain skip() started CS-10 there, whose end load then landed
   * on the next level (the order-dependent smoke flake).
   */
  halt() {
    this.queue.length = 0;
    const cs = this.current;
    if (!cs) return;
    cs.halted = true;
    cs.skip();
  }

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
    this._raidAsked = false;
    if (p?.spawnId === 'title') { if (!this.current || this.current.id !== 'cs00') this.play('cs00'); return; }
    migrateFlags(ctx.state);
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
  titleBegin() { this.title = { active: true, t: 0, pressed: false, done: false, prompted: false, ready: false }; }

  /** CS-00 hook: the press prompt is up (`game.playReady` was true, PERF S2t). */
  titlePressReady() { this.title.ready = true; }

  /** CS-00's `until`: the title is over (new game / continue chosen). */
  get titleDone() { return this.title.done; }

  _endTitle() { this.title.active = false; this.title.done = true; this.cinema.apply({ title: null, press: false }); }

  _titleTick(dt) {
    const T = this.title;
    if (!T.active || T.pressed) return;
    T.t += dt;
    const pad = this.ctx.input?.anyActivity?.() && this.ctx.input.device === 'pad';
    // PERF S2t: the press counts once the prompt is up (CS-00 waits on game.playReady behind the logo)
    if (T.t < TITLE_ACCEPT_AFTER || T.ready === false) { this._gestureSeen = this._gestures; return; }
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
    if (st?.getFlag?.('prologue.start') || st?.getFlag?.('prologue.armour')) this.continueGame(); else this.newGame();
  }

  /** Wait `sec` real seconds (rendered frames; works in any mode). */
  _sleep(sec) {
    const g = this.ctx.game;
    if (!g?.addFrameHook) return new Promise((r) => setTimeout(r, sec * 1000));
    return new Promise((resolve) => { let t = 0; const off = g.addFrameHook((dt) => { t += dt; if (t >= sec) { off(); resolve(); } }); });
  }

  /** Start-of-adventure outfit: the tunic with the sword visible (characters' `tunic_sword` when the model has it). */
  practiceOutfit() {
    const p = this.ctx.player;
    const has = p?.hasOutfit?.('tunic_sword') ?? p?.outfits?.includes?.('tunic_sword') ?? p?.model?.outfits?.includes?.('tunic_sword');
    return has ? 'tunic_sword' : 'tunic';
  }

  /**
   * New adventure (§14.3, WA §6.3): reset progress (settings kept), flag `prologue.start`. On the title scene there is
   * no fade and no reload: CS-00 ends normally (the camera blends MEME_LOOP → follow over 1.1 s), she hops out of the
   * Oath pose in her practice tunic and Morning Practice starts right there (Pearl is already beside her). Anywhere else
   * a cream fade covers a load of the practice field. `skipPrologue` goes straight to Chapter 1.
   * @param {{ difficulty?: string, skipPrologue?: boolean }} [o]
   */
  async newGame({ difficulty = null, skipPrologue = false } = {}) {
    const ctx = this.ctx, st = ctx.state;
    const onTitle = !skipPrologue && this.current?.id === 'cs00' && this.levelId === 'meadow';
    if (!onTitle) {
      this.cinema.apply({ fade: { to: FADE_COLOR, alpha: 1, dur: 0.5 } });
      await this._sleep(0.55);
    }
    this.queue.length = 0;
    if (st) {
      const settings = { ...st.settings };
      st.reset({ settings, difficulty: difficulty ?? st.difficulty ?? 'knight' });
    }
    this.tutorial.reset();
    this._raidAsked = false;
    if (skipPrologue) {
      if (this.current?.id === 'cs00') this.current.skip();
      this._endTitle();
      this._despawnPearl();
      for (const k of ['prologue.start', 'prologue.practice', 'prologue.chart', 'prologue.raid', 'prologue.armour', 'prologue.tutorial', 'prologue.done']) this.flag(k, true);
      try { await ctx.levels.load('meadow', 'start'); } catch (e) { console.error('[story] new game load failed', e); }
      this.cinema.apply({ fade: { alpha: 0, dur: 0.8 } });
      this.chapterCard(1);
      ctx.bus.emit(E.SAVE_REQUEST, {});
      return;
    }
    this.flag('prologue.start', true);
    const outfit = this.practiceOutfit();
    if (onTitle) {
      this._endTitle();
      try { ctx.player?.setOutfit?.(outfit); } catch (e) { console.warn(e); }
      this.current?.finish?.(false);                               // the title loop ends normally: blend, no cut
      try { ctx.player?.play?.('hop', { once: true }); ctx.fx?.burst?.('sparkle', ctx.player, { count: 12, color: '#FFF1C4' }); } catch { /* optional */ }
      ctx.bus.emit(E.SAVE_REQUEST, {});
      return;
    }
    if (this.current?.id === 'cs00') this.current.skip();
    this._endTitle();
    try { await ctx.levels.load('meadow', 'practice'); } catch (e) { console.error('[story] new game load failed', e); }
    try { ctx.player?.setOutfit?.(outfit); } catch (e) { console.warn(e); }
    this.cinema.apply({ fade: { alpha: 0, dur: 0.8 } });
    ctx.bus.emit(E.SAVE_REQUEST, {});
  }

  /**
   * Continue the saved game: its level and spawn (`at` = ui's resume point). Old saves map their prologue flags
   * first (migrateFlags); a save still in the prologue resumes on the practice field, where the director picks the
   * next beat up. A save that never started an adventure starts one.
   * @param {{ levelId?: string, spawnId?: string }|null} [at]
   */
  async continueGame(at = null) {
    const ctx = this.ctx, st = ctx.state;
    migrateFlags(st);
    if (!st?.getFlag?.('prologue.start')) return this.newGame();
    this.cinema.apply({ fade: { to: FADE_COLOR, alpha: 1, dur: 0.5 } });
    await this._sleep(0.55);
    if (this.current?.id === 'cs00') this.current.skip();
    this._endTitle();
    const stage = prologueStage(st);
    if (stage !== 'practice' && stage !== 'chart') this._despawnPearl();
    let level = at?.levelId ?? st.levelId, spawn = at?.spawnId ?? st.spawnId ?? 'start';
    if (!LEVEL_IDS.includes(level)) level = 'meadow';
    if (stage !== 'done') { level = 'meadow'; if (spawn === 'title' || spawn === 'start') spawn = 'practice'; }
    if (spawn === 'title') spawn = 'start';
    try { await ctx.levels.load(level, spawn); } catch (e) { console.error('[story] continue failed', e); }
    if (stage === 'practice' || stage === 'chart' || stage === 'raid') { try { ctx.player?.setOutfit?.(st.getFlag?.('sticker.bow') ? 'tunic_bow' : this.practiceOutfit()); } catch { /* optional */ } }
    this.cinema.apply({ fade: { alpha: 0, dur: 0.8 } });
  }

  /** Pause → Quit to Title: drop every scene and go back to the title loop. */
  async toTitle() {
    this.halt();
    this.tutorial.reset();
    this.barnSet(false);
    try { await this.ctx.levels.load('meadow', 'title'); } catch (e) { console.error('[story] to title failed', e); }
  }

  /** The title / practice Pearl (an NPC) goes away (continue elsewhere, skip prologue). */
  _despawnPearl() {
    const c = this.ctx.companions;
    const a = (c?.actors ?? []).find?.((x) => x?.npcId === 'pearl');
    if (a) { try { c.despawn?.(a); } catch { /* gone */ } }
  }

  // ------------------------------------------------------------------ the prologue director (WA §6.2)
  /** One-time hint (Mochi's bubble once he is in the party, a toast before). See Tutorial.hint. */
  hint(key, o) { return this.tutorial.hint(key, o); }

  /**
   * P8 (ON §4.2): practice is over. The Sunbell rings far away, Pearl says "The bell! It's measuring time! Come ON!"
   * and runs ahead to the height chart along a little trail of sparkles; CS-01 plays when Clem reaches it. Until then
   * the director repeats a sparkle trail from Clem to the chart every BARN_GUIDE.every s while she is far from it.
   * @param {{ dots?: { n: number, of: number, half?: boolean } }} [o] `dots`: the paw dots to show (the lessons really
   *   done when practice was skipped; all of them by default)
   */
  toChart({ dots = null } = {}) {
    const ctx = this.ctx;
    const stepDots = dots ? { n: dots.n, of: dots.of, half: false } : { n: TUTORIAL_STEPS.length, of: TUTORIAL_STEPS.length, half: false };
    ctx.bus.emit(E.PROMPT, { kind: 'tutorial', id: 'tutorial', action: null, hold: 0, textKey: null, step: 'bell', total: PRACTICE.chartPath.length, progress: 1, done: false, speaker: 'pearl', say: 'pearl.bell', stepDots });
    this._chartTrailT = BARN_GUIDE.every;                            // the one-shot path trail below covers the first beat
    setTimeoutish(ctx, PROLOGUE.bellSay, () => ctx.bus.emit(E.PROMPT, { kind: 'tutorial', id: 'tutorial', action: null, hold: 0, textKey: null, step: 'bell', total: 0, progress: 1, done: true, speaker: 'pearl' }));
    try { ctx.audio?.bell?.({ strikes: 1, volume: 0.55 }); } catch { /* audio optional */ }
    const pearl = (ctx.companions?.actors ?? []).find?.((a) => a?.npcId === 'pearl') ?? null;
    const path = PRACTICE.chartPath;
    path.forEach(([x, z], i) => setTimeoutish(ctx, 0.2 + i * PROLOGUE.pathStep, () => {
      const y = ctx.physics?.heightAt?.(x, z) ?? ctx.player?.pos?.y ?? 0;
      try { ctx.fx?.burst?.('sparkle', { x, y: y + 0.2, z }, { count: 6, color: '#FFD57A' }); } catch { /* fx optional */ }
    }));
    if (pearl?.moveTo) {
      pearl.setScripted?.(true);
      let p = Promise.resolve();
      for (const pt of path) p = p.then(() => pearl.moveTo(pt, PRACTICE.pearl.speed));
      p.then(() => { try { pearl.face?.(ctx.player ?? 0, 0.4); pearl.play?.('wave', { once: true }); } catch { /* gone */ } });
    }
  }

  /**
   * The barn set piece of the Suit Up stage: one warm sunbeam on the chest spot and a slow sparkle there (the chest
   * itself is world's interactable, or CS-01b's own prop). `barnSet(false)` removes it. Idempotent.
   */
  barnSet(on) {
    const ctx = this.ctx;
    if (!on) {
      if (!this.barn) return;
      try { this.barn.off?.(); this.barn.obj?.removeFromParent?.(); this.barn.obj?.userData?.dispose?.(); } catch (e) { console.warn(e); }
      this.barn = null;
      return;
    }
    if (this.barn || !ctx.scene || this.levelId !== 'meadow') return;
    const [x, z] = BARN.chest;
    const y = ctx.physics?.heightAt?.(x, z) ?? 0;
    let obj = null;
    try { obj = buildSunPatch(); obj.position.set(x, y + 0.05, z); ctx.scene.add(obj); } catch (e) { console.warn('[story] barn sunbeam failed', e); }
    let t = 0;
    const off = ctx.game?.addFrameHook?.((dt) => {
      if ((t += dt) < PROLOGUE.sparkleEvery) return;
      t = 0;
      try { ctx.fx?.burst?.('sparkle', { x, y: y + 0.5, z }, { count: 4, color: '#FFD57A' }); } catch { /* fx optional */ }
    }) ?? null;
    this.barn = { obj, off };
  }

  /** Per step in play: the next prologue beat by stage, flag and position (world triggers may also start them). */
  _prologueTick(dt) {
    const ctx = this.ctx, p = ctx.player, st = ctx.state;
    if (!p || this.levelId !== 'meadow' || this.current || this._loading.size || this.queue.length) return;
    if ((this._directorT -= dt) > 0) return;
    this._directorT = PROLOGUE_TICK;
    const stage = prologueStage(st), near = (xz, r) => Math.hypot(p.pos.x - xz[0], p.pos.z - xz[1]) <= r;
    if (stage === 'chart') {
      if (near(PRACTICE.chart, PROLOGUE.chartR) || near([PRACTICE.chart[0], PRACTICE.chart[1] + 1.3], PROLOGUE.chartR)) this.play('cs01');
      else this._chartGuideTick(PROLOGUE_TICK);
    }
    else if (stage === 'raid') { if (!this._raidAsked) { this._raidAsked = true; this.play('cs02'); } }
    else if (stage === 'suit') {
      this.barnSet(true);
      this._barnGuideTick(PROLOGUE_TICK);
      if (!levelChest(ctx) && near(BARN.chest, PROLOGUE.chestR)) this.play('cs01b');
    } else if (stage === 'done') {
      if (!this.seen('g01') && near(PROLOGUE.g01, PROLOGUE.g01R) && p.pos.z < G01_STATUE[1]) this.play('g01');
    }
  }

  /**
   * The Suit Up guide (the director calls it every PROLOGUE_TICK s in the suit stage): after BARN_GUIDE.delay, Clem's
   * bubble ("First... armour." + "Borrow armour from the barn!", the ghost paw on the chest), then a gold sparkle trail
   * from her to the chest every BARN_GUIDE.every s while she is still far from it.
   */
  _barnGuideTick(dt) {
    const ctx = this.ctx, G = this._barnGuide, p = ctx.player;
    G.t += dt;
    if (G.t < BARN_GUIDE.delay || !p) return;
    const [x, z] = BARN.chest;
    if (!G.on) {
      G.on = true; G.trailT = 0;
      const y = ctx.physics?.heightAt?.(x, z) ?? p.pos.y;
      ctx.bus.emit(E.PROMPT, { kind: 'tutorial', id: 'barn', action: null, hold: 0, textKey: 'quest.prologue.suit', step: 'barn', total: 0, progress: 0, done: false,
        speaker: 'swordcat', say: 'cs02.7', demo: 'tap', target: [x, y + 0.4, z], idleDemo: BARN_GUIDE.idleDemo });
    }
    if ((G.trailT -= dt) > 0) return;
    G.trailT = BARN_GUIDE.every;
    if (Math.hypot(p.pos.x - x, p.pos.z - z) < BARN_GUIDE.farR) return;
    this._sparkleTrail(p.pos.x, p.pos.z, x, z, BARN_GUIDE.trail, BARN_GUIDE.trailStep);
  }

  /**
   * The height-chart guide (stage 'chart', until CS-01 starts): every BARN_GUIDE.every s a gold sparkle trail runs
   * from Clem to the chart while she is farther than BARN_GUIDE.farR from it (the barn guide's trail, same cadence).
   */
  _chartGuideTick(dt) {
    const p = this.ctx.player;
    if (!p || (this._chartTrailT -= dt) > 0) return;
    this._chartTrailT = BARN_GUIDE.every;
    const [x, z] = PRACTICE.chart;
    if (Math.hypot(p.pos.x - x, p.pos.z - z) < BARN_GUIDE.farR) return;
    this._sparkleTrail(p.pos.x, p.pos.z, x, z, BARN_GUIDE.trail, BARN_GUIDE.trailStep);
  }

  /** Hide the Suit Up guide bubble (CS-01b starts, a level load). Idempotent. */
  _barnGuideOff() {
    const G = this._barnGuide;
    if (G.on) this.ctx.bus.emit(E.PROMPT, { kind: 'tutorial', id: 'barn', action: null, hold: 0, textKey: null, step: 'barn', total: 0, progress: 1, done: true, speaker: 'swordcat' });
    G.on = false; G.t = 0; G.trailT = 0;
  }

  /** `n` gold sparkles from (x0, z0) to (x1, z1), one every `step` s (the "this way" trail; fx bursts only). */
  _sparkleTrail(x0, z0, x1, z1, n, step) {
    const ctx = this.ctx;
    for (let i = 1; i <= n; i++) {
      const f = i / n, x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f;
      setTimeoutish(ctx, i * step, () => {
        const y = ctx.physics?.heightAt?.(x, z) ?? ctx.player?.pos?.y ?? 0;
        try { ctx.fx?.burst?.('sparkle', { x, y: y + 0.25, z }, { count: 5, color: '#FFD57A' }); } catch { /* fx optional */ }
      });
    }
    // requests/fx.md: a soft ground arrow toward the goal, once fx has one
    try { ctx.fx?.guideArrow?.({ x: x0, z: z0 }, { x: x1, z: z1 }, { dur: n * step + 1.5 }); } catch { /* fx optional */ }
  }

  /** Mochi cheers each bonk at his cart from inside the carrier (WA §8.4 `bark.mochi.cheer.*`). */
  _mochiCheer(e) {
    const ctx = this.ctx;
    if (this.levelId !== 'meadow' || ctx.state?.getFlag?.('meadow.mochi') || !e?.position) return;
    const now = this.tutorial._gameT ?? 0;
    if (now - this._cheer.t < MOCHI_CHEER.gap) return;
    const m = (ctx.companions?.actors ?? []).find?.((a) => a?.kittenId === 'mochi' && a.alive !== false);
    if (!m?.pos || Math.hypot(m.pos.x - e.position.x, m.pos.z - e.position.z) > MOCHI_CHEER.r) return;
    this._cheer.t = now;
    this._cheer.n = (this._cheer.n % MOCHI_CHEER.n) + 1;
    this.barks.say(m, `bark.mochi.cheer.${this._cheer.n}`, 'mochi', 1.8);
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

  /**
   * quest:update when the row on screen changes (`force`: re-announce, e.g. after a load). While a boss is up the row
   * is the boss goal (bossQuest); `done` is still sent for every story step that finishes, boss or not.
   */
  _questTick(force = false) {
    const step = currentQuest(this.ctx.state, this.levelId);
    const prevStep = this._step;
    this._step = step;
    if (prevStep && prevStep.id !== step.id) this.ctx.bus.emit(E.QUEST_UPDATE, { questId: prevStep.id, state: 'done', text: prevStep.text });
    const q = this.bossId ? bossQuest(this.bossId) : step;
    if (!force && this.quest?.id === q.id) return;
    this.quest = q;
    this.ctx.bus.emit(E.QUEST_UPDATE, { questId: q.id, state: q.id === 'done' ? 'done' : 'active', text: q.text, textKey: q.textKey });
  }

  /** A boss fight starts (`id`) or ends (null): the objective pill shows the boss goal meanwhile. */
  _bossQuest(id) {
    const next = id ? String(id).replace(/^boss_/, '') : null;
    if (next === this.bossId) return;
    this.bossId = next;
    this._questTick(true);
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
    // a boss that left without boss:defeated (an arena reset after a lost life, a despawn): back to the story step
    if (this.bossId && !cs) { const b = ctx.enemies?.boss; if (!b || b.alive === false) this._bossQuest(null); }
    if (cs) {
      this._skipHold(dt, cs);
      if (this.current === cs) cs.update(dt);
    } else if (mode === 'play' || mode === 'memecam') { this.tutorial.update(dt); if (!this.current) this._prologueTick(dt); }
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
    this.barnSet(false);
    this.tutorial.dispose();
    this.barks.dispose();
    this.cinema.dispose();
  }
}
