# TT3 requests to package K (controls, prompts, smoke)

## From A (Paw Tricks), 2026-10-14

1. **Strings** (§11.4): the `trick.*` rows verbatim in `strings.js`. A reads them through `ctx.strings` and falls back to
   `TRICK_TEXT` in `src/player/tricks/PawTricks.js` (the same text), so nothing breaks before they land.
   `text.js`: `[Trick]` → the `trick` action glyph (`TOKEN_ACTION`).

2. **Hint on unlock.** A emits `trick:unlocked { id, bark }` (`TRICK_EVENTS.unlocked`; the core catalog key
   `TRICK_UNLOCKED` is requested from T). `bark: false` means a quiet catch-up on load (a save already past the
   hand-over): please show `trick.<id>.hint` only when `bark` is true. The hand-overs: coin in the meadow on the way into
   the Crow Fields, twirl 1.6 s after entering the forest, cloud 1.6 s after entering the town.

3. **Esc while aiming a Paw Trick.** Esc is both `back` and `pause`. While `player.tricks.aim.on` (or
   `player.tricks.holding`) is true, an Esc press should only call the aim off (A already reads `back` for that) and not
   open the pause menu. The kitten ability's aim likely wants the same rule. Suggested in the pause handler:
   `if (ctx.player?.tricks?.holding) return;` before opening the menu.

4. **Toast icon.** A's toasts use `icon: 'trick'` (the trick's name on unlock, the swap line "Paw Trick: {name}").
   `toasts.js` ICONS has no `trick`; please map it to `I.ttCoin()` (or the equipped trick's icon).

5. **Smoke.** `tests/smoke/tricks.mjs` is picked up by the readdir in `tests/smoke.mjs`, nothing to register. Its blocks
   use orders 82 to 85, `KeyF`, `Digit2`, `Space`, `Escape`, a stubbed `navigator.getGamepads` (RT = 7, D-pad right
   = 15) and the touch session at 844 × 390. They restore `navigator.getGamepads` and the camera zoom when done.
   `HELD_KEYS` could add `Digit1`, `Digit2`, `Digit3` for safety.

6. **Bar smoke.** `ui:bar` counts 8 `.ab-slot` elements. That still holds before a trick is owned (the trick slot is
   created on the first unlock). If a block grants a trick first, the count becomes 9.

7. **Touch layout.** `touchLayout.js` gained an `extra` option and `TRICK_BUTTON`; `BUTTON_PRIORITY` now drops Golden
   Hour before Meow on a cramped screen (Golden Hour also fires from the Stand + ⚔ chord). The default cluster without
   `extra` is unchanged (unit-tested in `tricks.test.js`).

8. **Controls card / help.** Please list: F / RT / ":3" = Paw Trick (tap casts, hold aims, Esc cancels), 1 / 2 / 3 or
   RT + D-pad or a long press on ":3" = pick a trick, Jump again in the air and hold = Ribbon Twirl.

## From C (characters, enemies), 2026-10-14
1. `docs/api/player.md` (yours): please add one line under SwordcatModel: "`setTrickPose('toss' | 'twirl' | null, w)`:
   the Paw Trick pose (TT3 §11.4); `w` 0..1 is followed every frame, `null` eases back to rest. Default face `happy`,
   hurt `wince` (">_<"); brows show only while scripted or with an expression override."
2. `STATUS.md` (yours): please add under the TT3 status: "Characters (C): all 7 P1 defects fixed (pug and Barkus neck,
   eyes seated inside the head outline, sword off Clem's face, upright tail with no hull rings, Sir Wobble's face and peg,
   Grizzlechop's hat and cheese shield, Simas's bucket). P2 8 to 18 fixed: no maroon ear / cape-lining bands, no crown
   or inner-ear strands, Clem `happy`, no under-eye crescent, Token Tails Cat belly + tail + coin at chest height, no
   sleepy kittens, Judas blaze, Zare forehead stripes, Simas lighter mask, Pearl's bigger round bow, no Barkus helm
   band, smooth rats / Grizzlechop / spider / crow, crisper hyena spots, no disc in the jelly, bigger pikeman pupils,
   plain crossbow hood, crow tuft, bigger Cacklejaw plate."
3. No prompt, string or binding change is needed from C.

## Resolved (integrator, 2026-10-15)
Applied in the TT3 integration; see `requests/RESOLVED.md` (Phase TT3 integration). Open optional items are listed there.
