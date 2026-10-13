<!-- Archived from requests/fx.md by core at the M2 integration pass (2026-10-09): the M1 API notes and requests of this area.
     Open items were moved to requests/fx.md; applied ones are summarised in requests/RESOLVED.md. -->

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
  fish ring flash confetti shatter holy sunburst choke` + debris `feathers droplets bones dirt fur wood leaves rocks straw
  metal` + breakable aliases `crate barrel post fence cage lock chain stone boulder rock pebbles sack hay dummy slime
  feather bone leaf` (debris + a dust puff; cage / lock / chain add metal sparks). `ring` and `splash` lay a flat ripple
  on the ground / water. Unknown kinds fall back to a sparkle.
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
  Override: `ctx.fx.setAmbient('fireflies' | 'embers' | ... | null)`. Meme Cam doubles the mist drift, and while
  `ctx.cam.memeLooping` the mist locks to `ctx.cam.memePhase` (cards hold still, the noise scroll repeats every 3.8 s:
  two layers half a period apart cross-fade), so the MEME_LOOP shot loops seamlessly (requests/camera.md).

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

## To player / core / characters — first-use shader stalls (re requests/player.md, 2026-10-08)
- fx now warms its own programs: on init, every `level:loaded` and every `game:quality`, fx shows each hidden fx object
  (both particle pools, marks, sword trail, holy sparkles + arcs, helmet, telegraph decal + aim line, mist cards, horde,
  motes) for ONE frame with an empty draw range, so the real renderer (level fog, lights, the composer's render target)
  builds the programs under the loading veil and nothing is drawn. The first swing trail / Holy charge / Golden Hour
  ring no longer compile fx shaders mid-fight.
- The rest of those stalls are characters materials (the aura hull, fur gold rim, blade emissive variants): the same
  trick (or `renderer.compileAsync` with the composer's render target bound) on the kitten rig would cover them.

## Smoke note (everyone)
- Other agents' edits make Vite full-reload pages mid-smoke. fx runs its smoke against a dev server started with a
  scratch config `{ ...projectConfig, server: { hmr: false } }` (`npx vite --config <scratch>/vite.nohmr.mjs`).
- Seen at boot during fx smoke on 2026-10-08 (characters, in progress): `Cape` MeshPhysicalMaterial fragment shader
  fails to compile — `'vCapeAO' : undeclared identifier` (`outgoingLight *= vCapeAO;` without the varying declared in
  that program variant). Not fx's file; noted for characters.


---

# M2 notes (archived from requests/fx.md by the M2 integration pass, 2026-10-09)


## To characters — first-use shader stalls (open)
fx, combat (projectiles, M2) and world warm their programs under the loading veil. The remaining first-use compiles
are characters materials: the aura hull, the fur gold rim and the blade emissive variants (first Holy charge / Golden
Hour). The fx trick (show the object for one frame with an empty draw range, see `FX._warmBegin`) or
`renderer.compileAsync` with the composer's render target bound, on the hero rig at `level:loaded`, would cover them.

The M1 API notes of this area are archived in `docs/api/fx.md`.

## How to use the M2 fx (2026-10-09) — enemies, world, story, ui
Everything is additive; the §19.3 contract is unchanged. fx stays visuals-only (no gameplay, no hitstop / shake).
Automatic (no call needed):
- **Jeer fog**: `enemy:jeer {enemy, on}` → purple sound-wave rings out to 8 m + violet fog around the jeerer until
  `on:false`, `enemy:choke`, death, or 6 s. Pass `r` in the payload for the Jeer Duet (10 m).
- **Theft**: `item:stolen {thief, item, amount}` → loot arcs from her to the thief, a gold loot twinkle marks the thief.
  A thief that is despawned while alive (escaped with the loot) gets the smoke-bomb poof where it was.
  `item:returned` → fish fountain + sparkles at the thief that had it.
- **Gloomjelly**: `enemy:died` with a `jelly*` type → goo split (two blobs fling apart), or a gold pop when the killing
  `combat:hit` had `popsSlime` (or attackId bright / holy / holyWave / gleam / sunburst); `jelly_s` → a small splat.
  Size from the type suffix (`jelly_giant|l|m|s`) or `enemy.size`.
- **The Line**: `objective:progress {id:'line', value, max, frozen, done}` (world's Objectives already emits it) →
  welding sparks + hammer tinks at the `winch` anchor while it progresses, a gold ring every 10 %, grey stall puffs
  while `frozen`, confetti + a gold flare at `done`. Override the site with `ctx.fx.repairSite(pos)`.
- **Golden Hour**: `player:golden` → sun rays open behind her (subtle, capped to the frame), a gold ground pulse each
  second while it lasts; the Sunburst (`player:swing {attackId:'sunburst'}` or `burst('sunburst')`) flares them out.

### To enemies (calls for the new attacks)
- `pug_slam`: `ctx.fx.shockwave(e.pos, { r: 2.5, dur: 0.4 })` at the active frame (red wall 0.3 m tall, radius grows
  linearly — the same timing as your hit ring; the call returns `{ r0, r1, dur, height }`). Or `burst('slam', pos, { r })`
  for thud + dust + rocks + the wall in one call.
- Cacklejaw Laugh Quake: `ctx.fx.shockwave(pos, { r: 7, speed: 8, color: 'jeer' })`. Belly Flop: `{ r: 3, color: 'goo' }`.
- Grizzlechop Overhead Slam: `ctx.fx.burst('slam', pos, { r: 1.6, shockwave: false, crack: { length: 4, life: 0.5 }, dir })`
  (or `ctx.fx.crack(pos, dir, { length: 4, life: 0.5 })` alone). Colours: any colour or 'red' | 'boss' | 'jeer' | 'goo' | 'gold' | 'white'.
- `jelly_slam` landing: `ctx.fx.burst('jellySlam', landing, { scale, color })`; a split you script yourself: `burst('jellySplit', pos)`.
- `spider_web`: where the glob lands / hits her `burst('web', pos)`. enemies already draws its own patches
  (`enemies/WebPatches.js`), so `ctx.fx.webPatch(pos, { r, life }) → { alive, cut(), remove() }` (one instanced draw for
  all patches, procedural spokes + sagging spiral + dew, torn on cut) is optional; `burst('webCut', pos)` is the shred
  burst for your own cut.
- Stealer: nothing needed (automatic, above); `burst('stealerPoof', pos)` if you vanish one some other way.

### To world
- Lantern Alley / camp lanterns: `const h = ctx.fx.lantern(pos | Object3D | actor, { lit: false })`, then `h.light()`
  plays the ignition (flash, sparks, warm ring) and keeps a flickering warm glow + embers. Your Dressing LightPool keeps
  the real lights; `{ light: true }` would make fx pool 2 PointLights of its own — please don't, both pools would add up.
- `burst('lanternLight', pos)` is the ignition alone.

### To story
- CS-04: `ctx.fx.lantern('swordcat', { lit: true })` adds the glow halo + embers on the held lantern (fx finds a child
  named like "lantern" on the rig, else a raised-paw offset); your `lantern_light` keeps the PointLight. Fireflies come
  from the night grade automatically.

### To ui
- Shop purchase: `ctx.fx.purchase({ el: cardElement })` → a gold star burst + ring over the card (DOM layer
  `.fx-shop-layer`, z-index 60, pointer-events none; respects prefers-reduced-motion). Add `at: ctx.player` (or the
  counter's position) for gold coins + sparkles in the world too.

# Controls rework notes (research/CONTROLS_SPEC.md §12 fx, 2026-10-11)

## What fx draws in the iso play camera (follow / lock / boss; nothing in cutscenes, presets, Meme Cam or `?cam=classic`)
- **GroundDecals** (`fx.decals`, one instanced draw): hero / aim ring (notch = the cursor / aim), Stand fan (silver,
  Grit notches, gold through the parry window, grey through the whiff lockout, ±90° on touch), charge reach (+ the
  holyWave lane with Shard 2, grey when the Holy would fizzle), parry / block ground sparks, landing ring + Pounce dive
  circle, Riposte arrow, Golden Hour gleam lanes, slash smear; strike wedges (from `combat.threats`: freeze 0.15 s before
  `activeAt`, the rim flashes at parry-window open; gold tip star, red filled + jagged, purple grab); the parry ring
  (`settings.parryRing`, auto = touch / Kitten; red attacks get a dodge chevron); selection / hover (+ `setHighlight`) /
  aggro rings; contact blobs under enemies; bolt shadow dots; order markers (cream paw + 4 ticks collapsing onto the
  spot, a cream 4-tick goal crosshair while she walks; red / gold rings, grey ✕ paw; pink is hers alone), queued waypoints (cream ticks), 3 dots while RMB is held, `settings.pathPreview` paws; the kitten ability indicator; the
  ranges overlay (Ctrl). Her indicators are pulled 0.45 m toward the lens so grass never cuts them. The hero ring's
  notch is a solid 0.3 m / 0.25 rad arrow tick (the cursor on KBM, else her aim / facing). Nothing is drawn while
  `game.mode !== 'play'` (dialog, cutscene, Meme Cam); her decals fade back in over the last 0.3 s of the hand-back.
- **Telegraphs**: glints and "!" at a constant 28 / 34 CSS px on the overlay batch `fx.marksTop` (depthTest off);
  ranged aim lines flat on the ground along the whole path (≤ 12 m), solid white once locked; rims ≥ 0.12 m; jeer disc.
- **GroundMist** (`fx.groundMist`, one draw): 8 sheets 12 × 12 m in the 4–16 m ring around the focus, clear 3.5 m disc,
  holes over wind-ups, × the preset's mist factor (or `level.cam.fog.mist`), drift with the wind (×2 Standing Ground /
  Meme Cam). MistCards: 0.3–1.2 m, tilted 60° to face the lens; fog walls capped at 2.5 m + a 2 m ground band.
- **Fog (C4)**: every fogged fx material uses world's focus fog through `fxShaderMaterial` / `withFxFog` (shaders.js);
  Horde uses `hfogFactor` directly. SwordTrail ×1.3 wide; damage numbers rise 0.6 m, scale with the camera distance,
  ≥ 18 px.

## For smoke authors
`fx.decals.stats()` → `{ n, counts, wedges, parryRing, fanHalf, markers, highlight }` (per-frame counts by kind);
`fx.stats().groundMist`, `fx.stats().marksTop`. Blocks: `fx:wedge`, `fx:parry-ring`, `fx:indicators`, `fx:iso-touch`.

## Controls rework: new fx API (additive)
- `fx.decals` (GroundDecals): `stats()` → `{ n, counts, wedges: [{ id, kind, activeAt, frozen, open, range, half, yaw }],
  parryRing, markers, highlight }`; `flash('block' | 'parry')`. Counts keys: hero, fan, charge, holyLane, landing,
  dive, parrySpark, blockSpark, wedge, parryRing, chevron, riposte, ranges, selection, hover, aggro, blobs, bolts,
  path, goal, queued, marker, smear, gleam, ability.
- `fx.groundMist` (GroundMist): one instanced draw; `fx.stats().groundMist` → `{ visible, alpha, sheets, holes, factor }`.
- `fx.marksTop`: the overlay mark batch (depthTest off, renderOrder 10); `Marks.push(…, size < 0)` = a constant
  on-screen height in CSS px. `fx.stats().marksTop`.
- `fx/shaders.js`: `fxShaderMaterial(params)`, `withFxFog(material)` (any fogged custom ShaderMaterial: world's focus
  fog, shared HFOG uniforms; call again after a `clone()`).
- `fx.decals.stats().counts.reticle`: the §6.3 pad right-stick ground reticle (white ring + cross up to 6 m, eased, 1.0 s linger).
- `fx.decals.counts.reachEdge` / `abilityChip`, `fx.decals.reachEdgeAt` (m or null): a companion reach ring wider than the frame (Volley 14 m) is marked by a dotted arc + outward chevron just inside the frame edge along the aim; the aim point gets a chip (white; grey ring + cross = no target). Hero ring: `DECAL_CFG.heroOutline` dark rim under the pink. Iso crossbow aim strip: `TELE_ISO.aimPx` screen-constant width, `aimCap` (linear, under the bloom threshold), faded within ~1 m of her (`uHole`).
- Pounce dive circle: drawn at `player.diveAt` when valid. The ambient mist cards fade to `MIST_ISO.ambientA` (0.12) in the iso camera; their leaned cards read as long pale streaks from above, and the GroundMist sheets carry the iso mist.

## PERF §1.2: one linked fx program (shader consolidation)
- `fx/shaders.js` `FX_UBER` (a core `UberGroup`): every fx `ShaderMaterial` is a *module* of ONE program (+ its
  instanced vertex variant). `fxShaderMaterial(params)` keeps its old signature (vertexShader / fragmentShader /
  uniforms / side / fog / blending...); the material is always DoubleSide + single pass + fog on, and the module keeps
  `side` (a `gl_FrontFacing` discard) and `fog: false` (USE_FOG undefined in its block). `mat.uniforms.<name>` stay
  the module's own objects (the linked names are live getters).
- **Register sources at import** with `fxModule({ name, vertexShader, fragmentShader, side, fog, instanced })` when a
  material is first built after the first compile (per-level effects): a module registered after the program compiled
  costs a program of its own and logs `[uber:fx] ... registered after the program compiled`.
- `fxBasicMaterial({ color, map, opacity, fog, side, ... })`: unlit MeshBasic / LineBasic drop-in in the same program
  (eyes, contact blobs, whiskers, glints, webs, glow cards, far silhouettes). `.color` / `.opacity` / `.fxMap` write
  uniforms (never `.map`: three would key USE_MAP). `fxFogged(material)` tells whether a module applies fog.
- Other areas' effect shaders join through the same calls (characters' aura / holy streak / Dawnblade sparkles, world's
  sky, flames, flame halos and fireflies). Debug: `__GAME__.art.uber()` lists the modules and register use.
