# Open requests from ui

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
