<!-- Archived from requests/audio.md by core at the M2 integration pass (2026-10-09): the M1 API notes and requests of this area.
     Open items were moved to requests/audio.md; applied ones are summarised in requests/RESOLVED.md. -->

# Requests / notes from the audio area

## How to use ctx.audio (M1, 2026-10-08) — story, ui, world, enemies, companions, player
Frozen contract unchanged: `play2D(id, opts)`, `play3D(id, pos, opts)`, `music(track, fade)`, `laugh(pos, opts)`, `bell(opts)`,
`unlock()`, `load(path)`. Everything below is additive. Nothing plays before the first user gesture (autoplay policy); requests
made earlier are logged, music requested earlier starts (2 s fade) on the unlock.

### Sound ids (play2D / play3D)
- An SFX name from `src/audio/sfxMap.js` (`'parry'`, `'kittenFound'`, `'ui.click'` …), a file id under `audio/sfx/`
  (`'pickup/bubble2'`, `'creature/creature_roar_02'`), a GAME_DESIGN pattern (`'impact/chain_0x'`, `'sword/swish_01–13'`,
  `'creature/crow_caw_01/02'`: a random existing variant), or a full path. Every file must be in `src/audio/assets.manifest.js`
  (tell audio if you need one that isn't).
- Procedural ids (for cutscene `sfx` steps): `'laugh'` (hyena laugh build; `{rate}` 0.85 Cacklejaw / 1.4 Pilfer),
  `'laughChorus'` (`{count: 6, r: 18, dur}` around `pos`; CS-02 shot 3), `'bell'` (the Sunbell), `'bellClunk'` (damped, CS-02
  shot 2), `'heartbeat'` (`{beats}`), `'march'` (`{on: true|false}`, the horde footsteps + chains around `pos`; CS-02 shots 4/8),
  `'shimmer'` (`{on}`).
- `pos`: a Vector3, `[x, y, z]`, an Actor or Object3D (the sound follows it), an actor id (`'swordcat'`, `'pudding'`) or a level
  anchor name. No `pos` → 2D. opts: `vol`/`volume`, `rate`, `rateVar`, `delay`, `dur`, `offset`, `loop`.
- Returns a handle `{ name, stop(fade) }` or null.
- `load(path)` (the `ctx.assets.preload` hook) resolves once the bytes are fetched — level loads never wait on decoding;
  `decode(id)` resolves the decoded AudioBuffer when you need it now. The manifest's `levels` subsets are preloaded per level
  and `evict()` keeps only `'*'` + the current level decoded.
- Music tracks are loudness-normalised (`TRACKS[id].meanDb` → `trackGain`); request them by id, never set deck gains.

### story (cutscene steps)
- `{t: 'sfx', id, at, vol, rate}` → `ctx.audio.play3D(id, at, { vol, rate })` (or `play2D` without `at`).
- `{t: 'music', track, fade}` → `ctx.audio.music(track, fade)`; `track: null` = silence (the level music comes back when play
  resumes). Track ids (`'field_of_dreams'`), `'music/x.mp3'` paths and context names work: `'title'`, `'menu'`, `'knighting'`,
  `'emotional'`, `'hubGold'`, `'hubGrey'`, `'credits'`, `'results'`, `'victory'`, `'ending'`. A combat/boss track (e.g. the CS-02
  `battle_theme_a` sting, the CS-03 `end` `battle_fast_fight_loop`) puts the director in combat; explore returns 4 s after the
  fight ends.
- `say` → emit `dialog:line { speaker: who, text }` (babble §16.4 + the −6 dB music duck), `dialog:end` when the dialogue closes.
  `speaker` may be the cutscene actor id or the display name.
- `env` wind is read from `ctx.env.wind` every frame (no call needed).

### ui
- Call `ctx.audio.unlock()` from the title's "Press any key / Tap to start" handler (audio also self-unlocks on the first
  pointer/key/touch). UI sounds: `ctx.audio.play2D('ui.click' | 'ui.select' | 'ui.confirm' | 'ui.back' | 'ui.bookOpen' |
  'ui.bookClose' | 'ui.page' | 'ui.dialogOpen' | 'ui.stamp' | 'ui.error' | 'ui.toggle')`. `dialog:start` already plays the scroll.
- Volume sliders: write `state.settings.master|music|sfx` (0..1) and emit `settings:changed {key, value}` (the contract);
  `ctx.audio.setVolumes({...})` also works. `?mute` silences everything. `?debug` shows the audio meter (bottom-left);
  `ctx.audio.showMeter(true)` anywhere.

### world
- Optional `level.surfaceAt(x, z)` → `'grass' | 'stone' | 'wood' | 'mud' | 'sand' | 'snow' | 'water'` (the player passes it in
  `actor:footstep`); until then each level has a default surface.
- PropActor `kind`s with hit sounds: `dummy`, `sack` (straw), `wobble_knight` (armour), `crate`, `barrel`, `post` (wood),
  `boulder` (stone), `cage`, `lock` (metal), `rope`. Breakables can also emit `fx:burst {kind: 'crate'|'barrel'|'wood'|'cage'|
  'lock'|'splash'|'bones'|'slime'}` for their break sound.
- Music zones (town Bakery radius, M2): `level.music.zones = [{ at: [x, z], r: 8, track: 'tavern_old_tower_inn' }]`.
- Arena: keep emitting `arena:lock` / `arena:clear`; a reset (death inside, no clear) is detected from `arena.locked`.

### enemies / companions
- Optional `material` string on an actor (`'fur' | 'armour' | 'bone' | 'slime' | 'wood' | 'straw' | 'stone' | 'metal'`)
  overrides the per-type hit sound. `combat:telegraph` `duration` times the parry/gold ting (0.25 s before the strike).
- Scripted CS-02 hyenas: `enemy:jeer {enemy, on}` or `ctx.audio.laugh(actor, {rate})` makes one laugh (the voice follows it).

### player
- Please register the player in `ctx.actors` with id `'swordcat'` (cutscene `at: 'swordcat'`); audio falls back to
  `ctx.player` for `'swordcat'`/`'player'` until then.

## To core
- Nothing required. Note for smoke runs: the dev server's HMR reloads the page whenever another agent saves a file, which kills
  long smoke runs mid-block during parallel phases; audio runs its own server with `server.hmr: false, watch: null`.

## M1 update (2026-10-08, resumed run) — additive, contract unchanged
- **story**: every procedural id now returns a `{ name, stop(fade) }` handle (`laughChorus`, `march`, `shimmer`, `heartbeat`,
  `bell`/`bellClunk`, `laugh`), so `sfx` steps with `handle` can stop them. `{loop: true}` without `dur` (e.g. the CS-01 purr
  `cat/cat_purrsleepy_loop`) runs outside the 8 + 12 voice pools (never stolen), follows its `at` actor, and stops on its handle,
  on `level:loading`, or via `stopAll`.
- **world**: `music.prologue` in a level's `music` block (meadow: `village_bards_tale`) is honoured: while flag `prologue.done` is
  unset it is the explore track, and LevelManager's `E.MUSIC {track: music.explore}` is read as it. The day track returns on the
  CS-02 `end` reload. `level.surfaceAt()` → `'dirt'` (the lanes) now has its own step set (`footsteps/sand_*`, lighter); NPC/enemy
  `actor:footstep` without `surface` asks `ctx.levels.current.surfaceAt(x, z)`. `world/creak2` (practice-field gate) preloads with
  meadow.

## To core (FYI, not audio)
- Smoke on this machine: in headless Chromium (ANGLE-GL) `requestAnimationFrame` itself stops firing 5–20 s into a block while
  page JS still answers, so `page.screenshot` times out and `fps ~ 0` is printed. Reproduced **without the audio unlock** (no
  AudioContext created), and with the context suspended, so it is not caused by audio; likely GPU contention from the parallel
  agents' browsers. The audio blocks retry a timed-out screenshot once and then only warn.

## M2 (2026-10-09) — forest, town + hub, gate, B1 / B2 (all additive; contract unchanged)

### Music (musicMap.js `LEVEL_MUSIC`, used when a level's `music` block leaves a field out)
- `byFlag` rows pick the explore track and are **re-checked live** (every 0.5 s and on `story:flag`): forest
  `forest.camp` → `dark_forest_creepy` (track volume 0.6); town occupied `village_town_theme` → `town.free` hub gold
  `village_bards_tale` → `gate.done` hub grey `story_lament_warriors_soul` → `ending.seen` gold again. The change
  crossfades the next time play is calm (never mid-cutscene, never over a fight). A request for the plain `explore`
  track (LevelManager's load emit) is read as the flag's track. A level's own `music.byFlag` wins over these.
- Town music zone: the Bakery, `at [-26,-20]`, r 8 → `tavern_old_tower_inn` (zones accept an optional `when` cond).
- Gate: the approach plays low (`gains.village_town_theme` 0.6); **The Line** holds `battle_theme_a` for the whole
  repair while objective `line` (or textKey `obj.line`) runs, between waves too; wave arena clears inside it give no
  victory fanfare. A cutscene's silence (CS-08 shot 1) comes back as the held track.
- Bosses (`BOSS_MUSIC`): `boss:start` snaps `boss_epic_battle_loop` in (0.3 s) with a fog-wall stinger
  (`bossIntroB1` for `boss_grizzlechop`, `bossIntroB2` for `boss_cacklejaw`); `boss:defeated` → victory fanfare.
  Pass the boss type id as `id` (or `boss.def.id`).

### Objectives (`objective:progress`, no call needed)
- `obj.lanterns`: done jingle (world plays the ignite per lantern; use `lanternLight`, `'fire/fire_ignite'` is aliased to it); `obj.ropes` / `obj.keys` tick; done → `objectiveDone` jingle.
- `obj.line`: a real freeze (`frozen` without `paused`) → `repairFreeze` at the winch, off → `repairResume`. The 100 % portcullis test is story's `line.portcullis` cue
  (`portcullisOpen`, then `portcullisClose` 2.6 s later).
- While `line` runs (not frozen) the winch chains and Earl Grey's pin hammering play at (0, 1, 41).

### Ambience (ambience.js `AMBIENT_LAYERS`, automatic per level + flags)
forest: procedural birdsong by day, the stream at the stumps, Lantern Night crickets + owl + campfire at (6, 40).
town: occupied rat squeaks; hub fountain, kitten chatter, the forge anvil at (30,-10), the bakery oven, birds while gold
(not grey), Coo after `ending.seen`. gate: raft creaks, the horde's drums and laughs in the fog bank until `gate.boss`.

### Shops / Quest Board (ui)
- `ctx.audio.shop(action, { station })`, action ∈ `open | close | hover | select | buy | coin | denied | equip |
  equipSword | equipCape`; station ∈ `bakery | forge | library | wardrobe | barracks | questboard`. `open` rings the
  procedural counter bell; `buy` adds the station's flavour (bottle, anvil, pages, twirl, banner, pin).
- Or by name with `play2D`: `shop.*`, `quest.open | quest.select | quest.pin | quest.go`. `state:unlock` plays the
  `unlock` jingle by itself (not during cutscenes).

### Cutscene cues (story; cues.js) — `{ t: 'sfx', id: '<cue>', at }`, the step's handle stops every part
D-02 `d02.cage d02.tumble` · CS-04 `cs04.camp` (campfire + crickets beds) `cs04.crackle cs04.purr cs04.snore cs04.rollover
cs04.tailCurl` · CS-05 `cs05.hatFly cs05.yield cs05.shardRise cs05.shardSink` · CS-06 `cs06.spill cs06.fan cs06.coo
cs06.cooFlutter cs06.parchment cs06.fold` · D-03/04 `d03.door d04.barrel d04.jellyPop d04.stocks` · CS-07 `cs07.door
cs07.cape cs07.point cs07.free` · D-06 `d06.wagon` · CS-08 `cs08.horde` (laugh chorus ×6 + drums) `cs08.drums cs08.ears
cs08.spoons` · G-02 `g02.ballista g02.leap g02.drag` · The Line `line.horn line.pinStolen line.pinBack line.portcullis` ·
CS-09 `cs09.laugh cs09.charge` (crowd: chorus ×10 + rumble + drums) `cs09.plant cs09.shard cs09.roar cs09.scatter cs09.sob
cs09.wheeze cs09.purr` · CS-10 `cs10.cheer cs10.soup cs10.letter cs10.gloom`.
Music stays in `music` steps: CS-04 end `dark_forest_creepy`; CS-06 shot 4 `null` then `story_lament_warriors_soul`;
CS-07 `hubGold`; CS-08 shot 1 `null`, shot 5 `battle_theme_a`; CS-09 shot 5 `null`; CS-10 `emotional`.
New procedural ids: `campfire`, `crickets`, `birds`, `owl`, `rumble` ({dur}), `handbell`, `toll` ({strikes} — the
Sunbell tolled), `kittenCheer`. `bell()` now has the hammer clank; `bell({ strikes: 3 })` tolls.

### SFX names for world / fx (play3D or `fx:burst {kind}`)
`mushroomBounce` (burst `bounce`), `ropePostCut` (`rope_post`), `cageLower`, `webTear` (`web`), `rockBreak` (`boulder`),
`lanternLight` (`lantern`), `mailbagDrop` (`mailbag`), `letterFan` (`letters`), `stocksOpen` (`stocks`), `jellyRise`,
`farHorn`, `ballistaFire`, `flourPuff` (`flour`), `spoonClink`, `spoonThrow`, `causewayFall` (`fall`). Hit material
`cheese` (Grizzlechop's shield). New babble aliases: Princess Snowpaw, Sir Marmalade, Grizzle, raiders / Snickerpack.


---

# M2 notes (archived from requests/audio.md by the M2 integration pass, 2026-10-09)


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

## Phase W (warm adventure + perf + auto-camera) — audio API additions

- `ctx.audio.glock(notes, { volume, gap, delay, bus })`: the baked glockenspiel (one C5 bar note in PCM, played at note
  rates; never takes a pooled voice). `notes`: a phrase (`sticker`, `rescue`, `stillStanding`, `card`, `friend`,
  `chime`, `roomRead`), a note (`'E5'`) or a list. Also a procedural id: `play2D('glock', { notes })`.
- `ctx.audio.reward(kind, { row })`: WA §5.4 reward sounds (`sticker` thirds C5 → E5 → G5 by `row`, `card`, `friend`).
- `ctx.audio.roomRead({ id })`: AUTOCAM X24 room read (bound to `arena:lock`; once per arena per visit).
- Beat cues (`cues.js` BEAT_CUES, played by name): `respawnBoing` (on `player:lifeLost`), `rescueBeat` (on
  `kitten:rescued`), `roomRead`, `stillStandingBeat` (on `player:stillStanding`).
- New SFX names: `tapPurr`, `comicPop`, `ghostPawPip`, `rankStamp`, `roomReadSting`, `ui.ready`, `squeak`, `boneSqueak`,
  `squeakyBone`, `woodKnock`; `ghostLife` and `farDrums` are gone.
- Music: `lantern_night`, `hub_hush`, `bog_dreams`, `results_dance` (warm variants with `rate` / `lowpass` / `loopEnd`);
  `dark_forest_creepy`, `victory_8bit_loop` and `cave_theme` are retired (`cave_theme` aliases to `bog_dreams`). Context
  names: `hubHush`, `lanternNight`, `homesick`, `lament`, `results`.
- PERF: synth PCM bakes on the title (`bake.js`, ≤ 2 ms idle slices); decodes are queued (≤ 4, first use first, level
  warm-up one at a time while calm); the listener and followed panners are written at 20 Hz when moved > 5 cm; 8 pooled
  3D voices. `debugState()` adds `bake`, `decodes`, `listener`, `glock`.
