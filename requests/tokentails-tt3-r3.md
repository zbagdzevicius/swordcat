# TT3 R3 (phone toasts, edge-coin taps, dead beacon CSS) → requests to other owners

R3 changed only its own files: `src/ui/toasts.js`, `src/ui/ui.css`, `src/ui/guidance.css`, `src/ui/beacon.js`,
`src/ui/hud.js`, `tests/unit/guidance.test.js`, `tests/smoke/guidance.mjs`. Nothing in the guideTarget contract,
tutorial.js, StoryManager.js or cinema.js changed.

## What R3 provides

- **Phone toasts** (`isPhone`: touch, or min(W, H) < 500). `hud.js` moves `.hud-toast-slot` out of the top-centre
  column into the HUD root (`.is-phone`, CSS vars `--tx/--ty/--tw` from the pure `phoneToastBox`). Landscape: the left
  column under the HUD block; its right edge stays at least 8 px short of W/3, so no toast reaches the middle third
  where Clem stands. Left-handed play mirrors it to the right, and the guide bubble then takes the left
  (guidance.css). Portrait: the band under the HUD strip, narrowed so it stops short of the Skip chip. A phone shows 2
  at a time (`TOAST_PHONE_VISIBLE`). In portrait, `toastCap` lowers that to what fits above Clem, minimum 1, and
  `ToastQueue.shed()` sends the newest shown toast back to the front of the queue. Desktop is unchanged: the slot goes
  back into the column. The old landscape `position: fixed` toast rules are deleted. They never worked, because the
  `.hud-tc` containment (`contain: layout`) became their containing block, so toasts sat at the screen centre.
- **Portrait guide bubble.** Toasts no longer sit in the column whose bottom `--tc-b` pushes the bubble down. `hud.js`
  writes `--gd-top` on `.ui-guide`, which guidance.css reads. The value comes from the pure `bubbleTop`: under the
  toasts, but just above or below Clem when it would cover her, and kept above the touch clusters.
- **Objective line (phones).** `pillPlace` puts it under the shown stats rows; it no longer covers the Grit / Valor rows
  once they are revealed. It steps below the portrait ❚❚ it used to sit on (390×844) and wraps to two lines short of
  the Skip chip (`.is-wrap`, `--gw`). It stays `pointer-events: none`.
- **Taps that were swallowed.** The tucked Grit / Valor / milk / counters (opacity 0 in practice) kept
  `pointer-events: auto` from the §9.1 hit-area rule. A ground tap there, or on the objective line drawn over them,
  never reached the touch layer. Tucked parts now pass taps through (`.hud.hud.hud.tuck-*`, 0,5,0).
- **Edge coin.** The shown coin takes its own pointerdown (`.ui-beacon.is-on .bc-edge.is-on { pointer-events: auto }`)
  and calls `edgeOrder(ctx, beacon.guide, source)`. That function calls `player.orders.order('move', point, { source })`,
  the call a ground tap or right-click ends in. It runs only in `play` with a positioned target, never in a scene. Tests
  can read `beacon.lastEdgeOrder`. dodgeRects keeps the coin clear of the bar, the HUD and the clusters; a smoke test
  checks this.
- **Dead CSS deleted.** These rules are gone: `.bc-print*`, `.ui-beacon.is-trail …`, `@keyframes bcPrint`,
  `.bc-edge-paw*`, and `.bc-edge-rot svg`, plus their guidance.css `display: none` overrides. `.bc-edge-rot svg` was not
  entirely dead: it also matched the paw-tip SVG and shoved it about 20 px off the coin. The tip now sits against the
  coin as G1 drew it.
- **Text-floor fixes in ui.css** (ui:title / ui:menus / ui:results failed the 16 px rule before R3). These were raised
  to 16 px: the title tagline (it now wraps, `text-wrap: balance`), "Skip practice", the "A Token Tails game" pill, the
  catnip note and the kitten bios.

## Handoffs

1. **`tests/smoke/ui.mjs` line ~281 (ui smoke owner / Q1)** still counts `.bc-print.is-on` in a diagnostic log. The
   count is always 0 now, so the `prints:` field can go. Nothing asserts on it.
2. **Camera (`src/camera/FollowCamera.js`, no TT3 owner).** In 390×844 practice, the guide look-ahead (target south)
   frames Clem at y ≈ 218 of 844. That is 26 % down the screen, just under the top band (HUD, objective line, Skip chip,
   toasts). R3 works around it (toast cap, bubble below her). A cleaner fix is for the SafeFrame to count the phone
   toast slot / guide bubble as top occluders, or for portrait to cap the look-ahead so she stays near 35–40 %.
3. **`src/ui/onboarding.css` (G2).** On portrait touch the Skip chip sits at top 92 px, in the same row as the objective
   line, which is why the line wraps beside it. Optional: put the chip under the counters' right column bottom
   (`--tr-b`), or put the line's row under the chip.
4. **Q1 (STATUS / plan §10.2.10).** Toasts on phones now go in a side slot. The edge coin is tappable. Smoke
   `guidance:phone` now asserts the following: no toast in the middle third at 844×390; no toast, guide bubble or
   objective line over Clem; the line clear of the Skip chip; the coin clear of the bar, HUD and buttons, on top under
   its centre, and a tap on it is a move order toward `beacon.guide`. `guidance:practice` asserts the same coin checks
   at 1280×720.

## Open

- Left-handed landscape (the toasts on the right, the bubble mirrored to the left) is unit-tested but has no smoke
  screenshot.
- The edge coin takes a tap only while the beacon is `is-on`. In an ordinary fight (35 % opacity) it still takes taps.
  That is deliberate: it is still the way to the objective.
