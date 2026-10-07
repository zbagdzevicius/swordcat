# SWORDCAT — Game Design Document (gameplay-first)

Version 1.0, 2026-10-07. Angle: **gameplay first**. This covers tight, juicy 3D sword combat, enemies that each behave differently, boss phases, progression and pacing. Story, art and tech are built around those systems.

Inputs: `research/trend.md` (the meme), `research/art.md` (visual bible), `research/tech.md` (architecture), `public/assets/ASSETS.md` (downloaded CC0 assets).

**Labels**
- **[REF]** comes from the trend research or the reference images.
- Everything unlabelled is a **design proposal** (names, numbers, story).
- **[unverified]** marks a technical or factual claim not checked on this machine.

Units follow tech.md:
- 1 unit = 1 m = Swordcat's height (ears included).
- Times are in seconds; the simulation runs at a fixed 60 Hz.
- Player health is counted in **half-hearts**; enemy and boss health in **points**.
- Player damage is in points; enemy damage to the player is in half-hearts.

---

## 0. Design pillars

1. **Small but steadfast.** Her defensive identity *is* the meme. Holding Guard puts Swordcat in the viral pose: sword upright in front of her face, cape billowing. Blocking, parrying and "standing your ground" against jeering enemies are her core verbs, and each one pays out in Valor for the holy offence. **[REF: the core loop, "standing my ground" captions]**
2. **Every hit feels good and every threat is readable.** All enemy attacks use one shared telegraph language (§6.1). Every player hit gets hitstop, shake, a flash, particles and sound (§4.8).
3. **Never alone.** Rescued kittens join the Kitten Company. Two fight beside her, each with a one-button ability on cooldown, and the rest bring the hub town back to life.
4. **Cozy-epic contrast.** Fights and cutscenes are staged completely seriously: fog, low cameras, a sword taller than its wielder. The comedy comes from her size and her earnestness, never from winking at the camera. Defeats are non-lethal "poofs". **[REF: tone, art.md §15]**

---

## 1. Title & logline

**Title:** SWORDCAT. The working subtitle is *Swordcat: Nine Lives of the Dawnwatch*.

**Logline:** A fog has put every grown cat on Meow Isle to sleep, and a kitten far too small for her sword holds it anyway. She fights through the mist with a growing company of rescued kittens to win back the stolen Dawn Lantern and bring the golden hour home.

**Genre:** third-person 3D action-adventure, about 4.5–5 h for the full game and 60–75 min for the MVP slice. It runs in the browser on three.js (WebGL2), with keyboard and mouse, gamepad and touch.

**Tagline set, for the title screen and chapter cards** **[REF: community catchphrases, trend.md §4]:**
- "Too small for the sword. Holding it anyway."
- "The armor is borrowed. The hour is gold."
- "Born to :3, forced to ⚔" (adapted for the Act title cards)

The first two lines come from swordcat.lol copy. They are short phrases, but a legal check on reuse is still listed in §17.

---

## 2. World & setting

**Meow Isle** **[REF: creator bio "Protecting meow island with 9 lives"]** is a small, misty, medieval island kingdom of cats.

- It is kitten-scale: doors are about 1.6 m, cottages 3–5 m, and grass 0.1–0.25 m (art.md §1).
- It is ruled from **Pawsbury**, a hill town and castle on the south shore.
- Pawsbury's top tower holds the **Dawn Lantern**. Every morning its light burned the sea fog off the island.

**The Great Drowse.** Nine winters' worth of fog arrived in one night, when the Lantern was stolen.
- The fog makes grown cats irresistibly sleepy. Knights nap in the fields in full armour, shopkeepers doze at their stalls, and Queen Snowpaw sleeps on her throne.
- Kittens resist it, being too small and too fidgety to nap on command. That is why the invaders are **kit-napping** every kitten they find.
- Swordcat stays fully awake for a further reason: the old Dawnwatch sword she borrowed still holds a spark of dawnlight, "lit from within" **[REF: swordcat.lol symbol]**. That spark is her holy glow.

**The Order of the Dawnwatch** were the Queen's knights, who kept watch at standing stones called **Vigil Stones**. They are all asleep now. Vigil Stones are the game's checkpoints.

**The invaders, the Hound Legion of Lord Barkus Grimjaw**, sailed from the dark north cliffs.
- **Paid helpers:**
  - Rat Militia (paid in cheese)
  - Molegrim diggers
  - the Crow Queen's raiders (paid in shinies)
  - two hyena mercenaries, the Jeerers **[REF: "HATER" / "POST STEALER" hyena army]**
  - Grimjaw's own war-dogs and animated bone soldiers. Dogs love bones; his are the Boneheads.

**Geography, south to north:**

| Region | Level | Mood (art.md §12) |
|---|---|---|
| Pawsbury Town & Castle | Hub | Warm golden hour, thinner fog held back by braziers |
| The Low Gate & causeway | Opening, L5 | Grey tidal flats, the meme's foggy field |
| Purrdale Misty Meadows | L1 | The exact reference look: grey-green fog, standing stones, windmill |
| Whiskerwood Forest | L2 | Giant oaks, mushroom houses, god rays |
| Bogmire Marsh | L3 | Heavy ground mist, boardwalks, will-o'-wisps |
| Frostwhisker Peaks | L4 | Snow, ice, watchtowers |
| The sky over the fog | L6 | Sea of clouds, floating crags |
| Houndhold Keep | L7 | Storm, embers, red banners |

**Light over the story:** misty grey, then golden hour (the hub), then storm (the finale), then sunlight breaking through (the ending). Swordcat's glow is the only warm light in the cold biomes (art.md §12).

---

## 3. Story

### 3.1 Cast

| Character | Who | Role |
|---|---|---|
| **Clementine, "Swordcat"** | Ginger/cream long-haired kitten, pink bow on her left ear, borrowed silver plate and red cape **[REF ref2]** | Player. Everyone calls her Swordcat; her real name is used twice, at the knighting and by the Queen. *(Proposed name; the story doc may override it.)* |
| **Sir Marmalade** | Chonky old orange tabby with an eyepatch and rusty plate, retired Dawnwatch (art.md §7) | Owner of the borrowed armour. Asleep in the opening; groggily awake in the hub, where he is trainer and mentor. |
| **Queen Snowpaw** | White angora, odd eyes (art.md §7 "Princess Snowpaw", promoted to queen) | Asleep on her throne until the ending |
| **Mochi** | Tuxedo squire, tower shield | First companion (tank) |
| **Sage** | Silver tabby ranger | Companion (archer, anti-air) |
| **Clover** | Calico cleric | Companion (healer) |
| **Earl Grey** | Siamese scholar-mage, giant hat, glasses | Companion (crowd control) |
| **Pip** | Black rogue kitten, long red scarf | Companion (ambush, loot, secrets) |
| **Pearl** *(stretch)* | Pale cream sister, cream cape **[REF ref3, interpretation]** | Player 2 in local co-op (stretch) |
| **Ember** | Young red dragon, huge next to kittens **[REF V3–V6]** | Milk thief, then friend and mount |
| **Sir Bastion** | A giant enchanted suit of armour that wakes in dawnlight. Nobody knows who is inside. | Ally in L5 (the giant-knight pull-back gag **[REF V5]**) |
| **Lord Barkus Grimjaw** | Brindle bulldog warlord with underbite fangs, iron plate and a cleaver-greatsword (art.md §11) | Final boss |
| **Rat Captain Grizzlechop** | Rat on an armoured beetle | Boss L1 |
| **Mole King Burrowmaw** | Nearsighted velvet mole with drill gauntlets | Boss L2 |
| **Slime Sovereign** | Royal jelly with a knight's helm floating inside | Boss L3 (not allied with Grimjaw, just hungry) |
| **Crow Queen Corvessa** | Crow with an ice crown and a cloak of crows | Boss L4 |
| **Hater & Post Stealer** | Hyena mercenary duo with insults scrawled on their armour **[REF V2]** | Boss L5 |
| **Sir Brutus** | Pug champion | Kneels to her in L5 **[REF V6]**; mini-boss in L7 |
| **Sir Snarl** | Black-wyvern rider | Mini-boss L6 **[REF V4 dogfight]** |

### 3.2 Arc

Swordcat believes you have to be big to matter. Over three acts she learns two things: being steadfast is what counts, and she was never meant to stand alone.

Grimjaw is the mirror image. Nobody ever visited his gloomy cliff keep, so he stole the light to make everyone as unseen as he felt.

The ending is shared light. The Lantern is relit, a second dawn reaches Houndhold, and Grimjaw is invited to the festival wearing a pink bow.

### 3.3 Acts and per-level beats

**ACT I: "Too Small for the Sword"**

- **Opening, "The Stand"** (§3.4 C1). It starts at the Low Gate in fog with the knights napping, and the first rats appear.
- **L1 Purrdale Misty Meadows**
  - **Opener:** rats are hauling sacks of loot from the sleeping knights. One sack mews. *(Kit-napping is revealed.)*
  - **Mid:** she rescues **Mochi**, then takes the **Milk Break** (C2): a red dragon (Ember) roars out of the fog, drinks her milk and flees. Crows with a broken chain are chasing it.
  - **Close:** she defeats Rat Captain Grizzlechop, who blurts: "The Warlord pays in cheese! Kittens go north to Houndhold!"
- **Hub, first visit.** Sir Marmalade wakes groggily near her glowing sword:
  - Sir Marmalade: "Is that my armor?"
  - Swordcat: "...It's borrowed."
  - Sir Marmalade: "Bring it back without dents."

  He opens his Training Yard and names the quest: find the Lantern and the kittens.

**ACT II: "The Armor Is Borrowed"**

- **L2 Whiskerwood Forest**
  - **Opener:** the Molegrim tunnels run north.
  - **Mid:** she finds Sir Marmalade's old **Spring Sabatons** in a forest shrine, which unlock Cat Leap. She rescues **Clover** in the Mushroom Hamlet and **Sage**, who is caged on a log raft.
  - **Close:** Mole King Burrowmaw turns out to be nearsighted: "Oh! You're a *kitten*. I thought you were a very loud turnip." He reveals the tunnels are being dug *for* Grimjaw.
- **L3 Bogmire Marsh**
  - **Mid:** **Earl Grey** is found *inside* a Gloomjelly, calmly reading. "Fascinating specimen. Do let me out."
  - **Close:** the Slime Sovereign coughs up the **Helm of Sir Gallant**, the last knight who chased Grimjaw. The scroll inside reads: "Lantern taken to Houndhold. The Legion marches on Pawsbury at the new moon." The Kitten Company is formed and the second companion slot opens.
- **L4 Frostwhisker Peaks**
  - **Mid:** **Pip** is hanging in a lantern cage over a cliff, caught stealing the Crow Queen's shinies. Pip unlocks Scramble.
  - **Close:** the defeated Crow Queen admits Grimjaw promised her "the shiniest thing on the island". In her tower Swordcat finds Ember chained and frees him. He remembers the milk.
  - **Night-camp beat, "The Watch"** **[REF V6 lantern scene]**: the kittens nap in a pile around sleeping Ember while Swordcat keeps watch alone with a lantern.
    - Clover, half asleep: "You're allowed to be scared."
    - Swordcat: "I know. I'm holding it anyway."

**ACT III: "The Hour Is Gold"**

- **L5 The Last Gate**
  - **Opener:** the new moon. The Hound Legion marches on Pawsbury down the causeway to the Low Gate, the same gate as the opening.
  - **Interludes:**
    - The hyena horde charges out of the fog (C3, reverse shot **[REF V2]**).
    - Champion Sir Brutus kneels to her height: "Stand aside, little one." (C4 **[REF V6]**)
    - She answers "No." The camera pulls back to reveal **Sir Bastion** waking behind her and copying her pose (**[REF V5]**). Brutus: "...I'll come back with more dogs."
  - **Close:** she beats Hater & Post Stealer. Ember lands, burns the siege tower, and she climbs into the saddle.
- **L6 Wings over the Fog** (stretch; a cutscene in the MVP). A dragon flight north and a duel with Sir Snarl above the clouds **[REF V4]**.
- **L7 Houndhold Keep.** She frees the caged kittens and climbs the storm tower.
  - **Final boss:** Grimjaw, phases in §7.6. In phase 3 he swings the Lantern itself; three perfect parries knock it loose and trigger the Golden Hour finisher.
  - **Ending:** C5.

### 3.4 Cutscenes (in-engine scripted sequences)

Cutscenes play in-engine, so the gameplay rig and actors stay live. Camera positions are given in **the anchor actor's local frame**: +Z is in front of her and +Y is up, in metres.

Every cutscene:
- is skippable (hold Pause or Esc for 1 s)
- is letterboxed with a 2.35:1 CSS bar
- is data-only, in `src/story/cutscenes/*.js` (§15.3).

**C1. "The Stand" (game opening, about 37 s; seamless into gameplay)**

| # | t (s) | Camera (pos → look, FOV) | Action | Audio | Text |
|---|---|---|---|---|---|
| 1 | 0–4 | (0, 0.62, 1.15) → (0, 0.70, 0), FOV 32, DOF focus 1.15 | Fade in from black over 1.5 s. Swordcat holds the **Oath pose**: sword vertical in front of her face, slightly to her right. The cape billows (wind 1.4 from −X), fog is 0.05 and mist cards drift. **This is the meme frame, held still.** | Wind only, no music | — |
| 2 | 4–9 | Slow ease-in-out dolly to (0, 0.9, 3.0) | Hold the pose, ear twitch, one blink | Wind | Caption (Cinzel, ink on fog): "Meow Isle. The ninth winter of the Great Drowse." |
| 3 | 9–15 | Cut. Wide crane (−6, 3.5, 8) → (0, 0.5, −6) | Behind her: the open Low Gate and 10 knight cats in armour napping in the grass, with "z" particles | `creature/c80_snore` ×3 positional, random pitch 0.8–1.1 | VO caption (portrait: Sir Marmalade, asleep): "When the Dawn Lantern was stolen, the fog came. And the fog made every grown cat... sleepy." |
| 4 | 15–21 | Close on Sir Marmalade slumped against the gate | He mumbles in his sleep | snore | "Five more minutes, Your Majesty..." |
| 5 | 21–27 | Low reverse shot behind her (0.4, 0.35, −1.6) → (0, 0.8, 8), FOV 40 | The fog ahead. Six pairs of red eyes blink on one by one (emissive points). | `creature/rat_squeak_attack` | — |
| 6 | 27–33 | Back to the meme frame (as shot 1) | She swallows (head bob), her ears flatten and rise, her gauntlets squeeze, and the blade's emissive goes 0 → 0.8 | Low drone | Swordcat: "...Too small for the sword." (1.2 s beat) "Holding it anyway." |
| 7 | 33–36 | Same, plus a bloom spike | **SWORDCAT** title slam in Cinzel Decorative gold, with a pink bow tied on the O | Music hit: `music/field_of_dreams.mp3` | — |
| 8 | 36–37.2 | 1.2 s blend into the gameplay follow camera | Letterbox out, HUD in. Two Rat Pikemen emerge and the tutorial prompt appears. | — | "Move: WASD / Left stick" |

**C2. "Milk Break" (L1 midpoint, about 28 s)** **[REF V3]**

1. **Selfie cam:** FOV 60, handheld wobble, held in front of her at arm's length (0.15, 0.75, 0.55). Swordcat sips milk from a cup through a straw. Mochi photobombs. SFX `cat/cat_mewpurr`.
2. **The ground rumbles:** shake trauma 0.2 rising, and the milk surface ripples (a shader uniform).
3. **The camera falls:** a 0.4 s whip-pan, then the camera rolls 90° and lands sideways in the grass at (0.6, 0.08, 0.9). The dropped cup is in the foreground with milk spilling.
4. **The dragon:** a huge red dragon (`creatures/monsters-flying/Dragon_Evolved.glb` tinted red, about 9 m) rises from the fog and **roars** into the lens. That is `creature/creature_roar_02` layered with `c80_roar_01` pitched to 0.7, shake 0.6, and fog pushed outward by its wing beats.
5. **Comedy beat:** the dragon sniffs, licks up all the spilled milk (the `Yes` clip), notices a broken chain on its ankle and the crows diving at it, and flees into the fog.
6. **Two-shot, upright:**
   - Swordcat (staring at the empty cup): "...That was my milk."
   - Mochi: "Was that a *DRAGON*?!"
   - Swordcat, seriously: "That was a thief."
   - Gameplay resumes: Crow Raiders follow the dragon's trail and the crow tutorial starts.

**C3. "Out of the Fog" (L5, after wave 1, about 12 s)** **[REF V2]**

1. A reverse shot over her shoulder from (0.35, 0.5, −1.4). The cape snaps and the blade glows gold.
2. Twenty hyena silhouettes charge out of the fog, using instanced low-LOD wolves from `Wolf.glb` and a crowd-noise layer.
3. **Cutaways, 1 s each:** the scrawls "HATER" and "POST STEALER" on two breastplates (CanvasTexture decals).
4. She doesn't move. Cut to gameplay as wave 2 starts.

**C4. "The Champion Kneels / The Giant" (L5, after wave 2, about 25 s)** **[REF V5, V6]**

1. Sir Brutus (a 2.2 m pug) walks up and **kneels to her eye level**. The camera is a two-shot at their shared eye height of 0.75 m.
   - Brutus: "Stand aside, little one. This is no place for kittens."
   - Swordcat: "No."
2. Brutus smirks and looks *up*. The camera **pulls back** along a 6 s spline from (0, 0.75, 1.2) to (0, 4, 14).
3. The pull-back reveals **Sir Bastion**, a 5.5 m armoured giant (`characters/kaykit/Knight.glb` scaled), standing right behind her, waking in her dawnlight. He plants his greatsword exactly as she plants hers.
4. Brutus: "...I'll come back with more dogs." He backs away into the fog and wave 3 starts.

**C5. "The Hour Is Gold" (ending, about 120 s including the interactive credits)**

1. **Rooftop, slow motion.** The Lantern lands in her paws. The camera circles at radius 2.5 m, height 0.9. The storm clouds part and a gold shaft falls on her: the ref1 look at full Holy (art.md §10.2).
2. **Fog clears, island-wide montage, 4 shots of 2.5 s:**
   - knights yawning and stretching (`cat/cat_softmew` chorus)
   - Pawsbury braziers flaring
   - Queen Snowpaw opening her odd eyes
   - a final shot of Grimjaw on his back, squinting at the sun.
   - Grimjaw: "...It's warm."
3. **Throne room** (`music/castle_kings_feast.mp3`). Queen Snowpaw:
   - Queen: "Kneel, Clementine."
   - Swordcat: "I'd rather stand, Your Majesty. I'm... used to it now."
   - Queen (laughing): "Then stand, Dame Clementine of the Nine Lives."
   - Sir Marmalade: "Keep the armor. It fits you better than it ever fit me."
   - Swordcat: "It doesn't fit me at all."
   - Sir Marmalade: "That's what I said."
4. **Interactive credits.** She rides Ember at sunrise over a sea of clouds **[REF V6 finale]**.
   - The player steers gently while credits float in the sky as gold-sparkle text.
   - Music: `music/festival_minstrel_dance.mp3`.
5. **End card.** The same meme frame as C1 shot 1, but sunlit, with the caption "The hour is gold."
6. **Post-credits.** At the festival, Grimjaw wears a pink bow and a kitten pats him. Caption: "Good boy."

### 3.5 Dialogue samples

**Swordcat's voice:** short, earnest declaratives. She apologises to beaten enemies. She never jokes on purpose; the comedy is the contrast.

- **Hub, after L1:**
  - Mochi: "Squire Mochi reporting! I have a shield and a *lot* of feelings."
  - Swordcat: "Good. Bring both."
- **Mushroom Hamlet (L2):**
  - Clover: "You're bleeding." Swordcat: "It's just ketchup." Clover: "We don't have ketchup." Swordcat: "...Then I'm bleeding."
- **Sage, on first meeting:** "You're the one with the sword bigger than you." Swordcat: "Yes." Sage: "...Fair."
- **Earl Grey, inside the jelly:** "Before you pop it, note the refraction! Thank you. Now pop it."
- **Pip, freed from the cage:** "Technically I was *borrowing* the shinies." Swordcat: "I know a lot about borrowing."
- **Hater (L5):** "LOOK AT THE TINY KNIGHT. HAHAHAHA." Swordcat holds Guard. Hater: "...Why isn't it working?" Post Stealer: "She's *unbothered*, bro."
- **Grimjaw, phase 2:** "Nobody ever came to my keep. Not ONE visitor. Now nobody visits anybody!"
  - Swordcat: "I'm visiting."

**Combat barks**

Barks are randomised, with a 6 s minimum gap and a 25% chance per trigger.

| Trigger | Lines |
|---|---|
| Parry | "Not today." / "Steady." / *ting* "mrrp." |
| Holy Slash | "For the dawn!" / "Lit from within!" |
| Golden Hour | "The hour is gold." |
| Holding It Anyway | "Too small... holding it anyway." |
| Low HP | "I'm fine. I'm *fine*." |
| Kill | "Sorry! Sorry." / "Go home, please." |
| Idle for 10 s | Plays the Vigil pose. "...mrrp." |
| Companion Shaken | "Mochi! Hold on, I'm coming." |

---

## 4. Swordcat: character & moveset

### 4.1 Personality, name, look
- **Name:** Clementine, a gatehouse page who polished the Dawnwatch armour. The whole island knows her as **Swordcat**, and all UI uses "Swordcat".
- **Personality:** brave out of stubbornness, polite, serious, a little worried (big eyes) **[REF]**. She loves milk. She is scared of thunder, which pays off in the storm finale: she stands anyway.
- **Look:** art.md §2 is binding.
  - pink bow on her left ear (always)
  - ginger/cream fur, blue-grey eyes
  - silver plate with four-lame pauldrons
  - red cape by default
  - the "Borrowed Blade", about 1.0–1.1 m (tech.md §2)
  - idle pose "Vigil" (ref2), charge and victory pose "Oath" (ref1, ref3)

### 4.2 Movement (all values go to `core/config.js`)

| Parameter | Value |
|---|---|
| Run | 4.6 m/s (stick > 0.5) |
| Walk | 2.0 m/s (stick ≤ 0.5) |
| Lock-on strafe | 3.4 m/s forward and sideways, 2.6 m/s back |
| Charge-walk / Guard-walk / Sipping | 1.8 / 1.5 / 1.4 m/s |
| **Zoomies sprint** | 6.4 m/s. Hold Dodge for 0.35 s after a roll. The only attack it allows is Zoomies Thrust. |
| Acceleration | damp λ 14 on the ground (90% in about 0.16 s), λ 18 braking, λ 3.5 in the air |
| Turn rate | 900°/s on the ground, 360°/s in the air. Attacks can re-aim only in their first 0.06 s, plus aim assist. |
| Gravity | 22 m/s² (tech.md) |
| Jump | v₀ 6.2 m/s gives a 0.87 m apex and 0.56 s airtime. Releasing early multiplies vy by 0.5 (variable height). |
| **Cat Leap** (double jump, from L2) | 5.4 m/s gives +0.66 m, with a flip animation. One per airtime. |
| Coyote time / jump buffer | 0.10 s / 0.12 s |
| Mushroom cap bounce | vy 11 m/s (2.75 m) |
| **Scramble** (wall climb, from L4) | Up to 3.5 m at 3.0 m/s on surfaces tagged `userData.climbable` (bark, wood, rough ice). One per airtime; a Cat Leap afterwards is allowed. |
| Fall | Terminal speed −14 m/s. **No fall damage**: cats land on their feet. Landing faster than 9 m/s causes a 0.15 s squash lockout. |
| Water (deep) | "Splash!" She is returned to the last safe ground (a ring buffer of grounded positions sampled every 0.5 s) and loses 1 half-heart. |
| Collision | Capsule r 0.32, h 1.0. Step-up 0.25 m; slope limit normal.y 0.7. |

### 4.3 Offence: attack table

Each id is one entry in `combat/attacks.js` (the format is in §15.2). Arc angles are relative to facing, with positive meaning her left. These numbers override tech.md §9.1, which was a placeholder.

| id | Name | Input | dur | active | Arc / shape | Range | Dmg | Poise | Knock | Hitstop / shake | Lunge | Combo window → next | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `slash1` | Swish | Attack | 0.36 | 0.08–0.16 | +1.2 → −1.2 rad | 1.9 | 10 | 1 | 4 | 0.05 / 0.12 | 2.5 | 0.14–0.36 → `slash2` | — |
| `slash2` | Swash | Attack | 0.36 | 0.08–0.16 | −1.2 → +1.2 | 1.9 | 10 | 1 | 4 | 0.05 / 0.12 | 2.5 | 0.14–0.36 → `slash3`; a **pause** then Attack at 0.36–0.70 → `whirl` | — |
| `slash3` | Big Bonk | Attack | 0.62 | 0.22–0.30 | overhead chop ±0.5 | 2.2 | 22, plus an impact ring r 1.0 for 8 | 3 | 9 | 0.09 / 0.35 | 4.0 | — | **Hyper armour** 0.12–0.30. Breaks cracked rocks and shields (§6). |
| `whirl` | Whisker Whirl | delayed 3rd hit | 0.70 | 0.18–0.46 | 360°, 2 hits | 2.0 | 8 + 8 | 1 + 1 | 6 | 0.04 / 0.2 | 1.0 | — | Crowd tool; ends facing the original direction |
| `plunge` | Pounce Plunge | Attack in the air | 0.18 hang, then dive at 14 m/s | dive until landing | below and ahead, r 0.8 | — | 18 dive + 10 landing ring r 1.3 | 3 | 8 | 0.08 / 0.3 | — | — | A direct hit **pogos** her up at 6 m/s (juggling crows) |
| `zoomies` | Zoomies Thrust | Attack during roll 0.18–0.42, or while sprinting | 0.45 | 0.06–0.22 | thrust ±0.25 | 2.6 | 14 | 2 | 6 | 0.06 / 0.15 | 7.0 | — | **Pierces** every enemy in line |
| `bright` | Bright Slash | Release charge tier 1 | 0.55 | 0.14–0.26 | +1.6 → −1.6 | 2.6 | 28 | 4 | 10 | 0.10 / 0.4 | 3.0 | — | No Valor cost. Breaks shields and pops slimes without splitting. |
| `holy` | **Holy Slash** | Release charge tier 2 with Valor ≥ 50 | 0.85 | 0.22–0.36 | full circle | 3.0 | 45 | 99 | 14 | 0.14 / 0.6 | 0 | — | Costs **50 Valor**. Spawns `holyWave`. Timescale 0.35 for 0.25 s real. |
| `holyWave` | Holy crescent (projectile) | — | life 0.65 | — | 3.0 wide × 1.6 high, 16 m/s, about 10.4 m | — | 30 | 6 | 10 | 0.06 / 0.2 | — | — | Pierces; bloom crescent |
| `riposte` | Riposte | Attack within 0.8 s of a parry on the staggered target | 0.50 | 0.10–0.20 | thrust ±0.3 | 2.4 | 18 (×2 crit = 36) | 4 | 10 | 0.12 / 0.35 | 5.0 | — | Kills most Act I grunts outright |
| `gleam` | Gleam Crescent | Every slash during Golden Hour | — | — | small crescent, 18 m/s, 8 m | — | 12 | 2 | 4 | — | — | — | Golden Hour only |
| `sunburst` | Sunburst | End of Golden Hour (auto, or press again after 2 s) | 0.9 | 0.30–0.40 | radius 6 | 6 | 60 | 99 | 16 | 0.16 / 0.7 | — | — | Ends Golden Hour |

**Charging.**
- Holding Attack for 0.35 s enters `charge`. She moves at 1.8 m/s, silver sparkles appear, and the camera pushes in from 4.2 to 3.8 m with FOV 45 → 42.
- **Tier 1** (0.70 s total hold): a silver flash and a `pickup/powerup_rise01` tick.
- **Tier 2** (1.20 s, and only with Valor ≥ 50): the blade turns gold, the ref1 holy look ramps in (art.md §4.3), and `powerup_rise03` plays.
- With Valor below 50, the charge caps at tier 1 and the gold sparkles fizzle visibly, so the player learns the rule.
- She can hold the charge indefinitely. Charging has poise 2: two light enemy hits cancel it.
- Releasing before 0.35 s gives `slash1`.

**Aim assist.** Without lock-on, each attack's first frame snaps her toward the nearest enemy within a 60° cone and 3 m (tech.md §9.4). On touch the cone is 90° and the range 4 m.

**Crits.**
- **×2:** a staggered or Dizzy target (Riposte), or a Pip Ambush.
- **×1.5:** the Purrfect Dodge counter, or the Lucky Paw charm (10% chance).
- Multipliers never stack beyond ×2.5.
- **Sharpness** (§10.3) multiplies all player damage.

**DPS sanity check.** A full Swish-Swash-Bonk combo deals 42 in about 1.2 s. A Rat Pikeman (30 HP) dies to one combo or one Riposte. A boss taking about 40 light-equivalent hits lasts 2.5–4 min.

### 4.4 Defence

**Guard: the Vigil pose (the meme pose).**
- Hold Guard; it takes 0.06 s to raise. She holds the sword upright in front of her face and the cape billows. Blocks cover the frontal 120°.
- A blocked hit deals **0 damage**. It pushes her back at 1.5 m/s and drains **Nerve** by `attack.poise × 20`.
- Nerve has a maximum of 100 (armour upgrades add to it). It regenerates at 35/s after 0.8 s without blocking.
- At 0 Nerve the guard breaks and she staggers for 1.1 s.
- Guard cannot stop **red (unblockable)** attacks, grabs or ground AoE.
- Guarding through a hyena **Jeer** negates its effects (§6). With the "Stand Your Ground" skill it also builds Valor.

**Parry, "Steadfast".**
- The window is the first **0.15 s** after pressing Guard: 0.25 s on Kitten difficulty, +0.03 s with the skill.
- Results:

  | Target | Effect |
  |---|---|
  | Regular enemy | Stagger 1.2 s, and a Riposte prompt appears |
  | Elite | Stagger 0.8 s |
  | Boss | +35 to the Dizzy meter |
  | Projectile | Reflected at 1.5× speed; deals 25 (bolts, arrows) or 30 (magic) |

- On every parry: **+20 Valor**, hitstop 0.12 s, timescale 0.5 for 0.15 s, a gold ring spark, a "ting" (`sword/sword_clash_*` plus `impact/metal_ringing`) and a rumble.
- **Anti-mash:** a whiffed parry locks the parry window for 0.30 s. Blocking still works during the lockout.
- **Gold-glint attacks** are the "Perfect" parries: the last hit of a boss combo. Parrying one puts a boss straight into Dizzy.

**Dodge roll.**
- 0.42 s long, covering about 3.1 m. The speed curve is 9 m/s for 0.20 s, then easing to 3 m/s.
- **I-frames run 0.04–0.30 s.**
- A roll cancels attack recovery after the attack's active window ends.
- It chains into another roll from 0.34 s, and into Zoomies Thrust at 0.18–0.42 s.
- **Dizzy-roll:** a fifth roll within 2.0 s becomes a 0.6 s "tumble" with i-frames only at 0.04–0.20 s. This discourages spamming in a cute way.
- **Air Twirl:** once per airtime. 0.25 s at 5 m/s, i-frames 0.02–0.18.

**Purrfect Dodge.**
- Triggers when an enemy's active hitbox overlaps her during the **first 0.15 s of i-frames**.
- Effects: timescale 0.35 for 0.6 s real time, the world desaturates 30% while Swordcat stays saturated, she leaves two afterimages, and she gains **+12 Valor**.
- Her next attack within 1.2 s crits ×1.5.
- SFX `pickup/powerup_fx01`.

**Getting hit.**
- Knockback 4–8 m/s, a 0.35 s hurt state, then **0.9 s of i-frames** with the mesh blinking at 15 Hz (tech.md).
- Hitstop 0.07 s, shake trauma 0.3 ×1.4, and a red vignette for 0.3 s.

### 4.5 Health, healing, Nine Lives

**Hearts.**
- She starts with **3 hearts**, which is 6 half-hearts and matches tech.md's `defaultSave`.
- The maximum is **10 hearts**:
  - boss "Full Ribbons" from L1–L4 add 4
  - 12 **Ribbon Scraps** (2 each in L1–L5 and L7; 4 = 1 heart) add 3.

**Milk (the heal flask)** **[REF V3 milk sip]**
- She starts with **2 sips** and can buy up to 5.
- One sip takes 0.9 s. It heals **4 half-hearts** at the 0.5 s mark and slows her to 1.4 m/s.
- If she is hit before 0.5 s, the sip is not consumed and nothing is healed.
- The pose is the selfie sip from the meme.
- Milk refills at Vigil Stones.

**Sardine snacks** drop from enemies 8% of the time and heal 1 half-heart. They are magnetised from 3 m.

**Nine Lives** **[REF "9 lives" bio]**
- Each level attempt starts with **9 Lives**, shown as 9 small bells.
- When she dies, she loses 1 Life and respawns at the last lit **Vigil Stone**:
  - hearts are full again
  - milk returns to the count it had at that stone
  - the enemies of the current arena reset.
- At **0 Lives** the "Nap Time" screen appears: Swordcat curled asleep around her sword.
  - The level restarts from its start.
  - Kittens and collectibles survive if a Vigil Stone was lit *after* they were picked up (they are "banked" there).
- **Level results medal:** Purrfect Vigil (9 Lives left, gold bow), silver (6–8), or bronze. The level also pays **50 fish × Lives left**.

**Holding It Anyway (last stand)**
- Once per checkpoint segment, a lethal blow leaves her at **1 half-heart** instead.
- She gets 2.0 s of invulnerability and +30 Valor.
- Presentation: she plants the sword and rises in 0.8 s of slow motion, saying "Too small... holding it anyway."
- The "Stubborn Heart" skill also recharges it every 120 s.

### 4.6 Valor and Golden Hour

**Valor** has a range of 0–100 and does not decay over time. It drives the sword-shaped HUD meter.

| Source | Valor |
|---|---|
| Light hit landed | +3 |
| Heavy hit (Bonk, Bright, Plunge) | +6 |
| Kill | +4 |
| Parry | +20 |
| Riposte | +8 |
| Purrfect Dodge | +12 |
| Block | +2 |
| Companion ability hit (skill K4) | +4, max +12 per use |
| Hit streak of 10 without taking damage | +10 |
| Hyena Jeer aura while not guarding | −6/s |
| Grimjaw Valor-Drain Howl | −50 |

| Spend | Cost |
|---|---|
| Holy Slash | 50 |
| Golden Hour | 100 (all of it) |

**Golden Hour (the ref1 state, the super move)**
- Activated with F, or LT+RT together, at Valor 100.
- **Activation:** a 0.6 s Oath pose, invulnerable, with the full ref1 glow, an aura hull, bloom 1.2, warm grade and FOV 48.
- **Duration:** 8 s (+3 s with a skill). Valor is locked at 0 during it and for 3 s afterwards.
- **Effects:**
  - super armour (no stagger)
  - damage taken halved, rounded down, so half-heart hits do nothing
  - +60% damage
  - every slash also fires a **Gleam Crescent**
  - Holy Slash charges in 0.5 s and costs nothing
  - +15% move speed.
- **End:** **Sunburst**, either automatically or by pressing again after 2 s.
- **Music:** a `jingles_STEEL*` stinger, plus a high-shelf brighten on the music bus.

### 4.7 Utility actions
- **Meow** (V / D-pad Down): a cute emote that also regroups companions to her side.
  - With the "Rally Meow" skill it also hastes them (§10.2).
  - It has a 1.0 s animation, and enemies within 4 m pause for 0.3 s, looking curious. That is a tiny trick, not a stun.
- **Interact** (E / Y): talk, open, rescue, man a ballista, rest at a Vigil Stone.
  - Resting plays the Vigil pose with a `cat/cat_purrsleepy_loop`, saves, and opens the "fast travel to hub" option.
- **Lock-on:**
  - range 14 m, breaks at 20 m or after 1.5 s without line of sight
  - switch targets with a mouse flick over 40 px within 0.15 s, the scroll wheel, or a right-stick flick past 0.7.

### 4.8 Juice table (implemented by combat, fx, camera and audio from the `HIT` and player events)

Rumble is gamepad `vibrationActuator`. Hitstop values from tech.md are kept.

| Event | Hitstop | Shake (trauma) | Visual | Audio | Rumble (weak, strong, ms) |
|---|---|---|---|---|---|
| Light hit | 0.05 | 0.12 | 60 ms white target flash, 4 hit-stars, squash pulse, damage number | `sword/sword_attack_*` ±5% pitch | 0.25, 0, 60 |
| Heavy hit | 0.09 | 0.35 | 8 stars, dust ring | `sword/melee_sword` + `impact/impactPunch_heavy_*` | 0.4, 0.5, 120 |
| Holy | 0.14 | 0.6 | Bloom 0.55 → 1.2 → 0.55 over 0.4 s, FOV +5° punch for 0.15 s, gold crescent, ground ring decal | `magic/spell_fire_03` + `impact/impactMetal_heavy_*` | 0.8, 0.8, 250 |
| Parry | 0.12 | 0.25 | Gold ring spark, 0.5× slow motion for 0.15 s | `sword/sword_clash_*` + `impact/metal_ringing` | 0.3, 0.7, 90 |
| Block | 0.04 | 0.1 | White sparks | `impact/impactMetal_medium_*` | 0.2, 0.2, 60 |
| Kill | +0.04 | +0.1 | "Poof" (12 puffs, 6 stars), helmet spins off, fish burst | `creature/*` death + `pickup/coins_*` | — |
| Player hurt | 0.07 | 0.3 ×1.4 | Red vignette, hearts wobble | `cat/cute_creature_*` (pitch 1.2) + `impact/impactPlate_light_*` | 0.6, 0.3, 150 |
| Boss Dizzy | 0.1 | 0.3 | Stars circling the head, gold "!" over the boss | `jingles/jingles_NES03` | 0.3, 0.3, 120 |
| Low HP (≤ 1 heart) | — | — | Vignette pulse at 1 Hz, hearts pulse | soft heartbeat (zzfx) | — |

Gamepad rumble support outside Chromium is **[unverified]**.

---

## 5. Fellow kittens & allies

### 5.1 The Kitten Company (field companions)

**Party size**
- **1 slot** from L1.
- **2 slots** after L3, when the Company is formed in Pawsbury.
- Companions are swapped at Vigil Stones.

**Field rules**
- **Follow:** companions trail her at 2.5–4 m. They teleport to her if more than 25 m away or after 4 s out of sight.
- **Shared fights:** enemies use the same attack tokens on companions. 30% of token grants go to a companion within 6 m.
- **Shaken, not dead:** companion health is 8 half-hearts. At 0 a companion is **Shaken**: it sits licking its paw with dizzy stars for 10 s, or 6 s with a skill. Swordcat can revive it by holding Interact for 1.0 s; Clover does it twice as fast.
- **Abilities:** Q / LT for slot A, R / RT for slot B. Each has a cooldown ring on the HUD.
- **Damage share:** companion damage is deliberately low (5–8). Their job is control, utility and Valor, not kills.

| Kitten | Look (art.md §7) | Join | Passive AI | **Ability** (button) | CD |
|---|---|---|---|---|---|
| **Mochi**, squire/tank | Tuxedo, giant round tower shield, blue tabard, pot helm | L1 (windmill barn) | Bonks for 6 every 1.4 s. Every 12 s shouts "Hey, over here!" and pulls one attacker onto himself. | **Bulwark:** plants a shield wall (2.2 m wide, 1.2 m in front of her) for 4.0 s. It blocks every frontal projectile and melee hit and taunts enemies within 6 m for 4 s. Melee hits on the wall stagger the attacker for 1.0 s. | 18 s |
| **Sage**, ranger | Silver tabby, leaf hood, short bow | L2 (log raft) | Arrows for 5 every 1.8 s, range 14 m. Priority: flyers, then casters, then the lock target. | **Pin Volley:** 5 arrows over 0.6 s at up to 3 enemies within 12 m. Each deals 6 and **roots** for 3.0 s. Hit flyers are **grounded** for 3.0 s, where melee can reach them. | 16 s |
| **Clover**, cleric | Calico, white coif, brass bell, flower staff | L2 (Mushroom Hamlet) | Heals Swordcat 1 half-heart when she is below 40% (20 s internal CD). Revives Shaken kittens twice as fast. | **Purr-ayer:** 1.0 s channel, then heals 4 half-hearts over 4 s to everyone within 5 m and cleanses poison, chill and Doubt. | 30 s |
| **Earl Grey**, scholar-mage | Siamese, wizard hat, round glasses, floating book (which lights dark areas) | L3 (inside a jelly) | "Teacup Bolt" for 6 every 3.0 s, range 12 m | **Yarn Snare:** throws a glowing yarn ball at a point within 10 m. After 0.4 s it pulls enemies within 4 m to its centre over 0.5 s and **binds** them for 2.5 s. Bosses are slowed 40% instead. Bound enemies take **+50% from Holy Slash and holyWave**. | 20 s |
| **Pip**, scout/rogue | Black cat, very long red scarf, tiny dagger | L4 (cliff cage) | Flanks for backstabs (8 every 2.2 s), +15% fish drops. **Sniffs secrets:** a minimap ping when a Golden Yarn is within 20 m. Unlocks **Scramble** (teaches her to climb). | **Smoke & Snatch:** a smoke puff on Swordcat (r 3.5 m). Enemies lose aggro for 3.0 s and wander confused. Her next attack within 4 s is an **Ambush ×2 crit**. Pip also snatches 5–15 fish from one enemy, or **retrieves anything Post Stealer stole**. | 14 s |

**Kinship Links (stretch).** Using both abilities within 1.5 s fuses them:
- **Mochi + Earl Grey, "Shield Snare":** enemies bounced off the shield wall fly into the yarn.
- **Sage + Pip, "Shadow Volley":** pinned enemies count as ambushed.
- **Clover + any, "Second Wind":** the other kitten's cooldown refreshes 50%.

### 5.2 Allies (scripted)
- **Sir Bastion (L5).** A 5.5 m giant armour that stands guard at the gate.
  - Every 12 s he sweeps one of three lanes. The telegraph is his shadow plus a lane decal, 1.2 s.
  - Each sweep deals 60 to enemies and never touches Swordcat or the kittens.
  - **Mirror gag:** whenever she plants her sword (Guard) he plants his. When she Meows he does a tiny wave (the `Cheer` clip).
  - Asset: `characters/kaykit/Knight.glb` (clip set S3).
- **Ember (L6 mount, finale cameo).**
  - In L7 phase 1 he makes one flyover strafe on Meow-command: 40 damage in a lane.
  - Asset: `creatures/monsters-flying/Dragon_Evolved.glb` tinted red, using clips `Flying_Idle`, `Fast_Flying`, `Yes` / `No` (cute nods) and `Headbutt`.
- **Sir Marmalade (hub).** Runs the Trials of the Dawnwatch (§8.8).
  - In L7 phase 3 he makes a one-time cameo, "Old Roar": he staggers every Bonehead on the rooftop.

### 5.3 Lost kittens (rescue collectibles) and hub growth

**Counts**
- Each of L1–L5 and L7 has **3 lost kittens**, in sacks, cages or hiding spots.
- L7 also has **9 kit-napped kittens** in the Kennels.
- Total: **27 + 5 companions**.

**How a rescue works**
- Interact for 0.6 s (a sack), or break a lock with 3 hits or a Bonk (a cage).
- She gets a `jingles/jingles_PIZZI0x` stinger and a toast, and the kitten pads off to the nearest Vigil Stone.
- The kitten then appears in Pawsbury: in the bakery, by the fountain, playing tag.

**Hub unlocks by kittens rescued**

| Kittens rescued | Unlock |
|---|---|
| 3 | Tailor Tilly opens (capes) |
| 6 | Trials of the Dawnwatch |
| 10 | Charm stall |
| 15 | "Spare Ribbon" charm, given as a gift |
| 20 | Festival games (stretch) |
| All 27 | "Rose Thorn" sword skin |

**Rescue names** (the story doc may rename): Bun the baker kitten, Tansy, Wick, Nutmeg, Biscotti, Pebble, Juniper, Sprout, Clove, Mallow, Fig, and others.

**Optional cameo** **[REF: real kitten on a plastic chair, Tenor GIF]:** a kitten with a toy sword sitting on a garden chair outside the Pawsbury tailor. She gives the "Practice Stick" skin hint.

---

## 6. Enemies

### 6.1 Shared rules and telegraph language

**AI**
- Every enemy uses the tech.md §10 FSM: idle, patrol, alert, chase, windup, strike, recover, stagger, die.
- Each type adds its own data and state overrides.
- Every melee windup is **at least 0.45 s** on the default difficulty.

**Attack tokens**

| Difficulty | Melee attackers at once | Ranged shooters at once |
|---|---|---|
| Kitten | 1 | 1 |
| Knight | **2** | **2** |
| Nine Lives | 3 | 3 |

Enemies without a token orbit at 1.4× their attack range.

**Arena budget:** at most 8 enemies alive per arena and at most 12 skinned meshes on screen (tech.md §18).

**Defeats are non-lethal.** A defeat triggers a poof plus faction debris, the helmet popping off, and some enemies fleeing for real. No blood (art.md §15).

**Act III scaling.** Enemies that reappear in L5–L7 get HP ×1.6. Their 1-half-heart attacks deal 2 instead.

**Telegraph language.** Colour is always paired with a shape and a sound, for colour-blind players.

| Telegraph | Visual | Sound | Counter |
|---|---|---|---|
| **Parryable** | White 4-point glint on the weapon at windup start, plus a "!" icon | high "ting" 0.25 s before the active frame | Parry, block or dodge |
| **Perfect (gold)** | Gold glint | brighter chime | Parry gives instant Dizzy (bosses) |
| **Unblockable** | Red-orange glow `#FF3B30` and a jagged "!!" icon | low growl or rumble | Dodge or jump only |
| **Ground AoE** | Circle, lane or cone decal filling from the centre outward; full means it hits | rising whoosh | Move out, or jump rings |
| **Ranged aim** | Dotted line, which stops tracking 0.2 s before firing | click | Strafe, or parry to reflect |
| **Grab** | Purple swirl | slurp | Dodge only |
| **Jeer** | Purple sound-wave rings around a hyena | cackle (`creature/c80_troll_*`) | **Guard** (stand your ground) or interrupt it with a hit |
| **Underground** | Moving dirt bump and a fissure line | rumble | Watch the pop-up circle |

### 6.2 Roster: summary

Damage is in half-hearts as Act I/II / Act III. HP is in points.

| # | Enemy | Where | Size (m) | HP | Poise | Speed walk / run (m/s) | Main threat | XP | Fish |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Rat Pikeman | L1, L5, L7 | 0.9 | 30 | 2 | 1.6 / 3.8 | Poke, parryable | 6 | 3–6 |
| 2 | Rat Crossbowman | L1, L5, L7 | 0.9 | 25 | 1 | 1.6 / 3.6 | Aimed bolt, reflectable | 6 | 3–6 |
| 3 | Crow Raider | L1, L4, L6, L7 | 0.8 (1.6 wingspan) | 20 | 1 | flies 5.0 | Dive bomb, ground shadow | 5 | 2–4 |
| 4 | Molegrim Sapper | L2 (L7) | 0.85 | 40 | 2 | 1.4 / burrowed 5.0 | Pops up beneath you | 10 | 4–8 |
| 5 | Bramblehog Knight | L2 | 0.8 | 50 | 3 | 1.5 / roll 9.0 | Spiked front, curl-roll | 14 | 6–10 |
| 6 | Hornet Lancer (elite) | L2 | 0.9 | 35 | 2 | hover 3.0 / dash 14 | Lance dash | 16 | 5–9 |
| 7 | Gloomjelly (L/M/S) | L3, L4 | 0.9 / 0.55 / 0.3 | 50 / 20 / 8 | 1 | hop 2.5 | Splits; status puddles | 8 / 3 / 1 | 1–3 each |
| 8 | Toad Hexer | L3 | 1.0 | 45 | 2 | 1.2 | Bubble trap, hex bolt | 12 | 5–8 |
| 9 | Ermine Shadowblade | L4 | 0.95 | 45 | 2 | 2.5 / 6.0 | Vanish, appears behind you | 18 | 6–10 |
| 10 | Hyena Jeerer | L5, L7 | 1.1 | 70 | 3 | 2.0 / 6.5 | **Jeer** (Valor drain), pack flanking | 22 | 8–12 |
| 11 | Pug Brute (heavy) | L5, L7 | 1.4 | 120 | 6 | 1.3 / guard-charge 6.0 | Tower shield, slam ring | 35 | 12–18 |
| 12 | Warhound | L5, L7 | 1.0 | 55 | 3 | 3.0 / 7.5 | Gallop charge | 18 | 6–10 |
| 13 | Bonehead (minion, warrior, rogue, mage) | L7 | 1.0 | 40 / 60 / 35 / 30 | 2 | 1.5 / 3.5 | **Reassembles** unless scattered | 12 | 4–8 |
| F1 | Wyvern Scout (flight only) | L6 | 3 (wingspan) | 40 | — | 14–18 | Fireball | 15 | 5 |

### 6.3 Roster: details

**1. Rat Pikeman** (Rat Militia grunt; oversized kettle helm, spear, cheese-sigil buckler)
- **Pike Poke:** windup 0.50 (white glint on the spear tip), active 0.12, recover 0.60. Thrust ±0.25 rad, range 2.0. Dmg 1 / 2, knock 3.
- **Double Poke** (L5+): two pokes 0.35 s apart. The second has a gold glint.
- **Behaviour:** packs of 2–4. Below 20% HP a rat squeaks "eek!" and flees for 2 s, then comes back.
- **Lesson:** the first parry. Parry, Riposte, poof.
- **Asset:** `creatures/polypizza/Rat.glb`, scaled to 0.9 m.
  - Clips: `Rat_Idle`, `Rat_Walk`, `Rat_Run`, `Rat_Death`.
  - The windup is the first 40% of `Rat_Attack` at 0.35× speed; the strike is the rest at 1.5×.
  - The procedural helm and spear attach to the head and hand bones **[unverified bone names]**, or to the root with an offset as a fallback.

**2. Rat Crossbowman** (green hood, crossbow)
- Keeps 7–11 m away and strafes.
- **Aimed Bolt:** a dotted red aim line for 0.8 s, which stops tracking 0.2 s before the shot. Bolt 18 m/s, dmg 1 / 2. Parrying reflects it for 25. Reload 2.0 s.
- If Swordcat comes within 3 m it hops back 3 m (`Rat_Jump`, 4 s cooldown).
- **Counter:** corner it, Zoomies Thrust, Sage's Pin Volley.
- **Asset:** `Rat.glb` + `weapons/kaykit/crossbow_1handed.glb`.

**3. Crow Raider** (plump crow, iron hood, red plume)
- Circles at 3–4 m height, out of normal reach.
- **Dive:** a ground shadow decal grows for 1.0 s. It tracks her for the first 0.6 s, then freezes. Dive at 12 m/s, dmg 1 / 2.
- After a dive, or a miss, it lands and pecks for 1.5 s: the punish window.
- In L4, crows snatch fish pickups before she can reach them.
- **Counters:** Pounce Plunge (pogo-chain them), Sage's Pin Volley, a reflected bolt.
- **Asset:** `creatures/monsters-flying/Pigeon.glb` tinted `#17181C` (there is no crow model).
  - `Flying_Idle` / `Fast_Flying` for travel, `Headbutt` for the dive, `HitReact`, `Death`.
  - Murder-spiral swarms use an InstancedMesh of a simplified crow.

**4. Molegrim Sapper** (velvet mole, brass goggles, candle helmet)
- **Burrow:** invulnerable underground. A dirt bump and particles travel toward her at 5 m/s with a rumble.
- **Pop-Up Claw:** a circle of r 1.2 fills under her for 0.7 s. Dmg 1 / 2, and it launches her.
- After popping up it rubs its goggles for 2.0 s: the punish window.
- **Bomber variant:** throws candle bombs (circle r 1.5, fuse 1.2 s, dmg 2). **A slash bats the bomb back.**
- A Holy Slash or Pounce on a moving dirt bump forces the mole out, stunned for 2 s.
- **Asset:** procedural (art.md §11). Fallback `creatures/polypizza/Goblin.glb` (S14).

**5. Bramblehog Knight** (spine-covered back, tiny bucket helm, mace)
- **Bristled front:** frontal 120° hits bounce off for 0 damage and recoil her. Flank it, or break the bristle: a Big Bonk or Bright Slash **flips it on its back** for 2.5 s, during which hits crit.
- **Mace Bonk:** 0.55 white glint, dmg 2.
- **Curl & Roll:** spines shake for 0.8 s with a red glow, then it rolls at 9 m/s, bouncing off walls up to 3 times. Dmg 2, unblockable. Afterwards it is dizzy for 1.5 s.
- **Asset:** procedural (instanced cone spines).

**6. Hornet Lancer** (elite; striped body, lance, blurred wings; comes in pairs that alternate)
- Hovers at 1.2 m, low enough for normal slashes.
- **Lance Dash:** the buzz pitch rises for 0.6 s with a white glint on the lance, then it dashes 8 m at 14 m/s. Dmg 2.
  - A **parry** sticks the lance in the ground for 2 s.
  - A dodge that leaves it facing a tree sticks the lance in the tree for 3 s.
- **Asset:** `creatures/polypizza/Wasp.glb` (`Wasp_Flying`, `Wasp_Attack`, `Wasp_Death`) + a procedural lance.

**7. Gloomjelly** (transmission slime with a swallowed object inside; variants bog, poison and frost)
- Hops every 1.2 s, with a 0.3 s squash before each leap. Contact dmg 1.
- **Leap Slam** (Large only): circle r 1.5 fills for 0.8 s. Dmg 2.
- **Splitting:** Large splits into 2 Medium, and each Medium splits into 2 Small. **Charged attacks (Bright and above) pop any size without splitting**, which teaches the charge.
- **Variants:**
  - **poison:** puddles for 4 s that deal 1 per 1.5 s
  - **frost:** ice patches (slippery) and *Chilled*, −30% speed for 2 s.
- **Asset:** procedural transmission sphere (art.md §11; at most 6 on screen with transmission). Fallback `creatures/polypizza/Slime.glb`.

**8. Toad Hexer** (fat toad, purple hood, glowing orb staff; caster at 8–12 m)
- **Bubble Lob:** the throat sac inflates for 0.7 s, then lobs 3 bubbles (circle decals). A bubble that hits **traps** Swordcat: she floats 1 m up for 1.5 s, or less if she mashes Attack. No damage, but it sets up other hits.
- **Hex Bolt:** 0.6 s windup with a green orb, dmg 2. A parry reflects it and stuns the toad for 2 s.
- Hops away when approached (3 s cooldown). In L3 it teleports between lily pads.
- **Asset:** `creatures/monsters-big/Frog.glb` (S12: `Idle`, `Jump`, `Weapon` (cast), `Punch`, `HitReact`, `Death`) + a procedural hood.

**9. Ermine Shadowblade** (white, black tail tip, mask, twin daggers)
- **Vanish:** a 0.3 s snow puff, then it reappears **behind** her within 2 m. A blue glint shows for 0.4 s, then twin daggers strike for dmg 2. **This is parryable, and a perfect parry gives Dizzy.**
- **Snow Dash:** crosses her path twice.
- It is invisible inside snowdrifts, but its tracks show.
- **Asset:** `creatures/animals/Fox.glb` (S9) recoloured white with a black tail tip, plus a procedural mask. Clips: `Attack`, `Gallop`, `Idle`, `Idle_HitReact1`, `Death`.

**10. Hyena Jeerer** (armoured hyena; breastplates scrawled "HATER", "POST STEALER", "SMOL", "REPOST") **[REF V2]**
- **Jeer Cackle:** throws its head back for 0.5 s (the telegraph), then a purple-ring aura of r 8 m for 2.5 s.
  - It drains **Valor 6/s** and applies **Doubt** (−20% damage for 3 s).
  - **Guarding negates it entirely** ("standing your ground").
  - Hitting the hyena during the head-throw cancels it.
- **Lunge Bite:** 0.5 s white glint, dmg 2 / 3.
- **Pack flank:** one token is reserved for "from behind", announced by a giggle 0.6 s before the attack.
- **Post Stealer grunt:** grabs dropped fish piles and runs off.
- **Asset:** `creatures/animals/Wolf.glb` (S9) with a spotted tan vertex tint and dark muzzle, plus procedural barding with a CanvasTexture scrawl. Clips: `Idle`, `Gallop`, `Attack`, `Idle_HitReact1`, `Death`, `Idle_2_HeadLow` (the jeer windup).

**11. Pug Brute** (Hound Legion heavy; barrel body, tower shield with a bone sigil)
- **Super armour while attacking** (poise 6). **The tower shield blocks all frontal attacks.**
  - Two Bright Slashes or one Holy Slash *crack* the shield and it drops.
  - Otherwise flank it: it turns at only 90°/s.
- **Shield Slam:** 0.7 s white glint (the slam itself is parryable), dmg 2 / 3. It also sends out a **red shockwave ring** (r 2.5, unblockable, but it can be jumped).
- **Bone Club Overhead:** 0.9 s red glow, dmg 3 / 4.
- **Guard-Charge:** shield forward, 1.0 s windup, 6 m/s, dmg 2, pushes her.
- **Asset:** procedural chibi pug (art.md §11). MVP fallback: the `characters/kaykit/Barbarian.glb` body (S3: `2H_Melee_Attack_Chop`, `Block`, `Block_Hit`, `Hit_A`, `Death_A`) with a procedural pug head on the head bone **[unverified bone name]**.

**12. Warhound** (dark war-dog with barding)
- **Gallop Charge:** 0.8 s crouch (`Idle_2_HeadLow`) and dust, then a dash at 11 m/s. Dmg 2 / 3, unblockable.
- **Bite Combo:** 2 × 0.45 s white glint, dmg 1 each.
- **"Fetch!":** distracted by thrown bones, and by fish when Pip uses Smoke & Snatch. It will also **run off to chew a Bonehead's bone pile, which removes that Bonehead for good.** This is an intended emergent interaction.
- **Asset:** `creatures/animals/Husky.glb` (S9), tinted dark.

**13. Bonehead** (Grimjaw's animated bone soldiers; cute chibi skeletons)
- **Chop:** 0.5 s white glint, dmg 2.
- **Block:** the Warrior variant blocks one light hit, then counters.
- **Bone Bolt:** the Mage variant fires one, dmg 2, reflectable.
- **Reassemble:** at 0 HP it collapses into a bone pile (`Death_C_Skeletons`) and rises again after 4.0 s with 50% HP (`Death_C_Skeletons_Resurrect`). This happens **unless the pile is hit by a heavy (Bonk, Plunge ring, Bright or Holy) while it is down**, which scatters it for good with a poof.
- **Asset:** `creatures/skeletons/Skeleton_Minion|Warrior|Rogue|Mage.glb` (S15: `Spawn_Ground_Skeletons`, `Idle_Combat`, `Walking_D_Skeletons`, `1H_Melee_Attack_Chop`, `Blocking`, `Hit_A`, `Death_C_Skeletons`, `Death_C_Skeletons_Resurrect`). Weapons come from `weapons/skeleton/*` on the `handslot.r` / `handslot.l` bones, which are verified present (ASSETS.md).

**F1. Wyvern Scout** (L6 only)
- Black small dragon (`monsters-flying/Dragon.glb` tinted).
- Strafes the dragon corridor and fires fireballs with a 0.6 s mouth glow. Dmg 2.
- Ember's fireballs or a close-pass slash bring it down.

---

## 7. Bosses

Shared boss rules:
- **Dizzy meter.** It fills from poise damage, parries (+35) and specials. Once it has gone 2 s without input it decays at 8/s. When full, the boss is **Dizzy for 3.0 s**: stars circle its head and every hit crits ×2.
- **Boss bar** shows phase notches.
- **Entry checkpoint:** a Vigil Stone at the arena door, so dying costs 1 Life and restarts the fight at full HP.
- **Ally adds** only spawn on the listed thresholds.
- **Drops:** the bosses of L1–L4 each drop a **Full Ribbon** (+1 heart) and an **Oath Sigil** (+1 Paw Point). The L5 boss drops an Oath Sigil and 200 fish.

### 7.1 Rat Captain Grizzlechop & Clatterback (L1), HP 400, Dizzy 100

**Arena:** the Standing Stones Ring.
- 16 m radius, with fog thinned to 0.03 for readability.
- 6 standing stones (r 0.8, 3 m tall) at radius 11. Each stone survives 2 beetle impacts.

**P1 "Mounted"** (100% → 60%)
- **Beetle Charge:** the beetle paws the ground and a dust-streak **lane decal** (3 m wide, 24 m long) fills over 0.9 s. It then charges at 13 m/s. Dmg 2, unblockable.
  - **If the lane ends at a standing stone:** THUNK. The beetle flips for 4.0 s, the Captain tumbles off Dizzy, and that is the punish window.
  - So the player learns to **stand in front of a stone** and roll at the last moment.
- **Saddle Sabre:** when she is within 2.5 m of the beetle's flank. 0.5 s white glint, dmg 1.
- **Cheese Wheel Toss:** 0.6 s windup, a wheel rolling at 7 m/s, dmg 1. It can be jumped, or **parried back** for 20.

**P2 "Duel"** (≤ 60%)
- The beetle panics and runs off (comedy). He fights on foot with a cheese-wheel shield.
- **Squeaky Combo:** windups 0.45 / 0.35 / 0.60, each dmg 1. **The third hit has a gold glint**, and parrying it gives instant Dizzy.
- **Shield Up:** frontal light hits only spark. A Bonk or charged attack cracks the shield; parries and flanking also work.
- "To me, lads!" at 50% and at 30%: 2 Pikemen and 1 Crossbowman come out of the fog.

**P3 "Cheese Rage"** (≤ 25%)
- **Snack:** he eats a cheese wedge over 0.8 s and heals 30. **Hitting him while he eats makes him choke: Dizzy for 2 s.** This is the lesson.
- His windups get ×0.8 faster.
- **Cheese Bomb barrage:** 5 circles (r 1.6, 1.0 s fill) around her, dmg 1 each.

**Defeat:** his helm spins off. "Alright, alright! We only wanted the cheese!" He drops a **Full Ribbon** (+1 heart), an **Oath Sigil** (+1 Paw Point), 150 XP and 100 fish.

**Assets:** `Rat.glb` at 1.6× with a procedural feathered hat, cape and sabre; procedural beetle (iridescent shell, art.md §11). **Music:** `battle_theme_a.mp3`.

### 7.2 Mole King Burrowmaw (L2), HP 650, Dizzy 120

**Arena:** Root Cavern.
- 26 m circle.
- 5 **Hardroot** stone slabs (2 × 2 m), 4 hanging lanterns, a ring of glowing mushrooms.

**P1** (100% → 60%)
- **Drill Swipe:** two hits, each a 0.55 s white glint, dmg 2, range 3.2.
- **Burrow & Erupt:** he dives in 1.0 s and tunnels toward her at 6 m/s, showing an **orange glowing fissure line**. He then locks on for 0.8 s (circle r 2.0) and erupts: dmg 3, launches.
  - **If he erupts under a Hardroot slab he bonks his head: Dizzy for 4 s.** The player lures him under the slabs.
- **Dirt Clods:** 3 arcing circles, dmg 1.

**P2 "Lights Out"** (≤ 60%)
- He smashes the lanterns. The only light left is his helmet candle, her sword glow, and Earl Grey's book if present.
- He is blind and **tracks noise**: running and rolling make noise, while walking and **Guard (Vigil stance) are silent**.
- **Drill Spin:** charges at the source of the noise in a straight line at 16 m/s. Dmg 3, red.
  - Standing still in Guard and side-stepping at the last moment makes him **crash into the wall: Dizzy for 3 s.**
- 3 Molegrim Sappers join at 50%.

**P3** (≤ 25%)
- **Cave-in:** waves of 8 falling rocks (shadow circles fill over 1.2 s), dmg 2.
- After every 3-move chain he **pants for 2.5 s**: a crit window.

**Defeat:** his goggles fall off. "You're a *kitten*. I thought you were a very loud turnip." He drops a Full Ribbon and an Oath Sigil.

**Asset:** procedural (velvet sheen, brass drill cones). The fallback re-skin is a "Mushroom King" using `creatures/monsters-big/MushroomKing.glb` (S12) with the same moveset, where burrowing becomes sinking into the ground. **Music:** `boss_epic_battle_loop.ogg`.

### 7.3 Slime Sovereign (L3), HP 800 (shared pool), Dizzy 140

**Arena:** the Drowned Chapel.
- 24 × 30 m flooded nave with ankle-deep water (splash particles on every step).
- 4 pillars and an altar.
- Built from Kenney graveyard-kit pieces: crypt walls, columns, iron fences.

**P1 "Royal Jelly"** (100% → 60%; 4 m slime with a knight's helm visible inside)
- **Royal Bounce:** shadow circle r 3.5 fills over 1.1 s. Dmg 3. Its landing sends out a splash ring (dmg 1) that can be jumped.
- **Gulp:** a 0.7 s purple-swirl lunge.
  - If it catches her she is **swallowed**: the camera goes inside the jelly (cute refracted view).
  - She mashes Attack 10 times (or holds it for 2 s on the accessibility toggle) to escape, taking 1 per second inside.
- **Spit Helms:** 3 sunken helmets fired as **parryable projectiles**. Each reflection deals 25.

**P2 "Three Courts"** (≤ 60%)
- It **splits into 3 medium Sovereigns** of 160 HP each:
  - Bog: slowing puddles
  - Poison: damage-over-time puddles
  - Frost: ice floor.
- Earl Grey's Yarn Snare groups them for a Holy Slash.
- When two are popped, the third absorbs the remains and phase 3 begins.

**P3 "Crown and Helm"** (remaining HP)
- A 2.5 m re-merged slime that bounces fast.
- After each bounce **the helm pops out on top for 2.5 s**. Hits on the helm crit ×2, and a Holy Slash on it gives Dizzy.

**Defeat:** it shrinks to a tiny slime still wearing the crown ("...blorp.") and later becomes a hub NPC. It returns the **Helm of Sir Gallant**, carrying the plot scroll and unlocking the Gallant Blue cape. **Asset:** procedural transmission.

### 7.4 Crow Queen Corvessa (L4), HP 900, Dizzy 150

**Arena:** the roof of the frozen watchtower.
- 22 m square, with ramparts.
- **3 ballistas** at the corners (`env/castle/siege-ballista.glb`).

**P1 "Sky"** (100% → 60%)
- **Murder Spiral:** 24 instanced crows spiral inward for 4 s. **The ring has one gap, which rotates**; dodge through it or jump. Each contact deals 1.
- **Dive Bomb:** a shadow grows for 1.0 s, dmg 3. If dodged, **her beak sticks in the snow for 2.5 s**.
- **Feather Fan:** 5 feather blades with a 0.4 s blue glint each, dmg 1. Each can be parried individually (reflect).

**P2 "Ballista"** (≤ 60%)
- She perches on the tower spire, out of reach.
- **Man a ballista** (E): aim with the camera, bolt at 40 m/s, reload 1.5 s.
  - **A hit drops her onto the roof, grounded for 6 s**: the big crit window.
  - Crows harass whoever is on the ballista. Three hits knock it out of action, and it repairs itself over 10 s.
- Ermine Shadowblades join at 45%.

**P3 "Blizzard"** (≤ 25%)
- Whiteout: fog density 0.08.
- She strikes from the fog with **blue glints 0.4 s before** each attack (parry).
- **Her crown flashes gold, with a chime, before every dive.**

**Defeat:** she falls into a snowbank and her crown rolls away. "My shinies... I only wanted to be admired." Swordcat gives her a button. Ember is freed and the Oath Sigil drops.

**Assets:** `Pigeon.glb` at about 4× tinted black, with `props/Crown.glb` tinted ice-blue. **Music:** `boss_epic_battle_loop.ogg`.

### 7.5 Hater & Post Stealer (L5), HP 450 + 350, Dizzy 100 each **[REF V2]**

**Arena:** the causeway before the Low Gate.
- 14 m wide × 40 m long.
- **Edges are tidal water:** falling in is a splash respawn and costs 1 half-heart.

**Shared: Jeer Duet**
- Both cackle together: aura r 10, 3 s, Valor −6/s plus Doubt.
- **Guard negates it.** With skill V3, each second spent guarding through it gives +6 Valor. Mechanically, she is literally "unbothered".

**HATER (brute, club stamped "HATER")**
- **Insult Slam:** 0.7 s red glow, dmg 3, plus an expanding shockwave ring that can be jumped.
- **Jab-Jab:** 2 hits, white glint, dmg 2.
- **Ratio Roar:** summons 3 Jeerer grunts, once every 30 s.

**POST STEALER (rogue, twin knives)**
- **Snatch:** a 10 m/s dash grab with a 0.5 s white glint.
  - On a hit he **steals 1 milk sip, or 20% of her carried fish (max 200)**, and runs for the fog laughing.
  - Three hits while he flees, or Pip's ability, return it with a "recovered!" toast.
- **Knife Flurry:** 4 quick hits (0.3 s windup), dmg 1 each. **The last one has a gold glint.**
- **Smoke Vanish:** teleports behind her with a 0.4 s blue glint.

**Phases**
- **P1:** both active, sharing one melee token, so only one attacks at a time.
- **P2:** when one is downed, the other **enrages**: +25% speed and a 14 m jeer aura.

**Defeat:** the rescued kittens on the wall cheer, a pink "ratio" banner unfurls, the scrawls on their armour get scratched out, and they flee. Drops an Oath Sigil and 200 fish. **Music:** `boss_epic_battle_loop.ogg`.

### 7.6 Lord Barkus Grimjaw, the Dog Warlord (L7 final), HP 1500, Dizzy 200

**Arena:** the Keep rooftop.
- 28 m circle under a storm.
- 4 bone piles, 4 braziers.
- The **Dawn Lantern** (`env/graveyard/lantern-glass.glb` scaled up, with an emissive core) is strapped to his back and glows faintly.

**P1 "Warlord"** (100% → 60%)
- **Cleaver Combo:**

  | Hit | Windup | Telegraph | Dmg | Notes |
  |---|---|---|---|---|
  | Sweep | 0.6 | white glint | 3 | — |
  | Back-sweep | 0.4 | white glint | 3 | — |
  | Overhead Slam | 0.9 | **red-hot edge, unblockable** | 4 | plus a crack-ring shockwave r 3 (jump it) |

- **Big Bark:** chest puff for 0.5 s, then a 70° cone, 8 m. Dmg 1 and big knockback; it cancels charges. Dodge-roll through it.
- **Bone-merang:** a giant bone thrown along a dotted out-and-back path, dmg 2. **A parry sends it back: 30 damage and +30 Dizzy.**
- **Shoulder Charge:** a dust lane fills over 0.8 s, then 14 m/s, dmg 3.
  - If he hits a brazier it tips over and leaves a fire puddle for 6 s.
  - A Meow command calls Ember's strafe once in this phase (40 damage).

**P2 "From the Fog"** (≤ 60%)
- Cutscene, 3 s: **his helm shatters** to show furious brows and a one-tooth underbite.
- Fog floods the arena (density 0.08). He hides in it; only red eyes glint.
- **Fog Lunge:** a red glint and a directional growl 0.5 s ahead, unblockable. Dodge.
- **Fog Cleave:** white glint, parryable.
- He raises **Boneheads** from the bone piles, 4 at a time.
- **Braziers:** a Holy Slash or an Earl Grey bolt **relights a brazier**, which clears fog within 8 m for 20 s. Relighting braziers is the player's way of pushing back the dark.

**P3 "The Last Light"** (≤ 25%)
- He tears the Lantern off his back and swings it as a flail.
- **Lantern Slam ×3**, each with a 0.8 s gold glint. Each one **must be perfectly parried**. A block takes chip damage of 1 and makes no progress.
- **Three parries in a row knock the Lantern loose.** It flies into her paws:
  - Valor goes to 100 instantly
  - **Golden Hour auto-activates for 12 s**
  - Grimjaw is **Dizzy for 5 s**
  - the prompt "HOLD ATTACK" triggers **"The Hour Is Gold"**: a cinematic Holy Slash that leads straight into C5.
- If the parries fail, after 6 s he lets out a **Valor-Drain Howl** (−50) and restarts the sequence.
- Sir Marmalade's one-time "Old Roar" (§5.2) staggers every Bonehead on the roof.
- **Accessibility:** on Kitten difficulty, blocks count as parries in this phase.

**Asset:**
- Primary: a procedural chibi bulldog (art.md §11), animated procedurally like Swordcat.
- MVP fallback: `characters/kaykit/Barbarian.glb` at about 3.2 m (S3 clips `2H_Melee_Attack_Chop`, `2H_Melee_Attack_Spin`, `2H_Melee_Attack_Slice`, `Block`, `Hit_A`, `Death_B`, `Throw`) with a procedural bulldog head and cleaver.

**Music:** `boss_epic_battle_loop.ogg`. In phase 3 the music cuts to wind and heartbeat for the parries, then `victory_fanfare.mp3` plays on the finisher.

### 7.7 Mini-bosses
- **Sir Snarl, the Black Wyvern Rider** (L6, 500 HP; flight).
  - **P1:** chase him and fire on him.
  - **P2:** he chases you; barrel-roll his fireballs.
  - **P3:** a **joust**: a head-on pass where Guard at the 0.2 s "clash" cue knocks him off **[REF V4]**.
- **Sir Brutus, the Pug Champion** (L7 Great Hall, 400 HP). A Pug Brute moveset plus a 3-hit shield combo; his final hit has a gold glint. When beaten he bows again. "...You stood."

---

## 8. Levels

Each level is a `world/levels/<id>.js` LevelData file (tech.md §12).

**Common furniture**
- **3 Vigil Stones** per level: `env/nature/statue_obelisk.glb` plus `env/graveyard/lantern-candle.glb`, which lights gold when touched.
- **Collectibles per level:**
  - 3 lost kittens
  - 2 Ribbon Scraps
  - 5 Golden Yarn balls (secrets; they unlock skins and capes)
  - 1 Lore Oath scroll (chapter quote)
  - crates and pots of fish (`wood_breaking_*`).
- **Cracked boulders** (`rock_largeA` with a cracked decal) break only to Bright or Holy. **Climbable bark and wood** is tagged. **Mushroom caps** bounce.

### 8.1 L1, Purrdale Misty Meadows: "Too Small for the Sword" (Act I, 25–30 min)

- **Heightfield:** 220 × 180 m, critical path about 650 m.
- **Fog** 0.045, exactly the reference look (art.md biome 1).
- **Props:** windmill `env/village-kaykit/buildings/building_windmill_red.glb` scaled about 4×, drystone walls, hay bales (`env/graveyard/hay-bale*`), standing stones, thistles.

```
                    N (fog)
        [5 Standing Stones Ring: BOSS Rat Captain]   <- Vigil Stone 3 at the door
                      |
        [4 Drystone Maze: Valor/Holy tutorial wave] ---- [opt. Thistle Rows: 2 kittens, 2 yarns, cracked boulders]
                      |
        [3b Milk Break hillock -> crow tutorial]
                      |
        [3 Windmill Farm: rescue Mochi]  <- Vigil Stone 2 ---- [opt. Hay Loft: Practice Stick yarn, Ribbon Scrap]
                      |
        [2 Sleepy Field: napping knights, parry tutorial, 1 kitten in a sack]
                      |
        [1 The Low Gate: opening C1, straw dummy "Sir Strawsworth", 2 rats]  <- Vigil Stone 1
                    S (Pawsbury)
```

**Beats**

| Zone | What happens | Teaches |
|---|---|---|
| 1 | C1, then 2 Pikemen (1 token) | Move, camera, combo (3 prompts) |
| 2 | Jump drystone walls. Sleeping knights snore ("five more minutes") when nudged. A Pikeman's first white glint triggers a **one-time 0.25× slow-motion prompt**: "Guard NOW". | Parry, Riposte |
| 3 | Rats besiege a barn. Break the lock (3 hits) to free **Mochi**. | Companion ability (Q) |
| 3b | C2 Milk Break, then 4 Crow Raiders | Dive shadows, Pounce Plunge |
| 4 | A wave of 6 rats including 2 crossbows in a walled maze. Valor fills and a one-time prompt appears: "Hold Attack". | Charge, Holy Slash. Bright Slash on cracked boulders as an optional lesson. |
| 5 | Boss | Everything above |

**Objectives:** reach the stones; find where the kittens are being taken.

**Set pieces:** the opening stand, the dragon at the milk break, mist cards rolling over the maze.

**Music:**
- explore: `field_of_dreams.mp3`
- combat: `battle_fast_fight_loop.ogg`
- boss: `battle_theme_a.mp3`

### 8.2 Hub, Pawsbury Town & Castle (warm golden hour, no combat)

- **Built from:** the Kenney Fantasy Town kit (modular houses, stalls, fountain), KayKit village buildings scaled 3–6× (tavern, church, blacksmith, castle), and cobbles from `textures/pavingstones070`.
- **Locations:**
  - Blacksmith (Rusty Whiskers)
  - Dairy (Nan Butterpaw)
  - Tailor (Tilly)
  - Charm stall
  - Sir Marmalade's Training Yard (Trials)
  - Kitten Company barracks (party swap, roster)
  - Castle throne room with the sleeping Queen
  - the Low Gate, the level-select parchment map at the gate's Vigil Stone
- **Drowsy NPCs:** shopkeepers yawn mid-sentence ("That'll be... *yawn*... 150 fish.").
- **Festival** after each boss: lanterns go up and `festival_minstrel_dance.mp3` plays. Festival mini-games such as Fish Toss and Yarn Race are stretch.
- **Music:**
  - streets: `village_town_theme.mp3`
  - market: `village_bards_tale.mp3`
  - tavern: `tavern_old_tower_inn.mp3`
  - castle: `castle_kings_feast.mp3`

### 8.3 L2, Whiskerwood Forest: "The Armor Is Borrowed" (Act II, 35 min)

**New mechanics**
- Cat Leap (the Spring Sabatons at the Old Knight's Shrine)
- mushroom bounce caps
- burrowers
- frontal shields (Bramblehog)
- flying elites

**Beats**
1. **Forest Edge:** Molegrim mounds and a first bomb sapper ("bat the bomb back!").
2. **Old Knight's Shrine:** a platform puzzle that ends with the **Cat Leap** pickup.
3. **Mushroom Hamlet:** a calm area of mushroom houses. **Clover** joins after a defence fight against 3 Bramblehogs.
4. **Hornet Treetops:** vertical root bridges. A Hornet pair harasses her and **a branch path collapses behind her**, a 30 s timed run.
5. **Stream Raft:** **Sage** is caged on a log raft drifting downstream. She chases it along the bank and frees him at a weir.
6. **Great Oak Tunnels:** dark Molegrim tunnels. Light comes from companions and glowing mushrooms; `cave_theme.ogg` plays.
7. **Root Cavern:** Mole King.

**Collectibles:** standard, plus a **Milk Jug** (+1 sip, free).

**Music:**
- surface: `field_of_dreams.mp3` (with a low-pass filter in deep woods)
- Hamlet: `tavern_old_tower_inn.mp3`
- tunnels: `cave_theme.ogg`
- boss: `boss_epic_battle_loop.ogg`

### 8.4 L3, Bogmire Marsh: "The Drowse Deepens" (Act II, 35 min)

**New mechanics**
- navigating dense fog (density up to 0.09)
- water hazards (Splash!)
- lily pads that sink after 1.2 s
- bubble traps
- split enemies and status puddles

**Beats**
1. **Boardwalk Village** (empty and drowsy): Gloomjellies, teaching the split and the charge-pop.
2. **Wisp Path:** a navigation puzzle. Will-o'-wisps leave sparkle trails through the fog; following a wrong wisp loops her back to the start.
3. **Sunken Helms:** recover 3 helmets of lost knights for lore and a cape hint.
4. **Toad Court:** Hexers teleport between lily pads around a lily-pad hopping arena.
5. **Giant Gloomjelly:** pop it to free **Earl Grey**.
6. **Drowned Chapel:** Slime Sovereign.
7. **Back in the hub:** the Kitten Company forms and the **second companion slot** opens.

**Ambience:** `sfx/world/loop_rain.ogg` and `loop_water_01.ogg`. **Music:** `dark_forest_creepy.ogg`; boss `boss_epic_battle_loop.ogg`.

### 8.5 L4, Frostwhisker Peaks: "Nine Lives, One Mountain" (Act II, 40 min)

**New mechanics**
- **Scramble** (from Pip)
- ice (ground acceleration λ 3)
- wind gusts that push at 2 m/s, telegraphed by snow streaks
- rope bridges that crows cut, triggering timed runs

**Beats**
1. **Switchback Trail:** introduces Ermines, and snow dig spots that give fish when Bonked.
2. **Ermine Camp:** **Pip** hangs in a lantern cage over a cliff. She lowers it by pulling a lever while defending it.
3. **Frozen Waterfall Climb:** a Scramble and Cat Leap chain.
4. **Avalanche Run:** a 45 s set piece. The camera sits in front, she runs toward it, and instanced snow boulders roll behind her. She jumps crevasses. Dying here restarts the run only, at no Life cost; this is the one forgiving set piece.
5. **Watchtower Ballista Yard:** practice on the ballistas.
6. **The tower roof:** Crow Queen, then **Ember freed**, then the night camp "The Watch".

**Music:** `cave_theme.ogg` for the ice caves. **Gap:** there is no dedicated snow track, so exploration reuses `field_of_dreams.mp3` and the gap is flagged in §13. Boss: `boss_epic_battle_loop.ogg`.

### 8.6 L5, The Last Gate: "Hold the Line" (Act III, 15–18 min; wave defence) **[REF V2, V5, V6]**

```
 N   fog bank  — spawn lanes A (west), B (centre road), C (east)
         \        |        /
          \       |       /      tidal flats on both sides = splash zone
    ======= causeway 14 m wide x 60 m =======
     [Kitten Post L]   barricade   [Kitten Post R]   <- prep: station one companion at each
                [ THE LOW GATE ]  Gate Integrity 100     (Sir Bastion sleeps in the gatehouse wall)
 S                Pawsbury
```

**Rules**
- **Gate Integrity** (100) is shown on the HUD.
- Enemies that reach the gate damage it:
  - battering ram squads (`env/castle/siege-ram.glb` carried by 4 rats; the ram has 80 HP): −10 every 3 s
  - Pug Brutes: −5 per slam.
- **At 0 the current wave restarts and costs 1 Life.**

**Prep (60 s before each wave)**
- Station companions at the left and right **Kitten Posts**; posted companions defend their flank lane.
- Buy one barricade reinforcement for 50 fish.

**Waves**

| Wave | Time | Enemies | Extra pressure |
|---|---|---|---|
| 1 | 2:30 | 8 Rat Pikemen, 4 Crossbowmen, 1 ram squad | — |
| C3 | — | Hyena horde charge cutscene | — |
| 2 | 3:00 | 6 Hyena Jeerers (3 pairs, jeer lesson), 4 rats | 4 crows harass the Kitten Posts |
| C4 | — | Champion kneels; Bastion reveal | — |
| 3 | 3:00 | 3 Pug Brutes, 4 Warhounds | A **siege tower** (`env/castle/siege-tower.glb`, 200 HP) rolls up lane B at 0.6 m/s; destroy it within 90 s or it docks and drops rats. **Bastion sweeps** a lane every 12 s. |
| Boss | — | Hater & Post Stealer | — |

**Close:** Ember lands, burns the siege wreck, and she mounts him.

**Music:** waves `battle_theme_a.mp3`; boss `boss_epic_battle_loop.ogg`.

### 8.7 L6, Wings over the Fog (Act III, 8–10 min; dragon flight) — STRETCH

**Flight control**
- Ember flies a **spline corridor** (CatmullRom). Forward speed is 14 m/s, or 22 m/s with Boost (3 s, 6 s recharge).
- The player steers within a 30 × 16 m corridor cross-section; Ember banks up to 35°.
- **Fireball** (Attack): 20 dmg, 0.35 s cooldown, auto-aim cone 6°.
- **Close-pass slash:** an enemy within 3 m shows a prompt; deals 35.
- **Barrel roll** (Dodge): 0.4 s of i-frames, 1.0 s cooldown.
- **Holy Breath** (Valor 50): a 3 s cone beam.
- Player health is unchanged; Lives still apply.

**Beats**
1. Sea of clouds.
2. Crow flocks.
3. A ballista bolt gauntlet along the cliffs, with red aim lines.
4. Fog walls to thread through.
5. Sir Snarl duel.
6. Landing on Houndhold's outer wall.

**MVP replacement:** a 25 s flight cutscene on the same spline.

### 8.8 L7, Houndhold Keep: "The Hour Is Gold" (Act III, 35–40 min)

- **Built from:** the Kenney castle kit (walls, towers, gates, siege engines), KayKit dungeon (red `banner_*`, `torch_lit`, barrels, chains via `impact/chain_*` SFX).
- **Look:** storm sky, embers, red banners (art.md biome 6).

**Beats**
1. **Outer Wall:** catapults fire boulders onto target circles (1.5 s fill). Warhounds patrol.
2. **Courtyard:** mixed Legion arena, followed by Vigil Stone 2.
3. **Kennels:** **9 kit-napped kittens** in procedural cages. Each one freed gives a **Kitten Cheer stack, +2% damage for the finale** (max +18%). Freed kittens hide and cheer during the final fight.
4. **Bone Vault:** Boneheads introduced. "Scatter the bones!" Warhounds fetching bone piles is shown here.
5. **Great Hall:** Sir Brutus rematch (mini-boss).
6. **Storm Tower:** a Scramble and Cat Leap climb with lightning flashes. **She flinches at the thunder (an animation beat) but keeps climbing.**
7. **Rooftop:** Grimjaw.
8. **C5** ending.

**Music:**
- interior: `cave_theme.ogg`
- combat: `battle_fast_fight_loop.ogg`
- final boss: `boss_epic_battle_loop.ogg`
- ending: `story_lament_warriors_soul.mp3`, then `festival_minstrel_dance.mp3`

### 8.9 Optional content
- **Trials of the Dawnwatch** (hub; Sir Marmalade): 9 arena challenges with bronze, silver and gold medals. Rewards are fish, Oath Sigils (2 for golds) and skins. Examples:
  - "Parry Only" (rats can only be damaged by Ripostes)
  - "Nine Lives Gauntlet" (5 waves on one heart)
  - "Zoomies Time Attack"
  - "Holy Hour" (3 Golden Hours in 90 s)
- **Moonlit Abbey Ruins** (art.md biome 7; stretch): Spectral Mice and owls. The postgame home of Pearl.

---

## 9. Pacing

### 9.1 Mechanic schedule (introduce → develop → twist → test)

| Level | Introduce | Develop | Twist | Test |
|---|---|---|---|---|
| L1 | Combo, dodge, parry, companion, charge, Holy, milk, lives | Packs + crossbows | Crows (air threats, Pounce) | Rat Captain: stones, parry gold glint, interrupt the snack |
| L2 | Cat Leap, bounce caps, burrowers, frontal shields | Bomb batting, flanking | Darkness and noise (tunnels) | Mole King: lure under slabs, Vigil-silence |
| L3 | Splitting, status puddles, bubble traps, water | Wisp navigation | Fog at 0.09 | Slime Sovereign: three courts, helm crits |
| L4 | Scramble, ice, wind, ballista | Vanishing enemies, parry from behind | Whiteout | Crow Queen: ballista, crown cue |
| L5 | Wave defence, gate HP, Kitten Posts, **jeer, so Guard becomes offence** | Heavy shields, charges | Bastion ally, siege tower timer | Hyena duo: steal and recover |
| L6 | Flight | Boost, rolls | Joust | Sir Snarl |
| L7 | Reassembling Boneheads, fog braziers | Cage liberation stacks | Storm, thunder flinch | Grimjaw: three perfect parries, then Golden Hour |

### 9.2 Intensity curve
- **Within each level:** two peaks of rising intensity, a breather (a safe zone with a Vigil Stone, a kitten rescue and story), then a long ramp to the boss.
- **Across the game:** after each boss, the Pawsbury festival is a cool-down.
- **Fight lengths:** a combat arena takes at most 90 s, then at least 45 s of traversal, puzzle or story before the next.
- **Act III** removes the long breathers (no hub visit between L5 and L7) to sustain the climax.

| Level | Est. time | Combat / traverse / puzzle / story (%) | Peaks |
|---|---|---|---|
| L1 | 25–30 min | 45 / 30 / 5 / 20 | Holy wave; boss |
| Hub (each visit) | 5–10 min | 0 / 40 / 0 / 60 (shops, Trials optional) | — |
| L2 | 35 min | 45 / 35 / 10 / 10 | Hornet run; boss |
| L3 | 35 min | 40 / 30 / 20 / 10 | Toad Court; boss |
| L4 | 40 min | 40 / 40 / 5 / 15 | Avalanche; boss |
| L5 | 15–18 min | 80 / 0 / 5 / 15 | Wave 3; boss |
| L6 | 8–10 min | 85 / 0 / 0 / 15 | Snarl joust |
| L7 | 35–40 min | 55 / 25 / 5 / 15 | Brutus; Grimjaw |
| **Total** | **≈ 4.5–5 h** first playthrough | | |

---

## 10. Progression

### 10.1 Knight Rank (XP = "Courage")

| Rank | Title | XP needed |
|---|---|---|
| 1 | Page | 0 |
| 2 | Squire-in-Training | 100 |
| 3 | Squire | 250 |
| 4 | Shield-Kitten | 450 |
| 5 | Sword-Kitten | 700 |
| 6 | Knight-Errant | 1000 |
| 7 | Knight of the Mist | 1400 |
| 8 | Knight of the Dawnwatch | 1900 |
| 9 | Lantern Knight | 2500 |
| 10 | Knight of the Nine Lives | 3200 |

- **Each rank gives +1 Paw Point.**
- **Charm slots:** 1 at the start, 2 at rank 4, 3 at rank 7.
- **XP sources:** enemies (§6.2); bosses 150 (L1) up to 400 (L5); each kitten rescued 50; each secret 20.
- **Budget:** about 3,500 XP in the full game (rank 10 near the end); about 750 XP in the MVP (rank 5).
- **Paw Points:** 9 from ranks, 5 Oath Sigils from bosses L1–L5, and 2 from Trials golds, for **16 points against 18 nodes**. The player has to choose.

### 10.2 The Oath Tree (3 branches × 6 nodes, 1 point each; nodes unlock in order)

| # | **Blade** (offence) | **Vigil** (defence) | **Kinship** (company) |
|---|---|---|---|
| 1 | **Swift Paws:** light attacks 10% faster, combo window +0.06 s | **Steadfast:** parry window +0.03 s, whiff lockout −0.10 s | **Kitten Cheer:** companion cooldowns −15% |
| 2 | **Quick Oath:** charge tiers 25% faster (0.53 s / 0.90 s) | **Riposte+:** Riposte becomes 2 hits (18 + 12) and gives +10 Valor | **Pack Tactics:** enemies rooted, staggered or bound by companions take +25% damage |
| 3 | **Big Bonk+:** impact ring r 1.0 → 1.8, +6 damage | **Stand Your Ground:** 1.5 s of unhit Guard gives +5 Valor/s (up to 50 per stance); guarding through Jeer gives +6/s | **Rally Meow:** Meow hastes companions 30% for 5 s (20 s CD) |
| 4 | **Twin Crescent:** holyWave fires 2 crescents ±12°, 30 each | **Purrfect Reflexes:** Purrfect Dodge window 0.15 → 0.22 s, slow motion +0.2 s | **Shared Valor:** companion ability hits give +4 Valor (max 12 per use) |
| 5 | **Gleaming Edge:** Bright Slash also fires a small crescent (6 m, 12 damage) | **Stubborn Heart:** Holding It Anyway also recharges every 120 s | **Never Alone:** Shaken time 10 s → 6 s; self-revive |
| 6 | **Long Hour:** Golden Hour +3 s | **Milk Mastery:** a sip takes 0.6 s and heals +1 half-heart | **Oath of Company:** Golden Hour refreshes both companion cooldowns |

### 10.3 Fish (currency), shops, upgrades

**Fish** come in two forms:
- Silver Sardine = 1 fish (`pickup/coins_*`)
- Golden Koi = 25 fish (`pickup/gem_*`)

Fish drop from enemies, crates, pots and secrets, and as Trials rewards and lives bonuses.

**Full-game budget, about 8,500 fish:**

| Source | Fish |
|---|---|
| L1 | 500 |
| L2 | 800 |
| L3 | 950 |
| L4 | 1050 |
| L5 | 1000 |
| L6 | 500 |
| L7 | 1200 |
| Trials | 1500 |
| Secrets and lives bonuses | 1000 |

Core upgrades cost about 7,450, so not every cosmetic and charm is affordable. That is intentional.

| Shop | Item | Tiers and costs | Effect | Gate |
|---|---|---|---|---|
| Blacksmith (Rusty Whiskers) | **Sharpen** | T1 150, T2 400, T3 900, T4 1800 | Damage ×1.15 / ×1.30 / ×1.50 / ×1.75 | T2 after L2, T3 after L4, T4 after L5 |
| Blacksmith | **Armour Polish** | 200 / 600 / 1200 | Nerve +25 per tier. T3 adds **Unflinching**: light enemy hits don't interrupt her attacks. | T2 after L3 |
| Dairy (Nan Butterpaw) | **Milk sip +1** | 300 / 700 / 1200 | 2 → 5 sips | — |
| Tailor Tilly | Capes | 100–500 | Cosmetic | 3 kittens rescued |
| Charm stall | Charms | 250–400 | See below | 10 kittens rescued |

**Charms** (equip 1–3)

| Charm | Effect | How to get it |
|---|---|---|
| Bell of Nine | +1 Life per level (10) | L1 secret |
| Catnip Pouch | +8% move speed | Shop, 300 |
| Fishbone Charm | +25% fish | Shop, 400 |
| Sardine Tin | Snack drop chance 8% → 20% | Shop, 250 |
| Heavy Pommel | Bonk and Plunge +25%, light attacks −5% | L2 secret |
| Moonstone | +20% Valor gain | L3 secret |
| Feather Toy | Purrfect Dodge window +0.05 s | L4 secret |
| Dawn Ember | Holy Slash costs 40 | L5 secret |
| Lucky Paw | 10% chance of ×1.5 crit | Trials silver |
| Spare Ribbon | Once per checkpoint segment, ignore one hit | 15 kittens rescued |

### 10.4 Sword skins and capes (cosmetic only)

A skin changes the blade material, the trail colour and the swing pitch slightly.

| Sword skin | Look | Unlock |
|---|---|---|
| **Borrowed Blade** | Steel, brass guard (ref2) | Default |
| **Practice Stick** | Wooden toy sword **[REF real-kitten GIF]** | L1: all 5 Golden Yarns |
| **Moonsilver** | Pale blue-silver | L3: all 5 Golden Yarns |
| **Frostbite** | Ice crystal | Beat the Crow Queen without taking damage |
| **Dragonfang** | Red-hot edge | L4: all 5 Golden Yarns |
| **Fishbone Saber** | Bone-white fish skeleton | Bronze in every Trial |
| **Rose Thorn** | Pink blade (pink is reserved for heroes) | Rescue all 27 lost kittens |
| **Gilded Hour** | Gold with a permanent soft glow (ref1) | Finish the game |
| **Grimjaw's Cleaver** | Comically oversized at 1.5× length: "even more too big" | Finish on Nine Lives difficulty |

**Capes:**
- Dawnwatch Red (ref2; default)
- Meme White (the viral clips; **[REF]**; L1 secret)
- Pilgrim Cream (ref3; shop)
- Gallant Blue (Sir Gallant's helm returned)
- Royal Lavender (Queen; ending)
- Ember Scale (L6)

### 10.5 Difficulty

| Setting | Kitten | Knight (default) | Nine Lives |
|---|---|---|---|
| Enemy damage | ×0.5 (minimum half-heart) | ×1 | ×1.5, rounded up |
| Tokens melee / ranged | 1 / 1 | 2 / 2 | 3 / 3 |
| Parry window | 0.25 s | 0.15 s | 0.12 s |
| Enemy windups | ×1.25 | ×1 | ×0.9 |
| Lives | Unlimited (no counter) | 9 per level | **9 for the whole campaign**; when they run out, restart the Act |
| Milk | +1 sip | Base | Base |

Difficulty can be changed at any Vigil Stone, except Nine Lives, which is chosen at the start.

---

## 11. UI / HUD

The style follows art.md §13: CSS parchment, pink candy buttons and wax seals.

**Fonts:**
- Fredoka for UI and numbers
- Cinzel or Cinzel Decorative for titles
- Uncial Antiqua for lore scrolls

These are all shipped in `public/assets/fonts/` under the OFL, so no Google Fonts call is needed.

### 11.1 HUD layout

| Position | Widget | Behaviour |
|---|---|---|
| Top-left | Round gold **portrait** (Oath pose, pink bow peeking over the frame) | Expression changes: worried below 1 heart, glowing in Golden Hour |
| Top-left, next to portrait | **Hearts** (half-hearts) | Wobble when hit, pulse red `#E04646` when low |
| Under hearts | **Valor meter**, shaped like a sword (hilt on the left) | Silver fill; a notch at 50 marks "Holy ready" and the blade edge shimmers there; at 100 it turns gold with sparkles and the Golden Hour key glyph pulses |
| Under portrait | **9 Lives bells** and **Milk bottles** | A bell rings and dims when a Life is lost |
| Top-right | **Minimap** (round parchment, ink-wash map, paw icon for her, gold dots for Vigil Stones, Pip's secret pings) | Rotates with the camera (option) |
| Under minimap | Objective line; **fish counter** (sardine icon); **kittens N/3** for the level | — |
| Bottom-right | **Companion portraits** (1–2) with a radial cooldown ring in their signature colour and the key glyph | A "!" if Shaken |
| Top-centre | **Boss bar**: dark iron frame, red fill, phase notches, thin gold **Dizzy** bar underneath, name ribbon | Appears on BOSS_PHASE 1 |
| Top-centre (L5) | **Gate Integrity** bar with a gate icon, plus a wave counter "Wave 2/3" | — |
| Centre | Lock-on reticle: rotating gold ring; small enemy HP pip bar (shows on first hit, fades after 3 s) | — |
| World space | Damage numbers (Fredoka 700: white; crits gold with a sparkle; heals green); parchment interaction tags on a wax seal | Pool capped at 20 |
| Near reticle | **Hit streak**, "×10 Purrfect!" | Shown at 5+ hits; gives +10 Valor at 10 |
| Bottom-centre | **Dialogue scroll**: speaker name on a pink ribbon, portrait, typewriter at 30 chars/s with a `ui/tick_001` blip every 2 characters | — |
| Top-centre | **Toasts**, for example "Kitten rescued!" with a `jingles_PIZZI` stinger | — |
| Edges | **Off-screen threat arrows**: white for a parryable incoming attack, red for unblockable | — |

### 11.2 Screens
- **Title:** the C1 meme frame live in-engine, a slow push-in and the SWORDCAT logo. "Press any key / Tap" also unlocks audio.
- **Main menu:** Continue, New Vigil (pick difficulty), Settings, Credits.
- **Pause:** Resume, **Oath Tree** (the three branches drawn as ink vines), **Kitten Company** (roster and swap, only at Vigil Stones), Collection (kittens, yarns, scrolls, skins), Map, Settings, Quit.
- **Shop:** a parchment ledger with an item preview on a rotating pedestal.
- **Level results:** time, Lives left, medal, kittens, yarns and fish bonus. The "Meme Cam" snapshot of the final frame is a stretch feature.
- **Nap Time** (game over): "Swordcat needs a nap." Options: Wake up (continue) or Return to Pawsbury.
- **Photo Mode** (stretch): freeze, free camera, poses (Vigil, Oath, Milk Sip), fog and wind sliders, and a **Meme Cam** preset that frames C1 shot 1 exactly.

---

## 12. Controls

### 12.1 Keyboard + mouse

| Action | Key |
|---|---|
| Move | WASD / arrows |
| Camera | Mouse (pointer lock after the first click) |
| Attack / **hold to charge** | LMB / J |
| **Guard (hold) / Parry (tap timing)** | **RMB** / L |
| Dodge (hold after a roll = Zoomies sprint) | Shift / K |
| Jump (in the air: Cat Leap) | Space |
| Interact / talk / confirm | E / Enter |
| Companion A / Companion B | Q / R |
| **Golden Hour** (Valor 100) | F |
| Sip Milk | C |
| Meow (regroup) | V |
| Lock-on / switch target | Tab or MMB / mouse wheel or flick |
| Map | M |
| Pause | Esc / P |

**Change from tech.md §7:** RMB moves from Dodge to **Guard/Parry**. The input owner must update the action map. New actions: `guard`, `ability1`, `ability2`, `golden`, `sip`, `meow`, `map`.

### 12.2 Gamepad (standard mapping; Xbox labels with PlayStation in brackets)

| Action | Button |
|---|---|
| Move / camera | Left stick / right stick (dead zone 0.15) |
| Attack / charge | X [□] |
| Jump | A [✕] |
| Dodge / sprint | B [○] |
| Interact | Y [△] |
| **Guard / Parry** | **LB [L1]** |
| Lock-on (flick the right stick to switch) | RB [R1] or R3 |
| Companion A / B | LT [L2] / RT [R2] |
| **Golden Hour** | **LT + RT within 0.1 s** |
| Sip Milk / Meow | D-pad Up / D-pad Down |
| D-pad Left / Right | Cycle the lock target (accessibility alternative to flicks) |
| Pause / Map | Start / View |

### 12.3 Touch (landscape; built on tech.md §7 TouchControls)

**Layout**
- **Left 45% of the screen:** floating move joystick.
- **Right half:** drag to look.
- **Right cluster:**
  - big ⚔ **Attack** (hold to charge, with a ring that fills)
  - **Dodge**
  - **Jump**
  - **Guard** (hold; a tap is a parry attempt)
- **Above the cluster:** small **Companion A / B** buttons with cooldown rings.
- **Golden Hour:** a gold button that only appears when Valor is full.
- **Near the hearts:** Milk button.
- **Contextual:** "!" Interact button.

**Touch assists, on by default and adjustable in settings**
- Tap an enemy to lock on, plus a "nearest target" button.
- Aim assist 90° / 4 m.
- Parry window +0.05 s.
- **Auto-combo:** repeated taps continue the chain without needing the timing window.
- Button size slider.

### 12.4 Accessibility and options
- Hold-to-charge can be switched to toggle-charge.
- Guard toggle.
- Mash prompts can become "hold".
- Camera shake 0–100%.
- Reduce flashes (caps the bloom spike, disables the full-screen flash).
- Telegraph colour-blind mode (shapes are always on; this adds patterns).
- Subtitles always on, with a size option.
- Invert Y and sensitivity (tech.md save settings).
- Slow-motion intensity.
- Remapping is a stretch feature.

---

## 13. Audio plan

All files are under `public/assets/audio/` (CC0, ASSETS.md). Format and crossfade follow tech.md §14.

### 13.1 Music by state

There are 14 tracks. The `AudioManager` crossfades with A/B buses.

| Context | Explore | Combat (≥ 1 alerted enemy) | Boss | Stinger on win |
|---|---|---|---|---|
| Title / opening C1 | `story_lament_warriors_soul.mp3` (title), then silence and wind for C1 | — | — | — |
| L1 Meadows | `field_of_dreams.mp3` | `battle_fast_fight_loop.ogg` | `battle_theme_a.mp3` | `victory_fanfare.mp3` |
| Hub | `village_town_theme.mp3`; market `village_bards_tale.mp3`; tavern `tavern_old_tower_inn.mp3`; castle `castle_kings_feast.mp3` | — | — | Festival: `festival_minstrel_dance.mp3` |
| L2 Whiskerwood | `field_of_dreams.mp3` (low-pass in deep woods); Hamlet `tavern_old_tower_inn.mp3`; tunnels `cave_theme.ogg` | `battle_fast_fight_loop.ogg` | `boss_epic_battle_loop.ogg` | fanfare |
| L3 Bogmire | `dark_forest_creepy.ogg` | `battle_fast_fight_loop.ogg` | `boss_epic_battle_loop.ogg` | fanfare |
| L4 Peaks | **gap**: reuse `field_of_dreams.mp3` (pitch 0.95, plus wind); caves `cave_theme.ogg` | `battle_fast_fight_loop.ogg` | `boss_epic_battle_loop.ogg` | fanfare |
| L5 Gate | prep phases: `story_lament_warriors_soul.mp3` (soft) | `battle_theme_a.mp3` | `boss_epic_battle_loop.ogg` | fanfare |
| L6 Flight | `battle_theme_a.mp3` (**gap**: a dedicated flight theme is a stretch) | same | same | fanfare |
| L7 Keep | `cave_theme.ogg` | `battle_fast_fight_loop.ogg` | `boss_epic_battle_loop.ogg`; P3 drops to wind and heartbeat | `victory_fanfare.mp3`, then C5 |
| Ending / credits | `story_lament_warriors_soul.mp3`, then `castle_kings_feast.mp3`, then `festival_minstrel_dance.mp3` | — | — | — |
| Trials results | `victory_8bit_loop.ogg` | — | — | — |

**Known music gaps**
- No snow or flight theme.
- No choir "holy" layer.
- No cute main theme (ASSETS.md caveat).
- **Mitigation for the holy layer:** Golden Hour adds a bright high-shelf boost on the music bus and a sustained zzfx shimmer pad.
- **Stretch:** download CC0 tracks for snow, flight and a main theme.

### 13.2 SFX mapping

| Gameplay event | File(s) | Notes |
|---|---|---|
| Swing light / heavy | `sword/swish_01…13` / `sword/swing*`, `blade_0*` | Random choice, pitch ±5%; heavy pitch 0.9 |
| Hit (fur) / hit (armour, shield) | `sword/sword_attack_*` / `impact/impactPlate_*`, `impact/impactMetal_*` | Chosen by target material |
| **Parry** | `sword/sword_clash_*` + `impact/metal_ringing` | Plus a sparkle shimmer from zzfx |
| Block | `impact/impactMetal_medium_*` | — |
| Dodge / cape | `impact/cloth`, `impact/cloth_heavy` | — |
| Footsteps | `footsteps/footstep_grass_*`, `stone_l/r*`, `footstep_wood_*`, `footstep_snow_*`, `sand_*` | Plus a **tiny armour jingle layer** (`impact/armor_light`, 25% volume) every second step |
| Jump / land | `impact/chainmail1/2` / `impact/impactSoft_medium_*` | — |
| Charge loop / tier reached | `magic/spell_01` (looped, pitch rises with charge) / `pickup/powerup_rise01`, `powerup_rise03` | — |
| Holy release / Golden Hour / Sunburst | `magic/spell_fire_03` + `impact/impactMetal_heavy_*` / `pickup/powerup_upper01` + `jingles/jingles_STEEL0*` / `magic/spell_fire_07` + `impact/impactPlate_heavy_*` | — |
| Swordcat voice: meow / hurt / last stand | `cat/kitten_mew_01`, `cat/meow_baby_01`, `cat/cat_softmew` / `cat/cute_creature_*` (pitch 1.2) / `cat/meow_synth_01` (slowed) | — |
| Milk sip | `pickup/bubble*` + `cat/cat_mewpurr` | — |
| Vigil Stone rest | `cat/cat_purrsleepy_loop` + `magic/magic1` (when lit) | — |
| Companions | `cat/cute_creature_01…10` (one per kitten as a "voice") | — |
| Rats | `creature/rat_squeak_attack`, `_pain`, `_death` | — |
| Crows / Crow Queen | `creature/c80_scream_*`, `c80_bug_*` (wings) **[closest available; tune]** | — |
| Moles | `creature/c80_grunt_*`, `c80_nose`, plus dirt from `impact/impactSoft_heavy_*` | — |
| Slimes | `creature/slime_*`, `rpg_slime*`, `creature_slime_*` | — |
| Toads | `creature/c80_burp_*`, `c80_burble_*`, `bubble_*` | — |
| Hyena jeer | `creature/c80_troll_*` (cackle) **[closest available; tune pitch up]** | — |
| Dogs / Grimjaw | `creature/c80_barking_01/02` (pitch 0.7 for Grimjaw), `rpg_giant*`, `rpg_ogre*`, `c80_howl` (Valor-Drain Howl) | — |
| Boneheads | `impact/impactWood_light_*` (bone clacks), `world/wood_hit_*` | — |
| Dragon | `creature/creature_roar_*` + `c80_roar_*` (pitch 0.7), fire `magic/spell_fire_*` | — |
| Snoring knights | `creature/c80_snore` | — |
| Pickups | Fish `pickup/coins_*`; Koi `pickup/gem_*`; Ribbon Scrap `pickup/powerup_rise05`; Golden Yarn `pickup/gem_04` + `jingles_NES0*` | — |
| Kitten rescued / quest done / level clear / Nap Time | `jingles/jingles_PIZZI0*` / `jingles_STEEL0*` / `victory_fanfare.mp3` / `jingles_SAX0*` (sad) | — |
| World | Cages `world/metal_open_01`; locks `world/lock_*`; crates `world/wood_breaking_*`; doors `world/door*`; ambience `world/loop_rain`, `loop_water_01` | — |
| UI | Hover `ui/select_*`; confirm `ui/confirmation_*`; back `ui/back_*`; menus `ui/bookOpen`, `bookClose`; Oath Tree `ui/bookFlip*`; typewriter `ui/tick_001` | — |
| **Wind ambience (gap)** | No wind file was downloaded. Generate filtered brown noise (Web Audio `AudioBufferSourceNode` + `BiquadFilter` with a slow LFO), or zzfx. | Critical for the C1 meme mood |

---

## 14. Visual direction (summary of art.md)

- **Look:** the world is desaturated, misty and low-contrast (grey-green). **The hero carries all the warm saturation** (ginger, pink, red, gold) and the highest contrast (polished steel).
- **Pink is reserved for heroes and the UI.**
- **Swordcat:**
  - procedural primitives with shell fur on the head, bib and tail
  - big glossy blue-grey eyes with two catchlights
  - satin pink bow
  - polished steel reflecting a custom overcast PMREM
  - verlet-cloth red cape
  - sword about her own height
  - idle pose "Vigil", charge and victory pose "Oath"
- **Holy:** ref1 = emissive blade, a light-streak billboard, a warm point light, an aura hull, gold sparkles and a bloom ramp, all driven by one `charge` value.
- **World:**
  - FogExp2 with height fog, plus mist cards
  - sky dome whose horizon matches the fog
  - hemisphere light plus a soft sun, blob contact shadows under every character
  - instanced wind grass that parts around her
  - dandelion fluff
  - post: bloom, vignette, subtle DOF in cutscenes.
- **Enemies:** chibi but menacing, with beady or angry eyes and cool palettes. **Every attack telegraphs.** Defeats are poofs.
- **Biome palettes and lighting** follow the art.md §12 table. The story's light goes misty, then golden hour, then storm, then sunrise.
- **Camera:**
  - exploration: distance 4.2, FOV 45, low heroic pitch
  - combat: 4.8
  - lock-on: 5.2, framing the midpoint, offset over her right shoulder
  - bosses: 6.5, overridable per arena
  - cutscenes: FOV 30–35 with DOF on the eyes.

---

## 15. Technical mapping (three.js r186, WebGLRenderer; tech.md architecture)

### 15.1 Feature → module → systems

| Feature | Owner (folder) | three.js / web systems | Events (tech.md catalog; **+** = requested addition) |
|---|---|---|---|
| Movement, jump, coyote and buffer, sprint, Scramble, splash respawn | `player/Player.js`, `PlayerStates.js`; `physics/Physics.moveActor` | Heightfield, StaticColliders, `Octree.capsuleIntersect`; climbable tag `userData.climbable`; safe-ground ring buffer | PLAYER_JUMP, PLAYER_LAND, FOOTSTEP |
| Combo, charge, Holy, Riposte, plunge | `player/` + `combat/attacks.js` + `Combat.updateSwing` (swept sector) | SwordTrail ribbon (preallocated `BufferGeometry`, `setDrawRange`); Holy look: `MeshPhysicalMaterial.emissiveIntensity`, streak `ShaderMaterial`, `PointLight`, `Points` sparkles, `UnrealBloomPass.strength` tween | PLAYER_SWING, PLAYER_CHARGE, PLAYER_HOLY, HIT |
| Projectiles (holyWave, bolts, bubbles, bone-merang) and **reflection** | `combat/Combat.js` projectile pool | Pooled meshes; swept-sphere tests; reflect = flip velocity and set `owner = player` | HIT, **+PROJECTILE_REFLECT** |
| **Guard, Parry, Nerve** | `combat/Combat.applyHit` pre-check: target guarding AND hit direction within ±60° of facing AND attack not unblockable means block; within the parry window means parry | Pure math (unit-testable) | HIT `{blocked:true}`, **+PLAYER_GUARD**, **+PLAYER_PARRY** `{attacker, perfect, position}` |
| Dodge i-frames, Purrfect Dodge | `player/` | `Loop.timeScale`; grade ShaderPass for desaturation (or the vignette pass uniform) | PLAYER_DODGE, **+PLAYER_PERFECT_DODGE** |
| Valor, Golden Hour, Sunburst | `player/Valor.js` (pure logic) | Aura hull (BackSide additive `ShaderMaterial`), fur `uHoly`, bloom | **+VALOR** `{value}`, **+GOLDEN_HOUR** `{on}` |
| Hitstop, shake, slow motion, rumble | `core/Game.requestHitstop`, `camera/CameraShake`, `Loop.timeScale`, `core/Input` (rumble) | `gamepad.vibrationActuator.playEffect('dual-rumble')` **[unverified outside Chromium]** | HITSTOP, SHAKE |
| **Telegraph decals** | `fx/Telegraphs.js` (pooled; started by enemies via the bus) | `PlaneGeometry` + `ShaderMaterial` (shapes: circle, lane, cone, ring, dotted line; `uFill` 0→1, `uColor`), `depthWrite:false`, `polygonOffset`, conforming y from `physics.heightAt`; glint = additive sprite at the weapon tip | **+TELEGRAPH** `{actor, kind, shape, pos, dir, size, duration}` |
| Enemy FSM, animation, tokens | `enemies/Enemy.js`, `enemies/types/*.js`, `combat/AttackTokens.js` | `AnimationMixer`, `SkeletonUtils.clone`, clip sub-ranges via `AnimationUtils.subclip` (windup and strike split); crow swarms as an `InstancedMesh` with a vertex-shader flap | ENEMY_SPAWNED, ENEMY_ALERTED, ENEMY_DIED |
| Bosses (phases, Dizzy meter, arena hooks) | `enemies/types/boss_*.js` (phase table data) | Fog density tween (Grimjaw P2); lights (Mole King P2); ballista = interactable + raycast aim | BOSS_PHASE, **+BOSS_DIZZY** |
| Companions | `companions/Companion.js`, `KittenModel.js`, `abilities.js` | Procedural `buildKitten(cfg)` (10 shells or the sheen fallback); NPC capes use vertex-shader sway | **+COMPANION_ABILITY** `{kittenId, ability, pos}`, **+COMPANION_SHAKEN**, KITTEN_RESCUED |
| Lives, Vigil Stones, Last Stand, milk | `player/` (Last Stand, milk), `core/GameState` (lives), `world/` (stone triggers), `save/` | — | CHECKPOINT, PLAYER_DIED, PLAYER_HEALED, **+LIFE_LOST** `{lives}`, **+LAST_STAND**, **+SIP** `{left}` |
| Levels, grass, fog, sky, props | `world/levels/*.js`, `Grass.js`, `Sky.js`, `Terrain.js` | Heightfield mesh, chunked `InstancedMesh` grass, `FogExp2` + height-fog `onBeforeCompile`, PMREM per biome, GLB props instanced when there are 10+ | LEVEL_* |
| Gate defence (L5) | `world/levels/gate.js` `update()` drives waves; `enemies` spawns | Siege tower on a path spline; Bastion scripted lane sweeps | **+WAVE** `{n,total}`, **+GATE** `{integrity}` |
| Dragon flight (L6, stretch) | `player/FlightController.js` (swapped in for the ground controller) | `CatmullRomCurve3.getPointAt/getTangentAt` corridor frame; `Dragon_Evolved.glb` + mixer | PLAYER_* reused |
| Cutscenes | `story/Cutscene.js` + `story/cutscenes/*.js` (data) | Camera rails (`CatmullRomCurve3`), FOV tween + `updateProjectionMatrix()`, `BokehPass` focus, CSS letterbox, actor pose and clip commands, `Loop.timeScale` | DIALOG_START, DIALOG_LINE, DIALOG_END, **+CUTSCENE** `{id,on}`, MUSIC |
| HUD and menus | `ui/hud.js`, `menus.js`, `dialog.js`, `touch.js` | DOM/CSS; world labels via `Vector3.project(camera)` | Listens to everything above |
| Audio | `audio/AudioManager.js`, `sfxDefs.js` | `THREE.Audio` / `PositionalAudio` pools, gain ramps, procedural wind (noise buffer + `BiquadFilterNode`) | MUSIC, plus reacts to all |
| Save | `save/SaveManager.js` | `localStorage` (try/catch) | SAVE_REQUEST, SAVE_LOADED |
| Photo mode (stretch) | `ui/` + `camera/` | `renderer.domElement.toBlob` right after a render | — |

**Requested event additions** (additive only, per tech.md §20): `player:guard`, `player:parry`, `player:perfectDodge`, `player:valor`, `player:goldenHour`, `player:lifeLost`, `player:lastStand`, `player:sip`, `combat:telegraph`, `combat:reflect`, `boss:dizzy`, `companion:ability`, `companion:shaken`, `story:cutscene`, `level:wave`, `level:gate`, `state:rank`.

**Requested `GameState` / save fields:** `lives`, `valor`, `milk {cur,max}`, `fish`, `xp`, `rank`, `pawPoints`, `oath:{B1..K6}`, `charms[]`, `sharpen`, `armor`, `kittensRescued[]`, `companions {owned[], party[2]}`, `yarns{levelId:[...]}`, `ribbonScraps`, `skins`, `capes`, `difficulty`, `medals{}`.

### 15.2 Data formats (examples)

```js
// combat/attacks.js — player entries (enemy entries share the format; dmg = target units)
export const ATTACKS = {
  slash1:  { dur: 0.36, active: [0.08, 0.16], arc: { range: 1.9, from:  1.2, to: -1.2, y0: 0, y1: 1.4 }, dmg: 10, knock: 4,  poise: 1, hitstop: 0.05, shake: 0.12, lunge: 2.5, combo: [0.14, 0.36], next: 'slash2', valor: 3 },
  slash2:  { dur: 0.36, active: [0.08, 0.16], arc: { range: 1.9, from: -1.2, to:  1.2, y0: 0, y1: 1.4 }, dmg: 10, knock: 4,  poise: 1, hitstop: 0.05, shake: 0.12, lunge: 2.5, combo: [0.14, 0.36], next: 'slash3', delayed: { window: [0.36, 0.70], next: 'whirl' }, valor: 3 },
  slash3:  { dur: 0.62, active: [0.22, 0.30], arc: { range: 2.2, from:  0.5, to: -0.5, y0: 0, y1: 1.6 }, dmg: 22, knock: 9,  poise: 3, hitstop: 0.09, shake: 0.35, lunge: 4.0, hyperArmor: [0.12, 0.30], ring: { r: 1.0, dmg: 8 }, breaks: ['shield','cracked','bristle'], valor: 6 },
  whirl:   { dur: 0.70, active: [0.18, 0.46], arc: { range: 2.0, from: Math.PI, to: -Math.PI * 3, y0: 0, y1: 1.2 }, hits: 2, dmg: 8, knock: 6, poise: 1, hitstop: 0.04, shake: 0.2, lunge: 1.0, valor: 3 },
  bright:  { dur: 0.55, active: [0.14, 0.26], arc: { range: 2.6, from:  1.6, to: -1.6, y0: 0, y1: 1.6 }, dmg: 28, knock: 10, poise: 4, hitstop: 0.10, shake: 0.4, lunge: 3.0, breaks: ['shield','cracked','bristle'], popsSlime: true, valor: 6 },
  holy:    { dur: 0.85, active: [0.22, 0.36], arc: { range: 3.0, from: Math.PI, to: -Math.PI, y0: 0, y1: 2.5 }, dmg: 45, knock: 14, poise: 99, hitstop: 0.14, shake: 0.6, projectile: 'holyWave', cost: 50, timeScale: [0.35, 0.25] },
  riposte: { dur: 0.50, active: [0.10, 0.20], arc: { range: 2.4, from: 0.3, to: -0.3, y0: 0, y1: 1.4 }, dmg: 18, crit: 2, knock: 10, poise: 4, hitstop: 0.12, shake: 0.35, lunge: 5.0, valor: 8 },
  // zoomies, plunge, gleam, sunburst, holyWave: values from §4.3
  rat_poke:{ dur: 0.72, active: [0.00, 0.12], arc: { range: 2.0, from: 0.25, to: -0.25, y0: 0, y1: 1.0 }, dmg: 1, knock: 3, poise: 1, hitstop: 0.07, shake: 0.2, telegraph: 'parry' },
};
```

```js
// enemies/types/rat_pikeman.js
export default {
  id: 'rat_pikeman', model: 'models/creatures/polypizza/Rat.glb', targetHeight: 0.9,
  anims: { idle: 'Rat_Idle', patrol: 'Rat_Walk', chase: 'Rat_Run', die: 'Rat_Death',
           windup: { clip: 'Rat_Attack', from: 0, to: 0.4, speed: 0.35 }, strike: { clip: 'Rat_Attack', from: 0.4, to: 1, speed: 1.5 } },
  hp: 30, poise: 2, mass: 0.8, radius: 0.35, height: 0.9,
  walk: 1.6, run: 3.8, sight: 12, fov: 2.44, leash: 22, patrolRadius: 5,
  attack: 'rat_poke', attackRange: 1.9, windup: 0.5, recover: 0.6,
  fleeAt: 0.2, xp: 6, fish: [3, 6], snack: 0.08, actIII: { hpMul: 1.6, dmg: 2 },
};
```

```js
// enemies/types/boss_rat_captain.js (phase table)
phases: [
  { at: 1.00, moves: ['beetleCharge', 'saddleSabre', 'cheeseToss'], weights: [3, 2, 2], mounted: true },
  { at: 0.60, cutscene: 'beetle_flees', moves: ['squeakyCombo', 'shieldUp', 'cheeseToss'], adds: [{ at: 0.5, spawn: ['rat_pikeman','rat_pikeman','rat_crossbow'] }, { at: 0.3, spawn: ['rat_pikeman','rat_pikeman','rat_crossbow'] }] },
  { at: 0.25, moves: ['squeakyCombo', 'cheeseBombs', 'snack'], windupMul: 0.8 },
],
dizzy: { max: 100, decayDelay: 2, decay: 8, duration: 3 },
```

```js
// story/cutscenes/opening_stand.js (positions in the anchor actor's local frame)
export default { id: 'opening_stand', anchor: 'player', skippable: true, letterbox: true, steps: [
  { t: 0,  fade: [1, 0, 1.5], cam: { pos: [0, 0.62, 1.15], look: [0, 0.70, 0], fov: 32, focus: 1.15 }, actor: { id: 'player', pose: 'oath' }, env: { wind: 1.4, fog: 0.05 }, music: null },
  { t: 4,  camMove: { to: [0, 0.9, 3.0], look: [0, 0.75, 0], dur: 5, ease: 'inOutSine' }, caption: 'Meow Isle. The ninth winter of the Great Drowse.' },
  { t: 9,  cam: { pos: [-6, 3.5, 8], look: [0, 0.5, -6], fov: 40 }, sfx3d: [{ id: 'c80_snore', at: 'knight_*' }], line: { speaker: 'marmalade_vo', text: 'When the Dawn Lantern was stolen, the fog came...' } },
  // ... shots 4–7 per §3.4
  { t: 36, blendToGameplay: 1.2, hud: true, tutorial: 'move' },
] };
```

### 15.3 Performance notes
- **Skinned meshes:** at most 12 on screen. Crowds (the C3 horde, the murder spiral) use low-LOD **instanced** meshes with vertex animation instead of mixers.
- **Transmission slimes:** at most 6 on screen; the fallback is opacity with a fresnel rim (art.md §14).
- **Telegraph decals:** one pooled `InstancedMesh` per shape, about 32 instances. Particles are pooled at no more than 2,000.
- **Fog-heavy arenas** (Bogmire, Grimjaw P2) let `camera.far` drop to about 60 m.
- **Grass:** 15–30k blades on the desktop iGPU, 4k on mobile (tech.md §18).
- **Boss arena build:** call `renderer.compileAsync` at level load so phase changes cause no shader hitch (tech.md §12).

### 15.4 Tests to add (node --test; pure modules)
- Parry and block resolution: window edges at 0.149 s and 0.151 s, angle edges, unblockable.
- The Valor economy: gains, costs, Golden Hour lock.
- Lives, Last Stand and checkpoint banking.
- Sharpness multiplier and crit cap ×2.5.
- AttackTokens per difficulty.
- Boss phase thresholds firing exactly once.
- Bonehead reassemble timer and scatter.
- The smoke test drives one combo, a parry against a scripted rat and a Holy Slash, then screenshots the Holy state.

---

## 16. MVP vs stretch

### MVP (vertical slice, about 60–75 min, playable end to end)
- **Core kit:**
  - movement and jump (no Cat Leap or Scramble)
  - lock-on
  - the 3-hit combo plus Whisker Whirl
  - Pounce Plunge, Zoomies Thrust
  - dodge with Purrfect Dodge
  - **Guard, Parry, Riposte**
  - charge, Bright and **Holy Slash**
  - Valor
  - **Golden Hour** (simple: glow, +60% damage, Sunburst)
  - hearts, Milk, **Nine Lives**, Vigil Stones, Holding It Anyway
- **Levels:**
  - **L1 Meadows** (complete, with the Rat Captain)
  - **Hub Pawsbury lite** (Blacksmith with Sharpen T1–T3, Dairy, Sir Marmalade, map)
  - **L5 Last Gate** (2 waves plus the Hyena duo; Bastion reveal)
  - **L6 as a cutscene**
  - **L7 Keep lite** (courtyard, kennels with 3 kittens, rooftop Grimjaw with all 3 phases)
- **Enemies (7):** Rat Pikeman, Rat Crossbowman, Crow Raider, Hyena Jeerer, Pug Brute, Warhound, Bonehead.
- **Bosses (3):** Rat Captain, Hater & Post Stealer, Grimjaw.
- **Companions (2):** Mochi (L1) and Clover (rescued in L5 wave 1). One slot in L1, two from L5.
- **Cutscenes:** C1 Opening Stand, C2 Milk Break, C3 horde, C4 champion and Bastion, C5 ending (credits flight on a fixed spline).
- **Progression:**
  - fish
  - Sharpen T1–T3, Milk +1/+2
  - Knight Rank 1–5
  - Oath Tree tiers 1–2 of every branch (6 nodes)
  - 3 sword skins (Borrowed Blade, Practice Stick, Gilded Hour)
  - 2 capes (Red, Meme White)
- **UI:** full HUD, title, pause, Oath Tree, shop, results, Nap Time.
- **Controls:** keyboard and mouse, gamepad, touch, plus the accessibility toggles in §12.4.
- **Audio:** the full mapping in §13 for the MVP levels, plus procedural wind.

### Stretch (priority order)
1. **L2 Whiskerwood** with Mole King, Sage and Clover's proper intro, and Cat Leap.
2. **L3 Bogmire** with Slime Sovereign, Earl Grey, and the second companion slot moved to its story position.
3. **L4 Frostwhisker** with Crow Queen, Pip, Scramble, the Avalanche Run and Ember's freeing.
4. **L6 flight level** with Sir Snarl.
5. **Trials of the Dawnwatch** (9 challenges) and the full Oath Tree (18 nodes), charms and all skins and capes.
6. **Kinship Links** (companion combos).
7. **Photo Mode / Meme Cam** with share-image export.
8. **Local co-op:** Pearl as player 2, split keyboard or a second gamepad (**[unverified effort]**).
9. Festival mini-games, the Moonlit Abbey postgame, Nine Lives campaign mode.
10. Dedicated music (snow, flight, main theme, choir holy layer) from extra CC0 downloads.
11. Input remapping, achievements, a daily Trials seed (`?seed=` is already supported by tech.md).

---

## 17. Open questions and unverified items

**Assets**
- Bone names for attaching props to `Rat.glb`, `Pigeon.glb`, `Wolf.glb`, `Barbarian.glb` and `Knight.glb` (the head and hand bones) are **[unverified]**. Only `handslot.r` / `handslot.l` on KayKit rigs are verified (ASSETS.md).
- The native scale of each GLB is **[unverified]**. Each enemy def specifies a `targetHeight` and the loader normalises from the bounding box.
- The suitability of `c80_troll_*` as a hyena cackle and of `c80_scream_*` for crows is untested by ear.

**Legal and IP** (trend.md, ASSETS.md caveats)
- The Swordcat design's copyright is unverified.
- The phrases "Too small for the sword. Holding it anyway." and "The armor is borrowed. The hour is gold." come from swordcat.lol copy.
- The hyena "HATER" / "POST STEALER" scene and the milk-selfie scene homage @sickmanai clips.
- The gate-defence scenario is *inspired by* the trend's "hold the gate" content, including the fan series *The Last Vigil*. The story here is original: different premise, names and order.
- **No crypto or token content appears in the game.** All of this needs a legal pass before any public release.

**Story**
- Names (Clementine, the Dawnwatch, the Great Drowse, every NPC) are proposals, and the story-angle doc may override them.
- Pearl as a sister rests on an interpretation of ref3 (art.md).

**Balance**
- Every number here is a first-pass target for the Phase 2 integrator (tech.md §20). The first tuning priorities are:
  - parry window feel at 60 Hz
  - charge timings
  - boss HP versus real hit rates
  - the fish budget.
