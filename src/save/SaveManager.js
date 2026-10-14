// src/save/SaveManager.js  (owner: save) — persistence: tech.md §16 as amended by GAME_DESIGN §19.1 A8 / §19.7.
//
// One localStorage slot, key `swordcat.save.v1` (+ `.bak`, the previous good progress save). The stored record is
// the §19.7 schema (= core GameState.toJSON()) plus `progress` (false for a settings-only record written before any
// game was started). Every storage access is wrapped: private mode / quota / SecurityError never crash the game.
//
// Frozen contract (§19.3):  load() → migrated data | null   write(d) → bool   clear()
// Module exports:           KEY, BACKUP_KEY, SAVE_VERSION, defaultSave(), migrate(d), isLegacyV1(d), hasProgress(rec),
//                           resumeSpawn(levelId, spawnId, flags), summarize(rec), createMemoryStorage()
// Additive service API (ui / story):
//   hasSave()                      a progress save exists → show "Continue" / "Skip the prologue?"
//   summary()                      { levelId, spawnId, difficulty, playtime, savedAt, kittens, ... } | null (Continue card)
//   newGame({difficulty, skipPrologue}) → { levelId, spawnId }   fresh §19.7 state (keeps settings)
//   continueGame({load = true}) → Promise<{ levelId, spawnId } | null>  state ← the stored save, then levels.load()
//   beginSession() / endSession()  manual session control (optional: level loads drive sessions on their own)
//   request(reason)                autosave at the end of this fixed step (coalesced; held while a scene plays / loads)
//   save(reason)                   write ctx.state now · saveSettings() write state.settings now (patch only)
//   lastSave                       { at, reason, ok, count } (ui may poll it for a "saved" seal)
//
// Autosave (§19.7 + tech.md §16): CHECKPOINT, LEVEL_LOADED, KITTEN_RESCUED, cutscene:end, objective:progress {done},
// save:request (cutscene `end.save`, Vigil "Rest", shop purchases), plus quest completion, letter / Heart Bell pickups,
// unlocks, a level exit (resume point = the next level) and, on Nine Lives, a lost life. Settings: on settings:changed
// (≤ 4 Hz while a slider drags). Not in ?test (smoke enables it via setEnabled) nor on ?level= dev jumps (?save=1
// overrides). A pending save is also written on pagehide / tab hidden.
//
// Safety (F16): a stored record from a newer build (`v > SAVE_VERSION`) loads read-only and is never written over
// (`readOnly`); when storage is unavailable or a write fails after the quota retry, a one-time toast says progress
// can't be saved (`toast.noSave`); when another tab writes the slot (window `storage` event), this tab stops writing
// (`otherTab`) and a toast asks for a reload (`toast.otherTab`). Both toasts go through ctx.ui.toast (or E.TOAST).
//
// Sessions: the `title` spawn never saves. Any other level load (story's / ui's New Game and Continue flows, or
// newGame()/continueGame()) starts a session, which may overwrite the slot only from its first successful write on, so
// a New Game abandoned during CS-01 keeps the old save. Loading the `title` spawn ends the session (a final save if it
// had written) and puts the stored game back into ctx.state, including the resume point LevelManager just replaced
// with meadow/title, so story's Continue (which reads ctx.state) resumes where the save says. Title-screen time is
// kept out of `playtime`.
import { E } from '../core/events.js';
import { defaultState, migrateSettings, OS_SETTINGS, SAVE_KEYS } from '../core/GameState.js';
import { COMPANIONS, DIFFICULTY, ECONOMY, KITTEN_IDS, LEVEL_IDS, PLAYER, SETTING_VALUES } from '../core/config.js';

export const KEY = 'swordcat.save.v1';
export const BACKUP_KEY = KEY + '.bak';
/** Schema version written into every record (§19.7 `v: 1`). Bump together with a MIGRATIONS step. */
export const SAVE_VERSION = 1;

/** §19.7 schema (identical to core GameState.defaultState; the contract test checks it). */
export const defaultSave = () => defaultState();

/**
 * One-time player notices (F16): strings key + English fallback (used until story's strings.js has the key).
 * `session`: shown once a game session runs (a boot-time storage failure waits until play starts).
 */
export const NOTICES = Object.freeze({
  noSave: Object.freeze({ key: 'toast.noSave', text: "Progress can't be saved in this browser mode.", session: true }),
  otherTab: Object.freeze({ key: 'toast.otherTab', text: 'This game was saved in another tab. Reload this page to continue from there.', session: false }),
});

/** Delivery attempts (fixed steps) before a notice the ui keeps refusing is dropped. */
const NOTICE_TRIES = 600;

/** Is a raw stored record (string or parsed) from a newer build than this one? */
export function isNewerSave(rec) {
  const r = typeof rec === 'string' ? safeParse(rec) : rec;
  return isObj(r) && typeof r.v === 'number' && Number.isFinite(r.v) && r.v > SAVE_VERSION;
}

// ------------------------------------------------------------------ constants
/** Skip the prologue: every stage flag (WA §6.2 order + the CS-01b trio StoryManager.migrateFlags maps from). */
const PROLOGUE_FLAGS = ['prologue.start', 'prologue.practice', 'prologue.chart', 'prologue.raid', 'prologue.armour', 'prologue.tutorial', 'prologue.done'];
/** Any prologue progress flag (old: armour / tutorial; WA §6.2: start / practice / chart / raid). */
const PROLOGUE_RE = /^prologue\./;
const RANKS = ['pawsome', 'purrfect', 'mewtiful'];
const QUALITY_NAMES = ['auto', 'low', 'med', 'high'];
/** numeric settings: [min, max] */
const SETTING_RANGES = {
  master: [0, 1], music: [0, 1], sfx: [0, 1], shake: [0, 1],
  sensitivity: [0.1, 5], subtitleSize: [0.5, 3], dialogSpeed: [0.25, 4], touchSize: [0.8, 1.4],
  // CONTROLS_SPEC §12 save: the iso-control settings (§10.7)
  camZoom: [0.7, 1.4], edgePanSpeed: [0.5, 2], buttonOpacity: [0.4, 1], cursorSize: [1, 2],
};
/** enum settings (CONTROLS_SPEC §10.7): the allowed values */
const SETTING_ENUMS = {
  controlPreset: ['hybrid', 'moba', 'diablo', 'mouseOnly', 'keyboardOnly'], autoAttack: ['auto', 'chain', 'loop', 'off'],
  castMode: ['smart', 'indicator', 'dragOnly'], parryRing: ['auto', 'on', 'off'], autoRiposte: ['auto', 'on', 'off'], haptics: [0, 0.5, 1],
};
// IMPLEMENTATION_PLAN §7.4 + Phase W (save.1 / save.W1, PERF V1): config SETTING_VALUES is the one list of the new
// settings' allowed values. A pair of numbers is a [min, max] range (camCursorLead 0–0.15, camZoomPortrait 0.7–1.4);
// anything else is an enum (camLockMode, fpsCap 'auto' | 30 | 60 | 'off', quality, hudMode, pathPreview).
for (const [k, allowed] of Object.entries(SETTING_VALUES)) {
  if (k === 'quality') continue;                                           // QUALITY_NAMES below
  if (allowed.length === 2 && allowed.every((v) => typeof v === 'number')) SETTING_RANGES[k] = [allowed[0], allowed[1]];
  else SETTING_ENUMS[k] = allowed.slice();
}
/** Boolean settings added after the first v1 saves (WA §12 / AUTOCAM §12 / PERF §5.3): a missing key takes the default. */
const BOOL_SETTINGS = ['biggerHero', 'batterySaver', 'hitWords', 'tutorialHints', 'reduceCameraMotionAuto', 'reduceFlashesAuto'];
/** Flags that are UI memory, not game progress (WA §5 sticker / offer / first-sighting one-shots): never make a save "started". */
const MEMO_FLAG_RE = /^(seen\.|telegraph\.seen\.)/;
/** At most this many flags are kept from a stored record (far above the game's ~200; stops a runaway writer). */
const MAX_FLAGS = 2048;
const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const MAX_STR = 64;
const MILK_CAP = PLAYER.milk.max + (COMPANIONS.mochi?.milkBonus ?? 1);   // satchel II + Mochi (§7.6)
/** Dawnstone shards in the game (§13.1). */
const MAX_SHARDS = 3;
/** Sanity caps for counters (far above any reachable value; they only stop corrupt numbers). */
const MAX_FISH = 999999, MAX_COUNT = 1e6;
/** HP per heart (§7.6: 4 hearts = 8 HP). */
const HP_PER_HEART = 2;
const QUEST_DONE = new Set(['done', 'complete', 'completed', 'cleared']);
/** A dirty save waits for the end of a cutscene / load, but never longer than this (sim seconds). */
const MAX_DEFER = 180;
/** Minimum real time between two settings writes while a slider drags (ms). */
const SETTINGS_INTERVAL = 250;
/** Future schema steps: { [fromVersion]: (d) => d at fromVersion + 1 }. */
const MIGRATIONS = {};

// ------------------------------------------------------------------ pure helpers
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const now = () => Date.now();
const realMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

function num(v, def, lo = -Infinity, hi = Infinity, int = false) {
  let n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  if (!Number.isFinite(n)) return def;
  if (int) n = Math.round(n);
  return Math.min(hi, Math.max(lo, n));
}
const bool = (v, def) => (typeof v === 'boolean' ? v : def);
const id = (v) => (typeof v === 'string' && ID_RE.test(v) ? v : null);

/** Unique valid id strings (optionally restricted to `allowed`), at most `max`. */
function ids(arr, { allowed = null, max = 64 } = {}) {
  const out = [];
  if (!Array.isArray(arr)) return out;
  for (const v of arr) {
    const s = id(v);
    if (s && !out.includes(s) && (!allowed || allowed.includes(s))) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** settings.bindings: { action: [KeyboardEvent.code | 'MouseN', ...] } with sane ids only. */
function cleanBindings(v) {
  const out = {};
  if (!isObj(v)) return out;
  for (const [a, codes] of Object.entries(v)) {
    if (!ID_RE.test(a) || !Array.isArray(codes)) continue;
    const list = codes.filter((c) => typeof c === 'string' && ID_RE.test(c)).slice(0, 4);
    out[a] = list;
  }
  return out;
}

/** settings.touchLayout: null or { button: [dx, dy] } offsets (CSS px, finite, |v| ≤ 2000). */
function cleanLayout(v) {
  if (!isObj(v)) return null;
  const out = {};
  for (const [b, xy] of Object.entries(v)) {
    if (!ID_RE.test(b) || !Array.isArray(xy) || xy.length !== 2) continue;
    if (xy.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 2000)) out[b] = [xy[0], xy[1]];
  }
  return Object.keys(out).length ? out : null;
}

/** A JSON primitive worth keeping in flags / settings / level records. */
function prim(v) {
  if (typeof v === 'boolean') return { ok: true, v };
  if (typeof v === 'number') return Number.isFinite(v) ? { ok: true, v } : { ok: false };
  if (typeof v === 'string') return v.length <= MAX_STR ? { ok: true, v } : { ok: false };
  if (v === null) return { ok: true, v: null };
  return { ok: false };
}

/** tech.md §16's original v1 shape (hp 6, `holy`, `inventory`, `quests`) — same `v: 1`, so detected structurally. */
export function isLegacyV1(d) {
  if (!isObj(d)) return false;
  return 'holy' in d || 'inventory' in d || 'quests' in d || (typeof d.maxHp === 'number' && d.maxHp < PLAYER.hpStart);
}

/** tech.md v1 → §19.7: hearts 6 → 8 HP (she resumes at full health), `holy` / `quests` dropped, `inventory.fish` kept. */
function fromTechV1(d) {
  const out = { ...d };
  const inv = isObj(d.inventory) ? d.inventory : {};
  if (out.fish == null && Number.isFinite(inv.fish)) out.fish = inv.fish;
  delete out.holy; delete out.inventory; delete out.quests;
  out.maxHp = Math.max(PLAYER.hpStart, num(d.maxHp, PLAYER.hpStart, 0, PLAYER.hpMax, true));
  out.hp = out.maxHp;
  out.v = 1;
  return out;
}

/**
 * Where "Continue" resumes: the saved spawn, except the title backdrop (→ `practice` before the prologue ends, else
 * `start`) and a mid-prologue meadow save (→ `practice`, the barn).
 */
export function resumeSpawn(levelId, spawnId, flags = {}) {
  const s = id(spawnId), meadow = (levelId ?? 'meadow') === 'meadow', done = !!flags?.['prologue.done'];
  // mid-prologue (any `prologue.*` flag, e.g. an old `prologue.armour` without `prologue.done`): the meadow resumes at
  // the barn (the practice field, WA §6.2), never north of the closed practice gate. Saves without any prologue flag
  // (tech.md v1, dev fixtures) keep their spawn.
  if (meadow && !done && s !== 'practice' && isObj(flags) && Object.keys(flags).some((k) => PROLOGUE_RE.test(k) && flags[k])) return 'practice';
  if (s && s !== 'title') return s;
  if (meadow && !done) return 'practice';
  return 'start';
}

/** Validate / clamp every field onto a fresh §19.7 object (unknown top-level keys dropped). */
function sanitize(d) {
  const b = defaultSave();
  const out = defaultSave();
  out.v = SAVE_VERSION;

  // flags first: the resume spawn depends on them
  out.flags = {};
  if (isObj(d.flags)) {
    let n = 0;
    for (const [k, v] of Object.entries(d.flags)) {
      const p = prim(v);
      if (p.ok && k.length <= MAX_STR) { out.flags[k] = p.v; if (++n >= MAX_FLAGS) break; }
    }
  }

  const levelOk = typeof d.levelId === 'string' && LEVEL_IDS.includes(d.levelId);
  out.levelId = levelOk ? d.levelId : b.levelId;
  out.spawnId = levelOk ? resumeSpawn(out.levelId, d.spawnId, out.flags) : resumeSpawn(out.levelId, null, out.flags);
  out.difficulty = typeof d.difficulty === 'string' && DIFFICULTY[d.difficulty] ? d.difficulty : b.difficulty;
  out.playtime = num(d.playtime, 0, 0);
  out.savedAt = num(d.savedAt, 0, 0, Number.MAX_SAFE_INTEGER, true);

  out.maxHp = num(d.maxHp, b.maxHp, PLAYER.hpStart, PLAYER.hpMax, true);
  out.hp = num(d.hp, out.maxHp, 0, out.maxHp, true);
  if (out.hp <= 0) out.hp = out.maxHp;                      // never resume fainted
  out.lives = num(d.lives, b.lives, 0, PLAYER.lives, true);  // Kitten's Infinity serialises as null → default
  out.milkMax = num(d.milkMax, b.milkMax, PLAYER.milk.start, MILK_CAP, true);
  out.milk = num(d.milk, Math.min(b.milk, out.milkMax), 0, out.milkMax, true);
  out.fish = num(d.fish, 0, 0, MAX_FISH, true);
  out.shards = num(d.shards, 0, 0, MAX_SHARDS, true);
  out.memeCamSeen = num(d.memeCamSeen, 0, 0, MAX_COUNT, true);

  out.heartBells = ids(d.heartBells, { max: ECONOMY.heartBells ?? 3 });
  out.kittens = ids(d.kittens, { allowed: KITTEN_IDS, max: KITTEN_IDS.length });
  out.letters = ids(d.letters, { max: 16 });

  const c = isObj(d.companions) ? d.companions : {};
  out.companions = { ...b.companions, unlocked: ids(c.unlocked, { max: 16 }), active: ids(c.active, { max: 4 }) };

  const u = isObj(d.upgrades) ? d.upgrades : {};
  out.upgrades = {
    satchel: num(u.satchel, 0, 0, ECONOMY.shops.satchel.cost.length, true),
    sharp: num(u.sharp, 0, 0, ECONOMY.shops.sharp.cost.length, true),
    quickCharge: bool(u.quickCharge, false), valorGain: bool(u.valorGain, false), waveReach: bool(u.waveReach, false),
  };

  const cos = isObj(d.cosmetics) ? d.cosmetics : {};
  // the starting skins / cape can never be lost
  const ownedSwords = ids(cos.swords, { max: 32 }), ownedCapes = ids(cos.capes, { max: 32 });
  const swords = [...b.cosmetics.swords.filter((s) => !ownedSwords.includes(s)), ...ownedSwords];
  const capes = [...b.cosmetics.capes.filter((s) => !ownedCapes.includes(s)), ...ownedCapes];
  out.cosmetics = {
    swords, capes,
    sword: swords.includes(cos.sword) ? cos.sword : b.cosmetics.sword,
    cape: capes.includes(cos.cape) ? cos.cape : b.cosmetics.cape,
  };
  // Token Tails: the royal red cape is worn from the start. A record from before that (red not yet owned) still wearing
  // the old default cream moves to red once; after that red is owned, so a later choice of cream is kept.
  if (!ownedCapes.includes('red') && (cos.cape === 'cream' || cos.cape == null)) out.cosmetics.cape = 'red';

  out.levels = {};
  if (isObj(d.levels)) {
    for (const [lid, rec] of Object.entries(d.levels)) {
      if (!id(lid) || !isObj(rec)) continue;
      const r = {};
      for (const [k, v] of Object.entries(rec)) { const p = prim(v); if (p.ok) r[k] = p.v; }
      r.cleared = rec.cleared === true;
      if (!RANKS.includes(r.bestRank)) delete r.bestRank;
      if (!(typeof r.bestTime === 'number' && r.bestTime > 0)) delete r.bestTime;
      out.levels[lid] = r;
    }
  }

  out.settings = { ...b.settings };
  if (isObj(d.settings)) {
    for (const [k, v] of Object.entries(d.settings)) {
      if (k === 'pathPreview') out.settings.pathPreview = typeof v === 'boolean' ? (v ? 'on' : 'off') : (SETTING_ENUMS.pathPreview.includes(v) ? v : b.settings.pathPreview);   // legacy toggle → 'on' / 'off'
      else if (k in SETTING_RANGES) out.settings[k] = num(v, b.settings[k], SETTING_RANGES[k][0], SETTING_RANGES[k][1]);
      else if (k in SETTING_ENUMS) out.settings[k] = SETTING_ENUMS[k].includes(v) ? v : b.settings[k];
      else if (k === 'bindings') out.settings.bindings = cleanBindings(v);
      else if (k === 'touchLayout') out.settings.touchLayout = cleanLayout(v);
      else if (k === 'quality') out.settings.quality = QUALITY_NAMES.includes(v) ? v : b.settings.quality;
      else if (typeof b.settings[k] === 'boolean') out.settings[k] = bool(v, b.settings[k]);
      else if (!(k in b.settings) && k.length <= MAX_STR) { const p = prim(v); if (p.ok) out.settings[k] = p.v; }   // future ui keys
    }
    // a pre-W save without `<key>Auto`: a stored `true` was the player's own choice (the old default was false), so it
    // stops following the OS; a stored `false` keeps following it (X31, ART save A3)
    for (const k of OS_SETTINGS) {
      if (!(`${k}Auto` in d.settings) && d.settings[k] === true) out.settings[`${k}Auto`] = false;
    }
  }
  for (const k of BOOL_SETTINGS) if (typeof out.settings[k] !== 'boolean') out.settings[k] = b.settings[k];
  // K7 / X19: `camLock: false` → camLockMode 'free'; the retired boolean stays in sync with the mode (core's hook)
  migrateSettings(out.settings);

  // exactly the §19.7 keys, in schema order
  const ordered = {};
  for (const k of SAVE_KEYS) ordered[k] = out[k];
  return ordered;
}

/**
 * Upgrade any stored shape to the §19.7 schema (tech.md §16 rules: non-objects → null; one step at a time).
 * Handles tech.md's original v1 default (hp 6, `holy`, `inventory`, `quests`), partial / older records (missing keys
 * take the defaults), records from a newer build (best effort) and garbage values (clamped / defaulted).
 * @param {any} d @returns {ReturnType<typeof defaultSave> | null}
 */
export function migrate(d) {
  if (!isObj(d)) return null;
  let x = { ...d };
  if (isLegacyV1(x)) x = fromTechV1(x);
  let v = num(x.v, 1, 0, Number.MAX_SAFE_INTEGER, true);
  while (v < SAVE_VERSION && MIGRATIONS[v]) { x = MIGRATIONS[v](x); v++; }
  return sanitize(x);
}

/** Does a raw stored record hold a started game (vs. a settings-only record)? */
export function hasProgress(rec) {
  if (!isObj(rec)) return false;
  if (typeof rec.progress === 'boolean') return rec.progress;
  if (isLegacyV1(rec)) return true;
  const n = (a) => (Array.isArray(a) ? a.length : 0);
  return (isObj(rec.flags) && Object.keys(rec.flags).some((k) => !MEMO_FLAG_RE.test(k))) || n(rec.kittens) > 0 || n(rec.letters) > 0 ||
    num(rec.shards, 0) > 0 || (typeof rec.levelId === 'string' && rec.levelId !== 'meadow');
}

/** Compact Continue-card summary of a peek() result. */
export function summarize(p) {
  if (!p?.data) return null;
  const d = p.data;
  return {
    progress: !!p.progress, savedAt: p.savedAt ?? d.savedAt ?? 0, levelId: d.levelId, spawnId: d.spawnId,
    difficulty: d.difficulty, playtime: d.playtime, kittens: d.kittens.length, kittensTotal: KITTEN_IDS.length,
    letters: d.letters.length, heartBells: d.heartBells.length, shards: d.shards, fish: d.fish,
    hearts: d.maxHp / HP_PER_HEART, cleared: LEVEL_IDS.filter((l) => d.levels[l]?.cleared), cape: d.cosmetics.cape,
    ending: !!d.flags['ending.seen'],
  };
}

/** In-memory Storage stand-in (unit tests; same getItem / setItem / removeItem surface). */
export function createMemoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

const normScene = (sid) => String(sid ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isTitleScene = (sid) => { const n = normScene(sid); return n === 'cs00' || n === 'title'; };

/** `?save=1|0` URL override (null when absent). */
function urlFlag(name) {
  try {
    if (typeof location === 'undefined') return null;
    const q = new URLSearchParams(location.search);
    if (!q.has(name)) return null;
    const v = q.get(name);
    return !(v === '0' || v === 'false' || v === 'off');
  } catch { return null; }
}

// ------------------------------------------------------------------ the system
export class SaveManager {
  /**
   * @param {any} ctx
   * @param {{ storage?: Storage | null, key?: string }} [opts]  storage: injected Storage (tests); null = none
   */
  constructor(ctx, { storage, key = KEY } = {}) {
    this.ctx = ctx;
    this.key = key;
    this.backupKey = key === KEY ? BACKUP_KEY : key + '.bak';
    const p = ctx?.params ?? {};
    /** autosave master switch: off in ?test and on ?level= dev jumps (override with ?save=1 / ?save=0, or setEnabled) */
    this.enabled = urlFlag('save') ?? !(p.test || p.level);
    /** true while the title screen is up (boot, after "Quit to Title"): nothing is written */
    this.atTitle = true;
    /** the running game may overwrite the stored save (false right after newGame until its first autosave) */
    this.committed = false;
    /** pending autosave reason (written at the end of the fixed step), or null */
    this.dirty = null;
    /** ui may poll this for a "saved" seal */
    this.lastSave = { at: 0, reason: /** @type {string|null} */ (null), ok: /** @type {boolean|null} */ (null), count: 0 };
    /** the last load()/peek() result: { data, progress, savedAt } | null */
    this.loaded = null;
    this._dirtyT = 0;
    this._resume = null;            // { levelId, spawnId } after a level exit, until the next level has loaded
    this._titleTime = 0;            // sim seconds on the title screen since it came up (kept out of playtime)
    this._hadSession = false;       // a non-title level was loaded since the last title load
    this._settingsDirty = false; this._settingsKey = null; this._settingsAt = -Infinity;
    this._objDone = new Set();       // objective ids already saved as done in this level (one write per completion)
    this._storage = storage;        // undefined → resolve localStorage lazily
    this._offs = [];
    this._warned = new Set();
    /** F16: the stored record is from a newer build: it loads, but this build never writes over it */
    this.readOnly = false;
    /** F16: another tab wrote the slot; this tab stops writing until it is reloaded */
    this.otherTab = false;
    /** F16: notices raised (each at most once per page) and the ones still waiting for the ui */
    this._noticed = new Set();
    this._notices = [];
    this._noticeTries = 0;
    this._onHide = this._onHide.bind(this);
    this._onStorage = this._onStorage.bind(this);
    this._onVis = () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') this._onHide(); };
  }

  async init() {
    const bus = this.ctx.bus;
    const req = (reason) => () => this.request(reason);
    this._offs.push(
      bus.on(E.LEVEL_LOADING, (p) => this._onLevelLoading(p)),
      bus.on(E.LEVEL_LOADED, (p) => this._onLevelLoaded(p)),
      bus.on(E.LEVEL_EXIT, (p) => this._onLevelExit(p)),
      bus.on(E.CHECKPOINT, (p) => this._onCheckpoint(p)),
      bus.on(E.KITTEN_RESCUED, req('kitten')),
      bus.on(E.CUTSCENE_END, (p) => { if (!isTitleScene(p?.id)) this.request('cutscene'); }),
      bus.on(E.OBJECTIVE, (p) => this._onObjective(p)),
      bus.on(E.QUEST_UPDATE, (p) => { if (QUEST_DONE.has(p?.state)) this.request('quest'); }),
      bus.on(E.ITEM_PICKUP, (p) => { if (p?.item === 'letter' || p?.item === 'heartBell') this.request('pickup'); }),
      bus.on(E.UNLOCK, req('unlock')),
      bus.on(E.PLAYER_LIFE_LOST, () => { if (this.ctx.state?.difficultyCfg?.livesScope === 'game') this.request('life'); }),
      bus.on(E.SAVE_REQUEST, (p) => this.request(typeof p?.reason === 'string' ? p.reason : 'request')),
      bus.on(E.SETTINGS_CHANGED, (p) => this._onSettings(p)),
    );
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('pagehide', this._onHide);
      window.addEventListener('storage', this._onStorage);
    }
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', this._onVis);
  }

  // ------------------------------------------------------------------ storage primitives (frozen contract)
  /** Read the stored save, migrated to §19.7 (also a settings-only record, so settings apply at boot). */
  load() {
    const p = this.peek();
    this.loaded = p;
    return p ? p.data : null;
  }

  /**
   * Write `d` (sanitised to §19.7) as the stored record. Returns false (never throws) on any storage failure.
   * @param {object} d @param {{ progress?: boolean, savedAt?: number, backup?: boolean }} [o]
   */
  write(d, { progress = true, savedAt = now(), backup = true } = {}) {
    if (this.otherTab) return false;                          // F16: another tab owns the slot now
    const s = this._store();
    if (!s) { this._notice('noSave'); return false; }
    if (this.readOnly) return false;                          // F16: a newer build's save is never written over
    let prev = null;
    try { prev = s.getItem(this.key); } catch { prev = null; }
    const prevRec = prev ? safeParse(prev) : null;
    if (isNewerSave(prevRec)) { this._markNewer(prevRec); return false; }
    const clean = migrate(d);
    if (!clean) return false;
    clean.savedAt = savedAt;
    let raw;
    try { raw = JSON.stringify({ ...clean, progress: !!progress }); } catch (e) { this._warn('json', '[save] could not serialise the save', e); return false; }
    try {
      if (backup && prev && prev !== raw && hasProgress(prevRec)) s.setItem(this.backupKey, prev);
    } catch { /* backup is best effort */ }
    try { s.setItem(this.key, raw); return true; } catch (e) {
      // quota: drop the backup and retry once
      try { s.removeItem(this.backupKey); s.setItem(this.key, raw); return true; } catch { /* fall through */ }
      this._warn('write', '[save] write failed (storage full or blocked); progress is kept in memory only', e);
      this._notice('noSave');
      return false;
    }
  }

  /** Delete the save (and its backup). */
  clear() {
    const s = this._store();
    this.loaded = null;
    this.readOnly = false;                                    // the player chose to delete it (also a newer one)
    if (!s) return;
    try { s.removeItem(this.key); } catch { /* ignore */ }
    try { s.removeItem(this.backupKey); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------ queries
  /** The stored record without touching ctx.state: { data, progress, savedAt, fromBackup } | null. */
  peek() {
    const s = this._store();
    if (!s) return null;
    let raw = null, bak = null;
    try { raw = s.getItem(this.key); } catch { raw = null; }
    const rec = raw ? safeParse(raw) : null;
    if (raw && !isObj(rec)) {
      this._warn('corrupt', '[save] the save is unreadable; trying the backup');
      try { bak = s.getItem(this.backupKey); } catch { bak = null; }
      const b = bak ? safeParse(bak) : null;
      return isObj(b) ? { data: migrate(b), progress: hasProgress(b), savedAt: num(b.savedAt, 0), fromBackup: true } : null;
    }
    if (!isObj(rec)) return null;
    if (isNewerSave(rec)) this._markNewer(rec);
    return { data: migrate(rec), progress: hasProgress(rec), savedAt: num(rec.savedAt, 0), fromBackup: false };
  }

  /** A started game is stored (main menu "Continue"; New Game's "Skip the prologue?"). */
  hasSave() { return !!this.peek()?.progress; }

  /** Continue-card summary of the stored save, or null. */
  summary() { const p = this.peek(); return p?.progress ? summarize(p) : null; }

  /** true once the running game owns the slot (it has written, or it is the stored game it continued). */
  get active() { return !this.atTitle && this.committed; }

  // ------------------------------------------------------------------ sessions
  // A session starts when a level other than the `title` spawn loads (story / ui flows), or via newGame() /
  // continueGame(). It commits (may overwrite the slot) on its first successful write, so an abandoned new game
  // never replaces the stored one. Loading the `title` spawn ends it: a final save if it committed, then ctx.state is
  // put back to the stored game (what Continue resumes) and title-screen time is kept out of the playtime.

  /**
   * Start a fresh game: ctx.state ← §19.7 defaults (current settings kept), emits save:loaded {reason:'new'}. Nothing
   * is written until the new game's first autosave, so quitting during CS-01 keeps the old save. The caller plays
   * CS-01 / loads the returned spawn.
   * @param {{ difficulty?: 'kitten'|'knight'|'nine', skipPrologue?: boolean }} [o]
   * @returns {{ levelId: string, spawnId: string }}
   */
  newGame({ difficulty = 'knight', skipPrologue = false } = {}) {
    const st = this.ctx.state;
    const data = defaultSave();
    data.settings = { ...data.settings, ...(st?.settings ?? {}) };
    if (DIFFICULTY[difficulty]) data.difficulty = difficulty;
    if (skipPrologue) { for (const k of PROLOGUE_FLAGS) data.flags[k] = true; data.spawnId = 'start'; }
    const clean = migrate(data);
    st?.reset?.(clean);
    this._startSession(false);
    this.ctx.bus.emit(E.SAVE_LOADED, { data: st?.toJSON?.() ?? clean, reason: 'new' });
    return { levelId: clean.levelId, spawnId: clean.spawnId };
  }

  /**
   * "Continue": ctx.state ← the stored save (current settings kept; title-screen playtime discarded), emits
   * save:loaded {reason:'continue'}, then loads its level at the resume spawn (`load: false` to load it yourself).
   * @param {{ load?: boolean }} [o] @returns {Promise<{ levelId: string, spawnId: string } | null>}
   */
  async continueGame({ load = true } = {}) {
    const p = this.peek();
    if (!p?.progress) return null;
    const st = this.ctx.state;
    const data = p.data;
    if (st?.settings) data.settings = { ...data.settings, ...st.settings };
    data.spawnId = resumeSpawn(data.levelId, data.spawnId, data.flags);
    st?.reset?.(data);
    this.loaded = p;
    this._startSession(true);
    this.ctx.bus.emit(E.SAVE_LOADED, { data: st?.toJSON?.() ?? data, reason: 'continue' });
    const target = { levelId: data.levelId, spawnId: data.spawnId };
    if (load && this.ctx.levels?.load) await this.ctx.levels.load(target.levelId, target.spawnId);
    return target;
  }

  /** Leave the title without newGame/continueGame (the caller set ctx.state up). `commit`: may overwrite at once. */
  beginSession({ commit = true } = {}) { this._startSession(commit); }

  /** Back to the title: a final save of the running game (if it has committed), then no writes until a new session. */
  endSession(reason = 'quit') {
    if (!this.atTitle && this.enabled && this.committed) this._flush(this.dirty ?? reason);
    this.atTitle = true; this.committed = false;
    this.dirty = null; this._resume = null; this._titleTime = 0;
  }

  _startSession(commit) {
    this.atTitle = false; this.committed = !!commit; this._hadSession = true;
    this.dirty = null; this._dirtyT = 0; this._resume = null; this._titleTime = 0;
  }

  /**
   * The `title` spawn has loaded. LevelManager just set state.levelId/spawnId to meadow/title, so put the resume point
   * back: after a session the whole stored game (= what a reboot would show), at boot only levelId/spawnId (core has
   * already applied the save). Never in ?test (runs never read the slot).
   */
  _enterTitle(fromSession) {
    this.endSession('title');
    if (!this.enabled) return;
    const st = this.ctx.state, p = this.peek();
    if (!st || !p?.progress) return;
    if (fromSession) {
      const data = p.data;
      data.settings = { ...data.settings, ...(st.settings ?? {}) };
      st.reset?.(data);
      this.loaded = p;
      this.ctx.bus.emit(E.SAVE_LOADED, { data: st.toJSON?.() ?? data, reason: 'title' });
    } else {
      st.levelId = p.data.levelId; st.spawnId = p.data.spawnId;
    }
  }

  // ------------------------------------------------------------------ saving
  /** Turn autosave on/off at runtime (smoke tests; a debug toggle). */
  setEnabled(on = true) { this.enabled = !!on; return this.enabled; }

  /**
   * Ask for an autosave. It is written at the end of the current fixed step (several triggers in one step = one
   * write), after the running cutscene / level load. Ignored at the title, in ?test, or when disabled.
   * @returns {boolean} accepted
   */
  request(reason = 'request') {
    if (!this.enabled || this.atTitle) return false;
    if (!this.dirty) this._dirtyT = 0;
    this.dirty = reason;
    return true;
  }

  /** Write ctx.state now (ignores the cutscene deferral). @returns {boolean} written */
  save(reason = 'manual') {
    if (!this.enabled || this.atTitle) return false;
    return this._flush(reason);
  }

  /** Persist state.settings now (a patch: the stored game progress is untouched). @returns {boolean} */
  saveSettings(key = null) {
    this._settingsDirty = false;
    if (!this.enabled) return false;
    const st = this.ctx.state;
    if (!st?.settings) return false;
    this._settingsAt = realMs();
    const k = key ?? this._settingsKey;
    this._settingsKey = null;
    return this._patch((rec) => {
      rec.settings = { ...st.settings };
      if (k === 'difficulty' && DIFFICULTY[st.difficulty]) rec.difficulty = st.difficulty;
    });
  }

  update(dt) {
    if (this.atTitle) {
      // mirror core's playtime clock (Game.step: not while loading, not in 'menu') to discount the title screen
      const c = this.ctx;
      if (!c.levels?.loading && c.game?.mode !== 'menu') this._titleTime += dt;
    }
    if (this._notices.length) this._deliver();
    if (this._settingsDirty && realMs() - this._settingsAt >= SETTINGS_INTERVAL) this.saveSettings();
    if (!this.dirty) return;
    this._dirtyT += dt;
    if (this._blocked() && this._dirtyT < MAX_DEFER) return;
    this._flush(this.dirty);
  }

  dispose() {
    if (this._settingsDirty) this.saveSettings();
    for (const off of this._offs) off();
    this._offs.length = 0;
    if (typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('pagehide', this._onHide);
      window.removeEventListener('storage', this._onStorage);
    }
    if (typeof document !== 'undefined' && document.removeEventListener) document.removeEventListener('visibilitychange', this._onVis);
  }

  // ------------------------------------------------------------------ internals
  /**
   * A playing story scene or a level load holds the save until the scene's end state is in place. Mode 'cutscene' on
   * its own is not enough: ui also uses it to freeze the world under the results card, where the level-exit save
   * (the next level as the resume point) must land.
   */
  _blocked() {
    const c = this.ctx;
    return !!(c.levels?.loading || c.story?.isPlaying);
  }

  /** The record a progress save writes: ctx.state, with the resume point of a pending level exit. */
  _compose() {
    const d = this.ctx.state.toJSON();
    if (this._resume) { d.levelId = this._resume.levelId; d.spawnId = this._resume.spawnId; }
    d.spawnId = resumeSpawn(d.levelId, d.spawnId, d.flags);
    return d;
  }

  _flush(reason) {
    this.dirty = null; this._dirtyT = 0;
    if (!this.enabled || !this.ctx.state?.toJSON) return false;
    if (this.otherTab || this.readOnly) return false;          // F16: not ours to write (no failed-save seal either)
    const at = now();
    const ok = this.write(this._compose(), { progress: true, savedAt: at });
    if (ok) { this.ctx.state.savedAt = at; this.committed = true; this._settingsDirty = false; }
    this.lastSave = { at, reason: reason ?? 'save', ok, count: this.lastSave.count + (ok ? 1 : 0) };
    if (E.SAVE_WRITTEN) this.ctx.bus?.emit(E.SAVE_WRITTEN, { reason: this.lastSave.reason, savedAt: at, ok });
    return ok;
  }

  /** Read-modify-write of the stored record (settings, playtime). Creates a settings-only record if none exists. */
  _patch(fn) {
    if (this.otherTab || this.readOnly) return false;
    if (!this._store()) { this._notice('noSave'); return false; }
    const p = this.peek();                      // same backup fallback as every read: a corrupt record is not lost
    const data = p?.data ?? defaultSave();
    fn(data);
    return this.write(data, { progress: p?.progress ?? false, savedAt: p?.savedAt ?? 0, backup: false });
  }

  _onSettings(p) {
    if (!this.enabled) return;
    if (p?.key === 'difficulty') this._settingsKey = 'difficulty';
    this._settingsDirty = true;
    if (realMs() - this._settingsAt >= SETTINGS_INTERVAL) this.saveSettings();   // first change: immediately
  }

  _onObjective(p) {
    if (!p) return;
    if (!p.done) { if (p.id != null) this._objDone.delete(p.id); return; }
    if (p.id != null) { if (this._objDone.has(p.id)) return; this._objDone.add(p.id); }
    this.request('objective');
  }

  _onLevelLoading(p) {
    this._objDone.clear();
    if (p?.spawnId === 'title') {
      // leaving for the title (Quit to Title, CS-16 → title): final save even mid-cutscene, then the session ends
      if (!this.atTitle) this.endSession('title');
      return;
    }
    if (this.atTitle) {
      // a game starts from the title through story/ui (not newGame/continueGame): the time spent on the title
      // screen is not play time (a state story just reset simply clamps at 0)
      const st = this.ctx.state;
      if (st && Number.isFinite(st.playtime)) st.playtime = Math.max(0, st.playtime - this._titleTime);
      this._titleTime = 0;
    }
  }

  _onLevelLoaded(p) {
    this._resume = null;
    if (p?.spawnId === 'title') { const had = this._hadSession; this._hadSession = false; this._enterTitle(had); return; }
    if (this.atTitle) this._startSession(false);
    this._hadSession = true;
    this.request('level');
  }

  _onLevelExit(p) {
    if (typeof p?.to === 'string' && LEVEL_IDS.includes(p.to)) this._resume = { levelId: p.to, spawnId: id(p.spawnId) ?? 'start' };
    this.request('exit');
  }

  _onCheckpoint(p) {
    const st = this.ctx.state;
    if (st && !this.atTitle && typeof p?.levelId === 'string' && LEVEL_IDS.includes(p.levelId) && id(p.spawnId)) {
      st.levelId = p.levelId; st.spawnId = p.spawnId;
    }
    this.request('checkpoint');
  }

  /** Tab hidden / page closing: write what is pending; otherwise keep the stored playtime current. */
  _onHide() {
    if (!this.enabled) return;
    if (this._settingsDirty) this.saveSettings();
    if (this.atTitle) return;
    if (this.dirty && !this._blocked()) { this._flush(this.dirty); return; }
    if (!this.committed) return;
    const t = this.ctx.state?.playtime;
    if (Number.isFinite(t)) this._patch((rec) => { rec.playtime = Math.max(rec.playtime, t); });
  }

  _store() {
    if (this._storage !== undefined) return this._storage;
    let s = null;
    try {
      s = globalThis.localStorage ?? null;
      s?.getItem(KEY);                          // SecurityError (sandboxed iframe / blocked cookies) throws here
    } catch (e) {
      s = null;
      this._warn('storage', '[save] localStorage is unavailable; progress will not persist', e);
    }
    this._storage = s;
    return s;
  }

  /** F16: a newer build's record: read-only from now on (logged once). */
  _markNewer(rec) {
    if (this.readOnly) return;
    this.readOnly = true;
    this._warn('newer', `[save] this save was written by a newer version of the game (v${rec?.v}, this build reads v${SAVE_VERSION}); ` +
      'it is loaded read-only and will not be overwritten');
  }

  /**
   * F16: window `storage` event. Another tab (same origin) wrote or removed our slot (`key` null = storage.clear()):
   * stop writing here (its progress would be clobbered by this tab's older state) and ask for a reload, once.
   * @param {StorageEvent} e
   */
  _onStorage(e) {
    if (!e || this.otherTab) return;
    if (e.key !== this.key && e.key !== null) return;
    let s = this._storage;
    if (s === undefined) { try { s = globalThis.localStorage ?? null; } catch { s = null; } }
    if (e.storageArea && s && e.storageArea !== s) return;   // sessionStorage / another Storage
    this.otherTab = true;
    this.dirty = null; this._settingsDirty = false;
    this._warn('otherTab', '[save] another tab wrote the save; this tab stops saving until it is reloaded');
    this._notice('otherTab');
  }

  /** Raise a one-time player notice (NOTICES key); shown through the ui as soon as it can take it. */
  _notice(kind) {
    if (!NOTICES[kind] || this._noticed.has(kind)) return;
    this._noticed.add(kind);
    this._notices.push(kind);
    this._deliver();
  }

  /** Show the pending notices: ctx.ui.toast when the ui has one (false = not ready yet: retried next step), else E.TOAST. */
  _deliver() {
    for (let i = 0; i < this._notices.length;) {
      const n = NOTICES[this._notices[i]];
      if (n.session && this.atTitle) { i++; continue; }
      let shown = true;
      try {
        const st = this.ctx.strings;
        const text = st?.has?.(n.key) ? st.t(n.key) : n.text;
        const ui = this.ctx.ui;
        if (typeof ui?.toast === 'function') shown = ui.toast(text) !== false;
        else this.ctx.bus?.emit(E.TOAST, { text, key: n.key });
      } catch { shown = true; /* never retry a throwing ui every step */ }
      // a ui without a toast layer (headless, failed boot) answers false forever: give up after ~10 s of steps
      if (shown || ++this._noticeTries > NOTICE_TRIES) this._notices.splice(i, 1); else i++;
    }
  }

  _warn(key, msg, err) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(msg, err ?? '');
  }
}

function safeParse(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
