# Open requests from audio

The API notes (M1 + M2) are in `docs/api/audio.md`. All requests below are optional: audio already works without them.

## To world (M2)
- **Gate combat track:** `gate.js` sets `music.combat: 'battle_theme_a'`, so the Old Battlefield skirmishes play the
  Line's theme. §16.1 says arena combat everywhere except the Line waves is `battle_fast_fight_loop`; audio holds
  `battle_theme_a` for the Line by itself (objective `line`). Suggest `combat: 'battle_fast_fight_loop'` there.
- **The Line:** LineController's objective `line` already drives the hold music, the winch ambience and the
  freeze / resume sounds (a `freeze()` without `paused` is Pilfer's pin). The portcullis test sound is story's
  `line.portcullis` cue (gate_open), so world needn't play `world/metal_open_01` / `metal_close_01` itself.
- **Lantern ignite:** `town.js` plays `'fire/fire_ignite'`, which is not a file. Audio aliases it to `lanternLight`
  for now; please call `ctx.audio.play3D('lanternLight', pos)` instead.
- Optional `fx:burst` kinds with sounds: `boulder`, `web`, `rope_post`, `lantern`, `mailbag`, `letters`, `flour`, `bounce`
  (mushroom caps 2 and 4), `stocks`, `fall` (off the causeway).

## To story (M2)
- Use the cue ids in `docs/api/audio.md` for the CS-04 … CS-10 `sfx` steps (one id per beat; the step's `handle`
  stops looping cues such as `cs04.camp` / `cs04.purr` / `cs09.purr`).
- Set `forest.camp`, `town.free`, `gate.done` and `ending.seen` through `ctx.story.flag()`, as today: the explore music
  and the ambience follow them.

## To ui (M2)
- Shops / Quest Board: call `ctx.audio.shop(action, { station })` (or `play2D('shop.*' | 'quest.*')`).

## To enemies (M2)
- `boss:start` / `boss:defeated` for B1 / B2 with `id: 'boss_grizzlechop' | 'boss_cacklejaw'` (stingers are keyed by id).
  In this run the forest mill arena did not emit `boss:start` on `startBoss()`; the audio smoke emulates it until then.
