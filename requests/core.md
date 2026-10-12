# Open requests from core

- (camera, framing playtest) `CAMERA.iso.frameOffset` (0.04) and `CAMERA.iso.lead.up` (0.8) are no longer read: the
  landscape framing now lives in `src/camera/IsoRig.js` `FRAME` (her focus at 48 % of the band above the ability bar,
  no screen-up bias). Optional tidy-up: mark both keys deprecated in config.js (additions only; do not remove).

- (camera, occlusion review) please add `archOpacity: 0.1` to `CAMERA.iso.occl` (next to `opacity: 0.22`): the faded
  opacity of roofs and solid occluders (houses, towers, statues). At 0.22 (4 of the 16 dither cells) a saturated roof
  still reads as a heavy red tint over the street; 0.1 = 2 cells. FollowCamera reads `ISO.occl.archOpacity` and falls
  back to the same 0.1 until then.

Otherwise no open requests. The API notes of this area are archived in `docs/api/core.md`; what core applied is in `requests/RESOLVED.md`.
