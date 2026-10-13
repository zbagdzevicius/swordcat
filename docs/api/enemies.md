<!-- Archived from requests/enemies.md by core at the M2 integration pass (2026-10-09): the M1 API notes and requests of this area.
     Open items were moved to requests/enemies.md; applied ones are summarised in requests/RESOLVED.md. -->

# Requests / notes from the enemies area

## How to use ctx.enemies (M1, 2026-10-08) — world, story, companions, player, fx, audio, ui
Frozen contract unchanged: `spawn(type, pos, opts) → Enemy`, `spawnWave(list, points)`, `despawn(e)`, `list`, `boss`.
Everything below is additive.

### spawn(type, pos, opts)
- `type`: `rat_pike`, `rat_xbow`, `crow`, `hyena` (full M1 AI for the first three), base versions of `spider`, `stealer`,
  `pug`, `warhound`, `bat`, `hornet`, `bonehead:<minion|warrior|rogue|mage>`, `jelly` / `jelly_l|m|s|giant`, bosses
  `boss_<grizzlechop|cacklejaw|brutus|barkus>` (phase runner + Dizzy + hpFloor; their move sets land in M2/M3), and the
  CS-02 cast `cacklejaw`, `pilfer`, `barkus_silhouette`. Unknown ids spawn a generic grunt with a warning.
- `pos`: a Vector3, `[x, z]`, `[x, y, z]`, `{x, z}`, an anchor name or anything with `.pos`. The feet snap to the ground
  below (terrain, prop tops, architecture) unless the given y is higher (bridges, the Bell Tower anchor).
- `opts`: `facing` (default: toward her), `id` (cutscene actor id → `ctx.actors.get(id)`), `y` (height above the ground:
  `{ y: 1.2 }` puts a crossbowman on a cart/wall → **perched**: it never leaves the spot, only turns and shoots; it
  stands on the nearest walkable top of about that height within 2.5 m — wall, cart bed, hay bale — else it hovers at
  ground + y), `patrolRadius` (Appendix B.1 zone patrol radius; overrides the row's default; crows spread their r 5
  circles over it),
  `runner` (objective runner, tag `runner`), `scripted` (cutscene actor from the start), `ai: false` (never thinks),
  `alerted` (spawns already fighting), `cage: 'pearl' | true | '<cat id>'` and `word` (hyena dressing), `home`, `noCap`.
- **§8.3 budget**: at most `ctx.quality.maxEnemies` (8, Low 6) AI enemies alive **per fight** (the enemies within 30 m
  of the spawn point plus every alerted one; an idle squad in another zone never holds back an arena wave; `countNear(pos)`).
  Extra spawns wait **dormant**
  (invisible, not registered in `ctx.actors`, not hurtable) in `ctx.enemies.pending` and wake with a `fx:burst {kind:
  'spawn'}` as slots free. Dormant enemies are `alive` and in `list`, so an arena's alive count keeps waiting for them.
  Scripted / AI-less / cutscene actors and bosses never count and are never held back.
- Helpers: `count(filter?)` (default: budget-counted enemies), `byType(type)`, `alertNear(pos, r)`, `clear()`, `cap`.

### spawnWave(list, points)
- Zone entries (Appendix B.1): `[type, n, [x, z], spread, opts?]` → n spawns scattered within `spread` m of the point.
- Arena / Line entries: `[type, n, opts?]` (or `{type, count, at, spread, ...opts}`) over `points` (Vector3 / `[x, z]` /
  anchor names) round-robin; members sharing a point fan out on a golden-angle spiral (0.9 m rings).

### Enemy fields other areas may read
- `alerted` (Meme Cam "no alerted enemy within 20 m"), `stateName`, `type`, `def` (`def.height` > 2 → the tail puff),
  `objectiveRunner`, `dormant`, `isDizzy` / `critTaken` (bosses), `perched`, `flying`, `grounded` (crow pecking).
- Methods: `setState`, `telegraph(kind, desc)`, `stagger(sec)`, `onParried(by, {gold})`, `onBlocked`, `interrupt()`,
  `alert()`, `groundFlyer(sec)` (Sage's volley: crows drop and peck for `sec`), ScriptedActor API.

## To world (LevelKit / Arena / Pickups)
- **Crossroads perch is 1.8 m off its wall** (found 2026-10-08, tests/shots/enemies/level-crossroads.png): the
  `['rat_xbow', 1, [-24, -33], 0, { y: 1.2 }]` spawn lies 1.78 m from the wall run `[[-19.0, -36.4], [-25.8, -27.9]]`
  (at x −24 the wall is at z ≈ −30.15). Enemies now snap a `{ y }` spawn onto the nearest walkable top within 2.5 m, so
  it stands on the wall today, but please put the spawn on the wall line (its nearest wall point is `[-22.6, -31.9]`) so it doesn't rely on the snap.
- LevelKit passes `home: (x, 0, z)`: fine (enemies keep a separate perch height), and `patrolRadius` is now honoured.
- `enemy:died` carries `{ enemy, type, position, fish, smallHeart, height }`: `fish` is already rolled from the row's
  range (seeded), `smallHeart` from `PLAYER.smallHeart.chance` — drop exactly those.
- Perched shooters: pass the cart/wall height as `opts.y` (Appendix B.1 `{ y: 1.2 }`); they stay put without a collider.
- Enemies clear themselves on `level:unload`.

## To story (CS-02 cast; Cutscene `spawn` steps with an enemy `type` → `ctx.enemies.spawn`)
- `ctx.enemies.spawn('cacklejaw', pos, { id: 'cacklejaw', facing, scripted: true })` — Barbarian 2.2 m, hat on (§11.3),
  hyena head with mane + chipped left ear, "HATER-IN-CHIEF" plate, big blade.
- `ctx.enemies.spawn('pilfer', pos, { id: 'pilfer', scripted: true })` — `prop('signpost', true)` (under the left arm),
  `prop('post_bag', true)` (right paw).
- `ctx.enemies.spawn('hyena', pos, { id: 'hyena_3', scripted: true, ai: false, cage: 'pearl' | true, word: 'GRUMBLER' })` —
  a carried cage with a kitten inside (Pearl + pink ribbon for `'pearl'`, a squire for `true`).
- `ctx.enemies.spawn('barkus_silhouette', ctx.levels.anchor('bell_far').pos, { id: 'barkus_far', scripted: true })` —
  unlit black Barkus ×2 (forced perspective), no physics (it stays at the anchor height).
- ScriptedActor: `moveTo` (walk/run clip picked from the speed), `face`, `play('laugh' | 'Cheer' | any KayKit S3 clip,
  {once})`, `pose('laugh' | 'sneer' | 'angry' | 'sad' | 'surprised' | 'kneel' | 'neutral')` (beast-head expressions; `kneel`
  plays the PickUp clip clamped), `emote('laugh' | 'nod' | 'shake')`. Scripted enemies are not hurtable.
- `end` blocks: `ctx.enemies.despawn(ctx.actors.get(id))` (idempotent). A free (non-scripted) enemy drops any attack in
  progress on `cutscene:start` (telegraph ended, token released) and freezes until the cutscene ends.

## To fx
- **Defeat poof**: enemies emit `fx:burst { kind: 'poof', position (feet), type, height, dir, helmet: false, count: 12 }`
  plus `enemy:died`. Our real helmet / hood mesh spins off as debris (enemies-owned, visual only), so please skip the
  generic helmet pop when `helmet === false` (Poof.poof already does: `o.helmet ?? helmetFor(type)`), add the faction
  debris by `type` (crow feathers etc.), and don't run a second poof on `enemy:died`.
- **Telegraph payloads** (`combat:telegraph`): `pos` / `dir` are LIVE vectors the enemy rewrites every frame until
  `combat:telegraphEnd` — weapon tip (glints), muzzle + aim direction (aim: `shape: 'line'`, `size` = range, the dir stops
  changing 0.2 s before the shot), dive target (crow: `shape: 'shadow'`, `size` = r 0.9, tracks for the first 60% of
  `duration`, then frozen). `actor` is always the Enemy.
- Dormant spawns waking up emit `fx:burst { kind: 'spawn', position }` (the arena spawn poof).

## To fx / ui
- The §10.1 alert **"!"** over the head (the 0.4 s hop) is drawn by enemies (one shared sprite material, cream with an
  ink outline, pops for 0.6 s on `enemy:alerted` via the `alert` state). Please don't add a second one.

## To audio
- `enemy:alerted` (the "!" hop), `combat:telegraph` (kind → the §8.1 sound), `enemy:died` — nothing else is needed for M1.

## To bosses' consumers (camera, ui, story)
- `boss:dizzy` is emitted on every meter change (gain, parry, decay at 4 Hz, recovery) but **only once with
  `dizzy: true` per dizzy window** (parries/hits during the window no longer re-emit it). Camera's one-shot shake is safe.
- Barkus P3: `countShardParry()` counts parried `shardSlam`s (`BOSSES.barkus.phases[2].shardSlam.parriesNeeded`, 3) and
  calls `freeShard()` on the 3rd; a phase retry resets the count. `__GAME__.boss.freeShard()` still skips it.

## To core (config additions; additive)
- Dev-server tip for every agent: `vite` full-reloads every open page whenever ANY agent saves a file, which kills
  long smoke runs mid-block (`__GAME__` undefined / timeouts). Enemies runs its server from a private config with
  `server: { hmr: false }` (changed files are still served fresh on the next load). Maybe worth a line in CONTRIBUTING.
- Please adopt `src/enemies/tuning.js` `TUNING` as `config.ENEMY_TUNING` (numbers GAME_DESIGN states in prose but
  Appendix A doesn't carry: 0.45 s windup floor, 0.4 s alert hop, 0.06 s hit flash, 0.15 s squash to 0.8, orbit ×1.4,
  helmet spin-off, death timings, pack-alert radius 8 m, boss phase invulnerability 1.0 s, ...). Enemies read their own
  table until then; nothing there overrides an Appendix A value.
- Event payload JSDoc in `events.js` (no new names): `enemy:died` gains `fish, smallHeart, height`; `fx:burst` poof gains
  `type, height, dir, helmet`.
- `ENEMIES.crow.tint` `#17181C` is the intended feather colour; the Pigeon atlas is already blue-violet, so the crow
  multiplies it by `#4A4B58` (+ a faint violet emissive) to land on that colour with a legible beak and eyes.

## Skeleton bone-texture leak (review finding) — for world / characters / companions / core
Enemies now dispose cloned skeletons on despawn (`src/enemies/rig.js` `disposeInstanceMaterials`: every
`SkinnedMesh.skeleton.dispose()` under the visual, after owned materials). The same leak remains outside enemies:
Critter.dispose (world/PropActor.js), NpcActor / Companion / LostKitten disposal and KittenBuilder.dispose never call
`skeleton.dispose()` on their SkeletonUtils clones (+2 textures per meadow reload). Suggest core add
`Assets.disposeInstance(root)` (dispose skeletons + owned materials) and every area call it; enemies will switch to it.


---

# M2 notes (archived from requests/enemies.md by the M2 integration pass, 2026-10-09)


The M1 API notes of this area are archived in `docs/api/enemies.md`; what core applied is in `requests/RESOLVED.md`.
M2 API notes are at the end of this file (core: please move them to `docs/api/enemies.md` when you triage).

## To player — `applySlow(mul, sec, source)` for the spider web (open)
GAME_DESIGN §10.3 `spider_web`: "slows 50% for 2.0 s; a roll clears it" (also standing in a web patch). Please add
`applySlow(mul, sec, source)` (and optionally `isSlowed()`) to the Player and fold it into `speedMul`; a tumble
(`dodge`) clears it; Clover's mend already zeroes `slow` / `slowT` (companions/abilities.js).
Until then `src/enemies/status.js` sets `p.slowT` / `p.slow` (fraction removed) and EnemyManager scales her planar
velocity once per step after the player moved (factor tuned to her `accelDamp` so it settles at ×0.5). As soon as the
Player has `applySlow`, enemies call it and the fallback switches itself off.

## To player — Jeer radius per enemy (open)
`Player` reads the jeer aura radius from `enemy.def.jeer.r` (8). B2's stealers jeer as a duet with r 10 (§11.3):
please prefer `enemy.jeerR` when it is set (enemies set it on every `enemy:jeer {on: true}`).

## To world (open)
- **Arena counts**: boss adds, Gloomjelly splits and Cacklejaw's clones are pushed into their arena's `enemies` list
  through `ctx.enemies.joinArena(e, arenaId)` (it writes `arena.enemies`). If you'd rather own that, listen to
  `enemy:spawned` and adopt enemies whose `spawnOpts.arena` is yours; tell me and I'll drop the push.
- **Spider Hollow webs** (§12.4: 6 web patches r 1.0): `ctx.enemies.webs.add([x, y, z] | {x, y, z}, { r: 1.0, life: Infinity })`
  makes permanent ones (same slow, a slash cuts them). They are cleared on `level:unload`.
- **Pilfer's chase** (§12.5): `const { pilfer, done } = ctx.enemies.pilferChase()` runs `chase_0..5` (your town
  anchors) — or `pilferChase({ path: [...] })`. `done` resolves `{ dropped: true }` on the 3rd hit (`item:returned`
  `{ item: 'post_bag' }` fires then); he is left sitting, AI off, actor id `pilfer`, for CS-06.
- **The Line**: runners (`{ runner: true }`) head for the `winch` anchor (or `opts.goal`) and hold it; a runner
  stealer that reaches it steals the pin: `item:stolen { item: 'pin' }` (freeze the repair), `item:returned
  { item: 'pin' }` when hit (resume). If it escapes (8 s) it despawns; `ctx.enemies.pinThief` is null again. Spawn the
  first W2 stealer with `{ runner: true, look: 'pilfer', id: 'pilfer' }` for Pilfer's look.
- **The giant Gloomjelly** (§12.5 town fountain): `enemy:died { type: 'jelly_giant', releases: 'earlgrey', position }`
  — please spawn / reveal Earl Grey there (D-04). Earl Grey sits visibly inside the jelly until then.
- **B1 Cheese Mill**: Grizzlechop reads your `mill_pillar_0..5` anchors (lane crashes) and puts P2's crossbowmen on
  `mill_deck_a` / `mill_deck_b` (`{ y: 2.0 }` perch). Your pillar colliders also stop the charge; good.
- **Sleeping enemies** (your §18 request): pre-placed enemies that are not alerted and are > 42 m from her and the
  camera sleep (no AI, no mixer, not drawn; `e.asleep`). Arena / boss / runner spawns never sleep.
- **prewarm** (your request): `ctx.enemies.prewarm([{ type, opts }], at)` builds dressed stand-ins outside the game
  (no `enemy:spawned`, not registered, AI off, "!" shown; bosses build as stand-ins without `boss:start`) and resolves
  to a cleanup function; their materials stay alive until `level:unload`.

## To story (open)
- Boss lesson barks are shown by enemies through `ctx.story.barks.say(boss, key)`: `grizzlechop.wheel` (wheel parry /
  pillar crunch), `grizzlechop.snack`, `grizzlechop.choke`, `cacklejaw.choked`, `cacklejaw.stumble`, `cacklejaw.meowed`.
  §11.2 also has "MY CHEESE!" for the parried toss wheel: if you add a key `grizzlechop.cheese`, tell me and I'll use it.
- Pilfer's chase restart (she fell > 25 m behind) has no line yet; a toast key like `toast.chase.restart` would help.

## To core (open)
- Please adopt `src/enemies/tuning.js` `M2` as `config.ENEMY_TUNING.m2` (runner, flank, jeer, web, stealer, pug,
  jelly, pilferChase, sleep, prewarm, boss: prose numbers from §10.3 / §11 / §12 that Appendix A doesn't carry).
  `M2` already merges anything under `ENEMY_TUNING.m2`.
- `events.js` JSDoc (no new names): `enemy:died` gains `releases` (`'earlgrey'` for the giant jelly), `popped`
  (a popsSlime kill: no split) and `size` for Gloomjellies; `item:stolen` / `item:returned` items are
  `'fish' | 'milk' | 'pin' | 'post_bag'` and `item:returned` also carries `thief`.

## To fx (FYI)
Bursts used by M2 enemies: `shatter` (cheese, color), `rocks`, `metal`, `spark`, `dustRing`, `droplets`, `heal`,
`fur`, `smoke`, `ring` (`r`, `color`), `stars`, `fish`, `sparkle`. Telegraph extras pass `w` / `l` / `r` / `inner` /
`follow` (lanes, rings, circles). One enemy can now show several telegraphs at once (a red "!!" plus an aoe lane;
five cheese-bomb circles); each has its own id and `combat:telegraphEnd`.

## To audio (FYI)
`ctx.audio.laugh(pos, { volume, rate })` is called by gloats, giggles (rate 1.5), Pilfer's taunts and Cacklejaw's
P3 positional laughter; `play3D('stealerSnatch' | 'pugSnort' | 'grizzleRoar' | 'grizzleMonster', enemy)`.

---

# M2 API notes (enemies) — for docs/api/enemies.md

### New types
`spider`, `stealer`, `pug`, `jelly` / `jelly_l` / `jelly_m` / `jelly_s` / `jelly_giant` (procedural, pooled visuals),
`hyena` (full AI), `boss_grizzlechop`, `boss_cacklejaw` (+ its `cacklejaw_clone`), `pilfer_chase`
(`spawn('pilfer', pos, { chase: true })` maps to it).

### Behaviours (§10.3, §11.2–11.3)
- hyena: Gloat after any landed hit (1.0 s, a hit chokes: `enemy:choke`); Jeer (one per pack, 12 s cd, within 10 m;
  `enemy:jeer {on}`; env fog +0.01, at most +0.03 in total); pack flank (the "behind" slot, a 0.6 s giggle).
- stealer: grab swirl 0.6 s → dash; 10% fish (min 5, max 50) / 1 milk / a 1-damage shove (`item:stolen`); getaway to
  the nearest `fog_edge_*`, despawn after 8 s; any hit returns the loot + 5 fish (`item:returned`; dropped as
  pickups when the level has `pickups`).
- pug: frontal ±70° → `'block'`; `bright` / `holy` / a pounce from above / a parried `pug_bash` drop the shield 4 s
  (`e.shieldDownT`); `pug_chop` only while it's down; `pug_slam` red circle → a 0.3 m ring to r 2.5 (jump it).
- spider: skitter bursts; `spider_web` slows (status.js) and leaves a patch (`ctx.enemies.webs`); `spider_bite`.
- jelly: hops; `jelly_slam` aoe circle; splits L → 2 M → 2 S each (giant → 2 M), `popsSlime` pops, 12 alive max.
- Boss.js move runner: chains (Sabre Flurry / Cackle Combo keep each glint ≥ its §8.1 lead), state moves, cooldowns,
  `forceMove`, `when`; hooks `onPhaseChange`, `onRestart`, `onChoke`, `onDefeat`, `addsAt`, `onAdds`; `bark(key)`,
  `wobble(sec, mul)` (Wheel Ride's ×1.5 "dizzy").
- Grizzlechop: Sabre Flurry (white, white, GOLD), Cheese Wheel Toss (a parry breaks it: 3 s stagger), Wheel Ride
  (aoe lanes + red; a lane into a pillar → Dizzy), Cheese Bombs (5 × r 1.6), Snack (heal 30; a hit chokes → Dizzy).
- Cacklejaw: Gloat 1.5 s (choke → Dizzy), Cackle Combo, Laugh Quake (jeer rings; choke in the windup; ring to 7 m),
  Ratio Rush (3 dashes, gold lanes; parry → Dizzy; block pushes her 2 m), P2 stealers' Jeer Duet, P3 fog 0.09,
  hat off, 3 shadow clones (respawn every 10 s), only the real one laughs / has a blob shadow / answers the Meow.

### Helpers
`ctx.enemies.webs`, `pilferChase(opts)`, `joinArena(e, id)`, `claimBehind/releaseBehind`, `pinThief`, `prewarm`,
`wakeUp(e)`; Enemy `telegraphExtra(kind, desc)`, `endTelegraphId(id)`, `choke()`, `runnerGoal()`, `gait()`.

## PERF §1.2: enemy program consolidation
- Prop materials (`props.js`) are WarmToon (`sc-toon-v2`) named `enemy-<kind>`; the kind's look is a per-vertex `rmse`
  attribute (`PROP_RMSE`, `propGeometry(g, kind)`), double-sided kinds carry mirrored back faces (all FrontSide).
- `toonify` makes every converted material DoubleSide (single pass) and converts shared lit GLB gear (weapons) to a
  cached `sharedToon(src, kind)`; it runs before the helmet-top tint (a toon uniform now). Web patches and Cacklejaw's
  blob are `fxBasicMaterial`s.
