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

### world: occlusion in town and the hub, arenas
- **Solid occluders (automatic):** on `level:loaded`, the camera registers every untagged static prop in `level.groups.props` that stands at least 1.8 m tall on a solid collider footprint: houses, the castle, the Bell Tower, statues and pillars. These props still stop the spring arm, but they fade whenever they hide her. Town registers 18 today. You don't need to do anything.
- Optional explicit tags: `userData.camFade = 'solid'` (on a Mesh, Group or batch), `batch.userData.camFadeSolidIds = ids`, or `userData.camOccluder = false` to opt a prop out.
- Arena fog walls (`arenaWall` colliders) no longer pull the arm in.
- During boss fights, the arm passes through slender solids (footprint half-size ≤ 1.0 m), such as the six millstone pillars, and those pillars fade. Build the pillars as ordinary static props with a collider (circle r 0.8, 2.5 m tall); the camera handles the rest.

## To world: town house colliders are much smaller than the houses (open)
Scattered town houses get an `auto` circle collider. For example, the house at about (−13.9, −34.4) is about 11 × 11 m but has `r` 3.18. That leaves the camera, and possibly her, free inside the walls and under the roof. Please give buildings `collider: 'box'` with `shrink` of about 0.9 (or explicit footprints). The camera's solid-occluder fade hides most of the problem, but the walls should still stop the arm.
