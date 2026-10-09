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
import { bloomTarget, vignetteOpacity, LOW_HP } from '../../src/fx/ScreenFX.js';
import { debrisFor, helmetFor, DEBRIS_KINDS, DEBRIS_ALIAS } from '../../src/fx/Poof.js';
import { ringCardPositions, rectCardPositions, AMBIENT_DENSITY } from '../../src/fx/MistCards.js';
import { hordeLayout, hordeMode, partOffset, buildHordeGeometry, HORDE } from '../../src/fx/Horde.js';
import { motesFor, MOTES } from '../../src/fx/Ambient.js';
import { ParticlePool, particleSpec, SHAPE } from '../../src/fx/Particles.js';
import { toVec3, hash01, spikeEnvelope, visualDt, auraOwner, resolveBlade } from '../../src/fx/util.js';

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
  assert.equal(TELEGRAPH.colors.red, '#FF3B30');
  assert.equal(TELEGRAPH.colors.aoe, '#FF6A3D');
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
  assert.deepEqual(formatDamage({ damage: 10 }), { text: '10', style: 'normal' });
  assert.deepEqual(formatDamage({ damage: 19.6, crit: true }), { text: '20', style: 'crit' });
  assert.equal(formatDamage({ damage: 20, heavy: true }).style, 'heavy');
  assert.equal(formatDamage({ damage: 10, blocked: true }), null);
  assert.equal(formatDamage({ damage: 0 }), null);
  assert.deepEqual(formatHeal(4), { text: '+4', style: 'heal' });
  assert.equal(formatHeal(0), null);
  assert.equal(DAMAGE_STYLE.crit.color, '#FFD34D');
  assert.equal(DAMAGE_STYLE.heal.color, '#7FD38A');
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
  // red hurt vignette lasts PLAYER.hurt.vignette; low HP pulses at 1 Hz; reduce flashes halves it
  assert.equal(vignetteOpacity(Infinity, 8, 0), 0);
  assert.ok(vignetteOpacity(0.05, 8, 0) > 0.5);
  assert.equal(vignetteOpacity(PLAYER.hurt.vignette + 0.01, 8, 0), 0);
  const lo0 = vignetteOpacity(Infinity, LOW_HP, 0.25), lo1 = vignetteOpacity(Infinity, LOW_HP, 0.75);
  assert.ok(lo0 > lo1 && lo1 > 0, 'low-HP pulse');
  assert.ok(Math.abs(vignetteOpacity(Infinity, LOW_HP, 1.25) - lo0) < 1e-9, '1 Hz period');
  assert.equal(vignetteOpacity(Infinity, LOW_HP + 1, 0.25), 0);
  assert.ok(Math.abs(vignetteOpacity(0.05, 8, 0, { reduce: true }) - vignetteOpacity(0.05, 8, 0) / 2) < 1e-9);
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

test('ambient motes per level / night', () => {
  assert.equal(motesFor('meadow'), 'fluff');
  assert.equal(motesFor('meadow', 'night'), 'fireflies');
  assert.equal(motesFor('keep'), 'embers');
  assert.equal(motesFor('sky'), null);
  for (const id of ['meadow', 'forest', 'town', 'gate', 'bog', 'keep']) assert.ok(MOTES[motesFor(id)], id);
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
    'fx.holy.sparkles', 'fx.holy.light', 'fx.horde', 'fx.ambient', 'fx.mist.ambient']) assert.ok(names.has(n), `scene has ${n}`);
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
  assert.ok(ctx.fx.telegraphs.decals.filter((d) => d.mesh.visible).length >= 7, 'decals for aoe shapes, shadow and jeer rings');
  assert.equal(ctx.fx.telegraphs.lines.filter((l) => l.mesh.visible).length, 1, 'one aim line');
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
  await frames(ctx, 1);
  assert.ok(ctx.fx.stats().vignette > 0.3, 'red hurt vignette');
  await frames(ctx, 30);
  assert.equal(ctx.fx.stats().vignette, 0);
  pl.hp = 2;
  await frames(ctx, 15);
  assert.ok(ctx.fx.stats().vignette > 0.1, 'low-HP pulse');
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
  ctx.postfx = { bloomBase: { strength: 0.6, threshold: 0.85, radius: 0.4 }, setBloom(s) { bloom = s; }, resetBloom() { reset++; bloom = 0.6; }, get bloom() { return bloom ?? 0.6; } };
  await ctx.fx.init();
  const kit = { v: 0, setHoly(v) { this.v = v; } };
  const pl = actor(ctx, 'player', 0, 0); pl.model = { k: kit }; ctx.player = pl;
  ctx.actors.register(pl, 'swordcat');
  ctx.fx.holy('swordcat', 0.8);
  assert.equal(kit.v, 0.8, 'forwarded by cutscene id');
  await frames(ctx, 30);
  const st = ctx.fx.stats();
  assert.ok(st.holy.player > 0.7, 'level eases up');
  assert.ok(st.holy.light > 0.2, 'warm point light');
  assert.ok(bloom > 1.0, `bloom raised (${bloom})`);
  ctx.fx.holy(pl, 0);
  assert.equal(kit.v, 0);
  await frames(ctx, 120);
  assert.equal(ctx.fx.stats().holy.light, 0);
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
