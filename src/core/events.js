// src/core/events.js  (owner: core) — FROZEN catalog of bus event names + payload JSDoc.
// tech.md §4.4 base catalog + GAME_DESIGN §19.5 additions + core additions (marked "core+").
// Other agents REQUEST additions (requests/<area>.md); names are never renamed or removed.
// Rule: events NOTIFY; services DECIDE (call ctx.<service> directly for queries/commands).

export const E = Object.freeze({
  // ---- game / level lifecycle (tech.md §4.4) ----
  GAME_READY: 'game:ready',                 // {}  all systems initialised (before the first level load)
  GAME_PAUSE: 'game:pause',                 // { paused }  emitted when entering / leaving mode 'menu'
  GAME_MODE: 'game:mode',                   // { mode, prev }  §19.5 (core)
  LEVEL_LOADING: 'level:loading',           // { id, spawnId }
  LEVEL_LOADED: 'level:loaded',             // { id, level, spawnId }
  LEVEL_UNLOAD: 'level:unload',             // { id }
  LEVEL_EXIT: 'level:exit',                 // { to, spawnId }  (exit trigger reached)
  LEVEL_RESULTS: 'level:results',           // { levelId, time, kittens, letter, fish, lives, rank }  §19.5 (world)
  CHECKPOINT: 'checkpoint',                 // { levelId, spawnId }

  // ---- player (tech.md §4.4 + §19.5) ----
  PLAYER_SPAWNED: 'player:spawned',         // { player }
  PLAYER_DAMAGED: 'player:damaged',         // { amount, hp, maxHp, source }
  PLAYER_HEALED: 'player:healed',           // { amount, hp, maxHp }
  PLAYER_DIED: 'player:died',               // {}
  PLAYER_SWING: 'player:swing',             // { attackId, combo }
  PLAYER_CHARGE: 'player:charge',           // { level }  0..1, emitted on change of tier
  PLAYER_HOLY: 'player:holy',               // { position, dir }
  PLAYER_DODGE: 'player:dodge',             // {}
  PLAYER_JUMP: 'player:jump',               // {}
  PLAYER_LAND: 'player:land',               // { impact }
  PLAYER_GUARD: 'player:guard',             // { on }
  PLAYER_GRIT: 'player:grit',               // { value, max, broken }
  PLAYER_PARRY: 'player:parry',             // { attacker, gold, projectile?, position }   (emitted by combat)
  PLAYER_PERFECT_DODGE: 'player:perfectDodge', // { attacker, graze }
  PLAYER_VALOR: 'player:valor',             // { value, max, delta, reason }
  PLAYER_GOLDEN: 'player:golden',           // { on }
  PLAYER_LIFE_LOST: 'player:lifeLost',      // { lives }
  PLAYER_STILL_STANDING: 'player:stillStanding', // {}
  PLAYER_MILK: 'player:milk',               // { phase: 'start' | 'heal' | 'cancel', left, max }
  PLAYER_MEOW: 'player:meow',               // { position }
  FOOTSTEP: 'actor:footstep',               // { actor, position, surface }

  // ---- combat (tech.md §4.4 + §19.5) ----
  HIT: 'combat:hit',                        // { attacker, target, attackId, damage, position, dir, killed, blocked, parried, crit, popsSlime }
  TELEGRAPH: 'combat:telegraph',            // { id, actor, kind, shape, pos, dir, size, duration, attackId?, arc?, range?, windup?, activeAt?, targetsPlayer? }  shape: glint|circle|lane|cone|ring|line|swirl|rings|shadow  (CONTROLS_SPEC §8.5 fields: activeAt = absolute game.time)
  TELEGRAPH_END: 'combat:telegraphEnd',     // { id }
  REFLECT: 'combat:reflect',                // { projectile, by }

  // ---- enemies / bosses ----
  ENEMY_SPAWNED: 'enemy:spawned',           // { enemy }
  ENEMY_ALERTED: 'enemy:alerted',           // { enemy }
  ENEMY_DIED: 'enemy:died',                 // { enemy, type, position, fish, smallHeart, height, releases?, popped?, size? }  (fish / smallHeart already rolled: drop exactly these; releases 'earlgrey' = the giant Gloomjelly; popped = a popsSlime kill, no split; size = Gloomjelly L|M|S|GIANT)
  ENEMY_JEER: 'enemy:jeer',                 // { enemy, on }
  ENEMY_CHOKE: 'enemy:choke',               // { enemy }
  ITEM_STOLEN: 'item:stolen',               // { thief, item: 'fish'|'milk'|'pin'|'post_bag', amount }
  ITEM_RETURNED: 'item:returned',           // { item: 'fish'|'milk'|'pin'|'post_bag', amount, bonus, thief?, by? }  (by: 'pip' = Pip brought the Line pin back)
  BOSS_START: 'boss:start',                 // { boss, id, name, maxHp, phases, dizzyMax }
  BOSS_PHASE: 'boss:phase',                 // { boss, phase }  exactly once per threshold
  BOSS_DIZZY: 'boss:dizzy',                 // { boss, value, max, dizzy }
  BOSS_DEFEATED: 'boss:defeated',           // { boss, id }

  // ---- companions / kittens ----
  COMPANION_ABILITY: 'companion:ability',   // { kittenId, ability, position, dir?, point?, aimed?, source?, targets? }  (CONTROLS_SPEC §7.5)
  COMPANION_NAP: 'companion:nap',           // { kittenId, on }
  COMPANION_CHANGED: 'companion:changed',   // { active }
  KITTEN_REVEAL: 'kitten:reveal',           // { kittenId, position }
  KITTEN_RESCUED: 'kitten:rescued',         // { kittenId }

  // ---- world ----
  INTERACT_AVAILABLE: 'interact:available', // { target, prompt }
  INTERACT_CLEAR: 'interact:clear',         // {}
  INTERACT: 'interact',                     // { target }
  ITEM_PICKUP: 'item:pickup',               // { item: 'fish'|'letter'|'heartBell'|'milk'|'smallHeart', id?, amount, position }
  ENV_SET: 'env:set',                       // { ...fields, dur }   request (story, enemies) → world Env
  ENV_CHANGED: 'env:changed',               // { fogDensity, grade, wind }
  ARENA_LOCK: 'arena:lock',                 // { id }
  ARENA_WAVE: 'arena:wave',                 // { id, wave, total }
  ARENA_CLEAR: 'arena:clear',               // { id }
  OBJECTIVE: 'objective:progress',          // { id, value, max, textKey, frozen, done }

  // ---- story / dialogue ----
  DIALOG_START: 'dialog:start',             // { id }
  DIALOG_LINE: 'dialog:line',               // { speaker, text, portrait, choices? }
  DIALOG_END: 'dialog:end',                 // { id }
  QUEST_UPDATE: 'quest:update',             // { questId, state, text }
  FLAG_SET: 'story:flag',                   // { key, value }
  CUTSCENE_START: 'cutscene:start',         // { id }
  CUTSCENE_END: 'cutscene:end',             // { id, skipped }
  PROMPT: 'story:prompt',                   // { action, hold, textKey, progress, done }
  SHARD: 'story:shard',                     // { n }
  UNLOCK: 'state:unlock',                   // { kind: 'skin' | 'cape' | 'ability', id }

  // ---- camera ----
  CAM_MODE: 'camera:mode',                  // { mode, preset?, anchor?, blend }   request (story, player) → camera
  MEME_CAM: 'camera:meme',                  // { on }   (camera)

  // ---- ui / audio / fx ----
  TOAST: 'ui:toast',                        // { text, icon? }
  PROGRESS: 'ui:progress',                  // { n, total }  asset loading
  MUSIC: 'audio:music',                     // { track, fade }
  SHAKE: 'fx:shake',                        // { trauma }      request → camera
  HITSTOP: 'fx:hitstop',                    // { seconds }     request → core Game.requestHitstop
  BURST: 'fx:burst',                        // { kind, position, color?, count?, type?, height?, dir?, helmet? }  (poof: enemy type / height / dir; helmet false = the enemy spins its own)

  // ---- save ----
  SAVE_REQUEST: 'save:request',             // {}
  SAVE_LOADED: 'save:loaded',               // { data, reason?: 'new'|'continue'|'title' }  (core's boot emit has no reason)
  SAVE_WRITTEN: 'save:written',             // { reason, savedAt, ok }  a save record was written (core+, for ui's seal)

  // ---- core+ (additive, core-owned) ----
  QUALITY: 'game:quality',                  // { name, preset }  active quality preset changed (also once at boot)
  SETTINGS_CHANGED: 'settings:changed',     // { key, value }   a state.settings entry changed (ui emits after writing state)
  INPUT_DEVICE: 'input:device',             // { device: 'kbm' | 'pad' | 'touch' }  last-used input device changed
  INPUT_POINTER_LOCK: 'input:pointerLock',  // { locked }  core+: mouse capture gained / lost (lost mid-play → ui.pause())

  // ---- CONTROLS_SPEC §12 core 3 (iso controls; additive) ----
  PLAYER_ORDER: 'player:order',             // { kind: 'move'|'follow'|'attack'|'attackMove'|'use'|'stop', point?: Vector3, target?: Actor|null, valid, queued, partial? }
  TARGET_CHANGED: 'target:changed',         // { actor, prev, source: 'click'|'tap'|'tab'|'pad'|'auto'|'clear' }  the selection (cam.lockTarget)
  CAM_ZOOM: 'camera:zoom',                  // { dist, mul }  the iso zoom changed
  INPUT_SCHEME: 'input:scheme',             // { preset }  the KBM control preset changed
  NAV_READY: 'nav:ready',                   // { level, cells, links, ms }  the level's nav grid is built
});

/** Every known event string (EventBus warns on unknown names). */
export const KNOWN = new Set(Object.values(E));
