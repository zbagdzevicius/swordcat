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
import d02 from './d02.js';
import cs04 from './cs04.js';
import cs05 from './cs05.js';
import d03 from './d03.js';
import cs06 from './cs06.js';
import { d04tofu, d04earlgrey, d04clover, nextD04 } from './d04.js';
import cs07 from './cs07.js';
import d06 from './d06.js';
import cs08 from './cs08.js';
import g02 from './g02.js';
import cs09 from './cs09.js';
import cs10 from './cs10.js';
import { gate_yard, gate_back, gate_pin, gate_open } from './gate.js';

/** Authored scenes (M1: the prologue and Chapter 1; M2: Acts I–II, forest → town → gate). */
export const CUTSCENES = Object.freeze({ cs00, cs01, g01, cs02, cs03, cs03b, d01, tutpearl,
  d02, cs04, cs05, d03, cs06, d04tofu, d04earlgrey, d04clover, cs07, d06, cs08, g02, cs09, cs10,
  gate_yard, gate_back, gate_pin, gate_open });

/** Scene ids that the §5.4 table calls by a group name (`d04` = the next town rescue not done). */
export const ALIASES = Object.freeze({ d04: (state) => nextD04(state) ?? 'd04clover' });

/**
 * §5.4 `end` state of the scenes written in a later milestone (M3). A placeholder still applies it (flags, shards,
 * unlocks, chained scenes), so boss defeats, joins and the save keep working; it never loads another level.
 */
export const PLACEHOLDER_ENDS = Object.freeze({
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
