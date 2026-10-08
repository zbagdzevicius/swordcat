// src/ui/fonts.js  (owner: ui) — registers the OFL fonts in public/assets/fonts/ (GAME_DESIGN §14.1) with the
// FontFace API, URLs through ctx.assets.url() (relative base, works from any static host). fonts.css maps them to the
// --f-* families every screen uses; a system fallback renders until they arrive.

/** family, file (relative to public/assets/), descriptors. */
export const FONT_FILES = Object.freeze([
  { family: 'Cinzel Decorative', file: 'fonts/CinzelDecorative-Bold.ttf', weight: '700' },
  { family: 'Cinzel Decorative', file: 'fonts/CinzelDecorative-Regular.ttf', weight: '400' },
  { family: 'Cinzel', file: 'fonts/Cinzel-Variable.ttf', weight: '400 900' },
  { family: 'Fredoka', file: 'fonts/Fredoka-Variable.ttf', weight: '300 700' },
  { family: 'Uncial Antiqua', file: 'fonts/UncialAntiqua-Regular.ttf', weight: '400' },
  { family: 'MedievalSharp', file: 'fonts/MedievalSharp-Regular.ttf', weight: '400' },
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
      for (const ff of document.fonts) if (ff.family.replace(/["']/g, '') === f.family && ff.weight === f.weight) return;
      const face = new FontFace(f.family, `url("${url(f.file)}")`, { weight: f.weight, style: 'normal', display: 'swap' });
      document.fonts.add(face);
      await face.load();
      n++;
    } catch (e) { console.warn(`[ui] font ${f.file} failed`, e?.message ?? e); }
  }));
  return n;
}
