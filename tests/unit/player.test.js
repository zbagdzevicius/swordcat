// tests/unit/player.test.js  (owner: player) — GAME_DESIGN §19.9 U1 (Guard), U2 (Valor), U3 (Lives) plus the pure
// helpers (SafeGround, locomotion maths) and a headless Player integration run on core's fakeCtx (real Input, Combat,
// GameState; a tiny flat-ground physics stub) for the §7 moveset: combo, charge tiers, Tumble i-frames, parry +
// Riposte, Still Standing, Nine Lives, Golden Hour, Milk Break, Meow and the Meme Cam trigger.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PLAYER, ATTACKS, DIFFICULTY, GRAVITY, AIM, NAV, HAPTICS } from '../../src/core/config.js';
import { jumpAssistPlan, hopSpeed } from '../../src/player/Aim.js';
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
/**
 * @param {{ difficulty?: string, floor?: (x:number, z:number) => number, exact?: boolean }} [o]
 *   floor: the ground height (default 0); exact: integrate the vertical move with the mean of the speed before and
 *   after gravity, like physics/Physics.js (the default semi-implicit Euler peaks ~v·dt/2 low)
 */
async function rig({ difficulty = 'knight', floor = () => 0, exact = false } = {}) {
  const ctx = fakeCtx();
  ctx.state.difficulty = difficulty;
  ctx.physics = {
    moveActor(a, dt) {
      if (a.attachedTo) return;
      const vy0 = a.vel.y;
      if (!a.onGround || a.vel.y > 0) a.vel.y = Math.max(a.vel.y - GRAVITY * (a.gravityMul ?? 1) * dt, -(a.terminalFall ?? 14));
      const ny = a.pos.y + (exact ? (vy0 + a.vel.y) / 2 : a.vel.y) * dt;
      a.pos.addScaledVector(a.vel, dt); a.pos.y = ny;
      a.landImpact = 0; a.stepY = 0;
      const fy = floor(a.pos.x, a.pos.z);
      if (a.pos.y <= fy) { if (!a.onGround) a.landImpact = -a.vel.y; a.pos.y = fy; if (a.vel.y < 0) a.vel.y = 0; a.onGround = true; }
      else a.onGround = false;
    },
    heightAt: (x, z) => floor(x, z), isDeepWater: () => false, isShallowWater: () => false,
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

test('Player: a ⚔ press during Big Swoosh is kept and swings when it ends (the first tap after an auto kill)', async () => {
  for (const dev of ['touch', 'kbm']) {
    const r = await rig(), { p, ctx } = r;
    if (dev === 'touch') ctx.input.setDevice('touch');
    p.startAttack('slash3');
    r.seconds(0.1); r.tap('attack');                         // 0.5 s before the finisher ends: past the 0.2 s buffer
    assert.equal(p.swing?.def.id, 'slash3', `${dev}: the finisher is not cut off`);
    const serial = p.swingSerial;
    r.seconds(0.6);
    assert.ok(p.swingSerial > serial, `${dev}: the press started a new swing when Big Swoosh ended`);
    assert.equal(r.last(E.PLAYER_SWING)?.combo, 1, `${dev}: a fresh Snip`);
  }
  // no press: the finisher lands back in move
  const r = await rig(), { p } = r;
  p.startAttack('slash3'); r.seconds(0.8);
  assert.equal(p.state, 'move');
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
  r.seconds(koRespawnT() + 0.1);
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

test('Player: jump apex ≈ 1.604 m (TT5), early release cuts it; Meow emits with a cooldown; Meme Cam via idle(16)', async () => {
  const r = await rig(), { p, ctx } = r;
  r.press('jump');
  let apex = 0;
  for (let i = 0; i < 90; i++) { r.step(); apex = Math.max(apex, p.pos.y); }
  r.release('jump');
  near(apex, 1.604, 0.09, 'apex (fixed-step Euler loses ~v·dt/2)');
  assert.equal(p.onGround, true);
  r.press('jump'); r.seconds(0.15); r.release('jump'); let low = 0;     // released after 0.15 s of rise: cut
  for (let i = 0; i < 90; i++) { r.step(); low = Math.max(low, p.pos.y); }
  assert.ok(low < apex - 0.2, `cut jump apex ${low.toFixed(2)} (full ${apex.toFixed(2)})`);
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

// ================================================================== M2: upgrades, Standing Ground tuning, cosmetics
import { threatens, PASSIVE_ENEMY_STATES } from '../../src/player/tuning.js';
import { equippedSword, equippedCape } from '../../src/player/SwordcatModel.js';
import { ECONOMY } from '../../src/core/config.js';

test('M2 upgrades: Valor Gain +25 % on every gain; Bigger Satchel 2 → 3 → 4 (the new slot comes filled); a save swap re-reads', async () => {
  const r = await rig(), { p, ctx } = r;
  p.addValor(20, 'test'); assert.equal(p.valor, 20);
  ctx.state.upgrades.valorGain = true; r.step();
  assert.equal(p.valorState.gainMul, ECONOMY.shops.valorGain.mul);
  p.setValor(0); p.addValor(20, 'test'); near(p.valor, 25, 1e-9, 'valorGain ×1.25');
  p.addValor(-10, 'test'); near(p.valor, 15, 1e-9, 'drains are not scaled');
  assert.equal(p.milkMax, PLAYER.milk.start);
  p.milk = 1;
  ctx.state.upgrades.satchel = 1; r.step();
  assert.equal(p.milkMax, ECONOMY.shops.satchel.max[0]); assert.equal(p.milk, 2, 'bought slot filled');
  ctx.state.upgrades.satchel = 2; r.step();
  assert.equal(p.milkMax, ECONOMY.shops.satchel.max[1]); assert.equal(ctx.state.milkMax, p.milkMax, 'state synced');
  ctx.state.upgrades = { satchel: 0, sharp: 0, quickCharge: false, valorGain: false, waveReach: false };
  ctx.bus.emit(E.SAVE_LOADED, {});
  assert.equal(p.milkMax, PLAYER.milk.start); assert.ok(p.milk <= p.milkMax); assert.equal(p.valorState.gainMul, 1);
});

test('M2 upgrades: Quick Charge tiers 0.45 / 0.85 s; Golden Hour tier 2 at 0.5 s either way', async () => {
  const r = await rig(), { p, ctx } = r;
  near(p.tier1Time(), PLAYER.charge.tier1); near(p.tier2Time(), PLAYER.charge.tier2);
  ctx.state.upgrades.quickCharge = true;
  near(p.tier1Time(), ECONOMY.shops.quickCharge.tier1); near(p.tier2Time(), ECONOMY.shops.quickCharge.tier2);
  p.golden = true; near(p.tier2Time(), PLAYER.golden.holyChargeTime); p.golden = false;
  // holding ⚔ with Shard 1 + Valor 50 reaches tier 2 after 0.85 s
  ctx.state.shards = 1; p.setValor(60);
  r.press('attack'); r.seconds(0.9);
  assert.equal(p.state, 'charge'); assert.equal(p.chargeTier, 2);
  r.release('attack'); r.step();
  assert.equal(p.swing?.def.id, 'holy');
});

test('M2 Standing Ground: threatens() — alerted, active, within 6 m and targeting her (not a companion / taunt / hidden)', () => {
  const pl = { pos: new THREE.Vector3(0, 0, 0) };
  const mk = (o = {}) => ({ alive: true, alerted: true, stateName: 'chase', pos: new THREE.Vector3(0, 0, 3), ...o });
  assert.equal(threatens(mk(), pl, 6), true);
  assert.equal(threatens(mk({ pos: new THREE.Vector3(0, 0, 6.1) }), pl, 6), false, 'out of range');
  assert.equal(threatens(mk({ alerted: false }), pl, 6), false);
  assert.equal(threatens(mk({ alive: false }), pl, 6), false);
  assert.equal(threatens(mk({ hidden: true }), pl, 6), false);
  for (const s of ['idle', 'patrol', 'flee', 'stagger', 'dizzy', 'sleep']) {
    assert.ok(PASSIVE_ENEMY_STATES.includes(s)); assert.equal(threatens(mk({ stateName: s }), pl, 6), false, s);
  }
  assert.equal(threatens(mk({ targetActor: () => pl }), pl, 6), true);
  assert.equal(threatens(mk({ targetActor: () => ({ id: 'mochi' }) }), pl, 6), false, 'token went to a companion');
  assert.equal(threatens(mk({ targetActor: () => null }), pl, 6), false);
});

test('M2 Standing Ground: block pushback keeps her planted; a brief token flicker does not stall the payout', async () => {
  const r = await rig(), { p, ctx } = r;
  const e = r.enemy(2.5, 0);
  let target = p;
  e.targetActor = () => target;
  const list = [e];
  Object.defineProperty(ctx.enemies, 'list', { get: () => list, configurable: true });
  r.press('guard');
  r.seconds(1.0 + 0.5);
  assert.ok(p.standingGround, 'paying after 1 s planted');
  const v0 = p.valor;
  // a block mid-Stand: pushback velocity must not reset the 1 s planted timer
  p.pushT = TUNING.blockPushT; p.vel.set(0, 0, -2.4);
  r.step(6);
  assert.ok(p.valor > v0, `still paying through the pushback (${v0} → ${p.valor})`);
  // the token goes to a companion for 0.2 s: grace covers it
  target = { id: 'mochi' }; const v1 = p.valor; r.seconds(0.2); target = p;
  assert.ok(p.valor > v1, 'grace keeps the payout going');
  // a long time targeting someone else stops it
  target = { id: 'mochi' }; r.seconds(1.0);
  assert.equal(p.standingGround, false);
  r.release('guard');
});

test('M2 Meme Cam never starts during Golden Hour', async () => {
  const r = await rig(), { p, ctx } = r;
  ctx.state.shards = 2; p.setValor(100);
  r.tap('golden');
  assert.equal(p.golden, true);
  assert.equal(p.memeCamTrigger.suppressed(), true);
});

test('M2 cosmetics: equipped sword / cape fall back to the Borrowed Blade / the royal red cape (Token Tails); a story override wins', () => {
  assert.equal(equippedSword({ sword: 'toobig' }), 'toobig');
  assert.equal(equippedSword({ sword: 'baguette' }), 'baguette');
  assert.equal(equippedSword({ sword: 'lightsaber' }), 'borrowed');
  assert.equal(equippedSword(null), 'borrowed');
  for (const c of ['cream', 'red', 'memeWhite', 'blue', 'green', 'midnight', 'gold']) assert.equal(equippedCape({ cape: c }), c);
  assert.equal(equippedCape({ cape: 'toString' }), 'red');
  assert.equal(equippedCape({ cape: 'nope' }), 'red');
  assert.equal(equippedCape({ cape: 'cream' }, 'red'), 'red');
  assert.equal(equippedCape({ cape: 'red' }, 'cream'), 'cream');
  assert.equal(equippedCape(undefined), 'red');
});

// ================================================================== M2 integration: status slow (§10.3 web), jeer radius
test('Player: applySlow (web) halves her speed for 2 s, a tumble or cleanse() clears it; jeerR overrides the aura radius', async () => {
  const r = await rig(), { p } = r;
  const base = p.speedMul;
  p.applySlow(0.5, 2, 'web');
  assert.ok(p.isSlowed());
  near(p.speedMul, base * 0.5, 1e-9, 'speed ×0.5');
  p.applySlow(0.8, 0.5, 'web');                           // a weaker, shorter slow never shortens / weakens it
  near(p.speedMul, base * 0.5, 1e-9); near(p.slowT, 2, 1e-9);
  r.seconds(1.0);
  assert.ok(p.isSlowed() && p.slowT < 1.05 && p.slowT > 0.95, `ticks down (${p.slowT})`);
  r.seconds(1.1);
  assert.equal(p.isSlowed(), false, 'wears off after 2 s');
  near(p.speedMul, base, 1e-9);
  p.applySlow(0.5, 2, 'web');
  r.input.move.y = 1; r.tap('dodge'); r.input.move.y = 0;
  assert.equal(p.state, 'dodge');
  assert.equal(p.isSlowed(), false, 'a tumble clears it');
  p.applySlow(0.5, 2, 'web');                             // no slow lands mid-tumble
  assert.equal(p.isSlowed(), false);
  r.seconds(0.6);
  p.applySlow(0.5, 2, 'web'); p.cleanse();
  assert.equal(p.isSlowed(), false, "Clover's mend cleanses it");
  // jeer aura: the duet's r 10 (enemy.jeerR) beats the def's 8
  const e = r.enemy(9, 0);
  e.pos.set(p.pos.x, 0, p.pos.z + 9);
  e.def = { jeer: { r: 8 } };
  r.ctx.bus.emit(E.ENEMY_JEER, { enemy: e, on: true });
  p._scanThreats(DT);
  assert.equal(p.inJeer, false, '9 m is outside r 8');
  e.jeerR = 10;
  p._scanThreats(DT);
  assert.equal(p.inJeer, true, '…but inside the duet r 10');
  assert.equal(typeof p.recomputeMax, 'function', 'public recomputeMax');
});

// ================================================================== CONTROLS_SPEC (iso controls): orders, Stand, aim
/** Hold a WASD key on the rig's real Input (direct movement, §5.1). */
const holdKey = (r, code, on = true) => { if (on) r.input.keys.add(code); else r.input.keys.delete(code); r.input._updateKeyMove(); };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

test('Orders: a move order walks the direct line (no nav yet), runs, arrives within 0.25 m and emits player:order', async () => {
  const r = await rig(), { p } = r;
  assert.equal(p.order('move', new THREE.Vector3(0, 0, 6)), true);
  const ev = r.last(E.PLAYER_ORDER);
  assert.equal(ev.kind, 'move'); assert.equal(ev.valid, true); assert.equal(ev.queued, false);
  r.seconds(0.6);
  assert.ok(Math.hypot(p.vel.x, p.vel.z) > PLAYER.run * 0.8, `she runs (${Math.hypot(p.vel.x, p.vel.z).toFixed(2)})`);
  r.seconds(2);
  assert.equal(p.orders.kind, null); assert.equal(p.orders.lastClear, 'arrived');
  assert.ok(Math.hypot(p.pos.x, p.pos.z - 6) <= NAV.arrive + 0.05, `arrived (${p.pos.z.toFixed(2)})`);
});

test('Orders: direct input (WASD past 0.15) cancels any order at once; stop clears path, queue and target', async () => {
  const r = await rig(), { p } = r;
  p.order('move', new THREE.Vector3(0, 0, 12));
  p.order('move', new THREE.Vector3(5, 0, 12), { queued: true });
  assert.equal(p.orders.queue.length, 1, 'Ctrl+RMB queues');
  r.seconds(0.3);
  holdKey(r, 'KeyD'); r.step();
  assert.equal(p.orders.kind, null); assert.equal(p.orders.lastClear, 'direct'); assert.equal(p.orders.queue.length, 0);
  holdKey(r, 'KeyD', false); r.seconds(0.3);
  p.order('move', new THREE.Vector3(0, 0, 12));
  p.order('stop');
  assert.equal(p.orders.kind, null); assert.equal(p.orders.path.length, 0);
  assert.equal(r.last(E.PLAYER_ORDER).kind, 'stop');
});

test('Orders: the queue holds at most NAV.queueMax waypoints and walks them in turn', async () => {
  const r = await rig(), { p } = r;
  p.order('move', new THREE.Vector3(0, 0, 2));
  for (let i = 0; i < 6; i++) p.order('move', new THREE.Vector3(i + 1, 0, 2), { queued: true });
  assert.equal(p.orders.queue.length, NAV.queueMax);
  r.seconds(5);
  assert.equal(p.orders.kind, null);
  assert.ok(Math.hypot(p.pos.x - NAV.queueMax, p.pos.z - 2) < 0.4, `the last queued point (${p.pos.x.toFixed(2)}, ${p.pos.z.toFixed(2)})`);
});

test('Orders §5.2 interplay: Tumble keeps a move order and drops an attack order; the Stand clears a move order', async () => {
  const r = await rig(), { p } = r;
  p.order('move', new THREE.Vector3(0, 0, 15));
  r.seconds(0.2); r.tap('dodge');
  assert.equal(p.state, 'dodge'); assert.equal(p.orders.kind, 'move', 'Tumble keeps the move order');
  r.seconds(0.6);
  assert.equal(p.orders.kind, 'move', '…and it resumes after the roll');
  r.press('guard'); r.step(2);
  assert.equal(p.state, 'guard'); assert.equal(p.orders.kind, null, 'the Stand plants her'); assert.equal(p.orders.lastClear, 'guard');
  r.release('guard'); r.seconds(0.6);
  const e = r.enemy(6, 0);
  e.pos.set(p.pos.x, 0, p.pos.z + 6);
  assert.equal(p.order('attack', e), true);
  r.seconds(0.1); r.tap('dodge');
  assert.equal(p.orders.kind, null, 'Tumble drops the attack order'); assert.equal(p.orders.lastClear, 'dodge');
});

test('Orders §8.4: a move order in a wind-up cancels the swing (no hit); in the active frames it waits for recovery', async () => {
  const r = await rig(), { p } = r;
  const S = ATTACKS.slash1;
  const e = r.enemy(1.0, 0);
  r.tap('attack');
  assert.equal(p.state, 'attack');
  p.order('move', new THREE.Vector3(-4, 0, 0));
  r.step();
  assert.equal(p.state, 'move', 'wind-up cancelled at once'); assert.equal(p.swing, null);
  r.seconds(0.3);
  assert.equal(e.hp, e.maxHp, 'the cancelled swing dealt no damage');
  p.order('stop'); r.seconds(0.5);
  p.pos.set(0, 0, 0); p.facing = 0; p.vel.set(0, 0, 0);
  r.tap('attack');
  while (p.swing && p.swing.t < S.active[0] + 0.01) r.step();
  assert.equal(p.state, 'attack');
  p.order('move', new THREE.Vector3(-4, 0, 0));
  r.step();
  assert.equal(p.state, 'attack', 'active frames: the order waits');
  r.seconds(S.active[1] - S.active[0] + 0.1);
  assert.equal(p.state, 'move', 'recovery: the order applies'); assert.equal(p.orders.kind, 'move');
  assert.ok(e.hp < e.maxHp, 'the active swing landed');
});

test('Orders: WASD never cancels a wind-up or the active frames, but cuts recovery from active[1] + 0.05', async () => {
  const r = await rig(), { p } = r;
  const S = ATTACKS.slash1;
  r.tap('attack');
  holdKey(r, 'KeyW'); r.step(2);
  assert.equal(p.state, 'attack', 'wind-up kept');
  while (p.swing && p.swing.t < S.active[1] + 0.05) { assert.equal(p.state, 'attack'); r.step(); }
  r.step(2);
  assert.equal(p.state, 'move', 'late recovery cut by movement');
  holdKey(r, 'KeyW', false);
});

test('Orders: an attack order paths to reach, faces the target and auto-chains (chain = one Snip–Snap–Swoosh string)', async () => {
  const r = await rig(), { p, ctx } = r;
  ctx.state.settings.autoAttack = 'chain';
  const e = r.enemy(6, 0.4);
  e.maxHp = e.hp = 9999;
  p.order('attack', e);
  r.seconds(4);
  const combos = r.events.filter((x) => x[0] === E.PLAYER_SWING).map((x) => x[1].combo);
  assert.deepEqual(combos, [1, 2, 3], `chain: one full string, then stand ready (${combos})`);
  assert.equal(p.orders.kind, null, 'chain: the order ends after the string (no silent engaged order)');
  assert.equal(p.orders.lastClear, 'chainDone');
  const reach = ATTACKS.slash1.arc.range + e.radius - 0.25;
  assert.ok(Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) <= reach + 0.7, 'in reach');
  // loop keeps chaining strings while the target lives
  ctx.state.settings.autoAttack = 'loop';
  r.events.length = 0;
  p.order('attack', e);
  r.seconds(4);
  assert.ok(r.count(E.PLAYER_SWING) >= 5, `loop: keeps swinging (${r.count(E.PLAYER_SWING)})`);
  // off: approach and face only
  ctx.state.settings.autoAttack = 'off';
  p.order('stop'); r.seconds(1.5); r.events.length = 0;
  p.order('attack', e); r.seconds(1.5);
  assert.equal(r.count(E.PLAYER_SWING), 0, 'off: no swings');
});

test('Orders: autoAttack auto = loop on every device (LoL right-click keeps auto-attacking)', async () => {
  const r = await rig(), { p, ctx } = r;
  ctx.state.settings.autoAttack = 'auto';
  assert.equal(ctx.input.device, 'kbm');
  const e = r.enemy(4, 0);
  e.maxHp = e.hp = 9999;
  p.order('attack', e);
  r.seconds(5);
  assert.ok(r.count(E.PLAYER_SWING) >= 5, `KBM auto keeps swinging (${r.count(E.PLAYER_SWING)})`);
  assert.equal(p.orders.kind, 'attack');
});

test('Orders: a hurt stun pauses a move order (it resumes from the knockback spot); a guard break clears it', async () => {
  const r = await rig(), { p } = r;
  p.order('move', new THREE.Vector3(0, 0, 8));
  r.seconds(0.4);
  p.setState('hurt'); p.pos.x += 1.0;                                  // knocked sideways
  r.seconds(PLAYER.hurt.stun * 0.5);
  assert.equal(p.orders.kind, 'move', 'the order waits the stun out');
  r.seconds(PLAYER.hurt.stun + 3);
  assert.equal(p.orders.lastClear, 'arrived', `…then resumes and arrives (${p.orders.lastClear})`);
  assert.ok(Math.hypot(p.pos.x, p.pos.z - 8) <= NAV.arrive + 0.05, `at the goal (${p.pos.x.toFixed(2)}, ${p.pos.z.toFixed(2)})`);
  p.order('move', new THREE.Vector3(0, 0, 0));
  r.step();
  p.setState('stagger'); r.step();
  assert.equal(p.orders.kind, null); assert.equal(p.orders.lastClear, 'guardBreak');
});

test('Orders: a use order whose path runs out short of reach re-plans once, then ends with the grey marker', async () => {
  const r = await rig(), { p, ctx } = r;
  ctx.physics.nav = {};
  // the target stands on an island: every path ends 3 m short of it
  ctx.physics.findPath = (a, b) => ({ points: [{ x: b.x, y: 0, z: b.z - 3 }], partial: true });
  let used = 0;
  const it = { id: 'sign', pos: new THREE.Vector3(0, 0, 6), r: 1.5, use: () => { used++; } };
  assert.equal(p.order('use', it), true);
  r.seconds(4);
  assert.equal(p.orders.kind, null, `the use order ended (${p.orders.lastClear})`);
  assert.equal(p.orders.lastClear, 'unreachable');
  assert.equal(r.last(E.PLAYER_ORDER).valid, false, 'the grey marker');
  assert.equal(used, 0);
});

test('Orders: an armed attack-move (X) is disarmed by Esc, by direct input and after 4 s with no click', async () => {
  const r = await rig(), { p } = r;
  r.tap('attackMove');
  assert.equal(p.orders.attackMoveArmed, true);
  r.tap('pause');
  assert.equal(p.orders.attackMoveArmed, false, 'Esc');
  r.tap('attackMove');
  holdKey(r, 'KeyW'); r.step(); holdKey(r, 'KeyW', false);
  assert.equal(p.orders.attackMoveArmed, false, 'direct input');
  r.tap('attackMove');
  p.orders._armT -= 5; r.step();
  assert.equal(p.orders.attackMoveArmed, false, 'timed out');
});

test('Aim §7.1: a swing released with an explicit aim (touch drag) keeps it: no 360° turn to a foe behind her', async () => {
  const r = await rig(), { p, ctx } = r;
  ctx.input.device = 'touch';
  r.enemy(2.0, -Math.PI / 2);                                          // a foe 180° away from the drag
  p.facing = Math.PI / 2;
  p.aim.source = 'explicit'; p.aim.target = null;
  p.swing = { def: ATTACKS.slash1, aimSource: 'explicit' };
  ctx.input.virtualAim = { active: false, x: 0, y: 0 };               // the pad already let go
  p.aimAssist();
  assert.ok(Math.abs(wrapA(p.facing - Math.PI / 2)) < 1e-6, `explicit aim kept (${p.facing.toFixed(2)})`);
  // the same swing with no explicit aim and the stick idle: the 360° touch magnet turns her
  p.swing = { def: ATTACKS.slash1, aimSource: 'auto' }; p.aim.source = 'auto';
  p.aimAssist();
  assert.ok(Math.abs(wrapA(p.facing + Math.PI / 2)) < 0.05, `auto aim turns to the foe (${p.facing.toFixed(2)})`);
  p.swing = null;
});

test('Orders: an unreachable goal answers partial + the rejected haptic; no progress for 3 re-plans → stop', async () => {
  const r = await rig(), { p, ctx } = r;
  // one owner for the rejected buzz: core Input's player:order {valid:false} listener (§10.6) — observed at navigator.vibrate
  await ctx.input.init(); ctx.input.setDevice('touch');
  const haptics = [], nav = globalThis.navigator;
  Object.defineProperty(nav, 'vibrate', { configurable: true, writable: true, value: (pat) => { haptics.push(pat); return true; } });
  try {
    ctx.physics.nav = {};
    ctx.physics.findPath = () => ({ points: [], partial: true });
    assert.equal(p.order('move', new THREE.Vector3(0, 0, 50)), false);
    assert.equal(r.last(E.PLAYER_ORDER).valid, false);
    assert.equal(haptics.length, 1, 'the rejected haptic, exactly once (Orders does not double-buzz a valid:false order)');
    assert.deepEqual(haptics[0], HAPTICS.orderRejected);
    // a wall right in front: the path says go, physics says no
    ctx.physics.findPath = (a, b) => ({ points: [{ x: b.x, y: 0, z: b.z }], partial: false });
    const move = ctx.physics.moveActor;
    ctx.physics.moveActor = (a, dt) => { move(a, dt); if (a === p && p.pos.z > 0.5) { p.pos.z = 0.5; p.vel.z = 0; } };
    haptics.length = 0;
    p.order('move', new THREE.Vector3(0, 0, 10));
    r.seconds(NAV.stuck.time * (NAV.stuck.retries + 3) + 0.5);
    assert.equal(p.orders.kind, null); assert.equal(p.orders.lastClear, 'stuck');
    assert.equal(r.last(E.PLAYER_ORDER).valid, false, 'the grey marker');
    assert.deepEqual(haptics, [HAPTICS.orderRejected], 'the rejected haptic');
  } finally { delete nav.vibrate; ctx.input.dispose(); }
});

test('Orders: a failed re-plan mid-walk (stuck retry, next queued point) ends "unreachable" with the grey marker, never "arrived"', async () => {
  const r = await rig(), { p, ctx } = r;
  ctx.physics.nav = {};
  // the queued point: the route to it is gone by the time she gets there
  ctx.physics.findPath = (a, b) => ({ points: [{ x: b.x, y: 0, z: b.z }], partial: false });
  p.order('move', new THREE.Vector3(0, 0, 2));
  p.order('move', new THREE.Vector3(0, 0, 20), { queued: true });
  ctx.physics.findPath = (a, b) => (b.z > 10 ? { points: [], partial: true } : { points: [{ x: b.x, y: 0, z: b.z }], partial: false });
  r.seconds(3);
  assert.equal(p.orders.kind, null); assert.equal(p.orders.lastClear, 'unreachable', `queued (${p.orders.lastClear})`);
  assert.equal(r.last(E.PLAYER_ORDER).valid, false, 'the grey marker (queued)');
  // the stuck re-plan: a cart rolls across the route and the re-plan finds nothing
  p.pos.set(0, 0, 0); p.vel.set(0, 0, 0);
  ctx.physics.findPath = (a, b) => ({ points: [{ x: b.x, y: 0, z: b.z }], partial: false });
  const move = ctx.physics.moveActor;
  ctx.physics.moveActor = (a, dt) => { move(a, dt); if (a === p && p.pos.z > 0.5) { p.pos.z = 0.5; p.vel.z = 0; } };
  p.order('move', new THREE.Vector3(0, 0, 10));
  ctx.physics.findPath = () => ({ points: [], partial: true });
  r.seconds(NAV.stuck.time * 2 + 0.5);
  assert.equal(p.orders.kind, null); assert.equal(p.orders.lastClear, 'unreachable', `stuck (${p.orders.lastClear})`);
  assert.equal(r.last(E.PLAYER_ORDER).valid, false, 'the grey marker (stuck)');
  ctx.physics.moveActor = move;
});

test('Stand §8.1: threat snap on press faces the soonest parryable wind-up within 5 m / 0.7 s; touch arc ±90°', async () => {
  const r = await rig(), { p, ctx } = r;
  const e = r.enemy(2.5, deg(150));                     // behind her left
  p.facing = 0;
  ctx.combat.nextParryable = () => ({ attacker: e, activeAt: ctx.game.time + 0.4, kind: 'parry' });
  r.press('guard'); r.step();
  const want = Math.atan2(e.pos.x, e.pos.z);
  assert.ok(Math.abs(wrapA(p.facing - want)) < 0.05, `snapped to the threat (${p.facing.toFixed(2)} vs ${want.toFixed(2)})`);
  r.release('guard'); r.seconds(0.5);
  // a wind-up landing in 1.2 s does not snap
  p.facing = 0;
  ctx.combat.nextParryable = () => ({ attacker: e, activeAt: ctx.game.time + 1.2, kind: 'parry' });
  r.press('guard'); r.step();
  assert.ok(Math.abs(p.facing) < 0.05, 'beyond 0.7 s: no snap');
  r.release('guard');
  // the guard arc: 80° off her nose blocks on touch (±90°), hits on KBM (±70°)
  const g = guardState({ guardT: 0.5 });
  assert.equal(resolveGuard({ ...g, arc: PLAYER.guard.touchArc }, POKE, hitFrom(deg(80)), 0), 'block');
  assert.equal(resolveGuard({ ...g }, POKE, hitFrom(deg(80)), 0), 'hit');
  assert.equal(resolveGuard({ ...g, arc: PLAYER.guard.touchArc }, POKE, hitFrom(deg(95)), 0), 'hit');
});

test('Auto-Riposte §8.1: on touch (auto) the Riposte fires 0.15 s after a parry; off on KBM unless set on', async () => {
  for (const [device, setting, want] of [['touch', 'auto', true], ['kbm', 'auto', false], ['kbm', 'on', true], ['touch', 'off', false]]) {
    const r = await rig(), { p, ctx } = r;
    ctx.input.setDevice(device);
    ctx.state.settings.autoRiposte = setting;
    const e = r.enemy(1.2, 0);
    r.press('guard'); r.step(2);
    assert.equal(ctx.combat.applyHit(e, p, ATTACKS.rat_poke), 'parry');
    r.seconds(AIM.autoRiposte - 0.05);
    assert.notEqual(p.swing?.def.id, 'riposte', `${device}/${setting}: not before 0.15 s`);
    r.seconds(0.15);
    const fired = r.events.some((x) => x[0] === E.PLAYER_SWING && x[1].attackId === 'riposte');
    assert.equal(fired, want, `${device}/${setting}: auto riposte ${want}`);
    r.release('guard');
  }
});

test('Aim: player.aim stays live (active in the Stand; the auto-target on touch) and a recent attacker wins a tie', async () => {
  const r = await rig(), { p, ctx } = r;
  r.step();
  assert.equal(p.aim.active, false);
  r.press('guard'); r.step(2);
  assert.equal(p.aim.active, true, 'active in the Stand'); assert.equal(p.aim.kind, 'guard');
  r.release('guard'); r.seconds(0.3);
  ctx.input.setDevice('touch');
  const a = r.enemy(2.0, deg(-30)), b = r.enemy(2.0, deg(30));
  r.step();
  const first = p.aim.target;
  assert.ok(first === a || first === b, `auto-target on touch (${p.aim.source})`);
  const other = first === a ? b : a;
  p._noteAttacker(other);
  p._autoPrev = null; r.step();
  assert.equal(p.aim.target, other, 'the one that just attacked her wins a tie');
});

test('Jump assist §5.4: a run-up jump toward a 0.8 m stump is nudged (≤ ±1.5 m/s since TT5, ≤ 20°) to land 0.3 m inside its edge', () => {
  const A = AIM.jumpAssist, o = { ...A, v0: PLAYER.jumpV, g: GRAVITY, fallMul: PLAYER.fallGravityMul };
  // a stump: top 0.8 m, front edge at z 1.6, 1.2 m deep, centred 0.4 m to her side (≈ 10° off her run)
  const stump = (x, z) => (z >= 1.6 && z <= 2.8 && Math.abs(x - 0.4) <= 0.6 ? { top: 0.8, walkable: true } : { top: 0, walkable: true });
  const her = { x: 0, y: 0, z: 0 };
  const plan = jumpAssistPlan(her, { x: 0, z: 3.0 }, stump, o);
  assert.ok(plan, 'assisted');
  const sp = Math.hypot(plan.vx, plan.vz);
  assert.ok(Math.abs(sp - 3.0) <= A.dv + 1e-9, `within ±${A.dv} m/s (${sp.toFixed(2)})`);
  assert.ok(Math.abs(plan.yaw) <= A.ang + 1e-9, `≤ 20° (${(plan.yaw * 57.3).toFixed(1)}°)`);
  const lz = Math.cos(plan.yaw) * plan.dist, lx = Math.sin(plan.yaw) * plan.dist;
  assert.ok(lz >= 1.6 + A.inset - 0.16 && lz <= 2.8 - A.inset + 0.16 && Math.abs(lx - 0.4) <= 0.6, `lands inside the top (${lx.toFixed(2)}, ${lz.toFixed(2)})`);
  near(hopSpeed(plan.dist, plan.rise, o.v0, o.g, Infinity, o.fallMul), sp, 1e-6, 'the hop maths agree');
  // a full run (5.5 m/s) would overshoot the 1.2 m deep stump: the nudge slows her (≤ A.dv) instead
  const run = jumpAssistPlan(her, { x: 0, z: 5.5 }, stump, o);
  assert.ok(run && Math.hypot(run.vx, run.vz) < 5.5 && Math.cos(run.yaw) * run.dist <= 2.8 - A.inset + 0.16, 'slowed onto the stump');
  // standing still: straight up; a 2 m wall is no hop target; a walk-speed hop that needs more than A.dv: a plain jump
  assert.equal(jumpAssistPlan(her, { x: 0, z: 0.1 }, stump, o), null);
  assert.equal(jumpAssistPlan(her, { x: 0, z: 3 }, (x, z) => ({ top: z > 1 ? 2 : 0, walkable: true }), o), null);
  const far = (x, z) => (z >= 2.3 ? { top: 1.0, walkable: true } : { top: 0, walkable: true });
  assert.equal(jumpAssistPlan(her, { x: 0, z: 0.6 }, far, o), null, 'a walk-speed hop cannot be nudged that far');
  assert.equal(jumpAssistPlan(her, { x: 0, z: 3.0 }, (x, z) => (z >= 1.6 && z <= 2.8 ? { top: 0.8, walkable: false } : { top: 0, walkable: true }), o), null, 'not walkable');
  // a non-walkable top (a fence) is not a landing
  assert.equal(jumpAssistPlan(her, { x: 0, z: 2.5 }, (x, z) => (z >= 1.6 && z <= 2.8 ? { top: 0.8, walkable: false } : { top: 0, walkable: true }), o), null);
});

test('Jump assist in the Player: F toward a stump takes the nudged velocity and holds it through the air', async () => {
  const r = await rig(), { p, ctx } = r;
  const stumpTop = (x, z) => (z >= 1.8 && z <= 3.0 && Math.abs(x - 0.4) <= 0.6 ? 0.8 : 0);
  ctx.physics.topAt = stumpTop;
  ctx.physics.navWalkable = () => true;
  const move = ctx.physics.moveActor;
  ctx.physics.moveActor = (a, dt) => {
    move(a, dt);
    const t = stumpTop(a.pos.x, a.pos.z);
    if (t > 0 && a.pos.y <= t && a.pos.y > t - 0.5 && a.vel.y <= 0) { a.pos.y = t; a.vel.y = 0; a.onGround = true; }
  };
  p.pos.set(0, 0, -2);
  const yaw = ctx.cam?.stickYaw ?? ctx.cam?.yaw ?? Math.PI;
  holdKey(r, Math.abs(Math.cos(yaw) + 1) < 0.1 ? 'KeyW' : 'KeyS');
  r.seconds(0.45);                                      // run up toward +Z
  assert.ok(p.vel.z > 3 && p.pos.z > -0.6 && p.pos.z < 0.6, `run-up (z ${p.pos.z.toFixed(2)}, vz ${p.vel.z.toFixed(2)})`);
  r.tap('jump');
  assert.ok(p.airAssist.on, 'assisted take-off');
  r.step(3);
  for (let i = 0; i < 60 && !p.onGround; i++) r.step();
  holdKey(r, 'KeyW', false); holdKey(r, 'KeyS', false);
  assert.ok(p.pos.y >= 0.79, `landed on the stump (y ${p.pos.y.toFixed(2)}, z ${p.pos.z.toFixed(2)})`);
  assert.equal(p.airAssist.on, false, 'cleared on landing');
});

test('Meme Cam idle (iso): a thumb resting in the joystick dead zone does not reset the idle clock; a press does', async () => {
  const r = await rig(), { p, ctx } = r;
  const mc = p.memeCamTrigger;
  ctx.input.setDevice('touch');
  ctx.params.test = false;
  const cam = ctx.cam ?? (ctx.cam = {}), blockedWas = Object.getOwnPropertyDescriptor(cam, 'photoCamBlocked');
  let blocked = true;
  cam.photoCamBlocked = () => blocked;                  // TT2 §10.2.12: the prologue / an onboarding target blocks it
  r.seconds(0.5);
  assert.equal(mc.idleT, 0, 'no idle clock while the camera blocks the Photo Cam (MemeCamTrigger.suppressed)');
  blocked = false;                                      // free play: the rest of the test is about the dead zone
  r.seconds(0.5);
  const t0 = mc.idleT;
  ctx.input.setVirtualMove(0, 0);                       // a resting thumb: ui reports a 0 vector
  r.seconds(1);
  assert.ok(mc.idleT > t0 + 0.9, `idle keeps counting (${mc.idleT.toFixed(2)})`);
  r.press('meow'); r.step(); r.release('meow');
  assert.equal(mc.idleT, 0, 'a press resets it');
  if (blockedWas) Object.defineProperty(cam, 'photoCamBlocked', blockedWas); else delete cam.photoCamBlocked;
  ctx.params.test = true;
});

test('Pounce aim §6.2/§6.4: touch magnetises a crow in the 3 m disc (flyers first); KBM dives toward the cursor ≤ 3.5 m', async () => {
  const r = await rig(), { p, ctx } = r;
  ctx.input.setDevice('touch');
  const rat = r.enemy(1.5, deg(-40)), crow = r.enemy(2.4, deg(60));
  crow.tags.add('flyer');
  const plan = p.pouncePlan({});
  assert.equal(plan.valid, true); assert.equal(plan.target, crow, 'the crow beats the nearer rat');
  // KBM: the cursor point, clamped to 3.5 m; a crow within 2.5 m of it is magnetised
  ctx.actors.unregister?.(rat); rat.alive = false; crow.alive = false;
  ctx.input.setDevice('kbm');
  ctx.input.pointerIdle = () => 0;
  ctx.cam.cursorValid = true; ctx.cam.cursorGround = new THREE.Vector3(-8, 0, 0);
  const k = p.pouncePlan({});
  assert.ok(k.valid && !k.target); near(k.x, -AIM.pounceMax, 1e-6, 'clamped to 3.5 m'); near(k.z, 0, 1e-6);
  const crow2 = r.enemy(3.0, deg(-80)); crow2.tags.add('flyer');
  const k2 = p.pouncePlan({});
  assert.equal(k2.target, crow2, 'a crow near the cursor point');
});

// ================================================================== Phase W (WA) + ART §6.5 + AUTOCAM §5.3 (player)
import { IdleLadder, Squash, SQUASH, HIT_WORDS, ORDER_FX, koRespawnT, wordFor } from '../../src/player/juice.js';
import { IDLE, KO, FADE_COLOR, CAMERA } from '../../src/core/config.js';

/** Step a pure IdleLadder `sec` seconds at 60 Hz; returns [[t, step], …]. */
function runLadder(L, sec, s, t0 = 0) {
  const out = [];
  let t = t0;
  for (let i = 0; i < Math.round(sec / DT); i++) { t += DT; const st = L.update(DT, s); if (st) out.push([t, st]); }
  return out;
}

test('player.W1 idle ladder (pure): glance 4 s, look 7 s, groom 10 s, twirl 12.5 s, all before the 15 s Meme Cam', () => {
  assert.ok(IDLE.twirl < PLAYER.memeCam.idle, 'every step before the Meme Cam');
  const L = new IdleLadder({ rand: () => 0.99 });
  const fired = runLadder(L, 14, { still: true, calm: true });
  assert.deepEqual(fired.map((f) => f[1]), ['glance', 'look', 'groom', 'twirl']);
  const at = [IDLE.glance, IDLE.look, IDLE.groom, IDLE.twirl];
  fired.forEach(([t], i) => near(t, at[i], DT + 1e-9, `step ${i} on time`));
  // moving or a fight resets the clock; nothing fires in combat
  assert.deepEqual(runLadder(new IdleLadder(), 20, { still: true, calm: false }), [], 'none in combat');
  const M = new IdleLadder(); runLadder(M, 6, { still: true, calm: true }); M.update(DT, { still: false, calm: true });
  assert.equal(M.t, 0); assert.equal(runLadder(M, 3.9, { still: true, calm: true }).length, 0, 'a move restarts the ladder');
});

test('player.W1 idle ladder (pure): after the Meme Cam it loops from 7 s (10 % sneezes); the hub sits at 20 s', () => {
  const L = new IdleLadder({ rand: () => 0.99 });
  runLadder(L, 15, { still: true, calm: true });
  runLadder(L, 3, { still: false, calm: true, meme: true });            // the Meme Cam runs (paused, not reset)
  const loop = runLadder(L, 6, { still: true, calm: true });
  assert.deepEqual(loop.map((f) => f[1]), ['look', 'groom', 'twirl'], 'loops from loopFrom (glance is before it)');
  near(loop[0][0], DT, 1e-9, 'look fires as the loop starts at 7 s');
  const S = new IdleLadder({ rand: () => 0.01 });
  runLadder(S, 15, { still: true, calm: true }); S.update(DT, { meme: true, still: false, calm: true });
  assert.deepEqual(runLadder(S, 6, { still: true, calm: true }).map((f) => f[1]), ['sneeze', 'sneeze', 'sneeze'], 'sneezeP applies to looped steps');
  const H = new IdleLadder({ rand: () => 0.99 });
  const hub = runLadder(H, 22, { still: true, calm: true, hub: true });
  assert.deepEqual(hub.map((f) => f[1]), ['glance', 'look', 'groom', 'twirl', 'sit']);
  near(hub[4][0], IDLE.hubSit, DT + 1e-9, 'sit at 20 s');
});

test('player.W1 idle ladder in the Player: fake clock → emotes at 4 / 7 / 10 / 12.5 s on the model; none with a foe near', async () => {
  const r = await rig(), { p, ctx } = r;
  ctx.params.idleLadder = true;                                        // ?test never counts idle time unless opted in
  const steps = [];
  p.model.idleStep = (n) => { if (n) steps.push([ctx.game.time, n]); };
  r.seconds(13);
  assert.deepEqual(steps.map((s) => s[1]), ['glance', 'look', 'groom', 'twirl']);
  const at = [IDLE.glance, IDLE.look, IDLE.groom, IDLE.twirl];
  steps.forEach(([t], i) => near(t, at[i], 2 * DT, `step ${i}`));
  const r2 = await rig(); r2.ctx.params.idleLadder = true;
  const s2 = []; r2.p.model.idleStep = (n) => { if (n) s2.push(n); };
  const foe = r2.enemy(8, 0); foe.alerted = true; r2.ctx.enemies = { list: [foe] };
  r2.seconds(13);
  assert.deepEqual(s2, [], 'none in combat (an alerted enemy within 15 m)');
});

test('player.W2 tap on self: in combat → no emote, no order; calm → a pat (meow + bow bounce + heart); 3 taps → twirl', async () => {
  const r = await rig(), { p, ctx } = r;
  const emotes = [], steps = [];
  p.model.emote = (n) => emotes.push(n);
  p.model.idleStep = (n) => { if (n) steps.push(n); };
  ctx.cam = { pick: () => ({ kind: 'ground', point: new THREE.Vector3(p.pos.x + 0.2, 0, p.pos.z), actor: null }), lockTarget: null };
  const orders = () => r.count(E.PLAYER_ORDER);
  // in combat (combat activity + an alerted foe 5 m away)
  const foe = r.enemy(5, 0); foe.alerted = true; ctx.enemies = { list: [foe] };
  p.combatT = 2;
  p.orders._tap({ kind: 'tap', x: 100, y: 100 });
  assert.deepEqual(emotes, [], 'no emote in combat'); assert.equal(orders(), 0, 'no order'); assert.equal(p.orders.kind, null);
  // out of combat
  ctx.enemies = { list: [] }; p.combatT = 0; p.threatened = false;
  p.orders._tap({ kind: 'tap', x: 100, y: 100 });
  assert.ok(emotes.includes('meow') && emotes.includes('bowBounce'), `pat: ${emotes}`);
  assert.equal(orders(), 0, 'a pat is never an order');
  assert.equal(r.events.filter((e) => e[0] === E.BURST && e[1].kind === 'heart').length, 1, 'a heart');
  p.orders._tap({ kind: 'tap', x: 100, y: 100 }); p.orders._tap({ kind: 'tap', x: 100, y: 100 });
  assert.deepEqual(steps, ['twirl'], 'the third tap within 1.5 s twirls');
  // a tap away from her is still a move order (the ground 3 m off)
  ctx.cam.pick = () => ({ kind: 'ground', point: new THREE.Vector3(p.pos.x + 3, 0, p.pos.z), actor: null });
  p.orders._tap({ kind: 'tap', x: 300, y: 100 });
  assert.equal(p.orders.kind, 'move');
});

test('player.W2 order feedback: a second tap on the same spot within 0.35 s is a double (hop), outcomes unchanged', async () => {
  const r = await rig(), { p } = r;
  assert.equal(p.order('move', new THREE.Vector3(0, 0, 6), { source: 'touch' }), true);
  assert.equal(r.last(E.PLAYER_ORDER).double, false);
  assert.equal(p.order('move', new THREE.Vector3(0.2, 0, 6), { source: 'touch' }), true);
  assert.equal(r.last(E.PLAYER_ORDER).double, true, 'double paw + happy hop');
  assert.equal(p.orders.kind, 'move', 'the order itself is unchanged');
  assert.equal(p.order('move', new THREE.Vector3(4, 0, 6), { source: 'touch' }), true);
  assert.equal(r.last(E.PLAYER_ORDER).double, false, 'another spot');
  assert.ok(ORDER_FX.doubleT === 0.35 && ORDER_FX.snapK === 0.7 && ORDER_FX.snapLambda === 24);
});

test('player.W3 words: a 3-hit combo says Snip!, Snap!, Swoosh! in order (≤ 1 per 0.25 s); the last foe says Bonk!', async () => {
  const r = await rig(), { p, ctx } = r;
  const words = [];
  ctx.fx = { word: (pos, text) => words.push([ctx.game.time, text]) };
  const e = r.enemy(1.2, 0); e.hp = e.maxHp = 500;
  // the dummy is not stepped here: clear its anti-multi-hit i-frames between the swings
  const sec = (s) => { for (let i = 0; i < Math.round(s / DT); i++) { e.invulnT = 0; r.step(); } };
  r.tap('attack'); sec(0.2); r.tap('attack'); sec(0.4); r.tap('attack'); sec(1.2);
  assert.deepEqual(words.map((w) => w[1]), [HIT_WORDS.slash1, HIT_WORDS.slash2, HIT_WORDS.slash3]);
  assert.deepEqual(words.map((w) => w[1]), ['Snip!', 'Snap!', 'Swoosh!']);
  for (let i = 1; i < words.length; i++) assert.ok(words[i][0] - words[i - 1][0] >= HIT_WORDS.every - 1e-6, 'rate limit');
  // the rate limit itself
  words.length = 0; p._wordT = -Infinity;
  assert.equal(p.sayWord('parry'), true); assert.equal(p.sayWord('perfectDodge'), false, 'a second word inside 0.25 s');
  // hitWords off
  words.length = 0; ctx.state.settings.hitWords = false; ctx.game.time += 1;
  assert.equal(p.sayWord('parry'), false); ctx.state.settings.hitWords = true;
  // the final blow of an encounter
  words.length = 0; ctx.game.time += 1;
  r.seconds(1);
  const last = r.enemy(1.2, 0); last.alerted = true; last.hp = last.maxHp = 1; ctx.enemies = { list: [last] };
  e.pos.set(50, 0, 50);
  r.tap('attack'); r.seconds(0.4);
  assert.equal(words.at(-1)?.[1], 'Bonk!');
  assert.equal(wordFor('nope'), null);
});

test('player.W4 knock-out: onDeath() → pose sit (never lying flat), the cream wipe at 1.2 s, respawned and alive at 1.55 s', async () => {
  const r = await rig(), { p, ctx } = r;
  const fades = [];
  ctx.ui = { fade: (f) => fades.push(f) };
  const dizzy = []; ctx.fx = { dizzyFor: (a, s) => dizzy.push([a, s]) };
  p.hp = 0; p.alive = false; p.onDeath();
  assert.equal(p.state, 'dead'); assert.equal(p.model.basePose(), 'sit');
  assert.equal(dizzy[0]?.[0], p, 'dizzy stars on her');
  near(koRespawnT(), KO.sitT + KO.wipeT, 1e-9); near(koRespawnT(), 1.55, 1e-9);
  r.seconds(KO.sitT - 0.05);
  assert.equal(fades.length, 0, 'no wipe before 1.2 s'); assert.equal(p.alive, false);
  r.seconds(0.1);
  assert.equal(fades[0]?.to, FADE_COLOR, 'cream wipe, never black'); near(fades[0].dur, KO.wipeT, 1e-9);
  r.seconds(KO.wipeT);
  assert.equal(p.alive, true); assert.equal(p.state, 'move'); assert.equal(p.hp, p.maxHp);
  assert.equal(fades.at(-1)?.to, null, 'the wipe clears over her');
  assert.ok(r.events.some((e) => e[0] === E.BURST && e[1].kind === 'hearts' && e[1].count === KO.hearts), '6 hearts');
  assert.equal(r.count(E.PLAYER_LIFE_LOST), 1, 'life logic unchanged');
  // game over: she stays seated, no wipe
  const g = await rig(); const f2 = []; g.ctx.ui = { fade: (f) => f2.push(f) };
  g.p.livesState.lives = 1; g.p.hp = 0; g.p.alive = false; g.p.onDeath();
  assert.equal(g.p.livesState.gameOver, true);
  g.seconds(2);
  assert.equal(g.p.state, 'dead'); assert.equal(f2.length, 0);
});

test('AUTOCAM §5.3 moveIntent + orders.lookAhead: order → 2.5 m along the path; walk / run / stick; Tumble other; idle', async () => {
  const r = await rig(), { p, ctx } = r;
  r.step();
  assert.equal(p.moveIntent.kind, 'idle'); assert.equal(p.moveIntent.speed, 0);
  // a two-leg path: (0,0,2) then (4,0,2)
  ctx.physics.findPath = () => ({ points: [{ x: 0, y: 0, z: 2 }, { x: 4, y: 0, z: 2 }] });
  ctx.physics.nav = {};
  assert.equal(p.order('move', new THREE.Vector3(4, 0, 2)), true);
  const la = { x: 0, z: 0 };
  assert.equal(p.orders.lookAhead(CAMERA.iso.lead.orderLook, la), true);
  near(la.x, 0.5, 1e-6, 'past the corner'); near(la.z, 2, 1e-6);
  near(p.orders.remaining(), 6, 1e-6);
  r.step();
  assert.equal(p.moveIntent.kind, 'order'); near(p.moveIntent.speed, PLAYER.run, 1e-6);
  near(Math.hypot(p.moveIntent.x, p.moveIntent.z), 1, 1e-6, 'unit direction');
  r.seconds(3);
  assert.equal(p.orders.kind, null); assert.equal(p.moveIntent.kind, 'idle');
  const none = { x: 9, z: 9 }; assert.equal(p.orders.lookAhead(2.5, none), false); near(none.x, p.pos.x, 1e-9);
  // the direct-line follower (no nav): the point on the segment
  delete ctx.physics.findPath; delete ctx.physics.nav;
  p.order('move', new THREE.Vector3(p.pos.x, 0, p.pos.z + 10));
  p.orders.lookAhead(2.5, la); near(la.z - p.pos.z, 2.5, 1e-6);
  p.order('stop');
  // keyboard: run at her speed
  holdKey(r, 'KeyW'); r.seconds(0.5);
  assert.equal(p.moveIntent.kind, 'run'); near(p.moveIntent.speed, Math.hypot(p.vel.x, p.vel.z), 1e-9);
  holdKey(r, 'KeyW', false); r.seconds(0.5);
  // touch stick: before her velocity, the dead zone ramps the speed
  r.input.device = 'touch'; r.input.move.x = 0; r.input.move.y = 0.6; p.vel.set(0, 0, 0);
  p._updateIntent();
  assert.equal(p.moveIntent.kind, 'stick'); assert.ok(p.moveIntent.speed > 0 && p.moveIntent.speed < PLAYER.run);
  r.input.move.y = 0; r.input.device = 'kbm';
  // Tumble → other
  r.seconds(0.3); r.tap('dodge'); assert.equal(p.state, 'dodge'); assert.equal(p.moveIntent.kind, 'other');
});

test('AUTOCAM §4 groundY = last ground contact; D1 render pose is the interpolated sim pose', async () => {
  const r = await rig(), { p } = r;
  r.step();
  assert.equal(p.groundY, 0);
  r.tap('jump'); r.seconds(0.2);
  assert.ok(!p.onGround && p.pos.y > 0.3, `airborne ${p.pos.y}`); assert.equal(p.groundY, 0, 'airborne keeps the last contact');
  r.seconds(1.5); assert.ok(p.onGround);
  // interpolation: render(alpha) puts object3d between the last two sim steps
  holdKey(r, 'KeyW'); r.seconds(0.4);
  p.beginStep(); r.input.update(DT); p.update(DT); r.input.endStep();
  const a = p.prevPos.clone(), b = p.pos.clone();
  assert.ok(a.distanceTo(b) > 0.01, 'she moved this step');
  p.render(0.5, DT);
  near(p.object3d.position.x, (a.x + b.x) / 2, 1e-9); near(p.object3d.position.z, (a.z + b.z) / 2, 1e-9);
  holdKey(r, 'KeyW', false);
});

test('AUTOCAM §5.5 aim.range: a held Holy charge with Shard 2 → the 10 m wave (held), Golden Hour gleam 8 m, else melee', async () => {
  const r = await rig(), { p, ctx } = r;
  ctx.state.shards = 2; p.setValor(80);
  r.press('attack'); r.seconds(1.2);
  assert.equal(p.state, 'charge'); assert.equal(p.chargeTier, 2);
  assert.equal(p.aim.held, true); assert.equal(p.aim.range, ATTACKS.holyWave.range);
  r.release('attack'); r.seconds(1.2);
  assert.equal(p.aim.held, false); assert.ok(p.aim.range < 5, 'melee reach only');
  ctx.state.shards = 1; p.setValor(80); r.press('attack'); r.seconds(1.2);
  assert.equal(p.aim.held, false, 'Shard 1: no wave, no aim pan'); r.release('attack'); r.seconds(1.2);
  p.golden = true; p.goldenT = 10; r.press('attack'); r.seconds(0.45);
  assert.equal(p.state, 'charge'); assert.equal(p.heldAimRange(), ATTACKS.gleam.range);
  assert.equal(p.aim.held, true); assert.equal(p.aim.range, ATTACKS.gleam.range); r.release('attack');
});

test('ART §6.5 Squash: kicks stretch then settle, clamped to ±0.35, frozen at dt 0', () => {
  const s = new Squash();
  s.kick(SQUASH.jump.kick);
  let peak = 0;
  for (let i = 0; i < 30; i++) peak = Math.max(peak, s.update(DT) - 1);
  assert.ok(peak > 0.08 && peak <= SQUASH.limit, `stretch peak ${peak.toFixed(3)}`);
  for (let i = 0; i < 120; i++) s.update(DT);
  near(s.x, 0, 1e-3, 'settles');
  s.kick(-50); for (let i = 0; i < 5; i++) s.update(DT);
  assert.ok(s.x >= -SQUASH.limit - 1e-9, 'clamped');
  const before = s.x; s.update(0); assert.equal(s.x, before, 'frozen in hitstop (dt 0)');
});

test('Arrival turn (requests/characters.md): a plain move order ends ≤ 20° toward the lens over 0.25 s; WASD cancels it', async () => {
  const r = await rig(), { p, ctx } = r;
  ctx.camera.position.set(10, 10, 6);                                // the lens off to her right at the goal
  assert.equal(p.order('move', new THREE.Vector3(0, 0, 6)), true);
  r.seconds(2.5);
  assert.equal(p.orders.lastClear, 'arrived');
  assert.ok(Math.abs(p.facing - 0.35) < 0.02, `turned 0.35 rad toward the lens (${p.facing.toFixed(3)})`);
  // an attack-move / in-combat arrival or a game camera behind her: no stray turn beyond the clamp
  p.facing = 0; ctx.camera.position.set(0, 10, -20);
  assert.equal(p.onArrive(), true);
  r.seconds(0.4);
  assert.ok(Math.abs(Math.abs(p.facing) - 0.35) < 0.02, `lens behind her: her turning side, clamped (${p.facing.toFixed(3)})`);
  // direct input cancels the turn at once
  p.facing = 0; ctx.camera.position.set(10, 10, 6);
  p.onArrive();
  ctx.input.move.x = 1; r.seconds(1 / 60); ctx.input.move.x = 0;
  assert.equal(p._arriveT, 0);
});

// ================================================================== practice tunic keeps the sword (sign-off 3)
import { buildKitten } from '../../src/characters/index.js';
import { OUTFITS } from '../../src/player/SwordcatModel.js';
import { isFinalBlow } from '../../src/combat/Combat.js';

test('Player: setOutfit(tunic_sword / tunic_bow) keeps armour off and the sword mesh visible; story probe resolves', async () => {
  const { p } = await rig();
  const m = p.model;
  assert.ok(p.hasOutfit('tunic_sword') && m.outfits.includes('tunic_sword'), 'story practiceOutfit() probe finds tunic_sword');
  assert.ok(!p.hasOutfit('pyjamas'));
  for (const name of ['tunic_sword', 'tunic_bow']) {
    p.setOutfit(name);
    assert.equal(m.outfit, name);
    const cfg = m._config();
    assert.equal(cfg.outfit.armour, null, `${name}: no plate`);
    assert.ok(cfg.accessories.some((a) => a?.id === 'tunic'), `${name}: tunic`);
    assert.ok(cfg.sword, `${name}: sword in the config`);
    assert.ok(cfg.bow, `${name}: the pink bow from the first frame (no sticker gate)`);
    const k = buildKitten(cfg);
    try {
      assert.ok(k.sword?.group?.parent, `${name}: sword attached`);
      let vis = true; for (let o = k.sword.group; o; o = o.parent) vis = vis && o.visible;
      let blade = false; k.sword.group.traverseVisible((o) => { if (o.isMesh) blade = true; });
      assert.ok(vis && blade, `${name}: sword mesh visible`);
    } finally { k.dispose(); }
  }
  p.setOutfit('tunic');
  assert.equal(m._config().sword, null, 'plain tunic (cutscenes) stays swordless');
  assert.ok(m._config().bow, 'plain tunic still wears the bow');
  p.setOutfit('armour');
  assert.ok(m._config().bow, 'plate wears the bow');
  p.setOutfit('nonsense');
  assert.equal(m.outfit, 'armour');
  assert.deepEqual([...OUTFITS], ['armour', 'tunic', 'tunic_sword', 'tunic_bow']);
});

test('Player: the "Bonk!" final-blow word uses Combat.isFinalBlow (one rule)', async () => {
  const { p, ctx } = await rig().then((r) => ({ ...r, ctx: r.p.ctx }));
  const mk = (x, o = {}) => ({ pos: new THREE.Vector3(x, 0, 0), faction: 'enemy', alerted: true, alive: true, ...o });
  const tgt = mk(1), other = mk(5);
  const cases = [
    [[tgt, other]],
    [[tgt, mk(5, { alive: undefined })]],                 // !e.alive vs alive === false used to disagree
    [[tgt, mk(5, { breakable: true })]],
    [[tgt, mk(500)]],
    [[tgt]],
  ];
  for (const [list] of cases) {
    ctx.enemies = { list };
    assert.equal(p._finalBlow(tgt), isFinalBlow(p, tgt, list, p.pos));
  }
  ctx.enemies = { list: [tgt] };
  assert.equal(p._finalBlow({ ...tgt, breakable: true }), false, 'breakables never Bonk');
});

// ====================================================================================================== TT3 §11.2 clicks
test('TT3 Orders: hybrid LMB on a foe = the attack order (no air swing far off); RMB on the ground = no order (the Stand)', async () => {
  const r = await rig(), { p, ctx } = r;
  const inp = ctx.input;
  ctx.state.settings.autoAttack = 'chain';
  const e = r.enemy(5, 0.3);
  e.maxHp = e.hp = 9999;
  let pick = { kind: 'enemy', actor: e, point: e.pos.clone() };
  const selected = [];
  ctx.cam = { pick: () => pick, select: (a) => selected.push(a), cursorValid: false };
  const click = (button, mods = {}) => {
    inp._queueClick({ button, x: 10, y: 10, down: true, t: 0, mods: { ctrl: false, shift: false, alt: false, ...mods } });
    inp._queueClick({ button, x: 10, y: 10, down: false, t: 0, mods: { ctrl: false, shift: false, alt: false, ...mods } });
  };
  assert.equal(inp.preset, 'hybrid');
  click(0); r.press('attack'); r.step(); r.release('attack');
  assert.equal(p.orders.kind, 'attack', 'LMB on a foe gives the attack order');
  assert.equal(p.orders.target, e);
  assert.equal(r.count(E.PLAYER_SWING), 0, '5 m off: the press does not swing at the air');
  r.seconds(3);
  assert.ok(r.count(E.PLAYER_SWING) >= 1, 'she walks in and swings');
  // RMB on open ground in hybrid: no move order
  p.order('stop'); r.seconds(0.5);
  pick = { kind: 'ground', actor: null, point: { x: 3, y: 0, z: 3 } };
  r.events.length = 0;
  click(2); r.step();
  assert.equal(p.orders.kind, null, 'hybrid: RMB is the Stand, never a move order');
  assert.equal(r.count(E.PLAYER_ORDER), 0);
});

test('TT3 Orders: Shift+RMB queues in moba only (no Ctrl queue); a plain RMB moves', async () => {
  const r = await rig(), { p, ctx } = r;
  const inp = ctx.input;
  ctx.state.settings.controlPreset = 'moba'; inp.rebind();
  assert.equal(inp.preset, 'moba');
  let pt = { x: 0, y: 0, z: 6 };
  ctx.cam = { pick: () => ({ kind: 'ground', actor: null, point: pt }), select() {}, cursorValid: false };
  const click = (button, mods = {}) => inp._queueClick({ button, x: 400, y: 300, down: true, t: 0, mods: { ctrl: false, shift: false, alt: false, ...mods } });
  click(2); r.step();
  assert.equal(p.orders.kind, 'move', 'moba: RMB moves');
  pt = { x: 3, y: 0, z: 6 };
  click(2, { ctrl: true }); r.step();
  assert.equal(p.orders.queue.length, 0, 'Ctrl does not queue (TT3)');
  pt = { x: -3, y: 0, z: 8 };
  click(2, { shift: true }); r.step();
  assert.equal(p.orders.queue.length, 1, 'Shift+RMB queues');
  // in mouseOnly Shift does not queue (moba only)
  ctx.state.settings.controlPreset = 'mouseOnly'; inp.rebind();
  p.order('stop'); r.step();
  click(2); r.step();
  click(2, { shift: true }); r.step();
  assert.equal(p.orders.queue.length, 0, 'mouseOnly: Shift+RMB is a plain move');
});

test('TT3 Orders: hybrid LMB on a breakable (a practice dummy) out of reach walks in (attack order)', async () => {
  const r = await rig(), { p, ctx } = r;
  const e = r.enemy(3.3, 0); e.faction = 'neutral'; e.maxHp = e.hp = 9999;
  ctx.cam = { pick: () => ({ kind: 'breakable', actor: e, point: e.pos.clone() }), select() {}, cursorValid: false };
  ctx.input._queueClick({ button: 0, x: 1, y: 1, down: true, t: 0, mods: { ctrl: false, shift: false, alt: false } });
  r.press('attack'); r.step(); r.release('attack');
  assert.equal(p.orders.kind, 'attack');
  assert.equal(r.count(E.PLAYER_SWING), 0, 'no swing at the air 3.3 m short');
});


// ------------------------------------------------------------------ TT5 package J: jumps (docs/TOKENTAILS-PLAN.md §13)
/** Run until she lands again (≤ 3 s); returns the highest feet height and the landing impact. */
function flight(r, onStep = null) {
  let top = -Infinity, impact = 0;
  for (let i = 0; i < 180; i++) {
    r.step(); top = Math.max(top, r.p.pos.y);
    if (onStep) onStep(i);
    if (r.p.landImpact > 0) impact = r.p.landImpact;
    if (r.p.onGround && i > 2) break;
  }
  return { top, impact };
}

test('TT5 J: preset B numbers (jumpV 8.4, fall ×1.5, cut 0.65 after 0.12 s, coyote 0.15, buffer 0.20, hard land 12.5, bounce 10)', () => {
  assert.deepEqual([PLAYER.jumpV, PLAYER.fallGravityMul, PLAYER.jumpCut, PLAYER.jumpCutAfter, PLAYER.coyote, PLAYER.jumpBuffer],
    [8.4, 1.5, 0.65, 0.12, 0.15, 0.20]);
  assert.deepEqual([PLAYER.hardLandSpeed, PLAYER.mushroomBounceV, GRAVITY, PLAYER.airDamp], [12.5, 10, 22, 4]);
  near(PLAYER.jumpV ** 2 / (2 * GRAVITY), 1.604, 0.001, 'apex');
  assert.equal(AIM.jumpAssist.maxRise, 1.4);
  assert.deepEqual([NAV.hop.upMax, NAV.fence.top], [1.1, 1.05], 'tap paths still never auto-hop onto walls');
});

test('TT5 J: a held jump peaks at 1.60 ± 0.02 m; an 80 ms keyboard tap still clears 1.0 m (the cut waits 0.12 s)', async () => {
  const r = await rig({ exact: true }), { p } = r;
  r.press('jump');
  const held = flight(r);
  r.release('jump');
  near(held.top, 1.604, 0.02, 'held apex');
  r.seconds(0.3);
  // an 80 ms tap: 5 fixed steps held
  r.press('jump'); r.step(5); r.release('jump');
  const tapTop = Math.max(p.pos.y, flight(r).top);
  assert.ok(tapTop >= 1.0, `tap apex ${tapTop.toFixed(3)} m clears the 1.0 m lesson fence`);
  assert.ok(tapTop < held.top - 0.25, `still a short hop (${tapTop.toFixed(2)} vs ${held.top.toFixed(2)})`);
  r.seconds(0.3);
  // a one-frame tap is cut at 0.12 s of rise, never sooner
  r.tap('jump');
  const one = flight(r);
  assert.ok(one.top >= 1.0, `one-frame tap ${one.top.toFixed(3)} m`);
});

test('TT5 J: a buffered jump whose key is already up at take-off is a full jump, not a 0.31 m hop', async () => {
  const r = await rig({ exact: true }), { p } = r;
  r.press('jump'); flight(r); r.release('jump');
  r.seconds(0.3);
  // jump, then press Jump again 0.15 s before landing and let go before she lands
  r.press('jump'); r.step(); r.release('jump');
  for (let i = 0; i < 180 && !(p.vel.y < 0 && p.pos.y < 0.45); i++) r.step();
  assert.equal(p.onGround, false, 'still in the air');
  r.press('jump'); r.step(); r.release('jump');
  let jumpedAgain = false, top = 0;
  for (let i = 0; i < 200; i++) {
    r.step();
    if (!jumpedAgain && p.vel.y > 5) jumpedAgain = true;
    if (jumpedAgain) { top = Math.max(top, p.pos.y); if (p.onGround) break; }
  }
  assert.ok(jumpedAgain, 'the buffered press jumped on landing');
  assert.equal(p.jumpHeldAtTakeoff, false);
  assert.ok(top >= 1.0, `buffered jump apex ${top.toFixed(3)} m`);
  near(top, 1.604, 0.02, 'never cut: a full jump');
});

test('TT5 J: coyote 0.15 s and buffer 0.20 s windows', async () => {
  const r = await rig({ exact: true }), { p } = r;
  // buffer: a press 0.18 s before landing still jumps
  r.press('jump'); r.step(); r.release('jump');
  for (let i = 0; i < 180 && !(p.vel.y < 0 && p.pos.y < 1.2); i++) r.step();
  let t = 0; while (!p.onGround && t < 3) { r.step(); t += DT; }   // time from this height to the ground
  assert.ok(t > 0.18, `fall time ${t.toFixed(2)}`);
  r.seconds(0.3);
  r.press('jump'); r.step(); r.release('jump');
  for (let i = 0; i < 180 && !(p.vel.y < 0 && p.pos.y < 1.2); i++) r.step();
  const steps = Math.round((t - 0.18) / DT);
  r.step(Math.max(0, steps));
  r.press('jump'); r.step(); r.release('jump');
  let again = false;
  for (let i = 0; i < 30; i++) { r.step(); if (p.vel.y > 5) { again = true; break; } }
  assert.ok(again, 'a press 0.18 s before landing jumps on landing');
  // coyote: walking off a ledge, a press 0.13 s later still jumps
  const r2 = await rig({ exact: true, floor: (x, z) => (z < 1 ? 0.6 : 0) });
  r2.p.pos.set(0, 0.6, 0.95); r2.p.onGround = true; r2.step();
  r2.p.pos.z = 1.05; r2.step();                               // stepped off the ledge
  assert.equal(r2.p.onGround, false);
  r2.step(Math.round(0.12 / DT));
  r2.press('jump'); r2.step(); r2.release('jump');
  assert.ok(r2.p.vel.y > 5, 'coyote jump inside 0.15 s');
});

test('TT5 J: no hard landing after a full jump onto ground 0.5 m lower (or from a full jump on flat ground)', async () => {
  let lower = false;
  const r = await rig({ exact: true, floor: () => (lower ? 0 : 0.5) }), { p } = r;
  p.pos.set(0, 0.5, 0); p.onGround = true;
  const states = [];
  const orig = p.setState.bind(p);
  p.setState = (s, ...a) => { states.push(s); return orig(s, ...a); };
  r.press('jump'); r.step(); lower = true;
  const f = flight(r);
  r.release('jump');
  near(f.top, 0.5 + 1.604, 0.03, 'full jump from the ledge');
  assert.ok(f.impact > 9 && f.impact < PLAYER.hardLandSpeed, `impact ${f.impact.toFixed(2)} (> the old 9, < ${PLAYER.hardLandSpeed})`);
  assert.ok(!states.includes('land'), `no hard-landing lock (${states.join(',')})`);
  r.step(); assert.equal(p.state, 'move');
  // a drop from 2.5 m above the ground still lands hard
  p.pos.y = 3.0; p.onGround = false; p.vel.y = 0;
  flight(r);
  assert.ok(states.includes('land'), 'a real fall still locks the landing');
});

test('TT5 J: the Ribbon Twirl uses its low gravity only while falling: no twirl super-jump (apex ≤ 1.8 m)', async () => {
  const { twirlGravityMul, TWIRL_FALL_GRAVITY } = await import('../../src/player/tricks/RibbonTwirl.js');
  const { TRICK_FLAGS } = await import('../../src/player/tricks/tuning.js');
  assert.equal(twirlGravityMul(3), 1, 'rising: normal gravity');
  assert.equal(twirlGravityMul(-0.1), TWIRL_FALL_GRAVITY);
  assert.equal(TWIRL_FALL_GRAVITY, 0.55);
  const r = await rig({ exact: true }), { p, ctx } = r;
  ctx.state.setFlag('onboard.firstFight', true);
  ctx.state.setFlag(TRICK_FLAGS.twirl, true);
  p.tricks.init?.();
  // the super-jump input: tap Jump, press it again right after the take-off grace and hold it on the way up
  r.press('jump'); r.step(4); r.release('jump'); r.step();
  r.press('jump');
  let twirled = false, top = 0;
  for (let i = 0; i < 180; i++) {
    r.step(); top = Math.max(top, p.pos.y);
    if (p.state === 'twirl') { twirled = true; if (p.vel.y > 0) assert.equal(p.gravityMul, 1, 'normal gravity while rising in the twirl'); }
    if (p.onGround && i > 2) break;
  }
  r.release('jump');
  assert.ok(twirled, 'the twirl started on the way up');
  assert.ok(top <= 1.8, `twirl apex ${top.toFixed(3)} m ≤ 1.8`);
  assert.ok(top <= PLAYER.jumpV ** 2 / (2 * GRAVITY) + 0.02, 'never above a plain held jump');
});

test('TT5 J: jump assist aims at tops up to 1.4 m (a 1.3 m crate yes, a 1.6 m wall no)', () => {
  const o = { ...AIM.jumpAssist, v0: PLAYER.jumpV, g: GRAVITY, fallMul: PLAYER.fallGravityMul };
  const box = (top) => (x, z) => (z >= 1.6 && z <= 2.8 && Math.abs(x) <= 0.6 ? { top, walkable: true } : { top: 0, walkable: true });
  const her = { x: 0, y: 0, z: 0 };
  const hi = jumpAssistPlan(her, { x: 0, z: 3.0 }, box(1.3), o);
  assert.ok(hi && Math.abs(hi.rise - 1.3) < 0.2, `a 1.3 m top is a hop target (${JSON.stringify(hi)})`);
  assert.equal(jumpAssistPlan(her, { x: 0, z: 3.0 }, box(1.6), o), null, 'above maxRise: a plain jump');
  // the default (no maxRise passed) is the TT5 1.4 too
  const { maxRise, ...noMax } = o; void maxRise;
  assert.ok(jumpAssistPlan(her, { x: 0, z: 3.0 }, box(1.3), noMax), 'default maxRise 1.4');
});
