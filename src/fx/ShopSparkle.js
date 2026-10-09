// src/fx/ShopSparkle.js  (owner: fx) — the shop purchase sparkle (§14 shops, M2 hub). The shop UI is DOM, so the main
// effect is a DOM burst of gold stars + a ring over the bought item's card (a pointer-events-none layer above the UI,
// z-index 60), animated with the Web Animations API and removed when done. Node-safe: without a document it only counts.
// The world half (gold coins + sparkles at the shop counter or her) is FX.burst('purchase', …).

export const SHOP_SPARKLE = Object.freeze({ stars: 12, dur: 750, z: 60, colors: Object.freeze(['#FFD34D', '#FFF1C4', '#FFE3A3', '#FFFFFF']) });

/** Star layout for a burst (pure): n stars evenly around with jitter → [{dx, dy, s, rot, delay, color}]. */
export function sparkleLayout(n = SHOP_SPARKLE.stars, rng = Math.random, radius = 70) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.5, d = radius * (0.55 + rng() * 0.6);
    out.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d - 10, s: 0.7 + rng() * 0.7, rot: (rng() - 0.5) * 180, delay: Math.round(rng() * 90),
      color: SHOP_SPARKLE.colors[i % SHOP_SPARKLE.colors.length] });
  }
  return out;
}

export class ShopSparkle {
  constructor(rng = Math.random) { this.rng = rng; this.layer = null; this.shown = 0; this.live = 0; }

  _layer() {
    if (this.layer || typeof document === 'undefined' || !document.body) return this.layer;
    const L = document.createElement('div');
    L.className = 'fx-shop-layer';
    L.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${SHOP_SPARKLE.z};overflow:hidden;contain:strict;`;
    document.body.appendChild(L);
    this.layer = L;
    return L;
  }

  /**
   * Burst at a DOM element's centre (`el`) or at client coordinates (`x`, `y`; default the screen centre).
   * Options: count, color (overrides the star colours), scale. Returns true when drawn.
   */
  burst({ el = null, x = null, y = null, count = SHOP_SPARKLE.stars, color = null, scale = 1 } = {}) {
    this.shown++;
    const L = this._layer();
    if (!L) return false;
    let cx = x, cy = y;
    if (el?.getBoundingClientRect) { const r = el.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    if (!Number.isFinite(cx)) cx = (globalThis.innerWidth ?? 800) / 2;
    if (!Number.isFinite(cy)) cy = (globalThis.innerHeight ?? 600) / 2;
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const mk = (html, css) => { const s = document.createElement('span'); s.textContent = html; s.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;${css}`; L.appendChild(s); this.live++; return s; };
    const done = (s) => () => { s.remove(); this.live--; };
    // ring
    const ring = mk('', `width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:3px solid ${color ?? '#FFD34D'};box-shadow:0 0 12px ${color ?? '#FFD34D'};`);
    const ra = ring.animate?.([{ transform: 'scale(0.4)', opacity: 1 }, { transform: `scale(${6 * scale})`, opacity: 0 }], { duration: 480, easing: 'cubic-bezier(.2,.7,.3,1)' });
    if (ra) ra.onfinish = done(ring); else setTimeout(done(ring), 480);
    // stars
    for (const st of sparkleLayout(reduce ? Math.min(6, count) : count, this.rng, 110 * scale)) {
      const c = color ?? st.color;
      const s = mk('✦', `font:700 ${Math.round(26 * st.s * scale)}px/1 system-ui,sans-serif;color:${c};margin:-0.5em 0 0 -0.5em;`
        + `text-shadow:0 0 6px ${c},0 0 2px #3A2A1F;will-change:transform,opacity;`);
      const a = s.animate?.([
        { transform: 'translate(0,0) scale(0.2) rotate(0deg)', opacity: 0 },
        { transform: `translate(${st.dx * 0.6}px,${st.dy * 0.6}px) scale(1.15) rotate(${st.rot * 0.6}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${st.dx}px,${st.dy + 18}px) scale(0.5) rotate(${st.rot}deg)`, opacity: 0 },
      ], { duration: SHOP_SPARKLE.dur, delay: st.delay, easing: 'ease-out', fill: 'backwards' });
      if (a) a.onfinish = done(s); else setTimeout(done(s), SHOP_SPARKLE.dur + st.delay);
    }
    return true;
  }

  clear() { if (this.layer) this.layer.textContent = ''; this.live = 0; }

  dispose() { this.layer?.remove(); this.layer = null; this.live = 0; }
}
