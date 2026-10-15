<!-- Archived from requests/camera.md by core at the M2 integration pass (2026-10-09): the M1 API notes and requests of this area.
     Open items were moved to requests/camera.md; applied ones are summarised in requests/RESOLVED.md. -->

# Requests and notes from camera

The camera works with the current contracts. Each item below is additive. Where nobody has acted on a request yet, the camera falls back to a safe default.

## world: tag what the camera should fade (tree fade, tech.md §8)
The camera scans `level.root` on `E.LEVEL_LOADED`. Your new `PropBatch` (one `BatchedMesh` per level) is skipped unless you tag it. Use any of these tags:
- `batch.mesh.userData.camFadeIds = [ids]`: the `addInstance()` ids of trees, big bushes and hedges. A `Set` also works. A predicate `userData.camFade = (id) => bool` works too.
- `obj.userData.camFade = true` on a `Mesh`, an `InstancedMesh`, or a GLB `Group` (all its meshes fade together as one unit).
- `obj.userData.camFade = false` turns the name heuristic off. That heuristic matches meshes named like `tree`, `oak`, `pine`, `trunk`, `leaves`, `foliage`, `hedge`, etc.
- If you add props after `LEVEL_LOADED`, call `ctx.cam.addFadeable(obj)`. Call `ctx.cam.refreshFadeable(obj)` after a batch grows.

How faded batch instances behave:
- The instance is hidden with `setVisibleAt(id, false)`, and a pooled proxy mesh draws it transparently. The proxy shares the batch's GPU buffers, so please don't call `optimize()` on a batch after the level has loaded.
- An instance you have already hidden or culled is never faded and never shown again by the camera.
- Don't tag breakables or moving instances: their bounds are cached at registration.

Status (2026-10-08): the camera registers the tree `InstancedMesh`es (`trees:*`, `userData.camFade = true`) and your `fade:*` objects. That is 120 units in `meadow`, and large units (canopies) get the triangle-accurate test. `water`, `skyline` and `horizon` (`camFade = false`) are skipped. Nothing more is needed unless props move into the batch.

## world: tag tree trunk colliders
In `LevelKit._footprint`, for `o.tree`, please add `camFade: true` to the trunk circle, i.e. `{ x, z, r, camFade: true, ...base }`. The trunk radius is `max(0.22, min(w, d) * 0.08)`, so on wide trees it can exceed 0.6 m. Without the tag, the spring arm would then pull in at the trunk instead of letting the tree fade.

## world / physics: static colliders and the spring arm
The spring arm and the lock-on line of sight now test static props as well (`statics: true`), so houses, walls, statues and big rocks pull the camera in. Some statics are skipped and left to the fade:
- circles with `r <= 0.6`: trunks, posts;
- segments with half-thickness `<= 0.2`: fences;
- any collider tagged `cam: false` or `camFade: true`.

Add `cam: true` to a thin collider that must block, and `cam: false` to a big one that should not, such as Sir Tallbert's statue if a cutscene orbits through it. These are plain fields on the collider description; physics hands them back as `hit.object`.

## physics (optional; exactness)
`raycast` / `sphereCast` / `lineOfSight`: please honour `opts.ignore(src) → boolean` for static colliders (skip any collider where it returns true), and set `physics.castIgnore = true` to announce it. The camera then does one exact cast. Without it, the camera steps past each skipped collider and recasts. That gives the same result except when a wall stands within about 0.5 m behind a trunk; then it stops at the trunk, which is conservative.

## story: how cutscenes drive the camera (§5.1 `cam` steps)
- `await ctx.cam.shot(step)`: pass the `cam` step object as-is (`preset`, `pos`, `look`, `anchor`, `target`, `fov`, `mode`, `path`, `dur`, `ease`, `noise`, `roll`, plus `r`/`h`/`degPerSec` or `orbit: {r, h, degPerSec}` for orbit shots). It resolves after `dur`, or straight away for `cut`. `look` may be an actor id or an anchor name, e.g. the long lens on `bell_far`. `path` takes anchor names or `[x, y, z]` world points.
- The `WHIP_FALL` landing pose holds until the next `cam` step (CS-03 shot 4, "sideways, static").
- `MEME_LOOP` shots (CS-00 title loop, CS-02 shot 7) loop seamlessly. `ctx.cam.memeT` and `memePhase` run during these shots too, starting at 0 at the cut.
- Handback: `ctx.cam.mode('follow', { blend: 0.6 })`. `end.cam: 'follow'` maps to that call. As a safety net, the camera also hands back by itself one frame after `E.CUTSCENE_END` if a shot is still held (a cut when `skipped`). An `E.CUTSCENE_START`, `cam.mode()` or `cam.shot()` in that frame cancels this, so a chained scene with `end.cam: false` (CS-09 → CS-10) keeps its shot.
- If the scene moved her (moveTo, `end.actors.swordcat.pos`) before the handback, the 0.6 s blend still plays. A teleport after the handback (`end.player.spawn`, `end.load`) cuts instead of sweeping across the map.
- Every authored shot stays at least 0.1 m above the terrain. For example, `HERO_LOW` at 0.35 m on a slope is lifted, and the look point is kept.
- Skipping: `ctx.cam.mode('follow', { blend: false })` cuts straight back with no blend.
- Timelines run in sim time: they slow down with `time` steps and freeze in the pause menu.

## combat / enemies: who shakes
- Hit, parry, block and guard-break trauma reaches the camera only through combat's `E.SHAKE`. The camera adds nothing of its own for these, so nothing is shaken twice.
- Boss Dizzy shake (§8.2, 0.30): the camera adds it once per dizzy on `E.BOSS_DIZZY {dizzy: true}`. Please don't also emit `E.SHAKE` for it.
- The Holy FOV punch (+5° for 0.15 s) is camera-owned and triggered by `E.PLAYER_HOLY`.
- The Golden Hour punch-in only plays when the player has not already framed the activation with a preset. Player does that today with `HERO_LOW`, so in practice the punch-in won't play.

## characters / fx / world: Meme Cam loop sync (§7.8)
`ctx.cam.memeT` (0..3.8 s), `ctx.cam.memePhase` (0..1) and `ctx.cam.memeLooping` (bool) are valid during the Meme Cam and during any MEME_LOOP shot. Drive the cape sway shader (gust peak at 1.2 s), the grass wind and the mist cards from `memeT` so they loop with the camera sway.

## player: Meme Cam in tight spots
The Meme Cam frames `MEME_LOOP` straight in front of her face. When a wall, fence, trunk or rock blocks that view (it tests a 0.12 m sphere from her eyes to the lens), the camera rotates the framing around her by 20°, 40° or 60°, whichever is clear first, and holds that 3/4 view. Her Oath pose still faces `player.facing`; nothing is needed from you. `ctx.cam.memeYawOffset(player)` returns the angle the camera would use, and `ctx.cam.mode('meme', { yawOffset })` forces one.

## ui
`ctx.cam.showLockMarker = false` hides the camera's gold lock gem, in case ui draws its own reticle.

## world (LevelKit) — camFade on `fade:true` prop colliders (review: fence pulls the camera into her)
LevelKit._footprint only sets `camFade: true` on tree colliders (LevelKit.js ~330). Please also set it when `o.fade`
is true (practice-field fence, gate posts, lantern posts), same as trees. The camera now detects these defensively
(FollowCamera._markFadeColliders matches level colliders against registered fadeable instances), so this is a
robustness request, not a blocker. Also: G-01 end pose / 'start' spawn yaw should leave the follow camera on the
open (non-fence) side.


---

# M2 notes (archived from requests/camera.md by the M2 integration pass, 2026-10-09)


The M1 API notes of this area are archived in `docs/api/camera.md`; what core applied is in `requests/RESOLVED.md`.

## M2 API notes (additive; nothing renamed)

### story: new presets for the Acts I–II scenes (`src/camera/presets.js`)
| Preset | Use | Notes |
|---|---|---|
| `WIDE` | CS-04 #4, CS-07 #4, CS-09 #6, CS-10 #1 | front-left, above head height, FOV 45 |
| `MEDIUM` | CS-06 #1 / #5, CS-10 #5 | knees-up at her eye level, FOV 40 |
| `TWO_SHOT` | CS-06 #2 | standing two-shot; pass `target` (look = the midpoint at 0.8 m) |
| `LOW_BEHIND` | CS-07 #3 (dark bell), CS-09 #4 (Pudding over the gatehouse) | low from behind her, looking up; pass `look: '<anchor or actor id>'` |
| `PUSH_OUT` | CS-04 #5 | 6 s rail, back and up |
| `ECU_BLADE` | CS-09 #3 "then an ECU of the blade" | close on the planted blade |
| `BOSS_INTRO` | boss reveals (anchor = the boss id or actor) | placements scale with the anchor's height (`scale: 'height'`) |

- `PULLBACK` (CS-08 #4) now follows a curved rail: a low dolly first, then a crane up at the end (`via` control point). It is also `collide: true`, so solid architecture between her and the lens pulls the lens in. The end pose (0, 4, 14) and FOV 38 → 50 over 6 s did not change, and the brigade rows 2.5–4.5 m behind her stay in frame.
- Any `cam` step may set `via: [x, y, z]` (a Bézier rail control point), `collide: true`, or `scale: 'height' | number`.

### enemies: boss framing
- The arm is 6.0 m during boss fights. Set `boss.camDist` (m) to use a different arm for a boss.
- The camera reads `enemies.boss` (`pos`, `height`, `alive`). When she is not locked on, a soft boss assist keeps him within about 20° of the screen centre once the player stops steering the view, and it replaces auto-follow during the fight. Tall bosses lift the look point a little when they are close.
- Iso boss fit (§2.4): every frame the rig projects her and the boss exactly (`IsoRig.isoProject / subjectOverflow / safeFitDist`) against the HUD-free safe rect (`ctx.ui.safeInsets`: the boss plate on top, the ability bar at the bottom). It widens d within [14, 22] (or the cat-size clamp) until she sits in the inner 60 % and he in the inner 85 %. When even 22 m is not enough, the focus slides along the her → boss line (up to 85 % of the way, ≤ 6 m from the default lerp). If both still cannot fit, she may sit in 92 % of the rect. Uses `radius` (+0.3 m) and `height`.
- Iso combat fit (§2.4, non-boss fights): the engaged set is alerted hostiles within `ISO.combat.radius` (10 m), plus ranged ones (a crossbow) up to their longest attack range (≤ 16.5 m), nearest first. Her and up to 8 of them are projected exactly (`safeFitDist` with a distance-following pitch) against the same HUD-free safe rect: she in the inner 60 %, they in the inner 92 %. The focus keeps the default bias when that fits; otherwise it leans along her → centroid (≤ 5 m) to the nearest lean that fits, else to the least-bad lean that keeps her inside 60 %. d widens up to +8 m (still under `distMax + combat.zoomOut` and the cat-size clamp).

### world: occlusion in town and the hub, arenas
- **Solid occluders (automatic):** on `level:loaded`, the camera registers every untagged static prop in `level.groups.props` that stands at least 1.8 m tall on a solid collider footprint: houses, the castle, the Bell Tower, statues and pillars. These props still stop the spring arm, but they fade whenever they hide her. Town registers 18 today. You don't need to do anything.
- Optional explicit tags: `userData.camFade = 'solid'` (on a Mesh, Group or batch), `batch.userData.camFadeSolidIds = ids`, or `userData.camOccluder = false` to opt a prop out.
- Arena fog walls (`arenaWall` colliders) no longer pull the arm in.
- During boss fights, the arm passes through slender solids (footprint half-size ≤ 1.0 m), such as the six millstone pillars, and those pillars fade. Build the pillars as ordinary static props with a collider (circle r 0.8, 2.5 m tall); the camera handles the rest.

## To world: town house colliders are much smaller than the houses (open)
Scattered town houses get an `auto` circle collider. For example, the house at about (−13.9, −34.4) is about 11 × 11 m but has `r` 3.18. That leaves the camera, and possibly her, free inside the walls and under the roof. Please give buildings `collider: 'box'` with `shrink` of about 0.9 (or explicit footprints). The camera's solid-occluder fade hides most of the problem, but the walls should still stop the arm.

## Controls rework (CONTROLS_SPEC §2, §3): occlusion from above, zone hints, framings, Meme Cam spot
- **Occlusion from above (§3)**, `Occluders.js`:
  - Targets are capsules: her chest (r 1.0), up to 4 engaged enemies within 8 m (r 0.6), the selection (r 0.6), and
    the next path waypoint within 3 m (r 0.4).
  - Fades are **dithered**: the faded clone stays opaque with depth writes and drops fragments under a 4×4 ordered
    screen threshold. There is no blending or sorting and shadows don't change. It reaches 0.22 in 0.15 s and returns
    in 0.40 s (linear). ShaderMaterials keep the blended fallback.
  - **Crowns** (`camFade: 'crown'`, or tree names): trunks never fade. Parts named or with materials named like
    `trunk` / `bark` / `stem` / `stump` / `roots` stay opaque. Merged trees fade only above `userData.crownFrac` of
    their local height (default 0.35). A crown also fades when it rises within 3.5 m horizontally of a target capsule.
  - **Roofs** (`camFade: 'roof'` on a Mesh, Group or InstancedMesh, or `batch.userData.camFadeRoofIds`): a roof fades
    while she stands under its footprint grown by 1.5 m, or when it cuts a capsule. Walls stay.
  - The x-ray turns on once more than 30 % of 6 samples on her capsule are blocked by solids for 0.1 s.
- **Zone hints (§2.2):** `ctx.cam.setHint({ yaw?, pitch?, dist?, clear?, zone? }, blend)` now honours all three.
  - `dist` is the base distance before the player's zoom and the clamps. Phones scale it by 12 / 13.
  - `pitch` is in rad, landscape only; boss fights and portrait keep their own.
  - A missing `yaw` means the level yaw. A missing `pitch` or `dist` eases back to the rig's own value.
  - `ctx.cam.iso().hint` reports the hint in effect.
  - `zoneHints` stays `false`, so world keeps driving `setHint` (Level.js).
- **Landscape framing (playtest fix, supersedes §2.1 "4 % below centre" and the 0.8 m screen-up bias):**
  `IsoRig.FRAME` { herY 0.48, insetMax 0.25, upBias 0, cursorDownMul 1.5 }. `isoFrameOffset(vh, insetBottom, portrait)`
  puts her focus at 48 % of the band above the ability bar (`ctx.ui.bar.insetBottom`), feet ≈ 45 % from the top on
  720p: ≈ 3.7 m of clickable ground below her above the bar (4.7 m to the edge), 6.8 m ahead, 7.9 m to each side.
  The offset eases (λ 6). The KBM cursor lead's down-screen part is × 1.5, so it is symmetric on screen. Portrait
  framing is unchanged. `CAMERA.iso.frameOffset` / `lead.up` are no longer read (requests/core.md).
- **Framings (§2.4):**
  - Golden Hour dollies to 9 m at 46° over 0.25 s, holds through the 0.8 s Oath, and eases back over 0.6 s.
  - Dialogue (`dialog` mode) eases the focus to the midpoint between her and the speaker (the `dialog:line` speaker
    id, within 12 m) and sets d × 0.8 over 0.5 s, with no cut. Her own lines keep the two-shot.
- **Meme Cam (§2.7):** within `memeSpot.r` of `levels.current.memeSpot.at`, the MEME_LOOP framing uses `memeSpot.yaw`
  if that view is clear. Otherwise it uses the clear-view search.
- Click / tap picking (`Picker.screenToGround`) includes walkable prop tops (`physics.raycast` `tops: true`); a top more than 2.8 m above the terrain under it is skipped (a tall stack the lens looks over), so the click lands on the ground behind it. A taller top is still a target when the nav island audit (`Pathfind.reachableIslands`) shows her island reaching it (walking or auto / authored links: the Lantern Alley balcony via crate hops), or when its plateau steps down; a click on a deck rim snaps to the nearest walkable cell (≤ 1 m) at that height. Interactables: the pick radius is projected at the spot's ground. Vigil Stones and hub stations use ≤ 0.8 m. A Vigil Stone is picked at its foot (base px) or when the pointer ray hits its collider, so near-miss grass stays a move.

## AUTOCAM + Phase W surface (research/next/AUTOCAM_SPEC.md, WARM_ADVENTURE_SPEC.md; read-only unless noted)
- `cam.footprint` `{ q: Float32Array(8) ground quad, cx, cz, ahead, behind, halfW, halfWTop, slantMax, d, version, valid }`,
  refreshed once per rendered frame (`version` bumps when a quantised value changes); `cam.inFootprint(x, z, pad)`.
- `cam.frustum` + `cam.frameId` (one frustum per rendered frame); `cam.inView(p, r)`; `cam.activityOf(actor)` → tier
  0 in view / 1 ≤ 30 m / 2 ≤ 60 m / 3 beyond (cached per frame on the actor). Perf code uses these.
- `cam.onScreen(p, margin)` = SafeFrame-visible (gameplay fairness); `cam.safeFrame` { core, herFrame, threat, holes,
  visible(sx, sy) }; `cam.groundAxes(outU, outR)`; `cam.heroScreen(out)` (CSS px; mirrored for left-handed touch).
- Far plane (X12): `clamp(ceil5(max(slantMax·1.25 + 25, fogFar)), 45, 90)`, 60 without a fog model; `level.farKeep`
  entries extend it.
- `cam.closeUp` (lens within 6.0 m of the framed character, off above 6.3 m; calls `view.setCloseUp(on)`).
- `postfx.setCinematic` is called on shot / cutscene enter and off on the hand-back (never for Meme Cam or the looping
  title shot).
- `cam.blendTo(mode, dur, ease)` (WA camera.W1: title MEME_LOOP → follow 1.1 s inOutSine); `cam.blendLeft` (s of the
  running pose blend, 0 when none).
- Debug: `cam.probe()`, `cam.framing()` (allocate; smoke only).
- `cam.hiddenEngagedInto(out)` (zero alloc): every engaged foe `onScreen()` calls hidden this frame (dropped past the
  zoom cap, or under a HUD / thumb hole), winding up or not — ui arrows each one (AUTOCAM §7.4). Framing caps: +3 m
  combat budget, plus the D8 crowd term (≤ 1.5 m) on top, never past the cat clamp; combined lean ≤ the D7 cap; a
  wind-up on her (THREAT) always outranks ENGAGED in the drop ladder.
- R3 rate caps: the automatic part of d (fit, snuggle, beats, boss envelopes) is clamped to ≤ 6 m/s out, ≤ 1.5 m/s in;
  zoom, hints and punches are exempt.
- Smoke: `tests/smoke/camera.mjs` blocks `camera:steady`, `lead-down`, `safe-frame`, `teamfight`, `frame-threat`,
  `threat-visibility`, `beats`, `boss-two-shot`, `pinch`, `reduce-motion`, `rotate`, `footprint`, `title-blend`,
  `no-hands`, `rates`, `perf` (report-only).

## TT3 §11.2 (package K)
- Selection: `lockon` (Tab, R3) selects the best / cycles forward; `lockPrev` (Shift+Tab, made by `Input.js`, or the
  D-pad ←) cycles back or, with nothing selected on KBM, selects the best. No hardcoded Shift check in FollowCamera.
- Peek: the `peek` hold is Z / MMB / D-pad ↓ (Alt is gone); `ranges` shares the same hold. `zoomCycle` is the pad's
  View (8) now (R3 selects).
