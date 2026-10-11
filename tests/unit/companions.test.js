// tests/unit/companions.test.js  (owner: companions) — GAME_DESIGN §9 companions, §12.1 lost kittens, CS-03 Pudding.
// Self-contained ctx (core services + small fakes) so this suite doesn't depend on other areas' in-progress systems.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as config from '../../src/core/config.js';
import { COMPANIONS, PLAYER, QUALITY } from '../../src/core/config.js';
import { EventBus } from '../../src/core/EventBus.js';
import { ActorRegistry } from '../../src/core/ActorRegistry.js';
import { GameState } from '../../src/core/GameState.js';
import { Actor } from '../../src/core/Actor.js';
import { createRng } from '../../src/core/rng.js';
import { E } from '../../src/core/events.js';
import { SCRIPTED_METHODS } from '../../src/core/ScriptedActor.js';
import {
  followSlot, arrive, separation, segmentHit, isEngaged, pickTarget, estimateDamage, BarkGate, camForwardYaw, wallSide,
  groundY, isFlyer, SLOT,
} from '../../src/companions/steering.js';
import { groundFlyer } from '../../src/companions/abilities.js';
import { CompanionManager } from '../../src/companions/CompanionManager.js';
import { Companion } from '../../src/companions/Companion.js';
import { LostKitten, CageLock } from '../../src/companions/LostKitten.js';
import { NpcActor, npcLook } from '../../src/companions/NpcActor.js';
import { Pudding, PUDDING, puddingRecolour, rgbToHsl } from '../../src/companions/Pudding.js';
import { CAGE_CART } from '../../src/companions/LostKitten.js';
import { KittenView } from '../../src/characters/index.js';
import { ShieldWall } from '../../src/companions/ShieldWall.js';
import { BARKS, FALLBACK, lineText } from '../../src/companions/lines.js';
import { wrapText, clampShift } from '../../src/companions/Bubble.js';
import manifest, { levels as manifestLevels } from '../../src/companions/assets.manifest.js';
import { nextCompanion, SERVICE_IDS, SERVICE_FLAGS } from '../../src/companions/steering.js';
import { spoonRoster, spoonRows, spoonsPerVolley, SPOON_LAYOUT, SPOON_HIT } from '../../src/companions/SpoonBrigade.js';
import { HUB_SPOTS, HUB_NPCS, VILLAGER_SPOTS, villagerCount, pipVars, HubResident } from '../../src/companions/HubKittens.js';
import { RESCUES, lostKittenRows, rowWanted, TREETOP_ROPES } from '../../src/companions/rescues.js';
import { RopePost, HANG } from '../../src/companions/LostKitten.js';
import { RANGED } from '../../src/companions/Companion.js';

const DT = 1 / 60;
const ANTI_MULTI_HIT = 0.12;            // combat/attacks.js COMBAT.antiMultiHit (Combat sets it on every landed hit)

class FakePlayer extends Actor {
  constructor(ctx) {
    super(ctx, { faction: 'player', radius: 0.32, height: 1, maxHp: 8, mass: 1 });
    this.guarding = false; this.swing = null; this.healed = 0;
    this.tags.add('player');
  }
  heal(n) { const b = this.hp; this.hp = Math.min(this.maxHp, this.hp + n); this.healed += this.hp - b; }
}

class FakeEnemy extends Actor {
  constructor(ctx, x, z, o = {}) {
    super(ctx, { faction: 'enemy', radius: 0.3, height: 0.8, maxHp: o.hp ?? 30, mass: 0.8 });
    this.pos.set(x, 0, z); this.stateName = o.state ?? 'idle'; this.alerted = !!o.alerted;
    this.tags.add('enemy'); if (o.flyer) this.tags.add('flyer');
    this.staggered = 0;
  }
  stagger(s) { this.staggered = s; this.staggerT = s; }
}

function makeCtx({ anchors = {} } = {}) {
  const bus = new EventBus();
  const events = [];
  bus.tap?.((type, payload) => events.push([type, payload]));
  const ctx = {
    game: {
      mode: 'play', time: 0, hitstopT: 0, frameCount: 0, realTime: 0, hitstops: [],
      simActive(a) { const m = this.mode; return m === 'play' || m === 'memecam' || ((m === 'dialog' || m === 'cutscene') && a?.scripted === true); },
      requestHitstop(s) { this.hitstops.push(s); }, setMode(m) { this.mode = m; }, get gameplay() { return this.mode === 'play'; },
    },
    bus, config, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), actors: new ActorRegistry(), state: new GameState(),
    rng: createRng(7), quality: QUALITY.med, params: { test: true }, strings: { t: (k) => k, has: () => false, S: {} },
    physics: {
      heightAt: () => 0,
      moveActor(a, dt) {
        if (!a.flying && !a.onGround) a.vel.y -= config.GRAVITY * dt;
        a.pos.addScaledVector(a.vel, dt);
        if (a.flying) { a.onGround = false; return; }
        if (a.pos.y <= 0) { a.pos.y = 0; if (a.vel.y < 0) a.vel.y = 0; a.onGround = true; } else a.onGround = false;
      },
      raycast: () => null,
      colliders: new Set(),
      addCollider(c) { this.colliders.add(c); return c; },
      removeCollider(c) { return this.colliders.delete(c); },
    },
    combat: {
      calls: [],
      applyHit(att, tgt, def) {
        if (!tgt.alive || !tgt.hurtable || tgt.invulnT > 0) return 'none';
        const r = tgt.resolveIncoming ? tgt.resolveIncoming(att, def, new THREE.Vector3(0, 0, 1)) : 'hit';
        this.calls.push({ att, tgt, def, r });
        if (r === 'immune') return r;
        if (r === 'block') { att.onBlocked?.(tgt, def); return r; }
        tgt.hp = Math.max(0, tgt.hp - (def.dmg ?? 0));
        if (tgt.tags?.has('cage')) tgt.invulnT = Math.max(tgt.invulnT ?? 0, ANTI_MULTI_HIT);   // as Combat.js: the target ticks it down
        tgt.onHit({ attacker: att, def });
        if (tgt.hp <= 0) { tgt.alive = false; tgt.onDeath({ attacker: att, def }); }
        return r;
      },
    },
    enemies: { list: [] },
    levels: { current: { id: 'meadow' }, loading: false, anchor: (n) => (anchors[n] ? { pos: new THREE.Vector3(anchors[n][0], 0, anchors[n][1]), facing: 0 } : null) },
    fx: { bursts: [], burst(kind, pos) { this.bursts.push(kind); } },
    cam: { yaw: Math.PI },               // FollowCamera: forward = (−sin yaw, 0, −cos yaw) → +Z
    input: { _p: new Set(), pressed(a) { return this._p.has(a); } },
    story: { played: [], play(id) { this.played.push(id); return Promise.resolve(); } },
    audio: { babbles: [], babble(who, text) { this.babbles.push([who, text]); return 1; }, sounds: [], play3D(id) { this.sounds.push(id); return null; } },
    assets: { model: () => new Promise(() => {}) },
    objectives: null, env: null, ui: null, save: null, postfx: null,
  };
  ctx.player = new FakePlayer(ctx);
  ctx.actors.register(ctx.player, 'swordcat');
  ctx.companions = new CompanionManager(ctx);
  ctx.events = events;
  return ctx;
}

function step(ctx, n = 1, extra = null) {
  for (let i = 0; i < n; i++) {
    ctx.actors.beginStep();
    extra?.(ctx);
    ctx.companions.update(DT);
    ctx.game.time += DT;
  }
}
const emitted = (ctx, name) => ctx.events.filter(([t]) => t === name).map(([, p]) => p);
const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

// ------------------------------------------------------------------ pure helpers

test('steering: follow slot sits COMPANIONS.follow behind and to the chosen side', () => {
  const out = { x: 0, z: 0 };
  followSlot({ x: 0, z: 0 }, 0, 1, out);                        // she faces +Z; +1 = her left (+X)
  assert.ok(Math.abs(Math.hypot(out.x, out.z) - COMPANIONS.follow) < 1e-9);
  assert.ok(out.z < 0, 'behind her'); assert.ok(out.x > 0, 'on her left (+X)');
  followSlot({ x: 0, z: 0 }, 0, -1, out);
  assert.ok(out.x < 0, 'right side');
});

test('steering: arrive eases inside the slow radius and stops in the dead zone', () => {
  const o = { x: 0, z: 0 };
  arrive(0, 0, 10, 0, 5, 2, o); assert.equal(Math.round(o.x * 1e6) / 1e6, 5);
  arrive(0, 0, 1, 0, 5, 2, o); assert.ok(Math.abs(o.x - 2.5) < 1e-9);
  arrive(0, 0, 0.2, 0, 5, 2, o, 0.35); assert.equal(o.x, 0);
  const s = separation({ x: 0, z: 0 }, [{ pos: { x: 0.5, z: 0 } }], 1, 1, { x: 0, z: 0 });
  assert.ok(s.x < 0, 'separation pushes away');
});

test('steering: segment test, wall side, camera forward', () => {
  assert.ok(segmentHit(0, -1, 0, 1, -1, 0, 1, 0) > 0.49);
  assert.equal(segmentHit(0, -1, 0, -0.5, -1, 0, 1, 0), -1);
  assert.ok(wallSide(0, 1, 0, 0, 0, 1) > 0);
  assert.ok(Math.abs(camForwardYaw(Math.PI)) < 1e-9, 'cam yaw π looks along +Z');
});

test('§9.1 engage rule: only enemies already engaging her, within 6 m of HER', () => {
  const ctx = makeCtx();
  const near = new FakeEnemy(ctx, 3, 0, { alerted: true, state: 'chase' });
  const idle = new FakeEnemy(ctx, 1, 0, { state: 'idle' });
  const far = new FakeEnemy(ctx, 7, 0, { state: 'chase', alerted: true });
  const flyer = new FakeEnemy(ctx, 2, 0, { state: 'chase', alerted: true, flyer: true }); flyer.pos.y = 4;
  assert.ok(isEngaged(near)); assert.ok(!isEngaged(idle));
  const t = pickTarget(new THREE.Vector3(-2, 0, 0), new THREE.Vector3(), [idle, far, flyer, near], { groundAt: () => 0 });
  assert.equal(t, near, 'the engaged, reachable one within 6 m');
  near.alive = false;
  assert.equal(pickTarget(new THREE.Vector3(), new THREE.Vector3(), [idle, far, flyer, near], { groundAt: () => 0 }), null);
  assert.equal(estimateDamage({ dmg: 2 }, { playerDmgMul: 1 }), 2);
});

test('§6 bark rules: 1 per 6 s, chance per trigger, no repeat within 60 s', () => {
  const g = new BarkGate({ gap: 6, noRepeat: 60 });
  const keys = ['a', 'b'];
  assert.equal(g.pick(keys, 0, () => 0.9, { chance: 0.25 }), null, 'chance roll failed');
  const k1 = g.pick(keys, 0, () => 0.1, { chance: 0.25 });
  assert.ok(k1);
  assert.equal(g.pick(keys, 3, () => 0, { chance: 1 }), null, 'gap 6 s');
  const k2 = g.pick(keys, 7, () => 0, { chance: 1 });
  assert.notEqual(k2, k1, 'no repeat within 60 s');
  assert.equal(g.pick(keys, 14, () => 0, { chance: 1 }), null, 'both used within 60 s');
  assert.ok(g.pick(keys, 80, () => 0, { chance: 1 }));
});

test('lines: every bark key has design text; wrapText keeps ≤ 3 lines', () => {
  for (const who of Object.values(BARKS)) for (const keys of Object.values(who)) for (const k of keys) assert.ok(FALLBACK[k], `fallback for ${k}`);
  for (const id of config.KITTEN_IDS) assert.ok(FALLBACK['kitten.' + id], `rescue line for ${id}`);
  assert.equal(lineText({ strings: { has: () => false, t: (k) => k } }, 'bark.mochi.idle'), 'Is it lunch? It feels like lunch.');
  assert.equal(lineText({ strings: { has: () => true, t: () => 'X' } }, 'bark.mochi.idle'), 'X');
  assert.ok(wrapText('a '.repeat(80), 10, 3).length <= 3);
});

test('bubble: clampShift keeps the bubble rect inside the screen margin (review r2: right-edge clipping)', () => {
  const m = 0.05;
  assert.deepEqual(clampShift(0, 0, -0.2, 0.2, 0, 0.3, m, m), { dx: 0, dy: 0 }, 'centred bubble untouched');
  const right = clampShift(0.9, 0, -0.2, 0.2, 0, 0.3, m, m);
  assert.ok(Math.abs(0.9 + 0.2 + right.dx - (1 - m)) < 1e-9, 'right edge pulled in to the margin');
  const left = clampShift(-0.95, 0, -0.2, 0.2, 0, 0.3, m, m);
  assert.ok(Math.abs(-0.95 - 0.2 + left.dx - (-1 + m)) < 1e-9, 'left edge pushed in');
  const top = clampShift(0, 0.9, -0.2, 0.2, 0, 0.3, m, m);
  assert.ok(Math.abs(0.9 + 0.3 + top.dy - (1 - m)) < 1e-9, 'top edge pulled down');
  assert.ok(Math.abs(clampShift(0.5, 0, -1.5, 1.5, 0, 0.3, m, m).dx + 0.5) < 1e-9, 'oversized rect is centred');
});

test('assets manifest lists what the area loads; per-level subsets are listed too', () => {
  for (const p of ['models/creatures/monsters-flying/Dragon_Evolved.glb', 'models/creatures/monsters-blob/Pigeon.glb', 'models/env/village-kaykit/decoration/barrel.glb']) assert.ok(manifest.includes(p), p);
  for (const list of Object.values(manifestLevels)) for (const p of list) assert.ok(manifest.includes(p), p);
});

// ------------------------------------------------------------------ contract

test('§19.4 contract: Companion / LostKitten / NpcActor / Pudding are ScriptedActors with the entity fields', () => {
  for (const Cls of [Companion, LostKitten, NpcActor, Pudding]) {
    assert.ok(Cls.prototype instanceof Actor);
    for (const m of SCRIPTED_METHODS) assert.equal(typeof Cls.prototype[m], 'function', `${Cls.name}.${m}`);
  }
  const ctx = makeCtx();
  const c = new Companion(ctx, 'mochi', { visual: false });
  for (const f of ['kittenId', 'napT', 'cooldown']) assert.ok(f in c);
  assert.equal(typeof c.useAbility, 'function');
  const m = ctx.companions;
  for (const f of ['setActive', 'spawnNpc', 'spawnKitten', 'init', 'update', 'dispose']) assert.equal(typeof m[f], 'function', f);
  assert.ok(Array.isArray(m.active)); assert.equal(m.pudding, null);
  const k = m.spawnKitten('noodle', new THREE.Vector3(), 'meow');
  assert.equal(k.kittenId, 'noodle'); assert.equal(k.hidden, true);
  const pud = m.spawnNpc('pudding', new THREE.Vector3(2, 0, 30), Math.PI);
  assert.equal(m.pudding, pud); assert.equal(ctx.actors.get('pudding'), pud);
});

// ------------------------------------------------------------------ manager / party

test('setActive: known ids only, max 1, mirrored to state, instance kept, companion:changed emitted', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  m.setActive(['mochi', 'sage', 'nope']);
  assert.equal(m.active.length, COMPANIONS.maxActive);
  assert.equal(m.active[0].kittenId, 'mochi');
  assert.deepEqual(ctx.state.companions.active, ['mochi']);
  assert.ok(ctx.state.companions.unlocked.includes('mochi'));
  assert.equal(ctx.actors.get('mochi'), m.active[0], 'cutscene lookup by id');
  const inst = m.active[0];
  m.setActive(['mochi']);
  assert.equal(m.active[0], inst, 'same instance when unchanged');
  assert.deepEqual(emitted(ctx, E.COMPANION_CHANGED).at(-1).active, ['mochi']);
  assert.equal(m.milkBonus, COMPANIONS.mochi.milkBonus, 'Mochi passive: +1 milk capacity');
  m.setActive([]);
  assert.equal(m.active.length, 0); assert.equal(m.milkBonus, 0);
  assert.ok(!ctx.actors.has(inst), 'swapped-out companion unregistered');
});

test('join flag meadow.mochi unlocks Mochi into the party', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  ctx.bus.emit(E.FLAG_SET, { key: 'meadow.mochi', value: true });
  assert.equal(ctx.companions.active[0]?.kittenId, 'mochi');
  assert.ok(ctx.state.companions.unlocked.includes('mochi'));
});

test('§9.1 follow: trails her ~2.5 m behind and to the side; teleports beyond 15 m', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const [c] = ctx.companions.setActive(['mochi']);
  const p = ctx.player;
  // she runs +Z at 4 m/s for 4 s
  step(ctx, 240, () => { p.vel.set(0, 0, 4); p.facing = 0; p.pos.addScaledVector(p.vel, DT); });
  p.vel.set(0, 0, 0);
  step(ctx, 120);
  const d = dist(c, p);
  assert.ok(d > 1.2 && d < 3.6, `follow distance ${d.toFixed(2)}`);
  assert.ok(c.pos.z < p.pos.z, 'behind her');
  p.pos.set(40, 0, 40);
  step(ctx, 15);
  assert.ok(dist(c, p) < 3, 'teleported to her side');
  assert.ok(c.stats.teleports >= 1);
});

test('§9.1 fight: bashes an engaging enemy for 5 every 1.6 s; ignores an idle one', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const [c] = ctx.companions.setActive(['mochi']);
  const idle = new FakeEnemy(ctx, 2, 1, { state: 'idle' });
  ctx.enemies.list.push(idle); ctx.actors.register(idle);
  step(ctx, 120);
  assert.equal(ctx.combat.calls.length, 0, 'no fight with an unalerted enemy');
  const e = new FakeEnemy(ctx, 2.5, 1, { state: 'chase', alerted: true, hp: 1000 });
  ctx.enemies.list.push(e); ctx.actors.register(e);
  step(ctx, Math.round(5 / DT));
  const hits = ctx.combat.calls.filter((h) => h.att === c && h.tgt === e);
  assert.ok(hits.length >= 2 && hits.length <= 4, `hits in 5 s: ${hits.length}`);
  assert.equal(hits[0].def.dmg, COMPANIONS.dmg);
  assert.equal(hits[0].def.hitstop, 0, 'companion hits add no hitstop');
});

test('§9.1 nap: a knock-out blow → immune, 8 s zzz, then full HP; never dies', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const [c] = ctx.companions.setActive(['mochi']);
  const e = new FakeEnemy(ctx, 1, 0);
  const big = { id: 'test', dmg: 20 };
  assert.equal(c.resolveIncoming(e, big), 'immune');
  assert.equal(c.napT, COMPANIONS.napTime); assert.equal(c.hurtable, false); assert.ok(c.alive);
  assert.deepEqual(emitted(ctx, E.COMPANION_NAP).at(-1), { kittenId: 'mochi', on: true });
  assert.equal(c.useAbility(), false, 'no ability while napping');
  step(ctx, Math.round(COMPANIONS.napTime / DT) + 2);
  assert.equal(c.napT, 0); assert.equal(c.hp, COMPANIONS.hp); assert.ok(c.hurtable);
  assert.deepEqual(emitted(ctx, E.COMPANION_NAP).at(-1), { kittenId: 'mochi', on: false });
  assert.equal(c.resolveIncoming(e, { dmg: 1 }), 'hit', 'small hits just hurt');
});

test('§9.2 Shield Wall: 3 × 1.6 m, 1.5 m toward the engaged enemies (smart cast), blocks + staggers, taunts, 4 s, 18 s cooldown', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const [c] = m.setActive(['mochi']);
  const e = new FakeEnemy(ctx, 0.5, 4, { state: 'chase', alerted: true });
  const farE = new FakeEnemy(ctx, 0, 20, { state: 'chase', alerted: true });
  ctx.enemies.list.push(e, farE); ctx.actors.register(e); ctx.actors.register(farE);
  ctx.input._p.add('ability');
  step(ctx, 1);
  ctx.input._p.clear();
  assert.equal(c.cooldown > COMPANIONS.mochi.cd - 0.1, true, 'cooldown started');
  const ab = emitted(ctx, E.COMPANION_ABILITY).at(-1);
  assert.equal(ab.kittenId, 'mochi'); assert.equal(ab.ability, 'shieldWall');
  assert.equal(m.walls.length, 1);
  const w = m.walls[0];
  // §7.5 smart: between her and the centroid of the engaged enemies within 6 m (the far one does not count)
  const yaw = Math.atan2(0.5, 4);
  assert.ok(Math.abs(w.center.x - Math.sin(yaw) * COMPANIONS.mochi.dist) < 1e-6 && Math.abs(w.center.z - Math.cos(yaw) * COMPANIONS.mochi.dist) < 1e-6,
    `centre 1.5 m toward the engaged rat (${w.center.x.toFixed(3)}, ${w.center.z.toFixed(3)})`);
  assert.equal(w.width, COMPANIONS.mochi.width); assert.equal(w.height, COMPANIONS.mochi.height);
  const posts = ctx.actors.byTag('shieldWall');
  assert.ok(posts.length >= 7, 'posts registered');
  assert.ok(posts.every((p) => p.faction === 'ally' && p.fixed));
  // melee hit on a post: blocked, attacker staggered
  assert.equal(ctx.combat.applyHit(e, posts[3], { id: 'rat_poke', dmg: 1 }), 'block');
  assert.equal(e.staggered, COMPANIONS.mochi.staggerAttacker);
  // projectiles are blocked but do not stagger anyone
  assert.equal(posts[0].resolveIncoming({ isProjectile: true, faction: 'enemy', pos: new THREE.Vector3(0, 0.6, 3) }, { dmg: 1 }), 'block');
  // occlusion query for Combat: enemy in front → her behind
  assert.ok(m.wallBetween(e.pos, ctx.player.pos));
  assert.equal(m.wallBetween(ctx.player.pos, new THREE.Vector3(0, 0, -3)), null);
  // taunt
  assert.equal(e.tauntedBy, c); assert.notEqual(farE.tauntedBy, c);
  assert.equal(c.useAbility(), false, 'on cooldown');
  step(ctx, Math.round((COMPANIONS.mochi.dur + 0.5) / DT));
  assert.equal(m.walls.length, 0, 'wall gone after 4 s (+ fade)');
  assert.equal(ctx.actors.byTag('shieldWall').length, 0, 'posts unregistered');
  assert.ok(!e.tauntedBy, 'taunt cleared');
  assert.ok(c.cooldown > 0 && c.cooldown < COMPANIONS.mochi.cd);
});

test('meow: the companion answers and regroups; cutscene mode freezes unscripted companions', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const [c] = ctx.companions.setActive(['mochi']);
  ctx.bus.emit(E.PLAYER_MEOW, { position: ctx.player.pos.clone() });
  assert.ok(c.regroupT > 0);
  ctx.game.mode = 'cutscene';
  const before = c.pos.clone();
  ctx.player.pos.set(5, 0, 5);
  step(ctx, 60);
  assert.ok(c.pos.distanceTo(before) < 1e-9, 'frozen while not scripted');
  c.setScripted(true);
  const done = c.moveTo([before.x + 1, before.z], 3);
  step(ctx, 60);
  await done;
  assert.ok(Math.abs(c.pos.x - (before.x + 1)) < 0.2, 'scripted moveTo runs in cutscene mode');
});

// ------------------------------------------------------------------ lost kittens

test('§12.1 meow hide: revealed by a Meow within 10 m only; rescued on contact; walks home and despawns', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const k = m.spawnKitten('noodle', new THREE.Vector3(12, 0, 0), 'meow', { prop: 'barrel' });
  assert.ok(k.hidden && !k.object3d.visible);
  ctx.bus.emit(E.PLAYER_MEOW, { position: new THREE.Vector3(0, 0, 0) });        // 12 m: too far
  assert.ok(k.hidden);
  ctx.bus.emit(E.PLAYER_MEOW, { position: new THREE.Vector3(12 - PLAYER.meow.kittenRadius + 0.5, 0, 0) });
  assert.ok(!k.hidden && k.object3d.visible);
  assert.equal(emitted(ctx, E.KITTEN_REVEAL).at(-1).kittenId, 'noodle');
  step(ctx, 60);
  assert.ok(!k.rescued, 'not rescued from afar');
  ctx.player.pos.copy(k.pos);
  step(ctx, 2);
  assert.ok(k.rescued);
  assert.ok(ctx.state.kittens.includes('noodle'));
  assert.deepEqual(emitted(ctx, E.KITTEN_RESCUED).at(-1), { kittenId: 'noodle' });
  ctx.player.pos.set(0, 0, -30);
  step(ctx, Math.round(7 / DT));
  assert.ok(!m.actors.includes(k), 'walked home and despawned');
  // a reload after the rescue: the kitten doesn't come back
  const again = m.spawnKitten('noodle', new THREE.Vector3(12, 0, 0), 'meow');
  step(ctx, 1);
  assert.ok(!m.actors.includes(again));
  assert.equal(emitted(ctx, E.KITTEN_RESCUED).length, 1);
});

test('§12.1 cage hide: 3 of her hits open it (others are immune); needClear keeps the lock out of play', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const k = m.spawnKitten('biscuit', new THREE.Vector3(3, 0, 3), 'cage');
  const lock = k.lock;
  assert.ok(lock instanceof CageLock && ctx.actors.has(lock));
  assert.equal(lock.breakable, true, 'player-side attacks reach it (Combat targetFilter: breakable)');
  assert.notEqual(lock.faction, 'enemy', 'not an enemy: lock-on, arenas and companions ignore it');
  const e = new FakeEnemy(ctx, 4, 4);
  assert.equal(ctx.combat.applyHit(e, lock, { dmg: 10 }), 'immune');
  for (let i = 0; i < 3; i++) { assert.equal(ctx.combat.applyHit(ctx.player, lock, { dmg: 10 }), 'hit'); step(ctx, 30); }
  assert.ok(lock.opened && !ctx.actors.has(lock));
  ctx.player.pos.set(3, 0, 1.5);
  step(ctx, 90);
  assert.ok(k.rescued, 'hops out and is rescued');
  // locked until the arena is cleared
  const k2 = m.spawnKitten('button', new THREE.Vector3(-5, 0, 0), 'cage', { needClear: 'stones' });
  assert.ok(!ctx.actors.has(k2.lock), 'not an actor while the arena runs');
  ctx.bus.emit(E.ARENA_CLEAR, { id: 'stones' });
  assert.ok(ctx.actors.has(k2.lock));
});

test('§12.1 stand hide: a 3 s planted Stand in the zone with no enemy near reveals the kitten', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const k = m.spawnKitten('button', new THREE.Vector3(-20, 0, -4), 'stand', { standTime: 3, zoneR: 1.2 });
  const p = ctx.player;
  p.pos.set(-20, 0, -3.2); p.guarding = true;
  const e = new FakeEnemy(ctx, -10, -4, { state: 'idle' });
  ctx.enemies.list.push(e);
  step(ctx, Math.round(3.5 / DT));
  assert.ok(k.hidden, 'an enemy is near');
  e.alive = false;
  step(ctx, Math.round(2 / DT));
  p.guarding = false;
  step(ctx, Math.round(2 / DT));
  assert.ok(k.hidden, 'the timer resets when she lowers the Stand');
  p.guarding = true;
  step(ctx, Math.round(3.1 / DT));
  assert.ok(!k.hidden, 'revealed');
});

test('§12.1 break hide: a Bright Slash nearby reveals the kitten; a light slash does not', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const k = ctx.companions.spawnKitten('pebble', new THREE.Vector3(2, 0, 0), 'break');
  ctx.bus.emit(E.PLAYER_SWING, { attackId: 'slash1', combo: 1 });
  assert.ok(k.hidden);
  ctx.bus.emit(E.PLAYER_SWING, { attackId: 'bright' });
  assert.ok(!k.hidden);
});

test('D-01: Mochi caged (hp 30, after the arena) → join scene → active companion where the cage stood', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const k = m.spawnKitten('mochi', new THREE.Vector3(30, 0, 74), 'cage', { needClear: 'bridge', play: 'd01' });
  assert.equal(k.companion, true);
  assert.equal(ctx.actors.get('mochi'), k, 'the caged Mochi is the cutscene actor "mochi"');
  ctx.bus.emit(E.ARENA_CLEAR, { id: 'bridge' });
  for (let i = 0; i < 3; i++) { assert.equal(ctx.combat.applyHit(ctx.player, k.lock, { dmg: 10 }), 'hit'); step(ctx, 30); }
  assert.ok(k.lock.opened);
  ctx.player.pos.set(30, 0, 71);
  step(ctx, 90);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(ctx.story.played, ['d01']);
  assert.equal(m.active[0]?.kittenId, 'mochi');
  assert.ok(Math.hypot(m.active[0].pos.x - 30, m.active[0].pos.z - 74) < 2.5, 'appears at the cage');
  assert.ok(!m.actors.includes(k), 'caged actor replaced');
  assert.equal(emitted(ctx, E.KITTEN_RESCUED).length, 0, 'squires are not lost kittens');
  assert.ok(!ctx.state.kittens.includes('mochi'));
});

// ------------------------------------------------------------------ NPCs and Pudding

test('NPCs: catConfig looks for named cats / squires / villagers; scripted moveTo; active ids return the companion', async () => {
  assert.equal(npcLook('pearl').id, 'pearl');
  assert.ok(npcLook('squire_2')); assert.ok(npcLook('villager_7')); assert.ok(npcLook('baker_bob'));
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const pearl = m.spawnNpc('pearl', [1, 2], 0);
  assert.ok(pearl instanceof NpcActor);
  assert.equal(ctx.actors.get('pearl'), pearl);
  assert.equal(pearl.hurtable, false);
  ctx.game.mode = 'cutscene';
  pearl.setScripted(true);
  const p = pearl.moveTo([1, 5], 2);
  step(ctx, 150);
  await p;
  assert.ok(Math.abs(pearl.pos.z - 5) < 0.2);
  ctx.game.mode = 'play';
  m.setActive(['mochi']);
  assert.equal(m.spawnNpc('mochi', [4, 4], 1), m.active[0]);
  const coo = m.spawnNpc('coo', [0, 0], 0);
  assert.equal(coo.npcId, 'coo');
});

test('CS-03 Pudding: netted (collider r 2.5) → ropes → free → flies to pud_1 → moves on when she approaches', async () => {
  const anchors = { pud_1: [20, 36], pud_2: [36, 50], pud_3: [40, 72], pud_4: [22, 84] };
  const ctx = makeCtx({ anchors }); await ctx.companions.init();
  const m = ctx.companions;
  ctx.player.pos.set(0, 0, 16);
  ctx.state.setFlag('meadow.pudding', 'netted');
  ctx.bus.emit(E.FLAG_SET, { key: 'meadow.pudding', value: 'netted' });
  const pud = m.pudding;
  assert.ok(pud?.netted, 'netted');
  assert.equal(pud.radius, PUDDING.radius); assert.ok(pud.fixed, 'static collider');
  ctx.bus.emit(E.OBJECTIVE, { id: 'net_ropes', value: 2, max: 3 });
  assert.equal(pud.ropesCut, 2);
  ctx.state.setFlag('meadow.pudding', true);                        // story.flag() sets the state, then emits
  ctx.bus.emit(E.FLAG_SET, { key: 'meadow.pudding', value: true });
  assert.equal(pud.mode, 'free');
  step(ctx, Math.round(10 / DT));
  assert.equal(pud.mode, 'perch');
  assert.equal(pud.perchIndex, 0);
  assert.ok(Math.hypot(pud.pos.x - 20, pud.pos.z - 36) < 0.01);
  ctx.player.pos.set(18, 0, 30);
  step(ctx, Math.round(6 / DT));
  assert.equal(pud.perchIndex, 1, 'flew on to pud_2');
  // ScriptedActor: sleep pose (CS-04), nod emote
  pud.pose('sleep'); assert.equal(pud.mode, 'sleep');
  // level reload with the flag set: perched again
  m.clearLevel();
  assert.equal(m.pudding, null);
  ctx.bus.emit(E.LEVEL_LOADED, { id: 'meadow' });
  assert.equal(m.pudding?.mode, 'perch');
});

test('ShieldWall geometry: posts span the width; between() only from the outside', () => {
  const ctx = makeCtx();
  const w = new ShieldWall(ctx, { center: new THREE.Vector3(0, 0, 0), yaw: 0 });
  w.start();
  const xs = w.posts.map((p) => p.pos.x);
  assert.ok(Math.abs(Math.min(...xs) + COMPANIONS.mochi.width / 2) < 1e-9 && Math.abs(Math.max(...xs) - COMPANIONS.mochi.width / 2) < 1e-9);
  assert.ok(w.between(0, 3, 0, -2), 'from the front, through the wall');
  assert.ok(!w.between(0, -3, 0, 2), 'from behind: not blocked');
  assert.ok(!w.between(3, 3, 3, -3), 'around the end');
  w.end();
  assert.equal(ctx.actors.byTag('shieldWall').length, 0);
});

test('companion visuals build from characters buildKitten (Mochi with shield, lost kitten lite)', () => {
  const ctx = makeCtx();
  const c = new Companion(ctx, 'mochi');
  assert.ok(c.visual?.k?.rig?.joints?.pawL, 'kitten rig');
  for (let i = 0; i < 5; i++) { c.vel.set(0, 0, 3); c.render(1, DT); }
  c.visual.setStance('shieldUp'); c.render(1, DT);
  c.startNap(); c.render(1, DT);
  assert.equal(c.visual.poseName, 'sleep');
  c.dispose();
  const k = new LostKitten(ctx, 'biscuit', { pos: new THREE.Vector3(), hide: 'cage' });
  assert.equal(k.visual.k.tier, 'lite');
  k.render(1, DT); k.dispose();
});

// ------------------------------------------------------------------ M1 additions

test('steering: groundY prefers physics.groundAt (bridge decks), then the heightfield; isFlyer by tag or def.fly', () => {
  assert.equal(groundY({ physics: { groundAt: () => 2.5, heightAt: () => 0 } }, 0, 0, 2), 2.5);
  assert.equal(groundY({ physics: { heightAt: () => 1.25 } }, 0, 0, 9), 1.25);
  assert.equal(groundY({}, 0, 0, 3), 3);
  assert.ok(isFlyer({ tags: new Set(['flyer']) })); assert.ok(isFlyer({ tags: new Set(), def: { fly: { alt: 4 } } }));
  assert.ok(!isFlyer({ tags: new Set(['enemy']), def: {} }));
  const calls = [];
  const crow = { alive: true, tags: new Set(['enemy']), def: { fly: {} }, groundFlyer: (sec) => calls.push(sec) };
  assert.ok(groundFlyer(crow, 3)); assert.deepEqual(calls, [3], 'the volley uses Enemy.groundFlyer(sec)');
  assert.ok(!groundFlyer({ alive: true, tags: new Set(['enemy']), def: {} }, 3), 'walkers are not grounded');
});

test('§9.1 follow (iso): once she stands still he comes to her back-left, ≥ 1.4 m out, and settles', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const [c] = ctx.companions.setActive(['mochi']);
  const p = ctx.player;
  step(ctx, 180, () => { p.vel.set(0, 0, 4); p.facing = 0; p.pos.addScaledVector(p.vel, DT); });
  const behindWhileRunning = p.pos.z - c.pos.z;
  assert.ok(behindWhileRunning > 1.2, `trails behind while she runs (${behindWhileRunning.toFixed(2)} m)`);
  p.vel.set(0, 0, 0);
  step(ctx, 240);
  const d = dist(c, p), behind = p.pos.z - c.pos.z;
  assert.ok(Math.abs(d - SLOT.regroupDist) < 0.5, `idle at ~${SLOT.regroupDist} m (got ${d.toFixed(2)})`);
  assert.ok(d >= SLOT.minIdle - 0.15, `never crowding her hero ring (${d.toFixed(2)} m)`);
  assert.ok(behind > 0.4 && behind < 1.8, `back-left, not level with her sword arm nor trailing far (${behind.toFixed(2)} m behind)`);
  assert.ok(c.pos.x > p.pos.x, 'on his side (Mochi: her left, +X)');
  const before = c.pos.clone();
  step(ctx, 60);
  assert.ok(c.pos.distanceTo(before) < 0.05, 'settled: no shuffling about');
  assert.equal(c.stateName, 'idle');
});

test('§9.1 teleport: 4 s out of line of sight → back at her side, never into deep water or a collider', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const [c] = ctx.companions.setActive(['mochi']);
  ctx.physics.lineOfSight = () => false;                       // a wall between them
  ctx.physics.isDeepWater = (x) => x > 0.5;                       // the stream is on her left (+X): Mochi's side
  ctx.physics.blockedAt = () => false;
  const stuck = () => { if (c.stats.teleports === 0) c.pos.set(-6, 0, -6); };   // behind a wall he can't path around
  step(ctx, Math.round(3 / DT), stuck);
  assert.equal(c.stats.teleports, 0, 'not before 4 s');
  step(ctx, Math.round(1.4 / DT), stuck);
  assert.ok(c.stats.teleports >= 1, 'teleported after 4 s out of sight');
  assert.ok(c.pos.x <= 0.5, `landed on the dry side (x ${c.pos.x.toFixed(2)})`);
  assert.ok(dist(c, ctx.player) < 2.5);
});

test('cage lock ticks its anti-multi-hit window: repeated real swings keep landing (hp 30 lock opens in 3)', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const k = ctx.companions.spawnKitten('mochi', new THREE.Vector3(5, 0, 5), 'cage', { hp: 30 });
  const lock = k.lock;
  ctx.player.pos.set(5, 0, 3);
  assert.equal(ctx.combat.applyHit(ctx.player, lock, { dmg: 10 }), 'hit');
  assert.ok(lock.invulnT > 0);
  assert.equal(ctx.combat.applyHit(ctx.player, lock, { dmg: 10 }), 'none', 'same-instant multi-hit is still filtered');
  step(ctx, Math.ceil(ANTI_MULTI_HIT / DT) + 1);
  assert.equal(lock.invulnT, 0, 'invulnT counts down to 0');
  for (let i = 0; i < 2; i++) { assert.equal(ctx.combat.applyHit(ctx.player, lock, { dmg: 10 }), 'hit'); step(ctx, 30); }
  assert.ok(lock.opened, 'opened after 3 real swings');
});

test('cage lock: neutral + breakable + prop (lock-on / arenas ignore it); her reflected shots count, others are immune', () => {
  const ctx = makeCtx();
  const k = ctx.companions.spawnKitten('biscuit', new THREE.Vector3(2, 0, 2), 'cage');
  const l = k.lock;
  assert.equal(l.faction, 'neutral'); assert.equal(l.breakable, true); assert.ok(l.tags.has('prop'));
  assert.equal(l.resolveIncoming({ isProjectile: true, faction: 'player', owner: ctx.player }), 'hit');
  assert.equal(l.resolveIncoming({ isProjectile: true, faction: 'enemy' }), 'immune');
  assert.equal(k.collideActors, false, 'the caged kitten sits inside the solid lock circle without being pushed out');
});

test('D-01 cart: Mochi sits on the cart bed; the cart blocks walkers; the empty cage + cart stay as dressing', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const k = m.spawnKitten('mochi', new THREE.Vector3(30, 0, 74), 'cage', { hp: 30, play: 'd01', facing: Math.PI });
  assert.ok(Math.abs(k.perchY - CAGE_CART.bedY) < 1e-9 && Math.abs(k.pos.y - CAGE_CART.bedY) < 1e-9, 'on the bed');
  const col = [...ctx.physics.colliders][0];
  assert.ok(col && col.walkable === false && col.factions.includes('player') && !col.factions.includes('neutral'), 'cart collider');
  for (let i = 0; i < 3 && !k.lock.opened; i++) { ctx.combat.applyHit(ctx.player, k.lock, { dmg: 10 }); step(ctx, 30); }
  assert.ok(k.lock.opened);
  ctx.player.pos.set(30, 0, 71);
  step(ctx, 90);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(m.active[0]?.kittenId, 'mochi');
  assert.equal(m.dressing.length, 1, 'the cart and the open cage stay in the level');
  assert.ok(ctx.physics.colliders.has(col), 'the cart stays solid');
  m.clearLevel();
  assert.equal(m.dressing.length, 0); assert.ok(!ctx.physics.colliders.has(col), 'collider removed with the level');
  // a reload after the join: no Mochi in the cage, just the open cage on its cart
  const again = m.spawnKitten('mochi', new THREE.Vector3(30, 0, 74), 'cage', { hp: 30 });
  assert.equal(again.stateName, 'gone');
  assert.equal(ctx.actors.get('mochi'), m.active[0], 'the party Mochi keeps the cutscene id');
  step(ctx, 1);
  assert.ok(!m.actors.includes(again)); assert.equal(m.dressing.length, 1);
  assert.equal(ctx.actors.get('mochi'), m.active[0]);
});

test('D-01 on the level\'s cart (world passes the bed height `y`): bars only, no second cart; pinned inside the cage', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  let loads = 0;
  ctx.assets.model = () => { loads++; return new Promise(() => {}); };
  const k = ctx.companions.spawnKitten('mochi', [30, 0, 74.5], 'cage', { hp: 30, needClear: 'bridge', play: 'd01', cage: 'cart', y: 1.05, facing: Math.PI });
  assert.equal(loads, 0, 'no cart model of our own');
  assert.equal(ctx.physics.colliders.size, 0, 'no cart collider of our own (the level\'s cart has one)');
  assert.ok(Math.abs(k.perchY - 1.05) < 1e-9 && Math.abs(k.pos.y - 1.05) < 1e-9, 'on the given bed height');
  assert.ok(Math.abs(k.cage.position.y - 1.05) < 1e-9, 'the bars stand on the bed');
  // a level collider shoving the kitten out of the cart (physics resolves every actor against the cart box)
  const move = ctx.physics.moveActor;
  ctx.physics.moveActor = (a, dt) => { if (a === k) a.pos.z += 0.05; move.call(ctx.physics, a, dt); };
  step(ctx, 30);
  assert.ok(Math.abs(k.pos.z - 74.5) < 1e-9 && Math.abs(k.pos.y - 1.05) < 1e-9, 'stays in the cage');
  ctx.physics.moveActor = move;
  // freed: the hop lands toward her, clear of the cart's collider (a 2.4 × 2.4 m box here; the side toward her is
  // blocked by a fence post too, so another direction is chosen)
  ctx.physics.blockedAt = (x, z, r) => (Math.abs(x - 30) < 1.2 + r && Math.abs(z - 74.5) < 1.2 + r) || Math.hypot(x - 30, z - 72.7) < 0.5 + r;
  ctx.bus.emit(E.ARENA_CLEAR, { id: 'bridge' });
  ctx.player.pos.set(30, 0, 70);
  for (let i = 0; i < 3 && !k.lock.opened; i++) { ctx.combat.applyHit(ctx.player, k.lock, { dmg: 10 }); step(ctx, 30); }
  assert.ok(k.lock.opened);
  let maxY = 0;
  step(ctx, 70, () => { maxY = Math.max(maxY, k.pos.y); });
  await new Promise((r) => setTimeout(r, 0));
  const c = ctx.companions.active[0];
  assert.equal(c?.kittenId, 'mochi', 'joined');
  assert.ok(!ctx.physics.blockedAt(c.pos.x, c.pos.z, 0.2), `landed on free ground (${c.pos.x.toFixed(2)}, ${c.pos.z.toFixed(2)})`);
  assert.ok(c.pos.z < 74.5, 'on her side of the cart');
  assert.ok(maxY > 1.05, 'hopped up and out');
  assert.equal(c.pos.y, 0, 'on the ground');
});

test('Pudding comes back after a cutscene despawned him while meadow.pudding is set (netted, then perched)', async () => {
  const ctx = makeCtx({ anchors: { pud_1: [20, 36], pud_2: [36, 50] } }); await ctx.companions.init();
  const m = ctx.companions;
  const scenePud = m.spawnNpc('pudding', [2, 24], Math.PI);
  ctx.state.setFlag('meadow.pudding', 'netted');
  ctx.bus.emit(E.FLAG_SET, { key: 'meadow.pudding', value: 'netted' });
  assert.equal(m.pudding, scenePud); assert.ok(scenePud.netted);
  m.despawn(scenePud);                                         // the cutscene's end despawns its cast
  assert.equal(m.pudding, null);
  ctx.bus.emit(E.CUTSCENE_END, { id: 'cs03', skipped: false });
  assert.ok(m.pudding && m.pudding !== scenePud && m.pudding.netted, 'netted again in the glade');
  assert.equal(ctx.actors.get('pudding'), m.pudding);
  ctx.bus.emit(E.CUTSCENE_END, { id: 'd01', skipped: true });
  assert.equal(m.actors.filter((a) => a instanceof Pudding).length, 1, 'never two');
  m.despawn(m.pudding);
  ctx.state.setFlag('meadow.pudding', true);
  ctx.bus.emit(E.CUTSCENE_END, { id: 'x', skipped: false });
  assert.equal(m.pudding?.mode, 'perch');
  ctx.levels.current.id = 'forest';
  m.despawn(m.pudding);
  ctx.bus.emit(E.CUTSCENE_END, { id: 'cs04', skipped: false });
  assert.equal(m.pudding, null, 'only the meadow keeps a Pudding by itself');
});

test('lost kitten: the hiding barrel stays after the kitten goes home; the rescue line babbles', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const k = m.spawnKitten('noodle', new THREE.Vector3(3, 0, 3), 'meow', { prop: 'barrel' });
  ctx.bus.emit(E.PLAYER_MEOW, { position: new THREE.Vector3() });
  ctx.player.pos.copy(k.pos);
  step(ctx, 2);
  assert.ok(k.rescued);
  assert.ok(ctx.audio.babbles.some(([who]) => who === 'noodle'), 'babble for the rescue line');
  ctx.player.pos.set(0, 0, -30);
  step(ctx, Math.round(7 / DT));
  assert.ok(!m.actors.includes(k));
  assert.equal(m.dressing.length, 1, 'barrel kept');
});

test('§7.8 × §12.1: the Stand turning into Meme Cam (2.5 s) keeps counting toward the 3 s stand reveal', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const k = ctx.companions.spawnKitten('button', new THREE.Vector3(0, 0, 0), 'stand', { standTime: 3 });
  const p = ctx.player;
  p.guarding = true;
  step(ctx, Math.round(2.5 / DT));
  p.guarding = false; p.stateName = 'memecam'; ctx.game.mode = 'memecam';
  step(ctx, Math.round(0.6 / DT));
  assert.ok(!k.hidden, 'revealed during Meme Cam');
});

test('barks babble only in play; the shared bark gate still applies', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const [c] = ctx.companions.setActive(['mochi']);
  assert.ok(ctx.companions.bark(c, 'idle', { force: true }));
  assert.equal(ctx.audio.babbles.at(-1)[0], 'mochi');
  ctx.game.mode = 'cutscene';
  const n = ctx.audio.babbles.length;
  ctx.companions.bark(c, 'combat', { force: true });
  assert.equal(ctx.audio.babbles.length, n, 'no babble over cutscene dialogue');
});

test('Pudding recolour: purple / maroon body cells → the design red, lighter; eyes, claws and white cells unchanged', () => {
  const [th] = PUDDING.red;
  for (const c of [[139, 61, 94], [91, 53, 74], [114, 25, 35]]) {
    const [r, g, b] = puddingRecolour(...c);
    const [h, , l] = rgbToHsl(r, g, b), [, , l0] = rgbToHsl(...c);
    assert.ok(Math.abs(h - th) < 12, `hue ${h.toFixed(1)} for ${c}`);
    assert.ok(l > l0, 'lighter');
    assert.ok(r > g * 1.6 && r > b * 1.6, `reads red: ${[r, g, b]}`);
  }
  for (const c of [[30, 31, 34], [255, 255, 255], [143, 146, 160], [204, 145, 41], [165, 140, 114]]) assert.deepEqual(puddingRecolour(...c), c);
});

test('Pudding sniffs before he lifts off (lean + purr), then nods; roars are gameplay-only sounds', async () => {
  const anchors = { pud_1: [20, 36] };
  const ctx = makeCtx({ anchors }); await ctx.companions.init();
  const pud = ctx.companions.spawnNpc('pudding', [2, 24], Math.PI);
  pud.setNetted(true);
  ctx.player.pos.set(2, 0, 16);
  const z0 = pud.pos.z;
  pud.free();
  step(ctx, Math.round(1.2 / DT));
  assert.ok(pud.pos.z < z0, 'shuffled toward her while sniffing');
  assert.ok(ctx.audio.sounds.includes('cat/cat_purractive_loop'), 'purr');
  pud.setScripted(true);
  const n = ctx.audio.sounds.length;
  pud.roar(0.3);
  assert.equal(ctx.audio.sounds.length, n, 'a scripted roar is the cutscene\'s to cue');
  pud.setScripted(false);
  pud.roar(0.3);
  assert.equal(ctx.audio.sounds.at(-1), 'puddingRoar');
});

test('companion visuals ride on characters KittenView (env map, wind, hitstop-aware dt)', () => {
  const ctx = makeCtx();
  const c = new Companion(ctx, 'mochi');
  assert.ok(c.visual.view instanceof KittenView);
  ctx.game.hitstopT = 0.1;
  c.visual.update(1 / 60, { velocity: new THREE.Vector3() });
  assert.equal(c.visual.dt, 0, 'frozen during hitstop');
  ctx.game.hitstopT = 0;
  c.visual.update(1 / 60, { velocity: new THREE.Vector3() });
  assert.ok(c.visual.dt > 0);
  c.dispose();
});

test('§9.2 Sage Volley (5 arrows over 0.6 s, ≤ 3 targets in 14 m, flyers grounded) and Clover Purr of Mending (4 HP over 3 s)', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const [sage] = m.setActive(['sage']);
  assert.ok(sage.visual?.k?.rig, 'Sage builds');
  const crow = new FakeEnemy(ctx, 3, 5, { state: 'chase', alerted: true, flyer: true, hp: 1000 });
  crow.pos.y = 0.5;
  const grounded = [];
  crow.groundFlyer = (s) => grounded.push(s);
  const rat = new FakeEnemy(ctx, -2, 6, { state: 'chase', alerted: true, hp: 1000 });
  ctx.enemies.list.push(crow, rat); ctx.actors.register(crow); ctx.actors.register(rat);
  assert.ok(sage.useAbility());
  assert.equal(emitted(ctx, E.COMPANION_ABILITY).at(-1).ability, 'volley');
  step(ctx, Math.round(1.6 / DT));
  const arrows = ctx.combat.calls.filter((h) => h.att === sage && h.def.id === 'companion_arrow');
  assert.equal(arrows.length, COMPANIONS.sage.arrows, '5 arrows');
  assert.ok(arrows.every((h) => h.def.dmg === COMPANIONS.sage.dmg));
  assert.ok(grounded.length >= 1 && grounded[0] === COMPANIONS.sage.groundFlyers, 'the crow is grounded 3 s');
  assert.equal(sage.cooldown > 0, true);
  // Clover
  ctx.enemies.list.length = 0;
  const [clover] = m.setActive(['clover']);
  assert.ok(clover.visual?.k?.rig, 'Clover builds');
  ctx.player.hp = 2;
  ctx.player.slowT = 2;
  assert.ok(clover.useAbility());
  step(ctx, Math.round((COMPANIONS.clover.channel - 0.1) / DT));
  assert.equal(ctx.player.hp, 2, 'nothing during the 1 s channel');
  step(ctx, Math.round((COMPANIONS.clover.over + 0.3) / DT));
  assert.equal(ctx.player.hp, 2 + COMPANIONS.clover.heal, '+4 HP over 3 s');
  assert.equal(ctx.player.slowT, 0, 'slow cleansed');
  assert.ok(Math.abs(clover.cooldown - (COMPANIONS.clover.cd - COMPANIONS.clover.channel - COMPANIONS.clover.over - 0.2)) < 0.5);
});

test('CS-03 end order: netted first, moved after (pose then pos) → the net follows him to (2,24)', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const pud = ctx.companions.spawnNpc('pudding', [2, 0, 30], Math.PI);
  pud.setScripted(true);
  pud.pose('netted');
  assert.ok(pud.netted && pud.net);
  pud.pos.set(2, 0, 24);
  ctx.game.mode = 'cutscene';
  step(ctx, 1);
  assert.ok(Math.hypot(pud.net.group.position.x - 2, pud.net.group.position.z - 24) < 1e-6, 'net rebuilt on him');
  assert.equal(pud.net.ropes.length, PUDDING.net.posts.length);
});

// ------------------------------------------------------------------ M2: swap, rescues, Spoon Brigade, hub

/** A town / forest / gate level stand-in: interactables, vigils, arenas (world's Level fields this area reads). */
function levelOf(ctx, id, extra = {}) {
  ctx.levels.current = { id, interactables: [], vigils: [], arenas: [], ...extra };
  return ctx.levels.current;
}
const flush = () => new Promise((r) => setTimeout(r, 0));

test('M2 nextCompanion: unlocked ids in mochi → sage → clover order, wrapping; null with nothing to swap to', () => {
  assert.equal(nextCompanion(['mochi', 'sage'], 'mochi'), 'sage');
  assert.equal(nextCompanion(['mochi', 'sage'], 'sage'), 'mochi');
  assert.equal(nextCompanion(['clover', 'mochi', 'sage'], 'sage'), 'clover');
  assert.equal(nextCompanion(['clover', 'mochi', 'sage'], 'mochi', -1), 'clover');
  assert.equal(nextCompanion(['mochi'], 'mochi'), null);
  assert.equal(nextCompanion(['sage'], null), 'sage');
  assert.equal(nextCompanion([], null), null);
});

test('M2 §9.1 swap: swapNext / swapTo cycle unlocked squires with a flourish and a toast; never in a locked arena', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const L = levelOf(ctx, 'forest');
  m.setActive(['mochi']);
  assert.equal(m.canSwap(), false, 'only Mochi unlocked');
  ctx.state.companions.unlocked.push('sage');
  assert.equal(m.canSwap(), true);
  const before = ctx.fx.bursts.length;
  assert.equal(m.swapNext(), 'sage');
  assert.equal(m.active[0].kittenId, 'sage');
  assert.deepEqual(ctx.state.companions.active, ['sage']);
  assert.match(emitted(ctx, E.TOAST).at(-1).text, /Sage is with you/);
  assert.ok(ctx.fx.bursts.slice(before).includes('poof') && ctx.fx.bursts.slice(before).includes('sparkle'), 'poof out, sparkle in');
  assert.ok(m.active[0].bubble.visible ?? true, 'hello bark');
  assert.ok(!ctx.actors.get('mochi'), 'Mochi went back to the Barracks');
  assert.equal(m.swapNext(), null, 'cooldown: one press, one swap');
  step(ctx, 60);
  L.arenas.push({ locked: true });
  assert.equal(m.canSwap(), false, 'no swapping in a locked arena');
  L.arenas.length = 0;
  // ui's Vigil / Barracks panels call setActive: same flourish, no toast
  const toasts = emitted(ctx, E.TOAST).length;
  m.setActive(['mochi']);
  assert.equal(m.active[0].kittenId, 'mochi');
  assert.equal(emitted(ctx, E.TOAST).length, toasts);
  assert.equal(m.swapTo('clover'), null, 'Clover is not unlocked yet');
  // a level load syncing the party from the save is quiet
  const n = ctx.fx.bursts.length;
  ctx.state.companions.active = ['sage'];
  ctx.bus.emit(E.SAVE_LOADED, {});
  assert.equal(m.active[0].kittenId, 'sage');
  assert.ok(!ctx.fx.bursts.slice(n).includes('poof'), 'no flourish on a load');
});

test('M2 D-02: Sage hangs at 4 m; 3 rope posts (30 HP) lower the cage over 2 s; she tumbles onto Mochi and takes the slot', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  levelOf(ctx, 'forest');
  const [mochi] = m.setActive(['mochi']);
  const k = m.spawnKitten('sage', [18, 0, -8], 'cage', { hang: 4, ropes: TREETOP_ROPES, play: 'd02', facing: Math.PI });
  assert.equal(k.hanging, true);
  assert.ok(Math.abs(k.pos.y - 4) < 1e-6, 'perched at the hang height');
  assert.ok(!ctx.actors.has(k.lock), 'the hanging cage itself cannot be broken');
  assert.equal(k.ropePosts.length, 3);
  assert.ok(k.ropePosts.every((q) => q instanceof RopePost && ctx.actors.has(q) && q.breakable));
  mochi.pos.set(18.5, 0, -6.5);
  ctx.player.pos.set(18, 0, -5.5);
  for (const [i, q] of k.ropePosts.entries()) {
    for (let h = 0; h < 3; h++) { ctx.combat.applyHit(ctx.player, q, { dmg: 10 }); step(ctx, 12); }
    assert.ok(q.opened, `post ${i} cut`);
    assert.equal(emitted(ctx, E.OBJECTIVE).at(-1).value, i + 1);
  }
  assert.equal(emitted(ctx, E.OBJECTIVE).at(-1).done, true);
  assert.equal(k.stateName, 'lowering');
  step(ctx, Math.round((HANG.lowerDur * 0.5) / DT));
  assert.ok(k.pos.y > 0.3 && k.pos.y < 3.7, `halfway down (${k.pos.y.toFixed(2)})`);
  step(ctx, Math.round((HANG.lowerDur * 0.5 + 1.6) / DT));
  await flush();
  assert.deepEqual(ctx.story.played, ['d02']);
  assert.equal(m.active[0].kittenId, 'sage', 'the newcomer takes the slot');
  assert.ok(Math.hypot(m.active[0].pos.x - mochi.pos.x, m.active[0].pos.z - mochi.pos.z) < 1.5, 'landed on Mochi');
  assert.deepEqual([...ctx.state.companions.unlocked].sort(), ['mochi', 'sage']);
});

test('M2 D-02 (level ropes): the level rope objective finishing lowers the cage (lowerOn.objective)', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const k = ctx.companions.spawnKitten('sage', [0, 0, 0], 'cage', { hang: 4, lowerOn: { objective: ['ropes'] } });
  ctx.bus.emit(E.OBJECTIVE, { id: 'ropes', value: 2, max: 3, done: false });
  assert.equal(k.stateName, 'caged');
  ctx.bus.emit(E.OBJECTIVE, { id: 'ropes', value: 3, max: 3, done: true });
  assert.equal(k.stateName, 'lowering');
  assert.equal(ctx.companions.lowerCage('sage'), false, 'already on its way down');
});

test('M2 D-04 Clover: the town stocks hold her until the Square clears; E (interactable) or 3 blows free her → d04clover → joins', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const L = levelOf(ctx, 'town');
  const k = m.spawnKitten('clover', [10, 0, 14], 'cage', { cage: 'stocks', needClear: 'square', interact: true, play: 'd04clover', facing: Math.PI });
  assert.equal(k.cage?.userData?.kind, 'stocks');
  const it = L.interactables.find((i) => i.id === 'free_clover');
  assert.ok(it, 'an interactable is registered');
  assert.equal(it.enabled(), false, 'locked while the Square fights');
  m.markCleared('square');
  assert.equal(it.enabled(), true);
  ctx.player.pos.set(10, 0, 12);
  it.use();
  assert.ok(k.lock.opened);
  assert.ok(!L.interactables.includes(it), 'removed once used');
  step(ctx, 90);
  await flush();
  assert.deepEqual(ctx.story.played, ['d04clover']);
  assert.equal(m.active[0]?.kittenId, 'clover');
});

test('M2 D-04 Tofu: hides in the 3rd barrel of the stack; a knock reveals him; d04tofu plays; the flag is set; he is not a lost kitten', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  levelOf(ctx, 'town');
  assert.ok(SERVICE_IDS.includes('tofu'));
  const k = m.spawnKitten('tofu', [18, 0, -14], 'meow', { prop: 'barrel', stack: 6, leaveTo: [30, -10] });
  assert.equal(k.service, true);
  assert.equal(ctx.physics.colliders.size, 5, 'five more barrels with colliders');
  ctx.player.pos.set(18, 0, -11);
  ctx.bus.emit(E.PLAYER_SWING, { attackId: 'slash1' });
  assert.ok(k.hidden, 'too far to knock');
  ctx.player.pos.set(18, 0, -12.6);
  ctx.bus.emit(E.PLAYER_SWING, { attackId: 'slash1' });
  assert.ok(!k.hidden, 'a knock on the barrel reveals him');
  step(ctx, 30);
  await flush();
  assert.deepEqual(ctx.story.played, ['d04tofu']);
  assert.equal(ctx.state.getFlag(SERVICE_FLAGS.tofu), true, 'flag set (no story flag call in the fake: state)');
  assert.ok(!ctx.state.kittens.includes('tofu'));
  assert.equal(emitted(ctx, E.KITTEN_RESCUED).length, 0);
  step(ctx, Math.round(5 / DT));
  assert.ok(!m.actors.includes(k), 'off to the forge');
  m.clearLevel();
  assert.equal(ctx.physics.colliders.size, 0, 'the stack colliders go with the level');
});

test('M2 D-03 Marmalade peeks out once the bakery clears; she walks up → d03; he stays at the door (also on a reload)', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  levelOf(ctx, 'town');
  const k = m.spawnKitten('marmalade', [-23, 0, -19], null, { appearOn: 'bakery', stay: true, talkR: 3.6 });
  assert.ok(k.hidden && !k.object3d.visible);
  ctx.player.pos.set(-21, 0, -19);
  step(ctx, 30);
  assert.equal(ctx.story.played.length, 0, 'not before the street is clear');
  ctx.bus.emit(E.ARENA_CLEAR, { id: 'bakery' });
  assert.ok(!k.hidden);
  step(ctx, 2);
  await flush();
  assert.deepEqual(ctx.story.played, ['d03']);
  step(ctx, 120);
  assert.equal(k.stateName, 'stay');
  assert.ok(m.actors.includes(k));
  const again = m.spawnKitten('marmalade', [-23, 0, -19], null, { appearOn: 'bakery', stay: true });
  assert.equal(again.stateName, 'stay', 'a reload keeps him at the door');
  assert.ok(again.object3d.visible);
});

test('M2 D-06 war-wagon: Tater hosts the cage, Mittens and Pip share it; 3 blows open it; Pip plays d06 and runs to the gate', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  levelOf(ctx, 'gate');
  const host = m.spawnKitten('tater', [6, 0, -80], 'cage', { cage: 'cart', size: [1.5, 0.95, 1.05], facing: Math.PI });
  const mit = m.spawnKitten('mittens', [6, 0, -80], 'cage', { cageWith: 'tater', off: [-0.38, 0.1] });
  const pip = m.spawnKitten('pip', [6, 0, -80], 'cage', { cageWith: 'tater', off: [0.42, -0.12], leaveTo: [0, 41], play: 'd06' });
  assert.equal(mit.host, host); assert.equal(pip.host, host);
  assert.deepEqual(host.guests, [mit, pip]);
  assert.ok(!mit.lock && !pip.lock, 'one lock: the host one');
  assert.equal(mit.stateName, 'caged');
  for (let i = 0; i < 3; i++) { ctx.combat.applyHit(ctx.player, host.lock, { dmg: 10 }); step(ctx, 12); }
  assert.ok(host.lock.opened);
  ctx.player.pos.set(6, 0, -74);
  step(ctx, 120);
  assert.ok(mit.rescued && host.rescued, 'out of the cage = rescued (§12.1 cage hide)');
  const spots = [host, mit, pip].map((k) => `${k.pos.x.toFixed(1)},${k.pos.z.toFixed(1)}`);
  assert.equal(new Set(spots).size, 3, 'they hop out to different spots');
  for (const k of [host, mit, pip]) { ctx.player.pos.copy(k.pos); step(ctx, 3); }
  await flush();
  assert.ok(ctx.state.kittens.includes('tater') && ctx.state.kittens.includes('mittens'));
  assert.ok(!ctx.state.kittens.includes('pip'));
  assert.ok(ctx.story.played.includes('d06'));
  assert.equal(ctx.state.getFlag('gate.pip'), true);
});

test('M2 D-04 Earl Grey: the giant Gloomjelly popping in town drops him; he is rescued by himself → d04earlgrey', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  levelOf(ctx, 'town');
  const jelly = new FakeEnemy(ctx, 0, 6);
  jelly.def = { id: 'jelly', releases: 'earlgrey' };
  ctx.bus.emit(E.ENEMY_DIED, { enemy: jelly, type: 'jelly', position: jelly.pos.clone() });
  assert.ok(!m.get('earlgrey'), 'a beat before he tumbles out');
  ctx.player.pos.set(0, 0, 0);
  step(ctx, Math.round(2.2 / DT));
  await flush();
  assert.ok(ctx.story.played.includes('d04earlgrey'));
  assert.equal(ctx.state.getFlag('town.earlgrey'), true);
  ctx.bus.emit(E.ENEMY_DIED, { enemy: jelly, type: 'jelly', position: jelly.pos.clone() });
  step(ctx, Math.round(1.5 / DT));
  assert.equal(ctx.story.played.filter((x) => x === 'd04earlgrey').length, 1, 'once');
});

test('M2 rescues: 3 lost kittens per level matching KITTENS_BY_LEVEL; placed only where the level did not; the save is honoured', async () => {
  for (const id of ['forest', 'town', 'gate']) {
    const ks = lostKittenRows(id).map((r) => r[0]);
    assert.deepEqual(ks.sort(), [...config.KITTENS_BY_LEVEL[id]].sort(), `${id} kittens`);
    for (const [, at] of RESCUES[id]) assert.ok(Math.abs(at[0]) < 100 && Math.abs(at[1]) < 100, `${id} in bounds`);
  }
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  levelOf(ctx, 'forest');
  ctx.state.addKitten('pickles');
  m.spawnKitten('pebble', [-22, 0, -26], 'break');              // the level placed this one itself
  const placed = m.placeRescues('forest');
  assert.deepEqual(placed.sort(), ['sage', 'sprout']);
  assert.equal(m.kittens.filter((k) => k.kittenId === 'pebble').length, 1);
  assert.equal(rowWanted('town', RESCUES.town[0], { getFlag: (k) => k === 'town.free', kittens: [], companions: { unlocked: [] } }), false, 'hub mode');
  ctx.state.companions.unlocked.push('clover');
  assert.equal(rowWanted('town', RESCUES.town.find((r) => r[0] === 'clover'), ctx.state), false, 'Clover joined already');
});

test('M2 §9.3 Spoon Brigade layout: max(3, rescued) capped 18, villagers fill, rows of 6 from 2.5 m behind her', () => {
  assert.deepEqual(spoonRoster([]).map((r) => r.villager), [true, true, true]);
  assert.deepEqual(spoonRoster(['tater', 'nope']).map((r) => r.id), ['tater', 'villager_spoon_0', 'villager_spoon_1']);
  assert.equal(spoonRoster(config.KITTEN_IDS).length, SPOON_LAYOUT.max);
  const rows = spoonRows(8, [0, 10], Math.PI);              // she faces −Z on the Line: the brigade is on +Z
  assert.equal(rows.length, 8);
  assert.ok(Math.abs(rows[0].z - 12.5) < 1e-9, 'first row 2.5 m behind her');
  assert.ok(Math.abs(rows[6].z - 13.5) < 1e-9, 'second row 1 m further');
  assert.ok(Math.abs(Math.abs(rows[1].x - rows[0].x) - 1) < 1e-9, '1 m apart');
  assert.ok(Math.abs(rows.slice(0, 6).reduce((a, r) => a + r.x, 0)) < 1e-9, 'rows centred');
  assert.equal(spoonsPerVolley(3), 1); assert.equal(spoonsPerVolley(4), 2); assert.equal(spoonsPerVolley(18), 6);
  assert.equal(SPOON_HIT.dmg, COMPANIONS.spoons.dmg); assert.equal(SPOON_HIT.knock, 0);
});

test('M2 §9.3 Spoon Brigade: CS-08 stands them up, its end arms them; every 2 s ceil(n/3) spoons at foes within 12 m; 5 dmg, no knockback', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  levelOf(ctx, 'gate');
  for (const id of ['tater', 'mittens', 'socks', 'biscuit']) ctx.state.addKitten(id);
  ctx.player.pos.set(0, 0, 10); ctx.player.facing = Math.PI;
  ctx.bus.emit(E.CUTSCENE_START, { id: 'cs08' });
  assert.equal(m.spoons.active, true); assert.equal(m.spoons.armed, false);
  assert.equal(m.spoons.count, 4);
  assert.ok(ctx.actors.get('tater'), 'Kitten A is the cutscene actor "tater"');
  assert.ok(m.spoons.kittens.every((k) => k.hurtable === false && k.faction !== 'enemy'), 'cannot be hurt or targeted');
  ctx.bus.emit(E.CUTSCENE_END, { id: 'cs08' });
  assert.equal(m.spoons.armed, true);
  const near = new FakeEnemy(ctx, 1, 2, { hp: 500, state: 'chase' });
  const far = new FakeEnemy(ctx, 0, -10, { hp: 500, state: 'chase' });
  ctx.enemies.list.push(near, far);
  step(ctx, Math.round(4.2 / DT), () => { near.vel.set(0, 0, 0); near.invulnT = 0; });
  const hits = ctx.combat.calls.filter((h) => h.def.id === 'spoon');
  assert.ok(m.spoons.stats.volleys >= 2, `volleys ${m.spoons.stats.volleys}`);
  assert.equal(m.spoons.stats.thrown, m.spoons.stats.volleys * spoonsPerVolley(4));
  assert.ok(hits.length >= 2 && hits.every((h) => h.tgt === near), 'only the foe within 12 m of the Line');
  assert.equal(near.hp, 500 - hits.length * COMPANIONS.spoons.dmg);
  assert.ok(ctx.audio.sounds.includes('impact/metal_small2'), 'plink');
  ctx.bus.emit(E.BOSS_DEFEATED, { id: 'cacklejaw' });
  assert.equal(m.spoons.armed, false);
  ctx.bus.emit(E.LEVEL_UNLOAD, {});
  assert.equal(m.spoons.active, false);
  assert.ok(!ctx.actors.get('tater'));
});

test('M2 §12.5 hub: rescued kittens at their activity spots, villagers fill to 20 (12 on Low), keepers by flag; lines on approach', async () => {
  assert.equal(Object.keys(HUB_SPOTS).length, 18);
  assert.deepEqual(Object.keys(HUB_SPOTS).sort(), [...config.KITTEN_IDS].sort());
  assert.equal(villagerCount(5, 'med'), 15); assert.equal(villagerCount(18, 'med'), 2); assert.equal(villagerCount(3, 'low'), 9);
  assert.ok(VILLAGER_SPOTS.length >= 20);
  assert.deepEqual(pipVars(['biscuit', 'noodle', 'button', 'pickles']), { n: 2, level: 'forest' });
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  levelOf(ctx, 'town');
  for (const id of ['biscuit', 'tater', 'mittens', 'waffles']) ctx.state.addKitten(id);
  ctx.bus.emit(E.LEVEL_LOADED, { id: 'town' });
  assert.equal(m.hub.active, false, 'occupied town: no hub');
  ctx.bus.emit(E.LEVEL_UNLOAD, {});
  ctx.state.setFlag('town.free', true);
  ctx.bus.emit(E.LEVEL_LOADED, { id: 'town' });
  assert.equal(m.hub.active, true);
  const res = m.hub.residents;
  const kit = res.filter((r) => config.KITTEN_IDS.includes(r.npcId)).map((r) => r.npcId).sort();
  assert.deepEqual(kit, ['biscuit', 'mittens', 'tater', 'waffles']);
  const nVill = res.filter((r) => r.npcId.startsWith('villager_hub_')).length;
  assert.equal(kit.length + nVill, 20);
  const keepers = res.filter((r) => r.beh === 'station').map((r) => r.npcId).sort();
  assert.deepEqual(keepers, ['earlgrey', 'marmalade', 'snowpaw', 'tofu'], 'Pip / Pearl / Coo wait for their flags');
  assert.ok(res.every((r) => r instanceof HubResident && r.hurtable === false));
  const waffles = res.find((r) => r.npcId === 'waffles');
  assert.ok(Math.abs(waffles.pos.y - 3) < 0.05, 'Waffles waves from the balcony (y 3)');
  // tag: Tater and Mittens run round the square
  const tater = res.find((r) => r.npcId === 'tater');
  const p0 = tater.pos.clone();
  ctx.player.pos.set(30, 0, 30);
  step(ctx, 120);
  assert.ok(tater.pos.distanceTo(p0) > 1, 'tag moves');
  assert.ok(Math.abs(Math.hypot(tater.pos.x, tater.pos.z - 8) - 8) < 1.5, 'on the r 8 loop');
  // lines: walk up to Biscuit
  const biscuit = res.find((r) => r.npcId === 'biscuit');
  ctx.player.pos.set(biscuit.pos.x + 1, 0, biscuit.pos.z);
  step(ctx, 2);
  assert.ok(ctx.audio.babbles.some(([who, text]) => who === 'biscuit' && /cow/.test(text)), 'Biscuit says her line');
  // keepers by flag; Marmalade in bed after L4
  ctx.bus.emit(E.LEVEL_UNLOAD, {});
  ctx.state.setFlag('gate.done', true);
  ctx.bus.emit(E.LEVEL_LOADED, { id: 'town' });
  const marm = m.hub.residents.find((r) => r.npcId === 'marmalade');
  assert.equal(marm.bedPose, 'sleep');
  assert.deepEqual(marm.lines, ['hub.marmalade.bed']);
  assert.ok(m.hub.residents.some((r) => r.npcId === 'pip'));
  assert.equal(HUB_NPCS.length, 7);
});

test('M2 Sage basic attack: she keeps 2.5–6.5 m off and shoots 5-damage arrows every 1.6 s', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const [sage] = ctx.companions.setActive(['sage']);
  sage.pos.set(-1, 0, -1);
  const rat = new FakeEnemy(ctx, 1, 3, { state: 'chase', alerted: true, hp: 1000 });
  ctx.enemies.list.push(rat); ctx.actors.register(rat);
  step(ctx, Math.round(4 / DT), () => { rat.pos.set(1, 0, 3); rat.vel.set(0, 0, 0); });
  const shots = ctx.combat.calls.filter((h) => h.att === sage && h.def.id === 'companion_shot');
  assert.ok(shots.length >= 2, `shots ${shots.length}`);
  assert.ok(shots.every((h) => h.def.dmg === COMPANIONS.dmg));
  const d = dist(sage, rat);
  assert.ok(d >= RANGED.min - 0.6 && d <= RANGED.max + 0.6, `stand-off ${d.toFixed(2)} m`);
});
