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
import { HOMAGE_LINES, PLAYER, FADE_COLOR, STORY } from '../../src/core/config.js';
import { Actor } from '../../src/core/Actor.js';
import { ScriptedActorMixin } from '../../src/core/ScriptedActor.js';
import { S, t, has, pick, fill, text, speakerName } from '../../src/story/strings.js';
import { Cutscene, STEP_TYPES, END_KEYS, walkSteps, sampleKeys, revealTime, isInstant, layoutPoint, spawnKind, isCat, sceneLength } from '../../src/story/Cutscene.js';
import { StoryManager, chapterInfo, chapterOf, BOSS_SCENES, SKIP_HOLD, migrateFlags, prologueStage, isBlack } from '../../src/story/StoryManager.js';
import { EAGER, LAZY, SCENE_LEVEL, loadScene } from '../../src/story/cutscenes/registry.js';
import { claimLamp, releaseLamp, lampHolder } from '../../src/story/cutscenes/rig.js';
import { announce, REWARD_TOASTS } from '../../src/story/rewards.js';
import { CUTSCENES, PLACEHOLDER_ENDS, placeholderScene } from '../../src/story/cutscenes/index.js';
import { PracticeLog, TUTORIAL_STEPS, PRACTICE, inPractice, HINTS, Tutorial, TALK_TIP_R, GuideClock, ParryFails, GLYPH_HINTS, HINT_SHOW, fenceSide, nearestDummy } from '../../src/story/tutorial.js';
import { BarkGate, CLEM_BARKS, ENEMY_BARKS, BOSS_BARKS, enemyType, bossKey } from '../../src/story/dialogue/barks.js';
import { U as HORDE_U, LAT, MARK, FACE as CS02_FACE, FILES, CS02_CAST, cs02Steps } from '../../src/story/cutscenes/cs02.js';
import { CS03_MARKS, NET } from '../../src/story/cutscenes/cs03.js';
import { titlePulse, TITLE_PULSE, TITLE_BLEND, pearlHops, playReady } from '../../src/story/cutscenes/cs00.js';
import { glyphs, revealHtml, visibleLength } from '../../src/story/Overlay.js';
import { say, along, unit, yawOf } from '../../src/story/cutscenes/lib.js';
import { CUES } from '../../src/audio/cues.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ====================================================================================================== strings (U14)
test('strings: t / has / fill / text / speakerName; missing keys come back as the key', () => {
  assert.equal(t('cs03.1'), 'Day one of rescuing everyone. Morale: high.');
  assert.equal(t('nope.key'), 'nope.key');
  assert.equal(t('toast.kitten', { n: 2, max: 3 }), 'Kitten found! 2/3');   // WA23 (the level count, like the HUD)
  assert.equal(fill('{a}-{b}', { a: 1 }), '1-{b}');
  assert.ok(has('ch.prologue') && !has('ch.zzz'));
  assert.equal(text('cs01.chest'), 'M. — my first');
  assert.equal(has('cs01.caption'), false, 'WA §8.6: the opening caption is gone');
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
/** CONTROLS_SPEC: the `tut.jump.done` flag and §10.7 setting names quoted in code / comments. */
const NOT_KEYS2 = /^(game.(frameCount|stepCount|perf|playReady)|kitten.setOutline|tut\.jump\.done|settings\.(bindings|autoAttack|castMode|parryRing|autoRiposte|controlPreset|camZoom|camLock|touchLayout|tapToMove|swipeTumble|haptics|buttonOpacity|leftHanded|reduceCameraMotion|standAutoFace|edgePanSpeed|pathPreview|cursorSize|cursorContrast|hapticTaps))$/;
const KEY_RE = /['"`]((?:tut|obj|prompt|toast|bark|kitten|hub|letter|ch|region|name|menu|pause|settings|results|life|gameover|loading|meme|ach|shop|board|difficulty|vigil|hud|credits|title|game|newgame|memecam|rotate|cs\d\d[a-z]?|g\d\d|d\d\d|grizzlechop|cacklejaw|pilfer|brutus|barkus|postcredits|ending)\.[\w.]*\w)['"`]/g;

test('U14: every strings key used anywhere in src/ exists in strings.js', () => {
  const missing = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.js') && !CUE_FILES.has(path.relative(ROOT, p).split(path.sep).join('/'))) for (const m of fs.readFileSync(p, 'utf8').matchAll(KEY_RE)) {
        const k = m[1];
        if (!has(k) && !NOT_KEYS.test(k) && !NOT_KEYS2.test(k) && !CUES[k]) missing.push(`${path.relative(ROOT, p)}: ${k}`);
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

test('§19.7 + WA §6.2: the prologue scenes set their flags in the new order (chart → raid → suit up), CS-03 netted, D-01 mochi', () => {
  assert.equal(CUTSCENES.cs01.end.flags['prologue.chart'], true);
  assert.equal(CUTSCENES.cs01.end.play, 'cs02', 'the height chart rolls straight into the raid');
  assert.equal(CUTSCENES.cs02.end.flags['prologue.raid'], true);
  assert.equal(CUTSCENES.cs02.end.load, undefined, 'no reload after the raid');
  assert.equal(CUTSCENES.cs02.end.env, 'meadow_evening', 'gold after the raid');
  for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) assert.equal(CUTSCENES.cs01b.end.flags[k], true, k);
  assert.equal(CUTSCENES.cs01b.end.chapter, 1);
  assert.equal(CUTSCENES.cs01b.end.player.outfit, 'armour');
  assert.equal(typeof CUTSCENES.cs01b.end.load, 'function', 'Chapter 1 zones: level.refresh, else a reload under the wipe');
  assert.equal(CUTSCENES.cs03.end.flags['meadow.pudding'], 'netted');
  assert.deepEqual(CUTSCENES.cs03.end.arena, { id: 'glade', lock: true });
  assert.equal(CUTSCENES.cs03.end.objective.needClear, 'glade');
  assert.equal(CUTSCENES.d01.end.flags['meadow.mochi'], true);
  assert.deepEqual(CUTSCENES.d01.end.toasts, ['toast.mochi']);
  assert.ok(CUTSCENES.cs01.prologue && CUTSCENES.cs02.prologue && CUTSCENES.cs01b.prologue && CUTSCENES.g01.prologue, 'the prologue is skippable on the first viewing');
  for (const id of ['cs01', 'cs02', 'cs01b', 'g01']) assert.equal(CUTSCENES[id].once, true, `${id} once per save`);
  assert.equal(CUTSCENES.cs03.prologue, undefined, 'CS-03 is skippable only after a viewing');
  assert.equal(CUTSCENES.g01.inputSkip, 1.0, 'G-01: any input after 1.0 s');
  assert.equal(CUTSCENES.tutbow.letterbox, false); assert.equal(CUTSCENES.tutbow.hud, true, 'tutbow keeps the HUD');
  assert.equal(CUTSCENES.tutbow.end.player.outfit, 'tunic_bow');
  assert.deepEqual(CUTSCENES.tutpearl.end.keep, ['pearl'], 'Pearl stays as the guide');
  walkSteps(CUTSCENES.tutpearl.steps, (s) => assert.ok(!(s.t === 'despawn' || (s.t === 'actor' && s.moveTo === 'barn_door')), 'no scamper back to the barn'));
});

test('WA §6.2: old saves map onto the new prologue order; the stage follows the flags', () => {
  const st = (flags) => { const f = { ...flags }; return { f, getFlag: (k) => f[k], setFlag: (k, v) => { f[k] = v; } }; };
  const a = st({ 'prologue.armour': true });
  assert.deepEqual(migrateFlags(a), ['prologue.start']); assert.equal(prologueStage(a), 'practice');
  const b = st({ 'prologue.armour': true, 'prologue.tutorial': true });
  assert.deepEqual(migrateFlags(b), ['prologue.start', 'prologue.practice', 'prologue.chart']); assert.equal(prologueStage(b), 'raid', 'CS-02 is next');
  const c = st({ 'prologue.armour': true, 'prologue.tutorial': true, 'prologue.done': true });
  migrateFlags(c); assert.equal(prologueStage(c), 'done');
  assert.deepEqual(migrateFlags(c), [], 'idempotent');
  assert.equal(prologueStage(st({})), 'title');
  assert.equal(prologueStage(st({ 'prologue.start': true, 'prologue.practice': true })), 'chart');
  assert.equal(prologueStage(st({ 'prologue.start': true, 'prologue.practice': true, 'prologue.chart': true, 'prologue.raid': true })), 'suit');
});

test('WA §6.3: new adventure on the title — no fade, no reload; CS-00 ends normally (camera blend), prologue.start, practice outfit', async () => {
  const ctx = fakeCtx();
  const loads = [], fades = [], outfits = [], cams = [];
  ctx.levels.load = async (id, sp) => { loads.push([id, sp]); };
  ctx.levels.current = { id: 'meadow' };
  ctx.player.setOutfit = (o) => outfits.push(o);
  ctx.cam.mode = (m, o) => cams.push([m, o]);
  const story = new StoryManager(ctx);
  await story.init();
  const origApply = story.cinema.apply.bind(story.cinema);
  story.cinema.apply = (step, ...r) => { if (step?.fade) fades.push(step.fade); return origApply(step, ...r); };
  story.play('cs00');
  for (let k = 0; k < 4; k++) story.update(0.05);
  assert.equal(story.playingId, 'cs00');
  await story.newGame({ difficulty: 'knight' });
  assert.deepEqual(loads, [], 'no level reload');
  assert.ok(!fades.some((f) => (f.alpha ?? 1) > 0), 'no fade to a colour');
  assert.equal(story.isPlaying, false, 'control at once (the title loop ended)');
  assert.equal(ctx.state.getFlag('prologue.start'), true);
  assert.equal(outfits.at(-1), 'tunic', 'practice starts in the tunic (sword on), the bow is the reward');
  assert.ok(cams.some(([m, o]) => m === 'follow' && o?.blend === 1.1), 'MEME_LOOP → follow blend over 1.1 s');
  assert.equal(TITLE_BLEND, 1.1);
});

test('WA §2.7: story fades are cream, never black (a black or colourless fade-in becomes FADE_COLOR)', () => {
  const ctx = fakeCtx({ systems: false });
  const seen = [];
  const story = new StoryManager(ctx);
  story.cinema.overlay.apply = (c) => { if (c.fade) seen.push(c.fade); };
  story.cinema.apply({ fade: { to: '#000', alpha: 1, dur: 0.5 } });
  story.cinema.apply({ fade: { alpha: 1, dur: 0.5 } });
  story.cinema.apply({ fade: { alpha: 0, dur: 0.5 } });
  assert.equal(seen[0].to, FADE_COLOR); assert.equal(seen[1].to, FADE_COLOR); assert.equal(seen[2].to, undefined);
  assert.ok(isBlack('#000') && isBlack('#000000') && isBlack('black') && !isBlack(FADE_COLOR));
  // no cutscene data asks for black
  for (const [id, def] of ALL) walkSteps(def.steps, (s, p) => { if (s.t === 'ui' && s.fade?.to) assert.ok(!isBlack(s.fade.to), `${id} ${p}: black fade`); });
});

test('story.W1: banned words (WA §8.6) absent from display text; vocabulary swaps; the rows the tables missed', () => {
  const BAN = /\b(cages?|caged|bars|stocks|prison|war|war-wagon|warchief|warlord|legion|battlefield|grimjaw|gloom|bogmire|smugglers?|slain|slay|kill|killed|dead|death|die|died|blood|skull|grave|corpse)\b/i;
  const bad = [];
  for (const [k, row] of Object.entries(S)) {
    if (k.startsWith('cs08.') || k.startsWith('name.')) continue;
    for (const v of [row.default, row.homage]) if (v && BAN.test(v.replace(/Nine Lives/g, ''))) bad.push(`${k}: ${v}`);
  }
  assert.deepEqual(bad, []);
  assert.ok(!Object.values(S).some((r) => /Midnight Practice/.test(r.default)), 'no Midnight Practice');
  for (const [k, v] of [['quest.meadow.mochi', 'Help Mochi out of the tipped cart'], ['obj.mochi', "Pop Mochi's carrier open"],
    ['toast.exit.mochi', "Mochi's still stuck in his carrier! Back to the cart!"], ['name.cacklejaw', 'Big Chief Cacklejaw'], ['region.bog', 'Glimmerbog'],
    ['d01.3', "Then we're the Almost Knights!"], ['cs01.3', 'Too small for the sword, Clementine. One ear-tuft short. Next year!'],
    ['cs01.8', "Tomorrow I'm front row. I made a sign!"], ['name.cow', 'Very Suspicious Cow'], ['tut.cow.2', "MOO. (Ooh, you're getting warmer!)"],
    ['menu.continue', 'Keep going!'], ['menu.newGame', 'New adventure'], ['title.tap', 'Tap to play!'], ['title.press', 'Press any key to play!'],
    ['life.lost', 'Boing! Back on her paws. {n} lives left'], ['bark.clem.respawn.2', '...Ow. Okay.'], ['hud.boss.bonked', 'BONKED!'],
    ['cs08.1', "Nobody's coming."], ['cs08.2', "So I'm staying."], ['cs08.3', 'Nobody? Excuse me. We are SOMEBODY.']]) assert.equal(t(k), v, k);
  assert.ok(!has('cs01.9') && !has('cs01.caption'), 'WA §8.6 deleted rows');
  // no Mochi string still names the Old Bridge (WA16 moved him to the cart)
  for (const [k, r] of Object.entries(S)) if (/mochi/i.test(k) || /Mochi/.test(r.default)) assert.ok(!/Old Bridge/.test(r.default), `${k} names the Old Bridge`);
  for (const k of ['tut.red', 'tut.aoe', 'tut.gold', 'offer.kitten.q', 'offer.kitten.yes', 'offer.kitten.no', 'offer.kitten.toast', 'results.rank.clawsome',
    'cs05.5', 'cs05.6', 'cs09.7', 'cs09.8', 'cs09.9', 'cs16.17', 'cs16.18', 'cs16.19', 'toast.friend', 'bark.clem.bonk', 'loading.tip.13', 'cs01.helm', 'tutbow.1']) assert.ok(has(k), k);
});

test('story.W1: practice hints ≤ 7 words (glyph tokens count as one), Pearl lines ≤ 42 chars, Clem lines ≤ 8 words (allowlist)', () => {
  const words = (s) => s.replace(/\[[^\]]+\]/g, 'G').split(/\s+/).filter(Boolean).length;
  for (const s of TUTORIAL_STEPS) for (const k of [s.textKey, s.textKey + '.pad', s.textKey + '.touch']) if (has(k)) assert.ok(words(t(k)) <= 7, `${k}: "${t(k)}" has ${words(t(k))} words`);
  for (const k of ['tut.skip', 'tut.skip.touch', 'tut.done', 'tut.skipped', 'tut.title']) assert.ok(words(t(k)) <= 7, k);
  for (const k of Object.keys(S).filter((x) => x.startsWith('pearl.') || x.startsWith('tutbow.'))) assert.ok(t(k).length <= 42, `${k}: ${t(k).length} chars`);
  // Clem's rule: every scene line spoken by swordcat ≤ 8 words, except the ST §6.2 allowlist
  const ALLOW = new Set(['cs04.2', 'cs04.3', 'cs04.4', 'cs04.5', 'cs16.9', 'cs15.3', 'bark.clem.kitten', 'cs09.4']);
  for (const [id, def] of ALL) walkSteps(def.steps, (s, p) => {
    if (s.t !== 'say' || s.who !== 'swordcat' || ALLOW.has(s.key)) return;
    assert.ok(words(t(s.key)) <= 8, `${id} ${p}: ${s.key} "${t(s.key)}" (${words(t(s.key))} words)`);
  });
});

test('story.W5: CS-02 ≤ 55 s with STORY.cs02Cut (the long cut is longer); no prologue scene > 25 s before practice is done', () => {
  assert.equal(STORY.cs02Cut, true);
  const cut = sceneLength(cs02Steps(true)), long = sceneLength(cs02Steps(false));
  assert.ok(cut <= 55, `CS-02 cut ${cut.toFixed(1)} s`);
  assert.ok(cut >= 38, `CS-02 keeps its beats (${cut.toFixed(1)} s)`);
  assert.ok(long > cut + 8, 'the long cut restores the trip and REVERSE_HORDE beats');
  assert.deepEqual(CUTSCENES.cs02.steps.length, cs02Steps(true).length, 'the default export follows STORY.cs02Cut');
  // WA27: before tut.done only tutbow / tutpearl play (≤ 25 s); the chart (after practice) is ~20 s
  for (const id of ['tutbow', 'tutpearl']) assert.ok(sceneLength(CUTSCENES[id].steps) <= 25, id);
  assert.ok(sceneLength(CUTSCENES.cs01.steps) <= 25, `CS-01 ${sceneLength(CUTSCENES.cs01.steps).toFixed(1)} s`);
  assert.ok(sceneLength(CUTSCENES.cs01b.steps) <= 25, 'Suit Up ~18 s');
  // every story fact stays: the meme shot, Cacklejaw's lines, Pilfer's two thefts, Pearl's call, her choice
  const keys = [], presets = [];
  walkSteps(CUTSCENES.cs02.steps, (s) => { if (s.t === 'say') keys.push(s.key); if (s.t === 'cam' && s.preset) presets.push(s.preset); });
  assert.deepEqual(keys, ['cs02.1', 'cs02.2', 'cs02.3', 'cs02.4', 'cs02.5', 'cs02.6']);
  assert.ok(presets.includes('MEME_LOOP'));
});

test('story.W5 / W7: no night or grey preset cue in the prologue scenes; WA §9 banned audio ids and legacy literals absent from cutscenes', () => {
  const dir = path.join(ROOT, 'src/story/cutscenes');
  const BANNED_AUDIO = /dark_forest_creepy|victory_8bit_loop|creature\/c80_monster_|impact\/chain_|pickup\/powerup_downer/;
  const LEGACY = /['"](meadow_night|forest_night|hub_grey)['"]/;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    assert.ok(!BANNED_AUDIO.test(src), `${f}: banned audio id`);
    assert.ok(!LEGACY.test(src), `${f}: legacy night / grey preset literal`);
  }
  const NIGHT = /night|grey|storm/;
  for (const id of ['cs00', 'tutbow', 'tutpearl', 'cs01', 'cs02', 'cs01b', 'g01']) {
    walkSteps(CUTSCENES[id].steps, (s, p) => { if (s.t === 'env' && s.preset) assert.ok(!NIGHT.test(s.preset), `${id} ${p}: ${s.preset}`); });
    const e = CUTSCENES[id].end.env; if (e) assert.ok(!NIGHT.test(typeof e === 'string' ? e : e.preset ?? ''), `${id} end env`);
  }
  const presetOf = (id) => { const out = []; walkSteps(CUTSCENES[id].steps, (s) => { if (s.t === 'env' && s.preset) out.push(s.preset); }); return out; };
  assert.deepEqual(presetOf('cs00'), ['meadow_morning']); assert.deepEqual(presetOf('cs01'), ['meadow_day']);
  assert.deepEqual(presetOf('cs02'), ['meadow_giggle']); assert.deepEqual(presetOf('cs01b'), ['meadow_evening']);
  let fog = null; walkSteps(CUTSCENES.cs00.steps, (s) => { if (s.t === 'env' && s.fogDensity != null) fog = s.fogDensity; });
  assert.equal(fog, 0.035);
  // WA §8.6a: the CS-04 / CS-06 / CS-10 swaps
  const tracks = (id) => { const out = []; walkSteps(CUTSCENES[id].steps, (s) => { if (s.t === 'music') out.push(s.track); }); return out; };
  assert.equal(CUTSCENES.cs04.end.env, 'forest_twilight'); assert.equal(CUTSCENES.cs04.end.music.track, 'field_of_dreams');
  assert.ok(tracks('cs06').includes('tavern_old_tower_inn') && !tracks('cs06').includes('story_lament_warriors_soul'));
  assert.deepEqual(tracks('cs10').filter(Boolean), ['tavern_old_tower_inn', 'story_lament_warriors_soul', 'village_bards_tale'], 'lament only on the window shot');
  assert.equal(CUTSCENES.cs10.end.env, 'hub_hush'); assert.equal(CUTSCENES.cs10.end.music.track, 'village_bards_tale');
});

test('story.W6: every boss defeat scene references a befriend key; befriend lines follow the defeat', () => {
  const BEFRIEND = { cs05: ['cs05.5', 'cs05.6'], cs09: ['cs09.7', 'cs09.8', 'cs09.9'] };
  for (const [boss, id] of Object.entries(BOSS_SCENES)) {
    if (!CUTSCENES[id]) { assert.ok(PLACEHOLDER_ENDS[id], `${boss}: ${id} placeholder (M3)`); continue; }
    const keys = []; walkSteps(CUTSCENES[id].steps, (s) => { if (s.t === 'say') keys.push(s.key); });
    for (const k of BEFRIEND[id]) assert.ok(keys.includes(k), `${id} says ${k}`);
    assert.equal(keys.at(-1), BEFRIEND[id].at(-1), `${id} ends on a befriend line`);
  }
});

test('PERF S5t: no PointLight in story code; the cutscene lamp claims ENV_U.uLamps slot 0 and gives it back', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(path.join(ROOT, 'src/story')).filter((x) => x.endsWith('.js'))) assert.ok(!/new THREE\.PointLight|PointLight\(/.test(fs.readFileSync(f, 'utf8')), `${f}: PointLight`);
  const lamps = [new THREE.Vector4(1, 2, 3, 4), new THREE.Vector4(0, -999, 0, 0)];
  const U = { uLamps: { value: lamps }, uLampCol: { value: new THREE.Color('#123456') }, uLampStr: { value: 0 } };
  const ctx = { env: { ENV_U: U } };
  const owner = {};
  assert.equal(claimLamp(ctx, owner, [5, 1, 6], { r: 6, str: 1 }), true);
  assert.deepEqual(lamps[0].toArray(), [5, 1, 6, 6]); assert.equal(U.uLampStr.value, 1); assert.equal(lampHolder(), owner);
  releaseLamp(ctx, {});                                       // not the owner: nothing changes
  assert.deepEqual(lamps[0].toArray(), [5, 1, 6, 6]);
  releaseLamp(ctx, owner);
  assert.deepEqual(lamps[0].toArray(), [1, 2, 3, 4]); assert.equal(U.uLampStr.value, 0); assert.equal(U.uLampCol.value.getHexString(), '123456');
  assert.equal(claimLamp({ env: {} }, owner, [0, 0, 0]), false, 'no lamps yet: a no-op');
});

test('PERF S1t: meadow scenes are bundled, later chapters load lazily (and are prefetched per level); index.js covers them all', async () => {
  assert.ok(['cs00', 'cs01', 'cs01b', 'cs02', 'tutbow', 'tutpearl', 'g01', 'cs03', 'cs03b', 'd01'].every((id) => EAGER[id]));
  for (const id of Object.keys(LAZY)) assert.ok(!EAGER[id] && CUTSCENES[id], `${id} lazy + in index.js`);
  assert.deepEqual([...Object.keys(EAGER), ...Object.keys(LAZY)].sort(), Object.keys(CUTSCENES).sort());
  for (const ids of Object.values(SCENE_LEVEL)) for (const id of ids) assert.ok(LAZY[id], id);
  const def = await loadScene('cs04');
  assert.equal(def, CUTSCENES.cs04);
  assert.equal(await loadScene('d04earlgrey'), CUTSCENES.d04earlgrey);
  assert.equal(await loadScene('nope'), null);
  // the StoryManager plays a lazy scene once it has loaded; isPlaying is true meanwhile
  const ctx = fakeCtx();
  ctx.params = { ...(ctx.params ?? {}), test: false };      // ?test prefetches every scene up front
  const story = new StoryManager(ctx);
  await story.init();
  assert.equal(story.registry.cs08, undefined);
  const p = story.play('cs08');
  assert.equal(story.isPlaying, true, 'loading counts as playing (triggers wait)');
  for (let k = 0; k < 200 && story.playingId !== 'cs08'; k++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(story.playingId, 'cs08');
  story.skipAll();
  await p;
});

test('once-per-save scenes: a second request is refused (world trigger + director), except in ?test', async () => {
  const ctx = fakeCtx();
  ctx.params = { ...(ctx.params ?? {}), test: false };
  const story = new StoryManager(ctx);
  await story.init();
  story.registry = { ...story.registry, o1: { id: 'o1', once: true, steps: [{ t: 'wait', dur: 0.1 }], end: { cam: 'follow' } } };
  const a = story.play('o1');
  for (let k = 0; k < 6; k++) story.update(0.05);
  await a;
  const b = await story.play('o1');
  assert.equal(b.refused, true);
  ctx.params.test = true;
  const c = story.play('o1');
  assert.equal(story.playingId, 'o1');
  story.skipAll(); await c;
});

test('rewards: friends and the Holy card are celebrations (E.REWARD + sticker book); the toast stays only until ui celebrates', () => {
  const ctx = fakeCtx({ systems: false });
  const ev = []; ctx.bus.on('reward', (p) => ev.push(['reward', p])); ctx.bus.on('ui:toast', (p) => ev.push(['toast', p.key]));
  announce(ctx, 'toast.mochi');
  assert.deepEqual(ev, [['reward', { kind: 'friend', id: 'mochi' }], ['toast', 'toast.mochi']]);
  assert.equal(ctx.state.getFlag('sticker.mochi'), true);
  ev.length = 0; ctx.ui = { handles: { reward: true } };
  announce(ctx, 'toast.holy'); announce(ctx, 'toast.golden'); announce(ctx, 'toast.checkpoint');
  assert.deepEqual(ev, [['reward', { kind: 'card', id: 'holy' }], ['toast', 'toast.checkpoint']], 'golden: ui cards it from state:unlock');
  assert.ok(Object.values(REWARD_TOASTS).every((r) => has(`card.${r.id}.title`)));
  for (const s of TUTORIAL_STEPS.filter((x) => x.reward)) assert.ok(has(`sticker.${s.reward}`), s.reward);
  for (const id of ['bow', 'knight', 'mochi']) assert.ok(has(`sticker.${id}`) && has(`card.${id}.title`), id);
});

test('AUTOCAM story.2: prologue and M2 hand-backs all end in follow (CS-04, CS-08, CS-10 included)', () => {
  for (const id of ['cs04', 'cs08', 'cs10', 'cs01b', 'cs02', 'tutbow', 'tutpearl']) {
    const c = CUTSCENES[id].end.cam;
    assert.ok(c === 'follow' || c?.mode === 'follow', `${id}: ${JSON.stringify(c)}`);
  }
  assert.deepEqual(CUTSCENES.cs00.end.cam, { mode: 'follow', blend: TITLE_BLEND, ease: 'inOutSine' });
  // the ending asks for the cinematic composer through the runner (ART A3.2)
  assert.ok(placeholderScene('cs16').cinematic, 'CS-16 placeholder carries cinematic');
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
  assert.equal(chapterInfo('prologue').title, 'Knighting Morning', 'WA13');
  assert.equal(chapterInfo('gate').title, 'Where I Stand');
  assert.equal(chapterInfo('bog').region, 'Glimmerbog');
  const ctx = fakeCtx({ systems: false });
  assert.equal(chapterOf(ctx.state, 'meadow'), 'prologue');
  ctx.state.setFlag('prologue.done', true);
  assert.equal(chapterOf(ctx.state, 'meadow'), 1);
  assert.equal(chapterOf(ctx.state, 'keep'), 6);
});

// ====================================================================================================== Morning Practice
test('story.W3: PracticeLog completes the 7 WA §7.1 lessons in order; position facts are latched', () => {
  assert.deepEqual(TUTORIAL_STEPS.map((s) => s.id), ['move', 'bonk', 'jump', 'roll', 'stand', 'parry', 'meow']);
  assert.ok(TUTORIAL_STEPS.every((s) => s.guide === 'pearl'), 'Pearl guides every lesson');
  assert.deepEqual(TUTORIAL_STEPS.filter((s) => s.reward).map((s) => s.reward), ['bonk', 'hop', 'roll', 'stand', 'parry', 'found']);
  const log = new PracticeLog();
  assert.equal(log.step.id, 'move');
  log.note({ type: 'moved', d: 4 }); log.note({ type: 'near', d: 5 });
  assert.equal(log.complete(), false);
  log.note({ type: 'near', d: PRACTICE.bonkR - 0.1 });
  assert.equal(log.complete(), true, 'reaching the dummy ring ends the move lesson at once'); log.advance();
  log.note({ type: 'hit', attackId: 'slash1', dummy: true }); assert.equal(log.complete(), false);
  assert.ok(log.progress() > 0 && log.dots().half, 'a dummy hit half-fills the paw dot');
  log.note({ type: 'hit', attackId: 'slash3', dummy: true }); assert.equal(log.complete(), true); log.advance();
  assert.equal(log.step.id, 'jump'); assert.equal(log.complete(), false);
  log.note({ type: 'crossed' }); assert.equal(log.complete(), true); log.advance();
  log.note({ type: 'dodge', nearSack: false }); assert.equal(log.complete(), false);
  log.note({ type: 'dodge', nearSack: true }); assert.equal(log.complete(), true); log.advance();
  log.note({ type: 'block' }); assert.equal(log.complete(), true, 'stand needs 1 block (was 2)'); log.advance();
  assert.equal(log.step.id, 'parry'); assert.equal(log.complete(), false);
  log.note({ type: 'block' }); assert.equal(log.parryFails, 1, 'a plain block in the parry lesson is a failed parry');
  log.note({ type: 'parry' }); assert.equal(log.complete(), true); log.advance();
  assert.equal(log.step.id, 'meow');
  log.note({ type: 'cow' }); assert.equal(log.complete(), true);
  assert.equal(log.advance(), null); assert.ok(log.finished);
  assert.deepEqual(log.dots(), { n: 7, of: 7, half: false });
  assert.ok(inPractice(0, -80) && inPractice(0, -64) && !inPractice(0, -55), 'the title spot is inside the field');
  assert.equal(PRACTICE.skipHold, 1.0); assert.equal(PRACTICE.nextDelay, 0.6); assert.equal(PRACTICE.idleDemo, 8); assert.equal(PRACTICE.chipAfter, 6);
  assert.deepEqual({ scale: PRACTICE.parrySlowMo.scale, firstOnly: PRACTICE.parrySlowMo.firstOnly }, { scale: 0.45, firstOnly: true });
});

test('tutorial: the move lesson also ends after 10 m; 6 dummy hits without a finisher still bonk', () => {
  const log = new PracticeLog();
  log.note({ type: 'moved', d: 9.9 }); assert.equal(log.complete(), false);
  log.note({ type: 'moved', d: 0.2 }); assert.equal(log.complete(), true); log.advance();
  for (let k = 0; k < 5; k++) log.note({ type: 'hit', attackId: 'slash1', dummy: true });
  assert.equal(log.complete(), false);
  log.note({ type: 'hit', attackId: 'slash2', dummy: true });
  assert.equal(log.complete(), true);
});

test('tutorial: fence side, nearest dummy, the guide clock (fold 6 s, ghost paw at 8 s, skip hint at 20 s)', () => {
  assert.equal(fenceSide(-10, -86), 1); assert.equal(fenceSide(-10, -88), -1); assert.equal(fenceSide(5, -88), 0, 'past the fence end: no side');
  assert.ok(Math.abs(nearestDummy(0, -78) - 2) < 1e-9);
  const c = new GuideClock();
  const ev = [];
  for (let k = 0; k < 220; k++) { const e = c.tick(0.1); if (e.fold) ev.push(['fold', +(c.t.toFixed(1))]); if (e.demo) ev.push(['demo', +(c.t.toFixed(1))]); if (e.skipHint) ev.push(['skip', +(c.t.toFixed(1))]); }
  assert.equal(ev[0][0], 'fold'); assert.ok(Math.abs(ev[0][1] - 6) <= 0.11, 'speech folds at 6 s');
  assert.equal(ev[1][0], 'demo'); assert.ok(Math.abs(ev[1][1] - 8) <= 0.11, 'idle demo at 8 s');
  assert.equal(ev.filter(([k, t]) => k === 'skip' && Math.abs(t - 20) <= 0.11).length, 1, 'skip hint once after 20 s');
  assert.equal(ev.filter(([k]) => k === 'demo')[1][1] > 8 + PRACTICE.demoCycles * PRACTICE.demoCycle, true, 'then waits 8 s again');
  const d = new GuideClock(); for (let k = 0; k < 70; k++) d.tick(0.1); d.poke();
  assert.equal(d.tick(0.1).demo, false, 'progress resets the idle clock');
  const pf = new ParryFails();
  assert.deepEqual([pf.fail(), pf.fail(), pf.fail(), pf.fail()], [false, false, true, false], 'the 3rd failed parry asks once');
});

/** A tiny ctx for driving Tutorial without a game. */
function tutCtx({ device = 'kbm', preset = 'hybrid', iso = true, flags = {}, interactables = [], party = [] } = {}) {
  const handlers = new Map(), emitted = [];
  const bus = { on: (ev, fn) => { (handlers.get(ev) ?? handlers.set(ev, []).get(ev)).push(fn); return () => {}; }, emit: (ev, p) => { emitted.push([ev, p]); for (const fn of handlers.get(ev) ?? []) fn(p); } };
  const f = { ...flags };
  const pos = { x: 0, z: -64, y: 0, clone() { return { ...this, copy(o) { this.x = o.x; this.z = o.z; return this; } }; }, copy(o) { this.x = o.x; this.z = o.z; return this; } };
  const ctx = {
    bus, emitted, params: {},
    state: { getFlag: (k) => f[k], setFlag: (k, v) => { f[k] = v; }, settings: {}, difficulty: 'knight' },
    input: { device, preset, down: () => false },
    cam: { isIso: iso },
    game: { mode: 'play' },
    levels: { current: { id: 'meadow', interactables, actor: () => null, critter: () => null } },
    companions: { active: party },
    player: { pos, onGround: true, facing: 0 },
    strings: { t: (k) => k, has: () => true },
  };
  return { ctx, f };
}
const prompts = (ctx) => ctx.emitted.filter(([e]) => e === 'story:prompt').map(([, p]) => p);
const host = (o = {}) => ({ isPlaying: false, cinema: { skip() {}, apply() {} }, flag(k, v) { this._f?.(k, v); }, play: () => Promise.resolve({}), toChart() { this.charted = true; }, ...o });

test('story.W3: practice starts on the title spot with Pearl\'s intro, then guide bubbles with paw dots and the ghost-paw data', () => {
  const { ctx } = tutCtx({ flags: { 'prologue.start': true } });
  const tu = new Tutorial(ctx, host());
  tu.init();
  assert.ok(tu.eligible());
  tu.update(0.05);
  assert.ok(tu.active);
  let ps = prompts(ctx);
  assert.equal(ps.at(-1).speaker, 'pearl'); assert.equal(ps.at(-1).say, 'pearl.start'); assert.equal(ps.at(-1).textKey, null);
  for (let k = 0; k < 60; k++) tu.update(0.05);                // P0 2.4 s, then the move lesson
  ps = prompts(ctx);
  const mv = ps.at(-1);
  assert.equal(mv.textKey, 'tut.move'); assert.equal(mv.say, 'pearl.race'); assert.equal(mv.speaker, 'pearl');
  assert.deepEqual(mv.stepDots, { n: 0, of: 7, half: false });
  assert.equal(mv.demo, 'tap'); assert.equal(mv.target.length, 3); assert.equal(mv.idleDemo, 8); assert.equal(mv.chipAfter, 6);
  // walking: the same bubble wiggles (same speaker / textKey / say), the dot half-fills
  ctx.player.pos.z = -66;
  tu.update(0.05);
  const up = prompts(ctx).at(-1);
  assert.equal(up.textKey, 'tut.move'); assert.equal(up.say, 'pearl.race'); assert.ok(up.progress > 0); assert.equal(up.stepDots.half, true);
  // the 18 % strip rule: no payload ever asks for two bubbles (one speaker at a time)
  assert.ok(prompts(ctx).every((p) => p.kind === 'tutorial' && p.id === 'tutorial'));
});

test('story.W3: a lesson done → mint ✓ (done), the sticker reward + sticker flag, the next lesson after 0.6 s', () => {
  const { ctx, f } = tutCtx({ flags: { 'prologue.start': true } });
  const tu = new Tutorial(ctx, host({ flag: (k, v) => { f[k] = v; } }));
  tu.init();
  tu.log.i = TUTORIAL_STEPS.findIndex((s) => s.id === 'jump'); tu.active = true; tu._intro = true; tu._shown = null; tu.waitT = 0;
  ctx.player.pos.x = -6; ctx.player.pos.z = -86;
  tu.update(0.05);                                            // the jump prompt
  assert.equal(prompts(ctx).at(-1).textKey, 'tut.jump');
  ctx.player.pos.z = -88;                                     // over the fence
  tu.update(0.05);
  tu.update(0.05);
  const done = prompts(ctx).find((p) => p.done && p.ok);
  assert.ok(done, 'the chip turns mint');
  assert.equal(f['tut.jump.done'], true, 'the fence nav link opens');
  assert.deepEqual(ctx.emitted.filter(([e]) => e === 'reward').map(([, p]) => p), [{ kind: 'sticker', id: 'hop' }]);
  assert.equal(f['sticker.hop'], true);
  assert.equal(tu.log.step.id, 'roll');
  for (let k = 0; k < 14; k++) tu.update(0.05);
  assert.equal(prompts(ctx).at(-1).textKey, 'tut.roll');
  assert.equal(prompts(ctx).at(-1).say, 'pearl.sack');
});

test('story.W3: the bonk lesson plays `tutbow` (Pink Bow) before the jump; the meow lesson plays `tutpearl` and ends practice', async () => {
  const played = [];
  const { ctx, f } = tutCtx({ flags: { 'prologue.start': true } });
  const story = host({ play: (id) => { played.push(id); return Promise.resolve({ id }); }, flag: (k, v) => { f[k] = v; } });
  const tu = new Tutorial(ctx, story);
  tu.init();
  tu.log.i = 1; tu.active = true; tu._intro = true; tu.waitT = 0;
  tu.update(0.05);
  ctx.bus.emit('combat:hit', { attacker: ctx.player, target: { kind: 'dummy' }, attackId: 'slash3' });
  tu.update(0.05);
  assert.deepEqual(played, ['tutbow']);
  assert.ok(tu.pending, 'practice waits for the bow scene');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(tu.pending, false); assert.equal(tu.log.step.id, 'jump');
  tu.log.i = TUTORIAL_STEPS.findIndex((s) => s.id === 'meow'); tu._shown = null; tu.waitT = 0;
  tu.update(0.05);
  tu.log.note({ type: 'cow' });
  tu.update(0.05);
  assert.deepEqual(played, ['tutbow', 'tutpearl']);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(f['prologue.practice'], true, 'practice done');
  assert.equal(story.charted, true, 'Pearl leads her to the height chart (P8)');
  assert.ok(ctx.emitted.some(([e, p]) => e === 'ui:toast' && p.key === 'tut.done'));
});

test('story.W3: the first Sir Wobble swing of the parry lesson runs in 0.45 slow motion, once', () => {
  const { ctx } = tutCtx({ flags: { 'prologue.start': true } });
  const slow = [];
  ctx.game.slowMo = (s, t) => slow.push([s, +t.toFixed(2)]);
  const tu = new Tutorial(ctx, host());
  tu.init();
  tu.log.i = TUTORIAL_STEPS.findIndex((s) => s.id === 'parry'); tu.active = true; tu._intro = true;
  const wk = { kind: 'wobble_knight' };
  ctx.bus.emit('combat:telegraph', { id: 1, actor: wk, duration: 0.9 });
  ctx.bus.emit('combat:telegraph', { id: 2, actor: wk, duration: 0.9 });
  assert.deepEqual(slow, [[0.45, 2]]);
});

test('story.W3: the cow\'s warmer / colder clues each speak once; the 3rd failed parry asks ui for the kitten offer', () => {
  const { ctx } = tutCtx({ flags: { 'prologue.start': true } });
  const said = [], offers = [];
  const cow = { pos: { x: 12, z: -72 } };
  ctx.levels.current.critter = (id) => (id === PRACTICE.cowId ? cow : null);
  ctx.ui = { offerKitten: (o) => { offers.push(o); return Promise.resolve(null); } };
  const tu = new Tutorial(ctx, host({ barks: { say: (a, k) => said.push(k) } }));
  tu.init();
  tu.log.i = TUTORIAL_STEPS.findIndex((s) => s.id === 'meow'); tu.active = true; tu._intro = true; tu._shown = tu.log.i;
  ctx.player.pos.x = 12; ctx.player.pos.z = -95;              // > 14 m away
  for (let k = 0; k < 220; k++) tu.update(0.05);
  ctx.player.pos.z = -76;                                     // < 8 m
  tu.update(0.05); tu.update(0.05);
  ctx.bus.emit('player:meow', { position: { x: 12, z: -76 } });
  ctx.bus.emit('player:meow', { position: { x: 12, z: -76 } });
  assert.deepEqual(said, ['tut.cow.1', 'tut.cow.2', 'tut.cow.3']);
  // parry lesson: blocked / hit swings are failed parries; the 3rd asks once
  tu.log = new PracticeLog(); tu.log.i = TUTORIAL_STEPS.findIndex((s) => s.id === 'parry');
  const wk = { kind: 'wobble_knight' };
  for (let k = 0; k < 4; k++) ctx.bus.emit('combat:hit', { attacker: wk, target: ctx.player, blocked: k % 2 === 0 });
  assert.deepEqual(offers, [{ speaker: 'pearl' }]);
});

test('story.W4: glyph one-shots on telegraph:first — once per save (a second red sighting shows nothing)', () => {
  const { ctx, f } = tutCtx({ flags: { 'prologue.done': true } });
  const tu = new Tutorial(ctx, host());
  tu.init();
  const shown = () => ctx.emitted.filter(([e, p]) => (e === 'ui:toast' && /^tut\.(red|aoe|gold)$/.test(p.key)) || (e === 'story:prompt' && /^tut\.(red|aoe|gold)$/.test(p.hintKey ?? ''))).length;
  ctx.bus.emit('telegraph:first', { kind: 'red' });
  assert.equal(shown(), 1); assert.equal(f['seen.tut.red'], true);
  ctx.bus.emit('telegraph:first', { kind: 'red' });
  assert.equal(shown(), 1, 'a second red sighting shows nothing');
  ctx.bus.emit('telegraph:first', { kind: 'aoe' });
  ctx.bus.emit('telegraph:first', { kind: 'gold' });
  ctx.bus.emit('telegraph:first', { kind: 'parry' });
  assert.equal(shown(), 3);
  assert.deepEqual(GLYPH_HINTS, { red: 'tut.red', aoe: 'tut.aoe', gold: 'tut.gold' });
});

test('ON §4.5: with Mochi in the party a post-prologue hint is his guide bubble (then it folds away); before that a toast', () => {
  const { ctx } = tutCtx({ flags: { 'prologue.done': true }, party: [{ kittenId: 'mochi' }] });
  const tu = new Tutorial(ctx, host());
  tu.init();
  ctx.bus.emit('player:damaged', { hp: 3 });
  ctx.player.milk = 1;
  ctx.bus.emit('player:damaged', { hp: 3 });
  const p = prompts(ctx).find((x) => x.hintKey === 'tut.milk');
  assert.ok(p, 'Mochi says the milk hint');
  assert.equal(p.speaker, 'mochi'); assert.equal(p.say, 'mochi.hint.milk'); assert.equal(p.textKey, 'tut.milk');
  for (let k = 0; k < Math.ceil(HINT_SHOW / 0.5) + 1; k++) tu.update(0.5);
  assert.ok(prompts(ctx).some((x) => x.id === 'hint' && x.done), 'the bubble folds away');
  const solo = tutCtx({ flags: { 'prologue.done': true } });
  const t2 = new Tutorial(solo.ctx, host());
  t2.init();
  solo.ctx.player.milk = 1;
  solo.ctx.bus.emit('player:damaged', { hp: 3 });
  assert.ok(solo.ctx.emitted.some(([e, q]) => e === 'ui:toast' && q.key === 'tut.milk'), 'a toast before Mochi');
});

test('tutorial: skipping practice (hold Pause) sets prologue.practice and the fence link, then heads to the chart', () => {
  const { ctx, f } = tutCtx({ flags: { 'prologue.start': true } });
  const story = host({ flag: (k, v) => { f[k] = v; } });
  const tu = new Tutorial(ctx, story);
  tu.init();
  tu.update(0.05);
  ctx.input.down = (a) => a === 'pause';
  for (let k = 0; k < 25; k++) tu.update(0.05);
  assert.equal(f['prologue.practice'], true); assert.equal(f['tut.jump.done'], true);
  assert.ok(ctx.emitted.some(([e, p]) => e === 'ui:toast' && p.key === 'tut.skipped'));
  assert.equal(story.charted, true);
  assert.equal(tu.eligible(), false);
});

test('hints: tut.click after 20 s without an order (pointer schemes only); tut.talk near a talkable NPC; tut.zoom on the first arena', () => {
  const toasts = (ctx) => ctx.emitted.filter(([e]) => e === 'ui:toast').map(([, p]) => p.key);
  // tut.click
  for (const [opt, want] of [[{ device: 'kbm' }, true], [{ device: 'touch' }, true], [{ device: 'pad' }, false], [{ preset: 'keyboardOnly' }, false]]) {
    const { ctx } = tutCtx({ ...opt, flags: { 'prologue.done': true, 'prologue.tutorial': true } });
    const tu = new Tutorial(ctx, { isPlaying: false });
    tu.init();
    for (let k = 0; k < 21; k++) tu.update(1);
    assert.equal(toasts(ctx).includes('tut.click'), want, 'tut.click ' + JSON.stringify(opt));
  }
  {
    const { ctx } = tutCtx({ flags: { 'prologue.done': true } });
    const tu = new Tutorial(ctx, { isPlaying: false });
    tu.init();
    ctx.bus.emit('player:order', { kind: 'move', valid: true });
    for (let k = 0; k < 25; k++) tu.update(1);
    assert.ok(!toasts(ctx).includes('tut.click'), 'no tip once she used an order');
  }
  // tut.talk: proximity scan
  const npc = { id: 'talk_pip', kind: 'npc', prompt: 'prompt.talk', pos: { x: TALK_TIP_R + 3, z: -64 } };
  const { ctx, f } = tutCtx({ flags: { 'prologue.done': true, 'prologue.tutorial': true }, interactables: [npc] });
  const tu = new Tutorial(ctx, { isPlaying: false });
  tu.init();
  tu.update(0.6);
  assert.ok(!toasts(ctx).includes('tut.talk'), 'too far');
  npc.pos.x = TALK_TIP_R - 1;
  tu.update(0.6);
  assert.ok(toasts(ctx).includes('tut.talk'), 'in reach');
  assert.equal(f['seen.tut.talk'], true);
  tu.update(0.6);
  assert.equal(toasts(ctx).filter((k) => k === 'tut.talk').length, 1, 'once per save');
  // tut.zoom / tut.talk hint rows
  const zoom = HINTS.find((h) => h.key === 'tut.zoom'), talk = HINTS.find((h) => h.key === 'tut.talk');
  assert.ok(zoom && talk);
  assert.equal(zoom.on, 'arena:lock');
  assert.equal(!!zoom.when({ state: { getFlag: () => true }, cam: { isIso: true } }), true);
  assert.equal(!!zoom.when({ state: { getFlag: () => true }, cam: { isIso: false } }), false, 'no zoom in classic');
  assert.equal(!!talk.when({}, { prompt: 'prompt.talk', target: { kind: 'talk' } }), true);
  assert.equal(!!talk.when({}, { prompt: 'prompt.interact', target: { kind: 'vigil' } }), false);
});

test('CONTROLS_SPEC §14 + ON §4.3 copy: base / .pad / .touch variants, glyph tokens, no old bindings', () => {
  for (const k of ['tut.move', 'tut.bonk', 'tut.jump', 'tut.roll', 'tut.stand', 'tut.parry', 'tut.riposte', 'tut.bright', 'tut.pounce',
    'tut.reflect', 'tut.meow', 'tut.milk', 'tut.vigil', 'tut.companion', 'tut.holy', 'tut.golden', 'tut.zoom', 'tut.click', 'tut.talk', 'tut.rotate',
    'toast.cam.locked', 'toast.cam.unlocked', 'toast.cam.fitHold']) assert.ok(has(k), k);
  for (const k of ['tut.move', 'tut.bonk', 'tut.roll', 'tut.pounce', 'tut.vigil', 'tut.companion', 'tut.golden', 'tut.zoom', 'tut.talk']) assert.ok(has(k + '.pad'), k + '.pad');
  for (const k of ['tut.move', 'tut.bonk', 'tut.jump', 'tut.roll', 'tut.stand', 'tut.parry', 'tut.riposte', 'tut.bright', 'tut.pounce',
    'tut.meow', 'tut.milk', 'tut.vigil', 'tut.companion', 'tut.holy', 'tut.golden', 'tut.zoom', 'tut.click', 'tut.talk']) assert.ok(has(k + '.touch'), k + '.touch');
  for (let i = 1; i <= 13; i++) assert.ok(has('loading.tip.' + i), 'loading.tip.' + i);
  // C1: no copy teaches the old table (Space = jump, RMB = guard, mouse look, Q / E hard-coded keycaps)
  const all = Object.keys(S).filter((k) => /^(tut|toast|prompt|loading)./.test(k)).map((k) => [k, t(k)]);
  for (const [k, s] of all) {
    assert.ok(!/\[(Space|Q|E|J|K|L|RMB|LMB|Mouse)\]/.test(s), `${k}: hard-coded keycap in "${s}"`);
    assert.ok(!/look around with|move the mouse to look|right mouse.*(guard|block)/i.test(s) || k === 'toast.cam.unlocked', `${k}: old camera copy`);
  }
  assert.equal(t('tut.move'), 'Right-click the ground to walk.');
  assert.equal(t('tut.jump'), 'Hop the fence! [Jump]');
  assert.equal(t('tut.bonk.touch'), 'Tap the dummy. Bonk!');
  assert.equal(t('tut.title'), 'Morning Practice'); assert.equal(t('quest.prologue'), 'Morning Practice');
  // AUTOCAM story.1: the settings rows ui builds (labels + help)
  for (const k of ['settings.reduceCameraMotion', 'settings.camZoom', 'settings.biggerHero', 'settings.camLockMode', 'settings.camCursorLead',
    'settings.camLockMode.locked', 'settings.camLockMode.semi', 'settings.camLockMode.free', 'settings.hudMode', 'settings.tutorialHints', 'settings.hitWords']) assert.ok(has(k), k);
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
  const PROCEDURAL = new Set(['laugh', 'laughChorus', 'bell', 'sunbell', 'bellClunk', 'heartbeat', 'march', 'shimmer', 'crickets']);   // AudioManager.js PROC
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
