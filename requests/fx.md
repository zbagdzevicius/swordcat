# Open requests from fx

The M1, M2 and controls-rework API notes of this area are archived in `docs/api/fx.md`; what core applied is in
`requests/RESOLVED.md`.

## To world — optional (level data)
`level.cam.fog.mist` (number, default from `GROUND_MIST.byPreset` in `fx/GroundMist.js`) scales the iso ground mist
sheets per level. fx already reads it when present.

## To camera — optional: a public `cam.blendLeft` (seconds of the running hand-back / mode blend left, 0 when none)
GroundDecals hides her hero / aim / selection decals outside play and fades them back in over the last 0.3 s of the
hand-back blend. With no public blend clock it assumes `CAMERA.iso.cut.handback` (1.0 s) and cuts that short once the
lens holds still relative to her, which is right for the default hand-back but late for a 0.6 s `{ blend: 0.6 }` one.
fx already reads `ctx.cam.blendLeft` when it is a finite number. Not blocking.

## To companions — Volley range vs the visible frame
Sage's Volley reaches 14 m but the 1280×720 iso frame is only about ±7.7 m wide and 6 m up / 4.5 m down from her, so
it can wake and hit enemies the player cannot see. fx now marks the reach at the frame edge along the aim (a dotted arc
plus an outward chevron, `fx.decals.reachEdgeAt`) and puts a grey "no target" chip on the aim point. Please also drop
candidates with `!ctx.cam.onScreen(e.pos, 0.5)` in `planAbility`'s volley branch (§8.5 no off-screen snipes), so
the reach the player sees is the reach that fires.

## To ui — optional: Esc while a companion ability is held
Holding Q (Volley indicator up) and pressing Esc opens the pause menu as well as cancelling the aim. Esc should only
cancel the aim (CONTROLS_SPEC §7.5) when `ctx.companions.aim.active`.

- (core, W1) `settings.pathPreview` will become 'auto' | 'on' | 'off' (WA §3.6; allowed values in `config.SETTING_VALUES.pathPreview`). It stays boolean false until GroundDecals reads the enum ('auto' = touch during the prologue + Chapter 1); tell core when it does and core flips the default. New tables to read: `TELEGRAPH.glyph / ink / glyphSize*`, `CLASS_MARKS`, `FX.comicPops`, `PICKUP_FX`, `KO`. Core updated the two literal colour asserts in fx.test.js (red #FF5A4E, aoe #FF9A3D; crow shadow #3A2346).

- (core, S1 K1) No bloom in play on any tier: `postfx.setBloom/resetBloom` only record the request (`postfx.bloom` returns it, capped 0.8 by reduceFlashes; `postfx.bloomRendered` is what renders: 0 in play). Holy / Golden Hour glow must come from the additive glow cards (F5 / ART §8.5). The `fx:holy` smoke's `bloom > base` assertions still pass on the recorded value but no longer prove a visual: switch them to the glow-card stats. Particle pools: multiply caps by `ctx.postfx.particleScale` (thermal rung 2 = ×0.5; `E.PERF_THERMAL {particleScale}`). Tag fx roots `userData.perfCat = 'fx'`.

## from player (Phase W / PERF L2) — words, hero blob, knock-out, order double tap
- **Words (WA §5.3, fx.W3):** the player now calls `ctx.fx.word(pos, text, { kind, actor })` when it exists, else
  `ctx.fx.damageNumber(pos, text, 'word')` (which falls back to the normal style today). `pos` = 0.25 m above her head;
  the player already applies `settings.hitWords` and the 1 word / 0.25 s limit. Kinds: slash1 "Snip!", slash2 "Snap!",
  slash3 "Swoosh!", bright "Shine!", holy / sunburst "Sunburst!", riposte "Riposte!", pounce "Pounce!", parry "Ting!",
  perfectDodge "Whoosh!", finalBlow "Bonk!" (`player/juice.js` HIT_WORDS). Please add the `word` style / `fx.word`.
- **Hero blob (PERF L2 / K5):** the model calls `ctx.fx.blobs.add(player.object3d, 0.5)` once `fx.blobs.add` exists (and
  hides the kitten's own blob), `fx.blobs.remove(player.object3d)` on dispose.
- **Knock-out (WA §5.7):** `ctx.fx.dizzyFor(player, 1.55)` on her knock-out (the boss-dizzy stars; spec: 3 STAR4 at r
  `KO.starR` 0.35, `KO.starRev` 2.5 rev/s); `E.BURST { kind: 'hearts', count: KO.hearts }` at the respawn pop. `hearts`
  currently draws `count` hearts in one puff: fine.
- **Order feedback (WA §3.6):** `player:order` now carries `double: true` on a second ground order at the same spot within
  0.35 s: please draw the double paw there. The head snap / bow bounce / hop are the player's.
- **Glow:** the model writes her position into `ENV_U.uGlow.value.xyz` (world `Env.js` export, read through a namespace
  import) every frame once world ships `ENV_U`; radius / colour stay HolyFX's (X6). `ctx.fx.holy(player, h)` is still called.
