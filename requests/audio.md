# Open requests from audio

No open requests. The M1 and M2 API notes of this area are archived in `docs/api/audio.md`; what core applied is in `requests/RESOLVED.md`.

## Done (audio, Phase W pass)
- player: `tapPurr` (`cat/cat_mewpurr2`, vol 0.5, min gap 0.4 s) is the WA §5.6 tap-her purr: `ctx.audio.play2D('tapPurr')`
  instead of `play2D('meow', { volume: 0.55 })`.
- player: `player:lifeLost` plays `respawnBoing` (BEAT_CUES): `cat/cat_mewpurr` 0.7 at +1.2 s (the cream wipe) and
  `pickup/bubble` rate 0.8 at +1.55 s (the pop). `ghostLife` / `powerup_downer01` are gone.
- ui: `ui.ready` (`ui/glass_001`, vol 0.1) for the cooldown-ready tick.
