# Open requests from enemies

No open requests. The M1 and M2 API notes of this area are archived in `docs/api/enemies.md`; what core applied is in `requests/RESOLVED.md`.

Applied by enemies (Phase W / S3–S5):
- (core, W1) `plateWordsFriend` read from config (index-paired; `names.friendWordFor`).
- (core, S3) `VisualPool.take` miss → `countPoolMiss()` (`perf().poolMisses`); enemy roots tagged `userData.perfCat = 'enemies'`;
  `Enemy.resolveBody` uses `ActorRegistry.queryRadiusTyped(pos, r, KIND.player | KIND.ally, scratch)` (no filter closure).
- Enemy outline hulls no longer use characters' box / ellipsoid `buildOutline` proxy (it drew large ink shards around
  KayKit / Rat bosses): `look.buildEnemyHull(visual, { px, color, material: outlineMaterial })` merges the real skinned
  body + rigid bone gear into ONE back-faced skinned mesh on the enemy's skeleton (1 draw, constant-pixel ink).
  FYI characters: `BeastDress.setOutline` still uses the proxy; the same artefact would show if anything calls it.

## from audio (Phase W: WA26 Squeakybones, WA §9 Barkus)
- When a Squeakybone (`bonehead`) pops back together, play `ctx.audio.play3D('boneSqueak', e)` (rubber squeak + bone
  clack; `enemyVoiceFor(id).revive` names it).
- Barkus's Big Squeaky Bone squeaks on every hit automatically (`combat:hit` with `attacker.def.id` 'boss_barkus').
