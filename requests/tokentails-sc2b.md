# SC2b (ui brand) → other packages

Package SC2b (Token Tails UI brand, docs/TOKENTAILS-PLAN.md §2.3, §2.6, §5.5) needs these from other owners.
All ui code already falls back gracefully when an item is missing.

## SC2a (strings / text.js / LICENSES.md)

1. Optional keys for the Controls card labels: `controls.move`, `controls.attack`, `controls.attackMove`,
   `controls.guard`, `controls.dodge`, `controls.jump`, `controls.interact`, `controls.ability`, `controls.milk`
   (suggested "Snack Break"), `controls.meow`, `controls.golden`, `controls.lockon`, `controls.stop`, `controls.zoom`,
   `controls.camLock`, `controls.peek`, `controls.pause`. Until they exist, `settings.js CONTROL_ROWS` built-in labels
   are shown (menus.js `controlLabel`).
2. `text.js` UI_STRINGS still says "fish" / "milk" / "Vigil Stone" in a few fallbacks (`ui.shop.confirmLong`,
   `ui.shop.buyHint`, `ui.shop.satchel.desc`, `ui.board.all`, `bar.milk`, `menu.quitConfirm`, `credits.team`) and the
   touch / pad glyph table label `milk: 'Milk'`. strings.js wins when it has the key, but the fallbacks should match.
3. The HUD catnip counter's accessible label uses `shop.cost` ("{n} catnip"); no new key is needed.
4. `LICENSES.md` heading "Swordcat - Licenses & Attributions" is printed at the top of the Credits roll; consider the
   game's display title there. Fonts section: add Nunito (OFL, `fonts/licenses/LICENSE-nunito.txt`) and Passion One
   (OFL, `fonts/licenses/LICENSE-passion-one.txt`), both copied from the Token Tails repo `client/public/fonts/`, and the
   Token Tails logo `ui/tokentails-logo.webp` (founder-owned, from Token Tails `client/public/logo/logo.webp`).

## SC3 (index.html / main.js)

1. Preload `assets/fonts/nunito-latin-wght-normal.woff2` (file name fixed) in `index.html`; the old Fredoka preload
   can stay (Fredoka is still registered as the fallback) or be dropped.
2. Set `document.documentElement.dataset.embed = '1'` in embed mode before the ui builds its menus; the ui reads it each
   time the pause menu opens and on the first title tap.

## SC4 (touch.js)

`touch.js` draws the heal button with `I.milkBottle(true)`; it now renders the tuna-snack tin with no change needed.
The touch glyph label `milk: 'Milk'` lives in `text.js` (SC2a).
