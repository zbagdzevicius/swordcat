// scripts/social-meta.mjs  (owner: core) — absolute share-card URLs for the built index.html.
//
// Link scrapers (Open Graph, X/Twitter cards) do not resolve a relative `og:image`, and `base: './'` keeps every
// other path relative so dist/ works from any host. At build time vite.config.js rewrites the two image tags to
// `${site}og.jpg` and adds `og:url`. `site` is VITE_SITE_URL, else where the build is served (TOKENTAILS-PLAN.md §5.4,
// founder decision 2026-10-14: same origin at tokentails.com/swordcat-game/). The dev server keeps the relative tags.

export const DEFAULT_SITE_URL = 'https://tokentails.com/swordcat-game/';

/** Normalise a site URL to an absolute http(s) URL ending in '/', or null when it is not one. Pure. */
export function siteUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.href.endsWith('/') ? u.href : `${u.href}/`;
  } catch { return null; }
}

/** index.html → the same with absolute og:image / twitter:image and an og:url (added once). Pure. */
export function absoluteSocialUrls(html, site = DEFAULT_SITE_URL) {
  const base = siteUrl(site) ?? DEFAULT_SITE_URL;
  let out = html.replace(/(<meta (?:property="og:image"|name="twitter:image") content=")(?!https?:)([^"]+)(")/g,
    (_, a, p, b) => `${a}${new URL(p.replace(/^\.?\//, ''), base).href}${b}`);
  if (!/property="og:url"/.test(out)) out = out.replace(/(\s*)(<meta property="og:type"[^>]*>)/, `$1$2$1<meta property="og:url" content="${base}">`);
  return out;
}
