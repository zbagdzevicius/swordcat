// tests/unit/save.test.js  (owner: save) — U17 (migrate tech.md v1 → §19.7) + schema hardening, storage failure
// handling, autosave triggers, coalescing, cutscene deferral, title/session rules and settings persistence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { E } from '../../src/core/events.js';
import { defaultState, SAVE_KEYS, GameState } from '../../src/core/GameState.js';
import { KITTEN_IDS } from '../../src/core/config.js';
import {
  KEY, BACKUP_KEY, SAVE_VERSION, defaultSave, migrate, isLegacyV1, hasProgress, resumeSpawn, summarize,
  createMemoryStorage, SaveManager,
} from '../../src/save/SaveManager.js';
import { EventBus } from '../../src/core/EventBus.js';

/**
 * The slice of ctx save uses: bus, state, params, game.mode, levels.{loading, load}, story.isPlaying. Built locally
 * (not _fakeCtx.mjs, which constructs every system) so these tests don't depend on other areas' work in progress.
 */
function fakeCtx({ params = { test: true } } = {}) {
  return {
    bus: new EventBus(), state: new GameState(), params,
    game: { mode: 'play' }, levels: { loading: false, current: null, load: async () => null }, story: { isPlaying: false },
  };
}

/** tech.md §16's original default, verbatim. */
const TECH_V1_DEFAULT = () => ({ v: 1, levelId: 'meadow', spawnId: 'start', hp: 6, maxHp: 6, holy: 0,
  flags: {}, inventory: {}, kittens: [], quests: {}, playtime: 0, savedAt: 0,
  settings: { master: 0.8, music: 0.6, sfx: 0.8, invertY: false, sensitivity: 1, quality: 'auto' } });

const read = (storage, key = KEY) => { const r = storage.getItem(key); return r ? JSON.parse(r) : null; };

/** Storage that counts writes per key. */
function countingStorage(init) {
  const s = createMemoryStorage(init);
  const set = s.setItem;
  s.writes = {};
  s.setItem = (k, v) => { s.writes[k] = (s.writes[k] ?? 0) + 1; set(k, v); };
  return s;
}

/** A SaveManager on a fake ctx (not ?test), initialised, with injected storage. */
async function rig({ storage = countingStorage(), params = { test: false } } = {}) {
  const ctx = fakeCtx({ params });
  const save = new SaveManager(ctx, { storage });
  ctx.save = save;
  await save.init();
  const emitted = [];
  ctx.bus.tap?.((type, p) => emitted.push([type, p]));
  const step = (n = 1) => { for (let i = 0; i < n; i++) save.update(1 / 60); };
  return { ctx, save, storage, step, emitted };
}

function quietWarn(t) {
  const warn = console.warn;
  const seen = [];
  console.warn = (...a) => seen.push(a.join(' '));
  t.after(() => { console.warn = warn; });
  return seen;
}

// ------------------------------------------------------------------ U17 + migrate
test('U17: migrate upgrades tech.md\'s original v1 default (hp 6, holy) to the §19.7 schema', () => {
  const old = TECH_V1_DEFAULT();
  assert.ok(isLegacyV1(old));
  const m = migrate(old);
  assert.deepEqual(m, { ...defaultSave(), spawnId: 'start' });
  assert.equal(m.hp, 8); assert.equal(m.maxHp, 8);
  assert.ok(!('holy' in m) && !('inventory' in m) && !('quests' in m), 'holy / inventory / quests removed');
  assert.deepEqual(Object.keys(m), SAVE_KEYS, 'exactly the §19.7 keys, in order');
  assert.equal(m.v, SAVE_VERSION);
  assert.deepEqual(Object.keys(m.settings).sort(), Object.keys(defaultSave().settings).sort(), 'new settings keys filled in');
  assert.ok(hasProgress(old), 'a legacy record is a real save');
  assert.equal(migrate(old).hp, 8, 'pure: the input is not mutated');
  assert.equal(old.hp, 6);
});

test('U17: a played tech.md v1 save keeps its progress', () => {
  const m = migrate({ ...TECH_V1_DEFAULT(), levelId: 'forest', spawnId: 'vigil_2', hp: 3, holy: 40, playtime: 1234.5,
    flags: { 'prologue.done': true, 'meadow.pudding': 'netted' }, kittens: ['biscuit', 'zork', 'biscuit', 'noodle'],
    inventory: { fish: 37, keys: 1 }, quests: { q1: 'done' }, settings: { music: 0.2, invertY: true } });
  assert.equal(m.levelId, 'forest'); assert.equal(m.spawnId, 'vigil_2');
  assert.equal(m.maxHp, 8); assert.equal(m.hp, 8, 'resumes at full health');
  assert.equal(m.fish, 37, 'inventory.fish carried over');
  assert.deepEqual(m.kittens, ['biscuit', 'noodle'], 'unknown + duplicate kittens dropped');
  assert.deepEqual(m.flags, { 'prologue.done': true, 'meadow.pudding': 'netted' });
  assert.equal(m.playtime, 1234.5);
  assert.equal(m.settings.music, 0.2); assert.equal(m.settings.invertY, true); assert.equal(m.settings.shake, 1);
});

test('migrate: identity on §19.7 data, idempotent, null for non-objects', () => {
  assert.deepEqual(migrate(defaultSave()), defaultSave());
  assert.deepEqual(migrate(defaultState()), defaultState());
  const played = { ...defaultSave(), levelId: 'town', spawnId: 'hub', fish: 420, shards: 1, kittens: KITTEN_IDS.slice(0, 7),
    heartBells: ['bell1'], letters: ['letter_meadow'], difficulty: 'nine', lives: 5, maxHp: 10, hp: 9, milk: 3, milkMax: 3,
    companions: { unlocked: ['mochi', 'sage'], active: ['sage'] }, upgrades: { satchel: 1, sharp: 2, quickCharge: true, valorGain: false, waveReach: false },
    cosmetics: { swords: ['borrowed', 'twig', 'fishbone'], capes: ['cream', 'red'], sword: 'fishbone', cape: 'red' },
    levels: { meadow: { cleared: true, bestRank: 'pawsome', bestTime: 812.4 } }, flags: { 'town.free': true }, memeCamSeen: 2 };
  assert.deepEqual(migrate(played), played, 'valid data passes unchanged');
  assert.deepEqual(migrate(migrate(played)), migrate(played));
  for (const bad of [null, undefined, 42, 'save', [], [1, 2], true]) assert.equal(migrate(bad), null, `migrate(${JSON.stringify(bad)})`);
  assert.deepEqual(migrate({}), defaultSave(), 'empty object → defaults');
  assert.deepEqual(migrate({ v: 99, fish: 5 }), { ...defaultSave(), fish: 5 }, 'newer build: best effort, v pinned');
});

test('migrate: garbage values are clamped or defaulted (a bad save never breaks boot)', () => {
  const m = migrate({
    levelId: 'moon', spawnId: 'x', difficulty: 'hard', hp: NaN, maxHp: 99, lives: null, milk: 99, milkMax: 2,
    fish: -5, shards: 7, playtime: 'abc', savedAt: -1, memeCamSeen: 1.6,
    kittens: 'biscuit', heartBells: ['a', 'b', 'c', 'd', 'a', { x: 1 }], letters: [1, 'letter_forest'],
    companions: { unlocked: 'mochi', active: ['mochi', 'mochi'] }, upgrades: { satchel: 9, sharp: -1, quickCharge: 'yes' },
    cosmetics: { swords: ['diamond'], capes: [], sword: 'excalibur', cape: 'gold' },
    levels: { forest: { cleared: 'yes', bestRank: 'legendary', bestTime: -3, extra: { deep: 1 } }, 'bad key!': { cleared: true } },
    flags: { ok: true, n: 3, s: 'netted', obj: { a: 1 }, fn: null, long: 'x'.repeat(200) },
    settings: { master: 7, music: -1, sensitivity: 0, quality: 'ultra', invertY: 'yes', language: 'fr', nested: { a: 1 }, shake: '0.5' },
    holy: undefined, bogus: 1,
  });
  assert.equal(m.levelId, 'meadow'); assert.equal(m.spawnId, 'practice', 'unknown level → meadow, prologue not done → practice');
  assert.equal(m.difficulty, 'knight');
  assert.equal(m.maxHp, 14); assert.equal(m.hp, 14);
  assert.equal(m.lives, 9); assert.equal(m.milkMax, 2); assert.equal(m.milk, 2);
  assert.equal(m.fish, 0); assert.equal(m.shards, 3); assert.equal(m.playtime, 0); assert.equal(m.savedAt, 0); assert.equal(m.memeCamSeen, 2);
  assert.deepEqual(m.kittens, []); assert.deepEqual(m.heartBells, ['a', 'b', 'c']); assert.deepEqual(m.letters, ['letter_forest']);
  assert.deepEqual(m.companions, { unlocked: [], active: ['mochi'] });
  assert.deepEqual(m.upgrades, { satchel: 2, sharp: 0, quickCharge: false, valorGain: false, waveReach: false });
  assert.deepEqual(m.cosmetics, { swords: ['borrowed', 'twig', 'diamond'], capes: ['cream'], sword: 'borrowed', cape: 'cream' });
  assert.deepEqual(m.levels, { forest: { cleared: false } });
  assert.deepEqual(m.flags, { ok: true, n: 3, s: 'netted', fn: null });
  assert.equal(m.settings.master, 1); assert.equal(m.settings.music, 0); assert.equal(m.settings.sensitivity, 0.1);
  assert.equal(m.settings.quality, 'auto'); assert.equal(m.settings.invertY, false); assert.equal(m.settings.shake, 0.5);
  assert.equal(m.settings.language, 'fr', 'future primitive settings survive'); assert.ok(!('nested' in m.settings));
  assert.ok(!('bogus' in m) && !('holy' in m));
  assert.ok(new GameState(m).toJSON(), 'GameState accepts it');
});

test('resumeSpawn / hasProgress / summarize', () => {
  assert.equal(resumeSpawn('meadow', 'title', {}), 'practice');
  assert.equal(resumeSpawn('meadow', 'title', { 'prologue.done': true }), 'start');
  assert.equal(resumeSpawn('forest', null, {}), 'start');
  assert.equal(resumeSpawn('forest', 'vigil_2', {}), 'vigil_2');
  assert.equal(hasProgress({ ...defaultSave(), progress: false, flags: { a: 1 } }), false, 'explicit marker wins');
  assert.equal(hasProgress({ ...defaultSave() }), false, 'fresh defaults: no progress');
  assert.equal(hasProgress({ ...defaultSave(), flags: { 'prologue.armour': true } }), true);
  assert.equal(hasProgress({ ...defaultSave(), levelId: 'gate' }), true);
  assert.equal(hasProgress(null), false);
  const s = summarize({ data: migrate({ levelId: 'town', kittens: ['biscuit', 'noodle'], maxHp: 10, levels: { meadow: { cleared: true } } }), progress: true, savedAt: 5 });
  assert.equal(s.levelId, 'town'); assert.equal(s.kittens, 2); assert.equal(s.kittensTotal, 18); assert.equal(s.hearts, 5);
  assert.deepEqual(s.cleared, ['meadow']); assert.equal(s.savedAt, 5); assert.equal(s.progress, true);
  assert.equal(summarize(null), null);
});

// ------------------------------------------------------------------ IMPLEMENTATION_PLAN §7.4 + Phase W (save.1 / save.W1)
test('save.1 / V1: an old save takes every new setting default; valid new values survive a reload', () => {
  const def = defaultState().settings;
  const old = migrate({ ...TECH_V1_DEFAULT(), settings: { master: 0.5, camZoom: 1.2, camLock: true } });
  for (const k of ['camLockMode', 'camCursorLead', 'camZoomPortrait', 'biggerHero', 'fpsCap', 'batterySaver', 'hudMode',
    'hitWords', 'tutorialHints', 'pathPreview', 'reduceCameraMotionAuto', 'reduceFlashesAuto']) {
    assert.deepEqual(old.settings[k], def[k], `default ${k}`);
  }
  assert.equal(old.settings.master, 0.5); assert.equal(old.settings.camZoom, 1.2);
  const set = { camLockMode: 'semi', camCursorLead: 0.1, camZoomPortrait: 0.8, biggerHero: true, fpsCap: 30, batterySaver: true,
    quality: 'low', hudMode: 'full', hitWords: false, tutorialHints: false, pathPreview: 'off' };
  const back = migrate(JSON.parse(JSON.stringify({ ...defaultSave(), settings: { ...def, ...set } })));
  for (const [k, v] of Object.entries(set)) assert.deepEqual(back.settings[k], v, `kept ${k}`);
  assert.equal(migrate({ settings: { fpsCap: 'off' } }).settings.fpsCap, 'off');
  assert.equal(migrate({ settings: { fpsCap: 60 } }).settings.fpsCap, 60);
});

test('save.1: AUTOCAM §13 ranges / enums are validated; booleans stay booleans', () => {
  const m = migrate({ settings: { camZoomPortrait: 9, camCursorLead: -1, camLockMode: 'spin', fpsCap: 144, hudMode: 'loud',
    biggerHero: 'yes', batterySaver: 1, hitWords: null, quality: 'ultra' } }).settings;
  const def = defaultState().settings;
  assert.equal(m.camZoomPortrait, 1.4); assert.equal(m.camCursorLead, 0);
  assert.equal(m.camLockMode, def.camLockMode); assert.equal(m.fpsCap, def.fpsCap); assert.equal(m.hudMode, def.hudMode);
  assert.equal(m.biggerHero, false); assert.equal(m.batterySaver, false); assert.equal(m.hitWords, true); assert.equal(m.quality, 'auto');
  assert.equal(migrate({ settings: { camZoomPortrait: 0.1, camCursorLead: 0.5 } }).settings.camZoomPortrait, 0.7);
  assert.equal(migrate({ settings: { camCursorLead: 0.5 } }).settings.camCursorLead, 0.15);
});

test('save.1 / X19: camLock false → camLockMode free; pathPreview booleans → on / off; OS-following flags', () => {
  const a = migrate({ settings: { camLock: false } }).settings;
  assert.equal(a.camLockMode, 'free'); assert.equal(a.camLock, false);
  const b = migrate({ settings: { camLock: true } }).settings;
  assert.equal(b.camLockMode, 'locked'); assert.equal(b.camLock, true);
  assert.equal(migrate({ settings: { camLockMode: 'semi', camLock: true } }).settings.camLock, false, 'retired key follows the mode');
  assert.equal(migrate({ settings: { pathPreview: true } }).settings.pathPreview, 'on');
  assert.equal(migrate({ settings: { pathPreview: false } }).settings.pathPreview, 'off');
  assert.equal(migrate({ settings: { pathPreview: 'sometimes' } }).settings.pathPreview, defaultState().settings.pathPreview);
  // X31: a pre-W save that turned reduceFlashes on keeps it and stops following the OS; false keeps following it
  const c = migrate({ settings: { reduceFlashes: true, reduceCameraMotion: false } }).settings;
  assert.equal(c.reduceFlashes, true); assert.equal(c.reduceFlashesAuto, false); assert.equal(c.reduceCameraMotionAuto, true);
  const d = migrate({ settings: { reduceFlashes: true, reduceFlashesAuto: true } }).settings;
  assert.equal(d.reduceFlashesAuto, true, 'a stored Auto key wins');
  // idempotent on the migrated shape
  const once = migrate({ settings: { camLock: false, pathPreview: true, reduceFlashes: true } });
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(once))), once);
});

test('save.W1: sticker / offer / first-sighting flags persist; memo flags alone are no progress', () => {
  const flags = { 'sticker.bonk': true, 'sticker.pinkBow': true, 'seen.offer.kitten': true, 'telegraph.seen.red': true, 'telegraph.seen.aoe': true };
  const m = migrate({ ...defaultSave(), flags });
  for (const k of Object.keys(flags)) assert.equal(m.flags[k], true, k);
  assert.equal(hasProgress({ ...defaultSave(), flags: { 'seen.offer.kitten': true, 'telegraph.seen.red': true } }), false);
  assert.equal(hasProgress({ ...defaultSave(), flags: { 'sticker.bonk': true } }), true);
  assert.equal(SAVE_VERSION, 1, 'schema stays v1');
});

test('save.W1: a mid-prologue save resumes at the barn (practice); legacy saves keep their spawn', () => {
  assert.equal(migrate({ levelId: 'meadow', spawnId: 'start', flags: { 'prologue.armour': true } }).spawnId, 'practice');
  assert.equal(migrate({ levelId: 'meadow', spawnId: 'vigil_1', flags: { 'prologue.raid': true } }).spawnId, 'practice');
  assert.equal(migrate({ levelId: 'meadow', spawnId: 'start', flags: { 'prologue.armour': true, 'prologue.done': true } }).spawnId, 'start');
  assert.equal(migrate({ levelId: 'meadow', spawnId: 'vigil_1', flags: {} }).spawnId, 'vigil_1');
  assert.equal(resumeSpawn('forest', 'vigil_2', { 'prologue.armour': true }), 'vigil_2');
  const flags = migrate({ levelId: 'meadow', spawnId: 'title', flags: { 'prologue.armour': true } }).flags;
  assert.equal(flags['prologue.armour'], true, 'flags kept for story.migrateFlags');
});

test('save.W1: newGame({skipPrologue}) sets every prologue stage flag', () => {
  const ctx = fakeCtx();
  const sm = new SaveManager(ctx, { storage: createMemoryStorage() });
  sm.newGame({ skipPrologue: true });
  for (const k of ['prologue.start', 'prologue.practice', 'prologue.chart', 'prologue.raid', 'prologue.armour', 'prologue.tutorial', 'prologue.done']) {
    assert.equal(ctx.state.getFlag(k), true, k);
  }
});

// ------------------------------------------------------------------ storage primitives
test('write → load round trip; backup of the previous save; clear', () => {
  const storage = createMemoryStorage();
  const ctx = fakeCtx();
  const save = new SaveManager(ctx, { storage });
  assert.equal(save.load(), null, 'nothing stored');
  const d = { ...defaultSave(), fish: 12, flags: { 'prologue.done': true }, spawnId: 'start' };
  assert.equal(save.write(d), true);
  const rec = read(storage);
  assert.equal(rec.progress, true); assert.ok(rec.savedAt > 0); assert.equal(rec.fish, 12);
  const back = save.load();
  assert.deepEqual(back, { ...migrate(d), savedAt: rec.savedAt });
  assert.equal(save.loaded.progress, true);
  assert.equal(storage.getItem(BACKUP_KEY), null, 'first save: nothing to back up');
  save.write({ ...d, fish: 13 });
  assert.equal(read(storage, BACKUP_KEY).fish, 12, 'previous progress save kept as .bak');
  assert.equal(save.hasSave(), true);
  assert.equal(save.summary().fish, 13);
  save.clear();
  assert.equal(storage.getItem(KEY), null); assert.equal(storage.getItem(BACKUP_KEY), null);
  assert.equal(save.load(), null); assert.equal(save.hasSave(), false); assert.equal(save.summary(), null);
});

test('a corrupt save falls back to the backup; unreadable both → null', (t) => {
  const warns = quietWarn(t);
  const storage = createMemoryStorage({ [KEY]: '{"v":1,"lev', [BACKUP_KEY]: JSON.stringify({ ...defaultSave(), fish: 77, progress: true }) });
  const save = new SaveManager(fakeCtx(), { storage });
  const d = save.load();
  assert.equal(d.fish, 77); assert.equal(save.loaded.fromBackup, true);
  assert.ok(warns.some((w) => w.includes('unreadable')));
  const save2 = new SaveManager(fakeCtx(), { storage: createMemoryStorage({ [KEY]: 'not json' }) });
  assert.equal(save2.load(), null);
  const save3 = new SaveManager(fakeCtx(), { storage: createMemoryStorage({ [KEY]: '[1,2,3]' }) });
  assert.equal(save3.load(), null, 'a non-object record is ignored');
  // a settings change on top of a corrupt record keeps the backed-up game (patch reads through the same fallback)
  const ctx4 = fakeCtx({ params: { test: false } });
  const save4 = new SaveManager(ctx4, { storage });
  ctx4.state.settings.music = 0.2;
  assert.equal(save4.saveSettings('music'), true);
  const rec = read(storage);
  assert.equal(rec.fish, 77); assert.equal(rec.progress, true); assert.equal(rec.settings.music, 0.2);
  assert.equal(save4.hasSave(), true);
});

test('storage failures never throw (private mode, SecurityError, quota)', (t) => {
  const warns = quietWarn(t);
  const boom = () => { throw new Error('SecurityError'); };
  const hostile = { getItem: boom, setItem: boom, removeItem: boom };
  const save = new SaveManager(fakeCtx(), { storage: hostile });
  assert.equal(save.load(), null);
  assert.equal(save.write(defaultSave()), false);
  assert.doesNotThrow(() => save.clear());
  assert.equal(save.hasSave(), false);
  assert.ok(warns.some((w) => w.includes('write failed')));

  const none = new SaveManager(fakeCtx(), { storage: null });
  assert.equal(none.load(), null); assert.equal(none.write(defaultSave()), false); assert.doesNotThrow(() => none.clear());

  // quota: the primary write fails while a backup exists → the backup is dropped and the write retried
  const s = createMemoryStorage();
  const save2 = new SaveManager(fakeCtx(), { storage: s });
  save2.write({ ...defaultSave(), fish: 1 }); save2.write({ ...defaultSave(), fish: 2 });
  assert.ok(s.getItem(BACKUP_KEY));
  const set = s.setItem;
  let failed = false;
  s.setItem = (k, v) => { if (k === KEY && s.getItem(BACKUP_KEY) && !failed) { failed = true; throw new Error('QuotaExceededError'); } set(k, v); };
  assert.equal(save2.write({ ...defaultSave(), fish: 3 }), true);
  assert.equal(read(s).fish, 3);
});

test('constructor: no storage access, ?test → autosave off, the service API is complete', () => {
  let touched = 0;
  const spy = { getItem: () => { touched++; return null; }, setItem: () => { touched++; }, removeItem: () => { touched++; } };
  const ctx = fakeCtx();
  ctx.save = new SaveManager(ctx, { storage: spy });
  assert.equal(touched, 0, 'nothing read or written in the constructor');
  assert.equal(ctx.save.enabled, false, '?test → autosave off');
  for (const m of ['load', 'write', 'clear', 'init', 'update', 'dispose', 'newGame', 'continueGame', 'hasSave', 'summary', 'request', 'save', 'saveSettings', 'endSession'])
    assert.equal(typeof ctx.save[m], 'function', m);
});

// ------------------------------------------------------------------ autosave
test('autosave: never at the title; settings at the title are a settings-only record', async () => {
  const { ctx, save, storage, step } = await rig();
  ctx.bus.emit(E.LEVEL_LOADED, { id: 'meadow', spawnId: 'title' });
  assert.equal(save.atTitle, true);
  ctx.bus.emit(E.CHECKPOINT, { levelId: 'meadow', spawnId: 'vigil_1' });
  ctx.bus.emit(E.CUTSCENE_END, { id: 'cs00', skipped: false });
  ctx.bus.emit(E.SAVE_REQUEST, {});
  step(3);
  assert.equal(storage.getItem(KEY), null, 'nothing written at the title');

  ctx.state.settings.music = 0.3;
  ctx.bus.emit(E.SETTINGS_CHANGED, { key: 'music', value: 0.3 });
  const rec = read(storage);
  assert.equal(rec.settings.music, 0.3, 'settings saved immediately');
  assert.equal(rec.progress, false);
  assert.equal(save.hasSave(), false, 'no Continue for a settings-only record');
  assert.equal(save.load().settings.music, 0.3, 'but load() returns it so the settings apply at boot');
});

test('autosave: newGame keeps the old save until the first trigger; triggers coalesce per step', async () => {
  const storage = countingStorage({ [KEY]: JSON.stringify({ ...defaultSave(), levelId: 'gate', spawnId: 'vigil_1', fish: 999, flags: { 'town.free': true }, progress: true }) });
  const { ctx, save, step, emitted } = await rig({ storage });
  ctx.bus.emit(E.LEVEL_LOADED, { id: 'meadow', spawnId: 'title' });
  ctx.state.settings.sfx = 0.5;
  const target = save.newGame({ difficulty: 'nine' });
  assert.deepEqual(target, { levelId: 'meadow', spawnId: 'practice' });
  assert.equal(ctx.state.difficulty, 'nine'); assert.equal(ctx.state.fish, 0); assert.equal(ctx.state.settings.sfx, 0.5, 'settings kept');
  assert.ok(emitted.some(([type, p]) => type === E.SAVE_LOADED && p.reason === 'new'), 'save:loaded {reason: new}');
  ctx.bus.emit(E.CUTSCENE_START, { id: 'cs01' });
  step(2);
  assert.equal(read(storage).fish, 999, 'old save untouched before the new game\'s first autosave');

  storage.writes = {};
  ctx.state.addKitten('biscuit');
  ctx.bus.emit(E.CHECKPOINT, { levelId: 'meadow', spawnId: 'vigil_1' });
  ctx.bus.emit(E.KITTEN_RESCUED, { kittenId: 'biscuit' });
  ctx.bus.emit(E.OBJECTIVE, { id: 'net_ropes', value: 3, max: 3, done: true });
  ctx.bus.emit(E.OBJECTIVE, { id: 'x', value: 1, max: 3, done: false });
  assert.equal(storage.writes[KEY] ?? 0, 0, 'deferred to the end of the step');
  step();
  assert.equal(storage.writes[KEY], 1, 'three triggers → one write');
  const rec = read(storage);
  assert.equal(rec.progress, true); assert.equal(rec.spawnId, 'vigil_1'); assert.equal(rec.difficulty, 'nine');
  assert.deepEqual(rec.kittens, ['biscuit']); assert.equal(rec.fish, 0);
  assert.equal(save.lastSave.ok, true); assert.equal(save.lastSave.count, 1);
  assert.equal(ctx.state.savedAt, rec.savedAt);
  assert.equal(read(storage, BACKUP_KEY).fish, 999, 'the replaced save is the backup');
  step(5);
  assert.equal(storage.writes[KEY], 1, 'no writes without triggers');
});

test('autosave: deferred during cutscenes and loads, written once they end', async () => {
  const { ctx, save, storage, step } = await rig();
  save.newGame({ skipPrologue: true });
  ctx.story.isPlaying = true;
  ctx.bus.emit(E.SAVE_REQUEST, {});
  step(10);
  assert.equal(storage.getItem(KEY), null, 'held during the cutscene');
  ctx.story.isPlaying = false;
  ctx.levels.loading = true;
  step(3);
  assert.equal(storage.getItem(KEY), null, 'held during a level load');
  ctx.levels.loading = false;
  step();
  const rec = read(storage);
  assert.equal(rec.spawnId, 'start'); assert.equal(rec.flags['prologue.done'], true);
  assert.equal(save.save('manual'), true, 'save() writes at once');
  ctx.story.isPlaying = true;
  ctx.bus.emit(E.SAVE_REQUEST, {});
  step(Math.ceil(181 * 60));
  assert.equal(save.dirty, null, 'a stuck cutscene cannot hold a save forever');
});

test('autosave: level exit stores the next level as the resume point; title load = final save + session end', async () => {
  const { ctx, save, storage, step } = await rig();
  await save.continueGame();                       // nothing stored → null, still at the title
  assert.equal(save.atTitle, true);
  save.newGame({ skipPrologue: true });
  ctx.bus.emit(E.LEVEL_LOADED, { id: 'meadow', spawnId: 'start' });
  step();
  ctx.state.flags['meadow.done'] = true;
  ctx.bus.emit(E.LEVEL_EXIT, { to: 'forest', spawnId: 'start' });
  step();
  let rec = read(storage);
  assert.equal(rec.levelId, 'forest'); assert.equal(rec.spawnId, 'start'); assert.equal(rec.flags['meadow.done'], true);
  assert.equal(ctx.state.levelId, 'meadow', 'ctx.state is not rewritten by the exit');
  ctx.state.levelId = 'forest'; ctx.state.spawnId = 'start';
  ctx.bus.emit(E.LEVEL_LOADED, { id: 'forest', spawnId: 'start' });
  step();
  ctx.state.fish = 55;
  ctx.bus.emit(E.LEVEL_LOADING, { id: 'meadow', spawnId: 'title' });
  rec = read(storage);
  assert.equal(rec.fish, 55, 'final save on the way to the title');
  assert.equal(save.atTitle, true);
  ctx.state.fish = 1;
  ctx.bus.emit(E.CHECKPOINT, { levelId: 'meadow', spawnId: 'vigil_1' });
  step();
  assert.equal(read(storage).fish, 55, 'no writes after the session ended');
});

test('the results card (ui freezes the world with mode cutscene, no story scene) does not hold the exit save', async () => {
  const { ctx, save, storage, step } = await rig();
  save.newGame({ skipPrologue: true });
  ctx.game.mode = 'cutscene';
  ctx.state.flags['meadow.done'] = true;
  ctx.bus.emit(E.LEVEL_EXIT, { to: 'forest', spawnId: 'start' });
  step();
  const rec = read(storage);
  assert.equal(rec?.levelId, 'forest'); assert.equal(rec.flags['meadow.done'], true);
});

test('continueGame restores the stored game (current settings kept) and loads its spawn', async () => {
  const storage = createMemoryStorage({ [KEY]: JSON.stringify({ ...defaultSave(), levelId: 'forest', spawnId: 'vigil_2', fish: 321, playtime: 600,
    flags: { 'prologue.done': true }, settings: { ...defaultSave().settings, music: 0.1 }, progress: true }) });
  const { ctx, save, emitted } = await rig({ storage });
  ctx.bus.emit(E.LEVEL_LOADED, { id: 'meadow', spawnId: 'title' });
  ctx.state.playtime = 999;                         // title-screen time must not leak into the save
  ctx.state.settings.music = 0.4;
  const loads = [];
  ctx.levels.load = async (id, sp) => { loads.push([id, sp]); };
  const target = await save.continueGame();
  assert.deepEqual(target, { levelId: 'forest', spawnId: 'vigil_2' });
  assert.deepEqual(loads, [['forest', 'vigil_2']]);
  assert.equal(ctx.state.fish, 321); assert.equal(ctx.state.playtime, 600); assert.equal(ctx.state.settings.music, 0.4);
  assert.ok(emitted.some(([type, p]) => type === E.SAVE_LOADED && p.reason === 'continue'));
  assert.equal(save.active, true);
});

/** A §19.7 progress record as the slot would hold it. */
const stored = (o = {}) => JSON.stringify({ ...defaultSave(), levelId: 'gate', spawnId: 'vigil_1', fish: 999, playtime: 500,
  flags: { 'prologue.armour': true, 'prologue.done': true, 'town.free': true }, progress: true, savedAt: 42, ...o });

/** What LevelManager does around a load: state.levelId/spawnId, then level:loading → level:loaded. */
function loadLevel(ctx, id, spawnId) {
  ctx.bus.emit(E.LEVEL_LOADING, { id, spawnId });
  ctx.state.levelId = id; ctx.state.spawnId = spawnId;
  ctx.bus.emit(E.LEVEL_LOADED, { id, spawnId });
}

/** Core's fixed step as far as save cares: playtime ticks (not while loading / in menu), then save.update. */
function coreSteps(ctx, save, n) {
  for (let i = 0; i < n; i++) {
    if (!ctx.levels.loading && ctx.game.mode !== 'menu') ctx.state.playtime += 1 / 60;
    save.update(1 / 60);
  }
}

test('title: the boot title load puts the stored resume point back into ctx.state (story.continueGame reads it)', async () => {
  const { ctx, save, storage } = await rig({ storage: countingStorage({ [KEY]: stored() }) });
  ctx.state.reset(save.load());                     // what core does at boot
  loadLevel(ctx, 'meadow', 'title');                // LevelManager overwrote levelId/spawnId → save restores them
  assert.equal(ctx.state.levelId, 'gate'); assert.equal(ctx.state.spawnId, 'vigil_1');
  coreSteps(ctx, save, 600);                        // 10 s on the title screen
  assert.ok(ctx.state.playtime > 509);
  assert.equal(storage.writes[KEY] ?? 0, 0, 'the title never writes');
  // story.continueGame(): levels.load(state.levelId, state.spawnId)
  loadLevel(ctx, ctx.state.levelId, ctx.state.spawnId);
  assert.ok(Math.abs(ctx.state.playtime - 500) < 1e-6, `title time kept out of playtime (${ctx.state.playtime})`);
  coreSteps(ctx, save, 1);
  const rec = read(storage);
  assert.equal(rec.levelId, 'gate'); assert.equal(rec.spawnId, 'vigil_1'); assert.equal(rec.fish, 999);
  assert.ok(rec.playtime < 501, 'the stored playtime has no title time in it');
  assert.equal(save.active, true, 'committed by its first write');
});

test('title: a story-driven New Game abandoned during CS-01 keeps the old save, and the title restores it', async () => {
  const { ctx, save, storage, emitted } = await rig({ storage: countingStorage({ [KEY]: stored() }) });
  ctx.state.reset(save.load());
  loadLevel(ctx, 'meadow', 'title');
  // story.newGame(): its own reset, then meadow/practice and CS-01 right away
  ctx.state.reset({ settings: { ...ctx.state.settings }, difficulty: 'nine' });
  loadLevel(ctx, 'meadow', 'practice');
  ctx.story.isPlaying = true;
  coreSteps(ctx, save, 120);
  assert.equal(read(storage).fish, 999, 'nothing written while CS-01 plays');
  assert.equal(save.active, false, 'not committed yet');
  // Pause → Quit to Title (story.skip() ran the CS-01 end: flag + save request), then the title load
  ctx.state.flags['prologue.armour'] = true;
  ctx.bus.emit(E.SAVE_REQUEST, {});
  ctx.story.isPlaying = false;
  loadLevel(ctx, 'meadow', 'title');
  const rec = read(storage);
  assert.equal(rec.fish, 999); assert.equal(rec.levelId, 'gate'); assert.equal(rec.difficulty, 'knight');
  assert.equal(ctx.state.fish, 999, 'ctx.state is the stored game again (what Continue resumes)');
  assert.equal(ctx.state.levelId, 'gate'); assert.equal(ctx.state.difficulty, 'knight');
  assert.ok(emitted.some(([type, p]) => type === E.SAVE_LOADED && p.reason === 'title'));
  assert.equal(storage.writes[KEY] ?? 0, 0, 'no write at all');
});

test('title: the same New Game, once CS-01 ends, takes over the slot; Quit to Title saves the new game', async () => {
  const { ctx, save, storage } = await rig({ storage: countingStorage({ [KEY]: stored() }) });
  ctx.state.reset(save.load());
  loadLevel(ctx, 'meadow', 'title');
  ctx.state.reset({ settings: { ...ctx.state.settings }, difficulty: 'nine' });
  loadLevel(ctx, 'meadow', 'practice');
  ctx.story.isPlaying = true;
  coreSteps(ctx, save, 30);
  ctx.state.flags['prologue.armour'] = true;
  ctx.story.isPlaying = false;
  ctx.bus.emit(E.CUTSCENE_END, { id: 'cs01', skipped: false });
  coreSteps(ctx, save, 1);
  let rec = read(storage);
  assert.equal(rec.fish, 0); assert.equal(rec.difficulty, 'nine'); assert.equal(rec.spawnId, 'practice');
  assert.equal(rec.flags['prologue.armour'], true);
  assert.equal(read(storage, BACKUP_KEY).fish, 999, 'the old game is the backup');
  ctx.state.fish = 3;
  loadLevel(ctx, 'meadow', 'title');
  rec = read(storage);
  assert.equal(rec.fish, 3, 'final save on Quit to Title');
  assert.equal(ctx.state.fish, 3);
});

test('title: fresh install, a level loaded from the title starts saving; ?test never touches ctx.state at the title', async () => {
  const a = await rig();
  loadLevel(a.ctx, 'meadow', 'title');
  loadLevel(a.ctx, 'meadow', 'start');
  a.step();
  assert.equal(read(a.storage).progress, true);

  const b = await rig({ storage: countingStorage({ [KEY]: stored() }), params: { test: true } });
  loadLevel(b.ctx, 'meadow', 'title');
  assert.equal(b.ctx.state.levelId, 'meadow', '?test: the slot is never read');
  assert.equal(b.ctx.state.spawnId, 'title');
});

test('?test and ?level dev jumps: autosave off; setEnabled turns it on', async () => {
  const t1 = await rig({ params: { test: true } });
  assert.equal(t1.save.enabled, false);
  t1.save.newGame();
  assert.equal(t1.save.request('x'), false);
  t1.ctx.bus.emit(E.SETTINGS_CHANGED, { key: 'music', value: 0.1 });
  t1.step();
  assert.equal(t1.storage.getItem(KEY), null);
  t1.save.setEnabled(true);
  assert.equal(t1.save.request('x'), true);
  t1.step();
  assert.equal(read(t1.storage).progress, true);
  const t2 = await rig({ params: { test: false, level: 'forest' } });
  assert.equal(t2.save.enabled, false);
});

test('settings: a slider drag is throttled, the last value always lands; difficulty patches too', async () => {
  const storage = countingStorage({ [KEY]: JSON.stringify({ ...defaultSave(), fish: 50, progress: true, savedAt: 1234 }) });
  const { ctx, save, step } = await rig({ storage });
  ctx.bus.emit(E.LEVEL_LOADED, { id: 'meadow', spawnId: 'title' });
  storage.writes = {};
  for (let i = 1; i <= 10; i++) { ctx.state.settings.master = i / 10; ctx.bus.emit(E.SETTINGS_CHANGED, { key: 'master', value: i / 10 }); }
  assert.equal(storage.writes[KEY], 1, 'first change written at once');
  await new Promise((r) => setTimeout(r, 270));
  step();
  assert.equal(storage.writes[KEY], 2, 'the rest in one write after the interval');
  const rec = read(storage);
  assert.equal(rec.settings.master, 1); assert.equal(rec.fish, 50, 'progress untouched'); assert.equal(rec.progress, true);
  assert.equal(rec.savedAt, 1234, 'a settings patch keeps the progress timestamp');
  await new Promise((r) => setTimeout(r, 270));
  ctx.state.difficulty = 'kitten';
  ctx.bus.emit(E.SETTINGS_CHANGED, { key: 'difficulty', value: 'kitten' });
  assert.equal(read(storage).difficulty, 'kitten');
});

test('page hide: pending save written; otherwise the stored playtime is kept current', async () => {
  const { ctx, save, storage } = await rig();
  save.newGame({ skipPrologue: true });
  ctx.bus.emit(E.CHECKPOINT, { levelId: 'meadow', spawnId: 'vigil_1' });
  save._onHide();
  assert.equal(read(storage).spawnId, 'vigil_1', 'pending checkpoint flushed on hide');
  ctx.state.playtime = 321;
  ctx.state.fish = 9;
  save._onHide();
  const rec = read(storage);
  assert.equal(rec.playtime, 321); assert.equal(rec.fish, 0, 'only playtime is patched');
});

test('Nine Lives: a lost life autosaves; Knight does not; unlocks / letters / Heart Bells / quests do', async () => {
  const { ctx, save, storage, step } = await rig();
  save.newGame({ difficulty: 'knight', skipPrologue: true });
  ctx.bus.emit(E.PLAYER_LIFE_LOST, { lives: 8 });
  step();
  assert.equal(storage.getItem(KEY), null);
  ctx.state.difficulty = 'nine';
  ctx.state.lives = 7;
  ctx.bus.emit(E.PLAYER_LIFE_LOST, { lives: 7 });
  step();
  assert.equal(read(storage).lives, 7);
  for (const [ev, p, reason] of [[E.UNLOCK, { kind: 'cape', id: 'memeWhite' }, 'unlock'], [E.ITEM_PICKUP, { item: 'letter', id: 'l1' }, 'pickup'],
    [E.ITEM_PICKUP, { item: 'heartBell', id: 'bell1' }, 'pickup'], [E.QUEST_UPDATE, { questId: 'q', state: 'done' }, 'quest']]) {
    ctx.bus.emit(ev, p); step();
    assert.equal(save.lastSave.reason, reason, `${ev} autosaves`);
  }
  const n = save.lastSave.count;
  ctx.bus.emit(E.ITEM_PICKUP, { item: 'fish', amount: 1 }); step();
  assert.equal(save.lastSave.count, n, 'fish pickups do not');
});

test('objective:progress {done}: one save per completion, even if done is re-emitted', async () => {
  const { ctx, save, step } = await rig();
  save.newGame({ skipPrologue: true });
  const done = { id: 'line', value: 100, max: 100, textKey: null, frozen: false, done: true };
  ctx.bus.emit(E.OBJECTIVE, done); step();
  const n = save.lastSave.count;
  assert.equal(save.lastSave.reason, 'objective');
  for (let i = 0; i < 5; i++) { ctx.bus.emit(E.OBJECTIVE, done); step(); }
  assert.equal(save.lastSave.count, n, 'repeated done emits do not rewrite');
  ctx.bus.emit(E.LEVEL_LOADING, { id: 'gate', spawnId: 'start' });
  ctx.bus.emit(E.OBJECTIVE, done); step();
  assert.equal(save.lastSave.count, n + 1, 'a new level (replay) saves the completion again');
});

test('dispose unsubscribes everything', async () => {
  const { ctx, save, step } = await rig();
  save.newGame();
  save.dispose();
  ctx.bus.emit(E.CHECKPOINT, { levelId: 'meadow', spawnId: 'vigil_1' });
  step();
  assert.equal(save.dirty, null);
});
