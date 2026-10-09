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
