# SWORDCAT: Nine Lives of Meow Island
## Game Design Document — Shippable-Scope Edition

Version 1.0 · 2026-10-07 · Inputs: `research/trend.md`, `research/art.md`, `research/tech.md`, `public/assets/ASSETS.md`

**Tags used in this document**
- **[MVP]** must ship. **[MVP+]** first addition once the MVP is green. **[STRETCH]** only after MVP+.
- **[TREND]** a fact from `trend.md`, sourced there. **[REF]** seen in the reference images.
- **[verified]** I checked it in the asset files on 2026-10-07: file exists, mesh or bone name, clip name from ASSETS.md.
- **[unverified]** an assumption that nobody has checked yet.
- Every gameplay number is a **starting value for tuning**. None has been playtested.

**How conflicts with the other docs are resolved.** This doc wins on gameplay. `art.md` wins on look. `tech.md` wins on architecture.

| Topic | Resolution |
|---|---|
| Units | 1 unit = 1 m = Swordcat's height. Art's "H" and tech's "1 m" agree. |
| Head ratio | 38–40% of height (art.md, measured). This replaces tech.md's "~45%". |
| Damage scale | A player slash does 10 damage. The tech.md §9.1 placeholders (1/1/2/5) are replaced by Appendix A. |
| Camera | 3.6 m default, 4.5 m when locked on, 6.0 m in boss fights, FOV 45. Art proposed 3.4 m and tech 4.5 m. |
| Level ids | `meadow, forest, town, mossgate, bog, keep` (plus `sky` as stretch). These replace tech.md's `meadow/forest/village/castle` in the smoke test. |
| art.md items with no model | Beetle mount, Molegrim, Bramblehog, Toad Hexer, Ermine, Mole King, Crow Queen and Frostwhisker Peaks are cut or moved to stretch. Each would be a full procedural build, and none has a matching downloaded model. |
| Fonts | art.md asks for IM Fell English, which was **not** downloaded. Use the downloaded Uncial Antiqua for lore text instead. |

---

## 0. Scope at a glance

| Item | MVP | MVP+ / Stretch |
|---|---|---|
| Playable characters | 1 (Swordcat) | — |
| Levels | **6**, one of which becomes the hub town | L7 "Skyfight" dragon-riding level [STRETCH] |
| First-clear playtime | 60–90 min | — |
| Combat companions | **3** (Mochi, Sage, Clover), 1 active at a time | 2 active at once; Pip and Earl Grey as companions [STRETCH] |
| Other kittens | 5 service NPCs, the mentor, the Queen, randomized villagers | Interiors [STRETCH] |
| Enemy types | **8** | +3: Husky Brute, Cellar Bat, Hornet Lancer [MVP+] |
| Bosses | **3** multi-phase | +1: Slime Sovereign [MVP+]; Sky-Captain [STRETCH] |
| Cutscenes | **10**, in-engine and skippable: the CS-00 title loop plus CS-01 to CS-09 | Meme Cam [MVP+], Photo Mode [STRETCH] |
| Collectibles | Fish (currency), 30 Golden Fish, 3 Heart Bells, Milk Bottles | — |
| Progression | 8 shop upgrades, 7 sword skins, 6 capes, 3 holy unlocks tied to the story | Knight-rank badges [STRETCH] |
| Music | 11 of the 14 downloaded tracks | — |
| Platforms | Desktop Chrome/Edge/Firefox with keyboard+mouse and gamepad; touch controls [MVP] | Mobile performance is [unverified] |

**Not building.**
- XP, stats or character levels.
- An inventory beyond Milk and keys.
- Open-world streaming, or interiors other than the keep's cellars.
- Voice acting: mews and text only.
- Branching dialogue.
- Multiplayer.
- **Anything crypto**: no token or wallet features and no crypto branding.
- A physics engine or a navmesh.
- More than 1 save slot.

**Scope rules for every agent.**
1. **Reuse before you build.**
   - One procedural `buildKitten(cfg)` makes every cat, Swordcat included.
   - One `buildBeastHead(cfg)` turns the KayKit humanoid rig into hyenas, pugs and the Dog Warlord.
   - One procedural slime covers 3 sizes and the boss.
2. **One arena template.** Every arena runs: enter trigger → fog wall → waves → clear → open.
3. **One level format.** Every level is a *spine path plus zones* in data (§15.3). No hand-sculpted terrain.
4. **One boss model.** Every boss is a phase table, driven by HP thresholds, on the shared Enemy FSM.
5. **One authority for numbers.** They come from `config.js` tables (Appendix A), never from hard-coded literals.

---

## 1. Title, logline, pillars

- **Title:** **SWORDCAT: Nine Lives of Meow Island** (working). "Meow Island" nods to the creator's bio line "Protecting meow island with 9 lives" [TREND]. It lives in one string constant so it can be renamed.
- **Logline:** *The sword is taller than she is. She isn't putting it down.* The Dog Warlord steals the Dawnstone and fog swallows Meow Island. The smallest squire of the Order of Nine Lives straps on borrowed armor to free her eight captured fellow knights and bring back the sunrise.
- **Genre:** 3D third-person action-adventure: linear levels with arena fights and a hub town, in the browser on three.js.
- **Tone:** all ages; cute, earnest and cinematic. The meme's joke is contrast played completely straight: a soft kitten posing seriously as a hardened knight. She never winks at the camera [TREND].

**Pillars**
1. **Small but ready.** She is the smallest thing on screen in every shot. Low camera angles and reveal pull-backs sell the scale.
2. **Stand your ground.** The guard and parry verb, *Stand*, is literally the meme pose: sword planted, cape billowing [TREND V1].
3. **Fog to gold.** The world starts as the grey-green mist of the refs and ends in golden sunrise. Her holy glow is the only warm light in cold places [REF ref1].
4. **Kind victories.** No gore. Defeated enemies poof into sparkles, run away or surrender.

---

## 2. World and setting

- **Meow Island** is a tiny cat kingdom in a misty northern sea, built at kitten scale: doors are 1.6 m and cottages 3–5 m, per art.md §1.
  - Its capital is **Pawsbury**, a timber-frame town under a small castle.
  - Exactly one human lives there: **Sir Galahug**, a gentle giant knight who washed ashore years ago and now serves the Queen as "Royal Lap".
- **The Sunbell.** It hangs in Pawsbury Castle's tower and holds the **Dawnstone**. Each dawn the bell rings and the sun burns off the sea fog.
  - When the stone is stolen, the fog stays. That gives us the grey-green look of every reference image, and fog creatures (Gloomjellies, Bramble Spiders) thrive.
- **The Order of Nine Lives** is the island's knighthood. It has nine seats.
  - Eight are held by knights. The ninth is "always kept for whoever shows up".
  - Swordcat is the squire who sweeps the armory.
- **The enemy factions**
  - **The Hound Legion:** Lord Barkus Grimjaw's army from the Isle of Woof. Pug shieldbearers, husky brutes, and crows as scouts.
  - **The Snickerpack:** hyena mercenaries whose armor is scrawled with insults like **"HATER"** and **"POST STEALER"** [TREND V2]. They laugh at everything.
  - **The Rat Militia:** hired with cheese.
  - **Fog wildlife:** Gloomjelly slimes and Bramble Spiders, which come out when the sun is gone. They belong to no faction.
- **Why Barkus did it.** Every dawn the sunbeam falls on the castle steps, and the cats nap there. Barkus was shooed off those warm steps as a pup. His logic: "If dogs can't have the sun, nobody can." The ending resolves this kindly (§3.4, CS-09).

| Region (level) | Mood |
|---|---|
| Purrdale Meadows (L1) | The exact ref look: grey-green misty fields, standing stones, a windmill |
| Whiskerwood (L2) | A giant mossy forest, kitten-scale mushrooms, fireflies, a rat camp |
| Pawsbury (L3, then hub) | Golden-hour town in fog, lanterns, market square, the dark Sunbell |
| Mossgate (L4) | A stone causeway into a fog bank, an old gatehouse, siege wrecks |
| Bogmire (L5) | A marsh with boardwalks, lily pads and will-o'-wisps |
| Houndhold Keep (L6) | A storm-dark cliff fortress with braziers and red banners |

---

## 3. Story

### 3.1 Premise
The Hound Legion lands in the night. Barkus tears the Dawnstone out of the Sunbell and splits it into **three shards**:
- one for **Rat Captain Grizzlechop**,
- one for **Warchief Snickerfang** of the hyenas,
- one he keeps on his own collar.

His mercenaries carry off the eight knights of the Order in cages. The squire slept through it, inside a helmet.

Sir Marmalade, the old mentor whose back is too bad to fight, gives her his own boyhood armor. It is *borrowed*, and it is too big. She can barely lift the sword. She goes anyway.

**Each shard she recovers sinks into her sword.** That is the story reason for her holy power, and it is also the progression system (§9.3).

### 3.2 Cast

| Character | Who | Role |
|---|---|---|
| **Swordcat** | Fluffy ginger/cream squire with a pink bow, borrowed plate and a longsword taller than she is | Player (§4) |
| **Sir Marmalade** | Chonky old orange tabby knight: grey muzzle, eyepatch, dented rusty plate | Mentor: tutorial, story exposition, hub |
| **Mochi, Sage, Clover** | Captured knights of the Order | Combat companions (§5) |
| **Nutmeg, Tofu, Pip, Earl Grey, Pearl** | Captured knights of the Order | Hub service NPCs (§5). Pearl is Swordcat's sister. |
| **Ember** | A young red dragon, huge to her but still a kid | Friend: cutscenes and set pieces |
| **Sir Galahug** | The island's only human, a 3.2 m gentle giant knight | Ally in L4 and in the ending |
| **Queen Snowpaw** | White angora queen with odd eyes and a small crown | Knights Swordcat in the ending |
| **Rat Captain Grizzlechop** | Pompous rat with a feathered hat and a cheese-wheel shield | Boss 1 |
| **Warchief Snickerfang** | The loudest hyena, wearing a "HATER-IN-CHIEF" plate | Boss 2 |
| **Lord Barkus Grimjaw** | The Dog Warlord: bulldog with jowls and an underbite, black iron plate, red trim, a huge cleaver | Final boss |

### 3.3 Acts and level beats

| Act | Level | Story beat | Ends with |
|---|---|---|---|
| **I. The Fog Comes** | L1 Purrdale Meadows | Prologue (CS-01). She gets the borrowed armor and names herself (CS-02). Training. A milk break is interrupted by Ember roaring out of the fog; he is tangled in a hound net, and she frees him (CS-03). She rescues **Mochi** from a rat cart at the Old Bridge. | Mochi joins. Road to the forest. |
| | L2 Whiskerwood | She follows the rat supply trail, frees **Sage** from a treetop cage, and storms the Cheese Mill. | **Boss 1: Rat Captain** yields. Shard 1 goes into the sword and the first glow appears (CS-04). **Holy Slash** unlocked. |
| **II. Hold the Line** | L3 Pawsbury | She liberates the occupied town: Post Stealers loot the bakery and pugs hold the square. She rescues **Nutmeg, Tofu and Clover**. Marmalade at the dark Sunbell: "The second shard is with the hyenas at Mossgate." | The town becomes the **hub**: shops open and Clover joins. |
| | L4 Mossgate | **Pip and Earl Grey** are rescued and start repairing the jammed gate winch. Swordcat holds the causeway alone against the hyena horde coming out of the fog [TREND V2]. Pull-back reveal: Sir Galahug standing beside her [TREND V5] (CS-05). | **Boss 2: Warchief Snickerfang.** Shard 2: **Holy Wave**, plus reflecting projectiles with a Perfect Stand. |
| **III. The Last Light** | L5 Bogmire | Across the marsh to the hound smugglers' landing. **Pearl** is rescued, and she re-ties Swordcat's crooked bow (CS-06). Ember arrives to carry them north. | Elite slime wave [MVP], or **Slime Sovereign** [MVP+]. |
| | L6 Houndhold Keep | Ember burns the gate (CS-07). Courtyard, kennel cellars, ramparts, then the bell-tower roof. | **Final boss: Lord Barkus.** The "Nine Lives" rally (CS-08), then the ending (CS-09). |

### 3.4 Cutscenes: in-engine scripted sequences

Every cutscene is a data list of steps run by `StoryManager` (DSL in Appendix B):
- Camera moves along `CatmullRomCurve3` paths at FOV 30–35.
- CSS letterbox bars and speech bubbles in the parchment dialog box.
- **Hold Esc or Start for 1 s to skip.**
- Total MVP runtime is about 5 minutes.

**CS-00 Title loop [MVP], 3.8 s, loops.** This is the meme framing [TREND V1].
- Medium close-up from the chest up, low static camera.
- Sword held vertically in front of her face (the "Oath" pose). Cape billowing to the left, fog drifting.
- Every second loop, the blade glow and sparkles pulse (the ref1 look).
- The "SWORDCAT" logo fades in, with a pink bow tied on the "O" (art §13).
- "Press any key" also unlocks audio.

**CS-01 "The Grey Morning" [MVP], about 55 s.** Music: `story_lament_warriors_soul`.
1. **5 s.** Pawsbury at golden dawn. Crane up the Sunbell tower; the bell rings and light washes the fog away. Caption: *"Every dawn, the Sunbell rang, and the fog went home."*
2. **6 s.** Dolly along eight armored kittens lined up in the courtyard. At the end of the line is a tiny kitten in an oversized pot helmet, holding a broom. Caption: *"Eight knights. And one squire, sweeping."*
3. **6 s.** Night. Torches and red hound banners move through the fog on the shore, with barking. No ships are needed; the silhouettes are enough.
4. **6 s.** Bell tower. A huge dog silhouette rips out the glowing Dawnstone and the bell goes dark. Fog density animates from 0.02 to 0.06.
5. **6 s.** Rats carry cages away into the fog. Each kitten mews.
6. **4 s.** The armory: the squire asleep inside a helmet, snoring (`c80_snore`).

**CS-02 "Borrowed Armor" [MVP], about 40 s.**
1. Marmalade wakes her (dialogue, §3.5).
2. Armor-up montage in three quick cuts: a pauldron clanks, the cape is tied, she straightens her own bow.
3. She lifts the sword. It is taller than she is, and she topples over. She gets up and plants it in the Vigil pose. The camera drops into the meme framing for 2 s.
4. Marmalade: "Name for the ledger?" She looks at the sword, then down at herself: "…Swordcat." The title card appears and control is handed to the player.

**CS-03 "Milk Break" [MVP], L1 glade, about 18 s** [TREND V3]. It triggers when she interacts with the picnic hay bale.
1. A selfie camera: handheld noise, FOV 60, close. She sips milk through a straw (bubble SFX) and flicks an ear happily.
2. The ground trembles (shake 0.2). She freezes mid-sip.
3. Whip-pan: camera yaw 120° in 0.25 s plus a bloom spike. The camera "falls" by rolling 90° and dropping to grass height, sideways. The milk cup rolls into the foreground.
4. Ember emerges from the fog roaring straight into the lens: roar SFX, shake 0.7, jaws filling the frame. Hold 1.2 s.
5. Cut to gameplay. Ember is tangled in a hound net. Objective: **"Cut the net ropes (0/3)"**.

After she frees him, Ember sniffs her and purrs (`cat_purractive_loop` at rate 0.6). He nods using the `Yes` clip, drops a Golden Fish and flies away.

**CS-04 "First Light" [MVP], L2 end, about 12 s.** Grizzlechop yields and the shard floats up. She raises the sword and the shard sinks into the blade:
- the blade's emissive ramps from 0 to 2,
- sparkles appear,
- local fog thins around her.

Toast: "Holy Slash learned: hold ⚔".

**CS-05 "The Stand" [MVP], L4 at wave 4, about 25 s** [TREND V2, V5].
1. A low reverse shot from behind her, cape billowing. The music cuts to wind only. The horde charges out of the fog: 40 instanced silhouettes plus 6 real hyenas, laughing.
2. Front close-up. She plants the sword (Vigil, then Oath), her ears flatten for one beat, and the blade starts to glow.
3. The camera pulls back over 4 s from the close-up to reveal **Sir Galahug** standing beside her in the same pose, three times her height. `battle_theme_a` hits.
4. Galahug: "Mind if I stand here too, little sir?" Swordcat: "Dame." Galahug: "Dame. Beg pardon."
5. The front of the horde skids to a halt, and some background hyenas flee, laughing nervously. Wave 4 starts with Galahug as a scripted ally.

**CS-06 "The Bow" [MVP], L5, about 20 s.** Music: `story_lament`. Pearl is freed from a crate and straightens Swordcat's crooked bow (dialogue). Ember lands and the two climb on. Fade out.

**CS-07 "Dragonfire Gate" [MVP], L6 start, about 12 s.**
1. Ember flies over the keep gate and breathes fire: particles, an orange light and bloom.
2. The gate model is hidden and swapped for debris.
3. Ember lands on a tower and growls; the hound guards scatter.

**CS-08 "Nine Lives" [MVP], L6 boss at 10% HP, about 20 s.**
1. Barkus knocks her down; no damage is applied. Her sword lands upright in the stone 3 m away. Barkus: "Stay down, little thing."
2. Close-up: she gets up anyway.
3. The **eight rescued kittens** appear on the ramparts with lanterns and each calls out (`cute_creature_*` chirps).
4. Streams of light run from the lanterns into the sword, giving the full ref1 golden glow.
5. Gameplay resumes in **Golden Hour** (§7, B3).

**CS-09 "Golden Hour" ending [MVP], about 90 s, plus an optional flight [MVP+].**
1. **The final Holy Slash.** A white-gold flash at timescale 0.2.
   - The storm clouds part and a god-ray shaft lands on the tower.
   - Fog density goes from 0.05 to 0.008 and the palette lerps to gold.
2. **The sunbeam.** Barkus, dazed, sits down in the sunbeam (`Sit_Floor_Down`, then `Sit_Floor_Idle`).
   - He: "Every morning the bell rang… and every morning, the cats got the sunny steps."
   - She sits down beside him. Silence. He: "…It *is* warm."
3. **The bell.** Cut to Pawsbury. The Dawnstone goes back into the Sunbell, the bell rings, and the fog leaves the island in one rolling wave.
4. **The flight.** Ember carries her over a **sea of clouds at sunrise** [TREND V6 idea; a generic trope, our own staging].
   - [MVP+]: she can steer inside a box and collect 20 golden rings. There is no fail state.
5. **The knighting.** In the courtyard, Queen Snowpaw: "Kneel, squire. …Lower. …Actually, that's fine. Rise, **Dame Swordcat of the Ninth Seat**." The ceremonial cape is too long; she trips, gets up and takes the Vigil pose. Cheers and `festival_minstrel_dance`.
6. **Final shot.** The meme framing in golden light, the sword lit from within, then the logo. Credits roll over the Pawsbury festival.
7. **Post-credits.** Barkus naps on the sunny steps with three kittens asleep on top of him.

### 3.5 Dialogue samples

All lines are original. Swordcat speaks rarely and briefly, and always sincerely.

| Speaker | Line | When |
|---|---|---|
| Sir Marmalade | "Up, squire. The Order's gone and the fog's in the soup." | CS-02 |
| Sir Marmalade | "That armor was mine when I was a squire. Didn't fit me either." | CS-02 |
| Swordcat | "…It's fine. I'll grow." | Lifting the sword |
| Sir Marmalade | "Knees, girl. Bend the knees. The tail is for balance, not for swishing at butterflies." | Tutorial |
| Sir Marmalade | "Hold your ground and let them come to you. That's the whole trick. The rest is footwork." | Teaching Stand |
| Sir Marmalade | "The Order always keeps a seat for the ninth. Never said the ninth had to be big." | Hub, after L4 |
| Swordcat | "Small paws. Big sword. Still standing." | Arena clear bark |
| Swordcat | "Not strong yet. Still here." | Respawn bark |
| Swordcat | "You're free. Stay behind me." | Every rescue. It's funny because every rescued knight is bigger than her. |
| Swordcat | "Hold." | Starting a Stand (25% chance) |
| Mochi | "I'll do the shield. You do the… pointy part." | Joins |
| Sage | "Three on the left. Two on the ridge. One… eating a sandwich?" | Scouting bark |
| Clover | "Hold still. This purr is medicinal." | Heal ability |
| Nutmeg | "Milk! Fresh milk! Straws are extra. Kidding. Straws are free." | Shop |
| Tofu | "Sharpen it? I can barely *lift* it." | Forge |
| Pip | "Found your fish! …I'm keeping one." | Lookout |
| Earl Grey | "Fascinating. The shard resonates with your blade. Or you're vibrating. Kittens do that." | Library |
| Pearl | "Hold still, Apricot. Your bow's crooked. You can't save an island with a crooked bow." | CS-06. Apricot is her birth name; only Pearl uses it. |
| Grizzlechop | "Charge! …I said CHARGE! Why is nobody charging?" | Boss 1, phase 2 |
| Grizzlechop | "I yield! I yield! Take the shiny rock!" | Boss 1 defeat |
| Hyena Raider | "Hah! Look at it! A kitten with a butter knife!" | Alert bark |
| Post Stealer | "Finders keepers! These are MY fish now!" | After a steal |
| Snickerfang | "Every army needs a laugh. Today, little knight, it's you!" | Boss 2 intro |
| Galahug | "Mind if I stand here too, little sir?" / "Dame. Beg pardon." | CS-05 |
| Barkus | "No cats. On the sunny. Steps." | Boss 3 intro |
| Barkus | "Stay down, little thing." | CS-08 |
| Barkus | "…It *is* warm." | CS-09 |
| Queen Snowpaw | "Rise, Dame Swordcat of the Ninth Seat." | CS-09 |

**Writing rules**
- Swordcat never jokes, and none of her lines exceeds 8 words.
- Villains are comedic but never cruel.
- No internet-slang walls of text. At most one meme wink per level, such as the "POST STEALER" armor.
- The community catchphrases listed in trend.md §4 ("Too small for the sword. Holding it anyway.", "The armor is borrowed…") are **third-party text from token sites**. They are **not** shipped verbatim; we use the original paraphrases above (see Risk R11).

---

## 4. Swordcat: the main character

**Name.** "Swordcat" is the knightly name she gives herself in CS-02. Her birth name, Apricot, is used only by Pearl.

**Personality**
- Earnest and polite. She takes everything completely seriously.
- Afraid but standing anyway. Her tell is that her ears flatten for one beat before she plants the sword.
- Protective of everyone, even though everyone is bigger than her.
- Loves milk and naps. Never winks at the camera.
- Her default expression is wide-eyed and slightly worried [TREND V1].

**Look.** Follows art.md §2 exactly [REF ref2]:
- fluffy ginger/cream long-haired fur with blue-grey eyes;
- a **pink bow on her left ear**, which is never removable;
- polished silver plate: four-lame pauldrons, gauntlets, tassets, greaves;
- a leather belt and a red cape (cream as an option);
- a longsword about 1.0 m long, roughly her own height.

Her idle pose is **Vigil** (sword planted point-down, paws on the pommel). Her charge and victory pose is **Oath** (sword vertical in front of her face).

### 4.1 Moveset

Timings are in seconds and distances in metres. Damage is before upgrades and difficulty modifiers. The capsule is r = 0.32, h = 1.0 (tech.md §2).

| Move | Input (keyboard+mouse) | Numbers |
|---|---|---|
| **Walk** | Stick below 0.5 | 2.2 m/s |
| **Run** | Full stick or WASD | **5.5 m/s**. Accel damp λ = 14, decel λ = 18. Facing damp λ = 16 (about 0.15 s to 90% of a turn). |
| **Air control** | — | Damp λ = 4, max horizontal 5.5 m/s |
| **Jump** | Space | v₀ = **7.0 m/s**, gravity 22 m/s². Apex 1.11 m, airtime about 0.64 s. Releasing while rising multiplies vel.y by 0.5. **Coyote time 0.12 s, jump buffer 0.15 s.** Land squash −0.25 / jump stretch +0.18. |
| **Glide** [MVP+] | Hold Space while falling | Fall speed capped at 1.8 m/s, horizontal 4.5 m/s, at most 1.5 s per airtime. The cape spreads. |
| **Slash 1 / Slash 2** | LMB | **Damage 10**. Duration 0.40, active 0.10–0.22, combo window 0.18–0.40, range 1.9 m, arc ±1.2 rad (±69°), lunge 2.5 m/s. Knockback 4, poise damage 1, hitstop 0.05, shake 0.15. |
| **Slash 3 (finisher)** | Third press | **Damage 20**. Duration 0.60, active 0.20–0.32, range 2.3 m, arc ±1.7 rad, lunge 4.0. Knockback 9, poise 3, hitstop 0.09, shake 0.35. Recovery can be dodge-cancelled after 0.32. |
| **Pounce Slash** | LMB in the air | **Damage 15**. Active 0.06–0.20, forward/down arc, range 1.6. Bounces her up at vel.y 4 on a hit. Once per airtime. |
| **Charge** | Hold LMB at least 0.35 s | Walk at 40% (2.2 m/s). Sparkles build, with tier sounds at tier 1. |
| **Heavy Swing** | Release before tier 1, or with Holy locked or Valor below 50 | Slash 3 stats with **poise 4 and guard break**. This is how you open a Pug's shield. |
| **Holy Slash** (Shard 1) | Release at tier 1 (held **1.1 s**) with **Valor ≥ 50** | **Costs 50 Valor.** **Damage 50**, 360° with radius 3.6 m. Knockback 14, poise 99, hitstop 0.14, shake 0.6. Timescale 0.35 for 0.25 s. I-frames from 0.22 to 0.46. |
| **Holy Wave** (Shard 2) | Added automatically to Holy Slash | Crescent projectile: 14 m/s, 10 m range, 2.4 m wide, **damage 30**. Pierces and destroys enemy projectiles. |
| **Dodge roll** | Shift | 0.40 s, speed 9 easing to 4 m/s (about 2.6 m). **I-frames 0.04–0.30.** 0.25 s cooldown after the roll ends. Cancels attack recovery after the active window. Ground only. |
| **Stand** (guard) | Hold RMB | 0.08 s to enter. She cannot move but can turn at 180°/s. Blocks **100% of frontal (±60°) melee and projectile damage** with 0.3 m pushback per block. **Red-rimmed heavy attacks break the Stand**: half damage and 0.6 s stagger. The pose is Vigil/Oath, and the cape and fur wind are boosted. |
| **Perfect Stand** (parry) | Start a Stand within **0.15 s** before a hit lands | Normal attackers stagger 1.0 s; bosses 0.5 s unless their phase says otherwise. **+20 Valor**, hitstop 0.10, gold ring flash, `metal_ringing`. **Heavy attacks can be parried.** After Shard 2, projectiles are reflected at 1.5× speed for 15 damage. |
| **Graze** | An enemy strike passes through roll i-frames | +10 Valor and a soft chime |
| **Milk Sip** (heal) | 1 | Takes **0.8 s** and can be interrupted. Movement capped at 1.1 m/s. **Heals 4 HP (2 hearts).** Carry 3 (upgradable to 5). |
| **Interact** | E | Range 1.5 m |
| **Lock-on** | Tab | Nearest enemy within 12 m and inside 100° of camera forward. Switch target with a mouse flick over 40 px or a right-stick flick. Breaks at 16 m. |
| **Companion ability** | Q | Per companion (§5.2) |
| **Meme Cam** [MVP+] | Hold Stand 2.5 s with no enemy within 10 m | The camera glides into the meme framing, wind and cape billow rise and sparkles appear. Releasing exits. |

**Assists**
- On the first active frame of a swing, she auto-turns toward the nearest enemy within 60° and 3 m. On touch this widens to 90° and 4 m.
- Attack and dodge have a 0.2 s input buffer.

### 4.2 Health, Valor and Nine Lives

- **Hearts.** She starts with 5 hearts (10 HP; 1 heart = 2 HP) and reaches a maximum of 8 hearts through 3 Heart Bells.
  - Enemy damage is counted in half-hearts.
  - **When hurt:** 0.35 s hurt stun, knockback from the attack, then **0.9 s of i-frames** with the mesh blinking at 15 Hz. The player-hurt hitstop is 0.07 s.
- **Valor meter (0–100).** It is sword-shaped (art §13) and turns gold at 50 and again at 100.
  - It fills by **+6 per landed hit** (at most +12 per swing), **+20 per Perfect Stand** and **+10 per graze**.
  - It never decays. It carries across checkpoints and resets to 0 when a new level loads.
- **Nine Lives** [TREND: "9 lives"]. Each level attempt starts with **9 lives**, shown as 9 small paw prints.
  - Death costs 1 life and respawns her at the last checkpoint (a cat-bed banner) with full hearts.
  - At 0 lives, the game shows "The fog takes you… but cats land on their feet." and restarts the level. Lives refill, and collected fish are kept.
  - Falling into water or a pit costs −1 HP and returns her to the last safe ground. **No life is lost.**
- **Difficulty**

| Mode | Damage taken | Lives | Enemy attack tokens | Enemy HP |
|---|---|---|---|---|
| Squire | ×0.5 | Infinite | 1 | ×1.0 |
| **Knight** (default) | ×1.0 | 9 per level | 2 | ×1.0 |
| Nine Lives | ×1.5, rounded up to a half-heart | 9 per **whole game** | 3 | ×1.3 |

### 4.3 Camera

| Setting | Value |
|---|---|
| Rig | Spring-arm orbit (tech.md §8). Pivot is the player's head + 0.3 (y ≈ 1.05). |
| Distance | 3.6 m default; 4.5 m locked on; 6.0 m in boss arenas (eased over 0.6 s) |
| FOV | 45 in gameplay, 30–35 in cutscenes |
| Pitch clamp | −0.35 to 1.1 rad |
| Auto-follow | After 1.5 s without look input |
| Large props | Trees fade to opacity 0.3 when they come between the camera and the player |

---

## 5. Fellow kittens

Every cat is built with `buildKitten(cfg)` (art.md §2 and §7), sharing proportions within ±10% and differing by coat, eyes and **one unique silhouette prop**.
- Companions use 10 fur shells or the sheen fallback.
- NPCs always use the sheen fallback.
- No kitten ever dies. A "knocked out" companion sits dazed with stars for 8 s, then returns.

### 5.1 Roster

| Kitten | Look (art §7) | Rescued in | Role | Function |
|---|---|---|---|---|
| **Mochi** | Tuxedo, amber eyes, huge round tower shield, blue tabard, pot helm | L1, Old Bridge | **Companion** (tank) [MVP] | Shield Wall |
| **Sage** | Silver mackerel tabby, green eyes, leaf-green pointed hood, short bow | L2, treetop cage | **Companion** (ranger) [MVP] | Volley; shoots flyers |
| **Clover** | Calico, hazel eyes, white coif, bell collar, flower staff | L3, the stocks | **Companion** (cleric) [MVP] | Heal |
| **Nutmeg** | Brown tabby, baker's hat, apron | L3, bakery | **NPC: Bakery** [MVP] | Sells Milk and satchel upgrades |
| **Tofu** | White kitten, soot smudge, oversized smith's apron | L3, forge yard | **NPC: Forge** [MVP] | Sharpness upgrades and sword skins |
| **Pip** | Solid black, yellow-green eyes, very long red scarf | L4, hyena war-wagon | **NPC: Lookout** [MVP]; companion [STRETCH] | Per-level collectible tracker |
| **Earl Grey** | Siamese, sapphire eyes, floppy starry wizard hat, round glasses | L4, hanging cage | **NPC: Library** [MVP]; companion [STRETCH] | Holy upgrades |
| **Pearl** | Dilute cream-silver, pale pink bow, cream pilgrim cape (ref3 interpretation, art §7) | L5, smuggler crate | **NPC: Wardrobe** [MVP] | Cape dyes and the emotional beat |
| *Sir Marmalade* | Mentor, not captured | — | NPC | Tutorial, hub, story |
| *Queen Snowpaw* | White angora with odd eyes, plus `props/Crown.glb` | — | NPC | Ending |
| *Villagers* | Random coats and accessories (art §7) | — | NPC | 4 at the start of the hub, +2 per rescued knight, up to 20 on screen |

### 5.2 Companion rules and abilities [MVP]

**Shared AI**
- **Follow** 2.5 m behind and to the side. Teleport to the player if more than 15 m away.
- Engage **only** enemies that are already engaging the player, within 6 m of her.
- **Damage 5 per hit, one attack per 1.6 s.** Companions don't use attack tokens and never deal more than 20% of a fight's damage; the player is the hero.
- Companions are swapped at any checkpoint banner or at the hub barracks. One is active at a time.
- The ability triggers with **Q**. The portrait in the HUD shows the cooldown ring.

| Companion | Ability (Q) | Numbers | Passive |
|---|---|---|---|
| **Mochi** | **Shield Wall**: plants the tower shield 1.5 m in front of Swordcat | 4 s. Blocks all projectiles in a 3 m wide arc. **Taunts** enemies within 6 m, who target Mochi. Cooldown **18 s**. | Draws 1 melee enemy's aggro |
| **Sage** | **Arrow Volley** | 5 arrows across up to 3 targets, **8 damage each**. Marks them: +25% damage taken for 5 s. Cooldown **14 s**. | **Shoots one flyer every 2.5 s for 6 damage.** This solves crows for a melee hero. |
| **Clover** | **Purr of Mending** | Heals **4 HP over 3 s** (`cat_purractive_loop`). Cooldown **30 s**. | Revives a KO'd companion instantly (moot in MVP, since only one is active) |

---

## 6. Enemies

**Rules**
- Chibi proportions, cool desaturated palettes, **never pink** (art §11).
- Every attack has a **telegraph of at least 0.45 s**: a red ground decal (ring, line or cone), plus an emissive flash on the weapon, plus a sound.
- At most **8 active enemies** per arena and **2 attack tokens** (tech §10). The rest orbit.
- Defeats are a poof of sparkles and stars plus faction-specific debris (art §8).
- Drops: fish, and a 10% chance of a small heart (+1 HP).

HP is on the player-damage scale, where one slash does 10. Damage is in HP, where 2 HP is one heart.

| # | Enemy | Tier | Model (§14) | Size | HP | Poise | Speed (walk/run) | Attacks: telegraph → effect | Behavior | Drops |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Rat Pikeman** | MVP | `Rat.glb`, kettle helm, spear | 0.7 m | 30 | 2 | 1.6 / 3.8 | **Pike Poke**: rears back and the spear tip flashes red, **0.55 s** → range 1.6, **damage 1**, knockback 3, recover 0.8. 30% chance of a second poke (0.30 s windup). | Patrol, alert hop (the "!"), chase. Sight 10 m, FOV 120°, leash 18 m. | 2–3 fish |
| 2 | **Rat Slinger** | MVP | `Rat.glb`, hood, sling | 0.7 m | 20 | 1 | 1.6 / 3.8 | **Pebble**: dotted red aim line, **0.8 s** → 12 m/s, **damage 1**, one shot every 2.5 s | Keeps 6–9 m away. Hops back 2 m if the player gets within 3 m (cooldown 3 s). | 2 fish |
| 3 | **Crow Raider** | MVP | `Pigeon.glb` tinted black, iron hood, red plume | 1.2 m wingspan | 20 | 1 | Circles at 5 m/s, 4 m up | **Dive**: a ground shadow decal grows for **1.0 s** plus a caw → 10 m/s, **damage 2**. A miss leaves it **stuck in the ground for 1.2 s** (the punish window). | Hittable only below 1.6 m, or by projectiles (Sage, Holy Wave, reflected pebbles) | 2 fish, feathers |
| 4 | **Gloomjelly** (L→M→S) | MVP | Procedural slime (art §11) | 0.8 / 0.5 / 0.3 m | 40 / 20 / 10 | 1 | Hops 1.5 m every 1.2 s | **Hop-Slam**: squash, **0.5 s** → leaps 3 m (0.6 s arc). Landing radius 0.9/0.7/0.5, **damage 2/1/1**. | **Splits on death**: L into 2 M, M into 2 S. Children pop outward with 0.3 s invulnerability. At most 12 on screen, pooled. | 1 fish per S, 2 per L |
| 5 | **Bramble Spider** | MVP | `Spider.glb` tinted moss | 0.5 m tall | 35 | 2 | Skitters at 5.0 for 1.2 s, then pauses 1.0 s | **Web Spit**: abdomen pulses **0.6 s** → glob at 10 m/s, range 7; **slows the player 50% for 2 s, a roll clears it**, no damage. **Bite**: **0.45 s** → range 1.2, **damage 2**, recover 0.9. | Also leaves web patches on the ground (same slow), which a slash cuts | 3 fish |
| 6 | **Hyena Raider "HATER"** | MVP | KayKit `Barbarian.glb` with a beast head (hyena), "HATER" plate and `Skeleton_Blade` | 1.35 m | 50 | 3 | 2.0 / **5.0** | **Cackle Slash**: blade glints red and it cackles, **0.5 s** → range 1.8, **damage 2**, knockback 5. **Lunge Bite** (from 3–5 m): crouch **0.6 s** → leaps at 6 m/s for 0.4 s, **damage 2**. | **After any hit on the player, it laughs for 1.0 s** (`Cheer` clip). That laugh is a free punish window: the haters gonna laugh. Packs flank: the 2nd and later hyenas circle behind. | 4–6 fish |
| 7 | **Post Stealer** | MVP | KayKit `Rogue_Hooded.glb` with a hyena head and a "POST STEALER" plate | 1.2 m | 30 | 1 | **6.0**, faster than the player | **Snatch**: rubs its paws and its eyes glint gold, **0.6 s** → dash at 9 m/s for 0.35 s. **Steals 10% of carried fish** (min 5, max 50). If she has no fish, it shoves for 1 damage instead. | Then flees at 6.0 m/s toward the nearest fog edge and **despawns with the fish after 8 s**. **Any hit makes it drop all the stolen fish plus 5 bonus** (toast "Post returned!"). | 3 fish |
| 8 | **Pug Shieldbearer** | MVP | KayKit `Knight.glb` with a beast head (pug), `Rectangle_Shield` and `1H_Sword` nodes | 1.25 m | 60 | 5 | 2.5 / 3.2, **turns at only 120°/s** | **Shield Bash**: the shield rim glows red, **0.6 s** → range 1.5, **damage 2**, knockback 8. **Sword Chop**: **0.5 s** → range 1.7, **damage 2**. | **Its shield blocks all frontal (±70°) damage.** A Heavy Swing, Holy Slash or Pounce from above breaks the guard (1.5 s stagger). Otherwise roll behind it. | 5 fish |
| 9 | **Husky Brute** | MVP+ | KayKit `Barbarian.glb` with a beast head (husky) and `2H_Axe` | 1.7 m | 120 | 8 | 2.0 / 3.5 | **Ground Slam**: red ring decal with radius 3, **0.9 s**, **unblockable**: roll or Perfect Stand → **damage 3**, knockback 10. **Axe Spin**: **0.7 s** → radius 2.2, **damage 2**. | Elite. At most one per arena. | 10 fish |
| 10 | **Cellar Bat** | MVP+ | `Bat.glb` | 0.4 m | 10 | 0 | Erratic, 6 m/s | **Swoop**: screech and a red eye flash, **0.45 s** → **damage 1** | Swarms of 4–6 in the L6 cellars and the L5 sunken tower | 1 fish |
| 11 | **Hornet Lancer** | MVP+ | `Wasp.glb` with a tiny lance | 0.6 m | 25 | 1 | Hovers 1.5 m up | **Lance Dash**: buzz pitch rises with a line decal, **0.7 s** → 14 m/s over 8 m, **damage 2**, then dizzy for 1.0 s | Forest elite | 3 fish |

**Enemy roster per level**

| Level | Enemies (MVP); [+] marks MVP+ |
|---|---|
| L1 | Pikeman, Slinger, Crow |
| L2 | Pikeman, Slinger, Spider, Crow, [+Hornet] |
| L3 | Pikeman, Post Stealer, Pug |
| L4 | Hyena Raider, Post Stealer, Slinger, Crow |
| L5 | Gloomjelly, Spider, Slinger, Crow, Post Stealer, [+Bat] |
| L6 | Pug, Pikeman, Crow, Hyena, Post Stealer, [+Husky, Bat] |

---

## 7. Bosses

All bosses share these rules:
- They live in a **circular arena** behind a fog wall and use the **6 m boss camera**.
- A boss bar shows at the bottom centre (§10).
- Phases change at HP thresholds, which emits `BOSS_PHASE`. Each phase change gives 1.0 s of invulnerability and a short bark.
- Music: `boss_epic_battle_loop`. Defeat plays the `victory_fanfare`.

### B1 — Rat Captain Grizzlechop [MVP] (L2, the Cheese Mill)

**Build.** `Rat.glb` normalized to 1.7 m, with a procedural feathered hat, a cheese-wheel shield and `weapons/quaternius/Sword_B.glb` as a sabre.
**Stats.** HP 400, poise 12, arena 24 m across.

| Phase | HP | Attacks and events |
|---|---|---|
| **1: "En Garde"** | 100–60% | **Sabre Flurry**: 3 hits with windups 0.55 / 0.30 / 0.30, damage 1/1/2, range 2.0. **Cheese Wheel Roll**: raises the shield overhead for **0.8 s**, then a 0.9 m wheel rolls at 7 m/s, bounces once off the arena wall and deals **damage 2**. It is a red-rim heavy, so jump or roll. At 80% he **calls 2 Pikemen**. |
| **2: "Charge!"** | 60–25% | **Wheel Ride**: jumps onto a giant wheel and makes **3 charge laps**. Each lane is drawn as a dust streak **1.0 s before** he charges along it at 9 m/s, **damage 2**. Then he is **dizzy for 2.5 s and takes ×1.5 damage**. Repeats every 12 s. **2 Slingers** appear on the mill deck. |
| **3: "Rattled"** | below 25% | Windups ×0.8. **Triple Wheel**: 3 wheels in a fan, 25° apart. |
| **Defeat** | 0 | His hat flies off. "I yield!" Then CS-04 and Shard 1. |

### B2 — Warchief Snickerfang [MVP] (L4, the Mossgate causeway)

**Build.** `Barbarian.glb` normalized to 2.2 m, with a hyena beast head, a "HATER-IN-CHIEF" plate and `Skeleton_Blade` at ×1.6.
**Stats.** HP 650, poise 15. **Galahug** guards the far end of the causeway as a scripted, invulnerable ally who sweeps away extras.

| Phase | HP | Attacks and events |
|---|---|---|
| **1: "The Roast"** | 100–60% | **Cackle Combo**: 2 hits with windups 0.6 / 0.35, damage 2/2, range 2.4. **Laugh Quake**: throws his head back for **0.8 s**, then a ring 0.3 m tall expands at 8 m/s out to 7 m, **damage 2**. Jump over it. |
| **2: "Ratio Rush"** | 60–30% | Summons **2 Post Stealers**, once. **Ratio Rush**: 3 dashes across the causeway at 12 m/s, each lane telegraphed **0.8 s**, damage 2. **A Perfect Stand on a dash makes him stumble for 2.5 s at ×1.5 damage taken.** This is where the parry is taught. A normal Stand only pushes her back 2 m. |
| **3: "Roast Rain"** | 30–0% | Archers in the fog bank fire volleys: 6 red circles of radius 1.2, **1.0 s** telegraph, **damage 2**, every 5 s. **Stand blocks arrows from any angle.** Laugh Quake now comes as a double ring. |
| **Defeat** | 0 | He laughs nervously. Galahug lifts him by the collar and drops him into the moat with a cute splash. Shard 2: Holy Wave and projectile reflect. |

### B3 — Lord Barkus Grimjaw, the Dog Warlord [MVP] (L6, the bell-tower roof)

**Build.** `Knight.glb` normalized to 3.0 m with:
- a bulldog beast head: jowls, an underbite with two little fangs, an eyepatch, a horned helm;
- a spiked collar and the Knight cape tinted black;
- a cleaver made from `weapons/quaternius/Claymore.glb` at ×1.8, with a red-hot emissive edge `#FF3B30`.

**Stats.** HP 1200, poise 25, a 20 m arena with parapets, and `loop_rain` storm ambience.

| Phase | HP | Attacks and events |
|---|---|---|
| **1: "Iron Jaw"** | 100–65% | **Cleaver Chop**: the edge glows red for **0.8 s** → **damage 3**, and a crack line 4 m forward lingers 0.5 s for 1 more damage. **Wide Sweep**: **0.6 s** → 180° arc, range 3.2, **damage 2**. Jumpable. **Back Kick** (player behind him within 2 m): **0.4 s** → damage 1, knockback 8. |
| **2: "Call the Pack"** | 65–35% | His helm shatters in a 2 s beat and his brows go furious. **Howl**: 1.2 s, summons **2 Pugs and 2 Crows**, at the start of the phase and again at 50%. **Spin to Win**: crouches **0.9 s** with a red ring of radius 2.8, spins for 2.5 s at damage 2 per 0.5 s tick, then is dizzy for 1.5 s. **Bone Toss**: 3 bouncing bones at 9 m/s, damage 1 each, **reflectable**. |
| **3: "Storm"** | 35–10% | Lightning: red decals of radius 1.5, **1.2 s** telegraph, damage 2, three at a time every 4 s. All windups ×0.85. The shard on his collar glows red. |
| **Rally** | 10% | **CS-08 "Nine Lives"** plays, then **Golden Hour** for 10 s: Valor full, **+100% damage, Holy Slash costs nothing**, and the world runs at timescale 0.8 around the boss. Prompt: "Hold ⚔ to light the sword." The final Holy Slash triggers **CS-09**. If she doesn't land it within 10 s, Golden Hour simply refreshes; it cannot be failed. |

### B4 — Slime Sovereign [MVP+] (L5, the Sovereign Pool)

**Build.** A procedural slime 4 m across, with `props/Crown.glb` on top and the `Knight_Helmet` node from `Knight.glb` floating inside.
**Stats.** HP 300, then **splits into 2 slimes of 150 HP (2.8 m)**, then **into 4 of 60 HP (1.8 m)**.

| Attack | Telegraph | Effect |
|---|---|---|
| **Belly Flop** | Sinks for **0.9 s** | Lands on the player's position with a shockwave of radius 3, damage 2 |
| **Arena Splash** | Sinks and swells for **1.5 s** | A wave 0.4 m high crosses the arena, damage 2. Jump it or Stand. |
| **Spit** | — | Spits out 2 small Gloomjellies |

The crown drops **Heart Bell #3**. **Fallback [MVP]**: L5 ends with an elite slime wave (3 L-size), and Heart Bell #3 sits on top of the sunken tower instead.

---

## 8. Levels

All levels share these elements:
- **Checkpoints** are cat-bed banners. Touching one saves, refills hearts and lets you swap companions.
- **Arenas** close with fog walls: a ring of mist cards plus a collider circle.
- Every level has **5 Golden Fish**.
- A level exit is a trigger that leads to the next level, or back to the hub from L4 onward.
- Biome palettes, fog and particles follow art.md §12.

### L1 — Purrdale Meadows: "The Fog Comes" [MVP] (tutorial, about 10 min)

**Space.** A 160×160 m heightfield with a 300 m spine. Fog `#B7C0C3` at density 0.045, overcast, 30k grass blades, standing stones. This is the exact ref2 look.

**Flow.** Armory Barn → Training Yard → Standing Stones (**Arena A**) → Windmill Hill (optional jump route) → Picnic Glade (**CS-03 Milk Break**, then the Net Rope fight) → Crow Fields → Old Bridge (**Arena B "Hold the Line"**) → exit.

**Teaches**, through Marmalade's prompts and dummies (`target.glb`): move, camera, jump, attack, the 3-hit combo, dodge, Stand, Perfect Stand, Milk Sip, interact, and Mochi's Shield Wall. The Perfect Stand dummy is a log on a rope swinging every 2 s.

**Set pieces**
- **Milk Break and Net Ropes.** Three rope posts take 3 hits each while 2 waves of rats (4, then 4 with a slinger) attack.
- **Hold the Line.** At the bridge, 3 waves of 4, 5 and 6 (the last includes 2 crows). Mochi cheers from the cage, and breaking the cage releases him.

**Enemies.** About 18 Pikemen, 4 Slingers, 3 Crows. **Kitten:** Mochi.

**Collectibles.** About 120 fish. 3 Milk Bottles in crates. Golden Fish at:
1. the barn loft, via crates;
2. the windmill top, via haystack steps;
3. **the centre of the stone ring**, which appears after a 3 s Stand there (a teaching gag);
4. under the bridge;
5. Ember's gift.

**Checkpoints.** Barn, glade, bridge.

**Music.** `field_of_dreams` → `battle_fast_fight_loop` in arenas.

### L2 — Whiskerwood: "The Cheese Mill" [MVP] (about 12 min)

**Space.** 180×180 m with a 340 m spine. Fog `#8E9E8A` at 0.06 and fireflies. God rays are [MVP+]. Oaks are scaled 4–6×, so the trees are giant at kitten scale.

**Flow.** Forest Gate → Mushroom Ring (**Heart Bell #1** at the top of a cap-hopping climb) → Spider Hollow (arena with web patches) → Sage's Treetop (knock down 3 rope posts and the cage lowers) → Stump Crossing (jumps over a stream; a fall costs −1 HP and returns her to the last stump) → Rat Camp (arena, 3 waves) → **Cheese Mill (B1)**.

**Teaches.** Ranged enemies and Sage's flyer cover, slowing webs and cleansing them with a roll, the Heavy Swing, and then Holy Slash after CS-04.

**Enemies.** About 16 Pikemen, 8 Slingers, 8 Spiders, 4 Crows, plus Hornets [MVP+]. **Kitten:** Sage.

**Collectibles.** About 200 fish, 5 Golden Fish, Heart Bell #1.

**Music.** Explore: `dark_forest_creepy` at volume 0.6. It may be too creepy [unverified taste]; the fallback is `field_of_dreams`. Then `battle_fast_fight_loop` and `boss_epic_battle_loop`.

### L3 — Pawsbury: "The Quiet Town" [MVP] (about 10 min, then the hub)

**Space.** 120×120 m of golden-hour town in fog, lit by warm lanterns `#FFC46B`, with cobblestone texture.

**Flow**
1. South Gate (rats).
2. Lantern Alley: interact to light 3 lanterns. Each pushes the fog back locally by lowering fog density in a radius around the player.
3. Bakery Street: **Post Stealer introduction**. Three stealers; rescue **Nutmeg**.
4. Forge Yard: **Pug introduction**. Two pugs; **Tofu** is hiding in a barrel stack.
5. Market Square: arena with 4 waves of rats, pugs and stealers. Free **Clover** from the stocks.
6. Castle Steps: Marmalade at the dark Sunbell gives the exposition and the quest: Mossgate.

**After liberation the town becomes the hub.**

| Hub station | Who | Available from |
|---|---|---|
| Bakery stall | Nutmeg | L3 |
| Forge | Tofu | L3 |
| Library window | Earl Grey | After L4 |
| Lookout | Pip | After L4 |
| Wardrobe | Pearl | After L5 |
| Barracks banner (companion select) | — | L3 |
| Cat bed (save) | — | L3 |
| **Quest Board** (level select and replays) | — | L3 |

Villagers return as knights are rescued. Shops are **UI panels at stall counters**; there are no interiors.

**Kittens.** Nutmeg, Tofu, Clover.

**Collectibles.** About 150 fish and 5 Golden Fish (rooftops, the well bottom, the fountain, the church bell loft, behind the forge).

**Music.** `village_town_theme` while occupied, `battle_fast_fight_loop`, then `village_bards_tale` for the hub and `tavern_old_tower_inn` at the bakery.

### L4 — Mossgate: "The Stand" [MVP] (signature level, about 12 min)

```
          N   [ FOG BANK — horde spawns, 40 instanced silhouettes run here ]
        ┌──────────────── causeway 12 m × 90 m (Octree collision) ────────────────┐
  tower │ slingers                                                     slingers │ tower
        └──────────────────────────────────────────────────────────────────────┘
                           ▲ "the line" marker: Swordcat holds here
        ═══════════ Mossgate gatehouse (winch: Pip + Earl Grey repair it) ═══════════
          S   Old Battlefield approach (siege wrecks) ← road from Pawsbury
```

**Flow.** Old Battlefield (2 skirmishes; free Pip from a hyena war-wagon cage and Earl Grey from a cage hanging off a wrecked siege tower) → stairs under the causeway (**Heart Bell #2** and a Golden Fish) → **The Line.**

**The Line objective.** "Hold the line until the gate is fixed."
- Repair progress goes from 0 to 100% over about 4 minutes of waves.
- **Progress pauses while any enemy is within 4 m of the winch.**
- The causeway is narrow, so she literally holds the line.

| Wave | Content |
|---|---|
| W1 | 4 Hyena Raiders |
| W2 | 4 Raiders and 2 Post Stealers |
| W3 | 3 Raiders, 2 Slingers on the side towers, 3 Crows |
| W4 | **CS-05**. The background horde plus 6 active Raiders. **Galahug** joins as a scripted ally: every 6 s he does a 2H spin that knocks back any enemy within 3 m of him for 10 damage. |
| W5 | **B2 Warchief Snickerfang** |

At most 6 enemies are active at once.

**Enemies.** About 20 Raiders, 4 Stealers, 2 Slingers, 3 Crows. **Kittens:** Pip and Earl Grey.

**Collectibles.** About 260 fish, 5 Golden Fish, Heart Bell #2.

**Music.** `battle_theme_a` for the waves (silence and wind at the start of CS-05), then `boss_epic_battle_loop`.

### L5 — Bogmire: "The Sunken Road" [MVP] (about 12 min)

**Space.** 160×160 m with a water plane, height fog (falloff 1.2), will-o'-wisps and a `loop_water_01` ambience bed.

**Flow.** Boardwalk Maze (slimes) → Lily-pad Crossing (static pads in MVP; pads that sink 1.5 s after landing are [MVP+]) → Spider Reeds → Smugglers' Landing (stealers on hound rafts; **Pearl** in a crate, then **CS-06**) → Sunken Tower (bats [MVP+]) → Sovereign Pool (**B4** [MVP+] or an elite slime wave [MVP]) → Ember carries them north.

**Enemies.** About 10 L-size Gloomjellies (each splits), 6 Spiders, 4 Slingers, 4 Crows, 3 Stealers. **Kitten:** Pearl.

**Collectibles.** About 240 fish, 5 Golden Fish, Heart Bell #3.

**Music.** `cave_theme` for exploring, `battle_fast_fight_loop`, `boss_epic_battle_loop`.

### L6 — Houndhold Keep: "The Last Light" [MVP] (about 15 min)

**Space.** Vertical: a cliff fortress built from Castle Kit pieces, with KayKit Dungeon pieces for the cellars. Storm palette (art row 6), braziers, red banners with a procedural bone sigil decal, and `loop_rain`.

**Flow**
1. Gate (**CS-07**).
2. Courtyard: two **ballista lanes**. A bolt flies every 4 s along a red line telegraphed 1.0 s ahead, for 2 damage. Hitting the pug crew disables the ballista.
3. Kennel Cellars: Octree corridors. Find **2 keys** on keyrings to open the tower gate.
4. Rampart climb: stairs, crows and pugs; the Husky Brute is [MVP+].
5. **Bell-tower roof (B3).**

**Enemies.** About 10 Pugs, 12 Rats, 6 Crows, 6 Hyenas, 2 Stealers, plus 2 Huskies and 10 Bats [MVP+]. **Kittens:** none; all eight appear in CS-08.

**Collectibles.** About 300 fish and 5 Golden Fish.

**Music.** `cave_theme` in the cellars, `battle_theme_a`, `boss_epic_battle_loop`. For the ending: `story_lament_warriors_soul`, then `festival_minstrel_dance`, then `village_bards_tale` over the credits.

### L7 — Skyfight over the Cloudsea [STRETCH]

- **What it is.** A 2.5-minute on-rails ride on Ember along a spline [TREND V4].
- **Controls.** The player steers inside an 8×5 m box relative to the path. Attack fires a free Holy Wave every 0.4 s. Dodge is a barrel roll with 0.4 s of i-frames.
- **Enemies.** Crow squadrons and ballista platforms on floating islands built from the village kit's mountain and hill models.
- **Boss.** A Hound Sky-Captain riding `Dragon.glb` tinted `#2E3036`, in 3 phases.
- **Unlock.** From the Quest Board after the game is finished.

---

## 9. Progression

### 9.1 Currencies

| Currency | Source | Use |
|---|---|---|
| **Fish** (silver) | Enemies (§6), crates and barrels (`wood_breaking`), hidden caches, 100 per boss | Shops (§9.2). About **1,570 fish** are available in one full clear. |
| **Golden Fish** | **5 per level, 30 in total**, placed as secrets | Sword skins (§9.4) |
| **Heart Bells** | 3 (L2, L4, L5) | +1 maximum heart each, 5 → 8 |
| **Milk Bottles** | Crates; Nutmeg sells them for 20 fish | Healing (§4.1) |

### 9.2 Shops (hub) [MVP]

| Shop | Item | Effect | Cost (fish) |
|---|---|---|---|
| Nutmeg's Bakery | Milk Bottle | Refills 1 | 20 |
| | Bigger Satchel I / II | Carry 4 / 5 bottles | 100 / 200 |
| Tofu's Forge | Sharpness I / II / III | All player damage ×1.15 / ×1.30 / ×1.50 | 120 / 240 / 400 |
| Earl Grey's Library (after L4) | Quick Charge | Charge tier time 1.1 s → 0.8 s | 200 |
| | Valor Gain | +25% Valor from all sources | 150 |
| | Holy Wave Reach (needs Shard 2) | Wave range 10 → 15 m | 200 |
| Pearl's Wardrobe (after L5) | Cape dyes (§9.5) | Cosmetic | 80 each |

The upgrades total 1,610 fish, or about 1,930 with the capes. A thorough first run buys most of them, and replays from the Quest Board cover the rest. Nothing is needed to finish the game.

### 9.3 Story unlocks (holy power)

| Shard | From | Unlocks |
|---|---|---|
| 1 | B1 (L2) | **Holy Slash** (charge, Valor ≥ 50) |
| 2 | B2 (L4) | **Holy Wave** projectile and **Perfect Stand reflect** |
| 3 | B3 (L6, CS-08) | **Golden Hour** (story moment). After the game: at Valor 100, hold ⚔ for 2.5 s for 8 s of +50% damage [MVP+]. |

### 9.4 Sword skins

Skins are cosmetic only: same hitbox and stats. Golden Fish costs total exactly 30.

| Skin | Asset | Unlock | Tier |
|---|---|---|---|
| Squire's Longsword | Procedural (art §4.3) | Default | MVP |
| Fishbone Sword | Procedural: a spine with rib cones | 4 GF | MVP |
| Baguette Blade | Procedural: a capsule with score marks | 6 GF | MVP |
| Yarnbrand | Procedural: blade wrapped in pink yarn | 8 GF | MVP+ |
| Diamond Sword | `weapons/quaternius/Sword_Diamond.glb` | 12 GF | MVP |
| Galahug's Claymore | `weapons/quaternius/Claymore.glb` at ×0.55 | Free after L4 | MVP+ |
| **Dawnblade** | The default sword with a permanent gold emissive and sparkles (ref1) | Finish the game | MVP |

### 9.5 Capes

The bow is **always pink** and cannot be removed. This is a hard rule.

| Cape | Colour | Unlock |
|---|---|---|
| Hero Red | `#A3202C` | Default [REF ref2] |
| Pilgrim Cream | `#E2D6C0` | Default [REF ref3; the viral clips show white/cream, TREND] |
| Order Blue | `#3F6FB5` | 80 fish, from Pearl |
| Whiskerwood Green | `#5E7F3E` | 80 fish, from Pearl |
| Midnight | `#22242A` | 80 fish, from Pearl |
| Gold | `#D9B26A` | Finish the game with all 30 Golden Fish |

---

## 10. UI and HUD

The style is pure-CSS parchment with pink ribbon buttons, pink wax seals and gold (art.md §13). Fonts are loaded locally from `public/assets/fonts/`:
- **Cinzel Decorative** for titles,
- **Fredoka** for UI and dialogue,
- **Uncial Antiqua** for lore and signs,
- **MedievalSharp** for quest names.

| Where | Element | Tier |
|---|---|---|
| Top-left | Round gold portrait frame (Oath pose, bow peeking over the frame) | MVP |
| Top-left | **Hearts** `#F0668E`; half-hearts wobble when hit and pulse red when low | MVP |
| Top-left | **Nine Lives**: 9 small paw prints under the hearts; a lost life fades with a mew | MVP |
| Top-left | **Valor meter**: a sword-shaped bar that fills from the hilt, ticks gold at 50 and glows gold with sparkles at 100 | MVP |
| Top-right | Fish counter with the Golden Fish count beside it (n/5 for this level) | MVP |
| Top-right | Minimap: round ink-wash parchment with a paw icon | STRETCH |
| Bottom-right | Active companion portrait with a cooldown ring in their colour (Mochi blue, Sage green, Clover cream); Milk count (n/3) | MVP |
| Bottom-centre | **Boss bar**: parchment ribbon with the name, phase pips at the thresholds, and a chip-damage trail | MVP |
| Bottom-centre | **Dialogue scroll**: portrait, speaker name in a pink ribbon, typewriter text at 30 chars/s, a bouncing paw for "next" | MVP |
| World | Interaction prompt: parchment tag with the key glyph on a wax seal | MVP |
| World | Damage numbers (Fredoka 700, white with an ink outline; crits gold; heals green); "!" alert bubbles over enemies | MVP |
| Centre-top | Objective toasts ("Cut the net ropes 1/3", "Gate repair 64%") | MVP |
| Edge | Letterbox bars and "Hold Esc to skip" in cutscenes | MVP |

**Menus [MVP]**
- **Title**: the live 3D CS-00 loop as background. Options: Continue, New Game, Settings, Credits.
- **Pause**: Resume, Settings, Return to Pawsbury, Quit to Title.
- **Settings**: volume (master, music, SFX), invert Y, sensitivity, quality (Auto/Low/Med/High), hold or toggle for Charge and Stand, **reduce shake and flashes**, touch button size, difficulty.
- **Game Over**: the lives remaining, Retry, Return to Pawsbury.
- **Quest Board**: level list with the Golden Fish count and best fish per level.
- **Shop and Wardrobe panels.** **Credits**: the full CC0/OFL attribution from `LICENSES.md`.

**Accessibility [MVP]**
- Every line is subtitled, because there is no voice acting.
- Telegraphs use **shape plus colour** (ring, line or cone, plus a pulse), never colour alone.
- Minimum font size 16 px.
- No input needs mashing.

---

## 11. Controls

The action set matches tech.md §7, adding `guard`, `companion` and `heal`.

| Action | Keyboard + mouse | Gamepad (standard mapping) | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick (dead zone 0.15) | Floating joystick on the left half |
| Camera | Mouse (pointer lock after the first click) | Right stick | Drag on the right half |
| Attack / hold to charge | LMB or J | X (2) | ⚔ button (hold) |
| **Stand** (guard/parry) | RMB or L | LB (4) | 🛡 button (hold) |
| Dodge roll | Shift or K | B (1) | Roll button |
| Jump / glide | Space | A (0) | Jump button |
| Interact / confirm | E or Enter | Y (3) | Contextual "!" button |
| Companion ability | Q or U | LT (6) | Paw button |
| Milk Sip | 1 | D-pad up (12) | Milk button |
| Lock-on / switch | Tab, MMB, or a mouse flick while locked | RB (5) or R3 (11); right-stick flick | Auto soft lock (90° / 4 m) |
| Pause | Esc or P | Start (9) | ❚❚ button |
| Skip cutscene | Hold Esc 1 s | Hold Start 1 s | Hold ❚❚ 1 s |
| Photo mode | F | Back (8) | — (STRETCH) |

**Touch [MVP]**
- Controls appear when `(pointer: coarse)` matches or on the first `touchstart`.
- "Start" requests fullscreen.
- Portrait orientation shows a "rotate to landscape" hint.
- Buttons are at least 64 px, with a size slider in Settings.

---

## 12. Audio plan

Every file below exists under `public/assets/audio/` [verified]. SFX play with a ±5% random pitch.

### 12.1 Music

| State | Track | Notes |
|---|---|---|
| Title / CS-00 | `music/village_bards_tale.mp3` | ASSETS.md notes there is no dedicated "cute" theme |
| Prologue and emotional cutscenes (CS-01, CS-06, CS-09 start) | `music/story_lament_warriors_soul.mp3` | |
| L1 explore | `music/field_of_dreams.mp3` | |
| L2 explore | `music/dark_forest_creepy.ogg` (volume 0.6) | [unverified taste]; fallback `field_of_dreams` |
| L3 occupied | `music/village_town_theme.mp3` | |
| Hub | `music/village_bards_tale.mp3` | Bakery: `tavern_old_tower_inn.mp3` |
| L5 / L6 cellars | `music/cave_theme.ogg` | |
| Arena waves | `music/battle_fast_fight_loop.ogg` (24 s seamless) | |
| L4 waves, L6 courtyard | `music/battle_theme_a.mp3` | |
| Bosses | `music/boss_epic_battle_loop.ogg` | |
| Arena or boss clear | `music/victory_fanfare.mp3` (about 4 s) | |
| Results / Quest Board | `music/victory_8bit_loop.ogg` | Optional |
| Knighting and credits | `music/festival_minstrel_dance.mp3`, then `village_bards_tale.mp3` | |
| Unused | `castle_kings_feast.mp3` | Reserve for the hub after the game is finished [MVP+] |

Music uses A/B crossfades of 1.5 s (tech §14). "Combat" starts when an arena locks or any enemy is alerted, and "explore" resumes 4 s after the last enemy dies.

### 12.2 SFX map

| Event | Files (`audio/sfx/…`) |
|---|---|
| Slash 1/2/3 swing | `sword/swish_01–13` (random) |
| Slash hit | `sword/sword_attack_01–10`, plus `impact/impactPunch_medium_*` on finishers |
| Stand block | `sword/sword_clash_01–10` |
| **Perfect Stand** | `sword/sword_clash_*` + `impact/metal_ringing` |
| Holy charge tiers | `pickup/powerup_rise01` (tier 1), `powerup_rise04` (tier 2) |
| Holy release / Holy Wave | `magic/spell_01`, `magic/magic1`, `magic/spell_fire_03` (pitched up ×1.2) |
| Footsteps (by surface) | `footsteps/footstep_grass_*`, `stone_l*/r*`, `footstep_wood_*`, `sand_*`, layered with `impact/armor_light` (30%) and occasionally `impact/chainmail1/2` |
| Dodge roll | `impact/cloth_heavy` + `impact/chainmail2` |
| Jump / land | `impact/cloth`; land: `impact/impactSoft_medium_*` |
| Hurt | `impact/impactPlate_medium_*` + `cat/kitten_mew_01` |
| Swordcat barks | `cat/kitten_mew_01`, `cat/meow_baby_01`, `cat/cat_softmew` |
| Companion and villager chirps | `cat/cute_creature_01–10` |
| Clover heal / save bed | `cat/cat_purractive_loop` / `cat/cat_purrsleepy_loop` |
| Milk sip | `pickup/bubble`, `bubble2`, `bubble3` (straw slurp) |
| Fish / Golden Fish / heart | `pickup/coins_01–04` / `pickup/gem_01–04` / `pickup/powerup_upper01` |
| Rats | `creature/rat_squeak_attack`, `rat_squeak_pain`, `rat_squeak_death` |
| Hyena cackle | `creature/c80_troll_01–03`, `c80_weird_*` [unverified fit: audition; fallback is a zzfx-synth cackle] |
| Dogs / Barkus howl | `creature/c80_barking_01/02`, `creature/animal_bark`, `creature/c80_howl`, `creature/rpg_giant1–5` |
| Slimes | `creature/slime_01–16`, `creature/rpg_slime1–10` |
| Spiders, hornets, bats | `creature/c80_bug_01–04`; bats `creature/rpg_shade*` [unverified fit] |
| Ember roar / purr | `creature/creature_roar_01–03`, `c80_roar_01–03`; purr = `cat/cat_purractive_loop` at rate 0.6 |
| Enemy poof | `creature/creature_die_01`, `pickup/powerup_fx01` |
| Crates and barrels | `world/wood_hit_*`, `world/wood_breaking_01/02` |
| Gates, winch, keys | `world/metal_open_01`, `metal_close_01`, `impact/chain_01–03`, `world/keys_01/02`, `world/lock_open_01` |
| Ambience | `world/loop_rain` (L6), `world/loop_water_01` (L5) |
| UI | `ui/click_*`, `ui/select_*`, `ui/confirmation_*`, `ui/back_*`; dialogue open/advance `ui/bookOpen`, `ui/bookFlip1–3` |
| Jingles | Kitten rescued `jingles/jingles_PIZZI0x`; quest complete `jingles_STEEL0x`; Golden Fish `jingles_NES0x`; game over `jingles_SAX0x` |
| Snore (CS-01) | `creature/c80_snore` |

**Gaps.** Nothing was downloaded for wind, a bell, crow caws or a specific hyena laugh. Fill them procedurally:
- **wind**: Web Audio filtered noise loop;
- **Sunbell**: `impact/metal_ringing` at rate 0.5 plus a synthesized partial;
- **crow caw**: zzfx.

---

## 13. Visual direction summary

The full spec is in art.md; this is the short version.

- **Mood rule [REF].** The world is desaturated, misty and low-contrast grey-green. The hero carries all the warm saturation (ginger, pink, red, gold) and the highest contrast (polished steel).
- **Fog everywhere.**
  - `FogExp2` per biome, plus height fog and drifting mist cards.
  - The sky dome's horizon colour **must equal** the fog colour.
  - In L4 the fog density rises to 0.06 beyond the causeway so enemies *emerge* from it.
- **Soft overcast light.** Hemisphere light plus one soft directional light, with **blob contact shadows under every character**. No hard black shadows.
- **Silver plate.** Its look comes from the custom grey-sky / green-ground PMREM environment map (art §4.1).
- **Fur and cloth.** Fur shells on the head and tail with a strong rim light, and a verlet cape on Swordcat.
- **Holy glow (ref1).** Blade emissive, a streak billboard, an aura hull, a warm point light, sparkles and a bloom spike.
- **Story lighting arc.** Grey mist (L1–L2), golden hour (L3), blue-green marsh (L5), storm (L6), then sun breaking through (ending).
- **Cute violence.** Poofs, spinning helmets and stars. No blood.
- **Scale.** The camera stays low. Every "big" thing (Galahug, Ember, Barkus) gets a reveal shot.
- **Post-processing.** MSAA, UnrealBloom, OutputPass and vignette. Bokeh depth of field is used **in cutscenes only** [MVP+].

---

## 14. Asset mapping (downloaded assets → game)

Paths are relative to `public/assets/models/`. All are CC0 (ASSETS.md).

**Mandatory loader rule: normalize every GLB to a target height on load.** I measured local mesh extents ranging from about 0.01 to 5.9 units, with node scales of ×100 on many poly.pizza and Quaternius files [verified]. `fitToHeight(template, h)` measures a `Box3` once per template and caches the scale. It also applies a per-model yaw offset from `MODEL_FIT` in config.

### 14.1 Characters

| Game character | Asset | Treatment | Verified facts |
|---|---|---|---|
| **Swordcat** | **Procedural** (art §2–§5). No CC0 armored cat exists (ASSETS.md gaps). | `buildKitten(SWORDCAT_CFG)`, fur shells, verlet cape, procedural sword | — |
| Swordcat **placeholder** (M0–M1 only) | `cats/Cat_Blocky.glb` + `weapons/kaykit/sword_2handed.glb` | Normalize to 1.0 m; sword parented to the `Body` bone | Clips `Idle, Walk, Run, Jump_Start, Jump_Loop, Death, Headbutt` [verified]; bones `Body, Head` [verified] |
| Kittens and Queen | Procedural `buildKitten`, plus `props/Crown.glb` for the Queen | Sheen fur, cape sway shader | — |
| **Ember** (dragon) | `creatures/monsters-flying/Dragon_Evolved.glb` | Normalize to 4.5 m long; tint the material red `#E0503A` | One skinned mesh `Dragon`, material `Atlas`, bones `Torso, Neck, Head, Body1–4` [verified]; clips S13 `Flying_Idle, Fast_Flying, Headbutt, HitReact, Yes, No, Punch, Death`. How the tint looks over the atlas is [unverified]; the fallback is a flat red map. |
| **Sir Galahug** | `characters/kaykit/Knight.glb` | Normalize to 3.2 m; show the `2H_Sword` and `Knight_Helmet` nodes and hide the other weapons | Nodes `1H_Sword, 2H_Sword, Knight_Helmet, Knight_Cape, Rectangle_Shield…` [verified]; clips S3 incl. `2H_Melee_Idle, 2H_Melee_Attack_Spin, Cheer, Idle` |
| **Hyena Raider** | `characters/kaykit/Barbarian.glb` | Hide `Barbarian_Head`, attach a beast head (hyena) to the `head` bone, the "HATER" CanvasTexture plate to `chest`, and `weapons/skeleton/Skeleton_Blade.glb` to `handslot.r`. Hide `1H_Axe, 2H_Axe, Mug, Barbarian_Hat`. | Mesh and prop node names [verified]. Bones `head, chest, handslot.r` verified on Knight and Skeleton_Warrior; on Barbarian they are assumed from the shared KayKit rig (ASSETS.md). |
| **Post Stealer** | `characters/kaykit/Rogue_Hooded.glb` | Hide `Rogue_Head_Hooded`, attach a hyena head and a "POST STEALER" plate | Node names [verified] |
| **Pug Shieldbearer** | `characters/kaykit/Knight.glb` | Hide `Knight_Head`, attach a pug head (keeping `Knight_Helmet` on top at ×0.9 hides the seam), show `Rectangle_Shield` and `1H_Sword` | [verified] |
| **Lord Barkus** | `characters/kaykit/Knight.glb` | Normalize to 3.0 m; bulldog head; tint `Knight_Cape` black; cleaver `weapons/quaternius/Claymore.glb` at ×1.8 with a red emissive edge | Clips include `2H_Melee_Attack_Chop/Slice/Spin/Spinning, Unarmed_Melee_Attack_Kick, Sit_Floor_Down, Sit_Floor_Idle, Death_A` (S3) |
| **Husky Brute** [MVP+] | `characters/kaykit/Barbarian.glb` | Husky head; `2H_Axe` node visible | [verified] |
| **Rats**, including Grizzlechop | `creatures/polypizza/Rat.glb` | Normalize to 0.7 m (1.7 m for the Captain); recolor materials `Grey` / `Pink`; attach the helm to the `Head` bone | Materials and bones `Body, Neck, Head, Torso` [verified]; clips `Rat_Attack, Rat_Death, Rat_Idle, Rat_Jump, Rat_Run, Rat_Walk`. **No hit-react clip**, so use a procedural squash plus a white flash. The front-paw bone for holding the sabre is [unverified]; the fallback attaches it to `Torso` with an offset. |
| **Crow Raider** | `creatures/monsters-flying/Pigeon.glb` | Normalize to 1.2 m wingspan; tint `#17181C`; procedural iron hood and plume | Material `Atlas`, bones `Torso, Neck, Head` [verified]; clips S13 (`Headbutt` is the dive) |
| **Bramble Spider** | `creatures/polypizza/Spider.glb` | Normalize to 0.5 m; tint moss | Clips `Spider_Attack, Spider_Death, Spider_Idle, Spider_Jump, Spider_Walk` |
| **Cellar Bat** [MVP+] | `creatures/polypizza/Bat.glb` | 0.4 m | Clips `Bat_Attack, Bat_Attack2, Bat_Death, Bat_Flying, Bat_Hit` |
| **Hornet Lancer** [MVP+] | `creatures/polypizza/Wasp.glb` | 0.6 m; procedural lance | Clips `Wasp_Attack, Wasp_Death, Wasp_Flying` |
| **Gloomjelly / Slime Sovereign** | Procedural (art §11); Sovereign adds `props/Crown.glb` and the `Knight_Helmet` node | Wobble vertex shader; transmission at most 6 on screen, with an opacity fallback | Backup model: `creatures/polypizza/Slime.glb` (`Slime_Attack/Death/Idle/Walk`) |
| Background horde (L4) | Procedural low-poly hyena silhouette as one `InstancedMesh` | Vertex-shader run cycle, beyond 18 m, inside the fog | — |

**Beast-head builder.** One function with presets:
- **hyena**: tawny `#A88A5E` with dark spots `#4A3A2A`, round ears, a mane of tuft cards;
- **pug**: fawn `#C9A27A`, black mask `#2A2522`, wrinkles, folded ears;
- **bulldog**: brindle `#6B4E3A`, jowls, an underbite with two fangs, an eyepatch;
- **husky**: grey and white mask, ice-blue eyes.

Each head is about 1.3× the size of the KayKit head it replaces, so they read as chibi. Eyes use art's `makeEyeTexture` with slit or amber pupils.

### 14.2 Environment per level

| Level | Key assets (folder → files) |
|---|---|
| L1 | `env/village-kaykit/buildings/building_home_A_red` (barn, ×4), `building_windmill_red`; `env/village-kaykit/decoration/target` (dummies), `tent`, `crate_*`; `env/nature/stone_tall*`, `rock_large*`, `fence_simple`, `crops_wheatStageB`, `tree_default`/`tree_oak` (fog silhouettes), `log`; `env/graveyard/hay-bale`; `env/town/cart-high` with procedural cage bars; `env/castle/bridge-straight` and `bridge-straight-pillar` (Old Bridge); texture `grass004` |
| L2 | `env/nature/tree_oak`, `tree_fat`, `tree_detailed` (×4–6), `mushroom_redTall`, `mushroom_redGroup`, `mushroom_tanTall` (×4–8), `stump_*`, `log_large`, `campfire_logs`, `tent_detailedOpen`, `bridge_wood`; `env/village-kaykit/decoration/barrel`, `sack`, `crate_*`; `env/town/watermill` with `wheel` (Cheese Mill, ×3); procedural cheese wedges; texture `ground037` |
| L3 | `env/village-kaykit/buildings/building_home_A/B_*`, `building_tavern_red`, `building_blacksmith_red`, `building_market_red`, `building_well_red`, `building_church_red` (×4); `env/town/fountain-round`, `stall-red`, `stall-green`, `lantern`, `fence`, `hedge`, `banner-red`; `env/castle/tower-hexagon-*` with a procedural Lathe bell; texture `pavingstones070` |
| L4 | `env/castle/bridge-straight`, `bridge-straight-pillar`, `wall`, `wall-narrow`, `tower-square*`, `gate`, `metal-gate`, `flag-banner-long`, `siege-*-demolished`; `env/graveyard/debris`, `debris-wood`; `env/dungeon-kaykit/sword_shield_broken`; `env/town/cart-high` (war-wagon); texture `bricks076c` |
| L5 | `env/nature/lily_large`, `lily_small`, `path_wood`, `bridge_wood`, `tree_*_dark`, `stump_old`, `hanging_moss`, `plant_bush*`; `env/dungeon-kaykit/floor_wood_large`, `barrel_large`, `crates_stacked`; `env/castle/tower-square` (tilted sunken tower); texture `planks012` |
| L6 | `env/castle/*` (walls, towers, `gate`, `metal-gate`, `wall-narrow-stairs`, `siege-ballista`); `env/dungeon-kaykit/wall*`, `floor_tile_*`, `stairs*`, `torch_lit`, `torch_mounted`, `banner_patternA_red`, `keyring`, `barrel_large`; `env/graveyard/fire-basket`, `iron-fence`; texture `bricks076c` |
| Ending / L7 | `env/village-kaykit/decoration/cloud_big`, `cloud_small`, `mountain_*`, `hills_*` (floating islands) |

**Loader caveats** (ASSETS.md):
- Kenney `env/castle`, `env/town`, `env/graveyard` and `env/dungeon-mini` GLBs need their sibling `Textures/colormap.png`, which is present [verified].
- The KayKit village buildings need scaling up by about 3–6×.

### 14.3 Other assets

| Asset | Path | Use |
|---|---|---|
| HDRI | `textures/hdri/overcast_soil_puresky_1k.hdr` | Optional alternative to the procedural env map (load with `HDRLoader`, its r180 name) |
| HDRI | `textures/hdri/meadow_2_1k.hdr` | L3 golden hour |
| Fonts | `fonts/*` | §10 |

---

## 15. Technical mapping (feature → three.js system → owner)

Owners are the tech.md §20 folders. Everything uses WebGLRenderer on `three@0.186.1`.

### 15.1 Feature table

| Feature | three.js / web API | Module (owner) | Tier |
|---|---|---|---|
| Fixed 60 Hz loop, hitstop, slow-mo | `THREE.Timer` plus an accumulator; `loop.timeScale` | `core/Loop.js`, `Game.js` (core) | MVP |
| Swordcat model and procedural animation | `Group` hierarchy of `Sphere`, `Lathe`, `Extrude`, `Tube` and `Capsule` geometry; springs | `player/SwordcatModel.js` (player) | MVP |
| Fur shells (head and tail) | `InstancedMesh` + `ShaderMaterial` (art §3.3); sheen fallback on Low | `player/` + `companions/KittenModel.js` | MVP, with fallback |
| Cape | CPU verlet on a 9×13 grid → `BufferGeometry` (art §5); NPCs use a vertex sway shader | player / companions | MVP; sway is the fallback |
| Movement and collision | Heightfield + XZ circles/boxes + `Octree` + `Capsule` (tech §5) | `physics/` | MVP |
| Camera, lock-on, shake | Spring-arm raycast; trauma shake | `camera/` | MVP |
| Combo, charge, Holy | Swept-arc `sectorHit` (tech §9.2); data in `combat/attacks.js` (Appendix A) | `combat/` + `player/` | MVP |
| **Stand / Perfect Stand / graze** | Extend `applyHit`: if the target is guarding inside the frontal arc, block; if the guard started ≤ 0.15 s before the hit, parry; if the target has i-frames during a roll, graze | `combat/Combat.js` | MVP |
| Projectiles (pebbles, webs, Holy Wave, bones, arrows) | Pooled meshes, swept sphere tests | `combat/` | MVP |
| Telegraph decals (ring, line, cone, circle) | Flat meshes at y + 0.02, `depthWrite:false`, `polygonOffset`, pulsing `ShaderMaterial` | `fx/Telegraphs.js` (fx) | MVP |
| GLB enemies | `GLTFLoader` + `MeshoptDecoder`; `SkeletonUtils.clone`; `AnimationMixer` with a per-type clip map | `enemies/` | MVP |
| Beast heads, model normalization | `buildBeastHead(preset)`, `fitToHeight()`; bone attach by name via `getObjectByName` | `enemies/BeastHead.js`, `core/Assets.js` | MVP |
| Enemy AI | Enemy FSM (tech §10), attack tokens; boss phase tables | `enemies/` | MVP |
| Slimes | Procedural sphere with a wobble vertex shader; pooled split | `enemies/types/gloomjelly.js` | MVP |
| Companions | Follower steering plus an ability state machine | `companions/` | MVP |
| Terrain, grass, fog, sky | `Heightfield.toGeometry()`; instanced grass with wind `onBeforeCompile` (tech §12.2, measured); `FogExp2` + height fog; gradient sky dome; PMREM env | `world/` | MVP |
| Water (L5) | Plane `MeshStandardMaterial` (roughness 0.12, scrolling normal) | `world/Water.js` | MVP |
| Mist cards, sparkles, poofs, sword trail | `Points` / `InstancedMesh` additive; ribbon `BufferGeometry` | `fx/` | MVP |
| Background horde | `InstancedMesh` with a vertex animation, 40 instances | `world/` or `fx/` | MVP |
| Bloom, vignette, MSAA | `EffectComposer`, `UnrealBloomPass`, `OutputPass`, `ShaderPass(VignetteShader)` | `core/PostFX.js` | MVP |
| Bokeh DOF in cutscenes | `BokehPass` | `core/PostFX.js` | MVP+ |
| Cutscenes | Step runner (Appendix B); `CatmullRomCurve3` camera paths; CSS letterbox | `story/StoryManager.js` + `camera/` | MVP |
| Dialogue, quests, flags | Data scripts in `story/dialogue/*.js` | `story/` | MVP |
| Arena lock and waves | Trigger → fog-wall ring (mist cards + collider) → spawn lists → clear | `world/LevelManager.js` + `enemies/` | MVP |
| HUD, menus, shops, touch | DOM/CSS overlay; pointer-event joystick (tech §7) | `ui/` | MVP |
| Audio | `AudioListener`, `Audio`/`PositionalAudio` pools, A/B music crossfade; zzfx for the gaps | `audio/` | MVP |
| Save | `localStorage`, versioned JSON (tech §16) | `save/` | MVP |
| Quality presets, dynamic resolution | `renderer.info`, pixel-ratio stepping | `core/` | MVP |

### 15.2 Events and state to request from the core owner

These are additive only.
- **Events:** `player:guard {on}`, `combat:parry {attacker,target}`, `combat:graze {}`, `player:valor {value}`, `player:lives {lives}`, `item:stolen {amount, thief}`, `cutscene:start {id}`, `cutscene:end {id}`, `arena:lock {id}`, `wave:start {arena, wave}`, `arena:clear {id}`, `boss:start {boss}`, `boss:defeated {boss}`, `shard:collected {n}`, `objective:progress {id, value, max}`.
- **GameState fields:** `fish`, `goldenFish {levelId: bitmask}`, `heartBells`, `milk`, `milkMax`, `upgrades {}`, `shards`, `kittens []`, `activeCompanion`, `skins {owned, equipped}`, `capes {owned, equipped}`, `lives`, `difficulty`.

### 15.3 Level authoring format

Levels are written as data, with no editor. Every `world/levels/<id>.js` exports `build(ctx)`, which runs a shared `LevelKit` over a description like this:

```js
export default defineLevel({
  id: 'meadow', size: 160, res: 160, seed: 11, biome: 'meadow',
  spine: [[-60,-70],[-30,-40],[0,-30],[20,0],[10,30],[40,55],[60,70]], // path the player follows
  pathWidth: 6, hills: { amp: 1.5, octaves: 3 },
  zones: [
    { id:'barn',   at:1, kind:'checkpoint', props:['barn','targets'] },
    { id:'stones', at:2, kind:'arena', r:12, waves:[['rat_pike',3],['rat_pike',3,'rat_sling',1]] },
    { id:'glade',  at:4, kind:'setpiece', script:'milk_break', r:14 },
    { id:'bridge', at:6, kind:'arena', r:14, waves:[...], rescue:'mochi', exit:'forest' },
  ],
  scatter: [ { model:'env/nature/stone_tallA.glb', n:40, minDistFromPath:5, scale:[2,4] }, ... ],
  goldenFish: [[x,y,z], ...], fishLines: [...], milk: [...],
});
```

`LevelKit` handles:
- carving the path and arenas flat into the heightfield;
- seeded scatter (`ctx.rng`) that keeps out of the path, arenas and colliders;
- instancing of repeated props, plus collider generation from per-model footprints;
- grass chunks;
- the triggers and spawns that produce tech.md's `LevelData`.

---

## 16. MVP vs stretch, milestones, cut order

### 16.1 Feature list

**MVP**
- Swordcat: procedural model, fur shells with sheen fallback, verlet cape, and the full moveset in §4 (glide excluded).
- Hearts, Valor, Nine Lives, Milk.
- 6 levels, with the hub and the Quest Board.
- 8 enemy types; bosses B1–B3.
- 3 companions.
- 5 NPC services: Bakery, Forge, Library, Lookout, Wardrobe.
- Cutscenes CS-00 to CS-09 (the CS-09 flight as a pure cutscene).
- 30 Golden Fish, 3 Heart Bells (Bell #3 on the sunken tower).
- Shops, 5 skins, 6 capes.
- HUD, menus, touch, gamepad, save.
- Audio as in §12.
- Quality presets.
- Test hooks and a smoke test that visits every level.

**MVP+**, in this order:
1. Meme Cam
2. Slime Sovereign (B4)
3. Interactive ending flight
4. Glide
5. Husky Brute, Cellar Bats, Hornet Lancer
6. Bokeh in cutscenes
7. God rays
8. Sinking lily pads
9. Claymore and Yarnbrand skins
10. Golden Hour after the game

**STRETCH**
- L7 Skyfight
- Photo Mode and the minimap
- Pip and Earl Grey as companions; two companions active at once
- Interiors, NG+ and knight-rank badges
- The procedural art.md enemies (Molegrim, Bramblehog, Toad Hexer, Ermine) and the Frostwhisker Peaks biome

### 16.2 Milestones for one parallel push

| Milestone | Content | Exit criterion |
|---|---|---|
| **M0 Core** | tech.md Phase 0: stubs, events (plus §15.2), config tables (Appendix A), smoke test | `npm run check` green |
| **M1 Vertical slice** | **All of L1**: Swordcat with the full moveset, rats and crows, Milk Break (CS-03), Mochi, HUD, audio, save, CS-00 to CS-02 | The smoke test drives L1 from start to the bridge via hooks. Screenshots are reviewed against ref2 using the §17 R1 checklist. |
| **M2 Act I–II** | L2, L3, L4; B1, B2; spiders, hyenas, stealers, pugs; hub shops; Galahug; CS-04, CS-05 | Every level boots in the smoke test; each boss can be beaten with the `god` hook |
| **M3 Act III** | L5, L6; slimes; B3; CS-06 to CS-09; credits | The game can be finished end to end with debug teleports, with no softlock (the smoke test fires every trigger) |
| **M4 Ship** | Performance against tech §18, asset pruning (R13), balance pass, accessibility, touch pass | Desktop 60 fps on Iris Xe at Med; `dist/` under the size target; zero console errors |

### 16.3 Cut order if late

1. L7
2. B4 → elite slime wave
3. Interactive flight → cutscene only
4. Fur shells → sheen
5. Verlet cape → sway shader
6. MVP+ enemies
7. Merge L5 into the approach to L6, leaving 5 levels, the floor

**Never cut:**
- the Stand and its meme pose,
- Milk Break,
- L4 "The Stand",
- the pull-back reveal,
- the final boss and CS-08/CS-09.

---

## 17. Risk list

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **The procedural Swordcat doesn't read as cute or as "the meme cat."** | Medium | Critical | Build it first (M1). Playwright screenshots in the meme framing are compared with ref2 against a checklist: bow visible on the left ear; eyes about 0.09 H; pauldrons ≥ head width; cape V-frame; sword ≈ her height; ginger plus cream bib. The Cat_Blocky placeholder unblocks the other agents meanwhile. |
| R2 | Fur shells look bad or are slow on an iGPU | Medium | Medium | Quality switch to sheen plus tuft cards; shells on the head only at 16 layers |
| R3 | **GLB scale and orientation are inconsistent** (local extents from about 0.01 to 5.9 units, ×100 node scales [verified]) | High | Medium | Mandatory `fitToHeight` plus the `MODEL_FIT` yaw table; a unit test asserts every enemy template's height is within ±10% of target |
| R4 | Beast heads on the KayKit rig look stitched-on | Medium | Medium | Keep `Knight_Helmet` or a hood over the seam; oversize the heads for the chibi look. Fallback: hyenas become `creatures/animals/Wolf.glb` quadrupeds (clips S9: `Attack, Gallop, Walk, Death, Idle_HitReact1`; recolorable materials `Main`/`Main_Light` [verified]). |
| R5 | Animation clip mismatches (Quaternius spells it `HitRecieve`; Rat has no hit clip) | High | Low | A per-type clip map in data; a missing clip falls back to a procedural squash plus flash; a unit test checks every mapped clip name exists in the GLB |
| R6 | Scope creep from 8 kittens, 10 cutscenes and 4 bosses | High | High | The tiering in §16, the cut order, and NPC kittens that are static with a procedural idle only |
| R7 | Performance from grass, fog, bloom, fur and up to 12 skinned meshes | Medium | High | tech §18 budgets; at most 8 active enemies; mixers updated every second frame beyond 20 m; L4 horde is instanced; dynamic resolution |
| R8 | Levels built without an editor look samey or broken | Medium | Medium | The §15.3 spine-and-zones format, per-biome prop lists, hand-placed set pieces only, and smoke-test screenshots per zone |
| R9 | The cutscene system grows into an editor | Medium | Medium | A fixed DSL (Appendix B); no lip sync, no IK; cuts instead of blends; skippable |
| R10 | Audio gaps (wind, bell, crow, hyena laugh) and taste mismatch (creepy forest track) | High | Low | zzfx and Web Audio synthesis; an audition list in §12; the fallback tracks noted there |
| R11 | **IP and legal.** The original concept drew on third-party content (see `docs/PROVENANCE.md`). On 2026-10-13 the game moved to the Token Tails IP and those elements were removed. | Medium | High | Don't ship outside reference images; no token names, logos or links; every line of writing is original (§3.5); the title and island name sit in one constant (now PAWSBURY KNIGHT / Purrhaven Isle); a git-history rewrite is a founder decision.|
| R12 | Browser quirks: pointer lock, autoplay, iOS audio interruptions, Ogg playback on Safari [unverified] | Medium | Medium | Resume audio on the first gesture and on `statechange` (tech §14); transcode the `.ogg` music to `.mp3` as well, using the imageio-ffmpeg binary the research agents installed |
| R13 | **Shipped size.** `public/assets` is about 195 MB and 1,946 files, and Vite copies all of `public/` into `dist/` | High | High | Keep the full library outside `public/` (for example `assets-library/`) and copy only the files listed in a used-assets manifest at build time, or add a prune step. Re-encode music at about 96–128 kbps (it is about 41 MB now). Load each level's assets lazily. Target: initial download under 25 MB and total under 80 MB [rec]. |
| R14 | Parallel agents break each other's interfaces | Medium | High | tech §3/§20: frozen `events.js`/`ctx`, additive requests (§15.2), contract tests, `npm run check` before every handoff |
| R15 | Balance is untested, so it may be too hard for a cute game | High | Medium | Every number lives in config; Squire mode; generous telegraphs (at least 0.45 s); 2 attack tokens; M4 balance pass using god-mode hooks and recorded deaths per arena |
| R16 | Touch and mobile performance is unknown (only desktop Iris Xe was measured) | High | Medium | A Low preset (4k grass, no shells, no composer); touch is in MVP but "mobile 30 fps" is a best-effort goal, not a ship gate |

---

## 18. Open questions / unverified items

- How the red tint looks on `Dragon_Evolved`'s atlas, and the black tint on `Pigeon`'s atlas.
- Which Rat bone, if any, is a front paw (for the sabre).
- That the Barbarian and Rogue_Hooded bone names match the Knight's. ASSETS.md says KayKit characters share one rig; I checked only Knight and Skeleton_Warrior.
- Whether the downloaded SFX fit the hyena cackle, crow and bat sounds.
- Whether `dark_forest_creepy` is too dark in tone for L2.
- Safari support for Ogg Vorbis.
- Mobile frame rate.
- Whether any meme-derived name or line may be used commercially.

---

## Appendix A — Config tables (starting values)

```js
// src/core/config.js (excerpt; the design owns these numbers, the core agent merges them)
export const PLAYER = {
  height: 1.0, radius: 0.32, maxHpStart: 10, maxHpCap: 16, livesPerLevel: 9,
  walk: 2.2, run: 5.5, accelDamp: 14, decelDamp: 18, airDamp: 4, turnDamp: 16,
  gravity: 22, jumpV: 7.0, jumpCut: 0.5, coyote: 0.12, jumpBuffer: 0.15,
  glide: { fall: 1.8, speed: 4.5, max: 1.5 },                       // MVP+
  dodge: { dur: 0.40, v0: 9, v1: 4, iframes: [0.04, 0.30], cooldown: 0.25 },
  hurt: { stun: 0.35, iframes: 0.9, blinkHz: 15, hitstop: 0.07 },
  guard: { enter: 0.08, arc: Math.PI / 3, pushback: 0.3, turnRate: Math.PI, perfectWindow: 0.15,
           parryStagger: 1.0, bossParryStagger: 0.5, breakStagger: 0.6, breakDamageMul: 0.5 },
  charge: { start: 0.35, tier1: 1.1, moveMul: 0.4 },
  valor: { max: 100, perHit: 6, perSwingCap: 12, perParry: 20, perGraze: 10, holyCost: 50 },
  milk: { start: 3, sip: 0.8, heal: 4, moveCap: 1.1 },
  assist: { angle: Math.PI / 3, range: 3, touchAngle: Math.PI / 2, touchRange: 4 },
  lockOn: { range: 12, cone: 1.75, breakRange: 16 },
  camera: { dist: 3.6, lockDist: 4.5, bossDist: 6.0, fov: 45, pitch: [-0.35, 1.1] },
};

export const ATTACKS = { // replaces tech.md §9.1 placeholder damage values
  slash1: { dur: .40, active: [.10, .22], arc: { range: 1.9, from:  1.2, to: -1.2, y0: 0, y1: 1.4 }, dmg: 10, knock: 4, poise: 1, hitstop: .05, shake: .15, lunge: 2.5, combo: [.18, .40], next: 'slash2' },
  slash2: { dur: .40, active: [.10, .22], arc: { range: 1.9, from: -1.2, to:  1.2, y0: 0, y1: 1.4 }, dmg: 10, knock: 4, poise: 1, hitstop: .05, shake: .15, lunge: 2.5, combo: [.18, .40], next: 'slash3' },
  slash3: { dur: .60, active: [.20, .32], arc: { range: 2.3, from:  1.7, to: -1.7, y0: 0, y1: 1.6 }, dmg: 20, knock: 9, poise: 3, hitstop: .09, shake: .35, lunge: 4.0, next: null },
  heavy:  { base: 'slash3', poise: 4, guardBreak: true },
  pounce: { dur: .30, active: [.06, .20], arc: { range: 1.6, from: .9, to: -.9, y0: -1.2, y1: .6 }, dmg: 15, knock: 5, poise: 2, hitstop: .06, shake: .2, bounceV: 4 },
  holy:   { dur: .85, active: [.22, .36], arc: { range: 3.6, from: Math.PI, to: -Math.PI, y0: 0, y1: 2.5 }, dmg: 50, knock: 14, poise: 99, hitstop: .14, shake: .6, slowmo: [.35, .25], iframes: [.22, .46], projectile: 'holyWave' },
  holyWave: { speed: 14, range: 10, width: 2.4, dmg: 30, pierce: true, eatsProjectiles: true },
};

export const DIFFICULTY = {
  squire: { dmgTakenMul: .5, lives: Infinity, tokens: 1, enemyHpMul: 1.0 },
  knight: { dmgTakenMul: 1., lives: 9,        tokens: 2, enemyHpMul: 1.0 },
  nine:   { dmgTakenMul: 1.5, lives: 9, livesScope: 'game', tokens: 3, enemyHpMul: 1.3 },
};

export const ENEMIES = {
  rat_pike:  { model: 'creatures/polypizza/Rat.glb', h: .7, r: .3, hp: 30, poise: 2, mass: .8, walk: 1.6, run: 3.8, sight: 10, fov: 2.1, leash: 18,
               attack: { id: 'pike', windup: .55, range: 1.6, dmg: 1, knock: 3, recover: .8, followUp: { chance: .3, windup: .3 } },
               anims: { idle: 'Rat_Idle', walk: 'Rat_Walk', run: 'Rat_Run', windup: 'Rat_Idle', strike: 'Rat_Attack', die: 'Rat_Death' }, fish: [2, 3] },
  rat_sling: { model: 'creatures/polypizza/Rat.glb', h: .7, hp: 20, poise: 1, keep: [6, 9], aim: .8, shotSpeed: 12, dmg: 1, rate: 2.5, fleeAt: 3, fish: [2, 2] },
  crow:      { model: 'creatures/monsters-flying/Pigeon.glb', span: 1.2, hp: 20, poise: 1, alt: 4, circle: 5, dive: { tele: 1.0, speed: 10, dmg: 2, stuck: 1.2 }, hittableBelow: 1.6,
               anims: { idle: 'Flying_Idle', move: 'Fast_Flying', strike: 'Headbutt', hit: 'HitReact', die: 'Death' }, fish: [2, 2] },
  jelly:     { procedural: true, sizes: { L: { h: .8, hp: 40, dmg: 2, r: .9 }, M: { h: .5, hp: 20, dmg: 1, r: .7 }, S: { h: .3, hp: 10, dmg: 1, r: .5 } },
               hopEvery: 1.2, slam: { tele: .5, leap: 3, air: .6 }, split: { L: ['M', 2], M: ['S', 2] }, maxOnScreen: 12 },
  spider:    { model: 'creatures/polypizza/Spider.glb', h: .5, hp: 35, poise: 2, burst: [5.0, 1.2, 1.0], web: { tele: .6, range: 7, speed: 10, slow: .5, dur: 2 },
               bite: { windup: .45, range: 1.2, dmg: 2, recover: .9 }, fish: [3, 3] },
  hyena:     { model: 'characters/kaykit/Barbarian.glb', head: 'hyena', plate: 'HATER', weapon: 'weapons/skeleton/Skeleton_Blade.glb', h: 1.35, r: .4, hp: 50, poise: 3, mass: 1.4, walk: 2, run: 5,
               slash: { windup: .5, range: 1.8, dmg: 2, knock: 5, recover: .7 }, lunge: { windup: .6, from: [3, 5], speed: 6, dur: .4, dmg: 2 }, laughAfterHit: 1.0, fish: [4, 6] },
  stealer:   { model: 'characters/kaykit/Rogue_Hooded.glb', head: 'hyena', plate: 'POST STEALER', h: 1.2, hp: 30, poise: 1, run: 6,
               snatch: { windup: .6, speed: 9, dur: .35, frac: .10, min: 5, max: 50 }, fleeTime: 8, returnBonus: 5, fish: [3, 3] },
  pug:       { model: 'characters/kaykit/Knight.glb', head: 'pug', show: ['Rectangle_Shield', '1H_Sword', 'Knight_Helmet'], h: 1.25, r: .45, hp: 60, poise: 5, mass: 2, walk: 2.5, run: 3.2, turnRate: 2.09,
               shield: { arc: 1.22, breakBy: ['heavy', 'holy', 'pounce'], breakStagger: 1.5 },
               bash: { windup: .6, range: 1.5, dmg: 2, knock: 8 }, chop: { windup: .5, range: 1.7, dmg: 2 }, fish: [5, 5] },
  // MVP+
  husky:     { model: 'characters/kaykit/Barbarian.glb', head: 'husky', show: ['2H_Axe'], h: 1.7, hp: 120, poise: 8, mass: 4,
               slam: { tele: .9, r: 3, dmg: 3, knock: 10, unblockable: true }, spin: { windup: .7, r: 2.2, dmg: 2 }, fish: [10, 10] },
  bat:       { model: 'creatures/polypizza/Bat.glb', h: .4, hp: 10, speed: 6, swoop: { tele: .45, dmg: 1 }, swarm: [4, 6], fish: [1, 1] },
  hornet:    { model: 'creatures/polypizza/Wasp.glb', h: .6, hp: 25, hover: 1.5, dash: { tele: .7, speed: 14, len: 8, dmg: 2, dizzy: 1.0 }, fish: [3, 3] },
};

export const BOSSES = {
  grizzlechop: { hp: 400, poise: 12, arena: 24, phases: [1.0, .6, .25], h: 1.7 },
  snickerfang: { hp: 650, poise: 15, arena: 'causeway', phases: [1.0, .6, .3], h: 2.2 },
  barkus:      { hp: 1200, poise: 25, arena: 20, phases: [1.0, .65, .35], rallyAt: .10, goldenHour: { dur: 10, dmgMul: 2, holyFree: true, worldTimescale: .8 }, h: 3.0 },
  sovereign:   { hp: [300, 150, 60], counts: [1, 2, 4], sizes: [4, 2.8, 1.8] }, // MVP+
};

export const ECONOMY = {
  bossFish: 100, milkPrice: 20, satchel: [100, 200], sharpness: { mul: [1.15, 1.30, 1.50], cost: [120, 240, 400] },
  library: { quickCharge: { tier1: .8, cost: 200 }, valorGain: { mul: 1.25, cost: 150 }, waveReach: { range: 15, cost: 200 } },
  capeCost: 80, goldenFishPerLevel: 5, heartBells: 3,
  skins: { squire: 0, fishbone: 4, baguette: 6, yarnbrand: 8, diamond: 12, claymore: 'afterL4', dawnblade: 'finish' },
  companions: {
    mochi:  { q: 'shieldWall', dur: 4, width: 3, taunt: 6, cd: 18 },
    sage:   { q: 'volley', arrows: 5, targets: 3, dmg: 8, mark: [1.25, 5], cd: 14, passive: { flyerShot: 2.5, dmg: 6 } },
    clover: { q: 'mend', heal: 4, over: 3, cd: 30 },
    common: { dmg: 5, rate: 1.6, follow: 2.5, teleport: 15, engage: 6, koTime: 8 },
  },
};
```

## Appendix B — Cutscene step DSL (example: CS-03 "Milk Break")

```js
// src/story/cutscenes/milk_break.js — positions are relative to the level's 'glade' anchor
export default [
  { t: 'letterbox', on: true },
  { t: 'music', track: null, fade: .8 },
  { t: 'pose', actor: 'swordcat', pose: 'sit_sip', prop: 'milk_cup' },
  { t: 'cam', mode: 'handheld', from: [0.4, 0.75, 0.6], look: 'swordcat@head', fov: 60, dur: 4.0, noise: .015 },
  { t: 'sfx', name: 'pickup/bubble2', at: 1.2 }, { t: 'anim', actor: 'swordcat', fx: 'earFlick', at: 2.0 },
  { t: 'shake', trauma: .2 }, { t: 'pose', actor: 'swordcat', pose: 'freeze', dur: .6 },
  { t: 'cam', mode: 'whip', yaw: 2.1, dur: .25, bloomSpike: 1.5 },
  { t: 'cam', mode: 'fall', roll: 1.57, to: [0.9, 0.12, 0.2], dur: .35 },          // camera lies sideways in the grass
  { t: 'spawn', id: 'ember', asset: 'dragon', at: [0, 0, 9], tint: '#E0503A', anim: 'Flying_Idle' },
  { t: 'move', actor: 'ember', to: [0, 0.4, 2.2], dur: 1.4, ease: 'out' },
  { t: 'parallel', steps: [ { t: 'anim', actor: 'ember', clip: 'Headbutt' }, { t: 'sfx', name: 'creature/creature_roar_02' }, { t: 'shake', trauma: .7 } ] },
  { t: 'wait', dur: 1.2 },
  { t: 'letterbox', on: false },
  { t: 'objective', id: 'net_ropes', text: 'Cut the net ropes', max: 3 },
  { t: 'music', track: 'battle_fast_fight_loop', fade: .5 },
  { t: 'arena', id: 'glade', lock: true },
];
```

Step types: `letterbox, cam(path|handheld|whip|fall|orbit|dolly), pose, anim, move, spawn, despawn, say, choice(cosmetic only), sfx, music, shake, fx, fog(density,dur), wait, parallel, flag, objective, arena, timescale, skipTo`.

Rules:
- Every cutscene must end with the camera handed back and the letterbox off.
- `skipTo` defines the end state applied when the player skips.
