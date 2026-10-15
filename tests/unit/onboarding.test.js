// tests/unit/onboarding.test.js  (owner: story, TT2 G2) — the guided onboarding (docs/TOKENTAILS-PLAN.md §10.3, §10.7):
// StoryManager.guideTarget() for every practice lesson, prologue step, Chapter 1 onboarding step and a later quest
// step; sceneActive; the Skip chip; newGame({ skipPractice }); old mid-practice saves resuming at the nearest new
// lesson; the hop taught by a click across the practice fence; Sir Wobble stepping toward her; the Lantern Stone
// menu blocked while foes are alerted; the first fight (calm wave, soft first hit, onboard.firstFight); scene caps.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fakeCtx } from './_fakeCtx.mjs';
import { E } from '../../src/core/events.js';
import { ONBOARD, STORY } from '../../src/core/config.js';
import { Actor } from '../../src/core/Actor.js';
import { ScriptedActorMixin } from '../../src/core/ScriptedActor.js';
import { StoryManager, ONBOARD_IDS, prologueStage } from '../../src/story/StoryManager.js';
import { Tutorial, TUTORIAL_STEPS, PRACTICE, resumeLesson, OLD_LESSONS } from '../../src/story/tutorial.js';
import { ONBOARDING_STRINGS, registerOnboardingStrings } from '../../src/story/strings.onboarding.js';
import { t, has } from '../../src/story/strings.js';
import { sceneLength } from '../../src/story/Cutscene.js';
import { CUTSCENES } from '../../src/story/cutscenes/index.js';
import { BARN } from '../../src/story/cutscenes/cs01b.js';
import { Arena } from '../../src/world/Arena.js';
import { WobbleKnight, WOBBLE_REACH } from '../../src/world/PropActor.js';
import { foesAlerted, VIGIL } from '../../src/world/VigilStone.js';
import { UI } from '../../src/ui/UI.js';
import { tagLabel } from '../../src/ui/prompts.js';
import { detached } from '../../src/fx/Telegraphs.js';

class Cat extends ScriptedActorMixin(Actor) {
  constructor(ctx) { super(ctx, { faction: 'player' }); this.outfit = 'tunic'; this.maxHp = 8; this.hp = 8; }
  teleport({ pos, facing }) { this.pos.copy(pos); this.facing = facing; }
  setOutfit(o) { this.outfit = o; }
}

/** A story ctx on the meadow (no level geometry), the player at (x, z). */
function onbCtx({ flags = {}, at = [0, -64], arenas = {}, kittens = [] } = {}) {
  const ctx = fakeCtx({ systems: false });
  ctx.player = new Cat(ctx);
  ctx.player.pos.set(at[0], 0, at[1]);
  ctx.actors.register(ctx.player, 'swordcat');
  ctx.cam = { modeName: 'follow', shot() { return Promise.resolve(); }, mode() { return this; }, shake() {} };
  const zones = [{ id: 'chart', at: [-6, -67.3] }, { id: 'yard', at: ONBOARD.fight.at }, { id: 'barn_chest', at: BARN.chest },
    { id: 'cart', at: STORY.mochiCage }, { id: 'glade', at: [2, 18] }, { id: 'exit', at: [30, 92] }];
  ctx.levels = { current: { id: 'meadow', def: { zones }, interactables: [], navLinks: [{ a: [-14.5, -88.3], b: [-14.5, -85.7], kind: 'fence' }] },
    loading: false, anchor: () => null, load: async () => {}, arena: (id) => arenas[id] ?? null };
  ctx.audio = { play2D: () => ({ stop() {} }), play3D: () => ({ stop() {} }), music() {}, bell() {} };
  ctx.env = { preset() {}, set() {}, contribute() {}, clear() {} };
  ctx.fx = { burst() {}, holy() {} };
  ctx.physics = { heightAt: () => 0 };
  ctx.companions = { actors: [], active: [] };
  ctx.enemies = { list: [] };
  for (const [k, v] of Object.entries(flags)) ctx.state.setFlag(k, v);
  ctx.state.kittens = [...kittens];
  const story = new StoryManager(ctx);
  ctx.story = story;
  return { ctx, story };
}

const PRACTICE_FLAGS = { 'prologue.start': true };
const SUIT_FLAGS = { 'prologue.start': true, 'prologue.practice': true, 'prologue.chart': true, 'prologue.raid': true };
const DONE_FLAGS = { ...SUIT_FLAGS, 'prologue.armour': true, 'prologue.tutorial': true, 'prologue.done': true };
const keysOf = (tg) => (tg ? [tg.id, tg.kind, tg.textKey] : null);
const contract = (tg) => {
  assert.ok(tg, 'a target');
  for (const k of ['id', 'x', 'z', 'arriveR', 'textKey', 'kind']) assert.ok(tg[k] != null, `target.${k}`);
  assert.ok(Number.isFinite(tg.x) && Number.isFinite(tg.z) && tg.arriveR > 0);
  assert.ok(['lesson', 'quest', 'optional'].includes(tg.kind));
  assert.ok(has(tg.textKey), `textKey ${tg.textKey} is a strings row`);
};

// ====================================================================================================== strings
test('TT2 onboarding copy: registered into the one strings table; plain, warm, no money / shelter-impact words', () => {
  registerOnboardingStrings();
  for (const [k, v] of Object.entries(ONBOARDING_STRINGS)) assert.equal(t(k), v, k);
  const BAN = /\b(donat\w*|treats?|tails\b|tokens?|airdrop|chain|crypto|wallet|fund\w*|shelter)\b/i;
  for (const [k, v] of Object.entries(ONBOARDING_STRINGS)) assert.ok(!BAN.test(v), `${k}: "${v}"`);
  for (const k of Object.keys(ONBOARDING_STRINGS)) if (/^(tut|onb)\./.test(k) && !/skip\.hold/.test(k)) assert.ok(t(k).length <= 40 || k === 'tut.skip.touch', `${k} ≤ 40 chars (the objective line)`);
  assert.equal(t('onb.skip'), 'Skip ▸▸');
});

// ====================================================================================================== guideTarget
test('guideTarget: every practice lesson (move → the dummy, bonk, the Sir Wobble drill with "Get close"), kind lesson, Pearl speaks', () => {
  const { ctx, story } = onbCtx({ flags: PRACTICE_FLAGS });
  assert.equal(story.stage, 'practice');
  const tu = story.tutorial;
  const want = { move: ['tut.move', [0, -76]], bonk: ['tut.bonk', [0, -76]], stand: ['onb.wobble.close', PRACTICE.stand], parry: ['onb.wobble.close', PRACTICE.stand] };
  for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
    tu.log.i = i;
    const tg = story.guideTarget(), id = TUTORIAL_STEPS[i].id;
    contract(tg);
    assert.equal(tg.kind, 'lesson'); assert.equal(tg.speaker, 'pearl');
    assert.equal(tg.id, `tut.${id}`);
    assert.equal(tg.textKey, want[id][0], id);
    assert.deepEqual([tg.x, tg.z], [...want[id][1]], id);
  }
  ctx.player.pos.set(PRACTICE.stand[0], 0, PRACTICE.stand[1]);
  assert.equal(story.guideTarget().textKey, 'tut.parry', 'on the stand spot the lesson line comes back');
  tu.log.i = TUTORIAL_STEPS.findIndex((s) => s.id === 'stand');
  assert.equal(story.guideTarget().textKey, 'tut.stand');
});

test('fix round 1: the Sir Wobble drill — arriving at the stand spot always means close enough for the drill (closeR)', () => {
  const { ctx, story } = onbCtx({ flags: PRACTICE_FLAGS });
  const tu = story.tutorial;
  for (const id of ['stand', 'parry']) {
    tu.log.i = TUTORIAL_STEPS.findIndex((s) => s.id === id);
    ctx.player.pos.set(ONBOARD.wobble[0] + 6, 0, ONBOARD.wobble[1] + 6);   // far off: the plain stand-spot circle
    const tg = story.guideTarget();
    assert.ok(tg.arriveR > 0 && tg.arriveR + ONBOARD.standR <= ONBOARD.closeR, `${id}: standR + arriveR ≤ closeR`);
    assert.equal(tg.tapMove, true, `${id}: a tap on the badge (on Wobble's body) is a move to the stand spot`);
    // every point on the arrival circle (and inside it) is within closeR of Sir Wobble, so the trail never hides on "Get close"
    for (let k = 0; k < 32; k++) {
      for (const r of [tg.arriveR, tg.arriveR * 0.5, 0]) {
        const a = (k / 32) * Math.PI * 2;
        ctx.player.pos.set(tg.x + Math.cos(a) * r, 0, tg.z + Math.sin(a) * r);
        assert.ok(tu.wobbleDist() <= ONBOARD.closeR, `${id}: arrived at r ${r.toFixed(2)} → wobbleDist ${tu.wobbleDist().toFixed(2)} ≤ closeR`);
        assert.equal(story.guideTarget().textKey, `tut.${id}`, `${id}: arrived → the lesson line, not "Get close"`);
      }
    }
    // the invariant both ways over a grid around Sir Wobble: arrived ⇔ within closeR (he hops, the spot moves with him;
    // Q1 portrait bot: 0.29 m from the spot at wobbleDist 1.01 never "arrived" and the trail kept pointing into him)
    for (let gx = -3; gx <= 3; gx += 0.25) {
      for (let gz = -3; gz <= 3; gz += 0.25) {
        ctx.player.pos.set(ONBOARD.wobble[0] + gx, 0, ONBOARD.wobble[1] + gz);
        const g = story.guideTarget(), arrived = Math.hypot(ctx.player.pos.x - g.x, ctx.player.pos.z - g.z) <= g.arriveR;
        assert.equal(arrived, tu.wobbleDist() <= ONBOARD.closeR, `${id} at (${gx}, ${gz}): arrived ${arrived}, wobbleDist ${tu.wobbleDist().toFixed(2)}`);
      }
    }
  }
});

test('guideTarget: the prologue after practice — the bell / CS-01, the first fight (nearest rat), then the barn chest ("Open")', () => {
  const rats = [{ alive: true, pos: new THREE.Vector3(0, 0, -66) }, { alive: true, pos: new THREE.Vector3(-1, 0, -72) }];
  const yard = { id: 'yard', locked: false, cleared: false, enemies: rats };
  const { ctx, story } = onbCtx({ flags: { 'prologue.start': true, 'prologue.practice': true }, at: [0, -84], arenas: { yard } });
  ctx.enemies.list = rats;
  contract(story.guideTarget());
  assert.deepEqual(keysOf(story.guideTarget()), [ONBOARD_IDS.chart, 'quest', 'quest.prologue.chart']);
  for (const k of ['prologue.chart', 'prologue.raid']) ctx.state.setFlag(k, true);
  assert.equal(story.stage, 'suit');
  // not locked yet (a reload): the yard itself
  let tg = story.guideTarget(); contract(tg);
  assert.deepEqual(keysOf(tg), [ONBOARD_IDS.fight, 'quest', 'onb.fight.quest']);
  assert.deepEqual([tg.x, tg.z], [...ONBOARD.fight.at]);
  // locked: the nearest live rat
  yard.locked = true;
  tg = story.guideTarget(); contract(tg);
  assert.deepEqual(keysOf(tg), [ONBOARD_IDS.fight, 'quest', 'onb.fight']);
  assert.deepEqual([tg.x, tg.z], [-1, -72]);
  rats[1].alive = false;
  assert.deepEqual([story.guideTarget().x, story.guideTarget().z], [0, -66]);
  // cleared: the chest (far → the chest line, near → "Open the chest! [Interact]"), Clem speaks
  yard.cleared = true; yard.locked = false;
  tg = story.guideTarget(); contract(tg);
  assert.deepEqual(keysOf(tg), [ONBOARD_IDS.chest, 'quest', 'onb.chest']);
  // fix round 2: the way leads to the stand spot in front of the chest (BARN.clem, inside the tag's reach), not its collider
  assert.deepEqual([tg.x, tg.z], [...BARN.clem]); assert.equal(tg.speaker, 'swordcat');
  assert.ok(Math.hypot(BARN.clem[0] - BARN.chest[0], BARN.clem[1] - BARN.chest[1]) < 1.8, 'the stand spot is inside the chest tag radius');
  ctx.player.pos.set(BARN.chest[0] + 1, 0, BARN.chest[1] + 1);
  assert.equal(story.guideTarget().textKey, 'onb.chest.near');
});

test('fix round 1: Mochi\'s cart — the nearest live rat of the `cart` arena until it is clear, then the cage (arriveR 1.4, "Bonk")', () => {
  const rats = [{ alive: true, pos: new THREE.Vector3(STORY.mochiCage[0] + 7, 0, STORY.mochiCage[1]) }, { alive: true, pos: new THREE.Vector3(STORY.mochiCage[0] - 3, 0, STORY.mochiCage[1] + 2) }];
  const cart = { id: 'cart', locked: true, cleared: false, enemies: rats };
  const { ctx, story } = onbCtx({ flags: DONE_FLAGS, at: [STORY.mochiCage[0], STORY.mochiCage[1] + 1], arenas: { cart } });
  let tg = story.guideTarget(); contract(tg);
  assert.deepEqual(keysOf(tg), [ONBOARD_IDS.mochi, 'quest', 'onb.cart.rats']);
  assert.deepEqual([tg.x, tg.z], [rats[1].pos.x, rats[1].pos.z], 'the nearest live rat');
  assert.equal(tg.arriveR, 1.8);
  assert.equal(t('onb.cart.rats'), 'Chase off the rats! [Attack]');
  rats[1].alive = false;
  tg = story.guideTarget();
  assert.deepEqual([tg.x, tg.z], [rats[0].pos.x, rats[0].pos.z], 'a dead rat is skipped');
  // standing right at the cage while rats live: the guide still points away at them (no dead end inside 3 m)
  assert.ok(Math.hypot(tg.x - ctx.player.pos.x, tg.z - ctx.player.pos.z) > tg.arriveR, 'the rat target is not "arrived" at the cage');
  cart.cleared = true; cart.locked = false;
  // at the cart (within ONBOARD.mochiNearR): the cracked latch only opens to a Bright Slash, so the line says to hold Attack
  tg = story.guideTarget(); contract(tg);
  assert.deepEqual(keysOf(tg), [ONBOARD_IDS.mochi, 'quest', 'onb.mochi.bright']);
  assert.deepEqual([tg.x, tg.z], [...STORY.mochiCage]);
  assert.equal(tg.arriveR, 1.4);
  assert.match(t('onb.mochi.bright'), /\bHold \[Attack\]/);
  // fix round 2b: out of reach (walking back to the cart) the line names the way, not the attack
  ctx.player.pos.set(STORY.mochiCage[0], 0, STORY.mochiCage[1] + ONBOARD.mochiNearR + 2);
  tg = story.guideTarget(); contract(tg);
  assert.deepEqual(keysOf(tg), [ONBOARD_IDS.mochi, 'quest', 'onb.mochi.go']);
  assert.ok(!/attack|bonk/i.test(t('onb.mochi.go')), 'no attack word');
  assert.equal(tg.arriveR, 1.4);
  assert.equal(t('onb.mochi'), 'Bonk the cart open! [Attack]');
});

test('guideTarget: Chapter 1 onboarding — Mochi\'s cart → Noodle\'s barrel (Meow within 6 m) → the Standing Stones; then the quest rows', () => {
  const { ctx, story } = onbCtx({ flags: DONE_FLAGS, at: [-1.5, -50] });
  let tg = story.guideTarget(); contract(tg);
  // fix round 2: away from the cart (> mochiNearR) the line names the way, not the attack key
  assert.deepEqual(keysOf(tg), [ONBOARD_IDS.mochi, 'quest', 'onb.mochi.go']);
  assert.deepEqual([tg.x, tg.z], [...STORY.mochiCage]);
  ctx.player.pos.set(STORY.mochiCage[0] + 3, 0, STORY.mochiCage[1]);
  assert.equal(story.guideTarget().textKey, 'onb.mochi.bright', 'at the cart (cracked latch): the Bright Slash line');
  ctx.player.pos.set(-1.5, 0, -50);
  ctx.state.setFlag('meadow.mochi', true);
  tg = story.guideTarget(); contract(tg);
  assert.deepEqual(keysOf(tg), [ONBOARD_IDS.noodle, 'quest', 'onb.noodle']);
  ctx.player.pos.set(ONBOARD.noodle[0] + 4, 0, ONBOARD.noodle[1]);
  assert.equal(story.guideTarget().textKey, 'onb.meow', 'within ONBOARD.noodleR: "Meow [Meow] to call hidden kittens"');
  assert.equal(t('onb.meow'), 'Meow [Meow] to call hidden kittens');
  ctx.player.pos.set(ONBOARD.stones[0] + 3, 0, ONBOARD.stones[1] + 3);
  story._directorT = 0; story._prologueTick(0.2);
  assert.equal(ctx.state.getFlag('onboard.done'), undefined, 'not before Noodle');
  ctx.state.kittens.push('noodle');
  tg = story.guideTarget(); contract(tg);
  assert.deepEqual(keysOf(tg), [ONBOARD_IDS.stones, 'quest', 'onb.stones']);
  // reaching the Stones (after Noodle) sets onboard.done; then the guide follows the quest rows (Pudding's glade)
  ctx.player.pos.set(ONBOARD.stones[0] + 3, 0, ONBOARD.stones[1] + 3);
  story._directorT = 0; story._prologueTick(0.2);
  assert.equal(ctx.state.getFlag('onboard.done'), true);
  tg = story.guideTarget(); contract(tg);
  assert.equal(tg.kind, 'quest'); assert.equal(tg.id, 'meadow.follow'); assert.deepEqual([tg.x, tg.z], [2, 18]);
});

test('guideTarget: the Meow tip fires once at Noodle\'s barrel; null on the title, during a load and in a boss fight', () => {
  const { ctx, story } = onbCtx({ flags: { ...DONE_FLAGS, 'meadow.mochi': true }, at: [ONBOARD.noodle[0] + 3, ONBOARD.noodle[1]] });
  const toasts = [];
  ctx.bus.on(E.TOAST, (p) => toasts.push(p));
  for (let k = 0; k < 3; k++) { story._directorT = 0; story._prologueTick(0.2); }
  assert.deepEqual(toasts.filter((p) => p.key === 'tut.meow').map((p) => p.textKey), ['onb.meow']);
  ctx.levels.loading = true; assert.equal(story.guideTarget(), null); ctx.levels.loading = false;
  story.title.active = true; assert.equal(story.guideTarget(), null); story.title.active = false;
  ctx.state.setFlag('onboard.done', true);
  story.bossId = 'grizzlechop'; assert.equal(story.guideTarget(), null, 'the boss bar is the goal');
  const t0 = onbCtx({ flags: {} });
  assert.equal(prologueStage(t0.ctx.state), 'title'); assert.equal(t0.story.guideTarget(), null);
});

// ====================================================================================================== scene flags, chip, newGame
test('sceneActive: true for cutscenes and blocking dialogue, false for ambient barks (G-01); the Skip chip from second 0', async () => {
  const { ctx, story } = onbCtx({ flags: { ...SUIT_FLAGS, 'prologue.chart': true } });
  await story.init();
  assert.equal(story.sceneActive, false);
  assert.deepEqual(story.skipChip, { on: false, progress: 0, scene: null });
  story.play('cs01b');
  assert.equal(story.sceneActive, true);
  assert.equal(story.skipChip.on, true, 'the chip shows at once (prologue scenes are skippable on the first viewing)');
  assert.equal(story.skipChip.scene, 'cs01b');
  story.holdSkip(true);
  assert.equal(story.skipPressed(), true);
  for (let k = 0; k < 70; k++) story.update(1 / 60);
  await new Promise((r) => setTimeout(r, 0));
  assert.notEqual(story.playingId, 'cs01b', 'holding the chip 1 s skips');
  story.holdSkip(false);
  assert.equal(ctx.state.getFlag('prologue.done'), true);
  story.play('g01');
  assert.equal(story.playingId, 'g01'); assert.equal(story.sceneActive, false, 'G-01 is a bark'); assert.equal(story.skipChip.on, false);
  assert.equal(ctx.game.mode, 'play', 'no input lock');
});

test('the Skip chip during practice; newGame({ skipPractice }) starts with practice done → bell → CS-01 → CS-02', async () => {
  const { ctx, story } = onbCtx({ flags: {} });
  await story.init();
  ctx.player.pos.set(0, 0, -70);
  ctx.state.setFlag('prologue.start', true);
  story.update(1 / 60);
  assert.equal(story.tutorial.active, true);
  assert.equal(story.skipChip.on, true); assert.equal(story.skipChip.scene, 'practice');
  // a new player skips practice from the title link
  const b = onbCtx({ flags: {} });
  await b.story.init();
  b.ctx.game.addFrameHook = undefined;                            // the cream fade's sleep runs on timers here
  await b.story.newGame({ difficulty: 'knight', skipPractice: true });
  assert.equal(b.ctx.state.getFlag('prologue.start'), true); assert.equal(b.ctx.state.getFlag('prologue.practice'), true);
  assert.equal(b.story.stage, 'chart');
  assert.equal(b.ctx.player.outfit, 'tunic_bow');
  b.story._directorT = 0; b.story._prologueTick(0.2);
  assert.equal(b.story.playingId, 'cs01', 'old saves / skipPractice in stage chart: CS-01 at once, in place');
});

test('toChart: the bell, then CS-01 right there after PROLOGUE.bellDelay (no walk to the chart)', async () => {
  const { ctx, story } = onbCtx({ flags: { 'prologue.start': true, 'prologue.practice': true }, at: [0, -84.7] });
  await story.init();
  let bells = 0; ctx.audio.bell = () => { bells++; };
  ctx.game.time = 100;
  story.toChart();
  assert.equal(bells, 1);
  story._directorT = 0; story._prologueTick(0.2);
  assert.equal(story.playingId, null, 'the bell first');
  ctx.game.time = 101.3;
  story._directorT = 0; story._prologueTick(0.2);
  assert.equal(story.playingId, 'cs01');
  assert.deepEqual([ctx.player.pos.x, ctx.player.pos.z], [0, -84.7], 'she was not walked anywhere');
});

test('the first fight: the yard locks → onboard.firstFight (once, with its game time); the yard clear → Clem\'s line + the chest bubble', async () => {
  const { ctx, story } = onbCtx({ flags: SUIT_FLAGS, at: [-2, -80] });
  await story.init();
  const said = []; story.barks.say = (a, k) => said.push(k);
  ctx.game.time = 61.5; story.onboard.t0 = 0;
  ctx.bus.emit(E.ARENA_LOCK, { id: 'cart' });
  assert.equal(ctx.state.getFlag('onboard.firstFight'), undefined, 'another arena does not count');
  ctx.bus.emit(E.ARENA_LOCK, { id: ONBOARD.fight.arena });
  assert.equal(ctx.state.getFlag('onboard.firstFight'), true);
  assert.equal(story.onboard.firstFight, 61.5);
  ctx.game.time = 70; ctx.bus.emit(E.ARENA_LOCK, { id: ONBOARD.fight.arena });
  assert.equal(story.onboard.firstFight, 61.5, 'set once');
  ctx.bus.emit(E.ARENA_CLEAR, { id: ONBOARD.fight.arena });
  assert.deepEqual(said, ['onb.fight.clear']);
});

// ====================================================================================================== save compatibility
test('old mid-practice saves (7-lesson flow) resume at the nearest new lesson; flag names unchanged', () => {
  const st = (f) => ({ getFlag: (k) => f[k] });
  assert.equal(resumeLesson(st({})), 0, 'nothing done: move');
  assert.equal(resumeLesson(st({ 'sticker.bonk': true })), 2, 'bonk done: the drill (stand)');
  assert.equal(resumeLesson(st({ 'sticker.bonk': true, 'sticker.bow': true, 'sticker.hop': true })), 2, 'old jump done: stand');
  assert.equal(resumeLesson(st({ 'sticker.bonk': true, 'sticker.hop': true, 'sticker.roll': true })), 2, 'old roll done: stand');
  assert.equal(resumeLesson(st({ 'sticker.bonk': true, 'sticker.stand': true })), 3, 'stand done: parry');
  assert.equal(resumeLesson(st({ 'sticker.bonk': true, 'sticker.stand': true, 'sticker.parry': true })), 4, 'parry done (old meow lesson next): practice over');
  assert.deepEqual(Object.keys(OLD_LESSONS), ['move', 'bonk', 'jump', 'roll', 'stand', 'parry', 'meow']);
  // a Tutorial on such a save starts at that lesson; a save past the parry ends practice at once (→ the bell)
  const { ctx, story } = onbCtx({ flags: { 'prologue.start': true, 'sticker.bonk': true, 'sticker.hop': true, 'tut.jump.done': true }, at: [0, -70] });
  const tu = new Tutorial(ctx, story);
  tu.update(1 / 60);
  assert.equal(tu.active, true); assert.equal(tu.log.step.id, 'stand');
  const done = onbCtx({ flags: { 'prologue.start': true, 'sticker.bonk': true, 'sticker.stand': true, 'sticker.parry': true }, at: [0, -70] });
  let charted = false; done.story.toChart = () => { charted = true; };
  const tu2 = new Tutorial(done.ctx, done.story);
  tu2.update(1 / 60);
  assert.equal(done.ctx.state.getFlag('prologue.practice'), true); assert.equal(charted, true);
});

// ====================================================================================================== jump at the first hop
test('a click / tap across the practice fence hops it (an open fence link) and teaches Jump: tip near the link, the hop sets tut.jump.done', async () => {
  const meadow = (await import('../../src/world/levels/meadow.js')).default;
  const fence = meadow.navLinks.find((l) => l.kind === 'fence' && l.when == null);
  assert.ok(fence, 'the practice fence link is always open (no dead end for click / tap)');
  const gate = meadow.navLinks.find((l) => l.kind === 'fence' && l.when != null);
  assert.equal(gate.when, 'onboard.fenceAuto', 'a gate line that never opens keeps the automatic hops off the rest of the fence');
  assert.deepEqual(gate.gate, [[-20, -87], [-2, -87]]);
  assert.ok(fence.a[1] < -87 && fence.b[1] > -87, 'it crosses the inner fence');
  const { ctx, story } = onbCtx({ flags: { 'prologue.start': true, 'prologue.practice': true, 'prologue.chart': true, 'prologue.raid': true }, at: [-14.5, -84.5] });
  await story.init();
  const toasts = [], rewards = [];
  ctx.bus.on(E.TOAST, (p) => toasts.push(p.key)); ctx.bus.on(E.REWARD, (p) => rewards.push(p.id));
  story.tutorial._hopTip(1);
  assert.ok(toasts.includes('tut.jump'), 'the jump tip by the hop link');
  // an order hop (the click across the fence) — Orders sets `_hop` and the jump fires player:jump
  ctx.player.orders = { _hop: { x: -14.5, z: -88.3 }, path: [], wp: 0 };
  ctx.player.pos.set(-14.5, 0, -86.5);
  ctx.bus.emit(E.PLAYER_JUMP, {});
  assert.equal(ctx.state.getFlag('tut.jump.done'), true);
  assert.deepEqual(rewards, ['hop']);
  // in the middle of nowhere a jump is just a jump (before the lesson)
  const b = onbCtx({ flags: { 'prologue.start': true, 'prologue.practice': true }, at: [10, -70] });
  await b.story.init();
  b.ctx.bus.emit(E.PLAYER_JUMP, {});
  assert.equal(b.ctx.state.getFlag('tut.jump.done'), undefined);
});

// ====================================================================================================== Sir Wobble
test('Sir Wobble steps toward her when she is over 1.4 m away (to the 1.3 m stand spot); his visual root follows him', () => {
  const ctx = fakeCtx({ systems: false });
  ctx.player = new Cat(ctx); ctx.player.alive = true;
  ctx.physics = { heightAt: () => 0, blockedAt: () => null };
  const home = new THREE.Vector3(...[ONBOARD.wobble[0], 0, ONBOARD.wobble[1]]);
  const wk = new WobbleKnight(ctx, { id: 'wobble_knight', pos: home.clone(), facing: 0, delay: 99 });
  assert.equal(WOBBLE_REACH.keep, ONBOARD.standR); assert.equal(WOBBLE_REACH.step, ONBOARD.stepR);
  ctx.player.pos.set(home.x, 0, home.z + 2.2);                   // in swing reach but too far for the drill
  for (let k = 0; k < 120; k++) wk.update(1 / 60);
  const d = Math.hypot(ctx.player.pos.x - wk.pos.x, ctx.player.pos.z - wk.pos.z);
  assert.ok(Math.abs(d - ONBOARD.standR) < 0.06, `he stepped to ~1.3 m (${d.toFixed(2)})`);
  const at = wk.pos.clone();
  ctx.player.pos.set(wk.pos.x, 0, wk.pos.z + 1.35);              // within 1.4 m: he stands
  for (let k = 0; k < 30; k++) wk.update(1 / 60);
  assert.ok(wk.pos.distanceTo(at) < 1e-6, 'within stepR he stands still');
  wk.render();
  assert.ok(wk.object3d.position.distanceTo(wk.pos) < 1e-9, 'object3d follows (the glint / "!" / ring sit on him)');
  assert.equal(detached(wk), true, 'a prop with a detached visual root: telegraph marks read actor.pos');
  // outside the drill (`approach` false) he never wanders into her path: he hops home
  const wk2 = new WobbleKnight(ctx, { id: 'wk2', pos: home.clone(), facing: 0, delay: 99, approach: () => false });
  ctx.player.pos.set(home.x, 0, home.z + 3.5);
  for (let k = 0; k < 120; k++) wk2.update(1 / 60);
  assert.ok(wk2.pos.distanceTo(home) < 1e-6, 'outside the drill he stays home');
  assert.equal(detached(ctx.player), true); ctx.scene.add(ctx.player.object3d); assert.equal(detached(ctx.player), false);
});

// ====================================================================================================== Lantern Stone
test('the Lantern Stone menu never opens while foes are alerted near her (the stone still saves)', () => {
  const ctx = fakeCtx();
  ctx.player = new Cat(ctx);
  ctx.player.pos.set(-16, 0, -36);
  const rat = { alive: true, alerted: true, faction: 'enemy', pos: new THREE.Vector3(-16, 0, -28) };
  ctx.enemies = { list: [rat] };
  assert.equal(foesAlerted(ctx), true, '8 m away and alerted');
  rat.alerted = false; assert.equal(foesAlerted(ctx), false, 'an idle rat does not block it');
  rat.alerted = true; rat.pos.set(-16, 0, -36 + VIGIL.busyR + 1); assert.equal(foesAlerted(ctx), false, 'too far away');
  rat.pos.set(-16, 0, -30); rat.dormant = true; assert.equal(foesAlerted(ctx), false, 'dormant');
  rat.dormant = false;
  const ui = new UI(ctx);
  let opened = 0;
  ui.menus = { openVigil() { opened++; }, active: false }; ui.results = { open: false }; ui._freeze = () => {};
  ui.openVigil();
  assert.equal(opened, 0, 'blocked while the rat is alerted');
  rat.alive = false;
  ui.openVigil();
  assert.equal(opened, 1);
});

// ====================================================================================================== the first fight arena
test('the first fight arena: the rats spill in idle, wake on her first order (or after `calm` s), and the first hit on her is soft', () => {
  const ctx = fakeCtx({ systems: false });
  ctx.player = new Cat(ctx);
  ctx.player.pos.set(-2, 0, -80); ctx.player.hp = 8;
  const list = [];
  ctx.enemies = { list, spawn: (type, pos, opts) => { const e = { type, pos: pos.clone(), opts, alive: true, ai: opts.ai !== false, alerted: !!opts.alerted, states: [], setState(s) { this.states.push(s); } }; list.push(e); return e; }, despawn() {} };
  const zone = { id: 'yard', at: ONBOARD.fight.at, r: ONBOARD.fight.r, soft: true, calm: 3, softHit: 1, waves: [[['rat_pike', 3, { at: ONBOARD.fight.spill, alerted: false, ai: false }]]] };
  const a = new Arena(ctx, zone);
  const locks = []; ctx.bus.on(E.ARENA_LOCK, (p) => locks.push(p.id));
  a.lock({ now: true });
  assert.deepEqual(locks, ['yard']);
  assert.equal(list.length, 3);
  assert.ok(list.every((e) => e.ai === false && !e.alerted), 'they wait');
  assert.ok(list.every((e) => Math.hypot(e.pos.x - ONBOARD.fight.spill[0], e.pos.z - ONBOARD.fight.spill[1]) < 2), 'at the north gate');
  a.update(1.0);
  assert.ok(list.every((e) => e.ai === false), 'still waiting after 1 s');
  ctx.bus.emit(E.PLAYER_ORDER, { kind: 'move', valid: true });
  assert.ok(list.every((e) => e.ai === true && e.alerted && e.states.includes('chase')), 'her first order wakes them');
  // the calm timer alone (no order): after `calm` s
  const b = new Arena(ctx, { ...zone, id: 'yard2' });
  list.length = 0;
  b.lock({ now: true });
  for (let k = 0; k < 2.9 * 60; k++) b.update(1 / 60);
  assert.ok(list.every((e) => e.ai === false));
  for (let k = 0; k < 0.2 * 60; k++) b.update(1 / 60);
  assert.ok(list.every((e) => e.ai === true), 'after 3 s they come');
  // soft first hit: at most `softHit` damage, once
  ctx.player.hp = 6;                                              // a 2-damage hit just landed
  ctx.bus.emit(E.PLAYER_DAMAGED, { amount: 2, hp: 6, source: list[0] });
  assert.equal(ctx.player.hp, 7, 'the first hit deals 1');
  ctx.player.hp = 5;
  ctx.bus.emit(E.PLAYER_DAMAGED, { amount: 2, hp: 5, source: list[0] });
  assert.equal(ctx.player.hp, 5, 'only the first');
});

test('meadow: the yard arena (soft, locks on cs02:end, re-arms until Suit Up) carries the forgiving first wave', async () => {
  const meadow = (await import('../../src/world/levels/meadow.js')).default;
  const z = meadow.zones.find((x) => x.id === ONBOARD.fight.arena);
  assert.ok(z, 'the yard arena');
  assert.equal(z.kind, 'arena'); assert.equal(z.soft, true); assert.equal(z.lockOn, 'cs02:end');
  assert.equal(z.calm, ONBOARD.fight.calm); assert.equal(z.softHit, ONBOARD.fight.softHit);
  assert.deepEqual(z.waves, [[['rat_pike', 3, { at: ONBOARD.fight.spill, alerted: false, ai: false }]]]);
  const end = CUTSCENES.cs02.end.actors.swordcat.pos;
  assert.ok(Math.hypot(end[0] - z.at[0], end[1] - z.at[1]) <= z.r - 2, 'CS-02 leaves her inside the yard trigger');
});

// ====================================================================================================== scenes
test('scene caps (measured): CS-01 ≤ 10 s, CS-02 ≤ 20 s, CS-01b ≤ 6 s, D-01 ≤ 12 s; G-01 is a bark that locks no input', () => {
  for (const [id, cap] of Object.entries(ONBOARD.sceneCap)) assert.ok(sceneLength(CUTSCENES[id].steps) <= cap, `${id}: ${sceneLength(CUTSCENES[id].steps).toFixed(1)} s ≤ ${cap} s`);
  for (const id of ['cs01', 'cs02', 'cs01b', 'd01']) assert.ok(CUTSCENES[id].skippable !== false && (CUTSCENES[id].prologue || id === 'd01'), `${id} skippable`);
  assert.equal(CUTSCENES.g01.kind, 'ambient'); assert.equal(CUTSCENES.g01.letterbox, false); assert.equal(CUTSCENES.g01.inputSkip, undefined);
  // the onboarding before the first fight: ≤ ~30 s of scenes (CS-01 + CS-02)
  assert.ok(sceneLength(CUTSCENES.cs01.steps) + sceneLength(CUTSCENES.cs02.steps) <= 30);
});

test('the barn chest tag reads "Open" (an interactable\'s own short prompt key beats the generic [Interact])', () => {
  const ctx = { strings: { t, has } };
  assert.equal(tagLabel(ctx, 'interact', 'prompt.open'), 'Open');
  assert.equal(tagLabel(ctx, 'vigil', 'tut.vigil'), t('prompt.vigil') !== 'prompt.vigil' && has('prompt.vigil') ? t('prompt.vigil') : tagLabel(ctx, 'vigil', 'tut.vigil'));
});

test('fix round 2: on the way to Noodle / the Stones an alerted foe within GUIDE_FOE_R takes the guide with the fight line', async () => {
  const { GUIDE_FOE_R } = await import('../../src/story/StoryManager.js');
  const foe = { alive: true, alerted: true, pos: new THREE.Vector3(ONBOARD.noodle[0] + 20, 0, ONBOARD.noodle[1]) };
  const { ctx, story } = onbCtx({ flags: { ...DONE_FLAGS, 'meadow.mochi': true }, at: [ONBOARD.noodle[0] + 22, ONBOARD.noodle[1]] });
  ctx.enemies = { list: [foe] };
  let tg = story.guideTarget(); contract(tg);
  assert.deepEqual(keysOf(tg), [ONBOARD_IDS.noodle, 'quest', 'onb.cart.rats']);
  assert.deepEqual([tg.x, tg.z], [foe.pos.x, foe.pos.z]);
  foe.alerted = false;
  assert.deepEqual(keysOf(story.guideTarget()).slice(0, 2), [ONBOARD_IDS.noodle, 'quest']);
  assert.notEqual(story.guideTarget().textKey, 'onb.cart.rats', 'a calm foe does not steal the guide');
  foe.alerted = true; foe.pos.set(ctx.player.pos.x + GUIDE_FOE_R + 1, 0, ctx.player.pos.z);
  assert.notEqual(story.guideTarget().textKey, 'onb.cart.rats', 'beyond GUIDE_FOE_R: the step itself');
  // after Noodle: the Stones step, same rule
  ctx.state.kittens = [...(ctx.state.kittens ?? []), 'noodle'];
  foe.pos.set(ctx.player.pos.x + 3, 0, ctx.player.pos.z);
  tg = story.guideTarget(); contract(tg);
  assert.deepEqual(keysOf(tg), [ONBOARD_IDS.stones, 'quest', 'onb.cart.rats']);
  foe.alive = false;
  assert.deepEqual(keysOf(story.guideTarget()), [ONBOARD_IDS.stones, 'quest', 'onb.stones']);
});

test('fix round 2: the in-place lessons (Bonk, Stand, Parry) carry a ring round their object; Move does not', () => {
  const { story } = onbCtx({ flags: PRACTICE_FLAGS });
  const tu = story.tutorial;
  for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
    tu.log.i = i;
    const tg = story.guideTarget(), id = TUTORIAL_STEPS[i].id;
    contract(tg);
    if (id === 'move') { assert.ok(!tg.ring, 'move: a path, no ring'); continue; }
    assert.ok(tg.ring && Number.isFinite(tg.ring.x) && Number.isFinite(tg.ring.z) && tg.ring.r > 0, `${id}: ring`);
    if (id === 'bonk') assert.deepEqual([tg.ring.x, tg.ring.z], [0, -76], 'bonk rings the dummy');
    else { assert.deepEqual([tg.ring.x, tg.ring.z], [...PRACTICE.wobble], `${id} rings Sir Wobble`); assert.equal(tg.ring.r, ONBOARD.standR); }
  }
});

// ====================================================================================================== TT3 §11.4 trick hints
test('TT3: a Paw Trick unlock shows its trick.<id>.hint once, after the bark delay and never mid-scene', async () => {
  const { EV_TRICK_UNLOCKED, TRICK_HINT_DELAY } = await import('../../src/story/tutorial.js');
  registerOnboardingStrings();
  const ctx = fakeCtx();
  ctx.strings = { has, t };
  for (const k of ['prologue.start', 'prologue.practice', 'prologue.done']) ctx.state.setFlag(k, true);
  const toasts = [];
  ctx.bus.on(E.TOAST, (p) => toasts.push(p?.key));
  const story = { isPlaying: false };
  const tu = new Tutorial(ctx, story);
  tu.init();
  assert.ok(EV_TRICK_UNLOCKED === 'trick:unlocked' || EV_TRICK_UNLOCKED === E.TRICK_UNLOCKED, EV_TRICK_UNLOCKED);
  ctx.bus.emit(EV_TRICK_UNLOCKED, { id: 'cloud', bark: false });
  tu.update(TRICK_HINT_DELAY + 1);
  assert.ok(!toasts.includes('trick.cloud.hint'), 'a quiet catch-up on load (bark: false) shows no hint');
  ctx.bus.emit(EV_TRICK_UNLOCKED, { id: 'coin', bark: true });
  tu.update(TRICK_HINT_DELAY - 0.5);
  assert.ok(!toasts.includes('trick.coin.hint'), 'not during the unlock bark');
  story.isPlaying = true;
  tu.update(1);
  assert.ok(!toasts.includes('trick.coin.hint'), 'not during a scene');
  story.isPlaying = false;
  tu.update(0.1);
  assert.ok(toasts.includes('trick.coin.hint'), 'shown once the bark and the scene are over');
  assert.equal(ctx.state.getFlag('seen.trick.coin.hint'), true);
  ctx.bus.emit(EV_TRICK_UNLOCKED, { id: 'coin', bark: true });
  tu.update(TRICK_HINT_DELAY + 1);
  assert.equal(toasts.filter((k) => k === 'trick.coin.hint').length, 1, 'once per save');
  for (const id of ['coin', 'twirl', 'cloud']) for (const s of ['name', 'bark', 'hint']) assert.ok(has(`trick.${id}.${s}`), `trick.${id}.${s}`);
  assert.ok(has('trick.swap'));
});

test('TT3: lesson copy names the new keys (keyboard, pad, touch); no Right-click / Space-Stand / F-jump left', () => {
  registerOnboardingStrings();
  assert.equal(t('tut.bonk'), 'Bonk it 3 times! [Attack]');
  assert.equal(t('tut.stand'), 'Hold [Stand] to block Sir Wobble!');
  assert.equal(t('tut.parry'), 'Tap [Stand] when [ShieldCue] pops!');   // TT6: the pink shield over the foe
  assert.equal(t('tut.move'), 'Race Pearl to the dummy! [Move]');
  assert.equal(t('tut.jump'), 'Little fence? Hop it! [Jump]');
  for (const [k, v] of Object.entries(ONBOARDING_STRINGS)) assert.ok(!/right-click|\[Space\]|\[F\]|\[Q\]|\bCtrl\b|\bAlt\b|\bF1\b|or J\b/i.test(v), `${k}: "${v}"`);
});
