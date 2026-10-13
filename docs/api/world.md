<!-- Archived from requests/world.md by core at the M2 integration pass (2026-10-09): the M1 API notes and requests of this area.
     Open items were moved to requests/world.md; applied ones are summarised in requests/RESOLVED.md. -->

# Requests / notes from the world area

## How to use ctx.levels / ctx.env / ctx.objectives (M1, 2026-10-08) — story, ui, companions, enemies, audio, fx, camera
Frozen contract unchanged: `levels.load(id, spawnId)`, `current`, `loading`, `anchor(name)`, `arenaNear(pos, maxDist)`,
`setVisible(group, on)`; `env.set/contribute/clear/preset/fogDensity`; `objectives.start/progress/freeze/complete`.
Additive (world):
- `ctx.levels.arena(id)` → Arena (`lock()`, `clear()`, `reset()`, `locked`, `cleared`, `wave`, `enemies`, `aliveCount()`).
- `ctx.levels.exit(to, spawnId)`: flag `<level>.done`, `state.levels[id]` best rank/time, `level:exit` + `level:results`
  (`{levelId, time, kittens, kittensTotal, letter, fish, lives, livesLost, rank}`), then awaits `ui.showResults(payload)`
  if it exists (else 1.5 s), then loads `to`. Exit boxes call it.
- `ctx.levels.results()` (the payload), `ctx.levels.interact(id)` (use an interactable as if E was pressed),
  `ctx.levels.setDawnstone(on)`, `ctx.levels.spawnProp(name, [x, z], { y, yaw, scale, opts }) → Promise<Object3D>` /
  `despawnProp(obj)` (characters' `buildProp`: signpost, post_bag, cot, soup_bowl, lantern... placed on the ground).
- `setVisible` groups: `terrain`, `props` (also the instanced trees / fences), `grass`, `water`, `skyline`, `dawnstone`, `pickups`.
- `ctx.levels.current` (a `world/Level.js` Level): `id`, `def`, `spawnId`, `root`, `groups`, `heightfield`, `colliders`,
  `octreeMeshes`, `spawns`, `anchors`, `arenas`, `vigils`, `actors`, `critters`, `pickups`, `water`, `bounds`, `music`,
  `waterLevelAt(x, z)`, `isDeepWater(x, z, y)`, `surfaceAt(x, z)` ('grass' | 'dirt' | 'stone' | 'wood' | 'water'),
  `critter(id)`, `actor(id)`, `heightAt(x, z)`, `buildProfile` (ms per build stage).
- `ctx.objectives`: also `add(id, n)`, `set(id, v)`, `get(id)`, `list`, `clear(id)`; `start(id, { max, value, textKey,
  rate, needClear })` — `needClear: arenaId` keeps it at max until that arena is cleared (the glade's net ropes).
- Every level-built prop that takes hits is an Actor in `ctx.actors` with faction 'neutral', `breakable = true`, tag
  'prop' + its kind: 'dummy' (3 straw dummies, never break), 'wobble_knight', 'sack' (not hurtable), 'boulder' (breaks
  only with `def.breaks: ['cracked']`), 'crate' (1 hit → 1–3 fish, 2 per level also drop milk), 'rope_post' (30 HP).

## To story
- **Triggers that call `ctx.story.play(id)`** (play mode, on entry, once): meadow `tallbert` → `g01` and `lane` → `cs02`
  (both `when: 'prologue.tutorial && !prologue.done'`). Interact (E) at the picnic hay bale (0, 16) → `cs03` while
  `prologue.done && !meadow.pudding`. Exit boxes → `ctx.levels.exit(...)` (forest's needs `forest.boss`).
- The glade arena locks itself on `cutscene:end {id: 'cs03'}` (zone `lockOn: 'cs03:end'`) and again on reloads while
  `meadow.pudding === 'netted'`; your `arena` step may also call `ctx.levels.arena('glade').lock()` (idempotent).
- Rope posts (−2,24), (6,24), (2,28) appear when flag `meadow.pudding` becomes `'netted'` — set it with
  `ctx.story.flag()` so `story:flag` fires. Each cut post adds 1 to objective `net_ropes` (world starts it if your
  `objective` step hasn't: max 3, textKey `obj.ropes`, `needClear: 'glade'`). **Please play the Pudding "I'll follow"
  beat on `objective:progress {id: 'net_ropes', done: true}` and set `meadow.pudding = true` then** (companions free him
  on that flag).
- The practice-field gate (north gap, (0, −60)) opens when flag `prologue.tutorial` is set via `story.flag`.
- CS-02 shot 2: `ctx.levels.setDawnstone(false)`; it also stays off on every load once `prologue.done`.
- Tutorial hooks (meadow practice field): straw dummies (−5/0/5, −76) tag 'dummy'; the swinging sack (8, −84) applies
  `ATTACKS.sack_swing` (`combat:hit` with `attacker.kind === 'sack'`); the Wobble Knight (0, −86) swings
  `ATTACKS.dummy_swing` every 2 s with a white glint (`combat:telegraph` kind parry), blocks come back as
  `combat:hit {blocked: true}` with `attacker.kind === 'wobble_knight'`, parries as `player:parry {attacker}` (it spins);
  its first glint calls `game.slowMo(0.25, 0.5)` once; the cracked boulder `practice_boulder` (−10, −84) breaks on a
  Bright / Holy slash (it leaves `ctx.levels.current.actors`); the sleeping cow `ctx.levels.current.critter('cow_practice')`
  wakes on her Meow within 10 m (moo, `Idle_HitReact1`, walks 6 m east; `.woke === true`) — Pearl is yours.
- Meadow anchors: `bell_far` (y 30), `crane_bell`, `crane_field`, `horde_a/b`, `pud_1..4`, `practice_gate`, `barn_door`,
  `chart` / `chart_front` (height chart), `squires`, `fence_steps`, `tallbert`, `g01_mark` (4, −59.5, facing −Z), `lane`,
  `lane_post`, `picnic`, `cow_practice`, `cow_fields`, `stones_centre`, `bridge_mid`, `bridge_cage`, `fog_edge_0..7`.
  Spawns: `title`, `practice`, `start`, `boss`, `vigil_1..3` (every Vigil Stone is also a spawn id).
- Strings used for interact prompts: `tut.vigil` (Vigil Stones) and `prompt.picnic` — please add `prompt.picnic`
  ("Sit for a Milk Break [E]") and a generic `prompt.interact` ("[E]") to strings.js.

## To ui
- Please implement `ui.showResults(payload) → Promise` (resolves when the player continues); `levels.exit` awaits it.
- Interact prompts: `interact:available {target: {id, kind, position}, prompt: <strings key>}` / `interact:clear`.
- On `checkpoint {levelId, spawnId, position, facing}` §7.6 also opens the companion swap.

## To companions
- `spawnKitten` calls from the meadow: noodle `('meow', {prop: 'barrel'})` at (−30, −26); button `('stand', {standTime: 3,
  zoneR: 1.2, needClear: 'stones'})` at (−20, −4); biscuit `('meow', {})` at (41.5, 30) behind the Crow Fields cow critter
  (`cow_fields`, wakes on Meow and walks 6 m north); mochi `('cage', {hp: 30, needClear: 'bridge', play: 'd01', cage:
  'cart', facing: π})` at (30, 74) — no `y`, so you build the whole cage cart (as asked). While Mochi is caged our
  `cart-high` there is hidden and its collider removed; it only stands as the empty cart once he is in the party
  (`state.companions.unlocked` has 'mochi' or flag `meadow.mochi`). Kittens are only placed after `prologue.done`;
  already rescued ones / an unlocked Mochi are skipped.

## To core
- Optional: `ctx.postfx.setGrade(name)` ('none' | 'grey' | 'gold' | 'night'); Env calls it every frame when it exists (the
  presets already carry the night / grey colours, so it is polish only).

## To camera
- Trees and the practice-field fences are `InstancedMesh`es tagged `userData.camFade = true`; all other static props
  are one `BatchedMesh` per level (`props:<id>`, `userData` not fadeable) — tall batched props are kept off the path.
- Tree trunk colliders now carry `camFade: true` (as asked).

## To audio
- Hit sounds: every level PropActor has `material` (`dummy`/`sack` straw, `wobble_knight` armour, `crate`/`barrel`/
  `rope_post` wood, `boulder` stone) and world plays no hit sounds of its own any more. Barrels are `kind: 'barrel'`
  (crates `'crate'`; both tagged `crate`). Breaking emits `fx:burst {kind: 'crate' | 'barrel'}` (your crateBreak); the
  tutorial swingers keep their attack rows on `atk`, not `def`, so `actorTypeId()` gets their `kind`.
- World still plays (ids): `world/wood_breaking_02` (rope post snaps), `world/creak2` (practice gate), `impact/
  impactPunch_heavy_001` (cracked boulder), `creature/animal_moo` (cows), `jingles/jingles_STEEL00` (arena clear).
- Music via `audio:music`: on load the first `level.music.byFlag` [cond, track] row that holds, else `explore` — meadow
  plays `village_bards_tale` while `!prologue.done`, then `field_of_dreams`; combat / boss on arena lock; explore 4 s
  after a clear.

## M1 update (2026-10-08, world)
- Crossroads: the drystone walls now follow the carved lane 4 m to its sides (they used to stand on the path) and stay
  out of the Standing Stones arena; the `rat_xbow` perch moved onto the south-west wall top: (−25.35, −32.45), y 1.2.
- `enemy:died`: Pickups drops exactly the payload's `fish` / `smallHeart` (as enemies asked); a numeric boss `fish` row
  drops gold fish (value 10).

## To fx
- Ambient mist cards cut a hard horizontal line where a card meets the ground (very visible on the flat practice field
  in the day preset: a lighter band above the line, darker grass below). A soft-particle fade (compare the card's depth
  with the scene depth over ~1 m) or a vertical alpha ramp on the card's bottom 30% would hide it. Repro:
  `?test&level=meadow&spawn=start`, set flag `prologue.done`, reload the level, stand at (9, −64) facing yaw 2.5.

## To story (M1 update)
- Crow Fields hints are shown by world (§12.3 triggers column): `tut.pounce` on the first `enemy:alerted` of a crow and
  `tut.reflect` on the first `combat:telegraph` of a rat_xbow, as `ui:toast {text, icon: 'hint', key}`, once per save
  (flags `seen.tut.pounce` / `seen.tut.reflect`, set before the toast). If tutorial.js takes them over, check / set the
  same flags and we never double up.

## To core
- `core:boot` fails now that real assets load: `Assets` emits `ui:progress` once per URL (195 of the 200 ring-buffer
  slots right after boot), so `game:ready` / `level:loaded` scroll out of `__GAME__.events`. Throttle `E.PROGRESS`
  (e.g. every 5 % or 100 ms, plus the last one) or keep `ui:progress` out of the ring buffer.

## M1 review fixes (2026-10-09, world)
- Meadow exit is gated on Mochi (`meadow.mochi` or `companions.unlocked` has mochi). Early arrival shows `ui:toast`
  with key `exit:blocked` on every entry. **To story:** please add the string `toast.exit.mochi` ("Mochi is still caged
  at the Old Bridge!"). Until then the zone passes that English text as `blocked.text`. Once the key exists, world will
  switch it to `blocked.toast` (LevelKit already looks the key up through `ctx.strings`).
- Arena waves (and arena bosses) now spawn with `alerted: true`. **To player:** `MemeCamTrigger.canIdleTrigger()`
  should also return false while any arena is locked: `ctx.levels.current?.arenas?.some((a) => a.locked)`.
- Open-fight zones: when every enemy of a zone is down, world sets the flag `<level>.cleared.<zoneId>` (for example
  `meadow.cleared.crowfields`), which is saved with the flags. A cleared zone never respawns. When the level loads at a
  Vigil Stone (Continue), spawn groups within 17 m of that stone stay away for that load. **To save:** nothing to do;
  these are plain boolean flags.
- Meadow spawn `start` moved to (−1.5, −54.5), yaw −0.4, so the first view of Chapter 1 no longer looks through the
  practice-field fence and gate post. It stays clear of the `lane` trigger (cs02).
- Wobble Knight: it only glints and swings when she is within 2.4 m, and the strike lands up to 2.8 m. Between swings
  it hops toward her (up to 2.6 m from home) after a block pushback. The slow-mo parry hint now fires only while
  `ctx.story.tutorial.log.step.id === 'parry'`.
- §18 budget, world side: Med and Low use a 3-tri grass blade (High keeps 5). The ground is drawn in 2 × 2
  frustum-culled tiles; on Med, tiles more than 34 m from the camera use half resolution. Low draws the whole ground at
  half resolution in one call, with 40 % of the horizon tree line and half the wheat. Measured at meadow day, level
  share only: Med 37 calls / 291k tris, Low 21 calls / 92k tris. Whole frame: Med 152 calls / 683k tris, Low 105 calls
  / 235k tris. The rest of the overrun is outside world:
  **To characters / player:** hero fur shells on Med, plus a shells-off LOD beyond about 8 m (furHead is 89.5k tris on
  Med; kitBody + furTail are 89k even on Low).
  **To enemies:** keep the 11 pre-placed Chapter 1 enemies that are not engaged dormant, with no mixer and no draw.
- **To characters:** `tufts` SkinnedMesh on `kitten:swordcat` and `kitten:mochi` has NaN positions
  (`computeBoundingSphere(): Computed radius is NaN`, three console errors per meadow load).

## M1 review fixes, round 2 (2026-10-09, world)
- Arena clears are saved: `arena:clear` sets the flag `<level>.cleared.<arenaId>` (e.g. `meadow.cleared.stones`), and
  the bridge also counts as cleared once `meadow.mochi` is set (or Mochi is unlocked). On load such an arena starts
  cleared with no `arena:clear` event. **To companions:** world adds the id to `ctx.companions.cleared` (the Set
  `spawnKitten` reads for `needClear`) before the kittens spawn. Please add a public `markCleared(id)` that does the
  same; world already calls it when it exists.
- Placed fish lines and crates are saved: flags `<level>.fish.<lineIndex>` and `<level>.crates.<k>` hold bitmasks
  (numbers) of the fish collected and the crates broken. **To save:** these are plain numeric flags, nothing to do.
- Results run stats live in `state.levels[<level>]` as `runT0` (state.playtime at entry), `runLost` and `runFish0`.
  Continue and game-over Retry carry on the same run. `levels.exit` removes them for the level it leaves and the level
  it enters. **To save:** keep these numeric fields in the level records (sanitize already keeps primitives). **To
  ui:** `level:results.time` is now playtime seconds since the level's normal entry.
- Night hero light: Env has a warm point light (`env:hero`) at her, used by the night presets (`hero: 1`). It is
  always in the scene (intensity 0 by day), so the light count, and with it the shader programs, never changes.
- Shader warm-up: LevelManager warms every enemy variant the level can spawn (arena waves, open zones, `def.warm`
  rows for cutscene casts), a fog wall and the spawn poofs. The compile now targets the composer's render target,
  because a canvas-target compile only built sRGB / tone-mapped variants that were never used. Then 2 frames run under
  the veil with frustum culling off, which also builds the shadow-depth variants. **To enemies:** please add
  `prewarm(list, at)` with list `[{ type, opts }]`. It should build hidden, dressed stand-ins (alert "!" included)
  without emitting `enemy:spawned`, and resolve to a cleanup function or to the stand-ins. Until then world uses
  `spawn(type, pos, { ...opts, ai: false, noCap: true })`, skips bosses and boneheads, and keeps each stand-in's model
  detached until unload so its programs stay alive.
  **To combat:** the crossbow bolt's trail ShaderMaterial (`projectile:bolt`) is still compiled on the first shot
  (1 program, the only one left mid-fight in the meadow). Please add the pooled projectile meshes to a warm-up like
  FX `_warmBegin`, or expose them so world can warm them.


---

# M2 notes (archived from requests/world.md by the M2 integration pass, 2026-10-09)


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

## Controls rework (research/CONTROLS_SPEC.md §4, §11, §12 world)
- **Level camera data:** `level.cam = { yaw, fog: { clear, clearCombat, topMul, <preset>: {...} }, light: { <preset>:
  { hemiMul, sunMul, envMul, hemiSky, hemiGround, sunAz } } }` (meadow / forest / town yaw π, gate yaw 0, bog / keep
  rows for M3). Env mixes the light row in with the focus-fog mode (eye-level shots keep the authored look). The night
  rows (meadow_night ×2.4, forest_night ×3.2–3.4 moon / hemisphere, lifted cool sky fill) keep the ground ≥ ~12 %
  luminance 8 m from her from above.
- **Arena look:** `ARENA.wall` = fog-wall opts passed to `fx.mistRing` (`alpha` 0.35, `width` 3.5; `bandW` 1.2 /
  `bandA` 0.12 once fx honours them). `level.cam.fog` is the level's own copy (`arenaAwareFog`): its `mist` (fx
  GroundMist's per-level factor) drops to `ARENA_MIST` 0.3 while an arena is locked.
- **Gate deck:** `texturedMaterial(…, { joint, jointLo, jointHi })` lifts a map's dark joints toward a pale mortar; the
  causeway uses gain 2.45 (×1.27) + joint 0.38, with a pale kerb inside the parapets and rims on the ledge drops.
- **Zone hints:** `zone.cam = { yaw?, pitch?, dist?, clear? }`, optional `camIf` (flag expression); zones of
  `kind: 'camera'` are hint-only. `level.zoneAt(pos)` (pure `isoView.pickZone`: hint zones first, then the smallest,
  1.5 m hysteresis), `level.camZone`. World calls `cam.setHint({ yaw, pitch, dist, clear, zone }, blend)` on a zone
  change once no alerted hostile has been within 10 m for 2 s (snap at load and with *Reduce camera motion*); a
  camera that reads `zoneAt` itself sets `cam.zoneHints = true`. Env applies `clear` itself.
  Hints: meadow practice 12, stones / glade / Crow Fields / bridge 15; forest Mushroom Ring (yaw 1.75, 44°, 11 m,
  clear 7), Spider Hollow 12, Treetop (38°, 10 m); town square 16, hub 15 (`town.free`); gate The Line (17 m, 56°,
  while it can run), the raft view 14.
- **`level.memeSpot`** `{ at, yaw, r }`: meadow Tallbert knoll, forest Mushroom Ring, town fountain, gate rampart, bog pool.
- **Nav data** (physics reads it): `level.navLinks` (meadow fence `kind: 'fence'`, `when: 'tut.jump.done'`, gate line
  along the fence; Treetop root ledges ground → step → ledge; Stump Crossing bank → 6 stumps → bank, ends inset 0.5 m
  inside the stump tops; Waffles' crate steps → balcony), `level.navBlock` (rects).
- **Occlusion tags:** `place(..., { camFade: 'roof' })` splits a building template into body + roof faces
  (`Props.splitRoofTemplate`: up-facing triangles above 42 % of the height) and lists the roof instances in
  `batch.userData.camFadeRoofIds`; `camFade: 'solid'` and the §11 camera-side clutter audit (> 2.2 m within 6 m
  camera-side of the spine / an arena centre; `level.audit.clutter`) go to `camFadeSolidIds`. `camFade: true` (town bunting) goes to `camFadeIds` (capsule fade only). Trees are
  `camFade: 'crown'` with `userData.crownFrac` (`Props.crownFraction`). Gate: `merged:gate_towers` and
  `merged:gatehouse` (+ the arch) are `'solid'`; B1 pillars, town towers / castle / South Gate / Bell Tower solid.
- **Far group:** `levels.setVisible('far', true | false | null)` (sky dome, skyline, Dawnstone); null = automatic,
  hidden while the fog mode is iso.
- **Interact:** `level.interactables` entries `{ id, kind, pos, r, enabled(), use(), usePos? }`; with two in reach E
  prefers `player.hover`. PropActor `assistable` (= breakable).
- **Look:** grass tiles and LOD follow `cam.focus` (near tile 36 m, blades ×1.25 wider), ground under grass −10 %;
  wheat trample field (`Wheat.TRAMPLE`: her + 4 enemies, bend within 1.4 m, flatten to 40 % within 0.9 m); shadow box
  16 m (boss 20 m) around the focus; the gate deck bricks ×1.1; bounce caps carry an up-arrow facing screen-up.

## PERF §1.2: world program consolidation
- `Props.js` `worldStatic(m)` → feature uniforms of ONE Lambert patch (`world-static-v1`): `uWDetail` (detail noise),
  `uWInk` (ink rim, 1 = off), `uWStone` (dressed stone), `uWGround` (ground noise / specks), `uTreeH` + `uTime` /
  `uWind` (tree canopy shading + sway). `worldMaterial()` installs it (all off); `withDetailNoise`, `applyInkRim`,
  `makeStoneMaterial`, `makeGroundMaterial`, `makeTreeMaterial` only set uniforms (no key variants). A material with
  another hook (bunting, wheat, grass, water) keeps its own key; `applyInkRim` composes there as before.
- `Dressing.texturedMaterial`: mix / gain / joint lift / contrast are uniforms (`world-tex-v2`, `m.userData.texU`).
  Flames, flame halos and fireflies are fx modules (`Dressing.js` is imported at boot by LevelManager so they link before
  the first compile); the halo colour is the `aGlowCol` instanced attribute (not `instanceColor`).
- Pickups: hearts carry a white `instanceColor` (they share the fish program); plain pickups (heart bell, milk, letter)
  are vertex-coloured `worldMaterial`s. Critters (`PropActor` merged skinned) draw with one shared skinned WarmToon
  (`userData.noDispose`; `disposeOwned` skips such materials). Vigil glow sprites and the town lantern glow are unfogged
  (one sprite program); the vigil flame and the far silhouettes are `fxBasicMaterial`s; the sky is an fx module.
