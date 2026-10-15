// src/player/tricks/unlocks.js  (owner: player, TT3 package A) — when each Paw Trick is handed over (docs/TOKENTAILS-PLAN.md
// §11.3). Never before the first fight (`onboard.firstFight`, or a save past the prologue):
//   coin   the meadow, on the way into the Crow Fields (past the Picnic Glade) or at the first crow alert there;
//          the Token Tails Cat's bark: "Take my lucky coin. Throw it, it comes back!"
//   twirl  entering the forest; Pearl: "Twirl your bow!"
//   cloud  entering the town (before the first jeering pack in Bakery Street); Pearl: "Catnip! ..."
// A save that is already past a hand-over gets the trick silently on load (no bark). The plan's "after Pearl's
// rescue in town" has no matching beat in the town level (Pearl is found in the bog), so the town entry is the hand-over.
import { LEVEL_IDS } from '../../core/config.js';
import { TRICK_IDS } from './tuning.js';

/** The Crow Fields (meadow zone `crowfields`, at [24, 40] size [50, 40]) grown by `pad` m, minus the Picnic Glade side. */
export const CROW_FIELDS = Object.freeze({ x0: -1, x1: 49, z0: 20, z1: 60, pad: 6, gladeX: 18, gladeZ: 34 });

/** Is (x, z) on the way into the Crow Fields (pure)? */
export function inCrowFields(x, z, F = CROW_FIELDS) {
  if (x < F.x0 - F.pad || x > F.x1 + F.pad || z < F.z0 - F.pad || z > F.z1 + F.pad) return false;
  return x >= F.gladeX || z >= F.gladeZ;
}

/** The hand-over level of each trick. */
export const UNLOCK_LEVEL = Object.freeze({ coin: 'meadow', twirl: 'forest', cloud: 'town' });

/** Has the first fight happened (or is the save past the prologue)? Pure on a state with getFlag. */
export function pastFirstFight(state) {
  const f = (k) => !!state?.getFlag?.(k);
  return f('onboard.firstFight') || f('prologue.done');
}

/**
 * The tricks a save on `levelId` should already own (catch-up on load): every trick whose hand-over level comes
 * strictly before this one, plus this level's own when `here` is true. Empty before the first fight. Pure.
 * @param {string} levelId @param {any} state @param {boolean} [here]
 */
export function ownedOnLoad(levelId, state, here = false) {
  if (!pastFirstFight(state)) return [];
  const i = LEVEL_IDS.indexOf(levelId);
  if (i < 0) return [];
  return TRICK_IDS.filter((id) => {
    const j = LEVEL_IDS.indexOf(UNLOCK_LEVEL[id]);
    return j < i || (here && j === i);
  });
}
