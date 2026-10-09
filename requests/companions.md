# Open requests from companions

The M1 API notes of this area are archived in `docs/api/companions.md`; what core applied is in `requests/RESOLVED.md`.

## M2 API (2026-10-09): how to use the new companions features — world, story, enemies, ui
All additive; the §19.3 contract is unchanged.

### Rescues placed by companions (forest / town / gate)
`src/companions/rescues.js` (`RESCUES`) holds every M2 rescue at its GAME_DESIGN position. On `level:loaded` (after
world's `onLoaded` hooks) `ctx.companions.placeRescues(levelId)` places **only the rows the level did not place
itself** (a `kind: 'kitten'` zone or an arena `rescue` calling `spawnKitten` first wins; a later `spawnKitten` with the
same id replaces ours outright, no dressing left behind). Rescued / joined / freed ones never come back; in hub mode
(`town.free`) none of the occupied-town rows are placed.

| id | where | how (spawnKitten opts) |
|---|---|---|
| pickles | forest (−12,−50.6) | `meow`, `prop: 'bush'` (drop the prop if your mushroom house door hides him) |
| pebble | forest (−22,−26) | `break` (your cracked-boulder PropActor may also call `kitten.reveal()`) |
| sprout | forest (−22,66) | `cage`, `needClear: 'ratcamp'` |
| **sage** | forest (18,−8) | `cage`, `hang: 4`, `lowerOn: { objective: ['ropes','treetop','treetop_ropes','sage_ropes'] }`, `play: 'd02'`; **without a level rope objective we build the 3 rope posts ourselves** (`ropes: [[13,−8],[23,−8],[18,−13]]`, 30 HP each, her blows only) and emit `objective:progress { id: 'treetop_ropes', value, max: 3, textKey: 'obj.ropes', done }` |
| waffles / toffee / muffin | town (5,−30) y 3 / (0,8) y 2.5 / (0,50.5) y 6 | `climb`, `y` (we stand on your perch when `physics.groundAt` finds it within 0.6 m) |
| **marmalade** | town (−23.2,−19.2), the bakery door | `appearOn: 'bakery'` (hidden until that arena clears), `stay: true`, contact r 3.6 → `story.play('d03')`; stays at the door after |
| **tofu** | town (18,−14) | `meow`, `prop: 'barrel'`, `stack: 6` (we add the 5 other barrels + colliders); a Meow **or any swing within 1.7 m** reveals him → `d04tofu`; then he trots to the forge (`leaveTo`) |
| **clover** | town (10,14) | `cage`, `cage: 'stocks'` (we build the stocks), `needClear: 'square'`, `interact: true` (E frees her: we push `{ id: 'free_clover', kind: 'rescue' }` into `level.interactables`; 3 blows work too) → `d04clover` → joins |
| **earlgrey** | town, where the giant Gloomjelly dies | `enemy:died` with `enemy.def.releases === 'earlgrey'` (or a `jelly_giant` / `GIANT` type) in `town` → 1 s later he sits there → rescued by himself 0.6 s later → `d04earlgrey` → walks to the library |
| **tater + mittens + pip** | gate (6,−80), the war-wagon | Tater hosts a `cage: 'cart'` cage (3 blows); `cageWith: 'tater'` puts Mittens and Pip in the same cage; all hop out together; Pip plays `d06` then runs to the gatehouse |
| socks | gate (6.6,−52.6) | `climb` (pass `y` for the ledge under the stairs if it is not the ground there) |

New `spawnKitten` opts: `hang`, `lowerOn {objective|flag}`, `ropes`, `ropeHp`, `ropesId`, `cage: 'stocks'`, `interact`,
`cageWith`, `off [x,z]`, `stack`, `appearOn`, `stay`, `talkR`, `autoRescue` (s), `leaveTo` (anchor name or [x,z]),
`expression`. `ctx.companions.lowerCage('sage')` lowers the treetop cage right now (2 s, then the door pops).
Service kittens (`marmalade`, `tofu`, `earlgrey`, `pip`) are `LostKitten`s tagged `rescue`: they play their scene
instead of `kitten:rescued`; if no story answers we set `town.marmalade` / `town.tofu` / `town.earlgrey` /
`gate.pip` ourselves. `spawnNpc(<that id>)` from a cutscene takes the actor over.

### → world
- **Vigil swap (§9.1):** pressing E at a stone that is **already lit** swaps to the next unlocked companion (we listen to
  `interact` with `target.kind === 'vigil'`; the first press still only lights it). Please switch the stone's prompt to
  `prompt.swap` while `stone.lit && ctx.companions.canSwap()`.
- **Barracks banner (hub, (8,−2)):** if your Hub has no interactable with `kind: 'barracks'` (or `id: 'barracks'`) we add
  `companions_barracks` (prompt `prompt.swap`); yours with that kind just works (we call `swapNext()` on its `interact`).
- **The Line:** the Spoon Brigade stands at anchor `line` (or `line_marker`), else (0,10) facing −Z. Optional: call
  `ctx.companions.spoons.start({ arm: true })` when your W4 starts if CS-08 was skipped some other way.
- **Gate crew:** in `gate` (until `gate.done`) we place Earl Grey at the winch (−1.6,42.2) and, once `gate.pip`, Pip at
  (1.6,42.2), both facing −Z, as NpcActors `earlgrey` / `pip` (story / the Line script can `actors.get` them).
- **Hub:** in `town` with `town.free` we place the rescued kittens at their §12.5 activity spots, villagers up to 20
  (12 on Low) and the station keepers (Marmalade, Tofu, Earl Grey, Snowpaw; Pip after `gate.done`, Pearl after
  `bog.done`, Coo after `ending.seen`) unless your Hub already spawned them (`spawnNpc(id)` before `level:loaded`).
  Their fallback spots are in `HubKittens.js` `HUB_NPCS` (in front of each building). Shops / interactions stay yours.

### → story
- Scenes we start: `d02` (Sage out of the lowered cage, she lands on Mochi when he is near), `d03`, `d04tofu`,
  `d04earlgrey`, `d04clover`, `d06` — the actor is registered under its id where it stands. A newly joined squire
  **takes the party slot** (the old one poofs "to the Barracks"); a re-sent join flag never swaps.
- **CS-08:** on `cutscene:start {id:'cs08'}` in `gate` we stand the brigade behind her (rows of 6, 1 m apart, from
  2.5 m behind her; `max(3, rescued)` capped 18, villagers `villager_spoon_<i>` fill); each kitten is registered under
  its own id (Kitten A / B = `state.kittens[0]`, `[1]`) or `spoon_<i>`. `cutscene:end` arms them (throws every 2 s).
  `boss:start` with a `cacklejaw` id arms them too; `boss:defeated` stops the throws (they cheer).
- New string keys (we fall back to this text in `src/companions/lines.js` until strings.js has them):
  `toast.swap` "{name} is with you!", `bark.sage.hello` "Ranger reporting. Quietly.", `bark.clover.hello`
  "Here I am, sweetpea. Snacks?", `bark.sage.caged.1` "Up here. Obviously.", `bark.clover.caged.1` "Mind the rats,
  sweetpea!", and the prompt keys `prompt.swap` ("Swap kitten") and `obj.ropes` ("Cut the ropes {value}/{max}").
  Also still wanted: `kitten.<id>` for the §6.4 rescue lines (the hub uses them as the kittens' hub lines).

### → enemies
- Earl Grey pops out of the giant Gloomjelly on `enemy:died` when `enemy.def.releases === 'earlgrey'` (Appendix A
  `jelly.sizes.GIANT.releases`). Please make the dying giant's `def` (or the payload `type`) carry that, e.g. `type:
  'jelly_giant'` or `enemy.size === 'GIANT'`.
- Spoon hits come from neutral, unhurtable NpcActors (tag `spoonBrigade`, attack id `spoon`, 5 dmg, knock 0, poise 0).

### → ui
- Swap toast: `ui:toast { text, icon: <companion id> }`. The HUD portrait follows `companion:changed` as before.
