# SWORDCAT — Too Small for the Sword
## Game Design Document — Story & Charm Edition

Version 1.0 · 2026-10-07 · Inputs: `research/trend.md`, `research/art.md`, `research/tech.md`, `public/assets/ASSETS.md`, `research/ref/*`, frames in `research/videos/frames/`

**What this document is.** A complete design for the game, written from the angle of story, character and charm first. Mechanics, numbers, levels and the tech mapping are all here, but every system is justified by a feeling it has to produce. A parallel document, `research/design_scope.md`, takes the shippable-scope angle; where the two disagree, the integrator picks.

**Tags**
- **[TREND]** a fact or scene from `trend.md` (V1–V8 = its video breakdowns). **[REF]** seen in `ref1/ref2/ref3`.
- **[ART]** / **[TECH]** / **[ASSET]** taken from `art.md` / `tech.md` / `ASSETS.md`.
- **[NEW]** a design decision made in this document.
- **[unverified]** a claim or assumption nobody has checked. **[audition]** an audio file I could not listen to; it must be picked by ear.
- **[MVP]** must ship · **[STRETCH]** after MVP (full list in §16).
- Every number is a **starting value for tuning**. Nothing here has been playtested.

**Units and scales (shared with tech.md §2).** 1 unit = 1 m = Swordcat's height to her ear tips. Fixed step 1/60 s. **Damage uses a ×10 scale**: a basic slash does 10. **Player HP is counted in half-hearts**: 1 HP = half a heart, so "dmg 2" against her means one full heart.

---

## Contents
0. Sources, homage and IP notes
1. Title, logline, pitch, pillars
2. World and setting
3. Characters
4. Story (structure, synopsis, cutscenes, dialogue)
5. Swordcat: moveset and rules (exact numbers)
6. Fellow kittens as companions
7. Enemies
8. Bosses
9. Levels
10. Progression and economy
11. UI / HUD
12. Controls
13. Audio plan
14. Visual direction
15. Technical mapping
16. MVP vs stretch
17. Open questions and risks

---

## 0. Sources, homage and IP notes

The game recreates the **feeling** of the viral "kitten knight" clips and stills, not the clips themselves.

| Viral source [TREND] | Where it lives in the game |
|---|---|
| V1 core loop: a tiny kitten holds a sword upright before her face while the cape billows in fog, with no action | Title screen, the Prologue's "Stand" shot, and the **Meme Cam** that triggers when idle (§5.9) |
| V2: the "HATER" / "POST STEALER" hyena horde charging out of the fog | Prologue reverse shot, the **Hater Horde** faction, the **Post Stealer** recurring thief, and L4 "The Low Gate" |
| V3: the milk-sipping selfie interrupted by a red dragon roaring out of the fog | L1 cutscene "Milk Break, Interrupted", which introduces **Pudding** the dragon. Milk is the healing item. |
| V4: riding a red dragon in an aerial battle | **Sky Ride** set piece between L5 and L6 [STRETCH; MVP version is a cutscene] |
| V5: a camera pull-back that reveals a giant knight beside the kitten | Prologue gag (the giant **Sir Tallbert** statue). L4 pull-back that reveals **every kitten you rescued** standing behind her. |
| V6 *The Last Vigil* (a fan series, not the creator's): holding a gate alone, lantern by a sleeping dragon, champion kneeling to her level, sunrise flight over clouds | L4 gate defense, L2 "Lantern Night", L4 champion **Gnash** kneels, the ending flight. **Only these generic beats are borrowed; no names, characters or plot from that series.** |
| ref1 golden glow and sparkles | **Gold Hour Strike** and **Lit From Within** (§5.5–5.6) |
| ref2 full-body model sheet with red cape | Default look after Chapter 1, and the **Vigil** pose at checkpoints |
| ref3 paler cream kitten with a cream cape | **Pearl**, her little sister, and the "Pilgrim" cream cape |
| "Protecting meow island with 9 lives" (creator's IG bio) | The setting **Meow Island** and the **Nine Lives** system |
| Captions: "Too small for the sword. Holding it anyway." · "The armor is borrowed. The hour is gold." · "born to :3, forced to (sword emoji)" · "me trying to handle things maturely" | Chapter titles, dialogue and achievement names |

**IP and tone rules**
- The character design's ownership is **[unverified]**. @sickmanai has implicitly *claimed* the viral loop; that is a claim, not proof [TREND]. Several memecoins use the same imagery and the "Swordcat" name.
- So: no creator names, no token names, no crypto references anywhere in the game. Our heroine has her own name, story and procedural model. Before any public release, the use of "Swordcat" as a title and "Meow Island" as a setting needs a legal check **[unverified]**. Fallback names: *Sword Kitten* and *Purrhaven Isle*.
- The swordcat.lol lore lines are short quotations used as homage. If legal review says otherwise, the backup lines in §4.8 replace them.
- The tone is the meme's: **fierce cuteness, played completely straight.** Swordcat never winks at the camera. The comedy comes from everyone else reacting to her.

---

## 1. Title, logline, pitch, pillars

**Title:** **SWORDCAT**
**Subtitle:** *Too Small for the Sword*
**Genre:** 3D third-person action-adventure in the browser (three.js / WebGL2), about 2–2.5 h for the full game and about 60 min for the MVP. Desktop and mobile.

**Logline.**
> When a laughing horde of hyenas steals the kingdom's squire kittens and its golden hour, the smallest would-be squire on Meow Island straps on borrowed armor and a sword twice her size. She is too small for the sword. She holds it anyway.

**Pitch.** Clementine is a fluffy ginger kitten with a pink bow and wide, slightly worried blue-grey eyes. She is told she's too small to become a squire. That night the Hater Horde marches out of the fog, takes her sister and every squire on the island, and laughs at the tiny knight standing in their way. They don't even fight her; they walk around her. She follows them anyway. Across six foggy medieval lands she rescues kittens, befriends a giant red dragon who is scared of everything, and learns that brave isn't about being big. Brave is staying where you are when it counts. At the end, she rings the bell that brings back the golden hour.

**Pillars**
1. **Fierce cuteness.** Everything is soft, round and fluffy, and everything is played like an epic. Fog, cinematic framing, a serious kitten.
2. **Stand your ground.** The signature mechanic is the **Stand**: she plants the sword in the meme pose and blocks, parries, and builds **Valor**. The moment fans know from the meme is also the core of the combat.
3. **Never alone.** Every kitten you rescue comes home to Pawsbury and stays there. They make the hub fuller, they become companions, and at the climax they stand behind you.
4. **The hour is gold.** The world gets visibly darker and foggier as the story goes on, until her golden glow is the only warm light left. At the end, the fog lifts across the whole island.

**Audience.** All ages. Cartoon combat with no blood: defeated enemies "poof" and run away [ART §8].

---

## 2. World and setting

### 2.1 Meow Island
A small island kingdom wrapped in sea fog, populated entirely by cats of every coat and size, plus a few animal neighbors. The island lies in the **Big Sea**; across the water to the north is the **Isle of Howls**, where the hyenas live.

The architecture is medieval storybook at kitten scale [ART §1]: doors are 1.6 m tall and cottages 3–5 m, with timber frames, slate roofs, banners with pink-and-gold paw crests, and fish-shaped weathervanes. The tallest building is the **Bell Tower** of Pawsbury Castle, where the **Sunbell** hangs.

### 2.2 Regions (each one is a biome from art.md §12)

| Region | Mood | Who lives there | Level |
|---|---|---|---|
| **Purrdale Meadows** (south) | Misty grey-green farmland, standing stones, windmills, drystone walls. **This is the exact look of the reference images.** | Farm cats, cows, scarecrows | Prologue, L1 |
| **Pawsbury** (centre) | Town and castle, cobbles, market, golden-hour light | Most of the island; the Kitten Academy; Princess Snowpaw | Hub, L4 |
| **Whiskerwood** (east) | Giant oaks, god rays, mushroom houses, fireflies | Forest cats, hedgehog families, moles underground | L2 |
| **Bogmire** (west) | Marsh, boardwalks, will-o'-wisps, a sunken chapel | Toads, slimes, one very damp postmistress's lost mail | L3 |
| **Frostwhisker Peaks** (north) | Snow, rope bridges, frozen waterfalls, abandoned watchtowers | Crows, ermines | L5 |
| **Houndhold Keep** (far north, on a crag above the clouds) | An old fortress taken over by the Horde. Storm, embers, red banners with a bone sigil. | The Hater Horde | L6 |

### 2.3 Lore and culture [NEW]
- **The Hour of Gold.** Every evening at sunset the **Sunbell** rings in the Bell Tower, the fog thins, and the whole island stops to bask in the last golden sunbeam. It is a national nap. Cats love sunbeams; the island turned that into a ceremony. Kittens are knighted during the golden hour on **Knighting Day**. The phrase "The hour is gold" is the island's way of saying *this moment matters*.
- **The Gloom.** The sea fog always wants to come in. When nobody keeps watch and nobody rings the bell, it gets thicker, greyer and quieter. In the game, the Gloom is literal: fog density is a story variable (§15).
- **The Knights of the Whisker Table.** The island's old order of cat knights. Each knight swears the **Vigil Oath**: *"Where I stand, the gate holds."* They are all very old now and live scattered around the island. Their oath pose, sword planted point-down with both paws on the pommel, is **Vigil** [ART §2.2, REF ref2].
- **Nine Lives.** Everyone on Meow Island knows cats have nine lives. Knights count theirs. Losing one is serious but not tragic; you go home, have soup, and are careful. Sir Marmalade is on his eighth, and nervous about it.
- **The Kitten Academy.** The squire school in Pawsbury. Squires must be "this tall to hold a sword". There is a painted height chart at the gate.

### 2.4 Factions
- **The Hater Horde** (villains): hyenas from the Isle of Howls led by **Lord Cacklejaw**. They paint their own titles on their armor in big scratchy letters, such as **HATER**, **POST STEALER**, **GRUMBLER**, **NAYSAYER**, **SCOFFER** and **SNEERER** [TREND V2]. They laugh at everything small. Their laughter literally thickens the Gloom.
- **Mercenaries hired by the Horde**, one per region, each a boss: the **Rat Militia** of Captain Grizzlechop (L1), **Mole King Burrowmaw** and his Molegrims (L2), the **Slime Sovereign** of the Bogmire (L3), and **Crow Queen Corvessa** (L5). The **Hound Legion** pug shieldbearers [ART] are the Horde's hired heavies.
- **Meow Island**: Princess Snowpaw's court, the Academy, the townsfolk, and every kitten you bring home.

---

## 3. Characters

### 3.1 The heroine: Clementine, "Swordcat"

**Name.** Her name is **Clementine** ("Clem" to her sister). The town kids call her **"Swordcat"** because she drags a too-big sword everywhere. It starts as teasing. By the end it is her knightly title: at her knighting she asks Princess Snowpaw to use it (§4.7). In UI and marketing she is always **Swordcat**.

**Look** [REF ref2, ART §2]
- A tiny, extremely fluffy ginger/cream long-haired kitten. The head is 38–40% of her height and the eyes are big and blue-grey. Her default expression is wide-eyed and slightly worried [TREND V1].
- **The pink bow on her left ear**, a gift from Pearl in the opening scene. It is never removed and appears in every shot.
- Polished silver plate that is slightly too big for her: four-lame pauldrons, gauntlets, tassets, greaves and a leather belt. **No helmet**: in the Prologue it falls over her eyes and she sets it aside, which is the in-story reason we always see her face.
- **Cape:** Marmalade's faded cream cape in the Prologue, matching the viral loop and ref3. Princess Snowpaw gives her the **royal red cape** (ref2) after Chapter 1. It is a cut-down royal tablecloth, "velvet, mostly".
- **The Borrowed Blade:** a straight longsword about 1.0 m long, the same height as she is [ART §4.3].

**Personality**
- **Earnest and polite.** She speaks in short, formal, knightly sentences that come out slightly wrong because she is a kitten: "Halt, villain." *(beat)* "...Please."
- **Literal-minded.** "I am not too small. The sword is too big. That is a different problem."
- **Scared, and stays anyway.** Her tell: her ears flatten for one beat before she plants her sword. She never runs from someone who needs her.
- **Loves** milk with a straw, sunbeams, Pearl, and being useful.
- **Fears** being sent home, and being laughed at. The second one is the villain's whole weapon.
- **Flaw:** she never asks for help. She thinks a knight must stand alone. Her companions and the L4 pull-back cure this.

**Arc**
1. **Belief at the start:** "Knights are big. I need to prove I'm big enough."
2. **Middle:** she acts the part anyway. She takes the *posture* of someone strong before she is strong, which is the community's reading of the meme [TREND §4].
3. **Midpoint (L4):** "Nobody's coming. So I'm staying." Then she discovers that somebody *did* come: every kitten she rescued.
4. **End:** "I don't need to be big. I need to be here. And I don't have to be here alone."

The game never makes her big. She does not grow up, transform or level into a giant. She becomes **lit from within** [TREND: swordcat.lol "lit from within"].

**Voice** [NEW]: no voice acting. She "speaks" in soft pitched kitten mews (§13.3), with text in the dialogue box. Her lines are the shortest in any scene.

### 3.2 Family and mentors

| Character | Look | Role | Personality and key line |
|---|---|---|---|
| **Pearl** | Tiny dilute cream/silver kitten with a pale pink bow (ref3) [ART §7] | Clementine's little sister. Taken by the Horde in the Prologue; rescued in L6. | Bossy, sweet, the only one who never thought Clem was too small. *"There. Now you look less scary." / "I wasn't scary." / "I know. I'm being nice."* |
| **Sir Marmalade** | Chonky orange tabby, grey muzzle, gold eye and an eyepatch, dented rusty plate, drooping plume, walking-stick greatsword, 1.25× width [ART §7] | Retired Knight of the Whisker Table, now Pawsbury's baker. The armor is his first, from when he was a kitten. Mentor; teaches the Oaths (new moves) in the hub. | Gruff, warm, smells of bread. *"The armor is borrowed. Bring it back with a story in it."* He starts the game on his **eighth life**, spends it in L4, and ends the game on his ninth. |
| **Princess Snowpaw** | White Turkish angora, odd eyes (blue and gold), lavender gown, tiny tiara with a pink gem [ART §7] | Young ruler of Meow Island. Quest giver; knights Swordcat in the ending. | Very formal, secretly sneaks snacks, and also cannot lift a sword. *"By the power vested in me by the Whisker Table, and also my mum..."* |

### 3.3 Fellow kittens: companions (rescued, then they join)
All kittens share `buildKitten(cfg)` with a unique silhouette prop [ART §7]. Gameplay numbers are in §6.

| Kitten | Look [ART §7] | Joins | Role | Personality | Signature line |
|---|---|---|---|---|---|
| **Mochi** | Tuxedo, amber eyes, a huge round tower shield, blue tabard, oversized pot helm | L1, freed from a rat cage cart | Squire / tank | Loud, cheerful, always hungry, brave in a clumsy way. A fellow "too clumsy" reject from the Academy. | *"I'm not scared! My tummy is scared. Separate thing."* |
| **Sage** | Silver mackerel tabby, green eyes, pointed leaf-green hood, short bow | L2, cut down from a net trap over a ravine (she lands on Mochi) | Ranger | Deadpan and sarcastic. Secretly the softest; cries at stories. | *"I've counted forty hyenas. We have four kittens and a spoon."* / Swordcat: *"Two spoons."* |
| **Clover** | Calico, hazel eyes, white coif, brass bell collar, flower staff | L2, found defending baby hedgehogs in the Mushroom Hamlet | Cleric / healer | Motherly and sing-song; calls everyone "sweetpea". Fierce if you hurt a baby. | *"Hold still, sweetpea. This'll only sting a bit. Mrrrr."* |
| **Earl Grey** | Siamese, sapphire eyes, giant floppy wizard hat with stars, round glasses, floating book | L3, **from inside the Slime Sovereign**, where he has been reading | Scholar-mage | Verbose and pompous. Hates being wet. Secretly delighted to be included. | *"Do you MIND? I was nearly at the good chapter."* |
| **Pip** | Solid black, yellow-green eyes, very long red scarf, tiny dagger | L5, in a hanging cage she already unlocked; she was "waiting for dramatic effect" | Scout / rogue | Chaotic little gremlin and an ex-pickpocket. Steals things back from the Horde. | *"Stole it. Stole that too. You're welcome."* |

### 3.4 Pawsbury NPCs and the 30 lost kittens

| NPC | Role | Line |
|---|---|---|
| **Sergeant Whiskerbottom** (grumpy grey tabby with a whistle) | Academy drill sergeant; runs the Prologue height chart. In the epilogue he hangs Swordcat's portrait above the chart. | *"Too small for the sword, Clementine." ... "And you've been very consistent about it. Next!"* |
| **Tom Tinpaw** (huge-pawed brown tabby, a bit deaf) | Blacksmith: sword sharpness and skins | *"SHARPER? IT'S A SWORD, NOT A— oh. You meant the SWORD. YES. SHARPER."* |
| **Madame Purrlette** (dramatic Persian with a pincushion) | Tailor: capes | *"Darling, the cape does not make the knight. But it does make the entrance."* |
| **Postmistress Hazel** (tired tortie in a post-office hat) | Post office: turn in Lost Letters for rewards | *"Every letter you bring back is a cat who finally hears from their mum."* |
| **Nana Nutmeg** (ancient fluffball who never fully wakes) | Storyteller; lore of the Whisker Table | *"In my day, knights were small too. We just stood on things."* |
| **Coo** (blob courier pigeon) [ASSET `creatures/monsters-blob/Pigeon.glb`] | Royal Post. Flies Snowpaw's recovered letters to the old knights (L3). | *"Coo."* (It only says "Coo.") |

**The 30 lost kittens** are hidden 5 per region (§10.3). Each one walks home to Pawsbury and **stays there visibly**: on fences, in bread baskets at the bakery, chasing butterflies, napping in sunbeams, knocking things off tables. Each has one line of dialogue. They are built with seeded `buildKitten` variety [ART §7: villager coats and accessories].

Names: Biscuit, Noodle, Tater, Waffles, Pickles, Button, Sprout, Muffin, Pebble, Toffee, Bean, Crumpet, Dumpling, Mittens, Socks, Turnip, Juniper, Figgy, Bramble, Nutmeg Jr., Puddle, Saffron, Ziggy, Wisp, Tumble, Fennel, Clove, Barley, Hazelnut, Truffle.

### 3.5 Big friends

| Character | What | Role |
|---|---|---|
| **Pudding** | A **huge red dragon**, about 6 m long, who is terrified of everything. He roars when he's nervous, which is always. He speaks only in roars; his subtitles appear in parentheses: *"ROOOAR. (Is that... milk?)"* [TREND V3–V6] | The tiny-brave / huge-timid foil. Introduced in L1 (Milk Break), asleep in L2 (Lantern Night), finds his courage in L4 (rises behind the gate), mount for the Sky Ride, and the ending flight. Model: `creatures/monsters-flying/Dragon_Evolved.glb` tinted red [ASSET; tint and scale **[unverified]** visually]. |
| **Sir Tallbert** | A giant stone statue of a "Tall Folk" knight at the Purrdale crossroads. Nobody remembers if he was real. | Prologue pull-back gag [TREND V5]. Model: `characters/kaykit/Knight.glb` at ×6 with a stone material and a frozen pose. |

### 3.6 Villains

| Character | Look | Role | Personality | Key line |
|---|---|---|---|---|
| **Lord Cacklejaw** | Chibi hyena warlord, 3.2 m. Spotted tan fur, dark mane, underbite with two little fangs, black iron plate `#2E3036` with blood-red trim `#8E1B22` and a bone sigil, tattered black cape, crown askew (`props/Crown.glb`), and a huge serrated cleaver-greatsword with a red-hot edge `#FF3B30`. His armor and palette reuse art.md's Dog Warlord spec. | Final boss. He steals the squires (the island's future) and later the Sunbell (its golden hour). | Laughs at everything small, and laughs *first*, because as the runt of his litter he was laughed at. Can't stand anyone who keeps standing. Redeemed in the ending. | *"A kitten! With a SWORD! And a little BOW! HAHAHA— no, stop, I can't— leave it. LEAVE it! It isn't even a threat!"* |
| **The Post Stealer** | Skinny hyena in a hood, "POST STEALER" scrawled on his breastplate [TREND V2], with a mailbag and a stolen signpost under one arm | Recurring thief and mini-boss. He steals signposts, the Royal Post bag, the gate's winch pin ("It's a post! Technically!") and the Sunbell. | Cheeky coward, loves puns. In the post-credits he becomes the Royal Postmaster. | *"Finders keepers! Stealers... also keepers!"* |
| **Gnash the Grand** | Big scarred hyena champion with a greatsword. The only hyena with no word on his armor. | L4 boss. He **kneels to her level** before the fight [TREND V6] and leaves the Horde after losing. Returns in L6 to lower the drawbridge. | Quiet and honorable; never laughs. | *"I don't fight from up there. Down here, we're equals."* |
| Mercenary bosses | Rat Captain **Grizzlechop** on his beetle **Clatterbug**; **Mole King Burrowmaw**; the **Slime Sovereign**; **Crow Queen Corvessa** [ART §11] | One per region (§8) | Each is comic, each was paid in something silly (cheese, worms, shiny things), and each gives a clue when beaten. | Grizzlechop: *"I yield! I YIELD! Mind the cheese!"* |

*Note for the integrator:* if the merged design keeps art.md's **Dog Warlord, Lord Barkus Grimjaw**, as final boss, Cacklejaw's arc transfers to him almost unchanged: laughter becomes barking, and "runt of the litter" still works.

---

## 4. Story

### 4.1 Theme and emotional arc
**Theme:** *Small is not the same as weak. Brave is just staying.*
**Second theme:** *You don't have to stand alone.*

| Beat | Where | Swordcat feels | Player feels |
|---|---|---|---|
| Rejected at the height chart | Prologue | Small, determined | Aww / injustice |
| The Horde laughs and walks around her | Prologue | Humiliated, then resolved ("...Okay.") | "Let's go get them" |
| First rescue, Mochi | L1 | "I can do this" | Competence |
| Milk Break, then Pudding | L1 | Startled, then kind | Laughter |
| Lantern Night: "I'm not brave. I'm just... here." | L2 | Doubt, honesty | Warmth |
| The undelivered letters; Marmalade's kitten letter | L3 | Sad ("nobody came") → understanding ("nobody *knew*") | Tenderness |
| "Nobody's coming. So I'm staying." → the pull-back | L4 | Alone, then not alone | **Peak emotion** (goosebumps) |
| Pudding rises behind the gate | L4 | Triumph | Triumph |
| The Sunbell is stolen; Marmalade spends a life | L4 end | Low point; grey world | Loss |
| Pip, the cold mountains, the Sky Ride at dawn | L5 | Grit | Wonder |
| Pearl rescued | L6 | Relief | Relief |
| The final Stand, the bell, the golden light | L6 | Lit from within | Catharsis |
| Milk for Cacklejaw | Ending | Compassion | "Oh no, I'm crying" |
| "Arise, Dame Swordcat" | Ending | Belonging | Joy |

### 4.2 Structure

| Act | Chapter (title from the meme captions) | Level id | Location | Boss | New companion | New Oath (move) |
|---|---|---|---|---|---|---|
| I | Prologue — **"Too Small for the Sword"** | `academy`, then `meadow` (practice field) | Kitten Academy, Marmalade's attic, Midnight Practice | — | — | Basics |
| I | Ch. 1 — **"Holding It Anyway"** | `meadow` | Purrdale Misty Meadows | Rat Captain Grizzlechop | Mochi | Pounce, Gold Hour Strike |
| — | Interlude — "The Hour Is Gold" (hub) | `village` | Pawsbury | — | — | — |
| II | Ch. 2 — **"Born to Purr, Forced to Fight"** | `forest` | Whiskerwood | Mole King Burrowmaw | Sage, Clover | Cape Glide |
| II | Ch. 3 — **"The Posts Do Not Stop"** | `bog` | Bogmire | Post Stealer (mini) + Slime Sovereign | Earl Grey | Steadfast II |
| II | Ch. 4 — **"Standing My Ground"** | `gate` | Pawsbury Low Gate under siege | Gnash the Grand | (the 30 kittens behind her) | **Lit From Within** |
| III | Ch. 5 — **"Nine Lives, One Heart"** | `peaks`, then `skyride` | Frostwhisker Peaks, then the sea of clouds | Crow Queen Corvessa | Pip | Ninth Life Grit |
| III | Ch. 6 — **"The Hour Is Gold"** | `keep` | Houndhold Keep | Lord Cacklejaw | Pearl (story) | — |
| — | Epilogue — **"Protecting Meow Island"** | `village` (golden) | Pawsbury | — | — | — |

*Note:* tech.md's smoke test loops over `meadow/forest/village/castle`. Replace `castle` with `gate` and `keep` [TECH §19.4].

### 4.3 Full synopsis, level by level

**PROLOGUE: "Too Small for the Sword"**
- On the eve of Knighting Day, Clementine fails the Academy height chart by one ear-tuft. Pearl, who is sleeping over at the Academy to watch tomorrow from the front row, ties a pink bow on Clem's ear "so you look less scary".
- That night Clem sneaks into Sir Marmalade's attic, finds a chest marked "M. — my first", and borrows the tiny armor and the long sword inside. The helmet falls over her eyes, so she leaves it.
- *Playable "Midnight Practice"* in the misty practice field: movement, jumping, the combo, the roll, the Stand and parry, the charge, and meowing at a cow.
- Then the fog thickens unnaturally. The grass stops moving and cackling comes from everywhere. The **Hater Horde** marches past in the fog carrying cages: Pearl and every squire kitten on the island. Clem plants herself in their path in the meme pose. **Lord Cacklejaw** leans down to look at her, laughs until he cries, and orders his horde to walk around her: "It isn't even a threat!" The Post Stealer takes the signpost next to her, then the Royal Post bag. The fog swallows them all. Clem stands alone, trembling. "...Okay." She lifts the sword again and walks into the fog.
- **Title card.**

**CHAPTER 1: "Holding It Anyway" (Purrdale Misty Meadows)**
- Dawn. The signposts are gone, so she follows the Post Stealer's trail of dropped letters.
- At the turnip farm, rats are looting crops. She frees **Mochi**, another Academy reject ("too clumsy"), from a cage cart. He insists on being her squire.
- At camp she takes a **Milk Break** and records a little selfie: "Day one of rescuing everyone." A huge red dragon roars out of the fog. It's **Pudding**. He is starving and terrified, and the Horde chased him out of his cave. She shares her milk. He flees the next time a rat squeaks, but now he's following them, at a distance, hiding behind trees much smaller than he is.
- In the **Stone Circle**, **Rat Captain Grizzlechop** fights from his armored beetle. Beaten, he yields and tells them the Horde paid him in cheese to slow down "anyone who followed. Which, to be fair, we expected to be... bigger." The cages went east into Whiskerwood. He hands over the cage keys: 2 squire kittens freed.
- She returns to Pawsbury.

**INTERLUDE: Pawsbury, the first golden hour**
- **Sir Marmalade** notices his armor. Long pause. *"The armor is borrowed. Bring it back with a story in it."* He teaches her the first Oaths.
- Princess Snowpaw gives her the **royal red cape**: "The Royal Wardrobe has nothing your size. Except this. It was a tablecloth."
- The **Sunbell rings**. The golden hour begins, and the whole town flops into sunbeams. The kittens she rescued wave from the fountain. The shops, the Kitten Barracks and the Post Office open.

**CHAPTER 2: "Born to Purr, Forced to Fight" (Whiskerwood)**
- Hornets are raiding the **Mushroom Hamlet**. **Clover** is defending a nest of baby hedgehogs with a flower staff. Once the hornets are cleared, she joins: "Somebody has to keep you lot alive."
- At the **Bramble Ravine**, **Sage** hangs in a Horde net trap. Swordcat cuts the rope and Sage lands on Mochi. "Thanks for the landing." "Mrrf."
- **Lantern Night.** At camp, Pudding sleeps curled around the clearing. Swordcat sits beside his nose with a lantern [TREND V6]. The companions talk; she admits she isn't brave. Mochi: *"That's what brave is, I think. Being scared and being here."*
- Down in the **Mole Tunnels**, **Mole King Burrowmaw** attacks in the Root Hall. He turns out to be very nearsighted. "You're a KITTEN? I thought you were an army. You were so... loud." The Horde paid him in worms. The cages went into the Bogmire, where the Horde keeps "the stolen post".
- New Oath: **Cape Glide**.

**CHAPTER 3: "The Posts Do Not Stop" (Bogmire)**
- Will-o'-wisps lead the party across boardwalks. Toads, slimes, rain.
- The **Post Stealer chase**: he runs along the boardwalks dropping letters, which she has to catch. She knocks the **Royal Post bag** loose, and he escapes downriver in a barrel: "Finders keepers!"
- In the sunken chapel, the **Slime Sovereign** has swallowed a scholar. **Earl Grey**, inside a bubble inside the slime, is reading a book and is very annoyed. Popped free, he joins "purely in an academic capacity".
- **The letters.** The bag holds Princess Snowpaw's summons to every old Knight of the Whisker Table: *"Please come home. The gate needs holding."* None was ever delivered. **Nobody came because nobody knew.** Also in the bag is a yellowed letter written by a kitten 40 years ago:
  > *Dear Knights. They say I am too small for the sword. I am going to hold it anyway. — Marmalade, age 7 months.*
- Clem holds it for a long time. Coo the pigeon takes the summons to the old knights. "Coo." (They will arrive in the epilogue, late.)
- Then a warning flare over Pawsbury: the Horde is marching on the capital.
- New Oath: **Steadfast II**.

**CHAPTER 4: "Standing My Ground" (the Low Gate, Pawsbury under siege)**
- The Horde fills the southern fog. The Post Stealer has stolen the portcullis winch pin, so **the gate won't close**. Marmalade: "Then somebody has to stand in it." The knights won't arrive in time.
- Swordcat walks out onto the causeway alone and stands in the meme pose. The Horde emerges from the fog behind the camera [TREND V2].
- "Nobody's coming," she whispers. **Pull-back:** behind her stand all the kittens she rescued, in pot helmets and colanders, holding spoons [TREND V5]. Mochi: "We're not leaving you out here by yourself."
- Three waves, then **Gnash the Grand** steps forward, kneels to look her in the eye, and duels her. Beaten, he lays down his sword. "Hold your gate, little knight." He leaves the Horde.
- Cacklejaw orders the full charge. Swordcat doesn't move. Her sword lights gold, **Lit From Within**, the ref1 image. Then **Pudding rises behind the gate** and roars, for the first time not out of fear [TREND V6]. The Horde flees.
- Celebration, cut short. In the chaos the **Post Stealer stole the Sunbell**. During the battle, Sir Marmalade threw himself in front of a ballista bolt meant for a kitten and **spent his eighth life**. He's fine, he's in bed, and he can't fight anymore. *"Doctor's orders. Bed and soup. You'll have to finish this one, Dame—"* "I'm not a dame." *"...Yet."*
- Without the bell, the Gloom rolls in for good. Pawsbury turns grey: the hub is desaturated and foggy until the ending.

**CHAPTER 5: "Nine Lives, One Heart" (Frostwhisker Peaks, then the Sky Ride)**
- The Horde fled north over the peaks to Houndhold Keep. Snow, wind, ermines in white camouflage.
- **Pip** is in a cage in an abandoned watchtower, already unlocked, waiting "for dramatic effect". She stole the Sunbell's **clapper** off the Horde's sled. "Bell's no good without the bonk-bit."
- At the summit, **Crow Queen Corvessa** attacks. Beaten, she admits Cacklejaw stole *her* crown first and she's been working to get it back. Pip produces the crown. "Stole it back. You're welcome." Corvessa leaves, mollified.
- **Sky Ride.** Pudding lands on the summit and lowers his head: "(Get on. Before I change my mind.)" They chase the Post Stealer's patched hot-air balloon, which is carrying the Sunbell across a sea of clouds at night, through crow swarms [TREND V4]. They pop the balloon at first light, and the Sunbell drops onto the Keep's bell tower.

**CHAPTER 6: "The Hour Is Gold" (Houndhold Keep)**
- The drawbridge is up. Then, from inside, it lowers: **Gnash**. "I owe you a gate."
- In the **Kennel Courtyard**, three levers guarded by pugs open the cages: **Pearl** and every squire kitten. Pearl: *"You came!"* Swordcat: *"Of course. I'm a knight."* Pearl: *"Since when?"* Swordcat: *"...Since now."*
- The **Laughing Halls**: corridors scrawled with insults and full of jeering hyenas. There are portraits of Cacklejaw as a runt pup, and someone has drawn horns on all of them.
- The **Bell Tower roof** at dawn: **Lord Cacklejaw**. In phase 2 he drowns everything in Gloom. In phase 3 his helm breaks and he's revealed to be... small, with a chipped ear.
- **The final Stand** (interactive): he brings the cleaver down; she holds the Stand; the blade stops on her sword. The clouds break and golden light pours in [ART §11]. She rings the Sunbell with a Gold Hour Strike. A golden shockwave rolls across the island and the fog lifts everywhere.

**ENDING and EPILOGUE**: see §4.7.

### 4.4 Cutscene scripting format (in-engine, data only)

Every cutscene is a data file in `src/story/cutscenes/<id>.js` driven by `StoryManager` [TECH §4: story owns cutscene steps]. All actors are the real in-game actors switched to a `scripted` state. There are no pre-rendered videos.

**Step types**

| Step | Fields | Implemented by |
|---|---|---|
| `cam` | `mode: 'shot'|'rail'|'orbit'|'handheld'|'follow'`, `preset`, `path` (named CatmullRom anchor list in level data), `fov` (number or [from, to]), `dur`, `ease`, `look` ('actor:id@bone' or anchor), `dof: {focus, aperture}`, `roll` | camera agent: `FollowCamera` cutscene mode |
| `actor` | `id`, `pose` ('vigil', 'oath', 'idle', 'sit', 'sip', 'kneel', 'faint'), `moveTo` anchor, `speed`, `face`, `anim` (GLB clip name), `emote` (ears flatten, tail puff, blink) | player / enemies / companions via a `scripted` FSM state |
| `say` | `who`, `text`, `portrait`, `auto` (seconds; 0 = wait for input) | ui dialogue box + audio babble |
| `sfx` / `music` | `id`, `at` (anchor for 3D), `vol`, `rate` / `track`, `fade` | audio |
| `env` | `fogDensity` (to), `wind` (grass `uWind`), `sun` (color, intensity), `grade` ('grey'|'gold'), `dur` | world env controller |
| `fx` | `burst` kind, `at`, `count`; `holy` 0..1; `shake` trauma | fx |
| `ui` | `letterbox` on/off, `title` {text, sub}, `caption` text, `fade` to color | ui |
| `time` | `scale`, `dur` (real seconds) | core `Loop.timeScale` |
| `flag` / `spawn` / `despawn` / `wait` | story flags; actors; `wait: 'input'|'dialog'|seconds` | story |

All cutscenes can be skipped (hold Esc / gamepad B / touch for 1.0 s) after the first viewing, and the Prologue can be skipped from the first viewing. Skipping applies every `flag`, `spawn` and `env` end state.

**Camera presets**

| Preset | Placement (target-local; target faces +Z; feet at origin) | FOV | Notes |
|---|---|---|---|
| `MEME_LOOP` (V1) | camera at (0.06, 0.70, 1.15), looking at (0.03, 0.82, 0) | 32 | Bokeh focus on her eyes, aperture ×3. 0.5 cm handheld sway. Cape wind ×1.6, mist cards ×2 speed. Holds 3.8 s, the length of the viral loop [TREND V1]. |
| `REVERSE_HORDE` (V2) | (0.35, 0.55, −1.4), looking along her facing to 25 m | 38 | Low, over-the-shoulder, with cape in the foreground |
| `PULLBACK` (V5) | Starts at `MEME_LOOP`, dollies to (0, 4.0, 14) over 6 s | 32 → 50 | Ease in-out sine; DOF focus follows the distance |
| `SELFIE` (V3) | (0.25, 0.92, 0.45) facing her, roll 6° | 50 | 1–2 cm handheld noise; her gauntlet edge in frame |
| `CRANE_DOWN` | path anchor list | 40 | Establishing shots |
| `ECU_EYES` | (0, 0.79, 0.35) | 25 | Extreme close-up on the eyes; shows tremble and glisten |
| `FLIGHT_ORBIT` | orbits Pudding at r 9 m, height 2 m, 8°/s | 45 | Sky Ride and ending |

### 4.5 Opening cutscene: "Knighting Eve" + "The Laughing Fog" [MVP]

**Part A: Knighting Eve** (about 65 s, `academy`, golden hour)

| # | Time | Camera | Action | Audio | Text |
|---|---|---|---|---|---|
| 1 | 0:00–0:04 | black | — | Procedural wind (§13) | Caption (Uncial Antiqua): *"Meow Island. The eve of Knighting Day."* |
| 2 | 0:04–0:12 | `CRANE_DOWN` from the Bell Tower: the Sunbell glints, then down to the Academy yard | A row of squire kittens; long golden shadows | `village_bards_tale` fades in | — |
| 3 | 0:12–0:20 | Medium | Sergeant Whiskerbottom measures kittens against the painted height chart ("SQUIRES MUST BE THIS TALL TO HOLD A SWORD", painted sword at 1.15 m). Stamp, stamp. | `ui/drop_00x` stamps | "Tall enough! Next!" |
| 4 | 0:20–0:30 | Low close on the chart | Clementine, in a plain squire tunic with no bow yet, steps up. Ears below the line. Tiptoes. Ears stretch straight up. Still one ear-tuft short. | Kitten mew babble | **Whiskerbottom:** "Too small for the sword, Clementine." **Clem:** "I was too small last year." **Whiskerbottom:** "And you've been very consistent about it. Next!" |
| 5 | 0:30–0:42 | Wide, then two-shot | The Sunbell rings. **Every kitten in the yard flops into a sunbeam at once** (sight gag). Clem sits alone on the steps. Pearl pads over and ties a pink bow on Clem's left ear. | Bell (procedural, §13), `cat_purrsleepy_loop` | **Pearl:** "There. Now you look less scary." **Clem:** "I wasn't scary." **Pearl:** "I know. I'm being nice. ...Tomorrow I'm watching from the front row! Sergeant says I can sleep over with the squires." |
| 6 | 0:42–0:55 | Night exterior, then the attic interior | Clem creeps up to Marmalade's bakery attic. A chest: "M. — my first". Tiny dusty armor and a sword taller than her. She lifts the sword; the tip drags. She holds it anyway. | `world/creak1-3`, `sword/sword_unsheathe` | — |
| 7 | 0:55–1:05 | Mirror two-shot | Armor montage: pauldrons clank; the helmet falls over her eyes; she takes it off, looks at it, and sets it aside forever; Marmalade's faded cream cape. She faces the mirror: a tiny knight. | `impact/chainmail1`, `impact/armor_light`, `impact/cloth` | **Clem:** "...Practice." |

**Playable: "Midnight Practice"** [MVP] (about 3 min, practice field in `meadow`, blue pre-dawn fog)
- **Prompts** on small parchment tags with wax-seal key glyphs [ART §13]:
  1. Move and look.
  2. Jump the fence (1.0 m).
  3. Snip–Snap–Swoosh on 3 straw dummies.
  4. Tumble past a swinging sack.
  5. The **Stand**: the "Wobble Knight" dummy on a spring swings back at her. Block it, then **parry** it (it spins around comically).
  6. Hold to charge an **Oath Spin** on a ring of 5 dummies.
  7. **Meow** at the sleeping cow (`creatures/animals/Cow.glb`). It answers `animal_moo` and wanders off, revealing **lost kitten #1 (Biscuit)**.
- **Sir Tallbert gag:** at the edge of the field the game holds her in `MEME_LOOP` for 2 s, then `PULLBACK` reveals the giant knight statue standing behind her in the same pose [TREND V5]. **Clem:** "...Hello." (The statue doesn't answer.)

**Part B: The Laughing Fog** (about 90 s, practice field)

| # | Time | Camera | Action | Audio / env | Text |
|---|---|---|---|---|---|
| 1 | 0:00–0:06 | Slow orbit | The last dummy falls. The wind dies (grass `uWind` 0.6 → 0.05). Fog density 0.045 → 0.075 over 6 s. | Drums, far away [audition: `c80_monster_*` pitched down, or procedural] | — |
| 2 | 0:06–0:14 | Handheld, her POV-ish | Cackling from every direction: 6 positional laugh emitters placed in the fog bank. Her ears flatten. Her tail puffs up. | Hyena laughs (§13 gap) | — |
| 3 | 0:14–0:24 | Wide | Hyena silhouettes march along the lane through the fog carrying cages. Pearl is in one. | — | **Pearl:** "CLEM!" |
| 4 | 0:24–0:28 | Tracking | Clem runs, trips on her cape, and gets up. | `impact/cloth_heavy` | — |
| 5 | 0:28–0:32 | Medium | She plants herself in the middle of the lane. | `sword/sword_unsheathe2` | — |
| 6 | 0:32–0:36 | **`MEME_LOOP`** (3.8 s) | **The meme shot.** Sword vertical before her face, cape billowing, fog drifting. Total stillness except wind and fur. | Music cuts. Wind only. | — |
| 7 | 0:36–0:42 | **`REVERSE_HORDE`** | The horde emerges toward the camera from behind her, armor scrawled HATER, GRUMBLER, POST STEALER. | Footsteps, chains | — |
| 8 | 0:42–0:52 | Low two-shot, then his face fills the frame | **Lord Cacklejaw** leans down, snout to her nose. She doesn't move. He squints. Then he explodes laughing. | Laugh | **Cacklejaw:** "A kitten! With a SWORD! And a little BOW! HAHAHA— no, stop, I can't— leave it. LEAVE it! It isn't even a threat!" |
| 9 | 0:52–1:02 | Top-down crane | The horde parts around her like a river around a stone: dozens of laughing hyenas and one tiny unmoving dot. The Post Stealer plucks the signpost beside her. | Laughter | **Post Stealer:** "Mine." *(takes the mailbag)* "Also mine." |
| 10 | 1:02–1:12 | `ECU_EYES`, then the paws | The fog closes. Silence. Her paws tremble on the grip. Her eyes glisten. | Wind | — |
| 11 | 1:12–1:20 | Medium | She lowers the sword. Breathes. Lifts it again, higher. **A single gold sparkle runs up the blade** (foreshadowing; `holy` 0.15 for 0.6 s). | — | **Clem:** "...Okay." |
| 12 | 1:20–1:30 | Behind her, wide | She walks into the fog after them. **Title card:** SWORDCAT in Cinzel Decorative gold with a pink bow on the "O" [ART §13], and the subtitle *"Too small for the sword. Holding it anyway."* | `battle_theme_a` sting [audition: start offset], then silence | — |

### 4.6 Key mid-game scenes

**CS-L1 "Milk Break, Interrupted"** [MVP] [TREND V3] (camp, `meadow`)
1. `SELFIE`: she holds a cup of milk with a straw, sips, and talks to the "camera" (her own gauntlet). Mochi is eating in the background.
   - **Clem:** "Day one of rescuing everyone. Morale: high." *(sip)* "Milk: also high."
2. A tremor. Rings ripple across the milk.
3. A whip-pan: camera yaw 120° in 0.18 s with an FOV spike of +15. The camera "drops" and lands **sideways in the grass** (roll 90°). The fallen cup is in the foreground; rack focus to the fog.
4. A huge red dragon emerges from the fog and **ROARS** straight into the camera. The jaws fill the frame, shake trauma 0.8, and the grass blasts flat (`uWind` spike to 3.0 for 0.5 s).
5. Cut: Swordcat stands over her fallen cup in the meme pose. Mochi hides behind her, even though he is twice her size.
6. Dialogue:
   - **Pudding:** "ROOOAAR. (Is that... milk?)" · **Clem:** "...It is."
   - **Pudding:** "RRrrr. (I haven't eaten in three days. The laughing dogs chased me out of my cave.)"
   - Clem holds up the cup. It's the size of a thimble next to his nose. **Clem:** "Here."
   - He sips through the tiny straw with enormous care. **Pudding:** "(...It's very good.)" · **Clem:** "What's your name?" · **Pudding:** "(Pudding.)"
   - **Mochi:** "The scary dragon is called PUDDING?" · **Pudding:** "ROAR! (Sorry! Sorry. I roar when I'm nervous.)"

**CS-L2 "Lantern Night"** [MVP] [TREND V6] (camp, `forest`, night)
- Pudding is curled around the clearing, asleep, snoring smoke rings. Swordcat sits by his nose with a lantern (a warm `PointLight` `#FFC46B`). Fireflies.
- **Sage:** "Can I ask something? Why you? You're the smallest of us." · **Clem:** "Because I was there."
- **Clem** *(after a long pause)*: "I'm not brave. I'm just... here."
- **Mochi** *(half asleep)*: "That's what brave is, I think. Being scared and being here."
- **Clover:** "Now go to sleep, sweetpea. Even knights need naps."
- Pudding's tail curls around all four of them. Fade out on `cat_purrsleepy_loop`.

**CS-L3 "The Letter"** [MVP: moved to the end of L2 if L3 is cut] (the sunken chapel, rain)
- She reads Snowpaw's summons. **Sage:** "They never got these. Nobody came because nobody knew." · **Clem:** "Then we tell them."
- She finds Marmalade's letter. `ECU_EYES`, no music for 4 s, then `story_lament_warriors_soul` comes in softly. She folds it and tucks it into her belt.

**CS-L4a "Nobody's Coming"** [MVP] [TREND V2, V5] (`gate` causeway)
1. `MEME_LOOP` on the causeway, then `REVERSE_HORDE`: the Hater Horde fills the fog bank 40 m ahead.
2. **Clem** *(barely audible)*: "Nobody's coming." *(ears flatten)* "So I'm staying."
3. **`PULLBACK`** reveals the rescued kittens standing behind her in pot helmets and colanders, holding spoons. **Their number equals `state.kittens.length`**, with a minimum of 3 placed by the script.
4. **Mochi:** "We're not leaving you out here by yourself." · **Biscuit** (a lost kitten): "I brought a spoon!" · **Clem** *(very quietly)*: "...Thank you."

**CS-L4b "The Champion Kneels"** [MVP] [TREND V6]
- Gnash walks out of the ranks, plants his greatsword, and kneels so that his eyes are level with hers.
- **Gnash:** "I don't fight from up there. Down here, we're equals. I've watched you all day, little knight. You never stepped back once."
- **Clem:** "I can't. The gate is behind me." · **Gnash:** "Then we understand each other." He stands and raises the sword. Boss music.

**CS-L4c "Pudding Rises"** [MVP] (after Gnash)
- Cacklejaw orders the full charge. Swordcat plants her sword. Gold climbs the blade: `holy` 0 → 1 over 2 s, framed as ref1 with sparkles. **Oath learned: Lit From Within.**
- Behind her, Pudding rises over the gatehouse, wings spread across the whole frame [TREND V6 frame f4], and ROARS. Subtitle: **"(NOT. MY. FRIENDS.)"** The Horde scatters.

**CS-L4d "The Bell Is Gone"** [MVP]
- Cheering, then silence. Camera tilts up to the Bell Tower: it's empty. A hyena silhouette with a huge bell bundled in a mailbag runs across a far roof. **Post Stealer:** "Special delivery!"
- Marmalade, bandaged, in bed with soup: *"Eighth life. Gone. Worth it, mind. ...You'll have to finish this one, Dame—"* **Clem:** "I'm not a dame." **Marmalade:** "...Yet."
- `env` grade → 'grey', fog 0.045 → 0.06. The hub stays grey until the ending.

**CS-L5 "Get On"** [MVP as a cutscene; interactive STRETCH] [TREND V4]
- At the summit, Pudding lands and lowers his head. **Pudding:** "(Get on. Before I change my mind.)" She climbs his neck; Pip rides behind her. `FLIGHT_ORBIT` over the sea of clouds at night, then the chase (§9, Sky Ride).

### 4.7 Ending cutscene: "The Hour Is Gold" [MVP] (about 3.5 min)

| # | Camera | Action | Audio / env | Text |
|---|---|---|---|---|
| 1 | Low, from behind her | **Interactive Final Stand** (§8 B6): the cleaver comes down; the player holds Stand; it stops on her blade. Time 0.25 for 1.5 s. | Silence and a heartbeat (`impactSoft_heavy` ×2) | — |
| 2 | Crane up | **The clouds break.** Fog 0.05 → 0.008 over 6 s. The sun turns from `#FFF2E0` to gold `#FFD9A8` ×2.0. A golden shaft cone `#FFE3A3` falls on her. Env PMREM regenerated with a gold horizon. | `story_lament_warriors_soul` swells [audition] | — |
| 3 | `MEME_LOOP`, then wide | Prompt "Ring the bell": the player presses attack. **Gold Hour Strike** into the Sunbell. | **BONG** (procedural bell) | — |
| 4 | Aerial, with tilt-shift DOF | A golden ring rolls out from the tower across the whole island. The fog lifts region by region: Purrdale, Whiskerwood, Bogmire, the Peaks, Pawsbury. | Bell reverb tail | — |
| 5 | Rubble, two-shot | Cacklejaw sits in the rubble, helm off, with a tiny chipped ear. He laughs weakly, then starts crying. Swordcat sits beside him and offers her milk with a straw. | `cat_purrsleepy_loop` | **Clem:** "Here. It helps." *(he sips; then a real, tiny, wheezy laugh)* **Cacklejaw:** "They used to laugh at me. The runt. So I laughed first. Always first." **Clem:** "You can stop now. I'll hold it for a bit." |
| 6 | Medium | Pearl tackle-hugs her. Both fall over, both bows bouncing. | `kitten_mew_01` | **Pearl:** "You're squishing my bow." **Clem:** "You're squishing *mine*." |
| 7 | Wide on the Keep gate | A donkey cart (`creatures/animals/Donkey.glb` + `env/town/cart.glb`) arrives carrying six elderly cats in rusty armor: the Knights of the Whisker Table, who got Coo's letters. | Donkey `animal_whinny` [audition] | **Sir Snoozalot:** "Did we miss it?" **Coo:** "Coo." |
| 8 | Pawsbury, golden hour (the hub, now golden) | **Knighting ceremony.** Every rescued kitten is there, plus Gnash at the back, Pudding peeking over the roofs, and Cacklejaw juggling in a jester hat. Princess Snowpaw drags a sword too heavy for her too. She taps one shoulder and misses the other. | `castle_kings_feast` | **Snowpaw:** "Kneel. Arise, Dame Clementine of the Pink Bow, Knight of the Whisker Table." **Clem:** "...Your Highness? Could it be 'Swordcat'? Everyone calls me that." **Snowpaw:** "Arise, **Dame Swordcat**." *(cheering)* |
| 9 | Two-shot at the bakery | She tries to give the armor back. | — | **Clem:** "The armor is borrowed." **Marmalade:** "Bring it back with a story in it, I said. ...There are a few more stories in there yet. Keep it." |
| 10 | `FLIGHT_ORBIT` | **Sunset flight over the sea of clouds** on Pudding, with Pearl behind her [TREND V6 finale; V6 is sunrise, ours is the same golden light]. Cape and fur in the wind, holy sparkles drifting. | `field_of_dreams` [audition] | Caption: *"The hour is gold."* |
| 11 | Credits | Credits roll over the flight, then over in-engine snapshots taken during the player's run [STRETCH]. | — | — |

**Post-credits:** the Pawsbury Post Office. The Post Stealer, in a postmaster's hat, stamps a letter. **"The posts..."** *(stamp)* **"...do not stop."** Cut to black.

### 4.8 Dialogue samples

**Swordcat barks** (always short)

| Trigger | Lines (one is picked) |
|---|---|
| Combat start | "Halt, villain." *(beat)* "...Please." · "En garde." · "I am a knight. Mostly." |
| Gold Hour Strike | "Gold hour!" · "For Pearl!" |
| Stand held while enemies approach | "Where I stand... the gate holds." *(first time only)* · "Not one step." |
| Perfect Stand (parry) | "No, thank you." · "Mrrp." |
| Low health | "I'm fine. I'm fine. I'm fine." |
| Life lost | "One less life. Okay." · "...Ow." |
| Last life | "Ninth life. Making it count." |
| Milk sip | "Mm." · "Mandatory milk break." |
| Lost kitten found | "Hello. You're safe now. Go to Pawsbury, follow the bell." |
| Idle in fog | *(sneeze)* "...chu." |

**Companion barks**
- **Mochi:** "Squire on duty!" · "I'm not hiding, I'm BEING A WALL." · *(on a rescued kitten)* "Another one! Can we keep them all?"
- **Sage:** "Target. Down." · "Behind you. Obviously." · "That was... actually cool. Don't tell anyone I said that."
- **Clover:** "Bell's ringing, sweetpea!" · "Who hurt you? Point."
- **Earl Grey:** "Elementary." · "Is it wet? It looks wet." · "A footnote! For you!"
- **Pip:** "Yoink." · "Look what fell into my paws." · "Distraction! It's me! I'm the distraction!"

**Enemy barks**
- **Rat Militia:** "Cheese for the Captain!" · "Squeak formation!" · *(when their friend falls)* "Nope. Nope nope nope."
- **Haters:** "Is that a sword or a toothpick?" · "Go home, fluffball!" · "Nobody's coming for you!" · "Hehehe-HAHA-hoo!"
- **Haters on defeat:** "...That was actually kinda cool." · "Tell no one." · "I'm telling my mum."
- **Hecklers:** "BOOOO!" · "Get off the stage!" · *(a parried BOO returns as YAY)* "...Yay?"
- **Pugs:** *(snort)* · "HRRF." · "Wall. Am wall."

**Lost Letters (samples of 30)**
1. *"Dear Mum. Squire food is fine. Please send fish. Not the bony ones. — Mochi"*
2. *"To the Hater Horde Armor-Painting Office: Please change my word from NAYSAYER to YAYSAYER. I've thought about it a lot. — Private Snorkle"*
3. *"Dear Postmistress, this is my seventh letter asking where my letters are. — Hazel's neighbor"*
4. *"Grizzlechop's shopping list: cheese, more cheese, a hat with a bigger feather, cheese."*
5. *"Dear Pudding. You can come home now. We fixed the cave. — the bats"*
6. *"To Whoever Finds This: I am a mole. I cannot read this. — B."*
7. *"Dear Clem, if you're reading this you found my secret letter spot. I'm proud of you. — P."* (Pearl; hidden in L6)
8. *"Dear Knights. They say I am too small for the sword. I am going to hold it anyway. — Marmalade, age 7 months."* (story letter, L3)

**Backup lines** in case the quoted captions are cleared out by legal: "Small knight, big oath." · "The armor fits where it counts." · "Here I stand."

---

## 5. Swordcat: moveset and rules (exact numbers)

Collision capsule r = 0.32, h = 1.0 [TECH §2]. All attacks are swept arcs [TECH §9.2]. Angles are relative to her facing.

### 5.1 Locomotion

| Move | Input | Numbers |
|---|---|---|
| Walk | Stick below 0.5 | 2.0 m/s |
| Run | Full stick / WASD | **5.5 m/s** (the procedural gait normalizes to 5.5 [TECH §11.2]). Accel 30 m/s², decel 40 m/s², turn rate 720°/s. |
| **Zoomies** [NEW] | Run 2.0 s continuously with no alerted enemy within 15 m | **7.5 m/s**. Ears back, tail straight up, a little puff of dust and hearts every 4 steps. Ends on stop, attack, or the first alerted enemy. It's a real kitten behavior, and it's the chase tool for the Post Stealer. |
| Jump | Space | Apex **1.25 m** (clears a 1.0 m fence). Gravity 28 m/s² rising, 40 m/s² falling. v₀ = 8.37 m/s. Releasing early multiplies upward velocity by 0.5. **Coyote time 0.12 s, jump buffer 0.15 s.** Squash −0.25 on landing, stretch +0.18 on takeoff. Air control 40%. |
| **Cape Glide** (Oath, after L2) | Hold jump while falling | Fall speed capped at **1.8 m/s**, horizontal 4.0 m/s, **up to 2.5 s** per airtime. The cape spreads like a parachute. Wind volumes push 3 m/s. |
| Step-up / slope | — | Step 0.3 m, max slope 45° |
| Water | — | Shallow water: speed ×0.6, and she shakes each paw (cat). Deep water or a pit: −1 HP and back to the last safe ground. **No life is lost.** |

### 5.2 Sword attacks (×10 scale; tech.md §9.1 timings)

| Attack | Input | Dur (s) | Active (s) | Range (m) | Arc | Damage | Knock | Poise | Hitstop | Lunge (m/s) | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Snip** (slash 1) | Attack | 0.40 | 0.10–0.22 | 1.9 | ±1.2 rad | **10** | 4 | 1 | 0.05 | 2.5 | Combo window 0.18–0.40 |
| **Snap** (slash 2) | Attack in window | 0.40 | 0.10–0.22 | 1.9 | ∓1.2 rad | **10** | 4 | 1 | 0.05 | 2.5 | Mirror swing |
| **Big Swoosh** (slash 3) | Attack in window | 0.60 | 0.20–0.32 | 2.3 | ±1.7 rad | **20** | 9 | 3 | 0.09 | 4.0 | Recovery can be roll-cancelled after 0.32 |
| **Pounce** (Oath, after L1) | Attack in the air | — | Plunge at 14 m/s | AoE r 1.3 | 360° | **20** | 6 | 2 | 0.07 | — | Bounce 4 m/s up on a hit; 0.25 s landing recovery; once per airtime |
| **Oath Spin** | Hold attack 1.1 s, release (Valor < 100 or Holy locked) | 0.55 | 0.08–0.30 | 2.3 | 360° | **30** | 10 | 4 | 0.09 | — | Also a guard-break (opens a Pug's shield) |
| **Gold Hour Strike** (Holy; Oath after L1) | Hold 1.1 s, release with **Valor 100** | 0.85 | 0.22–0.36 | 3.6 | 360° | **50** | 14 | 99 | 0.14 | — | **Costs 100 Valor.** I-frames 0.0–0.40. Time ×0.35 for 0.25 s. Plus the **Holy Wave**. |
| **Holy Wave** | Part of Gold Hour Strike | — | — | Travels 10 m at 14 m/s, 3.0 m wide | forward | **30** | 8 | 6 | — | — | Pierces; destroys enemy projectiles |

- **Charge rules.** Holding attack for more than 0.35 s starts the charge: she walks at 40% speed (2.2 m/s), sparkles build, and there's a tier chime at 1.1 s. Releasing between 0.35 and 1.1 s gives a Big Swoosh.
- **Aim assist.** On the first active frame she turns toward the nearest enemy within 60° and 3 m (90° and 4 m on touch) [TECH §9.4]. Attack and roll have a 0.2 s input buffer.
- **Combo DPS** at base sharpness: 40 damage per 1.4 s, about 29/s.
- **Damage numbers** show the value as is: "10", "20", "50". Crits don't exist; gold numbers mark Holy damage.

### 5.3 Defense: Tumble and the Stand

| Move | Input | Numbers |
|---|---|---|
| **Tumble** (dodge roll) | Shift / K | **0.40 s** at 9 m/s easing to 4 m/s (about 2.6 m). **I-frames 0.04–0.30.** Cooldown 0.20 s after the roll ends. Cancels attack recovery after the active window. Ground only. |
| **Purrfect Tumble** | A hit would have landed during 0.04–0.18 of a roll | Time ×0.4 for 0.35 s (real), "Purrfect!" text, **+15 Valor** |
| **The Stand** (guard) | Hold RMB / L | Enters the **Vigil pose** in 0.08 s [REF ref2]. She shuffles at **1.2 m/s** and turns at 360°/s. Blocks **frontal ±70°** melee and projectiles: **0 damage**, 0.4 m pushback. Each block costs **1 Grit**; she has **3 Grit** (three small shields over the hearts), regaining 1 per 1.5 s when not blocking. At 0 Grit: guard break, 0.8 s stagger. **Red-rimmed attacks are unblockable** (§7.0). |
| **Steadfast** (parry) | Start a Stand within **0.15 s** before a hit lands (**0.22 s** after the Steadfast II Oath) | Negates the hit. The attacker staggers **1.0 s** (bosses 0.4 s plus 5 poise damage). **+20 Valor.** Hitstop 0.10, a gold spark ring, and `sword_clash` + `metal_ringing`. After Steadfast II, **projectiles are reflected** at 1.5× speed for 15 damage. |
| **Standing Ground** [NEW] | Hold the Stand with an alerted enemy within 6 m | **+5 Valor per second.** Her cape billows harder and fog drifts faster around her. This is the meme as a mechanic: standing still and ready makes her stronger. |

### 5.4 Valor (the sword-shaped meter)
- Range 0–100. It fills the silver sword icon from the hilt, turns gold at 100, and gives off sparkles [ART §13].
- **Gains:**
  - +4 per landed Snip or Snap
  - +6 per Big Swoosh hit
  - +8 per target for an Oath Spin, capped at +24
  - +15 per Purrfect Tumble
  - +20 per Steadfast parry
  - +5/s while Standing Ground
  - +10 for interrupting a hyena's **Jeer** (§7)
  - +25 for rescuing a lost kitten
- **Loss:** −10 when hurt. It never decays. It persists through checkpoints and resets to 0 on level load.
- **Ninth life:** while on her last life, all Valor gains ×1.5 and the blade has a faint permanent glow [NEW].
- **Visual:** the blade's emissive tracks Valor (0 → 0.6) and becomes the full Holy look at 100 [ART §4.3].

### 5.5 Gold Hour Strike (ref1)
Charge visuals follow `charge` ∈ [0, 1] [ART §4.3 and §10.2]: blade emissive 0 → 4, the blade light streak, `PointLight('#FFD38A', 2.2 × charge, 3)`, the aura hull, fur `uHoly`, 160 sparkles, and bloom strength 0.55 → 1.2. On release: a white-gold flash, a ring shockwave decal, and the Holy Wave.

### 5.6 Lit From Within (Oath after L4; the ref1 power-up)
- **Trigger:** Valor 100, then press Stand + Attack together (or V / LT+X / the glowing touch button).
- **0.8 s activation:** the Oath pose; enemies freeze; she is invulnerable; the camera punches in to ref1 framing.
- **8.0 s duration:**
  - every slash does **×1.5** damage and fires a small holy crescent (4 m, 10 damage);
  - **no knockback or stagger** on her, and she takes ×0.5 damage;
  - +10% move speed;
  - fog density drops ×0.5 around the scene (the Gloom literally recedes).
- **Valor drain:** 12.5/s, so a full meter lasts 8 s. When it ends, if attack is held at 1.1 s, a free Gold Hour Strike fires.

### 5.7 Health, Milk and Nine Lives
- **Hearts:** she starts with **3 hearts (6 HP)**, because she is very small. Each **Yarn Heart** container (4 Yarn pieces) adds +1 heart, up to **6 hearts (12 HP)** (§10). Damage comes in half-hearts.
- **Hurt:** 0.35 s hurt stun, knockback, then **0.9 s of i-frames** with the mesh blinking at 15 Hz. Player-hurt hitstop 0.07 s [TECH §9].
- **Milk Break** (heal) [TREND V3]:
  - **0.9 s** sip through a straw (`pickup/bubble`). She can rotate but not move.
  - **Heals 4 HP** (2 hearts). If she's hit within the first 0.5 s, the sip is cancelled and the milk is not used.
  - Carries **2** bottles at the start and up to 5 with upgrades (§10). Mochi carries +1 while he is active.
  - Refills at **Vigil Stones** and Marmalade's bakery.
- **Nine Lives** [TREND bio]:
  - Every level attempt starts with **9 lives**. The HUD shows a cat head with a bow and "×9".
  - When HP reaches 0 she plays a cute **faint** (curls up on her cape, as in the V6 frame). Then a translucent little "life" kitten floats up and waves goodbye. The screen turns soft pink-white: *"8 lives left."*
  - She respawns at the last Vigil Stone with full hearts and 0 Valor. The current encounter resets; a boss resets to the start of its current phase.
  - At 0 lives: *"Time for a cat nap."* Options: "Retry chapter" (lives back to 9, collectibles kept) or "Back to Pawsbury".
- **Ninth Life Grit** (Oath after L5): once per level, a hit that would cost a life leaves her at 1 HP with 1.0 s of i-frames instead.
- **Vigil Stones** (checkpoints): mossy standing stones carved with a paw. She plants her sword in the **Vigil** pose to activate one, which saves, refills Milk and heals 2 hearts. There are 3–4 per level, about 3 minutes apart, with one always right before a boss arena.

### 5.8 Charm actions

| Action | Input | Numbers and effect |
|---|---|---|
| **Meow** | C / L3 / cat-face button | 0.6 s, cooldown 1.0 s. Unalerted enemies within 8 m turn toward her (aggro pull). Hidden lost kittens within 10 m answer with a mew and a sparkle. Companions answer "mrrp". Ermines in snow flinch "Eep!" and become visible for 3 s. Calms Pudding. Wakes sleeping NPCs. Tutorial: the cow. |
| **Slow blink** [NEW] | Automatic | Standing still for 3 s within 3 m of a companion: they trade slow blinks (cat affection), and a small heart puffs up. |
| **If it fits, I sits** [NEW] | Interact with a box or basket | She climbs in and sits. Purr loop; +1 HP every 3 s while sitting (out of combat only). 8 hidden boxes, about one per level, unlock an achievement. |
| **Tail puff** [NEW] | Automatic | When an enemy bigger than 2 m becomes alerted, her tail fur scales ×1.4 for 1.0 s (bottle-brush). |
| **Biscuits** [NEW] | Idle 6 s at a Vigil Stone | She kneads her cape before sitting. |
| **Sneeze** [NEW] | Random in thick fog (1 per 90 s) | "...chu." Cosmetic. |
| **Ear tell** | Before any Stand | Ears flatten for 0.1 s, then rise. |

### 5.9 Meme Cam (the signature idle) [MVP]
- **Trigger:** 15 s with no input, outdoors, no alerted enemy within 20 m, and fog density ≥ 0.03.
- **What happens:**
  1. Over 2.0 s the camera glides into `MEME_LOOP`.
  2. She shifts from Vigil to **Oath** (sword vertical before her face).
  3. Wind ×1.6, the cape billows, mist cards move ×2, and the HUD fades out.
  4. A caption fades in at the bottom left in Uncial Antiqua italic, picked at random: "Too small for the sword. Holding it anyway." · "The armor is borrowed. The hour is gold." · "Where I stand, the gate holds."
- It holds as a seamless loop on a 3.8 s cycle, the length of the viral clip. Any input exits.
- The first trigger unlocks the **Meme White** cape and the achievement "me trying to handle things maturely".

### 5.10 Difficulty

| Mode | Damage taken | Lives | Enemy attack tokens | Enemy and boss HP | Parry window |
|---|---|---|---|---|---|
| **Kitten** | ×0.5 | Infinite | 1 | ×0.75 | +0.05 s |
| **Knight** (default) | ×1.0 | 9 per level | 2 | ×1.0 | base |
| **Dame** | ×1.5, rounded up to a half-heart | 9 per level, and Vigil Stones don't refill Milk | 3 | ×1.25 | base |

### 5.11 Config block (for `core/config.js`; owned by the player agent)
```js
export const PLAYER = {
  height: 1.0, radius: 0.32, hpStart: 6, hpMax: 12, lives: 9,
  walk: 2.0, run: 5.5, zoomies: 7.5, zoomiesAfter: 2.0, zoomiesClearRadius: 15,
  accel: 30, decel: 40, airControl: 0.4, turnRate: Math.PI * 4,          // 720°/s
  gravityUp: 28, gravityDown: 40, jumpHeight: 1.25, jumpCut: 0.5, coyote: 0.12, jumpBuffer: 0.15,
  glide: { fallMax: 1.8, speed: 4.0, maxTime: 2.5 },
  dodge: { dur: 0.40, speed: 9, endSpeed: 4, iframes: [0.04, 0.30], cooldown: 0.20, perfect: [0.04, 0.18], perfectScale: 0.4, perfectDur: 0.35 },
  guard: { enter: 0.08, move: 1.2, turnRate: Math.PI * 2, arc: 1.22 /* ±70° */, grit: 3, gritRegen: 1.5, breakStagger: 0.8,
           parry: 0.15, parryOath: 0.22, parryStagger: 1.0, bossParryStagger: 0.4, bossParryPoise: 5, pushback: 0.4 },
  charge: { min: 0.35, full: 1.1, moveMul: 0.4 },
  hurt: { stun: 0.35, iframes: 0.9, blinkHz: 15, hitstop: 0.07 },
  milk: { heal: 4, sip: 0.9, interruptBefore: 0.5, start: 2, max: 5 },
  meow: { dur: 0.6, cooldown: 1.0, radius: 8, kittenRadius: 10 },
  valor: { max: 100, snip: 4, swoosh: 6, spinPer: 8, spinCap: 24, perfectDodge: 15, parry: 20, standPerSec: 5, standRadius: 6,
           jeerInterrupt: 10, kitten: 25, onHurt: -10, ninthLifeMul: 1.5 },
  lit: { activate: 0.8, dur: 8.0, dmgMul: 1.5, takenMul: 0.5, speedMul: 1.1, crescent: { dmg: 10, range: 4, speed: 16 } },
  memeCam: { idle: 15, blend: 2.0, loop: 3.8, minFog: 0.03 },
};
```

---

## 6. Fellow kittens as companions

### 6.1 Rules
- **Up to 2 active companions** follow her (MVP: Mochi, plus Sage or Clover from L2). Swap them at the **Kitten Barracks** in Pawsbury or at any Vigil Stone.
- **Follow behavior:**
  - They follow 2.5 m behind her, offset left and right, using seek steering plus separation [TECH §10].
  - They attack enemies that are targeting her.
  - Enemies target Swordcat 80% of the time; companions use attack tokens like enemies do.
- **They never die.** At 0 HP a companion "**naps**" for 8 s, curled up with "zzz", then wakes at full HP. Clover's ability wakes them instantly.
- **Basic attack:** 5 damage on its own cadence (see the table), so a companion is roughly a 4/s DPS helper. They're a help, not a carry.
- **Abilities** are on cooldown and triggered by the player (Q for companion A, F for companion B). Each portrait has a radial cooldown ring in that kitten's color [ART §13].
- **Barks:** at most 1 per 6 s across the whole party.

### 6.2 Abilities

| Kitten | HP | Basic attack | Ability | Ability numbers | Cooldown | Passive |
|---|---|---|---|---|---|---|
| **Mochi** (blue `#3F6FB5`) | 8 | Shield bonk, 5 dmg every 1.2 s, 1.2 m | **Shield Wall** | Plants the tower shield for **5 s**. A frontal 180° bubble of r 2.5 m around Mochi blocks every projectile. Taunts enemies within 6 m to target him. | 20 s | Carries +1 Milk bottle |
| **Sage** (green `#5E7F3E`) | 5 | Arrow, 5 dmg every 1.4 s, 16 m | **Volley** | 6 arrows over 1.2 s at the locked or nearest target, **10 dmg each**, 18 m, homing | 15 s | **Secret Sense:** lost kittens and letters within 15 m sparkle |
| **Clover** (cream `#F6F1E8`, bell gold) | 6 | Flower bop, 5 dmg every 1.5 s | **Bell of Mending** | Heals Swordcat **4 HP**, wakes napping companions, cleanses slow and poison | 30 s | Out of combat: Swordcat regains 1 HP every 20 s (purr) |
| **Earl Grey** (purple `#5C4A9C`) | 5 | Star bolt, 5 dmg every 1.6 s, 12 m | **Bookquake** | The book slams down at the target: AoE r 4 m, **30 dmg**, slow 40% for 3 s | 22 s | **Footnotes:** boss weak points glow and take +10% damage |
| **Pip** (red `#C2353B`) | 5 | Dagger poke, 5 dmg every 1.0 s | **Swipe!** | Dashes 10 m to an enemy and steals its weapon for **6 s**: melee damage ×0.5, ranged enemies can't shoot, rats panic. Steals 3 fish. | 18 s | +25% fish drops |

### 6.3 Non-combat roles
- **Pudding:** scripted only. Set pieces in L1, L2, L4 and L5, the Sky Ride, and one scripted assist in the final boss (§8 B6 phase 3).
- **Pearl:** in the ending. After the game she follows Swordcat around Pawsbury as a cosmetic tag-along [STRETCH].
- **The lost kittens:** live in Pawsbury (§3.4), appear in the L4 pull-back, and attend the knighting. At 10 rescued they unlock the **Spoon Brigade** in L4: kittens throw spoons for 5 dmg.

---

## 7. Enemies

### 7.0 Shared rules
- **FSM:** idle → patrol → alert (a 0.4 s "!" hop) → chase → windup → strike → recover → stagger / die [TECH §10]. **Attack tokens:** at most 2 attackers at once on Knight; the rest circle. At most 6 enemies alive per encounter, and at most 2 ranged.
- **Telegraph language** (it must read clearly on a phone):
  - **Faction-color glint** on the weapon plus a squeak/grunt/bark: a normal attack. It can be blocked, parried or dodged.
  - **Red rim + red ground ring/decal + "!!" icon:** unblockable. Dodge or jump it. *Exception:* Steadfast can still parry a few red attacks (each is marked).
  - **Gold glint:** a "parry me" attack. Parrying it gives a long stagger. Used by honorable foes such as Gnash.
- **Minimum windup is 0.45 s** [TECH §10]. Every attack has a punish window (`recover`).
- **Defeat is never violent.** Helmets pop off and spin, enemies poof (12 white puffs + 6 gold stars [ART §8]), and the smaller ones run off. Drops: fish, and sometimes milk (5%).
- **HP** is on the ×10 scale. **Damage to Swordcat** is in HP (1 = half a heart).

### 7.1 Enemy table (Knight difficulty)

| # | Enemy | Levels | Size (m) | HP | Poise | Walk / run (m/s) | Sight / FOV | Attacks: windup → damage | Recover (s) | Fish | Model |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Scurrier Rat** | L1, L4, L6 | 0.35 | 10 | 1 | 2.0 / 5.0 | 10 m / 160° | Bite lunge 1.2 m: 0.45 s → 1 | 0.5 | 1 | `creatures/polypizza/Rat.glb` (Rat_Idle/Run/Attack/Death) [ASSET] |
| 2 | **Rat Pikeman** | L1, L2, L4, L6 | 0.9 | 40 | 1 | 1.6 / 3.8 | 12 / 120° | Poke (2.0 m lunge): 0.55 → 1. **Triple Poke** below 40% HP: 0.6 / 0.3 / 0.3 → 1 each. | 0.6 | 1–2 | Procedural [ART §11]: pear body, wobbling kettle helm, spear, cheese-sigil buckler |
| 3 | **Rat Crossbowman** | L1, L4, L6 | 0.9 | 30 | 1 | 1.6 / 4.0 | 16 / 120° | Bolt at 16 m/s: **0.8 s dotted red aim line** → 1 (parryable). Keeps 7–11 m away; flees when she's within 3 m. | Reload 1.6 | 2 | Procedural rat with hood + `weapons/kaykit/crossbow_1handed.glb` |
| 4 | **Crow Raider** | L1, L4, L5 | 0.8 (1.6 wingspan) | 30 | 1 | Flies 4.5, circling at 4 m | 14 / 360° | **Dive** at 12 m/s: a **ground shadow decal grows for 1.0 s** → 2. **If it hits, it steals 5 fish** and flies off; kill it within 6 s to get them back. | 1.2 (beak stuck in the ground) | 2 | `creatures/monsters-flying/Pigeon.glb` (S13) tinted `#17181C` with an iron hood and red plume [ASSET; the crow stand-in] |
| 5 | **Molegrim Sapper** | L2 | 0.85 | 60 | 2 | Burrows at 3.0; 2.2 on the surface | Tremor sense 10 m, 360° | **Pop-up Uppercut:** the dirt mound shakes and candlelight glows through the soil for 0.7 s → AoE r 1.0, 2. **Dirt Clod** at 10 m/s: 0.5 → 1. | 1.5 dazed (goggles askew) | 3 | Procedural velvet mole [ART §11] |
| 6 | **Bramblehog Knight** | L2 | 0.8 | 80 | 3 | 1.8 / rolls at 9.0 | 12 / 120° | **Curl & Roll:** spines flare and shake for 0.8 s, then a straight roll of up to 8 m → 2. **Mace Bonk:** 0.5 → 1. **Spines:** hitting it from the front while flared recoils her 0.4 s with no damage. | 1.0, or **2.0 dizzy and belly-up (×2 damage taken) if it hits a wall** | 4 | Procedural (instanced cone spines) [ART §11] |
| 7 | **Hornet Lancer** | L2 | 0.9 | 50 | 2 | Flies 5.0 / dashes at 14 | 15 / 180° | **Lance Dash** 6 m: the buzz pitch rises for 0.7 s → 2. Hovers out of sword reach between dashes. | **1.0 grounded** (lance stuck in the ground) | 3 | `creatures/polypizza/Wasp.glb` (Wasp_Flying/Attack/Death) + lance |
| 8 | **Gloomjelly** S / M / L | L2 (edges), L3; frost variant in L5 | 0.4 / 0.8 / 1.4 | 20 / 50 / 90 | 1 / 2 / 4 | Hops 2.5 | 8 / 360° | **Leap Squash** of 4 m: squashes for 0.6 s → AoE r 0.9 / 0.9 / 1.4, damage 1 / 1 / 2. **M splits into 2 S; L splits into 2 M.** Each carries a swallowed object (a fish, a helmet) that drops. | 0.8 | 1 / 2 / 4 | `creatures/polypizza/Slime.glb` / `SlimeEnemy.glb`, or procedural transmission [ART §11] |
| 9 | **Toad Hexer** | L3 | 1.0 | 60 | 2 | 1.4; hops 6 m away when she's within 3 m (1.5 s cooldown) | 14 / 140° | **Bubble Lob:** the throat sac inflates for 0.8 s → 3 arcing bubbles, 1 each, **slow 30% for 2 s**. **Hex:** summons 2 S Gloomjellies every 12 s if alive for more than 10 s. | 1.2 | 3 | `creatures/polypizza/Frog.glb` (S12) + purple hood + orb staff |
| 10 | **Ermine Shadowblade** | L5 | 0.95 | 70 | 2 | 6.0 | 12 / 180°; **camouflaged** in snow (only its breath puffs show) | **Vanish:** a smoke puff, then it reappears **behind her after 1.0 s**, with a **blue glint for 0.4 s** → twin stab 1 + 1 (0.15 s apart). **Meow** makes it flinch and reveals it for 3 s. | 1.0 | 4 | `creatures/animals/Fox.glb` (S9) tinted white `#F4F2EE`, black tail tip, mask cloth |
| 11 | **Hyena Hater** | L4, L6 (Prologue cameo) | 1.3 | 80 | 3 | 1.8 / 5.0 | 14 / 140° | **Cackle Combo:** 2 curved-blade swings, 0.6 / 0.35 → 2 + 2. **Mock Charge:** from up to 10 m, **red ring 0.8 s** → a straight line at 7 m/s, 3 (unblockable). **Jeer:** stops and laughs for **1.5 s**; the Gloom thickens (fog +0.012 for 4 s) and enemies within 8 m deal +25% damage for 4 s. **Any hit during a Jeer cancels it:** the hyena chokes "hrk!" and staggers 1.0 s, +10 Valor. | 0.8 | 5 | Procedural chibi hyena, or `characters/kaykit/Barbarian.glb` (S3 clips) with a procedural hyena head on the head bone [bone name **unverified**] + a CanvasTexture breastplate showing its random word: HATER, GRUMBLER, NAYSAYER, SCOFFER, SNEERER, SPOILER |
| 12 | **Hyena Heckler** | L4, L6 | 1.2 | 50 | 2 | 1.8 / 4.5 | 16 / 140° | **Rotten Tomato** (an arc of up to 9 m): 0.6 → 1, plus a cosmetic tomato splat on a screen corner for 1.5 s. **BOO Bubble:** a text-bubble projectile at 8 m/s, 0.5 → 1. **A parried BOO comes back as "YAY"** and heals her 1 HP. | 1.0 | 3 | Same rig as the Hater, with a jester-ish hood |
| 13 | **Pug Brute** (Hound Legion) | L4, L6 | 1.4 | 140 | 6 | 2.0 / 3.0 | 12 / 120° | **Shield Slam:** raises the tower shield for **1.0 s** → a red shockwave ring expanding to r 2.5 over 0.4 s, 3 (unblockable; jump or roll it). **Shield Bash:** 0.6 → 2 within 1.5 m (blockable). **The shield blocks every frontal attack:** hit it from the sides or back, guard-break it with an Oath Spin, or parry the Bash, which stuns it for 2.0 s. | 1.4 | 8 | Procedural pug [ART §11], or the Barbarian rig + a pug head + `weapons/kaykit/shield_badge.glb` |

**Mini-boss: the Post Stealer** (L3 arena; a harasser in L4; a target in the Sky Ride)
- **Stats:** HP 400, poise 5, run 6.5 m/s.
- **Attacks:**
  - **Sign Smack:** swings a stolen signpost, range 2.6 m. 0.8 → 2.
  - **Mail Barrage:** 5 letters in a fan. 0.6 → 1 each. **Parrying a letter adds it to your Lost Letters** (one real collectible per fight).
  - **Milk Swipe:** a dash-grab at 6 m/s. 0.5 → 1, **and he steals one Milk bottle**. Hit him within 5 s to get it back.
  - **Smoke & Run** at 50% HP: drops a smoke puff and reappears on another boardwalk.
- **In L4:** he can't be defeated. Three hits make him drop whatever he's holding and run.

### 7.2 Enemy definition example (`src/enemies/types/ratPikeman.js`, matching tech.md §10)
```js
export default {
  id: 'ratPikeman', hp: 40, radius: 0.32, height: 0.9, mass: 0.8, poise: 1,
  walk: 1.6, run: 3.8, sight: 12, fov: 2.09, leash: 18, patrolRadius: 4,
  attackRange: 2.2, windup: 0.55, recover: 0.6, attack: 'rat_poke',
  enrage: { below: 0.4, attack: 'rat_triplePoke', windup: 0.6 },
  buddyFlee: { chance: 0.5, dur: 3.0, bark: 'Nope. Nope nope nope.' },
  telegraph: { color: '#B28B2E', sfx: 'creature/rat_squeak_attack' },
  drops: { fish: [1, 2], milkChance: 0.05 },
  model: { procedural: 'ratMilitia', helm: 'kettle' },
  anims: { idle: 'idle', chase: 'run', windup: 'windup', strike: 'poke', die: 'poof' },
};
// attacks.js additions: rat_poke { dur: 0.5, active: [0.0, 0.12], arc: { range: 2.0, from: 0.3, to: -0.3, y0: 0, y1: 1 }, dmg: 1, knock: 3, poise: 1, hitstop: 0.05, lunge: 4 }
```

---

## 8. Bosses

Shared rules:
- A circular arena behind a fog wall: an Octree wall plus mist cards.
- Camera pulls back to 5.5 m.
- Boss bar at the top centre with the name in Cinzel Decorative and phase pips.
- A phase change gives the boss 1.0 s of invulnerability plus a bark and emits `BOSS_PHASE` [TECH].
- A poise break gives a **3 s dizzy** with ×1.5 damage taken.
- Music `boss_epic_battle_loop`; on defeat `victory_fanfare`.

### B1 — Rat Captain Grizzlechop and his beetle Clatterbug [MVP] (L1, the Stone Circle)
- **Arena:** a ring of standing stones 30 m across in thick fog. Eight stones act as "charge stoppers".
- **Stats:** HP 600, poise 12. Build: Rat at 1.6 m with a feathered hat, a sabre (`weapons/quaternius/Sword_B.glb`) and a cheese-wheel shield, riding a procedural iridescent beetle (`MeshPhysicalMaterial` iridescence 0.7 [ART §11]).

| Phase | HP | Attacks |
|---|---|---|
| **1 "Mounted!"** | 600–300 | **Beetle Charge:** the lane is drawn as a dust streak **1.0 s** ahead, then a charge at 11 m/s → 3 (unblockable). If the beetle hits a standing stone, it is **stunned for 2.5 s** and Grizzlechop is exposed (×1.5 damage). **Saddle Sweep:** within 2.5 m, 0.7 s → 180° arc, 2. At 75% and 50% he calls 2 Rat Pikemen ("Squeak formation!"). |
| **2 "On Foot"** | 300–0 | The beetle flips over and wiggles helplessly (comedy). **Sabre Flurry:** 0.5 / 0.35 / 0.35 → 1 / 1 / 2. **Cheese Wheel Throw:** raises the wheel for 0.8 s, then it rolls at 8 m/s, bounces off the arena edge once, → 2. **Parrying the wheel breaks it:** "MY CHEESE!" and he staggers for 3 s. At 100 HP he tries to climb back onto the flipped beetle (a free punish). |
| **Defeat** | 0 | His hat flies off. "I yield! I YIELD! Mind the cheese!" He hands over the cage keys. +100 fish. Oaths: **Pounce** and **Gold Hour Strike** (taught in the hub). |

### B2 — Mole King Burrowmaw [MVP] (L2, the Root Hall)
- **Arena:** an underground hall 24 m across with 6 root pillars and mushroom lamps.
- **Stats:** HP 900, poise 15, 3 m tall. Procedural velvet mole with spinning brass drill gauntlets, a crowned miner's helmet with a candle, and goggles [ART §11].

| Phase | HP | Attacks |
|---|---|---|
| **1 "Who Goes There?"** | 900–600 | Surfaces at a random point. **Drill Swipe:** 0.8 → 2. **Fissure:** orange glowing lines crack across the floor for **1.0 s**, then erupt → 2. Burrows again after 3 attacks; the mound moves at 4 m/s. |
| **2 "Lights Out"** | 600–300 | **He eats the mushroom lamps.** It goes dark: ambient ×0.25, and only the fissures and his candle are lit. **Meow:** he answers "WHO GOES THERE?", and a ripple ring shows his position for 2 s. Sage's arrows light where they land. Calls 2 Molegrims every 25 s. |
| **3 "Full Drill"** | 300–0 | **Drill Charge:** red ring 1.0 s → a line charge at 10 m/s, 3. **If he hits a root pillar, he's stuck for 3 s** (×1.5 damage). **Root Fall:** shadow decals for 1.0 s → 2 each, 4 at a time. |
| **Defeat** | 0 | His goggles crack. "You're a KITTEN? I thought you were an army. You were so... loud." +150 fish. Oath: **Cape Glide**. |

### B3 — The Slime Sovereign [STRETCH; MVP fallback in §16] (L3, the Sunken Chapel)
- **Arena:** a flooded chapel 26 m across with 5 raised stones and lily pads. `loop_rain` plays.
- **Stats:** HP 1200 in total. A procedural transmission slime 4 m tall with `props/Crown.glb`. **Earl Grey floats inside in a bubble, reading.**

| Phase | HP | Attacks |
|---|---|---|
| **1 "Royal Wobble"** | 1200–800 | **Belly Flop:** sinks for 0.9 s, then lands on her position → shockwave r 3, 2. **Arena Splash:** sinks and swells for **1.2 s**, then everything except the raised stones and lily pads takes 3 (stand on a stone, which is marked). **Absorb:** eats a nearby Gloomjelly to heal 50. |
| **2 "Princelings"** | 800–400 | Splits into **2 Princelings** of 200 HP each: a bog-green one, and a poison-purple one that leaves puddles doing 1 per second. Each uses the Belly Flop. |
| **3 "Re-merge"** | 400–0 | They merge again, smaller and faster (windups ×0.8). **The bubble core with Earl Grey is the weak point.** Three Gold Hour Strikes or Big Swooshes on the core during a post-flop wobble (1.5 s) pop it. |
| **Defeat** | 0 | It pops into 30 tiny happy slimes that bounce away. Earl Grey falls out, dripping. "Do you MIND? I was nearly at the good chapter." +200 fish. Oath: **Steadfast II**. |

### B4 — Gnash the Grand [MVP] (L4, on the causeway)
- **Stats:** HP 1000, poise 16. 1.8 m hyena with a greatsword (`weapons/quaternius/Claymore.glb` ×1.4). He fights with honor: **his heavy attacks are gold-glint "parry me" attacks.**

| Phase | HP | Attacks |
|---|---|---|
| **1 "Equals"** | 1000–600 | **Overhead Chop:** **gold glint 0.9 s** → 3. Parrying it staggers him for 2.0 s. **Wide Sweep:** 0.7 → 270°, 2 (jump or roll). **Shoulder Charge:** red ring 0.8 → 8 m/s, 2. |
| **2 "The Horde Laughs"** | 600–250 | Cacklejaw (on the hill, out of reach) sends in 3 Haters and 1 Heckler. The **Jeer** mechanic matters most here: the Gloom builds while the Haters laugh. Gnash himself fights more slowly (windups ×1.2) and visibly hates the laughing. |
| **3 "Last Stand"** | 250–0 | Gnash plants his sword in **her** pose. A **duel of Stands:** 3 exchanges. He charges with a gold glint, and she must parry each within the window (+0.05 s grace). Each successful parry removes a third of the phase HP; the third one ends the fight. A missed parry costs her 2 and he resets the exchange. Normal hits still work between exchanges. |
| **Defeat** | 0 | He lays the sword down. "Hold your gate, little knight." He walks into the fog and leaves the Horde. +150 fish. Then cutscene CS-L4c and the Oath **Lit From Within**. |

### B5 — Crow Queen Corvessa [STRETCH] (L5, the Eyrie summit)
- **Arena:** a round tower top 20 m across with a low wall; blizzard.
- **Stats:** HP 1100, poise 14. `Pigeon.glb` ×3 tinted black, `props/Crown.glb` with an ice tint, and a cloak of 12 orbiting crows (instanced).

| Phase | HP | Attacks |
|---|---|---|
| **1 "Murder Spiral"** | 1100–650 | **Murder Spiral:** 12 crows orbit and spiral inward. **The gaps are visible**; roll through one → 1 per crow touched, at most 3. **Ice Feather Fan:** 5 feathers, 0.6 → 1 each (parry reflects). **Swoop:** shadow decal 1.0 s → 2, then **she lands on a perch for 2.5 s** (punish). |
| **2 "Whiteout"** | 650–300 | Fog ×2. She hides among 5 decoy crows; **Meow** and only the real one caws back. **Pip's Swipe! steals her crown**, and she chases Pip in a rage for 4 s, completely open. |
| **3 "Icicle Crown"** | 300–0 | She rips the ice crown off the tower: **Icicle Rain**, 6 shadow decals every 3 s, 1.0 s → 2 each. All windups ×0.85. |
| **Defeat** | 0 | "He took my crown first!" Pip hands it back. She leaves mollified. +200 fish. Oath: **Ninth Life Grit**. |

### B6 — Lord Cacklejaw [MVP] (L6, the Bell Tower roof at dawn)
- **Arena:** a roof 22 m across with crenellations, the Sunbell hanging in the tower above, and Heckler balconies on two sides. Storm and embers.
- **Stats:** HP 1800 in 3 phases, poise 20 / 24 / 18. 3.2 m.

| Phase | HP | Attacks |
|---|---|---|
| **1 "The Laughing Lord"** | 1800–1200 | **Gloat Chop:** the cleaver edge glows red for **1.0 s** → 3, leaving a crack ring that lingers 0.5 s for 1. **Big Laugh:** he throws his head back and laughs for **2.0 s**, sending out 3 expanding shockwave rings (0.3 m tall, 8 m/s) → 2 each; jump them. **Hitting his head hurtbox during the laugh interrupts it:** "hrk!", 2.0 s stagger, +10 Valor. **Mockery Volley:** the 2 balcony Hecklers throw. |
| **2 "The Gloom"** | 1200–600 | He pulls the Gloom in: fog 0.05 → 0.11. He becomes a silhouette with red eyes and creates 3 laughing shadow clones. **Only the real one casts a blob shadow** (the cute clue), and positional laughter comes from the real one. **Lit From Within** pushes the fog back (density ×0.5), which makes this phase much easier. Clones poof in one hit. **Cleaver Spin:** red ring 1.2 s → r 3.5, 3. |
| **3 "The Smallest Pup"** | 600–0 | His helm shatters (a 2 s beat): a small hyena with a **chipped ear**. All windups ×0.8, but his paws visibly shake, which is the tell. **Desperate Flurry:** 4 chops at 0.6 / 0.4 / 0.4 / 0.8 → 2 / 2 / 2 / 3. When her Valor reaches 100 for the first time in this phase, **Pudding swoops in** and breathes fire on the balconies, clearing the Hecklers (scripted assist). |
| **Final Stand** | 0 | He doesn't fall. He raises the cleaver for one last blow. Prompt: **"HOLD THE STAND."** The player holds guard for 2.0 s while the cleaver presses down and the screen rumbles. Releasing early resets the prompt; it costs no life. Then the ending (§4.7). |

---

## 9. Levels

General metrics:
- Each level is a chain of zones joined by narrow transitions, so the fog hides streaming.
- Play length 10–15 min. 3–4 Vigil Stones. 5 lost kittens, 5 Lost Letters, 2 Yarn pieces and 1 treasure chest per level (§10.3).
- **Signposts are missing** across the island (the Post Stealer took them). The guiding device is **his trail of dropped letters and footprints**, plus Sage's sparkle once she joins.

### Prologue — `academy` + practice field [MVP]
- **Academy yard:** a 30 × 20 m cutscene set with the height chart, the Bell Tower behind it, and timber-frame buildings (`env/village-kaykit/buildings/*` scaled ×4).
- **Marmalade's attic:** a 10 × 8 m interior with a chest, mirror and flour sacks. The interactive part is only: walk to the chest and press E.
- **Practice field:** a 40 × 40 m fenced meadow by a windmill. Dummies, the Wobble Knight, a sleeping cow, and the Sir Tallbert statue. Tutorial in §4.5.
- **Collectibles:** lost kitten #1 (Biscuit, behind the cow). No letters.
- **Music:** `village_bards_tale`, then silence, then wind.

### L1 — Purrdale Misty Meadows: "Holding It Anyway" [MVP]
- **Env:** fog `#B7C0C3` at 0.045, grass 60k on desktop, standing stones, drystone walls, windmills, haystacks, thistles [ART §12 #1]. HDRI `overcast_soil_puresky_1k.hdr` [ASSET]. **This level is the reference image.**
- **Music:** `field_of_dreams`; combat `battle_fast_fight_loop`.
- **Size:** about 180 m of critical path inside a 200 × 200 terrain.

```
            N
   [F Stone Circle (boss)]
            |
   [E Haystack Hollow] -- tall grass, ambushes
            |
   [D Milk Camp]  <- Vigil #2, Pudding
            |
   [C Drystone Lanes] -- maze, crows, crossbows on walls
            |
   [B Turnip Farm & Windmill] -- Mochi's cage cart
            |
   [A Crossroads (Sir Tallbert)] <- Vigil #1
            S (from the practice field)
```

| Zone | Size | Content |
|---|---|---|
| **A Crossroads** | 30 m | Vigil Stone #1. Sir Tallbert statue. The first Meme Cam is likely to trigger here (open fog, no enemies). The letter trail starts. |
| **B Turnip Farm & Windmill** | 60 × 50 m | 4 Scurriers stealing turnips (crops from `env/nature`), 3 Rat Pikemen guarding a cage cart (`env/town/cart.glb` + iron bars). **Objective: free Mochi** (Big Swoosh the lock). Windmill climb on haybales (`env/graveyard/hay-bale*`) for Yarn piece 1. |
| **C Drystone Lanes** | 40 × 40 m | A maze of 1.2 m walls. 3 Crow Raiders plus 2 Crossbowmen standing on walls. Two letters in dead ends. Lost kitten in a barrel: Meow to find it. |
| **D Milk Camp** | 20 m | Vigil Stone #2, campfire (`env/nature/campfire_logs`). **CS-L1 "Milk Break, Interrupted"**. Pudding then hides in the fog and peeks out from behind (much smaller) trees for the rest of the level. |
| **E Haystack Hollow** | 50 × 40 m | Tall grass (0.45 m blades) where rats hide. **Meow flushes them** ("Eep!" for +5 Valor each, a cute stealth beat). 2 Pikemen, 4 Scurriers, 1 Crossbowman on a haystack. Chest under a haystack (Fishbone Sabre skin). |
| **F Stone Circle** | 30 m | Vigil Stone #3 at the entrance. **Boss B1.** After the fight: cages hold 2 squire kittens (story) + lost kitten #5. |

- **Objectives:** follow the trail of letters → free Mochi → reach the camp → find the Rat Captain's camp → defeat Grizzlechop → free the cages → return to Pawsbury (an exit trigger).
- **Collectibles:**
  - Kittens: Biscuit (Prologue, behind the cow), in a barrel (C), up the windmill (B), in a hay pile (E), in the post-boss cage (F).
  - Letters: 2 in the C dead ends, 1 at camp, 1 under the windmill, 1 dropped by the last Pikeman in E.
  - Yarn: the windmill top, and the top of the tallest standing stone, reachable only with Cape Glide on a return visit from the hub.

### Interlude / Hub — Pawsbury (`village`) [MVP]
- **Env:** golden hour until L4 (fog `#D8CDB8` at 0.025, sun `#FFD9A8` ×2.0, real shadows [ART §12 #4]). After L4 it's grey and Gloomy (fog `#9AA196` at 0.05). After the ending it's golden forever. Textures `pavingstones070`; HDRI `meadow_2_1k.hdr`.
- **Layout:** about 120 × 100 m. The **Town Square** has a fountain with a cat statue (`env/town/fountain-*`). Around it: **Marmalade's Bakery** (Milk), **Tinpaw's Smithy** (swords), **Madame Purrlette's** (capes), the **Post Office** (letters), the **Kitten Barracks** (companions, kitten rewards), the **Castle** (Snowpaw, the throne room) and the **Bell Tower**. South are the **Low Gate** and the causeway (L4). Buildings come from `env/village-kaykit/buildings/*` ×4–5 and `env/town/*` modular pieces.
- **Life:** rescued kittens appear at fixed "activity spots" such as fence sitting, butterfly chasing, bread-basket napping, fountain fishing and knocking a cup off a table. The castle cooks wave.
- **Sunbeam spots:** lie in one to heal fully.
- **Region gates:** the hub map lets the player replay any cleared level to hunt collectibles with newer Oaths (for example Cape Glide in L1).
- **Hidden:** 5 lost kittens on rooftops and in chimneys, reachable after Cape Glide.
- **Music:** `village_town_theme` (day), `village_bards_tale` (when 15 or more kittens are rescued), `tavern_old_tower_inn` in the bakery, `story_lament_warriors_soul` while the hub is grey.

### L2 — Whiskerwood: "Born to Purr, Forced to Fight" [MVP]
- **Env:** fog `#8E9E8A` at 0.06, god rays, giant oaks (`env/nature/tree_oak*` ×3), red mushrooms and glowing mushrooms, fireflies [ART §12 #2]. Ground `ground037`. Music `field_of_dreams` in the day section, `dark_forest_creepy` at night, `cave_theme` in the tunnels.

| Zone | Content |
|---|---|
| **A Forest Gate** | Vigil #1, god-ray clearing, 2 Pikemen + 1 Bramblehog (teaches the wall-stun) |
| **B Mushroom Hamlet** | A hornet raid: 3 Hornet Lancers. **Clover** guards a hedgehog nest. A wave fight with Clover healing (tutorial for her ability). **Clover joins.** |
| **C Bramble Ravine** | Log and rope bridges (`env/nature/bridge_*`). A slope lane where 2 Bramblehogs roll down at her (dodge into the alcoves). **Sage** in a net trap: cut the rope; she lands on Mochi. **Sage joins.** Choose 2 active companions (UI). |
| **D Lantern Camp** | Scripted day → night (sun and fog lerp over 4 s). **CS-L2 "Lantern Night"**. Vigil #2. |
| **E Mole Tunnels** | Darker (ambient ×0.5), lit by glowing mushrooms. 4 Molegrims, Gloomjellies at a bog seep. A crate-push puzzle that opens a side room with the chest (Toadstool Edge skin). |
| **F Root Hall** | Vigil #3. **Boss B2.** |

- **Collectibles:** kittens in a mushroom house, on top of a giant oak (needs Glide later), in the ravine under a bridge, in the tunnels in a box ("if it fits"), and behind the boss. Letters along Hornet Hollow and the tunnels.

### L3 — Bogmire: "The Posts Do Not Stop" [STRETCH; MVP stitch in §16]
- **Env:** fog `#8F9A84` at 0.07 with strong height fog, water, lily pads, reeds, dead trees, boardwalks (`planks012`), will-o'-wisps, rain [ART §12 #3]. Graveyard kit for the chapel: crypts, lanterns, iron fences. Music `cave_theme` (ambient) and `battle_fast_fight_loop`; `loop_rain` and `loop_water_01`.

| Zone | Content |
|---|---|
| **A Boardwalk Entry** | Vigil #1. Wisps lead to letters; follow them or get lost (the fog closes in). |
| **B Lily Crossings** | A jumping section on lily pads that sink after 1.5 s. 2 Toad Hexers, M/L Gloomjellies. |
| **C The Post Stealer Chase** (set piece) | A 90 m boardwalk run. He drops letters and throws crates (`env/dungeon-kaykit/box_*`). **Zoomies needed.** Each hit (3 needed) knocks loose part of the mailbag. Failing (falling 25 m behind) restarts the chase from its start with no life lost. At the end he escapes in a barrel: "Finders keepers!" Then a short arena fight (§7.1 mini-boss) on a wide pier. |
| **D Sunken Chapel approach** | Vigil #2. Crypts, rain, 2 Toads + a Gloomjelly nest. |
| **E Chapel Pool** | **Boss B3.** Then CS-L3 "The Letter". |

### L4 — The Low Gate: "Standing My Ground" [MVP]
- **Env:** Pawsbury's south gate at dusk, Gloom rising: fog `#9AA196` at 0.05, warm torches on the walls. A 60 m stone causeway, 8 m wide with low parapets, crosses a misty moat. Behind her are the gatehouse and the jammed portcullis (`env/castle/gate`, `tower-square*`, `wall*`); ahead is the fog bank where the Horde spawns, with a hill beyond it where Cacklejaw watches.
- **Siege dressing:** `env/castle/siege-ram`, `siege-catapult`, `siege-tower` (and their `-demolished` versions after destruction).
- **Music:** `battle_theme_a` (waves), `boss_epic_battle_loop` (Gnash).
- **Companions are on the walls**, not following. Sage fires a Volley automatically every 15 s, Mochi blocks the bolts aimed at the causeway, and Clover heals 4 HP once per wave.
- **Sequence:**
  1. Cutscene: the Post Stealer steals the winch pin; Marmalade's line; she walks out. **CS-L4a "Nobody's Coming"** with the pull-back. The Spoon Brigade (10+ kittens) is active.
  2. **Wave 1:** 6 Scurriers, 3 Pikemen, 2 Crossbowmen, 3 Crows.
  3. **Wave 2:** 4 Haters, 2 Hecklers, and a **Battering Ram** (HP 300, pushed by 2 Pugs at 0.8 m/s). If the ram reaches the gate, the gate is damaged and she loses 1 life (a soft fail). Destroy it with heavy hits. The Post Stealer harasses (3 hits to drive him off).
  4. **Wave 3:** 2 Pug Brutes, 4 Haters, 2 Hecklers. A Vigil Stone sits in the gate arch before the champion.
  5. **CS-L4b "The Champion Kneels"**, then **Boss B4 Gnash**.
  6. **CS-L4c "Pudding Rises"** (Oath: Lit From Within), then **CS-L4d "The Bell Is Gone"**.
- **Collectibles:** letters dropped by the Post Stealer whenever he is hit (5). No lost kittens here (Pawsbury's 5 are hidden in the hub instead). Yarn pieces: on a parapet tower, and as a reward for no ram damage.

### L5 — Frostwhisker Peaks: "Nine Lives, One Heart" [STRETCH]
- **Env:** fog `#CDD8E3` at 0.05, snow `#F2F5F8` with glitter, ice, pines (`env/nature/tree_pine*`), rope bridges, a frozen waterfall, watchtowers [ART §12 #5]. Rock `rock030`. Music `field_of_dreams` (slowed? **[audition]**), `battle_theme_a` in fights. Footsteps `footstep_snow_*`.

| Zone | Content |
|---|---|
| **A Foothill Pines** | Vigil #1. Ermines in the snow (the Meow reveal). |
| **B Wind Gaps** | Cape Glide across gaps with wind volumes. Frost Gloomjellies. |
| **C Frozen Waterfall** | An ice-ledge climb. A Yarn piece behind the falls. |
| **D Old Watchtower** | **Pip** in the cage (she joins with the clapper). Vigil #2. |
| **E Eyrie** | **Boss B5 Corvessa.** Then **CS-L5 "Get On"**. |

### Sky Ride (`skyride`) [STRETCH interactive; MVP = 40 s cutscene]
- **Rail:** a 1.8 km CatmullRom over a sea of clouds (`env/village-kaykit/decoration/cloud_big`, `cloud_small` + billboard clouds), from night to dawn. HDRI `kloofendal_48d_partly_cloudy_puresky_1k.hdr` once it's dawn.
- **Control:** steer inside a 12 × 8 m window around the rail. **Attack** = Pudding fireball (cooldown 0.6 s, 20 dmg). **Dodge** = barrel roll (i-frames 0.5 s).
- **Targets:** crow swarms (30 HP each); then the **Post Stealer's balloon** (5 patches of 60 HP each). Pop all 5 patches → the Sunbell drops onto the Keep tower.
- **Failure:** 3 hits → Pudding wobbles and the segment restarts. **No lives are used in the Sky Ride.**
- **Music:** `battle_theme_a`, then `field_of_dreams` at dawn **[audition]**.

### L6 — Houndhold Keep: "The Hour Is Gold" [MVP]
- **Env:** storm fog `#4B3F42` at 0.05, embers, braziers (`#FF8A3D` point lights ≤2), red banners with a bone sigil (`env/dungeon-kaykit/banner_*_red`), chains, spiked parapets [ART §12 #6]. Walls `bricks076c`. Music `dark_forest_creepy` (approach), `battle_theme_a`, `boss_epic_battle_loop`.

| Zone | Content |
|---|---|
| **A Drawbridge** | `env/castle/bridge-draw`. A cutscene: Gnash lowers it from inside. 2 Pugs guard the gate. |
| **B Kennel Courtyard** | Vigil #1. **3 levers**, each guarded (a Pug, then 2 Haters, then 3 Crossbowmen on walkways). Pulling all 3 opens the cages: **Pearl + the squires**. Reunion scene. |
| **C Laughing Halls** | Corridors full of scrawled insults, Hecklers in alcoves, Haters that Jeer (the interrupt lesson again). The **Hall of Mirrors** shows her reflection tiny, then giant, then just right. Portraits of runt-Cacklejaw (lore). The chest holds the Old Faithful skin. |
| **D Battlements** | Vigil #2. Crossbowmen, crows, a ballista she can kick over (−2 enemies). Rain. |
| **E Bell Tower Roof** | Vigil #3 on the stair. **Boss B6.** Then the ending. |

- **Collectibles:** kittens in a kennel cage, in a laundry basket, on a beam, in a banner fold, and in the boss stair alcove. Letter #30 from Pearl is hidden in the courtyard.

### Optional L7 — Moonlit Abbey Ruins [STRETCH, post-game]
**"The Abbey of Nine Lives"**: the friendly spectral cats of Marmalade's previous eight lives set 8 short trials. Spectral Mice enemies. The reward is **Marmalade's ninth-life story** and the **Moonlit Silver** skin. Env per [ART §12 #7].

---

## 10. Progression and economy

### 10.1 No XP. Oaths, gear and friends instead. [NEW]
She doesn't level up, because the point is that she doesn't get bigger. She progresses through:
1. **Oaths:** new moves taught by Marmalade (or learned in the moment) after story beats.
2. **Sharpness:** sword damage upgrades bought with fish.
3. **Yarn Hearts:** more hearts.
4. **Milk capacity.**
5. **Companions.**
6. **Cosmetics:** sword skins and capes.

| After | Oath learned | Companions | Cape | Hearts available by then |
|---|---|---|---|---|
| Prologue | Basics: combo, Tumble, Stand, parry, Oath Spin, Meow | — | Faded Cream (Marmalade's; ref3) | 3 |
| L1 | **Pounce**, **Gold Hour Strike** | Mochi | **Royal Red** (ref2) | up to 3.5 |
| L2 | **Cape Glide** | Sage, Clover | — | up to 4 |
| L3 | **Steadfast II** (parry window 0.22 s, reflection) | Earl Grey | — | up to 4.5 |
| L4 | **Lit From Within** | (Spoon Brigade) | — | up to 5 |
| L5 | **Ninth Life Grit** | Pip | Pudding Scale (after the Sky Ride) | up to 5.5 |
| L6 | — | Pearl (epilogue) | — | 6 |

### 10.2 Fish (currency)
- **Silver fish coins ("fishlings").** A gold fish is worth 10. Sound: `pickup/coins_0x`.
- **Sources:**
  - Enemies: §7 table.
  - Crates and pots: 1–3 (`world/wood_breaking_0x`).
  - Chests: 50.
  - Bosses: 100 / 150 / 200 / 150 / 200.
  - Crows steal 5, and you can win them back.
- **Expected income** is about 350–450 per level, roughly 2,600 over the whole game.

| Shop | Item | Price (fish) | Effect |
|---|---|---|---|
| **Tinpaw's Smithy** | Sharpness I / II / III / IV | 100 / 200 / 350 / 600 | +20% player damage each (total ×1.8) |
| | Fishbone Sabre skin | 250 | Cosmetic. Sold only if the player missed it in the L1 chest. |
| **Marmalade's Bakery** | Milk bottle #3 / #4 | 150 / 300 | Capacity |
| | Fish Pie | 60 | +1 temporary **golden heart** (2 HP of overheal) until it's lost |
| **Madame Purrlette's** | Meadow Green / Sea-Fog Blue / Royal Purple capes | 120 / 120 / 180 | Cosmetic |

The sink totals about 2,600, so a thorough player can buy everything by the end without grinding.

### 10.3 Collectibles

| Collectible | Count | Where | Reward |
|---|---|---|---|
| **Lost Kittens** | 30 (5 each in L1, L2, L3, L5, L6 and the hub) | Hidden in barrels, boxes and tall grass, on rooftops and trees. **Meow** makes them answer; Sage's passive shows them. | +25 Valor each. Each one moves into Pawsbury. Milestones at the **Kitten Barracks** (below). |
| **Lost Letters** | 30 (5 per level, L1–L6) | The Post Stealer's trail, dead ends, parried Mail Barrage | Lore and jokes. Milestones at the **Post Office** (below). |
| **Yarn pieces** | 12 (2 per level) | Platforming tops, behind waterfalls, "no ram damage" | Every 4 pieces = +1 heart container (up to 6 hearts) |
| **Treasure chests** | 6 (1 per level) | Optional side rooms | 50 fish plus: L1 Fishbone Sabre, L2 Toadstool Edge, L3 Lily-Pad cape, L4 Gatekeeper's Banner cape (gatehouse armory, opens after the battle), L5 Snowdrift cape, L6 Old Faithful |
| **Sit boxes** | 8 | "If it fits, I sits" spots | Achievement |

**Kitten Barracks milestones:**
- 5: **Kitten Choir** (they hum along with the music in the L4 pull-back)
- 10: **Spoon Brigade** (in L4 they throw spoons for 5 dmg every 2 s)
- 15: Fan banners all over Pawsbury and the `village_bards_tale` hub music
- 20: **Pink Ribbon** sword skin
- 25: a kitten parade in the ending
- 30: **Peak Cinema** photo filters

**Post Office milestones:**
- 5: **Butter Knife** sword skin
- 10: +50 fish and the **Night Sky** cape
- 15: +1 Milk capacity (free)
- 20: **Dandelion Blade** skin
- 25: **Royal Postmark** (the map shows remaining collectibles)
- 30: **Gold Hour** sword + **Gold Hour** cape

### 10.4 Sword skins (cosmetic; the hitbox is always the same)

| Skin | Unlock | Build |
|---|---|---|
| **Borrowed Blade** (default) | Start | Procedural [ART §4.3] |
| **Training Twig** | Start (wardrobe, a joke) | Procedural stick with a leaf |
| **Butter Knife** | 5 letters | Procedural extruded rounded blade, cream handle |
| **Fishbone Sabre** | L1 chest or 250 fish | Procedural spine with ribs |
| **Toadstool Edge** | L2 chest | Blade with a red mushroom-cap guard |
| **Dandelion Blade** | 20 letters | Emits dandelion fluff (ambient-sparkle preset) on each swing |
| **Gnash's Greatsword** ("Even More Too Big") | Beat B4 | `weapons/quaternius/Claymore.glb` ×1.6. **The tip drags on the ground**, purely visual. |
| **Icicle** | Beat B5 | `weapons/quaternius/Sword_Diamond.glb` with an ice tint and clearcoat |
| **Dragon's Tooth** | After the Sky Ride | Curved ivory blade, red grip |
| **Pink Ribbon** | 20 kittens | Borrowed Blade with a pink bow on the crossguard |
| **Old Faithful** | L6 chest | Marmalade's dented blade (`weapons/kaykit/sword_2handed.glb` with a rust tint) |
| **Moonlit Silver** | Abbey [STRETCH] | Pale blue emissive edge |
| **Gold Hour** | 30 letters | Always "lit from within" (emissive 1.0, a few sparkles) |

**Capes:** Faded Cream, Royal Red, **Meme White** (the first Meme Cam), Night Sky, Pudding Scale, Gold Hour, plus the shop colors. Color tokens [ART §5, §6].

### 10.5 Achievements [STRETCH] (names from the meme captions)
- "me trying to handle things maturely": trigger the Meme Cam.
- "Holding It Anyway": beat any boss on your ninth life.
- "Born to :3, Forced to Fight": finish the game.
- "Too Small for the Sword": finish without buying Sharpness.
- "The Posts Do Not Stop": all 30 letters.
- "Nine Lives": finish a level without losing a life.
- "Peak Cinema": take 10 photos.
- "If It Fits, I Sits": all 8 boxes.

---

## 11. UI / HUD

### 11.1 Style
- Pure-CSS parchment panels, pink candy-ribbon buttons, pink wax seals with an embossed paw for confirm and save, and gold accents [ART §13].
- **Fonts, all already downloaded** [ASSET `fonts/`]:
  - **Cinzel Decorative**: logo, boss names, chapter cards.
  - **Cinzel**: menus and headings.
  - **Fredoka**: UI, dialogue, numbers.
  - **Uncial Antiqua**: letters, lore and Meme Cam captions. This replaces art.md's IM Fell English, which was not downloaded.
  - **MedievalSharp**: shop signs and quest names.
- **Pink is reserved** for the heroes and the UI [ART §6].

### 11.2 HUD layout (16:9; touch moves the buttons out of the way, §12.3)
```
+---------------------------------------------------------------------------------+
| (O portrait w/ bow)  hearts: [<3][<3][<3][  ]   lives: (cat)x9     ( minimap  ) |
|                      grit:   [s][s][s]                              (  N  paw ) |
|                      VALOR:  [hilt]=====blade=====> (gold at 100)    fish 245   |
|                                                                     kittens 7/30|
|                   [ BOSS NAME  ##########......  phase o o . ]                  |
|                                                                                 |
|                                  (world view)                                   |
|                                                                                 |
|                         [E] Talk   <- parchment tag + wax seal                  |
|  milk: [b][b][ ]                                    [Mochi (ring)] [Sage (ring)]|
|            +------------------- dialogue scroll -------------------+            |
|            | [portrait] (pink ribbon: SPEAKER) text types on...  > |            |
|            +-------------------------------------------------------+            |
+---------------------------------------------------------------------------------+
```

| Element | Behavior |
|---|---|
| **Portrait** | Round gold frame with Swordcat in the Oath pose, bow peeking over the frame. Her expression changes: worried at low HP, determined during Lit. |
| **Hearts** | `#F0668E` with a white highlight; half-hearts allowed; they wobble when hit and pulse red when ≤ 2 HP |
| **Grit** | 3 small steel shields; they flash while she's Standing; cracked = 0 |
| **Valor** | A sword icon fills from the hilt. Silver up to 99; gold `#FFE3A3` with sparkles at 100; the button glyph for Gold Hour or Lit appears. |
| **Lives** | A cat head with a pink bow and "×9". On life loss the ghost kitten floats up out of the icon. |
| **Milk** | Little bottles; the empty ones are outlined |
| **Fish / Kittens** | Top right, under the minimap; a pop and bounce on change |
| **Minimap** | Round parchment, ink-wash map, compass rose; the player is a paw. Lost-kitten markers appear only with the Royal Postmark. |
| **Boss bar** | Top centre; Cinzel Decorative name; phase pips; the bar drains in 2 colors (recent damage shows white) |
| **Companion portraits** | Bottom right, with radial cooldown rings in their colors and "zzz" while napping |
| **Damage numbers** | Fredoka 700, white with an ink outline; Holy damage gold with a sparkle; heals green `#7FD38A`; DOM pool, at most 20 [TECH §15] |
| **Toasts** | "Lost kitten found! (8/30)", "Letter recovered: *Dear Mum...*", "Oath learned: Cape Glide" (wax-seal stamp animation) |
| **Cutscenes** | Letterbox bars (CSS, 10% each); the HUD fades out; "Hold to skip" ring in the corner |
| **Meme Cam** | Everything fades out except the caption |

### 11.3 Screens
- **Title:** Swordcat in the Oath pose with the full holy glow in the misty meadow, slow push-in, the logo with a pink bow on the "O" [ART §13]. Menu: Continue · New Game · Settings · Credits. "Press any key / Tap to start" unlocks audio [TECH §14].
- **Pause:** Resume · Wardrobe (sword / cape preview on a turntable) · Letters (read the collected letters as parchment cards) · Kittens (portrait grid, names, where found) · Map · Settings · Quit to title.
- **Settings:**
  - Volume ×3, invert Y, sensitivity, quality (low / med / high / auto), touch button size [TECH §15].
  - Difficulty (Kitten / Knight / Dame).
  - Toggle-instead-of-hold for the Stand; reduce flashing; screen shake 0–100%; subtitles always on; dialogue speed.
- **Chapter card:** parchment, the chapter title in Cinzel Decorative, the caption in Uncial Antiqua, and a wax-seal stamp.
- **Results** (after each level): time, kittens n/5, letters n/5, fish, lives left, and a rank stamp: "Paw-some" / "Purr-fect" / "Mew-tiful".
- **Life lost:** a soft pink-white flash, "*8 lives left*", and the ghost kitten waving.
- **Game over:** *"Time for a cat nap."* Retry chapter / Back to Pawsbury.
- **Photo Mode, "Peak Cinema"** [STRETCH]:
  - Pauses the game; free camera within 6 m.
  - Poses: Vigil, Oath, Milk Selfie, Big Swoosh, Slow Blink.
  - Filters: Fog Loop, Gold Hour, Grey Vigil, Selfie.
  - Toggles for depth of field and the bow-only frame.
  - Saves a PNG through `toBlob` after rendering in the same task.

---

## 12. Controls

### 12.1 Keyboard and mouse

| Action | Key |
|---|---|
| Move | WASD / arrows |
| Camera | Mouse (pointer lock after the first click); wheel zooms 2.8–5.0 m |
| Attack / hold to charge | **LMB** / J |
| **Stand** (guard; parry on tap timing) | **RMB** / L (hold) |
| Tumble (roll) | **Shift** / K |
| Jump / hold to Cape Glide | Space |
| Interact / talk | E |
| Companion A ability / B ability | Q / F |
| Milk Break | R |
| **Meow** | C |
| Lit From Within | V, or LMB + RMB together at Valor 100 |
| Lock-on (toggle) / switch target | Tab or MMB / mouse flick |
| Map and quests | M |
| Photo mode | B |
| Pause | Esc / P |

### 12.2 Gamepad (standard mapping, button indices)

| Action | Button |
|---|---|
| Move / camera | Left stick (dead zone 0.15) / right stick |
| Jump / glide | A (0) |
| Tumble | B (1) |
| Attack / charge | X (2) |
| Interact | Y (3) |
| Companion A / B | LB (4) / RB (5) |
| **Stand** | **LT (6)** (hold) |
| Lock-on | RT (7) |
| Lit From Within | LT + X at Valor 100 |
| Meow | L3 (10) — clicking the stick to meow is cute |
| Recenter camera | R3 (11) |
| Milk | D-pad up (12) |
| Photo mode | D-pad right (15) |
| Map | Back/Select (8) |
| Pause | Start (9) |
| Rumble | `vibrationActuator` on hit (weak 80 ms), parry (strong 120 ms), and Pudding's roar (300 ms) [unverified support per browser] |

### 12.3 Touch
- **Movement:** a floating joystick on the left 45% of the screen. **Camera:** drag on the right side [TECH §7].
- **Right cluster** (64–88 px, size slider in settings):
  - big **Sword** button (hold to charge)
  - **Shield** button (hold to Stand)
  - roll, jump
  - **Milk**
  - a **cat-face** Meow button
  - a contextual **"!"** for interact
  - the two companion portraits (tap to use)
- A glowing **Lit** button appears when Valor is 100. Pause sits top centre.
- Lock-on: double-tap an enemy. Aim assist widens to 90° / 4 m.
- Optional **"Auto-Stand"** assist: after a perfect parry, the Stand is held automatically for 0.5 s.
- A portrait-orientation hint asks the player to rotate; fullscreen is requested on Start [TECH §7].

### 12.4 Input changes requested from tech.md §7
- **RMB moves from dodge to Stand**, and dodge is Shift/K only.
- **Gamepad lock-on moves from R3/RB to RT**; RB becomes companion B and R3 recenters the camera.
- New actions: `guard`, `kitten1`, `kitten2`, `milk`, `meow`, `lit`, `map`, `photo`. Owner: core `Input.js`; this is an additive request.

---

## 13. Audio plan

All files are CC0 under `public/assets/audio/` [ASSET]. **I could not listen to anything**, so every pick is by filename and description and needs an audition.

### 13.1 Music

| Context | Track | Notes |
|---|---|---|
| Title screen | `music/field_of_dreams.mp3` | ASSETS.md notes there's no dedicated cute menu theme |
| Prologue, Academy | `music/village_bards_tale.mp3` | Fades to silence before the Laughing Fog |
| Prologue title sting, L4 waves, Sky Ride chase | `music/battle_theme_a.mp3` | Start offset to be picked by ear |
| L1, L2 day, L5 exploration | `music/field_of_dreams.mp3` | |
| Regular combat (crossfade when 1 or more enemies are alerted, 1.5 s) | `music/battle_fast_fight_loop.ogg` | Seamless 24 s loop |
| Bosses | `music/boss_epic_battle_loop.ogg` | |
| L2 night, L6 approach | `music/dark_forest_creepy.ogg` | |
| L2 tunnels, L3 Bogmire ambience | `music/cave_theme.ogg` | |
| Pawsbury (day) | `music/village_town_theme.mp3` | |
| Pawsbury (15 or more kittens) | `music/village_bards_tale.mp3` | |
| Bakery interior | `music/tavern_old_tower_inn.mp3` | |
| Emotional scenes (letters, Marmalade in bed, ending crescendo), grey hub | `music/story_lament_warriors_soul.mp3` | |
| Knighting ceremony | `music/castle_kings_feast.mp3` | |
| Epilogue festival in Pawsbury | `music/festival_minstrel_dance.mp3` | |
| Boss defeated | `music/victory_fanfare.mp3` | About 4 s |
| Results screen | `music/victory_8bit_loop.ogg` | It may clash with the cinematic tone [audition]; if so, use a Kenney jingle |
| Meme Cam | **No music.** Wind only. | Matches the silent viral loop; the X copies have no audio [TREND §5] |

### 13.2 Sound effects

| Event (bus) | Files |
|---|---|
| Snip / Snap swing (`PLAYER_SWING`) | `sfx/sword/swish_01–13` (random, rate ±10%) |
| Big Swoosh, Oath Spin | `sfx/sword/swing`, `swing2`, `swing3` |
| Hit on soft / furry targets | `sfx/impact/impactSoft_medium_00x`, `sfx/sword/melee_sword` |
| Hit on armor (Haters, Pugs) | `sfx/impact/impactPlate_light/medium_00x` |
| Kill "poof" | `sfx/impact/impactSoft_heavy_00x` + `sfx/pickup/bubble` (pitched up) [audition] |
| Stand block | `sfx/impact/impactMetal_light_00x` |
| **Steadfast parry** | `sfx/sword/sword_clash_0x` + `sfx/impact/metal_ringing` |
| Charge tiers / Gold Hour release | `sfx/magic/spell_01`, `spell_02` / `sfx/pickup/powerup_rise05` + `sfx/magic/magic1` |
| Lit From Within activation | `sfx/pickup/powerup_rise07` + `sfx/jingles/jingles_STEEL0x` [audition] |
| Sword draw (cutscenes) | `sfx/sword/sword_unsheathe` 1–5 |
| Footsteps | `sfx/footsteps/footstep_grass_00x`, `stone_l/r*`, `footstep_wood_00x` (boardwalks), `footstep_snow_00x`, plus a quiet armor jingle `sfx/impact/chainmail1/2` every 2nd step |
| Cape | `sfx/impact/cloth`, `cloth_heavy` (rolls, glide start) |
| Meow / Swordcat hurt / faint | `sfx/cat/kitten_mew_01`, `meow_baby_01`, `cat_softmew` / `cat_mewfood` [audition] / `cat_softmew` pitched down |
| Purr (sit box, Lantern Night, slow blink) | `sfx/cat/cat_purrsleepy_loop`, `cat_purractive_loop` |
| Milk sip | `sfx/pickup/bubble`, `bubble2` |
| Rats | `sfx/creature/rat_squeak_attack/pain/death` |
| Crows | **Gap: no crow caw.** Try `c80_scream_01/02` pitched up, or zzfx [audition] |
| Molegrims, Mole King | `sfx/creature/c80_grunt_0x`, `rpg_giant1–5` (King); digging `impactSoft_heavy` |
| Bramblehog roll | `sfx/impact/impactWood_medium` loop + `c80_nose` |
| Hornets | `sfx/creature/c80_bug_01–04` (pitched up as the dash nears) |
| Gloomjellies / Slime Sovereign | `sfx/creature/slime_01–16`, `rpg_slime1–10`, `splash_0x` |
| Toad Hexer | `sfx/creature/c80_burp_01/02` (the throat sac), `bubble_0x` |
| Ermine | `sfx/creature/rpg_shade1–15` (vanish), `c80_misc_0x` |
| **Hyena laughter** | **Gap: no hyena laugh.** Build a laugh from `c80_troll_01–03` / `c80_weird_0x` chopped and pitched, or a zzfx sequence. Positional: `PositionalAudio`, ref distance 3, rolloff 1.4 [TECH §14] |
| Pugs | `sfx/creature/c80_barking_01/02`, `animal_bark`, `c80_nose` (snort) |
| Pudding roar / nervous squeak | `sfx/creature/creature_roar_01–03`, `c80_roar_01–03` at rate 0.8 / `c80_ooh` |
| Gnash | `rpg_giant` pitched; silent most of the time (he never laughs) |
| Cacklejaw | Laugh build (above) at rate 0.85, `rpg_ogre1–5` (effort grunts) |
| Fish pickup | `sfx/pickup/coins_01–04`, `coin`, `coin2`, `coin3` |
| Yarn piece / heart container | `sfx/pickup/gem_0x` / `sfx/pickup/powerup_rise03` |
| Lost kitten found | `sfx/jingles/jingles_PIZZI0x` + `sfx/cat/kitten_mew_01` [audition] |
| Lost Letter | `sfx/ui/bookFlip1` + `jingles_NES0x` (short) [audition] |
| Oath learned | `sfx/jingles/jingles_STEEL0x` |
| Chest / gate / door / lever | `sfx/world/lock_open_01` / `metal_open_01`, `metal_close_01` / `doorOpen_1/2` / `metalLatch` |
| Crates and barrels | `sfx/world/wood_breaking_01/02`, `wood_hit_0x` |
| Ballista, ram, siege | `sfx/impact/impactWood_heavy_00x`, `impactMetal_heavy_00x` |
| Rain / water | `sfx/world/loop_rain`, `loop_water_01` |
| UI | `sfx/ui/click_00x`, `select_00x`, `confirmation_001`, `back_001`, `bookOpen`/`bookClose` (pause/letters), `scroll_001` (dialogue open) |
| Dialogue typewriter | See babble (§13.3) |

**Procedural audio** (Web Audio, owned by the audio agent):
- **Wind:** looping pink noise through a band-pass at 400–900 Hz, with gain and frequency LFOs driven by the same `uWind` value as the grass. There's no wind file in the assets.
- **The Sunbell:** additive synthesis with inharmonic partials (ratios about 0.5, 1, 1.19, 1.56, 2, 2.66, 3.01) and a 6 s exponential decay. There's no bell file.
- **Hitstop:** a 30 ms duck on the music during hitstop.

### 13.3 Voice "babble" (no voice acting)
- Each character speaks in short pitched blips while the text types on at 30 characters per second [TECH §15]. One blip per 3 characters, from a pool, with ±5% random pitch.

| Character | Pool | Rate |
|---|---|---|
| Swordcat | `cat/cat_softmew`, `kitten_mew_01` | 1.25 (very soft volume) |
| Pearl | `kitten_mew_01` | 1.45 |
| Mochi | `cute_creature_01–03` | 0.95 |
| Sage | `cute_creature_04–05` | 1.1 |
| Clover | `cute_creature_06–07` | 1.0 |
| Earl Grey | `cute_creature_08` | 0.85 |
| Pip | `cute_creature_09–10` | 1.4 |
| Marmalade | `meow_01` | 0.75 |
| Snowpaw | `meow_baby_01` | 1.2 |
| Pudding | `creature_roar_01` | 0.8; one roar per line |
| Hyenas | laugh-build chops | — |
| Coo | `animal_peeps` | 0.7, "Coo." [audition] |

### 13.4 Mix
- Buses: master / music / sfx. Music −6 dB under dialogue.
- **3D for enemies**, **2D for the player and UI** [TECH §14].
- Music crossfade 1.5 s; boss music snaps in within 0.3 s at the arena wall.

---

## 14. Visual direction

Full spec in `art.md`; the essentials for story beats:
- **The mood rule** [ART §0]: the world is desaturated, misty and low-contrast. **The heroes carry all the warm saturation** (ginger, pink, red cape, gold). Every shot must keep that split.
- **The story is told in light.**

  | Story point | Fog | Light |
  |---|---|---|
  | Prologue / L1 | Grey-green, 0.045 | Overcast |
  | Hub (first visit) | 0.025 | Golden hour |
  | L2 | — | God rays, then lantern night |
  | L3 | Heavy green fog | Rain |
  | L4 | Rising grey | Torches; her first full gold glow |
  | Hub after L4 | Grey | Gloom |
  | L5 | White blizzard | — |
  | Sky Ride | — | Night to dawn |
  | L6 | — | Storm and embers |
  | Ending | Lifts everywhere | Gold everywhere |

  **Her glow is the only warm light in the cold biomes**: "a little lantern of hope" [ART §12].
- **Signature poses:** **Vigil** (ref2) for idle, checkpoints and the Stand; **Oath** (ref1/ref3) for charge, title, victory and the Meme Cam [ART §2.2]. The bow is in every shot.
- **Scale contrast** [TREND §6]: low cameras that look slightly up at her, giants framed so they fill the frame (Pudding, Tallbert, Cacklejaw), and pull-back reveals.
- **Cute enemies:** chibi proportions, oversized helmets, no pink. Defeats end in poofs and spinning helmets, never gore [ART §11].
- **Post-processing:** bloom (stronger for Holy), vignette, subtle DOF in gameplay, strong DOF in cutscenes, an optional grade with 'grey' and 'gold' presets [ART §10].
- **Typography and UI:** parchment, pink, gold [ART §13].

---

## 15. Technical mapping

Module ownership follows tech.md §4/§20. The three.js classes named here exist in r186 [TECH §1].

| Feature | Owner / module | three.js systems and techniques |
|---|---|---|
| **Swordcat model** | `player/SwordcatModel.js` | Procedural primitives (Sphere/Capsule/Lathe/Extrude/Tube geometry) [ART §2]. Shell fur: `InstancedMesh` + custom `ShaderMaterial` (head, bib, tail) [ART §3]. Eyes: `CanvasTexture` + `MeshPhysicalMaterial` clearcoat. Bow: sheen `MeshPhysicalMaterial`. Spring secondary motion for ears, bow and tail [TECH §11.2]. |
| **Cape** | player | CPU verlet 9×13 grid → `PlaneGeometry` position attribute + `computeVertexNormals()` [ART §5]. MVP fallback: the vertex-shader sway. |
| **Armor and blade** | player | `MeshStandardMaterial` metalness 1 + PMREM env from `makeOvercastEnv` [ART §4.1], or an HDRI via **`HDRLoader`** (renamed from RGBELoader in r180 [TECH §1]) + `PMREMGenerator` |
| **Holy / Lit From Within** | player + fx + core PostFX | Emissive blade; additive cylindrical-billboard `ShaderMaterial` streak; BackSide additive aura hull; `PointLight`; `Points` sparkle shader; `UnrealBloomPass` strength tween; `Loop.timeScale` [ART §4.3, §8, §10; TECH §6] |
| **Moveset FSM** (guard, parry, glide, pounce, milk, meow, zoomies, lit) | `player/PlayerStates.js` | Plain JS FSM. Physics via `ctx.physics.moveActor`. Stand / parry resolved in `Combat.applyHit`: if `target.guarding` and the hit is frontal (dot of the hit direction with facing > cos 70°), it is blocked or parried. |
| **Attacks, swept arcs, hitstop, shake** | `combat/Combat.js`, `attacks.js` | `sectorHit` and `applyHit` [TECH §9], extended with `blocked`/`parried` and projectile reflection. Projectiles in pooled `InstancedMesh`es. |
| **Enemies** | `enemies/*` | Base FSM [TECH §10]. GLBs via `GLTFLoader` + `SkeletonUtils.clone` + `AnimationMixer` [TECH §11.1]. Procedural builds for rats, moles, hedgehogs, beetle and hyena heads. Telegraphs: emissive flash, a `RingGeometry` additive decal, and a radial `CanvasTexture` shadow decal that grows. CanvasTexture breastplate words for Haters. |
| **Jeer / Gloom** | enemies + world env controller | Global `scene.fog.density` tween (the env controller sums the base, story and Jeer contributions); mist cards speed up; event `env:fog` |
| **Bosses** | `enemies/types/boss*.js` | Phase tables keyed on HP thresholds → `BOSS_PHASE`. Arena walls as Octree meshes. Shadow clones (B6) as cheap copies with `castShadow = false` and no blob shadow. |
| **Companions** | `companions/Companion.js`, `KittenModel.js` | `buildKitten(cfg)` with sheen fur at a distance [ART §3.5, §7]. Seek + separation steering. Abilities call combat. Nap state. |
| **Lost kittens in the hub** | world (village build) + companions (model) | `GameState.kittens` → spawn at fixed activity spots; LOD to sheen-only beyond 12 m; capped at 30 |
| **Levels** | `world/levels/<id>.js` | Heightfield terrain [TECH §5]. Kenney/KayKit GLBs cloned or instanced (`InstancedMesh` for 10 or more copies; `BatchedMesh` for mixed statics) [TECH §18]. Grass `InstancedMesh` per 32 m chunk with the `onBeforeCompile` wind shader [TECH §12.2]. `FogExp2` + height fog [ART §9.2]. Sky dome `ShaderMaterial`. God-ray cones. Water: a low-roughness `MeshStandardMaterial` with a scrolling normal map. |
| **Particles** (dandelion fluff, fireflies, snow, embers, sparkles, poofs) | `fx/Particles.js` | `Points` with an additive `ShaderMaterial` [ART §8]; pooled |
| **Sword trail** | `fx/SwordTrail.js` | Ring-buffer triangle strip, additive; gold for Holy [TECH §11.3] |
| **Cutscenes** | `story/StoryManager.js`, `story/cutscenes/*.js` | A data timeline (§4.4). Camera rails: `CatmullRomCurve3` from level anchors. DOF via `BokehPass` [ART §10.1; tech.md doesn't include it, so this is an optional add]. Letterbox in CSS. Actors in a `scripted` state. |
| **Camera modes** | `camera/FollowCamera.js` | follow (spring arm [TECH §8]), lock-on, boss (5.5 m), **meme** (`MEME_LOOP`), **selfie**, **cutscene rail**, **photo** (free orbit), **skyride** (rail + offset) |
| **Meme Cam trigger** | player (idle timer) → `cam:mode` event → camera; ui caption | Blend over 2.0 s; HUD fade via a CSS class |
| **Sky Ride** | `world/levels/skyride.js` + a dedicated `player/SkyRideController.js` [STRETCH] | Rail on `CatmullRomCurve3`; the player offset is clamped to 12 × 8 m; clouds as instanced billboards + KayKit cloud GLBs; the balloon patches are hurtboxes. Pudding: `Dragon_Evolved.glb`, `Fast_Flying` clip. |
| **The ending's fog lift** | world env controller + story | Tween fog density, sun color and intensity, hemisphere colors and sky-dome uniforms; **regenerate PMREM once** with the gold horizon; a gold shaft cone mesh; expanding ring mesh; `renderer.compileAsync` before the scene to avoid hitches [TECH §12.1] |
| **Damage numbers, HUD, dialogue, menus** | `ui/*` | DOM overlay; `Vector3.project(camera)` for world anchors [TECH §15] |
| **Audio** | `audio/AudioManager.js` | `AudioListener` on the camera; A/B music crossfade; 2D/3D pools; `PositionalAudio` laughter; procedural wind and bell via `OscillatorNode` / noise `AudioBuffer` [TECH §14] |
| **Save** | `save/SaveManager.js` | Versioned localStorage [TECH §16], extended by the `GameState` fields below |
| **Photo mode** | camera + ui | Time scale 0; render, then `toBlob` in the same task (or `preserveDrawingBuffer` only while in photo mode) |

### 15.1 Event catalog additions (requested from the core owner; additive only)
`player:guard {on}` · `player:parry {attacker, projectile}` · `player:perfectDodge {}` · `player:meow {position}` · `player:milk {left}` · `player:lifeLost {lives}` · `player:valor {value, max}` · `player:lit {on}` · `companion:ability {id, ability}` · `companion:nap {id, on}` · `cutscene:start {id}` · `cutscene:end {id, skipped}` · `boss:start {boss, name, maxHp}` · `boss:defeated {boss}` · `letter:collected {id}` (or `ITEM_PICKUP` with `item: 'letter'`) · `enemy:jeer {enemy, on}` · `env:fog {density, dur}` · `cam:mode {mode}`

### 15.2 GameState / save additions
`lives`, `valor`, `milk {have, cap}`, `fish`, `hpMax`, `yarn`, `kittens: string[]`, `letters: string[]`, `oaths: string[]`, `companions {unlocked: string[], active: [a, b]}`, `cosmetics {swords: string[], capes: string[], equipped {sword, cape}}`, `sharpness: 0..4`, `difficulty`, `achievements: string[]`, `memeCamSeen: number`, and `flags` such as `prologue.done`, `meadow.mochi`, `meadow.boss`, `hub.redCape`, `forest.clover`, `forest.sage`, `forest.lantern`, `forest.boss`, `bog.chase`, `bog.earlGrey`, `bog.letters`, `gate.boss`, `gate.bellStolen`, `peaks.pip`, `peaks.boss`, `skyride.done`, `keep.pearl`, `keep.boss`, `ending.seen`.

### 15.3 Test hooks (additions to tech.md §19.3)
`__GAME__.story.play(id)`, `__GAME__.story.flag(k, v)`, `__GAME__.player.setValor(n)`, `__GAME__.cam.mode(name)`, `__GAME__.idle(seconds)` (fast-forwards the Meme Cam timer). The smoke test adds screenshots of `MEME_LOOP` and of a Gold Hour Strike at full charge, and a blank-check on each.

---

## 16. MVP vs stretch

### 16.1 MVP (one complete, emotionally whole story, about 60 min)

| Area | MVP content |
|---|---|
| **Story** | The Prologue (cutscenes A and B + Midnight Practice), L1, the hub, L2, L4, L6, and the ending + post-credits. **The Meme Cam.** The Sky Ride as a 40 s cutscene. |
| **Levels** | `academy` (small), `meadow`, `village`, `forest`, `gate`, `keep` |
| **Moveset** | Everything in §5 except Ninth Life Grit (which comes with L5). Cape Glide is in, from L2. Steadfast II is folded into the L2 reward instead of L3. |
| **Companions** | Mochi, Sage, Clover; 2 active |
| **Enemies** (10 types) | Scurrier, Rat Pikeman, Rat Crossbowman, Crow Raider, Molegrim, Bramblehog, Gloomjelly (L2 edges), Hyena Hater, Hyena Heckler, Pug Brute; plus the Post Stealer as an L4 harasser |
| **Bosses** (4) | Grizzlechop, Burrowmaw, Gnash, Cacklejaw (all phases) |
| **Progression** | Fish, Smithy, Bakery, Yarn (8 pieces in MVP levels → +2 hearts), lost kittens (20 in MVP: 5 each in L1, L2, L6 and the hub), letters (20: 5 each in L1, L2, L4, L6), 6 sword skins, 4 capes |
| **Visuals** | Hero shell fur at 16 shells, kittens with sheen fur, cape **vertex sway** (verlet is stretch), grass, fog + height fog, bloom, Holy FX |
| **Audio** | Music map, SFX map, babble, procedural wind and bell, hyena laugh build |
| **UI** | Full HUD, dialogue, title, pause, settings, results, life-lost, game over; touch controls |

**MVP story stitch** (what changes when L3 and L5 are cut):
- **End of L2:** the Mole King has the Post Stealer's mailbag (he was hired to guard it, "and I can't read"). **CS-L3 "The Letter"** plays at the Root Hall exit. Coo flies off with the summons.
- **Earl Grey** becomes a hub NPC who "studied the Horde" (lore) instead of a companion.
- **After L4:** the Sky Ride cutscene goes directly from Pawsbury to the Keep (Pudding: "Get on."). **Pip** appears in L6 as a scripted helper who steals the lever key in the courtyard (non-companion).
- Marmalade's letter, the Gate, Pudding rising, the Bell, Pearl and the whole ending stay intact.

### 16.2 Stretch (in priority order)
1. **L3 Bogmire** + Earl Grey + the Post Stealer chase + Slime Sovereign + Toad Hexer.
2. **L5 Frostwhisker** + Pip + Ermine + Corvessa + Ninth Life Grit.
3. **Interactive Sky Ride.**
4. Verlet cape and hero fur at 24 shells in cutscenes.
5. **Photo Mode "Peak Cinema"** + achievements.
6. Pearl as a hub tag-along; the kitten parade; credits made of the player's own snapshots.
7. Optional **L7 Moonlit Abbey**.
8. Lost kittens 21–30, letters 21–30, and the remaining skins and capes.
9. Gamepad rumble, haptics, localisation.

---

## 17. Open questions and risks

| # | Item | Status / proposal |
|---|---|---|
| 1 | Rights to the "Swordcat" name and "Meow Island" | **[unverified]**. Legal check before release; fallback names in §0 |
| 2 | **No hyena, crow, wind or bell audio** in the assets | Procedural builds are specified (§13). Someone must audition them. |
| 3 | **No hyena, mole, hedgehog or beetle models** | Procedural (art.md style) or KayKit rig + procedural head. Head-bone name on the KayKit rig **[unverified]**: check `Barbarian.glb` node names first. |
| 4 | Pudding: does `Dragon_Evolved.glb` read as cute and red when tinted? Is there a sleeping pose? | **[unverified]**. The S13 clips are all flying. For Lantern Night, use a low hover with `Flying_Idle` at time scale 0.3, or the final frame of `Death` as a "lying down" pose [verify visually]. Fallback: a procedural dragon [STRETCH]. |
| 5 | Meme Cam framing must match V1 | Tune `MEME_LOOP` against `research/videos/frames/x_GeckoTerminal_*_f1–f3.png` side by side |
| 6 | Shell fur cost on mobile | 8 shells on mobile, sheen fallback beyond 12 m [ART §14] |
| 7 | Parry timing on touch | +0.05 s grace on touch, and the Auto-Stand option |
| 8 | Using the lost-kitten count in the L4 pull-back | Minimum 3 scripted kittens so the beat always works; spawn up to 30 in 3 rows; LOD them |
| 9 | Tone of the internet captions | Kept as chapter titles and achievements only; the world's dialogue stays medieval. The backup lines in §4.8 can replace them. |
| 10 | Overlap with `design_scope.md` (different villain names, bosses and levels) | Integrator decision. The arcs in this document (the runt villain who laughs first, the undelivered letters, the pull-back of rescued kittens, the milk redemption) are portable to any boss line-up. |
