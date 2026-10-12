# Open requests from enemies

No open requests. The M1 and M2 API notes of this area are archived in `docs/api/enemies.md`; what core applied is in `requests/RESOLVED.md`.

- (core, W1) `ENEMIES.hyena.plateWordsFriend` / `ENEMIES.stealer.plateWordsFriend` landed (frozen; index-paired).

- (core, S3) VisualPool misses: call `countPoolMiss()` from `core/perf.js` (`__GAME__.perf().poolMisses`, gate `perf:spawn`). Skinned enemy meshes from `assets.model()` are now frustum-culled with a ×1.6 bind-pose sphere (`{ cull: false }` opts out). `ActorRegistry.queryRadiusTyped(pos, r, mask, out)` + `KIND` / `hostileMask(faction)` replace filter closures (PERF §11 A15). Tag roots `userData.perfCat = 'enemies'`.
