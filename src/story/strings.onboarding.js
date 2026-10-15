// src/story/strings.onboarding.js  (owner: story, TT2 G2) — every new or changed line of the guided onboarding
// (docs/TOKENTAILS-PLAN.md §10.3): the practice objective lines, Pearl's barks, the first fight, the barn chest, the
// road north, Noodle's barrel, the skip chip. Plain, warm copy; no money, shelter-impact or token words (the brand
// banned-word test scans this file too).
//
// Registered into the one strings table through `addStrings()` (exported by strings.js, G3) when it exists, else
// merged into `S` directly (same row format). Rows here REPLACE the rows of the same key in strings.js (changed copy).
// Pure data + one idempotent register(): node-safe, no DOM.
import * as strings from './strings.js';

/** Plain key → text table (the onboarding copy). */
export const ONBOARDING_STRINGS = Object.freeze({
  // ---- Morning Practice (4 lessons: move, bonk, the Sir Wobble drill = stand + parry)
  'tut.move': 'Race Pearl to the dummy! [Move]',
  'tut.move.pad': 'Race Pearl to the dummy! [LS]',
  'tut.move.touch': 'Tap the ground. Race Pearl!',
  'tut.bonk': 'Bonk it 3 times! [Attack]',
  'tut.bonk.pad': 'Bonk it 3 times! [Attack]',
  'tut.bonk.touch': 'Tap ⚔ 3 times. Bonk!',
  'tut.stand': 'Hold [Stand] to block Sir Wobble!',
  'tut.stand.touch': 'Hold 🛡 to block Sir Wobble!',
  'tut.parry': 'Tap [Stand] when you see the shield!',
  'tut.parry.touch': 'Tap 🛡 when you see the shield!',
  'onb.wobble.close': 'Get close to Sir Wobble!',
  'onb.wobble.near': 'Stand right here, by Sir Wobble.',
  'pearl.bow': "Bow's perfect. Now bonk!",
  'pearl.parry.ok': "PARRY! You're getting REALLY good!",
  'pearl.parry': 'Sneaky one! Tap right on the shield!',
  'pearl.parry.letgo': 'Let go, then tap it on the shield!',
  'pearl.sack.tip': 'Psst: roll past Sir Sacky for fun!',
  'tut.roll': 'Roll past Sir Sacky! [Tumble]',
  'tut.roll.touch': 'Swipe to roll past Sir Sacky!',
  'tut.skip': 'Hold [Esc] or [P] to skip practice',
  'tut.skip.pad': 'Hold [Start] to skip practice',
  'tut.skip.touch': 'Hold the Skip chip to skip practice',
  'tut.skipped': 'Practice skipped. Off we go!',
  'tut.done': 'Practice: paw-some!',

  // ---- the cut scenes (CS-01 ≤ 10 s, D-01 ≤ 12 s): one gag each, shorter lines
  'cs01.3': 'One ear-tuft short! Next year, Clementine.',
  'cs01.4': 'One tuft short. AGAIN.',
  'd01.1': 'Almost-squire Mochi! Too clumsy, they said.',
  'pearl.bell': "The bell! It's measuring time!",

  // ---- the skip chip (every skippable scene and practice, from second 0)
  'onb.skip': 'Skip ▸▸',
  'onb.skip.hold': 'hold [Esc] / [P]',
  'onb.skip.hold.pad': 'hold [Start]',
  'onb.skip.hold.touch': 'hold',

  // ---- the first fight (rats spill into the practice field after the mist)
  'onb.fight': 'Bonk the rats! [Attack]',
  'onb.fight.pad': 'Bonk the rats! [Attack]',
  'onb.fight.touch': 'Tap a rat to bonk it!',
  'onb.fight.quest': 'Shoo the rats out of the yard!',
  'onb.fight.clear': 'Yard clear! Now... armour.',

  // ---- after the fight: the barn chest, then north
  'onb.chest': 'Open the chest in the barn!',
  // TT4: touch and pad name their open button already on the way (the controls pass found the step slow: players
  // guessed the button); the barn chest tag says "Open" with the same glyph
  'onb.chest.pad': 'Open the chest in the barn! [Interact]',
  'onb.chest.touch': 'Go to the chest, tap it or [Interact]!',
  'onb.chest.near': 'Open the chest! [Interact]',
  'onb.chest.near.touch': 'Tap the chest or [Interact] to open it!',
  'onb.north': 'North, to Mochi\'s cart!',
  'onb.mochi': 'Bonk the cart open! [Attack]',
  'onb.mochi.go': 'Follow the paws to Mochi\'s cart!',
  'onb.cart.rats': 'Chase off the rats! [Attack]',
  'onb.mochi.bright': 'Hold [Attack] till it shines. Let go!',

  // ---- jump, taught at the first hop (click / tap across a low fence, or [Jump])
  'tut.jump': 'Little fence? Hop it! [Jump]',
  'tut.jump.pad': 'Little fence? Hop it! [Jump]',
  'tut.jump.touch': 'Little fence? Tap [Jump] to hop!',

  // ---- Meow, taught at Noodle's barrel
  'onb.noodle': 'Someone is in that barrel...',
  'onb.meow': 'Meow [Meow] to call hidden kittens',
  'onb.meow.pad': 'Meow [Meow] to call hidden kittens',
  'onb.meow.touch': 'Tap Meow to call hidden kittens',

  // ---- TT3 §11.4: the Paw Tricks (package A reads these keys; [Trick] / [Jump] resolve to the device glyph)
  'trick.coin.name': ':3 Coin Toss',
  'trick.coin.bark': 'Take my lucky coin. Throw it, it comes back!',
  'trick.coin.hint': '[Trick] Toss the coin at that crow!',
  'trick.twirl.name': 'Ribbon Twirl',
  'trick.twirl.bark': 'Twirl your bow!',
  'trick.twirl.hint': '[Jump] again in the air and hold to twirl',
  'trick.cloud.name': 'Catnip Cloud',
  'trick.cloud.bark': "Catnip! They can't stay grumpy in this.",
  'trick.cloud.hint': '[Trick] Puff catnip on the pack',
  'trick.swap': 'Paw Trick: {name}',

  // ---- the Standing Stones (onboarding done)
  'onb.stones': 'On to the Standing Stones!',

  // ---- roll, taught for real on the first crossbow bolt
  'tut.bolt': 'Bolt! [Tumble] to roll away.',
  'tut.bolt.touch': 'Bolt! Swipe to roll away.',

  // ---- Lantern Stone while foes are near
  'onb.vigil.busy': 'Not now: foes are near!',
});

let _registered = false;

/**
 * Put the onboarding rows into the game's strings table (idempotent). Prefers G3's `addStrings(table)`; falls back
 * to writing `{ default }` rows into `S` (strings.js resolves `t()` / `has()` against `S` at call time).
 * @returns {boolean} true when the rows are in the table
 */
export function registerOnboardingStrings() {
  if (_registered) return true;
  const add = strings.addStrings;
  try {
    if (typeof add === 'function') add({ ...ONBOARDING_STRINGS });
  } catch (e) { console.warn('[story] addStrings failed, merging directly', e); }
  const S = strings.S;
  if (S && typeof S === 'object') {
    for (const [k, v] of Object.entries(ONBOARDING_STRINGS)) {
      if (strings.has?.(k) && strings.t?.(k) === v) continue;
      try { S[k] = { default: v }; } catch { /* frozen table: addStrings owns it */ }
    }
  }
  _registered = true;
  return true;
}

registerOnboardingStrings();
