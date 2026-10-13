# Open requests from companions

The M1 / M2 / controls-rework API notes of this area are archived in `docs/api/companions.md`; what core applied is in
`requests/RESOLVED.md`.

## Phase W + S4/S5 (2026-10-12): what companions landed, and what we need from others

Applied here (no action needed):
- The player's two asks are done: on `player:died` the party runs to her and shakes their heads; on the next
  `player:spawned` they land 1.5 m beside her with a paw-bump (`companions/party.js`). `ctx.companions.aim.range`
  exists while an ability is aimed, and companions also write `player.aim.range` / `dir` after her step.
- fx's Volley ask is done: `planAbility`'s volley branch drops targets with `!ctx.cam.onScreen(e.pos, 0.5)`.
- characters' join-hitch ask is done for cage joins: the caged squire's cat look is handed to the new Companion
  (`KittenVisual.rebind`), so the join frame builds no kitten.
- `kitten:rescued` now carries `position` (the carrier position for kittens in carriers, else the kitten).

- **To world (WA16 / world.W6), please:**
  - Add `soft: true` support to `Arena` for the new `cart` zone in `meadow.js` (no fog wall or ring collider, and rats
    flee at 1 HP). It also uses `autoLockWhen: 'prologue.done && !meadow.mochi'`.
  - `vigil_1` at [-16, -36] sits inside the cart arena's lock disc (r − 2 = 7 m). Please check the spot.
  - Crossroads still spawns `rat_pike ×2` at [-9.5, -41], which is about 4.5 m from the cart. With the cart's 3 rats the
    meadow tally is now 30 `rat_pike`, and `world.test.js` U12 asserts 30. Rebalance it if you like.
  - The data edits I made in `meadow.js`:
    - `MOCHI_CAGE = STORY.mochiCage`.
    - Biscuit is a `hide: 'cage'` kitten at [30, 74] (`cage: 'cart'`, `needClear: 'bridge'`).
    - The Old Bridge cart is hidden while Biscuit waits (`biscuitWaiting`). Our cart + carrier stand in for it.
    - The bridge zone no longer has a `rescue`.
    - The exit toast text is updated.
  - Your `broken_wheel` decorate is kept, and companions no longer add a wheel of their own.
  - U12 in `world.test.js` now fails on your Letter #1 move (`letter_1.at`). That part is yours.
- **To story (WA §8.4–8.6):** please add these keys to `strings.js`. `companions/lines.js` FALLBACK holds the text
  until you do:
  - `bark.mochi.cheer.1–3`
  - `bark.mochi.lock`: "It's a tough one! Do the shiny swing!"
  - `tut.bright` and `tut.bright.touch` (Mochi's bubble at the cracked latch, from the 2nd tink)
  - the banter pairs: `banter.<mochi|sage|clover>.<1–3>`, the `.clem` reply, and the optional `.end` tag
    (`banter.sage.1.end` "(...Hi.)", `banter.clover.1.end`)
  - the carrier copy for `bark.mochi.caged.1`, `bark.sage.caged.1` and `bark.clover.caged.1`

  D-01 now triggers at the cart, after the `cart` arena and a Bright Slash on the cracked latch.
- **To characters (consumed defensively, no-ops until they land):**
  - `KittenView.setActivity(tier)` and `KittenView.setCloseUp(on)`.
  - The X9 hull, in the first form that exists: `view.setOutline(on, { px, color, kind })`, then
    `kitten.setOutline(on, opts)`, then `buildOutline(silhouetteProxy, opts)` (returns a mesh that we parent).
  - Companions ask for 1.6 px on Med/High; kittens and villagers only on `'all'`.
  - Head scale is applied here per ART §6: companions and lost kittens 1.22, villagers 1.05.
  - Gestures are procedural in `KittenVisual.gesture()`: `pawBump`, `boop`, `yawn`, `nodBook`, `cheer`, `look`. If you
    add real poses with these names, tell us and we will switch.
- **To fx:**
  - We register blobs with `fx.blobs.add(actor.object3d, r)` and remove them on dispose.
  - Every companion-area actor has `castShadow = false` (K5).
  - The cracked-latch "tink" calls `fx.damageNumber(pos, 'tink!', 'pop')` inside a try. Please support style `pop`, or
    tell us which style to use.
  - The paw-bump uses the `stars` and `heart` bursts. The reunion trail is 10 `sparkle` bursts over 1.2 s.
- **To camera:** we read `cam.activityOf(actor)` when it exists, else our own frustum per frame (PERF §4.3 rule). We also
  read `cam.closeUp` and `cam.onScreen` (Volley).
- **To save:** none.

## from ui (Phase W review: barks)
- **Bark bubbles (`src/companions/Bubble.js`, shared by companion, NPC, story and boss barks):** apply the WA §4.2
  speech-bubble spec: Fredoka 500 at >= 16 CSS px on screen (Cacklejaw's barks render at ~12 px today), an 18 px corner
  radius, a 2.5 px cocoa border (`#5A3B2E`) on cream (`#FFF8EE`), a 12 px tail, and at most 2 lines (`wrapText(text,
  maxChars, 2)`). The parchment `PAPER` / `PAPER_EDGE` / `INK` values in the file header are the old M1 look.
- **Never over a fight:** a bark's bubble must not anchor over an actor with an active aggro ring. When the speaker
  (or the bubble rect) is within ~60 px of an alerted enemy's screen point, offset it toward the nearer screen edge,
  away from the hero-to-foe line (ui does the same for its hint card and guide bubble: they fade back over alerted
  foes, `prompts.js hintCovers`). Evidence: ui/43-hp-pills.png, Mochi's "My turn! Press it!" sits on a rat.
- (world, 2026-10-13) Shadow stage 2 is live: NPC / villager / hub-kitten / LostKitten actors no longer get sun
  shadows. Any actor without an `fx.blobs.add` registration now floats: please register blobs for those that lack one
  (HubKittens, LostKitten cages, NpcActor if not via KittenVisual) and drop their `castShadow = true` (K5).

## to companions, from core / fx / world (PERF §1.2 programs per level, the `perf:programs` hard gate)
- `Bubble.js` speech-bubble `SpriteMaterial`: add `fog: false` (every other sprite in play is unfogged now: one sprite
  program instead of two).
- The cage cart (`models/env/town/cart.glb`, `LostKitten.js` CAGE_CART) and Tofu's barrels keep the GLB's
  `MeshStandardMaterial` (a Physical program of its own per texture: `colormap`, `hexagons_medieval`). Convert them on
  load like enemies do (`src/enemies/rig.js` `sharedToon(src, kind)` / characters `makeToonMaterial({ map, side })`, cached
  per source material), or vertex-colour them into world's `worldMaterial()`: 1–2 programs → 0 on gate / forest / town.
