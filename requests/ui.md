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

- (core, §7.4 + W1) new settings in GameState (allowed values: `config.SETTING_VALUES`): camLockMode 'locked'|'semi'|'free' (replaces camLock, K7; core keeps camLock in sync on load), camCursorLead 0 (0–0.15), camZoomPortrait 1 (0.7–1.4), biggerHero false, fpsCap 'auto'|30|60|'off', batterySaver false, hudMode 'calm'|'full', hitWords true, tutorialHints true, pathPreview (enum later, see fx.md). reduceCameraMotion / reduceFlashes follow the OS until edited (core clears `<key>Auto` on any SETTINGS_CHANGED without source 'os'). New events: `E.REWARD` {kind, id}, `E.TELEGRAPH_FIRST` {kind}; PROMPT gains speaker / say / stepDots. `config.HUD`, `CELEBRATE`, `FADE_COLOR`.

- (core, S1/S6) Boot shows a warm inline splash (`#splash`, PERF §10.1); core adds `.out` when the boot level is up and removes the node after 0.45 s, so it never covers a running game. ui may restyle it or reuse its SVG for the CS-00 logo. The vignette pass is gone (K1): the warm CSS `#ui-vignette` layer is the only vignette. `fpsCap` ('auto' | 30 | 60 | 'off') and `batterySaver` apply live on `SETTINGS_CHANGED` (Game → `postfx.pacing`); battery saver also forces the Low preset. `?perf` shows core's 5-line overlay (top-right).

## from player (WA §5.7) — the knock-out wipe
The player calls `ctx.ui.fade({ to: FADE_COLOR, alpha: 1, dur: KO.wipeT })` at `KO.sitT` (1.2 s after the knock-out,
never on a game over) and `ctx.ui.fade({ to: null, dur: KO.wipeT })` right after the respawn at 1.55 s. The lives badge
pop and the `life.lost` toast are yours (WA §5.7 step 4).
- (core, W1 + C16) `settings.pathPreview` default is now `'auto'` ('auto' | 'on' | 'off', `config.SETTING_VALUES.pathPreview`; fx `pathPreviewOn` reads it). Please make its row a 3-way `choice` (Auto / On / Off) instead of the toggle: a toggle writes booleans (fx still accepts them; core's load migration maps true/false → 'on'/'off').
- (core, C16 / PERF §10.2) SYSTEMS are lazy now (`load()` dynamic imports): the boot group = entry + UI + save + audio closures is ≈ 222 KB gz against 140 (the UI chunk alone ≈ 102 KB gz; it also pulls `Pathfind` / `configs` statically). When you can, split the title / menu shell from the in-play HUD (dynamic import of the HUD, portraits, results), so `npm run build`'s boot gate can turn on (`scripts/bundle-budget.mjs`, `gate: false` today).

## from audio (Phase W: WA §5.4 rewards, §7.5 ghost paw, WA21 results, CONTROLS §10.1)
- `ctx.audio.reward(kind, { row })` plays the reward sound when a celebration SHOWS: `sticker` = one glock note a third
  higher per sticker in a row (`row` 0, 1, 2 → C5, E5, G5, then holds), `card` = a rising glock triad, `friend` = the long
  arpeggio + the pizzicato flourish. Please call it from `celebrate.js` instead of `ui.confirm` (with a rate) /
  `jingles/jingles_PIZZI06` / `ui.confirm` (the baked glock never takes a pooled voice).
- `ghostPawPip` is the WA §7.5 pip as a named id (`ui/glass_001` rate 1.4 vol 0.3): `guide.js` may name it instead of
  the raw file + options.
- Results (WA21): audio plays `results_dance` (festival_minstrel_dance, first 20 s looped) on `level:results`; please
  play `ctx.audio.play2D('rankStamp')` (jingles_PIZZI03 + the stamp) at the rank stamp.
- `ui.ready` exists (your cooldown-ready tick request): `play2D('ui.ready')` = `ui/glass_001` at 0.1.

## from camera (AUTOCAM §7.4, gate camera:threat-visibility) — arrows for hidden engaged foes
- The gate wants an arrow for EVERY engaged foe that is not visible that frame (100 %), not only for live telegraphs.
  In a crowd past the zoom cap (+3 m, + the D8 crowd term ≤ 1.5 m) the framing ladder drops the farthest tokenless
  ENGAGED subjects, and today `threatArrows.js` only arrows actors with an active telegraph, so an idle dropped foe gets
  none. New: `ctx.cam.hiddenEngagedInto(out)` fills `out` (zero alloc, cleared first) with every engaged foe whose
  `onScreen()` is false. Please add those as candidates (a neutral / `engaged` colour, below telegraphs in the nearest-
  first order, same `TELEGRAPH.maxArrows` budget; telegraphing ones keep their kind colour and the parry pulse).
