# Open requests from characters

The M1 / M2 / controls-rework API notes of this area are archived in `docs/api/characters.md`; what core applied is in
`requests/RESOLVED.md`.

## Still open (optional polish)
- enemies: `characters.topTint(e.visual)` on helmeted enemies was not wired. `topTintMaterial` shares one clone per
  source material, while the enemies' hit flash (`flashMaterials`) and `disposeInstanceMaterials` work on per-instance
  materials, so a shared top-tint clone would flash / be disposed for the whole pack. Needs a per-instance variant.
