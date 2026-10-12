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

## CONTROLS_SPEC (iso controls) ui pieces (2026-10-11) — everyone
- `ui/abilityBar.js` §10.1: the desktop / pad bar (8 slots, corner glyphs from `input.codesFor`, 30 Hz conic sweeps,
  whole seconds, a white flash + `ui/glass_001` tick at −20 dB for cooldowns ≥ 2 s, lock pip, cracked Stand at 0 Grit,
  hover tooltips from `bar.*`). Reads `player.abilityState(out)` and `companions.cooldownLeft / readiness`.
  `bar.insetBottom` (CSS px, view bottom → bar top; reserved on KBM / pad also while a dialogue hides the bar, 0 on
  touch) is the camera's bottom safe inset. Only the slots catch the pointer: clicks on the panel padding and gutters
  reach the world; a right click on a slot does nothing.
- `ui.safeInsets` {top, bottom, left, right, w, h}: CSS px from each canvas edge, re-measured at 4 Hz. top = the bottom edge of the boss plate while it is shown; bottom = the ability bar. The camera's boss fit keeps her and the boss inside this rect.
- `ui/cursor.js` §10.2: `cursorKind(state)` (pure) + `CursorController` (canvas `cursor` + `#app[data-cursor]`):
  ground paw (pink bow ribbon), enemy sword, interact seal, pickup sparkle, attack-move, aim reticle (companion aim),
  unreachable grey ✕ (no walkable nav cell within 2 m of the cursor; `physics.nearestWalkable`), none in cutscenes /
  Meme Cam. `settings.cursorSize` 1 / 1.5 / 2 and `settings.cursorContrast`.
- `ui/hpBars.js` §10.4–10.5: enemy HP pills (36 × 5, touch 44 × 6; damaged / selected / hovered, fade 3 s after the
  last hit, pool 12, boss excluded) and the Grit arc over her head while guarding. In iso the hud pips and the lock
  reticle are off (C8); `?cam=classic` keeps them.
- §10.6 haptics: core's `Input` wires the gameplay events itself; ui only sends `button` from the cluster.
- `ui/touchEditor.js` §9.2 Edit layout (Settings → "Edit touch layout", touch only): drag buttons; Done writes
  `settings.touchLayout` = `{ name: [dx, dy] }` offsets from the ⚔ anchor in unscaled, unmirrored px; portrait entries
  are keyed `portrait:<name>` (SaveManager's `cleanLayout` keeps them: the id regex allows `:`).
- `ui/touchLayout.js` hero clearance: `computeLayout` moves any default-placed button whose hit circle + dead ring
  reaches the `heroClearR(w, h)` disc (`HERO_CLEAR` 120 px, `TOUCH.heroClear` if set, scaled by min(w, h) / 430 below
  390 px) around her point, or overlaps an `o.keepOut` rect (touch.js passes the `.hud-tl` / `.hud-tr` / ❚❚ rects),
  to the nearest legal free spot; if none it shrinks to 56 px, then takes the spot of a lower-`BUTTON_PRIORITY`
  button, then is dropped (`layout.dropped`, hidden with `.is-dropped`; never ⚔; `o.noDrop` in the editor). Custom
  Edit-layout spots stay put. Her point is `o.hero` (touch.js passes `cam.heroScreen()` when the camera offers it),
  else `heroPoint(w, h)` from the camera's own framing (`IsoRig.isoFrameOffset` + `CAMERA.iso.frameOffsetTouchX`:
  ≈ 42 % × 48 % landscape, 50 % × 40 % portrait). The ✕ chip (`layout.cancel`) gets its own free spot clear of every
  button, her and the keep-outs. `heroGap(b, hero, r)` < 0 = intrudes. `clampStickBase` keeps the floating stick's base
  a stick radius inside the left / right / bottom edges. Touch dead rings swallow only ground taps: `touch.js` asks
  `cam.pick(x, y, { touch, ground: false })` first, so a foe / NPC / interactable under the finger still wins.
- §9.1 HUD hit areas: the HUD cards (portrait, hearts, Grit, Valor, counters, boss bar, objective line; toasts and the
  lesson card on desktop) take their own pointer events, so clicks / taps on them never reach the world; the rest of
  the top strip is open to taps. Touch landscape: `.hud-tc` is narrowed to the free band between `.hud-tl` and the
  cluster (`body.has-tc-band`, `--tc-l` / `--tc-w`), toasts sit in the left column where the lesson card is, the card
  and objective line step aside during a boss fight, and `settings.leftHanded` mirrors the HUD (`body.ui-lefty`).
  Portrait: the hearts row wraps (≤ 2 rows, then shrinks) short of ❚❚ and the card / column sit under it (`--tl-b`).
- Touch gestures: a second finger within 0.2 s of the stick's touch-down (or before the stick goes live) turns both
  into a pinch; the stick only drives her once the thumb moves past a tap (12 px) or rests 0.25 s. ⚔ flick-aim: in
  play the first press waits 0.1 s (or a 16 px drag, which presses with that drag as the explicit aim), a quicker
  release presses + releases in one step.
- `text.js`: `actionGlyph(action, device, input)` / `glyphify(text, device, input)` resolve through the active preset
  and `settings.bindings`; `presetGlyph(action, preset, bindings)` previews any preset (the controls card's ◀ ▶).
  Touch interaction tags read "Tap".
- `settings.js`: rows for `camLock`, `autoRiposte`, `standAutoFace`, `pathPreview`, `hapticTaps`, `cursorSize`,
  `cursorContrast`; `invertY` only under `?cam=classic` (`settingVisible(def, iso)`). ui keeps `settings.camLock` and
  `cam.camLocked` in sync both ways (Y in play writes the setting; the setting applies at boot and on change).
