// src/core/systems.js  (owner: core) — the system table: which class backs each ctx service, plus the
// fixed-step / render / init orders and the per-mode update gates (§19.1 A7, §19.2 system order).
// Each entry's Class implements tech.md §4.2: constructor(ctx) (no heavy work), async init(), update(dt),
// optional render(alpha, frameDt), dispose(). The contract test (tests/unit/contracts.test.js) reads this.
/**
 * PERF §10.2 / C16: every entry is lazy (`load()` → the Class, a dynamic import so the play systems become their own
 * chunks and download in parallel with the boot shell). `boot: true` = the boot set (ui, save, audio shell): its
 * closures are the `boot` chunk group of scripts/bundle-budget.mjs, and loadSystems('boot') resolves it on its own.
 * NOT yet title-first: Game.start still constructs every system, in this order, after both
 * sets land, because the title backdrop is the `meadow` level built by world (levels / env). A world-free title
 * backdrop (PERF §10.2) is the remaining C16 step; then the title can come up on the boot set. `Class` is filled by loadSystems() (null before); the ctx shape and the
 * construction order do not change. key = the ctx field (`ctx.cam` is the camera); `input` is core's own and not listed.
 * @typedef {{key: string, area: string, file: string, boot: boolean, load: () => Promise<any>, Class: any}} SystemEntry
 */
/** @type {SystemEntry[]} */
export const SYSTEMS = [
  { key: 'physics',    area: 'physics',    file: 'physics/Physics.js',             boot: false, load: () => import('../physics/Physics.js').then((m) => m.Physics), Class: null },
  { key: 'cam',        area: 'camera',     file: 'camera/FollowCamera.js',         boot: false, load: () => import('../camera/FollowCamera.js').then((m) => m.FollowCamera), Class: null },
  { key: 'player',     area: 'player',     file: 'player/Player.js',               boot: false, load: () => import('../player/Player.js').then((m) => m.Player), Class: null },
  { key: 'combat',     area: 'combat',     file: 'combat/Combat.js',               boot: false, load: () => import('../combat/Combat.js').then((m) => m.Combat), Class: null },
  { key: 'enemies',    area: 'enemies',    file: 'enemies/EnemyManager.js',        boot: false, load: () => import('../enemies/EnemyManager.js').then((m) => m.EnemyManager), Class: null },
  { key: 'companions', area: 'companions', file: 'companions/CompanionManager.js', boot: false, load: () => import('../companions/CompanionManager.js').then((m) => m.CompanionManager), Class: null },
  { key: 'levels',     area: 'world',      file: 'world/LevelManager.js',          boot: false, load: () => import('../world/LevelManager.js').then((m) => m.LevelManager), Class: null },
  { key: 'env',        area: 'world',      file: 'world/Env.js',                   boot: false, load: () => import('../world/Env.js').then((m) => m.Env), Class: null },
  { key: 'objectives', area: 'world',      file: 'world/Objectives.js',            boot: false, load: () => import('../world/Objectives.js').then((m) => m.Objectives), Class: null },
  { key: 'fx',         area: 'fx',         file: 'fx/FX.js',                       boot: false, load: () => import('../fx/FX.js').then((m) => m.FX), Class: null },
  { key: 'audio',      area: 'audio',      file: 'audio/AudioManager.js',          boot: true,  load: () => import('../audio/AudioManager.js').then((m) => m.AudioManager), Class: null },
  { key: 'story',      area: 'story',      file: 'story/StoryManager.js',          boot: false, load: () => import('../story/StoryManager.js').then((m) => m.StoryManager), Class: null },
  { key: 'ui',         area: 'ui',         file: 'ui/UI.js',                       boot: true,  load: () => import('../ui/UI.js').then((m) => m.UI), Class: null },
  { key: 'save',       area: 'save',       file: 'save/SaveManager.js',            boot: true,  load: () => import('../save/SaveManager.js').then((m) => m.SaveManager), Class: null },
];

/** @type {Map<string, Promise<SystemEntry[]>>} */
const _loading = new Map();
/**
 * Resolve the `Class` of the SYSTEMS entries in `set` ('boot' = `boot: true`, 'play' = the rest, 'all' = both; the
 * imports of a set start at once). Idempotent: one memoised promise per set (a failed load is retried on the next call).
 * Game.start kicks 'boot' and 'play' together at the top of start() (C16). Throws (with the file) when a module lacks its export.
 * @param {'all'|'boot'|'play'} [set]
 * @returns {Promise<SystemEntry[]>} the entries of that set, in SYSTEMS order
 */
export function loadSystems(set = 'all') {
  let p = _loading.get(set);
  if (p) return p;
  const list = set === 'all' ? SYSTEMS : SYSTEMS.filter((s) => s.boot === (set === 'boot'));
  p = (set === 'all' ? Promise.all([loadSystems('boot'), loadSystems('play')])
    : Promise.all(list.map(async (s) => {
      if (s.Class) return;
      const C = await s.load();
      if (typeof C !== 'function') throw new Error(`[systems] ${s.file} does not export its system class`);
      s.Class = C;
    }))).then(() => list, (e) => { _loading.delete(set); throw e; });
  _loading.set(set, p);
  return p;
}

/** Fixed step (§19.2): input → story → player → companions → enemies → combat → physics.separate → world → fx (→ the rest). */
export const STEP_ORDER = ['input', 'story', 'player', 'companions', 'enemies', 'combat', 'physics',
  'levels', 'objectives', 'env', 'fx', 'cam', 'ui', 'audio', 'save'];

/** Per rendered frame: actors interpolate first, then camera → fx.render → ui → audio. */
export const RENDER_ORDER = ['physics', 'story', 'player', 'companions', 'enemies', 'combat', 'levels', 'objectives',
  'env', 'cam', 'fx', 'ui', 'audio', 'save'];

/** init() order: DOM + persistence first, story last (it reacts to GAME_READY). */
export const INIT_ORDER = ['input', 'save', 'ui', 'audio', 'physics', 'env', 'levels', 'objectives', 'combat',
  'enemies', 'companions', 'player', 'cam', 'fx', 'story'];

const SCRIPTED = ['input', 'story', 'player', 'companions', 'enemies', 'cam', 'fx', 'ui', 'audio', 'env', 'save'];
/**
 * Which systems receive update(dt) per mode (null = all). In 'dialog'/'cutscene' the actor systems
 * (player, companions, enemies) still get update(dt) but must only advance actors for which
 * `ctx.game.simActive(actor)` is true (i.e. `actor.scripted`). `env` keeps tweening for cutscene `env` steps.
 */
export const MODE_GATES = {
  play: null,
  memecam: null,
  dialog: new Set(SCRIPTED),
  cutscene: new Set(SCRIPTED),
  menu: new Set(['input', 'ui', 'audio', 'save']),
};

/** Skipped while `ctx.levels.loading` is true. */
export const GAMEPLAY_SYSTEMS = new Set(['player', 'companions', 'enemies', 'combat', 'physics', 'levels', 'objectives']);
