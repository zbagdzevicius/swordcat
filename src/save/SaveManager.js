// src/save/SaveManager.js  (owner: save) — M0 STUB: tech.md §16 + GAME_DESIGN §19.7 schema.
//   load() → migrated data | null;  write(d) → bool;  clear();  defaultSave();  migrate(d)
// Autosaves ctx.state on CHECKPOINT, LEVEL_LOADED, KITTEN_RESCUED, cutscene:end, objective done
// (never in ?test). All storage access is wrapped: private mode / quota must not crash the game.
import { E } from '../core/events.js';
import { defaultState } from '../core/GameState.js';

export const KEY = 'swordcat.save.v1';

/** §19.7 schema (identical to core GameState.defaultState). */
export const defaultSave = () => defaultState();

/** Upgrade any older shape (incl. tech.md's original v1: hp 6, holy) to the §19.7 schema. */
export function migrate(d) {
  if (!d || typeof d !== 'object') return null;
  const base = defaultSave();
  const out = { ...base, ...d, settings: { ...base.settings, ...(d.settings ?? {}) } };
  if ('holy' in out) delete out.holy;
  if ('inventory' in out) delete out.inventory;
  if ('quests' in out) delete out.quests;
  if (!(d.maxHp >= 8)) { out.maxHp = 8; out.hp = Math.min(Math.max(d.hp ?? 8, 8), 8); }
  for (const k of ['companions', 'upgrades', 'cosmetics']) out[k] = { ...base[k], ...(d[k] ?? {}) };
  out.v = 1;
  return out;
}

export class SaveManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.enabled = !ctx?.params?.test;
    this._offs = [];
  }

  async init() {
    const bus = this.ctx.bus, autosave = () => this.save();
    this._offs.push(
      bus.on(E.CHECKPOINT, autosave), bus.on(E.LEVEL_LOADED, autosave), bus.on(E.KITTEN_RESCUED, autosave),
      bus.on(E.CUTSCENE_END, autosave), bus.on(E.OBJECTIVE, (p) => { if (p?.done) autosave(); }),
      bus.on(E.SAVE_REQUEST, autosave), bus.on(E.SETTINGS_CHANGED, autosave),
    );
  }

  /** Persist ctx.state now. */
  save() { return this.enabled ? this.write(this.ctx.state.toJSON()) : false; }

  load() { try { const raw = localStorage.getItem(KEY); return raw ? migrate(JSON.parse(raw)) : null; } catch { return null; } }
  write(d) { try { localStorage.setItem(KEY, JSON.stringify({ ...d, savedAt: Date.now() })); return true; } catch (e) { console.warn('[save] failed', e); return false; } }
  clear() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

  update(dt) {}
  dispose() { for (const off of this._offs) off(); this._offs.length = 0; }
}
