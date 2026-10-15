<!-- Archived from requests/player.md by core at the M2 integration pass (2026-10-09): the M1 API notes and requests of this area.
     Open items were moved to requests/player.md; applied ones are summarised in requests/RESOLVED.md. -->

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

## To core / combat — review fixes (water, guard break, combo grace) (FYI, no action required)
- New player-local tuning keys (src/player/tuning.js; config.PLAYER may adopt them, config wins): `splashReturnDist` 3.0,
  `splashClearRadius` 2.0, `splashCooldown` 1.5, `splashLockMin` 0.5, `splashLockMax` 3.0, `comboGrace` 0.18.
  Note config.PLAYER.safeMinDist (1.0) is no longer the splash return distance (max(safeMinDist, splashReturnDist) is used).
- Combat: a Grit-exhaustion guard break now arrives with `player.damageTakenMul === 0` (set inside resolveIncoming,
  cleared in onHit / next step), so Combat._damage deals 0 and keeps the 0.8 s break stagger. Red / unblockable breaks
  are unchanged (full damage). If combat prefers an explicit contract, a `softBreak` flag on the result would do.


---

# M2 notes (archived from requests/player.md by the M2 integration pass, 2026-10-09)


## To fx — Standing Ground mist (open, small)
§7.3: while Standing Ground pays out, "the mist speeds up around her". The player already billows the cape
(×1.8) and exposes `ctx.player.standingGround` (bool, true while paying). Please speed up the ambient mist cards
near her while it is true (e.g. drift ×2 within ~6 m), like the Meme Cam's mist ×2.

## To ui — upgrades and Standing Ground (FYI, no action required)
- Shop purchases: just write `state.upgrades` (satchel 0–2, valorGain, quickCharge, sharp, waveReach). The player
  re-reads it every step (`player.applyUpgrades()`; call it yourself right after a purchase if you like). A bigger
  satchel's new slot comes filled; `player.milkMax` / `milk` update at once. Valor Gain scales every positive gain ×1.25
  (`player.valorState.gainMul`). Quick Charge is read live (`tier1Time()` / `tier2Time()`); Sharpness / Wave Reach are combat's.
- Equipping: write `state.cosmetics.sword` (a `SWORD_SKINS` id) / `state.cosmetics.cape` (a `CAPES` id); the model
  applies it within 0.5 s. Unknown ids fall back to the Borrowed Blade / Faded Cream (`equippedSword` / `equippedCape`
  in `player/SwordcatModel.js`). Diamond and Even More Too Big load their GLB first (the Borrowed Blade shows meanwhile).

## Resolved player-side — first-use shader stalls (was: to characters)
SwordcatModel now warms the hero's aura hull and blade streak programs itself: on `level:loaded` / `game:quality` they
are shown for one frame with an empty draw range (same trick as `FX._warmBegin`), so the first Holy charge / Golden Hour
no longer compiles them mid-fight. characters needs to do nothing unless it adds new holy-only meshes (then expose
them, e.g. on `kitten.auraMeshes`).

## M2 notes (player)
- Standing Ground (§7.3) tuning: "planted" now means no stick input (a block's pushback and its brake-out no longer
  reset the 1 s timer); the threat must be targeting her (`enemy.targetActor() === player`: a token handed to a
  companion or a Shield Wall taunt doesn't count); hidden / dormant enemies and the M2 passive states (`dizzy`, `nap`,
  `pile`, `reassemble`, `escape`, `steal`, `intro`, ...) don't count; a 0.4 s grace (`TUNING.threatGrace`) keeps the
  payout steady through a token flicker. Pure test: `threatens(e, player, r)` in `player/tuning.js`.
- Golden Hour: Meme Cam can't start during it; with Quick Charge the Holy tier stays at 0.5 s.
- Even More Too Big (any blade ≥ 1.4 long): the tip rests on the ground while she stands and drags behind her
  while she runs (visual only).

The M1 API notes of this area are archived in `docs/api/player.md`.

## Controls rework (CONTROLS_SPEC §12 player)
- `player.order(kind, arg, o?)` / `player.orders` (`Orders.js`): move / follow / attack / attackMove / use / stop and the
  Shift+RMB queue in `moba` only (≤ 4; TT3 removed Ctrl: Ctrl+W closes the tab). TT3 §11.2: in `hybrid` (the default)
  there is no move click; LMB on a foe gives the attack order (walk in, chain), and the press swings only when the foe
  is already in reach; a direct-line follower when `physics.findPath` is absent. Emits `player:order`
  `{ kind, point, target, valid, queued, partial }`. A move / attackMove that can make no progress (she already stands
  on the closest reachable cell, the click farther off) is rejected (`valid: false, partial: true`); every rejected or
  partial order plays `ui.error` ("mrr?", ≥ 0.25 s apart) and a rejected one a head `shake`. `orders.lastClear` says why the last order ended (`arrived`,
  `direct`, `attack`, `dodge`, `guard`, `stuck`, `target`, `leash`, `mode`, `level`, `stop`).
- `player.aim` `{ active, kind, dir, point, target, range, width, source }` (live every step, §7.1 `Aim.resolveAim`);
  `player.hover` (camera's pick); `player.resolveAim(kind, range)`, `faceAim`, `aimTurn`.
- `player.abilityState(out)` → `{ dodgeCd, dodgeMax, meowCd, meowMax, milk, milkMax, golden, goldenReady, goldenLocked,
  holyReady, grit, gritMax, guard, interact, charge, chargeTier, shards, riposteReady, airborne }`.
- `player.steerDodge(x, z)` (touch: once, inside the roll's first 0.08 s).
- Stand (§8.1): threat snap on the first step (`combat.nextParryable`, ≤ 5 m, lands ≤ 0.7 s), KBM re-aims at the
  cursor after it moves 30 px, touch auto-faces the soonest threat (`settings.standAutoFace`), the guard arc is ±90°
  on touch (`GuardState.arc` ← `PLAYER.guard.touchArc`), the Stand clears move orders. **Auto-Riposte**
  (`settings.autoRiposte` 'auto' = touch): the Riposte fires `AIM.autoRiposte` 0.15 s after a parry when the parried
  enemy is within 4 m (`player.autoRiposted` counts them).
- §7.2 auto-target: "hit her within the last 2 s" from `combat.hitRecently`, plus every attack on her (blocks too).
- §5.4 jump: `player.inputJump()` (Space / A / Jump; TT3 §11.2) = `doJump()` + the jump assist (`Aim.jumpAssistPlan`: toward a raised
  walkable top within 2.4 m, ±1.2 m/s, ≤ 20°, lands ≥ 0.3 m inside both edges; `player.airAssist` holds it in the air,
  `player.jumpAssists` counts them). Order hops (`Orders._jumpLink`) are separate and never Pounce.
- Pounce (§6.2 / §6.4): `player.pouncePlan(out)` / `player.diveAt` — the cursor (≤ 3.5 m), crows within 2.5 m of it
  magnetised (touch / pad: a 3 m disc); the dive carries her toward it (≤ 9 m/s horizontal).
- Meme Cam idle (iso): `Input.idleTime` + held buttons, so a thumb resting on the joystick does not reset it.

## TT3 §11.2 / §11.4 (packages K and C)
- Input actions the player reads (`Input.js`, K): `sprint` (the `dodge` input held 0.18 s: Zoomies speed at once),
  `golden` (V, or the `guard` + `attack` chord within 0.1 s on every device), `trick` and `trick1..3` (the Paw Trick
  slot, package A). `input.usedAsModifier('trick')` is true when RT was held for an RT + D-pad pick (no tap-cast on its
  release).
- SwordcatModel (C): `setTrickPose('toss' | 'twirl' | null, w)`: the Paw Trick pose (TT3 §11.4); `w` 0..1 is followed
  every frame, `null` eases back to rest. Default face `happy`, hurt `wince` (">_<"); brows show only while scripted or
  with an expression override.
