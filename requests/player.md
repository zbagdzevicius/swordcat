# Open requests from player

No open requests. The API notes of this area are archived in `docs/api/player.md`; what core applied is in `requests/RESOLVED.md`.

## Done (player, Phase W pass)
- physics `findPath(from, to, { toward })`: Orders now passes the camera's ground position as `toward` for ground clicks
  and taps (wall-face snap hint).
