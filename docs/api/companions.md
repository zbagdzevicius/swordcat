<!-- Archived from requests/companions.md by core at the M2 integration pass (2026-10-09): the M1 API notes and requests of this area.
     Open items were moved to requests/companions.md; applied ones are summarised in requests/RESOLVED.md. -->

# Requests / notes from the companions area

## How to use ctx.companions (M1, 2026-10-08) — world, story, ui, player, enemies, combat, audio
Frozen contract unchanged (§19.3): `active` (Companion[]), `setActive(ids)`, `spawnNpc(id, pos, facing)`,
`spawnKitten(kittenId, pos, hide)`, `pudding`. Everything below is additive. `pos` may be a Vector3, `[x, z]` or `[x, y, z]`;
y 0 means "on the ground here" (terrain or a bridge deck).

### Party
- `setActive(['mochi'])` (max `COMPANIONS.maxActive`; unknown ids are ignored) mirrors `state.companions.active`, unlocks the
  id and emits `companion:changed {active}`. The flags `meadow.mochi` / `forest.sage` / `town.clover` (§19.7, via
  `story.flag`) unlock and add the squire too. `unlock(id)`, `useAbility(i = 0)` (Q / LT is read here; touch portrait →
  `useAbility(0)`), `get(id)`, `milkBonus` (Mochi's +1, the player already reads it), `kittens`, `bark(actor, category)`.
- Companions are registered in `ctx.actors` under their id (`actors.get('mochi')`) and survive level loads (re-placed beside
  her on `level:loaded`; a full `level:unload` → `level:loaded` keeps them).

### For ui (HUD portrait, §9.1 / §14.2)
- `const c = ctx.companions.active[0]`: `kittenId`, `readiness` (0..1 for the radial ring), `cooldown` (s left), `cfg.cd`,
  `napT` (> 0 → "zzz" portrait), `hp` / `maxHp`, `stateName` (`follow | idle | engage | attack | ability | nap`).
  Events: `companion:changed {active}`, `companion:nap {kittenId, on}`, `companion:ability {kittenId, ability, position}`.
- Speech bubbles, the napping "zzz" and the lost-kitten lines are world-space sprites drawn by companions (no UI needed).

### For world (LevelKit zones → spawn calls)
- `{ kind: 'kitten', kittenId, at, hide, prop?, standTime?, needClear?, y? }` →
  `ctx.companions.spawnKitten(kittenId, at, hide, { prop, standTime, needClear, zoneR, y, facing })`.
  - `hide: 'meow'` + `prop: 'barrel' | 'bush'`: we build the hiding prop (wobbles every 6 s). `prop: 'cow'` (Biscuit): your
    placed cow handles `meowWakes`; the kitten reveal on the same Meow is ours (radius `PLAYER.meow.kittenRadius`).
  - `hide: 'cage'`: we build the cage and its lock (a `neutral`, `breakable`, tag `prop` actor; only her blows count; 3 hits,
    or `hp`). `needClear: '<arenaId>'` keeps the lock out of play until `arena:clear {id}`.
  - `hide: 'stand'`: a 3 s planted Stand within `zoneR` (1.2) of `at`, no enemy within 15 m (+ `needClear`). Her Stand
    turning into Meme Cam after 2.5 s (§7.8 manual trigger) keeps counting — "I thought you were a statue".
  - `hide: 'break'`: revealed by a slash whose ATTACKS row has `breaks: ['cracked']` near it (we listen to `player:swing`),
    or call `kitten.reveal()` when your cracked-boulder PropActor breaks.
  - `hide: 'climb'`: give the perch height as `y` (or a 3D `at`).
  - Already-rescued kittens (and squires already in the party) don't come back on a reload; their barrel / opened cage stays.
- Squire rescue (`bridge` zone `rescue: { companion: 'mochi', cage: [30,74], hp: 30, play: 'd01' }`) →
  `ctx.companions.spawnKitten('mochi', [30, 74], 'cage', { needClear: 'bridge', hp: 30, play: 'd01', facing: Math.PI })`.
  Without `y` we build the whole rat cage cart (Kenney `env/town/cart.glb` fitted to 2.0 m + bars on its bed + a box
  collider). **With `y` (the meadow passes `y: 1.05` on its own `cart-high`) we add only the bars at that height** — no
  second cart, no collider; the caged kitten is pinned inside the bars (your cart's box collider can't push it out).
  When the lock opens Mochi hops out toward her onto free ground (`physics.blockedAt` / deep water / bounds checked),
  `story.play('d01')` runs, then he joins the party where he landed. Smoke `companions:meadow` walks this in your meadow.
- CS-03 net: Pudding listens to `objective:progress {id: 'net_ropes', value}` (a tether drops per cut rope, in your post
  order (−2,24), (6,24), (2,28)) and to flag `meadow.pudding` (`'netted'` → the net; `true` → he sniffs, nods, flies to the
  `pud_1..4` anchors). On a reload with `'netted'` / `true` he comes back netted / perched by himself, and also after
  any `cutscene:end` in the meadow that left no Pudding (a scene that despawns its own Pudding at its end is fine).

### For story (cutscenes)
- `spawn` step `{ id: 'pudding', type: 'pudding', at, facing }` → `ctx.companions.spawnNpc('pudding', at, facing)`.
  Pudding: `pose('netted' | 'sleep' | 'perch' | 'idle' | 'free')`, `emote('nod' | 'shake' | 'tailPuff' | 'roar')`,
  `play(<S13 clip>, {once})` (`Flying_Idle, Fast_Flying, Headbutt, HitReact, Yes, No, Punch, Death`), `moveTo`, `face`.
  A scripted Pudding makes no sounds of his own (cue them in the cutscene).
- Cats: `spawnNpc('pearl' | 'whiskerbottom' | 'marmalade' | 'snowpaw' | 'earlgrey' | 'pip' | 'tofu' | 'squire_1..6' |
  'villager_<n>' | any CATS id, at, facing)`; `'coo'` is the S1 pigeon (`play('Jump' | 'Yes' | 'No' | 'Dance')`).
  `spawnNpc('mochi', ...)` with Mochi in the party returns (and moves) the companion. Lost kittens / the caged Mochi are
  `actors.get('<kittenId>')` too. Cats map `play('cheer' | 'yes' | 'jump' | 'wave' | 'no' | 'nod' | <pose>)`.
- Please add these keys to `strings.js` (we fall back to the GAME_DESIGN text in `src/companions/lines.js` until then):
  `bark.mochi.ability.1–2`, `bark.mochi.combat.1–2`, `bark.mochi.kitten`, `bark.mochi.idle`, `bark.mochi.caged.1–2`,
  `bark.sage.*`, `bark.clover.*` (same pattern), `bark.companion.nap.1–2`, `bark.companion.wake`, `bark.companion.mrrp`,
  and `kitten.<id>` for the 18 rescue lines (§6.4).
- D-01: we call `ctx.story.play('d01')` when Mochi is out of the cage; its `end` should set `meadow.mochi` (we also add him
  when the promise resolves). The "Mochi joined! [Q] Shield Wall" toast is yours (or ui's).
- `meadow.pudding = true` once the ropes are 3/3 and the glade is clear (§19.7) starts his sniff → nod → lift-off; the
  "(I'll... follow. From a distance...)" line is your dialogue over it (~2.8 s before he lifts off).

### For enemies
- **Taunt** (Mochi's Shield Wall, §9.2): taunted enemies get `tauntedBy` (the Companion) and `tauntT` (s left; cleared to
  `null` / 0 when the wall drops). Please make `targetActor()` return `tauntedBy` while `tauntT > 0 && tauntedBy.alive &&
  tauntedBy.napT <= 0`, so they go for Mochi / the wall. Melee hits on the wall posts already stagger the attacker 1.0 s
  (`stagger(sec)`). **Still open (M1 re-check 2026-10-08):** `Enemy.targetActor()` / `distToPlayer()` only know the
  player, so the taunt is set but has no effect yet (the wall itself already blocks and staggers). Range checks in
  `chaseMelee` should use the distance to `targetActor()` for this to work.
- **Token share** (§9.1, `COMPANIONS.tokenShare` 0.2): when an enemy is granted an attack token and an awake companion
  (`ctx.companions.active`, `napT <= 0`) is within `COMPANIONS.engage` (6 m), attack the companion instead 20% of the time.
- Companions only fight enemies that are `alerted` or in an engaging state (`chase, windup, strike, recover, attack, orbit,
  ...`), within 6 m of her; flyers higher than 1.2 m above the ground are left to Sage. `groundFlyer(sec)` is used by the
  Volley (crows: `def.fly` counts as a flyer even without a `flyer` tag).

### For combat
- Shield Wall posts are fixed `ally` actors (tag `shieldWall`) whose `resolveIncoming` returns `'block'`; enemy swings and
  projectiles that reach them are blocked. Optional: skip a target when `ctx.companions.wallBetween(att.pos, tgt.pos)` is
  non-null (a swing aimed at her from the far side of the wall), so a wide arc can't reach past it.

### For player
- Valor: hitting a cage lock (`breakable`, tag `prop`) currently emits `player:valor` gains; probably skip valor for
  `target.breakable` / tag `prop` targets (world's PropActors too).

### For fx / audio
- Bursts we emit: `sparkle` (reveal, rescue, cage opening, Sage's kitten sense), `poof` (teleports, kittens going home),
  `heart` (slow blinks), `heal` (Clover). Barks call `ctx.audio.babble(kittenId | npcId, text)` (play / memecam only);
  Pudding plays `puddingRoar` and `cat/cat_purractive_loop` (rate 0.6) through `play3D(id, pudding)`.

## → core: tests/smoke/slice.mjs Mochi cage step hides real-input regressions (2026-10-09)
`slice.mjs` (~line 286) resets `m.lock.invulnT = 0` before each `applyHit`. CageLock now ticks its own `invulnT` in
`update(dt)` (it never did, so after the first hit the lock was immune forever and D-01 never played). Please drop the
reset and either swing with real input (stand ~1 m from `m.lock.pos`, facing it, `t.tap('KeyJ')` + ~450 ms per swing,
3 swings for the 30 HP lock) or wait ≥ 0.15 s between `applyHit` calls, so the slice catches this class of bug.
(companions' own smoke `companions:meadow` now opens the cage with real J presses: hp 20, 10, 0.)


---

# M2 notes (archived from requests/companions.md by the M2 integration pass, 2026-10-09)


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


<!-- Archived from requests/companions.md at the controls-rework integration (2026-10-11); applied items are in requests/RESOLVED.md. -->

## Iso controls (research/CONTROLS_SPEC.md §7.5, §7.6, §10.1, §12 companions), 2026-10-11

Everything below is **additive** and already live in `src/companions/**`, coded defensively against the P0–P2 names that
have not landed yet. Nothing needs to change for the game to keep working; each item says what would wire it up fully.

### What ctx.companions offers now
- `useAbility()` / `useAbility(i)`: the smart cast (§7.5). `useAbility({ dir?, point?, mag?, id?, index? })`: an aimed
  cast (world space; `mag` 0..1 of the reach for dir-only aims). Returns true when it fired. No dir / point → smart.
- `aim`: `{ active, kittenId, ability, shape: 'rect' | 'targets' | 'self', valid, source, plan }` while an ability is
  aimed. `plan` = `{ center {x,y,z}, yaw, width, length, range, radius, origin {x,y,z}, dir {x,z}, point {x,y,z},
  targets: Actor[], aimed, valid }`. Shield Wall: a 3.0 × 0.4 m rect at `center`/`yaw`. Volley: a `range` (14 m) ring
  at `origin` plus pips under `targets`. Purr: a `radius` ring around her.
- `aimAbility({ dir?, point?, mag? })`: ui's drag-aim (shows the indicator, updates it on each call).
  `cancelAbilityAim()`: the ✕ chip. `castMode` getter reads `state.settings.castMode` (`smart` | `indicator` | `dragOnly`).
- `cooldownLeft(id?)` (s), `readiness(id?)` (0..1), `canCast(id?)`, `abilityShape(id?)` (`{ ability, shape, range,
  width, length }` for the ranges overlay). `id` = `'mochi'`, an index, or nothing (the first).
- `pickables(out)`: this area's clickable actors. Each has `pickKind` (`'companion'` | `'npc'` | `'kitten'`; null =
  not clickable now: hidden kittens, scripted actors, far-culled NPCs), `useR` (how close a `use` order walks),
  `interactId` (a level interactable it stands for, or null) and `use()`.
  `use(actorOrId)`: what a click / tap does on arrival: `levels.current.interact(interactId)` when set, else
  `actor.use()`. Mochi / Sage / Clover say hello and regroup; NPCs turn and nod; hub residents say their line; a
  revealed lost kitten within reach is rescued; a station keeper opens their station.
- Hub residents clear of world's interactables register a `talk_<id>` interactable in `levels.current.interactables`
  (`kind: 'npc'`, `prompt: 'prompt.talk'`, `actor`, a live `pos`, `r` 1.5), so [Interact] / pad Y talks to them too
  (§14 `tut.talk`). They are removed when the residents leave.
- `COMPANION_ABILITY` payload gains `dir {x,z}`, `point {x,y,z}`, `aimed`, `source` (`smart` | `cursor` | `pad` |
  `touch` | `api`) and `targets` (count).
- LOD (§2.8): lost kittens, NPCs and hub residents measure from `cam.focus` in play (the lens in cutscene presets,
  her position until camera lands).

### To core (P0)
1. `events.js` JSDoc only: `COMPANION_ABILITY: 'companion:ability' // { kittenId, ability, position, dir?, point?,
   aimed?, source?, targets? }`.
2. Input, as read here (please keep these names, or tell me the real ones): `input.aimStick {x, y}` (pad RS, y up),
   `input.virtualAim {x, y, active}` (touch drag-aim, **screen space with y up**, CSS px or normalised 0..1; the setter
   is `setVirtualAim(x, y, active)`), `input.device`, `input.preset`, `input.down/pressed/released('ability')`,
   `pressed('back')` and `pressed('move')` (RMB cancels an aim), `input.haptic('kitten' | 'orderRejected')`.
3. `state.settings.castMode` default `'smart'` (§10.7). Already read defensively.

### To camera (P1)
1. `cam.pick`: include this area's actors. Use `ctx.companions.pickables(out)` (or `actor.pickKind` on any actor):
   `'npc'` and `'companion'` → kind `'npc'`, `'kitten'` → kind `'npc'` too (or a `'kitten'` kind if you add one), in
   the interact / NPC priority tier. Hover ring white (§7.4).
2. Read here: `cam.cursorGround` / `cam.cursorValid` (KBM Q quick cast and the held indicator follow the cursor),
   `cam.focus` (LOD), `cam.stickYaw` (else `cam.yaw`) for drag / stick vectors, `cam.lockTarget` (the selection: Volley
   gives it 2 of 5 arrows).

### To player (P2)
1. `use` order on an actor from `cam.pick`: path to `actor.useR` (or to the interactable when `actor.interactId` is
   set), face it, then call `ctx.companions.use(actor)`. Ability casts keep the order (§5.2): companions never touches
   orders.
2. Companions read `player.aim.dir` (any time it is set) for the ability fallback and to keep the idle kitten out of
   her aim notch, or `player.resolveAim('ability')` if you expose it. Please do not consume the `ability` action:
   companions reads it (tap / hold / release, §6.2–6.4).

### To fx (P3)
1. GroundDecals can draw the kitten ability indicator from `ctx.companions.aim` (shapes above). When it does, set
   `ctx.fx.drawsAbilityAim = true`: companions' fallback `AbilityIndicator` then stays hidden.
2. The ranges overlay (hold Ctrl): `ctx.companions.abilityShape()` gives the active kitten's shape and range.

### To ui (P2/P3)
1. Touch portrait button: tap = the `ability` virtual action (smart cast, works today). Drag ≥ 16 px: call
   `ctx.companions.aimAbility({ dir, mag })` on each move (world dir through the camera yaw, `mag` = drag ÷ 90 px), or
   feed `input.setVirtualAim(x, y, true)` while the `ability` action is held. Release: `useAbility({ dir, mag })` (or
   release the action). ✕: `cancelAbilityAim()`. A drag back inside 16 px is a cancel for abilities (§9.4): call
   `cancelAbilityAim()`.
2. Ability bar Q slot (§10.1): `cooldownLeft()`, `readiness()`, `canCast()`, "zzz" while `active[0].napT > 0`.
   In `mouseOnly`, a click on the slot = `useAbility()`.
3. Cursor (§10.2): "paw + wax seal" over `pickKind` `'npc'` / `'companion'` / `'kitten'` (from `player.hover`).
4. The blocking rotate card (C8) still covers the portrait game; `companions:touch` hides `.ui-rotate` itself until it
   becomes the one-time toast.

### To characters (P3/P4)
1. §2.8 fur LOD: `Fur._lod` measures from `camera.position`; the companions' `KittenView`s (Mochi, Sage, Clover, NPCs,
   kittens) follow whatever you switch it to (`cam.focus`, one `furShells` tier down beyond 12 m). Nothing to do here.
