# Notes / requests from the fx area

## How to use ctx.fx (M1, 2026-10-08) — story, world, enemies, companions, player, ui, audio
Frozen contract unchanged (§19.3): `burst(kind, pos, opts)`, `telegraph(desc) → id`, `holy(actor, 0..1)`,
`mistRing(center, r) → handle`, `horde(on, anchor)`. Everything below is additive. fx is visuals only: it never
requests hitstop / shake / rumble / slow-mo (combat and camera own those, requests/combat.md).

### burst(kind, pos, opts)  (also `fx:burst {kind, position, color?, count?}`)
- `pos`: Vector3, an actor, a cutscene actor id (`'swordcat'`, `'pudding'`), a level anchor name, `[x, y, z]` or `[x, z]`.
  Actors get the effect at mid-height (feet for ground kinds: `dust`, `spawn`, `splash`, `ring`, `holy`).
- `opts`: `count`, `color`, `scale`, `type` (enemy type → poof debris), `dir`, `style` (helmet).
- kinds: `poof hit heavyHit stars spark(s) sparkle(s) gold dust dustRing splash heart(s) heal spawn spawnBones smoke helmet
  fish ring flash confetti shatter holy sunburst choke` + debris `feathers droplets bones dirt fur wood leaves`.
  Unknown kinds fall back to a sparkle.
- Enemy deaths: fx draws ONE poof per `enemy:died` (12 white puffs, 6 gold stars, faction debris by type, fish burst =
  `fish` count). The `fx:burst {kind:'poof'}` that Enemy.die emits in the same step is folded into it (no double poof).
  Helmets stay with enemies (`EnemyManager.spawnDebris`); fx only pops a procedural helm on `burst('helmet', ...)`.

### telegraph(desc) / combat:telegraph
- Descriptor §19.5 `{ id, actor, kind, shape, pos, dir, size, duration }` + optional `r`, `w`, `l`, `angle`, `inner`,
  `target`, `follow`. Sizes: circle/shadow/rings `size = r`; ring `[inner, r]`; lane `[w, l]` (or `l`); cone `[r, angle]`;
  line `size = range`.
- **Live vectors (enemies):** when `pos` / `dir` are Vector3s fx re-reads them every frame — keep writing `tellPos` /
  `tellDir` / `diveTarget` during the windup and freeze them when the §8.1 tracking stops (rat_xbow / crow already do).
  Glints sit on `pos`; ground decals are centred on `pos` (projected to the terrain); with no `pos` the decal follows the
  actor's feet. The aim line runs from `pos` along `dir` and ends at the player's chest.
- `ctx.fx.telegraph(desc)` emits `combat:telegraph` itself (so audio / ui hear it) and returns the id;
  `ctx.fx.telegraphEnd(id)` emits `combat:telegraphEnd`. A telegraph whose END never comes fades at `duration + 0.6 s`, or
  when its actor dies. `state.settings.patterns` adds stripes (red) and dots (gold) for colour-blind players (§14.4).

### holy(actor | id, 0..1)
- Forwards the level to the actor's own aura renderer (`actor.setHoly`, `actor.model.k.setHoly` (player),
  `actor.visual.k.setHoly` (companions)) and adds sparkles (art.md §8), the warm point light (0.6, decay 2, 0.5 m in front
  of the face) and bloom (→ 1.2 / threshold 0.75). Actors without an aura get fx's fallback halo + blade streak.
- The player's charge ladder is automatic: `player.charge` / `chargeTier` / `golden` drive the sparkles, `player:charge`
  `{level, fizzle}` the tier flashes (silver, gold star, or the §7.2 fizzle). Player: keep calling `ctx.fx.holy(p, h)`
  from SwordcatModel._glow — fx treats it like any explicit level.
- Holy Slash: `player:holy` → the gold crescent + ground ring land on the swing's active frame (sim-timed) with the §8.2
  bloom spike 0.55 → 1.2 → 0.55 / 0.4 s. `player:swing {attackId:'sunburst'}` → the sunburst rings. The camera keeps the
  FOV punch (fx does not add another).

### mistRing(center, r, opts) → handle
- `r` = radius, or a rectangle via `opts.size = [w, d]` (world's Arena passes `{ size, id }`), `[w, d]` or `{w, d}`.
  Options: `spacing` (1.5 m), `height`, `width`, `yaw`, `alpha`, `rise`.
- Handle: `alive`, `dissolve(sec = 1.5)`, `dispose(sec = 1.5)` (= dissolve; Arena clear), `remove()` (immediately).
  All walls are dropped on `level:unload`.
- Ambient mist cards (art.md §9.2) and ambient motes (§8 table: meadow fluff, forest fireflies, town dust, gate ash, bog
  spores, keep embers; night grade → fireflies) switch automatically on `level:loaded` / `env:changed`.
  Override: `ctx.fx.setAmbient('fireflies' | 'embers' | ... | null)`. Meme Cam doubles the mist drift.

### horde(on, anchor, opts)  (fx/Horde.js; one instanced draw call, 40 members, 24 on Low)
- `on`: `true` / `'march'` (a stream along a path), `'mill'` (a band shuffling and laughing in place), `'flee'`
  (everyone skids, turns away from `opts.from` / the anchor and runs off fading, then the horde switches itself off),
  `false` (fade out 1.4 s).
- `anchor`: level anchor name, actor / id, Vector3, `[x, z]`, `{pos, facing}`. `'horde_a'` pairs with `'horde_b'`
  automatically (meadow: the lane), otherwise the path is centred on the anchor along `opts.dir` / its facing.
- `opts`: `to`, `dir`, `length`, `width`, `depth` (mill), `count`, `speed` (1.6 m/s), `laugh` (0..1), `cages`/`spears`
  (false to drop), `avoid` (actor or point: the stream parts around it, CS-02 shot 10), `avoidR` (3.2 m), `face`
  (mill: yaw or point), `near` (members closer than this to the camera dissolve; default 18 m, use 0 for the top-down
  crane), `fogMul` (0.55: how much the fog eats them).
- Story examples: CS-02 shot 4 `fx.horde(true, 'horde_a')`; shot 10 `fx.horde(true, 'swordcat', { dir: [1, 0, 0],
  avoid: 'swordcat', near: 0, length: 40 })` (the avoid target may be an actor or a point); `gate` background
  `fx.horde('mill', [0, -66], { width: 50, depth: 17 })`; CS-09 `fx.horde('flee', 'pudding')`.

### Other helpers
- `bloomSpike(peak = 1.2, dur = 0.4)` (cutscene `fx.bloomSpike`; reduceFlashes caps it via PostFX), `fovPunch(deg, dur)`,
  `poof(pos, {type, height, scale, fish})`, `damageNumber(pos, text, style)` (`normal|heavy|crit|heal|hurt|info`),
  `dizzyFor(actor, sec, {gold})` (stun stars; boss Dizzy is automatic from `boss:dizzy`), `clear()`, `stats()`.

## To story
- Cutscene `fx` steps map 1:1: `{ burst, at, count }` → `ctx.fx.burst(burst, at, { count })`; `{ holy, at|id }` →
  `ctx.fx.holy(id, v)`; `{ shake }` → `ctx.cam.shake(t)`; `{ bloomSpike }` → `ctx.fx.bloomSpike(...)` (number = peak).
  For the horde add `{ horde: true | 'mill' | 'flee' | false, at, ...opts }` → `ctx.fx.horde(horde, at, opts)`.

## To ui
- fx owns two DOM layers (created in `init`, pointer-events none): `.fx-vignette` (z-index 7: the §8.2 red hurt vignette
  0.3 s and the low-HP ≤ 2 HP pulse at 1 Hz; halved by `settings.reduceFlashes`) and `.fx-dmg-layer` (z-index 8: damage
  numbers, Fredoka 700 — fx loads `fonts/Fredoka-Variable.ttf` as `SwordcatFredoka` only if no Fredoka face is declared).
  Please keep the HUD / dialogue above z-index 8 and don't draw a second hurt vignette; hearts wobble / pulse are yours.

## To enemies
- Thank you for the live `tellPos` / `tellDir` vectors — fx reads them every frame. For ground telegraphs pass
  `shape` (`circle|lane|cone|ring|shadow|rings`) and `pos` at the impact centre (not the weapon tip), e.g. pug_slam
  `{ shape: 'ring', pos: e.pos, size: [rMax - band, rMax] }`, jelly_slam `{ shape: 'circle', pos: landing, size: r }`.
- Stun stars: fx draws them for `boss:dizzy` and (smaller) on parried melee attackers for their stagger time.

## To core
- Nothing blocking. Note for the debug overlay: `ctx.fx.stats()` returns live counts (particles, telegraphs by kind,
  horde, bloom, vignette) if you want them in lil-gui.
