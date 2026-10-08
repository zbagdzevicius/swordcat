# Contributing (area agents)

Binding spec: `GAME_DESIGN.md` (§19 contracts, Appendix A/B), `research/tech.md` (as amended by §19.1), `research/art.md`, `public/assets/ASSETS.md`. This file is the practical "how", owned by core.

## 1. Ground rules
- Edit **only** your folder (`src/<area>/**`), plus `src/<area>/assets.manifest.js`, `tests/unit/<area>.test.js` and `tests/smoke/<area>.mjs`.
- Need a new event, ctx field, config key or core helper? Append it to `requests/<area>.md`, then code defensively against the current contract. Additions only; nothing is ever renamed.
- No git. Don't run `vite build` into `dist/` or use port 4173 during parallel phases (core owns both). Use your own dev server (below).
- Before hand-off: `npm run test:unit` passes, your smoke block passes against your dev server, and you have **Read your own screenshots** (`tests/shots/*.png`).

## 2. Run, look, test

| Area | Dev port | | Area | Dev port |
|---|---|---|---|---|
| physics | 5311 | | world | 5318 |
| camera | 5312 | | fx | 5319 |
| characters | 5313 | | audio | 5320 |
| player | 5314 | | story | 5321 |
| combat | 5315 | | ui | 5322 |
| enemies | 5316 | | save | 5323 |
| companions | 5317 | | core | 5301 |

```bash
npx vite --port 5314 --strictPort            # run in the background; kill it when you're done
# http://localhost:5314/?test=1&seed=1        test hooks, fixed seed, no save load, no pointer lock
# ...?debug                                   Stats + renderer.info + lil-gui (quality, time scale, god, mode, bloom)
# ...?level=forest&spawn=boss  ?quality=low|med|high
SMOKE_URL=http://localhost:5314/ SMOKE_ONLY=player node tests/smoke.mjs      # bash
$env:SMOKE_URL='http://localhost:5314/'; $env:SMOKE_ONLY='player'; node tests/smoke.mjs   # PowerShell
npm run test:unit                                                            # all unit tests
node --import ./tests/unit/_setup.mjs --test tests/unit/player.test.js       # one file
```
`SMOKE_ONLY` takes a file name (`player`), a block name (`player:combo`) or a comma list. Flags: `--headed`, `--verbose` (echo page logs), `--swiftshader`; `SMOKE_GPU=gl|d3d11|swiftshader` (default on Windows is ANGLE-on-GL: d3d11 plus the MSAA composer makes screenshots crawl).

## 3. Smoke blocks (`tests/smoke/<area>.mjs`, auto-imported, never edit `tests/smoke.mjs`)
```js
export default [
  { name: 'player:combo', order: 20, level: 'meadow', spawn: 'start', timeout: 60000, async run(t) {
      await t.tap('KeyJ', 3, 250);
      t.assert((await t.events()).filter((e) => e === 'player:swing').length >= 3, 'combo');
      await t.shot('player-combo');                       // → tests/shots/player-combo.png (prefix with your area)
  } },
];
```
- Before each block the harness skips any cutscene, sets mode `play`, turns `god` off, loads `level`/`spawn` (`level: null` skips this) and clears `__GAME__.events`. `reload: true` reloads the page first. Blocks run sorted by `order` (core uses 0–11 and 60–61).
- `t`: `G(fn, arg)` (page.evaluate whose result passes through `__GAME__.plain()`: actors, Object3Ds and systems come back as small summaries, so `G(() => __GAME__.spawn(...))` costs ms, not the ~1 s a raw `page.evaluate` spends serialising the whole ctx graph; prefer `t.G` over `t.page.evaluate`), `shot(name)`, `assert(cond, msg)`, `fail(msg)`, `wait(ms)`, `frames(n)`, `hold(code, ms)`, `tap(code, n, gap)`, `state()`, `events()`, `clearEvents()`, `lastEvent(name)`, `waitForEvent(name, ms)` → bool, `loadLevel(id, spawn)`, `setMode(m)`, `blankCheck(label)`, `log/warn`, plus `page`.
- Any `pageerror`, `console.error`, failed request or HTTP ≥ 400 anywhere fails the run, attributed to the running block.
- Test hooks (`window.__GAME__`, only with `?test`/`?debug`): everything in §19.8 and tech.md §19.3 (`state()`, `loadLevel`, `teleport`, `god`, `skipDialog`, `sampleCanvas`, `story.*`, `player.*`, `cam.mode`, `idle`, `boss.*`, `startBoss`, `spawn`, `kittens`, `objective`, `events` = ring buffer of the last 200 event names), plus `ctx`, `game`, `E`, `THREE`, `plain(value)`, `lastEvent(name)`, `emitted(name)`, `clearEvents()`, `setMode(m)`, `quality(name)`, `waitFrames(n)`, `measureFit(path, fit?)`, `mode`. `state()` reports `calls`/`tris` of the scene render (shadows in, post passes out; the §18 budget) and `frameCalls`/`frameTris` for the whole frame.
- In `?test`, Meme Cam never triggers from real idle time; only `__GAME__.idle(sec)` does.

## 4. Unit tests (`tests/unit/<area>.test.js`)
- `node:test` + `node:assert/strict`; pure modules only. `_setup.mjs` (preloaded by `npm run test:unit`) stubs `.css`/image/shader/`?raw` imports and gives `src/` modules `import.meta.env` and `import.meta.glob`.
- `import { fakeCtx, fakeGame } from './_fakeCtx.mjs'` gives a ctx with every system constructed (no `init`, no DOM, `assets.model` never resolves). `fakeCtx({ systems: false })` gives core services only.
- Core's suites: `contracts` (U18 + §19.3/§19.4 shapes, §19.8 hooks, **every `src/` module must import under node**), `events` (U16), `assets` (U15, MODEL_FIT, prune), `core`. Page-entry scripts that touch the DOM at import must be named `main.js`, `preview.js` or `*.page.js`.

## 5. Systems and the loop
- The system table is `src/core/systems.js` (core-owned). Your entry class and file are fixed:

| ctx key | file → class | | ctx key | file → class |
|---|---|---|---|---|
| `physics` | `physics/Physics.js` → `Physics` | | `env` | `world/Env.js` → `Env` |
| `cam` | `camera/FollowCamera.js` → `FollowCamera` | | `objectives` | `world/Objectives.js` → `Objectives` |
| `player` | `player/Player.js` → `Player` (an Actor) | | `fx` | `fx/FX.js` → `FX` |
| `combat` | `combat/Combat.js` → `Combat` | | `audio` | `audio/AudioManager.js` → `AudioManager` |
| `enemies` | `enemies/EnemyManager.js` → `EnemyManager` | | `story` | `story/StoryManager.js` → `StoryManager` |
| `companions` | `companions/CompanionManager.js` → `CompanionManager` | | `ui` | `ui/UI.js` → `UI` |
| `levels` | `world/LevelManager.js` → `LevelManager` | | `save` | `save/SaveManager.js` → `SaveManager` |

- Contract (tech.md §4.2): `constructor(ctx)` (no heavy work, no awaits, no DOM; set every contract field here: `list`, `active`, `current`, `boss`, `tokens`, ...), `async init()`, `update(dt)` (fixed 1/60, gameplay), optional `render(alpha, frameDt)` (visuals), `dispose()`. Internal sub-systems (CutsceneCamera, Telegraphs, Arena...) are yours to call from your entry class.
- Fixed step: input → story → player → companions → enemies → combat → physics (separate) → levels → objectives → env → fx → cam → ui → audio → save. Render: physics, story, player, companions, enemies, combat, levels, objectives, env, **cam**, fx, ui, audio. Init: input, save, ui, audio, physics, env, levels, objectives, combat, enemies, companions, player, cam, fx, story; then `game:ready`, then the first level (`meadow`/`title`, or `?level`/`?spawn`).
- Modes (A7): `ctx.game.setMode('play'|'dialog'|'cutscene'|'menu'|'memecam')` emits `game:mode` (and `game:pause` around `menu`). In `dialog`/`cutscene` only input, story, player, companions, enemies, cam, fx, ui, audio, env, save get `update`; actor systems must advance only actors where **`ctx.game.simActive(actor)`** is true (= `actor.scripted`). `menu` updates input, ui, audio, save only. While `ctx.levels.loading` is true, player/companions/enemies/combat/physics/levels/objectives are skipped.
- Time: `ctx.game.requestHitstop(sec)` (world frozen, rendering continues, input edges stay latched; also via `E.HITSTOP`), `ctx.game.slowMo(scale, realSec)` (overlaps take the slowest), `ctx.game.setTimeScale(s)`, `ctx.game.time` (sim s), `realTime`, `frameCount`, `hitstopT`. Animate with `dt = ctx.game.hitstopT > 0 ? 0 : frameDt`. Per-frame callbacks: `ctx.game.addFrameHook(fn)`.

## 6. ctx (frozen shape; tech.md §4.1 + A4 + core additions)
`game, bus, config, renderer, scene, camera, input, assets, actors, state, rng, physics, combat, cam, player, enemies, companions, levels, env, objectives, strings, fx, audio, story, ui, save` + core additions `postfx` (`setBloom(strength, threshold?, radius?)`, `resetBloom()`, `bloomBase`, `setVignette(darkness, offset)`, `setQuality(name)`, `qualityName`, `sceneStats`), `quality` (the active `config.QUALITY` preset; listen to `E.QUALITY`) and `params` (`{test, debug, seed, level, spawn, quality, mute}`).
- `config` = `core/config.js`: Appendix A verbatim + `MODEL_FIT`, `PLACEHOLDER`, `BOSS_MODELS`, `LEVEL_IDS`, `KITTEN_IDS`, `KITTENS_BY_LEVEL`, `MODES`, `LOOP`, `RENDER`, `QUALITY`, `INPUT`. Every `ATTACKS`/`ENEMIES`/`BOSSES` row has its `id`. **No gameplay literals in your code — read config.**
- `input`: `move {x,y}` (y+ forward, length ≤ 1), `down/pressed/released(a)`, `heldTime(a)` (sim seconds; on the release step it still returns the final duration), `consumeLook()` → `{x, y}` radians + `{px, py}` raw mouse pixels, `idleTime`, `lookIdleTime`, `anyActivity()`, `device` (`kbm|pad|touch`, `E.INPUT_DEVICE`), `rumble(weak, strong, ms)`, touch hooks `setVirtual(action, on)`, `setVirtualMove(x, y)`, `addLook(dx, dy)`. Actions: `attack guard dodge jump interact confirm back lockon lockPrev lockNext pause ability milk meow golden recenter navUp navDown navLeft navRight` (bindings in `config.INPUT`; RMB = guard; wheel = lockNext/lockPrev).
- `actors` (A5): `register(actor, id?)` (id = the cutscene actor id, e.g. `'swordcat'`, `'pudding'`, `'mochi'`), `unregister`, `get(id)`, `byTag(tag)`, `queryRadius(pos, r, filter?, out?)` (reuses a scratch array), `nearest(pos, r, filter)`, `list`, `forEach`; `hostileTo(faction)` filter from `core/ActorRegistry.js`. Spawners register; `Game` calls `beginStep()` on every registered actor each step.
- `state` (`core/GameState.js`, §19.7 schema): saved fields as properties, `toJSON()`, `reset(data)`, `difficultyCfg` (`roundTaken(d)`, `playerDmgMul`, `tokens`, `enemyHp`, `windup`, `parry`), `getFlag/setFlag`, `cond('a && !b || c')`, `addKitten`, `runtime` (unsaved scratch; namespace your keys).
- `rng`: seeded `() => [0,1)` with `range, int, pick, chance, sign, angle, shuffle, fork(salt)`. Never `Math.random()` in gameplay.
- `strings`: `t(key, vars)`, `has(key)`, `S` (story's `strings.js`).
- Shared services (§19.3), each implemented in M0 as a working stub: `enemies.spawn/spawnWave/despawn/list/boss`, `companions.active/setActive/spawnNpc/spawnKitten/pudding`, `levels.load/current/loading/anchor/arenaNear/setVisible`, `env.set/contribute/clear/preset/fogDensity`, `objectives.start/progress/freeze/complete/add`, `combat.beginSwing/updateSwing/applyHit/spawnProjectile/tokens`, `fx.burst/telegraph/holy/mistRing/horde`, `audio.play2D/play3D/music/laugh/bell/unlock/load`, `story.play/flag/isPlaying/skip/skipAll`, `cam.mode/preset/shake/yaw/pitch`, `ui.loading`, `save.load/write/clear`.

## 7. Events
```js
import { E } from '../core/events.js';
this.ctx.bus.emit(E.PLAYER_GUARD, { on: true });
const off = this.ctx.bus.on(E.HIT, (h) => { ... });   // keep `off`, call it in dispose()
await this.ctx.bus.wait(E.CUTSCENE_END, (p) => p.id === 'cs03');
```
- Always use `E.*` constants (U16 fails on unknown constants or literal strings passed to `bus.*`). Payloads are documented in `src/core/events.js`. The bus warns on unknown names.
- **Events notify; services decide.** Commands and queries are direct calls on `ctx.<service>`. `E.HITSTOP`, `E.SHAKE`, `E.CAM_MODE`, `E.ENV_SET`, `E.MUSIC` are requests that core/camera/world/audio honour.
- Core additions: `game:quality {name, preset}`, `settings:changed {key, value}` (ui emits after writing `state.settings`; save autosaves, core re-applies quality), `input:device {device}`.

## 8. Assets
- Load through `ctx.assets`: `gltf(path)` (cached, shared, never mutate), **`model(path, opts)`** → `{ root, fit, scene, animations, scale, size }` (SkeletonUtils clone, fitted, feet at y 0, facing +Z), `texture(path, {srgb, repeat})`, `hdr(path)`, `arrayBuffer(path)`, `preload(paths)`, `preloadLevel(id)`, `url(path)`. Paths are relative to `public/assets/` (e.g. `models/creatures/polypizza/Rat.glb`).
- `model` opts: `fit` (number, `{h}`, `{x}`, `{z}`, `{max}`, a `MODEL_FIT[path].uses` role like `'brutus'`, ranges `[a, b]` via `ctx.rng`), `yaw`, `hide`/`show` (node names), `tint` (colour or `{ nodeName: colour }`; clones materials), `castShadow`, `receiveShadow`, `ground`, `center`. **fitToHeight is mandatory** (§18.1); `MODEL_FIT` in config holds per-model axis/target/yaw and the prop nodes ignored when measuring. M0 checked facing: Cat_Blocky faces +Z (yaw 0). Smoke `core:fit` asserts every `MODEL_FIT` entry within ±10%.
- **three sanitises glTF node names**: `handslot.r` → `handslotr`, `FrontLeg.L` → `FrontLegL`. Use `findNode(root, name)` from `core/Assets.js` (accepts either).
- Helpers: `core/Animator.js` (`play(name, {fade, once, speed, clampEnd})` → Promise for `once`, `pick(...names)`, `pose(name, t)`, `update(dt)`), `core/ScriptedActor.js` (`ScriptedActorMixin(Actor)`: default `setScripted/moveTo/face/pose/play/emote/prop/attach`; call `this.scriptedStep(dt)` in update while scripted; override the visual hooks `onPose`, `playClip`, `onEmote`, `onProp`, `onAttach`), `core/math.js`, `core/rng.js`.
- **Manifests** (`src/<area>/assets.manifest.js`, §18.4): `export default [...]` = every file you load (pure data; may import only `core/config.js`); optional `export const levels = { meadow: [...], '*': [...] }` = what `LevelManager` preloads per level (each path must also be in the default list). Every literal asset path in `src/` must appear in some manifest (U15). `npm run build` runs `scripts/prune-assets.mjs`, which deletes everything else from `dist/assets/` (it keeps a GLB's sibling `Textures/`, its external URIs and licence files). Kenney `env/castle|town|graveyard|dungeon-mini` GLBs need their sibling `Textures/colormap.png`.

## 9. Conventions (tech.md §2, unchanged)
1 unit = 1 m, +Y up, models face +Z, `facing = atan2(dir.x, dir.z)`, positive angles turn left. Fixed step 1/60; gameplay mutates only in `update(dt)`; `render` is visual only. No allocations per step/frame (module-level temporaries). No DOM/WebGL at module top level. Dispose your scene objects, listeners and DOM in `dispose()`. Asset URLs only via `ctx.assets.url()` / loaders.

## 10. What the M0 stubs do (replace them in your milestone)
- **player**: placeholder Swordcat = `cats/Cat_Blocky.glb` (1.0 m, matte ginger, pink bow on the left ear) + `weapons/kaykit/sword_2handed.glb` (1.0 m) on a pivot; camera-relative WASD, jump, slash1→2→3 combo, Stand (parry within the difficulty window, block, Grit break), tumble i-frames, Holy charge, hurt/death/respawn, `MemeCamTrigger`.
- **combat**: §19.4 `applyHit` with `resolveIncoming`, swept arcs, `AttackTokens`, simple sphere projectiles with parry reflect. A target with `god === true` takes no damage.
- **enemies**: `resolveEnemyDef(type)` (Appendix A rows, `bonehead:<variant>`, `jelly_l|m|s`, `boss_<key>`), fitted GLBs, minimal FSM with telegraphs; `Boss` phases fire once in order, `hpFloor` holds until `freeShard()`, Barkus rallies into `cs15`.
- **companions**: capsule-cat placeholders for `Companion`, `NpcActor`, `LostKitten`; `Pudding` = `Dragon_Evolved` fitted to 6 m, red tint.
- **world**: `defineLevel` → seeded rolling heightfield with the spine/spawns/arenas carved flat, vertex-coloured ground, instanced primitive trees/rocks/blocks with circle/box colliders, spawns, anchors, `fog_edge_0..7`, boss arenas (auto-lock on entry; `startBoss()` hook). `Env` holds every §5.3/§12.2 preset and owns fog, background, hemisphere + sun (shadow frustum follows the player).
- **camera**: orbit follow + heightfield spring arm, lock/boss distances, §5.2 presets as static framings, `meme` mode (emits `camera:meme`), trauma shake.
- **story**: `play(id)` sets mode `cutscene`, emits `cutscene:start`, ends two steps later with `cutscene:end`; boss defeats start CS-05 / CS-09 / D-05. **ui**: loading veil + toasts. **fx**: tiny hit/poof puffs. **audio**: silent, logs requests. **save**: §19.7 `defaultSave` + `migrate`, autosave (off in `?test`). **physics**: heightfield ground, statics, separation, heightfield raycast, bounds.
