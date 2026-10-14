// tests/unit/colorLanguage.test.js  (owner: fx) — WARM_ADVENTURE_SPEC fx.W2: the colour-language lint (WA §3.2 rules)
// and the dark-literal lint (WA §2.7 / WA30: no hex colour with HSV V < 0.20 in src/fx/** or src/ui/** outside the
// cocoa ink allowlist). Pure source / table checks; node only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TELEGRAPH, CLASS_MARKS } from '../../src/core/config.js';
import { DECAL_COLORS, DECAL_ROLES } from '../../src/fx/GroundDecals.js';
import { PINK, bowSvg } from '../../src/ui/icons.js';
import { INK_ALLOW, hexRgb, rgbHsv, isDarkLiteral, isHeroPink, isDangerHue, FX_COLORS, CONFETTI_COLORS } from '../../src/fx/palette.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HEX = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;

/** Every .js / .css file under `dir` (relative to the repo root). */
function files(dir) {
  const out = [], abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (/\.(js|mjs|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Source with comments removed (old values may be quoted in documentation; only live literals count). */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
}

/** Dark hex literals in a source: [{ hex, line }]. Fully transparent RGBA (#0000, #xxxxxx00) is not a colour. */
function darkLiterals(src) {
  const out = [], lines = stripComments(src).split('\n');
  lines.forEach((l, i) => {
    for (const m of l.matchAll(HEX)) {
      const h = m[1];
      if ((h.length === 4 && h[3] === '0') || (h.length === 8 && h.slice(6) === '00')) continue;
      if (isDarkLiteral('#' + h)) out.push({ hex: '#' + h, line: i + 1 });
    }
  });
  return out;
}

test('palette maths: hex → HSV, the cocoa allowlist, pink and danger hues', () => {
  assert.deepEqual(hexRgb('#FFF'), [1, 1, 1]);
  assert.deepEqual(hexRgb('#FF000080'), [1, 0, 0]);
  const pink = rgbHsv(hexRgb('#FF8FB1'));
  assert.ok(pink.h > 335 && pink.h < 350);
  assert.equal(isDarkLiteral('#000000'), true); assert.equal(isDarkLiteral('#1A1410'), true);
  for (const h of INK_ALLOW) assert.equal(isDarkLiteral(h), false, `${h} allowed (cocoa ink)`);
  assert.equal(isDarkLiteral('#5A4E7A'), false);
  // the scanner itself: live literals count, comments and fully transparent RGBA do not
  assert.deepEqual(darkLiterals("a = '#0B0908'; // was '#000000'\nb = '#0000'; c = '#3A2346';").map((d) => d.hex), ['#0B0908']);
  assert.equal(isHeroPink('#FF8FB1'), true); assert.equal(isHeroPink('#FF9A3D'), false);
  assert.equal(isDangerHue('#FF5A4E'), true); assert.equal(isDangerHue('#FF9A3D'), true); assert.equal(isDangerHue('#FFD34D'), false);
});

test('WA §3.2 rule 1: pink (hue 335–350°) on the ground is hers alone', () => {
  for (const [k, c] of Object.entries(DECAL_COLORS)) {
    if (isHeroPink(c)) assert.equal(DECAL_ROLES[k], 'hero', `${k} ${c} is pink but not a hero mark`);
  }
  assert.ok(isHeroPink(CLASS_MARKS.hero.color) && isHeroPink(CLASS_MARKS.heroHearts.full));
  for (const [k, c] of Object.entries(TELEGRAPH.colors)) assert.equal(isHeroPink(c), false, `telegraph ${k} must not be pink`);
  assert.equal(isHeroPink(CLASS_MARKS.companion.color), false); assert.equal(isHeroPink(CLASS_MARKS.interact.color), false);
});

test('WA §3.2 rule 2: hue 0–30° with S > 0.6 on the ground means enemy attack and nothing else', () => {
  for (const [k, c] of Object.entries(DECAL_COLORS)) {
    if (isDangerHue(c)) assert.equal(DECAL_ROLES[k], 'danger', `${k} ${c} has the danger hue but role ${DECAL_ROLES[k]}`);
  }
  assert.ok(isDangerHue(TELEGRAPH.colors.red) && isDangerHue(TELEGRAPH.colors.aoe), 'red / aoe are the danger hue');
  for (const k of ['parry', 'gold', 'aim', 'grab', 'jeer']) assert.equal(isDangerHue(TELEGRAPH.colors[k]), false, `${k} is not the danger hue`);
  for (const c of [CLASS_MARKS.hero.color, CLASS_MARKS.companion.color, CLASS_MARKS.interact.color, CLASS_MARKS.pickup.twinkle, CLASS_MARKS.pickup.gold]) {
    assert.equal(isDangerHue(c), false, `${c} (a class mark) is not the danger hue`);
  }
  for (const c of CONFETTI_COLORS) assert.equal(isDangerHue(c), false, `confetti ${c}`);
});

test('WA §3.2 rule 3 + WA2 / WA3: mint = "you can use this", sky = friends; every role key has a colour', () => {
  assert.equal(DECAL_COLORS.mint, '#9BE3C4'); assert.equal(CLASS_MARKS.interact.color, '#9BE3C4');
  assert.equal(DECAL_COLORS.sky, '#8FD3FF'); assert.equal(CLASS_MARKS.companion.color, '#8FD3FF');
  for (const [k, role] of Object.entries(DECAL_ROLES)) {
    assert.ok(DECAL_COLORS[k], `${k} has a colour`);
    if (role === 'interact') assert.equal(DECAL_COLORS[k], '#9BE3C4', `${k}: mint only`);
    if (role === 'friend') assert.equal(DECAL_COLORS[k], '#8FD3FF');
  }
  for (const k of Object.keys(DECAL_COLORS)) assert.ok(DECAL_ROLES[k], `${k} has a role`);
});

test('WA §3.2 rule 4: the ink sandwich is a 0.03 m cocoa edge at α 0.35', () => {
  assert.equal(TELEGRAPH.ink.width, 0.03); assert.equal(TELEGRAPH.ink.alpha, 0.35);
  assert.ok(INK_ALLOW.includes(TELEGRAPH.ink.color.toUpperCase()));
  assert.equal(FX_COLORS.ink, TELEGRAPH.ink.color);
});

test('WA §2.7 dark-literal lint: no hex colour with HSV V < 0.20 in src/fx/** (cocoa ink allowlist only)', () => {
  const bad = [];
  for (const f of files('src/fx')) for (const d of darkLiterals(fs.readFileSync(path.join(ROOT, f), 'utf8'))) bad.push(`${f}:${d.line} ${d.hex}`);
  assert.deepEqual(bad, [], `dark literals:\n${bad.join('\n')}`);
});

/**
 * Token Tails night (docs/TOKENTAILS-PLAN.md §2.6): the brand's night tones, allowed ONLY in src/ui/ui.css for the title
 * rim, the loading veil and the pause / game-over scrims (menus over a frozen world, never the in-world palette).
 */
const UI_NIGHT_ALLOW = Object.freeze(['#0B0820', '#17112F']);
const UI_NIGHT_FILE = path.join('src', 'ui', 'ui.css');

test('WA §2.7 dark-literal lint: no hex colour with HSV V < 0.20 in src/ui/** (ui.W7 sweep; Token Tails night in ui.css only)', () => {
  const bad = [];
  for (const f of files('src/ui')) {
    for (const d of darkLiterals(fs.readFileSync(path.join(ROOT, f), 'utf8'))) {
      if (f === UI_NIGHT_FILE && UI_NIGHT_ALLOW.includes(d.hex.slice(0, 7).toUpperCase())) continue;
      bad.push(`${f}:${d.line} ${d.hex}`);
    }
  }
  assert.deepEqual(bad, [], `dark literals:\n${bad.join('\n')}`);
});

test('Token Tails skin: night only in the menu veils, the HUD stays light, the bow stays candy pink', () => {
  const css = fs.readFileSync(path.join(ROOT, UI_NIGHT_FILE), 'utf8');
  const skin = stripComments(css.slice(css.indexOf('Token Tails skin')));
  assert.match(skin, /--tt-night:\s*#0B0820/); assert.match(skin, /--tt-parch:\s*#F7E6B8/); assert.match(skin, /--tt-gold:\s*#FFCC55/);
  // every night literal sits in a title / loading / backdrop rule or the token block, never a .hud rule
  for (const line of stripComments(css).split('\n')) {
    if (!/#0B0820|#17112F/i.test(line)) continue;
    assert.ok(!/\.hud\b|\.hud-/.test(line), `night colour in a HUD rule: ${line.trim().slice(0, 100)}`);
  }
  // the bow pinks are untouched (hero pink, WA §3.2 rule 1)
  assert.ok(!/--pink\s*:/.test(skin), 'the skin does not redefine --pink');
  assert.ok(isHeroPink(PINK), `the bow pink ${PINK} is hero pink`);
  assert.ok(bowSvg().includes(PINK) && !bowSvg().includes('#FF7AA2'), 'the bow is drawn in the candy pink, not the love pink');
});
