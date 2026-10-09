<!-- Archived from requests/core.md by core at the M2 integration pass (2026-10-09): the M1 API notes and requests of this area.
     Open items were moved to requests/core.md; applied ones are summarised in requests/RESOLVED.md. -->

# Notes from core (integrator)

## Re requests/characters.md — NaN with MSAA + bloom (2026-10-07)
- Done in core: `PostFX` sanitises the bloom input (UnrealBloom high-pass: clamp to [0, 65000], NaN → 0), so one stray
  NaN pixel can no longer flood the whole frame. Still clamp `pow()` bases / guard `normalize()` in your own shaders —
  the NaN pixel itself stays wrong.

## Smoke GPU backend
- `tests/smoke.mjs` defaults to `--use-angle=gl` on Windows: with d3d11 + the MSAA HalfFloat composer target,
  `page.screenshot` got slower every call (1 s → 22 s) and rAF stalled. Same real GPU, ~60 fps. `SMOKE_GPU=d3d11` still works.

## M1 integration pass (2026-10-08) — what core changed for everyone
- `ui:progress` is throttled (one per 100 ms + the last of a batch) and kept out of `__GAME__.events` (still in
  `lastEvent`), so `game:ready` / `level:loaded` stay in the 200-entry ring (world/save requests). The ring stays 200 (§19.8).
- New event `save:written {reason, savedAt, ok}` (save emits it after every write; ui may drop its 10 Hz poll).
  `save:loaded` JSDoc gained `reason?: 'new' | 'continue' | 'title'`.
- `ScriptedActor.prop(name, on, opts)` passes `opts` to `onProp` (characters).
- `config.PLAYER` now holds the player's prose numbers (faintDur … sneezeMinFog, same names); `src/player/tuning.js`
  reads config first and keeps its own values as fallbacks.
- player: `setExpression(name | null)` and `setCapeOverride(id | null)` (story request); held through scripted poses.
- enemies: `targetActor()` returns an awake taunting companion while `tauntT > 0` (Shield Wall), `distToTarget()` drives
  melee range; `tauntT` decays per step (companions request).
- world: Arena `_pullInside` never drops her into deep water; a locked non-boss arena resets when she is > 4 m outside
  (teleported out) instead of dragging her to the ring edge (it was the stream at the Old Bridge). Fence colliders on
  non-walkable runs top out at the higher end (physics request). Arena clear plays no STEEL jingle when audio's
  director runs (audio plays the §16.1 victory sting). Sir Tallbert + `g01_mark` moved 1.5 m north (4, −55.5 / −58):
  at the §5.4 spot the G-01 MEME_LOOP camera sat behind the north fence rails. The practice lantern post moved off the
  `practice` spawn's camera line.
- story: D-01 walks her up to 1.3 m of Mochi before the low two-shot (in play Mochi lands up to ~4 m away).
- Smoke harness: every block with a `level` now starts from boot-like progress (default state, settings kept, no party,
  no enemies, time scale 1, keys released). Full runs used to leak flags/party/enemies between blocks
  (combat:block, enemies:budget, companions:nap/kittens failed only in the full run). New block `slice:meadow`
  (tests/smoke/slice.mjs) plays the M1 slice end to end: practice → G-01 → CS-02 → crossroads → stones → CS-03 →
  glade → Crow Fields → Old Bridge → D-01 → exit → results → forest.
- `SMOKE_NOHMR=1 npx vite --port <p> --strictPort` = dev server without HMR / watch (restart it after edits).

## Pause on pointer-lock loss + GPU leak guard (2026-10-09)
- Input: losing pointer lock during `play` / `memecam` (the browser spends the player's Esc on it) now calls
  `ctx.ui.pause()` on the next fixed step (not during cutscene/dialog/menu/loading or while `ui.busy`), and swallows a
  leaked `pause` edge that step. New event `E.INPUT_POINTER_LOCK { locked }`. Leaving 'menu' for play/memecam calls
  `input.relock()` (re-requests the lock if it was held before and the device is kbm) — ui needs no change.
- Smoke: `core:pointerlock` (real lock in Chromium) and `core:leaks` (meadow↔forest reloads; fails if geometries grow
  > 20 or textures > 4 after a warm-up round). Current: geometries flat (91), textures +1 per round (35→36→37) — some
  meadow/forest texture is not disposed on unload (small, under the limit).
- **Request → audio**: AudioManager's `ac.onstatechange` only reacts to 'running'. After a device / renderer error
  (seen in a long full smoke run: "The AudioContext encountered an error from the audio device…") the context can go
  'suspended' / 'interrupted' or 'closed'. Please `ac.resume()` on 'suspended'/'interrupted' (on the next user gesture
  if it rejects) and, on 'closed', rebuild the graph (new context via unlock) instead of staying silent.
