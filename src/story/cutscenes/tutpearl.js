// src/story/cutscenes/tutpearl.js  (owner: story) — "Found You!" (WA §7.4), TT2 §10.3: the cow hide-and-seek lesson is
// gone (Meow is taught at Noodle's barrel), so this is a short ambient Pearl bark now (measured: 2.4 s; no letterbox,
// no input lock, the camera untouched). Her lines live on in the parry praise ("PARRY! You're getting REALLY good!");
// this form stays for callers that still ask for `tutpearl`.
import { wait } from './lib.js';

/** Where Pearl stood in the cow's lee (kept for old data / tests). */
export const HIDE = Object.freeze([12.3, -73.9]);
/** The bark's length (s). */
export const PEARL_BARK = 2.4;

export default {
  id: 'tutpearl', kind: 'ambient', skippable: false, prologue: true, letterbox: false, hud: true, player: false,
  steps: [
    { t: 'call', fn: (ctx, cs) => {
      const pearl = (ctx.companions?.actors ?? []).find?.((a) => a?.npcId === 'pearl' && a.alive !== false) ?? null;
      if (pearl) cs.host?.barks?.say?.(pearl, 'tut.pearl2', 'pearl', PEARL_BARK);
    } },
    wait(PEARL_BARK),
  ],
  end: {
    ui: { letterbox: false },
    cam: false,
  },
};
