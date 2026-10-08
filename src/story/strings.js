// src/story/strings.js  (owner: story) — M0 STUB: the strings table (empty in M0) and the resolver
// exposed as ctx.strings.t(key, vars). Format (§19.6): S[key] = { default: '...', homage?: '...' }.
// `homage` variants are used only when HOMAGE_LINES is true (§4.4). Missing keys return the key itself.
import { HOMAGE_LINES } from '../core/config.js';

/** @type {Record<string, {default: string, homage?: string}>} */
export const S = {};

/** Resolve `key` with `{name}` placeholders filled from `vars`. */
export function t(key, vars = null) {
  const row = S[key];
  let s = row ? (HOMAGE_LINES && row.homage ? row.homage : row.default) : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  return s;
}

export function has(key) { return Object.prototype.hasOwnProperty.call(S, key); }
