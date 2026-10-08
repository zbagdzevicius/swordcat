// tests/unit/core.test.js  (owner: core) — pure core modules: rng, math, Loop, Input edges + heldTime,
// GameState (§19.7, difficulty rounding U4 basics), ActorRegistry (A5), ScriptedActor defaults, params.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRng, mulberry32 } from '../../src/core/rng.js';
import { wrapAngle, lerpAngle, damp, dampAngle, clamp, yawTo, easeSwing } from '../../src/core/math.js';
import { Loop } from '../../src/core/Loop.js';
import { Input, deadZone } from '../../src/core/Input.js';
import { GameState, defaultState, SAVE_KEYS } from '../../src/core/GameState.js';
import { ActorRegistry, hostileTo } from '../../src/core/ActorRegistry.js';
import { Actor } from '../../src/core/Actor.js';
import { ScriptedActorMixin } from '../../src/core/ScriptedActor.js';
import { parseParams } from '../../src/core/Game.js';
import { KITTEN_IDS, KITTENS_BY_LEVEL, LEVEL_IDS, QUALITY, INPUT } from '../../src/core/config.js';

test('rng: seeded, reproducible, helpers in range, forks independent', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
  const r = createRng(7);
  for (let i = 0; i < 500; i++) {
    const x = r(); assert.ok(x >= 0 && x < 1);
    const n = r.int(2, 5); assert.ok(n >= 2 && n <= 5 && Number.isInteger(n));
    const y = r.range(-1, 1); assert.ok(y >= -1 && y < 1);
  }
  assert.ok(['a', 'b'].includes(r.pick(['a', 'b'])));
  const f1 = createRng(9).fork('meadow'), f2 = createRng(9).fork('meadow'), f3 = createRng(9).fork('forest');
  assert.equal(f1(), f2()); assert.notEqual(createRng(9).fork('meadow')(), f3());
  assert.equal(typeof mulberry32(1)(), 'number');
});

test('math: angles wrap the short way; damp is frame-rate independent', () => {
  assert.ok(Math.abs(wrapAngle(3 * Math.PI) - Math.PI) < 1e-9);
  assert.ok(Math.abs(lerpAngle(3, -3, 0.5) - Math.PI) < 0.15, 'lerps across ±PI');
  const one = damp(0, 1, 5, 1 / 30);
  const two = damp(damp(0, 1, 5, 1 / 60), 1, 5, 1 / 60);
  assert.ok(Math.abs(one - two) < 1e-9);
  assert.ok(Math.abs(wrapAngle(dampAngle(3, -3, 1000, 1) - (-3))) < 1e-6);
  assert.equal(clamp(5, 0, 1), 1);
  assert.ok(Math.abs(yawTo({ x: 0, z: 0 }, { x: 1, z: 0 }) - Math.PI / 2) < 1e-9, 'yaw = atan2(dx, dz): +X is +90°');
  assert.equal(easeSwing(1), 1);
});

test('Loop: fixed 1/60 steps, interpolation alpha, maxSteps clamp, timeScale', () => {
  let steps = 0, lastAlpha = -1;
  const loop = new Loop(null, { update: () => steps++, render: (a) => { lastAlpha = a; } });
  loop.advance(1 / 60 * 3 + 0.001);
  assert.equal(steps, 3);
  assert.ok(lastAlpha > 0 && lastAlpha < 1);
  steps = 0; loop.acc = 0; loop.advance(0.5);           // a long frame: clamp to 5 steps, drop the rest
  assert.equal(steps, 5); assert.equal(loop.acc, 0);
  steps = 0; loop.timeScale = 0.5; loop.advance(4 / 60);
  assert.equal(steps, 2);
  steps = 0; loop.timeScale = 0; loop.advance(1 / 60);
  assert.equal(steps, 0);
});

test('Input: edges latch until endStep; heldTime counts sim time and survives the release step', () => {
  const inp = new Input(null);
  inp._press('attack', 'k:KeyJ');
  assert.ok(inp.pressed('attack') && inp.down('attack'));
  inp.update(1 / 60); inp.endStep();
  assert.ok(!inp.pressed('attack') && inp.down('attack'));
  for (let i = 0; i < 59; i++) { inp.update(1 / 60); inp.endStep(); }
  assert.ok(Math.abs(inp.heldTime('attack') - 1) < 1e-9);
  inp._release('attack', 'k:KeyJ');
  assert.ok(inp.released('attack') && !inp.down('attack'));
  assert.ok(Math.abs(inp.heldTime('attack') - 1) < 1e-9, 'final duration readable on the release step');
  inp.endStep();
  assert.equal(inp.heldTime('attack'), 0);
  // tap within one frame (press + release before any step) still produces both edges
  inp._press('jump', 'k:Space'); inp._release('jump', 'k:Space');
  assert.ok(inp.pressed('jump') && inp.released('jump') && !inp.down('jump'));
  inp.endStep();
  // two sources hold one action: released only when both let go
  inp._press('guard', 'm:Mouse2'); inp._press('guard', 'k:KeyL'); inp._release('guard', 'm:Mouse2');
  assert.ok(inp.down('guard')); inp._release('guard', 'k:KeyL'); assert.ok(!inp.down('guard'));
  // touch hooks + move composition (length ≤ 1)
  inp.setVirtualMove(1, 1);
  assert.ok(Math.hypot(inp.move.x, inp.move.y) <= 1 + 1e-9);
  inp.setVirtual('milk', true); assert.ok(inp.pressed('milk')); inp.setVirtual('milk', false); assert.ok(!inp.down('milk'));
  inp.addLook(0.1, -0.2); const l = inp.consumeLook(); assert.ok(Math.abs(l.x - 0.1) < 1e-9 && Math.abs(l.y + 0.2) < 1e-9);
  assert.equal(inp.consumeLook().x, 0);
  // A2 actions all exist
  for (const a of ['guard', 'ability', 'milk', 'meow', 'golden', 'recenter', 'attack', 'dodge', 'jump', 'interact', 'lockon', 'pause'])
    assert.ok(inp.actions.has(a), `action ${a}`);
  assert.deepEqual(INPUT.keys.guard, ['KeyL', 'Mouse2'], 'RMB → guard (A2)');
  assert.ok(!INPUT.keys.dodge.includes('Mouse2'), 'RMB no longer dodges');
  assert.deepEqual(INPUT.pad.lockon, [5], 'gamepad lock-on is RB only');
  assert.deepEqual(INPUT.pad.recenter, [11], 'R3 recentres');
});

test('Input: radial dead zone rescales', () => {
  assert.deepEqual(deadZone(0.1, 0.05, 0.15), { x: 0, y: 0 });
  const d = deadZone(1, 0, 0.15); assert.ok(Math.abs(d.x - 1) < 1e-9);
  const h = deadZone(0.575, 0, 0.15); assert.ok(Math.abs(h.x - 0.5) < 1e-9);
});

test('GameState: §19.7 defaults, JSON round trip, flag conditions, difficulty rounding', () => {
  const s = new GameState();
  assert.equal(s.hp, 8); assert.equal(s.maxHp, 8); assert.equal(s.lives, 9); assert.equal(s.difficulty, 'knight');
  assert.ok(!('holy' in s.toJSON()), 'A8: holy removed');
  assert.deepEqual(Object.keys(s.toJSON()).sort(), [...SAVE_KEYS].sort());
  s.kittens.push('noodle'); s.flags['prologue.done'] = true; s.settings.music = 0.2;
  const t = new GameState(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(t.toJSON(), s.toJSON());
  assert.equal(new GameState({ settings: { music: 0.1 } }).settings.sfx, defaultState().settings.sfx, 'nested defaults kept');
  assert.equal(s.cond('prologue.done'), true); assert.equal(s.cond('!prologue.done'), false);
  assert.equal(s.cond('prologue.done && !town.free'), true); assert.equal(s.cond('town.free || meadow.done'), false);
  assert.equal(s.cond(''), true);
  const k = new GameState({ difficulty: 'kitten' }).difficultyCfg, kn = s.difficultyCfg, n9 = new GameState({ difficulty: 'nine' }).difficultyCfg;
  assert.equal(k.roundTaken(1), 1); assert.equal(k.roundTaken(3), 1); assert.equal(k.roundTaken(4), 2);
  assert.equal(kn.roundTaken(3), 3); assert.equal(n9.roundTaken(1), 2); assert.equal(n9.roundTaken(2), 3);
  assert.equal(kn.playerDmgMul, 1); assert.deepEqual(kn.tokens, [2, 2]);
});

test('config ids: 6 levels, 18 kittens (3 per level), quality presets', () => {
  assert.deepEqual(LEVEL_IDS, ['meadow', 'forest', 'town', 'gate', 'bog', 'keep']);
  assert.equal(new Set(KITTEN_IDS).size, 18);
  for (const id of LEVEL_IDS) assert.equal(KITTENS_BY_LEVEL[id].length, 3);
  for (const q of ['low', 'med', 'high']) assert.ok(QUALITY[q].maxDpr > 0);
  assert.equal(QUALITY.low.composer, false, 'Low skips the composer');
});

test('ActorRegistry: ids (A5), tags, radius queries, hostility', () => {
  const reg = new ActorRegistry();
  const p = new Actor({}, { faction: 'player' }), e1 = new Actor({}, { faction: 'enemy' }), e2 = new Actor({}, { faction: 'enemy' }), n = new Actor({});
  e1.tags.add('boss'); e1.pos.set(2, 0, 0); e2.pos.set(30, 0, 0);
  reg.register(p, 'swordcat'); reg.register(e1, 'barkus'); reg.register(e2); reg.register(n, 'pudding');
  assert.equal(reg.get('swordcat'), p); assert.equal(reg.get('pudding'), n);
  assert.deepEqual(reg.byTag('boss'), [e1]); assert.deepEqual(reg.byTag('swordcat'), [p]);
  assert.deepEqual(reg.queryRadius(p.pos, 5, hostileTo('player')).slice(), [e1]);
  assert.equal(reg.nearest(p.pos, 100, hostileTo('player')), e1);
  assert.equal(hostileTo('enemy')(p), true); assert.equal(hostileTo('enemy')(n), false);
  reg.unregister(e1);
  assert.equal(reg.get('barkus'), undefined); assert.equal(reg.count, 3);
});

test('ScriptedActor defaults: moveTo resolves on arrival, face tweens, setScripted(false) releases waits', async () => {
  const levels = { anchor: (n) => (n === 'gate' ? { pos: new THREE.Vector3(0, 0, 4), facing: 0 } : null) };
  const ctx = { actors: new ActorRegistry(), levels };
  const A = class extends ScriptedActorMixin(Actor) {};
  const a = new A(ctx, {});
  a.setScripted(true);
  assert.ok(a.scripted && a.tags.has('scripted'));
  let done = false;
  a.moveTo('gate', 4).then(() => { done = true; });
  for (let i = 0; i < 240 && !done; i++) { a.scriptedStep(1 / 60); a.pos.addScaledVector(a.vel, 1 / 60); await Promise.resolve(); }
  assert.ok(done, 'moveTo resolved');
  assert.ok(a.pos.distanceTo(new THREE.Vector3(0, 0, 4)) < 0.2);
  let faced = false;
  a.face(Math.PI / 2, 0.3).then(() => { faced = true; });
  for (let i = 0; i < 30; i++) { a.scriptedStep(1 / 60); await Promise.resolve(); }
  assert.ok(faced && Math.abs(a.facing - Math.PI / 2) < 1e-6);
  let released = false;
  a.moveTo([50, 50], 1).then(() => { released = true; });
  a.setScripted(false); await Promise.resolve();
  assert.ok(released, 'pending moveTo resolves when scripted mode ends');
  a.pose('kneel'); assert.equal(a.poseName, 'kneel');
  a.prop('milk_cup', true); assert.equal(a.props.milk_cup, true);
  await a.play('Headbutt', { once: true });   // no animator: resolves immediately
});

test('parseParams: ?test fixes the seed; level/spawn/quality pass through', () => {
  const p = parseParams('?test=1');
  assert.equal(p.test, true); assert.equal(p.seed, 1); assert.equal(p.debug, false);
  const q = parseParams('?debug&seed=99&level=forest&spawn=boss&quality=low');
  assert.equal(q.debug, true); assert.equal(q.seed, 99); assert.equal(q.level, 'forest'); assert.equal(q.spawn, 'boss'); assert.equal(q.quality, 'low');
  assert.equal(parseParams('?test=0').test, false);
});
