// src/story/cutscenes/index.js  (owner: story) — the cutscene registry (§5.4) + placeholders for later milestones.
// Every scene is a data file `cutscenes/<id>.js` (format Appendix B.2) run by story/Cutscene.js. Static imports: the
// files are small data, and node unit tests (U13) walk them all.
import { E } from '../../core/events.js';
import cs00 from './cs00.js';
import cs01 from './cs01.js';
import g01 from './g01.js';
import cs02 from './cs02.js';
import cs03 from './cs03.js';
import cs03b from './cs03b.js';
import d01 from './d01.js';
import tutpearl from './tutpearl.js';

/** Authored scenes (M1: the prologue and Chapter 1). */
export const CUTSCENES = Object.freeze({ cs00, cs01, g01, cs02, cs03, cs03b, d01, tutpearl });

/**
 * §5.4 `end` state of the scenes written in later milestones (M2 / M3). A placeholder still applies it (flags, shards,
 * unlocks, chained scenes), so boss defeats, joins and the save keep working; it never loads another level.
 */
export const PLACEHOLDER_ENDS = Object.freeze({
  d02: { kind: 'dialog', flags: { 'forest.sage': true }, toasts: ['toast.sage'] },
  cs04: { flags: { 'forest.camp': true }, env: 'forest_night' },
  cs05: { flags: { 'forest.boss': true }, shards: 1, toasts: ['toast.holy'] },
  d03: { kind: 'dialog', flags: { 'town.marmalade': true } },
  cs06: { flags: { 'town.letters': true } },
  d04: { kind: 'dialog' },
  d04tofu: { kind: 'dialog', flags: { 'town.tofu': true } },
  d04earlgrey: { kind: 'dialog', flags: { 'town.earlgrey': true } },
  d04clover: { kind: 'dialog', flags: { 'town.clover': true }, toasts: ['toast.clover'] },
  cs07: { flags: { 'town.free': true }, unlock: [{ kind: 'cape', id: 'red' }], toasts: ['toast.free', 'toast.shops', 'toast.hub'] },
  d06: { kind: 'dialog', flags: { 'gate.pip': true } },
  cs08: {},
  g02: { letterbox: false },
  cs09: { flags: { 'gate.boss': true }, shards: 2, unlock: [{ kind: 'ability', id: 'golden' }], toasts: ['toast.golden'], play: 'cs10' },
  cs10: { flags: { 'gate.done': true } },
  cs11: { flags: { 'bog.pearl': true } },
  cs12: { flags: { 'bog.done': true } },
  cs13: { flags: { 'keep.gate': true } },
  cs14: {},
  d05: { kind: 'dialog', flags: { 'keep.brutus': true }, unlock: [{ kind: 'skin', id: 'toobig' }] },
  cs15: { flags: { 'keep.boss': true }, bossDefeated: 'barkus', play: 'cs16' },
  cs16: { flags: { 'ending.seen': true }, unlock: [{ kind: 'skin', id: 'dawnblade' }, { kind: 'cape', id: 'gold' }] },
});

/** How long a placeholder holds the screen (s): long enough for `cutscene:start` to be seen, short for flows. */
export const PLACEHOLDER_DUR = 0.15;

/**
 * A stand-in scene for `id` (an unknown id gets an empty end). Its `end` applies the PLACEHOLDER_ENDS row.
 * @param {string} id
 */
export function placeholderScene(id) {
  const row = PLACEHOLDER_ENDS[id] ?? {};
  const { kind = 'cutscene', letterbox = true, bossDefeated = null, ...end } = row;
  if (!PLACEHOLDER_ENDS[id]) console.warn(`[story] no cutscene "${id}" — playing an empty placeholder`);
  return {
    id, kind, letterbox, skippable: true, placeholder: true,
    steps: [{ t: 'wait', dur: PLACEHOLDER_DUR }],
    end: {
      ...end,
      call: bossDefeated ? (ctx, cs, skipped, phase) => {
        if (phase === 'before') ctx.bus.emit(E.BOSS_DEFEATED, { boss: ctx.enemies?.boss ?? null, id: bossDefeated });
      } : undefined,
      save: true,
      cam: 'follow',
    },
  };
}
