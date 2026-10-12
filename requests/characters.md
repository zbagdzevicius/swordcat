# Open requests from characters

## QA perf finding "Low still ~134k tris on phones, 200–300 ms combat hitches" (2026-10-12): the rest is outside characters
Characters' share is fixed (cats built under Low use `QUALITY.low.charDetail` 0.55: hero ~22.7k drawn tris instead of
~47k, Mochi ~15.4k instead of ~30k; Low bakes no fur shells; no shadow-proxy draw with shadows off). Smoke
`characters:low-budget` (844×390 touch, `?quality=low`) asserts the per-cat budgets and warns on the 80k phone frame.
Measured there: frame ~103k tris / 57 calls with Mochi, so ~65k is the level:

- **To world — optional (Low budget):** meadow start on Low draws `ground` 20.0k, `props:meadow` 19.9k, `wheat`
  12.6k, `trees:*` ~10.5k, `fade:fence_simple` 4.7k. A Low ground LOD (half the grid) and a lower wheat count / prop
  distance cull under `ctx.quality.id === 'low'` would bring the phone frame under 80k.
- **To world / ui — optional:** `pickups:fish` draws 5.6k tris on Low (a low-poly fish or an instanced sprite would do).
- **To companions — optional (hitch):** a companion's kitten is built synchronously when she joins
  (`companions.unlock` → `buildKitten`): 31–69 ms on Low, several times that on Med. Building the party's / caged
  kittens' visuals at level load (under the loading veil, like enemies' prewarm stand-ins) removes the join hitch.
- **To world / enemies / fx — optional (hitch):** the first combat on the meadow still compiles one program mid-fight
  (a `SpriteMaterial` program, likely damage numbers or a rat's alert sprite with Low's canvas target), and debug-spawned
  rats with no prewarm stalled 150–350 ms on the GLB clone. Adding the zone's rat types + that sprite to the level's
  `_prewarm` list covers both.

## QA finding "her face is almost never visible in play" (2026-10-12): the glance is done, the arrival facing is player's
Characters added an idle camera glance to `KittenView` (`GLANCE` export): after 2.5 s still in the calm `'idle'` pose
she turns head + a little upper body up to 75° toward the lens (chin lift, head cock, pupils finish the look), holds
2-3.4 s, looks ahead 3-6 s, repeats; any movement / 'ready' pose / scripted / Meme Cam drops it at a fast rate. On by
default for the player (`new KittenView(ctx, cfg, { glance })` overrides). Smoke `characters:glance`.

- **To player — requested:** on arrival from a plain move order (no target, no attack-move, no interact), end the facing
  ~20° toward the camera: `p.facing += clamp(wrap(camBearing - p.facing), -0.35, 0.35)` eased over ~0.25 s, where
  `camBearing = atan2(cam.x - p.pos.x, cam.z - p.pos.z)` (with the lens straight behind her, pick the side she was
  already turning to). With the glance on top, the face then reads at ~95° from the lens instead of 75°.

The API notes of this area are archived in `docs/api/characters.md`; what core applied is in `requests/RESOLVED.md`.
