# cam_1: the cinematic auto-camera (the "Framing Director")

Topic **cam**, angle: a cinematic action auto-camera in the style of Hades, Diablo IV and Ori. The camera frames the
player, threats and objectives with weighted bounding framing. It covers boss arenas, auto-zoom from enemy count and
spread, attention points, occlusion-aware positioning, comfort rules and the cutscene and Meme Cam blends.
Status: **design draft**. It builds *on top of* `research/CONTROLS_SPEC.md` §2 (binding). Anything here that changes
a §2 or §13 number is tagged **[AMEND-n]** and needs lead sign-off. Everything else is additive and lives in the
`camera` area.

Prototype and measurements (pure node, no game code touched):
- `research/next/tools/cam1_framing.mjs`: the solver, scenarios, a micro-benchmark and spring step responses.
- `research/next/tools/cam1_variants.mjs`: sensitivity to the safe frame and the lean cap.
- `research/next/tools/cam1_pitch.mjs`: what a pitch bump buys.

---

## 0. The design in one paragraph

The iso rig from CONTROLS_SPEC stays exactly as specced: fixed yaw, 38° FOV, 13 m, the pitch curve and the cat-size
clamp. What changes is **what it looks at and how far back it stands**. That decision moves into one pure module, the
**Framing Director**. Each tick, gameplay registers **subjects**: her, engaged enemies, the selected target, live
wind-ups aimed at her, the boss, a revealed lost kitten, the next objective and so on. Each subject has a **class,
weight, radius and hard/soft flag**. A closed-form **projective solver** returns the focus lean and the camera
distance that fit every hard subject inside the safe frame. Soft subjects are fitted only while that is cheap. Bounded
**critically damped springs** with rate caps and goal hysteresis turn that goal into motion, so the camera never
jitters, overshoots or swings. On top of that, **beats** (short, authored attention moves) give it a cinematic voice:
a peek at a kitten that pops out of hiding, a breath-out when an arena clears, a held wide shot on a boss phase
change, a cosy two-shot when a kitten is rescued. The whole thing costs **≈ 0.015 ms a frame** and makes **zero
allocations**. It also hands its *visible ground footprint* to the shadow, grass and far-plane code, so the camera
pays for itself in draw calls.

---

## 1. Feel rules ("warm cartoon, not 90s")

The user wants a warm, cartoonish feel ("everyone will feel great inside") and **not** a 90s nostalgic one. For the
camera, the 90s look is the twitchy, snapping, swinging camera: hard cuts to enemies, fixed rooms, motion-sick
rotation, and camera fights over walls. The warm-cartoon look is **soft, confident, generous and kind**:

| Rule | Number | Why |
|---|---|---|
| **R1 Never rotate on its own** in play | yaw changes only from level hints (CONTROLS_SPEC §2.2) | Rotation is the #1 motion-sickness and disorientation source (Nesky, *50 Game Camera Mistakes*, GDC 2014). |
| **R2 Never overshoot** gameplay motion | critically damped springs (ζ = 1) on focus, distance and FOV; measured overshoot **0.000 m** on a 13 → 16 m zoom-out | Bouncy cameras feel cheap and seasick. The only underdamped move is the deliberate "boing" in joy beats (§9.6), ζ 0.75, ≤ 0.25 m. |
| **R3 Rate caps** | distance ≤ **6 m/s** out and ≤ **2 m/s** in; lean ≤ **6 m/s**; pitch ≤ **20°/s**; FOV ≤ **12°/s** (punches exempt, ≤ 0.15 s) | A soft camera never "lunges". |
| **R4 Zoom out fast, zoom in slow** | out: smoothTime 0.35 s (t90 **0.75 s**, measured); in: **1.5 s hold**, then smoothTime 1.2 s (t90 **2.43 s**, measured) | Safety first, then relaxation. Generous framing reads as kind. |
| **R5 Goal hysteresis, not position dead zones** | ignore distance goals within **±0.35 m**, and lean goals within **0.30 m**, while every hard subject is still inside the 92 % frame | Six shuffling rats must not make the frame breathe. Her own follow stays tight (λ 12, spec), because a dead zone on the hero feels laggy from above. |
| **R6 Weights fade, never step** | subject weight in over **0.35 s**, out over **0.5 s** | Enemies entering or leaving the engaged set never pop the frame. |
| **R7 She always wins** | she stays inside the inner **75 %** frame (spec 60 %, **[AMEND-1]**, §5.3), and she is never smaller than the cat-size clamp | The cute hero is the emotional centre. |
| **R8 Beats are invitations, not hijacks** | a beat may lean ≤ 2.5 m and change distance ≤ ±1.5 m, never during a live wind-up on her, and any direct input that opposes it fades it out in 0.3 s | Ori-style guidance without taking the stick away. |
| **R9 No hard cuts in play** | cuts only in cutscenes, plus the spec's veil cut when > 120° or > 30 m | Continuity feels safe. |
| **R10 Hitstop freezes goals, not the camera** | during `fx:hitstop` the Director keeps its last goal; springs and shake run in real time | No drift during freeze frames, and shake still lands. |

The cartoon touches are all small: a 2 % "squash" on the FOV for a heavy landing (FOV −0.8° for 0.1 s), a soft
dolly-in for warm moments, and a gentle idle breath (distance ±0.5 % at 0.12 Hz after 4 s idle; off with
*Reduce camera motion*). There is **no Dutch roll, no whip pan in play, no chromatic shake**. Shake stays
translation-heavy (spec §2.5).

---

## 2. What the prototype measured (and why it changes the plan)

`node research/next/tools/cam1_framing.mjs` (1920×1080, FOV 38°, she drawn 4 % below centre):

| Scenario | Needed d (m) | Used d | Pitch | Focus lean |
|---|---|---|---|---|
| Exploring, no subjects | 13.0 | 13.0 | 51.3° | 0 |
| 3 rats ahead at 3–4.5 m | 13.0 | 13.0 | 51.3° | 0 (already in frame) |
| Lost kitten 5.8 m away (soft, w 0.6) | 13.0 | 13.0 | 51.3° | 0.5 m sideways |
| 6 enemies ringed at 6 m (2 down-screen) | **20.7** | 16.0 (cap) | 55.3° | 2.1 m down |
| A wind-up 7 m **down-screen** (camera side) | **23.4** | 16.0 (cap) | 55.3° | 2.5 m down |
| B1 boss 11.7 m on a diagonal | 20.5 | 20.5 | 58° | 5.0 m |
| B1 boss 11 m down-screen | **38.7** | 22 (cap) | 58° | 4.9 m |

Ground footprint of the iso rig (sibling tool `cam_extents.mjs`, 1080p):

| d | Pitch | Ahead of focus | **Behind** | Half width | Cat px |
|---|---|---|---|---|---|
| 13 | 51.3° | 10.6 m | **3.2 m** | 8.4 m | 97 |
| 16 | 55.3° | 11.4 m | **4.1 m** | 10.2 m | 78 |
| 19 | 58° | 12.4 m | **5.0 m** | 12.1 m | 66 |
| 22 | 58° | 14.2 m | **5.9 m** | 13.9 m | 57 |

**Finding F1: the camera side (down-screen) is the blind zone.** At the default zoom you see **3.2 m** behind her
and **10.6 m** ahead. A threat 7 m down-screen needs 23 m of zoom to fit, which is far past every cap.
- Zooming is the **wrong lever**: it costs cat size and draw calls.
- Steepening the pitch is **also wrong**. Measured with `cam1_pitch.mjs`, +4° and +8° make every case slightly
  *worse* (7 m down: 16.8 → 17.1 → 17.3 m), because the top edge shrinks faster than the bottom grows.
- The right lever is **leaning the focus down-screen**. With a 4 m lean cap, the 7 m case drops from 23.4 to
  **16.8 m**. With 5 m it drops to **13.0 m**, with no zoom at all (`cam1_variants.mjs`).

That drives **[AMEND-2]** (an asymmetric lean cap, §5.2) and the enemy-side "down-screen discipline" (§7.3).

**Finding F2: a ground-space bounding-box centre is wrong in perspective.** The first prototype used the ground
bounding-box centre and needed 22 m to frame a boss 8 m *ahead*. That case needs almost no lean, because the frame
already reaches 10.6 m ahead. The solver now finds the up/down lean by a 10-step ternary search on the actual
projected requirement. The horizontal lean stays analytic, because the frame is symmetric left to right.

**Finding F3: cost.**
- `solveFrame` with 16 subjects (10 ternary steps × 3 pitch fixed-point passes × 17 subjects) takes **39 µs** in
  node, cold.
- The goal runs at **20 Hz** (the same cadence as `Occluders.CHECK_HZ`), so the amortised cost is **≈ 13 µs a
  frame**.
- `smoothDamp` takes **0.02–0.05 µs**.
- Against the §18 "≤ 4 ms JS a step" budget, the Director is **< 0.5 %**.

---

## 3. Architecture

```
            ┌──────────────────── per fixed step (sim) ───────────────────┐
 events ──► │ AttentionBoard   (subjects + beats; pure; pooled)            │
 actors ──► │   gather(): engaged set, telegraphs, boss, kittens, objective│
            └──────────────┬───────────────────────────────────────────────┘
                           │ 20 Hz (and on any hard-subject add)
            ┌──────────────▼──────────────┐
            │ FramingSolver (pure)        │  solveFrame(her, subj, n, opts, out)
            │ → goal {leanR, leanU, d}    │  + drop ladder when d > dCap
            └──────────────┬──────────────┘
                           │ every render (real dt)
            ┌──────────────▼──────────────┐
            │ FramingSmoother (pure)      │  hysteresis → smoothDamp + rate caps → beats blend
            └──────────────┬──────────────┘
                           ▼
            IsoRig.pose(focus, d, pitch(d)+beat, fov) → FollowCamera.render() → THREE camera
                           │
                           └─► footprint {ahead, behind, halfW, centre} → env shadow fit, grass LOD, far plane (§12)
```

The new files sit under `src/camera/`, with tests in `tests/unit/camera.test.js`. All of it is camera-owned.

| File | Kind | Content |
|---|---|---|
| `framing/AttentionBoard.js` | pure + bus listeners in `attach(ctx)` | subject pool (Float32Array stride 8, max **24**), beat queue, cooldowns |
| `framing/FramingSolver.js` | pure, node-testable | `solveFrame`, `needD`, `dropLadder`, `footprint` |
| `framing/FramingSmoother.js` | pure | `smoothDamp`, the hysteresis gate, rate caps, beat envelopes |
| `framing/beats.js` | data | the beat table (§9) |
| `IsoRig.js` (already planned by CONTROLS_SPEC §12 camera.1) | pure | consumes the smoother output; owns the pitch curve and the cat clamp |

`FollowCamera.js` keeps the mode machine. In `follow`/`lock`/`boss` it calls `board.gather()` → `solver` (gated) →
`smoother.step(realDt)` → `IsoRig`. `?cam=classic` bypasses all of it.

---

## 4. Subjects (attention points)

A subject is `[x, y, z, r, w, flags, class, ttl]`. Here `y` is the vertical centre, and `r` is the framing radius,
meaning the body plus a margin.

| Class (priority order) | Source | r (m) | w | Hard? | Enters | Leaves |
|---|---|---|---|---|---|---|
| **HER** (implicit) | player | 0.6 at y + 0.4 | — | always, inner frame | — | — |
| **THREAT_ON_HER** | `combat:telegraph` with `targetsPlayer`, from `activeAt − windup` | actor r + **0.8** (+ the full lane end for `lane`/`line` shapes) | **2.0** | **yes** | telegraph start | `telegraphEnd`, + 0.3 s |
| **BOSS** | `boss:start` … `boss:defeated` | `boss.radius + 1.5` (spec), y = h/2 | 1.0 | **yes** | | |
| **BOSS_LANE** | boss telegraphs of shape `lane` (Wheel Ride, the B2 charge) | 1.0 at the lane end | 1.0 | **yes** | wind-up | `telegraphEnd` |
| **SELECTED** | `target:changed` | r + 0.6 | 1.5 | yes, if ≤ 12 m | | deselect |
| **ENGAGED** | alerted hostile within **10 m** (leaves at **12 m**, + 1.5 s hold) | r + 0.6 | 1.0 | yes | | |
| **ADD** (boss adds, jelly splits) | `enemy:spawned` during a boss | r + 0.4 | 0.5 | no | | |
| **OBJECTIVE** | level-authored `camAnchor` (The Line winch, a rope post being cut, a lantern being lit) | authored | 0.2–0.4 | no | `objective:progress` / zone | done |
| **KITTEN** | `kitten:reveal`, then while visible and ≤ 10 m | 0.5 | 0.6 → 0.3 after the reveal beat | no | | rescued / > 12 m |
| **INTERACT** | `interact:available` (Vigil Stone, Quest Board, cage) | 0.8 | 0.25 | no | | `interact:clear` |
| **COMPANION** | active companion while ≤ 6 m | 0.5 | 0.15 | no | | |
| **PICKUP_TRAIL** | a fish burst on `enemy:died` | 1.5 around the burst | 0.15, 1.5 s | no | | ttl |

- **Hard** subjects must fit inside the hard safe frame (x ±0.80, top 0.80, bottom −0.72 rendered NDC; the bottom is
  10 % tighter, because the camera side hides threats).
- **Soft** subjects use the outer frame (±0.90) and are **dropped first** (§5.4).
- The **budget** is 24 subjects. The gather is O(enemies). Enemies come from the engaged set the camera already
  computes for the spec's combat framing, so no new queries are needed.

**New additive event (core owns `events.js`):** `CAM_ATTEND: 'camera:attend'` with
`{ id, pos | actor, r, w, hard, ttl, beat? }`. With it, story, world and companions can register attention points
without importing camera code. Examples: story points at the Bell Tower in a gameplay beat; world points at a door
that just opened. `{ id, off: true }` removes one.

---

## 5. The solver (three.js r186 recipe)

### 5.1 Geometry

These conventions match `core/math.js`, FollowCamera and CONTROLS_SPEC §2.1.

```js
// yaw ψ (fixed per level), pitch θ = pitch(d); ground axes:
//   u (screen-up on the ground) = (-sin ψ, 0, -cos ψ)      r (screen-right) = (cos ψ, 0, -sin ψ)
//   fwd = u·cosθ − Y·sinθ        camUp = u·sinθ + Y·cosθ        lens C = F − fwd·d
// for a subject at p with framing radius ρ, e = p − F:
//   xc = e·r,  yc = (e·u)·sinθ + e.y·cosθ,  a = (e·u)·cosθ − e.y·sinθ,  depth z = d + a
// rendered NDC: x = xc / (z·tanH), y = yc / (z·tanV) + offNdcY        (offNdcY = −2·frameOffset = −0.08)
// so the minimum d per constraint is closed form:
//   d ≥ (|xc| + ρ) / (sx·tanH) − a + ρ
//   d ≥ (yc + ρ)   / ((yTop − offNdcY)·tanV) − a + ρ
//   d ≥ (ρ − yc)   / ((offNdcY − yBot)·tanV) − a + ρ
// pitch depends on d → 3 fixed-point passes (converges < 1 cm)
```

`needD()` is exactly the prototype's function (`cam1_framing.mjs`, about 30 lines, allocation-free). In
`FramingSolver.js`, port it to read the subject `Float32Array` and `CAMERA.iso` (`fov`, the pitch curve,
`frameOffset`), and to use the current `camera.aspect`.

### 5.2 Lean (where the focus goes)

- **Horizontal** (screen-right axis, which is symmetric in perspective): `leanR = bias · centre(bbox_r of
  weight-scaled subjects)`. A weight below 1 pulls a subject's extent toward her for the *centre only*.
- **Vertical** (screen-up axis, asymmetric): a 10-step ternary search on
  `leanU ∈ [−capDown, +capUp]` minimising `needD(leanR, leanU) + κ·|leanU|`, with κ = 0.10 (combat) or 0.30
  (explore), which prefers centring on her.
- **[AMEND-2] Asymmetric lean caps:** `capUp` **2.5 m** (the spec's `biasMax`). `capDown` **4.0 m** when a hard
  subject is down-screen, else 2.5 m. Boss: `capUp` 5, `capDown` 5 (spec `maxOff` 5).
  - Why: F1. Leaning *toward the camera* is what makes camera-side threats visible.
  - The her-inner constraint (75 %) is inside the solver, so a down-lean can never push her past it (the
    7 m case solves at a 3.9 m lean with her inside 0.75).
- The spec's simpler "her + 0.3 × (centroid − her)" stays as the fallback when the solver is disabled
  (`CAMERA.iso.framing.solver = false`), so the rollout is safe.

### 5.3 The her-inner frame **[AMEND-1]**

The spec says 60 % (bosses: "she stays inside the inner 60 %"). Measured: at 60 % she can't lean far enough to show
a down-screen threat, because of F1. Use **75 %** for her (`herInner: 0.75`). It is still well clear of the HUD strip
and the touch cluster, which are handled separately: on touch, the bottom 35 % is thumbs, so `herInner.yBot` is
−0.30 on phones.

### 5.4 The drop ladder (when the need exceeds the cap)

`dCap` = min(the mode cap (combat 16 m, boss 22 m), the cat-size clamp `dMax`). If `need > dCap`:
1. Drop soft subjects in class order (PICKUP_TRAIL → COMPANION → INTERACT → KITTEN → OBJECTIVE → ADD), re-solve.
2. Drop ENGAGED subjects that are farthest from her and not holding an attack token.
3. Never drop HER, BOSS, THREAT_ON_HER or SELECTED. Clamp `d = dCap`. ui's off-screen threat arrows (they already
   exist: `ui/threatArrows.js`) cover what is left.

Each re-solve is about 40 µs. The ladder runs at most 3 times a goal tick.

### 5.5 Smoothing (`FramingSmoother.js`)

```js
// per render, realDt (unaffected by hitstop / slow-mo); goal arrives at 20 Hz
if (!gateHysteresis(goal, cur)) goal = held;                 // R5: |Δd| < 0.35 && |Δlean| < 0.30 && all hard inside 92 %
const out = goal.d > cur.d;                                  // R4
if (!out && t - lastNeedOut < CF.holdIn) goal.d = cur.d;     // 1.5 s hold before zooming in
cur.d     = smoothDamp(cur.d,     goal.d,     sd, out ? 0.35 : 1.2, out ? 6 : 2, realDt);
cur.leanR = smoothDamp(cur.leanR, goal.leanR, sr, 0.45, 6, realDt);
cur.leanU = smoothDamp(cur.leanU, goal.leanU, su, 0.45, 6, realDt);
// pitch follows d through IsoRig.pitch(d); clamp |dθ/dt| ≤ 20°/s (it never binds at 6 m/s: 12° over 9 m → 8°/s)
```

`smoothDamp` is the critically damped spring (Game Programming Gems 4 §1.10, the same as Unity's `SmoothDamp`). It is
in the prototype. Her own follow stays the spec's exponential `damp` (XZ λ 12): the lean is a **separate spring
added on top**, so a lean never makes her own motion feel laggy.

---

## 6. Auto-zoom from enemy count and spread

The fit (§5) handles **spread**. **Count** adds a small "crowd breath", so a tight pack of 6 feels like a big fight
even when it fits at 13 m:

```
dCrowd = 0.25 m × max(0, nEngaged − 2), capped at +1.5 m      (inside the spec's +3 m combat budget)
goal.d = max(fitD, dBase + dCrowd)
```

| Engaged | Crowd term | Typical fit d (measured cases) | Result |
|---|---|---|---|
| 1–2 | 0 | 13 | 13 |
| 3 ahead | +0.25 | 13 | 13.25 |
| 6 ring at 6 m | +1.0 | 20.7 → cap 16, 4 m down-lean | 16 (+ 1 arrow at most) |
| 8 (arena max) | +1.5 | — | ≤ 16 |

The zoom uses the spec's exits unchanged: it eases back **1.5 s** after the last engaged actor, never zooms in by
itself in combat, and never rotates. *Reduce camera motion* turns off the fit, the crowd term and the lean. With it
on, only the fixed rig is used, and arrows cover off-screen threats.

---

## 7. Combat framing details

### 7.1 Telegraph-aware framing (threats off screen)
On a `combat:telegraph` with `targetsPlayer`, the attacker becomes a hard THREAT_ON_HER subject for the wind-up, with
weight 2.0. The camera's zoom-out reaches 90 % of its goal in 0.75 s (measured). The min-lead table in §8.1 is
0.45–0.6 s for melee, so it starts the reveal before the strike but doesn't always finish it. To cover the gap:
- **Pre-attend at token grant:** when an enemy is granted a melee attack token (`AttackTokens`), it joins as a
  *soft* subject (w 1.0) one tick before its wind-up. This needs no new event, because camera reads
  `combat.tokens` holders through the existing service.
- Ranged shooters can only start on screen (spec §8.5), so this mostly matters for melee coming from the camera side.

### 7.2 Selected target
Weight 1.5 (spec `selWeight`). It is hard while ≤ 12 m, and soft out to the 16 m break range.

### 7.3 Down-screen discipline (enemies area, request; it makes F1 cheap)
Tokenless enemies already orbit at 1.4× their attack range. Add a camera-side penalty to that orbit-slot score:
`+1.5 × max(0, −(slot − her)·u − 3.0)` (metres down-screen past 3 m). Packs then naturally spread across the visible
half of the screen, the way Hades staggers enemies across the room's readable area. Token holders still come from
anywhere: that is the honest threat that §7.1 frames.

### 7.4 Spec punches (unchanged; layered after the smoother)
Charge −1 m, Holy, parry −0.6 m, Purrfect Dodge −0.4 m, the Golden Hour dolly to 9 m. These are **additive offsets
on top of the smoothed d** (their own envelopes), so they never fight the springs. A punch is never hysteresis-gated.

---

## 8. Boss arenas

The spec gives the fit range [14, 22], focus 0.35 toward the boss (max 5 m) and a 56° pitch. The Director implements
that fit with the same solver, using BOSS (hard, r = radius + 1.5) and BOSS_LANE subjects. The additions:

| Moment | Camera behaviour | Numbers |
|---|---|---|
| `boss:start` | **Establishing beat**: the lean goes to the arena centre and d fits `arenaR` (B1 12 m → d ≈ 22) for **1.4 s**, then eases into the two-shot. Skipped if a cutscene (`BOSS_INTRO` preset) just played. | ease 0.6 s, hold 0.8 s |
| Two-shot (steady) | solver with BOSS hard, adds soft w 0.5, her inner 75 % | d in [14, 22] |
| **Wheel Ride / charge lanes** | the lane end is a hard BOSS_LANE subject from wind-up start, so she sees where it ends | lane end r 1.0 |
| `boss:phase` | **Phase breath**: hold d + 1.5 m and a 0.5 focus weight on the boss for 1.0 s (the game is already in hitstop), then resume | ≤ 22 m |
| `boss:dizzy` (dizzy = true) | **Opening**: d − 1.2 m and boss weight 0.5 for the Dizzy window, which says "go now!". This is the one combat zoom-in, and it is player-earned **[AMEND-3]**. | out over 0.6 s |
| Boss far (> 14 m) and she can't fit both | she wins; BOSS stays hard but clamps; ui arrow | |
| B1 Cheese Mill pillars | `camFade: 'solid'` (spec) plus the §10 occlusion bias | |
| B2 Cacklejaw (gate yaw 0, causeway) | the arena is long and thin. Lean caps along the causeway (screen-up) 5 m; across 2 m (the causeway edges are fog). | |
| B2 P3 (`clear` 3.5 m, the stage shrinks) | the camera does **not** zoom in. Fog shrinks the stage; the frame stays generous, so it reads as mood rather than claustrophobia. | |
| M3 Brutus / Barkus (h 3.0) | the spec's lift (0.3 × (h − 1.6)) plus subject y = h/2 and r = 1.6 + 1.5 | |
| `boss:defeated` | hold the frame for 0.6 s (no zoom-in snap), then hand over to the story cutscene with a crane arc | |

---

## 9. Beats (the cinematic voice)

A beat is `{ id, lean target, Δd, Δfov, in, hold, out, cooldown, guards }`, blended with easeInOutSine **on top of**
the solver goal (lean added and capped by R8, Δd added). **Guards** (all beats): no live THREAT_ON_HER; not in the
`cutscene`/`dialog` modes; no opposing direct input (it fades out in 0.3 s); *Reduce camera motion* off. Only one
beat runs at a time, and a higher priority pre-empts a lower one.

| # | Beat | Trigger | Lean | Δd | Timing (in/hold/out) | Cooldown | Notes |
|---|---|---|---|---|---|---|---|
| 9.1 | **Peekaboo** | `kitten:reveal` | 60 % toward the kitten, ≤ 2.5 m | +0.5 | 0.6 / 1.0 / 0.8 | per kitten, once | After it, KITTEN stays a soft w 0.3 subject so the kitten never leaves the frame while she walks over. Plays alongside the existing reveal toast and sound. |
| 9.2 | **Cosy two-shot** | `kitten:rescued` | midpoint of her and the kitten | −1.5 (min 10) | 0.5 / 1.2 / 0.9 | — | FOV −2°; the only ζ 0.75 "boing" (≤ 0.25 m). Needs no hostile within 12 m. The emotional reward beat. |
| 9.3 | **Room read** | `arena:lock` | arena centre (lean ≤ 3 m) | fit `arena.r` ≤ +3 | 0.5 / 0.7 / 0.6 | per arena | Like Hades on room entry: shows the whole fight before it starts. Waves spawn after it (world: the first wave delay ≥ 1.2 s; it is already ≥ 1 s in most arenas, check). |
| 9.4 | **Wave glance** | `arena:wave` when ≥ 50 % of the new spawns are off frame | spawn centroid, ≤ 2 m | +0.8 | 0.4 / 0.5 / 0.6 | 6 s | Skipped if a THREAT_ON_HER is live. |
| 9.5 | **Exhale** | `arena:clear` | back to her | +0.8, then ease to base | 0.4 / 0.6 / 1.5 | — | Pairs with the music falling back to explore. |
| 9.6 | **Discovery** | entering a zone with `cam.reveal: {pos, r}` (world-authored; ≤ 2 per level) | 50 % toward pos | +1.5 | 0.8 / 1.2 / 1.0 | once per save | E.g. the Standing Stones, the Mushroom Ring, the town Square fountain, the Gate causeway. Ori-style "look at this". |
| 9.7 | **Lead the way** | 6 s idle in explore and an objective `camAnchor` is set | 35 % toward it, ≤ 2 m | 0 | 1.2 / 2.0 / 1.2 | 20 s | A soft nudge for lost players. Off once `tut.click` is done and the player has used orders 10×. |
| 9.8 | **Talk frame** | `dialog:start` (gameplay barks excluded) | speaker midpoint | ×0.8 (spec §2.4) | 0.5 / — / 0.5 | — | Spec behaviour, expressed as a beat so it shares the blend code. |
| 9.9 | **Helper moment** | `companion:ability` (Shield Wall, Volley, Purr) | 30 % toward the cast point | 0 | 0.25 / 0.4 / 0.4 | 4 s | Shows the kitten off. Skipped in combat if any hard subject would leave the frame. |
| 9.10 | **Rest** | Vigil Stone interact (rest) | the stone | −1.0 | 0.6 / until done / 0.8 | — | Pitch eases to 46° for a warmer, closer look. |

**Data:** `beats.js` holds the table as data. `CAM_ATTEND` with `beat: '<id>'` lets story or world fire a beat by
name, for example a G-gag or a gameplay reveal that isn't a full cutscene.

---

## 10. Occlusion-aware positioning (from above)

The spec's main tool is fading occluders (dithered, roofs, crowns, x-ray). The Director only *biases* the framing
when fading is not enough, using data that `Occluders` already computes at 20 Hz:
1. **Lean-away:** if a `camFade: 'solid'` or non-fadeable unit occludes her or a hard subject for > 0.25 s, push the
   lean 0.6 m along the screen-up axis away from that unit's screen-space centre. The goal is to make the x-ray
   unnecessary, not to dodge walls. Rate-capped like any lean.
2. **No pitch steering in play.** F1 measured it as a net loss, and a changing pitch near walls reads as camera
   fighting.
3. **Yaw stays fixed.** The authored zone hints (spec §2.2) are the only rotation.
4. **Clutter check (world, in an existing audit):** any `camFade: false` prop taller than 2.2 m within 6 m
   down-screen of the spine is a bug (spec §11). The Director logs `cam:occluded-hard` in `?debug` with the unit name
   when lean-away fires more than 3× in 10 s, so world can fix the data.

---

## 11. Cutscene, dialog and Meme Cam blends

These follow the spec (§2.6–2.7: crane arcs, 1.0 s hand-back, veil cut). The additions:
- **Pose-space blend:** blend `{focus, d, pitch, yaw, fov}` with each channel eased separately. Yaw uses the
  shortest arc (`lerpAngle`). Distance is blended in **log space** (`exp(lerp(ln d0, ln d1, k))`), so a 13 m → 3.5 m
  crane feels uniform instead of rushing at the end. This uses the existing `pose.js` `CamPose` with one helper,
  `blendPoseIso(a, b, k, out)`.
- **Hand-back pre-solve:** on `cutscene:end`, run the solver once on the current subjects *before* starting the
  hand-back, so the blend lands on the real gameplay frame. That avoids a second move after landing. It fixes the
  class of bug in the STATUS note about the CS-04 hand-back.
- **Dialog:** beat 9.8. No cut; the HUD stays.
- **Meme Cam "Descent":** unchanged (spec). The Director's springs are **frozen** while in `meme`, and their state is
  re-seeded from the current pose on exit, so the 0.9 s rise doesn't fight a stale lean.
- **Beats never run** in `cutscene`, `preset`, `meme` or `dialog`. On entering any of those, active beats are dropped
  (no exit blend), because the shot owns the frame.

---

## 12. Performance: the camera as a perf system

The user wants performance to be extraordinary. The Director already knows the exact **visible ground footprint**, so
other systems can share it instead of using worst-case radii.

| Consumer | Today / spec | With the footprint | Expected win |
|---|---|---|---|
| Sun shadow frustum (world `Env`) | ±16 m (boss 20 m), centred on the focus | fit the footprint: centre = footprint centroid; half = max(ahead + behind, 2·halfW)/2 + 2 m. At d 13: ≈ 10.4 m. At d 22: ≈ 16 m. | ~2.4× shadow texel density at the default zoom with the same 2048 map, *or* Med can drop to a **1024** map with the same density as today. |
| `camera.far` | 90 m fixed | `far = d + ahead + 25` (focus fog hides the rest). At d 13: ≈ 49 m; d 22: ≈ 61 m | fewer far draws; better depth precision |
| Grass LOD radius | 22 m from the focus | `max(ahead, halfW) + 3` → 13.6 m at d 13, 17 m at d 22 | ~60 % fewer grass instances at the default zoom (area ratio (13.6/22)² = 0.38) |
| Fur / actor LOD (spec §2.8) | from the focus | unchanged, plus `offscreen`: actors outside the footprint + 2 m skip shells and mixers (they can't be seen) | fewer skinned updates in arenas |
| Ground mist ring (spec §4.2) | 4–16 m around the focus | the outer radius tracks the footprint | |

**Rules:**
- The footprint is computed once per render from the *smoothed* pose (4 ray-plane hits on the focus-height plane:
  12 flops, ~0.1 µs).
- It is published as `cam.footprint = { cx, cz, ahead, behind, halfW, d }`, read-only and additive.
- Consumers must **quantise** what they read (shadow half to 1 m, grass radius to 1 m, `far` to 5 m), with
  hysteresis, so nothing re-allocates or re-renders every frame.
- Shadow frustum resizes must be texel-snapped (spec).

**Own cost** (per frame at 60 Hz):

| Item | Cost | How |
|---|---|---|
| Gather subjects | O(engaged) ≤ 24 | reuses the engaged list; no scene queries |
| Solve | 39 µs × 20 Hz / 60 ≈ **13 µs** | gated; immediate re-solve only on a hard-subject add |
| Smooth + beats + footprint | ≈ **1 µs** | scalars |
| Allocations | **0** | module-level `Float32Array(24 × 8)`, scratch `Vector3`s; `camera.updateProjectionMatrix()` only when FOV, aspect or view offset change, which the spec's punches already do |

**Measure in game (when IsoRig lands):** `?debug` lil-gui folder "framing" (subjects drawn as ground rings, the goal
vs current d, the need, dropped subjects). Use the hook `__GAME__.cam.framing()` → `{ need, d, lean, subjects,
dropped, beat }`. Playwright `tools/cam1_bench.mjs` (to write when `IsoRig` exists, own port **5841**) samples
`performance.now()` around `cam.render` over 600 frames in the B1 arena. Target: p99 < **0.08 ms**.

---

## 13. Settings and accessibility

| Setting | Effect |
|---|---|
| *Reduce camera motion* (spec) | solver off (fixed rig), no beats, no crowd term, punches off, breath off. Arrows cover everything. |
| `camDirector` (new, `'full' \| 'calm' \| 'off'`, default `full`) | `calm` = solver on; beats limited to 9.1, 9.2, 9.3, 9.5; all Δd halved. `off` = the spec's centroid bias only. |
| `camZoom` (spec) | multiplies `dBase`. The solver caps scale with it, and the cat clamp still wins. |
| *Kitten difficulty* | THREAT_ON_HER starts at token grant (§7.1) instead of wind-up; the hard frame bottom goes to −0.65. |

Every beat has a non-camera twin (a toast, sound or ground ring), so `off` loses nothing that matters to play.

---

## 14. Config (core writes; `CAMERA.iso.framing`)

```js
CAMERA.iso.framing = {
  solver: true, hz: 20, maxSubjects: 24, ternarySteps: 10, pitchPasses: 3,
  hard: { x: 0.80, yTop: 0.80, yBot: -0.72 }, soft: { x: 0.90, yTop: 0.90, yBot: -0.85 },
  herInner: { x: 0.75, yTop: 0.75, yBot: -0.75, yBotPhone: -0.30 },          // [AMEND-1]
  lean: { bias: 0.5, biasBoss: 0.7, capUp: 2.5, capDown: 4.0, capBoss: 5.0, centre: 0.10, centreExplore: 0.30 }, // [AMEND-2]
  caps: { combat: 16, boss: 22 },                                            // spec: base + 3, boss [14, 22]
  crowd: { per: 0.25, after: 2, max: 1.5 },
  engage: { in: 10, out: 12, hold: 1.5 },
  weightIn: 0.35, weightOut: 0.5,
  spring: { outT: 0.35, outMax: 6, inT: 1.2, inMax: 2, holdIn: 1.5, leanT: 0.45, leanMax: 6, pitchMaxDeg: 20, fovMaxDeg: 12 },
  hysteresis: { d: 0.35, lean: 0.30, frame: 0.92 },
  subjects: { threatPad: 0.8, bossPad: 1.5, enemyPad: 0.6, addPad: 0.4, kittenR: 0.5, interactR: 0.8,
              w: { threat: 2.0, boss: 1.0, lane: 1.0, selected: 1.5, engaged: 1.0, add: 0.5, objective: 0.3,
                   kitten: 0.6, kittenAfter: 0.3, interact: 0.25, companion: 0.15, pickups: 0.15 } },
  occl: { leanAway: 0.6, after: 0.25 },
  breath: { amp: 0.005, hz: 0.12, after: 4 },
  beats: { maxLean: 2.5, maxDd: 1.5, cancelFade: 0.3 },                      // R8
  footprint: { pad: 2, shadowQuant: 1, grassQuant: 1, farQuant: 5, farFogPad: 25 },
};
```

---

## 15. File and area mapping (GAME_DESIGN §19.2)

| Area | Work | Phase (CONTROLS_SPEC §12) |
|---|---|---|
| **camera** (owner) | `framing/AttentionBoard.js`, `FramingSolver.js`, `FramingSmoother.js`, `beats.js`; wire into `FollowCamera` (`follow`/`lock`/`boss`) after `IsoRig` lands; `cam.footprint`, `cam.framing()`; hand-back pre-solve; meme freeze; `blendPoseIso`; debug overlay; unit tests (solver cases from §2's table as golden values ±0.1 m; smoother no-overshoot; hysteresis; drop ladder order; footprint vs `cam_extents.mjs`) | P1 tail (solver plus spec framing), P3 (beats) |
| **core** | `CAMERA.iso.framing` (§14); `E.CAM_ATTEND` (additive); settings `camDirector`; hook `__GAME__.cam.framing()` | P0 / P3 |
| **world** | `cam.reveal` zone field (≤ 2 per level) and `camAnchor` on objectives; read `cam.footprint` for the shadow fit, grass radius and mist ring; arena first-wave delay ≥ 1.2 s; the clutter audit uses `cam:occluded-hard` logs | P4 |
| **enemies** | the down-screen orbit penalty (§7.3); expose `radius`/`height` on bosses (exist); no other changes | P3 |
| **combat** | expose token holders (`tokens.holders(actor, out)`) for the pre-attend; the telegraph payload `activeAt`/`targetsPlayer` (already in spec) | P3 |
| **characters / companions** | LOD consumers read `cam.footprint` for the off-screen skip | P4 |
| **story** | optional `CAM_ATTEND` beats in gameplay moments; no cutscene changes | P4 |
| **ui** | settings row `camDirector`; arrows unchanged (they cover the drop ladder) | P4 |
| **audio** | none (the listener follows `cam.focus`, which now includes the lean: the right behaviour, ears go where eyes go) | — |

**Smoke blocks** (camera's file):
- `camera:frame-threat`: a rat_pike placed 6 m down-screen starts a wind-up → within 0.8 s its chest projects inside
  the 0.8 frame, and `d ≤ 16`.
- `camera:boss-two-shot`: B1 and B2 both on screen through 20 s of scripted movement; her inside 75 %.
- `camera:no-jitter`: 6 rats milling for 10 s → the d trace has ≤ 2 direction reversals and a max |dd/dt| ≤ 6 m/s.
- `camera:kitten-peek`: reveal → the kitten is on screen in ≤ 1.0 s, then back to normal framing.
- `camera:footprint`: shadow half ≤ 12 m at the default zoom.

---

## 16. Risks and open questions

1. **Spec amendments:** AMEND-1 (her 75 %), AMEND-2 (down-lean 4 m) and AMEND-3 (the Dizzy zoom-in) need the lead's
   OK. Without AMEND-2, camera-side threats stay arrow-only (F1).
2. **Phones:** the 35 % thumb band makes the vertical frame tighter still. The `yBotPhone` −0.30 for her means
   down-leans are limited to ≈ 2 m. Phones lean on the down-screen discipline (§7.3) and arrows. Check on 844×390.
3. **Beat fatigue:** cooldowns are first guesses. Playtest: if a beat fires more than once a minute on average, it is
   too chatty.
4. **The footprint-fit shadow** may shimmer on zoom changes. Quantise the half-size to 1 m and texel-snap. Fallback
   is the spec's fixed 16/20 m.
5. **The solver's sphere approximation** over-frames tall bosses vertically (the r applies on every axis). Use the
   y-centre plus a smaller vertical pad if B1 looks too wide; it is a one-line change (separate `rx`/`ry`).

---

## References
- Itay Keren, *Scroll Back: The Theory and Practice of Cameras in Side-Scrollers* (GDC 2015):
  [gamedeveloper.com](https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers),
  [GDC Vault](https://gdcvault.com/play/1022243/Scroll-Back-The-Theory-and). It covers camera windows, lerp
  smoothing, attractors and cues; the source of the beats and hysteresis ideas.
- John Nesky, *50 Game Camera Mistakes* (GDC 2014): [GDC Vault](https://gdcvault.com/play/1020460/50-Camera),
  [summary](https://gamedeveloper.com/design/video-50-common-game-camera-mistakes----and-how-to-fix-them). Covers
  rotation and simulation sickness, line of sight and over-shaking; the source of rules R1–R3 and R9.
- Unity Cinemachine Target Group (GroupCenter vs GroupAverage, weights and radii) and the Framing Transposer: the
  model for weighted subjects. The bounding-centre-vs-centroid choice here follows GroupCenter, corrected for
  perspective (F2).
- Game Programming Gems 4 §1.10, critically damped smoothing (the Unity `SmoothDamp` formula used in the
  prototype).
- Hades (room-entry read, enemy staggering across the readable area), Diablo IV (fixed-yaw iso, zoom on bosses),
  Ori (gentle attention leans at discoveries): design references by observation. No published camera talk was found
  for Hades.
