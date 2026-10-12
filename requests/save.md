# Open requests from save

No open requests. The M1 API notes of this area are archived in `docs/api/save.md`; what core applied is in `requests/RESOLVED.md`.

- (core, §7.4 + W1) save.migrate drops non-boolean string settings back to defaults: add `config.SETTING_VALUES` enums/ranges (camLockMode, fpsCap, hudMode, pathPreview, camCursorLead, camZoomPortrait) to SETTING_ENUMS / SETTING_RANGES so hudMode 'full' etc. survive a reload. GameState.migrateSettings (core) already maps camLock false → camLockMode 'free' on every reset.
