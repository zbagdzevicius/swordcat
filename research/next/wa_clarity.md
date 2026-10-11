# SWORDCAT: visual clarity + fun/juice, "clearer and happier than League" (wa_clarity)

Author: design lens "visual clarity + juice", 2026-10-11. Status: **proposal** (design only; nothing under `src/` was
touched). Builds **on top of** `ART_WARM_SPEC.md` (binding look), `CONTROLS_SPEC.md` §7–§10 (indicators, cursors,
markers, HUD), `AUTOCAM_SPEC.md` and `PERF_SPEC.md` / `IMPLEMENTATION_PLAN.md` §5 (budgets). Where those already
specify something, this file only lists the delta. Every item below is **0 new draw calls** unless stated, uses no
post-processing, and rides existing pools: `GroundDecals` (1 instanced draw, MAX 160), `Marks` (1 draw),
`Particles` (1 draw), `DamageNumbers` (DOM pool 20), CSS on `#ui`.

User request: *"make it much better from visual perspective than league of legends (not graphics, but visual
clarity, fun, warm etc). Upgrade onboarding, story to feel more warm. Right now it looks kind of dark, too medieval;
it should have a fun adventure vibe."*

---

## 0. Audit: what the screens show today

Evidence: `docs/screens/11-crowfields.png`, `15-results.png`, `research/next/shots/meadow_toon.png`,
`art1_iso_13m_zoom3.png`.

| # | Problem | Where | Severity |
|---|---|---|---|
| A1 | At iso 13 m, the hero is ~40 px tall on a 720 p frame (~23–28 px on a 390 px phone). Her steel and cream cape have about the same value as the sunlit path, so she disappears on the path (`meadow_toon.png`). League solves this with oversized champions and a strong team-colour ring; we only have a 0.40-alpha pink ring | `characters`, `GroundDecals` | **High** |
| A2 | The mood is grey fog, near-black grass in shadow, a dim results backdrop and Cinzel/MedievalSharp serif titles ("CHAPTER CLEAR!", "Purrdale Meadows"). Gold studs and a parchment noise texture make the UI look medieval. ART_WARM_SPEC §2/§9 fixes the palette and fonts; the rest of the look still has to follow | `ui.css:1–60`, `results.js`, `fonts.js` | **High** (already specced) |
| A3 | Telegraph language is colour-only: parry = `#FFFFFF`, gold = `#FFD34D`, red = `#FF3B30`, aoe = `#FF6A3D` (`config.js:269`). White wedges on the new cream path (`#E2C996`, L* ~82) lose contrast. Red vs aoe-orange are ~14° apart in hue and indistinguishable to deuteranopes or in sunlight on a phone | `config.js:269`, `Telegraphs.js`, `GroundDecals.js` | **High** |
| A4 | The crow dive shadow is drawn black (`Telegraphs.js:455` `#05070A`, `TELEGRAPH.colors.shadow #000000`). ART_WARM §8.4 already changes it to plum | fx | Med (specced) |
| A5 | Damage numbers are a correct baseline (Fredoka 700, ink stroke) but there is no squash-pop, no sideways spread for combo hits, and no words. Every hit looks the same | `DamageNumbers.js` | Med |
| A6 | Hitstop is global and well tuned (`JUICE`, `config.js:272`), but nothing on the victim *shows* the impact during the freeze (no squash, no white flash yet; ART_WARM §6.5 / D17 add them) | combat/enemies | Med (mostly specced) |
| A7 | The pickups bob (`Pickups.js:290`) and the fish is magnetised (`:231`), but there is no sparkle, no arc into the HUD and no "ding" moment, so collecting feels flat | `world/Pickups.js`, `ui/hud.js` | Med |
| A8 | Idle life: emotes exist (`KittenBuilder.js:758`: earsFlat, tailPuff, blink, nod, shake, meow, sneeze, bowBounce, wave, throw) but nothing triggers them during idle. Meme Cam starts at 15 s (`config.js:40`). Before that she just stands there | player | Med |
| A9 | The CONTROLS_SPEC §10.1 ability bar is "parchment and gold", which conflicts with the candy UI (ART_WARM §9.1). The HUD shows every counter at all times (hearts, Grit, Valor, lives, milk, fish, kittens, letter), even when nothing is happening | `abilityBar.js`, `hud.js` | Med |
| A10 | Unlocks and rescues only get a toast line ("Holy Slash learned! Hold ⚔…", `strings.js:222`). The game's big moments get the same 2.5 s ribbon as "Camera locked." | `toasts.js`, `strings.js` | **High** for fun |
| A11 | Tutorial prompts are imperative manuals ("Right-click where to go, or use [WASD]…"). Nothing in the world shows where to tap | `story/strings.js:101–130`, `tutorial.js` | **High** for onboarding |

---

## 1. Ranked proposals (impact ÷ cost)

Cost: S ≤ 0.5 day, M ≤ 2 days, L > 2 days. "Owner" uses GAME_DESIGN §19.2 areas.

| Rank | Proposal | Impact | Cost | Owner | § |
|---|---|---|---|---|---|
| 1 | **Shape-coded telegraphs** (glyph at the tip, cocoa ink sandwich, colour-blind safe) | Clarity ★★★ | S–M | fx, core config | 3 |
| 2 | **Hero pop-out**: play scale 1.12, a brighter ring, the "sun spot" under her, cape forced to red in play | Clarity ★★★ | S | characters, fx | 2 |
| 3 | **Celebration cards** for unlocks, rescues, Heart Bells and shards (the "level-up" moment we lack) | Fun ★★★ | M | ui, fx, story | 8 |
| 4 | **Juicy hits**: pop-curve numbers, combo words ("Snip! Snap! Swoosh!"), bonk stars, victim squash during hitstop | Fun ★★★ | S–M | fx, enemies | 4 |
| 5 | **Pickup loop**: sparkle twinkle, magnet hop, fly-to-HUD, counter bump, pitch ladder | Fun ★★☆ | S–M | world, ui, audio | 6 |
| 6 | **In-world onboarding**: ghost-paw demos, tap sparkles on the ground, a progress-dot pill, warm copy | Onboarding ★★★ | M | story, ui, fx | 10 |
| 7 | **Friend / foe / interactable / pickup / hazard colour + motion language** (one table, enforced by a lint) | Clarity ★★☆ | S | all | 2.1 |
| 8 | **Tap/click acknowledgement**: paw ripple + head turn + ear flick + double-tap "zoomies" paw | Feel ★★☆ | S | fx, player | 5 |
| 9 | **Calm HUD**: auto-tuck counters out of combat, candy ability bar, coral HP pills | Clarity ★★☆ | M | ui | 7 |
| 10 | **Idle and emote ladder** for the hero and companions, after-fight paw-bump, tap-the-hero purr | Warmth ★★☆ | M | player, companions, characters | 9 |
| 11 | **Hover "boing"**: anything you can click wiggles under the cursor or tap | Feel ★☆☆ | S | characters, enemies | 5.3 |
| 12 | **Results screen redo**: sunny scrim, stamp-slam rank, count-up rows, confetti curtain | Fun ★★☆ | S | ui | 8.4 |

---

## 2. Silhouette and colour language (the core clarity contract)

### 2.1 Five classes, each with its own colour, shape and motion
League separates allies and enemies with team colour only. We use **three channels at once** (hue, shape, motion), so
the read survives a 5-inch screen in sunlight and colour blindness.

| Class | Hue family | Ground mark (GroundDecals) | Motion signature | Above-head mark (Marks) |
|---|---|---|---|---|
| **Hero** | ginger `#E89A55`, pink bow `#FF9EC0`, cape `#D9323F`, rim `#FFE6B8` | pink ring `#FF8FB1` (was `#F7A8C4`) r 0.75 m, **α 0.55**, + a soft "sun spot" disc (§2.2) | idle breathing, bouncy gait (ART §6.5) | none (she is always findable) |
| **Friends** (companions, villagers, kittens) | warm pastels, cream | companion: mint ring `#8EE3C8` r 0.5 m α 0.35, **dashed** (8 dashes) | hop-follow, head-glance (ART §6.6) | heart pip `HEART` `#FF6F9C` 0.6 s when they help |
| **Foes** | cool mischief family: plum `#6E5A86`, slate `#5D6C88` + top colour (ART §2.6) | none at idle; thin red aggro ring once alerted (CONTROLS §8.2.6) | "comic tell" hop before attacks | "!" on alert, glints on wind-up |
| **Interactables** (NPCs, cages, levers, Vigil Stones, chests) | butter `#FFD84A` + cream | butter ring `#FFD84A` α 0.30, **slow pulse** 0.8 Hz r ±6 % | idle wiggle every 3 s (±4°, 0.3 s) | sparkle `STAR4` twinkle every 1.6 s |
| **Pickups** (fish, hearts, milk, letters) | silver/gold fish, pink heart, white milk | no ring (small; a ring would be clutter) | bob 0.06 m (exists) + **yaw spin 1.2 rad/s** | `STAR4` twinkle `#FFF1C4`, 1 per item every 1.2 s, phase-seeded |
| **Hazards** (enemy attacks, webs, pits, thorns) | coral `#FF5A4E` / tangerine `#FF9A3D`, grab violet `#9B5CFF` | §3 telegraph shapes | sweep fill outward | shape glyph (§3) |

**Rules (lint `tests/unit/colorLanguage.test.js`, pure check on config tables):**
1. Pink (`#FF8FB1`–`#FF9EC0`, hue 335–350°) is **hero-only** on the ground and in rings. Enemies never use pink
   (ART §2.2 already says this for models).
2. Coral/red/orange (hue 0–30°, S > 0.6) on the ground means **enemy attack**. Never use it for pickups, flowers
   within 3 m of the spine (ART §2.2), or UI buttons that appear in play.
3. Butter `#FFD84A` with a pulse means "you can use this". Gold `#FFD34D` with a star tip means a "gold" parry telegraph.
   These two are told apart by **motion** (pulse vs sweep) and **placement** (ring around an object vs wedge out of an
   enemy).
4. Every class mark that is drawn over the ground has a 0.03 m **cocoa `#4A2A1F` outer edge at α 0.35** (the
   "ink sandwich", §3.2), so it reads on the cream path **and** on dark grass.

### 2.2 Hero pop-out (fixes A1)
| Change | Value | File | Cost |
|---|---|---|---|
| Play-mode visual scale | `READABILITY.playScale = 1.12` on the model root only, in iso modes (`ISO_MODES` in `Readability.js:30`); lerp to 1.0 over 0.3 s on the cutscene hand-off (CONTROLS §2.6). Hitboxes, `MODEL_FIT` and nav radius are unchanged. Companions 1.08, enemies 1.0, bosses 1.0 | `characters/Readability.js`, `materials.js` `READABILITY` | 0 draws, S |
| Hero ring | colour `#FF8FB1`, α 0.40 → **0.55**, width 0.06 → **0.08 m**, plus a 0.03 m cocoa outer edge α 0.35 | `GroundDecals.js` her ring | 0 draws |
| "Sun spot" | a soft disc in the same decal instance: r 1.1 m, cream `#FFF4DC`, additive α 0.18, radial falloff `1 − smoothstep(0.2, 1.0, d)`. It lifts the ground under her by about +0.08 luma, so she stands in her own pool of light (a classic iso readability trick: Hades, Diablo) | `GroundDecals.js` | 0 draws |
| Cape in play | Force `capeRed #D9323F` while `ISO_MODES` and the equipped cape value is < 0.35 luma difference from the ground under her; cosmetic capes (Meme White) keep their colour but gain a 0.6 m red-pink pennant tip. Simpler alternative: Meme White becomes cream `#FFF3E2` with a `#FF9EC0` hem stripe (one atlas edit) | `characters/Cape.js` | 0 draws |
| Bow ×1.25 top-view | exists (`TOP_VIEW`); raise to **×1.4** at lens ≥ 12 m | `Readability.js` `updateReadability` | 0 |
| Gate | §11.2 S-review: in `meadow_toon`-like framing her bbox chroma ≥ 1.5 × ground in the 3 m disc (ART §2.3 already gates 1.3) | core smoke | — |

---

## 3. Telegraphs readable at a glance on a phone (fixes A3, A4)

### 3.1 Shape first, colour second
Add one glyph at the **tip of every strike wedge** and at the centre of every aoe disc. Draw it in the existing
`Marks` batch with a ground-hug flag, or as a `GroundDecals` shape. `GroundDecals` already draws "rings, discs, fans,
paws, stars, chevrons, arrows", so new SDF shapes are cheap. 0 draws.

| `telegraph` kind | Ground fill | Rim | Tip glyph (0.45 m, ground) | Head mark (constant px, CONTROLS §8.2.3) | Meaning in the tutorial |
|---|---|---|---|---|---|
| `parry` | none → sweep α 0.25 | **white `#FFFFFF` + cocoa edge** | **shield** (rounded) | white glint 28 px | "Block or parry it" |
| `gold` | sweep α 0.3 | gold `#FFD34D` + cocoa edge | **8-point star** (exists) | gold glint 34 px | "Parry it for a big stun" |
| `red` | filled α 0.35 | jagged, `#FF5A4E` (was `#FF3B30`) | **double chevron ">>"** pointing along the lunge | "!!" 34 px, pulsing 4 Hz | "Get out of the way" |
| `aoe` | filled α 0.30 with **concentric fill grow** (fill radius 0 → r over the wind-up) | `#FF9A3D` tangerine (was `#FF6A3D`) | **dot-burst** (6 dots) | "!" | "Step out of the circle" |
| `grab` | sweep α 0.25, violet `#9B5CFF` | violet + cocoa edge | **paw-hand** | "?" swirl | "Tumble away or he steals fish" |
| `shadow` (crow) | plum `#3A2346` α 0.55 (ART §8.4), **shrinks** from 1.6 r to r | none | crow-foot | — | "Move!" |
| `aim` (bolt) | dotted line (exists) | white → solid when locked | arrowhead | glint | "Parry it back" |

Why it beats League: League teaches skillshot shapes per champion. We use **five glyphs for the whole game** and say
each one exactly once in the tutorial (§10.3).

Constants (core `config.js:269`, additive):
```js
export const TELEGRAPH = { colors: { parry: '#FFFFFF', gold: '#FFD34D', red: '#FF5A4E', aoe: '#FF9A3D', aim: '#FFFFFF',
  grab: '#9B5CFF', jeer: '#B07CFF', shadow: '#3A2346' },
  glyph: { parry: 'shield', gold: 'star8', red: 'chevron2', aoe: 'dots6', grab: 'paw', shadow: 'crowfoot', aim: 'arrow' },
  ink: { color: '#4A2A1F', width: 0.03, alpha: 0.35 }, glyphSize: 0.45, glyphSizeTouch: 0.55 };
```

### 3.2 The ink sandwich (works on cream path and dark grass)
In the `GroundDecals` fragment shader, for any rim: `col = mix(ink, rimCol, smoothstep(rimInner, rimInner + 0.015, d))`,
with the outer 0.03 m drawn in `TELEGRAPH.ink`. Replace the near-black `vec3(0.04, 0.025, 0.02)` in the
`Telegraphs.js:295/299` aim-line shader with cocoa `vec3(0.29, 0.16, 0.12)`, which is warm and never black (ART §2.3).

### 3.3 Timing visuals (one rule set for every enemy)
- **Wind-up 0 → 70 %:** rim at α 0.6, fill sweeps outward, the enemy's rim lerps to the telegraph colour (ART D10)
  and **squashes** −0.10 (anticipation, `Squash` target, ART §6.5).
- **Parry window open:** rim thickens 2 → 4 px (exists), the glyph **pops** ×1.3 → 1.0 over 0.08 s, and the enemy
  stretches +0.12 (the "tell").
- **Strike:** the wedge flashes white α 0.8 for 0.05 s, then fades out over 0.12 s.
- **Phone:** glyph ×1.22 (`glyphSizeTouch`), rim minimum width 0.14 m (CONTROLS says 0.12).
- **Off-screen:** `threatArrows.js` arrows use the **same glyph** inside the arrow (shield / chevrons / dots).

---

## 4. Hit feel: hit-stop, squash and numbers (fixes A5, A6)

### 4.1 During the hitstop freeze (`ctx.game.hitstopT > 0`)
The world freezes, but these keep animating on **unscaled time**, so the freeze reads as impact rather than lag:
- Victim: `uFlash` 1 → 0 over the freeze + 0.06 s (ART D17), `Squash.kick(-2.0)` (ART §6.5), and a 0.04 m
  positional **shake** on the visual root (sin 60 Hz, decays with the freeze).
- Hit spark: 3 `STAR4` `#FFFFFF → #FFE066` (ART §8.6) + one `RING` `#FFF6DA` 0 → 0.6 m, life 0.14 s.
- The damage number spawns **during** the freeze (exists) with the pop curve below.

Hitstop values stay as `JUICE` (they are good). One change: `JUICE.kill.hitstopAdd 0.04 → 0.06` for the **last enemy
of an encounter** only (a "final blow" beat), plus a 0.25 s slow-mo at `timeScale 0.35` through the existing
`game.slowMo`. No camera zoom (AUTOCAM owns framing).

### 4.2 Damage numbers v2 (`fx/DamageNumbers.js`)
| Property | Now | Proposed |
|---|---|---|
| Scale curve | `pop` (linear-ish) | **overshoot**: 0 → 1.35 at 0.06 s → 0.95 at 0.14 s → 1.0; out: scale 1 → 0.7 + fade over the last 0.25 s |
| Path | straight rise 0.6 m | **arc**: rise 0.6 m + sideways `dx` = ±0.25 m alternating per combo step (Snip left, Snap right, Swoosh up-centre ×1.2) |
| Colours | white / gold crit / green heal | normal `#FFFFFF`, heavy `#FFF1C4`, crit `#FFD34D` + sparkle (exists), heal **mint `#9BE3C4`** (matches ART §8.6), hurt-to-her **`#FF8FB1` pink** (was `#FFB3B3`) |
| Stroke | `-webkit-text-stroke 5px #3A2A1F` | stroke `#4A2A1F` (ART ink) + `text-shadow 0 3px 0 #4A2A1F` (exists) |
| Stacking | each hit separate | hits on the same target within 0.35 s **merge**: the old number bumps (scale kick ×1.15) and counts up. Fewer DOM nodes, clearer read |
| Words | none | new style `word` (below) |

**Combo words** (`DAMAGE_STYLE.word = { color: '#FFF6DA', size: 30 }`, sharing the pool and rate limit with numbers,
max 1 word per 0.25 s): `slash1` "Snip!", `slash2` "Snap!", `slash3` "Swoosh!", `bright` "Shine!", Holy
"Sunburst!", parry "Ting!" (gold), perfect dodge "Whoosh!", Riposte "Riposte!", kill of the last foe "Bonk!".
Words appear 0.25 m above her head (not the victim), skewed −4°, with a pink `#FF9EC0` 3 px stroke under the ink.
They teach the move names without a tutorial page, and they are the "fun" layer League doesn't have. Setting
`settings.hitWords` (default on; off in "minimal" HUD).

### 4.3 Defeats ("faint and poof", ART §7.1) + loot fountain
On a kill, the fish drop (if any) pops out in a **hop arc** (apex 0.9 m, 0.45 s, 2 bounces with `bounce 0.35`)
instead of appearing in place, then the magnet takes over (§6). It uses the existing `Particles` FISH shape for the
flight and hands off to the `Pickups` instance on landing.

---

## 5. Orders, markers, path, cursors, hover (feel of "I told her and she heard me")

CONTROLS §10.2–10.3 defines the markers and cursors. Deltas:

### 5.1 Tap / click acknowledgement
- Paw ripple: colour **`#FF8FB1`** with a cream `#FFF6E8` inner, scale 0 → 1.0 in 0.12 s with overshoot 1.15, fade
  0.6 s (exists), plus **2 tiny `STAR4`** pops at the ripple edge (Particles, life 0.3 s).
- Second tap on the same spot within 0.35 s: a **double paw** + the hero does a happy hop (`Squash.kick(+1.5)`).
  Gameplay is unchanged (she already runs).
- Head turn: on a new `move` order, her head snaps 70 % toward the goal at λ 24 before the body turns (the body
  keeps facing λ 16, CONTROLS §5.2), plus `emote('bowBounce')`. This is the "she heard me" read, 0 cost.
- Rejected order: grey ✕ paw (exists) + `emote('shake')` (head shake 0.7 s, exists) instead of only the "mrr?" sound.
- Attack order: the target gets the red-orange ring (exists) **and** a tiny "boing" (§5.3).

### 5.2 Path preview
- `settings.pathPreview`: default **`'auto'`**: ON for touch during chapter 1 and the tutorial, then OFF (CONTROLS
  default is off). Faint paws every 1.2 m (exists) in `#FF8FB1` α 0.35, **alternating left/right offset 0.08 m** so
  they read as footprints, and fading in sequence from her outward at 12 m/s (a "trail being drawn" sweep). Paws she
  has walked over fade out over 0.3 s.
- Goal ring: cream with a pink edge, slow 0.6 Hz breathe.

### 5.3 Hover and press "boing"
Anything clickable reacts when the cursor hovers it, or when a touch is pressed on it (on touch, at `pointerdown`,
before the tap resolves):
- Enemy: `Squash.kick(-0.8)` + rim highlight (exists via `setHighlight`).
- Interactable: a ±4° wiggle over 0.25 s + its butter ring brightens α 0.30 → 0.55.
- NPC / kitten: `emote('nod')` or an ear flick, once per 2 s.
- Pickup: none (too small; the cursor sparkle-paw is enough).
Cost: CPU only, tens of µs.

### 5.4 Cursor art
CONTROLS §10.2 states are right. Art direction: **rounded, chunky, 3 px cocoa outline, no gauntlet metal**. Use a
soft ginger paw `#E89A55` with a pink bow cuff by default; over an enemy, a candy sword tilted 30° with a white
shine; over an interactable, a paw with a butter speech-dot. 32/48/64 px PNGs in `public/assets/ui/cursors/`.

---

## 6. Pickups: magnetism, sparkle, collection (fixes A7)

| Step | Spec | Owner |
|---|---|---|
| Idle | bob (exists) + yaw spin 1.2 rad/s + a `STAR4` twinkle `#FFF1C4` every 1.2 s ±0.3 (Marks, FADE.TWINKLE). Gold fish twinkle every 0.6 s, `#FFD57A` | world `Pickups.js`, fx |
| Magnet | keep `ECONOMY.fish.magnet` radius; change the pull path to a **hop**: on capture, y += 0.35 m arc while closing, speed `4 + (magnet − d) × 6` (exists) | world |
| Collect | squash 1.3 → 0 over 0.1 s at her chest, 4 `STAR4` + 1 `RING` | fx |
| Fly-to-HUD | a DOM icon (pool of 8, reuse `icons.js` fish/heart/milk) flies from the projected world position to the HUD counter along a quadratic Bézier (control point 120 px above the midpoint), 0.45 s, ease-in. On arrival the counter **bumps** (scale 1.25 → 1, 0.2 s, `--ease-pop`) and the number ticks. Transform and opacity only (ART §9.1 paint rules) | ui `hud.js` |
| Pitch ladder | each fish within 1.5 s of the last plays `pickup` at rate `1 + 0.06 × n` (cap n = 8), reset after 1.5 s. A line of 10 fish becomes a rising scale | audio `cues.js` |
| Hearts | small heart: pink `HEART` burst ×5 + the HUD heart that fills **wobbles** (exists) | fx, ui |
| Letters | envelope flips open in the toast icon, pink wax seal pops | ui |

Budget: Marks instances +1 per visible pickup (cap 40); DOM ≤ 8 flying icons.

---

## 7. HUD: calmer than League, cuter than League (fixes A9)

League's HUD is dense and dark. Ours should show **only what matters now**. This is skin and visibility only: X22
geometry stays exact, and `ui.screenOccluders()` reports only visible rects (AUTOCAM SafeFrame already reads measured
rects, so hiding is safe; add one SafeFrame fixture for the "tucked" state).

### 7.1 Auto-tuck out of combat (`hud.js`)
| Element | Shown when | Tucked state |
|---|---|---|
| Portrait + hearts | always | — |
| Grit shields | in combat (an alerted enemy within 15 m), or Stand held | fade to α 0 over 0.3 s, 4 s after combat ends |
| Valor sword | in combat, or Valor ≥ 50 | as above |
| Lives ×9 | on change, in menus, at ≤ 3 lives | tucked under the portrait |
| Fish / kittens / letter | on change (pop in, 3 s), in the hub, while Tab / ⋯ is held | slide up 12 px + fade |
| Ability bar / touch cluster | always in play (CONTROLS) | — |
`settings.hudMode`: `'calm'` (default) / `'full'` (current behaviour, for experts).

### 7.2 Restyle deltas (on top of ART §9.1 candy tokens)
- Ability bar (CONTROLS §10.1): **candy, not parchment**. Slots are cream `#FFF8EE` rounded squares (radius 14 px)
  with a 3 px cocoa `#5A3B2E` border and a 4 px drop "lip" `#5A3B2E33`. Cooldown sweep is **lilac `#C9A8FF` at 55 %**,
  not dark grey. On ready: a 0.18 s scale 1.12 pop + a white shine stripe sweeping across (CSS `@keyframes`, transform
  only) + `ui/glass_001` (exists).
- Key glyphs: rounded pill keycaps (`#FFFFFF` fill, cocoa text, Fredoka 600).
- Enemy HP pills (CONTROLS §10.4): cream track `#FFF6E8`, fill **coral `#FF7A6B`**, chip trail butter `#FFD86B`, a
  1.5 px cocoa border. **Never black/red.** Elites get a mustard crown pip.
- Hearts: keep pink; at ≤ 2 HP, ART's soft coral pulse instead of red.
- Valor sword: blade well `#2A211B@.55` (`hud.js` valorSvg) → **lilac `#5A4A7A@.35`**, outline `#2A1E18` → cocoa
  `#5A3B2E`. Full Valor: the rainbow-gold shimmer sweep is kept.
- Panels: drop `--noise` (feTurbulence, a perf cost too), drop the gold corner studs (`ui.css:28–32`), border
  `--goldDeep` → cocoa `#5A3B2E` 3 px, background flat `--cream #FFF8EE` with a 6 px inner butter `#FFE9A8` edge.
  A sticker-book, not a parchment.

### 7.3 Typography
Fredoka everywhere (ART §9.2). Additional rules:
- Numbers: `font-variant-numeric: tabular-nums` on counters and timers, so they don't jitter when they tick.
- Weights: titles 700, buttons 600, body 500. No all-caps except one-word stamps ("PAW-SOME!").
- Minimum 16 px (exists), 18 px on touch for prompts.
- Speech bubbles: cream `#FFFDF6`, cocoa 2.5 px border, radius 18 px, tail 12 px, pop in with
  `scale(.6) → 1.06 → 1` over 0.22 s.

---

## 8. Celebration moments (fixes A10; the "level up" League has and we lack)

SWORDCAT has no XP levels. Its level-ups are **unlocks** (Holy Slash, Golden Hour, companions joining), **Heart
Bells** (+1 heart), **shards** and **kitten rescues**. Each deserves a beat.

### 8.1 The Celebration Card (`ui/celebrate.js`, new; `story` triggers it)
One reusable DOM card, at most one at a time (queued), **gameplay keeps running** unless the beat is in a safe zone
(no alerted enemy within 15 m). In combat the card shrinks to a toast-plus (§8.3).

Sequence (total 2.2 s, skippable with any input after 0.6 s):
1. t 0: CSS `#ui-flash` white-gold α 0.22 / 0.18 s (ART §9.1). Hero: `Squash.kick(+2.0)` + pose `'cheer'` (new,
   see §9.2; sword raised, ears +15°) for 1.2 s.
2. t 0.05: world burst (ART §8.6 recipe: 60 confetti `SHAPE.CONFETTI`, 10 `STAR5`, 8 `HEART`, pink shockwave
   0 → 2.2 m).
3. t 0.15: the card pops at the top-centre third (`scale .4 → 1.08 → 1`, 0.28 s, `--ease-pop`): a big icon (64 px)
   on a sunburst (a CSS `repeating-conic-gradient` of butter `#FFE9A8` / cream `#FFF8EE`, rotating 20°/s), a
   title in Fredoka 700, 34 px, and a one-line *how* in 20 px.
4. t 1.6: the card **flies into its HUD home** (ability slot, heart row or companion portrait) with the
   fly-to-HUD Bézier (§6), and the home slot pops.

Strings (`story/strings.js`; replaces the toasts for these events):
| Event | Title | Line |
|---|---|---|
| `toast.holy` | **Holy Slash!** | "Hold ⚔ till you glow, then let go. Sunshine in a sword." |
| `toast.golden` | **Golden Hour!** | "Full Valor + Stand + ⚔. Everything sparkles. Including you." |
| `toast.mochi` | **Mochi joined!** | "Shield Wall: tap her portrait and she'll hold the line." |
| `toast.sage` | **Sage joined!** | "Swap buddies at any Vigil Stone." |
| `toast.clover` | **Clover joined!** | "Three's a party." |
| `toast.heartbell` | **Heart Bell!** | "One more heart. Ding!" |
| `toast.kitten` | **Kitten found! {n}/{max}** | rotating: "Safe and snuggly." / "One more for the nap pile." / "Tiny paws, big thanks." |
| shard | **Dawnstone shard!** | "It's warm. Like a sunny windowsill." |

### 8.2 Kitten rescue beat (ART §8.6 + AUTOCAM Cosy twin)
Add the **reunion**: the kitten runs to her (1.5 m), the two do a nose-boop (both heads tilt 12° toward each other,
0.4 s), a `HEART` rises from between them, then the kitten does a hop and poofs home with a sparkle trail that arcs
off-screen toward the hub direction (Particles `STAR4` ×10 along a 1.2 s Bézier). The counter fly-to-HUD lands on
the kittens n/3 pill.

### 8.3 In-combat variant (toast-plus)
The same card at 60 % scale, docked under the objective line, no flash and no pose. It flies into its slot after 1.2 s.

### 8.4 Results screen (`ui/results.js`)
- Backdrop: replace the dim grass with a **warm scrim** `radial-gradient(circle at 50% 40%, #FFF1E2CC, #FFB98ACC)`
  over the frozen frame (no blur, no post), plus the ART results confetti curtain (120 pieces, DOM ≤ 24 per ART rule,
  so use the Particles pool in screen space or 24 DOM pieces recycled).
- Title "Chapter clear!" in Fredoka 700 with the butter-gold gradient and a cocoa stroke (ART §9.2 logo style); the
  chapter name in Fredoka 500 on a lilac ribbon.
- Rows animate in one by one (80 ms stagger), each value **counts up** (0.4 s, tabular-nums) with a tick sound and a
  row bump.
- Rank stamp **slams**: scale 2.2 → 0.92 → 1, rotate −14° → −8°, 0.3 s, plus a ring of 8 `STAR4` (DOM) and a 4 px
  screen-shake of the card only (CSS). Rank words: "PAW-SOME!", "PURR-FECT!", "CLAW-SOME!", "Good kitty!" (no grim
  letter grades).
- Hero vignette beside the card: her portrait does the `cheer` pose SVG (portraits.js `happy` expression).

---

## 9. Idle animations and emotes (fixes A8)

### 9.1 Hero idle ladder (`player/Player.js` idle clock; must finish before Meme Cam at 15 s, `config.js:40`)
| Idle s | Action | Implementation |
|---|---|---|
| 4 | glance at the camera (ART §6.6) | head 25°, blink |
| 7 | **look around**: head yaw −35° → +35° over 1.2 s, ears swivel | procedural head bone |
| 10 | **paw lick**: `emote('groom')` (new): right paw to mouth, 3 licks, 1.4 s | `Poses.js` pose + head nod loop |
| 12.5 | **sword twirl**: a one-paw spin of the sword 360° in 0.6 s with a `SwordTrail` sparkle, a little "hup" | `Sword.js` grip rotation, `SwordTrail` |
| 15 | Meme Cam (exists) | — |
After Meme Cam, the ladder loops from 7 s with `sneeze` (exists) at a 10 % chance.
In the hub (no enemies in the level), there is a 20 s variant: **sit** pose (exists in `POSE_NAMES`) with a tail swish
(no Meme Cam).

### 9.2 New poses / emotes (characters `Poses.js`, `KittenBuilder.emote`)
`cheer` (sword up, other paw fist, ears +15°, 1.2 s), `groom` (1.4 s), `twirl` (0.6 s), `boop` (nose tilt 12°, 0.4 s),
`pawBump` (0.5 s). All are procedural on the existing rig (no new clips, no new draws).

### 9.3 Companions
- **After-fight paw-bump:** on encounter clear (`fx/Encounters.js` end / combat clear event), each companion within
  8 m runs to her, `pawBump` with 3 `STAR4` + a `HEART`, then resumes following. 0.8 s, skipped if a new enemy is
  alerted.
- **Cheer on her big moments:** parry → the nearest companion `emote('meow')` + a "!" heart mark; her kill streak
  ≥ 3 within 4 s → one companion does `cheer`.
- **Idle:** companions copy the ladder offset by 1.5 s, so they never fidget in unison; Mochi yawns, Sage reads a
  tiny book (existing prop if any, else `nod`), Clover chases her own tail (yaw 720° over 1.4 s).

### 9.4 Tap the hero (touch) / click the hero (desktop)
Outside combat, a tap on her capsule (Picker already returns actors) plays `meow` + `bowBounce` + one `HEART`;
3 taps within 1.5 s plays `twirl`. This is free delight and it also teaches that taps on things do things. In combat
a tap on her is ignored (CONTROLS move rules win).

---

## 10. Onboarding: show, don't tell (fixes A11)

### 10.1 Ghost paw demos (`ui/prompts.js` + fx)
For each tutorial step, a translucent **ghost paw/finger** (DOM, 56 px, cream `#FFF8EE` α 0.85 with a cocoa outline)
*performs* the input on screen and loops every 1.6 s until the player does it:
| Step | Touch demo | Desktop demo |
|---|---|---|
| move | the paw taps a sparkle spot 4 m ahead (the spot pulses on the ground: butter ring + `STAR4`) | a right-click icon with ripple at the same spot |
| jump | the paw taps the Jump button (button pulses) | the key cap `F` bobs |
| combo | the paw taps ⚔ three times with "Snip! Snap! Swoosh!" words appearing in rhythm | LMB ×3 |
| target | the paw taps the straw dummy; the dummy wiggles (§5.3) | — |
| roll | a swipe trail across open ground | `Shift` |
| stand / parry | the 🛡 button fills with a shrinking ring that matches the world parry ring | `Space` |
| meow | the cat-face button wobbles | `C` |
Hide after the step completes **or** after it has played 3 loops (no nagging). `settings.tutorialHints` (default on).

### 10.2 Prompt pill
The tutorial prompt becomes a candy pill with **progress dots** (●●●○○○○○○ for 9 steps; `tutorial.js` already sends
`step` and `total`), a 40 px icon of the input on the left, one sentence of at most 9 words. Completion: the dot fills
with a pop, `STAR4` ×4, a soft chime, and her `cheer` at 50 % strength (0.6 s).

### 10.3 Copy: warm, short, voiced (replaces `strings.js:101–130`)
Voice: Pearl (her mentor) talking to her, playful, never an instruction manual. Keep the device variants.
| Key | Now | Proposed |
|---|---|---|
| `tut.move.touch` | "Drag the left side to move, or tap where to go." | "Tap anywhere to trot there. Or drag on the left." |
| `tut.move` | "Right-click where to go, or use [WASD]. Hold right-click to keep walking." | "Right-click to trot there. [WASD] works too!" |
| `tut.jump` | "Jump the fence [Jump]." | "Hop the fence! [Jump]" |
| `tut.combo.touch` | "Snip, Snap, Swoosh! Tap ⚔ three times." | "Tap ⚔ three times: Snip! Snap! Swoosh!" |
| `tut.target.touch` | "Tap a foe to charge in and attack it." | "Tap the straw knight. She'll go bonk it." |
| `tut.roll.touch` | "Tap Tumble, or swipe the open ground. You can't be hurt mid-tumble." | "Swipe to tumble. Nothing can touch a rolling cat." |
| `tut.stand.touch` | "Hold 🛡. Block the Wobble Knight twice." | "Hold 🛡 and let Wobble bonk your shield. Twice!" |
| `tut.parry` | "Raise the Stand *just* as it swings. A white glint and a white wedge on the ground mean "parry me"." | "See the **shield** on the ground? Raise 🛡 right as it swings: *ting!*" |
| `tut.parry.touch` | "…When the ring meets you, raise 🛡." | "When the ring hugs you, tap 🛡: *ting!*" |
| `tut.bright.touch` | "Hold ⚔ until it shines, then let go. Drag to aim." | "Hold ⚔ till it shines, then let go. Sparkly!" |
| `tut.meow.touch` | "Tap the cat face. Hidden kittens answer. So do cows." | "Tap the cat face to meow. Kittens meow back. So do cows." |
| new `tut.red` (first red telegraph seen) | — | "**Arrows** on the ground? That one can't be blocked. Roll away!" |
| new `tut.aoe` (first aoe) | — | "**Dots** in a circle? Step out of it!" |
The two new keys are contextual one-shots shown the first time each glyph appears (story listens for a `telegraph:first`
fx fact, or `fx` exposes `seenKinds`). They make the §3 glyph language self-teaching.

### 10.4 First 60 seconds framing
- The tutorial level is "**Morning Practice**" (ART §9.4). Add a sunrise: preset `meadow` with `exposure +0.05`, and
  lantern sparks become dandelion seeds (`Ambient` profile `motes` in `#FFF6DA`).
- The first enemy she meets is the **Wobble Knight** straw dummy with a painted smile (a decal), so the first "foe"
  reads as a toy.
- The first reward lands within 20 s: a fish line along the path to the fence, which teaches the pickup loop (§6)
  before any combat.

---

## 11. Performance accounting

| Item | Draws | Per-frame CPU | Notes |
|---|---|---|---|
| Telegraph glyphs, ink sandwich, sun spot, companion rings, interactable rings | 0 (GroundDecals instances, MAX 160: worst-case use ≈ 40 + 12 glyphs) | < 0.02 ms | shader branch on existing shape id |
| Pickup twinkles, combo-word sparkles, celebration bursts | 0 (Marks / Particles) | < 0.05 ms | Low tier: counts ×0.5 (ART §8.6) |
| Damage numbers v2 / words | 0 (DOM pool 20) | merge reduces writes | transform + opacity only |
| Fly-to-HUD icons | 0 (DOM pool 8) | ≤ 8 transform writes/frame while active | ART paint rules |
| Celebration card | 0 | CSS animation | one card; `will-change` only while animating |
| Play scale 1.12 | 0 | 0 | root scale |
| Idle / emote ladder | 0 | procedural bones, existing mixer tiers (PERF §4.3) | |
| Hover boing | 0 | Squash spring per hovered actor (≤ 1) | |
Style writes stay within PERF §10.5's 15/s outside bursts (HUD auto-tuck is class toggles, not per-frame writes).

---

## 12. Acceptance (adds to ART §11 / IMPLEMENTATION_PLAN §8)
1. **Squint test** (screenshot review, phone 844×390 framing, Low tier): a reviewer at 50 % zoom can point to the hero,
   each enemy and every active telegraph **and name its kind by glyph** in ≤ 2 s.
2. **Colour-blind sim** (deuteranopia + protanopia matrices on the saved smoke frame, done in node): every telegraph
   kind stays distinguishable **by glyph** (the review checks glyph presence at the wedge tip).
3. **Hero chroma** ≥ 1.5 × ground inside a 3 m disc on `meadow`, path and grass (ART §2.3 target becomes the gate).
4. Unit tests: `formatDamage` merge window, combo-word mapping, `TELEGRAPH.glyph` coverage (every `ATTACKS[*].telegraph`
   kind has a glyph), colour-language lint (§2.1 rules), HUD tuck state machine, idle ladder timings < `memeCam.idle`.
5. Draw-call gate unchanged (IMPLEMENTATION_PLAN §5): this file adds **0**.

## 13. Open questions for the lead
- `playScale 1.12`: AUTOCAM's `herFrame` clamp uses her bbox. Confirm it reads the *visual* bbox (then framing grows
  ~12 %) or the capsule (unchanged). Recommended: the capsule.
- The ability-bar restyle contradicts CONTROLS §10.1's "parchment and gold" wording; ART §9.1 should be named the
  winner in IMPLEMENTATION_PLAN §2 (a new X-row).
- Celebration-card pauses: confirm "never pause gameplay" (recommended), or allow a 0.4 s soft slow-mo in safe zones.
