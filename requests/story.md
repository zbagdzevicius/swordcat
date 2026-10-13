# Open requests from story

The M1 and M2 API notes of this area are archived in `docs/api/story.md`; what core applied is in `requests/RESOLVED.md`.

## To enemies — optional
On `boss:defeated` for a boss that ends in a scene (grizzlechop, cacklejaw), skip the death poof / helmet pop so the
captain can "yield" on his knees. CS-05 / CS-09 already stop the shrink themselves (`stateName = 'yield'`), so this is
polish only.

## To ui — optional
`handles.letter` + `cinema({ letter })` if ui wants to draw CS-06's parchment letter card itself (story's overlay
draws it today).

- (core, W1) `config.STORY` { cs02Cut: true, kittenOffer, mochiCage: [-14, -41] }; `E.REWARD`, `E.TELEGRAPH_FIRST`, PROMPT payload speaker / say / stepDots.

- (core, S1) The ending's bloom: `ctx.postfx.setCinematic(true, { grade: 'gold' })` (High only renders it; others record). Cutscene lanterns use `uLamps`, never PointLights (X6).

## from player (WA §5.3) — word strings
Her comic words are player-owned constants (`player/juice.js` HIT_WORDS: Snip!, Snap!, Swoosh!, Shine!, Sunburst!,
Riposte!, Pounce!, Ting!, Whoosh!, Bonk!). If story wants them in strings.js for localisation, add `word.<kind>` keys
and tell player; the player will read `ctx.strings.t('word.' + kind)` when the key exists.

## Phase W (story) — notes for other areas
- (camera, optional) CS-01 shot 4 (low close on Clem at the height chart, `cs01.3`): the chart board behind her renders
  with the occluder dither (screen-door) although it is not between the lens and her. Cutscene `preset` shots should
  skip `camFade` for props behind the framed actor.
- (ui / core) Story no longer loads any font: `Overlay.js` reads ui's `--f-logo/--f-head/--f-body/--f-lore` variables
  and `story/assets.manifest.js` lists no `fonts/*`. `public/assets/fonts/{Cinzel*,CinzelDecorative*,UncialAntiqua*,
  MedievalSharp*,Fredoka-Variable.ttf}` have no story reader left (ART §9.2 −449 KB); delete when no other area lists them.
- (ui) CS-01b's "Knight-ish!" friend card now fires 3.4 s after the hand-off (after the Chapter 1 card) so the two
  never stack; celebrate.js need not queue against the chapter card for this beat.
- (core) The ending (CS-16 placeholder today) declares `cinematic: { grade: 'gold', bloom: [0.6, 0.4, 0.9] }`; the
  runner calls `postfx.setCinematic(true, that)` at start and `(false)` at end.

## from audio (Phase W: WA §8.6a / §9 cue swaps)
- CS-10 end: request `'hub_hush'` (or the context name `'hubHush'`) instead of `'village_bards_tale'` (WA §9 "Big Yawn hub
  village_bards_tale 0.92 lowpass"); the lament stays for the window shot only.
- CS-02 cue ids: `cs02.giggle` (giggle chorus from the mist, no drums, 50 s; stop it with the handle), `cs02.titleHit`
  (the 0.3 s wood hit on the title card), `cs02.letters` (Pearl's letters dropping). `cs10.gloom` is now the airy breeze
  + chime (no horn). Context names: `lanternNight`, `hubHush`, `homesick` (tavern), `lament`, `results`.
- `rumble` is an airy breeze with a chime tail now (ART §9.3), same id.

## from camera (Phase W fix: CS-08 "Nobody's coming" camera inside her fur)
- CS-08 shot 3 (`cs08.js`, the `cs08.1` / `cs08.2` lines): replace `cam('ECU_EYES', 'swordcat', { mode: 'handheld', noise: 0.0025 })`
  with `cam('MCU', 'swordcat', { mode: 'handheld', noise: 0.0025 })` — new camera preset MCU = medium close-up from the
  front-left (pos [0.55, 0.82, 0.95], look [0, 0.72, 0], fov 40; head + ears + pauldrons, ears flat inside the
  letterbox; verified in tests/shots/camera/cs08-nobody-mcu.png). Update the shot-3 header comment to "MCU".
- No longer blocking: every cutscene framing now keeps the lens >= max(1.2 x head radius, head radius + near + 0.05 m)
  from the framed actor's (and `target`'s) live head joint (CutsceneCamera `_clearHeads`), so ECU_EYES / custom close
  `pos` overrides (CS-04, CS-06, CS-08 #5, CS-10) can no longer end inside the fur; they are pushed out along the
  head -> lens ray with the look point kept.

## Phase W review fixes (story, 2026-10-13) — asks for other areas
- (companions) `src/companions/lines.js` keeps copies of two story rows that changed: `kitten.biscuit` is now
  "Is the bridge still wobbly? Okay. Hi." (Biscuit is in the Old Bridge carrier, WA companions.W2; the pause hint
  `kitten.where.biscuit` reads "A carrier at the Old Bridge"). `bark.mochi.lock` is unchanged but is now defined once
  in strings.js (the D-01 duplicate and the unused `d01.lock` are gone). Please sync the fallback copy.
- (world, PropActor) Sir Wobble's practice swing emits `telegraph { kind: d.telegraph, shape: 'glint' }`, which fx
  draws as a white "!" + ring. Morning Practice now teaches "Tap [Stand] when you see the **shield**!" (WA §3.4: the
  `parry` glyph is the shield; the gold star8 is the `gold` kind). Please emit the same wedge + `parry` glyph real
  parryable attacks use (or let fx map `glint` + kind `parry` to the shield glyph). Also: Wobble walks onto Clem's
  capsule during the stand / parry lessons (02t-*-6-parry.png); keep his strike stand-off ≥ her radius + his (0.45 m).
- (fx, optional) `fx.guideArrow(from{x,z}, to{x,z}, { dur })`: a soft cream ground arrow toward a goal. Story calls it
  (optional chaining) with every "this way" sparkle trail, e.g. from Clem to the barn chest after CS-02.
- (fx, optional) `fx.marker(id, pos|null, { color, r, pulse })`: Morning Practice uses it for the gold sun ring at the
  dummy when it exists; until then story draws its own ring mesh (`rig.buildSunRing`, 1 draw, practice only).
- (camera) The opening iso frame on the title spot (0, −64) has Marmalade's barn roof and its chimney filling the right
  third (02t-landscape-1-move.png). Please register them as fadeable occluders (or fade by the herFrame test) there.
  Story now plays `tutlook` (1.7 s: a blend to a high framing of her + the dummy, then follow) when the move lesson
  starts > 7 m from the dummies; a native `cam.glance(point, dur)` would let story drop the scene.
- (world) CS-02 shot 4 now cuts to a close two-shot of Pearl's carrier; the `meadow_giggle` mist trees behind read
  grey. Please check their tint keeps saturation above the WA §2.3a floor under that preset.
- (ui) New rows: `quest.prologue.chart`, `quest.prologue.suit`, `quest.boss.*` (story shows the boss goal in the
  objective pill from `boss:start` to `boss:defeated`; quest ids `boss.<key>`), `cs02.7` (Clem's guide bubble after
  CS-02: `story:prompt { id: 'barn', speaker: 'swordcat', target: <barn chest> }` — please make sure the guide bubble
  draws a `swordcat` portrait). `results.rank.good` was an unused duplicate of `results.rank.mewtiful` and is removed.
- (ui, optional) Semantic glyph tokens `[Stop]` and `[CamLock]` in `text.js` (SEMANTIC + TOKEN_ACTION) would let
  `loading.tip.10` / `.12` drop the literal `[H]` / `[Y]` tokens (today they resolve through the bindings, so they
  already follow presets). The base rows `tut.move` / `tut.bonk` / `tut.click` still say "Right-click" (the hybrid
  base); a `.diablo` / `.keyboardOnly` variant pick in `tx()` would let story add preset-specific copy.

## from ui (Phase W review)
- **Title outfit:** pose CS-00's title kitten in the practice outfit (`tunic_sword`, sword visible) instead of full plate
  + cape: today `newGame()` swaps to `practiceOutfit` with a sparkle on the tap, so the armour pops off right before
  CS-01 says she is "too small for the sword" (00-title.png). (characters supply the outfit; ui moved the CTA to the lower
  third and gave the footer a cream pill.)
- **Title framing:** frame the CS-00 title camera so the hero reads at >= 120 px and sits centred above the lower-third
  CTA (the CTA row's top is now ~ `100vh - 44px - 72px - safe-area`; keep her above ~70 % of the height).
- **Tips:** ui now shows `tut.*` / icon `hint` toasts one at a time, holds them while a guide bubble talks or a scene
  plays (no change needed; a later tip waits its turn instead of stacking).

## from player (Phase W review: practice tunic keeps the sword)
- Player now exposes `hasOutfit(name)` (and `model.outfits`); `setOutfit` accepts `'armour' | 'tunic' | 'tunic_sword' |
  'tunic_bow'`. `tunic_sword` and `tunic_bow` both carry the sword (bow only on `tunic_bow`); plain `tunic` stays
  swordless for cutscenes. So `practiceOutfit()` now resolves to `'tunic_sword'` as intended.
- **Please update `tests/unit/story.test.js:184`** (WA §6.3 new-adventure test): it expects `'tunic'` and now gets
  `'tunic_sword'` (the expectation encoded the bug; its own message says "sword on").
- (world, 2026-10-13) Shadow stage 2 is live (`StaticShadow.SHADOW_STAGE = 2`): the sun map is cached and draws only
  the level's static casters (STATIC_CASTER_LAYER), so cutscene casts / props no longer get sun shadows whatever their
  `castShadow`. Register a contact blob for close-up cast members that need grounding (`ctx.fx.blobs.add(obj, r)`),
  and set `castShadow = false` on them (K5) to drop the dead flag.
- (player / characters) G-W3 "first move ≤ 0.5 s after the title tap" fails at 670–720 ms in `flow:first-minute`
  (input is accepted on the first frame after the tap, but that frame is long): `SwordcatModel.setOutfit('tunic_sword')`
  rebuilds the whole kitten synchronously (~100 ms in `newGame()`), and the next frame spends ~180 ms in
  `player.render` and ~0.7 s in `renderer.render` compiling the new outfit's materials (profiled 2026-10-13, port
  5706). Please make the outfit swap toggle prebuilt parts, or prewarm every `OUTFITS` entry while the title loop runs.
- (companions) K6 / WA20: Clover is no longer held in the town stocks; she sits in a wooden WA20 kennel carrier
  (`rescues.js` `cage: 'kennel'`, no pillory, no metal). Please update `d04.clover.1` ("a tiny thing in a big tin")
  and the `d04.js` header comment to match, e.g. "a tiny thing in a big basket". The `d04.stocks` cue id can stay.

## from fx (Phase W review: glyph hints)
- `tut.red` ("Arrows on the ground? Roll away!") / `tut.aoe` ("Dots in a circle? Step out!") should key on the glyph
  fx actually draws, not the kind: map `telegraph:first.glyph` → `chevron2: 'tut.red'`, `dots6: 'tut.aoe'`,
  `star8: 'tut.gold'` (combat is asked to add `glyph`; fall back to the kind until it does). An aoe LANE draws chevrons,
  so it must show tut.red, never tut.aoe. Glyphs now sit 3–4 on each disc rim / in rows along lane edges (≥ 0.7 m, ink α 0.85).

## from ui (Phase W review: objective wayfinding beacon)
- ui now draws an always-on "where next" beacon (`src/ui/beacon.js`: gold sparkle column + paw badge over the target,
  gold paw edge pointer off screen, a pink paw-print trail after a step change). It asks `ctx.story.questTarget(questId)`
  first: please add it, returning the current step's world position `{x, y?, z}` (or `[x, z]`) or null. Until then ui
  falls back to its own table (`QUEST_TARGETS`: zone ids / caged kittens / NPCs), which has no target for
  `town.bakery`, `town.chase`, `hub-gate`, `hub-bog`, `gate.boss`, `keep.gate`, `ending` (and `bog.pearl` only finds
  Pearl once an actor with `npcId: 'pearl'` stands in the bog).
