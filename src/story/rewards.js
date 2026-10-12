// src/story/rewards.js  (owner: story) — one reward system (WA §5.4, WA7/WA8): story announces unlocks, friends, shards
// and practice stickers as `reward { kind: 'sticker' | 'card' | 'friend', id }` (ui/celebrate.js shows them; strings
// `sticker.<id>`, `card.<id>.title` / `.line`). The old toast is still sent while ui has no celebration layer
// (`ctx.ui.handles.reward` falsy), so nothing goes unannounced in between.
import { E } from '../core/events.js';

/** Toast key → the celebration story emits for it (CL §8.1 table + ON §7.2 friend cards). */
export const REWARD_TOASTS = Object.freeze({
  'toast.holy': Object.freeze({ kind: 'card', id: 'holy' }),
  'toast.mochi': Object.freeze({ kind: 'friend', id: 'mochi' }),
  'toast.sage': Object.freeze({ kind: 'friend', id: 'sage' }),
  'toast.clover': Object.freeze({ kind: 'friend', id: 'clover' }),
});

/** Toasts whose card ui raises from another event (Golden Hour: `state:unlock`, shards: `story:shard`, Heart Bells). */
export const CARD_ELSEWHERE = Object.freeze(['toast.golden', 'toast.shard', 'toast.heartbell']);

/** Kinds saved as `sticker.<id>` flags (the pause-menu sticker book). */
export const BOOK_KINDS = Object.freeze(['sticker', 'friend']);

/** Does the ui draw celebrations itself? */
export const celebrates = (ctx) => !!ctx?.ui?.handles?.reward;

/**
 * Emit one reward (and remember stickers / friends in the sticker book). Returns the payload.
 * @param {any} ctx @param {'sticker'|'card'|'friend'} kind @param {string} id
 */
export function reward(ctx, kind, id) {
  if (!ctx?.bus || !id) return null;
  if (BOOK_KINDS.includes(kind)) ctx.state?.setFlag?.('sticker.' + id, true);
  const p = { kind, id };
  ctx.bus.emit(E.REWARD, p);
  return p;
}

/**
 * Announce `key`: its celebration when it has one (plus the toast until ui celebrates), else the plain toast.
 * @param {any} ctx @param {string} key strings key @param {object|null} [vars] @param {string|null} [icon]
 */
export function announce(ctx, key, vars = null, icon = null) {
  if (!ctx?.bus || !key) return;
  const r = REWARD_TOASTS[key];
  if (r) reward(ctx, r.kind, r.id);
  if ((r || CARD_ELSEWHERE.includes(key)) && celebrates(ctx)) return;
  ctx.bus.emit(E.TOAST, { text: ctx.strings?.t?.(key, vars) ?? key, key, ...(vars ? { vars } : {}), ...(icon ? { icon } : {}) });
}
