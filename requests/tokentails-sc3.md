# SC3 (core) → other packages (Token Tails pass, 2026-10-13)

SC3 shipped: production debug gating (F4), `build:test` / `dist-test/` smoke infra (F11), the embed bridge
(`src/core/embed.js`, §5.5), WebGL context-loss and level-load recovery (`src/core/recovery.js`, F5 / F6), the
LevelManager CPU geometry release call (F7, part), `index.html` branding (F21) and hygiene (F20). Everything below codes
defensively today; nothing blocks.

## SC2a (strings.js)
- Optional keys for the recovery panels (English fallbacks live in `core/recovery.js RECOVERY_TEXT` until then):
  `recovery.context.title|body|action` ("Pawsbury Knight took a little nap" / "Your device paused the graphics. Your
  progress is saved." / "Tap to continue"), `recovery.level.title|body|action` ("This area did not load" / "Check your
  connection and try again." / "Retry"), `recovery.boot.title|body|action` ("Pawsbury Knight could not start" / "Check
  your connection, then reload. If it keeps happening, try another browser." / "Reload").
- Your SC3 ask (boot error 'Pawsbury Knight could not start'): done in `recovery.js` (main.js no longer prints the raw
  error text).

## SC2b (ui)
- `document.documentElement.dataset.embed = '1'` is set in `src/main.js` before `new Game()` (only when framed AND
  `?embed=1`). The Nunito preload replaced the Fredoka preload in `index.html`.
- Embed `pause` calls `ctx.ui.pause()` (pause menu); when that does not enter mode 'menu' (title, results, busy ui) the
  bridge falls back to `game.pause(true)` (frozen, no menu) and `resume` undoes exactly what it did. If the ui wants a
  distinct "paused by Token Tails" look, read `ctx.game.mode === 'menu'` with no open pause layer.

## SC4 (camera)
- F7: LevelManager reads the occluder fader's registered parts through `ctx.cam._fader.units[].parts[]`
  (`mesh`, `rayGeo`) to keep their CPU arrays (their triangle raycast reads uv / normal). Please expose a public
  `cam.occluderMeshes()` → iterable of meshes / geometries (LevelManager prefers it when present), or set
  `userData.keepCpu = true` on a part's mesh in `Occluders._part()`.
- Meshes registered later through `cam.addFadeable(obj)` / `refreshFadeable` after `level:loaded` may already have
  dropped uv / normal arrays (only big >= 1024-vertex level meshes are released). If such a registration happens on a
  level mesh, mark it `userData.keepCpu = true` before the load ends, or have `_segmentHitsTriangles` skip parts whose
  `rayGeo.attributes.uv?.array === null`.

## SC5 (Assets)
- `releaseCpuOnUpload` is called once per load after `level:loaded`; LevelManager pre-marks `userData.keepCpu` on:
  geometry shared with settled `gltf:` cache entries (read via `assets._values`), BatchedMesh / Instanced / Skinned,
  camera fade / occluder meshes, meshes under 1024 vertices (module-level geometry caches) and geometry whose `normal`
  aliases `position`. A public `assets.sharedGeometries()` would let LevelManager stop reading `_values`.
- LevelManager now calls `assets._cancelRelease()` before the preload (it emits `level:loading` only after the
  preload succeeds, so the previous level's delayed release could otherwise drop what was just preloaded). A public
  name (`cancelRelease()`) would be nicer.

## TT1 (Token Tails host)
- Send `hello` repeatedly (e.g. every 500 ms) until `ready` arrives: the game answers only after it has booted
  (a `hello` before boot is remembered and answered on `game:ready`, but a `hello` sent before the iframe's script
  runs is lost).
- Local dev: Swordcat's dev server is now on `http://localhost:5175/`; production builds accept
  `https://tokentails.com`, `https://www.tokentails.com` and `http://localhost:3000` unless `VITE_EMBED_ORIGINS` is set
  at build time.
- A failed level download shows the game's own Retry panel inside the iframe; after a failed module import Retry
  saves and reloads the iframe page (browsers cache a failed dynamic import).

## Unowned / founder
- `tests/unit/contracts.test.js` "core.W1 … plate words" expected 'POSTMASTER' while SC1 / SC2a moved it to
  'SNACK SHARER' (in flight in SC1 / SC2a, not SC3).
