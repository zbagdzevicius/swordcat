# SWORDCAT: the MOBA auto-camera, the FINAL binding spec (AUTOCAM)

Author: lead design, 2026-10-11. Status: **binding**. It extends `research/CONTROLS_SPEC.md` §2 (iso rig), §12
(camera tasks) and §13 (config) and, where a number below differs from those sections, **this file wins**. Inputs
were the drafts `research/next/cam_0.md` (MOBA-purist), `cam_1.md` (Framing Director) and `cam_2.md` (mobile
ergonomics), plus two judge verdicts. Those drafts are background only from now on.

User request: *"make sure that we follow warm cartoonish kind of thematics so that everyone will feel great inside,
not 90s kind of nostalgic game. while performance must be extraordinary. and create maximum moba-like automatic
camera control as well."*

Ground rules for implementers:
- Every number lives in `config.CAMERA.iso` (§12). **No literals in area code.** Code defensively against names that
  have not landed yet (`ctx.cam.footprint?.…`, `config.CAMERA.iso.auto ?? FALLBACK`).
- Measurements quoted here come from `research/next/tools/cam_extents.mjs`, `cam1_framing.mjs`, `cam1_variants.mjs`
  and `cam1_pitch.mjs` (pure node; re-run them before tuning).
- LoL, Wild Rift and Dota figures are context only. They are unverified and never a design input.
- `?cam=classic` keeps the old orbit camera and bypasses everything in this file.

**Cross-spec reconciliation (2026-10-11, binding):** cross-checked against `ART_WARM_SPEC.md`, `PERF_SPEC.md` and
CONTROLS_SPEC. Decisions **X1–X37** are in `research/next/IMPLEMENTATION_PLAN.md` §2 (merged tasks, contracts and
gates there too). The ones that change this file (edited in place, marked `[X#]`):
- **X7 / X20 shadows:** camera only **publishes** `cam.footprint`; world computes the box. §9.2's fit is shadow
  **stage 1**; stage 2 (PERF §7.3) caches the map in a box = this fit + an 8 m margin, so the fit itself stops being
  re-rendered every frame. Med 1024 / High 2048 / Low none is decided (§15 Q3 closed).
- **X11 / X12 grass and far:** grass is PERF's single footprint-centred tile with fixed counts (§9.4 amended); the far
  plane is one merged formula, `max(footprint far, fog far)` (§9.3 amended); the dressing `maxDist` rule is replaced by
  PERF's 4 Hz fog-radius cull.
- **X13 activity:** §9.5's `inFootprint` actor skip is replaced by PERF §4.3 `activityOf` tiers (frustum-based);
  `onScreen` keeps this file's SafeFrame-visible meaning and is for gameplay rules only.
- **X15 timing:** `camera:perf` ms numbers and every other ms gate are report-only until PERF §14.4's idle-machine
  baseline; heap growth is measured with CDP heap sampling, not `performance.memory`.
- **X19 lock:** `settings.camLockMode` replaces CONTROLS' boolean `camLock` (§10.4 amended).
- **X22 SafeFrame vs UI:** pointer-events-none overlays (`#ui-vignette`, `#ui-flash`, toasts, `?perf`) are not
  occluders; ART's restyle keeps CONTROLS' cluster / bar geometry, so the §7.2 fixtures stand.
- **X23 / X24 events and beat twins:** `kitten:rescued` gains `position`; the beat twins are ART §8.6's effects.
- **X29:** R10 allows the Cosy beat's −1.5° FOV.

---

## 0. The design in one paragraph

The iso rig stays as CONTROLS_SPEC built it: fixed yaw, 38° FOV, 13 m (phone 12 m), the pitch curve and the
cat-size clamp. On top of it the camera becomes **fully automatic, like a locked Wild Rift camera that also thinks**.
Her XZ is followed **rigidly** on the interpolated render pose. Every other offset (lead, combat lean, aim pan, beat,
zoom) is its **own critically damped spring** (`smoothDamp`, one helper in `core/math.js`), so nothing ever bounces,
snaps or rubber-bands. The measured blind zone is the **camera side** (only 3.2 m of ground below her at 1080p), so
the lead and the combat lean are **largest down-screen**. Lead follows **intent** (stick, path, WASD), never tumbles
or knockback. Combat framing is a **closed-form fit** at 20 Hz that zooms out fast and back in slowly, and that
treats an enemy winding up on her as a must-see subject. Every "is it visible" question uses one **SafeFrame**:
the viewport minus the safe-area insets, the HUD and the touch cluster, so a rat under the ⚔ button counts as hidden.
Finally the camera **publishes its visible ground footprint**, and the shadow map, grass, far plane and actor
updates are sized to it. That makes the camera the biggest single performance lever in the game.

---

## 1. Decisions (conflicts between drafts and verdicts, resolved)

| # | Question | Decision |
|---|---|---|
| D1 | Her follow | **Rigid XZ** on her interpolated `object3d.position` (Loop renders with `alpha`). Y follows the ground under her through a spring (smoothTime 0.18 s). The spec's λ12 / λ6 damping is retired for iso. Fallback: if player cannot guarantee an interpolated render pose by P1 end, camera uses λ12 on XZ and the jitter test (§11) decides. |
| D2 | Spring | One `smoothDamp` / `smoothDamp2` in `src/core/math.js` (cam_0 form: speed cap + no-overshoot clamp). **No other smoothing primitive** in the iso path (no `damp(λ)`, no lerp-per-frame). |
| D3 | Her inner frame | `herFrame = SafeFrame.core ∩ inner 75 %` (NDC ±0.75). On touch the core is already tighter, so in practice it is the core. Replaces the spec's boss 60 % and the 70 % / 75 % proposals. |
| D4 | Lead size | Per-direction gains (down 0.42 s, side 0.26 s, up 0.12 s) with **per-device, per-axis caps** (§5.2) that are proved inside `herFrame` by the unit sweep. Total radial cap 2.5 m (spec). |
| D5 | Lead source | Intent only: touch stick (× smoothstep of magnitude), path point 2.5 m ahead for orders, WASD / pad wish direction. Tumble, Pounce, lunge, knockback, slide, conveyor → 0. 0.20 s start debounce. |
| D6 | KBM cursor lead | **0 by default.** Optional setting `camCursorLead` 0–0.15. |
| D7 | Down-screen combat lean | Cap 4.0 m desktop, 3.0 m tablet, **2.0 m** phone (both orientations), and always inside `herFrame`. |
| D8 | Crowd term | +0.25 m per engaged enemy beyond 2, max +1.5 m, inside the spec's +3 m combat budget. |
| D9 | Engage hysteresis | Enter at 10 m, leave at 12.5 m or after 1.5 s not alerted. |
| D10 | Zoom tempo | Out: smoothTime 0.35 s, ≤ 6 m/s. In: wait 1.5 s, then smoothTime 1.2 s, ≤ 1.5 m/s. |
| D11 | Combat zoom-in | Never, except the **Dizzy punch** (−1.0 m) in boss fights, as a punch envelope, only with *Reduce camera motion* off. |
| D12 | Clock | Springs run on real `frameDt` (clamped to 0.1 s). During hitstop the **goals freeze**; springs and shake keep running. |
| D13 | Idle motion | One-shot **snuggle** dolly-in after 5 s idle. **No** continuous breathing or bob. **No** storybook settle at level start (the title-card fade is enough). |
| D14 | Overshoot | Never, anywhere, including joy beats. Bounce belongs to the characters and fx. |
| D15 | Touch pan | None (Wild Rift: locked to the hero). Pinch zoom only, and pinch never pans. Semi-lock and edge pan are desktop settings only. |
| D16 | Solver | One module, `FramingSolver.js`: closed-form distance per point (2 pitch passes), analytic horizontal lean, 10-step ternary search for the vertical lean only when a hard subject is outside the vertical band. |
| D17 | Subjects (first pass) | HER, THREAT (wind-up on her, plus token pre-attend), BOSS, BOSS_LANE, SELECTED, ENGAGED. Soft subjects only via the 4 beats (§8). The other cam_1 classes are deferred. |
| D18 | Beats (first pass) | **Peekaboo, Cosy two-shot, Room read, Exhale.** Max 4. Rest and Discovery are P5 candidates. Wave glance, Helper moment and Lead the way are rejected. |
| D19 | Portrait range | Distance range **[16, 26] m** in portrait (landscape keeps [9, 18]); the cat clamp still applies on top. |
| D20 | Reduce camera motion | Defaults from `prefers-reduced-motion`. No animated lead; a **static** compensation instead (bias 0, anchor y 0.50), discrete combat zoom, constant FOV, veil cuts, no beats, no snuggle. |
| D21 | Far plane | Footprint-driven (§9.3), quantised to 5 m, range [45, 90], fallback 60. Landmarks that must stay drawn are tagged `farKeep` by world. |
| D22 | Spine bias / occlusion lean / semi-lock on touch / 2-finger pan | Rejected for now (§14). The spec's 0.8 m screen-up bias stays out of combat. |

---

## 2. Feel rules (the "warm cartoon, not 90s" contract)

The 90s camera is the twitchy one: hard cuts to enemies, rotation on its own, swings around walls, bounce. Ours is
**soft, confident, generous and kind**. These rules are testable and every area that drives the camera obeys them.

| Rule | Number | Test |
|---|---|---|
| R1 Never rotate on its own in play | yaw changes only from authored zone hints (spec §2.2) | `camera:no-hands` yaw trace constant outside hints |
| R2 Never overshoot | all motion through `smoothDamp`; overshoot ≤ 1e-6 of the step | unit 1 |
| R3 Rate caps | d out ≤ 6 m/s, in ≤ 1.5 m/s; lean ≤ 5 m/s; lead ≤ 4.5 m/s; pitch ≤ 20°/s; FOV ≤ 12°/s (punches ≤ 0.15 s exempt) | `camera:rates` (§11.2) |
| R4 Out fast, in slow | §6.5 | `camera:teamfight` |
| R5 Goal hysteresis, not dead zones on her | ignore d goal changes < 0.35 m and lean changes < 0.30 m while all hard subjects are inside the 92 % frame | `camera:no-jitter` |
| R6 Weights fade | subject weight in 0.35 s, out 0.5 s | unit |
| R7 She always wins | her feet and head stay inside `herFrame`; she is never smaller than the cat clamp | unit sweep + `camera:safe-frame-*` |
| R8 Beats invite, never hijack | beat lean ≤ 2.5 m, Δd ≤ ±1.5 m; never during a live THREAT; opposing input fades it in 0.3 s | `camera:beats` |
| R9 No hard cuts in play | cuts only in cutscenes, or the spec veil cut (> 120° or > 30 m) | — |
| R10 No roll, no FOV pumping | shake rotation ×0 on touch, ≤ 1.2° desktop; FOV changes only from spec punches and the Cosy beat's −1.5° (X29), always ≤ 12°/s | `camera:reduce-motion`, `camera:rates` |
| R11 No continuous oscillation | no idle breath, no bob, no sway outside the Meme Cam | d trace while idle 20 s: ≤ 2 reversals |

Warmth is carried by **how** the camera moves: it eases toward what the player cares about (a kitten peeking out,
a rescued friend) and it relaxes after a fight. Colour, toon shading and fx carry the rest (art specs).

---

## 3. Measured facts that drive every number

Ground visible from her feet (spec bias 0.8 m up-screen, her 4 % below centre; `cam_extents.mjs`):

| Case | Up-screen | **Down-screen** | Half width | px/m side | px/m depth | Her px |
|---|---|---|---|---|---|---|
| Desktop 1920×1080, d 13, 51.3° | 10.63 m | **3.18 m** | 8.43 m | 120.6 | 94.1 | 97 |
| Desktop, d 16, 55.3° | 11.41 | 4.07 | 10.24 | 98.0 | 80.6 | 78 |
| Phone 844×390, d 12, 50° | 10.32 | **2.87** | 9.53 | 47.2 | 36.2 | 38 |
| Phone 844×390, d 15 | 11.15 | 3.77 | 11.73 | 37.8 | 30.5 | 30 |
| Portrait 390×844, d 21, 58°, her at 40 % | 12.83 | 10.24 (to the screen edge; only ≈ 4.6 m to the thumb band) | 4.68 | 43.1 | 36.5 | 34 |

- **F1 (blind zone):** down-screen is the camera side. Running toward the lens at 5.5 m/s she sees 0.58 s ahead.
  A threat 7 m down-screen needs d 23.4 m to fit by zoom alone. Pitch +4° / +8° makes it *worse*
  (16.8 → 17.1 → 17.3 m). **Leaning the focus down-screen** fixes it: a 4 m lean brings that case to 16.8 m, 5 m to
  13.0 m (`cam1_variants.mjs`).
- **F2:** the ground bounding-box centre is wrong in perspective; the vertical lean must be solved on the projected
  requirement (§6.3).
- **F3 (cost):** a full solve with 16 subjects costs 39 µs in node; at 20 Hz that is ≈ 13 µs per 60 Hz frame.
  `smoothDamp` is 0.02–0.05 µs.

---

## 4. Rig architecture and composition

### 4.1 Files (all `camera` area unless noted)

| File | Kind | Content |
|---|---|---|
| `src/core/math.js` (**core**) | pure | `smoothDamp`, `smoothDamp2` (§4.3) |
| `src/camera/IsoRig.js` | pure, node-tested | pitch curve, cat clamp, width fit, distance ranges, **lead** (§5), composition + `herFrame` clamp (§4.2), `footprint()` (§9.1) |
| `src/camera/SafeFrame.js` | pure, node-tested | §5.4 / §7 |
| `src/camera/framing/FramingSolver.js` | pure, node-tested | `needD`, `solveFrame`, the drop ladder (§6) |
| `src/camera/framing/Subjects.js` | pure pool + `attach(ctx)` listeners | Float32Array subject pool (stride 8, max 16) |
| `src/camera/framing/beats.js` | data + envelope | the 4 beats (§8) |
| `src/camera/FollowCamera.js` | three glue | mode machine; per render: gather → solve (gated 20 Hz) → springs → compose → pose → `applyAnchor` → footprint publish |

### 4.2 Per-render pipeline (fixed order; zero allocations)

```
1  dt      = min(frameDt, 0.1)                                   // real time, never timeScale (D12)
2  feet    = player.object3d.position (interpolated)              // rigid XZ (D1)
3  groundY = spring(player.groundY + focusY + jumpLift,  smoothTime 0.18)   // last grounded feet Y (bridges, decks);
                                                                         // jumpLift = 0.3 (bounce 0.5) × height above it
4  goals   = hitstop ? goals (frozen) : { lead (§5), solver goal (§6, 20 Hz), beat (§8), aimPan (§5.5) }
5  springs : biasUp, lead(2D), lean(2D), aimPan(2D), beat(2D), dist, beatDd     // each its own smoothDamp state
6  offset  = biasUp + lead + lean + aimPan + peek/semi (desktop) + beat
7  offset  = clampToHerFrame(offset, limits)                     // limits refreshed at 20 Hz (§4.4)
8  focus   = (feet.x, groundY, feet.z) + offset
9  d       = clamp(dist + punches, range(orientation), dMaxCat);  pitch = pitch(d) (+ boss / golden overrides)
10 camera.position = focus − fwd(yaw, pitch) · d;  camera.quaternion from (yaw, pitch); camera.updateMatrixWorld()
11 applyAnchor(fx, fy) (integer px, only on change);  projection only if fov / aspect / near / far / offset dirty
12 frustum.setFromProjectionMatrix(projScreen) once → cam.frustum, cam.frameId++
13 footprint (§9.1) → cam.footprint (quantised consumers read it next frame)
```

- When combat starts, the lead **goal** goes to 0 and the lean goal rises; both pass through their springs, so the
  frame cross-fades without a seam.
- **Discontinuities:** if `feet` moves more than **4 m** in one frame (teleport, respawn, `snap()`), every spring is
  reset to its goal with velocity 0. Above **8 m**, it happens under the existing 0.25 s veil.
- Camera rotation never changes during gameplay except via hints, so `fwd`, `U` (screen-up on the ground) and `R`
  (screen-right on the ground) are cached per yaw: `U = (−sin ψ, 0, −cos ψ)`, `R = (cos ψ, 0, −sin ψ)`.

### 4.3 The spring (core `math.js`, shipped in P0)

```js
// Critically damped smoothing (Game Programming Gems 4 §1.10; Unity SmoothDamp form). Exact for any dt, never
// overshoots, velocity stays continuous. st = smoothTime (s); vmax = rate cap (units/s). state = { v: 0 }.
export function smoothDamp(cur, target, state, st, dt, vmax = Infinity) {
  st = Math.max(1e-4, st);
  const w = 2 / st, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let ch = cur - target; const maxCh = vmax * st; ch = Math.min(maxCh, Math.max(-maxCh, ch));
  const tgt = cur - ch, tmp = (state.v + w * ch) * dt;
  state.v = (state.v - w * tmp) * e;
  let out = tgt + (ch + tmp) * e;
  if ((target - cur > 0) === (out > target)) { out = target; state.v = 0; }   // no overshoot
  return out;
}
// 2D (XZ or screen r/u) variant: radial rate cap, no diagonal speed-up. o = {x, z}; s = {vx, vz}. Zero alloc.
export function smoothDamp2(o, tx, tz, s, st, dt, vmax = Infinity) {
  st = Math.max(1e-4, st); const w = 2 / st, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let cx = o.x - tx, cz = o.z - tz; const m = Math.hypot(cx, cz), maxCh = vmax * st;
  if (m > maxCh) { cx *= maxCh / m; cz *= maxCh / m; }
  const ax = (s.vx + w * cx) * dt, az = (s.vz + w * cz) * dt;
  s.vx = (s.vx - w * ax) * e; s.vz = (s.vz - w * az) * e;
  let nx = (o.x - cx) + (cx + ax) * e, nz = (o.z - cz) + (cz + az) * e;
  if ((tx - o.x) * (nx - tx) + (tz - o.z) * (nz - tz) > 0) { nx = tx; nz = tz; s.vx = s.vz = 0; }
  o.x = nx; o.z = nz;
}
```

### 4.4 The `herFrame` clamp (guarantee R7)

At every solver tick (20 Hz) and on any SafeFrame or distance-range change, IsoRig computes the **offset limits** in
ground metres along the screen axes, using the same ray–plane routine as the footprint (§9.1):

```
limits.down  = groundDistAlongU(focusGround → ground point under screen y = herFrame.y0) − 0.6   // she moves UP
limits.up    = groundDistAlongU(focusGround → ground point under screen y = herFrame.y1) − 0.3   // she moves DOWN
limits.right = groundDistAlongR(… x = herFrame.x0) − 0.4 ;  limits.left = (… x = herFrame.x1) − 0.4
```
(The 0.6 m pad keeps her head, which is 0.8 m tall, inside the top edge.) Step 7 of §4.2 clamps the offset per axis
to those limits after composition. No combination of lead, lean, aim pan, peek and beat can push her out.

---

## 5. Explore framing: anchor, lead, aim pan

### 5.1 Anchor with `setViewOffset` (both axes; zero cost)

Where the focus appears on screen, `(fx, fy)` in normalised viewport coordinates (y down), comes from SafeFrame
(§7.2). It is applied as a whole-pixel view offset and only on change, so the projection is rebuilt only then and
frustum culling stays exact:

```js
// FollowCamera (camera). Module-level state; no allocation.
const _vo = { x: NaN, y: NaN };
function applyAnchor(cam, vw, vh, fx, fy) {
  const ox = Math.round((0.5 - fx) * vw), oy = Math.round((0.5 - fy) * vh);   // whole px: no sub-pixel shimmer
  if (ox === _vo.x && oy === _vo.y) return;
  _vo.x = ox; _vo.y = oy;
  cam.setViewOffset(vw, vh, ox, oy, vw, vh);   // r186: calls updateProjectionMatrix()
}
```
- Sign check: the image centre appears at `(vw/2 − ox, vh/2 − oy)`; `fy = 0.40` gives `oy = +0.10·vh`, so she is
  drawn 40 % from the top.
- An anchor change (rotation, mirror toggle, layout edit) eases over **0.4 s** easeInOutSine in whole pixels.
- `clearViewOffset()` for preset rails, cutscenes and `?cam=classic`; the crane arc tweens the anchor to (0.5, 0.5)
  inside its blend. `worldToScreen`, `pick` and `onScreen` read `projectionMatrix`, so they stay correct.

### 5.2 Direction-weighted intent lead (`IsoRig.lead`)

```
I        = intent velocity (m/s, world XZ) from §5.3; 0 if kind ∉ {walk, run, order, stick}
vu = I·U, vr = I·R
gain     : up 0.12 s, down 0.42 s, side 0.26 s           (portrait side 0.10 s)
target.u = vu ≥ 0 ? min(capUp, vu·0.12) : −min(capDown, −vu·0.42)
target.r = clamp(vr·gainSide, ±capSide)
target  *= smoothstep(1.2, 4.0, |I|)                      // a 2 m/s walk leads ≈ 20 %; a run gets it all
target   = radial clamp 2.5 m;  then debounce (§5.3)
lead     = smoothDamp2(lead, target, st = |target| ≥ |lead| ? 0.55 : 0.80, vmax 4.5 m/s)
```

| Profile | capSide | capUp | capDown | Her worst position (proved by unit sweep) |
|---|---|---|---|---|
| Desktop KBM / pad (1920×1080) | 1.7 | 0.8 | **2.4** | down lead → fy 0.33 (core 0.12–0.88); side → fx 0.50 ± 0.107 |
| Tablet landscape | 1.4 | 0.8 | 2.0 | inside core 0.18–0.70 × 0.14–0.84 |
| Phone landscape (844×390) | 1.4 | 0.8 | **2.0** | down → fy 0.355; side → fx 0.382–0.538; up → fy 0.614 (core 0.24–0.60 × 0.20–0.80) |
| Phone portrait (390×844) | 0.8 | 1.2 | **2.0** | down → fy 0.314; up → 0.452; side ±0.088 (core 0.08–0.92 × 0.13–0.60) |

Result at a run (5.5 m/s): desktop down-screen sight **3.18 + 2.31 = 5.5 m (1.0 s)**, phone landscape
2.87 + 2.0 = 4.9 m, portrait from 4.6 m (to the thumb band) to 6.6 m. Up-screen is already generous, so it gets
little. Zoomies (7.2 m/s) hit the caps; that is intended. The **release** (0.80 s) is slower than the build
(0.55 s): when she stops, the world settles back like a cat sitting down.

Lead is 0 (through the spring, never a snap) while: combat framing is active (§6), the Stand or a charge is held,
an aim pan is active (§5.5), a beat runs, *Reduce camera motion* is on, or the mode is not `follow`.

### 5.3 Intent sources and debounce (player exposes, camera reads)

`player.moveIntent = { x, z, speed, kind }`, written every sim step without allocation.

| `kind` | Source | Direction | Speed |
|---|---|---|---|
| `stick` | touch joystick, ≈ 0.15 s before velocity (yaw is fixed, so stick-right = screen-right) | latched stick direction (spec `stickYaw`) | `runSpeed × smoothstep(stickDead, 1, mag)`: thumb wobble near centre moves nothing |
| `walk` / `run` | WASD, pad left stick | `wishDir` | her current locomotion speed |
| `order` | click / tap / RMB-hold path | from her toward the path point **2.5 m ahead** (`player.orders.lookAhead(2.5, out)`) | run speed while the order is live; eases to 0 inside `NAV.slowR` (0.8 m) of the end |
| `other` | tumble, Pounce, lunge magnetism, knockback, slide, conveyors, scripted motion | — | lead target 0 |
| `idle` | none | — | 0 |

**Debounce:** the lead target becomes non-zero only after **0.20 s** of continuous intent within **±50°** of the
current lead direction. A turn of more than **120°** resets the timer (the lead releases first). Combat taps of
0.1–0.3 s therefore never move the camera.

### 5.4 KBM cursor lead

`lead.cursor` **0.15 → 0** (D6). With click-to-move, any cursor-proportional lead slides the ground under a still
cursor (fixed point = g·c / (1 − g), 17.6 % of the cursor offset at g = 0.15), hover rings crawl and clicks miss.
Setting `camCursorLead` (0–0.15, default 0) restores it for players who want it.

### 5.5 Aim pan (Wild Rift "Aim Panning"; P3)

While an aimed action with `player.aim.range ≥ 5 m` is **held** (Holy charge → wave 10 m, gleam 8 m, aimed companion
abilities): `pan = aimDir × min(capAim, 0.40 × max(0, |aimPoint − her| − 3.0))`. Smooth in **0.30 s**; on release
**hold 0.35 s** (you see the wave leave), then release with smoothTime 0.6 s. `capAim`: desktop 2.5 m, tablet 2.0,
phone landscape 1.6, portrait 1.0, and always the `herFrame` clamp. Touch uses the drag-aim point, pad the RS aim,
KBM the cursor ground point sampled only while the action is held. It replaces the movement lead while active.

### 5.6 Out-of-combat extras

- **Screen-up bias** 0.8 m (spec) stays in explore; its target goes to 0 in combat, boss and arena modes, smoothTime
  1.0 s. Portrait 0 (spec).
- **Snuggle** (D13): after **5 s** with no input, no engaged enemy, no order and no beat: `dd = −0.6 m` (never below
  the range minimum), smoothTime **1.2 s**. Any input returns with smoothTime **0.35 s**. The Meme Cam descent starts
  from the snuggled pose. One-shot; it does not repeat until input resets the idle timer.

---

## 6. Combat framing (FramingSolver; P2)

### 6.1 When

Combat framing is active while the engaged set is non-empty (§6.2) or a target is selected within 12 m. Lead goal → 0.
The solver runs at **20 Hz**, plus an immediate re-solve on any hard-subject add.

### 6.2 Subjects (first pass; D17)

Pool: `Float32Array(16 × 8)` = `[x, y, z, ρ, w, flags, class, ttl]`; `y` is the vertical centre, `ρ` the framing
radius (body + margin). Max 16 (her + 15), filled by class priority, then nearest first.

| Class | Source | ρ (m) | w | Hard | Enters | Leaves |
|---|---|---|---|---|---|---|
| HER | player (implicit) | 0.6 at y + 0.4 | — | always (in `herFrame`) | — | — |
| THREAT | `combat:telegraph` with `targetsPlayer`, from `activeAt − windup` | actor r + **0.8** (+ the lane end for `lane`/`line`) | **2.0** | yes | wind-up start | `telegraphEnd` + 0.3 s |
| THREAT (pre-attend) | holder of a melee attack token (`combat.tokens`) | actor r + 0.6 | 1.0 | **soft** | token grant | token release |
| BOSS | `boss:start` … `boss:defeated` | `boss.radius + 1.5`, y = h/2 | 1.0 | yes | | |
| BOSS_LANE | boss telegraph of shape `lane` (Wheel Ride, B2 charge) | 1.0 at the lane end | 1.0 | yes | wind-up | `telegraphEnd` |
| SELECTED | `target:changed` | r + 0.6 | 1.5 | hard ≤ 12 m, soft ≤ 16 m | | deselect |
| ENGAGED | alerted hostile within **10 m**; leaves at **12.5 m** or 1.5 s not alerted (D9) | r + 0.6 | 1.0 | yes | | |

Weights fade in over 0.35 s and out over 0.5 s (R6); a fading subject counts as hard only while w ≥ 0.5.

### 6.3 The solver (three.js r186 conventions; `FramingSolver.js`, pure)

```js
// yaw ψ fixed; θ = pitch(d); U, R = ground screen axes (§4.2); tanV = tan(fov/2); tanH = tanV·aspect.
// Anchor in NDC: offX = 2·fx − 1, offY = 1 − 2·fy.  Frame (NDC, y up): [xL, xR] × [yB, yT] = SafeFrame.fitRect.
// Subject p, radius ρ, relative to the focus F:  e = p − F
//   xc = e·R;  yc = (e·U)·sinθ + e.y·cosθ;  a = (e·U)·cosθ − e.y·sinθ;   view depth z = d + a
// Closed-form minimum distance per edge:
//   right : d ≥ ( xc + ρ) / ((xR − offX)·tanH) − a + ρ
//   left  : d ≥ (−xc + ρ) / ((offX − xL)·tanH) − a + ρ
//   top   : d ≥ ( yc + ρ) / ((yT − offY)·tanV) − a + ρ
//   bottom: d ≥ (−yc + ρ) / ((offY − yB)·tanV) − a + ρ
export function needD(pool, n, F, leanR, leanU, cfg, out) { /* max over hard subjects; 2 pitch passes */ }
```

- **Pitch passes:** evaluate with `pitch(dBase)`, then again with `pitch(d₁)`; the second pass moves d < 0.05 m.
- **Horizontal lean** (symmetric axis): `leanR = 0.5 × centre of the weight-scaled R-extent of hard subjects`,
  clamped by the `herFrame` limits.
- **Vertical lean** (asymmetric axis): only when a hard subject fails the vertical band at `dBase`, a 10-step
  ternary search over `leanU ∈ [−capDown, +capUp]` minimising `needD(leanR, leanU) + 0.10·|leanU|`. `capUp` 2.5 m.
  `capDown` (D7): desktop **4.0**, tablet **3.0**, phone **2.0** when a hard subject is down-screen, else
  2.5 / 2.5 / 2.0. Boss: `capUp = capDown = 5` (spec `maxOff`). Always clamped by `herFrame` (§4.4).
- **Frame rect:** `fitRect` = SafeFrame `threat` scaled ×0.90 about its centre, bottom edge raised a further 0.04
  (on desktop this equals cam_1's ±0.80 / −0.72).
- **Hole repair:** after the solve, project each hard subject at the solved pose. If one lands in a SafeFrame hole
  (§7), raise d by 0.5 m and re-project, at most 4 times, within the caps. What is left gets an arrow (§7.4).
- **Crowd term (D8):** `goal.d = max(fitD, dBase + min(1.5, 0.25 × max(0, nEngaged − 2)))`.
- **Caps:** `goal.d ≤ min(dBase + 3, dMaxCat, rangeMax)`, with `dBase = dist × camZoom`; boss `[14, 22]` (spec).
- **Drop ladder** when the need exceeds the cap: drop soft subjects, then the ENGAGED subject farthest from her that
  holds no token, and re-solve (≤ 3 re-solves). HER, THREAT (hard), BOSS, BOSS_LANE and SELECTED are never
  dropped; d clamps at the cap and ui arrows cover the rest.
- Cost: ≤ 40 µs per solve, 20 Hz → ≤ 15 µs per frame amortised; zero allocations (pool + scratch vectors).

### 6.4 Goal hysteresis (R5)

Reject a new goal when `|Δd| < 0.35 m` **and** `|Δlean| < 0.30 m` **and** every hard subject is still inside the
92 % frame at the current pose. Hysteresis never gates punches, beats or a hard-subject add.

### 6.5 Smoothing (render rate, real dt)

```js
const out = goal.d > cur.d;
if (!out && now - lastNeedOut < 1.5) goal.d = cur.d;                 // hold 1.5 s before zooming in
cur.d = smoothDamp(cur.d, goal.d, sD, out ? 0.35 : 1.2, dt, out ? 6 : 1.5);
smoothDamp2(lean, goal.leanR, goal.leanU, sL, 0.45, dt, 5);            // the lean is its own spring on top of her
```
Measured (`cam1_framing.mjs`): out reaches 90 % in **0.75 s**; in reaches 90 % in **2.43 s** after the hold;
overshoot 0.000 m.

### 6.6 Making the blind zone cheap at the source (enemies; P2)

- **Orbit penalty** (enemies read `CAMERA.iso.framing.orbitPenalty` and `ctx.cam.groundAxes`): tokenless enemies orbiting at 1.4× their attack range add to each slot score
  `+1.5 × max(0, −(slot − her)·U − 3.0)` (metres down-screen past 3 m). Packs spread over the readable half of the
  screen. Token holders may still come from anywhere; THREAT framing covers them honestly.
- `U` comes from `ctx.cam.groundAxes(outU, outR)` (camera exposes; enemies read once per think tick).

### 6.7 *Reduce camera motion* in combat

Discrete: fit **once** at encounter start (ease 0.6 s). Zoom out again only if a new hard subject would otherwise be
hidden. Never ease in during the encounter; return once, 1.5 s after it ends. No lean, no crowd term; arrows cover
the rest.

---

## 7. SafeFrame: "on screen" means "the player can see it" (P1)

### 7.1 Inputs (new pure `src/camera/SafeFrame.js`; the module never touches the DOM)

- Viewport `innerWidth × innerHeight` and the `env(safe-area-inset-*)` values, read by ui from a hidden probe div
  once per layout and passed in.
- **Static occluder rects** from ui: `ctx.ui.screenOccluders()` → `{ version, rects: [{x, y, w, h, kind}] }` in CSS
  px, `kind ∈ hud | cluster | stick | bar | dialog | chip`. These are the **measured** rects of the real elements
  (no guessed hand shapes). ui bumps `version` on layout change, rotation, a `touchSize` / `touchLayout` edit, the
  mirror toggle and dialogue open/close. SafeFrame rebuilds **only** on a version change (steady-state cost 0).
  **[X22]** Elements with `pointer-events: none` that only tint or decorate (`#ui-vignette`, `#ui-flash`, toasts, damage
  numbers, the `?perf` overlay, world-space HP bars) are **not** occluders. HUD value changes (hearts, Valor, PERF's
  10 Hz batching) never bump `version`; only a rect change does. ART's candy restyle keeps CONTROLS §9.2 / §10.1
  geometry, so the §7.2 fixtures hold; any geometry change updates them in the same commit.
- **Live thumb hole:** while the joystick is engaged, a disc of radius `stickR + 36 px` around its base; while any
  cluster button is held, that button's rect + 36 px. Live holes affect `visible()` and arrow placement **only**;
  they never move the anchor or `core` (her position must not twitch when a thumb lands).

### 7.2 Outputs (normalised 0..1, y down)

| Field | Meaning | Used by |
|---|---|---|
| `core` | largest axis-aligned rect free of every static rect, inset 4 % (maximal-rectangle sweep on a 32×18 grid, 18×32 in portrait; < 0.05 ms, only on rebuild) | `herFrame = core ∩ inner 75 %` |
| `threat` | viewport minus safe-area, inset 2 % | `fitRect` (§6.3), arrows |
| `holes` | static + live rects, padded 12 px (`Float32Array(4 × 24)`) | `visible()` |
| `anchor` (fx, fy) | `clamp(centre(core) + bias, centre ± [0.06, 0.12])`, bias.y = +0.04 landscape, 0 portrait | §5.1 |

Default frames (unit-test fixtures; ±0.02):

| Profile | `core` x | `core` y | anchor (fx, fy) |
|---|---|---|---|
| Desktop KBM / pad | 0.06–0.94 | 0.12–0.88 | 0.50, 0.54 |
| Phone landscape, right-handed | 0.24–0.60 | 0.20–0.80 | 0.46, 0.54 |
| Phone landscape, left-handed (mirror) | 0.40–0.76 | 0.20–0.80 | 0.54, 0.54 |
| Phone portrait | 0.08–0.92 | 0.13–0.60 | 0.50, 0.40 |
| Tablet landscape | 0.18–0.70 | 0.14–0.84 | 0.47, 0.53 |

`frameOffset` / `frameOffsetPortrait` (spec §13) become derived values and are no longer read.

### 7.3 `cam.onScreen(p, margin)` = visible

```js
onScreen(p, margin = AIM.onScreenMargin) {          // world point; metres
  _v.copy(p).project(this.camera);                  // NDC, includes the view offset
  if (_v.z > 1) return false;
  const sx = (_v.x + 1) / 2, sy = (1 - _v.y) / 2;
  const mx = margin / this.groundW, my = margin / this.groundH;   // metres → normalised, cached per frame
  const f = this.safeFrame;
  return f.visible(sx, sy) && f.visible(sx - mx, sy) && f.visible(sx + mx, sy)
      && f.visible(sx, sy - my) && f.visible(sx, sy + my);
}
```
**[X13]** This is the **gameplay** visibility test. Perf code (activity tiers, mixers, culling) uses PERF §4.3's
`cam.inView` / `activityOf` (plain frustum) instead, so an enemy under the ⚔ button is still animated at full rate.
`enemies/onscreen.js` already prefers `ctx.cam.onScreen`, so a crossbow rat standing under the ⚔ button counts as
hidden and cannot open fire (the spec's 9 m `rangedNear` exception stays). On desktop the holes are only the HUD
block and the ability bar. Callers that ask per actor cache the result on the actor (`a._osFrame === cam.frameId`).

### 7.4 Threat arrows (ui `threatArrows.js`)

Arrows sit on the `threat` border, inset 10 px. If that point is inside a hole, slide along the border to the
nearest free spot (≤ 25 % of the perimeter), else stack at the nearest free corner. Max 4 (spec), 28 px on touch.
A THREAT subject's arrow pulses in the parry-ring colour. The camera exposes `cam.safeFrame` read-only.

---

## 8. Warm beats, boss camera, hand-offs

### 8.1 The four beats (P3; D18)

A beat is `{ id, lean target, Δd, Δfov, in, hold, out, cooldown }`, blended with easeInOutSine **on top of** the
solver goal through its own springs, lean ≤ 2.5 m and |Δd| ≤ 1.5 m (R8). Guards for every beat: no live THREAT
subject; mode not `cutscene` / `preset` / `meme` / `dialog`; any opposing direct input fades it out in 0.3 s;
*Reduce camera motion* off. One beat at a time; entering a shot drops it with no exit blend.

| Beat | Trigger | Lean | Δd | In / hold / out (s) | Cooldown | Non-camera twin (must exist) |
|---|---|---|---|---|---|---|
| **Peekaboo** | `kitten:reveal` | 60 % toward the kitten, ≤ 2.5 m | +0.5 | 0.6 / 1.0 / 0.8 | once per kitten | reveal toast + mew (exist); a `STAR4` sparkle burst at the kitten (existing Particles pool, X24) |
| **Cosy two-shot** | `kitten:rescued` (payload `position`, X23), no hostile within 12 m | midpoint of her and the kitten | −1.5 (never below 10 m) | 0.5 / 1.2 / 0.9 | — | hug pose + ART §8.6 rescue burst (confetti, stars, hearts, pink ring) + ART §9.3 glock arpeggio over a purr; Δfov −1.5° (FOV ≤ 12°/s), **no overshoot** |
| **Room read** | `arena:lock` when no boss intro cutscene just played | arena centre, ≤ 3 m | fit `arena.r`, ≤ +3 | 0.5 / 0.7 / 0.6 | once per arena | wall-rise fx + music sting; the first wave spawns ≥ 1.2 s after lock (world) |
| **Exhale** | `arena:clear` | back to her | +0.8, then ease to base | 0.4 / 0.6 / 1.5 | — | music falls back to explore; petal confetti via ART's `SHAPE.CONFETTI` (0 new draws) |

Any beat firing more than once a minute on average in playtests is too chatty and gets a longer cooldown.

### 8.2 Boss camera (P3)

The spec boss fit runs through the same solver with BOSS and BOSS_LANE hard and adds soft (w 0.5). Additions:

| Moment | Behaviour | Numbers |
|---|---|---|
| `boss:start` without an intro cutscene | establishing read: lean to the arena centre, fit `arenaR` | ease 0.6 s, hold 0.8 s, then the two-shot |
| Steady two-shot | solver; her in `herFrame`; she wins when both cannot fit (boss → arrow + boss bar) | d ∈ [14, 22], pitch 56° |
| Wheel Ride / charge lanes | lane end is a hard BOSS_LANE subject from wind-up start | ρ 1.0 at the lane end |
| `boss:phase` | phase breath: hold d + 1.5 m and 0.5 weight on the boss for 1.0 s | ≤ 22 m |
| Dizzy (D11) | punch −1.0 m: in 0.4 s, held while dizzy (≤ 3 s), out 0.6 s; only if every hard subject stays inside `fitRect`; off with *Reduce camera motion* | |
| `boss:defeated` | hold the frame 0.6 s, then hand to the story cutscene with the spec crane arc | |
| B2 causeway | lean caps along the causeway 5 m, across 2 m | |
| B2 P3 (`clear` 3.5 m) | no zoom-in; fog shrinks the stage, the frame stays generous | |
| Tall bosses (Brutus, Barkus, h 3.0) | spec lift 0.3 × (h − 1.6); subject y = h/2, ρ = 1.6 + 1.5 | |

### 8.3 Cutscene, dialogue and Meme Cam blends

- **Pose-space blend** `blendPoseIso(a, b, k, out)` in `pose.js`: focus, pitch and FOV eased per channel, yaw by
  shortest arc, **distance in log space** (`exp(lerp(ln d0, ln d1, k))`) so a 13 → 3.5 m crane feels even.
- **Hand-back pre-solve:** on `cutscene:end`, run the solver once on the current subjects **before** the 1.0 s
  hand-back starts, so the blend lands on the real gameplay frame and no second move follows (the CS-04 class).
- **Meme Cam:** every iso spring is frozen while in `meme` and re-seeded from the current pose (velocity 0) on exit.
- Dialogue: spec behaviour (speaker midpoint, d ×0.8, 0.5 s), through the same beat blend code; HUD stays.

---

## 9. The camera as the performance system (P0 / P1)

The camera knows exactly which ground is visible. Every distance-based budget in the game reads that instead of a
worst-case radius. This is the largest performance win in all three drafts and answers "performance must be
extraordinary" directly.

### 9.1 Footprint (`IsoRig.footprint`, once per render from the final pose; ≈ 0.1 µs, zero alloc)

```js
// Ray from the lens through NDC (x, y) to the plane y = gy (ground under the focus). Uses projectionMatrixInverse,
// so the view offset is included. Scratch vectors only.
function groundHit(cam, x, y, gy, out) {
  out.set(x, y, 0.5).unproject(cam).sub(cam.position).normalize();
  const t = (gy - cam.position.y) / out.y;            // out.y < 0 always in iso (top ray ≥ 27° below horizontal)
  return out.multiplyScalar(t).add(cam.position);
}
// corners (−1,−1) (1,−1) (1,1) (−1,1) → quad q[0..3] (XZ); plus derived numbers:
cam.footprint = { q: Float32Array(8), cx, cz, ahead, behind, halfW, halfWTop, slantMax, d, version };
cam.inFootprint(x, z, pad)   // point-in-convex-quad (4 cross products) after expanding by pad
```
`version` increments only when a **quantised** consumer value changes, so consumers can early-out on it.

### 9.2 Sun shadow fitted to the footprint (world `Env.js`)

**Owner: world** (X20; camera only publishes `cam.footprint`). This is shadow **stage 1** (dynamic map). In stage 2
(PERF §7.3) the map is cached and its box is this fit + an 8 m margin snapped to an 8 m light-space grid; it re-renders
only when the live fit leaves the cached box (≈ once per 1.5 s at a run). Replaces the fixed `SHADOW_HALF = 20`
(spec 16 / 20):

```
pts   = 4 footprint corners at gy  +  the same 4 raised by casterH (6 m; tall trees and towers cast into view)
light = sunLight.shadow.camera.matrixWorldInverse (sun direction fixed per level)
bbox  = light-space XY bounds of pts, + pad 1.5 m
halfX, halfY = ceil to 1 m; grow at once, shrink only when ≥ 2 m smaller for 1.0 s (hysteresis)
centre = bbox centre, snapped to whole texels: texel = 2·half / mapSize, per axis
on change only: shadow.camera.left/right/top/bottom = ±half; shadow.camera.updateProjectionMatrix()
```
Expected at d 13: half ≈ 10.5–12 m instead of 20 (≈ 2.8–3.6× texel density). Medium can then drop to a **1024**
map at better density than today, saving 3/4 of the shadow fill. Boss d 22: half ≈ 16 m. Low tier keeps no
shadow map (blob decals, art spec).

### 9.3 Far plane: one merged formula (camera; D21 as amended by X12, shared with PERF §8.3)

```
footFar = slantMax × 1.25 + 25                       // slantMax = farthest footprint corner from the lens
fogFar  = sqrt((d·cos p + R)² + (d·sin p)²) + 4      // R = PERF §8.3 fog radius (98 % fog) = clear + 1.978 / (ρ · topMul)
far     = clamp(ceil5(max(footFar, fogFar)), 45, 90)
far     = max(far, ceil5(dist(lens, farKeep sphere) + r)) for each world `farKeep` landmark inside the frustum side planes
```
d 13 → ≈ 55 m (fogFar 48 in the meadow); d 22 → ≈ 70 m; fallback 60 when the footprint is unavailable. Changes only
by 5 m steps, so `updateProjectionMatrix()` runs a handful of times per minute. The top screen ray is ≥ 27° below the
horizon in every iso profile, so the sky dome is drawn as the background, not as geometry. Anything past R is ≥ 98 %
fog over a fog-coloured clear, so the far cut never pops.

**Skyline check (world, before far ships):** shoot each outdoor level at 4 spine points at far 90 and at the
merged far; any landmark that disappears gets `farKeep: true` or a cheap impostor inside the far range.

### 9.4 Grass and dressing (world `Grass.js`, `Dressing.js`; X11, X12)

- Grass is PERF §8.4's **single wrapping tile** with a fixed instance count per tier, **centred on the footprint
  centre** (`cam.footprint.cx, cz`) with side `T = 1.6 · d`; a unit test proves the tile covers the footprint + 3 m
  (`foot.grassPad`) for every §11.1-3 profile and zoom. (The multi-tile "AABB meets the footprint" cull of the draft is
  not needed: one tile, one draw.)
- Dressing and small props: PERF §8.3's one 4 Hz fog-radius cull keyed to `cam.focus` + BatchedMesh per-object
  frustum culling. The per-class `maxDist` + `inFootprint(x, z, 4)` rule of the draft is retired.
- Mist ring (spec §4.2) outer radius tracks `max(ahead, halfWTop)` quantised to 1 m.

### 9.5 Actors outside the view (characters, enemies, companions; X13)

Replaced by PERF §4.3: camera computes `activityOf(actor)` once per frame from `cam.frustum` (tier 0 = bounding sphere
+ 2 m in view; 1 ≤ 30 m from focus; 2 ≤ 60 m; 3 beyond). Tier ≥ 1 skips cape verlet (sway shader), secondary motion and
per-frame `mixer.update` (tier 1 every 3rd frame with accumulated dt, tier 2 frozen), so poses stay correct when it
re-enters. AI and physics read only their own sub-rates (PERF §4.2). Characters expose `setActivity(tier)`. Re-entry
restores full rate the same frame. `cam.inFootprint` stays for ground-plane questions (shadow, grass, mist).

### 9.6 Camera's own budget (targets; gates per X15)

- `FollowCamera.render` + solver amortised: **≤ 0.08 ms p99 desktop (Iris Xe), ≤ 0.15 ms mid phone (Low)**, measured
  under PERF §14.1 (idle machine, calibration) and **report-only until PERF §14.4** sets thresholds. Occluders are
  budgeted separately (≤ 0.05 ms amortised, CONTROLS §3 capsule tests at 20 Hz, no scene raycasts).
- **Zero heap growth**: module-level scratch `Vector3`s, Float32Array pools, plain-number spring states. Measured by
  unit 11.1-10 in node and by PERF `perf:alloc` (CDP sampling: camera functions ≤ 4 KB/s).
- `updateProjectionMatrix()` only when fov, aspect, near, far or the view offset changes (dirty flag).
- **One frustum per frame** (`cam.frustum`, `cam.frameId`); `enemies/onscreen.js`, Occluders, `activityOf` and LOD
  reuse it (removes 2–3 duplicate `setFromProjectionMatrix` per frame).
- No raycasts in iso (spec: no collision); the gather reads the engaged list combat already maintains.
- Dynamic resolution never moves the frame: the anchor (`setViewOffset`) is in CSS px and PERF's controller changes
  only the pixel ratio (PERF §1.4, §5.4).

---

## 10. Comfort, zoom and settings (P4 unless noted)

### 10.1 *Reduce camera motion* (D20)

| Item | Rule |
|---|---|
| Default | first run: `settings.reduceCameraMotion = matchMedia('(prefers-reduced-motion: reduce)').matches`; follow the media query's `change` event until the user touches the setting (WCAG 2.3.3) |
| Explore | no animated lead, bias 0, anchor y **0.50** in landscape (static compensation: desktop sees ≈ 4.4 m down-screen instead of 3.2 m); portrait unchanged |
| Combat | §6.7 (discrete) |
| FOV | constant; no charge / Holy / beat FOV |
| Punches, dollies, beats, snuggle, Dizzy punch | off |
| Shake | default 0 (spec) |
| Hints, crane arcs, hand-back, rotate re-fit | 0.25 s veil cut |
| Meme Cam | descent becomes a 0.4 s veil crossfade; loop sway ×0.3 |

### 10.2 Shake

Spec §2.5 mix on desktop and pad (rotation ≤ 1.2°). **Touch: rotation ×0** (translation only; roll on a small screen
reads as nausea, not impact).

### 10.3 Zoom and pinch (ui recognises, camera applies)

- `dUser = dBase × camZoom`; zoom stored **per orientation** (`camZoom`, new `camZoomPortrait`).
- `dTarget = clamp(max(dUser, dCombatFit, dBossFit) + punches, range(orientation), dMaxCat)`.
- Pinch out always applies. Pinch in below an active fit is a **rubber band**: visible d may drop to
  `fit − 0.25 × (fit − dUser)` and springs back over 0.6 s after release; toast once `toast.cam.fitHold`
  ("The camera keeps foes in view"). The user value is saved and applies after combat.
- Recognition: two pointers on the free area, neither in the joystick zone, the second within 400 ms of the first
  (cancels the first one's pending tap / long-press); zoom after **16 px** of pointer-distance change; log scaling
  `zoom *= d0 / d1`; two-finger double-tap resets to 1.0; at a limit a 6 % elastic give + `haptic('tick')`.
  **Pinch never pans.**
- Settings: a **Camera distance** slider (0.70–1.40, the same value as pinch; motor accessibility) and **Bigger
  hero** (minCatPx 30 → 40, which caps zoom-out).

### 10.4 Desktop-only lock modes (P5)

`settings.camLockMode ∈ locked (default) | semi | free` (KBM only; pad and touch are always locked). **[X19]** It
replaces CONTROLS §2.3 / §10.7's boolean `camLock` (already in `GameState.settings`): save migrates `camLock: false` →
`'free'`, `true` → `'locked'`, then drops the key. **Y** toggles `locked` ↔ the last unlocked mode (default `free`;
`semi` once chosen in Settings), with the existing `toast.cam.locked` / `.unlocked` strings.
- `semi`: edge pan and MMB drag move a pan offset clamped to the `herFrame` limits (§4.4). It springs to 0
  (smoothTime 0.4 s) when she moves more than 2 m, takes or deals damage, or after 3 s idle.
- Edge pan speed `18 × edgePanSpeed × easeOutCubic(min(1, held / 0.35 s))`, so brushing the edge moves < 0.3 m.
- `free` = the spec's unlocked mode (leash 25 m), unchanged.

---

## 11. Acceptance (numbers via hooks; screenshots Read and judged)

### 11.1 Unit (node; `tests/unit/camera.test.js` unless noted; pure modules, `THREE.PerspectiveCamera` without a renderer)

1. `smoothDamp` / `smoothDamp2` (`tests/unit/math.test.js`, core): step response max ≤ target + 1e-6 and 95 % within
   3 × smoothTime for dt ∈ {1/240, 1/144, 1/60, 1/30, 1/20, 0.1}; frame-rate independent within 2 %; the rate cap
   holds; a 2D diagonal never exceeds the radial cap.
2. Lead: run down-screen 5.5 m/s → target 2.31 m desktop (cap 2.4), 2.0 phone; up-screen → 0.66; a 0.15 s tap → 0;
   tumble / knockback (`kind: 'other'`) → 0; a 130° reversal resets the debounce.
3. **Exhaustive core sweep:** profiles {1920×1080, 1180×820, 844×390 R and L, 390×844} × zoom {0.7, 1.0, 1.4} × 8
   lead directions at full caps × {no lean, 8 directions of full combat lean} × {aim pan max}. Project her feet and
   head (+0.8 m): **100 % inside `herFrame`**.
4. `needD` against brute force (`Vector3.project` over a d sweep in 1 cm steps): within ±0.05 m for subjects at the
   four `fitRect` edges, for 3 anchors and both pitch regimes. Golden cases from §3 (`cam1_framing.mjs` table) ±0.1 m.
5. Engage hysteresis: enters at 9.5 m, stays at 11 m, leaves at 12.6 m; the hold timer 1.5 s.
6. `applyAnchor`: a world point at the focus projects to (fx, fy) ± 0.5 px for 5 anchors.
7. SafeFrame: rebuild with the spec §9.2 cluster at touchSize 0.8 / 1.0 / 1.4 gives `core` within ±0.02 of §7.2;
   `visible()` is false at every button centre; a live thumb hole changes `visible()` but not `core` or `anchor`.
8. Cat clamp at every zoom: catPx ≥ 30 landscape, ≥ 28 portrait, ≥ 26 boss; portrait d ∈ [16, 26].
9. Footprint vs `cam_extents.mjs`: ahead / behind / halfW within ±0.05 m at the §3 cases; the shadow fit at d 13
   has half ≤ 12 m; `far` is a multiple of 5 in [45, 90].
10. Zero allocation: run 10 000 `IsoRig` + solver steps under `--expose-gc` and assert `heapUsed` growth < 64 KB.

### 11.2 Smoke (`tests/smoke/camera.mjs`; own port; GPU flags per tech.md §19.1)

Probe: a rAF recorder injected with `page.evaluate` (or `__GAME__.cam.probe()`), registered after the game loop,
records per frame `dt`, her projected feet and head, a fixed ground marker, `distance`, fov, the engaged set and its
`visible()` results. Jitter **J** = RMS over frames of `|Δv|·(1/60)` in CSS px, `v = Δs/dt`, frames with
`dt > 2 × median` excluded (reported separately as p99 dt).

| Block | Setup | Pass |
|---|---|---|
| `camera:steady` | 1920×1080 and 844×390; a straight 6 s order on the meadow road, then a stop | her J ≤ **0.35 px** desktop, ≤ **0.6 px** phone; marker J ≤ 0.5 px; no frame step > 2.5 px; stop overshoot ≤ 2 px; focus-velocity sign flips ≤ 0.5 /s per axis |
| `camera:lead-down` | desktop, run screen-down 3 s | her feet at 30–36 % from the top; visible ground down-screen ≥ 5.3 m |
| `camera:safe-frame-land` / `-port` | 844×390 and 390×844 `hasTouch`; stick runs 3 s in 8 directions | her feet and head in `herFrame` on **100 %** of frames after 0.2 s; catPx ≥ 30 / 28; portrait ground across ≥ 9 m |
| `camera:teamfight` | 6 rats in a 7 m ring (god mode) | all hard subjects inside `fitRect` within 0.6 s; d ≤ dBase + 3; after despawn d unchanged for 1.5 s, back to base ≤ 3.2 s; d trace over 10 s of milling ≤ 2 reversals |
| `camera:frame-threat` | rat_pike 6 m down-screen starts a wind-up | its chest visible within 0.8 s; d ≤ 16 m |
| `camera:threat-visibility` | meadow first pack, Crow Fields, B1 mill; scripted taps only | engaged-foe visible frames ≥ **97 %** desktop, ≥ **98 %** phone landscape, ≥ **92 %** portrait; every hidden engaged foe has an arrow that frame (100 %); **0** ranged wind-ups start while `visible() === false` beyond 9 m |
| `camera:no-hands` | 844×390 touch tutorial (spec acceptance 4) | completes with 0 pinch / wheel / camera events; yaw constant outside hints |
| `camera:beats` | reveal + rescue a meadow kitten; lock and clear an arena | kitten on screen ≤ 1.0 s after reveal; each beat ends within its in+hold+out + 0.1 s; no beat during a live THREAT |
| `camera:boss-two-shot` | B1 and B2, 20 s scripted movement | both visible or the boss arrowed; her in `herFrame` 100 % |
| `camera:pinch` | CDP two-touch pinch out / in; then in combat | d within ±3 % of the log ratio; no move / tap / tumble emitted; in-combat floor `fit − 0.25·(fit − dUser)`, back to fit ≤ 0.7 s; per-orientation value saved |
| `camera:reduce-motion` | `emulateMedia({ reducedMotion: 'reduce' })`, fresh storage | setting on; her screen std while running ≤ 1.5 px; FOV constant through a charge and a Holy; d changes ≤ 2 times per encounter; no beat fires |
| `camera:rotate` | 844×390 → 390×844 while running | back in the new `herFrame` ≤ 0.45 s; anchor (0.50, 0.40) ± 0.01 |
| `camera:footprint` | meadow, forest, town at d 13 | stage-1 shadow half ≤ 12 m (stage 2: cached box half ≤ 20 m and ⊇ the live fit); far = the §9.3 formula, a multiple of 5, ≤ 60 m; `inFootprint` matches the projected rect for 20 random points; the grass tile ⊇ footprint + 3 m |
| `camera:rates` | the traces recorded by `camera:steady`, `camera:teamfight`, `camera:beats` and `camera:reduce-motion` | every R3 cap holds frame-to-frame (abs Δd / dt, abs Δlean / dt, abs Δlead / dt, abs Δpitch / dt, abs Δfov / dt; punches ≤ 0.15 s exempt); 0 overshoot past any goal; yaw constant outside hints (R1) |
| `camera:perf` (report-only, X15) | 1920×1080 Med and 844×390 Low, B1 mill, 600 frames, PERF §14.1 protocol | report camera p99 (`performance.now` around render in `?test`); becomes a gate at PERF §14.4 with the §9.6 targets; allocation via PERF `perf:alloc` attribution (camera functions ≤ 4 KB/s), not `performance.memory` |

### 11.3 Performance before / after (world + camera; `research/next/tools/perf2_measure.mjs` style, Med desktop and Low phone)

Record a baseline **before** §9 lands (meadow start, meadow combat, forest Lantern Camp, town hub, B1). After:
shadow-pass draw calls ≤ **70 %** of baseline (stage 1; stage 2: 0 on ≥ 95 % of frames), grass triangles ≤ **35 %**
of baseline (X11 fixed counts), scene draw calls ≤ baseline,
frame p95 not worse anywhere, and the Med 1024 shadow map judged no softer than today's 2048 in side-by-side
screenshots.

### 11.4 Screenshots (Read and judged; `tests/shots/camera/`)

`{desktop, land, port, lefty}-{explore, run-down, combat, beat-cosy}.png` with the `core`, `fitRect` and footprint
drawn in a `?debug` overlay. Judge with yes/no questions (all yes to pass): (1) are her feet and head inside `core`
and clear of every HUD / thumb rect? (2) is the horizon level and the yaw the level's own (no tilt, no swing)? (3) in
`run-down`, is there ≥ 5 m of visible ground below her? (4) in `combat`, is every engaged foe on screen or arrowed?
(5) in `beat-cosy`, are her and the kitten both inside the inner 75 % frame? Then the overall read (not a gate):
drawn in a `?debug` overlay. Judge: she is clear of every HUD / thumb rect; the frame feels generous, calm and warm
(no tilted, cramped or swinging frames); camera-side threats are in view or arrowed.

---

## 12. Config (core writes; merged into `CAMERA.iso`; values binding)

```js
CAMERA.iso.distRangePortrait = [16, 26];                               // D19; landscape keeps distMin 9 / distMax 18
CAMERA.iso.follow = { rigidXZ: true, groundST: 0.18, resetJump: 4, veilJump: 8, dtMax: 0.1 };
CAMERA.iso.lead = {
  gainUp: 0.12, gainDown: 0.42, gainSide: 0.26, gainSidePortrait: 0.10, max: 2.5,
  caps: { desktop: [1.7, 0.8, 2.4], tablet: [1.4, 0.8, 2.0], phone: [1.4, 0.8, 2.0], portrait: [0.8, 1.2, 2.0] }, // [side, up, down]
  speedRamp: [1.2, 4.0], build: 0.55, release: 0.80, vmax: 4.5,
  debounce: 0.20, debounceCone: 0.873 /*50°*/, reverse: 2.094 /*120°*/, orderLook: 2.5,
  cursor: 0, cursorMax: 2.0,                                           // setting camCursorLead 0–0.15
  biasST: 1.0 };
CAMERA.iso.aimPan = { minRange: 5, gain: 0.40, dead: 3.0, in: 0.30, hold: 0.35, out: 0.6,
  cap: { desktop: 2.5, tablet: 2.0, phone: 1.6, portrait: 1.0 } };
CAMERA.iso.frame = { coreInset: 0.04, threatInset: 0.02, holePad: 12, thumbPad: 36, maxShiftX: 0.06, maxShiftY: 0.12,
  landBiasY: 0.04, herInner: 0.75, herHeadPad: 0.6, herFeetPad: 0.3, herSidePad: 0.4,
  fitScale: 0.90, fitBottomExtra: 0.04, hysteresisFrame: 0.92, anchorEase: 0.4, grid: [32, 18] };
CAMERA.iso.framing = { solver: true, hz: 20, maxSubjects: 16, ternarySteps: 10, pitchPasses: 2, holeRepair: [0.5, 4],
  engage: { in: 10, out: 12.5, hold: 1.5 }, selHard: 12, selSoft: 16,
  pad: { threat: 0.8, enemy: 0.6, boss: 1.5, lane: 1.0, her: 0.6 },
  w: { threat: 2.0, preAttend: 1.0, boss: 1.0, lane: 1.0, selected: 1.5, engaged: 1.0, add: 0.5 },
  weightIn: 0.35, weightOut: 0.5, hardMinW: 0.5,
  lean: { bias: 0.5, kappa: 0.10, capUp: 2.5, capDown: { desktop: 4.0, tablet: 3.0, phone: 2.0, portrait: 2.0 },
          capDownCalm: { desktop: 2.5, tablet: 2.5, phone: 2.0, portrait: 2.0 }, boss: 5.0, st: 0.45, vmax: 5 },
  crowd: { per: 0.25, after: 2, max: 1.5 }, zoomOut: 3,
  dist: { outST: 0.35, outVmax: 6, inST: 1.2, inVmax: 1.5, holdIn: 1.5 },
  hysteresis: { d: 0.35, lean: 0.30 }, rate: { pitchDeg: 20, fovDeg: 12 },
  orbitPenalty: { k: 1.5, free: 3.0 } };                               // enemies read this
CAMERA.iso.boss = { ...spec, herInner: 'frame', establish: { in: 0.6, hold: 0.8 }, phaseBreath: { dd: 1.5, t: 1.0 },
  dizzy: { dd: -1.0, in: 0.4, maxHold: 3, out: 0.6 }, defeatHold: 0.6 };
CAMERA.iso.beats = { maxLean: 2.5, maxDd: 1.5, cancelFade: 0.3,
  peekaboo: { frac: 0.6, lean: 2.5, dd: 0.5, t: [0.6, 1.0, 0.8] },
  cosy: { dd: -1.5, dMin: 10, dfov: -1.5, t: [0.5, 1.2, 0.9], calmR: 12 },
  roomRead: { lean: 3, ddMax: 3, t: [0.5, 0.7, 0.6] },
  exhale: { dd: 0.8, t: [0.4, 0.6, 1.5] } };
CAMERA.iso.snuggle = { after: 5, dd: -0.6, st: 1.2, back: 0.35 };
CAMERA.iso.reduce = { anchorY: 0.50, combatFitEase: 0.6 };
CAMERA.iso.touchShakeRot = 0;
CAMERA.iso.pinch = { startPx: 16, secondMs: 400, rubber: 0.25, rubberBack: 0.6, elastic: 0.06 };
CAMERA.iso.semi = { returnST: 0.4, returnMove: 2, returnIdle: 3, edgeAccel: 0.35 };
CAMERA.iso.foot = { casterH: 6, shadowPad: 1.5, shadowQuant: 1, shadowShrink: [2, 1.0],
  shadowCacheMargin: 8, shadowCacheSnap: 8,                               // X7 stage 2 (world reads)
  farMul: 1.25, farPad: 25, farQuant: 5, far: [45, 90], farFallback: 60, fogFarPad: 4,   // X12
  grassPad: 3, mistQuant: 1 };                                            // dressPad, actorPad, offscreenMixerHz retired (X12, X13)
CAMERA.iso.budget = { msDesktop: 0.08, msPhone: 0.15, heapKB: 64 };
```
Retired or changed from CONTROLS_SPEC §13: `followDamp` 12 and `followDampY` 6 (→ `follow`), `lead.vel / velMax /
damp / up` (→ `lead`), `lead.cursor` 0.15 → **0**, `combat.inner / outDamp` (→ `frame`, `framing.dist`),
`combat.biasMax` 2.5 (→ `framing.lean`), `boss.herInner 0.6` (→ `herFrame`), `frameOffset / frameOffsetPortrait`
(→ derived anchor), `shadowHalf / shadowHalfBoss` (→ footprint fit, kept as the fallback), `far` 90 (→ `foot.far`).

New settings (ui panel, save migrates, defaults): `reduceCameraMotion` (from the OS), `camCursorLead` 0,
`camLockMode 'locked'` (replaces `camLock`, X19), `camZoomPortrait` 1.0, `biggerHero` false.

New events / payloads (core `events.js`, additive): `arena:lock` gains `{ center, r }` (JSDoc; world fills it);
`kitten:rescued` gains `position` (X23; companions fill it).

---

## 13. Per-area task list (parallel implementation; ownership per GAME_DESIGN §19.2)

Phases: **P0** contracts (math, config, hooks) → **P1** rig core + SafeFrame + footprint perf → **P2** lead + combat
solver + enemy discipline → **P3** aim pan, boss, beats → **P4** comfort, pinch, settings → **P5** desktop extras.
Ports per CONTROLS_SPEC §12. Every area codes defensively against names that have not landed. `slice:meadow`,
`flow:*` and the existing `camera:*` blocks stay green at every step.

### core (`src/core/**`) — port 5301 — P0
1. `math.js`: `smoothDamp`, `smoothDamp2` exactly as §4.3, plus `smoothstep(a, b, x)` if absent. Unit test 11.1-1.
2. `config.js`: every table of §12; retire the listed keys only after camera stops reading them (keep aliases).
3. `GameState.settings` defaults (§12 settings; `reduceCameraMotion` from `matchMedia`, re-read on `change` until
   the user edits it).
4. `events.js`: `arena:lock` JSDoc `{ id, center, r }`; `kitten:rescued` JSDoc `{ kittenId, position }`.
5. `debug.js`: `__GAME__.cam.probe()` → `{ feet:[sx, sy], head, d, fov, fx, fy, lead, lean, footprint, engaged:
   [{id, visible}] }`, `__GAME__.cam.framing()` → `{ need, d, lean, subjects, dropped, beat }`; a `?debug` overlay
   toggle for core / fitRect / footprint.

### camera (`src/camera/**`) — port 5312 — P1–P5 (owner of this spec)
1. P1 `IsoRig.js`: rigid follow, ground-Y spring, composition order §4.2, `herFrame` limits + clamp §4.4,
   discontinuity reset, distance ranges per orientation (D19), `footprint()` §9.1, `groundAxes()`.
2. P1 `SafeFrame.js` §7 and `FollowCamera`: `applyAnchor` §5.1, `onScreen` = visible §7.3, `cam.safeFrame`,
   `cam.frustum` + `cam.frameId`, projection dirty flag, `cam.footprint`, `cam.inFootprint`, far from footprint §9.3.
3. P2 lead §5.2–5.4 reading `player.moveIntent`; snuggle and bias §5.6.
4. P2 `framing/Subjects.js` + `FramingSolver.js` §6 (subjects, needD, leans, hole repair, crowd, drop ladder,
   hysteresis, smoothing, reduce-motion discrete mode). Reads `combat.tokens` holders for pre-attend.
5. P3 aim pan §5.5; boss table §8.2; `beats.js` §8.1; `blendPoseIso` + hand-back pre-solve + Meme freeze §8.3.
6. P4 pinch application + rubber band §10.3; reduce-motion paths §10.1; touch shake rotation 0 §10.2.
7. P5 `camLockMode` semi / free §10.4.
8. Tests: unit 11.1-2…10, smoke blocks §11.2, screenshots §11.4.

### player (`src/player/**`) — port 5314 — P1/P2
1. `player.moveIntent { x, z, speed, kind }` per step (§5.3); `kind: 'other'` for tumble, Pounce, lunge, knockback,
   slide, conveyor and scripted motion.
2. `orders.lookAhead(dist, out)` along the live path (direct-line follower returns the segment point).
3. `player.aim.range` populated for held aimed actions (Holy wave 10, gleam 8, companion aims via companions).
4. Confirm `object3d.position` is the interpolated render pose for every frame (D1); unit or smoke check.
5. `player.groundY`: the Y of the last ground contact (heightfield or collider top), updated each step.

### physics (`src/physics/**`) — port 5311 — P1
1. No new API. (The camera reads `player.groundY`, not `heightAt`, because `heightAt` ignores decks such as the Old
   Bridge.) Physics only reviews that `player.groundY` comes from the same ground contact as collision.

### combat (`src/combat/**`) — port 5315 — P2
1. `tokens.holdersInto(kind, outArray)` (zero-alloc fill; `holders()` returns a Set, whose iteration allocates).
2. Guarantee `combat:telegraph` carries `targetsPlayer`, `activeAt`, `windup` and lane-end for `lane` shapes.

### enemies (`src/enemies/**`) — port 5316 — P2
1. Orbit penalty §6.6 (`CAMERA.iso.framing.orbitPenalty`, `ctx.cam.groundAxes`).
2. `onscreen.js`: reuse `ctx.cam.frustum` when present; keep preferring `ctx.cam.onScreen`.
3. Activity tiers §9.5 / PERF E4 for enemy animation via `cam.activityOf` (not `inFootprint`).
4. Bosses: expose `radius`, `height`, lane telegraph end points.

### companions (`src/companions/**`) — port 5317 — P2/P3
1. Activity tiers §9.5 / PERF M1 for companions, LostKitten, HubKittens and NpcActor; `kitten:rescued` payload
   `position`.
2. Aimed abilities set `player.aim.range` while held (for aim pan).

### characters (`src/characters/**`) — port 5313 — P2
1. `setActivity(tier)` on KittenView / dressed beasts (X13; replaces the draft's `setOffscreen`): tier ≥ 1 skips cape
   verlet (sway shader) and secondary motion; restore the same frame on re-entry without a pop (cape re-seeds from the
   current pose).
2. Hug pose for the Cosy two-shot (§8.1 twin).

### world (`src/world/**`) — port 5318 — P1 (shadow, grass, far) / P3
1. `Env.js` shadow fit to the footprint §9.2 (stage 1: quantise, hysteresis, texel snap; fallback fixed half), then
   PERF W10 stage 2 (cached box = fit + 8 m margin). Med 1024 screenshots (§11.3).
2. `Grass.js`: PERF W6 single tile centred on the footprint (§9.4); dressing via PERF W5's fog-radius cull.
3. Skyline audit §9.3: shots at far 90 vs footprint far on each outdoor level; tag `farKeep` or add impostors.
4. Mist ring outer radius from the footprint.
5. `arena:lock` payload `{ center, r }`; first wave ≥ 1.2 s after lock (Room read). Perf baseline + after (§11.3).

### fx (`src/fx/**`) — port 5319 — P3
1. Beat twins (X24): kitten-reveal `STAR4` burst, ART §8.6 rescue burst, arena-clear `SHAPE.CONFETTI` petals (existing
   Particles pool, 0 new draws).
2. `?debug` overlay draw for core / fitRect / footprint (lines, 1 draw).

### audio (`src/audio/**`) — port 5320 — P3
1. Beat twins: rescue = ART §9.3 glock arpeggio over a purr, room-read sting on `arena:lock`, exhale = music back to explore (existing
   director). The listener stays at `cam.focus + (0, 1.2, 0)`; it now includes the lean (ears go where eyes go).

### story (`src/story/**`) — port 5321 — P4
1. Strings: `toast.cam.fitHold`, settings labels and help (Reduce camera motion, Camera distance, Bigger hero,
   Camera lock mode, Cursor look-ahead).
2. Cutscene hand-backs: verify with the pre-solve (§8.3) that CS-04, CS-08 and CS-10 land without a second move.

### ui (`src/ui/**`) — port 5322 — P1 (occluders) / P4
1. `UI.screenOccluders()` → `{ version, rects }` from measured element rects; bump `version` per §7.1 (rect changes
   only); exclude the X22 overlay layers; safe-area probe div. Live thumb state (`stickBase`, held button rect) exposed
   read-only.
2. `threatArrows.js` on the SafeFrame border §7.4.
3. `touch.js` pinch recognition §10.3 (two-finger rules, 16 px start, double-tap reset, haptic tick).
4. Settings panel rows §12 settings; Camera distance slider; Bigger hero; lock mode (KBM only).

### save (`src/save/**`) — port 5323 — P4
1. `migrate`: add the §12 settings with defaults (schema stays v1); `camLock` → `camLockMode` (X19); validate
   `camZoomPortrait` 0.7–1.4, `camCursorLead` 0–0.15, `camLockMode` ∈ {locked, semi, free}, booleans.

---

## 14. Rejected (do not build)

- cam_1's full 12 subject classes and 10 beats; Wave glance, Helper moment, Lead the way; `camDirector` setting and
  the *Kitten difficulty* camera tweak (too much scope during the controls rework, beat fatigue, extra settings).
- Any overshoot, including cam_1's ζ 0.75 "boing" on the cosy two-shot.
- Continuous idle breathing (cam_1) and the storybook settle at level start (cam_2).
- Touch semi-lock, two-finger pan and the 4 % pinch heuristic (cam_0); pinch never pans.
- cam_0's spine-direction bias (`progressDirAt`) in this pass (new world data for a 0.8 m nudge).
- cam_1's occlusion lean-away (fades cover it; fix placements in level data).
- Pitch steering or auto-rotation in play (measured net loss; top sickness cause).
- cam_2's guessed 140 px hand quarter-disc (measured rects + thumb pad instead).
- cam_2's "Reduce motion = no lead and nothing else" (static compensation instead, §10.1).
- cam_0's uncapped 5.5 m down-screen lead on phones (per-device caps instead).
- The boss establishing shot when an intro cutscene already played.
- LoL / Wild Rift / Dota numbers as design inputs.

## 15. Open questions (owner decides; defaults apply until then)

1. **D1 rigid follow:** if `camera:steady` fails J ≤ 0.35 px because the render pose is not interpolated in some
   state (riding, conveyors), camera falls back to λ12 for that state only.
2. **Far plane:** ships only after the world skyline audit (§9.3); until then far stays 60.
3. ~~Med 1024 shadow map~~ decided (X7): Med 1024, High 2048, Low none; the §11.3 screenshot check still runs.
4. **Ground-metre zoom limits** (one rule for all aspects) are a possible later cleanup of D19; not in this pass.
