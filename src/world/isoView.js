// src/world/isoView.js  (owner: world) — pure helpers for the iso camera's level data (research/CONTROLS_SPEC.md §2.2,
// §3, §8.5, §11): zone lookup with hysteresis for the camera hints, the camera side of a level yaw, the camera-side
// clutter rule (tall props south of the spine fade) and the spawn audit (no spawn just down-screen of an entry).
// No three.js, no DOM: unit-tested in tests/unit/world.test.js.

/** §11 rules (m). */
export const ISO_RULES = Object.freeze({
  clutterH: 2.2, clutterReach: 6, clutterLateral: 1.0, spawnReach: 6, spawnLateral: 3.5, hintPad: 1.5, maxYawHints: 3, maxHints: 3,
  bigYaw: Math.PI / 4,
});

/** Unit vector from the focus toward the lens for a level yaw (yaw π: the camera sits at −Z, looking +Z). */
export function cameraSide(yaw = Math.PI) { return [Math.sin(yaw), Math.cos(yaw)]; }

/** Is (x, z) inside a zone (disc `r` or box `size`, rotated by `yaw`), grown by `pad`? */
export function zoneContains(zone, x, z, pad = 0) {
  if (!zone?.at) return false;
  const dx = x - zone.at[0], dz = z - zone.at[1];
  if (zone.size) {
    const c = Math.cos(zone.yaw ?? 0), s = Math.sin(zone.yaw ?? 0);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) <= zone.size[0] / 2 + pad && Math.abs(lz) <= zone.size[1] / 2 + pad;
  }
  const r = (zone.camR ?? zone.r ?? 5) + pad;
  return dx * dx + dz * dz <= r * r;
}

const zoneArea = (z) => (z.size ? z.size[0] * z.size[1] : Math.PI * (z.camR ?? z.r ?? 5) ** 2);

/**
 * The zone at (x, z): zones with a camera hint (`cam`) win over plain ones, then the smallest. `prev` (the zone she
 * was in) keeps winning until she is `pad` m outside it (no flicker on the edge). `ok(zone)` filters (a `camIf`
 * condition). Returns the zone def or null.
 * @param {any[]} zones @param {number} x @param {number} z @param {any} [prev] @param {number} [pad]
 */
export function pickZone(zones, x, z, prev = null, pad = ISO_RULES.hintPad, ok = null) {
  let best = null, bestCam = false, bestA = Infinity;
  for (const zn of zones ?? []) {
    if (!zn?.at || (ok && !ok(zn))) continue;
    const inside = zoneContains(zn, x, z, zn === prev ? pad : 0);
    if (!inside) continue;
    const cam = !!zn.cam, a = zoneArea(zn);
    if ((cam && !bestCam) || (cam === bestCam && a < bestA)) { best = zn; bestCam = cam; bestA = a; }
  }
  return best;
}

/** Zones that author a camera hint, and how many change the yaw (≤ ISO_RULES.maxYawHints per level). */
export function hintStats(def) {
  const hints = (def?.zones ?? []).filter((z) => z.cam);
  const yaw = def?.cam?.yaw ?? Math.PI;
  const yawHints = hints.filter((z) => Number.isFinite(z.cam.yaw) && Math.abs(angleDiff(z.cam.yaw, yaw)) > 1e-3);
  return { hints: hints.length, yawHints: yawHints.length, ids: hints.map((z) => z.id), bigYaw: yawHints.filter((z) => Math.abs(angleDiff(z.cam.yaw, yaw)) > ISO_RULES.bigYaw).map((z) => z.id) };
}

/** Signed smallest difference a − b (rad). */
export function angleDiff(a, b) { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

/**
 * Does a point (x, z) with radius `r` stand on the camera side of an anchor (ax, az) within `reach` m (between the lens
 * and the anchor, laterally within r + lateral)? Pure.
 */
export function onCameraSide(x, z, r, ax, az, yaw, reach = ISO_RULES.clutterReach, lateral = ISO_RULES.clutterLateral) {
  const [sx, sz] = cameraSide(yaw);
  const dx = x - ax, dz = z - az;
  const along = dx * sx + dz * sz, perp = Math.abs(dx * sz - dz * sx);
  return along > 0 && along - r <= reach && perp <= r + lateral;
}

/** Sample points every `step` m along a polyline [[x, z], ...]. */
export function samplePolyline(pts, step = 1) {
  const out = [];
  for (let i = 0; i < (pts?.length ?? 0) - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  if (pts?.length) out.push(pts[pts.length - 1]);
  return out;
}

/**
 * The anchors a tall prop must not hide (§11 camera-side clutter audit): spine and side-path samples, arena centres
 * and the explicit `def.camAnchors`. Pure.
 */
export function clutterAnchors(def, spine = def?.spine) {
  const out = samplePolyline(spine ?? [], 1.5);
  for (const p of def?.paths ?? []) for (const q of samplePolyline(p.pts ?? [], 1.5)) out.push(q);   // side streets (the chase loop)
  for (const z of def?.zones ?? []) if (z.kind === 'arena' && z.at) out.push(z.at);
  for (const a of def?.camAnchors ?? []) out.push(a);
  return out;
}

/** Is a prop (x, z, radius, height) camera-side clutter (taller than 2.2 m within 6 m south of an anchor)? */
export function isClutter(x, z, r, height, anchors, yaw) {
  if (!(height > ISO_RULES.clutterH)) return false;
  for (const a of anchors) if (onCameraSide(x, z, r, a[0], a[1], yaw)) return true;
  return false;
}

/**
 * §8.5 spawn audit: open-zone spawn groups and arena wave points (when authored) within 6 m down-screen of a trigger,
 * an arena entry point (the disc edge facing the camera) or a checkpoint. Returns [{ zone, at, near }]. Pure.
 */
export function spawnAudit(def) {
  const yaw = def?.cam?.yaw ?? Math.PI, [sx, sz] = cameraSide(yaw);
  const entries = [];
  for (const z of def?.zones ?? []) {
    if (!z.at) continue;
    if (z.kind === 'trigger' || z.kind === 'checkpoint') entries.push({ id: z.id, at: z.at });
    if (z.kind === 'arena') {
      const r = z.size ? z.size[1] / 2 : (z.r ?? 12);
      entries.push({ id: z.id + ':entry', at: [z.at[0] + sx * r, z.at[1] + sz * r] });
    }
  }
  const bad = [];
  for (const z of def?.zones ?? []) {
    const pts = [];
    for (const s of z.spawns ?? []) if (Array.isArray(s[2])) pts.push(s[2]);
    for (const p of z.wavePoints ?? []) pts.push(p);
    for (const p of pts) for (const e of entries) {
      if (e.id === z.id + ':entry') continue;
      if (onCameraSide(p[0], p[1], 0, e.at[0], e.at[1], yaw, ISO_RULES.spawnReach, ISO_RULES.spawnLateral)) bad.push({ zone: z.id, at: p, near: e.id });
    }
  }
  return bad;
}
