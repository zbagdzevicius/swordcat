<!-- Archived from requests/combat.md by core at the M2 integration pass (2026-10-09): the M1 API notes and requests of this area.
     Open items were moved to requests/combat.md; applied ones are summarised in requests/RESOLVED.md. -->

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
- Def-driven side effects (so the player does NOT have to do them): `iframes` (holy 0–0.46: `applyHit` answers
  `'immune'` to an actor whose own `actor.swing` is inside its def's `iframes`; no `invulnT` is written, so nothing
  blinks), `timeScale` (holy: `game.slowMo(0.35, 0.25)` on the **first active step**, the moment of impact; calling it
  yourself in the same step overlaps harmlessly), aim assist on the first active step for the player faction (60°/3 m;
  touch 90°/4 m; `riposte` → the last parried enemy within 4 m; prefers `opts.target` / `actor.lockTarget`; skipped when
  the attacker has its own `aimAssist()`), `holyWave` spawned on holy's first active step when
  `actor.shards ?? state.shards ≥ 2`, and a `gleam` per slash (slash1/2/3, bright, riposte) while `actor.golden`.
  Spawning holyWave/gleam yourself as well is harmless: the same projectile def from the same owner within 0.1 s is
  deduplicated, and the Wave Reach upgrade (range 15) is applied inside `spawnProjectile`, whoever spawns the wave.
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
- ~~Please expose `overlapsStatic(pos, r)`~~ — no longer needed: projectiles now sweep `physics.sphereCast(ray, r,
  stepLen, {terrain: false, mesh: true, statics: true})` over each step (falling back to `overlapsStatic` /
  `blockedAt(x, z, r, y0, y1)` if `sphereCast` is missing). Please keep `sphereCast` honouring `statics: true`.

## To enemies
- `onParried(by, {gold})` is called for melee parries; boss Dizzy crits: set `critTaken = DIZZY.critMul` (or keep `isDizzy`).
- Melee: keep using `beginSwing`/`updateSwing`; the returned count is damaging hits only (use it for the hyena Gloat).
  Pug shield: return `'block'` from `resolveIncoming` for frontal hits, `'break'` when `def.guardBreak` /
  `def.breaksShieldFromAbove` (attacker above) breaks it (combat adds damage + stagger ≥ 0.8; your own longer stagger wins).
- Ranged: `spawnProjectile(ATTACKS.rat_bolt, enemy, chestPos, dirToPlayerChest)`; reflected bolts come back for 25.

## M1 update (2026-10-08) — additive behaviour changes, contract unchanged
- `combat:hit.damage` on the player side is what her hp actually lost (her `hp` setter applies Golden Hour halving and
  Still Standing); enemies still get the nominal damage (overkill shows the full number).
- Harmless hits (def `dmg` 0: `dummy_swing`, `sack_swing`, `spider_web`, `stealer_snatch`) still knock her back and fire
  `onHit`, but give only the 0.12 s anti-multi-hit window (no 0.9 s blinking i-frames) and light juice without rumble.
- Block pushback is divided by the blocker's mass and skipped for `superArmor` (a Pug shield block barely slides).
- Reflected projectiles keep homing on their shooter (≤ 5 rad/s) while it stays within 60° ahead, so a strafing
  crossbow rat still eats its bolt. Round projectiles now stop on props and architecture (`onEnd(p, 'wall')`).
- `assistTarget` ignores `hidden` / `dormant` actors.

## To player (found by combat smoke, `tests/smoke/combat.mjs` → combat:parry)
- ~~**Riposte is cancelled by the Stand that made the parry.**~~ Fixed by player (`swingGuardLatch`); combat:parry now keeps
  the Stand held through the ⚔ press and asserts riposte = 36 crit + kill. Original note: A ⚔ press during the Stand starts `riposte`, but the next
  step the attack state's pre-active cancel (`(preActive || recovering) && p.wantGuard()`) drops it straight back into
  `guard`, because guard is still held — and on touch / with the Auto-Stand setting `autoStandT` (0.5 s) holds it for
  you. Real play: RMB held + ⚔ never ripostes; touch players can't riposte for 0.5 s. Suggest: don't let a Stand that
  was already held when the swing started (or `autoStandT`) cancel `riposte` (only a fresh guard press should).
  The smoke works around it (drops the Stand at the parry, stays on kbm) and then asserts riposte = 36 crit + kill.
- Combat already does parry/block/hit rumble, hitstop and the parry slow-mo; Player also rumbles on parry/block/hurt
  and on her own hits (`_onHitEvent`) and calls the parry/holy `slowMo` itself — harmless duplicates (same values, same
  step), but they can go.

## M1 resume (2026-10-08, later) — additive, contract unchanged
- `applyHit(att, tgt, def)` without `dmgMul` now uses `dealtMul(attacker)` (sharpness × Golden Hour for her, 1 for
  everyone else), so her damage is right whichever path deals it. Pass `dmgMul` only to override.
- **Shield Wall (companions):** an enemy swing (`updateSwing`) or `areaHit` whose line from the attacker (area: `from`
  ?? `center`) to a target crosses a wall (`ctx.companions.wallBetween(a, b)` → a post) lands on that post instead
  (it answers 'block'); the target behind it is untouched, the post takes one block per swing / blast. Her own attacks
  are never redirected. Projectiles already stop on the posts (they are hurtable `ally` actors).
- Player: noted — the Combat.js header no longer mentions an hp setter (`damageTakenMul`, `onLethal`, `superArmor`,
  `aimAssist()` and `attacker.swing` are the hooks combat reads).
- Physics: `sphereCast` (preferred) and `overlapsStatic` are both used by projectiles; thanks.
- Visuals: holyWave / gleam crescents re-cut as a thin golden arch (core line only clears the bloom threshold), so
  they read as a crescent even under the Holy bloom spike (1.2) instead of a white dome.
- New smoke block `combat:block` (Stand block = 0 dmg, −1 Grit, hitstop 0.04, no i-frames; then a poke hurts her
  for 1 HP with hitstop 0.07 and 0.9 s i-frames).


## Iso controls (CONTROLS_SPEC §7–§8, §12 combat) — additive
- `assistTarget(actor, range, angle, out?, opts?)`: the §7.2 soft auto-target score (lower wins): dist + 2·|angle|/π
  − 2.5 winding up on her (a live parry / gold / red telegraph) − 1 selected − 0.8 hp < 30 % − 0.5 hit her in the
  last 2 s + 3 breakable. `opts`: `dir` (yaw or `{x, z}`; default facing), `prev` + `sticky` (keep `prev` unless a
  challenger is better by `AIM.sticky` 0.75), `selected`, `breakables` (only with no hostile within 6 m), `prefer`.
  Crows count only below `hittableBelow`. `out` gets `{ target, score, terms, kept, prevScore, list }`. The legacy
  call `assistTarget(actor, range, angle, preferActor)` still works. The pure core is `targeting.pickAssist`.
- `hitRecently(actor)`: did it damage the heroine within 2 s.
- `nextParryable(actor, maxDist = 6)` → `{ attacker, activeAt, kind: 'parry'|'gold', window, projectile, pos }` (a
  shared object) or null: the soonest live white / gold wind-up aimed at her (fed by `combat:telegraph`, with
  `activeAt` / `windup` / `arc` / `range` / `attackId` / `targetsPlayer` filled in when enemies leave them out), or an
  incoming hostile bolt within 1 s. `window` includes the touch bonus. `pos` is the bolt for projectiles.
- `beginSwing(attacker, def, { lungeTo })`: lunge magnetism. A target beyond reach sets `swing.lungeOverride` (m/s)
  so the lunge covers up to 1.0 m more (`targeting.lungeSpeed(def, dist, range)`).
- `reflect(projectile, by, { dir }?)`: a parried bolt flies at the hostile nearest her aim within ±25° and 16 m (the
  cursor, drag, right stick or selected-target aim, else her facing) and homes on it. Otherwise it flies back to the
  shooter as before. The classic camera keeps the M1 rule.

## Warm adventure, performance and auto-camera (Phase W, 2026-10-12): additive

- `tokens.holdersInto(kind, out)` (AUTOCAM §15 combat 1): fills `out` with the live holders of `kind` without
  allocating. `holders()` returns the Set itself, and iterating a Set allocates. `holdersInto` clears `out` first and
  returns it.
- `combat:telegraph` payloads (IMPLEMENTATION_PLAN §7.1, WA §3.4): combat fills in every key an emitter left out. It
  does this through a bus tap, which runs before any handler. ui and audio subscribe before combat does, and the tap
  means they still see the filled payload. The keys it fills:
  - `windup`: defaults to `duration`.
  - `activeAt`: now + windup, plus the def's `active[0]` for melee kinds.
  - `targetsPlayer`: true when the attacker's target is the player, or when there is no actor.
  - `glyph`: `TELEGRAPH.glyph[kind]`, or null for `jeer`.
  - `end` `{x, y, z}` for `lane` / `line` shapes: pos + unit dir × length. The length comes from `lane.l`, else `l`,
    else `range`, else `size`.

  A value the emitter sets always wins. The pure helper is `targeting.normalizeTelegraph(p, now, hooks?)`.
- `telegraph:first {kind}` (combat.W1): fires on the first sighting of each kind that has a glyph, once per save. It
  counts only in play, dialog and memecam modes, and is stored in the save flag `tele.seen.<kind>`.
- Final blow (combat.W2, WA §5.1): it counts when her side kills a boss, or the last alerted hostile within
  2 × `HUD.tuck.combatR`. That hit adds `JUICE.finalBlow.hitstopAdd` to the hitstop and calls
  `game.slowMo(timeScale, slowMo)` once. There is no camera zoom. `stats.finalBlows` counts these kills. The pure rule
  is `isFinalBlow(src, tgt, enemies, herPos)`, exported from `Combat.js`. It is the same rule Player's `_finalBlow` uses
  for the "Bonk!" word.
- PERF B1: `assistTarget` and `pickAssist` allocate nothing per call when the candidates come as an array. The `out`
  breakdown rows are pooled on `out._pool` and reused by the next call on the same `out`, so copy anything you keep.
  `ThreatBook` walks a dense `entries` array, and token pruning uses pre-bound callbacks.
- PERF B2 / K5: projectiles never cast or receive shadows. Round projectiles with r ≥ 0.2 m (bone orbs, web globs) get
  a contact blob through `fx.blobs.add(group, r × 1.4)`, removed when the projectile is recycled. Bolts and waves get
  no blob. The bolt and glob materials are now `MeshLambertMaterial`, so combat adds no Standard shader program.

