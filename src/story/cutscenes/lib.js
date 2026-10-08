// src/story/cutscenes/lib.js  (owner: story) — tiny pure helpers for writing cutscene data (§5.1 step objects).
// Cutscene files stay declarative; these only build the same plain step objects with less noise.

/** A dialogue line. `auto` = seconds before it advances by itself (a press advances earlier; 0 = wait for input). */
export const say = (who, key, auto = 0, extra = {}) => ({ t: 'say', who, key, auto, ...extra });

/** A camera shot (§5.2 preset relative to `anchor`, plus any §5.1 cam fields). Static framings cut; preset kinds
 *  (rail / orbit / whipfall) keep their own mode unless `extra.mode` says otherwise. */
export const cam = (preset, anchor = 'swordcat', extra = {}) => (preset ? { t: 'cam', preset, anchor, ...extra } : { t: 'cam', anchor, mode: 'cut', ...extra });

/** A wait of `dur` seconds. */
export const wait = (dur) => ({ t: 'wait', dur });

/** Play `id` 2D or at `at` (actor id / anchor / point). */
export const sfx = (id, at = null, extra = {}) => (at == null ? { t: 'sfx', id, ...extra } : { t: 'sfx', id, at, ...extra });

/** Run steps together (the group lasts as long as its longest member). */
export const par = (...steps) => ({ t: 'par', steps });

/** Run steps in order inside a `par`. */
export const seq = (...steps) => ({ t: 'seq', steps });

/** World XZ point `d` metres along unit `u` from `o`, plus `l` metres along `lat` (both [x, z]). Pure. */
export function along(o, u, d, lat = null, l = 0) {
  return [o[0] + u[0] * d + (lat ? lat[0] * l : 0), o[1] + u[1] * d + (lat ? lat[1] * l : 0)];
}

/** Unit vector from a to b ([x, z]). Pure. */
export function unit(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}

/** Yaw (facing) of direction [x, z] (models face +Z; yaw = atan2(x, z)). Pure. */
export const yawOf = (d) => Math.atan2(d[0], d[1]);

/** Round to centimetres (keeps generated data readable in logs). */
export const r2 = (v) => Math.round(v * 100) / 100;
