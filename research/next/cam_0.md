# cam_0: MOBA-purist auto camera (draft)

Topic: cam. Angle: how LoL, Wild Rift and Dota cameras behave, turned into exact algorithms for the iso rig in
`research/CONTROLS_SPEC.md` §2. Status: **draft amendments**. CONTROLS_SPEC stays binding. Every item below is
written as a delta (**A1…A12**) against it, with numbers, a three.js r186 recipe and the area that owns it
(GAME_DESIGN §19.2). Nothing here changes `src/`. The numbers come from
`research/next/tools/cam_extents.mjs` (pure maths, `node research/next/tools/cam_extents.mjs`).

User request: *"warm cartoonish … everyone will feel great inside … performance must be extraordinary … maximum
moba-like automatic camera control."*

---

## 0. Summary

1. **The hero stays fixed on screen and only the lead moves the world** (LoL "Fixed offset" and the Wild Rift
   default). The XZ follow is rigid on her interpolated position. All the smoothness lives in one critically damped
   lead spring. Two chained exponential lags (spec λ12 follow plus λ4 lead) give a rubber-band camera.
2. **Lead depends on direction.** At 13 m and 51° she sees 10.6 m up-screen but only **3.2 m down-screen**, which
   is 0.58 s of running toward the lens. The lead gain is therefore largest down-screen and smallest up-screen.
3. **Lead comes from intent, not raw velocity.** It uses locomotion only (no tumble, knockback or lunge) and the
   path tangent 2.5 m ahead for orders, with a 0.2 s engage debounce, so combat shuffles never wobble the frame.
4. **Wild Rift "Aim Panning":** the frame slides toward the aim only while a long-range aimed action is held
   (Holy wave 10 m, gleam 8 m). It is **off for the KBM cursor by default**, because cursor lead with click-to-move
   makes the ground drift under a still cursor.
5. **Teamfight zoom-out:** a closed-form fit distance per engaged actor (exact, O(n), no iteration over the
   frustum), with hysteresis on the engaged set. It zooms **out quickly (0.35 s) and in slowly (1.5 s hold, then
   1.2 s)**, rate-limited.
6. **LoL "per-side offset" analogue:** the 0.8 m screen-up bias points along the level spine (toward the
   adventure), not always screen-up.
7. **Wild Rift "semi-lock":** a third lock mode that lets the view pan while she stays inside the inner 70 %.
8. **Cosy beats:** an idle "snuggle" push-in and a soft arrival settle, both critically damped (no overshoot, no
   seasickness).
9. **Performance:** under 0.08 ms per frame, zero allocations, projection rebuilt only on change, one shared
   frustum per frame, texel-snapped shadow centre. A smoke test measures screen jitter (target σ < 0.35 px).

---

## 1. What the references actually do (and what we take)

| Game | Behaviour | Take / leave |
|---|---|---|
| **LoL** (PC) | Camera lock (Y toggle). Lock modes: **Fixed offset** (screen centre on the champion), **Per-side offset** (champion off centre by a moderate amount, by starting side), **Semi-locked** (camera movable while locked, until the champion would leave view) [LoL wiki *Settings*]. Edge pan, Space or F1 to centre, fixed yaw, about 55–60° pitch, narrow FOV, fixed zoom band [pitch/FOV unverified]. | Take the screen-locked hero, per-side offset (as a spine bias, A6) and semi-lock (A7). The spec already has edge pan, centre and Y lock. |
| **Wild Rift** (mobile) | Champion locked. **Aim Panning**: the camera pans toward a long-range skill's aim while you aim. **Ability Mini-cam**. **Semi-Lock Camera** (a small stick to re-centre). Camera pan sensitivity. Death and spectate panning [oneesports, upcomer]. | Take aim panning (A4) and semi-lock (A7). Skip the mini-cam: our ranges are ≤ 10 m and always on screen. |
| **Dota 2** | Free camera by default, with acceleration and smoothing. Space or F1 centres. Hold-to-follow. Fixed zoom (distance about 1134 units) [unverified]. | Take only the centring and the accelerating edge pan curve (A7). A free default camera is wrong for a cosy action game. |
| **MOBA-likes** (Pokémon UNITE, MLBB) | Locked camera. A slight forward offset toward the enemy base. Height setting. Camera nudges toward the aimed skill. | This confirms A2, A4 and A6. |

Nothing from LoL, Wild Rift or Dota uses **velocity-based lead**. That is an action-RPG import (Diablo IV,
Hades: "the camera leans where you run"), and it is right for us because she runs at 5.5–7.2 m/s, which is MOBA
champion speed × 1.5 on a much closer camera. It must be tuned against the visible extent, which no MOBA needs.

---

## 2. The numbers that drive everything (measured: `cam_extents.mjs`)

Ground visible from her feet, with the spec's 0.8 m screen-up bias and her drawn 4 % below centre:

| Case | Ahead (up-screen) | Behind (down-screen) | Half width | px/m lateral | px/m depth | her height px |
|---|---|---|---|---|---|---|
| Desktop 1080p, d 13, pitch 51.3° | 10.63 m | **3.18 m** | 8.43 m | 120.6 | 94.1 | 97 |
| Desktop 1080p, d 16 (combat +3), 55.3° | 11.41 | 4.07 | 10.24 | 98.0 | 80.6 | 78 |
| Phone 844×390, d 12, 50° | 10.32 | **2.87** | 9.53 | 47.2 | 36.2 | 38 |
| Phone 844×390, d 15 | 11.15 | 3.77 | 11.73 | 37.8 | 30.5 | 30 |
| Portrait 390×844, d 21, 58°, she at 40 % | 12.83 | 10.24 | 4.68 | 43.1 | 36.5 | 34 |

Look-ahead time at a run (5.5 m/s) with **spec lead** (0.25 s × v = 1.375 m): up 2.2 s, sideways 1.8 s, **down
0.83 s**. Down-screen is where rats and crows surprise her. Every MOBA hides this because champions move at
about 3.5 m/s on a camera twice as far away.

---

## 3. Amendments

### A1. Rigid XZ follow; one critically damped spring per offset (`camera`, `IsoRig.js`)
- **Focus = her interpolated feet (`object3d.position`, already interpolated by the loop alpha) + (0, yF, 0) +
  bias + lead + combat + aim + peek.** Her XZ is **not** filtered. Spec λ12 gives a steady lag of v/λ = 0.46 m
  (55 px at 1080p) that changes with speed and settles on every stop. On top of the λ4 lead that is two springs in
  series: the "rubbery" feel.
- Every offset (lead, combat bias, aim pan, peek, spine bias, distance) runs through **`smoothDamp`** (critically
  damped, Game Programming Gems 4 §1.10). It is exact for any dt, never overshoots, and keeps velocity continuous, so
  reversing direction swings the frame along a smooth curve, not through a kink at zero.
- **Y:** `yF = 0.6 + jump × 0.3` (bounce 0.5), applied to the **ground height under her**
  (`physics.heightAt(x, z)`), smoothed with smoothTime **0.18 s**. Steps and slopes glide. A jump lifts the frame
  only by the spec fraction.
- **Discontinuities:** if her position jumps more than **4 m** in one frame (teleport, respawn, level load,
  `snap()`), reset every spring to its target (velocity 0). Over 8 m, the jump happens under the existing 0.25 s
  veil.
- Real time: the springs use `frameDt` (clamped to 0.1) and ignore `timeScale`. Hitstop freezes the world, not the
  lens, and slow motion slows her, so the lead target shrinks on its own.

```js
// src/camera/IsoRig.js — pure, node-tested. Critically damped spring (Unity SmoothDamp form), scalar.
// st = smoothTime (s) ≈ time to cover ~63 % on a step; vmax = max rate (units/s). Returns the new value; state.v updated.
export function smoothDamp(cur, target, state, st, dt, vmax = Infinity) {
  st = Math.max(1e-4, st);
  const w = 2 / st, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let ch = cur - target; const maxCh = vmax * st; ch = Math.min(maxCh, Math.max(-maxCh, ch));
  const tgt = cur - ch, tmp = (state.v + w * ch) * dt;
  state.v = (state.v - w * tmp) * e;
  let out = tgt + (ch + tmp) * e;
  if ((target - cur > 0) === (out > target)) { out = target; state.v = (out - target) / dt; } // no overshoot
  return out;
}
// 2D variant for XZ offsets: same maths on a vector, so the rate cap is radial (no diagonal speed-up).
export function smoothDamp2(o, tx, tz, s, st, dt, vmax = Infinity) { /* o:{x,z}, s:{vx,vz}; zero alloc */
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

### A2. Direction-weighted lead (`camera` IsoRig; `player` provides intent)
Decompose the intent velocity into screen axes using the fixed yaw (screen-up `U` = the camera forward projected
to XZ and normalised, screen-right `R` = U rotated −90° about +Y):

```
vu = v·U, vr = v·R                                   // m/s, intent only (A3)
gain_up = 0.12 s, gain_down = 0.42 s, gain_side = 0.26 s
leadU = vu ≥ 0 ? vu·gain_up : vu·gain_down           // down-screen gets 3.5× the up-screen lead
leadR = vr·gain_side
cap per axis: up 0.8 m, down 2.4 m, side 1.7 m; radial cap 2.6 m
speed ramp: × smoothstep(1.2, 4.0, |v|)               // walking (2.0 m/s) leads about 20 %; runs get the full lead
lead = spring2(leadTarget, smoothTime 0.55 s building, 0.80 s when |target| < |current| (release), vmax 4.5 m/s)
```

Result at a run (5.5 m/s), desktop d13: down-screen sight **3.18 + 2.31 = 5.5 m → 1.0 s** (was 0.83 s at spec's
cap, 0.58 s with none); sideways 8.43 + 1.43 = 9.9 m → 1.8 s; up 10.6 + 0.66 = 11.3 m → 2.05 s. Running
down-screen puts her at about **33 % from the top** at 1080p (2.31 m × 94 px/m = 217 px up from 54 %), a
Wild Rift-like frame. Zoomies (7.2 m/s) hit the caps, which is intentional.
- **Portrait:** the spec says "velocity only". Use the same algorithm with `gain_side` 0.10 (half width is only
  4.7 m, so side lead hides the other side) and `gain_down` 0.20 (10 m behind is already plenty).
- Release slower than build (0.80 vs 0.55 s): when she stops, the world eases back to centre the way a cat sits
  down. This is the "soft arrival" beat.
- Spec rules kept: lead is off while the Stand or a charge is held, and off with *Reduce camera motion*. When
  turned off, the target goes to 0 and the spring releases over 0.8 s. It never snaps.

### A3. Lead source is **intent**, with a debounce (`player` exposes, `camera` reads)
- `player.moveIntent = { x, z, speed, kind }` (written each step, zero alloc), where `kind` ∈
  `idle | walk | run | order | other`. Only `walk | run | order` drive the lead. Tumble, Pounce, lunge magnetism,
  knockback, slide and conveyor motion read as `other` → lead target 0.
- **Orders (click/tap-to-move):** direction = from her toward the path point **2.5 m ahead** along the nav path
  (`player.orders.lookAhead(2.5, out)`), not the instantaneous velocity. Path corners then turn the frame early and
  smoothly, not as a lurch at each waypoint. Speed = her run speed while the order is live.
- **Debounce:** the target becomes non-zero only after **0.20 s** of continuous intent within ±50° of the current
  lead direction. A reversal over 120° resets the timer, so the lead releases first. Combat stepping (0.1–0.3 s
  taps) never moves the camera.
- **Arrival:** when an order is within `NAV.slowR` (0.8 m) of its end, the lead target eases to 0 with her speed,
  for free.

### A4. Wild Rift aim panning, not cursor lead (`camera`; `player.aim` exposes `range`)
- **Default `lead.cursor` 0.15 → 0** (setting `settings.camCursorLead` 0–0.15, default 0). Reason: under
  RMB/LMB click play, a cursor-proportional lead moves the world under a still cursor. The ground point under the
  cursor drifts by up to 2 m, hover highlights crawl, and with gain g the fixed point is lead = g·c/(1 − g) (17.6 % of
  the cursor offset at 0.15). That reads as swimming. LoL has no cursor lead for this reason.
- **Aim pan** (all devices) while an aimed action whose `player.aim.range ≥ 5 m` is held (Holy charge → holyWave
  10 m; gleam 8 m; Sage's Volley if aimed):
  `pan = dir × min(2.5, 0.40 × max(0, |aimPoint − her| − 3.0))`, smoothTime **0.30 s** in. On release it **holds
  0.35 s** (you see the wave leave), then releases over 0.6 s. Here the spec's "lead off during charge" applies to
  the *movement* lead only. The aim pan replaces it.
- Touch drag-aim and pad RS aim use the aim point. KBM uses the cursor ground point, sampled only while the action
  is held, so the swimming above is limited to a deliberate aim.

### A5. Teamfight zoom-out: exact fit, hysteresis, asymmetric speed (`camera`; `enemies` engaged flag)
**Engaged set E:** hostiles with `alerted` within **10 m** (enter) and kept until **13 m** or **2.0 s** not
alerted (exit), plus the selected target (weight 1.5) and any **wind-up aimed at her** within 16 m (weight 2: a
crossbow rat at the edge must be framed). Cap |E| at **8**, nearest first. Bosses use the spec boss fit instead.

**Focus bias (spec):** 0.3 × weighted centroid offset, cap 2.5 m. Spring smoothTime **0.6 s**, vmax 3 m/s.

**Required distance, closed form.** Camera basis: forward f (pitch p, yaw), up u, right r. Focus F. Effective
vertical half-tan t = tan(fov/2), horizontal t·aspect. Frame margin m = 0.80 (inner 80 %). The vertical view
offset o = the NDC y of the focus (−0.08 desktop, +0.20 portrait). For each actor point q = feet + (0, 0.5, 0)
padded by 1.2 m toward the screen edge it nears:

```
dq = q − F;  x = dq·r;  y = dq·u;  k = dq·f          // camera space at distance d: z = d − k
need z ≥ (|x| + pad) / (m · t · aspect)
need z ≥ (y + pad) / (t · (m − o))      if y > 0     // top edge
need z ≥ (−y + pad) / (t · (m + o))     if y < 0     // bottom edge (o<0 shrinks it: she is drawn low)
dReq(q) = max(...) + k
dFit = max(dBase, max over E of dReq),  then clamp to dBase + 3.0 (spec), [9, 18] and the cat-size clamp
```
The pitch depends on d (spec pitch curve), so evaluate twice: once with pitch(dBase), then with pitch(dFit₁). The
second pass changes d by < 0.05 m, which is enough. Cost: 2 × 8 × about 15 flops.

**Teamfight term:** also add `+0.35 m × max(0, |E| − 2)` (a crowd wants room even when it is tight), inside the
same +3 m cap. A 6-rat brawl gives +1.4 m before the fit.

**Motion:** distance spring **out: smoothTime 0.35 s, vmax 6 m/s**; **in: wait 1.5 s (spec), then smoothTime
1.2 s, vmax 1.5 m/s**. Zooming out must beat the threat. Zooming in must be unnoticed. Never auto zoom-in below the
user's base and never change yaw (spec).

### A6. LoL "per-side offset" → spine bias (`camera`; `world` adds a query)
- The spec's **0.8 m screen-up bias** becomes **0.8 m along the level's progress direction**:
  `levels.current.progressDirAt(x, z, out)` = the tangent of the smoothed spine at the nearest point, oriented
  toward the level exit, flipped when `state` says the level is done (back-tracking to the hub).
- Project it onto the screen axes and use the same per-axis caps as A2 (so a "down-screen" spine gets up to 0.8 m
  too). Spring smoothTime **1.5 s** (it must never be felt).
- Arena or boss: bias 0 (spec framings own the frame). Town hub: `level.cam.bias = 0` (no single direction).
- World cost: one `distToPolyline` variant that returns the segment index (already exists for clearance); cache per
  0.25 s.

### A7. Lock modes: locked / **semi** / free (`camera`; `ui` setting; `core` input)
`settings.camLockMode` ∈ `locked` (default, all devices), `semi` (KBM and touch), `free` (KBM; the spec's
"unlocked").
- **Semi (LoL semi-locked, Wild Rift semi-lock):** edge pan and MMB drag (touch: a two-finger drag) move a
  `pan` offset. Its length is clamped so her feet stay inside the **inner 70 %** frame (solve with the A5 formula
  run backwards: max offset per screen axis = edge distance at 70 % minus 0.6 m). Releasing input does not return
  it. It springs to 0 (smoothTime 0.4 s) when she moves more than 2 m, takes or deals damage, or after 3 s idle.
- **Edge pan curve (Dota-style acceleration):** speed = `18 × settings.edgePanSpeed × ease(min(1, held / 0.35 s))`,
  where ease is a cubic out. The first 100 ms after the cursor reaches the edge moves less than 0.3 m, so brushing
  the edge does not lurch.
- Centre (F1 or Home) and the leash: the spec is unchanged.

### A8. Cosy beats (warm, not twitchy) (`camera`)
- **Snuggle:** after **5 s** with no input, no engaged enemy and no order, ease d by **−0.6 m** and pitch by
  **−2°** over 3 s (smoothTime 1.2 s). The frame drifts slightly toward her face. Any input restores it with
  smoothTime 0.35 s. It runs before the Meme Cam descent and blends straight into it (the crane starts from the
  snuggled pose).
- **Rescue and reward framing:** on `kitten:rescued`, `companion:*join*` or a letter pickup, the focus takes
  **0.4** × (kitten − her), capped at 2 m, for 1.6 s (smoothTime 0.5 s). Both faces are in frame for the hug. It is
  skipped in combat.
- **Never overshoot** (critically damped everywhere), never roll, and no FOV changes over 3° (the spec punches
  stay). Shake rotation on touch: **×0** (translation only). Small screens make roll read as nausea, not impact.
- These match art.md: warm and soft, with the world in mist and the heroes carrying the warmth. The camera must feel
  like it is *holding* her.

### A9. Hand-offs between rig terms (`camera`)
Compose in this fixed order every frame, then clamp the total horizontal offset from her feet to
**max(3.0 m, 0.42 × visible half-height on the ground)**. Her feet must stay in the inner 70 % (A7 rule), so no
combination of terms can push her off screen:

```
F = feetXZ (rigid) + spineBias + lead (A2/A3) + aimPan (A4) + combatBias (A5) + semiPan (A7) + peek (spec) + reward (A8)
```
When combat starts, the lead target goes to 0 (spec) through its spring, not a cut. The combat bias rises on its own
spring, so the frame crossfades without a seam.

### A10. Performance contract (`camera`; `enemies/onscreen.js` and Occluders consumers)
- **Budget:** `FollowCamera.render` ≤ **0.08 ms** median on Iris Xe (measure with `performance.now()` around it in
  `?debug`). Zero allocations: every Vector3 and spring state is a module-level scratch (tech §18 "no allocations
  in update/render").
- `camera.updateProjectionMatrix()` runs **only** when fov, aspect, near/far or the view offset changed (a dirty
  flag). Distance and pitch changes are matrixWorld only, which is cheap.
- **One frustum per frame:** `cam.frustum` (a `THREE.Frustum` built once after the pose is set) plus
  `cam.frameId`. `enemies/onscreen.js` already caches its own; it should read `ctx.cam.frustum` when present.
  Occluders and LOD do the same. That removes 2–3 duplicate `setFromProjectionMatrix` calls per frame.
- **Shadow centre:** snap `cam.focus` to the shadow texel grid in light space
  (`texel = 2 × 16 m / 2048 = 1.56 cm`) before it is handed to `env`. Without the snap, the moving lead makes
  shadow edges shimmer, which looks cheap and costs nothing to fix.
- Fit and lead read only `|E| ≤ 8` actors (from the combat 10 m query the camera already makes). There is no
  raycast in iso (spec: no collision).
- Far plane 90 (spec). At d ≤ 21 the farthest visible ground is about 30 m (portrait top edge), so **far 60** is
  enough in iso. It saves depth precision and culls the skyline twice. The skyline is a world 'far' group drawn
  through fog, so check it before adopting (`camera:iso-frame` shot).

### A11. Tests (`camera` unit tests and smoke; `research/next/tools` for measuring)
Unit (`tests/unit/camera.test.js`, pure IsoRig):
1. `smoothDamp` reaches 99 % within 4.6 × st and never overshoots for dt ∈ {1/240, 1/60, 1/20, 0.1}.
2. Lead: run down-screen at 5.5 m/s → target 2.31 m; up-screen → 0.66; a 0.15 s tap → 0; tumble → 0.
3. Fit: rats at the four 80 % edges give dReq within ±0.05 m of the brute-force projection
   (`Vector3.project` across a d sweep).
4. Hysteresis: an actor at 11 m stays engaged after entering at 9.5 m and leaves at 13.1 m.
5. Composition: no combination of max terms puts her feet outside the inner 70 %.

Smoke (`camera:*`, own port):
- `camera:steady` — run a straight 6 s order on the meadow road at 1080p, sample her projected feet each frame
  after 1 s. **σ(screen px) < 0.35 px** relative to the lead-predicted position, and no frame-to-frame step over
  2.5 px. This catches interpolation or order bugs (a camera reading `pos`, not `object3d.position`) at 60/120 Hz.
- `camera:lead-down` — run south 3 s, check her feet at 30–36 % from the top and the down-screen extent ≥ 5.3 m.
- `camera:teamfight` — spawn 6 rats in a 7 m ring, check every rat inside the 80 % frame within 0.6 s and d ≤
  dBase + 3; despawn them, check d is back to base within 3.2 s with no change in the first 1.5 s.
- `camera:aim-pan` — hold the charge aimed 10 m east, check the focus shifts 2.5 ± 0.2 m east.
- Perf: `camera:cost` asserts the median `render` time ≤ 0.1 ms over 300 frames (logged, not gated, on SwiftShader).

### A12. Config additions (core writes them; merge into `CAMERA.iso`)
```js
CAMERA.iso.follow = { rigidXZ: true, groundY: 0.18, resetJump: 4, veilJump: 8 };
CAMERA.iso.lead = { gainUp: 0.12, gainDown: 0.42, gainSide: 0.26, capUp: 0.8, capDown: 2.4, capSide: 1.7, max: 2.6,
  speedRamp: [1.2, 4.0], build: 0.55, release: 0.80, vmax: 4.5, debounce: 0.20, debounceCone: 0.873 /*50°*/,
  reverse: 2.094 /*120°*/, orderLook: 2.5, cursor: 0 /* setting camCursorLead 0–0.15 */,
  portraitGainSide: 0.10, portraitGainDown: 0.20 };
CAMERA.iso.aimPan = { minRange: 5, gain: 0.40, dead: 3.0, max: 2.5, in: 0.30, hold: 0.35, out: 0.6 };
CAMERA.iso.combat = { ...spec, exitR: 13, exitT: 2.0, threatR: 16, threatWeight: 2, maxActors: 8, perActor: 0.35,
  freeActors: 2, outST: 0.35, outVmax: 6, inST: 1.2, inVmax: 1.5, biasST: 0.6, biasVmax: 3, fitPasses: 2 };
CAMERA.iso.spine = { bias: 0.8, st: 1.5, cacheT: 0.25 };
CAMERA.iso.semi = { inner: 0.70, edgeAccel: 0.35, returnST: 0.4, returnMove: 2, returnIdle: 3 };
CAMERA.iso.cozy = { snuggleAfter: 5, dd: -0.6, dPitch: -0.035, st: 1.2, back: 0.35,
  rewardFrac: 0.4, rewardMax: 2, rewardT: 1.6, rewardST: 0.5, touchShakeRot: 0 };
CAMERA.iso.clampFeet = 0.70; CAMERA.iso.shadowSnap = true; CAMERA.iso.farIso = 60; // far: verify skyline first
```
Removed or changed spec values: `followDamp` 12 (replaced by rigid XZ), `followDampY` 6 (now `follow.groundY`),
`lead.vel/velMax/damp` (replaced by A2), `lead.cursor` 0.15 → 0, `combat.outDamp` 2.5 (replaced by
`outST/inST`).

---

## 4. File and area mapping (GAME_DESIGN §19.2)

| Area | Files | Work |
|---|---|---|
| **camera** | `src/camera/IsoRig.js` (new, pure), `FollowCamera.js`, `CameraShake.js`, `MemeCam.js`, `Occluders.js` | A1–A10: smoothDamp, lead, aim pan, fit, spine bias, semi-lock, cosy beats, composition clamp, dirty projection, shared `cam.frustum`, shadow snap; touch shake rotation 0; the snuggle pose feeds the Meme descent. |
| **player** | `src/player/Player.js`, `Orders.js` | `moveIntent {x, z, speed, kind}`; `orders.lookAhead(dist, out)`; `aim.range` on `player.aim`. |
| **world** | `src/world/LevelKit.js`, `levels/*.js` | `progressDirAt(x, z, out)` from the smoothed spine (exit-oriented); `level.cam.bias` (hub 0). |
| **enemies** | `src/enemies/onscreen.js`, `Enemy.js` | Read `ctx.cam.frustum` when present; `alerted` and wind-up target fields (already there for the threat arrows; confirm). |
| **ui** | `src/ui/menus.js`, `strings` (story) | Settings: `camLockMode` (locked/semi/free), `camCursorLead` (0–15 %); toasts as in spec. |
| **core** | `src/core/config.js`, `math.js` | A12 tables; later move `smoothDamp` into `math.js` (camera ships it locally first). |
| **fx** | `src/fx/*` | None (reward framing only reads events). |

**Order:** A1 + A2 + A3 + A10 first (feel and cost, one camera PR plus the player intent field), then A5, A4, A6,
A7, and A8 last (pure polish).

---

## 5. Open questions
1. The far plane at 60 in iso (A10) depends on how the skyline group is drawn. World should confirm.
2. Is semi-lock on touch worth a two-finger drag that conflicts with pinch? Proposal: a two-finger drag with a
   pinch scale change < 4 % = pan; otherwise zoom.
3. The LoL pitch and FOV and the Dota distance figures above are marked unverified. They are only context; the rig
   numbers come from our own extents.

Sources: [LoL wiki: Settings (camera lock modes)](https://wiki.leagueoflegends.com/en-us/Settings),
[loltheory: camera lock](https://blog.loltheory.gg/how-to-unlock-camera-lol/),
[ONE Esports: Wild Rift tutorial tips (pan sensitivity, aim)](https://www.oneesports.gg/wild-rift/5-key-things-the-wild-rift-tutorial-doesnt-tell-you),
[Upcomer: Wild Rift settings (Aim Panning, Ability Mini-cam, Semi-Lock)](https://upcomer.com/what-are-the-best-settings-in-league-of-legends-wild-rift),
Game Programming Gems 4 §1.10 "Critically Damped Ease-In/Ease-Out Smoothing" (smoothDamp).
