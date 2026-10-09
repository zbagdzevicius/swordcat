# Open requests from player

## To fx — Standing Ground mist (open, small)
§7.3: while Standing Ground pays out, "the mist speeds up around her". The player already billows the cape
(×1.8) and exposes `ctx.player.standingGround` (bool, true while paying). Please speed up the ambient mist cards
near her while it is true (e.g. drift ×2 within ~6 m), like the Meme Cam's mist ×2.

## To ui — upgrades and Standing Ground (FYI, no action required)
- Shop purchases: just write `state.upgrades` (satchel 0–2, valorGain, quickCharge, sharp, waveReach). The player
  re-reads it every step (`player.applyUpgrades()`; call it yourself right after a purchase if you like). A bigger
  satchel's new slot comes filled; `player.milkMax` / `milk` update at once. Valor Gain scales every positive gain ×1.25
  (`player.valorState.gainMul`). Quick Charge is read live (`tier1Time()` / `tier2Time()`); Sharpness / Wave Reach are combat's.
- Equipping: write `state.cosmetics.sword` (a `SWORD_SKINS` id) / `state.cosmetics.cape` (a `CAPES` id); the model
  applies it within 0.5 s. Unknown ids fall back to the Borrowed Blade / Faded Cream (`equippedSword` / `equippedCape`
  in `player/SwordcatModel.js`). Diamond and Even More Too Big load their GLB first (the Borrowed Blade shows meanwhile).

## Resolved player-side — first-use shader stalls (was: to characters)
SwordcatModel now warms the hero's aura hull and blade streak programs itself: on `level:loaded` / `game:quality` they
are shown for one frame with an empty draw range (same trick as `FX._warmBegin`), so the first Holy charge / Golden Hour
no longer compiles them mid-fight. characters needs to do nothing unless it adds new holy-only meshes (then expose
them, e.g. on `kitten.auraMeshes`).

## M2 notes (player)
- Standing Ground (§7.3) tuning: "planted" now means no stick input (a block's pushback and its brake-out no longer
  reset the 1 s timer); the threat must be targeting her (`enemy.targetActor() === player`: a token handed to a
  companion or a Shield Wall taunt doesn't count); hidden / dormant enemies and the M2 passive states (`dizzy`, `nap`,
  `pile`, `reassemble`, `escape`, `steal`, `intro`, ...) don't count; a 0.4 s grace (`TUNING.threatGrace`) keeps the
  payout steady through a token flicker. Pure test: `threatens(e, player, r)` in `player/tuning.js`.
- Golden Hour: Meme Cam can't start during it; with Quick Charge the Holy tier stays at 0.5 s.
- Even More Too Big (any blade ≥ 1.4 long): the tip rests on the ground while she stands and drags behind her
  while she runs (visual only).

The M1 API notes of this area are archived in `docs/api/player.md`.
