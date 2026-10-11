# wa_light: why SWORDCAT looks dark and too medieval, and the sunny-storybook fix

Lens: light, palette, haze and prop vocabulary. Author: warm-adventure design pass, 2026-10-11. Status: **proposal**
that layers on top of `research/next/ART_WARM_SPEC.md` (binding). It does not reopen ART_WARM's decisions D1–D18 or
X1–X37. It does three things:
1. It audits the **current code** (ART_WARM is not implemented yet: `Env.js:21–37` still holds the grey presets) and
   finds the dark and medieval sources that ART_WARM **does not cover** (§1, marked **NEW**).
2. It tightens ART_WARM where the new user request ("fun adventure vibe … better visual clarity than League of
   Legends … not dark, not too medieval") asks for more. These are numbered **W1–W24**.
3. It gives per-level target palettes, exposure, motes and prop swaps for all 6 levels and the story beats.

User request (verbatim): *"make it much better from visual perspective than league of legends (not graphics /
hexagons perspective, but from visual clarity, fun, warm and etc). and upgrade onboarding, story to feel more warm.
right now it looks kind of dark, too medieval, it should have fun adventure vibe."*

Hard limits kept: no post-processing in gameplay (ART D2, PERF), draw caps from IMPLEMENTATION_PLAN §5 (End: Low ≤ 40,
Med ≤ 60, High ≤ 90 scene draws; +15 in boss fights), 0 new programs in play beyond the ART_WARM set. Every proposal
lists its draw-call cost.

---

## 0. Summary in one paragraph

The game looks dark for five measurable reasons. In order of screen share they are: a near-black ground palette
(`Terrain.js:13–18`, L* 15–35, which covers 70–90 % of iso pixels), a grey-green fog wall (`#B7C0C3` / `#9AA196`,
HSV saturation ≈ 0.05), ACES tone mapping with a 1.15 vignette, olive-black hemisphere ground colours, and
per-asset **desaturation** calls in the levels (`sat: 0.12–0.25`, `mul: 0.46–0.85`). It looks too medieval for four
more reasons. Half of the story's mood beats are night or grey: the very first thing a new player sees is
`meadow_night` plus "Midnight Practice", followed by `forest_night`, `hub_grey` and `keep_storm`. The prop vocabulary
comes from the **graveyard**, **siege** and **dungeon** packs (stone walls, candle lanterns, fire baskets, siege wrecks,
iron torches, obelisks). Far silhouettes are dark slate (`#283026`, `#2F363C`, `#1E2A1E`), and the skyline is a castle.
ART_WARM fixes the presets, ground and materials. This file adds the rest:
- no playable default is ever night;
- the prologue moves to a golden morning;
- bog and keep become cozy-spooky twilight (purple and teal, fireflies, glowing mushrooms, jack-o'-lanterns);
- an un-desaturation pass on every `kit.tpl` call, plus warm decal paints;
- lavender aerial perspective in place of slate silhouettes, with green hills and cartoon clouds in place of castles;
- one instanced **bunting and pennant** system (+1 draw per level);
- candy accents per level;
- a LoL-beating clarity contract: a lighter "stage" floor in arenas, a hero warm pool, mint interactable twinkles and
  a fixed hue budget per layer.

---

## 1. Audit: where the dark and the medieval come from

Luma is sRGB Rec.709 (0–1). Each row says whether ART_WARM already covers it.

| # | Source (file:line) | Now | Effect | Covered by ART_WARM? |
|---|---|---|---|---|
| A1 | `world/Terrain.js:13–18` `GROUND` | meadow root `#28311A` (luma 0.17), mid `#36421F`, path `#625D44`; keep `#2A2628` | 70–90 % of every iso frame sits at luma 0.15–0.35. This is the main reason the game reads as dark. | Yes (§2.6 ground rows) |
| A2 | `core/Game.js:100–101` | `ACESFilmicToneMapping`, exposure 1.0 | Mids are crushed and desaturated, and ginger turns brown | Yes (D1 Neutral) |
| A3 | `core/config.js:354` | vignette darkness **1.15**, offset 0.95 (composer) | Corners go to near-black, which reads as a grim "old film" look | Yes (D2, CSS vignette) |
| A4 | `world/Env.js:21–37` presets | fog `#B7C0C3`, `#8E9E8A`, `#9AA196`, `#8F9A84`, `#4B3F42`; HSV sat 0.03–0.12 | A grey veil over everything. The base screenshots (meadow_base, forest_base, `11-crowfields.png`) are 60 % fog grey | Yes (§2.5) |
| A5 | `Env.js` hemiGround | `#4A5230`, `#2C3A24`, `#1A2218`, `#1E1A1A` | Undersides, tree trunks and the hero's belly go olive-black | Yes |
| A6 | `Game.js:110`, `HeightFog.js:19`, `Sky.js:51`, `MistCards.js:140,304,344`, `GroundMist.js:139` | hard-coded `#B7C0C3` / `#9AA196` defaults | The first frame and any fallback path flashes grey | Partly (only `Game.js:110`). **NEW W1** |
| A7 | `fx/MistCards.js:18` WALL `maxA 0.62`, `:22` AMBIENT `maxA 0.22` | Opaque grey walls of mist | Mist walls read as "gloom" | Partly (ART caps ambient at 0.14). **NEW W2** for walls |
| A8 | `fx/GroundMist.js:20–21` per-preset mul | bog **1.4**, forest_night 1.1, gate 1.0 | The densest ground mist sits on the spookiest levels | **NEW W3** |
| A9 | `kit.tpl(..., { sat, mul })` in levels | `gate.js:170` pillar `sat 0.15 mul 0.6`; `:186,:201` towers `sat 0.25`; `:286` battlefield wrecks `sat 0.55 mul 0.85`; `meadow.js:420` bridge stone `sat 0.15 mul 0.46`; `meadow.js:67` hay `sat 0.12`; `LevelKit.js:475` vigil lantern `sat 0.15 mul 0.8` | Assets are deliberately greyed and darkened. A `mul` of 0.46 halves the albedo | **NEW W4** |
| A10 | `kit.paint(...)` ground stamps | `#4B4630`, `#33301F`, `#2E3624`, `#3A3624`, `#46502A`, `#4A4428` (meadow ×7, forest ×9, gate ×3, town ×2) | Dark mud blotches under every setpiece. From above they look like scorch marks | **NEW W5** |
| A11 | `LevelKit.js:932–933` silhouettes | skyline `#2F363C`, horizon `#283026`; `forest.js:569` `#1E2A1E`; `Sky.js:81` `#3D454C` | Far trees and towers are slate black: a horror-movie treeline in every cutscene | **NEW W6** |
| A12 | `meadow.js:578` skyline | `building_tower_A_red` 30 m + `building_castle_red` 20 m | "Distant castle" is the medieval establishing shot | **NEW W7** |
| A13 | Story env beats | `cs01.js:146,204` → `meadow_night`; `meadow.js:500` `!prologue.done → meadow_night`; `cs04.js:71` `forest_night`; `cs10.js:108` `hub_grey`; `keep.js:8` `keep_storm` | The first 5–8 minutes are at night. 4 of the 9 mood beats are night, grey or storm | Partly (ART §9.4 renames the quest "Morning Practice" but keeps the night preset, a mismatch). **NEW W8** |
| A14 | `fx/Ambient.js:13,16,27,29` | gate `ash` (falling grey), keep `embers` | Ash means war and fire | Keep embers replaced (§8.4); **gate ash is not. NEW W9** |
| A15 | Prop vocabulary | `graveyard/` stone-wall, lantern-candle (every vigil), fire-basket (keep ×8, gate), hay-bale; `castle/` siege-*-demolished ×5, metal-gate; `dungeon-kaykit/torch_lit` (forest rat camp); `nature/statue_obelisk` (every vigil, ×8); `tree_*_dark` (bog ×3, horizon) | Graveyard, war and dungeon packs set the theme | Partly (bog trees, braziers). **NEW W10–W16** |
| A16 | Level palettes `C` | meadow `wood #7A5B3E`, `woodDark #4E3A28`, `iron #4A4C50`; forest `bark #4E3B2A`, `barkDark #3A2C20`; gate `hyena #5A5650`, `red #8A2E2A`; town hyena banners `#5A5650` | Every proc-built prop is brown, iron or dried-blood red | Partly (§2.6 shared props). **NEW W17**: concrete remap table |
| A17 | Music | `bog: cave_theme`, `keep: battle_theme_a`, forest camp `dark_forest_creepy` | The audio says "dungeon" | Yes (§9.3) |
| A18 | Hero on screen | ≈ 40 px tall at 720p (meadow_toon, town_toon) on a busy, noisy ground | She gets lost; LoL champions are ≈ 9 % of screen height | Camera is AUTOCAM's domain. **W18** gives a 0-draw light-side fix |

**What the toon prototype already proved:** `research/next/shots/meadow_toon.png` against `meadow_base.png` shows
that warm presets, a bright ground and no grey fog alone turn the meadow sunny. `town_toon.png` still looks heavy for
three reasons: the black-grey cobble texture, the mid-grey gate road (fog-low colour on the stone deck), and the
near-black town wall faces at the top of the frame. Those are A9, A10 and W17, not the presets.

---

## 2. The clarity contract ("clearer than League, warmer than League")

LoL's clarity rules are: a low-contrast, low-detail ground; high-contrast units with rim light and outlines; one
consistent key-light direction; and colour reserved for gameplay meaning. We keep all four and change the mood. LoL
ground is L* 35–50, cool and mossy. Ours is L* 55–72, warm and creamy, so the screen stays readable on a phone in
sunlight. The rules below are numeric so `art:toon` (ART §11.1) can gate them.

### W19. One hue budget per layer
| Layer | Luma | HSL chroma | Hue band (°) | Never |
|---|---|---|---|---|
| Ground and path (playable floor) | 0.45–0.70 | 0.12–0.28 | 35–110 (straw, grass, sand) | red or orange chroma > 0.30 within 3 m of the spine (telegraph space) |
| Props and foliage | ±1 value step from the ground | 0.15–0.40 | any, but red, orange and pink only above 1.6 m (bunting, roofs, canopy) | black; grey with HSV sat < 0.08 |
| Enemies | 0.25–0.55 body | 0.20–0.45 | 200–290 (plum, slate) + top colour | pink, ginger |
| Hero and companions | 0.45–0.85 | ≥ 1.3× ground (target 1.5) | 10–40 ginger, 350 pink, 0 red cape | — |
| Telegraphs and danger | n/a | ≥ 0.55 | 0–30 (red, orange) with a cream `#FFF6E8` rim | used for anything else |
| Interactables and pickups | — | — | **mint `#9BE3C4` and white twinkle** (W21) | butter yellow (it would collide with the mustard Rat helm `#E0B043`) |
| Holy, gold and reward | — | — | 45–55 gold `#FFE066` / `#FFD57A` | ground props |

### W20. The arena "stage" floor (0 draws)
Every `kind: 'arena'` zone stamps a lighter, low-noise disc of radius `r + 1`. The stamp is
`kit.paint(at, r + 1, GROUND[lvl].path lifted +8 % L, 0.35, 3)` (vertex colour, already in the Terrain paint layer).
Grass density inside it goes to ×0.4 (the `paint` G channel). Enemies, telegraphs and the hero then sit on a calm,
bright plate, which is the clean lane look LoL uses. This also stops grass blades cutting through telegraph decals
(visible in `11-crowfields.png`).

### W18. A warm pool under the hero (0 draws)
ART X6 already routes the old HERO_LIGHT into `ENV_U.uGlow`, which follows her. Proposed values:
- by day, `hero` 0.25 → **0.40**, radius `uGlow.w` 3.5 → **2.6 m**, colour `#FFE6B8`;
- at twilight and night, `hero` 1.0, radius 3.5 m.

The result is a soft sunlit spot that always marks where she is, like the Golden-Hour aura but subtle (+6–9 % luma on
the ground within 1.5 m of her). Gate: hero-disc luma / ring-at-4 m luma ≥ 1.06.

### W21. Interactable twinkle (0 new draws)
Every interact zone within 8 m of her (crate, lantern, letter, rescue cage, vigil) emits one `STAR4` from the existing
`Particles` pool every 2.5 s: `#FFFFFF` → `#9BE3C4`, size 0.18 m, life 0.6 s, rise 0.4 m/s, at the zone's top
anchor. With ≤ 6 live zones that is ≤ 3 particles/s. Owner fx (`FX.js` tick, reads `ctx.levels.current.interactables`).

### W22. Shadow and outline rules (confirms ART)
Shadows are lavender (the preset's `hemiSky`), `shadowI` 0.55–0.60, never black. Hero ink hull `#4A2A1E`. Enemies get
the plum hull at Med+ while engaged. Bunting (W12) casts **no** shadow, so the ground stays calm.

---

## 3. Global render and haze changes (deltas on ART_WARM §2–§3, §8.1)

| ID | Where | Change | Cost |
|---|---|---|---|
| W1 | `HeightFog.js:19` `uFogLow`, `Sky.js:51–52` defaults, `MistCards.js:140,304,344`, `GroundMist.js:139`, `Game.js:110` | Every hard-coded grey default becomes the `meadow_day` ART row (`#F6E4C0` / `#EED6A6`). `Sky.js` `uGround` default `#C9A46A`. Nothing on the boot or fallback path is grey. | 0 |
| W2 | `MistCards.js:18` `WALL` | `maxA` 0.62 → **0.48**. Wall colour = `fogColor` lerped 0.35 toward `#E8DCFF` (lilac "fairy mist"). One `STAR4` twinkle per 3 cards every 1.5 s from the pool. They still block sight lines; they no longer read as gloom. | 0 draws |
| W3 | `GroundMist.js:20–21` preset muls | bog 1.4 → **0.8**, forest_night 1.1 → **0.7**, gate_dusk 1.0 → **0.6**, keep_storm 0.75 → **0.5**, meadow_night 1 → 0.6. New keys: `meadow_morning: 0.7`, `bog_dusk: 0.8`, `forest_twilight: 0.7`, `keep_twilight: 0.5`, `hub_hush: 0.5`. Tint per ART §8.1 (fogColor + 6 % sun). | fewer overdraw px |
| W6 | `LevelKit.js:932–933`, `Sky.js:81`, `forest.js:569` | **Aerial perspective goes lilac and blue, not slate.** Defaults: skyline `#2F363C` → **`#8E86C0`**, toFog 0.7 → 0.55; horizon `#283026` → **`#5E9A62`**, toFog 0.8 → 0.6. Forest `horizonColor #1E2A1E` → **`#3E7A62`**, horizonFog 0.86 → 0.65. Bog → `#4E8A80`. Keep and night presets use `#5A4E90`. Gate: hills only. | 0 (cutscenes only; 'far' group hidden in iso) |
| W1b | `Env.js` `toneMappingExposure` | Per-preset `exposure` as in §4. Golden Hour +0.06 (ART §8.5). Cutscene close-ups +0.03 (faces read brighter than the field). | 0 |
| W23 | `Env._apply` | `scene.background` is `fogColor` in iso, as ART says. In cutscenes and the 'far' group it is the sky dome gradient `skyTop → fogColor`, with **3–6 cartoon clouds** (`village-kaykit/decoration/cloud_big.glb`, `cloud_small.glb`, unlit `MeshBasicMaterial` `#FFFFFF` → fog lerp 0.25, merged into 1 draw, in the 'far' group). The cutscene sky reads blue and fluffy instead of a grey gradient. | +1 draw, **cutscenes only** |

---

## 4. Per-level target palettes

How to read the table:
- Hex values are drop-in `ENV_PRESETS` fields (same keys as `Env.js` plus ART's `exposure`, `shadowI`, `rim`, `hero`).
  Rows marked "= ART" are taken unchanged from ART_WARM §2.5. Rows marked **W** are new or changed here.
- "Ground" lists the `Terrain.js GROUND` `root / mid / path` triplet (ART §2.6 unless marked).
- "Accent" lists the three candy colours that bunting, banners, flower boxes and lanterns may use on that level. Props
  outside the accent set use ART §2.6 shared tokens.
- Frame targets are the ART §2.3 64×36 readback numbers, with the twilight floor raised (W24).

### W8. Story-beat rule: no playable default is ever night
- Night, twilight and storm presets are only for ≤ 90 s story beats, or for a **cozy** twilight with its own lamps
  (Lantern Night camp, bog, keep).
- Every twilight row has `uLampStr` 1, `hero` 1, fireflies, and mean luma ≥ **0.36** (ART allowed 0.32).
- "Night" means storybook periwinkle and indigo with warm lamp pools. It never means navy-black.

### 4.1 Meadow (Purrdale Meadows), "first sunny morning of the adventure"
| Preset | fog / fogLow | skyTop | hemiSky / hemiGround × I | sun col × I, elev | shadowI | exp | hero | motes |
|---|---|---|---|---|---|---|---|---|
| meadow_day (= ART) | `#F6E4C0` / `#EED6A6` | `#8FCBF2` | `#C4D9FF` / `#C9A46A` ×1.30 | `#FFE7C2` ×2.4, 0.85 | 0.60 | 1.00 | 0.40 (W18) | fluff → **petals+fluff** (W9) |
| **meadow_morning (W, new; replaces the prologue's night)** | `#FFE6CC` / `#F2D3A8` | `#9FD0F5` | `#CBD8FF` / `#D4A874` ×1.25 | `#FFE0B0` ×2.3, **0.40** (long, soft shadows) | 0.55 | 1.02 | 0.40 | fluff, count 60 → 80 |
| meadow_evening (= ART, CS-01 opening only) | `#FFD4AA` / `#F4BE92` | `#A9A8E6` | `#B9B8F0` / `#D89A6A` ×1.20 | `#FFB878` ×2.5, 0.25 | 0.55 | 1.00 | 0.35 | fluff |
| meadow_night (kept for story callbacks only) | **W** `#5A64A8` / `#525C9E` | `#2E3A7E` | `#9CB0F4` / `#4A4478` ×1.15 | `#C6D6FF` ×0.9, 0.9 | 0.50 | 1.08 | 1 | fireflies |

Ground (ART): `#5C8A36 / #86B44A / #E2C996`. **Accent:** butter `#FFD84A`, sky `#8FD3FF`, pink `#FF8FB1` (pink only
overhead or on the barn). Stone tint `#E3CFAE`. Target mean luma 0.52–0.60, warmth R−B +0.08…+0.14.
- **W8 wiring:** `meadow.js:500` `byFlag: [['!prologue.done', 'meadow_night']]` → `'meadow_morning'`. `cs01.js:146,204`
  `meadow_night` → `meadow_morning`, so CS-01 runs evening → morning-after: the armour is handed over at dawn. Story
  owner: the quest title becomes **"Morning Practice"** (ART §9.4 already asks for this, and the env now matches it).
  The Dawnstone glow at `bell_far` (`meadow.js:579`) stays and reads as the sunrise beacon. Golden Hour stays as it is.
- `meadow.js:507` light row: add `meadow_morning: { hemiMul: 1.08, sunAz: -1.45 }`.

### 4.2 Forest (Whisker Woods), "dappled picnic woods" plus a **cozy** Lantern Night
| Preset | fog / fogLow | skyTop | hemiSky / hemiGround × I | sun × I, elev | shadowI | exp | hero | motes |
|---|---|---|---|---|---|---|---|---|
| forest_day (= ART, one change) | `#DCE8BE` / `#C6DA98` | `#9AD4E8` | `#B9D8F5` / **W `#A08A52`** ×1.30 | `#FFE2A8` ×2.3, 0.90 | 0.60 | 1.00 | 0.40 | **W** fluff + 12 fireflies → `dust` (golden motes `#FFE9C9`, intensity 0.6) by day; fireflies only at twilight |
| **forest_twilight (W; `forest_night` becomes an alias)** | `#6A66B4` / `#5A6E96` | `#3A3E96` | `#B0B6F4` / `#3E6A58` ×1.25 | moon `#D6E6FF` ×0.9, 0.9 | 0.50 | **1.10** | 1 | fireflies count 46 → **64**, intensity 2.2 |

Ground (ART): `#4E7A38 / #6E9E48 / #D6B88A`. **Accent:** mint `#9BE3C4`, coral `#FF8A7A` (the mushroom red, now
`#E8553F`), butter `#FFD84A`. Twilight target luma ≥ 0.36, R−B ≥ 0.0 (the lamp pools pull it warm).
- ART's `forest_night` (`#3F4378`) is a little too inky for "cozy". W lifts fog L by about +12 % and makes the bounce
  teal-moss rather than black-green. Lantern Night (CS-04) should feel like a sleep-over in the woods.
- `cs04.js:71,130` and `forest.js:499,506–507`: use `forest_twilight` (keep the alias so old saves and cues work).
- Twilight dressing (`forest.js lanternCamp`, `:352`): +6 paper lanterns on strings (W12 bunting system, lantern
  variant), `uLamps` takes the nearest 4. Rat camp `dungeon-kaykit/torch_lit.glb` (`forest.js:23`) → stake +
  `pumpkin.glb` lantern (graveyard pack, **uncarved** in the forest) with an emissive slit cap `#FFC46B`.

### 4.3 Town (Pawsbury), occupied = "pranked", free = "festival"
| Preset | fog / fogLow | skyTop | hemiSky / hemiGround × I | sun × I, elev | shadowI | exp | hero | motes |
|---|---|---|---|---|---|---|---|---|
| town_occupied (= ART, one change) | `#F0DEC0` / `#E4CCA6` | `#86C6EE` | `#C8C8F0` / `#B08A62` ×1.20 | `#FFE0B4` ×2.3, 0.75 | 0.60 | 1.00 | 0.40 | dust |
| hub_gold (= ART) | `#FFE0B4` / `#F6CF9C` | `#9CC8F0` | `#CBD3FF` / `#D2A070` ×1.25 | `#FFD9A6` ×2.6, 0.45 | 0.60 | 1.00 | 0.35 | **W** dust + 20 confetti-petals (`petals` profile, ART §8.7) |
| hub_hush (= ART; `hub_grey` alias) | `#C6C0E4` / `#B4ACD8` | `#8C96D6` | `#D0D4EE` / `#8E8A9A` ×1.30 | `#F2E2F0` ×1.3, 0.70 | 0.45 | **W 1.02** | 0.60 | **W** fluff (slow, `#EDE6FF`) |
| ending_gold (= ART) | `#FFE8C8` / `#FFD8A8` | `#9CC8F0` | `#D0DCFF` / `#E0B080` ×1.30 | `#FFD9A6` ×2.8, 0.35 | 0.60 | 1.00 | 0.35 | petals |

Ground (ART): `#7AA052 / #98BA62 / #E8D7B6`. **Accent:** the full candy set for the festival (pink `#FF8FB1`, butter
`#FFD84A`, sky `#8FD3FF`, mint `#9BE3C4`, lilac `#C9A8FF`). Occupied town uses plum `#7A4E9A` + mustard `#E0B043`
(the hyena prank colours).
- **Cobbles** (the `town_toon.png` problem): the texture stays, multiplied toward `path #E8D7B6` with contrast
  ≤ ±12 % (ART §8.3 rule 5). Add **`gain` ≥ 1.6** like the gate bricks. Path luma target ≥ 0.55. The current deck is
  ≈ 0.30 in shadow.

### 4.4 Gate (Gate of Whiskers), "seaside sunset adventure"
| Preset | fog / fogLow | skyTop | hemiSky / hemiGround × I | sun × I, elev | shadowI | exp | hero | motes |
|---|---|---|---|---|---|---|---|---|
| gate_dusk (= ART) | `#FFC09A` / `#F2A88A` | `#8C7ACB` | `#9C9AE0` / `#C07A5A` ×1.15 | `#FF9E5E` ×2.4, 0.25 | 0.55 | 1.00 | 0.40 | **W9** `ash` → `dust` recoloured `#FFE0C0` + 6 swallows (ART §8.7) |

Ground (ART): `#7C9A4E / #A0B05A / #EBC69E`. **Accent:** coral `#FF9E7A`, sea-teal `#3FC1C9`, cream `#FFF6E8`. Stone
tint coral sandstone `#E8B898`. Target luma 0.50–0.58, R−B +0.10…+0.16.
- The sunset is the "golden hour before the big gate" moment. Fog is peach, never grey.

### 4.5 Bog (Bogmire), **cozy-spooky** "enchanted lagoon at dusk"
ART made the bog a teal **daytime** lagoon (`bog`, sun ×1.9). The new brief asks for "warm-cozy-spooky: fireflies,
purple-teal, glowing mushrooms". W replaces the default:

| Preset | fog / fogLow | skyTop | hemiSky / hemiGround × I | sun × I, elev | shadowI | exp | hero | motes |
|---|---|---|---|---|---|---|---|---|
| **bog_dusk (W, new default; `bog` kept as the day variant)** | `#86C2C8` / `#6AAFA8` | `#7A68C8` | `#B8A8F0` / `#3E7A66` ×1.35 | low warm sun `#FFCF98` ×1.6, **0.28** | 0.50 | 1.05 | 1 (uGlow 3.5 m) | **fireflies 56** + spores `#B8F0D8` 30 |

Ground (ART + W): `#3E8A6A / #5AA87A / #D2C29A`; boardwalks `#E8D6B0`; lagoon `#2FAE9E`. **Accent:** glow-mint
`#8FF0D8` (mushrooms), lilac `#C9A8FF` (lily flowers, lantern glass), lantern amber `#FFC46B`. `fogDensity` 0.058
(ART D13), `fogFalloff` 1.2 (fog hugs the water). Target luma ≥ **0.40**, chroma ≥ 0.16, R−B ≥ −0.04 (cool by
design; the lamps and fireflies keep it cozy).
- Purple sky over a teal haze with a low peach sun is the "spooky but safe" read: a storybook swamp, not a horror
  swamp.
- `bog.js:8` `env: { default: 'bog_dusk' }`. `uLampStr` 1 (12 lamp posts along the spine, W14). Music per ART §9.3.

### 4.6 Keep (Houndhold Keep), **cozy-spooky** "Barkus's moonlit party castle"
| Preset | fog / fogLow | skyTop | hemiSky / hemiGround × I | sun × I, elev | shadowI | exp | hero | motes |
|---|---|---|---|---|---|---|---|---|
| **keep_twilight (W, new default; `keep_storm` alias for the boss storm beat)** | `#8A74B0` / `#8E6A8A` | `#3E3A8E` | `#CDB8F4` / `#6A4E5E` ×1.45 | moon `#BFEDE6` (teal rim) ×1.0, 0.55 | 0.45 | **1.08** | 1 | **W** `embers` → "lantern sparks" `#FFC46B` 40 (ART) + 24 fireflies |
| keep_storm (ART row, P3 boss only) | `#6E5480` / `#7A5A6A` | `#3E3270` | `#C2AEE2` / `#5A4048` ×1.45 | `#FFC488` ×0.9, 0.35 | 0.45 | 1.05 | 1 | sparks |
| keep_cellar (= ART) | `#6A4A50` / `#5E4048` | `#3E3270` | `#E2B8A0` / `#4A3436` ×1.50 | off | — | 1.05 | 1 | sparks |

Ground (ART): `#8A7268 / #A68A7A / #D8BCA0` (honey stone). **Accent:** Barkus royal blue `#5A7FD6`, bone-gold
`#F2D06B`, teal moss `#4FD1B0`. Lanterns `#FFC46B`. Target luma ≥ 0.36, R−B ≥ 0.0.
- The storm (lilac CSS flash, ART §2.5) only rolls in for Barkus P3. The approach and courtyard are a clear purple
  twilight with a teal moon. Spooky stays: the silhouette castle, jack-o'-lanterns, a moon. Grim goes: no ash, no
  black stone, no gibbets.
- `keep.js:8` `env: { default: 'keep_twilight' }`. GroundMist mul 0.5 (W3).

### W24. Frame-target amendment (ART §2.3)
"night/keep ≥ 0.32" → **twilight presets (forest_twilight, bog_dusk, keep_*, meadow_night, sky_night) ≥ 0.36 mean
luma, ≤ 15 % dark pixels (luma < 0.2)**. Day presets are unchanged.

### 4.7 Drop-in rows (`world/Env.js` ENV_PRESETS; ART keys `exposure`, `shadowI`, `rim`, `hero`)
```js
meadow_morning:  { fogColor:'#FFE6CC', fogDensity:0.040, fogLow:'#F2D3A8', skyTop:'#9FD0F5', hemiSky:'#CBD8FF', hemiGround:'#D4A874', hemi:1.25, sunColor:'#FFE0B0', sun:2.3, sunElev:0.40, sunAz:-1.9, grade:'none', wind:0.5, env:0.25, shadowI:0.55, exposure:1.02, rim:'day', hero:0.40 },
meadow_night:    { fogColor:'#5A64A8', fogDensity:0.050, fogLow:'#525C9E', skyTop:'#2E3A7E', hemiSky:'#9CB0F4', hemiGround:'#4A4478', hemi:1.15, sunColor:'#C6D6FF', sun:0.9, sunElev:0.9, sunAz:0.6, grade:'night', wind:0.4, env:0.25, shadowI:0.50, exposure:1.08, rim:'night', hero:1 },
forest_twilight: { fogColor:'#6A66B4', fogDensity:0.055, fogLow:'#5A6E96', skyTop:'#3A3E96', hemiSky:'#B0B6F4', hemiGround:'#3E6A58', hemi:1.25, sunColor:'#D6E6FF', sun:0.9, sunElev:0.9, sunAz:0.6, grade:'night', wind:0.3, env:0.25, shadowI:0.50, exposure:1.10, rim:'night', hero:1 },
bog_dusk:        { fogColor:'#86C2C8', fogDensity:0.058, fogLow:'#6AAFA8', skyTop:'#7A68C8', hemiSky:'#B8A8F0', hemiGround:'#3E7A66', hemi:1.35, sunColor:'#FFCF98', sun:1.6, sunElev:0.28, sunAz:-0.6, grade:'none', wind:0.3, env:0.25, fogFalloff:1.2, shadowI:0.50, exposure:1.05, rim:'#FFF0C6', hero:1 },
keep_twilight:   { fogColor:'#8A74B0', fogDensity:0.042, fogLow:'#8E6A8A', skyTop:'#3E3A8E', hemiSky:'#CDB8F4', hemiGround:'#6A4E5E', hemi:1.45, sunColor:'#BFEDE6', sun:1.0, sunElev:0.55, sunAz:0.4, grade:'night', wind:0.5, env:0.25, shadowI:0.45, exposure:1.08, rim:'night', hero:1 },
// aliases (story cues and saves): forest_night → forest_twilight, hub_grey → hub_hush (ART D14)
```
- **`grade: 'night'` caveat:** `Ambient.motesFor` (`Ambient.js:22`) and `Dressing.js:269` key off `grade === 'night'`.
  `bog_dusk` uses `'none'` so the bog keeps its own motes table entry (W9). The lamp switch reads `uLampStr > 0`
  rather than the grade (ART X6).
- `uLampStr`: 1 for meadow_night, forest_twilight, bog_dusk and keep_*; 0.35 for gate_dusk (the gate torches glow at
  sunset); 0 elsewhere.

---

## 5. Prop and asset swaps: from "medieval war" to "storybook adventure"

Principles (they extend ART §8.3):
- Rounded, toy-scaled, 2 colours + 1 accent.
- **Nothing that says death, war or dungeon in play**: no gravestones, crosses, coffins, gibbets, cages built of iron
  bars, siege wrecks or skulls.
- Rescue cages are **wicker or wooden pet carriers with a ribbon**, not iron.
- Spooky is allowed only as "Halloween-cute": pumpkins, a friendly moon, fireflies, glowing mushrooms.
- All swaps use packs already in `public/assets/models/env/` (0 new downloads). All static props go through ART §8.3
  rule 6 (merge per biome, 1–4 draws), so swaps are **draw-neutral**.

### W4. The un-desaturation pass (world, levels)
| Call | Now | → | Why |
|---|---|---|---|
| `gate.js:170` bridge pillar | `sat 0.15, mul 0.6` | `{ tint: '#E8B898', sat: 0.9, mul: 1.0 }` | Coral sandstone, not wet slate |
| `gate.js:186, :201` towers, walls | `sat 0.25, mul 0.95` | `{ tint: '#E8B898', sat: 0.9 }`; roofs keep their KayKit blue | Toy fort |
| `gate.js:286` battlefield wrecks | `sat 0.55, mul 0.85` | see W15 (the wrecks are replaced) | |
| `gate.js:312` ballista | `sat 0.6` | `sat 1.0` + cork `#C99A6A` tint | |
| `meadow.js:420` bridge stone | `sat 0.15, mul 0.46` | `{ tint: '#E3CFAE', sat: 0.8, mul: 1.0 }` | It was half-black |
| `meadow.js:67` HAY | `sat 0.12, tint #E6CF8C` | `sat 0.6, tint '#F2D27A'` | Hay should glow butter |
| `LevelKit.js:475` vigil lantern | `sat 0.15, mul 0.8` | removed; see W10 | |
| `meadow.js:287` wall | `flatColor '#8E9086'` | `'#E8D6B4'` (ART) | |
- Rule (world lint, unit test in `tests/unit/levels.*`): no `kit.tpl` option `sat < 0.5` or `mul < 0.8` without a
  `// mood:` comment that names the story beat.

### W5. Ground paints become warm, not muddy
`kit.paint` colours are the "trodden" stamps under setpieces. New rule: a paint is the level's `GROUND.soil` or `path`
(ART palette) at most 12 % darker, never below luma 0.30. Concrete remap (all levels):

| Now | → | Use |
|---|---|---|
| `#4B4630`, `#4A4428`, `#4A4030` | `#B89A64` (meadow) / `#A88A5E` (forest) | trodden earth under camps and fields |
| `#33301F`, `#2E3624`, `#33402A`, `#3A3624`, `#3A3A2A` | `#8E9A54` (forest moss) | tree bases, arenas → but arenas use **W20** |
| `#46502A`, `#5E5743` | `#A6B060` / `#C8B46E` | meadow glade, crossroads |
| `#6A6450` (gate yard), `#7A6A50` (town bakery) | `#D6B276` / `#E0C69A` | yards |
| `forest.js:273` crack_mark `#2E2A24` | `#7E6248` | the cracked boulder stays readable |

### Per-level swap lists
**Meadow** (`meadow.js`)
- **W7 skyline** (`:578`): `building_castle_red` 20 m → **`village-kaykit/decoration/mountain_B_grass_trees.glb`**
  (h 26) + **`hills_A_trees.glb`** (h 12) + **`building_windmill_blue.glb`** (h 14). The Pawsbury tower stays (it is the
  destination), recoloured `building_tower_A_blue`. 'far' group only: 0 iso cost.
- **W10 Vigil Stones** (every level, `LevelKit.js:50–51, :475`): `statue_obelisk` + `graveyard/lantern-candle` is
  graveyard furniture. Replace with a **waystone**: `nature/stone_tallB.glb` (h 1.3, tint `#E3CFAE`) + a procedural
  paper lantern on a crook (`kit.proc('vigil_lantern')`: cylinder 0.22 × 0.32 m, cream `#FFF0D6`, cap and base `#E0794F`,
  emissive `#FFC46B` 0.6 when lit, 0 when unlit) + a pink ribbon (`#FF8FB1`, 0.04 m box). It stays one merged
  template. The checkpoint read: when lit, a mint ring decal `#9BE3C4` α 0.35, r 1.2 (existing decal pool).
- `graveyard/stone-wall.glb` drystone walls: keep the mesh and tint `#E8D6B4` (ART). **Add** a flower strip on top:
  `nature/flower_yellowA/purpleA/redA.glb` merged every 1.6 m (red only ≥ 3 m from the spine).
- **Practice field**: straw dummies keep straw. Add a W12 bunting string between the barn and the gate (butter/sky/pink)
  and a `village-kaykit/decoration/flag_yellow.glb` on the windmill.
- **Mochi's cage cart** (`:69–97`, iron bars `#3A2A1F`, `#1E1A16`): the bars become rope-wrapped wooden slats
  `#B7773F` / `#E8B87A` with a lilac bow on the lock (`#C9A8FF`). The cage stays readable as a cage and is no longer
  a prison.
- Flower patches near the Picnic Glade: `crops_*` (carrot, pumpkin, turnip) beds as a "kitty garden", merged.

**Forest** (`forest.js`)
- `C.bark #4E3B2A` / `barkDark #3A2C20` → `#7E4E2A` / `#5E3A22` (ART wood dark) and `C.leaf #4F6A2E` → `#58A84A`
  (canopy mid), `leafDark #3B5226` → `#2F7A45`.
- `torch_lit.glb` in the rat camp (`:23`, ×6) → the pumpkin lantern on a stake (W, §4.2). Rat banners
  (`:178–185`, `#8A2E2A`) → a cheese-yellow wedge on teal `#3FA59A` (the Snickerpack top colour), a silly, readable
  faction mark.
- Add `nature/mushroom_redGroup.glb` and `mushroom_tanGroup.glb` clusters (×24) and `tree_*_fall.glb` accents (×6,
  orange canopy, ≥ 6 m from the spine) for warm pops between greens.
- Sage's hanging cage: a wicker basket (`#E8B87A`) with a leaf-garland rope.

**Town** (`town.js`)
- **W11 occupied banners** (`:178–181`, tattered grey `#5A5650` with a cream cackle): **prank banners**, plum `#7A4E9A`
  with a mustard `#E0B043` grinning-hyena doodle, hung crooked, plus 3 "graffiti" decals (giant paw-print and "HA HA"
  in mustard, existing decal pool) on the square. They are cleared when the town is freed (the existing flag).
- When `town.free`: W12 bunting over Main Street (5 strings, full candy set), `town/banner-green.glb` + `banner-red`
  recoloured pink/sky, `village-kaykit/buildings/building_stage_A.glb` (a festival stage in the square, hub only),
  flower boxes on every KayKit home (ART §8.3), and the fountain water `#8FE0E0`.
- Houses: mix `_blue` and `_red` KayKit variants 50/50 and re-tint red roofs to terracotta `#E0794F`, blue to
  `#6F8FC4`, plus 2 butter `#F2C14E` and 2 moss-teal `#4FA39A` (ART tokens) so the street is a candy row, not a brick
  row.
- `C.iron #4A4C50` → `#6E7A8E` (blue-grey toy iron); the bell `C.bronze #B98A3E` → `#E8C27A`.

**Gate** (`gate.js`)
- **W15 Old Battlefield** (`:284–`, five `*-demolished` siege wrecks, debris, spears, shields): this is the most
  "war" set in the game. It becomes the **"Hyena Toy Fort"**:
  - `siege-catapult.glb` and `siege-ballista.glb` stay **intact** (no `-demolished`), tinted cork and coral, with W12
    pennants;
  - `debris` and `debris-wood` → `crate_A_small`, `barrel`, `hay-bale` (tint `#F2D27A`);
  - spears (`:104`) → foam-tipped practice lances (`#C99A6A` shaft, cream `#FFF6E8` ball tip);
  - shields (`:105`) → round painted shields (teal `#3FA59A` / mustard `#E0B043` halves);
  - craters → none.

  Gameplay geometry and colliders stay identical (same footprints).
- The hyena war-wagon cage (Tater, Mittens, Pip): wooden slats + ribbon, as for Mochi.
- `metal-gate.glb` portcullis: keep (it is the gate) and tint it `#8E96A2` steel-blue. Banners `flag-banner-long` →
  coral/cream. Wall torches (`:243–252`): keep as warm sunset lamps; the colour `#FF8A3D` → `#FFB070` (less fire, more
  lamp).

**Bog** (`bog.js`, the M3 build-out)
- Trees: `tree_*_dark.glb` (`bog.js:22`, `LevelKit.js:64` horizon) → `tree_default.glb` / `tree_oak.glb` with canopy
  tint `#7FC8A0` (ART) + **`nature/hanging_moss.glb`** (tint `#9ED8B8`) on 1 in 3 trees.
- **W13 glowing mushrooms:** 30 × `mushroom_redTall` / `mushroom_tanGroup` recoloured cap `#C9A8FF` (lilac) or
  `#8FF0D8` (mint) with emissive 0.5 on the cap material (one merged mesh, one material, emissive via vertex-colour
  mask: 1 draw). Placement: 2–5 m off the boardwalk, never on it.
- **W14 lamp posts:** 12 × `graveyard/lightpost-single.glb`, recoloured honey wood `#B7773F` + lantern glass `#FFC46B`
  emissive, every ~14 m along the spine, feeding `uLamps`. Nearest 4 light the ground.
- 12 giant lilies (ART) with flowers `#FFF6D8` / `#C9A8FF`; `waterlily_A/B.glb`, `waterplant_A–C.glb` (KayKit)
  scattered 40.
- Fireflies and spores (§4.5). Optional (P3): a friendly frog chorus audio bed.

**Keep** (`keep.js`, the M3 build-out)
- `fire-basket.glb` ×8 (`keep.js:24`) → **jack-o'-lanterns**: `graveyard/pumpkin-carved.glb` (×6) and
  `pumpkin-tall-carved.glb` (×4), orange `#FF9A3C`, emissive slit `#FFC46B`, on walls and gateposts. They feed
  `uLamps`. This is the "spooky but cute" anchor.
- `rock_*` crag (`keep.js:22`): tint honey `#C8A486` (rock) and teal moss tops `#4FD1B0` (vertex-colour by normal.y,
  ART canopy trick).
- **Barkus's vanity bunting:** W12 strings in royal blue `#5A7FD6` / bone-gold `#F2D06B` with bone-shaped pennants
  across the courtyard. The keep becomes a vain dog's party castle, which is funny rather than oppressive.
- Banners: `dungeon-kaykit/banner_patternA_blue.glb` and `banner_shield_yellow.glb` (in the pack, 0 downloads) instead
  of red.
- Moon: one unlit `CircleGeometry` disc `#F6F0D8` r 14 m in the 'far' group with a soft halo sprite (`makeGlowSprite`,
  `#BFEDE6`). Cutscenes only: 0 iso draws.

### W12. `world/Bunting.js` (new, owner world): candy strings in 1 draw
- One `InstancedMesh` per level, a triangular pennant (2 tris, 0.28 × 0.34 m; a variant: round lantern = 8-tri
  octagon prism for the forest and bog strings), Lambert + toon patch, `castShadow false`, per-instance colour from the
  level accent set (cycle 3, ±4 % L jitter).
- Strings are a catenary between two anchor points (sag 12 % of span), 0.55 m spacing, authored per level:
  `def.bunting: [{ a: [x, y, z], b: [x, y, z], set: 'accent' | ['#hex', ...], kind: 'pennant' | 'lantern' }]`.
- Flutter: vertex shader `sin(uTime*2.3 + instanceId*0.7) * 0.06 * FUR_WIND` on the bottom vertex only (the time
  uniform is shared from HFOG/ENV_U, so 0 new programs after warm-up: the program is compiled once at level load).
- Budget: **+1 draw, ≤ 240 instances (480 tris) per level**. Low tier: 120 instances.
- Camera: strings sit ≥ 3.2 m high. CONTROLS_SPEC `camFade` applies (strings crossing the lens-to-focus segment fade
  to α 0.3, the same path as canopies).

### W16. Story props: rescue cages read "carrier", not "prison"
`companions` builds the cages (`bridge_cage`, `treetop_cage`, war-wagon). Shared rule: wood slats `#B7773F`, a rope
lashing `#E8B87A`, a lilac bow `#C9A8FF`, cushion `#FF9EC0` visible inside. No bar thinner than 0.06 m (ART rule 4)
and no metal. Owner companions; the art spec reviewer signs off (S3).

### W17. Proc-prop palette remap (one shared table in `world/Props.js`; levels import it)
| Level `C` key | Now | → |
|---|---|---|
| wood / woodDark / plank | `#7A5B3E` / `#4E3A28` / `#A0825A` | `#B7773F` / `#7E4E2A` / `#E8B87A` |
| straw / burlap / rope | `#C9B26A` / `#9C8460` / `#8C6A4A` | `#F2D27A` / `#D8B880` / `#C9A06A` |
| red | `#B0453C` / `#8A2E2A` | `#E0605A` (coral-red) |
| iron | `#4A4C50` | `#6E7A8E` |
| stone / stoneDark | `#8E918A` / `#6E716B` (meadow, forest), `#9C9A92` (gate) | `#C9BCA6` / `#9C8E7C` (ART shared stone) |
| moss / dirt | `#5E6A3A` / `#4A4030` | `#8DB65A` / `#9C7650` |
| hyena (prop cloth) | `#5A5650` | `#7A4E9A` plum |
| cream | `#EFE3CF` | `#FFF3E2` |

---

## 6. Performance accounting (all deltas, End-state budgets)

| Item | Play draws | Tris | Programs | Notes |
|---|---|---|---|---|
| W1–W6, W8, W24 presets, exposure, paints, un-desaturation | 0 | 0 | 0 | data only |
| W12 Bunting | **+1** | ≤ 480 (Low 240) | +0 after warm-up (Lambert + toon patch variant shared with world) | castShadow false |
| W13 glowing mushrooms (bog) | 0 (merged into the biome static batch; emissive is a vertex-colour mask in the same material) | ~6k | 0 | ART rule 6 |
| W14 lamp posts, W15 fort, W10 waystones, flowers | 0 (merged) | ≤ +8k per level | 0 | replaces existing props 1:1 |
| W18 hero pool, lamp pools | 0 | 0 | 0 | `ENV_U` (ART X5/X6) |
| W20 arena stage | 0 | 0 | 0 | Terrain paint |
| W21 twinkles, W2 mist sparkles | 0 | — | 0 | existing particle pool, ≤ 6 particles/s |
| W23 cloud cards, moon | +1 (cutscenes / 'far' only) | ~2k | 0 (MeshBasic) | hidden in iso |
| W3 ground-mist muls | negative (fewer overdraw px) | | | |
| **Total in iso play** | **+1** | ≤ +8.5k | **0** | fits I1/I2/End with the margins in IMPLEMENTATION_PLAN §5 |

No post pass is added on any tier. Night and twilight presets need no extra lights (lamps are `uLamps`).

---

## 7. Gates (extend `art:toon`, ART §11.1; screenshot review §11.2)

| Gate | Check | Pass |
|---|---|---|
| L1 | No `#B7C0C3` / `#9AA196` remains in `src/` (grep, unit) | 0 hits outside comments |
| L2 | Every `ENV_PRESETS` row: fog HSV sat ≥ 0.12; twilight rows mean frame luma ≥ 0.36 | readback per level |
| L3 | `kit.tpl` lint: no `sat < 0.5` / `mul < 0.8` without `// mood:` | unit |
| L4 | `kit.paint` lint: paint luma ≥ 0.30 | unit |
| L5 | Arena stage: mean luma inside the arena disc ≥ 1.08 × the ring 3 m outside, grass density ≤ 0.45 | readback at each arena anchor |
| L6 | Hero pool: hero 1.5 m disc ground luma ≥ 1.06 × the 4 m ring | readback |
| L7 | Telegraph hue budget: inside arenas no static prop pixel has hue 0–35° with chroma > 0.30 below 1.6 m | readback mask |
| L8 | First-boot frame (`?new=1`, first gameplay frame after CS-01): preset `meadow_morning`, mean luma ≥ 0.50 | smoke `flow:prologue` |
| L9 | Draw budget delta in play ≤ +1 vs the pre-W build | `renderer.info` |
| S-W | Screenshot review set (ART S-series): meadow morning start, forest twilight camp, town festival, gate fort, bog dusk boardwalk, keep courtyard. A reviewer answers "dark?", "grim / medieval?", "can you find the hero in 1 s?", "can you find the danger in 1 s?" | yes / no / yes / yes |

---

## 8. Task list by owner (all after ART_WARM A0 lands `TONE`, `ENV_U`, Neutral, presets)

| Owner | Tasks |
|---|---|
| **world** | §4.7 presets + aliases (`forest_night`, `hub_grey`); `meadow.js:500,507`, `forest.js:499,506–507`, `bog.js:8`, `keep.js:8` defaults; W1 defaults (`HeightFog.js`, `Sky.js`); W4 un-desaturation; W5 paint remap; W6 silhouettes; W7 skyline; W10 waystones; W12 `Bunting.js` + per-level `bunting` data; W13–W15 swaps; W17 palette table; W20 arena stage; L1, L3, L4 units |
| **fx** | W2 mist walls; W3 GroundMist muls; W9 motes table (`Ambient.js:20–31`: gate → dust `#FFE0C0`, bog → fireflies+spores, keep → sparks+fireflies, meadow → fluff+petals, hub → petals); W21 twinkles; W23 clouds (with world) |
| **core** | `toneMappingExposure` from Env per preset (ART); `Game.js:110` background (ART) |
| **story** | `cs01.js:146,204` → `meadow_morning` and "Morning Practice"; `cs04.js` → `forest_twilight` (alias works without the edit); `cs10.js` keeps `hub_grey` (alias). Copy that matches (handled by the story lens) |
| **companions** | W16 cage restyle (Mochi, Sage, war-wagon) |
| **enemies** | none here (ART §7 mischief palette); check the L7 hue budget against the Rat helm mustard |
| **tests / core** | L1–L9 in `tests/smoke/art.mjs` and unit |

Order: presets + defaults + desaturation + paints (1 day, biggest visual win, 0 perf risk) → prologue morning +
twilight rows → bunting + swaps per level (meadow, town, gate first; bog and keep with M3) → twinkles, clouds, moon.
