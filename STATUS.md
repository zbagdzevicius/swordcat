# SWORDCAT: Nine Lives of Meow Island — Status

Milestones **M0 (core engine)**, **M1 (meadow vertical slice)** and **M2 (Acts I–II: forest, town + hub, gate)** are done
(GAME_DESIGN §19.10), and the **controls rework** (research/CONTROLS_SPEC.md: LoL-style iso camera, click / tap to move,
mobile cluster) is integrated. `npm run check` = build, then the unit tests, then the Playwright smoke blocks.

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
npm run dev            # http://localhost:5173/  (add ?debug for lil-gui + stats, ?test for hooks)
npm run build          # dist/ (pruned assets)
npm run test:unit      # node --test, ~1030 tests
npm run smoke          # Playwright smoke against vite preview :4173 (needs a build); screenshots → tests/shots/
npm run check          # all three
```
Smoke options: `SMOKE_URL=http://localhost:<port>/` (use your own dev server), `SMOKE_ONLY=<area|block>`, `--headed`, `--verbose`, and `SMOKE_GPU=gl|d3d11|swiftshader`.
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
- **JS heap (PERF §5) FAILs:** meadow idle on Med holds 202 MB (built) / 257 MB (dev) vs the 120 MB budget
  (`perf:frame` heap gate). Likely retained GLB / audio ArrayBuffers after upload; needs a heap profile (core / assets).
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
