# Open requests from ui

All optional. The M1 / M2 API notes of this area are archived in `docs/api/ui.md`; what core applied is in `requests/RESOLVED.md`.

- **camera (optional):** read `settings.camLock` when the rig is built and write it from `setCamLock` (today ui bridges
  both directions every frame from `UI.render`; harmless, but the camera owning it would drop the poll).
- **audio (optional):** an SFX id `ui.ready` for the §10.1 cooldown-ready tick (ui plays the raw `ui/glass_001` at
  volume 0.1 today).
- **core (optional, tidy-up):** `TOUCH.buttons` landscape defaults now get relocated at runtime by ui's hero-clearance
  pass (`touchLayout.js` keeps every default button + its 40 px dead ring out of a 120 px disc around her screen point,
  so taps on foes beside her are never swallowed). To make the config say what the player sees at 844 × 390:
  `meow: [56, -200, 28]`, `ability: [64, -168, -132]`, `interact: [64, -200, -200]`; and an optional
  `TOUCH.heroClear: 120` (ui reads `TOUCH.heroClear ?? 120`).
