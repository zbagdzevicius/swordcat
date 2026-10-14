// tests/unit/brand.test.js  (owner: G3 brand) — docs/TOKENTAILS-PLAN.md §10.4 / §10.5 / §10.7 / §10.10 items 8–11:
// one title constant (core/brand.js) drives every surface; Token Tails and Pink Paw copy stays honest (banned words,
// fiction bios, credits); the catnip icon has its lilac spike; no Pink Paw logo or shelter art in the repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BRAND, PAGE_TITLE, KITTEN_FALLBACK_NAMES, brandKittenName } from '../../src/core/brand.js';
import * as strings from '../../src/story/strings.js';
import { UI_STRINGS, tx } from '../../src/ui/text.js';
import * as I from '../../src/ui/icons.js';
import { RECOVERY_TEXT, recoveryText } from '../../src/core/recovery.js';
import { stLogoHtml, PORTRAIT } from '../../src/story/Overlay.js';
import { brandHtml, absoluteSocialUrls } from '../../scripts/social-meta.mjs';
import { brandPillHtml, creditsPinkPawHtml, creditsTopHtml, wordmarkHtml, kittenCells } from '../../src/ui/menus.js';
import { kittenBio, rescueBioHtml } from '../../src/ui/portraits.js';
import { cursorCss } from '../../src/ui/cursor.js';
import { SETTING_BY_KEY } from '../../src/ui/settings.js';
import { defaultState } from '../../src/core/GameState.js';
import { glockPlan, GLOCK_PHRASES, TT_JINGLE, TT_JINGLE_SEC, noteRate } from '../../src/audio/procedural.js';
import { CONTEXT_JINGLES } from '../../src/audio/musicMap.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ctxS = (extra = {}) => ({ strings: strings, assets: { url: (p) => `./assets/${p}` }, ...extra });

/** TOKENTAILS-PLAN §10.5 "Never" + §10.10 item 10 (Token Tails CLAIMS R2, R3, R9, R10). */
const BANNED = /\b(donat\w*|treats?|airdrops?|tokens?|tails|chains?|blockchain\w*|on-?chain)\b/i;
const SHELTER_CLAIM = /\bshelters?\b[^.!?]{0,48}\b(help\w*|sav(e|es|ed|ing)|feed\w*|support\w*|fund\w*)\b|\b(help\w*|sav(e|es|ed|ing)|feed\w*|support\w*|fund\w*)\b[^.!?]{0,48}\bshelters?\b/i;
/** The brand name and the site are allowed: strip them before the scan. */
const clean = (v) => String(v ?? '').replace(/Token Tails/g, '').replace(/tokentails(\.com)?/gi, '');
const offences = (where, v) => {
  const c = clean(v), out = [];
  if (BANNED.test(c)) out.push(`${where}: ${String(v).slice(0, 120)}`);
  if (SHELTER_CLAIM.test(c)) out.push(`${where} (shelter claim): ${String(v).slice(0, 120)}`);
  return out;
};

// ------------------------------------------------------------------ the one title constant
test('BRAND: frozen, the title in one place, derived caps, Pink Paw names behind one switch', () => {
  assert.ok(Object.isFrozen(BRAND) && Object.isFrozen(BRAND.pinkPawKittens));
  assert.equal(BRAND.title, 'Pink Paw Knight');
  assert.equal(BRAND.titleCaps, BRAND.title.toUpperCase());
  assert.equal(BRAND.subtitle, 'A Token Tails Adventure');
  assert.equal(BRAND.tagline, 'One tiny knight. Eighteen lost kittens. One warm Rescue House.');
  assert.equal(BRAND.usePinkPawName, true);
  assert.equal(BRAND.rescueHouse, 'Pink Paw Rescue House');
  assert.equal(BRAND.fallbackRescueHouse, 'Pawsbury Rescue House');
  assert.deepEqual({ ...BRAND.pinkPawKittens }, { pickles: 'Judas', pebble: 'Simas', muffin: 'Raudvis', socks: 'Zare' });
  assert.equal(BRAND.shelterName, 'Pink Paw'); assert.equal(BRAND.shelterLocal, 'Rožinė pėdutė');
  assert.equal(BRAND.site, 'tokentails.com');
  assert.equal(PAGE_TITLE, `${BRAND.title} · Token Tails`);
  // a removed Pink Paw entry reverts that kitten to its old name; other ids are not brand names
  const noJudas = { ...BRAND, pinkPawKittens: { pebble: 'Simas' } };
  assert.equal(brandKittenName('pickles', noJudas), 'Pickles');
  assert.equal(brandKittenName('pebble', noJudas), 'Simas');
  assert.equal(brandKittenName('biscuit'), null);
  for (const id of Object.keys(KITTEN_FALLBACK_NAMES)) assert.equal(strings.t(`name.${id}`), BRAND.pinkPawKittens[id]);
  // the switch flips the title and the Rescue House together (source check: both read USE_PINK_PAW_NAME)
  const src = read('src/core/brand.js');
  assert.match(src, /title = USE_PINK_PAW_NAME \? PINK_PAW_TITLE : FALLBACK_TITLE/);
  assert.match(src, /rescueHouse: USE_PINK_PAW_NAME \? 'Pink Paw Rescue House' : 'Pawsbury Rescue House'/);
});

test('§10.10 item 8: "pink paw knight" appears only in src/core/brand.js (src/, index.html, vite.config.js, LICENSES.md)', () => {
  const hits = [];
  const scan = (rel) => { if (/pink paw knight/i.test(read(rel))) hits.push(rel); };
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(js|mjs|css|html|json|md|glsl)$/.test(e.name)) scan(rel);
    }
  };
  walk('src');
  for (const f of ['index.html', 'vite.config.js', 'public/assets/LICENSES.md']) scan(f);
  assert.deepEqual(hits, ['src/core/brand.js']);
});

test('BRAND drives the title screen, the dialogue fallback wordmark and the recovery panels', () => {
  assert.equal(strings.GAME_TITLE, BRAND.titleCaps);
  assert.equal(strings.GAME_SUBTITLE, BRAND.subtitle);
  assert.equal(strings.t('game.title'), BRAND.titleCaps);
  assert.equal(strings.t('title.tagline'), BRAND.tagline);
  // the title logo (menus.js builds it from tx('game.title') / tx('game.subtitle') + the tagline row)
  const menus = read('src/ui/menus.js');
  assert.match(menus, /I\.logoHtml\(tx\(ctx, 'game\.title'\), esc\(tx\(ctx, 'game\.subtitle'\)\)\)/);
  assert.match(menus, /title-tagline">\$\{esc\(tx\(ctx, 'title\.tagline'\)\)\}/);
  const strip = (h) => h.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
  assert.equal(strip(I.logoHtml()), BRAND.titleCaps, 'logoHtml default is the brand title');
  assert.equal(strip(I.logoHtml(tx(ctxS(), 'game.title'))), BRAND.titleCaps);
  assert.equal(stLogoHtml('').replace(/<[^>]*>/g, ''), BRAND.titleCaps, 'the story overlay fallback wordmark');
  assert.match(read('src/story/Overlay.js'), /String\(text \|\| BRAND\.titleCaps\)/);
  // recovery panels: the title comes from BRAND, strings still override
  assert.equal(RECOVERY_TEXT.context.title, `${BRAND.title} took a little nap`);
  assert.equal(RECOVERY_TEXT.boot.title, `${BRAND.title} could not start`);
  assert.equal(recoveryText('boot', null).title, `${BRAND.title} could not start`);
  assert.match(read('src/core/recovery.js'), /\$\{BRAND\.title\} took a little nap/);
  assert.ok(wordmarkHtml(ctxS()).includes('src="./assets/ui/tokentails-logo-text.webp"'));
  assert.ok(fs.existsSync(path.join(ROOT, 'public/assets/ui/tokentails-logo-text.webp')), 'wordmark copied');
  assert.match(read('public/assets/LICENSES.md'), /tokentails-logo-text\.webp[^\n]*© Token Tails/);
});

test('index.html: placeholders only; vite.config.js fills them from BRAND (and a changed title flows everywhere)', () => {
  const raw = read('index.html');
  for (const p of ['%PAGE_TITLE%', '%GAME_TITLE%', '%GAME_SUBTITLE%', '%GAME_TAGLINE%', '%OG_ALT%']) assert.ok(raw.includes(p), p);
  const html = brandHtml(raw, BRAND);
  assert.ok(!/%[A-Z_]+%/.test(html), 'every placeholder filled');
  assert.match(html, new RegExp(`<title>${BRAND.title} · Token Tails</title>`));
  assert.match(html, new RegExp(`property="og:title" content="${BRAND.title} · Token Tails"`));
  assert.match(html, new RegExp(`name="twitter:title" content="${BRAND.title} · Token Tails"`));
  assert.match(html, new RegExp(`aria-label="${BRAND.title} is loading"`));
  assert.match(html, new RegExp(`<noscript>[\\s\\S]*${BRAND.title} needs JavaScript`));
  assert.match(html, /property="og:image:alt" content="[^"]*Clementine[^"]*pink bow/);
  // a renamed brand renames the page, the share card and the splash (escaped)
  const other = brandHtml(raw, { ...BRAND, title: 'Kit & Bow' });
  assert.match(other, /<title>Kit &amp; Bow · Token Tails<\/title>/);
  assert.match(other, /property="og:title" content="Kit &amp; Bow · Token Tails"/);
  assert.match(other, /aria-label="Kit &amp; Bow is loading"/);
  assert.ok(!/Pink Paw Knight/.test(other));
  // the build still makes share-card URLs absolute after the brand pass
  assert.match(absoluteSocialUrls(html), /property="og:image" content="https:\/\/[^"]+og\.jpg"/);
  const cfg = read('vite.config.js');
  assert.match(cfg, /import \{ BRAND \} from '\.\/src\/core\/brand\.js'/);
  assert.match(cfg, /transformIndexHtml: \{ order: 'pre', handler: \(html\) => brandHtml\(html, BRAND\) \}/);
  assert.doesNotMatch(cfg.split('\n').find((l) => l.includes('tt-brand')) ?? '', /apply:/, 'the brand pass runs in dev and build');
  // splash: the Token Tails paw (ivory, white highlight, pink beans, maroon outline), no ginger
  for (const c of ['#F3EEE6', '#FFFFFF', '#FF7AA2', '#FFB3C7', '#4A1D08']) assert.ok(raw.includes(c), c);
});

test('§10.10 item 9: no ginger paw colours in index.html, cursor.js, Overlay.js; Clem portrait ivory + crimson', () => {
  for (const f of ['index.html', 'src/ui/cursor.js', 'src/story/Overlay.js']) {
    const src = read(f);
    for (const c of ['#F4A462', '#E89A55', '#F2A65A']) assert.ok(!src.toUpperCase().includes(c), `${f} still has ${c}`);
  }
  assert.deepEqual([...PORTRAIT.swordcat], ['#F3EEE6', '#FFF1DC', '#B3212F']);
  const paw = decodeURIComponent(cursorCss('ground'));
  for (const c of ['#F3EEE6', '#4A1D08', '#FF7AA2', '#FFFFFF']) assert.ok(paw.includes(c), `cursor ${c}`);
  assert.ok(paw.includes('#FF9EC0'), 'the pink bow cuff stays');
});

// ------------------------------------------------------------------ copy: honest, Pink Paw facts only as §10.5
test('§10.10 item 10: banned words over strings.js, text.js, LICENSES.md, index.html and strings.onboarding.js', async () => {
  const bad = [];
  for (const [k, row] of Object.entries(strings.S)) bad.push(...offences(`strings ${k}`, row.default));
  for (const [k, v] of Object.entries(UI_STRINGS)) bad.push(...offences(`text.js ${k}`, v));
  for (const [i, line] of read('public/assets/LICENSES.md').split('\n').entries()) bad.push(...offences(`LICENSES.md:${i + 1}`, line));
  const html = brandHtml(read('index.html'), BRAND).replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  const visible = [...html.matchAll(/>([^<]+)</g)].map((m) => m[1].trim()).filter(Boolean)
    .concat([...html.matchAll(/\b(?:content|aria-label|alt)="([^"]*)"/g)].map((m) => m[1]));
  for (const v of visible) bad.push(...offences('index.html', v));
  const onb = path.join(ROOT, 'src/story/strings.onboarding.js');
  if (fs.existsSync(onb)) {
    const mod = await import(pathToFileURL(onb).href);
    const walk = (v, where) => {
      if (typeof v === 'string') bad.push(...offences(where, v));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
    };
    for (const [k, v] of Object.entries(mod)) if (typeof v !== 'function') walk(v, `strings.onboarding ${k}`);
  }
  assert.deepEqual(bad, []);
  // the scan itself catches what it must
  for (const s of ['Every treat helps.', 'Donate now', 'Your play helps the shelter.', 'Shelters need your support', 'on-chain', 'Earn Tails']) {
    assert.ok(offences('probe', s).length > 0, `probe "${s}"`);
  }
  for (const s of ['A Token Tails game', 'Meet its cats at tokentails.com.', 'Pink Paw is a real cat shelter in Lithuania']) assert.deepEqual(offences('probe', s), [], s);
});

test('§10.5 credits: the Pink Paw lines exactly, one source, a new-tab link, the fiction note', () => {
  assert.equal(strings.t('credits.pinkpaw'), 'Four kittens here share their names with real cats at Pink Paw (Rožinė pėdutė). Their adventures are made up.');
  assert.equal(strings.t('credits.pinkpaw.about'), "Pink Paw (Rožinė pėdutė) is a real cat shelter in Lithuania and Token Tails' partner shelter. Meet its cats at tokentails.com.");
  assert.equal(strings.t('credits.fiction'), 'The Pink Paw Rescue House, Pawsbury and Purrhaven Isle are made up.');
  // one source: text.js reads the Pink Paw line from strings.js (no second copy of the sentence)
  assert.equal(UI_STRINGS['credits.pinkpaw'], strings.t('credits.pinkpaw'));
  assert.ok(!read('src/ui/text.js').includes('Four kittens here share'), 'no duplicated literal in text.js');
  const ctx = ctxS();
  const top = creditsTopHtml(ctx), pp = creditsPinkPawHtml(ctx);
  assert.ok(top.includes('cr-team') && top.includes('cr-pinkpaw'));
  assert.match(pp, /<p class="cr-pinkpaw-about">[^<]*Lithuania[^<]*<a href="https:\/\/tokentails\.com" target="_blank" rel="noopener">tokentails\.com<\/a>/);
  assert.match(pp, /<p class="cr-fiction">The Pink Paw Rescue House, Pawsbury and Purrhaven Isle are made up\.<\/p>/);
  assert.equal(creditsPinkPawHtml({ strings: { has: () => false, t: (k) => k } }), '', 'no raw keys without strings');
  const menus = read('src/ui/menus.js');
  assert.match(menus, /\$\{creditsTopHtml\(ctx\)\}\$\{creditsPinkPawHtml\(ctx\)\}/, 'credits render team, pinkpaw, about, fiction');
  // LICENSES.md says "this game" and carries the same Pink Paw lines
  const lic = read('public/assets/LICENSES.md');
  assert.match(lic, /^# Licenses & Attributions for this game/);
  assert.match(lic, /This game is a Token Tails game\./);
  for (const k of ['credits.pinkpaw', 'credits.pinkpaw.about', 'credits.fiction']) assert.ok(lic.includes(strings.t(k)), `LICENSES.md has ${k}`);
});

test('§10.5 bios: the four Pink Paw kittens have fictional bios marked claim:fiction; shown on the rescue card and grid', () => {
  const want = {
    pickles: 'Naps in bread baskets. Swears he was guarding them.',
    pebble: 'Blue eyes, very still, very patient. Has caught zero fish.',
    muffin: 'Climbed the Bell Tower to see the sunrise. Needed help down.',
    socks: 'Follows sunbeams across the square all afternoon.',
  };
  const src = read('src/story/strings.js').split('\n');
  for (const [id, bio] of Object.entries(want)) {
    assert.equal(strings.t(`kitten.${id}.bio`), bio, id);
    const line = src.find((l) => l.includes(`'kitten.${id}.bio'`));
    assert.ok(line && /\/\/ claim:fiction/.test(line), `kitten.${id}.bio carries // claim:fiction`);
    assert.equal(kittenBio(ctxS(), id), bio);
    assert.match(rescueBioHtml(ctxS(), id), new RegExp(`class="kit-bio".*${BRAND.pinkPawKittens[id]}`));
  }
  assert.equal(kittenBio(ctxS(), 'biscuit'), '', 'other kittens have no bio');
  assert.equal(rescueBioHtml(ctxS(), 'biscuit'), '');
  // the Kittens grid shows the bio of a found named kitten only
  const ctx = ctxS({ state: { kittens: ['pickles'] } });
  assert.ok(kittenCells(ctx).find((c) => c.id === 'pickles').found);
  assert.match(read('src/ui/menus.js'), /c\.found \? rescueBioHtml\(ctx, c\.id\) : ''/);
});

test('§10.4 copy: Rescue House from BRAND, tagline, fiction loading tips, catnip note, guide trail label, addStrings', () => {
  assert.equal(strings.t('toast.hub'), `${BRAND.rescueHouse}: kittens you rescue live here.`);
  assert.equal(strings.t('region.rescueHouse'), BRAND.rescueHouse);
  assert.ok(strings.t('npc.ttcat.1').includes(BRAND.rescueHouse) && strings.t('npc.ttcat.1').length <= 90);
  const n = strings.loadingTipCount();
  assert.ok(n >= 16, `${n} tips`);
  const tips = Array.from({ length: n }, (_, i) => strings.t(`loading.tip.${i + 1}`));
  assert.ok(tips.some((s) => s.includes('Token Tails Cat')), 'a Token Tails fiction tip');
  assert.ok(tips.some((s) => s.includes(BRAND.rescueHouse)), 'a Rescue House tip');
  for (const k of ['results.catnipNote', 'pause.catnipNote']) assert.equal(strings.t(k), 'Catnip here stays in this game for now.');
  assert.equal(strings.t('settings.guideTrail'), 'Paw-print trail');
  // addStrings: new rows and overrides (G2's strings.onboarding.js), bad input ignored
  assert.equal(typeof strings.addStrings, 'function');
  assert.equal(strings.addStrings({ 'zz.brand.test': 'Hello', 'zz.brand.test2': { default: 'Hi' }, 'zz.bad': 7 }), 2);
  assert.equal(strings.t('zz.brand.test'), 'Hello'); assert.equal(strings.t('zz.brand.test2'), 'Hi'); assert.ok(!strings.has('zz.bad'));
  assert.equal(strings.addStrings({ 'zz.brand.test': 'Again' }), 1);
  assert.equal(strings.t('zz.brand.test'), 'Again', 'later tables override');
  assert.equal(strings.addStrings(null), 0);
  delete strings.S['zz.brand.test']; delete strings.S['zz.brand.test2'];
});

test('§10.4 pause / results co-brand pill: "A Token Tails game", the catnip note, no link out', () => {
  for (const where of ['pause', 'results']) {
    const h = brandPillHtml(ctxS(), where);
    assert.match(h, /class="tt-pill tt-pill--/);
    assert.match(h, /<img class="tt-logo" src="\.\/assets\/ui\/tokentails-logo\.webp" alt=""/);
    assert.match(h, /A Token Tails game/);
    assert.match(h, /Catnip here stays in this game for now\./);
    assert.ok(!/<a\b|href=/.test(h), 'no outbound link (the host owns navigation)');
  }
  const res = read('src/ui/results.js');
  assert.match(res, /res-coin" aria-hidden="true">\$\{I\.ttCoin\(96\)\}/, 'gold coin behind the rank stamp');
  assert.match(res, /brandPillHtml\(ctx, 'results'\)/);
  assert.match(res, /glock\?\.\(CONTEXT_JINGLES\.results/);
  assert.match(read('src/ui/menus.js'), /brandPillHtml\(ctx, 'pause'\)/);
});

test('§10.7 settings.guideTrail: default on, a Game-group toggle with a label', () => {
  assert.equal(defaultState().settings.guideTrail, true);
  const row = SETTING_BY_KEY.guideTrail;
  assert.ok(row && row.type === 'toggle' && row.group === 'game');
  assert.notEqual(tx(ctxS(), row.label), row.label);
});

test('§10.7 Skip practice: a title link for new players that calls story.newGame({ skipPractice }) defensively', () => {
  const src = read('src/ui/menus.js');
  assert.match(src, /if \(!hasSave\) \{\s*const skip = el\('button', 'title-skip'/);
  assert.match(src, /typeof story\?\.newGame !== 'function'/);
  assert.match(src, /story\.newGame\(\{ difficulty: 'knight', skipPractice: true \}\)/);
  assert.match(src, /closest\?\.\('\.title-gear, \.title-skip'\)/, 'the link is not the "tap anywhere" target');
  assert.equal(strings.t('title.skipPractice'), 'Skip practice');
});

// ------------------------------------------------------------------ art + audio
test('§10.4 icons: the catnip sprig has mint leaves and a lilac spike; ttCoin and pinkPaw helpers for G1', () => {
  for (const svg of [I.fish(), I.fish(true)]) {
    assert.ok(svg.includes('#F0C5FD') && svg.includes('#9A88C9'), 'lilac flower spike');
    assert.match(svg, /class="ico-fish ico-catnip/);
  }
  assert.ok(I.fish().includes('#8FE3C0'), 'mint leaves');
  const coin = I.ttCoin(56);
  assert.match(coin, /^<svg class="ico-ttcoin" width="56" height="56"/);
  assert.ok(coin.includes('#FFCC55') && coin.includes('#4A1D08'));
  const paw = I.pinkPaw(18);
  assert.match(paw, /^<svg class="ico-pinkpaw" width="18" height="18"/);
  assert.ok(paw.includes('#FF7AA2') && paw.includes('#4A1D08'));
  assert.ok(I.pinkPaw(24, { ivory: true }).includes('#F3EEE6'));
  assert.notEqual(I.ttCoin(), I.ttCoin(), 'gradient ids are unique per call');
});

test('§10.4 jingle: procedural coin-ding + meow arpeggio, hooked on the title and results contexts', () => {
  assert.equal(GLOCK_PHRASES.ttJingle, TT_JINGLE);
  assert.deepEqual(CONTEXT_JINGLES, { title: 'ttJingle', results: 'ttJingle' });
  const plan = glockPlan('ttJingle', { volume: 0.5 });
  assert.equal(plan.length, TT_JINGLE.length);
  assert.ok(plan[1].t - plan[0].t < 0.1, 'the coin ding is two quick notes');
  assert.ok(plan[1].rate > plan[0].rate, 'the ding rises');
  const meow = plan.slice(2).map((p) => p.rate), top = Math.max(...meow);
  assert.ok(meow[0] < top && meow[meow.length - 1] < top, 'the meow rises then falls');
  for (let i = 1; i < plan.length; i++) assert.ok(plan[i].t >= plan[i - 1].t);
  assert.ok(plan.every((p) => p.gain > 0 && p.gain <= 0.5));
  assert.equal(plan[0].rate, noteRate('B5'));
  assert.ok(TT_JINGLE_SEC > 1 && TT_JINGLE_SEC < 3);
  // the old uniform phrases are unchanged
  assert.deepEqual(glockPlan(['C5', 'E5']).map((p) => p.t), [0, 0.11]);
  const menus = read('src/ui/menus.js');
  assert.match(menus, /a\.glock\?\.\(CONTEXT_JINGLES\.title/);
});

test('§10.10 item 10: no Pink Paw logo, shelter art or promo card art anywhere in the repo', () => {
  const app = '/Users/zygimantasbagdzevicius/me/tokentails-app/client/public';
  const forbidden = new Set();
  const hash = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
  for (const dir of [`${app}/logo/shelters`]) if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) forbidden.add(hash(path.join(dir, f)));
  for (const f of [`${app}/tail/cat-promo.webp`, `${app}/logo/shelter.webp`]) if (fs.existsSync(f)) forbidden.add(hash(f));
  const bad = [];
  const SKIP = new Set(['node_modules', '.git', 'dist', 'dist-test', 'research', 'tests']);
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (/shelters?[\\/]|pink-?paw\.(webp|png|jpe?g|svg)$|cat-promo/i.test(path.relative(ROOT, p))) bad.push(path.relative(ROOT, p));
      else if (forbidden.size && /\.(webp|png|jpe?g|gif|svg)$/i.test(e.name) && forbidden.has(hash(p))) bad.push(path.relative(ROOT, p));
    }
  };
  walk(path.join(ROOT, 'public'));
  walk(path.join(ROOT, 'src'));
  for (const d of ['dist', 'dist-test']) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
  assert.deepEqual(bad, []);
});
