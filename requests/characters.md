# Open requests from characters

The M1 API notes of this area are archived in `docs/api/characters.md`; what core applied is in `requests/RESOLVED.md`.

## M2 (2026-10-09): what characters added, and what other areas can now use
All additive; nothing renamed. Import from `src/characters/index.js` only.

### Resolved on our side (please close)
- **requests/fx.md + requests/player.md — first-use shader stalls (aura hull, blade streak, Dawnblade sparkles):**
  every `KittenView` now runs a one-frame warm-up after it is built, on every `level:loaded` and on every
  `game:quality`: the hidden aura hull and streak are shown for that frame with an empty draw range (the FX trick), so
  the real renderer (level fog + lights, composer target) compiles them under the loading veil, and a
  `ctx.game.addFrameHook` restores them after the frame. Smoke `characters:warm`: renderer programs 90 → 90 on the first
  Holy charge. The fur gold rim and blade emissive are plain uniforms (no program change). Raw kittens:
  `k.warmBegin()` before a render, `k.warmEnd()` after; `k.warmObjects()` lists them.
- **requests/world.md — hero fur cost (part we own):** the fur distance LOD is now `FUR_LOD = { near: 2.6, far: 8,
  min: 4 }`. Close-ups and Meme Cam keep all shells. The follow camera (3.6 m) draws 13 of 16 hero shells (about −19 %
  head-fur tris), lock-on about 10, boss framing about 6, and nothing past 8 m except the base layer. The Med preset
  numbers (`QUALITY.med.furShells 16`) are core's; lowering them is the remaining lever if the §18 budget still needs it.

### To companions (SpoonBrigade.js / HubKittens.js)
- `catConfig('spoon_<kittenId>')` (or `'spoon:<kittenId>:<i>'`) = `spoonBrigadeConfig(kittenId, i)`: the kitten's own
  coat, lite tier (sheen fur, about 4 draw calls), a pot helm or colander, a spoon in the right fist, and the
  `spoonReady` stance. `kitten.emote('throw')` is a 0.5 s overarm lob. Launch the spoon projectile at
  `EMOTE_RELEASE.throw` (0.42) × `EMOTE_DUR.throw`. `NpcActor` / `spawnNpc('spoon_tater', …)` already work.
- `catConfig('hub_<kittenId>')` = `hubKittenConfig(kittenId)`: lite tier, happy, with its §12.5 activity from
  `HUB_ACTIVITY[kittenId]` = `{ pose, prop?, world?: [propNames], run?, mirror?, within?, every?, look?, note }`.
  - Poses: `fish`, `read`, `wave` (waves on its own), `nap`, `sit`, `vigil`, `idle`.
  - Props in paw: `fishing_rod` (with its own float bob), `book@upsidedown` (Juniper), `hammer`, `letter`, `spoon`.
  - World props for you to place: `bread_basket` (Pickles), `teacup` (Sprout), `butterfly` (Bramble; it flaps by
    itself through `userData.update(dt)`).
- New poses for anyone (`setPose` / ScriptedActor `pose()`): `wave`, `read`, `fish`, `aim` (Sage's bow draw), `heal`
  (Clover's staff raised), `spoonReady` and `nap` (= sleep). `EXTRA_POSE_NAMES` lists them all. New emotes: `wave`
  (1.2 s) and `throw` (0.5 s).
- A config's own `expression` now wins over the pose's default expression when a kitten is built (before this, every
  cat started with its pose's face, for example idle → neutral).

### To enemies (B1 Grizzlechop, §11.2)
`buildProp(name, opts)` adds these, each one mesh on the shared kit material. Sizes are in metres.
- `feathered_hat` — `{ size }` = brim diameter, default 0.42. Origin at the brim centre, front +Z. CS-05 knocks it off.
- `cheese_shield` — `{ r = 0.45, width = 0.12 }`, `#E8C35A`, face +Z. Hang it on `FrontLeg.L` with `holdOnBone`.
- `cheese_wheel` — the toss: r 0.45, axis X. `cheese_wheel_giant` — the phase-2 ride: r 0.8, width 0.6, with axle pegs.
  Both have `userData.roll(distance)`.
- `cheese_wedge` — the Snack; `userData.bite(0..1)` shrinks it.

The other beast looks (`hyena`, `stealer`, `pilfer`, `cacklejaw`, `pug`, `brutus`, `barkus`) are unchanged in
`dressBeast` / `BEAST_LOOKS`.

### To player / ui / save (§13.4–13.5)
- All 7 sword skins render: `borrowed`, `twig`, `fishbone`, `baguette`, `diamond` (GLB), `toobig` (GLB) and `dawnblade`.
  - GLB skins mount at the model's own crossguard and orient themselves tip-up (`mountModel` uses `flip: 'auto'`).
  - `sword.tip` sits at the model tip, so trails and hit points follow it.
  - `toobig` restyles the Quaternius claymore's red parts to steel. Its tip drags on the ground in every standing pose
    (visual only, in `Kitten.simulate`).
  - `dawnblade` adds 20 additive twinkling sparkles (`DAWN_SPARKLES`, 1 draw call) on top of its permanent gold emissive.
- All 7 capes render: `cream`, `red`, `memeWhite`, `blue`, `green`, `midnight` and `gold`. `midnight` is now the §13.3
  `#22242A` (it was a bluish `#262A44`). The bow stays pink on her left ear with every cape (unit test + smoke).

### Look changes (M2 cast)
- **Sage:** a real pointed hood. It frames the face with an oval opening and a rolled hem, the ears poke through, the
  bent tip droops back, and a leaf-cut capelet sits over the shoulders. Her short recurve bow has a grip wrap and string.
- **Clover:** a white coif that frames the face (it covered her whole face before), a pink trim, a short veil down the
  back, and a bigger brass bell that now shows at the collar.
- **Tofu:** a far-too-big smith's apron with a bib, neck strap, waist tie and a pocket with a hammer. The soot smudge
  now sits on her right cheek where it can be seen.
- **Mochi:** he reads correctly from the front under day light (`uSheen` 0.09, ambient ×2.4; screenshot
  `tests/shots/characters/m2-companions.png`). His back view in D-01 was not re-checked in M2.
