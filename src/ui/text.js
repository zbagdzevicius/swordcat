// src/ui/text.js  (owner: ui) — pure text helpers for every screen (GAME_DESIGN §6.6, §6.8, §14): string lookup with a
// safe fallback, HTML escaping, *emphasis*, device glyphs for the [Key] tokens in tutorial / prompt strings, times,
// hearts, objectives, chapter cards and ranks. Node-safe: no DOM, imports only core/config.js.
import { LEVEL_IDS, KITTENS_BY_LEVEL } from '../core/config.js';

/**
 * UI copy the ui needs that strings.js (story) does not carry yet (requested in requests/ui.md). strings.js wins as
 * soon as it has the key.
 */
export const UI_STRINGS = Object.freeze({
  'hud.riposte': 'Riposte!',
  'menu.quitConfirm': 'Return to the title screen? Your progress up to the last Vigil Stone is kept.',
  'menu.close': 'Close',
  'pause.foundIn': '{region}',
  'pause.kittensCount': '{n}/{max} found',
  'pause.lettersCount': '{n}/{max} found',
  'credits.title': 'Credits',
  'credits.made': 'Made with love for one very small knight.',
  'credits.team': 'Design · Code · Art · Music direction: the Swordcat team',
  'credits.assets': 'Asset attribution',
  'vigil.swapNone': 'No squires yet. Rescue one!',
  'vigil.active': 'At your side',
  'results.infinite': '∞',
  'loading.hint': 'Loading',
  // ---- M2 hub shops (§13.3–§13.5) and the Quest Board (§12.5). `ui.*` keys are ui-local copy (strings.js may override).
  'ui.shop.barracks': 'Barracks',
  'ui.shop.satchel': 'Bigger Satchel {tier}',
  'ui.shop.satchel.desc': 'Carry {n} milk bottles.',
  'ui.shop.sharp': 'Sharpness {tier}',
  'ui.shop.sharp.desc': 'All your damage ×{mul}.',
  'ui.shop.quickCharge': 'Quick Charge',
  'ui.shop.quickCharge.desc': 'Charge faster: tiers at {a} s and {b} s.',
  'ui.shop.valorGain': 'Valor Gain',
  'ui.shop.valorGain.desc': '+{p}% on every Valor gain.',
  'ui.shop.waveReach': 'Holy Wave Reach',
  'ui.shop.waveReach.desc': 'Holy Wave reaches {m} m.',
  'ui.shop.confirm': 'Buy?',
  'ui.shop.confirmLong': 'Press again to buy for {n} fish.',
  'ui.shop.buyHint': 'Costs {n} fish.',
  'ui.shop.equipHint': 'Yours! Choose to equip it.',
  'ui.shop.equippedNote': 'Equipped. Looking sharp!',
  'ui.shop.maxed': 'Fully upgraded.',
  'ui.shop.bought': 'Bought!',
  'ui.shop.locked': 'Not available yet.',
  'ui.shop.lockedChip': 'Locked',
  'ui.shop.need.kittens': 'Rescue {n} lost kittens to unlock.',
  'ui.shop.need.keep.brutus': 'Beat Sir Brutus to unlock.',
  'ui.shop.need.ending.seen': 'Finish the game to unlock.',
  'ui.shop.need.town.free': 'Free Pawsbury to unlock.',
  'ui.shop.need.memeCam': 'Strike a legendary pose to unlock.',
  'ui.shop.need.shard2': 'Needs the second Dawnstone shard.',
  'ui.skin.borrowed': 'Borrowed Blade',
  'ui.skin.borrowed.desc': "Marmalade's old sword. Still a bit too big.",
  'ui.skin.twig': 'Training Twig',
  'ui.skin.twig.desc': 'Same reach, same bite. Much more leafy.',
  'ui.skin.fishbone': 'Fishbone Sword',
  'ui.skin.fishbone.desc': 'Lunch, then legend.',
  'ui.skin.baguette': 'Baguette Blade',
  'ui.skin.baguette.desc': 'Crusty on the outside. Brave on the inside.',
  'ui.skin.diamond': 'Diamond Sword',
  'ui.skin.diamond.desc': 'Sparkles for every kitten brought home.',
  'ui.skin.toobig': 'Even More Too Big',
  'ui.skin.toobig.desc': "Sir Brutus's claymore. The tip drags. She doesn't care.",
  'ui.skin.dawnblade': 'Dawnblade',
  'ui.skin.dawnblade.desc': 'The borrowed blade, glowing gold forever.',
  'ui.cape.cream': 'Faded Cream',
  'ui.cape.cream.desc': "Marmalade's old cape. Patched with love.",
  'ui.cape.red': 'Royal Red',
  'ui.cape.red.desc': 'From the Royal Wardrobe. Nothing else fit.',
  'ui.cape.memeWhite': 'Meme White',
  'ui.cape.memeWhite.desc': 'For legendary poses only.',
  'ui.cape.blue': 'Order Blue',
  'ui.cape.blue.desc': 'The colour of the old Order.',
  'ui.cape.green': 'Whiskerwood Green',
  'ui.cape.green.desc': 'Smells faintly of pine and cheese.',
  'ui.cape.midnight': 'Midnight',
  'ui.cape.midnight.desc': 'For quiet vigils under the stars.',
  'ui.cape.gold': 'Gold',
  'ui.cape.gold.desc': 'The colour of the Golden Hour.',
  'ui.look.missing': '{n} still out there',
  'ui.look.all': 'All home!',
  'ui.board.here': 'You are here',
  'ui.board.new': 'New!',
  'ui.board.replay': 'Replay',
  'ui.board.all': 'Every chapter is cleared. Replay any for fish!',
  // ---- M2 letters viewer, results bests, settings extras
  'ui.letters.from': 'Found in {region}',
  'ui.letters.none': 'Somewhere out there, a letter waits to be found.',
  'ui.letters.read': 'Read',
  'ui.results.best': 'Best: {time} · {rank}',
  'ui.results.newBest': 'New best time!',
  'ui.results.first': 'First clear!',
  'ui.results.newRank': 'New best rank!',
  'ui.settings.language': 'Language',
  'ui.settings.languageVal': 'English',
  'ui.settings.controls': 'Controls',
  'ui.settings.reset': 'Reset to defaults',
  'ui.settings.resetConfirm': 'Reset every setting to its default?',
  'ui.controls.title': 'Controls',
  'ui.boss.crit': 'Crits ×2!',
});

/** Resolve a strings key through ctx.strings (A4); a missing resolver or key falls back to UI_STRINGS, then the key. */
export function tx(ctx, key, vars = null) {
  if (key == null) return '';
  const s = ctx?.strings;
  // CONTROLS_SPEC §12 ui 3: device-aware copy: `key.touch` / `key.pad` before the base (KBM hybrid) text
  const dev = ctx?.input?.device;
  if ((dev === 'touch' || dev === 'pad') && s?.has?.(`${key}.${dev}`)) return s.t(`${key}.${dev}`, vars);
  if (s?.t && (!s.has || s.has(key))) return s.t(key, vars);
  if (UI_STRINGS[key] != null) return fill(UI_STRINGS[key], vars);
  return fill(String(key), vars);
}

/** Key or literal text (cutscene `ui` steps pass either). */
export function txt(ctx, keyOrText, vars = null) {
  if (keyOrText == null || keyOrText === false) return '';
  if (typeof keyOrText !== 'string') return String(keyOrText);
  return ctx?.strings?.has?.(keyOrText) ? tx(ctx, keyOrText, vars) : fill(keyOrText, vars);
}

/** `{name}` placeholders from `vars` (unknown placeholders stay). */
export function fill(s, vars) {
  if (!vars || typeof s !== 'string') return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** HTML-escape. */
export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]); }

/** Escaped HTML with `*emphasis*` → <em>. */
export function rich(s) { return esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>'); }

/**
 * Split text into reveal segments: [{ text, em }]. `*a*` marks emphasis (the asterisks are not revealed).
 * @param {string} s @returns {{text:string, em:boolean}[]}
 */
export function segments(s) {
  const out = [];
  const re = /\*([^*]+)\*/g;
  let last = 0, m;
  const str = String(s ?? '');
  while ((m = re.exec(str))) {
    if (m.index > last) out.push({ text: str.slice(last, m.index), em: false });
    out.push({ text: m[1], em: true });
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push({ text: str.slice(last), em: false });
  return out;
}

/** Visible character count of a segment list. */
export function segLength(segs) { let n = 0; for (const s of segs) n += s.text.length; return n; }

/** HTML for the first `n` visible characters of `segs` (escaped). */
export function revealHtml(segs, n) {
  let left = Math.max(0, n | 0), html = '';
  for (const s of segs) {
    if (left <= 0) break;
    const part = s.text.length <= left ? s.text : s.text.slice(0, left);
    left -= part.length;
    html += s.em ? `<em>${esc(part)}</em>` : esc(part);
  }
  return html;
}

/** Characters revealed after `t` seconds at `cps` × speed (§14.2: 30 chars/s × settings.dialogSpeed). */
export function revealCount(len, t, speed = 1, cps = 30) {
  if (!(len > 0)) return 0;
  return Math.min(len, Math.floor(Math.max(0, t) * cps * Math.max(0.1, speed || 1)));
}

/** Seconds until `len` characters are revealed. */
export function revealDuration(len, speed = 1, cps = 30) { return Math.max(0, len) / (cps * Math.max(0.1, speed || 1)); }

// ------------------------------------------------------------------ device glyphs (§6.6: "glyphs are swapped in by ui")
/** Short label per action and device (§15.1 keyboard, §15.2 gamepad, §15.3 touch). */
export const ACTION_GLYPH = Object.freeze({
  // CONTROLS_SPEC §6.2 preset `hybrid` (C1: Space = the Stand, F = jump, RMB = move)
  kbm: { attack: 'LMB', guard: 'Space', dodge: 'Shift', jump: 'F', interact: 'E', confirm: 'Enter', back: 'Esc', ability: 'Q', milk: 'R',
    meow: 'C', golden: 'V', pause: 'Esc', lockon: 'Tab', move: 'RMB', wasd: 'WASD', look: 'Mouse', recenter: 'F1', zoom: 'Wheel', attackMove: 'X',
    stop: 'H', camLock: 'Y', aim: 'Mouse' },
  pad: { attack: 'X', guard: 'LB', dodge: 'B', jump: 'A', interact: 'Y', confirm: 'A', back: 'B', ability: 'LT', milk: 'D-pad ↑',
    meow: 'L3', golden: 'RT', pause: 'Start', lockon: 'RB', move: 'L-stick', wasd: 'L-stick', look: 'R-stick', recenter: 'R3', zoom: 'R3', aim: 'R-stick' },
  touch: { attack: '⚔', guard: 'Stand', dodge: 'Tumble', jump: 'Jump', interact: '!', confirm: 'Tap', back: 'Back', ability: 'Kitten',
    milk: 'Milk', meow: 'Meow', golden: 'Golden', pause: '❚❚', lockon: 'Tap foe', move: 'Left thumb', wasd: 'Left thumb', look: 'Drag right',
    recenter: 'Tap', zoom: 'Pinch', aim: 'Drag' },
});

/** Semantic glyph tokens (§12 ui 3): resolve through the active bindings / device, never shown as written. */
const SEMANTIC = new Set(['stand', 'tumble', 'jump', 'move', 'attack', 'interact', 'ability', 'milk', 'meow', 'golden', 'zoom', 'ls', 'rs', 'rb']);

/** Keyboard token (as written in strings.js) → action. */
export const TOKEN_ACTION = Object.freeze({
  wasd: 'wasd', mouse: 'look', space: 'guard', shift: 'dodge', rmb: 'move', lmb: 'attack', j: 'attack', l: 'guard', k: 'dodge', f: 'jump',
  e: 'interact', enter: 'confirm', q: 'ability', r: 'milk', c: 'meow', v: 'golden', esc: 'pause', p: 'pause', tab: 'lockon', '⚔': 'attack',
  stand: 'guard', tumble: 'dodge', jump: 'jump', move: 'move', attack: 'attack', interact: 'interact', ability: 'ability', milk: 'milk',
  meow: 'meow', golden: 'golden', zoom: 'zoom', ls: 'move', rs: 'aim', rb: 'lockon', y: 'camLock', x: 'attackMove', h: 'stop',
});

/** Glyph label for an action on a device ('kbm' | 'pad' | 'touch'). */
export function actionGlyph(action, device = 'kbm') {
  const t = ACTION_GLYPH[device] ?? ACTION_GLYPH.kbm;
  return t[action] ?? ACTION_GLYPH.kbm[action] ?? String(action ?? '');
}

/** One `[token]` → keycap HTML for `device`. Unknown tokens stay as written. */
function tokenHtml(inner, device) {
  const parts = inner.split(/\s+/);
  const head = parts[0], rest = parts.slice(1).join(' ');
  const act = TOKEN_ACTION[head.toLowerCase()];
  const sem = SEMANTIC.has(head.toLowerCase());
  const label = act ? (device === 'kbm' && act !== 'attack' && !sem ? head : actionGlyph(act, device)) : head;
  const cls = act === 'attack' ? 'ui-key ui-key--sword' : 'ui-key';
  return `<kbd class="${cls}">${esc(label)}</kbd>${rest ? `<span class="ui-key-x">${esc(rest)}</span>` : ''}`;
}

/**
 * Tutorial / prompt text → HTML with device glyphs: `[Space]` becomes a keycap ("Space" / "A" / "Jump"), a bare ⚔
 * becomes the attack chip, `*x*` becomes emphasis. Everything else is escaped.
 * @param {string} text @param {'kbm'|'pad'|'touch'} [device]
 */
export function glyphify(text, device = 'kbm') {
  const str = String(text ?? '');
  let out = '', last = 0;
  const re = /\[([^\]]+)\]/g;
  let m;
  while ((m = re.exec(str))) {
    out += plainGlyphs(str.slice(last, m.index), device);
    out += tokenHtml(m[1].trim(), device);
    last = m.index + m[0].length;
  }
  out += plainGlyphs(str.slice(last), device);
  return out;
}

function plainGlyphs(s, device) {
  return rich(s).replace(/⚔/g, `<kbd class="ui-key ui-key--sword">${esc(actionGlyph('attack', device))}</kbd>`);
}

// ------------------------------------------------------------------ numbers
/** Seconds → "m:ss" (or "h:mm:ss"). */
export function formatTime(sec) {
  const s = Math.max(0, Math.floor(+sec || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/** Hearts for the HUD: one entry per heart (2 HP each): 'full' | 'half' | 'empty'. */
export function heartStates(hp, maxHp) {
  const n = Math.max(0, Math.ceil((+maxHp || 0) / 2));
  const v = Math.max(0, Math.min(+hp || 0, n * 2));
  const out = new Array(n);
  for (let i = 0; i < n; i++) { const left = v - i * 2; out[i] = left >= 2 ? 'full' : left >= 1 ? 'half' : 'empty'; }
  return out;
}

/** 0..1 fraction (safe). */
export function frac(v, max) { return max > 0 ? Math.max(0, Math.min(1, v / max)) : 0; }

/** Objective line text: `textKey` with {n, value, max, p} filled (§6.6 obj.*). */
export function objectiveText(ctx, p) {
  if (!p) return '';
  const max = p.max ?? 0, value = p.value ?? 0;
  const vars = { n: Math.floor(value), value: Math.floor(value), max, p: Math.round(frac(value, max) * 100) };
  return p.textKey ? tx(ctx, p.textKey, vars) : '';
}

// ------------------------------------------------------------------ chapters, regions, ranks
/** Level → chapter number (§4.2: the prologue and Ch. 1 share `meadow`). */
export const LEVEL_CHAPTER = Object.freeze({ meadow: 1, forest: 2, town: 3, gate: 4, bog: 5, keep: 6 });

/**
 * Chapter card text. `chapter`: a number, 'prologue' / 'epilogue', a level id, or `{ n | id, title, region, level }`.
 * @returns {{ label: string, title: string, region: string }}
 */
export function chapterInfo(ctx, chapter, levelId = null) {
  let n = chapter, title = null, region = null, level = levelId;
  let label = null;
  if (chapter && typeof chapter === 'object') {
    n = chapter.n ?? chapter.id ?? chapter.chapter; title = chapter.title ?? null; region = chapter.region ?? null;
    level = chapter.level ?? level; label = chapter.label ?? null;
  }
  if (typeof n === 'string' && LEVEL_CHAPTER[n]) { level = level ?? n; n = LEVEL_CHAPTER[n]; }
  if (typeof n === 'string' && /^\d+$/.test(n)) n = +n;
  const special = n === 'prologue' || n === 'epilogue';
  if (label == null) label = special ? tx(ctx, `ch.label.${n}`) : tx(ctx, 'ch.label', { n });
  if (!level && typeof n === 'number') level = LEVEL_IDS[n - 1] ?? null;
  if (n === 'prologue' && !level) level = 'meadow';
  return {
    label,
    title: title != null ? txt(ctx, title) : tx(ctx, `ch.${n}`),
    region: region != null ? txt(ctx, region) : (level ? tx(ctx, `region.${level}`) : ''),
  };
}

/** Rank id → strings key (§6.8 results.ranks). */
export const RANK_KEYS = Object.freeze({ pawsome: 'results.rank.pawsome', purrfect: 'results.rank.purrfect', mewtiful: 'results.rank.mewtiful' });

/** §6.8: rank by lives lost in the level (works on every difficulty). */
export function rankFor(livesLost) {
  const l = Math.max(0, livesLost | 0);
  return l <= 1 ? 'pawsome' : l <= 4 ? 'purrfect' : 'mewtiful';
}

/** Kittens found in `levelId` out of its 3 (§12.1). */
export function levelKittens(state, levelId) {
  const mine = KITTENS_BY_LEVEL[levelId] ?? [];
  const have = state?.kittens ?? [];
  let n = 0;
  for (const k of mine) if (have.includes(k)) n++;
  return { n, max: mine.length };
}

/** The Lost Letter id of a level (§6.7: one per level, 'l1'..'l6' in level order). */
export function levelLetterId(levelId) {
  const i = LEVEL_IDS.indexOf(levelId);
  return i >= 0 ? `l${i + 1}` : null;
}

/** 'memeWhite' → 'Meme White'. */
export function titleCase(id) {
  return String(id ?? '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
