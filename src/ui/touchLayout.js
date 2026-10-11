// src/ui/touchLayout.js  (owner: ui) — research/CONTROLS_SPEC.md §9 touch geometry and gesture rules, pure and
// unit-tested: the Wild Rift cluster (button centres / sizes for a viewport, touch size, orientation, mirror), the
// joystick zone, dead rings, and the free-area gesture classifier.
import { TOUCH } from '../core/config.js';

/** Clamp the touch-size setting to the spec range (0.8–1.4). */
export const clampTs = (ts) => Math.max(0.8, Math.min(1.4, Number.isFinite(ts) ? ts : 1));

/**
 * Cluster layout for a viewport (CSS px). Returns { buttons: { name: { x, y, r, size } } (centres), anchor: { x, y },
 * portrait, scale, stickZone: { x0, y0, x1, y1 }, hudBottom, cancel: { x, y, r } }.
 * @param {number} w @param {number} h
 * @param {{ touchSize?: number, leftHanded?: boolean, safe?: { top?: number, right?: number, bottom?: number, left?: number }, layout?: object|null }} [o]
 */
export function computeLayout(w, h, o = {}) {
  const T = TOUCH, ts = clampTs(o.touchSize ?? 1), safe = o.safe ?? {};
  const portrait = h > w * 1.05;
  const k = ts * (portrait ? T.portraitScale : 1);
  const right = safe.right ?? 0, bottom = safe.bottom ?? 0, left = safe.left ?? 0, top = safe.top ?? 0;
  const mirror = !!o.leftHanded;
  const ax = mirror ? left + T.anchor * Math.max(1, k) : w - right - T.anchor * Math.max(1, k);
  const ay = h - bottom - T.anchor * Math.max(1, k);
  const buttons = {};
  for (const [name, [size, dx, dy]] of Object.entries(portrait && T.buttonsPortrait ? T.buttonsPortrait : T.buttons)) {
    const sz = Math.max(T.minBtn, size * k);
    let x = ax + (mirror ? -dx : dx) * k, y = ay + dy * k;
    const custom = o.layout?.[name];
    if (Array.isArray(custom) && custom.length === 2 && custom.every(Number.isFinite)) { x = ax + custom[0]; y = ay + custom[1]; }
    buttons[name] = { x, y, r: sz / 2, size: sz };
  }
  // keep every button inside the viewport (and the Milk / Golden tops below the HUD strip)
  const hudBottom = h * 0.18 + top;
  for (const b of Object.values(buttons)) {
    b.x = Math.max(left + b.r + 4, Math.min(w - right - b.r - 4, b.x));
    b.y = Math.max(hudBottom + b.r, Math.min(h - bottom - b.r - 4, b.y));
  }
  // short screens at big touch sizes: the HUD clamp can squeeze the top row together; slide the smaller of an
  // overlapping pair sideways (away from the ⚔ side) until the 8 px gap holds
  const names = Object.keys(buttons);
  for (let it = 0; it < 8; it++) {
    let moved = false;
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const a = buttons[names[i]], b = buttons[names[j]];
      const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
      if (gap >= T.gap) continue;
      const m = a.r <= b.r ? a : b, o = m === a ? b : a;
      const dir = mirror ? 1 : -1;
      const dy = m.y - o.y, need = o.r + m.r + T.gap;
      const dxNeed = Math.sqrt(Math.max(0, need * need - dy * dy));
      m.x = o.x + dir * dxNeed;
      m.x = Math.max(left + m.r + 4, Math.min(w - right - m.r - 4, m.x));
      // pinned at the screen edge: slide it up instead
      if (Math.hypot(m.x - o.x, m.y - o.y) - m.r - o.r < T.gap) {
        const dx = m.x - o.x;
        m.y = Math.max(hudBottom + m.r, o.y - Math.sqrt(Math.max(0, need * need - dx * dx)));
      }
      moved = true;
    }
    if (!moved) break;
  }
  const [zw, zh] = portrait ? T.stickZonePortrait : T.stickZone;
  const stickZone = mirror ? { x0: w * (1 - zw), x1: w, y0: h * (1 - zh), y1: h } : { x0: 0, x1: w * zw, y0: h * (1 - zh), y1: h };
  const cr = (T.cancelChip * Math.max(1, k)) / 2;
  const cancel = { x: mirror ? left + cr + 16 : w - right - cr - 16, y: hudBottom + cr + 8, r: cr };
  return { buttons, anchor: { x: ax, y: ay }, portrait, scale: k, stickZone, hudBottom, cancel };
}

/** Smallest gap (px) between any two button hit circles of a layout (unit test: ≥ TOUCH.gap). */
export function minGap(layout, names = Object.keys(layout.buttons)) {
  let g = Infinity;
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = layout.buttons[names[i]], b = layout.buttons[names[j]];
    g = Math.min(g, Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r);
  }
  return g;
}

/** The button whose circle contains (x, y), or null. */
export function buttonAt(layout, x, y, visible = null) {
  for (const [name, b] of Object.entries(layout.buttons)) {
    if (visible && !visible(name)) continue;
    if (Math.hypot(x - b.x, y - b.y) <= b.r) return name;
  }
  return null;
}

/** Is (x, y) inside a button's dead ring (taps there do nothing, §9.1)? */
export function inDeadRing(layout, x, y, visible = null) {
  for (const [name, b] of Object.entries(layout.buttons)) {
    if (visible && !visible(name)) continue;
    const d = Math.hypot(x - b.x, y - b.y);
    if (d > b.r && d <= b.r + TOUCH.deadRing) return true;
  }
  return false;
}

/** Is (x, y) inside the joystick zone? */
export function inStickZone(layout, x, y) {
  const z = layout.stickZone;
  return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
}

/**
 * §9.3 free-area gesture classifier for a single finished (or ongoing) pointer:
 *   'swipe' (≥ swipePx within swipeMs), 'tap' (≤ tapMs, ≤ tapPx, ≥ afterButton s after a cluster release),
 *   'long' (≥ longMs held, ≤ tapPx; reported while still down), or 'none'.
 * @param {{ dt: number, dist: number, up: boolean, sinceButton: number }} g  dt (s) since down, travel (px)
 */
export function classifyGesture(g) {
  const T = TOUCH;
  if (g.dist >= T.swipePx && g.dt <= T.swipeMs / 1000 + 1e-6) return 'swipe';
  if (g.dist <= T.tapPx) {
    if (!g.up && g.dt >= T.longMs / 1000) return 'long';
    if (g.up && g.dt <= T.tapMs / 1000 && g.sinceButton >= T.afterButton) return 'tap';
  }
  return 'none';
}

/** Floating joystick vector for a drag offset (px): { x, y (y+ = up/forward), kx, ky (knob px), follow } (§5.1). */
export function stickVector(dx, dy, R = TOUCH.stickR) {
  const L = Math.hypot(dx, dy);
  const k = L > R ? R / L : 1;
  const kx = dx * k, ky = dy * k;
  let x = kx / R, y = -ky / R;
  if (Math.hypot(x, y) < TOUCH.stickDead) { x = 0; y = 0; }
  return { x, y, kx, ky, follow: L > R * TOUCH.stickFollow ? L - R * TOUCH.stickFollow : 0 };
}
