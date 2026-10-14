// src/ui/fonts.js  (owner: ui) — registers the game fonts with the FontFace API, URLs through ctx.assets.url() (relative
// base, works from any static host). Token Tails brand (docs/TOKENTAILS-PLAN.md §2.6): **Nunito** for body text
// (Latin + Latin Extended, so Lithuanian names such as Rožinė pėdutė render in the brand face; variable weights 200–1000
// in one file each) and **Passion One 900** for the title and headings (ASCII only: it has no Lithuanian glyphs, so the
// stacks fall through to Nunito for those). Fredoka stays as the rounded fallback (ART §9.2 / PERF I2 woff2 subset).
// All three are SIL OFL 1.1; their licences ship in fonts/licenses/. fonts.css maps every --f-* role to them; a rounded
// system fallback renders until they arrive (font-display: swap). index.html preloads the Nunito Latin file.

/** family, file (relative to public/assets/), descriptors (`unicodeRange` splits Nunito into its two subsets). */
export const FONT_FILES = Object.freeze([
  { family: 'Nunito', file: 'fonts/nunito-latin-wght-normal.woff2', weight: '200 1000', format: 'woff2',
    unicodeRange: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { family: 'Nunito', file: 'fonts/nunito-latin-ext-wght-normal.woff2', weight: '200 1000', format: 'woff2',
    unicodeRange: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  { family: 'Passion One', file: 'fonts/passion-one-latin-900-normal.woff2', weight: '900', format: 'woff2',
    unicodeRange: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { family: 'Fredoka', file: 'fonts/Fredoka-Latin.woff2', weight: '300 700', format: 'woff2' },
]);

/** The licence texts shipped beside the faces (kept by scripts/prune-assets.mjs; listed in the ui manifest). */
export const FONT_LICENSES = Object.freeze([
  'fonts/licenses/LICENSE-nunito.txt',
  'fonts/licenses/LICENSE-passion-one.txt',
  'fonts/licenses/Fredoka-OFL.txt',
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
      const range = f.unicodeRange ?? 'U+0-10FFFF';
      for (const ff of document.fonts) {
        if (ff.family.replace(/["']/g, '') === f.family && ff.weight === f.weight && ff.status !== 'error'
          && (!f.unicodeRange || ff.unicodeRange === range)) return;
      }
      const desc = { weight: f.weight, style: 'normal', display: 'swap' };
      if (f.unicodeRange) desc.unicodeRange = f.unicodeRange;
      const face = new FontFace(f.family, `url("${url(f.file)}") format("${f.format}")`, desc);
      document.fonts.add(face);
      await face.load();
      n++;
    } catch (e) { console.warn(`[ui] font ${f.file} failed`, e?.message ?? e); }
  }));
  return n;
}
