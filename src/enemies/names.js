// src/enemies/names.js  (owner: enemies) — WARM_ADVENTURE_SPEC §8.2 / §8.3 display vocabulary for this area: what a
// foe is called on screen (ids never change: `bonehead`, `jelly` stay), and the HATER plates' friend words.
//   Hound Legion → the Woof Brigade (pugs are "Brigadiers") · Grimjaw → Grumpjaw · Warchief → Big Chief ·
//   Gloomjelly → Wobblejelly · Bonehead → Squeakybone · 'POST STEALER' → 'POSTMASTER' · 'HATER-IN-CHIEF' → 'HYPE-IN-CHIEF'.
// Strings are display text (or `name.*` string keys when story provides them: ui resolves keys through `tx`).
import { ENEMIES, BOSSES } from '../core/config.js';

/** Display names by type id (WA §8.2). Boss names are HUD boss-bar titles (upper case, as the bar sets them). */
export const DISPLAY_NAMES = Object.freeze({
  rat_pike: 'Rat Militia Pikeman', rat_xbow: 'Rat Militia Crossbowman', crow: 'Crow', spider: 'Fuzzball',
  hyena: 'Snickerpack Hyena', stealer: 'Snickerpack Post Pincher', pug: 'Woof Brigadier', warhound: 'Woof Brigade Hound',
  jelly: 'Wobblejelly', jelly_l: 'Wobblejelly', jelly_m: 'Wobblejelly', jelly_s: 'Wobblejelly', jelly_giant: 'Giant Wobblejelly',
  bonehead: 'Squeakybone', bat: 'Bat', hornet: 'Hornet',
  boss_grizzlechop: 'CAPTAIN GRIZZLECHOP', boss_cacklejaw: 'BIG CHIEF CACKLEJAW',
  boss_brutus: 'SIR BRUTUS OF THE WOOF BRIGADE', boss_barkus: 'LORD BARKUS GRUMPJAW',
});

/** Words that may never appear in a foe's display name (WA §8.2 / §8.6: no grim or war vocabulary). */
export const BANNED_NAME_WORDS = Object.freeze(['legion', 'grimjaw', 'warchief', 'gloom', 'bonehead', 'death', 'slain', 'kill', 'warlord', 'champion of the legion']);

/** WA §8.3 friend words for plates that are not in an ENEMIES row (Pilfer, Cacklejaw). */
export const FRIEND_WORDS = Object.freeze({ 'POST STEALER': 'POSTMASTER', 'HATER-IN-CHIEF': 'HYPE-IN-CHIEF' });

/**
 * The display name of a type id (bonehead variants and unknown rows fall back to their family, then to the id).
 * @param {string} id
 */
export function displayNameFor(id) {
  const t = String(id ?? '');
  if (DISPLAY_NAMES[t]) return DISPLAY_NAMES[t];
  if (t.startsWith('bonehead')) return DISPLAY_NAMES.bonehead;
  if (t.startsWith('jelly')) return DISPLAY_NAMES.jelly;
  if (t.startsWith('boss_')) return BOSSES[t.slice(5)]?.name ?? t;
  return t;
}

/**
 * WA §8.3: the friend word paired with plate word `word` (same index in `plateWordsFriend` as in `plateWords`), else the
 * FRIEND_WORDS table; null when there is none (the plate stays as it is).
 * @param {string} type the ENEMIES row id (hyena, stealer...) @param {string|null} word
 */
export function friendWordFor(type, word) {
  if (!word) return null;
  const row = ENEMIES[type];
  const i = row?.plateWords?.indexOf?.(word) ?? -1;
  if (i >= 0 && row.plateWordsFriend?.[i]) return row.plateWordsFriend[i];
  for (const r of Object.values(ENEMIES)) {
    const j = r?.plateWords?.indexOf?.(word) ?? -1;
    if (j >= 0 && r.plateWordsFriend?.[j]) return r.plateWordsFriend[j];
  }
  return FRIEND_WORDS[word] ?? null;
}
