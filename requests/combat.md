# Requests / notes from the combat area

## How to use ctx.combat (M1, 2026-10-07) — player, enemies, companions, world, fx, audio, ui
Frozen contract unchanged: `beginSwing(attacker, def)`, `updateSwing(swing, dt)`, `applyHit(att, tgt, def, {dmgMul, crit})`,
`spawnProjectile(def, owner, pos, dir)`, `tokens`. Everything below is additive.

### Swings
- `const s = ctx.combat.beginSwing(actor, ATTACKS.slash1, opts?)`, then `ctx.combat.updateSwing(s, dt)` every step → number of
  NEW damaging hits ('hit'/'break') this step. The swing records `hits`, `contacts`, `landed`, `blocked`, `parried`, `killed`,
  `done` (t ≥ dur), `angle` / `prevAngle` (blade angle relative to facing, for trails), `target` (aim-assist pick), `spawned`.
  `ctx.combat.cancelSwing(s)` stops one early. Pure helpers in `combat/attacks.js`: `swingAngle(def, t)`, `swingProgress`.
- `opts`: `dmgMul` (default: sharpness × Golden Hour from `actor.golden` / `state.upgrades.sharp` — **pass it only if you
  want to override, never pre-multiplied on top**), `crit` (Purrfect-Dodge ×1.5 for the next hit), `dmg` (base override),
  `arc`, `active`, `target` (assist preference), `assist: false | {range, angle}`, `projectiles: false`, `gleam: bool`,
  `timeScale: false`.
- Def-driven side effects (so the player does NOT have to do them): `iframes` (holy 0–0.46 → `attacker.invulnT`),
  `timeScale` (holy: `game.slowMo(0.35, 0.25)`), aim assist on the first active step for the player faction (60°/3 m;
  touch 90°/4 m; `riposte` → the last parried enemy within 4 m; prefers `opts.target` / `actor.lockTarget`), `holyWave`
  spawned on holy's first active step when `actor.shards ?? state.shards ≥ 2` (Wave Reach upgrade → range 15), and a `gleam`
  per slash (slash1/2/3, bright, riposte) while `actor.golden`. Spawning holyWave/gleam yourself as well is harmless: the
  same projectile def from the same owner within 0.1 s is deduplicated.
- Defs without `arc` get a body-contact arc (radius + 0.45 m, ±90°) or, with numeric `def.r`, a full circle; defs without
  `active` are active 0..dur (pounce: until you stop updating).

### applyHit results and hooks
- Returns `'none'` (dead / not hurtable / invulnT > 0 — retried by swings and projectiles), `'immune'` (also for
  `'perfectDodge'` / `'graze'` from `resolveGuard`), `'parry'`, `'block'`, `'hit'`, `'break'`.
- Combat owns the hit juice: hitstop, `fx:shake` (capped per step to the strongest hit), gamepad rumble (§8.2 rows), the
  parry slow-mo (0.5 for 0.15 s). **Player/fx/audio: don't add hitstop/shake/rumble for hits, parries or blocks again.**
- `player:parry {attacker, gold, projectile?, position}` when the player parries (attacker = the shooter for projectiles).
  A non-player parry emits `combat:hit {parried: true, blocked: true}`. Blocks emit `combat:hit {blocked: true, damage: 0}`.
- `combat:hit` extra fields: `heavy`, `broke` (guard break), `result`, `projectile`, `reflected`. `attacker` is always the
  actor (a projectile's owner), never the projectile.
- Optional target members honoured (duck-typed, all optional):
  `onLethal(info) → true` to survive a lethal blow (Still Standing: set your own hp, return true);
  `damageTakenMul` (player side, applied after difficulty rounding, rounded down: Golden Hour 0.5);
  `superArmor` (no knockback / poise / stagger: Golden Hour, bosses mid-move);
  `critTaken` (crit multiplier taken, e.g. `DIZZY.critMul` while Dizzy; `isDizzy === true` is used as a fallback);
  `breakable` (cages, crates, cracked boulders: player-side attacks may hit it although it is not an enemy; register it
  in `ctx.actors` with `hurtable`, `hp`, `radius`, `height`, and use `resolveIncoming` → `'immune'` to require e.g.
  `def.breaks?.includes('cracked')`).
- Player faction: combat never applies the poise stagger to her (her 0.35 s hurt stun is hers, §7.6); `'break'` sets
  `staggerT ≥ PLAYER.guard.breakStagger`. Allies (companions) take player-scale damage with difficulty rounding.
- Hits where neither side is the player (companions vs enemies) never request hitstop or shake.

### Extras
- `ctx.combat.areaHit(att, def, { center, r, rInner, y0, y1, hitSet, dmg, dmgMul, crit, from })` → damaging hits.
  For the pounce landing ring use `ringDef(ATTACKS.pounce)` (r 1.3, 10 dmg); pug_slam: grow `r` 0 → 2.5 over 0.4 s with
  `rInner = r - band`, `y1 = 0.3` (jumpable); crow_dive / jelly_slam: `r` from the def at the impact point.
- `ctx.combat.staggerArea(att, r, dur)` (Golden Hour activation), `ctx.combat.assistTarget(actor, range, angle, prefer)`,
  `ctx.combat.dealtMul(actor)`, `ctx.combat.lastParry` `{attacker, by, gold, time, projectile}`, `ctx.combat.stats`, `ctx.combat.log`.
- `ctx.combat.spawnProjectile(def | id, owner, pos, dir, opts?)` — opts: `kind` ('bolt'|'orb'|'glob'|'wave'|'gleam'),
  `speed`, `range`, `r`, `vel` (3D, overrides dir/speed), `gravity` (m/s², lobs), `pierce`, `faction`, `dmg`, `dmgMul`,
  `crit`, `onHit(p, target, result)`, `onEnd(p, reason)` (`'hit'|'blocked'|'expired'|'ground'|'wall'|'bounds'|'eaten'`;
  spider_web → spawn the web patch on `'ground'`/`'expired'`). Projectiles are cleared on `level:unload` and `cutscene:start`.
  A parry reflects them automatically (×1.5, homing on the shooter within 60°, `reflectDmg`, gold look, `combat:reflect`).
- `ctx.combat.tokens`: `acquire(actor, 'melee'|'ranged')`, `release(actor)`, `has`, `count(kind)`, `limit(kind)`,
  `isWaiting(actor)`, `orbitPoint(actor, target, radius, out)` (kung-fu circle slots; use `COMBAT.orbitMul` × attack range).
  The queue is fair (longest waiter first); dead / unregistered holders are pruned every step.

## To core
- Optional: adopt `COMBAT` (src/combat/attacks.js: anti-multi-hit 0.12, poise stagger 0.6, knock lift, pushback ×6,
  point-blank 0.25, contact reach, token stale/max-hold, wave hover, reflect cone) as `config.COMBAT` so all tuning lives in
  config. Combat reads its own table until then.
- §19.2 lists `player:block` among combat's products, but `events.js` has no such constant; combat reports blocks as
  `combat:hit {blocked: true}`. Add `PLAYER_BLOCK` only if someone needs a dedicated event.

## To physics
- Please expose `overlapsStatic(pos: Vector3, r: number) → boolean` (sphere vs static colliders, any spatial hash you use).
  Projectiles use it to stop on walls/trees; until it exists they read `physics.statics.circles/boxes` defensively.

## To enemies
- `onParried(by, {gold})` is called for melee parries; boss Dizzy crits: set `critTaken = DIZZY.critMul` (or keep `isDizzy`).
- Melee: keep using `beginSwing`/`updateSwing`; the returned count is damaging hits only (use it for the hyena Gloat).
  Pug shield: return `'block'` from `resolveIncoming` for frontal hits, `'break'` when `def.guardBreak` /
  `def.breaksShieldFromAbove` (attacker above) breaks it (combat adds damage + stagger ≥ 0.8; your own longer stagger wins).
- Ranged: `spawnProjectile(ATTACKS.rat_bolt, enemy, chestPos, dirToPlayerChest)`; reflected bolts come back for 25.
