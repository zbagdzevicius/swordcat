# Open requests from world

The M1 API notes of this area are archived in `docs/api/world.md`. M2 notes ("How to use") are below the open items.

## To characters / player — hero fur cost on Med / Low (open, §18 budget)
Hero fur shells on Med, plus a shells-off LOD beyond about 8 m: furHead is ~89.5k tris on Med; kitBody + furTail are
~89k even on Low. Meadow day, whole frame: Med 138–160 calls / 610–690k tris, Low 94–105 calls / 212–236k tris (world's
share Med 46 calls / 295k tris). M2 levels, level share on Med: forest ~61 calls / 238k tris, town ~32 / 235k, gate ~47 /
140k (whole frame 200–250 calls with enemies, companions and the hero).

## To core — optional
`ctx.postfx.setGrade(name)` ('none' | 'grey' | 'gold' | 'night'); Env calls it every frame when it exists (the presets
already carry the night / grey colours, so it is polish only).

## To story (open)
- `tut.pug` is not in `strings.js` in this tree yet: the forge hint uses key `hint.pug` with its English text
  ("Shields block from the front. Bright Slash it, or go around."). World switches to `tut.pug` once it is there.
- Please add `prompt.light` ("Light [E]"): the three Lantern Alley lanterns use `prompt.interact` until then.

## To enemies (closed by your M2 notes; thanks)
`prewarm` (bosses build as stand-ins without `boss:start`) and the sleeping pre-placed enemies are used as described.
World's own fallback warm-up now skips `boss_*` types too (it spawned B1 at the forest load: the boss bar showed).

---

## How to use the M2 levels (2026-10-09, world) — story, enemies, companions, ui, audio, fx, camera

### Levels
- **forest** (§12.4): spine bends once at (27, 0) so the path passes the giant oak. Spawns `start` (0, −92), `boss`
  (−10, 70.5), `camp` (3, 33), `vigil_1..4`. Arenas `hollow` (r 12), `ratcamp` (r 13 at (−16, 56), moved off the boss
  door), `mill` (B1 `boss_grizzlechop`, r 12 at (−10, 84)). Open zones `gate`, `mushrooms`, `treetop`. Trigger `camp`
  r 6 → `cs04` when `forest.sage && !forest.camp`. Exit (−24, 94) → `town` when `forest.boss` (blocked toast
  `toast.exit.forest`). Env `forest_day` → `forest_night` live on `forest.camp` (`def.moodLive`: Env tweens 3 s once
  the scene has ended).
  Anchors: `cap_1..5` (mushroom tops, absolute y), `mushroom_door`, `treetop_branch` (the rope point over Sage's cage,
  y ground + 8.6), `treetop_cage`, `root_ledge_1/2` (y 1.5), `stump_1..6`, `log_bridge`, `camp_fire`, `camp_tent`,
  `pud_sleep` (6, 48, facing −Z), `camp_clem`, `camp_mochi`, `camp_sage`, `camp_crane` (y 8), `mill_pillar_0..5`,
  `mill_deck`, `mill_deck_a/b` (deck top, absolute y), `mill_center`, `mill_gate`, `exit_mill`, `hollow_center`.
  `level.bossPillars` = the 6 pillar colliders (r 0.8, 2.5 m). Mushroom caps 2 and 4 are `bounce: 9` colliders.
- **town** (§12.5): spawns `start` (0, −66, outside the South Gate), `hub` (0, −46), `bakery_cot`, `belltower`
  (0, 50.5, y 15.2 = the bell platform), `vigil_1` (hub stone), `vigil_2` (−8, −9: moved out of the square arena).
  Open zones `southgate`, `alley`, `bakery` (all `onlyIf: '!town.free'`); arenas `forge` (r 9 at (19, −4)) and `square`
  (r 15; W5 = `jelly_giant` spawned at the fountain centre), both `autoLockWhen: '!town.free'`, `clearedWhen:
  'town.free'`. Trigger `steps` r 5 at (0, 34) → `cs07` when `town.cleared.square && town.clover && !town.free`.
  When `town.free` is set mid-level the occupiers left are despawned (poof), the arenas count as cleared and Env tweens
  to `hub_gold` (then `hub_grey` on `gate.done`, `ending_gold` on `ending.seen`).
  Anchors: `south_gate`, `lantern_1..3`, `balcony` (y 3), `bakery_door`, `bakery_meet`, `bakery_cot`, `post_office`,
  `post_steps` (−35.6, 4), `chase_0..5`, `forge`, `fountain` (rim y 0.6), `statue_top` (y 2.5), `castle_steps`,
  `snowpaw`, `loft_ledge` (y 7.2 = 6 above the terrace), `sunbell`, `bell_platform`, `tavern_patio`, `quest_board`,
  `station_<id>`, `hub_<kittenId>` (the 18 §12.5 activity spots, absolute y), `crane_sunbell`, `hub_view`.
  `level.sunbell` (the bell pivot) and `level.ringBell(amount)` swing the Sunbell; the Dawnstone glow in it is on once
  `ending.seen`.
- **gate** (§12.6): the heightfield *is* the causeway (deck y 0 for |x| ≤ 6, z −61 … +47), the stair ledge (y −0.8,
  x 6 … 10.5, z −55.5 … −49) and the sea bed (≈ −2.9) under a deep water plane at y −1.2; walk off the deck and the
  player's splash returns her. Spawns `start` (0, 58, facing −Z), `boss` (2.5, 20), `line` (0, 12), `vigil_1..3`.
  Open zones `s1`, `s2` (flags `gate.cleared.s1/s2`); arena `causeway` (rect 12 × 40 at (0, 10), B2 `boss_cacklejaw`,
  `autoLockWhen: 'gate.line && !gate.boss'`). Anchors: `line_mark` (0, 10), `lane_0..2`, `spoons` (behind the Line),
  `winch`, `winch_a`, `winch_b` (Earl Grey / Pip), `portcullis`, `gatehouse_top` (CS-09), `tower_w`, `tower_e`
  (tops, y 10; colliders are walkable: `physics.topAt(−8, 8)` = 10), `marmalade_tower`, `wagon`, `horde`, `horde_a/b`,
  `ballista_raft` (muzzle), `raft`, `ledge`, `stairs_top`, `crane_gate`. `level.portcullis.set(down)` drops / lifts the
  portcullis (a collider while down); `level.raft` bobs.

### The Line (Objectives.js `LineController`, U10)
- Started by world when she steps on the marker disc (r 3 at (0, 10)) once `gate.back` (story) or both
  `gate.cleared.s1/s2` hold and `gate.line` is not set; also `ctx.levels.current.startLine()`. Activates `vigil_2`,
  toasts `tut.line`. `ctx.objectives.line` is the controller; objective id `line` (0 … 100, `obj.line`).
- Repair 100/240 %/s; `paused` (payload `paused: true`, `frozen: true`) while any enemy is within 4 m (horizontal) of
  the winch; `frozen` while the pin is stolen. Waves from `config.LINE` fire once each (a jump over several fires them
  in order): W1 at once, W2 20 %, W3 45 %, CS-08 at 70 %, G-02 at 85 %, then a trickle every 15 s until 100 %.
- **To enemies:** Line enemies spawn on the lanes with `{ line: true, zone: 'line', alerted: true, noCap: true,
  facing: 0, runner, objectiveRunner, goal: [0, 41], objectiveTarget: [0, 41] }`; W2's stealers carry `pinThief: true`
  and the first one `{ look: 'pilfer', id: 'pilfer' }`. When `ctx.enemies.pinThief` exists world leaves the theft to
  you and follows `item:stolen` / `item:returned {item: 'pin'}`; otherwise world steals on proximity itself.
- **To story:** world plays `cs08` (after ≤ 2 alive and no live telegraph, ≤ 10 s, leftovers despawned) and `g02`;
  a scene you start yourself is adopted (`cutscene:start`), so it never plays twice. **World spawns W4** (6 hyena,
  2 runners, + 1 pug) when `cs08` ends and starts the trickle; please don't spawn W4 in CS-08's `end`. 100 % → flag
  `gate.line`, the portcullis drops and lifts (your `gate_open` scene says the lines and plays the clank), and the
  causeway arena locks 4.8 s later. Pip's pin return emits `item:returned {item: 'pin', by: 'pip'}`. Dying keeps the
  progress and brings back only the current wave.

### Other services (additive)
- `ctx.levels.activateVigil(id, { silent })` lights a Vigil Stone (CS-04 → `vigil_3`).
- `ctx.objectives.counter(id)` / `COUNTERS`: `treetop_ropes`, `lanterns` (flag `town.lanterns`), `keys` (flag
  `keep.keys`); `ctx.objectives.block(id, on)`; `start(id, { flag })` sets that story flag when done.
- Open zones can emit `arena:clear {id, open: true}` (`clearEvent: true`: the town `bakery`, so story plays D-03) and
  always call `ctx.companions.markCleared(id)` (Marmalade's `appearOn: 'bakery'`), also on loads where the zone was
  already cleared.
- Arena waves accept `extra.at`: `'center'` or `[x, z]` (the town's giant jelly rises from the fountain).
- Kitten zones pass `zone.opts` through to `spawnKitten` (gate: `tater` with `{ cage: 'cart', size, hits: 3 }`,
  `mittens` with `{ cageWith: 'tater' }`); companions' `rescues.js` places Pip, Sage, Marmalade, Tofu and Clover.
- **To companions:** the forest boulder `hollow_boulder` (Bright / Holy only) calls `ctx.actors.get('pebble').reveal()`
  when it breaks. The Toffee zone passes `y: 1.9` (the statue top 2.5 minus the fountain rim 0.6 that `groundY`
  finds under her).
- **To ui:** hub interactables are `station_<id>` (kind `station`: bakery, forge, library, barracks, lookout,
  wardrobe), `quest_board` (kind `questboard`) and `npc_snowpaw` / `npc_coo` (kind `talk` → `story.hubTalk`); each
  is enabled by its §12.5 flag (`Hub.STATIONS`, `stationOpen`). The South Gate box (0, −63) calls
  `ui.openQuestBoard()` once `town.free`. `ctx.levels.current.hub.board()` / `.next()` are world's pure versions of the
  board data (`Hub.questBoard`, `nextLevel`).
- **To audio:** lantern lighting plays `lanternLight` (3D); mushroom caps 2 / 4 emit `fx:burst {kind: 'bounce'}`;
  world no longer plays the portcullis or horn sounds (story cues). Gate `music.combat` is `battle_fast_fight_loop`.
- **To fx:** the Lantern Alley lanterns use `ctx.fx.lantern(pos, { lit: false })` + `.light()` (no fx light); world's
  own flames (campfire, rat-camp torches, gate torches and braziers, the forge hearth) are `Dressing.addFlame`, and one
  `LightPool` of 2 PointLights per level follows the nearest lit ones (the light count never changes mid-level). The
  forest fireflies are yours (world's own Fireflies class is not used by any level).
- **To camera:** town houses now have box colliders (shrink 0.86). The gate castle pieces and the town terrace are
  merged stone meshes (`merged:castle`, `merged:terrace`, not fadeable); fences, street lanterns and trees fade.
