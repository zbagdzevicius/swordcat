# WA-ONBOARDING: the first 10 minutes (warm adventure pass)

Lens: onboarding. Scope: title, menus, prologue, tutorial, the first friend. **Design only.** Nothing here touches
`src/` yet. Every change below names its owner area (GAME_DESIGN §19.2) so it can be ported.
It builds on ART_WARM_SPEC (palette, Fredoka, candy UI, "Morning Practice" §9.4), PERF_SPEC (T_title ≤ 2 s, press to
first frame ≤ 1.5 s, no composer in gameplay), AUTOCAM_SPEC (no-hands camera) and CONTROLS_SPEC §14 (glyph tokens).

---

## 0. Verdict on today's first 10 minutes

Timeline today, on a new save (read from `StoryManager.newGame`, `cs00`, `cs01`, `tutorial.js`, `meadow.js`, GAME_DESIGN §5.4):

| t (approx.) | What happens | Problem |
|---|---|---|
| 0:00 | Title loop (`cs00`), "Press any key / Tap to start" | Fine, but `.title-shade` darkens it and the next three screens are menus. |
| 0:05 | Main menu → New Game → difficulty picker (3 choices with descriptions) | 3 decisions before any play. A child or a phone user must pick a difficulty without knowing the game. |
| 0:15 | Fade to **black** 0.75 s, `levels.load('meadow','practice')` again | Reloads the level that the title already shows. Black is the first colour of the adventure. |
| 0:17 | CS-01 Knighting Eve, **~65 s**, ends at **night** in a barn | First control at about **1:20**. First feeling: rejection. |
| 1:20 | Midnight Practice, **9 steps**, `meadow_night` | Dark blue world, parchment card with "3/9" counter, 1–3 sentence instructions ("A white glint and a white wedge on the ground mean 'parry me'"). |
| ~5:30 | Tallbert gag, then CS-02 Laughing Fog (**~85 s, never cut**), grey fog, the kittens marched away in cages | The emotional low point is at minute 6, and it is the darkest and greyest scene in the game (see `docs/screens/04-cs02-laugh.png`). |
| ~7:00 | Chapter 1 card; walk ~195 m of lane; Standing Stones arena, Picnic Glade (CS-03, Pudding), Crow Fields | |
| ~13–15:00 | Old Bridge (`MOCHI_CAGE [30, 74]`), D-01 Mochi joins | **The first friend arrives after minute 13.** For the first quarter hour she is alone, at night or in grey fog. |

Screens `11-crowfields.png`, `13-d01-mochi.png`, `02-g01-meme.png` confirm the read: grey-white fog walls, a dark
granite statue, parchment UI, no warm light source. The heroine is adorable; the world around her is a rainy Tuesday.

**What the first 10 minutes must feel like instead:** a sunny morning with your little sister, bonking things and
getting stickers; a short silly-but-real "uh oh" (the giggling hyenas take everyone); you suit up in a hero's armour
like a superhero montage; within a minute you free your first buddy. Adventure, not ordeal.

---

## 1. Principles (binding for every beat below)

1. **< 5 s to control.** Tap at the title and you are walking. No menu, no difficulty, no fade to black on a new save.
2. **Play first, story second.** No cutscene longer than 25 s before minute 4. Story beats are in-engine, no letterbox,
   and interleave with play.
3. **A friend is always near.** Pearl (little sister) guides the prologue; Mochi guides from the first minute of
   Chapter 1. Hints come from *them*, as a speech bubble with a face, not from a parchment box.
4. **One verb at a time, ≤ 7 words.** Hint = verb + glyph + object. The why comes after success, as praise
   ("Nothing can touch you mid-roll!").
5. **Teach by doing, then celebrate.** Every completed lesson pops a sticker, a sound and a sparkle. Failure is silent;
   only success gets noise.
6. **Hints fade, they don't stack.** One bubble on screen. It shrinks to a chip after 6 s, and a ghost paw demo
   appears only if there is no progress for 8 s.
7. **Daylight until the raid, lavender during it, gold after it.** Never night, never grey in the first 10 minutes
   (ART_WARM_SPEC §2.1 mood rule; haze saturation ≥ 0.12).
8. **Stakes stay, gloom goes.** The kittens are still taken (the story needs it), but the villains are silly, Pearl is
   brave and funny in her cage, and Clem's answer is a smile and a plan, not trembling paws.

---

## 2. New flow at a glance ("Knighting Morning")

```
TITLE (live, sunny practice field)  ── tap ──►  PLAY (Pearl's practice, 6 lessons, ~2:40)
     │ save exists: [Keep going!] [New adventure]           │
     ▼                                                       ▼
 continue                                   HEIGHT CHART (20 s, in-engine, warm sad-funny)
                                                             ▼
                                            GIGGLE FOG RAID (CS-02 cut to ~50 s, lavender)
                                                             ▼
                                            SUIT UP (playable chest + 18 s montage, golden barn light)
                                                             ▼
                                            CHAPTER 1 card → Mochi's cage 45 m ahead → FIRST FRIEND (~6:30)
```

Target clock (new save, average player): control **0:04**, first win **0:35**, bow reward **0:50**, practice done
**~3:00**, raid over **~4:20**, armour on **~4:50**, **Mochi rescued ~6:30**, first real arena (Standing Stones) with a
friend at **~8:00**.

---

## 3. Title screen (ui `menus.js`, `ui.css`; story `cs00.js`)

### 3.1 Look
- Env: `meadow_day` (ART_WARM_SPEC §3 tokens: fog `#F6E4C0`, sky `#8FCBF2`), `fogDensity 0.035` (was 0.05),
  `wind 1.0`. Butterflies on (ART §8.7, +0 draws: already budgeted for the meadow).
- Composition: Clem in the Oath pose at spawn `title` (unchanged), **plus Pearl** spawned 1.4 m to her left, looping
  `jump` every 2.6 s with a 0.3 s offset from the holy pulse (one extra skinned actor; she is needed in play anyway, so
  her programs are warm). Pearl's look-at follows the pointer/last tap (yaw clamp ±0.6 rad), so the title reacts.
- Delete `.title-shade` (dark gradient). Replace with
  `background: radial-gradient(120% 90% at 50% 40%, #FFF8EE00 55%, #FFD9B866 100%)` (warm peach rim, static).
- Logo (ART §9.2, Fredoka 700, butter → gold, 5 px cocoa stroke): add a one-shot `popIn` (scale 0.6 → 1.08 → 1,
  420 ms, `cubic-bezier(.34,1.56,.64,1)`) at 1.0 s (was a fade at 1.5 s), then a 3.2 s idle bob (translateY ±4 px,
  transform only).
- Holy pulse: keep `TITLE_PULSE` but recolour sparkles to `TONE.sparkle` `#FFF1C4`/`#FFD57A`, and add 6 pink hearts
  (`#FF8FB1`) from Pearl on each of her jumps (FX pool, no new draw).

### 3.2 Buttons and copy
- No save: **one** candy button, 240 × 72 px, `.btn--candy` pink, centred at 74 % height, appears at 1.4 s with
  `popIn`; paw icon left. Text: **"Tap to play!"** (touch) / **"Press any key to play!"** (KBM/pad). The whole screen
  stays a hit target as today.
- Save exists: two buttons side by side: **"Keep going!"** (pink, primary, shows `continueSub`, e.g.
  "Purrdale Meadows · 2 kittens found") and **"New adventure"** (sky, secondary). Settings = 48 px gear top-right;
  Credits move into Settings. The old main menu panel is not shown.
- Footer (`.title-foot`), 13 px cocoa 60 %: "Made with lots of purrs" (replace any version/legal text there; keep
  the version in Settings).

| key | now | new |
|---|---|---|
| `title.press` | Press any key | Press any key to play! |
| `title.tap` | Tap to start | Tap to play! |
| `title.prompt` | Press any key / Tap to start | (unused; ui picks press/tap per device) |
| `menu.continue` | Continue | Keep going! |
| `menu.newGame` | New Game | New adventure |
| `ch.prologue` | One Ear-Tuft Short | Knighting Morning |

### 3.3 Difficulty without a picker
- New save starts at `knight` (unchanged default in `newGame`).
- **Offer, don't ask.** After the 2nd knockout in any 3-minute window *or* the 3rd failed parry in practice, Mochi's
  (or Pearl's) bubble: **"Want gentler bonks? You can switch anytime."** with two chips **[Yes please]** **[I got
  this]**. Yes → `state.difficulty = 'kitten'`, toast "Kitten mode: gentle hits, wider parries." Shown once per save
  (`seen.offer.kitten`). Nine Lives stays in Settings → Difficulty.
- "Skip the prologue?" is asked only when New adventure is chosen **and** a save with `prologue.done` exists.

### 3.4 Tap → play transition (story `StoryManager.newGame`, camera)
- New save: **no fade, no level reload.** The title already stands on the practice field. `newGame()` resets state,
  sets `prologue.start`, ends `cs00`, and asks the camera for `blendTo('follow', 1.1 s, inOutSine)` from `MEME_LOOP`
  to the iso follow rig (AUTOCAM has the blend; one move, no cut). Clem steps out of the Oath pose with a `hop` clip
  and is controllable from **0.35 s** after the tap (input unlock does not wait for the blend to finish).
- Clem spawns as she is on the title (title spawn `[0, -62]` area by the north gate); the practice field starts 18 m
  south. If `levels.load` is unavoidable (e.g. continue on another level), the fade colour is cream `#FFF1DE`, never
  `#000`.
- PERF: press → first gameplay frame is now ~0 ms of loading (same scene), well inside the ≤ 1.5 s budget.

---

## 4. Practice with Pearl: beat sheet (story `tutorial.js`, `strings.js`; ui `prompts.js`)

Env: `meadow_day` all through (art: "Morning Practice"). Outfit: `tunic_bow` is the *reward*, so practice starts in
`tunic` with the sword (characters: confirm `setOutfit('tunic')` keeps the sword mesh visible; if not, add
`'tunic_sword'` = tunic + sword, no bow). Music: `village_bards_tale` from the first tap (audio unlocks on that tap).

### 4.1 New step list (replaces `TUTORIAL_STEPS`)

```js
export const TUTORIAL_STEPS = Object.freeze([
  { id: 'move',   textKey: 'tut.move',   guide: 'pearl', intro: 'pearl.race' },
  { id: 'bonk',   textKey: 'tut.bonk',   guide: 'pearl', intro: 'pearl.bonk',  reward: 'bonk' },
  { id: 'jump',   textKey: 'tut.jump',   guide: 'pearl', intro: 'pearl.fence', reward: 'hop' },
  { id: 'roll',   textKey: 'tut.roll',   guide: 'pearl', intro: 'pearl.sack',  reward: 'roll',  praise: 'pearl.roll.ok' },
  { id: 'stand',  textKey: 'tut.stand',  guide: 'pearl', intro: 'pearl.wobble', need: 1, reward: 'stand' },
  { id: 'parry',  textKey: 'tut.parry',  guide: 'pearl', reward: 'parry', praise: 'pearl.parry.ok' },
  { id: 'meow',   textKey: 'tut.meow',   guide: 'pearl', intro: 'pearl.hide',  reward: 'found' },
]);
```
7 steps (was 9): `combo` and `target` merge into **bonk**; **Bright Slash leaves practice** and is taught on Mochi's
cage lock (§6.2), where it means something. The `info` timeout path stays for `bonk` on devices without a pointer
(pad: "[Attack] to bonk!" completes on the hits, so no timeout is needed any more).

`PRACTICE` changes: `moveDist: 3 → 0` (move completes on reaching the dummy ring instead, see 4.2),
`nextDelay: 1.0 → 0.6`, add `bonkR: 2.2` (dummy reach ring), `stand need 2 → 1`, `idleDemo: 8`, `chipAfter: 6`.

### 4.2 Beats with exact triggers

| # | t | Trigger (in) | What the player sees | Completes when | Reward |
|---|---|---|---|---|---|
| P0 | 0:04 | `newGame` blend ends (or 1.1 s) | Pearl bounces in front of Clem. Bubble (Pearl): **"Knighting Day is TOMORROW! Practice with me!"** (2.4 s, no pause, no letterbox). | timer | — |
| P1 move | 0:07 | P0 done | A pulsing **sun-ring** (ground decal, `#FFD57A`, r 0.9 m) at the straw dummy (≈ 9 m south). 3 **sun sparkles** (pickup FX, +1 fish each) on the line between. Pearl runs ahead at 3.0 m/s: **"Race you to the dummy!"** Hint: `tut.move`. | Clem within `bonkR` of the dummy, or 10 m travelled | pling per sparkle (pitch +2 semitones each) |
| P2 bonk | 0:20 | P1 | Dummy gets a pink **target ring** (the regular selection ring, it is a dummy so it is not a lock target in combat). Hint: `tut.bonk`. Clicking/tapping it auto-attacks (existing attack order). | `slash3` on a dummy, or 6 dummy hits | Dummy bursts into straw confetti (`poof`, 24 bits, `#F2D27A`) + comic **"BONK!"** text sprite (§7.3) + sticker **First Bonk!** |
| P2b bow | 0:35 | P2 reward done | In-engine 7 s mini scene `tutbow` (no letterbox, HUD stays, skippable by tap): Pearl hops up, ties the bow (white flash `#FFF6E2` 0.4, outfit `tunic_bow`, 14 pink sparkles). Pearl: **"There! Now you look like a REAL hero."** Clem: **"I already was one."** Pearl: **"Obviously."** | scene end | sticker **Pink Bow!** (big variant, see §7.2) |
| P3 jump | 0:50 | P2b | The fence; a dotted hop arc decal over it. Pearl jumps it first and waits on the far side waving. Hint: `tut.jump`. | north of `fenceZ` (existing `north` fact) | sticker **Fence Hopper** |
| P4 roll | 1:05 | P3 | The swinging sack at (8, −84) (recolour sack `#E8A46B` with a cartoon face decal, "Sir Sacky"). Pearl: **"Don't get bonked by Sir Sacky!"** Hint: `tut.roll`. | dodge within `rollR` of the sack (existing) | Praise bubble `pearl.roll.ok`, sticker **Tumble Pro** |
| P5 stand | 1:25 | P4 | The Wobble Knight (rename "Sir Wobble", plates with a painted smile) wakes with a spring *boing*. Pearl: **"Sir Wobble wants a fight! Block him!"** Hint: `tut.stand`. | 1 block (was 2) | sticker **Stand Strong** |
| P6 parry | 1:45 | P5 | Same foe. Before each swing: the existing white glint + wedge, plus a **2 s slow-mo on the first swing only** (time scale 0.45 from glint to impact; story already owns slow-mo for Meme Cam) with the hint up. Hint: `tut.parry`. | 1 parry | Big **PARRY!** text pop, Sir Wobble spins and falls over (existing `knock`), Pearl `pearl.parry.ok`, sticker **Perfect Parry!** |
| P7 meow | 2:15 | P6 | Pearl: **"Hide and seek! Count to three!"** Clem's screen does a 1.2 s cream wipe (no black), Pearl is gone. The sleeping cow at (12, −72) has a tiny pink tail peeking out (Pearl's). Hint: `tut.meow`. If the player wanders > 14 m from the cow for 10 s, Pearl giggles from the cow (positional `cat/meow_baby_01`). | `cow` fact (cow woke) | `tutpearl` (rewritten §5.1), sticker **Found You!** |
| P8 end | 2:45 | `tutpearl` ends | The Sunbell rings far away (warm *dong*, `TONE.holy` glow on the bell skyline). Pearl: **"The bell! It's measuring time! Come ON!"** She runs north. Toast `tut.done`. A gold path of sparkles leads 20 m to the height chart. | Clem at the chart trigger `chart` (r 2.5 m) | → §5.2 Height Chart |

Removed: the "Hold Pause to skip practice" first-run toast (keep the hold-to-skip, show its hint only after 20 s on a
step). `tut.title` "Midnight Practice" → "Practice with Pearl". The `{n}/{total}` text counter is replaced by
**7 paw dots** under the bubble (filled `#FF8FB1`, empty `#5A3B2E33`).

### 4.3 Hint strings (rewrites; `[Token]` glyphs as CONTROLS_SPEC §14)

| key | base (KBM) | `.pad` | `.touch` |
|---|---|---|---|
| `tut.move` | Right-click the ground to walk. | Walk with [LS]. | Tap the ground to walk. |
| `tut.bonk` (new; replaces combo + target) | Right-click the dummy. Bonk! | [Attack] to bonk! | Tap the dummy. Bonk! |
| `tut.jump` | Hop the fence! [Jump] | same | Hop the fence! Tap [Jump]. |
| `tut.roll` | Roll past Sir Sacky! [Tumble] | same | Swipe to roll past Sir Sacky! |
| `tut.stand` | Hold [Stand] to block! | same | Hold 🛡 to block! |
| `tut.parry` | Tap [Stand] when he sparkles! | same | Tap 🛡 when he sparkles! |
| `tut.meow` | Find Pearl! Meow [Meow]. | same | Find Pearl! Tap the cat face. |
| `tut.skip` | Hold [Esc] to skip practice | — | Hold ❚❚ to skip practice |
| `tut.done` | Practice: paw-some! | — | — |
| `tut.skipped` | Practice skipped. To the bell! | — | — |
| `tut.title` | Practice with Pearl | — | — |

Guide lines (new keys, Pearl's bubble):

| key | text |
|---|---|
| `pearl.start` | Knighting Day is TOMORROW! Practice with me! |
| `pearl.race` | Race you to the dummy! |
| `pearl.bonk` | Bonk it! Bonk it good! |
| `tutbow.1` / `.2` / `.3` | There! Now you look like a REAL hero. / I already was one. / Obviously. |
| `pearl.fence` | Over here! Hop! |
| `pearl.sack` | Don't get bonked by Sir Sacky! |
| `pearl.roll.ok` | Whoa! Nothing can touch you mid-roll! |
| `pearl.wobble` | Sir Wobble wants a fight! Block him! |
| `pearl.parry.ok` | PARRY! He didn't see that coming! |
| `pearl.hide` | Hide and seek! Count to three! |
| `pearl.bell` | The bell! It's measuring time! Come ON! |
| `pearl.stuck` | (idle demo line, any step) Psst! Like this! |

Rules: bubble lines are 1 line at 360 px (≤ 42 chars); the hint chip text ≤ 7 words; the "why" detail that used to sit
in the hint (invulnerability, the white wedge, the silver reach arc) moves into praise lines or into the visuals
themselves.

### 4.4 Fade logic (tutorial.js + prompts.js)
- Show: bubble pops (`popIn` 280 ms) at full size: portrait 44 px + speech text + hint chip (glyph + ≤ 7 words).
- After `chipAfter` 6 s with the step not done: the speech part folds away (opacity → 0, 200 ms) and only the chip
  stays, moved to its docked spot (top-centre under the HUD strip, CONTROLS §9.1 18 % stays clear).
- Progress inside a step (a hit on the dummy, a block): the chip does a 120 ms `wiggle` and the paw dot half-fills.
- No progress for `idleDemo` 8 s: **ghost paw** demo (§7.1) at the world target for 2 cycles, plus `pearl.stuck`.
- Success: the chip turns mint `#9BE3C4` with a ✓ for 0.5 s, then the sticker; next step after `nextDelay` 0.6 s.
- Never two bubbles. A later toast (pickup, fish) waits in its own queue under the bubble (toasts.js already queues).

### 4.5 Contextual hints after the prologue (HINTS table)
Same mechanism, but every post-prologue hint is spoken by **Mochi** once he is in the party (portrait `mochi`), by
Pearl's voice-less note card before that. Rewrites:

| key | new text | guide |
|---|---|---|
| `tut.pounce` | Jump, then [Attack] in the air: Pounce! | Mochi: "Ooh, do the jumpy one!" |
| `tut.reflect` | Parry the bolt to send it back! | Mochi: "Bonk it back at them!" |
| `tut.milk` / `.touch` | Low hearts! Sip milk [Milk]. / Low hearts! Tap the milk. | Mochi: "Snack break! Quick!" |
| `tut.valor` | Hold [Stand] near foes to fill Valor. | Mochi: "Stand tall. Well, tall-ish." |
| `tut.companion` | [Ability]: Mochi's Shield Wall! | Mochi: "My turn! Press it!" |
| `tut.vigil` | Tap the Vigil Stone: rest and save. | Mochi: "Nap stone! Best stone." |
| `tut.zoom` | Pinch to zoom. / Scroll to zoom. | — (chip only) |
| `tut.click` | Tap anywhere: she walks there! | Mochi |
| `tut.talk` | Tap a friend to chat. | — |
| `tut.jeer` | Giggling hyena! Hold [Stand] to shrug it off. | Mochi: "Don't listen to him!" |

---

## 5. Story beats, warmer (story `cutscenes/*`, `strings.js`)

### 5.1 `tutpearl` (Found You!) — 6 s, unchanged choreography, new lines
- Cow moos, ambles off; Pearl is curled in its shadow, giggling (`clip: 'jump'`).
- `tut.pearl1`: **"Found me! Okay, okay, you're good."**
- `tut.pearl2`: **"...You're getting REALLY good, Clem."**
- Pearl does **not** scamper back to the barn any more: she stays as the guide for P8 (remove the `moveTo barn_door`
  and `despawn` steps; she becomes a follower NPC with the existing `moveTo` at 3.0 m/s, 1.8 m behind Clem).

### 5.2 Height Chart (CS-01 cut down, renamed "One Ear-Tuft Short", ~20 s, in-engine)
Trigger: player enters `chart` (r 2.5 m around the height chart at `SPOT [-6, -66.5]`). Env `meadow_day` (no
evening, no night). Letterbox **off**, HUD hidden only for the 20 s. Skippable by tap (as every scene).
Keep shots 3 and 4 of `cs01.js` (squires measured, Clem on tiptoes) and the sunbeam flop (shot 5) as the closer;
**delete the opening black + caption, the crane, the night barn (moves to §5.4)**.

| key | now | new |
|---|---|---|
| `cs01.caption` | Meow Island. The eve of Knighting Day. | (deleted) |
| `cs01.1`/`.2` | Tall enough! Next! | Tall enough! Next! (keep, it's funny) |
| `cs01.3` | Too small for the sword, Clementine. | Ooh. One ear-tuft short, Clementine. Next year! |
| `cs01.4` | I was too small last year. | I was one ear-tuft short LAST year. |
| `cs01.5` | And you've been very consistent about it. Next! | And very consistent about it! Next! |
| `cs01.6` (Pearl, beside her in the sun) | There. Now you look less scary. | Hey. You bonked that dummy SO hard. |
| `cs01.7` | I wasn't scary. | ...I really did. |
| `cs01.8` | I know. I'm being nice. | Tomorrow I'm sitting front row. For YOU. |
| `cs01.9`, `.10`, `.chest` | (night barn lines) | moved to §5.4 |

Clem's expression goes `sad` for one line only, then `happy` on `cs01.7`. Music stays `village_bards_tale`.

### 5.3 The Giggle Fog (CS-02 pass: ~85 s → ~50 s, lavender, same story)
CS-02 is "never cut" in GAME_DESIGN; this keeps every story fact (Dawnstone taken, horde, cages, Pearl, Cacklejaw's
laugh, Pilfer's two thefts, the meme shot, her choice to follow) and cuts only dwell time.

- **Env:** new preset `meadow_giggle` (world `Env.js`, ART tokens): fog / low `#CDBDF2` / `#BFAFEA` (HSV sat 0.20),
  sky `#B9A9E8`, hemi `#D9CCFF` / `#C9A0B0` ×1.2, sun `#FFD8E8` ×1.6, fogDensity 0.05 → **0.062** (was 0.075).
  Sad beats are lavender, never grey (ART §2.1). Horde silhouettes `#6A5A9A`, not black.
- **Shot list (timing):** 1 wind drops (0:00–0:03) · 2 Bell Tower glow goes out, silly *clunk* (0:03–0:07) ·
  3 giggles from the fog, her ears up, tail puff (0:07–0:11) · 4 the horde marches with **cages on wobbly little carts**,
  Pearl's cage has the pink ribbon and **a hand-drawn sign "HELP (please)"** (canvas texture, 128 × 64) (0:11–0:17) ·
  6+7 she plants herself, **MEME_LOOP 3.8 s** kept (0:17–0:21) · 9 Cacklejaw leans in, laugh, his lines (0:21–0:31) ·
  10 crane: the horde parts around her; Pilfer's two thefts (0:31–0:39) · 12 **new beat**: Pearl's cage is last in
  line; she reaches out of the bars, plucks letters from Pilfer's bag and drops them one by one behind the cart
  (0:39–0:44) · 13 Clem lifts the sword, a gold sparkle runs up it, **sunlight breaks through one hole in the fog onto
  her** (`env sun` ×2.4 for 2 s, holy 0.15), she grins (0:44–0:50).
  Dropped: shot 5 (trip on the cape: it reads as defeat), shot 8 (REVERSE_HORDE plates), shot 11 (trembling ECU).
- **Lines:**

| key | now | new |
|---|---|---|
| `cs02.1` (Pearl) | CLEM! | CLEM! Follow the letters! |
| `cs02.2`, `.3` (Cacklejaw) | A kitten! With a SWORD!… It isn't even a threat! | keep verbatim (the joke is the heart of the scene) |
| `cs02.4`, `.5` (Pilfer) | Mine. / Also mine. | keep |
| `cs02.6` (Clem) | ...Okay. | ...Okay. Hold on, Pearl. I'm coming. |

- Music: no `c80_monster` drums; use a pizzicato "sneaky" bed (`jingles_PIZZI` set, ART §9.3) during the march, then
  the `battle_theme_a` sting on the sunbreak.

### 5.4 Suit Up (CS-01 shots 6–7, moved after the raid, golden light, ~18 s + one tap)
- After the sunbreak she runs (camera follow, playable, 12 m) to Marmalade's barn door (already at `BARN`). The barn
  doors are open; one warm sunbeam falls on the chest. The chest is an **interactable** (`prompt.open`, the "!" button
  on touch). This is the player choosing to become the knight.
- Tap → 18 s montage, same shots as today, but lit by `TONE.lantern` `#FFC46B` sunbeam instead of night + lantern:
  caption on the lid `cs01.chest` "M. — my first" (keep); pauldrons *clank* (sticker-style "CLANK!" text pop),
  the helmet falls over her eyes, she takes it off: **"Nope."** (new `cs01.helm`), the cream cape, the mirror.
  Last line `cs01.10`: **"...Borrowing this."** (was "...Practice.").
- End: flags `prologue.armour`, `prologue.tutorial`, `prologue.done`; Chapter card **"Chapter 1 — Small Paws, Big
  Sword"** over the barn door opening onto the sunny lane (`meadow_day`); save. The level is already loaded: no fade to
  black, cream wipe 0.4 s.
- Reward: big sticker **Knight-ish!** (§7.2) with confetti.

### 5.5 Tallbert (G-01)
Keep, it is a good gag, but move it into Chapter 1 (the statue is beside the lane at (4, −55.5), right on her way
north from the barn). Arm it on `prologue.done` instead of `prologue.tutorial`. Recolour the statue stone
`#B9A79A` warm sandstone with moss `#8FBF6A` (it is the darkest object in `02-g01-meme.png`). Line `g01.1` stays
"...Hello."

---

## 6. First friend within 90 s of Chapter 1 (world `meadow.js`, companions, story `d01.js`)

### 6.1 Move Mochi's cage
- `MOCHI_CAGE [30, 74]` → **`[-14, -41]`**: on the lane, ~45 m from the barn door, just past the Tallbert statue,
  the first bend of `SPINE` (`[-6,-50] → [-22,-30]`). The cage cart "fell off the horde's wagon" (one broken wheel
  prop, cart tilted 8°). Pearl's letter trail starts at the cart.
- Guard: **3 rats** (lowest-tier foe, existing `rat` def) in a soft arena `cart` r 9 m, no wall lock (rats flee at
  1 HP: the first fight should be a romp). Mochi in the cage cheers each KO (`bark.mochi.cheer`: "Get 'em!",
  "Ha! Bonked!", "You're SO small and SO good!").
- The Old Bridge keeps its 3-wave fight; its cage now holds lost kitten **Biscuit** (moved from the cow at
  `[41.5, 30]`; the Crow Fields' second cow keeps a Meow secret: put Letter #1 there). `exit` condition
  `!mochiCaged(c)` stays valid (Mochi is freed long before).

### 6.2 The lock: Bright Slash taught where it matters
- The cage lock is **cracked** (the existing "cracked" material from `practice_boulder`). Normal hits *bonk* off it with
  a "tink" and Mochi: **"It's a tough one! Do the shiny swing!"**
- Hint (Mochi bubble): `tut.bright` base **"Hold [Attack] till it shines. Let go!"**, `.touch` **"Hold ⚔ till it
  shines. Let go!"**; the silver reach arc is the visual explanation (no text).
- Completes on the lock breaking (the existing "cage lock breaks" trigger for `d01`).

### 6.3 D-01 lines (warmer, friend-making)

| key | now | new |
|---|---|---|
| `d01.1` | Squire Mochi reporting! Well. Reject Mochi. Too clumsy, they said. | Squire Mochi, reporting! ...Almost-squire. Too clumsy, they said. |
| `d01.2` | Too small, they said. | Too small, they said. (keep) |
| `d01.3` | Then we're a team! | Then we're the Almost Knights! |
| `d01.4` | I'll do the shield. You do the... pointy part. | keep |
| `toast.mochi` | Mochi joined! [Ability] Shield Wall | Mochi joined the party! [Ability] Shield Wall |

End: **Friend card** celebration (§7.2, the biggest one in the first 10 min), Mochi follows, and from here he speaks the
contextual hints (§4.5). The Standing Stones arena (~35 m further) is then the first real fight, *with* a friend,
and teaches `tut.companion` ("My turn! Press it!") at its first wave.

---

## 7. UI components (ui `prompts.js`, `toasts.js`, `portraits.js`, `ui.css`; fx)

All DOM, all transform/opacity animation only (ART §9.1 paint rules, PERF ≤ 15 style writes/s). No new draw calls
except where noted.

### 7.1 Guide bubble (replaces the parchment `.ui-hint` card in the tutorial)
- Layout: portrait 44 px circle (from `portraits.js`, `pearl` / `mochi`; Pearl's portrait needs adding if missing),
  cream bubble `#FFF8EE`, 2 px cocoa `#5A3B2E` border, 16 px radius, tail toward the portrait; speech text Fredoka 500
  17 px (touch 18 px); hint chip below: pink pill `#FFE0EA`, glyph from `glyphify`, Fredoka 600 16 px.
- Position: top-centre, 8 px under the 18 % HUD strip (stays inside CONTROLS §9.1 free area, so it is not a
  SafeFrame occluder: `pointer-events: none`). Portrait on touch never overlaps the cluster.
- Paw dots: 7 × 10 px dots under the chip.
- Event: extend `story:prompt` payload with `speaker` ('pearl' | 'mochi' | null), `say` (strings key for the speech),
  `stepDots` (array of 0 / 0.5 / 1). `prompts.js` renders the bubble when `speaker` is set; old payloads still render
  the old card (back-compat for tests).

### 7.2 Stickers and celebrations (new `ui/stickers.js`, ~120 lines)
- `ui.sticker(id, { big })` on `E.REWARD` (new event, story emits `{ kind: 'sticker', id }`).
- Small sticker: 88 px die-cut SVG (white 4 px outline, icon + 1-2 words), pops at the right-centre, `popIn` 280 ms,
  2° wiggle, flies into the pause-menu sticker book icon after 1.4 s (transform only). glock `ui.confirm` up a third
  per sticker in a row (C5 → E5 → G5 …).
- Big sticker (Pink Bow, Knight-ish, friend card): 200 px centre, cream scrim radial (no backdrop-filter), DOM confetti
  ≤ 24 nodes removed after 1.6 s, `pickup/bubble` + `festival_minstrel_dance` 2 s sting. Gameplay keeps running
  (practice has no threats); in Chapter 1 the friend card **pauses** for 1.6 s (it follows a dialogue scene anyway).
- Sticker set (ids → label, icon colour): `bonk` First Bonk! `#F2D27A` · `bow` Pink Bow! `#FF8FB1` · `hop` Fence
  Hopper `#9BE3C4` · `roll` Tumble Pro `#8FCBF2` · `stand` Stand Strong `#C9B8F0` · `parry` Perfect Parry! `#FFD57A` ·
  `found` Found You! `#FFB878` · `knight` Knight-ish! `#FFE3A3` · `mochi` New Friend: Mochi `#3F6FB5`.
- Sticker book: a page in the pause menu (reuse `kittenCells` grid styles). Saved as flags `sticker.<id>`.

### 7.3 Comic text pops (fx, world-space)
"BONK!", "PARRY!", "CLANK!", "BOING!": one shared `Sprite` pool of 4 (canvas texture atlas 512 × 128, 4 words,
Fredoka 700, butter fill + cocoa stroke), scale 0 → 1.2 → 1 in 180 ms, rise 0.6 m, fade by 0.7 s. **+1 draw** while
visible (one sprite material; instanced via the same material, only one on screen at a time in practice). Only in the
first 10 minutes and on parries/crits afterwards (`config.FX.comicPops = 'first'|'always'|'off'`, default `'always'`
for parries, `'first'` for the rest).

### 7.4 Ghost paw demo
- A 64 px SVG paw (cream fill, cocoa outline) projected to the world target each frame (one `place()` call, transform
  only), doing tap (scale 1 → 0.85 → 1 with a ring ripple) or hold (ring fills 0.8 s) or swipe (translate 80 px)
  depending on the step's `demo: 'tap' | 'hold' | 'swipe'`. KBM shows the mouse-button glyph instead of the paw.
- Steps: move = tap the sun-ring; bonk = tap the dummy; jump = tap [Jump] button (touch) / key glyph bounce (KBM);
  roll = swipe; stand = hold on 🛡; parry = tap on 🛡 timed to the glint; meow = tap the cat-face button.
- Only after 8 s of no progress; max 2 cycles; then it waits 8 s again.

### 7.5 Touch first
- Practice hides cluster buttons not yet taught (Jump, Tumble, 🛡, Meow appear with a `popIn` the moment their
  lesson starts; ⚔ appears at bonk). On first appearance a button gets a 3-ring pulse for 1.6 s. Layout (CONTROLS §9.2)
  is untouched: hidden is `visibility: hidden`, geometry stays measured, SafeFrame unaffected.
- Bubbles on phone portrait: max width `min(92vw, 420px)`; `tut.rotate` "Plays best sideways." shown once on the title,
  not in play.

---

## 8. Reward pacing in the first 10 minutes

| t | reward | size |
|---|---|---|
| 0:10–0:20 | 3 sun sparkles (+3 fish) | tiny |
| 0:35 | First Bonk! | small |
| 0:50 | Pink Bow! (visible on the hero) | big |
| 1:05 / 1:25 / 1:45 / 2:15 | Fence Hopper / Tumble Pro / Stand Strong / Perfect Parry! | small |
| 2:45 | Found You! | small |
| 4:50 | Knight-ish! (armour + cape on the hero) | big |
| 5:30 | Tallbert gag | laugh |
| 6:30 | New Friend: Mochi (party member, ability unlocked) | biggest |
| 8:00 | Standing Stones clear, first lost kitten Noodle nearby (Meow) | small |

Never more than ~60 s without something positive happening on screen.

---

## 9. Implementation list (owner → file → change)

| owner | file | change |
|---|---|---|
| story | `src/story/strings.js` | all string rewrites in §3.2, §4.3, §4.5, §5, §6.3; new keys `pearl.*`, `tutbow.*`, `cs01.helm`, `bark.mochi.cheer.*`, `offer.kitten.*`, `sticker.*`; `ch.prologue` → "Knighting Morning". |
| story | `src/story/tutorial.js` | new `TUTORIAL_STEPS` (§4.1), `PRACTICE` constants, `bonk` fact (merge combo/target), `guide`/`intro`/`praise`/`reward` handling, chip/idle timers, kitten-mode offer counter, emit `E.REWARD`. Keep `PracticeLog` pure (tests update: 9 → 7 steps). |
| story | `src/story/StoryManager.js` | `newGame()`: no fade/reload when on the title scene; flag `prologue.start`; prologue order practice → `cs01` (chart) → `cs02` → barn interact → `cs01b` (suit up); `continueGame` maps old flags (save with `prologue.armour` but no `prologue.done` → resume at the barn). |
| story | `cutscenes/cs00.js` | env fog 0.035, Pearl actor, logo at 1.0 s, prompt at 1.4 s. |
| story | `cutscenes/cs01.js` → split `cs01.js` (chart, 20 s) + `cs01b.js` (suit up, 18 s) | §5.2, §5.4; day lighting; remove crane/caption/night. |
| story | `cutscenes/cs02.js` | §5.3 cut list, `meadow_giggle`, Pearl letter-drop beat, sunbreak. |
| story | `cutscenes/tutpearl.js`, new `tutbow.js` | §5.1 (Pearl stays), §4.2 P2b. |
| story | `cutscenes/d01.js`, `g01.js` | lines; Tallbert armed on `prologue.done`. |
| ui | `menus.js`, `ui.css` | title per §3 (one/two buttons, no main menu panel, gear), remove `.title-shade`. |
| ui | `prompts.js`, new `stickers.js`, `portraits.js` | guide bubble §7.1, stickers §7.2, ghost paw §7.4, Pearl portrait. |
| ui | `touch.js` | progressive button reveal §7.5 (visibility only). |
| world | `levels/meadow.js` | `MOCHI_CAGE` → `[-14, -41]` + broken-wheel cart + `cart` soft arena + 3 rats; Biscuit → Old Bridge cage; Letter #1 → second cow; chart trigger `chart`; barn chest interactable; Sir Sacky / Sir Wobble recolours; Tallbert stone recolour. |
| world | `Env.js` | `meadow_giggle` preset (§5.3). |
| fx | `FX.js` (+ atlas) | comic text pops §7.3, straw confetti preset. |
| characters | outfits | verify `tunic` keeps the sword (else add `tunic_sword`). |
| docs | `GAME_DESIGN.md` §4.3, §5.4 | prologue reorder, CS-02 cut list (design owner sign-off: "never cut" rule amended to "never skippable-by-cut, may be tightened"). |

---

## 10. Perf check (PERF_SPEC budgets)
- No post-processing anywhere in this plan; the sunbreak is an env/uniform change; slow-mo is a time scale.
- New draws: comic pop sprite +1 (transient), Pearl actor +her draws in the prologue only (she was already spawned in
  `cs01`/`tutpearl`; now she persists ~4 min; the prologue field has no enemies but Sir Wobble, so the frame is far
  under cap). Sticker/bubble/paw are DOM (≤ 24 confetti nodes, removed).
- Title: Pearl adds one skinned mesh to the title; PERF X17 ≤ 16 programs holds (she shares the kitten material
  programs with Clem). Butterflies were already in the meadow budget.
- `newGame` without reload removes a full level build from the new-player path (saves the 0.75 s fade + load).

## 11. Acceptance (judged without new tooling; test hooks already exist)
1. New save, touch 844 × 390: first player-driven movement ≤ **5 s** after the first title tap (story test clock).
2. First sticker (`bonk`) ≤ **60 s** for a scripted player using taps only.
3. `d01` starts ≤ **7:30** on the scripted run (was ~13+).
4. No frame in the first 10 minutes uses `meadow_night` or a fog colour with HSV saturation < 0.12.
5. Every tutorial hint string ≤ 7 words (unit test over `tut.*` keys listed in §4.3, glyph tokens count as one word).
6. Never more than one guide bubble in the DOM (ui test).
7. Screenshots (Read and judged): title, P2 BONK, P2b bow, CS-02 sunbreak, Suit Up mirror, Mochi friend card: warm,
   readable, no grey wall, no black.

## 12. Risks / open questions
- **Story order change** (practice before the rejection, armour after the raid) touches flags used by saves and tests
  (`prologue.armour` gates `Tutorial.eligible`). Mitigation in §9 StoryManager row: eligibility becomes
  `prologue.start && !prologue.tutorial`.
- **CS-02 "never cut"** is a design-doc rule; this pass keeps every story fact and the meme shot. Needs the design owner's
  OK.
- Moving Mochi changes `meadow` pacing for Chapter 1 tests (`companions` test expecting the Old Bridge trigger).
- If the tunic outfit cannot hold the sword cheaply, fallback: practice in armour without the cape and helmet
  ("the academy's practice plates"), and the chest gives Marmalade's **cream cape** + the "Knight-ish!" moment.
