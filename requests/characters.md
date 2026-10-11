# Open requests from characters

The M1 and M2 API notes of this area are archived in `docs/api/characters.md`; what core applied is in `requests/RESOLVED.md`.

## Controls rework (research/CONTROLS_SPEC.md §3, §7.4, §12 characters) — landed in `src/characters/**`

New API (all exported from `src/characters/index.js`, also on `Kitten.lib` for smoke):

| Call | What it does |
|---|---|
| `getSilhouetteProxy(target)` / `view.getSilhouetteProxy()` / `dress.getSilhouetteProxy()` | The x-ray proxy: ONE hidden `SkinnedMesh` under the actor (per-bone PCA ellipsoids + ears + bow + sword / weapons / helmets; no fur, no cape), material `depthFunc: GreaterDepth`, no depth write, no fog, `raycast` disabled. Its depth is pulled toward the lens (0.45 m for her, up to 1.0 m for long beasts), so it only shows through real occluders, never through the actor's own limbs. Detached / hidden parts (dropped helmet, swapped sword) collapse on the next draw; a sword / prop swap rebuilds it **in place** (keep the handle). `target` = actor, KittenView, Kitten, beast dress or Object3D. |
| `setXray(target, on, { color, alpha })` / `view.setXray(on, o)` | Show / hide + tint. Defaults: her `#FFE4EC` @ 0.55 (`XRAY`), enemies @ 0.45 (pass the telegraph colour). |
| `setHighlight(target, color \| null, strength = 1)` | Hover / selection rim (§7.4). Kittens: rim uniform in the kit + fur shaders (a cat on the shared kit material gets its own clone, same program). Other models: emissive on per-instance clones (`userData.assetOwned`, original emissive restored on `null`). |
| `ringAnchor(target, out?)` → `{ pos, radius }` | Ground point under the body + ring radius for the hero / selection rings. |
| `topTint(root, color?, { match })` | Contrasting colour on the upward-facing faces of helmet meshes (names matching helm / hat / hood / kettle by default); one shared clone per (material, colour). |
| `updateReadability(ctx)` | Called by `characterFrame` each frame: `TOP_VIEW` (0..1 from the lens → focus distance, 9 → 10.5 m) and `FUR_VIEW` (fur LOD from `cam.focus`). |

Readability from above (automatic, faded in by `TOP_VIEW`, so close-ups / cutscenes / Meme Cam / `?cam=classic` keep the
M1/M2 look): bow ×1.25 + 0.08 self-light (still pink, still on the LEFT ear), ears ×1.1, a 2 cm lighter cape-tip trim,
a little silver self-light on the blade. Barkus' horned helm has a pale crown. Fur LOD in iso: her shells stay full
within 25 m of the lens; other cats ramp by distance from `cam.focus` (5 → 14 m) and drop one furShells tier while the
lens is > 12 m from the focus (`FUR_LOD_ISO`). Bow / tuft / blade materials now call `own()` after their shader hook,
so world's fog patcher (C4 focus fog) wraps them instead of being replaced.

### → camera (P1 / Occluders)
1. The iso detection reads `ctx.cam.focus` (a `THREE.Vector3`) and `ctx.cam.modeName ∈ {follow, lock, boss}`, plus
   `ctx.params.cam !== 'classic'`. Please keep `modeName` as the gameplay mode name in the iso rig (it is `'follow'` for
   all three today) and `focus` a live Vector3; otherwise fur falls back to the lens rule (shells off at 13 m).
2. X-ray pass: call `characters.setXray(actor, on, { color, alpha })` (or toggle `getSilhouetteProxy(actor).visible`)
   instead of drawing your own pass; the proxy is already in the scene under the actor. Her proxy is prebuilt at level
   load and warmed; enemy proxies build lazily (~5–15 ms each): call `getSilhouetteProxy(e)` on engage if you want it
   off the frame where the wind-up starts.

### → enemies
3. Call `characters.topTint(e.visual)` once the gear is on (kettle helms, `Knight_Helmet`, feather hats), or pass the
   helmet mesh root. It clones per source material, so a pack shares one program.

### → ui / player (hover, selection)
4. On hover change call `characters.setHighlight(prev, null)` then `setHighlight(actor, '#FF6A3D' | '#FFD34D' | '#FFFFFF')`
   (enemies / interactables / NPCs and kittens, §7.4). Cheap to call every frame (idempotent).

### → fx (GroundDecals)
5. Hero ring / selection ring centre and radius: `characters.ringAnchor(actor)`.

### → core
6. Optional: mirror `READABILITY`, `XRAY`, `FUR_LOD_ISO` into `config.CAMERA.iso` (§13 "no literals"); characters
   reads `config.CAMERA.iso.lodFromFocus === false` to disable the focus LOD today and will read the rest when it lands.
