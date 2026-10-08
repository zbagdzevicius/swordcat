// tests/unit/audio.test.js  (owner: audio) — GAME_DESIGN §16 (music, SFX map, procedural audio, babble, mix) and the
// audio side of U15. Pure modules are tested directly; AudioManager runs twice: without WebAudio (node: requests are
// logged, nothing plays) and against a small fake AudioContext (graph, voice limits, ducks, crossfades, procedural).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { E } from '../../src/core/events.js';
import { ATTACKS, TELEGRAPH, LEVEL_IDS } from '../../src/core/config.js';
import { createRng } from '../../src/core/rng.js';
import manifest, { levels as manifestLevels } from '../../src/audio/assets.manifest.js';
import { buildIndex, expandId, resolveId, isMusicPath } from '../../src/audio/ids.js';
import {
  SFX, sfxFileIds, CUTSCENE_SFX, MATERIAL_HIT, ENEMY_VOICE, enemyVoiceFor, actorTypeId, TELEGRAPH_SFX, FOOTSTEP, LEVEL_SURFACE,
  PICKUP_SFX, BURST_SFX, seq,
} from '../../src/audio/sfxMap.js';
import { VOICES, babblePlan, speakerKey, voiceFor, babbleFileIds, BABBLE } from '../../src/audio/babble.js';
import {
  WIND, windParams, pinkNoise, BELL, bellPartials, bellDuration, LAUGH, laughPlan, laughLength, HEART, heartbeatPlan, MARCH,
  proceduralFileIds, SHIMMER,
} from '../../src/audio/procedural.js';
import { TRACKS, LEVEL_MUSIC, CONTEXT_MUSIC, MUSIC_RULES, MusicDirector, trackId, levelMusic, musicFiles, AMBIENCE, trackGain, MUSIC_TARGET_DB } from '../../src/audio/musicMap.js';
import { ZZFX_DEFS, zzfxDuration } from '../../src/audio/sfxDefs.js';
import { MIX, DUCK, MEME } from '../../src/audio/mix.js';
import { AudioManager } from '../../src/audio/AudioManager.js';
import { fakeCtx } from './_fakeCtx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = path.join(ROOT, 'public', 'assets');
const INDEX = buildIndex(manifest);
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ================================================================================================ manifest (U15)
test('manifest: every path exists on disk, is unique, sorted, audio-only; levels are subsets of the default list', () => {
  const missing = manifest.filter((p) => !fs.existsSync(path.join(PUBLIC, p)));
  assert.deepEqual(missing, [], 'audio manifest paths missing on disk');
  assert.equal(new Set(manifest).size, manifest.length, 'duplicates');
  assert.deepEqual([...manifest].sort(), manifest, 'sorted');
  for (const p of manifest) assert.match(p, /^audio\/(music|sfx)\/.+\.(ogg|mp3)$/, p);
  const all = new Set(manifest);
  for (const [k, list] of Object.entries(manifestLevels)) {
    assert.ok(k === '*' || LEVEL_IDS.includes(k), `levels key ${k}`);
    for (const p of list) assert.ok(all.has(p), `levels.${k}: ${p} not in the default list`);
  }
  for (const id of LEVEL_IDS.filter((l) => l !== 'sky')) assert.ok(manifestLevels[id]?.length > 0, `levels.${id} subset`);
  // streamed music is never preloaded; the buffered loop + sting are
  for (const t of Object.values(TRACKS)) assert.equal(manifestLevels['*'].includes(t.file), !!t.buffer, `${t.file} preload`);
  // the manifest is pure data (§18.4): no imports
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'src/audio/assets.manifest.js'), 'utf8'), /^\s*import\s/m);
});

test('manifest: every sound id the audio maps name resolves to a listed file (regenerate the manifest when this fails)', () => {
  const ids = [...sfxFileIds(), ...babbleFileIds(), ...proceduralFileIds(), ...musicFiles(), ...Object.values(AMBIENCE).map((a) => a.id)];
  const unresolved = ids.filter((id) => expandId(id, INDEX).length === 0);
  assert.deepEqual(unresolved, [], 'ids with no file in src/audio/assets.manifest.js');
  // and nothing in the manifest is dead weight: each listed file is reachable from some id
  const reach = new Set(ids.flatMap((id) => expandId(id, INDEX)));
  const levelIds = Object.values(manifestLevels).flat();
  const unused = manifest.filter((p) => !reach.has(p) && !levelIds.includes(p));
  assert.deepEqual(unused, [], 'manifest files no sound id reaches');
});

test('§16.2 / §5.4 / §8.1 / §8.2: every file the design names for M1 (meadow, prologue, CS-00..03) resolves', () => {
  const spec = [
    // §16.2 player, combat, pickups, UI
    'sword/swish_01–13', 'sword/swing', 'sword/swing2', 'sword/swing3', 'sword/sword_attack_01–10', 'impact/impactPlate_light_00x',
    'impact/impactPlate_medium_00x', 'impact/impactWood_light_00x', 'creature/creature_die_01', 'pickup/powerup_fx01',
    'impact/impactMetal_medium_00x', 'sword/sword_clash_01–10', 'impact/metal_ringing', 'impact/metal_small1', 'impact/impactPlate_heavy_000',
    'pickup/powerup_rise01', 'pickup/powerup_rise03', 'ui/glitch_001', 'magic/spell_fire_03', 'impact/impactMetal_heavy_00x', 'magic/magic1',
    'pickup/powerup_upper01', 'jingles/jingles_STEEL0x', 'magic/spell_fire_07', 'impact/impactPlate_heavy_00x', 'impact/cloth_heavy',
    'impact/chainmail2', 'impact/cloth', 'impact/impactSoft_medium_00x', 'footsteps/footstep_grass_000', 'footsteps/footstep_grass_004',
    'footsteps/stone_l1', 'footsteps/stone_r3', 'footsteps/footstep_wood_000', 'footsteps/sand_l1', 'footsteps/sand_r3', 'impact/armor_light',
    'cat/cute_creature_0x', 'cat/cat_softmew', 'pickup/powerup_downer01', 'cat/kitten_mew_01', 'cat/meow_baby_01', 'pickup/bubble',
    'pickup/bubble2', 'pickup/bubble3', 'cat/cat_purrsleepy_loop', 'magic/spell_02', 'pickup/coins_01–04', 'pickup/coin2', 'pickup/gem_01',
    'pickup/powerup_rise05', 'jingles/jingles_NES02', 'jingles/jingles_PIZZI00–04', 'ui/bookFlip1', 'jingles/jingles_NES00',
    'world/wood_hit_0x', 'world/wood_breaking_01–02', 'world/metal_open_01', 'world/lock_open_01', 'world/keys_01', 'world/metal_close_01',
    'impact/chain_01–03', 'creature/rat_squeak_attack', 'creature/rat_squeak_pain', 'creature/rat_squeak_death', 'creature/c80_scream_01/02',
    'creature/c80_hurt_0x', 'creature/c80_cough_01', 'creature/c80_eat_01', 'creature/creature_roar_01–03', 'creature/c80_roar_01–03',
    'creature/c80_ooh', 'creature/c80_snore', 'creature/animal_moo', 'creature/animal_peeps', 'ui/click_00x', 'ui/select_00x',
    'ui/confirmation_001', 'ui/back_001', 'ui/bookOpen', 'ui/bookClose', 'ui/scroll_001', 'ui/drop_002',
    // §8.1 telegraphs, §8.2 juice
    'ui/glass_002', 'ui/pluck_001', 'creature/c80_grunt_0x', 'magic/spell_01', 'world/metalClick', 'sword/melee_sword', 'impact/impactPunch_heavy_00x',
    'jingles/jingles_NES03',
    // §16.3 laugh build + Sunbell layer; §5.4 CS-01..03 audio columns
    'creature/c80_troll_01–03', 'creature/c80_weird_01–05', 'ui/drop_001', 'world/creak1', 'sword/sword_unsheathe', 'sword/sword_unsheathe2',
    'cat/cat_purractive_loop', 'creature/c80_monster_0x', 'impact/chain_0x', 'impact/impactSoft_heavy_00x', 'creature/creature_roar_02',
    'creature/c80_roar_01', 'creature/creature_roar_01',
    // §16.1 every track
    ...Object.values(TRACKS).map((t) => t.file),
  ];
  const bad = spec.filter((id) => expandId(id, INDEX).length === 0);
  assert.deepEqual(bad, []);
  // meadow / CS sounds preload with the meadow subset (or '*')
  const pre = new Set([...manifestLevels['*'], ...manifestLevels.meadow]);
  for (const id of ['creature/c80_troll_01', 'creature/creature_roar_02', 'creature/c80_roar_01', 'pickup/bubble2', 'creature/animal_moo', 'creature/rat_squeak_attack']) {
    assert.ok(expandId(id, INDEX).every((p) => pre.has(p)), `${id} preloads for meadow`);
  }
});

// ================================================================================================ ids
test('ids: short ids, full paths, 0x / 00x / ranges / slash lists, music ids; unknown → null', () => {
  const idx = buildIndex(['audio/sfx/pickup/bubble2.ogg', 'audio/sfx/impact/chain_01.ogg', 'audio/sfx/impact/chain_03.ogg',
    'audio/sfx/impact/impactSoft_heavy_000.ogg', 'audio/sfx/impact/impactSoft_heavy_004.ogg', 'audio/sfx/sword/swish_01.ogg',
    'audio/sfx/sword/swish_13.ogg', 'audio/sfx/creature/c80_scream_02.ogg', 'audio/music/field_of_dreams.mp3', 'models/x.glb']);
  assert.equal(resolveId('pickup/bubble2', idx), 'audio/sfx/pickup/bubble2.ogg');
  assert.equal(resolveId('audio/sfx/pickup/bubble2.ogg', idx), 'audio/sfx/pickup/bubble2.ogg');
  assert.equal(resolveId('public/assets/audio/sfx/pickup/bubble2.ogg', idx), 'audio/sfx/pickup/bubble2.ogg');
  assert.equal(resolveId('music/field_of_dreams', idx), 'audio/music/field_of_dreams.mp3');
  assert.deepEqual(expandId('impact/chain_0x', idx), ['audio/sfx/impact/chain_01.ogg', 'audio/sfx/impact/chain_03.ogg']);
  assert.deepEqual(expandId('impact/impactSoft_heavy_00x', idx), ['audio/sfx/impact/impactSoft_heavy_000.ogg', 'audio/sfx/impact/impactSoft_heavy_004.ogg']);
  assert.deepEqual(expandId('sword/swish_01–13', idx), ['audio/sfx/sword/swish_01.ogg', 'audio/sfx/sword/swish_13.ogg']);
  assert.deepEqual(expandId('sword/swish_01-13', idx), ['audio/sfx/sword/swish_01.ogg', 'audio/sfx/sword/swish_13.ogg']);
  assert.deepEqual(expandId('creature/c80_scream_01/02', idx), ['audio/sfx/creature/c80_scream_02.ogg']);
  assert.equal(resolveId('nope/missing', idx), null);
  assert.equal(resolveId(null, idx), null);
  assert.ok(!idx.has('models/x.glb'));
  const r = createRng(3), seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(resolveId('impact/chain_0x', idx, r));
  assert.equal(seen.size, 2, 'random pick covers every variant');
  assert.ok(isMusicPath('audio/music/cave_theme.ogg') && !isMusicPath('audio/sfx/ui/click_001.ogg'));
});

// ================================================================================================ sfx map
test('sfxMap: defs are well formed (files or a zzfx fallback, layers exist, buses valid, volumes 0..1)', () => {
  for (const [name, d] of Object.entries(SFX)) {
    assert.ok(Array.isArray(d.files), name);
    assert.ok(d.files.length > 0 || (d.zzfx && ZZFX_DEFS[d.zzfx]), `${name}: no files and no zzfx`);
    for (const a of d.also ?? []) assert.ok(SFX[a], `${name}: layer ${a}`);
    if (d.bus) assert.ok(['player', 'world', 'ui'].includes(d.bus), `${name}: bus`);
    if (d.vol != null) assert.ok(d.vol > 0 && d.vol <= 4, `${name}: vol`);       // > 1 lifts quiet files (spell_fire_03 peaks at −15 dB)
    if (d.zzfx) assert.ok(ZZFX_DEFS[d.zzfx], `${name}: zzfx ${d.zzfx}`);
  }
  assert.deepEqual(seq('a_', 1, 3), ['a_01', 'a_02', 'a_03']);
  assert.deepEqual(seq('b', 0, 1, 3), ['b000', 'b001']);
  assert.deepEqual(seq('c', 1, 2, 0), ['c1', 'c2']);
  for (const [, m] of Object.entries(MATERIAL_HIT)) for (const n of [...m.light, ...m.heavy]) assert.ok(SFX[n], n);
  for (const n of [...Object.values(PICKUP_SFX), ...Object.values(BURST_SFX), ...Object.values(FOOTSTEP)]) assert.ok(SFX[n], n);
  for (const s of new Set(Object.values(LEVEL_SURFACE))) assert.ok(FOOTSTEP[s], s);
  for (const id of CUTSCENE_SFX) assert.ok(expandId(id, INDEX).length, id);
  // §16.2 numbers: charge fizzle at volume 0.3, kill sparkle at rate 1.3, faint at 0.8, kitten mew at 1.3, Sunbell layer 0.5 / 0.3
  assert.equal(SFX.chargeFizzle.vol, 0.3);
  assert.equal(SFX.killSparkle.rate, 1.3);
  assert.equal(SFX.faint.rate, 0.8);
  assert.equal(SFX.kittenMew.rate, 1.3);
  assert.equal(SFX.hurtVoice.rate, 1.2);
  assert.ok(SFX.bellLayer.rate === 0.5 && SFX.bellLayer.vol === 0.3);
  assert.equal(SFX.crowCaw.rate, 1.4);
  assert.equal(SFX.spider.rate, 1.3);
  assert.equal(SFX.armorStep.vol, 0.25);
});

test('§8.1: every telegraph kind in config has its sound; parry / gold ting 0.25 s before the strike; jeer = laugh build', () => {
  for (const kind of Object.keys(TELEGRAPH.colors)) assert.ok(TELEGRAPH_SFX[kind], kind);
  assert.equal(TELEGRAPH_SFX.parry.lead, 0.25);
  assert.equal(TELEGRAPH_SFX.gold.lead, 0.25);
  assert.equal(TELEGRAPH_SFX.jeer.name, 'laugh');
  assert.deepEqual(SFX[TELEGRAPH_SFX.parry.name].files, ['ui/glass_002']);
  assert.deepEqual(SFX[TELEGRAPH_SFX.gold.name].files, ['ui/pluck_001']);
  assert.equal(SFX[TELEGRAPH_SFX.red.name].rate, 0.7);
  assert.equal(SFX[TELEGRAPH_SFX.aoe.name].rate, 0.8);
});

test('enemy voices: type ids, variants, prefixes, props and bosses map to their §16.2 rows', () => {
  assert.equal(enemyVoiceFor('rat_pike'), ENEMY_VOICE.rat);
  assert.equal(enemyVoiceFor('rat_xbow'), ENEMY_VOICE.rat);
  assert.equal(enemyVoiceFor('bonehead:warrior'), ENEMY_VOICE.bonehead);
  assert.equal(enemyVoiceFor('jelly_l'), ENEMY_VOICE.jelly);
  assert.equal(enemyVoiceFor('boss_barkus'), ENEMY_VOICE.boss_barkus);
  assert.equal(enemyVoiceFor('BOSS_CACKLEJAW'), ENEMY_VOICE.boss_cacklejaw);
  assert.equal(enemyVoiceFor('wobble_knight').material, 'armour');
  assert.equal(enemyVoiceFor('dummy').material, 'straw');
  assert.equal(enemyVoiceFor('unknown_thing'), null);
  assert.equal(enemyVoiceFor(null), null);
  assert.equal(ENEMY_VOICE.hyena.alert, 'laugh');
  assert.equal(ENEMY_VOICE.boss_cacklejaw.laughRate, 0.85);
  assert.equal(ENEMY_VOICE.stealer.laughRate, 1.4);
  assert.equal(actorTypeId({ def: { id: 'crow' } }), 'crow');
  assert.equal(actorTypeId({ kind: 'sack', tags: new Set(['prop']) }), 'sack');
  assert.equal(actorTypeId({ tags: new Set(['dummy']) }), 'dummy');
  for (const v of Object.values(ENEMY_VOICE)) {
    assert.ok(MATERIAL_HIT[v.material], `material ${v.material}`);
    for (const k of ['alert', 'telegraph', 'pain', 'death', 'phase']) if (v[k] && v[k] !== 'laugh') assert.ok(SFX[v[k]], `${k} ${v[k]}`);
  }
});

// ================================================================================================ music
test('§16.1: all 14 tracks are used, files exist, kinds and the rules match the table', () => {
  assert.equal(Object.keys(TRACKS).length, 14);
  for (const t of Object.values(TRACKS)) assert.ok(fs.existsSync(path.join(PUBLIC, t.file)), t.file);
  assert.equal(TRACKS.dark_forest_creepy.vol, 0.6);
  assert.equal(TRACKS.victory_fanfare.kind, 'sting');
  assert.equal(TRACKS.victory_fanfare.loop, false);
  assert.ok(TRACKS.battle_fast_fight_loop.buffer, 'the 24 s seamless loop is a decoded buffer');
  assert.equal(MUSIC_RULES.crossfade, 1.5);
  assert.equal(MUSIC_RULES.combatRadius, 20);
  assert.equal(MUSIC_RULES.calmDelay, 4);
  assert.ok(MUSIC_RULES.bossSnap <= 0.3);
  assert.equal(CONTEXT_MUSIC.title, 'village_bards_tale');
  assert.equal(LEVEL_MUSIC.meadow.explore, 'field_of_dreams');
  assert.equal(DUCK.dialog, 0.5, '−6 dB under dialogue');
  assert.equal(DUCK.meme, 0);
  assert.equal(DUCK.memeFade, 1);
  assert.equal(DUCK.hitstopDur, 0.03);
  assert.equal(MEME.windMul, 1.6);
  // loudness: every track lands on the target mean level (× its design volume); measured means span 17 dB
  for (const [id, t] of Object.entries(TRACKS)) {
    assert.ok(Number.isFinite(t.meanDb), `${id}: meanDb`);
    const out = t.meanDb + 20 * Math.log10(trackGain(t) / (t.vol ?? 1));
    assert.ok(Math.abs(out - MUSIC_TARGET_DB) < 0.05 || trackGain(t) / (t.vol ?? 1) >= 3.15, `${id}: normalised to ${out.toFixed(1)} dB`);
  }
  assert.ok(trackGain(TRACKS.field_of_dreams) > 2 && trackGain(TRACKS.battle_fast_fight_loop) < 0.4);
  assert.ok(close(trackGain(TRACKS.dark_forest_creepy) / trackGain({ meanDb: TRACKS.dark_forest_creepy.meanDb }), 0.6));
  // every track the director can pick for a level exists
  for (const id of Object.keys(LEVEL_MUSIC)) {
    const m = levelMusic(id, null);
    for (const k of ['explore', 'combat', 'boss']) assert.ok(TRACKS[m[k]], `${id}.${k}`);
  }
});

test('trackId normalises ids, file paths, context names and silence', () => {
  assert.equal(trackId('field_of_dreams'), 'field_of_dreams');
  assert.equal(trackId('music/field_of_dreams.mp3'), 'field_of_dreams');
  assert.equal(trackId('audio/music/cave_theme.ogg'), 'cave_theme');
  assert.equal(trackId('title'), 'village_bards_tale');
  assert.equal(trackId({ track: 'boss_epic_battle_loop' }), 'boss_epic_battle_loop');
  assert.equal(trackId(null), null);
  assert.equal(trackId(''), null);
  assert.equal(trackId('not_a_track'), null);
});

test('MusicDirector: explore → combat on threat / arena lock → explore 4 s after the last threat; stings; boss snap', () => {
  const d = new MusicDirector();
  d.setLevel('meadow', { explore: 'field_of_dreams', combat: 'battle_fast_fight_loop' });
  d.request('field_of_dreams', 1.5);
  assert.deepEqual(d.take(), { track: 'field_of_dreams', fade: 1.5, sting: null });
  assert.equal(d.take(), null, 'nothing pending');
  d.tick(1 / 60, { threat: true });
  assert.equal(d.target, 'battle_fast_fight_loop');
  assert.ok(d.combat);
  for (let t = 0; t < 3.9; t += 0.1) d.tick(0.1, { threat: false });
  assert.equal(d.target, 'battle_fast_fight_loop', 'still fighting before 4 s');
  for (let t = 0; t < 0.3; t += 0.1) d.tick(0.1, { threat: false });
  assert.equal(d.target, 'field_of_dreams', 'explore resumes 4 s after the last threat');
  // arena lock holds combat even without a threat; the clear plays the victory sting
  d.arenaLock('glade');
  d.tick(0.1, {});
  assert.ok(d.combat);
  for (let i = 0; i < 100; i++) d.tick(0.1, {});
  assert.ok(d.combat, 'a locked arena keeps the fight music');
  d.take();
  d.arenaClear('glade');
  assert.equal(d.take().sting, 'victory_fanfare');
  for (let i = 0; i < 45; i++) d.tick(0.1, {});
  assert.equal(d.target, 'field_of_dreams');
  // explicit explore during a live fight only moves the base
  d.tick(0.1, { threat: true });
  d.request('village_town_theme', 1.5, { mode: 'play' });
  assert.equal(d.target, 'battle_fast_fight_loop');
  assert.equal(d.base, 'village_town_theme');
  // boss: snaps within 0.3 s, ignores threat changes, defeat → silence + sting, the base returns after the cutscene
  d.bossStart();
  assert.equal(d.target, 'boss_epic_battle_loop');
  assert.ok(d.fade <= 0.3);
  d.tick(5, { threat: false });
  assert.equal(d.target, 'boss_epic_battle_loop');
  d.bossDefeated();
  assert.equal(d.target, null);
  assert.equal(d.take().sting, 'victory_fanfare');
  d.tick(0.1, { mode: 'cutscene' });
  assert.equal(d.target, null, 'cutscenes keep their music');
  d.tick(0.1, { mode: 'play' });
  assert.equal(d.target, 'village_town_theme');
});

test('MusicDirector: cutscene silence restores on play; stings never replace the target; the level explore track is explore', () => {
  const d = new MusicDirector();
  d.setLevel('meadow', LEVEL_MUSIC.meadow);
  d.request('field_of_dreams');
  d.request(null, 0.8, { mode: 'cutscene' });                       // CS-03 step 2
  assert.equal(d.target, null);
  d.tick(0.1, { mode: 'cutscene' });
  assert.equal(d.target, null);
  d.tick(0.1, { mode: 'play' });
  assert.equal(d.target, 'field_of_dreams');
  assert.equal(d.request('victory_fanfare'), 'victory_fanfare');
  assert.equal(d.target, 'field_of_dreams');
  assert.equal(d.take().sting, 'victory_fanfare');
  // CS-03 end: the combat loop forced, then explore after the glade
  d.request('battle_fast_fight_loop', 0.5, { mode: 'cutscene' });
  assert.ok(d.combat && d.target === 'battle_fast_fight_loop');
  // a level whose explore track is a battle theme (gate) explores to it without entering combat
  const g = new MusicDirector();
  g.setLevel('gate', { explore: 'battle_theme_a', combat: 'battle_fast_fight_loop' });
  g.request('battle_theme_a');
  assert.ok(!g.combat);
  assert.equal(g.base, 'battle_theme_a');
  g.tick(0.1, { threat: true });
  assert.equal(g.target, 'battle_fast_fight_loop');
  // zones (the Bakery radius) win over the base while exploring
  const z = new MusicDirector();
  z.setLevel('town', { explore: 'village_town_theme', zones: [{ at: [0, 0], r: 8, track: 'tavern_old_tower_inn' }] });
  z.request('village_town_theme');
  z.tick(0.1, { zone: 'tavern_old_tower_inn' });
  assert.equal(z.target, 'tavern_old_tower_inn');
  z.tick(0.1, { zone: null });
  assert.equal(z.target, 'village_town_theme');
});

// ================================================================================================ procedural
test('§16.3 wind: band-pass 400 + 300 × wind Hz, gain 0.08 + 0.12 × wind, clamped 0–3, Meme Cam ×1.6', () => {
  assert.deepEqual(windParams(0), { freq: 400, gain: 0.08, wind: 0 });
  const w1 = windParams(1);
  assert.ok(close(w1.freq, 700) && close(w1.gain, 0.2));
  const w3 = windParams(9);
  assert.ok(close(w3.freq, 1300) && close(w3.gain, 0.44) && w3.wind === 3);
  assert.ok(close(windParams(1, MEME.windMul).wind, 1.6));
  assert.equal(windParams(NaN).wind, 0);
  assert.equal(WIND.q, 0.8);
  assert.equal(WIND.lfoHz, 0.13);
  assert.equal(WIND.lfoDepth, 0.2);
  assert.equal(WIND.bufferSec, 2);
  const r = createRng(1), n = 48000;
  const noise = pinkNoise(n + 2400, r, 0.5, 2400);
  assert.equal(noise.length, n);
  let mean = 0, sq = 0;
  for (const v of noise) { mean += v; sq += v * v; }
  mean /= n;
  assert.ok(Math.abs(mean) < 0.05, 'no DC');
  assert.ok(Math.abs(Math.sqrt(sq / n) - 0.5) < 0.08, 'normalised RMS');
  assert.ok(noise.every(Number.isFinite));
});

test('§16.3 Sunbell: partial ratios / amplitudes, τ = 6 s / √ratio, damped clunk τ 0.4 s', () => {
  const p = bellPartials();
  assert.deepEqual(p.map((x) => +(x.freq / 196).toFixed(2)), [0.5, 1, 1.19, 1.56, 2, 2.66, 3.01]);
  assert.deepEqual(p.map((x) => x.amp), [0.6, 1, 0.5, 0.35, 0.3, 0.2, 0.15]);
  for (const x of p) assert.ok(close(x.tau, 6 / Math.sqrt(x.freq / 196)));
  for (const x of bellPartials({ damped: true })) assert.ok(close(x.tau, 0.4 / Math.sqrt(x.freq / 196)));
  assert.equal(BELL.base, 196);
  assert.ok(bellDuration() <= BELL.maxDur && bellDuration() > 20);
  assert.ok(bellDuration({ damped: true }) < 5);
});

test('§16.3 laugh build: 4–7 syllables, 0.08–0.14 s slices, rate 1.25–1.45, 90 ms apart, rising then falling', () => {
  const r = createRng(7);
  const counts = new Set();
  for (let k = 0; k < 200; k++) {
    const plan = laughPlan(r);
    counts.add(plan.length);
    assert.ok(plan.length >= 4 && plan.length <= 7);
    const peak = plan.reduce((b, s, i) => (s.rate > plan[b].rate ? i : b), 0);
    for (let i = 0; i < plan.length; i++) {
      const s = plan[i];
      assert.ok(s.slice >= 0.08 && s.slice <= 0.14 + 1e-9);
      assert.ok(s.rate >= 1.25 * 0.86 - 1e-9 && s.rate <= 1.45 * 1.12 + 1e-9);
      assert.ok(s.offsetFrac >= 0 && s.offsetFrac < 1);
      assert.ok(s.src >= 0 && s.src < LAUGH.sources.length);
      if (i > 0) assert.ok(close(s.t - (plan[i - 1].t + plan[i - 1].slice / plan[i - 1].rate), LAUGH.gap), 'syllables 90 ms apart');
      if (i > 0 && i <= peak) assert.ok(s.rate >= plan[i - 1].rate - 1e-9, 'rising to the peak');
      if (i > peak) assert.ok(s.rate <= plan[i - 1].rate + 1e-9, 'falling after it');
    }
    assert.ok(peak > 0 && peak < plan.length - 1, 'the contour peaks inside the laugh');
  }
  assert.deepEqual([...counts].sort(), [4, 5, 6, 7]);
  assert.equal(laughPlan(r, { syllables: 5 }).length, 5);
  const slow = laughPlan(createRng(2), { rate: 0.85 }), fast = laughPlan(createRng(2), { rate: 1.4 });
  assert.ok(close(slow[0].rate / fast[0].rate, 0.85 / 1.4), 'Cacklejaw 0.85 / Post Stealer 1.4 rate scale');
  const plan = laughPlan(createRng(4));
  assert.ok(close(laughLength(plan), plan.at(-1).t + plan.at(-1).slice / plan.at(-1).rate));
  assert.equal(laughLength([]), 0);
  assert.equal(LAUGH.refDistance, 3);
  assert.equal(LAUGH.rolloff, 1.4);
  assert.equal(LAUGH.gap, 0.09);
});

test('§16.3 heartbeat, shimmer, march data', () => {
  assert.deepEqual(heartbeatPlan(2, 60, 1).map((b) => [b.t, b.gain]), [[0, 1], [HEART.pair, HEART.dubGain], [1, 1], [1 + HEART.pair, HEART.dubGain]]);
  assert.equal(heartbeatPlan(0).length, 0);
  assert.equal(HEART.lowHp, 2, '§8.2 low HP ≤ 2');
  assert.deepEqual(SHIMMER.freqs, [880, 1320, 1760]);
  assert.equal(SHIMMER.gain, 0.03);
  for (const id of [...MARCH.stepIds, ...MARCH.chainIds]) assert.ok(expandId(id, INDEX).length, id);
});

test('zzfx defs: 21 parameters max, deterministic (randomness 0), positive length', () => {
  for (const [name, p] of Object.entries(ZZFX_DEFS)) {
    assert.ok(p.length <= 21, name);
    assert.equal(p[1], 0, `${name}: randomness 0 (variation comes from the seeded playback rate)`);
    assert.ok(zzfxDuration(p) > 0.01 && zzfxDuration(p) < 2, name);
  }
  for (const k of ['heartThump', 'crowCaw', 'hyenaLaugh', 'blip']) assert.ok(ZZFX_DEFS[k], k);
});

// ================================================================================================ babble
test('§16.4 babble: one blip per 3 typed characters at 30 chars/s; dialog speed scales; once / silent voices', () => {
  const plan = babblePlan('Day one!');                 // letters: D a y o n e → blips at chars 0 and 3 (non-space, non-punct)
  assert.deepEqual(plan.map((t) => +t.toFixed(4)), [0, +(4 / 30).toFixed(4)]);
  const long = babblePlan('a'.repeat(30));
  assert.equal(long.length, 10);
  assert.ok(close(long[1], 3 / 30));
  const fast = babblePlan('a'.repeat(30), { speed: 2 });
  assert.ok(close(fast[1], 3 / 60));
  assert.deepEqual(babblePlan('ROOOAAR. (Is that... milk?)', { mode: 'once' }), [0]);
  assert.deepEqual(babblePlan('   '), []);
  assert.deepEqual(babblePlan(null), []);
  assert.equal(babblePlan('a'.repeat(1000)).length, BABBLE.maxBlips);
  assert.equal(BABBLE.cps, 30);
  assert.equal(BABBLE.every, 3);
  assert.equal(BABBLE.pitchVar, 0.05);
});

test('§16.4 speakers: ids, display names and aliases map to the table rows (pools + rates)', () => {
  const row = (s) => voiceFor(s);
  assert.equal(speakerKey('swordcat'), 'swordcat');
  assert.equal(speakerKey('Clem'), 'swordcat');
  assert.equal(speakerKey({ actorId: 'pudding' }), 'pudding');
  assert.equal(speakerKey('Sergeant Whiskerbottom'), 'whiskerbottom');
  assert.equal(speakerKey('Warchief Cacklejaw'), 'cacklejaw');
  assert.equal(speakerKey('hyena_3'), 'hyena');
  assert.equal(speakerKey('Villager'), 'default');
  assert.equal(speakerKey(''), 'none');
  assert.equal(speakerKey(null), 'none');
  assert.deepEqual([row('swordcat').rate, row('pearl').rate, row('mochi').rate, row('sage').rate, row('clover').rate], [1.25, 1.45, 0.95, 1.1, 1.0]);
  assert.deepEqual([row('earlgrey').rate, row('pip').rate, row('tofu').rate], [0.85, 1.4, 1.2]);
  assert.deepEqual([row('marmalade').rate, row('snowpaw').rate, row('whiskerbottom').rate], [0.75, 1.2, 0.9]);
  assert.deepEqual([row('pudding').rate, row('hyena').rate, row('pilfer').rate, row('cacklejaw').rate], [0.8, 1.3, 1.4, 1.0]);
  assert.deepEqual([row('barkus').rate, row('brutus').rate, row('grizzlechop').rate, row('coo').rate], [0.7, 1.0, 0.9, 0.7]);
  assert.deepEqual(row('mochi').pool, ['cat/cute_creature_01', 'cat/cute_creature_02', 'cat/cute_creature_03']);
  assert.deepEqual(row('sage').pool, ['cat/cute_creature_04', 'cat/cute_creature_05']);
  assert.equal(row('pudding').mode, 'once');
  assert.equal(row('cacklejaw').mode, 'laugh');
  assert.equal(row('Narrator').pool.length, 0);
  for (const v of Object.values(VOICES)) for (const f of v.pool) assert.ok(expandId(f, INDEX).length, f);
});

// ================================================================================================ AudioManager (no WebAudio)
test('AudioManager in node (no WebAudio): contract, requests are logged, unlock resolves false, dispose unsubscribes', async () => {
  const ctx = fakeCtx();
  const am = ctx.audio;
  assert.ok(am instanceof AudioManager);
  for (const m of ['play2D', 'play3D', 'music', 'laugh', 'bell', 'unlock', 'load', 'init', 'update', 'render', 'dispose']) assert.equal(typeof am[m], 'function', m);
  await am.init();
  assert.equal(await am.unlock(), false);
  assert.equal(am.play2D('meow'), null);
  assert.equal(am.play3D('crowCaw', new THREE.Vector3()), null);
  assert.equal(am.laugh(null), null);
  assert.equal(am.bell(), null);
  assert.equal(am.heartbeat(), 0);
  assert.equal(am.music('field_of_dreams'), 'field_of_dreams');
  assert.equal(am.currentTrack, 'field_of_dreams');
  am.update(1 / 60); am.render(0, 1 / 60);
  const before = ctx.bus.listenerCount ? ctx.bus.listenerCount() : null;
  am.dispose();
  ctx.bus.emit(E.PLAYER_SWING, { attackId: 'slash1', combo: 0 });
  assert.equal(am.counts.swishLight, undefined, 'no listeners after dispose');
  void before;
});

test('AudioManager bus bindings (§16.2): the right sound for each event, logged before the unlock', async () => {
  const ctx = fakeCtx();
  const am = ctx.audio;
  await am.init();
  const emit = (ev, p) => ctx.bus.emit(ev, p);
  const c = () => ({ ...am.counts });
  const rat = { id: 7, def: { id: 'rat_pike' }, pos: new THREE.Vector3(1, 0, 1), alive: true, faction: 'enemy', tags: new Set(['enemy']) };
  emit(E.PLAYER_SWING, { attackId: 'slash1', combo: 1 });
  emit(E.PLAYER_SWING, { attackId: Object.keys(ATTACKS).find((k) => ATTACKS[k].heavy && k !== 'holy' && k !== 'sunburst'), combo: 0 });
  emit(E.PLAYER_SWING, { attackId: 'sunburst' });
  emit(E.PLAYER_HOLY, { position: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1) });
  emit(E.HIT, { attacker: ctx.player, target: rat, attackId: 'slash1', damage: 10, position: rat.pos.clone(), killed: false });
  emit(E.HIT, { attacker: rat, target: rat, attackId: 'slash1', damage: 0, position: rat.pos.clone(), blocked: true });
  emit(E.ENEMY_DIED, { enemy: rat, type: 'rat_pike', position: rat.pos.clone() });
  emit(E.PLAYER_PARRY, { attacker: rat, gold: false, position: new THREE.Vector3() });
  emit(E.PLAYER_GRIT, { value: 0, max: 3, broken: true });
  emit(E.PLAYER_DODGE, {}); emit(E.PLAYER_JUMP, {}); emit(E.PLAYER_LAND, { impact: 6 });
  emit(E.PLAYER_DAMAGED, { amount: 1, hp: 7, maxHp: 8 });
  emit(E.PLAYER_DIED, {}); emit(E.PLAYER_LIFE_LOST, { lives: 8 });
  emit(E.PLAYER_MEOW, { position: new THREE.Vector3() });
  emit(E.PLAYER_MILK, { phase: 'start', left: 1, max: 2 });
  emit(E.PLAYER_STILL_STANDING, {});
  emit(E.CHECKPOINT, { levelId: 'meadow', spawnId: 'vigil_1' });
  emit(E.ITEM_PICKUP, { item: 'fish', amount: 1 });
  emit(E.ITEM_PICKUP, { item: 'fish', amount: 10, gold: true });
  emit(E.ITEM_PICKUP, { item: 'letter', id: 'l1', amount: 1 });
  emit(E.ITEM_PICKUP, { item: 'heartBell', id: 'h1', amount: 1 });
  emit(E.KITTEN_REVEAL, { kittenId: 'k1', position: new THREE.Vector3() });
  emit(E.KITTEN_RESCUED, { kittenId: 'k1' });
  emit(E.FOOTSTEP, { actor: ctx.player, position: new THREE.Vector3(), surface: 'grass' });
  emit(E.FOOTSTEP, { actor: ctx.player, position: new THREE.Vector3(), surface: 'water' });
  emit(E.ENEMY_ALERTED, { enemy: { id: 9, def: { id: 'crow' }, pos: new THREE.Vector3() } });
  emit(E.BOSS_DIZZY, { dizzy: true });
  emit(E.DIALOG_START, { id: 'd01' });
  emit(E.BURST, { kind: 'crate', position: new THREE.Vector3() });
  const n = c();
  for (const k of ['swishLight', 'swishHeavy', 'sunburst', 'holySlash', 'hitFur', 'ratPain', 'block', 'killPoof', 'ratDeath', 'parry', 'guardBreak',
    'dodge', 'jump', 'land', 'hurt', 'faint', 'ghostLife', 'meow', 'milkSip', 'stillStanding', 'vigil', 'fish', 'goldFish', 'letter', 'heartBell',
    'kittenMew', 'kittenFound', 'footGrass', 'footWater', 'crowCaw', 'bossDizzy', 'ui.dialogOpen', 'crateBreak']) assert.ok(n[k] >= 1, `${k} requested`);
  assert.equal(n.heartbeat, 1, 'Still Standing heartbeat (one lub-dub pair ×2)');
  // HIT with heavy flag on a bonehead → bone heavy layers
  emit(E.HIT, { attacker: ctx.player, target: { id: 3, def: { id: 'bonehead:warrior' }, pos: new THREE.Vector3() }, attackId: 'slash1', crit: 2, position: new THREE.Vector3() });
  assert.ok(am.counts.hitBoneHeavy >= 1 && am.counts.hitHeavyPunch >= 1);
  // HIT on a straw dummy (world PropActor kind)
  emit(E.HIT, { attacker: ctx.player, target: { id: 4, kind: 'dummy', tags: new Set(['prop', 'dummy']), pos: new THREE.Vector3() }, attackId: 'slash1', position: new THREE.Vector3() });
  assert.ok(am.counts.hitStraw >= 1);
  // HIT on the player herself: no hit layer (PLAYER_DAMAGED plays hers)
  const furBefore = am.counts.hitFur;
  emit(E.HIT, { attacker: rat, target: ctx.player, attackId: 'rat_poke', position: new THREE.Vector3() });
  assert.equal(am.counts.hitFur, furBefore);
  // charge: tier 1, tier 2, fizzle (§16.2)
  emit(E.PLAYER_CHARGE, { level: 0 });
  emit(E.PLAYER_CHARGE, { level: 0.5 });
  emit(E.PLAYER_CHARGE, { level: 1, holy: true });
  emit(E.PLAYER_CHARGE, { level: 0.5, fizzle: true });
  assert.ok(am.counts.chargeT1 === 1 && am.counts.chargeT2 === 1 && am.counts.chargeFizzle === 1);
  // golden hour → shimmer on/off
  emit(E.PLAYER_GOLDEN, { on: true });
  assert.ok(am._shimmerWant && am.counts.goldenOn === 1);
  emit(E.PLAYER_GOLDEN, { on: false });
  assert.ok(!am._shimmerWant);
  // music events
  emit(E.MUSIC, { track: 'field_of_dreams', fade: 1.5 });
  assert.equal(am.currentTrack, 'field_of_dreams');
  emit(E.LEVEL_RESULTS, { levelId: 'meadow' });
  assert.equal(am.currentTrack, 'victory_8bit_loop');
  // meme cam: duck to 0, wind ×1.6
  emit(E.MEME_CAM, { on: true });
  assert.ok(am.memeOn && am.duck === 0);
  emit(E.MEME_CAM, { on: false });
  assert.equal(am.duck, 1);
  // dialogue mode ducks −6 dB; menu ducks and quietens the world
  emit(E.GAME_MODE, { mode: 'dialog' });
  assert.equal(am.duck, DUCK.dialog);
  emit(E.GAME_MODE, { mode: 'menu' });
  assert.ok(am.pausedWorld && am.duck === DUCK.menu);
  emit(E.GAME_MODE, { mode: 'play' });
  assert.equal(am.duck, 1);
  // settings sliders
  emit(E.SETTINGS_CHANGED, { key: 'music', value: 0.3 });
  assert.equal(am.vol.music, 0.3);
  // procedural ids through play2D / play3D (cutscene `sfx` steps)
  am.play2D('bellClunk'); am.play3D('laugh', new THREE.Vector3(3, 0, 3)); am.play2D('heartbeat', { beats: 1 });
  assert.ok(am.counts.clunk >= 1 && am.counts.hyena >= 1);
  am.play2D('march', { on: true });
  assert.ok(am.marching);
  am.play2D('march', { on: false });
  assert.equal(am.marching, null);
  am.dispose();
});

test('AudioManager: combat music on alerted enemies within 20 m; explore 4 s after; arena reset releases the fight', async () => {
  const ctx = fakeCtx();
  const am = ctx.audio;
  await am.init();
  ctx.player = { pos: new THREE.Vector3(), alive: true, hp: 8, tags: new Set(['player']) };
  const near = { id: 1, alive: true, alerted: true, stateName: 'chase', pos: new THREE.Vector3(10, 0, 0) };
  ctx.enemies = { list: [near] };
  ctx.bus.emit(E.LEVEL_LOADED, { id: 'meadow', level: { music: { explore: 'field_of_dreams', combat: 'battle_fast_fight_loop' } } });
  ctx.bus.emit(E.MUSIC, { track: 'field_of_dreams' });
  const step = (sec) => { for (let t = 0; t < sec; t += 1 / 60) am.update(1 / 60); };
  step(0.5);
  assert.equal(am.currentTrack, 'battle_fast_fight_loop');
  near.pos.set(25, 0, 0);                         // out of the 20 m radius
  step(3.5);
  assert.equal(am.currentTrack, 'battle_fast_fight_loop');
  step(1);
  assert.equal(am.currentTrack, 'field_of_dreams');
  near.pos.set(5, 0, 0); near.stateName = 'patrol';  // idle states don't count
  step(1);
  assert.equal(am.currentTrack, 'field_of_dreams');
  // arena lock without enemies; then the arena resets (death inside: unlocked, not cleared)
  const arena = { id: 'glade', locked: true, cleared: false };
  ctx.levels = { current: { arenas: [arena] } };
  ctx.bus.emit(E.ARENA_LOCK, { id: 'glade' });
  step(0.5);
  assert.equal(am.currentTrack, 'battle_fast_fight_loop');
  arena.locked = false;
  step(4.6);
  assert.equal(am.currentTrack, 'field_of_dreams');
  am.dispose();
});

// ================================================================================================ fake WebAudio
class FakeParam {
  constructor(v = 0) { this.value = v; this.events = []; }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this.events.push(['ramp', v, t]); this.value = v; return this; }
  exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); this.value = v; return this; }
  setTargetAtTime(v, t, tau) { this.events.push(['target', v, t, tau]); this.target = v; return this; }
  cancelScheduledValues(t) { this.events.push(['cancel', t]); return this; }
  /** the value the param heads to (last target / ramp / set) */
  get goal() { for (let i = this.events.length - 1; i >= 0; i--) if (this.events[i][0] !== 'cancel') return this.events[i][1]; return this.value; }
}
class FakeNode {
  constructor(ac, kind) { this.ac = ac; this.kind = kind; this.outs = new Set(); ac.nodes.push(this); }
  connect(d) { this.outs.add(d); return d; }
  disconnect(d) { if (d) this.outs.delete(d); else this.outs.clear(); }
}
class FakeBuffer {
  constructor(ch, length, sampleRate) {
    this.numberOfChannels = ch; this.length = length; this.sampleRate = sampleRate; this.duration = length / sampleRate;
    this._d = Array.from({ length: ch }, () => { const a = new Float32Array(length); for (let i = 0; i < length; i++) a[i] = Math.sin(i * 0.05) * 0.5; return a; });
  }
  getChannelData(i) { return this._d[i]; }
}
class FakeAudioContext {
  constructor() {
    this.nodes = []; this.currentTime = 0; this.sampleRate = 48000; this.state = 'suspended'; this.onstatechange = null;
    this.destination = new FakeNode(this, 'destination');
    const p = () => new FakeParam(0);
    this.listener = { positionX: p(), positionY: p(), positionZ: p(), forwardX: p(), forwardY: p(), forwardZ: p(), upX: p(), upY: p(), upZ: p() };
    this.decoded = 0;
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createGain() { const n = new FakeNode(this, 'gain'); n.gain = new FakeParam(1); return n; }
  createBufferSource() {
    const n = new FakeNode(this, 'source');
    Object.assign(n, { buffer: null, loop: false, playbackRate: new FakeParam(1), onended: null, started: null, stopped: null });
    n.start = (t = 0, off = 0, dur) => { n.started = { t, off, dur }; };
    n.stop = (t = 0) => { n.stopped = t; };
    return n;
  }
  createPanner() {
    const n = new FakeNode(this, 'panner');
    Object.assign(n, { positionX: new FakeParam(), positionY: new FakeParam(), positionZ: new FakeParam(), panningModel: 'equalpower',
      distanceModel: 'inverse', refDistance: 1, rolloffFactor: 1, maxDistance: 10000 });
    return n;
  }
  createBiquadFilter() { const n = new FakeNode(this, 'biquad'); n.frequency = new FakeParam(350); n.Q = new FakeParam(1); n.type = 'lowpass'; return n; }
  createOscillator() {
    const n = new FakeNode(this, 'osc');
    Object.assign(n, { type: 'sine', frequency: new FakeParam(440), detune: new FakeParam(0), onended: null });
    n.start = (t = 0) => { n.started = t; }; n.stop = (t = 0) => { n.stopped = t; };
    return n;
  }
  createDynamicsCompressor() {
    const n = new FakeNode(this, 'compressor');
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new FakeParam(0);
    return n;
  }
  createAnalyser() { const n = new FakeNode(this, 'analyser'); n.fftSize = 2048; n.getFloatTimeDomainData = (a) => a.fill(0.1); return n; }
  createBuffer(ch, len, sr) { return new FakeBuffer(ch, len, sr); }
  createMediaElementSource(el) { const n = new FakeNode(this, 'media'); n.el = el; return n; }
  decodeAudioData() { this.decoded++; return Promise.resolve(new FakeBuffer(1, 24000, this.sampleRate)); }
  count(kind) { return this.nodes.filter((n) => n.kind === kind).length; }
}
class FakeAudioEl {
  constructor() { this.paused = true; this.loop = false; this.src = ''; this.currentTime = 0; this.readyState = 0; this.preload = ''; this.crossOrigin = null; }
  canPlayType() { return 'probably'; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener() {}
  removeAttribute() { this.src = ''; }
  load() {}
}

/** fakeCtx + a fake WebAudio world; returns { ctx, am, ac, restore }. */
async function withFakeAudio() {
  const g = globalThis, saved = { window: g.window, Audio: g.Audio, AudioContext: g.AudioContext };
  const ac = new FakeAudioContext();
  const listeners = [];
  g.window = { AudioContext: FakeAudioContext, addEventListener: (ev, fn) => listeners.push([ev, fn]), removeEventListener: () => {} };
  g.Audio = FakeAudioEl;
  g.AudioContext = FakeAudioContext;               // zzfx creates one at import (closed straight away by bakeZzfx)
  THREE.AudioContext.setContext(ac);
  const ctx = fakeCtx();
  ctx.assets.arrayBuffer = async () => new ArrayBuffer(16);
  ctx.assets.url = (p) => 'assets/' + p;
  ctx.env = { wind: 1 };
  const am = ctx.audio;
  await am.init();
  const restore = () => { am.dispose(); Object.assign(g, saved); for (const k of Object.keys(saved)) if (saved[k] === undefined) delete g[k]; };
  return { ctx, am, ac, listeners, restore };
}
const flush = () => new Promise((r) => setImmediate(r));

test('fake WebAudio: unlock builds master/music/sfx buses on ONE listener under the camera, wind runs, zzfx bakes', async () => {
  const { ctx, am, ac, listeners, restore } = await withFakeAudio();
  try {
    assert.ok(listeners.some(([ev]) => ev === 'keydown') && listeners.some(([ev]) => ev === 'pointerdown'), 'gesture listeners');
    am.music('village_bards_tale');                     // CS-00 asks before the unlock
    assert.equal(await am.unlock(), true);
    assert.ok(am.ready && am.unlocked && ac.state === 'running');
    assert.equal(ctx.camera.children.filter((c) => c.type === 'AudioListener').length, 1);
    for (const k of ['master', 'music', 'sfx', 'world', 'player', 'ui', 'musicDuck', 'hitDuck']) assert.ok(am.bus[k], k);
    assert.ok(am.bus.music.outs.has(am.bus.master) && am.bus.sfx.outs.has(am.bus.master));
    assert.equal(am.voices2D.length, MIX.voices2D);
    assert.equal(am.voices3D.length, MIX.voices3D);
    for (const v of am.voices3D) assert.ok(v.panner.refDistance === 3 && v.panner.rolloffFactor === 1.4 && v.panner.maxDistance === 45);
    assert.ok(am.wind.started);
    assert.ok(close(am.wind.filter.frequency.value, 700), 'wind 1 → 700 Hz');
    for (const k of ['heartThump', 'crowCaw', 'hyenaLaugh', 'blip']) assert.ok(am.zz.get(k)?.length > 100, `zzfx ${k}`);
    // the title track fades in over 2 s once unlocked
    const deck = am.musicPlayer.decks[am.musicPlayer.active];
    assert.equal(deck.track, 'village_bards_tale');
    assert.ok(deck.el && !deck.el.paused);
    assert.ok(deck.gain.gain.events.some((e) => e[0] === 'ramp' && close(e[2], MUSIC_RULES.titleFade)));
    // volume sliders: gain = v² (settings master 0.8 → 0.64)
    assert.ok(close(am.bus.master.gain.goal, 0.64));
    am.setVolumes({ music: 0.5 });
    assert.ok(close(am.bus.music.gain.goal, 0.25));
    // a second unlock is a no-op
    assert.equal(await am.unlock(), true);
    assert.equal(ac.count('compressor'), 1);
  } finally { restore(); }
});

test('fake WebAudio: 2D/3D voices, at most 8 + 12, oldest stolen; 3D follows positions; far sounds are skipped', async () => {
  const { ctx, am, ac, restore } = await withFakeAudio();
  try {
    await am.unlock();
    await am.decode('audio/sfx/cat/kitten_mew_01.ogg');
    am.play2D('cat/kitten_mew_01');
    await flush();
    assert.ok(am.buffers.size >= 1);
    for (let i = 0; i < 20; i++) { ac.currentTime += 0.001; am.play2D('cat/kitten_mew_01', { rate: 1 }); }
    const now = ac.currentTime;
    assert.equal(am.voices2D.filter((v) => v.endAt > now).length, MIX.voices2D);
    for (let i = 0; i < 30; i++) { ac.currentTime += 0.001; am.play3D('cat/kitten_mew_01', new THREE.Vector3(i % 5, 0, 2)); }
    assert.equal(am.voices3D.filter((v) => v.endAt > ac.currentTime).length, MIX.voices3D);
    const newest = am.voices3D.reduce((a, b) => (b.startAt > a.startAt ? b : a));
    assert.ok(newest.panner.positionZ.goal === 2);
    // an actor emitter is followed
    const actor = { pos: new THREE.Vector3(4, 0, 0), height: 1 };
    ac.currentTime += 0.001;
    const h = am.play3D('cat/kitten_mew_01', actor);
    actor.pos.set(8, 0, 0);
    am.render(0, 1 / 60);
    assert.equal(h.voice.panner.positionX.goal, 8);
    // 2D voices ride the player bus, ui sounds the ui bus
    const before = am.started['cat/kitten_mew_01'];
    ctx.camera.position.set(0, 0, 0); ctx.camera.updateMatrixWorld();
    assert.equal(am.play3D('cat/kitten_mew_01', new THREE.Vector3(500, 0, 0)), null, 'inaudible: no voice used');
    assert.equal(am.started['cat/kitten_mew_01'], before);
  } finally { restore(); }
});

test('fake WebAudio: laugh build on one 3D voice, Sunbell partials, damped clunk, heartbeat pair, shimmer pad', async () => {
  const { am, ac, restore } = await withFakeAudio();
  try {
    await am.unlock();
    for (const s of LAUGH.sources) await am.decode(s);
    const srcBefore = ac.count('source');
    const l = am.laugh(new THREE.Vector3(3, 1, 0), { rate: 0.85 });
    assert.ok(l && l.syllables >= 4 && l.syllables <= 7);
    assert.equal(ac.count('source') - srcBefore, l.syllables, 'one buffer slice per syllable');
    assert.ok(l.voice.laugh && l.voice.panner);
    // at most LAUGH.maxConcurrent at once
    for (let i = 0; i < 10; i++) am.laugh(new THREE.Vector3(i, 0, 2));
    assert.ok(am.voices3D.filter((v) => v.laugh && v.endAt > ac.currentTime).length <= LAUGH.maxConcurrent);
    am.stopLaughs();
    assert.equal(am.voices3D.filter((v) => v.laugh).length, 0);
    // chorus: 6 emitters at r 18 (CS-02 shot 3)
    assert.equal(am.laughChorus(new THREE.Vector3(), { count: 6, r: 18, dur: 2 }), 6);
    for (const e of am.chorus.emitters) assert.ok(close(Math.hypot(e.pos.x, e.pos.z), 18, 1e-6));
    am.stopLaughs();
    // Sunbell: 7 sine partials + the metal_ringing layer
    const oscBefore = ac.count('osc');
    const b = am.bell();
    assert.equal(ac.count('osc') - oscBefore, BELL.ratios.length);
    assert.ok(b.endAt > ac.currentTime + 20);
    const d = am.bell({ damped: true });
    assert.ok(d.endAt < ac.currentTime + 5, 'damped clunk rings out fast');
    assert.equal(am.bells.size, 2);
    ac.currentTime += 40; am.render(0, 1 / 60);
    assert.equal(am.bells.size, 0, 'rung-out bells are pruned');
    // heartbeat: lub-dub = 2 one-shots per beat
    const s0 = ac.count('source');
    assert.equal(am.heartbeat({ beats: 2 }), 2);
    assert.equal(ac.count('source') - s0, 4);
    // shimmer: 3 sines + a tremolo LFO
    const o0 = ac.count('osc');
    am.shimmer(true);
    assert.equal(ac.count('osc') - o0, 4);
    assert.ok(am.shim.on);
    am.shimmer(false);
    ac.currentTime += 2; am.render(0, 1 / 60);
    assert.equal(am.shim.nodes, null, 'pad torn down after its fade');
  } finally { restore(); }
});

test('fake WebAudio: ducks (dialogue −6 dB, Meme Cam 0 in ~1 s, hitstop 30 ms), crossfades, stings past the duck', async () => {
  const { ctx, am, ac, restore } = await withFakeAudio();
  try {
    await am.unlock();
    const duck = () => am.bus.musicDuck.gain.goal;
    am.music('field_of_dreams');
    am.render(0, 1 / 60);
    const mp = am.musicPlayer;
    const a = mp.decks[mp.active];
    assert.equal(a.track, 'field_of_dreams');
    // crossfade A → B over 1.5 s
    am.music('village_town_theme', 1.5);
    const b = mp.decks[mp.active];
    assert.notEqual(a, b);
    assert.equal(b.track, 'village_town_theme');
    assert.ok(a.gain.gain.events.some((e) => e[0] === 'ramp' && e[1] === 0 && close(e[2], ac.currentTime + 1.5)), 'old deck fades out');
    assert.ok(b.gain.gain.events.some((e) => e[0] === 'ramp' && close(e[1], trackGain(TRACKS.village_town_theme)) && close(e[2], ac.currentTime + 1.5)), 'new deck fades in');
    ac.currentTime += 2; am.render(0, 1 / 60);
    assert.equal(a.track, null, 'faded deck stopped');
    // dialogue
    ctx.bus.emit(E.DIALOG_LINE, { speaker: 'swordcat', text: 'Day one of rescuing everyone. Morale: high.' });
    assert.ok(am.babbleState && am.babbleState.plan.length > 5);
    assert.ok(close(duck(), DUCK.dialog));
    const blipsBefore = ac.count('source');
    for (let i = 0; i < 120; i++) { ac.currentTime += 1 / 60; am.render(0, 1 / 60); }
    assert.ok(ac.count('source') - blipsBefore >= 5, 'babble blips played');
    ctx.bus.emit(E.DIALOG_END, { id: 'x' });
    assert.ok(close(duck(), 1));
    // Pudding: one roar per line
    assert.equal(am.babble('pudding', 'ROOOAAR. (Is that... milk?)'), 1);
    ctx.bus.emit(E.DIALOG_END, { id: 'cs03' });
    // Meme Cam: music to 0 over ~1 s (τ = 1/3 s), wind ×1.6
    ctx.bus.emit(E.MEME_CAM, { on: true });
    const ev = am.bus.musicDuck.gain.events.at(-1);
    assert.ok(ev[0] === 'target' && ev[1] === 0 && close(ev[3], DUCK.memeFade / 3));
    am.render(0, 1 / 60);
    assert.ok(close(am.wind.value.wind, 1.6));
    ctx.bus.emit(E.MEME_CAM, { on: false });
    assert.ok(close(duck(), 1));
    // hitstop: dip then back after 30 ms
    ctx.game.hitstopT = 0.05; am.render(0, 1 / 60);
    const hs = am.bus.hitDuck.gain.events.filter((e) => e[0] === 'target');
    assert.ok(hs.at(-2)[1] === DUCK.hitstop && hs.at(-1)[1] === 1 && close(hs.at(-1)[2] - hs.at(-2)[2], DUCK.hitstopDur));
    ctx.game.hitstopT = 0;
    // victory sting: plays on its own gain, connected past the musicDuck, while the decks duck
    ctx.bus.emit(E.ARENA_LOCK, { id: 'glade' });
    ctx.bus.emit(E.ARENA_CLEAR, { id: 'glade' });
    am.render(0, 1 / 60);
    assert.ok(close(duck(), DUCK.sting));
    await flush(); await flush();
    assert.ok(mp.sting.src, 'sting started');
    assert.ok(mp.sting.gain.outs.has(am.bus.hitDuck) && !mp.sting.gain.outs.has(am.bus.musicDuck));
    // pause menu: music ducks, world sfx quieter
    ctx.bus.emit(E.GAME_MODE, { mode: 'menu' });
    assert.ok(close(am.bus.world.gain.goal, MIX.world * DUCK.pausedSfx));
    ctx.bus.emit(E.GAME_MODE, { mode: 'play' });
  } finally { restore(); }
});

test('fake WebAudio: level change cleans up voices / loops and evicts buffers outside the next level working set', async () => {
  const { ctx, am, ac, restore } = await withFakeAudio();
  try {
    await am.unlock();
    const meadowOnly = manifestLevels.meadow.find((p) => !manifestLevels.bog.includes(p));
    const star = manifestLevels['*'].find((p) => /sfx/.test(p));
    await am.decode(meadowOnly); await am.decode(star);
    assert.ok(am.buffers.has(meadowOnly) && am.buffers.has(star));
    ctx.bus.emit(E.LEVEL_LOADED, { id: 'bog', level: { music: { explore: 'cave_theme' } } });
    assert.equal(am.loops.size, 1, 'bog water ambience loop');
    ctx.bus.emit(E.LEVEL_LOADING, { id: 'meadow', spawnId: 'start' });
    assert.ok(am.buffers.has(meadowOnly) && am.buffers.has(star), 'meadow keeps its set');
    ctx.bus.emit(E.LEVEL_LOADING, { id: 'bog', spawnId: 'start' });
    assert.ok(!am.buffers.has(meadowOnly), 'evicted');
    assert.ok(am.buffers.has(star), "'*' stays decoded");
    assert.equal(am.loops.size, 0);
    // evicted sounds decode again on demand (bytes are cached; no refetch)
    const n = ac.decoded;
    await am.decode(meadowOnly);
    assert.ok(ac.decoded > n, "decoded again");
    assert.ok(am.buffers.has(meadowOnly), 're-decoded buffer is cached again');
    // a play request for an evicted file starts once (late) — never a retry loop
    am.evict('bog');
    const id = meadowOnly.replace(/^audio\/sfx\//, '').replace(/\.ogg$/, '');
    const s0 = am.started[id] ?? 0;
    assert.equal(am.play2D(id), null, 'not decoded yet');
    await flush(); await flush();
    assert.equal((am.started[id] ?? 0) - s0, 1, 'played late exactly once');
    assert.equal(am._decoding.size, 0, 'no decode left in flight');
  } finally { restore(); }
});

// ================================================================================================ M1 additions
test('§16.1 prologue: meadow `music.prologue` is the explore track until prologue.done; day requests read as it', async () => {
  const lm = levelMusic('meadow', { explore: 'field_of_dreams', combat: 'battle_fast_fight_loop', prologue: 'village_bards_tale' }, { prologue: true });
  assert.equal(lm.explore, 'village_bards_tale');
  assert.equal(lm.alias, 'field_of_dreams');
  assert.equal(levelMusic('meadow', { explore: 'field_of_dreams', prologue: 'village_bards_tale' }).explore, 'field_of_dreams', 'after the prologue');
  const d = new MusicDirector();
  d.setLevel('meadow', { explore: 'field_of_dreams', prologue: 'village_bards_tale' }, { prologue: true });
  assert.equal(d.request('field_of_dreams'), 'village_bards_tale', 'LevelManager asks for the day track');
  assert.equal(d.target, 'village_bards_tale');
  assert.equal(d.base, 'village_bards_tale');
  assert.equal(d.request('castle_kings_feast'), 'castle_kings_feast', 'other tracks pass through');
  // through the manager: the flag decides on LEVEL_LOADED
  const ctx = fakeCtx();
  const am = ctx.audio;
  await am.init();
  const level = { music: { explore: 'field_of_dreams', combat: 'battle_fast_fight_loop', prologue: 'village_bards_tale' } };
  ctx.bus.emit(E.LEVEL_LOADED, { id: 'meadow', level });
  ctx.bus.emit(E.MUSIC, { track: 'field_of_dreams', fade: 1.5 });
  assert.equal(am.currentTrack, 'village_bards_tale', 'night tutorial');
  ctx.state.setFlag('prologue.done', true);
  ctx.bus.emit(E.LEVEL_LOADED, { id: 'meadow', level });
  ctx.bus.emit(E.MUSIC, { track: 'field_of_dreams', fade: 1.5 });
  assert.equal(am.currentTrack, 'field_of_dreams', 'day meadow after CS-02');
  am.dispose();
});

test('§16.2 footsteps: dirt paths use the sand set; a surface-less emitter asks level.surfaceAt', async () => {
  assert.equal(FOOTSTEP.dirt, 'footDirt');
  assert.ok(SFX.footDirt.files.every((f) => f.startsWith('footsteps/sand_')));
  const ctx = fakeCtx();
  const am = ctx.audio;
  await am.init();
  ctx.levels = { current: { surfaceAt: (x) => (x > 0 ? 'wood' : 'dirt') } };
  ctx.bus.emit(E.FOOTSTEP, { actor: ctx.player, position: new THREE.Vector3(), surface: 'dirt' });
  assert.equal(am.counts.footDirt, 1);
  const npc = { id: 5, pos: new THREE.Vector3(3, 0, 0), tags: new Set(['npc']) };
  ctx.bus.emit(E.FOOTSTEP, { actor: npc, position: npc.pos.clone() });
  assert.equal(am.counts.footWood, 1, 'NPC on the bridge deck');
  am.dispose();
});

test('fake WebAudio: cutscene loops run outside the voice pools and follow; procedural ids return stoppable handles', async () => {
  const { ctx, am, ac, restore } = await withFakeAudio();
  try {
    await am.unlock();
    await am.decode('cat/cat_purrsleepy_loop');
    const actor = { pos: new THREE.Vector3(2, 0, 0), height: 1 };
    const h = am.play3D('cat/cat_purrsleepy_loop', actor, { vol: 0.6, loop: true });
    assert.ok(h && typeof h.stop === 'function');
    await flush(); await flush();
    assert.ok(am.loops.has(h) && h.src?.loop, 'a looping source in the loop set');
    assert.ok(am.voices3D.every((v) => v.endAt <= ac.currentTime), 'no pooled voice taken');
    for (let i = 0; i < 40; i++) { ac.currentTime += 0.001; am._gates.clear(); am.play3D('cat/cat_purrsleepy_loop', new THREE.Vector3(i % 4, 0, 1)); }
    assert.ok(am.loops.has(h), 'a burst of one-shots never steals the loop');
    actor.pos.set(6, 0, 0); am.render(0, 1 / 60);
    assert.equal(h.panner.positionX.goal, 6, 'the loop follows its actor');
    h.stop(0.2);
    assert.ok(!am.loops.has(h) && h.src.stopped > 0);
    // procedural handles (story keeps and stops them by `handle`)
    const m = am.play3D('march', actor, { on: true });
    assert.ok(am.marching && m?.name === 'march');
    m.stop(); assert.equal(am.marching, null);
    const sh = am.play2D('shimmer', { on: true });
    assert.ok(am.shim.on); sh.stop(); assert.ok(!am.shim.on);
    const ch = am.play3D('laughChorus', actor, { count: 4, r: 10, dur: 3 });
    assert.equal(ch.count, 4); assert.ok(am.chorus);
    ch.stop(); assert.equal(am.chorus, null);
    const hb = am.play2D('heartbeat', { beats: 2, vol: 0.5 });
    assert.equal(hb.beats, 2);
    const bell = am.play3D('bellClunk', [0, 3, 10], { vol: 0.5 });
    assert.ok(bell && typeof bell.stop === 'function' && am.bells.has(bell));
    void ctx;
  } finally { restore(); }
});
