// tests/unit/events.test.js  (owner: core) — U16: the frozen catalog (tech.md §4.4 + §19.5) and EventBus.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E, KNOWN } from '../../src/core/events.js';
import { EventBus } from '../../src/core/EventBus.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const TECH = {
  GAME_READY: 'game:ready', GAME_PAUSE: 'game:pause', LEVEL_LOADING: 'level:loading', LEVEL_LOADED: 'level:loaded',
  LEVEL_UNLOAD: 'level:unload', LEVEL_EXIT: 'level:exit', CHECKPOINT: 'checkpoint', PLAYER_SPAWNED: 'player:spawned',
  PLAYER_DAMAGED: 'player:damaged', PLAYER_HEALED: 'player:healed', PLAYER_DIED: 'player:died', PLAYER_SWING: 'player:swing',
  PLAYER_CHARGE: 'player:charge', PLAYER_HOLY: 'player:holy', PLAYER_DODGE: 'player:dodge', PLAYER_JUMP: 'player:jump',
  PLAYER_LAND: 'player:land', FOOTSTEP: 'actor:footstep', HIT: 'combat:hit', ENEMY_SPAWNED: 'enemy:spawned',
  ENEMY_ALERTED: 'enemy:alerted', ENEMY_DIED: 'enemy:died', BOSS_PHASE: 'boss:phase', INTERACT_AVAILABLE: 'interact:available',
  INTERACT_CLEAR: 'interact:clear', INTERACT: 'interact', ITEM_PICKUP: 'item:pickup', KITTEN_RESCUED: 'kitten:rescued',
  DIALOG_START: 'dialog:start', DIALOG_LINE: 'dialog:line', DIALOG_END: 'dialog:end', QUEST_UPDATE: 'quest:update',
  FLAG_SET: 'story:flag', TOAST: 'ui:toast', MUSIC: 'audio:music', SHAKE: 'fx:shake', HITSTOP: 'fx:hitstop', BURST: 'fx:burst',
  SAVE_REQUEST: 'save:request', SAVE_LOADED: 'save:loaded', PROGRESS: 'ui:progress',
};
const S195 = {
  GAME_MODE: 'game:mode', PLAYER_GUARD: 'player:guard', PLAYER_GRIT: 'player:grit', PLAYER_PARRY: 'player:parry',
  PLAYER_PERFECT_DODGE: 'player:perfectDodge', PLAYER_VALOR: 'player:valor', PLAYER_GOLDEN: 'player:golden',
  PLAYER_LIFE_LOST: 'player:lifeLost', PLAYER_STILL_STANDING: 'player:stillStanding', PLAYER_MILK: 'player:milk',
  PLAYER_MEOW: 'player:meow', TELEGRAPH: 'combat:telegraph', TELEGRAPH_END: 'combat:telegraphEnd', REFLECT: 'combat:reflect',
  ENEMY_JEER: 'enemy:jeer', ENEMY_CHOKE: 'enemy:choke', ITEM_STOLEN: 'item:stolen', ITEM_RETURNED: 'item:returned',
  BOSS_START: 'boss:start', BOSS_DIZZY: 'boss:dizzy', BOSS_DEFEATED: 'boss:defeated', COMPANION_ABILITY: 'companion:ability',
  COMPANION_NAP: 'companion:nap', COMPANION_CHANGED: 'companion:changed', KITTEN_REVEAL: 'kitten:reveal',
  CUTSCENE_START: 'cutscene:start', CUTSCENE_END: 'cutscene:end', PROMPT: 'story:prompt', SHARD: 'story:shard',
  UNLOCK: 'state:unlock', CAM_MODE: 'camera:mode', MEME_CAM: 'camera:meme', ENV_SET: 'env:set', ENV_CHANGED: 'env:changed',
  ARENA_LOCK: 'arena:lock', ARENA_WAVE: 'arena:wave', ARENA_CLEAR: 'arena:clear', OBJECTIVE: 'objective:progress',
  LEVEL_RESULTS: 'level:results',
};

function srcFiles(dir = path.join(ROOT, 'src'), out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) srcFiles(p, out); else if (/\.(js|mjs)$/.test(p)) out.push(p);
  }
  return out;
}

test('U16: no duplicate event strings; KNOWN mirrors E; E is frozen', () => {
  const vals = Object.values(E);
  assert.equal(new Set(vals).size, vals.length, 'duplicate event strings');
  assert.equal(KNOWN.size, vals.length);
  assert.ok(Object.isFrozen(E));
});

test('tech.md §4.4 base catalog is present, names and strings unchanged', () => {
  for (const [k, v] of Object.entries(TECH)) assert.equal(E[k], v, `E.${k}`);
});

test('§19.5 additions are present with the frozen strings', () => {
  for (const [k, v] of Object.entries(S195)) assert.equal(E[k], v, `E.${k}`);
});

test('U16: every E.* used in src/ exists; bus calls with string literals use known events', () => {
  const missing = [], unknown = [];
  for (const f of srcFiles()) {
    const src = fs.readFileSync(f, 'utf8'), rel = path.relative(ROOT, f);
    for (const m of src.matchAll(/\bE\.([A-Z][A-Z0-9_]*)\b/g)) if (!(m[1] in E)) missing.push(`${rel}: E.${m[1]}`);
    for (const m of src.matchAll(/\bbus\.(?:emit|on|once|off|wait)\(\s*['"`]([^'"`]+)['"`]/g)) if (!KNOWN.has(m[1])) unknown.push(`${rel}: '${m[1]}'`);
  }
  assert.deepEqual(missing, [], 'unknown E constants:\n' + missing.join('\n'));
  assert.deepEqual(unknown, [], 'unknown event strings:\n' + unknown.join('\n'));
});

test('EventBus: on / emit / off / once / wait / tap; handler errors are isolated; unknown names warn', async () => {
  const bus = new EventBus();
  const got = [];
  const off = bus.on(E.TOAST, (p) => got.push(p.text));
  bus.emit(E.TOAST, { text: 'a' });
  off();
  bus.emit(E.TOAST, { text: 'b' });
  assert.deepEqual(got, ['a']);

  let n = 0;
  bus.once(E.SHAKE, () => n++);
  bus.emit(E.SHAKE, {}); bus.emit(E.SHAKE, {});
  assert.equal(n, 1);

  const waited = bus.wait(E.HIT, (p) => p.damage > 5);
  bus.emit(E.HIT, { damage: 1 }); bus.emit(E.HIT, { damage: 9 });
  assert.equal((await waited).damage, 9);

  const tapped = [];
  const untap = bus.tap((type) => tapped.push(type));
  bus.emit(E.MUSIC, {}); untap(); bus.emit(E.MUSIC, {});
  assert.deepEqual(tapped, [E.MUSIC]);

  const origErr = console.error, origWarn = console.warn;
  const errs = [], warns = [];
  console.error = (...a) => errs.push(a); console.warn = (...a) => warns.push(a);
  try {
    let after = false;
    bus.on(E.BURST, () => { throw new Error('boom'); });
    bus.on(E.BURST, () => { after = true; });
    bus.emit(E.BURST, {});
    assert.ok(after, 'later handlers still run');
    assert.equal(errs.length, 1);
    bus.emit('not:an-event', {});
    assert.equal(warns.length, 1);
  } finally { console.error = origErr; console.warn = origWarn; }

  // a handler that unsubscribes another during emit does not break iteration
  const order = [];
  const offB = bus.on(E.INTERACT, () => order.push('b'));
  bus.on(E.INTERACT, () => { order.push('c'); offB(); });
  bus.emit(E.INTERACT, {}); bus.emit(E.INTERACT, {});
  assert.deepEqual(order, ['b', 'c', 'c']);
});
