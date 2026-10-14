# TT3 Q1 (QA and ship) → requests to other owners

Q1 changed only its own files: `scripts/dev/onboarding-bot.mjs`, `tests/smoke.mjs` (`SMOKE_PORT`, default 4173),
`tests/smoke/brand.mjs` (390×844 added to the sizes; new `brand:rescue-bio` block), `STATUS.md`,
`docs/TOKENTAILS-PLAN.md` §10.11, and the copy in `tokentails-swordcat/client/public/swordcat-game/` (from
`npm run build:tokentails`). Bot report: `tests/shots/bot/onboarding-bot.{json,md}` (2026-10-14, build:test of the
tree after R1/R2/R3/TT3).

The bot (`npm run bot:onboarding`) reached `onboard.firstFight` in every run that got past Sir Wobble, with 0 deaths in
the first fight. **No run reached `onboard.done`.** Each of the 13 runs stopped at one of three dead ends (§1–§3 below). These
are game or guide gaps, not bot limits: a player who follows only the trail, the badge, the coin and the named keys
gets stuck in the same places.

## 1. `src/story/StoryManager.js` `_chapterOneTarget()` (G2, no TT3 owner): Mochi's cart is a dead end (10 of 13 runs)

The cage opens only after the `cart` arena is cleared (`LostKitten.js:337/475`: `needClear`), then takes 3 hits.
The guide points at the cart (`arriveR` 3) with "Help Mochi out of the cart!" and the hint "Help Mochi out of the tipped
cart". It does not point at the rats still alive in the arena (they stand 6–9 m off, often off screen) and it names no
key. Inside 3 m the trail, badge and coin are all hidden, so nothing on screen says what to do. Measured: Clem stands
1.0–4.2 m from the cage for 15+ game s; the rats in the arena are still alive.

```diff
   _chapterOneTarget() {
     const ctx = this.ctx, st = ctx.state, p = ctx.player;
     if (!st.getFlag('meadow.mochi')) {
+      // the cage opens only once the cart arena is clear: point at the nearest rat until then
+      const arena = ctx.levels?.arena?.('cart');
+      if (arena && !arena.cleared) {
+        const foes = (arena.enemies ?? []).filter((e) => e?.alive !== false && e.pos);
+        const f = foes.sort((a, b) => Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) - Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z))[0];
+        if (f) return this._spot(ONBOARD_IDS.mochi, [f.pos.x, f.pos.z], 1.8, 'onb.cart.rats', 'quest');
+      }
       const lock = (ctx.companions?.actors ?? []).find?.((a) => a?.kittenId === 'mochi' && a.alive !== false && a.pos);
       const xz = lock ? [lock.pos.x, lock.pos.z] : STORY.mochiCage;
-      return this._spot(ONBOARD_IDS.mochi, xz, 3, 'onb.mochi', 'quest');
+      return this._spot(ONBOARD_IDS.mochi, xz, 1.4, 'onb.mochi', 'quest');
     }
```

and in `src/story/strings.onboarding.js` (G2):

```diff
-  'onb.mochi': 'Help Mochi out of the cart!',
+  'onb.mochi': 'Bonk the cart open! [Attack]',
+  'onb.cart.rats': 'Chase off the rats! [Attack]',
```

`[Attack]` is the device-aware glyph token the objective line already renders. The banned-word test also scans this
file: "Bonk" and "Chase off" are fine. `Arena` has `cleared` and `enemies` (`world/Arena.js:74–76`), and `levels.arena(id)` is used the same way by `tests/smoke/flow.mjs`.
After this lands, rerun `npm run build:test && npm run bot:onboarding`.

## 2. `src/story/tutorial.js` `guideTarget()` (G2, no TT3 owner): the Sir Wobble drill can stall (2 of 13 runs, both touch)

Two causes:

- **Arrival radius versus close radius.** The stand spot is `ONBOARD.standR` 1.3 m from Wobble and `arriveR` is
  0.9 m, but the lesson counts her as close only within `closeR` 1.6 m. She can be "arrived" (no trail, badge only)
  while still 2.2 m from Wobble, and the prompt then keeps saying "Get close to Sir Wobble!" forever.
- **The badge sits on Wobble's body.** A right-click or tap on the badge lands on Wobble, so the order becomes an
  engagement and stops at weapon reach. Measured: 2.46–3.26 m from Wobble, 1.2–2.0 m from the stand spot, for 15+ s.

```diff
     const [x, z] = this.standSpot();
     const far = this.wobbleDist() > ONBOARD.closeR;
-    return { id: `tut.${s.id}`, x, z, arriveR: 0.9, textKey: far ? 'onb.wobble.close' : s.textKey, kind: 'lesson', speaker: s.guide ?? 'pearl' };
+    // "arrived" must also mean "close enough for the drill" (closeR), or the guide hides while the prompt says "Get close"
+    return { id: `tut.${s.id}`, x, z, arriveR: Math.max(0.2, ONBOARD.closeR - ONBOARD.standR - 0.05), textKey: far ? 'onb.wobble.close' : s.textKey, kind: 'lesson', speaker: s.guide ?? 'pearl' };
```

The second cause also needs a fix. Either a move order that comes from a guide badge or coin never targets an actor
(`player/orders` pick), or the stand spot moves to `standR` 1.0 so the badge lands on the ground in front of him.

## 3. Touch: the edge coin and trail taps can stall at the barn chest (`prologue.suit`, 1 of 13 runs, 844×390)

`touch-noskip-s2`: Clem stood 4.5 m from the chest. Every 1.1 s the bot tapped the edge coin's point, pulled 80 px
inward, as plan §10.10 #1 specifies, and she did not move for 15 s. R3 has since made the coin itself take taps
(`edgeOrder`). The point 80 px inward can still land on a touch cluster or the HUD. Owner: R3 / ui (`beacon.js`
`dodgeRects`). Keep the coin far enough inside that its inward point is open ground, or say in the plan that taps on
the coin itself are the expected input. Screenshot: `tests/shots/bot/touch-noskip-s2.png`.

## 4. `src/ui/beacon.js` `snapshot()` (R3): expose the parry cue so the bot can stay on `guide()` only

"Tap Space when you see the shield!" asks the player to time a tap to the shield telegraph over Sir Wobble.
`guide()` does not report that telegraph, so the bot reads `wobble_knight.phase === 'windup'`. That is the one probe
that is not from `guide()`, and it is marked in the bot. Add to the snapshot:

```diff
     return {
       phase,
       target: g.has ? { id: g.id, kind: g.kind, textKey: g.textKey } : null,
+      // the parry cue a player times the tap to (Sir Wobble's shield telegraph is showing)
+      cue: (() => { const w = ctx.actors?.get?.('wobble_knight'); return !!w && w.phase === 'windup' && w.phaseT >= (w.atk?.windup ?? 0.9) - 0.11; })(),
```

and Q1 switches the bot to `g.cue`.

## 5. `src/ui/ui.css` (R3/G3): "Skip practice" overlaps the "A Token Tails game" footer at 390×844

The new `brand:surfaces` 390×844 pass fails `390x844: skip link clear of the play button and footer`. The same overlap
shows on the embedded title at 390×844 in tokentails.com `/swordcat`. Screenshot: `tests/shots/brand/title-390x844.png`.
On portrait phones, stack the link above the footer (or put it under the play button):

```diff
+@media (max-aspect-ratio: 3/4) {
+  /* portrait: the footer (ui.css:1422, centred at the bottom) and the skip link must not share a row */
+  .ui-title .title-skip { bottom: calc(var(--title-foot-h, 44px) + 12px + env(safe-area-inset-bottom)); }
+}
```

Check the selectors against the current title markup. The smoke assertion is already in place.

## 6. `src/core/embed.js` (core, no TT3 owner): accept the page's own origin for same-origin hosting

When the game is hosted same-origin (`/swordcat-game/` framed by `/swordcat`), the bridge rejects any host origin not
on `DEFAULT_EMBED_ORIGINS`. The flag-ON dev check on `localhost:3021` therefore showed "Still loading Pink Paw Knight…"
over a game that had loaded. Vercel preview deployments (`*.vercel.app`) will show the same. Production on
tokentails.com is fine. Proposed fix: same-origin is always safe, so trust it.

```diff
 export function allowedOrigins() {
-  return parseOrigins(e?.VITE_EMBED_ORIGINS);
+  const list = parseOrigins(e?.VITE_EMBED_ORIGINS);
+  // same-origin hosting (tokentails.com/swordcat-game framed by /swordcat, previews, local ports) is always allowed
+  try { if (typeof location !== 'undefined' && location.origin && !list.includes(location.origin)) list.push(location.origin); } catch { /* no location */ }
+  return list;
 }
```

Check that `parseOrigins` returns an array (and its callers when `env` is passed explicitly in tests). Add an `embed.test.js` case.

## 7. Smaller handoffs

- `tests/smoke/ui.mjs` ~line 281 (ui smoke owner): drop the `prints:` diagnostic, which counts the deleted `.bc-print`
  (R3 handoff 1).
- `public/assets/ASSETS.md` (docs owner): mark `models/env/town/banner-red.glb` as unused, or delete the file and its row
  (R2 handoff).
- Measured CS-02 span is 31.5 game s (median, no-skip; `story.sceneActive` with `playingId === 'cs02'`), against G2's
  17.6 s. The bot measures until `sceneActive` drops. That span may include the rats-spill beat or a load. G2 owner:
  measure `cs02` alone and update the file header, or split the beat out of the blocking span.
- Plan §10.10 #3 versus the design: at `tut.bonk` (Clem is already at the dummy) and `tut.parry` (same stand spot as
  the Stand) there is nothing to walk to, so the guide shows the badge or only the objective line, by design
  (`beacon.js:152`). Either accept the badge or objective line as "the way is shown" for in-place lessons in §10.10
  #3, or show 3 prints that lead onto the dummy or Wobble.
