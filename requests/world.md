# Open requests from world

- → audio (review, minor): the gate portcullis is now a painted wooden toy gate and the winch chain a rope
  (`src/world/levels/gate.js` `toyGateParts` / `winchRopeParts`). `portcullisOpen` / `portcullisClose` / `portcullisSlam`
  still play `world/metal_*` and `impactMetal_heavy_003`; a wooden clack / thunk (and a rope creak for `winch`) would match.

The M1, M2 and controls-rework API notes of this area are archived in `docs/api/world.md`; what core applied is in
`requests/RESOLVED.md`.

## To core — optional (polish, deferred to M3)
`ctx.postfx.setGrade(name)` ('none' | 'grey' | 'gold' | 'night'); Env calls it every frame when it exists (the presets
already carry the night / grey colours, so it is polish only).

## DONE (world): from core (2026-10-12): a `square` spawn in town ([0, -6], facing the fountain)
controls:levels screenshots town/hub (main street, z -46) for lack of a spawn at the Square (SQUARE.at [0, 8]). A
`square: [0, -6, 0]`-ish spawn (south rim, facing the fountain) would let the smoke cover the Square's iso view too.

## To fx — optional: fog-wall ground band options in `mistRing(center, r, opts)`
The arena fog wall's iso ground band (MistCards `MIST_ISO.bandW` 2 m, `bandA` 0.42, soft inner edge) reads as a heavy
grey smear across the Standing Stones arena from above. World's Arena already passes `opts.bandW` (1.2) and
`opts.bandA` (0.12) (`ARENA.wall`); please honour them per wall, and give the band a crisper inner edge (e.g.
`smoothstep(0.75, 0.95, …)` on the arena side) or a faint dashed rim so it reads as a boundary. World meanwhile passes
`alpha` 0.35 / `width` 3.5 for the cards (already supported) and drops `level.cam.fog.mist` to 0.3 while an arena is
locked (Level.js `arenaAwareFog`), which removes most of the smear on its own.

## To enemies / characters — optional: a night body lift for enemies in the iso view
At night (env presets with `hero: 1`: meadow_night, forest_night, sky_night) the rats' dark fur still reads mostly by
their aggro rings even with world's raised iso moon / hemisphere. A faint cool rim or a lighter `topTint` on enemy
bodies while `ctx.env.cur.hero > 0` (or `ctx.env.presetName` ending in `_night`) would make the bodies read too.

- DONE (world, 2026-10-12) — (core, S2/W1 config merge) `QUALITY.*.shadows` is now 'none' | 'sun' (K3) and `QUALITY.low.shadowMap` is 0. Env.js tests truthiness (`!!preset.shadows`, `!== false`): switch to `config.qualityShadowsOn(preset)` and skip `mapSize.set` when shadowMap is 0. Load fades: use `config.FADE_COLOR` (#FFF1DE, core.W3) in LevelManager.

- DONE (world, 2026-10-12; manifest tiers stay p0-only because every level build awaits all its templates, `title` key not authored) — (core, S1/S3 render + perf) Play renders straight to the canvas on every tier (K1): `ctx.postfx.composer` is always null, so `LevelManager._prewarm`'s `composer?.readBuffer` target now resolves to the canvas (correct). Please (1) after the level warm-up call `await ctx.postfx.prewarmCinematic?.()` (High only: compiles the cinematic RT variants + the chain's pass programs under the veil; no-op on Low/Med; ART §3.3, gate `perf:composer`), (2) move the warm-up to core `prewarm(renderer, scene, camera, roots)` and drop the "culling off, real frames" pass (PERF §3.3), (3) load tiers: `assets.preloadLevel(id, 'p0')` awaited, then `preloadLevel(id, 'p1')` not awaited, and `assets.prefetch(nextLevel, 'p0')` 5 s after `level:loaded` (PERF §10.3; manifest `levels` may now be `{ p0, p1, p2 }` and a `title` key). `Env` may call `ctx.postfx.setGrade(name)` freely (records; cinematic only). Grass: honour `ctx.postfx.grassScale` / `E.PERF_THERMAL {grassScale}` (thermal rung 1 = −50 % tufts). Tag roots `userData.perfCat` ('grass', 'props') for `__GAME__.perf().byCat`. Author `art: { shadowProbe: { lit: [x, z], shade: [x, z] } }` per level for ART G6 (`__GAME__.art.shadowRatio()`). New smoke `art:warm` (core.mjs) measures every WA §2.3a preset row; failing rows are preset data to fix in Env.

- (physics, A:physics.1 / physics.W1, low, FYI) Headless nav re-run (stub GLBs) after the Phase W level data: start →
  exit is clear on meadow and gate, no corridor < 1.6 m on either route. Off-route, beside the meadow lane (2–2.8 m
  from the spine), the fence run ending near (-19, -22) leaves a 1.3 m gap to the post at (-18.7, -25.0); if that gap
  is meant to be walked, widen it to ≥ 1.6 m (or close it). Confirm with `physics:nav` / `?debug` (real models).
  The real-model `physics:nav` run (meadow) also lists 1.3 m gaps at (-12.3, -89.8) and (-9.3, -91.3), right by the
  practice spawn [-10, -90] and the barn chest [-12.85, -88.75] (chest / lantern post / barn corner?). The chest is
  still reached, but please check none of them pinches the suit-up run.

## To fx — M:world.4 / AUTOCAM §9.4: ground-mist ring outer radius from the footprint
`GroundMist` bakes `ringOut` (16 m) into its shader. AUTOCAM §9.4 wants it to track `max(cam.footprint.ahead,
cam.footprint.halfWTop)` quantised to 1 m (a uniform, written only when the quantised value changes). World did not edit
`src/fx/GroundMist.js` while fx is mid-phase; please take it (or tell world to).

## To fx — warm-up: `mistRing` walls compile nothing while fading in
LevelManager now warms one wall per arena with the arena's own options (`ARENA.wall`), but the wall's ground band
(`fx.mist.band`) is still built on the first lock (`world:warm`: 1 program at `stones:lock`): the warm wall is removed
before its band is ever visible. Please let `mistRing(…, { warm: true })` start at full alpha (or expose
`fx.prewarmRoots()` with every pool / wall variant visible) so core `prewarm` compiles it under the veil.

## To core — `art:warm` R − B bands look miscalibrated
`world:art` frame stats (`art.frameStats({ exclude: 'actors' })`) give R − B 0.37 for `meadow_day` (band +0.08…+0.14),
0.26 for `forest_day`, 0.44 for `gate_dusk`, while the frames look right (green grass + sand paths are R ≫ B). Luma
bands pass after world's preset lift (meadow 0.60, forest 0.51, town 0.56, gate 0.53). Please check the R − B metric
(scale / linear vs sRGB) before world re-tints presets toward blue for it.

## from audio (Phase W: WA §9 / ART §9.3 music swaps)
Audio already resolves these from its own defaults, so nothing breaks today; aligning the level defs keeps one source:
- `forest.js` `music.byFlag`: `['forest.camp', 'lantern_night']` (field_of_dreams at 0.94; audio reads your
  `field_of_dreams` row as "no change" and falls through to it). Audio also adds a camp zone (tavern tune within 8 m of
  [6, 40] while `forest.camp`).
- `town.js` `music.byFlag`: `['gate.done', 'hub_hush']` (bards' tale 0.92, low-passed 2.2 kHz; audio swaps the lament row,
  WA §9 "lament only for its scenes").
- `bog.js` `music.explore`: `'bog_dreams'` (`cave_theme` is retired; audio aliases it). `keep.js` `music.explore`:
  `'castle_kings_feast'` (audio's default adds `gains: { castle_kings_feast: 0.7 }`).
- `arena:lock` now also plays the AUTOCAM room-read sting (once per arena per visit, skipped right after a cutscene);
  `Arena.js` should keep not playing its own clear jingle while `ctx.audio.director` exists.

## from core (perf: submit / matrixWorld cascade)
Core now sets `scene.matrixAutoUpdate = false` (the scene root never moves). three's `updateMatrixWorld` still
`force`s a matrixWorld multiply on every descendant of any node whose `updateMatrix()` ran, so `level.root` and its
`groups.*` containers (auto-update on, every frame) still re-multiply the whole level each render, and `freezeStatics`
only saves the compose. Please `updateMatrix(); matrixAutoUpdate = false` on `level.root` and every `groups.*`
container (they never move; actors / props inside keep their own auto-update) in `Level` construction or
`freezeStatics`. Expected: submit drops by the level's node count × one matrix multiply + compose.

## from core (2026-10-13, PERF §5 heap: Props.js `_pixels` holds 52–120 MB)
Heap snapshots (dev, med): `src/world/Props.js` `_pixels` WeakMap holds one 1024² RGBA `getImageData` copy (4 MB) per
texture *image* read by `bakeMesh` — 16 entries (≈ 58 MB) after meadow, 31+ (≈ 120 MB) after town. It is the
largest item in the JS heap (budget: low 90 / med+high 120 MB, smoke `perf:frame` now gates it). Every KayKit GLB
embeds its own copy of the same atlas, so the WeakMap keys differ, and the cached glTFs keep the keys alive.
Please (1) clear the cache when a level build ends (a module `Map` + `clearPixelCache()` called at the end of the
build / on `level:loaded`; or pass a per-build cache into `bakeMesh`), and (2) key it by atlas identity (texture
`name` / image `width×height` + source URI when present) so the 20 copies of one atlas are read once per build.
Optional: sample a ≤ 256² downscale (`drawImage(img, 0, 0, 256, 256)`): vertex colours never need 1024² texels.
Core also now releases unlisted, unused glTF / texture cache entries 4 s after `level:loaded`
(`ctx.assets.release(levelId)`; keep set = every manifest tier of the level + `'*'`): list every GLB a level builds
from in `world/assets.manifest.js` `levels[id]` (any tier) or it reloads on the next visit.
- Static level batches that nothing raycasts/re-bakes and that are disposed with the level can call
  `releaseCpuOnUpload(root)` from `core/Assets.js` after the build (drops normal/uv/color arrays once uploaded,
  keeps positions + index for Picker/Occluders/physics). Templates reused across levels must NOT use it.

## from story (2026-10-13, WA §7.4 hide-and-seek: the cow's pink tail)
`tutorial.js` calls `levels.current.critter('cow_practice').setTail('pearl')` when Pearl hides in the meow lesson and
`setTail(null)` when hide-and-seek ends (found, or practice skipped). No world critter implements `setTail` yet (story
optional-chains it, so the tell is currently invisible): please add it on the meadow critter — `'pearl'` shows a tiny
pink tail tuft (Pearl's colour, one small mesh / instance, 0 extra draws if possible), `null` removes it. Idempotent.

## from ui (Phase W review: objective wayfinding beacon)
- `src/ui/beacon.js` resolves a quest step's target via, in order: `ctx.story.questTarget(id)`,
  `ctx.levels.current.questTarget(id)`, the level anchor `quest.<questId>` (e.g. `anchors: { 'quest.bog.pearl': [x, z] }`),
  then ui's fallback table of your zone ids (`chart`, `barn_chest`, `cart`, `glade`, `exit`, `camp`, `mill`, `forge`,
  `square`, `steps`, `battlefield`, `winch`, `roof`). Please add `quest.<id>` anchors where a step has no zone:
  the bog ferry dock (`bog.pearl`, currently nothing to point at), Sage's treetop cage (`forest.sage`, ui finds the caged
  kitten actor only once it is spawned), Lantern Alley / the bakery (`town.bakery`), the hub's Quest Board / way out
  (`hub-gate`, `hub-bog`), the keep door (`keep.gate`). Please keep those zone ids stable (or tell ui).
