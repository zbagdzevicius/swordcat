// tests/unit/combat.warm.test.js  (owner: combat) — Phase W (WA §3.4 glyphs / telegraph:first, §5.1 final blow),
// AUTOCAM §15 combat 1–2 (holdersInto, guaranteed telegraph fields + lane ends) and PERF B1 / B2 (alloc-free assist,
// projectile shadows / blobs).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fakeCtx } from './_fakeCtx.mjs';
import { Actor } from '../../src/core/Actor.js';
import { E } from '../../src/core/events.js';
import { ATTACKS, JUICE, TELEGRAPH } from '../../src/core/config.js';
import { Combat, isFinalBlow, willSplit, TELE_SEEN_FLAG } from '../../src/combat/Combat.js';
import { AttackTokens } from '../../src/combat/AttackTokens.js';
import { normalizeTelegraph, telegraphLaneEnd, glyphFor } from '../../src/combat/targeting.js';
import { wantsBlob } from '../../src/combat/Projectiles.js';

function setup(state) {
  const ctx = fakeCtx({ systems: false, state });
  ctx.combat = new Combat(ctx);
  const events = [];
  const emit = ctx.bus.emit.bind(ctx.bus);
  ctx.bus.emit = (type, payload) => { events.push({ type, payload }); return emit(type, payload); };
  ctx.input.rumble = () => {};
  return { ctx, combat: ctx.combat, events, of: (t) => events.filter((e) => e.type === t).map((e) => e.payload) };
}

function mk(ctx, faction, x, z, { hp = 30, radius = 0.3 } = {}) {
  const a = new Actor(ctx, { faction, radius, height: 1, maxHp: hp, mass: 1, maxPoise: 2 });
  a.pos.set(x, 0, z); a.facing = 0; a.onGround = true;
  ctx.actors.register(a);
  return a;
}

test('combat.W1: every telegraph carries its glyph; two red attacks → one telegraph:first (once per save)', async () => {
  const { ctx, combat, of } = setup();
  await combat.init();
  const r1 = mk(ctx, 'enemy', 0, 2), r2 = mk(ctx, 'enemy', 2, 0);
  // a listener that subscribed BEFORE combat (ui / audio init first) already sees the filled payload (bus tap)
  const early = setup(), seen = [];
  early.ctx.bus.on(E.TELEGRAPH, (p) => seen.push(p.glyph));
  await early.combat.init();
  early.ctx.bus.emit(E.TELEGRAPH, { id: 50, actor: null, kind: 'aoe', shape: 'circle', duration: 0.5 });
  assert.deepEqual(seen, ['dots6']);
  let id = 100;
  for (const kind of Object.keys(TELEGRAPH.glyph)) {
    const p = { id: id++, actor: r1, kind, shape: 'cone', duration: 0.5 };
    ctx.bus.emit(E.TELEGRAPH, p);
    assert.equal(p.glyph, TELEGRAPH.glyph[kind], `glyph on ${kind}`);
  }
  assert.equal(glyphFor('jeer'), null, 'jeer has no glyph');
  assert.equal(of(E.TELEGRAPH_FIRST).length, Object.keys(TELEGRAPH.glyph).length, 'one first sighting per kind');
  ctx.bus.emit(E.TELEGRAPH, { id: 201, actor: r1, kind: 'red', duration: 0.6 });
  ctx.bus.emit(E.TELEGRAPH, { id: 202, actor: r2, kind: 'red', duration: 0.6 });
  assert.equal(of(E.TELEGRAPH_FIRST).filter((p) => p.kind === 'red').length, 1, 'two red attacks → one telegraph:first');
  assert.equal(ctx.state.getFlag(TELE_SEEN_FLAG + 'red'), true, 'recorded in the save flags');
  // same save (flag set): nothing; cutscene: never; jeer: never
  const b = setup();
  b.ctx.state.setFlag(TELE_SEEN_FLAG + 'gold', true);
  await b.combat.init();
  b.ctx.bus.emit(E.TELEGRAPH, { id: 1, actor: null, kind: 'gold', duration: 0.5 });
  b.ctx.bus.emit(E.TELEGRAPH, { id: 2, actor: null, kind: 'jeer', duration: 0.5 });
  b.ctx.game.mode = 'cutscene';
  b.ctx.bus.emit(E.TELEGRAPH, { id: 3, actor: null, kind: 'aoe', duration: 0.5 });
  assert.equal(b.of(E.TELEGRAPH_FIRST).length, 0);
  b.ctx.game.mode = 'play';
  b.ctx.bus.emit(E.TELEGRAPH, { id: 4, actor: null, kind: 'aoe', duration: 0.5 });
  assert.deepEqual(b.of(E.TELEGRAPH_FIRST), [{ kind: 'aoe' }]);
  combat.dispose(); early.combat.dispose(); b.combat.dispose();
  assert.equal(b.ctx.bus.count(E.TELEGRAPH), 0, 'dispose unsubscribes');
});

test('§7.1 telegraph contract: targetsPlayer / activeAt / windup guaranteed, lane end for lane / line, emitter values kept', async () => {
  const now = 3;
  const p = normalizeTelegraph({ id: 1, kind: 'aoe', shape: 'circle', duration: 0.7 }, now);
  assert.equal(p.windup, 0.7); assert.ok(Math.abs(p.activeAt - 3.7) < 1e-9); assert.equal(p.targetsPlayer, true);
  assert.equal(p.end, undefined, 'no end for a disc');
  const kept = normalizeTelegraph({ kind: 'red', windup: 0.2, activeAt: 9, targetsPlayer: false, glyph: 'custom', duration: 1 }, now);
  assert.deepEqual([kept.windup, kept.activeAt, kept.targetsPlayer, kept.glyph], [0.2, 9, false, 'custom']);
  const lane = normalizeTelegraph({ kind: 'aoe', shape: 'lane', pos: { x: 1, y: 0.5, z: 0 }, dir: { x: 0, y: 0, z: 2 }, size: [1.2, 6], duration: 1 }, now);
  assert.deepEqual(lane.end, { x: 1, y: 0.5, z: 6 }, 'lane: pos + unit dir × size[1]');
  const line = normalizeTelegraph({ kind: 'aim', shape: 'line', pos: { x: 0, y: 0, z: 0 }, dir: { x: 3, z: 4 }, size: 10 }, now);
  assert.ok(Math.abs(line.end.x - 6) < 1e-9 && Math.abs(line.end.z - 8) < 1e-9);
  assert.equal(telegraphLaneEnd({ shape: 'lane', pos: { x: 0, z: 0 }, dir: { x: 0, z: 0 }, l: 4 }), null, 'degenerate dir');
  assert.deepEqual(telegraphLaneEnd({ shape: 'cone', lane: { l: 2, dir: { x: 1, z: 0 } }, pos: { x: 0, y: 0, z: 0 }, dir: { x: 0, z: 1 } }),
    { x: 2, y: 0, z: 0 }, 'a lane object wins');
  // through the bus: targetsPlayer from the attacker's target, activeAt from the def's active[0]
  const { ctx, combat } = setup();
  await combat.init();
  ctx.player = mk(ctx, 'player', 0, 0);
  const rat = mk(ctx, 'enemy', 0, 2), pal = mk(ctx, 'ally', 3, 3);
  rat.target = pal;
  const q = { id: 7, actor: rat, kind: 'parry', duration: 0.5, attackId: 'rat_poke' };
  ctx.bus.emit(E.TELEGRAPH, q);
  assert.equal(q.targetsPlayer, false, 'aimed at a companion');
  assert.ok(Math.abs(q.activeAt - (0.5 + (ATTACKS.rat_poke.active?.[0] ?? 0))) < 1e-9);
  rat.target = ctx.player;
  const q2 = { id: 8, actor: rat, kind: 'red', duration: 0.5 };
  ctx.bus.emit(E.TELEGRAPH, q2);
  assert.equal(q2.targetsPlayer, true);
  assert.doesNotThrow(() => ctx.bus.emit(E.TELEGRAPH, null), 'malformed payloads never throw');
  combat.dispose();
});

test('combat.W2: final blow of an encounter → JUICE.finalBlow; two kills → one slow-mo', async () => {
  const { ctx, combat } = setup();
  await combat.init();
  const cat = mk(ctx, 'player', 0, 0, { hp: 8 });
  ctx.player = cat;
  const a = mk(ctx, 'enemy', 0, 1, { hp: 1 }), b = mk(ctx, 'enemy', 1, 0, { hp: 1 });
  a.alerted = b.alerted = true;
  ctx.enemies = { list: [a, b] };
  combat.applyHit(cat, a, ATTACKS.slash1);
  assert.equal(a.alive, false);
  assert.equal(ctx.game.slowMos.length, 0, 'another alerted foe still stands: no slow-mo');
  ctx.game.hitstopT = 0;
  b.invulnT = 0;
  combat.applyHit(cat, b, ATTACKS.slash1);
  assert.equal(b.alive, false);
  assert.deepEqual(ctx.game.slowMos, [[JUICE.finalBlow.timeScale, JUICE.finalBlow.slowMo]], 'exactly one slow-mo');
  assert.equal(combat.stats.finalBlows, 1);
  assert.ok(ctx.game.hitstopT >= JUICE.kill.hitstopAdd + JUICE.finalBlow.hitstopAdd - 1e-9, 'hitstop gains finalBlow.hitstopAdd');
  // the pure rule
  const me = { faction: 'player', pos: { x: 0, z: 0 } };
  const v = { faction: 'enemy', alerted: true, pos: { x: 0, z: 1 } };
  assert.equal(isFinalBlow(me, { ...v, alerted: false }, []), false, 'an unalerted victim is no encounter');
  assert.equal(isFinalBlow({ faction: 'enemy', pos: v.pos }, v, []), false, 'only her side');
  assert.equal(isFinalBlow(me, { faction: 'enemy', tags: new Set(['boss']), pos: v.pos }, []), true, 'a boss always counts');
  assert.equal(isFinalBlow(me, v, [{ alive: true, alerted: true, pos: { x: 100, z: 0 } }]), true, 'a far fight is another encounter');
  assert.equal(isFinalBlow(me, v, [{ alive: true, alerted: true, stateName: 'die', pos: { x: 1, z: 0 } }]), true, 'a dying foe is done');
  assert.equal(isFinalBlow(me, v, [{ alive: true, alerted: true, pos: { x: 1, z: 0 } }]), false);
  assert.equal(isFinalBlow(me, { faction: 'enemy', breakable: true, alerted: true }, []), false, 'breakables never');
  combat.dispose();
});

test('combat.W2: no final blow while a jelly splits or an arena has waves to come', async () => {
  const me = { faction: 'player', pos: { x: 0, z: 0 } };
  const jelly = (type) => ({ faction: 'enemy', type, alive: true, alerted: true, pos: { x: 0, z: 1 } });
  // jelly splits: L / M / GIANT split, S and popsSlime kills don't
  for (const t of ['jelly_l', 'jelly_m', 'jelly_giant', 'jelly']) {
    const v = jelly(t);
    assert.equal(willSplit(v, ATTACKS.slash1, [v]), true, `${t} splits`);
    assert.equal(isFinalBlow(me, v, [v], null, ATTACKS.slash1), false, `${t}: children pop out, no slow-mo`);
  }
  const s = jelly('jelly_s');
  assert.equal(isFinalBlow(me, s, [s], null, ATTACKS.slash1), true, 'the last S jelly ends it');
  const l = jelly('jelly_l');
  assert.equal(isFinalBlow(me, l, [l], null, { popsSlime: true }), true, 'a popsSlime kill pops it whole');
  // at the jelly cap no children spawn → the kill is final
  const full = Array.from({ length: 13 }, () => ({ type: 'jelly_s', alive: true, alerted: false })); // 12 others + l
  full[0] = l;
  assert.equal(willSplit(l, ATTACKS.slash1, full), false, 'cap reached: no split');
  assert.equal(isFinalBlow(me, { faction: 'enemy', type: 'rat', alerted: true, pos: l.pos }, [], null, ATTACKS.slash1), true);
  // arena waves
  const v = { faction: 'enemy', alerted: true, pos: { x: 0, z: 1 } };
  const arena = { locked: true, cleared: false, wave: 1, waves: [[], [], []] };
  assert.equal(isFinalBlow(me, v, [], null, null, [arena]), false, 'wave 1 of 3: more to come');
  arena.wave = 3;
  assert.equal(isFinalBlow(me, v, [], null, null, [arena]), true, 'last wave: the encounter ends');
  assert.equal(isFinalBlow(me, v, [], null, null, [{ locked: false, wave: 0, waves: [[]] }]), true, 'unlocked arena ignored');
  assert.equal(isFinalBlow(me, v, [], null, null, [{ locked: true, wave: 0, waves: [] }]), true, 'boss arena (no waves)');

  // wired through applyHit: ctx.levels.current.arenas + a splitting jelly
  const { ctx, combat } = setup();
  await combat.init();
  const cat = mk(ctx, 'player', 0, 0, { hp: 8 });
  ctx.player = cat;
  const a = mk(ctx, 'enemy', 0, 1, { hp: 1 });
  a.alerted = true;
  ctx.enemies = { list: [a] };
  ctx.levels = { current: { arenas: [{ locked: true, cleared: false, wave: 1, waves: [[], []] }] } };
  combat.applyHit(cat, a, ATTACKS.slash1);
  assert.equal(a.alive, false);
  assert.equal(ctx.game.slowMos.length, 0, 'last foe of a non-final wave: no slow-mo');
  ctx.levels = null; ctx.game.hitstopT = 0;
  const j = mk(ctx, 'enemy', 1, 0, { hp: 1 });
  j.type = 'jelly_l'; j.alerted = true;
  ctx.enemies = { list: [j] };
  combat.applyHit(cat, j, ATTACKS.slash1);
  assert.equal(j.alive, false);
  assert.equal(ctx.game.slowMos.length, 0, 'a splitting jelly: no slow-mo');
  assert.equal(combat.stats.finalBlows, 0);
  combat.dispose();
});

test('AUTOCAM §15 combat 1: tokens.holdersInto fills (and clears) an array of live holders', () => {
  const t = new AttackTokens(() => [2, 1]);
  const a = { id: 1, alive: true }, b = { id: 2, alive: true }, c = { id: 3, alive: true };
  t.acquire(a); t.acquire(b); t.acquire(c, 'ranged');
  const out = [{ stale: true }];
  assert.equal(t.holdersInto('melee', out), out);
  assert.deepEqual(out.map((x) => x.id).sort(), [1, 2]);
  assert.deepEqual(t.holdersInto('ranged', out).map((x) => x.id), [3]);
  b.alive = false;
  assert.deepEqual(t.holdersInto('melee', out).map((x) => x.id), [1], 'dead holders are not listed');
  t.prune((x) => x.alive !== false);
  assert.equal(t.count('melee'), 1, 'prune (forEach path) still drops dead holders');
  t.release(a); t.release(c);
  assert.equal(t.holdersInto('melee', out).length, 0);
});

test('PERF B1: assistTarget / pickAssist reuse their option bag and breakdown rows (no per-call objects)', async () => {
  const { ctx, combat } = setup();
  await combat.init();
  const cat = mk(ctx, 'player', 0, 0);
  const e1 = mk(ctx, 'enemy', 0, 2), e2 = mk(ctx, 'enemy', 1, 2.5);
  const out = {};
  assert.equal(combat.assistTarget(cat, 4, Math.PI, out), e1);
  const rows = out.list.slice(), terms = out.terms, bag = combat._assistOpts;
  assert.equal(rows.length, 2);
  assert.equal(combat.assistTarget(cat, 4, Math.PI, out), e1);
  assert.equal(out.list[0], rows[0], 'rows pooled'); assert.equal(out.terms, terms, 'terms pooled');
  assert.equal(combat._assistOpts, bag);
  assert.equal(bag.prev, null, 'no actor refs kept in the bag');
  e2.alive = false;
  combat.assistTarget(cat, 4, Math.PI, out);
  assert.equal(out.list.length, 1);
  assert.equal(out._pool[1].actor, null, 'unused pooled rows drop their actor');
  assert.equal(combat.assistTarget(cat, 4, Math.PI, e1), e1, 'legacy prefer still works');
  // ThreatBook: dense entries mirror the map through add / end / prune
  ctx.bus.emit(E.TELEGRAPH, { id: 9, actor: e1, kind: 'parry', duration: 0.5, targetsPlayer: true });
  assert.equal(combat.threats.entries.length, 1); assert.ok(combat.threats.windingUp(e1));
  ctx.bus.emit(E.TELEGRAPH_END, { id: 9 });
  assert.equal(combat.threats.entries.length, 0); assert.equal(combat.threats.live.size, 0);
  combat.dispose();
});

test('PERF B2: projectiles never cast shadows; only large round ones register an fx blob, released on recycle', async () => {
  const { ctx, combat } = setup();
  const reg = new Map();
  ctx.fx = { blobs: { add: (o, r) => reg.set(o, r), remove: (o) => reg.delete(o) } };
  await combat.init();
  const rat = mk(ctx, 'enemy', 0, 6);
  const at = () => new THREE.Vector3(0, 0.5, 6), fwd = () => new THREE.Vector3(0, 0, -1);
  const bolt = combat.spawnProjectile('rat_bolt', rat, at(), fwd());
  const orb = combat.spawnProjectile('bone_bolt', rat, at(), fwd());
  const web = combat.spawnProjectile('spider_web', rat, at(), fwd());
  assert.equal(wantsBlob(bolt), false); assert.equal(wantsBlob(orb), true); assert.equal(wantsBlob(web), true);
  assert.equal(reg.size, 2);
  assert.ok(reg.has(orb.visual.group) && !reg.has(bolt.visual.group));
  for (const p of [bolt, orb, web]) p.visual.group.traverse((o) => assert.equal(o.castShadow, false));
  assert.equal(wantsBlob({ wave: true, r: 0.35, kind: 'wave' }), false, 'waves hug the ground: no blob');
  combat.projectiles.clear();
  assert.equal(reg.size, 0, 'recycled visuals drop their blob');
  for (const v of combat.projectiles._allVisuals) {
    v.group.traverse((o) => { if (o.material) assert.notEqual(o.material.type, 'MeshStandardMaterial', 'no Standard program'); });
  }
  combat.dispose();
});
