# Open requests from fx

The M1, M2 and controls-rework API notes of this area are archived in `docs/api/fx.md`; what core applied is in
`requests/RESOLVED.md`.

## To world — optional (level data)
`level.cam.fog.mist` (number, default from `GROUND_MIST.byPreset` in `fx/GroundMist.js`) scales the iso ground mist
sheets per level. fx already reads it when present.

## To camera — optional: a public `cam.blendLeft` (seconds of the running hand-back / mode blend left, 0 when none)
GroundDecals hides her hero / aim / selection decals outside play and fades them back in over the last 0.3 s of the
hand-back blend. With no public blend clock it assumes `CAMERA.iso.cut.handback` (1.0 s) and cuts that short once the
lens holds still relative to her, which is right for the default hand-back but late for a 0.6 s `{ blend: 0.6 }` one.
fx already reads `ctx.cam.blendLeft` when it is a finite number. Not blocking.

## To companions — Volley range vs the visible frame
Sage's Volley reaches 14 m but the 1280×720 iso frame is only about ±7.7 m wide and 6 m up / 4.5 m down from her, so
it can wake and hit enemies the player cannot see. fx now marks the reach at the frame edge along the aim (a dotted arc
plus an outward chevron, `fx.decals.reachEdgeAt`) and puts a grey "no target" chip on the aim point. Please also drop
candidates with `!ctx.cam.onScreen(e.pos, 0.5)` in `planAbility`'s volley branch (§8.5 no off-screen snipes), so
the reach the player sees is the reach that fires.

## To ui — optional: Esc while a companion ability is held
Holding Q (Volley indicator up) and pressing Esc opens the pause menu as well as cancelling the aim. Esc should only
cancel the aim (CONTROLS_SPEC §7.5) when `ctx.companions.aim.active`.
