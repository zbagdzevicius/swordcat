// src/story/quests.js  (owner: story) — the chapter quest log and the Quest Board data (GAME_DESIGN §4.2, §12.1 "The
// hub's way out", §14.3 Quest Board, §19.7 flags). Pure: reads a GameState-like object (getFlag, kittens, letters,
// levels), no DOM, no three. StoryManager emits `quest:update {questId, state, text}` whenever the current step changes
// (ui shows it in the objective bar / pause); world's Hub and ui's questBoard read `levelCards()` / `nextLevel()`.
import { LEVEL_IDS, KITTENS_BY_LEVEL } from '../core/config.js';
import { t as tr } from './strings.js';

const F = (s, k) => s?.getFlag?.(k);
const done = (s, l) => !!F(s, `${l}.done`);

/**
 * The story's quest steps in play order. A step is current while `when` holds (default: always) and `done` does not.
 * `level` limits where the step is shown (the hub steps show in town). `id` is stable (quest:update questId).
 */
export const QUESTS = Object.freeze([
  // the prologue in three steps (StoryManager.prologueStage): practice → the height chart → the barn chest (CS-01b)
  { id: 'prologue', level: 'meadow', textKey: 'quest.prologue', done: (s) => !!F(s, 'prologue.practice') || !!F(s, 'prologue.done') },
  { id: 'prologue.chart', level: 'meadow', textKey: 'quest.prologue.chart', done: (s) => !!F(s, 'prologue.chart') || !!F(s, 'prologue.done') },
  { id: 'prologue.suit', level: 'meadow', textKey: 'quest.prologue.suit', done: (s) => !!F(s, 'prologue.done') },
  // Mochi's cart (z −41) comes before the Picnic Glade (z 18) on the road north
  { id: 'meadow.mochi', level: 'meadow', textKey: 'quest.meadow.mochi', done: (s) => !!F(s, 'meadow.mochi') },
  { id: 'meadow.follow', level: 'meadow', textKey: 'quest.meadow.follow', done: (s) => !!F(s, 'meadow.pudding') },
  { id: 'meadow.pudding', level: 'meadow', textKey: 'quest.meadow.pudding', done: (s) => F(s, 'meadow.pudding') === true },
  { id: 'meadow.exit', level: 'meadow', textKey: 'quest.meadow.exit', done: (s) => done(s, 'meadow') },
  { id: 'forest.sage', level: 'forest', textKey: 'quest.forest.sage', done: (s) => !!F(s, 'forest.sage') },
  { id: 'forest.camp', level: 'forest', textKey: 'quest.forest.camp', done: (s) => !!F(s, 'forest.camp') },
  { id: 'forest.mill', level: 'forest', textKey: 'quest.forest.mill', done: (s) => !!F(s, 'forest.boss') },
  { id: 'forest.exit', level: 'forest', textKey: 'quest.forest.exit', done: (s) => done(s, 'forest') },
  { id: 'town.bakery', level: 'town', textKey: 'quest.town.bakery', done: (s) => !!F(s, 'town.marmalade') },
  { id: 'town.chase', level: 'town', textKey: 'quest.town.chase', done: (s) => !!F(s, 'town.letters') },
  { id: 'town.rescue', level: 'town', textKey: 'quest.town.rescue', done: (s) => !!F(s, 'town.clover') && !!F(s, 'town.earlgrey') },
  { id: 'town.steps', level: 'town', textKey: 'quest.town.steps', done: (s) => !!F(s, 'town.free') },
  { id: 'hub-gate', level: 'town', textKey: 'quest.hub.gate', done: (s) => done(s, 'gate') || !!F(s, 'gate.done') },
  { id: 'gate.scout', level: 'gate', textKey: 'quest.gate.scout', done: (s) => !!F(s, 'gate.pip') },
  { id: 'gate.line', level: 'gate', textKey: 'quest.gate.line', done: (s) => !!F(s, 'gate.line') },
  { id: 'gate.boss', level: 'gate', textKey: 'quest.gate.boss', done: (s) => !!F(s, 'gate.boss') },
  { id: 'hub-bog', level: 'town', textKey: 'quest.hub.bog', done: (s) => done(s, 'bog') },
  { id: 'bog.pearl', level: 'bog', textKey: 'quest.bog.pearl', done: (s) => !!F(s, 'bog.pearl') || done(s, 'bog') },
  { id: 'keep.gate', level: 'keep', textKey: 'quest.keep.gate', done: (s) => !!F(s, 'keep.brutus') },
  { id: 'keep.boss', level: 'keep', textKey: 'quest.keep.boss', done: (s) => !!F(s, 'keep.boss') },
  { id: 'ending', level: null, textKey: 'quest.ending', done: (s) => !!F(s, 'ending.seen') },
]);

/**
 * The current quest step for `levelId` (the first step of that level not done, in story order; in town after
 * `town.free` the hub step), or the global next step when `levelId` is null. Returns { id, textKey, text, level } or a
 * `{ id: 'done' }` row once the ending is seen.
 */
export function currentQuest(state, levelId = null) {
  for (const q of QUESTS) {
    if (q.done(state)) continue;
    if (levelId && q.level && q.level !== levelId) continue;
    return { id: q.id, textKey: q.textKey, text: tr(q.textKey), level: q.level };
  }
  if (levelId && !F(state, 'ending.seen')) {
    const g = currentQuest(state, null);
    if (g.id !== 'done') return g;
  }
  return { id: 'done', textKey: 'quest.done', text: tr('quest.done'), level: null };
}

/** Boss key (the `boss:start` id, `boss_` prefix stripped) → its quest text key while the fight is on. */
export const BOSS_QUESTS = Object.freeze({ grizzlechop: 'quest.boss.grizzlechop', cacklejaw: 'quest.boss.cacklejaw', brutus: 'quest.boss.brutus', barkus: 'quest.boss.barkus' });

/**
 * The quest row shown while boss `id` is up (the objective pill names the boss, not the step before the arena).
 * Unknown bosses read `quest.boss`. Pure. @returns {{ id: string, textKey: string, text: string, level: null, boss: true }}
 */
export function bossQuest(id) {
  const key = String(id ?? '').replace(/^boss_/, '');
  const textKey = BOSS_QUESTS[key] ?? 'quest.boss';
  return { id: `boss.${key || 'boss'}`, textKey, text: tr(textKey), level: null, boss: true };
}

/** May level `id` be entered (Quest Board / exits)? Each level opens when the one before it is done; the board itself
 *  needs `town.free`. Pure. */
export function levelAvailable(state, id) {
  const i = LEVEL_IDS.indexOf(id);
  if (i < 0) return false;
  if (i === 0) return true;
  if (id === 'gate') return !!F(state, 'town.free');
  return done(state, LEVEL_IDS[i - 1]);
}

/**
 * The next level to play (Quest Board "Next: {chapter}", the hub's South Gate): the first level in story order that
 * is not done (town counts as done at `town.free`). null when every level is done. Pure.
 */
export function nextLevel(state) {
  for (const id of LEVEL_IDS) {
    if (id === 'town' && F(state, 'town.free')) continue;
    if (!done(state, id)) return id;
  }
  return null;
}

/** Spawn id for entering `id` from the hub / board (replays start at `start`). Pure. */
export const entrySpawn = (id) => (id === 'town' ? 'hub' : 'start');

/**
 * Quest Board level cards (§14.3: cleared ✓; kittens n/3; letter ✓; best rank) + the chapter title. Pure.
 * @returns {{ id, chapter, label, title, region, available, cleared, next, kittens, kittensMax, letter, bestRank, bestTime }[]}
 */
export function levelCards(state) {
  const next = nextLevel(state);
  return LEVEL_IDS.map((id, i) => {
    const mine = KITTENS_BY_LEVEL?.[id] ?? [];
    const rec = state?.levels?.[id] ?? {};
    const letterNo = i + 1;
    return {
      id, chapter: i + 1, label: tr('ch.label', { n: i + 1 }), title: tr(`ch.${i + 1}`), region: tr(`region.${id}`),
      available: levelAvailable(state, id), cleared: !!rec.cleared || done(state, id), next: id === next,
      kittens: mine.filter((k) => state?.kittens?.includes?.(k)).length, kittensMax: mine.length,
      letter: !!state?.letters?.includes?.(`l${letterNo}`), bestRank: rec.bestRank ?? null, bestTime: rec.bestTime ?? null,
    };
  });
}

/** "Next: {chapter}" text for the board button (null when nothing is next). Pure. */
export function nextLabel(state) {
  const id = nextLevel(state);
  if (!id) return null;
  return tr('board.next', { chapter: tr(`ch.${LEVEL_IDS.indexOf(id) + 1}`) });
}
