// tests/unit/ui.test.js  (owner: ui) — the pure parts of src/ui/**: text / glyph helpers, hearts, ranks, results rows,
// toast queue timing, menu focus model, settings schema (§14.3 + §14.4), touch stick maths, threat-arrow edge maths,
// fades, portraits, and the UI facade's node-safe contract (constructed without a DOM; §19.3 `loading`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeCtx } from './_fakeCtx.mjs';
import { E } from '../../src/core/events.js';
import { KITTEN_IDS, LEVEL_IDS, DIFFICULTY, TELEGRAPH } from '../../src/core/config.js';
import { UI, UI_TIMING, storyCanSkip } from '../../src/ui/UI.js';
import {
  tx, txt, fill, esc, rich, segments, segLength, revealHtml, revealCount, revealDuration, actionGlyph, glyphify,
  formatTime, heartStates, frac, objectiveText, chapterInfo, rankFor, RANK_KEYS, levelKittens, levelLetterId, titleCase,
} from '../../src/ui/text.js';
import { resultRows, RESULTS } from '../../src/ui/results.js';
import { ToastQueue, TOAST, iconFor } from '../../src/ui/toasts.js';
import { MenuNav, kittenCells, letterCards, licensesHtml, continueSub } from '../../src/ui/menus.js';
import {
  SETTINGS, SETTING_BY_KEY, SETTING_GROUPS, readSetting, settingLocked, stepSetting, sliderFromFrac, sliderFrac,
  formatSetting, applySetting,
} from '../../src/ui/settings.js';
import { stickVector, pickTapTarget, TOUCH } from '../../src/ui/touch.js';
import { edgePoint, onScreen, ARROW_COLORS } from '../../src/ui/threatArrows.js';
import { parseFade, CINEMA } from '../../src/ui/cinema.js';
import { DIALOG } from '../../src/ui/dialog.js';
import { portraitSVG, portraitKind, luminance } from '../../src/ui/portraits.js';
import { tagLabel } from '../../src/ui/prompts.js';
import { FONT_FILES } from '../../src/ui/fonts.js';
import manifest from '../../src/ui/assets.manifest.js';

const ctx0 = () => fakeCtx({ systems: false });

// ------------------------------------------------------------------ text
test('tx resolves strings keys, fills vars, falls back to the key', () => {
  const ctx = ctx0();
  assert.equal(tx(ctx, 'region.meadow'), 'Purrdale Meadows');
  assert.equal(tx(ctx, 'life.lost', { n: 8 }), '8 lives left');
  assert.equal(tx(ctx, 'no.such.key.xyz'), 'no.such.key.xyz');
  assert.equal(tx(null, 'hud.riposte'), 'Riposte!');                      // ui fallback strings without ctx
  assert.equal(tx(ctx, null), '');
  assert.equal(txt(ctx, 'literal line'), 'literal line');
  assert.equal(txt(ctx, false), '');
  assert.equal(fill('{a} and {b}', { a: 1 }), '1 and {b}');
});

test('esc / rich escape HTML; *x* becomes emphasis', () => {
  assert.equal(esc('<b>"&\''), '&lt;b&gt;&quot;&amp;&#39;');
  assert.equal(rich('a *b* <c>'), 'a <em>b</em> &lt;c&gt;');
});

test('typewriter: segments / reveal counts at 30 chars/s × speed (§14.2)', () => {
  const segs = segments('Hi *there* you');
  assert.deepEqual(segs.map((s) => [s.text, s.em]), [['Hi ', false], ['there', true], [' you', false]]);
  assert.equal(segLength(segs), 12);
  assert.equal(revealHtml(segs, 5), 'Hi <em>th</em>');
  assert.equal(revealHtml(segs, 99), 'Hi <em>there</em> you');
  assert.equal(revealHtml(segments('<x>'), 2), '&lt;x');
  assert.equal(DIALOG.cps, 30);
  assert.equal(revealCount(100, 1), 30);
  assert.equal(revealCount(100, 1, 2), 60);
  assert.equal(revealCount(10, 5), 10);
  assert.equal(revealCount(0, 5), 0);
  assert.equal(revealCount(100, -1), 0);
  assert.ok(Math.abs(revealDuration(60, 1) - 2) < 1e-9);
  assert.ok(Math.abs(revealDuration(60, 2) - 1) < 1e-9);
});

test('device glyphs: keyboard / pad / touch (§6.6, §15)', () => {
  assert.equal(actionGlyph('jump', 'kbm'), 'Space');
  assert.equal(actionGlyph('jump', 'pad'), 'A');
  assert.equal(actionGlyph('guard', 'kbm'), 'RMB');          // §15.4: RMB = guard
  assert.equal(actionGlyph('lockon', 'pad'), 'RB');          // §15.4: lock-on is RB only
  assert.equal(actionGlyph('attack', 'touch'), '⚔');
  assert.equal(actionGlyph('nope', 'pad'), 'nope');
  const k = glyphify('Press [Space] to jump', 'kbm');
  assert.match(k, /<kbd class="ui-key">Space<\/kbd>/);
  const p = glyphify('Press [Space] to jump', 'pad');
  assert.match(p, /<kbd class="ui-key">A<\/kbd>/);
  assert.match(glyphify('Swing ⚔ ×3', 'kbm'), /ui-key--sword">LMB</);
  assert.match(glyphify('[Weird] <b>', 'kbm'), /<kbd class="ui-key">Weird<\/kbd> &lt;b&gt;/);
});

test('numbers: time, hearts with halves, safe fractions', () => {
  assert.equal(formatTime(754), '12:34');
  assert.equal(formatTime(3725), '1:02:05');
  assert.equal(formatTime(-3), '0:00');
  assert.deepEqual(heartStates(8, 8), ['full', 'full', 'full', 'full']);
  assert.deepEqual(heartStates(5, 8), ['full', 'full', 'half', 'empty']);
  assert.deepEqual(heartStates(0, 8), ['empty', 'empty', 'empty', 'empty']);
  assert.deepEqual(heartStates(99, 6), ['full', 'full', 'full']);
  assert.deepEqual(heartStates(3, 10).length, 5);              // Heart Bells add hearts
  assert.equal(frac(5, 10), 0.5);
  assert.equal(frac(5, 0), 0);
  assert.equal(frac(20, 10), 1);
});

test('objective text, chapter cards, ranks, level counters', () => {
  const ctx = ctx0();
  assert.equal(objectiveText(ctx, null), '');
  const o = objectiveText(ctx, { textKey: 'x {value}/{max} {p}%', value: 1.6, max: 4 });
  assert.equal(o, 'x 1/4 40%');
  const c1 = chapterInfo(ctx, 1);
  assert.equal(c1.region, 'Purrdale Meadows');
  assert.ok(c1.title.length > 3 && c1.label.length > 3);
  assert.equal(chapterInfo(ctx, 'forest').region, tx(ctx, 'region.forest'));
  assert.equal(chapterInfo(ctx, { n: 2, title: 'Custom', region: 'Somewhere' }).title, 'Custom');
  // §6.8: by lives lost: Paw-some 0–1, Purr-fect 2–4, Mew-tiful 5+
  assert.deepEqual([0, 1, 2, 4, 5, 9].map(rankFor), ['pawsome', 'pawsome', 'purrfect', 'purrfect', 'mewtiful', 'mewtiful']);
  for (const k of Object.values(RANK_KEYS)) assert.ok(ctx.strings.has(k), k);
  const st = { kittens: ['noodle', 'biscuit', 'pickles'] };
  assert.deepEqual(levelKittens(st, 'meadow'), { n: 2, max: 3 });
  assert.deepEqual(levelKittens(st, 'nowhere'), { n: 0, max: 0 });
  assert.equal(levelLetterId('meadow'), 'l1');
  assert.equal(levelLetterId('keep'), 'l6');
  assert.equal(levelLetterId('title'), null);
  assert.equal(titleCase('memeWhite'), 'Meme White');
});

// ------------------------------------------------------------------ results
test('results rows (§14.3: time, kittens n/3, letter, fish, lives left, rank)', () => {
  const ctx = ctx0();
  const d = resultRows(ctx, { levelId: 'meadow', time: 754, kittens: 3, kittensTotal: 3, letter: true, fish: 128, lives: 8, livesLost: 1 });
  assert.deepEqual(d.rows.map((r) => r.id), ['time', 'kittens', 'letter', 'fish', 'lives']);
  assert.equal(d.rows[0].value, '12:34');
  assert.equal(d.rows[1].value, '3/3');
  assert.equal(d.rows[1].good, true);
  assert.equal(d.rows[2].value, '✓');
  assert.equal(d.rows[3].value, '+128');
  assert.equal(d.rows[4].value, '8');
  assert.equal(d.rank, 'pawsome');
  assert.equal(d.rankText, 'Paw-some');
  // Kitten difficulty: infinite lives; an explicit rank wins; missing fields are safe
  const k = resultRows(ctx, { lives: Infinity, livesLost: 7, rank: 'purrfect' });
  assert.equal(k.rank, 'purrfect');
  assert.notEqual(k.rows[4].value, 'Infinity');
  const e = resultRows(ctx, null);
  assert.equal(e.rows[1].value, '0/3');
  assert.equal(e.rows[2].value, '—');
  assert.equal(e.rank, 'pawsome');
  assert.ok(RESULTS.testAuto > RESULTS.minShow);
});

// ------------------------------------------------------------------ toasts
test('toast queue: 3 visible, 2.5 s each, extras wait, duplicates dropped (§14.3)', () => {
  assert.equal(TOAST.visible, 3);
  assert.equal(TOAST.life, 2.5);
  const q = new ToastQueue();
  for (const s of ['a', 'b', 'c', 'd', 'e']) assert.equal(q.push(s), true);
  assert.equal(q.push('a'), false, 'duplicate of a shown toast');
  assert.equal(q.push('   '), false, 'empty');
  assert.deepEqual(q.shown.map((t) => t.text), ['a', 'b', 'c']);
  assert.deepEqual(q.waiting.map((t) => t.text), ['d', 'e']);
  assert.equal(q.alpha(q.shown[0]), 0);
  q.update(1);
  assert.equal(q.alpha(q.shown[0]), 1);
  const gone = q.update(1.6);
  assert.equal(gone.length, 3);
  assert.deepEqual(q.shown.map((t) => t.text), ['d', 'e']);
  q.update(3);
  assert.equal(q.shown.length, 0);
  q.clear();
  assert.equal(q.waiting.length, 0);
  // the max queue keeps the newest
  const q2 = new ToastQueue({ maxQueue: 2 });
  for (let i = 0; i < 8; i++) q2.push(`t${i}`);
  assert.deepEqual(q2.waiting.map((t) => t.text), ['t6', 't7']);
});

test('toast icons by strings key', () => {
  assert.equal(iconFor('toast.kitten'), 'kitten');
  assert.equal(iconFor('toast.letter'), 'letter');
  assert.equal(iconFor('toast.heartbell'), 'bell');
  assert.equal(iconFor('toast.memecam'), 'cape');
  assert.equal(iconFor('toast.saved'), 'seal');
  assert.equal(iconFor('whatever', 'fish'), 'fish');
  assert.equal(iconFor('whatever'), null);
});

// ------------------------------------------------------------------ menus
test('menu focus wraps and skips disabled items', () => {
  const nav = new MenuNav([{}, { disabled: true }, {}, {}], 1);
  assert.equal(nav.index, 2, 'initial focus skips a disabled item');
  assert.equal(nav.move(1), true); assert.equal(nav.index, 3);
  nav.move(1); assert.equal(nav.index, 0, 'wraps');
  nav.move(-1); assert.equal(nav.index, 3);
  nav.move(-1); nav.move(-1); assert.equal(nav.index, 0, 'skips the disabled one going up');
  assert.equal(new MenuNav([]).index, -1);
  assert.equal(new MenuNav([{ disabled: true }]).current, null);
});

test('Pause → Kittens: 18 cells, names + where found, "???" when missing', () => {
  const ctx = ctx0();
  ctx.state.kittens = ['biscuit', 'pickles'];
  const cells = kittenCells(ctx);
  assert.equal(cells.length, KITTEN_IDS.length);
  assert.equal(cells.length, 18);
  const b = cells.find((c) => c.id === 'biscuit');
  assert.equal(b.found, true);
  assert.equal(b.name, 'Biscuit');
  assert.equal(b.where, 'Purrdale Meadows');
  const miss = cells.find((c) => !c.found);
  assert.equal(miss.name, tx(ctx, 'pause.missing'));
  assert.equal(miss.where, '');
});

test('Pause → Letters: one per level, text only when found', () => {
  const ctx = ctx0();
  ctx.state.letters = ['l1'];
  const cards = letterCards(ctx);
  assert.equal(cards.length, LEVEL_IDS.length);
  assert.equal(cards[0].found, true);
  assert.ok(cards[0].text.length > 10);
  assert.equal(cards[1].found, false);
  assert.equal(cards[1].text, '');
});

test('Continue sub-line and the credits markdown renderer', () => {
  const ctx = ctx0();
  assert.equal(continueSub(ctx, null), '');
  assert.equal(continueSub(ctx, { levelId: 'forest', kittens: 5 }), `Whiskerwood · 5/${KITTEN_IDS.length}`);
  assert.equal(continueSub(ctx, { levelId: 'meadow', kittens: ['a', 'b'] }), `Purrdale Meadows · 2/${KITTEN_IDS.length}`);
  const html = licensesHtml('# Title\n\nSome **bold** text <script>\n\n| a | b |\n|---|---|\n| x | y |\n- item\n');
  assert.ok(!/<script>/.test(html), 'escaped');
  assert.match(html, /Title/);
  assert.match(html, /item/);
});

// ------------------------------------------------------------------ settings (§14.3 + §14.4)
test('settings schema covers §14.3 / §14.4 and every key exists in the save defaults', () => {
  const ctx = ctx0();
  const keys = SETTINGS.map((d) => d.key);
  for (const k of ['master', 'music', 'sfx', 'invertY', 'sensitivity', 'quality', 'difficulty', 'holdStand', 'holdCharge', 'autoStand',
    'shake', 'reduceFlashes', 'patterns', 'subtitleSize', 'dialogSpeed', 'touchSize']) assert.ok(keys.includes(k), k);
  for (const d of SETTINGS) {
    assert.ok(SETTING_GROUPS[d.group], `group of ${d.key}`);
    assert.ok(ctx.strings.has(d.label) || tx(ctx, d.label) !== d.label, `label ${d.label}`);
    if (d.key !== 'difficulty') assert.notEqual(ctx.state.settings[d.key], undefined, `state.settings.${d.key}`);
  }
  assert.ok(!SETTING_BY_KEY.difficulty.options.includes('nine'), 'difficulty setting never offers Nine Lives (§14.3)');
  for (const o of SETTING_BY_KEY.difficulty.options) assert.ok(DIFFICULTY[o], o);
  assert.deepEqual([SETTING_BY_KEY.shake.min, SETTING_BY_KEY.shake.max], [0, 1], 'shake 0–100%');
});

test('stepSetting / sliders / format', () => {
  const vol = SETTING_BY_KEY.master;
  assert.equal(stepSetting(vol, 0.8, 1), 0.85);
  assert.equal(stepSetting(vol, 1, 1), 1);
  assert.equal(stepSetting(vol, 0, -1), 0);
  assert.equal(stepSetting(vol, 0.8, 0), 0.8);
  assert.equal(stepSetting(SETTING_BY_KEY.invertY, false, -1), true);
  assert.equal(stepSetting(SETTING_BY_KEY.quality, 'auto', 1), 'low');
  assert.equal(stepSetting(SETTING_BY_KEY.quality, 'high', 1), 'high');
  assert.equal(stepSetting(SETTING_BY_KEY.touchSize, 1.05, 1), 1.2, 'off-list values snap to the nearest option');
  assert.equal(sliderFromFrac(vol, 0.5), 0.5);
  assert.equal(sliderFromFrac(vol, 2), 1);
  assert.equal(sliderFrac(SETTING_BY_KEY.sensitivity, 0.25), 0);
  assert.equal(formatSetting(vol, 0.75), '75%');
  assert.equal(formatSetting(SETTING_BY_KEY.sensitivity, 1), '×1.00');
  assert.equal(formatSetting(SETTING_BY_KEY.holdStand, true), 'Hold');
  assert.equal(formatSetting(SETTING_BY_KEY.dialogSpeed, 2), '×2');
  assert.equal(formatSetting(SETTING_BY_KEY.touchSize, 1.4), 'XL');
});

test('applySetting writes state.settings and emits settings:changed; Nine Lives is locked (§7.9)', () => {
  const ctx = ctx0();
  const seen = [];
  ctx.bus.on(E.SETTINGS_CHANGED, (p) => seen.push(p));
  assert.equal(applySetting(ctx, 'shake', 0.4), 0.4);
  assert.equal(ctx.state.settings.shake, 0.4);
  assert.deepEqual(seen.at(-1), { key: 'shake', value: 0.4 });
  applySetting(ctx, 'difficulty', 'kitten');
  assert.equal(ctx.state.difficulty, 'kitten');
  assert.equal(readSetting(ctx.state, 'difficulty'), 'kitten');
  assert.equal(applySetting(ctx, 'difficulty', 'bogus'), 'kitten', 'unknown difficulty refused');
  ctx.state.difficulty = 'nine';
  assert.equal(settingLocked(ctx.state, 'difficulty'), true);
  const n = seen.length;
  assert.equal(applySetting(ctx, 'difficulty', 'knight'), 'nine');
  assert.equal(ctx.state.difficulty, 'nine');
  assert.equal(seen.length, n, 'no event when refused');
});

// ------------------------------------------------------------------ touch + threat arrows + fades
test('touch stick: radius clamp, dead zone, y+ = forward (drag up)', () => {
  const R = TOUCH.stickR;
  const up = stickVector(0, -R);
  assert.equal(up.x, 0); assert.equal(up.y, 1);
  const far = stickVector(R * 3, 0);
  assert.equal(far.x, 1); assert.equal(far.kx, R);
  const tiny = stickVector(1, 1);
  assert.equal(tiny.x, 0); assert.equal(tiny.y, 0);
  const diag = stickVector(R, R);
  assert.ok(Math.abs(Math.hypot(diag.x, diag.y) - 1) < 1e-9);
  assert.ok(TOUCH.leftFrac === 0.45, '§15.3: left 45%');
});

test('threat arrows: edge placement, behind-camera flip, on-screen test (§8.1)', () => {
  const W = 1280, H = 720;
  const right = edgePoint(3, 0, false, W, H);
  assert.equal(right.x, W - 36); assert.equal(right.y, H / 2); assert.equal(Math.abs(right.angle), 0);
  const behind = edgePoint(3, 0, true, W, H);
  assert.equal(behind.x, 36, 'behind: mirrored back to the left');
  const dead = edgePoint(0, 0, true, W, H);
  assert.equal(dead.y, H - 36, 'straight behind points down');
  const top = edgePoint(0, 5, false, W, H);
  assert.equal(top.y, 36);
  assert.equal(onScreen(0.2, 0.3, false), true);
  assert.equal(onScreen(0.2, 0.3, true), false);
  assert.equal(onScreen(0.99, 0, false), false);
  for (const k of Object.keys(TELEGRAPH.colors)) assert.ok(ARROW_COLORS[k], k);
});

test('parseFade normalises cutscene fades', () => {
  assert.equal(parseFade(null), null);
  assert.deepEqual(parseFade('black'), { color: '#000000', alpha: 1, dur: 0.6 });
  assert.deepEqual(parseFade('in'), { color: null, alpha: 0, dur: 0.6 });
  assert.deepEqual(parseFade(0.5), { color: null, alpha: 0.5, dur: 0.6 });
  assert.deepEqual(parseFade({ to: '#fff', dur: 2 }), { color: '#fff', alpha: 1, dur: 2 });
  assert.deepEqual(parseFade({ to: null, dur: 1 }), { color: null, alpha: 0, dur: 1 });
  assert.deepEqual(parseFade({ to: '#000', alpha: 3 }), { color: '#000', alpha: 1, dur: 0.6 });
  assert.equal(CINEMA.chapterSec, 3.0);
  assert.equal(CINEMA.lifeLostSec, 1.5);
});

// ------------------------------------------------------------------ portraits / prompts / fonts
test('portraits: cats from character configs, species faces for others, valid SVG', () => {
  assert.equal(portraitKind('swordcat'), 'cat');
  assert.equal(portraitKind('mochi'), 'cat');
  assert.equal(portraitKind('pudding'), 'dragon');
  assert.equal(portraitKind('cacklejaw'), 'hyena');
  assert.equal(portraitKind('barkus'), 'dog');
  assert.equal(portraitKind(''), 'emblem');
  for (const id of ['swordcat', 'mochi', 'biscuit', 'pudding', 'hyena_2', 'tallbert', 'zzz']) {
    const s = portraitSVG(id, { expression: 'worried' });
    assert.match(s, /^<svg[\s\S]*<\/svg>$/, id);
    assert.ok(!/NaN|undefined/.test(s), `${id} has no NaN/undefined`);
  }
  assert.ok(luminance('#FFFFFF') > luminance('#000000'));
});

test('interaction tag label: short prompt.<kind>, else the prompt without its [key]', () => {
  const ctx = ctx0();
  assert.equal(tagLabel(ctx, null, 'Vigil Stone: rest [E].'), 'Vigil Stone: rest');
  assert.equal(tagLabel(ctx, 'vigil', 'prompt.vigil'), 'Rest');
  assert.equal(tagLabel(ctx, null, null), '', 'the bare [E] prompt: the key glyph sits on the wax seal alone');
});

test('fonts: every §14.1 face is in the manifest and on disk', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  assert.equal(FONT_FILES.length, 6);
  for (const f of FONT_FILES) {
    assert.ok(manifest.includes(f.file), f.file);
    assert.ok(fs.existsSync(path.join('public/assets', f.file)), `${f.file} exists`);
  }
});

// ------------------------------------------------------------------ the UI facade (node: no DOM)
test('UI constructs without a DOM and keeps the §19.3 contract', async () => {
  const ctx = fakeCtx();
  const ui = ctx.ui;
  assert.ok(ui instanceof UI);
  assert.equal(typeof ui.loading, 'function');
  ui.loading(true); assert.equal(ui.isLoading, true);
  ui.loading(false); assert.equal(ui.isLoading, false);
  await ui.init();                                  // no document → returns without building anything
  assert.equal(ui.root, null);
  ui.update(1 / 60); ui.render(0, 1 / 60);          // no-ops without a root
  await ui.showResults({ levelId: 'meadow' });      // resolves at once without a screen
  await ui.chapter(1); await ui.fade('black');
  assert.equal(ui.toast('hello'), false);
  assert.deepEqual({ ...ui.handles }, { dialog: true, cinema: true, prompt: true, skip: true, title: true, tutorial: true });
  assert.equal(typeof ui.cinema, 'function');
  for (const k of ['letterbox', 'hud', 'apply', 'clear', 'chapter', 'fade']) assert.equal(typeof ui.cinema[k], 'function', k);
  ui.cinema({ letterbox: true });                   // ignored before init
  assert.equal(ui.busy, false);
  ui.dispose();
});

test('UI.hasSave follows save.hasSave() (requests/save.md), then the boot snapshot / resume point', () => {
  const ctx = fakeCtx();
  const ui = ctx.ui;
  ctx.save = { hasSave: () => false, summary: () => null };
  assert.equal(ui.hasSave(), false);
  ui.bootSave = { levelId: 'forest', spawnId: 'camp' };
  assert.equal(ui.hasSave(), false, 'save is the live authority');
  ctx.save = { hasSave: () => true, summary: () => ({ levelId: 'town', spawnId: 'hub', kittens: 7 }) };
  assert.equal(ui.hasSave(), true);
  assert.deepEqual(ui.saveSummary(), { levelId: 'town', spawnId: 'hub', kittens: 7 });
  ctx.save = null;
  assert.equal(ui.hasSave(), true, 'no save system → boot snapshot');
  ui.bootSave = null;
  assert.equal(ui.hasSave(), false);
  ui.resumePoint = { levelId: 'meadow', spawnId: 'start' };
  assert.equal(ui.hasSave(), true);
});

test('storyCanSkip reads story / scene flags; UI timings match §5.1', () => {
  assert.equal(storyCanSkip(null), false);
  assert.equal(storyCanSkip({}), true);
  assert.equal(storyCanSkip({ canSkip: false }), false);
  assert.equal(storyCanSkip({ canSkip: () => true }), true);
  assert.equal(storyCanSkip({ current: { canSkip: false } }), false);
  assert.equal(UI_TIMING.skipHold, 1.0);
  assert.equal(UI_TIMING.tutorialTap, 0.35);
});

test('touch: tap-to-lock picks the enemy nearest the tap within tapPickPx, skipping off-screen ones (§15.3)', () => {
  const at = { a: { x: 100, y: 100 }, b: { x: 140, y: 100 }, c: null };
  const cands = ['a', 'b', 'c'];
  const proj = (k) => at[k];
  assert.equal(pickTapTarget(cands, proj, 105, 100), 'a');
  assert.equal(pickTapTarget(cands, proj, 135, 104), 'b');
  assert.equal(pickTapTarget(cands, proj, 400, 400), null);            // empty ground → unlock
  assert.equal(pickTapTarget(cands, proj, 100 + TOUCH.tapPickPx + 1, 100 - 0), 'b');
  assert.equal(pickTapTarget([], proj, 0, 0), null);
  assert.ok(TOUCH.tapPx <= 12 && TOUCH.tapMs <= 300);
});

// ====================================================================================================== M2: shops (§13.3–§13.5)
import { STATIONS, SKINS, CAPE_IDS, stationId, itemState, shopRows, canBuy, purchase, equip, skinUnlocked, capeUnlocked, lookoutRows, chipText, keeperLine } from '../../src/ui/shops.js';
import { questCards, nextLevel, HUB_LEVEL } from '../../src/ui/questBoard.js';
import { resultBest } from '../../src/ui/results.js';
import { resetSettings, CONTROL_ROWS } from '../../src/ui/settings.js';
import { swordArt, capeMannequin, itemIcon } from '../../src/ui/shopArt.js';
import { ECONOMY, KITTENS_BY_LEVEL } from '../../src/core/config.js';
import { defaultState } from '../../src/core/GameState.js';

const shopCtx = (patch = {}) => {
  const ctx = fakeCtx({ systems: false });
  const st = ctx.state;
  st.fish = 1000;
  Object.assign(st, patch);
  const saves = [];
  ctx.bus.on(E.SAVE_REQUEST, (p) => saves.push(p));
  return { ctx, st, saves };
};

test('shops: stations, ids and the §13.3 catalogue', () => {
  assert.deepEqual(Object.keys(STATIONS).sort(), ['bakery', 'barracks', 'forge', 'library', 'lookout', 'wardrobe']);
  for (const [w, id] of [['shop_forge', 'forge'], ['station-bakery', 'bakery'], ['tofu', 'forge'], ['pearl', 'wardrobe'], ['barracks_banner', 'barracks'], ['library', 'library'], ['nope', null]]) assert.equal(stationId(w), id, w);
  assert.deepEqual(SKINS, ['borrowed', 'twig', 'fishbone', 'baguette', 'diamond', 'toobig', 'dawnblade']);
  for (const c of CAPE_IDS) assert.ok(ECONOMY.capes[c] != null, c);
  for (const s of SKINS) assert.ok(ECONOMY.skins[s] != null, s);
  const { ctx } = shopCtx();
  for (const st of ['bakery', 'forge', 'library', 'wardrobe']) for (const r of shopRows(ctx.state, st)) {
    assert.ok(tx(ctx, r.nameKey, r.nameVars) !== r.nameKey, `name ${r.nameKey}`);
    assert.ok(tx(ctx, r.descKey, r.descVars) !== r.descKey, `desc ${r.descKey}`);
    if (r.lockKey) assert.ok(tx(ctx, r.lockKey, r.lockVars) !== r.lockKey, `lock ${r.lockKey}`);
  }
});

test('shops: tiered upgrades cost and cap per Appendix A (satchel 100/200, sharp 120/240/400)', () => {
  const { ctx, st, saves } = shopCtx();
  assert.equal(itemState(st, 'satchel').cost, 100);
  assert.equal(purchase(ctx, 'satchel').ok, true);
  assert.equal(st.upgrades.satchel, 1); assert.equal(st.fish, 900);
  assert.equal(itemState(st, 'satchel').cost, 200);
  assert.equal(tx(ctx, itemState(st, 'satchel').nameKey, itemState(st, 'satchel').nameVars), 'Bigger Satchel II');
  purchase(ctx, 'satchel');
  assert.equal(itemState(st, 'satchel').status, 'maxed');
  assert.deepEqual(purchase(ctx, 'satchel'), { ok: false, reason: 'owned', cost: 0 });
  st.fish = 2000;
  const costs = [];
  for (let i = 0; i < 5 && itemState(st, 'sharp').status === 'buy'; i++) { costs.push(itemState(st, 'sharp').cost); purchase(ctx, 'sharp'); }
  assert.deepEqual(costs, [120, 240, 400]);
  assert.equal(st.upgrades.sharp, 3);
  assert.equal(st.fish, 2000 - 760);
  assert.equal(saves.length, 5);
  assert.ok(saves.every((p) => p.reason === 'shop'), 'every purchase autosaves (§19.7)');
});

test('shops: refusal when poor, Wave Reach needs Shard 2, booleans buy once', () => {
  const { ctx, st, saves } = shopCtx({ fish: 149, shards: 1 });
  assert.deepEqual(canBuy(st, 'valorGain'), { ok: false, reason: 'poor' });
  assert.equal(purchase(ctx, 'valorGain').ok, false);
  assert.equal(st.fish, 149); assert.equal(saves.length, 0);
  assert.equal(itemState(st, 'waveReach').status, 'locked');
  st.fish = 1000; st.shards = 2;
  assert.equal(itemState(st, 'waveReach').status, 'buy');
  assert.equal(purchase(ctx, 'waveReach').cost, ECONOMY.shops.waveReach.cost);
  assert.equal(st.upgrades.waveReach, true);
  assert.equal(itemState(st, 'waveReach').status, 'maxed');
  purchase(ctx, 'quickCharge');
  assert.equal(st.upgrades.quickCharge, true);
});

test('shops: purchase nudges the player (satchel milkMax, valor gain multiplier)', () => {
  const { ctx, st } = shopCtx();
  let recomputed = 0;
  ctx.player = { milk: 2, milkMax: 2, recomputeMax() { recomputed++; this.milkMax = 3; }, valorState: { gainMul: 1 } };
  purchase(ctx, 'satchel');
  assert.equal(recomputed, 1); assert.equal(ctx.player.milk, 3, 'the new bottle comes full');
  purchase(ctx, 'valorGain');
  assert.equal(ctx.player.valorState.gainMul, ECONOMY.shops.valorGain.mul);
  assert.equal(st.milkMax, 3);
});

test('shops: skins unlock by kittens / flags, equip writes cosmetics and autosaves', () => {
  const { ctx, st, saves } = shopCtx();
  st.kittens = ['a', 'b', 'c', 'd', 'e'];
  assert.equal(skinUnlocked(st, 'twig'), true);
  assert.equal(skinUnlocked(st, 'fishbone'), false);
  assert.equal(itemState(st, 'skin:fishbone').lockKey, 'ui.shop.need.kittens');
  assert.equal(equip(ctx, 'skin:fishbone'), false);
  st.kittens.push('f');
  assert.equal(itemState(st, 'skin:fishbone').status, 'owned');
  assert.equal(equip(ctx, 'skin:fishbone'), true);
  assert.equal(st.cosmetics.sword, 'fishbone');
  assert.ok(st.cosmetics.swords.includes('fishbone'), 'condition-unlocked skin joins the owned list');
  assert.equal(itemState(st, 'skin:fishbone').status, 'equipped');
  assert.equal(equip(ctx, 'skin:fishbone'), false, 'already equipped');
  assert.equal(skinUnlocked(st, 'toobig'), false);
  st.setFlag?.('keep.brutus', true); if (!st.setFlag) st.flags['keep.brutus'] = true;
  assert.equal(skinUnlocked(st, 'toobig'), true);
  assert.equal(saves.length, 1);
});

test('shops: capes: start / flag / meme cam / 80-fish buys; the bow is never a cape', () => {
  const { ctx, st } = shopCtx({ fish: 100 });
  assert.equal(capeUnlocked(st, 'cream'), true);
  assert.equal(itemState(st, 'cape:red').status, 'locked');
  assert.equal(itemState(st, 'cape:memeWhite').lockKey, 'ui.shop.need.memeCam');
  st.memeCamSeen = 1;
  assert.equal(itemState(st, 'cape:memeWhite').status, 'owned');
  const blue = itemState(st, 'cape:blue');
  assert.equal(blue.status, 'buy'); assert.equal(blue.cost, ECONOMY.shops.cape);
  assert.equal(purchase(ctx, 'cape:blue').ok, true);
  assert.equal(st.cosmetics.cape, 'blue', 'a bought cape is worn at once');
  assert.equal(st.fish, 20);
  assert.equal(canBuy(st, 'cape:green').reason, 'poor');
  assert.equal(itemState(st, 'cape:gold').status, 'locked');
  assert.ok(!CAPE_IDS.includes('bow'));
  assert.equal(chipText(ctx, itemState(st, 'cape:green')), '80');
  assert.equal(chipText(ctx, itemState(st, 'cape:green'), true), 'Buy?');
  assert.equal(chipText(ctx, itemState(st, 'cape:blue')), tx(ctx, 'shop.equipped'));
});

test('shops: lookout rows, keeper lines', () => {
  const { ctx, st } = shopCtx();
  st.kittens = [...KITTEN_IDS.slice(0, 4)];
  const rows = lookoutRows(ctx);
  assert.equal(rows.length, LEVEL_IDS.length);
  assert.equal(rows.reduce((a, r) => a + r.n, 0), 4);
  assert.ok(rows.every((r) => r.missing === r.max - r.n));
  const line = keeperLine(ctx, 'pip', () => 0);
  assert.ok(line.length > 0 && !line.includes('{'), line);
  st.flags['gate.done'] = true;
  assert.equal(keeperLine(ctx, 'marmalade', () => 0), tx(ctx, 'hub.marmalade.bed'));
});

test('shop art: every skin, cape and icon draws; the bow on the mannequin is pink', () => {
  for (const s of SKINS) assert.match(swordArt(s), /^<svg class="art-sword"/);
  for (const c of CAPE_IDS) { const svg = capeMannequin(c); assert.match(svg, /cape-sway/); assert.ok(svg.includes('#F2A2B8'), `${c}: pink bow`); }
  for (const k of ['satchel', 'sharp', 'quickCharge', 'valorGain', 'waveReach', 'lock', 'spyglass']) assert.match(itemIcon(k), /<svg/);
});

// ====================================================================================================== M2: Quest Board (§12.5)
test('quest board: next level, card states, hub never a destination', () => {
  const ctx = fakeCtx({ systems: false }), st = ctx.state;
  assert.equal(nextLevel(st), 'meadow');
  st.flags['meadow.done'] = true; st.flags['forest.done'] = true;
  assert.equal(nextLevel(st), 'gate', 'the hub (town) is skipped');
  st.levels = { meadow: { cleared: true, bestRank: 'pawsome', bestTime: 700 } };
  st.letters = ['l1'];
  st.kittens = [...KITTENS_BY_LEVEL.meadow.slice(0, 2)];
  const cards = questCards(ctx, HUB_LEVEL);
  assert.equal(cards.length, 6);
  const m = cards[0];
  assert.deepEqual([m.cleared, m.open, m.letter, m.bestRank, m.bestTime, m.kittens.n, m.kittens.max], [true, true, true, 'pawsome', 700, 2, 3]);
  assert.equal(cards.find((c) => c.id === 'town').open, false);
  assert.equal(cards.find((c) => c.id === 'town').here, true);
  assert.equal(cards.find((c) => c.id === 'gate').next, true);
  assert.equal(cards.find((c) => c.id === 'gate').open, true);
  assert.equal(cards.find((c) => c.id === 'bog').open, false);
  assert.match(cards[3].label, /4/);
  for (const id of ['gate', 'bog', 'keep']) st.flags[`${id}.done`] = true;
  assert.equal(nextLevel(st), null);
});

// ====================================================================================================== M2: results bests, settings extras
test('results: per-level bests against the record at level start', () => {
  const run = { levelId: 'forest', time: 600, livesLost: 0, rank: 'pawsome' };
  assert.deepEqual(resultBest(run, { cleared: false }), { first: true, newTime: false, newRank: false, bestTime: 600, bestRank: 'pawsome' });
  const b = resultBest(run, { cleared: true, bestTime: 700, bestRank: 'purrfect' });
  assert.deepEqual([b.first, b.newTime, b.newRank, b.bestTime, b.bestRank], [false, true, true, 600, 'pawsome']);
  const c = resultBest({ ...run, time: 900, rank: 'mewtiful' }, { cleared: true, bestTime: 700, bestRank: 'purrfect' });
  assert.deepEqual([c.newTime, c.newRank, c.bestTime, c.bestRank], [false, false, 700, 'purrfect']);
  assert.equal(resultBest(run, null).first, false, 'unknown record: no ribbons');
});

test('settings: reset to the §19.7 defaults (difficulty kept) and the controls card', () => {
  const ctx = fakeCtx({ systems: false }), st = ctx.state;
  const seen = [];
  ctx.bus.on(E.SETTINGS_CHANGED, (p) => seen.push(p.key));
  st.settings.shake = 0.2; st.settings.master = 0.1; st.difficulty = 'kitten';
  const changed = resetSettings(ctx, defaultState().settings);
  assert.deepEqual(changed.sort(), ['master', 'shake']);
  assert.deepEqual(seen.sort(), ['master', 'shake']);
  assert.equal(st.settings.shake, 1); assert.equal(st.difficulty, 'kitten');
  for (const [act] of CONTROL_ROWS) for (const d of ['kbm', 'pad', 'touch']) assert.ok(actionGlyph(act, d), `${act}/${d}`);
});
