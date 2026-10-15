// src/shelter/treatApi.js  (owner: T, TT5 §13.1 item 3) — the standalone game sends the free treat itself.
//
// Only when the game runs on https://tokentails.com (the API's CORS allows that origin). It reads
// GET /shelter/donate/status and GET /shelter/donate/guest/me, then sends POST /shelter/donate/guest {source:'page'}.
// Always the guest route (keyed per visitor address, one per UTC day): the game never reads a Firebase token.
// JSON headers, credentials omitted, never a text/plain request. The response mapping copies `sendTreat` in the Token
// Tails client (client/components/codex/impact/treat.ts) and `swordcatRailOf` / `treatReceiptOf` in the /swordcat host.
// Never throws: every failure becomes a result kind. Pure helpers are unit-tested (tests/unit/treat.test.js) with a
// fake fetch; no test ever reaches the real API.
import { API_HOSTS } from './roster.js';

export const API_BASE = 'https://api.tokentails.com';
export const SITE = 'https://tokentails.com';
/** A send with no answer after this long is aborted (the controller shows "Try again"). */
export const SEND_TIMEOUT_MS = 15000;
const READ_TIMEOUT_MS = 10000;
const TX = /^0x[0-9a-fA-F]{64}$/;
const AMOUNT = /^[$€]?[0-9]{1,6}(\.[0-9]{1,6})?( [A-Za-z.]{2,8})?$/;

/** May this page call the treat API itself? Unframed or not, https and a host the API's CORS allows. Pure. */
export function directAllowed(loc = typeof location !== 'undefined' ? location : null) {
  if (!loc) return false;
  return loc.protocol === 'https:' && API_HOSTS.includes(String(loc.hostname ?? '').toLowerCase());
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);

/** 18-decimal wei → "0.01" (2 decimals, half up, no thousands separator). Null for zero or junk. Pure. */
export function formatWei(wei) {
  if (typeof wei !== 'string' || !/^\d{1,40}$/.test(wei) || /^0+$/.test(wei)) return null;
  const padded = wei.padStart(19, '0');
  const scaled = BigInt(padded.slice(0, -18) + padded.slice(-18, -16)) + (Number(padded[padded.length - 16]) >= 5 ? 1n : 0n);
  const s = scaled.toString().padStart(3, '0');
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

/** "0.01 USDC", or null when it would not pass the embed bridge's amount check. Pure. */
export function amountLabel(wei, coin = 'USDC') {
  const n = formatWei(wei);
  if (!n) return null;
  const label = typeof coin === 'string' && coin ? `${n} ${coin}` : n;
  return label.length <= 24 && AMOUNT.test(label) ? label : null;
}

/** An https link with no credentials, else null. Pure. */
export function httpsUrl(v) {
  if (typeof v !== 'string' || !v || v.length > 300) return null;
  try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}

/** The receipt page for a sent treat, only for a real tx hash and chain id. Pure. */
export function receiptUrl(chainId, txHash) {
  const c = Number(chainId);
  if (typeof txHash !== 'string' || !TX.test(txHash) || !Number.isSafeInteger(c) || c <= 0) return null;
  return `${SITE}/shelter-payouts/receipt?chain=${c}&tx=${txHash}`;
}

/**
 * `GET /shelter/donate/status` body → the game's rail `{ rail, chainId?, amountLabel? }`. Pure.
 * Unreadable: `soon`. Main chain live with treats left: `live`. Else another open chain: `live` on it. Exhausted, or
 * live with none left: `exhausted`. Paused or not deployed: `soon`.
 */
export function railOf(raw) {
  if (!isObj(raw)) return { rail: 'soon' };
  const enabled = raw.enabled === true;
  const state = ['not-deployed', 'paused', 'live', 'exhausted'].includes(raw.railState) ? raw.railState : enabled ? 'live' : 'not-deployed';
  const chains = Array.isArray(raw.chains) ? raw.chains.filter(isObj) : [];
  const withAmount = (chain, chainId) => {
    const a = amountLabel(chain?.amountWei ?? raw.amountWei, typeof chain?.coin === 'string' && chain.coin ? chain.coin : 'USDC');
    return { rail: 'live', ...(chainId !== undefined ? { chainId } : {}), ...(a ? { amountLabel: a } : {}) };
  };
  if (enabled && state === 'live' && count(raw.treatsLeftToday) > 0) return withAmount(chains.find((c) => c.main === true), undefined);
  const open = chains.find((c) => c.main !== true && c.enabled === true && c.railState === 'live' && count(c.treatsLeftToday) > 0);
  if (open && Number.isSafeInteger(Number(open.chainId)) && Number(open.chainId) > 0) return withAmount(open, Number(open.chainId));
  if (enabled && (state === 'exhausted' || state === 'live')) return { rail: 'exhausted' };
  return { rail: 'soon' };
}

/** `GET /shelter/donate/guest/me` body → has today's treat already left (or arrived)? Pure. */
export function sentTodayOf(raw) {
  const s = isObj(raw) && isObj(raw.today) ? raw.today.status : null;
  return s === 'PENDING' || s === 'SENT' || s === 'CONFIRMED';
}

/** The `code` of an error body (top level or nested in `message`). Pure. */
export function errorCode(body) {
  if (!isObj(body)) return null;
  if (typeof body.code === 'string') return body.code;
  if (isObj(body.message) && typeof body.message.code === 'string') return body.message.code;
  return null;
}

/**
 * One POST answer → a `treat-result` kind (the same kinds the /swordcat host answers with). Pure.
 * 429 + DONATE_ALREADY_TODAY: already today; a bare 429 (the per-IP limiter): retry. 409 DONATE_PAUSED or a 503 (no
 * visitor address, or an older backend): paused; 409 DONATE_BUDGET_SPENT: budget spent; 424: failed (retry allowed).
 */
export function kindOf(status, body) {
  if (status >= 200 && status < 300) return 'sent';
  switch (errorCode(body)) {
    case 'DONATE_ALREADY_TODAY': return 'already-today';
    case 'DONATE_PAUSED': return 'paused';
    case 'DONATE_BUDGET_SPENT': return 'budget-spent';
    case 'DONATE_SEND_FAILED': return 'failed';
    case 'DONATE_NOT_ELIGIBLE': case 'EMAIL_UNVERIFIED': return 'not-eligible';
    case 'GUEST_FORBIDDEN': return 'signed-out';
    default: break;
  }
  if (status === 401 || status === 403) return 'signed-out';
  if (status === 503 || status === 409) return 'paused';
  if (status === 424) return 'failed';
  return 'retry';
}

/** A 200 body → `{ explorerUrl?, receiptPath?, amountLabel? }` (receiptPath is an absolute tokentails.com link). Pure. */
export function receiptOf(body) {
  if (!isObj(body)) return {};
  const out = {};
  const x = httpsUrl(body.explorerUrl); if (x) out.explorerUrl = x;
  const r = receiptUrl(body.chainId, body.txHash); if (r) out.receiptPath = r;
  const a = amountLabel(body.amountWei, typeof body.coin === 'string' && body.coin ? body.coin : 'USDC'); if (a) out.amountLabel = a;
  return out;
}

function withTimeout(ms, outer) {
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ac?.abort(), ms);
  const onAbort = () => ac?.abort();
  outer?.addEventListener?.('abort', onAbort);
  return { signal: ac?.signal, done: () => { clearTimeout(t); outer?.removeEventListener?.('abort', onAbort); } };
}

async function getJson(path, { fetchImpl, base, signal }) {
  const f = fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  if (!f) return null;
  const tm = withTimeout(READ_TIMEOUT_MS, signal);
  try {
    const res = await f(`${base}${path}`, { method: 'GET', headers: { accept: 'application/json' }, credentials: 'omit', mode: 'cors', signal: tm.signal });
    if (!res?.ok) return null;
    return await res.json();
  } catch { return null; } finally { tm.done(); }
}

/** The rail, never throws (a failed read is `soon`, like the host). */
export async function readRail({ fetchImpl, base = API_BASE, signal } = {}) {
  return railOf(await getJson('/shelter/donate/status', { fetchImpl, base, signal }));
}

/** `{ sentToday }` for this visitor, never throws (a failed read is "not sent"). */
export async function readMe({ fetchImpl, base = API_BASE, signal } = {}) {
  return { sentToday: sentTodayOf(await getJson('/shelter/donate/guest/me', { fetchImpl, base, signal })) };
}

/**
 * `POST /shelter/donate/guest` once. Resolves `{ kind, explorerUrl?, receiptPath?, amountLabel? }`; never throws.
 * A thrown fetch (offline, CORS, abort after `timeoutMs`) is `retry`.
 */
export async function sendGuestTreat({ fetchImpl, base = API_BASE, chainId, timeoutMs = SEND_TIMEOUT_MS, signal } = {}) {
  const f = fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  if (!f) return { kind: 'retry' };
  const body = JSON.stringify(Number.isSafeInteger(chainId) && chainId > 0 ? { source: 'page', chainId } : { source: 'page' });
  const tm = withTimeout(timeoutMs, signal);
  let res;
  try {
    res = await f(`${base}/shelter/donate/guest`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body, credentials: 'omit', mode: 'cors', signal: tm.signal,
    });
  } catch { tm.done(); return { kind: 'retry' }; }
  let json = null;
  try { json = await res.json(); } catch { json = null; } finally { tm.done(); }
  const kind = kindOf(res.status, json);
  return kind === 'sent' ? { kind, ...receiptOf(json) } : { kind };
}

/** The transport the treat controller uses in `direct` mode. */
export function createDirectTransport({ fetchImpl, base = API_BASE } = {}) {
  return {
    readRail: (o = {}) => readRail({ fetchImpl, base, ...o }),
    readMe: (o = {}) => readMe({ fetchImpl, base, ...o }),
    send: (o = {}) => sendGuestTreat({ fetchImpl, base, ...o }),
  };
}
