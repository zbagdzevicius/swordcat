# SWORDCAT: WARM ADVENTURE SPEC (visual clarity, fun, warmth, onboarding, story)

Author: lead integration, 2026-10-11. Status: **binding**. It merges four audit drafts, which stay as appendices with
the full string tables and evidence: `wa_clarity.md` (CL), `wa_light.md` (LI), `wa_onboarding.md` (ON) and
`wa_story.md` (ST). It sits on top of `ART_WARM_SPEC.md` (ART), `PERF_SPEC.md` (PERF), `AUTOCAM_SPEC.md`
(AUTOCAM), `research/CONTROLS_SPEC.md` (CONTROLS) and `IMPLEMENTATION_PLAN.md` (PLAN). Build order, gates and
per-area tasks are in PLAN "Phase W".

User request (verbatim): *"make it much better from visual perspective than league of legends ( not graphics /
hexagons perspective, but from visual clarity, fun, warm and etc ). and upgrade onboarding, story to feel more warm.
right now it looks kind of dark, too medieval, it should have fun adventure vibe."*
Earlier direction (still binding): *"warm cartoonish thematics so that everyone will feel great inside, not 90s
nostalgic game, performance must be extraordinary, maximum moba-like automatic camera."*

**Design only.** Nothing under `src/` was changed while writing this spec.

---

## 0. Precedence and how to read this file

| Topic | Winner |
|---|---|
| Tone, brightness, palette per level, time of day, prop vocabulary, copy, story order, onboarding flow | **This file** (it overrides ART where they differ; each override is listed in §1 as `WA#` with "ART ⇒") |
| Draw calls, triangles, programs, post passes, DOM/style-write limits, timings | **PERF / PLAN §5.** Nothing here may exceed them. §11 has the cost of each item. |
| Camera framing, lens, beats | AUTOCAM. This file only asks for things that fit inside it (WA5). |
| Input, touch-cluster geometry, HUD strip geometry, fog **density** in gameplay | CONTROLS (fog densities stay as in ART D13/X16) |
| Anything that is not changed here | ART / PLAN as written |

Rules for implementers (in addition to PLAN's ground rules):
- No literals in area code. All new numbers are listed in §12 and land in **one** core commit (task `core.W1`).
- Code ids never change: `bonehead`, `jelly`, `hub_grey`, `forest_night`, `keep_storm`, `meadow_night`, save flags.
  Only display text, presets and visuals change. Renamed presets keep alias keys.
- Every visual effect here reuses an existing pool: `GroundDecals` (1 draw, MAX 160), `Marks` (1 draw),
  `Particles` (1 draw), the `DamageNumbers` DOM pool (20), CSS on `#ui`. The **only** new play draw is `Bunting`
  (+1). No post-processing anywhere in gameplay, title or Meme Cam.

---

## 1. Decisions (conflicts resolved)

| # | Conflict | Decision |
|---|---|---|
| WA1 | Which spec wins on look | This file on tone and brightness, PERF on budgets (§0). |
| WA2 | Interactable colour: CL butter `#FFD84A` + pulse; LI mint `#9BE3C4` (butter collides with the mustard rat helm `#E0B043`) | **Mint.** Interactables get a mint ring `#9BE3C4` α 0.30 (0.8 Hz, ±6 % r pulse) and a white → mint `STAR4` twinkle. Butter is kept for UI and bunting only. |
| WA3 | Companion ring colour (CL mint dashed) collides with WA2 | Companions: **sky `#8FD3FF`**, dashed (8 dashes), r 0.5 m, α 0.35. |
| WA4 | Hero "sun spot": CL decal disc (additive cream) vs LI warm pool through `ENV_U.uGlow` | **`uGlow` only** (LI W18): by day `hero` 0.40, radius 2.6 m, colour `#FFE6B8`; at twilight/night `hero` 1.0, radius 3.5 m. The additive decal is dropped because it would double-lift the cream path and clip. CL's ring change is kept (§3.2). ART ⇒ `hero` 0.20–0.25 by day becomes 0.40. |
| WA5 | `playScale 1.12` vs AUTOCAM `herFrame` | AUTOCAM frames her **capsule**, not the visual bbox. Framing does not change. |
| WA6 | CONTROLS §10.1 "parchment and gold" ability bar vs candy UI | **Candy wins**, skin only. CONTROLS geometry (slot sizes, 18 % strip, cluster) is unchanged (PLAN X22). |
| WA7 | Celebrations pause: CL never; ON pauses the Mochi friend card 1.6 s | **Never pause gameplay.** The friend card plays at the `d01` hand-back, when no enemy is alerted, so no pause is needed. In combat every card uses the docked variant (§5.4). |
| WA8 | Two reward systems: CL Celebration Card, ON stickers | **One system**, `ui/celebrate.js`, three sizes: `sticker` (small), `card` (unlocks, Heart Bells, shards, kittens), `friend` (biggest). The sticker book is kept. |
| WA9 | Comic pops: ON world sprite pool (+1 draw) vs CL DOM words (0 draws) | **DOM**, in the `DamageNumbers` pool, style `pop`. 0 draws. |
| WA10 | Prologue order: ST keeps CS-01 first; ON plays first | **Play first** (ON §2): title → Morning Practice → Height Chart → Giggling Mist (CS-02) → Suit Up → Chapter 1. ST's lines are merged into those scenes (§7–§8). |
| WA11 | Practice: ON 7 steps with Pearl as a visible guide; ST 9 steps + a "Very Suspicious Cow" cheering; CL 9 steps | **7 steps, Pearl guides** (ON §4.1). ST's cow is merged into the Meow step: Pearl hides in the cow, and the `tut.cow.*` lines become the "warmer / colder" clues (§7.4). CL's ghost paw and progress dots are used, timed per ON. |
| WA12 | Bright Slash: in practice (now, ST, CL) vs at Mochi's lock (ON) | **At Mochi's cracked lock**, which gives the skill a reason. |
| WA13 | Names: "Practice with Pearl" (ON) vs "Morning Practice" (ART, LI, ST) | Quest and tutorial title **"Morning Practice"**. Prologue chapter `ch.prologue` **"Knighting Morning"**. The chart scene is named "One Ear-Tuft Short". |
| WA14 | Height chart line: ON drops "Too small for the sword"; ST keeps the meme | **Keep the meme and soften it:** "Too small for the sword, Clementine. One ear-tuft short. Next year!" |
| WA15 | CS-02: ST sunset + fog 0.075 + "trembling paws"; ON lavender `meadow_giggle` + fog 0.062 + 50 s cut + letter beat + sunbreak | **ON staging + ST name and audio.** "The Giggling Mist", about 50 s, `meadow_giggle` (§2.3), fog 0.062 (cutscene only; gameplay densities untouched), giggle loop with no drums, letter drop beat, sunbreak rim at the end. Trembling ECU dropped. Every story fact and the meme shot stay. Gated by `STORY.cs02Cut` (default `true`); `false` restores the long cut until the design owner signs off on GAME_DESIGN's "never cut" (§13). |
| WA16 | Mochi's rescue: Old Bridge `[30, 74]` (ST, today) vs `[-14, -41]` (ON) | **Moved to `[-14, -41]`** (first friend by about 6:30). The Old Bridge carrier holds kitten Biscuit. Line `d01.3` = "Then we're the Almost Knights!" |
| WA17 | Prologue time of day | Title and practice `meadow_morning` (new) · chart `meadow_day` · raid `meadow_giggle` (new) · suit-up `meadow_evening` (golden barn) · Chapter 1 `meadow_day`. `meadow_night` is kept for callbacks only. ART ⇒ ART §9.4 kept the night preset under the "Morning Practice" name, which was a mismatch. |
| WA18 | Bog and keep moods: ART day `bog` and `keep_storm` default | **`bog_dusk`** and **`keep_twilight`** are the defaults (LI §4.5–4.6). `keep_storm` is used only for Barkus P3. `forest_night` becomes an alias of `forest_twilight`. Twilight frame floor **mean luma ≥ 0.36, dark pixels ≤ 15 %** (ART G1/G4 night rows were 0.32 / 20 %). |
| WA19 | Keep lights: ART brazier pairs vs LI jack-o'-lanterns vs ST barbecue grills | **Jack-o'-lanterns** (they feed `uLamps`). The copy says "a drafty party castle". No fire baskets in play. |
| WA20 | Cages: LI wooden carriers with bows vs ST polka-dot carriers | **Wooden slat carrier** `#B7773F` / rope `#E8B87A`, lilac bow `#C9A8FF`, with a **polka-dot cushion** `#FF9EC0` and cream dots visible inside. No metal and no bars thinner than 0.06 m. Display word: "kitten carrier". |
| WA21 | Results music: ART `festival_minstrel_dance` loop vs ST `jingles_PIZZI03` | Loop `festival_minstrel_dance` (ART). `jingles_PIZZI03` plays as the rank-stamp sting. |
| WA22 | Tutorial copy: three versions | **ON §4.3** hint table (≤ 7 words) wins. CL's two glyph one-shots are adopted, shortened (§7.3). ST's longer `tut.*` rows are used only for the **post-prologue** hint table where ON has no row. |
| WA23 | Kitten rescue copy | Card title "Kitten found! {n}/{max}". Rotating line: "Off home you go!" / "Safe and snuggly." / "One more for the nap pile." |
| WA24 | Gate ambient: ART keeps `ash` | ART ⇒ **`dust` `#FFE0C0` + 6 swallows** (LI W9). |
| WA25 | Interactable visual scale ×1.25 (ART) + hover boing (CL) | Both. The boing is visual only (±4° wiggle 0.25 s); colliders follow ART. |
| WA26 | Squeakybones (ST) vs bone soldiers | Adopted: bone tint `#F3E6C8`, red rubber knob `#E46A5A`, squeak SFX on reassembly. Id `bonehead` stays. |
| WA27 | ON principle 2 "no cutscene > 25 s before minute 4" vs CS-02 ≈ 50 s starting ≈ 3:20 | **Principle restated (§6.1):** no cutscene > 25 s *before Morning Practice is complete*. CS-02 is the one long scene in the first 10 min; it starts only after the practice `tut.done` sticker and ≥ 3 positive beats, and shows the hold-to-skip ring from 0 s on every view (skip jumps to the sunbreak shot, so the story facts still land in 6 s). |
| WA28 | Bunting lantern variant "8-tri octagon prism" × 240 = 1.9k tris vs §11 "≤ 480 tris" | Lantern = 4-sided bicone (**8 tris**), and lantern strings cap at **60 instances (Low 30)**; pennants keep 240 (Low 120). Mixed levels: `pennants × 2 + lanterns × 8 ≤ 480` tris (Low 240). Asserted in `world.W7`. |
| WA29 | `keep_cellar` (Kennel Cellars, playable) kept ART's mauve-brown `#6A4A50` row; `sky_night` and `meadow_night` callbacks had no frame floor | `keep_cellar` becomes a **"toy cellar"** row (§2.3); every non-day preset is in the §2.3a target table with numbers. |
| WA30 | Dark FX/UI literals the presets cannot reach (black landing disc, grey debris, black letterbox and fades, black text shadows) | Swept by literal in §2.7 (`fx.W6`, `ui.W7`). Rule: **no colour with HSV V < 0.20 anywhere in fx/ui source** except the cocoa ink family `#2A1E18`–`#5A3B2E`. |
| WA31 | Player knock-out had no visual or audio spec (today: `dead` state, `pickup/powerup_downer01` "ghostLife" sting) | **Dizzy sit + boing back** (§5.7). No lying flat, no ghost, no downer sting, no red/grey screen. |

---

## 2. Light, palette and haze (why it looks dark: fixed)

### 2.1 Root causes (LI §1) and the fixes adopted here
| Cause | Fix | Ref |
|---|---|---|
| Near-black ground, ACES, 1.15 vignette, grey presets | ART §2.5/§2.6, D1, D2 (already planned in PLAN S1/S3) | ART |
| Hard-coded grey defaults (`HeightFog.js:19`, `Sky.js:51–52`, `MistCards.js:140,304,344`, `GroundMist.js:139`, `Game.js:110`) | Every default = `meadow_day` ART row (`#F6E4C0` / `#EED6A6`); `Sky.js` `uGround` `#C9A46A` | LI W1 |
| Mist walls α 0.62 grey | `MistCards.js` `WALL.maxA` 0.62 → **0.48**; colour = `fogColor` lerped 0.35 to lilac `#E8DCFF`; 1 `STAR4` per 3 cards every 1.5 s | LI W2 |
| Ground mist densest on the spooky levels | `GroundMist.js` muls: bog 0.8, forest_twilight 0.7, gate_dusk 0.6, keep_* 0.5, meadow_night 0.6, meadow_morning 0.7, bog_dusk 0.8, hub_hush 0.5 | LI W3 |
| Assets greyed through `kit.tpl` `sat`/`mul` | LI W4 table (gate pillar `{tint '#E8B898', sat 0.9, mul 1.0}`, meadow bridge `{tint '#E3CFAE', sat 0.8, mul 1.0}`, hay `sat 0.6 tint '#F2D27A'`, …). Lint: no `sat < 0.5` or `mul < 0.8` without `// mood:` | LI W4 |
| Mud stamps `kit.paint` | Remap per LI W5; paint luma ≥ 0.30 | LI W5 |
| Slate silhouettes and a castle skyline | Skyline `#8E86C0` toFog 0.55, horizon `#5E9A62` toFog 0.6, forest `#3E7A62`, bog `#4E8A80`, night/keep `#5A4E90`. Meadow skyline: `mountain_B_grass_trees` + `hills_A_trees` + `building_windmill_blue`, tower recoloured blue | LI W6, W7 |
| Night-first story | §2.2 timeline (WA17) | LI W8 |
| Medieval proc palette | LI W17 table in `world/Props.js` (`PROP_PAL`), imported by the levels | LI W17 |

### 2.2 Mood timeline (binding: no playable default is ever night)
| Beat | Preset | Time of day |
|---|---|---|
| Title, Morning Practice | `meadow_morning` | golden morning |
| Height chart | `meadow_day` | late morning |
| CS-02 Giggling Mist | `meadow_giggle` | lavender sunset |
| Suit Up (barn chest) | `meadow_evening` | golden evening |
| Ch 1 meadow | `meadow_day` | next morning, misty |
| Ch 2 forest / Lantern Night (CS-04 camp) | `forest_day` / `forest_twilight` | dappled day / cozy periwinkle |
| Ch 3 town / hub | `town_occupied` → `hub_gold` | afternoon |
| CS-10 "Big Yawn" | `hub_hush` (alias `hub_grey`) | lavender |
| Ch 4 gate | `gate_dusk` | seaside sunset |
| Ch 5 bog | `bog_dusk` | firefly dusk |
| Ch 6 keep | `keep_twilight`; `keep_storm` only in Barkus P3 | moonlit party castle |
| Ch 6 Kennel Cellars | `keep_cellar` (WA29) | candle-warm toy cellar |
| Ending | `ending_gold` | gold |

Rules: night, twilight and storm presets are only used for story beats of ≤ 90 s, or for a **cozy** twilight that has
its own lamps (`uLampStr` 1, `hero` 1, fireflies, mean luma ≥ 0.36). Night means periwinkle and indigo with warm lamp
pools; it never means navy-black.

### 2.3 New and changed `ENV_PRESETS` rows (`world/Env.js`; ART keys `shadowI`, `exposure`, `rim`, `hero`)
Fog **densities** are the gameplay values from CONTROLS/ART D13; only cutscene-only presets set their own.
```js
meadow_morning:  { fogColor:'#FFE6CC', fogDensity:0.045, fogLow:'#F2D3A8', skyTop:'#9FD0F5', hemiSky:'#CBD8FF', hemiGround:'#D4A874', hemi:1.25, sunColor:'#FFE0B0', sun:2.3, sunElev:0.40, sunAz:-1.9, grade:'none', wind:0.5, env:0.25, shadowI:0.55, exposure:1.02, rim:'day', hero:0.40 },
meadow_giggle:   { fogColor:'#CDBDF2', fogDensity:0.062, fogLow:'#BFAFEA', skyTop:'#B9A9E8', hemiSky:'#D9CCFF', hemiGround:'#C9A0B0', hemi:1.20, sunColor:'#FFD8E8', sun:1.6, sunElev:0.22, sunAz:-1.9, grade:'none', wind:0.9, env:0.25, shadowI:0.50, exposure:1.02, rim:'#FFD8A0', hero:0.6 }, // cutscene only
meadow_night:    { fogColor:'#5A64A8', fogDensity:0.050, fogLow:'#525C9E', skyTop:'#2E3A7E', hemiSky:'#9CB0F4', hemiGround:'#4A4478', hemi:1.15, sunColor:'#C6D6FF', sun:0.9, sunElev:0.9, sunAz:0.6, grade:'night', wind:0.4, env:0.25, shadowI:0.50, exposure:1.08, rim:'night', hero:1 },
forest_twilight: { fogColor:'#6A66B4', fogDensity:0.055, fogLow:'#5A6E96', skyTop:'#3A3E96', hemiSky:'#B0B6F4', hemiGround:'#3E6A58', hemi:1.25, sunColor:'#D6E6FF', sun:0.9, sunElev:0.9, sunAz:0.6, grade:'night', wind:0.3, env:0.25, shadowI:0.50, exposure:1.10, rim:'night', hero:1 },
bog_dusk:        { fogColor:'#86C2C8', fogDensity:0.058, fogLow:'#6AAFA8', skyTop:'#7A68C8', hemiSky:'#B8A8F0', hemiGround:'#3E7A66', hemi:1.35, sunColor:'#FFCF98', sun:1.6, sunElev:0.28, sunAz:-0.6, grade:'none', wind:0.3, env:0.25, fogFalloff:1.2, shadowI:0.50, exposure:1.05, rim:'#FFF0C6', hero:1 },
keep_twilight:   { fogColor:'#8A74B0', fogDensity:0.042, fogLow:'#8E6A8A', skyTop:'#3E3A8E', hemiSky:'#CDB8F4', hemiGround:'#6A4E5E', hemi:1.45, sunColor:'#BFEDE6', sun:1.0, sunElev:0.55, sunAz:0.4, grade:'night', wind:0.5, env:0.25, shadowI:0.45, exposure:1.08, rim:'night', hero:1 },
// changes to ART rows: meadow_day/forest_day/town_occupied/gate_dusk hero 0.40 (WA4); forest_day hemiGround '#A08A52';
keep_cellar:     { fogColor:'#A88AB0', fogDensity:0.028, fogLow:'#9A7A96', skyTop:'#5A4E9A', hemiSky:'#F2D2B4', hemiGround:'#7A5A6A', hemi:1.55, sunColor:'#FFD6A0', sun:0.8, sunElev:0.9, sunAz:0.4, grade:'night', wind:0, env:0.25, shadowI:0.40, exposure:1.10, rim:'#FFC46B', hero:1 }, // WA29 "toy cellar": candle-warm, jack-o'-lantern pools
// changes to ART rows: meadow_day/forest_day/town_occupied/gate_dusk hero 0.40 (WA4); forest_day hemiGround '#A08A52';
// hub_hush exposure 1.02. Aliases: forest_night → forest_twilight, hub_grey → hub_hush, bog (day) kept for the Wardrobe/debug.
```

### 2.3a Frame targets per preset (binding; measured by `core.W4` `art:warm` on a 64 × 36 readback, actors excluded for dark %)
| Preset | Used for | Mean luma | Dark px (luma < 0.2) | Black px (< 0.06) | R − B | Fog HSV sat |
|---|---|---|---|---|---|---|
| `meadow_morning` | title, practice | 0.52–0.62 | ≤ 6 % | < 0.5 % | +0.08…+0.16 | ≥ 0.15 |
| `meadow_day` | chart, Ch 1 | 0.52–0.60 | ≤ 6 % | < 0.5 % | +0.08…+0.14 | ≥ 0.15 |
| `meadow_evening` | suit-up | 0.48–0.58 | ≤ 8 % | < 0.5 % | +0.12…+0.20 | ≥ 0.18 |
| `meadow_giggle` | CS-02 | ≥ 0.44 | ≤ 10 % | < 0.5 % | ≥ −0.02 | ≥ 0.15 |
| `forest_day` | Ch 2 | 0.48–0.58 | ≤ 8 % | < 0.5 % | +0.06…+0.14 | ≥ 0.12 |
| `forest_twilight` | Lantern Night | ≥ 0.36 | ≤ 15 % | < 0.5 % | ≥ 0.0 | ≥ 0.25 |
| `town_occupied` / `hub_gold` | Ch 3 / hub | 0.50–0.60 | ≤ 6 % | < 0.5 % | +0.08…+0.16 | ≥ 0.15 |
| `hub_hush` | CS-10 | ≥ 0.44 | ≤ 10 % | < 0.5 % | ≥ −0.02 | ≥ 0.12 |
| `gate_dusk` | Ch 4 | 0.50–0.58 | ≤ 8 % | < 0.5 % | +0.10…+0.16 | ≥ 0.18 |
| `bog_dusk` | Ch 5 | ≥ 0.40 | ≤ 12 % | < 0.5 % | ≥ −0.04 | ≥ 0.15 |
| `keep_twilight` / `keep_cellar` | Ch 6 | ≥ 0.36 / ≥ 0.38 | ≤ 15 % / ≤ 12 % | < 0.5 % | ≥ 0.0 / ≥ +0.04 | ≥ 0.20 |
| `keep_storm` | Barkus P3 only | ≥ 0.34 | ≤ 18 % | < 1 % | ≥ 0.0 | ≥ 0.12 |
| `meadow_night` / `sky_night` | ≤ 90 s callbacks | ≥ 0.36 | ≤ 15 % | < 0.5 % | ≥ −0.06 | ≥ 0.25 |
| `ending_gold` | ending | 0.55–0.65 | ≤ 5 % | < 0.5 % | +0.12…+0.20 | ≥ 0.18 |
A preset that fails its row may not ship; the fix is preset data (hemi, exposure, fog colour), never a post pass.
`uLampStr`: 1 for `meadow_night`, `forest_twilight`, `bog_dusk`, `keep_*`; 0.35 for `gate_dusk`; 0 elsewhere.
`grade:'night'` remains a motes key (`Ambient.motesFor`); `bog_dusk` uses `'none'` and its own motes row.

Per-level ground, accent sets and frame targets: LI §4.1–4.6 (adopted as written). Accent sets are the only colours
that bunting, banners, flower boxes and lanterns may use on that level.

### 2.4 Ambient motes (`fx/Ambient.js` profiles)
meadow → fluff + petals · forest day → golden `dust` `#FFE9C9` 0.6 · forest twilight → fireflies 64 ·
town/hub → dust + 20 petals · gate → dust `#FFE0C0` + 6 swallows · bog_dusk → fireflies 56 + spores `#B8F0D8` 30 ·
keep → lantern sparks `#FFC46B` 40 + fireflies 24. Low tier ×0.5 (ART §8.6 rule).

### 2.5 Prop vocabulary: from "medieval war" to "storybook adventure"
Principle: rounded, toy-scaled, 2 colours + 1 accent. **Nothing in play that says death, war or dungeon**: no
gravestones, crosses, coffins, gibbets, iron-bar cages, siege wrecks, skulls, fire baskets or torches. Spooky is
allowed only as Halloween-cute: pumpkins, a friendly moon, fireflies and glowing mushrooms. All swaps use packs
already on disk and are merged per biome (ART §8.3 rule 6), so they are draw-neutral.

| Where | Swap | Ref |
|---|---|---|
| Every Vigil Stone | `statue_obelisk` + `lantern-candle` → **waystone** `nature/stone_tallB` (h 1.3, `#E3CFAE`) + proc paper lantern on a crook (cream `#FFF0D6`, cap `#E0794F`, emissive `#FFC46B` 0.6 when lit) + pink ribbon `#FF8FB1`. When lit: mint ring `#9BE3C4` α 0.35 r 1.2 | LI W10 |
| Meadow | skyline (W7); drystone walls tinted `#E8D6B4` with a merged flower strip on top; bunting barn → gate; "kitty garden" crop beds | LI §5 |
| Forest | palette (bark `#7E4E2A`, leaf `#58A84A`), rat-camp torches → stake + uncarved pumpkin lantern, rat banners → cheese wedge on teal `#3FA59A`, mushroom clusters ×24, fall trees ×6 (≥ 6 m from spine) | LI §5 |
| Town | occupied = **prank** banners (plum `#7A4E9A` + mustard hyena doodle) + 3 "HA HA" paw decals; free = 5 bunting strings, festival stage (hub only), flower boxes, candy-row house tints | LI W11 |
| Gate | Old Battlefield → **"Hyena Toy Fort"**: intact catapult and ballista with pennants, crates/barrels/hay instead of debris, foam-tipped practice lances, painted round shields, no craters. Colliders identical. Wall torches `#FF8A3D` → lamp `#FFB070` | LI W15 |
| Bog | normal trees with canopy `#7FC8A0` + hanging moss; 30 glowing mushrooms (lilac `#C9A8FF` / mint `#8FF0D8`, emissive via vertex mask, 1 merged mesh); 12 lamp posts (honey `#B7773F`, glass `#FFC46B`) feeding `uLamps` | LI W13, W14 |
| Keep | jack-o'-lanterns ×10 (WA19); honey rock `#C8A486` with teal moss tops; Barkus's vanity bunting royal blue `#5A7FD6` / bone-gold `#F2D06B`; blue/yellow banners from `dungeon-kaykit`; moon disc in the 'far' group (cutscenes only) | LI §5 |
| Rescue carriers (Mochi, Sage, war-wagon, Biscuit) | WA20 | LI W16, ST §2 |
| Mochi's first carrier at `[-14,-41]` | tipped 8°, one broken-wheel prop, lilac bow on a **cracked** lock | ON §6.1 |
| Barkus weapon | "Big Squeaky Bone" mallet look (same hitbox and timings); edge glows telegraph colour only during wind-ups | ST §2 |
| Marmalade's dive (CS-08) | ballista bolt → cart-wheel tennis ball | ST §2 |
| Squeakybones | WA26 | ST §2 |
| Tallbert statue | stone `#B9A79A`, moss `#8FBF6A` | ON §5.5 |
| Practice props | sack → "Sir Sacky" `#E8A46B` with a face decal; Wobble Knight → "Sir Wobble" with a painted smile | ON §4.2 |

### 2.6 `world/Bunting.js` (new; the one added play draw)
One `InstancedMesh` per level: triangular pennant (2 tris, 0.28 × 0.34 m) or lantern variant (4-sided bicone, 8 tris,
forest and bog; max 60 lantern instances, Low 30; WA28). Lambert + toon patch (shares the world program), `castShadow false`, per-instance colour from the
level accent set (cycle 3, ±4 % L jitter). Catenary strings (sag 12 %, spacing 0.55 m, ≥ 3.2 m high) authored as
`def.bunting: [{ a:[x,y,z], b:[x,y,z], set:'accent'|['#hex'], kind:'pennant'|'lantern' }]`. Flutter on the bottom
vertex: `sin(uTime*2.3 + id*0.7) * 0.06 * wind`. Cap **240 instances (Low 120), 1 draw**. Strings crossing the lens
segment fade to α 0.3 through CONTROLS `camFade`.

### 2.7 Dark-literal sweep in fx and ui (WA30; presets cannot reach these)
Seen in `docs/screens/11-crowfields.png`: a near-black disc under her while airborne, grey debris and grey bubbles.
| File:line (today) | Now | Becomes |
|---|---|---|
| `fx/GroundDecals.js:470` landing disc | `'#000000'` α 0.25–0.45 | `TONE.blob` `#5A4E7A` α 0.22–0.34 |
| `fx/GroundDecals.js:34–35` palette | `white #E6ECF4`, `silver #E8EEF4`, `grey #9AA0A6`, `blob #1A1410` | `#FFF6E8`, `#FFF1DC`, `#C9B8A8`, `#5A4E7A` (plus §3.3 hero/red/aggro) |
| `fx/Shockwaves.js:255,288,308,309` debris / dust | `#7A6A58`, `#CBBFA9`, `#C9BDA6`, `#8C8A84` | `#C49A6C`, `#F2DDBB`, `#EFD8B4`, `#D9B48A` (warm sand; per-level override = level `GROUND.path`) |
| `fx/Horde.js:23` CS-02 horde silhouettes | `#2A2A2E` | plum `#5A3E6A` (still reads as a crowd against `meadow_giggle` lilac fog) |
| `fx/Poof.js:32` crow feathers | `#2B2A36` | `#6A5A8A` |
| `fx/Telegraphs.js:455` crow shadow | `'#05070A'` | `TELEGRAPH.colors.shadow` `#3A2346` α 0.55 |
| `ui/cinema.js:20` `'black'` / `'out'` fade | `#000000` α 1 | `#FFF1DE` α 1 (a dark fade, if a scene really needs one, is `#3A2630`) |
| `ui/ui.css:310` `.cin-bar` letterbox | `#0B0908` | cocoa-plum `#3A2630` with the existing 10 px scallop mask on the inner edge |
| `ui/ui.css:314` `.cin-fade` | `#000` | `#FFF1DE` |
| `ui/ui.css:192,341,438` text-shadows | `#000` | `#4A2A1F` |
| `ui/portraits.js:79` dark ink | `#0B0C0F` | `#2A1E18` |
Lint (`fx.W2`): scan `src/fx/**`, `src/ui/**` for hex literals with HSV V < 0.20 that are not in the cocoa ink allowlist
(`#2A1E18`, `#3A2A1F`, `#4A2A1F`, `#5A3B2E`, `#3A2630`, `#3A2346`) → fail.

### 2.8 Clouds and moon (cutscenes only)
3–6 cartoon clouds (`village-kaykit/decoration/cloud_big|small.glb`, unlit Basic `#FFFFFF` lerped 0.25 to fog) merged
into 1 draw, plus the keep moon disc `#F6F0D8` r 14 m and a halo sprite `#BFEDE6`, all in the 'far' group (hidden in
iso). +1 draw in cutscenes, 0 in play.

---

## 3. Visual clarity: one language that is readable at a glance

League separates friend and foe with team colour. SWORDCAT uses **three channels at once: hue, shape and motion**, so
the read survives a 5-inch screen in sunlight and colour blindness, on a ground that is bright and calm.

### 3.1 Layer budget (LI W19; gated numerically)
| Layer | Luma | Chroma | Hue | Never |
|---|---|---|---|---|
| Ground and path | 0.45–0.70 | 0.12–0.28 | 35–110° | red/orange chroma > 0.30 within 3 m of the spine |
| Props and foliage | ±1 value step from ground | 0.15–0.40 | any; red/orange/pink only above 1.6 m | black; grey (HSV sat < 0.08) |
| Enemies | body 0.25–0.55 | 0.20–0.45 | 200–290° + top colour | pink, ginger |
| Hero and companions | 0.45–0.85 | ≥ 1.5 × ground (gate, was 1.3) | ginger, pink, red cape | — |
| Danger (telegraphs) | — | ≥ 0.55 | 0–30° (+ violet grab) | used for anything else |
| Interactables | — | — | mint `#9BE3C4` + white | butter (WA2) |
| Pickups | — | — | cream/gold twinkle `#FFF1C4` / `#FFD57A` | rings (clutter) |

### 3.2 Five classes (CL §2.1, with WA2/WA3)
| Class | Ground mark | Motion signature | Above-head (Marks) |
|---|---|---|---|
| Hero | ring `#FF8FB1` r 0.75, **α 0.55, width 0.08 m**, + cocoa edge; warm `uGlow` pool (WA4) | bouncy gait, idle ladder (§5.6) | none |
| Friends | companions: sky `#8FD3FF` dashed ring r 0.5 α 0.35; villagers/kittens none | hop-follow, glance | heart pip `#FF6F9C` 0.6 s when they help |
| Foes | none at idle; thin coral aggro ring when alerted | comic "tell" hop before attacks; squash −0.10 at wind-up | "!" on alert, glint on wind-up |
| Interactables | mint ring α 0.30, 0.8 Hz pulse | 3 s idle wiggle ±4°, boing on hover/press | `STAR4` white → mint every 2.5 s (≤ 6 zones within 8 m) |
| Pickups | none | bob + yaw spin 1.2 rad/s | `STAR4` `#FFF1C4` every 1.2 s ±0.3 (gold fish `#FFD57A` every 0.6 s) |

Rules (unit lint `colorLanguage.test.js`): (1) pink hue 335–350° is hero-only on the ground; (2) hue 0–30° with
S > 0.6 on the ground means enemy attack and nothing else; (3) mint ring = "you can use this"; (4) every ground mark
has a 0.03 m cocoa `#4A2A1F` outer edge at α 0.35 (the "ink sandwich"), so it reads on cream path and on grass.

### 3.3 Hero pop-out
- `READABILITY.playScale` **1.12** on the model root in `ISO_MODES` (`Readability.js:30`); lerps to 1.0 over 0.3 s on
  the cutscene hand-off. Companions 1.08, enemies and bosses 1.0. Hitboxes, `MODEL_FIT` and nav radius unchanged.
- Bow top-view ×1.25 → **×1.4** at lens ≥ 12 m.
- Cape in play: Meme White cape becomes cream `#FFF3E2` with a pink `#FF9EC0` hem stripe (one atlas edit). Red stays
  the default.
- `GroundDecals` palette (`GroundDecals.js:34`): `hero/move '#F7A8C4'` → `#FF8FB1`; `red '#FF6A3D'` → `#FF9A3D`;
  `aggro '#FF3B30'` → `#FF5A4E`; `blob '#1A1410'` → ART `TONE.blob #5A4E7A`.

### 3.4 Telegraphs readable by shape (CL §3, adopted)
Five glyphs for the whole game, drawn as `GroundDecals` SDF shapes (0 draws), 0.45 m (touch 0.55 m), at the tip of
every wedge and the centre of every disc:
| Kind | Fill | Rim | Glyph | Taught by |
|---|---|---|---|---|
| `parry` | sweep α 0.25 | white + ink | **shield** | Morning Practice (parry) |
| `gold` | sweep α 0.30 | `#FFD34D` + ink | **8-point star** | first gold attack (hint) |
| `red` | filled α 0.35 | `#FF5A4E` jagged | **double chevron** along the lunge | `tut.red` one-shot |
| `aoe` | concentric grow α 0.30 | `#FF9A3D` | **6-dot burst** | `tut.aoe` one-shot |
| `grab` | sweep α 0.25 | `#9B5CFF` + ink | **paw-hand** | first grab (hint) |
| `shadow` (crow) | plum `#3A2346` α 0.55, shrinks 1.6 r → r | none | crow-foot | — |
| `aim` | dotted → solid when locked | white | arrowhead | `tut.reflect` |
Timing: rim α 0.6 during wind-up 0–70 %; parry window opens → rim 2 → 4 px and the glyph pops ×1.3 → 1.0 over
0.08 s, enemy stretches +0.12; strike → wedge white α 0.8 for 0.05 s, fade 0.12 s. Phone rim minimum 0.14 m.
`threatArrows.js` shows the same glyph inside the arrow. Aim-line shader near-black `vec3(0.04,0.025,0.02)`
(`Telegraphs.js:295/299`) → cocoa `vec3(0.29,0.16,0.12)`.

### 3.5 Arena stage floor (LI W20)
Every `kind:'arena'` zone stamps `kit.paint(at, r+1, GROUND.path lifted +8 % L, 0.35, 3)` and grass ×0.4 inside it,
so fights happen on a calm, bright plate and grass no longer cuts through telegraphs. 0 draws.

### 3.5a Her hearts at her feet (in-world HP; League puts HP over every champion, we put it where the eye already is)
On a phone the eye lives on the hero, not on the top-left HUD. A **heart arc** sits on the hero ring: one `GroundDecals`
`FAN` segment per max heart (≤ 6 instances), centred behind her (180° yaw-locked to the camera, 120° total spread,
4° gaps), r 0.82–0.92 m. Full = `#FF6F9C` α 0.75; empty = `#4A2A1F` α 0.18; the segment just lost flashes white
`#FFFFFF` 0.12 s then shrinks to empty over 0.25 s; a healed segment pops 1.0 → 1.25 → 1.0 in 0.2 s.
Shown: 2.5 s after any HP change, and always while HP ≤ 1 (then the last segment pulses 1.4 Hz α 0.55 ↔ 0.9).
Hidden otherwise (calm ground). Cost: ≤ 6 of the 160 decal instances, 0 draws, 0 DOM. Keys `CLASS_MARKS.heroHearts`
(§12). Companions never show one (their state is in the portrait).

### 3.6 Orders, path and hover (CL §5)
- Tap/click: paw ripple `#FF8FB1` with cream inner, 0 → 1.15 → 1.0 in 0.12 s, + 2 `STAR4`. Head snaps 70 % toward
  the goal at λ 24 before the body turns, + `bowBounce`. Double tap on the same spot within 0.35 s → double paw + happy
  hop. A rejected order → grey ✕ paw + `emote('shake')`.
- `settings.pathPreview` default **`'auto'`**: on for touch during the prologue and Chapter 1, then off. Paws every
  1.2 m, `#FF8FB1` α 0.35, alternating ±0.08 m, drawn outward at 12 m/s.
- Hover/press boing: enemy `Squash.kick(-0.8)` + rim highlight; interactable ±4° wiggle 0.25 s, mint ring α
  0.30 → 0.55; NPC `nod` / ear flick once per 2 s. Touch triggers on `pointerdown`.
- Cursors: chunky rounded art, 3 px cocoa outline, no gauntlets: ginger paw with pink cuff (default), candy sword
  (enemy), paw + mint speech-dot (interactable). 32/48/64 px PNGs in `public/assets/ui/cursors/`.

---

## 4. HUD and UI: calmer and cuter than League

### 4.1 Calm HUD (`hud.js`; `settings.hudMode` `'calm'` default, `'full'` = today)
| Element | Shown when | Otherwise |
|---|---|---|
| Portrait + hearts | always | — |
| Grit shields, Valor sword | in combat (alerted enemy within 15 m), Stand held, or Valor ≥ 50 | fade α 0 over 0.3 s, 4 s after combat |
| Lives ×9 | on change, in menus, at ≤ 3 | tucked under the portrait |
| Fish / kittens / letter | on change (3 s), in the hub, while Tab / ⋯ held | slide up 12 px + fade |
| Ability bar / touch cluster | always in play | — |
Visibility via class toggles only. `ui.screenOccluders()` reports visible rects only; add a SafeFrame fixture for the
tucked state.

### 4.2 Candy skin deltas (on top of ART §9.1; geometry unchanged, X22)
- Ability slots: cream `#FFF8EE`, radius 14 px, 3 px cocoa `#5A3B2E` border, 4 px lip `#5A3B2E33`; cooldown sweep
  lilac `#C9A8FF` 55 %; on ready, scale 1.12 pop 0.18 s + white shine stripe + `ui/glass_001`. Keycaps: white pills,
  cocoa Fredoka 600.
- Enemy HP pills: cream track `#FFF6E8`, coral fill `#FF7A6B`, butter chip trail `#FFD86B`, 1.5 px cocoa border; elites
  get a mustard crown pip. Boss bar per ART; on the final hit it stamps **"BONKED!"** (`hud.boss.bonked`).
- Valor well `#2A211B@.55` → lilac `#5A4A7A@.35`, outline → cocoa `#5A3B2E`.
- Panels: no `--noise`, no gold studs (`ui.css:28–32`), 3 px cocoa border, flat cream with a 6 px butter `#FFE9A8`
  inner edge. A sticker book, not a parchment.
- Type: Fredoka only; titles 700, buttons 600, body 500; `tabular-nums` on counters; 16 px min, 18 px on touch prompts;
  no all-caps except one-word stamps.
- Speech bubbles: cream `#FFFDF6`, 2.5 px cocoa border, radius 18 px, 12 px tail, pop `scale .6 → 1.06 → 1` 0.22 s.
- Any load fade is cream `#FFF1DE`, **never** `#000`.

### 4.3 Title screen (ON §3)
- `cs00`: env `meadow_morning`, `fogDensity 0.035` (title only), wind 1.0. Pearl spawned 1.4 m left of Clem, `jump`
  every 2.6 s, look-at follows the pointer (yaw clamp ±0.6 rad); 6 pink hearts per jump from the FX pool.
- Delete `.title-shade`; replace with `radial-gradient(120% 90% at 50% 40%, #FFF8EE00 55%, #FFD9B866 100%)`.
- Logo `popIn` at 1.0 s (scale 0.6 → 1.08 → 1, 420 ms), then a 3.2 s idle bob ±4 px.
- No save: one `.btn--candy` 240 × 72 at 74 % height, appears at 1.4 s: **"Tap to play!"** / **"Press any key to
  play!"**. Save present: **"Keep going!"** (with `continueSub`) + **"New adventure"**. Settings gear top-right;
  Credits inside Settings. Footer "Made with lots of purrs". No main-menu panel, no difficulty picker.
- PERF X17 still holds: Pearl shares Clem's programs; no composer on the title.

### 4.4 Results (`ui/results.js`, CL §8.4)
Warm scrim `radial-gradient(circle at 50% 40%, #FFF1E2CC, #FFB98ACC)` over the frozen frame (no blur). Title
"Hooray! Chapter clear!" (butter → gold, cocoa stroke); rows stagger 80 ms and count up 0.4 s; rank stamp slams
(scale 2.2 → 0.92 → 1, rotate −14° → −8°, 0.3 s) with 8 DOM `STAR4`. Ranks: "PAW-SOME!", "PURR-FECT!",
"CLAW-SOME!", "Good kitty!". Confetti ≤ 24 DOM nodes. Hero portrait `happy`.

---

## 5. Fun and juice

### 5.1 Hitstop moments (CL §4.1)
During `hitstopT > 0`, on unscaled time: victim `uFlash` 1 → 0 over freeze + 0.06 s, `Squash.kick(-2.0)`, a 0.04 m
shake at 60 Hz; hit spark 3 `STAR4` `#FFFFFF → #FFE066` + 1 ring `#FFF6DA` 0 → 0.6 m, life 0.14 s. **Final blow** of
an encounter: `JUICE.finalBlow = { hitstopAdd: 0.06, slowMo: 0.25, timeScale: 0.35 }` + word "Bonk!". No camera zoom.

### 5.2 Damage numbers v2 (`fx/DamageNumbers.js`)
Overshoot curve 0 → 1.35 (0.06 s) → 0.95 (0.14 s) → 1.0, out 1 → 0.7 + fade last 0.25 s. Arc: rise 0.6 m + `dx`
±0.25 m alternating per combo step. Colours: normal `#FFFFFF`, heavy `#FFF1C4`, crit `#FFD34D`, heal `#9BE3C4`,
hurt-to-her `#FF8FB1`. Stroke `#4A2A1F`. Hits on one target within 0.35 s **merge** (bump ×1.15, count up).

### 5.3 Words and comic pops (WA9; DOM, same pool and rate limit)
- `word` style (`#FFF6DA`, 30 px, pink 3 px under-stroke, skew −4°, 0.25 m above **her** head, max 1 per 0.25 s):
  slash1 "Snip!", slash2 "Snap!", slash3 "Swoosh!", bright "Shine!", holy "Sunburst!", parry "Ting!" (gold), perfect
  dodge "Whoosh!", riposte "Riposte!", final blow "Bonk!". `settings.hitWords` default on.
- `pop` style (butter fill, cocoa stroke, 40 px, scale 0 → 1.2 → 1 in 180 ms, rise 0.6 m, fade by 0.7 s, over the
  **target**): "BONK!" (dummy burst, boss bonk), "PARRY!" (every parry), "CLANK!" (suit-up), "BOING!" (Sir Wobble
  wakes). `FX.comicPops`: parries `'always'`, the rest `'first'` (first 10 minutes).

### 5.4 Celebrations (`ui/celebrate.js`, WA7/WA8)
One queue, one item at a time, never pauses gameplay, skippable by any input after 0.6 s.
| Size | Used for | Look | Duration |
|---|---|---|---|
| `sticker` | practice lessons, small firsts | 88 px die-cut SVG (white 4 px outline), right-centre, `popIn` 280 ms, 2° wiggle, flies to the sticker-book icon after 1.4 s; glock up a third per sticker in a row | 1.6 s |
| `card` | Holy Slash, Golden Hour, companion joins, Heart Bell, shard, kitten | `#ui-flash` white-gold α 0.22 / 0.18 s; hero `cheer` 1.2 s + `Squash.kick(+2)`; world burst (ART §8.6: 60 confetti, 10 `STAR5`, 8 `HEART`, pink shockwave 0 → 2.2 m); card top-centre third, `scale .4 → 1.08 → 1` 0.28 s, 64 px icon on a rotating butter/cream `repeating-conic-gradient` (20°/s), title Fredoka 700 34 px, one line 20 px; flies into its HUD home at 1.6 s and the slot pops | 2.2 s |
| `friend` | Mochi, Sage, Clover joining; Pink Bow; Knight-ish | `card` + 200 px portrait + DOM confetti ≤ 24 nodes + `festival_minstrel_dance` 2 s sting | 2.6 s |
In combat (alerted enemy within 15 m) a `card`/`friend` docks at 60 % under the objective line with no flash and no
pose and flies home after 1.2 s. Card strings: CL §8.1 table, with `toast.mochi` "Mochi joined the party!" and the
WA23 kitten copy. Sticker set and colours: ON §7.2. Sticker book = pause-menu page, flags `sticker.<id>`.

### 5.5 Pickups loop (CL §6)
Idle twinkle (§3.2) + spin; magnet pull becomes a 0.35 m hop arc; collect = squash 1.3 → 0 over 0.1 s + 4 `STAR4` +
1 ring; DOM fly-to-HUD icon (pool 8) along a quadratic Bézier (control point 120 px above the midpoint, 0.45 s), the
counter bumps 1.25 → 1 over 0.2 s; pitch ladder `rate = 1 + 0.06 × n` (n ≤ 8, reset after 1.5 s). Kill drops pop out
in a hop arc (apex 0.9 m, 0.45 s, 2 bounces).

### 5.6 Life between fights (CL §9)
- Hero idle ladder (must end before `memeCam.idle` 15 s): 4 s glance, 7 s look-around, 10 s `groom` (paw lick
  1.4 s), 12.5 s `twirl` (sword spin 0.6 s with trail sparkle); after Meme Cam loop from 7 s with 10 % `sneeze`. Hub:
  20 s `sit` + tail swish, no Meme Cam.
- New procedural poses on the existing rig: `cheer`, `groom`, `twirl`, `boop`, `pawBump`.
- Companions: paw-bump after each encounter clear (within 8 m, 0.8 s, 3 `STAR4` + `HEART`, skipped if a new alert);
  nearest companion `meow` + heart mark on her parry; kill streak ≥ 3 in 4 s → one `cheer`; idle ladder offset 1.5 s;
  Mochi yawns, Sage `nod`s over a tiny book, Clover chases her tail.
- Tap/click her outside combat: `meow` + `bowBounce` + `HEART`; 3 taps in 1.5 s → `twirl`. Ignored in combat.
- Kitten rescue reunion: kitten runs 1.5 m to her, nose-boop (heads tilt 12°, 0.4 s), `HEART`, hop, sparkle trail
  (10 `STAR4`, 1.2 s Bézier toward the hub), counter fly-to-HUD.
- Companion banter: ST §5 pairs `banter.<id>.<n>` fire when no alert within 20 m for 25 s and the idle bark is off
  cooldown.

### 5.7 Knock-out: "dizzy sit, boing back" (WA31; player, fx, audio, ui)
The `dead` state keeps its id and timings; only the look and sound change.
1. 0.00 s: hitstop as a normal hit; she does **not** fall flat. Pose `sit` (existing) with head tilt 15°, sword
   dropped beside her (sword root detaches 0.3 m, no physics), 3 dizzy `STAR4` orbiting r 0.35 m at 2.5 rev/s
   (Particles, the boss-dizzy recipe). Companions run to her and `emote('shake')`.
2. 0.00–1.20 s: camera unchanged (AUTOCAM owns it); no desaturation, no red vignette, no slow fade.
3. 1.20 s: cream wipe `#FFF1DE` 0.35 s (cinema fade, §2.7), respawn at the Vigil Stone, then she pops up with
   `Squash.kick(+2)`, 6 `HEART`, `emote('hop')`; companions land 1.5 m beside her with a paw-bump.
4. Toast `life.lost` and the HUD lives badge pop (scale 1.25 → 1, 0.2 s).
Audio: `sfxMap.js:62` `ghostLife` (`pickup/powerup_downer01`) → `respawnBoing`: `cat/cat_mewpurr` vol 0.7 at the
wipe + `pickup/bubble` rate 0.8 at the pop. Strings: `life.lost` "Boing! Back on her paws. {n} lives left",
`life.lost1` "Boing! 1 life left. Careful-ish!", `life.last` "Last life! Big brave hops!", `bark.clem.respawn.1`
"Not strong yet. Still here." (kept, it is her), `bark.clem.respawn.2` "...Ow. Okay." `gameover.*` are already warm
("Time for a cat nap.") and stay.

---

## 6. Onboarding: the first 10 minutes

### 6.1 Principles (ON §1, binding)
1. < 5 s to control. 2. Play first; no cutscene longer than 25 s before Morning Practice is complete (WA27: CS-02
is the single exception, after `tut.done`, skippable from 0 s). 3. A friend is always near
(Pearl, then Mochi). 4. One verb per hint, ≤ 7 words. 5. Teach by doing, then celebrate; failure is silent.
6. One bubble on screen; it folds to a chip after 6 s; a ghost paw appears only after 8 s with no progress.
7. Daylight until the raid, lavender during it, gold after it; never night or grey (fog sat < 0.12) in the first
10 minutes. 8. Stakes stay, gloom goes.

### 6.2 Flow and clock (new save, average player)
```
TITLE (meadow_morning) ──tap──► MORNING PRACTICE (7 lessons, ~2:40) ──► HEIGHT CHART (20 s)
  ──► GIGGLING MIST (CS-02, ~50 s) ──► SUIT UP (chest + 18 s, golden) ──► CHAPTER 1 ──► MOCHI (~6:30)
```
Cold first session, wall clock from opening the page (PERF §1.3 budgets, phone 4G 4× CPU): warm splash ≤ 0.8 s ·
title interactive ≤ 5.0 s · tap → input unlock 0.35 s → **first accepted move ≤ 5.5 s after page open, ≤ 0.5 s after
the tap**. The title must accept the tap before audio and the meadow p1 bundle finish (they stream behind practice).
In-game clock from the tap:
Targets: control 0:04 · first sticker (First Bonk!) ≤ 0:60 · Pink Bow 0:50 · practice done ~3:00 · raid over ~4:20 ·
armour on ~4:50 · `d01` starts ≤ 7:30 · Standing Stones with a friend ~8:00. Never > 60 s without a positive beat
(ON §8 table).

### 6.3 Tap → play (story `StoryManager.newGame`, camera)
New save: no fade, no reload. `newGame()` resets state, sets `prologue.start`, ends `cs00` and calls the AUTOCAM
blend `MEME_LOOP → follow` over 1.1 s (inOutSine). Clem hops out of the Oath pose; input unlocks **0.35 s** after the
tap. Start difficulty `knight`. **Kitten-mode offer** (`offer.kitten`, once per save) after the 2nd knockout in any
3 min or the 3rd failed parry in practice: "Want gentler bonks? You can switch anytime." [Yes please] [I got this].
"Skip the prologue?" only on New adventure when a save has `prologue.done`.

---

## 7. Morning Practice (story `tutorial.js`, ui `prompts.js`)

### 7.1 Steps and constants
```js
export const TUTORIAL_STEPS = Object.freeze([
  { id: 'move',  textKey: 'tut.move',  guide: 'pearl', intro: 'pearl.race',  demo: 'tap' },
  { id: 'bonk',  textKey: 'tut.bonk',  guide: 'pearl', intro: 'pearl.bonk',  demo: 'tap',   reward: 'bonk' },
  { id: 'jump',  textKey: 'tut.jump',  guide: 'pearl', intro: 'pearl.fence', demo: 'tap',   reward: 'hop' },
  { id: 'roll',  textKey: 'tut.roll',  guide: 'pearl', intro: 'pearl.sack',  demo: 'swipe', reward: 'roll',  praise: 'pearl.roll.ok' },
  { id: 'stand', textKey: 'tut.stand', guide: 'pearl', intro: 'pearl.wobble', demo: 'hold', need: 1, reward: 'stand' },
  { id: 'parry', textKey: 'tut.parry', guide: 'pearl', demo: 'tap', reward: 'parry', praise: 'pearl.parry.ok' },
  { id: 'meow',  textKey: 'tut.meow',  guide: 'pearl', intro: 'pearl.hide',  demo: 'tap',   reward: 'found' },
]);
// PRACTICE: moveDist 0 (move completes at bonkR of the dummy or 10 m travelled), nextDelay 0.6, bonkR 2.2,
// stand need 1, idleDemo 8, chipAfter 6, parrySlowMo { scale: 0.45, firstOnly: true }, bowScene 'tutbow'
```
Outfit: start in `tunic` with the sword (if `tunic` hides the sword, add `tunic_sword`; fallback: academy practice
plates without cape/helmet, ON §12). Music `village_bards_tale` from the first tap.

### 7.2 Beat sheet
ON §4.2 P0–P8 is adopted as written, with these merges: env `meadow_morning`; the sun-ring decal at the dummy uses
gold `#FFD57A` (a pickup/reward cue, not mint); the dummy burst shows the `pop` "BONK!" (WA9); P2b `tutbow` gives the
`friend`-size **Pink Bow!**; P5 Sir Wobble wakes with "BOING!"; P6 the first swing runs `parrySlowMo` and ends with
"PARRY!"; P7 uses §7.4. The "Hold Pause to skip" toast appears only after 20 s on one step.

### 7.3 Hint strings (≤ 7 words; glyph tokens count as one word)
ON §4.3 table is binding (`tut.move`, `tut.bonk`, `tut.jump`, `tut.roll`, `tut.stand`, `tut.parry`, `tut.meow`,
`tut.skip`, `tut.done` "Practice: paw-some!", `tut.skipped` "Practice skipped. To the bell!") with `tut.title`
**"Morning Practice"** (WA13). Pearl lines `pearl.*`, `tutbow.*` per ON §4.3 (≤ 42 chars). Added glyph one-shots
(shown the first time each kind appears, story listens for fx fact `telegraph:first {kind}`):
| key | text |
|---|---|
| `tut.red` | Arrows on the ground? Roll away! |
| `tut.aoe` | Dots in a circle? Step out! |
| `tut.gold` | Star? Parry it for a big stun! |
Post-prologue hints: ON §4.5 table, spoken by Mochi once he joins; `tut.bright` per ON §6.2; `tut.jeer` and
`tut.bones` per ST §7.

### 7.4 Hide and seek with the Very Suspicious Cow (WA11)
P7: Pearl: "Hide and seek! Count to three!" → 1.2 s cream wipe → Pearl gone; the cow at (12, −72) shows a tiny pink
tail. Name plate `name.cow` = "Very Suspicious Cow". Clue lines by distance to the cow (bubble, speaker cow):
`tut.cow.1` "Moo. (...Nice jump, Clem!)" at > 14 m after 10 s, `tut.cow.2` "MOO. (Ooh, you're getting warmer!)" at
< 8 m, `tut.cow.3` "Moooo! (I mean. Moo. Normally.)" on the first Meow within 14 m. The cow wakes on Meow → `tutpearl`
("Found me! Okay, okay, you're good." / "...You're getting REALLY good, Clem."); Pearl stays as a follower (3.0 m/s,
1.8 m behind) and leads to the chart (P8).

### 7.5 Guide bubble, chip, dots, ghost paw (ON §7.1, §7.4; CL §10.1–10.2)
- Bubble: 44 px portrait (`pearl` / `mochi`; add Pearl's portrait), cream `#FFF8EE`, 2 px cocoa border, radius 16 px,
  Fredoka 500 17 px (touch 18). Chip: pink pill `#FFE0EA`, glyph + ≤ 7 words, Fredoka 600 16 px. Top-centre 8 px under
  the 18 % strip, `pointer-events: none` (not an occluder). 7 paw dots (filled `#FF8FB1`, empty `#5A3B2E33`).
- After 6 s: speech folds (200 ms), chip docks. Progress in a step: chip wiggles 120 ms, dot half-fills. Success: chip
  mint ✓ 0.5 s → sticker → next step after 0.6 s. Never two bubbles.
- Ghost paw: 64 px cream SVG with cocoa outline, projected to the world target (one `place()` per frame), `tap` /
  `hold` (ring fills 0.8 s) / `swipe` (80 px); KBM shows the mouse/key glyph. Only after 8 s idle, 2 cycles, then
  waits 8 s. `settings.tutorialHints` default on.
- `story:prompt` payload gains `speaker`, `say`, `stepDots`; payloads without `speaker` render the old card.
- Touch: cluster buttons appear only when their lesson starts (`visibility: hidden` until then, geometry unchanged),
  3-ring pulse 1.6 s on first appearance. `tut.rotate` "Plays best sideways." once, on the title.

---

## 8. Story: warm fun adventure

### 8.1 Logline, theme, pillars (ST §1, adopted)
Logline: ST §1 ("…every one of them ends up a friend."). Theme: *Small isn't weak. Brave is just staying. And nobody
is too grumpy to be a friend.* Pillar **Mist to morning**: the island is oversleeping (the Big Yawn), not dying; each
shard wakes it a little (more birds, butterflies, villagers). The fog-density story variable is unchanged. Pillar
**Bonk, don't break**: nobody dies or is slain anywhere in strings, toasts, achievements or GDD prose. Bosses get
BONKED!, then a Befriend beat, and every befriended boss returns later (ST §3 table, adopted).

### 8.2 Vocabulary (display only, ids unchanged; ST §2)
Hound Legion → **Woof Brigade** · Grimjaw → **Grumpjaw** · Warchief → **Big Chief** · the Gloom → **the Big Yawn** ·
Gloomjelly → **Wobblejelly** · Bonehead → **Squeakybone** · cages → **kitten carriers** · smugglers' landing →
**ferry dock** · occupied town → "the town the Woof Brigade moved into" · Bogmire → **Glimmerbog** · red-hot cleaver
→ **Big Squeaky Bone** · ballista bolt → **giant tennis ball** · death/defeated → **bonked**. Keep: the misty fields,
the pink bow, the Stand, nine lives, "Too small for the sword", HATER plates, two spoons.

### 8.3 HATER plates flip (ST §2)
`ENEMIES.hyena.plateWordsFriend = ['FAN','GIGGLER','YAYSAYER','HUGGER','CHEERER','SPOONER']` (same index as
`plateWords`); stealer 'POST STEALER' → 'POSTMASTER'; Cacklejaw 'HATER-IN-CHIEF' → 'HYPE-IN-CHIEF'. Both words are
baked into the plate CanvasTexture at spawn (2 rows; a UV offset swaps them) **0.25 s before** the bonk poof. From
`gate.done` on, hub hyenas wear friend words. 0 draws, 0 runtime canvas work.

### 8.4 Prologue scenes (merged ON §5 + ST §4)
- **Height Chart "One Ear-Tuft Short"** (`cs01.js`, ~20 s, `meadow_day`, no letterbox, HUD hidden, skippable): ON
  §5.2 shot list and lines, with WA14 for `cs01.3` and Pearl's `cs01.8` = "Tomorrow I'm front row. I made a sign!"
  The opening caption, crane and night barn are removed.
- **The Giggling Mist** (`cs02.js`, WA15): ON §5.3 shot list and lines (`cs02.1` "CLEM! Follow the letters!", `cs02.6`
  "...Okay. Hold on, Pearl. I'm coming."), carriers on wobbly carts, Pearl's "HELP (please)" sign (canvas 128 × 64),
  Pearl drops letters, sunbreak (`sun` ×2.4 for 2 s, holy 0.15), Clem grins. Audio: hyena giggle loop + wind; the drum
  hit only as a 0.3 s sting on the title card; `battle_theme_a` sting on the sunbreak.
- **Suit Up** (new `cs01b.js`, ON §5.4): run 12 m to the barn; the chest is an interactable; 18 s montage in
  golden `meadow_evening` light; "CLANK!" pop; `cs01.helm` "Nope."; `cs01.10` "...Borrowing this."; flags
  `prologue.armour/tutorial/done`; chapter card "Chapter 1 — Small Paws, Big Sword"; cream wipe 0.4 s; `friend`
  "Knight-ish!".
- **Tallbert** (`g01`): armed on `prologue.done`, on her way north.
- **Mochi** (`d01`, WA16): 3 rats in soft arena `cart` (r 9 m, no wall lock, rats flee at 1 HP), Mochi cheers each KO
  (`bark.mochi.cheer.*`), normal hits "tink" off the cracked lock ("It's a tough one! Do the shiny swing!"), Bright
  Slash breaks it; ON §6.3 lines; `friend` card "Mochi joined the party!"; Mochi speaks later hints.

### 8.5 Chapters 1–6 and the ending
ST §4 beats are adopted, with: Ch 1 frees Mochi at the cart (WA16), not the Old Bridge; CS-04 Lantern Night in
`forest_twilight`; CS-05 Grizzlechop befriend (milk + cheese); CS-08 "Nobody's coming." / "So I'm staying." kept
exactly, then Mochi "Nobody? Excuse me. We are SOMEBODY."; Marmalade's tennis-ball catch as a heroic pratfall (thumbs
up from the ground); CS-09 "...Hee." befriend; CS-10 cozy bedside then Barkus "pulls the curtains" (`hub_hush`);
CS-11 crate "FRAGILE: DO NOT BOOP" and the bow scene word for word; Ch 6 keep in `keep_twilight`, storm only in P3,
Squeakybones, Brutus befriend; CS-15 "Shoo! SHOO, little thing!" / "Why won't you SHOO?" and the Snickerpack chant led
by Cacklejaw; CS-16 "...They shooed me too. Off these steps." / "Then sit. There's room." and the SUNNY STEPS sign;
closing image: Brutus lowers the height-chart line one ear-tuft, Barkus barks the morning bell.

### 8.6 String rewrites
The tables in ST §7 (72 rows) and ON §3.2, §4.3, §4.5, §5, §6.3 are binding, with these overrides:
| key | final text | why |
|---|---|---|
| `tut.*` (practice) | ON §4.3 | WA22 |
| `tut.title`, `quest.prologue` | Morning Practice | WA13 |
| `ch.prologue` | Knighting Morning | WA13 |
| `cs01.3` | Too small for the sword, Clementine. One ear-tuft short. Next year! | WA14 |
| `cs01.8` | Tomorrow I'm front row. I made a sign! | ST + ON merge |
| `cs01.9` | (deleted: night barn line; the sleepover fact lives in `cs01.8`) | WA10 |
| `cs01.caption` | (deleted) | ON §5.2 |
| `d01.3` | Then we're the Almost Knights! | WA16 |
| `toast.kitten` | (card) Kitten found! {n}/{max} + rotating line | WA23 |
| `name.cow` (new) | Very Suspicious Cow | WA11 |
| `tut.cow.2` | MOO. (Ooh, you're getting warmer!) | §7.4 |
| `tut.red`, `tut.aoe`, `tut.gold` (new) | §7.3 | CL |
| `results.rank.*` (new) | PAW-SOME! / PURR-FECT! / CLAW-SOME! / Good kitty! | CL |
| `title.press` / `title.tap` | Press any key to play! / Tap to play! | ON |
| `menu.continue` / `menu.newGame` | Keep going! / New adventure | ON |
| `offer.kitten.q/yes/no/toast` (new) | Want gentler bonks? You can switch anytime. / Yes please / I got this / Kitten mode: gentle hits, wider parries. | ON |
Rows the ST/ON tables missed (found by scanning `strings.js` for cage / bars / stocks / war / battlefield / dead /
Warchief / Old Bridge; all binding):
| key | today | final text |
|---|---|---|
| `quest.meadow.mochi` | Free the squire at the Old Bridge | Help Mochi out of the tipped cart (WA16 moved him) |
| `obj.mochi` | Free the squire in the cage cart | Pop Mochi's carrier open |
| `toast.exit.mochi` | Mochi is still caged at the Old Bridge! | Mochi's still stuck in his carrier! Back to the cart! |
| `bark.mochi.caged.1` | Over here! Behind the bars! Hi! | Over here! In the carrier! Hi! |
| `bark.sage.caged.1` | Up here. Yes, in the cage. Don't laugh. | Up here. Yes, in the carrier. Don't laugh. |
| `bark.clover.caged.1` | Psst. Sweetpea. A little help with these stocks? | Psst. Sweetpea. A little help with this latch? |
| `gate.yard.4` | Scout the old battlefield first. They keep cages on a wagon there. | Scout the Hyena Toy Fort first. They keep kitten carriers on a snack wagon there. |
| `quest.gate.scout` | Scout the Old Battlefield | Scout the Hyena Toy Fort |
| `quest.gate.line` | Hold the Line | Hold the gate! |
| `quest.gate.boss` | Face Warchief Cacklejaw | Bonk Big Chief Cacklejaw |
| `kitten.where.sprout` | A rat tent cage | A carrier in the rat tents |
| `kitten.where.tater` / `.mittens` | A hyena war-wagon | The hyena snack wagon |
| `kitten.where.juniper` | A dead-tree stump | A hollow tree stump |
| `kitten.where.crumpet` | A kennel cage, the cellars | A kennel carrier, the cellars |
| `life.lost` / `life.lost1` / `life.last` | {n} lives left / 1 life left / Last life! | §5.7 |
| `bark.clem.respawn.2` | ...Ow. | ...Ow. Okay. |
Banned in display text after Phase W (story.W1 scan, case-insensitive, whole words): cage(s/d), bars, stocks, prison,
war, war-wagon, warchief, warlord, legion, battlefield, grimjaw, gloom, bogmire, smuggler(s), slain, slay, kill(ed),
dead, death, die(d), blood, skull, grave, corpse. Allowlist: `cs08.*` (kept exactly), `name.*` ids, "Nine Lives".

### 8.6a Cutscene cue sweep (story owns the files; literal cues the presets and maps cannot fix)
| File:line (today) | Now | Becomes |
|---|---|---|
| `cs01.js:146,204` | `env: 'meadow_night'` (night barn) | removed with the night barn (WA10); chart stays `meadow_day` |
| `cs02.js:85,87` | `creature/c80_monster_0x` horde rumble | `laugh` cue rate 0.9 vol 0.6 + `impact/impactWood_light_00x` cart rattles vol 0.5 |
| `cs02.js:119,122` | `impact/chain_0x` | `impact/impactWood_light_00x` vol 0.6 (a carrier latch clack) |
| `cs02.js` shot 11 | trembling paws, glistening eyes | removed (WA15); ends on the sunbreak grin |
| `cs04.js:71,130` | `forest_night` | `forest_twilight` (literal, not just the alias) |
| `cs04.js:131` | `music: dark_forest_creepy` | `field_of_dreams` vol 0.94 + crickets (§9) |
| `cs06.js:98–105` | 4 s silence, then `story_lament_warriors_soul` | 1.5 s silence, then `tavern_old_tower_inn` fade 2.0 (homesick, not mournful) |
| `cs10.js:81,139` | `story_lament_warriors_soul` for the scene | lament only on the 4 s window shot, then `village_bards_tale` 0.92 lowpass (§9) |
| `cs10.js:108,138` | `hub_grey` | `hub_hush` |
| `cs07.js` unlit Sunbell | "dark bell" (material near-black) | warm brass `#D8B070`, emissive 0, a sleepy closed-eye doodle decal; lit = emissive `#FFD57A` 1.0 |

Clem's rule: every line spoken by `swordcat` ≤ 8 words, except the ST §6.2 allowlist; she never jokes on purpose.

### 8.7 Hub cameos (optional, perf-gated)
Befriended Grizzlechop (`forest.done`), Cacklejaw (`gate.done`) and Brutus (after the ending) **replace** villager
slots in Pawsbury. If the hub draw gate fails, they appear only in CS-16 and post-credits.

---

## 9. Audio (ART §9.3 + ST §8)
Lantern Night `field_of_dreams` 0.94 + crickets (ART); CS-10 bedside `tavern_old_tower_inn`, lament only for the 4 s
window shot; Big Yawn hub `village_bards_tale` 0.92 lowpass; results WA21; CS-02 giggle loop (no drums); lament kept
only for CS-11 and CS-15. New cues: pickup pitch ladder (§5.5), sticker glock thirds C5 → E5 → G5, Squeakybone squeak,
Barkus Big Squeaky Bone squeak on hit, ghost-paw "pip" (`ui/glass_001` rate 1.4, vol 0.3), comic pops reuse
`pickup/bubble`, `respawnBoing` replaces `ghostLife` (§5.7), CS-06 letter `tavern_old_tower_inn` and the CS-02/CS-04
cue swaps (§8.6a). Banned anywhere in `src/audio/**`, `src/story/**`, `src/world/levels/**` (maps, ambience, level
`music.byFlag`, cutscene cues): `dark_forest_creepy`, `victory_8bit_loop`, `creature/c80_monster_*`, `impact/chain_*`,
`pickup/powerup_downer*`. Known hits to fix: `ambience.js:44` gate "drums" scatter → delete (the hyena giggle scatter
carries the threat); `ambience.js:46` winch → `impact/impactWood_light_00x` rate 1.1 (rope winch);
`sfxMap.js:62` `ghostLife` → `respawnBoing`; `sfxMap.js:141` `farDrums` → delete; `sfxMap.js:304` preload list drops
both families; `procedural.js:325` `chainIds` → wood ids; `musicMap.js:57` and `forest.js:500` `byFlag forest.camp` →
`field_of_dreams`; `musicMap.js:91` and `AudioManager.js:232` results → `festival_minstrel_dance` (WA21).

---

## 10. Screen-space rules that keep it "better than League"
1. **Squint test:** at 50 % zoom on a 844 × 390 Low frame, a reviewer finds the hero, every enemy and every active
   telegraph, and names each telegraph **by glyph**, in ≤ 2 s.
2. **Colour-blind test:** deuteranopia and protanopia matrices on the saved frame; every telegraph kind is still
   distinguishable by glyph.
3. **Calm floor:** arena stage luma ≥ 1.08 × the ring 3 m outside; grass density ≤ 0.45 inside.
4. **She always pops:** hero chroma ≥ 1.5 × ground in a 3 m disc; hero-disc ground luma ≥ 1.06 × the 4 m ring.
5. **No grim pixels:** day presets ART G1–G5; twilight ≥ 0.36 mean luma, ≤ 15 % dark pixels.
6. **Feels answered:** every tap shows a ripple within one frame and a head turn within 0.1 s.
7. **Health at a glance:** after a hit, a reviewer reads her remaining hearts from the heart arc (§3.5a) without
   looking at the HUD, in ≤ 1 s, on the 844 × 390 frame.
8. **Nothing grim:** the §2.7 V < 0.20 lint, the §8.6 banned-word scan and the §8.6a cue list are all green.

### 10.1 Where SWORDCAT beats League (and how each claim is checked)
| League pain point | SWORDCAT answer | Check |
|---|---|---|
| Friend/foe by team colour only | hue + shape + motion per class (§3.2), pink is hero-only | `colorLanguage.test.js` |
| Skillshots read by colour/size, hard on colour-blind players | one glyph per telegraph kind (§3.4) | WA §10 rule 2 |
| Busy ground, VFX soup in teamfights | arena stage floor, grass ×0.4 in arenas (§3.5), ≤ 52 decals per fight | rule 3, fx.W1 |
| HP only in floating bars | heart arc at her feet (§3.5a) + calm HUD (§4.1) | rule 7 |
| Dark, desaturated "serious" map | per-preset luma floors, no night defaults (§2.2–2.3a) | `art:warm` |
| Silent, flat feedback | ripple + head snap, comic words, merged numbers, pickup pitch ladder (§3.6, §5) | rule 6, audio.W1 |
| Death timer, grey screen | dizzy sit + 1.55 s boing back (§5.7) | `player.W4` test |
| Long tutorial, menu first | tap → moving in ≤ 0.5 s, first sticker ≤ 60 s (§6.2) | `flow:first-minute` |

---

## 11. Performance accounting (against PLAN §5 End budgets)

| Item | Play draws | Tris | Programs | DOM / CPU |
|---|---|---|---|---|
| Presets, exposure, paints, un-desaturation, palettes, silhouettes | 0 | 0 | 0 | data |
| `Bunting` | **+1** | ≤ 480 (Low 240): pennants × 2 + lanterns × 8 (WA28) | 0 new (world Lambert + toon patch) | flutter in vertex shader |
| Heart arc (§3.5a), dark-literal sweep (§2.7), knock-out look (§5.7) | 0 | 0 | 0 | ≤ 6 decal instances; sweep is constants only |
| Morning Practice scene (Clem + Pearl + dummy + Sir Wobble + cow + sack) | inside the Low ≤ 40 scene cap; asserted by `world.W6` smoke `practice-draws` | — | 0 | — |
| Prop swaps, waystones, mushrooms, lamp posts, toy fort, carriers | 0 (merged per biome) | ≤ +8k per level | 0 | — |
| Hero pool, lamp pools (`uGlow`, `uLamps`) | 0 | 0 | 0 | — |
| Glyphs, ink edges, rings, arena stage | 0 (GroundDecals ≤ 52 of 160; Terrain paint) | 0 | 0 | < 0.02 ms |
| Twinkles, bursts, idle sparkle | 0 (Particles / Marks; Low ×0.5) | — | 0 | < 0.05 ms |
| Damage numbers, words, pops | 0 (DOM pool 20) | — | — | merging lowers writes |
| Fly-to-HUD (8), confetti (≤ 24), celebration card, bubble, ghost paw | 0 | — | — | transform/opacity only; ≤ 15 style writes/s outside bursts (PERF §10.5) |
| `playScale`, idle ladder, emotes, hover boing | 0 | 0 | 0 | procedural, existing activity tiers |
| Pearl on the title / in practice | her hero-class draws, prologue only (no enemies on the field) | ≤ 16k | 0 (shares Clem's) | — |
| Clouds + moon | +1 in cutscenes only | ~2k | 0 (Basic) | — |
| **Total in iso play** | **+1** | **≤ +8.5k** | **0** | — |
Post passes added: **0** on every tier. PointLights added: **0** (lamps are `uLamps`). Hub cameos replace slots.
Removing the new-game reload saves a full level build on the first-run path.

---

## 12. Config keys (one commit, `core.W1`; read with fallbacks until it lands)
```js
// core/config.js
TELEGRAPH = { colors: { parry:'#FFFFFF', gold:'#FFD34D', red:'#FF5A4E', aoe:'#FF9A3D', aim:'#FFFFFF', grab:'#9B5CFF', jeer:'#B07CFF', shadow:'#3A2346' },
  glyph: { parry:'shield', gold:'star8', red:'chevron2', aoe:'dots6', grab:'paw', shadow:'crowfoot', aim:'arrow' },
  ink: { color:'#4A2A1F', width:0.03, alpha:0.35 }, glyphSize:0.45, glyphSizeTouch:0.55, rimMinTouch:0.14 };
JUICE.finalBlow = { hitstopAdd:0.06, slowMo:0.25, timeScale:0.35 };
CLASS_MARKS = { hero:{ color:'#FF8FB1', alpha:0.55, width:0.08, r:0.75 }, companion:{ color:'#8FD3FF', alpha:0.35, r:0.5, dashes:8 },
  interact:{ color:'#9BE3C4', alpha:0.30, hz:0.8, pulse:0.06, twinkleEvery:2.5, range:8, maxZones:6 },
  pickup:{ twinkle:'#FFF1C4', gold:'#FFD57A', every:1.2, goldEvery:0.6, spin:1.2 },
  heroHearts:{ full:'#FF6F9C', fullA:0.75, empty:'#4A2A1F', emptyA:0.18, r0:0.82, r1:0.92, spreadDeg:120, gapDeg:4, show:2.5, lowHz:1.4 } };
KO = { sitT:1.2, wipeT:0.35, starR:0.35, starRev:2.5, hearts:6 };   // §5.7, player-owned timings read by fx/ui
BUNTING = { max:240, maxLow:120, lanternMax:60, lanternMaxLow:30, sag:0.12, spacing:0.55, minH:3.2, flutter:0.06 };
IDLE = { glance:4, look:7, groom:10, twirl:12.5, loopFrom:7, sneezeP:0.1, hubSit:20 };   // all < CAMERA.memeCam.idle
HUD = { tuck:{ combatR:15, after:4, fade:0.3, popShow:3 } };
CELEBRATE = { skipAfter:0.6, sticker:1.6, card:2.2, friend:2.6, dockScale:0.6, dockFly:1.2, safeR:15, confettiMax:24 };
PICKUP_FX = { hop:0.35, flyMs:450, flyLift:120, pool:8, pitchStep:0.06, pitchMax:8, pitchReset:1.5 };
FX.comicPops = { parry:'always', other:'first', firstMinutes:10 };
ENEMIES.hyena.plateWordsFriend = ['FAN','GIGGLER','YAYSAYER','HUGGER','CHEERER','SPOONER']; ENEMIES.stealer.plateWordsFriend = ['POSTMASTER'];
STORY = { ...STORY, cs02Cut:true, kittenOffer:{ knockouts:2, windowS:180, failedParries:3 }, mochiCage:[-14,-41] };
// characters/materials.js
READABILITY.playScale = 1.12; READABILITY.playScaleCompanion = 1.08; READABILITY.bowScaleFar = 1.4; READABILITY.scaleBlend = 0.3;
// fx/DamageNumbers.js DAMAGE_STYLE (fx-owned table)
word:{ color:'#FFF6DA', size:30, under:'#FF9EC0', every:0.25 }, pop:{ fill:'#FFE066', stroke:'#4A2A1F', size:40 }, mergeWindow:0.35, heal:'#9BE3C4', hurt:'#FF8FB1';
// story/tutorial.js PRACTICE: §7.1
// settings (save migrates, schema stays v1): hudMode 'calm', hitWords true, pathPreview 'auto', tutorialHints true
```

---

## 13. Sign-offs needed (defaults apply if nobody objects)
1. **GAME_DESIGN "never cut" for CS-02**: amend to "never removed; may be tightened". Default: `STORY.cs02Cut = true`
   ships, every story fact kept. Design owner may flip it to `false`.
2. **Mochi move** breaks companions/flow tests that expect the Old Bridge rescue: tests are updated in the same
   train (`companions.W2`).
3. **Tunic + sword** outfit: characters confirm or add `tunic_sword`; fallback per ON §12.
4. **Bog/keep moods** override ART's day `bog` and `keep_storm` default; `world:fog-audit` reruns on `bog_dusk`
   (0.058) and `keep_twilight` (0.042), which keep the D13 densities.
5. **GAME_DESIGN prose** (§1 logline, §2.2–2.4, §3.7, §4.3, §5.4, §10, §16.1, §17) is updated by the design owner to
   match §8; code never depends on it.
