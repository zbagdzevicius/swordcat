// src/core/recovery.js  (owner: core) — recovery panels (docs/TOKENTAILS-PLAN.md F5 / F6):
//   'context'  WebGL context lost (Game): "Tap to continue" reloads the page (progress was saved just before)
//   'level'    a level module / its assets failed to load (LevelManager): Retry re-queues the load
//   'boot'     the game could not start (main.js): Reload
// Plain DOM in Token Tails night / gold, one accessible button that takes focus. Text comes from story/strings.js keys
// `recovery.<kind>.title|body|action` when they exist (ctx.strings), else the English fallbacks below.
// Also: installPreloadErrorReload() — Vite's `vite:preloadError` (a lazy chunk 404s after a redeploy) reloads the
// page once per minute (sessionStorage guard); a second failure falls through to the level Retry panel.
// Importing this module touches no DOM (node-safe for the unit tests).

export const RECOVERY_TEXT = Object.freeze({
  context: { title: 'Pink Paw Knight took a little nap', body: 'Your device paused the graphics. Your progress is saved.', action: 'Tap to continue' },
  level: { title: 'This area did not load', body: 'Check your connection and try again.', action: 'Retry' },
  boot: { title: 'Pink Paw Knight could not start', body: 'Check your connection, then reload. If it keeps happening, try another browser.', action: 'Reload' },
});

/** Token Tails night / gold (docs/TOKENTAILS-PLAN.md §2.6). */
export const RECOVERY_COLORS = Object.freeze({ night: '#0B0820', dusk: '#2A1F45', gold: '#FFCC55', ink: '#4A1D08', text: '#FFF4D6', pink: '#FF7AA2' });

/**
 * Title / body / action text for `kind`: string keys when `strings.has(key)`, else the fallbacks. Pure.
 * @param {'context'|'level'|'boot'} kind @param {{t?: Function, has?: Function}|null} [strings]
 */
export function recoveryText(kind, strings) {
  const fb = RECOVERY_TEXT[kind] ?? RECOVERY_TEXT.boot;
  const pick = (part) => {
    const key = `recovery.${kind}.${part}`;
    try { if (strings?.has?.(key)) { const s = strings.t(key); if (typeof s === 'string' && s && s !== key) return s; } } catch { /* fallback */ }
    return fb[part];
  };
  return { title: pick('title'), body: pick('body'), action: pick('action') };
}

/** The element id per kind (`boot` keeps the historic #boot-error id that index.html styles). */
export const recoveryId = (kind) => (kind === 'boot' ? 'boot-error' : `recovery-${kind}`);

/**
 * Show (or replace) the `kind` panel. `onAction` runs on the button (and, for 'context', on a tap anywhere).
 * @param {'context'|'level'|'boot'} kind
 * @param {{strings?: any, onAction?: () => void, doc?: Document, dim?: boolean}} [opts]
 * @returns {{el: HTMLElement, close: () => void} | null}
 */
export function showRecovery(kind, { strings = null, onAction = null, doc = typeof document !== 'undefined' ? document : null, dim = kind !== 'level' } = {}) {
  if (!doc?.body) return null;
  hideRecovery(kind, doc);
  const C = RECOVERY_COLORS, txt = recoveryText(kind, strings), id = recoveryId(kind);
  const wrap = doc.createElement('div');
  wrap.id = id;
  wrap.className = 'tt-recovery';
  wrap.setAttribute('role', 'alertdialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-labelledby', `${id}-title`);
  wrap.setAttribute('aria-describedby', `${id}-body`);
  // fixed full-screen layer above the ui (z 10) and the splash (z 40); `level` keeps the old level visible behind it
  wrap.style.cssText = `position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:16px;box-sizing:border-box;`
    + `background:${dim ? `linear-gradient(180deg, ${C.night}EE 0%, ${C.dusk}EE 100%)` : 'rgba(11,8,32,.45)'};`
    + 'pointer-events:auto;touch-action:manipulation;-webkit-user-select:none;user-select:none;';
  const card = doc.createElement('div');
  card.style.cssText = `box-sizing:border-box;width:min(380px,100%);padding:20px 22px;border-radius:16px;text-align:center;`
    + `background:${C.dusk};color:${C.text};border:2px solid ${C.gold};box-shadow:0 12px 34px rgba(11,8,32,.6);`
    + `font:600 15px/1.45 Nunito,Fredoka,system-ui,sans-serif;`;
  const h = doc.createElement('h2');
  h.id = `${id}-title`;
  h.textContent = txt.title;
  h.style.cssText = `margin:0 0 6px;font:800 19px/1.25 Nunito,Fredoka,system-ui,sans-serif;color:${C.gold};`;
  const p = doc.createElement('p');
  p.id = `${id}-body`;
  p.textContent = txt.body;
  p.style.cssText = 'margin:0 0 14px;';
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.textContent = txt.action;
  btn.style.cssText = `min-height:44px;padding:10px 24px;border:0;border-radius:999px;cursor:pointer;background:${C.gold};color:${C.ink};`
    + `font:800 16px Nunito,Fredoka,system-ui,sans-serif;outline-offset:3px;`;
  btn.addEventListener('focus', () => { btn.style.outline = `3px solid ${C.pink}`; });
  btn.addEventListener('blur', () => { btn.style.outline = 'none'; });
  let done = false;
  const act = (ev) => {
    ev?.preventDefault?.(); ev?.stopPropagation?.();
    if (done) return;
    done = true;
    if (kind !== 'context') close();       // context: the page reloads; keep the panel up meanwhile
    try { onAction?.(); } catch (e) { console.warn('[recovery] action failed', e); done = false; }
  };
  btn.addEventListener('click', act);
  if (kind === 'context') wrap.addEventListener('pointerup', act);
  card.append(h, p, btn);
  wrap.append(card);
  doc.body.appendChild(wrap);
  try { btn.focus({ preventScroll: true }); } catch { /* old browsers */ }
  function close() { wrap.remove(); }
  return { el: wrap, close };
}

/** Remove the `kind` panel if it is up. */
export function hideRecovery(kind, doc = typeof document !== 'undefined' ? document : null) {
  doc?.getElementById?.(recoveryId(kind))?.remove();
}

/** sessionStorage key of the last automatic preload-error reload (ms timestamp). */
export const PRELOAD_RELOAD_KEY = 'pawsbury.preloadReloadAt';
/** One automatic reload per this many ms; a second failure inside the window is left to the Retry panel. */
export const PRELOAD_RELOAD_WINDOW = 60000;

/**
 * Should a `vite:preloadError` reload the page now? Pure. Records the attempt in `storage` when it says yes.
 * Storage that throws (private mode, blocked site data) means "no automatic reload" (no loop risk).
 * @param {{getItem(k:string):string|null, setItem(k:string,v:string):void}|null} storage @param {number} now
 */
export function shouldReloadOnPreloadError(storage, now = Date.now()) {
  try {
    if (!storage) return false;
    const last = Number(storage.getItem(PRELOAD_RELOAD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < PRELOAD_RELOAD_WINDOW) return false;
    storage.setItem(PRELOAD_RELOAD_KEY, String(now));
    return true;
  } catch { return false; }
}

/** window 'vite:preloadError' → reload once (guarded); otherwise the import rejects and the caller's Retry shows. */
export function installPreloadErrorReload(win = typeof window !== 'undefined' ? window : null) {
  if (!win?.addEventListener) return () => {};
  const on = (ev) => {
    let storage = null;
    try { storage = win.sessionStorage; } catch { storage = null; }
    if (!shouldReloadOnPreloadError(storage)) return;
    console.warn('[boot] a lazy chunk failed to load; reloading once', ev?.payload ?? '');
    ev?.preventDefault?.();
    try { win.location.reload(); } catch { /* */ }
  };
  win.addEventListener('vite:preloadError', on);
  return () => win.removeEventListener('vite:preloadError', on);
}
