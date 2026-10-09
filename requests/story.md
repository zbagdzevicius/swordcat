# Open requests from story

The M1 API notes of this area are archived in `docs/api/story.md`; what core applied is in `requests/RESOLVED.md`.

## How to use the M2 story beats (2026-10-09) — world, companions, enemies, ui, audio
Story already *listens* for these events and plays the scene itself. You can also call `ctx.story.play(id)` directly:
a second request for an id that is running or queued is merged into the same run (both promises resolve together).
| Beat | Story plays it on | Scene id | Sets |
|---|---|---|---|
| Sage's cage lowered | (companions) `LostKitten opts.play: 'd02'` | `d02` | `forest.sage` |
| Lantern Camp | world trigger `camp` → `play: 'cs04'` (already in forest.js) | `cs04` | `forest.camp`, lights `vigil_3`, env `forest_night` |
| B1 defeated | `boss:defeated {id: 'boss_grizzlechop'}` | `cs05` | `shards = 1`, `forest.boss` |
| Bakery Street cleared | `arena:clear {id: 'bakery'}` **or** `objective:progress {id: 'bakery', done}` | `d03` | `town.marmalade`; starts objective **`chase`** (`obj.stealer`) |
| Post bag back | `item:returned {item: 'post_bag'}` **or** `objective:progress {id: 'chase', done}` | `cs06` | `town.letters`; completes `chase`; the letter rides on her belt until CS-10 |
| Town rescues | `play('d04tofu' \| 'd04earlgrey' \| 'd04clover')` (or `play('d04')` = the next one not done) | `d04*` | `town.tofu` / `town.earlgrey` / `town.clover`; Clover is `companions.unlock('clover')`-ed by the scene |
| Castle Steps | world trigger `steps` → `play: 'cs07'` (when `town.clover` and the square is clear) | `cs07` | `town.free`, `town.done`, red cape unlocked + equipped, env `hub_gold`; then the results card (no load) |
| Gate yard (first arrival, spawn `start`) | `level:loaded` (not in `?test`) | `gate_yard` | `gate.yard`; objective `scout` |
| War-wagon struck | (companions / world) `play('d06')` | `d06` | `gate.pip` |
| S1 + S2 clear | automatic: no live AI enemy south of z −45 after `gate.pip` (or `play('gate_back')`) | `gate_back` | `gate.back`; horn + "Back to the Line!" |
| Pin back from Pip | `item:returned {item: 'pin', by: 'pip'}` (a hit-drop `{item: 'pin'}` only sets the flag) | `gate_pin` | `gate.pin` |
| Line 70% | `objective:progress {id: 'line'}` value/max ≥ 0.70 → waits ≤ 10 s for ≤ 2 alive + no telegraph, then plays; despawns leftovers | `cs08` | `gate.spoons` (+ `companions.spoonBrigade(true)` if it exists) |
| Line 85% | same, ≥ 0.85 | `g02` | `gate.leap` |
| Line 100% | same, `done` | `gate_open` (ambient) | `gate.line` |
| B2 defeated | `boss:defeated {id: 'boss_cacklejaw'}` | `cs09` → `cs10` | `shards = 2`, unlock ability `golden`, `gate.boss`; CS-10: results card, `load town bakery_cot`, `gate.done`, env `hub_grey`, ends at `town` spawn `hub` |

Additive `ctx.story` API (M2): `quest` (current step `{id, textKey, text}`; `quest:update {questId, state: 'active'|'done', text, textKey}` is
emitted on every change — ui's objective bar / pause can show it), `board()` → `{ cards, next, spawn }` (Quest Board:
cards = `{ id, chapter, label, title, region, available, cleared, next, kittens, kittensMax, letter, bestRank, bestTime }`),
`hubTalk(actorOrNpcId)` → shows a §6.5 hub line as a bubble (never the same line twice in a row; Marmalade in bed after
`gate.done`, Pip counts the missing kittens) and returns `{ key, vars, text }`. Pure helpers in `src/story/quests.js`
(`nextLevel`, `levelAvailable`, `levelCards`, `nextLabel`, `entrySpawn`) and `src/story/dialogue/hub.js` (`hubLine`).

## To enemies (open)
- A scripted, AI-less **`grizzlechop`** type for CS-05 (like `cacklejaw` for CS-02): the yielding captain with his hat
  and cheese shield, `pose('kneel')`, `face`, `moveTo`. CS-05 first borrows the defeated `boss_grizzlechop` itself (it
  scripts him, stops the `die` shrink with `stateName = 'yield'` and despawns him at the end); the stand-in is only used
  when the boss is already gone. Same for CS-09 (it falls back to `cacklejaw`).
- Nice to have: on `boss:defeated` for a boss that ends in a scene (grizzlechop, cacklejaw), skip the death poof /
  helmet pop so the captain can "yield" on his knees (story despawns him at the scene's end).

## To companions (open)
- `opts.play: 'd02'` on Sage's treetop cage, `'d06'` on the war-wagon (Pip strolls out; story spawns `pip` beside her if
  no actor `pip` is registered). Tofu / Earl Grey / Clover: call `ctx.story.play('d04tofu' | 'd04earlgrey' | 'd04clover')`
  when each is freed; the scene finds the actor registered under that id (else spawns an NPC) and despawns it at the end.
- Spoon Brigade switch: story calls `ctx.companions.spoonBrigade(true)` (or `setSpoonBrigade(true)`) at CS-08's end and
  sets flag `gate.spoons`; either is fine to key off.
- CS-08 spawns up to 18 scripted spoon kittens (`spawnNpc(kittenId | 'villager_<n>')` + `prop('pot_helm'|'colander')` +
  `prop('spoon')`) for 20 s. They turned to face her in the shots — fine, but if NpcActor's "watch her" turn runs
  while scripted, a scripted actor should keep its scripted facing.

## To world (open)
- Town: a `steps` trigger `play: 'cs07'`, and the bakery fight as arena id `bakery` (or an objective `bakery`). The
  Pilfer chase should emit `item:returned {item: 'post_bag'}` (or complete objective `chase`) on the bag drop.
- Gate: The Line objective id `line` (`max` any; story uses value/max). If the Line controller also calls
  `story.play('cs08' | 'g02')` itself, that's merged. Optional anchors story would use when present: `bakery_door`,
  `bakery_meet` (D-03), `camp_fire`, `pud_sleep`, `camp_mochi` (CS-04; thanks), a collider on the west flanking tower
  top (G-02 reads `physics.topAt(-8, 8)` for Marmalade's perch).
- Optional: `ctx.levels.activateVigil(id, {silent})` (story falls back to `level.vigils.find(id).activate()`).
- The hub: Quest Board / South Gate → `ctx.story.board()`; NPC interact → `ctx.story.hubTalk(actor)`.
- Strings story added for you: `tut.pug`, `toast.exit.forest`, `toast.exit.town`, `toast.exit.gate`.

## To ui (open, optional)
- `handles.letter` + `cinema({ letter: { label, title, text } | null })` if you want to draw CS-06's parchment letter
  card yourself (story's overlay draws it otherwise, Uncial Antiqua on parchment with the pink paw seal).
- Story awaits `ui.showResults(payload)` after CS-07 (town) and inside CS-10 (gate) — at most 12 s (1.5 s in `?test`).
  `quest:update` is there for the objective bar.
- Strings story added for companions: `toast.swap`, `prompt.swap`, `bark.sage.caged.1`, `bark.sage.hello`,
  `bark.clover.caged.1`, `bark.clover.hello`.

## To audio
- Thanks for `src/audio/cues.js`: every M2 scene plays its cue ids (`cs04.purr`, `cs08.horde`, `cs09.roar`, …).
