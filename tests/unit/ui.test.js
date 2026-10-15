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
  toastText, formatTime, heartStates, frac, objectiveText, chapterInfo, rankFor, RANK_KEYS, levelKittens, levelLetterId, titleCase,
} from '../../src/ui/text.js';
import { resultRows, RESULTS } from '../../src/ui/results.js';
import { ToastQueue, TOAST, iconFor } from '../../src/ui/toasts.js';
import { MenuNav, kittenCells, letterCards, licensesHtml, continueSub, embedMode, pauseExtras, coBrandHtml, creditsTopHtml, controlLabel } from '../../src/ui/menus.js';
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
import { FONT_FILES, FONT_LICENSES } from '../../src/ui/fonts.js';
import * as Icons from '../../src/ui/icons.js';
import { catnipLabel } from '../../src/ui/hud.js';
import manifest from '../../src/ui/assets.manifest.js';

const ctx0 = () => fakeCtx({ systems: false });

// ------------------------------------------------------------------ text
test('tx resolves strings keys, fills vars, falls back to the key', () => {
  const ctx = ctx0();
  assert.equal(tx(ctx, 'region.meadow'), 'Purrdale Meadows');
  assert.match(tx(ctx, 'life.lost', { n: 8 }), /8 lives left/);
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
  assert.equal(actionGlyph('jump', 'kbm'), 'Space');          // TT3 §11.2: Space = jump
  assert.equal(actionGlyph('jump', 'pad'), 'A');
  assert.equal(actionGlyph('guard', 'kbm'), 'RMB');            // TT3 §11.2: RMB / Q / L = the Stand
  assert.equal(actionGlyph('move', 'kbm'), 'WASD');            // hybrid walks on WASD
  assert.equal(actionGlyph('trick', 'kbm'), 'F');              // F = the Paw Trick
  assert.equal(actionGlyph('ability', 'kbm'), 'G');            // G = the kitten
  assert.equal(actionGlyph('trick', 'pad'), 'RT');
  assert.equal(actionGlyph('guard', 'pad'), 'LB');
  assert.equal(actionGlyph('lockon', 'pad'), 'R3');            // R3 selects (RB is the Stand)
  assert.equal(actionGlyph('zoom', 'pad'), 'View');
  assert.equal(actionGlyph('trick', 'touch'), ':3');
  assert.equal(actionGlyph('attack', 'touch'), '⚔');
  assert.equal(actionGlyph('nope', 'pad'), 'nope');
  const k = glyphify('Press [Space] to jump', 'kbm');
  assert.match(k, /<kbd class="ui-key">Space<\/kbd>/);
  const p = glyphify('Press [Jump] to jump', 'pad');
  assert.match(p, /<kbd class="ui-key">A<\/kbd>/);
  assert.match(glyphify('Press [Jump] to jump', 'kbm'), /<kbd class="ui-key">Space<\/kbd>/, 'semantic tokens resolve through the bindings');
  assert.match(glyphify('[Trick] Toss the coin', 'kbm'), /<kbd class="ui-key">F<\/kbd>/);
  assert.match(glyphify('[Trick] Toss the coin', 'pad'), /<kbd class="ui-key">RT<\/kbd>/);
  assert.match(glyphify('[Trick] Toss the coin', 'touch'), /<kbd class="ui-key">:3<\/kbd>/);
  assert.match(glyphify('Hold [Stand]', 'kbm'), /<kbd class="ui-key">RMB<\/kbd>/, 'the Stand prompt says RMB');
  assert.match(glyphify('Hold [Esc] or [P]', 'pad'), /Start/);
  assert.match(glyphify('Hold [Stand]', 'touch'), /<kbd class="ui-key">Stand<\/kbd>/);
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
  // §6.8 + WA §4.4: by lives lost: PAW-SOME! 0–1, PURR-FECT! 2–3, CLAW-SOME! 4–5, Good kitty! 6+ (words, no letter grades)
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 9].map(rankFor), ['pawsome', 'pawsome', 'purrfect', 'purrfect', 'clawsome', 'clawsome', 'mewtiful', 'mewtiful']);
  for (const k of Object.values(RANK_KEYS)) { assert.ok(/^results\.rank\./.test(k), k); assert.notEqual(tx(ctx, k), k, `${k} resolves`); assert.ok(!/^[A-F][+-]?$/.test(tx(ctx, k)), 'no letter grade'); }
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
  assert.equal(d.rankText, tx(ctx, 'results.rank.pawsome'));
  assert.ok(/paw-some/i.test(d.rankText));
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
test('toast queue: 3 visible (TT5 default 2 on tablet / desktop), 2.5 s each, extras wait, duplicates dropped (§14.3)', () => {
  assert.equal(TOAST.visible, 2, 'TT5: two toasts in the top slot on tablet and desktop');
  assert.equal(TOAST.life, 2.5);
  const q = new ToastQueue({ visible: 3 });
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
  assert.ok(TOUCH.leftFrac === 0.42, 'CONTROLS_SPEC §9.1: the joystick zone is the left 42 %');
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
  // WA §2.7 (ui.W7): the 'black' fade spec resolves to cream #FFF1DE; near-black colours too; cocoa-plum stays
  assert.deepEqual(parseFade('black'), { color: '#FFF1DE', alpha: 1, dur: 0.6 });
  assert.equal(parseFade(true).color, '#FFF1DE');
  assert.equal(parseFade({ to: '#0B0908' }).color, '#FFF1DE');
  assert.equal(parseFade('dark').color, '#3A2630');
  assert.equal(parseFade({ to: '#3A2630' }).color, '#3A2630');
  assert.deepEqual(parseFade('in'), { color: null, alpha: 0, dur: 0.6 });
  assert.deepEqual(parseFade(0.5), { color: null, alpha: 0.5, dur: 0.6 });
  assert.deepEqual(parseFade({ to: '#fff', dur: 2 }), { color: '#fff', alpha: 1, dur: 2 });
  assert.deepEqual(parseFade({ to: null, dur: 1 }), { color: null, alpha: 0, dur: 1 });
  assert.deepEqual(parseFade({ to: '#000', alpha: 3 }), { color: '#FFF1DE', alpha: 1, dur: 0.6 });
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
  // Token Tails (TOKENTAILS-PLAN §2.6): Nunito body (Latin + Latin Extended), Passion One 900 titles, Fredoka fallback;
  // every face a woff2 (PERF I2), every licence shipped and listed
  assert.deepEqual([...new Set(FONT_FILES.map((f) => f.family))], ['Nunito', 'Passion One', 'Fredoka']);
  assert.ok(FONT_FILES.some((f) => f.file === 'fonts/nunito-latin-wght-normal.woff2'), 'the Nunito Latin file core preloads');
  assert.ok(FONT_FILES.some((f) => /nunito-latin-ext/.test(f.file) && /U\+0100-02BA/.test(f.unicodeRange)), 'Latin Extended (ž, ė, ų …)');
  assert.equal(FONT_FILES.find((f) => f.family === 'Passion One').weight, '900');
  assert.ok(!manifest.some((f) => /Cinzel|Uncial|MedievalSharp/.test(f)), 'no medieval faces in the ui manifest');
  for (const f of FONT_FILES) {
    assert.match(f.file, /\.woff2$/);
    assert.ok(manifest.includes(f.file), f.file);
    assert.ok(fs.existsSync(path.join('public/assets', f.file)), `${f.file} exists`);
  }
  for (const f of [...FONT_LICENSES, 'ui/tokentails-logo.webp']) {
    assert.ok(manifest.includes(f), `${f} in the manifest`);
    assert.ok(fs.existsSync(path.join('public/assets', f)), `${f} exists`);
  }
  assert.match(fs.readFileSync('public/assets/fonts/licenses/LICENSE-nunito.txt', 'utf8'), /SIL OPEN FONT LICENSE/i);
  assert.match(fs.readFileSync('public/assets/fonts/licenses/LICENSE-passion-one.txt', 'utf8'), /SIL OPEN FONT LICENSE/i);
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
  assert.deepEqual({ ...ui.handles }, { dialog: true, cinema: true, prompt: true, skip: true, title: true, tutorial: true, reward: true });
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
  assert.equal(capeUnlocked(st, 'red'), true, 'Token Tails: the royal red cape is hers from the start');
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

// ------------------------------------------------------------------ CONTROLS_SPEC (iso controls) ui parts
import { INPUT, TOUCH as TOUCH_CFG } from '../../src/core/config.js';
import { codeLabel, preferredCode, presetGlyph, PRESET_IDS } from '../../src/ui/text.js';
import { slotGlyph } from '../../src/ui/abilityBar.js';
import { cursorKind, cursorCss, clampCursorSize, CURSOR_KINDS, CursorController } from '../../src/ui/cursor.js';
import { barAlpha, pickBars, HPBAR } from '../../src/ui/hpBars.js';
import { computeLayout, minGap, offsetFor, layoutKey, layoutConflicts, classifyGesture } from '../../src/ui/touchLayout.js';
import { settingVisible } from '../../src/ui/settings.js';

/** A fake core Input with the active preset's merged codes (core merges keys ← preset ← bindings the same way). */
const fakeInput = (preset = 'hybrid', device = 'kbm', bindings = {}) => ({
  device, preset,
  codesFor: (a) => bindings[a] ?? INPUT.presets[preset]?.keys?.[a] ?? INPUT.keys[a] ?? [],
});

test('§12 ui 3 glyphs: preset-aware tokens resolve through the active bindings', () => {
  assert.equal(codeLabel('KeyQ'), 'Q');
  assert.equal(codeLabel('Mouse2'), 'RMB');
  assert.equal(codeLabel('ShiftLeft'), 'Shift');
  assert.equal(preferredCode('attack', ['KeyJ', 'Mouse0']), 'Mouse0');      // mouse-first actions show the button
  assert.equal(preferredCode('guard', ['Mouse4', 'KeyL']), 'Mouse4');        // TT3: the Stand is mouse-first (RMB)
  assert.equal(preferredCode('jump', ['Mouse1', 'Space']), 'Space');         // others the key
  const hy = fakeInput('hybrid'), di = fakeInput('diablo'), ko = fakeInput('keyboardOnly'), mo = fakeInput('moba');
  assert.equal(actionGlyph('guard', 'kbm', hy), 'RMB');
  assert.equal(actionGlyph('attack', 'kbm', hy), 'LMB');
  assert.equal(actionGlyph('move', 'kbm', hy), 'WASD');
  assert.equal(actionGlyph('move', 'kbm', mo), 'RMB');                       // moba: RMB moves
  assert.equal(actionGlyph('guard', 'kbm', mo), 'Q');
  assert.equal(actionGlyph('move', 'kbm', di), 'LMB');                       // diablo: LMB moves
  assert.equal(actionGlyph('dodge', 'kbm', di), 'Space');
  assert.equal(actionGlyph('attack', 'kbm', ko), 'J');
  assert.equal(actionGlyph('move', 'kbm', ko), 'WASD');                      // keyboardOnly: no click-move
  assert.equal(actionGlyph('attackMove', 'kbm', mo), 'A');
  assert.equal(actionGlyph('zoom', 'kbm', hy), 'Wheel');                     // gestures never come from bindings
  assert.equal(actionGlyph('guard', 'pad', hy), 'LB');                       // pad glyphs ignore KBM bindings
  // semantic tokens follow the preset; a literal key token follows a rebinding that moved the action off it
  assert.match(glyphify('Hold [Stand].', 'kbm', di), /<kbd class="ui-key">RMB<\/kbd>/);
  assert.match(glyphify('Hold [Stand].', 'kbm', hy), /<kbd class="ui-key">RMB<\/kbd>/);
  assert.match(glyphify('Hold [Stand].', 'kbm', fakeInput('hybrid', 'kbm', { guard: ['KeyN', 'KeyQ'] })), /<kbd class="ui-key">N<\/kbd>/, 'a rebound Stand shows its new key');
  assert.match(glyphify('Jump [Jump].', 'touch', hy), />Jump</);
  assert.match(glyphify('Press [Space].', 'kbm', hy), />Space</);
  assert.match(glyphify('Press [Space].', 'kbm', fakeInput('hybrid', 'kbm', { jump: ['KeyN'] })), />N</);
  assert.match(glyphify('Snip [Attack] x3', 'kbm', ko), /ui-key--sword">J</);
  // custom rebinding wins over the preset
  assert.equal(actionGlyph('jump', 'kbm', fakeInput('hybrid', 'kbm', { jump: ['KeyT'] })), 'T');
  // the ability bar corner glyph
  assert.equal(slotGlyph(hy, 'ability'), 'G');
  assert.equal(slotGlyph(fakeInput('hybrid', 'pad'), 'ability'), 'LT');
  assert.equal(slotGlyph(di, 'dodge'), 'Space');
});

test('controls card: every preset previews a glyph for every row; move shows WASD when the preset walks on it', () => {
  assert.deepEqual([...PRESET_IDS], ['hybrid', 'moba', 'diablo', 'mouseOnly', 'keyboardOnly']);
  for (const p of PRESET_IDS) for (const [act] of CONTROL_ROWS) {
    const g = presetGlyph(act, p);
    assert.ok(typeof g === 'string' && g.length > 0 && g !== act, `${p}.${act} -> ${g}`);
  }
  assert.equal(presetGlyph('move', 'hybrid'), 'WASD');
  assert.equal(presetGlyph('move', 'moba'), 'RMB');
  assert.equal(presetGlyph('move', 'diablo'), 'LMB / WASD');
  assert.equal(presetGlyph('move', 'mouseOnly'), 'RMB / WASD');
  assert.equal(presetGlyph('move', 'keyboardOnly'), 'WASD');
  assert.equal(presetGlyph('guard', 'diablo'), 'RMB');
  assert.equal(presetGlyph('jump', 'diablo'), 'T');
  assert.equal(presetGlyph('guard', 'hybrid', { guard: ['KeyN'] }), 'N');
  assert.equal(presetGlyph('pause', 'hybrid'), 'Esc / P');
  assert.equal(presetGlyph('pause', 'hybrid', { pause: ['KeyO', 'Escape'] }), 'Esc / O');
  assert.ok(!CONTROL_ROWS.some(([a]) => a === 'look'), 'no camera-look row in iso');
});

test('§10.2 cursors: kind from the frame state; sizes x1 / x1.5 / x2 and a high-contrast variant', () => {
  const base = { mode: 'play', hoverKind: 'ground' };
  assert.equal(cursorKind(base), 'ground');
  assert.equal(cursorKind({ ...base, hoverKind: 'enemy' }), 'enemy');
  assert.equal(cursorKind({ ...base, hoverKind: 'breakable' }), 'enemy');
  assert.equal(cursorKind({ ...base, hoverKind: 'npc' }), 'interact');
  assert.equal(cursorKind({ ...base, hoverKind: 'interact' }), 'interact');
  assert.equal(cursorKind({ ...base, hoverKind: 'pickup' }), 'pickup');
  assert.equal(cursorKind({ ...base, unreachable: true }), 'unreachable');
  assert.equal(cursorKind({ ...base, hoverKind: 'enemy', unreachable: true }), 'enemy');      // a foe wins
  assert.equal(cursorKind({ ...base, attackMove: true, hoverKind: 'enemy' }), 'attackMove');
  assert.equal(cursorKind({ ...base, aiming: true, attackMove: true }), 'aim');
  assert.equal(cursorKind({ ...base, mode: 'cutscene' }), 'none');
  assert.equal(cursorKind({ ...base, meme: true }), 'none');
  assert.equal(cursorKind({ ...base, mode: 'menu' }), 'default');
  assert.equal(cursorKind({ ...base, menu: true }), 'default');
  assert.equal(clampCursorSize(1.2), 1); assert.equal(clampCursorSize(1.5), 1.5); assert.equal(clampCursorSize(9), 2);
  for (const k of CURSOR_KINDS) {
    const a = cursorCss(k, 1), b = cursorCss(k, 2), c = cursorCss(k, 1, true);
    assert.match(a, /^url\("data:image\/svg\+xml;utf8,.*"\) \d+ \d+, [a-z-]+$/, k);
    assert.ok(decodeURIComponent(a).includes('width="32"') && decodeURIComponent(b).includes('width="64"'), `${k} sizes`);
    assert.notEqual(a, c, `${k} contrast variant differs`);
  }
  assert.equal(cursorCss('none'), 'none');
  assert.equal(cursorCss('default'), 'default');
  assert.ok(decodeURIComponent(cursorCss('ground')).includes('#FF9EC0'), 'the paw wears a pink bow cuff');
  assert.ok(decodeURIComponent(cursorCss('ground')).includes('#F3EEE6'), 'a soft ivory Token Tails paw, no gauntlet metal (WA §3.6)');
  assert.ok(decodeURIComponent(cursorCss('interact')).includes('#9BE3C4'), 'interactables: the mint speech-dot (WA2)');
  assert.match(cursorCss('aim', 1), /\) 16 16,/);       // the hotspot scales with the size (reticle centred)
  assert.match(cursorCss('aim', 2), /\) 32 32,/);
});

test('§10.4 HP pills: shown when damaged (fade 3 s after the last hit), selected or hovered; pool of 12; boss excluded', () => {
  assert.equal(HPBAR.pool, 12);
  assert.deepEqual([HPBAR.w, HPBAR.h, HPBAR.wTouch, HPBAR.hTouch], [36, 5, 44, 6]);
  assert.equal(barAlpha(Infinity, false, false), 0);
  assert.equal(barAlpha(0, false, false), 1);
  assert.equal(barAlpha(2.9, false, false), 1);
  assert.ok(barAlpha(3.2, false, false) > 0 && barAlpha(3.2, false, false) < 1);
  assert.equal(barAlpha(3.5, false, false), 0);
  assert.equal(barAlpha(Infinity, true, false), 1);
  assert.equal(barAlpha(Infinity, false, true), 1);
  const mk = (n, hp = 10) => Array.from({ length: n }, (_, i) => ({ id: i, hp, maxHp: 20, alive: true }));
  const foes = mk(16), boss = { hp: 100, maxHp: 100, alive: true };
  const tracked = foes.map((a, i) => ({ actor: a, sinceHit: i * 0.1 }));
  tracked.push({ actor: boss, sinceHit: 0 });
  const sel = mk(1)[0], hov = foes[15];
  const out = pickBars(tracked, sel, hov, boss);
  assert.equal(out.length, 12);
  assert.equal(out[0].actor, sel);                              // the selection first, then the hover
  assert.equal(out[1].actor, hov);
  assert.ok(!out.some((o) => o.actor === boss), 'the boss keeps its top bar');
  assert.equal(out[2].actor, foes[0]);                          // then the most recently hit
  const dead = { hp: 0, maxHp: 20, alive: false };
  assert.equal(pickBars([{ actor: dead, sinceHit: 0 }], dead, null, null).length, 0);
});

test('§9.2 Edit layout: custom offsets round-trip, follow the mirror and orientation, and conflicts are reported', () => {
  for (const [w, h] of [[844, 390], [390, 844]]) {
    for (const leftHanded of [false, true]) {
      const L0 = computeLayout(w, h, { leftHanded, noDrop: true });             // as the editor lays it out
      const b = L0.buttons.meow;
      const tx0 = b.x + (leftHanded ? 10 : -10), ty0 = b.y - 6;
      const key = layoutKey('meow', L0.portrait);
      assert.equal(key, L0.portrait ? 'portrait:meow' : 'meow');
      const off = offsetFor(L0, tx0, ty0, leftHanded);
      const L1 = computeLayout(w, h, { leftHanded, noDrop: true, layout: { [key]: off } });
      assert.ok(Math.abs(L1.buttons.meow.x - tx0) <= 1 && Math.abs(L1.buttons.meow.y - ty0) <= 1, `${w}x${h} lh=${leftHanded} round-trip`);
      const plain = computeLayout(h, w, { leftHanded, noDrop: true }), other = computeLayout(h, w, { leftHanded, noDrop: true, layout: { [key]: off } });
      assert.deepEqual([other.buttons.meow.x, other.buttons.meow.y], [plain.buttons.meow.x, plain.buttons.meow.y], 'the other orientation ignores it');
      assert.deepEqual(layoutConflicts(L0), [], `${w}x${h} default layout has no conflicts`);
    }
  }
  // overlapping custom placement: the layout still separates them (>= 8 px) at any size
  for (const ts of [0.8, 1, 1.4]) {
    const L = computeLayout(844, 390, { touchSize: ts, layout: { meow: [0, 0] } });
    assert.ok(minGap(L) >= TOUCH_CFG.gap - 0.5, `ts ${ts}: gap ${minGap(L).toFixed(1)}`);
  }
  // a conflicting pair is reported
  const L = computeLayout(844, 390, {});
  L.buttons.meow.x = L.buttons.attack.x; L.buttons.meow.y = L.buttons.attack.y;
  assert.deepEqual(layoutConflicts(L, ['attack', 'meow']).sort(), ['attack', 'meow']);
});

test('§9.3 gesture classifier: strict thresholds', () => {
  const T = TOUCH_CFG;
  assert.equal(classifyGesture({ dt: 0.1, dist: 4, up: true, sinceButton: 1 }), 'tap');
  assert.equal(classifyGesture({ dt: 0.1, dist: 4, up: true, sinceButton: 0.2 }), 'none');     // too soon after a button
  assert.equal(classifyGesture({ dt: T.tapMs / 1000 + 0.05, dist: 4, up: true, sinceButton: 1 }), 'none');
  assert.equal(classifyGesture({ dt: 0.1, dist: T.tapPx + 1, up: true, sinceButton: 1 }), 'none');
  assert.equal(classifyGesture({ dt: 0.4, dist: 5, up: false, sinceButton: 1 }), 'long');
  assert.equal(classifyGesture({ dt: 0.3, dist: 5, up: false, sinceButton: 1 }), 'none');
  assert.equal(classifyGesture({ dt: 0.12, dist: 60, up: false, sinceButton: 1 }), 'swipe');
  assert.equal(classifyGesture({ dt: 0.2, dist: 60, up: false, sinceButton: 1 }), 'none');     // too slow for a swipe
});

test('§10.7 settings: every new controls / accessibility row exists with save defaults; invertY is classic-only', () => {
  for (const k of ['controlPreset', 'camZoom', 'camLockMode', 'autoAttack', 'castMode', 'edgePanSpeed', 'touchSize', 'tapToMove', 'swipeTumble',
    'leftHanded', 'buttonOpacity', 'haptics', 'hapticTaps', 'autoRiposte', 'standAutoFace', 'pathPreview', 'parryRing', 'reduceCameraMotion',
    'cursorSize', 'cursorContrast']) assert.ok(SETTING_BY_KEY[k], `setting row ${k}`);
  const st = defaultState();
  for (const d of SETTINGS) if (d.key !== 'difficulty') assert.ok(d.key in (st.settings ?? {}), `default for ${d.key}`);
  assert.equal(settingVisible(SETTING_BY_KEY.invertY, true), false);
  assert.equal(settingVisible(SETTING_BY_KEY.invertY, false), true);
  assert.equal(settingVisible(SETTING_BY_KEY.camLockMode, false), false);
  assert.equal(SETTING_BY_KEY.camLock, undefined, 'K7: the boolean camLock row is replaced by camLockMode');
  assert.equal(settingVisible(SETTING_BY_KEY.haptics, true), true);
  assert.equal(stepSetting(SETTING_BY_KEY.cursorSize, 1, 1), 1.5);
  assert.equal(formatSetting(SETTING_BY_KEY.cursorSize, 2), '×2');
});

test('settings rows filter by input device; on touch the Controls group (touch rows first) leads', async () => {
  const { visibleSettings } = await import('../../src/ui/settings.js');
  const keys = (iso, dev) => visibleSettings(iso, dev).map((d) => d.key);
  const touch = keys(true, 'touch'), kbm = keys(true, 'kbm'), pad = keys(true, 'pad');
  for (const k of ['sensitivity', 'edgePanSpeed', 'cursorSize', 'cursorContrast', 'controlPreset', 'invertY']) assert.ok(!touch.includes(k), `touch hides ${k}`);
  for (const k of ['touchSize', 'tapToMove', 'swipeTumble', 'leftHanded', 'buttonOpacity', 'haptics', 'hapticTaps']) {
    assert.ok(touch.includes(k), `touch shows ${k}`);
    if (k !== 'haptics') assert.ok(!kbm.includes(k) && !pad.includes(k), `desk hides ${k}`);
  }
  for (const k of ['edgePanSpeed', 'cursorSize', 'controlPreset']) assert.ok(kbm.includes(k) && !pad.includes(k), k);
  assert.ok(pad.includes('sensitivity') && pad.includes('haptics') && !kbm.includes('sensitivity'));
  assert.ok(keys(false, 'touch').includes('sensitivity'), 'classic keeps look sensitivity for touch drag');
  assert.equal(touch[0], 'touchSize');
  const firstNonCtl = visibleSettings(true, 'touch').findIndex((d) => d.group !== 'controls');
  assert.ok(visibleSettings(true, 'touch').slice(firstNonCtl).every((d) => d.group !== 'controls'), 'controls contiguous');
  const groupOrder = ['audio', 'controls', 'camera', 'game', 'perf', 'access'];
  const all = visibleSettings(true, null);
  assert.deepEqual(all.map((d) => d.key).sort(), SETTINGS.filter((d) => settingVisible(d, true)).map((d) => d.key).sort(), 'no device = every row');
  for (let i = 1; i < all.length; i++) assert.ok(groupOrder.indexOf(all[i].group) >= groupOrder.indexOf(all[i - 1].group), `one header per group (${all[i].key})`);
  assert.ok(touch.length < keys(true, null).length && kbm.length < keys(true, null).length);
});

test('touch layout: no button + dead ring reaches the disc around her on screen (landscape / portrait, small phones)', async () => {
  const { computeLayout, heroPoint, heroGap, heroClearR, minGap, BUTTON_PRIORITY } = await import('../../src/ui/touchLayout.js');
  for (const [w, h] of [[844, 390], [932, 430], [1180, 820], [390, 844], [667, 375], [740, 360], [375, 667]]) {
    for (const ts of [0.8, 1]) {
      const L = computeLayout(w, h, { touchSize: ts }), hero = heroPoint(w, h), cr = heroClearR(w, h);
      for (const [n, b] of Object.entries(L.buttons)) assert.ok(heroGap(b, hero, cr) >= -0.5, `${w}×${h} ts ${ts}: ${n} at ${b.x.toFixed(0)},${b.y.toFixed(0)} ${heroGap(b, hero, cr).toFixed(0)} px into her disc`);
      assert.ok(minGap(L) >= 8 - 1e-6, `${w}×${h} ts ${ts}: buttons stay 8 px apart`);
      assert.deepEqual(L.dropped, [], `${w}×${h} ts ${ts}: every button fits`);
      const c = L.cancel;
      for (const [n, b] of Object.entries(L.buttons)) assert.ok(Math.hypot(c.x - b.x, c.y - b.y) >= c.r + b.r + 8 - 0.5, `${w}×${h} ts ${ts}: ✕ chip clear of ${n}`);
    }
  }
  // the hero point follows the camera's touch framing (FRAME.herY, frameOffsetTouchX): ≈ (0.42 W, 0.48 H) landscape
  const hp = heroPoint(844, 390);
  assert.ok(Math.abs(hp.x - 354) < 6 && Math.abs(hp.y - 187) < 6, `hero ${hp.x},${hp.y}`);
  const L = computeLayout(844, 390), hero = heroPoint(844, 390);
  assert.ok(Math.hypot(L.buttons.meow.x - hero.x, L.buttons.meow.y - hero.y) >= heroClearR(844, 390) + 40 + L.buttons.meow.r - 0.5, 'Meow off the play field');
  // a custom (Edit layout) spot is the player's call and stays put
  const C = computeLayout(844, 390, { layout: { meow: [-300, -60] } });
  assert.ok(Math.abs(C.buttons.meow.x - (C.anchor.x - 300)) < 1e-9);
  // a tiny screen drops the lowest-priority buttons first, never ⚔; noDrop (the editor) keeps them all
  const S = computeLayout(568, 320, { touchSize: 1.4 });
  assert.ok(S.buttons.attack && S.dropped.length > 0, 'something had to go');
  const kept = BUTTON_PRIORITY.filter((n) => S.buttons[n]), worstKept = Math.max(...kept.map((n) => BUTTON_PRIORITY.indexOf(n)));
  for (const n of S.dropped) assert.ok(BUTTON_PRIORITY.indexOf(n) > BUTTON_PRIORITY.indexOf('ability'), `dropped ${n} before a lower-priority one (kept up to ${BUTTON_PRIORITY[worstKept]})`);
  assert.equal(Object.keys(computeLayout(568, 320, { touchSize: 1.4, noDrop: true }).buttons).length, 9);
  // HUD keep-outs: no button and no ✕ chip overlaps them (the mirrored HUD case)
  const keepOut = [{ x0: 8, y0: 6, x1: 241, y1: 170 }];
  const M = computeLayout(844, 390, { leftHanded: true, keepOut });
  const hits = (b) => { const nx = Math.max(8, Math.min(241, b.x)), ny = Math.max(6, Math.min(170, b.y)); return Math.hypot(b.x - nx, b.y - ny) < b.r; };
  for (const [n, b] of Object.entries(M.buttons)) assert.ok(!hits(b), `mirrored ${n} clear of the HUD block`);
  assert.ok(!hits(M.cancel), 'the ✕ chip clear of the HUD block');
});

test('touch stick: the floating base stays a stick radius inside the edges so a corner thumb reaches full speed', async () => {
  const { clampStickBase, stickVector } = await import('../../src/ui/touchLayout.js');
  const R = 60;
  for (const [w, h] of [[844, 390], [390, 844]]) {
    const b = clampStickBase(14, h - 14, w, h, R);
    assert.ok(b.x >= R && h - b.y >= R, `${w}×${h}: base ${b.x},${b.y}`);
    const v = stickVector(0 - b.x, h - b.y, R);                  // the thumb pushed into the corner
    assert.ok(Math.hypot(v.x, v.y) > 0.95, `${w}×${h}: full deflection ${Math.hypot(v.x, v.y).toFixed(2)}`);
    assert.deepEqual(clampStickBase(200, h / 2, w, h, R), { x: 200, y: h / 2 }, 'a mid-zone touch is not moved');
  }
});

test('§10.2 cursor probe: no walkable cell within 2 m, or only cells on islands she cannot reach (physics.reachableFrom), read unreachable', () => {
  const cam = { cursorValid: true, hover: { kind: 'ground' }, cursorGround: { x: 10, z: 0 } };
  const near = { yes: true }, reach = { v: true }, calls = [];
  const physics = {
    nav: {},
    nearestWalkable: () => (near.yes ? { x: 10, y: 0, z: 0 } : null),
    reachableFrom: (from, x, z, gap) => { calls.push([from.x, x, z, gap]); return reach.v; },
  };
  const c = new CursorController({ cam, physics, player: { pos: { x: 0, y: 0, z: 0 } } });
  const probe = () => c._probe(1);
  assert.equal(probe(), false, 'a walkable cell on her island');
  assert.deepEqual(calls[0], [0, 10, 0, 2]);
  reach.v = false; assert.equal(probe(), true, 'a roof / walled yard / far bank');
  reach.v = null; assert.equal(probe(), false, 'island audit still building: no claim');
  near.yes = false; reach.v = true; assert.equal(probe(), true, 'no walkable cell within the gap');
  delete physics.reachableFrom; near.yes = true; assert.equal(probe(), false, 'older physics: nearestWalkable only');
  physics.reachableFrom = () => { throw new Error('x'); }; assert.equal(probe(), false, 'a throwing query never sticks the grey paw');
  cam.hover.kind = 'enemy'; physics.reachableFrom = () => false; assert.equal(probe(), false, 'only over ground');
});

// ====================================================================================================== warm adventure + perf + auto-camera
// (IMPLEMENTATION_PLAN §6 ui: A:ui.1–2, M:ui.1–4, P:I1–I4; Phase W ui.W1–W7)
import nfs from 'node:fs';
import npath from 'node:path';
import { flashSpec, FLASH, LAYERS } from '../../src/ui/layers.js';
import { snapRect, rectsHash, OCCL } from '../../src/ui/occluders.js';
import { CelebrateQueue, alertedNear, rewardInfo, REWARD_ART, CELEBRATE_TIMING, pollSkip } from '../../src/ui/celebrate.js';
import { GuideModel, dotFills, GUIDE } from '../../src/ui/guide.js';
import { offerDue, OFFER } from '../../src/ui/offer.js';
import { flyPoint } from '../../src/ui/flyIcons.js';
import { HudTuck, TUCK } from '../../src/ui/hud.js';
import { countText, resultRows as resultRows2 } from '../../src/ui/results.js';
import { borderPlace, inHoles, perimeterPoint, perimeterS, ARROW_GLYPHS, ARROW } from '../../src/ui/threatArrows.js';
import { pinchStarted, PINCH, LESSON_BUTTONS, TouchControls, heartRow, HEART_ROW } from '../../src/ui/touch.js';
import { cooldownStart } from '../../src/ui/abilityBar.js';
import { titleButtons, stickerCells, STICKER_IDS, TITLE } from '../../src/ui/menus.js';
import { GLYPH_NAMES } from '../../src/ui/icons.js';
import { CELEBRATE, HUD as HUD_CFG, SETTING_VALUES, STORY, FADE_COLOR, CAMERA } from '../../src/core/config.js';

test('A:ui.1 #ui-flash: presets per ART §9.1, opacity-only spec, reduceFlashes ×0.3; the vignette is pure CSS', () => {
  assert.deepEqual(flashSpec('hurt'), { color: '#FF8FB1', alpha: 0.18, dur: 0.25 });
  assert.deepEqual(flashSpec('storm'), { color: '#E8DCFF', alpha: 0.25, dur: 0.12 });
  assert.equal(flashSpec('rescue').alpha, 0.22);
  assert.equal(flashSpec('card').color, FLASH.rescue[0], 'celebration cards flash white-gold');
  assert.ok(Math.abs(flashSpec('hurt', undefined, undefined, true).alpha - 0.18 * LAYERS.reduce) < 1e-9, 'reduce flashes scales alpha ×0.3');
  assert.deepEqual(flashSpec('#FFFFFF', 2, 9), { color: '#FFFFFF', alpha: 1, dur: LAYERS.maxDur }, 'clamped');
  assert.equal(flashSpec('', 0.5), null);
  assert.equal(flashSpec('#fff', 0), null, 'a zero-alpha flash is a no-op');
  const css = nfs.readFileSync('src/ui/ui.css', 'utf8');
  assert.match(css, /\.ui-vignette \{[^}]*radial-gradient\(120% 95% at 50% 46%, transparent 62%, #B4664A2E 100%\)/);
  assert.match(css, /@keyframes uiFlash \{ 0% \{ opacity: var\(--fa/, 'the flash animates opacity only');
});

test('UI facade: flash / screenOccluders / safeArea / celebrate / offerKitten exist and are node-safe', async () => {
  const ui = new UI(fakeCtx());
  assert.deepEqual(ui.screenOccluders(), { version: 0, rects: [] });
  assert.equal(ui.flash('hurt'), null, 'no DOM: no layer, no throw');
  assert.deepEqual(ui.safeArea, { top: 0, right: 0, bottom: 0, left: 0 });
  assert.equal(ui.celebrate('card', 'holy'), false);
  assert.equal(await ui.offerKitten(), null);
  assert.equal(ui.thumbs, null);
});

test('M:ui.1 screenOccluders: rects snap outward to the quantum; the version only bumps on a rect change', () => {
  const r = snapRect({}, 10.6, 20.2, 30.1, 41.9, 'cluster');
  assert.deepEqual(r, { x: 10, y: 20, w: 22, h: 22, kind: 'cluster' });
  assert.equal(OCCL.quantum, 2);
  const a = [snapRect({}, 0, 0, 100, 40, 'hud'), snapRect({}, 700, 300, 790, 390, 'cluster')];
  const b = [snapRect({}, 0, 0, 100, 40, 'hud'), snapRect({}, 700, 300, 790, 390, 'cluster')];
  assert.equal(rectsHash(a, 2), rectsHash(b, 2), 'same rects: same version');
  b[1].x += 2;
  assert.notEqual(rectsHash(a, 2), rectsHash(b, 2), 'a moved rect: a new version');
  b[1].x -= 2; b[1].kind = 'bar';
  assert.notEqual(rectsHash(a, 2), rectsHash(b, 2), 'the kind counts');
  assert.ok(OCCL.maxRects >= 20 && OCCL.hz <= 4, 'measured at most 4 Hz (layout reads)');
});

test('WA §7.5 / M:ui.1: lesson-veiled buttons keep their geometry: screenOccluders() rects are unchanged by reveal', () => {
  const layout = { buttons: { attack: { x: 776, y: 322, r: 48 }, jump: { x: 776, y: 198, r: 32 }, dodge: { x: 676, y: 230, r: 32 } } };
  const tc = { layout, veiled: new Set(['jump', 'dodge']) };
  const before = Object.keys(layout.buttons).filter((n) => TouchControls.prototype.occludes.call(tc, n));
  tc.veiled = null;
  const after = Object.keys(layout.buttons).filter((n) => TouchControls.prototype.occludes.call(tc, n));
  assert.deepEqual(before, after);
  assert.deepEqual(before, ['attack', 'jump', 'dodge']);
  assert.deepEqual([...LESSON_BUTTONS].sort(), ['attack', 'dodge', 'guard', 'jump', 'meow']);
});

test('M:ui.3 pinch (AUTOCAM §10.3): zoom starts only after 16 px of distance change; second finger within 400 ms', () => {
  assert.equal(PINCH.startPx, CAMERA.iso.pinch?.startPx ?? 16);
  assert.equal(PINCH.secondMs, CAMERA.iso.pinch?.secondMs ?? 400);
  assert.equal(pinchStarted(200, 210), false);
  assert.equal(pinchStarted(200, 216), true);
  assert.equal(pinchStarted(200, 184), true, 'pinch in counts too');
});

test('M:ui.2 / ui.W5 threat arrows: one glyph per telegraph kind; placed on the SafeFrame border, sliding out of holes', () => {
  for (const [kind, g] of Object.entries(TELEGRAPH.glyph)) {
    assert.equal(ARROW_GLYPHS[kind], g, `${kind} glyph follows config`);
    assert.ok(GLYPH_NAMES.includes(g), `${g} is drawn`);
  }
  const rect = { x: 10, y: 10, w: 800, h: 360 }, out = { x: 0, y: 0 };
  borderPlace(rect, 0, [], 0, out);                                   // straight right: the right border midpoint
  assert.ok(Math.abs(out.x - 810) < 1e-6 && Math.abs(out.y - 190) < 1e-6);
  const holes = new Float32Array([790, 150, 40, 80]);                 // a cluster button over that spot
  assert.equal(inHoles(810, 190, holes, 1), true);
  borderPlace(rect, 0, holes, 1, out);
  assert.equal(inHoles(out.x, out.y, holes, 1), false, 'slid out of the hole');
  assert.ok(Math.abs(out.x - 810) < 1e-6, 'still on the right border');
  assert.ok(Math.abs(out.y - 190) <= 2 * (rect.w + rect.h) * ARROW.slideMax);
  for (const sArc of [0, 100, 805, 1000, 1500, 2000]) { const p = perimeterPoint(rect, sArc, {}); assert.ok(Math.abs(perimeterS(rect, p.x, p.y) - sArc) < 1e-6, `s ${sArc}`); }
  const wall = new Float32Array([700, 0, 200, 400]);                  // a covered stretch: the nearest free corner
  borderPlace(rect, 0, wall, 1, out);
  assert.equal(inHoles(out.x, out.y, wall, 1), false);
  assert.equal(ARROW.sizeTouch, 28, '28 px on touch (AUTOCAM §7.4)');
});

test('M:ui.4 / PERF I4 / WA settings rows: camera, quality panel, calm HUD; options inside config SETTING_VALUES', () => {
  for (const k of ['camLockMode', 'camCursorLead', 'camZoom', 'camZoomPortrait', 'biggerHero', 'quality', 'fpsCap', 'batterySaver', 'hudMode', 'hitWords', 'tutorialHints', 'reduceFlashes', 'reduceCameraMotion']) {
    assert.ok(SETTING_BY_KEY[k], `row ${k}`);
  }
  for (const k of ['camLockMode', 'fpsCap', 'quality', 'hudMode']) assert.deepEqual(SETTING_BY_KEY[k].options, [...SETTING_VALUES[k]], `${k} options`);
  for (const k of ['camCursorLead', 'camZoomPortrait']) { assert.equal(SETTING_BY_KEY[k].min, SETTING_VALUES[k][0]); assert.equal(SETTING_BY_KEY[k].max, SETTING_VALUES[k][1]); }
  assert.equal(SETTING_BY_KEY.camLockMode.dev, 'kbm', 'lock modes are a desktop setting (pad / touch stay locked)');
  assert.equal(SETTING_GROUPS.perf, 'Performance');
  const ctx = ctx0();                                                 // camLockMode keeps the retired boolean in sync (K7)
  ctx.state.settings.camLock = true;
  applySetting(ctx, 'camLockMode', 'semi');
  assert.equal(ctx.state.settings.camLock, false);
  applySetting(ctx, 'camLockMode', 'locked');
  assert.equal(ctx.state.settings.camLock, true);
  assert.match(formatSetting(SETTING_BY_KEY.camLockMode, 'free', (k) => tx(ctx, k)), /^Free/);
});

test('ui.W2 celebrate: one queue, one at a time, in order; docked in combat; skip after 0.6 s; never touches time', () => {
  const q = new CelebrateQueue();
  assert.equal(q.push('card', 'holy'), true);
  assert.equal(q.push('card', 'golden'), true);
  assert.equal(q.push('card', 'golden'), false, 'duplicate dropped');
  let ev = q.update(0, false);
  assert.equal(ev.started.id, 'holy', 'first card first');
  let t = 0;
  const later = [];
  while (t < 10 && (q.cur || q.items.length)) { ev = q.update(0.05, false); t += 0.05; if (ev.started) later.push(ev.started.id); }
  assert.deepEqual(later, ['golden'], 'then the second');
  assert.ok(t >= CELEBRATE.card * 2 - 0.2, 'each card runs its 2.2 s');
  q.push('friend', 'mochi');                                          // an alerted foe within 15 m: docked
  ev = q.update(0, true);
  assert.equal(ev.started.docked, true);
  assert.equal(ev.started.fly, CELEBRATE.dockFly);
  q.clear(); q.push('sticker', 'bonk');                              // stickers never dock
  assert.equal(q.update(0, true).started.docked, false);
  assert.equal(q.skip(), false);                                      // skip only after skipAfter
  q.update(CELEBRATE.skipAfter + 0.01, false);
  assert.equal(q.skip(), true);
  assert.ok(q.cur.dur <= q.cur.t + CELEBRATE_TIMING.fly + 1e-9, 'skipping flies home now');
  const ctx = { player: { pos: { x: 0, y: 0, z: 0 } }, enemies: { list: [{ alive: true, alerted: true, pos: { x: 10, z: 0 } }, { alive: true, alerted: false, pos: { x: 1, z: 0 } }] } };
  assert.equal(alertedNear(ctx, 15), true);
  assert.equal(alertedNear(ctx, 9), false, 'an unalerted foe next to her does not count');
  for (const id of STICKER_IDS) { assert.ok(REWARD_ART[id], id); assert.notEqual(rewardInfo(ctx0(), 'sticker', id).title, `sticker.${id}`); }
  const k = rewardInfo(ctx0(), 'card', 'kitten', { n: 2, max: 3 }, 1);
  assert.match(k.title, /2\/3/); assert.ok(k.line.length > 0, 'a rotating kitten line (WA23)');
  const src = nfs.readFileSync('src/ui/celebrate.js', 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/timeScale|setTimeScale|setMode\(|\.pause\(/.test(src), 'celebrate.js never changes time or mode');
  assert.ok(CELEBRATE.confettiMax <= 24);
});

test('ui.W3 guide bubble: the second prompt replaces the first (one bubble); progress wiggles; done ticks; paw dots', () => {
  const g = new GuideModel();
  assert.equal(g.prompt({ speaker: 'pearl', textKey: 'tut.move', step: 1 }), 'new');
  const first = g.cur;
  assert.equal(g.prompt({ speaker: 'pearl', textKey: 'tut.move', step: 1 }), null, 'the same prompt again: nothing');
  assert.equal(g.prompt({ speaker: 'pearl', textKey: 'tut.move', step: 1, progress: 0.5 }), 'progress');
  assert.equal(g.prompt({ speaker: 'pearl', textKey: 'tut.bonk', step: 2 }), 'new');
  assert.notEqual(g.cur, first, 'replaced, never stacked');
  assert.equal(g.prompt({ speaker: 'pearl', done: true }), 'done');
  assert.equal(g.cur.doneT, GUIDE.doneShow);
  assert.deepEqual(dotFills({ n: 2, of: 7, half: true }), [1, 1, 0.5, 0, 0, 0, 0]);
  assert.deepEqual(dotFills([1, 0.5, 0]), [1, 0.5, 0]);
  assert.deepEqual(dotFills(null), []);
  assert.equal(GUIDE.chipAfter, 6); assert.equal(GUIDE.idleDemo, 8); assert.equal(GUIDE.demoCycles, 2);
});

test('ui.W4 calm HUD: combat, then 4 s calm, then tucked; Valor >= 50 stays; lives at <= 3; counters on change; full mode', () => {
  assert.equal(TUCK.after, HUD_CFG.tuck.after);
  const h = new HudTuck(), s = { mode: 'calm', combat: true, valor: 0, lives: 9 };
  let o = h.update(0.1, s);
  assert.equal(o.grit, true); assert.equal(o.valor, true);
  s.combat = false;
  for (let t = 0; t < TUCK.after - 0.2; t += 0.1) o = h.update(0.1, s);
  assert.equal(o.grit, true, 'still up just before 4 s');
  for (let t = 0; t < 0.5; t += 0.1) o = h.update(0.1, s);
  assert.equal(o.grit, false, 'tucked after 4 s calm'); assert.equal(o.valor, false); assert.equal(o.lives, false); assert.equal(o.counts, false);
  o = h.update(0.1, { ...s, valor: 50 }); assert.equal(o.valor, true, 'Valor >= 50 shows');
  o = h.update(0.1, { ...s, guarding: true }); assert.equal(o.grit, true, 'the Stand shows Grit');
  o = h.update(0.1, { ...s, lives: 3 }); assert.equal(o.lives, true, 'lives at <= 3');
  h.countsChanged(); o = h.update(0.1, s); assert.equal(o.counts, true, 'a pickup pops the counters');
  for (let t = 0; t < TUCK.popShow; t += 0.1) o = h.update(0.1, s);
  assert.equal(o.counts, false, 'for 3 s');
  o = h.update(0.1, { ...s, hub: true }); assert.equal(o.counts, true, 'always in the hub');
  o = h.update(0.1, { ...s, mode: 'full' }); assert.ok(o.grit && o.valor && o.lives && o.counts, 'full = the old HUD');
});

test('X21 cooldown sweeps: one CSS animation per cooldown start, never per-frame writes', () => {
  const sl = { wasCd: false, lastCd: 0 };
  assert.deepEqual(cooldownStart(sl, 3, 6), { deg: 180, dur: 3 });
  Object.assign(sl, { wasCd: true, lastCd: 3 });
  assert.equal(cooldownStart(sl, 2.98, 6), null, 'a running cooldown: nothing to write');
  assert.deepEqual(cooldownStart(sl, 5, 6), { deg: 300, dur: 5 }, 're-triggered: restart');
  assert.equal(cooldownStart(sl, 0, 6), null);
  const src = nfs.readFileSync('src/ui/abilityBar.js', 'utf8');
  assert.ok(!/SWEEP_DT|setVar\(sl\.sweep, '--cd'/.test(src), 'no 30 Hz --cd writes');
  assert.match(nfs.readFileSync('src/ui/ui.css', 'utf8'), /@property --cd \{ syntax: '<angle>'/);
});

test('ui.W5 results: every rank maps to a results.rank.* word; rows count up; no backdrop-filter; no letter grades', () => {
  const ctx = ctx0();
  for (const [id, key] of Object.entries(RANK_KEYS)) {
    assert.equal(key, `results.rank.${id}`);
    assert.equal(resultRows2(ctx, { rank: id }).rankText, tx(ctx, key));
  }
  assert.deepEqual(Object.keys(RANK_KEYS).sort(), ['clawsome', 'mewtiful', 'pawsome', 'purrfect']);
  const row = { id: 'fish', value: '+128', num: 128 };
  assert.equal(countText(row, 0), '+0'); assert.equal(countText(row, 0.5), '+64'); assert.equal(countText(row, 1), '+128');
  assert.equal(countText({ id: 'time', value: '12:34', num: 754 }, 0.5), '6:17');
  assert.equal(countText({ id: 'letter', value: '✓', num: null }, 0), '✓', 'non-numeric rows just pop in');
  const css = nfs.readFileSync('src/ui/ui.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/backdrop-filter\s*:/.test(css), 'no backdrop-filter over the canvas (ART §9.1)');
  assert.match(css, /\.ui-results \{ background: radial-gradient\(circle at 50% 40%, #FFF1E2CC, #FFB98ACC\)/);
});

test('ui.W6 Kitten-mode offer: after 2 knock-outs in 3 min, once per save, never on Kitten / Nine Lives', () => {
  assert.equal(OFFER.knockouts, STORY.kittenOffer.knockouts);
  assert.equal(OFFER.flag, 'seen.offer.kitten');
  assert.equal(offerDue({ difficulty: 'knight', kos: [10], now: 20 }), false, 'one knock-out');
  assert.equal(offerDue({ difficulty: 'knight', kos: [10, 100], now: 120 }), true, 'two within the window');
  assert.equal(offerDue({ difficulty: 'knight', kos: [10, 300], now: 320 }), false, 'too far apart');
  assert.equal(offerDue({ difficulty: 'knight', kos: [10, 100], now: 120, seen: true }), false, 'not shown twice');
  assert.equal(offerDue({ difficulty: 'kitten', force: true }), false);
  assert.equal(offerDue({ difficulty: 'nine', force: true }), false);
  assert.equal(offerDue({ difficulty: 'knight', force: true }), true, "story's practice rule forces it");
});

test('ui.W1 title: one button without a save, two with one; no picker; the dark shade is gone', () => {
  assert.deepEqual(titleButtons(false), ['play']);
  assert.deepEqual(titleButtons(true), ['continue', 'newAdventure']);
  assert.ok(TITLE.logo === 1.0 && TITLE.buttons === 1.4);
  assert.match(tx(ctx0(), 'title.tap'), /tap/i);
  const src = nfs.readFileSync('src/ui/menus.js', 'utf8');
  assert.ok(!/class="title-shade"/.test(src), 'no .title-shade element');
  const home = src.slice(src.indexOf('_openHome() {'), src.indexOf('_homeLabel() {'));
  assert.ok(home.length > 100 && !/openNewGame|difficulty\./.test(home), 'no difficulty picker on the title home');
  const css = nfs.readFileSync('src/ui/ui.css', 'utf8');
  assert.match(css, /\.title-rim \{[^}]*radial-gradient\(120% 90% at 50% 40%, #FFF8EE00 55%, #FFD9B866 100%\)/);
});

test('ui.W7 / WA §2.7 dark-literal lint: no colour with HSV V < 0.20 in src/ui outside the cocoa ink family', () => {
  const allow = new Set(['#2A1E18', '#3A2A1F', '#4A2A1F', '#5A3B2E', '#3A2630', '#3A2346']);
  const bad = [];
  for (const f of nfs.readdirSync('src/ui')) {
    if (!/\.(js|css)$/.test(f)) continue;
    const s = nfs.readFileSync(npath.join('src/ui', f), 'utf8');
    for (const m of s.matchAll(/#([0-9a-fA-F]{3,8})\b/g)) {
      const h = m[1];
      if (![3, 4, 6, 8].includes(h.length)) continue;
      const full = (h.length <= 4 ? [...h.slice(0, 3)].map((c) => c + c).join('') : h.slice(0, 6)).toUpperCase();
      const v = Math.max(parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)) / 255;
      // Token Tails night (TOKENTAILS-PLAN §2.6): the title rim, loading veil and menu scrims in ui.css only
      if (f === 'ui.css' && ['0B0820', '17112F'].includes(full)) continue;
      if (v < 0.2 && !allow.has(`#${full}`)) bad.push(`${f}: ${m[0]}`);
    }
  }
  assert.deepEqual(bad, []);
  assert.equal(CINEMA.fade, FADE_COLOR);
  assert.match(nfs.readFileSync('src/ui/ui.css', 'utf8'), /\.cin-bar \{ background: #3A2630; \}/, 'cocoa-plum letterbox');
});

test('WA §5.4 sticker book + §5.5 fly-to-HUD: stickers read save flags; the flight is the quadratic Bézier 120 px above', () => {
  const ctx = ctx0();
  ctx.state.setFlag?.('sticker.bonk', true);
  const cells = stickerCells(ctx);
  assert.equal(cells.length, STICKER_IDS.length);
  assert.equal(cells.find((c) => c.id === 'bonk').owned, !!ctx.state.getFlag?.('sticker.bonk'));
  const mid = flyPoint(0.5, 200, 100, 120);
  assert.equal(mid.x, 100); assert.equal(mid.y, 50 - 60, 'apex lifted by half the control offset');
  const end = flyPoint(1, 200, 100, 120);
  assert.deepEqual([end.x, end.y], [200, 100]);
});

test('PERF I2 / ART G17: every boot font is a small woff2 (no Cinzel / Uncial / MedievalSharp in ui code)', () => {
  const css = nfs.readFileSync('src/ui/fonts.css', 'utf8');
  assert.ok(!/Cinzel|Uncial|MedievalSharp/.test(css));
  assert.match(css, /--f-round:\s*'Nunito', 'Fredoka'/); assert.match(css, /--f-display:\s*'Passion One'/);
  let total = 0;
  for (const f of FONT_FILES) { const sz = nfs.statSync(npath.join('public/assets', f.file)).size; total += sz; assert.ok(sz < 100 * 1024, `${f.file} ${sz} B`); }
  assert.ok(total < 200 * 1024, `all faces ${total} B`);
});

// ------------------------------------------------------------------ Token Tails brand (TOKENTAILS-PLAN §2.3, §2.6, §5.5)
test('logo: the bow ties on the first "O"; a title without one gets it on the first letter', () => {
  const o = Icons.logoHtml('SWORDCAT');
  assert.equal((o.match(/logo-bow/g) ?? []).length, 1);
  assert.match(o, /<span class="logo-l logo-o" style="--i:2">O<span class="logo-bow">/);
  const pk = Icons.logoHtml('PINK PAW KNIGHT', 'A Token Tails Adventure');
  assert.equal((pk.match(/logo-bow/g) ?? []).length, 1, 'exactly one bow');
  assert.match(pk, /<span class="logo-l logo-first" style="--i:0">P<span class="logo-bow">/);
  assert.ok(!/logo-o/.test(pk));
  assert.match(pk, /&nbsp;/); assert.match(pk, /logo-sub">A Token Tails Adventure</);
  assert.match(Icons.logoHtml('  ox'), /--i:2">o<span class="logo-bow"/, 'lower-case o counts');
  assert.match(Icons.logoHtml(' KIT'), /logo-first" style="--i:1">K/, 'leading spaces are skipped');
  assert.ok(!/logo-bow/.test(Icons.logoHtml('')), 'empty title: no bow, no crash');
  const escd = Icons.logoHtml('A<B');
  assert.ok(escd.includes('style="--i:1">&lt;</span>') && !escd.includes('<B'), 'letters are escaped');
  assert.match(Icons.logoHtml(), /logo-first/, 'the default is the Token Tails title');
});

test('catnip and snack icons keep their ids (fish / milk) with the new art', () => {
  const one = Icons.fish(), ten = Icons.fish(true);
  for (const svg of [one, ten]) { assert.match(svg, /class="ico-fish ico-catnip/); assert.match(svg, /<\/svg>$/); }
  assert.ok(!/is-gold/.test(one) && /is-gold/.test(ten), 'golden catnip for 10');
  assert.ok(/#FFCC55/.test(ten) && !/#FFCC55/.test(one));
  const full = Icons.milkBottle(true), empty = Icons.milkBottle(false);
  assert.match(full, /class="ico-milk ico-snack"/); assert.match(empty, /class="ico-milk ico-snack"/);
  assert.ok(full.length > empty.length, 'the empty tin is an outline');
  // Clementine's head: ivory, crimson eyes, pink bow; kittens keep their stripes when asked
  const clem = Icons.catHead();
  assert.ok(clem.includes('#F3EEE6') && clem.includes('#B3212F') && clem.includes(Icons.PINK) && !clem.includes('#D4935A'));
  assert.match(Icons.catHead({ deep: '#9A8B6E', bow: false }), /stroke="#9A8B6E"/);
  assert.ok(!Icons.sleepingCat().includes('#D4935A'), 'the game-over cat is the ivory coat');
  const ctx = ctx0();
  assert.equal(catnipLabel(ctx, 7), tx(ctx, 'shop.cost', { n: 7 }), 'the shop cost copy');
  ctx.strings = { has: (k) => k === 'shop.cost', t: (k, v) => `${v.n} catnip` };
  assert.equal(catnipLabel(ctx, 7), '7 catnip');
});

test('credits: "Not included" sections are skipped; team and Pink Paw lines on top', () => {
  const md = '# Licenses\n\n## Fonts\n- Nunito, OFL\n\n## Not included (never shipped)\n- memecoin pack\n### Sub of it\n- also hidden\n\n## Music\n- CC0 song\n'
    + '## **Not Included** either\n| a | b |\n|---|---|\n| hidden | row |\n';
  const html = licensesHtml(md);
  assert.ok(!/memecoin|also hidden|Not included|Sub of it|hidden/i.test(html), html);
  assert.match(html, /Nunito, OFL/); assert.match(html, /<h4>Music<\/h4>/); assert.match(html, /CC0 song/);
  assert.match(licensesHtml('## Not included\n- x\n# Top\n- y'), /<h4>Top<\/h4><p>y<\/p>/, 'a higher heading ends the skip');
  const ctx = ctx0();
  ctx.strings = { has: (k) => k === 'credits.team', t: () => 'Token Tails' };
  const base = creditsTopHtml(ctx);
  assert.match(base, /class="cr-team"/);
  assert.ok(!/credits\.pinkpaw|cr-pinkpaw/.test(base), 'no raw key when strings lacks credits.pinkpaw');
  const S = { 'credits.team': 'Token Tails', 'credits.pinkpaw': 'Four kittens share names with real Pink Paw cats.', 'title.foot': 'A Token Tails game' };
  ctx.strings = { has: (k) => k in S, t: (k) => S[k] ?? k };
  const top = creditsTopHtml(ctx);
  assert.ok(top.indexOf('cr-team') < top.indexOf('cr-pinkpaw'));
  assert.match(top, /Token Tails/); assert.match(top, /Pink Paw/);
  const brand = coBrandHtml({ ...ctx, assets: { url: (p) => `./assets/${p}` } });
  assert.match(brand, /<img class="tt-logo" src="\.\/assets\/ui\/tokentails-logo\.webp" alt=""/);
  assert.match(brand, /A Token Tails game/);
  assert.equal(controlLabel(ctx, 'milk', 'Snack Break'), 'Snack Break', 'built-in label without a controls.* key');
  ctx.strings = { has: (k) => k === 'controls.milk', t: () => 'Snack time' };
  assert.equal(controlLabel(ctx, 'milk', 'Snack Break'), 'Snack time');
});

test('embed mode (<html data-embed="1">): no Quit to Title in the pause menu, no fullscreen request', () => {
  assert.equal(embedMode(null), false);
  assert.equal(embedMode({ documentElement: { dataset: {} } }), false);
  assert.equal(embedMode({ documentElement: { dataset: { embed: '0' } } }), false);
  assert.equal(embedMode({ documentElement: { dataset: { embed: '1' } } }), true);
  assert.equal(embedMode(), false, 'node: no document');
  assert.deepEqual(pauseExtras({ hub: true }), ['hub', 'quit']);
  assert.deepEqual(pauseExtras({ hub: true, embed: true }), ['hub']);
  assert.deepEqual(pauseExtras({ embed: true }), []);
  assert.deepEqual(pauseExtras(), ['quit']);
  const src = nfs.readFileSync('src/ui/menus.js', 'utf8');
  assert.match(src, /!document\.fullscreenElement && !embedMode\(\)/, 'the touch fullscreen request is skipped in embed mode');
});

test('requests/ui.md: pathPreview is a 3-way choice (Auto / On / Off) inside config SETTING_VALUES', async () => {
  const { SETTING_VALUES } = await import('../../src/core/config.js');
  const row = SETTING_BY_KEY.pathPreview;
  assert.equal(row.type, 'choice');
  assert.deepEqual(row.options, ['auto', 'on', 'off']);
  for (const o of row.options) assert.ok(SETTING_VALUES.pathPreview.includes(o), o);
  assert.equal(stepSetting(row, 'auto', 1), 'on');
  assert.equal(stepSetting(row, 'on', 1), 'off');
  assert.equal(stepSetting(row, 'off', -1), 'on');
});

test('PERF §10.2 boot shell diet: ui never statically imports the camera rig, the picker or physics; hub panels load lazily', async () => {
  const files = nfs.readdirSync('src/ui').filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const src = nfs.readFileSync(npath.join('src/ui', f), 'utf8');
    assert.ok(!/^import[^;]*from '\.\.\/(camera|physics)\//m.test(src), `${f} imports camera / physics statically`);
  }
  const ui = nfs.readFileSync('src/ui/UI.js', 'utf8');
  assert.ok(!/^import[^;]*from '\.\/(shops|questBoard|shopArt)\.js'/m.test(ui), 'shops / Quest Board are dynamic imports');
  // the mirrored constants still match their owners
  const { FRAME, isoFrameOffset } = await import('../../src/camera/IsoRig.js');
  const { HER_Y, heroPoint } = await import('../../src/ui/touchLayout.js');
  assert.equal(HER_Y, FRAME.herY);
  const hp = heroPoint(844, 390, false);
  assert.ok(Math.abs(hp.y - 390 * (0.5 + isoFrameOffset(390, 0, false))) < 1e-9);
  const hpp = heroPoint(390, 844, true);
  assert.ok(Math.abs(hpp.y - 844 * (0.5 + isoFrameOffset(844, 0, true))) < 1e-9);
  const { HUB_LEVEL } = await import('../../src/ui/questBoard.js');
  assert.match(ui, new RegExp(`const HUB_LEVEL = '${HUB_LEVEL}'`));
  const { canvasRect } = await import('../../src/ui/hpBars.js');
  const r = canvasRect({ renderer: null });
  assert.ok(r.width > 0 && r.height > 0 && r.left === 0);
});

test('ui.W2: rewards are not double-burst: fx bursts on `reward` / `kitten:rescued`, the ui only for its own cards', async () => {
  const { Celebrate } = await import('../../src/ui/celebrate.js');
  const { CelebrateQueue } = await import('../../src/ui/celebrate.js');
  const q = new CelebrateQueue();
  q.push('card', 'holy', null, 'reward');
  q.push('card', 'shard', { n: 1 }, 'ui');
  assert.equal(q.items[0].src, 'reward');
  assert.equal(q.items[1].src, 'ui');
  assert.equal(typeof Celebrate, 'function');
  const src = nfs.readFileSync('src/ui/celebrate.js', 'utf8');
  assert.match(src, /c\.src !== 'reward' && c\.src !== 'kitten'/);
  assert.ok(!/burst\?\.\('confetti'/.test(src), 'no second confetti burst');
});

test('integrator: WA §7.5 a re-veil after the idle lift keeps the lessons already taught', async () => {
  const { UI: UIClass } = await import('../../src/ui/UI.js');
  const calls = [];
  const touch = { veiled: null, veil(t) { this.veiled = t ? new Set(['attack', 'guard', 'dodge', 'jump', 'meow'].filter((a) => !t.includes(a))) : null; calls.push(t ? [...t] : null); }, reveal(a) { this.veiled?.delete(a); } };
  const self = { touch, ctx: { state: { getFlag: () => false } }, _taught: undefined };
  const lesson = (p) => UIClass.prototype._lesson.call(self, p);
  lesson({ speaker: 'pearl', action: 'attack' });
  lesson({ speaker: 'pearl', action: 'meow' });
  touch.veil(null);                                   // the 3 s idle lift
  lesson({ speaker: 'pearl', action: null, step: 'praise' });
  assert.ok(!touch.veiled.has('meow') && !touch.veiled.has('attack'), `re-veil keeps attack + meow (${[...touch.veiled]})`);
  assert.ok(touch.veiled.has('jump'), 'untaught buttons stay veiled');
});

// ------------------------------------------------------------------ Phase W review fixes (ui)
import { bonkedShown } from '../../src/ui/hud.js';
import { hintLayerOn } from '../../src/ui/prompts.js';
import { isTip } from '../../src/ui/toasts.js';
import { revealShow, inPractice, companionJoined, LESSON_SLOTS } from '../../src/ui/reveal.js';
import { pulse, flag } from '../../src/ui/dom.js';

/** The declarations of the LAST rule in ui.css whose selector list is exactly `sel` (cascade order). */
function cssRule(sel, has = null) {
  const css = nfs.readFileSync('src/ui/ui.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m, last = null;
  while ((m = re.exec(css))) if (m[1].trim() === sel && (!has || has.test(m[2]))) last = m[2];
  return last;
}

test('review: the guide bubble / offer are centred without a transform and clamped to the SafeFrame (portrait 390 px)', () => {
  for (const sel of ['.ui-guide', '.ui-offer']) {
    const r = cssRule(sel);
    assert.ok(r, `${sel} rule`);
    // popIn ends on `transform: none`: a translateX(-50%) centring was wiped, so the bubble ran off the right edge
    assert.ok(!/transform\s*:/.test(r), `${sel} must not centre with a transform (${r})`);
    assert.match(r, /left:\s*0;\s*right:\s*0;\s*margin:\s*0 auto/);
    assert.match(r, /width:\s*min\(420px,\s*calc\(100vw - 32px/);
  }
  // the fixture: the box the rules lay out at phone widths stays inside the viewport with 16 px gutters
  for (const [vw, vh] of [[390, 844], [844, 390], [360, 740], [1280, 720]]) {
    const w = Math.min(420, vw - 32), left = (vw - w) / 2;
    assert.ok(left >= 16 - 1e-9 && left + w <= vw - 16 + 1e-9, `${vw}x${vh}: ${left}..${left + w}`);
  }
  assert.match(cssRule('.gd-say'), /overflow-wrap:\s*anywhere/);              // the line wraps instead of clipping
  assert.match(cssRule('.gd-dots'), /flex-wrap:\s*wrap/);                     // all 7 paw dots stay on screen
  assert.ok(!/transform\s*:/.test(cssRule('.ui-prompt') ?? ''), 'the HOLD prompt is not centred by a transform either');
});

test('review: "BONKED!" only after the final hit: never while the boss still has HP', () => {
  assert.equal(bonkedShown({ hp: 40, alive: true }, true), false);           // a defeat signal mid-fight (debug / hand-off)
  assert.equal(bonkedShown({ hp: 400, alive: true }, true), false);
  assert.equal(bonkedShown({ hp: 0, alive: true }, true), true);
  assert.equal(bonkedShown({ hp: 12, alive: false }, true), true);
  assert.equal(bonkedShown({ hp: 0, alive: false }, false), false);          // no defeat, no stamp
  for (let hp = 1; hp <= 100; hp += 7) assert.equal(bonkedShown({ hp, alive: true }, true), false, `hp ${hp}`);
});

test('review: hint / prompt layers show in live play only (never in a scene, a dialogue, the letterbox or a menu)', () => {
  const play = { hud: true, meme: false, mode: 'play', dialog: false, letterbox: false, menu: false, cinema: false };
  assert.equal(hintLayerOn(play), true);
  for (const [k, v] of [['mode', 'cutscene'], ['mode', 'dialog'], ['mode', 'menu'], ['mode', 'memecam'], ['dialog', true], ['letterbox', true], ['menu', true], ['cinema', true], ['meme', true], ['hud', false]]) {
    assert.equal(hintLayerOn({ ...play, [k]: v }), false, `${k}=${v}`);
  }
});

test('review: gameplay tips go one at a time, wait while the guide talks or a scene plays, other toasts are not held', () => {
  assert.ok(isTip('tut.valor', 'hint') && isTip('tut.reflect', null) && !isTip('toast.kitten', null));
  const q = new ToastQueue();
  q.push('Hold RMB near foes to fill Valor.', null, true);
  q.push('Parry the bolt to send it back!', null, true);
  q.push('Kitten found!', 'kitten');
  assert.deepEqual(q.shown.map((t) => t.text), ['Hold RMB near foes to fill Valor.', 'Kitten found!']);   // never two tips stacked
  q.update(TOAST.life + 0.01);
  assert.deepEqual(q.shown.map((t) => t.text), ['Parry the bolt to send it back!']);
  const h = new ToastQueue();
  h.tipHold = true;
  h.push('tip', null, true); h.push('Saved', 'seal');
  assert.deepEqual(h.shown.map((t) => t.text), ['Saved']);
  h.tipHold = false; h.update(0.01);
  assert.deepEqual(h.shown.map((t) => t.text), ['Saved', 'tip']);
});

test('review: practice reveal on every device: keycaps per lesson; milk, Valor, Golden and the kitten slot wait', () => {
  const r0 = revealShow({ practice: true, taught: [] });
  for (const a of LESSON_SLOTS) assert.equal(r0[a], false, a);
  assert.ok(!r0.milk && !r0.valor && !r0.golden && !r0.ability && !r0.grit && !r0.attack);
  const r1 = revealShow({ practice: true, taught: ['attack', 'jump', 'guard'] });
  assert.ok(r1.attack && r1.jump && r1.guard && r1.grit && !r1.dodge && !r1.meow && !r1.milk && !r1.valor);
  const r2 = revealShow({ practice: false, taught: null });
  for (const k of [...LESSON_SLOTS, 'attack', 'ability', 'golden', 'milk', 'valor', 'grit']) assert.equal(r2[k], true, k);
  // practice = the tutorial runs, or the practice-field spawn before Morning Practice is over
  const flags = new Set();
  const ctx = { state: { getFlag: (f) => flags.has(f), levelId: 'meadow' }, levels: { current: { id: 'meadow', spawnId: 'practice' } }, story: { tutorial: { active: false } } };
  assert.equal(inPractice(ctx), true);
  ctx.levels.current.spawnId = 'start';
  assert.equal(inPractice(ctx), false);                                      // a debug spawn elsewhere keeps the full bar
  ctx.story.tutorial.active = true;
  assert.equal(inPractice(ctx), true);
  flags.add('prologue.practice');
  assert.equal(inPractice(ctx), false);
  // the kitten slot: Mochi only once D-01 sets meadow.mochi; kittens without a join scene always
  assert.equal(companionJoined(ctx, 'mochi'), false);
  flags.add('meadow.mochi');
  assert.equal(companionJoined(ctx, 'mochi'), true);
  assert.equal(companionJoined(ctx, 'marmalade'), true);
  // review: one source of truth with the companion system (Q casts for any unlocked kitten, flag or not)
  const ctx2 = { state: { getFlag: () => false, companions: { unlocked: ['mochi'], active: ['mochi'] } } };
  assert.equal(companionJoined(ctx2, 'mochi'), true);
  assert.equal(companionJoined(ctx2, 'sage'), false);
});

test('review: a pulsed class can be flagged off again (the stray fly-to-HUD fish over the letterbox)', () => {
  const mk = () => {
    const set = new Set();
    return { classList: { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c), toggle: (c, on) => (on ? set.add(c) : set.delete(c)) }, set };
  };
  const e = mk();
  flag(e, 'is-on', false);
  pulse(e, 'is-on');
  assert.ok(e.set.has('is-on'));
  flag(e, 'is-on', false);                       // the flight landed: this used to be a no-op (stale flag cache)
  assert.ok(!e.set.has('is-on'));
  const b = mk();
  pulse(b, 'is-bonked'); flag(b, 'is-bonked', false);
  assert.ok(!b.set.has('is-bonked'), 'a stamp class from the last boss never sticks on the next boss bar');
});

test('review: wardrobe swatches derive from the characters CAPES (memeWhite is cream + pink hem)', async () => {
  const { CAPE_COLORS, CAPE_HEMS, CAPE_IDS } = await import('../../src/ui/shops.js');
  const { CAPES } = await import('../../src/characters/palette.js');
  for (const id of CAPE_IDS) { assert.equal(CAPE_COLORS[id], CAPES[id].color, id); assert.equal(CAPE_HEMS[id], CAPES[id].hem, id); }
  assert.equal(CAPE_COLORS.memeWhite, '#FFF3E2');
});

test('review: title CTA sits in the lower third above the footer; the footer has a cream pill', () => {
  const row = cssRule('.home-row', /position:\s*absolute/);
  assert.match(row, /bottom:\s*calc\(/);
  assert.ok(!/top:\s*74%/.test(row));
  const foot = cssRule('.title-foot');
  assert.match(foot, /background:\s*#FFF8EE/);
  assert.match(foot, /border-radius:\s*999px/);
});

test('TT5: a card skips only on Enter (or a tap on the card), never on attack / jump / a pad button', () => {
  const q = new CelebrateQueue();
  const acts = new Map([['confirm', { pressed: false }], ['attack', { pressed: false }], ['jump', { pressed: false }], ['interact', { pressed: false }]]);
  const input = { actions: acts, device: 'kbm' };
  q.push('card', 'holy');
  q.update(0.016, false);
  assert.ok(q.cur && !q.cur.flying);
  acts.get('confirm').pressed = true;
  assert.equal(pollSkip(q, input), null, 'too early: before skipAfter');
  acts.get('confirm').pressed = false;
  q.update(0.7, false);
  assert.equal(pollSkip(q, input), null, 'no press, no skip');
  for (const a of ['attack', 'jump', 'interact']) {
    acts.get(a).pressed = true;
    assert.equal(pollSkip(q, input), null, `${a} never skips a card`);
    acts.get(a).pressed = false;
  }
  acts.get('confirm').pressed = true;
  assert.equal(pollSkip(q, { actions: acts, device: 'pad' }), null, 'the pad A (also Jump) never skips');
  const c = pollSkip(q, input);
  assert.equal(c, q.cur, 'Enter moves the current item to its fly phase');
  const ev = q.update(0.016, false);
  assert.equal(ev.fly, c);
  assert.equal(pollSkip(q, input), null, 'already flying');
});

test('toastText: keyed toasts resolve device-aware; pre-filled or non-key text wins', () => {
  const S = { 'tut.zoom': 'Scroll to zoom.', 'tut.zoom.touch': 'Pinch to zoom.', 'tut.zoom.pad': '[Zoom] to zoom.', 'toast.n': 'Got {n}!' };
  const strings = { has: (k) => k in S, t: (k, v) => fill(S[k] ?? k, v) };
  const ctx = (device) => ({ strings, input: { device } });
  assert.equal(toastText(ctx('touch'), { key: 'tut.zoom' }), 'Pinch to zoom.');
  assert.equal(toastText(ctx('pad'), { key: 'hint', textKey: 'tut.zoom' }), '[Zoom] to zoom.');
  assert.equal(toastText(ctx('kbm'), { key: 'tut.zoom' }), 'Scroll to zoom.');
  assert.equal(toastText(ctx('touch'), { key: 'tut.zoom', text: 'Scroll to zoom.' }), 'Pinch to zoom.', 'base copy → device variant');
  assert.equal(toastText(ctx('touch'), { key: 'toast.n', vars: { n: 2 }, text: 'Got 2!' }), 'Got 2!');
  assert.equal(toastText(ctx('touch'), { key: 'toast.n', text: 'Got 3!' }), 'Got 3!', 'filled without vars: text wins');
  assert.equal(toastText(ctx('touch'), { key: 'zone:blocked', text: 'Not yet!' }), 'Not yet!');
  assert.equal(toastText(ctx('touch'), { text: 'plain' }), 'plain');
  assert.equal(toastText(ctx('touch'), null), '');
});

test('review: rat / Grizzlechop portraits wear the enemies palette (plum fur on a warm disc, not grey mice)', async () => {
  const { portraitSVG } = await import('../../src/ui/portraits.js');
  const { ENEMY_PAL } = await import('../../src/enemies/props.js');
  for (const id of ['rat', 'grizzlechop']) {
    const svg = portraitSVG(id, {});
    assert.ok(svg.includes(ENEMY_PAL.mischiefPlum), `${id} uses the rats' plum fur ${ENEMY_PAL.mischiefPlum}`);
    assert.ok(!/#9A9AA0|#A6A6AC|#D9D2C2/i.test(svg), `${id} has no grey`);
  }
  assert.ok(portraitSVG('grizzlechop', {}).includes('#E8C66A'), 'Grizzlechop keeps his captain hat');
});

test('review: interaction tags stay out of the boss bar band; Rest waits while a boss fight is on', async () => {
  const { tagY, tagAllowed } = await import('../../src/ui/prompts.js');
  assert.equal(tagY(300, 380, 0), 300, 'no band: above the object');
  assert.equal(tagY(300, 380, 120), 300, 'clear of the band: above the object');
  assert.equal(tagY(60, 140, 120), 140, 'inside the band: hangs under the object');
  assert.equal(tagY(20, 90, 120), 120, 'never higher than the band');
  assert.equal(tagAllowed('vigil', true), false);
  assert.equal(tagAllowed('vigil', false), true);
  assert.equal(tagAllowed('talk', true), true);
});

test('review: objective beacon resolves the quest step target (owner API, zones, caged kittens, anchors) and steps aside', async () => {
  const { questTarget, beaconState, BEACON, QUEST_TARGETS } = await import('../../src/ui/beacon.js');
  const out = { x: 0, y: 0, z: 0 };
  const flags = new Set();
  const ctx = {
    state: { getFlag: (f) => flags.has(f) },
    levels: { current: { def: { zones: [{ id: 'cart', at: [-14, -41] }, { id: 'forge', at: [19, -4] }, { id: 'square', at: [0, 8] }] } }, anchor: (n) => (n === 'steps' ? [0, 34, null, Math.PI] : null) },
    companions: { actors: [{ kittenId: 'mochi', pos: { x: -13, y: 0.4, z: -40 } }] },
  };
  assert.equal(questTarget(ctx, null, out), false);
  assert.equal(questTarget(ctx, 'meadow.mochi', out), true);
  assert.deepEqual([out.x, out.y, out.z], [-13, 0.4, -40], 'the caged kitten first');
  ctx.companions.actors.length = 0;
  assert.equal(questTarget(ctx, 'meadow.mochi', out), true);
  assert.deepEqual([out.x, out.z], [-14, -41], 'then its zone');
  assert.ok(Number.isNaN(out.y), 'zone height comes from the ground');
  assert.equal(questTarget(ctx, 'town.rescue', out), true); assert.equal(out.x, 19, 'the forge first');
  flags.add('town.cleared.forge');
  assert.equal(questTarget(ctx, 'town.rescue', out), true); assert.equal(out.z, 8, 'then the square');
  assert.equal(questTarget(ctx, 'town.steps', out), true, 'no steps zone here: the level anchor');
  assert.deepEqual([out.x, out.z], [0, 34]);
  assert.equal(questTarget(ctx, 'bog.pearl', out), false, 'unknown → no beacon');
  ctx.story = { questTarget: (id) => (id === 'bog.pearl' ? { x: 5, y: 1, z: 6 } : null) };
  assert.equal(questTarget(ctx, 'bog.pearl', out), true, 'the owner API wins'); assert.equal(out.x, 5);
  for (const rows of Object.values(QUEST_TARGETS)) for (const r of rows) assert.match(typeof r === 'string' ? r : r.ref, /^[zka]:/);
  const base = { world: true, has: true, boss: false, practice: false, dist: 30 };
  assert.equal(beaconState(base), 'on');
  assert.equal(beaconState({ ...base, boss: true }), 'off', 'a boss fight: the boss bar is the goal');
  assert.equal(beaconState({ ...base, practice: true }), 'on', 'TOKENTAILS-PLAN §10.2: practice is guided too (no longer off)');
  assert.equal(beaconState({ ...base, scene: true }), 'off', 'a cutscene / blocking dialogue hides it');
  assert.equal(beaconState({ ...base, dist: 3, arriveR: 2.2 }), 'on', "the target's own arriveR wins");
  assert.equal(beaconState({ ...base, dist: 2, arriveR: 2.2 }), 'off');
  assert.equal(beaconState({ ...base, world: false }), 'off');
  assert.equal(beaconState({ ...base, dist: BEACON.arriveR - 0.1 }), 'off', 'she is there');
});

test('review: the beacon edge pointer slides off HUD blocks along its border', async () => {
  const { dodgeRects, BEACON } = await import('../../src/ui/beacon.js');
  const W = 1280, H = 720, m = BEACON.edgeMargin;
  const counters = [{ x: 1000, y: 10, w: 270, h: 50 }];
  const top = dodgeRects({ x: 1100, y: m }, counters, W, H);           // on the top border, under the counters
  assert.ok(top.x < 1000 - BEACON.edgePad + 1 && top.y === m, `slides left along the top (${JSON.stringify(top)})`);
  const side = dodgeRects({ x: W - m, y: 40 }, counters, W, H);       // on the right border, beside the counters
  assert.ok(side.y >= 60 + BEACON.edgePad - 1 && side.x === W - m, `slides down along the side (${JSON.stringify(side)})`);
  const free = dodgeRects({ x: 600, y: m }, counters, W, H);
  assert.deepEqual(free, { x: 600, y: m }, 'a free spot stays');
  assert.deepEqual(dodgeRects({ x: 1, y: 2 }, null, W, H), { x: 1, y: 2 });
});

test('HUD: the base 4 hearts stay on one row on a narrow phone (shrink, not wrap); upgrades wrap to at most two rows', () => {
  const hw = 25.6, gap = 2.24;                                         // 1.6em / .14em at the 16 px floor
  // plenty of room: unchanged
  assert.deepEqual(heartRow(4, hw, gap, 200), { cols: 4, w: hw });
  // 390 × 844 / 360 × 740 portrait: ~100 / ~80 unscaled px short of ❚❚ → one row, a little smaller
  for (const room of [100, 82]) {
    const r = heartRow(4, hw, gap, room);
    assert.equal(r.cols, 4, `room ${room}: one row`);
    assert.ok(r.w < hw && r.w >= hw * HEART_ROW.minK, `room ${room}: w ${r.w.toFixed(1)}`);
    assert.ok(4 * r.w + 3 * gap <= room + 1e-9, 'fits the room');
  }
  // max-HP upgrades (8 hearts) in the same room: two rows of 4 at full size
  assert.deepEqual(heartRow(8, hw, gap, 112), { cols: 4, w: hw });
  // too many for two rows: half per row, shrunk
  const big = heartRow(12, hw, gap, 112); assert.equal(big.cols, 6); assert.ok(big.w < hw);
  assert.deepEqual(heartRow(0, hw, gap, 50), { cols: 0, w: hw });
});

test('dom: clearVar drops setVar\'s cache too, so the same value can be set again (the hearts lost --heart-w every other fit)', async () => {
  const { setVar, clearVar } = await import('../../src/ui/dom.js');
  const props = new Map();
  const e = { style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) } };
  setVar(e, '--heart-w', '20.90px');
  clearVar(e, '--heart-w');
  assert.equal(props.has('--heart-w'), false);
  setVar(e, '--heart-w', '20.90px');
  assert.equal(props.get('--heart-w'), '20.90px', 'set again after a clear');
});
