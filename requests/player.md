# Open requests from player

No open requests. The API notes of this area are archived in `docs/api/player.md`; what core applied is in `requests/RESOLVED.md`.

## Done (player, Phase W pass)
- physics `findPath(from, to, { toward })`: Orders now passes the camera's ground position as `toward` for ground clicks
  and taps (wall-face snap hint).
- characters (QA "her face is almost never visible"): on arrival from a plain move order she eases up to 0.35 rad
  (≈ 20°) toward the camera over 0.25 s (`Player.onArrive`, lens behind her → her turning side; WASD cancels).
- physics (perf, optional): hold-to-follow and stuck re-plans pass `{ maxExpand: 2000 }`; a fresh click keeps the default.
- world: `player.writesGlow` is true once her model is built; the model writes `ENV_U.uGlow.xyz` at chest height every
  rendered frame (imports `world/tone.js`), so Env's feet fallback stays off.

## from audio (Phase W)
- `ctx.audio.play2D('tapPurr')` is the WA §5.6 tap-her purr (soft mew-purr, rate-limited 0.4 s); please swap the
  `play2D('meow', { volume: 0.55 })` pat in `Player.js` for it.
- The knock-out boing is audio-side now: `player:lifeLost` → purr at +1.2 s (your wipe) and the bubble boing at +1.55 s
  (your pop). Nothing to call.

## from characters (Phase W fix: hero read / tunic sword)
- `swordcatConfig({ armour: false })` now carries the sword by default (`tunicSword` defaults to true), so your 'tunic'
  and 'tunic_bow' outfits show her blade with no change on your side. Optional: accept `'tunic_sword'` in `setOutfit`
  and expose `hasOutfit('tunic_sword')` so `StoryManager.practiceOutfit()` stops falling back to 'tunic'.
- Her `idle` now renders as `restUp` (blade upright at her right side, tip ≈ 1.16 H) via `cfg.idlePose`; `k.poseName`
  still reads 'idle'. Swords ≥ 1.4 H keep the cane idle, so your DRAG tip-on-ground path is unchanged.

## from combat (Phase W fix: final blow mid-encounter)
- `combat:hit` (and the `onHit` info) now carries `finalBlow: boolean`, Combat's own decision (it now also says no
  when the victim jelly splits, or a locked arena still has waves to come). Please make `_onHitEvent` use
  `h.finalBlow` for the "Bonk!" word instead of calling `isFinalBlow(this, target, list, pos)` (which lacks the
  attack def and arenas, so it still says "Bonk!" on each non-final wave's last foe).

## from ui (Phase W review: a ⚔ tap in a Swoosh recovery is dropped)
- Likely cause of the controls:touch "first ⚔ tap gave no swing" flake (not reproduced in 4 runs on :5702, so not
  confirmed): a press during a swing that has no `next` (slash3 Swoosh, dur 0.60, active ends 0.32), or outside a
  combo window, sets `attackBuf = assist.buffer` (0.2 s), which decays before the recovery ends (`s.t >= def.dur`), so
  the press is lost and she returns to `move` without swinging. The auto-attack loop's killing blow is often the Swoosh.
  Suggest: in `STATES.attack.update`, at recovery end start a fresh `slash1` when `attackPressedSince(s.t)` saw a real
  press during this swing (not an auto-feed), or hold the buffer through the recovery for real presses.
  `tests/smoke/controls.mjs` now asserts the FIRST ⚔ tap swings and logs a per-step trace (`pr/buf/st/sw`) on failure.
