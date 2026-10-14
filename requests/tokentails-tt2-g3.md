# TT2 G3 (brand UI) → requests to other owners

G3 changed only its own files (docs/TOKENTAILS-PLAN.md §10.4, §10.5, §10.7). The edits below make other packages'
tests and screens match. Apply them as written; each one is small and self-contained.

## 1. `tests/unit/core.test.js` (no TT2 owner; orchestrator): index.html now holds placeholders

`index.html` carries the title only as `%PAGE_TITLE%` / `%GAME_TITLE%` / … placeholders (§10.10 item 8); vite fills
them from `src/core/brand.js` through `scripts/social-meta.mjs` `brandHtml`. The F21 test reads the raw file, so it
must fill them first. In the test `F21 / §2.6: index.html is Pink Paw Knight · Token Tails …` (around line 866):

```diff
-  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
+  const { brandHtml } = await import('../../scripts/social-meta.mjs');
+  const { BRAND } = await import('../../src/core/brand.js');
+  const html = brandHtml(fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8'), BRAND);
```

Nothing else in that test changes (`#FF8FB1` splash bow, `theme-color`, OG tags, icons all stay).

## 2. `tests/unit/story.test.js` (G2)

a) The hub toast reads the Rescue House name from BRAND ("Pink Paw Rescue House" by default, §10.5). Line ~76:

```diff
-  assert.match(t('toast.hub'), /Pawsbury Rescue House/);
+  assert.match(t('toast.hub'), /(Pink Paw|Pawsbury) Rescue House/);
```

b) The banned-word test bans `fish`, but §10.5 fixes Simas's bio text as "Blue eyes, very still, very patient. Has
caught zero fish." (`kitten.pebble.bio`, `// claim:fiction`). Allow that one phrase. Line ~90 in the test `Token Tails
IP: banned display words in strings.js and ui/text.js …`:

```diff
-  const ok = (v) => v.replace(/Token Tails/g, '');                          // the brand name itself is allowed
+  const ok = (v) => v.replace(/Token Tails/g, '').replace(/caught zero fish/g, '');   // the brand name; Simas's §10.5 bio
```

## 3. `tests/unit/ui.test.js` (G1): the cursor paw is ivory now

§10.4 / §10.10 item 9 removes `#E89A55` from `cursor.js`. Line ~715 in `§10.2 cursors: …`:

```diff
-  assert.ok(decodeURIComponent(cursorCss('ground')).includes('#E89A55'), 'a soft ginger paw, no gauntlet metal (WA §3.6)');
+  assert.ok(decodeURIComponent(cursorCss('ground')).includes('#F3EEE6'), 'a soft ivory Token Tails paw, no gauntlet metal (WA §3.6)');
```

## 4. `src/ui/cinema.js` (G2): show the new fiction loading tips

`strings.js` now has `loading.tip.1` … `loading.tip.16` (14–16 are the Token Tails fiction tips; 13 was already never
picked) and exports `loadingTipCount()`. `CINEMA.tipCount` is 12, so the new tips never show:

```diff
+import { loadingTipCount } from '../story/strings.js';
 ...
-export const CINEMA = Object.freeze({ chapterSec: 3.0, lifeLostSec: 1.5, tipCount: 12, skipHold: 1.0, ...
+export const CINEMA = Object.freeze({ chapterSec: 3.0, lifeLostSec: 1.5, tipCount: loadingTipCount(), skipHold: 1.0, ...
```

(or `tipCount: 16`). No test pins 12.

## 5. `src/story/StoryManager.js` (G2): `newGame({ skipPractice })`

The title's "Skip practice" link (new saves only) calls, defensively,
`ctx.story.newGame({ difficulty: 'knight', skipPractice: true })` after closing the menus (`menus.js _skipPractice`).
Until `newGame` honours `skipPractice`, the link starts Morning Practice like Play does. If `UI.startNewGame` should own
the call instead, forward the flag there (`startNewGame({ difficulty, skipPrologue, skipPractice })` →
`story.newGame({ difficulty, skipPrologue, skipPractice })`) and tell G3 to switch the link to `this.ui.startNewGame`.

## 6. `src/ui/celebrate.js` (no TT2 owner; orchestrator): the bio on the kitten rescue card

§10.5 wants the four Pink Paw kittens' fictional bios on the rescue card. `portraits.js` exports `rescueBioHtml(ctx, id)`
('' for other kittens). The card does not know which kitten it is, so pass the id and add the bio under the line:

```diff
-import { portraitSVG } from './portraits.js';
+import { portraitSVG, rescueBioHtml } from './portraits.js';
 ...
-      const vars = k.max ? { n: Math.max(1, k.n), max: k.max } : { n: st?.kittens?.length ?? 1, max: KITTEN_IDS.length };
+      const vars = { ...(k.max ? { n: Math.max(1, k.n), max: k.max } : { n: st?.kittens?.length ?? 1, max: KITTEN_IDS.length }), kitten: id };
       this.show('card', 'kitten', vars, 'kitten');
 ...
-    setHtml(this.lineEl, info.line ? glyphify(info.line, ctx.input?.device ?? 'kbm', ctx.input) : '');
+    const bio = c.id === 'kitten' ? rescueBioHtml(ctx, c.vars?.kitten) : '';
+    setHtml(this.lineEl, (info.line ? glyphify(info.line, ctx.input?.device ?? 'kbm', ctx.input) : '') + bio);
```

`ui.css` (G3) already styles `.kit-bio` (Nunito 600, ink2; the name inside is hidden since the card title names the
kitten count). Also flag `is-on` on `lineEl` when only a bio exists: `flag(this.lineEl, 'is-on', !!info.line || !!bio)`.

## 7. `src/ui/assets.manifest.js` (no TT2 owner; orchestrator): keep the wordmark in dist

The title shows `ui/tokentails-logo-text.webp` (Token Tails wordmark, © Token Tails, recorded in LICENSES.md) on wide
screens. `scripts/prune-assets.mjs` deletes every asset no manifest lists, so without this line the production build
404s it (the smoke harness fails on HTTP ≥ 400):

```diff
   'ui/tokentails-logo.webp',
+  'ui/tokentails-logo-text.webp',
 ];
```

## 8. G1 (guidance): helpers ready

`src/ui/icons.js` exports `ttCoin(px)` (gold ":3" coin, `#FFCC55` with a maroon `#4A1D08` rim) and `pinkPaw(px, { ivory })`
(love-pink `#FF7AA2` pad, `#FFB3C7` highlights, maroon rim; `ivory: true` = the Token Tails ivory pad with pink beans).
`settings.guideTrail` defaults to `true` (GameState), has a Game-group toggle "Paw-print trail" (settings.js) and the
label `settings.guideTrail` lives in strings.js.

## 9. G6 (QA/STATUS)

- `public/og.jpg` was re-rendered (Clem's portrait with her bow, the title, the tagline, the co-brand pill):
  `node scripts/social-meta.mjs og --url http://localhost:<port>/` against a dev server.
- New smoke block `brand:surfaces` (tests/smoke/brand.mjs, order 46) and unit file tests/unit/brand.test.js.
