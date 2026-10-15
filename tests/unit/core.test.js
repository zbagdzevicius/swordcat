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
import { parseParams, debugAllowed } from '../../src/core/Game.js';
import { KITTEN_IDS, KITTENS_BY_LEVEL, LEVEL_IDS, QUALITY, INPUT, HAPTICS } from '../../src/core/config.js';

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
  steps = 0; loop.acc = 0; loop.advance(0.5);           // a long frame: clamp to LOOP.maxSteps (4, PERF §4.1), drop the rest
  assert.equal(steps, 4); assert.equal(loop.acc, 0);
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
  // C2: in iso the look is swallowed (fixed-yaw camera); ?cam=classic keeps the orbit look
  inp.addLook(0.1, -0.2); assert.deepEqual({ ...inp.consumeLook() }, { x: 0, y: 0, px: 0, py: 0 }, 'iso: consumeLook() is zeros');
  const cl = new Input({ params: { cam: 'classic' } });
  cl.addLook(0.1, -0.2); const l = cl.consumeLook(); assert.ok(Math.abs(l.x - 0.1) < 1e-9 && Math.abs(l.y + 0.2) < 1e-9);
  assert.equal(cl.consumeLook().x, 0);
  // A2 actions all exist
  for (const a of ['guard', 'ability', 'milk', 'meow', 'golden', 'recenter', 'attack', 'dodge', 'jump', 'interact', 'lockon', 'pause'])
    assert.ok(inp.actions.has(a), `action ${a}`);
  // TOKENTAILS-PLAN §11.2 (TT3, preset hybrid): RMB / Q / L = the Stand, Space = jump, WASD walks (no click-to-move),
  // F = the Paw Trick, G = the kitten, Z / MMB = peek + ranges; J / K / L aliases kept
  assert.deepEqual(INPUT.keys.guard, ['Mouse2', 'KeyQ', 'KeyL'], 'RMB / Q / L = the Stand');
  assert.deepEqual(INPUT.keys.move, [], 'hybrid: WASD walks, no move click');
  assert.deepEqual(INPUT.keys.jump, ['Space'], 'Space = jump');
  assert.deepEqual(INPUT.keys.trick, ['KeyF'], 'F = the Paw Trick');
  assert.deepEqual(INPUT.keys.ability, ['KeyG'], 'G = the kitten ability');
  assert.deepEqual(INPUT.keys.peek, ['KeyZ', 'Mouse1'], 'Z / MMB = peek');
  assert.deepEqual(INPUT.keys.ranges, ['KeyZ', 'Mouse1'], 'ranges share the peek hold');
  assert.deepEqual([INPUT.keys.trick1, INPUT.keys.trick2, INPUT.keys.trick3], [['Digit1'], ['Digit2'], ['Digit3']]);
  assert.ok(!INPUT.keys.dodge.includes('Mouse2'), 'RMB never dodges');
  assert.deepEqual(INPUT.pad.guard, [4, 5], 'LB / RB = the Stand');
  assert.deepEqual(INPUT.pad.trick, [7], 'RT = the Paw Trick');
  assert.deepEqual(INPUT.pad.lockon, [11], 'R3 selects');
  assert.deepEqual(INPUT.pad.zoomCycle, [8], 'View cycles the zoom');
  assert.deepEqual(INPUT.pad.golden, [], 'pad Golden Hour is the Stand + X chord');
  // ?cam=classic keeps the old table (RMB guard, Space jump, R3 recentre)
  assert.deepEqual(INPUT.classicKeys.guard, ['KeyL', 'Mouse2']);
  assert.deepEqual(INPUT.classicPad.recenter, [11]);
});

test('Input (iso): presets merge over the keys, settings.bindings on top; clicks / taps queue; zoom; virtual aim', () => {
  const st = { settings: { controlPreset: 'hybrid', bindings: {} } };
  const events = [];
  const ctx = { state: st, bus: { emit: (n, p) => events.push([n, p]), on: () => () => {} }, params: { cam: 'iso' } };
  const inp = new Input(ctx);
  assert.equal(inp.iso, true);
  assert.equal(inp.pointerLockEnabled, false, 'no pointer lock in iso (C2)');
  assert.ok(inp._bind.get('Space').includes('jump'));
  assert.ok(inp._bind.get('Mouse2').includes('guard') && !inp._bind.get('Mouse2').includes('move'), 'hybrid: RMB stands');
  assert.equal(inp.preset, 'hybrid');
  st.settings.controlPreset = 'moba';
  inp.rebind();
  assert.equal(inp.preset, 'moba');
  assert.equal(inp.wasd, false, 'moba: WASD does not move');
  assert.ok(inp._bind.get('KeyA').includes('attackMove'));
  assert.ok(inp._bind.get('Mouse2').includes('move') && !inp._bind.get('Mouse2').includes('guard'), 'moba: RMB moves, Q stands');
  assert.deepEqual(events.at(-1), ['input:scheme', { preset: 'moba' }]);
  st.settings.controlPreset = 'diablo'; inp.rebind();
  assert.ok(inp.lmbMoves && inp._bind.get('Mouse0').includes('move'), 'diablo: LMB moves');
  assert.deepEqual(inp.codesFor('jump'), ['KeyT'], 'diablo: Space tumbles, jump moves to T');
  st.settings.controlPreset = 'hybrid'; st.settings.bindings = { jump: ['KeyN'] }; inp.rebind();
  assert.deepEqual(inp.codesFor('jump'), ['KeyN'], 'rebinding wins');
  st.settings.bindings = { jump: ['ControlLeft', 'KeyN', 'F5', 'MetaLeft', 'AltLeft'], pause: ['KeyO'] }; inp.rebind();
  assert.deepEqual(inp.codesFor('jump'), ['KeyN'], 'a stored modifier / F-key binding is dropped');
  assert.deepEqual(inp.codesFor('pause'), ['KeyO', 'Escape'], 'Esc always pauses');
  st.settings.bindings = {}; inp.rebind();
  inp.addTap(10, 20, 'tap'); inp.addTap(30, 40, 'long');
  const c1 = inp.takeClick(), c2 = inp.takeClick();
  assert.equal(c1.button, 'tap'); assert.equal(c1.kind, 'tap'); assert.equal(c2.kind, 'long');
  assert.equal(inp.takeClick(), null);
  for (let i = 0; i < 20; i++) inp.addTap(i, i);
  let n = 0; while (inp.takeClick()) n++;
  assert.equal(n, INPUT.pointer.clickQueue, 'the queue keeps the newest 8');
  inp.addZoom(1); inp.addZoom(-0.5);
  assert.equal(inp.consumeZoom(), 0.5); assert.equal(inp.consumeZoom(), 0);
  inp.setVirtualAim(3, 4, true);
  assert.deepEqual(inp.virtualAim, { x: 3, y: 4, active: true });
  inp.releaseAll();
  assert.equal(inp.virtualAim.active, false);
  const classic = new Input({ params: { cam: 'classic' } });
  assert.equal(classic.iso, false); assert.ok(classic._bind.get('Mouse2').includes('guard'), 'classic: RMB guards');
});

test('Input (iso): §6.1 mouse speed threshold, pad 8 = controls card, presets of §6.2, queued releases', () => {
  const inp = new Input({ params: {} });
  const t0 = performance.now();
  // a resting hand drifting 1 px every 100 ms (10 px/s) is not activity; a real flick is
  inp._pointerAt(100, 100, false);
  inp.pointer._t = t0 - 100; inp._activity = false;
  inp._pointerAt(101, 100, true);
  assert.equal(inp._activity, false, '10 px/s drift is idle');
  inp.pointer._t = performance.now() - 16;
  inp._pointerAt(141, 100, true);
  assert.equal(inp._activity, true, 'a 40 px / 16 ms move is activity');
  inp.update(1 / 60); assert.equal(inp.idleTime, 0);
  assert.ok(inp.pointer.movedPx >= 41 && inp.pointer.lastMoveT > 0);
  // TT3 §11.2: the pad's View (8) zooms now; the controls card lives in the pause menu
  assert.deepEqual(INPUT.pad.controls, []);
  assert.ok(INPUT.actions.includes('controls'));
  // §6.2 mouseOnly: MMB click = Jump, Space jumps too, RMB still moves (peek moves to Z)
  const st = { settings: { controlPreset: 'mouseOnly', bindings: {} } };
  const mo = new Input({ state: st, params: {} });
  assert.ok(mo._bind.get('Mouse1').includes('jump') && !mo._bind.get('Mouse1').includes('peek'));
  assert.ok(mo._bind.get('Mouse4').includes('guard') && mo._bind.get('Mouse3').includes('dodge'));
  assert.ok(mo._bind.get('Space').includes('jump') && mo._bind.get('Mouse2').includes('move'), 'mouseOnly: Space jumps, RMB moves');
  st.settings.controlPreset = 'keyboardOnly'; mo.rebind();
  assert.ok(mo._bind.get('Space').includes('jump') && !(mo._bind.get('Mouse2') ?? []).includes('move'), 'keyboardOnly: Space jumps, no RMB orders');
  st.settings.controlPreset = 'nonsense'; mo.rebind();
  assert.equal(mo.preset, 'hybrid', 'unknown preset falls back to hybrid');
  // a held order button's release is queued on blur (hold-to-follow never sticks)
  mo._clickDown.add(2); mo.releaseAll();
  const up = mo.takeClick();
  assert.ok(up && up.button === 2 && up.down === false);
  assert.equal(mo._clickDown.size, 0);
});

test('TT3 §11.2: no binding in any table uses Ctrl, Alt, Meta or an F-key', () => {
  const bad = /^(?:Control|Alt|Meta|OS|F\d{1,2}$)/;
  const tables = { keys: INPUT.keys, classicKeys: INPUT.classicKeys, ...Object.fromEntries(Object.entries(INPUT.presets).map(([k, p]) => [k, p.keys])) };
  for (const [name, t] of Object.entries(tables)) for (const [a, codes] of Object.entries(t)) for (const c of codes ?? []) assert.ok(!bad.test(c), `${name}.${a}: ${c}`);
  for (const c of INPUT.preventDefault) assert.ok(!bad.test(c), `preventDefault: ${c}`);
  for (const a of ['sprint', 'trick', 'trick1', 'trick2', 'trick3', 'golden']) assert.ok(INPUT.actions.includes(a), a);
});

test('TT3 §11.2: a keydown with Ctrl or Meta sets no action and no move; Shift+Tab = lockPrev', () => {
  const inp = new Input({ params: {} });
  const key = (code, mods = {}) => ({ code, repeat: false, target: { tagName: 'CANVAS' }, preventDefault() {}, ...mods });
  for (const [code, mods] of [['KeyW', { ctrlKey: true }], ['KeyD', { ctrlKey: true }], ['KeyW', { metaKey: true }], ['KeyF', { ctrlKey: true }], ['Space', { metaKey: true }]]) {
    inp._keyDown(key(code, mods));
    for (const [a, s] of inp.actions) assert.ok(!s.down && !s.pressed, `${mods.ctrlKey ? 'Ctrl' : 'Meta'}+${code} set ${a}`);
    assert.equal(inp.move.y, 0); assert.equal(inp.move.x, 0);
    assert.ok(!inp.keys.has(code));
  }
  inp._keyDown(key('KeyW'));
  assert.ok(inp.move.y > 0, 'plain W walks');
  inp._keyUp(key('KeyW'));
  inp._keyDown(key('Tab', { shiftKey: true }));
  assert.ok(inp.pressed('lockPrev') && !inp.pressed('lockon'), 'Shift+Tab cycles back');
  inp._keyUp(key('Tab'));
  assert.ok(!inp.down('lockPrev'));
  inp.endStep();
  inp._keyDown(key('Tab'));
  assert.ok(inp.pressed('lockon') && !inp.pressed('lockPrev'));
});

test('TT3 §11.2: sprint = the dodge input held INPUT.sprintAfter s; released with it', () => {
  const inp = new Input({ params: {} });
  inp._press('dodge', 'k:ShiftLeft');
  const dt = 1 / 60;
  let t = 0;
  while (t + dt < INPUT.sprintAfter - 1e-9) { inp.update(dt); inp.endStep(); t += dt; assert.ok(!inp.down('sprint'), `no sprint at ${t.toFixed(3)} s`); }
  inp.update(dt); inp.update(dt);
  assert.ok(inp.down('sprint') && inp.pressed('sprint'), 'sprint after 0.18 s');
  inp.endStep();
  inp._release('dodge', 'k:ShiftLeft'); inp.update(dt);
  assert.ok(!inp.down('sprint') && inp.released('sprint'));
  // a tap never sprints
  inp.endStep();
  inp._press('dodge', 'v'); inp.update(0.05); inp._release('dodge', 'v'); inp.update(0.2);
  assert.ok(!inp.down('sprint'));
  assert.equal(INPUT.sprintAfter, 0.18);
});

test('TT3 §11.2: golden = guard + attack pressed within 0.1 s (either order), not after', () => {
  let now = 1000;
  const mk = () => { const i = new Input({ params: {} }); i.now = () => now; return i; };
  let inp = mk();
  inp._press('guard', 'm:Mouse2'); now += 60; inp._press('attack', 'm:Mouse0');
  assert.ok(inp.pressed('golden') && inp.down('golden'), 'RMB then LMB 60 ms later');
  inp._release('attack', 'm:Mouse0');
  assert.ok(!inp.down('golden'), 'released with either');
  inp = mk();
  inp._press('attack', 'p2'); now += 100; inp._press('guard', 'p4');
  assert.ok(inp.pressed('golden'), 'X then LB at exactly 0.1 s');
  inp = mk();
  inp._press('guard', 'k:KeyQ'); now += 150; inp._press('attack', 'k:KeyJ');
  assert.ok(!inp.pressed('golden') && !inp.down('golden'), '0.15 s apart: no Golden Hour');
  inp = mk();
  inp._press('guard', 'k:KeyQ'); now += 40; inp._release('guard', 'k:KeyQ'); inp._press('attack', 'k:KeyJ');
  assert.ok(!inp.pressed('golden'), 'the Stand already let go: no chord');
  inp = mk();
  inp._press('golden', 'k:KeyV');
  assert.ok(inp.pressed('golden'), 'V still works');
});

test('TT3 §11.2: pad RT held + D-pad ← → ↑ picks trick1..3 instead of the D-pad action', () => {
  const inp = new Input({ params: {} });
  const merged = new Array(20).fill(false);
  merged[7] = true; inp._padTrickPick(merged);
  merged[14] = true; assert.ok(inp._padTrickPick(merged));
  assert.ok(inp.pressed('trick1') && inp.usedAsModifier('trick'));
  merged[14] = false; merged[15] = true; inp._padTrickPick(merged);
  assert.ok(!inp.down('trick1') && inp.pressed('trick2'));
  merged[15] = false; merged[12] = true; inp._padTrickPick(merged);
  assert.ok(inp.pressed('trick3'));
  assert.equal(inp._padPick[12], 1, 'D-pad up redirected: milk does not fire');
  merged[12] = false; merged[7] = false; inp._padTrickPick(merged);
  // without RT the D-pad is not redirected
  inp.endStep();
  merged[14] = true; assert.ok(!inp._padTrickPick(merged));
  assert.ok(!inp.pressed('trick1') && inp._padPick[14] === 0);
  inp._press('trick', 'p7');
  assert.ok(!inp.usedAsModifier('trick'), 'cleared on the next RT press');
});

test('Input: §10.6 haptics buzz a phone on parry / hurt / block / order rejected; scaled, never in menus or on KBM', async () => {
  const { EventBus } = await import('../../src/core/EventBus.js');
  const { E } = await import('../../src/core/events.js');
  const calls = [];
  const had = Object.getOwnPropertyDescriptor(navigator, 'vibrate');
  Object.defineProperty(navigator, 'vibrate', { configurable: true, writable: true, value: (p) => { calls.push(p); return true; } });
  try {
    const bus = new EventBus(), player = { id: 'player' };
    const ctx = { bus, player, game: { mode: 'play' }, state: { settings: { haptics: 1, hapticTaps: false, bindings: {} } }, params: {} };
    const inp = new Input(ctx);
    await inp.init();
    inp.device = 'kbm';
    bus.emit(E.PLAYER_PARRY, {});
    assert.equal(calls.length, 0, 'no vibrate on keyboard + mouse');
    inp.device = 'touch';
    bus.emit(E.PLAYER_PARRY, {}); bus.emit(E.PLAYER_DAMAGED, { amount: 1 });
    bus.emit(E.HIT, { target: player, blocked: true }); bus.emit(E.PLAYER_ORDER, { kind: 'move', valid: false });
    bus.emit(E.PLAYER_GRIT, { broken: true }); bus.emit(E.PLAYER_GRIT, { broken: true });
    assert.deepEqual(calls, [HAPTICS.parry, HAPTICS.hurt, HAPTICS.block, HAPTICS.orderRejected, HAPTICS.guardBreak]);
    calls.length = 0;
    ctx.state.settings.haptics = 0.5; bus.emit(E.PLAYER_DAMAGED, { amount: 2 });
    assert.deepEqual(calls, [Math.round(HAPTICS.hurt * 0.5)], 'scaled by settings.haptics');
    ctx.game.mode = 'menu'; bus.emit(E.PLAYER_DAMAGED, { amount: 2 });
    ctx.state.settings.haptics = 0; ctx.game.mode = 'play'; bus.emit(E.PLAYER_DAMAGED, { amount: 2 });
    assert.equal(calls.length, 1, 'never in menus / when off');
    assert.equal(inp.haptic('button'), false, 'button taps only with settings.hapticTaps');
    inp.dispose();
    ctx.state.settings.haptics = 1; bus.emit(E.PLAYER_PARRY, {});
    assert.equal(calls.length, 1, 'dispose unsubscribes');
  } finally {
    if (had) Object.defineProperty(navigator, 'vibrate', had); else delete navigator.vibrate;
  }
});

test('Input: losing pointer lock mid-play opens the pause menu once; resume re-captures the mouse', () => {
  const events = [];
  const ui = { busy: false, pauses: 0, pause() { this.pauses++; this.busy = true; ctx.game.mode = 'menu'; } };
  const ctx = { game: { mode: 'play' }, ui, levels: { loading: false }, bus: { emit: (n, p) => events.push([n, p]) } };
  const inp = new Input({ ...ctx, params: { cam: 'classic' } });
  inp.ctx = ctx;
  inp.pointerLockEnabled = true;
  let requested = 0; inp.requestPointerLock = () => { requested++; };
  inp._onPointerLockChange(true);
  assert.ok(inp.pointerLocked && inp.relockOnResume);
  inp._press('attack', 'm:Mouse0');
  inp._onPointerLockChange(false);                       // browser spent the Esc on leaving the lock
  assert.ok(!inp.down('attack'), 'mouse buttons released');
  inp._press('pause', 'k:Escape');                        // even if the Esc keydown leaks through ...
  inp.update(1 / 60);
  assert.equal(ui.pauses, 1, 'lock loss pauses');
  assert.ok(!inp.pressed('pause'), '... it cannot close the menu it just opened');
  inp.endStep(); inp.update(1 / 60);
  assert.equal(ui.pauses, 1, 'latched once');
  assert.deepEqual(events.map((e) => e[1].locked), [true, false]);
  inp.relock(); assert.equal(requested, 1, 'resume re-requests the lock');
  // no pause when the lock goes away during a cutscene / our own menu exit / ?test (lock disabled)
  for (const mode of ['cutscene', 'dialog', 'menu']) {
    ui.busy = false; ctx.game.mode = mode; inp._onPointerLockChange(true); inp._onPointerLockChange(false); inp.update(1 / 60);
  }
  assert.equal(ui.pauses, 1);
  ctx.game.mode = 'play'; ctx.levels.loading = true; inp._onPointerLockChange(true); inp._onPointerLockChange(false); inp.update(1 / 60);
  assert.equal(ui.pauses, 1, 'not while a level loads');
  ctx.levels.loading = false; inp.pointerLockEnabled = false; inp._onPointerLockChange(false); inp.update(1 / 60);
  assert.equal(ui.pauses, 1);
  inp.device = 'pad'; inp.pointerLockEnabled = true; inp.relock(); assert.equal(requested, 1, 'no relock for pad players');
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

const DEV_ENV = { DEV: true }, PROD_ENV = { DEV: false, PROD: true }, TEST_BUILD_ENV = { DEV: false, PROD: true, VITE_SWORDCAT_DEBUG: '1' };

test('parseParams: ?test fixes the seed; level/spawn/quality pass through (dev / build:test)', () => {
  for (const env of [DEV_ENV, TEST_BUILD_ENV]) {
    const p = parseParams('?test=1', env);
    assert.equal(p.test, true); assert.equal(p.seed, 1); assert.equal(p.debug, false); assert.equal(p.hooks, true);
    const q = parseParams('?debug&seed=99&level=forest&spawn=boss&quality=low', env);
    assert.equal(q.debug, true); assert.equal(q.seed, 99); assert.equal(q.level, 'forest'); assert.equal(q.spawn, 'boss'); assert.equal(q.quality, 'low');
    assert.equal(parseParams('?test=0', env).test, false);
  }
});

test('F4: a production build ignores ?test / ?debug / ?perf / ?level / ?spawn; seed, quality, mute and cam stay', () => {
  assert.equal(debugAllowed(DEV_ENV), true); assert.equal(debugAllowed(TEST_BUILD_ENV), true);
  assert.equal(debugAllowed(PROD_ENV), false); assert.equal(debugAllowed({ VITE_SWORDCAT_DEBUG: '0' }), false);
  assert.equal(debugAllowed(undefined), false); assert.equal(debugAllowed(null), false);
  const p = parseParams('?test=1&debug&perf&level=gate&spawn=boss&quality=low&mute&cam=classic', PROD_ENV);
  assert.equal(p.hooks, false);
  assert.equal(p.test, false); assert.equal(p.debug, false); assert.equal(p.perf, false);
  assert.equal(p.level, null); assert.equal(p.spawn, null);
  assert.notEqual(p.seed, 1, 'no fixed test seed in production (random)');
  assert.equal(p.quality, 'low'); assert.equal(p.mute, true); assert.equal(p.cam, 'classic');
  assert.equal(parseParams('?seed=42', PROD_ENV).seed, 42, '?seed stays');
  // the unit-test env (DEV false, no flag) behaves like production
  assert.equal(parseParams('?test=1').test, false);
});

test('F4 + §5.5: embed mode (framed + ?embed=1) never enables hooks, even in dev', () => {
  const p = parseParams('?embed=1&test=1&debug&level=forest', DEV_ENV, { framed: true });
  assert.equal(p.embed, true); assert.equal(p.hooks, false);
  assert.equal(p.test, false); assert.equal(p.debug, false); assert.equal(p.level, null);
  const top = parseParams('?embed=1&test=1', DEV_ENV, { framed: false });
  assert.equal(top.embed, false, 'not framed: not embed mode'); assert.equal(top.test, true);
});

test('F4: Game gates the debug.js import on a compile-time constant (dropped from production bundles)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/core/Game.js', import.meta.url), 'utf8');
  assert.match(src, /const HOOKS_BUILD = !!\(import\.meta\.env\.DEV \|\| import\.meta\.env\.VITE_SWORDCAT_DEBUG === '1'\)/);
  assert.match(src, /if \(HOOKS_BUILD && params\.hooks && /);
  assert.equal((src.match(/import\('\.\/debug\.js'\)/g) ?? []).length, 1, 'one guarded debug import');
});

// ---- M2 integration (core): adopted tuning tables, disposeInstance, token share
import * as CONFIG from '../../src/core/config.js';
import { COMBAT as COMBAT_RE } from '../../src/combat/attacks.js';
import { TUNING as ENEMY_TUNING_RE } from '../../src/enemies/tuning.js';
import { PHYSICS_DEFAULTS } from '../../src/physics/Physics.js';
import { disposeInstance } from '../../src/core/Assets.js';

test('M2 config: COMBAT / ENEMY_TUNING / PHYSICS live in config; the area modules re-export the same objects', () => {
  assert.equal(COMBAT_RE, CONFIG.COMBAT);
  assert.equal(ENEMY_TUNING_RE, CONFIG.ENEMY_TUNING);
  assert.equal(PHYSICS_DEFAULTS, CONFIG.PHYSICS);
  assert.ok(Object.isFrozen(CONFIG.COMBAT) && Object.isFrozen(CONFIG.ENEMY_TUNING) && Object.isFrozen(CONFIG.PHYSICS));
  assert.equal(CONFIG.COMBAT.antiMultiHit, 0.12);
  assert.equal(CONFIG.ENEMY_TUNING.windupMin, 0.45);
  assert.equal(CONFIG.PHYSICS.walkableNormalY, 0.7);
  for (const k of ['splashReturnDist', 'splashClearRadius', 'splashCooldown', 'splashLockMin', 'splashLockMax', 'comboGrace'])
    assert.equal(typeof CONFIG.PLAYER[k], 'number', `PLAYER.${k}`);
});

test('M2 Assets.disposeInstance: frees cloned skeletons and owned material clones only, detaches', () => {
  const root = new THREE.Group(), parent = new THREE.Group();
  parent.add(root);
  const bone = new THREE.Bone();
  const shared = new THREE.MeshBasicMaterial(), owned = new THREE.MeshBasicMaterial();
  owned.userData.assetOwned = true;
  const sk = new THREE.SkinnedMesh(new THREE.BufferGeometry(), owned);
  sk.add(bone); sk.bind(new THREE.Skeleton([bone]));
  const plain = new THREE.Mesh(new THREE.BufferGeometry(), shared);
  root.add(sk, plain);
  let skDisposed = 0, ownedDisposed = 0, sharedDisposed = 0;
  sk.skeleton.dispose = () => { skDisposed++; };
  owned.addEventListener('dispose', () => ownedDisposed++);
  shared.addEventListener('dispose', () => sharedDisposed++);
  disposeInstance(root);
  assert.equal(skDisposed, 1); assert.equal(ownedDisposed, 1); assert.equal(sharedDisposed, 0);
  assert.equal(root.parent, null);
  disposeInstance(null);   // no-op
});

test('Input (iso): §6.1 jitter is not activity (net px over a window), §2.7 the Meme Cam exits only past exitPx', async () => {
  const { CAMERA } = await import('../../src/core/config.js');
  const game = { mode: 'play' };
  const inp = new Input({ params: {}, game });
  inp._pointerAt(200, 200, false);
  // a resting hand: ±1 px every 16 ms for half a second
  for (let i = 0; i < 30; i++) { inp._pointerAt(200 + (i % 2), 200, true); }
  assert.equal(inp._activity, false, '1 px jitter at mouse rate is idle');
  inp._pointerAt(240, 200, true);
  assert.equal(inp._activity, true, 'a 40 px move is activity');
  inp.update(1 / 60);
  // Meme Cam: a 30 px nudge does not exit, crossing exitPx from where the cursor rested does
  game.mode = 'memecam'; inp._activity = false; inp._ptrHist.length = 0;
  inp._pointerAt(270, 200, true);
  assert.equal(inp._activity, false, '30 px < exitPx keeps the Meme Cam');
  inp._pointerAt(240 + CAMERA.iso.meme.exitPx + 1, 200, true);
  assert.equal(inp._activity, true, '≥ exitPx from the mark exits');
  assert.ok(inp.pointerSince(inp.pointerMark()) === 0);
  game.mode = 'play'; inp.update(1 / 60); assert.equal(inp._memeMark, null);
});

test('Input: the canvas rect is cached (no layout read per mousemove) until a resize', () => {
  const inp = new Input({ params: {} });
  let reads = 0;
  inp.canvas = { getBoundingClientRect: () => { reads++; return { left: 0, top: 0, width: 100, height: 100 }; } };
  for (let i = 0; i < 10; i++) inp._pointerAt(i, i, true);
  assert.equal(reads, 1);
  inp._rect = null; inp._pointerAt(50, 50, true);
  assert.equal(reads, 2); assert.equal(inp.pointer.ndcX, 0);
});

test('§7.2 core surface: smoothDamp never overshoots and converges; smoothDamp2 caps the radial rate', async () => {
  const { smoothDamp, smoothDamp2 } = await import('../../src/core/math.js');
  const s = { v: 0 }; let x = 0;
  for (let i = 0; i < 600; i++) { x = smoothDamp(x, 10, s, 0.3, 1 / 60); assert.ok(x <= 10 + 1e-9, 'no overshoot'); }
  assert.ok(Math.abs(x - 10) < 1e-3);
  const s1 = { v: 0 }; const y = smoothDamp(0, 100, s1, 0.5, 1 / 60, 2);
  assert.ok(y > 0 && y <= 2 / 60 + 1e-6, 'vmax respected');
  const o = { x: 0, z: 0 }, v = { vx: 0, vz: 0 };
  for (let i = 0; i < 30; i++) smoothDamp2(o, 100, 100, v, 0.5, 1 / 60, 3);
  assert.ok(Math.hypot(o.x, o.z) <= 3 * 0.5 + 1e-6, 'radial cap');
  for (let i = 0; i < 2000; i++) smoothDamp2(o, 1, 2, v, 0.2, 1 / 60);
  assert.ok(Math.abs(o.x - 1) < 1e-3 && Math.abs(o.z - 2) < 1e-3);
});

test('§7.2 core surface: every(game, hz, phase) is deterministic on stepCount; depthFor shares one material per kind', async () => {
  const { every } = await import('../../src/core/schedule.js');
  const { depthFor } = await import('../../src/core/depth.js');
  let n = 0; for (let i = 0; i < 60; i++) if (every({ stepCount: i }, 20)) n++;
  assert.equal(n, 20);
  assert.equal(every({ stepCount: 5 }, 0), false);
  assert.notEqual(every({ stepCount: 0 }, 10, 0), every({ stepCount: 0 }, 10, 1));
  const a = depthFor(new THREE.Mesh()), b = depthFor(new THREE.Mesh()), c = depthFor(new THREE.InstancedMesh(undefined, undefined, 1));
  assert.equal(a, b); assert.notEqual(a, c); assert.ok(a.isMeshDepthMaterial);
});

test('§7.2 prewarm: compiles hidden roots in batches and restores visibility; uViewport is a shared Vector2', async () => {
  const { prewarm } = await import('../../src/core/prewarm.js');
  const { uViewport } = await import('../../src/core/uniforms.js');
  let compiles = 0, renders = 0;
  const r = { extensions: { has: () => false }, compile: () => { compiles++; }, render: () => { renders++; }, shadowMap: {} };
  const roots = [0, 1, 2, 3, 4].map(() => new THREE.Group()); roots[4].visible = false;
  await prewarm(r, new THREE.Scene(), new THREE.PerspectiveCamera(), roots, { batch: 2 });
  assert.equal(compiles, 2); assert.equal(renders, 1);
  assert.deepEqual(roots.map((o) => o.visible), [true, true, true, true, false]);
  assert.equal(r.shadowMap.needsUpdate, true);
  assert.ok(uViewport.value.isVector2);
});

// ------------------------------------------------------------------ S1 / S3 / Phase W core tasks (PERF C1–C18, ART core)
test('PERF §4.1 Loop: Low caps at 3 steps, the remainder is dropped (capHits), the frame-cap gate skips rAFs', async () => {
  const { loopStepsFor } = await import('../../src/core/Game.js');
  assert.equal(loopStepsFor('low'), 3); assert.equal(loopStepsFor('med'), 4); assert.equal(loopStepsFor('high'), 4);
  let steps = 0;
  const loop = new Loop(null, { maxSteps: loopStepsFor('low'), update: () => steps++, render: () => {} });
  loop.advance(0.1);
  assert.equal(steps, 3); assert.equal(loop.acc, 0); assert.equal(loop.capHits, 1); assert.equal(loop.stepsThisFrame, 3);
  steps = 0; loop.advance(2 / 60 + 1e-4);
  assert.equal(steps, 2); assert.equal(loop.capHits, 1, 'no cap hit under the cap');
  // gate: every second rAF renders (a 60 cap on a 120 Hz display)
  let renders = 0, k = 0;
  const g = new Loop(null, { update: () => {}, render: () => renders++, gate: () => (++k % 2) === 0 });
  for (let i = 0; i < 10; i++) g.tick(i * 8.33);
  assert.equal(renders, 5);
});

test('PERF §5.3 frame cap: divisor per refresh and cap; Pacing detects the refresh from 60 rAFs', async () => {
  const { capDivisor, Pacing } = await import('../../src/core/pacing.js');
  assert.equal(capDivisor(60, 60), 1); assert.equal(capDivisor(90, 60), 1, '90 Hz renders every rAF');
  assert.equal(capDivisor(120, 60), 2); assert.equal(capDivisor(144, 60), 2, '144 → 72 fps');
  assert.equal(capDivisor(60, 30), 2); assert.equal(capDivisor(120, 30), 4); assert.equal(capDivisor(144, 0), 1, 'uncapped');
  const p = new Pacing({ min: 0.7, max: 1, step: 0.05 });
  p.setCap({ setting: 'auto', presetCap: 60 });
  let rendered = 0;
  for (let i = 0; i < 120; i++) if (p.gate(1000 / 120)) rendered++;
  assert.equal(p.refreshHz, 120); assert.equal(p.divisor, 2);
  assert.ok(rendered >= 89 && rendered <= 91, `first 60 render, then every 2nd (${rendered})`);
  p.setCap({ setting: 'off' }); assert.equal(p.divisor, 1);
  p.setCap({ setting: 30 }); assert.equal(p.cap, 30); assert.equal(p.divisor, 4);
  p.setCap({ setting: 'auto', batterySaver: true }); assert.equal(p.cap, 30, 'battery saver = 30 fps lock');
});

test('PERF §5.2 dynamic resolution: down after 1 s slow, ≤ 1 change / 2 s, floor; GPU up after 3 s; rAF probe backs off', async () => {
  const { Pacing } = await import('../../src/core/pacing.js');
  const dt = 1 / 60;
  const run = (p, sec, frameMs, gpu = null) => { const out = []; for (let i = 0; i < Math.round(sec * 60); i++) { const s = p.sample(dt, frameMs, gpu, 5); if (s != null) out.push(+s.toFixed(2)); } return out; };
  const p = new Pacing({ min: 0.7, max: 1, step: 0.05 });
  assert.deepEqual(run(p, 0.9, 20), [], 'not before the 1 s hold');
  const downs = run(p, 6, 20);
  assert.equal(downs[0], 0.95);
  assert.ok(downs.length <= 3, `≤ 1 change per 2 s (${downs})`);
  run(p, 30, 20);
  assert.equal(p.scale, 0.7, 'never below the floor');
  // GPU timer: up one step after 3 s under 9 ms
  const g = new Pacing({ min: 0.8, max: 1, step: 0.05 }); g.scale = 0.8;
  assert.deepEqual(run(g, 2.5, 16.7, 5), []);
  assert.deepEqual(run(g, 1, 16.7, 5), [0.85]);
  // no timer: probe up every 5 s; a slow probe steps back and doubles the interval
  const q = new Pacing({ min: 0.7, max: 1, step: 0.05 }); q.scale = 0.8;
  assert.deepEqual(run(q, 5.1, 16.7), [0.85]);
  const back = run(q, 2, 25);
  assert.deepEqual(back, [0.8]); assert.equal(q.probeInterval, 10);
  q.resetProbe(); assert.equal(q.probeInterval, 5);
  // disabled (?test): frozen
  const f = new Pacing(); f.enabled = false; assert.deepEqual(run(f, 5, 30), []); assert.equal(f.scale, 1);
  assert.equal(f.force(0.5), 0.7, 'force clamps into the preset range');
});

test('PERF §5.4 thermal ladder: rungs every 10 s at the floor, then the 30 fps lock and its retry', async () => {
  const { Pacing } = await import('../../src/core/pacing.js');
  const p = new Pacing({ min: 0.7, max: 1, step: 0.05 }); p.scale = 0.7;
  const tick = (sec, ms, work = 20) => { for (let i = 0; i < Math.round(sec * 60); i++) p.sample(1 / 60, ms, null, work); };
  tick(10.1, 20); assert.equal(p.thermalRung, 1); assert.equal(p.grassScale, 0.5); assert.equal(p.particleScale, 1);
  assert.equal(p.takeThermalChange(), true); assert.equal(p.takeThermalChange(), false);
  tick(10, 20); assert.equal(p.thermalRung, 2); assert.equal(p.particleScale, 0.5);
  tick(10, 20); assert.equal(p.thermalRung, 3); assert.equal(p.outlineCap, 'hero');
  tick(19, 20); assert.equal(p.lock30, false);
  tick(2, 20); assert.equal(p.lock30, true); assert.equal(p.cap, 30);
  tick(110, 20, 5); assert.equal(p.lock30, true, 'retry only after 120 s');
  tick(12, 33, 5); assert.equal(p.lock30, false, 'cool work for 30 s → back to 60');
});

test('S1 renderer helpers: canvas MSAA on every tier, Neutral tone mapping, ?perf flag, FXAA path only for med+fxaa', async () => {
  const { wantsCanvasAA, toneMappingOf } = await import('../../src/core/Game.js');
  const { usesFxaaPath, pickAutoQuality } = await import('../../src/core/PostFX.js');
  for (const q of [null, 'auto', 'low', 'med', 'high']) assert.equal(wantsCanvasAA(q), true, `AA on for ${q} (RENDER.medAA canvas)`);
  assert.equal(toneMappingOf('neutral'), THREE.NeutralToneMapping); assert.equal(toneMappingOf(undefined), THREE.NeutralToneMapping);
  assert.equal(usesFxaaPath({ id: 'med' }, 'fxaa'), true); assert.equal(usesFxaaPath({ id: 'high' }, 'fxaa'), false);
  assert.equal(usesFxaaPath({ id: 'med' }, 'canvas'), false);
  assert.equal(parseParams('?perf', DEV_ENV).perf, true); assert.equal(parseParams('', DEV_ENV).perf, false);
  // PERF §2 auto: phones low (coarse + short side ≤ 500, or ≤ 4 GB), software low, discrete high, else med
  assert.equal(pickAutoQuality(null, { coarse: true, minSide: 390 }), 'low');
  assert.equal(pickAutoQuality(null, { deviceMemory: 4 }), 'low');
  assert.equal(pickAutoQuality(null, { coarse: true, minSide: 800, deviceMemory: 8 }), 'med');
  const gpu = (name) => ({ getContext: () => ({ getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }), getParameter: () => name }) });
  assert.equal(pickAutoQuality(gpu('ANGLE (NVIDIA GeForce RTX 3060)')), 'high');
  assert.equal(pickAutoQuality(gpu('ANGLE (Intel(R) Iris(R) Xe Graphics)')), 'med');
  assert.equal(pickAutoQuality(gpu('Google SwiftShader')), 'low');
});

/** A renderer stand-in for PostFX (no WebGL). */
function stubRenderer() {
  const size = new THREE.Vector2(1, 1);
  return {
    pr: 1, shadowMap: { enabled: true, type: 0 }, info: { render: { calls: 0, triangles: 0 } }, toneMappingExposure: 1, renders: 0,
    setPixelRatio(d) { this.pr = d; }, getPixelRatio() { return this.pr; },
    setSize(w, h) { size.set(Math.round(w * this.pr), Math.round(h * this.pr)); }, getDrawingBufferSize(v) { return v.copy(size); },
    render() { this.renders++; this.info.render.calls += 3; }, getRenderTarget: () => null, setRenderTarget() {}, compile() {},
    extensions: { has: () => false },
  };
}

test('K1 / X1 / X2 PostFX: play is direct to the canvas on every tier; cinematic chain only on High; bloom recorded', async () => {
  const { PostFX } = await import('../../src/core/PostFX.js');
  const { EventBus } = await import('../../src/core/EventBus.js');
  const { uViewport } = await import('../../src/core/uniforms.js');
  const r = stubRenderer();
  const ctx = { renderer: r, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), bus: new EventBus(), state: new GameState() };
  const pf = new PostFX(ctx);
  pf.setSize(800, 600);
  for (const q of ['low', 'med']) {
    pf.setQuality(q);
    assert.equal(pf.setCinematic(true), false, `${q}: cinematic is recorded only`);
    assert.equal(pf.chain, null); assert.equal(pf.composerActive, false); assert.equal(pf.composer, null);
    pf.update(1 / 60); pf.render();
    assert.equal(pf.path, 'canvas'); assert.equal(pf.sceneStats.calls, 3);
    pf.setCinematic(false);
  }
  pf.setQuality('med'); assert.equal(r.shadowMap.enabled, true, 'med: sun shadows');
  pf.setQuality('low'); assert.equal(r.shadowMap.enabled, false, 'low: no shadow map (K3)');
  // bloom is a request in play: recorded, capped by reduceFlashes, reset to the cinematic base
  pf.setBloom(1.1); assert.equal(pf.bloom, 1.1); assert.equal(pf.bloomRendered, 0);
  ctx.state.settings.reduceFlashes = true; pf.setBloom(1.1); assert.equal(pf.bloom, 0.8);
  pf.resetBloom(); assert.equal(pf.bloom, 0.6);
  pf.setVignette(2, 1); assert.deepEqual(pf.vignette, { darkness: 2, offset: 1 });
  // uViewport follows every resize and pixel-ratio step in the same call
  pf.setQuality('med'); pf.setSize(1000, 500);
  assert.deepEqual(uViewport.value.toArray(), [Math.round(1000 * r.pr), Math.round(500 * r.pr)]);
  const s = pf.setScale(0.8);
  assert.equal(s, 0.8); assert.deepEqual(uViewport.value.toArray(), [Math.round(1000 * r.pr), Math.round(500 * r.pr)]);
  assert.equal(pf.setScale(0.1), 0.7, 'Med floor 0.7');
  assert.deepEqual(pf.warmTargets(), [null], 'med: canvas variants only');
});

test('ActorRegistry.queryRadiusTyped: kind bits (faction + tags), alive mask, shared scratch, no closures', async () => {
  const { KIND, hostileMask, kindBits } = await import('../../src/core/ActorRegistry.js');
  const reg = new ActorRegistry();
  const mk = (faction, x, tags = []) => { const a = new Actor(null, { faction }); a.pos.set(x, 0, 0); for (const t of tags) a.tags.add(t); reg.register(a); return a; };
  const p = mk('player', 0), e1 = mk('enemy', 2), e2 = mk('enemy', 4, ['boss']), k = mk('ally', 1, ['kitten']), far = mk('enemy', 40);
  e1.alive = false;
  const at = { x: 0, z: 0 };
  assert.deepEqual(reg.queryRadiusTyped(at, 5, KIND.enemy), [e1, e2]);
  assert.deepEqual(reg.queryRadiusTyped(at, 5, KIND.enemy | KIND.alive), [e2]);
  assert.deepEqual(reg.queryRadiusTyped(at, 5, KIND.boss), [e2]);
  assert.deepEqual(reg.queryRadiusTyped(at, 5, hostileMask('enemy')), [p, k]);
  assert.equal(reg.queryRadiusTyped(at, 5, KIND.kitten)[0], k);
  assert.equal(kindBits(e2) & KIND.boss, KIND.boss); assert.equal(kindBits(e2, false) & KIND.boss, 0);
  const out = []; assert.equal(reg.queryRadiusTyped(at, 100, KIND.enemy, out), out); assert.equal(out.length, 3); void far;
  // C13: scratch fields exist from construction (stable hidden class)
  for (const f of ['_physSep', '_sepX', '_sepZ', '_tier', '_tierFrame', '_mixAcc']) assert.ok(f in p, f);
});

test('PERF §11 A5 Input: pads are read every frame only while one is live; a probe finds stub pads; numeric prev state', () => {
  const ctx = { state: new GameState(), bus: null, params: {} };
  const inp = new Input(ctx);
  let calls = 0, pad = null;
  const nav = globalThis.navigator;
  const stub = { getGamepads: () => { calls++; return pad ? [pad] : []; } };
  Object.defineProperty(globalThis, 'navigator', { value: stub, configurable: true, writable: true });
  try {
    for (let i = 0; i < 30; i++) inp.poll(1 / 60);
    assert.equal(calls, 2, 'no pad: probe every 15th frame only');
    pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 2, value: i === 2 ? 1 : 0 })) };
    for (let i = 0; i < 15; i++) inp.poll(1 / 60);
    assert.equal(inp._padLive, true); assert.equal(inp.down('attack'), true, 'pad X → attack');
    const c0 = calls; inp.poll(1 / 60); inp.poll(1 / 60); assert.equal(calls - c0, 2, 'live: every frame');
    assert.ok(inp._padPrev instanceof Uint8Array && inp._padBind.length > 0);
    pad.buttons[2] = { pressed: false, value: 0 }; inp.poll(1 / 60);
    assert.equal(inp.down('attack'), false);
    pad = null; inp.poll(1 / 60); assert.equal(inp._padLive, false); assert.equal(inp.padConnected, false);
  } finally { Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true }); }
});

test('PERF §12 perf.js: rings, percentiles, budget column, report shape; pool misses count', async () => {
  const { PerfMonitor, percentile, budgetFor, countPoolMiss, counters, PERF_CATS } = await import('../../src/core/perf.js');
  assert.equal(percentile(new Float32Array([5, 1, 3, 2, 4]), 5, 0.5), 3);
  assert.deepEqual(budgetFor('low', 'I1'), { stage: 'I1', frameCalls: 70, heapMB: 90, titleHeapMB: 60 });
  assert.deepEqual(budgetFor('high', 'End'), { stage: 'End', sceneCalls: 90, tris: 260000, heapMB: 120, titleHeapMB: 60 });
  assert.deepEqual(PERF_CATS, ['hero', 'enemies', 'companions', 'grass', 'props', 'fx', 'ui3d']);
  const r = stubRenderer(); r.info.programs = [1, 2]; r.info.memory = { geometries: 3, textures: 4 };
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const hero = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); hero.userData.perfCat = 'hero'; hero.position.z = -5; scene.add(hero);
  const behind = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); behind.userData.perfCat = 'enemies'; behind.position.z = 20; scene.add(behind);
  scene.updateMatrixWorld(true);
  const game = { ctx: { renderer: r, scene, camera: cam, postfx: null }, loop: { stepsLastFrame: 2, capHits: 0 } };
  const m = new PerfMonitor(game, { detailed: true });
  for (let i = 0; i < 10; i++) { m.beginFrame(); m.endFrame(1, 2, 3, i % 3); }
  m.sys('player', 0.5);
  const rep = m.report();
  assert.equal(rep.frame.n, 10); assert.equal(rep.steps.max, 2); assert.equal(rep.programs, 2); assert.equal(rep.stage, 'I1');
  assert.equal(rep.cpu.sim, 1); assert.equal(rep.cpu.bySystem.player, 0.5);
  assert.equal(rep.byCat.hero, 1); assert.equal(rep.byCat.enemies, 0, 'off-frustum objects add no draws');
  const c0 = counters.poolMisses; countPoolMiss(); assert.equal(counters.poolMisses, c0 + 1);
  m.reset(); assert.equal(m.report().frame.n, 0); assert.equal(counters.poolMisses, 0);
});

test('ART §11.1 pixel metrics match art2_frame_stats.py; fog HSV saturation', async () => {
  const { pixelStats, hsvSat } = await import('../../src/core/debug.js');
  const s = pixelStats(1, 0.5, 0.25);
  assert.ok(Math.abs(s.luma - (0.2126 + 0.7152 * 0.5 + 0.0722 * 0.25)) < 1e-9);
  assert.equal(s.chroma, 0.75); assert.equal(s.warmth, 0.75);
  assert.ok(Math.abs(hsvSat(new THREE.Color('#F6E4C0')) - (0xF6 - 0xC0) / 0xF6) < 1e-3);
  assert.equal(hsvSat(new THREE.Color('#B7B7B7')), 0);
});

test('core.W3 + PERF §10.1: the first frame and every fade are warm (cream fade, warm clear, splash markup)', async () => {
  const fs = await import('node:fs');
  const { FADE_COLOR, RENDER } = await import('../../src/core/config.js');
  assert.equal(FADE_COLOR, '#FFF1DE');
  assert.equal(RENDER.background, '#F6E4C0');
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="splash"/); assert.doesNotMatch(html, /#B7C0C3/i, 'no grey first paint');
  assert.match(html, /nunito-latin-wght-normal\.woff2/, 'Token Tails body font preloaded'); assert.match(html, /Fredoka/, 'Fredoka stays a fallback');
  assert.doesNotMatch(html, /cinzel|uncial|medievalsharp/i, 'X18: no medieval display fonts');
  const game = fs.readFileSync(new URL('../../src/core/Game.js', import.meta.url), 'utf8');
  assert.doesNotMatch(game, /#B7C0C3|#000000|'black'/i, 'Game.js has no grey / black clear or fade');
});

test('X2 PostChain: High cinematic = scene + prefilter + 2 down + 2 up + uber (7 draws); fades in and out; grades are uniforms', async () => {
  const { PostFX } = await import('../../src/core/PostFX.js');
  const { PostChain } = await import('../../src/core/postfx/PostChain.js');
  const { EventBus } = await import('../../src/core/EventBus.js');
  const r = stubRenderer();
  const chain = new PostChain(r, { bloom: true, samples: 4, bloomMips: 3 });
  chain.setSize(1280, 720);
  assert.deepEqual([chain.rt0.width, chain.rt0.height], [1280, 720]);
  assert.deepEqual(chain.mipRT.map((t) => t.width), [640, 320, 160]);
  r.renders = 0; chain.render(new THREE.Scene(), new THREE.PerspectiveCamera(), 0.8);
  assert.equal(r.renders, 7, 'PERF §6.1: 7 draws');
  assert.deepEqual([chain.rt0.viewport.z, chain.rt0.viewport.w], [1024, 576], 'dyn-res sub-rect, no reallocation');
  assert.equal(chain.rt0.width, 1280);
  assert.equal(chain.materials.length, 4);
  assert.ok('USE_BLOOM' in chain.uber.defines && !('USE_FXAA' in chain.uber.defines));
  const fx = new PostChain(r, { bloom: false, fxaa: true, samples: 0, hdr: false });
  assert.equal(fx.materials.length, 1); assert.ok('USE_FXAA' in fx.uber.defines);
  r.renders = 0; fx.render(new THREE.Scene(), new THREE.PerspectiveCamera()); assert.equal(r.renders, 2, 'Med FXAA fallback: 2 draws');
  chain.dispose(); fx.dispose();

  const ctx = { renderer: r, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), bus: new EventBus(), state: new GameState() };
  const pf = new PostFX(ctx);
  pf.setSize(640, 360); pf.setQuality('high');
  assert.equal(pf.chain, null, 'built lazily on the first request');
  assert.equal(pf.setCinematic(true, { dur: 0.5, grade: 'gold' }), true);
  assert.ok(pf.chain && pf.composerActive);
  assert.equal(pf.bloomRendered, 0, 'starts at strength 0 (seamless)');
  for (let i = 0; i < 30; i++) pf.update(1 / 60);
  assert.ok(pf.bloomRendered > 0.5 && pf.bloomRendered <= 0.6 + 1e-9, `faded in (${pf.bloomRendered})`);
  assert.equal(pf.chain.uber.uniforms.uSat.value, CONFIG.RENDER.cinematic.grades.gold[0]);
  r.renders = 0; pf.render(); assert.equal(r.renders, 7); assert.equal(pf.path, 'cinematic');
  pf.setCinematic(false, { dur: 0.5 });
  assert.equal(pf.composerActive, true, 'stays on through the hand-back fade');
  for (let i = 0; i < 40; i++) pf.update(1 / 60);
  assert.equal(pf.composerActive, false); assert.equal(pf.path, 'canvas');
  assert.equal(pf.warmTargets().length, 2, 'High warms the canvas and the cinematic RT variants');
  pf.setQuality('med'); assert.equal(pf.chain, null, 'leaving High frees the chain');
});

test('perf GpuTimer: results 3 frames late keep updating (no deadlock at the pending cap); disjoint / stale -> null', async () => {
  const { GpuTimer } = await import('../../src/core/perf.js');
  let frame = 0, disjoint = false, lagFrames = 3, nextId = 0;
  const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
  const gl = {
    QUERY_RESULT_AVAILABLE: 10, QUERY_RESULT: 11,
    getExtension: () => ext,
    createQuery: () => ({ id: nextId++, ended: -1, ns: 0 }),
    deleteQuery() {},
    beginQuery(_t, q) { this._q = q; },
    endQuery() { this._q.ended = frame; this._q.ns = (5 + frame) * 1e6; },
    getParameter: (p) => (p === ext.GPU_DISJOINT_EXT ? disjoint : null),
    getQueryParameter: (q, p) => (p === 10 ? frame - q.ended >= lagFrames : q.ns),
  };
  const t = new GpuTimer(gl);
  assert.equal(t.available, true);
  const step = () => { t.begin(); t.end(); frame++; };
  const seen = new Set();
  for (let i = 0; i < 40; i++) { step(); if (t.lastMs != null) seen.add(t.lastMs); }
  assert.ok(seen.size > 30, `lastMs must keep changing, saw ${seen.size} values`);
  assert.ok(t.lastMs >= 5 + 40 - 1 - lagFrames - 1, `fresh result, got ${t.lastMs}`);
  assert.ok(t._pending.length <= GpuTimer.MAX_PENDING);
  // Results slower than the in-flight cap (cap hit every frame) must still drain once they land.
  lagFrames = 8; for (let i = 0; i < 30; i++) step();
  const v = t.lastMs; assert.ok(v != null);
  lagFrames = 3; for (let i = 0; i < 10; i++) step();
  assert.notEqual(t.lastMs, v);
  // Disjoint invalidates.
  disjoint = true; step(); step(); assert.equal(t.lastMs, null);
  disjoint = false; for (let i = 0; i < 6; i++) step(); assert.ok(t.lastMs != null);
  // Stale: results never become available -> null after STALE_FRAMES.
  lagFrames = 1e9; for (let i = 0; i < GpuTimer.STALE_FRAMES + 2; i++) step();
  assert.equal(t.lastMs, null);
  // No extension: inert.
  const none = new GpuTimer({ getExtension: () => null }); none.begin(); none.end(); assert.equal(none.lastMs, null);
});

// ------------------------------------------------------------------ PERF §1.2: the uber-program linker (core/uber.js)
import { UberGroup, topLevel, parseDecl, stripComments, uberPrepare } from '../../src/core/uber.js';
import { SHADOW_ONLY_LAYER, shadowOnly, depthFor } from '../../src/core/depth.js';

const U_LIB = 'float uberLib( float x ) { return x * 2.0; }';
const modA = {
  name: 'a', side: THREE.FrontSide,
  vertexShader: 'attribute vec4 iCol;\nvarying vec4 vCol;\nvarying vec2 vUv;\nuniform float uSize;\nvoid main() { vCol = iCol; vUv = uv; gl_Position = vec4( position * uSize, 1.0 ); }',
  fragmentShader: `varying vec4 vCol;\nvarying vec2 vUv;\nuniform vec3 uColor;\n${U_LIB}\nconst float K = 0.5;\nfloat shade( float v ) { return v * K; }\nvoid main() { gl_FragColor = vec4( uColor * shade( uberLib( vUv.x ) ), vCol.a ); }`,
};
const modB = {
  name: 'b', side: THREE.BackSide, fog: false,
  vertexShader: 'attribute vec4 aOther;\nattribute vec2 aSeed;\nvarying vec4 vX;\nvoid main() { vX = aOther + vec4( aSeed, 0.0, 0.0 ); gl_Position = vec4( position, 1.0 ); }',
  fragmentShader: `varying vec4 vX;\nuniform vec3 uColor;\nuniform sampler2D uTex;\n${U_LIB}\nfloat shade( float v ) { return v; }\nvoid main() { gl_FragColor = vec4( uColor, uberLib( vX.x ) ) * texture2D( uTex, vX.xy ); }`,
};
const modI = {
  name: 'inst',
  vertexShader: 'attribute float aAlpha;\nvarying float vA;\nvoid main() { vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 ); }',
  fragmentShader: 'varying float vA;\nvoid main() { gl_FragColor = vec4( 1.0, 1.0, 1.0, vA ); }',
};

test('uber linker: top-level GLSL split + declarations', () => {
  const items = topLevel(stripComments('#include <common>\n// c\nuniform vec3 a, b[2];\nstruct S { float x; };\nfloat f( vec2 p ) { return p.x; }\nvoid main() { }'));
  assert.deepEqual(items.map((i) => i.kind), ['pp', 'decl', 'struct', 'func', 'func']);
  const d = parseDecl('uniform highp vec3 uA, uB[4];');
  assert.equal(d.storage, 'uniform'); assert.equal(d.type, 'vec3'); assert.deepEqual(d.names.map((n) => n.name + n.arr), ['uA', 'uB[4]']);
});

test('uber linker: ONE source for every module; names namespaced, varyings / attributes on shared slots, libs once', () => {
  const g = new UberGroup('t1', { libs: [U_LIB] });
  const a = g.module(modA), b = g.module(modB);
  assert.equal(g.module(modA), a, 'same source → same module');
  const ma = g.material(a, { uniforms: { uColor: { value: new THREE.Color(1, 0, 0) }, uSize: { value: 2 } }, transparent: true });
  const mb = g.material(b, { uniforms: { uColor: { value: new THREE.Color(0, 1, 0) }, uTex: { value: null } } });
  assert.equal(ma.vertexShader, mb.vertexShader); assert.equal(ma.fragmentShader, mb.fragmentShader);
  const fs = ma.fragmentShader, vs = ma.vertexShader;
  assert.equal(fs.split('float uberLib(').length - 1, 1, 'shared lib hoisted once');
  assert.ok(fs.includes(`#define uColor ${a.prefix}uColor`) && fs.includes(`#define uColor ${b.prefix}uColor`), 'per-module uniform names');
  assert.ok(fs.includes(`#define shade ${a.prefix}shade`) && fs.includes(`#define shade ${b.prefix}shade`), 'per-module functions');
  assert.ok(/#undef uColor/.test(fs), 'macros undone after each block');
  // module A: 2 varyings (vec4, vec2), B: 1 vec4 → slots: vec4 ×1, vec2 ×1 (B reuses A's vec4 register)
  assert.equal((vs.match(/varying vec4 fxv_vec4_\d+;/g) ?? []).length, 1);
  assert.equal((vs.match(/varying vec2 fxv_vec2_\d+;/g) ?? []).length, 1);
  assert.equal((vs.match(/attribute vec4 fxa_vec4_\d+;/g) ?? []).length, 1, 'iCol and aOther share one vec4 attribute slot');
  // uniforms: the module's own object, the linked name a live getter onto it
  assert.equal(ma.uniforms.fxMode.value, a.index); assert.equal(mb.uniforms.fxMode.value, b.index);
  assert.equal(ma.uniforms[a.prefix + 'uColor'], ma.uniforms.uColor);
  ma.uniforms.uColor = { value: new THREE.Color(0, 0, 1) };
  assert.equal(ma.uniforms[a.prefix + 'uColor'], ma.uniforms.uColor, 'a replaced entry stays linked');
  // per-module flags that would otherwise split programs
  assert.ok(ma.side === THREE.DoubleSide && mb.side === THREE.DoubleSide && ma.forceSinglePass && ma.fog && mb.fog);
  assert.ok(fs.includes(`if ( fxMode == ${a.index} ) { if ( ! gl_FrontFacing ) discard;`), 'FrontSide module discards back faces');
  assert.ok(fs.includes(`if ( fxMode == ${b.index} ) { if ( gl_FrontFacing ) discard;`), 'BackSide module discards front faces');
  assert.ok(fs.includes(`#define FXU_FOG_${b.index}`), 'fog:false module runs with USE_FOG undefined');
  assert.equal(mb.blending, THREE.NoBlending, 'an opaque module draws unblended (three keys `opaque` otherwise)');
  // samplers of the other modules get a value at compile (no stale unit 0 → no INVALID_OPERATION draws)
  const sh = { uniforms: ma.uniforms, vertexShader: vs, fragmentShader: fs };
  ma.onBeforeCompile(sh, null);
  assert.ok(sh.uniforms[b.prefix + 'uTex']?.value?.isTexture, 'blank texture for module B\'s sampler on A');
  assert.equal(g.sealed, g.version, 'the first compile seals the group');
});

test('uber linker: clone keeps the links; instanced modules live in the vertex USE_INSTANCING variant only', () => {
  const g = new UberGroup('t2');
  const a = g.module(modA), i = g.module(modI);
  assert.equal(i.instanced, true, 'reads instanceMatrix → instanced');
  const m = g.material(a, { uniforms: { uColor: { value: new THREE.Color() }, uSize: { value: 1 } } });
  const c = m.clone();
  assert.ok(c.isUberMaterial && c.userData.uber.mod === a);
  assert.notEqual(c.uniforms.uColor, m.uniforms.uColor, 'own uniforms');
  assert.equal(c.uniforms[a.prefix + 'uColor'], c.uniforms.uColor, 'linked names rebuilt on the clone');
  assert.ok(!Object.keys(JSON.parse(JSON.stringify(c.userData))).includes('uber'), 'the group record is never serialised');
  const { vertexShader: vs, fragmentShader: fs } = g.source();
  assert.ok(vs.includes(`#ifdef USE_INSTANCING\n// ---- module ${i.index}`), 'instanced vertex block guarded');
  assert.ok(vs.includes(`#ifndef USE_INSTANCING\n// ---- module ${a.index}`), 'plain vertex block guarded');
  assert.ok(!fs.includes('#ifdef USE_INSTANCING\n// ---- module'), 'fragment stage unguarded (USE_INSTANCING is a vertex-prefix define)');
  // late module → new version, a warning, the old materials untouched
  const before = m.vertexShader;
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  m.onBeforeCompile({ uniforms: m.uniforms }, null);
  g.module({ name: 'late', vertexShader: 'void main() { gl_Position = vec4( 0.0 ); }', fragmentShader: 'void main() { gl_FragColor = vec4( 1.0 ); }' });
  console.warn = warn;
  assert.equal(warned, 1); assert.equal(m.vertexShader, before);
});

test('uber linker: geometry normalised before compile (vertexNormals keys the program), attributes aliased per draw', () => {
  const g = new UberGroup('t3');
  const b = g.module(modB);
  const m = g.material(b, { uniforms: { uColor: { value: new THREE.Color() }, uTex: { value: null } } });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geo.setAttribute('aOther', new THREE.Float32BufferAttribute(new Float32Array(12), 4));
  const mesh = new THREE.Mesh(geo, m), root = new THREE.Group(); root.add(mesh);
  uberPrepare(root);
  assert.equal(geo.attributes.normal, geo.attributes.position, 'normal alias (no copy)');
  m.onBeforeRender(null, null, null, geo, mesh);
  const slot = b.aMacro.find(([n]) => n === 'aOther');
  assert.ok(slot);
  assert.equal(geo.attributes[slot[1]], geo.attributes.aOther, 'aliased onto its slot');
});

test('PERF §1.2 / §7: shadow-only layer + one depth material per kind with three\'s own packing', () => {
  const o = shadowOnly(new THREE.Mesh());
  assert.ok(o.layers.isEnabled(SHADOW_ONLY_LAYER) && !o.layers.isEnabled(0), 'never in a view camera\'s colour pass');
  const d = depthFor(new THREE.Mesh());
  assert.equal(d.depthPacking, THREE.BasicDepthPacking, 'same program family as three\'s default shadow depth material');
  assert.equal(depthFor(new THREE.Mesh()), d);
  assert.notEqual(depthFor(new THREE.InstancedMesh(new THREE.BufferGeometry(), null, 1)), d, 'per kind');
});

// ---- Token Tails pass (SC3): index.html branding (F21) and WebGL context loss (F5)
test('F21 / §2.6: index.html is Pink Paw Knight · Token Tails (meta, OG, icons, night theme, pinch-zoom allowed)', async () => {
  const fs = await import('node:fs');
  const { brandHtml } = await import('../../scripts/social-meta.mjs');
  const { BRAND } = await import('../../src/core/brand.js');
  const html = brandHtml(fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8'), BRAND);
  assert.match(html, /<title>Pink Paw Knight · Token Tails<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]+">/);
  assert.match(html, /<meta name="theme-color" content="#0B0820">/);
  for (const p of ['og:title', 'og:description', 'og:image', 'og:type']) assert.match(html, new RegExp(`property="${p}"`));
  assert.match(html, /property="og:image" content="og\.jpg"/); assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /rel="icon"[^>]+href="favicon\.png"/); assert.match(html, /rel="apple-touch-icon"[^>]+href="apple-touch-icon\.png"/);
  assert.doesNotMatch(html, /maximum-scale|user-scalable/, 'pinch-zoom allowed');
  assert.match(html, /#app canvas \{[^}]*touch-action: none/, 'the canvas keeps touch-action none');
  assert.match(html, /aria-label="Pink Paw Knight is loading"/); assert.match(html, /<noscript>[\s\S]*Pink Paw Knight/);
  assert.doesNotMatch(html, /Swordcat|Meow Island|Nine Lives/i, 'no old display name');
  assert.match(html, /#FF8FB1/, 'the original splash bow stays');
  for (const f of ['favicon.png', 'apple-touch-icon.png', 'og.jpg']) assert.ok(fs.existsSync(new URL(`../../public/${f}`, import.meta.url)), f);
});

test('§2.6: the build gives the share card absolute image URLs and an og:url (VITE_SITE_URL, else the default host)', async () => {
  const fs = await import('node:fs');
  const { absoluteSocialUrls, siteUrl, DEFAULT_SITE_URL } = await import('../../scripts/social-meta.mjs');
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const def = absoluteSocialUrls(html);
  assert.match(def, new RegExp(`property="og:image" content="${DEFAULT_SITE_URL}og\\.jpg"`));
  assert.match(def, new RegExp(`name="twitter:image" content="${DEFAULT_SITE_URL}og\\.jpg"`));
  assert.equal((def.match(/property="og:url"/g) ?? []).length, 1);
  const own = absoluteSocialUrls(html, 'https://games.example.com/knight');
  assert.match(own, /property="og:image" content="https:\/\/games\.example\.com\/knight\/og\.jpg"/);
  assert.match(own, /property="og:url" content="https:\/\/games\.example\.com\/knight\/"/);
  assert.equal(absoluteSocialUrls(own, 'https://other.example/'), own, 'idempotent: absolute URLs and og:url are kept');
  assert.equal(siteUrl('javascript:alert(1)'), null); assert.equal(siteUrl(''), null);
  assert.match(absoluteSocialUrls(html, 'not a url'), new RegExp(`content="${DEFAULT_SITE_URL}og\\.jpg"`), 'a bad VITE_SITE_URL falls back');
});

test('F5: webglcontextlost → preventDefault, loop stopped, save, overlay; restored → reload', async () => {
  const { Game } = await import('../../src/core/Game.js');
  const listeners = {};
  const canvas = { addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: (t) => { delete listeners[t]; } };
  const g = new Game(null, { params: parseParams('', { DEV: false }) });
  const calls = [];
  g.loop = { stop: () => calls.push('stop') };
  g.ctx = { save: { save: (r) => calls.push(`save:${r}`) }, strings: null };
  g._bindContextLoss(canvas);
  assert.ok(listeners.webglcontextlost && listeners.webglcontextrestored);
  let prevented = false;
  const warn = console.warn; console.warn = () => {};
  try {
    listeners.webglcontextlost({ preventDefault: () => { prevented = true; } });
    listeners.webglcontextlost({ preventDefault() {} });
  } finally { console.warn = warn; }
  assert.equal(prevented, true);
  assert.deepEqual(calls, ['stop', 'save:contextlost'], 'once, even if the event repeats');
  assert.equal(g.contextLost, true);
  g._bindContextLoss({});   // no addEventListener (node): no throw
});

test('build:tokentails copies dist/ without the chunk manifest or maps, and guards file size', async () => {
  const { shipped, MAX_FILE_MB } = await import('../../scripts/copy-to-tokentails.mjs');
  assert.equal(shipped('index.html'), true);
  assert.equal(shipped('bundle/index-abc.js'), true);
  assert.equal(shipped('assets/audio/music/field_of_dreams.mp3'), true);
  assert.equal(shipped('.vite/manifest.json'), false);
  assert.equal(shipped('bundle/index-abc.js.map'), false);
  assert.equal(MAX_FILE_MB, 50);
  const pkg = JSON.parse((await import('node:fs')).readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['build:tokentails'], /npm run build && node scripts\/copy-to-tokentails\.mjs/);
});
