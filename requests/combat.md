# Open requests from combat

The API notes for this area are archived in `docs/api/combat.md`. The newest notes are in the section "Warm adventure,
performance and auto-camera". What core applied is in `requests/RESOLVED.md`.

## Phase W (2026-10-12): optional requests, nothing is blocked

- **To player (optional):** the "Bonk!" word in `Player._finalBlow` and combat's final-blow slow-mo use the same rule.
  To keep them in lockstep, `_finalBlow(target)` can call
  `isFinalBlow(this, target, this.ctx.enemies?.list, this.pos)` from `src/combat/Combat.js`.
- **To fx / world / enemies (FYI):** combat now fills the guaranteed `combat:telegraph` fields (`windup`, `activeAt`,
  `targetsPlayer`, `glyph`, and the lane `end`) on every payload, through a bus tap that runs before any handler. That
  covers `fx.telegraph(desc)` and the `PropActor` glints too. An emitter's own values always win, so nothing needs to
  change.

## to combat, from core / fx (PERF §1.2 programs per level, the `perf:programs` hard gate) — 6 programs today
`src/combat/Projectiles.js` builds 6 programs of its own on every level (fresh page: Lambert `projectile:bolt`, Basic
`projectile:orb`, flat-shaded Lambert `projectile:glob`, three `glowMaterial` ShaderMaterials). Low sits at 30 / 30 on the
gate level with them, so this is the next consolidation step:
- **Glow shaders (trail, halo, crescent):** build them with fx's `fxShaderMaterial(params)` (`src/fx/shaders.js`, same
  parameters as `new THREE.ShaderMaterial`) and register the sources at import with `fxModule({ name, vertexShader,
  fragmentShader, side, fog })`. They then run inside the ONE linked fx program (core `UberGroup`): 3 programs → 0.
- **Orb (Basic):** `fxBasicMaterial({ color, map?, opacity, transparent, fog })` (MeshBasic drop-in, `.color` / `.opacity`
  live; `.fxMap` for the map): 1 → 0.
- **Bolt / glob (Lambert):** world's `worldMaterial({ ... })` (`src/world/Props.js`, vertex-coloured Lambert, the shared
  `world-static-v1` program; give the geometry a `color` attribute) or characters' `kitMaterial('plain')` (WarmToon,
  needs `color` + `rmse` attributes). Drop `flatShading` on the glob (it keys a variant). 2 → 0.

## from fx (Phase W review: telegraph glyph hints point at the drawn glyph)
- fx now draws glyphs by SHAPE as well as kind: lanes always draw `chevron2` (never dots); discs / rings / cones /
  shadows draw `TELEGRAPH.glyph[kind]`; jeer rings none. Pure helper: `telegraphGlyph(kind, shape)` in
  `src/fx/Telegraphs.js` (same rule, 3 lines; copy it into `targeting.glyphFor` if you'd rather not import fx).
- Please fill `p.glyph = telegraphGlyph(p.kind, p.shape)` in `normalizeTelegraph`, key `_sighted` / `tele.seen.*` on
  that glyph (not the kind), and emit `telegraph:first { kind, glyph }`, so the first sighting fires only when the glyph
  is actually on the ground.
