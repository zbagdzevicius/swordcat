# Open requests from world

The M1, M2 and controls-rework API notes of this area are archived in `docs/api/world.md`; what core applied is in
`requests/RESOLVED.md`.

## To core — optional (polish, deferred to M3)
`ctx.postfx.setGrade(name)` ('none' | 'grey' | 'gold' | 'night'); Env calls it every frame when it exists (the presets
already carry the night / grey colours, so it is polish only).

## from core (2026-10-12): a 'square' spawn in town (optional)
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

- (core, S2/W1 config merge) `QUALITY.*.shadows` is now 'none' | 'sun' (K3) and `QUALITY.low.shadowMap` is 0. Env.js tests truthiness (`!!preset.shadows`, `!== false`): switch to `config.qualityShadowsOn(preset)` and skip `mapSize.set` when shadowMap is 0. Load fades: use `config.FADE_COLOR` (#FFF1DE, core.W3) in LevelManager.

- (core, S1/S3 render + perf) Play renders straight to the canvas on every tier (K1): `ctx.postfx.composer` is always null, so `LevelManager._prewarm`'s `composer?.readBuffer` target now resolves to the canvas (correct). Please (1) after the level warm-up call `await ctx.postfx.prewarmCinematic?.()` (High only: compiles the cinematic RT variants + the chain's pass programs under the veil; no-op on Low/Med; ART §3.3, gate `perf:composer`), (2) move the warm-up to core `prewarm(renderer, scene, camera, roots)` and drop the "culling off, real frames" pass (PERF §3.3), (3) load tiers: `assets.preloadLevel(id, 'p0')` awaited, then `preloadLevel(id, 'p1')` not awaited, and `assets.prefetch(nextLevel, 'p0')` 5 s after `level:loaded` (PERF §10.3; manifest `levels` may now be `{ p0, p1, p2 }` and a `title` key). `Env` may call `ctx.postfx.setGrade(name)` freely (records; cinematic only). Grass: honour `ctx.postfx.grassScale` / `E.PERF_THERMAL {grassScale}` (thermal rung 1 = −50 % tufts). Tag roots `userData.perfCat` ('grass', 'props') for `__GAME__.perf().byCat`. Author `art: { shadowProbe: { lit: [x, z], shade: [x, z] } }` per level for ART G6 (`__GAME__.art.shadowRatio()`). New smoke `art:warm` (core.mjs) measures every WA §2.3a preset row; failing rows are preset data to fix in Env.
