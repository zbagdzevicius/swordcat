// src/ui/UI.js  (owner: ui) — the HTML overlay system (tech.md §15, GAME_DESIGN §14). Builds every screen into #ui
// (and the touch layer into #touch), listens to the bus, polls ctx.state for counters at 10 Hz and owns the game
// flow around menus: title → main menu → new game / continue, pause, game over, results, chapter cards.
//
// Contract (§19.3): `loading(on)`. Additive services other areas call (requests/ui.md):
//   showResults(payload) → Promise (world: levels.exit awaits it) · cinema (story's `host.cinema`: letterbox, hud,
//   apply(step), clear) · toast(text, {icon, key}) · hint(keyOrText | null, {step, total, sec}) · chapter(c) → Promise
//   · fade(f) → Promise · showTitle() · pause() / resume() · openVigil() · busy (a ui screen owns input)
// IMPLEMENTATION_PLAN §7.2 (warm / perf / auto-camera phase): flash(color, alpha, dur) (ART §9.1 `#ui-flash`; presets
//   hurt / rescue / card / storm) · screenOccluders() → { version, rects } and safeArea (AUTOCAM §7.1) · thumbs (live
//   joystick / held-button state, read-only) · celebrate(kind, id, vars) (WA §5.4) · offerKitten({ speaker }) → Promise
//   (WA §6.3) · touch.reveal(...) (WA §7.5). The splash (`#splash`, PERF §10.1) fades out on game:ready.
//
// Modes: the ui freezes the world with game.pause(true) ('menu') for Pause / Vigil / Game over, with 'cutscene' for the
// title (when no CS-00 runs) and the results card; it hands back what it took. In `update(dt)` (fixed step) it reads
// input edges (menus, pause, results); `render(alpha, frameDt)` animates everything on real time.
import css from './ui.css?inline';
import fontsCss from './fonts.css?inline';
import { E } from '../core/events.js';
import { PLAYER, KO } from '../core/config.js';
import { el, flag, setVar, hasDom } from './dom.js';
import { tx, UI_STRINGS, toastText } from './text.js';
import { loadFonts } from './fonts.js';
import { Hud } from './hud.js';
import { Dialog } from './dialog.js';
import { Cinema } from './cinema.js';
import { Menus } from './menus.js';
import { Results } from './results.js';
import { Toasts } from './toasts.js';
import { Prompts, hintLayerOn } from './prompts.js';
import { inPractice, revealShow } from './reveal.js';
import { ThreatArrows } from './threatArrows.js';
import { Beacon } from './beacon.js';
import { TouchControls, LESSON_BUTTONS } from './touch.js';
import { AbilityBar } from './abilityBar.js';
import { CursorController } from './cursor.js';
import { HpBars } from './hpBars.js';
import { applySetting } from './settings.js';
import { TouchLayoutEditor } from './touchEditor.js';
// PERF §10.2 / C16 (requests/ui.md): the hub panels are their own chunk, loaded on first use (and prefetched when the
// hub level loads), so the boot shell does not carry the shops, their art or the Quest Board.
const HUB_LEVEL = 'town';
let _hubMods = null;
/** @returns {Promise<[typeof import('./shops.js'), typeof import('./questBoard.js')]>} */
const loadHubPanels = () => (_hubMods ??= Promise.all([import('./shops.js'), import('./questBoard.js')]).catch((e) => { _hubMods = null; throw e; }));
import { ScreenLayers } from './layers.js';
import { Occluders } from './occluders.js';
import { Celebrate } from './celebrate.js';
import { KittenOffer } from './offer.js';
import { FlyIcons } from './flyIcons.js';

export const UI_TIMING = Object.freeze({ skipHold: 1.0, skipRingAfter: 0.12, pauseTap: 0.3, tutorialTap: 0.35, gameOverDelay: 1.4, vigilDelay: 0.9, splashOut: 0.45 });

/** WA §5.7 knock-out timings the ui keys its cream wipe on (config KO; player owns them). */
const KO_T = { sitT: KO?.sitT ?? 1.2, wipeT: KO?.wipeT ?? 0.35 };

/** The read-only snapshot screenOccluders() returns before the DOM exists (node, tests). */
const NO_OCCLUDERS = Object.freeze({ version: 0, rects: Object.freeze([]) });

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
    /** @type {Beacon|null} the "where next" objective beacon (review: wayfinding) */ this.beacon = null;
    /** @type {TouchControls|null} */ this.touch = null;
    this.isLoading = false;
    this.csHidden = false;          // HUD hidden by a running cutscene (cutscene:start … end)
    this.inScene = false;           // any non-ambient scene is running (dialogue scenes too): hints / tips stay hidden
    this.meme = false; this.memeT = 0; this.memeCapShown = false;
    this.pauseHeld = 0; this.skipped = false;
    this.bootSave = null;           // { levelId, spawnId } of the save found at boot (Continue)
    this.resumePoint = null;        // set by Quit to Title
    this._timers = [];
    this._offs = [];
    this._modeTaken = null;         // the mode the ui switched away from (title / results)
    this.rand = ctx?.rng?.fork ? ctx.rng.fork('ui') : Math.random;
    this._licenses = null;
    /** ART §9.1 #ui-vignette / #ui-flash */ this.layers = null;
    /** AUTOCAM §7.1 SafeFrame inputs */ this.occluders = null;
    /** WA §5.4 */ this.celebrations = null;
    /** WA §6.3 */ this.offer = null;
    /** WA §5.5 fly-to-HUD */ this.fly = null;
    /** WA §7.5 / §4.1 progressive reveal (reveal.js `revealShow`; 10 Hz): what the bar / HUD / cluster may show */ this.reveal = null;
    this._lastUnlocked = 'free';
    /** requests/story.md: the features the ui draws (story's own fallback Overlay steps aside for each). */
    this.handles = Object.freeze({ dialog: true, cinema: true, prompt: true, skip: true, title: true, tutorial: true, reward: true });
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

  /** True while a ui screen owns input (title, menus, results, the touch layout editor). */
  get busy() { return !!(this.menus?.active || this.results?.open || this.touchEditor); }

  async init() {
    if (!hasDom()) return;
    const ctx = this.ctx;
    this.style = el('style', '', { attrs: { id: 'ui-style' }, text: `${fontsCss}\n${css}` });
    document.head.appendChild(this.style);
    this.root = document.getElementById('ui') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'ui' }));
    this.root.classList.add('ui-root');
    // §9.1: the HUD cards take their own clicks now (ui.css), so a right-click on one must not open the browser menu
    this._noMenu = (e) => { if (!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '')) e.preventDefault(); };
    this.root.addEventListener('contextmenu', this._noMenu);
    this.touchHost = document.getElementById('touch') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'touch' }));
    loadFonts((p) => ctx.assets.url(p)).catch(() => {});
    // boot save snapshot (Game loaded it into ctx.state before init; the boot level load overwrites levelId/spawnId)
    // (requests/save.md: hasSave() / summary(), not load(): a settings-only record must not offer Continue)
    if (!ctx.params?.test) {
      const sum = this.saveSummary();
      if (sum) this.bootSave = { levelId: sum.levelId ?? 'meadow', spawnId: sum.spawnId ?? 'start' };
    }
    // layers, back to front (the vignette + flash first: the HUD paints over them)
    this.layers = new ScreenLayers(ctx, this.root);
    this.beacon = new Beacon(ctx, this.root);         // under the threat arrows: a threat always paints over the way
    this.arrows = new ThreatArrows(ctx, this.root);
    this.hud = new Hud(ctx, this.root);
    /** CONTROLS_SPEC §10.4 / §10.5: enemy HP pills and the Grit arc (iso) */
    // (in their own layer under #touch: a pill never covers a touch button, the menus / dialog still cover the pills)
    this.worldHost = document.getElementById('ui-world') ?? (() => {
      const d = Object.assign(document.createElement('div'), { id: 'ui-world' });
      d.style.cssText = 'position:fixed;inset:0;z-index:4;pointer-events:none;';
      document.body.insertBefore(d, this.touchHost);
      return d;
    })();
    this.hpBars = new HpBars(ctx, this.worldHost);
    /** §10.2 context cursors */
    this.cursor = new CursorController(ctx);
    /** CONTROLS_SPEC §10.1: the desktop / pad ability bar (the touch cluster shows the same states) */
    this.bar = new AbilityBar(ctx, this.root);
    this.prompts = new Prompts(ctx, this.root);
    this.toasts = new Toasts(this.hud.toastSlot, () => ctx.input?.device ?? 'kbm', () => ctx.input ?? null);
    this.dialog = new Dialog(ctx, this.root);
    this.overlay = new Cinema(ctx, this.root, { onHud: () => {}, rand: this.rand });
    this.results = new Results(ctx, this.root, { sfx: (id, o) => this.sfx(id, o), onClose: () => this._giveBackMode() });
    this.celebrations = new Celebrate(ctx, this.root, this);
    this.offer = new KittenOffer(ctx, this.root, this);
    this.fly = new FlyIcons(ctx, this.root, (k) => this.homeRect(k), (k) => this.bumpHome(k));
    this.menus = new Menus(ctx, this.root, this);
    this.touch = new TouchControls(ctx, this.touchHost, this.root);
    this.occluders = new Occluders(this);
    this._onResize = () => this.occluders?.invalidate();
    window.addEventListener('resize', this._onResize);
    this.overlay.loading(this.isLoading || !ctx.levels?.current);   // the boot veil until the first level is in
    this._subscribe();
    this._device(ctx.input?.device ?? 'kbm');
    if (ctx.cam && 'showLockMarker' in ctx.cam) ctx.cam.showLockMarker = false;   // the ui draws the reticle
  }

  _subscribe() {
    const ctx = this.ctx, bus = ctx.bus, on = (n, f) => this._offs.push(bus.on(n, f));
    // AUTOCAM §10.4 / X19: settings.camLockMode ('locked' | 'semi' | 'free'; the retired boolean camLock kept in sync)
    // ↔ the camera's lock (Y toggles it in play; the setting persists it)
    on(E.SETTINGS_CHANGED, (p) => {
      if (p?.key === 'camLockMode' && p.source !== 'camera') this._applyLockMode(p.value);
      else if (p?.key === 'camLock' && ctx.cam?.setCamLock && ctx.cam.camLocked !== !!p.value) ctx.cam.setCamLock(!!p.value, false);
      if (p?.key === 'touchSize' || p?.key === 'leftHanded' || p?.key === 'touchLayout' || p?.key === 'hudMode') this.occluders?.invalidate();
    });
    { const m = ctx.state?.settings?.camLockMode; if (m && m !== 'locked') this._applyLockMode(m); else if (ctx.state?.settings?.camLock === false) ctx.cam?.setCamLock?.(false, false); }
    const T = (k, v) => tx(ctx, k, v);
    on(E.TOAST, (p) => this.toast(toastText(ctx, p), { icon: p?.icon, key: p?.key }));
    // WA §5.4: kitten rescues, Heart Bells and shards are celebration cards now (celebrate.js); letters stay toasts.
    // WA §5.5: a fish (heart, milk) picked up in the world flies to its HUD counter.
    on(E.ITEM_PICKUP, (p) => {
      if (p?.item === 'letter') this.toast(T('toast.letter', { title: T(`letter.${p.id}.title`) }), { key: 'toast.letter' });
      else if (p?.position && (p.item === 'fish' || p.item === 'smallHeart' || p.item === 'milk')) this.fly?.launch(p.item, p.position, p.item === 'fish' ? 'fish' : p.item === 'milk' ? 'milk' : 'hearts');
    });
    on(E.GAME_READY, () => this._splashOut());
    // WA §7.5: during Morning Practice the touch buttons appear lesson by lesson (visibility only)
    on(E.PROMPT, (p) => this._lesson(p));
    on(E.LEVEL_LOADING, () => { if (this.touch?.veiled) this.touch.veil(null); this._taught = null; });
    on(E.DIALOG_START, () => this.occluders?.invalidate());
    on(E.DIALOG_END, () => this.occluders?.invalidate());
    on(E.UNLOCK, (p) => {
      if (!p || (p.kind === 'cape' && p.id === 'memeWhite')) return;     // the Meme Cam trigger toasts that one itself
      const name = ctx.strings?.has?.(`${p.kind}.${p.id}`) ? T(`${p.kind}.${p.id}`) : UI_STRINGS[`ui.${p.kind}.${p.id}`] ? T(`ui.${p.kind}.${p.id}`) : titleCaseId(p.id);
      if (p.kind === 'skin') this.toast(T('toast.skin', { name }), { key: 'toast.skin' });
      else if (p.kind === 'cape') this.toast(T('toast.cape', { name }), { key: 'toast.cape' });
    });
    on(E.ITEM_STOLEN, (p) => this.toast(p?.item === 'milk' ? T('toast.stolenMilk') : T('toast.stolen', { n: p?.amount ?? 0 }), { key: 'toast.stolen' }));
    on(E.ITEM_RETURNED, () => this.toast(T('toast.returned'), { key: 'toast.returned' }));
    const doneObj = new Set();
    // the HUD objective bar already flashes "Objective complete!"; toast only when no bar can show it (no double toast)
    on(E.OBJECTIVE, (p) => { if (p?.done && !doneObj.has(p.id)) { doneObj.add(p.id); if (!this.hud?.objEl) this.toast(T('toast.objective'), { key: 'toast.objective' }); } });
    on(E.CHECKPOINT, () => {
      this.toast(T('toast.checkpoint'), { key: 'toast.checkpoint' });
      if (!ctx.params?.test) this._after(UI_TIMING.vigilDelay, () => { if (!this.busy && ctx.game.mode === 'play') this.openVigil(); });
    });
    on(E.PLAYER_LIFE_LOST, (p) => {
      if (p?.gameOver) this._after(UI_TIMING.gameOverDelay, () => this.gameOver());
      else this._knockOut(p);
    });
    on(E.MEME_CAM, (p) => { this.meme = !!p?.on; this.memeT = 0; this.memeCapShown = false; if (!this.meme) this.overlay.memeCaption(null); });
    on(E.CUTSCENE_START, (p) => {
      // any scene but an ambient bark hides the hint / prompt layers (dialogue scenes keep the HUD, not the tips)
      if (p?.kind !== 'ambient') this.inScene = true;
      if (p?.kind === 'dialog' || p?.kind === 'ambient') return;
      this.csHidden = true; this.skipped = false; this.pauseHeld = 0;
    });
    on(E.CUTSCENE_END, () => {
      this.csHidden = false; this.inScene = false;
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
    on(E.INPUT_DEVICE, (p) => { this._device(p?.device); this.occluders?.invalidate(); });
    // hub stations (§12.5): world's interactables of kind 'shop' / 'board' (or the station ids themselves) open the
    // panels. world may also call ui.openShop / openQuestBoard from its own use(); the second call is a no-op.
    on(E.INTERACT, (p) => this._onInteract(p?.target));
    on(E.LEVEL_LOADED, (p) => {
      this._levelStart = { id: p?.id, rec: { ...(ctx.state?.levels?.[p?.id] ?? {}) } };
      if (p?.id === HUB_LEVEL) loadHubPanels().catch(() => { /* retried on first use */ });   // prefetch, no hitch on first open
    });
  }

  _onInteract(t) {
    if (!t || this.busy) return;
    const kind = String(t.kind ?? '').toLowerCase();
    if (/^(board|questboard|quest_board|quest)$/.test(kind) || /quest.?board/i.test(String(t.id ?? ''))) { this.openQuestBoard(); return; }
    if (/^(shop|station|stall|banner|barracks|lookout)$/.test(kind)) this.openShop(t.station ?? t.id, kind);
  }

  _device(d) {
    if (!this.root) return;
    for (const k of ['kbm', 'pad', 'touch']) flag(this.root, `dev-${k}`, d === k);
  }

  /**
   * WA §5.7 "dizzy sit, boing back": she sits dizzy for KO.sitT s (player / fx), then a cream wipe (KO.wipeT s) covers the
   * respawn, then it clears and the toast `life.*` and the lives-badge pop (hud.js) land. No card, no ghost, no grey.
   */
  _knockOut(p) {
    const ctx = this.ctx;
    const text = this.overlay?.lifeLostText(p?.lives ?? ctx.player?.lives ?? 0, { infinite: !!p?.infinite }) ?? '';
    // the player owns the wipe (it calls ui.fade at KO.sitT and clears it on the respawn, on game time); the ui only
    // draws it itself when no player drives a knock-out (old builds, harness events)
    const playerWipes = typeof ctx.player?.koTick === 'function';
    this._after(KO_T.sitT, () => {
      if (ctx.levels?.loading || ctx.story?.isPlaying) return;
      if (!playerWipes) this.overlay?.fade({ to: 'cream', alpha: 1, dur: KO_T.wipeT });
      this._after(KO_T.wipeT, () => {
        if (!playerWipes && !ctx.levels?.loading) this.overlay?.fade({ to: null, dur: 0.35 });
        if (text) this.toast(text, { key: 'life.lost', icon: 'heart' });
      });
    });
  }

  /**
   * WA §7.5 progressive reveal: the first guided practice prompt veils the lesson buttons not taught yet; each step's
   * `action` reveals its button (pop + 3-ring pulse). Lifted when practice is over (prologue flags, a load, or 3 s with
   * no guide bubble and no running tutorial).
   */
  _lesson(p) {
    const tc = this.touch, st = this.ctx.state;
    if (!p?.speaker) return;
    if (st?.getFlag?.('prologue.tutorial') || st?.getFlag?.('prologue.done')) { if (tc?.veiled) tc.veil(null); return; }
    // the taught list drives the desktop / pad bar and the HUD too (reveal.js), so it is kept without a touch cluster
    this._taught ??= [];
    // a re-veil (after the 3 s idle lift) keeps what was already taught: resetting it re-hid the current lesson's button
    if (tc && !tc.veiled) tc.veil(this._taught);
    const a = p.action === 'chargeRelease' ? 'attack' : p.action;
    if (a && LESSON_BUTTONS.includes(a) && !p.done) {
      if (!this._taught.includes(a)) { this._taught.push(a); this.bar?.reveal?.(a); }
      tc?.reveal(a);
    }
    this._veilIdle = 0;
  }

  /**
   * WA §7.5 / §4.1: refresh the progressive-reveal model (10 Hz) that the bar, the HUD and the touch cluster read as
   * `ui.reveal`. In practice the touch veil holds (it is put back if anything lifted it); after it, it lifts.
   */
  _revealTick() {
    const practice = inPractice(this.ctx);
    this.reveal = revealShow({ practice, taught: this._taught }, this.reveal ?? {});
    const tc = this.touch;
    if (!tc) return;
    if (practice && !tc.veiled) tc.veil(this._taught ?? []);
  }

  /** PERF §10.1: the warm splash (core's inline `#splash`) fades out once the title is interactive, then goes. */
  _splashOut() {
    if (typeof document === 'undefined') return;
    const sp = document.getElementById('splash');
    if (!sp || sp.classList.contains('out')) return;
    sp.classList.add('out');
    setTimeout(() => sp.remove(), UI_TIMING.splashOut * 1000);
  }

  /** AUTOCAM §10.4: push a lock mode to the camera (KBM only there; pad / touch stay locked by the camera). */
  _applyLockMode(mode) {
    const cam = this.ctx.cam;
    if (mode !== 'locked' && mode) this._lastUnlocked = mode;
    if (typeof cam?.setLockMode === 'function') { cam.setLockMode(mode); return; }
    if (cam?.setCamLock && cam.camLocked !== (mode === 'locked')) cam.setCamLock(mode === 'locked', false);
  }

  // ------------------------------------------------------------------ warm-phase services (IMPLEMENTATION_PLAN §7.2)
  /** ART §9.1 `#ui-flash`: a full-screen flash, opacity only (presets 'hurt' | 'rescue' | 'card' | 'storm'). */
  flash(color, alpha, dur) { return this.layers?.flash(color, alpha, dur) ?? null; }

  /** AUTOCAM §7.1: measured occluder rects (CSS px) + a version that bumps only when a rect changes. */
  screenOccluders() { return this.occluders?.out ?? NO_OCCLUDERS; }

  /** env(safe-area-inset-*) in CSS px (AUTOCAM §7.1; read from a hidden probe div once per layout). */
  get safeArea() { return this.occluders?.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 }; }

  /** Live thumb state (read-only): the joystick base and the held cluster button (AUTOCAM §7.1 live holes). */
  get thumbs() { return this.touch?.thumbs ?? null; }

  /** WA §5.4: queue a reward card ('sticker' | 'card' | 'friend'). */
  celebrate(kind, id, vars) { return this.celebrations?.show(kind, id, vars) ?? false; }

  /** WA §6.3: the Kitten-mode offer (once per save). Resolves true / false, or null when not shown. */
  offerKitten(o) { return this.offer?.offer(o) ?? Promise.resolve(null); }

  /** A HUD home's viewport rect for fly-to-HUD (WA §5.4 / §5.5), or null when it is not on screen. */
  homeRect(key) {
    const e = this.hud?.homeEl?.(key);
    const r = e?.getBoundingClientRect?.();
    if (!r || !(r.width > 0)) {
      if (key === 'stickers' && this.touch?.enabled) { const b = this.touch.pauseBtn?.getBoundingClientRect?.(); if (b?.width > 0) return { x: b.left, y: b.top, w: b.width, h: b.height }; }
      return null;
    }
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  /** A fly-to-HUD icon / reward landed: the counter bumps (and shows itself in the calm HUD). */
  bumpHome(key) { this.hud?.bump?.(key); }

  /** Run `fn` after `sec` real seconds (render-clocked; cleared on dispose). */
  _after(sec, fn) { this._timers.push({ t: sec, fn }); }

  sfx(id, o) { try { this.ctx.audio?.play2D?.(id, o); } catch { /* audio optional */ } }

  /**
   * §9.2 Edit layout: closes the menus and shows the touch cluster in edit mode (drag buttons; Done saves
   * settings.touchLayout, Reset clears it). The game stays paused underneath.
   */
  editTouchLayout() {
    if (this.touchEditor || !this.touch) return false;
    const ctx = this.ctx;
    this._freeze();
    this.menus.closeAll();
    this.touchEditor = new TouchLayoutEditor(ctx, this.touch, () => {
      this.touchEditor = null;
      // back to the pause menu (the game stays frozen until Resume)
      if (ctx.game?.mode === 'menu') this.menus.openPause();
    });
    return true;
  }

  // ------------------------------------------------------------------ contract + services
  /** Show / hide the loading veil (§19.3; LevelManager calls it around every load). */
  loading(on) {
    this.isLoading = !!on;
    this.overlay?.loading(on);
  }

  /** Results screen (§14.3); resolves when the player continues. world's `levels.exit` awaits it. */
  showResults(payload) {
    if (!this.results) return Promise.resolve();
    this._resultsInScene = this.ctx.game.mode === 'cutscene' && !!this.ctx.story?.isPlaying;
    this._takeMode('cutscene');
    // §14.3 results per level: compare with the record as it stood when the level started (world writes the new best
    // into state.levels before it calls us)
    const lvl = payload?.levelId, before = this._levelStart?.id === lvl ? this._levelStart.rec : null;
    return this.results.show(payload, { prev: before });
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

  /**
   * Is the stored save past the prologue? (ON §3.3: only then does "New adventure" ask "Skip the prologue?".) Reads the
   * stored flags through save.peek() when it exists, else infers it from the summary (a later level or a clear).
   */
  savePastPrologue() {
    const sv = this.ctx.save;
    try {
      const flags = sv?.peek?.()?.data?.flags;
      if (flags && typeof flags === 'object') return !!flags['prologue.done'];
    } catch { /* fall through */ }
    const sum = this.saveSummary();
    if (!sum) return false;
    return (Array.isArray(sum.cleared) && sum.cleared.length > 0) || (!!sum.levelId && sum.levelId !== 'meadow') || (sum.spawnId != null && !/^(practice|title|barn)$/.test(sum.spawnId) && sum.levelId === 'meadow' && sum.spawnId !== 'start');
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

  /**
   * Hub station panel (§13.3 / §14.3): 'bakery' | 'forge' | 'library' | 'wardrobe' | 'lookout' | 'barracks' (world ids such
   * as 'shop_forge' or the keeper's name also work). Freezes the world; resolves when the panel closes.
   */
  openShop(id, fallback = null) {
    if (!this.menus) return Promise.resolve();
    if (this._shopP) return this._shopP;
    if (this.busy) return Promise.resolve();
    const p = this._shopP = loadHubPanels().then(([shops]) => {
      const st = shops.stationId(id) ?? (fallback ? shops.stationId(fallback) : null);
      if (!st || !this.menus || this.busy) return undefined;
      this._freeze();
      return shops.openShop(this.menus, st);
    }).catch((e) => { console.warn('[ui] shop panel failed to load', e); }).finally(() => { if (this._shopP === p) this._shopP = null; });
    return p;
  }

  /**
   * Quest Board (§12.5, §14.3). Resolves with { levelId, replay } or null. Unless `onPick` is given (world travels
   * itself; return false to stay), the ui travels: the town's first exit goes through `levels.exit` (results card,
   * `town.done`), everything else is `levels.load(id, 'start')`.
   */
  openQuestBoard({ onPick = null } = {}) {
    if (!this.menus) return Promise.resolve(null);
    if (this.menus.has('board')) return this._boardP ?? Promise.resolve(null);
    if (this._boardP) return this._boardP;
    if (this.busy) return Promise.resolve(null);
    this._boardP = loadHubPanels().then(([, board]) => {
      if (!this.menus || this.busy) return null;
      this._freeze();
      return board.openQuestBoard(this.menus);
    }).catch((e) => { console.warn('[ui] quest board failed to load', e); return null; }).then(async (pick) => {
      this._boardP = null;
      if (pick) {
        this.ctx.bus.emit(E.SAVE_REQUEST, { reason: 'board' });
        if (onPick) { try { await onPick(pick.levelId, pick); } catch (e) { console.warn('[ui] board onPick failed', e); } }
        else this.travel(pick.levelId);
      }
      return pick;
    });
    return this._boardP;
  }

  /** Leave for a level from the hub (Quest Board): the first town exit shows its results; replays load directly. */
  travel(levelId) {
    const ctx = this.ctx, lv = ctx.levels;
    if (!lv || !levelId) return Promise.resolve();
    const cur = lv.current?.id;
    if (cur === HUB_LEVEL && !ctx.state?.cond?.(`${HUB_LEVEL}.done`) && typeof lv.exit === 'function') return lv.exit(levelId, 'start');
    if (typeof ctx.story?.travel === 'function') return ctx.story.travel(levelId, 'start');
    return lv.load?.(levelId, 'start');
  }

  /** Close a station / board panel (back, the Close button). */
  closeShop() { if (this.menus?.paused) this.resume(); }

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
    // a card shown during a scene that has ended meanwhile (story's results wait timed out / was skipped) hands back play
    if (g.mode === 'cutscene' && !this.ctx.story?.isPlaying && !this.ctx.levels?.loading && !this.menus?.titleActive && (this._modeTaken || this._resultsInScene)) g.setMode(this._modeTaken ?? 'play');
    this._resultsInScene = false;
    this._modeTaken = null;
  }

  // ------------------------------------------------------------------ fixed step: input
  update(dt) {
    if (!this.root) return;
    const ctx = this.ctx, input = ctx.input, mode = ctx.game.mode, story = ctx.story;
    if (this.results.open) { this.results.update(dt, input); return; }
    if (this.menus.active) { this.menus.update(input, dt); return; }
    if (this.touchEditor) { if (input?.pressed?.('back') || input?.pressed?.('pause')) this.touchEditor.close(false); return; }
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
    // WA §5.4: any input after 0.6 s sends a celebration home (it never pauses or eats the input)
    const cel = this.celebrations;
    if (cel?.q.cur && input.anyActivity?.() && cel.q.skip()) cel._fly(cel.q.cur);
    // requests/fx: Esc while a companion ability is held only cancels the aim (CONTROLS_SPEC §7.5)
    if (ctx.companions?.aim?.active && input.pressed('pause')) return;
    // Morning Practice: a 1 s hold skips the tutorial, so pause opens on the release of a short press
    if (story?.tutorial?.active) {
      if (input.released('pause') && input.heldTime('pause') < UI_TIMING.tutorialTap) this.pause();
    } else if (input.pressed('pause')) this.pause();
    // CONTROLS_SPEC §6.3: pad Back / View opens the controls card over the pause book (Back closes it as usual)
    else if ((mode === 'play' || mode === 'memecam') && input.pressed?.('controls')) { this.pause(); if (this.menus.paused) this.menus.openControls(); }
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
    const hintOn = hintLayerOn({ hud: hudOn, meme: this.meme, mode, dialog: !!this.dialog.visible, letterbox: !!this.overlay.letterboxOn, menu: !!this.menus.active, cinema: this.inScene });
    this.toasts.render(dt, { tips: hintOn, tipHold: !!this.prompts?.guide?.open });
    const world = hudOn && !this.meme && (mode === 'play' || mode === 'memecam') && !this.menus.active;
    this.prompts.render(dt, { world, hint: hintOn });
    this.beacon?.render(dt, world);
    this.arrows.render(dt, world);
    this.hpBars?.render(dt, world);
    this.results.render(dt);
    this.menus.render(dt);
    this.menus.scrollCredits(dt);
    this.touch.render(dt, { play: world && !this.dialog.visible, any: !title && !this.isLoading && !this.results.open && !this.menus.active });
    this.bar?.render(dt, world && !this.dialog.visible);
    this.layers?.render(world);
    this.celebrations?.render(dt);
    flag(this.celebrations?.root, 'is-dim', !hudOn);
    this.fly?.render(dt, hudOn);
    this.offer?.render(dt, hudOn);
    this.occluders?.render(dt);
    if ((this._revealT = (this._revealT ?? 0) - dt) <= 0) { this._revealT = 0.1; this._revealTick(); }
    if (this.touch?.veiled) {
      const guided = this.prompts?.guide?.open || this.ctx.story?.tutorial?.active || this.reveal?.practice;
      this._veilIdle = guided ? 0 : (this._veilIdle ?? 0) + dt;
      if (this._veilIdle > 3) this.touch.veil(null);          // taught lessons are kept until the next level load
    }
    this._measureSafe(dt);
    // §10.2 context cursor over the canvas (only written on change)
    this.cursor?.update(dt, { menu: !!this.menus.active || title || this.results.open || !!this.touchEditor });
    // the camera's lock (Y) → the settings: camLockMode (the retired boolean camLock in sync until its readers move)
    const cl = ctx.cam?.camLocked, sts = ctx.state?.settings;
    if (typeof cl === 'boolean' && sts && ctx.cam?.isIso) {
      const mode = typeof ctx.cam.lockMode === 'string' ? ctx.cam.lockMode : cl ? 'locked' : (sts.camLockMode && sts.camLockMode !== 'locked' ? sts.camLockMode : this._lastUnlocked);
      if ('camLockMode' in sts && sts.camLockMode !== mode) {
        if (mode !== 'locked') this._lastUnlocked = mode;
        sts.camLockMode = mode;
        ctx.bus.emit(E.SETTINGS_CHANGED, { key: 'camLockMode', value: mode, source: 'camera' });
      }
      if (sts.camLock !== cl) applySetting(ctx, 'camLock', cl);
    }
  }

  /**
   * The canvas area the HUD covers (CSS px from each canvas edge): the boss plate at the top, the ability bar at the
   * bottom. The camera reads `ctx.ui.safeInsets` for its §2.4 boss fit (requests/camera: keep the boss off the HUD).
   * Re-measured at 4 Hz (two layout reads); zero while the HUD is hidden.
   */
  _measureSafe(dt) {
    const s = this.safeInsets ?? (this.safeInsets = { top: 0, bottom: 0, left: 0, right: 0, w: 0, h: 0 });
    if ((this._safeT = (this._safeT ?? 0) - dt) > 0) return;
    this._safeT = 0.25;
    const cv = this.ctx.renderer?.domElement;
    const r = cv?.getBoundingClientRect?.() ?? (typeof innerWidth !== 'undefined' ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : null);
    if (!r || !(r.width > 0)) return;
    s.w = r.width; s.h = r.height;
    s.bottom = this.bar?.safeInset(r) ?? 0;
    const be = this.hud?.bossEl;
    let top = 0;
    if (be && this.hud.visible !== false && be.classList.contains('is-on')) {
      const b = be.getBoundingClientRect();
      if (b.height > 0) top = Math.max(0, b.bottom - r.top);
    }
    s.top = top;
    // the guide bubble / offer sit under the top-centre column (boss bar, objective, toasts), never over its pills
    const tc = this.hud?.tcEl;
    let tcb = 0;
    if (tc && this.hud.visible !== false) { const b = tc.getBoundingClientRect(); if (b.height > 0) tcb = Math.ceil(b.bottom); }
    setVar(this.root, '--tc-b', `${tcb}px`);
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
    for (const m of [this.hpBars, this.bar, this.touch, this.menus, this.results, this.overlay, this.dialog, this.prompts, this.arrows, this.beacon, this.hud, this.layers, this.celebrations, this.offer, this.fly, this.occluders]) { try { m?.dispose(); } catch (e) { console.warn('[ui] dispose', e); } }
    if (this._onResize && typeof window !== 'undefined') window.removeEventListener('resize', this._onResize);
    this.toasts?.clear();
    if (this._noMenu) this.root?.removeEventListener('contextmenu', this._noMenu);
    this.style?.remove();
    if (this.root) for (const k of ['ui-root', 'is-meme', 'is-title', 'dev-kbm', 'dev-pad', 'dev-touch']) this.root.classList.remove(k);
    this.hud = this.dialog = this.overlay = this.menus = this.results = this.toasts = this.prompts = this.arrows = this.beacon = this.touch = null;
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
