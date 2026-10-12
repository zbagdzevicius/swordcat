// src/player/juice.js  (owner: player) — Phase W warmth and ART §6.5 feel for Swordcat. Pure and node-safe.
//   Squash        ART §6.5 volume-preserving squash & stretch spring (kick / update(target)); characters may ship the
//                 same helper later (KittenBuilder `Squash`): this one is API-identical so the swap is a re-import.
//   SQUASH        the §6.5 event table (targets and kicks) the model drives the spring with.
//   IdleLadder    WA §5.6 hero idle ladder: glance 4 s, look-around 7 s, groom 10 s, twirl 12.5 s, all before the Meme
//                 Cam (15 s); after a Meme Cam it loops from 7 s (10 % of the looped steps become a sneeze); hub: sit at 20 s.
//   HIT_WORDS     WA §5.3 her comic words ("Snip!", "Snap!", "Swoosh!", …) and `wordFor(attackId)`.
//   ORDER_FX      WA §3.6 order feedback (head snap, double tap hop, tap-her purr / triple-tap twirl).
//   FEEL          ART §6.3 / §6.5 head lag, face pitch, glance numbers.
//   koRespawnT()  WA §5.7 knock-out: respawn at KO.sitT + KO.wipeT (1.55 s).
// Numbers here are player-local design constants (requests/core.md asks core to adopt them; config wins once it has them).
import { IDLE, KO, PLAYER } from '../core/config.js';

/** ART §6.5 squash & stretch spring constants and event table (x is the stretch: scale.y = 1 + x). */
export const SQUASH = Object.freeze({
  k: 320, c: 16, limit: 0.35,
  breathe: { amp: 0.025, hz: 0.45 },          // idle breathing target
  gait: 0.04,                                  // walk / run target 0.04 |sin(π·phase)| (2 bounces per stride)
  jump: { target: -0.15, hold: 0.06, kick: 3.5 },
  land: { kick: -2.5, fallRef: 6 },            // kick −2.5 × min(1, fallSpeed / 6)
  windup: -0.08, release: 1.5,                 // swing wind-up target / release kick
  holy: { target: -0.10, shiver: 0.01, hz: 9 }, // Holy charge held
  hit: -2.0,                                   // combat:hit on her (victim)
  tumble: -0.2,                                // Tumble target
  happy: 2.0, earsHappy: 0.26,                 // Meow / happy kick, ears +15°
  parry: 1.2, block: -0.8, dealt: -0.5, kill: -0.9,   // small extras that read in play (parry pop, block recoil, her hits)
  respawn: 2.0,                                // WA §5.7 respawn pop (Squash.kick(+2))
  hopKick: 3.0, hop: 0.12, hopDur: 0.35,      // a visual "happy hop": stretch kick + a 0.12 m root arc over 0.35 s
});

/** ART §6.3 / §6.5 / §6.6 hero feel numbers (rad, s, λ). */
export const FEEL = Object.freeze({
  headLagLambda: 18, headLagMax: 0.45,         // head follow lag 0.06 s (damp λ 18) behind body turns
  facePitch: 0.14,                             // +8° chin-up toward the high camera when idle or walking
  facePitchLambda: 6,
  glance: { maxYaw: 1.31, hold: [0.8, 1.4], eyes: 0.17, chin: -0.22, rate: 7 },   // ladder glance (up to 75° on the
                                               // high lens, as KittenView's GLANCE; eyes +10°), with a blink
  look: { dur: 2.2, yaw: 0.6 },                // look-around: a slow left → right sweep
  groom: { dur: 1.4, licks: 4, tilt: 0.32 },   // paw lick (the sip pose's paw-to-mouth until characters ship `groom`)
  twirl: { dur: 0.6 },                         // sword twirl (a 0.6 s flourish spin with a sparkle)
  tailSwish: { hz: 0.7, amp: 0.35 },           // hub sit tail swish
  koTilt: 0.26,                                // knock-out head tilt 15°
  glowUp: 0.6,                                 // ENV_U.uGlow sits at her chest (× her height above the feet)
  blobR: 0.5,                                  // her fx.blobs contact shadow radius (m)
  koSword: { x: 0.34, y: 0.03, z: 0.1, yaw: 0.9 },   // the dropped sword beside her (root space, m; blade yaw rad)
});

/** WA §3.6 / §5.6 order and tap feedback. */
export const ORDER_FX = Object.freeze({
  snapK: 0.7, snapLambda: 24, snapT: 0.35, snapMax: 1.2,   // head snaps 70 % toward the goal at λ 24 before the body turns
  doubleT: 0.35, doubleR: 0.75,                // a second tap on the same spot within 0.35 s → double paw + happy hop
  selfR: 0.6, selfPx: 40, selfH: [0.15, 0.5, 0.85],   // a click / tap on her (ground within 0.6 m, or within 40 px of her body)
  tripleN: 3, tripleT: 1.5,                    // 3 taps on her within 1.5 s → twirl
  combatR: 15,                                 // "in combat": an alerted enemy within this many metres (= HUD.tuck.combatR)
});

/** WA §5.3 her words (shown 0.25 m above her head, `settings.hitWords`, at most one per `every` s). */
export const HIT_WORDS = Object.freeze({
  slash1: 'Snip!', slash2: 'Snap!', slash3: 'Swoosh!', bright: 'Shine!', holy: 'Sunburst!', sunburst: 'Sunburst!',
  riposte: 'Riposte!', pounce: 'Pounce!', parry: 'Ting!', perfectDodge: 'Whoosh!', finalBlow: 'Bonk!',
  every: 0.25, lift: 0.25,
});

/** The word for one of her attacks (null for none). */
export function wordFor(id) {
  const w = id ? HIT_WORDS[id] : null;
  return typeof w === 'string' ? w : null;
}

/** WA §5.7: seconds from the knock-out to the respawn (sit, then the cream wipe). */
export function koRespawnT() { return (KO?.sitT ?? 1.2) + (KO?.wipeT ?? 0.35); }

/**
 * ART §6.5 squash & stretch: a damped spring on the stretch x (scale.y = 1 + x, scale.xz = 1 / √(1 + x)).
 * `kick(dv)` adds velocity (negative = squash); `update(dt, target)` integrates and clamps to ±limit.
 */
export class Squash {
  constructor(k = SQUASH.k, c = SQUASH.c) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  kick(dv) { this.v += dv; }
  update(dt, target = 0) {
    if (!(dt > 0)) return 1 + this.x;
    this.v += (-this.k * (this.x - target) - this.c * this.v) * dt; this.x += this.v * dt;
    const L = SQUASH.limit;
    this.x = Math.max(-L, Math.min(L, this.x));
    return 1 + this.x;
  }
  reset() { this.x = 0; this.v = 0; }
}

const STEPS = Object.freeze([['glance', IDLE.glance], ['look', IDLE.look], ['groom', IDLE.groom], ['twirl', IDLE.twirl]]);

/**
 * WA §5.6 hero idle ladder (fixed step). Feed it every step with what she is doing; it returns the step that fires
 * this step ('glance' | 'look' | 'groom' | 'twirl' | 'sneeze' | 'sit') or null.
 *   still: standing idle (move state, grounded, no order, not scripted, no swing)   calm: no combat (alerted enemy near)
 *   meme:  the Meme Cam is running (pauses the ladder; when she is idle again it loops from `loopFrom`)
 *   hub:   the hub (no Meme Cam): after the steps she sits at `hubSit` until she moves
 */
export class IdleLadder {
  /** @param {{rand?: () => number, cfg?: typeof IDLE, memeIdle?: number}} [o] */
  constructor(o = {}) {
    this.cfg = o.cfg ?? IDLE;
    this.memeIdle = o.memeIdle ?? PLAYER.memeCam?.idle ?? 15;
    this.rand = o.rand ?? Math.random;
    this.t = 0; this.fired = 0; this.looped = false; this.afterMeme = false; this.sitting = false;
    /** the last step fired (read by tests / debug) */
    this.last = null;
  }

  /** Everything back to 0 (she moved, a fight, a cutscene). */
  reset() { this.t = 0; this.fired = 0; this.looped = false; this.afterMeme = false; this.sitting = false; }

  /** Start a loop: the clock at `loopFrom`, the steps before it count as done. */
  _loop() {
    const from = this.cfg.loopFrom;
    this.t = from; this.fired = 0; this.looped = true;
    STEPS.forEach(([, at], i) => { if (at < from) this.fired |= 1 << i; });
  }

  /**
   * @param {number} dt @param {{still: boolean, calm: boolean, meme?: boolean, hub?: boolean}} s
   * @returns {string|null}
   */
  update(dt, s) {
    if (s.meme) { this.afterMeme = true; this.sitting = false; return null; }
    if (!s.still || !s.calm) { this.reset(); return null; }
    if (this.afterMeme) { this.afterMeme = false; this._loop(); }
    this.t += dt;
    for (let i = 0; i < STEPS.length; i++) {
      const bit = 1 << i;
      if (this.fired & bit || this.t < STEPS[i][1]) continue;
      this.fired |= bit;
      const name = this.looped && this.rand() < this.cfg.sneezeP ? 'sneeze' : STEPS[i][0];
      this.last = name;
      return name;
    }
    if (s.hub) {
      if (!this.sitting && this.t >= this.cfg.hubSit) { this.sitting = true; this.last = 'sit'; return 'sit'; }
      return null;
    }
    // the Meme Cam takes over at memeIdle; if it can't (suppressed, no fog, an enemy around) loop on our own once the
    // looped steps would have run as long again
    if (this.t >= this.memeIdle + (this.cfg.twirl - this.cfg.loopFrom)) this._loop();
    return null;
  }
}
