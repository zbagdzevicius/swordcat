# Open requests from core

No open requests. (Applied in the S2/W1 config merge: `CAMERA.iso.occl.archOpacity` 0.1; `frameOffset*` and `lead.up` marked retired in config.js.) The API notes of this area are archived in `docs/api/core.md`; what core applied is in `requests/RESOLVED.md`.

## from player (Phase W) — optional config adoption
Player-local design constants live in `src/player/juice.js` (like tuning.js: config wins once it has them): `SQUASH`
(ART §6.5 event table), `FEEL` (head lag λ 18, face pitch 0.14 rad, glance / look / groom / twirl timings, KO head tilt,
dropped sword, glow height, blob r), `ORDER_FX` (WA §3.6 snap 0.7 / λ 24 / 0.35 s, double tap 0.35 s / 0.75 m, self tap
0.6 m / 40 px, triple 3 in 1.5 s), `HIT_WORDS` (WA §5.3 texts, 0.25 s, lift 0.25 m). Adopt them into config if you
want them there. Events (additive JSDoc): `player:order` gains `double` (bool).

## from fx (Phase W) — flip the `pathPreview` default
fx `GroundDecals` now reads the WA §3.6 enum (`pathPreviewOn(setting, device, levelId)` in `src/fx/GroundDecals.js`:
'on' / true → always, 'off' / false / unset → never, 'auto' → touch on the prologue + Chapter 1 meadow). Safe to switch
the `GameState` default to `'auto'` (ui's settings row must offer the three values). fx also tags its scene roots
`userData.perfCat = 'fx'` and multiplies particle burst counts by `postfx.particleScale` (and on `E.PERF_THERMAL`).

## from ui (Phase W / PERF §10.2) — pathPreview row, boot diet, reward handle
- The `pathPreview` settings row is a 3-way choice (Auto / On / Off; `SETTING_VALUES.pathPreview`), so it never writes
  booleans any more.
- Boot diet, first step: ui no longer statically imports `camera/Picker.js` (and through it `physics/Pathfind.js`) or
  `camera/IsoRig.js`, and the hub panels (`shops.js`, `shopArt.js`, `questBoard.js`) are a lazy chunk, prefetched when
  `town` loads. Scratch build: UI chunk ≈ 86 KB gz (was ≈ 102), boot group ≈ 202 KB gz (was ≈ 222) against 140. The
  rest (the inlined `ui.css` ≈ 25 KB gz and the in-play HUD / touch modules) needs the title-shell / play-layer split,
  which is still open, so keep `boot` report-only (`gate: false`) for now.
- `ui.handles.reward` is true, so story's `announce()` stops sending the duplicate toast when a celebration card shows.

## from audio (Phase W / PERF §10.3–10.4)
- `src/audio/assets.manifest.js` `levels` now uses tiers: `'*'.p0` (271 KB, the first-hit set) and `p1` for the rest and
  every level, plus a `title` key (121 KB of ui sounds). `levelAssets('title')` can preload it on the title screen.
- PERF U3 "manifest levels map out of boot JS": `manifests.js` globs every manifest eagerly, so the audio `levels` map
  (≈ 4 KB gz) rides the boot chunk whatever audio does. A lazy glob for `levels` (or an emitted JSON per level) would
  take it out; audio's `AudioManager` reads `levels` only at level changes (`evict`).

## from camera (AUTOCAM §9.6 camera budget)
- `perf:frame` (tests/smoke/perf.mjs): please add a REPORT line with the camera's per-function split. Around each
  600-frame window call `const T = __GAME__.ctx.cam.setProfiling(true)` before and read `{ ...T }` then
  `setProfiling(false)` after; T holds EMA ms for `render, cursor, gameplay, footprint, fog, occlusion, fader, xray` and
  `n` frames. Report-only (no gate); targets: render ≤ 0.08 ms Med, occluders (fader) ≤ 0.05 ms. `camera:perf` already
  logs the same split for the B1 mill fight.
- `cam:render` in `perf().cpu.bySystem` includes `env.setFocusFog` (world) — `fog` in the split isolates it.

## from ui (Phase W review: the kitten slot waits for the join)
- WA §7.5 / review: the ability bar's kitten slot, the touch kitten button and the HUD companion portrait stay empty
  until that kitten has joined (`JOIN_FLAGS`: `meadow.mochi` / `forest.sage` / `town.clover`; ui `reveal.js
  companionJoined`). `tests/smoke/controls.mjs` puts Mochi in the party with `setActive(['mochi'])` but without his join
  flag (lines ~177 and ~426: `.ab-ability.is-cd` and the touch `ability` button): please add
  `c.state.setFlag('meadow.mochi', true)` next to those `setActive` calls (the real game only activates him in D-01).
  - UPDATE (ui review fix): no longer needed. `companionJoined` now also accepts `state.companions.unlocked` (the
    predicate the companion system casts on), so `setActive(['mochi'])` alone fills the slot. Drop this item.

## from combat (Phase W fix: final blow mid-encounter)
- `E.HIT` payload gained `finalBlow` (boolean, Combat's JUICE.finalBlow decision); please add it to the comment in
  `src/core/events.js`.

## from world + enemies (triangle budget finding: `perf:draws` never asserts triangles)
- `src/core/config.js` `PERF.budgets.I1` (and `I2`) carry only `frameCalls`, so `budgetFor()` returns no `tris` and
  `tests/smoke/perf.mjs` `perf:draws` skips its `b.tris` assert at the current stage. Please add the PERF §1.2 triangle
  row to every stage column (`tris: { low: 80000, med: 150000, high: 260000 }`, the End values; they hold now), and in
  `perf:draws` add a boss-spawn scene (`{ id: 'meadow boss', level: 'meadow', spawn: 'boss' }`) plus one with 6 spawned
  rats (as `perf:reresolve` does) so the combat case is gated too. Measured after the world / enemies fix (iso,
  1280×720, scene tris): Low meadow start 68k, meadow boss 72k, gate boss 34k, forest boss 52k, meadow + 6 rats 79k;
  Med 106k / 127k / 56k / 78k / 150k; High 153k / 177k / 79k / 104k / 189k. Meanwhile `world:meadow` asserts the
  frame against these budgets and `enemies:lod` asserts the 6-rat case.

## from enemies (Phase W fix: no silver plate / grim blades on foes, WA §3.1 / §8.2)
- `src/core/config.js` `ENEMIES` rows still describe the old looks; enemies now override them in their type files
  (`types/pug.js` PUG_SHOW / PUG_HIDE, `types/hyena.js` HYENA_BONE, `scripted/Cacklejaw.js` CACKLEJAW_HIDE), so nothing
  is blocked. To keep Appendix A truthful please: `pug.show` → `['Rectangle_Shield']`, add `'Knight_Helmet', '1H_Sword'`
  to `pug.hide` (drop `helmetScale` or keep it at .9, it only scales the beast head now); and note on `hyena.weapon`
  that it is the missing-prop fallback (the hyenas hold characters' `squeaky_bone`; Cacklejaw a bigger one).

## from fx (Phase W review: telegraph glyph readability)
- Please raise `TELEGRAPH.glyphSize` 0.45 → 0.7 and `glyphSizeTouch` 0.55 → 0.8. fx already floors them locally
  (`TELE_GLYPH` in fx/Telegraphs.js, `GLYPH_INK` 0.85 in fx/GroundDecals.js), so this only aligns the table.
  Keep `ink.alpha` 0.35: it is also the hero ring's ink. Glyphs use their own 0.85.

## from camera (Phase W review: AUTOCAM punch / lead fixes)
- `CAMERA.iso.perfectDodge`: please add `in: 0.08, out: 0.30` → `{ dd: -0.4, in: 0.08, out: 0.30 }` (same shape as
  `parryPunch`). Camera now eases the Purrfect Dodge punch in / holds it through `PLAYER.dodge.perfectDur` / eases out,
  and falls back to 0.08 / 0.30 locally (`pdIn` / `pdOut` in FollowCamera.js), so nothing is blocked.
- `CAMERA.iso.lead` comment (config.js ~77-79): `lead.cursor 0.15` is no longer read by anything. The cursor
  look-ahead is now `settings.camCursorLead` (0–0.15, default 0) × (cursor − her), capped at `lead.cursorMax`, in
  FollowCamera's AUTOCAM lead. Please mark `lead.cursor` RETIRED like `vel / velMax / up / damp`.
