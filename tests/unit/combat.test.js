// tests/unit/combat.test.js  (owner: combat) — U4 (difficulty damage rounding + tokens) and the combat resolve path:
// swept arcs, applyHit (immune / parry / block / break / hit / kill, crit, dmgMul, god, lethal hook, poise),
// juice (hitstop, slow-mo, per-step shake cap), AttackTokens fairness, pooled projectiles + reflect + holyWave.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fakeCtx } from './_fakeCtx.mjs';
import { Actor } from '../../src/core/Actor.js';
import { E } from '../../src/core/events.js';
import { ATTACKS, PLAYER, JUICE, DIFFICULTY, COMPANIONS } from '../../src/core/config.js';
import { Combat, sectorHit } from '../../src/combat/Combat.js';
import { AttackTokens } from '../../src/combat/AttackTokens.js';
import { attack, swingAngle, swingProgress, juiceFor, reflectedDef, ringDef, sharpMul, COMBAT } from '../../src/combat/attacks.js';

const DT = 1 / 60;

function setup(state) {
  const ctx = fakeCtx({ systems: false, state });
  ctx.combat = new Combat(ctx);
  const events = [];
  const emit = ctx.bus.emit.bind(ctx.bus);
  ctx.bus.emit = (type, payload) => { events.push({ type, payload }); return emit(type, payload); };
  ctx.input.rumble = () => {};
  return { ctx, combat: ctx.combat, events, of: (t) => events.filter((e) => e.type === t).map((e) => e.payload) };
}

/** A registered dummy actor at (x, y, z) facing `facing`. */
function mk(ctx, faction, x, z, { hp = 30, mass = 1, poise = 2, radius = 0.3, height = 1, facing = 0, y = 0 } = {}) {
  const a = new Actor(ctx, { faction, radius, height, maxHp: hp, mass, maxPoise: poise });
  a.pos.set(x, y, z); a.facing = facing; a.onGround = true;
  a.hits = []; a.deaths = 0;
  a.onHit = (h) => a.hits.push(h);
  a.onDeath = () => { a.deaths++; };
  ctx.actors.register(a);
  return a;
}

const at = (ang, d) => [Math.sin(ang) * d, Math.cos(ang) * d];

function runSwing(combat, s, maxT = 2) {
  const steps = [];
  for (let t = 0; t < maxT && !s.done; t += DT) steps.push(combat.updateSwing(s, DT));
  return steps;
}

// ------------------------------------------------------------------ attacks.js
test('attacks: table ids, attack() lookup, swing curve, juice rows, derived defs', () => {
  for (const [k, v] of Object.entries(ATTACKS)) assert.equal(v.id, k);
  assert.equal(attack('slash1'), ATTACKS.slash1);
  assert.throws(() => attack('slash9'), /unknown attack/);
  const s1 = ATTACKS.slash1;
  assert.equal(swingAngle(s1, 0), s1.arc.from);
  assert.equal(swingAngle(s1, s1.active[1]), s1.arc.to);
  assert.ok(swingProgress(s1, 0.16) > 0.5, 'eased: fast start');
  assert.deepEqual(juiceFor(s1, 'enemy', 'player'), { kind: 'light', hitstop: 0.05, shake: 0.15, rumble: JUICE.light.rumble });
  assert.equal(juiceFor(ATTACKS.slash3, 'enemy', 'player').kind, 'heavy');
  assert.equal(juiceFor(ATTACKS.holy, 'enemy', 'player').rumble, JUICE.holy.rumble);
  const hurt = juiceFor(ATTACKS.hyena_slash, 'player', 'enemy');
  assert.equal(hurt.hitstop, PLAYER.hurt.hitstop);
  assert.ok(Math.abs(hurt.shake - PLAYER.hurt.shake * JUICE.hurt.shakeMul) < 1e-9, 'player hurt shake 0.3 × 1.4');
  assert.equal(juiceFor(ATTACKS.holyWave, 'enemy', 'player').hitstop, 0.06, '§7.2 holyWave 0.06 / 0.20');
  const r = reflectedDef(ATTACKS.rat_bolt);
  assert.equal(r.id, 'rat_bolt'); assert.equal(r.dmg, 25); assert.equal(r.reflected, true); assert.equal(r.telegraph, undefined);
  assert.equal(reflectedDef(ATTACKS.rat_bolt), r, 'cached');
  assert.equal(reflectedDef(ATTACKS.spider_web).dmg, 10);
  const ring = ringDef(ATTACKS.pounce);
  assert.equal(ring.dmg, 10); assert.equal(ring.arc.range, 1.3); assert.equal(ring.id, 'pounce');
  assert.equal(sharpMul(0), 1); assert.equal(sharpMul(2), 1.30);
});

// ------------------------------------------------------------------ geometry
test('sectorHit: range + radius, height band, point blank, arc slice with radius pad, full circle', () => {
  const att = { pos: new THREE.Vector3(), facing: 0 };
  const arc = { range: 1.9, from: 1.2, to: -1.2, y0: 0, y1: 1.4 };
  const tgt = (x, z, y = 0) => ({ pos: new THREE.Vector3(x, y, z), radius: 0.3, height: 1 });
  assert.ok(sectorHit(att, tgt(0, 2.1), arc, -1, 1), 'range includes the target radius');
  assert.ok(!sectorHit(att, tgt(0, 2.3), arc, -1, 1));
  assert.ok(!sectorHit(att, tgt(0, 1.5, 1.5), arc, -1, 1), 'above the arc');
  assert.ok(!sectorHit(att, tgt(0, 1.5, -1.1), arc, -1, 1), 'below the arc');
  assert.ok(sectorHit(att, tgt(0, -0.4), arc, 0.5, 0.6), 'point blank');
  assert.ok(sectorHit(att, tgt(...at(0.55, 1.5)), arc, 0.5, 0.6));
  assert.ok(!sectorHit(att, tgt(...at(-0.6, 1.5)), arc, 0.5, 0.6), 'outside the slice');
  assert.ok(sectorHit(att, tgt(...at(0.75, 1.5)), arc, 0.5, 0.6), 'slice padded by asin(r / d)');
  assert.ok(sectorHit(att, tgt(0, -1.5), ATTACKS.holy.arc, 0, 0.01), 'full circle');
});

test('updateSwing: slash1 sweeps left → right, each target once, nothing behind or out of range', () => {
  const { ctx, combat } = setup();
  const cat = mk(ctx, 'player', 0, 0);
  const L = mk(ctx, 'enemy', ...at(1.0, 1.5)), R = mk(ctx, 'enemy', ...at(-1.0, 1.5));
  const B = mk(ctx, 'enemy', 0, -1.5), far = mk(ctx, 'enemy', 0, 3), friend = mk(ctx, 'ally', ...at(0, 1.2));
  const s = combat.beginSwing(cat, ATTACKS.slash1, { assist: false });
  const steps = runSwing(combat, s);
  const stepOf = (a) => steps.findIndex((_, i) => a.hits.length && a.hits[0] && i >= 0) ;
  assert.equal(L.hits.length, 1); assert.equal(R.hits.length, 1);
  assert.equal(B.hits.length, 0); assert.equal(far.hits.length, 0); assert.equal(friend.hits.length, 0, 'no friendly fire');
  assert.equal(steps.reduce((a, b) => a + b, 0), 2, 'returns damaging hits');
  assert.ok(stepOf(L) >= 0);
  // order: the left target is hit before the right one
  const { log } = combat;
  assert.equal(log[0].targetId, L.id); assert.equal(log[1].targetId, R.id);
  assert.equal(L.hp, 20); assert.equal(s.hits, 2); assert.ok(s.landed); assert.ok(s.done);
  assert.ok(Math.abs(s.angle - ATTACKS.slash1.arc.to) < 1e-9, 'swing.angle ends at arc.to');
});

test('updateSwing: invulnerable targets are retried; dead attackers deal nothing; parry cancels the swing', () => {
  const { ctx, combat } = setup();
  const rat = mk(ctx, 'enemy', 0, 0);
  const cat = mk(ctx, 'player', 0, 1.0, { facing: Math.PI, hp: 8 });
  cat.invulnT = 0.05;
  const s = combat.beginSwing(rat, ATTACKS.rat_poke);
  let n = 0;
  for (let i = 0; i < 12; i++) { cat.invulnT = Math.max(0, cat.invulnT - DT); n += combat.updateSwing(s, DT); }
  assert.equal(n, 1, 'hit once the i-frames ran out (still inside the active window)');
  assert.equal(cat.hp, 7);
  const dead = mk(ctx, 'enemy', 0, 0.2); dead.alive = false;
  cat.invulnT = 0;
  assert.equal(runSwing(combat, combat.beginSwing(dead, ATTACKS.rat_poke)).reduce((a, b) => a + b, 0), 0);
  cat.resolveIncoming = () => 'parry';
  let parried = 0; rat.onParried = () => parried++;
  const s2 = combat.beginSwing(rat, ATTACKS.rat_poke);
  runSwing(combat, s2);
  assert.equal(parried, 1); assert.ok(s2.parried && s2.cancelled);
});

// ------------------------------------------------------------------ U4: difficulty
test('U4: damage the player takes is rounded per difficulty (Kitten max(1, floor(×0.5)), Knight ×1, Nine Lives ceil(×1.5))', () => {
  const expect = { kitten: [1, 1, 1, 2, 2], knight: [1, 2, 3, 4, 5], nine: [2, 3, 5, 6, 8] };
  for (const [diff, want] of Object.entries(expect)) {
    const { ctx, combat } = setup({ difficulty: diff });
    const rat = mk(ctx, 'enemy', 0, 0);
    const cat = mk(ctx, 'player', 0, 1, { hp: 100 });
    for (let d = 1; d <= 5; d++) {
      cat.invulnT = 0; const before = cat.hp;
      combat.applyHit(rat, cat, { id: 'test', dmg: d, knock: 0, poise: 0 });
      assert.equal(before - cat.hp, want[d - 1], `${diff}: ${d} → ${want[d - 1]}`);
    }
    assert.equal(cat.invulnT, PLAYER.hurt.iframes, 'player i-frames after a hit');
    cat.invulnT = 0; const hp0 = cat.hp;
    combat.applyHit(rat, cat, ATTACKS.dummy_swing);
    assert.equal(cat.hp, hp0, `${diff}: a 0-damage attack stays 0 (tutorial props can't hurt)`);
    assert.equal(cat.invulnT, COMBAT.antiMultiHit, 'a harmless bump grants only the anti multi-hit window (no blinking)');
  }
});

test('harmless bumps: light juice, no rumble, no hurt row; HIT reports the hp she actually lost', () => {
  const { ctx, combat, of } = setup();
  let rumbles = 0; ctx.input.rumble = () => rumbles++;
  const dummy = mk(ctx, 'enemy', 0, 0);
  const cat = mk(ctx, 'player', 0, 1, { hp: 8 });
  assert.equal(combat.applyHit(dummy, cat, ATTACKS.dummy_swing), 'hit');
  assert.deepEqual(ctx.game.hitstops, [JUICE.light.hitstop]);
  assert.ok(Math.abs(of(E.SHAKE)[0].trauma - JUICE.light.shake) < 1e-9);
  assert.equal(rumbles, 0);
  assert.ok(cat.vel.z > 0, 'still knocked back');
  // her hp setter (Golden Hour halving / Still Standing) decides what she really loses
  Object.defineProperty(cat, 'hp', { get() { return this._h ?? 8; }, set(v) { this._h = Math.max(v, 1); }, configurable: true });
  cat.invulnT = 0;
  combat.applyHit(dummy, cat, ATTACKS.hyena_slash);
  cat.invulnT = 0;
  combat.applyHit(dummy, cat, { ...ATTACKS.hyena_slash, dmg: 20 });
  const h = of(E.HIT).filter((x) => x.target === cat).map((x) => x.damage);
  assert.deepEqual(h, [0, 2, 5], 'bump 0, slash 2, then 20 floored to the 1 HP she had left beyond 1');
  assert.equal(cat.alive, true);
});

test('U4: attack tokens per difficulty (Kitten 1/1, Knight 2/2, Nine Lives 3/2)', () => {
  for (const [diff, [m, r]] of Object.entries({ kitten: [1, 1], knight: [2, 2], nine: [3, 2] })) {
    const { ctx, combat } = setup({ difficulty: diff });
    assert.deepEqual(DIFFICULTY[diff].tokens, [m, r]);
    const foes = Array.from({ length: 5 }, (_, i) => mk(ctx, 'enemy', i, 5));
    assert.equal(foes.filter((f) => combat.tokens.acquire(f, 'melee')).length, m, `${diff} melee`);
    const archers = Array.from({ length: 5 }, (_, i) => mk(ctx, 'enemy', i, 9));
    assert.equal(archers.filter((f) => combat.tokens.acquire(f, 'ranged')).length, r, `${diff} ranged`);
    assert.ok(combat.tokens.acquire(foes[0], 'melee'), 're-acquiring a held token');
    combat.tokens.release(foes[0]);
    assert.ok(!combat.tokens.has(foes[0]));
  }
  // the limit is read live: switching difficulty applies at once
  const { ctx, combat } = setup({ difficulty: 'knight' });
  const a = mk(ctx, 'enemy', 0, 5), b = mk(ctx, 'enemy', 1, 5), c = mk(ctx, 'enemy', 2, 5);
  assert.ok(combat.tokens.acquire(a)); assert.ok(combat.tokens.acquire(b)); assert.ok(!combat.tokens.acquire(c));
  ctx.state.difficulty = 'nine';
  assert.ok(combat.tokens.acquire(c));
});

test('AttackTokens: fair queue (longest waiter first), stale waiters, dead holders reclaimed, max hold', () => {
  let now = 0;
  const tk = new AttackTokens(() => [1, 1], () => now);
  const A = { id: 1, alive: true }, B = { id: 2, alive: true }, C = { id: 3, alive: true };
  assert.ok(tk.acquire(A));
  now = 0.01; assert.ok(!tk.acquire(B));
  now = 0.05; assert.ok(!tk.acquire(C));
  now = 0.10; tk.release(A);
  assert.ok(!tk.acquire(C), 'C asks first but B has waited longer');
  assert.ok(tk.acquire(B), 'B gets the token');
  assert.ok(tk.isWaiting(C));
  tk.release(B);
  now = 0.12; assert.ok(tk.acquire(C));
  tk.release(C);
  // stale waiter: B asked long ago and stopped asking
  now = 1; assert.ok(tk.acquire(A)); now = 1.01; assert.ok(!tk.acquire(B));
  now = 1.02; tk.release(A); now = 1.02 + COMBAT.tokenStale + 0.01;
  assert.ok(tk.acquire(C), 'a stale request does not block');
  // dead holder reclaimed
  C.alive = false; now += 0.01;
  assert.ok(tk.acquire(A), 'a dead holder frees its token');
  // max hold
  now += COMBAT.tokenMaxHold + 1;
  assert.ok(tk.acquire(B), 'a token held too long is reclaimed');
  tk.prune((a) => a !== B);
  assert.equal(tk.count('melee'), 0);
  // orbit slots spread the line around the target
  const tgt = { pos: { x: 0, y: 0, z: 0 }, facing: 0 };
  const w = [4, 5, 6].map((id) => ({ id, alive: true, pos: { x: 0, y: 0, z: 0 } }));
  tk.clear(); now = 5; tk.acquire({ id: 99, alive: true });
  for (const a of w) tk.acquire(a);
  const pts = w.map((a) => tk.orbitPoint(a, tgt, 2, {}));
  for (const p of pts) assert.ok(Math.abs(Math.hypot(p.x, p.z) - 2) < 1e-9);
  assert.ok(Math.hypot(pts[0].x - pts[1].x, pts[0].z - pts[1].z) > 1, 'distinct slots');
});

// ------------------------------------------------------------------ applyHit paths
test('applyHit: parry → onParried(gold), hitstop 0.12, slow-mo 0.5/0.15, player:parry; no damage', () => {
  const { ctx, combat, of } = setup();
  const rat = mk(ctx, 'enemy', 0, 0);
  const cat = mk(ctx, 'player', 0, 1, { hp: 8 });
  cat.resolveIncoming = (att, def, dir) => { cat.lastDir = dir.clone(); return 'parry'; };
  let got = null; rat.onParried = (by, o) => { got = { by, ...o }; };
  assert.equal(combat.applyHit(rat, cat, ATTACKS.rat_poke2), 'parry');
  assert.deepEqual({ by: got.by, gold: got.gold }, { by: cat, gold: true });
  assert.equal(cat.hp, 8);
  assert.ok(cat.lastDir.z > 0.99, 'hitDir points from the attacker into the target');
  assert.ok(ctx.game.hitstops.includes(PLAYER.guard.parryHitstop));
  assert.deepEqual(ctx.game.slowMos.at(-1), PLAYER.guard.parryTimeScale);
  const p = of(E.PLAYER_PARRY)[0];
  assert.equal(p.attacker, rat); assert.equal(p.gold, true); assert.ok(p.position.isVector3);
  assert.equal(of(E.HIT).length, 0, 'a player parry is not a combat:hit');
  assert.equal(combat.lastParry.attacker, rat);
});

test('applyHit: block → 0 damage, pushback, onBlocked, block juice, combat:hit {blocked}', () => {
  const { ctx, combat, of } = setup();
  const rat = mk(ctx, 'enemy', 0, 0);
  const cat = mk(ctx, 'player', 0, 1, { hp: 8 });
  cat.resolveIncoming = () => 'block';
  let blocked = 0; rat.onBlocked = () => blocked++;
  assert.equal(combat.applyHit(rat, cat, ATTACKS.rat_poke), 'block');
  assert.equal(cat.hp, 8); assert.equal(blocked, 1);
  assert.ok(Math.abs(cat.vel.z - PLAYER.guard.pushback * COMBAT.pushbackVelMul) < 1e-9);
  const h = of(E.HIT)[0];
  assert.equal(h.blocked, true); assert.equal(h.damage, 0); assert.equal(h.parried, false);
  assert.ok(ctx.game.hitstops.includes(JUICE.block.hitstop));
  assert.equal(cat.invulnT, 0, 'a block grants no i-frames');
});

test('applyHit: break → full damage + guard-break stagger; immune / perfectDodge → nothing; none while invulnerable', () => {
  const { ctx, combat, of } = setup();
  const hy = mk(ctx, 'enemy', 0, 0);
  const cat = mk(ctx, 'player', 0, 1, { hp: 8 });
  cat.resolveIncoming = () => 'break';
  assert.equal(combat.applyHit(hy, cat, ATTACKS.hyena_lunge), 'break');
  assert.equal(cat.hp, 6); assert.ok(cat.staggerT >= PLAYER.guard.breakStagger);
  assert.ok(ctx.game.hitstops.includes(JUICE.guardBreak.hitstop));
  assert.equal(of(E.HIT)[0].broke, true);
  assert.equal(combat.applyHit(hy, cat, ATTACKS.hyena_slash), 'none', 'i-frames');
  cat.invulnT = 0; cat.resolveIncoming = () => 'perfectDodge';
  assert.equal(combat.applyHit(hy, cat, ATTACKS.hyena_slash), 'immune');
  assert.equal(cat.hp, 6); assert.equal(of(E.HIT).length, 1);
  cat.resolveIncoming = () => 'graze';
  assert.equal(combat.applyHit(hy, cat, ATTACKS.hyena_slash), 'immune');
});

test('applyHit: hit → knockback / lift, anti multi-hit, poise stagger, hitstop + kill bonus, onDeath, combat:hit', () => {
  const { ctx, combat, of } = setup();
  const cat = mk(ctx, 'player', 0, 0);
  const rat = mk(ctx, 'enemy', 0, 1, { hp: 20, mass: 0.8, poise: 2 });
  assert.equal(combat.applyHit(cat, rat, ATTACKS.slash1), 'hit');
  assert.equal(rat.hp, 10);
  assert.ok(Math.abs(rat.vel.z - ATTACKS.slash1.knock / 0.8) < 1e-9, 'knock / mass');
  assert.ok(rat.vel.y > 0 && rat.vel.y <= COMBAT.knockLiftMax); assert.equal(rat.onGround, false);
  assert.equal(rat.invulnT, COMBAT.antiMultiHit);
  assert.equal(rat.staggerT, 0, 'poise 2 → 1: no stagger yet');
  assert.ok(ctx.game.hitstops.includes(ATTACKS.slash1.hitstop));
  rat.invulnT = 0;
  assert.equal(combat.applyHit(cat, rat, ATTACKS.slash1), 'hit');
  assert.equal(rat.alive, false); assert.equal(rat.deaths, 1);
  assert.ok(ctx.game.hitstops.some((h) => Math.abs(h - (ATTACKS.slash1.hitstop + JUICE.kill.hitstopAdd)) < 1e-9), 'kill adds 0.04');
  const h = of(E.HIT).at(-1);
  assert.equal(h.killed, true); assert.equal(h.attackId, 'slash1'); assert.equal(h.damage, 10); assert.equal(h.attacker, cat);
  assert.equal(h.crit, false); assert.equal(h.blocked, false); assert.equal(h.parried, false);
  assert.equal(combat.applyHit(cat, rat, ATTACKS.slash1), 'none', 'the dead take no hits');
  const pug = mk(ctx, 'enemy', 1, 1, { hp: 60, poise: 1 });
  combat.applyHit(cat, pug, ATTACKS.slash1);
  assert.equal(pug.staggerT, COMBAT.poiseBreakStagger, 'poise break → stagger 0.6'); assert.equal(pug.poise, 1, 'poise refilled');
  assert.equal(of(E.HIT).find((x) => x.target === pug).popsSlime, false);
});

test('applyHit: crit (riposte ×2, dizzy critTaken), dmgMul, Golden Hour / sharpness via dealtMul, god, lethal hook, super armour', () => {
  const { ctx, combat, of } = setup();
  const cat = mk(ctx, 'player', 0, 0);
  const t = () => { const e = mk(ctx, 'enemy', 0, 1, { hp: 200 }); return e; };
  let e = t(); combat.applyHit(cat, e, ATTACKS.riposte); assert.equal(200 - e.hp, 36, 'riposte 18 ×2 crit = 36');
  assert.equal(of(E.HIT).at(-1).crit, true);
  e = t(); e.critTaken = 2; combat.applyHit(cat, e, ATTACKS.slash1); assert.equal(200 - e.hp, 20, 'dizzy ×2');
  e = t(); e.isDizzy = true; combat.applyHit(cat, e, ATTACKS.slash1); assert.equal(200 - e.hp, 20, 'isDizzy fallback');
  e = t(); combat.applyHit(cat, e, ATTACKS.slash1, { dmgMul: 1.5 }); assert.equal(200 - e.hp, 15);
  e = t(); combat.applyHit(cat, e, ATTACKS.slash1, { crit: PLAYER.dodge.perfectCrit }); assert.equal(200 - e.hp, 15, 'perfect-dodge crit ×1.5');
  cat.golden = true; ctx.state.upgrades.sharp = 1;
  assert.ok(Math.abs(combat.dealtMul(cat) - 1.5 * 1.15) < 1e-9);
  const s = combat.beginSwing(cat, ATTACKS.slash1, { assist: false, projectiles: false });
  assert.ok(Math.abs(s.hitOpts.dmgMul - 1.725) < 1e-9);
  cat.golden = false; ctx.state.upgrades.sharp = 0;
  e = t(); e.god = true; combat.applyHit(cat, e, ATTACKS.holy); assert.equal(e.hp, 200, 'god takes no damage'); assert.equal(e.alive, true);
  const hero = mk(ctx, 'player', 5, 5, { hp: 2 });
  let lethal = 0; hero.onLethal = () => { lethal++; hero.hp = 1; return true; };
  combat.applyHit(e, hero, ATTACKS.hyena_slash);
  assert.equal(lethal, 1); assert.equal(hero.hp, 1); assert.equal(hero.alive, true, 'Still Standing hook keeps her alive');
  const tank = t(); tank.superArmor = true;
  combat.applyHit(cat, tank, ATTACKS.slash3);
  assert.equal(tank.vel.lengthSq(), 0, 'super armour: no knockback'); assert.equal(tank.staggerT, 0);
  hero.invulnT = 0; hero.hp = 8; hero.damageTakenMul = PLAYER.golden.takenMul;
  combat.applyHit(e, hero, ATTACKS.rat_poke);
  assert.equal(hero.hp, 8, 'Golden Hour: 1-HP hits do nothing (×0.5, rounded down)');
});

test('applyHit juice: several targets in one step shake like the strongest hit, not the sum', () => {
  const { ctx, combat, of } = setup();
  const cat = mk(ctx, 'player', 0, 0);
  const a = mk(ctx, 'enemy', 0, 1, { hp: 100 }), b = mk(ctx, 'enemy', 1, 1, { hp: 100 }), c = mk(ctx, 'enemy', -1, 1, { hp: 100 });
  combat.applyHit(cat, a, ATTACKS.slash1);
  combat.applyHit(cat, b, ATTACKS.slash3);
  combat.applyHit(cat, c, ATTACKS.slash1);
  const total = of(E.SHAKE).reduce((s, x) => s + x.trauma, 0);
  assert.ok(Math.abs(total - ATTACKS.slash3.shake) < 1e-9, `trauma ${total}`);
  // companion skirmishes never freeze the world
  const { ctx: c2, combat: k2 } = setup();
  const mochi = mk(c2, 'ally', 0, 0), rat = mk(c2, 'enemy', 0, 1);
  k2.applyHit(mochi, rat, { id: 'companion', dmg: COMPANIONS.dmg, knock: 2, poise: 1 });
  assert.equal(c2.game.hitstops.length, 0);
});

test('swing side effects: holy i-frames + slow-mo, holyWave from 2 shards, Golden Hour gleam, dedupe', () => {
  const { ctx, combat } = setup();
  const cat = mk(ctx, 'player', 0, 0);
  const rat = mk(ctx, 'enemy', 0, 1);
  ctx.player = cat;
  cat.shards = 1;
  let s = combat.beginSwing(cat, ATTACKS.holy);
  cat.swing = s;
  assert.equal(cat.invulnT, 0, 'no invulnT (that would make her blink); the swing itself is the i-frame window');
  assert.equal(combat.applyHit(rat, cat, ATTACKS.rat_poke), 'immune', 'holy i-frames from 0');
  assert.equal(ctx.game.slowMos.length, 0, 'slow-mo waits for the moment of impact');
  for (let i = 0; i < 14; i++) combat.updateSwing(s, DT);
  assert.equal(ctx.game.slowMos.length, 1, 'slow-mo on the first active step, once');
  assert.deepEqual(ctx.game.slowMos.at(-1), ATTACKS.holy.timeScale);
  assert.equal(combat.applyHit(rat, cat, ATTACKS.rat_poke), 'immune', 'still inside 0–0.46');
  while (s.t < ATTACKS.holy.iframes[1] + 0.02) combat.updateSwing(s, DT);
  assert.equal(combat.applyHit(rat, cat, ATTACKS.rat_poke), 'hit', 'after 0.46 she can be hit');
  cat.swing = null; cat.invulnT = 0; cat.hp = 30;
  runSwing(combat, s);
  assert.equal(combat.projectiles.list.length, 0, 'Shard 1: no wave');
  cat.shards = 2;
  s = combat.beginSwing(cat, ATTACKS.holy);
  runSwing(combat, s);
  assert.equal(combat.projectiles.list.length, 1); assert.equal(combat.projectiles.list[0].def.id, 'holyWave');
  const again = combat.spawnProjectile(ATTACKS.holyWave, cat, cat.pos, new THREE.Vector3(0, 0, 1));
  assert.equal(again, combat.projectiles.list[0], 'the same wave from the same owner is deduplicated');
  assert.equal(combat.projectiles.list.length, 1);
  combat.projectiles.clear();
  cat.golden = true;
  runSwing(combat, combat.beginSwing(cat, ATTACKS.slash1));
  assert.equal(combat.projectiles.list.length, 1); assert.equal(combat.projectiles.list[0].def.id, 'gleam');
  assert.equal(combat.projectiles.list[0].dmgMul, PLAYER.golden.dmgMul);
  combat.projectiles.clear(); cat.golden = false;
  runSwing(combat, combat.beginSwing(cat, ATTACKS.slash1));
  assert.equal(combat.projectiles.list.length, 0);
});

test('aim assist: turns to the nearest enemy within 60° / 3 m on the first active step; Riposte turns to the parried enemy', () => {
  const { ctx, combat } = setup();
  const cat = mk(ctx, 'player', 0, 0);
  const e = mk(ctx, 'enemy', ...at(0.8, 2));
  mk(ctx, 'enemy', ...at(1.3, 1.5));                       // outside 60°
  const s = combat.beginSwing(cat, ATTACKS.slash1);
  for (let i = 0; i < 8; i++) combat.updateSwing(s, DT);
  assert.ok(Math.abs(cat.facing - 0.8) < 1e-6, `facing ${cat.facing}`); assert.equal(s.target, e);
  const { ctx: c2, combat: k2 } = setup();
  const hero = mk(c2, 'player', 0, 0);
  const rat = mk(c2, 'enemy', ...at(Math.PI * 0.9, 2.5));
  hero.resolveIncoming = () => 'parry';
  k2.applyHit(rat, hero, ATTACKS.rat_poke);
  const r = k2.beginSwing(hero, ATTACKS.riposte);
  for (let i = 0; i < 8; i++) k2.updateSwing(r, DT);
  assert.ok(Math.abs(Math.abs(hero.facing) - Math.PI * 0.9) < 1e-6, 'riposte turned around to the parried rat');
});

test('areaHit: ring band and height (jumping clears a 0.3 m shockwave); staggerArea', () => {
  const { ctx, combat } = setup();
  const pug = mk(ctx, 'enemy', 0, 0);
  const cat = mk(ctx, 'player', 0, 2, { hp: 8 });
  const ring = { ...ATTACKS.pug_slam };
  assert.equal(combat.areaHit(pug, ring, { r: 1.0, rInner: 0.7, y0: 0, y1: 0.3 }), 0, 'ring not there yet');
  cat.pos.y = 0.5;
  assert.equal(combat.areaHit(pug, ring, { r: 2.2, rInner: 1.9, y0: 0, y1: 0.3 }), 0, 'jumped over it');
  cat.pos.y = 0;
  const set = new Set();
  assert.equal(combat.areaHit(pug, ring, { r: 2.2, rInner: 1.9, y0: 0, y1: 0.3, hitSet: set }), 1);
  assert.equal(cat.hp, 6); assert.ok(set.has(cat.id));
  cat.invulnT = 0;
  assert.equal(combat.areaHit(pug, ring, { r: 2.4, rInner: 2.1, y0: 0, y1: 0.3, hitSet: set }), 0, 'once per hitSet');
  const foes = [mk(ctx, 'enemy', 0, 5), mk(ctx, 'enemy', 3, 4), mk(ctx, 'enemy', 0, 20)];
  assert.equal(combat.staggerArea(cat, PLAYER.golden.staggerRadius, PLAYER.golden.staggerDur), 3, 'pug + two within 8 m');
  assert.equal(foes[2].staggerT, 0);
});

test('applyHit without opts: the heroine deals sharpness × Golden Hour; everyone else ×1', () => {
  const { ctx, combat } = setup();
  const cat = mk(ctx, 'player', 0, 0);
  const rat = mk(ctx, 'enemy', 0, 1, { hp: 200 });
  cat.golden = true; ctx.state.upgrades.sharp = 2;
  combat.applyHit(cat, rat, ATTACKS.slash1);
  assert.equal(200 - rat.hp, Math.round(10 * 1.5 * 1.30), 'Golden Hour 1.5 × Sharp II 1.30');
  rat.invulnT = 0;
  combat.applyHit(cat, rat, ATTACKS.slash1, { dmgMul: 1 });
  assert.equal(200 - 20 - rat.hp, 10, 'an explicit dmgMul overrides');
  const hero = mk(ctx, 'player', 3, 0, { hp: 8 });
  combat.applyHit(rat, hero, ATTACKS.hyena_slash);
  assert.equal(hero.hp, 6, 'enemies deal their nominal damage');
});

test('Shield Wall: enemy swings and area hits aimed past a wall land on the wall post (block), never behind it', () => {
  const { ctx, combat, of } = setup();
  const rat = mk(ctx, 'enemy', 0, 0);
  const cat = mk(ctx, 'player', 0, 1.6, { hp: 8 });
  // the wall spans x ∈ [-2, 2] at z = 0.9; its middle post (the one wallBetween answers) stands off the poke's arc
  const post = mk(ctx, 'ally', 1.5, 0.9, { hp: 1e6, mass: 100 });
  post.tags.add('shieldWall');
  let struck = 0; post.resolveIncoming = () => { struck++; return 'block'; };
  const wall = { alive: true, between: (ax, az, bx, bz) => (az - 0.9) * (bz - 0.9) < 0 && Math.abs(ax) < 2 && Math.abs(bx) < 2 };
  ctx.companions = { walls: [wall], wallBetween: (a, b) => (wall.between(a.x, a.z, b.x, b.z) ? post : null) };
  const s = combat.beginSwing(rat, ATTACKS.rat_poke);
  runSwing(combat, s);
  assert.equal(cat.hp, 8, 'the cat behind the wall is untouched');
  assert.equal(struck, 1, 'the post took the poke once'); assert.ok(s.blocked);
  assert.equal(of(E.HIT).at(-1).target, post); assert.equal(of(E.HIT).at(-1).blocked, true);
  // a pug_slam ring from the far side reaches both the post and her: the post blocks once, she is shielded
  assert.equal(combat.areaHit(rat, ATTACKS.pug_slam, { r: 2, y0: 0, y1: 0.3 }), 0);
  assert.equal(cat.hp, 8); assert.equal(struck, 2, 'one block per blast');
  // her own swings are never redirected
  const foe = mk(ctx, 'enemy', 0, 3.0, { hp: 100 });
  cat.facing = 0;
  runSwing(combat, combat.beginSwing(cat, ATTACKS.slash1, { assist: false }));
  assert.equal(foe.hp, 90);
  // the wall gone: the poke reaches her
  ctx.companions.walls = [];
  runSwing(combat, combat.beginSwing(rat, ATTACKS.rat_poke));
  assert.equal(cat.hp, 7); assert.equal(struck, 2);
});

// ------------------------------------------------------------------ projectiles
function step(combat, n = 1) { for (let i = 0; i < n; i++) combat.update(DT); }

test('projectiles: a rat bolt flies, hits the player once, and returns to the pool', () => {
  const { ctx, combat, of } = setup();
  const rat = mk(ctx, 'enemy', 0, 6, { hp: 20 });
  const cat = mk(ctx, 'player', 0, 0, { hp: 8 });
  const p = combat.spawnProjectile(ATTACKS.rat_bolt, rat, new THREE.Vector3(0, 0.5, 6), new THREE.Vector3(0, 0, -1));
  assert.equal(p.isProjectile, true); assert.equal(p.faction, 'enemy'); assert.ok(Math.abs(p.vel.length() - 16) < 1e-9);
  assert.equal(p.kind, 'bolt'); assert.ok(p.visual?.group.parent === ctx.scene, 'visual in the scene');
  step(combat, 30);
  assert.equal(cat.hp, 7); assert.equal(combat.projectiles.list.length, 0);
  const h = of(E.HIT)[0];
  assert.equal(h.attacker, rat, 'combat:hit reports the shooter'); assert.equal(h.projectile, p); assert.equal(h.attackId, 'rat_bolt');
  assert.equal(p.visual, null); assert.equal(p.endReason, 'hit');
  const q = combat.spawnProjectile(ATTACKS.rat_bolt, rat, new THREE.Vector3(0, 0.5, 6), new THREE.Vector3(0, 0, -1));
  assert.equal(q, p, 'pooled object reused');
});

test('projectiles: a parried bolt reflects ×1.5 at the shooter for 25 and kills it; combat:reflect + player:parry', () => {
  const { ctx, combat, of } = setup();
  const rat = mk(ctx, 'enemy', 1, 9, { hp: 20 });
  const cat = mk(ctx, 'player', 0, 0, { hp: 8 });
  cat.resolveIncoming = (att) => (att.isProjectile ? 'parry' : 'hit');
  const p = combat.spawnProjectile(ATTACKS.rat_bolt, rat, new THREE.Vector3(0, 0.5, 6), new THREE.Vector3(0, 0, -1));
  step(combat, 25);
  assert.equal(cat.hp, 8);
  assert.equal(of(E.REFLECT).length, 1); assert.equal(of(E.REFLECT)[0].by, cat);
  const parry = of(E.PLAYER_PARRY)[0];
  assert.equal(parry.projectile, p); assert.equal(parry.attacker, rat);
  assert.ok(p.reflected); assert.equal(p.faction, 'player'); assert.equal(p.owner, cat);
  assert.ok(Math.abs(p.speed - 16 * PLAYER.guard.reflectSpeedMul) < 1e-9);
  assert.ok(p.vel.x > 0, 'homes on the shooter (who stands off the bolt path)');
  step(combat, 40);
  assert.equal(rat.alive, false, 'reflected 25 kills a 20-HP crossbow rat');
  const h = of(E.HIT).find((x) => x.target === rat);
  assert.equal(h.damage, 25); assert.equal(h.reflected, true); assert.equal(h.attacker, cat);
});

test('projectiles: blocked bolts break, dodged bolts pass through, ground and range end them, onEnd callback', () => {
  const { ctx, combat } = setup();
  const rat = mk(ctx, 'enemy', 0, 6);
  const cat = mk(ctx, 'player', 0, 0, { hp: 8 });
  cat.resolveIncoming = () => 'block';
  const ends = [];
  const p = combat.spawnProjectile(ATTACKS.rat_bolt, rat, new THREE.Vector3(0, 0.5, 6), new THREE.Vector3(0, 0, -1), { onEnd: (_, r) => ends.push(r) });
  step(combat, 30);
  assert.deepEqual(ends, ['blocked']); assert.equal(cat.hp, 8); assert.equal(p.alive, false);
  cat.resolveIncoming = () => 'immune';
  combat.spawnProjectile(ATTACKS.rat_bolt, rat, new THREE.Vector3(0, 0.5, 6), new THREE.Vector3(0, 0, -1), { onEnd: (_, r) => ends.push(r) });
  step(combat, 120);
  assert.deepEqual(ends, ['blocked', 'expired'], 'flew through the tumble, then ran out of range');
  combat.spawnProjectile(ATTACKS.rat_bolt, rat, new THREE.Vector3(0, 0.5, 6), new THREE.Vector3(0, -1, -1), { onEnd: (_, r) => ends.push(r) });
  step(combat, 30);
  assert.equal(ends.at(-1), 'ground');
  combat.spawnProjectile(ATTACKS.rat_bolt, rat, new THREE.Vector3(0, 0.5, 6), new THREE.Vector3(1, 0, 0));
  combat.clear();
  assert.equal(combat.projectiles.list.length, 0);
});

test('holyWave: pierces a line of enemies (each hit once), eats enemy projectiles, pops slime flag', () => {
  const { ctx, combat, of } = setup();
  const cat = mk(ctx, 'player', 0, 0);
  const a = mk(ctx, 'enemy', 0.5, 3, { hp: 100 }), b = mk(ctx, 'enemy', -0.8, 6, { hp: 100 }), side = mk(ctx, 'enemy', 3, 4, { hp: 100 });
  const shooter = mk(ctx, 'enemy', 0, 12, { hp: 100 });
  const bolt = combat.spawnProjectile(ATTACKS.rat_bolt, shooter, new THREE.Vector3(0, 0.5, 11), new THREE.Vector3(0, 0, -1));
  const w = combat.spawnProjectile(ATTACKS.holyWave, cat, new THREE.Vector3(0, 0.5, 0.3), new THREE.Vector3(0, 0, 1));
  assert.equal(w.kind, 'wave'); assert.equal(w.halfW, 1.2); assert.ok(Math.abs(w.pos.y - Math.max(0.8, COMBAT.waveHover)) < 1e-9, 'rides the ground');
  step(combat, 50);
  assert.equal(a.hp, 70); assert.equal(b.hp, 70); assert.equal(side.hp, 100, 'outside the 2.4 m crescent');
  assert.equal(bolt.alive, false); assert.equal(bolt.endReason, 'eaten'); assert.equal(combat.stats.eaten, 1);
  assert.ok(of(E.HIT).every((h) => h.popsSlime));
  step(combat, 60);
  assert.equal(combat.projectiles.list.length, 0, 'life = range / speed');
});

test('holyWave range: Wave Reach upgrade (15 m with Shard 2) applies whoever spawns the wave', () => {
  const { ctx, combat } = setup();
  const cat = mk(ctx, 'player', 0, 0);
  cat.shards = 2;
  const fwd = new THREE.Vector3(0, 0, 1);
  let w = combat.spawnProjectile(ATTACKS.holyWave, cat, cat.pos, fwd);
  assert.ok(Math.abs(w.maxLife - ATTACKS.holyWave.range / ATTACKS.holyWave.speed) < 1e-9, '10 m');
  combat.projectiles.clear();
  ctx.state.upgrades.waveReach = true;
  w = combat.spawnProjectile(ATTACKS.holyWave, cat, cat.pos, fwd);
  assert.ok(Math.abs(w.maxLife - 15 / ATTACKS.holyWave.speed) < 1e-9, '15 m with the upgrade');
  combat.projectiles.clear();
  const s = combat.beginSwing(cat, ATTACKS.holy);
  runSwing(combat, s);
  assert.equal(combat.projectiles.list.length, 1);
  assert.ok(Math.abs(combat.projectiles.list[0].maxLife - 15 / 14) < 1e-9, 'the swing-spawned wave too');
});

test('reflected bolts home on a shooter that sidesteps (within the cone), then fly straight if it dodges past', () => {
  const { ctx, combat, of } = setup();
  const rat = mk(ctx, 'enemy', 0, 9, { hp: 20 });
  const cat = mk(ctx, 'player', 0, 0, { hp: 8 });
  cat.resolveIncoming = (att) => (att.isProjectile ? 'parry' : 'hit');
  const p = combat.spawnProjectile(ATTACKS.rat_bolt, rat, new THREE.Vector3(0, 0.5, 6), new THREE.Vector3(0, 0, -1));
  let reflected = false;
  for (let i = 0; i < 80 && rat.alive; i++) {
    combat.update(DT);
    if (p.reflected && !reflected) reflected = true;
    if (reflected) rat.pos.x += 3 * DT;                    // strafes at 3 m/s after the parry
  }
  assert.ok(reflected, 'parried');
  assert.equal(rat.alive, false, 'the homing reflected bolt still finds the strafing rat');
  assert.equal(of(E.HIT).find((h) => h.target === rat).damage, 25);
  // a shooter far outside the cone: no homing at all
  const { ctx: c2, combat: k2 } = setup();
  const r2 = mk(c2, 'enemy', 8, 1, { hp: 20 });
  const q = k2.spawnProjectile(ATTACKS.rat_bolt, r2, new THREE.Vector3(0, 0.5, 2), new THREE.Vector3(0, 0, -1));
  k2.reflect(q, mk(c2, 'player', 0, 0));
  assert.equal(q.homing, null); assert.ok(q.vel.z > 0 && Math.abs(q.vel.x) < 1e-9, 'straight back up the path');
});

test('projectiles stop on props and walls (physics.sphereCast over the step), never hitting what is behind', () => {
  const { ctx, combat } = setup();
  const casts = [];
  ctx.physics = {                                            // a wall across z = 3
    heightAt: () => 0,
    sphereCast(ray, r, maxDist, opts) {
      casts.push({ r, opts });
      if (ray.direction.z >= 0) return null;
      const t = (ray.origin.z - (3 + r)) / -ray.direction.z;
      return t >= 0 && t <= maxDist ? { distance: t, kind: 'static' } : null;
    },
  };
  const rat = mk(ctx, 'enemy', 0, 8);
  const cat = mk(ctx, 'player', 0, 2.6, { hp: 8 });
  const ends = [];
  const p = combat.spawnProjectile(ATTACKS.rat_bolt, rat, new THREE.Vector3(0, 0.5, 7), new THREE.Vector3(0, 0, -1), { onEnd: (_, r) => ends.push(r) });
  step(combat, 30);
  assert.deepEqual(ends, ['wall']); assert.equal(cat.hp, 8, 'the cat behind the wall is safe');
  assert.ok(Math.abs(p.pos.z - 3.15) < 1e-6, `stopped at the wall face (${p.pos.z})`);
  assert.equal(casts[0].r, ATTACKS.rat_bolt.projectile.r); assert.equal(casts[0].opts.terrain, false);
  // waves ride through props
  casts.length = 0;
  combat.spawnProjectile(ATTACKS.holyWave, cat, cat.pos, new THREE.Vector3(0, 0, 1));
  step(combat, 5);
  assert.equal(casts.length, 0);
  // fallback without sphereCast: blockedAt(x, z, r, y0, y1)
  const { ctx: c2, combat: k2 } = setup();
  c2.physics = { heightAt: () => 0, blockedAt: (x, z) => (z < 3 ? { id: 'crate' } : null) };
  const r2 = mk(c2, 'enemy', 0, 8);
  const ends2 = [];
  k2.spawnProjectile(ATTACKS.rat_bolt, r2, new THREE.Vector3(0, 0.5, 7), new THREE.Vector3(0, 0, -1), { onEnd: (_, r) => ends2.push(r) });
  for (let i = 0; i < 30; i++) k2.update(DT);
  assert.deepEqual(ends2, ['wall']);
});

test('Combat system contract: init/update/render/dispose, clears on level unload', async () => {
  const { ctx, combat } = setup();
  await combat.init();
  const rat = mk(ctx, 'enemy', 0, 6);
  combat.spawnProjectile('rat_bolt', rat, new THREE.Vector3(0, 0.5, 6), new THREE.Vector3(0, 0, -1));
  assert.ok(combat.tokens.acquire(rat));
  combat.render(0.5, DT);
  ctx.bus.emit(E.LEVEL_UNLOAD, { id: 'meadow' });
  assert.equal(combat.projectiles.list.length, 0); assert.equal(combat.tokens.count('melee'), 0);
  combat.spawnProjectile('rat_bolt', rat, new THREE.Vector3(0, 0.5, 6), new THREE.Vector3(0, 0, -1));
  ctx.bus.emit(E.CUTSCENE_START, { id: 'cs02' });
  assert.equal(combat.projectiles.list.length, 0);
  // dead token holders are pruned each step
  combat.tokens.acquire(rat); rat.alive = false; combat.update(DT);
  assert.equal(combat.tokens.count('melee'), 0);
  combat.dispose();
  assert.equal(ctx.scene.children.filter((c) => c.name.startsWith('projectile:')).length, 0);
});

// ------------------------------------------------------------------ iso controls (CONTROLS_SPEC §7–§8, §12 combat)
import { scoreCandidate, pickAssist, lungeFor, lungeSpeed, lungeWindow, assistCone, ThreatBook, aimCfg, timeToContact } from '../../src/combat/targeting.js';

test('§7.2 score: dist + 2·angle/π − 2.5 windup − 1 selected − 0.8 low hp − 0.5 recent hit + 3 breakable (breakdown)', () => {
  const her = { pos: { x: 0, y: 0, z: 0 } };
  const t = { pos: { x: 0, y: 0, z: 3 }, radius: 0.5, hp: 2, maxHp: 10 };
  const terms = {};
  const s = scoreCandidate(her, t, Math.PI / 2, { windup: true, selected: true, recentHit: true, breakable: true }, terms);
  assert.ok(Math.abs(terms.dist - 2.5) < 1e-9, 'edge distance');
  assert.ok(Math.abs(terms.angle - 1.0) < 1e-9, '90° off the stick = +1.0');
  assert.equal(terms.windup, -2.5); assert.equal(terms.selected, -1); assert.equal(terms.lowHp, -0.8);
  assert.equal(terms.recentHit, -0.5); assert.equal(terms.breakable, 3);
  assert.ok(Math.abs(s - (2.5 + 1 - 2.5 - 1 - 0.8 - 0.5 + 3)) < 1e-9);
  assert.equal(terms.score, s);
  assert.equal(scoreCandidate(her, { pos: { x: 0, z: 2 }, hp: 5, maxHp: 10 }, 0, {}), 2, 'plain: just the distance');
});

test('§7.2 pickAssist: wind-up beats nearer, breakables only when clear, crows only low, stickiness 0.75, breakdown', () => {
  const her = { pos: { x: 0, y: 0, z: 0 } };
  const near = { pos: { x: 0, y: 0, z: 1.5 } }, wind = { pos: { x: 0, y: 0, z: 3.5 } };
  const out = {};
  assert.equal(pickAssist(her, [near, wind], { range: 4.5, refYaw: 0, windup: (a) => a === wind }, out), wind, '3.5 − 2.5 < 1.5');
  assert.equal(out.target, wind); assert.equal(out.list.length, 2); assert.equal(out.terms.windup, -2.5); assert.equal(out.kept, false);
  // range + cone
  assert.equal(pickAssist(her, [wind], { range: 3, refYaw: 0 }), null, 'beyond range');
  const side = { pos: { x: 2, y: 0, z: 0 } };
  assert.equal(pickAssist(her, [side], { range: 4.5, refYaw: 0, angle: 0.436 }), null, 'outside a 25° cone');
  assert.equal(pickAssist(her, [side], { range: 4.5, refYaw: 0 }), side, '360° auto-target');
  // breakables: only with no hostile within 6 m; +3 otherwise
  const crate = { pos: { x: 0, y: 0, z: 1 }, breakable: true }, far = { pos: { x: 0, y: 0, z: 7 } };
  assert.equal(pickAssist(her, [crate, near], { range: 4.5, refYaw: 0 }), near, 'a hostile is near: the crate is ignored');
  assert.equal(pickAssist(her, [crate, far], { range: 4.5, refYaw: 0 }), crate, 'clear: the crate is the auto-target');
  assert.equal(pickAssist(her, [crate], { range: 4.5, refYaw: 0, breakables: false }), null, 'breakables off');
  // crows: only below hittableBelow
  const crow = { pos: { x: 0, y: 3.0, z: 1 }, def: { hittableBelow: 2.2 } };
  assert.equal(pickAssist(her, [crow], { range: 4.5, refYaw: 0 }), null, 'a high crow is not a target');
  crow.pos.y = 1.5;
  assert.equal(pickAssist(her, [crow], { range: 4.5, refYaw: 0 }), crow, 'a low crow is');
  // dead / hidden / dormant / not hurtable are skipped
  for (const k of [{ alive: false }, { hidden: true }, { dormant: true }, { hurtable: false }]) {
    assert.equal(pickAssist(her, [{ pos: { x: 0, y: 0, z: 1 }, ...k }], { range: 4.5, refYaw: 0 }), null, JSON.stringify(k));
  }
  // stickiness: keep the current target unless a challenger is better by 0.75
  const cur = { pos: { x: 0, y: 0, z: 2.0 } }, ch = { pos: { x: 0, y: 0, z: 1.5 } };
  assert.equal(pickAssist(her, [cur, ch], { range: 4.5, refYaw: 0, prev: cur }, out), cur, 'better by 0.5 only: no ping-pong');
  assert.equal(out.kept, true);
  ch.pos.z = 1.2;
  assert.equal(pickAssist(her, [cur, ch], { range: 4.5, refYaw: 0, prev: cur }), ch, 'better by 0.8: switch');
  ch.pos.z = 1.5;
  assert.equal(pickAssist(her, [cur, ch], { range: 4.5, refYaw: 0, prev: cur, sticky: false }), ch, 'sticky off');
  const gone = { pos: { x: 0, y: 0, z: 2 }, alive: false };
  assert.equal(pickAssist(her, [gone, ch], { range: 4.5, refYaw: 0, prev: gone }), ch, 'a dead previous target is dropped');
});

test('§7.1 cones + lunge magnetism: device cones around the aim, lunge = clamp(dist − 0.7·range, lunge, lunge + 1)', () => {
  const A = aimCfg();
  assert.deepEqual(assistCone('touch'), { angle: A.touchCone, range: 4.5 });
  assert.deepEqual(assistCone('touch', { stickIdle: true }), { angle: Math.PI, range: 4.5 }, 'idle stick: 360°');
  assert.deepEqual(assistCone('pad', { padAim: true }), { angle: A.padCone, range: 3.5 });
  const k = assistCone('kbm', { arcRange: 1.9 });
  assert.equal(k.angle, A.kbmCone); assert.ok(Math.abs(k.range - 2.9) < 1e-9);
  assert.equal(assistCone('kbm', { arcRange: 1.9, selected: true }).angle, A.selCone);
  assert.equal(lungeFor(1.5, 1.9, 2.5), 2.5, 'within reach: the def lunge');
  assert.ok(Math.abs(lungeFor(4.0, 1.9, 2.5) - 2.67) < 1e-9, 'beyond: grows (4.0 − 1.33)');
  assert.equal(lungeFor(9, 1.9, 2.5), 3.5, 'capped at lunge + 1.0');
});

test('combat.assistTarget: §7.2 score over real actors (telegraph wind-up, recent hit, selected), sticky prev, legacy prefer', async () => {
  const { ctx, combat } = setup();
  await combat.init();
  const cat = mk(ctx, 'player', 0, 0, { hp: 8 });
  const a = mk(ctx, 'enemy', 0, 1.6), b = mk(ctx, 'enemy', 0, 3.2);
  const out = {};
  assert.equal(combat.assistTarget(cat, 4.5, Math.PI, out), a, 'nearest');
  assert.equal(out.list.length, 2);
  // b winds up on her: −2.5 beats 1.6 m of distance
  ctx.bus.emit(E.TELEGRAPH, { id: 77, actor: b, kind: 'parry', duration: 0.5, targetsPlayer: true });
  assert.equal(combat.assistTarget(cat, 4.5, Math.PI, out), b, 'winding up on her ranks first');
  assert.equal(out.terms.windup, -2.5);
  ctx.bus.emit(E.TELEGRAPH_END, { id: 77 });
  assert.equal(combat.assistTarget(cat, 4.5, Math.PI), a);
  // b hit her in the last 2 s (−0.5) and is selected (−1.0): 2.9 − 1.5 = 1.4 vs a 1.3 → sticky prev a keeps a
  cat.resolveIncoming = () => 'hit';
  combat.applyHit(b, cat, ATTACKS.rat_poke);
  assert.ok(combat.hitRecently(b) && !combat.hitRecently(a));
  ctx.game.time += 2.5;
  assert.ok(!combat.hitRecently(b), 'the 2 s window lapses');
  ctx.game.time -= 2.5;
  assert.equal(combat.assistTarget(cat, 4.5, Math.PI, out, { selected: b, prev: a }), a, 'within 0.75: stays on a');
  assert.equal(out.kept, false, 'a is simply better here');
  b.hp = 1;                                                     // < 30 %: −0.8 more → 0.6 vs 1.3, better by 0.7: kept
  assert.equal(combat.assistTarget(cat, 4.5, Math.PI, out, { selected: b, prev: a }), a);
  assert.equal(out.kept, true, 'the sticky rule kept a');
  assert.equal(combat.assistTarget(cat, 4.5, Math.PI, out, { selected: b }), b, 'no previous target: b');
  // dir: a reference direction other than facing; cones are around it
  const c = mk(ctx, 'enemy', 2, 0);
  assert.equal(combat.assistTarget(cat, 4.5, 0.436, null, { dir: { x: 1, z: 0 } }), c, 'cone around the stick direction');
  assert.equal(combat.assistTarget(cat, 4.5, 0.436, null, { dir: Math.PI / 2 }), c, 'yaw form');
  // legacy 4th argument: a preferred actor wins while inside range and cone
  assert.equal(combat.assistTarget(cat, 4.5, Math.PI, b), b);
  assert.equal(combat.assistTarget(cat, 1.0, Math.PI, b), null, 'prefer out of range: the scored search (nothing in 1 m)');
});

test('combat.nextParryable: soonest live white / gold wind-up on her (activeAt filled from the def), bolts, red skipped', async () => {
  const { ctx, combat } = setup();
  await combat.init();
  const cat = mk(ctx, 'player', 0, 0, { hp: 8 });
  const r1 = mk(ctx, 'enemy', 0, 2), r2 = mk(ctx, 'enemy', 2, 0), r3 = mk(ctx, 'enemy', -2, 0);
  assert.equal(combat.nextParryable(cat), null);
  const p1 = { id: 1, actor: r1, kind: 'parry', duration: 0.8, attackId: 'rat_poke', targetsPlayer: true };
  ctx.bus.emit(E.TELEGRAPH, p1);
  const act = ATTACKS.rat_poke.active?.[0] ?? 0;
  assert.ok(Math.abs(p1.activeAt - (0.8 + act)) < 1e-9, '§8.5 payload filled: activeAt = now + windup + active[0]');
  assert.equal(p1.windup, 0.8);
  ctx.bus.emit(E.TELEGRAPH, { id: 2, actor: r2, kind: 'gold', duration: 0.4, activeAt: 0.4, targetsPlayer: true });
  ctx.bus.emit(E.TELEGRAPH, { id: 3, actor: r3, kind: 'red', duration: 0.1, activeAt: 0.1, targetsPlayer: true });
  let n = combat.nextParryable(cat);
  assert.equal(n.attacker, r2, 'the gold one lands first; red is a dodge, not a parry');
  assert.equal(n.kind, 'gold'); assert.equal(n.activeAt, 0.4); assert.equal(n.window, PLAYER.guard.parryWindow);
  r2.staggerT = 0.5;
  assert.equal(combat.nextParryable(cat).attacker, r1, 'a staggered attacker is no threat');
  r2.staggerT = 0;
  ctx.game.time = 0.5;
  assert.equal(combat.nextParryable(cat).attacker, r1, 'past its activeAt the gold one drops');
  assert.equal(combat.nextParryable(cat, 1.0), null, 'maxDist');
  ctx.bus.emit(E.TELEGRAPH_END, { id: 1 });
  assert.equal(combat.nextParryable(cat), null, 'ended (not striking): gone');
  // an incoming bolt counts (kind parry, the shooter as attacker)
  const shooter = mk(ctx, 'enemy', 0, 9);
  combat.spawnProjectile(ATTACKS.rat_bolt, shooter, new THREE.Vector3(0, 0.5, 6), new THREE.Vector3(0, 0, -1));
  n = combat.nextParryable(cat);
  assert.equal(n.attacker, shooter); assert.ok(n.projectile); assert.ok(n.activeAt > 0.5 && n.activeAt < 1.0);
  assert.equal(n.pos, n.projectile.pos, 'pos = the bolt (what the threat snap turns to), not the far shooter');
  ctx.input.device = 'touch';
  assert.ok(Math.abs(combat.nextParryable(cat).window - (PLAYER.guard.parryWindow + PLAYER.guard.touchParryBonus)) < 1e-9, 'touch +0.05');
  assert.ok(Math.abs(timeToContact({ x: 0, z: 6 }, { x: 0, z: -16 }, { x: 0, z: 0 }, 0.45) - (5.55 / 16)) < 1e-9);
});

test('ThreatBook: entries outlive the glint while the strike is underway, prune dead attackers, pool reuse', () => {
  let now = 0;
  const tb = new ThreatBook(() => now);
  const a = { pos: { x: 0, z: 1 }, alive: true };
  tb.add({ id: 5, actor: a, kind: 'parry', duration: 0.5, activeAt: 0.7, targetsPlayer: true });
  assert.ok(tb.windingUp(a));
  now = 0.5;
  tb.end(5, () => true);                                    // glint over, the swing is in its strike
  assert.ok(tb.soonest({ pos: { x: 0, z: 0 } }, 6), 'kept until activeAt');
  assert.ok(!tb.windingUp(a), 'no longer "winding up" for the score');
  now = 0.9; tb.prune();
  assert.equal(tb.live.size, 0, 'pruned past activeAt + keep');
  tb.add({ id: 6, actor: a, kind: 'parry', duration: 0.5, targetsPlayer: true });
  assert.equal(tb._pool.length, 0, 'the pooled entry was reused');
  a.alive = false; tb.prune();
  assert.equal(tb.live.size, 0); assert.equal(tb._pool.length, 1);
  assert.equal(tb.add({ id: 7, actor: a, kind: 'aim' }), null, 'ranged aims are not melee wind-ups');
});

test('beginSwing lungeTo: lunge magnetism covers up to 1.0 m more toward a far target (swing.lungeOverride, m/s)', () => {
  const { ctx, combat } = setup();
  const cat = mk(ctx, 'player', 0, 0);
  const far = mk(ctx, 'enemy', 0, 5.3), close = mk(ctx, 'enemy', 0, 1.2);
  const def = ATTACKS.slash1, w = lungeWindow(def) - aimCfg().lungeSettle;
  assert.ok(Math.abs(lungeWindow(def) - (def.active[1] - def.active[0] / 2)) < 1e-12);
  const capped = combat.beginSwing(cat, def, { lungeTo: far }).lungeOverride;
  assert.ok(Math.abs(capped * w - (def.lunge * w + 1.0)) < 1e-9, `capped at +1.0 m of travel (${capped} m/s)`);
  assert.equal(combat.beginSwing(cat, def, { lungeTo: close }).lungeOverride, def.lunge, 'within reach');
  const mid = combat.beginSwing(cat, def, { lungeTo: { x: 0, z: 2.3 } }).lungeOverride;
  const want = 2.3 - 0.7 * def.arc.range;
  assert.ok(want > def.lunge * w && Math.abs(mid * w - want) < 1e-9, `a point target: travel = dist − 0.7·range (${mid})`);
  assert.equal(lungeSpeed(def, 1.0), def.lunge, 'lungeSpeed within reach');
  assert.equal(combat.beginSwing(cat, def).lungeOverride, undefined, 'no lungeTo: untouched');
  assert.equal(combat.beginSwing(cat, { id: 'x', dur: 0.3, arc: def.arc }, { lungeTo: far }).lungeOverride, undefined, 'defs without lunge');
});

test('reflect toward the aim: a hostile within ±25° of her aim gets the bolt, else it flies back to the shooter', () => {
  const { ctx, combat } = setup();
  const shooter = mk(ctx, 'enemy', 0, 9, { hp: 20 });
  const other = mk(ctx, 'enemy', 6, 0.6, { hp: 20 });
  const cat = mk(ctx, 'player', 0, 0, { hp: 8 });
  const bolt = () => combat.spawnProjectile(ATTACKS.rat_bolt, shooter, new THREE.Vector3(0, 0.5, 1), new THREE.Vector3(0, 0, -1));
  // explicit aim at the other rat (east)
  let q = bolt();
  combat.reflect(q, cat, { dir: { x: 1, z: 0 } });
  assert.equal(q.homing, other); assert.ok(q.vel.x > 0 && Math.abs(q.vel.z) < q.vel.x * 0.2, 'east, at the other rat');
  for (let i = 0; i < 60 && other.alive; i++) combat.update(DT);
  assert.equal(other.alive, false, 'the reflected bolt (25) kills it');
  // the aim points at nothing (west): back to the shooter, as before
  q = bolt();
  combat.reflect(q, cat, { dir: { x: -1, z: 0 } });
  assert.equal(q.homing, shooter); assert.ok(q.vel.z > 0);
  // her aim resolver (cursor) is used when no dir is given; a facing / auto aim is no aim (back to the shooter)
  const third = mk(ctx, 'enemy', -5, 5, { hp: 20 });
  cat.resolveAim = () => ({ source: 'cursor', dir: { x: -Math.SQRT1_2, z: Math.SQRT1_2 } });
  q = bolt(); combat.reflect(q, cat);
  assert.equal(q.homing, third, 'cursor aim');
  cat.resolveAim = () => ({ source: 'auto', dir: { x: -Math.SQRT1_2, z: Math.SQRT1_2 } });
  q = bolt(); combat.reflect(q, cat);
  assert.equal(q.homing, shooter, 'auto: back to the shooter even with a rat along it');
  cat.resolveAim = () => ({ source: 'selected', dir: { x: -Math.SQRT1_2, z: Math.SQRT1_2 } });
  q = bolt(); combat.reflect(q, cat);
  assert.equal(q.homing, third, 'the selected target is a deliberate aim');
  // classic camera: the M1 rule only
  ctx.cam = { isIso: false };
  cat.resolveAim = () => ({ source: 'cursor', dir: { x: 1, z: 0 } });
  q = bolt(); combat.reflect(q, cat);
  assert.equal(q.homing, shooter, 'classic: back to the shooter');
});
