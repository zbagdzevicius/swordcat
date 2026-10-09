// src/enemies/tuning.js  (owner: enemies) — enemy/boss numbers that GAME_DESIGN states in prose (§8, §10, §11) but
// Appendix A doesn't carry. Data only; requested from core as config additions in requests/enemies.md. Once core
// adds them to config, these become fallbacks (nothing here overrides an Appendix A value).
export const TUNING = Object.freeze({
  windupMin: 0.45,                       // §10.1 minimum windup on Knight (scaled by the difficulty windup multiplier)
  alertHopV: 2.2,                        // §10.1 alert: a 0.4 s "!" hop (vertical speed; GRAVITY 22 → ~0.2 s up + 0.2 s down)
  alertDur: 0.4,
  bang: { dur: 0.6, pop: 0.2, perH: 0.4, min: 0.28, max: 0.6, lift: 0.1, color: '#F2E6C8', ink: '#2B2330' },   // the alert "!" (m)
  groupAlertRadius: 8,                   // idle pack-mates within this radius join an alert
  groupAlertDelay: [0.15, 0.45],
  hitFlash: 0.06,                        // §8.2 light hit: 60 ms white flash on the target
  hitReact: 0.12,                        // §10.3 hit reactions: 0.12 s Hit_A / HitReact, else squash
  squash: { dur: 0.15, y: 0.8 },         // §10.1 missing clip → procedural squash (0.15 s, scale y 0.8)
  orbitMul: 1.4,                         // §8.3 tokenless enemies orbit at 1.4× their attack range
  orbitDrift: 0.45,                      // rad/s around the player while waiting for a token
  orbitRepick: [1.5, 3.0],
  windupTrackStop: 0.15,                 // stop turning this long before the strike (fair windups)
  turnRate: 10, chaseTurnRate: 8, windupTurnRate: 6,
  steerDamp: 8,
  idleTime: [1.5, 3.5],                  // tech.md §10 idle → patrol
  patrolTimeout: 6,
  arrive: 0.4,
  heardFrac: 0.35,                       // tech.md §10 canSee: closer than sight × 0.35 is "heard" (no FOV check)
  thinkEvery: 0.1,                       // perception at 10 Hz, staggered per id
  returnHeal: true,                      // tech.md §10 return: hp back to max at home
  cooldown: [0.35, 0.9],                 // between attacks when the row gives none
  recoverDefault: 0.8,
  blockRecoil: 2.5,                      // m/s pushed back when the player blocks
  die: { dur: 1.0, scamperDur: 1.1, scamperSpeed: 4.5, shrink: 0.3 },   // §10.1 never violent: poof, helmet, scamper
  helmet: { up: 3.2, side: 1.6, spin: 14, life: 1.2 },
  crow: { hoverDist: 3.5, hoverUp: 0.6, landDist: 0.35 },
  xbow: { strafe: [1.5, 3.0], perchMinY: 0.3, muzzleUp: 0.45, muzzleFwd: 0.45 },
  boss: { phaseInvuln: 1.0, addsRing: 6, dizzyEventEvery: 0.25, fallbackRange: 2.2 },
  animFarDist: 40,                       // tech.md §11.1: mixers beyond this update every 2nd frame
  pending: true,                         // §8.3 arena budget: spawns beyond the cap wait dormant for a free slot
  capRadius: 30,                         // §8.3: unalerted enemies farther than this from a spawn are another fight
  // walkers never path into deep water (the Old Bridge stream): a step whose probe point (radius + probe + speed × look
  // ahead) is deep turns by the listed angles (rad) until dry, else stops; one that ends up in deep water anyway
  // (knockback) for `rescueAfter` s, or an arena member more than `arenaSlack` m outside its locked arena, is put back
  // on its last dry footing / the nearest valid arena ring point (else despawned: the wave can still clear)
  water: { probe: 0.45, lookAhead: 0.3, turns: [0.6, -0.6, 1.2, -1.2, 1.75, -1.75, 2.4, -2.4], rescueAfter: 0.35, arenaSlack: 2, dryEvery: 0.2 },
  // open-zone enemies leave a locked arena they don't belong to alone: no alert on her while she is inside it,
  // a running chase drops back to `return`, and flyers are kept `flyerPad` m outside its fog wall
  foreignArena: { pad: 0.5, flyerPad: 1.0 },
  standoff: 0.35,                        // m between a long-bodied enemy's capsule front (its snout) and her collider
  perch: { search: 2.5, ring: 0.2, arc: 0.12, minFrac: 0.6, slack: 0.45 },   // `{ y }` spawns snap onto a nearby wall / cart top
});

/** Seeded pick in [a, b] (rng = ctx.rng). */
export function rangeOf(rng, v) {
  if (!Array.isArray(v)) return v;
  return v[0] + (v[1] - v[0]) * rng();
}
