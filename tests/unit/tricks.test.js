// tests/unit/tricks.test.js  (owner: player, TT3 package A) — the Paw Tricks (docs/TOKENTAILS-PLAN.md §11.3, §11.5 A):
// the ":3" Coin Toss path, first-foe stop, one coin at a time, cooldown and per-enemy rules; the Ribbon Twirl fall cap,
// time limit and once-per-jump; the Catnip Cloud giddy state (2.5 s, no attacks, ×1.5 wake, bosses only Dizzy); the
// unlock gate (never before the first fight) and the save flags round trip; the touch ":3" layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fakeCtx } from './_fakeCtx.mjs';
import { Actor } from '../../src/core/Actor.js';
import { E } from '../../src/core/events.js';
import { GameState } from '../../src/core/GameState.js';
import { TRICKS, TRICK_FLAGS, TRICK_IDS, SLOT_TRICKS } from '../../src/player/tricks/tuning.js';
import { CoinToss, coinDistance, coinRule, coinStun, backTime, COIN_DEF_JELLY } from '../../src/player/tricks/CoinToss.js';
import { canTwirl, twirlLimits, glideStep, TWIRL_SPIN } from '../../src/player/tricks/RibbonTwirl.js';
import { CatnipCloud, cloudRule, landPoint, pouchArc } from '../../src/player/tricks/CatnipCloud.js';
import { inCrowFields, ownedOnLoad, pastFirstFight } from '../../src/player/tricks/unlocks.js';
import { TRICK_EVENTS, TRICK_TEXT } from '../../src/player/tricks/PawTricks.js';
import { STATES } from '../../src/player/PlayerStates.js';
import { PASSIVE_ENEMY_STATES } from '../../src/player/tuning.js';
import { Enemy } from '../../src/enemies/Enemy.js';
import { resolveEnemyDef } from '../../src/enemies/EnemyManager.js';
import { computeLayout, minGap, TRICK_BUTTON } from '../../src/ui/touchLayout.js';
import { TRICK_ZZFX } from '../../src/audio/sfxMap.js';
import { ZZFX_DEFS } from '../../src/audio/sfxDefs.js';

const DT = 1 / 60;
const C = TRICKS.coin, K = TRICKS.cloud, T = TRICKS.twirl;

/** A ctx with combat + a stub player at the origin facing +Z. */
function coinWorld() {
  const ctx = fakeCtx();
  const p = ctx.player;
  p.pos.set(0, 0, 0); p.facing = 0; p.onGround = true;
  ctx.physics = null;
  return { ctx, p };
}

/** A registered dummy foe (Actor) at (x, z). */
function foe(ctx, x, z, { hp = 60, type = 'rat_pike', height = 0.8, radius = 0.3, y = 0, poise = 2 } = {}) {
  const a = new Actor(ctx, { faction: 'enemy', radius, height, maxHp: hp, maxPoise: poise });
  a.pos.set(x, y, z); a.type = type; a.def = { id: type }; a.onGround = true;
  a.staggers = []; a.stagger = (s) => a.staggers.push(s);
  ctx.actors.register(a);
  return a;
}

/** Step the coin (and the foes' i-frames, which Enemy.update counts down in the game). */
function runCoin(coin, maxT = 2) {
  let t = 0;
  while (coin.active && t < maxT) { tickFoes(coin.ctx); coin.update(DT); t += DT; }
  return t;
}
function tickFoes(ctx) { for (const a of ctx.actors.list ?? []) if (a.faction === 'enemy' && a.invulnT > 0) a.invulnT = Math.max(0, a.invulnT - DT); }

// ------------------------------------------------------------------ coin path
test('coin: out 8 m and back in 0.9 s (pure path), the return leg scales with the turn distance', () => {
  assert.equal(coinDistance(0), 0);
  assert.ok(Math.abs(coinDistance(C.total / 2) - C.range) < 1e-9, 'apex = 8 m at 0.45 s');
  assert.equal(coinDistance(C.total), 0);
  let prev = 0;
  for (let t = DT; t <= C.total / 2; t += DT) { const d = coinDistance(t); assert.ok(d >= prev - 1e-9, 'out leg never comes back early'); prev = d; }
  assert.ok(Math.abs(backTime(C.range) - C.total / 2) < 1e-9);
  assert.ok(backTime(0.1) >= C.minBack);
});

test('coin: an unobstructed throw flies 8 m, comes back to her paw and is caught at 0.9 s', () => {
  const { ctx, p } = coinWorld();
  const coin = new CoinToss(ctx, p);
  assert.ok(coin.throw(0, 1));
  let far = 0, t = 0;
  while (coin.active && t < 2) { coin.update(DT); t += DT; far = Math.max(far, coin.pos.z); }
  assert.ok(Math.abs(far - C.range) < 0.05, `apex ${far.toFixed(2)} m`);
  assert.ok(Math.abs(t - C.total) <= 2 * DT + 1e-9, `caught at ${t.toFixed(3)} s`);
  assert.equal(coin.stats.caught, 1);
  assert.equal(coin.lastStop, 'apex');
});

test('coin: stops at the FIRST foe on the way out, hits it again on the way back, never the one behind', () => {
  const { ctx, p } = coinWorld();
  const a = foe(ctx, 0, 3), b = foe(ctx, 0, 5.5);
  const coin = new CoinToss(ctx, p);
  coin.throw(0, 1);
  const t = runCoin(coin);
  assert.equal(coin.lastStop, 'foe');
  assert.ok(t < C.total, `back early (${t.toFixed(2)} s)`);
  assert.equal(a.hp, 60 - C.dmgOut - C.dmgBack, 'out 8 + back 8');
  assert.equal(b.hp, 60, 'the second foe is behind the turn point');
  assert.equal(a.staggers[0], C.stunSmall, 'a rat is stunned 0.6 s');
});

test('coin: one coin at a time; the controller keeps the 4 s cooldown and grants +2 Valor per hit', () => {
  const { ctx, p } = coinWorld();
  ctx.state.setFlag('onboard.firstFight', true);
  const tr = p.tricks;
  assert.ok(tr.grant('coin', { bark: false }));
  assert.equal(tr.equipped, 'coin');
  assert.ok(tr.ready());
  assert.ok(tr.release({ id: 'coin', dir: { x: 0, z: 1 } }));
  assert.equal(tr.release({ id: 'coin', dir: { x: 0, z: 1 } }), false, 'a second coin while one is out');
  assert.equal(tr.cooldownLeft('coin'), C.cooldown);
  assert.equal(tr.ready(), false);
  for (let t = 0; t < C.cooldown - 0.1; t += DT) tr.update(DT);
  assert.ok(tr.cooldownLeft('coin') > 0 && tr.cooldownLeft('coin') < 0.2);
  for (let t = 0; t < 0.2; t += DT) tr.update(DT);
  assert.equal(tr.cooldownLeft('coin'), 0);
  assert.ok(tr.ready(), 'ready again after 4 s with the coin back');
  // valor
  foe(ctx, 0, 2.5);
  const v0 = p.valor;
  tr.release({ id: 'coin', dir: { x: 0, z: 1 } });
  for (let t = 0; t < 1.2; t += DT) { tickFoes(ctx); tr.update(DT); }
  assert.equal(p.valor - v0, 2 * C.valor, '+2 out, +2 back');
});

// ------------------------------------------------------------------ per-enemy rules
test('coin rules: rats / jelly S stunned 0.6, stealer 1.2 + drops half, crow below 3 m grounded, pug front blocked, jelly never splits, boss 6 + 4 Dizzy', () => {
  const stub = (o) => ({ alive: true, pos: { x: 0, y: 0, z: 3 }, radius: 0.35, height: 1, tags: new Set(), ...o });
  assert.equal(coinRule(stub({ type: 'rat_pike' })), 'small');
  assert.equal(coinRule(stub({ type: 'rat_xbow' })), 'small');
  assert.equal(coinRule(stub({ type: 'jelly_s' })), 'jelly');
  assert.equal(coinStun('jelly', 'jelly_s'), C.stunSmall);
  assert.equal(coinStun('jelly', 'jelly_m'), 0);
  assert.equal(coinRule(stub({ type: 'bonehead:mage' })), 'small');
  assert.equal(coinRule(stub({ type: 'stealer' })), 'stealer');
  assert.equal(coinRule(stub({ type: 'hyena' })), 'normal');
  assert.equal(coinRule(stub({ type: 'crow', def: { fly: { alt: 4 } }, pos: { x: 0, y: 2.5, z: 3 } }), null, 0), 'crow');
  assert.equal(coinRule(stub({ type: 'crow', def: { fly: { alt: 4 } }, pos: { x: 0, y: 4, z: 3 } }), null, 0), 'high');
  assert.equal(coinRule(stub({ type: 'pug', blocksFrom: () => true }), { x: 0, z: 1 }), 'block');
  assert.equal(coinRule(stub({ type: 'pug', blocksFrom: () => false }), { x: 1, z: 0 }), 'normal');
  assert.equal(coinRule(stub({ type: 'boss_grizzlechop', def: { boss: true } })), 'boss');

  const { ctx, p } = coinWorld();
  const seen = [];
  ctx.combat = { applyHit: (att, e, def, o) => { seen.push({ e, def, dmg: o.dmg }); return 'hit'; }, targetFilter: () => () => true };
  const coin = new CoinToss(ctx, p);
  const mk = (type, extra = {}) => ({ id: Math.random(), alive: true, pos: new THREE.Vector3(0, 0, 3), radius: 0.35, height: 1, tags: new Set(), type, def: { id: type },
    staggers: [], stagger(s) { this.staggers.push(s); }, ...extra });
  coin.throw(0, 1); coin.update(DT);
  // stealer
  const st = mk('stealer', { drops: [], dropStolen(f) { this.drops.push(f); } });
  coin.hit(st, true);
  assert.deepEqual(st.drops, [C.stealDrop]); assert.deepEqual(st.staggers, [C.stunStealer]);
  // crow below 3 m
  coin.throw(0, 1); coin.update(DT);
  const crow = mk('crow', { def: { id: 'crow', fly: { alt: 4 } }, pos: new THREE.Vector3(0, 2, 3), grounds: [], groundFlyer(s) { this.grounds.push(s); } });
  coin.hit(crow, true);
  assert.deepEqual(crow.grounds, [C.crowGround]);
  // pug from the front: no damage at all, the coin turns back
  coin.reset(); coin.throw(0, 1); coin.update(DT);
  const n0 = seen.length;
  const pug = mk('pug', { blocksFrom: () => true });
  assert.equal(coin.hit(pug, true), 'block');
  assert.equal(seen.length, n0, 'blocked: no applyHit');
  assert.equal(coin.phase, 'back');
  // jelly: knocked back, never split
  coin.reset(); coin.throw(0, 1); coin.update(DT);
  coin.hit(mk('jelly_m'), true);
  assert.equal(seen.at(-1).def, COIN_DEF_JELLY);
  assert.ok(seen.at(-1).def.popsSlime && seen.at(-1).def.knock >= C.knock);
  // boss: 6 damage + 4 Dizzy, no stun
  coin.reset(); coin.throw(0, 1); coin.update(DT);
  const boss = mk('boss_grizzlechop', { def: { id: 'boss_grizzlechop', boss: true }, dizzy: 0, addDizzy(n) { this.dizzy += n; } });
  coin.hit(boss, true);
  assert.equal(seen.at(-1).dmg, C.bossDmg); assert.equal(boss.dizzy, C.bossDizzy); assert.deepEqual(boss.staggers, []);
  // a crossbow rat aiming loses its bolt: the reload restarts
  coin.reset(); coin.throw(0, 1); coin.update(DT);
  const xb = mk('rat_xbow', { stateName: 'windup', cooldownT: 0, attack: { def: { reload: 2.0 } }, ended: 0, endTelegraph() { this.ended++; } });
  coin.hit(xb, true);
  assert.equal(xb.cooldownT, 2.0); assert.equal(xb.ended, 1); assert.deepEqual(xb.staggers, [C.stunSmall]);
});

test('coin: a crow above 3 m is out of reach (the coin passes under), at 2.5 m it is grounded 1.5 s', () => {
  const { ctx, p } = coinWorld();
  const hi = foe(ctx, 0, 3, { type: 'crow', y: 4.0, height: 0.5 }); hi.def = { id: 'crow', fly: { alt: 4 } }; hi.tags.add('flyer');
  hi.grounds = []; hi.groundFlyer = (s) => hi.grounds.push(s);
  const coin = new CoinToss(ctx, p);
  coin.throw(0, 1); runCoin(coin);
  assert.equal(hi.hp, 60); assert.deepEqual(hi.grounds, []);
  hi.pos.y = 2.5;
  coin.throw(0, 1); runCoin(coin);
  assert.ok(hi.hp < 60); assert.equal(hi.grounds[0], C.crowGround);
});

// ------------------------------------------------------------------ twirl
test('twirl: a fresh press in the air only, once per jump; the fall is capped at 1.8; 1.5 s limit; a pogo carries further', () => {
  const base = { owned: true, onGround: false, pressed: true, airT: 0.3, used: false, coyoteT: 0, state: 'move', alive: true };
  assert.ok(canTwirl(base));
  assert.equal(canTwirl({ ...base, owned: false }), false);
  assert.equal(canTwirl({ ...base, onGround: true }), false);
  assert.equal(canTwirl({ ...base, pressed: false }), false, 'holding Jump from take-off never twirls');
  assert.equal(canTwirl({ ...base, airT: 0 }), false, 'the jump press itself');
  assert.equal(canTwirl({ ...base, used: true }), false, 'once per jump');
  assert.equal(canTwirl({ ...base, state: 'pounce' }), false);
  const v = { x: 0, y: -9, z: 0 };
  const L = twirlLimits(false);
  assert.equal(L.fallMax, 1.8); assert.equal(L.speed, 4.5); assert.equal(L.maxTime, 1.5);
  for (let i = 0; i < 60; i++) glideStep(v, { x: 1, z: 0 }, 1, L, DT);
  assert.equal(v.y, -1.8);
  assert.ok(Math.abs(Math.hypot(v.x, v.z) - 4.5) < 0.3, `glide speed ${Math.hypot(v.x, v.z).toFixed(2)}`);
  const P = twirlLimits(true);
  assert.ok(P.speed > L.speed && P.maxTime > L.maxTime);
  // the state: Jump held keeps it to maxTime, then back to move
  const states = [];
  let held = true;
  const p = { onGround: false, attackBuf: 0, pounceReady: false, stateT: 0, twirlLim: L, vel: new THREE.Vector3(0, -5, 0), speedMul: 1, facing: 0,
    ctx: { input: { down: () => held } }, wishDir: (o) => { o.set(0, 0, 0); return 0; }, setState: (s) => states.push(s) };
  for (let t = 0; t < L.maxTime - 0.05; t += DT) { p.stateT = t; STATES.twirl.update(p, DT); }
  assert.deepEqual(states, [], 'still twirling before 1.5 s');
  assert.ok(p.vel.y >= -1.8 - 1e-9);
  p.stateT = L.maxTime; STATES.twirl.update(p, DT);
  assert.deepEqual(states, ['move']);
  states.length = 0; p.stateT = 0.2; held = false; STATES.twirl.update(p, DT);
  assert.deepEqual(states, ['move'], 'letting go of Jump ends it');
  assert.equal(TWIRL_SPIN.dmg, 6); assert.equal(TWIRL_SPIN.arc.range, 1.0);
});

test('twirl: the controller allows one twirl per jump and resets on landing', () => {
  const { ctx, p } = coinWorld();
  ctx.state.setFlag('onboard.firstFight', true);
  ctx.state.setFlag(TRICK_FLAGS.twirl, true);
  const tr = p.tricks;
  tr.init();
  p.onGround = false; p.state = 'move'; p.coyoteT = 0; tr.airT = 0.4;
  ctx.input.pressed = (a) => a === 'jump';
  assert.ok(tr.wantTwirl());
  tr.startTwirl();
  assert.equal(tr.wantTwirl(), false, 'once per jump');
  tr.onPogo();
  assert.ok(tr.wantTwirl(), 'a pogo gives a fresh one');
  tr.startTwirl();
  assert.ok(tr.twirlLim.maxTime > T.maxTime, 'carried further after a pogo');
  ctx.bus.emit(E.PLAYER_LAND, { impact: 0 });
  assert.equal(tr.twirlUsed, false);
  tr.dispose();
});

// ------------------------------------------------------------------ catnip cloud / giddy
function rat(ctx, x, z, type = 'rat_pike') {
  const e = new Enemy(ctx, resolveEnemyDef(type), { pos: new THREE.Vector3(x, 0, z) });
  ctx.actors.register(e);
  return e;
}

test('giddy: 2.5 s on its back, no attacks, then back to the fight; a hit wakes it with ×1.5 damage', () => {
  const ctx = fakeCtx();
  const e = rat(ctx, 0, 3);
  assert.ok(PASSIVE_ENEMY_STATES.includes('giddy'), 'a giddy foe is no Standing Ground threat');
  assert.ok(e.makeGiddy(K.giddy));
  assert.equal(e.stateName, 'giddy');
  const seen = new Set();
  for (let t = 0; t < K.giddy - 0.1; t += DT) { e.update(DT); seen.add(e.stateName); }
  assert.deepEqual([...seen], ['giddy'], 'no windup / strike while giddy');
  for (let t = 0; t < 0.2; t += DT) e.update(DT);
  assert.notEqual(e.stateName, 'giddy', 'gets up after 2.5 s');
  // the belly-rub bonk
  const p = ctx.player; p.pos.set(0, 0, 0);
  const plain = rat(ctx, 2, 3), giddy = rat(ctx, -2, 3);
  giddy.makeGiddy(K.giddy);
  const def = { id: 'slash1', dmg: 10, knock: 0, poise: 0 };
  ctx.combat.applyHit(p, plain, def, {});
  ctx.combat.applyHit(p, giddy, def, {});
  const dPlain = plain.maxHp - plain.hp, dGiddy = giddy.maxHp - giddy.hp;
  assert.equal(dGiddy, Math.round(dPlain * K.bellyMul), `×1.5 (${dPlain} → ${dGiddy})`);
  assert.notEqual(giddy.stateName, 'giddy', 'the hit woke it');
  assert.equal(ctx.combat._critTaken(giddy), 1, 'the bonus is for the first hit only');
});

test('cloud: normal foes go giddy, bosses and elites (poise ≥ 5) only gain 20 Dizzy, crows are grounded; each once per cloud', () => {
  const ctx = fakeCtx();
  const p = ctx.player; p.pos.set(0, 0, 0);
  const a = rat(ctx, 0.5, 4), b = rat(ctx, -0.8, 4.5, 'hyena'), far = rat(ctx, 0, 12);
  const pug = rat(ctx, 1.2, 3.6, 'pug');
  const boss = { id: 99901, alive: true, faction: 'enemy', pos: new THREE.Vector3(0, 0, 5), radius: 0.8, hurtable: true, def: { boss: true }, tags: new Set(['boss']), dizzy: 0, addDizzy(n) { this.dizzy += n; } };
  ctx.actors.register(boss);
  assert.equal(cloudRule(pug), 'boss', 'poise 5 is an elite');
  assert.equal(cloudRule(boss), 'boss');
  assert.equal(cloudRule({ alive: true, def: { fly: {} }, tags: new Set() }), 'crow');
  const cloud = new CatnipCloud(ctx, p);
  cloud.throw(0, 4);
  for (let t = 0; t < K.flight + 0.05; t += DT) cloud.update(DT);
  assert.ok(cloud.cloud, 'the pouch burst');
  assert.equal(a.stateName, 'giddy'); assert.equal(b.stateName, 'giddy');
  assert.notEqual(far.stateName, 'giddy');
  assert.notEqual(pug.stateName, 'giddy'); assert.ok(pug.wobbleT > 0, 'an elite with no meter only wobbles');
  assert.equal(boss.dizzy, K.bossDizzy);
  for (let t = 0; t < 1; t += DT) cloud.update(DT);
  assert.equal(boss.dizzy, K.bossDizzy, 'once per cloud');
  for (let t = 0; t < K.dur; t += DT) cloud.update(DT);
  assert.equal(cloud.cloud, null, 'the cloud fades after 3 s');
  const lp = landPoint(0, 0, 0, 20);
  assert.ok(Math.abs(lp.z - K.range) < 1e-9, 'thrown up to 7 m');
  assert.equal(pouchArc(0), 0); assert.equal(pouchArc(1), 0); assert.ok(pouchArc(0.5) > 1);
});

test('giddy: the plate flips to its friend word while giddy and back after (GRUMP → GIGGLER)', () => {
  const ctx = fakeCtx();
  const e = rat(ctx, 0, 3, 'hyena');
  // the dressed plate (characters' dress hook stand-in)
  const calls = [];
  e.plate = {}; e.plateWord = 'GRUMBLER'; e.plateFriendWord = 'GIGGLER';
  e.dress = { flipPlate: (on) => { calls.push(on); return true; } };
  e.makeGiddy(K.giddy);
  assert.equal(e.plateFlipped, true); assert.equal(e.plateWordShown, 'GIGGLER');
  for (let t = 0; t < K.giddy + 0.1; t += DT) e.update(DT);
  assert.equal(e.plateFlipped, false);
  assert.deepEqual(calls, [true, false]);
});

test('giddy: bosses, elites and flyers never go giddy; a jeering GRUMP is cut off', () => {
  const ctx = fakeCtx();
  const pug = rat(ctx, 0, 3, 'pug');
  assert.equal(pug.makeGiddy(2.5), false);
  const h = rat(ctx, 2, 3, 'hyena');
  h.setState('jeer');
  h.jeering = true;
  let off = 0;
  const offFn = ctx.bus.on(E.ENEMY_JEER, (p) => { if (p.on === false) off++; });
  h.makeGiddy(2.5);
  assert.equal(h.stateName, 'giddy'); assert.equal(off, 1, 'the jeer aura ends');
  offFn();
});

// ------------------------------------------------------------------ unlocks / flags
test('unlocks: never before the first fight; catch-up on later levels; the Crow Fields gate', () => {
  const st = new GameState();
  assert.equal(pastFirstFight(st), false);
  assert.deepEqual(ownedOnLoad('town', st), []);
  st.setFlag('onboard.firstFight', true);
  assert.deepEqual(ownedOnLoad('meadow', st), []);
  assert.deepEqual(ownedOnLoad('forest', st), ['coin']);
  assert.deepEqual(ownedOnLoad('forest', st, true), ['coin', 'twirl']);
  assert.deepEqual(ownedOnLoad('gate', st).sort(), ['cloud', 'coin', 'twirl']);
  assert.equal(inCrowFields(30, 40), true);
  assert.equal(inCrowFields(2, 18), false, 'the Picnic Glade is not the fields');
  assert.equal(inCrowFields(-10, -60), false);

  const { ctx, p } = coinWorld();
  const tr = p.tricks;
  assert.equal(tr.grant('coin'), false, 'no trick before onboard.firstFight');
  assert.equal(tr.anyOwned(), false);
  ctx.state.setFlag('onboard.firstFight', true);
  const got = [];
  ctx.bus.on(TRICK_EVENTS.unlocked, (e) => got.push(e.id));
  assert.ok(tr.grant('coin', { bark: false }));
  assert.ok(tr.grant('cloud', { bark: false }));
  assert.equal(tr.grant('coin'), false, 'already owned');
  assert.deepEqual(got, ['coin', 'cloud']);
  assert.equal(tr.equipped, 'coin', 'the first slot trick is equipped');
  tr.pick(2);
  assert.equal(tr.equipped, 'cloud');
  // the save flags round trip (the generic flags record; SaveManager unchanged)
  const back = new GameState(JSON.parse(JSON.stringify(ctx.state.toJSON())));
  assert.equal(back.getFlag(TRICK_FLAGS.coin), true);
  assert.equal(back.getFlag(TRICK_FLAGS.cloud), true);
  assert.equal(back.getFlag(TRICK_FLAGS.equipped), 'cloud');
  assert.equal(back.getFlag(TRICK_FLAGS.twirl), undefined);
  assert.deepEqual(TRICK_IDS, ['coin', 'cloud', 'twirl']);
  assert.deepEqual(SLOT_TRICKS, ['coin', 'cloud']);
});

test('strings: the §11.4 trick texts are verbatim (fallback table) and the events are trick:unlocked / trick:used', () => {
  assert.equal(TRICK_TEXT['trick.coin.name'], ':3 Coin Toss');
  assert.equal(TRICK_TEXT['trick.coin.bark'], 'Take my lucky coin. Throw it, it comes back!');
  assert.equal(TRICK_TEXT['trick.twirl.hint'], '[Jump] again in the air and hold to twirl');
  assert.equal(TRICK_TEXT['trick.cloud.bark'], "Catnip! They can't stay grumpy in this.");
  assert.equal(TRICK_TEXT['trick.swap'], 'Paw Trick: {name}');
  assert.equal(TRICK_EVENTS.unlocked, 'trick:unlocked');
  assert.equal(TRICK_EVENTS.used, 'trick:used');
});

// ------------------------------------------------------------------ touch layout / audio
test('touch: the ":3" button joins the cluster only when asked for, clear of every other button', () => {
  for (const [w, h] of [[844, 390], [390, 844], [1280, 720]]) {
    const A = computeLayout(w, h, {}), B = computeLayout(w, h, { extra: { trick: TRICK_BUTTON } });
    assert.equal(A.buttons.trick, undefined, 'no trick button before a trick is owned');
    assert.ok(B.buttons.trick, `${w}×${h}: placed`);
    assert.deepEqual(B.dropped, [], `${w}×${h}: nothing dropped`);
    assert.ok(minGap(B) >= 8 - 0.5, `${w}×${h}: gaps ${minGap(B).toFixed(1)}`);
    for (const k of Object.keys(A.buttons)) assert.deepEqual(B.buttons[k], A.buttons[k], `${w}×${h}: ${k} did not move`);
  }
});

test('audio: the trick zzfx sounds join the baked defs', () => {
  for (const k of Object.keys(TRICK_ZZFX)) { assert.ok(Array.isArray(ZZFX_DEFS[k]), k); assert.equal(ZZFX_DEFS[k].length, 21, k); }
});
