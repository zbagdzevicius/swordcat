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
import { RopePost, HANG, TIP, REUNION } from '../../src/companions/LostKitten.js';
import { RANGED } from '../../src/companions/Companion.js';
import { playerAimYaw, playerForwardYaw, explicitAim, planAbility, abilityShape, CAST } from '../../src/companions/abilityAim.js';
import { idleSlot, inNotch, Trail, lodOrigin } from '../../src/companions/steering.js';
import { NPC_LOD } from '../../src/companions/NpcActor.js';
import { buildCarrier, CARRIER, CARRIER_COLORS, buildRopePost, buildRope, buildFishingStick, buildCup, buildTable, buildButterfly, disposeDressing } from '../../src/companions/dressing.js';
import { Arrow } from '../../src/companions/abilities.js';
import { activityTier, npcBand, bandAnimates, thinkDue, ACTIVITY } from '../../src/companions/activity.js';
import { withHeadScale, roleOf, hullFor, GLANCE } from '../../src/companions/KittenVisual.js';
import { PARTY } from '../../src/companions/party.js';
import { LIFE, PERSONAL_IDLE } from '../../src/companions/Companion.js';
import { BANTER, BANTER_RULE, BanterClock, banterLines } from '../../src/companions/lines.js';
import { lostKittenConfig } from '../../src/characters/index.js';

const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

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

function makeCtx({ anchors = {}, chapter1 = true } = {}) {
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
  if (chapter1) ctx.state.setFlag('prologue.done', true);       // Chapter 1 (WA16: Mochi's carrier waits for it)
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
  // HUD-safe bottom (ability bar): a bark near the bottom edge is lifted above the bar, not just the screen margin
  const hud = 0.3, low = clampShift(0, -0.95, -0.2, 0.2, 0, 0.3, m, m, hud);
  assert.ok(Math.abs(-0.95 + low.dy - (-1 + hud)) < 1e-9, 'bottom edge lifted above the HUD inset');
  assert.deepEqual(clampShift(0, 0, -0.2, 0.2, 0, 0.3, m, m, hud), { dx: 0, dy: 0 }, 'clear of the HUD: untouched');
  const tall = clampShift(0, 0, -0.2, 0.2, 0, 1.9, m, m, hud);
  assert.ok(Math.abs(0 + 0.95 + tall.dy - ((-1 + hud + 1 - m) / 2)) < 1e-9, 'oversized rect centred in the usable span');
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
  const resc = emitted(ctx, E.KITTEN_RESCUED).at(-1);
  assert.equal(resc.kittenId, 'noodle');
  assert.ok(resc.position?.isVector3 && Math.hypot(resc.position.x - 12, resc.position.z) < 1.5, 'X23: the payload carries the position');
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

test('D-01 (WA16): Mochi in the cracked carrier (after the cart arena) → Bright Slash only → join scene → party', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const [cx, cz] = config.STORY.mochiCage;
  const k = m.spawnKitten('mochi', new THREE.Vector3(cx, 0, cz), 'cage', { needClear: 'cart', play: 'd01' });
  assert.equal(k.companion, true);
  assert.equal(ctx.actors.get('mochi'), k, 'the caged Mochi is the cutscene actor "mochi"');
  assert.ok(k.cracked && k.lock.cracked, 'his latch is cracked');
  ctx.bus.emit(E.ARENA_CLEAR, { id: 'cart' });
  // normal blows "tink" off (a guard bounce) and Mochi asks for the shiny swing
  for (let i = 0; i < 4; i++) { assert.equal(ctx.combat.applyHit(ctx.player, k.lock, config.ATTACKS.slash1), 'block'); step(ctx, 30); }
  assert.ok(!k.lock.opened, 'normal hits never open it');
  assert.equal(k.lock.tinks, 4);
  assert.ok(k.bubble.on, 'Mochi says something about it');
  assert.equal(ctx.combat.applyHit(ctx.player, k.lock, config.ATTACKS.bright), 'hit', 'Bright Slash');
  step(ctx, 1);
  assert.ok(k.lock.opened, 'one Bright Slash opens it');
  const vis = k.visual;
  ctx.player.pos.set(cx, 0, cz - 3);
  step(ctx, 90);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(ctx.story.played, ['d01']);
  assert.equal(m.active[0]?.kittenId, 'mochi');
  assert.equal(m.active[0].visual, vis, 'the caged cat look is handed over (no second build on the join frame)');
  assert.ok(Math.hypot(m.active[0].pos.x - cx, m.active[0].pos.z - cz) < 2.5, 'appears at the carrier');
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
  const k = ctx.companions.spawnKitten('mochi', new THREE.Vector3(5, 0, 5), 'cage', { hp: 30, cracked: false });
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
  assert.ok(k.tipped && Math.abs(k.tilt.rotation.x - TIP.roll) < 1e-9, 'ON §6.1: the cart is tipped 8°');
  for (let i = 0; i < 3 && !k.lock.opened; i++) { ctx.combat.applyHit(ctx.player, k.lock, config.ATTACKS.bright); step(ctx, 30); }
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
  for (let i = 0; i < 3 && !k.lock.opened; i++) { ctx.combat.applyHit(ctx.player, k.lock, config.ATTACKS.bright); step(ctx, 30); }
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

test('M2 D-04 Clover: a WA20 kennel carrier holds her until the Square clears; E (interactable) or 3 blows free her → d04clover → joins', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const L = levelOf(ctx, 'town');
  const row = RESCUES.town.find((r) => r[0] === 'clover');
  assert.equal(row[3].cage, 'kennel', 'WA20: no stocks / pillory in the town data');
  const k = m.spawnKitten('clover', [10, 0, 14], 'cage', { cage: 'stocks', needClear: 'square', interact: true, play: 'd04clover', facing: Math.PI });
  assert.equal(k.cage?.userData?.kind, 'carrier', 'a legacy "stocks" cage builds the kennel carrier');
  assert.equal(k.cage.userData.style, 'kennel');
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

// ------------------------------------------------------------------ iso controls (research/CONTROLS_SPEC.md)

/** An Input stand-in with edges, held state, device, move, the P0 aim fields and haptics. */
function isoInput(ctx) {
  const inp = {
    _p: new Set(), _d: new Set(), _r: new Set(), device: 'kbm', move: { x: 0, y: 0 }, aimStick: null, virtualAim: null, haptics: [],
    pressed(a) { return this._p.has(a); }, down(a) { return this._d.has(a); }, released(a) { return this._r.has(a); },
    haptic(k) { this.haptics.push(k); },
  };
  ctx.input = inp;
  return inp;
}
/** Press / hold / release `a` through `n` fixed steps (press on the first, release on the last unless held on). */
function pressFor(ctx, a, n, { release = true } = {}) {
  const inp = ctx.input;
  for (let i = 0; i < n; i++) {
    inp._p.clear(); inp._r.clear();
    if (i === 0) { inp._p.add(a); inp._d.add(a); }
    if (release && i === n - 1) { inp._d.delete(a); inp._r.add(a); }
    step(ctx, 1);
  }
  inp._p.clear(); inp._r.clear();
}
/** Release a held action on the next step. */
function releaseNow(ctx, a) { const inp = ctx.input; inp._d.delete(a); inp._r.add(a); step(ctx, 1); inp._r.clear(); }

test('iso aim: playerAimYaw follows §7.1 (player.aim, explicit, cursor, selected, movement, facing; classic = camera-forward)', () => {
  const ctx = makeCtx(); const inp = isoInput(ctx); const p = ctx.player;
  p.facing = 1.0;
  assert.ok(Math.abs(playerAimYaw(ctx) - 1.0) < 1e-9, 'facing last');
  inp.move = { x: 0, y: 1 };                                     // screen-up at yaw π = +Z
  assert.ok(Math.abs(playerAimYaw(ctx)) < 1e-9, 'movement through the camera yaw');
  inp.move = { x: 1, y: 0 };                                     // screen-right at yaw π = −X
  assert.ok(Math.abs(playerAimYaw(ctx) + Math.PI / 2) < 1e-9, 'screen-right is −X when the camera looks +Z');
  const rat = new FakeEnemy(ctx, 3, 0); ctx.cam.lockTarget = rat;
  assert.ok(Math.abs(playerAimYaw(ctx) - Math.PI / 2) < 1e-9, 'the selected target beats movement');
  ctx.cam.cursorGround = { x: 0, y: 0, z: -4 }; ctx.cam.cursorValid = true;
  assert.ok(Math.abs(Math.abs(playerAimYaw(ctx)) - Math.PI) < 1e-9, 'the cursor beats the selection');
  inp.device = 'pad';
  assert.ok(Math.abs(playerAimYaw(ctx) - Math.PI / 2) < 1e-9, 'no cursor on a pad');
  inp.aimStick = { x: 0, y: 1 };
  assert.ok(Math.abs(playerAimYaw(ctx)) < 1e-9, 'the right stick is an explicit aim');
  p.aim = { active: true, dir: { x: -1, z: 0 } };
  assert.ok(Math.abs(playerAimYaw(ctx) + Math.PI / 2) < 1e-9, "the player's resolved aim wins");
  delete p.aim; inp.aimStick = null; inp.move = { x: 0, y: 0 }; ctx.cam.lockTarget = null; inp.device = 'kbm'; ctx.cam.cursorGround = null;
  ctx.params.cam = 'classic'; ctx.cam.yaw = Math.PI / 2;
  assert.ok(Math.abs(playerAimYaw(ctx) - camForwardYaw(Math.PI / 2)) < 1e-9, '?cam=classic keeps camera-forward');
  assert.equal(playerForwardYaw, playerAimYaw, 'the M1 name is an alias');
});

test('iso aim: explicit touch drag / RS map through the camera yaw; px drags scale by 90 px; dead zones', () => {
  const ctx = makeCtx(); const inp = isoInput(ctx); const out = {};
  inp.virtualAim = { x: 0, y: 0.1, active: true };
  assert.equal(explicitAim(ctx, out), null, 'a 0.1 drag is a tap');
  inp.virtualAim = { x: 45, y: 0, active: true };              // 45 CSS px right
  assert.ok(explicitAim(ctx, out));
  assert.ok(Math.abs(out.x + 1) < 1e-9 && Math.abs(out.z) < 1e-9 && Math.abs(out.mag - 0.5) < 1e-9 && out.source === 'touch', JSON.stringify(out));
  inp.virtualAim = null; inp.aimStick = { x: 0, y: 0.3 };
  assert.equal(explicitAim(ctx, out), null, 'RS under 0.35');
  inp.aimStick = { x: 0, y: -0.9 };
  assert.ok(explicitAim(ctx, out) && Math.abs(out.z + 1) < 1e-9 && out.source === 'pad');
  ctx.cam.stickYaw = 0;                                          // the stick latch (camera north looking −Z)
  assert.ok(explicitAim(ctx, out) && Math.abs(out.z - 1) < 1e-9, 'uses cam.stickYaw');
});

test('iso §7.5 Shield Wall plans: aimed = 1.5 m along the aim (dir or point); smart = toward the engaged centroid, else facing', () => {
  const ctx = makeCtx(); const p = ctx.player;
  const [c] = ctx.companions.setActive(['mochi']);
  p.facing = Math.PI / 2;
  let pl = planAbility(ctx, c, null);
  assert.ok(pl.valid && pl.shape === 'rect' && !pl.aimed && pl.source === 'smart');
  assert.ok(Math.abs(pl.center.x - 1.5) < 1e-9 && Math.abs(pl.center.z) < 1e-9, 'facing when nothing is engaged');
  assert.equal(pl.width, COMPANIONS.mochi.width); assert.equal(pl.length, CAST.wallDepth);
  const a = new FakeEnemy(ctx, -2, 3, { state: 'chase', alerted: true }), b = new FakeEnemy(ctx, 2, 3, { state: 'chase', alerted: true });
  const idle = new FakeEnemy(ctx, -5, -1, { state: 'idle' });
  ctx.enemies.list.push(a, b, idle);
  pl = planAbility(ctx, c, null);
  assert.ok(Math.abs(pl.yaw) < 1e-9 && Math.abs(pl.center.z - 1.5) < 1e-9, 'between her and the two engaged rats (centroid +Z)');
  pl = planAbility(ctx, c, { dir: { x: 0, z: -2 } });
  assert.ok(pl.aimed && Math.abs(pl.center.z + 1.5) < 1e-9 && Math.abs(Math.abs(pl.yaw) - Math.PI) < 1e-9, 'aimed by direction');
  pl = planAbility(ctx, c, { point: { x: -4, z: 0 }, source: 'cursor' });
  assert.ok(pl.aimed && pl.source === 'cursor' && Math.abs(pl.center.x + 1.5) < 1e-9, 'aimed at a point: 1.5 m along it, not at it');
  pl = planAbility(ctx, c, { point: { x: 0.01, z: 0.01 } });
  assert.ok(!pl.aimed && pl.source === 'smart', 'a point on her is no aim');
  assert.deepEqual(abilityShape(COMPANIONS.mochi), { ability: 'shieldWall', shape: 'rect', range: 1.5, width: 3, length: 0.4 });
});

test('iso §7.5 Volley plans: smart = Wild Rift order, the selected target first (2 of 5 arrows); aimed = nearest the point; nothing → no cast', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const [s] = ctx.companions.setActive(['sage']);
  assert.equal(planAbility(ctx, s, null).valid, false, 'no targets: invalid');
  assert.equal(s.useAbility(), false); assert.equal(s.cooldown, 0, 'no cooldown spent');
  const near = new FakeEnemy(ctx, 1, 2, { state: 'chase', alerted: true });
  const crow = new FakeEnemy(ctx, -3, 6, { state: 'circle', alerted: true, flyer: true });
  const idle = new FakeEnemy(ctx, 2, 3, { state: 'idle' });
  const sel = new FakeEnemy(ctx, 6, 8, { state: 'idle' });
  const far = new FakeEnemy(ctx, 0, 20, { state: 'chase', alerted: true });
  for (const e of [near, crow, idle, sel, far]) { e.hp = e.maxHp = 1000; ctx.enemies.list.push(e); ctx.actors.register(e); }
  let pl = planAbility(ctx, s, null);
  assert.ok(pl.valid && pl.shape === 'targets' && pl.range === COMPANIONS.sage.range);
  assert.ok(pl.targets.length === 3 && pl.targets[0] === near && pl.targets[1] === crow && pl.targets[2] === idle,
    'engaged and near, then the engaged flyer, then the idle one; 14 m range');
  ctx.cam.lockTarget = sel;
  pl = planAbility(ctx, s, null);
  assert.equal(pl.targets[0], sel, 'the selected target leads'); assert.equal(pl.targets.length, 3);
  ctx.cam.lockTarget = null;
  pl = planAbility(ctx, s, { point: { x: 2, z: 3.2 } });
  assert.equal(pl.targets[0], idle, 'aimed: nearest the aim point first');
  assert.ok(!pl.targets.includes(far), 'never past 14 m');
  ctx.cam.lockTarget = sel;
  pl = planAbility(ctx, s, { point: { x: 6, z: 7 } });
  assert.equal(pl.targets[0], sel, 'aimed keeps the selected one first when it is among the nearest');
  // cast it: 5 arrows round-robin over the plan (the first target gets 2)
  assert.ok(ctx.companions.useAbility({ point: { x: 6, z: 7 } }));
  step(ctx, Math.round(2.5 / DT));
  const arrows = ctx.combat.calls.filter((h) => h.att === s && h.def.id === 'companion_arrow');
  assert.equal(arrows.length, 5);
  assert.equal(arrows.filter((h) => h.tgt === sel).length, 2, 'the selected target takes 2 arrows');
});

test('iso cast input: KBM tap = quick cast at the cursor; hold = indicator follows, release casts; Esc / RMB / ✕ cancel (no cooldown)', async () => {
  const ctx = makeCtx(); await ctx.companions.init(); const inp = isoInput(ctx);
  const m = ctx.companions; const [c] = m.setActive(['mochi']);
  ctx.cam.cursorGround = { x: 4, y: 0, z: 0 }; ctx.cam.cursorValid = true;
  pressFor(ctx, 'ability', 3);                                   // a tap (< CAST.hold)
  assert.equal(m.walls.length, 1, 'a tap casts');
  assert.ok(Math.abs(m.walls[0].center.x - 1.5) < 1e-6 && Math.abs(m.walls[0].center.z) < 1e-6, 'toward the cursor');
  const ev = emitted(ctx, E.COMPANION_ABILITY).at(-1);
  assert.ok(ev.aimed && ev.source === 'cursor' && Math.abs(ev.dir.x - 1) < 1e-9, JSON.stringify(ev));
  assert.deepEqual(inp.haptics, ['kitten']);
  assert.equal(m.aim.active, false);
  pressFor(ctx, 'ability', 20);                                  // on cooldown: nothing, no indicator
  assert.equal(c.stats.abilities, 1); assert.equal(m.aim.active, false);
  // hold: the indicator after CAST.hold, it follows the cursor, the release casts there
  c.cooldown = 0; c._endAbility();
  const n0 = c.stats.abilities;
  pressFor(ctx, 'ability', Math.ceil(CAST.hold / DT) + 4, { release: false });
  assert.ok(m.aim.active && m.aim.shape === 'rect' && m.aim.kittenId === 'mochi', 'indicator shown while held');
  ctx.cam.cursorGround = { x: 0, y: 0, z: -3 };
  step(ctx, 1);
  assert.ok(Math.abs(m.aim.plan.center.z + 1.5) < 1e-6, 'the indicator follows the cursor');
  assert.equal(c.stats.abilities, n0, 'no cast while held');
  releaseNow(ctx, 'ability');
  assert.equal(c.stats.abilities, n0 + 1, 'release casts');
  assert.ok(m.walls.some((w) => Math.abs(w.center.z + 1.5) < 1e-6), 'where the indicator was');
  // Esc while held: cancelled, no cooldown
  c.cooldown = 0; c._endAbility();
  pressFor(ctx, 'ability', 15, { release: false });
  assert.ok(m.aim.active);
  inp._p.add('back'); step(ctx, 1); inp._p.clear();
  assert.equal(m.aim.active, false, 'Esc hides the indicator');
  releaseNow(ctx, 'ability');
  assert.equal(c.stats.abilities, n0 + 1, 'a cancelled aim casts nothing'); assert.equal(c.cooldown, 0);
  // RMB (`move`) cancels too, and ui's ✕ (cancelAbilityAim)
  pressFor(ctx, 'ability', 15, { release: false });
  inp._p.add('move'); step(ctx, 1); inp._p.clear();
  assert.equal(m.aim.active, false);
  releaseNow(ctx, 'ability');
  pressFor(ctx, 'ability', 15, { release: false });
  assert.ok(m.cancelAbilityAim());
  releaseNow(ctx, 'ability');
  assert.equal(c.stats.abilities, n0 + 1, 'no cast after RMB or ✕');
  // leaving play drops the aim
  pressFor(ctx, 'ability', 15, { release: false });
  ctx.game.mode = 'cutscene'; step(ctx, 1); ctx.game.mode = 'play';
  assert.equal(m.aim.active, false); assert.equal(m._cast, null);
  inp._d.clear();
});

test('iso cast input: pad / touch taps are smart; RS / drag aim; castMode indicator shows at once; dragOnly touch taps cast nothing', async () => {
  const ctx = makeCtx(); await ctx.companions.init(); const inp = isoInput(ctx);
  const m = ctx.companions; const [c] = m.setActive(['mochi']);
  ctx.cam.cursorGround = { x: 4, y: 0, z: 0 };                  // stale: ignored off KBM
  inp.device = 'pad'; ctx.player.facing = 0;
  pressFor(ctx, 'ability', 3);
  assert.ok(Math.abs(m.walls[0].center.z - 1.5) < 1e-6, 'pad tap: smart (facing)');
  c.cooldown = 0; c._endAbility();                              // pad hold + RS: aimed along the stick
  inp.aimStick = { x: 0, y: -1 };
  pressFor(ctx, 'ability', 2, { release: false });
  assert.ok(m.aim.active, 'an RS aim shows the indicator at once');
  releaseNow(ctx, 'ability');
  assert.equal(emitted(ctx, E.COMPANION_ABILITY).at(-1).source, 'pad');
  assert.ok(m.walls.some((w) => Math.abs(w.center.z + 1.5) < 1e-6), 'behind her, along the stick');
  inp.aimStick = null;
  c.cooldown = 0; c._endAbility(); ctx.state.settings.castMode = 'indicator'; inp.device = 'kbm';
  pressFor(ctx, 'ability', 1, { release: false });
  assert.ok(m.aim.active, 'indicator mode: shown on press');
  releaseNow(ctx, 'ability');
  c.cooldown = 0; c._endAbility(); ctx.state.settings.castMode = 'dragOnly'; inp.device = 'touch';
  const n = c.stats.abilities;
  pressFor(ctx, 'ability', 3);
  assert.equal(c.stats.abilities, n, 'dragOnly: a touch tap casts nothing');
  assert.ok(m.aimAbility({ dir: { x: -1, z: 0 } }));
  step(ctx, 1);
  assert.ok(m.aim.active && Math.abs(m.aim.plan.center.x + 1.5) < 1e-6, 'ui drag-aim drives the indicator');
  assert.ok(m.useAbility({ dir: { x: -1, z: 0 } }));
  assert.equal(m.aim.active, false);
  assert.ok(m.walls.some((w) => Math.abs(w.center.x + 1.5) < 1e-6));
  ctx.state.settings.castMode = 'smart';
});

test('iso §10.1 data: cooldownLeft / readiness / canCast / abilityShape per id; napping → not castable', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions; const [c] = m.setActive(['clover']);
  assert.equal(m.cooldownLeft(), 0); assert.equal(m.readiness('clover'), 1); assert.ok(m.canCast('clover'));
  assert.equal(m.abilityShape().shape, 'self');
  assert.ok(m.useAbility());
  assert.equal(m.cooldownLeft('clover'), COMPANIONS.clover.cd); assert.equal(m.readiness(), 0); assert.equal(m.canCast(), false);
  step(ctx, Math.round(10 / DT));
  assert.ok(Math.abs(m.cooldownLeft(0) - (COMPANIONS.clover.cd - 10)) < 0.05);
  assert.ok(Math.abs(m.readiness() - 10 / COMPANIONS.clover.cd) < 0.01);
  c.cooldown = 0; c._endAbility(); c.startNap();
  assert.equal(m.canCast(), false, 'napping');
  assert.equal(m.cooldownLeft('sage'), 0); assert.equal(m.readiness('sage'), 0); assert.equal(m.abilityShape('sage'), null, 'not in the party');
});

test('iso follow: the idle slot is back-left / back-right ≥ 1.4 m and flips out of her aim notch', async () => {
  const p = { x: 0, z: 0 }, out = {};
  idleSlot(p, 0, 0, 1, out);                                     // she faces +Z and aims +Z
  assert.ok(out.z < 0 && out.x > 0 && out.side === 1 && Math.hypot(out.x, out.z) >= SLOT.minIdle - 1e-9, JSON.stringify(out));
  const aimBackLeft = Math.atan2(out.x, out.z);                  // she turns the cursor onto him
  idleSlot(p, 0, aimBackLeft, 1, out);
  assert.equal(out.side, -1, 'flips to her other side');
  assert.ok(!inNotch(p, out.x, out.z, aimBackLeft));
  const ctx = makeCtx(); await ctx.companions.init();           // in the game: aim at his spot and he moves round
  const [c] = ctx.companions.setActive(['mochi']);
  step(ctx, 240);
  assert.ok(c.pos.x > 0 && c.pos.z < 0, 'settled back-left');
  ctx.player.aim = { dir: { x: c.pos.x, z: c.pos.z } };
  step(ctx, 180);
  assert.ok(!inNotch(ctx.player.pos, c.pos.x, c.pos.z, Math.atan2(ctx.player.aim.dir.x, ctx.player.aim.dir.z)), 'out of the notch');
  assert.ok(c.pos.x < 0, 'now back-right');
  assert.ok(dist(c, ctx.player) >= SLOT.minIdle - 0.2);
});

test('iso follow: blocked by a wall she walked round, he walks her breadcrumb trail instead of teleporting', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const [c] = ctx.companions.setActive(['mochi']);
  const p = ctx.player;
  // a wall along x = 0 for z in [-4, 6]: sight lines crossing it are blocked, and nothing walks through it
  const crosses = (ax, az, bx, bz) => segmentHit(ax, az, bx, bz, 0, -4, 0, 6) >= 0;
  ctx.physics.lineOfSight = (a, b) => !crosses(a.x, a.z, b.x, b.z);
  const move0 = ctx.physics.moveActor.bind(ctx.physics);
  ctx.physics.moveActor = (a, dt) => { const x = a.pos.x, z = a.pos.z; move0(a, dt); if (crosses(x, z, a.pos.x, a.pos.z)) { a.pos.x = x; a.pos.z = z; } };
  p.pos.set(-1.5, 0, 0); p.onGround = true; c.pos.set(-2.5, 0, -1.5); c.snap();
  for (const [tx, tz] of [[-1.5, 7], [1.5, 7], [1.5, 3]]) {      // her path round the end of the wall
    for (let i = 0; i < 600; i++) {
      const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.1) break;
      step(ctx, 1, () => { p.vel.set(dx / d * 4, 0, dz / d * 4); p.facing = Math.atan2(dx, dz); p.pos.addScaledVector(p.vel, DT); });
    }
  }
  p.vel.set(0, 0, 0);
  step(ctx, Math.round(5 / DT));
  assert.equal(c.stats.teleports, 0, 'no teleport: he walked round');
  assert.ok(c.stats.trails >= 1, 'took her trail');
  assert.ok(c.pos.x > 0 && dist(c, p) < 3.5, `with her on the far side (${c.pos.x.toFixed(2)}, ${c.pos.z.toFixed(2)})`);
});

test('iso Trail: crumbs every 0.6 m, sequence lookups survive newer crumbs, a teleport restarts it', () => {
  const t = new Trail(4, 0.6), o = {};
  assert.equal(t.push(0, 0, 0), true); assert.equal(t.push(0, 0, 0.3), false, 'closer than the spacing');
  t.push(0, 0, 0.7); t.push(0, 0, 1.4);
  const s = t.seqOf(1);
  assert.ok(Math.abs(t.getSeq(s, o).z - 0.7) < 1e-6);
  t.push(0, 0, 2.1); t.push(0, 0, 2.8);
  assert.ok(Math.abs(t.getSeq(s, o).z - 0.7) < 1e-6, 'still there after newer crumbs');
  t.push(0, 0, 3.5);
  assert.equal(t.getSeq(s, o), null, 'overwritten');
  assert.equal(t.nearest(0, 2.2), 2);
  t.push(30, 0, 30);
  assert.equal(t.count, 1, 'a teleport restarts the trail');
  assert.equal(t.getSeq(s + 3, o), null, 'old sequence numbers die with it');
});

test('iso click / tap: pickables, use(): companion hello, NPC nod, kitten rescue; hidden kittens never pickable', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions; const [c] = m.setActive(['mochi']);
  const npc = m.spawnNpc('pearl', [3, 0, 3], 0);
  const hid = m.spawnKitten('noodle', [-4, 0, 4], 'meow', { prop: 'barrel' });
  const out = m.pickables();
  assert.ok(out.includes(npc) && !out.includes(hid), 'hidden kitten not pickable');
  assert.ok(!out.includes(c), 'the active party is never offered: clicks right behind her fall through to ground');
  assert.equal(c.pickKind, 'companion'); assert.equal(npc.pickKind, 'npc'); assert.equal(hid.pickKind, null);
  assert.ok(c.useR > 1 && npc.useR > 1);
  assert.ok(m.use(c)); assert.equal(c.stats.pets, 1); assert.ok(c.regroupT > 0);
  assert.ok(m.use('pearl'));
  step(ctx, 30);
  assert.ok(Math.abs(wrapA(npc.facing - Math.atan2(-3, -3))) < 0.4, 'she turned to look at her');
  hid.reveal();
  step(ctx, 1);
  assert.equal(hid.pickKind, 'kitten');
  assert.equal(m.use(hid), false, 'too far: just a hop');
  ctx.player.pos.set(hid.pos.x + 1, 0, hid.pos.z);
  assert.ok(m.use(hid)); assert.ok(hid.rescued); assert.ok(ctx.state.kittens.includes('noodle'));
  assert.equal(hid.pickKind, null, 'rescued: no longer a target');
  npc.setScripted(true); assert.equal(npc.pickKind, null, 'scripted NPCs are not clickable'); npc.setScripted(false);
});

test('iso hub: residents get talk_<id> interactables (prompt.talk) clear of stations; a keeper stands for its station', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  ctx.levels.current = { id: 'town', interactables: [], interact(id) { const it = this.interactables.find((i) => i.id === id); if (!it || (it.enabled && !it.enabled())) return false; it.use(); return true; } };
  const station = { id: 'bakery', kind: 'station', pos: new THREE.Vector3(-22.6, 0, -18.4), r: 2.2, uses: 0, use() { this.uses++; } };
  ctx.levels.current.interactables.push(station);
  ctx.state.setFlag('town.free', true);
  ctx.state.addKitten('biscuit');
  ctx.bus.emit(E.LEVEL_LOADED, { id: 'town' });
  const m = ctx.companions, rs = m.hub.residents;
  const biscuit = rs.find((r) => r.npcId === 'biscuit'), marm = rs.find((r) => r.npcId === 'marmalade');
  const talk = ctx.levels.current.interactables.find((i) => i.id === 'talk_biscuit');
  assert.ok(talk && talk.kind === 'npc' && talk.prompt === 'prompt.talk' && talk.pos === biscuit.pos, 'Biscuit talks on [Interact]');
  assert.equal(marm.interactId, 'bakery', 'Marmalade stands for the bakery');
  assert.ok(!ctx.levels.current.interactables.some((i) => i.id === 'talk_marmalade'));
  assert.ok(m.use(marm)); assert.equal(station.uses, 1, 'a click on the keeper opens the shop');
  const n = ctx.audio.babbles.length;
  assert.ok(ctx.levels.current.interact('talk_biscuit'));
  assert.ok(ctx.audio.babbles.length > n, 'her line, now');
  assert.ok(m.use(biscuit), 'a second click talks again (no repeat wait)');
  ctx.bus.emit(E.LEVEL_UNLOAD, {});
  assert.ok(!ctx.levels.current.interactables.some((i) => i.actor), 'talk interactables leave with the residents');
});

test('iso §2.8 LOD from the camera focus: lodOrigin, NPC far cull, lost kittens', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  ctx.env = { fogDensity: 0.05 };                                // cull at max(40, 2 / 0.05) = 40 m
  const o = {};
  ctx.player.pos.set(0, 0, 0);
  assert.deepEqual(lodOrigin(ctx, o), { x: 0, z: 0 }, 'no focus: her');
  ctx.cam.focus = new THREE.Vector3(100, 0, 0);
  assert.deepEqual(lodOrigin(ctx, o), { x: 100, z: 0 }, 'play: the focus');
  ctx.game.mode = 'cutscene'; ctx.camera.position.set(5, 3, 5);
  assert.deepEqual(lodOrigin(ctx, o), { x: 5, z: 5 }, 'cutscene presets: the lens');
  ctx.game.mode = 'play';
  const npc = ctx.companions.spawnNpc('pearl', [0, 0, 0], 0);
  npc.render(0, 0.3);
  assert.ok(npc._far && npc.pickKind === null, `far from the focus (> ${NPC_LOD.minD} m): culled`);
  assert.ok(npc.object3d.children.every((ch) => !ch.visible));
  ctx.cam.focus.set(2, 0, 2);
  npc.render(0, 0.3);
  assert.ok(!npc._far && npc.pickKind === 'npc', 'back near the focus');
  const k = ctx.companions.spawnKitten('noodle', [0, 0, 1], null);
  ctx.cam.focus.set(100, 0, 0); k._farCull();
  assert.ok(k._far, 'lost kitten culled from the focus');
  ctx.cam.focus.set(0, 0, 0); k._farCull();
  assert.ok(!k._far);
});

test('iso AbilityIndicator: draws the aim (rect / ring + pips / self), hides when idle or when fx takes over', async () => {
  const ctx = makeCtx(); await ctx.companions.init(); isoInput(ctx);
  const m = ctx.companions; m.setActive(['mochi']);
  m.render(0, 0.016);
  assert.equal(m.indicator.showing, null);
  assert.ok(m.aimAbility({ dir: { x: 1, z: 0 } }));
  step(ctx, 1); m.render(0, 0.016);
  assert.equal(m.indicator.showing, 'rect');
  const r = m.indicator.rect;
  assert.ok(r.visible && Math.abs(r.position.x - 1.5) < 1e-6 && Math.abs(r.scale.x - 3) < 1e-6 && Math.abs(r.scale.z - 0.4) < 1e-6);
  assert.equal(r.material.depthWrite, false, 'a decal: never hides what stands on it');
  ctx.fx.drawsAbilityAim = true; m.render(0, 0.016);
  assert.equal(m.indicator.showing, null, 'fx draws it');
  ctx.fx.drawsAbilityAim = false;
  m.cancelAbilityAim(); m.render(0, 0.016);
  assert.equal(m.indicator.showing, null);
  m.setActive(['sage']);
  const e = new FakeEnemy(ctx, 2, 5, { state: 'chase', alerted: true }); ctx.enemies.list.push(e);
  m.aimAbility({ point: { x: 2, z: 5 } }); step(ctx, 1); m.render(0, 0.016);
  assert.equal(m.indicator.showing, 'targets');
  assert.ok(m.indicator.ring.visible && Math.abs(m.indicator.ring.scale.x - 28) < 1e-6, '14 m range ring');
  assert.ok(m.indicator.pips[0].visible && Math.abs(m.indicator.pips[0].position.z - 5) < 1e-6, 'a pip under the target');
  m.cancelAbilityAim();
  m.dispose();
  assert.equal(m.indicator.root, null);
});

// ------------------------------------------------------------------ Phase W: warm adventure + perf + auto-camera

test('WA20 carriers: wood / rope / lilac bow / polka-dot cushion, no iron grey, no metal, no member < 0.06 m, ≤ 2 draws', () => {
  const grey = (hex) => { const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl); return hsl.s < 0.18; };
  for (const hex of CARRIER_COLORS) assert.ok(!grey(hex), `carrier colour ${hex} reads as iron grey`);
  for (const hex of ['#3B3D42', '#5A5D63', '#4A4C52']) assert.ok(!CARRIER_COLORS.includes(hex), `iron ${hex}`);
  assert.equal(CARRIER.wood, '#B7773F'); assert.equal(CARRIER.rope, '#E8B87A'); assert.equal(CARRIER.bow, '#C9A8FF'); assert.equal(CARRIER.cushion, '#FF9EC0');
  assert.ok(CARRIER.minMember >= 0.06 && CARRIER.slat >= 0.06 && CARRIER.slatDepth >= 0.06, 'WA20: no bar thinner than 0.06 m');
  for (const style of ['carry', 'cart', 'hanging']) {
    const g = buildCarrier({ style, cracked: style === 'cart', wheel: style === 'cart' ? [0.3, -0.5, 1.1] : null });
    let meshes = 0, metal = 0;
    g.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const r = o.geometry.attributes.rmse;
      if (r) for (let i = 0; i < r.count; i++) metal = Math.max(metal, r.getY(i));
      assert.equal(o.castShadow, false, 'K5: carriers cast no sun shadow');
    });
    assert.ok(meshes <= 2, `${style}: ${meshes} draws (the old cage was 3)`);
    assert.equal(metal, 0, `${style}: no metal`);
    assert.equal(g.userData.kind, 'carrier');
    g.userData.setOpen(1);
    assert.ok(Math.abs(g.userData.door.rotation.y) > 1);
  }
  const ctx = makeCtx();
  const k = ctx.companions.spawnKitten('sprout', new THREE.Vector3(2, 0, 2), 'cage', { ribbon: true });
  assert.equal(k.cage.userData.kind, 'carrier', 'every rescue cage is a kitten carrier now');
  assert.ok(!k.cracked && !k.lock.cracked, 'plain carriers open to 3 blows');
});

test('WA16: Mochi\'s carrier waits for Chapter 1 on the meadow; the meadow data moves him to STORY.mochiCage, Biscuit to the Old Bridge', async () => {
  const ctx = makeCtx({ chapter1: false }); await ctx.companions.init();
  const m = ctx.companions;
  const [cx, cz] = config.STORY.mochiCage;
  assert.equal(m.spawnKitten('mochi', [cx, 0, cz], 'cage', { needClear: 'cart', play: 'd01', cage: 'cart' }), null, 'not during the prologue');
  assert.equal(m.kittens.length, 0);
  ctx.state.setFlag('prologue.done', true);
  ctx.bus.emit(E.FLAG_SET, { key: 'prologue.done', value: true });
  const k = m.kittens.find((x) => x.kittenId === 'mochi');
  assert.ok(k && k.cracked && k.tipped, 'his tipped cart with the cracked latch appears with Chapter 1');
  const { default: meadow } = await import('../../src/world/levels/meadow.js');
  const def = meadow.def ?? meadow;
  const zones = def.zones ?? [];
  const cart = zones.find((z) => z.rescue?.companion === 'mochi');
  assert.ok(cart, 'an arena rescues Mochi');
  assert.deepEqual(cart.rescue.cage, [cx, cz]); assert.equal(cart.rescue.play, 'd01'); assert.equal(cart.id, 'cart');
  assert.equal(cart.waves.flat().reduce((n, w) => n + (w[1] ?? 1), 0), 3, '3 rats guard the cart');
  const bridge = zones.find((z) => z.id === 'bridge');
  assert.ok(!bridge.rescue, 'the Old Bridge no longer holds Mochi');
  const biscuit = zones.find((z) => z.kittenId === 'biscuit');
  assert.equal(biscuit.hide, 'cage'); assert.equal(biscuit.needClear, 'bridge'); assert.deepEqual(biscuit.at, [30, 74]);
});

test('PERF §4.3 activity: camera tier when it has one, our frustum fallback, NPC bands, staggered cadence, 10 Hz think', () => {
  const ctx = makeCtx();
  const a = new Actor(ctx, { radius: 0.3, height: 0.8 });
  ctx.cam.activityOf = () => 2;
  assert.equal(activityTier(ctx, a), 2, 'camera.activityOf wins');
  delete ctx.cam.activityOf;
  const cam = ctx.camera;
  cam.position.set(0, 10, 10); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  ctx.game.frameCount = 1;
  a.pos.set(0, 0, 0);
  assert.equal(activityTier(ctx, a), 0, 'in view');
  ctx.game.frameCount = 2; a.pos.set(0, 0, 40);
  assert.equal(activityTier(ctx, a), 2, 'behind the lens, 40 m from the focus');
  ctx.game.frameCount = 3; a.pos.set(0, 0, 25);
  assert.equal(activityTier(ctx, a), 1);
  ctx.game.frameCount = 4; a.pos.set(0, 0, 200);
  assert.equal(activityTier(ctx, a), 3);
  ctx.player.pos.set(0, 0, 0);
  a.pos.set(5, 0, 0); assert.equal(npcBand(ctx, a, 0), 'full');
  a.pos.set(12, 0, 0); assert.equal(npcBand(ctx, a, 0), 'half');
  assert.equal(npcBand(ctx, a, 0, true), 'full', 'a speaker / scripted actor stays full');
  assert.equal(npcBand(ctx, a, 1), 'slow'); assert.equal(npcBand(ctx, a, 2), 'off');
  const half = [0, 1, 2, 3].map((f) => bandAnimates('half', 7, f));
  assert.deepEqual(half, [false, true, false, true], '30 Hz staggered by (id + frame) & 1');
  assert.equal([0, 1, 2, 3, 4, 5].filter((f) => bandAnimates('slow', 3, f)).length, 1, '10 Hz');
  assert.ok(!bandAnimates('off', 1, 0));
  // 10 Hz think on the deterministic step counter (phase = id), timer fallback without one
  const g = { stepCount: 0 }; let n = 0;
  for (let i = 0; i < 60; i++) { g.stepCount = i; if (thinkDue(g, 5, null, DT)) n++; }
  assert.equal(n, 10);
  const st = { thinkT: 0 }; n = 0;
  for (let i = 0; i < 60; i++) if (thinkDue({}, 5, st, DT)) n++;
  assert.ok(n >= 9 && n <= 11, `timer fallback ${n}`);
  assert.equal(ACTIVITY.thinkHz, 10);
});

test('PERF §4.3 / K5: a kitten off screen is not drawn and animates at a lower rate; no actor casts a sun shadow', () => {
  const ctx = makeCtx();
  const c = new Companion(ctx, 'mochi');
  let shadow = false;
  c.object3d.traverse((o) => { if (o.isMesh && o.castShadow) shadow = true; });
  assert.ok(!shadow, 'K5: castShadow false everywhere');
  ctx.cam.activityOf = () => 0;
  c.render(1, DT);
  assert.ok(c.visual.root.visible && c.visual.band === 'full');
  ctx.cam.activityOf = () => 2;
  c.render(1, DT);
  assert.equal(c.visual.band, 'off');
  assert.equal(c.visual.root.visible, false, 'tier ≥ 2: not drawn');
  ctx.cam.activityOf = () => 0;
  c.render(1, DT);
  assert.ok(c.visual.root.visible, 'back in view: drawn the same frame');
  c.dispose();
});

test('ART §6: role head scale (kittens 1.22, villagers 1.05), hull tiers (X9), camera glance (≤ 25°, calm only)', () => {
  assert.equal(withHeadScale({ id: 'mochi' }, 'companion').headScale, 1.22);
  assert.equal(withHeadScale(lostKittenConfig('noodle'), roleOf(lostKittenConfig('noodle'))).headScale, 1.22);
  const v = withHeadScale({ id: 'villager_3', headScale: 1.03 }, 'villager').headScale;
  assert.ok(Math.abs(v - 1.05) < 1e-9);
  assert.equal(roleOf({ id: 'villager_3', tier: 'lite' }), 'villager');
  assert.ok(hullFor('companion', 'heroCompanionsEngaged') && hullFor('companion', 'all') && !hullFor('companion', 'hero'));
  assert.ok(!hullFor('kitten', 'heroCompanionsEngaged') && hullFor('villager', 'all'));
  const ctx = makeCtx();
  const c = new Companion(ctx, 'mochi');
  assert.equal(c.visual.cfg.headScale, 1.22);
  ctx.camera.position.set(4, 10, 10);
  let held = false, maxYaw = 0;
  for (let i = 0; i < Math.round(12 / DT); i++) { c.visual.update(DT, { calm: true }); if (c.visual.glancing) { held = true; maxYaw = Math.max(maxYaw, Math.abs(c.visual._gl.yaw)); } }
  assert.ok(held, 'glanced within 12 s of calm');
  assert.ok(maxYaw <= GLANCE.maxYaw + 1e-9 && GLANCE.maxYaw <= 25 * Math.PI / 180 + 1e-9);
  c.visual.update(DT, { calm: false });
  assert.ok(!c.visual.glancing, 'drops it when not calm');
  c.dispose();
});

test('companions.W3: encounter clear → paw-bump only for companions within 8 m; a new alert cancels it', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const [mochi] = m.setActive(['mochi']);
  const sage = new Companion(ctx, 'sage', { pos: new THREE.Vector3(0, 0, -13) });
  m.active.push(sage);
  mochi.pos.set(1.5, 0, -1); sage.pos.set(0, 0, -13);
  const bumped = m.party.pawBump();
  assert.deepEqual(bumped.map((c) => c.kittenId), ['mochi'], 'only within PARTY.bumpR');
  assert.equal(PARTY.bumpR, 8);
  assert.ok(ctx.fx.bursts.includes('stars') && ctx.fx.bursts.includes('heart'));
  m.active.pop(); sage.dispose();
  // via the event: after the beat
  step(ctx, 60);
  const before = mochi.stats.bumps;
  ctx.bus.emit(E.ARENA_CLEAR, { id: 'stones' });
  step(ctx, Math.ceil(PARTY.bumpDelay / DT) + 2);
  assert.equal(mochi.stats.bumps, before + 1, 'arena clear → paw-bump');
  step(ctx, 60);
  ctx.bus.emit(E.ARENA_CLEAR, { id: 'glade' });
  ctx.bus.emit(E.ENEMY_ALERTED, { enemy: null });
  step(ctx, Math.ceil(PARTY.bumpDelay / DT) + 2);
  assert.equal(mochi.stats.bumps, before + 1, 'skipped on a new alert');
});

test('companions.W3: parry → nearest companion meows + heart; ≥ 3 KOs in 4 s → one cheer; KO run and boing-back landing', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const [c] = m.setActive(['mochi']);
  step(ctx, 30);
  ctx.fx.bursts.length = 0;
  ctx.bus.emit(E.PLAYER_PARRY, { attacker: null });
  assert.ok(ctx.fx.bursts.includes('heart'));
  for (let i = 0; i < 4; i++) { ctx.bus.emit(E.ENEMY_DIED, { enemy: null, position: new THREE.Vector3(3, 0, 3) }); ctx.game.time += 0.5; }
  assert.equal(c.stats.cheers, 1, 'one cheer per streak');
  // KO: he runs to her and shakes his head
  c.pos.set(6, 0, 0);
  ctx.bus.emit(E.PLAYER_DIED, {});
  assert.ok(c.koT > 0);
  step(ctx, Math.round(2 / DT));
  assert.ok(dist(c, ctx.player) < 1.6, `ran to her (${dist(c, ctx.player).toFixed(2)} m)`);
  assert.ok(c._shook);
  // she boings back at the vigil stone: he lands 1.5 m beside her with a paw-bump
  ctx.player.pos.set(20, 0, 20);
  const bumps = c.stats.bumps;
  ctx.bus.emit(E.PLAYER_SPAWNED, { player: ctx.player });
  assert.ok(Math.abs(dist(c, ctx.player) - 1.5) < 0.3, `landed ${dist(c, ctx.player).toFixed(2)} m beside her`);
  assert.equal(c.stats.bumps, bumps + 1);
});

test('companions.W3: idle ladder 1.5 s behind hers → personal idle (Mochi yawns, Sage reads, Clover chases her tail)', async () => {
  assert.deepEqual(PERSONAL_IDLE, { mochi: 'yawn', sage: 'nodBook', clover: 'tailChase' });
  const ctx = makeCtx(); await ctx.companions.init();
  const [c] = ctx.companions.setActive(['clover']);
  step(ctx, Math.round(((config.IDLE?.groom ?? 10) + LIFE.offset + 0.5) / DT));
  assert.ok(c.stats.idles >= 1, 'the personal idle ran');
  assert.ok(c.spinT > 0 || c.stats.idles >= 1);
});

test('companions.W4: 25 s calm → exactly one banter pair (companion line, then her reply); never with an alert near', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const [c] = m.setActive(['mochi']);
  step(ctx, Math.round((BANTER_RULE.calmFor - 1) / DT));
  assert.equal(m.party.stats.banter, 0, 'not before 25 s');
  step(ctx, Math.round(1.2 / DT));
  assert.equal(m.party.stats.banter, 1, 'one pair at 25 s');
  assert.equal(m.party.talk?.key, 'banter.mochi.1');
  assert.ok(c.bubble.on, 'his line first');
  step(ctx, Math.round(BANTER_RULE.lineDur / DT) + 2);
  assert.ok(m.party.clemBubble?.on && !c.bubble.on, 'then her reply, one bubble at a time');
  step(ctx, Math.round(10 / DT));
  assert.equal(m.party.stats.banter, 1, 'exactly one pair');
  assert.deepEqual(banterLines('banter.sage.1').map((l) => l[0]), ['c', 'clem', 'c']);
  // the clock: an alert within 20 m resets it; each pair once per level
  const clock = new BanterClock();
  for (let i = 0; i < 30 / 0.1; i++) clock.tick(0.1, { id: 'sage', alertNear: i === 200, barkReady: true });
  assert.equal(clock.used.size, 0, 'an alert at 20 s reset the calm timer');
  let fired = 0;
  for (let i = 0; i < 200 / 0.1; i++) if (clock.tick(0.1, { id: 'sage', alertNear: false, barkReady: true })) fired++;
  assert.equal(fired, BANTER.sage.length, 'each pair once per level');
  clock.reset(); assert.equal(clock.used.size, 0);
});

test('companions.W5: rescue reunion: runs ≤ 1.5 m to her, nose-boop + heart, hop ×1.2, sparkle trail; payload has position', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const k = m.spawnKitten('button', new THREE.Vector3(0, 0, 4), null, {});
  ctx.player.pos.set(0, 0, 2.5);
  step(ctx, 2);
  assert.ok(k.rescued);
  const ev = emitted(ctx, E.KITTEN_RESCUED).at(-1);
  assert.ok(ev.position?.isVector3, 'payload has position');
  assert.equal(k.stateName, 'reunion');
  const from = k.pos.clone();
  ctx.fx.bursts.length = 0;
  step(ctx, Math.round((REUNION.maxRun + REUNION.boop + 0.2) / DT));
  assert.ok(k.pos.distanceTo(from) <= REUNION.run + 0.05, 'ran at most 1.5 m');
  assert.ok(ctx.fx.bursts.includes('heart'), 'nose-boop heart');
  assert.ok(k.stateName === 'rescued' || k.stateName === 'leaving');
  step(ctx, Math.round(REUNION.trailDur / DT) + 2);
  assert.ok(ctx.fx.bursts.filter((b) => b === 'sparkle').length >= REUNION.trailN, 'the sparkle trail home');
  assert.equal(REUNION.squash, 1.2);
});

test('AUTOCAM §13 companions 2 + §8.5: an aimed ability shares its reach in player.aim; Volley skips off-screen foes', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  ctx.player.aim = { active: false, dir: { x: 0, z: 1 }, range: 2, source: 'facing' };
  const [sage] = m.setActive(['sage']);
  assert.ok(m.aimAbility({ point: { x: 3, y: 0, z: 3 } }));
  assert.equal(ctx.player.aim.range, COMPANIONS.sage.range, 'Volley range for the aim pan');
  m.cancelAbilityAim();
  const near = new FakeEnemy(ctx, 2, 2, { alerted: true }), far = new FakeEnemy(ctx, 9, 2, { alerted: true });
  ctx.enemies.list = [near, far];
  ctx.cam.onScreen = (p) => p.x < 5;
  const plan = planAbility(ctx, sage, null);
  assert.deepEqual(plan.targets, [near], 'no off-screen snipes');
  delete ctx.cam.onScreen;
  assert.equal(planAbility(ctx, sage, null).targets.length, 2);
});

test('K6 (§7.3): no MeshStandardMaterial under any companion-built root; lit props share the one sc-toon kit program', async () => {
  const ctx = makeCtx(); await ctx.companions.init();
  const m = ctx.companions;
  const roots = [buildRopePost(), buildRope(new THREE.Vector3(), new THREE.Vector3(0, 2, 0)), buildFishingStick(), buildCup(), buildTable(), buildButterfly('#FF9EC0'),
    ...['carry', 'cart', 'hanging', 'kennel'].map((style) => buildCarrier({ style }))];
  // in-play actors: Clover's carrier, Sage's hanging carrier + rope posts, a hub kitten, Pudding's net, Sage's arrow
  m.spawnKitten('clover', new THREE.Vector3(10, 0, 14), 'cage', { cage: 'stocks', needClear: 'square', interact: true });
  m.spawnKitten('sage', new THREE.Vector3(18, 0, -8), 'cage', { hang: 4, ropes: TREETOP_ROPES, facing: Math.PI });
  const pud = m.spawnNpc('pudding', new THREE.Vector3(2, 0, 24), Math.PI);
  pud._buildNet();
  const arrow = new Arrow(ctx, m.active[0] ?? pud, pud, { id: 'companion_arrow', dmg: 1 }, new THREE.Vector3(0, 1, 0));
  roots.push(ctx.scene, arrow.mesh);
  const kit = new Set();
  for (const r of roots) r.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const mat of mats) {
      assert.ok(!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial && !mat.isMeshPhongMaterial, `${o.name || o.type}: ${mat.type} (K6: actors use sc-toon)`);
      if (mat.userData?.toon && o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh) {
        kit.add(mat.customProgramCacheKey());
        if (mat.vertexColors) assert.ok(o.geometry.attributes.color && o.geometry.attributes.rmse, `${o.name || o.type}: colour + rmse baked`);
      }
    }
  });
  for (const r of roots.slice(0, 6)) { r.traverse((o) => { if (o.isMesh && !o.material.isMeshBasicMaterial) assert.ok(o.material.userData.toon, `${o.name}: toon`); }); disposeDressing(r); }
  assert.ok(kit.size >= 1);
  // the arrow is one merged draw, no metal (WA20), and the net / arrows add no Standard program variant
  assert.equal(arrow.mesh.children.length, 1);
  const rm = arrow.mesh.children[0].geometry.attributes.rmse;
  for (let i = 0; i < rm.count; i++) assert.equal(rm.getY(i), 0, 'wooden tip: no metal');
  arrow.dispose();
  m.dispose();
});
