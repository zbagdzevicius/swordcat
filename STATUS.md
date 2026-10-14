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
- **Still open:** Smoke has not been rerun after the Pink Paw Knight rename and the same-origin hosting change (A/B). B is only partly done: the copy into `client/public/swordcat-game/` has not been run or measured, the flag-on `/swordcat` dev-server check and its screenshots are not done, and the size figures in the tokentails GAMES.md / CLIENT.md (about 58 MB, about 560 files) come from the prune log, not from a measured copy. In close-ups the heroine's outline hull shows as a maroon band behind her head, the same cause as the Token Tails Cat's hood (in iso play it is the readability line). Plus plan §8 items.
