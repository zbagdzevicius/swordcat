# SWORDCAT: Nine Lives of Meow Island
## Final Game Design Document (v2.1, implementation edition; v2.1 = completeness pass: story continuity, undefined spawns/anchors, arena and flight specs, asset paths re-checked on disk)

Date: 2026-10-07. Status: **final for the parallel build.** It replaces `research/design_story.md`, `research/design_gameplay.md` and `research/design_scope.md`, which are kept only as background.

**How this document was made.** It merges the three drafts as the judges asked:
- **Production skeleton from the scope draft** (the winner for 2 of 3 judges): asset discipline (`fitToHeight`, `buildBeastHead`), the spine-and-zones level format, the arena template, milestones, cut order and the risk list.
- **Narrative and charm from the story draft** (top score for charm and meme fidelity from all 3 judges): the heroine, Pudding, the Laughing Fog opening, Standing Ground, the Meme Cam, the rescued-kitten pull-back, the letters, the Final Stand, and the cutscene camera presets.
- **Combat feel from the gameplay draft**: the telegraph language, the juice table, Riposte, the whiff lockout, Purrfect Dodge, the boss Dizzy meter, Bright Slash, the Boneheads, the boss lessons, and the unit-test list.
- **Rejected on purpose:**
  - from the gameplay draft: XP and Knight Rank, the Oath Tree, Paw Points and charms;
  - from the story draft: 30 kittens, 30 letters, 12 yarn pieces, the 10-enemy MVP and procedural-only creatures (moles, hedgehogs, beetle);
  - from the scope draft: Sir Galahug.

**Authority.**
- This document wins on gameplay, story, content and numbers.
- `research/art.md` wins on look: palette, fur, armour, cape, sky and fog colours.
- `research/tech.md` wins on architecture, except for the amendments in §19.1.
- Asset paths are relative to `public/assets/` unless they start with `src/` or `research/`.

**Tags**
- **[MVP]** must ship. **[MVP+]** the first additions once the MVP is green, in the listed order. **[STRETCH]** later.
- **[verified]** checked on disk on 2026-10-07: the file exists, or the node, bone or clip name was read from the GLB JSON by script.
- **[unverified]** an assumption nobody has checked.
- **[audition]** an audio file picked by its name that someone must check by ear.
- **[TREND]** a fact from `research/trend.md` (V1–V6 are its video breakdowns). **[REF]** seen in `research/ref/ref1–3`.
- Every gameplay number is a **starting value for tuning**. Nothing has been playtested.

**Units**
- 1 unit = 1 m = Swordcat's height to her ear tips. +Y is up.
- In level data, **+X is east and +Z is north**. Heightfields are centred on the origin, with row 0 at the south edge (tech.md §5).
- Fixed step is 1/60 s.
- Damage uses a **×10 scale for the player**: a basic slash does 10.
- **Player HP counts half-hearts**: 1 HP = ½ heart. Enemy damage to the player is given in HP.

---

## Contents
0. Decision log
1. Title, logline, pillars, scope at a glance
2. World and setting
3. Characters
4. Story: structure and synopsis
5. Cutscenes: system, camera presets, every scene step by step
6. Dialogue: barks, NPC lines, rescues, letters, tutorial text
7. Swordcat: moveset and rules
8. Combat feel: telegraphs, juice, camera
9. Companions
10. Enemies
11. Bosses
12. Levels (layouts, spawns, triggers) and pacing
13. Progression and economy
14. UI: HUD and every screen
15. Controls
16. Audio
17. Visual direction (summary)
18. Asset mapping and verified asset facts
19. Implementation Plan: modules, ownership, interfaces, milestones, tests, risks
20. MVP / MVP+ / Stretch consolidated
21. Open questions and unverified items
- Appendix A: `config.js` tables
- Appendix B: sample data files (level, cutscene, enemy, boss)

---

## 0. Decision log

The drafts disagreed on these points. Each row is now final.

| Topic | Drafts | Final decision |
|---|---|---|
| Heroine's name | Clementine (story, gameplay); Apricot (scope) | **Clementine, "Clem"**. Everyone calls her **Swordcat**, which starts as teasing. She is knighted **Dame Swordcat of the Ninth Seat**. |
| Final boss | Lord Cacklejaw (story); Lord Barkus Grimjaw (scope, gameplay, art.md) | **Lord Barkus Grimjaw, the Dog Warlord** (art.md look), on `Knight.glb` with a bulldog beast head. Motive: he was shooed off the sunny castle steps as a pup. |
| Hyena leader | Cacklejaw / Snickerfang / Hater & Post Stealer duo | **Warchief Cacklejaw** of the Snickerpack, the L4 boss. He gets the story draft's "runt who laughs first" arc. |
| Champion who kneels (V6) | Gnash (story) / Sir Brutus (gameplay) | **Sir Brutus**, the Hound Legion's pug champion. L6 mini-boss: he kneels to her level, then a duel of Stands. |
| Macguffin | Sunbell (story); Dawnstone in 3 shards (scope); Dawn Lantern (gameplay) | **The Sunbell holds the Dawnstone.** Barkus splits it into 3 shards. Each recovered shard sinks into her sword and unlocks power (§13.1). |
| Dragon | Pudding (story) / Ember | **Pudding**: huge, red, scared of everything, roars when nervous, subtitles in parentheses |
| Giant-knight gag (V5) | Sir Tallbert statue / Sir Galahug, a human / Sir Bastion | **Sir Tallbert**, a giant stone statue, in the prologue. The L4 pull-back reveals **her rescued kittens**, not a giant. |
| Starting hearts | 3 / 3 / 5 | **4 hearts (8 HP)**. Max 7 hearts through 3 Heart Bells. |
| Milk | 2 / 2 / 3 | **2 bottles at the start**, max 4 |
| Guard meter | Grit / Nerve / none | **Grit, 3 pips** |
| Progression | Oaths + gear / XP + Oath Tree + charms / shards + shops | **No XP.** Shards, fish shops, Heart Bells, cosmetics. "She never gets bigger." |
| Supers | Gold Hour Strike + Lit From Within + Oath Spin / Golden Hour / only in the story | One ladder: **Big Swoosh → Bright Slash → Holy Slash** (Shard 1), plus one super, **Golden Hour** (Shard 2). Oath Spin and Gold Hour Strike are cut. |
| Meme Cam | MVP / stretch / MVP+ | **MVP** |
| Active companions | 2 / 1 then 2 / 1 | **1 in MVP.** `COMPANIONS.maxActive = 2` after L4 is MVP+ if performance allows. |
| Collectibles | 30 kittens, 30 letters, 12 yarn / 27 kittens, yarns, scraps / 30 Golden Fish | **18 lost kittens (3 per level), 6 Lost Letters, 3 Heart Bells, fish** |
| Viral catchphrases | Ship them / ship them / don't ship them | **Original lines by default.** The token-site captions sit in a `homage` string table that stays off until a legal check (§4.4). Whether they may be used is [unverified]. |
| Level ids | Several sets | **`meadow`, `forest`, `town`, `gate`, `bog`, `keep`** (+ `sky` [STRETCH]). These replace tech.md's smoke list `meadow/forest/village/castle`. |
| L4 | Low Gate siege / Mossgate "The Line" / Last Gate wave defence | **The Low Gate**: Pawsbury's own south gate, with The Line winch objective |
| Lore font | IM Fell English (not downloaded) | **Uncial Antiqua** [verified file] |
| Camera | 3.4 / 4.5 / 3.6 m | **3.6 m**, 4.5 m locked on, 6.0 m for bosses, FOV 45 |
| Jump | 1.25 / 0.87 / 1.11 m apex | **1.245 m** (v₀ 7.4 m/s, g 22). It clears the 1.0 m fences. |
| Projectile reflect | From Shard 2 (scope) / from the start (gameplay) | **From the start**, so a melee hero has an anti-air and anti-ranged answer in L1 |
| Coo the pigeon | The judges flagged the blob path as an error | Both `creatures/monsters-blob/Pigeon.glb` (clip set S1) and `creatures/monsters-flying/Pigeon.glb` (clip set S13) exist [verified]. Coo uses the **blob** one; crows use the **flying** one. |

---

## 1. Title, logline, pillars, scope at a glance

- **Title:** **SWORDCAT**. Subtitle: *Nine Lives of Meow Island*. Both live in `src/story/strings.js` as `GAME_TITLE` and `GAME_SUBTITLE`, so a rename is one edit. Fallback names if legal says no: *Sword Kitten*, *Purrhaven Isle* [unverified need].
- **Logline:** *When the Dog Warlord steals the dawn and the fog swallows Meow Island, the smallest would-be squire, one ear-tuft too short for the sword, straps on borrowed armour and goes after the kittens anyway.*
- **Pitch.**
  - Clementine fails the Academy height chart by one ear-tuft on the eve of Knighting Day.
  - That night the Hound Legion tears the Dawnstone out of the Sunbell. The laughing hyena horde marches every squire away in cages, her little sister Pearl among them.
  - She plants herself in their path in borrowed armour. They laugh, and they walk *around* her.
  - She follows them anyway: across six foggy lands, with a growing band of rescued kittens and a giant red dragon who is scared of everything.
  - At the end she rings the dawn back in.
- **Genre:** a 3D third-person action-adventure in the browser (three.js r186, WebGL2). Linear levels with arena fights and a hub town.
- **Length:** MVP about 75–90 min on a first clear.
- **Platforms:** desktop keyboard and mouse, gamepad, and touch.
- **Audience:** all ages. No blood. Defeated enemies poof into sparkles, lose their helmets and run away [ART §11].
- **Tone:** fierce cuteness, played completely straight [TREND §4]. Swordcat never winks at the camera; the comedy comes from everyone else reacting to her.

**Pillars**
1. **Small but ready.** She is the smallest thing on screen in every shot. Low cameras, pull-back reveals, and giants framed to fill the shot.
2. **Stand your ground.** Guard and parry, called **the Stand**, *is* the meme pose. Holding it near enemies builds Valor (**Standing Ground**). The viral pose is the core verb [TREND V1].
3. **Never alone.** Every kitten she rescues moves into Pawsbury and stays there visibly. In L4 they stand behind her with spoons; in L6 they raise lanterns.
4. **Fog to gold.** Fog density is a story variable. The world gets greyer until her golden glow is the only warm light; at the end the fog lifts and the island turns gold [REF ref1].

### 1.1 Scope at a glance

| Item | MVP | MVP+ / STRETCH |
|---|---|---|
| Levels | **6**: `meadow` (incl. prologue), `forest`, `town` (becomes the hub), `gate`, `bog`, `keep` | `sky` dragon-flight level [STRETCH]; Frostwhisker Peaks, Moonlit Abbey [STRETCH] |
| Enemy types | **9**: Rat Pikeman, Rat Crossbowman, Crow Raider, Gloomjelly (3 sizes), Bramble Spider, Hyena Raider, Post Stealer, Pug Shieldbearer, Bonehead (4 variants) | Warhound, Cellar Bat, Hornet Lancer [MVP+] |
| Bosses | **3 bosses + 1 mini-boss**: Grizzlechop (L2), Cacklejaw (L4), Sir Brutus (L6 mini), Barkus (L6) | Slime Sovereign (L5) [MVP+] |
| Companions | **3**: Mochi, Sage, Clover; 1 active | 2 active [MVP+]; Pip and Earl Grey as companions [STRETCH] |
| Service kittens | Marmalade (bakery), Tofu (forge), Earl Grey (library), Pip (lookout), Pearl (wardrobe) | — |
| Cutscenes | 25 entries: 17 full in-engine scenes, 6 dialogue-only scenes, 2 gameplay gags (§5.4); about 13 min total, all skippable | Bokeh DOF [MVP+]; interactive ending flight [STRETCH] |
| Collectibles | Fish, 18 lost kittens, 6 Lost Letters, 3 Heart Bells | — |
| Signature systems | The Stand + parry + Riposte, Standing Ground, Valor, Golden Hour, Nine Lives, Milk Break, Meow, **Meme Cam**, The Line, Boss Dizzy | Cape Glide [MVP+], Photo Mode [STRETCH] |
| Not building | XP, stat levels, an inventory beyond Milk and keys, interiors other than the keep's cellars, voice acting, branching dialogue, multiplayer, a physics engine, a navmesh, more than 1 save slot, **anything crypto** (no token, wallet or coin branding) | — |

**Scope rules for every agent**
1. **Reuse before you build.**
   - One procedural `buildKitten(cfg)` makes every cat, Swordcat included.
   - One `buildBeastHead(preset)` turns the KayKit humanoid rig into hyenas, pugs and the Dog Warlord.
   - One procedural slime covers every Gloomjelly.
2. **One arena template:** trigger → fog wall → waves → clear (§12.1).
3. **One level format:** spine plus zones in data (Appendix B).
4. **One boss model:** a phase table on the shared Enemy FSM, plus the Dizzy meter.
5. **One source of numbers:** `src/core/config.js` (Appendix A). No hard-coded literals for anything in this document.

---

## 2. World and setting

### 2.1 Meow Island
- A small island kingdom of cats, wrapped in sea fog, in the Big Sea. The Isle of Woof lies to the north, home of the Hound Legion.
- Everything is at kitten scale [ART §1]: doors are 1.6 m, cottages 3–5 m, grass 0.1–0.25 m (0.45 m in tall-grass patches).
- The capital, **Pawsbury**, is a timber-frame town under a small castle. Its **Bell Tower** holds the **Sunbell**.
- The name comes from the creator's bio line "Protecting meow island with 9 lives" [TREND].

### 2.2 Lore
- **The Sunbell and the Dawnstone.** The Sunbell rings at every dawn. The **Dawnstone** set in its crown sends the sun's first light across the island and the sea fog goes home.
  - The first hour of sun after the bell is the **Golden Hour**: the whole island naps in the sunbeam. Cats love sunbeams; the island made it a ceremony.
  - Kittens are knighted at the Golden Hour on **Knighting Day**.
- **The Gloom.** Without the Dawnstone, the fog thickens, greys and goes quiet. In the game the Gloom is literal: the env controller's fog density is a story variable (§12.2, §19).
- **The Order of Nine Lives.** The island's old knighthood has nine seats.
  - Eight are held by very old knights who live scattered around the island. Sir Marmalade is one of them.
  - The ninth seat "is always kept for whoever shows up."
  - Their oath, the **Vigil Oath**: *"Where I stand, the gate holds."* The oath pose, sword planted point-down with both paws on the pommel, is the **Vigil** pose [REF ref2].
- **Nine Lives.** Everyone knows cats have nine. Knights count theirs. Losing one is serious but not tragic: you go home, have soup, and are careful.
- **The Kitten Academy** trains squires. Squires must be "this tall to hold a sword". A height chart is painted on a board at the practice-field gate.

### 2.3 Regions (one per level; art.md §12 biomes)

| Level | Region | Mood |
|---|---|---|
| `meadow` | **Purrdale Meadows** | Misty grey-green farmland, standing stones, windmill, drystone walls. **The exact look of the reference images.** |
| `forest` | **Whiskerwood** | Giant oaks, kitten-scale mushrooms, fireflies, a rat camp and the Cheese Mill |
| `town` | **Pawsbury** | Timber-frame town and castle, cobbles, lanterns. Golden hour in fog. Becomes the hub. |
| `gate` | **The Low Gate** | Pawsbury's outer south gatehouse, at the end of the south road beyond the town's inner South Gate, and a 105 m stone causeway into a fog bank over tidal flats |
| `bog` | **Bogmire** | Marsh, boardwalks, lily pads, will-o'-wisps, a sunken tower, the smugglers' landing |
| `keep` | **Houndhold Keep** | A storm-dark cliff fortress on the Isle of Woof: braziers, red banners with a bone sigil, embers |

### 2.4 Factions
- **The Hound Legion** of **Lord Barkus Grimjaw**: pug shieldbearers, Sir Brutus the champion, and **Boneheads**, animated bone soldiers. Dogs love bones; his are the Boneheads.
- **The Snickerpack**: hyena mercenaries led by **Warchief Cacklejaw**. They scrawl their own titles on their breastplates: **HATER**, **POST STEALER**, **GRUMBLER**, **NAYSAYER**, **SCOFFER**, **SNEERER**, **SPOILER** (the same list as `ENEMIES.hyena.plateWords` plus the stealer's word) [TREND V2]. They laugh at everything small, and their laughter thickens the Gloom.
- **The Rat Militia** of **Captain Grizzlechop**, paid in cheese.
- **Fog wildlife** with no allegiance: Gloomjellies, Bramble Spiders and Crow Raiders, which thrive when the sun is gone. Barkus pays the crows in shiny things.
- **Meow Island**: Princess Snowpaw's court, the Academy, the townsfolk, and every kitten Swordcat brings home.

---

## 3. Characters

All cats use `buildKitten(cfg)` (art.md §2, §7): the same proportions within ±10%, different coats and eyes, and **one unique silhouette prop** each. No voice acting. Characters speak in pitched "babble" blips with text (§16.4).

### 3.1 The heroine: Clementine, "Swordcat"

**Look** [REF ref2; art.md §2 is binding]
- A tiny, extremely fluffy ginger/cream long-haired kitten. Her head is 38–40% of her height; her big eyes are blue-grey. Default expression: wide-eyed and slightly worried [TREND V1].
- **A pink bow on her left ear.** Pearl ties it on in CS-01 shot 5. It is never removable and appears in every shot from then on (and on the title screen).
- Polished silver plate that is slightly too big: four-lame pauldrons, gauntlets, tassets, greaves, and a leather belt.
- **No helmet.** It falls over her eyes in CS-01, so she sets it aside. That is the in-story reason we always see her face.
- **Cape:** Marmalade's faded cream cape until the end of L3 (matches V1 and ref3). Then the royal red cape (ref2), which is a cut-down royal tablecloth.
- **The poster look is always on screen first:** the title loop (CS-00) shows the full ref2 look (pink bow, silver plate, **red cape**, long sword, fog, a gold holy pulse) on a new save, so the meme's canonical silhouette is the first thing a player sees. After that the title shows her equipped cape.
- **The Borrowed Blade:** a straight longsword about 1.0 m long, her own height [ART §4.3].

**Personality**
- Earnest and polite. She speaks in short, formal sentences that come out slightly wrong: "Halt, villain." *(beat)* "...Please."
- Literal-minded: "I am not too small. The sword is too big. That is a different problem."
- Scared, and stays anyway. **Her tell:** her ears flatten for 0.1 s before every Stand.
- Loves milk with a straw, sunbeams and Pearl. Fears being sent home, and being laughed at.
- **Flaw:** she thinks a knight must stand alone. The L4 pull-back cures this.
- **Writing rule:** her lines are at most 8 words, except in four emotional beats. She never jokes on purpose.

**Arc**
1. **Start:** "Knights are big. I must prove I'm big enough."
2. **Middle:** she takes the *posture* of someone strong before she is strong [TREND §4].
3. **L4:** "Nobody's coming. So I'm staying." Then she finds that somebody did come.
4. **End:** "I don't need to be big. I need to be here. And not alone."

She never grows, transforms or levels up. She becomes lit from within: the gold glow.

### 3.2 Family, mentors, court

| Character | Look (art.md §7) | Role | Key line |
|---|---|---|---|
| **Pearl** | Tiny dilute cream-silver kitten, pale pink bow, cream pilgrim cape (ref3 interpretation) | Clem's little sister. Pops out from behind the cow in the tutorial, taken in CS-02, rescued in L5 (CS-11). Runs the Wardrobe after that. | "There. Now you look less scary." |
| **Sir Marmalade** | Chonky orange tabby, grey muzzle, gold eye and an eyepatch, dented rusty plate, drooping plume, walking-stick greatsword, 1.25× width | Holder of the Eighth Seat of the Order, retired, now Pawsbury's baker. The armour is his, from when he was a kitten. Hides in the bakery during the occupation and runs the Bakery in the hub. Starts on his **eighth life**, spends it in L4, ends on his ninth. | "That armour's on loan. Bring it back with a story in it." |
| **Princess Snowpaw** | White Turkish angora, odd eyes (blue and gold), lavender gown, tiny tiara with a pink gem; `props/Crown.glb` at the knighting | Young ruler. Hides in the castle cellar during the occupation. Gives the red cape and knights Swordcat. | "By the power vested in me by the Order of Nine Lives, and also my mum..." |
| **Sergeant Whiskerbottom** | Grumpy grey tabby with a whistle | Academy drill sergeant; runs the height chart. Epilogue gag: he hangs her portrait above the chart. | "Too small for the sword, Clementine." |

### 3.3 Companions: rescued squires who fight with her [MVP]

| Kitten | Look (art.md §7) | Joins | Role | Personality | Signature line |
|---|---|---|---|---|---|
| **Mochi** (blue `#3F6FB5`) | Tuxedo, amber eyes, huge round tower shield, blue tabard, oversized pot helm | L1, rat cage cart at the Old Bridge | Tank | Loud, cheerful, always hungry, clumsy and brave. An Academy reject ("too clumsy"). | "I'm not scared! My tummy is scared. Separate thing." |
| **Sage** (green `#5E7F3E`) | Silver mackerel tabby, green eyes, pointed leaf-green hood, short bow | L2, treetop cage | Ranger, anti-air | Deadpan; secretly cries at stories | "I've counted forty hyenas. We have four kittens and a spoon." / Clem: "Two spoons." |
| **Clover** (cream `#F6F1E8`, gold bell) | Calico, hazel eyes, white coif, brass bell collar, flower staff | L3, the town stocks | Healer | Motherly and sing-song; calls everyone "sweetpea"; fierce if you hurt a baby | "Hold still, sweetpea. This purr is medicinal." |

### 3.4 Service kittens (rescued; hub stations) [MVP]

| Kitten | Look | Rescued | Hub station | Line |
|---|---|---|---|---|
| **Tofu** | White kitten, soot smudge, oversized smith's apron | L3 Forge Yard, hiding in a barrel stack | **Forge**: Sharpness, sword skins | "Sharpen it? I can barely *lift* it." |
| **Earl Grey** | Siamese, sapphire eyes, giant floppy wizard hat with stars, round glasses, floating book | L3 Market Square, **inside a giant Gloomjelly, reading** | **Library**: holy upgrades. Cranks the winch in L4. | "Do you MIND? I was nearly at the good chapter." |
| **Pip** | Solid black, yellow-green eyes, very long red scarf, tiny dagger | L4 Old Battlefield, in a hyena war-wagon cage she has already unlocked ("waiting for dramatic effect") | **Lookout**: shows which lost kittens and letters are left in each level. Steals back the winch pin in L4. | "Stole it back. You're welcome." |
| **Pearl** | See §3.2 | L5 Smugglers' Landing | **Wardrobe**: capes | "Hold still, Clem. Your bow's crooked." |
| *Sir Marmalade* | See §3.2 | Found in L3 | **Bakery**: Milk satchels, refills | "Milk's on the house. Straws extra. Kidding." |

### 3.5 The 18 lost kittens [MVP]
- These are the Academy's youngest class, carted off in the raid. Three are hidden in each level.
- Each one walks home (the three `keep` kittens fly home on Pudding in CS-16) and **lives visibly in Pawsbury** at a fixed activity spot (§12.5).
- They are lost only from CS-02 on (the raid), so **no lost kitten can be found during the prologue**.
- Each says one line when found (§6.4). They are built with seeded `buildKitten` variety (villager coats and accessories, art.md §7).

| Level | Kittens |
|---|---|
| `meadow` | Biscuit, Noodle, Button |
| `forest` | Pickles, Pebble, Sprout |
| `town` | Waffles, Toffee, Muffin |
| `gate` | Tater, Mittens, Socks |
| `bog` | Juniper, Bramble, Fennel |
| `keep` | Bean, Crumpet, Dumpling |

### 3.6 Big friends

| Character | What | Role | Asset |
|---|---|---|---|
| **Pudding** | A **huge red dragon**, about 6 m long, scared of everything. He roars when nervous, which is always. He speaks only in roars, with parenthetical subtitles: "ROOOAR. (Is that... milk?)" | L1 Milk Break and the net rescue. L2 Lantern Night, asleep. L4 rises behind the gate. L5 carries them north. L6 burns the keep gate. Ending flight. | `creatures/monsters-flying/Dragon_Evolved.glb`, one skinned mesh `Dragon`, bones `Head, Neck, Torso, Body1–4, UpperArm.L/R` [verified]; clips S13 `Flying_Idle, Fast_Flying, Headbutt, HitReact, Yes, No, Punch, Death` [verified]. Red tint `#E0503A` over the atlas [unverified look]. |
| **Sir Tallbert** | A giant stone statue of a "Tall Folk" knight at the practice-field gate. Nobody remembers if he was real. | Prologue pull-back gag [TREND V5] | `characters/kaykit/Knight.glb` fitted to 6.0 m; stone material `#8C8F88` (roughness 0.95); frozen on frame 0 of `2H_Melee_Idle`; `2H_Sword` visible, the other weapons hidden |
| **Coo** | Royal Post courier pigeon. Only ever says "Coo." | Carries the summons in L3; arrives with the old knights in the ending | `creatures/monsters-blob/Pigeon.glb` (S1 clips) [verified], untinted |
| **The old knights** | The other **seven** seat-holders of the Order: elderly cats in rusty armour (Marmalade's config with varied coats). Their spokescat is **Sir Snoozalot** (white, droopy whiskers, nightcap under his helm), who only ever asks "Did we miss it?" | Ending: they arrive late by donkey cart, having got Coo's letters | `creatures/animals/Donkey.glb` (clips `Walk`, `Idle`, `Idle_Headlow` [verified]) + `env/town/cart.glb` [verified] |

### 3.7 Villains

| Character | Look | Role | Personality | Key line |
|---|---|---|---|---|
| **Lord Barkus Grimjaw**, the Dog Warlord | 3.0 m bulldog. Brindle `#6B4E3A`, jowls, an underbite with two little fangs, eyepatch, horned helm, spiked collar holding **Shard 3**, black iron plate `#2E3036` with blood-red trim `#8E1B22`, tattered black cape, huge cleaver with a red-hot edge `#FF3B30` [ART §11] | Final boss (B3). Steals the Dawnstone. | Gruff and wounded. As a pup he was shooed off the sunny castle steps where the cats nap. His logic: "If dogs can't have the sun, nobody can." | "No cats. On the sunny. Steps." |
| **Warchief Cacklejaw** | 2.2 m hyena: tawny with dark spots, mane, chipped left ear (hidden under his hat until phase 3), "HATER-IN-CHIEF" plate, oversized curved blade | Leads the Snickerpack. Laughs at her in the prologue; L4 boss (B2). | Laughs at everything small, and laughs **first**, because as the runt he was laughed at. He can't stand anyone who keeps standing. | "A kitten! With a SWORD! And a little BOW! HAHAHA— no, stop, I can't— leave it. LEAVE it! It isn't even a threat!" |
| **Pilfer, the Post Stealer** | Skinny hyena in a hood, "POST STEALER" scrawled on his breastplate [TREND V2], mailbag, a stolen signpost under one arm | Recurring thief: signposts and the Royal Post bag (prologue), the chase (L3), the winch pin (L4). Post-credits: Royal Postmaster. | Cheeky coward who loves puns | "Finders keepers! Stealers... also keepers!" |
| **Captain Grizzlechop** | Rat at 1.6 m: feathered hat, sabre, cheese-wheel shield | L2 boss (B1). Holds Shard 1. | Pompous; paid in cheese | "I yield! I YIELD! Mind the cheese!" |
| **Sir Brutus** | 1.9 m pug champion in Knight plate with a plain great-helm (`Knight_Helmet`) and a greatsword (`2H_Sword`). The only Legion soldier who never mocks her. | L6 mini-boss. Kneels to her level. | Quiet and honourable | "I don't fight from up there. Down here, we're equals." |


---

## 4. Story: structure and synopsis

### 4.1 Theme and emotional arc
- **Theme:** *Small is not the same as weak. Brave is just staying.*
- **Second theme:** *You don't have to stand alone.*

| Beat | Where | Swordcat feels | Player feels |
|---|---|---|---|
| One ear-tuft short at the height chart | Prologue | Small, determined | Aww; injustice |
| The horde laughs and walks around her | Prologue | Humiliated, then resolved ("...Okay.") | "Let's go get them" |
| Milk Break, then Pudding | L1 | Startled, then kind | Laughter |
| Mochi, a fellow reject | L1 | "I can do this" | Competence |
| Lantern Night: "I'm not brave. I'm just... here." | L2 | Honest doubt | Warmth |
| The undelivered letters and Marmalade's kitten letter | L3 | "Nobody came because nobody knew" | Tenderness |
| "Nobody's coming. So I'm staying." Then the pull-back | L4 | Alone, then not alone | **Peak emotion** |
| Shard 2 lights her gold; Pudding rises behind the gate | L4 | Triumph | Triumph |
| Cacklejaw: "So I laughed first." | L4 | Compassion | Lump in throat |
| Marmalade spends his eighth life; the hub turns grey | L4 end | Low point | Loss |
| Pearl re-ties the crooked bow | L5 | Relief | Relief |
| Brutus kneels; the duel of Stands | L6 | Respected | Pride |
| "Stay down, little thing." Lanterns on the ramparts. HOLD THE STAND. | L6 | Lit from within | Catharsis |
| Milk for Barkus in the sunbeam | Ending | Kindness | "Oh no, I'm crying" |
| "Arise, Dame Swordcat." | Ending | Belonging | Joy |

### 4.2 Structure

| Act | Chapter (default title) | Level id | Boss | Who joins | Unlock |
|---|---|---|---|---|---|
| I | Prologue: **"One Ear-Tuft Short"** | `meadow` (practice field, evening then night) | — | — | Basic moves (tutorial) |
| I | Ch. 1: **"Small Paws, Big Sword"** | `meadow` | — | Mochi | — |
| I | Ch. 2: **"The Cheese Mill"** | `forest` | B1 Captain Grizzlechop | Sage | **Shard 1: Holy Slash**; Heart Bell #1 |
| II | Ch. 3: **"The Quiet Town"** | `town` | Pilfer chase (set piece) | Clover; Tofu, Earl Grey, Marmalade (services) | Red cape; **hub opens**; shops |
| II | Ch. 4: **"Where I Stand"** | `gate` | B2 Warchief Cacklejaw | Pip (service) | **Shard 2: Holy Wave + Golden Hour**; Heart Bell #2 |
| III | Ch. 5: **"The Bow"** | `bog` | Elite slime wave [MVP] / B4 Slime Sovereign [MVP+] | Pearl (service) | Heart Bell #3 |
| III | Ch. 6: **"The Last Light"** | `keep` | Mini: Sir Brutus. B3 Lord Barkus. | — | Shard 3: the finale |
| — | Epilogue: **"Dame Swordcat of the Ninth Seat"** | `town` (gold) | — | — | Dawnblade skin, Gold cape |

### 4.3 Synopsis, level by level

**PROLOGUE: "One Ear-Tuft Short"** (`meadow`, practice field; CS-01, tutorial, G-01, CS-02)
- On the eve of Knighting Day, at the Kitten Academy's practice field outside Pawsbury, Clementine fails the height chart by one ear-tuft.
- Her little sister Pearl, who is sleeping over with the squires to watch from the front row at dawn, ties a pink bow on Clem's ear "so you look less scary".
- That night Clem sneaks into Marmalade's old armoury barn at the field. She borrows the tiny armour and long sword from a chest marked "M. — my first". The helmet falls over her eyes, so she leaves it.
- **Midnight Practice** (playable tutorial): move, jump the fence, the combo, the roll, the Stand and parry, Bright Slash, Meow at the sleeping cow (Pearl, who sneaked out to watch, pops out from behind it), and the Sir Tallbert gag.
- **The Laughing Fog.**
  - The wind dies. Far away, the glow in the Bell Tower goes out: a giant dog shape tears the Dawnstone from the Sunbell.
  - Cackling comes from everywhere. The Snickerpack marches out of town along the lane carrying cages: every squire, and Pearl.
  - Clem plants herself in their path in the meme pose. Warchief Cacklejaw leans down, laughs until he cries, and orders the horde to walk around her: "It isn't even a threat!"
  - Pilfer the Post Stealer takes the signpost next to her, then the Royal Post bag.
  - The fog swallows them. She trembles. "...Okay." She lifts the sword again and walks into the fog. **Title card.**

**CHAPTER 1: "Small Paws, Big Sword"** (`meadow`, dawn)
- The signposts are gone, so she follows the trail of letters dropping from Pilfer's bag.
- Rats ambush her at the Standing Stones.
- At the Picnic Glade she takes a **Milk Break** and records a little selfie. A huge red dragon roars out of the fog: **Pudding**, starving, terrified and tangled in a hound net. She cuts him loose and shares her milk. He follows "at a safe distance", hiding behind trees much smaller than he is.
- At the Old Bridge she holds the bridge against three rat waves and frees **Mochi**, a fellow Academy reject ("too clumsy"), from a rat cage cart. The cart tracks lead into Whiskerwood.

**CHAPTER 2: "The Cheese Mill"** (`forest`)
- She follows the rat supply trail through giant mushrooms and a spider hollow.
- She frees **Sage** from a treetop cage.
- **Lantern Night:** at camp, Pudding sleeps curled around the clearing while Clem keeps watch with a lantern. "I'm not brave. I'm just... here." Mochi: "That's what brave is, I think."
- She storms the Rat Camp, then the **Cheese Mill**, and beats **Captain Grizzlechop**. He yields and hands over **Shard 1**, which sinks into her sword (**Holy Slash**). "The cages went to Pawsbury. The Legion holds the whole town!"

**CHAPTER 3: "The Quiet Town"** (`town`, occupied)
- Pawsbury is occupied by rats, pugs and Post Stealers. She lights the lanterns of Lantern Alley to push back the fog.
- **Marmalade** is hiding in his bakery. "Is that... my armour?" "...It's borrowed." "That armour's on loan, then. Bring it back with a story in it."
- **The Pilfer chase** along Bakery Street wins back the Royal Post bag. **The Letters:**
  - Inside are Princess Snowpaw's summons to the eight old knights of the Order: *"Please come home. The gate needs holding."* She wrote them a week before Knighting Day, when hound sails were first seen off the north coast; the bag hung on the lane's post hook waiting for the dawn courier when Pilfer took it. None was ever delivered. **Nobody came because nobody knew.**
  - Coo the courier pigeon flies off with them.
  - Clem also finds a yellowed letter from Marmalade, written at **seven months old**, and tucks it into her belt.
- She frees **Tofu** at the Forge Yard, and **Clover** from the stocks in the Market Square. A giant Gloomjelly rises from the fountain; popping it frees **Earl Grey**, who was reading inside.
- At the Castle Steps, under the dark Sunbell, **Princess Snowpaw** gives her the **royal red cape**, "a tablecloth, velvet mostly". Marmalade: the second shard is with the hyenas, and they will come through the **Low Gate**. **The town becomes the hub.**

**CHAPTER 4: "Where I Stand"** (`gate`)
- The Snickerpack marches on Pawsbury. The portcullis winch is jammed: Pilfer pinched the pin.
- Earl Grey can improvise a fix but needs time. Clem scouts the Old Battlefield beyond the causeway and frees **Pip** and two kittens (Tater, Mittens) from a hyena war-wagon; Socks hides under the causeway stairs.
- **The Line:** Clem holds the narrow causeway while Earl Grey and Pip repair the winch. Repair pauses whenever an enemy gets within 4 m of the winch.
  - Pilfer steals the new pin; Pip steals it back. "Stole it back. You're welcome."
- **"Nobody's coming."** The camera pulls back: every kitten she rescued stands behind her in pot helmets, holding spoons.
- During the last wave, **Marmalade throws himself in front of a ballista bolt** meant for the kittens.
- The gate is fixed. "Come inside, Clem!" "Not yet." **Warchief Cacklejaw** steps out of the fog.
- She beats him. In spite, he orders the full horde to charge. **Shard 2** sinks into her blade and she lights gold (ref1). **Pudding rises behind the gatehouse** and roars, for the first time not out of fear. The horde flees.
- Cacklejaw, alone, admits he was the runt who laughed first. "You can stop now. I'll hold it for a bit."
- Marmalade is in bed with soup, eighth life spent. She gives him back his kitten letter. "...Yet."
- Furious, Barkus sends the Gloom: **the hub turns grey** until the ending.

**CHAPTER 5: "The Bow"** (`bog`)
- North across the Bogmire to the hound smugglers' landing, where the kittens are shipped to the keep.
- Slimes that split, spiders, sinking boardwalks, a sunken tower (Heart Bell #3).
- At the landing she finds **Pearl** in a crate. "You came!" "Of course. I'm a knight." "Since when?" "...Since now." Pearl re-ties her crooked bow.
- An elite slime wave [MVP] (or the Slime Sovereign [MVP+]) guards the pool.
- **Pudding** lands: "(Get on. Before I change my mind.)" They fly north through the night.

**CHAPTER 6: "The Last Light"** (`keep`)
- Pudding burns the keep gate, then flies back south to fetch everyone from Pawsbury: "(Everyone wanted to come. EVERYONE.)" In the Courtyard she disables the ballista crews.
- **Sir Brutus**, the Legion's champion, kneels to her level and duels her in a duel of Stands. He yields: "...You stood. Hold your gate, little knight."
- The Kennel Cellars: Boneheads that reassemble unless she scatters their bones. She finds two keys.
- The Rampart Climb leads to the Bell-Tower Roof and **Lord Barkus Grimjaw**.
  - In phase 3 he chains Shard 3 to his cleaver. Three perfect parries knock it loose.
  - "Stay down, little thing." She gets up. Pudding lands on the ramparts and her rescued kittens slide off his back and raise lanterns.
  - **HOLD THE STAND**: the cleaver stops on her blade. Golden Hour, and a final Holy Slash.

**ENDING: "Dame Swordcat of the Ninth Seat"** (CS-16)
- The clouds break. Barkus sits in the sunbeam and she gives him her last milk: "...It *is* warm."
- Pudding flies everyone home at sunrise: Clem and Pearl on his neck, the kittens in a row along his back.
- She sets the reunited Dawnstone in the Sunbell and rings it. A golden ring rolls across the island and the fog lifts.
- The old knights arrive by donkey cart: "Did we miss it?"
- The knighting: "Arise, Dame Swordcat of the Ninth Seat." Marmalade: "Keep it."
- Post-credits: Barkus asleep on the sunny steps under three kittens; Pilfer, now Royal Postmaster, stamps a letter.

### 4.4 Strings, homage lines and IP rules [MVP]
- **Every line of text** lives in `src/story/strings.js` as `{ key: { default, homage? } }`. Code never hard-codes display text.
- **`config.HOMAGE_LINES = false`** ships original lines. The `homage` variants are short quotes of community and token-site captions [TREND §4]. Turn them on only after a legal check; the check's outcome is [unverified].

  | Key | Default (original, ships) | Homage variant (off) |
  |---|---|---|
  | `ch.prologue` | One Ear-Tuft Short | Too Small for the Sword |
  | `ch.1` | Small Paws, Big Sword | Holding It Anyway |
  | `ch.4` | Where I Stand | Standing My Ground |
  | `ch.6` | The Last Light | The Hour Is Gold |
  | `ch.epilogue` | Dame Swordcat of the Ninth Seat | Protecting Meow Island |
  | `meme.cap1` | Where I stand, the gate holds. | Too small for the sword. Holding it anyway. |
  | `meme.cap2` | Small paws. Big sword. Still standing. | The armor is borrowed. The hour is gold. |
  | `meme.cap3` | Not strong yet. Still here. | born to :3, forced to ⚔ |
  | `letter.marmalade` | Dear Knights. They say I'm too little to be a squire. I've decided to be one anyway. I will practise every night. — Marmalade, age 7 months. | Dear Knights. They say I am too small for the sword. I am going to hold it anyway. — Marmalade, age 7 months. |
  | `ending.caption` | And the sun came home. | The hour is gold. |
  | `postcredits.pilfer2` | ...And this time, it's yours. | ...do not stop. *(preceded by "The posts...")* |
  | `ach.memecam` | A Legendary Pose | me trying to handle things maturely |

- **No** creator names, token names, tickers, coin art, wallet features or crypto references anywhere in the game or its credits.
- The reference images and downloaded videos are research only and are **never shipped** (they are outside `public/`).
- **The Last Vigil** (V6) is a fan series. Only its generic beats are used: a lantern by a sleeping dragon, a champion kneeling, holding a gate, a sunrise flight. No names, characters or plot are taken from it.

---

## 5. Cutscenes

### 5.1 System [MVP]
- Every cutscene is a data file `src/story/cutscenes/<id>.js` run by `story/Cutscene.js`. Format: Appendix B.
- **Actors are the real in-game actors** switched to `scripted` mode. No pre-rendered video.
- All dialogue keys resolve through `strings.js`.
- **Skip:** after the first viewing, hold Pause (Esc, Start, or the touch ❚❚) for **1.0 s**. A ring fills in the corner. The Prologue can be skipped on the first viewing too.
  - Skipping runs the cutscene's `end` block: flags, spawns and despawns, env end state, actor final positions, camera handback.
  - Interactive prompts (`prompt` steps) can't be skipped, but they can't be failed either.
- Every cutscene must end with: the letterbox off, the HUD restored, the camera handed back to follow mode with a 0.6 s blend, and the actors' `scripted` mode off.
- The game is paused for enemies during cutscenes: `ctx.game.setMode('cutscene')`. Only story-driven actors update.

**Step types** (one object per step; steps run in order; `par: [...]` runs a group together; `dur` is the step's length in seconds, default 0):

| Step | Fields | Implemented by |
|---|---|---|
| `cam` | `preset` (§5.2) or `pos` + `look` (anchor-local), `anchor` (actor id or level anchor name), `fov` (number or `[from, to]`), `mode`: `cut`, `blend`, `rail`, `orbit`, `handheld`, `whip` or `fall`; `path` (level anchor list → CatmullRom), `dur`, `ease`, `noise` (m), `roll` (rad), `dof` [MVP+] | camera: `CutsceneCamera` |
| `actor` | `id`, `pose` (`vigil`, `oath`, `idle`, `sit`, `sip`, `kneel`, `faint`, `selfie`, `sleep`), `moveTo` (anchor or `[x, z]`), `speed`, `face` (actor id, anchor or yaw), `clip` (GLB clip) + `once`, `emote` (`earsFlat`, `tailPuff`, `blink`, `nod`, `shake`), `visible`, `prop` (`milk_cup`, `lantern`, `spoon`, `letter`, `pot_helm`; procedural, built by characters), `attach` (`{to: actorId, bone}`: ride on another actor, e.g. Pudding's `Neck`) | the owning agent's actor via the ScriptedActor API (§19.4) |
| `say` | `who`, `key` (strings key), `auto` (seconds; 0 = wait for input), `portrait` | ui dialogue box + audio babble |
| `sfx` / `music` | `id`, `at` (actor or anchor for 3D), `vol`, `rate` / `track` (or `null`), `fade` | audio |
| `env` | `fogDensity`, `fogColor`, `wind`, `sun {color, intensity}`, `grade` (`none`, `grey`, `gold`, `night`), `dur` | world: `Env` |
| `fx` | `burst` kind, `at`, `count`; `holy` 0–1 on an actor; `shake` trauma; `bloomSpike` | fx |
| `ui` | `letterbox`, `hud`, `title {text, sub}`, `caption`, `chapter`, `fade` (`to` colour, `dur`), `toast` | ui |
| `time` | `scale`, `dur` (real seconds) | core `Loop.timeScale` |
| `spawn` / `despawn` | `id`, `type` (enemy or npc type) or `asset`, `at`, `facing`, `tint`, `clip`, `count`, `layout` | story → enemies, companions or world factories |
| `flag` | `key`, `value` | story |
| `wait` | `dur`, `'input'` or `'dialog'` | story |
| `prompt` | `action` (`guard`, `attack`, `chargeRelease`, `interact`), `hold` (s), `textKey`; resets with no penalty if released early | story + ui + player |
| `objective` / `arena` | `id`, `textKey`, `max` / `id`, `lock` | story → world |
| `load` | `level`, `spawn` | world `LevelManager` |
| `end` | the skip end-state block: `flags`, `env`, `actors {id: {pos, facing, visible}}`, `spawns`, `despawns`, `load` | story |

### 5.2 Camera presets (camera agent; `src/camera/presets.js`)
Positions are in the **anchor's local frame**: the anchor faces +Z, feet at the origin, +X is the anchor's left. Tune `MEME_LOOP` against `research/videos/frames/x_GeckoTerminal_2104763257340964864_f1–f3.png` side by side.

| Preset | Placement | FOV | Notes |
|---|---|---|---|
| `MEME_LOOP` [TREND V1] | camera (0.06, 0.70, 1.15) → look (0.03, 0.82, 0) | 32 | Chest-up medium close-up, slightly low, static. Handheld sway 0.005 m. Cape wind ×1.6, mist cards ×2 speed. **Loop period 3.8 s**, the viral clip's length. DOF focus on the eyes [MVP+]. |
| `REVERSE_HORDE` [V2] | (0.35, 0.55, −1.4) → look along her facing at 25 m | 38 | Low over-the-shoulder, cape in the foreground |
| `PULLBACK` [V5] | from `MEME_LOOP`, dolly to (0, 4.0, 14) over 6.0 s | 32 → 50 | Ease in-out sine |
| `SELFIE` [V3] | (0.25, 0.92, 0.45) facing her, roll 6° | 50 | Handheld noise 0.015 m; her gauntlet edge in frame |
| `WHIP_FALL` [V3] | yaw +120° in 0.18 s with FOV +15, then roll 90° and drop to y 0.12 over 0.35 s | 50 → 65 | Lands sideways in the grass |
| `CRANE_DOWN` | `path` (level anchors) | 40 | Establishing shots |
| `ECU_EYES` | (0, 0.79, 0.35) → (0, 0.79, 0) | 25 | Extreme close-up: trembling eyes, glisten |
| `TWO_SHOT_LOW` | (1.6, 0.75, 1.6) → look at the midpoint of the two actors at y 0.75 | 35 | For kneels and talks at her eye height |
| `HERO_LOW` | (0.8, 0.35, 2.2) → (0, 0.9, 0) | 40 | Looks up at her: the scale contrast |
| `FLIGHT_ORBIT` | orbits Pudding at r 9, h 2, 8°/s | 45 | Flights and the ending |

### 5.3 Mood per scene (env presets the `Env` controller provides)

| Preset | Fog colour / density | Sun colour × intensity | Grade |
|---|---|---|---|
| `meadow_evening` | `#D8CDB8` / 0.020 | `#FFD9A8` × 2.0, low angle | none |
| `meadow_night` | `#8C97A6` / 0.050 | moon `#BFD3FF` × 0.6 | night |
| `meadow_day` | `#B7C0C3` / 0.045 | `#FFF2E0` × 1.4 | none |
| `hub_gold` | `#D8CDB8` / 0.025 | `#FFD9A8` × 2.0 | none |
| `hub_grey` | `#9AA196` / 0.050 | `#E8E6C8` × 1.0 | grey |
| `ending_gold` | `#E9D9C0` / 0.008–0.012 | `#FFD9A8` × 2.2 | gold |
| `sky_night` (CS-12 flight) | `#3E4A63` / 0.020 | moon `#BFD3FF` × 0.7; a dawn rim `#FFB070` on the horizon in the last 3 s | night |
| `sky_sunrise` (CS-16 shot 4) | `#E9D9C0` / 0.006 | `#FFD9A8` × 2.2, low angle; HDRI `kloofendal_48d_partly_cloudy_puresky_1k.hdr` | gold |

The other biome presets are in §12. Both `sky_*` presets are used only with the **CloudSea** set (§18.3): the cutscene hides the current level's terrain, props and grass groups and shows CloudSea for the flight shots, then restores them.

### 5.4 Cutscene list

| Id | Name | Kind | Length | Level / trigger | Tier |
|---|---|---|---|---|---|
| CS-00 | Title Loop | full (loop) | 3.8 s loop | title screen (`meadow` spawn `title`) | MVP |
| CS-01 | Knighting Eve | full | ~65 s | `meadow` new game | MVP |
| G-01 | Sir Tallbert | gameplay gag | ~8 s | `meadow` trigger `tallbert` | MVP |
| CS-02 | The Laughing Fog | full | ~85 s | `meadow` trigger `lane` after the tutorial | MVP (never cut) |
| CS-03 | Milk Break | full | ~30 s | `meadow` interact `picnic` | MVP (never cut) |
| D-01 | Mochi Joins | dialogue | ~10 s | `meadow` cage broken | MVP |
| D-02 | Sage Joins | dialogue | ~10 s | `forest` cage lowered | MVP |
| CS-04 | Lantern Night | full | ~40 s | `forest` trigger `camp` | MVP |
| CS-05 | First Light | full | ~15 s | `forest` B1 defeated | MVP |
| D-03 | On Loan | dialogue | ~15 s | `town` Bakery Street cleared | MVP |
| CS-06 | The Letters | full | ~35 s | `town` mailbag recovered | MVP |
| D-04 | Tofu, Earl Grey, Clover | dialogue ×3 | ~8 s each | `town` rescues | MVP |
| CS-07 | The Red Cape | full | ~35 s | `town` trigger `steps` | MVP |
| CS-08 | Nobody's Coming | full | ~30 s | `gate` repair reaches 70% | MVP (never cut) |
| G-02 | Marmalade's Leap | gameplay cutaway | 3 s | `gate` repair reaches 85% | MVP |
| CS-09 | Last Laugh | full | ~50 s | `gate` B2 defeated | MVP |
| CS-10 | Eighth Life | full | ~30 s | after CS-09 | MVP |
| CS-11 | The Bow | full | ~25 s | `bog` crate opened | MVP |
| CS-12 | Get On | full | ~25 s | `bog` exit | MVP |
| CS-13 | Dragonfire Gate | full | ~22 s | `keep` start | MVP |
| CS-14 | The Champion Kneels | full | ~25 s | `keep` courtyard cleared | MVP |
| D-05 | Brutus Yields | dialogue | ~8 s | Brutus defeated | MVP |
| D-06 | Pip Joins | dialogue | ~8 s | `gate` war-wagon opened | MVP |
| CS-15 | Nine Lives | full, interactive | ~45 s | B3 reaches 10% HP with the shard freed | MVP (never cut) |
| CS-16 | The Golden Hour | full, interactive | ~150 s, then credits and post-credits | after CS-15 | MVP (never cut) |

That is 17 full scenes, 6 dialogue-only scenes and 2 gameplay gags, about 13 minutes in total.

Each scene below is a table with columns # (shot), time, camera, action, audio, and text. In the tables:
- Speaker names are bold.
- Stage directions are in *(italics)*.
- Every quoted line is a strings key; the key is the scene id plus an index, for example `cs01.4a`.

#### CS-00 Title Loop [MVP]
- **Setup:** load `meadow` spawn `title`: the practice-field north gate at dawn, `meadow_day` env with fog 0.05.
- **Pose and cape:** Swordcat in the **Oath** pose, bow on, with the **red cape** (the ref2 poster look) on a new save; afterwards her equipped cape. Wind 1.6.
- **Camera:** `MEME_LOOP`, looping every 3.8 s.
- **Holy pulse:** every second loop, `holy` 0 → 0.35 → 0 over 1.2 s, with 40 sparkles.
- **Logo:** fades in at 1.5 s: SWORDCAT in Cinzel Decorative gold with a pink bow tied on the "O" [ART §13]. The subtitle sits under it in Cinzel.
- **Prompt:** "Press any key / Tap to start". That input also unlocks audio (tech.md §14).
- **Audio:** silent before the unlock, like the silent viral X loops [TREND §5]. After the unlock, `music/village_bards_tale.mp3` fades in over 2 s under the main menu.

#### CS-01 Knighting Eve [MVP] (`meadow`, practice field, env `meadow_evening`, then `meadow_night`)

| # | Time | Camera | Action | Audio | Text |
|---|---|---|---|---|---|
| 1 | 0:00–0:04 | black | — | procedural wind | Caption: *"Meow Island. The eve of Knighting Day."* |
| 2 | 0:04–0:12 | `CRANE_DOWN` along anchors `crane_bell → crane_field` | The Bell Tower is a far silhouette with a warm glow (the Dawnstone). The camera comes down to the practice field: 6 squire kittens queue at the height-chart board. Long golden shadows. | `village_bards_tale` fades in over 2 s | — |
| 3 | 0:12–0:20 | medium | Sergeant Whiskerbottom measures two kittens. Stamp, stamp. | `ui/drop_001`, `drop_002` | **Whiskerbottom:** "Tall enough! Next!" · "Tall enough! Next!" |
| 4 | 0:20–0:30 | low close on the chart | Clementine, in a plain tunic with no bow, steps up. Her ears are below the line. Tiptoes. Ears straight up. Still one ear-tuft short. | babble | **Whiskerbottom:** "Too small for the sword, Clementine." **Clem:** "I was too small last year." **Whiskerbottom:** "And you've been very consistent about it. Next!" |
| 5 | 0:30–0:44 | wide, then `TWO_SHOT_LOW` on the fence steps | The last sunbeam crosses the yard. **Every kitten flops into it at once** (sight gag). Clem sits alone. Pearl pads over and ties a pink bow on Clem's left ear; the bow mesh becomes visible. | `cat/cat_purrsleepy_loop` | **Pearl:** "There. Now you look less scary." **Clem:** "I wasn't scary." **Pearl:** "I know. I'm being nice." **Pearl:** "Tomorrow the Sunbell rings at dawn, and I'm sleeping over with the squires. Front row!" |
| 6 | 0:44–0:54 | env lerps to `meadow_night` over 2 s; interior of the armoury barn | Clem creeps in. A chest painted "M. — my first". Tiny dusty armour; a sword taller than her. She lifts it and the tip drags. | `world/creak1`, `sword/sword_unsheathe` | — |
| 7 | 0:54–1:05 | three quick cuts, then a mirror two-shot | Pauldrons clank. The helmet falls over her eyes; she takes it off, looks at it, and sets it aside. The faded cream cape is tied on. She faces a dusty mirror: a tiny knight. | `impact/armor_light`, `impact/cloth` | **Clem:** "...Practice." |

`end`: flag `prologue.armour = true`; player at spawn `practice`, cream cape, bow on; env `meadow_night`; tutorial step 1.

#### Midnight Practice (gameplay tutorial, ~3 min) [MVP]
Prompts are parchment tags with wax-seal key glyphs. Each advances when its condition is met. The strings are in §6.6.
1. Move and look.
2. Jump the 1.0 m fence.
3. Snip–Snap–Swoosh on 3 straw dummies.
4. Roll past the swinging sack: a 0.6 m sack on a rope, 2.0 s period.
5. **The Stand:** block the Wobble Knight dummy 2 times.
6. **Parry** it once: a slow-motion hint fires once at 0.25× on its first white glint. A parried dummy spins comically.
7. Hold attack 0.6 s to release a **Bright Slash** on the cracked practice boulder.
8. **Meow** at the sleeping cow. It moos (`creature/animal_moo`, clip `Idle_HitReact1`, then `Walk` 6 m east) and reveals **Pearl**, who sneaked out of the squires' barn to watch. **Pearl** (`tut.pearl1`): "Shh! I'm not here." (`tut.pearl2`): "...You're getting good, Clem." She scampers back to the barn (moveTo (−14,−92), despawn). This teaches "Meow finds hidden friends" before any kitten is lost.

The tutorial is complete when all 8 are done or skipped; completing or skipping it sets flag **`prologue.tutorial`**, which opens the wooden gate in the field's north gap. Hold Pause for 1 s to skip the tutorial.

#### G-01 Sir Tallbert [MVP] (trigger `tallbert`, the field's north gate; armed only when `prologue.tutorial` is set)
1. Her input is ignored for 1.0 s. She is moved to (4,−59.5) facing −Z, 2.5 m in front of the statue. `MEME_LOOP` holds 2.0 s while she stands in Vigil.
2. `PULLBACK` over 6.0 s reveals the 6 m stone statue right behind her, in the same pose.
3. **Clem:** "...Hello." *(The statue does not answer.)*
4. Any input after 1.0 s skips to the end. Control returns.

#### CS-02 The Laughing Fog [MVP, never cut] (trigger `lane`, the north lane after the tutorial)

**Cast and props** (spawned by the scene's first step, despawned in `end`):
- **Real actors** (beast heads and readable plates; scripted, no AI): Cacklejaw, Pilfer, and **8 `hyena`** walking the lane at 1.6 m/s in two files that split to ±2.5 m around her. Four of them carry procedural cages (Pearl's cage has a pink-ribbon highlight).
- **Silhouettes:** the 40-instance `fx/Horde` fills the fog beyond 18 m (24 visible in shot 4).
- **Far dressing:** the Bell Tower skyline at `bell_far` (§12.3) and an unlit Barkus silhouette on its top (`Knight.glb` + bulldog head fitted to 3 m, scaled ×2 for forced perspective, black `MeshBasicMaterial`).
- **Lane props:** a signpost (procedural post + 2 arrow boards) at (−4,−52) with the Royal Post bag (procedural satchel) on its hook.

| # | Time | Camera | Action | Audio / env | Text |
|---|---|---|---|---|---|
| 1 | 0:00–0:06 | slow orbit r 3 | The last dummy falls over by itself. | wind 0.6 → 0.05 over 3 s; fog 0.05 → 0.075 over 6 s; far drums: `creature/c80_monster_0x` at rate 0.6 [audition] | — |
| 2 | 0:06–0:12 | long lens on anchor `bell_far` | The Bell Tower's warm glow goes out. A giant dog silhouette (Barkus, unlit) stands on the tower. | Procedural Sunbell struck once and damped: a dull *clunk* | — |
| 3 | 0:12–0:20 | handheld near her | Cackling from every direction: 6 positional laugh emitters at r 18 in the fog. Her ears flatten; her tail puffs ×1.4. | laugh build (§16.3) | — |
| 4 | 0:20–0:28 | wide | 24 hyena silhouettes (`fx/Horde`) march along the lane carrying cages; Pearl's cage passes. | footsteps, chains `impact/chain_0x` | **Pearl:** "CLEM!" |
| 5 | 0:28–0:32 | tracking | Clem runs, trips on her cape (squash), and gets up. | `impact/cloth_heavy` | — |
| 6 | 0:32–0:36 | medium | She plants herself in the middle of the lane. | `sword/sword_unsheathe2` | — |
| 7 | 0:36–0:40 | **`MEME_LOOP`** (3.8 s) | **The meme shot.** Sword vertical before her face, cape billowing, fog drifting. Total stillness except wind and fur. | music none; wind only | — |
| 8 | 0:40–0:46 | **`REVERSE_HORDE`** | The horde emerges toward camera from behind her: HATER, GRUMBLER, POST STEALER plates. | marching | — |
| 9 | 0:46–0:56 | `TWO_SHOT_LOW`, then his face fills the frame | **Cacklejaw** leans down, snout to her nose. She doesn't move. He squints, then explodes laughing. | laugh build at rate 0.85 | **Cacklejaw:** "A kitten! With a SWORD! And a little BOW! HAHAHA— no, stop, I can't— leave it. LEAVE it! It isn't even a threat!" |
| 10 | 0:56–1:06 | top-down crane (y 18) | The horde parts around her like a river around a stone: dozens of laughing hyenas and one tiny unmoving dot. Pilfer plucks the signpost beside her, then lifts the Royal Post bag off its hook. | laughter | **Pilfer:** "Mine." *(the bag)* "Also mine." |
| 11 | 1:06–1:14 | `ECU_EYES`, then her paws | The fog closes. Silence. Her paws tremble on the grip; her eyes glisten. | wind | — |
| 12 | 1:14–1:20 | medium | She lowers the sword. Breathes. Lifts it again, higher. **One gold sparkle runs up the blade** (`holy` 0.15 for 0.6 s). | — | **Clem:** "...Okay." |
| 13 | 1:20–1:25 | wide, behind her | She walks into the fog. **Title card** SWORDCAT, then the chapter card "Chapter 1 — Small Paws, Big Sword". | `music/battle_theme_a.mp3` sting [audition: start offset], then fade | — |

`end`: flag `prologue.done = true`; env `meadow_day`; load `meadow` spawn `start`; save.

#### CS-03 Milk Break [MVP, never cut] (interact with the picnic hay bale, `meadow` Picnic Glade) [TREND V3]

| # | Time | Camera | Action | Audio | Text |
|---|---|---|---|---|---|
| 1 | 0:00–0:06 | `SELFIE` | She sits on the hay bale with a milk cup and straw, sips, and talks to her gauntlet as if it were a camera. | `pickup/bubble2` | **Clem:** "Day one of rescuing everyone. Morale: high." *(sip)* "Milk: also high." |
| 2 | 0:06–0:08 | same | Tremor (shake 0.2). She freezes mid-sip. | low rumble `impact/impactSoft_heavy_00x` | — |
| 3 | 0:08–0:09 | `WHIP_FALL` | The camera falls and lands sideways in the grass. The dropped cup rolls into the foreground. | `impact/cloth_heavy` | — |
| 4 | 0:09–0:11 | sideways, static | **Pudding** rises from the fog and ROARS into the lens: jaws fill the frame, shake 0.8, grass wind spike 3.0 for 0.5 s. Hold 1.2 s. | `creature/creature_roar_02` + `c80_roar_01` at rate 0.8 | — |
| 5 | 0:11–0:14 | `HERO_LOW` | Cut, upright: Swordcat stands over her cup in the meme pose (Vigil → Oath). Pudding is tangled in a hound net pegged to 3 posts. | wind | — |
| 6 | 0:14–0:30 | `TWO_SHOT_LOW` (her and Pudding's nose) | Dialogue. She holds up the cup, thimble-sized next to his nose. He sips through the tiny straw with enormous care. Rats squeak off-screen; he flinches. | `creature/creature_roar_01` per Pudding line at rate 0.8 | **Pudding:** "ROOOAAR. (Is that... milk?)" **Clem:** "...It is." **Pudding:** "RRrrr. (I haven't eaten in three days. The laughing dogs chased me out of my cave.)" **Clem:** "Why are you tied up?" **Pudding:** "(...They also had a net.)" **Clem:** "Here." **Pudding:** "(...It's very good.)" **Clem:** "What's your name?" **Pudding:** "(Pudding.)" **Pudding:** "ROAR! (Sorry! Sorry. I roar when I'm nervous.)" **Clem:** "Hold still. I'll cut you loose." |

`end`: objective `net_ropes` "Cut the net ropes" 0/3; arena `glade` locks; music `battle_fast_fight_loop`.

When all 3 ropes are cut and the arena is clear (dialogue-only, 8 s):
- Pudding sniffs her and purrs (`cat/cat_purractive_loop` at rate 0.6), then nods (`Yes` clip).
- **Pudding:** "(I'll... follow. From a distance. A safe distance.)"
- He lifts off (`Fast_Flying`). For the rest of `meadow` he perches at the scripted anchors `pud_1..4`, "hiding" behind trees much smaller than he is.

#### D-01 Mochi Joins [MVP] (`meadow`, after the Old Bridge cage is broken)
- **Mochi:** "Squire Mochi reporting! Well. Reject Mochi. Too clumsy, they said."
- **Clem:** "Too small, they said."
- **Mochi:** "Then we're a team!"
- **Mochi:** "I'll do the shield. You do the... pointy part."
- Toast: "Mochi joined! [Q] Shield Wall"

#### D-02 Sage Joins [MVP] (`forest`, cage lowered)
- The cage door pops. Sage tumbles out onto Mochi (or onto a hay bale if Mochi isn't active).
- **Sage:** "Thanks for the landing." **Mochi:** "Mrrf."
- **Sage:** "You're the one with the sword bigger than you." **Clem:** "Yes." **Sage:** "...Fair."
- Toast: "Sage joined! Swap kittens at any Vigil Stone."

#### CS-04 Lantern Night [MVP] (`forest` trigger `camp`; env lerps to night over 4 s) [TREND V6]

| # | Camera | Action | Audio | Text |
|---|---|---|---|---|
| 1 | `CRANE_DOWN` into the clearing | Pudding sleeps curled around the clearing, snoring smoke rings. Clem sits by his nose holding a lantern (`PointLight #FFC46B`, intensity 1.5, distance 6). Fireflies. Mochi and Sage lie by the fire. | `cat/cat_purrsleepy_loop`, crackle `world/wood_hit_01` at low volume | — |
| 2 | `TWO_SHOT_LOW` (Sage and Clem) | — | — | **Sage:** "Can I ask something? Why you? You're the smallest of us." **Clem:** "Because I was there." |
| 3 | `ECU_EYES` (hold 2 s, silence) | — | — | **Clem:** "I'm not brave. I'm just... here." |
| 4 | wide | Mochi, half asleep, rolls over. | — | **Mochi:** "That's what brave is, I think. Being scared and being here." **Sage:** "...Don't tell anyone I cried." |
| 5 | slow push-out | Pudding's tail curls around all of them: a 1.5 s rotation tween on the `Body1`–`Body2` bones, assuming that end of the `Body1–4` chain is the tail [unverified; if it isn't, skip the curl and keep only the push-out]. Fade to black. | purr loop | — |

**Pudding's sleeping pose [unverified]:**
- Try the last frame of the `Death` clip, clamped, as "lying curled".
- Fallback: `Flying_Idle` at time scale 0.2, lowered to y 0.4, framed so his head is down behind the lantern.

`end`: Vigil Stone 2 activated; env `forest_night`; music `dark_forest_creepy` at volume 0.6.

#### CS-05 First Light [MVP] (`forest`, B1 defeated)
1. `TWO_SHOT_LOW`. Grizzlechop's hat flies off. **Grizzlechop:** "I yield! I YIELD! Mind the cheese!"
2. A glowing shard rises from his cheese shield. **Grizzlechop:** "Take the shiny rock! The Warlord paid us in cheese to slow down anyone who followed. Which, to be fair, we expected to be... bigger."
3. `HERO_LOW`. She raises the sword and the shard sinks into the blade: emissive 0 → 2 over 1.5 s, 80 sparkles, env fog −0.01 for 3 s. `pickup/powerup_rise05`, then `magic/magic1`. Toast: "Holy Slash learned! Hold ⚔, release with 50 Valor."
4. **Grizzlechop:** "The cages went to Pawsbury. The Legion holds the whole town!" **Clem:** "Then I'm going home."

`end`: `state.shards = 1`; flag `forest.boss`; exit trigger opens.

#### D-03 On Loan [MVP] (`town`, Bakery Street cleared)
1. Marmalade pokes his head out of the bakery door, flour on his nose.
   - **Marmalade:** "Clem? Is that... my armour?" **Clem:** "...It's borrowed."
   - *(Long pause. He looks her up and down.)* **Marmalade:** "Is it now."
   - **Marmalade:** "That armour's on loan, then. Bring it back with a story in it."
2. **Marmalade:** "That hooded thief took the Royal Post. Get it back, would you? My knees don't run anymore."
3. Objective: "Catch the Post Stealer."

#### CS-06 The Letters [MVP] (`town`, Post Office steps, after the chase)

| # | Camera | Action | Text |
|---|---|---|---|
| 1 | medium | The mailbag spills open. Sage picks up a letter sealed with the royal paw. | **Sage:** "'To the Knights of the Order of Nine Lives. Please come home. The gate needs holding. — Snowpaw.'" |
| 2 | two-shot | Sage fans out eight identical letters. | **Sage:** "Eight of these. None delivered." **Sage:** "They never got them. Nobody came because nobody knew." **Clem:** "Then we tell them." |
| 3 | low | Coo hops onto the bag (blob `Pigeon.glb`, `Jump` clip). | **Coo:** "Coo." **Clem:** "Every knight. Fast as you can." **Coo:** "Coo." *(Coo flutters off: `Jump` plus an upward tween over 2 s.)* |
| 4 | `ECU_EYES` | A yellowed envelope. Full-screen parchment overlay (Uncial Antiqua) shows `letter.marmalade`. 4 s of silence, then `story_lament_warriors_soul` fades in softly. | (overlay text) |
| 5 | medium | She folds it and tucks it into her belt. | — |

`end`: flag `town.letters`; the `letter` prop is attached to her belt bone; music back to explore.

#### D-04 Rescues in town [MVP]
- **Tofu** (Forge Yard, third barrel):
  - **Tofu:** "Is it over? ...Is that a sword or a door?"
  - **Clem:** "A sword." **Tofu:** "Huh. Want it sharper? I can barely lift it, but I can sharpen it."
- **Earl Grey** (inside the fountain Gloomjelly, popped):
  - **Earl Grey:** "Do you MIND? I was nearly at the good chapter."
  - *(He looks around.)* **Earl Grey:** "...Oh. You're rescuing me. How embarrassing. Carry on."
- **Clover** (stocks, interact):
  - **Clover:** "Well, aren't you a tiny thing in a big tin."
  - **Clover:** "Somebody has to keep you lot alive. Hold still, sweetpea."
  - Toast: "Clover joined!"

#### CS-07 The Red Cape [MVP] (`town` trigger `steps`, env `hub_gold`)

| # | Camera | Action | Text |
|---|---|---|---|
| 1 | `CRANE_DOWN` from the dark Sunbell to the Castle Steps | The cellar door opens: Princess Snowpaw, with Marmalade behind her. | **Snowpaw:** "You chased off the Legion. All of them. By yourself?" **Clem:** "With friends." **Mochi:** "Mostly her." |
| 2 | `TWO_SHOT_LOW` | Snowpaw unfolds a red cloth. The cape swaps from cream to red (ref2). | **Snowpaw:** "The Royal Wardrobe has nothing your size. Except this." **Snowpaw:** "It was a tablecloth. Velvet, mostly." **Clem:** "...Thank you, Your Highness." |
| 3 | low, looking up at the dark bell | Marmalade points with his walking-stick sword. | **Marmalade:** "The Dawnstone's in three pieces now. You've got one in that sword." **Marmalade:** "The rats say the hyenas have the second. They'll come for the town, through the Low Gate." **Clem:** "Then I'll be at the gate." |
| 4 | wide | Villagers peek out; kittens run to the fountain. | Toasts: "Pawsbury is free!" · "Shops are open." · "Kittens you rescue will live here." |

`end`: flag `town.free`; the hub stations activate; cape `red` equipped and unlocked; save.

#### D-06 Pip Joins [MVP] (`gate`, Old Battlefield, war-wagon cage struck)
- The cage door was already unlocked. Pip strolls out.
- **Pip:** "Took you long enough. I was waiting for dramatic effect."
- **Pip:** "That pin they pinched? I know who's got it. Leave him to me."
- She runs off to the gatehouse.

#### CS-08 Nobody's Coming [MVP, never cut] (`gate`, repair reaches 70%) [TREND V2, V5]

| # | Time | Camera | Action | Audio | Text |
|---|---|---|---|---|---|
| 1 | 0:00–0:04 | `MEME_LOOP` | She stands at the Line marker. | music cut; wind only | — |
| 2 | 0:04–0:10 | `REVERSE_HORDE` | The fog bank 40 m ahead fills: 40 instanced silhouettes plus 6 real raiders, laughing, with purple Jeer rings. | laugh build ×6 | — |
| 3 | 0:10–0:14 | `ECU_EYES` | Her ears flatten. | — | **Clem:** *(barely audible)* "Nobody's coming." *(beat)* "So I'm staying." |
| 4 | 0:14–0:20 | **`PULLBACK`** | Behind her stand **the rescued kittens** in pot helmets and colanders, holding spoons. Count = `max(3, state.kittens.length)`, capped at 18, in rows of 6 at 1.0 m spacing, starting 2.5 m behind her. The active companion is in front. | — | — |
| 5 | 0:20–0:30 | `TWO_SHOT_LOW` (Mochi, Clem) | — | `music/battle_theme_a.mp3` hits | **Mochi:** "We're not leaving you out here by yourself." **Kitten A:** "I brought a spoon!" **Kitten B:** "I brought two!" **Clem:** *(very quietly)* "...Thank you." |

- Mochi is spawned for this scene even if another companion is active.
- **Kitten A / B** are the first two ids in `state.kittens` (their names show on the dialogue ribbon).
- If fewer than 3 kittens are rescued, the script fills the rows with **Pawsbury villager kittens** (seeded `buildKitten`), never with kittens that are still lost. A villager speaks for A or B when needed.
- `end`: wave W4 starts; Spoon Brigade active.

#### G-02 Marmalade's Leap [MVP] (`gate`, repair reaches 85%; 3 s; letterbox off)
1. Time scale 0.3. Hard cut to the west flanking tower at (−8,+8), where Marmalade has been watching.
2. A ballista bolt (from the hyena raft at anchor `ballista_raft`, §12.6) streaks toward the spoon kittens behind the Line.
3. Marmalade leaps from the tower's parapet into its path. **Marmalade:** "OOF!" A puff of flour. He lies on the causeway, then two kittens drag him off by the cape toward the gate (he is despawned at the cut back).
4. Cut back to gameplay; time scale 1.0. No damage to the player.

#### CS-09 Last Laugh [MVP] (`gate`, B2 defeated)

| # | Camera | Action | Audio | Text |
|---|---|---|---|---|
| 1 | `TWO_SHOT_LOW` | Cacklejaw on his knees, hat gone, chipped ear showing. A weak laugh, then a furious one. He points at her. | laugh | **Cacklejaw:** "Get her! ALL OF YOU! Everybody CHARGE!" |
| 2 | `REVERSE_HORDE` | 40 silhouettes charge out of the fog. | roar of the crowd | — |
| 3 | `HERO_LOW`, then an ECU of the blade | She plants the sword (Vigil → Oath). **Shard 2** tears out of Cacklejaw's belt pouch and sinks into her blade: `holy` 0 → 1 over 2 s, 160 sparkles, bloom 0.55 → 1.2. **This is the ref1 frame.** | `pickup/powerup_rise07` + `jingles/jingles_STEEL03` | Toast: "Golden Hour unlocked! At full Valor: Stand + ⚔" |
| 4 | low, from behind her toward the gatehouse | **Pudding rises over the gatehouse**, wings spread across the whole frame [TREND V6 f4], and ROARS. The horde skids, then scatters into the fog, laughing nervously. | `creature/creature_roar_03` + `c80_roar_02` at rate 0.7; shake 0.6 | **Pudding:** "ROOOOAR! (NOT. MY. FRIENDS.)" |
| 5 | `TWO_SHOT_LOW` on the empty causeway | Cacklejaw alone. He laughs again, and it cracks into a sob. Clem sits beside him. | silence, then `cat/cat_purrsleepy_loop` low | **Cacklejaw:** "They used to laugh at me. The runt. So I laughed first. Always first." **Clem:** "You can stop now. I'll hold it for a bit." *(A real, tiny, wheezy laugh.)* **Cacklejaw:** "...You're very strange." **Clem:** "I know." |
| 6 | wide | He walks off alone into the fog. | wind | — |

`end`: `state.shards = 2`; Golden Hour unlocked; flag `gate.boss`; the Horde despawns.

#### CS-10 Eighth Life [MVP]

| # | Camera | Action | Text |
|---|---|---|---|
| 1 | wide on the wall | Kittens cheer, then go quiet. | **Mochi:** "Where's Sir Marmalade?" |
| 2 | Bakery doorway, exterior (`load town` spawn `bakery_cot`; no interior is built) | Marmalade on a cot under the bakery awning, bandaged, with a bowl of soup. | **Marmalade:** "Eighth life. Gone. Worth it, mind." |
| 3 | `TWO_SHOT_LOW` | She takes the yellowed letter from her belt and gives it to him. He reads it. Long pause. | **Marmalade:** "...Seven months old. Look at that handwriting." **Marmalade:** "Doctor says bed and soup. You'll have to finish this one, Dame—" **Clem:** "I'm not a dame." **Marmalade:** "...Yet." |
| 4 | from the window toward the north | The sky darkens. The Gloom rolls in: env grade `grey`, fog 0.025 → 0.05 over 4 s. | — |
| 5 | medium (Earl Grey, Pip) | — | **Earl Grey:** "That's the Warlord's doing. The last shard is on him. Houndhold Keep, north across the Bogmire." **Pip:** "And the smugglers' landing in the bog is where they ship the kittens." **Clem:** "Pearl." |

`end`: flag `gate.done`; the hub env becomes `hub_grey` until flag `ending.seen`; the Lookout (Pip) station opens (Earl Grey's Library has been open since `town.free`); player at `town` spawn `hub`; save.

#### CS-11 The Bow [MVP] (`bog`, Smugglers' Landing crate opened; music `story_lament_warriors_soul`, soft)
1. Pearl tumbles out of the crate. **Pearl:** "You came!" **Clem:** "Of course. I'm a knight." **Pearl:** "Since when?" **Clem:** "...Since now."
2. `TWO_SHOT_LOW`. Pearl reaches up and re-ties Clem's bow (bow mesh tween).
   - **Pearl:** "Hold still. Your bow's crooked. You can't save an island with a crooked bow."
   - **Clem:** "It's been a long week." **Pearl:** "I know. You're doing good."
3. They hug and both bows bounce. Pearl: "I'll go home and tell everyone. Go get them, Clem."

`end`: flag `bog.pearl`; Pearl walks off toward the entry and despawns; she appears at the hub Wardrobe after the level.

#### CS-12 Get On [MVP] (`bog` exit)
1. Pudding lands at the far side of the Sovereign Pool and lowers his head. **Pudding:** "(Get on. Before I change my mind.)"
2. She climbs his neck (`attach` to bone `Neck`); the active companion climbs on behind (`attach` to `Torso`).
3. `FLIGHT_ORBIT` over the CloudSea set (§18.3) at night (env `sky_night`, §5.3) for 8 s.
   - **Pudding:** "(I'm not scared. I'm not scared. I'm a little scared.)"
   - **Clem:** "Me too."
4. A dawn edge on the horizon; the keep crag ahead. Fade.

`end`: flag `bog.done`; load `keep` spawn `gate`.

#### CS-13 Dragonfire Gate [MVP] (`keep` start)
1. Pudding sweeps over the keep gate and breathes fire: flame particles, an orange `PointLight` 3.0 for 1.5 s, bloom spike.
2. The `gate` model is hidden and debris is shown (`env/graveyard/debris`, `debris-wood`).
3. He lands on a tower and growls; the hound guards scatter.
   - **Pudding:** "ROAR! (Sorry!)" *(beat)* "(...No. Not sorry.)"
4. He lowers his head to her. **Pudding:** "(I'm going back for the others. Everyone wanted to come. EVERYONE.)" **Clem:** "Be careful." **Pudding:** "(I'm a DRAGON.)" *(beat)* "(...I'll be careful.)" He flies south (`Fast_Flying`) and is off-level until CS-15.

`end`: flag `keep.gate`; the companion detaches at spawn `gate`.

#### CS-14 The Champion Kneels [MVP] (`keep` Courtyard, after the ballista waves) [TREND V6]
1. Sir Brutus walks out of the Great Hall, plants his greatsword, and **kneels so his eyes are level with hers** (`TWO_SHOT_LOW` at eye height 0.75).
   - **Brutus:** "I don't fight from up there. Down here, we're equals."
   - **Brutus:** "I watched you at the gate. You never stepped back once."
   - **Clem:** "I couldn't. The gate was behind me."
   - **Brutus:** "And now?" **Clem:** "Now the kittens are."
   - **Brutus:** "Then we understand each other."
2. He stands and raises the sword. Arena locks; boss music; boss bar "SIR BRUTUS, CHAMPION OF THE LEGION".

#### D-05 Brutus Yields [MVP]
1. Brutus kneels again and lays his sword down. **Brutus:** "...You stood."
2. **Brutus:** "Hold your gate, little knight."
3. He unlocks the cellar gate and walks off toward the sea.

`end`: flag `keep.brutus` (unlocks the Even More Too Big skin); `vigil_2` activates.

#### CS-15 Nine Lives [MVP, never cut] (B3 at 10% HP with the shard freed)

| # | Time | Camera | Action | Audio | Text |
|---|---|---|---|---|---|
| 1 | 0:00–0:05 | medium | Barkus backhands her: no damage. She skids 3 m; her sword lands upright in the stone. | `impact/impactPlate_heavy_002`; shake 0.5 | **Barkus:** "Stay down, little thing." |
| 2 | 0:05–0:12 | `ECU_EYES`, then `HERO_LOW` | She gets up (the Still Standing rise animation) and pulls the sword free. | heartbeat ×2 | **Barkus:** "Why won't you STAY DOWN?" **Clem:** "Not strong yet. Still here." |
| 3 | 0:12–0:22 | wide on the ramparts | **Pudding lands on the rampart ring** (back from Pawsbury, CS-13) and **the rescued kittens** slide off his back holding lanterns: count `max(3, state.kittens.length)` (villager kittens fill a shortfall), plus the 3 companions, Pearl, Pip, Earl Grey and Tofu (at most 25), on anchors `rampart_0..27`. Each lantern streams a light ribbon into her sword (additive tube, 1.0 s each, staggered 0.1 s). | `story_lament_warriors_soul` swells [audition] | **Pearl:** "GO, CLEM!" **Mochi:** "SWORDCAT! SWORDCAT!" *(the kittens chant)* |
| 4 | 0:22–… | low behind her | Barkus raises the cleaver for one last blow. Prompt **"HOLD THE STAND"** (`guard`, hold 2.0 s). The cleaver presses down on her raised blade; screen rumble; visual time scale 0.25. Releasing early restarts the 2.0 s fill. No damage, no failure. | silence plus a heartbeat (`impact/impactSoft_heavy_000` ×2 per second) | prompt text |
| 5 | +0–3 s | `HERO_LOW` | The cleaver cracks on her blade. **Golden Hour** activates (full ref1 look). | `jingles/jingles_STEEL06` | — |
| 6 | +3–… | `MEME_LOOP` | Prompt **"Hold ⚔, then release"** (`chargeRelease`, tier 2). On release: a cinematic Holy Slash. | `magic/spell_fire_03` + `impact/impactMetal_heavy_003` | — |

`end`: flag `keep.boss`; emit `boss:defeated {id: 'barkus'}`; Pudding and the rampart kittens stay spawned for CS-16; go to CS-16.

#### CS-16 The Golden Hour (ending) [MVP, never cut] (~150 s)

| # | Camera | Action | Audio / env | Text |
|---|---|---|---|---|
| 1 | crane up from the roof | White-gold flash at time scale 0.2. **The storm clouds part**; a god-ray shaft `#FFE3A3` falls on her. | fog 0.05 → 0.008 over 6 s; sun → `#FFD9A8` × 2.2; PMREM regenerated once; grade `gold` | — |
| 2 | `TWO_SHOT_LOW` | Barkus sits down in the sunbeam (`Sit_Floor_Down`, then `Sit_Floor_Idle`). | `cat/cat_purrsleepy_loop` | **Barkus:** "Every morning the bell rang. And every morning, the cats got the sunny steps." |
| 3 | same | She sits beside him. 2 s of silence. She holds out her last bottle of milk with a straw. He sips through the tiny straw. | `pickup/bubble` | **Clem:** "Here. It helps." **Barkus:** "...It *is* warm." |
| 4 | `FLIGHT_ORBIT` | Pudding carries everyone home over a **sea of clouds at sunrise** [TREND V6 finale]: Clem and Pearl on his neck, the other kittens in a row along his back (`attach`, sheen fur). CloudSea set (§18.3), env `sky_sunrise` (§5.3). Cape and fur in the wind; sparkles drift. | `music/field_of_dreams.mp3` [audition] | Caption: `ending.caption` |
| 5 | Pawsbury Bell Tower (`town` spawn `belltower`) | She sets the reunited Dawnstone into the Sunbell. Prompt **"Ring the Sunbell"** (`attack`). | — | prompt |
| 6 | aerial over Pawsbury | **BONG.** A golden ring (expanding torus, r 0 → 120 m over 4 s) rolls out across the island. The fog lifts. | procedural Sunbell (§16.3); env `ending_gold` | — |
| 7 | town gate | A donkey cart (Donkey `Walk`) arrives with the seven old knights in rusty armour (§3.6), Coo riding on the donkey's head. | `creature/animal_whinny` [audition] | **Sir Snoozalot:** "Did we miss it?" **Coo:** "Coo." |
| 8 | courtyard, wide | **The knighting.** Every rescued kitten, the companions, Brutus at the back, Cacklejaw juggling in a jester hat, Pudding peeking over the roofs. Snowpaw drags a sword too heavy for her too. | `music/castle_kings_feast.mp3` | **Snowpaw:** "Kneel, squire." *(She kneels; now she's even smaller.)* **Snowpaw:** "...Actually, stand. I can't see you." **Snowpaw:** "By the power vested in me by the Order of Nine Lives, and also my mum... Arise, Dame Clementine of the Pink Bow, Knight of the Ninth Seat." **Clem:** "...Your Highness? Could it be 'Swordcat'? Everyone calls me that." **Snowpaw:** "Arise, Dame Swordcat of the Ninth Seat." *(Cheering.)* |
| 9 | medium | Sergeant Whiskerbottom hangs her portrait above the height chart. | — | **Whiskerbottom:** "Still too small. Still a knight." |
| 10 | bakery two-shot | She holds out the armour's buckle. | — | **Clem:** "The armour. It's on loan." **Marmalade:** "Bring it back with a story in it, I said." **Marmalade:** "...There are a few more stories in there yet. Keep it." |
| 11 | `MEME_LOOP` in golden light | Sword lit from within, gentle breeze. The logo fades in. Credits roll over the Pawsbury festival. | `music/festival_minstrel_dance.mp3`, then `village_bards_tale.mp3` | Credits (§14.3) |
| 12 | post-credits A | Barkus asleep on the sunny castle steps, three kittens asleep on top of him. | `cat/cat_purrsleepy_loop` | — |
| 13 | post-credits B | The Post Office. Pilfer, in a postmaster's hat, stamps a letter. | `ui/drop_003` | **Pilfer:** "Special delivery." *(stamp)* **Pilfer:** `postcredits.pilfer2` |

`end`: flag `ending.seen`; hub env `ending_gold` forever; unlock the Dawnblade skin and the Gold cape (§13.5); save; return to the title.


---

## 6. Dialogue: barks, NPC lines, rescues, letters, tutorial text

All lines are strings keys. **Bark rules:**
- At most 1 bark per 6 s across the whole party, with a 25% chance per trigger unless a row says otherwise.
- No repeat of the same line within 60 s.
- Barks show as a small speech bubble over the speaker for 1.6 s, with babble audio.

### 6.1 Swordcat

| Trigger | Lines (one at random) | Rule |
|---|---|---|
| First alert of an encounter | "Halt, villain." *(beat)* "...Please." · "En garde." · "I am a knight. Mostly." | 50% |
| Starting a Stand | "Hold." | 15% |
| First Standing Ground in a level | "Not one step." | always |
| Parry | "No, thank you." · "Mrrp." · "Not today." | 30% |
| Holy Slash | "For Pearl!" · "Shine." | 40% |
| Golden Hour | "Where I stand, the gate holds." (first use) · "Now." | always |
| Still Standing | "...Still standing." | always |
| HP ≤ 2 | "I'm fine. I'm fine. I'm fine." | once per segment |
| Respawn after a lost life | "Not strong yet. Still here." · "...Ow." | always |
| Last life left | "Ninth life. Making it count." | always |
| Milk sip | "Mm." · "Milk break." | 30% |
| Lost kitten found | "You're safe now. Follow the lanterns home." | always |
| Arena cleared | "Small paws. Big sword. Still standing." · "Sorry! Sorry." *(to the poofs)* | 40% |
| Idle in thick fog (1 per 90 s) | *(sneeze)* "...chu." | — |

### 6.2 Companions

| Kitten | Ability | Combat | Idle / exploration |
|---|---|---|---|
| **Mochi** | "Squire on duty!" · "I'm not hiding, I'm BEING A WALL." | "Left! No, your other left!" · "I'm not scared! My tummy is scared. Separate thing." | *(on a rescued kitten)* "Another one! Can we keep them all?" · "Is it lunch? It feels like lunch." |
| **Sage** | "Target. Down." · "Volley." | "Behind you. Obviously." · "That was... actually cool. Don't tell anyone I said that." | "I've counted forty hyenas. We have four kittens and a spoon." / **Clem:** "Two spoons." (first time only) · "Kitten nearby. I can smell the panic." |
| **Clover** | "Hold still, sweetpea. This purr is medicinal." · "Mrrrr." | "Who hurt you? Point." · "Not the face, she's growing into it!" | "Eat something. Knights need snacks." |

Napping (any companion): "Just... resting my eyes..." · "Zzz." Waking: "I'm up! I'm up!"

### 6.3 Enemies and bosses

| Speaker | Trigger | Lines |
|---|---|---|
| Rats | alert | "Squeak formation!" · "Cheese for the Captain!" |
| Rats | flee (below 20% HP) | "Eek!" · "Nope. Nope nope nope." |
| Hyena Raider | alert | "Look at it! A kitten with a butter knife!" · "Go home, fluffball!" · "Nobody's coming for you!" |
| Hyena Raider | Gloat / Jeer | "Hehehe-HAHA-hoo!" · "BOOOO!" · "Get off the stage!" |
| Hyena Raider | choked | "hrk!" |
| Hyena Raider | defeated | "...That was actually kinda cool." · "Tell no one." · "I'm telling my mum." |
| Post Stealer (any) | snatch / hit / escape | "Finders keepers! Stealers... also keepers!" / "Ow! Fine! Take it!" / "Bye-bye, fishies!" |
| Pug | alert / hit on shield | *(snort)* "HRRF." / "Wall. Am wall." |
| Bonehead | collapse / reassemble / scattered | *(clatter)* / "Ta-daa." / *(a sad little clack)* |
| **Grizzlechop** | intro · P2 · wheel crash · snack · choke | "Halt! This cheese is under the protection of Captain Grizzlechop!" · "Charge! ...I said CHARGE! Why is nobody charging?" · "My WHEEL!" · "Snack break! Captain's privilege!" · "*hrk*— wrong pipe! WRONG PIPE!" |
| **Cacklejaw** | intro · P1 · P2 · stumble · P3 · when Meowed · Jeer choked | "Oh, it's YOU! The tiny one! Lads, she came all this way!" · "Is that a sword or a toothpick?" · "Ratio RUSH!" · "How are you STILL there?" · "Who's laughing now? ...Me. It's still me." · "WHAT?" · "hrk— that's rude!" |
| **Pilfer** | winch pin (L4) · chased (L3) | "It's a post! Technically!" · "Catch me if you— why are you so FAST?" |
| **Brutus** | her parry · duel exchanges | "Good." · "Again." · "Show me your Stand." · "One." · "Two." |
| **Barkus** | intro · P1 · P2 · P3 · each perfect parry in P3 | "No cats. On the sunny. Steps." · "This is MY fog now!" · "My HELMET? ...LADS! HERE, BOY! ALL OF YOU!" · "You want your shiny rock? COME AND GET IT!" · "WHAT?" / "STOP THAT!" / "MY ROCK!" |

### 6.4 Lost kittens (said when rescued; also their hub line)

| Kitten | Level | Hiding spot | Line |
|---|---|---|---|
| Biscuit | meadow | behind the second sleeping cow in the Crow Fields (Meow wakes the cow; it ambles off) | "Is the cow gone? Is it? Okay. Hi." |
| Noodle | meadow | barrel at the crossroads (Meow reveals) | "I was being a barrel. It was going well." |
| Button | meadow | centre of the stone ring, appears after a 3 s Stand there | "You stood so still I thought you were a statue. I copied you!" |
| Pickles | forest | mushroom house door (Meow) | "The mushroom said I could stay. The mushroom didn't say anything. I was scared." |
| Pebble | forest | behind the cracked boulder (Bright Slash) | "You broke a ROCK. With a SWORD." |
| Sprout | forest | rat tent cage | "They said I was too small to be worth cheese." |
| Waffles | town | balcony above Lantern Alley (crate jumps) | "I can see the whole town from here! It's mostly rats." |
| Toffee | town | top of the fountain statue | "I climbed up and then I forgot how down works." |
| Muffin | town | Bell Tower loft | "The bell's quiet. I don't like it quiet." |
| Tater | gate | hyena war-wagon | "Pip said you'd come. Pip says a lot of things." |
| Mittens | gate | hyena war-wagon | "I bit one! On the tail! Gently!" |
| Socks | gate | under the causeway stairs | "It's damp under here. I've been very brave about the damp." |
| Juniper | bog | dead-tree stump in the boardwalk maze (Meow) | "The lights in the water keep winking at me." |
| Bramble | bog | tall reeds in Spider Reeds | "There were spiders. I named them. Then I ran." |
| Fennel | bog | inside the sunken tower | "Is the tower supposed to be sideways?" |
| Bean | keep | barrel in the Courtyard | "The dogs aren't mean. They're just loud. Like Mochi." |
| Crumpet | keep | kennel cage in the cellars | "The skeleton guard tells good jokes. Bad breath, though. He has no lungs." |
| Dumpling | keep | banner beam on the Rampart Climb | "I'm not stuck. I'm guarding the banner." |

### 6.5 Hub lines (2 lines each, one picked at random on interact)

| NPC | Lines |
|---|---|
| Marmalade (Bakery; from bed after L4) | "Milk's on the house. Straws are extra. Kidding. Straws are free." · "Bend the knees, girl. The tail's for balance, not for swishing at butterflies." / *(after L4)* "Take what you need. Leave the fish in the jar. Doctor's watching." |
| Tofu (Forge) | "Sharpen it? I can barely *lift* it." · "Every notch on that blade is a story. Please stop adding notches." |
| Earl Grey (Library) | "Fascinating. The shard resonates with your blade. Or you're vibrating. Kittens do that." · "Knowledge is power. Also, power is power." |
| Pip (Lookout) | "{n} kittens still out in {level}. One's somewhere silly. Don't ask how I know." · "Found your fish. ...I'm keeping one." |
| Pearl (Wardrobe) | "Red's your colour. Every colour's your colour. You're my sister." · "Twirl. ...Okay, don't twirl in armour." |
| Princess Snowpaw | "The castle steps are yours, Swordcat. Watch out for dogs." · "I'm practising knighting people on the cook. He's very patient." |
| Coo | "Coo." |
| Villager kittens (random) | "Is that THE Swordcat? She's so small!" · "My nan says the bell will ring again." · "I'm going to be a knight too. I'm already too small, so that part's done." · "Mind the fountain, it bites. It doesn't. But it might." · "Thank you, Dame— um. Squire. Um. Swordcat!" · "Fish? Fish!" |

### 6.6 Tutorial and prompt strings

The base text is the desktop line (`hybrid` preset). `ui` uses `key.touch` / `key.pad` first when they exist, and `[Token]` glyphs resolve through the active bindings. The full per-device table is in `research/CONTROLS_SPEC.md` §14.

| Key | Text (base; the touch and pad variants are in the spec) |
|---|---|
| `tut.move` | Right-click where to go, or use [WASD]. Hold right-click to keep walking. *(touch: "Drag the left side to move, or tap where to go.")* |
| `tut.jump` | Jump the fence [Jump]. *(F. Passing it sets `tut.jump.done`, which opens the fence's auto-hop link.)* |
| `tut.combo` | Snip, Snap, Swoosh! [Attack] ×3: you swing toward the cursor. *(touch: "Tap ⚔ three times.")* |
| `tut.target` | Right-click a foe to charge in and attack it. *(touch: "Tap a foe…"; pad: "[RB] picks the nearest foe.")* |
| `tut.roll` | Tumble past the sack [Tumble]: toward the cursor. You can't be hurt mid-tumble. *(touch: "Tap Tumble, or swipe the open ground.")* |
| `tut.stand` | Hold the Stand [Stand]. Block the Wobble Knight twice. *(Space)* |
| `tut.parry` | Raise the Stand *just* as it swings. A white glint and a white wedge on the ground mean "parry me". *(touch adds: "When the ring meets you, raise 🛡.")* |
| `tut.bright` | Hold [Attack] until it shines, then let go. The silver arc shows its reach. Bright Slash breaks cracked things. |
| `tut.meow` | Meow [Meow]. Hidden kittens answer. So do cows. |
| `tut.zoom` / `tut.click` / `tut.talk` / `tut.rotate` | Scroll to zoom. · Tip: right-click a spot and she walks there by herself. · Click someone to talk. · Plays best sideways. *(portrait only, once)* |
| `tut.pearl1` / `tut.pearl2` | "Shh! I'm not here." / "...You're getting good, Clem." *(Pearl, behind the tutorial cow)* |
| `tut.riposte` | Parried! [Attack] now for a Riposte. *(first parry in L1)* |
| `tut.pounce` | Jump, then ⚔ in the air: Pounce. Bounce off crows! *(first crow)* |
| `tut.reflect` | Parry a bolt to send it back. *(first crossbow)* |
| `tut.milk` | Milk Break [Milk]: heals 2 hearts. Don't get hit while you sip. |
| `tut.vigil` | Vigil Stone: click it to rest, save, refill milk, swap kittens. |
| `tut.valor` | Standing your ground fills Valor. Hold the Stand near enemies. |
| `tut.companion` | [Ability] Kitten ability: hold to aim, let go to cast. |
| `tut.holy` | Holy Slash: hold ⚔ until it turns gold (needs 50 Valor). |
| `tut.golden` | Golden Hour: at full Valor, press [Golden] (or Stand + Attack together). |
| `tut.line` | Hold the Line! Keep enemies away from the winch. |
| `tut.jeer` | A jeering hyena drains your Valor. Hold the Stand and it can't touch you, or hit it to make it choke. |
| `tut.bones` | Scatter the bones! Hit a bone pile with a heavy attack before it gets up. |
| `obj.*` | "Cut the net ropes {n}/3" · "Free the kitten" · "Catch the Post Stealer" · "Light the lanterns {n}/3" · "Hold the Line! Gate repair {p}%" · "Find the keys {n}/2" · "Reach the Bell Tower" |

### 6.7 Lost Letters (6; collectible lore cards; read in Pause → Letters)

| # | Level / spot | Text |
|---|---|---|
| 1 | meadow, crossroads | "Dear Mum. Squire food is fine. Please send fish. Not the bony ones. — Mochi" |
| 2 | forest, stump in the stream | "Grizzlechop's shopping list: cheese, more cheese, a hat with a bigger feather, cheese." |
| 3 | town, Forge Yard | "To the Snickerpack Armour-Painting Office: please change my word from NAYSAYER to YAYSAYER. I've thought about it a lot. — Private Snorkle" |
| 4 | gate, Old Battlefield | "Dear Pudding. You can come home now. We fixed the cave. — the bats" |
| 5 | bog, boardwalk maze | "Dear Clem, if you're reading this, you found my secret letter spot. I'm proud of you. — P." |
| 6 | keep, Kennel Cellars | "Dear Mum. The cats said no dogs on the sunny steps again. One day I'll get my own sun. — Barky, age 1" |

### 6.8 UI copy

| Key | Text |
|---|---|
| `life.lost` | "{n} lives left" (with the ghost kitten waving) |
| `life.last` | "Last life!" |
| `gameover.title` / options | "Time for a cat nap." / "Wake up (retry level)" · "Back to Pawsbury" |
| `results.ranks` | By lives lost in the level, so it works on every difficulty (Kitten has no life counter): "Paw-some" (0–1 lost) · "Purr-fect" (2–4) · "Mew-tiful" (5 or more). On Knight this equals 8–9 / 5–7 / 1–4 lives left. |
| `toast.kitten` | "Lost kitten found! ({n}/{max})" — this level's count, like the HUD n/3 (M2 fix; `{total}` = n/18) |
| `toast.letter` | "Letter found: {title}" |
| `toast.heartbell` | "Heart Bell! +1 heart" |
| `toast.stolen` / `toast.returned` | "The Post Stealer took {n} fish!" / "Post returned! +5 fish" |
| `toast.memecam` | "A legendary pose. (Meme White cape unlocked)" |
| `loading.tips` | "A white glint means you can parry it." · "Red means move!" · "Hyenas laugh after hitting you. Hit them while they gloat." · "Meow near barrels. Kittens hide in silly places." · "Bright Slash pops slimes without splitting them." · "Standing your ground fills Valor." · "Nine lives per level. Use them." |

---

## 7. Swordcat: moveset and rules [MVP unless marked]

Collision capsule r 0.32, h 1.0 (tech.md §2). All attacks are swept arcs (tech.md §9.2). Angles are relative to her facing; positive = her left. Canonical numbers live in Appendix A `PLAYER` and `ATTACKS`.

### 7.1 Locomotion

| Move | Input | Numbers |
|---|---|---|
| Walk | stick ≤ 0.5 | 2.0 m/s |
| Run | full stick / WASD, or any click / tap order (§15) | **5.5 m/s** (tech.md §11.2's gait normalises to 5.5). Accel damp λ 14, decel λ 18, facing damp λ 16 (90% of a turn in about 0.15 s). |
| **Zoomies** (auto) | run for 2.0 s straight with no alerted enemy within 15 m | **7.2 m/s**. Ears back, tail up, a dust puff every 4 steps. Ends on stop, attack, Stand, or an enemy alert. For traversal and the Pilfer chase. |
| Jump | F / A / the Jump button (path links jump by themselves, §15.5) | v₀ **7.4 m/s**, gravity 22 m/s² (shared `config.gravity`), extra fall gravity ×1.35 for the player. **Apex 1.245 m** (clears 1.0 m fences). Early release multiplies vel.y by 0.5. **Coyote 0.12 s, buffer 0.15 s.** Squash −0.25 on landing, stretch +0.18 on takeoff. Air damp λ 4, air max 5.5 m/s. |
| Fall | — | Terminal −14 m/s. **No fall damage.** Landing faster than 9 m/s → 0.15 s squash lockout. |
| Step / slope | — | Step-up 0.3 m; slopes steeper than normal.y 0.7 slide (tech.md §5) |
| Water / pit | — | Shallow water: speed ×0.6, paw-shake. **Deep water or a pit:** −1 HP, "Splash!", back to the last safe ground (a ring buffer of 8 grounded positions sampled every 0.5 s). **No life lost.** |
| Mushroom cap | land on a tagged cap | Bounce vy 9 m/s (about 1.8 m) |
| **Cape Glide** [MVP+] | hold Jump while falling | Fall speed ≤ 1.8 m/s, horizontal 4.5 m/s, at most 1.5 s per airtime |

### 7.2 Attacks (×10 damage scale)

| id | Name | Input | dur | active | Range / arc | Dmg | Knock | Poise | Hitstop / shake | Lunge | Valor | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `slash1` | Snip | ⚔ | 0.40 | 0.10–0.22 | 1.9 m, +1.2 → −1.2 rad | 10 | 4 | 1 | 0.05 / 0.15 | 2.5 | +4 | combo window 0.18–0.40 → `slash2` |
| `slash2` | Snap | ⚔ in window | 0.40 | 0.10–0.22 | 1.9, −1.2 → +1.2 | 10 | 4 | 1 | 0.05 / 0.15 | 2.5 | +4 | → `slash3` |
| `slash3` | Big Swoosh | ⚔ in window, or charge released at 0.35–0.60 s | 0.60 | 0.20–0.32 | 2.3, +1.7 → −1.7 | 20 | 9 | 3 | 0.09 / 0.35 | 4.0 | +6 | Recovery cancellable by a roll after 0.32 |
| `pounce` | Pounce | ⚔ in the air | 0.12 hang, then dive at 14 m/s | dive until landing | below and ahead r 0.9; landing ring r 1.3 | 18 dive / 10 ring | 6 | 2 | 0.07 / 0.25 | — | +6 | **A dive hit pogos her up at vel.y 6** and refreshes Pounce: chain crows. Landing recovery 0.25 s. Breaks a Pug's guard if it hits from above. |
| `bright` | **Bright Slash** | release a charge at ≥ 0.60 s (tier 1) | 0.55 | 0.14–0.26 | 2.6, +1.6 → −1.6 | 28 | 10 | 4 | 0.10 / 0.40 | 3.0 | +6 | No Valor cost. **Breaks Pug shields and cracked boulders; pops a Gloomjelly of any size without splitting it.** |
| `holy` | **Holy Slash** (Shard 1) | release at ≥ 1.10 s (tier 2) with Valor ≥ 50 | 0.85 | 0.22–0.36 | 3.6, full circle | 50 | 14 | 99 | 0.14 / 0.60 | — | **−50** | I-frames 0.0–0.46. Time scale 0.35 for 0.25 s (real). Spawns `holyWave` from Shard 2 on. |
| `holyWave` | Holy Wave (Shard 2) | auto with `holy` | life 0.71 s | — | 14 m/s, 10 m, 2.4 m wide | 30 | 8 | 6 | 0.06 / 0.20 | — | — | Pierces; destroys enemy projectiles; pops slimes without splitting |
| `riposte` | Riposte | ⚔ within 0.8 s of a parry | 0.50 | 0.10–0.20 | 2.4, thrust ±0.3 | 18, **×2 crit** = 36 | 10 | 4 | 0.12 / 0.35 | 5.0 | +8 | Auto-turns to the parried enemy within 4 m |
| `gleam` | Gleam crescent | every slash during Golden Hour | life 0.45 s | — | 18 m/s, 8 m, 1.2 m wide | 12 | 4 | 2 | — | — | — | Golden Hour only |
| `sunburst` | Sunburst | automatic when Golden Hour ends | 0.6 | 0.20–0.30 | r 6, full circle | 40 | 16 | 99 | 0.16 / 0.70 | — | — | Ends Golden Hour |

**Charge rules**
- Hold ⚔ longer than 0.35 s to enter `charge`. She walks at 40% (2.2 m/s) and turns toward the aim at 540°/s. A ground wedge shows the reach of the release. Silver sparkles build. The camera pushes in 1.0 m and the FOV drops 1°.
- **Tier 1** at 0.60 s: silver flash plus `pickup/powerup_rise01`.
- **Tier 2** at 1.10 s, **only with Shard 1 and Valor ≥ 50**: the blade turns gold (art.md §4.3 holy ramp) plus `powerup_rise03`. **Without them, the gold sparkles visibly fizzle at 1.10 s** and the charge stays at tier 1. The player learns the rule without a tutorial.
- Release at 0.35–0.60 s gives `slash3`. A charge can be held indefinitely. Taking a hit cancels it.

**Assists**
- **Aim:** every swing gets its direction from one resolver (§15.6), in this order: the Riposte target, a touch drag or the right stick, the **cursor**, the selected target, the soft auto-target, the stick, then facing.
- **Magnet** on the first active frame. The cone is centred on the *aim*, not on her facing:
  - mouse: ±25° and range + 1 m (±40° for the selected target);
  - right stick: ±45° / 3.5 m;
  - touch and auto-target: ±90° / **4.5 m**.

  Touch, pad and auto-target swings can lunge up to 1.0 m further to close a gap.
- Attack and roll have a 0.2 s input buffer. The Stand is never buffered.
- A new move order during a wind-up cancels the swing (no damage, no Valor). WASD and the stick never cancel a wind-up, but they cut recovery from `active[1] + 0.05 s`.
- **DPS check:** Snip–Snap–Swoosh deals 40 in about 1.4 s (≈ 29/s). A Rat Pikeman (30 HP) dies to one combo or one Riposte.

### 7.3 Defence: the Stand, parry, Riposte, Tumble

| Move | Input | Numbers |
|---|---|---|
| **The Stand** (guard) | hold Space / LB / 🛡 | On press she **snaps to face** a parryable attacker within 5 m whose hit lands within 0.7 s. After that she faces the cursor (once it moves 30 px), the right stick, or on touch the soonest threat. On touch the guard arc is **±90°**. **Vigil pose** in 0.08 s [REF ref2]; her ears flatten for 0.1 s first. She shuffles at **1.2 m/s** and turns at 360°/s. Blocks **frontal ±70°** melee and projectiles: **0 damage**, 0.4 m pushback. Each block costs **1 Grit**; hits with poise ≥ 3 cost 2. **Grit 3**, regaining 1 per 1.5 s after 0.8 s without blocking. At 0 Grit: **guard break**, 0.8 s stagger. **Red (unblockable) attacks** go straight through the Stand: full damage plus a guard break. |
| **Parry** | start the Stand **≤ 0.15 s** before a hit lands (Kitten difficulty 0.25 s; touch +0.05 s) | Negates the hit. **+20 Valor**, hitstop 0.12, time scale 0.5 for 0.15 s, gold ring spark, `sword_clash` + `metal_ringing`. Normal enemy: **stagger 1.2 s and a Riposte prompt**. Elite (poise ≥ 5): stagger 0.8 s. Boss: **+35 Dizzy**. **Gold-glint attacks** put a boss straight into Dizzy. **Projectiles are reflected** at 1.5× speed for 25 damage, from the start of the game. |
| **Whiff lockout** | a Stand pressed and released within 0.25 s that blocked or parried nothing | Parry disabled for 0.30 s (blocking still works). No mashing. |
| **Standing Ground** | stay in the Stand, planted (speed < 0.1 m/s) for ≥ 1.0 s, with ≥ 1 alerted enemy within 6 m that is targeting her | **+5 Valor/s** (+10/s inside a Jeer aura). **Capped at +30 per Stand**; the cap resets after the Stand has been released for 0.5 s. Her cape billows harder and the mist speeds up around her. The meme as a mechanic. |
| **Tumble** (roll) | Shift / B / the Tumble button or a swipe. Direction: WASD, else toward the cursor. On touch: the stick, else away from the soonest threat. | 0.40 s at 9 m/s easing to 4 m/s (about 2.6 m). **I-frames 0.04–0.30.** Cooldown 0.20 s. Cancels attack recovery after the active window. Ground only. |
| **Purrfect Dodge** | an enemy's active hitbox overlaps her during i-frames 0.04–0.20 | Time scale 0.35 for 0.5 s (real); world desaturates 30% while she stays saturated; **+12 Valor**; her next hit within 1.2 s crits ×1.5. `pickup/powerup_fx01`. |
| Graze | overlap during i-frames 0.20–0.30 | +4 Valor, soft chime `ui/glass_001` |

### 7.4 Valor (sword-shaped meter, 0–100)

| Source | Valor |
|---|---|
| Light hit landed (Snip, Snap) | +4 (at most +8 per swing) |
| Heavy hit (Big Swoosh, Pounce, Bright) | +6 |
| Parry | +20 |
| Riposte hit | +8 |
| Purrfect Dodge / graze | +12 / +4 |
| Standing Ground | +5/s (+10/s in a Jeer aura), cap +30 per Stand |
| Choking a gloating or jeering hyena | +10 |
| Lost kitten rescued | +25 |
| Taking damage | −10 |
| Inside a Jeer aura while **not** in the Stand | −6/s |
| **Spend:** Holy Slash / Golden Hour | −50 / −100 |

- Valor never decays. It persists through checkpoints within a level, is halved when she respawns after losing a life, and resets to 0 on level load.
- The blade's emissive tracks Valor (0 → 0.6). At 50 a gold notch lights on the meter; at 100 the meter turns gold with sparkles.

### 7.5 Golden Hour (the super; Shard 2, unlocked in CS-09)
- **Trigger:** Valor 100, then Stand + ⚔ pressed within 0.1 s of each other (or V, RT, or the gold touch button).
- **Activation, 0.8 s:** Oath pose, invulnerable. Enemies within 8 m stagger 0.5 s. The camera punches in to ref1 framing.
- **Duration 8.0 s.** During it:
  - damage ×1.5, and every slash also fires a `gleam` crescent;
  - super armour (no stagger);
  - damage taken ×0.5, rounded down, so 1-HP hits do nothing;
  - move speed ×1.1;
  - Holy Slash reaches tier 2 in 0.5 s and costs 0 Valor;
  - **global fog density ×0.5** (the Gloom recedes; `Env` contribution);
  - bloom 1.2.
- **End:** an automatic `sunburst`. Valor is locked at 0 for 3 s afterwards.
- `jingles/jingles_STEEL0x` stinger, plus a high-shelf boost on the music bus.

### 7.6 Health, Milk, Nine Lives, checkpoints
- **Hearts:** start with **4 hearts = 8 HP**. Each Heart Bell adds 1 heart, up to **7 hearts = 14 HP**.
- **Hurt:** 0.35 s stun, knockback, then **0.9 s of i-frames** with the mesh blinking at 15 Hz. Player-hurt hitstop 0.07 s; shake 0.3 × 1.4; red vignette 0.3 s.
- **Small hearts** drop from 10% of defeated enemies: +1 HP, magnetised from 3 m.
- **Milk Break** [TREND V3]:
  - Selfie-sip pose; 0.9 s total; she can turn but moves at only 1.1 m/s.
  - **Heals 4 HP at the 0.5 s mark.** A hit before 0.5 s cancels the sip and **the bottle is kept**.
  - Carry **2** to start; the bakery satchel raises it to 3, then 4. Mochi, while active, adds +1 capacity on top (so the true maximum is 5). Swapping Mochi out removes the extra bottle if it is full.
  - Vigil Stones refill milk to full.
- **Nine Lives** [TREND bio]:
  - Each level attempt starts with **9 lives**: a cat-head-with-bow icon and "×9".
  - At 0 HP: a cute **faint** (she curls up on her cape). A translucent ghost kitten floats up out of the HUD icon and waves. Soft pink-white flash; "8 lives left".
  - Respawn at the last Vigil Stone with full HP and half her Valor. The current arena resets; **a boss resets to the start of its current phase** at full phase HP.
  - At 0 lives: "Time for a cat nap." → Retry level (9 lives; rescued kittens, letters and Heart Bells are kept) or Back to Pawsbury.
- **Still Standing** (last stand): once per checkpoint segment, a lethal blow leaves her at 1 HP. 2.0 s invulnerable, +30 Valor, a slow-motion rise (time scale 0.4 for 0.8 s), bark "...Still standing."
- **Vigil Stones** (checkpoints): `env/nature/statue_obelisk.glb` plus `env/graveyard/lantern-candle.glb` [verified].
  - Walk within 1.5 m and press E: she plants the sword in Vigil for 0.8 s. The lantern lights gold.
  - Effect: save, full heal, refill milk, open companion swap, set the respawn point.
  - 2–4 per level (the compact `town` has 2), at most about 3 minutes of play apart, always one at a boss door.

### 7.7 Meow and cat behaviour
- **Meow** (C / L3 / cat-face button): 0.6 s, cooldown 1.0 s.
  - Unalerted enemies within 8 m turn and alert (an aggro pull).
  - **Hidden lost kittens within 10 m answer** with a mew, a 3 s sparkle, and a HUD edge ping.
  - The active companion answers "mrrp" and regroups to her side.
  - Wakes sleeping cows (the tutorial cow hides Pearl; the Crow Fields cow hides Biscuit).
  - In the Cacklejaw fight's phase 3, only the real Cacklejaw answers "WHAT?" (§11.3).
- **Ambient behaviours** (player model agent; cheap):
  - **ear tell:** ears flatten 0.1 s before any Stand;
  - **tail puff:** tail ×1.4 for 1.0 s when an enemy taller than 2 m alerts;
  - **slow blink:** stand still for 3 s within 3 m of a companion and they trade slow blinks, with a heart puff;
  - **sneeze:** once per 90 s at random when fog ≥ 0.06.

### 7.8 Meme Cam [MVP]
- **Idle trigger:** 15 s with no input, on an outdoor level, no alerted enemy within 20 m, fog density ≥ 0.02.
- **Manual trigger:** hold the Stand 2.5 s while planted with no enemy within 12 m.
- **What happens:**
  1. **The Descent:** the camera cranes down from the top-down view into `MEME_LOOP` over 2.0 s. The fog blends from focus fog back to lens fog at the same time, so the misty horizon appears as the lens reaches eye level.
  2. She switches from Vigil to **Oath** (sword vertical before her face).
  3. Wind ×1.6, mist ×2. The HUD fades out over 0.5 s.
  4. After 1.0 s, a caption fades in at the bottom left in Uncial Antiqua italic: one of `meme.cap1–3` at random.
- It loops seamlessly with a 3.8 s period (cape, wind and fur cycles are synced). A verlet cape can't repeat exactly, so **during Meme Cam the hero cape cross-fades over 0.3 s to the sway-shader cape** driven by a 3.8 s sine (gust peak at 1.2 s), and the grass wind uses the same period; verlet resumes on exit. Any input, or a mouse move of 40 px or more, exits with a 0.9 s rise back to the top-down view. Mouse movement counts toward the idle timer only above 24 px/s.
- **The first trigger** unlocks the **Meme White** cape and shows `toast.memecam`.
- **Silent:** wind only, no music, like the silent viral loop [TREND §5].
- Events: `camera:meme {on}`. Test hook: `__GAME__.idle(seconds)`.

### 7.9 Difficulty

| Setting | Kitten | **Knight** (default) | Nine Lives |
|---|---|---|---|
| Damage taken | `max(1, floor(d × 0.5))` | ×1 | `ceil(d × 1.5)` |
| Lives | unlimited (no counter) | 9 per level | 9 for the whole game; at 0, restart the current act's first level |
| Attack tokens (melee / ranged) | 1 / 1 | 2 / 2 | 3 / 2 |
| Enemy and boss HP | ×0.8 | ×1.0 | ×1.25 |
| Enemy windups | ×1.25 | ×1.0 | ×0.9 |
| Parry window | 0.25 s | 0.15 s | 0.12 s |
| Barkus phase 3 | blocks count as perfect parries | — | — |

Difficulty can be changed at any Vigil Stone, except Nine Lives, which is fixed for the save. Options for all difficulties:
- **Auto-Stand assist** (touch default on): after a parry, the Stand is held automatically for 0.5 s.
- Toggle-instead-of-hold for the Stand and the charge.

---

## 8. Combat feel [MVP]

### 8.1 Telegraph language (one language for every enemy and boss)
Every telegraph pairs a **colour + a shape + a sound**, so colour-blind players can read it (§14.4). All are drawn by `fx/Telegraphs.js`, started by the `combat:telegraph` event.

| Kind | Visual | Sound | Counter | Min lead |
|---|---|---|---|---|
| `parry` (white) | White 4-point glint sprite on the weapon at windup start, plus a white "!" over the head | high "ting" 0.25 s before the active frame (`ui/glass_002`) [audition] | Parry, block or dodge | 0.45 s |
| `gold` (perfect) | Gold `#FFD34D` glint, a slowly rotating 8-point star | brighter chime (`ui/pluck_001`) [audition] | Parry → a boss goes straight to Dizzy; a grunt staggers 2.0 s | 0.6 s |
| `red` (unblockable) | Red-orange `#FF3B30` emissive glow on the weapon or body, plus a jagged "!!" | low growl (`creature/c80_grunt_0x` at rate 0.7) | Dodge or jump only | 0.6 s |
| `aoe` (ground) | Flat decal (circle, lane, cone or ring) filling from the centre outward in `#FF6A3D` at 0.45 alpha with a white rim; full = it hits | rising whoosh (`magic/spell_01` at rate 0.8) | Move out; jump rings | 0.5 s |
| `aim` (ranged) | Dotted white line from the shooter; it **stops tracking 0.2 s before the shot** | `world/metalClick` | Strafe, roll, or parry to reflect | 0.8 s |
| `grab` | Purple `#9B5CFF` swirl around the hands | `creature/c80_eat_01` | Dodge only | 0.6 s |
| `jeer` | Purple `#B07CFF` expanding sound-wave rings around a hyena | laugh build | **Stand** (immune, and it charges Standing Ground) or hit it (choke) | 0.5 s |
| `shadow` (from above) | A dark circle decal that grows; it tracks for the first 60% of its time, then freezes | wing whoosh `impact/cloth` | Move out | 1.0 s |

**Reading attacks from above** (`research/CONTROLS_SPEC.md` §8.2):
- **Ground strike wedge:** every melee wind-up draws the attack's own arc on the ground, as an outline with a fill that sweeps outward. It tracks the attacker until 0.15 s before the hit, then freezes. The rim flashes when the parry window opens. Red wedges are filled.
- **Glints and "!"** draw at a constant 28–34 px, on top of everything.
- **Parry ring** (optional; default on for touch and Kitten difficulty): it shrinks onto her and meets her exactly on the active frame. The parry window is drawn as a band.
- **Ranged aim lines** lie on the ground.
- **Aggro ring:** alerted enemies show a thin red ring.
- **X-ray:** an enemy in a wind-up shows a silhouette when something hides it.

**Off-screen threat arrows:**
- Any active telegraph within 15 m whose actor is off-screen, or hidden by an occluder, shows an arrow at the screen edge, coloured by kind (white, gold, red, purple). Ranged enemies may start aiming only when they are on screen or within 9 m of her.
- At most 4 arrows. Owned by ui; it listens to `combat:telegraph` and `combat:telegraphEnd`.

### 8.2 Juice table (combat, fx, camera and audio all key off `combat:hit` and the player events)

| Event | Hitstop | Shake trauma | Visual | Audio | Rumble (weak, strong, ms) |
|---|---|---|---|---|---|
| Light hit | 0.05 | 0.15 | 60 ms white flash on the target, 4 hit-stars, squash pulse, damage number | `sword/sword_attack_0x` (±5% pitch); armoured targets `impact/impactPlate_light_00x` | 0.25, 0, 60 |
| Heavy hit | 0.09 | 0.35 | 8 stars, dust ring | `sword/melee_sword` + `impact/impactPunch_heavy_00x` | 0.4, 0.5, 120 |
| Holy | 0.14 | 0.6 | Bloom 0.55 → 1.2 → 0.55 over 0.4 s; FOV +5° punch for 0.15 s; gold crescent; ground ring decal | `magic/spell_fire_03` + `impact/impactMetal_heavy_00x` | 0.8, 0.8, 250 |
| Parry | 0.12 | 0.25 | Gold ring spark; time scale 0.5 for 0.15 s | `sword/sword_clash_0x` + `impact/metal_ringing` | 0.3, 0.7, 90 |
| Block | 0.04 | 0.10 | White sparks; a Grit pip flashes | `impact/impactMetal_medium_00x` | 0.2, 0.2, 60 |
| Guard break | 0.08 | 0.40 | Grit pips crack | `impact/metal_small1` + `impact/impactPlate_heavy_000` | 0.5, 0.5, 150 |
| Kill | +0.04 | +0.10 | **Poof**: 12 white puffs, 6 gold stars, the helmet spins off, fish burst | `creature/creature_die_01` + `pickup/coins_0x` | — |
| Player hurt | 0.07 | 0.3 × 1.4 | Red vignette 0.3 s; hearts wobble | `impact/impactPlate_light_00x` + `cat/cute_creature_0x` at rate 1.2 | 0.6, 0.3, 150 |
| Boss Dizzy | 0.10 | 0.30 | Stars circle the head; a gold "!" | `jingles/jingles_NES03` | 0.3, 0.3, 120 |
| Low HP (≤ 2 HP) | — | — | Vignette pulse at 1 Hz; hearts pulse | soft heartbeat (zzfx) | — |

Rumble uses `gamepad.vibrationActuator.playEffect('dual-rumble')`. Support outside Chromium is [unverified]. Settings: shake 0–100%, "reduce flashes" (caps the bloom spike at 0.8 and removes full-screen flashes).

### 8.3 Combat camera and targeting
- **Camera:** a fixed-yaw, three-quarter top-down camera. The full rig is in `research/CONTROLS_SPEC.md` §2.
  - FOV 38°. Pitch 46–58°, depending on zoom.
  - Distance **13 m** on desktop and **12 m** on a phone; zoom 9–18 m. She is never less than **30 CSS px** tall.
  - **Combat** (an alerted hostile within 10 m): the focus leans 30% toward the engaged enemies (at most 2.5 m). The view zooms **out** by up to 3 m to keep them inside 80% of the frame. It never zooms in by itself and never rotates.
  - **Bosses:** a 14–22 m fit of her and the boss, with the focus 35% toward the boss and a 56° pitch.
  - A parry punches in 0.6 m; Golden Hour dollies in to 9 m.
  - Shake: rotation ×0.5, translation ×2.
  - Occluders fade (dithered), and she shows an x-ray silhouette when something hides her.
- **Selection** (it replaces lock-on; the `cam.lock*` API stays as its store):
  - Click, tap, Tab or RB selects a target.
  - The target gets a gold ground ring (red during its wind-up) and a world HP bar.
  - Selection never moves the camera.
  - It breaks at 16 m, or after 1.5 s without line of sight.
- **Attack tokens** (tech.md §10): Knight 2 melee / 2 ranged. Tokenless enemies orbit at 1.4× their attack range.
- **Arena budget:** at most **8 enemies alive** (6 on Low quality) and at most **12 skinned meshes** on screen (tech.md §18).
- **Damage numbers:** Fredoka 700, white with an ink outline. Crits gold with a sparkle; heals green `#7FD38A`. DOM pool, max 20.

---

## 9. Companions [MVP]

### 9.1 Rules
- **1 active companion** (`COMPANIONS.maxActive = 1`). Swap at any Vigil Stone or at the hub Barracks banner. [MVP+]: `maxActive = 2` after `gate.done` if the performance budget holds.
- **Follow:** 2.5 m behind and to the side, using seek plus separation steering (tech.md §10). Teleport to her side if more than 15 m away or 4 s out of line of sight.
- **Engage** only enemies that are already engaging her, within 6 m of her.
  - Basic attack: **5 damage every 1.6 s**.
  - Enemies give 20% of their token grants to a companion within 6 m.
  - Companions are helpers, not carries.
- **They never die.** At 0 HP (8 HP pool) a companion **naps** for 8 s, curled up with "zzz", then wakes at full HP. The HUD portrait shows "zzz".
- **Ability:** Q / LT / the portrait button, with the cooldown shown as a radial ring in the kitten's colour.
- **Barks:** see §6.2.

### 9.2 Abilities

| Kitten | Ability | Numbers | Cooldown | Passive |
|---|---|---|---|---|
| **Mochi** (tank) | **Shield Wall** | Plants the tower shield 1.5 m in front of Swordcat, facing her camera-forward. A 3.0 m wide, 1.6 m tall barrier for **4.0 s**: blocks every projectile and melee hit that crosses it. **Taunts** enemies within 6 m (they target Mochi) for 4.0 s. Melee hits on the wall stagger the attacker 1.0 s. | 18 s | +1 milk capacity while active |
| **Sage** (ranger) | **Volley** | 5 arrows over 0.6 s split across up to 3 targets within 14 m, **8 damage each**. **Flyers that are hit are grounded for 3.0 s**: they drop to the ground and become hittable. | 14 s | **Shoots one flyer every 2.5 s for 6 damage.** Lost kittens and letters within 15 m sparkle. |
| **Clover** (healer) | **Purr of Mending** | 1.0 s channel, then **heals 4 HP over 3.0 s** and cleanses slow (webs) | 30 s | Out of combat: +1 HP every 20 s |

[STRETCH] Pip (Swipe: steal an enemy's weapon for 6 s, retrieve stolen loot) and Earl Grey (Yarn Snare: pull enemies within 4 m together and bind them 2.5 s) as companions.

### 9.3 The Spoon Brigade (L4 only; scripted kittens)
- In L4 wave W4 and in the Cacklejaw fight, the rescued kittens stand behind the Line.
- Every 2.0 s they throw `ceil(count / 3)` spoons, at least 1, at random enemies within 12 m of the Line marker: **5 damage each**, no knockback, a "plink" `impact/metal_small2`.
- Kittens can't be targeted or hurt.


---

## 10. Enemies

### 10.1 Shared rules [MVP]
- **FSM** (tech.md §10): idle → patrol → alert (a 0.4 s "!" hop) → chase → windup → strike → recover → stagger / die. Types add data and state overrides.
- **Minimum windup is 0.45 s** on Knight. Every attack has a `recover` punish window.
- **Look:** chibi proportions, oversized helmets, cool desaturated palettes, **never pink** [ART §11].
- **Defeat is never violent:** a poof (12 white puffs + 6 gold stars), the helmet spinning off, and small enemies scampering away.
- **Drops:** fish (per row) and a 10% small heart (+1 HP).
- **HP** is on the ×10 scale. **Damage to Swordcat** is in HP (2 = one heart).
- **Models:** every GLB goes through `fitToHeight` and `MODEL_FIT` (§18.1). A missing clip falls back to a procedural squash (0.15 s, scale y 0.8) plus a white flash.
- Each enemy type is one data file: `src/enemies/types/<id>.js` (format in Appendix B).

### 10.2 Stat table (Knight difficulty) [MVP rows unless marked]

| id | Enemy | Model (see §18) | Fit (m) | r | HP | Poise | Mass | Walk / run (m/s) | Sight / FOV | Leash | Fish | Levels |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `rat_pike` | **Rat Pikeman** | `creatures/polypizza/Rat.glb` + procedural kettle helm, spear, cheese-sigil buckler | h 0.8 | 0.30 | 30 | 2 | 0.8 | 1.6 / 3.8 | 10 m / 120° | 18 | 2–3 | meadow, forest, town, bog |
| `rat_xbow` | **Rat Crossbowman** | `Rat.glb` + hood + `weapons/kaykit/crossbow_1handed.glb` on bone `FrontLeg.R` | h 0.8 | 0.30 | 20 | 1 | 0.8 | 1.6 / 3.6 | 16 / 120° | 22 | 2 | all but gate W1–W2 |
| `crow` | **Crow Raider** | `creatures/monsters-flying/Pigeon.glb`, tint `#17181C`, procedural iron hood, red plume `#A3202C` | wingspan 1.2 | 0.35 | 20 | 1 | 0.5 | flies 5.0, circles r 5 at 4 m altitude | 14 / 360° | 25 | 2 | meadow, forest, town, gate, bog, keep |
| `jelly_l` / `_m` / `_s` | **Gloomjelly** | procedural transmission sphere (art.md §11); fallback `creatures/polypizza/Slime.glb` | h 0.8 / 0.5 / 0.3 | 0.45 / 0.30 / 0.20 | 40 / 20 / 10 | 1 | 1.0 / 0.6 / 0.3 | hops 1.5 m every 1.2 s | 8 / 360° | 14 | 2 / 1 / 1 | bog |
| `jelly_giant` | **Giant Gloomjelly** (variant, not a new type; `ENEMIES.jelly.sizes.GIANT`) | procedural, Earl Grey visible inside; splits into 2 `jelly_m` unless a `popsSlime` attack kills it | h 1.6 | 0.90 | 120 | 1 | 2.0 | hops 1.5 m every 1.2 s | 8 / 360° | 14 | 10 | town (fountain, once) |
| `spider` | **Bramble Spider** | `creatures/polypizza/Spider.glb`, tint moss `#4E5A2C` | h 0.5 | 0.35 | 35 | 2 | 0.6 | skitters 5.0 for 1.2 s, then pauses 1.0 s | 10 / 180° | 16 | 3 | forest, bog |
| `hyena` | **Hyena Raider** | `characters/kaykit/Barbarian.glb` + `buildBeastHead('hyena')` + CanvasTexture plate + `weapons/skeleton/Skeleton_Blade.glb` | h 1.35 | 0.40 | 50 | 3 | 1.4 | 2.0 / 5.0 | 14 / 140° | 22 | 4–6 | gate, keep |
| `stealer` | **Post Stealer** | `characters/kaykit/Rogue_Hooded.glb` + hyena head + "POST STEALER" plate + mailbag | h 1.2 | 0.35 | 30 | 1 | 1.0 | 2.0 / **6.0** | 16 / 160° | 30 | 3 | town, gate, bog |
| `pug` | **Pug Shieldbearer** | `characters/kaykit/Knight.glb` + `buildBeastHead('pug')` under `Knight_Helmet` (×0.9); `Rectangle_Shield`, `1H_Sword` visible | h 1.25 | 0.45 | 60 | 5 | 2.0 | 2.5 / 3.2; **turns at only 120°/s** | 12 / 120° | 18 | 5 | town, gate, bog, keep |
| `bone_minion` / `_warrior` / `_rogue` / `_mage` | **Bonehead** | `creatures/skeletons/Skeleton_Minion / Warrior / Rogue / Mage.glb`; weapons from `weapons/skeleton/*` on `handslot.r` / `handslot.l` | h 1.0 | 0.35 | 30 / 45 / 30 / 25 | 2 / 3 / 2 / 1 | 1.0 | 1.5 / 3.5 | 12 / 140° | 18 | 3 | keep |
| `warhound` [MVP+] | **Warhound** | `creatures/animals/Husky.glb`, tint `#3A3436`, procedural barding | length 1.1 | 0.40 | 45 | 3 | 1.2 | 3.0 / 7.5 | 14 / 160° | 25 | 4 | keep |
| `bat` [MVP+] | Cellar Bat | `creatures/polypizza/Bat.glb` | h 0.4 | 0.25 | 10 | 0 | 0.2 | erratic flight 6.0 | 10 / 360° | 20 | 1 | keep cellars, bog tower |
| `hornet` [MVP+] | Hornet Lancer | `creatures/polypizza/Wasp.glb` + procedural lance | h 0.6 | 0.30 | 25 | 1 | 0.4 | hovers 1.2 m up, 3.0 | 15 / 180° | 20 | 3 | forest |

### 10.3 Attack table (enemy entries in `combat/attacks.js`)
Columns: telegraph kind (§8.1), windup (s), shape and range, damage (HP), knockback, recover (s).

| Enemy | Attack id | Telegraph | Windup | Shape / range | Dmg | Knock | Recover | Notes |
|---|---|---|---|---|---|---|---|---|
| rat_pike | `rat_poke` | parry | 0.55 | thrust ±0.3 rad, 1.8 m, lunge 4 m/s | 1 | 3 | 0.8 | 30% follow-up `rat_poke2`: windup 0.30, **gold glint** (a parry staggers 2.0 s) |
| rat_xbow | `rat_bolt` | aim | 0.8 (aim stops tracking at 0.6) | projectile 16 m/s, range 18 m, r 0.15 | 1 | 2 | reload 2.0 | Keeps 7–11 m away. Hops back 3 m (`Rat_Jump`) when she is within 3 m; cooldown 3 s. **Reflectable** (25 damage back). |
| crow | `crow_dive` | shadow | 1.0 (tracks 0.6) | dive 12 m/s to the decal centre, r 0.9 | 2 | 5 | 1.2 | After a dive, hit or miss, it **lands and pecks for 1.2 s**: hittable by anything. Otherwise hittable only below 2.2 m (Pounce reaches it), by projectiles, or when grounded by Sage. |
| jelly | `jelly_slam` | aoe (circle) | 0.5 squash | leaps 3 m (0.6 s airtime); landing circle r 0.9 / 0.7 / 0.5 | 2 / 1 / 1 | 4 | 0.8 | **Splits on death:** L → 2 M, M → 2 S. Children pop 2 m outward with 0.3 s invulnerability. **`bright`, `holy`, `holyWave`, `gleam` and `sunburst` kill without splitting** (`popsSlime`). At most 12 alive, pooled. |
| spider | `spider_web` | parry | 0.6 abdomen pulse | glob 10 m/s, range 7 | 0 | 0 | 1.0 | **Slows 50% for 2.0 s**; a roll clears it. Reflectable (10 damage). Leaves a web patch r 1.0 for 8 s with the same slow; one slash cuts a patch. |
| spider | `spider_bite` | parry | 0.45 | sector ±0.6, 1.2 m | 2 | 3 | 0.9 | — |
| hyena | `hyena_slash` | parry | 0.5 | arc ±1.0, 1.8 m | 2 | 5 | 0.7 | — |
| hyena | `hyena_lunge` | red | 0.6 crouch | leaps 6 m/s for 0.4 s from 3–5 m | 2 | 6 | 0.8 | Unblockable |
| hyena | **Gloat** | — | — | — | — | — | — | **After it lands any hit on her, it laughs for 1.0 s** (`Cheer` clip) and doesn't attack. **A hit during the Gloat chokes it:** "hrk!", stagger 1.0 s, **+10 Valor**. |
| hyena | **Jeer** | jeer | 0.5 head-throw | aura r 8 m for 2.0 s | — | — | — | One jeering hyena per pack at a time; per-hyena cooldown 12 s; only when she's within 10 m. **While she's in the aura and not in the Stand: −6 Valor/s. In the Stand: immune, and Standing Ground runs at +10/s.** Env fog +0.01 while it lasts (max +0.03 total). A hit on the jeerer chokes it (+10 Valor, aura ends). |
| hyena | Pack flank | — | — | — | — | — | — | The 2nd and later hyenas circle to her back (a "behind" token) and giggle 0.6 s before attacking |
| stealer | `stealer_snatch` | grab | 0.6 (rubs paws, eyes glint) | dash 9 m/s for 0.35 s | 0 | 2 | — | **Steals 10% of her carried fish** (min 5, max 50). With fewer than 5 fish it steals 1 milk bottle; with no milk, a 1-damage shove. Then it **flees at 6.0 m/s** to the nearest `fog_edge` anchor and **despawns with the loot after 8 s**. **Any hit drops all the loot plus 5 bonus fish** ("Post returned!"). |
| pug | **Shield** | — | — | frontal ±70° | — | — | — | Frontal hits spark for 0 damage. **Broken by `bright`, `holy`, `pounce` from above, or by parrying `pug_bash`** → shield drops for 4.0 s and the pug staggers 1.5 s (2.0 s after a parry). Otherwise flank it: it turns at 120°/s. |
| pug | `pug_bash` | parry | 0.6 shield rim glint | 1.5 m | 2 | 8 | 0.9 | — |
| pug | `pug_slam` | red | 1.0 (raises the shield high) | **shockwave ring** expanding to r 2.5 over 0.4 s, 0.3 m tall | 2 | 6 | 1.2 | Unblockable; **jump it** or roll through |
| pug | `pug_chop` | parry | 0.5 | arc ±0.8, 1.7 m | 2 | 4 | 0.8 | Only while the shield is down |
| bone_minion / warrior | `bone_chop` | parry | 0.5 | arc ±0.8, 1.6 m | 2 | 4 | 0.7 | The warrior **blocks the first frontal light hit** (`Block_Hit`), then counters with `bone_chop` at windup 0.35 |
| bone_rogue | `bone_stab2` | parry | 0.4 / 0.3 | thrust ±0.3, 1.6 m, two hits | 1 + 1 | 3 | 0.7 | — |
| bone_mage | `bone_bolt` | aim | 0.7 | orb 12 m/s, range 12 | 2 | 3 | 2.0 | Reflectable (25) |
| all Boneheads | **Reassemble** | — | — | — | — | — | — | At 0 HP → bone pile (`Death_C_Skeletons`) for **4.0 s**, then it rises with 50% HP (`Death_C_Skeletons_Resurrect`). **A heavy hit on the pile (`slash3`, `pounce`, `bright`, `riposte`, `holy`, `holyWave`, `sunburst`) scatters it for good** (poof, fish). A pile can reassemble at most 2 times. |
| warhound [MVP+] | `hound_charge` / `hound_bite` | red / parry | 0.8 (`Idle_2_HeadLow`) / 0.45 | dash 11 m/s / ±0.6, 1.3 m | 2 / 1 | 6 / 3 | 1.0 / 0.6 | **"Fetch!"** If a Bonehead pile is within 8 m, there is a 60% chance per pile that it runs over and chews for 3.0 s, **removing that Bonehead for good**. |

**Hit reactions:** any hit that isn't blocked does 0.12 s of `Hit_A` / `HitReact` (or squash) when poise > 0. A poise break means stagger 0.6 s (tech.md §9.3).

### 10.4 Clip maps (data; a unit test checks every name exists in its GLB)

| Rig | idle | move | windup / strike | hit | death | extras |
|---|---|---|---|---|---|---|
| Rat (`Rat_*`) | `Rat_Idle` | `Rat_Walk` / `Rat_Run` | `Rat_Attack` sub-clips: 0–40% at 0.35× (windup), 40–100% at 1.5× (strike), via `AnimationUtils.subclip` | — (squash) | `Rat_Death` | `Rat_Jump` (hop back) |
| Pigeon S13 (crow, Coo uses S1) | `Flying_Idle` | `Fast_Flying` | `Headbutt` (dive and peck) | `HitReact` | `Death` | — |
| Spider | `Spider_Idle` | `Spider_Walk` | `Spider_Attack` | — (squash) | `Spider_Death` | `Spider_Jump` |
| KayKit S3 (hyena, stealer, pug, Brutus, Cacklejaw, Barkus, Tallbert) | `Idle` (2H holders: `2H_Melee_Idle`) | `Walking_A` / `Running_A` | hyena `1H_Melee_Attack_Slice_Horizontal`, lunge `1H_Melee_Attack_Stab`; pug bash `Block_Attack`, slam `2H_Melee_Attack_Chop`, chop `1H_Melee_Attack_Chop`; stealer snatch `Dodge_Forward` | `Hit_A` | `Death_A` | Gloat / Jeer `Cheer`; pug guard `Blocking` / `Block_Hit`; Barkus `2H_Melee_Attack_Slice`, `2H_Melee_Attack_Chop`, `2H_Melee_Attack_Spinning`, `Throw`, `Unarmed_Melee_Attack_Kick`, `Sit_Floor_Down`, `Sit_Floor_Idle`; kneel = `PickUp` clamped at its lowest frame [unverified look], fallback `Sit_Floor_Pose` |
| KayKit S15 (Boneheads) | `Idle_Combat` | `Walking_D_Skeletons` / `Running_C` | `1H_Melee_Attack_Chop`, `1H_Melee_Attack_Stab`, mage `Spellcast_Shoot` | `Hit_A` | `Death_C_Skeletons` | `Death_C_Skeletons_Resurrect`, `Spawn_Ground_Skeletons`, `Blocking`, `Block_Hit` |
| Dragon_Evolved S13 (Pudding) | `Flying_Idle` | `Fast_Flying` | `Headbutt` (roar lunge) | `HitReact` | `Death` (only as the "sleep" pose candidate) | `Yes`, `No` (nods) |
| Husky S9 [MVP+] | `Idle` | `Walk` / `Gallop` | `Idle_2_HeadLow` → `Attack` | `Idle_HitReact1` | `Death` | `Eating` (chewing bones) |

---

## 11. Bosses

### 11.1 Shared boss rules [MVP]
- **Arena:** a circular or causeway arena behind a fog wall (a mist-card ring plus a collider). A Vigil Stone sits at the door. The camera moves to 6.0 m.
- **Boss bar:** top centre, name in Cinzel Decorative, phase pips at the thresholds, a white chip-damage trail, and a thin gold **Dizzy** bar underneath.
- **Phase change:** emits `boss:phase`, 1.0 s of invulnerability and a bark. Phase thresholds fire exactly once (unit-tested).
- **Dizzy meter:**
  - It fills by **attack poise × 4 per hit**, **+35 per parry**, and **to full on a gold-glint parry or a lesson event** (the wheel hitting a pillar, a choke).
  - After 2.0 s with no gain it decays at 8/s.
  - **Full → Dizzy for 3.0 s:** stars circle the head and **every hit crits ×2**. Then it resets to 0.
  - Each boss has its own maximum.
- **Death and retry:** dying costs 1 life and restarts **the current phase** at full phase HP. Adds despawn.
- Every boss has one **lesson** (the environmental or verb test below).
- **Music:** `music/boss_epic_battle_loop.ogg`, snapping in within 0.3 s at the fog wall. On defeat: `music/victory_fanfare.mp3`.
- **Reward:** fish (per boss) and the story unlock.

### 11.2 B1: Captain Grizzlechop [MVP] (`forest`, the Cheese Mill)
- **Build:**
  - `Rat.glb` fitted to 1.6 m, with a procedural feathered hat (cone plus 3 feather cards).
  - Cheese-wheel shield: cylinder r 0.45, `#E8C35A`, on bone `FrontLeg.L`. Sabre: `weapons/quaternius/Sword_B.glb` on `FrontLeg.R` [bones verified].
  - The giant wheel he rides in phase 2: cylinder r 0.8, width 0.6, `#E8C35A` with holes.
- **Stats:** HP **450**, poise 12, Dizzy max **100**.
- **Arena:** mill yard circle r 12 (24 m). **6 millstone pillars**: cylinders r 0.8, 2.5 m tall, at radius 8, spaced 60° apart. The watermill (`env/town/watermill.glb` ×3) sits on the north edge.
- **Lesson:** *lure the wheel charge into a pillar* (stand in front of a pillar, roll at the last moment), and *hit him while he snacks*.

| Phase | HP | Moves | Events |
|---|---|---|---|
| **1 "En Garde"** | 100–60% | **Sabre Flurry**: 3 hits, windups 0.55 / 0.30 / 0.30, damage 1 / 1 / 2, range 2.0. **The third hit has a gold glint** (parry → Dizzy). **Cheese Wheel Toss**: raises the shield 0.8 s (white glint), then a 0.9 m wheel rolls at 7 m/s, bounces off the arena wall once, 2 damage. **Parrying the wheel breaks it:** "MY CHEESE!" and he staggers 3.0 s. | At 80%: "Squeak formation!" spawns 2 `rat_pike` |
| **2 "Wheel Ride"** | 60–25% | Jumps onto the giant wheel. **3 charge laps:** each lane (3 m wide, up to 24 m) is drawn as a dust-streak `aoe` lane filling over **1.0 s**, then he charges at 9 m/s for 2 damage (**red**). **If the lane ends at a millstone pillar: CRUNCH, the wheel cracks, he tumbles off, and Dizzy fills to max.** Otherwise he is dizzy 2.0 s (hits ×1.5) after the third lap. Repeats every 12 s with Sabre Flurry in between. | At phase start: 2 `rat_xbow` on the mill deck (y 2.0, reachable by stairs) |
| **3 "Cheese Rage"** | below 25% | Windups ×0.8. **Cheese Bomb barrage:** 5 circles r 1.6 around her, 1.0 s fill, 1 damage each. **Snack:** eats a wedge over 0.8 s, heals 30, at most once per 15 s. **A hit during the Snack makes him choke:** "*hrk*— wrong pipe!" and Dizzy fills to max. | — |
| **Defeat** | 0 | — | CS-05; Shard 1; +100 fish |

### 11.3 B2: Warchief Cacklejaw [MVP] (`gate`, on the causeway)
- **Build:**
  - `Barbarian.glb` fitted to 2.2 m. `buildBeastHead('hyena', {mane: true, chippedEar: 'left'})`. The `Barbarian_Hat` node stays visible (it hides the chipped ear until phase 3).
  - "HATER-IN-CHIEF" CanvasTexture plate on bone `chest`. `Skeleton_Blade.glb` ×1.6 on `handslot.r`.
- **Stats:** HP **700**, poise 15, Dizzy max **120**.
- **Arena:** the causeway between fog walls at z −10 and z +30 (40 × 12 m). Parapets 0.6 m; falling into the tidal water costs −1 HP and returns her to the causeway.
- **Lesson:** *punish the gloat*, *interrupt the laugh*, *parry the gold rush*, and *find the real one by its shadow*.
- **Gloat:** after any hit on her he laughs for 1.5 s; a hit chokes him: 2.0 s stagger, +10 Valor.

| Phase | HP | Moves | Events |
|---|---|---|---|
| **1 "The Roast"** | 100–60% | **Cackle Combo**: 2 hits, windups 0.6 / 0.35 (white), damage 2 / 2, range 2.4, arc ±1.2. **Laugh Quake**: throws his head back for 0.8 s (`jeer` rings), then a ring 0.3 m tall expands at 8 m/s out to 7 m, 2 damage; **jump it**. **Hitting his head during the 0.8 s windup chokes him:** "hrk— that's rude!", 2.0 s stagger, +10 Valor. | — |
| **2 "Ratio Rush"** | 60–30% | **Ratio Rush:** 3 dashes along the causeway at 12 m/s. Each lane is telegraphed 0.8 s, with a **gold glint on the blade**. **A parry makes him stumble for 2.5 s and fills Dizzy to max.** A normal block pushes her back 2 m and costs 2 Grit. 2 damage per dash. Cackle Combo in between. | At phase start: 2 `stealer`, once. They jeer together (Jeer Duet: aura r 10 for 3 s). |
| **3 "Who's Laughing Now"** | 30–0% | Fog 0.05 → 0.09 over 2 s. He splits into **himself plus 3 shadow clones** (dark material, `castShadow = false`, **no blob shadow**, poof in one hit, Cackle Combo at windups ×1.2). **Only the real one casts a blob shadow**, and the positional laughter comes from him. **Meow:** only the real one answers "WHAT?" and stops laughing for 2.0 s. Real-one windups ×0.85. Clones respawn (max 3) every 10 s. | — |
| **Defeat** | 0 | — | CS-09 (Shard 2, Golden Hour, Pudding rises); +120 fish |

### 11.4 Mini-boss: Sir Brutus [MVP] (`keep`, the Courtyard)
- **Build:** `Knight.glb` fitted to 1.9 m. `buildBeastHead('pug', {scar: true})` under `Knight_Helmet`. `2H_Sword` and `Rectangle_Shield` visible (the shield is slung on his back in phase 2).
- **Stats:** HP **400**, poise 12, Dizzy max **100**.
- **Arena:** the Courtyard, 40 × 30 m, with its ballistas already disabled.
- **Lesson:** *the duel of Stands*, the formal parry exam before Barkus.

| Phase | HP | Moves |
|---|---|---|
| **1 "Equals"** | 100–50% | **Overhead Chop:** **gold glint, 0.9 s** → 3 damage. A parry staggers him 2.0 s and fills Dizzy to max. **Wide Sweep:** white 0.7 s → 270° arc r 2.5, 2 damage (jump, roll or block). **Shoulder Charge:** red lane 0.8 s → 8 m/s, 2 damage. |
| **2 "Duel of Stands"** | 50–0% | He plants his sword in her pose. **3 exchanges:** he charges with a **gold glint (windup 1.0 s; parry window +0.05 s grace)**. **Each successful parry removes one third of phase 2's HP.** A missed parry costs her 2 damage and the exchange repeats after 2.0 s. Between exchanges he guards with his shield, so normal hits do ×0.5. |
| **Defeat** | 0 | D-05; the cellar gate opens; +50 fish; **Even More Too Big** skin unlocks (§13.4) |

### 11.5 B3: Lord Barkus Grimjaw, the Dog Warlord [MVP] (`keep`, the Bell-Tower Roof)
- **Build** (scope draft, art.md §11):
  - `Knight.glb` fitted to 3.0 m. `buildBeastHead('bulldog', {jowls, underbite, eyepatch, hornedHelm})`.
  - `Knight_Cape` tinted `#22242A`. Procedural spiked collar holding **Shard 3** (an emissive gold octahedron, 0.15 m).
  - Cleaver: `weapons/quaternius/Claymore.glb` scaled to 2.2 m long on `handslot.r`, with a red-hot emissive edge `#FF3B30` that ramps during windups.
- **Stats:** HP **1500**, poise 25 / 25 / 20 by phase, Dizzy max **200**.
- **Arena:** round roof r 10 at y 22, crenellations 1.0 m (Octree). 4 braziers (`env/graveyard/fire-basket.glb`) at r 8, `loop_rain`, storm env. The rampart walkway ring below (r 14 around the roof centre, y 18; the same height as the top of the Rampart Climb) holds the anchors `rampart_0..27` for CS-15, spaced evenly (12.9° apart), each facing the roof.
- **Lesson:** *three perfect parries in a row knock the shard loose*.

| Phase | HP | Moves | Events |
|---|---|---|---|
| **1 "Iron Jaw"** | 100–65% | **Cleaver Combo:** Sweep (white 0.6 s, 3 damage, range 3.2, arc ±1.4) → Back-sweep (white 0.4 s, 3 damage) → **Overhead Slam** (red 0.9 s, 4 damage, plus a crack line 4 m forward that lingers 0.5 s for 1 damage). **Big Bark:** chest puff 0.5 s, then an `aoe` cone of 70° and 8 m: 1 damage, knockback 10; cancels charges. **Bone-merang:** a dotted out-and-back path (`aim`), 2 damage; **a parry sends it back for 30 damage and +30 Dizzy**. **Back Kick** (she's behind him within 2 m): white 0.4 s, 1 damage, knockback 8. | Bark: "This is MY fog now!" |
| **2 "Call the Pack"** | 65–35% | 2 s beat: **his helm shatters** and his brows go furious. **Howl** (1.2 s, `Cheer` clip plus `creature/c80_howl`): summons **2 `pug` + 2 `bone_minion`** at the phase start and again at 50%. **Spin to Win:** crouch 0.9 s with a red ring r 2.8, then spins 2.5 s at 2 damage per 0.5 s tick, then is **dizzy 1.5 s**. **Bone Toss:** 3 bouncing bones at 9 m/s, 1 damage each, **reflectable** (15 each). | "My HELMET? ...LADS! HERE, BOY! ALL OF YOU!" |
| **3 "The Last Light"** | 35–10% | He tears **Shard 3** from his collar and chains it to the cleaver. **Shard Slam**: one every 6 s, **gold glint 0.8 s**, 2 damage on a hit. The music drops to wind and heartbeat during each glint. **Each perfect parry cracks the chain (1/3, 2/3, 3/3).** A block chips 1 damage and makes no progress. Between slams he uses phase-1 moves at windups ×0.85. **His HP can't drop below 10% until the third parry.** After the third: **the shard flies into her sword, Valor → 100, Barkus Dizzy 5 s.** | Barks per parry: "WHAT?" / "STOP THAT!" / "MY ROCK!" |
| **Rally** | ≤ 10% with the shard freed | **CS-15** (interactive Final Stand), then **CS-16**. It cannot be failed. If his HP is already at the 10% floor when the third parry frees the shard, CS-15 starts on her first hit during the 5 s Dizzy, or when the Dizzy ends, whichever comes first. | — |

On Kitten difficulty, blocks count as perfect parries in phase 3.

### 11.6 B4: Slime Sovereign [MVP+] (`bog`, the Sovereign Pool)
- **Build:** a procedural slime 4 m across with `props/Crown.glb` on top and the `Knight_Helmet` node from `Knight.glb` floating inside.
- **Stats:** HP 300 → splits into **2 × 150** (2.8 m) → each splits into **2 × 60** (1.8 m). Dizzy max 80 for each body.
- **Moves:**
  - **Belly Flop:** sinks 0.9 s (`aoe` circle at her position) → shockwave r 3, 2 damage.
  - **Arena Splash:** sinks and swells 1.5 s → a 0.4 m wave crosses the arena for 2 damage; jump it or Stand.
  - **Spit:** 2 `jelly_s`.
  - `bright`, `holy` and `holyWave` hits on a body **skip its next split**: it pops into tiny happy slimes.
- **Defeat:** the last body shrinks to a tiny slime still wearing the crown: "...blorp." It hops away.
- **Reward:** the crown drops Heart Bell #3, +100 fish. In the MVP the bell sits on top of the sunken tower instead.
- **MVP fallback:** an elite slime wave (§12.7, zone `pool`).


---

## 12. Levels

### 12.1 Shared level rules [MVP]
- **Format.** Every level is `src/world/levels/<id>.js` exporting `defineLevel({...})` (Appendix B). The shared `world/LevelKit.js` turns it into tech.md's `LevelData`. It:
  - builds a heightfield (seeded noise, amplitude per level) and **carves the spine path flat** (`pathWidth`, smoothed over 3 m), carving arena discs flat out to r + 2 m;
  - scatters props with `ctx.rng` (seeded), keeping away from the path, the arenas and each other (`minDist`);
  - instances any prop used 10 or more times, and generates colliders from per-model footprints (§18.1);
  - builds grass chunks (32 m tiles, tech.md §12.2), triggers, spawns and anchors.
- **Coordinates** are in metres: +X east, +Z north, heightfield centred on (0, 0). `y` is height above the local ground unless a row says otherwise. The spine is given as `[x, z]` points.
- **Arena template** (`world/Arena.js`):
  1. **Enter:** a trigger disc (r − 2) emits `arena:lock {id}`. A fog wall rises: mist cards every 1.5 m on a ring at r, plus a collider circle.
  2. Combat music starts.
  3. **Waves:** the next wave starts 1.5 s after alive ≤ 1. Enemies spawn at the 3 of 6 ring points (r − 1.5) farthest from the player, with the `Spawn` poof (Boneheads use `Spawn_Ground_Skeletons`). Each wave emits `arena:wave`.
  4. Ring spawn points over deep water (`physics.isDeepWater`), outside the bounds or inside a static collider are skipped.
  5. **Clear:** emits `arena:clear`. The fog wall dissolves over 1.5 s, `jingles/jingles_STEEL00` plays, and explore music returns 4 s after the last kill.
  6. **Death inside an arena** resets it to wave 1.
  7. **Rectangular arenas** (`size: [w, d]` instead of `r`; the keep Courtyard and the Cacklejaw causeway): the trigger is the rectangle inset 2 m; the fog wall is mist cards every 1.5 m along the four edges plus 4 box colliders (edges over deep water get only the cards); the 6 spawn points are the 4 corners and the 2 midpoints of the long sides, each inset 1.5 m. The rest of the template is unchanged.
- **Open fights** (non-arena): `enemySpawns` with `patrolRadius` and leash (§10.2).
- **Vigil Stones** (§7.6): `kind: 'checkpoint'`. Ids `vigil_1..n`.
- **Lost kittens:** `kind: 'kitten'` with `hide`:
  - `meow` (hidden until a Meow within 10 m; a barrel or bush wobbles every 6 s as a hint);
  - `cage` (3 hits to open);
  - `stand` (appears after a 3 s planted Stand in the zone);
  - `break` (behind a cracked boulder);
  - `climb` (in plain view, hard to reach).
- **Pickups:**
  - fish: silver = 1, gold = 10, magnetised from 2 m;
  - crates and barrels: one hit, 1–3 fish (`world/wood_breaking_0x`);
  - Lost Letters: a parchment with a pink seal, r 0.5;
  - Heart Bells: a small gold bell with a pink ribbon on a pedestal;
  - milk bottles: crates only, about 2 per level.
- **Level bounds:** a mist-card wall at the heightfield edge, plus `physics.clampToBounds`.
- **`fog_edge` anchors** (Post Stealer escape targets): LevelKit generates `fog_edge_0..7` on the bounds, inset 6 m, at 45° steps. Inside a locked arena the stealer instead runs to the nearest point of the fog wall ring. It despawns with the loot when it reaches the target or after 8 s.
- **Spawn ids:** every level defines `start`. Every level with a boss (or the `bog` pool fight) also defines **`boss`** at its boss-door Vigil Stone (used by retries after a game over at the boss and by smoke step 8): `forest` (−10,70), `gate` (5,+20), `bog` (−6,64), `keep` (−3,36, y 18). Other ids are listed per level.
- **Exits:** a trigger box emits `level:exit {to, spawnId}`, sets flag `<levelId>.done`, then the results screen, then the next level or the hub. Levels that end in a cutscene (`town` CS-07, `gate` CS-10, `bog` CS-12, `keep` CS-16) set the flag in that cutscene's `end` and show results before the `load`.
- **The hub's way out:** after `town.free` the next level is started from the Quest Board ("Next: {chapter}") or by walking out of the South Gate (trigger box (0,−63), 8 × 2, active only after `town.free`; hub arrivals use spawn `hub`, inside the walls), which opens the Quest Board panel.

### 12.2 Env presets per level (`world/Env.js`; art.md §12 values)

| Preset | Fog colour / density | Sky top → horizon | Hemi sky / ground | Sun | Extras |
|---|---|---|---|---|---|
| `meadow_day` | `#B7C0C3` / 0.045 | `#C3CCD3` → `#B7C0C3` | `#D5DDE3` / `#4A5230` | `#FFF2E0` × 1.4 | grass 30k (Med), dandelion fluff, mist cards; HDRI `overcast_soil_puresky_1k.hdr` optional |
| `forest_day` / `forest_night` | `#8E9E8A` / 0.06 → `#3E4A3E` / 0.055 | `#A9B7A9` → `#8E9E8A` | `#B9C7B0` / `#2C3A24` | `#FFE7B8` × 1.8 / moon `#BFD3FF` × 0.5 | fireflies `#E8FF9A`; god rays [MVP+]; ground `textures/ground037` |
| `town_occupied` / `hub_gold` / `hub_grey` / `ending_gold` | `#A9A898` / 0.04; then §5.3 | `#E9D9C0` → `#C9D3DA` | `#F0E6D6` / `#5A4A36` | `#FFD9A8` × 1.4–2.0 | cobbles `textures/pavingstones070`; HDRI `meadow_2_1k.hdr` |
| `gate_dusk` | `#9AA196` / 0.05 | `#B8AFA8` → `#9AA196` | `#C9C2BA` / `#3A3A30` | `#FFB070` × 1.0, low | 2 wall torches `#FF8A3D`; 40-instance horde; `textures/bricks076c` |
| `bog` | `#8F9A84` / 0.07, height fog falloff 1.2 | `#9DA595` → `#8F9A84` | `#AEB8A2` / `#2A3324` | `#E8E6C8` × 1.0 | water (§18.3), will-o'-wisps `#9FFFCB`, `world/loop_water_01`; `textures/planks012` |
| `keep_storm` / `keep_cellar` | `#4B3F42` / 0.05 / 0.03 | `#2E2A33` → `#6B3A30` | `#6B5E66` / `#1E1A1A` × 0.6 | none; braziers `#FF8A3D` (2 nearest point lights) | embers `#FF7A3D`, lightning flash every 8–14 s (hemi × 2.5 for 0.15 s), `world/loop_rain` |

**The `Env` controller is the single owner of scene fog, sky, sun, wind and grade.** The final fog density is computed as:

`(preset density × storyMul) + Σ contributions`, clamped to 0.005–0.12.

Contributions:
- Jeer auras: +0.01 each, at most +0.03.
- Town lanterns: −0.005 each.
- Golden Hour: ×0.5 on the total.
- Cacklejaw phase 3: an override to 0.09.
- Cutscene `env` steps.

Everything tweens over `dur`. It emits `env:changed`.

### 12.3 L1 `meadow`: Purrdale Meadows (prologue + Ch. 1) [MVP]
- **Size:** heightfield 200 × 200 m, res 200, seed 11, hills amplitude 1.5 m. `pathWidth` 6. **This level is the reference image** [REF ref2].
- **Spine:** (0,−80) practice field → (0,−62) field north gate → (−6,−50) lane → (−22,−30) crossroads → (−20,−4) Standing Stones → (2,18) Picnic Glade → (24,40) Crow Fields → (30,62) Old Bridge → (30,90) exit.
- **Env:** `meadow_evening` (CS-01) → `meadow_night` (prologue) → `meadow_day` (after CS-02).
- **Music:** prologue `village_bards_tale`, then silence and wind. Chapter: explore `field_of_dreams`, arenas `battle_fast_fight_loop`.
- **Play time:** prologue about 6 min; chapter about 10 min.

| Zone | Kind | Centre / size | Content and spawns | Triggers |
|---|---|---|---|---|
| `practice` | setpiece (prologue) | (0,−80), 40 × 40 fenced (`env/nature/fence_simple` fitted to **1.5 m**, too tall to jump, so the prologue stays in the field) with one gap at (0,−60) closed by a procedural wooden gate until `prologue.tutorial` | Armoury barn `env/village-kaykit/buildings/building_home_A_red` fitted to 5 m at (−14,−92). Windmill `building_windmill_red` fitted to 9 m at (16,−95). Height-chart board (procedural 1.6 × 0.8 m plank, painted line at 1.05 m) at (−6,−66). 3 straw dummies `env/village-kaykit/decoration/target` fitted to 1.0 m at (−5,−76), (0,−76), (5,−76). Swinging sack (procedural) at (8,−84), 2.0 s period. Wobble Knight dummy (procedural spring dummy, swings every 2.0 s with a white glint) at (0,−86). Cracked boulder `env/nature/rock_largeA` fitted to 1.2 m at (−10,−84). **Sleeping cow** `creatures/animals/Cow.glb` fitted to h 1.6 at (12,−72), clip `Idle_Headlow` [verified]; Pearl hides behind it (tutorial step 8; not a lost kitten). **Sir Tallbert** statue at (4,−57), facing −Z, beside the lane so it never blocks the path. Inner fence for the jump lesson (`fence_simple` fitted to 1.0 m): z = −87 from x −20 to −2. **Far dressing (always, every phase):** the Pawsbury skyline, `building_tower_A_red` fitted to 30 m (forced perspective) **outside the bounds** at (−130,−20) with its top at anchor `bell_far` (y 30), plus `building_castle_red` fitted to 20 m at (−140,−6). Both use `fog: false` with a flat colour 70% of the way to the current fog colour, so they read as a faint silhouette at any fog density. A warm `#FFC46B` emissive sprite (`fog: false`) at `bell_far` is the Dawnstone glow; it goes out in CS-02 shot 2 and stays out. | Spawns `title` (0,−64) and `practice` (−10,−90, facing +Z). Tutorial prompt zones per step (§5.4). `tallbert` disc r 2.5 at (0,−61): G-01, once, when `prologue.tutorial` is set. `lane` disc r 3 at (−6,−52): CS-02, when `prologue.tutorial` is set. |
| `crossroads` | open | (−22,−30) r 10 | 4 empty signposts (posts only). Drystone walls `env/graveyard/stone-wall` 1.2 m along the roads. Patrol 2 `rat_pike` at (−14,−42) r 4. Group of 2 `rat_pike` + 1 `rat_xbow` (on a wall top, y 1.2) at (−24,−32). Breadcrumb letters (6 cosmetic decals) along the spine. | Spawn `start` (−4,−58, facing +Z). `vigil_1` at (−16,−36). |
| `stones` | arena r 12 | (−20,−4) | 8 standing stones `env/nature/stone_tallA..H` fitted to 3.0 m at radius 10, every 45°. W1: 3 `rat_pike`. W2: 3 `rat_pike` + 1 `rat_xbow`. | Secret: a 3 s planted Stand within r 1.2 of the centre, with no enemy alive, makes Button appear (`hide: 'stand'`). `vigil_2` at (−12,8). |
| `glade` | setpiece + arena r 14 | (2,18) | Picnic hay bale `env/graveyard/hay-bale` at (0,16) (interact). Pudding (`Dragon_Evolved`, fitted to 6.0 m long; a static collider circle r 2.5 while netted) at (2,24) under a procedural net, pegged to **3 rope posts** (30 HP each, player hits only) at (−2,24), (6,24), (2,28). After CS-03: W1 4 `rat_pike`; W2 3 `rat_pike` + 1 `rat_xbow`. | `picnic` interact: CS-03. Objective done when ropes = 3/3 and the waves are clear. Pudding perch anchors `pud_1` (20,36), `pud_2` (36,50), `pud_3` (40,72), `pud_4` (22,84). |
| `crowfields` | open | (24,40), 50 × 40 | Wheat `env/nature/crops_wheatStageB` (~600 instances, 1.0 m), 4 hay bales. 4 `crow` circling (24,40) at r 8. 2 `rat_xbow` on hay bales (y 1.0) at (16,46) and (32,34). A second **sleeping cow** (`Cow.glb`, h 1.6, `Idle_Headlow`) at (40,30), facing −X; Biscuit hides behind it. | `tut.pounce` on the first crow alert; `tut.reflect` on the first bolt |
| `bridge` | arena r 12 | (30,70); stream along z = 62 ± 4 (deep water, y −0.4) | Old Bridge `env/castle/bridge-straight` (+ `bridge-straight-pillar`) fitted to 10 m long × 4 m wide at x = 30 spanning z 57–67. Rat cage cart `env/town/cart-high` fitted to 2.0 m plus procedural bars at (30,74), **Mochi inside**. W1: 3 `rat_pike` + 1 `rat_xbow`. W2: 3 `rat_pike` + 2 `rat_xbow`. W3: 4 `rat_pike` + 2 `crow`. Mochi barks from the cage during the waves. | `vigil_3` at (28,52). After the clear: cage lock (30 HP) → D-01. Exit box (30,92), 8 × 2 → `forest` / `start`. |

- **Collectibles:**
  - Kittens (all findable only after CS-02): Biscuit (41.5,30) `meow` behind the Crow Fields cow; Noodle (−30,−26) `meow` in a barrel; Button (−20,−4) `stand`.
  - Letter #1 at (−18,−24).
  - Fish about 180 (enemies about 90, 12 crates about 24, fish lines about 66).
- **Enemy totals:** 27 `rat_pike`, 8 `rat_xbow`, 6 `crow`.

### 12.4 L2 `forest`: Whiskerwood (Ch. 2) [MVP]
- **Size:** 200 × 200, res 200, seed 23, hills amplitude 3.0 m. `pathWidth` 5.
- **Trees:** giant oaks (`env/nature/tree_oak`, `tree_fat`, `tree_detailed` fitted to 12–18 m) and mushrooms (`mushroom_redTall`, `mushroom_redGroup`, `mushroom_tanTall` fitted to 2–6 m). Scatter 120 trees and 80 mushrooms.
- **Spine:** (0,−85) Forest Gate → (−20,−58) Mushroom Ring → (−10,−30) Spider Hollow → (18,−8) Treetop → (24,18) Stump Crossing → (6,40) Lantern Camp → (−14,60) Rat Camp → (−10,84) Cheese Mill.
- **Env:** `forest_day`; `forest_night` from CS-04 on.
- **Music:** day `field_of_dreams`; night `dark_forest_creepy` at volume 0.6 [audition; fallback `field_of_dreams`]; arenas `battle_fast_fight_loop`; boss `boss_epic_battle_loop`.
- **Play time:** about 14 min.

| Zone | Kind | Centre / size | Content and spawns | Triggers |
|---|---|---|---|---|
| `gate` | open | (0,−85) | Giant oak arch (2 × `tree_oak` fitted to 14 m). Patrol 2 `rat_pike` at (−6,−70) r 4. | Spawn `start` (0,−92, facing +Z). `vigil_1` at (0,−78). |
| `mushrooms` | platforming | (−20,−58) r 15 | 5 mushroom caps as platforms (Octree discs, r 1.2) in a spiral at heights 1.0 / 2.0 / 3.0 / 4.0 / 5.2 m, about 2.5 m apart. Caps 2 and 4 are `bounce` (vy 9). Mushroom house (`mushroom_tanTall` fitted to 4 m plus a door) at (−12,−52). Patrol 2 `rat_pike`. | **Heart Bell #1** on cap 5 at (−24,−62), y 5.2 |
| `hollow` | arena r 12 | (−10,−30) | 6 web patches (decals r 1.0). W1: 3 `spider`. W2: 3 `spider` + 2 `rat_pike`. Cracked boulder `rock_largeA` fitted to 1.8 m (only `bright` or `holy` break it) at (−22,−26), blocking a nook. | `vigil_2` at (2,−20) |
| `treetop` | open | (18,−8) | Giant oak `tree_fat` fitted to 16 m at (18,−4). A cage hangs at y 4 on a rope through **3 rope posts** (30 HP each) at (13,−8), (23,−8), (18,−13). Guards: 2 `rat_xbow` on root ledges (y 1.5), 2 `crow`, 2 `rat_pike`. | 3/3 posts cut → the cage lowers over 2 s → D-02 (Sage) |
| `stream` | platforming | (24,18); deep stream along z 13–23 | 6 stumps (`stump_round` fitted to h 0.6, r 0.8) at (20,12.5) → (22,15) → (25,16.5) → (23,19) → (26,21) → (24,23.5); gaps ≤ 3.0 m (jump reach about 3.7 m). Safe alternative: a fallen `log_large` bridge at x 40. | Letter #2 on stump 4 (23,19) |
| `camp` | setpiece | (6,40) r 10 | `campfire_logs` at (6,40); `tent_detailedOpen` at (10,44); Pudding sleep anchor (6,48) facing −Z. | `camp` disc r 6: CS-04; `vigil_3` at (2,36), set active by CS-04 |
| `ratcamp` | arena r 14 | (−14,60) | 6 `env/dungeon-kaykit/torch_lit` (emissive; 2 point lights), 3 `tent_smallOpen`, crates. W1: 4 `rat_pike` + 1 `rat_xbow`. W2: 3 `rat_pike` + 2 `rat_xbow` + 2 `spider`. W3: 4 `rat_pike` + 2 `crow`. | Sprout in a tent cage at (−22,66) (`cage`) |
| `mill` | boss arena r 12 | (−10,84) | Watermill `env/town/watermill` (+ `wheel`) fitted to 8 m at (−10,97). 6 millstone pillars at radius 8. Mill deck (y 2.0, stairs) on the north edge. | `vigil_4` at (−10,70) (boss door). B1 (§11.2) → CS-05. Exit box (−24,94) → `town` / `start`. |

- **Collectibles:**
  - Kittens: Pickles (−12,−52) `meow`; Pebble (−22,−26) `break`; Sprout (−22,66) `cage`.
  - Letter #2; Heart Bell #1.
  - Fish about 250, including 100 from the boss.
- **Enemy totals:** 19 `rat_pike` (+2 summoned by the boss), 5 `rat_xbow` (+2 boss), 8 `spider`, 4 `crow`.

### 12.5 L3 `town`: Pawsbury (Ch. 3, then the hub) [MVP]
- **Size:** 140 × 140, res 140, seed 31, nearly flat (amplitude 0.4 m). Streets are cobbles (`pavingstones070`), `pathWidth` 6.
- **Town wall:** a ring at r 60 (`env/castle/wall`, towers). South Gate (`env/castle/gate`) at (0,−60). The Low Gate road leads south from (0,−66).
- **Buildings:** `env/village-kaykit/buildings/*` fitted to 6–9 m (homes A/B red and blue, `building_tavern_red`, `building_blacksmith_red`, `building_market_red` and `_blue`, `building_church_blue`, `building_well_red`, `building_castle_red` fitted to 18 m at (0,62)). Bell Tower: `building_tower_A_red` fitted to 16 m at (0,54), with a procedural Lathe **Sunbell** (r 1.0) in the top.
- **Dressing:** `env/town/fountain-round`, `stall-red`, `stall-green`, `lantern`, `banner-red`, `hedge`, `fence`, `cart`.
- **Env:** `town_occupied` → `hub_gold` (flag `town.free`) → `hub_grey` (`gate.done`) → `ending_gold` (`ending.seen`).
- **Music:** occupied `village_town_theme`, arenas `battle_fast_fight_loop`, hub `village_bards_tale` (gold), `story_lament_warriors_soul` (grey), `tavern_old_tower_inn` within 8 m of the bakery.
- **Play time:** about 12 min.

| Zone | Kind | Centre / size | Content and spawns | Triggers |
|---|---|---|---|---|
| `southgate` | open | (0,−55) | 3 `rat_pike` at (0,−48) | Spawn `start` (0,−66, facing +Z). `vigil_1` at (−5,−50). |
| `alley` | objective | (0,−34), 8 × 14 | **3 lanterns** `env/town/lantern` fitted to 2.2 m at (−3,−40), (3,−34), (−3,−28). Interact to light one: Env lantern −0.005 each; a warm point light (only the nearest 2 are active). Patrol 2 `rat_pike`. Balcony at (5,−30), y 3.0, reached by `crate_A_big` steps at 1.0 / 2.0 / 3.0 m. | Objective "Light the lanterns 0/3". Waffles on the balcony (`climb`). |
| `bakery` | open, then chase | (−20,−18) | Marmalade's bakery (`building_home_B_red` fitted to 6 m with a procedural bread sign) at (−26,−20). 3 `stealer` + 2 `rat_pike`. After the clear: D-03, then **the Pilfer chase**. Pilfer runs anchors `chase_0..5`: (−20,−12) → (−34,−14) → (−46,−4) → (−44,12) → (−30,16) → (−36,4), about 70 m at 6.0 m/s. He drops crates (obstacles) and cosmetic letters. **3 hits** (each stumbles him 0.6 s) make him drop the bag. Falling more than 25 m behind fades and restarts the chase at `chase_0`; no life is lost. | On the bag drop: CS-06 at the Post Office (`building_market_blue` fitted to 7 m, mail sign) at (−36,4) |
| `forge` | arena-lite r 10 | (22,−6) | `building_blacksmith_red` fitted to 7 m at (30,−10). W1: 2 `pug` + 2 `rat_pike`. Toast on the first pug: "Shields block from the front. Bright Slash it, or go around." Barrel stack (6 × `barrel`) at (18,−14): the 3rd barrel hides Tofu. | D-04 Tofu. Letter #3 at (28,−2). |
| `square` | arena r 15 | (0,8) | `fountain-round` fitted to r 3 at the centre, with a procedural cat statue (top y 2.5). Stocks (procedural) at (10,14) holding Clover. W1: 4 `rat_pike`. W2: 2 `pug` + 2 `rat_pike`. W3: 3 `stealer` + 2 `rat_pike`. W4: 2 `pug` + 2 `rat_xbow` + 2 `crow`. Then **`jelly_giant`** (Gloomjelly L variant, h 1.6, HP 120, splits into 2 `jelly_m`) rises from the fountain. | `vigil_2` at (−8,0) before the arena. Jelly popped: D-04 Earl Grey. Stocks interact: D-04 Clover. Toffee on the statue top (`climb`: fountain rim 0.6 → statue base 1.6 → top 2.5). |
| `steps` | setpiece | (0,38) | Castle Steps; Snowpaw and Marmalade appear in CS-07 | Disc `steps` r 5 at (0,34), active after `square` is clear and Clover is free: CS-07. Muffin on the Bell Tower's **outside loft ledge** (Octree box 2.5 × 1.5 m) at (0,50.5), y 6, reached by 3 flights of `env/town/stairs-wood` (fitted to 2.0 m rise each) up the tower's south face (`climb`; no interior). |

**Extra town spawns:** `hub` (0,−46, facing +Z; every hub arrival and "Return to Pawsbury"), `bakery_cot` (−22,−20, yaw −π/2, facing the bakery; CS-10), `belltower` (0,50.5, y 14, facing +Z, on a procedural bell platform disc r 2.5 around the Sunbell; CS-16 shot 5).

**Hub mode** (flag `town.free`): enemies are removed and these stations open (§13).

| Station | Who | Where | Opens |
|---|---|---|---|
| Bakery | Marmalade (in bed after L4: a "help yourself" jar) | (−26,−20) | `town.free` |
| Forge | Tofu | (30,−10) | `town.free` |
| Library | Earl Grey | (−20,24), `building_church_blue` | `town.free` |
| Barracks banner (companion swap) | — | (8,−2) | `town.free` |
| **Quest Board** (level select and replays; exit to the next level) | — | (0,−52) by the South Gate | `town.free` |
| Hub Vigil Stone (save) | — | (−5,−50) | always |
| Lookout | Pip | (20,30), `building_tower_A_blue` | `gate.done` |
| Wardrobe | Pearl | (−12,30), stall | `bog.done` |
| Princess Snowpaw | — | (0,40) | `town.free` |
| Coo | — | Post Office (−36,4) | `ending.seen` (Coo is away delivering the summons until the ending) |

**Kitten activity spots:** each rescued kitten appears at its spot. Villagers fill the rest, up to 20 on screen, with sheen-fallback fur.

| Kitten | Spot | Behaviour |
|---|---|---|
| Biscuit | (3.5,8) fountain rim | fishing with a stick (idle bob) |
| Noodle | (−4,−36) Lantern Alley fence | sitting, tail swish |
| Button | (0,36) castle steps | copies the Vigil pose when Swordcat is within 4 m |
| Pickles | (−24,−16) bakery | napping in a bread basket |
| Pebble | (−3.5,8) fountain rim | fishing |
| Sprout | (14,20) tavern patio | knocks a cup off the table every 20 s |
| Waffles | (5,−30), y 3 balcony | waving |
| Toffee | (0,8), y 2.5 statue top | "guarding" |
| Muffin | (0,50.5), y 6 bell-tower loft ledge | staring up at the bell |
| Tater | square loop r 8 | playing tag with Mittens |
| Mittens | square loop r 8 | playing tag with Tater |
| Socks | (2,36) castle steps | sunbeam nap |
| Juniper | (−10,26) library | reading upside down |
| Bramble | (12,14) | chasing a butterfly (Points sprite) on a 3 m loop |
| Fennel | (−2,36) castle steps | sunbeam nap |
| Bean | (28,−12) forge | handing Tofu tools |
| Crumpet | (−34,6) Post Office | sorting letters with Coo |
| Dumpling | (8,−2) barracks banner | "guarding" the banner |

- **Collectibles:**
  - Kittens: Waffles (5,−30, y 3), Toffee (0,8, y 2.5), Muffin (0,50.5, y 6).
  - Letter #3.
  - Fish about 250.
- **Enemy totals:** 17 `rat_pike`, 6 `pug`, 6 `stealer`, 2 `rat_xbow`, 2 `crow`, 1 `jelly_giant` (+2 `jelly_m`, +4 `jelly_s`).

### 12.6 L4 `gate`: The Low Gate, "The Line" (Ch. 4) [MVP, never cut]
- **Size:** 180 × 180, res 120, seed 41. Mostly tidal water: a water plane at y −1.2 covers |x| > 6. Shore ground (y 0) for z < −60 (the Old Battlefield) and z > +52 (the gatehouse yard).
- **The causeway:** a procedural Octree box 12 m wide (x −6..+6), deck y 0, from z +45 to z −60 (105 m), textured `bricks076c`.
  - Parapets: 0.6 × 0.4 m boxes along both edges, with gaps every 20 m. Dressed underneath with `env/castle/bridge-straight-pillar` every 10 m.
  - **It narrows to 8 m** between two flanking towers (`env/castle/tower-square`, fitted to 10 m, on piers at x ±8, z +8). **The Line marker** (a painted chalk line decal) is at z +10.
  - Falling off: splash, −1 HP, back onto the causeway.
- **Gatehouse:** `env/castle/gate` + 2 × `tower-square` + `wall` pieces fitted to 8 m tall, at z +45..+52. Portcullis `env/castle/metal-gate` in the arch. **The winch** (procedural drum and crank, 1.2 m) at (0,+41), **winch zone r 4**. Earl Grey and Pip work it as scripted, invulnerable actors.
- **Old Battlefield (south shore):**
  - Siege wrecks `siege-tower-demolished`, `siege-catapult-demolished`, `siege-ram-demolished`, `env/graveyard/debris`, `debris-wood`.
  - Hyena war-wagon (`env/town/cart-high` fitted to 2.2 m plus bars) at (6,−80).
  - Stairs (`env/castle/stairs-stone`) down from the causeway at (6,−52) to a ledge at y −0.8.
- **Background:** the horde, 40 `fx/Horde` silhouettes, in the fog bank at z −58 to −75.
- **Hyena ballista raft** (scenery; it fires only in G-02): procedural planks 4 × 3 m + `env/castle/siege-ballista` fitted to 2.5 m, moored in the tidal water at (−16,−4), bobbing 0.1 m at 0.3 Hz, aimed north-east. Anchor `ballista_raft` = the ballista's muzzle (−16,−4, y 1.2).
- **Where this is:** the Low Gate is Pawsbury's outer gatehouse at the end of the south road, beyond the town's inner South Gate (§12.5). The yard at z > +52 faces north toward town; the causeway runs south.
- **Env:** `gate_dusk`.
- **Music:** explore `village_town_theme` (low) → Line waves `battle_theme_a` → boss `boss_epic_battle_loop`.
- **Play time:** about 14 min.

**Sequence**
1. **Yard** (0,+57). Spawn `start` (0,+58) facing −Z. `vigil_1` at (−4,+56). In-level dialogue (no letterbox):
   - **Marmalade:** "The Snickerpack's coming up the south road. And the portcullis winch is jammed. Some hyena pinched the pin."
   - **Earl Grey:** "I can fashion a new pin. Give me four minutes, and nobody near the winch."
   - **Clem:** "Four minutes. Nobody near the winch."
   - **Marmalade:** "Scout the old battlefield first. They keep cages on a wagon there."
2. **Old Battlefield** (0,−72), open, r 18.
   - Skirmish S1: 3 `hyena` at (−8,−66). Skirmish S2: 2 `hyena` + 2 `rat_xbow` at (10,−78). `tut.jeer` on the first Jeer.
   - Strike the war-wagon cage (3 hits): **D-06** frees Pip, Tater and Mittens.
   - `vigil_3` at (−4,−56), at the top of the causeway stairs (so deaths here don't send her back 115 m to the yard).
   - Letter #4 at (−14,−80). Under the stairs at (6,−52, y −0.8): **Heart Bell #2** and Socks.
   - When S1 and S2 are clear: a far horn (`creature/c80_howl` at rate 0.8) and the toast "Back to the Line!". Disc r 3 at (0,+10) starts **The Line**.
3. **The Line** (objective `line`, `tut.line`).
   - Repair runs 0 → 100% at **100/240 % per s** (4 minutes). **It pauses while any enemy is within 4 m (horizontal) of the winch (0,+41).**
   - HUD: "Gate repair {p}%" plus a bar. On entry `vigil_2` at (5,+20) auto-activates. **Dying during the Line keeps the progress** and resets only the current wave.
   - Spawn lanes: z −58 at x ∈ {−4, 0, 4}. Enemies march north.
   - **Runners** (`objectiveRunner: true`) path straight for the winch and fight only if she's within 3 m of them.

   | Trigger | Spawns | Script |
   |---|---|---|
   | 0% | **W1:** 4 `hyena` (1 runner) | — |
   | 20% | **W2:** 3 `hyena`, 2 `stealer` (both runners) | The first stealer to reach the winch is **Pilfer**: "It's a post! Technically!" Repair **freezes**. A hit makes him drop the pin and repair resumes. If he escapes (8 s), Pip runs it back when W2 is clear: "Stole it back. You're welcome." (5 s), and repair resumes. |
   | 45% | **W3:** 3 `hyena` (1 runner), 2 `rat_xbow`, 3 `crow` | — |
   | 70% | **CS-08** (waits for ≤ 2 alive and no active telegraph, at most 10 s, then despawns the leftovers) | Pull-back, Spoon Brigade on |
   | after CS-08 | **W4:** 6 `hyena` (2 runners), 1 `pug` | Spoon Brigade throws (§9.3) |
   | 85% | **G-02** | Marmalade's Leap |
   | after W4, until 100% | trickle: 2 `hyena` (1 runner) every 15 s | — |
   | 100% | portcullis test (`world/metal_open_01`, `metal_close_01`) | **Mochi:** "The gate works! Come inside, Clem!" **Clem:** "Not yet." Cacklejaw steps out of the fog. |

4. **B2 Cacklejaw** on the causeway (§11.3), a rectangular arena (§12.1 step 7). Fog walls at z −10 and z +30. Spoon Brigade active. `vigil_2` re-saves at boss start.
5. CS-09 → CS-10 → load `town` spawn `hub` (`hub_grey`).

- **Collectibles:**
  - Kittens: Tater and Mittens (wagon, `cage`); Socks (under the stairs, `climb`).
  - Letter #4; Heart Bell #2.
  - Fish about 300, including 120 from the boss.
- **Enemy totals:** about 25 `hyena`, 2 `stealer` (+2 boss), 4 `rat_xbow`, 3 `crow`, 1 `pug`.

### 12.7 L5 `bog`: Bogmire (Ch. 5) [MVP]
- **Size:** 180 × 180, res 180, seed 47. A water plane at y −0.3 covers 70%.
- **Ground:** islands at y 0.2. Boardwalks are 2 m wide plank strips (LevelKit `boardwalks: [[x0,z0,x1,z1], ...]`, `textures/planks012`, `env/nature/path_wood`, `bridge_wood`).
- **Dressing:** dead trees `tree_*_dark`, `stump_old`, `hanging_moss`, 3k reeds (grass shader variant, h 1.2, `#8C8A4E`), 30 wisps.
- **Spine:** (0,−80) Entry → (−22,−52) Boardwalk Maze → (0,−22) Lily Crossing → (26,4) Spider Reeds → (12,34) Smugglers' Landing → (−16,54) Sunken Tower → (−6,78) Sovereign Pool → (−6,90) exit.
- **Env:** `bog`.
- **Music:** explore `cave_theme` [audition], arenas `battle_fast_fight_loop`.
- **Play time:** about 12 min.

| Zone | Kind | Centre / size | Content and spawns | Triggers |
|---|---|---|---|---|
| `entry` | open | (0,−80) | Patrol 2 `jelly_l` at (4,−68) | Spawn `start` (0,−86, facing +Z). `vigil_1` at (−4,−76). |
| `maze` | open | (−22,−52), 40 × 30 | Boardwalk grid over deep water. Patrol 4 `jelly_l`; 2 `rat_xbow` on platforms (y 1.0). 3 guide wisps at the correct junctions. | Letter #5 at (−34,−46). Juniper on a dead stump at (−30,−60) (`meow`). |
| `lily` | platforming | (0,−22) | 12 lily pads (`env/nature/lily_large` fitted to r 0.9) on two routes across 24 m of water, gaps 2.2–2.8 m. Static in MVP; sinking 1.5 s after landing is [MVP+]. 2 `crow` harass. | — |
| `reeds` | arena r 12 | (26,4) | Tall reeds. W1: 3 `spider` + 1 `jelly_l`. W2: 3 `spider` + 2 `rat_xbow`. | Bramble at (32,10) (`meow`). `vigil_2` at (18,16). |
| `landing` | arena r 14 | (12,34) | Hound rafts (procedural planks + `env/dungeon-kaykit/barrel_large`, `crates_stacked`), docks (`floor_wood_large`). W1: 3 `stealer` + 2 `rat_pike`. W2: 2 `pug` + 2 `rat_pike` + 1 `rat_xbow`. | Pearl's crate (`crates_stacked`, pink-ribbon highlight) at (16,42): interact → CS-11 |
| `tower` | platforming | (−16,54) | Sunken tower: 2 stacked `env/castle/tower-square` sunk 2 m and tilted 12° about X. Inner ledges and stairs (Octree) up to the top at y 9. [MVP+] 5 `bat` inside. | Fennel on the ground floor (`climb`). **Heart Bell #3** on top (y 9) [MVP]. |
| `pool` | arena r 13 | (−6,78), ankle-deep | **MVP elite slime wave:** W1 3 `jelly_l`; W2 2 `jelly_l` + 2 `spider` + 1 `rat_xbow`. **[MVP+] B4 Slime Sovereign instead** (§11.6). | `vigil_3` at (−6,64) (door). After the clear: disc (−6,88) → CS-12 → load `keep` / `gate`. |

- **Collectibles:**
  - Kittens: Juniper, Bramble, Fennel.
  - Letter #5; Heart Bell #3.
  - Fish about 280.
- **Enemy totals:** 12 `jelly_l` (each splits to 2 M → 4 S), 8 `spider`, 6 `rat_xbow`, 2 `crow`, 3 `stealer`, 2 `pug`, 4 `rat_pike`.

### 12.8 L6 `keep`: Houndhold Keep (Ch. 6) [MVP]
- **Size:** 140 × 140, res 140, seed 59. A rocky crag with the keep platform at y 0.
- **Architecture:** `env/castle/*` (walls fitted to 8 m, towers, `wall-narrow-stairs`, `metal-gate`, `siege-ballista`). Cellars use `env/dungeon-kaykit/*` (`wall`, `floor_tile_large`, `stairs`, `torch_mounted`, `banner_patternA_red`, `keyring`, `barrel_large`). Braziers `env/graveyard/fire-basket`. Banners carry a procedural bone-sigil decal.
- **Env:** `keep_storm` (cellars `keep_cellar`).
- **Music:** `battle_theme_a` (courtyard), `cave_theme` (cellars), `boss_epic_battle_loop` (Brutus, Barkus).
- **Play time:** about 16 min.

| Zone | Kind | Centre / size | Content and spawns | Triggers |
|---|---|---|---|---|
| `gate` | setpiece | (0,−58) | CS-13; the gate is swapped for debris | Spawn `gate` (0,−66, facing +Z). `vigil_1` at (−5,−62). |
| `courtyard` | rectangular arena 40 × 30 (x −20..20, z −40..−10; §12.1 step 7) | (0,−25) | **2 ballistas** (`siege-ballista` fitted to 2.5 m) at (−15,−12) and (15,−12) aimed south. Each fires every 4.0 s down a red `aoe` lane (2 × 30 m) telegraphed 1.0 s, 2 damage. Each has a crew of 2 `pug`; **defeating the crew disables that ballista.** W1: both crews (4 `pug`) + 2 `hyena`. W2: 2 `hyena` + 2 `rat_xbow` + 2 `crow`. Then CS-14 → **Sir Brutus** in the same arena (§11.4) → D-05. | Bean in a barrel at (−17,−36) (break). `vigil_2` at (5,−12) after Brutus. The cellar gate at (0,−8) opens. |
| `cellars` | corridors 3 m wide × 3.5 m tall, floor y −4 | from (0,−6) north | Stairs down at (0,−6), then a 20 m corridor to the **Bone Vault** (14 × 14 arena at (0,14)): W1 4 `bone_minion`; W2 2 `bone_minion` + 1 `bone_warrior` (`tut.bones`). **West kennel** (−14,14), 8 × 8: 2 `bone_minion` + 1 `pug` + **keyring A**. **East kennel** (14,14): 2 `bone_minion` + 1 `bone_mage` + **keyring B**. [MVP+] 2 `warhound` in the vault's W2 (fetch interaction); 6 `bat` in the corridors. | Crumpet in the west kennel cage (`cage`). Letter #6 in the east kennel at (16,16). Objective "Find the keys 0/2". Exit stairs up at (0,28). |
| `rampart` | climb | from (0,30), y 0 to (0,40), y 18 | `wall-narrow-stairs` in 4 flights of 4.5 m rise along the north wall. 3 `crow`, 2 `pug` on the landings, 2 `rat_xbow` on a side tower. Banner beam at (6,36), y 12, reached from flight 3. | Dumpling on the beam (`climb`). Tower gate (`metal-gate`) at (0,38), y 18 needs keys 2/2. `vigil_3` at (−3,36), y 18 (boss door). |
| `roof` | boss arena r 10 | (0,46), y 22 | Crenellations 1.0 m. 4 braziers at r 8. Rampart walkway ring r 14 around (0,46), y 18 (it joins the top of the Rampart Climb), with anchors `rampart_0..27` for CS-15 (§11.5). Stairs from the tower gate (0,38, y 18) up to the roof. | B3 (§11.5) → CS-15 → CS-16 |

- **Collectibles:**
  - Kittens: Bean, Crumpet, Dumpling.
  - Letter #6.
  - Fish about 500: about 200 from enemies, crates and fish lines, 50 from Brutus, and 250 from Barkus (credited after the ending; it is for post-game shopping).
- **Enemy totals:** 7 `pug` (+4 from Barkus), 4 `hyena`, 4 `rat_xbow`, 5 `crow`, 12 Boneheads (vault 7, west kennel 2, east kennel 3; +4 from Barkus), plus Brutus and Barkus.

### 12.9 Pacing (introduce → develop → twist → test) and run time

| Level | Introduce | Develop | Twist | Test | Combat / traverse / puzzle / story % | Time |
|---|---|---|---|---|---|---|
| meadow | Move, combo, roll, Stand, parry, Bright, Meow, Riposte, Pounce, reflect | Rat packs + crossbows | Crows (air threats) | Bridge waves | 45 / 25 / 5 / 25 | 16 min |
| forest | Webs, mushroom bounce, rope posts | Mixed rat camp | Night | Grizzlechop: pillar lesson, gold glint, snack choke | 50 / 30 / 5 / 15 | 14 min |
| town | Pugs (shields), Post Stealers, lanterns | Chase (Zoomies) | Giant slime in the fountain | Square: 4 waves | 50 / 20 / 10 / 20 | 12 min |
| gate | Hyenas: Gloat and Jeer; Standing Ground matters | The Line (runners, spatial defence) | Pin theft; Spoon Brigade | Cacklejaw: choke, gold rush, shadow clue | 70 / 5 / 5 / 20 | 14 min |
| bog | Slime splitting, water hazards | Bright pops slimes; reeds | Lily pads | Elite slime wave | 55 / 30 / 5 / 10 | 12 min |
| keep | Boneheads (scatter), ballista lanes | Keys hunt | Brutus duel of Stands | Barkus: three perfect parries, then the rally | 60 / 20 / 5 / 15 | 16 min |
| Hub visits | Shops, kittens, Meme Cam | — | — | — | — | about 5 min |
| **Total** | | | | | | **about 89 min** |

**Rules:**
- A combat arena takes at most 90 s.
- After an arena comes at least 45 s of traversal, a rescue or story before the next arena.
- Every level has one quiet beat: the Milk Break, Lantern Night, the Letters, the pull-back, the Bow, the rampart kittens.


---

## 13. Progression and economy [MVP]

### 13.1 No XP. Shards, gear and friends.
She never levels up, because the point is that she doesn't get bigger. Power comes from the **Dawnstone shards**, which also drive the story:

| Shard | From | Unlocks | Story beat |
|---|---|---|---|
| 1 | B1 Grizzlechop (`forest`) | **Holy Slash** (charge tier 2, costs 50 Valor) | CS-05 "First Light" |
| 2 | B2 Cacklejaw (`gate`) | **Holy Wave** (added to Holy Slash) and **Golden Hour** (the super) | CS-09: she lights gold (ref1) |
| 3 | B3 Barkus (`keep`) | The finale: Final Stand → Golden Hour → the Sunbell rings | CS-15 / CS-16 |
| Post-game | finishing the game | Golden Hour lasts +3 s (11 s); Dawnblade skin; Gold cape | — |

### 13.2 Fish (currency)
- **Silver fish** = 1; **gold fish** = 10. Sounds `pickup/coins_0x` and `pickup/coin2`.
- **Sources:** enemies (§10.2), crates and barrels (1–3 each), fish lines along paths, bosses (Grizzlechop 100, Cacklejaw 120, Brutus 50, Barkus 250), and the Post Stealer's +5 return bonus.
- **Budget, first clear:** meadow 180, forest 250, town 250, gate 300, bog 280, keep 500 = **about 1,760** (about 1,260 is in hand before the keep; the keep's 500 is mostly post-game money).
- Replays from the Quest Board respawn enemies and crates (not collectibles), at about 60% of the first-clear fish.

### 13.3 Shops (hub stations; UI panels at stall counters, no interiors)

| Shop | Item | Cost | Effect |
|---|---|---|---|
| **Bakery** (Marmalade) | Bigger Satchel I / II | 100 / 200 | Milk capacity 2 → 3 → 4 |
| **Forge** (Tofu) | Sharpness I / II / III | 120 / 240 / 400 | All player damage ×1.15 / ×1.30 / ×1.50 |
| | Sword skins | free once unlocked | Equip (§13.4) |
| **Library** (Earl Grey) | Quick Charge | 200 | Charge tier times 0.60 / 1.10 s → 0.45 / 0.85 s |
| | Valor Gain | 150 | +25% on every Valor gain |
| | Holy Wave Reach (needs Shard 2) | 200 | Wave range 10 → 15 m |
| **Wardrobe** (Pearl, after `bog.done`) | Order Blue `#3F6FB5` / Whiskerwood Green `#5E7F3E` / Midnight `#22242A` capes | 80 each | Cosmetic |

- Total sink 1,850 fish. A thorough first run buys most of it; replays cover the rest.
- **Nothing is required to finish the game.**
- Milk refills are free at Vigil Stones; bottles are never sold.

### 13.4 Sword skins (cosmetic; same hitbox and timings; the trail colour changes)

| Skin | Unlock | Build |
|---|---|---|
| **Borrowed Blade** (default) | start | Procedural (art.md §4.3) |
| Training Twig | start (a joke; equip at the Forge) | Procedural stick with a leaf |
| Fishbone Sword | 6 kittens rescued | Procedural spine with rib cones |
| Baguette Blade | 12 kittens rescued | Procedural capsule with score marks |
| Diamond Sword | all 18 kittens | `weapons/quaternius/Sword_Diamond.glb` fitted to 1.0 m |
| **Even More Too Big** | beat Sir Brutus | `weapons/quaternius/Claymore.glb` fitted to 1.6 m. **The tip drags on the ground** (visual only). |
| **Dawnblade** | finish the game | The default blade with a permanent gold emissive and 20 sparkles (ref1) |

### 13.5 Capes (the bow is **always pink** and can't be removed: a hard rule)

| Cape | Colour | Unlock |
|---|---|---|
| Faded Cream | `#E2D6C0` | start (Marmalade's; matches the viral clips and ref3) |
| **Royal Red** | `#A3202C` | CS-07 (ref2); equipped by default afterwards |
| **Meme White** | `#F2EFE8` | first Meme Cam |
| Order Blue / Whiskerwood Green / Midnight | per §13.3 | Pearl, 80 fish each |
| Gold | `#D9B26A` | finish the game |

### 13.6 Other progression
- **Heart Bells:** 3 (forest, gate, bog), +1 heart each (4 → 7).
- **Lost kittens:** 18. Each gives +25 Valor and a hub resident. They appear in the L4 pull-back and the L6 lantern rally (Pudding ferries them to the keep, CS-13 → CS-15). Skin milestones at 6, 12 and 18.
- **Lost Letters:** 6, read in Pause → Letters. All 6 → Coo brings a 100-fish "postage refund" (toast).
- **Results stamp per level:** "Paw-some", "Purr-fect" or "Mew-tiful" by lives left (§6.8).

---

## 14. UI [MVP]

### 14.1 Style and fonts
- Pure-CSS parchment panels, pink candy-ribbon buttons, pink wax seals with an embossed paw for confirm and save, gold accents. Recipe: art.md §13.
- Minimum font size 16 px. Respect `env(safe-area-inset-*)`.
- **Fonts** (`@font-face` from `public/assets/fonts/`, all [verified] present, OFL):
  - `CinzelDecorative-Bold.ttf` and `-Regular.ttf`: logo, boss names, chapter cards.
  - `Cinzel-Variable.ttf`: menus and headings.
  - `Fredoka-Variable.ttf`: HUD, dialogue, numbers.
  - `UncialAntiqua-Regular.ttf`: letters, lore, Meme Cam captions.
  - `MedievalSharp-Regular.ttf`: shop signs and quest names.

### 14.2 HUD (16:9; touch moves the action cluster clear of the HUD)

| Position | Element | Behaviour |
|---|---|---|
| Top-left | **Portrait**: round gold frame, Swordcat in the Oath pose, bow peeking over the frame | Worried at HP ≤ 2; determined and glowing in Golden Hour |
| Top-left | **Hearts** `#F0668E` with a white highlight; half-hearts | Wobble when hit; pulse `#E04646` at HP ≤ 2 |
| Under the hearts | **Grit**: 3 small steel shields | Flash while she's in the Stand; cracked at 0 |
| Under Grit | **Valor**: a sword that fills from the hilt | Silver; a gold notch at 50; all gold with sparkles at 100, plus the Golden Hour glyph |
| Under the portrait | **Lives**: cat head with a bow and "×9" | On a lost life, the ghost kitten floats up out of the icon |
| Bottom-centre (desktop / pad) | **Ability bar** in LoL style, 56 px slots: Stand with Grit pips, Tumble, Jump, Kitten portrait, Golden Hour \| Milk ×n, Meow, Interact. Each slot has its key glyph, a clockwise cooldown sweep with seconds, and a ready flash (`research/CONTROLS_SPEC.md` §10.1). | On touch, the cluster buttons show the same states. Milk and the companion portrait now live here instead of bottom-left and bottom-right. |
| Top-right | **Fish** counter; **kittens n/3** for this level; letter seal ✓ | Pop and bounce on change |
| Top-centre | **Boss bar**: Cinzel Decorative name ribbon, red fill with a white chip trail, phase pips, gold Dizzy bar underneath | Shown on `boss:start` |
| Top-centre | **Objective line**: "Hold the Line! Gate repair 64%" plus a bar; toasts | — |
| Screen edges | **Off-screen threat arrows** (§8.1) | At most 4 |
| World space | **Ground rings:** her pink aim / hero ring with a notch (Stand fan; gold flash in the parry window), the gold selection ring, hover rings and order markers | The old centre lock-on reticle is removed |
| World space | **Enemy HP bars** (36 × 5 px; touch 44 × 6) over damaged, selected or hovered enemies | Fade 3 s after the last hit; pool of 12 |
| World space | Damage numbers (§8.3); "!" alert bubbles; interaction tags (parchment plus a wax-seal key glyph) | DOM pool, max 20 |
| Bottom-centre (over the bar) | **Dialogue scroll**: portrait, speaker name on a pink ribbon, typewriter text at 30 chars/s, a bouncing paw for "next" | Babble (§16.4) |
| Overlay | Cutscene letterbox bars (CSS, 10% each); "Hold to skip" ring | — |
| Meme Cam | Everything fades except the caption | — |

### 14.3 Screens (complete list)

| Screen | Contents | Notes |
|---|---|---|
| **Boot / Loading** | Parchment, a progress paw-bar (`ui:progress`), a random tip from `loading.tips` | Also used between levels |
| **Title** | CS-00 live in-engine; logo; "Press any key / Tap to start" | The first input unlocks audio; touch also requests fullscreen |
| **Main menu** | Continue · New Game · Settings · Credits | — |
| **New Game** | Difficulty: Kitten / Knight / Nine Lives, with one-line descriptions; "Skip the prologue?" if a save exists | — |
| **Settings** | Volume (master / music / SFX). **Controls:** preset (Hybrid / LoL classic / Diablo / Mouse only / Keyboard only), rebinding, auto-attack after approach, tap-to-move, swipe-to-tumble, cast mode, parry ring, Stand auto-face, Auto-Riposte, haptics, left-handed, button opacity, edit touch layout, cursor size. **Camera:** zoom, camera lock, edge-pan speed, reduce camera motion. Pad aim sensitivity. Quality (Auto / Low / Med / High); difficulty (not Nine Lives); hold or toggle for Stand and charge; Auto-Stand assist; screen shake 0–100%; reduce flashes; telegraph patterns; subtitle size; dialogue speed; touch button size; language placeholder [STRETCH] | Saved immediately |
| **HUD** | §14.2 | — |
| **Dialogue box** | §14.2 | Pauses enemies (`game.setMode('dialog')`) |
| **Cutscene overlay** | Letterbox, captions, chapter and title cards, skip ring, prompt overlays ("HOLD THE STAND" with a filling ring) | — |
| **Chapter card** | Parchment, chapter title in Cinzel Decorative, the level's region in Uncial Antiqua, a wax-seal stamp (`ui/drop_002`) | 3.0 s |
| **Pause** | Resume · Kittens (an 18-cell portrait grid with names and where found; "???" if missing) · Letters (parchment cards) · Settings · Return to Pawsbury (when `town.free` and outside a boss) · Quit to Title | `ui/bookOpen` / `bookClose` |
| **Vigil Stone menu** | Rest (save) · Swap kitten (portrait picker of unlocked companions) · Difficulty | — |
| **Shop panels** | Bakery, Forge (with a skin preview on a turntable), Library, Wardrobe (cape preview on a turntable) | — |
| **Quest Board** | Level cards (cleared ✓; kittens n/3; letter ✓; best rank); "Next: {chapter}" button | Hub only |
| **Results** | Time, kittens n/3, letter, fish, lives left, rank stamp | `music/victory_8bit_loop.ogg` [audition] |
| **Life lost** | Soft pink-white flash, "{n} lives left", the ghost kitten waving | 1.5 s |
| **Game over** | "Time for a cat nap." Swordcat curled asleep around her sword. Wake up (retry level) · Back to Pawsbury | `jingles/jingles_SAX02` |
| **Toasts** | Kitten found, letter, Heart Bell, skin unlocked, objective done | Queue of 3; 2.5 s each |
| **Touch controls** | §15.3 | — |
| **Rotate hint** | A one-time toast in portrait (`tut.rotate`). Portrait is fully playable. | — |
| **Credits** | Scroll over the CS-16 festival: team placeholders, then the **full asset attribution from `public/assets/LICENSES.md`** (CC0 courtesy credits; OFL font notices) | No token or creator promotion |
| **Photo Mode** [STRETCH] | Freeze; free camera within 6 m; poses Vigil / Oath / Milk Selfie; Meme Cam preset; fog and wind sliders; save a PNG (`toBlob` right after a render) | — |

### 14.4 Accessibility [MVP]
- All lines are subtitled (there is no voice).
- Telegraphs always pair a shape and a sound with colour. An optional pattern overlay is available (stripes for red, dots for gold).
- Shake 0–100%. Reduce flashes. Hold or toggle for Stand and charge.
- Auto-Stand assist. Kitten difficulty.
- No input requires mashing.
- Touch: aim assist 90° / 4.5 m, guard arc ±90°, parry window +0.05 s, auto-combo taps, tap-to-attack with auto-chain, Auto-Riposte and the parry ring.
- One thumb is enough: tap-to-move, tap-to-attack and Auto-Stand clear Knight encounters.
- Five keyboard and mouse presets (including mouse-only and keyboard-only) and full rebinding. No pointer lock. Cursor sizes ×1 / 1.5 / 2 and a high-contrast cursor.
- Reduce camera motion: no lead, no auto zoom, no punch-ins, no yaw blends. Every haptic has a visual or audio twin.

---

## 15. Controls [MVP]

The binding spec is `research/CONTROLS_SPEC.md`. It covers the camera, the nav grid, the aim resolver, the touch geometry, the config tables and the per-area tasks. This section summarises it.

**One action model on every device.** You choose *where* (a click, a tap, WASD or a stick) and *what* (attack, Stand, Tumble, Jump, abilities). One aim resolver turns each action into a direction. The camera is a fixed-yaw top-down view, so screen-up always means the same direction and there is nothing to look around for. `?cam=classic` keeps the old orbit camera and bindings until M3 ends.

### 15.1 Keyboard and mouse (default preset `hybrid`; no pointer lock, the cursor is always visible)

| Action | Key |
|---|---|
| **Move** (point-and-go) | **RMB** click. Hold RMB to keep following the cursor. Ctrl+RMB queues up to 4 waypoints. |
| Move (direct) | **WASD** / arrows (screen-relative). Overrides any path at once. |
| Attack an enemy / use an object | RMB on it. On an enemy she walks into reach, then does one Snip–Snap–Swoosh string (a setting). On an object she walks there and uses it. |
| **Attack** / combo / hold to charge | **LMB** or J, toward the cursor |
| **Stand** (hold) / parry (timing) | **Space**, L or Mouse4. Snaps to the threat on press. |
| Tumble | **Shift**, K or Mouse3. Direction: WASD, else toward the cursor. |
| Jump (LMB in the air = Pounce at the cursor) | **F** |
| Interact / confirm | E or Enter |
| Kitten ability | Q (hold to aim, release to cast) |
| Milk Break | R |
| **Meow** | C |
| **Golden Hour** | V, or Stand + Attack together at Valor 100 |
| Select / cycle target | click a foe / Tab, Shift+Tab |
| Attack-move · Stop | X then click · H |
| Show ranges | hold Ctrl |
| Zoom · Peek | wheel · hold Alt or MMB |
| Camera lock · Centre | Y toggles the lock; unlocked, you get edge pan, MMB drag and a 25 m leash · hold F1 / Home to centre |
| Pause; hold to skip cutscenes | Esc or P |

**Other presets:**
- **LoL classic:** no WASD. A+click attack-moves, S stops, H holds position, D is Milk.
- **Diablo:** LMB moves and attacks, Shift+LMB attacks in place, RMB is the Stand, Space tumbles.
- **Mouse only.**
- **Keyboard only:** J / K / L, and Space jumps.

Any action can be rebound.

### 15.2 Gamepad (twin-stick; standard mapping, button indices)

| Action | Button |
|---|---|
| Move / **aim** | left stick (dead zone 0.15) / **right stick** (dead zone 0.25; a ground reticle up to 6 m) |
| Jump | A (0) |
| Tumble | B (1) |
| Attack / charge | X (2) |
| Interact | Y (3) |
| **Stand** | **LB (4)** |
| Select nearest target | RB (5); D-pad left / right (14 / 15) cycle |
| Kitten ability | LT (6): tap = smart cast, hold = aim with RS |
| **Golden Hour** | RT (7) at Valor 100 (or LB + X together) |
| Controls card | Back (8) |
| Pause / hold to skip | Start (9) |
| Meow | L3 (10) |
| Zoom (3 steps) | R3 (11) |
| Milk | D-pad up (12) |
| Peek | hold D-pad down (13) + RS |

### 15.3 Touch (Wild Rift layout; sizes × touch size 0.8–1.4; every button ≥ 56 CSS px)
- **Joystick** (left 42% × bottom 80%): floating, r 60 px, dead zone 0.10. Its base follows the thumb past 1.6 R.
- **Free area** (no look-drag any more):
  - **Tap** the ground to walk there.
  - Tap a foe to select it and attack it.
  - Tap an object or NPC to walk there and use it.
  - **Long-press** to keep following the finger.
  - **Swipe** (≥ 48 px in ≤ 150 ms) to Tumble.
  - **Pinch** to zoom.

  Taps within 40 px of a button, or within 0.3 s of releasing a button, are ignored. Tap-to-move and swipe-to-tumble can each be turned off.
- **Cluster** (bottom-right; the ⚔ centre is 68 px from the corner):
  - **⚔ 96 px:** tap to attack, hold to charge, drag to aim.
  - **🛡 Stand 76 px**, directly left of ⚔. It auto-faces the soonest threat; guard arc ±90°.
  - **Tumble 64.** A drag within 0.08 s steers it.
  - **Jump 64.**
  - **Kitten ability 64:** tap = smart cast, drag = aim, ✕ cancels.
  - **Golden Hour 64**, shown at Valor 100 with Shard 2.
  - **Milk 56** and **Meow 56.**
  - A contextual **"!" 64.**
  - ❚❚ 56 at top centre (hold 1 s to skip).
- **Assists:** a soft auto-target (4.5 m, sticky, the enemy winding up on her first), auto-chain after tapping a foe, Auto-Stand, Auto-Riposte, the parry ring, parry window +0.05 s, and haptics.
- **Portrait** is fully supported: the cluster is ×0.85, the joystick is in the bottom 38%, and the camera fits at least 9 m across. Settings has a left-handed mirror, button opacity and an edit-layout mode.
- Controls show when `(pointer: coarse)` matches or on the first `touchstart`.

### 15.4 Camera summary
- **Yaw:** fixed per level (default π, looking +Z). A level has at most 3 authored zone hints, and they blend only out of combat. The stick keeps the yaw it started with, so a run never bends.
- **Lens:** FOV 38° (portrait 50°). Pitch 46–58° depending on zoom. 13 m on desktop and 12 m on a phone; zoom 9–18 m. She is never less than 30 CSS px tall.
- **Fog:** measured from her, not the lens (clear 5 m, 7 m in combat). The screen edges are misty and the stage is clear.
- **Occlusion:** occluders fade (dithered) and roofs and canopies lift. She has a hero ring and an x-ray silhouette.
- **Cutscenes** keep their presets and crane in and out of the top-down view. The Meme Cam descends from it.

### 15.5 Point-and-go
- Orders walk a 0.5 m physics nav grid (A*, string-pulled).
- Hop, drop, gap, fence and mushroom links are generated automatically, and she jumps them by herself with an assisted hop. The practice-field fence link opens only after the jump lesson.
- Direct input always overrides an order. The Stand plants her and clears it. After a Tumble, a move order resumes.
- An unreachable click walks her to the nearest reachable point and shows a grey ✕.

### 15.6 Aim resolver (every directional action)
The order is: the Riposte target, a touch drag or the right stick, the mouse cursor, the selected target, the soft auto-target, movement, then facing. Magnet cones are centred on the resolved aim (§7.2).

### 15.7 Changes to the input contract (owner: core `Input.js`)
- RMB changes from `guard` to `move`. `jump` moves from Space to F. `guard` is now Space, L and Mouse4. The wheel zooms instead of switching targets. On the pad, R3 zooms and the right stick aims.
- Pointer lock is removed in play, and `consumeLook()` returns zeros there.
- New actions: `move attackMove stop zoomIn zoomOut peek camLock centre ranges`.
- New input API: `input.pointer`, `takeClick()`, `addTap()`, `addZoom()` / `consumeZoom()`, `aimStick`, `setVirtualAim()`, `haptic()`, and presets with `settings.bindings`.
- `input.heldTime(action)` is still required (charge, the Stand, prompts).

## 16. Audio [MVP]

Every file below exists under `public/assets/audio/` [verified by name in ASSETS.md and on disk for the spot-checked files]. All are CC0. Nobody has listened to any of them, so treat every pick as [audition].

### 16.1 Music (all 14 tracks used)

| Context | Track | Notes |
|---|---|---|
| Title (after the audio unlock), main menu, CS-01, hub gold, credits tail | `music/village_bards_tale.mp3` | ASSETS.md: there is no dedicated "cute" theme |
| `meadow` and `forest` day exploration; ending flight | `music/field_of_dreams.mp3` | — |
| Arena combat (all levels except the gate waves) | `music/battle_fast_fight_loop.ogg` | 24 s seamless loop |
| The Line waves, CS-02 sting, keep courtyard | `music/battle_theme_a.mp3` | Start offset by ear |
| Bosses and Brutus | `music/boss_epic_battle_loop.ogg` | Snaps in within 0.3 s at the fog wall |
| `forest` night | `music/dark_forest_creepy.ogg` at volume 0.6 | Taste [audition]; fallback `field_of_dreams` |
| `bog` exploration, keep cellars | `music/cave_theme.ogg` | — |
| `town` occupied, gate approach (low) | `music/village_town_theme.mp3` | — |
| Bakery radius 8 m | `music/tavern_old_tower_inn.mp3` | — |
| Emotional scenes (CS-06, CS-10, CS-11, CS-15), hub grey | `music/story_lament_warriors_soul.mp3` | — |
| Knighting | `music/castle_kings_feast.mp3` | — |
| Credits / festival | `music/festival_minstrel_dance.mp3` | — |
| Boss or arena win sting | `music/victory_fanfare.mp3` | About 4 s |
| Results | `music/victory_8bit_loop.ogg` | It may clash with the tone [audition]; fallback `jingles/jingles_PIZZI03` |
| **Meme Cam** | **no music**: duck to 0 over 1 s; wind ×1.6 | Matches the silent viral loops [TREND §5] |

**Rules:**
- A/B crossfade 1.5 s (tech.md §14).
- "Combat" starts on `arena:lock` or when 1 or more enemies are alerted within 20 m. "Explore" resumes 4 s after the last kill.
- Music ducks −6 dB under dialogue. A 30 ms duck during hitstop.
- Ship `.mp3` versions of the 5 `.ogg` tracks for Safari; Ogg support on Safari is [unverified]. They are re-encoded in M4 with `imageio-ffmpeg`.

### 16.2 SFX map (owner: audio; listens to bus events)

| Event | Files (`audio/sfx/...`) |
|---|---|
| `player:swing` light / heavy | `sword/swish_01–13` (random, rate ±5%) / `sword/swing`, `swing2`, `swing3` |
| `combat:hit` on fur / armour / bone | `sword/sword_attack_01–10` / `impact/impactPlate_light_00x` (medium for heavy hits) / `impact/impactWood_light_00x` |
| Kill poof | `creature/creature_die_01` + `pickup/powerup_fx01` at rate 1.3 |
| Block / **parry** / guard break | `impact/impactMetal_medium_00x` / `sword/sword_clash_01–10` + `impact/metal_ringing` / `impact/metal_small1` + `impact/impactPlate_heavy_000` |
| Charge tier 1 / tier 2 / fizzle | `pickup/powerup_rise01` / `powerup_rise03` / `ui/glitch_001` at volume 0.3 |
| Holy Slash / Holy Wave | `magic/spell_fire_03` + `impact/impactMetal_heavy_00x` / `magic/magic1` |
| Golden Hour on / Sunburst | `pickup/powerup_upper01` + `jingles/jingles_STEEL0x` / `magic/spell_fire_07` + `impact/impactPlate_heavy_00x` |
| Tumble / jump / land | `impact/cloth_heavy` + `impact/chainmail2` / `impact/cloth` / `impact/impactSoft_medium_00x` |
| Footsteps by surface | grass `footsteps/footstep_grass_000–004`; stone `stone_l1–3`, `stone_r1–3`; wood `footstep_wood_000–004`; mud `sand_l1–3`, `sand_r1–3`; plus `impact/armor_light` at 25% volume every 2nd step |
| Player hurt / faint / ghost life | `impact/impactPlate_light_00x` + `cat/cute_creature_0x` at rate 1.2 / `cat/cat_softmew` at rate 0.8 / `pickup/powerup_downer01` |
| Meow | `cat/kitten_mew_01`, `cat/meow_baby_01` |
| Milk sip | `pickup/bubble`, `bubble2`, `bubble3` |
| Vigil Stone / Still Standing | `cat/cat_purrsleepy_loop` (2 s) + `magic/magic1` / `magic/spell_02` + heartbeat |
| Fish / gold fish / small heart / Heart Bell | `pickup/coins_01–04` / `pickup/coin2` / `pickup/gem_01` / `pickup/powerup_rise05` + `jingles/jingles_NES02` |
| Kitten found / letter | `jingles/jingles_PIZZI00–04` + `cat/kitten_mew_01` at rate 1.3 / `ui/bookFlip1` + `jingles/jingles_NES00` |
| Crates / cage / lock / keys / gate / winch | `world/wood_hit_0x`, `wood_breaking_01–02` / `world/metal_open_01` / `world/lock_open_01` / `world/keys_01` / `world/metal_open_01`, `metal_close_01` / `impact/chain_01–03` loop |
| Rats | `creature/rat_squeak_attack`, `rat_squeak_pain`, `rat_squeak_death` |
| Crows | caw = `creature/c80_scream_01/02` at rate 1.4 [audition] or the zzfx `crowCaw`; wings `impact/cloth` |
| Spiders | `creature/c80_bug_01–04` at rate 1.3 |
| Gloomjellies | `creature/slime_01–16`, `rpg_slime1–10`; split `creature/splash_01–05` |
| Hyenas | laugh build (§16.3); hurt `creature/c80_hurt_0x` at rate 1.2; choke `creature/c80_cough_01` |
| Post Stealer | snatch `creature/c80_eat_01`; fleeing = laugh build at rate 1.4 |
| Pugs | `creature/c80_barking_01/02`, `animal_bark`; snort `c80_nose` |
| Boneheads | clack `impact/impactWood_light_00x`; reassemble `impact/impactWood_medium_00x` ×3 |
| Pudding | `creature/creature_roar_01–03` + `c80_roar_01–03` at rate 0.7–0.8; nervous `c80_ooh`; Lantern Night snore `c80_snore` at rate 0.6 |
| Grizzlechop / Cacklejaw / Brutus / Barkus | `rat_squeak_*` at rate 0.8 + `rpg_mnstr*` / laugh build at rate 0.85 / `rpg_giant1–5` / `c80_barking_0x` at rate 0.7, `rpg_giant*`, howl `c80_howl` |
| Ballista / bolt | `impact/impactWood_heavy_00x` / `sword/blade_01` |
| Ambience | wind (procedural); `world/loop_rain` (keep); `world/loop_water_01` (bog, gate) |
| Cow / donkey / Coo | `creature/animal_moo` / `animal_whinny` [audition] / `animal_peeps` at rate 0.7 [audition] |
| UI | `ui/click_00x`, `select_00x`, `confirmation_001`, `back_001`, `bookOpen`, `bookClose`, `scroll_001` (dialogue open), `drop_002` (stamp) |

### 16.3 Procedural audio (no file was downloaded for these)
- **Wind:**
  - A 2 s pink-noise `AudioBuffer`, looped → `BiquadFilter` band-pass centred at `400 + 300 × wind` Hz (Q 0.8).
  - Gain `0.08 + 0.12 × wind`, with a 0.13 Hz LFO at ±20%.
  - `wind` comes from `Env` (0–3) and is the same value as the grass `uWindStrength` driver.
- **The Sunbell:**
  - Additive sines with partial ratios [0.5, 1, 1.19, 1.56, 2, 2.66, 3.01] × 196 Hz, amplitudes [0.6, 1, 0.5, 0.35, 0.3, 0.2, 0.15].
  - Exponential decay τ = 6 s / √ratio. Layered with `impact/metal_ringing` at rate 0.5, volume 0.3.
  - Damped "clunk" variant (CS-02): τ 0.4 s.
- **Hyena laugh build:**
  - 4–7 syllables, each a 0.08–0.14 s slice of `creature/c80_troll_01–03` or `c80_weird_01–05`.
  - Rate 1.25–1.45, 90 ms apart, pitch contour rising then falling.
  - `PositionalAudio` with ref distance 3, rolloff 1.4.
  - Fallback: zzfx `hyenaLaugh` [audition].
- **Heartbeat** (zzfx low thump ×2), **crow caw** (zzfx), **Golden Hour shimmer pad** (3 detuned sines at 880, 1320 and 1760 Hz, gain 0.03).
- zzfx `buildSamples` is baked into buffers of **our** AudioContext on unlock (tech.md §14).

### 16.4 Voice babble (no voice acting)
One blip per 3 typed characters, from the speaker's pool, at ±5% random pitch. Typewriter speed is 30 chars/s.

| Speaker | Pool | Rate |
|---|---|---|
| Swordcat | `cat/cat_softmew`, `cat/kitten_mew_01` (quiet) | 1.25 |
| Pearl | `cat/kitten_mew_01` | 1.45 |
| Mochi / Sage / Clover | `cat/cute_creature_01–03` / `04–05` / `06–07` | 0.95 / 1.1 / 1.0 |
| Earl Grey / Pip / Tofu | `cat/cute_creature_08` / `09–10` / `03` | 0.85 / 1.4 / 1.2 |
| Marmalade / Snowpaw / Whiskerbottom | `cat/meow_01` / `cat/meow_baby_01` / `cat/meow_01` | 0.75 / 1.2 / 0.9 |
| Pudding | `creature/creature_roar_01` (one roar per line) | 0.8 |
| Hyenas / Pilfer / Cacklejaw | laugh-build syllables | 1.3 / 1.4 / 1.0 |
| Barkus / Brutus / Grizzlechop | `creature/c80_barking_01` / `rpg_giant1` / `rat_squeak_attack` | 0.7 / 1.0 / 0.9 |
| Coo | `creature/animal_peeps` | 0.7 |

### 16.5 Mix
- Buses: master, music and SFX (tech.md §14).
- **3D (`PositionalAudio`) for enemies and the world; 2D for the player and UI.**
- At most 8 2D and 12 3D voices; the oldest is stolen.

---

## 17. Visual direction (summary; art.md is binding)
- **Mood rule** [REF]: the world is desaturated, misty and low-contrast grey-green. **The heroes carry all the warm saturation** (ginger, pink, red, gold) and the highest contrast (polished steel). No pink on enemies.
- **The story is told in light:**
  - misty grey (meadow, forest);
  - golden hour (town, then the hub);
  - dusk with rising grey fog (gate);
  - the grey hub (after L4);
  - blue-green marsh (bog);
  - storm (keep);
  - sunrise and gold everywhere (ending).
- Her glow is the only warm light in the cold biomes.
- **Signature poses:** **Vigil** (ref2): idle, checkpoints, the Stand. **Oath** (ref1, ref3): charge, title, victory, Meme Cam.
- **The holy ladder:** blade emissive tracks Valor (0 → 0.6) → the Holy Slash charge (art.md §4.3, §10.2) → the Golden Hour aura hull with 160 sparkles and bloom 1.2 → the finale.
- **Scale:** low cameras looking slightly up at her; giants framed to fill the shot (Pudding, Tallbert, Barkus); pull-back reveals.
- **Post-processing** (tech.md §13): MSAA 4 (Med and High), UnrealBloom (0.6 / 0.4 / 0.85, tweened for holy), OutputPass, vignette. Bokeh DOF in cutscenes is [MVP+]. Low quality skips the composer.
- **Fur:** shells on head, bib and tail (16 for the hero on desktop, 8 on mobile, sheen fallback; art.md §3). Kittens use 10 shells or sheen; villagers use sheen only.
- **Cape:** verlet 9 × 13 for the hero [MVP]; the sway-shader fallback is the first thing cut. NPC capes use the sway shader.

---

## 18. Asset mapping and verified asset facts

### 18.1 Loader rules [MVP] (owner: core `Assets.js` and `MODEL_FIT` in config)
- **`fitToHeight(template, target, axis = 'y')` is mandatory for every GLB.**
  - Measured raw mesh extents range from about 0.01 to 5.9 units, and several files carry ×100 or ×39.5 node scales [verified 2026-10-07].
  - Measure a `Box3` once per template, **with unused prop nodes hidden** (KayKit weapons and shields hang outside the body) and in bind pose. Then cache the uniform scale and apply the `MODEL_FIT` yaw offset.
  - A unit test asserts every enemy template is within ±10% of its target.
- Skinned meshes are cloned with `SkeletonUtils.clone`. Static props use `.clone()`, or `InstancedMesh` for 10 or more copies.
- Kenney `env/castle`, `env/town`, `env/graveyard` and `env/dungeon-mini` GLBs need their sibling `Textures/colormap.png` (present [verified] for castle and town).
- KayKit village buildings must be scaled up about 3–6× (ASSETS.md).

**`MODEL_FIT`** (yaw offsets are 0 until M0 screenshots check facing [unverified]):

| Model | Used as | Target | Axis |
|---|---|---|---|
| `characters/kaykit/Barbarian.glb` | hyena / Cacklejaw | 1.35 / 2.2 m | y |
| `characters/kaykit/Rogue_Hooded.glb` | stealer / Pilfer | 1.2 m | y |
| `characters/kaykit/Knight.glb` | pug / Brutus / Barkus / Tallbert | 1.25 / 1.9 / 3.0 / 6.0 m | y |
| `creatures/polypizza/Rat.glb` | rats / Grizzlechop | 0.8 / 1.6 m | y |
| `creatures/monsters-flying/Pigeon.glb` | crow | 1.2 m wingspan | x |
| `creatures/monsters-blob/Pigeon.glb` | Coo | 0.5 m | y |
| `creatures/monsters-flying/Dragon_Evolved.glb` | Pudding | 6.0 m max extent | max |
| `creatures/polypizza/Spider.glb` | spider | 0.5 m | y |
| `creatures/skeletons/Skeleton_*.glb` | Boneheads | 1.0 m | y |
| `creatures/animals/Cow.glb` / `Donkey.glb` / `Husky.glb` | cow / cart donkey / warhound | 1.6 / 1.4 m / 1.1 m long | y / y / z |
| `cats/Cat_Blocky.glb` | **placeholder Swordcat (M0–M1 only)** | 1.0 m | y |
| `props/Crown.glb` | Snowpaw's crown / Sovereign | 0.25 / 0.8 m wide | x |
| `weapons/kaykit/crossbow_1handed.glb` | rat crossbow | 0.5 m | max |
| `weapons/skeleton/Skeleton_Blade.glb` | hyena / Cacklejaw blade | 0.9 / 1.4 m | max |
| `weapons/quaternius/Sword_B.glb` | Grizzlechop's sabre | 0.6 m | max |
| `weapons/quaternius/Claymore.glb` | Barkus's cleaver / "Even More Too Big" skin | 2.2 / 1.6 m | max |
| `weapons/quaternius/Sword_Diamond.glb` | Diamond skin | 1.0 m | max |

### 18.2 Facts verified on disk (2026-10-07, by reading the GLB JSON)

| File | Verified |
|---|---|
| `characters/kaykit/Barbarian.glb`, `Knight.glb`, `Rogue_Hooded.glb` | Shared bones: `root, hips, spine, chest, head, upperarm/lowerarm/hand.l/.r, handslot.l, handslot.r, upperleg/lowerleg.l/.r`. **Beast heads attach to `head`; plates to `chest`; weapons to `handslot.r`/`.l`.** |
| `Barbarian.glb` mesh nodes | `Barbarian_Head`, `Barbarian_Hat`, `Barbarian_Cape`, `Barbarian_Body`, `Barbarian_ArmLeft/Right`, `Barbarian_LegLeft/Right`, `1H_Axe`, `1H_Axe_Offhand`, `2H_Axe`, `Mug`, `Barbarian_Round_Shield` |
| `Knight.glb` mesh nodes | `Knight_Head`, `Knight_Helmet`, `Knight_Cape`, `Knight_Body`, arms and legs, `1H_Sword`, `1H_Sword_Offhand`, `2H_Sword`, `Badge_Shield`, `Rectangle_Shield`, `Round_Shield`, `Spike_Shield` |
| `Rogue_Hooded.glb` mesh nodes | `Rogue_Head_Hooded`, `Rogue_Cape`, `Rogue_Body`, arms and legs, `Knife`, `Knife_Offhand`, `1H_Crossbow`, `2H_Crossbow`, `Throwable` |
| KayKit clips | 76 clips (set S3), including `Idle`, `Walking_A`, `Running_A`, `1H_Melee_Attack_*`, `2H_Melee_Attack_*`, `Block*`, `Cheer`, `Hit_A`, `Death_A`, `Sit_Floor_Down`, `Sit_Floor_Idle`, `PickUp`, `Throw`, `Unarmed_Melee_Attack_Kick` |
| `creatures/polypizza/Rat.glb` | Bones `root, Body, Hips, Torso, Neck, Head, FrontLeg.R/L, FrontUpLeg.*, FrontLowLeg.*, BackLeg.*`; clips `Rat_Attack, Rat_Death, Rat_Idle, Rat_Jump, Rat_Run, Rat_Walk` (**no hit clip**); node scales 39.549 and 100 |
| `creatures/monsters-flying/Pigeon.glb` | Bones `Root, Body1, Torso, Neck, Head`; clips S13; raw x extent 4.1 (wingspan) |
| `creatures/monsters-flying/Dragon_Evolved.glb` | Mesh `Dragon`; bones `Root, Body1–4, Torso, Neck, Head, UpperArm/LowerArm.L/R`; clips S13 (flying only: no sit or sleep clip) |
| `creatures/skeletons/Skeleton_Minion.glb`, `_Warrior.glb` | The same KayKit bone set (`handslot.r/.l`); mesh nodes `*_Head`, `*_Jaw`, `*_Eyes`, `*_Cloak` (Warrior also `*_Helmet`); clip set S15 with `Death_C_Skeletons`, `Death_C_Skeletons_Resurrect`, `Spawn_Ground_Skeletons` |
| `creatures/animals/Husky.glb`, `Wolf.glb` | Bones `Head, Neck1–3, Torso…`; clips S9 incl. `Attack`, `Gallop`, `Idle_2_HeadLow`, `Eating` |
| `cats/Cat_Blocky.glb` | Bones `Root, Body, Head, FrontLeg.L/R, BackLeg.L/R`; clips `Death, Headbutt, Idle, Idle_Eating, Jump_Loop, Jump_Start, Run, Walk`; ×100 node scale |
| `props/Crown.glb`, `weapons/quaternius/Claymore.glb` | ×100 node scales; raw extent about 0.01 |
| Both Pigeon files | `creatures/monsters-blob/Pigeon.glb` (S1) and `creatures/monsters-flying/Pigeon.glb` (S13) both exist |
| Every env, texture, HDRI, font and audio file named in §12 and §16 | Exists (spot-checked by script) |

### 18.3 Procedural builds (no downloaded model; each has an owner)

| Build | Owner | Spec |
|---|---|---|
| **Swordcat** | characters + player | art.md §2–§5: primitives, fur shells, eyes `CanvasTexture`, satin bow, steel plate with the overcast PMREM, verlet cape, the Borrowed Blade |
| Kittens, Marmalade, Snowpaw, Pearl, villagers, the old knights | characters (`buildKitten`) | art.md §7 configs; villager seeds |
| **Beast heads** (`hyena`, `pug`, `bulldog`) | characters (`BeastHead.js`) | About 1.3× the KayKit head size. Hide the original head node and attach to bone `head`. Hyena: tawny `#A88A5E`, spots `#4A3A2A`, round ears, mane tuft cards. Pug: fawn `#C9A27A`, black mask `#2A2522`, wrinkles, folded ears. Bulldog: brindle `#6B4E3A`, jowls, underbite with 2 fangs, eyepatch, horned helm. Eyes use art.md `makeEyeTexture` (amber, slit). Keep `Knight_Helmet` or the hood over the seam. **Fallback:** hyenas become `creatures/animals/Wolf.glb` quadrupeds tinted spotted tan. |
| Breastplate words | characters | `CanvasTexture` 256 × 128, scratchy hand font (MedievalSharp), random word from the faction list, decal on bone `chest` |
| Gloomjelly | enemies | Sphere with a wobble vertex shader, transmission ≤ 6 on screen, then opacity 0.75 plus fresnel; a swallowed object inside |
| Cheese wheel, net, rope posts, cages, height chart, dummies, Wobble Knight, winch, Sunbell (Lathe), shards (octahedra), lanterns' light ribbons | world / fx | Simple primitives, art.md palette |
| **Horde silhouettes** | fx (`Horde.js`) | A low-poly hyena silhouette as one `InstancedMesh` (40), with a vertex-shader run cycle, unlit dark `#2A2A2E`, inside the fog beyond 18 m |
| **CloudSea** (flight set for CS-12 and CS-16 shot 4) | fx (`CloudSea.js`) | A 600 × 600 m plane 40 m below Pudding that follows him; 2 layers of scrolling fbm-noise alpha (`#FFFFFF` tops, underside tinted by the env fog colour), plus 12 billboard cloud puffs drifting past; the sky is the env gradient or the `sky_sunrise` HDRI. The level's terrain, props and grass groups are hidden while it is on. |
| Cutscene props: signpost, Royal Post bag, pot helms, spoons, lanterns, milk cup, letter, cot, soup bowl, jester hat, postmaster hat | characters (worn/held) / world (placed) | Primitives in the art.md palette; pot helm = a lathe bowl with a handle, `#8C8F88` metal |
| Water | world (`Water.js`) | Plane `MeshStandardMaterial` `#2F3B33`, roughness 0.12, scrolling normal map |
| Telegraph decals | fx (`Telegraphs.js`) | §19.5 |

### 18.4 Shipped size (risk R13) [MVP, M4]
- `public/assets` is **195 MB in 1,946 files** (ASSETS.md), and Vite copies all of `public/` into `dist/`. Fix:
  1. Set `build.assetsDir: 'bundle'` in `vite.config.js`, so Vite's hashed JS and CSS never mix with the copied `dist/assets/` library.
  2. Each agent lists every file it loads in `src/<area>/assets.manifest.js` (paths relative to `public/assets/`).
  3. `scripts/prune-assets.mjs` (owner: core) runs after `vite build`. It deletes from `dist/assets/` every file not in the union of manifests, keeping each manifest GLB's sibling `Textures/` folder.
  4. A unit test checks that every manifest path exists and that every literal asset path in `src/` appears in a manifest.
  5. M4: re-encode music to 128 kbps MP3.
- **Targets** [rec]: initial download < 25 MB; total `dist/` < 80 MB. `LevelManager` preloads only the next level's manifest subset.


---

## 19. Implementation Plan

This section is the contract for the parallel build. Rules from tech.md §20 apply:
- Each agent edits **only its own folders**.
- New events, ctx fields and config keys are **requested from core** and are additive only.
- `npm run build && npm run test:unit && npm run smoke` must pass before every hand-off, and the agent must look at its own screenshots in `tests/shots/`.

### 19.1 Amendments to tech.md (core applies them in M0)

| # | tech.md section | Amendment |
|---|---|---|
| A1 | §12.1 `LEVELS`, §19.4 smoke list | Level ids are `meadow, forest, town, gate, bog, keep` (+ `sky` [STRETCH]). Every level accepts a `spawnId`. |
| A2 | §7 Input | RMB → `guard`. New actions: `guard`, `ability`, `milk`, `meow`, `golden`, `recenter`. `input.heldTime(action)` is required. Gamepad lock-on is RB only. |
| A3 | §4 folders | New folder **`src/characters/`**, owned by a new **characters** agent: `buildKitten`, fur, eyes, cape, bow, beast heads, breastplate words. |
| A4 | §4.1 ctx | Add `ctx.env` (world's `Env`), `ctx.strings` (story's resolver: `t(key, vars)`), `ctx.objectives` (world). |
| A5 | §4 ActorRegistry | Add `register(actor, tag?)`, `get(tag)`, `byTag(tag)` for cutscene actor lookup. The tags are the actor ids used in §5. |
| A6 | §9.3 `applyHit` | Add the **`resolveIncoming` hook** and the parry, block and reflect paths (§19.4). Add a crit multiplier, a difficulty multiplier and `dmgMul` (sharpness, Golden Hour). The `HIT` payload gains `parried`, `crit`, `popsSlime`. |
| A7 | §6 / `Game.js` | Add `game.setMode('play' \| 'dialog' \| 'cutscene' \| 'menu' \| 'memecam')`. In `dialog` and `cutscene` modes, only `story`, the scripted actors, `camera`, `fx`, `ui` and `audio` update. |
| A8 | §16 `defaultSave` | Replaced by the schema in §19.7. `hp` and `maxHp` are 8; `holy` is removed. |
| A9 | §1 `vite.config.js`, `package.json` | `build.assetsDir: 'bundle'`. `"build": "vite build && node scripts/prune-assets.mjs"`. |
| A10 | §2 scale note | The head is 38–40% of height (art.md, measured), not about 45%. The sword is about 1.0 m. |
| A11 | §9.1 damage values | The placeholder `dmg` values (1, 2, 5) are replaced by Appendix A (player ×10 scale). |

### 19.2 Agents, files and ownership

| Agent | Owns (create and edit only these) | Key files | Consumes | Produces |
|---|---|---|---|---|
| **core** (integrator) | `index.html`, `package.json`, `vite.config.js`, `src/main.js`, `src/core/**`, `scripts/**`, `tests/smoke.mjs`, `tests/unit/contracts.test.js`, `tests/unit/assets.test.js`, `tests/unit/events.test.js` | `Game.js`, `Loop.js`, `EventBus.js`, `events.js` (§19.5), `config.js` (Appendix A), `Input.js`, `Assets.js` (+ `fitToHeight`, `MODEL_FIT`, manifest preload), `Actor.js`, `ActorRegistry.js`, `GameState.js`, `PostFX.js`, `rng.js`, `math.js`, `debug.js` (hooks, §19.8), `scripts/prune-assets.mjs`, `scripts/encode-music.py` (M4) | — | ctx, the loop, the frozen contracts |
| **physics** | `src/physics/**` | `Physics.js` (`setLevel`, `moveActor`, `separateActors`, `raycast`, `heightAt`, `isDeepWater(x,z)`, `clampToBounds`), `Heightfield.js`, `StaticColliders.js` | LevelData | collision and queries |
| **camera** | `src/camera/**` | `FollowCamera.js` (follow, lock-on, boss distance, tree fade), `CameraShake.js`, `presets.js` (§5.2), `CutsceneCamera.js` (cut, blend, rail, orbit, handheld, whip, fall), `MemeCam.js` (blend in and out, 3.8 s loop sway) | player, physics.raycast, `camera:mode`, `camera:meme` | camera transform |
| **characters** (new) | `src/characters/**` | `KittenBuilder.js` (`buildKitten(cfg)` → `{root, rig, setPose, setHoly, setExpression}`), `Fur.js`, `Eyes.js`, `Bow.js`, `Cape.js` (verlet 9 × 13 plus the sway fallback), `BeastHead.js` (`buildBeastHead(preset, opts)`), `Plate.js` (CanvasTexture words), `configs.js` (every named cat, villager seeds) | art.md | meshes and rigs for player, companions, NPCs and enemies |
| **player** | `src/player/**` | `Player.js`, `PlayerStates.js`, `SwordcatModel.js` (procedural rig and animation, poses `vigil, oath, sip, selfie, faint, kneel, sit, sleep`), `Guard.js` (pure), `Valor.js` (pure), `Lives.js` (pure), `SafeGround.js`, `MemeCamTrigger.js` | input, physics, combat, characters | the Player actor; `player:*` events |
| **combat** | `src/combat/**` | `Combat.js` (`beginSwing`, `updateSwing`, `applyHit` + `resolveIncoming`), `attacks.js` (Appendix A `ATTACKS`), `AttackTokens.js`, `Projectiles.js` (pooled; reflect) | the actor registry | `combat:hit`, `player:parry`, `player:block`, `combat:reflect` |
| **enemies** | `src/enemies/**` | `EnemyManager.js`, `Enemy.js`, `Boss.js` (phase runner, hpFloor), `Dizzy.js` (pure), `clipMaps.js`, `types/{rat_pike, rat_xbow, crow, jelly, spider, hyena, stealer, pug, bonehead, boss_grizzlechop, boss_cacklejaw, boss_brutus, boss_barkus}.js`, `scripted/Pilfer.js`; MVP+ `types/{warhound, bat, hornet, boss_sovereign}.js` | combat, physics, characters (beast heads), assets | `enemy:*`, `boss:*`, `combat:telegraph`, `item:stolen` |
| **companions** | `src/companions/**` | `CompanionManager.js`, `Companion.js`, `abilities.js`, `LostKitten.js` (hidden, reveal, rescue), `NpcActor.js` (scripted cats: Marmalade, Snowpaw, Pearl, Earl Grey, Pip, Tofu, Whiskerbottom, villagers, old knights, Coo), `Pudding.js`, `SpoonBrigade.js`, `HubKittens.js` (activity spots) | characters, physics, state | `companion:*`, `kitten:reveal`, `kitten:rescued` |
| **world** | `src/world/**` | `LevelManager.js`, `LevelKit.js`, `Env.js`, `Arena.js`, `Objectives.js` (ropes, lanterns, The Line, keys), `VigilStone.js`, `Pickups.js` (fish, letters, Heart Bells, breakables), `Terrain.js`, `Grass.js`, `Props.js`, `Sky.js`, `Water.js`, `Hub.js` (stations, Quest Board), `levels/{meadow, forest, town, gate, bog, keep}.js` | assets, physics, enemies (spawn API), companions (kitten and NPC factories) | LevelData, `arena:*`, `objective:progress`, `env:changed`, `level:results` |
| **fx** | `src/fx/**` | `Particles.js`, `SwordTrail.js`, `DamageNumbers.js`, `Telegraphs.js`, `HolyFX.js` (streak, aura hull, sparkles, point light), `Poof.js`, `MistCards.js` (ambient and fog walls), `Horde.js`, `LightRibbons.js` (CS-15), `CloudSea.js` (CS-12, CS-16 flights; §18.3) | bus events | visuals only |
| **audio** | `src/audio/**` | `AudioManager.js`, `musicMap.js`, `sfxMap.js` (§16.2), `procedural.js` (wind, bell, laugh build, heartbeat, shimmer), `babble.js`, `sfxDefs.js` (zzfx) | bus events, `ctx.env` | sound |
| **story** | `src/story/**` | `StoryManager.js` (flags, chapters, triggers → cutscenes), `Cutscene.js` (step runner §5.1), `cutscenes/{cs00..cs16, d01..d06, g01, g02}.js`, `strings.js` (every line in §5–§6), `dialogue/{barks, hub}.js`, `tutorial.js`, `quests.js` | everything via the ScriptedActor API and events | `cutscene:*`, `story:*`, `state:unlock` |
| **ui** | `src/ui/**` | `UI.js`, `hud.js`, `dialog.js`, `menus.js`, `shops.js`, `questBoard.js`, `results.js`, `toasts.js`, `threatArrows.js`, `prompts.js`, `touch.js`, `ui.css`, `fonts.css` | bus, state (10 Hz poll), input | every screen in §14 |
| **save** | `src/save/**` | `SaveManager.js` (schema §19.7, `migrate`) | state | persistence |

Each agent also owns `src/<area>/assets.manifest.js` (the files it loads) and `tests/unit/<area>.test.js`.

**System order** (tech.md §4.2):
- Fixed step: input → story → player → companions → enemies → combat → physics.separate → world (triggers, arenas, objectives, `Env`) → fx.
- Per frame: camera → fx.render → ui → audio.

### 19.3 Shared services (call directly; events only notify)

| Service | API (core methods every agent can rely on after M0) |
|---|---|
| `ctx.enemies` | `spawn(type, pos, opts) → Enemy`; `spawnWave(list, points)`; `despawn(e)`; `list`; `boss` |
| `ctx.companions` | `active` (array); `setActive(ids)`; `spawnNpc(id, pos, facing) → NpcActor`; `spawnKitten(kittenId, pos, hide)`; `pudding` |
| `ctx.levels` | `load(id, spawnId)`; `current`; `anchor(name) → {pos, facing}`; `arenaNear(pos, maxDist = 20) → Arena` (`lock()`, `clear()`); `setVisible(group: 'terrain' \| 'props' \| 'grass', on)` (CloudSea flights) |
| `ctx.env` | `set({fogDensity, fogColor, wind, grade, sun}, dur)`; `contribute(key, {fogAdd \| fogMul})`; `clear(key)`; `preset(name, dur)` |
| `ctx.objectives` | `start(id, cfg)`; `progress(id)`; `freeze(id, on)`; `complete(id)` |
| `ctx.combat` | `beginSwing`, `updateSwing`, `applyHit`, `spawnProjectile(def, owner, pos, dir)`, `tokens` |
| `ctx.fx` | `burst(kind, pos, opts)`; `telegraph(desc) → id` (also via event); `holy(actor, 0..1)`; `mistRing(center, r) → handle`; `horde(on, anchor)` |
| `ctx.audio` | `play2D(id, opts)`; `play3D(id, pos, opts)`; `music(track, fade)`; `laugh(pos, opts)`; `bell(opts)` |
| `ctx.story` | `play(id) → Promise`; `flag(k, v?)`; `isPlaying`; `skip()` |
| `ctx.strings` | `t(key, vars)` (honours `HOMAGE_LINES`) |
| `ctx.state` | `GameState` (§19.7) |
| `ctx.cam` | `mode(name, opts)`; `preset(name, anchor, opts)`; `shake(t)` |

### 19.4 Entity API (frozen at the end of M0)

```js
// core/Actor.js: tech.md §4.3 unchanged, plus these OPTIONAL duck-typed members:
//   tags: Set<string>                      // 'player','enemy','boss','flyer','runner','kitten','npc','scripted'
//   resolveIncoming(attacker, def, hitDir) // → 'hit' | 'block' | 'parry' | 'break' | 'immune'   (Player, Pug, Brutus, Bonehead warrior)
//   onParried(byActor, { gold })           // enemy hook: stagger and dizzy per §7.3 / §11.1
//   onBlocked(byActor, def)
//
// ScriptedActor interface (Player, NpcActor, Companion, Enemy, Pudding): used ONLY by story/Cutscene.js
//   setScripted(on: boolean)               // AI and input off; physics on
//   moveTo(target: Vector3 | anchorName, speed = 2) → Promise<void>
//   face(target: Actor | Vector3 | number, dur = 0.3) → Promise<void>
//   pose(name: string, { hold = true } = {})   // 'vigil','oath','sip','selfie','faint','kneel','sit','sleep','idle'
//   play(clip: string, { once = false, speed = 1, clampEnd = false } = {}) → Promise<void>
//   emote(name: 'earsFlat' | 'tailPuff' | 'blink' | 'nod' | 'shake') // no-op where unsupported
//   prop(name: 'milk_cup' | 'lantern' | 'spoon' | 'letter' | 'pot_helm', on: boolean)
//   attach(toActor: Actor | null, bone?: string)   // ride on Pudding (CS-12, CS-15, CS-16); null detaches
```

**Player** (`player/Player.js`)
- **Read fields:** `stateName`, `hp`, `maxHp`, `lives`, `milk`, `milkMax`, `grit`, `guarding`, `guardT`, `charge` (0..1), `golden`, `valor`, `shards`, `swing`, `god`.
- **Methods:** `teleport({pos, facing})`, `heal(n)`, `addValor(n, reason)`, `setValor(n)`, `resolveIncoming(...)`, plus ScriptedActor.

**Enemy** (`enemies/Enemy.js`)
- **Fields:** `def`, `stateName`, `objectiveRunner`.
- **Methods:** `setState(name)`, `telegraph(kind, desc)` (emits `combat:telegraph`, auto-ended on strike or stagger), `stagger(sec)`, `onParried()`, plus ScriptedActor.

**Boss** (`enemies/Boss.js` extends `Enemy`)
- **Fields:** `phase`, `dizzy`, `dizzyMax`, `hpFloor`.
- **Methods:** `addDizzy(n)`, `fillDizzy()`, `setHpFrac(f)` (test hook), and on Barkus `freeShard()` (what the third phase-3 parry calls).
- **Events:** `boss:start`, `boss:phase` (exactly once per threshold), `boss:dizzy`, `boss:defeated`.

**Companion:** `kittenId`, `napT`, `cooldown`, `useAbility()`. **LostKitten:** `kittenId`, `hidden`, `reveal()`, `rescue()`.

**`Combat.applyHit` with the hook** (combat agent; replaces tech.md §9.3's head):
```js
applyHit(att, tgt, def, { dmgMul = 1, crit = 1 } = {}) {
  if (!tgt.alive || !tgt.hurtable || tgt.invulnT > 0) return 'none';
  _dir.set(tgt.pos.x - att.pos.x, 0, tgt.pos.z - att.pos.z).normalize();
  const r = tgt.resolveIncoming ? tgt.resolveIncoming(att, def, _dir) : 'hit';
  if (r === 'immune') return r;                                   // i-frames (perfect dodge / graze emitted by player)
  if (r === 'parry') { att.onParried?.(tgt, { gold: def.telegraph === 'gold' });
                       this.ctx.game.requestHitstop(cfg.PLAYER.guard.parryHitstop);
                       this.ctx.bus.emit(E.PLAYER_PARRY, { attacker: att, gold: def.telegraph === 'gold', position: tgt.pos.clone() });
                       return r; }
  if (r === 'block') { tgt.vel.addScaledVector(_dir, cfg.PLAYER.guard.pushback * 6); att.onBlocked?.(tgt, def);
                       this.ctx.bus.emit(E.HIT, { attacker: att, target: tgt, attackId: def.id, damage: 0, position: tgt.pos.clone(), dir: _dir.clone(), killed: false, blocked: true });
                       return r; }
  // 'hit' or 'break' (break = the guard was broken; full damage plus breakStagger)
  const diff = this.ctx.state.difficultyCfg, toPlayer = tgt.faction === 'player';
  let dmg = def.dmg * dmgMul * crit;
  if (toPlayer) dmg = diff.roundTaken(dmg); else dmg *= diff.playerDmgMul ?? 1;
  // ... continue exactly as tech.md §9.3 (hp, knockback, invulnT, poise/stagger, hitstop, shake, onHit, death, HIT event + {crit, parried:false})
}
```

**`Guard.resolve` (pure, `player/Guard.js`; the player's `resolveIncoming` calls it):**
```js
export function resolveGuard(g, def, hitDirIntoTarget, facing, cfg) {
  // g: { dodgeT, dodging, guarding, guardT, grit, lockoutT }
  if (g.dodging && g.dodgeT >= cfg.dodge.iframes[0] && g.dodgeT <= cfg.dodge.iframes[1])
    return g.dodgeT <= cfg.dodge.perfect[1] ? 'perfectDodge' : 'graze';         // both → 'immune' for Combat
  if (!g.guarding) return 'hit';
  const fx = Math.sin(facing), fz = Math.cos(facing);
  const frontal = -(hitDirIntoTarget.x * fx + hitDirIntoTarget.z * fz) >= Math.cos(cfg.guard.arc);
  if (!frontal) return 'hit';
  if (def.telegraph === 'red' || def.unblockable) return 'break';
  if (g.guardT <= cfg.guard.parryWindow && g.lockoutT <= 0) return 'parry';
  g.grit -= (def.poise ?? 1) >= cfg.guard.heavyPoise ? 2 : 1;
  return g.grit <= 0 ? 'break' : 'block';
}
```
Projectiles call the same path. On `'parry'`, `Projectiles.reflect(p)` flips the velocity ×1.5, sets `owner = player`, and sets `dmg = reflectDmg`.

### 19.5 Event catalog additions (core adds them to `events.js` in M0; the names are frozen)

| Constant | String | Payload | Emitted by |
|---|---|---|---|
| `GAME_MODE` | `game:mode` | `{ mode }` | core |
| `PLAYER_GUARD` | `player:guard` | `{ on }` | player |
| `PLAYER_GRIT` | `player:grit` | `{ value, max, broken }` | player |
| `PLAYER_PARRY` | `player:parry` | `{ attacker, gold, projectile?, position }` | combat |
| `PLAYER_PERFECT_DODGE` | `player:perfectDodge` | `{ attacker, graze }` | player |
| `PLAYER_VALOR` | `player:valor` | `{ value, max, delta, reason }` | player |
| `PLAYER_GOLDEN` | `player:golden` | `{ on }` | player |
| `PLAYER_LIFE_LOST` | `player:lifeLost` | `{ lives }` | player |
| `PLAYER_STILL_STANDING` | `player:stillStanding` | `{}` | player |
| `PLAYER_MILK` | `player:milk` | `{ phase: 'start' \| 'heal' \| 'cancel', left, max }` | player |
| `PLAYER_MEOW` | `player:meow` | `{ position }` | player |
| `TELEGRAPH` | `combat:telegraph` | `{ id, actor, kind, shape, pos, dir, size, duration }` (`shape`: `glint`, `circle`, `lane`, `cone`, `ring`, `line`, `swirl`, `rings`, `shadow`) | enemies |
| `TELEGRAPH_END` | `combat:telegraphEnd` | `{ id }` | enemies |
| `REFLECT` | `combat:reflect` | `{ projectile, by }` | combat |
| `ENEMY_JEER` | `enemy:jeer` | `{ enemy, on }` | enemies |
| `ENEMY_CHOKE` | `enemy:choke` | `{ enemy }` | enemies |
| `ITEM_STOLEN` / `ITEM_RETURNED` | `item:stolen` / `item:returned` | `{ thief, item, amount }` / `{ item, amount, bonus }` | enemies |
| `BOSS_START` | `boss:start` | `{ boss, id, name, maxHp, phases, dizzyMax }` | enemies |
| `BOSS_DIZZY` | `boss:dizzy` | `{ boss, value, max, dizzy }` | enemies |
| `BOSS_DEFEATED` | `boss:defeated` | `{ boss, id }` | enemies |
| `COMPANION_ABILITY` | `companion:ability` | `{ kittenId, ability, position }` | companions |
| `COMPANION_NAP` | `companion:nap` | `{ kittenId, on }` | companions |
| `COMPANION_CHANGED` | `companion:changed` | `{ active }` | companions |
| `KITTEN_REVEAL` | `kitten:reveal` | `{ kittenId, position }` | companions |
| `CUTSCENE_START` / `CUTSCENE_END` | `cutscene:start` / `cutscene:end` | `{ id }` / `{ id, skipped }` | story |
| `PROMPT` | `story:prompt` | `{ action, hold, textKey, progress, done }` | story |
| `SHARD` | `story:shard` | `{ n }` | story |
| `UNLOCK` | `state:unlock` | `{ kind: 'skin' \| 'cape' \| 'ability', id }` | story |
| `CAM_MODE` | `camera:mode` | `{ mode, preset?, anchor?, blend }` | story, player |
| `MEME_CAM` | `camera:meme` | `{ on }` | camera |
| `ENV_SET` / `ENV_CHANGED` | `env:set` / `env:changed` | `{ ...fields, dur }` / `{ fogDensity, grade, wind }` | story, enemies / world |
| `ARENA_LOCK` / `ARENA_WAVE` / `ARENA_CLEAR` | `arena:lock` / `arena:wave` / `arena:clear` | `{ id }` / `{ id, wave, total }` / `{ id }` | world |
| `OBJECTIVE` | `objective:progress` | `{ id, value, max, textKey, frozen, done }` | world |
| `LEVEL_RESULTS` | `level:results` | `{ levelId, time, kittens, letter, fish, lives, rank }` | world |

The existing tech.md events are reused: `HIT` (gains `parried`, `crit`), `KITTEN_RESCUED {kittenId}`, `ITEM_PICKUP {item: 'fish' | 'letter' | 'heartBell' | 'milk' | 'smallHeart', id?, amount}`, `BOSS_PHASE`, `CHECKPOINT`, `TOAST`, `MUSIC`, `SHAKE`, `HITSTOP`, `BURST`, and `DIALOG_*`.

### 19.6 Data formats
- **Attacks:** tech.md §9.1 fields plus:
  - `telegraph` (`parry`, `gold`, `red`, `aoe`, `aim`, `grab`, `jeer`, `shadow`), `unblockable`, `crit`;
  - `heavy` (scatters bone piles), `guardBreak`, `popsSlime`, `breaks: ['cracked']`;
  - `projectile`, `reflectDmg`, `valor` (`'light'` or `'heavy'`), `iframes`, `timeScale`, `cost`.
  - All values are in Appendix A `ATTACKS`.
- **Enemy type** (`enemies/types/<id>.js`): `{ id, model, fit, radius, height, mass, hp, poise, walk, run, sight, fov, leash, patrolRadius, attacks: [{ id, weight, range, cooldown }], anims, fish, smallHeart, states? }`. Sample in Appendix B.
- **Boss:** an enemy type plus `{ name, dizzyMax, phases: [{ at, moves, weights, windupMul, events: [{ at, spawn | bark | env }] }], hpFloor? }`. Sample in Appendix B.
- **Level:** `defineLevel({...})`. Sample in Appendix B.
- **Cutscene:** `export default { id, skippable, anchor, steps: [...], end: {...} }`, with the step types in §5.1. Sample in Appendix B.
- **Strings:** `export const S = { 'cs03.1': { default: 'Day one of rescuing everyone. Morale: high.' }, ... }`. Keys are referenced from the cutscene `say` steps and the bark tables.
- **Asset manifest:** `export default ['models/creatures/polypizza/Rat.glb', 'audio/sfx/creature/rat_squeak_attack.ogg', ...]`.

### 19.7 GameState and save schema (save key `swordcat.save.v1`; owner: save; tech.md §16 migrate rules)

```js
export const defaultSave = () => ({
  v: 1, levelId: 'meadow', spawnId: 'practice', difficulty: 'knight', playtime: 0, savedAt: 0,
  hp: 8, maxHp: 8, lives: 9, milk: 2, milkMax: 2, fish: 0,
  shards: 0, heartBells: [], kittens: [], letters: [],
  companions: { unlocked: [], active: [] },
  upgrades: { satchel: 0, sharp: 0, quickCharge: false, valorGain: false, waveReach: false },
  cosmetics: { swords: ['borrowed', 'twig'], capes: ['cream'], sword: 'borrowed', cape: 'cream' },
  levels: {},                     // { meadow: { cleared, bestRank, bestTime } }
  flags: {}, memeCamSeen: 0,
  settings: { master: 0.8, music: 0.6, sfx: 0.8, invertY: false, sensitivity: 1, quality: 'auto', shake: 1,
              reduceFlashes: false, holdStand: true, holdCharge: true, autoStand: false, patterns: false,
              subtitleSize: 1, dialogSpeed: 1, touchSize: 1 },
});
```
- Valor is **not** saved (it resets on level load).
- **Autosave** on `CHECKPOINT`, `LEVEL_LOADED`, `KITTEN_RESCUED`, `cutscene:end`, `objective:progress {done}` and shop purchases.
- **Who sets each flag:** `prologue.armour` CS-01 · `prologue.tutorial` tutorial done or skipped · `prologue.done` CS-02 · `meadow.pudding` CS-03 (`'netted'`, then `true` when the ropes are cut) · `meadow.mochi` D-01 · `forest.sage` D-02 · `forest.camp` CS-04 · `forest.boss` CS-05 · `town.marmalade` D-03 · `town.letters` CS-06 · `town.tofu` / `town.earlgrey` / `town.clover` D-04 · `town.free` CS-07 · `gate.pip` D-06 · `gate.pin` the pin is back (hit or Pip) · `gate.line` repair 100% · `gate.boss` CS-09 · `gate.done` CS-10 · `bog.pearl` CS-11 · `bog.done` CS-12 · `keep.gate` CS-13 · `keep.brutus` D-05 · `keep.keys` keys 2/2 · `keep.boss` CS-15 · `ending.seen` CS-16 · `<level>.done` at each level exit (§12.1).
- **Flags:** `prologue.armour`, `prologue.tutorial`, `prologue.done`, `meadow.pudding`, `meadow.mochi`, `meadow.done`, `forest.sage`, `forest.camp`, `forest.boss`, `forest.done`, `town.marmalade`, `town.letters`, `town.tofu`, `town.earlgrey`, `town.clover`, `town.free`, `gate.pip`, `gate.pin`, `gate.line`, `gate.boss`, `gate.done`, `bog.pearl`, `bog.done`, `keep.gate`, `keep.brutus`, `keep.keys`, `keep.boss`, `ending.seen`.

### 19.8 Test hooks (core `debug.js`; only with `?test` or `?debug`; additions to tech.md §19.3)
```js
__GAME__.story = { play: (id) => ctx.story.play(id), flag: (k, v) => ctx.story.flag(k, v), skip: () => ctx.story.skip() };
__GAME__.player = { setValor: (n) => ctx.player.setValor(n), setShards: (n) => { ctx.state.shards = n; },
                    setHp: (n) => { ctx.player.hp = n; } };
__GAME__.cam = { mode: (m) => ctx.cam.mode(m) };
__GAME__.idle = (sec) => ctx.player.memeCamTrigger.fastForward(sec);
__GAME__.boss = { setHpFrac: (f) => ctx.enemies.boss?.setHpFrac(f), phase: () => ctx.enemies.boss?.phase,
                  freeShard: () => ctx.enemies.boss?.freeShard?.() };   // Barkus: skip the 3 P3 parries (hpFloor off)
__GAME__.startBoss = () => ctx.levels.arenaNear(ctx.player.pos)?.lock();     // spawns the boss of the arena at the player's spawn
__GAME__.spawn = (type, x, z) => ctx.enemies.spawn(type, new THREE.Vector3(x, 0, z));
__GAME__.kittens = (n) => { ctx.state.kittens = KITTEN_IDS.slice(0, n); };
__GAME__.objective = (id) => ctx.objectives.progress(id);
__GAME__.events = [];   // ring buffer (200) of emitted event names, for smoke assertions
```

### 19.9 Tests
**Unit tests** (`node --test`; pure modules only; no DOM at import):

| # | Area | Asserts |
|---|---|---|
| U1 | `player/Guard` | Parry at `guardT` 0.149 vs block at 0.151; frontal 69.9° blocks, 70.1° hits; a `red` attack breaks; poise ≥ 3 costs 2 Grit; whiff lockout 0.30 s; perfect-dodge vs graze edges at 0.20 |
| U2 | `player/Valor` | Each gain; per-swing cap 8; Standing Ground cap 30 per Stand and the reset after 0.5 s; Jeer −6/s vs +10/s; hurt −10; Holy cost; the Golden Hour 3 s lock; respawn ×0.5; reset on level load |
| U3 | `player/Lives` | Still Standing fires once per segment and re-arms at a checkpoint; lives decrement; 0 → game over; Kitten = infinite; Nine Lives difficulty uses game scope |
| U4 | difficulty | Damage rounding (Kitten `max(1, floor(×0.5))`, Nine Lives `ceil(×1.5)`); tokens per difficulty |
| U5 | `enemies/Dizzy` | poise × 4; parry +35; gold → full; decay after 2 s at 8/s; 3 s dizzy; ×2 crits |
| U6 | `enemies/Boss` | Each threshold fires exactly once, including two thresholds crossed by one hit (in order); Barkus `hpFloor` holds at 10% until 3 parries |
| U7 | jelly | L → 2 M → 4 S counts; `popsSlime` kills without a split; cap 12 alive |
| U8 | bonehead | Reassemble at 4.0 s; a heavy hit scatters; max 2 reassembles; a warhound fetch removes the pile [MVP+] |
| U9 | stealer | 10%, min 5, max 50; fewer than 5 fish → steals 1 milk; return +5; despawn at 8 s |
| U10 | `world/Objectives` (The Line) | Rate 100/240 per s; pause within 4 m; wave thresholds fire once; pin freeze and resume; progress kept on death |
| U11 | `enemies/clipMaps` | Every mapped clip exists in its GLB (parses the GLB JSON chunk in Node) |
| U12 | `world/levels/*` | Enemy types exist in `ENEMIES`; positions inside bounds; spawn ids and cutscene ids exist; 3 kittens + 1 letter per level; 18 unique kitten ids overall |
| U13 | `story/cutscenes/*` | Only known step types; every `say.key` exists in `strings.js`; every cutscene has `end`, turns the letterbox off and hands the camera back |
| U14 | strings | Every key used in `src/` exists; with `HOMAGE_LINES = false`, no homage text is reachable |
| U15 | assets | Every manifest path exists under `public/assets/`; every literal asset path in `src/` is in a manifest |
| U16 | events | No duplicate strings; every `E.*` used in `src/` exists |
| U17 | save | `migrate` upgrades tech.md's original v1 default (hp 6, holy) to §19.7 |
| U18 | contracts (tech.md) | Every system exports `init`, `update`, `dispose`; ScriptedActor methods exist on Player, NpcActor, Companion, Enemy and Pudding |

**Smoke** (`tests/smoke.mjs`; Playwright with the real-GPU flags from tech.md §19.1). Each agent appends its block:
1. Boot → CS-00 screenshot → `story.skip()` → `meadow`.
2. Move with W; the 3-hit combo.
3. Parry: spawn a scripted `rat_pike`, hold guard on its glint frame, assert `player:parry` is in `__GAME__.events`.
4. `setShards(1)`, `setValor(50)`, hold J for 1.3 s → `holy.png`.
5. `idle(16)` → `memecam.png`, plus the blank check.
6. For each of the 6 levels: `loadLevel(id)` → screenshot; log draw calls and triangles (warn over 150 calls on Med).
7. `gate`: `objective('line')` increases over 3 s with no enemies.
8. Each boss: `loadLevel(id, 'boss')`, walk into the fog-wall disc (or `startBoss()`), `god()`, `boss.setHpFrac(0.01)`, one hit → expect `boss:defeated`, then `cutscene:start`. **Barkus:** call `boss.freeShard()` first; expect `cutscene:start {id: 'cs15'}` (the rally replaces `boss:defeated`, which CS-15's `end` emits).
9. Zero `pageerror`, `console.error` or failed requests.

### 19.10 Milestones (one parallel push)

| Milestone | Scope | Per-agent focus | Exit criteria |
|---|---|---|---|
| **M0 Core** | tech.md Phase 0 + §19.1 amendments; stubs for all 14 systems; the event catalog; Appendix A config; empty strings; `fitToHeight`; placeholder Swordcat (`cats/Cat_Blocky.glb` + `weapons/kaykit/sword_2handed.glb`, fitted to 1.0 m) | core only | `npm run check` green with stubs; the contract tests pass; 6 stub levels boot |
| **M1 Vertical slice: `meadow`** | Prologue + Ch. 1 complete | characters: Swordcat, Mochi, Pearl, Whiskerbottom, squire kittens, **BeastHead (hyena) + breastplate words** (CS-02 needs them), cages, cutscene props. player: the full §7 moveset (Holy and Golden Hour testable via hooks). combat: the full resolve path. enemies: rat_pike, rat_xbow, crow, plus scripted AI-less `hyena`, Cacklejaw and Pilfer actors for CS-02. companions: Mochi, LostKitten, Pudding, NpcActor. world: LevelKit, Env, Arena, `meadow` (practice-field set, Tallbert statue, far skyline, cows). fx: Telegraphs, juice, HolyFX, Horde. camera: presets, Meme Cam. story: CS-00–03, G-01, D-01, tutorial. ui: HUD, dialogue, title, pause, results, touch. audio: maps for meadow, wind, laugh build. save. | Smoke drives `meadow` from `practice` to the bridge exit using hooks. Screenshots are reviewed against ref2 using the **R1 checklist**. U1–U4, U13–U16 green. |
| **M2 Acts I–II** | `forest`, `town` (+ hub), `gate` | enemies: spider, jelly, hyena, stealer, pug, B1, B2, Pilfer. companions: Sage, Clover, hub kittens, Spoon Brigade. world: Objectives (ropes, lanterns, The Line), Hub, Quest Board. story: CS-04–10, D-02–04, D-06, G-02. ui: shops, Quest Board, objective bar, threat arrows. player: Golden Hour. | Every level boots in smoke; B1 and B2 can be beaten with `god`; The Line completes in smoke; the hub shops work; U5–U12 green |
| **M3 Act III** | `bog`, `keep`, ending | enemies: bonehead, Brutus, B3 (hpFloor, shard parries). story: CS-11–16, D-05; credits. world: bog boardwalks and water, keep cellars. fx: light ribbons, CloudSea, the ending env. companions: Pudding ferry and riders (`attach`). audio: procedural bell. | The game is completable end to end via debug teleports with no softlock (smoke fires every trigger and cutscene); U17–U18 green |
| **M4 Ship** | Polish | core: asset prune, music re-encode, dynamic resolution. Everyone: performance against tech.md §18, a balance pass (deaths per arena logged via `?debug`), accessibility, the touch pass. | Desktop 60 fps on Iris Xe at Med; `dist/` < 80 MB; initial load < 25 MB; zero console errors; all tests green |

**MVP+ order** (only after M4 is green):
1. 2 active companions.
2. Warhound + bone fetch.
3. Slime Sovereign.
4. Cape Glide.
5. Bokeh DOF in cutscenes.
6. God rays.
7. Sinking lily pads.
8. Cellar Bats and Hornet Lancers.

### 19.11 Cut order and the never-cut list
**Cut in this order if late:**
1. Every MVP+ item.
2. The Brutus fight → keep CS-14's kneel and the "...You stood" lines, then replace the fight with a 4-pug wave.
3. G-01 Tallbert gag → the statue stays as dressing.
4. Fur shells → sheen fallback.
5. Verlet cape → sway shader.
6. CS-04 Lantern Night → a dialogue-only scene at the campfire (no Pudding pose).
7. `bog` shrinks to 3 zones (maze, landing, pool).
8. Merge `bog` into a short approach at the start of `keep`. **That is the floor: 5 levels.**

**Never cut:**
- the Stand, its meme pose and Standing Ground;
- the **Meme Cam**;
- CS-02 The Laughing Fog;
- CS-03 Milk Break;
- `gate` The Line with CS-08's pull-back of rescued kittens;
- the final boss with CS-15 (HOLD THE STAND) and CS-16.

### 19.12 Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **The procedural Swordcat doesn't read as cute or as "the meme cat"** | Medium | Critical | Build her first (M1). Compare screenshots in `MEME_LOOP` with ref2 against this checklist: bow on her **left** ear; eyes about 0.09 H; pauldrons ≥ head width; cape V-frame; sword ≈ her height; ginger with a cream bib. The placeholder unblocks everyone else meanwhile. |
| R2 | Fur shells look bad or run slowly on the iGPU | Medium | Medium | Quality switch to sheen plus tuft cards; shells on the head only, 16 layers |
| R3 | **GLB scale and orientation chaos** (raw extents 0.01–5.9; ×100 node scales [verified]) | High | Medium | Mandatory `fitToHeight` + `MODEL_FIT`; a smoke assertion of ±10%; facing checked by screenshot in M0 |
| R4 | Beast heads look stitched on | Medium | Medium | `Knight_Helmet` or the hood over the seam; heads 1.3× size; fallback hyenas on `Wolf.glb` |
| R5 | Clip mismatches (Rat has no hit clip; Quaternius spells it `HitRecieve`) | High | Low | Clip maps in data (§10.4); squash fallback; U11 |
| R6 | **Cutscene volume** (17 full, 6 dialogue, 2 gags) | Medium | High | A fixed DSL; reuse the presets; no lip sync or IK; cuts over blends; dialogue-only variants are the cut path (§19.11) |
| R7 | Performance: grass + fog + bloom + fur + 12 skinned meshes | Medium | High | tech.md §18 budgets; at most 8 active enemies; mixers every 2nd frame beyond 20 m; the horde is instanced; dynamic resolution |
| R8 | Levels built without an editor look samey | Medium | Medium | The spine-and-zones format, per-biome prop lists, hand-placed set pieces only, smoke screenshots per zone |
| R9 | Audio gaps (wind, bell, crow, hyena laugh) and taste (the creepy forest track) | High | Low | Procedural builds (§16.3); the audition list; named fallbacks |
| R10 | **IP and legal**: the character's ownership is unverified; several memecoins use the imagery; the captions are token-site text; *The Last Vigil* is a fan series | Medium | High | Original lines by default (§4.4); no token, coin or creator references; title and island names in one constant; the reference media never ship. **Not legal advice; commercial use is [unverified].** |
| R11 | Browser quirks: pointer lock, autoplay, iOS audio interruptions, Ogg on Safari [unverified] | Medium | Medium | Resume audio on gesture and `statechange`; MP3 copies of the Ogg music |
| R12 | **Shipped size** (195 MB `public/assets`) | High | High | §18.4 prune plus re-encode; lazy per-level preload |
| R13 | Parallel agents break each other's interfaces | Medium | High | The frozen §19.4 and §19.5 contracts; additive requests; contract tests; `npm run check` before every hand-off |
| R14 | Balance is untested; too hard for a cute game | High | Medium | Every number in config; Kitten difficulty; telegraphs ≥ 0.45 s; 2 tokens; Still Standing; the M4 balance pass with logged deaths |
| R15 | Touch and mobile performance unknown (only desktop Iris Xe was measured) | High | Medium | A Low preset (4k grass, no shells, no composer); touch is MVP; "mobile 30 fps" is best-effort, not a ship gate |
| R16 | **Pudding's poses**: `Dragon_Evolved` has only flying clips | High | Low | Sleep = the clamped last frame of `Death` or a low `Flying_Idle` [unverified look]; frame shots around it; nods use `Yes` |
| R17 | Vite output colliding with the copied `public/assets` in `dist/assets` | Medium | Medium | `build.assetsDir: 'bundle'` (A9) |
| R18 | Spoon Brigade and rally kitten counts (up to 18 extra in L4, up to 25 lantern-bearers plus Pudding in CS-15 and on Pudding's back in CS-16) | Medium | Medium | Rally and Brigade kittens use the sheen fallback and a static procedural idle; they're instanced where possible |

---

## 20. MVP / MVP+ / Stretch (consolidated)

**MVP (must ship):**
- 6 levels: `meadow` (with the prologue), `forest`, `town` (+ hub), `gate`, `bog`, `keep`.
- Swordcat's full moveset (§7) including Golden Hour, Meow, **Meme Cam**, Nine Lives, Milk, Still Standing.
- Combat feel (§8): telegraphs, juice, Dizzy, threat arrows.
- 9 enemy types; B1, B2, Brutus, B3.
- 3 companions (1 active); 5 service kittens; 18 lost kittens with hub activity spots; the Spoon Brigade.
- Every cutscene in §5.4.
- Shards, shops, 7 skins, 7 capes, 3 Heart Bells, 6 letters.
- Every screen in §14; keyboard and mouse, gamepad, touch; save.
- Audio per §16, including the procedural wind, bell and laugh.
- Quality presets; test hooks; unit and smoke tests; asset prune.

**MVP+ (in order):**
1. 2 active companions.
2. Warhound + bone fetch.
3. Slime Sovereign (B4).
4. Cape Glide.
5. Bokeh DOF.
6. God rays.
7. Sinking lily pads.
8. Cellar Bats and Hornet Lancers.

**STRETCH:**
- `sky`: an interactive dragon-flight level (rail, fireballs, a crow swarm; V4).
- Interactive ending flight.
- Photo Mode with the Meme Cam preset.
- Pip and Earl Grey as companions.
- Frostwhisker Peaks (Ermines, Crow Queen), Whiskerwood tunnels (Mole King), Moonlit Abbey.
- Achievements, localisation, input remapping, local co-op Pearl.
- A dedicated main theme, snow and flight music, and a choir layer (extra CC0 downloads).

---

## 21. Open questions and unverified items
- **Legal:** whether "Swordcat", "Meow Island", the meme look and any caption may be used commercially [unverified]. Fallback names are in §1.
- How the **red tint** looks on `Dragon_Evolved`'s atlas, and the black tint on `Pigeon`'s; whether `Death`'s last frame reads as "asleep" [unverified].
- The yaw facing of each GLB (`MODEL_FIT` yaw = 0 until the M0 screenshot check) [unverified].
- Whether `PickUp` clamped at its lowest frame reads as a kneel for Brutus [unverified].
- The audio fit of `c80_troll_*` and `c80_weird_*` for hyena laughs, `c80_scream_*` for crows, `animal_peeps` for Coo and `animal_whinny` for the donkey; the tone of `dark_forest_creepy` and `victory_8bit_loop` [audition].
- Ogg Vorbis on Safari; gamepad rumble outside Chromium; mobile frame rate [unverified].
- Exact Kenney `bridge-straight` dimensions (the causeway is procedural for this reason) [unverified].
- Which end of `Dragon_Evolved`'s `Body1–4` chain is the tail (CS-04 tail curl) [unverified]; the file has no bone named "Tail" [verified node list].
- The fitted footprint of `building_tower_A_red` at 16 m and the rise of `stairs-wood` (Muffin's loft ledge at (0,50.5) may need nudging to sit on the tower's south face) [unverified].
- Whether the forced-perspective skyline (`fog: false`, §12.3) reads as "far away" rather than "pasted on" [unverified look; fallback: a painted silhouette card].
- All gameplay numbers are untested starting values.

---

## Appendix A: `src/core/config.js` (design numbers; core merges them in M0)

```js
// GAME_DESIGN.md is the source of truth for every number below. Agents read config; no literals.
export const HOMAGE_LINES = false;            // §4.4: keep false until a legal check
export const GRAVITY = 22;

export const PLAYER = {
  height: 1.0, radius: 0.32, mass: 1.0, hpStart: 8, hpMax: 14, lives: 9,
  walk: 2.0, run: 5.5, zoomies: 7.2, zoomiesAfter: 2.0, zoomiesClearRadius: 15,
  accelDamp: 14, decelDamp: 18, airDamp: 4, airMax: 5.5, turnDamp: 16,
  jumpV: 7.4, fallGravityMul: 1.35, jumpCut: 0.5, coyote: 0.12, jumpBuffer: 0.15,
  terminalFall: 14, hardLandSpeed: 9, hardLandLock: 0.15, squashLand: -0.25, stretchJump: 0.18,
  stepUp: 0.3, mushroomBounceV: 9,
  water: { shallowMul: 0.6, deepDamage: 1, safeSamples: 8, safeEvery: 0.5 },
  glide: { fallMax: 1.8, speed: 4.5, maxTime: 1.5 },                                   // MVP+
  dodge: { dur: 0.40, v0: 9, v1: 4, iframes: [0.04, 0.30], cooldown: 0.20, perfect: [0.04, 0.20],
           perfectTimeScale: 0.35, perfectDur: 0.5, perfectValor: 12, perfectCrit: 1.5, perfectCritWindow: 1.2, grazeValor: 4 },
  guard: { enter: 0.08, move: 1.2, turnRate: Math.PI * 2, arc: 1.2217, pushback: 0.4,
           grit: 3, gritRegenDelay: 0.8, gritRegenEvery: 1.5, heavyPoise: 3, breakStagger: 0.8,
           parryWindow: 0.15, touchParryBonus: 0.05, whiffWindow: 0.25, whiffLockout: 0.30,
           parryStagger: 1.2, eliteParryStagger: 0.8, eliteMinPoise: 5, goldParryStagger: 2.0, bossParryDizzy: 35,
           reflectSpeedMul: 1.5, reflectDmg: 25, riposteWindow: 0.8, riposteRange: 4,
           parryHitstop: 0.12, parryTimeScale: [0.5, 0.15], earTell: 0.1 },
  standingGround: { minHold: 1.0, maxSpeed: 0.1, radius: 6, perSec: 5, jeerPerSec: 10, capPerStand: 30, resetAfter: 0.5 },
  charge: { start: 0.35, tier1: 0.60, tier2: 1.10, moveMul: 0.4, holyMinValor: 50, camDist: 3.3, camFov: 42 },
  valor: { max: 100, light: 4, lightPerSwingCap: 8, heavy: 6, parry: 20, riposte: 8, choke: 10, kitten: 25,
           onHurt: -10, jeerDrainPerSec: 6, holyCost: 50, goldenCost: 100, respawnMul: 0.5 },
  golden: { inputWindow: 0.1, activate: 0.8, staggerRadius: 8, staggerDur: 0.5, dur: 8.0, postGameBonus: 3.0,
            dmgMul: 1.5, takenMul: 0.5, speedMul: 1.1, holyChargeTime: 0.5, fogMul: 0.5, bloom: 1.2, valorLockAfter: 3.0 },
  hurt: { stun: 0.35, iframes: 0.9, blinkHz: 15, hitstop: 0.07, shake: 0.3, vignette: 0.3 },
  milk: { sip: 0.9, healAt: 0.5, heal: 4, moveCap: 1.1, start: 2, max: 4 },
  stillStanding: { hp: 1, invuln: 2.0, valor: 30, riseTimeScale: 0.4, riseDur: 0.8 },
  meow: { dur: 0.6, cooldown: 1.0, aggroRadius: 8, kittenRadius: 10 },
  memeCam: { idle: 15, noEnemyRadius: 20, minFog: 0.02, manualHold: 2.5, manualClearRadius: 12,
             blendIn: 2.0, blendOut: 0.6, loop: 3.8, wind: 1.6, mist: 2, captionDelay: 1.0 },
  assist: { angle: Math.PI / 3, range: 3, touchAngle: Math.PI / 2, touchRange: 4, buffer: 0.2 },
  lockOn: { range: 12, cone: 1.745, breakRange: 16, losTimeout: 1.5, flickPx: 40, flickTime: 0.15 },
  smallHeart: { chance: 0.10, heal: 1, magnet: 3 },
};

export const CAMERA = { dist: 3.6, lockDist: 4.5, bossDist: 6.0, ease: 0.6, fov: 45, pitch: [-0.35, 1.1],
                        pivotY: 1.05, autoFollowAfter: 1.5, treeFadeOpacity: 0.3 };

export const ATTACKS = {
  // ---- player (dmg on ×10 scale) ----
  slash1:   { dur: .40, active: [.10, .22], arc: { range: 1.9, from:  1.2, to: -1.2, y0: 0, y1: 1.4 }, dmg: 10, knock: 4, poise: 1, hitstop: .05, shake: .15, lunge: 2.5, combo: [.18, .40], next: 'slash2', valor: 'light' },
  slash2:   { dur: .40, active: [.10, .22], arc: { range: 1.9, from: -1.2, to:  1.2, y0: 0, y1: 1.4 }, dmg: 10, knock: 4, poise: 1, hitstop: .05, shake: .15, lunge: 2.5, combo: [.18, .40], next: 'slash3', valor: 'light' },
  slash3:   { dur: .60, active: [.20, .32], arc: { range: 2.3, from:  1.7, to: -1.7, y0: 0, y1: 1.6 }, dmg: 20, knock: 9, poise: 3, hitstop: .09, shake: .35, lunge: 4.0, rollCancel: .32, valor: 'heavy', heavy: true },
  pounce:   { hang: .12, diveSpeed: 14, arc: { range: .9, from: .9, to: -.9, y0: -1.2, y1: .6 }, dmg: 18, ring: { r: 1.3, dmg: 10 }, knock: 6, poise: 2, hitstop: .07, shake: .25, pogoV: 6, landRecover: .25, valor: 'heavy', heavy: true, breaksShieldFromAbove: true },
  bright:   { dur: .55, active: [.14, .26], arc: { range: 2.6, from:  1.6, to: -1.6, y0: 0, y1: 1.6 }, dmg: 28, knock: 10, poise: 4, hitstop: .10, shake: .40, lunge: 3.0, guardBreak: true, popsSlime: true, breaks: ['cracked'], valor: 'heavy', heavy: true },
  holy:     { dur: .85, active: [.22, .36], arc: { range: 3.6, from: Math.PI, to: -Math.PI, y0: 0, y1: 2.5 }, dmg: 50, knock: 14, poise: 99, hitstop: .14, shake: .60, iframes: [0, .46], timeScale: [.35, .25], cost: 50, minShards: 1, projectile: 'holyWave', projectileMinShards: 2, guardBreak: true, popsSlime: true, heavy: true, breaks: ['cracked'] },
  holyWave: { speed: 14, range: 10, width: 2.4, height: 1.6, dmg: 30, knock: 8, poise: 6, pierce: true, eatsProjectiles: true, popsSlime: true, heavy: true },
  riposte:  { dur: .50, active: [.10, .20], arc: { range: 2.4, from: .3, to: -.3, y0: 0, y1: 1.4 }, dmg: 18, crit: 2, knock: 10, poise: 4, hitstop: .12, shake: .35, lunge: 5.0, valorFlat: 8, heavy: true },
  gleam:    { speed: 18, range: 8, width: 1.2, dmg: 12, knock: 4, poise: 2, pierce: true, popsSlime: true },
  sunburst: { dur: .60, active: [.20, .30], arc: { range: 6, from: Math.PI, to: -Math.PI, y0: 0, y1: 2.5 }, dmg: 40, knock: 16, poise: 99, hitstop: .16, shake: .70, popsSlime: true, heavy: true },
  // ---- enemies (dmg in player HP = half-hearts) ----
  rat_poke:     { telegraph: 'parry', windup: .55, dur: .5, active: [0, .12], arc: { range: 1.8, from: .3, to: -.3, y0: 0, y1: 1.0 }, dmg: 1, knock: 3, poise: 1, hitstop: .07, shake: .2, lunge: 4, recover: .8 },
  rat_poke2:    { telegraph: 'gold',  windup: .30, dur: .5, active: [0, .12], arc: { range: 1.8, from: .3, to: -.3, y0: 0, y1: 1.0 }, dmg: 1, knock: 3, poise: 1, hitstop: .07, shake: .2, lunge: 4, recover: .8, goldStagger: 2.0 },
  rat_bolt:     { telegraph: 'aim', windup: .8, aimLock: .6, projectile: { speed: 16, range: 18, r: .15 }, dmg: 1, knock: 2, poise: 1, reload: 2.0, reflectDmg: 25 },
  crow_dive:    { telegraph: 'shadow', windup: 1.0, track: .6, speed: 12, r: .9, dmg: 2, knock: 5, poise: 1, recover: 1.2 },
  jelly_slam:   { telegraph: 'aoe', windup: .5, leap: 3, air: .6, r: { L: .9, M: .7, S: .5 }, dmg: { L: 2, M: 1, S: 1 }, knock: 4, poise: 1, recover: .8 },
  spider_web:   { telegraph: 'parry', windup: .6, projectile: { speed: 10, range: 7, r: .2 }, dmg: 0, slow: .5, slowDur: 2.0, patch: { r: 1.0, life: 8 }, reflectDmg: 10, recover: 1.0 },
  spider_bite:  { telegraph: 'parry', windup: .45, dur: .4, active: [0, .1], arc: { range: 1.2, from: .6, to: -.6, y0: 0, y1: .8 }, dmg: 2, knock: 3, poise: 1, recover: .9 },
  hyena_slash:  { telegraph: 'parry', windup: .5, dur: .45, active: [0, .14], arc: { range: 1.8, from: 1.0, to: -1.0, y0: 0, y1: 1.5 }, dmg: 2, knock: 5, poise: 2, recover: .7 },
  hyena_lunge:  { telegraph: 'red', windup: .6, from: [3, 5], speed: 6, dur: .4, dmg: 2, knock: 6, poise: 2, recover: .8, unblockable: true },
  stealer_snatch: { telegraph: 'grab', windup: .6, speed: 9, dur: .35, steal: { frac: .10, min: 5, max: 50 }, fleeSpeed: 6, despawnAfter: 8, returnBonus: 5 },
  pug_bash:     { telegraph: 'parry', windup: .6, dur: .4, active: [0, .12], arc: { range: 1.5, from: .5, to: -.5, y0: 0, y1: 1.3 }, dmg: 2, knock: 8, poise: 3, recover: .9, parriedStun: 2.0 },
  pug_slam:     { telegraph: 'red', windup: 1.0, ring: { rMax: 2.5, grow: .4, height: .3 }, dmg: 2, knock: 6, poise: 3, recover: 1.2, unblockable: true },
  pug_chop:     { telegraph: 'parry', windup: .5, dur: .4, active: [0, .12], arc: { range: 1.7, from: .8, to: -.8, y0: 0, y1: 1.4 }, dmg: 2, knock: 4, poise: 2, recover: .8 },
  bone_chop:    { telegraph: 'parry', windup: .5, dur: .4, active: [0, .12], arc: { range: 1.6, from: .8, to: -.8, y0: 0, y1: 1.3 }, dmg: 2, knock: 4, poise: 2, recover: .7 },
  bone_stab2:   { telegraph: 'parry', windups: [.4, .3], arc: { range: 1.6, from: .3, to: -.3, y0: 0, y1: 1.2 }, dmg: 1, hits: 2, knock: 3, poise: 1, recover: .7 },
  bone_bolt:    { telegraph: 'aim', windup: .7, projectile: { speed: 12, range: 12, r: .2 }, dmg: 2, knock: 3, poise: 1, reload: 2.0, reflectDmg: 25 },
  // ---- tutorial props (prologue; can't hurt, can't fail) ----
  dummy_swing:  { telegraph: 'parry', windup: .8, every: 2.0, dur: .4, active: [0, .12], arc: { range: 1.6, from: .8, to: -.8, y0: 0, y1: 1.2 }, dmg: 0, knock: 2, poise: 1, recover: 1.2, parriedSpin: 1.0 },  // Wobble Knight; first glint → 0.25× slow-mo hint once
  sack_swing:   { period: 2.0, r: .3, dmg: 0, knock: 3, poise: 1 },   // swinging sack (0.6 m) on a 1.8 m rope; a hit just knocks her back
  // bosses: see BOSSES.*.moves (same fields)
};

export const ENEMIES = {
  rat_pike:  { model: 'models/creatures/polypizza/Rat.glb', fit: { h: 0.8 }, radius: .30, height: .8, mass: .8, hp: 30, poise: 2, walk: 1.6, run: 3.8, sight: 10, fov: 2.09, leash: 18, patrolRadius: 4,
               attacks: [{ id: 'rat_poke', weight: 1, range: 1.9 }], followUp: { id: 'rat_poke2', chance: .3 }, fleeBelow: .2, fleeDur: 2.0, fish: [2, 3], props: ['kettleHelm', 'spear', 'buckler'] },
  rat_xbow:  { model: 'models/creatures/polypizza/Rat.glb', fit: { h: 0.8 }, radius: .30, height: .8, mass: .8, hp: 20, poise: 1, walk: 1.6, run: 3.6, sight: 16, fov: 2.09, leash: 22,
               attacks: [{ id: 'rat_bolt', weight: 1, range: 16 }], keep: [7, 11], hopBack: { within: 3, dist: 3, cooldown: 3 }, fish: [2, 2],
               weapon: { model: 'models/weapons/kaykit/crossbow_1handed.glb', bone: 'FrontLeg.R', fit: { max: 0.5 } } },
  crow:      { model: 'models/creatures/monsters-flying/Pigeon.glb', fit: { x: 1.2 }, tint: '#17181C', radius: .35, height: .5, mass: .5, hp: 20, poise: 1, fly: { speed: 5, alt: 4, circleR: 5 }, sight: 14, fov: 6.28, leash: 25,
               attacks: [{ id: 'crow_dive', weight: 1, range: 10 }], hittableBelow: 2.2, peck: 1.2, fish: [2, 2], tags: ['flyer'] },
  jelly:     { procedural: 'gloomjelly', sizes: { L: { h: .8, r: .45, hp: 40, fish: 2 }, M: { h: .5, r: .30, hp: 20, fish: 1 }, S: { h: .3, r: .20, hp: 10, fish: 1 }, GIANT: { h: 1.6, r: .9, hp: 120, fish: 10, splitTo: ['M', 2], releases: 'earlgrey' } },
               poise: 1, hopEvery: 1.2, hopDist: 1.5, attacks: [{ id: 'jelly_slam', weight: 1, range: 3 }], split: { L: ['M', 2], M: ['S', 2] }, childInvuln: .3, childPop: 2, maxAlive: 12, sight: 8, leash: 14 },
  spider:    { model: 'models/creatures/polypizza/Spider.glb', fit: { h: 0.5 }, tint: '#4E5A2C', radius: .35, height: .5, mass: .6, hp: 35, poise: 2, burst: { speed: 5, move: 1.2, pause: 1.0 }, sight: 10, fov: 3.14, leash: 16,
               attacks: [{ id: 'spider_web', weight: 1, range: 7 }, { id: 'spider_bite', weight: 2, range: 1.3 }], fish: [3, 3] },
  hyena:     { model: 'models/characters/kaykit/Barbarian.glb', fit: { h: 1.35 }, head: 'hyena', plateWords: ['HATER', 'GRUMBLER', 'NAYSAYER', 'SCOFFER', 'SNEERER', 'SPOILER'],
               hide: ['Barbarian_Head', 'Barbarian_Hat', '1H_Axe', '1H_Axe_Offhand', '2H_Axe', 'Mug', 'Barbarian_Round_Shield'],
               weapon: { model: 'models/weapons/skeleton/Skeleton_Blade.glb', bone: 'handslot.r', fit: { max: 0.9 } },
               radius: .40, height: 1.35, mass: 1.4, hp: 50, poise: 3, walk: 2.0, run: 5.0, sight: 14, fov: 2.44, leash: 22,
               attacks: [{ id: 'hyena_slash', weight: 3, range: 1.9 }, { id: 'hyena_lunge', weight: 1, range: 5, minRange: 3, cooldown: 4 }],
               gloat: { dur: 1.0, chokeStagger: 1.0, chokeValor: 10 },
               jeer: { windup: .5, dur: 2.0, r: 8, cooldown: 12, onlyWithin: 10, fogAdd: .01, maxPerPack: 1 }, flank: { giggleLead: .6 }, fish: [4, 6] },
  stealer:   { model: 'models/characters/kaykit/Rogue_Hooded.glb', fit: { h: 1.2 }, head: 'hyena', plateWords: ['POST STEALER'], hide: ['Rogue_Head_Hooded', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
               radius: .35, height: 1.2, mass: 1.0, hp: 30, poise: 1, walk: 2.0, run: 6.0, sight: 16, fov: 2.79, leash: 30,
               attacks: [{ id: 'stealer_snatch', weight: 1, range: 4 }], fish: [3, 3] },
  pug:       { model: 'models/characters/kaykit/Knight.glb', fit: { h: 1.25 }, head: 'pug', show: ['Rectangle_Shield', '1H_Sword', 'Knight_Helmet'], helmetScale: .9,
               hide: ['Knight_Head', '1H_Sword_Offhand', '2H_Sword', 'Badge_Shield', 'Round_Shield', 'Spike_Shield'],
               radius: .45, height: 1.25, mass: 2.0, hp: 60, poise: 5, walk: 2.5, run: 3.2, turnRate: 2.094, sight: 12, fov: 2.09, leash: 18,
               shield: { arc: 1.2217, brokenBy: ['bright', 'holy', 'pounceFromAbove', 'parry:pug_bash'], downFor: 4.0, stagger: 1.5 },
               attacks: [{ id: 'pug_bash', weight: 3, range: 1.6 }, { id: 'pug_slam', weight: 1, range: 2.5, cooldown: 6 }, { id: 'pug_chop', weight: 2, range: 1.8, onlyShieldDown: true }], fish: [5, 5] },
  bonehead:  { variants: {
                 minion:  { model: 'models/creatures/skeletons/Skeleton_Minion.glb',  hp: 30, poise: 2, attack: 'bone_chop',  weapon: 'models/weapons/skeleton/Skeleton_Blade.glb' },
                 warrior: { model: 'models/creatures/skeletons/Skeleton_Warrior.glb', hp: 45, poise: 3, attack: 'bone_chop',  weapon: 'models/weapons/skeleton/Skeleton_Axe.glb', shield: 'models/weapons/skeleton/Skeleton_Shield_Small_A.glb', blocksFirst: true },
                 rogue:   { model: 'models/creatures/skeletons/Skeleton_Rogue.glb',   hp: 30, poise: 2, attack: 'bone_stab2', weapon: 'models/weapons/skeleton/Skeleton_Blade.glb' },
                 mage:    { model: 'models/creatures/skeletons/Skeleton_Mage.glb',    hp: 25, poise: 1, attack: 'bone_bolt',  weapon: 'models/weapons/skeleton/Skeleton_Staff.glb' } },
               fit: { h: 1.0 }, radius: .35, height: 1.0, mass: 1.0, walk: 1.5, run: 3.5, sight: 12, fov: 2.44, leash: 18,
               reassemble: { after: 4.0, hpFrac: .5, max: 2, scatterBy: 'heavy' }, fish: [3, 3] },
  // MVP+
  warhound:  { model: 'models/creatures/animals/Husky.glb', fit: { z: 1.1 }, tint: '#3A3436', hp: 45, poise: 3, walk: 3.0, run: 7.5, fetch: { radius: 8, chance: .6, chew: 3.0 }, fish: [4, 4] },
  bat:       { model: 'models/creatures/polypizza/Bat.glb', fit: { h: 0.4 }, hp: 10, poise: 0, speed: 6, fish: [1, 1] },
  hornet:    { model: 'models/creatures/polypizza/Wasp.glb', fit: { h: 0.6 }, hp: 25, poise: 1, hover: 1.2, fish: [3, 3] },
};

export const DIZZY = { perPoise: 4, perParry: 35, decayDelay: 2.0, decayPerSec: 8, dur: 3.0, critMul: 2 };

export const BOSSES = {
  grizzlechop: { name: 'CAPTAIN GRIZZLECHOP', hp: 450, poise: 12, dizzyMax: 100, fit: { h: 1.6 }, arenaR: 12, pillars: { n: 6, r: 8, radius: .8, height: 2.5 }, fish: 100,
                 phases: [ { at: 1.00, moves: ['sabreFlurry', 'cheeseToss'], weights: [3, 2], events: [{ at: .80, spawn: [['rat_pike', 2]] }] },
                           { at: 0.60, moves: ['wheelRide', 'sabreFlurry'], weights: [2, 1], wheel: { laps: 3, tele: 1.0, speed: 9, every: 12, laneW: 3, dizzyAfter: 2.0 }, events: [{ at: .60, spawn: [['rat_xbow', 2]] }] },
                           { at: 0.25, moves: ['sabreFlurry', 'cheeseBombs', 'snack'], weights: [2, 2, 1], windupMul: .8, snack: { dur: .8, heal: 30, cooldown: 15 } } ] },
  cacklejaw:   { name: 'WARCHIEF CACKLEJAW', hp: 700, poise: 15, dizzyMax: 120, fit: { h: 2.2 }, gloat: 1.5, fish: 120,
                 phases: [ { at: 1.00, moves: ['cackleCombo', 'laughQuake'], weights: [3, 2] },
                           { at: 0.60, moves: ['ratioRush', 'cackleCombo'], weights: [2, 2], rush: { dashes: 3, tele: .8, speed: 12, blockPush: 2, blockGrit: 2, stumble: 2.5 }, events: [{ at: .60, spawn: [['stealer', 2]] }] },
                           { at: 0.30, moves: ['cackleCombo', 'laughQuake'], weights: [3, 1], windupMul: .85, clones: { n: 3, windupMul: 1.2, respawnEvery: 10 }, fog: .09 } ] },
  brutus:      { name: 'SIR BRUTUS, CHAMPION OF THE LEGION', hp: 400, poise: 12, dizzyMax: 100, fit: { h: 1.9 }, fish: 50,
                 phases: [ { at: 1.00, moves: ['overheadChop', 'wideSweep', 'shoulderCharge'], weights: [2, 2, 1] },
                           { at: 0.50, duel: { exchanges: 3, windup: 1.0, parryGrace: .05, missDmg: 2, retryAfter: 2.0, guardMul: .5 } } ] },
  barkus:      { name: 'LORD BARKUS GRIMJAW', hp: 1500, poise: [25, 25, 20], dizzyMax: 200, fit: { h: 3.0 }, arenaR: 10, fish: 250,
                 phases: [ { at: 1.00, moves: ['cleaverCombo', 'bigBark', 'boneMerang', 'backKick'], weights: [3, 2, 2, 1] },
                           { at: 0.65, moves: ['cleaverCombo', 'spinToWin', 'boneToss', 'howl'], weights: [3, 2, 2, 0], events: [{ at: .65, spawn: [['pug', 2], ['bonehead:minion', 2]] }, { at: .50, spawn: [['pug', 2], ['bonehead:minion', 2]] }] },
                           { at: 0.35, moves: ['shardSlam', 'cleaverCombo'], shardSlam: { every: 6, tele: .8, dmg: 2, blockChip: 1, parriesNeeded: 3, dizzyAfter: 5 }, windupMul: .85, hpFloor: .10 } ],
                 rallyAt: .10 },
  sovereign:   { name: 'THE SLIME SOVEREIGN', hp: [300, 150, 60], counts: [1, 2, 4], sizes: [4, 2.8, 1.8], dizzyMax: 80, fish: 100 },   // MVP+
};

export const COMPANIONS = {
  maxActive: 1, maxActiveAfterGate: 2 /* MVP+ */, hp: 8, napTime: 8, follow: 2.5, teleportBeyond: 15, teleportLos: 4, engage: 6, dmg: 5, rate: 1.6, tokenShare: .2,
  mochi:  { ability: 'shieldWall', cd: 18, dist: 1.5, width: 3.0, height: 1.6, dur: 4.0, taunt: 6, staggerAttacker: 1.0, milkBonus: 1 },
  sage:   { ability: 'volley', cd: 14, arrows: 5, over: .6, targets: 3, range: 14, dmg: 8, groundFlyers: 3.0, passive: { flyerEvery: 2.5, flyerDmg: 6, sparkleRadius: 15 } },
  clover: { ability: 'mend', cd: 30, channel: 1.0, heal: 4, over: 3.0, cleanse: ['slow'], passive: { outOfCombatEvery: 20, heal: 1 } },
  spoons: { every: 2.0, perThree: 1, dmg: 5, range: 12 },
};

export const DIFFICULTY = {
  kitten: { taken: (d) => Math.max(1, Math.floor(d * .5)), lives: Infinity, tokens: [1, 1], enemyHp: .8,  windup: 1.25, parry: .25, p3BlockIsParry: true },
  knight: { taken: (d) => d,                                lives: 9,        tokens: [2, 2], enemyHp: 1.0, windup: 1.0,  parry: .15 },
  nine:   { taken: (d) => Math.ceil(d * 1.5),               lives: 9, livesScope: 'game', tokens: [3, 2], enemyHp: 1.25, windup: .9, parry: .12 },
};

export const ECONOMY = {
  fish: { silver: 1, gold: 10, crate: [1, 3], magnet: 2 },
  shops: { satchel: { cost: [100, 200], max: [3, 4] }, sharp: { cost: [120, 240, 400], mul: [1.15, 1.30, 1.50] },
           quickCharge: { cost: 200, tier1: .45, tier2: .85 }, valorGain: { cost: 150, mul: 1.25 }, waveReach: { cost: 200, range: 15, needShards: 2 },
           cape: 80 },
  skins: { borrowed: 'start', twig: 'start', fishbone: { kittens: 6 }, baguette: { kittens: 12 }, diamond: { kittens: 18 }, toobig: { flag: 'keep.brutus' }, dawnblade: { flag: 'ending.seen' } },
  capes: { cream: 'start', red: { flag: 'town.free' }, memeWhite: { memeCam: 1 }, blue: 80, green: 80, midnight: 80, gold: { flag: 'ending.seen' } },
  heartBells: 3, lettersRefund: 100, replayFishMul: .6,
};

export const LINE = { durationAtFullRate: 240, winch: [0, 41], winchRadius: 4, lanes: [[-4, -58], [0, -58], [4, -58]],
  waves: [ { at: 0,   spawn: [['hyena', 4]], runners: 1 },
           { at: .20, spawn: [['hyena', 3], ['stealer', 2]], runners: 2, pinThief: true },
           { at: .45, spawn: [['hyena', 3], ['rat_xbow', 2], ['crow', 3]], runners: 1 },
           { at: .70, cutscene: 'cs08', then: [['hyena', 6], ['pug', 1]], runners: 2, spoons: true },
           { at: .85, cutscene: 'g02' } ],
  trickle: { every: 15, spawn: [['hyena', 2]], runners: 1 } };

export const TELEGRAPH = { colors: { parry: '#FFFFFF', gold: '#FFD34D', red: '#FF3B30', aoe: '#FF6A3D', aim: '#FFFFFF', grab: '#9B5CFF', jeer: '#B07CFF', shadow: '#000000' },
                           minLead: { parry: .45, gold: .6, red: .6, aoe: .5, aim: .8, grab: .6, jeer: .5, shadow: 1.0 }, arrowRadius: 15, maxArrows: 4, decalPool: 32 };

export const JUICE = { light: { hitstop: .05, shake: .15, rumble: [.25, 0, 60] }, heavy: { hitstop: .09, shake: .35, rumble: [.4, .5, 120] },
                       holy: { hitstop: .14, shake: .6, rumble: [.8, .8, 250], bloom: [.55, 1.2, .4], fovPunch: 5 }, parry: { hitstop: .12, shake: .25, rumble: [.3, .7, 90] },
                       block: { hitstop: .04, shake: .1, rumble: [.2, .2, 60] }, guardBreak: { hitstop: .08, shake: .4, rumble: [.5, .5, 150] },
                       kill: { hitstopAdd: .04, shakeAdd: .1 }, hurt: { hitstop: .07, shakeMul: 1.4, rumble: [.6, .3, 150] }, dizzy: { hitstop: .1, shake: .3, rumble: [.3, .3, 120] } };

export const MODEL_FIT = { /* see §18.1 table; { path: { axis, target, yaw } } filled by core in M0 */ };
```

---

## Appendix B: sample data files (authoritative shapes; agents copy these)

### B.1 Level: `src/world/levels/meadow.js` (excerpt)
```js
import { defineLevel } from '../LevelKit.js';
export default defineLevel({
  id: 'meadow', size: 200, res: 200, seed: 11, hills: { amp: 1.5, octaves: 3 }, pathWidth: 6,
  env: { default: 'meadow_day', byFlag: [['!prologue.done', 'meadow_night']] },
  music: { explore: 'field_of_dreams', combat: 'battle_fast_fight_loop' },
  spine: [[0,-80],[0,-62],[-6,-50],[-22,-30],[-20,-4],[2,18],[24,40],[30,62],[30,90]],
  spawns: { title: [0,-64,Math.PI], practice: [-10,-90,0], start: [-4,-58,0], boss: [30,66,0] },   // [x, z, yaw]; yaw 0 faces +Z
  // `placed`: hand-placed single props/creatures inside a zone ({ model, at, fit, yaw, clip?, meowWakes? })
  anchors: { bell_far: [-130,-20,30], horde_a: [-40,-45], horde_b: [30,-55], crane_bell: [-60,-40,25], crane_field: [0,-70,3],
             pud_1: [20,36], pud_2: [36,50], pud_3: [40,72], pud_4: [22,84] },
  zones: [
    { id: 'practice', kind: 'setpiece', at: [0,-80], size: [40,40], props: 'practiceField', tutorial: true, onlyIf: '!prologue.done' },
    { id: 'tallbert', kind: 'trigger', at: [0,-61], r: 2.5, play: 'g01', when: 'prologue.tutorial', once: true },
    { id: 'lane', kind: 'trigger', at: [-6,-52], r: 3, play: 'cs02', when: 'prologue.tutorial', once: true },
    { id: 'vigil_1', kind: 'checkpoint', at: [-16,-36] },
    { id: 'crossroads', kind: 'open', at: [-22,-30], r: 10, spawns: [['rat_pike',2,[-14,-42],4], ['rat_pike',2,[-24,-32],2], ['rat_xbow',1,[-24,-33],0,{ y: 1.2 }]] },
    { id: 'noodle', kind: 'kitten', kittenId: 'noodle', at: [-30,-26], hide: 'meow', prop: 'barrel' },
    { id: 'letter_1', kind: 'letter', letterId: 'l1', at: [-18,-24] },
    { id: 'stones', kind: 'arena', at: [-20,-4], r: 12, props: 'stoneRing8',
      waves: [[['rat_pike',3]], [['rat_pike',3],['rat_xbow',1]]] },
    { id: 'button', kind: 'kitten', kittenId: 'button', at: [-20,-4], hide: 'stand', standTime: 3.0, needClear: 'stones' },
    { id: 'vigil_2', kind: 'checkpoint', at: [-12,8] },
    { id: 'glade', kind: 'arena', at: [2,18], r: 14, lockOn: 'cs03:end', objective: { id: 'net_ropes', max: 3 },
      interact: { id: 'picnic', at: [0,16], play: 'cs03' },
      waves: [[['rat_pike',4]], [['rat_pike',3],['rat_xbow',1]]] },
    { id: 'crowfields', kind: 'open', at: [24,40], size: [50,40], props: 'wheatField',
      spawns: [['crow',4,[24,40],8], ['rat_xbow',1,[16,46],0,{ y: 1.0 }], ['rat_xbow',1,[32,34],0,{ y: 1.0 }]],
      placed: [{ model: 'models/creatures/animals/Cow.glb', at: [40,30], fit: { h: 1.6 }, yaw: -Math.PI / 2, clip: 'Idle_Headlow', meowWakes: true }] },
    { id: 'biscuit', kind: 'kitten', kittenId: 'biscuit', at: [41.5,30], hide: 'meow', prop: 'cow' },
    { id: 'vigil_3', kind: 'checkpoint', at: [28,52] },
    { id: 'bridge', kind: 'arena', at: [30,70], r: 12, props: 'oldBridge', rescue: { companion: 'mochi', cage: [30,74], hp: 30, play: 'd01' },
      waves: [[['rat_pike',3],['rat_xbow',1]], [['rat_pike',3],['rat_xbow',2]], [['rat_pike',4],['crow',2]]] },
    { id: 'exit', kind: 'exit', at: [30,92], size: [8,2], to: 'forest', spawnId: 'start' },
  ],
  water: [{ kind: 'stream', from: [-100,62], to: [100,62], width: 8, y: -0.4, deep: true }],
  scatter: [ { model: 'models/env/nature/stone_tallB.glb', n: 30, fit: { h: [1.5, 3] }, minDistFromPath: 5 },
             { model: 'models/env/nature/tree_oak.glb', n: 25, fit: { h: [8, 12] }, minDistFromPath: 10 },
             { model: 'models/env/graveyard/hay-bale.glb', n: 12, fit: { h: 1.0 }, minDistFromPath: 3 } ],
  fishLines: [[[0,-55],[-10,-42],5], [[-20,-18],[-5,10],6]], crates: 12,
});
```

### B.2 Cutscene: `src/story/cutscenes/cs03.js` (Milk Break)
```js
export default {
  id: 'cs03', skippable: true, anchor: 'swordcat',
  steps: [
    { t: 'ui', letterbox: true, hud: false },
    { t: 'music', track: null, fade: .8 },
    { t: 'actor', id: 'swordcat', pose: 'selfie', prop: 'milk_cup' },
    { t: 'cam', preset: 'SELFIE', anchor: 'swordcat', mode: 'cut' },
    { t: 'sfx', id: 'pickup/bubble2', at: 'swordcat' },
    { t: 'say', who: 'swordcat', key: 'cs03.1', auto: 2.4 },
    { t: 'say', who: 'swordcat', key: 'cs03.2', auto: 1.6 },
    { t: 'fx', shake: .2 }, { t: 'actor', id: 'swordcat', emote: 'earsFlat' }, { t: 'wait', dur: .6 },
    { t: 'cam', preset: 'WHIP_FALL', anchor: 'swordcat', dur: .53 },
    { t: 'spawn', id: 'pudding', type: 'pudding', at: [2, 0, 30], facing: Math.PI },
    { t: 'par', steps: [
        { t: 'actor', id: 'pudding', moveTo: [2, 0, 24], speed: 4 },
        { t: 'actor', id: 'pudding', clip: 'Headbutt', once: true },
        { t: 'sfx', id: 'creature/creature_roar_02' }, { t: 'sfx', id: 'creature/c80_roar_01', rate: .8 },
        { t: 'fx', shake: .8 }, { t: 'env', wind: 3.0, dur: .1 } ] },
    { t: 'wait', dur: 1.2 }, { t: 'env', wind: .6, dur: .5 },
    { t: 'cam', preset: 'HERO_LOW', anchor: 'swordcat', mode: 'cut' },
    { t: 'actor', id: 'swordcat', pose: 'oath', prop: 'milk_cup' },
    { t: 'cam', preset: 'TWO_SHOT_LOW', anchor: 'swordcat', target: 'pudding', mode: 'cut' },
    { t: 'say', who: 'pudding', key: 'cs03.3' }, { t: 'say', who: 'swordcat', key: 'cs03.4' },
    { t: 'say', who: 'pudding', key: 'cs03.5' }, { t: 'say', who: 'swordcat', key: 'cs03.6' },
    { t: 'say', who: 'pudding', key: 'cs03.7' }, { t: 'say', who: 'swordcat', key: 'cs03.8' },
    { t: 'say', who: 'pudding', key: 'cs03.9' }, { t: 'say', who: 'swordcat', key: 'cs03.10' },
    { t: 'say', who: 'pudding', key: 'cs03.11' }, { t: 'say', who: 'pudding', key: 'cs03.12' },
    { t: 'say', who: 'swordcat', key: 'cs03.13' },
  ],
  end: { flags: { 'meadow.pudding': 'netted' }, actors: { swordcat: { prop: { milk_cup: false } }, pudding: { pos: [2, 0, 24], pose: 'netted' } },
         objective: { id: 'net_ropes', textKey: 'obj.ropes', max: 3 }, arena: { id: 'glade', lock: true },
         music: { track: 'battle_fast_fight_loop', fade: .5 }, ui: { letterbox: false, hud: true }, cam: 'follow' },
};
```

### B.3 Enemy type: `src/enemies/types/hyena.js`
```js
import { ENEMIES } from '../../core/config.js';
import { E } from '../../core/events.js';
export default {
  id: 'hyena', ...ENEMIES.hyena,
  anims: { idle: 'Idle', patrol: 'Walking_A', chase: 'Running_A', hit: 'Hit_A', die: 'Death_A', gloat: 'Cheer', jeer: 'Cheer',
           hyena_slash: { windup: { clip: '1H_Melee_Attack_Slice_Horizontal', from: 0, to: .35, speed: .6 }, strike: { clip: '1H_Melee_Attack_Slice_Horizontal', from: .35, to: 1, speed: 1.3 } },
           hyena_lunge: { windup: { clip: '1H_Melee_Attack_Stab', from: 0, to: .3, speed: .5 }, strike: { clip: '1H_Melee_Attack_Stab', from: .3, to: 1, speed: 1.4 } } },
  states: {   // overrides merged onto tech.md §10 BASE_STATES
    gloat: { enter(e) { e.play('Cheer'); e.ctx.audio.laugh(e.pos); }, update(e) { if (e.stateT > e.def.gloat.dur) e.setState('chase'); } },
    jeer:  { enter(e) { e.telegraph('jeer', { shape: 'rings', r: e.def.jeer.r, duration: e.def.jeer.windup + e.def.jeer.dur });
                        e.ctx.bus.emit(E.ENEMY_JEER, { enemy: e, on: true }); e.ctx.env.contribute(`jeer:${e.id}`, { fogAdd: e.def.jeer.fogAdd }); },
             update(e) { if (e.stateT > e.def.jeer.windup + e.def.jeer.dur) e.setState('chase'); },
             exit(e)   { e.ctx.bus.emit(E.ENEMY_JEER, { enemy: e, on: false }); e.ctx.env.clear(`jeer:${e.id}`); } },
  },
  onHitWhile: { gloat: 'choke', jeer: 'choke' },   // Enemy.onHit → choke: stagger 1.0, emit enemy:choke, player.addValor(10,'choke')
};
```

### B.4 Boss phase table: `src/enemies/types/boss_barkus.js` (excerpt)
```js
import { BOSSES } from '../../core/config.js';
export default {
  id: 'boss_barkus', boss: true, ...BOSSES.barkus,
  model: 'models/characters/kaykit/Knight.glb', head: 'bulldog', headOpts: { jowls: true, underbite: true, eyepatch: true, hornedHelm: true },
  show: ['Knight_Cape'], tint: { Knight_Cape: '#22242A' }, hide: ['Knight_Head', 'Knight_Helmet', '1H_Sword', '1H_Sword_Offhand', '2H_Sword', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield'],
  weapon: { model: 'models/weapons/quaternius/Claymore.glb', bone: 'handslot.r', fit: { max: 2.2 }, emissiveEdge: '#FF3B30' },
  collarShard: { bone: 'chest', offset: [0, .15, .25], size: .15, color: '#FFE3A3' },
  moves: {
    cleaverCombo: { chain: [ { atk: 'barkus_sweep', telegraph: 'parry', windup: .6, dmg: 3, arc: { range: 3.2, from: 1.4, to: -1.4 }, clip: '2H_Melee_Attack_Slice' },
                             { atk: 'barkus_back',  telegraph: 'parry', windup: .4, dmg: 3, arc: { range: 3.2, from: -1.4, to: 1.4 }, clip: '2H_Melee_Attack_Slice' },
                             { atk: 'barkus_slam',  telegraph: 'red',   windup: .9, dmg: 4, crack: { len: 4, linger: .5, dmg: 1 }, clip: '2H_Melee_Attack_Chop' } ] },
    bigBark:    { telegraph: 'aoe', shape: 'cone', angle: 1.22, range: 8, windup: .5, dmg: 1, knock: 10, cancelsCharge: true },
    boneMerang: { telegraph: 'aim', windup: .7, path: 'outAndBack', range: 12, speed: 10, dmg: 2, parryReturn: { dmg: 30, dizzy: 30 }, clip: 'Throw' },
    backKick:   { telegraph: 'parry', windup: .4, behindWithin: 2, dmg: 1, knock: 8, clip: 'Unarmed_Melee_Attack_Kick' },
    spinToWin:  { telegraph: 'red', shape: 'ring', r: 2.8, windup: .9, spin: 2.5, tick: .5, dmg: 2, dizzyAfter: 1.5, clip: '2H_Melee_Attack_Spinning' },
    boneToss:   { telegraph: 'aim', windup: .6, count: 3, speed: 9, bounce: true, dmg: 1, reflectDmg: 15, clip: 'Throw' },
    howl:       { windup: 1.2, clip: 'Cheer', sfx: 'creature/c80_howl' },
    shardSlam:  { telegraph: 'gold', windup: .8, dmg: 2, musicDuck: true, onPerfectParry: 'crackChain', clip: '2H_Melee_Attack_Chop' },
  },
  onPhase: { 1: { cutsceneBeat: 'helmShatter', bark: 'barkus.p2' }, 2: { bark: 'barkus.p3', detachShard: true } },
  onRally: { play: 'cs15' },
};
```

*End of document.*
