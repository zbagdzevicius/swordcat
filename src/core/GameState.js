// src/core/GameState.js  (owner: core; schema owned by save, GAME_DESIGN §19.7) — the single runtime source
// of truth for persistent progress. Serialised as a whole by save/SaveManager.js (key `swordcat.save.v1`).
// Pure; node-safe. Valor is NOT here (it is the player's, reset on level load).
import { DIFFICULTY } from './config.js';

/** §19.7 schema (the save agent's `defaultSave` must stay identical; `migrate` lives in save). */
export const defaultState = () => ({
  v: 1, levelId: 'meadow', spawnId: 'practice', difficulty: 'knight', playtime: 0, savedAt: 0,
  hp: 8, maxHp: 8, lives: 9, milk: 2, milkMax: 2, fish: 0,
  shards: 0, heartBells: [], kittens: [], letters: [],
  companions: { unlocked: [], active: [] },
  upgrades: { satchel: 0, sharp: 0, quickCharge: false, valorGain: false, waveReach: false },
  cosmetics: { swords: ['borrowed', 'twig'], capes: ['cream'], sword: 'borrowed', cape: 'cream' },
  levels: {},                     // { meadow: { cleared, bestRank, bestTime } }
  flags: {}, memeCamSeen: 0,
  settings: { master: 0.8, music: 0.6, sfx: 0.8, invertY: false, sensitivity: 1, quality: 'auto', shake: 1,
              reduceFlashes: false, holdStand: true, holdCharge: true, autoStand: false, patterns: false,
              subtitleSize: 1, dialogSpeed: 1, touchSize: 1 },
});

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
