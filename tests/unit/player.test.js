// tests/unit/player.test.js  (owner: player) — GAME_DESIGN §19.9 U1 (Guard), U2 (Valor), U3 (Lives) plus the pure
// helpers (SafeGround, locomotion maths) and a headless Player integration run on core's fakeCtx (real Input, Combat,
// GameState; a tiny flat-ground physics stub) for the §7 moveset: combo, charge tiers, Tumble i-frames, parry +
// Riposte, Still Standing, Nine Lives, Golden Hour, Milk Break, Meow and the Meme Cam trigger.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PLAYER, ATTACKS, DIFFICULTY, GRAVITY } from '../../src/core/config.js';
import { E } from '../../src/core/events.js';
import { resolveGuard, GuardState, parryWindowFor } from '../../src/player/Guard.js';
import { Valor, valorGain } from '../../src/player/Valor.js';
import { Lives } from '../../src/player/Lives.js';
import { SafeGround } from '../../src/player/SafeGround.js';
import { speedForStick, approachAngle, STATE_NAMES } from '../../src/player/PlayerStates.js';
import { TUNING } from '../../src/player/tuning.js';
import { fakeCtx } from './_fakeCtx.mjs';

const DT = 1 / 60;
const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} expected ${b}, got ${a}`);
const deg = (d) => (d * Math.PI) / 180;
/** Unit direction INTO a target facing +Z (facing 0) from an attacker at `angle` (rad, + = her left) off her nose. */
const hitFrom = (angle) => ({ x: -Math.sin(angle), z: -Math.cos(angle) });
const guardState = (o = {}) => ({ dodgeT: 0, dodging: false, guarding: true, guardT: 0.05, grit: 3, lockoutT: 0, ...o });
const POKE = { id: 'test_poke', telegraph: 'parry', dmg: 1, poise: 1, knock: 3 };

// ================================================================== U1 Guard
test('U1 Guard: parry at guardT 0.149 vs block at 0.151 (Knight window 0.15)', () => {
  assert.equal(resolveGuard(guardState({ guardT: 0.149 }), POKE, hitFrom(0), 0, PLAYER), 'parry');
  const g = guardState({ guardT: 0.151 });
  assert.equal(resolveGuard(g, POKE, hitFrom(0), 0, PLAYER), 'block');
  assert.equal(g.grit, 2, 'a block costs 1 Grit');
});

test('U1 Guard: frontal arc ±70° — 69.9° blocks, 70.1° hits (both sides, any facing)', () => {
  for (const facing of [0, 1.3, -2.8]) {
    for (const side of [1, -1]) {
      const at = (d) => {
        const a = facing + side * deg(d);                       // attacker direction in world yaw
        return { x: -Math.sin(a), z: -Math.cos(a) };
      };
      assert.equal(resolveGuard(guardState({ guardT: 0.5 }), POKE, at(69.9), facing, PLAYER), 'block', `69.9° side ${side} facing ${facing}`);
      assert.equal(resolveGuard(guardState({ guardT: 0.5 }), POKE, at(70.1), facing, PLAYER), 'hit', `70.1° side ${side} facing ${facing}`);
    }
  }
  assert.equal(resolveGuard(guardState(), POKE, hitFrom(Math.PI), 0, PLAYER), 'hit', 'from behind');
  assert.equal(resolveGuard(guardState({ guarding: false }), POKE, hitFrom(0), 0, PLAYER), 'hit', 'not guarding');
});

test('U1 Guard: red / unblockable attacks break the Stand (even inside the parry window); Grit untouched', () => {
  const g = guardState({ guardT: 0.01 });
  assert.equal(resolveGuard(g, { ...POKE, telegraph: 'red' }, hitFrom(0), 0, PLAYER), 'break');
  assert.equal(resolveGuard(guardState(), { ...POKE, telegraph: 'aoe', unblockable: true }, hitFrom(0), 0, PLAYER), 'break');
  assert.equal(g.grit, 3);
});

test('U1 Guard: poise ≥ 3 costs 2 Grit, lighter hits 1; Grit 0 → guard break', () => {
  const g = guardState({ guardT: 1 });
  assert.equal(resolveGuard(g, { ...POKE, poise: 3 }, hitFrom(0), 0, PLAYER), 'block'); assert.equal(g.grit, 1);
  assert.equal(resolveGuard(g, { ...POKE, poise: 1 }, hitFrom(0), 0, PLAYER), 'break'); assert.equal(g.grit, 0);
  const h = guardState({ guardT: 1, grit: 2 });
  assert.equal(resolveGuard(h, { ...POKE, poise: 5 }, hitFrom(0), 0, PLAYER), 'break', 'a 2-Grit hit on 2 Grit breaks');
});

test('U1 Guard: whiff lockout — a Stand tapped < 0.25 s that touched nothing disables parry for 0.30 s', () => {
  const g = new GuardState(PLAYER);
  g.start(); for (let i = 0; i < 6; i++) g.update(DT);           // 0.1 s
  assert.equal(g.stop(), true, 'whiff');
  near(g.lockoutT, PLAYER.guard.whiffLockout, 1e-9);
  g.start();
  assert.equal(g.resolve(POKE, hitFrom(0), 0), 'block', 'parry disabled during the lockout (blocking still works)');
  g.stop(); g.reset();
  // locked out for 0.30 s, then parry works again
  g.start(); g.stop();
  let t = 0; while (t < PLAYER.guard.whiffLockout - 0.02) { g.update(DT); t += DT; }
  g.start(); assert.equal(g.resolve(POKE, hitFrom(0), 0), 'block', 'still locked at 0.28 s');
  g.stop(); g.lockoutT = 0.001; g.update(DT);
  g.start(); assert.equal(g.resolve(POKE, hitFrom(0), 0), 'parry', 'lockout over');
  // a Stand that blocked is no whiff; a long Stand is no whiff
  const h = new GuardState(PLAYER);
  h.start(); h.guardT = 0.2; h.resolve(POKE, hitFrom(0), 0); assert.equal(h.stop(), false, 'touched → no whiff');
  h.start(); h.guardT = 0.3; assert.equal(h.stop(), false, 'held 0.3 s → no whiff');
});

test('U1 Guard: Tumble i-frames — perfect dodge ≤ 0.20, graze to 0.30, outside them a normal hit', () => {
  const d = (t) => resolveGuard(guardState({ guarding: false, dodging: true, dodgeT: t }), POKE, hitFrom(0), 0, PLAYER);
  assert.equal(d(0.03), 'hit', 'before 0.04');
  assert.equal(d(0.04), 'perfectDodge');
  assert.equal(d(0.199), 'perfectDodge');
  assert.equal(d(0.20), 'perfectDodge', '0.20 is still perfect');
  assert.equal(d(0.201), 'graze');
  assert.equal(d(0.30), 'graze');
  assert.equal(d(0.31), 'hit', 'after 0.30');
  assert.equal(resolveGuard(guardState({ dodging: true, dodgeT: 0.1 }), { ...POKE, telegraph: 'red' }, hitFrom(0), 0, PLAYER), 'perfectDodge', 'red attacks are dodgeable');
});

test('U1 Guard: Grit regen 1 per 1.5 s after 0.8 s without blocking; parry windows per difficulty (+0.05 touch)', () => {
  const g = new GuardState(PLAYER);
  g.start(); g.guardT = 1; g.resolve({ ...POKE, poise: 3 }, hitFrom(0), 0); g.stop();
  assert.equal(g.grit, 1);
  let changed = 0, t = 0;
  while (t < PLAYER.guard.gritRegenDelay + PLAYER.guard.gritRegenEvery - 0.05) { if (g.update(DT)) changed++; t += DT; }
  assert.equal(g.grit, 1, 'nothing before delay + 1.5 s');
  for (let i = 0; i < 6; i++) if (g.update(DT)) changed++;
  assert.equal(g.grit, 2); assert.equal(changed, 1);
  for (let i = 0; i < 200; i++) g.update(DT);
  assert.equal(g.grit, 3, 'caps at 3');
  near(parryWindowFor(DIFFICULTY.kitten, false), 0.25); near(parryWindowFor(DIFFICULTY.knight, false), 0.15);
  near(parryWindowFor(DIFFICULTY.nine, false), 0.12); near(parryWindowFor(DIFFICULTY.knight, true), 0.20);
  const k = guardState({ guardT: 0.2, parryWindow: 0.25 });
  assert.equal(resolveGuard(k, POKE, hitFrom(0), 0, PLAYER), 'parry', 'Kitten window 0.25');
});

// ================================================================== U2 Valor
test('U2 Valor: every flat gain from the §7.4 table', () => {
  const V = PLAYER.valor;
  const table = { light: V.light, heavy: V.heavy, parry: V.parry, riposte: V.riposte, perfectDodge: 12, graze: 4, choke: V.choke, kitten: V.kitten, stillStanding: 30, hurt: -10 };
  for (const [k, v] of Object.entries(table)) assert.equal(valorGain(k), v, k);
  assert.deepEqual([V.light, V.heavy, V.parry, V.riposte, V.choke, V.kitten], [4, 6, 20, 8, 10, 25]);
  const val = new Valor(PLAYER);
  assert.equal(val.gain('parry'), 20); assert.equal(val.gain('kitten'), 25); assert.equal(val.value, 45);
  assert.equal(val.add(200), 55, 'clamped at 100'); assert.equal(val.value, 100);
  assert.equal(val.full, true);
});

test('U2 Valor: light hits +4 each, at most +8 per swing; heavy +6 uncapped; a new swing resets the cap', () => {
  const v = new Valor(PLAYER);
  assert.equal(v.hit('light', 1), 4); assert.equal(v.hit('light', 1), 4); assert.equal(v.hit('light', 1), 0, 'third target same swing');
  assert.equal(v.value, 8);
  assert.equal(v.hit('light', 2), 4, 'next swing');
  assert.equal(v.hit('heavy', 3), 6); assert.equal(v.hit('heavy', 3), 6);
  assert.equal(v.value, 24);
});

test('U2 Valor: Standing Ground +5/s after 1 s planted with a threat, capped +30 per Stand, reset after 0.5 s released', () => {
  const v = new Valor(PLAYER);
  const S = (sec, o) => { let d = 0; for (let t = 0; t < sec - 1e-9; t += DT) d += v.standTick(DT, o); return d; };
  const stand = { guarding: true, speed: 0, threatened: true, inJeer: false };
  near(S(0.95, stand), 0, 1e-9, 'nothing during the first second');
  near(S(2.05, stand), 10, 0.15, '+5/s');
  assert.equal(v.standing, true);
  S(10, stand);
  near(v.value, 30, 1e-6, 'cap 30 per Stand'); assert.equal(v.standing, false);
  S(0.4, { ...stand, guarding: false });
  near(S(3.0, stand), 0, 1e-9, 'released only 0.4 s: cap not reset');
  S(0.55, { ...stand, guarding: false });
  near(S(2.0, stand), 5, 0.1, 'cap reset after 0.5 s released; 1 s planted again first');
  // conditions
  const w = new Valor(PLAYER);
  for (let t = 0; t < 3; t += DT) w.standTick(DT, { ...stand, speed: 0.5 });
  assert.equal(w.value, 0, 'moving faster than 0.1 m/s');
  for (let t = 0; t < 3; t += DT) w.standTick(DT, { ...stand, threatened: false });
  assert.equal(w.value, 0, 'no alerted enemy within 6 m');
});

test('U2 Valor: Jeer aura −6/s outside the Stand, +10/s inside it', () => {
  const v = new Valor(PLAYER); v.set(50);
  let d = 0; for (let i = 0; i < 60; i++) d += v.standTick(DT, { guarding: false, speed: 2, threatened: true, inJeer: true });
  near(d, -6, 1e-6); near(v.value, 44, 1e-6);
  for (let i = 0; i < 60; i++) v.standTick(DT, { guarding: true, speed: 0, threatened: true, inJeer: true });   // 1 s planted
  d = 0; for (let i = 0; i < 60; i++) d += v.standTick(DT, { guarding: true, speed: 0, threatened: true, inJeer: true });
  near(d, 10, 0.05, '+10/s in a Jeer aura');
});

test('U2 Valor: hurt −10, Holy cost 50, Golden Hour lock 3 s, respawn ×0.5, level reset', () => {
  const v = new Valor(PLAYER); v.set(55);
  assert.equal(v.hurt(), -10); assert.equal(v.value, 45);
  assert.equal(v.canSpend(50), false); v.add(5); assert.equal(v.canSpend(50), true);
  assert.equal(v.spend(PLAYER.valor.holyCost), -50); assert.equal(v.value, 0);
  v.set(100); v.spend(PLAYER.valor.goldenCost); v.lock(PLAYER.golden.valorLockAfter);
  assert.equal(v.gain('parry'), 0, 'locked'); assert.equal(v.hit('heavy', 9), 0);
  for (let t = 0; t < 2.9; t += DT) v.update(DT);
  assert.equal(v.gain('parry'), 0, 'still locked at 2.9 s');
  for (let t = 0; t < 0.2; t += DT) v.update(DT);
  assert.equal(v.gain('parry'), 20, 'unlocked after 3 s');
  v.set(57); assert.equal(v.respawn(), -29); assert.equal(v.value, 28, 'halved, rounded down');
  v.lock(3); v.reset(); assert.equal(v.value, 0); assert.equal(v.lockT, 0); assert.equal(v.gain('light'), 4);
});

// ================================================================== U3 Lives
test('U3 Lives: Still Standing once per checkpoint segment, re-armed by a checkpoint', () => {
  const l = new Lives(DIFFICULTY.knight);
  assert.equal(l.tryStillStanding(), true); assert.equal(l.tryStillStanding(), false);
  l.checkpoint(); assert.equal(l.tryStillStanding(), true);
  l.levelStart(); assert.equal(l.tryStillStanding(), true, 'a level start is a new segment');
});

test('U3 Lives: Knight — 9 per level, each faint −1, 0 → game over, the next level attempt refills', () => {
  const l = new Lives(DIFFICULTY.knight);
  assert.equal(l.lives, 9); assert.equal(l.infinite, false); assert.equal(l.scope, 'level');
  for (let i = 8; i >= 1; i--) assert.deepEqual(l.loseLife(), { lives: i, gameOver: false });
  assert.equal(l.last, true);
  assert.deepEqual(l.loseLife(), { lives: 0, gameOver: true });
  assert.equal(l.gameOver, true);
  l.levelStart(); assert.equal(l.lives, 9); assert.equal(l.gameOver, false);
});

test('U3 Lives: Kitten = unlimited (never game over); Nine Lives keeps the count across levels (game scope)', () => {
  const k = new Lives(DIFFICULTY.kitten);
  assert.equal(k.infinite, true);
  for (let i = 0; i < 30; i++) assert.equal(k.loseLife().gameOver, false);
  assert.equal(k.lives, 9, 'counter never moves');
  const n = new Lives(DIFFICULTY.nine);
  assert.equal(n.scope, 'game');
  n.loseLife(); n.loseLife();
  n.levelStart(n.lives); assert.equal(n.lives, 7, 'kept across a level load');
  n.levelStart(4); assert.equal(n.lives, 4, 'restored from the save');
  for (let i = 0; i < 4; i++) n.loseLife();
  assert.equal(n.gameOver, true);
  n.levelStart(0); assert.equal(n.lives, 9, 'restart after 0 refills');
  n.setDifficulty(DIFFICULTY.kitten); assert.equal(n.infinite, true);
});

// ================================================================== pure helpers
test('SafeGround: 8 samples every 0.5 s while safe; best() skips samples too close to the water', () => {
  const s = new SafeGround();
  assert.equal(s.size, PLAYER.water.safeSamples);
  const pos = { x: 0, y: 0, z: 0 };
  for (let t = 0; t < 6; t += DT) { pos.x += 2 * DT; s.update(DT, pos, true); }
  assert.equal(s.count, 8);
  const latest = s.recent(0), older = s.recent(1);
  near(latest.x - older.x, 1.0, 0.05, '0.5 s apart at 2 m/s');
  const out = new THREE.Vector3();
  assert.equal(s.best(out, { x: latest.x + 0.2, z: 0 }, 1.0), true);
  assert.ok(Math.abs(out.x - (latest.x + 0.2)) >= 1.0, 'at least 1 m from the splash');
  s.update(1, { x: 99, y: 0, z: 0 }, false); assert.ok(s.recent(0).x < 99, 'unsafe positions are never sampled');
  s.clear(); assert.equal(s.best(out), false);
});

test('locomotion: walk ≤ half stick at 2.0 m/s, full stick runs 5.5 m/s; approachAngle turns the short way', () => {
  assert.equal(speedForStick(0), 0); near(speedForStick(0.5), PLAYER.walk); near(speedForStick(1), PLAYER.run);
  assert.ok(speedForStick(0.75) > PLAYER.walk && speedForStick(0.75) < PLAYER.run);
  near(approachAngle(3, -3, 0.1), 3.1, 1e-9, 'wraps through π');
  near(approachAngle(0, 0.05, 0.1), 0.05);
  assert.ok(STATE_NAMES.includes('guard') && STATE_NAMES.includes('dodge') && STATE_NAMES.includes('memecam'));
});

// ================================================================== Player integration (headless)
/** fakeCtx + a flat-ground physics stub; returns helpers to drive the fixed step. */
async function rig({ difficulty = 'knight' } = {}) {
  const ctx = fakeCtx();
  ctx.state.difficulty = difficulty;
  ctx.physics = {
    moveActor(a, dt) {
      if (a.attachedTo) return;
      if (!a.onGround || a.vel.y > 0) a.vel.y = Math.max(a.vel.y - GRAVITY * (a.gravityMul ?? 1) * dt, -(a.terminalFall ?? 14));
      a.pos.addScaledVector(a.vel, dt);
      a.landImpact = 0; a.stepY = 0;
      if (a.pos.y <= 0) { if (!a.onGround) a.landImpact = -a.vel.y; a.pos.y = 0; if (a.vel.y < 0) a.vel.y = 0; a.onGround = true; }
      else a.onGround = false;
    },
    heightAt: () => 0, isDeepWater: () => false, isShallowWater: () => false,
  };
  const p = ctx.player;
  p.model.init = async () => {};                        // no WebGL / DOM in node: the kitten is never built
  await p.init();                                       // bus listeners, actor registration, state sync
  p.pos.set(0, 0, 0); p.onGround = true;
  const events = [];
  const on = ctx.bus.on.bind(ctx.bus);
  for (const name of Object.values(E)) on(name, (payload) => events.push([name, payload]));
  const input = ctx.input;
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      ctx.actors.forEach?.((a) => a.beginStep?.());
      input.update(DT); p.update(DT); input.endStep();
      ctx.game.time += DT;
    }
  };
  const press = (a) => input._press(a, 'test');
  const release = (a) => input._release(a, 'test');
  const tap = (a) => { press(a); step(); release(a); };
  const seconds = (s) => step(Math.round(s / DT));
  const count = (name) => events.filter((e) => e[0] === name).length;
  const last = (name) => [...events].reverse().find((e) => e[0] === name)?.[1];
  /** a dummy enemy actor in front of her */
  const enemy = (dist = 1.2, angle = 0) => {
    const e = new (Object.getPrototypeOf(p.constructor.prototype).constructor)(ctx, { faction: 'enemy', radius: 0.3, height: 0.8, maxHp: 30 });
    e.pos.set(Math.sin(angle) * dist, 0, Math.cos(angle) * dist);
    e.alerted = true; e.stateName = 'chase'; e.parried = 0;
    e.onParried = () => { e.parried++; };
    ctx.actors.register(e);
    return e;
  };
  return { ctx, p, input, step, press, release, tap, seconds, events, count, last, enemy };
}

test('Player: the 3-hit combo chains in its windows (slash1 → slash2 → slash3) and lands back in move', async () => {
  const r = await rig(), { p } = r;
  r.tap('attack');
  assert.equal(p.state, 'attack'); assert.equal(p.swing.def.id, 'slash1');
  r.seconds(0.2); r.tap('attack');                         // press inside 0.18–0.40 queues the next swing…
  assert.equal(p.swing.def.id, 'slash1', 'queued: slash1 is not cut off');
  r.seconds(0.2);
  assert.equal(p.swing.def.id, 'slash2', '…which starts when slash1 recovery ends (0.40 s)');
  r.seconds(0.2); r.tap('attack');
  r.seconds(0.2);
  assert.equal(p.swing.def.id, 'slash3');
  const combos = r.events.filter((e) => e[0] === E.PLAYER_SWING).map((e) => e[1].combo);
  assert.deepEqual(combos, [1, 2, 3]);
  r.seconds(0.7);
  assert.equal(p.state, 'move'); assert.equal(p.swing, null);
  // a press after the window starts a fresh slash1
  r.tap('attack'); r.seconds(0.4 + TUNING.comboGrace + 0.1); r.tap('attack');
  assert.equal(p.swing.def.id, 'slash1', 'late press → new combo');
});

test('Player: keyboard combo grace — presses ~0.45–0.55 s apart (just after each swing ends) still reach Big Swoosh', async () => {
  for (const gap of [0.45, 0.55]) {
    const r = await rig(), { p } = r;
    const ids = [];
    r.tap('attack'); ids.push(p.swing?.def.id);
    r.seconds(gap - DT); r.tap('attack'); ids.push(p.swing?.def.id);
    r.seconds(gap - DT); r.tap('attack'); ids.push(p.swing?.def.id);
    assert.deepEqual(ids, ['slash1', 'slash2', 'slash3'], `gap ${gap}`);
  }
});

test('Player: charge — release 0.35–0.60 → Big Swoosh; ≥ 0.60 → Bright Slash; tier 2 fizzles without Shard 1 / Valor 50', async () => {
  const r = await rig(), { p } = r;
  r.press('attack'); r.seconds(0.48); r.release('attack'); r.step();
  assert.equal(p.swing?.def.id, 'slash3', 'early release');
  r.seconds(1);
  r.press('attack'); r.seconds(1.3);
  assert.equal(p.state, 'charge'); assert.equal(p.chargeTier, 1, 'no shard: tier 1 only');
  assert.ok(r.events.some((e) => e[0] === E.PLAYER_CHARGE && e[1].fizzle), 'the gold sparkles fizzle at 1.10 s');
  r.release('attack'); r.step();
  assert.equal(p.swing?.def.id, 'bright');
  assert.equal(r.count(E.PLAYER_HOLY), 0);
});

test('Player: Holy Slash — Shard 1 + Valor ≥ 50, held 1.10 s → holy on release, −50 Valor, i-frames, slow motion', async () => {
  const r = await rig(), { p, ctx } = r;
  ctx.state.shards = 1; p.setValor(60);
  r.press('attack'); r.seconds(1.15);
  assert.equal(p.chargeTier, 2); assert.equal(p.charge, 1);
  r.release('attack'); r.step();
  assert.equal(p.swing?.def.id, 'holy');
  assert.equal(r.count(E.PLAYER_HOLY), 1);
  assert.equal(p.valor, 10);
  r.seconds(0.25);
  assert.ok(ctx.game.slowMos.some(([s]) => Math.abs(s - ATTACKS.holy.timeScale[0]) < 1e-9), 'time scale 0.35 on impact');
  const e = r.enemy(1.2, 0);
  assert.equal(ctx.combat.applyHit(e, p, ATTACKS.rat_poke), 'immune', 'holy i-frames 0–0.46');
  assert.equal(p.hp, p.maxHp);
});

test('Player: Tumble — 0.40 s at 9 → 4 m/s (~2.6 m), perfect dodge +12 Valor + crit window, then the cooldown', async () => {
  const r = await rig(), { p } = r;
  r.input.move.y = 1;
  r.tap('dodge');
  assert.equal(p.state, 'dodge');
  r.seconds(0.08);
  const e = r.enemy(2, Math.PI);
  assert.equal(p.resolveIncoming(e, POKE, new THREE.Vector3(0, 0, 1)), 'immune');
  assert.equal(p.valor, 12); assert.ok(p.critT > 1.0);
  assert.equal(r.last(E.PLAYER_PERFECT_DODGE).graze, false);
  p.resolveIncoming(e, POKE, new THREE.Vector3(0, 0, 1));
  assert.equal(p.valor, 12, 'rewarded once per Tumble');
  r.input.move.y = 0;
  r.seconds(0.4);
  assert.equal(p.state, 'move');
  near(p.pos.z, 2.6, 0.25, 'distance');
  r.tap('dodge'); assert.equal(p.state, 'move', 'cooldown 0.20 s');
  r.seconds(0.25); r.tap('dodge'); assert.equal(p.state, 'dodge');
});

test('Player: parry through Combat.applyHit → +20 Valor, enemy onParried, then ⚔ within 0.8 s = Riposte (×2 crit)', async () => {
  const r = await rig(), { p, ctx } = r;
  const e = r.enemy(1.2, 0);
  r.press('guard'); r.step(3);
  assert.equal(p.state, 'guard'); assert.ok(p.guarding);
  const res = ctx.combat.applyHit(e, p, ATTACKS.rat_poke);
  assert.equal(res, 'parry');
  assert.equal(e.parried, 1); assert.equal(p.valor, 20); assert.equal(p.hp, p.maxHp);
  assert.equal(r.count(E.PLAYER_PARRY), 1);
  r.step(); r.tap('attack');
  assert.equal(p.swing?.def.id, 'riposte');
  // the Stand that made the parry is still held: it must not cancel the Riposte (requests/combat.md)
  r.seconds(0.3);
  assert.equal(p.state, 'attack', 'held Stand does not cancel the Riposte'); assert.equal(p.swing?.def.id, 'riposte');
  r.seconds(0.3);
  assert.equal(p.state, 'guard', 'back into the still-held Stand when the swing ends');
  // ⚔ out of a held Stand (no parry): a slash that plays out; a FRESH Stand press still cancels a swing
  r.seconds(1); r.tap('attack');
  assert.equal(p.swing?.def.id, 'slash1'); r.step(4);
  assert.equal(p.state, 'attack', 'held Stand does not cancel a slash out of the Stand');
  r.release('guard'); r.seconds(0.5); assert.equal(p.state, 'move');
  r.tap('attack'); r.step(2); r.press('guard'); r.step(2);
  assert.equal(p.state, 'guard', 'a fresh Stand press cancels the wind-up');
  r.release('guard');
  // a late hit in the Stand is a block (1 Grit)
  const r2 = await rig(), e2 = r2.enemy(1.2, 0);
  r2.press('guard'); r2.seconds(0.4);
  assert.equal(r2.ctx.combat.applyHit(e2, r2.p, ATTACKS.rat_poke), 'block');
  assert.equal(r2.p.grit, 2); assert.equal(r2.p.hp, r2.p.maxHp);
});

test('Player: hurt → stun + blink i-frames; Still Standing once per segment; the faint costs a life and respawns', async () => {
  const r = await rig(), { p, ctx } = r;
  const e = r.enemy(1.2, 0);
  const big = { ...ATTACKS.rat_poke, dmg: 3 };
  p.setValor(15);
  assert.equal(ctx.combat.applyHit(e, p, big), 'hit');
  assert.equal(p.hp, 5); assert.equal(p.state, 'hurt'); assert.ok(p.blinkT > 0.8);
  assert.equal(r.last(E.PLAYER_VALOR)?.reason, 'hurt');
  p.invulnT = 0; p.hp = 1; p.setValor(40);
  ctx.combat.applyHit(e, p, big);
  assert.equal(p.alive, true); assert.equal(p.hp, PLAYER.stillStanding.hp, 'Still Standing at 1 HP');
  assert.equal(r.count(E.PLAYER_STILL_STANDING), 1); assert.equal(p.state, 'rise');
  assert.equal(p.valor, 60, '40 − 10 (hurt) + 30 (Still Standing)'); assert.ok(p.immuneT > 1.9);
  assert.equal(p.resolveIncoming(e, big, new THREE.Vector3(0, 0, -1)), 'immune', '2 s invulnerable');
  r.seconds(2.1); p.invulnT = 0;
  ctx.combat.applyHit(e, p, big);
  assert.equal(p.alive, false); assert.equal(p.state, 'dead');
  assert.deepEqual([r.last(E.PLAYER_LIFE_LOST).lives, p.lives], [8, 8]);
  r.seconds(TUNING.faintDur + 0.1);
  assert.equal(p.alive, true); assert.equal(p.hp, p.maxHp); assert.equal(p.state, 'move');
  assert.equal(p.valor, 25, 'respawn halves Valor (60 − 10 → 25)');
  // checkpoint re-arms Still Standing
  ctx.bus.emit(E.CHECKPOINT, { levelId: 'meadow', spawnId: 'vigil1' });
  p.invulnT = 0; p.hp = 1;
  const res = ctx.combat.applyHit(e, p, big);
  assert.equal(p.alive, true, 'Still Standing again after a Vigil Stone: ' + res + ' ' + p.state + ' armed ' + p.livesState.stillStandingArmed);
});

test('Player: Kitten difficulty never runs out of lives; Golden Hour halves damage, rounded down', async () => {
  const r = await rig({ difficulty: 'kitten' }), { p, ctx } = r;
  const e = r.enemy(1.2, 0);
  for (let i = 0; i < 12; i++) { p.alive = true; p.hurtable = true; p.hp = 1; p.invulnT = 0; p.livesState.stillStandingArmed = false; p.setState('move'); ctx.combat.applyHit(e, p, { ...ATTACKS.rat_poke, dmg: 4 }); }
  assert.equal(p.livesState.gameOver, false); assert.equal(p.infiniteLives, true);
  const g = await rig(), q = g.p, e2 = g.enemy(1.2, 0);
  g.ctx.state.shards = 2; q.setValor(100);
  g.tap('golden');
  assert.equal(q.golden, true); assert.equal(q.state, 'golden'); assert.equal(q.valor, 0);
  assert.equal(g.last(E.PLAYER_GOLDEN).on, true);
  g.seconds(PLAYER.golden.activate + 0.05);
  assert.equal(q.state, 'move');
  assert.equal(g.ctx.combat.applyHit(e2, q, { ...ATTACKS.rat_poke, dmg: 1 }), 'hit'); assert.equal(q.hp, 8, '1-HP hits do nothing');
  q.invulnT = 0;
  g.ctx.combat.applyHit(e2, q, { ...ATTACKS.rat_poke, dmg: 3 }); assert.equal(q.hp, 7, '3 → 1');
  assert.equal(q.state, 'move', 'super armour: no hurt stun');
});

test('Player: Golden Hour — Stand + ⚔ within 0.1 s triggers; 8 s later an automatic Sunburst, Valor locked 3 s', async () => {
  const r = await rig(), { p, ctx } = r;
  ctx.state.shards = 2; p.setValor(100);
  r.press('guard'); r.step(2); r.press('attack'); r.step();
  assert.equal(p.golden, true, 'combo within 0.1 s');
  assert.equal(ctx.env.contrib.get('golden')?.fogMul, PLAYER.golden.fogMul, 'fog ×0.5 contribution');
  r.release('guard'); r.release('attack');
  r.seconds(PLAYER.golden.activate + PLAYER.golden.dur - 0.2);
  assert.equal(p.golden, true, 'activation 0.8 s + 8 s');
  r.seconds(0.3);
  assert.equal(p.golden, false);
  assert.equal(p.swing?.def.id, 'sunburst');
  assert.equal(ctx.env.contrib.has('golden'), false);
  p.addValor(20, 'test'); assert.equal(p.valor, 0, 'locked');
  r.seconds(3.1); p.addValor(20, 'test'); assert.equal(p.valor, 20);
  // too slow a combo, or not full Valor, does nothing
  const s = await rig(); s.ctx.state.shards = 2; s.p.setValor(100);
  s.press('guard'); s.seconds(0.3); s.press('attack'); s.step();
  assert.equal(s.p.golden, false);
  const t2 = await rig(); t2.ctx.state.shards = 2; t2.p.setValor(99); t2.tap('golden'); assert.equal(t2.p.golden, false);
});

test('Player: Milk Break heals 4 at 0.5 s; a hit before then cancels it and keeps the bottle', async () => {
  const r = await rig(), { p, ctx } = r;
  p.hp = 3;
  r.tap('milk');
  assert.equal(p.state, 'sip'); assert.equal(r.last(E.PLAYER_MILK).phase, 'start');
  r.seconds(0.55);
  assert.equal(p.hp, 7); assert.equal(p.milk, PLAYER.milk.start - 1);
  r.seconds(0.5); assert.equal(p.state, 'move');
  p.hp = 3; r.tap('milk'); r.seconds(0.2);
  ctx.combat.applyHit(r.enemy(1, 0), p, ATTACKS.rat_poke);
  assert.equal(r.last(E.PLAYER_MILK).phase, 'cancel');
  assert.equal(p.milk, PLAYER.milk.start - 1, 'bottle kept');
  p.hp = p.maxHp; r.seconds(1); r.tap('milk'); assert.equal(p.state, 'move', 'no sip at full HP');
});

test('Player: jump apex ≈ 1.245 m, early release cuts it; Meow emits with a cooldown; Meme Cam via idle(16)', async () => {
  const r = await rig(), { p, ctx } = r;
  r.press('jump');
  let apex = 0;
  for (let i = 0; i < 90; i++) { r.step(); apex = Math.max(apex, p.pos.y); }
  r.release('jump');
  near(apex, 1.245, 0.08, 'apex (fixed-step Euler loses ~v·dt/2)');
  assert.equal(p.onGround, true);
  r.tap('jump'); let low = 0;
  for (let i = 0; i < 90; i++) { r.step(); low = Math.max(low, p.pos.y); }
  assert.ok(low < 0.7, `cut jump apex ${low.toFixed(2)}`);
  r.tap('meow'); r.tap('meow');
  assert.equal(r.count(E.PLAYER_MEOW), 1, 'cooldown 1 s');
  r.seconds(1.1); r.tap('meow'); assert.equal(r.count(E.PLAYER_MEOW), 2);
  r.seconds(0.7);
  p.memeCamTrigger.fastForward(16); r.step(2);
  assert.equal(p.memeCamTrigger.active, true); assert.equal(ctx.game.mode, 'memecam'); assert.equal(p.state, 'memecam');
  assert.equal(ctx.state.memeCamSeen, 1); assert.ok(ctx.state.cosmetics.capes.includes('memeWhite'));
  r.tap('attack');
  assert.equal(p.memeCamTrigger.active, false); assert.equal(ctx.game.mode, 'play');
});

test('Player: Zoomies after 2 s of straight full-stick running (7.2 m/s), ended by an attack; a 0-damage bump stuns half as long', async () => {
  const r = await rig(), { p, ctx } = r;
  r.input.move.y = 1;
  r.seconds(1.5);
  assert.equal(p.zoomies, false); near(Math.hypot(p.vel.x, p.vel.z), PLAYER.run, 0.05, 'run');
  r.seconds(1.0);
  assert.equal(p.zoomies, true); assert.equal(p.stateName, 'zoomies');
  near(Math.hypot(p.vel.x, p.vel.z), PLAYER.zoomies, 0.1, 'zoomies speed');
  r.tap('attack');
  assert.equal(p.zoomies, false, 'an attack ends the Zoomies');
  r.input.move.y = 0; r.seconds(1);
  const e = r.enemy(1.2, 0);
  ctx.combat.applyHit(e, p, { ...ATTACKS.dummy_swing, id: 'dummy_swing' });
  assert.equal(p.state, 'hurt'); assert.equal(p.hp, p.maxHp);
  r.seconds(PLAYER.hurt.stun * TUNING.bumpStunMul + 0.03);
  assert.equal(p.state, 'move', 'bump stun is half of the 0.35 s');
});

test('Player: her hits give Valor (light cap 8 per swing) but cage locks / props (breakable, tag prop) give none', async () => {
  const r = await rig(), { p, ctx } = r;
  const e = r.enemy(1.2, 0);
  r.tap('attack');
  const hit = (target, attackId = 'slash1') => ctx.bus.emit(E.HIT, { attacker: p, target, attackId, damage: 10, blocked: false });
  hit(e); hit(e); hit(e);
  assert.equal(p.valor, PLAYER.valor.lightPerSwingCap, 'light hits +4, capped at +8 per swing');
  const lock = { breakable: true, tags: new Set(['prop']), pos: e.pos, alive: true };
  r.seconds(0.6); r.tap('attack');
  hit(lock);
  assert.equal(p.valor, PLAYER.valor.lightPerSwingCap, 'a cage lock gives no Valor');
  hit({ tags: new Set(['prop']), pos: e.pos, alive: true }, 'slash3');
  assert.equal(p.valor, PLAYER.valor.lightPerSwingCap, 'a prop gives no Valor');
});

test('Player: mashing keeps the full Snip-Snap-Swoosh rhythm (each slash runs to its dur; ≈1.4 s total)', async () => {
  const r = await rig(), { p } = r;
  const starts = []; let t = 0, prevSerial = -1, endT = -1;
  r.tap('attack'); t += 1 / 60;
  for (let i = 0; i < 150; i++) {
    if (p.swingSerial !== prevSerial) { starts.push([p.swing?.def.id, t]); prevSerial = p.swingSerial; }
    if (p.state === 'move' && endT < 0 && starts.length) endT = t;
    if (i % 6 === 0) r.tap('attack'); else r.step();
    t += 1 / 60;
  }
  const ids = starts.map((s) => s[0]);
  assert.deepEqual(ids.slice(0, 3), ['slash1', 'slash2', 'slash3']);
  near(starts[1][1] - starts[0][1], ATTACKS.slash1.dur, 0.04, 'slash2 starts after slash1 dur');
  near(starts[2][1] - starts[1][1], ATTACKS.slash2.dur, 0.04, 'slash3 starts after slash2 dur');
  assert.ok(endT < 0 || endT - starts[0][1] >= 1.35, `combo length ${(endT - starts[0][1]).toFixed(2)} s`);
});

test('Player: Meme Cam stays off during the tutorial, on the practice field and near a Stand kitten zone', async () => {
  const r = await rig(), { p, ctx } = r;
  const mt = p.memeCamTrigger;
  // tutorial running
  ctx.story = { tutorial: { active: true } };
  mt.fastForward(30); r.step(2);
  assert.equal(mt.active, false, 'idle trigger suppressed in tutorial');
  r.press('guard'); r.seconds(3.5);
  assert.equal(mt.active, false, 'manual trigger suppressed in tutorial'); assert.equal(p.guarding, true);
  r.release('guard'); r.seconds(0.5);
  ctx.story = { tutorial: { active: false } };
  // practice field (meadow)
  const prevLevels = ctx.levels;
  ctx.levels = { ...(prevLevels ?? {}), current: { id: 'meadow', indoor: false } };
  p.pos.set(0, 0, -86);
  r.press('guard'); r.seconds(3.5);
  assert.equal(mt.active, false, 'practice field: no manual Meme Cam by the Wobble Knight');
  r.release('guard'); r.seconds(0.5);
  ctx.levels = prevLevels;
  p.pos.set(0, 0, 0);
  // a hidden Stand kitten nearby
  const prevComp = ctx.companions;
  ctx.companions = { ...(prevComp ?? {}), kittens: [{ hide: 'stand', stateName: 'hidden', opts: { zoneAt: { x: 1, z: 1 }, zoneR: 1.2 }, home: { x: 1, z: 1 } }] };
  r.press('guard'); r.seconds(3.5);
  assert.equal(mt.active, false, 'Stand kitten zone: the reveal plays, not Meme Cam');
  r.release('guard'); r.seconds(0.5);
  ctx.companions = prevComp;
  // nothing suppressing: the manual trigger still works
  r.press('guard'); r.seconds(3.0);
  assert.equal(mt.active, true, 'manual trigger otherwise'); assert.equal(mt.reason, 'manual');
});

test('Player: touch auto-combo taps — a tap ≤ 0.35 s after a Snip/Snap ends continues the chain; keyboard does not', async () => {
  const r = await rig(), { p, ctx } = r;
  ctx.input.setDevice('touch');
  const ids = [];
  r.tap('attack'); ids.push(p.swing?.def.id);
  r.seconds(0.45); assert.equal(p.state, 'move', 'Snip ran out');
  r.tap('attack'); ids.push(p.swing?.def.id);                // 0.05 s after the swing ended → Snap
  r.seconds(0.45);
  r.tap('attack'); ids.push(p.swing?.def.id);                // → Big Swoosh
  assert.deepEqual(ids, ['slash1', 'slash2', 'slash3']);
  r.seconds(1.2);
  // past the grace → a fresh Snip
  r.tap('attack'); r.seconds(0.4 + TUNING.autoComboGrace + 0.1); r.tap('attack');
  assert.equal(p.swing?.def.id, 'slash1', 'late tap → new combo');
  // a tap early in the swing (before combo[0]) still queues on touch
  r.step(3); r.tap('attack'); r.seconds(0.45);
  assert.equal(p.swing?.def.id, 'slash2', 'early tap queued');
  // keyboard: only the short comboGrace applies — a tap 0.3 s after the swing ended restarts at slash1
  const k = await rig();
  k.tap('attack'); k.seconds(0.4 + 0.3); k.tap('attack');
  assert.equal(k.p.swing?.def.id, 'slash1', 'keyboard grace is shorter than touch');
});

test('Player: a Stand re-entered with the button still held is a plain block (parry needs a fresh press)', async () => {
  const r = await rig(), { p, ctx } = r;
  const e = r.enemy(1.2, 0);
  r.press('guard'); r.seconds(0.5);
  r.tap('attack'); assert.equal(p.state, 'attack');          // ⚔ out of the held Stand
  r.seconds(0.6); assert.equal(p.state, 'guard', 'back into the held Stand');
  assert.equal(ctx.combat.applyHit(e, p, ATTACKS.rat_poke), 'block', 'no fresh parry window');
  r.release('guard'); r.seconds(0.5);
  r.press('guard'); r.step(3);
  assert.equal(ctx.combat.applyHit(e, p, ATTACKS.rat_poke), 'parry', 'a fresh press still parries');
  // GuardState: start(sincePress) carries the press age; a held re-entry is no whiff either
  const g = new GuardState(PLAYER);
  g.start(Infinity); assert.equal(g.resolve(POKE, hitFrom(0), 0), 'block');
  assert.equal(g.stop(), false, 'held re-entry released quickly is not a whiff');
  g.start(0.1); g.update(0.04); assert.equal(g.resolve(POKE, hitFrom(0), 0), 'parry', '0.14 s after the press');
});

test('Guard: a Grit-exhaustion break refills Grit after the stagger (no chained breaks); red breaks keep Grit', () => {
  const g = new GuardState();
  g.start(1); g.guardT = 1; g.parryT = 1;
  const POKE = { dmg: 1, poise: 1 };
  assert.equal(g.resolve(POKE, hitFrom(0), 0), 'block');
  assert.equal(g.resolve(POKE, hitFrom(0), 0), 'block');
  assert.equal(g.resolve(POKE, hitFrom(0), 0), 'break');
  assert.equal(g.lastBreakExhaust, true); assert.equal(g.grit, 0);
  let t = 0; while (t < PLAYER.guard.breakStagger + 0.05) { g.update(DT); t += DT; }
  assert.equal(g.grit, g.gritMax, 'full Grit after the break stagger');
  assert.equal(g.resolve(POKE, hitFrom(0), 0), 'block', 'the next hit is a block again');
  assert.equal(g.resolve({ dmg: 2, telegraph: 'red' }, hitFrom(0), 0), 'break');
  assert.equal(g.lastBreakExhaust, false); assert.equal(g.grit, 2, 'red break: Grit untouched');
});

test('Player: a Grit-exhaustion break staggers with 0 damage; a red attack breaks for full damage', async () => {
  const r = await rig(), { p, ctx } = r;
  const e = r.enemy(1.2, 0);
  r.press('guard'); r.seconds(0.5);
  const POKE = { ...ATTACKS.rat_poke, telegraph: undefined, unblockable: false };
  const res = [];
  for (let i = 0; i < 3; i++) { res.push(ctx.combat.applyHit(e, p, POKE)); r.seconds(0.05); }
  assert.deepEqual(res, ['block', 'block', 'break']);
  assert.equal(p.hp, p.maxHp, 'exhaustion break: no damage');
  assert.equal(p.state, 'stagger');
  r.seconds(1.0);
  assert.equal(p.grit, PLAYER.guard.grit, 'Grit refilled after the stagger');
  assert.equal(p.state, 'guard', 'back in the held Stand');
  r.seconds(1.0);
  const red = { ...ATTACKS.rat_poke, dmg: 2, telegraph: 'red' };
  assert.equal(ctx.combat.applyHit(e, p, red), 'break');
  assert.ok(p.hp < p.maxHp, 'red break deals damage');
});

test('Player: deep water — splash returns her ≥ 3 m away facing away, ignores held input, never costs a life', async () => {
  const r = await rig(), { p, ctx } = r;
  const WATER_Z = 10;
  ctx.physics.isDeepWater = (x, z) => z >= WATER_Z;
  // walk north toward the water, laying down safe-ground samples
  for (let z = 0; z < WATER_Z - 0.5; z += 0.25) { p.pos.set(0, 0, z); p.onGround = true; r.step(8); }
  p.hp = 3;
  let lifeLost = 0; ctx.bus.on(E.PLAYER_LIFE_LOST ?? 'player:lifeLost', () => lifeLost++);
  ctx.input.move.x = 0; ctx.input.move.y = 1;      // stick held "forward"
  for (let i = 0; i < 12; i++) {
    p.pos.set(0, 0, WATER_Z + 0.5); p.onGround = true; r.step();      // she is in the water
    assert.ok(p.pos.z <= WATER_Z - 3 + 1e-6, `returned ≥ 3 m from the water (z=${p.pos.z})`);
    assert.ok(Math.cos(p.facing) < -0.9, 'faces away from the water');
    r.seconds(0.3);
    assert.ok(p.pos.z <= WATER_Z - 2.5, 'the held stick does not walk her back in');
    r.seconds(0.7);
  }
  assert.equal(p.hp, 1, 'water floors at 1 HP');
  assert.ok(p.alive); assert.equal(lifeLost, 0);
  assert.equal(r.count(E.PLAYER_DAMAGED), 2, '−1 per splash outside the cooldown, never the killing blow');
});
