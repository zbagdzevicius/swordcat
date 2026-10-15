# TT3 → T (from package K): text replacements in docs/TOKENTAILS-PLAN.md §10

K changed the default bindings (§11.2). §10 is history, so these edits only add the new keys next to the old ones,
so nobody reads §10 as the current binding table. Exact replacements (each `old` string occurs once):

1. §10.1 (line ~391, the audit note about F):
   - old: `` (the fence nav link opens only after `tut.jump.done`, `meadow.js:630`), so F while walking never counts; only ``
   - new: `` (the fence nav link opens only after `tut.jump.done`, `meadow.js:630`), so F (jump before TT3; Space since §11.2) while walking never counts; only ``

2. §10.3 table, row "after" (line ~480):
   - old: `Jump is taught at the first hop link outside practice, and click/tap across a fence + F counts as a hop everywhere.`
   - new: `Jump is taught at the first hop link outside practice, and click/tap across a fence + F (Space since TT3 §11.2) counts as a hop everywhere.`

3. §10.3 table, row "8–12 s" (line ~473):
   - old: `the chip says LMB/J or tap ⚔ (the right-click wording goes)`
   - new: `the chip says LMB or tap ⚔ (the right-click wording goes; TT3 dropped "or J" too)`

4. §10.10 #1 (line ~596), the onboarding bot inputs:
   - old: ``Its only inputs come from `__GAME__.guide()`: right-click / tap on the``
   - new: ``Its only inputs come from `__GAME__.guide()`: WASD from Clem toward the trail (mouse runs, since TT3 §11.2; it was a right-click) / tap on the``

5. §10.10 #6 (line ~610):
   - old: `6. Click-across-fence + F and tap-across-fence + jump count as a hop;`
   - new: `6. Click-across-fence + F (Space since TT3) and tap-across-fence + jump count as a hop;`

Also for §11.8 (status), from K's runs (fill in with the final numbers):
- `hybrid` has no click-to-move any more, so the practice fence is crossed with a held Space by WASD players (a tap
  is cut short to a 0.3 m hop and does not clear the 1.0 m fence). The `tut.jump` hint at the fence says so.
- Smoke triage (K): `combat:touch` landscape (the meadow's own rats wandered in: the block now despawns them first),
  `enemies:onscreen-rule` (the TT2 guide look-ahead leans the frame: the 9.6 m spot search now covers both sides),
  `world:fog-audit` (forest_day / gate_dusk were lifted for readability after the §4.2 table: the table is now a
  ceiling with a 30 % floor), `audio:unlock` (the ears trail a panning camera at 20 Hz: the check waits for a still
  focus instead of a fixed 150 ms), `characters:ttcat` and `enemies:hyena` passed on K's server without a change.

## Notes from K for the final runs
- `core/events.js` (no TT3 owner): add `TRICK_UNLOCKED: 'trick:unlocked'` and `TRICK_USED: 'trick:used'`. A and K read
  `E['TRICK_UNLOCKED'] ?? 'trick:unlocked'`, so the strings must stay as written.
- K also touched `src/ui/toasts.js` (no explicit owner; a UI file): `icon: 'trick'` → the gold ":3" coin (A's request).
- Flaky under a long run on K's dev server (each passed in isolation twice and in one of two 97-block passes):
  `enemies:hyena` (waits up to 45 s for a gloat) and `companions:bubble-edge` (bubble bottom 664 px vs bar top 621 px
  once). Neither touches TT3 code; if they fail in the full run, they need their owners.
- `tests/smoke/_kbm.mjs` is a helper module (no blocks); the harness skips `_*.mjs`.

## Resolved (integrator, 2026-10-15)
Applied in the TT3 integration; see `requests/RESOLVED.md` (Phase TT3 integration). Open optional items are listed there.
