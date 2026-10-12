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
