// src/player/tuning.js  (owner: player) — design numbers the player needs that are NOT (yet) in core's
// config.PLAYER. Each one is taken from GAME_DESIGN prose (section noted) or is a flow/feel constant.
// Requested from core (requests/player.md) as additive `PLAYER.*` keys; once merged, read them from config.
// Pure data; node-safe.

export const TUNING = Object.freeze({
  // ---- life cycle (§7.6) ----
  faintDur: 2.2,             // s curled up in the faint before the respawn (ghost kitten + "n lives left" play meanwhile)
  respawnInvuln: 1.0,        // s of i-frames (blinking) after a respawn
  vigilPlant: 0.8,           // §7.6 "she plants the sword in Vigil for 0.8 s" at a Vigil Stone
  heartBellHp: 2,            // §7.6 "Each Heart Bell adds 1 heart" (1 heart = 2 HP)

  // ---- locomotion (§7.1) ----
  walkStick: 0.5,            // stick ≤ 0.5 = walk
  zoomiesMinStick: 0.9,      // "full stick" for the Zoomies timer
  zoomiesTurnReset: 0.7,     // rad: a heading change larger than this restarts the Zoomies timer ("run straight")
  zoomiesDustEvery: 4,       // a dust puff every 4 steps
  stepsPerMetre: 1.55,       // footstep cadence (8.5 steps/s at the 5.5 m/s run): tiny legs, quick steps
  pitY: -40,                 // kill plane: below this she counts as fallen into a pit (§7.1 "Deep water or a pit")
  safeMinDist: 1.0,          // m: the safe-ground sample used after a splash is at least this far from the water
  splashInvuln: 0.9,         // s of i-frames after a splash (same as a hurt)

  // ---- combat flow (§7.2 / §7.3) ----
  lungeDamp: 20,             // λ of the lunge velocity during a swing
  hurtDamp: 6,               // λ: knockback decays slower while stunned so it reads
  blockPushT: 0.2,           // s the block pushback (§7.3 0.4 m) is allowed to carry before the Stand brakes again
  blockPushDamp: 5,          // λ during that window
  autoStand: 0.5,            // §7.9 Auto-Stand assist: Stand held automatically for 0.5 s after a parry
  goldenMinShards: 2,        // §7.5 Golden Hour needs Shard 2 (unlocked in CS-09)
  goldenCamPreset: 'HERO_LOW', // §7.5 "the camera punches in to ref1 framing" (a low hero shot of the Oath)
  combatStance: 3.0,         // s she keeps the sword raised ('ready') after combat activity before relaxing

  // ---- ambient behaviours (§7.7) ----
  tailPuffHeight: 2.0,       // tail puff when an enemy taller than 2 m alerts
  tailPuffDur: 1.0,
  slowBlinkStill: 3.0,       // stand still 3 s within 3 m of a companion → slow blinks + a heart puff
  slowBlinkRadius: 3.0,
  slowBlinkCooldown: 12.0,
  sneezeEvery: 90,           // once per 90 s at random…
  sneezeMinFog: 0.06,        // …when fog ≥ 0.06
  alertRadius: 15,           // enemy alert radius that ends the Zoomies (= PLAYER.zoomiesClearRadius)
});

/** Swing ids that fire a Golden Hour `gleam` crescent (§7.5 "every slash"). */
export const GLEAM_SWINGS = Object.freeze(['slash1', 'slash2', 'slash3', 'bright', 'riposte']);

/** Enemy states that count as "targeting her" for Standing Ground (§7.3). */
export const PASSIVE_ENEMY_STATES = Object.freeze(['idle', 'patrol', 'return', 'die', 'dead', 'stagger', 'flee', 'sleep']);
