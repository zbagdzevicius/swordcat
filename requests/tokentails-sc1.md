# SC1 requests (Token Tails re-coat, Token Tails cat, plate words, tunic sword)

Plan: `docs/TOKENTAILS-PLAN.md` §2.2, §2.3 (plate rows), §2.4. SC1 changed only its own files; these need other owners.

## Red cape from the start (game state; SC1 cannot reach it)

`swordcatConfig()` now defaults to `cape: 'red'` (royal red, gold hem `PAL.trimGold`), but the player's cape comes from
the save's `cosmetics.cape`, which still starts as `'cream'`. The iso shots still show the cream cape. To start in red:

- `src/core/GameState.js` (no owner listed; orchestrator): `cosmetics: { swords: ['borrowed', 'twig'], capes: ['cream', 'red'], sword: 'borrowed', cape: 'red' }`.
- `src/ui/shops.js` (SC2b): the two `st.cosmetics ??= { ... cape: 'cream' }` defaults and `itemState`'s `?? 'cream'` → `'red'` (and `'red'` in `capes`).
- `src/player/SwordcatModel.js` (SC4): `equippedCape()` fallback `'cream'` → `'red'`.
- `src/save/**` (SC5): migrate old saves whose `cosmetics.cape === 'cream'` and that never chose it, if wanted (cream stays a valid cape).
- `src/core/config.js` `ECONOMY.capes.red` is `{ flag: 'town.free' }` (CS-07 unlock). SC1 was told to change nothing else in
  config.js, so it is unchanged; set it to `'start'` with the GameState change (and update any test pinning it).

## Plate words in files SC1 does not own

- `tests/unit/contracts.test.js:363` (SC2a): `ENEMIES.stealer.plateWordsFriend` is now `['SNACK SHARER']` (was `['POSTMASTER']`).
  (Green in SC1's last full run, 1074/1074: SC2a has already updated it.)
- `src/story/cutscenes/cs02.js` `WORDS`, `cs08.js` raider words, `cs09.js` comments (SC2a): use `GRUMP`, not `HATER`;
  "his plate flips to CHEER-IN-CHIEF".
- `src/enemies/types/*.js`, `src/enemies/scripted/Pilfer.js`, `Cacklejaw.js`, `Enemy.js`, `tuning.js`, `src/fx/Encounters.js`
  (no owner listed): comments still say HATER / POST STEALER / HATER-IN-CHIEF / Post Stealer. Comments only; no display text.

## Tunic sword (STATUS F14)

The failing smoke probed the plain `'tunic'` outfit, which is the empty-pawed look by design (`SwordcatModel._config`
passes `tunicSword: false` for it; `tests/unit/player.test.js` asserts "plain tunic (cutscenes) stays swordless"). No
gameplay path wears it: `StoryManager.practiceOutfit()` returns `'tunic_sword'`, and no cutscene sets `'tunic'` any more.
SC1 pointed `characters:hero-read` at the practice outfits she plays in (`tunic_sword`, `tunic_bow`); both keep the
sword on screen. If the founder wants the plain tunic to carry the sword too, SC4 changes `SwordcatModel._config` to
`tunicSword: o !== 'armour'` and updates `player.test.js:1494`; `swordcatConfig` needs no change.

## Token Tails cat

- Config id `tokentails_cat` (`CATS.tokentails_cat`, `tokentailsCatConfig()`), prop `tt_coin`. Cutscenes (SC2a) can
  `spawnNpc('tokentails_cat', ...)` or read `catConfig('tokentails_cat')`.
- Hub: `src/world/Hub.js` `RESCUE_KEEPER` (by the fountain, `when: 'town.free'`), spawned by `HubKittens`; it says only
  the `npc.ttcat.1..3` keys `ctx.strings.has()`; `speakerName` = `name.ttcat` when present.
- The mascot's tail is longer than the shared rest-pose tail curve allows; SC1 made it thinner (`tail.thick 0.72`),
  not longer (would need a `tailLen` option in `KittenBuilder.restPose`).
