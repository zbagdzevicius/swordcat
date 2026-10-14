# TT3 R2: Token Tails night banners in the town square (done 2026-10-14)

Applied `requests/tokentails-tt2-g4.md` §1 (TOKENTAILS-PLAN §10.4 banners row).

## Done

- `src/world/levels/town.js`: `square()` no longer loads KayKit `banner-red`; it places
  `kit.proc('tt_wall_banner', () => ttWallBannerParts(0.9, 1.6))` at the same two spots (x ±2.9, z 31.5, lift 2.6,
  no collider). `ttWallBannerParts` imported from `../Hub.js`. `M.banner` dropped from `M` and from the level's
  `models` list.
- One change from the g4 snippet: yaw is `Math.PI`, not `0`. `ttWallBannerParts` puts the coin on the +Z face only;
  at yaw 0 the square saw the plain back of the cloth (checked in a screenshot). The old KayKit cloth looked the same
  from both sides, so the old yaw did not matter.
- `src/world/assets.manifest.js`: `models/env/town/banner-red.glb` removed from the default list and from
  `levels.town`. Nothing else in `src/` references it. The `.glb` file stays on disk under `public/assets/models/env/town/`
  and is still listed in `public/assets/ASSETS.md`.
- `tests/unit/world.test.js`: new test "TT3 R2 / §10.4". It checks that the town model list and manifest have no
  `banner-red`, runs `square()` on a stub kit, and checks for two `tt_wall_banner` placements at the old spots, with
  the coin face turned to the square and the night cloth `#2A1F45`. The existing manifest sync test passes unchanged.
- `tests/smoke/world.mjs`: the `world:rescue-house` block now also asserts that a `tt_wall_banner` template exists and no
  `banner-red` template does. The syntax check passes; the smoke run itself is Q1's job.

## g4 §2 (gate banners): decision

Left as is (default, no founder answer): `gate.js` keeps `flag-banner-long` tinted `#FF9E7A` as the hyena toy fort's
colours, and its manifest entries are unchanged. No edit was needed to keep the manifest in sync.

## Handoffs (files R2 does not own)

- Q1 / docs owner: `public/assets/ASSETS.md` still lists `models/env/town/banner-red.glb`. Either note it as unused
  or delete the file and its row. It is harmless; the file is no longer preloaded or requested.
- Q1 (STATUS / TOKENTAILS-PLAN §10.4): mark the banners row done for the town square. The gate stays hyena-coloured
  by default.

## Open issues (pre-existing, not changed)

- The two square banners hang at 2.6 m with no wall or post behind them; the KayKit banners floated the same way.
- `M.bannerG` (`banner-green`) is defined in `town.js` but unused. It is not in the models list, so nothing loads it.
- `npm run test:unit` once failed the A* timing test (`nav.test.js`, 20.8 ms per query) while load average was
  above 150. Rerun: 1130/1130 pass.
