# Requests and notes from save (M1)

`src/save/SaveManager.js` is now the real implementation. The frozen contract is unchanged: `load()` → migrated
data | null, `write(d)` → bool, `clear()`, plus `defaultSave()` (= `GameState.defaultState`) and `migrate(d)`.
Everything below is additive. Smoke covers it through ui's own Continue / Quit to Title flow
(`tests/smoke/save.mjs`, both blocks green).

## How the slot works (everyone)
- One localStorage key, `swordcat.save.v1`, plus `swordcat.save.v1.bak` (the previous progress save, used if the main
  record is unreadable). The record is the §19.7 schema plus `progress` (false for a settings-only record).
- `migrate` turns any stored shape into §19.7 with exactly the schema keys. It upgrades tech.md's original v1
  (hp 6, `holy`, `inventory.fish`, `quests`), fills in missing keys, and clamps or defaults garbage values. A bad save
  never breaks boot.
- **Autosave triggers:** `checkpoint`, `level:loaded`, `kitten:rescued`, `cutscene:end`, `objective:progress {done}`
  (once per completion), `save:request` (cutscene `end.save`, Vigil "Rest", shop purchases),
  `quest:update {state:'done'}`, `item:pickup` letter / heartBell, `state:unlock`, `level:exit` (stores the next level
  as the resume point; it lands while the results card is up) and `player:lifeLost` on Nine Lives only.
- **Writes happen at the end of the fixed step.** Several triggers in one step make one write, so the player's
  `checkpoint` heal and milk refill are already in `ctx.state` when the save is written. While a story scene plays
  (`story.isPlaying`) or a level loads, the write waits until it ends (at most 180 s). Mode `'cutscene'` alone does
  not hold it (ui's results card uses it).
- **Sessions:**
  - Nothing is written while the `title` spawn is loaded, in `?test`, or on `?level=` dev jumps (`?save=1` / `?save=0`
    override this; smoke tests can call `ctx.save.setEnabled(true)`).
  - Any other level load starts a session. A session may overwrite the slot only after its first successful write, so
    a New Game abandoned during CS-01 keeps the old save.
  - Loading the `title` spawn writes a final save if the session has written before, then puts the stored game back
    into `ctx.state`. Title-screen time is kept out of `playtime`.
- **The title keeps the resume point.** `LevelManager` sets `state.levelId/spawnId` to meadow/title when the title
  loads. Save restores them right after `level:loaded` (at boot and after Quit to Title), so
  `story.continueGame()` (which reads `ctx.state`) resumes at the saved Vigil Stone.
- **Settings** are patched into the stored record as soon as `settings:changed` arrives (at most 4 writes/s while a
  slider drags; the last value always lands). The game progress in the record is left alone. With no game stored,
  this creates a settings-only record: `load()` returns it so core applies the settings at boot, but `hasSave()` is
  false.
- On `pagehide` or a hidden tab, a pending save is written. Otherwise only the stored `playtime` is updated.

## To ui
- **Please use `ctx.save.hasSave()` for the Continue button**, not `!!ctx.save.load()`. `load()` also returns a
  settings-only record (a fresh install that only changed settings), and `bootSave` then shows a Continue that leads
  into a new game. `ctx.save.summary()` → `{ levelId, spawnId, difficulty, playtime, savedAt, kittens, kittensTotal,
  letters, heartBells, shards, fish, hearts, cleared[], cape, ending }` gives the data for a Continue card.
- Your current flows work as written and are covered by smoke: `continueGame` → `story.continueGame`, `quitToTitle`,
  `vigilRest` → `save:request`, and results under mode `'cutscene'`.
- **Shops:** after a purchase, `ctx.bus.emit(E.SAVE_REQUEST, { reason: 'shop' })` (§19.7 "autosave on shop purchases").
- **Settings:** keep writing `state.settings[key]`, then emitting `settings:changed {key, value}`. For the
  difficulty, `{ key: 'difficulty' }` also patches the stored difficulty. Enforcing "Nine Lives is fixed for the save"
  stays in `settings.js`.
- **"Saved" wax seal:** poll `ctx.save.lastSave` = `{ at, reason, ok, count }`. An event is requested from core below.
- Optional helpers if they're useful: `ctx.save.continueGame({ load })` resets state from the slot and loads it.
  `ctx.save.newGame({ difficulty, skipPrologue })` resets state to §19.7 defaults, keeping settings.

## To story
- `newGame()` / `continueGame()` / `toTitle()` work with save as they are (simulated in `tests/unit/save.test.js`;
  smoke drives Continue through them).
- `continueGame(at)` ignores the `at` argument ui passes. That's fine now that the title keeps the resume point in
  `ctx.state`.
- A save without `prologue.armour` makes `continueGame` start a new game. That includes a tech.md-v1 save migrated
  at boot (v1 had no prologue flags). That's your call; save does not invent flags.
- `cs00` / `title` never trigger a save. `end.save` (`save:request`) is honoured once the scene ends. A `load` inside a
  scene saves the scene's final state.

## To core (additive, optional)
- Please add `SAVE_WRITTEN: 'save:written'` with payload `{ reason, savedAt, ok }` for ui's save seal. Until then ui
  polls `ctx.save.lastSave`, and save does not emit unknown names.
- `save:loaded` payload JSDoc: add `reason?: 'new' | 'continue' | 'title'`. Core's boot emit has no `reason`.
  `'title'` is the stored game put back into `ctx.state` after Quit to Title.
- FYI: CONTRIBUTING's port table lists save at 5323, but this run assigned 5213. Save's smoke runs on a private
  HMR-less dev-server config, so other agents' file saves don't reload the page mid-block.
- FYI: in a full smoke run, `core:boot` reported "game:ready / level:loaded not in `__GAME__.events`", probably the
  200-entry ring buffer overflowing during the now-busier boot. Save emits nothing at boot.

## To player / companions / audio (FYI, nothing needed)
- player: save relies on `_syncState()` in the `checkpoint` handler (it runs before the end-of-step write).
  Kitten's `lives: Infinity` serialises as null and migrates back to 9, which Kitten ignores.
- companions / audio: `save:loaded` also fires on New Game / Continue / back at the title (`reason` set). Your
  existing `_syncFromState` / `_readSettings` handlers cover it.
