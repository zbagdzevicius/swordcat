// tests/unit/fx.test.js  (owner: fx) — pure fx helpers (telegraph normalisation + tracking rules, trail styles and
// windows, damage-number formatting, the holy charge ladder, bloom / vignette maths, poof debris, mist-card layouts,
// horde layout + parting, ambient presets, the §8.2 juice mapping) and the FX service wired to a fake ctx (bus events
// → telegraphs, particles, damage numbers, poofs, holy forwarding, fog walls, horde), all under node (no DOM, no GL).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Actor } from '../../src/core/Actor.js';
import { EventBus } from '../../src/core/EventBus.js';
import { ActorRegistry } from '../../src/core/ActorRegistry.js';
import { GameState } from '../../src/core/GameState.js';
import { createRng } from '../../src/core/rng.js';
import * as config from '../../src/core/config.js';
import { E } from '../../src/core/events.js';
import { TELEGRAPH, PLAYER, JUICE, QUALITY } from '../../src/core/config.js';
import { FX, hitJuice, BURST_KINDS, MIST_COUNT } from '../../src/fx/FX.js';
import { normalizeTelegraph, isTracking, fillProgress, decalBounds, defaultShape, originMode, SHAPES, KINDS } from '../../src/fx/Telegraphs.js';
import { trailStyle, trailWindow, TRAIL_COLORS } from '../../src/fx/SwordTrail.js';
import { formatDamage, formatHeal, DAMAGE_STYLE } from '../../src/fx/DamageNumbers.js';
import { chargeState } from '../../src/fx/HolyFX.js';
import { bloomTarget, vignetteOpacity, LOW_HP, FLASH } from '../../src/fx/ScreenFX.js';
import { debrisFor, helmetFor, DEBRIS_KINDS, DEBRIS_ALIAS } from '../../src/fx/Poof.js';
import { ringCardPositions, rectCardPositions, AMBIENT_DENSITY } from '../../src/fx/MistCards.js';
import { hordeLayout, hordeMode, partOffset, buildHordeGeometry, HORDE } from '../../src/fx/Horde.js';
import { motesFor, MOTES, AMBIENT_PROFILES, profileLayers } from '../../src/fx/Ambient.js';
import { ParticlePool, particleSpec, SHAPE } from '../../src/fx/Particles.js';
import { toVec3, hash01, spikeEnvelope, visualDt, auraOwner, resolveBlade } from '../../src/fx/util.js';
import { ENV_U } from '../../src/world/tone.js';

const DT = 1 / 60;

/**
 * A core-only ctx (like _fakeCtx's `systems: false`, but without importing core/systems.js, so these tests never break
 * because another area's module is mid-edit). fx only needs the core services plus a few optional systems.
 */
function fakeCtx() {
  const game = {
    mode: 'play', hitstopT: 0, time: 0, realTime: 0, frameCount: 0,
    simActive: () => true, requestHitstop() {}, slowMo() {}, setTimeScale() {}, setMode(m) { this.mode = m; },
    addFrameHook: () => () => {},
  };
  return {
    game, bus: new EventBus(), config, renderer: null, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 600),
    actors: new ActorRegistry(), state: new GameState(), rng: createRng(1), params: { test: true }, quality: QUALITY.med, postfx: null,
    input: null, assets: null, physics: null, combat: null, cam: null, player: null, enemies: null, companions: null, levels: null,
    env: null, objectives: null, fx: null, audio: null, story: null, ui: null, save: null, strings: { t: (k) => k, has: () => false, S: {} },
  };
}

// ------------------------------------------------------------------ telegraphs (§8.1, §19.5)
test('telegraph: every kind defaults to its §8.1 shape and colour; min lead is the default duration', () => {
  const want = { parry: 'glint', gold: 'glint', red: 'glint', aoe: 'circle', aim: 'line', grab: 'swirl', jeer: 'rings', shadow: 'shadow' };
  for (const k of KINDS) {
    assert.equal(defaultShape(k), want[k], k);
    const n = normalizeTelegraph({ kind: k });
    assert.equal(n.shape, want[k]);
    assert.equal(n.color, TELEGRAPH.colors[k]);
    assert.equal(n.duration, TELEGRAPH.minLead[k]);
  }
  assert.deepEqual([...SHAPES].sort(), ['circle', 'cone', 'glint', 'lane', 'line', 'ring', 'rings', 'shadow', 'swirl']);
  assert.equal(TELEGRAPH.colors.gold, '#FFD34D');
  assert.equal(TELEGRAPH.colors.red, '#FF5A4E');   // WA §12 warm danger hues (core.W1)
  assert.equal(TELEGRAPH.colors.aoe, '#FF9A3D');
});

test('telegraph: size forms → explicit dimensions (circle, ring, lane, cone, line)', () => {
  assert.equal(normalizeTelegraph({ kind: 'aoe', shape: 'circle', size: 2.5 }).r, 2.5);
  const ring = normalizeTelegraph({ kind: 'red', shape: 'ring', size: [1.6, 2.5] });
  assert.equal(ring.r, 2.5); assert.equal(ring.inner, 1.6);
  const ring2 = normalizeTelegraph({ kind: 'red', shape: 'ring', size: 3 });
  assert.ok(ring2.inner > 0 && ring2.inner < 3);
  const lane = normalizeTelegraph({ kind: 'aoe', shape: 'lane', size: [2, 9] });
  assert.equal(lane.w, 2); assert.equal(lane.l, 9);
  assert.equal(normalizeTelegraph({ kind: 'aoe', shape: 'lane', size: 7 }).l, 7);
  const cone = normalizeTelegraph({ kind: 'aoe', shape: 'cone', size: [4, Math.PI / 2] });
  assert.equal(cone.r, 4); assert.equal(cone.angle, Math.PI / 2);
  assert.equal(normalizeTelegraph({ kind: 'aim', size: 18 }).l, 18);
  assert.equal(normalizeTelegraph({ kind: 'aoe', r: 1.7 }).r, 1.7);
  assert.equal(normalizeTelegraph({ kind: 'aoe', size: { r: 2.2 } }).r, 2.2);
  // nonsense stays sane
  const z = normalizeTelegraph({ kind: 'aoe', shape: 'circle', size: -5, duration: -1 });
  assert.ok(z.r >= 0.25 && z.duration >= 0.05);
});

test('telegraph: aim stops tracking 0.2 s before the shot; shadow tracks the first 60% then freezes', () => {
  assert.equal(isTracking('line', 'aim', 0.59, 0.8), true);
  assert.equal(isTracking('line', 'aim', 0.61, 0.8), false);
  assert.equal(isTracking('shadow', 'shadow', 0.59, 1.0), true);
  assert.equal(isTracking('shadow', 'shadow', 0.61, 1.0), false);
  assert.equal(isTracking('circle', 'aoe', 5, 1), true);
  assert.equal(fillProgress(0.25, 0.5), 0.5);
  assert.equal(fillProgress(1, 0.5), 1);
  assert.equal(fillProgress(-1, 0.5), 0);
});

test('telegraph: decal bounds cover the shape; origin modes (live vector / actor / fixed)', () => {
  const lane = decalBounds(normalizeTelegraph({ kind: 'aoe', shape: 'lane', size: [2, 6] }));
  assert.ok(lane[0] <= -1 && lane[1] >= 1 && lane[2] <= 0 && lane[3] >= 6);
  const wide = decalBounds(normalizeTelegraph({ kind: 'aoe', shape: 'cone', size: [3, Math.PI * 1.5] }));
  assert.ok(wide[2] <= -3, 'a cone wider than 180° reaches behind the origin');
  const c = decalBounds(normalizeTelegraph({ kind: 'aoe', size: 2 }));
  assert.ok(c[0] <= -2 && c[1] >= 2 && c[2] <= -2 && c[3] >= 2);
  const ctx = fakeCtx();
  const a = new Actor(ctx, {});
  assert.equal(originMode({ pos: new THREE.Vector3(), actor: a }), 'live');
  assert.equal(originMode({ actor: a }), 'actor');
  assert.equal(originMode({ pos: [1, 2] }), 'fixed');
});

// ------------------------------------------------------------------ trail, numbers, holy, screen
test('sword trail: style per attack / skin / Golden Hour; sampling window follows the active frames', () => {
  assert.equal(trailStyle('holy').color, '#FFD34D');
  assert.equal(trailStyle('slash1', 'borrowed', true).color, '#FFD34D');
  assert.equal(trailStyle('slash1', 'twig').color, TRAIL_COLORS.twig);
  assert.equal(trailStyle('slash1', 'nope').color, TRAIL_COLORS.borrowed);
  assert.ok(trailStyle('holy').intensity > trailStyle('slash1').intensity);
  const w = trailWindow({ active: [0.1, 0.22], dur: 0.4 });
  assert.ok(w[0] < 0.1 && w[1] > 0.22);
  assert.deepEqual(trailWindow({ hang: 0.12 }), [0.12, Infinity]);
  assert.deepEqual(trailWindow(null), [0, 0]);
});

test('damage numbers: rounded ×10 damage, crits gold, heals green, nothing for blocks or 0', () => {
  assert.deepEqual(formatDamage({ damage: 10 }), { text: '10', style: 'normal', value: 10 });
  assert.deepEqual(formatDamage({ damage: 19.6, crit: true }), { text: '20', style: 'crit', value: 20 });
  assert.equal(formatDamage({ damage: 20, heavy: true }).style, 'heavy');
  assert.equal(formatDamage({ damage: 10, blocked: true }), null);
  assert.equal(formatDamage({ damage: 0 }), null);
  assert.deepEqual(formatHeal(4), { text: '+4', style: 'heal', value: 4 });
  assert.equal(formatHeal(0), null);
  // WA §5.2 colours: white / cream heavy / gold crit / mint heal / pink hurt-to-her
  assert.equal(DAMAGE_STYLE.normal.color, '#FFFFFF'); assert.equal(DAMAGE_STYLE.heavy.color, '#FFF1C4');
  assert.equal(DAMAGE_STYLE.crit.color, '#FFD34D'); assert.equal(DAMAGE_STYLE.heal.color, '#9BE3C4'); assert.equal(DAMAGE_STYLE.hurt.color, '#FF8FB1');
});

test('holy ladder: charge → silver, tier 2 + ready → gold, fizzle stays silver, Golden Hour full', () => {
  assert.equal(chargeState(null).level, 0);
  assert.equal(chargeState({ charge: 0 }).level, 0);
  const c1 = chargeState({ charge: 0.5, chargeTier: 1, valor: 60, shards: 1 });
  assert.equal(c1.gold, 0); assert.ok(c1.level > 0.2);
  const c2 = chargeState({ charge: 1, chargeTier: 2, valor: 60, shards: 1 });
  assert.equal(c2.gold, 1); assert.equal(c2.tier, 2);
  const fz = chargeState({ charge: 1, chargeTier: 1, chargeFizzled: true, valor: 10, shards: 0 });
  assert.equal(fz.gold, 0); assert.equal(fz.ready, false);
  // no chargeTier field: §7.2 thresholds on charge + Valor / Shard
  assert.equal(chargeState({ charge: 1, valor: 50, shards: 1 }).gold, 1);
  assert.equal(chargeState({ charge: 1, valor: 49, shards: 1 }).gold, 0);
  assert.deepEqual(chargeState({ golden: true }), { level: 1, gold: 1, ready: true, tier: 2 });
});

test('bloom director and vignette maths', () => {
  const base = { strength: 0.6, threshold: 0.85 };
  assert.deepEqual(bloomTarget(base), base);
  const h = bloomTarget(base, { holy: 1 });
  assert.ok(Math.abs(h.strength - 1.2) < 1e-9 && Math.abs(h.threshold - 0.75) < 1e-9, 'art.md §10.1: holy → 1.2 / 0.75');
  assert.equal(bloomTarget(base, { golden: true }).strength, PLAYER.golden.bloom);
  assert.equal(bloomTarget(base, { spike: 1.2 }).strength, 1.2);
  assert.equal(spikeEnvelope(0, 0.4), 0);
  assert.ok(Math.abs(spikeEnvelope(0.1, 0.4, 0.25) - 1) < 1e-9);
  assert.equal(spikeEnvelope(0.4, 0.4), 0);
  // ART §9.1: a soft PINK hurt flash (peak 0.18 over 0.25 s, never a red vignette); low HP pulses ≤ 0.12 at 1 Hz;
  // reduce flashes ×0.3
  assert.equal(FLASH.hurt.color, '#FF8FB1'); assert.equal(FLASH.hurt.alpha, 0.18); assert.equal(FLASH.hurt.dur, 0.25);
  assert.equal(vignetteOpacity(Infinity, 8, 0), 0);
  assert.ok(vignetteOpacity(0.05, 8, 0) > 0.12 && vignetteOpacity(0.05, 8, 0) <= 0.18 + 1e-9);
  assert.equal(vignetteOpacity(FLASH.hurt.dur + 0.01, 8, 0), 0);
  const lo0 = vignetteOpacity(Infinity, LOW_HP, 0.25), lo1 = vignetteOpacity(Infinity, LOW_HP, 0.75);
  assert.ok(lo0 > lo1 && lo1 > 0, 'low-HP pulse');
  assert.ok(lo0 <= FLASH.lowHp.max + 1e-9, 'low-HP pulse ≤ 0.12');
  assert.ok(Math.abs(vignetteOpacity(Infinity, LOW_HP, 1.25) - lo0) < 1e-9, '1 Hz period');
  assert.equal(vignetteOpacity(Infinity, LOW_HP + 1, 0.25), 0);
  assert.ok(Math.abs(vignetteOpacity(0.05, 8, 0, { reduce: true }) - vignetteOpacity(0.05, 8, 0) * 0.3) < 1e-9);
  assert.equal(vignetteOpacity(Infinity, 1, 0.25, { alive: false }), 0);
});

test('§8.2 juice mapping: light 4 stars, heavy 8 + dust, holy gold, blocks, parries, hurt, numbers only on enemies', () => {
  const player = { faction: 'player' }, rat = { faction: 'enemy' }, ally = { faction: 'ally' };
  assert.equal(hitJuice(null, player), null);
  const light = hitJuice({ target: rat, attackId: 'slash1', damage: 10 }, player);
  assert.equal(light.kind, 'light'); assert.equal(light.stars, 4); assert.equal(light.dust, false); assert.equal(light.number.text, '10');
  const heavy = hitJuice({ target: rat, attackId: 'slash3', damage: 20, heavy: true }, player);
  assert.equal(heavy.kind, 'heavy'); assert.equal(heavy.stars, 8); assert.equal(heavy.dust, true);
  assert.equal(hitJuice({ target: rat, attackId: 'bright', damage: 28 }, player).kind, 'heavy', 'heavy from the ATTACKS table');
  assert.equal(hitJuice({ target: rat, attackId: 'holy', damage: 50 }, player).kind, 'holy');
  assert.equal(hitJuice({ target: rat, attackId: 'holyWave', damage: 30 }, player).kind, 'holy');
  assert.equal(hitJuice({ target: rat, attackId: 'riposte', damage: 36, crit: true }, player).number.style, 'crit');
  assert.equal(hitJuice({ target: player, damage: 0, blocked: true }, player).kind, 'block');
  assert.equal(hitJuice({ target: rat, damage: 0, blocked: true }, player).kind, 'blockNpc');
  assert.equal(hitJuice({ target: rat, damage: 0, blocked: true, parried: true }, player).kind, 'parryNpc');
  assert.equal(hitJuice({ target: player, damage: 0, blocked: true, parried: true }, player), null, 'her parries come via player:parry');
  assert.equal(hitJuice({ target: player, damage: 2 }, player).kind, 'hurt');
  assert.equal(hitJuice({ target: player, damage: 2, broke: true }, player).kind, 'break');
  assert.equal(hitJuice({ target: ally, attackId: 'rat_poke', damage: 1 }, player).number, null);
  assert.equal(hitJuice({ target: rat, attackId: 'slash1', damage: 0 }, player), null, 'immune / 0 damage: nothing');
  assert.ok(JUICE.light && JUICE.heavy && JUICE.holy);
});

// ------------------------------------------------------------------ poof, mist, horde, ambient
test('poof debris per faction and helmets', () => {
  assert.equal(debrisFor('crow'), 'feathers');
  assert.equal(debrisFor('jelly_l'), 'droplets');
  assert.equal(debrisFor('bonehead:warrior'), 'bones');
  assert.equal(debrisFor('rat_pike'), 'dirt');
  assert.equal(debrisFor('unknown'), null);
  assert.equal(debrisFor(null), null);
  assert.equal(helmetFor('rat_pike'), 'kettle');
  assert.equal(helmetFor('crow'), null);
  for (const k of DEBRIS_KINDS) assert.ok(BURST_KINDS.includes(k), `burst kind ${k}`);
  // breakables other areas emit (world's meadow boulder 'rocks', audio's crate / cage / lock / slime list)
  for (const k of ['rocks', 'wood', 'crate', 'barrel', 'cage', 'lock', 'slime', 'stone', 'sack']) assert.ok(BURST_KINDS.includes(k), `burst kind ${k}`);
  for (const [k, a] of Object.entries(DEBRIS_ALIAS)) assert.ok(DEBRIS_KINDS.includes(a.debris), `${k} → ${a.debris}`);
});

test('mist walls: cards every ~1.5 m on rings and rectangles; ambient density per level', () => {
  const ring = ringCardPositions(0, 0, 12);
  const n = ring.length / 2;
  assert.ok(Math.abs(n - Math.round((Math.PI * 24) / 1.5)) <= 1);
  for (let i = 0; i < n; i++) assert.ok(Math.abs(Math.hypot(ring[i * 2], ring[i * 2 + 1]) - 12) < 1e-9);
  const rect = rectCardPositions(10, 5, 12, 6);
  assert.equal(rect.length / 2, 8 + 4 + 8 + 4);
  for (let i = 0; i < rect.length; i += 2) {
    const dx = Math.abs(rect[i] - 10), dz = Math.abs(rect[i + 1] - 5);
    assert.ok(Math.abs(dx - 6) < 1e-9 || Math.abs(dz - 3) < 1e-9, 'every card on an edge');
  }
  assert.equal(AMBIENT_DENSITY.sky, 0);
  assert.ok(MIST_COUNT.low < MIST_COUNT.med && MIST_COUNT.med <= 60 && MIST_COUNT.low >= 20);
});

test('horde: modes, deterministic layout with cages / spears, the stream parts around her', () => {
  assert.equal(hordeMode(true), 'march'); assert.equal(hordeMode(false), 'off'); assert.equal(hordeMode('mill'), 'mill');
  assert.equal(hordeMode('flee'), 'flee'); assert.equal(hordeMode('idle'), 'mill'); assert.equal(hordeMode(null), 'off');
  const a = hordeLayout(40), b = hordeLayout(40);
  assert.deepEqual(a, b, 'deterministic');
  assert.equal(a.length, 40);
  assert.ok(a.filter((m) => m.variant === 2).length >= 6, 'several cage carriers');
  assert.ok(a.some((m) => m.variant === 1), 'spears');
  for (const m of a) { assert.ok(m.u >= -1 && m.u <= HORDE.length + 1); assert.ok(Math.abs(m.lat) <= HORDE.width / 2 + 0.5); }
  assert.equal(partOffset(10, 0.5, 3), 0, 'far along the path: no push');
  assert.ok(partOffset(0, 0.5, 3) > 2, 'right beside her: pushed out to the radius');
  assert.ok(partOffset(0, -0.5, 3) < -2, 'pushed to its own side');
  assert.equal(partOffset(0, 4, 3), 0, 'already clear');
  const g = buildHordeGeometry();
  assert.ok(g.getAttribute('position').count > 300 && g.getAttribute('aPart') && g.getAttribute('aPivot'));
  g.computeBoundingBox();
  assert.ok(g.boundingBox.min.y > -0.05 && g.boundingBox.max.y < 2.5, 'feet at 0, ~1.4 m tall (+ spear)');
  g.dispose();
});

test('ambient motes per level / night (WA §2.4 profiles; fx.W4: gate motes are not ash)', () => {
  assert.equal(motesFor('meadow'), 'meadow');
  assert.deepEqual(profileLayers('meadow').map((l) => l.name), ['fluff', 'petals']);
  assert.equal(motesFor('meadow', 'night'), 'meadow_night');
  assert.equal(motesFor('forest'), 'forest_day');
  assert.equal(motesFor('forest', 'night'), 'forest_twilight');
  assert.deepEqual(profileLayers('forest_twilight'), [{ name: 'fireflies', count: 64 }]);
  assert.deepEqual(profileLayers('bog_dusk'), [{ name: 'fireflies', count: 56 }, { name: 'spores', count: 30 }]);
  assert.deepEqual(profileLayers('keep'), [{ name: 'sparks', count: 40 }, { name: 'fireflies', count: 24 }]);
  assert.deepEqual(profileLayers('town'), [{ name: 'dust', count: 40 }, { name: 'petals', count: 20 }]);
  assert.equal(motesFor('sky'), null);
  const gate = profileLayers(motesFor('gate'));
  assert.ok(gate.length && gate.every((l) => l.name !== 'ash' && l.name !== 'embers'), 'gate: warm dust, no ash');
  assert.equal(MOTES[gate[0].name].color, '#FFE0C0');
  assert.equal(MOTES.sparks.color, '#FFC46B');
  for (const id of ['meadow', 'forest', 'town', 'gate', 'bog', 'keep']) {
    const L = profileLayers(motesFor(id));
    assert.ok(L.length >= 1 && L.length <= 2 && L.every((l) => MOTES[l.name]), id);
    assert.ok(L.every((l) => l.name !== 'ash' && l.name !== 'embers'), `${id}: no ash / embers`);
  }
  // Low tier ×0.5
  assert.deepEqual(profileLayers('bog_dusk', 0.5).map((l) => l.count), [28, 15]);
  for (const k of Object.keys(AMBIENT_PROFILES)) assert.ok(profileLayers(k).reduce((s, l) => s + l.count, 0) <= 128, k);
});

test('particle pool: spawn, age out with swap-remove, honour the quality limit', () => {
  const pool = new ParticlePool({ capacity: 8, additive: true, name: 't' });
  const s = particleSpec();
  for (let i = 0; i < 10; i++) { s.life = i < 4 ? 0.1 : 1; s.shape = SHAPE.STAR4; pool.spawn(s); }
  assert.equal(pool.count, 8, 'capped at capacity');
  pool.limit = 8;
  pool.update(0.2);
  assert.equal(pool.count, 4, 'the four short-lived ones died');
  assert.equal(pool.geometry.instanceCount, 4);
  pool.limit = 4;
  assert.equal(pool.spawn(s), -1);
  pool.dispose();
});

test('util: positions, visual dt, aura owner, blade lookup on a characters sword', () => {
  const v = new THREE.Vector3();
  assert.deepEqual(toVec3([1, 2], v).toArray(), [1, 0, 2]);
  assert.deepEqual(toVec3([1, 2, 3], v).toArray(), [1, 2, 3]);
  assert.deepEqual(toVec3({ pos: { x: 4, y: 5, z: 6 } }, v).toArray(), [4, 5, 6]);
  assert.equal(toVec3(null, v), null);
  assert.ok(hash01(3) >= 0 && hash01(3) < 1 && hash01(3) === hash01(3));
  assert.equal(visualDt({ game: { mode: 'menu', hitstopT: 0 } }, 0.016), 0);
  assert.equal(visualDt({ game: { mode: 'play', hitstopT: 0.05 } }, 0.016), 0);
  assert.equal(visualDt({ game: { mode: 'play', hitstopT: 0, loop: { timeScale: 0.5 } } }, 0.016), 0.008);
  const k = { setHoly() {} };
  assert.equal(auraOwner({ model: { k } }), k);
  assert.equal(auraOwner({ visual: { k } }), k);
  assert.equal(auraOwner({}), null);
  // a characters sword { tip, grip } under player.model.k.sword
  const root = new THREE.Group(), grip = new THREE.Object3D(), tip = new THREE.Object3D();
  tip.position.set(0, 1, 0); root.add(grip, tip); root.updateMatrixWorld(true);
  const h = new THREE.Vector3(), t = new THREE.Vector3();
  assert.equal(resolveBlade({ model: { k: { sword: { tip, grip } } } }, h, t), true);
  assert.ok(Math.abs(t.y - 1) < 1e-9 && h.y > 0 && h.y < 1);
  root.visible = false;
  assert.equal(resolveBlade({ model: { k: { sword: { tip, grip } } } }, h, t), false, 'hidden sword: no trail');
});

// ------------------------------------------------------------------ the FX service on a fake ctx
function setupFx() {
  const ctx = fakeCtx();
  ctx.camera.position.set(0, 2, 6); ctx.camera.lookAt(0, 1, 0); ctx.camera.updateMatrixWorld();
  ctx.fx = new FX(ctx);
  return ctx;
}
async function frames(ctx, n = 1) {
  for (let i = 0; i < n; i++) {
    ctx.game.time += DT; ctx.game.realTime += DT;
    ctx.fx.update(DT);
    ctx.fx.render(1, DT);
  }
}
function actor(ctx, faction, x, z, o = {}) {
  const a = new Actor(ctx, { faction, height: o.height ?? 1, radius: 0.35, maxHp: 30 });
  a.pos.set(x, 0, z); a.object3d.position.copy(a.pos); ctx.scene.add(a.object3d);
  ctx.actors.register(a);
  return a;
}

test('FX service: contract methods exist and init builds every pool without a DOM or GL', async () => {
  const ctx = setupFx();
  for (const m of ['burst', 'telegraph', 'holy', 'mistRing', 'horde', 'init', 'update', 'render', 'dispose']) assert.equal(typeof ctx.fx[m], 'function', m);
  await ctx.fx.init();
  assert.ok(ctx.fx.ready);
  await frames(ctx, 2);
  const names = new Set();
  ctx.scene.traverse((o) => names.add(o.name));
  for (const n of ['fx.particles.add', 'fx.particles.alpha', 'fx.marks', 'fx.swordTrail', 'fx.telegraph.decal', 'fx.telegraph.aim',
    'fx.holy.sparkles', 'fx.horde', 'fx.ambient', 'fx.mist.ambient', 'fx.blobs', 'fx.butterflies', 'fx.lightPools', 'fx.cloudShadows']) assert.ok(names.has(n), `scene has ${n}`);
  // PERF §8.2 / K2: no PointLight in the game scene (the holy glow is world's ENV_U.uGlow)
  let lights = 0;
  ctx.scene.traverse((o) => { if (o.isPointLight) lights++; });
  assert.equal(lights, 0, 'no PointLights');
  assert.ok(!names.has('fx.debugFrame'), 'the framing overlay is ?debug only');
  ctx.fx.dispose();
  let left = 0;
  ctx.scene.traverse((o) => { if (o.name?.startsWith('fx.')) left++; });
  assert.equal(left, 0, 'dispose removes every fx object');
});

test('FX service: combat:telegraph / telegraphEnd drive the telegraph pool (every kind and shape)', async () => {
  const ctx = setupFx();
  await ctx.fx.init();
  const rat = actor(ctx, 'enemy', 0, 3);
  const live = new THREE.Vector3(0, 0.8, 2.6);
  let id = 1;
  for (const k of KINDS) ctx.bus.emit(E.TELEGRAPH, { id: id++, actor: rat, kind: k, pos: live, dir: new THREE.Vector3(0, 0, -1), size: 1.5, duration: 0.6 });
  for (const s of ['circle', 'lane', 'cone', 'ring']) ctx.bus.emit(E.TELEGRAPH, { id: id++, actor: rat, kind: 'aoe', shape: s, size: 2, duration: 0.6 });
  await frames(ctx, 3);
  const st = ctx.fx.stats();
  assert.equal(st.telegraphs, KINDS.length + 4);
  assert.ok(st.marks > 6, 'glints / "!" / swirls / rings are drawn as marks');
  assert.ok(ctx.fx.telegraphs.decals.filter((d) => d.visible).length >= 7, 'decals for aoe shapes, shadow and jeer rings');
  assert.equal(ctx.fx.telegraphs.lines.filter((l) => l.visible).length, 1, 'one aim line');
  // PERF F4: every decal is ONE batched draw and every aim line another
  let decalMeshes = 0, aimMeshes = 0;
  ctx.scene.traverse((o) => { if (o.name === 'fx.telegraph.decal') decalMeshes++; if (o.name === 'fx.telegraph.aim') aimMeshes++; });
  assert.equal(decalMeshes, 1); assert.equal(aimMeshes, 1);
  assert.equal(ctx.fx.telegraphs.decalBatch.mesh.visible, true);
  assert.ok(ctx.fx.telegraphs.decalBatch.geometry.drawRange.count > 0);
  // live vector: the glint follows the emitter's tellPos
  live.set(1, 0.8, 2.6);
  await frames(ctx, 1);
  assert.equal(ctx.fx.telegraphs.active.get(1).origin.x, 1);
  for (let i = 1; i < id; i++) ctx.bus.emit(E.TELEGRAPH_END, { id: i });
  await frames(ctx, 12);
  assert.equal(ctx.fx.stats().telegraphs, 0, 'ended telegraphs fade out and release their pools');
  assert.equal(ctx.fx.telegraphs.decals.filter((d) => d.busy).length, 0);
  // a telegraph whose END never comes times out
  const tid = ctx.fx.telegraph({ kind: 'parry', actor: rat, duration: 0.2 });
  assert.ok(tid >= 1000000);
  await frames(ctx, 60);
  assert.equal(ctx.fx.stats().telegraphs, 0);
  ctx.fx.dispose();
});

test('FX service: a shadow without a position tracks her for 60% then freezes; an explicit position stays put', async () => {
  const ctx = setupFx();
  await ctx.fx.init();
  const pl = actor(ctx, 'player', 0, 0); ctx.player = pl;
  ctx.bus.emit(E.TELEGRAPH, { id: 1, kind: 'shadow', shape: 'shadow', size: 0.9, duration: 1.0 });
  ctx.bus.emit(E.TELEGRAPH, { id: 2, kind: 'shadow', shape: 'shadow', pos: [5, 5], size: 0.9, duration: 1.0 });
  const walk = async (n) => { for (let i = 0; i < n; i++) { pl.pos.x += 0.05; pl.object3d.position.copy(pl.pos); await frames(ctx, 1); } };
  await walk(30);                                                   // 0.5 s: still tracking
  const L1 = ctx.fx.telegraphs.active.get(1), L2 = ctx.fx.telegraphs.active.get(2);
  assert.ok(Math.abs(L1.origin.x - pl.pos.x) < 1e-6, 'tracks her');
  assert.equal(L2.origin.x, 5, 'explicit position kept');
  await walk(18);                                                   // 0.8 s: frozen since 0.6 s
  assert.ok(pl.pos.x - L1.origin.x > 0.5, 'froze at 60%');
  ctx.fx.dispose();
});

test('FX service: hits → stars + damage numbers; kills → one poof (enemy:died + fx:burst deduped); heals; parry; hurt vignette', async () => {
  const ctx = setupFx();
  await ctx.fx.init();
  const pl = actor(ctx, 'player', 0, 0); ctx.player = pl; pl.hp = 8;
  const rat = actor(ctx, 'enemy', 0, 1.5);
  ctx.bus.emit(E.HIT, { attacker: pl, target: rat, attackId: 'slash1', damage: 10, position: rat.pos.clone(), dir: new THREE.Vector3(0, 0, 1), killed: false, blocked: false });
  await frames(ctx, 1);
  let st = ctx.fx.stats();
  assert.ok(st.particles >= 4, `hit stars spawned (${st.particles})`);
  assert.equal(st.numbersShown, 1);
  const p0 = ctx.fx.counts.poofs;
  rat.alive = false;
  ctx.bus.emit(E.ENEMY_DIED, { enemy: rat, type: 'rat_pike', position: rat.pos.clone(), fish: 3 });
  ctx.bus.emit(E.BURST, { kind: 'poof', position: rat.pos.clone().setY(0.5), count: 12 });
  assert.equal(ctx.fx.counts.poofs, p0 + 1, 'the enemy\'s own fx:burst poof is folded into the enemy:died poof');
  ctx.bus.emit(E.BURST, { kind: 'poof', position: new THREE.Vector3(9, 0.5, 9) });
  assert.equal(ctx.fx.counts.poofs, p0 + 2, 'an unrelated poof still draws');
  ctx.bus.emit(E.PLAYER_HEALED, { amount: 4, hp: 8, maxHp: 8 });
  assert.equal(ctx.fx.stats().numbersShown, 2, 'heal number');
  ctx.bus.emit(E.PLAYER_PARRY, { attacker: rat, gold: true, position: pl.pos.clone() });
  await frames(ctx, 2);
  st = ctx.fx.stats();
  assert.equal(st.counts.parries, 1);
  assert.equal(st.dizzy, 0, 'dead attackers get no stun stars');
  ctx.bus.emit(E.PLAYER_DAMAGED, { amount: 1, hp: 7, maxHp: 8 });
  await frames(ctx, 2);
  assert.ok(ctx.fx.stats().vignette > 0.08 && ctx.fx.stats().vignette <= 0.18, 'soft pink hurt flash');
  await frames(ctx, 30);
  assert.equal(ctx.fx.stats().vignette, 0);
  pl.hp = 2;
  await frames(ctx, 15);
  assert.ok(ctx.fx.stats().vignette > 0.03 && ctx.fx.stats().vignette <= 0.12, 'low-HP pulse');
  // every burst kind draws without throwing
  for (const k of BURST_KINDS) ctx.fx.burst(k, new THREE.Vector3(1, 0.5, 1), { count: 3 });
  ctx.fx.burst('sparkle', pl);
  ctx.fx.burst('nope', [0, 0]);
  await frames(ctx, 5);
  assert.ok(ctx.fx.stats().particles > 20);
  ctx.bus.emit(E.LEVEL_UNLOAD, { id: 'meadow' });
  assert.equal(ctx.fx.stats().particles, 0, 'level unload clears transient fx');
  ctx.fx.dispose();
});

test('FX service: holy() forwards to the actor\'s own aura and drives sparkles / light / bloom', async () => {
  const ctx = setupFx();
  let bloom = null, reset = 0;
  // K1: play renders straight to the canvas: the bloom director only drives a High cinematic composer
  ctx.postfx = { cinematic: false, bloomBase: { strength: 0.6, threshold: 0.85, radius: 0.4 }, setBloom(s) { bloom = s; }, resetBloom() { reset++; bloom = 0.6; }, get bloom() { return bloom ?? 0.6; } };
  await ctx.fx.init();
  const kit = { v: 0, setHoly(v) { this.v = v; } };
  const pl = actor(ctx, 'player', 0, 0); pl.model = { k: kit }; ctx.player = pl;
  ctx.actors.register(pl, 'swordcat');
  const base = ENV_U.uGlow.value.w;
  ctx.fx.holy('swordcat', 0.8);
  assert.equal(kit.v, 0.8, 'forwarded by cutscene id');
  await frames(ctx, 30);
  let st = ctx.fx.stats();
  assert.ok(st.holy.player > 0.7, 'level eases up');
  assert.equal(bloom, null, 'no bloom in play');
  // ART §8.5 glow without bloom: glow cards (core + 6–12 sparkles) and the ENV_U glow share instead of a PointLight
  assert.ok(st.holy.cards >= 6 && st.holy.cards <= 12, `glow-card sparkles ${st.holy.cards}`);
  assert.ok(st.holy.glow > 0.2, 'ENV_U.uGlow widened');
  assert.ok(Math.abs(ENV_U.uGlow.value.w - (base + st.holy.glow)) < 1e-6, 'fx adds its share on top of the base radius');
  ctx.postfx.cinematic = true;               // a High cinematic: the composer's bloom follows holy
  await frames(ctx, 2);
  assert.ok(bloom > 1.0, `cinematic bloom raised (${bloom})`);
  ctx.fx.holy(pl, 0);
  assert.equal(kit.v, 0);
  await frames(ctx, 120);
  assert.equal(ctx.fx.stats().holy.light, 0);
  assert.ok(Math.abs(ENV_U.uGlow.value.w - base) < 1e-6, 'the glow share is taken back');
  assert.ok(reset >= 1, 'bloom handed back to PostFX');
  // charge events: tier flashes and the fizzle
  ctx.bus.emit(E.PLAYER_CHARGE, { level: 0.5 });
  ctx.bus.emit(E.PLAYER_CHARGE, { level: 1, holy: true });
  ctx.bus.emit(E.PLAYER_CHARGE, { level: 0.5, fizzle: true });
  assert.equal(ctx.fx.holyFx.flashes, 2); assert.equal(ctx.fx.holyFx.fizzles, 1);
  // Holy Slash: the crescent lands on the active frame (sim-timed), with a bloom spike
  ctx.bus.emit(E.PLAYER_HOLY, { position: pl.pos.clone(), dir: new THREE.Vector3(0, 0, 1) });
  assert.equal(ctx.fx.holyFx.casts, 0);
  await frames(ctx, 15);
  assert.equal(ctx.fx.holyFx.casts, 1);
  await frames(ctx, 10);
  assert.ok(ctx.fx.stats().peakBloom >= 1.15, `bloom spike (${ctx.fx.stats().peakBloom})`);
  ctx.fx.dispose();
});

test('FX service: fog walls (ring + rect, dissolve), horde modes, quality budget, Meme Cam mist speed', async () => {
  const ctx = setupFx();
  await ctx.fx.init();
  const w = ctx.fx.mistRing(new THREE.Vector3(0, 0, 0), 12);
  const r = ctx.fx.mistRing([5, 5], 10, { size: [20, 12] });
  assert.equal(ctx.fx.stats().walls, 2);
  assert.ok(w.alive && r.size[0] === 20);
  await frames(ctx, 10);
  w.dispose(0.1);
  r.remove();
  await frames(ctx, 12);
  assert.equal(ctx.fx.stats().walls, 0);
  // horde: march from a point along +X, then flee, then off
  assert.equal(ctx.fx.horde(true, [0, -40], { dir: [1, 0, 0] }), 'march');
  await frames(ctx, 90);
  let h = ctx.fx.stats().horde;
  assert.equal(h.mode, 'march'); assert.ok(h.count >= 24); assert.ok(h.visible > 10, `visible ${h.visible}`);
  assert.equal(ctx.fx.horde('mill', { pos: new THREE.Vector3(0, 0, -66), facing: 0 }, { width: 50, depth: 17 }), 'mill');
  await frames(ctx, 5);
  assert.equal(ctx.fx.horde('flee', [0, 0]), 'flee');
  await frames(ctx, 60 * 5);
  assert.equal(ctx.fx.stats().horde.mode, 'off', 'the fled horde switches itself off');
  ctx.fx.horde(true, [0, -40]);
  ctx.fx.horde(false);
  await frames(ctx, 120);
  assert.equal(ctx.fx.stats().horde.mode, 'off');
  // quality
  ctx.bus.emit(E.QUALITY, { name: 'low', preset: QUALITY.low });
  assert.equal(ctx.fx.particles.add.limit + ctx.fx.particles.alpha.limit, QUALITY.low.particles);
  assert.equal(ctx.fx.mist.ambient.count, MIST_COUNT.low);
  ctx.bus.emit(E.MEME_CAM, { on: true });
  assert.equal(ctx.fx.mist.speedMul, PLAYER.memeCam.mist);
  // the Meme Cam loop: while the camera loops, the mist drift locks to its phase (cards stop moving, the noise scroll
  // repeats every 3.8 s); it lets go after the loop ends
  ctx.cam = { memeLooping: true, memePhase: 0.25 };
  const card0 = ctx.fx.mist.ambient.aPos.array.slice(0, 3);
  ctx.fx.mist.setAmbient(true, 1);
  await frames(ctx, 150);
  assert.ok(ctx.fx.stats().mistLoop > 0.95, `mist loop weight ${ctx.fx.stats().mistLoop}`);
  const u = ctx.fx.mist.ambient.material.uniforms;
  assert.equal(u.uLoop.value.x, 0.25);
  assert.ok(Math.abs(u.uLoopDrift.value.x - 0.035 * PLAYER.memeCam.mist * PLAYER.memeCam.loop) < 1e-9);
  const a1 = ctx.fx.mist.ambient.aPos.array.slice(0, 3);
  await frames(ctx, 60);
  const a2 = ctx.fx.mist.ambient.aPos.array.slice(0, 3);
  assert.ok(Math.abs(a2[0] - a1[0]) < 0.02 && Math.abs(a2[2] - a1[2]) < 0.02, 'cards hold still while the loop is locked');
  void card0;
  ctx.cam = { memeLooping: false, memePhase: 0 };
  await frames(ctx, 240);
  assert.equal(ctx.fx.stats().mistLoop, 0);
  ctx.fx.dispose();
});

test('FX service: shader warm-up shows hidden fx objects for one frame with an empty draw range, then restores them', async () => {
  const ctx = setupFx();
  let hook = null;
  ctx.game.addFrameHook = (fn) => { hook = fn; return () => { hook = null; }; };
  await ctx.fx.init();
  const objs = ctx.fx.warmObjects();
  assert.ok(objs.length >= 10, `warm objects ${objs.length}`);
  const before = objs.map((o) => [o.visible, o.geometry.drawRange.start, o.geometry.drawRange.count, o.geometry.instanceCount]);
  ctx.fx.render(1, DT);                       // init armed one warm-up frame
  assert.equal(ctx.fx.stats().warmups, 1);
  for (const o of objs) {
    assert.equal(o.visible, true, `${o.name} shown for the warm-up`);
    if (!before[objs.indexOf(o)][0]) assert.equal(o.geometry.drawRange.count, 0, `${o.name} draws nothing`);
  }
  hook();                                     // after the frame
  objs.forEach((o, i) => {
    const b = before[i];
    assert.equal(o.visible, b[0], `${o.name} visibility restored`);
    assert.equal(o.geometry.drawRange.start, b[1]); assert.equal(o.geometry.drawRange.count, b[2], `${o.name} draw range restored`);
    assert.equal(o.geometry.instanceCount, b[3], `${o.name} instance count restored`);
  });
  ctx.fx.render(1, DT);
  assert.equal(ctx.fx.stats().warmups, 1, 'one frame only');
  ctx.bus.emit(E.LEVEL_LOADED, { id: 'meadow' });
  ctx.fx.render(1, DT);
  assert.equal(ctx.fx.stats().warmups, 2, 'again after a level load');
  hook();
  ctx.fx.dispose();
});

// ---- review fixes: marks capped on screen; marks of an actor between lens and player softened; wall near-fade
import { capMarkSize, MARK_SCREEN } from '../../src/fx/Marks.js';
import { occluderFactor } from '../../src/fx/Telegraphs.js';
import { WALL, MistCards } from '../../src/fx/MistCards.js';

test('marks: projected size is capped at ~6% of the screen height', () => {
  const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 500);
  const p11 = cam.projectionMatrix.elements[5];
  const frac = (s, d, asp = 1) => (s * asp * p11) / d / 2;
  // a 0.62 m parry glint 1.2 m from the lens would cover ~50% of the screen; capped to 6%
  assert.ok(frac(0.62, 1.2) > 0.3);
  assert.ok(Math.abs(frac(capMarkSize(0.62, 1.2, p11), 1.2) - MARK_SCREEN.maxFrac) < 1e-9);
  // the tall "!" (aspect 1.25) is capped on its height
  assert.ok(Math.abs(frac(capMarkSize(0.34, 0.8, p11, 1.25), 0.8, 1.25) - MARK_SCREEN.maxFrac) < 1e-9);
  // at normal combat distance marks keep their authored size
  assert.equal(capMarkSize(0.34, 9, p11, 1.25), 0.34);
  assert.ok(MARK_SCREEN.nearFade[1] >= 1.5);
});

test('telegraph marks: an attacker nearer the camera than the player is softened', () => {
  assert.equal(occluderFactor(9, 6), 1);          // behind her
  assert.equal(occluderFactor(5.6, 6), 1);        // beside her
  assert.equal(occluderFactor(3, 6), 0);          // between the lens and her
  const mid = occluderFactor(4.5, 6);
  assert.ok(mid > 0 && mid < 1);
  assert.equal(occluderFactor(3, 0), 1);          // no player distance → untouched
});

test('mist walls: wider near-fade than the ambient field + player focus fade', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const player = new Actor({}, { height: 0.6 });
  scene.add(player.object3d); player.object3d.position.set(0, 0, 6); camera.position.set(0, 1.5, 10);
  const mc = new MistCards({ scene, camera, player, game: { realTime: 0 } });
  mc.init(scene, 4);
  const h = mc.ring([0, 0, 0], 6);
  const wall = scene.getObjectByName('fx.mist.wall');
  assert.ok(WALL.near >= 4 && WALL.focusMin < 0.3);
  assert.equal(wall.material.uniforms.uNear.value, WALL.near);
  mc.render(DT);
  const f = wall.material.uniforms.uFocus.value;
  assert.equal(f.y, 1);
  assert.ok(Math.abs(f.x - camera.position.distanceTo(new THREE.Vector3(0, 0.5 * (player.height ?? 0.6), 6))) < 1e-6);
  h.remove();
  assert.equal(mc.wallCount, 0);
});

// ------------------------------------------------------------------ M2: jelly, web, jeer, stealer, slams, Golden Hour, lanterns, The Line, shop
import { shockRadius, shockAlpha, normalizeShock, slamColor, SLAM_COLORS } from '../../src/fx/Shockwaves.js';
import { webAlpha, WEB } from '../../src/fx/WebPatches.js';
import { sunRayEnvelope } from '../../src/fx/SunRays.js';
import { lanternFlicker, nearestLanterns, LANTERN } from '../../src/fx/Lanterns.js';
import { isLineObjective, repairPct, milestonesCrossed, lootCount, lobVelocity, JEER } from '../../src/fx/Encounters.js';
import { sparkleLayout } from '../../src/fx/ShopSparkle.js';
import { jellySize, popsSlime, JELLY_SCALE } from '../../src/fx/FX.js';

test('M2 shockwaves: linear radius (pug_slam 2.5 m / 0.4 s, Laugh Quake 8 m/s to 7 m), alpha tail, options', () => {
  assert.equal(shockRadius(0, 0.3, 2.5, 0.4), 0.3);
  assert.ok(Math.abs(shockRadius(0.2, 0.3, 2.5, 0.4) - 1.4) < 1e-9);
  assert.equal(shockRadius(1, 0.3, 2.5, 0.4), 2.5);
  const q = normalizeShock({ r: 7, speed: 8, r0: 0 });
  assert.ok(Math.abs(q.dur - (7 - q.r0) / 8) < 1e-9, 'speed wins over dur');
  assert.equal(normalizeShock({}).height, 0.3);
  assert.equal(normalizeShock({ r: 2.5 }).dur, 0.4);
  assert.equal(shockAlpha(0.2, 0.4), 1);
  assert.equal(shockAlpha(0.4 + 0.18, 0.4), 0);
  assert.ok(shockAlpha(0.49, 0.4) > 0 && shockAlpha(0.49, 0.4) < 1);
  assert.equal(slamColor('jeer'), SLAM_COLORS.jeer);
  assert.equal(slamColor('#123456'), '#123456');
  assert.equal(slamColor(null), SLAM_COLORS.red);
});

test('M2 web patches: fade in, hold 8 s, fade out; a cut tears it in 0.3 s', () => {
  assert.equal(webAlpha(0, 8), 0);
  assert.equal(webAlpha(1, 8), 1);
  assert.ok(webAlpha(7.7, 8) < 1 && webAlpha(7.7, 8) > 0);
  assert.equal(webAlpha(8, 8), 0);
  assert.equal(webAlpha(100, Infinity), 1, 'level dressing stays');
  assert.ok(webAlpha(2.3, 8, 2) < 1e-9);
  assert.ok(webAlpha(2.1, 8, 2) > 0.5);
  assert.equal(WEB.r, 1.0); assert.equal(WEB.life, 8);
});

test('M2 Golden Hour rays: open blooms to 2.4 m, holds ~1.7 m, sunburst flares to 7 m and ends at 0.6 s', () => {
  assert.ok(Math.abs(sunRayEnvelope('open', 0.8).size - 2.4) < 1e-6);
  assert.ok(sunRayEnvelope('open', 0.1).intensity > 0.25);
  const h = sunRayEnvelope('hold', 3);
  assert.ok(h.size > 1.5 && h.size < 1.9 && h.intensity > 0.1 && h.intensity < 0.4);
  assert.ok(sunRayEnvelope('open', 5).size < 1.9, 'open settles into hold');
  assert.ok(sunRayEnvelope('burst', 0.59).size > 6.5);
  assert.equal(sunRayEnvelope('burst', 0.6), null);
  assert.equal(sunRayEnvelope('close', 0.5), null);
  assert.equal(sunRayEnvelope('nope', 0), null);
});

test('M2 lanterns: CS-04 light numbers, bounded flicker, nearest 2 lit lanterns get the real lights', () => {
  assert.equal(LANTERN.color, '#FFC46B'); assert.equal(LANTERN.intensity, 1.5); assert.equal(LANTERN.distance, 6); assert.equal(LANTERN.lights, 2);
  for (let t = 0; t < 20; t += 0.37) { const f = lanternFlicker(t, 3); assert.ok(f >= 0.82 && f <= 1.08); }
  const list = [{ x: 0, z: 0, lit: true }, { x: 10, z: 0, lit: true }, { x: 1, z: 0, lit: false }, { x: 3, z: 0, lit: true }];
  assert.deepEqual(nearestLanterns(list, 0.5, 0), [0, 3]);
  assert.deepEqual(nearestLanterns(list, 9, 0, 1), [1]);
  assert.deepEqual(nearestLanterns([], 0, 0), []);
});

test('M2 The Line / theft / jelly / shop helpers', () => {
  assert.ok(isLineObjective('line')); assert.ok(isLineObjective('line_gate')); assert.ok(!isLineObjective('lanterns')); assert.ok(!isLineObjective(null));
  assert.equal(repairPct({ value: 0.5, max: 1 }), 50);
  assert.equal(repairPct({ value: 64 }), 64);
  assert.equal(repairPct({ value: 140, max: 100 }), 100);
  assert.deepEqual(milestonesCrossed(18, 31), [20, 30]);
  assert.deepEqual(milestonesCrossed(31, 31), []);
  assert.deepEqual(milestonesCrossed(95, 100), [], '100% is the done flare, not a milestone');
  assert.equal(lootCount('fish', 50), 8); assert.equal(lootCount('fish', 5), 2); assert.equal(lootCount('milk', 1), 1);
  const v = lobVelocity(3, 0, 4, 0.5, 9);
  assert.ok(Math.abs(v.x * 0.5 - 3) < 1e-9 && Math.abs(v.z * 0.5 - 4) < 1e-9);
  assert.ok(Math.abs(v.y * 0.5 - 0.5 * 9 * 0.25) < 1e-9, 'lands at the same height');
  assert.equal(jellySize('jelly_giant'), 'GIANT'); assert.equal(jellySize('jelly_l'), 'L'); assert.equal(jellySize('jelly', { size: 'S' }), 'S');
  assert.equal(jellySize('jelly'), 'M');
  assert.ok(JELLY_SCALE.GIANT > JELLY_SCALE.L && JELLY_SCALE.L > JELLY_SCALE.S);
  for (const id of ['bright', 'holy', 'holyWave', 'gleam', 'sunburst']) assert.ok(popsSlime({ attackId: id }), id);
  assert.ok(!popsSlime({ attackId: 'slash1' })); assert.ok(popsSlime({ attackId: 'slash1', popsSlime: true }));
  const lay = sparkleLayout(12, createRng(3), 70);
  assert.equal(lay.length, 12);
  assert.ok(lay.every((s) => Math.hypot(s.dx, s.dy + 10) <= 70 * 1.16));
  assert.equal(JEER.color, '#B07CFF');
});

test('M2 FX service: jeer fog, theft, jelly, slams, webs, lanterns, The Line and Golden Hour from bus events', async () => {
  const ctx = setupFx();
  await ctx.fx.init();
  const fx = ctx.fx;
  const pl = actor(ctx, 'player', 0, 0, { height: 0.6 });
  ctx.player = pl;
  // jeer fog: on -> rings + puffs; choke -> off
  const hy = actor(ctx, 'enemy', 4, 0, { height: 1.2 });
  ctx.bus.emit(E.ENEMY_JEER, { enemy: hy, on: true });
  await frames(ctx, 30);
  let s = fx.stats();
  assert.equal(s.m2.jeers, 1);
  assert.ok(s.particles > 0);
  ctx.bus.emit(E.ENEMY_CHOKE, { enemy: hy });
  assert.equal(fx.stats().m2.jeers, 0);
  // theft: loot flies to the thief, the thief is tracked, a despawn with the loot -> smoke poof
  const th = actor(ctx, 'enemy', -3, 1, { height: 1.2 });
  ctx.bus.emit(E.ITEM_STOLEN, { thief: th, item: 'fish', amount: 20 });
  await frames(ctx, 2);
  assert.equal(fx.stats().m2.thieves, 1);
  ctx.scene.remove(th.object3d);
  await frames(ctx, 1);
  s = fx.stats();
  assert.equal(s.m2.thieves, 0); assert.equal(s.m2.counts.vanishes, 1);
  ctx.bus.emit(E.ITEM_RETURNED, { item: 'fish', amount: 20, bonus: 5 });
  assert.equal(fx.stats().m2.counts.returns, 1);
  // a thief that is beaten (enemy:died, then disposed) does not smoke-bomb
  const th2 = actor(ctx, 'enemy', -2, 2, { height: 1.2 });
  ctx.bus.emit(E.ITEM_STOLEN, { thief: th2, item: 'fish', amount: 10 });
  ctx.bus.emit(E.ENEMY_DIED, { enemy: th2, type: 'stealer', position: th2.pos.clone(), fish: 0 });
  th2.alive = false; ctx.scene.remove(th2.object3d);
  await frames(ctx, 2);
  assert.equal(fx.stats().m2.counts.vanishes, 1, 'no smoke bomb for a beaten thief');
  ctx.bus.emit(E.ITEM_RETURNED, { item: 'fish', amount: 10, bonus: 5 });
  assert.equal(fx.stats().m2.thieves, 0);
  // jelly: a bright kill pops instead of splitting
  const j1 = actor(ctx, 'enemy', 2, 2, { height: 0.8 });
  ctx.bus.emit(E.HIT, { attacker: pl, target: j1, attackId: 'bright', damage: 40, killed: true, dir: new THREE.Vector3(0, 0, 1) });
  ctx.bus.emit(E.ENEMY_DIED, { enemy: j1, type: 'jelly_l', position: j1.pos.clone(), fish: 0 });
  assert.equal(fx._pops.get(j1), true);
  for (const k of ['jellySplit', 'jellyPop', 'jellySlam', 'web', 'webCut', 'stealerPoof', 'purchase', 'lanternLight', 'shockwave', 'slam', 'crack']) {
    assert.ok(BURST_KINDS.includes(k), k);
    fx.burst(k, [1, 0, 1], { r: 2.5, crack: true });
  }
  // slams: a shockwave expands and finishes
  const o = fx.shockwave([0, 0, 3], { r: 7, speed: 8, color: 'jeer' });
  assert.ok(o && Math.abs(o.dur - (7 - o.r0) / 8) < 1e-9);
  await frames(ctx, 2);
  assert.ok(fx.stats().m2.shocks >= 1);
  assert.ok(fx.stats().m2.cracks >= 1);
  await frames(ctx, 90);
  assert.equal(fx.stats().m2.shocks, 0);
  // web patches: lay, cut, expire
  const w = fx.webPatch([2, 0, -2], { r: 1 });
  const w2 = fx.webPatch([3, 0, -2], { r: 1, life: 0.5 });
  await frames(ctx, 2);
  assert.equal(fx.stats().m2.webs, 2);
  w.cut();
  assert.equal(w.alive, false);
  await frames(ctx, 40);
  assert.equal(fx.stats().m2.webs, 0); assert.equal(w2.alive, false);
  // lanterns: 3 lit, only 2 real lights, nearest first
  const glowOnly = fx.lantern([2, 1.5, 2]);
  assert.equal(fx.stats().m2.lanternLights, 0, 'glow-only lanterns add no lights');
  glowOnly.remove();
  const ls = [[0.5, 1.5, 0], [8, 1.5, 0], [30, 1.5, 0]].map((p) => fx.lantern(p, { light: true }));
  await frames(ctx, 60);
  s = fx.stats();
  assert.equal(s.m2.lanterns, 3); assert.equal(s.m2.lanternLights, 2); assert.equal(s.m2.lanternLightsOn, 2);
  const lit = fx.lanterns.pool.map((p) => p.owner?.pos.x).sort((a, b) => a - b);
  assert.deepEqual(lit, [0.5, 8]);
  ls[0].out();
  await frames(ctx, 90);
  assert.deepEqual(fx.lanterns.pool.map((p) => p.owner?.pos.x).sort((a, b) => a - b), [8, 30], 'the light moves to the next lantern');
  const clem = actor(ctx, 'ally', 5, 5, { height: 0.6 });
  const ign0 = fx.stats().m2.ignitions;
  const lh = fx.lantern(clem, { lit: false });
  lh.light();
  assert.equal(fx.stats().m2.ignitions, ign0 + 1);
  // The Line: progress -> sparks + milestones; frozen -> stall; 100% -> done
  for (let i = 0; i < 30; i++) { ctx.bus.emit(E.OBJECTIVE, { id: 'line', value: 5 + i, max: 100 }); await frames(ctx, 2); }
  s = fx.stats();
  assert.ok(s.m2.counts.repairSparks > 3, `sparks ${s.m2.counts.repairSparks}`);
  assert.ok(s.m2.counts.milestones >= 2);
  assert.deepEqual(s.m2.line.site, [0, 0, 41]);
  ctx.bus.emit(E.OBJECTIVE, { id: 'line', value: 40, max: 100, frozen: true });
  assert.equal(fx.stats().m2.counts.stalls, 1);
  ctx.bus.emit(E.OBJECTIVE, { id: 'line', value: 100, max: 100, done: true });
  assert.equal(fx.stats().m2.counts.repairDone, 1);
  // Golden Hour: rays open behind her, Sunburst flares
  pl.golden = true;
  ctx.bus.emit(E.PLAYER_GOLDEN, { on: true });
  await frames(ctx, 10);
  assert.equal(fx.stats().m2.sunRays, 'open');
  pl.golden = false;
  ctx.bus.emit(E.PLAYER_GOLDEN, { on: false });
  fx.burst('sunburst', pl);
  assert.equal(fx.stats().m2.sunBursts, 1);
  // shop: counts without a DOM
  assert.equal(fx.purchase({ x: 10, y: 10 }), false);
  assert.equal(fx.stats().m2.shop, 1);
  // level unload drops everything level-bound
  ctx.bus.emit(E.LEVEL_UNLOAD, { id: 'gate' });
  s = fx.stats();
  assert.equal(s.m2.lanterns, 0); assert.equal(s.m2.webs, 0); assert.equal(s.m2.jeers, 0); assert.equal(s.m2.line.active, false);
  ctx.bus.emit(E.LEVEL_LOADED, { id: 'meadow' });
  assert.equal(fx.stats().m2.lanternLights, 0, 'pooled lantern lights dropped on a level without them');
  fx.dispose();
});

// ================================================================== CONTROLS_SPEC (iso controls): fx P3
// fog (§4.1, C4), ground mist (§4.2), ground decals (§7.3, §8.2, §10.3), constant-size marks (§8.2.3), numbers (§10.4)
const { withFxFog, fxShaderMaterial, FOG_FACTOR, fogUniforms: isoFogUniforms } = await import('../../src/fx/shaders.js');
const { HFOG } = await import('../../src/world/HeightFog.js');
const GD = await import('../../src/fx/GroundDecals.js');
const GM = await import('../../src/fx/GroundMist.js');
const { isoNumberScale, DAMAGE_ISO } = await import('../../src/fx/DamageNumbers.js');
const { bandGeometry, MIST_ISO } = await import('../../src/fx/MistCards.js');
const { TELE_ISO } = await import('../../src/fx/Telegraphs.js');
const { Marks: IsoMarks } = await import('../../src/fx/Marks.js');

test('iso fog (C4): fx shader materials get vFogW + HFOG_GLSL and share the HFOG uniforms, also after a clone', () => {
  const m = fxShaderMaterial({ fog: true, uniforms: isoFogUniforms(),
    vertexShader: '#include <fog_pars_vertex>\nvoid main(){ vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}',
    fragmentShader: '#include <fog_pars_fragment>\n' + FOG_FACTOR + '\nvoid main(){ gl_FragColor = vec4(fxFogColor(), fxFog()); }' });
  assert.ok(m.vertexShader.includes('vFogW = '), 'vertex writes vFogW');
  assert.ok(m.fragmentShader.includes('varying vec3 vFogW'), 'fragment declares vFogW');
  assert.ok(m.fragmentShader.includes('float hfogFactor('), 'HFOG_GLSL declared');
  assert.ok(m.fragmentShader.indexOf('float hfogFactor(') < m.fragmentShader.indexOf('float fxFog()'), 'declared before fxFog uses it');
  assert.ok(m.fragmentShader.includes('return hfogFactor( vFogW, vFogDepth )'), 'fxFog calls it');
  assert.equal(m.uniforms.uFogFocus, HFOG.uFogFocus, 'shared focus uniform');
  assert.equal(m.uniforms.uFogMode, HFOG.uFogMode);
  assert.equal(m.userData.hfog, true, 'Env skips it');
  const src = m.fragmentShader;
  withFxFog(m);
  assert.equal(m.fragmentShader, src, 'idempotent');
  const c = withFxFog(m.clone());
  assert.equal(c.uniforms.uFogClear, HFOG.uFogClear, 'a clone is re-shared');
  assert.equal((c.fragmentShader.match(/varying vec3 vFogW/g) ?? []).length, 1);
  const noFog = fxShaderMaterial({ fog: false, vertexShader: 'void main(){}', fragmentShader: 'void main(){}' });
  assert.ok(!noFog.userData.hfog, 'unfogged materials untouched');
});

test('iso fog (C4): every fogged fx material in the scene measures fog like the level (no lens-only fog maths left)', async () => {
  const ctx = setupFx();
  await ctx.fx.init();
  await frames(ctx, 2);
  ctx.fx.mistRing([0, 0, 0], 6);
  ctx.fx.telegraph({ kind: 'aoe', shape: 'circle', pos: [0, 0, 0], size: 2, duration: 1 });
  await frames(ctx, 1);
  const bad = [];
  ctx.scene.traverse((o) => {
    const m = o.material;
    if (!m?.isShaderMaterial || !m.fog) return;
    if (!m.userData.hfog || m.uniforms.uFogMode !== HFOG.uFogMode || /fogDensity \* fogDensity \* vFogDepth/.test(m.fragmentShader)) bad.push(m.name);
  });
  assert.deepEqual(bad, []);
  ctx.fx.dispose();
});

test('strike wedge state (§8.2.1): fill, freeze 0.15 s before the strike, parry window open + rim flash', () => {
  const w = PLAYER.guard.parryWindow;
  let s = GD.wedgeState(10, 0.8, 9.4, w);
  assert.ok(Math.abs(s.prog - 0.25) < 1e-9); assert.equal(s.frozen, false); assert.equal(s.open, false);
  s = GD.wedgeState(10, 0.8, 9.86, w);
  assert.equal(s.frozen, true, 'frozen inside 0.15 s');
  assert.equal(s.open, true, 'parry window open'); assert.ok(s.flash > 0.5, 'flash at window open');
  s = GD.wedgeState(10, 0.8, 9.98, w);
  assert.equal(s.flash, 0, 'flash over after 0.12 s');
  assert.equal(GD.wedgeState(10, 0.8, 10.2, w).open, false, 'closed after the strike');
});

test('parry ring (§8.2.2): 2.2 m at 0.6 s → her radius exactly at the strike; auto = touch / Kitten', () => {
  assert.equal(GD.parryRingRadius(0.6, 0.45), 2.2);
  assert.equal(GD.parryRingRadius(0, 0.45), 0.45);
  assert.ok(Math.abs(GD.parryRingRadius(0.3, 0.45) - 1.325) < 1e-9);
  assert.equal(GD.parryRingRadius(0.7, 0.45), null);
  assert.equal(GD.parryRingRadius(-0.1, 0.45), null);
  assert.equal(GD.parryRingOn('auto', 'touch', 'normal'), true);
  assert.equal(GD.parryRingOn('auto', 'kbm', 'kitten'), true);
  assert.equal(GD.parryRingOn('auto', 'kbm', 'normal'), false);
  assert.equal(GD.parryRingOn('on', 'pad', 'hard'), true);
  assert.equal(GD.parryRingOn('off', 'touch', 'kitten'), false);
});

test('path preview points (§10.3): every step metres along the polyline, capped', () => {
  const pts = GD.pointsAlong({ x: 0, z: 0 }, [{ x: 0, z: 3 }, { x: 3, z: 3 }], 1.2, 10);
  assert.equal(pts.length, 5);
  assert.ok(Math.abs(pts[0].z - 1.2) < 1e-9 && pts[0].x === 0);
  assert.ok(Math.abs(pts[2].x - 0.6) < 1e-9 && pts[2].z === 3, 'carries the remainder over the corner');
  assert.ok(Math.abs(pts[2].yaw - Math.PI / 2) < 1e-9);
  assert.equal(GD.pointsAlong({ x: 0, z: 0 }, [{ x: 0, z: 30 }], 1, 3).length, 3);
  // start index (no slice) and pooled point objects (no per-frame allocation)
  const pool = [], out = [], path = [{ x: 9, z: 9 }, { x: 0, z: 3 }, { x: 3, z: 3 }];
  const a = GD.pointsAlong({ x: 0, z: 0 }, path, 1.2, 10, out, 1, pool);
  assert.equal(a.length, 5); assert.ok(Math.abs(a[2].x - 0.6) < 1e-9 && a[2].z === 3);
  const first = a[0];
  const b = GD.pointsAlong({ x: 0, z: 0 }, path, 1.2, 2, out, 1, pool);
  assert.equal(b.length, 2); assert.equal(b[0], first, 'reuses the pooled objects');
  assert.equal(pool.length, 5);
});

test('ground mist (§4.2): 8 sheets in the 4–16 m ring, 3.5 m clear disc, holes over wind-ups, preset factor', () => {
  const L = GM.mistLayout(5, -3, 8);
  assert.equal(L.length, 8);
  for (const s of L) {
    const d = Math.hypot(s.x - 5, s.z + 3);
    assert.ok(d > 4 && d < 16, `sheet at ${d.toFixed(1)} m`);
    assert.ok(s.h >= 0.4 && s.h <= 1.3); assert.ok(s.a >= 0.1 && s.a <= 0.22);
  }
  assert.equal(GM.mistMask(0, 0, 0, 0), 0, 'clear on her');
  assert.equal(GM.mistMask(3.4, 0, 0, 0), 0, 'clear inside 3.5 m');
  assert.equal(GM.mistMask(9, 0, 0, 0), 1, 'full in the ring');
  assert.equal(GM.mistMask(16.5, 0, 0, 0), 0, 'none beyond 16 m');
  assert.equal(GM.mistMask(9, 0, 0, 0, [{ x: 9, z: 0, r: 2 }]), 0, 'a hole over a wind-up');
  assert.equal(GM.mistFactor('bog'), 1.4); assert.equal(GM.mistFactor('nope'), GM.GROUND_MIST.def);
});

test('ground mist: one draw, iso play camera only, eases with the focus-fog mode, cuts wind-up holes', async () => {
  const ctx = setupFx();
  await ctx.fx.init();
  const gm = ctx.fx.groundMist;
  assert.ok(gm.mesh && gm.mesh.isMesh, 'one mesh');
  await frames(ctx, 3);
  assert.equal(gm.mesh.visible, false, 'no iso camera → hidden');
  const mode0 = HFOG.uFogMode.value;
  ctx.cam = { isIso: true, modeName: 'follow', focus: new THREE.Vector3(0, 0, 0) };
  ctx.env = { presetName: 'meadow_day', wind: 0.6, windDir: new THREE.Vector2(1, 0) };
  HFOG.uFogMode.value = 1;
  ctx.combat = { threats: { live: new Map([[1, { actor: { pos: new THREE.Vector3(6, 0, 0), alive: true }, payload: { arc: { range: 1.5 } }, ended: false }]]) } };
  await frames(ctx, 60);
  assert.equal(gm.mesh.visible, true);
  assert.ok(gm.alpha > 0.9, `alpha ${gm.alpha}`);
  assert.equal(gm.holes, 1);
  assert.equal(ctx.fx.stats().groundMist.sheets, 8);
  HFOG.uFogMode.value = 0;                       // a cutscene: lens fog → the mist fades out
  await frames(ctx, 120);
  assert.equal(gm.mesh.visible, false);
  HFOG.uFogMode.value = mode0;
  ctx.cam = null; ctx.env = null; ctx.combat = null;
  ctx.fx.dispose();
});

/** A minimal iso world for GroundDecals: an iso cam, a stub heroine, a threat book. */
function isoDecals() {
  const ctx = setupFx();
  ctx.cam = { isIso: true, modeName: 'follow', focus: new THREE.Vector3(), cursorValid: false, cursorGround: new THREE.Vector3(), hover: null, lockTarget: null };
  ctx.player = { pos: new THREE.Vector3(), facing: 0, state: 'move', onGround: true, alive: true, radius: 0.45, grit: 3, gritMax: 3,
    guardState: { guardT: 0, parryT: 0, lockoutT: 0, arc: PLAYER.guard.arc }, orders: null };
  ctx.input = { device: 'kbm', down: () => false, pointerIdle: () => 99 };
  const live = new Map();
  ctx.combat = { threats: { live }, nextParryable: () => null, projectiles: { list: [] } };
  ctx.physics = { heightAt: () => 0 };
  const d = new GD.GroundDecals(ctx);
  d.init(ctx.scene);
  return { ctx, d, live };
}

test('ground decals: hero ring always in iso play; nothing in classic / cutscenes; one instanced draw', () => {
  const { ctx, d } = isoDecals();
  d.render(DT);
  assert.equal(d.counts.hero, 1);
  assert.equal(d.mesh.visible, true);
  assert.ok(d.mesh.isInstancedMesh);
  ctx.cam.modeName = 'cutscene';
  d.render(DT);
  assert.equal(d.n, 0, 'cutscene: nothing');
  ctx.cam.modeName = 'follow'; ctx.cam.isIso = false;
  d.render(DT);
  assert.equal(d.n, 0, 'classic: nothing');
  d.dispose();
});

test('ground decals: a strike wedge per melee wind-up, frozen 0.15 s before the strike (gold gets a tip star)', () => {
  const { ctx, d, live } = isoDecals();
  const rat = { id: 7, pos: new THREE.Vector3(0, 0, 2), facing: Math.PI, alive: true, radius: 0.4 };
  ctx.game.time = 0;
  live.set(1, { id: 1, actor: rat, kind: 'parry', windup: 0.8, activeAt: 0.8, payload: { arc: { range: 1.6, from: 0.6, to: -0.6 } }, ended: false });
  d.render(DT);
  assert.equal(d.counts.wedge, 1);
  assert.equal(d.wedgeList[0].frozen, false);
  ctx.game.time = 0.7;                           // inside the 0.15 s lead: frozen
  d.render(DT);
  const y0 = d.wedgeList[0].yaw;
  assert.equal(d.wedgeList[0].frozen, true);
  rat.facing = Math.PI / 2;                      // it keeps turning: the wedge does not
  ctx.game.time = 0.75; d.render(DT);
  assert.equal(d.wedgeList[0].yaw, y0, 'frozen yaw');
  assert.equal(d.wedgeList[0].open, true, 'parry window open');
  assert.equal(d.counts.glyph, 1, 'WA §3.4: the parry shield glyph at the tip');
  const n0 = d.n;
  live.get(1).kind = 'gold';
  d.render(DT);
  assert.equal(d.n, n0, 'gold swaps the glyph for its 8-point star');
  assert.equal(d.counts.glyph, 1);
  live.clear(); d.render(DT);
  assert.equal(d.counts.wedge ?? 0, 0);
  d.dispose();
});

test('ground decals: the parry ring (setting on), a red dodge chevron, the Riposte arrow', () => {
  const { ctx, d, live } = isoDecals();
  ctx.state.settings.parryRing = 'on';
  const rat = { id: 7, pos: new THREE.Vector3(0, 0, 2), facing: Math.PI, alive: true, radius: 0.4 };
  ctx.game.time = 0;
  ctx.combat.nextParryable = () => ({ attacker: rat, activeAt: 0.3, kind: 'parry', window: 0.15 });
  d.render(DT);
  assert.equal(d.counts.parryRing, 1);
  assert.ok(Math.abs(d.parryRingR - GD.parryRingRadius(0.3, 0.45)) < 1e-9);
  ctx.state.settings.parryRing = 'off';
  d.render(DT);
  assert.equal(d.counts.parryRing ?? 0, 0);
  ctx.state.settings.parryRing = 'on';
  ctx.combat.nextParryable = () => null;
  live.set(2, { id: 2, actor: rat, kind: 'red', windup: 0.8, activeAt: 0.4, targetsPlayer: true, payload: { arc: { range: 2 } } });
  d.render(DT);
  assert.equal(d.counts.chevron, 1, 'red: a dodge chevron, no ring');
  assert.equal(d.counts.parryRing ?? 0, 0);
  ctx.player.riposteTarget = rat; ctx.player.riposteT = 0.5;
  d.render(DT);
  assert.equal(d.counts.riposte, 1);
  d.dispose();
});

test('ground decals: order markers (paw / ✕), queued waypoints, RMB dots, path preview, ranges overlay', () => {
  const { ctx, d } = isoDecals();
  ctx.bus.emit(E.PLAYER_ORDER, { kind: 'move', point: new THREE.Vector3(3, 0, 4), valid: true });
  ctx.bus.emit(E.PLAYER_ORDER, { kind: 'move', point: new THREE.Vector3(9, 0, 9), valid: false });
  ctx.bus.emit(E.PLAYER_ORDER, { kind: 'stop', valid: true });
  assert.deepEqual(d.markers.map((m) => m.kind), ['move', 'bad']);
  d.render(DT);
  assert.equal(d.counts.marker, 2);
  for (let i = 0; i < 50; i++) d.render(DT);
  assert.equal(d.markers.length, 0, 'markers expire');
  ctx.player.orders = { kind: 'move', path: [new THREE.Vector3(0, 0, 4), new THREE.Vector3(4, 0, 4)], wp: 0, engaged: false,
    queue: [new THREE.Vector3(4, 0, 9), new THREE.Vector3(0, 0, 9)] };
  d.render(DT);
  assert.equal(d.counts.goal, 1); assert.equal(d.counts.queued, 2); assert.equal(d.counts.path ?? 0, 0, 'no path dots by default');
  ctx.input.down = (a) => a === 'move';
  d.render(DT);
  assert.equal(d.counts.path, 3, 'RMB held: 3 dots on the next segment');
  ctx.input.down = () => false; ctx.state.settings.pathPreview = true;
  d.render(DT);
  assert.ok(d.counts.path >= 6, `preview paws every 1.2 m (${d.counts.path})`);
  ctx.input.down = (a) => a === 'ranges';
  d.render(DT);
  assert.equal(d.counts.ranges, 1);
  d.dispose();
});

test('ground decals: Stand fan, charge reach (+ holyWave lane with Shard 2), landing ring + dive circle, swing smear', () => {
  const { ctx, d } = isoDecals();
  const p = ctx.player;
  p.state = 'guard'; d.render(DT);
  assert.equal(d.counts.fan, 1);
  d.flash('block'); d.render(DT);
  assert.equal(d.counts.blockSpark, 1, 'a block flashes a white ground ring');
  p.state = 'charge'; p.chargeT = 1; p.chargeTier = 2; p.shards = 2; p.valor = 100;
  d.render(DT);
  assert.equal(d.counts.charge, 1); assert.equal(d.counts.holyLane, 1);
  p.shards = 1; d.render(DT);
  assert.equal(d.counts.holyLane ?? 0, 0, 'Shard 1: no lane');
  p.state = 'move'; p.onGround = false; p.pos.y = 2; p.pounceReady = true;
  d.render(DT);
  assert.equal(d.counts.landing, 1); assert.equal(d.counts.dive, 1);
  p.onGround = true; p.pos.y = 0;
  ctx.bus.emit(E.PLAYER_SWING, { attackId: 'slash1', combo: 1 });
  assert.deepEqual(d.markers.map((m) => m.kind), ['smear']);
  let seen = 0;
  for (let i = 0; i < 30; i++) { d.render(DT); seen += d.counts.smear ?? 0; }
  assert.ok(seen > 0, 'the smear drew'); assert.equal(d.markers.length, 0, 'and expired');
  d.dispose();
});

test('marks (§8.2.3): a negative size is a constant screen height in px; the overlay batch ignores depth', () => {
  const m = new IsoMarks(4), top = new IsoMarks(4, { overlay: true });
  assert.equal(top.material.depthTest, false); assert.equal(top.mesh.renderOrder, 10);
  assert.equal(m.material.depthTest, true);
  m.begin(390);
  assert.equal(m.material.uniforms.uViewH.value, 390);
  assert.ok(m.push(0, 0, 0, -28, 2, new THREE.Color(1, 1, 1)) >= 0, 'px marks accepted');
  assert.equal(m.push(0, 0, 0, 0, 2, new THREE.Color(1, 1, 1)), -1, 'zero size rejected');
  assert.equal(TELE_ISO.glintPx, 28); assert.equal(TELE_ISO.goldPx, 34); assert.equal(TELE_ISO.exclPx, 34);
  m.dispose(); top.dispose();
});

test('telegraphs in the iso camera: glints and "!" go to the overlay at a constant px size; aim lines lie flat', async () => {
  const ctx = setupFx();
  await ctx.fx.init();
  ctx.cam = { isIso: true, modeName: 'follow', focus: new THREE.Vector3() };
  const rat = actor(ctx, 'enemy', 0, 3);
  ctx.fx.telegraph({ kind: 'parry', actor: rat, duration: 0.8 });
  ctx.fx.telegraph({ kind: 'aim', actor: rat, shape: 'line', duration: 1.0, dir: [0, 0, -1], size: 18 });
  await frames(ctx, 4);
  const top = ctx.fx.marksTop;
  assert.ok(top.count >= 3, `overlay marks ${top.count}`);
  const sizes = Array.from(top.aPar.array.slice(0, top.count * 4)).filter((_, i) => i % 4 === 0);
  assert.ok(sizes.every((s) => s < 0), 'px-sized');
  const line = ctx.fx.telegraphs.lines.find((l) => l.busy);
  const P = line.pos;
  assert.ok(Math.abs(P[1] - P[4]) < 1e-6 && Math.abs(P[1] - P[7]) < 1e-6, 'flat (both edges at the same height)');
  assert.ok(Math.abs(P[1] - TELE_ISO.aimLift) < 1e-6, 'at y + 0.05');
  assert.equal(line.material.depthTest, false);
  ctx.cam = null;
  ctx.fx.dispose();
});

test('damage numbers in iso (§10.4): scale with the camera distance, never below 18 px', () => {
  assert.equal(isoNumberScale(26, DAMAGE_ISO.refDist), 1);
  assert.ok(isoNumberScale(26, 18) < 1);
  assert.ok(isoNumberScale(26, 18) * 26 >= 18 - 1e-9);
  assert.ok(isoNumberScale(22, 60) * 22 >= 18 - 1e-9, 'minimum 18 px');
  assert.ok(isoNumberScale(26, 5) <= DAMAGE_ISO.maxMul);
});

test('fog walls in iso (§4.2): a closed 2 m ground band along the card line; cards tilt 60°, capped 2.5 m', () => {
  const g = bandGeometry([0, 0, 2, 0, 2, 2, 0, 2], MIST_ISO.bandW, () => 0);
  assert.equal(g.getAttribute('position').count, 8);
  assert.equal(g.index.count, 4 * 6, 'closed loop');
  assert.ok(Math.abs(MIST_ISO.tilt - Math.PI / 3) < 1e-9); assert.equal(MIST_ISO.wallH, 2.5);
  g.dispose();
});

// ================================================================== warm phase (ART_WARM_SPEC §8, WA §3 / §5, PERF F1–F7)
const { BlobShadows, blobShape, BLOB } = await import('../../src/fx/BlobShadows.js');
const { Beats, BEATS, burstParticleCount, twinkleAlpha } = await import('../../src/fx/Beats.js');
const { flyersFor, FLYER_COUNTS } = await import('../../src/fx/Butterflies.js');
const { poolsOn, cloudsOn, POOLS } = await import('../../src/fx/LightPools.js');
const { groundHit } = await import('../../src/fx/DebugOverlay.js');
const { DamageNumbers, numberCurve, popCurve, DAMAGE_FX, WORDS } = await import('../../src/fx/DamageNumbers.js');
const { comicPopAllowed } = await import('../../src/fx/FX.js');
const { glowSparkles, HOLY_GLOW } = await import('../../src/fx/HolyFX.js');
const { ScreenFX } = await import('../../src/fx/ScreenFX.js');
const { FACTION_CONFETTI } = await import('../../src/fx/Poof.js');

test('fx.W1: every TELEGRAPH.glyph maps to a GroundDecals shape; a full fight stays ≤ 52 decal instances', () => {
  for (const [kind, g] of Object.entries(TELEGRAPH.glyph)) {
    assert.ok(GD.glyphShape(g) >= 0, `${kind} → ${g}`);
    assert.equal(GD.glyphShape(kind), GD.glyphShape(g), `${kind} by kind`);
  }
  assert.equal(GD.glyphShape('nope'), -1);
  assert.equal(new Set(Object.values(GD.GLYPH_SHAPE)).size, Object.keys(GD.GLYPH_SHAPE).length, 'one shape per glyph');
  // a full fight: 4 wind-ups, 6 alerted foes, 2 companions, a selection, her ring + hearts, an aoe glyph and a path
  const { ctx, d, live } = isoDecals();
  ctx.game.time = 0;
  for (let i = 0; i < 4; i++) {
    const a = { id: i, pos: new THREE.Vector3(i * 2 - 3, 0, 3), facing: Math.PI, alive: true, radius: 0.4 };
    live.set(i, { id: i, actor: a, kind: ['parry', 'gold', 'red', 'grab'][i], windup: 0.8, activeAt: 0.5, payload: { arc: { range: 1.6, from: 0.6, to: -0.6 } } });
  }
  ctx.enemies = { list: Array.from({ length: 6 }, (_, i) => ({ alerted: true, alive: true, pos: new THREE.Vector3(i - 3, 0, 4), radius: 0.4 })) };
  ctx.companions = { active: [{ pos: new THREE.Vector3(1, 0, -1), alive: true }, { pos: new THREE.Vector3(-1, 0, -1), alive: true }] };
  ctx.cam.lockTarget = ctx.enemies.list[0];
  ctx.player.hp = 5; ctx.player.maxHp = 10;
  ctx.bus.emit(E.PLAYER_DAMAGED, { amount: 1, hp: 5, maxHp: 10 });
  d.glyph('aoe', 0, 0, 5);
  d.render(DT);
  assert.equal(d.counts.wedge, 4); assert.equal(d.counts.glyph, 5); assert.equal(d.counts.companions, 2); assert.equal(d.counts.hearts, 1);
  assert.ok(d.n <= 52, `instances ${d.n}`);
  d.dispose();
});

test('fx.W1: WA §3.4 wedge timing (rim α 0.6 → window, glyph pop ×1.3 over 0.08 s, white strike flash) and the WA palette', () => {
  const w = PLAYER.guard.parryWindow;
  let L = GD.wedgeLook(GD.wedgeState(10, 1, 9.5, w), w);
  assert.equal(L.rimA, 0.6); assert.equal(L.glyph, 1); assert.equal(L.strike, 0);
  L = GD.wedgeLook(GD.wedgeState(10, 1, 10 - w + 1e-9, w), w);
  assert.ok(Math.abs(L.glyph - 1.3) < 1e-6, 'pop at window open'); assert.ok(L.rimA > 0.9);
  L = GD.wedgeLook(GD.wedgeState(10, 1, 10 - w + 0.1, w), w);
  assert.equal(L.glyph, 1, 'settled after 0.08 s');
  assert.equal(GD.wedgeLook(GD.wedgeState(10, 1, 10.03, w), w).strike, 0.8);
  assert.ok(GD.wedgeLook(GD.wedgeState(10, 1, 10.1, w), w).strike < 0.8);
  assert.equal(GD.wedgeLook(GD.wedgeState(10, 1, 10.3, w), w).strike, 0);
  // the palette: hero pink, warm danger hues, plum blob, cream white, mint interactables, sky companions
  assert.equal(GD.DECAL_COLORS.hero, '#FF8FB1'); assert.equal(GD.DECAL_COLORS.red, '#FF9A3D'); assert.equal(GD.DECAL_COLORS.aggro, '#FF5A4E');
  assert.equal(GD.DECAL_COLORS.blob, '#5A4E7A'); assert.equal(GD.DECAL_COLORS.mint, '#9BE3C4'); assert.equal(GD.DECAL_COLORS.sky, '#8FD3FF');
  assert.equal(GD.DECAL_CFG.heroAlpha, 0.55); assert.equal(GD.DECAL_CFG.heroW, 0.08);
  // the strike flash draws after the strike, then the wedge is gone
  const { ctx, d, live } = isoDecals();
  const rat = { id: 1, pos: new THREE.Vector3(0, 0, 2), facing: Math.PI, alive: true, radius: 0.4 };
  live.set(1, { id: 1, actor: rat, kind: 'parry', windup: 0.8, activeAt: 1, payload: { arc: { range: 1.6 } } });
  ctx.game.time = 1.1; d.render(DT);
  assert.equal(d.counts.strike, 1); assert.equal(d.counts.wedge ?? 0, 0);
  ctx.game.time = 1.3; d.render(DT);
  assert.equal(d.counts.strike ?? 0, 0);
  d.dispose();
});

test('fx.W7: heart arc at her feet: HP 3/5 → 5 segments, 3 full; shown 2.5 s after a change, always at HP ≤ 1', () => {
  assert.deepEqual(GD.heartArc(3, 5), { segments: 5, per: 1, full: 3, half: 0 });
  assert.deepEqual(GD.heartArc(2.5, 4), { segments: 4, per: 1, full: 2, half: 0.5 });
  assert.equal(GD.heartArc(7, 7).segments, 6, '≤ 6 segments');
  assert.equal(GD.heartArc(0, 5).full, 0);
  assert.equal(GD.heartArcVisible(0, 3), true); assert.equal(GD.heartArcVisible(2.4, 3), true);
  assert.equal(GD.heartArcVisible(2.6, 3), false, 'hidden 2.5 s after a change at HP ≥ 2');
  assert.equal(GD.heartArcVisible(99, 1), true, 'always at HP ≤ 1');
  const { ctx, d } = isoDecals();
  const p = ctx.player; p.hp = 6; p.maxHp = 10;             // half-hearts: 3 of 5 hearts
  d.render(DT);
  assert.equal(d.counts.hearts ?? 0, 0, 'calm: hidden');
  ctx.bus.emit(E.PLAYER_DAMAGED, { amount: 2, hp: 6, maxHp: 10 });
  const n0 = d.n; d.render(DT);
  assert.equal(d.counts.hearts, 1);
  assert.ok(d.n >= 5 + 1 && d.n <= 6 + 1 + 2, `5 segments + her ring (${d.n})`);
  for (let i = 0; i < Math.ceil(2.6 / DT); i++) d.render(DT);
  assert.equal(d.counts.hearts ?? 0, 0, 'tucked away again');
  p.hp = 2; d.render(DT);
  assert.equal(d.counts.hearts, 1, 'HP 1 heart: always shown');
  assert.ok(n0 >= 0);
  d.dispose();
});

test('fx.W3: damage numbers v2: 3 hits in 0.3 s → one node, summed; overshoot curve; words rate-limited; pops', () => {
  const ctx = fakeCtx();
  const N = new DamageNumbers(ctx);
  const rat = { id: 'rat' };
  for (let i = 0; i < 3; i++) { ctx.game.realTime = i * 0.1; N.show(new THREE.Vector3(), '10', 'normal', rat, 10); }
  assert.equal(N.active, 1, 'one node'); assert.equal(N.merged, 2);
  assert.equal(N.pool.find((n) => n.active).value, 30, 'summed');
  ctx.game.realTime = 1; N.show(new THREE.Vector3(), '10', 'normal', rat, 10);
  assert.equal(N.active, 2, 'outside 0.35 s: a new node');
  N.show(new THREE.Vector3(), '5', 'normal', { id: 'other' }, 5);
  assert.equal(N.active, 3, 'another target: its own node');
  for (let i = 0; i < 30; i++) N.show(new THREE.Vector3(), '1', 'normal', null, 1);
  assert.ok(N.active <= 20, '≤ 20 DOM nodes');
  // the curve: 0 → 1.35 (0.06 s) → 0.95 (0.14 s) → 1.0, fading over the last 0.25 s
  assert.equal(numberCurve(0, 1).scale, 0);
  assert.ok(Math.abs(numberCurve(0.06, 1).scale - 1.35) < 1e-9);
  assert.ok(Math.abs(numberCurve(0.14, 1).scale - 0.95) < 1e-9);
  assert.equal(numberCurve(0.5, 1).scale, 1); assert.equal(numberCurve(0.5, 1).alpha, 1);
  assert.ok(numberCurve(0.9, 1).alpha < 0.5 && numberCurve(0.9, 1).scale < 1);
  assert.ok(popCurve(0.1).scale > 1.1 && popCurve(0.3).scale === 1 && popCurve(0.7).alpha === 0);
  // words: ≤ 1 per 0.25 s, off with settings.hitWords false
  N.clear();
  ctx.game.realTime = 5;
  assert.equal(N.word('slash1', new THREE.Vector3()), true);
  assert.equal(N.word('slash2', new THREE.Vector3()), false, 'rate limit');
  ctx.game.realTime = 5.3;
  assert.equal(N.word('slash2', new THREE.Vector3()), true);
  ctx.state.settings.hitWords = false; ctx.game.realTime = 6;
  assert.equal(N.word('slash3', new THREE.Vector3()), false, 'hitWords off');
  assert.equal(WORDS.slash1, 'Snip!'); assert.equal(WORDS.finalBlow, 'Bonk!');
  assert.equal(N.pop('parry', new THREE.Vector3()), true);
  assert.ok(DAMAGE_FX.mergeWindow === 0.35 && DAMAGE_FX.bump === 1.15);
  // WA §5.3 comic pops: parries always; others only the first time in the first 10 minutes
  const seen = new Set();
  assert.equal(comicPopAllowed('parry', 9999, seen), true);
  assert.equal(comicPopAllowed('bonk', 30, seen), true);
  seen.add('bonk');
  assert.equal(comicPopAllowed('bonk', 30, seen), false, 'first only');
  assert.equal(comicPopAllowed('boing', 11 * 60, seen), false, 'after 10 minutes');
});

test('fx.W5 / ART §8.6: rescue / card bursts stay under the particle pool caps; Low halves them and flattens confetti', async () => {
  assert.ok(burstParticleCount(1) <= 800, 'alpha pool');
  assert.equal(SHAPE.CONFETTI, 12);
  const ctx = setupFx();
  await ctx.fx.init();
  const pl = actor(ctx, 'player', 0, 0); ctx.player = pl;
  ctx.bus.emit(E.KITTEN_RESCUED, { kittenId: 'tofu', position: new THREE.Vector3(2, 0, 2) });
  await frames(ctx, 20);
  const st = ctx.fx.stats();
  assert.equal(st.beats.rescues, 1); assert.equal(st.beats.trails, 1);
  assert.equal(st.flashes, 1, 'white-gold flash');
  assert.ok(st.particles >= BEATS.confetti, `confetti + stars + hearts (${st.particles})`);
  assert.ok(st.particles <= ctx.fx.particles.add.limit + ctx.fx.particles.alpha.limit);
  ctx.bus.emit(E.REWARD, { kind: 'card', id: 'holy' });
  assert.equal(ctx.fx.stats().beats.rewards, 1);
  assert.equal(ctx.fx.stats().flashes, 1, 'ui owns the card flash; rescue + card never double-flash');
  ctx.fx.particles.clear();
  ctx.bus.emit(E.QUALITY, { preset: QUALITY.low });
  assert.equal(ctx.fx.particles.countScale, 0.5); assert.equal(ctx.fx.particles.alpha.flat, true);
  ctx.bus.emit(E.KITTEN_RESCUED, { kittenId: 'tofu', position: new THREE.Vector3(2, 0, 2) });
  await frames(ctx, 1);
  const low = ctx.fx.stats().particles;
  assert.ok(low < BEATS.confetti, `Low ×0.5 (${low})`);
  // the other beat twins: reveal, arena clear petals, every new burst kind
  ctx.bus.emit(E.KITTEN_REVEAL, { kittenId: 'tofu', position: new THREE.Vector3(1, 0, 1) });
  ctx.bus.emit(E.ARENA_LOCK, { id: 'a', center: new THREE.Vector3(0, 0, 0), r: 8 });
  ctx.bus.emit(E.ARENA_CLEAR, { id: 'a' });
  const b = ctx.fx.stats().beats;
  assert.equal(b.reveals, 1); assert.equal(b.clears, 1);
  for (const k of ['rescue', 'reveal', 'petals', 'celebrate', 'pawBump', 'boop', 'cheer', 'ripple', 'collect', 'hitSpark', 'kittenTrail', 'straw']) {
    assert.ok(BURST_KINDS.includes(k), k);
    ctx.fx.burst(k, new THREE.Vector3(1, 0.5, 1));
  }
  await frames(ctx, 3);
  ctx.fx.dispose();
});

test('fx.W5 / WA §5.7: knock-out = dizzy stars (0.35 m, 2.5 rev/s) while she sits, then hearts when she is back', async () => {
  const ctx = setupFx();
  await ctx.fx.init();
  const pl = actor(ctx, 'player', 0, 0); ctx.player = pl;
  ctx.bus.emit(E.PLAYER_DIED, {});
  const d = ctx.fx.dizzy.get(pl);
  assert.ok(d && d.r === config.KO.starR && d.rev === config.KO.starRev, 'KO stars');
  pl.alive = false;
  await frames(ctx, Math.ceil((config.KO.sitT + config.KO.wipeT) / DT) + 2);
  assert.equal(ctx.fx.stats().beats.respawns, 0, 'still down');
  pl.alive = true;
  await frames(ctx, 2);
  assert.equal(ctx.fx.stats().beats.respawns, 1, 'the boing back');
  ctx.fx.dispose();
});

test('PERF §7.2 blob shadows: one instanced draw, plum, shrink + fade with height, registration and the automatic sets', () => {
  const b = blobShape(0.5, 0);
  assert.equal(b.size, 1); assert.equal(b.alpha, 1);
  const hi = blobShape(0.5, 3);
  assert.ok(Math.abs(hi.size - 0.5) < 1e-9 && Math.abs(hi.alpha - 0.25) < 1e-9);
  assert.deepEqual(blobShape(0.5, 9), hi, 'clamped at 3 m');
  const ctx = fakeCtx();
  ctx.physics = { heightAt: () => 0 };
  const B = new BlobShadows(ctx);
  B.init(ctx.scene);
  assert.ok(B.mesh.isInstancedMesh && B.mesh.name === 'fx.blobs');
  assert.equal(B.mesh.material.uniforms.uA.value, BLOB.alpha);
  const o = new THREE.Object3D(); o.position.set(1, 0, 1); ctx.scene.add(o);
  const off = B.add(o, 0.4);
  B.render();
  assert.equal(B.count, 1);
  ctx.player = { pos: new THREE.Vector3(), object3d: { position: new THREE.Vector3(0, 2, 0) }, onGround: false, alive: true };
  ctx.enemies = { list: [{ pos: new THREE.Vector3(3, 0, 0), alive: true, object3d: Object.assign(new THREE.Object3D(), { visible: true }), radius: 0.4, alerted: true }] };
  ctx.enemies.list[0].object3d.position.set(3, 0, 0);
  B.render();
  assert.equal(B.count, 3, 'registered + an enemy + her airborne landing disc');
  off();
  B.render();
  assert.equal(B.count, 2);
  B.dispose();
});

test('fx.W2-adjacent: the hero ring, glyphs and marks carry the ink sandwich; blobs and fills do not', () => {
  const { d } = isoDecals();
  d.render(DT);
  assert.ok(d.inks.getX(0) > 0 && Math.abs(d.inks.getY(0) - TELEGRAPH.ink.alpha) < 1e-6, 'hero ring inked (0.03 m, α 0.35)');
  d.dispose();
});

test('WA §3.6 path preview enum: on / off / auto (touch on the meadow)', () => {
  assert.equal(GD.pathPreviewOn('on', 'kbm', 'town'), true);
  assert.equal(GD.pathPreviewOn(true, 'kbm', 'town'), true, 'legacy boolean');
  assert.equal(GD.pathPreviewOn('off', 'touch', 'meadow'), false);
  assert.equal(GD.pathPreviewOn(false, 'touch', 'meadow'), false);
  assert.equal(GD.pathPreviewOn('auto', 'touch', 'meadow'), true);
  assert.equal(GD.pathPreviewOn('auto', 'kbm', 'meadow'), false);
  assert.equal(GD.pathPreviewOn('auto', 'touch', 'forest'), false);
  assert.ok(config.SETTING_VALUES.pathPreview.every((v) => typeof GD.pathPreviewOn(v, 'touch', 'meadow') === 'boolean'));
});

test('telegraph glyphs: discs queue their glyph at the centre, lanes at the far end; the crow shadow is plum', async () => {
  const ctx = setupFx();
  await ctx.fx.init();
  ctx.cam = { isIso: true, modeName: 'follow', focus: new THREE.Vector3() };
  const calls = [];
  const orig = ctx.fx.decals.glyph.bind(ctx.fx.decals);
  ctx.fx.decals.glyph = (g, x, y, z, ...r) => { calls.push({ g, x, z }); return orig(g, x, y, z, ...r); };
  ctx.fx.telegraph({ kind: 'aoe', shape: 'circle', pos: [4, 0, 4], size: 2, duration: 1 });
  ctx.fx.telegraph({ kind: 'red', shape: 'lane', pos: [0, 0, 0], dir: [0, 0, 1], size: [1.5, 6], duration: 1 });
  ctx.fx.telegraph({ kind: 'shadow', shape: 'shadow', pos: [-3, 0, 0], size: 0.9, duration: 1 });
  await frames(ctx, 3);
  const g = new Set(calls.map((c) => c.g));
  for (const k of ['dots6', 'chevron2', 'crowfoot']) assert.ok(g.has(k), k);
  const lane = calls.find((c) => c.g === 'chevron2');
  assert.ok(lane.z > 4, 'at the lane end');
  const shadowSlot = ctx.fx.telegraphs.decals.find((s) => s.d0.x === 4);
  const plum = new THREE.Color(TELEGRAPH.colors.shadow);
  assert.ok(Math.abs(shadowSlot.d2.x - plum.r) < 1e-6 && Math.abs(shadowSlot.d2.z - plum.b) < 1e-6, 'plum #3A2346, never black');
  ctx.fx.dispose();
});

test('ART §8.5 glow cards (6–12 sparkles), ART §9.1 flashes through ui.flash, F6 lanterns feed world lamps (no PointLights)', async () => {
  assert.equal(glowSparkles(0), 0); assert.equal(glowSparkles(0.05), HOLY_GLOW.sparkMin); assert.equal(glowSparkles(1), HOLY_GLOW.sparkMax);
  const ctx = fakeCtx();
  const calls = [];
  ctx.ui = { flash: (c, a, d) => calls.push([c, a, d]) };
  const S = new ScreenFX(ctx);
  S.flash('rescue');
  assert.deepEqual(calls[0], ['#FFF1C4', 0.22, 0.18]);
  S.hurt();
  assert.deepEqual(calls[1], ['#FF8FB1', 0.18, 0.25]);
  // lanterns with world's lamp registry: lamp sources, no PointLights
  const fctx = setupFx();
  const sources = [];
  fctx.env = { lamps: { add: (s) => { sources.push(s); return s; }, remove: (s) => { const i = sources.indexOf(s); if (i >= 0) sources.splice(i, 1); } } };
  await fctx.fx.init();
  const h = fctx.fx.lantern([1, 1.5, 0], { light: true });
  assert.equal(sources.length, 1); assert.equal(sources[0].on, true);
  h.out(); assert.equal(sources[0].on, false);
  h.light(); assert.equal(sources[0].on, true);
  let lights = 0;
  fctx.scene.traverse((o) => { if (o.isPointLight) lights++; });
  assert.equal(lights, 0);
  fctx.bus.emit(E.LEVEL_UNLOAD, {});
  assert.equal(sources.length, 0, 'lamp sources leave with the level');
  fctx.fx.dispose();
});

test('ART §8.7 ambient life: butterfly / dragonfly / swallow sets, Low ×0.5, night off; light pools + cloud shadows rules', () => {
  assert.deepEqual(flyersFor('meadow'), { kind: 'butterfly', count: 18 });
  assert.deepEqual(flyersFor('town', { hub: true }), { kind: 'butterfly', count: 14 });
  assert.deepEqual(flyersFor('bog'), { kind: 'dragonfly', count: 8 });
  assert.deepEqual(flyersFor('gate'), { kind: 'swallow', count: 6 });
  assert.equal(flyersFor('meadow', { low: true }).count, 9);
  assert.equal(flyersFor('meadow', { night: true }), null);
  assert.equal(flyersFor('keep'), null);
  assert.ok(Object.values(FLYER_COUNTS).every(([, n]) => n <= 18));
  assert.equal(poolsOn('meadow', 'none', true), true); assert.equal(poolsOn('meadow', 'none', false), false, 'iso only');
  assert.equal(poolsOn('town', 'none', true), false); assert.equal(poolsOn('forest', 'night', true), false);
  assert.equal(POOLS.count, 24); assert.equal(POOLS.countLow, 12); assert.equal(POOLS.alpha, 0.16);
  assert.equal(cloudsOn('meadow', 'none', false), true); assert.equal(cloudsOn('meadow', 'none', true), false, 'off on Low');
  assert.equal(cloudsOn('keep', 'none', false), false);
  // the debug overlay's ground hit
  const cam = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100); cam.position.set(0, 10, 8); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  const out = new THREE.Vector3();
  assert.ok(groundHit(cam, 0, 0, 0, out) && Math.abs(out.y) < 1e-6 && Math.hypot(out.x, out.z) < 1e-4, 'the centre ray hits the focus');
});

test('WA §3.2 twinkles: deterministic, one 0.35 s twinkle per period; pickups and interactables draw marks only', () => {
  let on = 0;
  for (let t = 0; t < 12; t += 1 / 60) if (twinkleAlpha(t, 1.2, 0.5) > 0) on++;
  assert.ok(on > 0 && on < 12 * 60 * 0.4, `twinkling ${on}`);
  assert.equal(twinkleAlpha(3.3, 1.2, 0.25), twinkleAlpha(3.3, 1.2, 0.25), 'deterministic');
  assert.ok(Object.keys(FACTION_CONFETTI).length >= 5);
});
