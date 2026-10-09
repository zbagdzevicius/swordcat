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
