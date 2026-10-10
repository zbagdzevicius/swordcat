# SWORDCAT controls rework: the "LoL purist" proposal

Author: senior game/UX design pass, 2026-10-09. Status: proposal, not yet binding. Once accepted, core folds it into GAME_DESIGN §7, §8.3, §14, §15 and §19 as v2.2.

User request: *"make this game controlled like League of Legends rather than pure 3rd person from the back (it's hard to navigate and it's not mobile friendly), rework what's needed for the best experience."*

Angle of this document: **LoL purist on desktop** (right-click to move with pathfinding, right-click an enemy to auto-attack and chase, QWER aimed at the cursor, A-move, S stop, Space centres the camera, fixed isometric camera, scroll zoom, Y toggles the camera lock, edge pan). **Wild Rift on touch** (joystick plus an auto-targeting attack button plus drag-to-aim abilities, with tap-to-move as a bonus). **Twin-stick ARPG on gamepad.** One camera serves all three.

Sources read: GAME_DESIGN §6.6, §7, §8, §9.2, §12.1–12.2, §14, §15, §19.2; `src/core/Input.js` and `config.js` (INPUT, CAMERA, PLAYER), `src/camera/FollowCamera.js` and `Occluders.js`, `src/player/Player.js` and `PlayerStates.js`, `src/ui/touch.js`, `src/world/Level.js` (`_updateInteract`), `src/physics/Physics.js` and `StaticColliders.js`, `src/world/Env.js`, the level files (meadow, forest, town, gate), and `src/audio/AudioManager.js`.

---

## 0. TL;DR

| Topic | Today | Proposal |
|---|---|---|
| Camera | 3.6 m orbit behind her, mouse look, pointer lock, spring arm, lock-on orbit | **Fixed-yaw isometric camera.** Pitch 55°, FOV 35°, distance 16 m (touch 13 m), zoom 10–22 m. Per-level yaw. No pointer lock. |
| Move | WASD relative to the camera | **Right-click (hold to steer)** with nav-grid A* pathfinding and auto-vault links. Touch: joystick or tap-to-move. Pad: left stick. |
| Attack | LMB per swing, combo by timing | **Right-click an enemy** = auto-attack and chase. The loop runs Snip, then Snap, then Swoosh on its own. A-move. S stop. H hold. |
| Specials | LMB hold (charge), RMB (Stand), Shift (Tumble), V (Golden), Q (kitten), R (milk), C (meow), Space (jump / Pounce) | **Q** Valor Slash (hold to charge: Swoosh, then Bright, then Holy) · **W** Stand (hold; parry on timing) · **E** Tumble toward the cursor · **R** Golden Hour · **D** kitten ability · **F** Pounce (leap to the cursor) · **1** Milk · **T** Meow |
| Aim | Body facing plus a 60°/3 m assist | **Cursor ground point.** 25° / +1 m magnet on the cursor ray. Quick cast by default; normal cast and quick cast with indicator are options. |
| Interact | Walk within 1.5 m, press E | **Right-click the object** (she walks there and uses it). **G** = use the nearest one. Touch: tap it. Pad: Y. |
| Parry from above | White glint on the weapon, `!` | Adds a **ground attack wedge** that fills over the windup, plus a **closing approach ring** that meets the enemy's base on the active frame. Screen-constant glints. Her ±70° Stand fan is drawn on the ground. |
| Fog | FogExp2 measured from the lens | **Focus-relative fog** (depth minus (camDist − 3 m)) × 1.6, plus low ground mist, plus drifting over-camera mist sheets and an edge mist vignette. The mist gathers toward the top of the screen and never sits on her. |
| Occlusion | Fade along the lens-to-her segment | Same fader, but tested against a **capsule** from the lens to her, her target and her path point. Canopies and roofs on the camera side fade. An **always-on hero ring and x-ray silhouette.** |
| Mobile | Joystick, drag to look, 8 buttons | **No look drag.** Pinch to zoom. Auto-target attack button. Drag-to-aim QWE/D/F with a cancel zone. Tap to move, tap to attack, tap to talk. Left-handed mirror. |

---

## 1. Design goals and non-goals

1. **Navigation becomes trivial.** You point where to go and she goes there, around stones, fences, houses and water. The camera never needs steering.
2. **The action-combat soul survives.** Parry timing, Purrfect Dodge, Standing Ground, Riposte, Holy charge and Pounce chains all stay skill expressions. They become *aimed abilities* instead of *facing-relative buttons*. Hitstop, slow motion and the juice table are unchanged.
3. **One camera for every device.** A fixed isometric camera is the most thumb-friendly 3D action camera that exists (Wild Rift, Diablo Immortal, Brawl Stars).
4. **The misty, cosy mood survives a top-down view.** Fog is re-expressed for that view (§2.7). The cinematic shots (cutscenes, Meme Cam, PULLBACK) stay third-person close-ups. They gain a dramatic "dive down from the tactical view" transition.
5. **Non-goals.** No minimap in this pass (optional, §8.9). No unlocked-camera scouting beyond a 25 m leash (this is a story game; sleeping far enemies and fog stay meaningful). No rebinding UI in the MVP beyond presets (§11).

---

## 2. Camera

### 2.1 Projection and default framing

| Parameter | Desktop | Touch | Notes |
|---|---|---|---|
| Projection | Perspective | Perspective | A low FOV gives a near-isometric look but keeps the fur, cape and fog depth. Orthographic is rejected: it breaks fog, shadows and the cutscene blends. |
| Vertical FOV | **35°** | **35°** | Fixed in play. The Holy punch is **+3°** for 0.15 s (was +5°: a narrow lens magnifies it). |
| Distance (lens to focus) default | **16 m** | **13 m** | Remembered per device in `settings.camZoom`. |
| Zoom range | **10–22 m** | **10–17 m** | Wheel step 1.5 m. Pinch is continuous. Eased with damp λ 10. |
| Pitch (down from horizontal) | **pitch(d) = lerp(50°, 60°, (d − 10) / 12)** → 55° at 16 m | same → 51.6° at 13 m | Closer zoom gives a lower, more heroic angle with more mist and horizon drama. Farther zoom gives a more tactical view. |
| Yaw | **Fixed per level** (`level.camYaw`) | same | No rotation in play (purist). See §2.2. |
| Focus height | her feet + 0.6 m | same | The look point. |
| Near / far | 0.5 / 120 m | same | far 120 (was larger): only the fog-capped ground is ever visible. |

**What the player sees at the default (16 m, 55°, 16:9):** ground about **18.0 m wide** at her depth, **7.9 m ahead** (up-screen) of her and **5.1 m behind** (down-screen). Her on-screen height is about 10% of the screen height: **72 px at 720p, 108 px at 1080p**, and **~48 px on a 390-px-tall phone at 13 m** (Wild Rift champions are 45–60 px). Crossbow rats shoot from up to 18 m, so they can be off screen. The existing off-screen threat arrows cover that; their trigger is widened to 20 m.

**Framing offset:** the focus sits **0.8 m up-screen** of her (she is at about 45% from the bottom), because forward space matters more than space behind her.

### 2.2 Yaw per level (fixed, purist)
- `defineLevel({ camYaw })` in radians. **Up-screen** = the direction from the level's `start` toward its exit or boss. Default when omitted: the bearing from the first spine point to the last.
  - meadow: north (+Z), start (0, −80) to exit (30, 92)
  - forest: north
  - town: north (South Gate at z −63, Bell Tower at z +55)
  - gate: **south** (start (0, 58) facing π, causeway toward z −)
  - bog and keep: authored in M3
- **Yaw zones (exception, opt-in, max 1 per level):** `camZones: [{ rect, yaw, blend: 1.5 }]` for a set piece whose main axis turns more than 60° (candidate: the town Post Office chase). The blend runs only while she walks and is never mid-fight. The purist default is none.
- A cutscene may end at any yaw. The handback (§2.6) always returns to `camYaw`.

### 2.3 Camera lock, centring, edge pan

| Control | Behaviour |
|---|---|
| **Locked (default; always on touch)** | The focus follows her plus a lead. **Cursor lead (KBM):** 12% of (cursor ground point − her), max 2.0 m, damp λ 3. **Velocity lead (all devices):** vel × 0.3 s, max 1.6 m, damp λ 2.5. The leads add up, capped at 2.4 m. |
| **Y** | Toggle lock (toast "Camera unlocked / locked"). Saved in `settings.camLock`. |
| Unlocked: **edge pan** | Cursor within **12 px** of a window edge → 18 m/s (× `settings.edgePanSpeed` 0.5–2). Off while a cast indicator or a drag is active. Off when the window is unfocused. |
| Unlocked: **middle-drag pan** | 1:1 ground drag (grab the ground). |
| Unlocked: leash | Focus at most **25 m** from her (soft clamp, rubber band over the last 3 m). |
| **Space (hold)** | Centre on her and follow while held (LoL). A tap snaps back over 0.25 s. **F1** = same. |
| Auto-recentre (option, default on) | When unlocked and she takes damage or an enemy alerts within 8 m while she is off-screen, the camera glides back over 0.4 s. |
| Gamepad | Always locked. R3 cycles zoom presets 12 / 16 / 20. |

### 2.4 Combat, boss and special framings

| State | Rule |
|---|---|
| Explore | Default distance and pitch(d). Lead as in §2.3. |
| **Combat** (alerted hostile within 10 m, or an AA target) | Focus = weighted centroid (her ×2, each engaged enemy within 10 m ×1), clamped to 3.0 m from her. Distance = max(user zoom, the fit distance that keeps her and every engaged enemy within 80% of the screen), capped at user zoom + 3 m. Ease 0.8 s in, 1.5 s out (out starts 2 s after the last engaged enemy). **Never zooms in on its own.** |
| **Boss** (`boss:start`) | Distance = clamp(fit(her, boss, margin 20%), 16, 21) (touch 14–18), ease 0.6 s. Focus = lerp(her, boss, 0.35), clamped 5 m from her. Tall bosses (> 1.6 m) lift the focus by 0.3 × (height − 1.6). Cheese Mill (r 12): about 19 m frames most of the ring. Causeway (12 × 40): frame her plus the boss and let the long axis run up-screen (gate yaw = south does this). |
| Charge (Q held) | Distance −1.0 m and FOV −1° (replaces 3.6 → 3.3 m / 45° → 42°). |
| Holy | FOV +3° punch for 0.15 s and distance −0.6 m for 0.25 s. |
| **Golden Hour activation** | Dolly in to 60% of the current distance and pitch −6° over 0.25 s. Hold through the 0.8 s Oath. Ease back over 0.6 s ("ref1 framing" from above). |
| Hurt or parry | Shake only (§2.5). |
| Dialogue (`dialog` mode) | Ease focus to the speaker midpoint, distance −25%, 0.5 s. The HUD dialogue box stays at the bottom. The camera stays isometric (no cut). |
| Arena lock | No change. The fog-wall ring is visible from above, and that is the readable arena boundary. |

### 2.5 Shake retune
The trauma model is unchanged (§8.2 numbers). The output mix changes: **rotation × 0.5** (a narrow lens magnifies angular shake) and **translation × 2.0** (16 m away, 4 cm is invisible). Max translation 0.35 m, max rotation 1.2°. `settings.shake` still scales everything.

### 2.6 Cutscenes, Meme Cam and handback
- `CutsceneCamera`, `presets.js`, `MemeCam.js`: **no change** to any shot. The close third-person presets are the cinematic language, and now they contrast with gameplay.
- **Handback:** blend from the last shot pose to the iso pose over **0.8 s** (ease in-out sine) along a **crane arc**. The position is interpolated in spherical coordinates around the focus, so the lens rises up and away from her instead of sliding through the ground. If the angular distance is over 120° or the positions are more than 30 m apart: cut under a 0.25 s veil fade.
- **Meme Cam entry (2.0 s):** the same crane arc in reverse. It **descends from the tactical view into MEME_LOOP**: distance 16 m → MEME_LOOP pose, pitch 55° → about 5°, the existing MEME_YAWS clear-view search picks the end yaw. Mist ×2 and HUD fade as before. **This is the new showpiece moment: the world zooms down out of the strategy view into the viral close-up.** Exit 0.6 s on the same arc.
- **PULLBACK (CS-08) and CRANE_DOWN** end on, or start from, the iso pose. This is free continuity.

### 2.7 Fog, mist and visibility retune (the mood)
From 55° with FOV 35° **no sky is visible** (the top ray is 37.5° below the horizon). The fog colour *is* the far ground, which suits the misty-field identity. Plain lens-distance FogExp2 would fog **her** (0.045 at 16 m = 40% on the hero), so:

1. **Focus-relative fog** (world Env; one global shader-chunk patch):
   `fogFactor = 1 − exp(−(ρ · max(0, depth − fogNear))²)`, where `fogNear = camDist − 3 m` and `ρ = presetDensity × isoMul`, with **isoMul 1.6**.
   - Results at 16 m: her about 5%, the bottom edge 0%. The top edge is **31%** (meadow 0.045), **49%** (forest_day 0.06), **59%** (bog 0.07).
   - Mist thickens up-screen, where the path leads. Golden Hour ×0.5 and Jeer +0.01 keep working because they act on the density.
   - Implementation: `scene.fog` becomes an `IsoFog` object with `isFog = true` and `isFogExp2 = true`. three's uniform refresh then writes `fogNear` and `fogFar`, and the program still compiles the `FOG_EXP2` branch. Env writes `fogNear = camDist − 3` and `fogFar = ρ` every frame. A patched `ShaderChunk.fog_fragment` (FOG_EXP2 branch) reads `fogNear` as the offset and `fogFar` as the density. No per-material work is needed. Custom shaders that include the fog chunks (grass, fur shells, mist cards) inherit it. Any shader with its own fog maths must be audited (fx, characters).
   - The clamp 0.005–0.12 still applies to `presetDensity`. isoMul is applied after it.
2. **Ground mist (height fog) layer:** a 0.0–0.8 m band above the local ground gets an extra +0.25 × (1 − h / 0.8) fog mix. Characters' feet sink into mist and their bodies stand clear. This is the most "misty fields" read from above. It is cheap: the world-space y is already in the patched chunk through `vFogWorldY`.
3. **Over-camera mist sheets** (fx MistCards): 3–5 large soft quads at **3–7 m above her**. They drift with `env` wind at 0.6–1.2 m/s, opacity 0.10–0.22, and wrap in a 40 m grid around the focus.
   - A **3 m screen-space hole around her** (they fade where they would cover her) and none over a winding-up enemy.
   - Parallax under a fixed camera gives the "looking down through clouds" feeling.
   - Density × env fog (none in town interiors). ×2 in Meme Cam as before.
4. **Edge mist vignette** (core PostFX): the fog colour at 0.0 at the centre to **0.22** at the corners. Smoothstep from 0.55 to 1.0 of the screen radius. Reduced by Golden Hour. Off with "reduce flashes / clarity" (§11).
5. **The far skyline** (meadow bell, Tallbert): invisible in play now. It stays for cutscenes and Meme Cam. **Optional:** a 2-D parallax "horizon band" painted in the top 6% at the max zoom of 22 m is skipped (purist: the mist is the horizon).

### 2.8 Occlusion from above
At 55°, a tree canopy, roof, standing stone or eave within about 5 m **down-screen** of her covers her.

- **OccluderFader stays.** Its test changes from "segment lens → her" to a **capsule** from the lens to each subject point:
  - her chest (r 0.8 m)
  - her AA or hovered target (r 0.6)
  - her current path waypoint 3 m ahead (r 0.4)
  - the cursor ground point when a cast indicator is open (r 0.4)
  The check stays at 20 Hz. Faded opacity is **0.25** (was 0.3).
- **Canopy rule:** any `camFade` unit whose bounding sphere centre is within **6 m** of her on the camera side (dot(toProp, toCam) > 0) and taller than 2.2 m fades, even when the capsule only grazes it. This stops trees popping in and out as she walks under them.
- **Roof rule (town and hub):** a `camFade: 'solid'` building fades when she is inside its footprint expanded by 2.5 m on the camera side. **Roof-only cutaway** is optional when world tags roof meshes `userData.camRoof = true`: only the roof fades to 0, so the walls keep the street readable.
- **The spring arm, boom avoidance, lens grid and lock-on LOS are deleted.** At 10+ m altitude and 55°, terrain never blocks the lens. That removes about 450 lines of FollowCamera.
- **Hero is always visible:**
  - **Hero ring:** a gold `#FFD34D` 0.55 m ground ring (0.06 m wide), drawn with depthTest off at 0.65 opacity.
  - **X-ray silhouette:** her body, armour and sword drawn a second time with `depthFunc: GreaterDepth`, flat `#FFD34D` at 0.45. Fur shells excluded. It shows only where something hides her.
  - **Enemies in windup** get the same pass in their telegraph colour (white, gold or red), so a telegraph can never be hidden.

### 2.9 Shadows, LOD, audio listener (side effects of the new camera)
- **Sun shadow frustum** (world Env `SHADOW_HALF` 20): centre it on the **camera focus**, not on her, and scale the half-size to 0.65 × visible ground width (min 12, max 18 m). Shadows from above are the best depth cue in the scene: keep 2048 on Med and High, 1024 on Low.
- **Fur LOD and quality switches keyed on lens distance** (characters, enemies, companions): the lens is now always at least 10 m away, so every "close" LOD would switch off. Re-key every LOD to **distance from the camera focus** (`ctx.cam.focus`), or multiply the thresholds by `ctx.cam.distance / 3.6`. Hero shells: full within 25 m of the lens; at 16 m use Med `furShells`.
- **Audio listener:** today it is a child of `ctx.camera`. At 16 m every 3D voice is attenuated. Move it to `cam.focus + (0, 2.5, 0)` with the camera's orientation (an audio-owned Object3D synced in render). Keep panning screen-relative.
- **Draw calls:** the iso view sees about 18 × 13 m of ground instead of a 40 m+ corridor to the fog line, so expect **fewer** scene calls on the meadow and forest. Town rooftops are the exception. Re-measure (§18 budget).

---

## 3. Movement and pathfinding

### 3.1 Commands (desktop)

| Input | Result |
|---|---|
| **RMB click on ground** | Path to the point. A green chevron marker (§8.2). |
| **RMB hold** | **Steer:** re-target the cursor ground point at 10 Hz. Direct steering when the straight line is clear, otherwise re-path (max 1 A* per 100 ms). |
| RMB on an enemy | Auto-attack target (§4.3). A red marker under the enemy. |
| RMB on an interactable, kitten, NPC or pickup | Path to its use radius, then use it (§7). A gold marker. |
| **A then LMB** (or A alone with "attack-move on cursor") | **Attack-move:** path to the point. On the way, acquire the nearest hostile within **4.5 m of her** and fight it. Resume the move when it dies. |
| **S** | **Stop:** clears path, AA target and queued command. Does not cancel a swing, charge or Stand. |
| **H** | **Hold position:** no movement. Auto-attacks anything that enters 2.4 m. Released by any move command. |
| Shift + RMB | Queue a waypoint (LoL shift-queue, up to 4; shown as thin dotted lines). |
| Click unreachable | Path to the nearest walkable cell within 6 m of the click (BFS). If none: a red ✕ marker, a soft "mrr?" `ui/error`, no move. |

Run speed is unchanged: **5.5 m/s**, accel λ 14, decel λ 18, facing λ 16. **Zoomies** still trigger after 2.0 s of unbroken path-following with no alerted enemy within 15 m (7.2 m/s). That suits long clicks. **Walk 2.0 m/s** remains for joystick partial tilt only. Arrival: decelerate inside 0.6 m, stop at 0.15 m. **Charge walk** (Q held) is 40% (2.2 m/s) and **Stand shuffle** is 1.2 m/s while following the path.

### 3.2 Touch and gamepad movement
- **Touch joystick** (left 40% of the screen, floating, r 60 px): direct movement, **screen-relative** (fixed yaw, so screen-up = `camYaw` forward). Any joystick input cancels a path. **Tap on ground** anywhere outside the stick zone and the buttons = move there (path). A **double-tap** = attack-move.
- **Gamepad left stick:** direct movement, screen-relative, dead zone 0.15. Partial tilt ≤ 0.5 walks.
- **Classic-feel note:** because yaw is fixed, stick movement never drifts with the camera. That is the single biggest fix for "hard to navigate".

### 3.3 Nav grid (physics-owned; new `physics/NavGrid.js` + `physics/Pathfinder.js`)
- **Bake per level** on `level:loaded`, under the loading veil.
- **Cell size 0.5 m** over the level square: meadow and forest 200 m → 400 × 400 = 160 k cells; town and keep 140 m → 78 k.
- **Data per cell:**
  - `Uint8 flags` (walkable, water-shallow, deep, steep, bounds, vault-edge, link)
  - `Float32 h` (surface height = `physics.topAt` including walkable static tops)
  - `Uint8 cost` (shallow water ×3 so paths avoid it, web patch ×4 dynamic, near-hazard ×1.5)
  - About 1 MB per level. Bake budget under 60 ms (hash lookups only).
- **Walkable** = in bounds, not deep water, terrain normal.y ≥ 0.7, and the agent cylinder (**r 0.32 + 0.08 margin**, h 1.0) does not overlap a non-walkable static at that surface height (`statics.overlaps`) or mesh architecture (octree capsule test). Ring colliders (arena fog walls) are walls.
- **Neighbour rule (8-connected):** |Δh| ≤ **0.30 m** (stepUp) is a normal edge.
- **Auto vault links** (her hop, the existing jump physics: v₀ 7.4, apex 1.245 m):
  - **Up:** a target cell up to **1.1 m** higher within 1.0 m (cost +2 m).
  - **Down drop:** a target cell up to **4.0 m** lower within 2.0 m (cost +1 m). No fall damage, so this is safe.
  - **Over:** a blocked band of 1 to 2 cells (a ≤ 1.0 m fence, `walkable` top ≤ 1.05 m, or a gap ≤ 2.6 m over a pit or deep water), crossed from one walkable cell to the opposite one (cost +3 m).
  - Links are flagged and shown as tiny arc glyphs on the path preview.
  - The **1.5 m meadow perimeter fence** and anything over 1.1 m are never vaultable.
- **Authored links** (`defineLevel({ navLinks: [{ a:[x,z,y?], b:[x,z,y?], kind: 'jump'|'bounce'|'climb'|'drop', when? }] })`):
  - Mushroom Ring cap chain: ground → cap 1 (1.0 m), cap 1 → cap 2 (bounce), …, cap 5 (5.2 m, Heart Bell).
  - Treetop root steps 0.75 → ledge 1.5 m.
  - Town loft ledge (y 6, a `climb` played as a 3-hop scramble).
  - Gate ledge stair (already steps ≤ 0.3, so none needed).
  - `when` is a state condition for set pieces (a portcullis).
- **Layers:** single-layer heightfield of the top walkable surface. Overhead colliders that must not cap the ground (the town loft ledge, bridge-like overhangs) carry `nav: 'ignore'`; use an authored link instead.
- **Dynamic rebake:** `addCollider`, `removeCollider` and `updateCollider` mark a dirty rect (AABB + 0.5 m). Rebake on the next step (portcullis, arena fog walls, Mochi's Shield Wall is **not** baked because it is too short-lived; steering avoids it).
- **Query:** `physics.findPath(from, to, { agentR, maxExpand, allowLinks })` returns `{ points: Vector3[], reachable, end, links: [{i, kind}] }`.
  - A* with an octile heuristic and a binary heap in typed arrays (no allocations).
  - **maxExpand 12 000** (about 1.5 ms). Over budget → return the best partial path to the node nearest the goal, then re-path when it is reached.
  - Then **string-pulling** (grid line-of-sight smoothing over walkable cells, keeping link endpoints as fixed corners).
  - Also `physics.nearestWalkable(x, z, maxR)`, `physics.navWalkable(x, z)`, `physics.navCost(x, z)`.
- **Follower** (player-owned `player/PathFollower.js`):
  - Pure-pursuit lookahead **0.8 m**.
  - At a link endpoint she triggers `jump` (scripted takeoff toward the link end; the horizontal speed is chosen so the apex clears) or waits for the bounce.
  - **Stuck detection:** progress < 0.3 m over 0.5 s → re-path. 3 consecutive fails → stop, plus the red ✕.
  - Separation from actors is left to `physics.separateActors`. Companions and enemies are not baked.
- **Bonus:** companions and enemies can opt into the same grid later. This would fix "Mochi stuck behind a fence".

### 3.4 Jump, Pounce, glide
- **The dedicated Jump key is gone on desktop** (Space centres the camera). Jumping happens through **vault links** (automatic) and **F Pounce** (deliberate, §5).
- Gamepad **A** = Pounce (aimed). An unaimed A still does a plain hop forward (keeps the platforming feel).
- **Cape Glide [MVP+]:** automatic on drop links over 2 m (fall at 1.8 m/s for the floaty cat feel), or hold F during a Pounce.
- Coyote, buffer and squash-stretch numbers are unchanged. They now run on scripted takeoffs.

---

## 4. Targeting and aiming

### 4.1 Cursor ground point
- `cam.pickGround(ndcX, ndcY, out)` raycasts the heightfield, then the mesh octree, then walkable static tops (`physics.raycast` with `{ terrain, mesh, statics: walkable-only }`). Run once per rendered frame on the last pointer position (no per-mousemove raycast).
- `input.pointer = { x, y (CSS px), ndcX, ndcY, inside }` is fed by mousemove (no pointer lock) and by touch taps and drags.
- No ground hit (sky, or off the level) → project onto the plane y = her y.

### 4.2 Hover pick (priority order)
`cam.pickActor(ndc)` checks in this order:
1. **Enemies:** the screen-space distance to the projected capsule axis ≤ max(28 px, projected radius + 6 px), measured to the capsule, not the centre.
2. **Interactables, kittens and NPCs:** the same, 32 px.
3. **Pickups** (fish, letters, bells): 22 px.
4. **Ground.**

Ties go to the nearest screen distance, then the nearest to her. Flyers (crows) are picked at their **shadow decal and their body** (two pick shapes).

**Hover feedback:**
- Enemy: a red `#FF5A4D` ground ring (r + 0.25 m, 0.08 m wide), the HP pip bar shown over the head, and the cursor changes to the sword.
- Interactable: a gold ring, the tag prompt (parchment and wax-seal glyph), and the paw-hand cursor.
- Kitten or NPC: a soft blue `#7FC8FF` ring.

### 4.3 Auto-attack (AA) rules
- **Target set** by RMB, LMB on an enemy, A-move acquisition, the touch attack button, or the pad X button. Drawn as the rotating gold §14.2 lock reticle **moved to the ground** under the target.
- **Chase:** path to within **attack reach = arc.range (1.9) + target.radius − 0.25 m**. Re-path when the target moves over 1.0 m from the path end.
- **Loop:** at reach, swing `slash1`. Auto-chain to `slash2` and then `slash3` at each swing's end (dur 0.40 / 0.40 / 0.60, so the §7.2 DPS check of 40 dmg in 1.4 s holds). Then restart at `slash1` after 0.10 s.
  - The **lunge** (2.5 / 4.0 m) stays. It is what makes melee chasing feel good.
  - Each swing re-faces the target on its first active frame.
- **Kiting and animation cancel:** a move command during windup (before `active[0]`) **cancels** the swing (no damage, no Valor). During the active frames it is ignored. During recovery it cancels after `active[1] + 0.05 s`. `slash3` keeps `rollCancel` 0.32 for E.
- **Leash:** drop the target when it is more than 16 m away (`lockOn.breakRange`), hidden, or out of line of sight for 1.5 s.
- **Auto-acquire when idle** (option, default on): standing still with no command for 0.3 s and a hostile that **attacked her** within 2.4 m → target it. Never auto-acquires into an unalerted group. That would break stealth-ish moments.
- **Riposte:** within `riposteWindow` 0.8 s after a parry, **any attack command** (RMB on any enemy, A-click, the touch attack, pad X, or a Q tap) becomes `riposte` on the parried enemy (auto-turn, ≤ 4 m). Option **"Auto-Riposte"** (touch default on): the riposte fires by itself 0.15 s after the parry when she has an AA target.
- **Breakables** (crates, barrels, cages "3 hits", cracked boulders, rope objectives) are **attackable targets** for the AA (`kind: 'breakable'`), with a white hover ring instead of red.

### 4.4 Ability aim and assist

| Ability | Aim source | Assist (desktop / touch and pad) |
|---|---|---|
| AA swings | the target | — |
| Q Swoosh / Bright / Holy | cursor direction (touch: drag vector, or the attack target if tapped) | snap to an enemy within **25° / 45°** of the aim ray and within range + 1 m. Holy is a full circle (direction only matters for `holyWave`, which uses the same snap). |
| W Stand | faces the cursor while held (turn 360°/s, unchanged). If the cursor is within 45° of a hostile in windup within 6 m, face that hostile. **Touch and pad:** face the **most imminent** windup (smallest time-to-active within 6 m), else the joystick direction, else unchanged. | — |
| E Tumble | toward the cursor, **exact** (a dodge must be precise). Touch tap: joystick direction, else **away from the most imminent threat**, else facing. Touch drag: the vector. | none |
| F Pounce | cursor point, clamped to **5.0 m** | snap to a crow, pug or hovered enemy within 1.2 m of the point (touch 2.0 m) |
| D Kitten ability | Mochi: the wall faces the cursor direction, 1.5 m in front. Sage: Volley's 3 targets are chosen nearest the cursor point within 14 m of her. Clover: self. | — |

**Cast modes** (LoL, per-ability setting; default **Quick cast**):
- **Quick cast:** casts on press at the current cursor. Q is inherently "hold to charge, release to cast".
- **Quick cast with indicator:** hold to show the range indicator, release to cast. **Default on touch** (drag to aim).
- **Normal cast:** press shows the indicator, LMB confirms, RMB or Esc cancels.
- **Self-cast modifier:** Alt + key casts toward her facing.

---

## 5. Moveset mapping (every action, every device)

| Action (§7) | **KBM (purist)** | **Gamepad** | **Touch** | Rules that change |
|---|---|---|---|---|
| Move | RMB click or hold | Left stick | Joystick / tap ground | §3 |
| Attack-move | A + LMB (or A) | — (X with no target = attack-move toward the stick) | double-tap ground | §3.1 |
| Stop / hold | S / H | — | — | — |
| **Basic combo** (Snip, Snap, Swoosh) | RMB or LMB on an enemy = AA loop. **J** = attack the hovered or nearest enemy (legacy). | **X** = AA the best target (§4.3), held = keep attacking | **Attack** button (tap = target and AA; hold = keep attacking; re-tap = switch to the next priority target) | Auto-chained loop, §4.3 |
| **Valor Slash** (charge: Swoosh at 0.35–0.60 s, Bright ≥ 0.60 s, Holy ≥ 1.10 s with Shard 1 and Valor ≥ 50) | **Q** hold, release aimed at the cursor. A tap under 0.35 s = **Big Swoosh**. | **X held ≥ 0.35 s** (as today), aimed by the right stick, else the target, else facing | **Q** button: hold to charge (a ring fills, silver → gold), drag to aim, release. Drag to ✕ cancels. | The tap-Swoosh shares the swing slot. **Cooldown 1.0 s on the tap version only**, so Q-spam (33 dps) cannot beat the AA loop (29 dps). Charge rules, tiers and the fizzle tell are unchanged. |
| **The Stand** (hold) / **Parry** (timing ≤ 0.15 s) | **W** hold (toggle option exists). **L** legacy. | **LB** | **Stand** button (hold), the largest after Attack, at the thumb rest | Facing rules in §4.4. Whiff lockout, Grit, Standing Ground and auto-Stand are unchanged. **Touch keeps +0.05 s parry.** |
| Riposte | any attack command within 0.8 s | X | Attack (or Auto-Riposte) | §4.3 |
| **Tumble** + Purrfect Dodge | **E** toward the cursor. **K** legacy. | **B** toward the left stick, else the right stick, else facing | **Tumble** tap or drag | Cooldown 0.20 s unchanged. Cancels a path (re-issues it after the roll if the RMB is still held). |
| **Pounce** | **F** leap to the cursor (≤ 5.0 m) | **A** toward the right-stick reticle (≤ 5.0 m), else 3.0 m forward | **Pounce** button (tap = nearest crow, pug or target within 5 m, else forward 3 m; drag = aim) | **Ground Pounce:** a 0.25 s hop up to 1.2 m apex toward the point, then the existing hang 0.12 s and 14 m/s dive at the point. **Cooldown 2.0 s**, **refreshed by a dive hit** (the pogo chain is kept: after a pogo she is airborne, and F re-aims the next dive within 0.6 s). Breaks a Pug guard from above (unchanged). Clears ≤ 1.1 m obstacles. |
| **Golden Hour** (Valor 100, Shard 2) | **R** (also W + Q within 0.1 s, the legacy chord) | **RT** (or LB + X) | gold **R** button appears | — |
| **Kitten ability** | **D** (aimed per §4.4) | **LT** (aimed by the right stick) | portrait button (drag to aim for Mochi) | — |
| **Milk Break** | **1** (item slot; the count is shown) | D-pad up | milk button | Unchanged (0.9 s, heals at 0.5 s, moves at 1.1 m/s, follows the path). |
| **Meow** | **T** | L3 | cat-face button | Unchanged. The hidden-kitten answer also pings the ground ring at the kitten's spot through the fog for 3 s. |
| Interact | RMB the object / **G** = the nearest within 2.5 m | **Y** | tap the object / the contextual **!** button | §7 |
| Target cycle | **Tab** (nearest to the cursor, then the next) | RB (soft lock: keeps X on that target), D-pad left / right cycles | tap another enemy | Replaces lock-on (§12 camera / player). |
| Camera | Space (hold) centre · Y lock · wheel zoom · middle-drag · edge pan | R3 zoom presets | pinch zoom | §2.3 |
| Pause, hold to skip | Esc / P | Start | ❚❚ | **No pointer lock**, so the "lock lost → pause" path is dormant. |
| Show ranges | hold **Ctrl** (all ability ranges) | — | — | — |

**Gamepad aim reticle:** the right stick moves a ground reticle up to **6 m** from her (radius ∝ deflection, damp λ 12). It auto-hides 1.0 s after release. While hidden, abilities use the auto-target or the facing.

**Optional alternative layout "Action (WASD)"** (setting, default off; for players who hate click-to-move): WASD screen-relative move; LMB attack toward the cursor (AA on hover); RMB Stand; Space Tumble; Q charge; E kitten; R Golden; F Pounce; 1 Milk; T Meow; G interact. The camera is the same. This is the safety net. It costs core about 20 lines (a second binding table).

---

## 6. Telegraph and parry readability from above

1. **Attack wedge decal** (fx Telegraphs; new shape `wedge`). For every melee telegraph (`parry`, `gold`, `red`, `grab`), draw the attack's own arc on the ground from the attacker: radius = `arc.range` (or `from`–`to` for lunges as a lane), angles `arc.from` → `arc.to` around the attacker's facing.
   - It fills from the attacker outward over the windup; full = the active frame.
   - Colours as in §8.1 at 0.35 alpha, with a 0.06 m rim.
   - White: parry. Gold: gold (8-point star rim pattern). Red: red (jagged rim). Purple: grab.
   - The wedge **tracks the attacker's facing until 0.15 s before active**, then freezes. That is a fair dodge read.
   - `combat:telegraph` payloads must include `attackId` (or `arc` and `range`). Enemies already emit them; combat or enemies add the fields.
2. **Approach ring (the parry metronome):**
   - A ring centred on the attacker starts at r = 2.4 m at windup start and shrinks linearly to the attacker's base radius **exactly on the first active frame**.
   - The parry window (0.15 s; 0.25 Kitten; +0.05 touch) is drawn as a slightly thicker, brighter band at the end of the shrink. "Press W as the ring hits the band."
   - Shown only for attacks that target **her** (token holder) and only in the **parry kinds** (white and gold). Red attacks show no ring (dodge, don't parry).
   - This turns the hardest-to-read mechanic from above into the easiest.
3. **Glints and "!" in screen-constant size:** the white or gold 4/8-point glint sprite is drawn at a constant **28 px**, the "!" / "!!" at **34 px**, both at head + 0.5 m. They are always on top (depthTest off).
4. **Her Stand fan:** while W is held, a silver fan (±70°, r 1.4 m, 0.25 alpha) is drawn in front of her. Its 3 notches flash per Grit, and it cracks at a guard break. A parry flashes it gold.
5. **Projectiles:** `aim` lines are kept (great from above). Bolts get a 0.15 m ground shadow dot so their height is legible. Reflected bolts trail gold.
6. **Shadow (crow) and AoE:** already ground decals, which read better from above. No change, plus a 0.35 → 0.45 alpha bump at zoom over 18 m.
7. **Off-screen arrows:** trigger widened to 20 m. They now also show for winding-up attackers hidden by an occluder (rare after the x-ray pass).
8. **Audio cues** are unchanged (the "ting" 0.25 s before active stays the master timing cue).

---

## 7. Interaction (talk, cages, pickups)

- **Interactables** (Vigil Stones, NPCs, shop counters, Quest Board, letters, Heart Bells, levers, kitten cages with `hide: 'cage'` = breakables):
  - Hover gives a gold ring, the tag and the paw cursor.
  - RMB: path to the **use point** (the interactable's `r − 0.3 m`, on the side nearest her; or an authored `usePos`). On arrival she faces it and `use()` is called.
  - The arrival check replaces the E press. `world/Level._updateInteract` gains `useTarget(id)` for the command, so the old proximity prompt still works for **G**, pad **Y** and the touch **!** button.
- **Talk:** dialogue enters `dialog` mode. Advance with **LMB anywhere**, Space, Enter, pad A or tap (the bouncing paw is the affordance).
- **Cages** (3 hits): an AA target. The interact command on a cage = AA it.
- **Pickups:**
  - Fish magnet radius **2 → 3 m** (and small hearts 3 → 3.5 m): click precision is lower than stick precision.
  - Letters and Heart Bells keep a deliberate click (they are moments).
  - **Auto-loot:** walking within 0.8 m picks up a letter too (as today).
- **Hidden kittens** (`meow`, `stand`, `climb`): unchanged mechanics. `climb` kittens get an authored navLink so clicking them works.

---

## 8. UI

### 8.1 Cursor set (CSS `cursor: url() x y`, 32 px with a 48 px @2x variant; owned by ui)
| Context | Cursor |
|---|---|
| Default | Silver gauntlet paw pointer, with the pink bow ribbon on its cuff |
| Over an enemy | Sword, red edge glow |
| Over an interactable or NPC | Open paw (gold) |
| Over a pickup | Paw with a sparkle |
| A-move armed | Crosshair sword (red) |
| Cast indicator open | Small ring reticle (the ability colour) |
| Unreachable / invalid | Grey paw with a ✕ |

Hidden in cutscenes and Meme Cam. Cursor scale setting 1×, 1.5×, 2×.

### 8.2 Move and command markers (fx, ground decals, depthTest on, 0.8 s)
- **Move:** a green `#7FD38A` chevron ring that shrinks 0.9 → 0.3 m and fades.
- **Attack** (RMB enemy, A-move): red `#FF5A4D`.
- **Interact:** gold `#FFD34D`.
- **Queued (Shift):** small dots plus dotted path lines.
- **Unreachable:** red ✕.
- **Path preview while RMB is held:** a faint dotted path to the destination (0.25 alpha), plus link arcs.

### 8.3 Range and aim indicators (fx; shown for quick cast with indicator, normal cast, and while Ctrl is held)
| Ability | Indicator |
|---|---|
| AA | a thin ring at reach 1.9 m (Ctrl only) |
| Q | a cone 2.3 m ±97° (Swoosh). It grows to 2.6 m ±92° at tier 1 (silver) and becomes a 3.6 m full circle plus a 10 m × 2.4 m lane for `holyWave` at tier 2 (gold). The fizzle turns the gold preview grey. |
| W | the Stand fan (always shown while held, §6.4) |
| E | an arrow 2.6 m |
| F | a circle at the target point (r 1.3 = the landing ring) plus the max range ring 5.0 m |
| D | Mochi: a 3.0 m wall line at 1.5 m. Sage: 3 small target pips on the chosen enemies. Clover: none. |

### 8.4 HUD relayout (LoL-style bottom centre; supersedes the §14.2 bottom-left and bottom-right items)
- **Bottom centre "command bar"** (parchment and gold), left to right:
  - **Portrait** (unchanged art), with the **lives ×9** badge on its frame.
  - **Hearts** row over **Grit** pips.
  - **Valor sword** as a horizontal bar under the ability row. It keeps the gold notch at 50 and turns full gold at 100.
  - **Ability slots** 56 px (touch: §8.5): **Q W E R | D F | 1 T**.
- **Each slot:**
  - The key glyph in its corner (swapped for pad glyphs).
  - A radial cooldown sweep (dark 55% overlay, clockwise) and seconds remaining when over 1 s (Fredoka 700).
  - A "ready" flash plus `ui/glass_001` at 30% on cooldown end (abilities with CD ≥ 2 s only).
  - Not-enough-Valor or missing-Shard states: desaturated with a lock pip (Holy's gold rim lights at Valor ≥ 50 with Shard 1; R lights gold at 100).
  - The Milk slot shows ×count. The D slot shows the companion portrait with its colour ring (§9.2 cooldowns 18 / 14 / 30 s), and "zzz" while napping.
- **Top-left:** objective and boss bar unchanged (top centre). **Top-right:** fish, kittens, letter. **On-world:** HP pip bars over enemies show **on hover, on target, and for 3 s after a hit**. Bosses use the top bar.
- **On her head** (in world, small): Grit pips while guarding, the charge ring while charging. The eye stays on her, not on the HUD corner.
- The HUD scales with `settings.hudScale` 0.8–1.25. Respect `env(safe-area-inset-*)`.

### 8.5 Touch layout (landscape; sizes × `settings.touchSize`)
```
 ┌───────────────────────────────────────────────────────────────┐
 │ [portrait♥♥♥♥ grit valor]        [objective]        [fish kit] │
 │                                                     [❚❚]      │
 │                                                               │
 │                  (tap ground = move, tap enemy = attack,      │
 │                   tap object = use, pinch = zoom)             │
 │                                               [T] [1] [D]     │
 │  ◯ joystick                              [R]   [F]            │
 │  (floating, left 40%)                [E]    [Q]               │
 │                                        [W]    ( ATTACK )      │
 └───────────────────────────────────────────────────────────────┘
```
- **ATTACK 84 px** in the bottom-right corner (inset 24 px).
- Arc of skills around it, at 92–150 px radius:
  - **Q 64**, **W Stand 72** (the second most important, nearest the thumb's natural sweep), **E 60**, **F 56**, **R 64** (only when ready).
  - Smaller row above: **D 52**, **1 Milk 48**, **T Meow 48**.
  - The **!** interact (64) pops left of ATTACK when available.
- **Drag-to-aim:**
  - Touching Q, E, F or D shows the indicator. Dragging moves the aim within a 90 px virtual stick (the deflection maps to range for F and to direction for the others).
  - Releasing casts. Dragging onto the **✕ cancel zone** (appears top-right, 72 px) cancels.
  - Tap without dragging = smart cast (the auto-aim rules of §4.4).
- **Attack target priority** (Wild Rift-like):
  1. the enemy whose attack token targets her and is in windup
  2. the current target
  3. the lowest-HP enemy within 4.5 m
  4. the nearest within 8 m (chase)
  5. a breakable within 2.5 m
- **No camera drag.** Pinch zoom 10–17 m. A two-finger drag does nothing (no accidental pans).
- The **left-handed mirror** setting swaps the sides. A **"Lock buttons"** edit mode drags every button (positions in `settings.touchLayout`).
- The parry assist stays (+0.05 s). Auto-Stand stays on by default. Auto-combo is inherent (the AA loop). **Auto-Riposte** is on by default.
- **Haptics:** `navigator.vibrate(12)` on parry and on Purrfect Dodge where available (Android), with a settings toggle.

### 8.6 Settings additions (ui writes `state.settings`; save validates ranges)
- `controlScheme` 'moba' | 'action'
- `castMode` {q, e, f, d}: 'quick' | 'quickIndicator' | 'normal'
- `attackMoveOnLeftClick` (false)
- `camLock` (true)
- `camZoom` (16 / 13 touch)
- `edgePan` (true)
- `edgePanSpeed` 1 (0.5–2)
- `autoRecenter` (true)
- `cameraLead` (true; off = no lead and no combat auto-zoom: "reduce camera motion")
- `cursorScale` 1 / 1.5 / 2
- `showPath` (true)
- `autoAcquire` (true)
- `autoRiposte` (touch true, else false)
- `leftHanded` (false)
- `touchLayout` (object)
- `haptics` (true)
- `hudScale` 1

**Removed from the UI:** sensitivity and invert Y (keep the keys in the save for the action scheme's pad only: no camera look exists any more, so they are hidden).

### 8.7 Controls card and prompts
`ui/controls card` rewritten per device (§5 table). Prompts read glyph tokens `{move} {attack} {q} {w} {e} {r} {d} {f} {milk} {meow} {interact}` (ui maps them per device and per scheme).

### 8.8 Loading tips
Add 6 tips (e.g. "Hold right-click to steer her like a kite on a string.", "The shrinking white ring is your parry metronome.", "Press Space to look at your cat again.").

### 8.9 Optional (MVP+) minimap
A 160 px round parchment map, top-right, of the level spine, Vigil Stones, the exit and found kittens, with RMB on the map = path there. Purists expect it, but the story's fog-of-mystery argues against it. Defer.

---

## 9. Level and design changes

| Where | Change |
|---|---|
| **All levels** | `camYaw` (§2.2). `navLinks` where needed. `nav: 'ignore'` on overhead colliders. Roof tagging `camRoof` in town and hub. Re-check prop density from above: grass blades read as noise top-down, so **blade width ×1.3** and a darker root gradient. The ground texture or vertex colour carries more of the read now: raise its contrast about 10%. |
| **Meadow: practice field (40 × 40)** | Fits about 2 screens. **Remove the "Jump the fence" lesson.** Replace it with a **"click past the fence: she hops it"** beat (a vault link on the 1.0 m inner fence at z −87). The Wobble Knight lessons become **W Stand** and the **approach ring** parry lesson. The sack becomes **E Tumble toward the cursor**. The cracked-thing target becomes **Q Bright**. |
| Meadow: Standing Stones | Ring stones are fadeable (done in M2). From above they read beautifully, so make sure the ring is centred in a 16 m frame (it is). |
| Meadow: Crow Fields | **F Pounce** lesson at the first crow: the crow's shadow decal is the target ("Pounce [F] at its shadow just as it lands, then again while you bounce"). |
| Meadow: Old Bridge | Deck 0.3 m above the meadow, stream −1.5 m: the nav grid takes the deck top (topAt). Deep water is unwalkable. No change needed. **Check** that the bridge deck's colliders are `walkable`. |
| **Forest: Mushroom Ring** | Author the cap chain links (ground → cap1 jump, cap1 → cap2, cap2 bounce → cap3, cap3 → cap4, cap4 bounce → cap5). RMB on the Heart Bell on cap 5 = the whole chain plays out as a cute hop sequence. **This is the best "it just works" moment of the rework.** |
| Forest: Treetop root ledges | Links: ground → step (0.75) → ledge (1.5). The crossbow rats on the ledges are AA-able (the chase climbs). **F Pounce** onto the ledge is also valid (≤ 5 m, clears ≤ 1.1 m: ledge 1.5 needs the step first, or make Pounce clear 1.6 m). **Decision: ground Pounce apex 1.6 m**, so a Pounce onto a ledge is a valid shortcut. |
| Forest: Cheese Mill (B1, r 12, 6 pillars r 0.8 × 2.5 m) | Pillars fade on the camera side. The Wheel Ride charge lanes are ground decals (they read perfectly). The B1 camera fit is 19 m. Grizzlechop's charge currently stops on her collider: the path-follow separation must not glue her to him (combat pushback). |
| Forest: Lantern Camp night | The forest_night fog at 0.055 × 1.6 at the top edge is about 47%. Fireflies need 1.2× size to read at 16 m. |
| **Town / hub** (~27 houses, alleys) | Roof cutaway (§2.8). The **Lantern Alley** width must be ≥ 2.0 m clear for the nav agent (r 0.4): world checks the baked grid in `?debug` (overlay, §12 physics). **Post Office chase:** AA on Pilfer = chase, which is exactly the right control. Give Pilfer an AA hover ring with a "Catch!" cursor. Hub stations: shop counters use `usePos`. The Quest Board is clickable from 6 m (it opens when she arrives within 2 m). Bell Tower loft ledge (y 6): `climb` link plus `nav: 'ignore'` on the ledge collider, so the terrace under it stays walkable. |
| **Gate** | yaw = south. **The Line** set piece: the winch is a clickable interactable (repair = hold RMB on it, or the interact hold). Waves come up-screen toward her, which is good. The causeway 12 × 40 boss arena: the camera frames along the long axis. The ballista raft and the war-wagon cage use `usePos`. The ledge stair is fine. |
| **Meme Cam showpiece** | The idle trigger is unchanged (15 s with no input; mouse movement alone **does not** count as input now: the cursor idles often). Manual trigger: hold **W** 2.5 s planted with no enemy within 12 m. The dive-down transition (§2.6) is the new hero shot. **Exit:** any command or key, but *not* mouse movement (so a resting hand doesn't kill the loop). |
| Boss intros (CS-04 / 05 / 08 / 09) | Unchanged shots. Handback via the crane arc lands at the boss framing. |
| Spawns and encounter spacing | A 13 m-deep iso view means ambushes from the bottom edge are invisible: **no enemy spawns or wave points within 6 m down-screen of a trigger point** (world audits its arena ring points: it already spawns at the 3 of 6 points farthest from her). |

---

## 10. Tutorial text changes (story `strings.js`, §6.6; ui swaps the glyphs per device)

| Key | New text |
|---|---|
| `tut.move` | Right-click the ground to walk there. Hold it to steer. {move} |
| `tut.jump` | Click past the low fence. Cats hop small things on their own. |
| `tut.combo` | Right-click the Wobble Knight to attack. Snip, Snap, Swoosh! {attack} |
| `tut.roll` | Tumble toward your cursor {e}. You can't be hurt mid-tumble. |
| `tut.stand` | Hold the Stand {w}. Block the Wobble Knight twice. |
| `tut.parry` | Watch the white ring shrink. Raise the Stand {w} *just* as it lands. |
| `tut.bright` | Hold {q} until the sword shines, then let go toward the cracked stone. |
| `tut.meow` | Meow {meow}. Hidden kittens answer. So do cows. |
| `tut.riposte` | Parried! Attack now for a Riposte. |
| `tut.pounce` | Pounce {f} on a crow's shadow. Bounce off and Pounce again! |
| `tut.reflect` | Parry a bolt {w} to send it back. |
| `tut.milk` | Milk Break {milk}: heals 2 hearts. Don't get hit while you sip. |
| `tut.vigil` | Vigil Stone: click it to rest, save, refill milk and swap kittens. |
| `tut.companion` | {d} Kitten ability. Aim it with your cursor. |
| `tut.golden` | Golden Hour: at full Valor, press {r}. |
| `tut.camera` (new) | {camCenter} looks back at Clem. {camLock} unlocks the camera. Scroll to zoom. *(desktop only, shown on the first edge-pan or the first time she leaves the screen)* |
| `tut.amove` (new) | Tip: {amove} then click to march and fight anything on the way. *(Crow Fields)* |
| `tut.touch.aim` (new) | Drag a skill button to aim it. Drag to ✕ to cancel. *(touch, first skill press)* |

**`{move}` glyphs:** KBM "[Right-click]", pad "[Left stick]", touch "[Tap or stick]".

**`tut.pearl1/2`, `tut.valor`, `tut.holy`, `tut.line`, `tut.jeer`, `tut.bones`:** only the glyph tokens change (`[RMB]` → `{w}`, `⚔` → `{q}` or `{attack}`).

Pearl's tutorial beats are unchanged.

---

## 11. Accessibility
- **No timing is harder than today:** parry windows are unchanged, plus the approach ring is a *new visual timing aid*. Kitten difficulty 0.25 s, touch +0.05 s, and Auto-Stand are unchanged. **Auto-Riposte** is new.
- **Hold vs toggle:** applies to W Stand and Q charge (existing settings); RMB steer can become "click only" (`showPath` + Shift-queue for motor-limited players).
- **One-hand play:**
  - Mouse-only is possible: every ability gets a clickable command-bar slot (click the slot = quick cast at the cursor's last ground point; Q holds while the mouse button is held on the slot).
  - Keyboard-only remains via the "Action" scheme with arrow keys.
- **Colour plus shape plus sound** for every ring and marker: hostile rings are **dashed**, interactables **solid**, allies **dotted**. The pattern overlay setting adds stripes and dots to telegraph wedges (§14.4 rule extended).
- **Reduce camera motion:** `cameraLead` off disables the lead, the combat auto-zoom and the Golden punch-in. Shake 0–100% is unchanged. **Reduce flashes** also removes the edge mist vignette pulse.
- **Clarity mode** (new): fog isoMul 1.6 → 0.9, mist sheets off, x-ray silhouettes for all enemies.
- **Cursor size** 1–2×. **HUD scale** 0.8–1.25. **Touch button size** and layout editing. **Left-handed** mirror.
- **Rebinding:** MVP = the two schemes plus legacy aliases (J / K / L). Full rebinding is MVP+ (core has a binding table already; ui needs a capture screen).

---

## 12. Per-area change list (ownership §19.2; cross-area needs go to `requests/<area>.md`)

### core (`src/core/**`)
- **config.js**
  - `INPUT`: new actions `move` (RMB), `select` (LMB), `attackMove` (A), `stop` (S), `hold` (H), `charge` (Q), `pounce` (F), `interact` (G), `camCenter` (Space, F1), `camLock` (Y), `zoomIn` / `zoomOut` (wheel), `showRanges` (Ctrl), `targetNext` (Tab).
  - Rebound: `guard` → W (+ L), `dodge` → E (+ K), `golden` → R, `ability` → D, `milk` → Digit1, `meow` → T, `attack` → J (legacy). Additions only: existing names keep their meaning.
  - Second binding table `INPUT.schemes.action`.
  - Pad: A = `pounce` (+ confirm), R3 = `zoomCycle`.
  - New tables: `CAMERA.iso` = { fov 35, dist 16, touchDist 13, zoom [10, 22], touchZoom [10, 17], pitch [50°, 60°], focusY 0.6, upOffset 0.8, cursorLead 0.12 / 2.0 / λ3, velLead 0.3 / 1.6 / λ2.5, leadMax 2.4, combatFit 0.8, combatMax +3, bossDist [16, 21], edgePx 12, edgeSpeed 18, leash 25, handback 0.8, wheelStep 1.5 }; `NAV` = { cell 0.5, agentR 0.40, stepUp 0.30, vaultUp 1.1, dropDown 4.0, gapMax 2.6, maxExpand 12000, lookahead 0.8, stuckT 0.5 }; `PLAYER.pounceGround` = { range 5, apex 1.6, cd 2.0, refreshOnHit true }; `PLAYER.qTapCd` 1.0; `PLAYER.assist.cursor` = { angle 25°, touchAngle 45°, pad 1.0 m }; AA = { reachPad −0.25, restart 0.10, acquireR 4.5, holdR 2.4 }.
  - `ECONOMY` / pickups: fish magnet 3.0.
- **Input.js**
  - **Remove the pointer-lock default** (`pointerLockEnabled = false`, the code is kept for the action scheme's optional mouse-look in pad-less play). `mousemove` always updates `pointer {x, y, ndcX, ndcY, inside}`.
  - Wheel → `zoomIn` / `zoomOut` pulses (no lock switch).
  - Touch hooks: `setPointer(x, y)`, `tapAt(x, y)` (ui calls them), `pinch(scale)`.
  - `move` stays the direct-move vector (keys in the action scheme, the pad stick, the joystick).
  - `idleTime`: **pointer motion no longer resets it**. `anyActivity()` ignores the pointer.
  - `device` detection: a mouse click sets `kbm`, a touch sets `touch`.
- **events.js** (additions)
  - `player:command {kind: 'move'|'attack'|'amove'|'interact'|'stop'|'hold'|'cast', point?, target?, ability?}`
  - `player:path {points, reachable}`
  - `camera:zoom {dist}`
  - `camera:lock {locked}`
  - `ability:ready {id}`
- **GameState.js / save:** the §8.6 settings defaults.
- **PostFX.js:** the edge mist vignette (fog colour, strength from Env).
- **debug.js hooks:** `__GAME__.click(x, z, button='right')` (issues a world command), `cursorAt(x, z)`, `path()`, `nav.debug(on)`, `cam.iso()`.
- **Game.js:** the `relock()` path stays dormant in the moba scheme.

### physics (`src/physics/**`)
- New `NavGrid.js` (bake, dirty-rect rebake, links, `nav: 'ignore'`, ring walls, deep water, steep) and `Pathfinder.js` (A* typed-array heap, octile, partial paths, string pull, BFS `nearestWalkable`).
- Public on `ctx.physics`: `findPath`, `nearestWalkable`, `navWalkable`, `navCost`, `navLinkAt`, `navVersion` (increments on rebake).
- `raycast` option `walkableTops: true` (the cursor pick).
- `PhysicsDebug` grid overlay: green walkable, red blocked, yellow links.
- Unit tests: bake on a synthetic level, a fence vault link, a gap link, the 1.5 m fence blocked, a ring wall blocks, deep water blocked, a partial path, the string-pull straight line, a dirty rebake.

### camera (`src/camera/**`)
- New **`IsoCamera` mode inside `FollowCamera.js`** (the contract class stays `FollowCamera`):
  - modes `iso` (default play), `iso-boss`, plus the existing `meme`, `preset`, `cutscene`
  - zoom, pitch(d), fixed `camYaw` from the level, leads, lock and unlock, edge pan, middle-drag, leash, combat fit, boss fit, dialog framing, Golden punch, shake mix (§2.5), crane-arc handback and Meme entry (§2.6)
- **Delete:** the spring arm, boom avoidance, auto-follow, lock-on orbit and lens grid. `LockOn.js` is reduced to target-cycling helpers (`switchLockTarget` reused by Tab / RB / touch).
- `cam.yaw` stays (= `camYaw`, so player maths keeps working). `cam.lockTarget` stays as an alias of `player.target` for hud and touch compatibility.
- New API: `cam.focus` (Vector3), `cam.distance`, `cam.zoom(d)`, `cam.setLock(on)`, `cam.center()`, `cam.pickGround(ndcX, ndcY, out)`, `cam.pickActor(ndcX, ndcY, kinds)`, `cam.project(pos, out)` (CSS px), `cam.screenToGroundRay`.
- **Occluders.js:** capsule tests (her, target, path point, cursor), the canopy rule, the roof rule (`camRoof`), opacity 0.25.
- **Tests:** framing math (visible ground for d and pitch), pitch(d), lead clamp, leash, the pick-radius maths, the handback arc never below the terrain.

### player (`src/player/**`)
- New **`Controller.js`** (the command layer, owned by player, ticked first in `Player.update`):
  - Reads `input` plus `cam.pickGround` / `pickActor` and holds `command`, `path` (via `physics.findPath`), `target`, `aimPoint`, `aimDir`, `queued[]`.
  - Implements move, steer, A-move, S, H, the AA chase loop and its cancel rules (§4.3), auto-acquire, Riposte routing, interact-on-arrival (calls `ctx.levels.current.interact(id)` when in range), cast modes, and the Ctrl ranges flag.
- New **`PathFollower.js`:** pure pursuit, arrival, vault-link takeoffs (scripted jump), stuck re-path.
- **Player.js**
  - `wishDir()` returns the path-follow or steer direction when a path is active, else the direct `input.move` mapped with the fixed `cam.yaw` (unchanged maths).
  - `startAttack(id, aim)`, `startDodge(aimDir)`, `pounceTo(point)` (new **ground Pounce**: hop, hang, dive at the point; CD 2.0, refreshed on a dive hit).
  - The guard facing rule (§4.4).
  - Q tap → `slash3` with `qTapCd`.
  - `aimAssist` gains a cursor-ray mode (25° / 45°).
  - `lockTarget()` returns `controller.target`.
  - The Golden chord W+Q.
- **PlayerStates.js:** `move` follows the path; `attack` gains the windup cancel; `guard` faces `aimDir`; the new `pounceGround` state (`hop`, then the existing `pounce` dive); `dodge` uses `aimDir`.
- **MemeCamTrigger:** ignores pointer motion. The manual trigger is W held 2.5 s.
- **Unit tests:** command FSM transitions, the AA cadence (40 dmg in 1.4 s against a dummy), the windup cancel, Riposte routing, the Q tap CD, the Pounce range clamp and refresh, the follower link takeoff.

### combat (`src/combat/**`)
- `assistTarget(actor, range, angle, filter, ray?)` gains an optional **aim ray** (origin plus dir) to rank by angle to the ray instead of the facing.
- `combat:telegraph` payload adds `attackId`, `arc` (`range`, `from`, `to`), `targetId`, `activeAt` (sim time of the first active frame), `parryWindow` (difficulty-resolved), so fx can draw wedges and approach rings that land exactly.
- **Breakables** join the AA target set (`hurtable` statics already exist in Pickups; combat exposes `isAttackable(a)`).
- **DPS audit:** the AA loop equals the manual combo. Q tap Swoosh with the 1.0 s CD.
- **Tests:** telegraph payload shape; `activeAt` equals the windup end for every enemy attack row.

### ui (`src/ui/**`)
- The cursor set (§8.1); `body[data-cursor=…]` driven by the hover pick (10 Hz plus edge).
- **Command bar** (§8.4) replaces the bottom-left Milk and bottom-right companion items, with cooldown sweeps, key glyphs and ready flashes. Hearts, Grit and Valor move into the bar (the portrait cluster stays top-left on touch for thumb clearance; see the layout).
- **touch.js rewrite** (§8.5):
  - joystick (left 40%), tap-to-move, tap-to-target, pinch
  - the Wild Rift cluster with drag-aim and the ✕ cancel zone
  - attack priority
  - left-hand mirror, layout edit, haptics
  - removes drag-to-look
  - `pickTapTarget` is reused against `cam.pickActor`
- **Settings** (§8.6), the controls card (§5 per device and scheme), glyph tokens in `text.js`, the new tips, the on-head charge ring and Grit pips (DOM world tag, or ask fx for a sprite).
- **Threat arrows:** 20 m trigger.
- **Tests:** layout fits 640 × 360 to 2560 × 1440 with no overlaps (smoke screenshot plus a bounding-box assert), the cancel zone, the glyph swap.

### fx (`src/fx/**`)
- **Ground decal kit** (one instanced decal material):
  - the hero ring, hover rings (dashed, solid, dotted)
  - the target reticle (§14.2, moved to the ground)
  - move / attack / interact / ✕ markers, path preview and links
  - ability indicators (§8.3)
  - the Stand fan with Grit notches
- **Telegraphs.js:** the new `wedge` shape (attack arc fill, freeze 0.15 s before active), the **approach ring** with the parry band, screen-constant glint and "!" sizes, pattern overlay on wedges.
- **X-ray silhouettes** (her always; enemies in windup): a shared `GreaterDepth` flat material applied through a characters hook (see characters).
- **MistCards:** over-camera mist sheets with the hole around her (§2.7.3), and ground ribbons (0.2–0.8 m).
- Bolt ground shadows. Firefly size ×1.2 at zoom over 14 m.
- **Tests:** wedge geometry from the arc; ring timing (radius equals the base at `activeAt`).

### world (`src/world/**`)
- **Env.js:**
  - `IsoFog` plus the fog chunk patch (§2.7.1; coordinate with characters and fx custom shaders), isoMul 1.6, the ground mist band, `fogNear` from `cam.distance`
  - the shadow frustum on `cam.focus`, half-size = clamp(0.65 × visible width, 12, 18)
  - the edge vignette strength to PostFX
  - clarity mode
- **Level data:** `camYaw` (all levels), `navLinks` (forest Mushroom Ring and Treetop, town loft, gate if any), `nav: 'ignore'` tags, `usePos` on interactables (shops, Quest Board, winch, cages, ballista raft), `camRoof` tags on town and hub roofs, grass blade width ×1.3, ground contrast +10%.
- **Level.js:**
  - `useTarget(id)` for the arrival-use command
  - the interactables list exposes `pickRadius` and `pos` for `cam.pickActor`
  - `_updateInteract` keeps the proximity path for G / Y / the touch !
- **Pickups:** magnet 3 m; breakables expose `isAttackable`.
- **Arena audit:** no spawn point within 6 m down-screen of the entry.
- **Tutorial practice field:** the fence vault beat.

### enemies (`src/enemies/**`)
- Every enemy exposes `pickRadius` (default radius + 0.15) and `pickHeight`. Crows also expose `shadowPos` for picking.
- `combat:telegraph` emits through combat with the new fields (`attackId`, `arc`, `activeAt`, `targetId`).
- The HP pip bar data (`hp`, `maxHp`) is already present.
- **Optional:** opt into `physics.findPath` for chase (fixes fence snagging). Grizzlechop's Wheel Ride passes through her (the known issue; pushback, not a body block).
- No AI timing changes.

### companions (`src/companions/**`)
- Follow logic with click-move: follow her **path** (target = her position minus 1.6 m along the path tangent), and use `findPath` when the straight line is blocked.
- Abilities take an `aim` param: Mochi's wall direction, Sage's Volley target ranking near the cursor point.
- The Meow regroup is unchanged.

### story (`src/story/**`)
- The §10 strings, the tutorial flow (fence vault beat, approach-ring parry lesson, F Pounce at the crows, the camera tip), and cutscene `end` handbacks rely on the camera's crane arc (no script change).
- D-dialogues: dialog framing is automatic.

### characters (`src/characters/**`)
- **Readability from above:**
  - A view-fresnel **rim term** (0.35, warm white) in the fur shell and body materials.
  - The **bow pink and the cape** stay the hero identifiers (they read from 55°).
  - Ears: +5% scale on enemies' ears and helmets for top-down silhouette **only if** the screenshots show mush (verify first).
- A silhouette hook: `setXray(on, color)` adds the `GreaterDepth` pass (body, armour and sword meshes; no fur shells).
- **Fur LOD** re-keyed to `cam.focus` distance (§2.9).
- The fog chunk audit for custom fur shaders.

### audio (`src/audio/**`)
- The **listener moves to `cam.focus` + 2.5 m** (§2.9).
- New UI sounds: move-confirm tick (very soft, 20% volume, at most 1 per 150 ms), attack-confirm, invalid "mrr?", ability-ready, cast-cancel.
- The Meme Cam dive keeps its silent wind-only rule.

### save (`src/save/**`)
- Validate the new settings keys and ranges (§8.6).
- `touchLayout`: an object of `{id: [x, y]}` in 0..1 viewport fractions.
- `controlScheme` default 'moba'. Migrate v1 saves without the keys.

### tests (all areas)
- Smoke harness helpers (core): `t.click(x, z, {button})`, `t.cast(key, x, z)`, `t.hover(x, z)`.
- New blocks:
  - `physics:nav` (bake time < 100 ms, the meadow path start → exit reachable, the fence vault taken)
  - `player:clickmove`, `player:aa` (rat_pike dies to the AA loop in ≤ 1.6 s), `player:parryRing`
  - `camera:iso` (screenshot: her at 45% height, fog top vs bottom luminance delta > 0.08), `camera:meme-dive`
  - `ui:commandbar`, `ui:touch-wr` (phone viewport 844 × 390)
  - `flow:*` updated to drive through clicks
- **Existing blocks** that `tap('KeyJ')` keep working (J = attack nearest). Blocks that `hold('KeyW')` for movement must move to `t.click` (W is now the Stand).

---

## 13. Rollout order (one integration pass; about 3 parallel waves)
1. **Wave A (foundations):**
   - core: input, config, events, hooks
   - physics: NavGrid and Pathfinder, plus debug overlay
   - camera: IsoCamera, pick API, occluder capsules
   - world: camYaw, IsoFog, shadow focus
   - Gate: `?test` the meadow with click-move and the iso cam and **look at screenshots** for framing, fog and readability before anything else.
2. **Wave B (play):**
   - player: Controller, PathFollower, AA, abilities, ground Pounce
   - combat: telegraph payloads, ray assist
   - fx: decals, wedges, rings, x-ray, mist sheets
   - enemies and companions: pick radii, follow, aim params
   - audio: listener
3. **Wave C (surface):**
   - ui: cursor, command bar, touch rewrite, settings
   - story: tutorial and strings
   - world: navLinks, usePos, roof tags, grass, arena audit
   - characters: rim, xray, LOD
   - save: settings
   - the `flow:*` smoke playthrough

---

## 14. Risks and open questions
- **Melee feel at 16 m:** hitstop and shake translate less from far away. Mitigations: the shake mix (§2.5), screen-constant hit stars (fx: scale by distance), damage numbers stay DOM (screen-size), and a **micro dolly −0.3 m on heavy hits** (camera).
- **Precision Stand facing on touch** relies on the "most imminent windup" rule. Multi-attacker cases (2 rats from opposite sides) were already a Grit and positioning problem. Approach rings make it visible.
- **Pounce rework changes the crow fight:** the pogo chain must be playtested (refresh window 0.6 s, apex 1.6 m).
- **Single-layer nav** can't represent walk-under spaces. Today only the town loft ledge is affected (`nav: 'ignore'`). The M3 keep (cellars and ramparts) needs a design check: layers might be required there. Fallback: per-zone separate grids.
- **The fog chunk patch is global.** Every custom shader with its own fog maths must be audited (grass, fur, mist, water, sky). The sky is invisible in play but visible in cutscenes, where `fogNear` must be 0 (Env sets `fogNear = 0` in `cutscene` / `memecam` modes).
- **Purist vs casual:** right-click-to-move is alien to non-MOBA players. The tutorial's first beat and the "Action (WASD)" scheme cover them. **Recommend shipping both, with moba as the default on desktop** (the user's request) and Wild Rift on touch.
