// src/player/tricks/tuning.js  (owner: player, TT3 package A) — the Paw Trick numbers (docs/TOKENTAILS-PLAN.md §11.3).
// Pure data; node-safe. The Ribbon Twirl reads PLAYER.glide (config.js) first; the numbers here are its fallbacks.
import { PLAYER } from '../../core/config.js';

const G = PLAYER.glide ?? {};

/** Every Paw Trick id, in picker order (1 / 2 / 3 on the keyboard). */
export const TRICK_IDS = Object.freeze(['coin', 'cloud', 'twirl']);
/** The tricks that live in the one swappable slot (the twirl is always owned once unlocked and rides on Jump). */
export const SLOT_TRICKS = Object.freeze(['coin', 'cloud']);

/** Save flags (the generic `state.flags` record; SaveManager needs no change). */
export const TRICK_FLAGS = Object.freeze({ coin: 'trick.coin', twirl: 'trick.twirl', cloud: 'trick.cloud', equipped: 'trick.equipped' });

export const TRICKS = Object.freeze({
  /** ":3" Coin Toss (boomerang). */
  coin: Object.freeze({
    range: 8,            // m out
    total: 0.9,          // s out and back when nothing stops it
    dmgOut: 8, dmgBack: 8,
    cooldown: 4.0,       // s, counted from the throw
    valor: 2,            // Valor per hit
    r: 0.32,             // coin hit radius (m)
    lift: 0.6,           // flies at her chest: feet + lift
    spawnFwd: 0.45,      // m in front of her where it leaves her paw (TT4: it used to start inside her head)
    toss: 0.25,          // the `toss` state (s); the coin leaves at `release`
    release: 0.08,
    catchR: 0.7,         // back in her paw within this (m)
    minBack: 0.18,       // shortest return flight (s) after an early stop
    hover: 0.14,         // s the coin hangs spinning after a bonk (> Combat's 0.12 s anti-multi-hit: the way back hits too)
    bounce: 0.3,         // m it hops back off the foe while it hangs
    stunSmall: 0.6,      // rat, jelly S, bonehead mage
    stunStealer: 1.2,    // SNACK SNATCHER
    stealDrop: 0.5,      // fraction of the stolen catnip it drops
    crowGround: 1.5,     // s a crow below crowMaxAlt stays grounded
    crowMaxAlt: 3.0,     // m above the ground: higher crows are out of reach
    bossDmg: 6, bossDizzy: 4,
    knock: 4,            // knockback (jellies, never split)
    collectR: 1.1,       // catnip / hearts picked up on the way back
    wallBounce: true,    // a wall turns it around early
  }),
  /** Ribbon Twirl (glide). */
  twirl: Object.freeze({
    fallMax: G.fallMax ?? 1.8,   // m/s fall cap
    speed: G.speed ?? 4.5,       // m/s air speed while twirling
    maxTime: G.maxTime ?? 1.5,   // s per jump
    spinR: 1.0, spinDmg: 6, crowKnock: 6,
    pogoMul: 1.35,               // after a Pounce pogo the twirl carries further (speed ×, time ×)
    minAir: 0.06,                // s after take-off before a fresh Jump press counts as the second press
  }),
  /** Catnip Cloud (crowd control). */
  cloud: Object.freeze({
    range: 7,            // m throw
    r: 2.5,              // cloud radius
    dur: 3.0,            // s the cloud stays
    giddy: 2.5,          // s on its back
    bellyMul: 1.5,       // the wake-up "belly-rub bonk"
    eliteMinPoise: 5,    // poise >= this (and bosses): only Dizzy
    bossDizzy: 20,
    cooldown: 16,
    toss: 0.3, release: 0.12,
    flight: 0.45,        // s the pouch is in the air
    tick: 0.1,           // s between cloud sweeps
  }),
  /** Aim: a press held longer than this shows the aim line; release casts. */
  aim: Object.freeze({ holdT: 0.18 }),
});

/** Enemy types the coin stuns for TRICKS.coin.stunSmall (rats, the smallest Wobblejelly, the bonehead mage). */
export const COIN_SMALL = Object.freeze(['rat_pike', 'rat_xbow', 'jelly_s', 'bonehead:mage']);
