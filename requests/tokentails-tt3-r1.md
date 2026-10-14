# TT3 R1 (core / UI / tests from the first TT2 pass) → requests to other owners

R1 applied, in its own files only:

- `src/player/MemeCamTrigger.js` `suppressed()`: `if (!ctx.params?.test && ctx.cam?.photoCamBlocked?.()) return true;`
  (g1 §1, plan §10.2.12). The Photo Cam no longer runs its unlock toast in the prologue / while an onboarding target is on.
- `tests/unit/controls.test.js`: the obsolete hide-wipe test is replaced by g2 §1's 4-lesson + Skip-chip test.
- `tests/unit/core.test.js` F21: fills `index.html` through `brandHtml(…, BRAND)` before asserting (g3 §1).
- `src/ui/celebrate.js`: the kitten rescue card passes `vars.kitten` (the rescued id) and appends
  `rescueBioHtml(ctx, id)` under the line; `lineEl` is `is-on` when a line or a bio exists (g3 §6).
- `src/ui/assets.manifest.js`: `'ui/tokentails-logo-text.webp'` (g3 §7); `dist-test/assets/ui/tokentails-logo-text.webp`
  survives the prune.
- `tests/unit/player.test.js` "Meme Cam idle (iso)…": stubs `ctx.cam.photoCamBlocked` (the rig sits on a pre-prologue
  meadow, so the new guard blocked the idle clock) and asserts the clock stays 0 while blocked.

Unit: 1129/1129 pass.

## 1. R3 (`src/ui/ui.css`): text under 16 px fails `SMOKE_ONLY=ui`

`SMOKE_URL=http://localhost:5341/ SMOKE_ONLY=ui node tests/smoke.mjs` (dist-test, 2026-10-14) fails the font audit on
surfaces R1 did not touch:

```
[ui:menus] pause: tt-pill-txt 15.0px "A Token Tails game"; SPAN 14.0px "Catnip here stays in thi…"
[ui:menus] kittens: kit-bio 13.0px "Naps in bread baskets. S…"; kit-bio 13.0px "Blue eyes, very still, v…"
[ui:results] results: tt-pill-txt 15.0px; SPAN 14.0px "Catnip here stays in thi…"
[ui:title] title: title-tagline 15.1px; SPAN 15.0px "Skip practice"; title-skip-arr 15.0px "▸▸"
```

The `.kit-bio` rule now also renders on the kitten rescue card (celebrate.js), so raise it with the others:

```diff
-.kit-bio { margin: .15em 0 0; font-family: var(--f-body); font-weight: 600; font-size: max(13px, .7em); line-height: 1.2; color: var(--tt-ink2); max-width: 14em; }
+.kit-bio { margin: .15em 0 0; font-family: var(--f-body); font-weight: 600; font-size: max(16px, .7em); line-height: 1.2; color: var(--tt-ink2); max-width: 14em; }
```

and give `.tt-pill-txt`, `.title-tagline`, the "Skip practice" link / `.title-skip-arr` and the "Catnip here stays in
this…" span a 16 px floor (`font-size: max(16px, …)`), or have Q1 agree an exemption in the audit for co-brand pills.

## 2. Q1 (QA): the rescue-card bio has no smoke assertion yet

Suggested addition to a ui/brand smoke block: `__GAME__.ctx.bus.emit('kitten:rescued', { kittenId: 'muffin' })`, wait
for `.cel-card` (the celebration card), assert `.kit-bio` is inside the line element and the line is `.is-on`; then a
kitten without a bio shows no `.kit-bio`. R1 could not verify this in a browser (an ad-hoc Playwright script did not
reach a booted game within its time limit); the unit suite and the build cover the code path only statically.
