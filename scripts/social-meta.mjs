// scripts/social-meta.mjs  (owner: core) — absolute share-card URLs for the built index.html.
//
// Link scrapers (Open Graph, X/Twitter cards) do not resolve a relative `og:image`, and `base: './'` keeps every
// other path relative so dist/ works from any host. At build time vite.config.js rewrites the two image tags to
// `${site}og.jpg` and adds `og:url`. `site` is VITE_SITE_URL, else where the build is served (TOKENTAILS-PLAN.md §5.4,
// founder decision 2026-10-14: same origin at tokentails.com/swordcat-game/). The dev server keeps the relative tags.

export const DEFAULT_SITE_URL = 'https://tokentails.com/swordcat-game/';
/**
 * The page people share: og:url on the default host. Next.js serves no directory index, so the build folder URL
 * (DEFAULT_SITE_URL) 404s; the /swordcat host page is the real page. VITE_PAGE_URL overrides it.
 */
export const DEFAULT_PAGE_URL = 'https://tokentails.com/swordcat';

/**
 * index.html carries the game's name only as placeholders (TOKENTAILS-PLAN §10.4: one title constant): `%GAME_TITLE%`,
 * `%GAME_SUBTITLE%`, `%GAME_TAGLINE%`, `%PAGE_TITLE%` ("<title> · Token Tails") and `%OG_ALT%`. vite.config.js fills
 * them from src/core/brand.js in dev and build (`transformIndexHtml`, order 'pre'). Values are HTML-attribute escaped.
 * Pure. @param {string} html @param {{ title: string, subtitle: string, tagline: string }} brand
 */
export function brandHtml(html, brand) {
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const vars = {
    GAME_TITLE: brand.title,
    GAME_SUBTITLE: brand.subtitle,
    GAME_TAGLINE: brand.tagline,
    PAGE_TITLE: `${brand.title} · Token Tails`,
    OG_ALT: `${brand.title}: Clementine, a tiny ivory cat knight with a pink bow, and the title. ${brand.subtitle}.`,
  };
  return String(html).replace(/%(GAME_TITLE|GAME_SUBTITLE|GAME_TAGLINE|PAGE_TITLE|OG_ALT)%/g, (_, k) => esc(vars[k]));
}

/** Normalise a site URL to an absolute http(s) URL ending in '/', or null when it is not one. Pure. */
export function siteUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.href.endsWith('/') ? u.href : `${u.href}/`;
  } catch { return null; }
}

/** An absolute http(s) page URL (kept as given, no trailing slash added), or null. Pure. */
export function pageUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try { const u = new URL(raw.trim()); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null; } catch { return null; }
}

/**
 * index.html → the same with absolute og:image / twitter:image and an og:url (added once). og:url is `page` when given,
 * else the /swordcat host page on the default host, else the build's own folder on a custom host. Pure.
 */
export function absoluteSocialUrls(html, site = DEFAULT_SITE_URL, page) {
  const base = siteUrl(site) ?? DEFAULT_SITE_URL;
  const canonical = pageUrl(page) ?? (base === DEFAULT_SITE_URL ? DEFAULT_PAGE_URL : base);
  let out = html.replace(/(<meta (?:property="og:image"|name="twitter:image") content=")(?!https?:)([^"]+)(")/g,
    (_, a, p, b) => `${a}${new URL(p.replace(/^\.?\//, ''), base).href}${b}`);
  if (!/property="og:url"/.test(out)) out = out.replace(/(\s*)(<meta property="og:type"[^>]*>)/, `$1$2$1<meta property="og:url" content="${canonical}">`);
  return out;
}

// ------------------------------------------------------------------ the share card (public/og.jpg)
/**
 * Render the 1200×630 share card from a running dev server (TOKENTAILS-PLAN §10.4: Clem with her pink bow, the title,
 * the tagline and the "A Token Tails game" co-brand pill on Token Tails night). Everything on the card is drawn by the
 * game itself (her procedural portrait, the title logo, the co-brand footer), so the image needs no third-party art.
 *   node scripts/social-meta.mjs og --url http://localhost:5333/ [--out public/og.jpg]
 * Playwright is loaded only here (vite.config.js imports this module for the pure helpers above).
 * @param {{ url: string, out?: string, quality?: number }} o
 */
export async function renderOg({ url, out = 'public/og.jpg', quality = 86 }) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.goto(`${url.replace(/\/?$/, '/')}?test=1&seed=1`, { timeout: 90000 });
    await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 90000 });
    await page.evaluate(() => { const g = window.__GAME__, ui = g.ctx.ui; g.story.skip?.(); g.setMode('play'); ui.hasSave = () => false; ui.menus.closeAll(); ui.showTitle(); });
    await page.waitForTimeout(2600);
    await page.evaluate(async () => {
      // a computed specifier: vite.config.js bundles this module and must not try to resolve the page's own path
      const { portraitSVG } = await import(/* @vite-ignore */ `${location.origin}/src/ui/portraits.js`);
      const logo = document.querySelector('.ui-title .logo')?.outerHTML ?? '';
      const tagline = document.querySelector('.ui-title .title-tagline')?.textContent ?? '';
      const pill = document.querySelector('.ui-title .title-foot')?.innerHTML ?? '';
      const card = document.createElement('div');
      card.id = 'og-card';
      card.innerHTML = `<style>
        #og-card { position: fixed; inset: 0; z-index: 99999; display: flex; align-items: center; gap: 44px; padding: 0 56px 0 64px; box-sizing: border-box;
          background: radial-gradient(42% 60% at 25% 50%, #FFCC5540 0%, #FFCC5500 70%), radial-gradient(60% 80% at 75% 40%, #FF7AA222 0%, #FF7AA200 70%),
            linear-gradient(180deg, #0B0820 0%, #2A1F45 100%); font-family: Nunito, system-ui, sans-serif; }
        #og-card .og-hero { flex: none; width: 360px; height: 360px; border-radius: 50%; overflow: hidden; background: #FFE9D6;
          box-shadow: 0 0 0 10px #FFFFFF, 0 0 0 18px #FFCC55, 0 0 0 22px #4A1D08, 0 18px 40px #0B0820AA; }
        #og-card .og-hero svg { width: 112%; height: 112%; margin: -6% 0 0 -6%; display: block; }
        #og-card .og-text { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
        #og-card .logo { opacity: 1 !important; transform: none !important; animation: none !important; }
        #og-card .logo-word { font-size: 68px; }
        #og-card .logo-sub { font-size: 28px; margin-top: 14px; }
        #og-card .og-tag { margin-top: 26px; font-weight: 800; font-size: 24px; line-height: 1.35; color: #FFF3D0; text-shadow: 0 2px 0 #0B0820; max-width: 19em; text-wrap: balance; }
        #og-card .og-pill { margin-top: 30px; display: inline-flex; align-items: center; gap: .5em; padding: .2em 1.1em .22em .3em; border-radius: 999px;
          background: #2A1F45; border: 3px solid #FFCC55; color: #FFE9A0; font-weight: 800; font-size: 26px; }
        #og-card .og-pill .tt-logo { width: 44px; height: 44px; border-radius: 50%; }
      </style><div class="og-hero">${portraitSVG('swordcat', { expression: 'happy' })}</div>`
        + `<div class="og-text">${logo}<div class="og-tag">${tagline}</div><div class="og-pill">${pill}</div></div>`;
      document.body.append(card);
      await Promise.all([...card.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
      await document.fonts?.ready;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: out, type: 'jpeg', quality, clip: { x: 0, y: 0, width: 1200, height: 630 } });
    return out;
  } finally { await browser.close(); }
}

const isMain = (() => { try { return import.meta.url === new URL(`file://${process.argv[1]}`).href; } catch { return false; } })();
if (isMain && process.argv[2] === 'og') {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const url = arg('--url', 'http://localhost:5333/');
  renderOg({ url, out: arg('--out', 'public/og.jpg') }).then((p) => console.log(`[og] wrote ${p} from ${url}`)).catch((e) => { console.error('[og] failed', e); process.exit(1); });
}
