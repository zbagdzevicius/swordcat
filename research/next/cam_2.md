# cam_2: mobile-first ergonomics for the auto camera

Status: DESIGN DRAFT (2026-10-11). Topic: cam. Angle: thumbs, HUD, orientation, lead, reduced motion, pinch, and the
tests that prove "you never need to touch the camera". This builds on `research/CONTROLS_SPEC.md` §2, §9 and §13 and
does not replace them. Where this draft changes a number there, it says so, and the lead designer decides.

User request: *warm, cartoonish, "everyone feels great inside"; extraordinary performance; maximum MOBA-like
automatic camera.*

---

## 0. Thesis (five rules)

1. **One `SafeFrame`, not screen percentages.** Every framing rule (her position, the combat fit, the boss fit,
   "on screen" for enemies, threat arrows) uses one rectangle set: the viewport minus the safe-area insets, the HUD,
   the touch cluster and the thumb that is down. The spec's "inner 80 % of the frame" counts a crossbow rat hidden
   under the ⚔ button as on screen. That is the main mobile bug in the current spec.
2. **Frame with `setViewOffset` in both axes.** Portrait moves her up, landscape touch moves her a little left
   (right-handed cluster; the left-handed mirror flips it), and desktop moves her down slightly. The perspective
   doesn't change, so you get no fisheye and pay no performance cost.
3. **On touch, lead with intent, not velocity.** The stick vector exists about 0.15 s before velocity does. The lead
   caps are asymmetric per screen axis, because each orientation has a different amount of clear ground above, below
   and beside her.
4. **The camera never needs a hand.** Pinch is an optional comfort control. Auto framing always wins over a pinch in
   during combat, using a rubber band. Every assertion in §8 runs with zero camera input.
5. **Gentle motion is part of the art direction.** The camera uses critically damped springs, sine eases, no
   whip-pans, no roll, and no FOV pumping when *Reduce camera motion* is on. A warm, storybook-diorama feel is
   mostly about how the camera moves, not only about colour.

---

## 1. Device profiles (reference numbers; all derived from spec §2.1 values)

| Profile | Viewport (CSS px) | vFOV | d (zoom 1.0) | Ground across focus | m / px at focus (perp) | Ground m / px (screen-y, ÷ sin pitch) | Cat px (0.8 m) |
|---|---|---|---|---|---|---|---|
| Desktop | 1920×1080 | 38° | 13.0 m | 15.9 m | 0.0083 | 0.0106 (51.3°) | 96 |
| Tablet (landscape) | 1180×820 | 38° | 13.0 m | 12.9 m | 0.0109 | 0.0140 | 73 |
| Phone landscape | 844×390 | 38° | 12.0 m | 17.9 m | 0.0212 | 0.0277 (50°) | 38 |
| Phone portrait | 390×844 | 50° | 20.9 m (width fit 9 m) | 9.05 m | 0.0232 | 0.0274 (58°) | 34 |

Cat-size clamp `dMax` (spec formula): phone landscape 15.1 m (boss 17.4), **phone portrait 25.9 m** (minCatPx 28).

> **Spec conflict #1 (must fix in config):** §2.1 clamps d to **[9, 18] m**, but the portrait width fit needs
> **20.9 m**. In portrait, the [9, 18] clamp would cut the ground width to 7.8 m and break the "≥ 9 m across" rule.
> Proposal: `CAMERA.iso.distRangePortrait = [16, 26]`, and the cat-size clamp still applies on top. As a better
> long-term option, express zoom limits in **ground metres across the safe frame** (`[7, 16] m`) so one rule works
> for every aspect ratio.

---

## 2. SafeFrame (new pure module `src/camera/SafeFrame.js`, owner: camera)

### 2.1 Inputs
- The viewport (`innerWidth`, `innerHeight`) and `env(safe-area-inset-*)`. Read the insets once per layout from a
  hidden probe div that ui already places, then pass them in. The module itself never touches the DOM.
- **Occluder rects** from ui via a direct service call (GAME_DESIGN §19.3 style). `ctx.ui.screenOccluders()` returns
  `{ version, rects: [{x,y,w,h,kind}] }` in CSS px, with `kind` ∈ `hud | cluster | stick | bar | dialog | chip`.
  ui bumps `version` on layout change, rotation, a `touchSize` or `touchLayout` edit, the mirror toggle, or
  dialogue open/close. The camera recomputes only when `version` changes, so the steady-state cost is zero.
- **The live thumb.** While the joystick is engaged, its base disc gets radius `stickR + 36 px` (the thumb pad and
  knuckle), plus a quarter-disc of radius 140 px down-left of the base (the hand). The cluster gets the same
  hand quarter-disc down-right of ⚔ while any cluster button is held.

### 2.2 Outputs (all in normalised viewport coordinates 0..1, y down)
| Field | Meaning | Use |
|---|---|---|
| `core` | The largest axis-aligned rect free of every occluder, inset 4 %. | **She must always be inside it** (her feet and head projected). |
| `threat` | The viewport inset 2 % (plus safe-area). Visibility tests also subtract the occluder `holes`. | Combat fit, boss fit, `onScreen`, threat-arrow placement |
| `holes` | The occluder rects plus 12 px padding | `visible(sx, sy)` = inside `threat` and not in any hole |
| `anchor` | Where the focus sits: (fx, fy) | `setViewOffset` (§3) |

Largest empty rect: use the classic maximal-rectangle sweep over a coarse 32×18 grid (landscape) or 18×32 grid
(portrait). It takes under 0.05 ms and runs only on a `version` change.

### 2.3 Default frames (computed from spec §9 geometry; also used as unit-test fixtures)
| Profile | `core` x | `core` y | anchor (fx, fy) | Note |
|---|---|---|---|---|
| Desktop KBM / pad | 0.06–0.94 | 0.12–0.88 | 0.50, **0.54** | Spec's 4 % low. The ability bar takes the bottom 8 %. |
| Phone landscape, right-handed | **0.24–0.60** | 0.20–0.80 | **0.46**, 0.54 | Joystick thumb on the left 24 %, cluster from x 0.56; the free column sits left of centre |
| Phone landscape, left-handed | 0.40–0.76 | 0.20–0.80 | **0.54**, 0.54 | Mirrored |
| Phone portrait | 0.08–0.92 | **0.13–0.60** | 0.50, **0.40** | Condensed HUD 12 %; thumbs in the bottom 38 % (spec's 40 %) |
| Tablet landscape | 0.18–0.70 | 0.14–0.84 | 0.47, 0.53 | Cluster ×1.15 but a bigger screen |

Rule: `anchor = clamp(centre(core) + bias, centre ± [0.06, 0.12])`, where `bias.y = +0.04` in landscape (she sits
low so more of the path above shows) and `0` in portrait. **New config:** `CAMERA.iso.frame = { maxShiftX: 0.06,
maxShiftY: 0.12, landBiasY: 0.04, coreInset: 0.04, threatInset: 0.02, holePad: 12, thumbPad: 36, handR: 140 }`.
This replaces `frameOffset` / `frameOffsetPortrait`, which become derived values.

### 2.4 Code (three r186)
```js
// src/camera/SafeFrame.js — pure, node-testable, zero allocation after construction
export class SafeFrame {
  constructor() { this.core = { x0: 0, y0: 0, x1: 1, y1: 1 }; this.threat = { ...this.core };
    this.holes = new Float32Array(4 * 24); this.nHoles = 0; this.ax = 0.5; this.ay = 0.5; this.version = -1; }
  /** rects in CSS px; vw/vh CSS px; insets {t,r,b,l} px. Called only when occluders.version changes. */
  rebuild(vw, vh, insets, rects, cfg, portrait) { /* fill holes (normalised, padded), maximal-rect sweep → core,
    inset; threat = viewport ∩ insets − threatInset; anchor per §2.3 */ }
  /** sx, sy normalised (0..1, y down) */
  visible(sx, sy) {
    const t = this.threat; if (sx < t.x0 || sx > t.x1 || sy < t.y0 || sy > t.y1) return false;
    const h = this.holes;
    for (let i = 0; i < this.nHoles; i++) { const o = i * 4;
      if (sx > h[o] && sx < h[o + 2] && sy > h[o + 1] && sy < h[o + 3]) return false; }
    return true;
  }
  inCore(sx, sy) { const c = this.core; return sx >= c.x0 && sx <= c.x1 && sy >= c.y0 && sy <= c.y1; }
}
```

---

## 3. Framing with `setViewOffset` (both axes)

```js
// FollowCamera (camera area). fx, fy = where the focus appears (0.5, 0.5 = centre)
const _vo = { x: NaN, y: NaN };
function applyAnchor(cam, vw, vh, fx, fy) {
  const ox = Math.round((0.5 - fx) * vw), oy = Math.round((0.5 - fy) * vh);   // integer px: no sub-pixel shimmer
  if (ox === _vo.x && oy === _vo.y) return;                                   // avoid projection churn
  _vo.x = ox; _vo.y = oy;
  cam.setViewOffset(vw, vh, ox, oy, vw, vh);   // calls updateProjectionMatrix(); frustum culling follows for free
}
```
- Check the sign: the full-image centre appears at `(vw/2 − ox, vh/2 − oy)`. For `fy = 0.40` in portrait that gives
  `oy = +0.10·vh`, so she sits at 40 % from the top. ✓
- When the anchor changes (rotation, mirror toggle, layout edit), ease it over **0.4 s** easeInOutSine, the same
  timing as the spec re-fit. Apply it in integer pixels per frame. A change of less than 1 px is a no-op.
- `onScreen`, `worldToScreen` and picking already read `projectionMatrix`, so they stay correct. The frustum check in
  `enemies/onscreen.js` uses the same matrix.
- `clearViewOffset()` runs for `preset` rails, cutscenes and `?cam=classic`. Presets are authored centred, so the
  crane arc must also tween the anchor to 0.5, 0.5 inside its blend.

---

## 4. Lead (where she is going stays in view)

### 4.1 Sources (highest priority first)
| Device / state | Lead source | Why |
|---|---|---|
| Stand or charge held, combat framing, *Reduce motion* | none (spec) | Stability while timing a parry |
| Touch joystick engaged | **stick vector** (screen space, since yaw is fixed: stick-right is screen-right) | Starts about 0.15 s before velocity does. The thumb is the intent. |
| Path order (tap, RMB, long-press follow) | direction to the path point **0.6 s ahead**, × speed | Shows corners before she reaches them |
| KBM / pad direct | spec: velocity × 0.25 s + cursor 15 % | Unchanged |

### 4.2 Per-axis asymmetric caps (metres on the ground, in screen axes; new config `CAMERA.iso.leadCaps`)
| Profile | right/left | screen-up (far) | screen-down (near) | Check: her worst position stays in `core` |
|---|---|---|---|---|
| Desktop | 1.6 | 1.6 | 1.6 | spec total 2.5 m cap kept |
| Phone landscape | **1.4** | **1.6** | **1.4** | 1.4 m = 66 px = 7.8 % → fx 0.46 ± 0.078 ∈ [0.24, 0.60] ✓; up 1.6 m = 58 px = 14.8 % → fy 0.69 ≤ 0.80 ✓ |
| Phone portrait | **0.8** | **1.2** | **2.0** | x: 0.8 m = 8.8 % ✓; down 2.0 m = 73 px = 8.6 % → fy 0.31 ≥ 0.13 ✓. The clear ground ahead when walking toward the thumbs grows from 4.6 m to 6.7 m. |

Portrait gets its biggest lead *toward the thumbs* because that is where the least ground shows: 22 % of the height,
in near-ground pixels that each cover fewer metres.

### 4.3 Spring (critically damped SmoothDamp, per axis; no overshoot, continuous velocity)
```js
// IsoRig.js (pure). state = { v: 0 }. Game Programming Gems 4 / Unity SmoothDamp form.
export function smoothDamp(cur, target, state, smoothTime, dt) {
  const omega = 2 / smoothTime, x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target, temp = (state.v + omega * change) * dt;
  state.v = (state.v - omega * temp) * e;
  return target + (change + temp) * e;
}
// touch-stick lead target (screen axes r = right, u = up), stick s from Input (|s| ≤ 1)
const len = Math.hypot(s.x, s.y), m = Math.max(0, (len - TOUCH.stickDead) / (1 - TOUCH.stickDead));
const k = m * m * (3 - 2 * m);                              // smoothstep: thumb wobble near centre ≈ no camera motion
const tr = len > 1e-4 ? (s.x / len) * k * caps.side : 0;
const tu = len > 1e-4 ? (s.y / len) * k * (s.y > 0 ? caps.up : caps.down) : 0;
const st = k === 0 ? LEAD.release /*0.55 s*/ : (tr * lead.r + tu * lead.u < 0 ? LEAD.reverse /*0.45*/ : LEAD.build /*0.30*/);
lead.r = smoothDamp(lead.r, tr, lead.vr, st, frameDt);
lead.u = smoothDamp(lead.u, tu, lead.vu, st, frameDt);
// world offset = R * lead.r + U * lead.u, where R and U are the ground axes of the camera, cached when yaw changes
```
- These replace the spec's `damp λ 4` for lead only. The exponential stays for focus follow (λ 12), which matches
  her interpolated pose; the code already runs in `render()` with the interpolated position.
- Stick latch (spec §2.2) is unchanged. Lead reads the latched screen direction, so a yaw-hint blend doesn't swing it.
- Run lead in **render time** (`frameDt`), not in the hitstop-scaled sim. During hitstop or Purrfect slow motion, the
  lead holds (`frameDt × 0`) and doesn't drift.

---

## 5. Combat and boss framing on touch

- **Change spec §2.4 "inner 80 % of the frame" to `safeFrame.visible()` with a 1.2 m margin.** Fit loop: project each
  engaged actor's feet and its chest + 1.2 m world margin (4 points per actor). Increase d by λ 2.5 steps until all of
  them pass, capped by `+3 m` and the cat clamp.
- **Portrait is width-limited, so bias before zooming.** In portrait a lateral foe 6 m away would need d ≈ 36 m to
  fit, which breaks the cat clamp. So in portrait the combat bias goes **lateral first**:
  `biasMax.x = min(2.5, halfCoreWidth_m − 1.0)` = 2.5 m (the half-width of `core` is 3.8 m), *then* zoom out to at
  most `dMax` 25.9 m. Expected cover: a 10 m engage ring is about 92 % visible in portrait and 98 % in landscape (§8
  thresholds).
- **Fallback for a foe that doesn't fit:** it gets an edge arrow (§6). Ranged foes can't start a wind-up while not
  visible (§7).
- Boss fit (spec): her 60 % / boss 85 % become `core` / `visible()`. B1 and B2 in portrait: she wins and the boss
  shows as an arrow plus the boss bar. Accept this. Bosses stay readable through telegraph wedges, which already
  draw on the ground near her.

---

## 6. Threat arrows on touch (ui `threatArrows.js`)
The spec places arrows at the screen edge. On a phone, the bottom edge is under the thumbs.
- Place each arrow on the border of `threat` (inset 10 px). If its position falls inside a hole, slide it along the
  border to the nearest free spot (no more than 25 % of the perimeter away; otherwise stack it at the closest free
  corner). The camera exposes `cam.safeFrame` (read-only).
- At most 4 arrows (spec). Size 28 px on touch. A wind-up foe's arrow pulses and gets the parry-ring colour.

---

## 7. "On screen" for gameplay = visible to the player
`enemies/onscreen.js` already prefers `ctx.cam.onScreen(p, margin)`. The camera should implement it as:
```js
onScreen(p, margin = 0.5) {               // world point, metres
  _v.copy(p).project(this.camera);        // NDC -1..1 (includes the view offset)
  if (_v.z > 1) return false;
  const sx = (_v.x + 1) / 2, sy = (1 - _v.y) / 2;
  const mx = margin / this.groundW, my = margin / this.groundH;    // metres → normalised (cached per frame)
  const f = this.safeFrame;                                        // margin = the point must clear holes by ~margin too
  return f.visible(sx, sy) && f.visible(sx - mx, sy) && f.visible(sx + mx, sy)
      && f.visible(sx, sy - my) && f.visible(sx, sy + my);
}
```
Result: a crossbow rat standing under the ⚔ button doesn't count as visible, so it can't open fire. No enemies code
change is needed, because the enemy area already calls this. On KBM, the holes are the HUD block and the ability
bar only.

---

## 8. Never needing a manual camera: the guarantees
| # | Guarantee | Mechanism |
|---|---|---|
| G1 | She is always inside `core` (outside cutscenes and meme, and outside the 0.45 s rotate re-fit) | anchor + lead caps + combat bias cap (proved by the §13.1 unit sweep) |
| G2 | A tapped destination is visible at the moment of the tap | trivially true; the path lead keeps the next corner visible |
| G3 | Every engaged foe is visible **or** has an arrow | §5 fit plus §6 |
| G4 | No ranged attack starts from an invisible foe | §7 |
| G5 | Interactables within 3 m are visible | they are inside `core` ± 3 m by the G1 geometry (portrait half-width 3.8 m ✓) |
| G6 | She is never hidden by scenery | spec §3 occluder fade + x-ray (unchanged) |
| G7 | Rotating the phone never loses her | re-fit 0.4 s; the safe frame rebuilds on the new `version` |

Desktop edge pan, MMB and peek stay as power tools (spec §2.3). Touch gets **no** pan gesture; that is the
Wild Rift model, with the camera locked to the hero.

---

## 9. Pinch and zoom coexisting with auto framing
- **Model:** `dUser = dBase × settings.camZoom`. **Store it per orientation** (`camZoom` and the new
  `camZoomPortrait`) because their base distances differ (12 m vs 21 m).
  `dTarget = clamp(max(dUser, dCombatFit, dBossFit) + punches, range, dMaxCat)`.
- **Pinch out** always takes effect. **Pinch in** below the active combat or boss fit gives a **rubber band**: the
  visible d may drop to `fit − 0.25·(fit − dUser)`, then springs back over 0.6 s after release. A one-time toast
  explains it (`toast.cam.fitHold`: "The camera keeps foes in view"). The user's value is still saved and applies
  once combat ends.
- **Recognition (touch.js / Input):** two pointers, both in the free area, neither inside the joystick zone. The
  second pointer must land within 400 ms of the first or while the first is still down. That cancels the first
  pointer's pending tap and long-press. Zoom applies only after **16 px** of change in distance between the pointers
  (hysteresis), with log scaling (`zoom *= d0 / d1`) and λ 10. A two-finger double-tap resets to 1.0. At a limit:
  a 6 % elastic overshoot plus `input.haptic('tick')`.
- **Pinch never pans.** The midpoint is ignored and the focus stays on her.
- **A settings slider "Camera distance"** (0.70–1.40) gives the same control without a two-finger gesture (motor
  accessibility). A second option, **"Bigger hero"**, raises minCatPx from 30 to 40 (low vision), which caps zoom
  out.

---

## 10. Accessibility and reduced motion
| Item | Rule |
|---|---|
| Default | On first run, `settings.reduceCameraMotion = matchMedia('(prefers-reduced-motion: reduce)').matches`. Follow the media query's `change` event only until the user touches the setting. (WCAG 2.3.3 "Animation from Interactions".) |
| Follow | No lead. The focus uses `smoothDamp` 0.12 s, which is near-rigid with no overshoot. The camera never moves while she stands still. |
| Combat zoom | **Discrete.** At the start of an encounter, fit once (0.6 s ease). Zoom out again only if a new foe would otherwise be invisible. **Never ease back in during an encounter**; return once, 1.5 s after it ends. |
| FOV | Constant: no charge or Holy dFOV. FOV change is the strongest vection trigger. |
| Punches / dollies | Off: parry punch, Purrfect, Golden Hour dolly, Holy |
| Shake | Default 0 (spec) |
| Yaw hints, crane arcs, hand-back | 0.25 s veil cut, no arcs |
| Meme Cam | The Descent becomes a 0.4 s veil crossfade straight to the meme pose. The 3.8 s sway becomes amplitude ×0.3. |
| Rotate re-fit | Instant under the veil |
| Never anywhere | Camera roll (iso already has none); continuous zoom oscillation; a camera speed above 30 m/s outside a veil |
| Visual twins | Every camera-conveyed cue (punch = "you parried") already has an fx or audio twin (GAME_DESIGN §14.4) |
| One-handed | The left-handed mirror flips `anchor.x`. Tap-to-move plus the auto camera needs only one thumb. |

---

## 11. Performance budget for the camera system (mid phone, Low tier)
- Camera update **≤ 0.15 ms/frame**. Zero allocations in `update` and `render`: preallocated `Vector3`s, the
  Float32Array holes, and the springs as plain numbers.
- Per frame: project at most 12 actors × 4 points for the fit and visibility checks (about 50 `Vector3.project`
  calls, under 0.02 ms). The safe frame rebuilds only on a `version` change. `setViewOffset` runs only on an
  integer-pixel change.
- `onScreen` results are cached per (actor, frame); enemies already cache the frustum per step.
- Smaller frustum benefits come from spec §2.1 (far 90, focus-centred shadows). The shifted anchor doesn't enlarge
  the frustum.

---

## 12. Warm-cartoon feel (camera's part)
- Eases are sine or critically damped only. No linear snaps, no whip pans in gameplay, and shake is translation-led
  (spec §2.5) with a rotation cap of 1.2°.
- On level start (not in reduce mode), a **1.0 s "storybook settle"**: start at d + 2 m and pitch + 4°, then ease
  into the iso pose while the title card fades. Any input skips it.
- Don't add an idle camera bob or breathing motion, because it makes some players queasy. Character motion carries
  the life.

---

## 13. Test plan (measurable assertions)

### 13.1 Unit (node, `tests/unit/camera.test.js`; pure `SafeFrame`, `IsoRig`, `THREE.PerspectiveCamera` without a renderer)
1. **Exhaustive core sweep:** profiles {1920×1080, 1180×820, 844×390 R and L, 390×844} × zoom {0.7, 1.0, 1.4}
   (portrait range per §1) × 8 lead directions at full caps × {no bias, 8 directions of full combat bias}. Project
   her feet and her head (+0.8 m). **Assert both lie inside `core` in 100 % of cases.**
2. `applyAnchor` sign: a world point at the focus projects to (fx, fy) ± 0.5 px for 5 anchors.
3. `smoothDamp`: a step response shows **no overshoot** (max ≤ target + 1e-6) and reaches 95 % within
   `3 × smoothTime` at dt ∈ {1/30, 1/60, 1/144}. The result is frame-rate independent within 2 %.
4. `SafeFrame.rebuild` with the spec §9.2 cluster at touchSize 0.8 / 1.0 / 1.4 gives `core` within ±0.02 of the
   §2.3 table. `visible()` returns false at each button centre.
5. The cat-size clamp holds at every zoom: catPx ≥ 30 landscape, ≥ 28 portrait, ≥ 26 boss.

### 13.2 Smoke (Playwright, `tests/smoke/camera.mjs`; camera-owned; GPU flags per tech.md §19.1)
Probe: the test injects a rAF recorder with `page.evaluate`. It is registered after the game's own loop, so it reads
the poses after render. Each frame it records `dt`, her projected feet and head (normalised), the projection of a
fixed ground marker, `cam.distance`, the fov, the engaged set and its visibility. No core change is required. A
`__GAME__.camProbe` in debug.js would be a tidier option.

| Block | Setup | Assertions |
|---|---|---|
| `camera:safe-frame-land` | 844×390, `hasTouch`, meadow; stick run 3 s in each of 8 directions (CDP `Input.dispatchTouchEvent`) | She is in `core` on **100 %** of frames after 0.2 s; catPx ≥ 30 |
| `camera:safe-frame-port` | 390×844, same | 100 % in `core`; catPx ≥ 28; ground across ≥ 9 m |
| `camera:jitter` | 1920×1080 and 844×390; straight 4 s run, steady state after 0.8 s; then a stop | **Jitter J** = RMS over frames of `|Δv|·(1/60)` in CSS px, with `v = Δs/dt`, frames with `dt > 2×median` excluded. Her screen position: **J ≤ 0.35 px** (desktop), **≤ 0.6 px** (phone). Static marker: **J ≤ 0.5 px**. **Oscillation:** sign flips of focus velocity per screen axis **≤ 0.5 /s**. **Overshoot** on stop **≤ 2 px**. Hitches are reported separately as `p99 dt`. |
| `camera:threat-visibility` | meadow first rat pack, Crow Fields, B1 mill; `god`; scripted taps only | Visible engaged-foe frames **≥ 98 %** landscape, **≥ 92 %** portrait, **≥ 97 %** desktop. Every invisible engaged foe has an arrow on the same frame (100 %). **0** ranged wind-ups start while invisible (count `combat:telegraph` with `visible() === false`). |
| `camera:no-hands` | 844×390 touch tutorial (spec acceptance 4) | Completes with **0** pinch, wheel or camera input events, and G1/G3 hold throughout |
| `camera:pinch` | 844×390; CDP two-touch pinch out / in; then during combat | Out: d rises, within ±3 % of the expected log ratio. **No** move order, tap, select or tumble is emitted. In-combat pinch-in: d never goes below `fit − 0.25·(fit − dUser)`, and returns to fit within 0.7 s. Two-finger double tap → zoom 1.0. Value persisted per orientation. |
| `camera:reduce-motion` | `page.emulateMedia({ reducedMotion: 'reduce' })`, fresh storage | The setting defaults to on. Running: her screen position std ≤ 1.5 px (no lead). FOV is constant over a charge and a Holy. In an encounter, `distance` changes **≤ 2 times**. Shake output 0. A hint change is a veil cut (no intermediate yaw frames). |
| `camera:rotate` | Swap 844×390 → 390×844 while running | She is back in the new `core` within **0.45 s**. No pointer stays stuck. Anchor (0.50, 0.40) ± 0.01. |
| `camera:lefty` | Mirror on | anchor x = 0.54 ± 0.01; the threat arrows avoid the mirrored cluster |
| `camera:perf` | 844×390 Low tier, B1 mill | Camera `update + render` ≤ 0.15 ms mean (via `performance.now` around the camera system in the test build). 0 heap growth over 600 frames (`performance.memory` delta < 64 KB, Chromium). |

Screenshots: `tests/shots/camera/{land,port,lefty}-{explore,combat}.png`, with the `core` rect overlaid in a debug
draw. A person reads and judges them (spec §16 style).

---

## 14. File and area mapping (GAME_DESIGN §19.2)
| Area | Files | Work |
|---|---|---|
| **camera** | new `src/camera/SafeFrame.js`; `IsoRig.js` (spec P1, add `smoothDamp`, lead caps, safe-frame fit, portrait lateral bias); `FollowCamera.js` (`applyAnchor`, `onScreen`/`safeFrame`, pinch rubber band, reduce-motion path, storybook settle); `CutsceneCamera.js` / `MemeCam.js` (anchor tween to centre, reduce-motion veils) | §2–§5, §7, §9, §10, §12 |
| **ui** | `touchLayout.js` (pure `occluderRects(layout, vw, vh, insets, mirror, portrait)`), `UI.js` (`screenOccluders()` + `version`), `threatArrows.js` (§6), `touch.js` (pinch recognition rules §9, thumb-down state), settings panel (camZoomPortrait, Bigger hero, Camera distance slider) | §2.1, §6, §9 |
| **core** | `config.js`: `CAMERA.iso.frame`, `leadCaps`, `distRangePortrait`, lead smooth times. `Input.js`: expose `move` in screen space for touch plus pinch delta. Settings defaults from `prefers-reduced-motion`. Optional `debug.js` `camProbe`. | §1, §4, §10 |
| **enemies** | none: `onscreen.js` already defers to `cam.onScreen` | §7 |
| **world** | none; zone hints must be checked in portrait (a `dist` hint is a multiplier, not metres) | — |
| **tests** | `tests/unit/camera.test.js`, `tests/smoke/camera.mjs` blocks of §13 | §13 |

## 15. Spec deltas for the lead designer
1. Portrait distance range: [9, 18] → **[16, 26]**, or ranges in ground metres (§1).
2. "Inner 80 % of the frame" → `SafeFrame.visible` (§5), and the boss 60 % / 85 % → `core` / `visible`.
3. `frameOffset` → derived anchor in **x and y**; landscape touch x 0.46 (lefty 0.54) (§2.3).
4. Touch lead = stick intent with asymmetric caps and SmoothDamp, instead of velocity with λ 4 (§4).
5. `cam.onScreen` means visible to the thumb-holding player, not inside the frustum (§7).
6. Threat arrows on the safe border, not the raw screen edge (§6).
7. Pinch precedence, per-orientation zoom, and a Camera distance slider (§9).
8. Reduce motion defaults from the OS. Discrete combat zoom, constant FOV, and the Meme Cam crossfade (§10).
