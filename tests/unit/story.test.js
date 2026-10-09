// tests/unit/story.test.js  (owner: story) — U13 (cutscene data), U14 (strings), the §5.1 step runner, StoryManager
// (queue, skip, placeholders, chained scenes), Midnight Practice step logic, the §6 bark gate and the CS-02 / CS-03
// staging maths. Pure node: fakeCtx + stubs for camera / levels / audio / fx.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { fakeCtx } from './_fakeCtx.mjs';
import { E } from '../../src/core/events.js';
import { HOMAGE_LINES, PLAYER } from '../../src/core/config.js';
import { Actor } from '../../src/core/Actor.js';
import { ScriptedActorMixin } from '../../src/core/ScriptedActor.js';
import { S, t, has, pick, fill, text, speakerName } from '../../src/story/strings.js';
import { Cutscene, STEP_TYPES, END_KEYS, walkSteps, sampleKeys, revealTime, isInstant, layoutPoint, spawnKind, isCat } from '../../src/story/Cutscene.js';
import { StoryManager, chapterInfo, chapterOf, BOSS_SCENES, SKIP_HOLD } from '../../src/story/StoryManager.js';
import { CUTSCENES, PLACEHOLDER_ENDS, placeholderScene } from '../../src/story/cutscenes/index.js';
import { PracticeLog, TUTORIAL_STEPS, PRACTICE, inPractice, HINTS } from '../../src/story/tutorial.js';
import { BarkGate, CLEM_BARKS, ENEMY_BARKS, BOSS_BARKS, enemyType, bossKey } from '../../src/story/dialogue/barks.js';
import { U as HORDE_U, LAT, MARK, FACE as CS02_FACE, FILES, CS02_CAST } from '../../src/story/cutscenes/cs02.js';
import { CS03_MARKS, NET } from '../../src/story/cutscenes/cs03.js';
import { titlePulse, TITLE_PULSE } from '../../src/story/cutscenes/cs00.js';
import { glyphs, revealHtml, visibleLength } from '../../src/story/Overlay.js';
import { say, along, unit, yawOf } from '../../src/story/cutscenes/lib.js';
import { CUES } from '../../src/audio/cues.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ====================================================================================================== strings (U14)
test('strings: t / has / fill / text / speakerName; missing keys come back as the key', () => {
  assert.equal(t('cs03.1'), 'Day one of rescuing everyone. Morale: high.');
  assert.equal(t('nope.key'), 'nope.key');
  assert.equal(t('toast.kitten', { n: 2, max: 3 }), 'Lost kitten found! (2/3)');   // M2: the level count, like the HUD
  assert.equal(fill('{a}-{b}', { a: 1 }), '1-{b}');
  assert.ok(has('ch.prologue') && !has('ch.zzz'));
  assert.equal(text('cs01.caption'), 'Meow Island. The eve of Knighting Day.');
  assert.equal(text('literal words'), 'literal words');
  assert.equal(speakerName('swordcat'), 'Clem');
  assert.equal(speakerName('squire_3'), 'Squire');
  assert.equal(speakerName('hyena_4'), 'Hyena');
  assert.equal(speakerName('mystery'), 'Mystery');
});

test('U14: with HOMAGE_LINES = false no homage text is reachable', () => {
  assert.equal(HOMAGE_LINES, false);
  let homage = 0;
  for (const [k, row] of Object.entries(S)) {
    assert.equal(typeof row.default, 'string', `${k}: default text`);
    if (row.homage) { homage++; assert.equal(t(k), row.default, `${k} resolves to the default`); assert.equal(pick(row, true), row.homage); }
  }
  assert.ok(homage >= 12, '§4.4 lists 12 homage rows');
});

/** Flags (§19.7) and other dotted names that are not strings keys. */
/** Files whose dotted ids are sound ids, not strings keys (audio's cue sheets `cs09.roar`, shop sounds `shop.open`…). */
const CUE_FILES = { has: (rel) => rel.startsWith('src/audio/') };
const NOT_KEYS = /^(prologue|meadow|forest|town|gate|bog|keep|ending|seen|story)\.(armour|tutorial|done|pudding|mochi|sage|camp|boss|marmalade|letters|tofu|earlgrey|clover|free|pip|pin|line|pearl|keys|brutus|seen|card|gate)\b/;
const KEY_RE = /['"`]((?:tut|obj|prompt|toast|bark|kitten|hub|letter|ch|region|name|menu|pause|settings|results|life|gameover|loading|meme|ach|shop|board|difficulty|vigil|hud|credits|title|game|newgame|memecam|rotate|cs\d\d[a-z]?|g\d\d|d\d\d|grizzlechop|cacklejaw|pilfer|brutus|barkus|postcredits|ending)\.[\w.]*\w)['"`]/g;

test('U14: every strings key used anywhere in src/ exists in strings.js', () => {
  const missing = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.js') && !CUE_FILES.has(path.relative(ROOT, p).split(path.sep).join('/'))) for (const m of fs.readFileSync(p, 'utf8').matchAll(KEY_RE)) {
        const k = m[1];
        if (!has(k) && !NOT_KEYS.test(k) && !CUES[k]) missing.push(`${path.relative(ROOT, p)}: ${k}`);
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  assert.deepEqual([...new Set(missing)], [], 'keys missing from src/story/strings.js:\n' + missing.join('\n'));
});

test('§6: every bark, boss line, tutorial prompt, hint and placeholder toast is a strings key', () => {
  for (const [k, row] of Object.entries(CLEM_BARKS)) { for (const key of row.keys) assert.ok(has(key), `bark ${k}: ${key}`); if (row.first) assert.ok(has(row.first)); }
  for (const rows of Object.values(ENEMY_BARKS)) for (const keys of Object.values(rows)) for (const key of keys) assert.ok(has(key), key);
  for (const b of Object.values(BOSS_BARKS)) for (const key of [b.intro, b.early, ...Object.values(b.phases ?? {})].filter(Boolean)) assert.ok(has(key), key);
  for (const s of TUTORIAL_STEPS) assert.ok(has(s.textKey), s.textKey);
  for (const h of HINTS) assert.ok(has(h.key), h.key);
  for (const row of Object.values(PLACEHOLDER_ENDS)) for (const k of row.toasts ?? []) assert.ok(has(k), k);
  for (const k of ['tut.done', 'tut.skipped', 'tut.skip', 'tut.title', 'prompt.skip', 'title.prompt', 'game.title', 'game.subtitle', 'toast.mochi', 'cs03b.1']) assert.ok(has(k), k);
});

// ====================================================================================================== cutscene data (U13)
const ALL = Object.entries(CUTSCENES);

test('U13: registry ids match, only known step types, every say key exists, every scene has an end', () => {
  assert.ok(ALL.length >= 7, 'M1 scenes registered');
  for (const id of ['cs00', 'cs01', 'g01', 'cs02', 'cs03', 'd01']) assert.ok(CUTSCENES[id], `${id} authored`);
  for (const [id, def] of ALL) {
    assert.equal(def.id, id, `${id}: id field`);
    assert.ok(def.end && typeof def.end === 'object', `${id}: end block`);
    for (const k of Object.keys(def.end)) assert.ok(END_KEYS.includes(k), `${id}: end key ${k}`);
    walkSteps(def.steps, (s, p) => {
      assert.ok(s && STEP_TYPES.includes(s.t), `${id} ${p}: step type ${s?.t}`);
      if (s.t === 'say') { assert.ok(has(s.key), `${id} ${p}: say key ${s.key}`); assert.ok(typeof s.who === 'string' || typeof s.who === 'function', `${id} ${p}: who`); }
      if (s.t === 'ui') {
        for (const f of ['caption', 'press']) if (typeof s[f] === 'string') assert.ok(has(s[f]), `${id} ${p}: ${f} ${s[f]}`);
        if (s.title?.text) assert.ok(has(s.title.text), `${id} ${p}: title`);
      }
      if (s.t === 'cam' && s.preset) assert.ok(['MEME_LOOP', 'REVERSE_HORDE', 'PULLBACK', 'SELFIE', 'WHIP_FALL', 'CRANE_DOWN', 'ECU_EYES', 'TWO_SHOT_LOW', 'HERO_LOW', 'FLIGHT_ORBIT'].includes(s.preset), `${id} ${p}: preset ${s.preset}`);
      if (s.t === 'spawn' && s.asset) assert.ok(fs.existsSync(path.join(ROOT, 'public/assets', s.asset)), `${id} ${p}: ${s.asset}`);
    });
  }
});

test('U13: every scene turns the letterbox off and hands the camera back (ambient scenes never take it)', () => {
  for (const [id, def] of ALL) {
    assert.notEqual(def.end.ui?.letterbox, true, `${id}: letterbox stays on`);
    if (def.kind === 'ambient') { assert.equal(def.end.cam, false, `${id}: ambient leaves the camera alone`); continue; }
    assert.ok(def.end.cam === 'follow' || def.end.cam?.mode === 'follow' || (def.end.cam === false && def.end.play), `${id}: camera handback (end.cam ${def.end.cam})`);
    for (const k of def.end.toasts ?? []) assert.ok(has(k), `${id}: toast ${k}`);
  }
});

test('§19.7: the M1 scenes set their flags (CS-01 armour, CS-02 done, CS-03 netted, D-01 mochi)', () => {
  assert.equal(CUTSCENES.cs01.end.flags['prologue.armour'], true);
  assert.equal(CUTSCENES.cs02.end.flags['prologue.done'], true);
  assert.deepEqual(CUTSCENES.cs02.end.load, { level: 'meadow', spawn: 'start' });
  assert.equal(CUTSCENES.cs03.end.flags['meadow.pudding'], 'netted');
  assert.deepEqual(CUTSCENES.cs03.end.arena, { id: 'glade', lock: true });
  assert.equal(CUTSCENES.cs03.end.objective.needClear, 'glade');
  assert.equal(CUTSCENES.d01.end.flags['meadow.mochi'], true);
  assert.deepEqual(CUTSCENES.d01.end.toasts, ['toast.mochi']);
  assert.ok(CUTSCENES.cs01.prologue && CUTSCENES.cs02.prologue && CUTSCENES.g01.prologue, 'the prologue is skippable on the first viewing');
  assert.equal(CUTSCENES.cs03.prologue, undefined, 'CS-03 is skippable only after a viewing');
  assert.equal(CUTSCENES.g01.inputSkip, 1.0, 'G-01: any input after 1.0 s');
});

test('placeholders: later-milestone scenes apply their §5.4 end state; boss scenes map from boss ids', () => {
  for (const [id, row] of Object.entries(PLACEHOLDER_ENDS)) {
    const def = placeholderScene(id);
    assert.equal(def.id, id); assert.ok(def.placeholder); assert.equal(def.end.cam, 'follow');
    for (const [k, v] of Object.entries(row.flags ?? {})) assert.equal(def.end.flags[k], v);
  }
  for (const id of ['cs05', 'cs09', 'cs10', 'd02', 'cs04', 'd03', 'cs06', 'cs07', 'd06', 'cs08', 'g02']) assert.ok(!PLACEHOLDER_ENDS[id], `${id} is authored (M2)`);
  assert.equal(placeholderScene('cs12').end.flags['bog.done'], true);
  assert.equal(typeof placeholderScene('cs15').end.call, 'function');
  assert.deepEqual(BOSS_SCENES, { grizzlechop: 'cs05', cacklejaw: 'cs09', brutus: 'd05' });
});

// ====================================================================================================== pure runner helpers
test('runner helpers: sampleKeys, revealTime, isInstant, layoutPoint, spawnKind, isCat', () => {
  assert.ok(Math.abs(sampleKeys([0, 1], 0.5) - 0.5) < 1e-9);
  assert.ok(Math.abs(sampleKeys([0, 0.15, 0], 0.5) - 0.15) < 1e-9);
  assert.equal(sampleKeys(0.3, 0.9), 0.3);
  assert.equal(revealTime(30, 1), 1);
  assert.equal(revealTime(30, 2), 0.5);
  assert.ok(isInstant({ t: 'flag' }) && !isInstant({ t: 'say' }) && !isInstant({ t: 'wait', dur: 1 }) && isInstant({ t: 'actor', id: 'x', pose: 'sit' }));
  assert.ok(!isInstant({ t: 'actor', id: 'x', moveTo: [0, 0] }));
  const ring = layoutPoint({ at: [0, 0], layout: 'ring', r: 2 }, 1, 4);
  assert.ok(Math.abs(Math.hypot(ring[0], ring[1]) - 2) < 1e-9);
  const ctx = fakeCtx({ systems: false });
  assert.equal(spawnKind(ctx, { type: 'hyena' }), 'enemy');
  assert.equal(spawnKind(ctx, { type: 'cacklejaw' }), 'enemy');
  assert.equal(spawnKind(ctx, { type: 'pudding' }), 'npc');
  assert.equal(spawnKind(ctx, { id: 'squire_1', type: 'npc' }), 'npc');
  assert.equal(spawnKind(ctx, { prop: 'signpost' }), 'prop');
  assert.equal(spawnKind(ctx, { asset: 'models/x.glb' }), 'asset');
  assert.equal(spawnKind(ctx, { build: () => null }), 'object');
  assert.ok(isCat(ctx, { npcId: 'pearl', faction: 'neutral' }) && !isCat(ctx, { npcId: 'pudding' }) && !isCat(ctx, { faction: 'enemy' }));
});

// ====================================================================================================== the runner, live
class Cat extends ScriptedActorMixin(Actor) {
  constructor(ctx) { super(ctx, { faction: 'player' }); this.poses = []; this.emotes = []; this.outfit = 'armour'; }
  onPose(n) { this.poses.push(n); }
  onEmote(n) { this.emotes.push(n); }
  update(dt) { if (this.scripted) { this.scriptedStep(dt); this.pos.addScaledVector(this.vel, dt); } }
  teleport({ pos, facing }) { this.pos.copy(pos); this.facing = facing; }
  setOutfit(o) { this.outfit = o; }
}

function storyCtx() {
  const ctx = fakeCtx({ systems: false });
  const shots = [], music = [], sounds = [], envs = [];
  ctx.player = new Cat(ctx);
  ctx.actors.register(ctx.player, 'swordcat');
  ctx.cam = { shots, modeName: 'follow', shot(s) { shots.push(s); return Promise.resolve(); }, mode(m) { this.modeName = m; return this; }, shake() {} };
  ctx.levels = { current: { id: 'meadow' }, loading: false, anchor: (n) => (n === 'here' ? { pos: new THREE.Vector3(1, 0, 2), facing: 0 } : null),
    load: async (id, sp) => { ctx.levels.loaded = [id, sp]; }, arena: () => null, spawnProp: async () => null, setDawnstone() {} };
  ctx.audio = { play2D: (id) => { sounds.push(id); return { stop() {} }; }, play3D: (id) => { sounds.push(id); return { stop() {} }; }, music: (tr) => music.push(tr) };
  ctx.env = { preset: (n) => envs.push(n), set: (f) => envs.push(f), contribute() {}, clear() {} };
  ctx.fx = { burst() {}, holy() {} };
  ctx.objectives = { started: [], get: () => null, start(id, cfg) { this.started.push([id, cfg]); }, add() {}, complete() {} };
  ctx.physics = { heightAt: () => 0 };
  const story = new StoryManager(ctx);
  ctx.story = story;
  return { ctx, story, shots, music, sounds, envs };
}

/** Advance the story by `sec` of fixed steps (letting promises settle like the real loop does). */
async function run(ctx, story, sec, onStep = null) {
  const n = Math.round(sec * 60);
  for (let i = 0; i < n; i++) {
    onStep?.(i);
    story.update(1 / 60);
    ctx.player.update(1 / 60);
    ctx.input.endStep();
    if (i % 3 === 0) await Promise.resolve();
  }
  await new Promise((r) => setTimeout(r, 0));
}

test('runner: steps run in order with their durations; flags, cutscene:start / end, mode back to play', async () => {
  const { ctx, story, shots } = storyCtx();
  await story.init();
  const seen = [];
  ctx.bus.tap?.((type, p) => seen.push([type, p?.id ?? p?.key]));
  story.registry = { ...story.registry, t1: { id: 't1', steps: [
    { t: 'cam', preset: 'HERO_LOW', anchor: 'swordcat' },
    { t: 'flag', key: 'a.b', value: 3 },
    { t: 'wait', dur: 0.5 },
    { t: 'par', steps: [{ t: 'wait', dur: 0.4 }, { t: 'actor', id: 'swordcat', moveTo: [2, 0], speed: 4 }] },
    { t: 'actor', id: 'swordcat', pose: 'vigil' },
  ], end: { flags: { 'c.d': true }, cam: 'follow' } } };
  let done = null;
  story.play('t1').then((r) => { done = r; });
  assert.equal(ctx.game.mode, 'cutscene');
  assert.ok(ctx.player.scripted, 'she is a cutscene actor');
  await run(ctx, story, 0.3);
  assert.equal(ctx.state.getFlag('a.b'), 3);
  assert.equal(story.isPlaying, true, 'the 0.5 s wait still runs');
  await run(ctx, story, 1.6);
  assert.deepEqual(done, { id: 't1', skipped: false });
  assert.equal(ctx.state.getFlag('c.d'), true);
  assert.equal(ctx.game.mode, 'play');
  assert.equal(ctx.player.scripted, false, 'released');
  assert.ok(ctx.player.poses.includes('vigil'));
  assert.ok(Math.hypot(ctx.player.pos.x - 2, ctx.player.pos.z) < 0.2, 'moveTo reached [2, 0]');
  assert.equal(shots[0].preset, 'HERO_LOW');
  assert.equal(ctx.cam.modeName, 'follow', 'camera handed back');
  if (seen.length) assert.ok(seen.some(([ty, id]) => ty === E.CUTSCENE_END && id === 't1'));
});

test('runner: dialogue lines — auto advance, a press completes then advances; dialog:start/line/end once per run', async () => {
  const { ctx, story } = storyCtx();
  await story.init();
  const ev = [];
  for (const e of [E.DIALOG_START, E.DIALOG_LINE, E.DIALOG_END]) ctx.bus.on(e, (p) => ev.push(e + ':' + (p.key ?? p.id)));
  story.registry = { ...story.registry, t2: { id: 't2', kind: 'dialog', steps: [say('swordcat', 'cs03.4', 0.6), { t: 'flag', key: 'mid', value: 1 }, say('pudding', 'cs03.5', 0)], end: { cam: 'follow' } } };
  story.play('t2');
  assert.equal(ctx.game.mode, 'dialog');
  await run(ctx, story, 1.0);
  assert.equal(story.line?.key, 'cs03.5', 'the auto line advanced by itself');
  assert.ok(story.line.revealed < 1 || story.line.complete);
  // first press completes the line, the second moves on
  await run(ctx, story, 0.2, (i) => { if (i === 0) ctx.input._press('confirm', 't'); if (i === 1) ctx.input._release('confirm', 't'); });
  assert.equal(story.line?.complete, true);
  assert.equal(story.isPlaying, true);
  await run(ctx, story, 0.2, (i) => { if (i === 0) ctx.input._press('confirm', 't'); if (i === 1) ctx.input._release('confirm', 't'); });
  assert.equal(story.isPlaying, false);
  assert.deepEqual(ev.filter((e) => e.startsWith('dialog:start') || e.startsWith('dialog:end')), ['dialog:start:t2', 'dialog:end:t2'], 'the box stays open across consecutive lines');
  assert.equal(ev.filter((e) => e.startsWith('dialog:line')).length, 2);
  assert.equal(ctx.game.mode, 'play');
});

test('runner: skip applies the end block at once (flags, despawn, load), emits cutscene:end {skipped}', async () => {
  const { ctx, story } = storyCtx();
  await story.init();
  let end = null;
  ctx.bus.on(E.CUTSCENE_END, (p) => { end = p; });
  story.registry = { ...story.registry, t3: { id: 't3', prologue: true, steps: [{ t: 'wait', dur: 30 }], end: { flags: { 'x.y': true }, load: { level: 'meadow', spawn: 'start' }, player: { outfit: 'armour' }, cam: 'follow' } } };
  ctx.player.setOutfit('tunic');
  const p = story.play('t3');
  await run(ctx, story, 0.2);
  assert.ok(story.current.canSkip, 'prologue scenes can be skipped on the first viewing');
  story.skip();
  const r = await p;
  assert.deepEqual(r, { id: 't3', skipped: true });
  assert.equal(end?.skipped, true);
  assert.equal(ctx.state.getFlag('x.y'), true);
  assert.deepEqual(ctx.levels.loaded, ['meadow', 'start']);
  assert.equal(ctx.player.outfit, 'armour');
  assert.ok(story.seen('t3'), 'seen after it ended');
  assert.equal(ctx.game.mode, 'play');
});

test('StoryManager: hold Pause 1 s skips a seen scene; an unseen non-prologue scene ignores it', async () => {
  const { ctx, story } = storyCtx();
  await story.init();
  story.registry = { ...story.registry, t4: { id: 't4', steps: [{ t: 'wait', dur: 30 }], end: { cam: 'follow' } } };
  story.play('t4');
  ctx.input._press('pause', 't');
  await run(ctx, story, SKIP_HOLD + 0.3);
  assert.equal(story.isPlaying, true, 'not seen yet: no skip');
  story.skip();
  await run(ctx, story, 0.05);
  ctx.input._release('pause', 't'); ctx.input.endStep();
  story.play('t4');
  ctx.input._press('pause', 't');
  await run(ctx, story, SKIP_HOLD - 0.2);
  assert.equal(story.isPlaying, true, 'still filling the ring');
  await run(ctx, story, 0.4);
  assert.equal(story.isPlaying, false, 'seen: a 1 s hold skips it');
  ctx.input._release('pause', 't');
});

test('StoryManager: play() while a scene runs queues the next one; end.play chains; placeholders run their end', async () => {
  const { ctx, story } = storyCtx();
  await story.init();
  const order = [];
  ctx.bus.on(E.CUTSCENE_START, (p) => order.push(p.id));
  story.registry = { ...story.registry, q1: { id: 'q1', steps: [{ t: 'wait', dur: 0.2 }], end: { cam: 'follow' } } };
  story.play('q1');
  story.play('cs11');                                 // placeholder, queued
  await run(ctx, story, 0.25);
  assert.deepEqual(order, ['q1', 'cs11']);
  await run(ctx, story, 0.4);
  assert.equal(ctx.state.getFlag('bog.pearl'), true);
  // CS-15 placeholder chains CS-16
  story.play('cs15');
  await run(ctx, story, 1.0);
  assert.ok(order.includes('cs15') && order.includes('cs16'), `chained (${order})`);
  assert.equal(ctx.state.getFlag('ending.seen'), true);
  assert.equal(ctx.game.mode, 'play');
  // a boss defeat starts its scene
  ctx.bus.emit(E.BOSS_DEFEATED, { id: 'boss_grizzlechop' });
  assert.equal(story.playingId, 'cs05');
  story.skipAll();
  await run(ctx, story, 0.05);
  assert.equal(story.isPlaying, false);
});

test('StoryManager: flag() emits story:flag; net ropes done → meadow.pudding = true + the follow beat', async () => {
  const { ctx, story } = storyCtx();
  await story.init();
  const flags = [];
  ctx.bus.on(E.FLAG_SET, (f) => flags.push([f.key, f.value]));
  story.flag('prologue.armour', true);
  assert.equal(story.flag('prologue.armour'), true);
  assert.deepEqual(flags[0], ['prologue.armour', true]);
  ctx.bus.emit(E.OBJECTIVE, { id: 'net_ropes', value: 3, max: 3, done: true });
  assert.equal(ctx.state.getFlag('meadow.pudding'), true);
  assert.equal(story.playingId, 'cs03b');
  assert.equal(story.current.kind, 'ambient');
  assert.equal(ctx.game.mode, 'play', 'the follow beat keeps the game running');
  await run(ctx, story, 7);
  assert.equal(story.isPlaying, false);
});

test('StoryManager: a prompt step waits for its hold; releasing early restarts the fill; it cannot be skipped', async () => {
  const { ctx, story } = storyCtx();
  await story.init();
  const prompts = [];
  ctx.bus.on(E.PROMPT, (p) => prompts.push(p));
  story.registry = { ...story.registry, t5: { id: 't5', prologue: true, steps: [{ t: 'prompt', action: 'guard', hold: 1.0, textKey: 'prompt.holdStand' }], end: { cam: 'follow' } } };
  story.play('t5');
  ctx.input._press('guard', 't');
  await run(ctx, story, 0.6);
  assert.equal(story.current.canSkip, false, 'interactive prompts cannot be skipped');
  ctx.input._release('guard', 't');
  await run(ctx, story, 0.2);
  ctx.input._press('guard', 't');
  await run(ctx, story, 0.6);
  assert.equal(story.isPlaying, true, 'the fill restarted');
  await run(ctx, story, 0.6);
  assert.equal(story.isPlaying, false);
  ctx.input._release('guard', 't');
  assert.ok(prompts.some((p) => p.textKey === 'prompt.holdStand' && p.progress > 0 && !p.done));
  assert.ok(prompts.at(-1).done);
});

test('chapters: card text and the chapter of a level / flags', () => {
  const c = chapterInfo(1);
  assert.equal(c.label, 'Chapter 1'); assert.equal(c.title, 'Small Paws, Big Sword'); assert.equal(c.region, 'Purrdale Meadows');
  assert.equal(chapterInfo('prologue').title, 'One Ear-Tuft Short');
  assert.equal(chapterInfo('gate').title, 'Where I Stand');
  const ctx = fakeCtx({ systems: false });
  assert.equal(chapterOf(ctx.state, 'meadow'), 'prologue');
  ctx.state.setFlag('prologue.done', true);
  assert.equal(chapterOf(ctx.state, 'meadow'), 1);
  assert.equal(chapterOf(ctx.state, 'keep'), 6);
});

// ====================================================================================================== Midnight Practice
test('tutorial: the 8 steps advance on their conditions, in order; position facts are latched', () => {
  const log = new PracticeLog();
  assert.equal(log.step.id, 'move');
  log.note({ type: 'north' });                                  // crossing the fence early counts later
  log.note({ type: 'moved', d: 2 });
  assert.equal(log.complete(), false);
  log.note({ type: 'moved', d: 1.5 }); log.note({ type: 'looked', rad: 0.6 });
  assert.equal(log.complete(), true); log.advance();
  assert.equal(log.step.id, 'jump'); assert.equal(log.complete(), true, 'already north of the fence'); log.advance();
  log.note({ type: 'hit', attackId: 'slash1', dummy: true }); assert.equal(log.complete(), false);
  log.note({ type: 'hit', attackId: 'slash3', dummy: true }); assert.equal(log.complete(), true); log.advance();
  log.note({ type: 'dodge', nearSack: false }); assert.equal(log.complete(), false);
  log.note({ type: 'dodge', nearSack: true }); assert.equal(log.complete(), true); log.advance();
  log.note({ type: 'block' }); assert.equal(log.complete(), false);
  log.note({ type: 'parry' }); assert.equal(log.complete(), true, 'a parry counts as a block'); log.advance();
  assert.equal(log.step.id, 'parry'); assert.equal(log.complete(), false, 'the earlier parry does not count for step 6');
  log.note({ type: 'parry' }); assert.equal(log.complete(), true); log.advance();
  log.note({ type: 'boulder' }); assert.equal(log.complete(), true); log.advance();
  assert.equal(log.step.id, 'meow');
  log.note({ type: 'cow' }); assert.equal(log.complete(), true);
  assert.equal(log.advance(), null); assert.ok(log.finished);
  assert.equal(TUTORIAL_STEPS.length, 8);
  assert.ok(inPractice(0, -80) && inPractice(-19, -99) && !inPractice(0, -55));
  assert.equal(PRACTICE.skipHold, 1.0);
});

test('tutorial: dummy hits without a finisher still complete the combo after 6', () => {
  const log = new PracticeLog();
  log.i = 2;
  for (let k = 0; k < 5; k++) log.note({ type: 'hit', attackId: 'slash1', dummy: true });
  assert.equal(log.complete(), false);
  log.note({ type: 'hit', attackId: 'slash2', dummy: true });
  assert.equal(log.complete(), true);
});

// ====================================================================================================== barks (§6)
test('barks: the §6 gate — 6 s gap, chance, no repeat within 60 s; force bypasses gap and chance', () => {
  const g = new BarkGate({ gap: 6, noRepeat: 60 });
  const r = () => 0.1;
  assert.equal(g.pick(['a', 'b'], 0, r, { chance: 0.25 }), 'a');
  assert.equal(g.pick(['a', 'b'], 3, r, { chance: 1 }), null, 'gap');
  assert.equal(g.pick(['a', 'b'], 7, r, { chance: 0.05 }), null, 'chance');
  assert.equal(g.pick(['a', 'b'], 8, r, { chance: 1 }), 'b', 'a was said within 60 s');
  assert.equal(g.pick(['a'], 20, r, { chance: 1 }), null, 'no fresh line');
  assert.equal(g.pick(['a'], 21, r, { force: true }), 'a', 'forced lines may repeat');
  assert.equal(enemyType({ def: { id: 'bonehead:minion' } }), 'bonehead');
  assert.equal(bossKey('boss_barkus'), 'barkus');
  assert.equal(CLEM_BARKS.alert.chance, 0.5);
  assert.equal(CLEM_BARKS.parry.chance, 0.3);
  assert.equal(CLEM_BARKS.holy.chance, 0.4);
  assert.ok(CLEM_BARKS.stillStanding.always && CLEM_BARKS.kitten.always);
});

// ====================================================================================================== staging maths
test('CS-02: she plants herself on the horde line, facing the column; the files pass ±2.5 m from her', () => {
  const a = [-40, -45], b = [30, -55];
  const cross = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  assert.ok(Math.abs(cross(MARK)) / Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.02, 'MARK lies on horde_a → horde_b');
  assert.ok(Math.hypot(MARK[0] + 6, MARK[1] + 52) < 3.5, 'MARK is on the lane by the trigger');
  assert.ok(Math.abs(wrap(CS02_FACE - yawOf([a[0] - MARK[0], a[1] - MARK[1]]))) < 0.01, 'she faces horde_a');
  assert.ok(Math.abs(HORDE_U[0] * LAT[0] + HORDE_U[1] * LAT[1]) < 1e-9);
  for (const h of FILES) {
    const off = (h.from[0] - MARK[0]) * LAT[0] + (h.from[1] - MARK[1]) * LAT[1];
    assert.ok(Math.abs(Math.abs(off) - 2.5) < 0.02, `${h.id} walks 2.5 m to her side`);
    const ahead = (h.from[0] - MARK[0]) * -HORDE_U[0] + (h.from[1] - MARK[1]) * -HORDE_U[1];
    assert.ok(ahead > 18, `${h.id} starts in the fog ahead of her`);
  }
  assert.equal(FILES.filter((h) => h.cage).length, 4, 'four of them carry cages');
  assert.ok(Math.hypot(CS02_CAST.CACKLE.stop[0] - MARK[0], CS02_CAST.CACKLE.stop[1] - MARK[1]) < 1.6, 'Cacklejaw stops snout to nose');
  assert.ok(Math.hypot(CS02_CAST.PILFER.at[0] - CS02_CAST.POST[0], CS02_CAST.PILFER.at[1] - CS02_CAST.POST[1]) < 0.7, 'Pilfer reaches the signpost');
});

test('CS-03: the WHIP_FALL (+120°) lands looking at the net, so Pudding rises into the lens', () => {
  const { FACE, VIEW_YAW, SIT, CUP_TO, LENS } = CS03_MARKS;
  const view = FACE + Math.PI + (120 * Math.PI) / 180;
  assert.ok(Math.abs(wrap(view - VIEW_YAW)) < 1e-9);
  assert.ok(Math.abs(wrap(VIEW_YAW - yawOf([NET[0] - SIT[0], NET[1] - SIT[1]]))) < 1e-9);
  assert.ok(Math.hypot(SIT[0], SIT[1] - 16) < 1, 'she sits against the picnic bale');
  assert.ok(Math.hypot(CUP_TO[0] - LENS[0], CUP_TO[1] - LENS[1]) < 0.6, 'the cup rolls into the foreground');
});

test('CS-00: the holy pulse runs every second 3.8 s loop, 0 → 0.35 → 0 over 1.2 s', () => {
  const L = PLAYER.memeCam.loop;
  assert.equal(titlePulse(0.6), 0, 'first loop: none');
  assert.ok(Math.abs(titlePulse(L + 0.6) - TITLE_PULSE.peak) < 1e-9, 'second loop: the peak at 0.6 s');
  assert.equal(titlePulse(L + 1.3), 0);
  assert.equal(titlePulse(2 * L + 0.6), 0, 'third loop: none');
  assert.ok(titlePulse(3 * L + 0.3) > 0);
});

test('lib + overlay helpers: along / unit / yawOf; glyph keycaps; reveal by visible characters', () => {
  const u = unit([0, 0], [3, 4]);
  assert.deepEqual(u, [0.6, 0.8]);
  assert.deepEqual(along([1, 1], u, 5), [4, 5]);
  assert.ok(Math.abs(yawOf([1, 0]) - Math.PI / 2) < 1e-9);
  assert.equal(glyphs('Jump the fence [Space]'), 'Jump the fence <kbd class="st-key">Space</kbd>');
  assert.ok(glyphs('Hold ⚔').includes('<kbd class="st-key">⚔</kbd>'));
  assert.equal(revealHtml('Raise the *Stand* now', 12), 'Raise the <em>St</em>');
  assert.equal(visibleLength('a *b* c'), 5);
  assert.ok(glyphs('<b>').includes('&lt;b&gt;'), 'escaped');
});

test('Cutscene: an unknown step type warns once and is skipped; a throwing call step never stops the scene', async () => {
  const { ctx, story } = storyCtx();
  await story.init();
  const warn = console.warn, err = console.error;
  const msgs = [];
  console.warn = (...a) => msgs.push(a.join(' ')); console.error = (...a) => msgs.push(a.join(' '));
  try {
    story.registry = { ...story.registry, t6: { id: 't6', steps: [{ t: 'bogus' }, { t: 'call', fn: () => { throw new Error('boom'); } }, { t: 'flag', key: 'after', value: 1 }], end: { cam: 'follow' } } };
    story.play('t6');
    await run(ctx, story, 0.2);
  } finally { console.warn = warn; console.error = err; }
  assert.equal(ctx.state.getFlag('after'), 1);
  assert.ok(msgs.some((m) => m.includes('unknown step type')));
  assert.equal(story.isPlaying, false);
  assert.ok(new Cutscene(ctx, { id: 'x', steps: [] }, story).kind === 'cutscene');
});

// ====================================================================================== cutscene sfx ids resolve (audio)
test('every cutscene sfx id resolves in the audio manifest / SFX map', async () => {
  const { default: manifest } = await import('../../src/audio/assets.manifest.js');
  const { buildIndex, resolveId } = await import('../../src/audio/ids.js');
  const { SFX } = await import('../../src/audio/sfxMap.js');
  const { CUES } = await import('../../src/audio/cues.js');
  const index = buildIndex(manifest);
  const PROCEDURAL = new Set(['laugh', 'laughChorus', 'bell', 'sunbell', 'bellClunk', 'heartbeat', 'march', 'shimmer']);   // AudioManager.js header
  const bad = [];
  for (const [id, def] of Object.entries(CUTSCENES)) {
    walkSteps(def.steps, (s, p) => {
      if (s?.t !== 'sfx' || typeof s.id !== 'string') return;
      if (!PROCEDURAL.has(s.id) && !SFX[s.id] && !CUES[s.id] && !resolveId(s.id, index, () => 0)) bad.push(`${id} ${p}: ${s.id}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('CS-01 sunbeam flop marks keep the squires apart', async () => {
  const { SUN_MARKS } = await import('../../src/story/cutscenes/cs01.js');
  assert.equal(SUN_MARKS.length, 6);
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const d = Math.hypot(SUN_MARKS[i][0] - SUN_MARKS[j][0], SUN_MARKS[i][1] - SUN_MARKS[j][1]);
    assert.ok(d >= 0.6, `squires ${i + 1}/${j + 1} only ${d.toFixed(2)} m apart`);
  }
  for (const [x, z] of SUN_MARKS) assert.ok(Math.hypot(x + 1.8, z + 70.1) < 2.0, 'inside the 2.3 m sun patch');
});

test('§6.6: tut.riposte hint waits for a melee parry (a reflected bolt has no riposte)', () => {
  const h = HINTS.find((x) => x.key === 'tut.riposte');
  const ctx = { state: { getFlag: (k) => k === 'prologue.done' } };
  assert.equal(h.on, E.PLAYER_PARRY);
  assert.ok(!h.when(ctx, { projectile: {}, perfect: true }), 'bolt reflect must not trigger');
  assert.ok(h.when(ctx, { attacker: {}, perfect: true }), 'melee parry triggers');
  assert.ok(!h.when({ state: { getFlag: () => false } }, { attacker: {} }), 'not before prologue.done');
});

// ====================================================================================================== M2: Acts I–II
import { spoonRows, spoonSpeakers, arcPoint } from '../../src/story/cutscenes/cast.js';
import { QUESTS, currentQuest, nextLevel, levelAvailable, levelCards, nextLabel } from '../../src/story/quests.js';
import { hubLine, hubCandidates, missingKittens, HUB_LINES } from '../../src/story/dialogue/hub.js';
import { lineBeat, LINE_BEATS } from '../../src/story/StoryManager.js';
import { KITTEN_IDS } from '../../src/core/config.js';

const M2_FLAGS = {
  d02: { 'forest.sage': true }, cs04: { 'forest.camp': true }, cs05: { 'forest.boss': true }, d03: { 'town.marmalade': true },
  cs06: { 'town.letters': true }, d04tofu: { 'town.tofu': true }, d04earlgrey: { 'town.earlgrey': true }, d04clover: { 'town.clover': true },
  cs07: { 'town.free': true }, d06: { 'gate.pip': true }, cs08: { 'gate.spoons': true }, g02: { 'gate.leap': true }, cs09: { 'gate.boss': true },
  cs10: { 'gate.done': true }, gate_pin: { 'gate.pin': true }, gate_open: { 'gate.line': true }, gate_yard: { 'gate.yard': true },
};

test('M2: CS-04…CS-10, D-02…D-06, G-02 are authored and set their §19.7 flags; shards, unlocks, chains', () => {
  for (const [id, flags] of Object.entries(M2_FLAGS)) {
    const def = CUTSCENES[id];
    assert.ok(def, `${id} authored`);
    for (const [k, v] of Object.entries(flags)) assert.equal(def.end.flags?.[k], v, `${id}: ${k}`);
  }
  assert.equal(CUTSCENES.cs05.end.shards, 1);
  assert.equal(CUTSCENES.cs09.end.shards, 2);
  assert.deepEqual(CUTSCENES.cs09.end.unlock, [{ kind: 'ability', id: 'golden' }]);
  assert.equal(CUTSCENES.cs09.end.play, 'cs10');
  assert.deepEqual(CUTSCENES.cs07.end.unlock, [{ kind: 'cape', id: 'red' }]);
  assert.equal(CUTSCENES.cs07.results, 'town', 'town ends in CS-07: results, no load');
  assert.equal(CUTSCENES.cs07.end.load, undefined);
  assert.equal(typeof CUTSCENES.cs10.end.load, 'function', 'CS-10 loads town only when skipped before its own load');
  assert.equal(CUTSCENES.cs10.end.player.spawn, 'hub');
  assert.equal(CUTSCENES.cs10.end.env, 'hub_grey');
  assert.equal(CUTSCENES.cs04.end.env, 'forest_night');
  assert.equal(CUTSCENES.g02.letterbox, false, 'G-02 has no letterbox');
  assert.equal(CUTSCENES.d03.end.objective.id, 'chase');
  for (const id of ['d02', 'd03', 'd04tofu', 'd04earlgrey', 'd04clover', 'd06', 'gate_yard']) assert.equal(CUTSCENES[id].kind, 'dialog', id);
  for (const id of ['gate_back', 'gate_pin', 'gate_open']) assert.equal(CUTSCENES[id].kind, 'ambient', id);
  // never-cut CS-08: its five shots in order
  const presets = []; walkSteps(CUTSCENES.cs08.steps, (s) => { if (s.t === 'cam' && s.preset) presets.push(s.preset); });
  assert.deepEqual(presets.slice(0, 5), ['MEME_LOOP', 'REVERSE_HORDE', 'ECU_EYES', 'PULLBACK', 'TWO_SHOT_LOW']);
});

test('CS-08: spoon kittens — max(3, rescued) capped at 18, rows of 6 at 1 m, 2.5 m behind her; villagers fill in', () => {
  const none = spoonRows([], [0, 10], Math.PI);
  assert.equal(none.length, 3);
  assert.ok(none.every((r) => r.kittenId === null && r.npc.startsWith('villager_')), 'never a kitten that is still lost');
  for (const r of none) assert.ok(r.at[1] > 10 + 2.4, `behind her (she faces −Z): ${r.at}`);
  assert.ok(Math.abs(none[0].at[1] - 12.5) < 1e-9, 'first row 2.5 m behind');
  const five = spoonRows(['biscuit', 'noodle', 'nope', 'button', 'pickles', 'pebble'], [0, 10], Math.PI);
  assert.equal(five.length, 5, 'unknown ids are ignored');
  assert.deepEqual(five.slice(0, 2).map((r) => r.kittenId), ['biscuit', 'noodle']);
  const all = spoonRows([...KITTEN_IDS, ...KITTEN_IDS], [0, 10], Math.PI);
  assert.equal(all.length, 18, 'capped at 18');
  const rows = new Map(); for (const r of all) rows.set(r.row, (rows.get(r.row) ?? 0) + 1);
  assert.deepEqual([...rows.values()], [6, 6, 6]);
  const r0 = all.filter((r) => r.row === 0).map((r) => r.at[0]).sort((a, b) => a - b);
  for (let i = 1; i < r0.length; i++) assert.ok(Math.abs(r0[i] - r0[i - 1] - 1.0) < 1e-9, '1.0 m spacing');
  assert.ok(Math.abs(all.find((r) => r.row === 1).at[1] - 13.5) < 1e-9, 'rows 1 m apart');
  const sp = spoonSpeakers(five);
  assert.deepEqual(sp.map((s) => s.name), ['name.biscuit', 'name.noodle']);
  assert.equal(spoonSpeakers(none)[0].name, 'name.villager');
  const p = arcPoint({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0.5, 2);
  assert.ok(Math.abs(p.x - 5) < 1e-9 && Math.abs(p.y - 2) < 1e-9, 'arc peaks at h mid-way');
});

/** A GameState-like with flags. */
const fstate = (flags = {}, extra = {}) => ({ flags: { ...flags }, getFlag(k) { return this.flags[k]; }, kittens: [], letters: [], levels: {}, ...extra });

test('quests: the current step follows the flags level by level; Quest Board next level and cards', () => {
  assert.equal(currentQuest(fstate(), 'meadow').id, 'prologue');
  assert.equal(currentQuest(fstate({ 'prologue.done': true }), 'meadow').id, 'meadow.follow');
  assert.equal(currentQuest(fstate({ 'prologue.done': true, 'meadow.pudding': 'netted' }), 'meadow').id, 'meadow.pudding');
  const forest = fstate({ 'prologue.done': true, 'meadow.pudding': true, 'meadow.mochi': true, 'meadow.done': true });
  assert.equal(currentQuest(forest, 'forest').id, 'forest.sage');
  forest.flags['forest.sage'] = true; assert.equal(currentQuest(forest, 'forest').id, 'forest.camp');
  forest.flags['forest.camp'] = true; assert.equal(currentQuest(forest, 'forest').id, 'forest.mill');
  const hub = fstate({ 'meadow.done': true, 'forest.done': true, 'town.marmalade': true, 'town.letters': true, 'town.clover': true, 'town.earlgrey': true, 'town.free': true, 'town.done': true });
  assert.equal(currentQuest(hub, 'town').id, 'hub-gate');
  assert.ok(currentQuest(hub, 'town').text.length > 3);
  assert.equal(nextLevel(fstate()), 'meadow');
  assert.equal(nextLevel(hub), 'gate');
  assert.equal(nextLevel(fstate({ 'town.free': true, 'meadow.done': true, 'forest.done': true })), 'gate', 'town counts as done at town.free');
  assert.equal(levelAvailable(hub, 'gate'), true);
  assert.equal(levelAvailable(fstate({ 'forest.done': true }), 'gate'), false, 'the gate needs town.free');
  assert.equal(levelAvailable(hub, 'bog'), false);
  const cards = levelCards({ ...hub, kittens: ['biscuit', 'noodle'], letters: ['l1'], levels: { meadow: { cleared: true, bestRank: 'pawsome' } } });
  assert.equal(cards.length, 6);
  assert.deepEqual([cards[0].kittens, cards[0].kittensMax, cards[0].letter, cards[0].bestRank], [2, 3, true, 'pawsome']);
  assert.equal(cards.find((c) => c.next).id, 'gate');
  assert.equal(nextLabel(hub), 'Next: Where I Stand');
  for (const q of QUESTS) assert.ok(has(q.textKey), q.textKey);
});

test('§6.5 hub lines: two per station, no repeat in a row; Marmalade in bed after L4; Pip counts the missing kittens', () => {
  for (const keys of Object.values(HUB_LINES)) for (const k of keys) assert.ok(has(k), k);
  const st = fstate({ 'town.free': true });
  const a = hubLine('tofu', st, () => 0), b = hubLine('tofu', st, () => 0, a.key);
  assert.notEqual(a.key, b.key, 'never the same line twice in a row');
  assert.equal(hubLine('marmalade', fstate({ 'gate.done': true }), () => 0.9).key, 'hub.marmalade.bed');
  assert.notEqual(hubLine('marmalade', st, () => 0).key, 'hub.marmalade.bed');
  const pip = hubLine('pip', { ...st, kittens: ['biscuit', 'noodle', 'button', 'pickles'] }, () => 0);
  assert.equal(pip.key, 'hub.pip.1');
  assert.ok(/^2 kittens still out in Whiskerwood/.test(pip.text), pip.text);
  assert.deepEqual(missingKittens({ kittens: [...KITTEN_IDS] }), null);
  assert.equal(hubCandidates('pip', { ...st, kittens: [...KITTEN_IDS] })[0].key, 'hub.pip.2');
  assert.equal(hubLine('biscuit', st).key, 'kitten.biscuit', 'a rescued kitten says its own line');
  assert.ok(HUB_LINES.villager.includes(hubLine('villager_7', st, () => 0.5).key));
  assert.equal(hubLine('nobody_at_all_x', st), null);
});

test('The Line beats: 70% → CS-08 (pre-roll waits for ≤ 2 alive / no telegraph, ≤ 10 s), 85% → G-02, 100% → the gate test', async () => {
  assert.equal(lineBeat(0.69, () => false), null);
  assert.equal(lineBeat(0.70, () => false).id, 'cs08');
  assert.equal(lineBeat(0.9, (b) => b.id === 'cs08').id, 'g02');
  assert.equal(LINE_BEATS.length, 2);
  const { ctx, story } = storyCtx();
  story.fastDialog = true;
  ctx.levels.current.id = 'gate';
  const foes = [0, 1, 2].map(() => ({ alive: true, faction: 'enemy', pos: new THREE.Vector3() }));
  ctx.enemies = { list: foes, despawn(e) { const i = foes.indexOf(e); if (i >= 0) foes.splice(i, 1); } };
  await story.init();
  const started = [];
  ctx.bus.on(E.CUTSCENE_START, (p) => started.push(p.id));
  ctx.bus.emit(E.OBJECTIVE, { id: 'line', value: 70, max: 100 });
  assert.equal(story.preroll?.id, 'cs08');
  await run(ctx, story, 0.5);
  assert.deepEqual(started, [], '3 alive: CS-08 waits');
  foes.pop();
  await run(ctx, story, 0.1);
  assert.deepEqual(started, ['cs08'], '≤ 2 alive: CS-08 starts');
  ctx.bus.emit(E.OBJECTIVE, { id: 'line', value: 71, max: 100 });
  story.play('cs08');                                     // world's own request is merged
  await run(ctx, story, 3);
  story.skipAll();
  await run(ctx, story, 0.2);
  assert.equal(started.filter((s) => s === 'cs08').length, 1, 'one CS-08');
  assert.equal(ctx.state.getFlag('gate.spoons'), true);
  ctx.bus.emit(E.OBJECTIVE, { id: 'line', value: 86, max: 100 });
  await run(ctx, story, 0.1);
  assert.equal(started.at(-1), 'g02');
  story.skipAll(); await run(ctx, story, 0.2);
  ctx.bus.emit(E.OBJECTIVE, { id: 'line', value: 100, max: 100, done: true });
  await run(ctx, story, 0.1);
  assert.equal(started.at(-1), 'gate_open');
  // the pre-roll gives up waiting after 10 s
  const s2 = storyCtx(); s2.ctx.levels.current.id = 'gate';
  s2.ctx.enemies = { list: [1, 2, 3, 4].map(() => ({ alive: true, faction: 'enemy', pos: new THREE.Vector3() })), despawn() {} };
  await s2.story.init();
  s2.ctx.bus.emit(E.OBJECTIVE, { id: 'line', value: 0.75, max: 1 });
  await run(s2.ctx, s2.story, 9.8);
  assert.equal(s2.story.playingId, null);
  await run(s2.ctx, s2.story, 0.4);
  assert.equal(s2.story.playingId, 'cs08');
});

test('M2 beats: bakery clear → D-03; post bag returned → CS-06; D-04 picks the next rescue; CS-09 → CS-10 → the hub', async () => {
  const { ctx, story } = storyCtx();
  story.fastDialog = true;
  ctx.levels.current.id = 'town';
  await story.init();
  const started = [], quests = [];
  ctx.bus.on(E.CUTSCENE_START, (p) => started.push(p.id));
  ctx.bus.on(E.QUEST_UPDATE, (p) => quests.push(p));
  ctx.bus.emit(E.ARENA_CLEAR, { id: 'bakery' });
  assert.equal(story.playingId, 'd03');
  await run(ctx, story, 12);
  assert.equal(ctx.state.getFlag('town.marmalade'), true);
  assert.ok(ctx.objectives.started.some(([id]) => id === 'chase'), 'the chase objective');
  ctx.bus.emit(E.ARENA_CLEAR, { id: 'bakery' });
  assert.equal(story.playingId, null, 'once');
  ctx.bus.emit(E.ITEM_RETURNED, { item: 'post_bag', amount: 1 });
  assert.equal(story.playingId, 'cs06');
  story.skipAll(); await run(ctx, story, 0.3);
  assert.equal(ctx.state.getFlag('town.letters'), true);
  assert.ok(quests.some((q) => q.questId === 'town.chase' && q.state === 'done'), 'quest:update done');
  assert.equal(story.quest.id, 'town.rescue');
  story.play('d04'); assert.equal(story.playingId, 'd04tofu');
  story.skipAll(); await run(ctx, story, 0.2);
  story.play('d04'); assert.equal(story.playingId, 'd04earlgrey');
  story.skipAll(); await run(ctx, story, 0.2);
  ctx.levels.current.id = 'gate';
  ctx.levels.results = () => ({ levelId: 'gate', time: 1, kittens: 0, letter: false, fish: 0, lives: 9, rank: 'pawsome' });
  const results = [];
  ctx.bus.on(E.LEVEL_RESULTS, (p) => results.push(p.levelId));
  ctx.bus.emit(E.BOSS_DEFEATED, { id: 'boss_cacklejaw' });
  assert.equal(story.playingId, 'cs09');
  story.skipAll(); await run(ctx, story, 0.5);
  assert.equal(ctx.state.shards, 2);
  assert.ok(started.includes('cs10'), 'CS-10 follows');
  story.skipAll(); await run(ctx, story, 0.5);
  assert.equal(ctx.state.getFlag('gate.done'), true);
  assert.deepEqual(ctx.levels.loaded, ['town', 'hub'], 'skipped CS-10 still lands in the hub');
  assert.deepEqual(results, ['gate'], 'the Chapter 4 results card');
  assert.equal(ctx.state.levels.gate.cleared, true);
});

test('runner (M2): dynamic `who` / `name`, `{anchor, or}` points, end.load as a function, the letter card', async () => {
  const { ctx, story } = storyCtx();
  await story.init();
  const lines = [];
  ctx.bus.on(E.DIALOG_LINE, (p) => lines.push([p.speaker, p.name]));
  story.fastDialog = true;
  story.registry = { ...story.registry, t9: { id: 't9', steps: [
    { t: 'actor', id: 'swordcat', moveTo: { anchor: 'nope', or: [3, 0] }, speed: 6 },
    { t: 'say', who: () => 'biscuit', name: () => 'name.biscuit', key: 'cs08.4' },
    { t: 'ui', letter: { key: 'letter.marmalade', title: 'letter.marmalade.title' } },
    { t: 'wait', dur: 0.4 },
  ], end: { cam: 'follow', load: async () => ({ level: 'town', spawn: 'hub' }) } } };
  story.play('t9');
  await run(ctx, story, 0.9);
  assert.equal(story.cinema.letterOn?.text, t('letter.marmalade'));
  await run(ctx, story, 1.5);
  assert.ok(Math.hypot(ctx.player.pos.x - 3, ctx.player.pos.z) < 0.2, 'fallback point used');
  assert.deepEqual(lines[0], ['biscuit', 'Biscuit']);
  assert.deepEqual(ctx.levels.loaded, ['town', 'hub']);
  assert.equal(story.cinema.letterOn, null, 'the card never outlives its scene');
});

test('every M2 scene runs start to end (and skip) in a bare ctx without throwing; she is released', async () => {
  for (const id of Object.keys(M2_FLAGS)) {
    const { ctx, story } = storyCtx();
    story.fastDialog = true;
    await story.init();
    story.play(id);
    await run(ctx, story, id === 'cs10' ? 2 : 1);
    for (let k = 0; k < 3 && story.isPlaying; k++) { story.skipAll(); await run(ctx, story, 0.3); }   // CS-09 chains CS-10
    assert.equal(story.isPlaying, false, `${id} ended`);
    assert.equal(ctx.player.scripted, false, `${id}: player released`);
    for (const [k, v] of Object.entries(M2_FLAGS[id])) assert.equal(ctx.state.getFlag(k), v, `${id}: ${k}`);
  }
});
