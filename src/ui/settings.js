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
 * @property {'classic'|'iso'} [cam]  only shown under that camera (CONTROLS_SPEC §10.7: invertY is classic-only)
 * @property {Dev|Dev[]} [dev]  only shown while the last-used input device is one of these (rows that do nothing on
 *   the current device are hidden: no cursor / edge-pan rows on a phone, no touch-button rows at a desk)
 * @property {Dev|Dev[]} [isoDev]  like `dev`, but only applied under the iso camera (look sensitivity: iso has no
 *   mouse / touch look, only the pad's right-stick nudge; classic keeps it for every device)
 */
/** @typedef {'kbm'|'touch'|'pad'} Dev */

/** @type {SettingDef[]} */
export const SETTINGS = Object.freeze([
  { key: 'master', type: 'slider', label: 'settings.master', group: 'audio', min: 0, max: 1, step: 0.05, fmt: 'pct' },
  { key: 'music', type: 'slider', label: 'settings.music', group: 'audio', min: 0, max: 1, step: 0.05, fmt: 'pct' },
  { key: 'sfx', type: 'slider', label: 'settings.sfx', group: 'audio', min: 0, max: 1, step: 0.05, fmt: 'pct' },
  { key: 'invertY', type: 'toggle', label: 'settings.invertY', group: 'controls', cam: 'classic' },
  { key: 'sensitivity', type: 'slider', label: 'settings.sensitivity', group: 'controls', isoDev: 'pad', min: 0.25, max: 2.5, step: 0.05, fmt: 'mul' },
  { key: 'holdStand', type: 'toggle', label: 'settings.holdStand', group: 'controls', onOff: ['Toggle', 'Hold'] },
  { key: 'holdCharge', type: 'toggle', label: 'settings.holdCharge', group: 'controls', onOff: ['Toggle', 'Hold'] },
  { key: 'autoStand', type: 'toggle', label: 'settings.autoStand', group: 'controls' },
  // CONTROLS_SPEC §10.7: the iso controls
  { key: 'controlPreset', type: 'choice', label: 'settings.controlPreset', group: 'controls', dev: 'kbm', options: ['hybrid', 'moba', 'diablo', 'mouseOnly', 'keyboardOnly'],
    optionLabels: ['Hybrid', 'MOBA', 'Diablo', 'Mouse only', 'Keyboard only'] },
  // AUTOCAM §10.3 / §10.4 / §12 camera rows (IMPLEMENTATION_PLAN §7.4; camLockMode replaces the camLock toggle, X19)
  { key: 'camZoom', type: 'slider', label: 'settings.camZoom', group: 'camera', min: 0.7, max: 1.4, step: 0.05, fmt: 'mul' },
  { key: 'camZoomPortrait', type: 'slider', label: 'settings.camZoomPortrait', group: 'camera', cam: 'iso', dev: 'touch', min: 0.7, max: 1.4, step: 0.05, fmt: 'mul' },
  { key: 'camLockMode', type: 'choice', label: 'settings.camLockMode', group: 'camera', cam: 'iso', dev: 'kbm', options: ['locked', 'semi', 'free'],
    optionLabels: ['settings.camLockMode.locked', 'settings.camLockMode.semi', 'settings.camLockMode.free'] },
  { key: 'camCursorLead', type: 'slider', label: 'settings.camCursorLead', group: 'camera', cam: 'iso', dev: 'kbm', min: 0, max: 0.15, step: 0.05, fmt: 'pct' },
  { key: 'biggerHero', type: 'toggle', label: 'settings.biggerHero', group: 'camera', cam: 'iso' },
  { key: 'autoAttack', type: 'choice', label: 'settings.autoAttack', group: 'controls', options: ['auto', 'chain', 'loop', 'off'], optionLabels: ['Auto', 'One combo', 'Keep going', 'Off'] },
  { key: 'castMode', type: 'choice', label: 'settings.castMode', group: 'controls', options: ['smart', 'indicator', 'dragOnly'], optionLabels: ['Smart', 'Show first', 'Drag only'] },
  { key: 'autoRiposte', type: 'choice', label: 'settings.autoRiposte', group: 'controls', options: ['auto', 'on', 'off'], optionLabels: ['Auto', 'On', 'Off'] },
  { key: 'standAutoFace', type: 'toggle', label: 'settings.standAutoFace', group: 'controls' },
  { key: 'pathPreview', type: 'toggle', label: 'settings.pathPreview', group: 'controls' },
  { key: 'edgePanSpeed', type: 'slider', label: 'settings.edgePanSpeed', group: 'camera', cam: 'iso', dev: 'kbm', min: 0.5, max: 2, step: 0.25, fmt: 'mul' },
  { key: 'touchSize', type: 'choice', label: 'settings.touchSize', group: 'controls', dev: 'touch', options: [0.8, 1, 1.2, 1.4], optionLabels: ['S', 'M', 'L', 'XL'] },
  { key: 'tapToMove', type: 'toggle', label: 'settings.tapToMove', group: 'controls', dev: 'touch' },
  { key: 'swipeTumble', type: 'toggle', label: 'settings.swipeTumble', group: 'controls', dev: 'touch' },
  { key: 'leftHanded', type: 'toggle', label: 'settings.leftHanded', group: 'controls', dev: 'touch' },
  { key: 'buttonOpacity', type: 'slider', label: 'settings.buttonOpacity', group: 'controls', dev: 'touch', min: 0.4, max: 1, step: 0.05, fmt: 'pct' },
  { key: 'haptics', type: 'choice', label: 'settings.haptics', group: 'controls', dev: ['touch', 'pad'], options: [0, 0.5, 1], optionLabels: ['Off', 'Soft', 'On'] },
  { key: 'hapticTaps', type: 'toggle', label: 'settings.hapticTaps', group: 'controls', dev: 'touch' },
  { key: 'difficulty', type: 'choice', label: 'settings.difficulty', group: 'game', options: ['kitten', 'knight'], optionLabels: ['difficulty.kitten', 'difficulty.knight'] },
  // WA §4.1 / §5.3 / §7.5
  { key: 'hudMode', type: 'choice', label: 'settings.hudMode', group: 'game', options: ['calm', 'full'], optionLabels: ['settings.hudMode.calm', 'settings.hudMode.full'] },
  { key: 'hitWords', type: 'toggle', label: 'settings.hitWords', group: 'game' },
  { key: 'tutorialHints', type: 'toggle', label: 'settings.tutorialHints', group: 'game' },
  // PERF I4: the quality panel (Low / Med / High / Auto, the FPS cap, Battery saver)
  { key: 'quality', type: 'choice', label: 'settings.quality', group: 'perf', options: ['auto', 'low', 'med', 'high'],
    optionLabels: ['settings.quality.auto', 'settings.quality.low', 'settings.quality.med', 'settings.quality.high'] },
  { key: 'fpsCap', type: 'choice', label: 'settings.fpsCap', group: 'perf', options: ['auto', 30, 60, 'off'], optionLabels: ['settings.fpsCap.auto', '30', '60', 'settings.fpsCap.off'] },
  { key: 'batterySaver', type: 'toggle', label: 'settings.batterySaver', group: 'perf' },
  { key: 'shake', type: 'slider', label: 'settings.shake', group: 'access', min: 0, max: 1, step: 0.1, fmt: 'pct' },
  { key: 'reduceCameraMotion', type: 'toggle', label: 'settings.reduceCameraMotion', group: 'access' },
  { key: 'parryRing', type: 'choice', label: 'settings.parryRing', group: 'access', options: ['auto', 'on', 'off'], optionLabels: ['Auto', 'On', 'Off'] },
  { key: 'cursorSize', type: 'choice', label: 'settings.cursorSize', group: 'access', dev: 'kbm', options: [1, 1.5, 2], optionLabels: ['×1', '×1.5', '×2'] },
  { key: 'cursorContrast', type: 'toggle', label: 'settings.cursorContrast', group: 'access', dev: 'kbm' },
  { key: 'reduceFlashes', type: 'toggle', label: 'settings.reduceFlashes', group: 'access' },
  { key: 'patterns', type: 'toggle', label: 'settings.patterns', group: 'access' },
  { key: 'subtitleSize', type: 'choice', label: 'settings.subtitleSize', group: 'access', options: [0.85, 1, 1.25, 1.5], optionLabels: ['S', 'M', 'L', 'XL'] },
  { key: 'dialogSpeed', type: 'choice', label: 'settings.dialogSpeed', group: 'access', options: [0.5, 0.75, 1, 1.5, 2, 4], fmt: 'speed' },
]);

/** Section headings (literal; menus are English-only until localisation [STRETCH]). */
export const SETTING_GROUPS = Object.freeze({ audio: 'Sound', controls: 'Controls', camera: 'Camera', game: 'Game', perf: 'Performance', access: 'Accessibility' });

export const SETTING_BY_KEY = Object.freeze(Object.fromEntries(SETTINGS.map((d) => [d.key, d])));

const round = (v, step) => Math.round(v / step) * step;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const devIn = (list, d) => (Array.isArray(list) ? list.includes(d) : list === d);

/**
 * Is the row shown under the current camera and input device? (`cam: 'classic'` rows only with ?cam=classic, `'iso'`
 * only in iso; `dev` / `isoDev` rows only on those devices.) `device` omitted / null = no device filter.
 * @param {SettingDef} def @param {boolean} [iso] @param {Dev|null} [device]
 */
export function settingVisible(def, iso = true, device = null) {
  if (def.cam === 'classic' && iso) return false;
  if (def.cam === 'iso' && !iso) return false;
  if (device) {
    if (def.dev && !devIn(def.dev, device)) return false;
    if (iso && def.isoDev && !devIn(def.isoDev, device)) return false;
  }
  return true;
}

/**
 * The rows to show, in display order, grouped (one header per group). On touch the Controls group comes first and its
 * touch rows lead it (CONTROLS_SPEC §9: a phone player opens Settings to resize / move buttons, not to scroll past
 * Sound). Pure.
 * @param {boolean} [iso] @param {Dev|null} [device]
 * @returns {SettingDef[]}
 */
export function visibleSettings(iso = true, device = null) {
  const rows = SETTINGS.filter((d) => settingVisible(d, iso, device));
  const order = device === 'touch' ? GROUP_ORDER_TOUCH : GROUP_ORDER;
  const rank = (d) => {
    const g = order.indexOf(d.group);
    return (g < 0 ? order.length : g) * 2 + (device === 'touch' && d.group === 'controls' && !devIn(d.dev, 'touch') ? 1 : 0);
  };
  return rows.map((d, i) => [d, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);
}

/** Group display order (one header per group); on touch Controls (touch rows first) and Camera lead. */
const GROUP_ORDER = ['audio', 'controls', 'camera', 'game', 'perf', 'access'];
const GROUP_ORDER_TOUCH = ['controls', 'camera', 'audio', 'game', 'perf', 'access'];

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
    // K7: the retired boolean camLock stays in sync with camLockMode until its readers move
    if (key === 'camLockMode' && 'camLock' in st.settings) st.settings.camLock = value === 'locked';
  }
  ctx.bus?.emit(E.SETTINGS_CHANGED, { key, value });
  return value;
}

/**
 * Reset every §14.3 setting to the §19.7 defaults (difficulty is a save property, not a setting: kept). Writes each
 * changed key through applySetting so audio / core / save react. Returns the keys that changed.
 */
export function resetSettings(ctx, defaults) {
  const st = ctx?.state;
  if (!st || !defaults) return [];
  const changed = [];
  for (const def of SETTINGS) {
    if (def.key === 'difficulty' || !(def.key in defaults)) continue;
    if (st.settings?.[def.key] !== defaults[def.key]) { applySetting(ctx, def.key, defaults[def.key]); changed.push(def.key); }
  }
  return changed;
}

/**
 * The Controls card (CONTROLS_SPEC §6.2–§6.4): [action, label] rows; glyphs come from text.js per device (the KBM
 * column follows the previewed preset).
 */
export const CONTROL_ROWS = Object.freeze([
  ['move', 'Move · click / hold to walk'], ['attack', 'Attack · hold to charge'], ['attackMove', 'Attack-move'],
  ['guard', 'Stand · tap to parry'], ['dodge', 'Tumble'], ['jump', 'Jump · ⚔ in the air: Pounce'], ['interact', 'Interact · talk'],
  ['ability', 'Kitten ability'], ['milk', 'Milk Break'], ['meow', 'Meow'], ['golden', 'Golden Hour'],
  ['lockon', 'Select / cycle target'], ['stop', 'Stop'], ['zoom', 'Zoom'], ['camLock', 'Camera lock'], ['peek', 'Peek ahead'],
  ['pause', 'Pause · hold to skip scenes'],
]);
