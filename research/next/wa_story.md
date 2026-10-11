# WA-STORY: re-toning SWORDCAT from "dark medieval" to "warm fun adventure"

Lens: story tone. Design only; nothing under `src/` was touched. Implementation owner: **story** (`src/story/strings.js`,
`src/story/cutscenes/*`, `src/story/dialogue/*`, `src/story/tutorial.js`), with small asks to **enemies/config**
(plate words), **audio** (track picks) and **companions** (banter timer). Respects ART_WARM_SPEC (§2.1 mood rule,
D14 `hub_hush`, K9 Fredoka only, "Morning Practice") and PERF_SPEC (no post-processing in play, no new draws for
any proposal here except the optional hub cameos in §6.3, which are swaps rather than additions).

Reference: "Ghibli meets Paddington meets Adventure Time": everyone is a bit ridiculous, nobody is evil, kindness is
the strongest move, and the jokes come from character rather than winking. The meme lore stays: Swordcat, the pink
bow, the misty fields, the Stand pose, nine lives, "Too small for the sword", the HATER plates, two spoons.

---

## 0. Diagnosis: what reads as "dark medieval" today

What the player sees (screens `04-cs02-laugh.png`, `13-d01-mochi.png`) and reads (`strings.js`, GAME_DESIGN §2–§4):

| Source of darkness | Where | Why it hurts |
|---|---|---|
| Grey fog wall, silhouetted horde, "far drums", the sun torn out | CS-02 (`cs02.js` steps 1, 11) | The first story scene is a night raid. The player's first emotion is dread. |
| Faction words: *Hound **Legion***, *Dog **Warlord***, *Grim**jaw***, *War**chief***, *smugglers*, *cages*, *occupied*, *storm-dark cliff fortress*, *blood-red trim*, *bone sigil*, *red-hot cleaver* | GDD §2.4, §3.7, `cs05.2–3`, `cs07.1`, `cs10.7–8`, quests | It's military-occupation vocabulary, and it pulls the whole game toward grim fantasy. |
| *The Gloom* as a literal story force; the hub "turns grey" | GDD §2.2, `cs10.js` `hub_grey` | Grey is now banned by ART §2.1 ("sad beats use lavender and blue, never grey"). |
| *Boneheads*: animated skeleton soldiers in the *Kennel Cellars* | GDD §10, `tut.bones`, `kitten.crumpet` | Undead are horror coding. |
| "Eighth life. **Gone**." Marmalade in bed, lament music | `cs10.2`, `cs10.js:81` | It reads as a near-death. It's the game's low point and it lands as grief rather than as "aww". |
| "Stay down, little thing." / "Why won't you STAY DOWN?" | `cs15.1–2` | Bully language at the climax. |
| Enemy alert barks: "Nobody's coming for you!" | `bark.hyena.alert.3` | It's genuinely mean, and it repeats every fight. |
| Music: `dark_forest_creepy`, `story_lament_warriors_soul` used 5x, `victory_8bit_loop` | GDD §16.1 | Creepy, dirge and "90s" cues. The user explicitly asked for no 90s nostalgia. |
| Fonts: Cinzel Decorative boss bar, parchment scroll ribbon | GDD §11.1, UI | Already being removed (K9, ART §2.1). Listed here so story copy doesn't lean on "ye olde" phrasing either. |

Most of the existing *writing* is already warm and funny (Pudding, Mochi, Earl Grey, Lantern Night, the knighting).
The fix is **framing and vocabulary, not a rewrite of the heart**: make the stakes about *home, friends and a
sunny morning* rather than *invasion and loss*, and make every villain end up as a friend.

---

## 1. Revised logline, premise and pillars

**Logline (replaces GDD §1):**
> *When a grumpy bulldog pinches the Sunbell's gem so the sun will shine only on HIS steps, Meow Island oversleeps into
> a misty, yawny morning, and every squire gets scooped up to be a royal dog-ear-scratcher. The smallest would-be
> knight on the island, one ear-tuft too short for the sword, borrows some very big armour and sets off to bring
> everyone home. She bonks every bad guy along the way, and every one of them ends up a friend.*

**Pitch bullets (replace GDD §1 "Pitch"):**
- Clementine fails the Academy height chart by one ear-tuft, one sleep before Knighting Day.
- That evening the sun "goes to bed early": Lord Barkus's Woof Brigade plucks the Dawnstone out of the Sunbell.
  The giggling Snickerpack scoops up every squire in polka-dot kitten carriers, little sister Pearl included.
  Barkus wants a fan club for his private sunbeam.
- She plants herself in their path in borrowed armour. They laugh, and they walk *around* her.
- She follows anyway, across six misty, sunny-in-patches lands. She makes friends faster than she makes enemies,
  and a giant red dragon who is scared of everything tags along.
- At the end she shares the sunny steps with the dog who stole them, and rings the morning back in.

**Theme (sharpened):** *Small isn't weak. Brave is just staying. **And nobody is too grumpy to be a friend.***

**New fourth pillar (replaces "Fog to gold"):** **Mist to morning.** The island isn't dying. It's *oversleeping*.
Without the Dawnstone the sun won't get up, so the meadow mist (the meme look) never burns off. Each shard Clem
recovers lets the world wake up a little: more birds, more butterflies, more villagers out. The fog-density story
variable stays exactly as it is (ART D13), and only the *meaning* and colours change.

**Pillar 5: Bonk, don't break.** Enemies are never "killed". They get **bonked**: stars, a helmet pops off, a
sparkle poof, and they toddle off to a "time-out picnic". Every boss fight ends with a **Befriend beat** (§3). This
is all wording plus existing FX (STAR4 burst, X24): 0 new draws.

---

## 2. World vocabulary swaps (global; strings + GDD only, ids unchanged)

Code ids (`bonehead`, `jelly`, `hub_grey`, `keep`, `Legion` in comments) **stay** so no test or data file breaks.
Only display text and the GDD prose change.

| Old (display / GDD) | New | Note |
|---|---|---|
| The Hound Legion | **the Woof Brigade** | Barkus's dogs. Pugs are "Brigadiers". |
| Lord Barkus Grimjaw, the Dog Warlord | **Lord Barkus Grumpjaw, the Grumpiest Dog in the North** | `name.barkus` stays "Lord Barkus". |
| Warchief Cacklejaw | **Big Chief Cacklejaw** | Keeps the alliteration. |
| The Gloom | **the Big Yawn** (the island oversleeps) | Story cue `hub_grey` → ART's `hub_hush` lavender. Villagers yawn. |
| Gloomjelly | **Wobblejelly** | Tip text only; id `jelly` stays. |
| Bonehead (animated bone soldier) | **Squeakybone**: a chew-toy knight made of rubber dog bones. It clatters apart, then squeaks back together. | Same mechanic. Art ask: bone tint `#F3E6C8`, a red rubber knob `#E46A5A`, squeak SFX on reassemble. |
| cages / cage cart / war-wagon | **kitten carriers** (polka-dot pet carriers) / carrier cart / snack wagon | Art ask only. Rescue verbs stay. |
| smugglers' landing | **the ferry dock** | |
| occupied town | **the town the Woof Brigade moved into** ("they don't even wipe their paws") | |
| storm-dark cliff fortress | **a big drafty dog-castle at sunset**, braziers become barbecue grills | Env stays `keep_storm` per ART D13. Only copy changes. |
| Bogmire | **Glimmerbog** | Lily pads, fireflies and will-o'-wisps already lean magical. |
| red-hot cleaver | **the Big Squeaky Bone** (giant bone mallet) | Same hitbox and timings. Art ask: swap the `Claymore.glb` look for a bone club, edge emissive `#FF3B30` becomes the telegraph rim colour only during windups (ART D10). It squeaks on hit. |
| ballista bolt (Marmalade's sacrifice) | **a ballista-launched tennis ball the size of a cart wheel** | Same anim. Ties the dog theme to the bonk theme. |
| "Death" / defeated | **bonked** | HUD and toasts. |

Plate-word redemption (**the HATER plates flip**). This keeps the TREND V2 meme and pays it off:

```js
// src/core/config.js ENEMIES.hyena (proposal; enemies owner)
plateWords:       ['HATER', 'GRUMBLER', 'NAYSAYER', 'SCOFFER', 'SNEERER', 'SPOILER'],
plateWordsFriend: ['FAN',   'GIGGLER',  'YAYSAYER', 'HUGGER',  'CHEERER', 'SPOONER'],
// stealer: 'POST STEALER' -> 'POSTMASTER'; Cacklejaw: 'HATER-IN-CHIEF' -> 'HYPE-IN-CHIEF'
```

When a hyena is bonked, its plate swaps to the friend word **0.25 s before** the sparkle poof (the player sees
"~~HATER~~ FAN" for a beat). Cost: pre-bake both words into the existing plate CanvasTexture at spawn (2 rows, the
UV offset swaps). That's 0 draws and 0 runtime canvas work. From CS-09 on, any hyenas in the hub wear the friend words
(Letter L3, Private Snorkle's YAYSAYER request, becomes the setup for this gag).

---

## 3. Boss redemption arcs ("bonk, then befriend")

Shared rule: the boss bar's final hit triggers **BONKED!** (`hud.boss.bonked`), and the boss sits down dizzy with
stars. The defeat cutscene that already exists becomes the Befriend beat: Clem offers something (milk, a laugh, a
bow, a seat), and the boss joins the found family. **Every befriended boss shows up again later**, which is the
payoff that makes it feel intentional:

| Boss | Why he's "bad" (misunderstood) | Befriend beat (scene) | What he does afterwards |
|---|---|---|---|
| **Captain Grizzlechop** (L2) | He's a pompous party rat. Barkus paid him in cheese to "slow down anyone who follows", and he thought that would be a big knight. | CS-05: he yields ("Mind the cheese!"), and Clem offers him her milk. "Milk... AND cheese? That's a whole *snack*." Then **monocle polish, salute.** | His rats tidy Pawsbury's market after L3 (ambient). In CS-15 his rats hold lanterns. In the epilogue he runs a cheese stall next to the bakery (§6.3). |
| **Pilfer, the Post Stealer** | He's a cheeky klepto who thinks letters are "just paper". | CS-06: he peeks over the wall while they read Snowpaw's undelivered letters and sniffles. In L4 he steals the pin out of habit, Pip steals it back, and he mumbles "...sorry. Habit." | His plate becomes POSTMASTER. He rides with Coo in the ending (the post-credits gag stays). |
| **Big Chief Cacklejaw** (L4) | He was the runt. Everyone laughed at him, so now he laughs *first*. | CS-09 (already the best beat in the game): "So I laughed first. Always first." Clem, the polite girl who never jokes, does a tiny "...Hee." **He realises someone is laughing *with* him.** His plate flips to HYPE-IN-CHIEF. | He becomes the Snickerpack's hype-man. In CS-15 the Snickerpack chants "SWORD-CAT!" from the ramparts, *led by him*. In the hub he does stand-up by the fountain (nice jokes only). |
| **Sir Brutus** (L6 mini) | He was never mean. He's an honourable champion stuck on the wrong side. | D-05: "...You stood." He takes off his helm and offers a paw. "Hold your gate, little knight." | He opens the cellars for her and later becomes **co-instructor at the Academy** with Sgt. Whiskerbottom (epilogue shot). He's the one who moves the height chart line *down* one ear-tuft. |
| **Slime Sovereign** (L5, MVP+) | He's just a big blob who wanted to wear a crown. | It shrinks to a tiny crowned slime: "...blorp." **It hops into Pearl's arms** instead of away. | It becomes Pearl's pet **Blorp** in the Wardrobe (no hub draw: it appears only in the Wardrobe UI portrait). |
| **Lord Barkus** (L6 final) | As a pup he was **shooed** off the sunny castle steps. "If dogs can't have the sun, nobody can." | CS-15 now mirrors his wound: he tries to **shoo** her ("Shoo! SHOO, little thing!"). She won't shoo. CS-16: the milk in the sunbeam ("...It *is* warm."), then **she scoots over and pats the step beside her.** | He becomes **the Bell Dog**: every morning he rings the Sunbell with one enormous happy BARK. Post-credits: asleep on the steps under three kittens (it already exists). Epilogue sign on the steps: "SUNNY STEPS: CATS, DOGS, DRAGONS. NAPS ONLY." |

No boss "dies" or is "slain" anywhere in strings, toasts, achievements or GDD prose.

---

## 4. Chapter-by-chapter beats (6 levels + ending)

Format: **mood / time of day** (matches ART presets), beats, then the *warm upgrade* in bold.

### Prologue: "One Ear-Tuft Short" (`meadow`, practice field; **Morning Practice**, then golden late afternoon)
- CS-01 (sunny morning on Knighting Day eve): the height chart. "Too small for the sword, Clementine." Pearl ties
  the pink bow on. **She's thrilled about her sleepover with the squires ("Front row! I made a sign!").**
- **Morning Practice** (the tutorial): the steps are unchanged. **New gag: a "Very Suspicious Cow" cheers her on
  between steps** (that's Pearl hiding behind it; §7). The Meow step reveals her: "Shh! I'm not here."
- G-01 Sir Tallbert (unchanged, already funny).
- CS-02 **"The Giggling Mist"** (renamed from The Laughing Fog). At **sunset**, not midnight, the sun *dips
  early*, the Bell Tower's glow pops out, and a big shaggy shape trots off with the gem. Cackling. The Snickerpack
  marches past with polka-dot kitten carriers (Pearl: "CLEM!"). Cacklejaw laughs until he cries: "It isn't even a
  threat!" Pilfer swipes the signpost and then the post bag. The mist rolls in. Trembling paws. "...Okay." She
  lifts the sword. **Staging change (`cs02.js`):** replace "far drums" with a distant kazoo-ish giggle loop, swap
  `fogDensity 0.095` for 0.075 (ART D13 range), end on a **warm rim on her** rather than a black-out, then the
  title card with the sparkle sting.

### Chapter 1: "Small Paws, Big Sword" (`meadow`, misty morning)
- She follows the trail of dropped letters (the meme misty fields, at their most gorgeous).
- Rats at the Standing Stones ("Squeak formation!").
- **Milk Break** + Pudding: the comedy centrepiece stays. Pudding's hunger line is softened (table, `cs03.5`).
- The Old Bridge: she holds three rat waves and frees **Mochi** ("Then we're a team!").
- **Warm upgrade:** the first rescued kitten (Biscuit) waves her paw and walks home along the lantern trail. Every
  rescue gets the ART §8.6 heart/petal burst plus `toast.kitten` "Off home you go!"

### Chapter 2: "The Big Cheese" (`forest`, Whiskerwood; dappled day, then Lantern Night)
- The rat supply trail, giant mushrooms, a spider hollow (**spiders get named by Bramble later; they're
  shy**), and Sage in a treetop carrier.
- **Lantern Night** (CS-04): unchanged. It's the warm heart: "I'm not brave. I'm just... here." / "That's what brave
  is, I think." **Music: `field_of_dreams` at 0.5, not `dark_forest_creepy`** (§8).
- The Cheese Mill becomes "a rat party that got out of hand". Grizzlechop gets bonked, **Befriend: milk + cheese**,
  and Shard 1 (Holy Slash). "The kittens went to Pawsbury!" "Then I'm going home."

### Chapter 3: "Lanterns On, Pawsbury!" (`town`, golden-hour mist)
- Pawsbury isn't "occupied". **The Woof Brigade has moved in like bad houseguests**: pugs napping on the
  fountain, rats wearing tea-cosies, muddy paw prints everywhere. Lighting Lantern Alley "wakes the street up".
  Each lantern makes a window light up and a villager peek out ("Is it morning?").
- Marmalade in the bakery: "Is that... my armour?" (it's perfect, keep it).
- The Pilfer chase. CS-06 The Letters: "Nobody came because nobody knew." **Pilfer sniffles behind the wall.**
- Tofu, Clover, Earl Grey (inside a Wobblejelly, reading).
- CS-07 the red cape ("a tablecloth, velvet mostly"). The hub opens: **"Kittens you rescue will live here"**,
  and the found-family pillar becomes visible.

### Chapter 4: "Where I Stand" (`gate`, bright windy afternoon over the tidal flats)
- Pilfer pinched the winch pin. Earl Grey fixes it while Clem **holds the Line**. Pip ("waiting for dramatic effect").
- **"Nobody's coming." / "So I'm staying."** stays exactly (the emotional peak). **Then Mochi: "Nobody?
  Excuse me. We are SOMEBODY."** Pull-back: every rescued kitten in a pot helmet, holding a spoon. "Two spoons."
- Marmalade's dive: he catches a **cart-wheel-sized tennis ball** meant for the kittens. BONK. He uses up his eighth
  life, the "cats count their lives" kind (GDD §2.2 already says this isn't tragic). It's played as a heroic
  pratfall: legs in the air, plume drooping, the kittens gasp, then he gives a thumbs-up from the ground.
- Cacklejaw: bonked, the **Befriend beat** ("...Hee." "Did you just laugh WITH me?"), and Shard 2 lights her gold.
  Pudding rises and roars "NOT. MY. FRIENDS." The horde scatters, plates flipping to friend words.
- CS-10 **becomes cozy, not grieving:** Marmalade in bed with soup and a hot-water bottle, kittens piled on the
  blanket. "Eighth life. Used it up. Best catch of my career." The "...Yet." beat stays. Then Barkus, sulking,
  **"pulls the curtains"**: the Big Yawn. The hub goes `hub_hush` lavender, villagers yawn, and the windows go
  sleepy-blue. **Music: `tavern_old_tower_inn` for the bedside, a 2 s fade to the lament only for the window
  shot.**

### Chapter 5: "The Crooked Bow" (`bog` → Glimmerbog; fireflies at dusk)
- The ferry dock where the carriers are shipped north "to scratch dog ears. All day. In shifts."
- Splitting Wobblejellies, shy spiders, sinking boardwalks, the sunken tower (Heart Bell #3).
- CS-11 Pearl in a crate marked **"FRAGILE: DO NOT BOOP"**. "You came!" "Of course. I'm a knight." "Since when?"
  "...Since now." She re-ties the crooked bow: the most tender beat, and it stays word for word.
- Slime Sovereign bonked, becomes Blorp. Pudding: "(Get on. Before I change my mind.)"

### Chapter 6: "Sunny Steps for Everyone" (`keep`, sunset storm-clouds breaking)
- Pudding toasts the keep gate ("ROAR! (Sorry!) ...(No. Not sorry.)") and flies home for "EVERYONE".
- Brutus: the duel of Stands, **Befriend beat** (helm off, paw out).
- The Kennel Cellars: **Squeakybones** (chew-toy knights that squeak back together). Two keys.
- The Bell-Tower Roof. Barkus with the Big Squeaky Bone. Three perfect parries free the shard.
- CS-15: **"Shoo! SHOO, little thing!"** "Why won't you SHOO?" She gets up: "Not strong yet. Still here." Pudding
  lands, the kittens raise lanterns, **Grizzlechop's rats and Cacklejaw's Snickerpack join the chant** ("SWORD-CAT!
  SWORD-CAT!"). HOLD THE STAND.

### Epilogue: "Dame Swordcat of the Ninth Seat" (`town` gold)
- The clouds break. Milk in the sunbeam. **"They shooed me too. Off these steps."** "Then sit. There's room."
- She rings the Sunbell and the island wakes up: every rescued kitten, every befriended boss in one gold group shot.
- The old knights: "Did we miss it?" The knighting gag is unchanged.
- **New closing image:** Brutus moves the height chart line down one ear-tuft. Barkus, the Bell Dog, BARKS the
  morning bell. "And the sun came home."

---

## 5. Companion banter and catchphrases

**Catchphrases (one per character; used in barks, loading tips and the Meme Cam captions pool):**
| Who | Catchphrase | Key |
|---|---|---|
| Clem | "Small paws. Big sword." / "Bonk. ...Sorry." | `bark.clem.arena.1`, new `bark.clem.bonk` |
| Mochi | "Squire on duty!" | exists |
| Sage | "Two spoons." (Sage sets it up, Clem lands it) | exists |
| Clover | "Hold still, sweetpea." | exists |
| Pudding | "ROAR! (Sorry!)" | exists |
| Pip | "Waiting for dramatic effect." | `d06.1` |
| Team chant | "SWORD-CAT! SWORD-CAT!" | `cs15.5` |

**Banter pairs.** This is new: `companions/lines.js` fires one pair when no enemy has been alerted within 20 m for
25 s and the companion idle bark is off cooldown. Same bubble system, 0 draws. Keys are `banter.<id>.<n>`, and each
pair is (companion line, Clem reply):

| Key | Companion | Clem |
|---|---|---|
| `banter.mochi.1` | "If we find a cheese wheel, can I ride it?" | "Only downhill." |
| `banter.mochi.2` | "When I'm a knight, my shield will have a face on it. MY face." | "...Good face." |
| `banter.mochi.3` | "Do you think Pudding likes me? He hid behind a TWIG." | "He likes you. Twig was scary." |
| `banter.sage.1` | "I've rated every cloud today. That one's a seven." | "That one's a dragon." / *(Pudding, off-screen)* "(...Hi.)" |
| `banter.sage.2` | "I don't cry at stories. My eyes just leak at the good parts." | "Mine too." |
| `banter.sage.3` | "Forty hyenas. Four kittens. One spoon." | "Two spoons." |
| `banter.clover.1` | "Did you eat breakfast? A knight needs breakfast." | "I had milk." / "That's a DRINK, sweetpea." |
| `banter.clover.2` | "Bramble named the spiders. They're Kevin, Kevin and Susan." | "Hello, Susan." |
| `banter.clover.3` | "When this is over, I'm knitting you a scarf. A tiny one." | "With a sword on it?" |

Clem's writing rule (≤ 8 words, never jokes on purpose) is kept. Her replies are funny because they're earnest.

---

## 6. Implementation notes

### 6.1 Files and owners
| Change | File | Owner | Cost |
|---|---|---|---|
| String rewrites (§7) + new keys | `src/story/strings.js` | story | 0 |
| CS-02 staging (fog 0.075, kazoo giggle, warm rim end) | `src/story/cutscenes/cs02.js` steps 1, 11, 13 | story | 0 |
| Befriend beats: add 2–4 lines each | `cs05.js`, `cs09.js`, `d05`-equivalent in `cs14` file, `cs16`, `cs15` | story | 0 (existing shots and anims: `Yes`, `Cheer`) |
| CS-10 music split + `hub_hush` | `src/story/cutscenes/cs10.js:81,108,138,139` | story/audio | 0 |
| Plate flip | `src/core/config.js` (`plateWordsFriend`), enemy plate builder | enemies | 0 draws; +1 texture row per hyena type |
| `hud.boss.bonked` text on boss defeat | UI boss bar | ui | 0 |
| Banter timer | `src/companions/lines.js` | companions | 0 |
| Squeakybone / bone mallet / carriers / tennis ball | art builders | characters/art | same draw count; textures and tints only |
| GDD prose (§1, §2.2–2.4, §3.7, §4) | `GAME_DESIGN.md` | design | — |

### 6.2 Tests to keep green
- The strings test (every key used by cutscenes exists): new keys must be added *with* the cutscene steps that use
  them. Renamed display text keeps the same keys, so nothing references a dead key.
- `homage` variants are untouched.
- Clem's line-length rule can be a cheap unit test: every `cs*` line spoken by `swordcat` is ≤ 8 words, except
  the allowlist (`cs04.2–5`, `cs16.9`, `cs15.3`, `bark.clem.kitten`).

### 6.3 Optional hub cameos (perf-gated)
Befriended Grizzlechop (after `forest.done`), Cacklejaw (after `gate.done`) and Brutus (after the ending) stand in
Pawsbury. **They replace villager slots** rather than adding actors, so they fit the hub's ≤ 60 Med draw cap
(PERF §16, IMPLEMENTATION_PLAN). Each runs the same NPC band rules (PERF M1). If `perf:hub` fails, they appear only
in CS-16 and post-credits.

---

## 7. String rewrite table (`src/story/strings.js`): the ~60 most visible lines

Kept-as-is lines are deliberately omitted (most of CS-01, CS-04, CS-08, CS-11, CS-16 and the meme captions are
already on-tone). **New** marks a new key.

### Title, chapters, regions, names
| Key | Old | New |
|---|---|---|
| `ch.2` | The Cheese Mill | The Big Cheese |
| `ch.3` | The Quiet Town | Lanterns On, Pawsbury! |
| `ch.5` | The Bow | The Crooked Bow |
| `ch.6` | The Last Light | Sunny Steps for Everyone |
| `region.bog` | Bogmire | Glimmerbog |
| `name.cacklejaw` | Warchief Cacklejaw | Big Chief Cacklejaw |
| `cs01.caption` | Meow Island. The eve of Knighting Day. | Meow Island. One sleep until Knighting Day! |
| `cs01.9` | Tomorrow the Sunbell rings at dawn, and I'm sleeping over with the squires. Front row! | Tomorrow the Sunbell rings, and I'm having a sleepover with the squires. Front row! I made a sign! |

### Onboarding (Morning Practice)
| Key | Old | New |
|---|---|---|
| `tut.title` | Midnight Practice | Morning Practice |
| `quest.prologue` | Midnight Practice | Morning Practice |
| `tut.move` | Right-click where to go, or use [WASD]. Hold right-click to keep walking. | Right-click anywhere and she trots there. Or [WASD]. Hold to keep trotting. |
| `tut.move.touch` | Drag the left side to move, or tap where to go. | Tap anywhere to trot there, or drag the left side. |
| `tut.combo` | Snip, Snap, Swoosh! [Attack ×3]: you swing toward the cursor. | Snip, Snap, Swoosh! [Attack ×3] at the straw dummies. They don't mind. |
| `tut.roll` | Tumble past the sack [Tumble]: toward the cursor. You can't be hurt mid-tumble. | Tumble past the sack [Tumble]! Nothing can bonk you mid-tumble. |
| `tut.stand` | Hold the Stand [Stand]. Block the Wobble Knight twice. | Hold the Stand [Stand]: the famous pose! Block the Wobble Knight twice. |
| `tut.parry` | Raise the Stand *just* as it swings. A white glint and a white wedge on the ground mean "parry me". | Raise the Stand *just* as it swings. A white twinkle means "parry me!" |
| `tut.bright` | Hold [Attack] until it shines, then let go. The silver arc shows its reach. Bright Slash breaks cracked things. | Hold [Attack] until it sparkles, then let go: Bright Slash! It cracks cracked things. |
| `tut.meow` | Meow [Meow]. Hidden kittens answer. So do cows. | Meow [Meow]. Hidden kittens meow back. So do cows. Usually. |
| `tut.done` | Practice done. The north gate is open. | Practice done! The north gate is open. Adventure is that way. |
| `tut.skipped` | Practice skipped. The north gate is open. | Practice skipped. Adventure is that way! |
| `tut.cow.1` **New** (speaker `name.cow` = "Very Suspicious Cow"; after step 2) | — | Moo. (...Nice jump, Clem!) |
| `tut.cow.2` **New** (after step 5) | — | MOO. (Ooh, tumbly!) |
| `tut.cow.3` **New** (after step 7) | — | Moooo! (I mean. Moo. Normally.) |
| `tut.jeer` | A jeering hyena drains your Valor. Hold the Stand and it can't touch you, or hit it to make it choke. | A giggling hyena drains your Valor. Hold the Stand to ignore it, or bonk it mid-giggle! |
| `tut.bones` | Scatter the bones! Hit a bone pile with a heavy attack before it gets up. | Squeakybones! Bonk the pile with a heavy hit before it squeaks back up. |

### Story scenes
| Key | Old | New |
|---|---|---|
| `cs03.5` | RRrrr. (I haven't eaten in three days. The laughing dogs chased me out of my cave.) | RRrrr. (I haven't had a snack since Tuesday. The giggly dogs scared me out of my cave. I'm VERY easy to scare.) |
| `cs05.2` | Take the shiny rock! The Warlord paid us in cheese to slow down anyone who followed. Which, to be fair, we expected to be... bigger. | Take the shiny rock! Lord Barkus paid us in cheese to slow down anyone who followed. We expected someone... taller. |
| `cs05.3` | The cages went to Pawsbury. The Legion holds the whole town! | The kittens went to Pawsbury. The Woof Brigade moved into the whole town! They don't even wipe their paws! |
| `cs05.5` **New** (Clem) | — | Want some milk? For the cheese. |
| `cs05.6` **New** (Grizzlechop) | — | Milk... AND cheese? That's a whole *snack*. |
| `toast.friend` **New** | — | New friend: {name}! |
| `cs07.1` | You chased off the Legion. All of them. By yourself? | You chased off the Woof Brigade. All of them. By yourself? |
| `cs08.3` | We're not leaving you out here by yourself. | Nobody? Excuse me. We are SOMEBODY. |
| `cs09.7` **New** (Clem, after `cs09.6`) | — | ...Hee. |
| `cs09.8` **New** (Cacklejaw) | — | Did you just... laugh? WITH me? |
| `cs09.9` **New** (Cacklejaw) | — | LADS! She laughed WITH me! Best day EVER! |
| `cs10.2` | Eighth life. Gone. Worth it, mind. | Eighth life. Used it up. Best catch of my career. |
| `cs10.7` | That's the Warlord's doing. The last shard is on him. Houndhold Keep, north across the Bogmire. | That's Barkus, pulling the curtains on the whole island. Last shard's on his collar. Houndhold Keep, past the Glimmerbog. |
| `cs10.8` | And the smugglers' landing in the bog is where they ship the kittens. | And the ferry dock is where they send the kittens. To scratch dog ears. All day. In shifts. |
| `cs15.1` | Stay down, little thing. | Shoo! SHOO, little thing! |
| `cs15.2` | Why won't you STAY DOWN? | Why won't you SHOO? |
| `cs16.17` **New** (Barkus, after `cs16.3`) | — | ...They shooed me too. Off these steps. |
| `cs16.18` **New** (Clem; pats the step) | — | Then sit. There's room. |
| `cs16.19` **New** (sign, epilogue) | — | SUNNY STEPS: Cats, dogs, dragons. Naps only. |

### Barks (heard every fight)
| Key | Old | New |
|---|---|---|
| `bark.clem.alert.2` | En garde. | Prepare to be bonked. ...Gently. |
| `bark.clem.bonk` **New** (on a boss bonk) | — | Bonk. ...Sorry. |
| `bark.hyena.alert.2` | Go home, fluffball! | Bedtime, fluffball! |
| `bark.hyena.alert.3` | Nobody's coming for you! | Aww, is that a SWORD? Adorable! |
| `bark.hyena.gloat.3` | Get off the stage! | Encore! ENCORE! Hehehe! |
| `bark.hyena.defeat.2` | Tell no one. | Okay, that was AWESOME. |
| `barkus.p1` | This is MY fog now! | MY sun! MY steps! MY nap! |
| `barkus.p2` | My HELMET? ...LADS! HERE, BOY! ALL OF YOU! | My HELMET? ...WALKIES! EVERYBODY! WALKIES! |

### Kittens, hub, UI
| Key | Old | New |
|---|---|---|
| `kitten.sprout` | They said I was too small to be worth cheese. | They said I was too small to count. I counted them. Eleven. |
| `kitten.crumpet` | The skeleton guard tells good jokes. Bad breath, though. He has no lungs. | The squeaky-bone guard tells good jokes. He squeaks at the punchline. |
| `kitten.muffin` | The bell's quiet. I don't like it quiet. | The bell's having a nap. I like it better awake. |
| `hub.snowpaw.1` | The castle steps are yours, Swordcat. Watch out for dogs. | The castle steps are yours, Swordcat. Share them nicely. |
| `quest.forest.mill` | Storm the Cheese Mill | Crash the Cheese Mill party |
| `quest.bog.pearl` | Find Pearl at the smugglers' landing | Find Pearl at the ferry dock |
| `quest.hub.bog` | North across the Bogmire: find Pearl | Across the Glimmerbog: find Pearl! |
| `quest.keep.gate` | Storm Houndhold Keep | Knock on Houndhold Keep (loudly) |
| `quest.keep.boss` | Reach the Bell-Tower Roof | Climb to Barkus's sunny spot |
| `quest.done` | Meow Island is safe. | Meow Island is sunny again! |
| `toast.kitten` | Lost kitten found! ({n}/{max}) | Kitten found! Off home you go! ({n}/{max}) |
| `toast.checkpoint` | Vigil Stone lit. Progress saved. | Vigil Stone lit! Cozy spot saved. |
| `toast.free` | Pawsbury is free! | Pawsbury is awake! Lanterns on! |
| `gameover.retry` | Wake up (retry level) | Stretch and try again |
| `results.title` | Chapter clear! | Hooray! Chapter clear! |
| `hud.boss.bonked` **New** | — | BONKED! |
| `loading.tip.3` | Hyenas laugh after hitting you. Hit them while they gloat. | Hyenas giggle after a hit. Bonk them mid-giggle! |
| `loading.tip.7` | Nine lives per level. Use them. | Nine lives per level. Cats are like that. |
| `loading.tip.13` **New** | — | Every bonked boss becomes a friend. Visit them in Pawsbury! |
| `difficulty.knight.desc` | The intended adventure. Nine lives per level. | The full adventure. Nine lives per level. |

Count: 72 rows (57 rewrites + 15 new keys).

---

## 8. Audio tone picks (asks to audio; tracks already on disk, GDD §16.1)
| Context | Old | New |
|---|---|---|
| `forest` night / Lantern Night | `dark_forest_creepy` | `field_of_dreams` at 0.5 |
| CS-10 bedside | `story_lament_warriors_soul` | `tavern_old_tower_inn`; lament only for the 4 s window shot |
| `hub_hush` (Big Yawn) | lament | `village_bards_tale` at 0.6 (a sleepy version of home) |
| Results | `victory_8bit_loop` (90s cue) | `jingles/jingles_PIZZI03` (already the fallback) |
| CS-02 | "far drums" | the hyena giggle loop + wind; drums only as the 0.3 s sting on the title card |

Lament stays for CS-11 (Pearl) and CS-15 (the lantern rise), where a lump in the throat is earned.
