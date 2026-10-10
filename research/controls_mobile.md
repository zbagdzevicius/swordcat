# SWORDCAT: top-down "LoL / Wild Rift" control and camera rework (mobile first)

Author: senior game/UX design pass, 2026-10-09. Status: **proposal, binding once core accepts it** (it amends
GAME_DESIGN §7.1–7.3 inputs, §8.1, §8.3, §14.2, §14.3, §14.4, §15, §5.2 hand-backs and §12.2 fog).

User request: *"make this game controlled like League of Legends rather than pure 3rd person from the back (it's hard
to navigate and it's not mobile friendly), rework what's needed for the best experience."*

Code read for this proposal: `src/core/Input.js`, `core/config.js` (`CAMERA`, `INPUT`, `PLAYER.assist/lockOn`),
`camera/FollowCamera.js` (1163 lines: an orbit and spring-arm camera with lock-on shoulder framing, boss assist and
occluder fade), `camera/Occluders.js`, `camera/LockOn.js`, `camera/MemeCam.js`, `player/Player.js` (`wishDir`,
`aimAssist`, `_readInput`), `player/PlayerStates.js`, `ui/touch.js` (floating stick plus drag-to-look plus a
9-button cluster), `world/HeightFog.js` and `world/Env.js` (FogExp2 chunk patch), `companions/abilities.js`
(`playerForwardYaw` uses `cam.yaw`), `story/tutorial.js` (the `move` step logs `looked`) and `world/Wheat.js`.

---

## 0. The design in one paragraph

The camera stops orbiting behind her. It becomes a **high, fixed-yaw, three-quarter top-down camera** (52° pitch,
38° vertical FOV, 13.5 m from a focus point a little ahead of her), like Wild Rift, LoL and Lost Ark, but pulled in
enough that a 1 m kitten still reads as a character (≈ 34 CSS px tall on a phone, ≈ 90 px at 1080p). Nothing needs to
be "looked at" any more, so the right thumb and the mouse are free for **aiming and targeting**. Movement is direct
(stick or WASD, screen-relative and stable because the yaw does not move) or **point-and-go** (tap or right-click
the ground, an enemy, a cage or an NPC) over a new **nav grid** that physics builds from the existing colliders and
heightfield. Combat stays a timing action game (combo, charge, Stand/parry, Tumble). Every action resolves its
direction through one **aim resolver** (drag > cursor > right stick > selected target > soft auto-target > stick >
facing). Three things keep it readable from above: telegraphs gain **ground "intent wedges"** and an optional
**parry timing ring**, she has an **x-ray silhouette** through occluders, and the fog is re-centred on her
(**focus-relative fog**). The fog moves away from the lens and onto the edges of the screen, so the mist still frames
the play space without washing her out. The eye-level Meme Cam becomes a **crane-down showpiece** from the top-down view.

---

## 1. Why the current scheme fails, from the code

| Problem | Where | Effect |
|---|---|---|
| Moving depends on the view: `wishDir` rotates the stick by `cam.yaw`, which auto-follow changes after 1.5 s and the boss assist changes too | `Player.wishDir`, `FollowCamera` auto-follow | Running in a straight line curves when the camera swings. Touch players must steer the view and move at once. |
| Touch needs two continuous drags (left stick plus right look) and leaves the right thumb no free moment for ⚔ / 🛡 / Tumble | `ui/touch.js` `_move` look branch | Combat on a phone is effectively impossible. Parry timing can't coexist with camera care. |
| A 3.6 m arm with a 45° FOV shows about 6 m to the sides and hides threats behind her | `CAMERA.dist/fov` | Relies on off-screen threat arrows. Flankers and crossbows hit from outside the view. |
| A spring arm in dense props (stones, trunks, eaves) needs a lot of avoidance code (`_avoid`, ARM_SHORT, lens fade grid) | `FollowCamera` | Camera pops and a claustrophobic forest and town. |
| Fog is measured from the lens (FogExp2 `vFogDepth`) | `HeightFog.js` `F_MAIN` | Any camera pulled back will fog **her**. At 13.5 m and `meadow_day` 0.045 she would be 31–36% fogged. |
| Pointer lock and mouse-look on desktop | `Input.attach` | No cursor, so no click interaction and no hover. Esc juggling. |

---

## 2. Camera

### 2.1 Rig (new camera mode `iso`; `cam.mode('follow')` maps to it)

| Parameter | Landscape (default) | Portrait | Notes |
|---|---|---|---|
| Yaw | **Fixed per level** (`level.cam.yaw`, default π so the camera is south and looks +Z) with optional **per-zone hints** | same | Blends 1.2 s easeInOutSine, **never in combat** (deferred until no engaged enemy for 2 s). See 2.2. |
| Pitch (down from horizontal) | **52°** at default zoom. Zoom-coupled: 46° at 9 m → 58° at 18 m (linear) | **58°** fixed | Lower when close keeps more ahead in view; higher when far stops tall props from hiding her. |
| Vertical FOV | **38°** | **50°** | Hold horizontal coverage, not vertical (2.4). |
| Distance (lens → focus) | **13.5 m** desktop, **12.5 m** phone (CSS width ≤ 950), user zoom **×0.70–×1.35** → clamp **9–18 m** | from a width fit: horizontal coverage ≥ **10 m** at the focus (≈ 22–24 m on a 390×844 phone) | Bosses auto-extend up to **22 m** (2.6). |
| Focus | her feet + `(0, 0.6, 0)` + lead | same | The camera targets the focus, not her head. |
| Focus lead | velocity × 0.25 s, max **1.6 m**, damped λ 4. Plus a constant **0.8 m screen-up** bias, so she sits a touch below centre and sees more of the path ahead | screen-up 0 (frame offset does it) | Off during the Stand and charge, so aim stays steady. |
| Vertical follow | Focus y follows her ground height (λ 6). **During a jump the focus takes only 30% of her height**, so the camera does not bob. | same | Mushroom bounces (9 m/s) take 50%. |
| Framing offset | `camera.setViewOffset` shifts her **4% below centre** | **she sits at 40% from the top**; the bottom 35% is thumbs and buttons | Changes the frame without changing the perspective. |
| Collision | **None.** The camera is above all walkable geometry. Occluders fade instead (2.5). | same | `FollowCamera` spring-arm code stays only for `preset` rails (PULLBACK `collide`). |
| Near / far | near 0.3, **far 90 m** (from 600) | same | Big culling win on mobile (§6.2). |
| Shake | Becomes **angular**: max ±0.6° pitch/yaw jitter at trauma 1, plus FOV punch. No translation (13.5 m × a translation shake would look like an earthquake). | same | `CameraShake` scales by `1/distance`. |

Reference coverage (landscape 16:9, default 13.5 m): ≈ 16.5 m wide at the focus, ≈ 9 m ahead of her, ≈ 5.5 m behind.
On a 19.5:9 phone at 12.5 m: ≈ 18.6 m wide, ≈ 8.3 m ahead, ≈ 5 m behind. That fits every melee encounter (tokenless
enemies orbit at 1.4 × 1.9 ≈ 2.7 m) and the crossbow rat's 10 m sight.

**Character size check** (her projected height ≈ 0.8 m at 52°): desktop 1080p ≈ 93 px; phone 390 px tall
landscape ≈ 36 CSS px (≈ 108 device px), with the bow, ears and sword readable. Below 30 CSS px the cat stops
reading as cute, so the zoom clamp computes `maxDist` from the viewport so her height never drops below **30 CSS px**.

### 2.2 Yaw: fixed, with authored hints and optional rotation
- **Default: fixed** (LoL). Screen-up is always the same world direction inside a zone, so joystick-up is always the
  same way. That matters most for mobile muscle memory.
- **Zone hints** (world authors them): `{ yaw, dist?, pitch? }` per zone. They are used where the path turns hard or
  a vertical set piece needs a side view: the Treetop, the Mushroom Ring, Lantern Alley and the B2 causeway (5.1).
  Hints apply on zone entry and blend in 1.2 s.
- **Stick latch:** while the stick or WASD is held through a yaw blend, movement keeps the yaw from when the stick
  was engaged. It re-latches on release, so a run never bends under the player's thumb.
- **Optional manual rotation** (Settings → Camera → "Allow rotating the view", **off** by default): two-finger twist
  on touch; MMB drag or `[` `]` 45° snaps on desktop; pad D-pad down plus RS. A manual offset persists until level
  load or `recenter` (Home key / pad R3 double-tap).

### 2.3 Zoom
- Touch: **pinch** anywhere off the buttons (two pointers, both on non-button areas). Continuous, damped λ 10.
  **Two-finger double-tap** resets.
- Desktop: **mouse wheel**, 1 tick = 7% of the distance, damped λ 8 (the wheel no longer switches lock; Tab does).
- Pad: **R3 click** cycles near / default / far (0.80 / 1.0 / 1.25).
- Saved as `settings.camZoom` (a multiplier).

### 2.4 Portrait vs landscape
- **Landscape is primary and recommended.** The current blocking "rotate" card becomes a **one-time dismissible
  toast** ("Plays best sideways"). Portrait is fully supported, not blocked.
- Portrait camera: pitch 58°, vertical FOV 50°, distance fitted so that **≥ 10 m** of ground spans the screen width
  at the focus, and her height is ≥ 28 CSS px (accepted, because the device is held closer). The frame offset puts
  her at 40% from the top.
- Portrait layout: the joystick zone is the bottom-left 50% × 38% band. The action cluster is compact (§8.3). The HUD
  is a condensed top strip (hearts, Valor and lives in one row; fish and kittens on the right).
- An orientation or resize change re-fits the camera over 0.4 s and re-flows the touch layout. Pointers in flight
  are released (`_release()`), and there is no reload.

### 2.5 Occlusion from above (trees, roofs, stones, caps, towers)
Reuse `Occluders.js` (`OccluderFader.update(dt, camPos, targets, n, lens)` already takes several targets):
- **Targets:** her chest (radius **1.0 m**), plus up to **4 engaged enemies within 8 m** (radius 0.6) and the
  **selected target** (radius 0.6). Anything that cuts a lens → target capsule fades.
- **Fade:** to opacity **0.22** in **0.15 s**, back in **0.4 s**. Use **dithered (screen-door) alpha** (an
  alpha-hash discard driven by a fade uniform) instead of blended transparency, so there is no sorting cost or
  shadow popping. The existing `minOpacity 0.3` becomes 0.22.
- **Canopies:** tree crowns (FADE_NAME matches) fade when within **3.5 m** horizontally of the capsule line. Trunks
  never fade (from above they are small). World splits crown and trunk where a prop is one mesh: `camFadeIds`.
- **Roofs:** new tag `camFade: 'roof'`. The roof parts of town houses fade when she is inside the roof footprint
  expanded by 1.5 m, or when the roof cuts the capsule. Walls stay. Eaves are the town's worst offender today.
- **Tall stones, pillars, towers, the bell tower:** `camFade: 'solid'`, as now, with the same capsule test.
- **X-ray silhouette (always on):** while > 30% of her capsule is occluded she draws a second pass with
  `depthFunc: GreaterDepth`, flat `#FFE4EC` at 0.55 alpha and a pink rim. It uses the **body proxy** (a capsule plus
  ear cones plus the bow), not the fur shells (draw-call cost: 1). Enemies **in wind-up** get the same pass in their
  telegraph colour (white / gold / red) at 0.45.
- **Soft player ring:** a 0.9 m pink ground ring under her at 0.35 alpha. It is drawn after the scene with depth
  test off, so she can always be found in grass, wheat and crowds (LoL's champion ring).

### 2.6 Framing: combat, bosses, cutscenes, Meme Cam
| Situation | Behaviour |
|---|---|
| Exploration | 2.1 defaults, lead on. |
| Combat (an engaged enemy within 10 m) | Lead off. **Focus bias** 30% toward the centroid of engaged enemies, max 2.5 m. **Auto zoom-out** up to +3 m when the engaged enemies' bounding circle exceeds 70% of the visible half-height. **Never auto zoom-in.** No yaw changes. |
| Selected target (old lock-on) | **No camera swing** (the shoulder and LOCK_SEP framing is retired in iso). Focus bias 35% toward the target, max 3 m. If the target leaves the 85% safe frame, zoom out up to the boss cap. |
| Boss | Distance = fit her plus the boss (its radius + 1.5 m) inside the 70% safe frame, clamp **14–22 m** (`boss.camDist` becomes the minimum). Focus 65% her / 35% boss. Pitch 56°. The yaw comes from the arena hint (B2 causeway: along the causeway). The `BOSS_EDGE` assist is replaced by this fit. |
| Arena waves / The Line | `arena.camDist` hint (The Line: 17 m, so the winch, both lanes and the horde are on screen). |
| Golden Hour activation | 0.8 s punch-in to 9 m at 46° (the ref1 moment from above), then a 0.6 s return. |
| Holy | FOV +5° punch for 0.15 s (as now). |
| Cutscenes | **Unchanged** (`presets.js` framings are anchor-relative). On `cutscene:end` the iso rig blends back in **0.8 s** from the last shot pose. **The fog mode blends with it** (§3.2). |
| Meme Cam | The "Descent" showpiece (§9.4). |

---

## 3. Fog and mood for a top-down view

### 3.1 The problem in numbers
FogExp2: `f = 1 − exp(−(ρ·d)²)`. With `meadow_day` ρ = 0.045 and the camera 13.5 m from her, `f(her) = 0.31` (0.36
after the height-fog ×1.15 near the ground). She would be a third grey, and `forest_day` (0.06) would be 0.48.

### 3.2 Focus-relative fog (world area, `HeightFog.js`, one chunk change for every material)
`V_MAIN` already reconstructs the world position for `vFogH`. Keep all of it as `vFogW` (vec3). New shared uniforms
in `HFOG`: `uFogFocus` (vec3), `uFogMode` (0 = classic lens distance, 1 = focus), `uFogClear` (m) and `uFogTopMul`.

```glsl
float dFocus = max(length(vFogW.xz - uFogFocus.xz) - uFogClear, 0.0) * uFogTopMul;
float dEff   = mix(vFogDepth, dFocus, uFogMode);
float hfDist = 1.0 - exp(-fogDensity * fogDensity * dEff * dEff);
```
- Camera writes `uFogFocus` = the camera focus every frame. `uFogMode` = 1 in iso. It blends to 0 over the shot
  blend in `preset`, `cutscene` and `meme`, so eye-level shots keep today's look exactly.
- Values: `uFogClear` = **5 m** while exploring, **7 m** in combat and boss fights (eased 0.6 s). `uFogTopMul` =
  **1.5**.
- Result with `meadow_day` 0.045 (distance from her → fog): 5 m → 0, 10 m → 0.11, 15 m → 0.37, 20 m → 0.64,
  25 m → 0.84. Screen corners (≈ 12 m) read about 0.2–0.3: **misty edges and a clear stage.** `forest_day` 0.06:
  10 m → 0.18, 15 m → 0.56 (denser, as the forest should be).
- Height fog: in iso, `uFogLowMix` 0.6 → **0.45**. Seen from above, all of the ground is "low", and 0.6 washes
  everything green.
- `Env` presets, `contribute()` (Jeer +0.01, lanterns −0.005, Golden Hour ×0.5, Cacklejaw P3 0.09) and every number
  in §12.2 **stay valid**, because density keeps its meaning. Only the distance changes. Cacklejaw P3 additionally
  sets `uFogClear` to 3.5 m (the stage shrinks; it is a mechanic).
- `LostKitten`'s draw cull `max(40, 2/ρ)` stays correct (it is still a distance on the ground).

### 3.3 Ground mist (fx, new; it replaces the "vertical card" look from above)
- **Mist sheets:** 8 horizontal quads, 12 × 12 m, at 0.4–1.3 m above the terrain. Scrolling two-octave noise, alpha
  0.10–0.22 tinted by the fog colour. Placed in a 4–16 m ring around the focus, **with a 3.5 m clear disc around
  her**. Depth-softened by height above the terrain, using `physics.heightAt` at the vertices (no depth texture
  needed). It is 1 draw call (instanced). Speed follows `env.wind`; Standing Ground and Meme Cam ×2 are kept.
- The existing `MistCards` stay for cutscenes and fog walls. In iso they lower to 0.3–1.2 m and tilt 60° toward
  the camera.
- `sun rays` and fireflies are unchanged. The sky dome is not visible in iso; that is expected.

### 3.4 Shadows and draw budget
- The shadow frustum follows the focus at **32 × 32 m** (texel-snapped as now), which is sharper for the same map size.
- At far 90 m with a smaller visible area, expect scene draw calls to drop about 30–45% (forest start 129 → about
  80). That is headroom for the silhouette pass, the decals and HP bars on Low and Med.

---

## 4. Movement

### 4.1 Direct movement (primary on touch and pad; desktop WASD scheme)
- Screen-relative (fixed yaw plus the stick latch). The §7.1 numbers are unchanged: walk ≤ 0.5 deflection (2.0 m/s),
  run 5.5, Zoomies 7.2.
- Touch joystick: **floating**, spawns at the touch-down point inside the left zone (landscape: the left **42%** of
  the width × the bottom **75%** of the height. Portrait: bottom-left 50% × 38%). Radius **56 px** × touchSize. Dead
  zone **0.10**. Walk/run at 0.5 as now. If the thumb drags past 1.6 R, the base follows it ("dynamic stick", as in
  Wild Rift).
- Any direct input **cancels a move order** at once (direct control always wins).

### 4.2 Point-and-go (tap or click to move) and pathfinding
**Orders:** `move(point)`, `attack(actor)`, `interact(target)`, `attackMove(point)` (desktop A+click) and `stop`
(desktop S). The player executes them in a new `player/Orders.js`.

**Nav grid (physics, new `physics/NavGrid.js`, built in `setLevel` under the loading veil):**
- A 2.5D grid with **0.5 m cells** (meadow and forest 200 m → 400 × 400 = 160 k cells). `Uint8` flags and `Float32`
  surface heights, ≈ 0.8 MB. Build target ≤ 60 ms.
- **Surface per cell:** `topAt(x, z)` (the heightfield plus walkable collider tops: mushroom caps, ledges, the
  bridge deck, the gate deck).
- **Blocked:** a slope with normal.y < 0.7; deep water (`isDeepWater`); out of bounds; and static colliders
  **rasterised** by footprint, expanded by the agent radius (0.32 + 0.08 margin), where the collider spans
  [surface + 0.3, surface + 1.0]. Rasterising is much faster than per-cell `blockedAt`. Colliders tagged
  `nav: false` are skipped.
- **Steps:** a neighbour Δh ≤ 0.3 is a walk edge.
- **Jump links** (auto-generated): Δh up 0.3–**1.1 m** (the jump apex is 1.245) across ≤ **2.4 m** horizontally;
  drops down ≤ **3.0 m** (one-way); gaps ≤ **2.0 m** over blocked or deep cells. Cost +2.0. Bounce caps (`bounce`)
  get up-links to ≤ 1.8 m.
- **Authored links:** world can add `navLinks: [{from, to, kind: 'jump'|'drop'|'bounce'}]` for set pieces (Treetop
  ledges, Mushroom Ring order).
- **Dynamic:** `addCollider` and `removeCollider` (arena fog walls, the portcullis, Mochi's Shield Wall, objective
  blockers) call `nav.invalidate(aabb)`, which re-rasterises only those cells (< 2 ms).
- **Query:** `physics.findPath(from, to, opts, out)` → `{ points, links, partial }`. A* (octile heuristic, binary
  heap, **≤ 6000 expansions** ≈ 1.5 ms), then string pulling with a grid raycast, max 48 points. A blocked goal snaps
  to the nearest walkable cell within 3 m. An unreachable goal gives `partial: true` and walks to the nearest
  reachable point; the marker turns grey with a small "✕".
- Also `physics.nearestWalkable(p, r)` and `physics.navWalkable(x, z)`.

**Path follower (player):**
- Steer toward the next point. Arrival radius 0.25 m (0.6 m for intermediate points). It uses the normal move state,
  so accel, decel, Zoomies and footsteps all apply.
- **Auto-jump at links:** within 0.6 m of a link start and facing it within 35°, it presses jump. **Jump assist**
  sets the horizontal velocity so the landing hits the link end (max 5.5 m/s air). Pounce never triggers from a move
  order.
- **Re-plan** when stuck (< 0.3 m progress in 0.4 s) or when an `attack` target has moved > 1.5 m. At most every
  0.25 s. Give up after 3 failed re-plans.
- **Tumble** does not cancel an order (it resumes after the roll). **Stand, Milk, Meow and abilities pause** it;
  release resumes a move order but not an attack order. **Attack** (button / LMB) cancels a move order.
- Hold-to-follow: holding RMB (desktop) or a long press on the ground (touch, > 0.35 s) **continuously re-targets**
  the point under the finger or cursor every 0.1 s (no path above 18 m, direct steering under 3 m). That is LoL's
  "hold RMB".

### 4.3 Jumps, ledges and Pounce from above
- **Blob shadow** under her at all times (a decal, 0.55 m, darkening as she rises), plus a **landing marker** (thin
  ring) while airborne above 0.4 m. From above, height is only readable through shadows.
- **Ledge readability:** walkable collider tops get a 6 cm lighter lip and an AO band beneath (world art pass).
  Fences cast long-ish shadows from the low sun presets.
- **Jump assist** (direct control too): when she jumps toward a walkable top within 2.4 m, horizontal velocity is
  nudged (≤ 1.2 m/s, ≤ 20°) so she lands at least 0.3 m inside its edge (the Mushroom Ring becomes doable on a phone).

---

## 5. Targeting and aiming

### 5.1 One aim resolver (`player/Aim.js`, pure, unit-testable)
Every directional action (swing assist, charge release, Pounce dive, Tumble, Stand facing, ability) asks
`resolveAim(kind, ctx)`. Order of precedence:
1. **Explicit drag** on that action's touch button (§8.2), or the **right stick** (pad, past 0.35).
2. **Cursor** (desktop: the ground point under the mouse, from `cam.screenToGround`).
3. **Selected target** (tap or click on an enemy; it replaces lock-on) if alive and within the action's range + 1.5 m.
4. **Soft auto-target** (5.2).
5. **Movement stick** direction (> 0.3).
6. **Facing.**

Swings still turn her at most **90°** on touch and pad, 120° with a cursor (desktop players are precise).

### 5.2 Soft auto-target rules (touch and pad; desktop when no cursor target)
Candidates: hostile, alive, `hurtable !== false`, not hidden, within **4.5 m** (touch) / 3.5 m (pad) / 3 m (KBM),
plus **breakables** (rope posts, cages, crates, cracked boulders: anything world or companions mark `assistable`) at
lower priority. Score (lower wins):
```
score = dist
      + 2.0 · (|angle to (stick dir or facing)| / π)
      − 2.5 · (winding up on her with an active telegraph)        // the one about to hit you
      − 1.0 · (is the selected target)
      − 0.8 · (hp < 30%)                                           // finish kills
      + 3.0 · (breakable)                                          // enemies first
```
- **Sticky:** the current auto-target is kept unless a challenger scores ≥ 0.75 better, so a combo never ping-pongs
  between two rats.
- **Lunge magnetism:** if the target is beyond the swing range, the lunge becomes
  `clamp(dist − 0.7·range, lunge, lunge + 1.2)` m (gap-close up to +1.2 m). Riposte's auto-turn (4 m) is kept.
- **Pounce:** the dive aims at the best candidate inside a 3 m disc around her ground projection (crows first), else
  straight down and forward.

### 5.3 Selection (it replaces lock-on; the `cam.lock` API stays as its store)
- **Select:** tap or click (LMB or RMB) on an enemy; pad RB (nearest, by the 5.2 score); Tab (desktop, cycles by
  distance); D-pad left/right cycles.
- **Shows** a gold rotating ground ring (1.2 × radius) under the target and a small world-space HP bar. The ring
  turns red when the target winds up.
- **Breaks** at 16 m, on death (it auto-hands over to the nearest engaged enemy within 6 m, as now), on tapping it
  again, or when tapping empty ground on touch (as in `tapLock` today).
- `cam.lockTarget`, `lock()`, `unlock()` and `switchLock()` stay (the touch `tapLock`, the companions' token share
  and the boss code all read it). Only the **camera behaviour** changes (2.6).

### 5.4 Picking (camera, new `cam.pick(clientX, clientY, opts)`)
- `cam.screenToGround(x, y, out)`: a ray through `physics.raycast` (terrain + mesh + statics) and, as a fallback,
  the plane at her ground y.
- `cam.pick` → `{ kind: 'enemy'|'npc'|'interact'|'pickup'|'breakable'|'ground', actor?, target?, point }`. Actors
  are picked in screen space: their chest projection within **36 px** (mouse) / **56 px × touchSize** (touch)
  of the pointer, **or** the ray hits their capsule. Priority: enemy > breakable > interactable/NPC > pickup >
  ground. This generalises `pickTapTarget` from `ui/touch.js`.
- Desktop hover: picked **at most once per frame** on mouse move. It feeds the cursor and highlight (§8.4).

---

## 6. Moveset mapping (every action, every device)

### 6.1 Schemes
- **Desktop "Click" (default, LoL/Lost Ark):** RMB move/attack/interact, LMB swing at the cursor, QWER kit.
- **Desktop "WASD"** (Settings → Controls): WASD move, the mouse aims, close to today's keys.
- **Gamepad:** twin-stick (the right stick aims instead of looking).
- **Touch:** Wild Rift layout.

### 6.2 Table

| Action (§7) | Desktop Click (default) | Desktop WASD | Gamepad | Touch |
|---|---|---|---|---|
| Move | **RMB** ground (hold = follow cursor); `S` stop; `A`+click attack-move | WASD (screen-relative) | Left stick | Left joystick, or **tap ground** |
| Attack an enemy / approach | **RMB on an enemy**: path into 1.6 m, then auto-chain Snip→Snap→Swoosh while it lives and you don't give another order (setting "Auto-attack after approach", default **on**) | LMB on an enemy within 6 m gives a short dash-in (lunge magnetism), no pathing | — | **Tap an enemy**: select it and path to it, then auto-chain (same setting) |
| Snip / Snap / Swoosh | **LMB** tap toward the cursor (each press = next step; 0.2 s buffer, `comboGrace` 0.18) | LMB | X | **⚔** tap (auto-combo taps, as now) |
| Charge → Swoosh / Bright / Holy | Hold LMB; she turns to the cursor at 540°/s while charging; an arc indicator shows the reach | Hold LMB | Hold X; RS aims; else auto | Hold ⚔ (ring fills; gold at tier 2). **Drag while holding** aims (arc indicator); release fires |
| Pounce | `W` (jump) then LMB in the air; the dive aims at the cursor's nearest target within 3 m | Space then LMB | A then X | Jump then ⚔ (auto-aims crows) |
| Riposte | LMB within 0.8 s of a parry (auto-turn) | LMB | X | ⚔ (a "Riposte!" pulse on the button) |
| **Stand** (hold) / **parry** (press timing) | **Q** (hold). She **faces the cursor** at 360°/s and shuffles with WASD/orders at 1.2 m/s | **RMB** | LB; RS faces, else she auto-faces the nearest winding-up attacker | **🛡** (hold). She **auto-faces** the nearest attacker in wind-up within 6 m, else the selected target, else the stick. The stick strafes without turning |
| Standing Ground | Hold Q planted (unchanged rules) | Hold RMB | Hold LB | Hold 🛡 |
| Tumble / Purrfect Dodge | **Space**: toward the cursor (LoL players' muscle memory for a mobility key) | Shift: move direction, else cursor | B: left stick, else facing | **Tumble button** fires **on press** (stick dir, else facing). **Drag on it within the first 0.08 s steers** the roll once (≥ 16 px). **Swipe anywhere free on the right half** (≥ 40 px in ≤ 150 ms) = tumble that way |
| Jump | **W** (with an order: along the path; else toward the cursor if > 1 m away, else in place) | Space | A | **Jump** button (direction from the stick, else the path, else in place) |
| Interact (talk, cage, vigil, shop, board) | **RMB / LMB on it** (path, then interact within its radius); `F` = nearest in range | E | Y | **Tap it** (path + interact), or the contextual **"!"** button (nearest in range) |
| Pick up | Walk over (magnets as now); RMB on it paths there | same | same | Tap it |
| Kitten ability | **E**: smart cast at the cursor (quick cast with an indicator while held; release casts) | Q (aims at the cursor) | **LT**: tap = smart cast; hold = aim with RS, release casts | Portrait button: **tap = smart cast**; **drag = aim** with a ground indicator; drag onto ✕ = cancel |
| Golden Hour | **R** (Valor 100), or Q+LMB together (kept) | V, or RMB+LMB | RT, or LB+X | Gold button (appears at Valor 100) or 🛡+⚔ together |
| Milk Break | **D** | R | D-pad up | Milk button |
| Meow | **C** (unchanged; F is interact) | C | L3 | Cat-face button |
| Select / cycle target | LMB/RMB on an enemy; **Tab** cycles | Tab | RB nearest; D-pad ←/→ cycle | Tap an enemy |
| Zoom | Wheel | Wheel | R3 (3 steps) | Pinch |
| Peek (look ahead) | Hold **MMB** and drag: the focus pans up to 6 m, springs back in 0.3 s on release | same | Hold R3 + RS | — |
| Recentre / reset rotation | Home | Home | R3 double-tap | Two-finger double-tap |
| Pause / hold to skip a cutscene | Esc / P | Esc / P | Start | ❚❚ (hold 1 s) |

Notes:
- The Click scheme's ability-key row is `Q Stand · W Jump · E Kitten · R Golden Hour · D Milk · F Interact ·
  C Meow · Space Tumble`. It is QWER-shaped like LoL. R is the "ultimate", as in LoL.
- **Mouse buttons can be swapped** (Settings → Controls → "Move with LMB"), for players coming from Diablo or
  Lost Ark.
- **Key rebinding:** `settings.bindings` (an action → codes override) merged over `INPUT.schemes[scheme].keys`.
- **Pointer lock is removed** in iso (`pointerLockEnabled = false`). Pause comes from Esc as a normal key again,
  which deletes the `_lockLost` → pause dance.
- Hold vs toggle for the Stand and the charge stay (§14.4).

---

## 7. Parry and Stand readability from above (telegraphs)

The §8.1 language (colour + shape + sound) is kept. From above, the glints on the weapon are small, so add:

1. **Intent wedge (new, every melee wind-up):** a ground decal from the attacker's feet that is exactly the
   attack's arc (`ATTACKS[id].arc.range/from/to`, rotated by the attacker's facing), in the telegraph colour
   (white `parry`, gold `gold`, red `red`), at a 0.25 alpha fill and a 0.8 alpha rim. It **fills** from the attacker
   outward over the wind-up and **flashes** on the active frame. This is the top-down equivalent of seeing the arm
   pull back. Enemies or combat add `arc` and `activeAt` (absolute sim time) to the `combat:telegraph` payload, an
   additive JSDoc change.
2. **Glint scale:** glint and "!" sprites get a **minimum screen size of 28 px** (34 px for gold), and the 0.25 s
   "strike flash" is 1.6× larger. The "ting" stays.
3. **Parry timing ring (assist, Settings → "Parry timing ring": default on for Kitten difficulty and touch, off
   otherwise):** for the **single most imminent** parryable incoming attack, a ring starts at 2.2 m around her feet
   and shrinks to her collider radius exactly at `activeAt`. Press the Stand when it meets her. The ring is gold for
   gold telegraphs. It is red and **does not appear** for unblockable attacks; a red "!!" dodge chevron pulses
   instead. Parry windows are unchanged (touch +0.05 s kept).
4. **Ranged aim lines** (`aim`): drawn on the ground (y +0.05) along the full projected path up to 12 m, dotted.
   They freeze (stop tracking) 0.2 s before the shot as now. From above they read perfectly.
5. **Shadow** (crow dives) and **aoe** decals need no change; they were already top-down language. Increase their
   rim width to 0.12 m for a 13.5 m camera.
6. **No off-screen snipes (enemies):** a ranged enemy may start an `aim` wind-up only if it is inside the camera's
   safe frame (NDC |x|, |y| ≤ 0.92) **or** within 9 m of her. Off-screen threat arrows (ui) remain for melee from
   behind (the bottom edge) and are needed far less.
7. **Aggro rings:** alerted enemies show a thin red ground ring (0.08 m, 0.35 alpha); idle and patrolling ones
   show none. You can read who is coming at a glance, as in LoL.

---

## 8. UI

### 8.1 Touch layout (landscape; all sizes × `settings.touchSize` 0.8–1.4; safe-area insets respected)
```
 top:   [portrait♥♥♥♥ grit valor ×9]            [❚❚]                 [fish] [kittens] [letter]
                                                                          (✕ cancel chip appears here while aiming)
                                                             [Meow 44] [Milk 48]
                                                       [Ability 64]        [Golden 64*]
                                                                  [Jump 60]
 bottom: (floating joystick zone)          [Tumble 60]  [Stand 72] [⚔ ATTACK 92]
```
- **⚔ Attack:** **92 px**, centre at (right 36 px + inset, bottom 36 px + inset).
- **Satellites** on an arc of radius **112 px** from the ⚔ centre: **🛡 Stand 72 px at 180°** (directly left,
  where the thumb rolls: the most timing-critical button gets the biggest satellite), **Tumble 60 px at 215°**,
  **Jump 60 px at 270°** (straight up).
- **Outer arc, radius 196 px:** **Ability 64 px at 235°**, **Golden Hour 64 px at 275°** (hidden until ready;
  pulses), **Milk 48 px at 300°**, **Meow 44 px at 320°**.
- **Contextual "!" Interact: 64 px** at 150° on the inner arc (radius 112), shown on `interact:available`.
- **Minimum touch target 48 px** (the visible icon may be smaller; the hit area is padded). Spacing ≥ 8 px.
  Options: **left-handed mirror**, **button opacity** 40–100%.
- **Removed:** the right-side "drag to look". **Free right-side area:** tap = point-and-go / select / interact;
  swipe = tumble; pinch = zoom.
- **Portrait:** the cluster scales to 0.85, ⚔ is 80 px, the outer arc radius is 168. The joystick zone is the
  bottom-left 50% × 38%. The dialogue box sits above the controls (controls hide in dialog mode anyway).

### 8.2 Drag-to-aim (abilities, charge, tumble steer)
- **Press:** the button shows a 96 px translucent aim pad around itself.
- **Release within 16 px of the start:** smart cast (§5 rules, plus the ability's own smart rule, §10.4).
- **Drag ≥ 16 px:** aim. The drag vector maps to a world direction via the camera yaw, and its magnitude
  (÷ 90 px) maps to range for point-targeted abilities. The fx ground indicator updates live (§10.6).
- **✕ cancel chip** (72 px, top-right below the HUD) appears while aiming; releasing over it cancels. A drag back
  inside 16 px also counts as cancel for abilities (Wild Rift).
- Setting **"Ability casting":** `smart` (tap casts; drag aims, the default) / `indicator` (tap shows the indicator,
  tap again casts) / `drag only`.

### 8.3 Ability bar and cooldowns (desktop and pad; LoL-like)
- **Bottom centre bar:** `[Q Stand + 3 Grit pips] [W Jump] [E Kitten portrait + radial cooldown + seconds]
  [R Golden Hour: the frame fills with Valor; gold at 100] | [D Milk ×n] [F Interact] [C Meow 1 s cd]
  [Space Tumble 0.2 s cd]`. Key glyphs follow the scheme and device (pad glyphs on pad).
- Slots 56 px (desktop), 48 px gaps. **Cooldown:** a clockwise dark sweep plus whole seconds when ≥ 1 s left, and a
  white "ready" flash and soft tick when it comes back.
- On touch the same states show **on the cluster buttons** (sweep and seconds). The bar is hidden on touch.
- The HUD Valor sword stays top-left (signature art). The R slot mirrors it.

### 8.4 Cursor and hover (desktop)
- CSS cursors (32 px, 2× for HiDPI; ui assets): **gauntlet pointer** (default), **sword** over an enemy (red
  outline), **paw** over interactables, pickups and cages (gold outline), **speech** over NPCs, **grey ✕** over
  unreachable ground (when the path is `partial` with the gap > 2 m).
- **Hover highlight:** an outline or rim on the hovered actor (characters' `setHighlight`, §10.9). Enemies: red
  `#FF6A3D`. Interactables: gold `#FFD34D`. NPCs and kittens: white.
- **Move marker:** a pink paw-print ripple at the order point (0.5 s, 1.0 m). Red-orange for an attack order, gold
  for interact. While RMB is held, 3 small dots show the next path segment.

### 8.5 World-space UI
- **Enemy HP bars:** a 36 × 5 px pill above the head (y + height + 0.3 m). Shown when damaged, selected or in a boss
  wave; fades 3 s after the last hit. Pool of 12 (the old lock pip bar generalised). The boss keeps the top bar.
- **Interaction tags:** shown on hover (desktop) or within 6 m (touch), with the scheme's glyph ("Tap" / "F" /
  "Y" / "RMB").
- **Off-screen arrows:** as now, but hidden for threats inside the frame (most of them now).

### 8.6 Haptics (touch: `navigator.vibrate`; Android Chrome only, iOS Safari has no API, so it degrades silently;
pad: the existing `rumble`)
| Event | Pattern (ms) | Notes |
|---|---|---|
| ⚔ / 🛡 / Tumble press | 8 | Setting "Button taps" (default off) |
| Hit landed (heavy) | 12 | — |
| Parry | [18, 30, 36] | Felt timing confirmation |
| Purrfect Dodge | 25 | — |
| Block | 10 | — |
| Guard break | [40, 40, 40] | — |
| Hurt | 55 | — |
| Holy release / Golden Hour | 70 / 110 | — |
| Kitten found / rescued | [15, 60, 15] | — |
| Order rejected (unreachable) | [10, 40, 10] | — |
Scaled by `settings.haptics` (0 / 0.5 / 1, default 1 on touch). Never during menus. The same calls go through a new
`input.haptic(kind)` that routes to `vibrate` or `rumble`.

### 8.7 Settings additions (ui, save schema migration)
`controlScheme` ('click'|'wasd'), `swapMouse`, `bindings` {}, `camZoom` (1.0), `camRotate` (false),
`autoAttack` (true), `tapToMove` (true), `castMode` ('smart'), `parryRing` ('auto' = Kitten or touch), `haptics` (1),
`hapticTaps` (false), `leftHanded` (false), `buttonOpacity` (0.85), `reduceCameraMotion` (false: no lead, no
auto-zoom, no punch-ins). `invertY` and `sensitivity` are retired in iso (kept in the save for presets and Photo
Mode).

---

## 9. Level and design changes

### 9.1 Camera hints per level (world authors, in the level data)
| Level | Base yaw | Zone hints |
|---|---|---|
| meadow | π (path runs +Z from the practice field (z −80) to the exit (z 92)) | Standing Stones arena: dist 15. Glade: 15. Old Bridge: yaw along the bridge, dist 15. Crow Fields: 15 (crows plus 2 crossbows). Practice field: dist 12 (tutorial readability) |
| forest | along the spine's main bearing | **Mushroom Ring:** yaw facing the spiral's open side, pitch 44°, dist 11, `uFogClear` 7. **Treetop:** a side view of the trunk face, pitch 38°, dist 10 (vertical climb). Spider Hollow: 12. Cheese Mill B1: boss fit |
| town | toward the Castle Steps | **Lantern Alley** and **Post Office chase:** yaw along the alley (it rotates once per segment, max 2 hints). Square: 16. Hub: 15 |
| gate | along the causeway | The Line: dist 17, pitch 56°. B2: along the causeway, boss fit. Ballista raft: 14 |
| bog / keep (M3) | author with these rules from the start | Keep rampart climb: side-view hint like the Treetop |

### 9.2 Space and props audit
- **Camera-side clutter:** any prop taller than 2.2 m within **6 m south (camera side) of the spine or an arena
  centre** must be `fade: true` / `camFade`, or be moved. A world smoke block screenshots each zone from its hint and
  asserts her silhouette-pass pixel count is small.
- **Roofs:** town houses tag their roof parts `camFade: 'roof'` (2.5).
- **Wheat (Crow Fields):** the stalks are 0.82–1.06 m, so she (1.0 m) vanishes from above. Add a **trample field**
  to `Wheat.js`: within 1.4 m of her (and of up to 4 enemies) stalks bend outward and flatten to 40% height within
  0.9 m (a vertex-shader uniform array). The crossbow perches stay visible.
- **Fences and stiles:** the 1.0 m fences get nav jump links (auto). "Jump the fence" still teaches jumping
  (point-and-go jumps automatically, and that is fine, because it teaches "you can jump").
- **Narrow paths:** `pathWidth` 3 (meadow side paths) is fine from above. Any corridor < 1.6 m clear width is flagged
  by the nav build (log a warning with coordinates) for world to widen.
- **Deep water and pits:** they are nav-blocked, so point-and-go never splashes her. Direct control can still splash,
  as now.
- **Breakables and rope posts:** mark them `assistable` (5.2) so ⚔ taps hit them without precise facing.
- **Vigil Stones, cages, Quest Board, stations:** interaction radius stays. The pick radius is ≥ 1.2 m so a tap on
  the general shape works.

### 9.3 Jumps, Pounce and ledges
- **Mushroom Ring:** each cap step Δh ≈ 1.0–1.2 m within the 1.245 m apex. Keep it. The jump assist (4.3) plus the
  landing marker make it phone-playable. Bounce caps 2 and 4 get a subtle up-arrow glyph on the cap top.
- **Treetop root ledges:** authored `navLinks` so tapping Sage's cage climbs automatically. The side-view hint makes
  manual play readable.
- **Crow Fields Pounce chains:** the Pounce dive auto-aims crows within 3 m. The pogo (vel.y 6) keeps the focus at
  30% vertical follow, so the camera stays calm.
- **Gate ledge stair** (z −53…−50): the steps are ≤ 0.3 m, so it is walkable. Verify after the nav build.

### 9.4 The Meme Cam showpiece ("The Descent")
- **Enter (2.0 s, as specified):** the camera **cranes down from the iso pose into `MEME_LOOP`** on an arc (the
  position along a quadratic Bézier whose control point is 3 m above her; easeInOutSine; FOV 38 → 32). The fog mode
  blends 1 → 0 in sync, so the misty horizon and sky appear as the camera reaches eye level. The HUD and touch
  cluster fade out over 0.5 s. Wind ×1.6, mist ×2 and the 3.8 s loop are unchanged.
- The contrast between the gameplay top-down view and the cinematic eye-level shot makes the meme moment **more** of
  an event than today. Use the same crane for `TWO_SHOT_LOW` / `HERO_LOW` hand-ins in cutscenes where the scene
  starts from gameplay.
- **Exit:** any input, a **0.9 s rise** back to iso (from 0.6 s, because the travel is longer).
- Triggers are unchanged (idle 15 s; hold the Stand 2.5 s planted with no enemy within 12 m). On touch, the idle
  timer ignores a resting thumb on the joystick zone with no deflection.

---

## 10. Per-area change list (exact)

### 10.1 core (`src/core/**`, the integrator)
- `config.js`:
  - `CAMERA.iso = { yaw: Math.PI, pitch: 0.908 /*52°*/, pitchNear: 0.803, pitchFar: 1.012, fov: 38, fovPortrait: 50,
    dist: 13.5, distPhone: 12.5, zoom: [0.70, 1.35], distMin: 9, distMax: 18, bossDist: [14, 22],
    portraitWidth: 10, minCatPx: 30, lead: { t: 0.25, max: 1.6, up: 0.8, lambda: 4 }, jumpFollow: 0.3,
    combat: { radius: 10, bias: 0.3, biasMax: 2.5, zoomOut: 3 }, yawBlend: 1.2, far: 90, shakeDeg: 0.6,
    fog: { clear: 5, clearCombat: 7, topMul: 1.5, lowMix: 0.45 } }`.
  - `INPUT.schemes = { click: {...}, wasd: {...} }`, `INPUT.pad` adds the RS aim and R3 zoom.
  - New actions: `move` (order), `stop`, `attackMove`, `zoomIn`/`zoomOut`, `peek`, `rotL`/`rotR`.
  - `PLAYER.assist` adds `padAngle: 1.571, padRange: 3.5, cursorAngle: 2.094, touchRange: 4.5, magnet: 1.2,
    sticky: 0.75`.
- `Input.js`:
  - `pointer { x, y, inside, moved }` (CSS px, updated on mousemove without a lock).
  - A `clicks` queue (`{button, x, y, down, t}` edges; `takeClick()`).
  - `addTap(x, y, long)` for ui touch taps.
  - `aimStick {x, y}` (pad RS), `zoomDelta` (wheel, pinch via `addZoom(k)`), `consumeZoom()`.
  - Scheme switching from `settings.controlScheme` and `bindings`.
  - `haptic(kind)` (vibrate or rumble, settings-scaled).
  - `pointerLockEnabled = false` in iso. `consumeLook()` returns zeros (kept for presets and Photo Mode).
  - The wheel → `zoom` (no lock pulses in iso).
- `GameState.settings` defaults (§8.7).
- `events.js` (additive names): `player:order {kind, point, target}`, `target:changed {actor, prev}`,
  `cam:zoom {dist}`, `input:scheme {scheme}`. JSDoc: `combat:telegraph` gains `arc`, `activeAt`.
- `debug.js` hooks: `__GAME__.click(x, y, button)`, `tap(x, y)`, `order(kind, point|id)`, `cam.iso()` →
  `{yaw, pitch, dist, focus}`, `fogAt(x, z)` → the final fog factor (for smoke asserts), `nav.path(a, b)`.
- `Game.js`: no pointer lock in iso; Esc → pause directly.

### 10.2 camera (`src/camera/**`)
- New `IsoRig.js` (pure maths: pitch/zoom curve, coverage fit, focus lead, combat bias, boss fit; unit-tested).
  `FollowCamera` uses it for `follow` / `lock` / `boss` modes. The orbit, spring-arm, auto-follow, shoulder and
  LOCK_SEP code stays only for `preset` rails and an optional `classic` debug mode (`?cam=classic`), so it is not
  deleted in one step.
- `setViewOffset` framing per orientation; re-fit on resize or orientation change (0.4 s).
- `screenToGround`, `pick`, `worldToScreen`, `zoom(k)`, `setHint({yaw, pitch, dist, clear}, blend)`, `focus`
  (Vector3, read-only), and a `stickYaw` latch for the player.
- `Occluders`: dithered fade (alpha-hash with a fade uniform), multi-target capsules, `'roof'` kind, crown-only
  fade, minOpacity 0.22.
- X-ray silhouette pass for the player and wind-up enemies (it asks characters for the proxy mesh, §10.9).
- Writes `HFOG.uFogFocus/uFogMode/uFogClear` each frame (or via `env.setFocusFog()` if world prefers to own the
  write; see 10.7).
- `MemeCam` enter/exit crane from the iso pose; the cutscene hand-back blend is 0.8 s.
- `CameraShake`: angular mode.
- `LockOn`: the marker becomes a **ground ring** (fx draws it; the camera keeps the data). Camera swings are retired.

### 10.3 player (`src/player/**`)
- `wishDir` uses `cam.stickYaw` (the latched yaw) instead of `cam.yaw`.
- New `Orders.js`: the order queue from `input.takeClick()`, `input.addTap`, ui and pad; the path follower;
  auto-jump links with jump assist; hold-to-follow; attack-approach and auto-chain; interact-approach (it calls the
  same interact path as `E`).
- New `Aim.js` (§5.1, pure). `aimAssist()`, the charge release, `startDodge()`, Stand facing and the Pounce dive all
  use it. Lunge magnetism.
- Stand facing: face the cursor or RS; on touch, auto-face the nearest wind-up within 6 m. The stick strafes without
  turning while in the Stand.
- Tumble: the 0.08 s **steer window** (`steerDodge(dir)`, called once by ui on a drag).
- A public `aim` field `{ active, kind: 'arc'|'lane'|'rect'|'circle'|'ring', dir, point, range, width }` read by fx
  for indicators. Fields `order` and `path` are read by fx for the marker and dots.
- `MemeCamTrigger`: idle now uses `idleTime` only (`lookIdleTime` is gone in iso); it ignores a resting touch thumb.
- `tutorial`-facing note: the "looked" fact disappears (story, 10.11).

### 10.4 companions (`src/companions/**`)
- `abilities.js`: `playerForwardYaw` → `playerAimYaw(ctx)` = `player.aim.dir` if active, else the
  `resolveAim('ability')` result.
- **Shield Wall:** placed 1.5 m along the aim. Smart cast = between her and the nearest engaged enemy cluster
  (centroid of the engaged enemies within 6 m), else facing. Indicator: a 3.0 × 0.4 m rect.
- **Volley:** the selected target gets 2 of the 5 arrows if within 14 m. Indicator: a 14 m range ring plus marks on
  the ≤ 3 chosen targets.
- **Purr:** self. Indicator: a soft green ring.
- `useAbility({ dir, point })` entry point for the aimed cast. Expose `readiness` and `cooldownLeft` (the ui shows
  seconds).

### 10.5 combat (`src/combat/**`)
- `assistTarget(actor, range, ang, out, opts)` implements the §5.2 score (sticky, breakables, wind-up priority) and
  returns the score breakdown for tests.
- Lunge magnetism support in `beginSwing` (the swing reads `opts.lungeTo`).
- The `combat:telegraph` payload gains `arc` and `activeAt` (computed from `windup` × the difficulty windup mul).
- A `parryRing` query: `combat.nextParryable(player)` → `{ attacker, activeAt, kind }`, the most imminent incoming
  parryable attack (fx draws the ring).
- Projectiles: no change (reflect homing already aims at the shooter).

### 10.6 fx (`src/fx/**`)
- One **ground-decal pool** (instanced, depthWrite off, polygonOffset; 1–2 draw calls) for the blob shadow and
  landing ring, the player ring (no depth test), the selection ring, aggro rings, the move marker paw, path dots, the
  hover ring, the **intent wedges**, the **parry timing ring**, and the aim indicators (arc / lane / rect / circle /
  range ring) read from `player.aim` and `companions` aim.
- Telegraphs: minimum screen size for glints (28 px; gold 34 px), a 1.6× strike flash, ground aim lines, rim 0.12 m.
- **Ground mist sheets** (§3.3). `MistCards`: iso height and tilt.
- Damage numbers: rise 0.6 m and scale with the camera distance (min 18 px).

### 10.7 world (`src/world/**`)
- `HeightFog.js`: the `vFogW` varying and the focus-fog uniforms (§3.2). Iso `uFogLowMix`. `Env` keeps ownership of
  density and colour. Add `env.setFocusFog({ focus, mode, clear })` if world wants the camera to call through it.
- Level data: `cam: { yaw }`, zone `cam` hints (§9.1), `navLinks`, `nav: false` on non-blocking colliders,
  `camFade: 'roof'` on town roofs, crown/trunk split ids, and `assistable` on rope posts, crates and cracked boulders.
- `Wheat.js` trample uniforms. Ledge lip and AO art pass. The camera-side clutter audit (§9.2).
- `Level.js` interact: expose `interactables` (id, pos, radius, prompt) for `cam.pick` and order approach. Keep
  `INTERACT_AVAILABLE`.
- Sun shadow frustum 32 m around the camera focus (not the player) in iso.

### 10.8 physics (`src/physics/**`)
- New `NavGrid.js` (§4.2), built in `setLevel` and invalidated by collider add/remove. API: `findPath`,
  `nearestWalkable`, `navWalkable`, `nav.debugDraw()` (in PhysicsDebug).
- Unit tests: A* on synthetic grids, jump-link generation from steps, invalidation, and the expansion cap.

### 10.9 characters (`src/characters/**`)
- `setHighlight(color | null, strength)` on KittenView and dressed beasts (rim emissive via the existing material
  patcher). It is cheap: a uniform, no extra pass.
- **Silhouette proxy:** `getSilhouetteProxy()` = a capsule plus ears plus bow, in one merged mesh per character
  (player, and enemies in wind-up).
- **Readability from above:** at camera distance > 9 m, scale the **pink bow ×1.25** and the **ears ×1.1** (LOD
  uniform; the bow stays pink and on the left ear, the hard rule). Helmet tops of enemy types get a contrasting top
  colour (rat kettle helm light iron, hyena hat already distinct), so types read from above.
- The fur shell count can drop one LOD step at > 12 m (fewer pixels per cat; a draw-call win).

### 10.10 enemies (`src/enemies/**`)
- Telegraph payloads carry `arc` (from the attack def) and `activeAt`.
- **No off-screen snipes** (§7.6): `canStartAim()` checks `ctx.cam.worldToScreen` safe-frame or ≤ 9 m.
- Alerted state is exposed for aggro rings (`alerted` exists). Expose `hp/maxHp` for HP bars (exists).
- Optional (later): chase via `physics.findPath` when the straight line is blocked (less wall-hugging, visible from
  above now).

### 10.11 story (strings and tutorial; `src/story/**`)
- Strings per scheme: a key with suffixes `.touch`, `.pad`, `.wasd`; the base key is the Click scheme. ui picks
  `key.<scheme|device>` when it exists (ui/text.js change, 10.12).

| Key | Click (base) | `.wasd` | `.pad` | `.touch` |
|---|---|---|---|---|
| `tut.move` | Right-click to walk. Hold to follow the cursor. | Move [WASD] | Move [LS] | Drag the left side to move, or tap where to go. |
| `tut.jump` | Jump the fence [W] | Jump the fence [Space] | Jump the fence [A] | Jump the fence [Jump] |
| `tut.combo` | Snip, Snap, Swoosh! [LMB ×3] at the cursor | same | [X ×3] | Snip, Snap, Swoosh! Tap ⚔ three times. |
| `tut.target` *(new)* | Right-click a foe to charge in and attack. | Click a foe to target it. | [RB] targets the nearest foe. | Tap a foe to target it. |
| `tut.roll` | Tumble past the sack [Space]: toward the cursor. You can't be hurt mid-tumble. | [Shift] | [B] | Tap Tumble, or swipe the right side. You can't be hurt mid-tumble. |
| `tut.stand` | Hold the Stand [Q]. Block the Wobble Knight twice. | [RMB] | [LB] | Hold 🛡. Block the Wobble Knight twice. |
| `tut.parry` | Raise the Stand *just* as it swings. A white glint and a white wedge mean "parry me". | same | same | same, plus: "When the ring meets you, raise the Stand." (ring on) |
| `tut.bright` | Hold LMB until it shines, then let go. Bright Slash breaks cracked things. | same | Hold [X] | Hold ⚔ until it shines, then let go. Drag to aim. |
| `tut.meow` | Meow [C]. Hidden kittens answer. So do cows. | same | [L3] | Tap the cat face. Hidden kittens answer. So do cows. |
| `tut.milk` | Milk Break [D]: heals 2 hearts. Don't get hit while you sip. | [R] | [D-pad ↑] | Tap the milk bottle… |
| `tut.vigil` | Vigil Stone: click it to rest, save, refill milk, swap kittens. | [E] | [Y] | Tap it to rest, save, refill milk, swap kittens. |
| `tut.companion` | [E] Kitten ability: hold to aim, release to cast. | [Q] | [LT] (hold to aim with [RS]) | Tap a kitten's portrait. Drag it to aim. |
| `tut.golden` | Golden Hour [R] at full Valor. | [V] | [RT] | Tap the golden sun at full Valor. |
| `tut.pounce` | Jump [W], then LMB in the air: Pounce. Bounce off crows! | Space, then LMB | [A] then [X] | Jump, then ⚔ in the air: Pounce. Bounce off crows! |
| `tut.zoom` *(new, once, after the first arena)* | Scroll to zoom. | same | [R3] to zoom. | Pinch to zoom. |
| `tut.rotate` *(new)* | Plays best sideways. | — | — | (portrait only, toast) |

- `tutorial.js`: the `move` step no longer needs a `looked` fact. It completes on `moved ≥ 4 m` (any method). Add
  an optional `target` step after `combo` (the Wobble Knight is the first selectable target). `tut.parry` mentions
  the wedge.
- Cutscene hand-backs: no position change needed (the iso camera never sits inside props). Remove the CS-04 "south
  of the fire" workaround only if it reads badly from above (low priority).

### 10.12 ui (`src/ui/**`)
- `touch.js` rewrite to §8.1/8.2: stick zones, the cluster arcs, the drag-aim pad, the ✕ cancel chip, the tumble
  steer, right-side tap / long-press / swipe / pinch, haptics calls, portrait layout, the left-hand mirror and
  opacity. `pickTapTarget` moves to `cam.pick` (keep the export as a thin wrapper for tests).
- New `abilityBar.js` (desktop/pad, §8.3), `cursor.js` (CSS cursors from the hover pick), `hpBars.js` (world-space
  pool).
- `text.js`: scheme-aware lookup (`key.touch` / `.pad` / `.wasd` before the base key) and new glyph tokens (`[Jump]`,
  `[LS]`, `[RS]`, `[RB]`, `[W]`, `[D]`, `[Space]` scheme-aware).
- Settings panel: §8.7 controls (scheme, mouse swap, rebinding list, zoom, rotation, auto-attack, tap-to-move, cast
  mode, parry ring, haptics, left-handed, opacity, reduce camera motion). A "Controls" card per scheme (it replaces
  the controls card).
- The rotate hint becomes a one-time toast. The HUD condensed top strip in portrait.
- Threat arrows: suppressed for on-screen attackers.

### 10.13 audio (`src/audio/**`)
- **Move the `AudioListener` off the camera:** at 13.5 m every 3D voice is distant and panned by the camera. Put the
  listener at the focus + 1.2 m up, oriented to the camera yaw (screen-right = right ear). The camera owns the
  transform; audio reads `cam.focus` each frame.
- New UI sounds: move-order paw click (−18 dB), target-acquire tick, cast-cancel, cooldown-ready tick (−20 dB),
  order-rejected thunk.

### 10.14 save (`src/save/**`)
- `migrate`: add the §8.7 settings with defaults. A v1 save with `holdStand`/`holdCharge` keeps them. Touch devices
  get `parryRing: 'auto'`, `haptics: 1`.

---

## 11. Accessibility
- **One-thumb-friendly:** tap-to-move, tap-to-attack with auto-chain, and Auto-Stand. A player can clear Knight
  encounters with point-and-go plus the 🛡 button.
- Hold/toggle for the Stand and the charge (kept); **Auto-Stand** (default on for touch, kept); **parry timing
  ring**; Kitten difficulty.
- Telegraphs: colour + shape (wedges, rings, glints) + sound, plus the pattern overlay (stripes red, dots gold),
  which now also applies to the wedges.
- No mashing (kept); auto-combo taps (kept).
- Touch size 0.8–1.4, opacity, left-handed mirror, swipe-tumble on/off.
- Desktop: full key rebinding, mouse swap, a **large cursor** option (48 px), and no pointer lock (better for
  trackpads and assistive pointers).
- **Reduce camera motion:** no lead, no auto zoom, no punch-ins, no yaw blends (hints snap during a fade instead),
  shake 0 by default.
- Haptics are optional and scaled; every haptic has a visual or audio twin.
- Text ≥ 16 px (kept). HP bars and cooldown digits use Fredoka 700 with an ink outline.

---

## 12. Implementation order (each step is shippable)
1. **Camera spike (camera + world fog):** the iso rig, focus fog, dithered occluders, `?cam=classic` fallback, and
   screenshots of meadow, forest, town and gate at 3 zooms, landscape and portrait. *Accept:* `fogAt(her) < 0.03`;
   the silhouette pass rarely triggers on the spine; cat ≥ 30 CSS px on a 390-px-tall viewport.
2. **Input + player direct control:** `stickYaw` latch, the aim resolver, cursor aiming, the Click/WASD schemes,
   ability bar stubs. Tutorial strings.
3. **Touch rewrite:** cluster, drag-aim, swipe tumble, pinch, haptics, portrait.
4. **Nav grid + orders:** point-and-go, attack-approach and auto-chain, interact-approach, jump links. The meadow,
   forest (Mushroom Ring, Treetop) and town nav audits.
5. **Telegraph readability:** wedges, parry ring, ground aim lines, no off-screen snipes, aggro rings, HP bars,
   selection ring.
6. **Polish:** Meme Cam Descent, boss fits, zone hints, wheat trample, bow LOD, audio listener, cursors, settings,
   save migration.

**Smoke blocks to add** (own ports, per CONTRIBUTING):
- `camera:iso-frame`: cat px, fog at her, and coverage.
- `player:click-move`: `__GAME__.click` on a ground point 15 m away, past the meadow fence; she arrives within
  0.5 m with ≥ 1 auto-jump.
- `player:tap-attack`: tap a rat; she paths and the combo hits.
- `ui:touch-cluster`: synthetic pointer on ⚔, 🛡, Tumble swipe and ability drag; indicator shown; cast or cancel.
- `physics:nav`: the path to Sage's cage includes authored links.
- `fx:wedge`: a rat_poke wind-up emits a wedge with `activeAt`.
- `story:tutorial-touch`: the practice field is completed on the touch device path.

Review every step through screenshots (Read the PNGs): misty edges, a clear stage, her readable in wheat, under
trees and in town alleys.

---

## 13. Risks and mitigations
| Risk | Mitigation |
|---|---|
| The cute close-up character appeal is lost from above | 52° (not 70°) pitch, 12.5–13.5 m with a 38° FOV, the bow LOD, and the Meme Cam Descent plus unchanged cutscenes carry the hero shots |
| Fog mood is lost | Focus fog keeps the density semantics, ground-mist sheets, and tighter `uFogClear` in bosses and the bog |
| Point-and-go fights the timing combat | Orders never fire the Stand or Tumble; direct input always overrides; auto-chain stops on any defensive input |
| Nav grid build cost on Low devices | Rasterised colliders, 0.5 m cells, built under the veil; a 1.0 m cell fallback on Low (`QUALITY.low.navCell`) |
| Big rewrite of `touch.js` and `FollowCamera.js` | The classic camera stays behind `?cam=classic` until M3 ends; the touch rewrite keeps the `setVirtual` / `setVirtualMove` contract |
| Vertical set pieces (Treetop, keep ramparts) | Zone side-view hints plus authored nav links; designs for M3 levels follow §9 from day one |
