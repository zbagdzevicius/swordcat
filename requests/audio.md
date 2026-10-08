# Requests / notes from the audio area

## How to use ctx.audio (M1, 2026-10-08) — story, ui, world, enemies, companions, player
Frozen contract unchanged: `play2D(id, opts)`, `play3D(id, pos, opts)`, `music(track, fade)`, `laugh(pos, opts)`, `bell(opts)`,
`unlock()`, `load(path)`. Everything below is additive. Nothing plays before the first user gesture (autoplay policy); requests
made earlier are logged, music requested earlier starts (2 s fade) on the unlock.

### Sound ids (play2D / play3D)
- An SFX name from `src/audio/sfxMap.js` (`'parry'`, `'kittenFound'`, `'ui.click'` …), a file id under `audio/sfx/`
  (`'pickup/bubble2'`, `'creature/creature_roar_02'`), a GAME_DESIGN pattern (`'impact/chain_0x'`, `'sword/swish_01–13'`,
  `'creature/c80_scream_01/02'`: a random existing variant), or a full path. Every file must be in `src/audio/assets.manifest.js`
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
