# TT2 G1 (guidance) → requests to other owners

G1 changed only its own files (docs/TOKENTAILS-PLAN.md §10.2, §10.7). What other packages can rely on, and the small
edits that would finish the job outside G1's files.

## What G1 provides (contracts, §10.7)

- `ctx.ui.beacon.guide` — the resolved guide target, re-read at 4 Hz: `{ has, pos, id, kind, x, y, z, arriveR, textKey,
  vars, speaker, text, src }`. Sources in order: `ctx.story.guideTarget()` (G2), then the running practice lesson's
  `tutorial._demoTarget(step)` (a lesson whose demo point is her own spot has `pos: false`, objective line only), then the
  quest step (`questTarget`). `ctx.ui.beacon.objective` is the same object while a line should show (null in scenes).
- `ctx.ui.beacon.hidden` / `.dim` / `.offscreen` / `.edgeAt` / `.badgeAt` (CSS px) — read-only.
- Hidden whenever `guideHidden(ctx)`: game mode `dialog` / `cutscene` / `menu`, `ctx.story.sceneActive`, an open dialog,
  the letterbox (`ui.overlay.letterboxOn`), the results card, `ui.inScene` (non-ambient scenes). **G2: a non-blocking
  bark (G-01 as a bark) must start as `kind: 'ambient'` or not set `sceneActive`, or the guide hides for its length.**
- `ctx.fx.decals.setGuide(spec)` / `guidePrints()` (fx GroundDecals `GuideTrail`): the world-space Token Tails prints,
  ≤ 14 in the existing decal batch (0 extra draws). Routing is the same `findPath` a move order uses (read-only on
  `ctx.physics.nav`), so with G2's open practice-fence hop link the trail hops the fence at that link.
- `ctx.cam.photoCamBlocked()`, `ctx.cam.guideLook` ({x, z}, the look-ahead offset), `GUIDE_LOOK` in FollowCamera.js.
- `__GAME__.guide()` → `{ phase, target, objective, prompt, prints: [{ sx, sy, lit, w }], edge, badge, skipChip }`
  (`w` = the print's projected width in px, an extra field for the ≥ 18 px check). `phase` is one of `title`, `loading`,
  `scene`, `practice`, `prologue`, `onboard`, `play`.
- G3's request §3 (cursor paw ivory in `tests/unit/ui.test.js`) is applied.

## 1. `src/player/MemeCamTrigger.js` (no TT2 owner; orchestrator): ask the camera before triggering

§10.2.12 is enforced from the camera side today: `FollowCamera.update` zeroes the trigger's idle / Stand clocks while
`photoCamBlocked()` (never in `?test`), and `mode('meme')` hands a blocked `memecam` entry straight back to `play`. The
trigger still runs its first-time unlock toast in that refused case, which real play cannot reach (the clocks never
fill) but a hook could. The clean fix is one line in `suppressed()`:

```diff
   suppressed() {
     const p = this.player, ctx = p.ctx;
     if (p.golden || p.goldenActivating) return true;                     // never mid Golden Hour
     if (ctx.story?.tutorial?.active) return true;
+    if (!ctx.params?.test && ctx.cam?.photoCamBlocked?.()) return true;  // TT2 §10.2.12: prologue / onboarding target
```

## 2. Toasts over Clem on phones (G3 `ui.css` / orchestrator `src/ui/toasts.js`)

At 844×390 the tip toast "Hold the Skip chip to skip practice" sits at the screen centre, right over Clem (shot
`tests/shots/guidance/practice-844x390.png`); at 390×844 the stacked top toasts push the guide bubble down onto her.
G1 moved the guide bubble on phones (guidance.css: right column on short landscape, chip dropped when the objective
line already says it), but the toast slot is not G1's. Suggested: on `(max-height: 480px)` put `.hud-toast-slot` toasts
under the skip chip on the right (or above the touch cluster), never in the middle third.

## 3. `src/ui/ui.css` (G3, optional cleanup)

The old beacon rules `.bc-print`, `.bc-edge-paw`, `.bc-edge-rot svg` and `.ui-beacon.is-trail …` are dead now (beacon.js
no longer creates the DOM trail; guidance.css overrides the rest). They can be deleted; nothing reads them.

## 4. G6 (bot / STATUS)

- Click the farthest `lit` print, else the `edge` pulled 80 px inward, else the `badge`; prints are only reported when
  on screen. The trail re-routes at ≤ 2 Hz and hides within 0.5 s inside the target's `arriveR` (2.2 m default; quest
  steps without `guideTarget()` use 4.5 m).
- Smoke `guidance:practice` / `guidance:phone` (tests/smoke/guidance.mjs, orders 46–47) and unit file
  tests/unit/guidance.test.js are new.
