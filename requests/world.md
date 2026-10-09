# Open requests from world

The M1 and M2 API notes of this area are archived in `docs/api/world.md`; what core applied is in `requests/RESOLVED.md`.

## To core — optional (polish, deferred to M3)
`ctx.postfx.setGrade(name)` ('none' | 'grey' | 'gold' | 'night'); Env calls it every frame when it exists (the presets
already carry the night / grey colours, so it is polish only).
