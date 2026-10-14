# TT2 G4 requests (world and characters)

Edits G4 needs in files it does not own. Each is exact and small; apply in order.

## 1. town.js: Token Tails night banners instead of the red KayKit `banner-red` (TOKENTAILS-PLAN §10.4)

`src/world/levels/town.js` (owner: world levels, not in any TT2 package):

```js
// line 10
import { buildHub, signParts, ttWallBannerParts } from '../Hub.js';
```

In `square(kit, zone)` replace the KayKit banner load and placement:

```js
// before
const [fountain, stallR, stallG, bench, banner] = await Promise.all([kit.tpl(M.fountain), kit.tpl(M.stallR), kit.tpl(M.stallG), kit.tpl(M.stallBench), kit.tpl(M.banner)]);
...
if (banner) for (const [x, z, yaw] of [[-2.9, 31.5, 0], [2.9, 31.5, 0]]) kit.place(banner, x, z, { fit: { h: 1.6 }, lift: 2.6, yaw, collider: false, clear: false, occupy: false, jitter: 0 });

// after
const [fountain, stallR, stallG, bench] = await Promise.all([kit.tpl(M.fountain), kit.tpl(M.stallR), kit.tpl(M.stallG), kit.tpl(M.stallBench)]);
...
const ttBanner = kit.proc('tt_wall_banner', () => ttWallBannerParts(0.9, 1.6));
for (const [x, z, yaw] of [[-2.9, 31.5, 0], [2.9, 31.5, 0]]) kit.place(ttBanner, x, z, { lift: 2.6, yaw, collider: false, clear: false, occupy: false, jitter: 0 });
```

and drop `M.banner` from the `models:` list at the end of the level def (and `banner: T('banner-red')` from `M` if
nothing else reads it). Then `src/world/assets.manifest.js` (G4, apply together or the world.test sync check fails):
delete `'models/env/town/banner-red.glb',` from the default list and from `levels.town`.

## 2. gate.js: the gatehouse banners (optional; the gate is the hyena toy fort)

`flag-banner-long` is tinted `#FF9E7A` there (LOOK.banner). If the founder wants Token Tails banners on the gate too
(the towers are Pawsbury's sea gate, held by the hyenas until `gate.done`):

```js
import { ttWallBannerParts } from '../Hub.js';
// towers(): replace kit.tpl(M.banner, LOOK.banner) and its place with
const ttb = kit.proc('tt_wall_banner_tall', () => ttWallBannerParts(1.2, 3.4));
kit.place(ttb, x + (x < 0 ? 4.25 : -4.25), z, { y: 4.2, yaw: x < 0 ? 0 : Math.PI, collider: false, clear: false, occupy: false, jitter: 0 });
// gatehouse(): the same for the two arch banners (h 3.6, y 4.6)
```

then drop `M.banner` from gate's `models` and `'models/env/castle/flag-banner-long.glb'` from
`src/world/assets.manifest.js` (default list + `levels.gate`). `flag-pennant` (the coral siege-toy pennants) stays.
Default without an answer: leave the gate as is (hyena fort colours).

## 3. Test breakages caused by other packages (seen 2026-10-14, not G4 code)

- `tests/unit/controls.test.js:257` "touch tutorial: a Meow inside the hide wipe keeps the Pearl tutpearl spawns, and
  practice ends" → "the hide wipe is pending": G2 removed the cow Meow lesson and its 1.2 s wipe (§10.3). G2 / the
  orchestrator should update or retire that test.
- `tests/unit/core.test.js:866` "F21 / §2.6: index.html is Pink Paw Knight · Token Tails": G3's index.html
  `%GAME_TITLE%` work in progress.
- G4 updated its own `tests/unit/world.test.js` to G2's meadow changes (3 first-fight rats → 33 `rat_pike`, the
  first-fight arena + stage, the fence nav link without the `tut.jump.done` gate). If G2 renames the first-fight arena
  or changes its rat count again, those three assertions follow `def.zones` (arena found by `lockOn: 'cs02:end'`).

## 4. For G1 / G2 (no edit needed, information)

- `level.anchors.rescue_house` (town): the spot in front of the Rescue House, 1.7 m from the keeper, facing the
  fountain. Usable as a `guideTarget()` / quest spot (`a:rescue_house`).
- `Hub.js` exports `RESCUE_HOUSE { at, yaw, scale, size }`, `HUB_TT` (hub colours), `rescueHouseParts`,
  `ttBannerParts`, `ttWallBannerParts`, `coinParts`; `signParts('paw')` is the love-pink paw plaque.
- Characters: `setHullFur(mesh, on)` (Readability) and `KITTEN_COATS`, `PLATE_FONT`, `plateFamily` (index exports).
