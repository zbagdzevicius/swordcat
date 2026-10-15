// src/enemies/types/stealer.js  (owner: enemies) — Post Stealer (GAME_DESIGN §10.2–§10.3; U9).
// Rogue_Hooded.glb at 1.2 m, a skinny hyena head, the "POST STEALER" plate and a mailbag. Fast (6.0 m/s).
//   stealer_snatch  purple `grab` swirl 0.6 s (rubs its paws, eyes glint) → a 9 m/s dash for 0.35 s. Dodge only (a
//                   block is broken). On contact it steals 10% of her fish (min 5, max 50); with fewer than 5 fish
//                   one milk bottle; with no milk a 1-damage shove. `item:stolen` {thief, item, amount}.
//   getaway         it flees at 6.0 m/s to the nearest `fog_edge_*` anchor and despawns with the loot after 8 s.
//   any hit         drops all the loot + 5 bonus fish in front of it: `item:returned` {item, amount, bonus, thief}
//                   ("Post returned!"), then it fights on.
// The Line (§12.6): a runner stealer that reaches the winch steals the pin (`item: 'pin'`; world freezes the repair);
// a hit drops it (`item:returned` {item: 'pin'}); after 8 s it escapes. One pin thief at a time.
// B2 adds join Cacklejaw's Jeer Duet (aura r 10 for 3 s; hyenaStates JEER with a per-enemy override).
import { ENEMIES, ATTACKS, PLAYER } from '../../core/config.js';
import { E } from '../../core/events.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { M2 } from '../tuning.js';
import { dressKayKit } from './kaykitGear.js';
import { JEER, jeerOff } from './hyenaStates.js';
import * as THREE from 'three';

const def = ENEMIES.stealer;
const SNATCH = ATTACKS.stealer_snatch;
/** The snatch is a grab: "Dodge only" (§8.1) — a block doesn't stop it. */
const SNATCH_DEF = Object.freeze({ ...SNATCH, unblockable: true });
const SHOVE = Object.freeze({ id: 'stealer_shove', dmg: 1, knock: SNATCH.knock ?? 2, poise: 1, telegraph: 'grab' });
const _d = new THREE.Vector3();

/**
 * What a snatch takes (U9): 10% of her fish (min 5, max 50); fewer than 5 fish → 1 milk bottle; no milk → a 1-damage
 * shove. Pure; exported for tests.
 * @param {number} fish @param {number} milk @param {{frac: number, min: number, max: number}} [cfg]
 * @returns {{item: 'fish'|'milk'|'shove', amount: number}}
 */
export function stealPlan(fish, milk, cfg = SNATCH.steal) {
  if (fish >= cfg.min) return { item: 'fish', amount: Math.min(fish, Math.max(cfg.min, Math.min(cfg.max, Math.round(fish * cfg.frac)))) };
  if (milk >= 1) return { item: 'milk', amount: 1 };
  return { item: 'shove', amount: 0 };
}

/** Nearest `fog_edge_<i>` anchor to `pos` (null if the level has none). */
function nearestFogEdge(e) {
  const lv = e.ctx.levels;
  let best = null, bd = Infinity;
  for (let i = 0; i < M2.stealer.fogEdges; i++) {
    const a = lv?.anchor?.(`fog_edge_${i}`);
    if (!a?.pos) continue;
    const d = Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z);
    if (d < bd) { bd = d; best = a.pos; }
  }
  return best;
}

/** Take the loot from her (fish from GameState, milk from the player) and start the getaway. */
function steal(e, p) {
  const st = e.ctx.state, plan = stealPlan(st?.fish ?? 0, p?.milk ?? 0);
  if (plan.item === 'shove') { e.ctx.combat.applyHit(e, p, SHOVE); return false; }
  if (plan.item === 'fish') st.fish = Math.max(0, (st.fish ?? 0) - plan.amount);
  else { p.milk = Math.max(0, (p.milk ?? 0) - 1); if (st) st.milk = p.milk; }
  e.loot = { item: plan.item, amount: plan.amount };
  e.ctx.bus.emit(E.ITEM_STOLEN, { thief: e, item: plan.item, amount: plan.amount });
  e.ctx.audio?.play3D?.('stealerSnatch', e);
  return true;
}

/** Drop the loot (+ the §10.3 bonus fish) at its feet: `item:returned`. */
export function dropLoot(e) {
  const loot = e.loot;
  if (!loot) return false;
  e.loot = null;
  const bonus = loot.item === 'pin' ? 0 : (SNATCH.returnBonus ?? 5);
  const pk = e.ctx.levels?.current?.pickups;
  const at = e.pos.clone();
  _d.set(Math.sin(e.facing), 0, Math.cos(e.facing)).multiplyScalar(M2.stealer.dropSpread);
  at.add(_d);
  if (loot.item === 'fish' || bonus > 0) {
    const n = (loot.item === 'fish' ? loot.amount : 0) + bonus;
    if (pk?.spawnFish) pk.spawnFish(at, n); else if (e.ctx.state) e.ctx.state.fish = (e.ctx.state.fish ?? 0) + n;
  }
  if (loot.item === 'milk') {
    const p = e.ctx.player;
    if (pk?.spawnMilk) pk.spawnMilk(at);
    else if (p) { p.milk = Math.min(p.milkMax ?? PLAYER.milk.max, (p.milk ?? 0) + 1); }
  }
  if (loot.item === 'pin' && e.ctx.enemies?.pinThief === e) e.ctx.enemies.pinThief = null;
  e.ctx.bus.emit(E.BURST, { kind: 'fish', position: at.clone().setY(at.y + 0.5), count: 6 });
  e.ctx.bus.emit(E.ITEM_RETURNED, { item: loot.item, amount: loot.item === 'pin' ? 1 : loot.amount, bonus, thief: e });
  if (e.extraProps?.post_bag) e.extraProps.post_bag.visible = true;
  return true;
}

/**
 * TT3 contract (§11.4): drop `frac` (0..1) of the loot it carries, keep the rest and keep running (the ":3" coin drops
 * half). Fish drop as pickups (no §10.3 bonus: that comes with the full drop); a milk bottle or the pin drop only when
 * `frac` ≥ 0.5, as one item. Emits `item:returned` for what fell. Returns the amount dropped (0 without loot).
 * @param {object} e the stealer @param {number} frac
 */
export function dropStolen(e, frac) {
  const loot = e?.loot, f = Math.min(1, Math.max(0, +frac || 0));
  if (!loot || f <= 0) return 0;
  if (f >= 1) { const n = loot.amount; dropLoot(e); return n; }
  if (loot.item !== 'fish') { if (f < 0.5) return 0; const n = loot.amount; dropLoot(e); return n; }
  const n = Math.min(loot.amount, Math.max(1, Math.round(loot.amount * f)));
  if (n >= loot.amount) { dropLoot(e); return n; }
  loot.amount -= n;
  const pk = e.ctx.levels?.current?.pickups;
  const at = e.pos.clone();
  _d.set(Math.sin(e.facing), 0, Math.cos(e.facing)).multiplyScalar(-M2.stealer.dropSpread);   // behind it: it is running away
  at.add(_d);
  if (pk?.spawnFish) pk.spawnFish(at, n); else if (e.ctx.state) e.ctx.state.fish = (e.ctx.state.fish ?? 0) + n;
  e.ctx.bus.emit(E.BURST, { kind: 'fish', position: at.clone().setY(at.y + 0.5), count: 4 });
  e.ctx.bus.emit(E.ITEM_RETURNED, { item: 'fish', amount: n, bonus: 0, thief: e, partial: true });
  return n;
}

const GETAWAY = {
  anim: 'move',
  enter(e) {
    e.endTelegraph(); e.releaseToken(); e.attack = null; e.swing = null;
    e.getawayTo = nearestFogEdge(e)?.clone() ?? null;
    e.getawayT = 0;
    e.head?.setExpression?.('laugh');
  },
  update(e, dt) {
    e.getawayT += dt;
    const p = e.ctx.player;
    let tx, tz;
    if (e.getawayTo) { tx = e.getawayTo.x; tz = e.getawayTo.z; }
    else {                                                   // no fog edges: straight away from her
      if (p) _d.set(e.pos.x - p.pos.x, 0, e.pos.z - p.pos.z); else _d.set(Math.sin(e.facing), 0, Math.cos(e.facing));
      if (_d.lengthSq() < 1e-6) _d.set(Math.sin(e.facing), 0, Math.cos(e.facing));
      _d.normalize(); tx = e.pos.x + _d.x * 5; tz = e.pos.z + _d.z * 5;
    }
    e.steerTo(tx, tz, SNATCH.fleeSpeed ?? e.def.run ?? 6, dt);
    e.faceVel(dt, 12);
    if (e.getawayT >= (SNATCH.despawnAfter ?? 8)) {
      // it got away with the loot
      if (e.loot?.item === 'pin' && e.ctx.enemies?.pinThief === e) e.ctx.enemies.pinThief = null;
      e.ctx.story?.barks?.enemy?.(e, 'escape');
      e.ctx.bus.emit(E.BURST, { kind: 'smoke', position: e.pos.clone(), count: 8 });
      e.escaped = true;
      e.ctx.enemies?.despawn?.(e);
    }
  },
  exit(e) { e.head?.setExpression?.('sneer'); },
};

/** The Line: a runner at the winch takes the pin (one thief at a time) and runs. */
function runnerArrive(e) {
  if (e.loot || e.spawnOpts?.steals === false) return;
  const mgr = e.ctx.enemies;
  if (mgr && mgr.pinThief && mgr.pinThief !== e && mgr.pinThief.alive) return;
  if (mgr) mgr.pinThief = e;
  e.loot = { item: 'pin', amount: 1 };
  e.ctx.bus.emit(E.ITEM_STOLEN, { thief: e, item: 'pin', amount: 1 });
  e.objectiveRunner = false; e.tags.delete('runner');
  e.setState('getaway');
}

export default {
  ...def,
  id: 'stealer',
  expression: 'sneer',
  anims: {
    ...CLIP_MAPS.kaykit.roles,
    stealer_snatch: { windup: { clip: 'Interact', speed: 1.4 }, strike: { clip: 'Dodge_Forward', speed: 1.6 } },
  },
  build: (e, m) => dressKayKit(e, m, e.spawnOpts?.look === 'pilfer' || e.spawnOpts?.id === 'pilfer'
    ? { look: 'pilfer', headNode: 'Rogue_Head_Hooded', bag: true, expression: 'sneer' }
    : { look: 'stealer', headNode: 'Rogue_Head_Hooded', bag: true, expression: 'sneer' }),
  init(e) { e.loot = null; e.jeerOverride = null; e.dropStolen = (frac) => dropStolen(e, frac); },   // TT3 §11.4
  moves: { stealer_snatch: SNATCH_DEF },
  states: { getaway: GETAWAY, jeer: JEER },
  onHitWhile: { jeer: 'choke' },
  /** No second snatch while it still carries loot. */
  canUse(e) { return !e.loot; },
  onRunnerArrive: runnerArrive,
  /** Snatch contact: take the loot (or shove), then run for it. */
  onDashHit(e, p, result) {
    if (e.attack?.id !== 'stealer_snatch' || !p || p !== e.ctx.player) return;
    if (result !== 'hit' && result !== 'break') return;
    if (steal(e, p)) {
      if (e.extraProps?.post_bag) e.extraProps.post_bag.visible = true;
      e.setState('getaway');
    }
  },
  /** Any hit while carrying loot drops it all (+5 fish); then it fights on. The ":3" coin (`trickCoin`) only knocks
   *  out the half it already dropped through `dropStolen` (TT3 §11.3), so it keeps the rest and keeps running. */
  onHit(e, hit) {
    if (e.loot && hit?.def?.id !== 'trickCoin') dropLoot(e);
  },
  onDeath(e) { if (e.loot) dropLoot(e); },
  onDispose(e) {
    jeerOff(e);
    if (e.loot?.item === 'pin' && e.ctx.enemies?.pinThief === e) e.ctx.enemies.pinThief = null;
  },
};
