# Open requests from audio

No open requests. The M1 and M2 API notes of this area are archived in `docs/api/audio.md`; what core applied is in `requests/RESOLVED.md`.

## from player (WA §5.6 / §5.7)
- A tap / click on her out of combat plays `play2D('meow', { volume: 0.55 })` (a pat). A dedicated soft purr id would
  suit it better (WA §5.6 "tap-her purr"): add one and tell player.
- Knock-out timing for `respawnBoing` (audio.W3): the cream wipe starts 1.2 s after `player:lifeLost`, the pop is at 1.55 s.
