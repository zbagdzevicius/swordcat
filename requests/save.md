# Open requests from save

No open requests. The M1 API notes of this area are archived in `docs/api/save.md`; what core applied is in `requests/RESOLVED.md`.

Resolved this phase (save.1 / save.W1 / PERF V1 / ART A3): `migrate` reads `config.SETTING_VALUES` (ranges
camCursorLead 0–0.15, camZoomPortrait 0.7–1.4; enums camLockMode, fpsCap, hudMode, pathPreview, quality), maps a legacy
boolean `pathPreview` to 'on' / 'off', keeps the new booleans (biggerHero, batterySaver, hitWords, tutorialHints,
`*Auto`), runs core's `migrateSettings` (camLock false → camLockMode 'free'). Notes in `docs/api/save.md` (Phase W).
