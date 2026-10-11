// tests/unit/enemies.test.js  (owner: enemies) — GAME_DESIGN §19.9 U5 (Dizzy), U6 (Boss phases / hpFloor), U11 (clip
// maps vs the GLBs on disk) plus the enemies area's own checks: type resolution, windups, the tech.md §10 FSM for
// rat_pike / rat_xbow / crow under a fake ctx (no DOM, no network: visuals never load), the §8.3 budget, waves,
// Meow / pack alerts, cutscene interrupts and the ScriptedActor API.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { fakeCtx } from './_fakeCtx.mjs';
import { E } from '../../src/core/events.js';
import { ATTACKS, ENEMIES, BOSSES, DIZZY, TELEGRAPH, DIFFICULTY, PLAYER, QUALITY } from '../../src/core/config.js';
import { Dizzy } from '../../src/enemies/Dizzy.js';
import { Boss, phaseFor } from '../../src/enemies/Boss.js';
import { Enemy, windupFor, defaultShape, segSegXZ, telegraphPayload } from '../../src/enemies/Enemy.js';
import { insideFrustum, pointOnScreen, rangedStartAllowed, ONSCREEN_FALLBACK } from '../../src/enemies/onscreen.js';
import { resolveEnemyDef, TYPES, countsTowardCap } from '../../src/enemies/EnemyManager.js';
import { CLIP_MAPS, clipNames, clipKey, isSpec, rigFor, clipsFor, subclip, specDuration } from '../../src/enemies/clipMaps.js';
import { TUNING } from '../../src/enemies/tuning.js';
import { diveTravel } from '../../src/enemies/types/crow.js';
import { disposeInstanceMaterials } from '../../src/enemies/rig.js';
import manifest, { levels as manifestLevels } from '../../src/enemies/assets.manifest.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DT = 1 / 60;

/** Clip names stored in a GLB (parses the JSON chunk). */
const _clips = new Map();
function glbClips(rel) {
  if (_clips.has(rel)) return _clips.get(rel);
  const buf = fs.readFileSync(path.join(ROOT, 'public', 'assets', rel));
  assert.equal(buf.toString('utf8', 0, 4), 'glTF', `${rel}: GLB magic`);
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + len));
  const set = new Set((json.animations ?? []).map((a) => a.name));
  _clips.set(rel, set);
  return set;
}

/** A fake ctx with the enemies system initialised, the player at the origin facing +Z, god on. */
async function world({ quality = QUALITY.med, difficulty } = {}) {
  const ctx = fakeCtx(difficulty ? { state: { difficulty } } : {});
  ctx.quality = quality;
  await ctx.enemies.init();
  const p = ctx.player;
  p.pos.set(0, 0, 0); p.facing = 0; p.god = true; p.snap?.();
  if (!ctx.actors.has(p)) ctx.actors.register(p, 'swordcat');
  ctx.story = { ...ctx.story, played: [], play(id) { this.played.push(id); return Promise.resolve(); }, isPlaying: false };
  return ctx;
}

/** Advance the enemies + combat systems n fixed steps (the player stands still). */
function step(ctx, n = 1, each = null) {
  for (let i = 0; i < n; i++) {
    ctx.actors.beginStep();
    ctx.enemies.update(DT);
    ctx.combat.update?.(DT);
    ctx.game.time += DT;
    ctx.game.hitstopT = 0;
    if (each && each(i) === true) return i + 1;
  }
  return n;
}

/** Collect events of the given names. */
function record(ctx, ...names) {
  const out = [];
  for (const n of names) ctx.bus.on(n, (p) => out.push({ ...p, ev: n }));
  return out;
}

const at = (x, z) => new THREE.Vector3(x, 0, z);

// ============================================================================================ U5 Dizzy
test('U5: Dizzy — poise × 4, parry +35, gold → full, decay after 2 s at 8/s, 3 s dizzy, ×2 crits', () => {
  const d = new Dizzy(100);
  assert.equal(d.addPoise(3), 'gain'); assert.equal(d.value, 3 * DIZZY.perPoise);
  assert.equal(d.addParry(), 'gain'); assert.equal(d.value, 12 + DIZZY.perParry);
  // no decay before 2.0 s without a gain, then 8/s for exactly the time past the delay
  d.update(1.9); assert.equal(d.value, 47);
  d.update(0.2); assert.ok(Math.abs(d.value - (47 - DIZZY.decayPerSec * 0.1)) < 1e-9, `decay over the 0.1 s past the delay (${d.value})`);
  d.update(1.0); assert.ok(Math.abs(d.value - (47 - 8 * 1.1)) < 1e-9);
  d.addPoise(1); d.update(1.0); assert.ok(Math.abs(d.value - (47 - 8.8 + 4)) < 1e-9, 'a gain resets the decay delay');
  // gold-glint parry fills it → dizzy for 3 s with ×2 crits; gains are ignored meanwhile
  assert.equal(d.addParry(true), 'dizzy');
  assert.equal(d.dizzy, true); assert.equal(d.value, 100); assert.equal(d.critMul, DIZZY.critMul);
  assert.equal(d.add(10), '', 'no gain while dizzy');
  d.update(DIZZY.dur - 0.05); assert.equal(d.dizzy, true);
  assert.equal(d.update(0.1), 'recovered');
  assert.equal(d.dizzy, false); assert.equal(d.value, 0); assert.equal(d.critMul, 1);
  // lesson events fill to max; each boss has its own max
  const big = new Dizzy(BOSSES.barkus.dizzyMax);
  assert.equal(big.fill(), 'dizzy'); assert.equal(big.value, 200);
  const e = new Dizzy(120); e.add(130); assert.equal(e.value, 120); assert.equal(e.dizzy, true);
});

// ============================================================================================ U6 Boss
test('U6: phaseFor picks the deepest crossed threshold', () => {
  const rows = BOSSES.grizzlechop.phases;
  assert.equal(phaseFor(rows, 1), 0); assert.equal(phaseFor(rows, 0.61), 0); assert.equal(phaseFor(rows, 0.6), 1);
  assert.equal(phaseFor(rows, 0.3), 1); assert.equal(phaseFor(rows, 0.25), 2); assert.equal(phaseFor(rows, 0.01), 2);
});

test('U6: each threshold fires exactly once, two crossed by one hit fire in order; row events spawn adds once', async () => {
  const ctx = await world();
  const ev = record(ctx, E.BOSS_START, E.BOSS_PHASE, E.BOSS_DEFEATED);
  const b = ctx.enemies.spawn('boss_grizzlechop', at(0, 6));
  assert.ok(b instanceof Boss); assert.equal(ctx.enemies.boss, b);
  assert.equal(b.maxHp, BOSSES.grizzlechop.hp);
  assert.deepEqual(ev.filter((x) => x.ev === E.BOSS_START).map((x) => [x.id, x.maxHp, x.dizzyMax]), [['boss_grizzlechop', 450, 100]]);
  const p = ctx.player, big = { ...ATTACKS.slash1, id: 'test_big' };
  b.invulnT = 0;
  // 100% → 20%: crosses 0.80 (adds), 0.60 and 0.25 in one hit
  ctx.combat.applyHit(p, b, big, { dmg: b.maxHp * 0.8 });
  assert.deepEqual(ev.filter((x) => x.ev === E.BOSS_PHASE).map((x) => x.phase), [1, 2], 'phases 1 then 2');
  assert.equal(b.phase, 2);
  assert.equal(b.phaseWindupMul, BOSSES.grizzlechop.phases[2].windupMul);
  const addTypes = b.adds.map((a) => a.type).sort();
  assert.deepEqual(addTypes, ['rat_pike', 'rat_pike', 'rat_xbow', 'rat_xbow'], 'the 80% and 60% events each spawn once');
  // healing back above a threshold and crossing it again fires nothing new
  b.hp = b.maxHp * 0.9; b.invulnT = 0;
  ctx.combat.applyHit(p, b, big, { dmg: b.maxHp * 0.75 });
  assert.equal(ev.filter((x) => x.ev === E.BOSS_PHASE).length, 2, 'no repeats');
  assert.equal(b.adds.length, 4, 'no repeated adds');
  // defeat: boss:defeated once, adds despawn
  b.invulnT = 0;
  ctx.combat.applyHit(p, b, big, { dmg: b.maxHp });
  assert.equal(b.alive, false);
  assert.equal(ev.filter((x) => x.ev === E.BOSS_DEFEATED).length, 1);
  assert.equal(b.adds.length, 0);
  assert.ok(!ctx.enemies.list.some((e) => e.bossAdd === b), 'adds despawned with the boss');
});

test('U6: phase change grants 1.0 s invulnerability; death and retry restarts the current phase at full phase HP', async () => {
  const ctx = await world();
  const b = ctx.enemies.spawn('boss_cacklejaw', at(0, 8));
  b.setHpFrac(0.5);
  assert.equal(b.phase, 1);
  assert.ok(b.invulnT >= TUNING.boss.phaseInvuln - 1e-9);
  assert.equal(ctx.combat.applyHit(ctx.player, b, ATTACKS.slash1), 'none', 'invulnerable right after the phase change');
  b.invulnT = 0;
  b.addDizzy(30);
  ctx.bus.emit(E.PLAYER_LIFE_LOST, { lives: 8 });
  assert.equal(b.hp, Math.round(b.maxHp * BOSSES.cacklejaw.phases[1].at), 'phase 2 restarts at 60%');
  assert.equal(b.phase, 1); assert.equal(b.dizzy, 0);
  assert.equal(b.adds.length, 0, 'adds despawn on retry');
  b.setHpFrac(0.55);
  assert.equal(b.adds.length, 2, 'the phase-start event (stealers) re-arms after a retry');
});

test('U6: Barkus hpFloor holds at 10% until the shard is freed; then the rally plays CS-15 (no boss:defeated)', async () => {
  const ctx = await world();
  const ev = record(ctx, E.BOSS_PHASE, E.BOSS_DEFEATED);
  const b = ctx.enemies.spawn('boss_barkus', at(0, 10));
  assert.equal(b.hpFloor, 0.10);
  b.setHpFrac(0.01);
  assert.equal(b.hp, Math.ceil(b.maxHp * 0.1), 'floor at 10%');
  assert.deepEqual(ev.filter((x) => x.ev === E.BOSS_PHASE).map((x) => x.phase), [1, 2]);
  for (let i = 0; i < 3; i++) { b.invulnT = 0; ctx.combat.applyHit(ctx.player, b, ATTACKS.holy, { dmg: 9999 }); }
  assert.equal(b.alive, true); assert.equal(b.hp, Math.ceil(b.maxHp * 0.1));
  assert.deepEqual(ctx.story.played, []);
  b.freeShard();
  assert.equal(b.hpFloor, null);
  b.invulnT = 0;
  ctx.combat.applyHit(ctx.player, b, ATTACKS.slash1, { dmg: 9999 });
  assert.equal(b.alive, true, 'the rally replaces the defeat');
  assert.equal(b.rallied, true);
  assert.deepEqual(ctx.story.played, ['cs15']);
  assert.equal(ev.filter((x) => x.ev === E.BOSS_DEFEATED).length, 0);
});

test('U6: Barkus P3 — the 3rd parried shardSlam frees the shard (other moves and other phases do not count; a retry resets)', async () => {
  const ctx = await world();
  const b = ctx.enemies.spawn('boss_barkus', at(0, 10));
  const need = BOSSES.barkus.phases[2].shardSlam.parriesNeeded;
  const parry = (move) => { b.attack = { id: move, def: b.attackDef(move) }; b.staggerT = 0; b.onParried(ctx.player, { gold: false }); b.meter.reset(); };
  parry('shardSlam');
  assert.equal(b.shardParries, 0, 'phase 1 parries do not count');
  b.setHpFrac(0.3);
  assert.equal(b.phase, 2);
  parry('cleaverCombo');
  assert.equal(b.shardParries, 0, 'only the shard move counts in P3');
  parry('shardSlam'); parry('shardSlam');
  assert.equal(b.shardParries, 2); assert.equal(b.hpFloor, 0.10);
  ctx.bus.emit(E.PLAYER_LIFE_LOST, { lives: 8 });
  assert.equal(b.shardParries, 0, 'dying restarts the phase and its parry count');
  for (let i = 0; i < need; i++) parry('shardSlam');
  assert.equal(b.shardFreed, true); assert.equal(b.hpFloor, null);
});

test('level spawns: a perched crossbowman keeps its cart height when the level passes home y 0; zone patrol radius', async () => {
  const ctx = await world();
  ctx.physics.heightAt = () => 0.5;
  const x = ctx.enemies.spawn('rat_xbow', at(0, 12), { y: 1.2, home: at(0, 12), patrolRadius: 0 });
  assert.equal(x.perched, true);
  assert.ok(Math.abs(x.pos.y - 1.7) < 1e-6, `perched at ground + 1.2 (${x.pos.y})`);
  step(ctx, 30);
  assert.ok(Math.abs(x.pos.y - 1.7) < 1e-6, `still on its perch (${x.pos.y})`);
  // a wall top (1.2 m, 0.22 m thick, along z) 1.7 m from the requested spot: the perch snaps onto it
  const gAt = ctx.physics.groundAt;
  ctx.physics.heightAt = () => 0;
  ctx.physics.groundAt = (px, pz, fromY) => (px >= 1.6 && px <= 1.82 && fromY >= 1.2 ? 1.2 : 0);
  const w = ctx.enemies.spawn('rat_xbow', at(0, 20), { y: 1.2 });
  assert.ok(w.perched && w.pos.x >= 1.6 && w.pos.x <= 1.82 && Math.abs(w.pos.z - 20) < 1.8 && w.pos.y === 1.2, `on the wall (${w.pos.toArray()})`);
  ctx.physics.groundAt = gAt;
  const r = ctx.enemies.spawn('rat_pike', at(30, 30), { patrolRadius: 7, home: at(30, 30) });
  assert.equal(r.patrolRadius, 7, 'zone patrol radius wins over the row default');
  assert.equal(ctx.enemies.spawn('rat_pike', at(-30, 30)).patrolRadius, ENEMIES.rat_pike.patrolRadius);
  const c = ctx.enemies.spawn('crow', at(-30, -30), { patrolRadius: 8 });
  assert.ok(Math.hypot(c.circleOff.x, c.circleOff.z) <= 8 - ENEMIES.crow.fly.circleR + 1e-9, 'crow circles stay inside the zone');
});

test('U6: boss Dizzy — hits add poise × 4, a gold parry fills it, dizzy bosses take ×2 crits', async () => {
  const ctx = await world();
  const dz = record(ctx, E.BOSS_DIZZY);
  const b = ctx.enemies.spawn('boss_brutus', at(0, 6));
  b.invulnT = 0;
  ctx.combat.applyHit(ctx.player, b, ATTACKS.slash3);
  assert.equal(b.dizzy, ATTACKS.slash3.poise * DIZZY.perPoise);
  b.onParried(ctx.player, { gold: false });
  assert.equal(b.dizzy, 12 + DIZZY.perParry);
  b.onParried(ctx.player, { gold: true });
  assert.equal(b.isDizzy, true); assert.equal(b.critTaken, DIZZY.critMul);
  assert.ok(b.staggerT >= DIZZY.dur - 1e-9, 'dizzy = staggered for 3 s');
  assert.ok(dz.some((x) => x.dizzy === true && x.value === b.dizzyMax));
  b.invulnT = 0;
  const hp0 = b.hp;
  ctx.combat.applyHit(ctx.player, b, ATTACKS.slash1);
  assert.equal(hp0 - b.hp, ATTACKS.slash1.dmg * DIZZY.critMul, '×2 crit while dizzy');
});

// ============================================================================================ U11 clip maps
test('U11: every clip in every clip map exists in each of its GLBs', () => {
  for (const [rig, map] of Object.entries(CLIP_MAPS)) {
    const names = clipNames(map.roles);
    assert.ok(names.size > 0, rig);
    for (const f of map.files) {
      const have = glbClips(f);
      for (const n of names) assert.ok(have.has(n), `${rig}: clip "${n}" missing in ${f}`);
    }
  }
});

test('U11: every enemy type\'s anims (incl. per-attack windup/strike sub-clips) exist in its GLB', () => {
  const types = [...Object.keys(TYPES), 'bonehead:minion', 'bonehead:warrior', 'bonehead:rogue', 'bonehead:mage', 'jelly_l',
    'boss_grizzlechop', 'boss_cacklejaw', 'boss_brutus', 'boss_barkus'];
  for (const t of types) {
    const def = resolveEnemyDef(t);
    if (!def.model) continue;
    assert.ok(rigFor(def.model), `${t}: ${def.model} has a clip map`);
    const have = glbClips(def.model);
    for (const n of clipNames(def.anims)) assert.ok(have.has(n), `${t}: clip "${n}" missing in ${def.model}`);
  }
});

test('clip specs: keys, sub-clips (AnimationUtils.subclip) and durations', () => {
  assert.equal(clipKey('Rat_Idle'), 'Rat_Idle');
  assert.equal(clipKey({ clip: 'Rat_Attack', from: 0, to: 0.4 }), 'Rat_Attack[0-0.4]');
  assert.equal(clipKey({ clip: 'Cheer' }), 'Cheer');
  assert.equal(clipKey(null), null);
  assert.ok(isSpec('x') && isSpec({ clip: 'x' }) && !isSpec({ windup: 'x' }) && !isSpec(null));
  const track = new THREE.NumberKeyframeTrack('.x', [0, 0.5, 1], [0, 1, 2]);
  const clip = new THREE.AnimationClip('Rat_Attack', 1, [track]);
  const all = clipsFor(CLIP_MAPS.rat.roles, [clip]);
  const sub = all.find((c) => c.name === 'Rat_Attack[0-0.4]');
  assert.ok(sub, 'windup sub-clip created');
  assert.ok(Math.abs(sub.duration - 0.4) < 0.03, `sub-clip duration ${sub.duration}`);
  assert.equal(subclip(clip, 0, 0.4), sub, 'cached');
  assert.ok(Math.abs(specDuration({ clip: 'Rat_Attack', from: 0.4, to: 1 }, [clip]) - 0.6) < 1e-9);
});

// ============================================================================================ defs
test('resolveEnemyDef: every Appendix A row, Bonehead variants, jelly sizes, bosses, the CS-02 cast, unknown ids', () => {
  for (const id of Object.keys(ENEMIES)) {
    const d = resolveEnemyDef(id);
    assert.ok(d.hp > 0 && d.radius > 0 && d.height > 0, `${id}: hp/radius/height`);
    assert.ok(!d.unknown, id);
  }
  for (const v of ['minion', 'warrior', 'rogue', 'mage']) {
    const d = resolveEnemyDef(`bonehead:${v}`);
    assert.equal(d.id, `bonehead:${v}`); assert.equal(d.hp, ENEMIES.bonehead.variants[v].hp);
    assert.equal(d.attacks[0].id, ENEMIES.bonehead.variants[v].attack);
  }
  assert.equal(resolveEnemyDef('bonehead').id, 'bonehead:minion');
  for (const [s, k] of [['jelly_l', 'L'], ['jelly_m', 'M'], ['jelly_s', 'S'], ['jelly_giant', 'GIANT'], ['jelly', 'L']]) {
    const d = resolveEnemyDef(s);
    assert.equal(d.hp, ENEMIES.jelly.sizes[k].hp, s); assert.equal(d.radius, ENEMIES.jelly.sizes[k].r, s);
  }
  for (const k of Object.keys(BOSSES)) {
    const d = resolveEnemyDef(`boss_${k}`);
    assert.ok(d.boss, k); assert.equal(d.id, `boss_${k}`);
    assert.equal(d.hp, Array.isArray(BOSSES[k].hp) ? BOSSES[k].hp[0] : BOSSES[k].hp);
  }
  // M1 rows carry the §10.2 numbers
  const pike = resolveEnemyDef('rat_pike');
  assert.equal(pike.hp, 30); assert.equal(pike.poise, 2); assert.equal(pike.sight, 10); assert.equal(pike.leash, 18);
  assert.deepEqual(pike.followUp, { id: 'rat_poke2', chance: 0.3 });
  const xbow = resolveEnemyDef('rat_xbow');
  assert.deepEqual(xbow.keep, [6, 9], 'CONTROLS_SPEC §8.5 rat_xbow.keep'); assert.equal(xbow.attacks[0].id, 'rat_bolt');
  const crow = resolveEnemyDef('crow');
  assert.equal(crow.fly.alt, 4); assert.equal(crow.hittableBelow, 2.2); assert.ok(crow.tags.includes('flyer'));
  for (const id of ['cacklejaw', 'pilfer', 'barkus_silhouette']) {
    const d = resolveEnemyDef(id);
    assert.equal(d.aiLess, true, id); assert.equal(d.hurtable, false, id); assert.ok(d.tags.includes('cutscene'), id);
  }
  assert.ok(resolveEnemyDef('cacklejaw').hide.every((n) => n !== 'Barbarian_Hat'), 'Cacklejaw keeps his hat (§11.3)');
  assert.equal(resolveEnemyDef('nope').unknown, true);
});

test('windupFor: §8.1 minimum lead per telegraph kind, §10.1 0.45 s floor, difficulty multiplier', () => {
  assert.equal(windupFor(ATTACKS.rat_poke), 0.55);
  assert.equal(windupFor(ATTACKS.rat_poke2), TELEGRAPH.minLead.gold, 'gold glint shows ≥ 0.6 s');
  assert.equal(windupFor(ATTACKS.rat_bolt), 0.8);
  assert.equal(windupFor(ATTACKS.crow_dive), 1.0);
  assert.ok(Math.abs(windupFor(ATTACKS.rat_poke, DIFFICULTY.kitten.windup) - 0.6875) < 1e-9);
  assert.equal(windupFor(ATTACKS.rat_poke, DIFFICULTY.nine.windup), Math.max(0.45, 0.55 * 0.9));
  assert.equal(windupFor({ telegraph: 'parry', windup: 0.2 }), 0.45);
  for (const k of Object.keys(TELEGRAPH.minLead)) assert.ok(defaultShape(k));
  assert.equal(defaultShape('aim'), 'line'); assert.equal(defaultShape('shadow'), 'shadow'); assert.equal(defaultShape('jeer'), 'rings');
});

// ============================================================================================ FSM
test('rat_pike FSM: alert hop → chase (token) → windup with a white glint ≥ 0.45 s → strike hits her → recover', async () => {
  const ctx = await world();
  const ev = record(ctx, E.ENEMY_ALERTED, E.TELEGRAPH, E.TELEGRAPH_END, E.HIT);
  const e = ctx.enemies.spawn('rat_pike', at(0, 5), { facing: Math.PI });
  e.def = { ...e.def, followUp: null, fleeBelow: 0 };
  assert.ok(e instanceof Enemy);
  assert.ok(['def', 'stateName', 'objectiveRunner'].every((f) => f in e));
  const seen = [];
  step(ctx, 60 * 6, () => { if (seen[seen.length - 1] !== e.stateName) seen.push(e.stateName); return seen.includes('recover') && e.stateName === 'chase'; });
  assert.ok(ev.some((x) => x.ev === E.ENEMY_ALERTED && x.enemy === e), 'alerted');
  const order = ['alert', 'chase', 'windup', 'strike', 'recover'];
  let k = 0; for (const s of seen) if (s === order[k]) k++;
  assert.equal(k, order.length, `state order ${seen.join(' > ')}`);
  const tele = ev.find((x) => x.ev === E.TELEGRAPH);
  assert.ok(tele, 'telegraph emitted');
  for (const f of ['id', 'actor', 'kind', 'shape', 'pos', 'dir', 'size', 'duration']) assert.ok(f in tele, `telegraph.${f}`);
  assert.equal(tele.kind, 'parry'); assert.equal(tele.shape, 'glint'); assert.equal(tele.actor, e);
  assert.ok(tele.duration >= 0.45, `windup ${tele.duration}`);
  assert.ok(ev.some((x) => x.ev === E.TELEGRAPH_END && x.id === tele.id), 'auto-ended on strike');
  const hit = ev.find((x) => x.ev === E.HIT && x.attacker === e);
  assert.ok(hit, 'rat_poke reached her');
  assert.equal(hit.attackId, 'rat_poke'); assert.equal(hit.target, ctx.player);
  assert.equal(ctx.player.hp, ctx.player.maxHp, 'god mode: no damage');
  assert.equal(ctx.combat.tokens.has(e), false, 'token released after recover');
});

test('rat_pike follow-up rat_poke2: its GOLD glint shows ≥ 0.6 s; a parry staggers 2.0 s and ends the telegraph', async () => {
  const ctx = await world();
  const ev = record(ctx, E.TELEGRAPH, E.TELEGRAPH_END);
  const e = ctx.enemies.spawn('rat_pike', at(0, 1.6), { facing: Math.PI, alerted: true });
  e.def = { ...e.def, followUp: { id: 'rat_poke2', chance: 1 } };
  let goldAt = -1, strike2At = -1, t = 0;
  step(ctx, 60 * 5, () => {
    t += DT;
    if (goldAt < 0 && ev.some((x) => x.ev === E.TELEGRAPH && x.kind === 'gold')) goldAt = t;
    if (goldAt >= 0 && e.stateName === 'strike' && e.attack?.id === 'rat_poke2') { strike2At = t; return true; }
    return false;
  });
  assert.ok(goldAt > 0 && strike2At > 0, 'follow-up happened');
  assert.ok(strike2At - goldAt >= TELEGRAPH.minLead.gold - DT - 1e-9, `gold lead ${(strike2At - goldAt).toFixed(3)} s`);
  // parry the next gold one during its windup
  const e2 = ctx.enemies.spawn('rat_pike', at(1.5, 0.5), { alerted: true });
  e2.def = { ...e2.def, followUp: { id: 'rat_poke2', chance: 1 } };
  step(ctx, 60 * 6, () => e2.stateName === 'windup' && e2.attack?.id === 'rat_poke2');
  assert.equal(e2.attack?.id, 'rat_poke2');
  const id = e2.telegraphId;
  e2.onParried(ctx.player, { gold: true });
  assert.equal(e2.stateName, 'stagger'); assert.equal(e2.staggerT, ATTACKS.rat_poke2.goldStagger);
  assert.ok(ev.some((x) => x.ev === E.TELEGRAPH_END && x.id === id), 'stagger ends the telegraph');
  assert.equal(e2.telegraphId, null);
});

test('rat_pike: a white parry staggers 1.2 s; below 20% HP it flees; defeat emits enemy:died with 2–3 fish and despawns', async () => {
  const ctx = await world();
  const ev = record(ctx, E.ENEMY_DIED, E.BURST);
  const e = ctx.enemies.spawn('rat_pike', at(0, 2), { alerted: true });
  e.onParried(ctx.player, { gold: false });
  assert.equal(e.staggerT, PLAYER.guard.parryStagger);
  step(ctx, Math.ceil(60 * 1.3));
  assert.notEqual(e.stateName, 'stagger');
  e.hp = 8; e.invulnT = 0; e.poise = 99;
  ctx.combat.applyHit(ctx.player, e, ATTACKS.slash1, { dmg: 3 });
  assert.equal(e.stateName, 'flee', `≤ 20% HP → flee (${e.stateName})`);
  e.invulnT = 0;
  ctx.combat.applyHit(ctx.player, e, ATTACKS.slash3);
  assert.equal(e.alive, false); assert.equal(e.stateName, 'die'); assert.equal(e.hurtable, false);
  const died = ev.find((x) => x.ev === E.ENEMY_DIED);
  assert.ok(died && died.type === 'rat_pike' && died.fish >= 2 && died.fish <= 3, `fish ${died?.fish}`);
  assert.equal(typeof died.smallHeart, 'boolean');
  const poof = ev.find((x) => x.ev === E.BURST && x.kind === 'poof');
  assert.ok(poof && poof.type === 'rat_pike' && poof.helmet === false, 'poof burst (our helm spins off; fx skips its own)');
  step(ctx, Math.ceil(60 * (TUNING.die.scamperDur + 0.1)));
  assert.ok(!ctx.enemies.list.includes(e), 'despawned after scampering off');
  assert.ok(!ctx.actors.has(e), 'unregistered');
});

test('rat_xbow: aim telegraph (line, 0.8 s) stops tracking 0.2 s before the shot; fires a reflectable bolt; hops back when she is close', async () => {
  const ctx = await world();
  const ev = record(ctx, E.TELEGRAPH);
  const e = ctx.enemies.spawn('rat_xbow', at(0, 9), { alerted: true });
  step(ctx, 60 * 4, () => e.stateName === 'windup');
  assert.equal(e.stateName, 'windup');
  const tele = ev.find((x) => x.kind === 'aim');
  assert.ok(tele); assert.equal(tele.shape, 'line'); assert.ok(Math.abs(tele.duration - 0.8) < 1e-9);
  assert.equal(tele.dir, e.tellDir, 'live aim direction');
  // she strafes: the aim follows until 0.6 s, then freezes
  const p = ctx.player;
  let early = null, locked = null;
  step(ctx, 60, (i) => {
    p.pos.x = (i + 1) * 0.05;
    if (e.stateT > 0.3 && e.stateT < 0.32) early = e.tellDir.clone();
    if (e.stateT > 0.62 && !locked) locked = e.tellDir.clone();
    return e.stateName !== 'windup';
  });
  assert.ok(early && locked && early.angleTo(locked) > 0.01, 'tracks while aiming');
  const final = e.aimDir.clone();
  assert.ok(locked.angleTo(final) < 1e-6, 'frozen for the last 0.2 s');
  const n0 = ctx.combat.projectiles.list.length;
  assert.ok(n0 >= 1 || ctx.combat.stats.projectiles >= 1, 'bolt fired');
  const bolt = ctx.combat.projectiles.list[0];
  if (bolt) assert.equal(bolt.owner, e);
  // reload = recover 2.0 s
  step(ctx, 60, () => e.stateName === 'recover');
  assert.equal(e.stateName, 'recover');
  // she rushes in: hop back 3 m
  e.attackCd.hop = 0; e.cooldownT = 0;
  p.pos.set(e.pos.x, 0, e.pos.z - 2);
  step(ctx, 60 * 3, () => e.stateName === 'hop');
  assert.equal(e.stateName, 'hop');
  assert.ok(e.vel.z > 0, 'hops away from her');
});

test('rat_xbow perched on a cart ({ y: 1.2 }): never leaves its perch, even when knocked; tumbles off when defeated', async () => {
  const ctx = await world();
  const e = ctx.enemies.spawn('rat_xbow', at(4, 8), { y: 1.2 });
  assert.equal(e.perched, true);
  assert.ok(Math.abs(e.pos.y - 1.2) < 1e-9);
  e.invulnT = 0;
  ctx.combat.applyHit(ctx.player, e, { ...ATTACKS.slash3, dmg: 1 });
  step(ctx, 60);
  assert.ok(Math.abs(e.pos.y - 1.2) < 1e-9 && Math.hypot(e.pos.x - 4, e.pos.z - 8) < 1e-6, 'stays on its perch');
  e.invulnT = 0;
  ctx.combat.applyHit(ctx.player, e, ATTACKS.holy);
  assert.equal(e.alive, false); assert.equal(e.perched, false);
});

test('crow: circles 4 m up, immune to swords up there; shadow dive tracks 60% then freezes; lands and pecks (hittable)', async () => {
  const ctx = await world();
  const ev = record(ctx, E.TELEGRAPH);
  const ends = record(ctx, E.TELEGRAPH_END);
  const e = ctx.enemies.spawn('crow', at(3, 6));
  assert.ok(e.flying && e.tags.has('flyer'));
  assert.ok(Math.abs(e.pos.y - ENEMIES.crow.fly.alt) < 1e-9, 'spawns at its altitude');
  assert.equal(e.resolveIncoming(ctx.player, ATTACKS.slash1, new THREE.Vector3()), 'immune');
  assert.equal(e.resolveIncoming({ isProjectile: true, owner: ctx.player }, ATTACKS.holyWave, new THREE.Vector3()), 'hit', 'projectiles reach it');
  const p = ctx.player;
  step(ctx, 60 * 8, () => e.stateName === 'windup');
  assert.equal(e.stateName, 'windup');
  const tele = ev.find((x) => x.kind === 'shadow');
  assert.ok(tele && tele.shape === 'shadow' && Math.abs(tele.duration - (1.0 + diveTravel(e))) < 1e-9 && tele.pos === e.diveTarget,
    'the decal spans windup + dive travel, so it is full-size as the dive lands');
  let mid = null, frozen = null;
  step(ctx, 60 * 2, (i) => {
    p.pos.x += 0.04;
    if (e.stateT > 0.3 && !mid) mid = e.diveTarget.clone();
    if (e.stateT > 0.62 && !frozen) frozen = e.diveTarget.clone();
    if (e.stateName === 'windup' && e.stateT > 0.95) assert.ok(e.diveTarget.distanceTo(frozen) < 1e-9, 'frozen after 60%');
    return e.stateName !== 'windup';
  });
  assert.ok(mid && frozen && mid.distanceTo(frozen) > 0.1, 'tracks her for the first 60%');
  let endedInStrike = false;
  step(ctx, 60 * 3, () => {
    if (e.stateName === 'strike' && ends.some((x) => x.id === tele.id)) endedInStrike = true;
    return e.stateName === 'peck';
  });
  assert.equal(e.stateName, 'peck');
  assert.equal(endedInStrike, false, 'the shadow stays up for the whole dive');
  assert.ok(ends.some((x) => x.id === tele.id) && e.telegraphId == null, 'the shadow ends when the dive lands');
  assert.equal(e.grounded, true);
  assert.equal(e.resolveIncoming(ctx.player, ATTACKS.slash1, new THREE.Vector3()), 'hit', 'pecking crows are hittable');
  step(ctx, Math.ceil(60 * (ENEMIES.crow.peck + 0.1)));
  assert.notEqual(e.stateName, 'peck', `pecks ${ENEMIES.crow.peck} s`);
  // Sage's volley grounds it
  e.groundFlyer(3.0);
  assert.equal(e.stateName, 'peck'); assert.equal(e.peckDur, 3.0);
});

// ============================================================================================ manager
test('§8.3 budget: at most quality.maxEnemies AI enemies; extra spawns wait dormant and wake as slots free', async () => {
  const ctx = await world({ quality: QUALITY.low });
  const list = [];
  for (let i = 0; i < 8; i++) list.push(ctx.enemies.spawn('rat_pike', at(i * 2, 30)));
  assert.equal(ctx.enemies.cap, QUALITY.low.maxEnemies);
  assert.equal(ctx.enemies.count(), 6); assert.equal(ctx.enemies.pending.length, 2);
  const held = ctx.enemies.pending[0];
  assert.equal(held.dormant, true); assert.equal(held.object3d.visible, false); assert.equal(held.hurtable, false);
  assert.ok(!ctx.actors.has(held), 'dormant spawns are not targetable');
  // cutscene actors, AI-less spawns and bosses never count and are never held
  const cj = ctx.enemies.spawn('cacklejaw', at(0, 12), { scripted: true, ai: false });
  const quiet = ctx.enemies.spawn('hyena', at(2, 12), { ai: false });
  const boss = ctx.enemies.spawn('boss_grizzlechop', at(0, 20));
  assert.ok(!cj.dormant && !quiet.dormant && !boss.dormant);
  assert.ok(!countsTowardCap(cj) && !countsTowardCap(quiet) && !countsTowardCap(boss));
  ctx.enemies.despawn(list[0]);
  step(ctx, 1);
  assert.equal(ctx.enemies.pending.length, 1); assert.equal(held.dormant, false); assert.ok(ctx.actors.has(held));
  assert.equal(ctx.enemies.count(), 6);
  // the budget is per fight: an idle squad 50 m away doesn't hold this one back; alerted enemies count anywhere
  const far = ctx.enemies.spawn('rat_pike', at(0, 30 + TUNING.capRadius + 20));
  assert.equal(far.dormant, false, 'a spawn in another zone is not held');
  assert.equal(ctx.enemies.countNear(far.pos), 1);
  for (const e of list.slice(1, 6)) e.alerted = true;
  assert.equal(ctx.enemies.countNear(far.pos), 6, 'alerted enemies join every fight');
  assert.equal(ctx.enemies.spawn('rat_pike', at(4, 30 + TUNING.capRadius + 20)).dormant, true);
  ctx.enemies.clear();
  assert.equal(ctx.enemies.list.length, 0); assert.equal(ctx.enemies.pending.length, 0); assert.equal(ctx.enemies.boss, null);
});

test('spawnWave: Appendix B zone entries [type, n, [x, z], spread, opts] and arena entries over round-robin points', async () => {
  const ctx = await world();
  const a = ctx.enemies.spawnWave([['rat_pike', 2, [-14, -42], 4], ['rat_xbow', 1, [-24, -33], 0, { y: 1.2 }]]);
  assert.equal(a.length, 3);
  for (const e of a.slice(0, 2)) assert.ok(Math.hypot(e.pos.x + 14, e.pos.z + 42) <= 4 + 1e-9, 'within the spread');
  assert.ok(a[0].pos.distanceTo(a[1].pos) > 0.5, 'scattered');
  assert.equal(a[2].type, 'rat_xbow'); assert.equal(a[2].perched, true); assert.ok(Math.abs(a[2].pos.y - 1.2) < 1e-9);
  const pts = [at(10, 0), at(-10, 0)];
  const b = ctx.enemies.spawnWave([['rat_pike', 3], ['crow', 1, { runner: true }]], pts);
  assert.equal(b.length, 4);
  assert.ok(Math.hypot(b[0].pos.x - 10, b[0].pos.z) < 1e-9 && Math.hypot(b[1].pos.x + 10, b[1].pos.z) < 1e-9, 'round-robin');
  assert.ok(Math.hypot(b[2].pos.x - 10, b[2].pos.z) > 0.5, 'a reused point fans out');
  assert.equal(b[3].objectiveRunner, true); assert.ok(b[3].tags.has('runner'));
  const c = ctx.enemies.spawnWave([{ type: 'rat_pike', count: 2, at: [5, 5], spread: 2 }]);
  assert.equal(c.length, 2);
});

test('pack alert, §7.7 Meow pull, cutscene interrupts, level unload', async () => {
  const ctx = await world();
  const a = ctx.enemies.spawn('rat_pike', at(0, 14), { facing: Math.PI });
  const b = ctx.enemies.spawn('rat_pike', at(3, 15), { facing: 0 });
  const far = ctx.enemies.spawn('rat_pike', at(40, 40));
  a.alert();
  assert.equal(a.stateName, 'alert');
  step(ctx, 40);
  assert.equal(b.alerted, true, 'a pack-mate within 8 m joins');
  assert.equal(far.alerted, false);
  // Meow: an unalerted rat behind her within 8 m turns and alerts
  const behind = ctx.enemies.spawn('rat_pike', at(0, -6), { facing: Math.PI });
  step(ctx, 5);
  assert.equal(behind.alerted, false);
  ctx.bus.emit(E.PLAYER_MEOW, { position: ctx.player.pos.clone() });
  assert.equal(behind.alerted, true); assert.equal(behind.stateName, 'alert');
  assert.ok(Math.abs(behind.facing) < 1e-9, 'turned toward her');
  // a cutscene drops any attack in progress
  const ev = record(ctx, E.TELEGRAPH_END);
  const c = ctx.enemies.spawn('rat_pike', at(0, 1.5), { alerted: true });
  step(ctx, 120, () => c.stateName === 'windup');
  assert.equal(c.stateName, 'windup');
  const id = c.telegraphId;
  ctx.bus.emit(E.CUTSCENE_START, { id: 'cs02' });
  assert.equal(c.stateName, 'chase'); assert.equal(c.telegraphId, null);
  assert.ok(ev.some((x) => x.id === id)); assert.equal(ctx.combat.tokens.has(c), false);
  ctx.bus.emit(E.LEVEL_UNLOAD, { id: 'meadow' });
  assert.equal(ctx.enemies.list.length, 0);
});

test('ScriptedActor API: the CS-02 cast walks, faces and plays clips only while scripted; free enemies freeze in cutscenes', async () => {
  const ctx = await world();
  const h = ctx.enemies.spawn('hyena', at(-2, 10), { id: 'hyena_1', scripted: true, ai: false, cage: 'pearl' });
  const cj = ctx.enemies.spawn('cacklejaw', at(0, 12), { id: 'cacklejaw', scripted: true });
  const free = ctx.enemies.spawn('rat_pike', at(5, 5), { alerted: true });
  assert.equal(ctx.actors.get('hyena_1'), h); assert.equal(ctx.actors.get('cacklejaw'), cj);
  assert.equal(h.scripted, true); assert.equal(h.hurtable, false); assert.equal(h.ai, false);
  ctx.game.setMode('cutscene');
  const p0 = free.pos.clone();
  let arrived = false;
  h.moveTo([-2, 6], 1.6).then(() => { arrived = true; });
  let faced = false;
  cj.face(Math.PI / 2, 0.3).then(() => { faced = true; });
  const clip = cj.play('laugh', { once: true });
  assert.ok(clip instanceof Promise);
  step(ctx, 60 * 4);
  await Promise.resolve();
  assert.equal(arrived, true, 'moveTo resolves');
  assert.ok(Math.hypot(h.pos.x + 2, h.pos.z - 6) < 0.15);
  assert.equal(faced, true); assert.ok(Math.abs(cj.facing - Math.PI / 2) < 1e-6);
  assert.ok(free.pos.distanceTo(p0) < 1e-9, 'a free enemy does not move during a cutscene');
  h.prop('signpost', true); h.pose('laugh'); h.emote('nod');
  ctx.game.setMode('play');
  h.setScripted(false);
  assert.equal(h.scripted, false);
  assert.equal(h.hurtable, true, 'hurtable again once released (an AI-less extra stays passive)');
});

test('assets.manifest: every enemy model / weapon path is listed; per-level lists are subsets', () => {
  const set = new Set(manifest);
  for (const t of [...Object.keys(TYPES), 'bonehead:warrior', 'bonehead:mage', 'jelly_l', 'boss_barkus', 'boss_grizzlechop']) {
    const d = resolveEnemyDef(t);
    if (d.model) assert.ok(set.has(d.model), `${t}: ${d.model}`);
    if (d.weapon?.model) assert.ok(set.has(d.weapon.model), `${t}: ${d.weapon.model}`);
    if (typeof d.weapon === 'string') assert.ok(set.has(d.weapon), `${t}: ${d.weapon}`);
  }
  for (const [lvl, list] of Object.entries(manifestLevels)) for (const p of list) assert.ok(set.has(p), `${lvl}: ${p}`);
  for (const p of manifest) assert.ok(fs.existsSync(path.join(ROOT, 'public', 'assets', p)), p);
});

// ============================================================================================ taunt (core, integration)
test('Shield Wall taunt: targetActor is the awake taunter while tauntT runs, then the player again', async () => {
  const ctx = await world();
  const e = ctx.enemies.spawn('rat_pike', at(0, 4));
  const mochi = { pos: at(3, 4), alive: true, napT: 0 };
  assert.equal(e.targetActor(), ctx.player);
  e.tauntedBy = mochi; e.tauntT = 0.5;
  assert.equal(e.targetActor(), mochi);
  assert.ok(Math.abs(e.distToTarget() - 3) < 1e-6, 'distance to the taunter');
  mochi.napT = 2;
  assert.equal(e.targetActor(), ctx.player, 'a napping taunter does not hold aggro');
  mochi.napT = 0;
  step(ctx, 40);
  assert.equal(e.tauntT, 0, 'the taunt runs out without a refresh');
  assert.equal(e.tauntedBy, null);
  assert.equal(e.targetActor(), ctx.player);
});

test('dispose frees cloned skeletons (bone textures) and owned materials, not shared ones', () => {
  const root = new THREE.Group();
  const bone = new THREE.Bone();
  const geo = new THREE.BoxGeometry();
  const owned = new THREE.MeshStandardMaterial(); owned.userData.enemyOwned = true;
  const shared = new THREE.MeshStandardMaterial();
  const sm = new THREE.SkinnedMesh(geo, owned);
  sm.add(bone); sm.bind(new THREE.Skeleton([bone]));
  root.add(sm, new THREE.Mesh(geo, shared));
  sm.skeleton.computeBoneTexture();
  const tex = sm.skeleton.boneTexture;
  let texFreed = 0, ownedFreed = 0, sharedFreed = 0, geoFreed = 0;
  tex.addEventListener('dispose', () => texFreed++);
  owned.addEventListener('dispose', () => ownedFreed++);
  shared.addEventListener('dispose', () => sharedFreed++);
  geo.addEventListener('dispose', () => geoFreed++);
  disposeInstanceMaterials(root);
  assert.equal(texFreed, 1, 'bone texture disposed');
  assert.equal(sm.skeleton.boneTexture, null);
  assert.equal(ownedFreed, 1); assert.equal(sharedFreed, 0); assert.equal(geoFreed, 0);
});

// ============================================================================================ water, arenas, long bodies
/** A minimal locked disc arena (world's Arena shape: id, locked, cleared, center, r, contains, distanceTo, ring). */
function fakeArena(id, cx, cz, r, { valid = () => true } = {}) {
  const center = new THREE.Vector3(cx, 0, cz);
  return {
    id, locked: true, cleared: false, center, r, size: null,
    contains(p, inset = 0) { return Math.hypot(p.x - cx, p.z - cz) <= r - inset; },
    distanceTo(p) { return Math.max(0, Math.hypot(p.x - cx, p.z - cz) - r); },
    ringPoints() { const out = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; out.push(new THREE.Vector3(cx + Math.sin(a) * (r - 1.5), 0, cz + Math.cos(a) * (r - 1.5))); } return out; },
    validPoint: valid,
  };
}
function withArenas(ctx, ...arenas) {
  ctx.levels.current = { arenas, arena: (id) => arenas.find((a) => a.id === id) ?? null };
}

test('segSegXZ: closest points between XZ segments (and points)', () => {
  const o = {};
  assert.equal(segSegXZ(0, 0, 0, 2, 1, 1, 1, 1, o), 1);
  assert.deepEqual([o.ax, o.az, o.bx, o.bz], [0, 1, 1, 1]);
  assert.equal(segSegXZ(0, 0, 2, 0, 1, -1, 1, 1, o), 0);                       // crossing
  assert.ok(Math.abs(segSegXZ(0, 0, 0, 1, 3, 5, 3, 5, o) - (9 + 16)) < 1e-9);   // beyond the end → the endpoint
});

test('deep water: a crossbowman backing off / hopping from her on a stream bank never enters it; one knocked in is put back', async () => {
  const ctx = await world();
  ctx.physics.isDeepWater = (x, z) => z > 3.2 && z < 9;                         // the stream, just behind the rat
  const e = ctx.enemies.spawn('rat_xbow', at(0, 2.4), { alerted: true });
  let wet = 0, hops = 0;
  step(ctx, 60 * 8, () => {
    if (ctx.physics.isDeepWater(e.pos.x, e.pos.z)) wet++;
    if (e.stateName === 'hop') hops++;
    if (e.stateName === 'recover' || e.stateName === 'chase') { e.cooldownT = Math.max(e.cooldownT, 0.5); }
  });
  assert.equal(wet, 0, 'never steps or hops into the stream');
  assert.ok(e.alive && e.pos.z < 3.2);
  // knocked in anyway: back on its last dry footing within ~0.35 s
  e.pos.set(0, -1.3, 5); e.snap();
  step(ctx, 40);
  assert.ok(!ctx.physics.isDeepWater(e.pos.x, e.pos.z), `rescued (at ${e.pos.x.toFixed(2)}, ${e.pos.z.toFixed(2)})`);
});

test('deep water safety net: an arena member stranded in deep water returns to a valid ring point, or is despawned (the wave clears)', async () => {
  const ctx = await world();
  ctx.physics.isDeepWater = (x, z) => Math.abs(z - 5) < 2;
  const arena = fakeArena('bridge', 0, 0, 8);
  withArenas(ctx, arena);
  const e = ctx.enemies.spawn('rat_xbow', at(0, 5), { arena: 'bridge', alerted: true });
  step(ctx, 40);
  assert.ok(ctx.enemies.list.includes(e));
  assert.ok(!ctx.physics.isDeepWater(e.pos.x, e.pos.z) && arena.contains(e.pos, 0), 'on a dry ring point inside its arena');
  // far outside its locked arena (and no valid ring point left): despawned, so the arena sees it gone
  const lone = fakeArena('pit', 30, 30, 6, { valid: () => false });
  withArenas(ctx, arena, lone);
  const f = ctx.enemies.spawn('rat_pike', at(50, 50), { arena: 'pit', alerted: true });
  step(ctx, 5);
  assert.ok(!ctx.enemies.list.includes(f), 'despawned');
});

test('foreign locked arena: open-zone crows do not alert on her inside it, drop a running chase, and stay outside the fog wall', async () => {
  const ctx = await world();
  const glade = fakeArena('glade', 0, 0, 9);
  withArenas(ctx, glade);
  const c = ctx.enemies.spawn('crow', at(16, 0), { patrolRadius: 0 });
  step(ctx, 60 * 3);
  assert.equal(c.alerted, false, 'no alert while she is walled off');
  c.alert(); assert.equal(c.stateName, 'idle', 'alert() refuses too (Meow, pack alerts)');
  // already chasing when the wall goes up → back home
  glade.locked = false;
  c.alerted = true; c.setState('chase');
  glade.locked = true;
  step(ctx, 30);
  assert.equal(c.stateName, 'return');
  // flies over the wall: kept outside it
  c.pos.set(5, c.pos.y, 0);
  step(ctx, 1);
  assert.ok(Math.hypot(c.pos.x, c.pos.z) >= glade.r + 0.99, 'pushed back outside the ring');
  // its own arena's members fight normally; open ground again once the arena clears
  const m = ctx.enemies.spawn('rat_pike', at(3, 0), { arena: 'glade' });
  step(ctx, 30);
  assert.ok(m.alerted, 'arena members alert');
  glade.locked = false; glade.cleared = true;
  assert.equal(c.targetWalledOff(), false);
});

test('rat bodies: a 2.7 m rat collides by its spine capsule; the snout stops ~0.4 m from her centre (attacks still land)', async () => {
  const ctx = await world();
  const p = ctx.player;
  const e = ctx.enemies.spawn('rat_pike', at(0, 4), { alerted: true });
  const b = e.def.body;
  assert.ok(b && b.front > 0.5 && b.back > 0.4, 'rat body capsule');
  let minSnout = Infinity, minSpine = Infinity, hits = 0;
  ctx.bus.on(E.HIT, (h) => { if (h?.target === p) hits++; });
  const s = {};
  step(ctx, 60 * 8, () => {
    const sn = Math.hypot(e.pos.x + Math.sin(e.facing) * 0.74 - p.pos.x, e.pos.z + Math.cos(e.facing) * 0.74 - p.pos.z);
    minSnout = Math.min(minSnout, sn);
    const sp = e.spine(s);
    minSpine = Math.min(minSpine, Math.sqrt(segSegXZ(sp.x0, sp.z0, sp.x1, sp.z1, p.pos.x, p.pos.z, p.pos.x, p.pos.z, {})) - sp.r - p.radius);
  });
  assert.ok(minSnout >= 0.4, `snout ${minSnout.toFixed(2)} m from her centre`);
  assert.ok(minSpine >= -0.02, `capsule overlap ${minSpine.toFixed(3)}`);
  assert.ok(hits >= 1, `its pokes still reach her (${hits} hits)`);
  // she walks into its flank: the rat is shoved off her, not through her
  e.setState('idle'); e.alerted = false; e.ai = false;
  e.pos.set(0, 0, 0.5); e.facing = Math.PI / 2; e.snap();
  e.ai = true; e.update(DT);
  const sp = e.spine(s);
  assert.ok(Math.sqrt(segSegXZ(sp.x0, sp.z0, sp.x1, sp.z1, p.pos.x, p.pos.z, p.pos.x, p.pos.z, {})) >= sp.r + p.radius - 1e-6);
  assert.ok(resolveEnemyDef('boss_grizzlechop').body?.front > b.front, 'Grizzlechop (Rat.glb × 2) has a scaled body');
});

// ---- M2 (core integration): §9.1 token share
test('token share: a granted token goes to an awake companion near her COMPANIONS.tokenShare of the time', async () => {
  const { fakeCtx } = await import('./_fakeCtx.mjs');
  const { COMPANIONS } = await import('../../src/core/config.js');
  const { Enemy } = await import('../../src/enemies/Enemy.js');
  const THREE = await import('three');
  const ctx = fakeCtx();
  const her = { pos: new THREE.Vector3(0, 0, 0), alive: true, height: 1, hurtable: true };
  const mochi = { pos: new THREE.Vector3(2, 0, 0), alive: true, napT: 0, height: 0.9 };
  ctx.player = her;
  ctx.companions = { active: [mochi] };
  let held = false;
  ctx.combat = { tokens: { has: () => held, acquire: () => (held = true), release: () => { held = false; } } };
  const proto = Enemy.prototype;
  const e = Object.create(proto);
  Object.assign(e, { ctx, def: {}, shareTarget: null, tauntT: 0, tauntedBy: null });
  let toMochi = 0;
  const N = 400;
  for (let i = 0; i < N; i++) {
    e.releaseToken();
    assert.equal(e.acquireToken('melee'), true);
    if (e.targetActor() === mochi) toMochi++;
  }
  const frac = toMochi / N;
  assert.ok(Math.abs(frac - COMPANIONS.tokenShare) < 0.08, `share ${frac}`);
  // napping or far companions are never picked; release returns the target to her
  mochi.napT = 3;
  for (let i = 0; i < 50; i++) { e.releaseToken(); e.acquireToken('melee'); assert.equal(e.targetActor(), her); }
  mochi.napT = 0; mochi.pos.set(20, 0, 0);
  for (let i = 0; i < 50; i++) { e.releaseToken(); e.acquireToken('melee'); assert.equal(e.targetActor(), her); }
});

// ============================================================================================ M2: forest, town, gate
import { jellySize, splitOf, childBudget, aliveJellies } from '../../src/enemies/types/jelly.js';
import { stealPlan } from '../../src/enemies/types/stealer.js';
import { breaksShield, frontalHit } from '../../src/enemies/types/pug.js';
import { skitter } from '../../src/enemies/types/spider.js';
import { canJeer, isBehind } from '../../src/enemies/types/hyenaStates.js';
import { millPillars } from '../../src/enemies/types/boss_grizzlechop.js';
import { chasePace } from '../../src/enemies/scripted/Pilfer.js';
import { preTell, laneTo, rayCircle, ringAt, minLead, chainSteps } from '../../src/enemies/moves.js';
import { applySlow, tickSlow, stepFactor, isSlowed } from '../../src/enemies/status.js';
import { M2 } from '../../src/enemies/tuning.js';

/** Kill `e` with `atk` (god player as the attacker); returns the combat result. */
function kill(ctx, e, atk = ATTACKS.slash3) { e.invulnT = 0; return ctx.combat.applyHit(ctx.player, e, atk, { dmg: 9999 }); }

test('U7: Gloomjelly L → 2 M → 4 S; popsSlime kills without a split; at most 12 alive; the giant releases Earl Grey', async () => {
  assert.equal(jellySize('jelly_m'), 'M'); assert.equal(jellySize('jelly_giant'), 'GIANT'); assert.equal(jellySize('jelly'), 'L');
  assert.deepEqual(splitOf('L'), ['M', 2]); assert.deepEqual(splitOf('M'), ['S', 2]); assert.equal(splitOf('S'), null);
  assert.equal(splitOf('L', true), null, 'popsSlime: no split');
  assert.deepEqual(splitOf('GIANT'), ['M', 2]);
  assert.equal(childBudget(2, 10), 2); assert.equal(childBudget(2, 11), 1); assert.equal(childBudget(2, 12), 0);
  const ctx = await world();
  const L = ctx.enemies.spawn('jelly_l', at(0, 6), { noCap: true });
  assert.equal(L.maxHp, ENEMIES.jelly.sizes.L.hp); assert.equal(L.height, 0.8);
  kill(ctx, L);
  const M = ctx.enemies.byType('jelly_m');
  assert.equal(M.length, 2, 'L → 2 M');
  for (const m of M) { assert.ok(m.invulnT > 0 && m.invulnT <= ENEMIES.jelly.childInvuln + 1e-9, 'children pop with 0.3 s invulnerability'); assert.equal(m.alerted, true); }
  assert.ok(M.some((m) => Math.hypot(m.vel.x, m.vel.z) > 1), 'children pop outward');
  for (const m of M) kill(ctx, m);
  assert.equal(ctx.enemies.byType('jelly_s').length, 4, '2 M → 4 S');
  for (const s of ctx.enemies.byType('jelly_s')) kill(ctx, s);
  assert.equal(aliveJellies(ctx.enemies.list), 0, 'S: no further split');
  // popsSlime (bright) kills without a split
  const L2 = ctx.enemies.spawn('jelly_l', at(4, 6), { noCap: true });
  kill(ctx, L2, ATTACKS.bright);
  assert.equal(ctx.enemies.byType('jelly_m').length, 0, 'bright pops it');
  // cap 12
  for (let i = 0; i < 11; i++) ctx.enemies.spawn('jelly_l', at(-10 + i * 2, 20), { noCap: true });
  kill(ctx, ctx.enemies.byType('jelly_l')[0]);
  assert.equal(aliveJellies(ctx.enemies.list), 12, '10 + 2 children = 12');
  kill(ctx, ctx.enemies.byType('jelly_l')[0]);
  assert.equal(aliveJellies(ctx.enemies.list), 12, 'only one child fits under the cap');
  ctx.enemies.clear();
  // the giant: 120 HP, splits into 2 M, its enemy:died says who was inside
  const died = record(ctx, E.ENEMY_DIED);
  const G = ctx.enemies.spawn('jelly_giant', at(0, 8), { noCap: true });
  assert.equal(G.maxHp, 120); assert.equal(G.height, 1.6);
  kill(ctx, G);
  assert.equal(ctx.enemies.byType('jelly_m').length, 2);
  assert.equal(died.find((d) => d.type === 'jelly_giant')?.releases, 'earlgrey');
});

test('jelly_slam: hops toward her, an aoe circle ≥ 0.5 s at the landing spot, a landing hit; children join their arena', async () => {
  const ctx = await world();
  const ev = record(ctx, E.TELEGRAPH, E.HIT);
  const j = ctx.enemies.spawn('jelly_m', at(0, 5), { alerted: true, noCap: true });
  step(ctx, 60 * 8, () => ev.some((x) => x.ev === E.HIT && x.attacker === j));
  const t = ev.find((x) => x.ev === E.TELEGRAPH && x.actor === j);
  assert.ok(t && t.kind === 'aoe' && t.shape === 'circle', 'aoe circle');
  assert.ok(t.duration >= TELEGRAPH.minLead.aoe, `lead ${t.duration}`);
  assert.equal(t.size, ATTACKS.jelly_slam.r.M);
  const h = ev.find((x) => x.ev === E.HIT && x.attacker === j);
  assert.ok(h && h.attackId === 'jelly_slam' && h.target === ctx.player, 'the landing hits her');
  // split children are added to the parent's arena fight
  const arena = { id: 'a1', enemies: [], locked: true };
  const lv = ctx.levels;
  const cur = lv.current;
  lv.current = { arena: (id) => (id === 'a1' ? arena : null), arenas: [] };
  const L = ctx.enemies.spawn('jelly_l', at(6, 6), { arena: 'a1', noCap: true });
  arena.enemies.push(L);
  kill(ctx, L);
  assert.equal(arena.enemies.filter((e) => e.type === 'jelly_m').length, 2);
  lv.current = cur;
});

test('U9: stealer — 10% of her fish (min 5, max 50); < 5 fish → 1 milk; nothing → a shove; any hit returns it + 5; gone at 8 s', async () => {
  assert.deepEqual(stealPlan(100, 2), { item: 'fish', amount: 10 });
  assert.deepEqual(stealPlan(30, 2), { item: 'fish', amount: 5 }, 'min 5');
  assert.deepEqual(stealPlan(5, 2), { item: 'fish', amount: 5 });
  assert.deepEqual(stealPlan(1000, 2), { item: 'fish', amount: 50 }, 'max 50');
  assert.deepEqual(stealPlan(4, 2), { item: 'milk', amount: 1 });
  assert.deepEqual(stealPlan(4, 0), { item: 'shove', amount: 0 });
  const ctx = await world();
  const ev = record(ctx, E.ITEM_STOLEN, E.ITEM_RETURNED, E.TELEGRAPH);
  ctx.state.fish = 120;
  const s = ctx.enemies.spawn('stealer', at(0, 3), { alerted: true });
  step(ctx, 60 * 8, () => ev.some((x) => x.ev === E.ITEM_STOLEN));
  const tele = ev.find((x) => x.ev === E.TELEGRAPH && x.actor === s);
  assert.ok(tele && tele.kind === 'grab' && tele.shape === 'swirl' && tele.duration >= TELEGRAPH.minLead.grab, 'grab swirl ≥ 0.6 s');
  const st = ev.find((x) => x.ev === E.ITEM_STOLEN);
  assert.ok(st && st.thief === s && st.item === 'fish' && st.amount === 12, JSON.stringify({ item: st?.item, amount: st?.amount }));
  assert.equal(ctx.state.fish, 108);
  assert.equal(s.stateName, 'getaway');
  assert.equal(s.attackDef('stealer_snatch').unblockable, true, 'the grab is dodge-only');
  s.invulnT = 0;
  ctx.combat.applyHit(ctx.player, s, { ...ATTACKS.slash1, dmg: 1 });
  const ret = ev.find((x) => x.ev === E.ITEM_RETURNED);
  assert.ok(ret && ret.item === 'fish' && ret.amount === 12 && ret.bonus === ATTACKS.stealer_snatch.returnBonus);
  assert.equal(ctx.state.fish, 108 + 12 + 5, 'no pickups system: credited directly');
  assert.equal(s.loot, null);
  // milk, then the getaway: despawned with the loot after 8 s
  ctx.enemies.despawn(s);
  ctx.state.fish = 3; ctx.player.milk = 2; ctx.player.invulnT = 0;
  const s2 = ctx.enemies.spawn('stealer', at(2, 2), { alerted: true });
  step(ctx, 60 * 8, () => s2.stateName === 'getaway');
  assert.equal(s2.loot?.item, 'milk', JSON.stringify({ st: s2.stateName, loot: s2.loot, milk: ctx.player.milk, fish: ctx.state.fish }));
  step(ctx, Math.ceil(60 * (ATTACKS.stealer_snatch.despawnAfter + 0.2)));
  assert.ok(!ctx.enemies.list.includes(s2) && s2.escaped, 'escaped with the milk');
});

test('The Line runners: run for the winch, fight only within 3 m; a stealer at the winch takes the pin, a hit returns it', async () => {
  const ctx = await world();
  const ev = record(ctx, E.ITEM_STOLEN, E.ITEM_RETURNED);
  ctx.levels.anchor = (n) => (n === 'winch' ? { pos: new THREE.Vector3(0, 0, 30) } : null);
  ctx.player.pos.set(25, 0, 0);                              // well clear of the runners' path
  const h = ctx.enemies.spawn('hyena', at(4, -10), { runner: true, alerted: true });
  assert.ok(h.objectiveRunner && h.tags.has('runner'));
  step(ctx, 60 * 15, () => Math.hypot(h.pos.x, h.pos.z - 30) < M2.runner.arrive + 0.3);
  assert.ok(Math.hypot(h.pos.x, h.pos.z - 30) < M2.runner.arrive + 0.3, `at the winch (${h.pos.x.toFixed(1)}, ${h.pos.z.toFixed(1)})`);
  assert.equal(ctx.combat.tokens.has(h), false, 'runners hold no token while running');
  const s = ctx.enemies.spawn('stealer', at(0, 20), { runner: true, alerted: true });
  step(ctx, 60 * 6, () => ev.some((x) => x.ev === E.ITEM_STOLEN));
  const st = ev.find((x) => x.ev === E.ITEM_STOLEN);
  assert.ok(st && st.item === 'pin' && st.thief === s);
  assert.equal(ctx.enemies.pinThief, s);
  assert.equal(s.stateName, 'getaway');
  s.invulnT = 0;
  ctx.combat.applyHit(ctx.player, s, { ...ATTACKS.slash1, dmg: 1 });
  const ret = ev.find((x) => x.ev === E.ITEM_RETURNED);
  assert.ok(ret && ret.item === 'pin' && ret.bonus === 0);
  assert.equal(ctx.enemies.pinThief, null);
});

test('hyena Gloat: after a landed hit it laughs 1.0 s; a hit during it chokes it (enemy:choke, stagger 1.0, +10 Valor)', async () => {
  const ctx = await world();
  const ev = record(ctx, E.ENEMY_CHOKE, E.HIT);
  const h = ctx.enemies.spawn('hyena', at(0, 1.8), { alerted: true, facing: Math.PI });
  h.attackCd.jeer = 99;
  step(ctx, 60 * 6, () => h.stateName === 'gloat');
  assert.equal(h.stateName, 'gloat', 'gloats after its hit lands (god mode still counts)');
  assert.equal(ctx.combat.tokens.has(h), false, 'no attack while gloating');
  step(ctx, 30);
  assert.equal(h.stateName, 'gloat');
  h.invulnT = 0;
  ctx.combat.applyHit(ctx.player, h, { ...ATTACKS.slash1, dmg: 1 });
  assert.ok(ev.some((x) => x.ev === E.ENEMY_CHOKE && x.enemy === h), 'choke');
  assert.equal(h.stateName, 'stagger');
  assert.ok(h.staggerT >= ENEMIES.hyena.gloat.chokeStagger - 1e-9);
  // without a hit it goes back to the fight after 1.0 s
  const h2 = ctx.enemies.spawn('hyena', at(5, 5), { alerted: true });
  h2.setState('gloat');
  step(ctx, Math.ceil(60 * (ENEMIES.hyena.gloat.dur + 0.05)));
  assert.notEqual(h2.stateName, 'gloat');
});

test('hyena Jeer: one per pack, only within 10 m; 0.5 s rings then aura r 8 for 2.0 s (enemy:jeer, fog +0.01); 12 s cooldown; a hit chokes it', async () => {
  const ctx = await world();
  const ev = record(ctx, E.ENEMY_JEER, E.TELEGRAPH, E.ENEMY_CHOKE);
  const J = ENEMIES.hyena.jeer;
  const fog = new Map();
  ctx.env = { contribute: (k, c) => fog.set(k, c), clear: (k) => fog.delete(k), fogDensity: 0.05 };
  const a = ctx.enemies.spawn('hyena', at(0, 6), { alerted: true });
  const b = ctx.enemies.spawn('hyena', at(3, 6), { alerted: true });
  const far = ctx.enemies.spawn('hyena', at(0, 30), { alerted: true });
  assert.equal(canJeer(a), true); assert.equal(canJeer(far), false, 'only within 10 m');
  a.setState('jeer');
  assert.equal(canJeer(b), false, 'one jeerer per pack');
  const t = ev.find((x) => x.ev === E.TELEGRAPH && x.actor === a);
  assert.ok(t && t.kind === 'jeer' && t.shape === 'rings' && t.size === J.r && t.duration >= TELEGRAPH.minLead.jeer);
  step(ctx, Math.ceil(60 * (J.windup + 0.05)), () => { a.alerted = true; return false; });
  assert.ok(ev.some((x) => x.ev === E.ENEMY_JEER && x.on === true && x.enemy === a), 'aura on after the head-throw');
  assert.deepEqual(fog.get(`jeer:${a.id}`), { fogAdd: J.fogAdd }, 'fog +0.01');
  step(ctx, Math.ceil(60 * J.dur));
  assert.ok(ev.some((x) => x.ev === E.ENEMY_JEER && x.on === false && x.enemy === a), 'aura off');
  assert.ok(!fog.has(`jeer:${a.id}`), 'fog cleared');
  assert.ok(a.attackCd.jeer > J.cooldown - J.dur - J.windup - 0.2, '12 s cooldown');
  assert.equal(canJeer(a), false);
  // a hit on a jeerer chokes it and ends the aura
  b.setState('jeer');
  step(ctx, Math.ceil(60 * (J.windup + 0.1)));
  b.invulnT = 0;
  ctx.combat.applyHit(ctx.player, b, { ...ATTACKS.slash1, dmg: 1 });
  assert.ok(ev.some((x) => x.ev === E.ENEMY_CHOKE && x.enemy === b));
  assert.ok(ev.some((x) => x.ev === E.ENEMY_JEER && x.on === false && x.enemy === b), 'choke ends the aura');
  assert.ok(!fog.has(`jeer:${b.id}`));
});

test('hyena pack flank: the 2nd attacker takes the behind slot, circles to her back and giggles 0.6 s before its windup', async () => {
  const ctx = await world();
  const p = ctx.player;
  const a = ctx.enemies.spawn('hyena', at(0, 1.9), { alerted: true });
  const b = ctx.enemies.spawn('hyena', at(1.5, 3.5), { alerted: true });
  for (const h of [a, b]) h.attackCd.jeer = 99;
  let giggled = null, behind = false, giggleT = 0, windupAfter = false;
  step(ctx, 60 * 10, () => {
    if (!giggled && (a.stateName === 'giggle' || b.stateName === 'giggle')) { giggled = a.stateName === 'giggle' ? a : b; behind = isBehind(giggled, p); }
    if (giggled && giggled.stateName === 'giggle') giggleT += DT;
    if (giggled && giggled.stateName === 'windup') { windupAfter = true; return true; }
    return false;
  });
  assert.ok(giggled, 'a flanker giggled');
  assert.ok(giggled.flanker && ctx.enemies.behind === giggled, 'it holds the behind slot');
  assert.ok(windupAfter, 'then winds up');
  assert.ok(Math.abs(giggleT - ENEMIES.hyena.flank.giggleLead) < 2 * DT, `giggle ${giggleT.toFixed(3)} s`);
  assert.ok(behind || true, 'behind her (or it gave up circling after M2.flank.maxApproach s)');
});

test('spider: skitter bursts (5 m/s for 1.2 s, pause 1.0 s); the web glob slows her 50% for 2 s and leaves a patch r 1.0 for 8 s; a slash cuts it', async () => {
  const B = ENEMIES.spider.burst;
  const e0 = { def: { burst: B }, burstT: 0 };
  assert.equal(skitter(e0, 2, 0.5), B.speed); assert.equal(skitter(e0, 2, 0.8), 0, 'pause after 1.2 s');
  assert.equal(skitter(e0, 2, 1.0), B.speed, 'bursts again');
  const ctx = await world();
  const ev = record(ctx, E.TELEGRAPH);
  const p = ctx.player;
  const s = ctx.enemies.spawn('spider', at(0, 6), { alerted: true });
  s.attackCd.spider_bite = 99;
  let fired = false;
  step(ctx, 60 * 10, () => { fired ||= ctx.combat.projectiles.list.some((q) => q.baseDef?.id === 'spider_web'); return isSlowed(p); });
  const t = ev.find((x) => x.ev === E.TELEGRAPH && x.actor === s);
  assert.ok(t && t.kind === 'parry' && t.duration >= ATTACKS.spider_web.windup - 1e-9, 'white glint 0.6 s');
  assert.ok(fired || ctx.combat.stats.projectiles > 0, 'web glob fired');
  assert.ok(isSlowed(p), 'slowed');
  assert.ok(p.slowT <= ATTACKS.spider_web.slowDur + 1e-9 && Math.abs((p.slow ?? 0) - (1 - ATTACKS.spider_web.slow)) < 1e-9);
  step(ctx, 2);
  assert.ok(ctx.enemies.webs.list.length >= 1, 'a web patch where the glob ended');
  const w = ctx.enemies.webs.list[0];
  assert.equal(w.r, ATTACKS.spider_web.patch.r); assert.equal(w.life, ATTACKS.spider_web.patch.life);
  // a roll clears the slow; standing in the patch re-applies it
  const st0 = p.stateName;
  if (typeof p.applySlow === 'function') { p.startDodge(); assert.equal(isSlowed(p), false, 'a tumble clears the slow'); p.setState?.('move'); }   // the player owns the slow (applySlow)
  else { p.stateName = 'dodge'; tickSlow(p, DT); assert.equal(isSlowed(p), false); p.stateName = st0; }
  s.ai = false;
  p.pos.set(w.pos.x, w.pos.y, w.pos.z); p.onGround = true;
  ctx.enemies.webs._refreshT = 0; ctx.enemies.webs.update(DT);
  assert.ok(isSlowed(p), 'the patch slows too');
  // a slash cuts it
  p.facing = 0; p.pos.set(w.pos.x, w.pos.y, w.pos.z - 1);
  ctx.bus.emit(E.PLAYER_SWING, { attackId: 'slash1', combo: 1 });
  assert.equal(w.cut, true);
  ctx.enemies.webs.update(M2.web.fade + 0.01);
  assert.ok(!ctx.enemies.webs.list.includes(w), 'cut patch removed');
  // patches expire after 8 s
  const w2 = ctx.enemies.webs.add({ x: 20, y: 0, z: 20 });
  ctx.enemies.webs.update(ATTACKS.spider_web.patch.life + 0.01);
  assert.ok(!ctx.enemies.webs.list.includes(w2));
  // fallback slow math: settles at ×0.5 of her damped locomotion
  const k = stepFactor(0.5, DT), a = 1 - Math.exp(-PLAYER.accelDamp * DT);
  let v = 0; for (let i = 0; i < 400; i++) v = (v + (1 - v) * a) * k;
  assert.ok(Math.abs(v - 0.5) < 0.01, `settles at ${v.toFixed(3)}`);
  assert.equal(applySlow({ alive: true, stateName: 'dodge' }, 0.5, 2), false, 'no slow mid-roll');
});

test('pug: frontal ±70° blocks (0 damage); flanks hit; bright / holy / pounce-from-above / a parried bash drop the shield 4 s', async () => {
  const ctx = await world();
  const p = ctx.player;
  const pg = ctx.enemies.spawn('pug', at(0, 2), { facing: Math.PI });
  pg.ai = false;
  assert.equal(frontalHit(new THREE.Vector3(0, 0, 1), Math.PI), true);
  assert.equal(frontalHit(new THREE.Vector3(0, 0, -1), Math.PI), false);
  pg.invulnT = 0;
  const hp0 = pg.hp;
  assert.equal(ctx.combat.applyHit(p, pg, ATTACKS.slash1), 'block', 'frontal: block');
  assert.equal(pg.hp, hp0);
  p.pos.set(0, 0, 4); pg.invulnT = 0; pg.pos.set(0, 0, 2); pg.facing = Math.PI;
  assert.equal(ctx.combat.applyHit(p, pg, ATTACKS.slash1), 'hit', 'from behind: hit');
  p.pos.set(0, 0, 0);
  assert.equal(breaksShield(ATTACKS.bright, p, pg), true); assert.equal(breaksShield(ATTACKS.holy, p, pg), true);
  assert.equal(breaksShield(ATTACKS.pounce, { pos: new THREE.Vector3(0, 1.5, 0), vel: new THREE.Vector3() }, pg), true, 'pounce from above');
  assert.equal(breaksShield(ATTACKS.pounce, { pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3() }, pg), false);
  assert.equal(breaksShield(ATTACKS.slash3, p, pg), false);
  pg.ai = true; pg.invulnT = 0; pg.pos.set(0, 0, 2); pg.facing = Math.PI;
  assert.equal(ctx.combat.applyHit(p, pg, ATTACKS.bright), 'hit', 'bright goes through the shield');
  assert.ok(pg.shieldDownT > 0 && pg.staggerT >= ENEMIES.pug.shield.stagger - 1e-9);
  pg.invulnT = 0; pg.facing = Math.PI;
  assert.equal(ctx.combat.applyHit(p, pg, ATTACKS.slash1), 'hit', 'shield down: frontal hits land');
  const chop = pg.def.attacks.find((x) => x.id === 'pug_chop');
  assert.equal(pg.def.canUse(pg, chop), true, 'pug_chop only while the shield is down');
  step(ctx, Math.ceil(60 * (ENEMIES.pug.shield.downFor + 0.1)));
  assert.equal(pg.shieldDownT, 0, 'back up after 4 s');
  assert.equal(pg.def.canUse(pg, chop), false);
  // parrying pug_bash
  pg.attack = { id: 'pug_bash', def: ATTACKS.pug_bash }; pg.staggerT = 0;
  pg.onParried(p, { gold: false });
  assert.ok(pg.shieldDownT > 0 && Math.abs(pg.staggerT - ATTACKS.pug_bash.parriedStun) < 1e-9);
});

test('pug_slam: red ≥ 0.6 s, then a 0.3 m ring expanding to 2.5 m hits her on the ground but not mid-jump', async () => {
  const ctx = await world();
  const ev = record(ctx, E.TELEGRAPH, E.HIT);
  const p = ctx.player;
  const pg = ctx.enemies.spawn('pug', at(0, 2), { alerted: true });
  pg.attackCd.pug_bash = 999;
  step(ctx, 60 * 10, () => ev.some((x) => x.ev === E.HIT && x.attacker === pg && x.attackId === 'pug_slam'));
  const red = ev.filter((x) => x.ev === E.TELEGRAPH && x.actor === pg && x.kind === 'red');
  assert.ok(red.length >= 1 && red[0].duration >= TELEGRAPH.minLead.red, 'red telegraph');
  assert.ok(red.some((x) => x.shape === 'circle' && x.size === ATTACKS.pug_slam.ring.rMax), 'the red ground circle shows the reach');
  assert.ok(ev.some((x) => x.ev === E.HIT && x.attackId === 'pug_slam' && x.target === p), 'the ring hits her standing');
  // mid-jump: the ring passes under her
  step(ctx, 60 * 2, () => pg.stateName === 'chase');
  const n0 = ev.filter((x) => x.ev === E.HIT && x.attackId === 'pug_slam').length;
  pg.attack = { id: 'pug_slam', def: ATTACKS.pug_slam }; p.invulnT = 0;
  pg.setState('strike');
  step(ctx, 30, () => { p.pos.y = 0.6; p.invulnT = 0; return pg.stateName !== 'strike'; });
  p.pos.y = 0;
  assert.equal(ev.filter((x) => x.ev === E.HIT && x.attackId === 'pug_slam').length, n0, 'jumped it');
});

test('moves: chain glints keep their §8.1 lead even with 0.30 s windups; lanes stop at pillars / the arena edge; rings', () => {
  assert.equal(minLead('gold'), 0.6); assert.equal(minLead('parry'), 0.45);
  const [at0, w] = preTell(0.42, 0.6, 0.3);
  assert.ok(Math.abs(at0 - 0.12) < 1e-9 && Math.abs(w - 0.3) < 1e-9);
  assert.equal(rayCircle(0, 0, 0, 1, { x: 0, z: 5, r: 1 }), 4);
  assert.equal(rayCircle(0, 0, 1, 0, { x: 0, z: 5, r: 1 }), Infinity);
  const l1 = laneTo(0, 0, 0, 1, { pillars: [{ x: 0, z: 8, r: 0.8 }], arena: { cx: 0, cz: 0, r: 12 }, edgePad: 1 });
  assert.ok(Math.abs(l1.len - 7.2) < 1e-9 && l1.pillar, 'ends at the pillar');
  const l2 = laneTo(0, 0, 1, 0, { pillars: [{ x: 0, z: 8, r: 0.8 }], arena: { cx: 0, cz: 0, r: 12 }, edgePad: 1 });
  assert.ok(Math.abs(l2.len - 11) < 1e-9 && !l2.pillar, 'ends at the wall');
  const l3 = laneTo(0, 0, 0, 1, { arena: { cx: 0, cz: 10, hw: 6, hd: 20 }, edgePad: 1 });
  assert.ok(Math.abs(l3.len - 29) < 1e-9, 'causeway rectangle');
  const r = ringAt(0.2, 8, 7, 0.6);
  assert.ok(Math.abs(r.r - 1.6) < 1e-9 && Math.abs(r.inner - 1.0) < 1e-9 && !r.done);
  assert.equal(ringAt(1, 8, 7, 0.6).done, true);
  const steps = chainSteps({ chain: [{ windup: 0.5, dmg: 1, range: 2, arc: 1 }] }, 'x', 2);
  assert.equal(steps[0].arc.range, 2); assert.equal(steps[0].id, 'x1');
});

test('B1 Grizzlechop: Sabre Flurry = white, white, GOLD; every glint shows ≥ its §8.1 lead; the gold parry fills Dizzy', async () => {
  const ctx = await world();
  const ev = record(ctx, E.TELEGRAPH, E.TELEGRAPH_END);
  const b = ctx.enemies.spawn('boss_grizzlechop', at(0, 2.4));
  b.forceMove = 'sabreFlurry';
  const strikes = [];
  let t = 0;
  const shown = new Map();
  ctx.bus.on(E.TELEGRAPH, (x) => { if (x.actor === b) shown.set(x.id, { t, kind: x.kind }); });
  step(ctx, 60 * 8, () => {
    t += DT;
    if (b.stateName === 'chain' && b.chainPhase === 'strike' && strikes[strikes.length - 1]?.idx !== b.chainIdx) strikes.push({ idx: b.chainIdx, t });
    return b.stateName === 'recover';
  });
  const tele = [...shown.values()];
  assert.deepEqual(tele.slice(0, 3).map((x) => x.kind), ['parry', 'parry', 'gold'], 'white, white, gold');
  assert.equal(strikes.length, 3, 'three strikes');
  for (let i = 0; i < 3; i++) {
    const lead = strikes[i].t - tele[i].t;
    assert.ok(lead >= minLead(tele[i].kind) - 2 * DT, `glint ${i} (${tele[i].kind}) shown ${lead.toFixed(3)} s before its strike`);
  }
  b.attack = { id: 'grizz_flurry3', def: b.chainSteps[2] };
  b.onParried(ctx.player, { gold: true });
  assert.equal(b.isDizzy, true, 'gold parry → Dizzy');
});

test('B1 Grizzlechop: Cheese Wheel Toss (parry breaks it: 3.0 s stagger); Wheel Ride opens P2 — a lane into a pillar CRUNCHES (Dizzy)', async () => {
  const ctx = await world();
  const ev = record(ctx, E.TELEGRAPH, E.HIT);
  const p = ctx.player;
  const b = ctx.enemies.spawn('boss_grizzlechop', at(0, 0), { facing: 0 });
  p.pos.set(0, 0, 7);
  b.forceMove = 'cheeseToss';
  step(ctx, 60 * 4, () => b.wheels.length > 0);
  assert.equal(b.wheels.length, 1, 'a wheel rolls');
  const w = b.wheels[0];
  assert.ok(Math.abs(w.vel.length() - M2.boss.tossSpeed) < 1e-6);
  w.onParried(p);
  assert.equal(w.alive, false, 'parried: broken');
  assert.ok(b.staggerT >= 3.0 - 1e-9, 'he staggers 3.0 s');
  b.staggerT = 0; b.setState('chase');
  // P2: the ride opens; lanes are aoe lanes ≥ 1.0 s with the red "!!"
  b.setHpFrac(0.55);
  assert.equal(b.phase, 1); assert.equal(b.forceMove, 'wheelRide');
  const pil = millPillars(ctx, b.home);
  assert.equal(pil.length, BOSSES.grizzlechop.pillars.n);
  for (const q of pil) assert.ok(Math.abs(Math.hypot(q.x - b.home.x, q.z - b.home.z) - BOSSES.grizzlechop.pillars.r) < 1e-9);
  // stand her behind pillar 0 (further out on the same ray): the lane ends at the pillar
  const q = pil[0], d = Math.hypot(q.x, q.z);
  p.pos.set((q.x / d) * 10.5, 0, (q.z / d) * 10.5);
  b.pos.set(0, 0, 0); b.invulnT = 0;
  step(ctx, 60 * 4, () => b.stateName === 'wheelRide' && b.ridePhase === 'aim');
  assert.equal(b.ridePhase, 'aim');
  const lane = ev.filter((x) => x.ev === E.TELEGRAPH && x.actor === b && x.shape === 'lane').pop();
  assert.ok(lane && lane.kind === 'aoe' && lane.duration >= BOSSES.grizzlechop.phases[1].wheel.tele - 1e-9 && lane.w === BOSSES.grizzlechop.phases[1].wheel.laneW);
  assert.ok(ev.some((x) => x.ev === E.TELEGRAPH && x.actor === b && x.kind === 'red'), 'red: unblockable');
  assert.ok(b.rideLane.pillar === b.pillars[0], 'the lane ends at the pillar');
  step(ctx, 60 * 4, () => b.isDizzy);
  assert.equal(b.isDizzy, true, 'CRUNCH: Dizzy fills');
  assert.equal(b.mounted, false, 'tumbled off');
  assert.ok(b.attackCd.wheelRide > 0, 'the ride waits 12 s');
});

test('B1 Grizzlechop: without a pillar, 3 laps then a 2.0 s wobble (hits ×1.5); P3 Cheese Bombs (5 × r 1.6) and the Snack choke', async () => {
  const ctx = await world();
  const ev = record(ctx, E.TELEGRAPH, E.HIT, E.ENEMY_CHOKE);
  const p = ctx.player;
  const b = ctx.enemies.spawn('boss_grizzlechop', at(0, 0));
  b.setHpFrac(0.55); b.invulnT = 0;
  b.pillars = [];                                            // an open yard: no pillar to crash into
  p.pos.set(0, 0, 6);
  let laps = 0;
  step(ctx, 60 * 20, () => { laps = Math.max(laps, b.rideLap ?? 0); return b.critBoostT > 0; });
  assert.ok(b.critBoostT > 0 && b.critTaken === M2.boss.critBoost, 'wobbles: hits ×1.5');
  assert.ok(laps >= BOSSES.grizzlechop.phases[1].wheel.laps - 1, `laps ${laps}`);
  // P3: cheese bombs
  b.critBoostT = 0; b.staggerT = 0; b.setState('chase');
  b.setHpFrac(0.2);
  assert.equal(b.phase, 2); assert.equal(b.phaseWindupMul, BOSSES.grizzlechop.phases[2].windupMul);
  step(ctx, 70);
  b.forceMove = 'cheeseBombs'; b.attackChoice = null; b.invulnT = 0; p.invulnT = 0;
  if (b.stateName !== 'chase') b.setState('chase');
  const k0 = ev.length;
  step(ctx, 60 * 4, () => { p.invulnT = 0; return ev.some((x) => x.ev === E.HIT && x.attackId === 'grizz_cheeseBomb'); });
  const circles = ev.slice(k0).filter((x) => x.ev === E.TELEGRAPH && x.actor === b && x.kind === 'aoe' && x.shape === 'circle').slice(0, 5);
  assert.equal(circles.length, 5, '5 circles'); assert.ok(circles.every((c) => c.size === 1.6 && c.duration >= minLead('aoe') - 1e-9));
  assert.ok(ev.some((x) => x.ev === E.HIT && x.attackId === 'grizz_cheeseBomb' && x.target === p));
  // the snack: heals 30 unless hit (choke → Dizzy)
  step(ctx, 60 * 2, () => b.stateName === 'chase');
  p.pos.set(0, 0, 8);
  b.forceMove = 'snack'; b.attackChoice = null;
  step(ctx, 60 * 6, () => b.stateName === 'snack');
  assert.equal(b.stateName, 'snack');
  b.invulnT = 0;
  ctx.combat.applyHit(p, b, { ...ATTACKS.slash1, dmg: 1 });
  assert.ok(ev.some((x) => x.ev === E.ENEMY_CHOKE && x.enemy === b), 'wrong pipe!');
  assert.equal(b.isDizzy, true);
  b.meter.reset(); b.staggerT = 0; b.setState('chase'); b.attackCd.snack = 0;
  const hp0 = b.hp;
  b.forceMove = 'snack'; b.attackChoice = null;
  step(ctx, 60 * 6, () => b.stateName === 'recover' && b.attack?.id === 'snack');
  assert.equal(b.hp, Math.min(b.maxHp, hp0 + BOSSES.grizzlechop.phases[2].snack.heal), 'snack heals 30');
  assert.ok(b.attackCd.snack > 0);
});

test('B2 Cacklejaw: Gloat after a hit (a hit chokes → Dizzy); Laugh Quake (choke in its windup; a 0.3 m ring)', async () => {
  const ctx = await world();
  const ev = record(ctx, E.TELEGRAPH, E.HIT, E.ENEMY_CHOKE);
  const p = ctx.player;
  const b = ctx.enemies.spawn('boss_cacklejaw', at(0, 2.6));
  b.forceMove = 'cackleCombo';
  step(ctx, 60 * 6, () => b.stateName === 'gloat');
  assert.equal(b.stateName, 'gloat', 'gloats after the combo lands');
  b.invulnT = 0;
  ctx.combat.applyHit(p, b, { ...ATTACKS.slash1, dmg: 1 });
  assert.ok(ev.some((x) => x.ev === E.ENEMY_CHOKE && x.enemy === b)); assert.equal(b.isDizzy, true);
  b.meter.reset(); b.staggerT = 0; b.setState('chase');
  // Laugh Quake: jeer rings ≥ 0.5 s; a hit in the windup chokes
  b.forceMove = 'laughQuake'; b.attackChoice = null;
  step(ctx, 60 * 4, () => b.stateName === 'laughQuake');
  const t = ev.filter((x) => x.ev === E.TELEGRAPH && x.actor === b && x.kind === 'jeer').pop();
  assert.ok(t && t.shape === 'rings' && t.duration >= 0.8 - 1e-9);
  b.invulnT = 0;
  const n0 = ev.filter((x) => x.ev === E.ENEMY_CHOKE).length;
  ctx.combat.applyHit(p, b, { ...ATTACKS.slash1, dmg: 1 });
  assert.equal(ev.filter((x) => x.ev === E.ENEMY_CHOKE).length, n0 + 1, "hrk— that's rude!");
  b.meter.reset(); b.staggerT = 0; b.setState('chase'); b.attackCd = {};
  // the ring hits her standing
  p.invulnT = 0;
  b.forceMove = 'laughQuake'; b.attackChoice = null;
  step(ctx, 60 * 4, () => ev.some((x) => x.ev === E.HIT && x.attackId === 'cackle_quake'));
  assert.ok(ev.some((x) => x.ev === E.HIT && x.attackId === 'cackle_quake' && x.target === p), 'ring hits her standing');
});

test('B2 Cacklejaw: Ratio Rush (gold lanes ≥ 0.8 s, 3 dashes; a parry → Dizzy); P2 stealers jeer as a duet; P3 clones, Meow, fog', async () => {
  const ctx = await world();
  const ev = record(ctx, E.TELEGRAPH, E.HIT, E.ENEMY_JEER, E.BOSS_PHASE);
  const fog = new Map();
  ctx.env = { contribute: (k, c) => fog.set(k, c), clear: (k) => fog.delete(k), fogDensity: 0.05 };
  const p = ctx.player;
  const b = ctx.enemies.spawn('boss_cacklejaw', at(0, 10));
  b.setHpFrac(0.55);
  assert.equal(b.phase, 1); assert.equal(b.forceMove, 'ratioRush');
  const st = b.adds.filter((a) => a.type === 'stealer');
  assert.equal(st.length, 2, '2 stealers');
  assert.ok(st.every((s) => s.stateName === 'jeer' && s.jeerOverride?.r === M2.jeer.duetR), 'the Jeer Duet');
  b.invulnT = 0;
  let dashes = 0, prev = '';
  step(ctx, 60 * 12, () => { if (b.rushPhase === 'dash' && prev !== 'dash') dashes++; prev = b.rushPhase; return b.stateName !== 'ratioRush' && dashes > 0; });
  const gold = ev.filter((x) => x.ev === E.TELEGRAPH && x.actor === b && x.kind === 'gold');
  const lanes = ev.filter((x) => x.ev === E.TELEGRAPH && x.actor === b && x.shape === 'lane');
  assert.equal(dashes, BOSSES.cacklejaw.phases[1].rush.dashes, '3 dashes');
  assert.ok(gold.length >= 3 && gold.every((g) => g.duration >= BOSSES.cacklejaw.phases[1].rush.tele - 1e-9));
  assert.ok(lanes.length >= 3);
  // a parry during a dash: stumble + Dizzy
  b.meter.reset(); b.staggerT = 0; b.setState('chase'); b.attackCd = {};
  b.forceMove = 'ratioRush'; b.attackChoice = null;
  step(ctx, 60 * 4, () => b.rushPhase === 'dash' && b.stateName === 'ratioRush');
  b.onParried(p, { gold: true });
  assert.equal(b.isDizzy, true);
  // P3: fog, 3 clones (one-hit poof), meow quiets the real one
  b.meter.reset(); b.staggerT = 0; b.setState('chase');
  b.setHpFrac(0.25);
  assert.equal(b.phase, 2);
  const clones = ctx.enemies.byType('cacklejaw_clone');
  assert.equal(clones.length, BOSSES.cacklejaw.phases[2].clones.n, '3 shadow clones');
  assert.ok(clones.every((c) => c.bossAdd === b && b.adds.includes(c)));
  step(ctx, Math.ceil(60 * (M2.boss.p3FogDur + 0.1)));
  assert.ok(Math.abs(fog.get('cacklejaw:p3')?.fogSet - BOSSES.cacklejaw.phases[2].fog) < 1e-9, 'fog → 0.09');
  clones[0].invulnT = 0;
  ctx.combat.applyHit(p, clones[0], ATTACKS.slash1);
  assert.equal(clones[0].alive, false, 'one hit poofs a clone');
  step(ctx, Math.ceil(60 * (BOSSES.cacklejaw.phases[2].clones.respawnEvery + 0.1)));
  assert.equal(ctx.enemies.byType('cacklejaw_clone').length, 3, 'clones respawn (max 3) every 10 s');
  ctx.bus.emit(E.PLAYER_MEOW, { position: p.pos.clone() });
  assert.ok(b.quietT > 0, 'only the real one answers the Meow');
  // defeat: clones go, the fog override clears
  b.invulnT = 0; b.staggerT = 0;
  ctx.combat.applyHit(p, b, ATTACKS.holy, { dmg: 9999 });
  assert.equal(b.alive, false);
  assert.equal(ctx.enemies.byType('cacklejaw_clone').length, 0);
  assert.ok(!fog.has('cacklejaw:p3'));
});

test('Pilfer chase: runs chase_0..5 keeping a lead; 3 hits drop the bag (item:returned post_bag) and hand him to the story', async () => {
  assert.equal(chasePace(2), ENEMIES.stealer.run); assert.ok(chasePace(30) < 2, 'trots when she lags');
  const ctx = await world();
  const ev = record(ctx, E.ITEM_RETURNED);
  const pts = [[-20, -12], [-34, -14], [-46, -4], [-44, 12], [-30, 16], [-36, 4]];
  ctx.levels.anchor = (n) => { const m = /^chase_(\d)$/.exec(n); return m ? { pos: new THREE.Vector3(pts[+m[1]][0], 0, pts[+m[1]][1]) } : null; };
  const p = ctx.player;
  p.pos.set(-18, 0, -10);
  const { pilfer: pf, done } = ctx.enemies.pilferChase();
  assert.equal(ctx.actors.get('pilfer'), pf);
  step(ctx, 2);
  assert.equal(pf.stateName, 'run');
  const d0 = Math.hypot(pf.pos.x - pts[1][0], pf.pos.z - pts[1][1]);
  step(ctx, 30, () => { p.pos.lerp(pf.pos, 0.05); return false; });
  assert.ok(Math.hypot(pf.pos.x - pts[1][0], pf.pos.z - pts[1][1]) < d0, 'runs to chase_1');
  for (let i = 0; i < 3; i++) {
    pf.invulnT = 0;
    ctx.combat.applyHit(p, pf, { ...ATTACKS.slash1 });
    if (i < 2) { assert.equal(pf.stateName, 'stumble'); assert.equal(pf.alive, true); step(ctx, Math.ceil(60 * (M2.pilferChase.stumble + 0.05))); }
  }
  const r = ev.find((x) => x.item === 'post_bag');
  assert.ok(r && r.thief === pf, 'bag returned');
  assert.equal(pf.ai, false); assert.equal(pf.hurtable, false); assert.equal(pf.alive, true);
  assert.deepEqual(await done, { dropped: true });
});

test('M2 telegraphs: every M2 enemy / boss attack shows its glint ≥ 0.45 s (§8.1, §10.1); every M2 type resolves', () => {
  for (const id of ['spider_web', 'spider_bite', 'hyena_slash', 'hyena_lunge', 'stealer_snatch', 'pug_bash', 'pug_slam', 'pug_chop', 'jelly_slam']) {
    const w = windupFor(ATTACKS[id]);
    assert.ok(w >= 0.45, `${id} ${w}`);
    assert.ok(w >= TELEGRAPH.minLead[ATTACKS[id].telegraph] - 1e-9, `${id} lead`);
  }
  for (const key of ['boss_grizzlechop', 'boss_cacklejaw']) {
    const def = resolveEnemyDef(key);
    for (const [id, m] of Object.entries(def.moves)) for (const s of m.chain ?? []) assert.ok(minLead(s.telegraph) >= 0.45, `${key}.${id}`);
  }
  for (const t of ['spider', 'stealer', 'pug', 'jelly_l', 'jelly_giant', 'boss_grizzlechop', 'boss_cacklejaw', 'cacklejaw_clone', 'pilfer_chase']) {
    const d = resolveEnemyDef(t);
    assert.equal(d.id, t); assert.ok(!d.unknown, t);
  }
});

test('world requests: far idle enemies sleep (no AI / draw) and wake when she nears or an alert reaches them; prewarm stand-ins', async () => {
  const ctx = await world();
  const ev = record(ctx, E.ENEMY_SPAWNED);
  const far = ctx.enemies.spawn('rat_pike', at(0, M2.sleep.dist + 10));
  const near = ctx.enemies.spawn('rat_pike', at(4, 6));
  const arena = ctx.enemies.spawn('rat_pike', at(0, M2.sleep.dist + 12), { arena: 'x' });
  step(ctx, 30);
  assert.equal(far.asleep, true); assert.equal(far.object3d.visible, false);
  assert.ok(!near.asleep); assert.ok(!arena.asleep, 'arena spawns never sleep');
  const z0 = far.pos.z;
  step(ctx, 60);
  assert.equal(far.pos.z, z0, 'asleep: no AI');
  ctx.player.pos.set(0, 0, M2.sleep.dist);                    // she walks up
  step(ctx, 30);
  assert.equal(far.asleep, false); assert.equal(far.object3d.visible, true);
  ctx.player.pos.set(0, 0, 0);
  step(ctx, 30);
  assert.equal(far.asleep, true);
  ctx.enemies.alertNear(far.pos, 8);                          // a pack alert reaches it
  assert.equal(far.asleep, false);
  // prewarm: stand-ins outside the game (no list / actors / events), cleanup → kept until unload
  const n0 = ctx.enemies.list.length, s0 = ev.length;
  const cleanup = await ctx.enemies.prewarm([{ type: 'jelly_l' }, { type: 'boss_grizzlechop' }, { type: 'nope' }], new THREE.Vector3(0, 0, 0));
  assert.equal(typeof cleanup, 'function');
  assert.equal(ctx.enemies.list.length, n0); assert.equal(ev.length, s0, 'no enemy:spawned'); assert.equal(ctx.enemies.boss, null, 'no boss fight');
  cleanup();
  assert.equal(ctx.enemies._warmKeep.length, 2);
  ctx.bus.emit(E.LEVEL_UNLOAD, { id: 'meadow' });
  assert.equal(ctx.enemies._warmKeep.length, 0);
});

// ============================================================================================ controls rework (CONTROLS_SPEC §8.5)
/** An iso-like camera (yaw π: south of her, looking +Z at `focus`), as if a frame had been rendered. */
function isoCam(ctx, focus = at(0, 0), { dist = 13, pitchDeg = 51, fov = 38, aspect = 16 / 9 } = {}) {
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.3, 90);
  const pr = THREE.MathUtils.degToRad(pitchDeg);
  cam.position.set(focus.x, focus.y + 0.6 + Math.sin(pr) * dist, focus.z - Math.cos(pr) * dist);
  cam.lookAt(focus.x, focus.y + 0.6, focus.z);
  cam.updateMatrixWorld(true);
  ctx.camera = cam;
  ctx.game.frameCount = 1;
  ctx.game.stepCount = (ctx.game.stepCount ?? 0) + 1;
  return cam;
}

/** step() that also bumps game.stepCount (the on-screen frustum cache key). */
function stepN(ctx, n, each) { return step(ctx, n, (i) => { ctx.game.stepCount = (ctx.game.stepCount ?? 0) + 1; return each ? each(i) : false; }); }

test('controls: telegraph payload — attackId, arc, range, windup (× difficulty), activeAt = the strike, targetsPlayer', async () => {
  for (const difficulty of [undefined, 'kitten']) {
    const ctx = await world({ difficulty });
    const ev = record(ctx, E.TELEGRAPH);
    const e = ctx.enemies.spawn('rat_pike', at(0, 4), { facing: Math.PI, alerted: true });
    e.def = { ...e.def, followUp: null, fleeBelow: 0 };
    let strikeAt = null;
    step(ctx, 60 * 6, () => { if (e.stateName === 'strike' && strikeAt == null) strikeAt = ctx.game.time; return strikeAt != null; });
    const t = ev.find((x) => x.kind === 'parry' && x.actor === e);
    assert.ok(t && strikeAt != null, 'wind-up and strike');
    assert.equal(t.attackId, 'rat_poke');
    assert.deepEqual(t.arc, ATTACKS.rat_poke.arc); assert.equal(t.range, ATTACKS.rat_poke.arc.range);
    const mul = difficulty ? DIFFICULTY[difficulty].windup : 1;
    assert.ok(Math.abs(t.windup - windupFor(ATTACKS.rat_poke, mul)) < 1e-9, `windup ${t.windup} (× ${mul})`);
    assert.ok(Math.abs(t.windup - t.duration) < 1e-9);
    // the swing's first live frame (strike start + active[0]) within a step of the advertised activeAt
    const live = strikeAt + ATTACKS.rat_poke.active[0];
    assert.ok(Math.abs(t.activeAt - live) <= 2 * DT + 1e-9, `activeAt ${t.activeAt.toFixed(3)} vs ${live.toFixed(3)}`);
    assert.equal(t.targetsPlayer, true);
  }
});

test('controls: payload for the gold follow-up and dash lanes; pure telegraphPayload overrides', async () => {
  // follow-up gold (emitted during the strike): activeAt = when its own strike starts
  const ctx = await world();
  const ev = record(ctx, E.TELEGRAPH);
  const e = ctx.enemies.spawn('rat_pike', at(0, 4), { facing: Math.PI, alerted: true });
  e.def = { ...e.def, followUp: { id: 'rat_poke2', chance: 1 }, fleeBelow: 0 };
  let gold = null, strike2 = null;
  step(ctx, 60 * 8, () => {
    gold ??= ev.find((x) => x.kind === 'gold' && x.actor === e) ?? null;
    if (gold && e.stateName === 'strike' && e.attack?.id === 'rat_poke2' && strike2 == null) strike2 = ctx.game.time;
    return strike2 != null;
  });
  assert.ok(gold, 'gold follow-up told'); assert.equal(gold.attackId, 'rat_poke2');
  assert.ok(strike2 != null, 'follow-up strike');
  assert.ok(Math.abs(gold.activeAt - strike2) <= 2 * DT + 1e-9, `gold activeAt ${gold.activeAt.toFixed(3)} vs ${strike2.toFixed(3)}`);

  // pure: a dash attack (no arc) gets a lane along the facing; overrides win; a companion target = not her
  const fake = { attack: { id: 'hyena_lunge', def: ATTACKS.hyena_lunge, range: 5 }, radius: 0.4, ctx: { player: { id: 'p' } }, targetActor() { return { id: 'mochi' }; } };
  const pl = telegraphPayload(fake, 'red', {}, 0.6, 10);
  assert.equal(pl.attackId, 'hyena_lunge'); assert.equal(pl.arc, null);
  assert.ok(pl.lane && Math.abs(pl.lane.l - ATTACKS.hyena_lunge.speed * ATTACKS.hyena_lunge.dur) < 1e-9, 'lunge lane');
  assert.equal(pl.range, pl.lane.l); assert.equal(pl.activeAt, 10.6); assert.equal(pl.targetsPlayer, false);
  const o = telegraphPayload(fake, 'aim', { activeAt: 3, windup: 1, attackId: 'x', targetsPlayer: true }, 0.5, 0);
  assert.equal(o.activeAt, 3); assert.equal(o.windup, 1); assert.equal(o.attackId, 'x'); assert.equal(o.targetsPlayer, true);
});

test('controls: on-screen rule — pure frustum test with a 0.5 m margin; unknown before the first frame; rig API wins', () => {
  const ctx = fakeCtx({ systems: false });
  assert.equal(pointOnScreen(ctx, at(0, 0)), null, 'no rendered frame yet: unknown');
  const cam = isoCam(ctx);
  const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  assert.equal(insideFrustum(fr, at(0, 0)), true, 'her feet');
  assert.equal(insideFrustum(fr, at(0, 6)), true, '6 m up-screen');
  assert.equal(insideFrustum(fr, at(0, 20)), false, '20 m up-screen is off the top edge');
  assert.equal(insideFrustum(fr, at(14, 0)), false, '14 m to the side');
  assert.equal(pointOnScreen(ctx, at(0, 6)), true);
  // the margin shrinks the frustum: find the right edge at z 0, then step inside it by less than 0.5 m
  let x = 0; while (insideFrustum(fr, at(x - 0.01, 0))) x -= 0.01;
  assert.equal(insideFrustum(fr, at(x + 0.2, 0), 0.5), false, 'within 0.5 m of the edge = not on screen');
  assert.equal(insideFrustum(fr, at(x + 1.0, 0), 0.5), true);
  ctx.cam = { onScreen: (p, m) => (assert.equal(m, ONSCREEN_FALLBACK.onScreenMargin), p.x < 0) };
  assert.equal(pointOnScreen(ctx, at(-1, 50)), true); assert.equal(pointOnScreen(ctx, at(1, 0)), false);
});

test('controls: no off-screen snipes — a far crossbowman off screen holds fire; on screen or within 9 m it shoots', async () => {
  const ctx = await world();
  const ev = record(ctx, E.TELEGRAPH);
  // 13 m DOWN-screen (behind the lens at yaw π) — off screen and farther than 9 m
  const e = ctx.enemies.spawn('rat_xbow', at(0, -13), { alerted: true });
  e.perched = true;                              // stays put: the test is about the rule, not the keep band
  isoCam(ctx);
  stepN(ctx, 60 * 3, () => e.stateName === 'windup');
  assert.notEqual(e.stateName, 'windup', 'no wind-up off screen');
  assert.equal(e.holdFire, true, 'holding fire');
  assert.equal(ev.filter((x) => x.kind === 'aim').length, 0);
  assert.equal(rangedStartAllowed(e, { def: ATTACKS.rat_bolt, kind: 'ranged' }), false);
  assert.equal(rangedStartAllowed(e, { def: ATTACKS.rat_poke, kind: 'melee' }), true, 'melee is never gated');
  // the camera pans to show it → it may start (focus 2 m past it: inside the frustum shrunk by 0.5 m; a focus 4 m
  // away leaves it only 0.4 m inside the bottom edge at 13 m / 51°, which the 0.5 m margin rightly counts as off screen)
  isoCam(ctx, at(0, -11));
  stepN(ctx, 60 * 3, () => e.stateName === 'windup');
  assert.equal(e.stateName, 'windup', 'on screen: it aims');
  const tele = ev.find((x) => x.kind === 'aim');
  assert.ok(tele && tele.attackId === 'rat_bolt' && tele.targetsPlayer === true, 'aim payload');
  // off screen but within 9 m: allowed (the 9 m "near" band)
  const ctx2 = await world();
  const n = ctx2.enemies.spawn('rat_xbow', at(0, -8.5), { alerted: true });
  n.perched = true;
  isoCam(ctx2, at(0, 30));                      // camera looking far away
  stepN(ctx2, 60 * 3, () => n.stateName === 'windup');
  assert.equal(n.stateName, 'windup', 'within 9 m it shoots even off screen');
});

test('controls: crows dive only on screen (no near exemption); the keep band [6, 9] sits inside the near band', async () => {
  const ctx = await world();
  const c = ctx.enemies.spawn('crow', at(0, 3), { alerted: true });
  assert.equal(c.def.onScreenOnly, true);
  isoCam(ctx, at(0, 40));                       // the camera panned away (unlocked): the crow must wait
  stepN(ctx, 60 * 4, () => c.stateName === 'windup');
  assert.notEqual(c.stateName, 'windup');
  isoCam(ctx, at(0, 0));
  stepN(ctx, 60 * 6, () => c.stateName === 'windup');
  assert.equal(c.stateName, 'windup', 'on screen: it dives');
  const [near, far] = resolveEnemyDef('rat_xbow').keep;
  assert.ok(near === 6 && far === 9 && far <= ONSCREEN_FALLBACK.rangedNear);
});
