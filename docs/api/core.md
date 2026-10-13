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

## Controls rework (CONTROLS_SPEC §6, §12 core)
- `input.consumeLook()` returns zeros in iso unless the pointer is locked (`?cam=classic` keeps the orbit look). Mouse
  movement counts as activity only above 24 px/s.
- `input.haptic(kind)`: wired to parry, perfectDodge, hurt, block, guardBreak, hitHeavy, holy, golden, kitten,
  orderRejected (touch only; the pad rumbles from JUICE), scaled by `settings.haptics`, never in menus. ui sends
  `button` from the touch cluster (gated by `settings.hapticTaps`).
- Action `controls` = pad Back / View (8): ui pauses and opens the controls card. Unbound on the keyboard and in classic.
- `config.AIM` now carries the combat prose numbers too (`recentHitWindow`, `reflectCone`, `reflectRange`,
  `projectileLead`, `lungeSettle`, `lungeFrac`, `selExtra`, `ringLead`, `threatRange`, `threatKeep`,
  `hittableBelowDefault`); `combat/targeting.js aimCfg()` merges them over its fallback.
- Smoke harness: `t.viewport(w, h, { touch: true })` boots a separate hasTouch + isMobile phone session
  (`{ page, G, shot, frames, screen, tapAt(x, z), touch(type, x, y, id), close }`); `page.goto` / `reload` use
  `SMOKE_BOOT_TIMEOUT` (default 60 s). `controls:pad` stubs `navigator.getGamepads` for pad checks.

## Pointer activity + Meme Cam exit (2026-10-12)
- `input.pointer.speed` is the NET displacement over the last `INPUT.pointer.speedWindow` (0.25 s) divided by the
  window, so cursor jitter cancels out; activity needs ≥ `INPUT.pointer.idlePxPerSec` (≥ 6 px net in 250 ms).
- While `game.mode === 'memecam'`, pointer motion is activity (resets `idleTime`) only once the cursor is
  `CAMERA.iso.meme.exitPx` (40) from where it rested when the Meme Cam started (CONTROLS_SPEC §2.7). MemeCamTrigger's
  `idleTime === 0` exit therefore already honours exitPx; no player change needed.
- `input.pointerMark()` / `input.pointerSince(mark)`: straight-line CSS px the cursor is from a mark.
- The canvas rect is cached (refreshed on resize / scroll / canvas ResizeObserver), not read per mousemove.
- Removed `INPUT.pointer.cursorFresh` (unused); cursor freshness is `AIM.cursorIdle` with `input.pointerIdle()`.

## PERF §1.2 programs per level (shader consolidation)
- `core/uber.js` `UberGroup(name, { libs, shared, sharedVaryings })`: links GLSL *modules* (standalone ShaderMaterial
  sources) into one program: per-module names via `#define` / `#undef`, varyings / custom attributes on shared typed
  slots (`fxv_*`, `fxa_*`; geometry attributes aliased per draw, no copies), Front / Back side as a `gl_FrontFacing`
  discard, `fog: false` per block, `instanced: true | 'both'` (vertex-stage USE_INSTANCING guard), every sampler bound
  on every draw. `group.module(src)` → record; `group.material(mod, params)` → `UberMaterial`; `uberPrepare(root)`
  (prewarm calls it) aliases `normal` so geometry never splits the program. `UBER_GROUPS` / `__GAME__.art.uber()`.
- `core/depth.js`: `depthFor(o)` now uses three's own `BasicDepthPacking` (r186 shadow maps write a DepthTexture), so
  custom and default casters share one depth program per kind; `SHADOW_ONLY_LAYER` (9) + `shadowOnly(o)`: casters drawn
  into the sun's shadow map only (world Env enables the layer on the shadow camera).
- `tests/smoke/perf.mjs` `perf:programs` is a hard gate on every run: fresh pages at low / med / high × meadow + gate
  (all four M2 levels with `SMOKE_PERF=1`), `renderer.info.programs` ≤ `QUALITY[preset].programs` (+ `programsCinematic`).
