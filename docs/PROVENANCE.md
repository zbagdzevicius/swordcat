# Provenance (developer note)

Not shipped, not shown in the game or its credits.

## Where the concept came from

The first concept for this game (October 2026, working title "Swordcat") drew on a third-party viral meme: AI-made
clips of a tiny armoured kitten with a pink ear bow holding a sword that is too big for her. It also drew on a fan
video series that used the same look. Neither is our work. Crypto tokens also used the meme's imagery and name.

The early research saved outside media (video clips, frames, images, reference pictures) and quoted captions, handles,
links and token names under `research/`. Some code comments and design docs pointed at that material.

## What changed on 2026-10-13

The game became **Pawsbury Knight, a Token Tails game**:

- Title and setting: "SWORDCAT / Nine Lives of Meow Island" became "PAWSBURY KNIGHT / A Token Tails Adventure"; the
  island is Purrhaven Isle. On 2026-10-14 the founder renamed the game **Pink Paw Knight** (same subtitle; the world
  and hub names stay).
- Fan-series vocabulary is gone from display text: Vigil Stones are Lantern Stones, the Vigil Oath is the Lantern
  Promise, "The Low Gate" is Bramble Gate, and the epilogue is "Dame Clementine of Pawsbury". No line calls her
  "Swordcat" any more.
- The meme captions and every alternate "homage" caption variant were deleted, together with the code that could show
  them. Photo Cam (formerly Meme Cam) uses original captions.
- The hyena breastplate words taken from the clips (HATER, POST STEALER and their friend words) became GRUMP, SNACK
  SNATCHER, CHEER-IN-CHIEF and SNACK SHARER. Pilfer is "the Snack Snatcher".
- The currency is catnip and the heal is a Snack Break with tuna snacks.
- The title screen no longer recreates the meme's framing: Clem waves with her sword lowered at her side, in a wide
  shot with Pearl and the Token Tails Cat. Her CS-02 stand uses a guard stance.
- The heroine is re-coated to the Token Tails look (ivory coat, crimson eyes, red cape with gold trim). Her pink bow on
  the left ear stays: it is Token Tails' pink-bow cat.
- `research/videos/`, `research/images/`, `research/ref/`, `research/next/tools/shots/`,
  `research/next/tools/dist_perf2/` and source maps under `research/` were deleted from the working tree.
  `research/trend.md` was replaced by a short note, and the design docs no longer name handles, sites or tokens.
- The Credits screen dropped its "Not included" section and now credits Token Tails.

Internal ids (`swordcat`, `VigilStone`, `MEME_LOOP`, event names, the save key `swordcat.save.v1`) were kept on
purpose, so old saves load and nothing else breaks. Players never see them.

## Still open (founder decisions)

- **Git history.** The removed media and screenshots are still in the history of the public repository. Rewriting it
  (for example with `git filter-repo`) is a founder decision and was not done.
- **Legal check.** The renames remove the known third-party material; a lawyer's review is still the founder's call.
