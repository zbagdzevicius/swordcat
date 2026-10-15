// tests/unit/glyphs.test.js — TT6: input glyphs (no "RMB" / "LB" text for players) and the visible Pink Paw shield.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glyphAtom, glyphHtml, glyphWords, labelParts, codeWords, ACTION_LABEL, isPlayStationPad, TOUCH_ICONS } from '../../src/ui/inputGlyph.js';
import { actionGlyph, actionGlyphHtml, actionWords, glyphText, presetGlyph, PRESET_IDS, ACTION_GLYPH } from '../../src/ui/text.js';
import { shieldSlotState, slotGlyphHtml, slotGlyphWords } from '../../src/ui/abilityBar.js';
import { pawShield, SHIELD_STATES, gritShield, shield } from '../../src/ui/icons.js';
import { shieldLook, SHIELD_FX } from '../../src/fx/ShieldBubble.js';
import { CONTROL_ROWS } from '../../src/ui/settings.js';
import { S } from '../../src/story/strings.js';
import { ONBOARDING_STRINGS } from '../../src/story/strings.onboarding.js';

const JARGON = /\b(RMB|LMB|MMB|M4|M5|LB|RB|LT|RT|L3|R3|Bksp|Ctrl)\b/;
const noSvg = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '');

test('TT6 glyph atoms: mouse buttons are a mouse with the right part lit, in plain words', () => {
  const r = glyphAtom('RMB', 'kbm');
  assert.equal(r.id, 'mouse-right'); assert.equal(r.words, 'Right mouse button'); assert.equal(r.kind, 'mouse');
  assert.match(r.html, /<svg class="ig-svg"/);
  assert.equal(glyphAtom('LMB').id, 'mouse-left');
  assert.equal(glyphAtom('MMB').id, 'mouse-middle');
  assert.equal(glyphAtom('M4').id, 'mouse-back');
  assert.equal(glyphAtom('Wheel').id, 'mouse-wheel');
  assert.equal(glyphAtom('WASD').id, 'key-wasd');
  assert.equal(glyphAtom('Q').cap, 'Q');
  assert.equal(glyphAtom('Bksp').words, 'Backspace key');
});

test('TT6 glyph atoms: pad buttons (Xbox colours, PlayStation shapes) and touch buttons (the real icons)', () => {
  assert.equal(glyphAtom('LB', 'pad').words, 'Left bumper');
  assert.equal(glyphAtom('LB', 'pad', true).words, 'L1 button');
  assert.match(glyphAtom('LB', 'pad', true).html, />L1</);
  assert.equal(glyphAtom('A', 'pad').id, 'pad-a');
  assert.equal(glyphAtom('A', 'pad', true).words, 'Cross button');
  assert.equal(glyphAtom('D-pad ↓', 'pad').id, 'pad-dpad-down');
  assert.equal(glyphAtom('R3', 'pad').words, 'Press the right stick');
  assert.equal(glyphAtom('Start', 'pad').words, 'Menu button');
  assert.equal(glyphAtom('Stand', 'touch').id, 'touch-guard');
  assert.match(glyphAtom('Stand', 'touch').html, /ico-pawshield/, 'the touch Shield glyph is the Shield button icon');
  assert.equal(glyphAtom('Pinch', 'touch').kind, 'gesture');
  for (const a of Object.keys(TOUCH_ICONS)) assert.ok(TOUCH_ICONS[a]().length > 5, a);
  assert.ok(isPlayStationPad('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'));
  assert.ok(!isPlayStationPad('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)'));
});

test('TT6 labels split into icons, joiners and words; every action has a plain word', () => {
  assert.deepEqual(labelParts('RMB / WASD'), [{ atom: 'RMB' }, { sep: '/' }, { atom: 'WASD' }]);
  assert.deepEqual(labelParts('LB + X'), [{ atom: 'LB' }, { sep: '+' }, { atom: 'X' }]);
  assert.deepEqual(labelParts('Space ×2'), [{ atom: 'Space' }, { word: '×2' }]);
  assert.deepEqual(labelParts('hold Shift'), [{ word: 'hold' }, { atom: 'Shift' }]);
  assert.equal(glyphWords('LB + X', 'pad'), 'Left bumper plus X button');
  assert.equal(glyphWords('RMB / WASD'), 'Right mouse button or W A S D keys');
  assert.equal(codeWords('Mouse2', 'RMB'), 'Right mouse button');
  assert.equal(codeWords('KeyQ', 'Q'), 'Q');
  for (const [act] of CONTROL_ROWS) assert.ok(ACTION_LABEL[act], `plain word for ${act}`);
  assert.equal(ACTION_LABEL.guard, 'Shield');
});

test('TT6 every action on every device and preset renders without jargon (icons + aria words)', () => {
  const input = (preset, device) => ({ device, codesFor: () => [] , preset });
  for (const d of ['kbm', 'pad', 'touch']) for (const act of Object.keys(ACTION_GLYPH.kbm)) {
    const h = actionGlyphHtml(act, d, input('hybrid', d));
    assert.doesNotMatch(noSvg(h), JARGON, `${d} ${act}: ${noSvg(h)}`);
    assert.doesNotMatch(actionWords(act, d), JARGON, `${d} ${act} words`);
  }
  for (const p of PRESET_IDS) for (const [act] of CONTROL_ROWS) {
    const g = presetGlyph(act, p);
    assert.doesNotMatch(noSvg(glyphHtml(g, 'kbm', { action: act })), JARGON, `${p} ${act}`);
  }
  // every icon carries plain words for screen readers
  const h = actionGlyphHtml('guard', 'kbm');
  assert.match(h, /role="img" aria-label="Right mouse button" title="Right mouse button"/);
  assert.equal(actionWords('guard', 'pad'), 'Left bumper');
  assert.equal(glyphText('Hold [Stand] to block', 'kbm'), 'Hold Right mouse button to block');
  assert.equal(glyphText('Tap [Stand] when [ShieldCue] pops!', 'touch'), 'Tap Shield button when the pink shield pops!');
});

test('TT6 the Shield copy points at something visible; no shield emoji, no "when you see the shield"', () => {
  const all = { ...S, ...ONBOARDING_STRINGS };
  for (const [k, v] of Object.entries(all)) {
    const s = typeof v === 'string' ? v : v?.default ?? '';
    if (!s) continue;
    assert.ok(!/🛡/.test(s), `${k}: shield emoji`);
    assert.ok(!/when you see the shield|right on the shield/i.test(s), `${k}: points at a shield nobody can see`);
    assert.doesNotMatch(s, /\bRMB\b|\bLMB\b/, k);
  }
  assert.match(ONBOARDING_STRINGS['tut.parry'], /\[ShieldCue\]/);
  for (const [, label] of CONTROL_ROWS) assert.doesNotMatch(label, /^Stand\b|Tumble ·/, label);
});

test('TT6 shield looks: the HUD slot, the touch button and the in-world shield agree', () => {
  assert.deepEqual(SHIELD_STATES, ['ready', 'active', 'parry', 'lockout', 'broken']);
  assert.deepEqual(shieldSlotState({}), { state: 'ready', cracks: 0 });
  assert.deepEqual(shieldSlotState({ guard: true }), { state: 'active', cracks: 0 });
  assert.deepEqual(shieldSlotState({ guard: true, parryOpen: true }), { state: 'parry', cracks: 0 });
  assert.deepEqual(shieldSlotState({ guard: true, lockout: true, grit: 2, gritMax: 3 }), { state: 'lockout', cracks: 1 });
  assert.equal(shieldSlotState({ grit: 0, gritMax: 3 }).state, 'broken');
  assert.deepEqual(shieldLook({ guarding: false }), { visible: false, state: 'ready', cracks: 0 });
  assert.deepEqual(shieldLook({ guarding: true }), { visible: true, state: 'active', cracks: 0 });
  assert.deepEqual(shieldLook({ guarding: true, parryOpen: true, grit: 1, gritMax: 3 }), { visible: true, state: 'parry', cracks: 2 });
  assert.equal(shieldLook({ guarding: true, grit: 0 }).visible, false, 'a broken shield is gone for the stagger');
  for (const st of SHIELD_STATES) assert.match(pawShield(st), new RegExp(`data-state="${st}"`));
  assert.match(pawShield('parry'), /#F2B53A/, 'gold rim while the parry window is open');
  assert.match(pawShield('active', { cracks: 2 }), /M19\.6 6\.5/, 'two cracks');
  assert.equal(shield('ready').includes('ico-pawshield'), true, 'the touch / bar shield is the paw shield');
  assert.match(gritShield('full'), /ico-grit ico-pawshield/);
  assert.ok(SHIELD_FX.size >= 0.5 && SHIELD_FX.cuePopPx > SHIELD_FX.cuePx);
});

test('TT6 the ability-bar corner badge is an icon with plain-words aria', () => {
  const hy = { device: 'kbm', codesFor: (a) => ({ guard: ['Mouse2', 'KeyQ'], ability: ['KeyG'] })[a] ?? [] };
  assert.match(slotGlyphHtml(hy, 'guard'), /data-glyph="mouse-right"/);
  assert.equal(slotGlyphWords(hy, 'guard'), 'Right mouse button');
  assert.match(slotGlyphHtml({ device: 'pad', padKind: 'ps' }, 'guard'), />L1</);
  assert.equal(actionGlyph('guard', 'kbm', hy), 'RMB', 'the binding (an internal id) is unchanged');
});
