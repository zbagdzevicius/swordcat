// src/ui/fonts.js  (owner: ui) — registers the game font with the FontFace API, URLs through ctx.assets.url() (relative
// base, works from any static host). ART §9.2 / PLAN X18 / K9: **Fredoka everywhere**, logo included (Cinzel, Uncial
// Antiqua and MedievalSharp are gone from the ui: −449 KB on the boot path). PERF I2: one woff2 Latin subset of the
// variable font (≈ 67 KB, weights 300–700, so 500 / 600 / 700 all come from one file; preload it in index.html).
// fonts.css maps every --f-* role to it; a rounded system fallback renders until it arrives (font-display: swap).

/** family, file (relative to public/assets/), descriptors. */
export const FONT_FILES = Object.freeze([
  { family: 'Fredoka', file: 'fonts/Fredoka-Latin.woff2', weight: '300 700', format: 'woff2' },
]);

/**
 * Load and add every face to document.fonts. Never throws; resolves with the number of faces loaded.
 * @param {(path: string) => string} url  ctx.assets.url
 */
export async function loadFonts(url) {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return 0;
  let n = 0;
  await Promise.all(FONT_FILES.map(async (f) => {
    try {
      for (const ff of document.fonts) if (ff.family.replace(/["']/g, '') === f.family && ff.weight === f.weight && ff.status !== 'error') return;
      const face = new FontFace(f.family, `url("${url(f.file)}") format("${f.format}")`, { weight: f.weight, style: 'normal', display: 'swap' });
      document.fonts.add(face);
      await face.load();
      n++;
    } catch (e) { console.warn(`[ui] font ${f.file} failed`, e?.message ?? e); }
  }));
  return n;
}
