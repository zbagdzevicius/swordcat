# Open requests from enemies

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
