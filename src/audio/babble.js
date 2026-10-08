// src/audio/babble.js  (owner: audio) — GAME_DESIGN §16.4 voice babble (no voice acting): one blip per 3 typed
// characters from the speaker's pool at ±5% pitch, typewriter at 30 chars/s. Pure data + planner (node-safe).
import { seq } from './sfxMap.js';

export const BABBLE = {
  cps: 30,              // typewriter speed (× settings.dialogSpeed)
  every: 3,             // one blip per 3 typed (non-space) characters
  pitchVar: 0.05,       // ±5%
  slice: [0.085, 0.12], // seconds of the source played per blip (from its onset)
  attack: 0.005, release: 0.035,
  vol: 0.4,
  maxBlips: 80,
};

/**
 * @typedef {object} BabbleVoice
 * @property {string[]} pool   sfx file ids
 * @property {number} rate     base playback rate
 * @property {number} [vol]
 * @property {'blip'|'once'|'laugh'} [mode]  'once' = one sound per line (Pudding's roar); 'laugh' = laugh-build syllables
 */

/** §16.4 table. Keys are normalised speaker ids (see speakerKey). @type {Record<string, BabbleVoice>} */
export const VOICES = {
  swordcat:      { pool: ['cat/cat_softmew', 'cat/kitten_mew_01'], rate: 1.25, vol: 0.32 },     // quiet
  pearl:         { pool: ['cat/kitten_mew_01'], rate: 1.45 },
  mochi:         { pool: seq('cat/cute_creature_', 1, 3), rate: 0.95 },
  sage:          { pool: seq('cat/cute_creature_', 4, 5), rate: 1.1 },
  clover:        { pool: seq('cat/cute_creature_', 6, 7), rate: 1.0 },
  earlgrey:      { pool: ['cat/cute_creature_08'], rate: 0.85 },
  pip:           { pool: seq('cat/cute_creature_', 9, 10), rate: 1.4 },
  tofu:          { pool: ['cat/cute_creature_03'], rate: 1.2 },
  marmalade:     { pool: ['cat/meow_01'], rate: 0.75 },
  snowpaw:       { pool: ['cat/meow_baby_01'], rate: 1.2 },
  whiskerbottom: { pool: ['cat/meow_01'], rate: 0.9 },
  pudding:       { pool: ['creature/creature_roar_01'], rate: 0.8, mode: 'once', vol: 0.55 },
  hyena:         { pool: [], rate: 1.3, mode: 'laugh' },
  pilfer:        { pool: [], rate: 1.4, mode: 'laugh' },
  cacklejaw:     { pool: [], rate: 1.0, mode: 'laugh' },
  barkus:        { pool: ['creature/c80_barking_01'], rate: 0.7, vol: 0.45 },
  brutus:        { pool: ['creature/rpg_giant1'], rate: 1.0, vol: 0.45 },
  grizzlechop:   { pool: ['creature/rat_squeak_attack'], rate: 0.9, vol: 0.4 },
  coo:           { pool: ['creature/animal_peeps'], rate: 0.7 },
  /** villagers, lost kittens, squires, old knights: a random chirp */
  default:       { pool: seq('cat/cute_creature_', 1, 10), rate: 1.05 },
  /** narration / captions / the statue: silent */
  none:          { pool: [], rate: 1, mode: 'blip' },
};

/** Aliases (display names, cutscene ids) → VOICES key. */
export const SPEAKER_ALIASES = {
  clem: 'swordcat', clementine: 'swordcat', swordcat: 'swordcat', player: 'swordcat', sirswordcat: 'swordcat',
  sergeantwhiskerbottom: 'whiskerbottom', sgtwhiskerbottom: 'whiskerbottom', sirwhiskerbottom: 'whiskerbottom',
  earl: 'earlgrey', earlgrey: 'earlgrey', sirearlgrey: 'earlgrey',
  warchiefcacklejaw: 'cacklejaw', captaingrizzlechop: 'grizzlechop', sirbrutus: 'brutus', lordbarkus: 'barkus',
  barkusgrimjaw: 'barkus', lordbarkusgrimjaw: 'barkus', pilfer: 'pilfer', poststealer: 'pilfer',
  narrator: 'none', caption: 'none', system: 'none', tallbert: 'none', sirtallbert: 'none', statue: 'none',
};

/** Normalise a speaker (actor id or display name) to a VOICES key. */
export function speakerKey(speaker) {
  if (speaker == null) return 'none';
  const raw = typeof speaker === 'object' ? (speaker.actorId ?? speaker.kittenId ?? speaker.npcId ?? speaker.id ?? speaker.name ?? '') : speaker;
  const k = String(raw).toLowerCase().replace(/[^a-z]/g, '');
  if (!k) return 'none';
  if (SPEAKER_ALIASES[k]) return SPEAKER_ALIASES[k];
  if (VOICES[k]) return k;
  if (k.startsWith('hyena')) return 'hyena';
  return 'default';
}

/** Voice row for a speaker. */
export function voiceFor(speaker) { return VOICES[speakerKey(speaker)] ?? VOICES.default; }

/**
 * Blip times for a line: one per `every` typed non-space characters at `cps` (× `speed`).
 * Returns seconds after the line starts. 'once' voices get [0]; empty text or a silent voice gives [].
 */
export function babblePlan(text, { speed = 1, mode = 'blip', cps = BABBLE.cps, every = BABBLE.every, max = BABBLE.maxBlips } = {}) {
  const s = String(text ?? '');
  if (!s.trim()) return [];
  if (mode === 'once') return [0];
  const rate = cps * Math.max(0.1, speed), out = [];
  let count = 0;
  for (let i = 0; i < s.length && out.length < max; i++) {
    const ch = s[i];
    if (/\s/.test(ch) || /[.,!?;:…—–\-()"'*]/.test(ch)) continue;
    if (count++ % every === 0) out.push(i / rate);
  }
  return out;
}

/** Every file id babble may play (manifest + U15). */
export function babbleFileIds() {
  const out = new Set();
  for (const v of Object.values(VOICES)) for (const f of v.pool) out.add(f);
  return [...out];
}
