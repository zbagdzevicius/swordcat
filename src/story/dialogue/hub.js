// src/story/dialogue/hub.js  (owner: story) — §6.5 hub lines (Pawsbury after `town.free`): two lines per station NPC,
// one picked at random on interact (never the same one twice in a row), plus the state-dependent variants:
// Marmalade in bed after L4 (`gate.done`), Pip's "{n} kittens still out in {level}", the lost kittens' own lines
// (§6.4: their rescue line is also their hub line), random villagers. Pure; StoryManager.hubTalk() shows the result
// as a speech bubble over the speaker (ctx.story.barks) and returns it, so world's Hub / ui can call it on interact.
import { LEVEL_IDS, KITTENS_BY_LEVEL, KITTEN_IDS } from '../../core/config.js';
import { t as tr, has } from '../strings.js';

/** Station NPC → its line keys (§6.5). */
export const HUB_LINES = Object.freeze({
  marmalade: ['hub.marmalade.1', 'hub.marmalade.2'],
  tofu: ['hub.tofu.1', 'hub.tofu.2'],
  earlgrey: ['hub.earlgrey.1', 'hub.earlgrey.2'],
  pip: ['hub.pip.1', 'hub.pip.2'],
  pearl: ['hub.pearl.1', 'hub.pearl.2'],
  snowpaw: ['hub.snowpaw.1', 'hub.snowpaw.2'],
  coo: ['hub.coo.1'],
  villager: ['hub.villager.1', 'hub.villager.2', 'hub.villager.3', 'hub.villager.4', 'hub.villager.5', 'hub.villager.6'],
});

/** The level whose lost kittens Pip talks about: the first (story order) with some still missing. Pure. */
export function missingKittens(state) {
  for (const id of LEVEL_IDS) {
    const mine = KITTENS_BY_LEVEL?.[id] ?? [];
    const n = mine.filter((k) => !state?.kittens?.includes?.(k)).length;
    if (n > 0) return { level: id, n };
  }
  return null;
}

/** Candidate { key, vars } rows for `npcId` in this state. Pure. */
export function hubCandidates(npcId, state) {
  const id = String(npcId ?? '');
  if (id === 'marmalade' && state?.getFlag?.('gate.done') && !state?.getFlag?.('ending.seen')) return [{ key: 'hub.marmalade.bed', vars: null }];
  if (id === 'pip') {
    const m = missingKittens(state);
    const rows = [{ key: 'hub.pip.2', vars: null }];
    if (m) rows.unshift({ key: 'hub.pip.1', vars: { n: m.n, level: tr(`region.${m.level}`) } });
    return rows;
  }
  if (KITTEN_IDS.includes(id) && has(`kitten.${id}`)) return [{ key: `kitten.${id}`, vars: null }];
  const keys = HUB_LINES[id] ?? (id.startsWith('villager') ? HUB_LINES.villager : null);
  return (keys ?? []).map((key) => ({ key, vars: null }));
}

/**
 * Pick a hub line for `npcId`: random among its candidates, avoiding `last` (the previous key) when there is a choice.
 * `rng` is a () => [0,1) source (ctx.rng). Returns { key, vars, text } or null for an NPC with no lines. Pure.
 */
export function hubLine(npcId, state, rng = () => 0, last = null) {
  let rows = hubCandidates(npcId, state);
  if (!rows.length) return null;
  if (rows.length > 1 && last) rows = rows.filter((r) => r.key !== last);
  const r = rows[Math.min(rows.length - 1, Math.floor((rng?.() ?? 0) * rows.length))];
  return { ...r, text: tr(r.key, r.vars) };
}
