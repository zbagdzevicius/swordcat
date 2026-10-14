// src/core/GameState.js  (owner: core; schema owned by save, GAME_DESIGN §19.7) — the single runtime source
// of truth for persistent progress. Serialised as a whole by save/SaveManager.js (key `swordcat.save.v1`).
// Pure; node-safe. Valor is NOT here (it is the player's, reset on level load).
import { DIFFICULTY, SETTING_VALUES } from './config.js';

/** §19.7 schema (the save agent's `defaultSave` must stay identical; `migrate` lives in save). */
export const defaultState = () => ({
  v: 1, levelId: 'meadow', spawnId: 'practice', difficulty: 'knight', playtime: 0, savedAt: 0,
  hp: 8, maxHp: 8, lives: 9, milk: 2, milkMax: 2, fish: 0,
  shards: 0, heartBells: [], kittens: [], letters: [],
  companions: { unlocked: [], active: [] },
  upgrades: { satchel: 0, sharp: 0, quickCharge: false, valorGain: false, waveReach: false },
  cosmetics: { swords: ['borrowed', 'twig'], capes: ['cream', 'red'], sword: 'borrowed', cape: 'red' },   // Token Tails: the royal red cape from the start
  levels: {},                     // { meadow: { cleared, bestRank, bestTime } }
  flags: {}, memeCamSeen: 0,
  settings: { master: 0.8, music: 0.6, sfx: 0.8, invertY: false, sensitivity: 1, quality: 'auto', shake: 1,
              reduceFlashes: false, holdStand: true, holdCharge: true, autoStand: false, patterns: false,
              subtitleSize: 1, dialogSpeed: 1, touchSize: 1,
              // CONTROLS_SPEC §10.7 (iso controls)
              controlPreset: 'hybrid', bindings: {}, camZoom: 1, camLock: true, edgePanSpeed: 1, autoAttack: 'auto',
              tapToMove: true, swipeTumble: true, castMode: 'smart', parryRing: 'auto', autoRiposte: 'auto', standAutoFace: true,
              haptics: 1, hapticTaps: false, leftHanded: false, buttonOpacity: 0.85, touchLayout: null, reduceCameraMotion: false,
              cursorSize: 1, cursorContrast: false,
              // IMPLEMENTATION_PLAN §7.4 (AUTOCAM §10, PERF §5.3, ART §11) + Phase W (WA §12). Allowed values:
              // config SETTING_VALUES. `camLock` above is RETIRED (K7): kept in sync with camLockMode until its readers move.
              // `*Auto`: the setting still follows the OS `prefers-reduced-motion` (cleared when the player edits it).
              camLockMode: 'locked', camCursorLead: 0, camZoomPortrait: 1, biggerHero: false,
              reduceCameraMotionAuto: true, reduceFlashesAuto: true, fpsCap: 'auto', batterySaver: false,
              hudMode: 'calm', hitWords: true, tutorialHints: true,
              // pathPreview: WA §3.6 'auto' | 'on' | 'off' ('auto' = touch during the prologue + Chapter 1; fx pathPreviewOn)
              pathPreview: 'auto' },
});

/** Settings that default from the OS (`prefers-reduced-motion: reduce`) until the player edits them (WCAG 2.3.3). */
export const OS_SETTINGS = Object.freeze(['reduceCameraMotion', 'reduceFlashes']);

/**
 * Save-migration hook for the settings (schema stays v1; IMPLEMENTATION_PLAN §7.4). Pure, idempotent, in place:
 * - K7 `camLock` (bool) ↔ `camLockMode`: a stored `camLock: false` with the default mode → `'free'`; an unlocked mode
 *   keeps `camLock` false (the retired key stays in sync until camera / ui read `camLockMode`).
 * - `pathPreview`: a legacy boolean (the pre-W1 toggle) becomes 'on' / 'off' (keeps what the player saw); enum strings
 *   ('auto' | 'on' | 'off') are validated.
 * - out-of-range enum values fall back to the defaults (config SETTING_VALUES).
 * @param {Record<string, any>} st  a settings object already merged onto the defaults
 * @returns {Record<string, any>} st
 */
export function migrateSettings(st) {
  if (!st || typeof st !== 'object') return st;
  const def = defaultState().settings;
  for (const [k, allowed] of Object.entries(SETTING_VALUES)) {
    if (!(k in def) || typeof allowed[0] !== 'string') continue;   // enums only (numeric ranges are [min, max])
    if (k === 'pathPreview' && typeof st[k] === 'boolean') { st[k] = st[k] ? 'on' : 'off'; continue; }
    if (!allowed.includes(st[k])) st[k] = def[k];
  }
  if (st.camLock === false && st.camLockMode === 'locked') st.camLockMode = 'free';
  else if (st.camLockMode !== 'locked') st.camLock = false;
  else if (st.camLock !== false) st.camLock = true;
  return st;
}

/**
 * The OS preference behind OS_SETTINGS (`prefers-reduced-motion: reduce`); false without matchMedia (node).
 * @param {((q: string) => {matches: boolean})|undefined} [mm]
 */
export function osReducedMotion(mm = typeof matchMedia === 'function' ? matchMedia : undefined) {
  try { return !!mm?.('(prefers-reduced-motion: reduce)')?.matches; } catch { return false; }
}

/**
 * Apply the OS preference to every OS_SETTINGS key that still follows it (`<key>Auto` true). Pure, in place.
 * @param {Record<string, any>} st @param {boolean} reduce @returns {string[]} the keys whose value changed
 */
export function applyOsSettings(st, reduce) {
  const changed = [];
  for (const k of OS_SETTINGS) {
    if (st[`${k}Auto`] === false || st[k] === !!reduce) continue;
    st[k] = !!reduce; changed.push(k);
  }
  return changed;
}

export const SAVE_KEYS = Object.keys(defaultState());

const clone = (v) => (v == null || typeof v !== 'object') ? v : JSON.parse(JSON.stringify(v));

/** Merge `data` onto the defaults: unknown keys dropped, nested plain objects merged one level deep. */
function mergeOntoDefaults(data) {
  const base = defaultState();
  if (!data || typeof data !== 'object') return base;
  for (const k of SAVE_KEYS) {
    if (!(k in data)) continue;
    const b = base[k], d = data[k];
    if (b && typeof b === 'object' && !Array.isArray(b) && d && typeof d === 'object' && !Array.isArray(d)) base[k] = { ...b, ...clone(d) };
    else base[k] = clone(d);
  }
  migrateSettings(base.settings);
  return base;
}

export class GameState {
  /** @param {object} [data] a (migrated) save */
  constructor(data) {
    /** runtime-only scratch (never saved), e.g. per-level timers; areas namespace their keys */
    this.runtime = {};
    this._diffCache = new Map();
    this.reset(data);
  }

  /** Replace everything with `data` merged onto the §19.7 defaults. */
  reset(data) {
    const merged = mergeOntoDefaults(data);
    for (const k of SAVE_KEYS) this[k] = merged[k];
    this.runtime = {};
    return this;
  }

  /** Plain JSON snapshot of the saved fields. */
  toJSON() {
    const out = {};
    for (const k of SAVE_KEYS) out[k] = clone(this[k]);
    return out;
  }

  /**
   * Active difficulty row (§7.9 / Appendix A DIFFICULTY) plus the helpers Combat.applyHit uses:
   * `roundTaken(dmg)` (damage the player takes) and `playerDmgMul` (multiplier on damage she deals).
   */
  get difficultyCfg() {
    const id = DIFFICULTY[this.difficulty] ? this.difficulty : 'knight';
    let c = this._diffCache.get(id);
    if (!c) {
      const d = DIFFICULTY[id];
      c = { id, ...d, roundTaken: (dmg) => d.taken(dmg), playerDmgMul: d.playerDmgMul ?? 1 };
      this._diffCache.set(id, c);
    }
    return c;
  }

  /** Raw flag value (undefined if unset). Story's ctx.story.flag() is the API that also emits FLAG_SET. */
  getFlag(key) { return this.flags[key]; }
  setFlag(key, value = true) { this.flags[key] = value; }

  /**
   * Evaluate a flag condition used by level/cutscene data: 'a.b', '!a.b', 'a && !b', 'a || b'.
   * A flag is true when set to anything other than false/undefined/null/0.
   */
  cond(expr) {
    if (expr == null || expr === '' || expr === true) return true;
    if (expr === false) return false;
    return String(expr).split('||').some((alt) => alt.split('&&').every((term) => {
      let t = term.trim(), neg = false;
      while (t.startsWith('!')) { neg = !neg; t = t.slice(1).trim(); }
      const v = this.flags[t];
      const on = v !== undefined && v !== null && v !== false && v !== 0;
      return neg ? !on : on;
    }));
  }

  hasKitten(id) { return this.kittens.includes(id); }
  addKitten(id) { if (!this.kittens.includes(id)) this.kittens.push(id); }
  get kittenCount() { return this.kittens.length; }
}
