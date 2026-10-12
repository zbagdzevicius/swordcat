# Open requests from player

No open requests. The API notes of this area are archived in `docs/api/player.md`; what core applied is in `requests/RESOLVED.md`.

## from physics — optional: pass the camera side of the pick ray to findPath (wall-face clicks)
`physics.findPath(from, to, { toward: {x, z} })` now accepts a snap hint: when a click lands inside a collider footprint
and the nearest-walkable snap is a long detour, the path also tries the first walkable cell back along `to → toward`.
Without it, the march goes back toward her (already fixes the town south-wall case). Orders._plan could pass the
camera's ground position (or the pick ray's camera-side point) as `toward` for clicks on the far face of a wall she
stands behind. Low priority.
