// src/ui/UI.js  (owner: ui) — the HTML overlay system (tech.md §15, GAME_DESIGN §14). Builds every screen into #ui
// (and the touch layer into #touch), listens to the bus, polls ctx.state for counters at 10 Hz and owns the game
// flow around menus: title → main menu → new game / continue, pause, game over, results, chapter cards.
//
// Contract (§19.3): `loading(on)`. Additive services other areas call (requests/ui.md):
//   showResults(payload) → Promise (world: levels.exit awaits it) · cinema (story's `host.cinema`: letterbox, hud,
//   apply(step), clear) · toast(text, {icon, key}) · hint(keyOrText | null, {step, total, sec}) · chapter(c) → Promise
//   · fade(f) → Promise · showTitle() · pause() / resume() · openVigil() · busy (a ui screen owns input)
//
// Modes: the ui freezes the world with game.pause(true) ('menu') for Pause / Vigil / Game over, with 'cutscene' for the
// title (when no CS-00 runs) and the results card; it hands back what it took. In `update(dt)` (fixed step) it reads
// input edges (menus, pause, results); `render(alpha, frameDt)` animates everything on real time.
import css from './ui.css?inline';
import fontsCss from './fonts.css?inline';
import { E } from '../core/events.js';
import { PLAYER } from '../core/config.js';
import { el, flag, setVar, hasDom } from './dom.js';
import { tx } from './text.js';
import { loadFonts } from './fonts.js';
import { Hud } from './hud.js';
import { Dialog } from './dialog.js';
import { Cinema } from './cinema.js';
import { Menus } from './menus.js';
import { Results } from './results.js';
import { Toasts } from './toasts.js';
import { Prompts } from './prompts.js';
import { ThreatArrows } from './threatArrows.js';
import { TouchControls } from './touch.js';

export const UI_TIMING = Object.freeze({ skipHold: 1.0, skipRingAfter: 0.12, pauseTap: 0.3, tutorialTap: 0.35, gameOverDelay: 1.4, vigilDelay: 0.9 });

export class UI {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = null; this.touchHost = null; this.style = null;
    /** @type {Hud|null} */ this.hud = null;
    /** @type {Dialog|null} */ this.dialog = null;
    /** @type {Cinema|null} */ this.overlay = null;
    /** @type {Menus|null} */ this.menus = null;
    /** @type {Results|null} */ this.results = null;
    /** @type {Toasts|null} */ this.toasts = null;
    /** @type {Prompts|null} */ this.prompts = null;
    /** @type {ThreatArrows|null} */ this.arrows = null;
    /** @type {TouchControls|null} */ this.touch = null;
    this.isLoading = false;
    this.csHidden = false;          // HUD hidden by a running cutscene (cutscene:start … end)
    this.meme = false; this.memeT = 0; this.memeCapShown = false;
    this.pauseHeld = 0; this.skipped = false;
    this.bootSave = null;           // { levelId, spawnId } of the save found at boot (Continue)
    this.resumePoint = null;        // set by Quit to Title
    this._timers = [];
    this._offs = [];
    this._modeTaken = null;         // the mode the ui switched away from (title / results)
    this.rand = ctx?.rng?.fork ? ctx.rng.fork('ui') : Math.random;
    this._licenses = null;
    /** requests/story.md: the features the ui draws (story's own fallback Overlay steps aside for each). */
    this.handles = Object.freeze({ dialog: true, cinema: true, prompt: true, skip: true, title: true, tutorial: true });
    /**
     * story → ui cinema commands (requests/story.md): `ctx.ui.cinema({ letterbox, hud, caption, title, chapter, fade,
     * press, clear, skip, skipText })` with strings already resolved. The function also carries the step-level api
     * (letterbox / hud / apply / clear / chapter / fade) for callers that hold it as `host.cinema`.
     */
    const self = this;
    this.cinema = Object.assign((cmd) => self._cinemaCmd(cmd), {
      letterbox: (on) => self.overlay?.letterbox(on),
      hud: (on) => self.overlay?.hud(on),
      apply: (step, cs, isEnd) => self.overlay?.apply(step, cs, isEnd),
      clear: () => self.overlay?.clear(),
      chapter: (c, o) => self.chapter(c, o),
      fade: (f) => self.fade(f),
    });
  }

  /** The new StoryManager (M1) owns hold-to-skip, the title press and the pause key during scenes; the M0 stub doesn't. */
  get storyDrives() { const s = this.ctx.story; return !!s && 'current' in s; }

  /** One story cinema command (see the constructor). */
  _cinemaCmd(cmd) {
    const o = this.overlay;
    if (!cmd || typeof cmd !== 'object' || !o) return;
    if ('letterbox' in cmd) o.letterbox(cmd.letterbox);
    if ('hud' in cmd) o.hud(cmd.hud);
    if ('caption' in cmd) o.setCaption(cmd.caption);
    if ('fade' in cmd) o.fade(cmd.fade);
    if ('chapter' in cmd) { if (cmd.chapter) o.showChapter(cmd.chapter, { sec: 6, sound: false }); else o.hideChapter(); }
    if ('title' in cmd) this._titleCmd(cmd.title);
    if ('press' in cmd) this._pressCmd(cmd.press);
    if ('skip' in cmd) o.skipProgress(+cmd.skip || 0, cmd.skipText ?? tx(this.ctx, 'prompt.skip'));
    if (cmd.clear) o.clear();
  }

  /** `title`: the CS-00 logo becomes the title screen; any other title is a cutscene title card. null hides both. */
  _titleCmd(t) {
    const o = this.overlay, m = this.menus;
    if (!t) {
      o.setTitle(null);
      if (m.titleActive) { m.closeAll(); this._giveBackMode(); }
      return;
    }
    const atTitle = !!this.ctx.story?.title?.active || this.ctx.levels?.current?.spawnId === 'title';
    if (t.logo !== false && atTitle) { if (!m.titleActive) this.showTitle({ fromStory: true }); return; }
    o.setTitle(typeof t === 'object' ? { text: t.text, sub: t.sub } : t);
  }

  /** `press`: the title's "Press any key / Tap to start" (text) or false. */
  _pressCmd(p) {
    const m = this.menus;
    if (!m.titleActive) return;
    m.setPress(p ? (typeof p === 'string' ? p : null) : false);
  }

  /** story: "Press any key" was pressed → the main menu (§14.3). */
  openMainMenu() { this.menus?.openMain(); }

  /** True while a ui screen owns input (title, menus, results). */
  get busy() { return !!(this.menus?.active || this.results?.open); }

  async init() {
    if (!hasDom()) return;
    const ctx = this.ctx;
    this.style = el('style', '', { attrs: { id: 'ui-style' }, text: `${fontsCss}\n${css}` });
    document.head.appendChild(this.style);
    this.root = document.getElementById('ui') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'ui' }));
    this.root.classList.add('ui-root');
    this.touchHost = document.getElementById('touch') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'touch' }));
    loadFonts((p) => ctx.assets.url(p)).catch(() => {});
    // boot save snapshot (Game loaded it into ctx.state before init; the boot level load overwrites levelId/spawnId)
    // (requests/save.md: hasSave() / summary(), not load(): a settings-only record must not offer Continue)
    if (!ctx.params?.test) {
      const sum = this.saveSummary();
      if (sum) this.bootSave = { levelId: sum.levelId ?? 'meadow', spawnId: sum.spawnId ?? 'start' };
    }
    // layers, back to front
    this.arrows = new ThreatArrows(ctx, this.root);
    this.hud = new Hud(ctx, this.root);
    this.prompts = new Prompts(ctx, this.root);
    this.toasts = new Toasts(this.hud.toastSlot, () => ctx.input?.device ?? 'kbm');
    this.dialog = new Dialog(ctx, this.root);
    this.overlay = new Cinema(ctx, this.root, { onHud: () => {}, rand: this.rand });
    this.results = new Results(ctx, this.root, { sfx: (id) => this.sfx(id), onClose: () => this._giveBackMode() });
    this.menus = new Menus(ctx, this.root, this);
    this.touch = new TouchControls(ctx, this.touchHost, this.root);
    this.overlay.loading(this.isLoading || !ctx.levels?.current);   // the boot veil until the first level is in
    this._subscribe();
    this._device(ctx.input?.device ?? 'kbm');
    if (ctx.cam && 'showLockMarker' in ctx.cam) ctx.cam.showLockMarker = false;   // the ui draws the reticle
  }

  _subscribe() {
    const ctx = this.ctx, bus = ctx.bus, on = (n, f) => this._offs.push(bus.on(n, f));
    const T = (k, v) => tx(ctx, k, v);
    on(E.TOAST, (p) => this.toast(p?.text ?? (p?.key ? T(p.key, p.vars) : ''), { icon: p?.icon, key: p?.key }));
    on(E.KITTEN_RESCUED, () => this.toast(T('toast.kitten', { n: Math.max(1, ctx.state?.kittens?.length ?? 1) }), { key: 'toast.kitten' }));
    on(E.ITEM_PICKUP, (p) => {
      if (p?.item === 'letter') this.toast(T('toast.letter', { title: T(`letter.${p.id}.title`) }), { key: 'toast.letter' });
      else if (p?.item === 'heartBell') this.toast(T('toast.heartbell'), { key: 'toast.heartbell' });
    });
    on(E.UNLOCK, (p) => {
      if (!p || (p.kind === 'cape' && p.id === 'memeWhite')) return;     // the Meme Cam trigger toasts that one itself
      const name = ctx.strings?.has?.(`${p.kind}.${p.id}`) ? T(`${p.kind}.${p.id}`) : titleCaseId(p.id);
      if (p.kind === 'skin') this.toast(T('toast.skin', { name }), { key: 'toast.skin' });
      else if (p.kind === 'cape') this.toast(T('toast.cape', { name }), { key: 'toast.cape' });
    });
    on(E.SHARD, (p) => this.toast(T('toast.shard', { n: p?.n ?? ctx.state?.shards ?? 1 }), { key: 'toast.shard' }));
    on(E.ITEM_STOLEN, (p) => this.toast(p?.item === 'milk' ? T('toast.stolenMilk') : T('toast.stolen', { n: p?.amount ?? 0 }), { key: 'toast.stolen' }));
    on(E.ITEM_RETURNED, () => this.toast(T('toast.returned'), { key: 'toast.returned' }));
    const doneObj = new Set();
    on(E.OBJECTIVE, (p) => { if (p?.done && !doneObj.has(p.id)) { doneObj.add(p.id); this.toast(T('toast.objective'), { key: 'toast.objective' }); } });
    on(E.CHECKPOINT, () => {
      this.toast(T('toast.checkpoint'), { key: 'toast.checkpoint' });
      if (!ctx.params?.test) this._after(UI_TIMING.vigilDelay, () => { if (!this.busy && ctx.game.mode === 'play') this.openVigil(); });
    });
    on(E.PLAYER_LIFE_LOST, (p) => {
      if (p?.gameOver) this._after(UI_TIMING.gameOverDelay, () => this.gameOver());
      else this.overlay.lifeLost(p?.lives ?? ctx.player?.lives ?? 0, { infinite: !!p?.infinite });
    });
    on(E.MEME_CAM, (p) => { this.meme = !!p?.on; this.memeT = 0; this.memeCapShown = false; if (!this.meme) this.overlay.memeCaption(null); });
    on(E.CUTSCENE_START, (p) => {
      if (p?.kind === 'dialog' || p?.kind === 'ambient') return;
      this.csHidden = true; this.skipped = false; this.pauseHeld = 0;
    });
    on(E.CUTSCENE_END, () => {
      this.csHidden = false;
      this.overlay.skipProgress(0);
      // §5.1: every cutscene ends with the letterbox off and the HUD restored (also when story drew its own overlay)
      this._after(0.05, () => {
        if (ctx.story?.isPlaying) return;
        this.overlay.letterbox(false); this.overlay.hud(true);
        this.overlay.setCaption(null); this.overlay.setTitle(null);
        if (!ctx.levels?.loading && this.overlay.fadeAlpha > 0) this.overlay.fade({ to: null, dur: 0.6 });
      });
    });
    on(E.LEVEL_LOADING, () => {
      if (this.menus.paused) { this.menus.popLayer('pause'); }
      this.toasts.clear();
      this.prompts.hint(null);
    });
    on(E.LEVEL_LOADED, (p) => {
      if (p?.spawnId === 'title' && !ctx.params?.test) this.showTitle();
      if (this.overlay.fadeAlpha > 0 && !ctx.story?.isPlaying) this.overlay.fade({ to: null, dur: 0.8 });
    });
    on(E.GAME_MODE, (p) => {
      // someone else un-paused (debug, smoke harness, story): close our pause-type screens
      if (p?.prev === 'menu' && p.mode !== 'menu' && this.menus.paused && !this._modeBusy) this.menus.popLayer('pause');
    });
    on(E.INPUT_DEVICE, (p) => this._device(p?.device));
  }

  _device(d) {
    if (!this.root) return;
    for (const k of ['kbm', 'pad', 'touch']) flag(this.root, `dev-${k}`, d === k);
  }

  /** Run `fn` after `sec` real seconds (render-clocked; cleared on dispose). */
  _after(sec, fn) { this._timers.push({ t: sec, fn }); }

  sfx(id) { try { this.ctx.audio?.play2D?.(id); } catch { /* audio optional */ } }

  // ------------------------------------------------------------------ contract + services
  /** Show / hide the loading veil (§19.3; LevelManager calls it around every load). */
  loading(on) {
    this.isLoading = !!on;
    this.overlay?.loading(on);
  }

  /** Results screen (§14.3); resolves when the player continues. world's `levels.exit` awaits it. */
  showResults(payload) {
    if (!this.results) return Promise.resolve();
    this._takeMode('cutscene');
    return this.results.show(payload);
  }

  /** Queue a toast (§14.3: queue of 3, 2.5 s each). */
  toast(text, opts = {}) { return this.toasts?.push(text, opts) ?? false; }

  /** Tutorial / instruction card (null hides). */
  hint(keyOrText, opts) { this.prompts?.hint(keyOrText, opts); }

  /** Chapter card (§14.3, 3.0 s); resolves when it has gone. */
  chapter(c, o) { return this.overlay ? this.overlay.showChapter(c, o) : Promise.resolve(); }

  /** Colour fade ({ to, dur } | 'black' | 'in' ...); resolves when done. */
  fade(f) { return this.overlay ? this.overlay.fade(f) : Promise.resolve(); }

  /** Title screen over the live CS-00 (§14.3). `fromStory`: CS-00 already timed the logo (no extra fade-in delay). */
  showTitle({ fromStory = false } = {}) {
    if (!this.menus) return;
    if (this.menus.paused) this._unfreeze();
    this.results?.close();
    this.menus.closeAll();
    this.menus.setTitle(true, { quick: fromStory });
    this.dialog?.close(true);
  }

  // ------------------------------------------------------------------ flows
  /** A started game exists (main menu "Continue", New Game's "Skip the prologue?"): save's live answer, else the boot snapshot. */
  hasSave() {
    if (this.resumePoint) return true;
    const sv = this.ctx.save;
    if (typeof sv?.hasSave === 'function') { try { return !!sv.hasSave(); } catch { /* fall through */ } }
    return !!this.bootSave;
  }

  /** save.summary() for the Continue card ({ levelId, kittens, playtime, ... }) or null. */
  saveSummary() {
    const sv = this.ctx.save;
    try {
      if (typeof sv?.summary === 'function') return sv.summary() ?? null;
      const d = sv?.load?.();
      return d && d.levelId ? { levelId: d.levelId, spawnId: d.spawnId, kittens: d.kittens?.length ?? 0, playtime: d.playtime ?? 0 } : null;
    } catch { return null; }
  }

  /** Pause menu (§14.3). */
  pause() {
    if (!this.menus || this.busy) return;
    this._freeze();
    this.menus.openPause();
  }

  resume() {
    if (!this.menus) return;
    this._modeBusy = true;
    this.menus.popLayer('pause');
    this._modeBusy = false;
    this.sfx('ui.bookClose');
    this._unfreeze();
  }

  openVigil() {
    if (!this.menus || this.busy) return;
    this._freeze();
    this.menus.openVigil();
  }

  vigilRest() {
    this.ctx.bus.emit(E.SAVE_REQUEST, { reason: 'vigil' });
    // the HUD's wax seal confirms a real write (save.lastSave); without that signal, say it with a toast
    if (!this.ctx.save || !('lastSave' in this.ctx.save)) this.toast(tx(this.ctx, 'toast.saved'), { key: 'toast.saved' });
    this.resume();
  }

  swapCompanion(id) {
    const c = this.ctx.companions;
    try { c?.setActive?.([id]); } catch (e) { console.warn('[ui] swap companion failed', e); }
    this.hud?.poll(true);
  }

  gameOver() {
    if (!this.menus) return;
    this.results?.close();
    this.menus.closeAll();
    this._freeze();
    this.menus.openGameOver();
  }

  retry() {
    const ctx = this.ctx;
    this._closeAndPlay();
    const lvl = ctx.levels?.current?.id ?? ctx.state?.levelId ?? 'meadow';
    const spawn = ctx.state?.levelId === lvl && ctx.state?.spawnId && ctx.state.spawnId !== 'title' ? ctx.state.spawnId : 'start';
    return ctx.levels?.load?.(lvl, spawn);
  }

  toHub() {
    this._closeAndPlay();
    return this.ctx.levels?.load?.('town', 'hub');
  }

  async quitToTitle() {
    const ctx = this.ctx, st = ctx.state;
    if (st?.levelId && st.spawnId !== 'title') this.resumePoint = { levelId: st.levelId, spawnId: st.spawnId };
    this.menus.closeAll();
    this._unfreeze();
    if (typeof ctx.story?.toTitle === 'function') await ctx.story.toTitle();
    else {
      if (ctx.story?.isPlaying) { try { ctx.story.skip(); } catch { /* ignore */ } }
      await ctx.levels?.load?.('meadow', 'title');
    }
    this.showTitle();
  }

  /** New Game (§14.3): story.newGame when it exists, else the prologue (CS-01 on the practice field). */
  async startNewGame({ difficulty = 'knight', skipPrologue = false } = {}) {
    const ctx = this.ctx, st = ctx.state, story = ctx.story;
    this.menus.closeAll();
    this._giveBackMode();
    this.resumePoint = null;
    if (typeof story?.newGame === 'function') { await story.newGame({ difficulty, skipPrologue }); return; }
    if (story?.isPlaying) { try { story.skip(); } catch { /* ignore */ } }
    const settings = JSON.parse(JSON.stringify(st?.settings ?? {}));
    st?.reset?.({ settings, difficulty });
    ctx.bus.emit(E.SETTINGS_CHANGED, { key: 'difficulty', value: difficulty });
    ctx.game.setMode('play');
    if (skipPrologue) {
      for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) story?.flag?.(k, true);
      await ctx.levels?.load?.('meadow', 'start');
    } else {
      await ctx.levels?.load?.('meadow', 'practice');
      story?.play?.('cs01');
    }
  }

  /** Continue (§14.3): the save's level and Vigil Stone (or where Quit to Title left off). */
  async continueGame() {
    const ctx = this.ctx, story = ctx.story;
    const sum = this.resumePoint ? null : this.saveSummary();
    const at = this.resumePoint ?? (sum?.levelId ? { levelId: sum.levelId, spawnId: sum.spawnId ?? 'start' } : null) ?? this.bootSave
      ?? { levelId: ctx.state?.levelId ?? 'meadow', spawnId: 'start' };
    this.menus.closeAll();
    this._giveBackMode();
    if (typeof story?.continueGame === 'function') {
      if (ctx.state && at.levelId) { ctx.state.levelId = at.levelId; ctx.state.spawnId = at.spawnId ?? 'start'; }   // the boot load wrote meadow/title over it
      await story.continueGame(at);
      return;
    }
    if (story?.isPlaying) { try { story.skip(); } catch { /* ignore */ } }
    ctx.game.setMode('play');
    await ctx.levels?.load?.(at.levelId, at.spawnId && at.spawnId !== 'title' ? at.spawnId : 'start');
  }

  /** LICENSES.md text for the credits (cached). */
  licenses() {
    if (!this._licenses) {
      const url = this.ctx.assets?.url?.('LICENSES.md');
      this._licenses = typeof fetch === 'function' && url ? fetch(url).then((r) => (r.ok ? r.text() : '')).catch(() => '') : Promise.resolve('');
    }
    return this._licenses;
  }

  _closeAndPlay() {
    this.menus.closeAll();
    this._unfreeze();
    if (this.ctx.game.mode === 'menu') this.ctx.game.setMode('play');
  }

  /** Freeze the world for a pause-type screen (game.pause → mode 'menu'). */
  _freeze() { const g = this.ctx.game; if (g.mode !== 'menu') { this._modeBusy = true; g.pause(true); this._modeBusy = false; } }

  _unfreeze() { const g = this.ctx.game; if (g.mode === 'menu') { this._modeBusy = true; g.pause(false); this._modeBusy = false; } }

  /** Title / results: hold the world still with 'cutscene' (no menu audio duck), remembering what to give back. */
  _takeMode(mode) {
    const g = this.ctx.game;
    if (g.mode === 'play' || g.mode === 'memecam') { this._modeTaken = g.mode === 'memecam' ? 'play' : g.mode; g.setMode(mode); }
  }

  _giveBackMode() {
    const g = this.ctx.game;
    if (this._modeTaken && g.mode === 'cutscene' && !this.ctx.story?.isPlaying) g.setMode(this._modeTaken);
    this._modeTaken = null;
  }

  // ------------------------------------------------------------------ fixed step: input
  update(dt) {
    if (!this.root) return;
    const ctx = this.ctx, input = ctx.input, mode = ctx.game.mode, story = ctx.story;
    if (this.results.open) { this.results.update(dt, input); return; }
    if (this.menus.active) { this.menus.update(input, dt); return; }
    if (!input || ctx.levels?.loading) return;
    if (mode === 'cutscene' || mode === 'dialog') {
      // requests/story.md: while a scene runs, Esc / Start belongs to story (hold = skip); never pause on it
      if (story?.isPlaying && this.storyDrives) return;
      if (mode === 'cutscene') {                       // M0 stub: tap = pause, hold = the ui's own skip ring
        if (input.released('pause')) {
          if (!this.skipped && this.pauseHeld > 0 && this.pauseHeld < UI_TIMING.pauseTap && story?.isPlaying) this.pause();
          this.pauseHeld = 0; this.skipped = false;
        }
        return;
      }
    }
    if (mode !== 'play' && mode !== 'memecam' && mode !== 'dialog') return;
    // Midnight Practice: a 1 s hold skips the tutorial, so pause opens on the release of a short press
    if (story?.tutorial?.active) {
      if (input.released('pause') && input.heldTime('pause') < UI_TIMING.tutorialTap) this.pause();
    } else if (input.pressed('pause')) this.pause();
  }

  // ------------------------------------------------------------------ per frame
  render(alpha, frameDt) {
    if (!this.root) return;
    const ctx = this.ctx, g = ctx.game, mode = g.mode, input = ctx.input;
    const dt = Math.min(0.1, Math.max(0, frameDt || 0));
    // timers
    for (let i = this._timers.length - 1; i >= 0; i--) { const t = this._timers[i]; if ((t.t -= dt) <= 0) { this._timers.splice(i, 1); try { t.fn(); } catch (e) { console.error('[ui] timer', e); } } }
    // the title holds the world still when nothing else does (CS-00 runs in 'cutscene' itself)
    if (this.menus.titleActive && mode === 'play' && !this.isLoading) this._takeMode('cutscene');
    // hold-to-skip (§5.1: hold Pause 1.0 s; a ring fills in the corner) — story drives it itself (cinema {skip})
    if (!this.storyDrives) this._skipHold(dt, mode, input);
    // meme caption (§7.8 step 4: after 1.0 s, one of meme.cap1–3)
    if (this.meme) {
      this.memeT += dt;
      if (!this.memeCapShown && this.memeT >= PLAYER.memeCam.captionDelay) {
        this.memeCapShown = true;
        this.overlay.memeCaption(tx(ctx, `meme.cap${1 + Math.floor(this.rand() * 3)}`));
      }
    }
    const title = this.menus.titleActive;
    const hudOn = !title && !this.isLoading && this.overlay.hudOn && !this.csHidden && mode !== 'cutscene' && !this.results.open;
    this.hud.setVisible(hudOn);
    if (this.hud.meme !== this.meme) this.hud.setMeme(this.meme);
    flag(this.root, 'is-meme', this.meme);
    flag(this.root, 'is-title', title);
    setVar(this.root, '--sub', (ctx.state?.settings?.subtitleSize ?? 1).toFixed(2));
    this.hud.render(dt);
    this.dialog.render(dt);
    this.overlay.render(dt);
    this.toasts.render(dt);
    const world = hudOn && !this.meme && (mode === 'play' || mode === 'memecam') && !this.menus.active;
    this.prompts.render(dt, { world, hint: hudOn && !this.meme });
    this.arrows.render(dt, world);
    this.results.render(dt);
    this.menus.render(dt);
    this.menus.scrollCredits(dt);
    this.touch.render(dt, { play: world && !this.dialog.visible, any: !title && !this.isLoading && !this.results.open && !this.menus.active });
  }

  _skipHold(dt, mode, input) {
    const story = this.ctx.story;
    if (mode !== 'cutscene' || !story?.isPlaying || this.menus.active || this.results.open || !input) {
      if (this.pauseHeld > 0 && !input?.down?.('pause')) this.pauseHeld = 0;
      this.overlay.skipProgress(0);
      return;
    }
    if (input.down('pause')) {
      this.pauseHeld += dt;
      const can = storyCanSkip(story);
      if (can && !this.skipped && this.pauseHeld >= UI_TIMING.skipRingAfter) {
        this.overlay.skipProgress(Math.min(1, this.pauseHeld / UI_TIMING.skipHold), tx(this.ctx, 'prompt.skip'));
        if (this.pauseHeld >= UI_TIMING.skipHold) {
          this.skipped = true;
          this.overlay.skipProgress(0);
          try { story.skip(); } catch (e) { console.warn('[ui] skip failed', e); }
        }
      }
    } else this.overlay.skipProgress(0);
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    this._timers.length = 0;
    for (const m of [this.touch, this.menus, this.results, this.overlay, this.dialog, this.prompts, this.arrows, this.hud]) { try { m?.dispose(); } catch (e) { console.warn('[ui] dispose', e); } }
    this.toasts?.clear();
    this.style?.remove();
    if (this.root) for (const k of ['ui-root', 'is-meme', 'is-title', 'dev-kbm', 'dev-pad', 'dev-touch']) this.root.classList.remove(k);
    this.hud = this.dialog = this.overlay = this.menus = this.results = this.toasts = this.prompts = this.arrows = this.touch = null;
    this.root = null;
  }
}

/** May the running cutscene be hold-skipped? (story's `canSkip` when it exposes one; the M0 stub always can.) */
export function storyCanSkip(story) {
  if (!story) return false;
  if (typeof story.canSkip === 'boolean') return story.canSkip;
  if (typeof story.canSkip === 'function') return !!story.canSkip();
  const cur = story.current ?? story.cutscene ?? story.active ?? null;
  if (cur && typeof cur.canSkip === 'boolean') return cur.canSkip;
  return true;
}

function titleCaseId(id) { return String(id ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
