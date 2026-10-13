# Open requests from camera

The M1 / M2 / controls-rework API notes of this area are archived in `docs/api/camera.md`; what core
applied is in `requests/RESOLVED.md`.

## world: flag the Bell Tower stair landings as `walkTop: true` (town.js)
`Picker.screenToGround` now always accepts a prop top whose collider carries `walkTop: true`, `ledge: true`, `landing: true`
or a `step` key. The two landings between the tower flights (`town.js`, the `[x0, x1, z0, z1, y]` loop) have no flag;
they are picked today only through the nav-connectivity fallback. Adding `walkTop: true` (or `landing: true`) to that
`kit.collider({...})` makes them explicit. Optional.

## player / physics: she stalls on the Bell Tower stairs when walking a full (non-partial) path (town)
Verified 2026-10-12 (port 5706): from the terrace (-5, 44) RMB orders to flight 1 top (-3.6, 45.9), landing 2
(-7.7, 48) and flight 3 top (-3.6, 48.9) all pick the right point and get a full path (6 waypoints), but after ~900
frames she is still at the flight 1 / landing 1 junction (≈ -4.1, 2.95, 46.4) or back on the terrace. An order to the
loft ledge (-0.5, 50.5, y 7.2) is `partial` (path ends at -2.75, 50.75). Picking is no longer the cause.
Also: a ray hitting exactly on the seam between two adjacent step boxes (x = -5.0 on flight 2) misses both tops
(`StaticColliders.raycastTops` / `overlapXZ` strict at shared edges) and falls through to the terrain.

## ui: `cam.heroScreen()` and the mirrored touch frame — DONE (camera, Phase W)
`ctx.cam.heroScreen(out?)` → `{ x, y }` (CSS px, her focus at the SafeFrame anchor, no lead) is live; with
`settings.leftHanded` the SafeFrame reads the mirrored cluster and the anchor (and `heroScreen()`) moves right of centre.
Unit: `AUTOCAM ui ask: heroScreen()` in tests/unit/camera.test.js.

## world: skyline audit for the merged far plane (AUTOCAM §9.3 / PLAN X12) — please
The iso far plane is now `clamp(ceil5(max(slantMax·1.25 + 25, fogFar)), 45, 90)` (60 m when Env has no fog density),
recomputed per frame from `cam.footprint` and `env.fogDensity`. Anything that must stay drawn beyond it (skyline
silhouettes with `fog: false`, distant landmarks) needs a `level.farKeep` entry: an array of `Object3D`s or
`{ position: {x, y, z}, r }`; a kept point inside the frustum side planes extends `far` to reach it (+ r). Shots at far
90 vs the footprint far per outdoor level would confirm nothing pops (`camera:footprint` logs the far per level).

## world: the stage-1 shadow fit is 13 m half on forest / town at d 13 (AUTOCAM §9.2 expects 10.5–12) — FYI
`camera:footprint` (1280×720, Med, d 13.0): meadow `env._fit` 10 × 9 m, forest 11 × 13 m, town 11 × 13 m. The camera
footprint matches three.js (unit 11.1-9: corners ±0.05 m, half width 8.43 m at the §3 case). The extra metre on forest /
town is the casterH (6 m) raise along those levels' sun azimuth; a lower `foot.casterH` there, or trimming the raised
corners to the footprint's far edge, would bring it under 12. Reported as a WARN by the smoke, not a failure.

- (core, S2 merge) AUTOCAM §12 tables are in `CAMERA.iso` (follow, lead gains/caps, aimPan, frame, framing, beats, snuggle, reduce, pinch, semi, foot, budget, boss.establish/dizzy/phaseBreath/defeatHold, touchShakeRot). Retired keys keep their old values for the current rig: `lead.cursor` stays 0.15 (AUTOCAM default 0 comes from `settings.camCursorLead`), `boss.herInner` stays 0.6 (AUTOCAM 'frame' = frame.herInner), `far` 90 (→ foot.far). `occl.archOpacity` 0.1 added. Core helpers: math.js smoothDamp/smoothDamp2, schedule.js every().

- (core, S1) `ctx.postfx.setCinematic(on, { dur, bloom, grade })` is live: High builds the PostChain on the first call and fades bloom in / out over `dur` (default `RENDER.cinematic.fade` 0.6 s); Low / Med record only. Call it on cutscene / preset enter and at the end of the hand-back (A:camera.2); never for Meme Cam or gameplay. `__GAME__.cam.probe()` / `.framing()` pass through to `ctx.cam.probe?.()` / `framing?.()` (AUTOCAM §11 gates).

## from player (AUTOCAM §5.3 / §5.5 / §4, M:player.1–5) — live now
- `player.moveIntent { x, z, speed, kind }` written every sim step in place (no allocation): `stick` (touch, before her
  velocity; speed = run × smoothstep(TOUCH.stickDead, 1, |stick|)), `walk` / `run` (WASD / pad; her speed), `order`
  (toward `orders.lookAhead(CAMERA.iso.lead.orderLook)`; run speed easing to 0 inside NAV.slowR of the end), `other`
  (swings, Tumble, Pounce, hurt / stagger knockback, splash lock, scripted / attached), `idle` (x = z = 0).
- `player.orders.lookAhead(dist, out)` → boolean (out = her position when no order walks); `orders.remaining()` metres.
- `player.aim.held` (true while a held aimed action is up) and `player.aim.range` (Holy charge with Shard 2 → 10 m, Wave
  Reach 15 m; Golden Hour charge → gleam 8 m; a companion aim's `ctx.companions.aim.range ?? plan.range`). Use
  `aim.held && aim.range ≥ 5` for aim pan.
- `player.groundY`: the Y of her last ground contact (set right after `physics.moveActor` while `onGround`; teleports
  reset it). Unit-tested: airborne keeps the last contact.
- D1: `object3d.position` is the interpolated render pose (core Actor.render lerps prevPos → pos by alpha; the player
  adds nothing on top). Unit-tested in tests/unit/player.test.js.

## from ui (Phase W review)
- Title shot (CS-00, owned with story): the kitten reads tiny (~40 px) under the logo; a closer title preset that puts
  her at >= 120 px above the lower-third CTA (ui `.home-row`, bottom-anchored) would make her the star of the shot.

## to camera, from core / fx (PERF §1.2 programs per level, the `perf:programs` hard gate)
- `cam:lockMarker` (MeshBasic, own program on every level): build it with fx's `fxBasicMaterial({ color, opacity,
  transparent, fog: false, depthTest, ... })` (`src/fx/shaders.js`; `.color` / `.opacity` stay live): 1 program → 0.
- `cam:fadeProxy` (instanced Lambert, forest): an instanced `worldMaterial()` (`src/world/Props.js`, needs a `color`
  attribute; with an `instanceColor` it shares the world's instanced program) or `fxBasicMaterial` if it can be unlit.
