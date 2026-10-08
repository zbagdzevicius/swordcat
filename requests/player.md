# Requests / notes from the player area

## To core — config keys (additive `PLAYER.*`), 2026-10-08
`src/player/tuning.js` holds design numbers the player needs that Appendix A does not list. Please merge them into
`config.PLAYER` (same names); the player will read config once they exist:
- life cycle: `faintDur 2.2` (s curled up before the respawn), `respawnInvuln 1.0`, `vigilPlant 0.8` (§7.6), `heartBellHp 2`
- locomotion: `walkStick 0.5`, `zoomiesMinStick 0.9`, `zoomiesTurnReset 0.7` (rad), `zoomiesDustEvery 4`, `stepsPerMetre 1.55`,
  `pitY -40` (kill plane), `safeMinDist 1.0`, `splashInvuln 0.9`
- combat flow: `lungeDamp 20`, `hurtDamp 6`, `blockPushT 0.2`, `blockPushDamp 5`, `autoStand 0.5` (§7.9),
  `goldenMinShards 2` (§7.5), `combatStance 3.0`, `bumpStunMul 0.5`, `hurtFlash 0.12`, `standCapeWind 1.8`
- ambient (§7.7): `tailPuffHeight 2.0`, `slowBlinkStill 3.0`, `slowBlinkRadius 3.0`, `slowBlinkCooldown 12`, `sneezeEvery 90`,
  `sneezeMinFog 0.06`

## To core / fx — first-use stalls
In smoke the first swing trail, the first Holy charge and the first Golden Hour each stall the page for ~1–2 s
(shader compiles). `LOOP.maxFrameDt` turns a 1.5 s stall into 0.1 s of sim, so gameplay feels it as a hitch, not a skip.
A `renderer.compileAsync(scene, camera)` warm-up after `level:loaded` with the trail / HolyFX / gold materials visible
for one frame would hide it. (The player smoke blocks wait on sim-side conditions, so they pass either way.)

## To characters
- **Cape pins read stale matrices after a teleport.** `HeroCape._updatePins` calls `root.updateWorldMatrix(true, false)`
  (parents, not children), but the pins and colliders read `rig.chest.matrixWorld` / joint `matrixWorld`, which
  `Kitten.simulate`'s `root.updateMatrixWorld(true)` computed earlier from the actor root's *previous* world matrix.
  After a teleport that also turns her (level load, respawn), the cloth re-initialises around last frame's pose,
  on the wrong side, and the body colliders then trap it in front of her (it hung over her belly at every level load).
  Player workaround (kept): `actor.object3d.updateWorldMatrix(true, false)` right before `view.simulate()`.
  Suggested fix on your side: `this.root.updateWorldMatrix(true, true)` in `_updatePins` (or in `KittenView.simulate`).
- SwordcatModel now builds the hero through `KittenView` (env map, wind, quality → fur) with `memeCam: false`
  (the player drives `setMemeCam` and `cape.windMul` itself: Meme Cam 1.6, Standing Ground 1.8).

## To combat
- The player uses your hooks instead of an hp setter: `damageTakenMul` (Golden Hour 0.5), `onLethal` (Still Standing,
  sets hp 1 and returns true), `superArmor` (Golden Hour + its activation), `aimAssist()` (so `_assist` is skipped),
  `swing` (Holy i-frames via `attacker.swing`). `player.hp` is a plain number again; the header comment in Combat.js
  ("her hp setter applies Golden Hour / Still Standing") is out of date but harmless.
- The player no longer adds rumble / slow motion / holyWave / gleam / dmgMul itself (combat owns them). It only sets
  `swing.opts.crit` (Purrfect Dodge ×1.5 window) and `beginSwing(p, riposte, { target })`.

## To ui (HUD fields and events the player keeps up to date)
- Read fields: `hp/maxHp`, `valor` (0–100), `grit/gritMax`, `lives`, `infiniteLives` (Kitten: hide the counter),
  `milk/milkMax`, `golden`, `goldenT` (s left), `charge` (0..1), `chargeTier` (0/1/2), `standingGround` (bool),
  `riposteT > 0 && riposteTarget` (show a "⚔ Riposte!" prompt), `stateName`, `blinkT`.
- `player:lifeLost {lives, gameOver, infinite}`: on `gameOver` show "Time for a cat nap." → Retry =
  `ctx.levels.load(levelId, spawnId)` (the player revives on `level:loaded`), Back to Pawsbury = `levels.load('town', …)`.
- `player:damaged {amount, hp, maxHp, source, broke}`, `player:healed`, `player:valor {value, max, delta, reason}`
  (Standing Ground / Jeer stream in ≥ 1-point chunks), `player:grit {value, max, broken}`, `player:milk`,
  `player:charge {level, fizzle, holy}`, `player:golden {on, dur}`, `player:stillStanding`.

## To world
- `checkpoint` payload: please include `position` (Vector3 or [x, y, z]) and `facing` of the Vigil Stone's respawn spot;
  without them she respawns where she stood when it fired. On `checkpoint` she plants the sword (Vigil, 0.8 s),
  heals to full, refills milk and Grit and re-arms Still Standing.
- Optional `level.surfaceAt(x, z)` → `'grass' | 'stone' | 'wood' | 'water' | ...` is used for `actor:footstep.surface`.
- Physics `isShallowWater` / `isDeepWater` (+ the y-below-−40 kill plane) drive shallow-water slowdown and the splash
  (−1 HP, back to the last safe ground, no life lost).

## To enemies
- The player reads `enemy.alerted`, `enemy.stateName` (Standing Ground ignores idle/patrol/return/die/dead/stagger/flee/
  sleep), `enemy.height` (tail puff when > 2 m alerts), and listens to `enemy:alerted {enemy}`, `enemy:jeer {enemy, on}`,
  `enemy:choke` (+10 Valor). Golden Hour staggers through `combat.staggerArea` (→ `enemy.stagger(sec)`).

## To story
- ScriptedActor on the player: `pose('vigil'|'oath'|'sip'|'selfie'|'faint'|'kneel'|'sit'|'sleep'|'idle')`,
  `play(clip)` with procedural swing clips (`slash1`, `slash2`, `slash3`, `bright`, `riposte`, `holy`, `sunburst`,
  `pounce`; resolve at the end when `once`) and emote clips (`meow`, `sneeze`, `nod`, `shake`, `blink`, `earsFlat`,
  `tailPuff`, `bowBounce`, `jump`), `emote(...)`, `prop(...)`, `attach(...)`, and `player.setOutfit('tunic' |
  'tunic_bow' | 'armour')` for CS-01.

## Done since (M1 resume, 2026-10-08)
- combat's "Riposte is cancelled by the Stand that made the parry": fixed. A Stand that is already held when a swing starts
  (Riposte, ⚔ out of the Stand, Auto-Stand) no longer cancels that swing; only a fresh Stand press does, and she drops
  back into the still-held Stand when the swing ends (unit test in tests/unit/player.test.js).
- physics: `isDeepWater` / `isShallowWater` now get her feet height (`pos.y`).
- companions: hits on `breakable` targets or actors tagged `prop` (cage locks, crates, boulders) give no Valor.
- Milk capacity reads `ctx.companions.milkBonus` when CompanionManager provides it (falls back to the Mochi config).

## To core — smoke under load (FYI)
- With many agents' browsers on the one GPU, `page.screenshot` took 5–30 s (one boot screenshot timed out at 30 s) and
  `__GAME__.events` (ring of 200) sometimes lost `player:*` names. tests/smoke/player.mjs now pauses the sim
  (`setTimeScale(0)`) around its own screenshots and records `player:*` / `camera:meme` / `combat:hit` with its own
  `bus.tap`. A harness-level "freeze during t.shot" and a larger ring would help every area.
