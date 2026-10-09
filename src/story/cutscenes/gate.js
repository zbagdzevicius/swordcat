// src/story/cutscenes/gate.js  (owner: story) — the in-level beats of L4 `gate`, "The Line" (GAME_DESIGN §12.6):
//   gate_yard  (dialogue, no letterbox) on arrival in the yard: Marmalade / Earl Grey / Clem / Marmalade
//   gate_back  (ambient) S1 + S2 clear: a far horn and the toast "Back to the Line!"
//   gate_pin   (ambient) Pip runs the winch pin back: "Stole it back. You're welcome." → flag gate.pin
//   gate_open  (ambient) repair 100%: the portcullis test; Mochi "The gate works! Come inside, Clem!" Clem "Not yet."
// Ambient beats keep gameplay running (subtitles + babble); world's Line controller / the boss arena carry on.
import { say, wait, sfx, cam } from './lib.js';

/** §12.6 yard: spawn `start` (0,+58) facing −Z; the winch at (0,+41). */
const YARD_MARM = [-1.7, 55.6];
const YARD_EARL = [1.6, 55.2];

export const gate_yard = {
  id: 'gate_yard', kind: 'dialog', skippable: true,
  steps: [
    { t: 'spawn', id: 'marmalade', type: 'marmalade', at: YARD_MARM, facing: 'swordcat' },
    { t: 'spawn', id: 'earlgrey', type: 'earlgrey', at: YARD_EARL, facing: 'swordcat' },
    { t: 'actor', id: 'swordcat', face: [0, YARD_MARM[1]], faceDur: 0.3, pose: 'idle' },
    cam(null, 'swordcat', { pos: [-1.6, 1.35, -2.4], look: [0, 0.7, 2.4], fov: 46 }),
    { t: 'actor', id: 'marmalade', expression: 'worried' },
    say('marmalade', 'gate.yard.1', 4.8),
    { t: 'actor', id: 'earlgrey', expression: 'smug' },
    say('earlgrey', 'gate.yard.2', 4.0),
    { t: 'actor', id: 'swordcat', expression: 'determined', emote: 'nod' },
    say('swordcat', 'gate.yard.3', 2.4),
    say('marmalade', 'gate.yard.4', 3.6),
    { t: 'actor', id: 'earlgrey', moveTo: [1.2, 43], speed: 1.8, nowait: true },
    { t: 'actor', id: 'marmalade', moveTo: [-2, 50], speed: 1.2, nowait: true },
    wait(0.4),
  ],
  end: { flags: { 'gate.yard': true }, objective: { id: 'scout', textKey: 'quest.gate.scout', max: 1 }, cam: 'follow', save: true },
};

export const gate_back = {
  id: 'gate_back', kind: 'ambient', skippable: false,
  steps: [
    sfx('line.horn'),
    wait(1.2),
    { t: 'ui', toast: 'gate.back' },
    wait(0.2),
  ],
  end: { cam: false, call: (ctx, cs, skipped, phase) => { if (phase === 'after') ctx.objectives?.complete?.('scout'); } },
};

export const gate_pin = {
  id: 'gate_pin', kind: 'ambient', skippable: false,
  steps: [
    { t: 'if', cond: (ctx, cs) => !cs.actor('pip'), then: [{ t: 'spawn', id: 'pip', type: 'pip', at: [3.2, 38.5], facing: 0, keep: true }] },
    { t: 'actor', id: 'pip', moveTo: [1.0, 40.4], speed: 3.5, nowait: true },
    say('pip', 'gate.pin.back', 3.0, { expression: 'smug' }),
    wait(0.3),
  ],
  end: { cam: false, flags: { 'gate.pin': true } },
};

export const gate_open = {
  id: 'gate_open', kind: 'ambient', skippable: false,
  steps: [
    sfx('line.portcullis', [0, 47]),
    wait(1.4),
    say('mochi', 'gate.open.1', 2.6),
    say('swordcat', 'gate.open.2', 1.6),
    wait(0.2),
  ],
  end: { cam: false, flags: { 'gate.line': true } },
};
