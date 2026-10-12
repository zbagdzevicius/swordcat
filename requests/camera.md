# Open requests from camera

The M1 / M2 / controls-rework API notes of this area are archived in `docs/api/camera.md`; what core
applied is in `requests/RESOLVED.md`.

## world: flag the Bell Tower stair landings as `walkTop: true` (town.js)
`Picker.screenToGround` now always accepts a prop top whose collider carries `walkTop: true`, `ledge: true`, `landing: true`
or a `step` key. The two landings between the tower flights (`town.js`, the `[x0, x1, z0, z1, y]` loop) have no flag;
they are picked today only through the nav-connectivity fallback. Adding `walkTop: true` (or `landing: true`) to that
`kit.collider({...})` makes them explicit. Optional.

## player / physics: she stalls on the Bell Tower stairs when walking a full (non-partial) path (town)
Verified 2026-10-12 (port 5706): from the terrace (-5, 44) RMB orders to flight 1 top (-3.6, 45.9), landing 2
(-7.7, 48) and flight 3 top (-3.6, 48.9) all pick the right point and get a full path (6 waypoints), but after ~900
frames she is still at the flight 1 / landing 1 junction (≈ -4.1, 2.95, 46.4) or back on the terrace. An order to the
loft ledge (-0.5, 50.5, y 7.2) is `partial` (path ends at -2.75, 50.75). Picking is no longer the cause.
Also: a ray hitting exactly on the seam between two adjacent step boxes (x = -5.0 on flight 2) misses both tops
(`StaticColliders.raycastTops` / `overlapXZ` strict at shared edges) and falls through to the terrain.

## ui: `cam.heroScreen()` and a mirrored touch frame offset for left-handed play
`ui/touchLayout.heroPoint` now derives her resting screen point from `IsoRig.isoFrameOffset` + `CAMERA.iso.frameOffsetTouchX`
(≈ 0.42 W, 0.48 H landscape), and `touch.js` already prefers `ctx.cam.heroScreen?.()` → `{ x, y }` (CSS px, her focus
at rest, no lead) when it exists. Two asks:
1. Add `heroScreen()` (the applied `_offPxX` / `_offPxY` around the view centre) so the cluster tracks any future framing change.
2. When `state.settings.leftHanded` is on (touch landscape), shift her right instead of left (negate `frameOffsetTouchX`):
   the mirrored cluster sits on the left, and with her at 42 % the layout has to drop Meow at 844 × 390 and Golden + Meow
   at 667 × 375 to keep them off her. `heroScreen()` must report the mirrored point so the layout follows.
