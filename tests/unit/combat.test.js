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
