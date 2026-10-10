# Controls rework: the Hybrid Action-ARPG scheme (LoL / Hades / Diablo blend)

Author: design (senior game/UX), 2026-10-09. Status: **proposal**. It replaces GAME_DESIGN §8.3, §15 and parts of §7, §14 and §6.6 once adopted.
User request: *"make this game controlled like League of Legends rather than pure 3rd person from the back (it's hard to navigate and it's not mobile friendly), rework what's needed for the best experience."*

Code read for this proposal: `core/Input.js`, `core/config.js` (PLAYER, CAMERA, INPUT), `camera/FollowCamera.js`, `LockOn.js`, `Occluders.js`, `MemeCam.js`, `player/Player.js`, `PlayerStates.js`, `ui/touch.js`, `ui/prompts.js`, `world/Level.js` (`_updateInteract`), `world/Env.js` (FogExp2 + height fog), `fx/Telegraphs.js`, and `physics/Physics.js` (`blockedAt`, `topAt`, `lineOfSight`, `sphereCast`, `isDeepWater`).

---

## 0. TL;DR

- **Camera:** an isometric-style **perspective** camera, locked on her, with a **fixed yaw for each zone** (the default looks north, so screen-up is +Z). FOV **40°**. Zoom runs **9–16 m** on a pitch curve from **46° to 55°**. The default is **12 m / 50°** on desktop and **11 m / 48°** on touch. The view leans toward the cursor and her velocity, widens for combat, and frames bosses. There is no orbit and no pointer lock.
- **Movement:** **RMB click or hold to move** (LoL). A click finds a path over a new **physics NavGrid**, with automatic hops over gaps and low walls. **WASD and the stick still move her, relative to the screen**, and they override a path at once. On touch you can **tap the ground to walk** or use the floating joystick.
- **Combat:** **LMB attacks toward the cursor.** Hold it to charge, and a ground arc shows the reach. **Space = the Stand / parry**: it plants her and snaps her to face the attacker that will land first. Shift = Tumble (along WASD, otherwise toward the cursor). **F = Jump**, and LMB in the air = a Pounce at the cursor. Q / R / C / V are the ability keys, shown in a **LoL-style ability bar with cooldown sweeps**.
- **Parry readability from above:** enemy strikes draw a **white outline wedge on the ground** (gold for a gold glint, filled red for unblockable). The weapon glint and the "!" always draw on top. Her ground **aim ring** shows the Stand's ±70° arc. A parry adds a small camera punch-in.
- **Fog:** fog now depends on the distance from **her (the focus)**, not from the lens. There is a clear bubble 4 m across, the mist thickens toward the screen edges, and two drifting **mist-veil layers** cover the ground with a hole around her. The misty mood survives the top-down view, and she is never fogged out.
- **Occlusion:** the existing whole-object fade stays for trees, posts and stones. Houses, walls and towers get a **dithered see-through hole** around her and the engaged enemies.
- **Mobile:** no look-drag. The right half of the screen becomes **tap-to-move / tap-to-target**. The attack button can be **dragged to aim**, Wild Rift style. Pinch zooms. Auto-target and the Stand's auto-face are on by default.

---

## 1. Why this shape (design rationale)

1. **Parry timing is the core verb**, so it needs a dedicated, instant, ergonomic key that has nothing to do with aiming. Space under the thumb fits that. Mouse buttons stay free for *where* (RMB) and *strike* (LMB). That is LoL muscle memory (RMB move) plus Hades muscle memory (LMB attack, a thumb defence key).
2. **Click-to-move alone is bad for parry and dodge micro**, and **WASD alone is the hard-to-navigate problem the user reported**. So both are first-class, and they switch seamlessly with no setting needed: WASD or the stick overrides a path for as long as it is held, and a click starts a new path.
3. **A fixed yaw ends camera wrangling.** That is the main reason the current game is hard to navigate: the player steers a 1 m kitten *and* an orbit camera. A fixed per-zone yaw keeps screen-up meaning "onward" on the level spine (meadow, forest and gate all progress north).
4. **Top-down shows the fight as a diagram.** Enemy reach, arcs and AoE are readable on the ground. We lean into that by drawing every melee strike as a ground wedge, which reads better than the current over-the-shoulder view, where a rat behind her is invisible.

---

## 2. Camera

### 2.1 Projection and framing
| Parameter | Value | Notes |
|---|---|---|
| Projection | Perspective, FOV **40°** vertical | Orthographic was rejected: it flattens the misty depth and the sky dome, and it breaks the §5.2 cutscene presets. 40° keeps perspective depth while showing more ground ahead than 35°. |
| Yaw | **Fixed per zone**. Level default `cam.yaw = π` (camera south of her, looking north = +Z, the current convention: forward = (−sin yaw, 0, −cos yaw)). | Zones may author `camYaw` (e.g. a town street running east–west gets yaw π ± π/4). Zone changes blend over **1.5 s** with ease-in-out and **only while she is not in combat**. WASD stays screen-relative during the blend: the move basis lerps with the camera. |
| Zoom (distance to the focus) | **9–16 m**. Defaults: desktop **12**, touch **11**, gamepad **12**. Mouse wheel steps of **1 m**, eased with λ **8**. Pinch on touch. R3 cycles 10 / 12 / 15 on a pad. | The setting "Default zoom" persists in `state.settings.zoom`. |
| Pitch | Depends on zoom: `pitch = lerp(46°, 55°, (zoom − 9) / 7)`. 12 m → about 50°. | Closer is flatter, so you see more of her face (the cute factor). Further is steeper, so you see more of the arena. |
| Focus | Her position + (0, **0.5**, 0), followed with λ **12** (XZ) and λ **6** (Y, so jumps don't bob the frame) | She sits at the screen centre before the look-ahead offset. |
| Look-ahead | Cursor: **25%** of the vector from her to the cursor's ground point, capped at **2.5 m**. Velocity: 0.3 s × velocity, capped at **2.0 m**. The two are summed and capped at **3.0 m**, damped with λ **4**. Pad: right-stick aim × 2.5 m. Touch: velocity only. | "Reduce camera motion" turns both off. |
| Peek | Hold **MMB** (or **Alt**): the focus slides toward the cursor, up to **8 m**, with λ **6**. Release: back in **0.4 s**. | For scouting crossbows. Gamepad: none (zoom out instead). |
| Near / far | near 0.3, far **120** in play (it was 600) | The horizon is never visible at these pitches. This is a large depth-precision and culling gain. |

What the default framing shows (FOV 40°, she is 1.0 m tall), computed:

| Zoom / pitch | Ground ahead of her | Behind | Half-width 16:9 | Half-width phone 19.5:9 | Her height on screen | at 1080p | phone (390 CSS px tall) |
|---|---|---|---|---|---|---|---|
| 10 m / 47° | 7.5 m | 3.7 m | 6.5 m | 7.9 m | 9.4% | 101 px | 37 px |
| 11 m / 48° (touch) | 8.0 | 4.1 | 7.1 | 8.7 | 8.4% | 90 px | 33 px |
| **12 m / 50° (desktop)** | **8.2** | **4.4** | **7.8** | 9.5 | **7.4%** | **79 px** | 29 px |
| 14 m / 52° (combat max) | 8.4 | 4.8 | 8.6 | 10.4 | 6.4% | 69 px | 25 px |
| 16 m / 55° (boss) | 8.9 | 5.4 | 9.8 | 11.9 | 5.2% | 56 px | 20 px |

Look-ahead adds up to 2.5 m on the side she is aiming at, so the effective forward view at 12 m is about **10.7 m**. That is enough for melee and for crows at their 5 m circling radius. It is **not** enough for crossbows that keep 7–11 m away with a 16 m range, so the enemies area adopts the **on-screen rule** (§10).

### 2.2 Combat framing (it replaces COMBAT_PITCH, COMBAT_SHOULDER and the lock framings)
- **Engaged set:** hostiles in `ENGAGED` states within **10 m**, plus the hovered or focused target.
- **Zoom:** widen until every engaged actor sits inside the inner **80%** of the screen (with a 1.2 m margin around each), up to **zoom + 2 m** and never above **14 m**. Ease out with λ **2.5**, and ease back in only after **1.5 s** with no engaged actor (no breathing).
- **Focus:** her position + **0.3** × (centroid of the engaged set − her position), capped at **3 m**, so she stays inside the inner 50% of the screen.
- No yaw change, ever. Lock-on no longer moves the camera; it only affects aim (§4).

### 2.3 Bosses
- On `boss:start`: zoom **16 m** (or `boss.camZoom`), with focus = her + **0.35** × (boss − her). She is clamped inside the inner **60%** and the boss inside the inner **85%** of the screen; when both can't fit, she wins.
- Tall bosses (Grizzlechop's 1.6 m, Barkus): look-at height **+0.4 m** within 4 m of the boss.
- B1 Cheese Mill (r 12; pillars at r 8): the millstone pillars use the see-through hole (§2.6), not a fade-out.
- The Line (gate): the winch is added as a **framing anchor** with weight 0.2, so the repair site stays on screen.

### 2.4 Shake, punch and juice (scaled for the top-down view)
- Rotational shake looks huge at a 12 m arm, so shake is **translational** in the screen plane, with amplitude = trauma² × **0.35 m**, plus roll ≤ **1.5°**. The JUICE trauma values are unchanged, with a global scale of **0.6** for the top-down camera.
- **Parry punch-in:** zoom −**0.6 m** over 0.08 s, back over 0.30 s (real time; hitstop doesn't freeze it).
- **Holy:** FOV +3° for 0.15 s (it was +5°: too much at a long arm). **Golden Hour activation:** zoom to **9 m** at 46° for the 0.8 s activation (the ref1 heroic framing), then back to the combat zoom over 0.6 s.
- **Purrfect Dodge:** zoom −0.4 m held through the 0.5 s of slow motion.

### 2.5 Cutscenes, hand-backs, Meme Cam
- §5.2 presets stay **unchanged**: they are actor-local framings. `CutsceneCamera` blends **from the iso pose** into the first shot over `blend` (default **0.8 s**, ease-in-out-sine, sphere-interpolated around the subject so the path never cuts through the ground). The hand-back to iso takes **1.0 s**.
- **Meme Cam, the showpiece "Swoop":** idle trigger or manual trigger (hold the Stand 2.5 s while planted with no enemy within 12 m, unchanged).
  - **2.6 s** (it was 2.0) crane-down from the iso pose to `MEME_LOOP` along a spherical path around her.
  - The distance eases in-out from 12 m to 1.15 m. The pitch eases out-cubic from 50° to about 6°. The yaw rotates by the shortest arc to her facing + π (in front of her face) at up to **1.2 rad/s**. FOV goes from 40 to 32. The HUD fades during the first 0.5 s.
  - The arm sphere-casts and fades canopies on the way down, as now.
  - Exit: any key or click, or mouse movement over **40 px** (cursor jitter must not break the loop). A **0.9 s** rise back to iso (it was 0.6: too violent over 11 m).
  - The idle timer counts mouse movement as activity only above **24 px/s** (§3.1), so a resting hand doesn't block the trigger.
- Photo Mode [STRETCH] stays a free camera within 6 m.

### 2.6 Occlusion from above
At 50° pitch, a prop of height h hides the ground **0.84 × h** metres north of it: a 6 m house hides 5 m of street, a 7 m oak canopy 6 m.
1. **Small and medium props** (trees, trunks, posts, fences, stones, wheat clumps over 1.4 m, hay bales): keep `Occluders.js`. Change the test from "camera → her segment" to a **cone**: radius **1.2 m** at her end and 0.4 m at the lens, plus a segment to each engaged enemy (up to 4) and to the hovered target. Fade to **0.25** opacity (it was 0.3), fade in 0.15 s, out 0.4 s. `CHECK_HZ` stays at 20.
2. **Large solids** (houses, roofs, castle walls, towers, the gatehouse, boss pillars): a **see-through hole** instead of a whole-object fade.
   - World's material patcher (the same hook that adds height fog) adds uniforms `uHoleCenter[3]` (screen UV), `uHoleR[3]` (UV radius) and `uHoleDepth[3]` (view depth). The patch applies only to materials flagged `userData.camHole = true`; world sets the flag on solid occluder materials.
   - A fragment closer to the camera than `holeDepth − 0.8 m` and inside the radius is discarded through a **4×4 Bayer dither**: 100% at the centre, 0% at the rim, with a 30% rim feather.
   - Holes: her (r = **0.11** of screen height at 12 m, scaled by 12 / zoom), the focus target, and the Meme Cam subject.
   - Cost: one compare per fragment and no extra draws. Camera computes the hole values each frame and writes them to a shared uniform object that world owns.
3. **Silhouette fallback** (characters, optional, Med/High only): when she is more than 50% occluded for 0.2 s, draw her base body mesh (not the fur shells) a second time with `depthFunc: GreaterDepth`, flat **#FFE7EF** at 0.55 alpha, plus a pink rim. Her **ground aim ring** (§6.3) draws with `depthTest: false`, so you always know where she is.

### 2.7 Fog and atmosphere retune (the misty mood survives)
Problem: `FogExp2` at meadow density 0.045 measured from a lens 12 m away fogs **her** by 25% and enemies 8 m ahead by about 50% (old fog at the 12 m distance: 0.25; at 16 m: 0.42). Fix, owned by world `Env` + `HeightFog`:
- **Focus-relative fog:** fog distance = `max(0, |fragXZ − focusXZ| − clearR)`. Factor = 1 − exp(−(dist × ρ × k)²), where **clearR = 4 m**, **k = 1.6** and ρ is the preset density. Results for meadow_day (ρ 0.045): 8% at 8 m from her, **22% at 11 m** (the screen edges), 40% at 14 m. Forest (0.060): 36% at 11 m. Bog (0.070): 46% at 11 m. Golden Hour fogMul ×0.5 still applies, and clearR ×1.5 while it lasts.
  - The camera writes `focus` and the uniforms every frame (`env.setFogFocus(vec3)`, a new world API).
  - In cutscenes and Meme Cam, `env.setFogFocus(null)` falls back to classic lens fog, so the §5.3 moods are unchanged.
- **Height fog:** keep it. It reads even better from above (pooled mist in the hollows and the stream bed).
- **Mist veil** (fx `MistCards`): two horizontal sheets of world-space noise that follow the camera focus, at **2.4 m** and **5.0 m** above the terrain. Alpha **0.20** and **0.12** × the preset's mist factor. They drift at 0.3 and 0.5 m/s along `env.windDir` with parallax. Each has a soft radial **hole around her** (inner 3.5 m, outer 9 m), so the mist sits between the camera and the world at the screen edges but never over her or the melee ring. Standing Ground and Meme Cam drift ×2 (as now). Draw cost: 2 quads. These sheets replace the old function of the distant upright mist cards.
- **Sky:** almost never visible in play (the top-of-frame ray is 30° or more below the horizon). The background clear colour = `fogColor`. The far skyline and the Dawnstone are hidden in play and shown for cutscenes (`levels.setVisible`), which saves draw calls.
- **Sun shadow:** the frustum covers the view footprint plus a margin: **±14 m** around the focus (±18 m at boss zoom), still texel-snapped. A smaller frustum gives sharper shadows at the same map size.
- **Grass:** seen from above, blades thin out. Darken and green the ground albedo under grass by 10%, increase blade width ×1.25, set the LOD radius to **22 m** from the focus (the view is small), and spend the saved budget on density near her.

---

## 3. Input model

### 3.1 Pointer (new, core `Input.js`)
- **No pointer lock** in play or menus; the cursor is always visible. This also removes the lock-loss → pause hack: Esc pauses directly.
- `input.pointer = { x, y, ndcX, ndcY, inside, movedPx, lastMoveT }`. Mouse movement counts as "activity" only above **24 px/s** (Meme Cam idle).
- New actions:
  - `move` (RMB press / hold), `zoomIn` / `zoomOut` (wheel; the old lock-switch moves to Tab and the D-pad), `peek` (MMB hold, Alt);
  - `stop` (S when WASD is off; **H** always, the LoL "hold position");
  - `aimPad` (the right stick becomes an aim vector `input.aim {x, y}`, not look).
- `consumeLook()` remains for cutscene and photo cameras only.
- `input.setVirtualTap(x, y, kind)` for touch taps (§7).
- Ground pick: `ctx.cam.screenToGround(ndcX, ndcY, out)` (camera area) casts the pointer ray against `physics.raycast({ terrain, mesh: true, statics: false })` and falls back to the y = her height plane. It runs **once per frame** and is cached as `cam.cursorGround` (+ `cursorValid`).

### 3.2 The intent controller (new, player `player/Intent.js`)
It owns "what she is trying to do": `none | path | follow | attackMove | use`, with `goal`, `target`, `waypoints[]`, `marker`. Priority in each fixed step:
1. **WASD / stick** with |move| ≥ 0.15 → the screen-relative wish dir (the current `wishDir`, using the fixed yaw). **This cancels any path at once**, which is clear and predictable.
2. Otherwise follow the active **path**, with arrive slowdown in the last **0.8 m** and an arrive tolerance of **0.25 m**.
3. Otherwise no movement.

**RMB press** picks under the cursor, in this order:
1. A **hostile** within **36 px** (touch **56 px**) of its chest projection (the `pickTapTarget` logic, moved from ui to a shared pure helper): **attack-move**. She paths to `range − 0.3 m` of the attack she will start (slash1: 1.9 m), faces it, and starts **Snip**. While RMB stays held on it (or after repeated taps on touch), she chains the combo with the auto-combo grace. Option "Hold move on an enemy keeps attacking": **on** for touch and Kitten difficulty, **off** by default on desktop.
2. An **interactable or friendly** (NPC, cage, Vigil Stone, Quest Board, rope post, lantern, shop counter) within 40 px, or its ground radius: **use**. She paths to within `it.r − 0.3`, then calls `levels.current.interact(id)` (the existing API that story and tests already use). A cage's `hits` interactables become attack-move.
3. **Ground:** a **path** to the clicked point. Hold RMB → **follow**: re-target every **0.1 s**. If line of sight is clear (a NavGrid DDA walk), steer straight; otherwise re-path, at most **4 per second**. On release she keeps walking to the last point (LoL / Diablo feel).

**Cancels:** WASD or stick; `stop`; **pressing the Stand** (it *plants* her: necessary for Standing Ground and clear for parry); any attack, Tumble or Jump; hurt, stagger or a cutscene. Milk Break doesn't cancel: she keeps walking at 1.1 m/s.

### 3.3 Movement numbers
- A click path always **runs** (5.5 m/s). Walking (2.0) stays analog-only (stick ≤ 0.5). **Zoomies** trigger as now after running for 2.0 s, so long clicks across the meadow reach 7.2 m/s (it also helps the Pilfer chase).
- Facing while she walks a path: toward the next waypoint, with λ 16. At a corner, the string-pulled look-ahead is **0.6 m**, so she cuts corners smoothly instead of zig-zagging.
- **Stuck detection:** less than **0.2 m** of progress in **0.5 s** → re-path. Three failures → stop, and the marker flashes grey.
- **Unreachable click** (inside a collider, deep water, off the nav): snap to the nearest walkable cell within **6 m** of the click. Otherwise show a grey "✕ paw" marker and don't move.

---

## 4. Targeting and aiming

### 4.1 Aim direction (each swing, Stand, Tumble and cast reads `player.aimDir()`)
| Device | Aim source, in priority order |
|---|---|
| KBM | Riposte target → **the focus target** if within its attack range + 1 m → the **cursor ground point** (the direction from her to it) |
| Pad | Riposte → focus → **right stick** (dead zone 0.25) → left stick → the auto-target → facing |
| Touch | Riposte → **dragged attack-button aim** (§7) → the tapped target → the **auto-target** → joystick → facing |
| Keyboard only (J/K/L, cursor idle more than 3 s) | Riposte → focus → WASD → the auto-target → facing |

**Magnetism (aim assist, it replaces §7.2's 60° / 3 m):** on the first active frame (the existing `onActiveStart` hook), if a hostile lies within **±25°** of the aim direction and within `range + 1.0 m`, turn fully to it. Hovering it directly counts as 0°. Touch / auto-target: **±90°, 4.5 m** (the auto-target ignores the cone when the joystick is idle: it picks the nearest of 360°).

**Auto-target ranking** (touch, keyboard-only, pad without aim):
1. The focus target.
2. An enemy in a parry or red windup aimed at her, soonest strike first.
3. The last enemy that hit her (within 2 s).
4. The nearest within 4.5 m, with crows only below 2.2 m (`hittableBelow`).
5. Breakables and cages only when there is no hostile within 6 m.

### 4.2 Hover, focus and lock
- **Hover:** the enemy under the cursor (36 px pick) gets a thin **white ground ring** (r = radius + 0.25 m, 2 px rim) and the cursor switches to the sword. An interactable under the cursor gets a gold ring and its parchment tag, plus the paw cursor.
- **Focus target** (replaces lock-on; the action stays `lockon`, the visuals change):
  - Tab / RB / tap on an enemy sets the focus: a **gold rotating ground ring** plus the enemy HP pips over its head (§14.2 pip bar).
  - With KBM, Tab cycles enemies by distance **from the cursor**. The D-pad and the wheel (when zoom is bound elsewhere) cycle by angle around her.
  - The focus biases aim and auto-target only. It **never moves the camera** and never forces facing outside attacks and the Stand. It breaks at 16 m or after 1.5 s without line of sight (the existing numbers).
- The centre-screen 3D reticle is removed: in the top-down view the ring *is* the reticle.

### 4.3 Range and aim indicators (fx, ground decals that conform to the terrain like the telegraph decals)
| When | Indicator |
|---|---|
| Always in play | **Aim ring** under her: r 0.75 m, a 2 px silver rim at 0.35 alpha, with a **notch wedge** pointing along `aimDir` (15°). `depthTest: false`, renderOrder after the ground decals. This is the "where am I and where will I swing" anchor. |
| The Stand held | The ring's front **±70°** arc lights solid silver at 0.6 alpha. At 0 Grit it draws cracked and dim. In the parry window (0.15 s after the press) it flashes **gold**: you *see* the window. |
| Charging (over 0.35 s) | A wedge decal showing the release attack's reach: slash3 2.3 m ±97°, then at tier 1 **Bright** 2.6 m ±92° (silver), then at tier 2 **Holy**, a 3.6 m circle (gold), plus a **10 m × 2.4 m lane** toward the aim when Shard 2 is owned (holyWave). She turns toward the aim at **540°/s** while charging. |
| Riposte ready (0.8 s) | A gold arrow from her to the parried enemy plus a pulsing ⚔ glyph above it (ui). |
| Golden Hour | 8 m × 1.2 m gleam lane preview on each slash (fx, 0.2 s). |
| Kitten ability with a target (Sage's Volley) | A 2.5 m circle at the cursor (max 10 m) while Q is held. A tap casts at once on the hover or auto-target (LoL "quick cast with indicator"). |
| Jump in the air | A **vertical drop shadow** directly under her (dark disc r 0.35, alpha 0.5 → 0.2 with height). Essential for top-down platforming. In the air with a Pounce ready: a 0.9 m dive circle at the predicted landing point toward the cursor. |

---

## 5. Full action map

### 5.1 Keyboard and mouse (default preset: **"Hybrid"**)
| Action | Binding | Behaviour |
|---|---|---|
| Move | **RMB** click / hold; or **WASD** / arrows (screen-relative) | §3.2. RMB on an enemy = attack-move; RMB on an object or NPC = walk there and use it |
| Attack / combo / charge | **LMB**, J | Toward the cursor (or the focus). Hold = charge with the indicator. LMB on an NPC or interactable outside combat = walk there and use it (never swing at friends) |
| **Stand** (hold) / parry | **Space**, L, Mouse5 (forward side button) | Plants her (cancels the path). On press she **snaps to the threat** (§6.1); while held she faces the cursor at 360°/s. WASD shuffles at 1.2 m/s |
| Tumble | **Shift**, K, Mouse4 (back side button) | Direction: WASD if held, otherwise **toward the cursor**, otherwise facing. Cancels the path |
| Jump | **F** | Along the current velocity; standing still → straight up (pug slam rings). LMB in the air = Pounce toward the cursor (clamped to 3.5 m horizontal; crows within 2.5 m of the cursor are magnetised) |
| Interact / confirm | E, Enter | The hovered interactable if within reach, otherwise the nearest one (the existing world rule) |
| Kitten ability | Q | Quick cast (the indicator shows while held for targeted abilities) |
| Milk Break | R | — |
| Meow | C | — |
| Golden Hour | V, or Space + LMB within 0.1 s at Valor 100 | — |
| Focus target / cycle | Tab / Shift+Tab | §4.2 |
| Zoom | Wheel | 9–16 m |
| Peek | MMB hold, or Alt hold | §2.1 |
| Hold position | H (and S when WASD movement is turned off) | Stops the path and faces the cursor |
| Pause / hold to skip | Esc, P | — |

**Alternative presets** (Settings → Controls; each is a different `INPUT.keys` table):
- **"Click-classic" (Diablo):** LMB = move / attack-move / use; Shift+LMB = attack in place toward the cursor; RMB = Stand; Space = Tumble; F = Jump.
- **"Keyboard + mouse aim" (Hades):** WASD move; LMB attack; RMB Stand; Space Tumble; F Jump; RMB-click movement off.
- **"Mouse only" (accessibility):** RMB move; LMB attack; Mouse5 Stand; Mouse4 Tumble; MMB click = Jump; wheel = zoom; abilities via clicks on the ability bar.
- **"Keyboard only":** WASD move; J attack; L Stand; K Tumble; Space Jump; auto-target aim (as today minus the camera).

### 5.2 Gamepad (twin-stick)
| Action | Button |
|---|---|
| Move | Left stick (screen-relative) |
| **Aim** | **Right stick** (dead zone 0.25). The aim notch shows; idle → auto-target |
| Attack / charge | X (2) |
| Stand / parry | **LB (4)** (unchanged; also LT if the "triggers" preset is on) |
| Tumble | B (1). Direction: left stick, otherwise right-stick aim, otherwise facing |
| Jump / Pounce | A (0) |
| Interact | Y (3) |
| Focus target toggle | RB (5); D-pad ← → cycle |
| Kitten ability | LT (6) |
| Golden Hour | RT (7), or LB + X |
| Zoom cycle | R3 (11): 10 / 12 / 15 |
| Meow | L3 (10) |
| Milk | D-pad ↑ (12) |
| Pause / skip | Start (9) |

There is no camera stick. That is fine: in the playtests of the comparison games, players never miss rotation as long as occlusion is solved (§2.6).

### 5.3 Touch: §7

---

## 6. Parry and Stand timing from above

### 6.1 Stand assists (player area; they are what keep parry fair without a camera-relative facing)
- **Threat snap on press:** on the step the Stand starts, if an enemy with a live `parry` / `gold` telegraph (or an incoming projectile) is within **5 m** and its strike lands within **0.7 s**, set facing to it at once (no turn time). Ties: soonest strike, then the nearest. Otherwise face the aim direction (§4.1). Player runs before combat in the fixed step, so the snap applies before `resolveIncoming` in the same step.
- **While held:** KBM keeps facing the cursor at 360°/s **only after the cursor moves 30 px or more** (no yank right after a snap). Pad: right stick, otherwise the left stick. Touch: auto-face the soonest threat for the whole time the Stand is held.
- **Multi-attacker:** two rats striking at once from opposite sides can't both be faced. That is intended (Tumble out), and the ground wedges make it visible ahead of time.
- **Guard arc:** unchanged at ±70° on desktop and pad. Touch: **±90°** (`PLAYER.guard.touchArc`), because a thumb can't aim.
- **Parry windows:** unchanged (0.15 s Knight, 0.25 s Kitten, +0.05 s touch). The whiff lockout stays.

### 6.2 Telegraph readability (fx `Telegraphs`, enemies payload)
| Kind | Old (third person) | New addition for the top-down view |
|---|---|---|
| `parry` (white) | Weapon glint plus "!" | **Ground strike wedge:** the attack's `arc` (range, from → to) drawn as a 2 px **white outline** from the attacker. A fill **sweeps from the attacker toward the tip** across the windup. At **parry-window open** (strike − difficulty window) the rim **flashes and thickens to 4 px**, together with the existing "ting" (the visual twin of the audio cue). |
| `gold` | Gold star glint | The same wedge with a gold rim and an 8-point star at the tip. |
| `red` | Red glow plus "!!" | A **filled** red-orange wedge at 0.35 alpha (filled = "don't be here", which matches `aoe`). |
| `aoe`, `shadow` | Ground decals | Unchanged (they already read best from above). |
| `aim` | Dotted line | Unchanged. It stops tracking 0.2 s before the shot; the line goes solid white at lock. |
| `jeer` | Rings | Unchanged, plus a faint purple ground disc of radius r. |

- The glint sprite and the "!" use `depthTest: false`, renderOrder 10, and draw **1.15× larger** (a 12 m arm). A glint above 1.4 m height moves up-screen, so it is anchored at the weapon point, with a short **leader line** to the wedge apex.
- **Enemies payload:** add `attackId` (and `arc`, `range`, `windup`) to `E.TELEGRAPH` (an additive JSDoc change), so fx can derive the wedge. `Enemy.js:883` already emits pos and dir.
- **Off-screen arrows:** they show for telegraphs within **12 m** that are off-screen (the view is smaller now). That applies to ranged attackers only, because melee strikes always come from on screen in the new framing.
- **Her own feedback:**
  - **Parry:** a gold ring spark on the ground at the contact point, plus the camera punch (§2.4), plus the HUD Stand slot flashing.
  - **Block:** a white spark and a Grit pip flash.
  - **Whiff lockout:** her aim ring greys for 0.30 s, so mashing reads as a visible penalty.

---

## 7. Touch layout (landscape, reference 844 × 390 CSS px)

| Zone | Content |
|---|---|
| Left 40% × bottom 75% | **Floating joystick:** R **56 px**, dead zone 0.08, appears where the thumb lands (unchanged logic in `stickVector`) |
| Everywhere else on the playfield | **Tap = order** (the same picker as RMB): ground → path plus a paw marker; enemy → focus plus attack-move plus Snip, and more taps on it chain the combo (the auto-combo exists); NPC or object → walk there and use it. **Pinch** = zoom 9–13 m. **No look-drag** (removed) |
| Bottom-right arc, centred on **⚔ Attack**: 84 px × `touchSize`, inset 20 px + safe area | **Tap** = attack (auto-target). **Hold** = charge (the ring fills). **Drag 18 px or more off the button** = aim mode: the ground wedge follows the drag direction, release fires or releases the charge that way, and dragging back to the centre returns to auto-aim. Drag onto the ✕ zone that appears top-left of the button = cancel the charge without swinging |
| At 10 o'clock of ⚔ (gap 10 px) | **🛡 Stand**, 68 px: hold. **Auto-Stand assist on by default**; threat auto-face is always on |
| At 12 o'clock | **Tumble**, 56 px: tap = joystick direction, otherwise away from the soonest threat, otherwise facing. **Swipe** on it = tumble in the swipe direction |
| At 8 o'clock | **Jump**, 56 px. ⚔ in the air = Pounce at the auto-target or forward |
| Row above the arc | Kitten ability (portrait plus cooldown ring; drag to aim when targeted), Milk (shows the count), Meow: 48 px each |
| Contextual | "!" Interact, above Stand while `interact:available`. A gold **Golden Hour** button, 72 px, over ⚔ at Valor 100 |
| Top centre | ❚❚ Pause (hold 1 s = skip), unchanged |

Feedback:
- `navigator.vibrate(15)` on a parry and `vibrate(8)` on a hit (Android only).
- The tap marker is a pink paw print.
- The rotate hint stays.
- HUD left / top and the cluster respect `env(safe-area-inset-*)`.

Mobile performance: the top-down view culls the skyline and horizon (far 120). The shadow frustum is smaller, and grass density is focused within 22 m. Expect **fewer** draw calls than the third-person camera at the same quality tier.

---

## 8. Interaction

- **Click or tap** on an interactable (NPC, Vigil Stone, cage, rope post, lantern, Quest Board, shop counter, kitten hiding spot after a Meow, letter) = walk there and use it (§3.2). The cursor becomes the **paw / wax-seal** glyph.
- **E** keeps the proximity rule (`Level._updateInteract`), but it prefers the **hovered** interactable when two are in range.
- **Interactable highlight:** the gold ground ring plus the parchment tag on hover, and within reach on touch. The world tag stays §14.2 ("parchment plus a wax-seal key glyph").
- **Pickups:** fish and hearts are magnetised (2 m / 3 m). A click on a fish or letter walks to it. Breakables (crates, barrels, cracked boulders) are **hostile-like targets** for attack-move, but they come last in auto-target priority.
- **Dialogue:** a click or tap anywhere advances (as now). RMB never moves her while the dialogue box is open.
- **Hidden kittens:** the "wobble" hint plus the Meow answer sparkle get a hover ring once revealed.

---

## 9. UI changes (ui area)

1. **Cursor set** (CSS `cursor: url(data:...) x y, auto`, 32 px, ×1.5 and ×2 sizes for accessibility; a high-contrast variant with a dark outline):
   - default: a gauntlet paw pointer;
   - enemy: a sword (red tint while it is the focus);
   - interactable / NPC: a paw with a wax seal;
   - invalid ground: a paw with ✕;
   - attack-move pending: a sword with an arrow;
   - menu: the normal arrow.

   ui sets a class on `#game` from `player.intent.hover.kind` (polled each frame, cheap).
2. **Ability bar (LoL style), bottom centre**, 6 slots at 56 px (48 px under 900 px width), Fredoka key glyphs at the lower-right corners:
   1. **Stand** [Space]: Grit pips inside, a gold flash on parry, cracked at 0;
   2. **Tumble** [Shift]: a 0.2 s cooldown sweep;
   3. **Kitten ability** [Q]: the companion portrait plus a radial cooldown in its colour, "zzz" while napping (this moves from the bottom-right);
   4. **Milk** [R]: bottle count, "sip" progress;
   5. **Meow** [C]: a 1.0 s cooldown;
   6. **Golden Hour** [V]: dark until Valor 100 and Shard 2, then gold with sparkles.

   A **Holy pip** sits beside the Valor sword: lit at 50 and Shard 1 ("Holy ready").
   Cooldown sweeps use conic-gradient masks, updated at 30 Hz. Hover a slot (desktop) for a parchment tooltip with the move's one-line rule.
   On touch the bar is hidden and the cluster *is* the bar (same icons and sweeps).
3. **Move marker** (fx decal, not DOM): a pink paw that pops from scale 0 to 1 in 0.12 s and fades in 0.6 s. Grey ✕ paw = unreachable. A red-orange ring = attack-move on the target. Optional **path preview** (Settings, off by default): faint paw prints every 1.2 m along the path, fading in 0.5 s.
4. **Prompts and glyphs:** the `actionGlyph()` map gains RMB (move), Space (Stand), F (Jump), the wheel (zoom), the right stick (aim), "Tap", "Drag ⚔". Every `tut.*` and `prompt.*` string swaps glyphs per device (story supplies the text, §11).
5. **Settings additions:**
   - Control preset (§5.1);
   - Default zoom;
   - Camera look-ahead on / off ("Reduce camera motion" also disables combat zoom-out);
   - Show path preview;
   - Hold-move-on-enemy keeps attacking;
   - Stand auto-face (default on; it can be turned off for purists on desktop only);
   - Cursor size / high contrast;
   - Aim-ring opacity;
   - Telegraph wedge thickness (2 / 3 / 4 px).

   **Removed:** invert Y and the look sensitivity (they become "Gamepad aim sensitivity").
6. **Controls card** (Pause → Controls) and STATUS.md table: replaced by §5.
7. **The lock-on reticle** DOM is removed (ground rings replace it). **The enemy HP pip bar** stays above the focused or hovered enemy.
8. **Threat arrows:** 12 m radius (§6.2).
9. **The HUD companion portrait** moves into the ability bar. Bottom-right is freed on desktop.

---

## 10. Level, design and enemy changes

| Item | Change | Owner |
|---|---|---|
| **NavGrid** (all levels) | Built at load (see §12, physics). Levels may add `navLinks: [{ a: [x, z], b: [x, z], kind: 'hop' \| 'bounce' \| 'drop' }]` and `navBlock` rects (cosmetic no-go areas such as the flower beds). | world + physics |
| `meadow` practice field | The **fence-jump lesson** stays: the 1.0 m inner fence becomes an auto-hop link **only after** the lesson is passed (`navLink.when: 'tut.jump.done'`). Before that, a click past the fence makes her path to the fence and stop, and the prompt says "Jump the fence [F]". The 1.5 m perimeter stays unjumpable. | world, story |
| Stump Crossing (forest) | 6 stumps with gaps ≤ 3 m: authored `hop` links. A click on the far bank paths over the stumps with **assisted hops**: she jumps at the edge with the exact v₀ to land on the stump centre (horizontal ≤ 5.5 m/s, using the existing jump v₀ 7.4). Manual jumping still works. A hovered stump top shows a paw ring. | world, player |
| Treetop root ledges (y 1.5), Waffles' crate balcony (town), mushroom caps | `hop` links (going up ≤ 1.2 m is within the 1.245 m apex; a 1.5 m ledge uses the lower root step at y 0.75 as an intermediate node) and `bounce` links for the caps (9 m/s ≈ 1.8 m). | world |
| Crow Fields wheat (1.0 m) | Rats are 0.8 m: from above they hide in the wheat. Flatten the wheat within r 1.2 m of every enemy (the existing grass push uniform) and draw a **dark contact blob** under every actor (fx), so enemies read through the crops. | world, fx |
| Narrow streets (town Lantern Alley, Bakery Street) | The see-through hole (§2.6) is required. Also keep streets at ≥ **3.0 m** wide, and avoid buildings taller than **5 m** directly south of 90° bends (these hide the bend at 50° pitch). Lanterns get `camFade`. | world |
| Castle Steps and the Bell Tower climb | Stairs are mesh colliders: the NavGrid samples `physics.topAt`, and steps ≤ 0.3 m are walkable. If the tower climb has stacked floors, give each floor a **nav layer** (§12) or an authored `drop` / `hop` chain. | world, physics |
| Boss arenas | B1 r 12 and the B2 causeway fit at zoom 16 with framing. Pillars use the see-through hole. Arena fog-wall mist cards: from above, a ring of upright cards reads as a white "fence"; add a **ground mist ring decal** 2 m wide at r and lower the card height to 2.5 m. | world, fx |
| The Line (gate) | The winch is a framing anchor (§2.3). Spread the wave spawn points so that at most one spawns off-screen at zoom 14 at a time. | world |
| Pilfer chase (town) | Look-ahead on velocity (2 m) plus zoomies is enough. Keep chase corners ≥ 4 m wide (path smoothing). | enemies, world |
| Skyline, Dawnstone, far props | Hidden in play, shown in cutscenes (perf). The Dawnstone god-ray is moved to a **ground light pool** visible from above. | world |
| **Meme Cam spots** | The idle trigger works anywhere, but add 1 authored "best view" `memeSpot` per outdoor level (meadow: the Tallbert statue knoll; forest: the Mushroom Ring; gate: the causeway rampart). If she idles within 4 m of one, the MEME_LOOP yaw offset uses the spot's authored yaw (a tuned backdrop: fog bands and silhouettes behind her). | world, camera |
| **Ranged enemies: the on-screen rule** | A ranged attack (rat_xbow, spider web, bone bolt, Sage-style enemy volleys) may start only if the shooter is **inside the view frustum shrunk by 0.5 m** (`cam.onScreen(pos, margin)`) **or** within 9 m. `rat_xbow.keep` becomes **[6, 9]**, and hop-back stays. Crows circle at r 5 around the anchor (on screen) and dive only when on screen. | enemies (+ camera query) |
| Engagement distances | Melee sight stays 10–16 m. **Alerts that happen off-screen** play their "!" bubble at the screen edge (a threat arrow) so aggro is never invisible. | enemies, ui |
| Token orbit | Tokenless enemies orbit at 1.4× attack range: unchanged. From above that ring reads well. | — |

---

## 11. Tutorial and strings (story area; ui swaps the glyphs)

| Key | New text, KBM (pad / touch variants in brackets) |
|---|---|
| `tut.move` | Right-click to walk. Or use WASD. [Left stick] [Tap the ground, or use the stick] |
| `tut.jump` | Jump the fence [F]. [A] [Jump button] |
| `tut.combo` | Snip, Snap, Swoosh! [LMB ×3]: you swing toward the cursor. [X ×3, right stick to aim] [Tap ⚔ ×3, or tap the dummy] |
| `tut.roll` | Tumble past the sack [Shift]: toward your cursor. You can't be hurt mid-tumble. [B] [Tumble, or swipe it] |
| `tut.stand` | Hold the Stand [Space]. Block the Wobble Knight twice. [LB] [Hold 🛡] |
| `tut.parry` | Raise the Stand *just* as it swings. A white glint and a white wedge on the ground mean "parry me". |
| `tut.bright` | Hold ⚔ until it shines, then let go. The silver arc shows its reach. Bright Slash breaks cracked things. [Drag ⚔ to aim] |
| `tut.pounce` | Jump [F], then click in the air: Pounce where you point. Bounce off crows! |
| `tut.reflect` | Parry a bolt to send it back. Follow the dotted line. |
| `tut.companion` | [Q] Kitten ability: watch the ring on the bar. |
| `tut.golden` | Golden Hour: at full Valor, press [V] (or Stand + ⚔ together). |
| `tut.zoom` *(new, first boss or first arena)* | Scroll to zoom out. [R3] [Pinch] |
| `tut.click` *(new, 20 s into meadow if she hasn't used RMB or a tap)* | Tip: right-click a spot and she'll walk there on her own. |
| `tut.talk` *(new, first NPC)* | Click someone to talk. [Y] [Tap them] |
| `loading.tips` | Add: "Your aim ring's notch is where your sword goes." "Pressing the Stand plants your paws: perfect for Standing Ground." "Hold H to stand still and face the cursor." |

`tut.pearl*`, `tut.valor`, `tut.jeer`, `tut.line`, `tut.bones`, `tut.vigil`, `tut.milk` and `obj.*` only change glyphs.

---

## 12. Per-area change list

### core (`src/core/**`, config, events, tests contracts)
1. **Input.js:**
   - remove pointer lock in play (keep `requestPointerLock` for the Photo Mode free camera only) and drop `_resolveLockLoss`;
   - add `pointer`, `aim`, the actions `move zoomIn zoomOut peek stop`, `setVirtualTap`, `setVirtualAim(x, y)`;
   - the wheel produces zoom edges; Tab produces `lockon` and Shift+Tab `lockPrev`;
   - the right stick feeds `aim`, not `look`;
   - mouse activity counts only above a speed threshold;
   - support binding presets from `INPUT.presets[name]` (selected by `state.settings.controls`).
2. **config.js** (new tables, values from this doc): `CAMERA.iso`, `NAV`, `AIM`, `INPUT.presets`, and `PLAYER.guard.touchArc` (1.5708).
   ```js
   CAMERA.iso = { fov: 40, zoom: [9, 16], zoomDesktop: 12, zoomTouch: 11, zoomStep: 1, zoomDamp: 8, pitch: [0.803, 0.960] /*46°,55°*/,
     yaw: Math.PI, yawBlend: 1.5, focusY: 0.5, followDamp: 12, followDampY: 6, far: 120,
     lookAhead: { cursorFrac: 0.25, cursorMax: 2.5, velTime: 0.3, velMax: 2.0, max: 3.0, damp: 4 },
     peek: { max: 8, damp: 6, back: 0.4 },
     combat: { radius: 10, inner: 0.8, margin: 1.2, extra: 2, zoomMax: 14, centroid: 0.3, maxOffset: 3, outDamp: 2.5, holdIn: 1.5 },
     boss: { zoom: 16, bossWeight: 0.35, herInner: 0.6, bossInner: 0.85, liftNear: 0.4 },
     shake: { scale: 0.6, amp: 0.35, rollDeg: 1.5 }, parryPunch: { dz: -0.6, in: 0.08, out: 0.30 }, holyFov: 3,
     golden: { zoom: 9, dur: 0.8 }, meme: { swoop: 2.6, yawRate: 1.2, exit: 0.9, exitPx: 40 }, cutBlend: 0.8, handback: 1.0,
     fade: { coneNear: 0.4, coneFar: 1.2, opacity: 0.25, in: 0.15, out: 0.4 }, hole: { r: 0.11, feather: 0.3, depthBias: 0.8 } };
   NAV = { cell: 0.5, agentR: 0.32, minNy: 0.7, stepUp: 0.3, hop: { gapMax: 3.0, upMax: 1.2, dropMax: 3.0, lowWallMax: 1.05, wallThickMax: 0.8, cost: 4 },
     maxExpand: 6000, repathEvery: 0.5, maxPathsPerSec: 4, holdRetarget: 0.1, arrive: 0.25, slowR: 0.8, cornerLook: 0.6,
     stuck: { dist: 0.2, time: 0.5, retries: 3 }, snapSearch: 6, buildSliceMs: 8 };
   AIM = { magnet: 0.436 /*25°*/, magnetExtra: 1.0, pickPx: 36, pickPxTouch: 56, pickInteractPx: 40, autoRange: 4.5, autoAngle: Math.PI / 2,
     standSnapRange: 5, standSnapLead: 0.7, cursorReaimPx: 30, chargeTurn: 9.42 /*540°/s*/, padDead: 0.25, kbIdleCursor: 3.0 };
   ```
3. **events.js** (additive):
   - `player:order { kind: 'move' | 'attack' | 'use' | 'stop', point, target, valid }` (fx marker, audio click, ui);
   - `nav:ready { level, cells, ms }`;
   - `camera:zoom { zoom }`.

   JSDoc: `combat:telegraph` gains `attackId, arc, range`.
4. **debug.js** hooks:
   - `__GAME__.click(x, z, button = 'move')` (an RMB order at a world point);
   - `__GAME__.aimAt(x, z)`;
   - `__GAME__.nav.path(ax, az, bx, bz)`;
   - `__GAME__.cam.zoom(z)`.
5. Smoke harness: `t.click(x, z)`, `t.aim(x, z)`. Keep `t.hold('KeyW')`, which is screen-relative north at the default yaw.

### camera (`src/camera/**`)
1. New **`IsoCamera.js`** (follow, look-ahead, combat / boss framing, zoom, peek, shake mapping, punch-ins) as the `follow` mode inside `FollowCamera`, which stays the `ctx.cam` class for contract reasons.
   - `mode('lock')` becomes a no-op alias of follow (lock only sets `lockTarget`).
   - Delete the spring-arm orbit, auto-follow, shoulder offsets, `_avoid` and the lock separation math from the play path. Keep the arm sphere-cast for cutscene `collide` rails and the Meme swoop.
   - `cam.yaw` stays readable (the player's WASD basis), and `cam.pitch` reports the iso pitch.
2. **`screenToGround(ndc, out)`**, `cursorGround`, `cursorValid`, `onScreen(pos, margin)` and `project(pos, out)` (the shared helper for picking).
3. **LockOn.js:** becomes **FocusTarget** logic: cursor-distance cycling, no camera influence. `LockMarker` (3D) is replaced by fx ground rings, so camera emits only `lockTarget` changes.
4. **Occluders.js:** the cone test, multiple subjects (her plus up to 4 engaged plus the hover), opacity 0.25. Write the **see-through hole uniforms** (shared object from world) each frame.
5. **MemeCam.js:** the 2.6 s spherical swoop in and the 0.9 s exit, `memeSpot` yaw, and the cursor-jitter exit threshold.
6. **CutsceneCamera:** the default blend from the iso pose takes 0.8 s with spherical interpolation around the subject; hand-back takes 1.0 s.
7. Zone yaw blending from `levels.current.zoneAt(pos).camYaw`.
8. Set `env.setFogFocus(focus)` every frame in play, and `null` in cutscene and meme modes.

### player (`src/player/**`)
1. New **`Intent.js`**: orders, path following, attack-move, use, the stuck logic, hover state (`player.intent.hover`), `stop`.
   - `wishDir()` returns WASD / stick first, otherwise the path steering vector.
   - The splash `moveLockT` also clears the path.
2. New **`aimDir(out)`** (§4.1) used by `startAttack`, `startDodge`, charge turning, Pounce and the Stand.
   - `aimAssist()` → the magnet cone (`AIM.magnet`, `range + magnetExtra`) around `aimDir`, not facing.
   - Touch / auto-target ranking (§4.1).
3. **Stand:** the threat snap on press, cursor re-aim after 30 px, touch auto-face, `guard.touchArc`, and plant (cancel the path) on press.
4. **Charge:** turn toward the aim at 540°/s. Expose `chargePreview { id, range, arc }` for fx.
5. **Pounce:** dive toward the cursor point (≤ 3.5 m horizontal) with crow magnetism within 2.5 m of the cursor.
6. **Assisted hop** on nav links: compute the launch so the landing hits the link target (vy = jumpV; horizontal speed = distance / airtime, clamped to 5.5 m/s; it falls back to a plain jump if the clamp is hit).
7. **Jump direction:** current velocity; standing → vertical.
8. **Tumble direction:** WASD → cursor → facing (KBM); stick → aim → facing (pad); stick → away from the soonest threat → facing (touch).
9. **MemeCamTrigger:** idle uses the new activity rule (cursor movement below the threshold doesn't count). The manual trigger is unchanged.
10. A click on an NPC or interactable with LMB outside combat converts to a `use` order.
11. Tests: Intent unit tests (path cancel rules, attack-move ranges, unreachable snapping) and aim tests (magnet cone, threat snap ordering).

### physics (`src/physics/**`)
1. New **`NavGrid.js`** (pure, node-testable): a 0.5 m grid over the level bounds. Per cell it stores (Uint8 flags, Float32 height):
   - `walkable` = in bounds, `!blockedAt(x, z, agentR, h + 0.05, h + 1.0)`, not `isDeepWater`, `normalAt(x, z).y ≥ 0.7`, with height from `topAt(x, z)` (so bridges, decks and stairs count);
   - `edgeOK(a, b)` = |Δh| ≤ stepUp × √2 for diagonals.
   - **Build:** time-sliced at 8 ms per frame under the loading veil. Meadow at 200 m is 160 k cells, an estimated 0.3–0.8 s in total. Cache it per level id plus a hash of the flag set. Emit `nav:ready`.
   - **Dynamic:** `addCollider`, `removeCollider` and `updateCollider` re-rasterise the collider's AABB plus agentR (the portcullis, arena fog walls, broken boulders, The Line's barricades). Arena fog walls block while locked.
   - **Auto links:**
     - `hop` over a non-walkable run ≤ 3.0 m between walkable cells with Δh ≤ 1.2 (up) or ≤ 3.0 (down), checked by a 2D scan along 8 directions from the boundary cells, capped at one link per 1.5 m of edge;
     - `wall` hops over static colliders with y1 − ground ≤ 1.05 and thickness ≤ 0.8 (fences);
     - authored `navLinks` from the level;
     - link cost = length + 4 m.
   - **Optional nav layers** for multi-floor structures (keep / the Bell Tower): `navLayers: [{ rect, y0, y1 }]` builds a second grid sampled with `groundAt(x, z, fromY)`. Only add this if M3's keep needs it.
2. **`findPath(from, to, out, opts)`:**
   - A* (octile, binary heap on typed arrays, max 6000 expansions; on overflow, return a partial path to the best node);
   - **string-pulled** with a grid DDA line-of-sight;
   - links appear as waypoints `{ x, z, link: 'hop' | 'bounce' | 'drop', to }`.
   - `nearestWalkable(x, z, maxR)`, `losWalkable(a, b)`, `isWalkable(x, z)`.
3. Debug overlay in PhysicsDebug (`?debug`: walkable cells tinted, links drawn).
4. Tests: NavGrid on a synthetic level (a wall with a gap, a stream with stumps, a 1 m fence), path optimality within 5%, and partial-path behaviour.

### combat (`src/combat/**`)
1. `assistTarget(actor, range, angle, dir?)`: accept an explicit **aim direction** (the cone axis) instead of the actor's facing, and add the ranking hooks for the auto-target (windup-soonest, last attacker).
2. **Holy wave and Gleam** fire along the swing's facing (already set from `aimDir` at swing start): no change beyond verifying it.
3. **Projectile reflect:** reflect toward **the cursor or aim** if an enemy lies within ±25° of it; otherwise back to the shooter (as now).
4. Expose `ATTACKS[id].arc` to fx through the telegraph payload (enemies send it) and the charge preview (player).

### ui (`src/ui/**`)
§9 in full:
- cursors;
- the ability bar (plus the companion portrait moved into it);
- the settings additions and the control presets;
- glyph map updates;
- the controls card;
- remove the lock reticle;
- threat arrows at 12 m.

**touch.js rework (§7):**
- remove look-drag;
- tap-to-order on the playfield (`input.setVirtualTap`, with picking done by the player Intent using `cam.project`);
- pinch zoom;
- attack-button drag-aim with a cancel zone;
- Tumble swipe;
- the new arc layout.

### fx (`src/fx/**`)
1. **Ground decals:**
   - her **aim ring** with the notch and Stand arc (gold flash in the parry window, cracked at 0 Grit);
   - hover ring (white), focus ring (gold, rotating 0.5 rev/s), interactable ring (gold, soft);
   - move marker paws and the path preview;
   - **charge reach wedges** and the holyWave lane;
   - the Golden Hour gleam lane;
   - **drop shadow** while airborne and the Pounce landing circle;
   - **contact blobs** under all actors (r = radius × 1.1, alpha 0.35; Low quality: only her plus engaged enemies).

   One decal pool shares the Telegraphs decal shader.
2. **Telegraphs:**
   - the **strike wedge** for `parry` / `gold` (outline plus a sweep fill, the rim flash at parry-window open, tied to the difficulty window) and the **filled red wedge**;
   - glint / "!" with `depthTest: false`, ×1.15 scale, and the leader line;
   - a faint purple jeer disc.
3. **MistCards:** the 2-layer **mist veil** with a hole around her (§2.7); arena fog walls get a ground mist ring and 2.5 m tall cards.
4. **SwordTrail:** width ×1.3 for top-down readability, and a brief ground **slash smear** decal (0.15 s, alpha 0.25) for heavy swings.
5. A ground **parry spark ring** at the contact point.

### world (`src/world/**`)
1. **Env / HeightFog:**
   - focus-relative fog (`setFogFocus`, clearR 4, k 1.6);
   - the hole uniform patch for `camHole` materials;
   - shadow frustum ±14 m (±18 m for bosses);
   - background = fogColor;
   - hide the skyline in play.
2. **Levels:**
   - per-zone `camYaw` (defaults π; consider the town east–west streets);
   - `navLinks` / `navBlock` (the stumps, the Treetop ledges plus their lower step, Waffles' crates, the mushroom caps with the `bounce` kind, the meadow jump fence gated on `tut.jump.done`);
   - `memeSpot` per outdoor level;
   - wheat flattening near enemies;
   - check the town alley width ≥ 3 m and the building heights on south sides;
   - mark solid occluder materials `camHole`;
   - the Dawnstone light pool;
   - The Line's winch framing anchor (`level.camAnchors`).
3. **Grass:** wider blades, LOD radius 22 m from the focus, the albedo tweak.
4. **Level.js:**
   - `interactAt(id)` already exists as `interact(id)`;
   - expose `interactables` with `{ id, pos, r, kind, enabled }` for the picker (read-only);
   - E prefers the hovered interactable (`player.intent.hover`).

### enemies (`src/enemies/**`)
1. Telegraph payload: `attackId`, `arc`, `range`, `windup`.
2. **On-screen rule** for ranged starts (`cam.onScreen(pos, 0.5)`, or within 9 m); `rat_xbow.keep` becomes [6, 9]; crow dives only on screen.
3. Off-screen alerts: keep emitting the existing alert event; ui draws an edge ping from it (no fake telegraph).
4. Review the boss move ranges against zoom 16 (B2's Laugh Quake, a shockwave to 7 m, fits; the Grizzlechop Wheel Ride lane needs a visible lane telegraph from above, `lane` shape: check).

### companions (`src/companions/**`)
1. Sage's Volley targets the cursor point / hover (max 10 m) with the indicator; Mochi and Clover cast on self (unchanged).
2. Follow offsets: keep them off her aim notch side when idle, so the ring stays readable (follow at her back-left or back-right, ≥ 1.4 m).

### characters (`src/characters/**`)
1. **Readability from above:**
   - the **pink bow** gets +15% scale and a slight emissive (0.08), so it pops from 12 m (it is her identifier in a crowd);
   - her **helmetless head top** (ginger) is the main top-down read and is already fine;
   - the **cape** tip gets a lighter trim stripe (2 cm) so her back and facing read from above;
   - the sword's flat side catches the sun: raise the blade's specular slightly.
2. **Silhouette pass** (§2.6.3) for her, Med/High.
3. Enemies: no scale change (hitboxes). The pug helmets and hyena heads already read; rat kettle helms are fine.
4. Check the fur shell LOD for the top-down distance: at 12 m with 79 px tall at 1080p, `furShells` can **drop one tier** for every actor except her. That is a perf win, especially on mobile.

### story (`src/story/**`)
- §11 strings, plus the glyph tokens per device.
- The meadow tutorial order gains the `tut.click` / `tut.talk` beats.
- The fence lesson gates the nav link (flag `tut.jump.done`).
- Check scenes that end with "she walks to X": the hand-back now goes to the iso camera, so CS-04's "facing up the path" fix is no longer needed but is harmless.

### audio (`src/audio/**`)
- A soft UI "paw tap" on `player:order` (move; −18 dB; a randomised pitch so repeated clicks aren't grating).
- An invalid-order "mrr?" chirp (−20 dB).
- Positional sounds: the listener is at the **focus** (her), not the lens (a 12 m arm would push everything quiet and far).

### save (`src/save/**`)
- `settings` gains `controls`, `zoom`, `lookAhead`, `pathPreview`, `holdAttack`, `standAutoFace`, `cursorSize`, `cursorContrast`, `aimRingOpacity`, `wedgeThickness` (migrate: defaults).

---

## 13. Accessibility summary
- Five control presets, including mouse-only and keyboard-only. Every hold action has a toggle (Stand and charge already do).
- **Stand auto-face** (on), **Auto-Stand** (touch default on), **hold-move-on-enemy keeps attacking** (touch and Kitten on).
- Cursor sizes ×1 / 1.5 / 2 plus high contrast. Aim-ring opacity. Wedge thickness 2 / 3 / 4 px.
- Telegraphs are shape + colour + sound + **ground geometry** (the wedges add a fourth channel), plus the existing pattern overlays.
- Reduce camera motion: no look-ahead, no combat zoom, no punches.
- Touch: guard arc ±90°, parry window +0.05 s, aim magnet ±90° / 4.5 m, tap-to-target, and no gestures that need two thumbs at once except the optional pinch.

---

## 14. Rollout plan and acceptance

**Phase A (core + camera + player, the playable switch):**
- Input pointer / presets, IsoCamera, `aimDir`, the Stand snap, WASD on the fixed yaw, direct-line click-move (no pathing yet; stop at obstacles), the aim ring decal, and the fog focus.
- Acceptance: meadow practice is completable with KBM and pad; `slice:meadow` passes with `t.click` replacing the movement holds where the yaw assumption broke.

**Phase B (physics NavGrid + Intent + touch):**
- Pathfinding with links, attack-move, use-on-click, the touch rework.
- Acceptance: a click from the meadow start to the exit (30, 92) arrives in ≤ 1.1× the spine length; Stump Crossing is crossable by a single click on the far bank; mobile viewport (844 × 390, `hasTouch`) smoke plays practice and the first rat pack with taps only.

**Phase C (fx + ui + enemies polish):**
- Wedges, rings, markers, the mist veil, the ability bar, cursors, the on-screen rule, the see-through hole.
- Acceptance: screenshots at zoom 12 and 16 in meadow, forest night, town Lantern Alley, the B1 mill and The Line show (1) her fully visible (the hole or silhouette works), (2) every melee windup wedge visible, (3) fog under 10% on her and 15–30% at the screen edges.

**Phase D (world + story + Meme Cam):**
- Zone yaws, nav links, memeSpots, strings, the swoop.
- Acceptance: `flow:*` passes; the Meme Cam swoop never clips geometry (sphere-cast check in smoke at 3 memeSpots); a frame-time check that calls and tris are ≤ the current numbers at Med (expected lower).

**Test impact:**
- Smoke blocks that hold `KeyW` to approach something assume a camera behind her; at the fixed yaw W is world north. Audit the `player:*`, `camera:*`, `slice:*` and `flow:*` blocks and replace approaches with `t.click(x, z)` or `__GAME__.teleport`.
- Camera smoke (`camera:boss-frame`, lock / shoulder tests) must be rewritten for the iso framing. `ui:touch` needs the new layout.
- Units: core contracts (new config tables), physics NavGrid, player Intent and aim.

---

## 15. Rejected alternatives (short)
- **Free-rotating iso camera (Q/E rotate):** it brings back the camera management the user complained about and fights WASD screen-relative muscle memory. Per-zone authored yaw plus the see-through holes solve occlusion instead.
- **Pure click-to-move (LoL, no WASD):** dodge and parry micro suffers; Hades-style players expect WASD. Both are kept.
- **Stand on RMB with move on LMB (Diablo) as the default:** a valid preset, but LMB as move makes "attack toward the cursor" need a modifier, and the user asked for LoL.
- **Orthographic projection:** it flattens the misty depth, makes the existing fog and height-fog shaders less expressive, and breaks the cutscene preset FOVs.
- **Auto-attack on hover (LoL auto-attacks):** it would undercut the combo, charge and parry skill expression. It is offered only as the "hold move on an enemy" assist.
