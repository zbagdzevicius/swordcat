# Pink Paw Knight (a Token Tails game) — Status

(Working name and internal ids: `swordcat`. The Token Tails pass is summarised at the end; plan: docs/TOKENTAILS-PLAN.md.)

Milestones **M0 (core engine)**, **M1 (meadow vertical slice)** and **M2 (Acts I–II: forest, town + hub, gate)** are done
(GAME_DESIGN §19.10), and the **controls rework** (research/CONTROLS_SPEC.md: LoL-style iso camera, click / tap to move,
mobile cluster) is integrated. `npm run check` = production build, the unit tests, the hooks-on `build:test`, then the Playwright smoke blocks.

## Implemented
- **Core:** Game loop, fixed-step systems, EventBus with the frozen event catalog, GameState, Assets (GLTF cache, `fitToHeight`, MODEL_FIT), Input (KBM, gamepad, touch), PostFX (MSAA, bloom, NaN-safe, quality tiers), ScriptedActor, the Appendix A config, and the `?test` / `?debug` hooks (`window.__GAME__`, lil-gui, stats). The asset prune step keeps `dist/` at about 76 MB.
- **Characters:** a procedural Swordcat with fur shells, a verlet cape, plate armour, a pink bow on her left ear, a longsword and poses. Also Mochi, Pearl, Whiskerbottom, squire kittens, the BeastHead hyena with breastplate words, cages and cutscene props.
- **Player:** the full §7 moveset: combo, charge and Holy, Stand/parry and Standing Ground, tumble with Purrfect Dodge, jump and Pounce, Meow, Milk Break, Golden Hour (through hooks), the Meme Cam idle trigger, safe-ground respawn and nine lives.
- **Combat:** the full resolve path: swings with aim assist, hits, guard and parry, projectiles with bolt reflect, attack tokens, hitstop and knockback.
- **Enemies:** full AI for rat_pike, rat_xbow and crow (shadow-decal dive, then a peck window). Scripted hyena, Cacklejaw and Pilfer for CS-02. Bases for later types and bosses (phase runner, Dizzy). There is a spawn budget.
- **Companions:** Mochi (squire, shield ability, nap), LostKitten rescues, Pudding, NpcActor and bubble barks.
- **World:** LevelKit (spine and zones), Env (fog, sky, wind), grass and wheat, Arena (waves, walls), and the `meadow` level: practice field, Tallbert statue, crossroads, Standing Stones, glade, Crow Fields, Old Bridge, far skyline and cows. bog and keep boot as dressed stubs (M3).
- **FX:** telegraphs, hit juice and damage numbers, HolyFX glow, sword trails, mist cards, the Horde, and marks.
- **Camera:** follow with occluder fade and collision, lock-on, shake, cutscene presets (static, orbit, crane, whip-fall, pull-back) and the Meme Cam.
- **Story:** CS-00 to CS-03, G-01 (Tallbert gag), D-01 (Mochi), the tutorial, Pearl's tutorial, vigil stones and the letter.
- **UI:** HUD (hearts, armour, Valor sword bar, lives, fish, kittens, letter, milk, companion portrait), dialogue with portraits and babble, toasts, title, pause, results card and touch controls.
- **Audio:** SFX and music maps for the meadow, a music director (explore/combat), procedural wind, Sunbell, laugh build, heartbeat, voice pools, ducking and 3D voices.
- **Save:** localStorage `swordcat.save.v1`, autosave at vigil stones and level changes, and Continue.

### M2 (Acts I–II)
- **World:** `forest` (Mushroom Ring with bounce caps, Spider Hollow, the Treetop and Sage's cage, Stump Crossing, Lantern Camp with the live day → night switch, the Rat Camp, the Cheese Mill B1 arena with 6 millstone pillars), `town` (wall ring, ~27 houses, Lantern Alley, Bakery Street, the Post Office chase route, the Forge, the Square with the fountain giant jelly, Castle Steps and the Bell Tower) which becomes the **hub** on `town.free` (stations, Quest Board, the 18 kitten activity spots), and `gate` (the causeway heightfield, flanking towers, the gatehouse with its portcullis, the Old Battlefield, the war-wagon, the ballista raft). Objectives: counters (ropes, lanterns, keys) and **The Line** (repair, waves, the pin theft, CS-08 / G-02 hand-offs). Dressing.js (flames + a 2-light pool, paving ribbons).
- **Enemies:** spider (webs + patches that slow her), Gloomjelly L/M/S/giant (splits, popsSlime), hyena full AI (gloat, jeer, pack flank), stealer (theft + getaway), pug (frontal shield, slam ring), Pilfer's town chase, the Boss move runner, **B1 Captain Grizzlechop** and **B2 Warchief Cacklejaw** (all phases, adds, clones), sleeping far enemies, prewarm.
- **Companions:** Sage (ranged shots, Volley) and Clover (Purr of Mending), swapping at Vigil Stones / the Barracks, the M2 rescues (Sage's treetop cage, Clover's stocks, Tofu's barrels, Marmalade, Earl Grey from the giant jelly, the war-wagon cage), the hub residents and keepers, the Spoon Brigade.
- **Story:** CS-04 to CS-10, D-02, D-03, D-04 (×3), D-06, G-02 and the gate beats, all driven by gameplay events; quests and the Quest Board data; §6.5 hub lines; level results for levels that end in a scene.
- **UI:** hub station shops (bakery, forge, library, wardrobe, lookout, barracks), the Quest Board, the boss bar with the Dizzy meter, objective milestones, threat-arrow patterns, the letters viewer, the controls card, results bests.
- **Player:** Golden Hour complete, shop upgrades applied live, Standing Ground tuning, sword skins and capes, the web slow (`applySlow`). **Characters:** the M2 cast, hub / spoon kitten tiers, new poses and props, all 7 skins and capes. **FX:** shockwaves, jelly / web / jeer / theft effects, sun rays, lanterns, The Line's repair site, the shop sparkle. **Audio:** per-level flag-driven music, boss music and stingers, cue sheets for every M2 scene, ambience layers, procedural bells and nature, shop sounds. **Camera:** boss framing and assist, the CS-08 pull-back rail, M2 cutscene presets, town building fade.

## How to run
```
npm install
npm run dev            # http://localhost:5175/  (add ?debug for lil-gui + stats, ?test for hooks; dev / build:test only)
npm run build          # dist/ (production: pruned assets, bundle budgets, NO debug hooks: ?test / ?debug / ?perf / ?level ignored)
npm run build:test     # dist-test/ (VITE_SWORDCAT_DEBUG=1: hooks on; the smoke bundle)
npm run test:unit      # node --test, ~1080 tests
npm run smoke          # Playwright smoke against vite preview of dist-test/ on :4173 (run build:test first); screenshots → tests/shots/
npm run check          # build, test:unit, build:test, smoke
```
Smoke options: `SMOKE_URL=http://localhost:<port>/` (use your own dev server), `SMOKE_ONLY=<area|block>`, `--headed`, `--verbose`, and `SMOKE_GPU=gl|d3d11|swiftshader`.
The smoke refuses to run without `dist-test/` (it needs `window.__GAME__`, which `dist/` never has).
`tests/shots/` is generated output and is gitignored. A curated set is in `docs/screens/`.

## Controls (iso camera, research/CONTROLS_SPEC.md; `?cam=classic` keeps the old orbit camera)
A fixed-yaw three-quarter top-down camera (38° FOV, ~50° pitch, 12.4 m on desktop, 12 m on phones, portrait 50° / 58°)
follows her; you never steer the camera. Keyboard + mouse uses the `hybrid` preset (Settings → Controls also offers
`moba`, `diablo`, `mouseOnly`, `keyboardOnly`):

| Action | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| Move | RMB click / hold (path-finds, auto-jumps fences and gaps; Ctrl+RMB queues), or WASD | left stick | floating joystick (left side), or tap / long-press the ground |
| Attack, hold to charge (Holy) | LMB, toward the cursor (J) | X (aim with RS) | ⚔ tap / hold, drag to aim |
| Attack order | RMB on a foe (walks in, auto-chains); X + click = attack-move | — | tap a foe |
| Stand (hold) / parry (timing) | Space (L, Mouse 5): snaps to the incoming threat | LB | 🛡 hold |
| Tumble | Shift (K, Mouse 4): toward WASD, else the cursor | B | Tumble button, or swipe the free ground |
| Jump (Attack in the air = Pounce) | F | A | Jump |
| Interact / talk | click it (LMB or RMB), or E | Y | tap it, or "!" |
| Kitten ability | Q: tap = cast at the cursor, hold = aim | LT (+ RS) | portrait tap = smart cast, drag = aim, ✕ cancels |
| Milk / Meow / Golden Hour | R / C / V (or Space + LMB) | D-pad ↑ / L3 / RT | buttons |
| Select / cycle target | LMB / RMB on a foe, Tab (Shift+Tab back) | RB, D-pad ← → | tap a foe |
| Zoom / camera lock / centre / peek | wheel / Y / F1 or Home / Alt or MMB | R3 cycles / — / — / D-pad ↓ + RS | pinch |
| Stop | H | — | — |
| Pause; hold to skip cutscenes | Esc or P | Start | ❚❚ |

Ground indicators: the pink hero ring (its notch points where the sword goes), the Stand fan (gold for the parry
window), strike wedges under every melee wind-up, the shrinking parry ring (touch / Kitten), selection, hover and aggro
rings, order markers and path dots. The desktop / pad ability bar sits at the bottom centre.

## Known issues
- **Smoke run time:** the full smoke takes 45–50 minutes on Iris Xe; a few blocks are timing-sensitive under load (enemies:hyena waits up to 45 s for a gloat).
- **Draw calls (PERF §5, Med):** start spawns draw 33–41 frame calls (meadow 41, forest 34, town 33, gate 36); fights, bosses
  and the hub with every resident still reach ~100–110. The End column (≤ 35–75) needs the hero bake (H7) and resident LOD.
- **Old Bridge clipping:** the bridge deck is only ~0.3 m above the meadow and the stream bed is −1.5 m. Teleport hooks have to use `physics.topAt` over deep water.
- **Bundle:** `index` (game code) is ~1.5 MB minified and `three` ~0.82 MB (its own chunk); levels, lil-gui, stats and zzfx load lazily.
- **Looks:** the gate deck bricks read a little dark in `gate_dusk` fog; CS-05's shard moment is still very bright (ref1 glow); the war-wagon kittens hop over the bars of the cart cage when it opens; Grizzlechop's Wheel Ride charge stops on her collider instead of passing through.
- **Stub levels:** `bog` and `keep` are dressed stubs (M3). M3 enemies (Boneheads, Brutus, Barkus moves) still run on the generic base.
- **Controls rework, still open (CONTROLS_SPEC):** the camera peek reticle visual; the see-through hole shader (§3,
  deferred: dithered roof / crown fades read well so far); desktop interaction tags show by proximity, not on hover
  (§10.4); the ledge readability art pass (a light lip on walkable tops); Lantern Alley / Post Office yaw hints
  (optional). Large oak crowns faded right next to her show as a fine screen-door pattern over a big area.
- **Pending requests:** `requests/*.md` lists only open (optional) items; `requests/RESOLVED.md` lists what each integration pass applied.

## Controls rework, part 2 (2026-10-11)
See `requests/RESOLVED.md` (fourth section). Every area finished its §12 list: dithered crown / roof occluder fades and
capsule targets, zone hints (yaw / pitch / dist) and Golden / dialogue framing, gated authored nav links + bounce links
that a click rides, tap-to-ledge picking, Auto-Riposte and the touch guard arc, jump assist, Pounce aim, the §7.2 score
with lunge magnetism, bolt reflect toward the aim, context cursors, enemy HP pills, the touch `Edit layout`, preset
glyphs everywhere, GroundMist sheets, strike wedges, the parry ring, order markers / path dots, the Ctrl ranges overlay,
the pad right-stick reticle, helmet top tints, wheat trample, grass LOD from the focus, the 9-step tutorial (works by
touch alone). The pale diagonal streaks over iso levels (ambient mist cards seen from above) are gone.

## Controls rework integration (2026-10-11)
See `requests/RESOLVED.md` (third section). New: camera `IsoRig` + `Picker`, physics `NavGrid` / `Pathfind`, player
`Aim` / `Orders`, fx `GroundDecals`, ui `touchLayout` / touch rewrite / `abilityBar`, focus fog wiring, presets and
settings, the audio listener at the focus; smoke `tests/smoke/controls.mjs` (desktop, nav, every level from the new
camera, 844×390 + 390×844 touch, `?cam=classic`) and the rewritten `camera.mjs`.

## Fixed in the M2 integration pass (2026-10-09)
- Camera inside the Standing Stones: ring stones (and the meadow's scattered tall stones) are camera-fadeable instanced props now (`fade: true`), so the follow camera fades a stone it is behind or inside instead of showing a flat grey face. Every `fade: true` prop collider carries `camFade: true`.
- Mochi too dark: dark coats get a sky-sheen fill in the fur shader (`uSheen`), more ambient, lighter roots, and Mochi's coat is a soft charcoal.
- Lingering bark: her "You're safe now…" reply is dropped if she is > 10 m from the kitten when it fires, any party bubble hides when its speaker teleports, and a caged companion only barks at arena waves within 25 m of her.
- Kitten count: the toast now counts the level like the HUD, Results and Quest Board ("Lost kitten found! (1/3)"; `{total}` is still available).
- `characters/index.js` static + dynamic import warning: gone (enemies import it statically).

## Fixed in the M2 integration pass, part 2 (Acts I–II wired end to end)
See `requests/RESOLVED.md` (second section). Highlights: a soft-lock after skipping CS-07 (mode stuck in `cutscene`),
level triggers that dropped their scene while another one played, the CS-04 hand-back camera inside Pudding, Cacklejaw's
hat over his eyes, far lost kittens drawn through the fog (−40 draw calls in the forest), the web slow, the jeer duet
radius, shop sounds / sparkle, double toasts. New `tests/smoke/flow.mjs` plays the whole M2 path through its real
triggers: meadow exit → forest → town → hub shop + Quest Board → gate → The Line → B2 → CS-10 → the grey hub.

## Phase W: warm adventure, performance, auto-camera (integrated 2026-10-12)
Specs: research/next/WARM_ADVENTURE_SPEC.md, ART_WARM_SPEC.md, PERF_SPEC.md, AUTOCAM_SPEC.md, IMPLEMENTATION_PLAN.md
(Phase W). Every area landed its tasks (see requests/RESOLVED.md, "Phase W integration"). Highlights: warm toon
materials and cream/candy UI (Fredoka only), the lifted WA §2.3 presets, Morning Practice with Pearl → chart → CS-02
(≤ 55 s) → barn → Chapter 1, Mochi's cart rescue (Bright Slash), bonk-to-befriend plates, celebrations / sticker book,
comic words, glock reward sounds, lazy systems (title-first boot), batched decals / flames / grass, the AUTOCAM solver
(SafeFrame, subjects, beats, rate caps, threat arrows).

### Gate results (integrator run 2026-10-13, Med, 1280 × 720 unless noted)
- `npm run test:unit`: **1033 / 1033**. `npm run build`: gated bundles within budget (three 181 KB gz / 215,
  three-addons ≤ 30 after `meshopt_simplifier` moved back to its own lazy chunk, LevelKit ≤ 40, story ≤ 60, every
  level ≤ 15, cutscenes ≤ 8); boot 215 KB gz / 140, play 450 / 300 and the jelly type 35 / 6 stay report-only.
- Flow smoke (`flow:first-minute`, `flow:forest`, `flow:town`, `flow:gate`): green. Title tap → first move accepted
  71–187 ms, control 15–53 ms; D-01 (Mochi's cart, WA16) at 78–95 s scripted game time (gate ≤ 450 s).
- WA §2.3a `art:warm`: all 17 preset rows inside the luma / dark / black / fog-sat bands (meadow_day 0.59,
  meadow_morning 0.58, forest_day 0.51, town_occupied 0.56, hub_gold 0.54, gate_dusk 0.53, bog_dusk 0.46,
  keep_twilight 0.39, forest_twilight 0.37); no black pixels in any preset, dark ≤ 1.6 %.
- PERF `perf:draws` (frame calls, Med, iso, start spawns; I1 ≤ 120, End ≈ 35–75): meadow 41 / 96k tris, forest 34 /
  78k, town 33 / 91k, gate 36 / 56k (hero 11 calls each). `perf:programs`: Low 28–29 / 30, Med 32–33 / 40,
  High 58–61 / 72.
- `perf:frame` (built preview, ANGLE-GL, 60 Hz vsync): idle p50 16.7 / p99 18.5 ms, CPU 6.7 ms (sim 0.65, render
  3.4, submit 2.6), GPU 8.1 ms; 8-rat fight p50 16.7 / p99 18.0 ms, CPU 7.3 ms, GPU 8.1 ms. `perf:boot` (preview):
  first paint 1.2 s, title 3.1 s.
- Onboarding: Morning Practice → chart → CS-02 (`STORY.cs02Cut`) → barn suit-up → Chapter 1 → Mochi, all through real
  triggers on desktop; touch landscape + portrait covered by the controls blocks.
- Screenshots: docs/screens/20–25 (practice field, auto-camera teamfight, Lantern Camp at night, hub gold, B2, phone
  portrait fight); tests/shots/art/ (every preset), tests/shots/flow/ (whole M2 path).

### Gaps (honest list)
- ~~JS heap (PERF §5) FAILs: meadow idle on Med holds 202 MB (built)~~ Fixed 2026-10-14 (Token Tails fix round 1):
  now **96 MB on Med / 88 MB on High (built `dist-test`, after the title and the meadow; budget 120 MB)**, see the
  Token Tails section below.
- AUTOCAM quantitative targets reported, not gated: phone engaged-foe visibility (landscape ≈ 93–96 % vs 98 %; portrait
  ≈ 67 % vs 92 %), portrait ground width 7.5 m vs 9 m (`minCatPxPortrait` 28 caps it: the spec's two numbers conflict),
  lead-down feet 45 % vs 30–36 % (ground below her 5.2 m vs 5.5 m), teamfight fit 0.8–0.9 s wall clock vs 0.6 s,
  rotate re-fit 0.8 s vs 0.45 s, single-frame step spikes on the phone page. Hidden telegraphs are always arrowed.
- ART §11.1 G2 / G3 ceilings and G8 hero pop are WARN: the binding §2.6 grass / ground palettes put day frames at chroma
  0.41–0.45 (band 0.16–0.26) and R − B 0.26–0.44 (band ≤ 0.16); hero chroma ≈ 0.95 × ground (target 1.3×). Needs an art
  decision (soften ground saturation vs re-band).
- Meadow day frame 185k triangles on Med (PERF End 150k); hero 11 draws / 18.6k tris (X10 9 / 16k) until the H7 bake.
- Boot / play bundle gates report-only; E5 lazy enemy types, W12 p1/p2 tiers, P3 nav worker, hub cameos not built.
- Squeakybone reassembly (`boneSqueak`) and squeakyLook wait for M3 content; world night body lift for enemies open.
- The town hub with residents draws 111 frame calls / 504k tris on Med (companions:hub): inside I1 (120) but far over the
  End column; resident LOD / bake needed before the End stage.
- companions:bubble-edge failed once at a leaked 1920 × 1080 viewport (bubble bottom 1022 px under the bar top 981 px);
  not reproduced at 1280 × 720 — worth a 1080p check by companions / ui.
- Several AUTOCAM smoke numbers vary run to run on this loaded machine (teamfight reversals 2–4, boss two-shot
  87–95 %, portrait herFrame 0–17 % frames out); they are gated loosely / reported until the PERF §14.4 idle baseline.

## Next: M3 (Acts III–IV, GAME_DESIGN §19.10)
1. Build out `bog` and `keep` (and the CloudSea / finale pieces): objectives, rescues, letters, Heart Bells.
2. Enemies: Boneheads (collapse / reassemble), Brutus and Barkus boss moves, Pearl's carried cage.
3. Story: CS-11 to CS-16 and D-05; the ending and `ending.seen` (the gold hub).
4. Companions: Pearl and Coo; the remaining hub keepers (Wardrobe opening by flag, Coo's postage refund in ui).
5. Optional polish requests: `postfx.setGrade`, story's boss-yield and letter-card hooks.
6. Keep `slice:meadow` and the `flow:*` playthrough green.

## Token Tails pass 2026-10-13 (core, package SC3; plan: docs/TOKENTAILS-PLAN.md)
The game is now **Pink Paw Knight, a Token Tails game** (internal ids stay `swordcat`). Core changes:
- **F4 production debug gating:** `?test` / `?debug` / `?perf` / `?level` / `?spawn` work only in the dev server and in
  `npm run build:test` bundles (`VITE_SWORDCAT_DEBUG=1`). `Game.js` `debugAllowed(env)` + `parseParams(search, env,
  { framed })` are pure and unit-tested; the `debug.js` import sits behind a compile-time constant, so `dist/` has no
  debug chunk and no `__GAME__` string at all (checked by grep and by smoke `embed:production`). Embed mode never
  enables hooks. `?seed`, `?quality`, `?mute`, `?cam` stay everywhere.
- **F11 build / smoke infra:** `npm run build:test` → `dist-test/`; `npm run smoke` previews `dist-test/` (and refuses
  with a clear message when it is missing); `check` = build, test:unit, build:test, smoke; `engines` node >= 22; the
  merged `vite.config.js` comment is split; dev port 5175 (5173 is catnip-heist's); preview stays 4173.
- **Embed bridge** (`src/core/embed.js`, §5.5): `?embed=1` inside a frame sets `<html data-embed="1">` before boot;
  v1 envelope `{ ns: 'tt-swordcat', v: 1, type }`; source must be `window.parent`, origin in `VITE_EMBED_ORIGINS`
  (default tokentails.com, www, localhost:3000); the first `hello` fixes the host origin and every post goes only to it.
  hello → ready, session (stored), audio (master mute through `params.mute` + `audio.setVolumes`), pause / resume (ui
  pause menu, else `game.pause`), level-complete / kitten-rescued / paused out. Unit: `tests/unit/embed.test.js`; smoke:
  `embed:bridge`, `embed:wrong-origin`.
- **F5 WebGL context loss:** preventDefault, loop stopped, `save.save('contextlost')`, a night / gold "Tap to continue"
  panel (`src/core/recovery.js`); restore or tap reloads. Smoke `embed:bridge` kills the context with
  `WEBGL_lose_context` and checks the panel.
- **F6 load failures:** `LevelManager._load` imports the level module and preloads p0 first, then emits `level:loading`
  and unloads the old level, then builds. A failed fetch keeps the old level, lifts the veil and shows Retry (resolves
  null, never rejects); a failed module import (browsers cache it) makes Retry save and reload. `vite:preloadError`
  reloads once a minute at most (sessionStorage guard). The boot error is a friendly panel with Reload. Unit:
  `tests/unit/levelload.test.js`; smoke: `embed:level-retry`.
- **F7 (part) CPU geometry release:** after warm-up and `level:loaded`, `releaseCpuOnUpload(level.root)` with skips for
  shared GLB templates, Batched / Instanced / Skinned meshes, camera occluder / fade meshes, < 1024-vertex geometry and
  position-aliased normals. Measured in the dev server: it frees only ≈ 0.4–0.7 MB per level (meadow 0.71 MB, town 0.39 MB
  of non-position attributes; most level geometry is batched or instanced), so the 202 MB heap is mostly elsewhere
  (SC5: audio bytes, GLB cache). Smoke `world`, `physics` green with it on.
- **F21 / §2.6 index.html:** title "Pink Paw Knight · Token Tails", description, OG / Twitter tags with `og.jpg`
  (1200 × 630), `favicon.png` (64 px) and `apple-touch-icon.png` (180 px) from the Token Tails logo on night #0B0820,
  theme-color #0B0820, night → dusk splash with a gold glow (the original paw / sword / pink-bow SVG stays), pinch-zoom
  allowed (the canvas keeps `touch-action: none`), Nunito preload.
- **F20 hygiene:** `_alloc` / `_dbg` / `_fx` / `_rate` moved to `scripts/dev/` (`npm run perf:alloc`); `.gitignore`
  adds `dist-*/`, `*.map`, research tool outputs, `.DS_Store`; README.md written (code licence: all rights reserved,
  Token Tails, pending founder decision).

### Open items (plan §8 and this pass)
- No score saves to Token Tails (Phase 2 needs `shared/` + backend changes and a founder OK); no `GameType`.
- Hosting / DNS for the build (default proposal: a same-site subdomain such as swordcat.tokentails.com) is not done.
- Git history rewrite of `tests/shots` / `research/` media and deleting the unused source packs are founder decisions.
- Phone-portrait AUTOCAM retune, bog / keep (M3), hero bake, hub LOD, meadow prop merging, UI scale, sound captions.
- A code licence file (README says all rights reserved until the founder picks one); legal sign-off on the renames.
- Heap: met (96 MB Med, 88 MB High built; see "Fix round 1"). The `perf:no-compile` (1 program during play),
  `perf:spawn` (2 VisualPool misses) and `perf:composer high` (3 programs from the cinematic) perf gates still fail
  under `SMOKE_PERF=1`; they are outside the default `npm run smoke` and were failing before this round.
- `camera:occlusion` "the x-ray goes away once she is visible again" fails with and without the CPU release
  (camera-owned, F12 / SC4).

### Fix round 1 (2026-10-14)
- **Heap (F7, acceptance 10):** a heap snapshot of the built meadow showed 17 × 4 MB RGBA copies of texture atlases
  (≈ 68 MB) held by `world/Props.js` `pixelsOf` in a WeakMap keyed by images the glTF cache keeps alive. The copies are
  needed only while templates bake vertex colours; the cache now drops 3 s after the last read
  (`PIXEL_TTL_MS`, `releaseTexturePixels()`). The old 202 MB was also partly a measurement artefact:
  `performance.memory.usedJSHeapSize` without `--enable-precise-memory-info` is a cached sample (allocating 80 MB in
  the page left it at 202 MB). `perf:frame`'s heap gate now measures V8 used heap + ArrayBuffer backing stores through
  CDP `Runtime.getHeapUsage` after a forced GC and logs the old sample beside it. Built `dist-test`, after the title and
  the meadow: **88 MB on High** (V8 38.3 + ArrayBuffers 49.6) in `perf:frame` alone, **96 MB on Med** (V8 43.0 +
  ArrayBuffers 52.6) at the end of the full `SMOKE_PERF=1 SMOKE_ONLY=perf` run. Same method before the fix: ≈ 150 MB.
- **Hero outline:** the ink hull used round ellipsoids for her ears and a bounding ellipsoid for the furry head ruff,
  which read as dark ear patches on the ivory coat and inked part of the bow. `buildOutline` now asks for a `tight`
  proxy (ear cones fitted to the ear box, small closed props and the fur ruff / bib use their own triangles, the bow is
  left out) and the hero ink is 1.4 px #7C3B41 (mascot maroon #5E0E18 mixed 20 % toward the coat). The x-ray proxy is
  unchanged.
- **Royal red cape from the start:** `GameState` cosmetics `capes ['cream', 'red'], cape 'red'`; `ECONOMY.capes.red`
  'start'; shops / `equippedCape` / the story cape fallback default to red; `migrate` moves an old save still wearing
  the old default cream to red once (a later cream choice is kept).
- **Old wordmark in the DOM:** the story overlay built "SWORDCAT" into its fallback title; it now builds the wordmark
  from `game.title` (`stLogoHtml`), and the title block is `aria-hidden` while off. A unit test scans every HTML text
  run in `src/` template literals for the banned display words.
- **Portrait logo:** the title / credits logo sizes by width too (`min(9.5vmin, 7.4vw)`, stroke scales with the size);
  `ui:portrait` asserts the logo and its bow fit a 390 × 844 screen.
- **Smoke on `dist-test`:** `camera:pullback-cs08` imported `/src/camera/CutsceneCamera.js` (404 in a build); the hooks
  now expose `__GAME__.cutsceneCamera` (debug.js, hooks builds only).
- IP hygiene: `docs/TOKENTAILS-PLAN.md` no longer names the creator handle, the token tickers or the fan series; two
  comments that cited removed reference frames were reworded.

## Token Tails edition (summary, 2026-10-14)
- **What it is:** Pink Paw Knight, "A Token Tails Adventure", set on Purrhaven Isle. Clementine ("Clem") keeps her
  pink satin bow on the left ear, now with the Token Tails mascot's ivory coat and crimson eyes, a royal red cape
  with gold trim and a gold ":3" crest. A bowless Token Tails Cat (holding the ":3" coin) stands in the Pawsbury
  Rescue House. Currency is catnip (game-local), Lantern Stones replace Vigil Stones, Snack Break replaces Milk
  Break, Photo Cam replaces Meme Cam. Four lost kittens carry licensed Pink Paw names (Judas, Raudvis, Zare, Simas)
  with a "made up adventures" credits line. No meme, memecoin or fan-series text remains in display strings.
- **Embed:** `?embed=1` + postMessage bridge v1 (origin allowlist `VITE_EMBED_ORIGINS`); tokentails.com `/swordcat`
  behind `NEXT_PUBLIC_SWORDCAT=1` + `NEXT_PUBLIC_SWORDCAT_URL` (picker card: `NEXT_PUBLIC_SWORDCAT_PICKER=1`), all off
  by default. No score saves (Phase 2).
- **Founder decisions (2026-10-14):** the game is now **Pink Paw Knight** ("A Token Tails Adventure"; internal ids and
  save keys unchanged, world and hub names unchanged). Hosting is same origin at `tokentails.com/swordcat-game/`
  (`npm run build:tokentails` = build + `scripts/copy-to-tokentails.mjs`); `/swordcat` frames it by default, and
  `NEXT_PUBLIC_SWORDCAT_URL` is now an optional override.
- **Final fix pass (2026-10-14, founder defaults applied):**
  - Clem wears her pink bow from the first frame (title, intro, practice). `SwordcatModel._config` puts the bow on in
    every outfit, `swordcat_tunic` gets it too and `swordcat_tunic_sword_nobow` is gone; `tutbow` stays as flavour
    (Pearl straightens the bow; same reward card). Outfit names and the `sticker.bow` flag are unchanged, so old saves
    and the tutorial work as before.
  - Pearl's bow is lilac (#C3A6E0), so pink stays Clementine's alone.
  - Smoke flake root cause (real game bug): skipping CS-09 ran its end block, which chained `play: 'cs10'`. CS-10 then
    ran on the next level, and its end load (`town`/`hub`, after the results card) landed in the middle of a later block
    (`enemies:onscreen-rule`: "the crossbowman vanished"; `enemies:telegraph-payload` in full runs). The same could
    happen with Quit to Title during the gate ending. Fix: `StoryManager.halt()` (Quit to Title and the harness reset):
    the queue is dropped and the running scene ends HALTED, so it chains no scene and changes no level. Also,
    `LevelManager.requests` counts load requests, and an end load that awaited something is dropped when a newer load
    was requested meanwhile. Unit tests are in `story.test.js` and `levelload.test.js`.
  - Embed handshake: the host keeps saying `hello` until `ready` (every 0.5 s for 10 s, then every 2 s, with no hard
    stop). It shows a "still loading" note with Reload at 10 s and a Reload / Back to games panel at 2 min, a late `ready`
    still connects, and the handshake restarts when the frame reloads. Tests are in the tokentails
    `swordcat-bridge.test.ts` / `swordcat-host.test.tsx`, plus a game-side test in `embed.test.js`.
  - Exit button vs HUD: the host frame now fills the safe area. The exit button is 44 px at every width and sits 6 px
    inside the frame's top-left corner. In embed mode the game keeps a 56 px corner free (`--embed-gut` in `ui.css`): the
    top-left HUD moves right on wide screens and down on portrait phones. Smoke `embed:hud-corner` checks this at 1280×720,
    390×844, 360×740 and 844×390.
  - Token Tails Cat smudges: the two grey bars on its forehead were the brow capsules (coat colour × 0.53 on ivory). The
    dark hood behind its head and the dark side patches were the ink hull, which follows the outermost fur shell while
    the fur tips fade out. The cat now has `brows: false` and `outline: false` (honoured by KittenView and
    KittenVisual), checked by `characters:ttcat`.
  - HUD hearts: `touch.js heartRow()` shrinks a row that would wrap (each heart keeps at least 70 % of its size) instead
    of dropping the 4th heart to a second line; max-HP upgrades still wrap to at most two rows.
  - Text: `companions/lines.js` milk fallbacks now say tuna snack; the LICENSES.md opening names the © Token Tails logo
    as the one exception; the `vite.config.js` SMOKE_NOHMR comment is corrected (no watcher means a stale transform
    cache); the build makes `og:image` / `twitter:image` absolute and adds `og:url` (`scripts/social-meta.mjs`;
    `VITE_SITE_URL`, default `https://tokentails.com/swordcat-game/`).
- **Checks (2026-10-14, final pass):** `npm run build` and `npm run build:test` OK (bundle budgets within the gated limits). Before the rename, on the items 1–8 code: `npm run test:unit` 1087/1087 and full `npm run smoke` run A 258/258 with 0 failures (2986 s); run B was stopped at block 242/258 with 0 failures so far (wrap-up). After the A/B edits: `npm run test:unit` 1088/1088; smoke has not been rerun. Built heap was not re-measured.
- **Superseded "still open" (first fix pass):** the items in this bullet were rerun or closed in TT2 (below): smoke ×2,
  `build:tokentails` measured, flag-ON `/swordcat` checked, Clem's maroon band gone (close-up read).
- **TT2 (2026-10-14, Q1 QA pass, uncommitted on `tokentails`):** Pink Paw trail + coin edge arrow + objective line (G1),
  shorter onboarding with a Skip chip from second 0 (G2), brand UI / title constant / credits (G3), Rescue House,
  night banners, kitten coats (G4), then R1/R2/R3/TT3 (the unowned requests, town banners, phone toasts and edge-coin
  taps, the tokentails.com check). Plan: `docs/TOKENTAILS-PLAN.md` §10; the numbers below are also in §10.11.
  - **Onboarding bot** (`npm run build:test && npm run bot:onboarding`; trail-only inputs from `__GAME__.guide()`,
    1.5 s reaction delay, 3 seeds; report `tests/shots/bot/onboarding-bot.{json,md}`):

    | Viewport | Skip | Play → `onboard.firstFight` (median; per seed) | Limit | Play → `onboard.done` | First-fight deaths |
    |---|---|---|---|---|---|
    | 1280×720 mouse | no | **47.9 s** (s1 47.9, s2 50.4, s3 46.6) | 90 s | not reached (3/3 dead end at Mochi's cart) | 0 |
    | 1280×720 mouse | yes | **11.2 s** (11.2, 11.3, 11.2) | 40 s | not reached (3/3 Mochi's cart) | 0 |
    | 844×390 touch | no | **54.0 s** (s1 58.0, s2 50.0, s3 stalled at Sir Wobble) | 110 s | not reached (Mochi / barn chest / Wobble) | 0 |
    | 844×390 touch | yes | **11.3 s** (11.3, 11.2, 11.3) | 40 s | not reached (3/3 Mochi's cart) | 0 |

    First-fight targets are met wherever the run got there. The time to `onboard.done` (≤ 4 min) is **not measured**:
    no run gets past Mochi's cart. The cage opens only after the cart arena's rats are beaten, but the guide points at
    the cart, names no key and hides inside 3 m. Fix with exact diffs: `requests/tokentails-tt3-q1.md` §1. Other dead
    ends: the Sir Wobble stand spot (arrival radius 0.9 m vs close radius 1.6 − 1.3 m; the badge sits on Wobble, so a
    click engages him; §2), and one touch run at the barn chest (edge-arrow taps, §3). The `flow:first-minute` smoke
    (world-aware right-clicks) measures 42.8 s. Checks: the way is shown within 1 s for every walking step (move,
    stand, chart, fight, chest; Mochi's step reports phase `play`, so it is not in this check); `tut.bonk` and `tut.parry` show only the badge or the objective line because
    Clem is already there (by design, `beacon.js:152`; §7). The smallest lit print at 844×390 is 25.3 px (limit 18).
    No trail, coin or badge appears in any scene. The Skip chip is on within 0.1 s of every skippable scene. Scenes
    (median, no skip): CS-01 7.7 s, CS-01b 3.7 s, CS-02 31.5 s as a `sceneActive` span (G2 measured 17.6 s for the
    scene alone; §7). The parry timing reads Sir Wobble's wind-up, because `guide()` has no parry cue yet (§4).
  - **`npm run build:tokentails`:** `dist/` built within the bundle budgets and copied to
    `tokentails-swordcat/client/public/swordcat-game/`: **632 files, 61.6 MiB** (64.6 MB). The largest file is 3.6 MB
    (no file near the 50 MB limit). There is no Pink Paw logo or photo in `dist/` or the copy (md5 scan against
    `tokentails-app/client/public/logo/shelters/`).
  - **Flag-ON `/swordcat`** (`NEXT_PUBLIC_SWORDCAT=1 next dev -p 3021`, stopped afterwards): HTTP 200. `<title>`
    "Pink Paw Knight - Token Tails". The iframe `/swordcat-game/index.html?embed=1` fills the viewport (1440×900 and
    390×844) and reaches the title, with the Token Tails logo top-left on wide screens and the "A Token Tails game"
    pill. Two issues: the host shows "Still loading Pink Paw Knight… Reload" over the loaded title, because the
    game's origin allowlist has only `localhost:3000` and tokentails.com. Same-origin previews (any other port,
    `*.vercel.app`) hit the same problem. Fix: trust the page's own origin (§6). On 390×844 the "Skip practice" link
    overlaps the co-brand footer (§5).
  - **Smoke** (`SMOKE_PORT=4191 npm run smoke`, 265 blocks): run A 2931 s, **10 blocks with 18 failed assertions**,
    run B 2976 s, **12 blocks with 21 failed assertions**: the same 10 blocks, plus two that failed only in B
    (`player:touch` "landscape: tap-to-move arrives", and `art:warm` gate_dusk luma 0.496 against [0.5, 0.58]). Both
    runs are red. Every failure is documented here as a spec gap; none comes from TT3 work:
    - Fence-link expectations from before TT2 (G2 moved the jump lesson out of practice and keeps the practice
      fence's automatic hop off; the jump is now taught at the first hop outside practice): `player:click-move`,
      `controls:nav` (2), `physics:nav` (3), `world:iso-data` (2). The tests need an update to the TT2 rule; the
      blocks' owners have no TT3 package.
    - `brand:surfaces` 390×844 (new in Q1): the "Skip practice" link overlaps the footer. Real bug (§5).
    - `characters:ttcat` "coin crest on her plate"; `combat:touch` landscape ⚔ auto-target and lunge (2);
      `world:fog-audit` forest and gate fog at 12 m below the §4.2 table (2); `enemies:hyena` gloat;
      `enemies:onscreen-rule` (2). These do not touch TT2 code paths and need their owners to triage them. The
      `enemies:onscreen-rule` block flaked in earlier passes too.
  - **Read screenshots:** title, loading splash and veil, results, pause, credits (1280×720, 844×390 and 390×844)
    under `tests/shots/brand/`; the Rescue House with the night ":3" banner (`tests/shots/world/hub-rescue-house.png`);
    the town square's gold, lilac and night bunting with the pink paw trail (`world/town-square.png`); and a Clem
    close-up with no maroon band behind her head (`characters/clem-closeup-front.png`). New smoke `brand:rescue-bio`
    covers the Raudvis bio on the rescue card and no bio for a kitten without one.
  - **Acceptance greps (§10.10 #8–#10):** "pink paw knight" appears only in `src/core/brand.js` (swordcat) and in
    `components/swordcat/title.ts` plus tests (tokentails client). No `#F4A462`, `#E89A55` or `#F2A65A` in
    `index.html`, `cursor.js` or `Overlay.js`. No `Fredoka` in `Plate.js`, `Bubble.js` or `rig.js`. The banned-word test
    is green (`npm run test:unit` 1135/1135). There is no Pink Paw logo, photo or card art in the repo or in `dist/`.
  - **Your call (§10.9 defaults applied):** "Pink Paw Rescue House" switches with the title (`BRAND.usePinkPawName`).
    The credits print "in Lithuania". Currency stays "catnip" with "Catnip here stays in this game for now.". The jump
    and Meow lessons are taught in context. The four Pink Paw names stay, with a founder check before each release. No
    starter-cat looks and no mascot `.glb`. `swordcat-game/` (61.6 MiB) is copied as is behind the OFF flag; the
    Capacitor exclusion is decided later. Also still with the founder: Pink Paw's OK on the game title (one constant:
    `src/core/brand.js` `BRAND.title` and tokentails `components/swordcat/title.ts`).
  - **Still open:** `requests/tokentails-tt3-q1.md` §1–§7 (Mochi cart guide, Sir Wobble stand spot, touch edge taps
    at the chest, a parry cue in `guide()`, the portrait title overlap, the same-origin embed allowlist, CS-02
    length). After §1–§2 land, rerun the bot for the `onboard.done` time. Then the stale fence-link smoke assertions
    and the other failures listed above. Plus plan §8 items.
- **TT2 fix round 2 (2026-10-14, evening, uncommitted on `tokentails`):** `requests/tokentails-tt3-q1.md` §1–§3, §6, §7
  closed in code; onboarding bot green.
  - **Onboarding bot** (fresh `build:test`, 13 runs, 3 seeds each, 1.5 s reaction delay; `tests/shots/bot/onboarding-bot.md`):
    **0 dead ends, every row passes**. Play → `onboard.firstFight` median 50.7 s mouse / 44.9 s touch without skipping,
    11.1 / 11.3 s with skipping. Play → `onboard.done` 147.4 s mouse / 173.0 s touch without skipping (≤ 240 s), 111.8 /
    127.1 s with skipping. First-fight deaths 0; 3 later deaths in 13 runs (cart / Stones fights, not the first fight).
    §10.10 #3 (way shown ≤ 1 s at every step, incl. 390×844 for the first three) passes; smallest print 25.3 px.
    Scene lengths: CS-01 6.3 s, CS-02 17.6 s, CS-01b 3.3 s, D-01 10.3 s (all inside the caps). The earlier 33 s / 41 s
    were a bot bug: a scene's length was overwritten by the gap to the next scene's start (fixed in the bot).
  - **What changed:** the trail's path remainder no longer uses the straight-line distance (round the practice fence
    it hid the prints nearest her: the barn chest showed none); the guide look-ahead also leans toward a near
    off-screen target and releases on arrival (the chest was below the bottom edge at 844×390); the chest guide goes
    to the stand spot in front of it (`BARN.clem`) and says "Open" only within 1.6 m (inside the 1.8 m tag); a tap on
    a lit print passes the touch buttons' dead ring; the phone edge coin sits 46 px in and slides along its border to
    stay 70 px off Clem. In-place lessons (Bonk, Stand, Parry) ring their object (the nearest dummy, or Sir Wobble at
    the stand distance) with 4 lit prints; `guide().ring` reports it once she is there. Chapter 1: an alerted foe within
    10 m takes the guide with the fight line (Noodle / Stones steps); away from Mochi's cart the line is "Follow the
    paws to Mochi's cart!" (no attack word) and in reach the Bright Slash line. Embed: the game also accepts its own
    origin when the parent frame is same-origin (`withSameOrigin`), so dev ports and Vercel previews connect.
  - **Flag-ON `/swordcat`** (next dev on 3021, `NEXT_PUBLIC_SWORDCAT=1`, after 40 s at 1440×900 and 390×844): the game
    reaches its title and **no "Still loading" banner** in either size. Still open from Q1 §5: at 390×844 the game's
    "Skip practice" link overlaps the "A Token Tails game" footer. `swordcat-game/`: 632 files, 61.6 MB.
  - **Checks:** `npm run test:unit` 1147/1147 (new `tests/unit/fixround2.test.js`, updated `onboarding.test.js` /
    `guidance.test.js`). Full `npm run smoke` run A: 15 blocks red, of which 5 came from this round's contract changes
    and are fixed (the chest stand spot in `story:cs01` / `flow:first-minute`, the Bonk ring in `guidance:practice`,
    a 13.6 px keycap in the objective line, now ≥ 16 px for `ui:touch-cluster`); rerun of those blocks green. Run B
    (after the fixes): **9 blocks red, all the documented pre-TT2 / untouched-area gaps above** (`player:click-move`,
    `controls:nav`, `physics:nav`, `world:iso-data` fence-link expectations; `characters:ttcat`; `combat:touch`;
    `world:fog-audit`; `brand:surfaces` 390×844 skip link; `enemies:onscreen-rule`). `audio:unlock` "the listener sits
    at the iso focus" failed once in run A (2.0 m) and once in a 6-block rerun, passed alone 4 times and in run B:
    an order-dependent flake, possibly made more frequent by the guide look-ahead now also leaning toward near
    targets. The founder's port 5180 dev server was already down when this round started (no listener, curl fails);
    agents must not restart it, so §10.10 #15 stays open for the founder.
- **Wrap-up (2026-10-14, night): state handed to the founder.** Nothing new built in this step; this is the honest
  end state of TT2.
  - **Done:** Token Tails + Pink Paw theme (title constant in `src/core/brand.js`, Rescue House, night ":3" banners,
    gold / lilac / night bunting, licensed kitten names with fiction lines in the credits); pink paw-print trail +
    edge coin + objective line at every onboarding step; onboarding bot 0 dead ends. Play → first fight 50.7 s mouse
    / 44.9 s touch (11 s with Skip), Play → `onboard.done` 147 s / 173 s (112 s / 127 s with Skip). Before TT2: about
    141 s of scenes before the first fight, 5–6 min for a realistic player, 12 min in the audit run.
  - **Checks:** `npm run test:unit` 1147/1147; tokentails client 5 suites / 53 tests, eslint and `tsc` clean;
    `dist/` identical to `client/public/swordcat-game/` (632 files, 61.6 MB); no `__GAME__` in the production bundle.
    Theme screenshots: scratchpad `swordcat/theme/` (title, menu, every practice lesson, chart, scenes) plus
    `tests/shots/brand/`, `tests/shots/bot/`.
  - **Still red / open:** (1) 390×844 title: "Skip practice" covers the "A Token Tails game" pill (`ui.css` 1612–1620
    has only the landscape `max-height: 460px` rule; fix = a portrait rule raising `bottom` above the footer, request
    Q1 §5). (2) Smoke not green: 9 blocks (4 stale fence-link assertions from the G2 jump rule, `brand:surfaces` = (1),
    `characters:ttcat` crest read from the practice outfit, `combat:touch`, `world:fog-audit`,
    `enemies:onscreen-rule`) plus the `audio:unlock` flake. (3) Heap and draw calls not re-measured after TT2.
    (4) `FALLBACK_TITLE` equals the Pink Paw title, so `usePinkPawName: false` renames only the Rescue House; a rename
    is 2 places in 2 repos (`brand.js`, tokentails `components/swordcat/title.ts`). (5) Real Pink Paw cats' made-up
    bios show on the rescue card with no nearby "made up" label (credits only). (6) Founder's 5180 dev server is down
    (agents may not restart it). (7) tokentails worktree: revert `client/next-env.d.ts`, drop `client/.vitest/`
    before any commit; production embed allowlist still lists `localhost:3000`. (8) Everything is uncommitted.
