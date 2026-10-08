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
import { Enemy, windupFor, defaultShape } from '../../src/enemies/Enemy.js';
import { resolveEnemyDef, TYPES, countsTowardCap } from '../../src/enemies/EnemyManager.js';
import { CLIP_MAPS, clipNames, clipKey, isSpec, rigFor, clipsFor, subclip, specDuration } from '../../src/enemies/clipMaps.js';
import { TUNING } from '../../src/enemies/tuning.js';
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
  assert.deepEqual(xbow.keep, [7, 11]); assert.equal(xbow.attacks[0].id, 'rat_bolt');
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
  const e = ctx.enemies.spawn('crow', at(3, 6));
  assert.ok(e.flying && e.tags.has('flyer'));
  assert.ok(Math.abs(e.pos.y - ENEMIES.crow.fly.alt) < 1e-9, 'spawns at its altitude');
  assert.equal(e.resolveIncoming(ctx.player, ATTACKS.slash1, new THREE.Vector3()), 'immune');
  assert.equal(e.resolveIncoming({ isProjectile: true, owner: ctx.player }, ATTACKS.holyWave, new THREE.Vector3()), 'hit', 'projectiles reach it');
  const p = ctx.player;
  step(ctx, 60 * 8, () => e.stateName === 'windup');
  assert.equal(e.stateName, 'windup');
  const tele = ev.find((x) => x.kind === 'shadow');
  assert.ok(tele && tele.shape === 'shadow' && Math.abs(tele.duration - 1.0) < 1e-9 && tele.pos === e.diveTarget);
  let mid = null, frozen = null;
  step(ctx, 60 * 2, (i) => {
    p.pos.x += 0.04;
    if (e.stateT > 0.3 && !mid) mid = e.diveTarget.clone();
    if (e.stateT > 0.62 && !frozen) frozen = e.diveTarget.clone();
    if (e.stateName === 'windup' && e.stateT > 0.95) assert.ok(e.diveTarget.distanceTo(frozen) < 1e-9, 'frozen after 60%');
    return e.stateName !== 'windup';
  });
  assert.ok(mid && frozen && mid.distanceTo(frozen) > 0.1, 'tracks her for the first 60%');
  step(ctx, 60 * 3, () => e.stateName === 'peck');
  assert.equal(e.stateName, 'peck');
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
