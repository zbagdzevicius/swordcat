// tests/unit/contracts.test.js  (owner: core) — U18 + the frozen M0 contracts (§19.2–§19.4, §19.8, tech.md §4).
// Every system exports init/update/dispose; ctx services expose the §19.3 API; entities expose §19.4;
// ScriptedActor methods exist on Player, NpcActor, Companion, Enemy and Pudding; no DOM at import.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import * as config from '../../src/core/config.js';
import { EventBus } from '../../src/core/EventBus.js';
import { ActorRegistry } from '../../src/core/ActorRegistry.js';
import { GameState, defaultState } from '../../src/core/GameState.js';
import { Input } from '../../src/core/Input.js';
import { Assets } from '../../src/core/Assets.js';
import { Actor } from '../../src/core/Actor.js';
import { createRng } from '../../src/core/rng.js';
import { SCRIPTED_METHODS } from '../../src/core/ScriptedActor.js';
import { SYSTEMS, STEP_ORDER, RENDER_ORDER, INIT_ORDER, MODE_GATES, GAMEPLAY_SYSTEMS } from '../../src/core/systems.js';
import * as strings from '../../src/story/strings.js';
import { fakeCtx } from './_fakeCtx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'src');

const fn = (o, m) => typeof o?.[m] === 'function';

test('U18: every system class implements init / update / dispose (tech.md §4.2)', () => {
  for (const s of SYSTEMS) {
    for (const m of ['init', 'update', 'dispose']) assert.ok(fn(s.Class.prototype, m), `${s.file}: ${s.Class.name}.${m}() missing`);
    if ('render' in s.Class.prototype) assert.ok(fn(s.Class.prototype, 'render'), `${s.file}: render must be a function`);
  }
  assert.ok(fn(Input.prototype, 'init') && fn(Input.prototype, 'update') && fn(Input.prototype, 'dispose'), 'Input contract');
});

test('system tables: every system is in the step, render and init orders; gates follow §19.1 A7', () => {
  const keys = ['input', ...SYSTEMS.map((s) => s.key)];
  for (const k of keys) {
    assert.ok(STEP_ORDER.includes(k), `${k} not in STEP_ORDER`);
    assert.ok(INIT_ORDER.includes(k), `${k} not in INIT_ORDER`);
    if (k !== 'input') assert.ok(RENDER_ORDER.includes(k), `${k} not in RENDER_ORDER`);
  }
  // §19.2 fixed-step order
  const idx = (k) => STEP_ORDER.indexOf(k);
  const chain = ['input', 'story', 'player', 'companions', 'enemies', 'combat', 'physics', 'levels', 'fx'];
  for (let i = 1; i < chain.length; i++) assert.ok(idx(chain[i - 1]) < idx(chain[i]), `step order: ${chain[i - 1]} before ${chain[i]}`);
  // per frame: camera → fx → ui → audio, after the actors
  const r = (k) => RENDER_ORDER.indexOf(k);
  for (const a of ['player', 'companions', 'enemies']) assert.ok(r(a) < r('cam'), `${a} renders before the camera`);
  assert.ok(r('cam') < r('fx') && r('fx') < r('ui') && r('ui') < r('audio'), 'render order camera → fx → ui → audio');
  for (const m of ['dialog', 'cutscene']) {
    for (const k of ['story', 'player', 'companions', 'enemies', 'cam', 'fx', 'ui', 'audio']) assert.ok(MODE_GATES[m].has(k), `${m} gate must include ${k}`);
    for (const k of ['combat', 'physics', 'levels', 'objectives']) assert.ok(!MODE_GATES[m].has(k), `${m} gate must exclude ${k}`);
  }
  assert.equal(MODE_GATES.play, null); assert.equal(MODE_GATES.memecam, null);
  for (const k of ['player', 'enemies', 'combat']) assert.ok(GAMEPLAY_SYSTEMS.has(k));
  assert.deepEqual([...config.MODES].sort(), ['cutscene', 'dialog', 'memecam', 'menu', 'play']);
});

const SERVICE_API = {
  physics: ['setLevel', 'moveActor', 'separateActors', 'raycast', 'heightAt', 'isDeepWater', 'clampToBounds'],
  cam: ['mode', 'preset', 'shake'],
  player: ['teleport', 'heal', 'addValor', 'setValor', 'resolveIncoming'],
  combat: ['beginSwing', 'updateSwing', 'applyHit', 'spawnProjectile'],
  enemies: ['spawn', 'spawnWave', 'despawn'],
  companions: ['setActive', 'spawnNpc', 'spawnKitten'],
  levels: ['load', 'anchor', 'arenaNear', 'setVisible'],
  env: ['set', 'contribute', 'clear', 'preset'],
  objectives: ['start', 'progress', 'freeze', 'complete'],
  fx: ['burst', 'telegraph', 'holy', 'mistRing', 'horde'],
  audio: ['play2D', 'play3D', 'music', 'laugh', 'bell'],
  story: ['play', 'flag', 'skip'],
  ui: ['loading'],
  save: ['load', 'write', 'clear'],
  input: ['down', 'pressed', 'released', 'heldTime', 'consumeLook', 'endStep', 'setVirtual', 'setVirtualMove', 'addLook', 'rumble'],
  assets: ['gltf', 'model', 'texture', 'hdr', 'preload', 'preloadLevel', 'url'],
  actors: ['register', 'unregister', 'get', 'byTag', 'queryRadius', 'nearest'],
};
const SERVICE_FIELDS = {
  combat: ['tokens'], enemies: ['list', 'boss'], companions: ['active', 'pudding'], levels: ['current', 'loading'],
  story: ['isPlaying'], cam: ['yaw', 'pitch'], input: ['move'], env: ['fogDensity'],
  player: ['stateName', 'hp', 'maxHp', 'lives', 'milk', 'milkMax', 'grit', 'guarding', 'guardT', 'charge', 'golden', 'valor', 'shards', 'swing', 'god', 'memeCamTrigger'],
};

test('§19.3: ctx services expose the shared API after construction', () => {
  const ctx = fakeCtx();
  for (const [key, methods] of Object.entries(SERVICE_API)) for (const m of methods) assert.ok(fn(ctx[key], m), `ctx.${key}.${m}() missing`);
  for (const [key, fields] of Object.entries(SERVICE_FIELDS)) for (const f of fields) assert.ok(f in ctx[key], `ctx.${key}.${f} missing`);
  assert.ok(Array.isArray(ctx.enemies.list) && Array.isArray(ctx.companions.active), 'list / active are arrays');
  assert.ok(fn(ctx.player.memeCamTrigger, 'fastForward'), 'player.memeCamTrigger.fastForward (debug idle hook)');
  assert.ok(fn(ctx.combat.tokens, 'acquire') && fn(ctx.combat.tokens, 'release'), 'combat.tokens.acquire/release');
  assert.equal(typeof ctx.strings.t('nope.key'), 'string');
});

test('§19.4: ScriptedActor methods on Player, NpcActor, Companion, Enemy, Pudding (and LostKitten)', async () => {
  const mods = {
    Player: (await import('../../src/player/Player.js')).Player,
    NpcActor: (await import('../../src/companions/NpcActor.js')).NpcActor,
    Companion: (await import('../../src/companions/Companion.js')).Companion,
    Enemy: (await import('../../src/enemies/Enemy.js')).Enemy,
    Pudding: (await import('../../src/companions/Pudding.js')).Pudding,
    LostKitten: (await import('../../src/companions/LostKitten.js')).LostKitten,
  };
  for (const [name, Cls] of Object.entries(mods)) {
    assert.ok(Cls.prototype instanceof Actor, `${name} extends core Actor`);
    for (const m of SCRIPTED_METHODS) assert.ok(fn(Cls.prototype, m), `${name}.${m}() missing`);
  }
});

test('§19.4: entity APIs (Enemy, Boss, Companion, LostKitten, Player)', async () => {
  const { Enemy } = await import('../../src/enemies/Enemy.js');
  const { Boss } = await import('../../src/enemies/Boss.js');
  const { Companion } = await import('../../src/companions/Companion.js');
  const { LostKitten } = await import('../../src/companions/LostKitten.js');
  for (const m of ['setState', 'telegraph', 'stagger', 'onParried']) assert.ok(fn(Enemy.prototype, m), `Enemy.${m}`);
  assert.ok(Boss.prototype instanceof Enemy, 'Boss extends Enemy');
  for (const m of ['addDizzy', 'fillDizzy', 'setHpFrac', 'freeShard']) assert.ok(fn(Boss.prototype, m), `Boss.${m}`);
  assert.ok(fn(Companion.prototype, 'useAbility'));
  for (const m of ['reveal', 'rescue']) assert.ok(fn(LostKitten.prototype, m), `LostKitten.${m}`);

  const ctx = fakeCtx();
  const e = ctx.enemies.spawn('rat_pike', new THREE.Vector3(3, 0, 3));
  for (const f of ['def', 'stateName', 'objectiveRunner']) assert.ok(f in e, `Enemy.${f}`);
  const b = ctx.enemies.spawn('boss_barkus', new THREE.Vector3(0, 0, 10));
  for (const f of ['phase', 'dizzy', 'dizzyMax', 'hpFloor']) assert.ok(f in b, `Boss.${f}`);
  assert.equal(ctx.enemies.boss, b);
  const c = new Companion(ctx, 'mochi');
  for (const f of ['kittenId', 'napT', 'cooldown']) assert.ok(f in c, `Companion.${f}`);
  const k = ctx.companions.spawnKitten('noodle', new THREE.Vector3(), 'meow');
  assert.equal(k.kittenId, 'noodle'); assert.equal(k.hidden, true);
  const pud = ctx.companions.spawnNpc('pudding', new THREE.Vector3(2, 0, 30), Math.PI);
  assert.equal(ctx.companions.pudding, pud);
  assert.equal(ctx.actors.get('pudding'), pud, 'cutscene lookup by actor id (A5)');
  ctx.enemies.clear();
  assert.equal(ctx.enemies.list.length, 0);
});

test('tech.md §4.3: Actor base fields and methods', () => {
  const a = new Actor({}, { faction: 'enemy', radius: 0.5, height: 2, maxHp: 7, mass: 3, maxPoise: 4 });
  for (const f of ['id', 'faction', 'object3d', 'pos', 'prevPos', 'vel', 'facing', 'prevFacing', 'radius', 'height', 'mass', 'hp', 'maxHp',
    'poise', 'maxPoise', 'invulnT', 'staggerT', 'onGround', 'alive', 'hurtable', 'tags']) assert.ok(f in a, `Actor.${f}`);
  for (const m of ['beginStep', 'onHit', 'onDeath', 'render', 'dispose']) assert.ok(fn(a, m), `Actor.${m}`);
  assert.equal(a.hp, 7); assert.equal(a.faction, 'enemy'); assert.ok(a.tags instanceof Set);
  a.pos.set(1, 0, 0); a.beginStep(); a.pos.set(3, 0, 0); a.render(0.5);
  assert.equal(a.object3d.position.x, 2, 'render interpolates prevPos → pos');
});

test('public data modules: strings, attacks, LevelKit + the six levels (A1), save schema = GameState', async () => {
  assert.equal(typeof strings.S, 'object'); assert.equal(typeof strings.t, 'function');
  const { ATTACKS } = await import('../../src/combat/attacks.js');
  for (const [k, v] of Object.entries(ATTACKS)) assert.equal(v.id, k, `ATTACKS.${k}.id`);
  const { defineLevel } = await import('../../src/world/LevelKit.js');
  assert.equal(typeof defineLevel, 'function');
  const { LEVELS } = await import('../../src/world/LevelManager.js');
  assert.deepEqual(Object.keys(LEVELS).sort(), [...config.LEVEL_IDS].sort());
  for (const id of config.LEVEL_IDS) {
    const def = (await LEVELS[id]()).default;
    assert.equal(def.id, id, `levels/${id}.js id`);
    assert.equal(typeof def.build, 'function', `levels/${id}.js build()`);
    assert.ok(def.spawns?.start, `levels/${id}.js defines spawn "start"`);
  }
  for (const id of ['forest', 'gate', 'bog', 'keep']) assert.ok((await LEVELS[id]()).default.spawns.boss, `${id} defines spawn "boss" (§12.1)`);
  const save = await import('../../src/save/SaveManager.js');
  assert.equal(typeof save.migrate, 'function');
  assert.deepEqual(save.defaultSave(), defaultState(), 'save defaultSave matches core GameState (§19.7)');
});

test('characters/index.js exports the A3 contract (buildKitten, buildBeastHead)', async (t) => {
  const f = path.join(SRC, 'characters', 'index.js');
  if (!fs.existsSync(f)) { t.skip('characters/index.js not created yet'); return; }
  const m = await import(pathToFileURL(f).href);
  assert.equal(typeof m.buildKitten, 'function', 'buildKitten');
  assert.equal(typeof m.buildBeastHead, 'function', 'buildBeastHead');
});

test('§19.8: __GAME__ test hooks are all installed (and events is a 200-entry ring buffer)', async () => {
  const { installDebug } = await import('../../src/core/debug.js');
  const ctx = fakeCtx();
  const game = { ctx, params: { test: true }, frameCount: 0, mode: 'play', setMode() {}, addFrameHook: () => () => {} };
  ctx.game = game;
  globalThis.window = {};
  try {
    const G = installDebug(game);
    assert.equal(window.__GAME__, G);
    for (const k of ['ready', 'frame', 'levelId', 'state', 'loadLevel', 'teleport', 'god', 'skipDialog', 'sampleCanvas', 'idle', 'startBoss', 'spawn', 'kittens', 'objective', 'events'])
      assert.ok(k in G, `__GAME__.${k}`);
    for (const k of ['play', 'flag', 'skip']) assert.ok(fn(G.story, k), `__GAME__.story.${k}`);
    for (const k of ['setValor', 'setShards', 'setHp']) assert.ok(fn(G.player, k), `__GAME__.player.${k}`);
    for (const k of ['setHpFrac', 'phase', 'freeShard']) assert.ok(fn(G.boss, k), `__GAME__.boss.${k}`);
    assert.ok(fn(G.cam, 'mode'));
    // PERF §12 / ART §11.1 / AUTOCAM §11 (C1, A:core.6, M:core.5)
    assert.equal(typeof G.perf, 'function');
    for (const k of ['snapshot', 'reset', 'setScale', 'viewport']) assert.ok(fn(G.perf, k), `__GAME__.perf.${k}`);
    for (const k of ['frameStats', 'heroChroma', 'featurePx', 'shadowRatio', 'programs']) assert.ok(fn(G.art, k), `__GAME__.art.${k}`);
    assert.ok('composerActive' in G.art);
    for (const k of ['probe', 'framing']) assert.ok(fn(G.cam, k), `__GAME__.cam.${k}`);
    for (let i = 0; i < 250; i++) ctx.bus.emit('ui:toast', { text: String(i) });
    assert.equal(G.events.length, 200);
    G.kittens(4); assert.deepEqual(ctx.state.kittens, config.KITTEN_IDS.slice(0, 4));
    G.player.setShards(2); assert.equal(ctx.state.shards, 2);
    G.player.setValor(50); assert.equal(ctx.player.valor, 50);
    G.god(); assert.equal(ctx.player.god, true);
    // plain(): hook results become small JSON-safe data (smoke t.G passes every result through it)
    const e = ctx.enemies.spawn('rat_pike', new THREE.Vector3(1, 0, 2));
    const p = G.plain({ e, v: new THREE.Vector3(1, 2, 3), list: [1, 'a', null, true], cam: ctx.cam, scene: ctx.scene, f: () => 1, ctx });
    const json = JSON.stringify(p);
    assert.ok(json.length < 20000, `plain() output is small (${json.length} chars)`);
    assert.equal(p.e.$actor, 'Enemy'); assert.equal(p.e.type, 'rat_pike'); assert.deepEqual(p.e.pos, [1, 0, 2]);
    assert.deepEqual(p.v, [1, 2, 3]); assert.deepEqual(p.list, [1, 'a', null, true]);
    assert.equal(p.scene.$object3d, 'Scene'); assert.equal(p.cam.$class, 'FollowCamera'); assert.ok(!('f' in p));
    assert.equal(G.plain(7), 7); assert.equal(G.plain(undefined), undefined);
    ctx.enemies.clear();
  } finally { delete globalThis.window; }
});

// Page-entry scripts (they boot a page and may touch the DOM): src/main.js, any preview.js, any *.page.js.
const PAGE_ENTRY = /(^|[\\/])(main|preview)\.js$|\.page\.js$/;

test('no DOM / WebGL at import: every src module imports under node', async () => {
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (p.endsWith('.js') && !PAGE_ENTRY.test(p)) files.push(p);
    }
  })(SRC);
  const failures = [];
  for (const f of files) {
    try { await import(pathToFileURL(f).href); } catch (e) { failures.push(`${path.relative(ROOT, f)}: ${e.message}`); }
  }
  assert.deepEqual(failures, [], 'modules failed to import:\n' + failures.join('\n'));
});

// ---------------------------------------------------------------------------------------------
// IMPLEMENTATION_PLAN §4 / §7.4 (S2 config merge) + Phase W core.W1 (WA §12)
// ---------------------------------------------------------------------------------------------
test('§4 merged QUALITY: every preset carries the PERF §2 key set; shadows is a string; retired keys kept', () => {
  const keys = ['maxDpr', 'dynRes', 'aa', 'cinematic', 'toneMapping', 'dither', 'cssVignette', 'glowCards', 'shadows', 'shadowMap',
    'vertexAO', 'furShellsIso', 'furShellsClose', 'kittenShellsIso', 'charTufts', 'outline', 'grassTufts', 'groundMist', 'particles',
    'maxEnemies', 'maxSkinned', 'fpsCap', 'programs'];
  const retired = ['minDpr', 'composer', 'msaa', 'bloom', 'grass', 'furShells', 'kittenShells', 'charDetail'];
  for (const [id, q] of Object.entries(config.QUALITY)) {
    assert.equal(q.id, id);
    for (const k of [...keys, ...retired]) assert.ok(k in q, `QUALITY.${id}.${k}`);
    assert.ok(['none', 'sun'].includes(q.shadows), `QUALITY.${id}.shadows`);
    assert.ok(q.dynRes.min > 0 && q.dynRes.min < q.dynRes.max && q.dynRes.max <= 1);
  }
  const { low, med, high } = config.QUALITY;
  assert.deepEqual([low.maxDpr, med.maxDpr, high.maxDpr], [1.25, 1.25, 1.5]);
  assert.deepEqual([low.shadowMap, med.shadowMap, high.shadowMap], [0, 1024, 2048]);
  assert.deepEqual([low.cinematic, med.cinematic, high.cinematic], [false, false, true]);
  assert.deepEqual([low.outline, med.outline, high.outline], ['hero', 'heroCompanionsEngaged', 'all']);
  assert.deepEqual([low.grassTufts, med.grassTufts, high.grassTufts], [1300, 4000, 8000]);
  assert.equal(config.qualityShadowsOn(low), false);
  assert.equal(config.qualityShadowsOn(med), true);
  assert.equal(config.qualityShadowsOn({ shadows: true }), true, 'the retired boolean still works');
  assert.equal(config.qualityShadowsOn(null), false);
});

test('§7.2 core surface: postfx render path API (K1), PERF config + PERF_THERMAL event, perf.js exports', async () => {
  const { PostFX } = await import('../../src/core/PostFX.js');
  const proto = PostFX.prototype;
  for (const k of ['setQuality', 'setSize', 'setPixelRatio', 'setScale', 'setCinematic', 'setBloom', 'resetBloom', 'setVignette', 'setGrade', 'update', 'render', 'warmTargets', 'prewarmCinematic', 'dispose'])
    assert.equal(typeof proto[k], 'function', `postfx.${k}`);
  for (const k of ['composerActive', 'particleScale', 'grassScale', 'scale', 'bloom', 'path']) assert.ok(Object.getOwnPropertyDescriptor(proto, k)?.get, `postfx.${k} getter`);
  assert.equal(config.PERF.stage, 'I1');
  assert.deepEqual(config.PERF.budgets.I1.frameCalls, { low: 70, med: 120, high: 150 });
  assert.deepEqual(config.PERF.budgets.I2.frameCalls, { low: 60, med: 90, high: 110 });
  assert.deepEqual(config.PERF.budgets.End.sceneCalls, { low: 40, med: 60, high: 90 });
  assert.equal(config.PERF.dynRes.gpuDownMs, 12.5); assert.equal(config.PERF.dynRes.minInterval, 2);
  assert.ok(Object.isFrozen(config.PERF.thermal));
  assert.deepEqual(config.RENDER.cinematic.bloom, [0.6, 0.4, 0.9], 'ART §3.3 defaults, threshold 0.9');
  assert.equal((await import('../../src/core/events.js')).E.PERF_THERMAL, 'perf:thermal');
  const perf = await import('../../src/core/perf.js');
  for (const k of ['PerfMonitor', 'GpuTimer', 'countPoolMiss', 'markOnce', 'budgetFor', 'drawsByCat', 'textureMB']) assert.ok(perf[k], `perf.js ${k}`);
});

test('§4 LOOP / RENDER: maxSteps 4 (Low 3), Neutral tone mapping, medAA, toon ramp with sat <= 1.15', () => {
  assert.equal(config.LOOP.maxSteps, 4); assert.equal(config.LOOP.maxStepsLow, 3); assert.equal(config.LOOP.maxFrameDt, 0.1);
  assert.equal(config.RENDER.toneMapping, 'neutral');
  assert.ok(['canvas', 'fxaa'].includes(config.RENDER.medAA));
  assert.deepEqual(config.RENDER.toon, { band: [0, 0.07], step: [0.42, 0.50, 0.86], shadow: [0.38, 0.62], sat: 1.12 });
  assert.ok(config.RENDER.toon.sat <= 1.15, 'oversaturation guard');
});

test('ART §4.1 toon.js: installToon patches every TOON_KEYS chunk once (idempotent)', async () => {
  const { installToon, TOON_KEYS } = await import('../../src/core/toon.js');
  assert.equal(installToon(), true);
  const C = THREE.ShaderChunk, len = TOON_KEYS.map((k) => C[k].length);
  for (const k of TOON_KEYS) assert.match(C[k], /toon/i, k);
  assert.equal(installToon(), true);
  assert.deepEqual(TOON_KEYS.map((k) => C[k].length), len, 'second call is a no-op');
});

test('AUTOCAM §12 CAMERA.iso tables merged; retired CONTROLS §13 keys keep their values', () => {
  const I = config.CAMERA.iso;
  for (const k of ['distRangePortrait', 'follow', 'aimPan', 'frame', 'framing', 'beats', 'snuggle', 'reduce', 'pinch', 'semi', 'foot', 'budget']) assert.ok(I[k] != null, `CAMERA.iso.${k}`);
  assert.equal(I.touchShakeRot, 0);
  for (const k of ['gainUp', 'gainDown', 'gainSide', 'caps', 'speedRamp', 'debounce', 'orderLook', 'biasST', 'max', 'cursorMax']) assert.ok(k in I.lead, `lead.${k}`);
  for (const k of ['vel', 'velMax', 'damp', 'cursor']) assert.ok(k in I.lead, `retired lead.${k} kept`);
  assert.deepEqual(I.foot.far, [45, 90]); assert.equal(I.far, 90, 'retired far kept until camera reads foot.far');
  assert.equal(typeof I.boss.herInner, 'number'); assert.ok(I.boss.establish && I.boss.dizzy && I.boss.phaseBreath);
  assert.equal(I.framing.orbitPenalty.k, 1.5);
  assert.equal(I.occl.archOpacity, 0.1);
});

test('core.W1: WA §12 keys present and frozen; IDLE before the Meme Cam; a glyph for every telegraph kind', () => {
  const { TELEGRAPH, JUICE, CLASS_MARKS, KO, BUNTING, IDLE, HUD, CELEBRATE, PICKUP_FX, FX, STORY, ENEMIES, ATTACKS, PLAYER } = config;
  for (const [name, t] of Object.entries({ CLASS_MARKS, KO, BUNTING, IDLE, HUD, CELEBRATE, PICKUP_FX, FX, STORY })) {
    assert.ok(Object.isFrozen(t), `${name} frozen`);
    for (const v of Object.values(t)) if (v && typeof v === 'object') assert.ok(Object.isFrozen(v), `${name} nested frozen`);
  }
  for (const t of [TELEGRAPH.glyph, TELEGRAPH.ink, JUICE.finalBlow, ENEMIES.hyena.plateWordsFriend, ENEMIES.stealer.plateWordsFriend]) assert.ok(Object.isFrozen(t));
  // the idle ladder is strictly ascending and every step comes before the Meme Cam trigger
  assert.ok(IDLE.glance < IDLE.look && IDLE.look < IDLE.groom && IDLE.groom < IDLE.twirl);
  assert.ok(IDLE.twirl < PLAYER.memeCam.idle, 'IDLE.twirl < memeCam.idle');
  assert.ok(IDLE.loopFrom >= IDLE.glance && IDLE.loopFrom < IDLE.twirl);
  // every ATTACKS / BOSSES telegraph kind has a glyph and a colour
  const kinds = new Set();
  for (const a of Object.values(ATTACKS)) if (a.telegraph) kinds.add(a.telegraph);
  for (const b of Object.values(config.BOSSES)) for (const m of Object.values(b.moves ?? {})) if (m?.telegraph) kinds.add(m.telegraph);
  assert.ok(kinds.size >= 6);
  for (const k of kinds) {
    assert.equal(typeof TELEGRAPH.glyph[k], 'string', `TELEGRAPH.glyph.${k}`);
    assert.match(TELEGRAPH.colors[k], /^#[0-9A-F]{6}$/i);
  }
  assert.equal(TELEGRAPH.colors.red, '#FF5A4E'); assert.equal(TELEGRAPH.colors.aoe, '#FF9A3D');
  assert.equal(TELEGRAPH.colors.shadow, '#3A2346', 'no black (WA §2.7)');
  assert.deepEqual(JUICE.finalBlow, { hitstopAdd: 0.06, slowMo: 0.25, timeScale: 0.35 });
  assert.equal(ENEMIES.hyena.plateWordsFriend.length, ENEMIES.hyena.plateWords.length, 'friend words index-paired');
  assert.deepEqual(ENEMIES.stealer.plateWordsFriend, ['POSTMASTER']);
  assert.equal(STORY.cs02Cut, true); assert.deepEqual(STORY.mochiCage, [-14, -41]);
  assert.deepEqual(STORY.kittenOffer, { knockouts: 2, windowS: 180, failedParries: 3 });
  assert.ok(Math.abs(KO.sitT + KO.wipeT - 1.55) < 1e-9);
  assert.ok(BUNTING.maxLow <= BUNTING.max / 2 && BUNTING.lanternMaxLow <= BUNTING.lanternMax / 2);
  assert.equal(HUD.tuck.after, 4); assert.equal(CELEBRATE.confettiMax, 24); assert.equal(PICKUP_FX.pitchMax, 8);
  assert.equal(FX.comicPops.parry, 'always');
  assert.equal(CLASS_MARKS.hero.color, '#FF8FB1');
  assert.equal(config.FADE_COLOR, '#FFF1DE');
});

test('§7.4 + Phase W settings: defaults, allowed values, camLock -> camLockMode migration, OS-following keys', async () => {
  const { migrateSettings, applyOsSettings, osReducedMotion, OS_SETTINGS } = await import('../../src/core/GameState.js');
  const s = defaultState().settings;
  const want = { reduceCameraMotion: false, camCursorLead: 0, camLockMode: 'locked', camZoomPortrait: 1, biggerHero: false,
    reduceFlashes: false, quality: 'auto', fpsCap: 'auto', batterySaver: false, hudMode: 'calm', hitWords: true, tutorialHints: true,
    reduceCameraMotionAuto: true, reduceFlashesAuto: true, camLock: true };
  for (const [k, v] of Object.entries(want)) assert.equal(s[k], v, `settings.${k}`);
  for (const [k, allowed] of Object.entries(config.SETTING_VALUES)) {
    if (typeof allowed[0] === 'string') assert.ok(k === 'pathPreview' || allowed.includes(s[k]), `${k} default allowed`);
    else assert.ok(s[k] >= allowed[0] && s[k] <= allowed[1], `${k} in range`);
  }
  // K7: an old save with the camera unlocked -> camLockMode 'free'; an unlocked mode keeps the retired camLock false
  assert.equal(new GameState({ settings: { camLock: false } }).settings.camLockMode, 'free');
  assert.equal(new GameState({ settings: { camLockMode: 'semi' } }).settings.camLock, false);
  assert.equal(new GameState({ settings: { hudMode: 'loud' } }).settings.hudMode, 'calm', 'bad enum -> default');
  assert.equal(new GameState({ settings: { fpsCap: 45 } }).settings.fpsCap, 'auto');
  assert.equal(new GameState({ settings: { fpsCap: 30 } }).settings.fpsCap, 30);
  assert.deepEqual(migrateSettings({ ...s }), s, 'idempotent on the defaults');
  // OS preference: followed until the player edits the key
  const st = { ...s };
  assert.deepEqual(applyOsSettings(st, true), [...OS_SETTINGS]);
  assert.equal(st.reduceCameraMotion, true);
  st.reduceFlashesAuto = false; st.reduceFlashes = false;
  assert.deepEqual(applyOsSettings(st, false), ['reduceCameraMotion']);
  assert.equal(st.reduceFlashes, false);
  assert.equal(osReducedMotion(() => ({ matches: true })), true);
  assert.equal(osReducedMotion(undefined), false);
});
