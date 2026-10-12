// src/ui/cursor.js  (owner: ui) — research/CONTROLS_SPEC.md §10.2 context cursors over the game canvas.
//
//   ground       the gauntlet paw (silver plate, a pink bow ribbon on the cuff)
//   enemy        a red sword (also breakables)
//   interact     paw + a wax seal (interactables, NPCs, cages)
//   pickup       a sparkle paw
//   attackMove   sword + arrow while attack-move is armed
//   aim          a ring reticle while an ability / aim indicator is open
//   unreachable  a grey paw with an ✕ over ground with no walkable cell within 2 m (a partial path with a gap > 2 m)
//   none         cutscenes and the Meme Cam;   default   the plain arrow in menus
//
// CSS cursors drawn as inline SVG at 32 px, ×1.5 and ×2 (settings.cursorSize) and a high-contrast variant
// (settings.cursorContrast: a thick black outline over white / yellow fills). The kind is also written to
// `#app[data-cursor]` (spec: "ui sets a class on #game from player.hover.kind") so CSS / smoke can read it.
// `cursorKind` is pure (node-tested); `CursorController` owns the per-frame DOM write (only on change).

/** Every cursor kind (stable ids; smoke and tests read them). */
export const CURSOR_KINDS = Object.freeze(['ground', 'enemy', 'interact', 'pickup', 'attackMove', 'aim', 'unreachable']);

/** hover.kind (camera Picker) → cursor kind. */
const HOVER_KIND = Object.freeze({ ground: 'ground', enemy: 'enemy', breakable: 'enemy', interact: 'interact', npc: 'interact', pickup: 'pickup' });

/** Gap (m) past which the ground under the cursor reads as unreachable (§10.2: a partial path with a gap > 2 m). */
export const UNREACHABLE_GAP = 2;

/**
 * The cursor kind for the current frame. Pure.
 * @param {{ mode?: string, menu?: boolean, meme?: boolean, aiming?: boolean, attackMove?: boolean, hoverKind?: string,
 *   unreachable?: boolean }} s
 * @returns {'none'|'default'|'ground'|'enemy'|'interact'|'pickup'|'attackMove'|'aim'|'unreachable'}
 */
export function cursorKind(s) {
  if (s.meme || s.mode === 'cutscene' || s.mode === 'memecam') return 'none';
  if (s.menu || s.mode !== 'play') return 'default';
  if (s.aiming) return 'aim';
  if (s.attackMove) return 'attackMove';
  const k = HOVER_KIND[s.hoverKind ?? 'ground'] ?? 'ground';
  if (k === 'ground' && s.unreachable) return 'unreachable';
  return k;
}

// ------------------------------------------------------------------ art (32 × 32 viewBox)
const INK = '#2A1E18';
/** The gauntlet pointer: a silver plate arrow (tip at 3,2), knuckle ridges and a pink bow ribbon on the cuff. */
const pawBody = (fill, ink, w) => `<path d="M3 2l4.2 22.4 4.6-6.1 5.6 9.6 4.4-2.6-5.5-9.5 7.6-1z" fill="${fill}" stroke="${ink}" stroke-width="${w}" stroke-linejoin="round"/>`
  + `<path d="M6.3 8.5l8.4 7.6" stroke="${ink}" stroke-opacity=".35" stroke-width="1.1" fill="none"/>`;
const ribbon = (ink, hc) => `<g stroke="${ink}" stroke-width="${hc ? 1.6 : 1.1}" stroke-linejoin="round"><path d="M19 25.3l-3.1-3.9 1.2 5.6z" fill="#F7A8C4"/><path d="M19 25.3l4.6-1.9-3.4 4.8z" fill="#F7A8C4"/><circle cx="19" cy="25.3" r="1.6" fill="#E46A93"/></g>`;
const sword = (blade, ink, w) => `<g stroke="${ink}" stroke-width="${w}" stroke-linejoin="round"><path d="M2.5 2.5l4.5.6 13.3 13.3-3.9 3.9L3.1 7z" fill="${blade}"/>`
  + `<path d="M15.2 21.6l6.4-6.4 2.4 2.4-6.4 6.4z" fill="#D9B26A"/><path d="M21 21l6.2 6.2" stroke-width="${w * 2.1}" stroke-linecap="round"/><circle cx="28.2" cy="28.2" r="2" fill="#D9B26A"/></g>`;
const seal = (ink, w) => `<g stroke="${ink}" stroke-width="${w}"><path d="M23.5 16.6l2 1.6 2.5-.4.6 2.5 2.1 1.4-1 2.3.6 2.5-2.4.9-1.1 2.3-2.4-.8-2.3 1.1-1.2-2.2-2.4-.8.4-2.5-1.2-2.2 2.1-1.4.3-2.5 2.5.2z" fill="#D9566F"/></g>`
  + '<path d="M21.6 23.6c.6-1.9 3.3-1.9 3.8 0c.4 1.6-1.9 2.4-1.9 2.4s-2.4-.8-1.9-2.4z" fill="#F7A8C4"/>';
const sparkle = (ink, w) => `<g stroke="${ink}" stroke-width="${w}" stroke-linejoin="round" fill="#FFD34D"><path d="M24.5 13l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z"/><path d="M28.5 4.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></g>`;
const arrow = (ink, w) => `<g fill="none" stroke="${ink}" stroke-width="${w + 1.6}" stroke-linecap="round" stroke-linejoin="round"><path d="M18.5 28h11M25.5 24l4 4-4 4"/></g>`
  + '<g fill="none" stroke="#FFF6E6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18.5 28h11M25.5 24l4 4-4 4"/></g>';
const reticle = (hc) => `<g fill="none" stroke="${INK}" stroke-width="${hc ? 5 : 4}" stroke-linecap="round"><circle cx="16" cy="16" r="9"/><path d="M16 2.5v5M16 24.5v5M2.5 16h5M24.5 16h5"/></g>`
  + `<g fill="none" stroke="${hc ? '#FFE14D' : '#FFF6E6'}" stroke-width="2.2" stroke-linecap="round"><circle cx="16" cy="16" r="9"/><path d="M16 2.5v5M16 24.5v5M2.5 16h5M24.5 16h5"/></g>`
  + '<circle cx="16" cy="16" r="2.2" fill="#FF6A3D" stroke="#2A1E18" stroke-width=".8"/>';
const cross = (ink) => `<g stroke-linecap="round"><path d="M20 19l8 8M28 19l-8 8" stroke="${ink}" stroke-width="5"/><path d="M20 19l8 8M28 19l-8 8" stroke="#E7EAEE" stroke-width="2.2"/></g>`;

/** SVG markup + hotspot (in the 32-unit space) per kind and contrast. */
function art(kind, hc) {
  const w = hc ? 2.4 : 1.5, ink = hc ? '#000000' : INK;
  const plate = hc ? '#FFFFFF' : '#E7EAEE';
  switch (kind) {
    case 'enemy': return { svg: sword(hc ? '#FF3B30' : '#FF6A3D', ink, w), hx: 3, hy: 3 };
    case 'interact': return { svg: pawBody(plate, ink, w) + seal(ink, hc ? 1.6 : 1.1), hx: 3, hy: 2 };
    case 'pickup': return { svg: pawBody(plate, ink, w) + sparkle(ink, hc ? 1.5 : 1), hx: 3, hy: 2 };
    case 'attackMove': return { svg: sword(hc ? '#FF3B30' : '#FF3B30', ink, w) + arrow(ink, w), hx: 3, hy: 3 };
    case 'aim': return { svg: reticle(hc), hx: 16, hy: 16 };
    case 'unreachable': return { svg: `<g opacity="${hc ? 1 : 0.9}">${pawBody(hc ? '#BDBDBD' : '#A9ADB2', ink, w)}</g>` + cross(ink), hx: 3, hy: 2 };
    default: return { svg: pawBody(plate, ink, w) + ribbon(ink, hc), hx: 3, hy: 2 };
  }
}

const _cache = new Map();
/** Clamp the cursor-size setting (1, 1.5 or 2). */
export const clampCursorSize = (s) => (s >= 1.75 ? 2 : s >= 1.25 ? 1.5 : 1);

/**
 * CSS `cursor` value for a kind at a size (1 / 1.5 / 2) and contrast. 'none' / 'default' pass through. Cached.
 * @param {string} kind @param {number} [size] @param {boolean} [contrast]
 */
export function cursorCss(kind, size = 1, contrast = false) {
  if (kind === 'none' || kind === 'default') return kind;
  const sz = clampCursorSize(size), key = `${kind}|${sz}|${contrast ? 1 : 0}`;
  let v = _cache.get(key);
  if (v) return v;
  const a = art(kind, !!contrast), px = Math.round(32 * sz);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 32 32">${a.svg}</svg>`;
  const fallback = kind === 'enemy' || kind === 'attackMove' ? 'crosshair' : kind === 'interact' || kind === 'pickup' ? 'pointer' : kind === 'unreachable' ? 'not-allowed' : 'auto';
  v = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${Math.round(a.hx * sz)} ${Math.round(a.hy * sz)}, ${fallback}`;
  _cache.set(key, v);
  return v;
}

/** Legacy map (32 px, normal contrast) kept for abilityBar's old export. */
export const CURSORS = Object.freeze(Object.fromEntries([...CURSOR_KINDS, 'breakable', 'npc'].map((k) => [k, cursorCss(HOVER_KIND[k] ?? k)])));

/** The frame state `cursorKind` needs, read from ctx (unreachable comes from the controller's throttled probe). */
export function cursorState(ctx, { menu = false, unreachable = false } = {}) {
  const p = ctx.player;
  return {
    mode: ctx.game?.mode, menu, meme: ctx.cam?.modeName === 'meme',
    aiming: !!ctx.companions?.aim?.active,
    attackMove: !!p?.orders?.attackMoveArmed,
    hoverKind: ctx.cam?.hover?.kind ?? 'ground',
    unreachable,
  };
}

/** Back-compat: the CSS cursor for the canvas right now (normal size; no unreachable probe). */
export function cursorFor(ctx) {
  const st = ctx.state?.settings;
  return cursorCss(cursorKind(cursorState(ctx)), st?.cursorSize ?? 1, !!st?.cursorContrast);
}

/** Per-frame owner of the canvas cursor (writes only on change). */
export class CursorController {
  /** @param {any} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.kind = '';
    this.css = '';
    this.unreachable = false;
    this._probeT = 0;
  }

  /**
   * Is the ground under the cursor more than UNREACHABLE_GAP m from any nav cell she can reach (§10.2: a partial path
   * with a gap > 2 m)? Two tests: no walkable cell within the gap at all, or (physics `reachableFrom`, built on the
   * cached island graph) every walkable cell within the gap is on an island her own cannot reach (roofs, walled yards,
   * the far side of a lake). `reachableFrom` answers null while the island audit is building: the paw stays normal.
   * Throttled ~8 Hz.
   */
  _probe(dt) {
    const ctx = this.ctx, cam = ctx.cam, ph = ctx.physics;
    this._probeT -= dt;
    if (this._probeT > 0) return this.unreachable;
    this._probeT = 0.12;
    if (!cam?.cursorValid || cam.hover?.kind !== 'ground' || !ph?.nav || !ph.nearestWalkable) return (this.unreachable = false);
    const g = cam.cursorGround, from = ctx.player?.pos;
    try {
      this.unreachable = !ph.nearestWalkable(g.x, g.z, UNREACHABLE_GAP)
        || (!!from && typeof ph.reachableFrom === 'function' && ph.reachableFrom(from, g.x, g.z, UNREACHABLE_GAP) === false);
    } catch { this.unreachable = false; }
    return this.unreachable;
  }

  /**
   * @param {number} dt real seconds
   * @param {{ menu?: boolean }} [o]
   * @returns {string} the kind written
   */
  update(dt, o = {}) {
    const ctx = this.ctx, canvas = ctx.renderer?.domElement;
    if (!canvas) return this.kind;
    if (!ctx.cam?.isIso) {                    // ?cam=classic: pointer lock owns the cursor
      if (this.kind) { this.kind = ''; this.css = ''; canvas.style.cursor = ''; canvas._cur = ''; canvas.parentElement?.removeAttribute?.('data-cursor'); }
      return this.kind;
    }
    const st = ctx.state?.settings;
    const kind = cursorKind(cursorState(ctx, { menu: !!o.menu, unreachable: this._probe(dt) }));
    const css = cursorCss(kind, st?.cursorSize ?? 1, !!st?.cursorContrast);
    if (css !== this.css) { this.css = css; canvas.style.cursor = css; canvas._cur = css; }
    if (kind !== this.kind) { this.kind = kind; canvas.parentElement?.setAttribute?.('data-cursor', kind); }
    return kind;
  }
}
