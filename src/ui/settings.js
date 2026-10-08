// src/ui/settings.js  (owner: ui) — the Settings screen schema (GAME_DESIGN §14.3 + §14.4 accessibility) and the pure
// helpers that step / format / apply a value. Writing a setting = state.settings[key] = v, then `settings:changed
// {key, value}` (save autosaves, core re-applies quality, audio re-reads volumes). Difficulty lives in
// state.difficulty (not settings) and announces itself with the same event (the player re-reads its lives rules).
// Node-safe: no DOM.
import { E } from '../core/events.js';
import { DIFFICULTY } from '../core/config.js';

/**
 * @typedef {object} SettingDef
 * @property {string} key       state.settings key (or 'difficulty')
 * @property {'slider'|'toggle'|'choice'} type
 * @property {string} label     strings key
 * @property {string} group     section heading id
 * @property {number} [min] @property {number} [max] @property {number} [step]
 * @property {(number|string)[]} [options]  choice values
 * @property {string[]} [optionLabels]      strings keys or literal labels per option
 * @property {'pct'|'mul'|'speed'} [fmt]
 * @property {string[]} [onOff]  toggle labels [off, on] (strings keys or literal)
 */

/** @type {SettingDef[]} */
export const SETTINGS = Object.freeze([
  { key: 'master', type: 'slider', label: 'settings.master', group: 'audio', min: 0, max: 1, step: 0.05, fmt: 'pct' },
  { key: 'music', type: 'slider', label: 'settings.music', group: 'audio', min: 0, max: 1, step: 0.05, fmt: 'pct' },
  { key: 'sfx', type: 'slider', label: 'settings.sfx', group: 'audio', min: 0, max: 1, step: 0.05, fmt: 'pct' },
  { key: 'invertY', type: 'toggle', label: 'settings.invertY', group: 'controls' },
  { key: 'sensitivity', type: 'slider', label: 'settings.sensitivity', group: 'controls', min: 0.25, max: 2.5, step: 0.05, fmt: 'mul' },
  { key: 'holdStand', type: 'toggle', label: 'settings.holdStand', group: 'controls', onOff: ['Toggle', 'Hold'] },
  { key: 'holdCharge', type: 'toggle', label: 'settings.holdCharge', group: 'controls', onOff: ['Toggle', 'Hold'] },
  { key: 'autoStand', type: 'toggle', label: 'settings.autoStand', group: 'controls' },
  { key: 'touchSize', type: 'choice', label: 'settings.touchSize', group: 'controls', options: [0.8, 1, 1.2, 1.4], optionLabels: ['S', 'M', 'L', 'XL'] },
  { key: 'difficulty', type: 'choice', label: 'settings.difficulty', group: 'game', options: ['kitten', 'knight'], optionLabels: ['difficulty.kitten', 'difficulty.knight'] },
  { key: 'quality', type: 'choice', label: 'settings.quality', group: 'game', options: ['auto', 'low', 'med', 'high'],
    optionLabels: ['settings.quality.auto', 'settings.quality.low', 'settings.quality.med', 'settings.quality.high'] },
  { key: 'shake', type: 'slider', label: 'settings.shake', group: 'access', min: 0, max: 1, step: 0.1, fmt: 'pct' },
  { key: 'reduceFlashes', type: 'toggle', label: 'settings.reduceFlashes', group: 'access' },
  { key: 'patterns', type: 'toggle', label: 'settings.patterns', group: 'access' },
  { key: 'subtitleSize', type: 'choice', label: 'settings.subtitleSize', group: 'access', options: [0.85, 1, 1.25, 1.5], optionLabels: ['S', 'M', 'L', 'XL'] },
  { key: 'dialogSpeed', type: 'choice', label: 'settings.dialogSpeed', group: 'access', options: [0.5, 0.75, 1, 1.5, 2, 4], fmt: 'speed' },
]);

/** Section headings (literal; menus are English-only until localisation [STRETCH]). */
export const SETTING_GROUPS = Object.freeze({ audio: 'Sound', controls: 'Controls', game: 'Game', access: 'Accessibility' });

export const SETTING_BY_KEY = Object.freeze(Object.fromEntries(SETTINGS.map((d) => [d.key, d])));

const round = (v, step) => Math.round(v / step) * step;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Current value of a setting (difficulty from state.difficulty). */
export function readSetting(state, key) {
  if (key === 'difficulty') return state?.difficulty ?? 'knight';
  return state?.settings?.[key];
}

/** Is the setting locked? (§7.9: Nine Lives is fixed for the save, so difficulty can't change.) */
export function settingLocked(state, key) { return key === 'difficulty' && state?.difficulty === 'nine'; }

/**
 * Next value after one step `dir` (−1 / +1; toggles flip on any non-zero dir). Pure.
 * @param {SettingDef} def @param {any} value @param {number} dir
 */
export function stepSetting(def, value, dir) {
  if (!def || !dir) return value;
  if (def.type === 'toggle') return !value;
  if (def.type === 'slider') {
    const v = typeof value === 'number' ? value : def.min;
    return +clamp(round(v + Math.sign(dir) * def.step, def.step), def.min, def.max).toFixed(4);
  }
  const opts = def.options ?? [];
  if (!opts.length) return value;
  let i = opts.indexOf(value);
  if (i < 0) i = nearestIndex(opts, value);
  i = clamp(i + Math.sign(dir), 0, opts.length - 1);
  return opts[i];
}

/** Slider value from a 0..1 track position (pointer drags). Pure. */
export function sliderFromFrac(def, f) {
  const v = def.min + clamp(f, 0, 1) * (def.max - def.min);
  return +clamp(round(v, def.step), def.min, def.max).toFixed(4);
}

/** 0..1 track position of a slider value. Pure. */
export function sliderFrac(def, v) { return def.max > def.min ? clamp(((+v || 0) - def.min) / (def.max - def.min), 0, 1) : 0; }

function nearestIndex(opts, v) {
  if (typeof v !== 'number') return 0;
  let best = 0, bd = Infinity;
  opts.forEach((o, i) => { const d = Math.abs(o - v); if (d < bd) { bd = d; best = i; } });
  return best;
}

/**
 * Display text for a value. `t(key)` resolves strings keys (literal labels pass through).
 * @param {SettingDef} def @param {any} v @param {(k:string)=>string} [t]
 */
export function formatSetting(def, v, t = (k) => k) {
  const lab = (k) => { const s = t(k); return s ?? k; };
  if (def.type === 'toggle') {
    if (def.onOff) return v ? def.onOff[1] : def.onOff[0];
    return v ? lab('settings.on') : lab('settings.off');
  }
  if (def.type === 'slider') {
    if (def.fmt === 'pct') return `${Math.round((+v || 0) * 100)}%`;
    if (def.fmt === 'mul') return `×${(+v || 0).toFixed(2)}`;
    return String(v);
  }
  const i = (def.options ?? []).indexOf(v);
  if (def.optionLabels && i >= 0) return lab(def.optionLabels[i]);
  if (def.fmt === 'speed') return `×${v}`;
  return String(v ?? '');
}

/**
 * Write a setting and announce it (`settings:changed {key, value}`). Returns the stored value. Validates difficulty
 * against Appendix A and refuses to leave Nine Lives (§7.9).
 */
export function applySetting(ctx, key, value) {
  const st = ctx?.state;
  if (!st) return value;
  if (key === 'difficulty') {
    if (!DIFFICULTY[value] || settingLocked(st, key)) return st.difficulty;
    st.difficulty = value;
  } else {
    st.settings ??= {};
    st.settings[key] = value;
  }
  ctx.bus?.emit(E.SETTINGS_CHANGED, { key, value });
  return value;
}
