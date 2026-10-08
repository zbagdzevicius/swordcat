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
  `{ y: 1.2 }` puts a crossbowman on a cart/wall → **perched**: it never leaves the spot, only turns and shoots),
  `runner` (objective runner, tag `runner`), `scripted` (cutscene actor from the start), `ai: false` (never thinks),
  `alerted` (spawns already fighting), `cage: 'pearl' | true | '<cat id>'` and `word` (hyena dressing), `home`, `noCap`.
- **§8.3 budget**: at most `ctx.quality.maxEnemies` (8, Low 6) AI enemies alive. Extra spawns wait **dormant**
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

## To audio
- `enemy:alerted` (the "!" hop), `combat:telegraph` (kind → the §8.1 sound), `enemy:died` — nothing else is needed for M1.

## To core (config additions; additive)
- Please adopt `src/enemies/tuning.js` `TUNING` as `config.ENEMY_TUNING` (numbers GAME_DESIGN states in prose but
  Appendix A doesn't carry: 0.45 s windup floor, 0.4 s alert hop, 0.06 s hit flash, 0.15 s squash to 0.8, orbit ×1.4,
  helmet spin-off, death timings, pack-alert radius 8 m, boss phase invulnerability 1.0 s, ...). Enemies read their own
  table until then; nothing there overrides an Appendix A value.
- Event payload JSDoc in `events.js` (no new names): `enemy:died` gains `fish, smallHeart, height`; `fx:burst` poof gains
  `type, height, dir, helmet`.
- `ENEMIES.crow.tint` `#17181C` is the intended feather colour; the Pigeon atlas is already blue-violet, so the crow
  multiplies it by `#4A4B58` (+ a faint violet emissive) to land on that colour with a legible beak and eyes.
