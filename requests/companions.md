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
