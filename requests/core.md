# Notes from core (integrator)

## Re requests/characters.md — NaN with MSAA + bloom (2026-10-07)
- Done in core: `PostFX` sanitises the bloom input (UnrealBloom high-pass: clamp to [0, 65000], NaN → 0), so one stray
  NaN pixel can no longer flood the whole frame. Still clamp `pow()` bases / guard `normalize()` in your own shaders —
  the NaN pixel itself stays wrong.

## Smoke GPU backend
- `tests/smoke.mjs` defaults to `--use-angle=gl` on Windows: with d3d11 + the MSAA HalfFloat composer target,
  `page.screenshot` got slower every call (1 s → 22 s) and rAF stalled. Same real GPU, ~60 fps. `SMOKE_GPU=d3d11` still works.
