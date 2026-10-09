<!-- Archived from requests/ui.md by core at the M2 integration pass (2026-10-09): the M1 API notes and requests of this area.
     Open items were moved to requests/ui.md; applied ones are summarised in requests/RESOLVED.md. -->

# Notes from ui

## How to use ctx.ui (M1, 2026-10-08) — story, world, save, player, companions, enemies, audio
All additive to the §19.3 contract (`ui.loading(on)`). Everything is safe to call before `init` (no-ops) and under node.

| Call | What it does |
|---|---|
| `ui.loading(on)` | Loading veil (parchment, paw progress bar from `ui:progress`, a random `loading.tips` line). |
| `ui.showResults(payload) → Promise` | §14.3 Results card (`{levelId, time, kittens, kittensTotal, letter, fish, lives, livesLost, rank}`); resolves on confirm. Holds the world in mode `cutscene` and hands the previous mode back. In `?test` it continues by itself after ~1.6 s. |
| `ui.cinema(cmd)` | Story's overlay commands: `{ letterbox, hud, caption, title, chapter, fade, press, skip, skipText, clear }` (strings already resolved). Also `ui.cinema.letterbox/hud/apply/clear/chapter/fade`. |
| `ui.handles` | `{ dialog, cinema, prompt, skip, title, tutorial }` all true: story's fallback Overlay steps aside. |
| `ui.toast(text, {icon, key})` | Queue of 3, 2.5 s each. `[Key]` tokens in the text become device keycaps. Or emit `ui:toast {text \| key, vars, icon}`. |
| `ui.hint(keyOrText \| null, {step, total})` | Tutorial parchment card (keycaps per device). |
| `ui.chapter(c) → Promise`, `ui.fade(f) → Promise` | Chapter card (3.0 s) / colour fade. |
| `ui.showTitle()`, `ui.openMainMenu()` | Title over the live CS-00 / main menu. |
| `ui.pause()`, `ui.resume()`, `ui.openVigil()`, `ui.gameOver()` | Pause-type screens freeze the world with `game.pause(true)`. An external `setMode(...)` out of `menu` closes them. |
| `ui.busy` | True while a ui screen owns input (menus, results). |
| `ui.hud.showSaved()` | Flash the "Saved" wax seal (the HUD also polls `ctx.save.lastSave.count` at 10 Hz and flashes it on every successful write). |

Events the ui listens to: `dialog:*`, `story:prompt`, `interact:available/clear`, `combat:telegraph(End)`, `combat:hit`,
`player:*` (damaged, healed, grit, valor, golden, milk, lifeLost, stillStanding), `boss:start/phase/dizzy/defeated`,
`objective:progress`, `kitten:rescued`, `item:pickup/stolen/returned`, `state:unlock`, `shard`, `checkpoint` (opens the
Vigil menu: Rest → `save:request {reason: 'vigil'}`, swap kitten → `companions.setActive([id])`, difficulty),
`camera:meme`, `cutscene:start/end`, `level:loading/loaded`, `game:mode`, `input:device`, `ui:toast`, `ui:progress`.

## Done from other areas' requests
- story: `handles`, `cinema(cmd)`, `openMainMenu()`, dialog (30 chars/s × `settings.dialogSpeed`, click → `story.advance()`),
  prompts, skip ring, pause key rules during scenes and Midnight Practice (pause on the release of a < 0.35 s press).
- world: `showResults(payload) → Promise`; interaction tags; the companion swap on `checkpoint`.
- save: Continue uses `ctx.save.hasSave()` (live) and `ctx.save.summary()` (the Continue button's "Region · n/18" line);
  the "Saved" seal polls `ctx.save.lastSave`; settings write `state.settings[key]` then emit `settings:changed`.
- camera: `ctx.cam.showLockMarker = false` (ui draws the rotating gold reticle + enemy HP pips).
- fx: HUD / dialogue sit above fx's z-index 8 layers; no second hurt vignette; damage numbers stay fx's.
- enemies: no second "!" alert bubble.

## To core (optional)
- `SAVE_WRITTEN: 'save:written' {reason, savedAt, ok}` (save's request) would let the seal react without polling; ui
  keeps polling `ctx.save.lastSave` until then.


---

# M2 notes (archived from requests/ui.md by the M2 integration pass, 2026-10-09)


The M1 API notes of this area are archived in `docs/api/ui.md`; what core applied is in `requests/RESOLVED.md`.

## How to use the M2 ui services (2026-10-09) — world, story, player
All additive. Safe before `init` and under node.

| Call | What it does |
|---|---|
| `ui.openShop(id) → Promise` | Hub station panel (§13.3 / §14.3): `'bakery' \| 'forge' \| 'library' \| 'wardrobe' \| 'lookout' \| 'barracks'`. World ids such as `'shop_forge'`, `'station-bakery'`, the keeper's name (`'tofu'`) or anything containing `banner` / `barrack` also resolve. Freezes the world (mode `menu`) and resolves when the panel closes. Purchases deduct `state.fish`, write `state.upgrades` / `state.cosmetics`, and emit `save:request {reason: 'shop'}`. |
| `ui.openQuestBoard({ onPick }) → Promise<{levelId, replay} \| null>` | The Quest Board (§12.5). Without `onPick`, the ui travels: from the town, before `town.done`, it calls `levels.exit(id, 'start')` (town results card, then the level); otherwise `story.travel(id, 'start')` if story has it, else `levels.load(id, 'start')`. With `onPick(levelId, pick)` world travels itself. |
| `ui.travel(levelId)` | The same travel rule, callable directly. |
| `ui.closeShop()` | Closes any station panel or the board and resumes play. |

**Interactables (world, Hub.js):** no direct call is needed. The ui listens to `interact {target}` and opens:
- `kind: 'shop'` (or `'station' \| 'stall'`), with the station in `target.id` (or `target.station`);
- `kind: 'banner' \| 'barracks'` for the companion swap, and `'lookout'` for Pip;
- `kind: 'board'` (or `'questBoard'`, or an id containing `questboard`) for the Quest Board.

The strings `prompt.shop` / `prompt.board` already exist for the tag labels. If `use()` also calls `ui.openShop` / `ui.openQuestBoard`, the second call is a no-op.

**Objective bar (world, Objectives):** `objective:progress` may carry an optional `marks: [0.2, 0.45, 0.7, 0.85]` (fractions). These draw milestone ticks on the bar, and ticks turn gold once passed; use it for The Line's wave thresholds. When `max >= 100` and the text has no `%`, the bar shows a percentage. `frozen: true` greys the bar.

**Results per level:** the ui snapshots `state.levels[id]` at `level:loaded`. `showResults` compares the run against that snapshot to draw "First clear!", "New best time!" or "New best rank!" plus a "Best: m:ss · rank" line. No payload change is needed.

## To player
- **Valor Gain upgrade is not applied.** `state.upgrades.valorGain` (Library, 150 fish) should set `valorState.gainMul = ECONOMY.shops.valorGain.mul` (1.25) on level load and spawn. Today nothing reads it. The ui sets `ctx.player.valorState.gainMul` once at purchase time, so the effect is lost on the next reload.
- **Public method for milk capacity.** Please expose `recomputeMax()` (milkMax from the satchel, maxHp from Heart Bells), or re-run it on `save:request {reason: 'shop'}`. The ui calls `player.recomputeMax ?? player._recomputeMax` after a Satchel purchase and tops up the new bottle.

## To story (optional)
- The shop and board copy lives in ui's `UI_STRINGS` under `ui.*` keys: item names and descriptions, skin and cape names, lock reasons, and board and results labels. Story may add the same keys to `strings.js` (localisation); `strings.js` wins as soon as it has them.
- `story.unlock()` emits a `ui:toast` with `name: id` ("Sword unlocked: fishbone"), and the ui also toasts on `state:unlock` with the display name. Dropping story's toast would avoid a double toast; the queue drops exact duplicates only.
