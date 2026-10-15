# SWORDCAT: control and camera rework, the FINAL binding spec

Author: lead design, 2026-10-10. Status: **binding**. It supersedes `research/controls_{purist,hybrid,mobile}.md`
(they are background only) and amends GAME_DESIGN §6.6, §7.1–7.3, §7.8, §8.1, §8.3, §14.2–14.4 and §15 (already
rewritten to match). Where this file and an older section disagree, this file wins.

**TT3 update (2026-10-15).** The default bindings changed in TOKENTAILS-PLAN §11.2. §6.2 and §6.3 below hold the
current tables: WASD walks, LMB attacks, RMB / Q / L is the Stand, Space jumps, Shift tumbles, F is the Paw Trick,
G is the kitten. No action uses Ctrl, Alt, Meta or an F-key. Older keys in §0, §14 and the work list (RMB moves,
Space stands, F jumps) are history. The live prompt text is in `src/story/strings.js`.

User request: *"make this game controlled like League of Legends rather than pure 3rd person from the back (it's hard
to navigate and it's not mobile friendly), rework what's needed for the best experience."*

Base: the **mobile** proposal (camera rig, focus fog, the aim resolver, the touch cluster, `?cam=classic`).
Grafts: the **hybrid** desktop keymap (WASD and RMB both first-class, LMB attacks toward the cursor, Space = Stand
with a threat snap, Shift = Tumble, F = Jump), the aim ring with the parry-window flash, the gated fence link, five
presets, and the on-screen rule for ranged enemies. From **purist**: the shrinking parry ring, wedges that freeze
0.15 s before the hit, move-cancel rules, stop, hold, attack-move, queueing, camera lock, centring, edge pan, the
Wild Rift target priority, Auto-Riposte on touch, the hero ring, x-ray, the crane-arc handback, the 3 m magnet,
the shake retune, the audio listener at the focus, fur LOD keyed to the focus, and the 6 m spawn audit.

---

## 0. The design in one paragraph

The camera no longer orbits behind her. It is a **fixed-yaw, three-quarter top-down perspective camera**: 38° vertical
FOV, about 50° pitch, 13 m from the focus on desktop and 12 m on phones. A **minimum on-screen cat size of 30 CSS px**
keeps her cute. You never look around any more, so the mouse and the right thumb are free for **where** and
**what**. On desktop, **RMB clicks and holds move her (LoL)** over a physics **nav grid**, and **WASD still works and
overrides a path at once**. **LMB swings toward the cursor**, and holding it charges. **Space is the Stand**: on press
she snaps to face the threat. **Shift tumbles** and **F jumps**. On phones, a floating stick or **tap-to-go**
moves her, and a **Wild Rift cluster** holds the actions: a big ⚔, a 🛡 Stand where the thumb rolls, drag-to-aim
and a ✕ cancel. All devices share **one action model and one aim resolver**. Combat stays a timing game: the manual
combo, the charge, parry and Tumble. The view from above stays readable through **ground wedges**, a **parry ring**,
an **aim ring**, an **x-ray silhouette** and **dithered occluder fades**. Fog is measured from her (**focus fog**),
so the edges of the screen are misty and the stage is clear. The eye-level Meme Cam becomes a **crane-down
showpiece**. The old camera stays behind `?cam=classic` until M3 ends.

---

## 1. Device model

| Term | Definition |
|---|---|
| `device` | `input.device` ∈ `kbm | pad | touch` (exists; last device used wins, `E.INPUT_DEVICE`) |
| phone | `device === 'touch'` and `min(innerWidth, innerHeight) ≤ 500` CSS px |
| tablet | touch and not phone (desktop-like camera distance, touch layout ×1.15) |
| portrait | `innerHeight > innerWidth × 1.05` |
| preset | `settings.controlPreset` (KBM only, §6.2); pad and touch each have one fixed layout plus options |

Everything in this file is a value in `config` (§13) unless it is marked as a setting. **No literals in area code.**

---

## 2. Camera (`camera` area)

### 2.1 The iso rig (`mode('follow')`, `'lock'` and `'boss'` all run it; `?cam=classic` runs the old orbit)

| Parameter | Landscape | Portrait | Notes |
|---|---|---|---|
| Projection | perspective | perspective | Orthographic was rejected: it flattens fog depth and breaks the §5.2 preset FOVs |
| Vertical FOV | **38°** | **50°** | |
| Yaw | **fixed per level**: `level.cam.yaw`, default **π** (camera south of her, looking +Z) | same | Zone hints in §2.2; no rotation by the player |
| Distance d (lens → focus) | desktop and tablet **13 m**; phone **12 m** | from the width fit: ground width at the focus ≥ **9 m** (≈ 21 m on 390×844) | × `settings.camZoom` (0.70–1.40), then clamped to **[9, 18] m** and to the cat-size clamp |
| Pitch (down from horizontal) | `pitch(d) = lerp(46°, 58°, (d − 9) / 9)`, clamped. 12 m → 50°, 13 m → 51.3°, 18 m → 58° | **58°** fixed | Closer is flatter (more of her face). Farther is steeper (tall props hide less). |
| Cat-size clamp | `dMax = catH · H_css / (2 · tan(fov/2) · minCatPx)`, with `catH` 0.8 m and **minCatPx 30** (bosses **26**) | minCatPx **28** | Phone 390 px tall: dMax ≈ 15.1 m (boss 17.4 m). The clamp beats zoom, combat zoom-out and boss fit. |
| Focus | her feet + (0, **0.6**, 0) + lead | same | The camera looks at the focus, never at her head |
| Lead (follow) | velocity × **0.25 s** (max **1.6 m**) + KBM cursor **15 %** of (cursor ground − her) (max **2.0 m**); total cap **2.5 m**, damped λ **4** | velocity only | Off while the Stand or a charge is held; off with *Reduce camera motion* |
| Screen-up bias | **0.8 m** forward along yaw | 0 | She sits a touch low and sees more of the path |
| Framing | `camera.setViewOffset` places her **4 %** below centre | she sits at **40 %** from the top (the bottom 35 % is thumbs) | It changes the frame, not the perspective |
| Follow damping | XZ λ **12**; Y λ **6** | same | During a jump the focus takes **30 %** of her height (50 % on a mushroom bounce) |
| Collision | **none** in iso (occluders fade, §3) | | The spring arm stays only for `preset` rails and `?cam=classic` |
| Near / far | **0.3 / 90 m** (`RENDER.far` 600 is used only by presets and classic) | | Big culling win |
| Re-fit on resize or rotation | 0.4 s ease; touch pointers released (`_release()`); no reload | | |

Reference views: desktop 1080p at 13 m shows ≈ 15.9 m of ground across the focus, ≈ 8.5 m ahead and 5 m behind,
and she is ≈ 96 px tall. A 844×390 phone at 12 m shows 17.9 m across and she is ≈ 38 CSS px tall.

### 2.2 Yaw hints (authored by world; rare by design)
- A level may author **at most 3** zone hints: `zone.cam = { yaw?, dist?, pitch?, clear? }`. A yaw change of more
  than **45°** needs a set piece that requires it (Treetop climb, Lantern Alley turns, the Post Office chase legs).
- A hint applies on zone entry and blends over **1.2 s** easeInOutSine, **only when there has been no engaged enemy
  for 2 s**. In combat it waits; a blend that is running finishes.
- **Stick latch (`cam.stickYaw`)**: while WASD or the stick is held, movement uses the yaw sampled when the input
  was engaged. It re-latches 0.15 s after release, so a run never bends under the thumb. Paths are in world space and
  are not affected.
- *Reduce camera motion*: hints snap under a 0.25 s veil fade instead of blending.

### 2.3 Zoom, lock, peek, centre
| Control | Desktop | Pad | Touch |
|---|---|---|---|
| Zoom | wheel: 1 tick = **7 %** of d, λ 8 | **R3** cycles 0.80 / 1.00 / 1.25 | **pinch** (both pointers on free area), λ 10; two-finger double-tap resets |
| Camera lock | **Y** toggles (toast `toast.cam.locked/unlocked`; `settings.camLock`, default locked) | always locked | always locked |
| Unlocked | **edge pan** within **12 px** of the window edge at **18 m/s** × `settings.edgePanSpeed` (0.5–2); **MMB drag** = 1:1 ground grab; leash **25 m** from her (soft over the last 3 m); auto-recentre in 0.4 s when she is hurt or an enemy alerts within 8 m while she is off screen | — | — |
| Centre | hold **F1** or **Home**: centre and follow while held; tap: snap back over 0.25 s | — | — |
| Peek | hold **Alt** (or MMB when locked): the focus slides toward the cursor, up to **6 m**, λ 6; back in 0.4 s | hold **D-pad ↓** + RS: up to 6 m | — |

The **wheel no longer switches targets** (Tab does). Pointer lock is removed in play (§6.1).

### 2.4 Framings
| Situation | Behaviour |
|---|---|
| Explore | §2.1 |
| **Combat** (an alerted hostile within **10 m**, or a selected target) | Lead off. Focus = her + **0.3** × (centroid of the engaged set − her), capped at **2.5 m**. **Auto zoom-out** until every engaged actor (with a 1.2 m margin) sits inside the inner **80 %** of the frame, up to **+3 m**, λ 2.5. It eases back only **1.5 s** after the last engaged actor. **Never auto zoom-in, never a yaw change.** |
| Selected target | No camera swing (shoulder and LOCK_SEP framing are retired in iso). It joins the engaged set with weight 1.5. |
| **Boss** (`boss:start`) | d = fit(her + boss radius + 1.5 m) inside the 70 % safe frame, clamped **[14, 22]** and by the boss cat-size clamp; `boss.camDist` becomes the minimum. Focus = lerp(her, boss, **0.35**), max 5 m from her; she stays inside the inner 60 %, the boss inside 85 %, and she wins when both can't fit. Pitch **56°**. Bosses taller than 1.6 m lift the focus by 0.3 × (h − 1.6). The arena hint gives the yaw (B2: along the causeway). The `BOSS_EDGE` assist is replaced by this fit. |
| Arena / The Line | `arena.camDist` hint (The Line **17 m**, pitch 56°; the winch is a framing anchor with weight 0.2) |
| Charge held | d −**1.0 m**, FOV −1° (replaces 3.6 → 3.3 m / 45 → 42°) |
| Holy release | FOV +**3°** for 0.15 s, and d −0.6 m for 0.25 s |
| Parry | punch d −**0.6 m** over 0.08 s, back over 0.30 s (real time) |
| Purrfect Dodge | d −0.4 m held through the 0.5 s slow motion |
| Golden Hour activation | dolly to **9 m** at 46° over 0.25 s, hold through the 0.8 s Oath, back over 0.6 s |
| Dialogue (`dialog` mode) | focus eases to the speaker midpoint, d ×**0.8**, 0.5 s, no cut |
| *Reduce camera motion* | no lead, no auto zoom, no punches or dollies, hints snap; shake defaults to 0 |

### 2.5 Shake (retune; `CameraShake.js`)
The trauma model and the §8.2 trauma values are unchanged. Output mix in iso: **rotation ×0.5** (max **1.2°**),
**translation ×2.0** in the screen plane (max **0.35 m**), global scale **0.6**. `settings.shake` scales everything.

### 2.6 Cutscene hand-off and hand-back
- §5.2 presets are **unchanged** (anchor-local).
- **Into a shot** that starts from gameplay with a `blend`: a **crane arc**. The position is interpolated in
  spherical coordinates around the subject (default blend **0.8 s**, easeInOutSine), so the lens never slides through
  the ground.
- **Hand-back** (`cutscene:end`): the reverse crane arc to the iso pose over **1.0 s**. If the angular distance is
  over **120°** or the poses are more than **30 m** apart, cut under a 0.25 s veil fade instead.
- The **fog mode blends with the camera** (§4.1): `uFogMode` → 0 over the blend into any preset, cutscene or meme
  pose, and → 1 over the hand-back. Eye-level shots keep today's look exactly.
- `PULLBACK` (CS-08) and `CRANE_DOWN` may end on the iso pose for free continuity (camera may add the option).

### 2.7 Meme Cam: "The Descent" (`MemeCam.js`)
- **Enter (2.0 s, `memeCam.blendIn` unchanged):** a crane arc from the iso pose into `MEME_LOOP` (pitch about
  50° → 5°, FOV 38 → 32, end yaw from the existing MEME_YAWS clear-view search, or an authored `memeSpot.yaw` when
  she idles within 4 m of one). The fog mode blends 1 → 0 in sync, so the misty horizon and sky appear as the lens
  reaches eye level. The HUD and touch cluster fade over 0.5 s. Wind ×1.6, mist ×2 and the 3.8 s loop are unchanged.
- **Exit: 0.9 s** rise back to iso (**`memeCam.blendOut` 0.6 → 0.9**). Any key, click, tap, stick, or a mouse move
  of **≥ 40 px** exits (cursor jitter doesn't).
- Idle: mouse movement counts as activity only above **24 px/s**. On touch, a thumb resting in the joystick zone
  with no deflection doesn't count. `lookIdleTime` is no longer used (it is always 0 in iso).
- One `memeSpot` per outdoor level (world): meadow the Tallbert knoll, forest the Mushroom Ring, gate the causeway
  rampart, town the fountain.

### 2.8 Side effects keyed to the focus
- **Audio listener** at `cam.focus + (0, 1.2, 0)`, oriented to the camera yaw (screen-right = right ear). Audio
  reads `cam.focus` and `cam.yaw` each render.
- **Fur LOD and every distance LOD** (characters, enemies, companions, lost kittens): measure from `cam.focus`, not
  the lens. Her hero shells stay full within 25 m of the lens; other cats drop one `furShells` tier when d > 12 m.
- **Sun shadow frustum** centred on `cam.focus`: half-size **16 m** (boss **20 m**), texel-snapped. Low tier 1024,
  Med and High 2048.

---

## 3. Occlusion from above (`camera` Occluders + `world` tags + `characters` proxy)

- **Targets:** each is a capsule from the lens to a subject point: her chest (r **1.0 m**), up to **4 engaged
  enemies within 8 m** (r 0.6), the selected target (r 0.6), and the next path waypoint within 3 m (r 0.4).
- **Fade:** **dithered alpha-hash** driven by a per-material fade uniform (no blending, no sorting cost, no shadow
  popping). Fades to **0.22** in **0.15 s** and back in **0.40 s**. `CHECK_HZ` stays 20. `CAMERA.treeFadeOpacity`
  0.3 → 0.22.
- **Canopies:** a `camFade` crown (`FADE_NAME` match, or `camFadeIds` where world splits crown from trunk) fades when
  it is within **3.5 m** horizontally of a target capsule. **Trunks never fade.**
- **Roofs:** the new tag `camFade: 'roof'` fades roof parts only, when she is inside the roof footprint expanded by
  **1.5 m**, or when the roof cuts a capsule. Walls stay.
- **Solids** (tall stones, pillars, towers, the bell tower, the gatehouse): `camFade: 'solid'`, the same capsule
  test.
- **Hero ring:** always on in play. A pink `#F7A8C4` ground ring, r **0.75 m**, 0.06 m wide, 0.40 alpha,
  `depthTest: false`. It is the same decal as the **aim ring** (§7.3).
- **X-ray silhouette:** when more than **30 %** of her capsule is occluded for **0.1 s**, redraw her
  `getSilhouetteProxy()` (capsule + ears + bow + sword, one merged mesh, no fur) with `depthFunc: GreaterDepth`, flat
  `#FFE4EC` at 0.55 alpha. Enemies **in a wind-up** get the same pass tinted by telegraph colour at 0.45. Cost: 1
  draw per silhouetted actor (max 5). Low quality: her only.
- The see-through hole shader (hybrid §2.6) is **deferred**: only if the dithered roof and solid fades fail the
  Lantern Alley and B1 screenshots.

---

## 4. Fog, mist and lighting from above

### 4.1 Focus fog (`world/HeightFog.js`; one chunk change reaches every patched material)
`V_MAIN` already rebuilds the world position to get `vFogH`. Keep the whole vector as **`varying vec3 vFogW`**
(`vFogH = vFogW.y`). New shared `HFOG` uniforms: `uFogFocus` (vec3), `uFogMode` (0 = lens, 1 = focus),
`uFogClear` (m) and `uFogTopMul`.
```glsl
float dFocus = max(length(vFogW.xz - uFogFocus.xz) - uFogClear, 0.0) * uFogTopMul;
float dEff   = mix(vFogDepth, dFocus, uFogMode);
float hfDist = 1.0 - exp(-fogDensity * fogDensity * dEff * dEff);       // FOG_EXP2 branch; linear branch likewise
```
- Export the same maths as a GLSL helper `HFOG_GLSL` (`float hfogFactor(vec3 w, float viewDepth)`) and
  `patchFogVarying(shader)`, so **`fx/shaders.js` (`fogFactor`) and `fx/Horde.js`**, which do their own fog maths,
  switch to it. `characters/Fur.js` uses the stock chunks, so it is covered by the existing patcher. Every other
  custom shader is audited by a grep for `vFogDepth` (smoke `world:fog-audit` asserts `fogAt(her) < 0.03` on each).
- **Writer:** camera calls `env.setFocusFog({ focus, mode, clear })` every render; Env owns the uniforms. In iso
  `mode` = 1. Over a preset, cutscene or meme blend, `mode` eases to 0 (§2.6).
- **Defaults:** `clear` **5 m** while exploring, **7 m** in combat and boss fights (eased 0.6 s); `topMul` **1.5**;
  in iso `uFogLowMix` 0.6 → **0.45** (seen from above all ground is "low").
- Density keeps its meaning, so every §12.2 preset, `contribute()`, Golden Hour ×0.5 and the 0.005–0.12 clamp stay
  valid. Golden Hour also scales `clear` ×1.5. **Cacklejaw P3** sets `clear` **3.5 m** (the stage shrinks: a mechanic).
- `LostKitten`'s `max(40, 2/ρ)` cull is still correct.
- Background clear colour = `fogColor` in iso. The sky dome, far skyline and Dawnstone are hidden in play (a new
  `levels.setVisible('far', on)` group; shown in cutscenes and Meme Cam).

### 4.2 Per-level fog and lighting retune (world authors, `level.cam.fog` overriding `CAMERA.iso.fog`)
Target: fog on her < 3 %; at the top screen edge (≈ 12 m from her) 15–30 %; enemies at 8 m < 12 %.

| Preset | ρ | `clear` / `clearCombat` | `topMul` | f at 8 / 12 / 16 m | Lighting notes |
|---|---|---|---|---|---|
| `meadow_day` | 0.045 | 5 / 7 | 1.5 | 0.04 / 0.18 / 0.42 | Sun azimuth 60–120° off the camera yaw (side light: shadows fall across the screen, not under props); hemi ×1.08 (from above you see mostly ground) |
| `forest_day` | 0.06 | 5.5 / 7 | 1.35 | 0.05 / 0.24 / 0.53 | Canopy crowns fade (§3); god rays become ground light pools |
| `forest_night` | 0.055 | 4.5 / 6 | 1.35 | 0.07 / 0.26 / 0.55 | Lantern pools are the readable stage; fireflies stay; hemi ×1.15 so the ground isn't black |
| `town_occupied` / `hub_*` | 0.04 | 6 / 7.5 | 1.4 | 0.01 / 0.11 / 0.29 | Roof fades on; town lanterns −0.005 still apply; shadows from eaves read the street edges |
| `gate_dusk` | 0.05 | 6 / 8 | 1.3 | 0.01 / 0.14 / 0.36 | The Line needs width: clear 8 in the arena. Low sun along the causeway gives long shadows (good height cues). Lift the deck bricks ×1.1 (STATUS known issue). |
| `bog` (M3) | 0.07 | 4.5 / 6 | 1.2 | 0.05 / 0.30 / 0.60 | The densest: the stage is small by design |
| `keep_storm` (M3) | 0.05 | 5 / 7 | 1.4 | 0.03 / 0.19 / 0.45 | Lightning flash also bumps `clear` +2 m for 0.15 s |

- **Ground mist sheets** (fx, new `GroundMist.js`): 8 instanced horizontal quads, 12 × 12 m, 0.4–1.3 m above the
  terrain, two-octave noise, alpha 0.10–0.22 × the preset's mist factor, tinted by the fog colour, in a 4–16 m ring
  around the focus with a **3.5 m clear disc around her** and none over an enemy in wind-up. 1 draw. Drift follows
  `env.wind`; Standing Ground and Meme Cam ×2.
- `MistCards`: kept for cutscenes and fog walls. In iso they sit at 0.3–1.2 m and tilt 60° toward the camera. Arena
  fog walls add a 2 m-wide ground mist ring decal and cap card height at 2.5 m.
- **Grass:** blade width ×1.25, LOD radius **22 m from the focus**, ground albedo under grass −10 % lightness.
  **Wheat** gets a trample field: within 1.4 m of her and up to 4 enemies the stalks bend outward and flatten to 40 %
  height within 0.9 m (a uniform array of 5).

---

## 5. Movement and pathfinding

### 5.1 Direct movement (WASD, sticks, the touch joystick)
- Screen-relative through `cam.stickYaw`. The §7.1 numbers are unchanged: walk 2.0 (stick ≤ 0.5), run 5.5,
  Zoomies 7.2.
- **Direct input always wins:** |move| ≥ 0.15 cancels any move, attack or use order at once (it does not cancel a
  swing that is already running, see §8.4).
- Touch joystick: **floating**, spawning at touch-down inside the left zone (§9.1). Radius **60 px** × touchSize,
  dead zone **0.10**, walk ≤ 0.5. If the thumb drags past 1.6 R, the base follows it (dynamic stick).
- Pad left stick dead zone 0.15 (unchanged).

### 5.2 Orders (point-and-go; `player/Orders.js`)
| Order | Source | Behaviour |
|---|---|---|
| `move(point)` | RMB on ground; tap on ground; Ctrl+RMB queues (max **4** waypoints, dotted lines) | Path, always **run** (Zoomies after 2.0 s as usual). Arrive tolerance **0.25 m**, intermediate **0.6 m**, slow-down inside **0.8 m**, corner look-ahead **0.6 m**, facing λ 16. |
| hold-to-follow | RMB held; touch long-press > **0.35 s** on ground | Re-target under the pointer every **0.1 s**: steer straight when `losWalkable`, else re-path (max **4 paths/s**). On release she walks on to the last point. |
| `attack(actor)` | RMB / tap on a hostile or a breakable; pad X with a selected target out of reach | Selects it (§7.4), paths to **reach = arc.range + target.radius − 0.25 m** (Snip 1.9), faces it, then follows `settings.autoAttack` (§8.3). Re-path when the target moves > **1.5 m**. Leash 16 m. |
| `attackMove(point)` | **X** then click (preset `moba`: **A** then click) | Path to the point; on the way, acquire the best hostile within **4.5 m of her** (§7.2 score), fight it, then resume. |
| `use(target)` | RMB or LMB on an interactable or NPC (LMB only when no hostile is alerted within 10 m: she never swings at friends); tap it | Path to `target.r − 0.3` (or an authored `usePos`), face it, call `levels.current.interact(id)` (the existing API). A cage with `hits` becomes `attack`. |
| `stop` | **H** (preset `moba`: also S); pad: none | Clears path, queue and order target. Does not cancel a swing, charge or Stand. |

**Unreachable:** a goal inside a collider, deep water or off the nav snaps to the nearest walkable cell within **4 m**.
Otherwise `partial: true`: walk to the nearest reachable point, show the grey ✕ marker, and play `ui/error` ("mrr?").
**Stuck:** < **0.3 m** of progress in **0.4 s** → re-plan; **3** failed re-plans → stop, grey marker.

**Interplay:** Tumble keeps a `move` order (it resumes after the roll) and drops `attack`/`use`. The **Stand plants
her**: it clears move orders (Standing Ground needs it) and pauses `attack`. Milk Break keeps walking the path at
1.1 m/s. Ability casts and Meow keep the order. Attack input (LMB / ⚔ / X) cancels a `move` order. A click is a
commitment (LoL): a **hurt stun pauses** every order (move / attackMove / use / attack / hold-to-follow while RMB or
the long-press is held) and it resumes when the stun ends, re-planned from wherever the knockback left her. Only a
**guard break** (attack orders wait it out), death, a `cutscene` / `dialog` mode or direct input clear orders.
**Links:** the run-up back-off before a too-close hop only goes to a spot on the surface she stands on (within
`stepUp`); the same take-off tried more than **3 + 1** times in one order (she keeps landing back before it) ends the
order with the grey ✕. A `use` / `attack` path that runs out short of reach re-plans once; running out again at the
same spot rejects it (grey ✕ + "mrr?"). **Attack-move arm** (X): Esc, direct input, leaving play or **4 s** with no
click disarm it; while armed the attack button fires it and a move click (RMB) is a plain move (diablo: LMB fires).

### 5.3 Nav grid (`physics/NavGrid.js` + `physics/Pathfind.js`, pure, node-testable)
| Param | Value |
|---|---|
| Cell | **0.5 m** on every quality tier (meadow 200 m → 400 × 400 = 160 k cells; `Uint8` flags + `Float32` height ≈ 0.8 MB) |
| Build | in `setLevel`, under the loading veil, **time-sliced 8 ms/frame**, target ≤ 0.8 s total on Iris Xe; emits `nav:ready` |
| Surface | `topAt(x, z)` (heightfield + walkable collider tops: caps, ledges, bridge, gate deck, stairs) |
| Blocked | normal.y < **0.7**; `isDeepWater`; out of bounds; static colliders **rasterised** by footprint expanded by the agent radius **0.32 + 0.08**, when the collider spans [surface + 0.3, surface + 1.0]. Colliders with `nav: false` are skipped; level `navBlock` rects add cosmetic no-go areas. |
| Walk edge | neighbour Δh ≤ **0.3 m** (diagonal ≤ 0.3 × √2, and both orthogonal neighbours walkable) |
| Auto links | **hop**: up 0.3–**1.1 m** within ≤ **2.4 m** horizontal; **drop**: down ≤ **3.0 m** (one-way); **gap**: ≤ **2.0 m** over blocked or deep cells; **fence**: a static whose top − ground ≤ **1.05 m** and thickness ≤ **0.8 m**; **bounce**: `bounce` caps up to **1.8 m**. Max one link per 1.5 m of boundary. Cost = length + **3 m**. |
| Authored links | `navLinks: [{ a: [x, z], b: [x, z], kind: 'hop'\|'drop'\|'bounce', when?: 'flag expr' }]` (`when` uses `state.cond`) |
| Dynamic | `addCollider` / `removeCollider` / `updateCollider` re-rasterise the AABB + agent radius (< 2 ms): arena fog walls (blocked while locked), the portcullis, Shield Wall, The Line barricades, broken boulders |
| Query | `findPath(from, to, opts, out)` → `{ points, links, partial }`: A* (octile, binary heap on typed arrays, ≤ **6000** expansions ≈ 1.5 ms; on overflow return a partial path to the best node), then string pulling with a grid DDA, ≤ **48** points; link points are `{ x, z, link, to }` |
| Also | `nearestWalkable(x, z, maxR)`, `navWalkable(x, z)`, `losWalkable(a, b)`, `nav.debugDraw()` (`?debug`) |
| Corridor check | any corridor narrower than **1.6 m** clear is logged with coordinates (world widens it) |

### 5.4 Jumps, links and assists
- **Path links:** within **0.6 m** of a link start and facing it within 35°, the follower jumps. **Assisted hop:**
  v_y = the normal jump v₀ (7.4), horizontal speed = distance / airtime, clamped to **5.5 m/s** (falls back to a
  plain jump if the clamp is hit). Drops just walk off. Bounce links land on the cap. Pounce never fires from an order.
- **Jump assist (direct control):** jumping toward a walkable top within **2.4 m** nudges the horizontal velocity
  (≤ **1.2 m/s**, ≤ **20°**) so she lands at least 0.3 m inside its edge. This makes the Mushroom Ring and Stump
  Crossing phone-playable.
- **Jump direction (F / A / Jump button):** along the path if an order is active, else the current velocity, else
  straight up (pug slam rings).
- **Readability:** a blob shadow under her at all times (0.55 m, darker as she rises) and a **landing ring** while
  she is airborne above 0.4 m. With Pounce ready in the air, a 0.9 m **dive circle** at the predicted dive point.
- **The fence lesson** (meadow practice field): the 1.0 m inner fence is a nav link with `when: 'tut.jump.done'`.
  Before the lesson a click past it paths to the fence and stops, and the prompt says "Jump the fence [F]".

### 5.5 Input buffering and timing (all in sim seconds)
| Input | Rule |
|---|---|
| Attack, Tumble | **0.20 s** buffer (`PLAYER.assist.buffer`, unchanged) |
| Jump | buffer **0.15**, coyote **0.12** (unchanged) |
| Combo | manual grace `comboGrace` **0.18**; auto-chain grace `autoComboGrace` **0.35** (unchanged) |
| **Stand / parry** | **never buffered** (honest timing). The press edge stays latched through hitstop (core rule). |
| Orders | a click or tap during a swing is **queued** and runs at the swing's first cancel point (§8.4); a newer click replaces it |
| Golden chord | Stand + attack within **0.1 s** (unchanged) |
| Touch tap → action | applied on the same fixed step as the `pointerup` (ui calls `input.addTap` / `setVirtual` synchronously) |
| Pick | the hover pick runs **at most once per rendered frame**; orders use the pick from the click's frame |

---

## 6. Input (core `Input.js`) and action mapping

### 6.1 Core input changes
- **No pointer lock** in play or menus (`pointerLockEnabled = false` unless `?cam=classic`). Esc pauses directly;
  the lock-loss → pause dance is removed. Photo Mode [STRETCH] may still request a lock.
- `input.pointer = { x, y, ndcX, ndcY, inside, movedPx, speed, lastMoveT }` (CSS px).
- `input.takeClick()` → the next `{ button, x, y, down, t, mods: { ctrl, shift, alt } }` edge from a queue of 8.
- `input.addTap(x, y, kind)` (`kind`: `tap | long | longEnd`) for ui touch; `input.addZoom(k)` / `consumeZoom()`;
  `input.aimStick {x, y}` (pad RS, dead zone 0.25); `input.setVirtualAim(x, y, active)` (touch drag-aim vector).
- `input.haptic(kind)` routes to `navigator.vibrate` (touch) or the existing `rumble` (pad), scaled by
  `settings.haptics` (§10.6).
- **Presets** (§6.2): `INPUT.presets[name]` = a `keys` table merged over `INPUT.keys`, then
  `settings.bindings` (an `{action: [codes]}` override) on top. `input.preset` holds the active name;
  `input:scheme {preset}` fires on change.
- `consumeLook()` returns zeros in iso (kept for presets, classic and Photo Mode).
- New actions: `move` `attackMove` `stop` `zoomIn` `zoomOut` `peek` `camLock` `centre` `ranges`. Existing names are
  kept (`lockon` = select/cycle, `lockPrev`/`lockNext` = cycle, `recenter` = unused in iso).
- Mouse activity counts toward `idleTime` only above **24 px/s**.

### 6.2 Keyboard and mouse: preset **`hybrid` (default)**
**TT3 change (2026-10-14, docs/TOKENTAILS-PLAN.md §11.2).** The default moved to the common action-game convention.
Why: the old table put the Stand on Space, jump on F and move orders on RMB, and it used Ctrl (ranges, queue) and Alt
(peek). Ctrl held with WASD gives Ctrl+W, which closes the tab and cannot be blocked, and Ctrl+D bookmarks. Alt+Left
goes back in history, F1 opens browser help, and Space + LMB fired Golden Hour by accident. Now no binding uses Ctrl,
Alt, Meta or an F-key, `Input.js` ignores any keydown that carries Ctrl or Meta, and click-to-move lives in the
`moba`, `diablo` and `mouseOnly` presets. The old table is kept below the new one for reference.

| Action | Binding | Behaviour |
|---|---|---|
| Move (direct) | **WASD** / arrows | screen-relative; overrides any order |
| Attack / combo | **LMB**, J | toward the **cursor** (§7.1); each press is the next combo step |
| Attack order | **LMB on a hostile** | selects it, walks into reach, chains per `settings.autoAttack`; the press swings only in reach |
| Charge → Swoosh / Bright / Holy | hold **LMB** | she turns to the cursor at **540°/s**; the reach wedge shows (§7.3) |
| **Stand** (hold) / parry | **RMB**, Q, L | threat snap on press (§8.1); RMB over the HUD (Pearl's bubble, toasts) still stands |
| Tumble; hold = sprint | **Shift**, K, Mouse3 | the `dodge` key still held 0.18 s after the Tumble starts = `sprint` (Zoomies speed at once) |
| Jump | **Space** | in the air + LMB = Pounce |
| Interact / confirm | **E**, Enter | |
| Paw Trick | **F** (tap = cast, hold = aim); **1 / 2 / 3** pick one | §11.3 of the TT plan |
| Kitten ability | **G** | quick cast at the cursor; hold shows the indicator, release casts (§7.5) |
| Golden Hour | **V**, or Stand + Attack within 0.1 s at Valor 100 | the chord is derived in `Input.js` (`golden`) |
| Milk Break / Meow | **R** / **C** | |
| Select / cycle target | LMB on a hostile; **Tab**; Shift+Tab back (`lockPrev`) | §7.4 |
| Attack-move / Stop | **X** then click / **H** | |
| Peek + show ranges | hold **Z** or MMB | one hold: §2.3 peek and the AA / Stand / ability ranges |
| Zoom / camera lock / centre | wheel / **Y** / **Home** | |
| Pause / hold to skip | Esc, P (hold P skips like hold Esc; Esc in fullscreen leaves fullscreen first) | |

Rebinding (Pause → Controls): 13 actions (attack, guard, jump, dodge, interact, trick, ability, milk, meow, golden,
peek, lockon, pause), keyboard and mouse only; "Press a key" capture; a key another action used is swapped; Ctrl,
Alt, Meta, the F-keys and Esc are refused (Esc always pauses), so are the walking keys while WASD walks; "Reset keys to
default". `SaveManager.cleanBindings` also drops modifier and F-key codes from a save.

**Other KBM presets** (Settings → Controls; each is only a binding table plus two flags, `wasd` and `lmbMoves`):
| Preset | Differences from `hybrid` |
|---|---|
| `moba` (LoL classic) | `wasd: false`. **RMB** = move / attack order / use, **Shift+RMB** queues; Stand Q / L; **Space** = Tumble, **T** = Jump; **A** + click = attack-move, **S** = stop, **H** = hold, **D** = Milk. |
| `diablo` | `lmbMoves: true`: LMB = move / attack order / use; **RMB** / Q / L = Stand; **Space** = Tumble; **T** = Jump; WASD on |
| `mouseOnly` | RMB move / attack order; LMB attack at the cursor; **Mouse4** / Q / L Stand; **Mouse3** / K / Shift Tumble; **MMB click** or Space Jump; Z peek |
| `keyboardOnly` | WASD move; J attack; L / Q Stand; K / Shift Tumble; **Space** Jump; E interact; F / G / R / C / V as `hybrid` |

Before TT3 (kept for reference): RMB moved (Ctrl+RMB queued), Space / L / Mouse4 stood, F jumped, Q cast the kitten,
hold Ctrl showed ranges, hold Alt peeked, F1 centred.

### 6.3 Gamepad (twin-stick; standard mapping indices)
| Action | Button |
|---|---|
| Move | Left stick (screen-relative) |
| **Aim** | **Right stick** (dead zone 0.25): a ground reticle up to **6 m** from her (radius ∝ deflection, λ 12), hidden 1.0 s after release |
| Attack / charge | X (2) |
| Stand / parry | **LB (4)**, RB (5) (TT3) |
| Tumble | B (1): LS, else RS, else facing |
| Jump / Pounce | A (0) |
| Interact | Y (3) |
| Select nearest / clear | **R3 (11)** (TT3; RB is the Stand); D-pad ← → (14 / 15) cycle |
| Kitten ability | LT (6): tap = smart cast; hold = aim with RS, release casts |
| Golden Hour | LB / RB + X within 0.1 s (TT3; RT is the Paw Trick) |
| Paw Trick | **RT (7)**: tap = cast, hold = aim with RS; hold RT + D-pad ← → ↑ picks trick 1 / 2 / 3 |
| Milk | D-pad ↑ (12) |
| Peek | hold D-pad ↓ (13) + RS |
| Meow | L3 (10) |
| Zoom | **View (8)**: 0.80 / 1.00 / 1.25 (TT3; it was R3) |
| Pause / hold to skip | Start (9) |
| Controls card | Pause menu → Controls (TT3; View zooms now) |

### 6.4 Touch (§9 has the geometry)
| Action | Touch |
|---|---|
| Move | floating joystick (left zone), or **tap ground** (path), long-press = follow |
| Attack | **⚔** tap (auto-target §7.2; auto-combo taps); tap an enemy = select + attack order |
| Charge | hold ⚔ (ring fills, gold at tier 2); **drag ≥ 16 px** while holding = aim; release fires; drag onto ✕ cancels |
| Stand / parry | hold **🛡**: auto-faces the soonest wind-up within 6 m, else the selected target, else the stick; the stick strafes without turning; guard arc **±90°** |
| Tumble | **Tumble** fires on press (stick, else away from the soonest threat, else facing); dragging ≥ 16 px within the first **0.08 s** steers it once; **swipe** on the free right area (§9.3) = tumble that way |
| Jump / Pounce | **Jump**; ⚔ in the air = Pounce (auto-aims crows within a 3 m disc) |
| Interact | tap the thing (path + use), or the contextual **!** |
| Kitten ability | portrait button: tap = smart cast; drag = aim; ✕ cancels |
| Golden Hour | gold button (shown at Valor 100 + Shard 2), or 🛡 + ⚔ together |
| Milk / Meow | buttons |
| Select | tap an enemy; tap it again or tap empty ground to clear |
| Zoom | pinch on free area; two-finger double-tap resets |
| Pause / hold to skip | ❚❚ (hold 1 s) |

---

## 7. Targeting, aiming and indicators

### 7.1 One aim resolver (`player/Aim.js`, pure, unit-tested)
`resolveAim(kind, s, out)` → `{ dir, point, target, source }`. Every directional verb uses it: swings, charge
release, Pounce dive, Tumble, Stand facing and abilities. Precedence:
1. **Riposte** target (within `riposteWindow`, `riposteRange`) for attack kinds.
2. **Explicit aim:** a touch drag on the button (`setVirtualAim`), or the pad RS past 0.35.
3. **Cursor** (KBM, pointer moved within the last **3 s**): the direction to `cam.cursorGround`.
4. **Selected target** if alive and within the action's range + **1.5 m**.
5. **Soft auto-target** (§7.2) (touch, pad, keyboard-only).
6. **Movement** (stick or WASD past 0.3).
7. **Facing.**

**Magnet** on the first active frame (`onActiveStart`): turn fully to the best hostile inside a cone around the
resolved `dir`. KBM **±25°**, range + **1.0 m** (the selected target: ±40°). Pad with RS **±45°**, 3.5 m. Touch and
auto **±90°**, **4.5 m**; with the stick idle the auto-target is picked from 360°. A swing released with an **explicit aim** (touch drag / RS: `swing.aimSource = 'explicit'`) always uses the pad-RS cone (±45°, 3.5 m) around that aim, never 360°. This replaces §7.2's 60° / 3 m
cone around facing.

**Lunge magnetism** (touch, pad and auto-target only): if the target is beyond range, lunge =
`clamp(dist − 0.7 × range, lunge, lunge + 1.0)` m.

### 7.2 Soft auto-target score (lower wins; `combat.assistTarget` implements it and returns the breakdown)
```
score = dist
      + 2.0 · (|angle to (stick dir, else facing)| / π)
      − 2.5 · (winding up on her: token holder with a live parry/gold/red telegraph)
      − 1.0 · (is the selected target)
      − 0.8 · (hp < 30 %)
      − 0.5 · (hit her within the last 2 s)
      + 3.0 · (breakable: rope post, cage, crate, cracked boulder; `assistable`)
```
Candidates: hostile, alive, `hurtable !== false`, not hidden, within **4.5 m** touch / **3.5 m** pad / **3 m**
keyboard-only. Crows only when below `hittableBelow` 2.2 m. Breakables only when there is no hostile within 6 m.
**Sticky:** keep the current auto-target unless a challenger is better by **0.75**, so a combo never ping-pongs.
This ordering is the Wild Rift attack-button priority: wind-up on me → current → low HP → nearest → breakables.

### 7.3 Ground indicators (fx, one decal pool)
| Indicator | Spec |
|---|---|
| **Aim ring / hero ring** | r **0.75 m** pink-silver rim, 0.40 alpha, `depthTest: false`, with a 15° **notch** pointing along the current aim |
| Stand fan | while the Stand is held: the ring's front **±70°** (touch ±90°) lit silver at 0.6; 3 Grit notches; cracked and dim at 0 Grit; **flashes gold for the parry window** (0.15 s after the press); greys for the 0.30 s whiff lockout |
| Charge reach | > 0.35 s: slash3 2.3 m ±97° → tier 1 Bright 2.6 m ±92° (silver) → tier 2 Holy 3.6 m circle (gold) + the **10 × 2.4 m** holyWave lane with Shard 2; the fizzle greys the gold preview |
| Riposte ready | a gold arrow from her to the parried enemy for 0.8 s |
| Golden Hour | an 8 × 1.2 m gleam lane flash on each slash (0.2 s) |
| Airborne | blob shadow, landing ring, Pounce dive circle (§5.4) |
| Contact blobs | under every actor, r = radius × 1.1, 0.35 alpha (Low: her and engaged enemies) |
| Ranges (Ctrl) | AA reach 1.9 m ring, Stand fan, ability range rings |

### 7.4 Selection (it replaces lock-on; `cam.lockTarget` / `lock()` / `unlock()` / `switchLock()` stay as its store)
- Select: LMB or RMB on a hostile, tap, Tab, RB, D-pad. The camera never moves for a selection.
- Shows a **gold rotating ground ring** (1.2 × radius, 0.5 rev/s) that turns red during the target's wind-up, plus
  its world HP bar (§10.4).
- Breaks at **16 m**, after 1.5 s without line of sight, on a re-tap, or on a tap on empty ground (touch). On death it
  hands over to the best engaged enemy within 6 m.
- Hover (desktop): a 2 px ring, red `#FF6A3D` on enemies, gold `#FFD34D` on interactables and pickups, white on NPCs
  and kittens, plus `characters.setHighlight`.

### 7.5 Ability aim (companions)
| Ability | Smart cast (tap / quick) | Aimed (hold or drag) | Indicator |
|---|---|---|---|
| Mochi **Shield Wall** | between her and the centroid of engaged enemies within 6 m, else facing | 1.5 m along the aim | 3.0 × 0.4 m rect |
| Sage **Volley** | 5 arrows over the ≤ 3 best targets within 14 m (the selected target gets 2) | targets nearest the aim point | 14 m range ring + pips on the chosen targets |
| Clover **Purr** | self | self | soft green ring |
Cast modes (`settings.castMode`): `smart` (default: tap casts, drag/hold aims), `indicator` (press shows, release
casts), `dragOnly`. ✕ or Esc or RMB cancels.

### 7.6 Picking (camera `Picker.js`)
- `cam.screenToGround(x, y, out)`: `physics.raycast` (terrain + mesh + walkable static tops); falls back to the
  plane at her ground y. `cam.cursorGround` / `cursorValid` are cached once per frame.
- `cam.pick(x, y, opts)` → `{ kind: 'enemy'|'breakable'|'interact'|'npc'|'pickup'|'ground', actor?, id?, point }`.
  An actor is hit when its projected capsule axis is within **max(28 px, projected radius + 6 px)** of the pointer
  (mouse; **56 px** × touchSize on touch), or the ray hits its capsule. Crows are also picked at their shadow decal.
  Priority: enemy > breakable > interact / NPC > pickup > ground; ties → nearest on screen, then nearest to her.
- `pickTapTarget` (ui) becomes a thin wrapper over `cam.pick`.

---

## 8. Combat rules under the new controls

### 8.1 Stand assists (player)
- **Threat snap on press:** on the Stand's first step, if a hostile with a live `parry`/`gold` telegraph (or an
  incoming projectile) is within **5 m** and lands within **0.7 s**, set facing to it immediately. Ties: soonest, then
  nearest. Otherwise face the resolved aim. (Player runs before combat in the fixed step, so the snap counts in the
  same step.)
- While held: KBM faces the cursor at 360°/s only after the cursor moves **≥ 30 px**. Pad: RS, else LS. Touch: keeps
  auto-facing the soonest threat (`settings.standAutoFace`, default on; desktop users may turn it off).
- Guard arc ±70° (KBM, pad), **±90° on touch** (`PLAYER.guard.touchArc` 1.5708). Parry windows unchanged (0.15 /
  0.25 Kitten / +0.05 touch). The whiff lockout is unchanged.
- **Auto-Riposte** (`settings.autoRiposte`, `auto` = on for touch, off otherwise): fires 0.15 s after a parry when
  the parried enemy is within 4 m.

### 8.2 Parry readability from above (fx draws; enemies/combat supply the data)
1. **Strike wedge** for every melee wind-up (`parry`, `gold`, `red`, `grab`): the attack's own arc
   (`ATTACKS[id].arc.range/from/to`; lanes for lunges) drawn from the attacker. A 2 px rim at 0.8 alpha and a fill
   that sweeps outward over the wind-up. It **tracks the attacker's facing until 0.15 s before `activeAt`, then
   freezes** (a fair dodge read). At **parry-window open** (`activeAt − window`) the rim flashes and thickens to
   **4 px**, the visual twin of the "ting". White = parry; gold = gold rim + an 8-point star at the tip; **red =
   filled 0.35 alpha** with a jagged rim (filled means "don't be here"); purple = grab. Rim 0.12 m minimum world width.
2. **Parry ring** (`settings.parryRing`: `auto` = on for touch and Kitten difficulty, off otherwise; `on`; `off`):
   for the **single most imminent parryable attack on her** (`combat.nextParryable(player)`), a ring centred on her
   starts at **r 2.2 m** at max(wind-up start, `activeAt` − 0.6 s) and shrinks linearly to her radius (0.45 m) exactly
   at `activeAt`. The **parry window is drawn as a brighter band** at the end of the shrink. A small tick on the ring
   points at the attacker. Gold for gold kinds. Red attacks get **no ring**: a pulsing red "!!" dodge chevron instead.
3. **Glints and "!"** at a **constant screen size**: glint **28 px** (gold 34 px), "!"/"!!" **34 px**, at head
   + 0.5 m, `depthTest: false`, renderOrder 10; strike flash ×1.6.
4. **Ranged aim lines** on the ground (y + 0.05), dotted, the full projected path up to 12 m; solid white once they
   stop tracking 0.2 s before the shot. Bolts get a 0.15 m ground shadow dot; reflected bolts trail gold.
5. `aoe` and `shadow` decals: unchanged shape, rim 0.12 m.
6. **Aggro rings:** alerted enemies get a thin red ground ring (0.08 m, 0.35 alpha). Idle and patrolling ones none.
7. **Jeer:** add a faint purple ground disc of radius r.
8. **Her feedback:** parry = gold ground spark ring + punch-in (§2.4) + the Stand slot flashes; block = white spark +
   Grit pip flash.

### 8.3 Attack orders and auto-chain (`settings.autoAttack`)
| Value | Behaviour after an `attack` order reaches its target | Default |
|---|---|---|
| `chain` | one Snip → Snap → Swoosh string (auto grace 0.35 s), then the order ends (click again) | — |
| `loop` | keep chaining strings (0.10 s rest between strings) while the target lives and no other order or direct input arrives (LoL auto-attack) | **every device** (value `auto`) |
| `off` | approach and face only | — |
Manual LMB / ⚔ / X presses during a chain take over (the next press is the next step; the DPS check of 40 dmg in
≈ 1.4 s holds either way). Auto-chain stops on the Stand, Tumble, Jump, any other order or direct input.

### 8.4 Cancel rules (purist, constrained to keep WASD combat intact)
- A **new move order** (click or tap on ground) during a swing's wind-up (t < `active[0]`) **cancels the swing**: no
  damage, no Valor, the combo resets. During the active frames it is queued. During recovery it applies from
  `active[1] + 0.05 s`.
- **WASD / stick never cancels a wind-up or active frames** (players hold movement while attacking). Movement input
  does cut recovery from `active[1] + 0.05 s`.
- `slash3.rollCancel` 0.32 and Tumble's recovery cancel are unchanged.

### 8.5 Enemy rules (enemies)
- **No off-screen snipes:** a ranged wind-up (`aim`) may start only if the shooter is inside the frustum shrunk by
  0.5 m (`cam.onScreen(pos, 0.5)`) **or** within **9 m** of her. `rat_xbow.keep` **[6, 9]** (hop-back stays). Crows
  dive only on screen.
- **Telegraph payload** (additive JSDoc on `combat:telegraph`): `attackId`, `arc`, `range`, `windup` (after the
  difficulty multiplier), `activeAt` (absolute `game.time`), `targetsPlayer`.
- **Spawn audit (world + enemies):** no spawn or wave point within **6 m down-screen** (camera side) of a trigger or
  arena entry point; at most one wave spawn off screen at a time at the default zoom.
- Off-screen alerts still emit the existing alert event; ui shows an edge ping.
- Optional later: chase via `physics.findPath` when the straight line is blocked.

---

## 9. Touch UI (ui `touch.js` rewrite + pure `touchLayout.js`)

### 9.1 Zones (landscape, reference 844 × 390 CSS px; respect `env(safe-area-inset-*)`)
| Zone | Area |
|---|---|
| Joystick | left **42 %** of the width × bottom **80 %** of the height |
| HUD strip | top **18 %** (no taps pass through HUD elements) |
| Cluster | the buttons below plus a **dead ring 40 px** around each button edge (taps there do nothing) |
| Free area | everything else: tap / long-press / swipe / pinch (§9.3) |
| Portrait | joystick = bottom **38 %** × left **55 %**; cluster in the bottom-right; HUD = a condensed top strip (hearts, Valor, lives in one row; fish and kittens on the right) |

### 9.2 Cluster geometry (CSS px × `settings.touchSize` 0.8–1.4; **every button ≥ 56 px** after scaling, clamped)
Positions are centre offsets from the ⚔ centre (y negative = up). The ⚔ centre is **68 px** from the right and bottom
safe edges (≈ 8.1 % / 17.4 % of 844 × 390).

| Button | Size | Offset (dx, dy) | ≈ % of viewport (from right, from bottom) | Notes |
|---|---|---|---|---|
| ⚔ Attack | **96** | (0, 0) | 8.1 %, 17.4 % | tap, hold = charge, drag = aim |
| 🛡 Stand | **76** | (−124, +4) | 22.7 %, 16.4 % | directly left, where the thumb rolls |
| Tumble | 64 | (−100, −92) | 19.9 %, 41.0 % | press fires; drag steers within 0.08 s |
| Jump | 64 | (0, −124) | 8.1 %, 49.2 % | |
| Ability (portrait) | 64 | (−196, −128) | 31.3 %, 50.3 % | cooldown sweep + seconds, "zzz" |
| Golden Hour | 64 | (−96, −204) | 19.4 %, 69.7 % | hidden until ready; pulses |
| Milk | 56 | (+16, −206) | 6.2 %, 70.3 % | ×count; its top edge stays below the 18 % HUD strip |
| Meow | 56 | (−300, −60) | 43.6 %, 32.8 % | |
| "!" Interact | 64 | (−214, 0) | 33.4 %, 17.4 % | on `interact:available` |
| ❚❚ Pause | 56 | top centre | 50 %, top 8 px | hold 1 s = skip |
| ✕ Cancel chip | 72 | top-right, below the HUD | — | only while aiming |

All pairs keep ≥ 8 px between hit areas at touchSize 0.8–1.4 (unit test in `ui.test.js`). Portrait: ×0.85 with
the ≥ 56 px clamp (⚔ 84). Options: **left-handed mirror**, **button opacity** 40–100 % (default 85 %),
**Edit layout** (drag buttons; `settings.touchLayout`), touch size.

### 9.3 Free-area gestures (strict thresholds, each with a setting)
| Gesture | Recognised when | Result | Setting |
|---|---|---|---|
| Tap | ≤ **250 ms**, ≤ **12 px** travel, single pointer, starts in the free area, and **≥ 0.3 s after** any cluster button was released | `cam.pick`: enemy → select + attack order; object/NPC → use; ground → move | `tapToMove` (default on); off = taps only select and use |
| Long-press | ≥ **0.35 s**, ≤ 12 px | hold-to-follow (§5.2) until release | same |
| Swipe | ≥ **48 px** in ≤ **150 ms**, starts in the free area outside the dead rings | Tumble in the swipe's world direction | `swipeTumble` (default on) |
| Pinch | two pointers, both in the free area | zoom | — |
| Right-side look-drag | **removed** | | |

### 9.4 Drag-to-aim
Pressing ⚔, Ability or Tumble shows a 96 px translucent aim pad. Release within **16 px** = smart cast. A drag of
≥ 16 px aims: the vector maps to a world direction through the camera yaw; magnitude ÷ 90 px maps to range for
point-targeted abilities. The fx indicator updates live. Release over ✕, or a drag back inside 16 px for abilities,
cancels.

### 9.5 Orientation
Landscape is recommended. The blocking rotate card becomes a **one-time toast** (`tut.rotate`). Portrait is fully
supported (§2.1, §9.1).

---

## 10. Desktop and shared UI

### 10.1 LoL-style ability bar (`ui/abilityBar.js`; desktop and pad; hidden on touch, where the cluster shows the same states)
Bottom centre, parchment and gold. Slots **56 px**, gap 8 px (48 px slots under 900 px width; never below 48 on
desktop). Key glyphs in the lower-right corner follow the preset and device (pad glyphs on pad).

`[Space Stand + 3 Grit pips] [Shift Tumble] [F Jump] [Q Kitten portrait] [V Golden Hour] | [R Milk ×n] [C Meow] [E Interact]`

- **Cooldowns:** a clockwise dark sweep (55 % overlay, conic-gradient mask, 30 Hz) plus whole seconds when ≥ 1 s
  is left (Fredoka 700 with an ink outline); a white "ready" flash and a soft tick (`ui/glass_001` at −20 dB) for
  cooldowns ≥ 2 s.
- Tumble 0.2 s; Meow 1.0 s; Kitten 18 / 14 / 30 s (Mochi / Sage / Clover) with "zzz" while napping.
- **Locked states:** desaturated with a lock pip. Golden: the frame fills with Valor, gold with sparkles at 100 +
  Shard 2. A **Holy pip** beside the Stand slot lights at Valor ≥ 50 with Shard 1.
- Stand slot: a gold flash on parry, cracked at 0 Grit. Interact: lit only while `interact:available`.
- Hover a slot for a parchment tooltip with the move's one-line rule. In `mouseOnly`, clicking a slot fires it.
- The **companion portrait** moves from bottom-right into the Q slot; **Milk** moves from bottom-left into the bar.
- Data: `player.abilityState(out)` → `{ dodgeCd, meowCd, milk, milkMax, golden: 0..1, goldenReady, holyReady,
  grit, gritMax, guard, interact }` and `companions.cooldownLeft(id)`, `readiness(id)`.

### 10.2 Cursors (`ui/cursor.js`; CSS cursors 32 px, ×1.5 and ×2 sizes, high-contrast variant)
Default gauntlet paw (pink bow ribbon on the cuff); **sword** over an enemy (red); **paw + wax seal** over an
interactable, NPC or cage; **sparkle paw** over a pickup; **sword + arrow** while attack-move is armed; **ring
reticle** while an indicator is open; **grey paw ✕** over unreachable ground (partial path with a gap > 2 m); the
plain arrow in menus. Hidden in cutscenes and Meme Cam. ui sets a class on `#game` from `player.hover.kind`.

### 10.3 Order markers (fx decals)
Move: a pink paw-print ripple (scale 0 → 1 in 0.12 s, fades in 0.6 s, 1.0 m). Attack: red-orange ring under the
target. Use: gold. Queued: small dots and dotted lines. Unreachable: grey ✕ paw. While RMB is held: 3 dots along the
next path segment. `settings.pathPreview` (off) shows faint paws every 1.2 m along the whole path.

### 10.4 World-space UI
- **Enemy HP bars:** a 36 × 5 px pill (touch 44 × 6) at y + height + 0.3 m, shown when damaged, selected or
  hovered, fading 3 s after the last hit. Pool of 12. Bosses keep the top bar.
- Interaction tags: on hover (desktop) or within 6 m (touch), with the device glyph ("Tap" / "E" / "Y").
- Damage numbers: rise 0.6 m, scaled with the camera distance, minimum 18 px.
- **Removed:** the centre-screen lock-on reticle DOM (ground rings replace it).
- **Off-screen threat arrows:** only for telegraphs within 15 m whose actor is off screen or hidden by an occluder.

### 10.5 HUD (§14.2 as amended)
Top-left portrait, hearts, Grit, Valor sword and lives are unchanged. Top-right fish / kittens / letter unchanged.
Bottom-left Milk and bottom-right companion portrait → the ability bar (desktop/pad) or the cluster (touch).
A small Grit arc above her head while guarding and the charge ring around her (world space) keep the eye on her.

### 10.6 Haptics (`input.haptic(kind)`; touch `navigator.vibrate` (Android; iOS degrades silently); pad `rumble`)
| Kind | ms | Kind | ms |
|---|---|---|---|
| `button` (⚔/🛡/Tumble press; `settings.hapticTaps`, default off) | 8 | `guardBreak` | [40, 40, 40] |
| `hitHeavy` | 12 | `hurt` | 55 |
| `parry` | [18, 30, 36] | `holy` / `golden` | 70 / 110 |
| `perfectDodge` | 25 | `kitten` | [15, 60, 15] |
| `block` | 10 | `orderRejected` | [10, 40, 10] |
Scaled by `settings.haptics` (0 / 0.5 / 1; default 1 on touch). Never in menus. Every haptic has a visual or audio twin.

### 10.7 Settings (ui panel; save defaults; `settings:changed`)
`controlPreset` ('hybrid'), `bindings` ({}), `camZoom` (1.0), `camLock` (true), `edgePanSpeed` (1),
`autoAttack` ('auto'), `tapToMove` (true), `swipeTumble` (true), `castMode` ('smart'), `parryRing` ('auto'),
`autoRiposte` ('auto'), `standAutoFace` (true), `haptics` (1), `hapticTaps` (false), `leftHanded` (false),
`buttonOpacity` (0.85), `touchLayout` (null), `reduceCameraMotion` (false), `cursorSize` (1), `cursorContrast`
(false), `pathPreview` (false). `sensitivity` is reused as pad aim sensitivity; `invertY` stays in the save but is
hidden in iso (shown with `?cam=classic`). Controls card: one page per preset / pad / touch.

---

## 11. Level and design changes (world, with physics, enemies and story)

| Level / item | Change |
|---|---|
| All levels | `cam: { yaw, fog? }`; ≤ 3 zone hints; `navLinks`, `navBlock`; `nav: false` on non-blocking colliders; `camFade: 'roof'` on roofs; crown/trunk split (`camFadeIds`); `assistable` on rope posts, crates, cracked boulders, cages; `interactables` list exposed (§12 world); one `memeSpot`; spawn audit (§8.5) |
| **Camera-side clutter audit** | any prop taller than **2.2 m** within **6 m south (camera side)** of the spine or an arena centre must be `fade: true` / `camFade`, or move |
| meadow (yaw π) | Practice field hint dist 12 (tutorial readability). Standing Stones and Glade: dist 15. Old Bridge: dist 15. Crow Fields: dist 15, wheat trample. Fence link gated on `tut.jump.done`. |
| forest (yaw π, the spine runs north) | **Mushroom Ring**: hint yaw toward the spiral's open side, pitch 44°, dist 11, clear 7; bounce caps 2 and 4 get an up-arrow glyph. **Treetop**: side-view hint pitch 38°, dist 10, authored `hop` links (y 0.75 intermediate step for the 1.5 m ledge) so tapping Sage's cage climbs. **Stump Crossing**: authored `hop` links over the 6 stumps. Spider Hollow: dist 12. B1 Cheese Mill: boss fit; the 6 pillars `camFade: 'solid'`. |
| town (yaw π, the Castle Steps are north) | **Lantern Alley** and the **Post Office chase**: ≤ 2 yaw hints along the alley legs. Streets ≥ **3.0 m**; no building taller than **5 m** directly south of a 90° bend; lanterns `camFade`; Waffles' crate balcony `hop` links. Square: dist 16. Hub: dist 15. Castle Steps: verify stair nav (steps ≤ 0.3 m). |
| gate (yaw **0**: the causeway runs toward −z, so screen-up = onward) | The Line: dist 17, pitch 56°, the winch as a framing anchor, spawns spread so ≤ 1 is off screen at zoom 14. B2: along the causeway, boss fit. Ballista raft: dist 14. Ledge stair z −53…−50: verify walkable. |
| bog / keep (M3) | Author with these rules from day one; keep rampart climb uses a Treetop-style side hint + links |
| Ledge readability | walkable collider tops get a 6 cm lighter lip and an AO band beneath (art pass) |
| Pickups | **fish magnet 2 → 3 m** (`ECONOMY.fish.magnet`), small hearts **3 → 3.5 m**; letters and Heart Bells stay deliberate (click or walk over) |
| Vigil Stones, cages, Quest Board, stations | pick radius ≥ 1.2 m so a tap on the general shape works |

---

## 12. Per-area task list (ownership per GAME_DESIGN §19.2; ports per CONTRIBUTING §2)

Phases: **P0** core contracts → **P1** camera + fog + direct control (playable on desktop and pad, with direct-line
click-move) → **P2** nav + orders + touch → **P3** readability (fx, combat, enemies, ui bar) → **P4** world audit,
story, audio, characters, Meme, save. Every area codes **defensively** against P0 names that have not landed
(`ctx.cam.pick?.(…)`, `config.CAMERA.iso ?? FALLBACK`). Each step must keep `slice:meadow` and `flow:*` green.

### core (`src/core/**`, `tests/smoke.mjs`, contracts tests) — port 5301 — P0
1. `config.js`: add `CAMERA.iso`, `NAV`, `AIM`, `INPUT.presets`, `INPUT.pointer`, `TOUCH`, `HAPTICS` (§13);
   `PLAYER.guard.touchArc`; `PLAYER.assist` keys `kbmCone, kbmExtra, selCone, padCone, padRange, touchRange
   (4 → 4.5), sticky, lungeExtra`; `ECONOMY.fish.magnet` 3, `PLAYER.smallHeart.magnet` 3.5; `PLAYER.memeCam.blendOut`
   0.9; `CAMERA.treeFadeOpacity` 0.22. New default bindings in `INPUT.keys`/`INPUT.pad` per §6.2/6.3 (jump → KeyF,
   guard → Space/KeyL/Mouse4, dodge + Mouse3, Mouse2 → `move`, Mouse1 → `peek`, wheel → zoom, pad 11 → zoom, 8 →
   controls, 13 → peek). Keep `J/K/L` aliases.
2. `Input.js`: §6.1 in full (no pointer lock in iso, pointer, click queue with mods, `addTap`, `addZoom` /
   `consumeZoom`, `aimStick`, `setVirtualAim`, presets + bindings merge, `haptic`, mouse speed threshold).
   `?cam=classic` restores the old binding table and pointer lock.
3. `events.js` (additive): `PLAYER_ORDER 'player:order' {kind, point, target, valid, queued}`, `TARGET_CHANGED
   'target:changed' {actor, prev, source}`, `CAM_ZOOM 'camera:zoom' {dist, mul}`, `INPUT_SCHEME 'input:scheme'
   {preset}`, `NAV_READY 'nav:ready' {level, cells, links, ms}`. JSDoc only: `combat:telegraph` gains `attackId, arc,
   range, windup, activeAt, targetsPlayer`.
4. `GameState.settings` defaults (§10.7). `params.cam` (`'iso'|'classic'`).
5. `debug.js` hooks: `__GAME__.click(x, z, button = 'right', mods)` (an order at a world point, through the real
   pick path), `tapAt(x, z)`, `aimAt(x, z)`, `order(kind, point|id)`, `cam.iso()` → `{yaw, pitch, dist, focus,
   catPx}`, `fogAt(x, z)` → the final fog factor, `nav.path(ax, az, bx, bz)`, `cam.zoom(mul)`.
6. Smoke harness: `t.click(x, z, button)`, `t.tap(x, z)` (synthetic touch pointer at the projected point),
   `t.viewport(w, h, {touch})`. `t.hold('KeyW')` stays = screen-up (= +Z at yaw π).
7. `Game.js`: Esc → pause directly in iso. Contracts tests for the new config tables and hooks.
8. Integration: audit the 26 `hold('Key…')` smoke uses and the `Space`/`Mouse2` taps (jump is now F, the Stand
   Space); replace camera-relative approaches with `t.click` or `teleport`.

### camera (`src/camera/**`) — port 5312 — P1 (Picker in P1, rest P1–P4)
1. New pure `IsoRig.js` (pitch curve, cat-size clamp, width fit, lead, combat bias + zoom-out, boss fit, crane-arc
   interpolation) with unit tests. `FollowCamera` runs it for `follow`/`lock`/`boss`; the orbit, spring arm,
   auto-follow, shoulder and LOCK_SEP code is kept only for `preset` rails and `?cam=classic`.
2. API (additive): `focus` (Vector3, read-only), `stickYaw`, `yaw` (still readable = the iso yaw), `pitch`,
   `distance`, `zoom(mul)`, `setHint({yaw, pitch, dist, clear}, blend)`, `screenToGround`, `cursorGround`,
   `cursorValid`, `worldToScreen(p, out)`, `onScreen(p, margin)`, `pick(x, y, opts)`, `iso()`; `mode('lock')`
   only sets `lockTarget` (no swing).
3. `setViewOffset` framing per orientation; re-fit on resize (0.4 s); zone hints from `levels.current.zoneAt(pos).cam`
   (out of combat only); camera lock, edge pan, MMB pan, leash, centre, peek (§2.3); framings table §2.4.
4. `Occluders.js`: multi-target capsules, dithered fade (alpha-hash uniform patched via the existing material hook),
   `'roof'` and crown-only rules, 0.22 opacity (§3). X-ray pass using `characters.getSilhouetteProxy()`.
5. `CameraShake.js` iso mix (§2.5). `CutsceneCamera`: crane-arc in/out and the 1.0 s hand-back with the veil cut
   rule. `MemeCam.js`: the Descent and `memeSpot` yaw, 0.9 s exit, 40 px exit threshold.
6. Every render: `env.setFocusFog({focus, mode, clear})`; shadow-centre handoff (`env` reads `cam.focus`); far 90.
7. `LockOn.js` → selection store only; its 3D marker is removed (fx draws the ring).
8. Smoke: `camera:iso-frame` (catPx ≥ 30 at 844×390, ≥ 80 at 1920×1080; `fogAt(her) < 0.03`; pitch/dist in range),
   `camera:boss-fit` (B1 and B2: both on screen), `camera:handback` (CS-04 end → iso in ≤ 1.1 s, no frame below
   terrain), `camera:meme-descent`, `camera:classic` (`?cam=classic` still works). Rewrite the shoulder/lock blocks.

### player (`src/player/**`) — port 5314 — P1/P2
1. `wishDir` reads `cam.stickYaw`; direct input cancels orders.
2. New pure `Aim.js` (§7.1) used by `startAttack`, charge turn (540°/s), `startDodge`, Stand facing, Pounce dive,
   abilities; the magnet cone around the aim; lunge magnetism. Public `player.aim = { active, kind, dir, point,
   range, width, source }` and `player.hover` (from `cam.pick`) for fx and ui.
3. New `Orders.js` (§5.2): move / follow / attack / attackMove / use / stop / queue, the path follower, stuck and
   re-plan rules, link jumps with the assisted hop, auto-chain per `settings.autoAttack`, cancel rules §8.4; emits
   `player:order`. **P1 ships a direct-line follower** (stop at obstacles) when `physics.findPath` is absent.
4. Stand: threat snap, 30 px cursor re-aim, touch auto-face, `guard.touchArc`, plant (clears move orders). Auto-
   Riposte. Tumble steer window `steerDodge(dir)` (0.08 s, once). Jump direction and the jump assist (§5.4).
5. `abilityState(out)` (§10.1). `MemeCamTrigger`: idle via `idleTime` only, ignore a resting touch thumb.
6. Unit: aim precedence, magnet cones, threat-snap ordering, order cancel rules, unreachable snap, assisted-hop
   maths. Smoke: `player:click-move` (meadow, a click 15 m away past the fence after `tut.jump.done`: arrives
   within 0.5 m with ≥ 1 auto-jump), `player:attack-order` (RMB on a rat: paths, the combo hits), `player:stand-snap`,
   `player:wasd-override`.

### physics (`src/physics/**`) — port 5311 — P2
1. New pure `NavGrid.js` + `Pathfind.js` (§5.3): build in `setLevel` (time-sliced), auto links, authored and gated
   links (`when` via `state.cond`, re-evaluated on `story:flag` changes through `nav.refreshLinks()`), dynamic
   invalidation from `addCollider`/`removeCollider`/`updateCollider`, corridor warnings.
2. API: `physics.nav`, `findPath`, `nearestWalkable`, `navWalkable`, `losWalkable`; `nav:ready`; PhysicsDebug overlay.
3. Unit: A* on synthetic grids (wall with a gap, stream with stumps, 1 m fence), optimality within 5 %, partial
   paths, the expansion cap, invalidation. Smoke `physics:nav` (meadow build < 1.0 s; the path to Sage's cage uses
   the authored links; the fence link is closed before `tut.jump.done`).

### combat (`src/combat/**`) — port 5315 — P3
1. `assistTarget(actor, range, angle, out, { dir, sticky, prev, breakables })` with the §7.2 score and a breakdown
   for tests. `beginSwing(…, { lungeTo })` for lunge magnetism.
2. `nextParryable(actor)` → `{ attacker, activeAt, kind, window }`.
3. Fill `activeAt`/`windup` where combat starts enemy swings, if enemies don't (agree in `requests/combat.md`).
4. Projectile reflect: toward the aim if a hostile lies within ±25° of it, else back to the shooter (as now).
5. Unit tests for the score, stickiness and `nextParryable`.

### enemies (`src/enemies/**`) — port 5316 — P3
1. Telegraph payload fields (§8.5); wedge-friendly `dir` updates until `activeAt − 0.15`.
2. The on-screen rule for ranged starts; `rat_xbow.keep` [6, 9] (in `ENEMY_TUNING`, request to core); crows dive on
   screen only.
3. Expose `alerted`, `hp`, `maxHp` (exist) for aggro rings and HP bars. Review boss move ranges at d 14–22 (the
   Wheel Ride needs a `lane` telegraph from above).
4. Smoke `enemies:onscreen-rule`, `enemies:telegraph-payload`.

### companions (`src/companions/**`) — port 5317 — P3
1. `abilities.js`: `playerForwardYaw` → `playerAimYaw(ctx)` (= `player.aim.dir`, else `resolveAim('ability')`).
2. `useAbility({ dir, point })`; smart rules and indicators per §7.5; `cooldownLeft(id)`, `readiness(id)`.
3. Idle follow offsets at her back-left / back-right ≥ 1.4 m, off the aim notch. LostKitten / NpcActor LOD from
   `cam.focus`.

### fx (`src/fx/**`) — port 5319 — P3
1. New `GroundDecals.js`: one instanced pool (depthWrite off, polygonOffset; ≤ 2 draws) for the aim/hero ring +
   Stand fan, selection / hover / aggro rings, move markers and path dots, charge and ability indicators, blob
   shadow, landing ring, dive circle, contact blobs, parry ring, slash smear (0.15 s, 0.25 alpha).
2. `Telegraphs.js`: strike wedges with freeze and the window flash; constant-screen-size glints; ground aim lines;
   red chevron; jeer disc; rim 0.12 m.
3. New `GroundMist.js` (§4.2); MistCards iso height/tilt; fog-wall ground ring. `shaders.js` and `Horde.js` use
   `HFOG_GLSL`.
4. SwordTrail width ×1.3; damage-number scaling. Smoke `fx:wedge` (a rat_pike wind-up → wedge with `activeAt`),
   `fx:parry-ring`, `fx:indicators`.

### world (`src/world/**`) — port 5318 — P1 (fog) / P4
1. `HeightFog.js`: `vFogW`, focus-fog uniforms, `HFOG_GLSL`, iso `uFogLowMix`. `Env.setFocusFog()`; per-level
   `cam.fog` overrides (§4.2); shadow frustum on `cam.focus` (16 / 20 m); background = fog colour; `'far'` visibility
   group; Golden Hour `clear` ×1.5; Cacklejaw P3 `clear` 3.5 (an `env.contribute` key `clear`).
2. Level data per §11: yaw, hints, `navLinks` (+ the gated fence), `navBlock`, `nav: false`, roof tags, crown splits,
   `assistable`, `memeSpot`, fog overrides; the camera-side clutter and spawn audits; alley widths; ledge lips.
3. `Level.js`: `interactables` (read-only `{ id, pos, r, kind, enabled, usePos? }`), `zoneAt(pos)`; E prefers
   `player.hover` when two are in reach. `Wheat.js` trample; `Grass.js` LOD from the focus, width ×1.25.
   `Pickups.js` reads the new magnets.
4. Smoke `world:fog-audit` (each level: `fogAt(her) < 0.03`, top edge 0.15–0.30), `world:zone-shots` (each zone
   from its hint; x-ray pixel count small on the spine).

### characters (`src/characters/**`) — port 5313 — P3/P4
1. `getSilhouetteProxy()` (capsule + ears + bow + sword, merged) on KittenView and dressed beasts.
2. `setHighlight(color | null, strength)` (rim emissive uniform in the existing patcher).
3. Readability from above at d > 9 m: **bow ×1.25** with emissive 0.08 (always pink, always on the LEFT ear), ears
   ×1.1, a 2 cm lighter cape-tip trim; enemy helmet tops get a contrasting top colour. Fur LOD keyed to `cam.focus`.

### ui (`src/ui/**`) — port 5322 — P2 (touch) / P3
1. `touch.js` rewrite + pure `touchLayout.js` (§9): zones, cluster, dead rings, drag-aim + ✕, Tumble steer, free-area
   gestures with the strict thresholds, pinch, haptics calls, portrait, mirror, opacity, edit layout. Keep the
   `setVirtual` / `setVirtualMove` contract; `pickTapTarget` → wrapper over `cam.pick`; `tapLock` stays.
2. New `abilityBar.js`, `cursor.js`, `hpBars.js`. Remove the lock reticle. Threat arrows per §10.4. Milk and the
   companion portrait move into the bar on desktop/pad.
3. `text.js`: device-aware strings (`key.touch` / `key.pad` / `key.kbm` before the base key; the base is the KBM
   `hybrid` text) and preset-aware glyph tokens (`[Stand] [Tumble] [Jump] [Move] [Attack] [Interact] [Ability]
   [Milk] [Meow] [Golden] [Zoom]` resolve through the active bindings, so presets and rebinding never need new
   strings).
4. Settings §10.7, controls card per preset/pad/touch, the rotate toast, portrait HUD strip.
5. Unit: layout spacing at touchSize 0.8–1.4 in both orientations, gesture classifier, glyph resolution. Smoke
   `ui:touch-cluster` (844×390 hasTouch: ⚔ tap swings, 🛡 hold guards, swipe tumbles, ability drag shows the indicator
   and ✕ cancels), `ui:ability-bar` (cooldown sweep after a Tumble and a kitten ability), `ui:portrait`.

### story (`src/story/**`) — port 5321 — P4
1. Strings per §14 (base + `.touch` / `.pad` variants, glyph tokens). New keys `tut.target`, `tut.zoom`,
   `tut.click`, `tut.talk`, `tut.rotate`, `toast.cam.locked`, `toast.cam.unlocked`, loading tips.
2. `tutorial.js`: the `move` step completes on `moved ≥ cfg.moveDist` by any method (the `looked` fact is
   dropped); set flag `tut.jump.done` when the jump step completes; optional `target` step after `combo`;
   `tut.click` fires 20 s into the meadow if she has never used an order.
3. Cutscene hand-backs: no position changes required; check scenes that end with "she walks to X" from above.
4. Smoke `story:tutorial-touch` (practice field completed through the touch path).

### audio (`src/audio/**`) — port 5320 — P4
1. The `AudioListener` follows `cam.focus + (0, 1.2, 0)` with the camera yaw.
2. UI sounds: order paw tap (−18 dB, ±8 % pitch), target tick, cast cancel, cooldown-ready tick (−20 dB), order
   rejected "mrr?" (−20 dB). Listen to `player:order`, `target:changed`.

### save (`src/save/**`) — port 5323 — P4
1. `migrate`: add the §10.7 settings with defaults (schema stays v1; additive); keep `holdStand`/`holdCharge`;
   validate ranges (`camZoom` 0.7–1.4, `touchSize` 0.8–1.4, `buttonOpacity` 0.4–1, `haptics` ∈ {0, 0.5, 1},
   `controlPreset` ∈ the five names).

---

## 13. New config (core writes these; values binding)
```js
CAMERA.iso = {
  yaw: Math.PI, fov: 38, fovPortrait: 50, dist: 13, distPhone: 12, zoom: [0.70, 1.40], distMin: 9, distMax: 18,
  pitchNear: 0.803 /*46°*/, pitchFar: 1.012 /*58°*/, pitchPortrait: 1.012, pitchBoss: 0.977 /*56°*/,
  catH: 0.8, minCatPx: 30, minCatPxBoss: 26, minCatPxPortrait: 28, portraitWidth: 9,
  focusY: 0.6, followDamp: 12, followDampY: 6, jumpFollow: 0.3, bounceFollow: 0.5,
  lead: { vel: 0.25, velMax: 1.6, cursor: 0.15, cursorMax: 2.0, max: 2.5, up: 0.8, damp: 4 },
  frameOffset: 0.04, frameOffsetPortrait: -0.10, near: 0.3, far: 90, refit: 0.4,
  hint: { blend: 1.2, calmFor: 2.0, maxPerLevel: 3 }, stickRelatch: 0.15,
  combat: { radius: 10, bias: 0.3, biasMax: 2.5, inner: 0.8, margin: 1.2, zoomOut: 3, outDamp: 2.5, holdIn: 1.5, selWeight: 1.5 },
  boss: { dist: [14, 22], weight: 0.35, maxOff: 5, herInner: 0.6, bossInner: 0.85, liftAbove: 1.6, lift: 0.3 },
  unlock: { edgePx: 12, panSpeed: 18, leash: 25, leashSoft: 3, recentre: 0.4 }, peek: { max: 6, damp: 6, back: 0.4 },
  zoomStep: 0.07, zoomDamp: 8, pinchDamp: 10, padZoom: [0.8, 1.0, 1.25],
  charge: { dd: -1.0, dfov: -1 }, holy: { dfov: 3, fovT: 0.15, dd: -0.6, ddT: 0.25 },
  parryPunch: { dd: -0.6, in: 0.08, out: 0.30 }, perfectDodge: { dd: -0.4 },
  golden: { dist: 9, pitch: 0.803, in: 0.25, out: 0.6 }, dialog: { mul: 0.8, t: 0.5 },
  shake: { rotMul: 0.5, transMul: 2.0, rotMaxDeg: 1.2, transMax: 0.35, scale: 0.6 },
  cut: { blendIn: 0.8, handback: 1.0, cutAngle: 2.094, cutDist: 30, veil: 0.25 },
  meme: { exitPx: 40, idlePxPerSec: 24, spotR: 4 },
  occl: { opacity: 0.22, fadeIn: 0.15, fadeOut: 0.40, herR: 1.0, enemyR: 0.6, enemies: 4, enemyRange: 8, pathR: 0.4,
          crownR: 3.5, roofPad: 1.5, xrayFrac: 0.3, xrayDelay: 0.1 },
  fog: { clear: 5, clearCombat: 7, topMul: 1.5, lowMix: 0.45, ease: 0.6, goldenClearMul: 1.5 },
  shadowHalf: 16, shadowHalfBoss: 20, lodFromFocus: true,
};
NAV = { cell: 0.5, agentR: 0.32, margin: 0.08, minNy: 0.7, stepUp: 0.3, spanLo: 0.3, spanHi: 1.0,
  hop: { upMin: 0.3, upMax: 1.1, horiz: 2.4 }, drop: 3.0, gap: 2.0, fence: { top: 1.05, thick: 0.8 }, bounce: 1.8,
  linkCost: 3, linkEvery: 1.5, maxExpand: 6000, maxPoints: 48, sliceMs: 8, snap: 4, minCorridor: 1.6,
  arrive: 0.25, arriveMid: 0.6, slowR: 0.8, cornerLook: 0.6, linkStart: 0.6, linkFacing: 0.611 /*35°*/,
  hopMaxH: 5.5, follow: 0.1, pathsPerSec: 4, stuck: { dist: 0.3, time: 0.4, retries: 3 }, retarget: 1.5,
  queueMax: 4, leash: 16, attackMoveR: 4.5, useOffset: 0.3 };
AIM = { kbmCone: 0.436 /*25°*/, kbmExtra: 1.0, selCone: 0.698 /*40°*/, padCone: 0.785, padRange: 3.5, touchCone: Math.PI / 2,
  touchRange: 4.5, kbRange: 3.0, padDead: 0.25, padAimMax: 6, cursorIdle: 3.0, sticky: 0.75, lungeExtra: 1.0,
  score: { angle: 2.0, windup: 2.5, selected: 1.0, lowHp: 0.8, lowHpFrac: 0.3, recentHit: 0.5, breakable: 3.0 },
  breakableClear: 6, standSnapRange: 5, standSnapLead: 0.7, cursorReaimPx: 30, chargeTurn: 9.42,
  pounceMax: 3.5, pounceMagnet: 2.5, pounceTouchDisc: 3.0, jumpAssist: { range: 2.4, dv: 1.2, ang: 0.349, inset: 0.3 },
  pick: { px: 28, pad: 6, touchPx: 56, interactR: 1.2 }, autoChainRest: 0.10, autoRiposte: 0.15,
  onScreenMargin: 0.5, rangedNear: 9 };
TOUCH = { stickZone: [0.42, 0.80], stickZonePortrait: [0.55, 0.38], stickR: 60, stickDead: 0.10, stickFollow: 1.6,
  anchor: 68, minBtn: 56, deadRing: 40, gap: 8, portraitScale: 0.85,
  buttons: { attack: [96, 0, 0], guard: [76, -124, 4], dodge: [64, -100, -92], jump: [64, 0, -124],
             ability: [64, -196, -128], golden: [64, -96, -204], milk: [56, 16, -206], meow: [56, -300, -60],
             interact: [64, -214, 0] },
  tapMs: 250, tapPx: 12, longMs: 350, swipePx: 48, swipeMs: 150, afterButton: 0.3, aimPx: 16, aimRangePx: 90,
  steerWindow: 0.08, cancelChip: 72, aimPad: 96 };
PLAYER.guard.touchArc = 1.5708;
```
`INPUT.presets` holds the five tables of §6.2; `HAPTICS` holds §10.6.

---

## 14. Tutorial and prompt copy (story `strings.js`; `[Token]` glyphs resolve through the active bindings)

| Key | Base (KBM `hybrid`) | `.pad` | `.touch` |
|---|---|---|---|
| `tut.move` | Right-click where to go, or use [WASD]. Hold right-click to keep walking. | Move [LS]. | Drag the left side to move, or tap where to go. |
| `tut.jump` | Jump the fence [Jump]. | same (A) | Jump the fence: tap [Jump]. |
| `tut.combo` | Snip, Snap, Swoosh! [Attack] ×3: you swing toward the cursor. | Snip, Snap, Swoosh! [Attack] ×3. Aim with [RS]. | Snip, Snap, Swoosh! Tap ⚔ three times. |
| `tut.target` *(new)* | Right-click a foe to charge in and attack it. | [RB] picks the nearest foe. | Tap a foe to charge in and attack it. |
| `tut.roll` | Tumble past the sack [Tumble]: toward the cursor. You can't be hurt mid-tumble. | Tumble past the sack [Tumble]. You can't be hurt mid-tumble. | Tap Tumble, or swipe the open ground. You can't be hurt mid-tumble. |
| `tut.stand` | Hold the Stand [Stand]. Block the Wobble Knight twice. | same (LB) | Hold 🛡. Block the Wobble Knight twice. |
| `tut.parry` | Raise the Stand *just* as it swings. A white glint and a white wedge on the ground mean "parry me". | same | Raise the Stand *just* as it swings. When the ring meets you, raise 🛡. |
| `tut.riposte` | Parried! [Attack] now for a Riposte. | same | Parried! Tap ⚔ now for a Riposte. |
| `tut.bright` | Hold [Attack] until it shines, then let go. The silver arc shows its reach. Bright Slash breaks cracked things. | same | Hold ⚔ until it shines, then let go. Drag to aim. |
| `tut.pounce` | Jump [Jump], then [Attack] in the air: Pounce where you point. Bounce off crows! | Jump, then [Attack] in the air. Bounce off crows! | Jump, then ⚔ in the air: Pounce. Bounce off crows! |
| `tut.reflect` | Parry a bolt to send it back. Watch the dotted line. | same | same |
| `tut.meow` | Meow [Meow]. Hidden kittens answer. So do cows. | same | Tap the cat face. Hidden kittens answer. So do cows. |
| `tut.milk` | Milk Break [Milk]: heals 2 hearts. Don't get hit while you sip. | same | Tap the milk bottle: heals 2 hearts. Don't get hit while you sip. |
| `tut.vigil` | Vigil Stone: click it to rest, save, refill milk, swap kittens. | Vigil Stone: rest, save, refill milk, swap kittens [Interact]. | Tap the Vigil Stone to rest, save, refill milk, swap kittens. |
| `tut.companion` | [Ability] Kitten ability: hold to aim, let go to cast. | [Ability]: tap to cast, hold and aim with [RS]. | Tap a kitten's portrait. Drag it to aim. |
| `tut.holy` | Holy Slash: hold [Attack] until it turns gold (needs 50 Valor). | same | Hold ⚔ until it turns gold (needs 50 Valor). |
| `tut.golden` | Golden Hour: at full Valor, press [Golden] (or Stand + Attack together). | [Golden] (or [Stand] + [Attack]). | Tap the golden sun at full Valor. |
| `tut.zoom` *(new; first arena)* | Scroll to zoom. | [Zoom] to zoom. | Pinch to zoom. |
| `tut.click` *(new; 20 s in, if she never used an order)* | Tip: right-click a spot and she walks there by herself. | — | Tip: tap a spot and she walks there by herself. |
| `tut.talk` *(new; first NPC)* | Click someone to talk. | [Interact] to talk. | Tap someone to talk. |
| `tut.rotate` *(new; portrait, once)* | — | — | Plays best sideways. |
| `toast.cam.locked` / `.unlocked` | Camera locked. / Camera free: move the mouse to the edge to look around. [Y] | — | — |

`tut.valor`, `tut.jeer`, `tut.line`, `tut.bones`, `tut.pug`, `tut.pearl*` and `obj.*` keep their text (glyph tokens
only). Loading tips (add): "The notch on your ring is where your sword goes." · "Pressing the Stand plants your paws:
perfect for Standing Ground." · "Press H to stand still." · "Tap a foe to charge in." · "Y frees the camera."

---

## 15. Contracts

### 15.1 Additive (no break)
Events `player:order`, `target:changed`, `camera:zoom`, `input:scheme`, `nav:ready`; `combat:telegraph` payload
fields; `ctx.cam` (`focus`, `stickYaw`, `distance`, `zoom`, `setHint`, `screenToGround`, `cursorGround`,
`worldToScreen`, `onScreen`, `pick`, `iso`); `ctx.physics` (`nav`, `findPath`, `nearestWalkable`, `navWalkable`,
`losWalkable`); `ctx.player` (`aim`, `hover`, `orders`, `order(kind, arg)`, `abilityState`, `steerDodge`);
`ctx.combat` (`nextParryable`, `assistTarget` opts); `ctx.env.setFocusFog`; `levels.current.interactables`,
`zoneAt`, `levels.setVisible('far')`; `ctx.companions.useAbility({dir, point})`, `cooldownLeft`, `readiness`;
`ctx.input` (`pointer`, `takeClick`, `addTap`, `addZoom`, `consumeZoom`, `aimStick`, `setVirtualAim`, `haptic`,
`preset`); characters `getSilhouetteProxy`, `setHighlight`; config tables §13; settings §10.7; level fields §11;
debug hooks and smoke helpers §12 core.

### 15.2 Contracts that must change (approved here)
| # | Change | Who is affected |
|---|---|---|
| C1 | **Default bindings:** RMB guard → move; Space jump → **Stand**; jump → **F**; Mouse1 lockon → peek; wheel lockNext/lockPrev → zoom; pad R3 recentre → zoom; pad RS look → aim; pad 8 → controls card | core, ui glyphs, story strings, smoke |
| C2 | **Pointer lock removed** in play; `consumeLook()` returns zeros in iso | core, camera, player (MemeCamTrigger) |
| C3 | `cam.yaw` is the **fixed iso yaw** (not a player-driven orbit); `mode('lock')` no longer moves the camera; `CAMERA.dist/lockDist/bossDist/fov/pitch` apply only to presets and classic | camera, player, companions, story tutorial |
| C4 | **Fog distance** in play is measured from the focus (HeightFog `F_MAIN`); custom fog maths must use `HFOG_GLSL` | world, fx, characters |
| C5 | `PLAYER.assist` cones are around the **resolved aim**, not facing; touch range 4 → 4.5 | player, combat |
| C6 | The tutorial `move` step no longer needs `looked` | story |
| C7 | `memeCam.blendOut` 0.6 → 0.9; `treeFadeOpacity` 0.3 → 0.22; fish magnet 2 → 3, small heart 3 → 3.5 | player, camera, world |
| C8 | The lock-on reticle DOM, the right-side look drag and the blocking rotate card are removed | ui |
| C9 | `RENDER.far` in play 600 → 90 (camera sets it per mode) | camera, world (skyline) |
| C10 | Smoke: approaches that relied on a camera behind her use `t.click` / `teleport`; jump taps use `KeyF`; Stand taps use `Space` or `KeyL` | every area's smoke file |

### 15.3 Fallback
`?cam=classic` restores the orbit camera, lens fog (`uFogMode` 0), pointer lock and the old binding table until M3
ends. Removing it is an M3 integration decision.

---

## 16. Acceptance (screenshots are Read and judged; numbers via hooks)
1. `fogAt(her) < 0.03` on every level; top screen edge 0.15–0.30 (`world:fog-audit`).
2. Cat ≥ 30 CSS px at 844×390 landscape, ≥ 28 in portrait, ≥ 80 px at 1080p (`camera:iso-frame`).
3. Meadow start → exit by RMB clicks in ≤ 1.1 × the spine length; Stump Crossing by one click on the far bank;
   Mushroom Ring and Treetop by taps (`physics:nav`, `player:click-move`).
4. On a 844×390 touch viewport: the practice field and the first rat pack are completed with taps and the cluster
   only (`story:tutorial-touch`, `ui:touch-cluster`).
5. Screenshots at zoom 1.0 and 1.4 in meadow, forest night, Lantern Alley, the B1 mill and The Line show her fully
   visible (fade or x-ray), every melee wedge visible, and misty edges with a clear stage.
6. Draw calls at Med ≤ the current §18 numbers (expected lower: far 90, smaller frustum).
7. `slice:meadow` and `flow:*` pass; `?cam=classic` passes `camera:classic`.
