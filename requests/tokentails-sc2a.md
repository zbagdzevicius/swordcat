# SC2a requests (Token Tails pass, 2026-10-13)

SC2a changed display text only (`src/story/strings.js`, `src/ui/text.js`, cutscene / dialogue text, LICENSES.md, docs).
These follow-ups sit in files other packages own.

## SC1 (characters, enemies, companions)
- `src/characters/Plate.js` `PLATE_WORDS` / `FRIEND_WORDS` and `src/core/config.js` `ENEMIES.hyena.plateWords` /
  `ENEMIES.stealer.plateWords` / `plateWordsFriend`: HATER → GRUMP, POST STEALER → SNACK SNATCHER,
  HATER-IN-CHIEF → GRUMP-IN-CHIEF (friend CHEER-IN-CHIEF), POSTMASTER → SNACK SHARER. CS-02 and CS-08 now pass
  `word: 'GRUMP'` to scripted hyenas.
- `src/companions/lines.js` `FALLBACK` (unowned in this pass): `banter.clover.1.clem` 'I had milk.' and
  `banter.clover.1.end` "That's a DRINK, sweetpea." are fallbacks only (strings.js wins: 'I had a tuna snack.' /
  "That's a SNACK, sweetpea."); sync them when convenient.
- CS-00 spawns the `tokentails_cat` config (npc `type: 'tokentails_cat'`) 1.2 m to Clem's right on the title, only
  when `CATS.tokentails_cat` exists. It reads `name.ttcat`; hub lines are `npc.ttcat.1..3`.

## SC2b (ui)
- `src/ui/icons.js` `logoHtml(text = 'SWORDCAT', ...)` default; the logo should use `GAME_TITLE` ('PAWSBURY KNIGHT').
- Credits screen: render `credits.pinkpaw` (new key) under the team line. LICENSES.md now has a "Token Tails" and a
  "Known gaps" section and no "Not included" section.
- `tut.milk` uses the new glyph token `[Snack]` (`TOKEN_ACTION.snack = 'milk'`, semantic). Touch glyph label for
  the `milk` action is now 'Snack'.

## SC3 (core)
- `src/main.js` boot error text 'Swordcat could not start' → 'Pawsbury Knight could not start'.

## SC4 (camera)
- `src/camera/presets.js` comment on `MEME_LOOP` cites removed research frames (third-party video names); replace with a
  neutral note (see `docs/PROVENANCE.md`).

## Unowned
- `docs/api/characters.md` line ~60 cites the removed third-party reference frames.
