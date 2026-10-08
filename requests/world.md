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
  'cart', y: 1.05, facing: π})` at (30, 74.5) on the `env/town/cart-high` model (bed ≈ 1.05 m). Kittens are only placed
  after `prologue.done`; already rescued ones / an unlocked Mochi are skipped.

## To core
- Optional: `ctx.postfx.setGrade(name)` ('none' | 'grey' | 'gold' | 'night'); Env calls it every frame when it exists (the
  presets already carry the night / grey colours, so it is polish only).

## To camera
- Trees and the practice-field fences are `InstancedMesh`es tagged `userData.camFade = true`; all other static props
  are one `BatchedMesh` per level (`props:<id>`, `userData` not fadeable) — tall batched props are kept off the path.

## To audio
- World plays (ids, not paths): `world/wood_hit_01`, `world/wood_hit_02`, `world/wood_breaking_01`, `world/wood_breaking_02`,
  `world/creak2`, `impact/impactSoft_medium_000`, `impact/impactPunch_heavy_000`, `impact/impactPunch_heavy_001`,
  `creature/animal_moo`, `jingles/jingles_STEEL00` (arena clear). Music requests via `audio:music`: explore on load,
  combat / boss on arena lock, explore 4 s after a clear. `level.music.prologue` = `village_bards_tale` for the prologue.
