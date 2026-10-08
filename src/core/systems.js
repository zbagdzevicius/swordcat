// src/core/systems.js  (owner: core) — the system table: which class backs each ctx service, plus the
// fixed-step / render / init orders and the per-mode update gates (§19.1 A7, §19.2 system order).
// Each entry's Class implements tech.md §4.2: constructor(ctx) (no heavy work), async init(), update(dt),
// optional render(alpha, frameDt), dispose(). The contract test (tests/unit/contracts.test.js) reads this.
import { Physics } from '../physics/Physics.js';
import { FollowCamera } from '../camera/FollowCamera.js';
import { Player } from '../player/Player.js';
import { Combat } from '../combat/Combat.js';
import { EnemyManager } from '../enemies/EnemyManager.js';
import { CompanionManager } from '../companions/CompanionManager.js';
import { LevelManager } from '../world/LevelManager.js';
import { Env } from '../world/Env.js';
import { Objectives } from '../world/Objectives.js';
import { FX } from '../fx/FX.js';
import { AudioManager } from '../audio/AudioManager.js';
import { StoryManager } from '../story/StoryManager.js';
import { UI } from '../ui/UI.js';
import { SaveManager } from '../save/SaveManager.js';

/** key = the ctx field (`ctx.cam` is the camera). `input` is core's own Input and is not listed. */
export const SYSTEMS = [
  { key: 'physics',    area: 'physics',    file: 'physics/Physics.js',             Class: Physics },
  { key: 'cam',        area: 'camera',     file: 'camera/FollowCamera.js',         Class: FollowCamera },
  { key: 'player',     area: 'player',     file: 'player/Player.js',               Class: Player },
  { key: 'combat',     area: 'combat',     file: 'combat/Combat.js',               Class: Combat },
  { key: 'enemies',    area: 'enemies',    file: 'enemies/EnemyManager.js',        Class: EnemyManager },
  { key: 'companions', area: 'companions', file: 'companions/CompanionManager.js', Class: CompanionManager },
  { key: 'levels',     area: 'world',      file: 'world/LevelManager.js',          Class: LevelManager },
  { key: 'env',        area: 'world',      file: 'world/Env.js',                   Class: Env },
  { key: 'objectives', area: 'world',      file: 'world/Objectives.js',            Class: Objectives },
  { key: 'fx',         area: 'fx',         file: 'fx/FX.js',                       Class: FX },
  { key: 'audio',      area: 'audio',      file: 'audio/AudioManager.js',          Class: AudioManager },
  { key: 'story',      area: 'story',      file: 'story/StoryManager.js',          Class: StoryManager },
  { key: 'ui',         area: 'ui',         file: 'ui/UI.js',                       Class: UI },
  { key: 'save',       area: 'save',       file: 'save/SaveManager.js',            Class: SaveManager },
];

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
