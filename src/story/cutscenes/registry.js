// src/story/cutscenes/registry.js  (owner: story) — the runtime cutscene registry (PERF S1t: lazy cutscenes).
// The prologue and Chapter 1 scenes (the first ten minutes, all on `meadow`) are bundled with the game; every later
// scene is its own chunk, loaded on demand (`loadScene`) and prefetched when its level starts loading (SCENE_LEVEL).
// `cutscenes/index.js` keeps the static map of every scene for node tests and tools (it is not imported by the game).
import cs00 from './cs00.js';
import cs01 from './cs01.js';
import cs01b from './cs01b.js';
import cs02 from './cs02.js';
import tutbow from './tutbow.js';
import tutpearl from './tutpearl.js';
import tutlook from './tutlook.js';
import g01 from './g01.js';
import cs03 from './cs03.js';
import cs03b from './cs03b.js';
import d01 from './d01.js';
import { E } from '../../core/events.js';

/** Bundled scenes (meadow: title, Morning Practice, the prologue, Chapter 1). */
export const EAGER = Object.freeze({ cs00, cs01, cs01b, cs02, tutbow, tutpearl, tutlook, g01, cs03, cs03b, d01 });

/** Lazy scenes: id → [loader, export name]. One chunk per file (d04 / gate hold several scenes). */
export const LAZY = Object.freeze({
  d02: [() => import('./d02.js'), 'default'],
  cs04: [() => import('./cs04.js'), 'default'],
  cs05: [() => import('./cs05.js'), 'default'],
  d03: [() => import('./d03.js'), 'default'],
  cs06: [() => import('./cs06.js'), 'default'],
  d04tofu: [() => import('./d04.js'), 'd04tofu'],
  d04earlgrey: [() => import('./d04.js'), 'd04earlgrey'],
  d04clover: [() => import('./d04.js'), 'd04clover'],
  cs07: [() => import('./cs07.js'), 'default'],
  d06: [() => import('./d06.js'), 'default'],
  cs08: [() => import('./cs08.js'), 'default'],
  g02: [() => import('./g02.js'), 'default'],
  cs09: [() => import('./cs09.js'), 'default'],
  cs10: [() => import('./cs10.js'), 'default'],
  gate_yard: [() => import('./gate.js'), 'gate_yard'],
  gate_back: [() => import('./gate.js'), 'gate_back'],
  gate_pin: [() => import('./gate.js'), 'gate_pin'],
  gate_open: [() => import('./gate.js'), 'gate_open'],
});

/** Scenes to prefetch when a level starts loading (its triggers, boss and rescue beats). */
export const SCENE_LEVEL = Object.freeze({
  forest: Object.freeze(['d02', 'cs04', 'cs05']),
  town: Object.freeze(['d03', 'cs06', 'd04tofu', 'd04earlgrey', 'd04clover', 'cs07', 'cs10']),
  gate: Object.freeze(['gate_yard', 'gate_back', 'gate_pin', 'gate_open', 'd06', 'cs08', 'g02', 'cs09', 'cs10']),
});

/** The next town rescue not done yet (D-04 order: Tofu, Earl Grey, Clover). Pure. */
export function nextD04(state) {
  if (!state?.getFlag?.('town.tofu')) return 'd04tofu';
  if (!state?.getFlag?.('town.earlgrey')) return 'd04earlgrey';
  if (!state?.getFlag?.('town.clover')) return 'd04clover';
  return null;
}

/** Scene ids that the §5.4 table calls by a group name (`d04` = the next town rescue not done). */
export const ALIASES = Object.freeze({ d04: (state) => nextD04(state) ?? 'd04clover' });

/**
 * §5.4 `end` state of the scenes written in a later milestone (M3). A placeholder still applies it (flags, shards,
 * unlocks, chained scenes), so boss defeats, joins and the save keep working; it never loads another level.
 * CS-16 (the ending) asks for the cinematic composer (ART A3.2: the ending calls setCinematic through the runner).
 */
export const PLACEHOLDER_ENDS = Object.freeze({
  cs11: { flags: { 'bog.pearl': true } },
  cs12: { flags: { 'bog.done': true } },
  cs13: { flags: { 'keep.gate': true } },
  cs14: {},
  d05: { kind: 'dialog', flags: { 'keep.brutus': true }, unlock: [{ kind: 'skin', id: 'toobig' }] },
  cs15: { flags: { 'keep.boss': true }, bossDefeated: 'barkus', play: 'cs16' },
  cs16: { flags: { 'ending.seen': true }, unlock: [{ kind: 'skin', id: 'dawnblade' }, { kind: 'cape', id: 'gold' }], cinematic: { grade: 'gold', bloom: [0.6, 0.4, 0.9] } },
});

/** How long a placeholder holds the screen (s): long enough for `cutscene:start` to be seen, short for flows. */
export const PLACEHOLDER_DUR = 0.15;

/**
 * A stand-in scene for `id` (an unknown id gets an empty end). Its `end` applies the PLACEHOLDER_ENDS row.
 * @param {string} id
 */
export function placeholderScene(id) {
  const row = PLACEHOLDER_ENDS[id] ?? {};
  const { kind = 'cutscene', letterbox = true, bossDefeated = null, cinematic = null, ...end } = row;
  if (!PLACEHOLDER_ENDS[id]) console.warn(`[story] no cutscene "${id}" — playing an empty placeholder`);
  return {
    id, kind, letterbox, skippable: true, placeholder: true, ...(cinematic ? { cinematic } : {}),
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

const _loads = new Map();

/**
 * Load a lazy scene's data (cached; concurrent calls share one import). Resolves to the scene definition, or null for
 * an id that is neither eager nor lazy.
 * @param {string} id @returns {Promise<any|null>}
 */
export function loadScene(id) {
  if (EAGER[id]) return Promise.resolve(EAGER[id]);
  const row = LAZY[id];
  if (!row) return Promise.resolve(null);
  if (!_loads.has(id)) {
    const [load, name] = row;
    _loads.set(id, Promise.resolve().then(load).then((m) => m?.[name] ?? null).catch((e) => {
      console.error(`[story] could not load cutscene "${id}"`, e);
      _loads.delete(id);
      return null;
    }));
  }
  return _loads.get(id);
}

/** Prefetch every scene of `levelId` (fire and forget). Returns the promise of all of them (tests). */
export function prefetchLevel(levelId) {
  return Promise.all((SCENE_LEVEL[levelId] ?? []).map((id) => loadScene(id)));
}

/** Every scene id the game knows (eager + lazy). */
export const SCENE_IDS = Object.freeze([...Object.keys(EAGER), ...Object.keys(LAZY)]);
