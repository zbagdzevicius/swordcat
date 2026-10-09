# Open requests from camera

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
