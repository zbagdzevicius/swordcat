// src/story/cutscenes/tutbow.js  (owner: story) — "Pink Bow!" (WA §7.2, ON §4.2), TT2 §10.3: a 2-s Pearl bark, not a
// scene any more (measured: 2.0 s, ambient: no letterbox, no input lock, the camera untouched). Morning Practice now
// says the line from Pearl's guide bubble when the bonk lesson starts (tutorial `pearl.bow`) and sets the bow outfit
// silently; this ambient form stays for callers that still ask for `tutbow` (old saves, tools).
//   Pearl: "Bow's perfect. Now bonk!"
// end: outfit tunic_bow (also when skipped); the friend-size **Pink Bow!** reward (E.REWARD) once per save.
import { reward } from '../rewards.js';
import { wait } from './lib.js';
import { outfit } from './rig.js';

/** The bark's length (s). */
export const BOW_BARK = 2.0;

/** Pearl (the practice guide when she is there) says the line over her head; else nobody does (no spawn). */
function bark(ctx, cs) {
  const pearl = (ctx.companions?.actors ?? []).find?.((a) => a?.npcId === 'pearl' && a.alive !== false) ?? null;
  if (pearl) cs.host?.barks?.say?.(pearl, 'pearl.bow', 'pearl', BOW_BARK);
}

export default {
  id: 'tutbow', kind: 'ambient', skippable: false, prologue: true, letterbox: false, hud: true, player: false,
  steps: [
    { t: 'call', fn: bark },
    { t: 'call', fn: (ctx) => outfit(ctx, 'tunic_bow') },
    wait(BOW_BARK),
  ],
  end: {
    player: { outfit: 'tunic_bow' },
    call: (ctx, cs, skipped, phase) => {
      if (phase !== 'after' || ctx.state?.getFlag?.('sticker.bow')) return;
      reward(ctx, 'friend', 'bow');
    },
    ui: { letterbox: false },
    cam: false,
  },
};
