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
} from '../../src/companions/steering.js';
import { CompanionManager } from '../../src/companions/CompanionManager.js';
import { Companion } from '../../src/companions/Companion.js';
import { LostKitten, CageLock } from '../../src/companions/LostKitten.js';
import { NpcActor, npcLook } from '../../src/companions/NpcActor.js';
import { Pudding, PUDDING } from '../../src/companions/Pudding.js';
import { ShieldWall } from '../../src/companions/ShieldWall.js';
import { BARKS, FALLBACK, lineText } from '../../src/companions/lines.js';
import { wrapText } from '../../src/companions/Bubble.js';
import manifest, { levels as manifestLevels } from '../../src/companions/assets.manifest.js';

const DT = 1 / 60;

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
    assets: { model: () => new Promise(() => {}) },
    objectives: null, env: null, ui: null, audio: null, save: null, postfx: null,
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

test('§9.2 Shield Wall: 3 × 1.6 m, 1.5 m ahead (camera-forward), blocks + staggers, taunts, 4 s, 18 s cooldown', async () => {
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
  assert.ok(Math.abs(w.center.z - COMPANIONS.mochi.dist) < 1e-6 && Math.abs(w.center.x) < 1e-6, 'centre 1.5 m along camera-forward');
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
  assert.equal(lock.faction, 'enemy', 'her swings (hostile to player) reach it');
  const e = new FakeEnemy(ctx, 4, 4);
  assert.equal(ctx.combat.applyHit(e, lock, { dmg: 10 }), 'immune');
  for (let i = 0; i < 3; i++) { ctx.combat.applyHit(ctx.player, lock, { dmg: 10 }); lock.invulnT = 0; }
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
  for (let i = 0; i < 3; i++) { ctx.combat.applyHit(ctx.player, k.lock, { dmg: 10 }); k.lock.invulnT = 0; }
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
