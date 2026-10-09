# Requests / notes from the story area

## How to use ctx.story (M1, 2026-10-08) — ui, world, companions, enemies, player, camera, audio, save
Frozen contract unchanged (§19.3): `play(id) → Promise<{id, skipped}>`, `flag(k, v?)`, `isPlaying`, `skip()`, `skipAll()`.
Additive (story):
- `ctx.story.current` (the running `Cutscene` or null; `.id`, `.kind` 'cutscene' | 'dialog' | 'ambient', `.canSkip`),
  `playingId`, `line` (the dialogue line on screen: `{ id, key, who, name, text, portrait, revealed 0..1, complete, auto }`),
  `advance()` (latch one "next" press — call it from a click / tap on the dialogue box), `seen(id)`,
  `newGame({ difficulty, skipPrologue })`, `continueGame()`, `toTitle()`, `chapterCard(n | 'prologue' | levelId)`,
  `tutorial` (`active`, `step`, `total`, `textKey`, `skip()`), `barks.say(actor, key)`.
- `play()` while another scene runs queues the new one (the title loop CS-00 is cut instead). Unknown ids (scenes of
  later milestones) run as a short placeholder that still applies their §5.4 `end` state (flags, shards, unlocks).
- Mode: full scenes set `game.setMode('cutscene')`, dialogue scenes (D-01, the Pudding / Pearl beats) `'dialog'`; story
  restores `'play'` when the queue is empty. Every scene ends with the letterbox off, the HUD on, `cam.mode('follow',
  {blend: 0.6})` (a skip cuts) and every actor it scripted released.
- Hold-to-skip (§5.1): story reads `input.heldTime('pause')` while a skippable scene runs (and during Midnight Practice:
  hold 1 s = skip the tutorial). Seen scenes are flags `seen.<id>` in `state.flags` (the prologue is always skippable).

## To ui (the cutscene overlay + dialogue box are yours, §14.2 / §14.3; story has a built-in fallback until then)
Story ships a minimal DOM overlay (`src/story/Overlay.js`, z-index 20) so scenes are watchable before the ui lands. It
steps aside **per feature** as soon as `ctx.ui.handles` says ui draws it — please set it in your constructor, e.g.
`this.handles = { dialog: true, cinema: true, prompt: true, skip: true, title: true, tutorial: true }`.
- **dialog** (`dialog:start {id}`, `dialog:line {speaker, name, text, portrait, key, auto, id}`, `dialog:end {id}`):
  typewrite at 30 chars/s × `settings.dialogSpeed` from the `dialog:line` moment; `ctx.story.line.revealed` (0..1) /
  `.complete` is the authoritative reveal (story completes the line on the first press, advances on the next). A click /
  tap on the box → `ctx.story.advance()`. `speaker` is the cutscene actor id (`swordcat`, `pearl`, `whiskerbottom`,
  `pudding`, `cacklejaw`, `pilfer`, `mochi`, `squire_3`…); `name` is already resolved (`name.<id>` strings).
- **cinema**: story calls `ctx.ui.cinema(cmd)` (when it is a function) with one or more of
  `{ letterbox: bool, hud: bool, caption: string | null, title: { text, sub, logo: bool } | null,
     chapter: { label, title, region } | null, fade: { to: '#000', alpha: 0..1, dur } , press: bool (title "Press any key"),
     clear: true }` (strings already resolved). Letterbox bars 10% each; chapter card 3.0 s (`ui/drop_002` stamp) —
  story times the card and sends `chapter: null` to hide it.
- **prompt** (`story:prompt {action, hold, textKey, progress, done, id, kind}`): `kind: 'cutscene'` = the big centred
  "HOLD THE STAND" / "Hold ⚔, then release" overlay with a filling ring; `kind: 'tutorial'` = the Midnight Practice
  parchment tag (`step`, `total` included; `done: true` hides it).
- **skip**: `ctx.ui.cinema({ skip: 0..1 })` while Pause is held during a skippable scene (0 hides the corner ring).
- **title**: after "Press any key" story calls `ctx.ui.openMainMenu()` if it exists (else it starts / continues by
  itself). Menu actions: `ctx.story.newGame({ difficulty, skipPrologue })`, `ctx.story.continueGame()`; Pause → Quit to
  Title = `ctx.story.toTitle()`.
- **Pause key**: while `ctx.story.isPlaying` (mode `cutscene` / `dialog`) please don't open the pause menu on Esc /
  Start (holding it skips). During Midnight Practice (`ctx.story.tutorial.active`) please open pause on the *release* of
  a short press (< 0.35 s) so a 1 s hold can skip practice.
- Toasts story emits (`ui:toast {text, key, icon}`): `toast.mochi`, `tut.done` / `tut.skipped`, `tut.riposte` and the
  other one-time `tut.*` hints (icon `hint`), unlock toasts.

## To player
- Please add `setExpression(name | null)` (characters' expressions: `worried`, `glisten`, `determined`, `surprised`,
  `sad`, `happy`…; null = back to the pose's own) — story currently reaches `player.model.k.setExpression` defensively.
- Please add `setCapeOverride(id | null)` for CS-00 (the ref2 poster look shows the **red** cape on a new save while
  `state.cosmetics.cape` is still `cream`); story currently calls `player.model.k.setCape('red')` and restores the
  equipped cape at the end of the title loop.

## To world
- Thanks for the triggers / interacts / anchors. Story also uses anchors `g01_mark`, `tallbert`, `lane`, `lane_post`,
  `chart`, `chart_front`, `squires`, `fence_steps`, `barn_door`, `picnic`, `cow_practice`, `bell_far`, `crane_bell`,
  `crane_field`, `horde_a/b`, `bridge_cage`.
- Midnight Practice reads: dummies (`actor.kind === 'dummy'`), the sack (`kind 'sack'`, (8, −84)), the Wobble Knight
  (`kind 'wobble_knight'`), the boulder (`practice_boulder` leaving `level.actors`) and the cow critter
  (`level.critter('cow_practice').woke`).

## To companions
- D-01: its `end` sets `meadow.mochi = true` and emits the "Mochi joined!" toast.
- The Pudding follow beat (`cs03b`, dialog, ~3 s line) plays on `objective:progress {id: 'net_ropes', done: true}`;
  story sets `meadow.pudding = true` at its start so your sniff → nod → lift-off runs under the line.

## world: Sir Tallbert's footprint collider covers g01_mark (2026-10-09)
The statue's circle collider sits ~1.9 m in front of the plinth (≈ (4.15, −57.4), r ≈ 1.1: the sword's box), so a
player placed on g01_mark (4, −58) is pushed to (3.79, −58.78). G-01 no longer uses g01_mark (it stages her at
(2.65, −57.5), back to the statue, so the MEME_LOOP lens stays inside the north fence). Nice to have: centre the
knight's collider on the plinth (or `collider: 'box'` with the plinth footprint) so the mark is standable.
