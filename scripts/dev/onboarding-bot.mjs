// scripts/dev/onboarding-bot.mjs  (owner: G6, dev only, never shipped) — the TT2 trail-only onboarding bot
// (docs/TOKENTAILS-PLAN.md §10.10 #1–#2). It plays the intro from a fresh save the way a new player would: it only
// looks at what `__GAME__.guide()` says is on screen (§10.7) and never reads a world position.
//
//   npm run build:test && npm run bot:onboarding
//   node scripts/dev/onboarding-bot.mjs [--only mouse|touch] [--skip | --noskip] [--seeds 1,2,3] [--parallel 2]
//                                       [--url http://localhost:5191/] [--max 360] [--headed] [--swiftshader]
//
// Inputs, and nothing else:
//   - move: right-click (mouse) / tap (touch) the farthest lit print; else the edge arrow pulled 80 px inward; else
//     the badge. A lit ring round a lesson's object (`guide().ring`, fix round 2) means she is there: no move, and a
//     fight prompt swings at the ring's centre.
//   - the key / button named in the visible prompt or the objective line ([Key] tokens, <kbd> keycaps, ⚔). On touch
//     the named on-screen button (.tbtn.tb-<action>) is tapped.
//   - LMB / ⚔ toward the badge (else the screen centre) only while a fight prompt is shown.
//   - the skip chip is held (1.2 s) only in skip runs.
// Every reaction waits 1.5 game seconds after what it reacts to first appeared.
// Read-only progress probes (not inputs): the story flags (dead-end clock and milestones), `state().time`, the
// enemy count and player deaths. Milestones: `onboard.firstFight`, `onboard.done`, timed in game seconds from Play.
// Dead end = 15 game seconds outside a scene with no flag progress, no prompt / objective / target change and no
// change in the enemy count → the run fails with the step id and a screenshot.
//
// Output: tests/shots/bot/onboarding-bot.json + .md (medians, deaths, failures) and a screenshot per failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARGS = process.argv.slice(2);
const opt = (n, d) => { const i = ARGS.indexOf(n); return i >= 0 && ARGS[i + 1] && !ARGS[i + 1].startsWith('--') ? ARGS[i + 1] : d; };
const has = (n) => ARGS.includes(n);

export const REACT_S = 1.5;          // injected reaction delay (game s)
export const DEAD_END_S = 15;        // §10.10 #1
export const HOLD_ATTACK_MS = 850;   // a held Attack: past the Bright Slash tier (0.60 s), short of Holy (1.10 s)
export const EDGE_PULL_PX = 80;      // edge arrow pulled inward
const PORT = +opt('--port', 4191);
const MAX_S = +opt('--max', 360);    // game-second cap per run (onboard.done target is 240)
const OUT = path.join(ROOT, 'tests', 'shots', 'bot');
const SEEDS = String(opt('--seeds', '1,2,3')).split(',').map((s) => +s).filter(Number.isFinite);
const DEVICES = opt('--only') ? [opt('--only')] : ['mouse', 'touch'];
const SKIPS = has('--skip') ? [true] : has('--noskip') ? [false] : [false, true];
const PARALLEL = Math.max(1, +opt('--parallel', 2));
const GPU_ARGS = has('--swiftshader') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist'];
const VIEW = { mouse: { width: 1280, height: 720 }, touch: { width: 844, height: 390 }, portrait: { width: 390, height: 844 } };
// §10.10 #3: portrait 390×844 is checked for the first three onboarding steps only (one no-skip seed, then the run stops)
const PORTRAIT_STEPS = 3;
export const STEP_SHOW_S = 1.0;      // ≥3 lit prints or the edge arrow within this long of a step start
export const PRINT_MIN_PX = 18;      // each print ≥ 18 px wide at 844×390
export const SCENE_GRACE_S = 0.5;    // trail fade-out and skip-chip show-up allowance at a scene start
// §10.10 #2 limits (game s)
export const LIMITS = { firstFight: { mouse: 90, touch: 110, skip: 40 }, done: 240 };

// ------------------------------------------------------------------ pure helpers (unit-testable)
/** Touch / keyboard label → action (the inverse of ui/text.js ACTION_GLYPH, kbm + touch, lower-cased). */
const LABEL_ACTION = {
  lmb: 'attack', j: 'attack', '⚔': 'attack', attack: 'attack', '🛡': 'guard',
  space: 'guard', stand: 'guard', l: 'guard',
  shift: 'dodge', tumble: 'dodge', k: 'dodge',
  f: 'jump', jump: 'jump',
  e: 'interact', '!': 'interact', interact: 'interact',
  q: 'ability', kitten: 'ability',
  r: 'milk', snack: 'milk',
  c: 'meow', meow: 'meow',
  v: 'golden', golden: 'golden',
  enter: 'confirm', tap: 'confirm',
  rmb: 'move', wasd: 'move', 'stick / tap': 'move', 'left thumb': 'move', move: 'move', ls: 'move', 'l-stick': 'move',
};
/** KBM key per action (KeyboardEvent.code). */
const ACTION_CODE = { guard: 'Space', dodge: 'ShiftLeft', jump: 'KeyF', interact: 'KeyE', ability: 'KeyQ', milk: 'KeyR', meow: 'KeyC', golden: 'KeyV', confirm: 'Enter' };

/** Plain-text keycap labels as `guide().prompt` shows them (innerText: "Hold Space to block", "LMB Bonk"). */
const PLAIN_LABELS = [
  [/(^|[^\w])(LMB)(?=$|[^\w])/, 'attack'], [/⚔/, 'attack'], [/(^|[^\w])(RMB|WASD)(?=$|[^\w])/, 'move'],
  [/(^|[^\w])Space(?=$|[^\w])/, 'guard'], [/(^|[^\w])Shift(?=$|[^\w])/, 'dodge'], [/(^|[^\w])Enter(?=$|[^\w])/, 'confirm'],
  // single-letter keycaps only as an isolated capital (not "a" / "I" in a sentence)
  [/(^|[\s|(])F(?=$|[\s|)])/, 'jump'], [/(^|[\s|(])E(?=$|[\s|)])/, 'interact'], [/(^|[\s|(])Q(?=$|[\s|)])/, 'ability'],
  [/(^|[\s|(])R(?=$|[\s|)])/, 'milk'], [/(^|[\s|(])C(?=$|[\s|)])/, 'meow'], [/(^|[\s|(])V(?=$|[\s|)])/, 'golden'],
  [/(^|[\s|(])J(?=$|[\s|)])/, 'attack'],
  // touch button names (§15.3)
  [/\bStand\b|🛡/, 'guard'], [/\bTumble\b/, 'dodge'], [/\bJump\b/, 'jump'], [/\bMeow\b/, 'meow'], [/\bKitten\b(?! mode)/, 'ability'],
  [/\bSnack\b/, 'milk'], [/\bGolden\b/, 'golden'], [/(^|\s)!(?=$|\s)/, 'interact'],
];

/**
 * Actions named in a prompt / objective string: raw `[Key]` tokens, rendered <kbd> keycaps, or the plain innerText the
 * guide hook returns (keycap labels as words). `device` limits plain touch names to touch runs. Pure.
 */
export function namedActions(text, device = 'mouse') {
  const s = String(text ?? '');
  const out = new Set();
  const add = (lbl) => { const a = LABEL_ACTION[String(lbl).trim().toLowerCase()] ?? LABEL_ACTION[String(lbl).trim().split(/\s+/)[0].toLowerCase()]; if (a) out.add(a); };
  for (const m of s.matchAll(/\[([^\]]+)\]/g)) add(m[1]);
  for (const m of s.matchAll(/<kbd[^>]*>([^<]+)<\/kbd>/gi)) add(m[1]);
  const plain = s.replace(/<[^>]+>/g, ' ');
  PLAIN_LABELS.forEach(([re, a], i) => { if (i >= 13 && device !== 'touch') return; if (re.test(plain)) out.add(a); });
  return out;
}

/** Is a fight prompt shown? (the attack glyph is named, or fight words). Pure. */
export function isFightPrompt(prompt, objective) {
  const t = `${prompt ?? ''} ${objective ?? ''}`;
  return namedActions(t).has('attack') || /\b(rats?|foes?|bonk|defeat|beat|chase off|scare off)\b/i.test(t.replace(/<[^>]+>/g, ''));
}

/** Does the text ask to hold (not tap) the key? Pure. */
export const wantsHold = (t) => /\bhold\b/i.test(String(t ?? '').replace(/<[^>]+>/g, ''));

/**
 * Where to send Clem from what the guide shows (§10.10 #1): the farthest lit print, else the edge arrow pulled
 * `EDGE_PULL_PX` toward the screen centre, else the badge. Prints are ordered from Clem outward. Pure.
 * @returns {{x:number,y:number,src:'print'|'edge'|'badge'}|null}
 */
export function moveTarget(g, w, h) { return moveCandidates(g, w, h)[0] ?? null; }

/**
 * Every point a player could tap to follow the guide, best first: the lit prints from the farthest in, else the edge
 * arrow pulled inward (EDGE_PULL_PX, then further), else the badge. The run takes the first one no button covers
 * (a player taps open ground, not the print under the Jump button: fix round 1b). Pure.
 */
export function moveCandidates(g, w, h) {
  if (!g) return [];
  // fix round 2: a lit ring round the lesson's object says "you are here, act on it" (no way to walk): no move
  if (g.ring) return [];
  const lit = (g.prints ?? []).filter((p) => p && p.lit && Number.isFinite(p.sx) && Number.isFinite(p.sy) && p.sx >= 0 && p.sy >= 0 && p.sx <= w && p.sy <= h);
  if (lit.length) return lit.slice().reverse().map((p) => ({ x: p.sx, y: p.sy, src: 'print' }));
  if (g.edge && Number.isFinite(g.edge.sx)) {
    const cx = w / 2, cy = h / 2, dx = cx - g.edge.sx, dy = cy - g.edge.sy, d = Math.hypot(dx, dy) || 1;
    return [EDGE_PULL_PX, EDGE_PULL_PX * 1.75, EDGE_PULL_PX * 2.5, EDGE_PULL_PX * 3.25].map((px) => {
      const k = Math.min(1, px / d);
      return { x: g.edge.sx + dx * k, y: g.edge.sy + dy * k, src: 'edge' };
    });
  }
  if (g.badge && Number.isFinite(g.badge.sx)) return [{ x: g.badge.sx, y: g.badge.sy, src: 'badge' }];
  return [];
}

/** §10.10 #3: does this guide snapshot show the way (≥ 3 lit prints on screen, or the edge arrow)? Pure. */
export function showsWay(g, w, h) {
  if (!g) return false;
  if (g.edge && Number.isFinite(g.edge.sx)) return true;
  return (g.prints ?? []).filter((p) => p?.lit && p.sx >= 0 && p.sy >= 0 && p.sx <= w && p.sy <= h).length >= 3;
}

/** §10.10 #4: anything of the guide drawn (lit print, edge arrow or badge)? Pure. */
export const guideDrawn = (g) => !!g && (!!g.edge || !!g.badge || (g.prints ?? []).some((p) => p?.lit));

export const median = (xs) => { const a = xs.filter(Number.isFinite).sort((p, q) => p - q); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

// ------------------------------------------------------------------ one run
async function oneRun(browser, base, { device, skip, seed }) {
  const name = `${device}-${skip ? 'skip' : 'noskip'}-s${seed}`;
  const touch = device === 'touch' || device === 'portrait';
  const portrait = device === 'portrait';
  const { width: W, height: H } = VIEW[device];
  const context = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  const page = await context.newPage();
  const cdp = touch ? await context.newCDPSession(page) : null;
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).split('\n')[0]));
  const res = { name, device, skip, seed, firstFight: null, done: null, deaths: 0, firstFightDeaths: 0, failed: null, step: null, shot: null, actions: 0, errors,
    steps: [], minPrintW: null, sceneTrail: [], scenes: [] };
  const log = [];
  try {
    await page.goto(`${base}?debug&seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 120000 });
    // read-only probes: deaths, arena clears, flag times (game s)
    await page.evaluate(() => {
      const G = window.__GAME__, bus = G.ctx.bus, t = () => G.game.time;
      const B = window.__BOT__ = { deaths: [], clears: [], flags: {} };
      bus.on('player:died', () => B.deaths.push(t()));
      bus.on('arena:clear', () => B.clears.push(t()));
      bus.on('story:flag', (p) => { if (p?.key && !(p.key in B.flags)) B.flags[p.key] = t(); });
    });
    const snap = () => page.evaluate(() => {
      const G = window.__GAME__, st = G.ctx.state, fl = st?.flags ?? {};
      let g = null;
      try { g = G.guide ? G.plain(G.guide()) : null; } catch { g = null; }
      return {
        g, t: G.game.time, mode: G.game.mode, hp: G.ctx.player?.hp ?? null, enemies: G.ctx.enemies?.list?.length ?? 0,
        nflags: Object.keys(fl).filter((k) => fl[k]).length,
        ff: !!st?.getFlag?.('onboard.firstFight'), done: !!st?.getFlag?.('onboard.done'),
        B: window.__BOT__, scene: !!G.ctx.story?.sceneActive,
        // read-only probe for the §10.10 #5 report (which scene, can it be skipped); never an input
        sceneId: G.ctx.story?.playingId ?? null, canSkip: !!G.ctx.story?.playing?.canSkip, sceneKind: G.ctx.story?.playing?.kind ?? null,
      };
    });

    const tapXY = async (x, y) => { await page.touchscreen.tap(Math.round(x), Math.round(y)); };
    const touchHold = async (x, y, ms) => {
      const pt = [{ x: Math.round(x), y: Math.round(y), id: 7 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
      await page.waitForTimeout(ms);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const btnBox = async (action) => page.evaluate((a) => {
      const e = document.querySelector(`.tbtn.tb-${a}`);
      if (!e) return null;
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      if (!r.width || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, action);

    // ---- Play
    let s = await snap();
    for (let i = 0; i < 20; i++) {
      if (touch) await tapXY(W / 2, H * 0.6); else await page.mouse.click(W / 2, H * 0.6);
      await page.waitForTimeout(700);
      const n = await snap();
      if (n.g ? n.g.phase !== 'title' && n.g.phase !== 'loading' : n.mode !== 'title') { s = n; break; }
    }
    const t0 = s.t;
    let sig = '', sigT = t0, progT = t0, progSig = '', lastMoveT = -9, lastKeyT = {}, lastAtkT = -9, lastSkipT = -9;
    let sceneTime = 0, prevT = t0;
    // §10.10 #3–#5 checks
    let stepId = null, step = null, wasScene = false, sc = null;
    // a hit on her (a heart lost, which the HUD shows) also starts fighting back for 4 s, unless --strict
    let lastHp = null, hitT = -99;
    res.hitFights = 0;
    // a stuck player who sees nothing to press tries E, then swings at the badge (counted as a guess; --strict: off)
    res.guesses = [];
    let lastGuessT = -99, lastAim = null;

    for (;;) {
      s = await snap();
      const now = s.t, el = now - t0, g = s.g;
      if (s.scene || g?.phase === 'scene') sceneTime += now - prevT;
      prevT = now;
      if (s.ff && res.firstFight == null) res.firstFight = (s.B?.flags?.['onboard.firstFight'] ?? now) - t0;
      if (s.done) { res.done = (s.B?.flags?.['onboard.done'] ?? now) - t0; break; }
      if (el > (portrait ? 150 : MAX_S)) { res.failed = `timeout (${MAX_S} game s)`; res.step = g?.target?.id ?? g?.phase ?? null; break; }

      // signatures: the reaction clock (what is on screen) and the dead-end clock (progress)
      const nsig = JSON.stringify([g?.phase, g?.target?.id, g?.prompt, g?.objective, !!g?.skipChip]);
      if (nsig !== sig) { sig = nsig; sigT = now; }
      const psig = JSON.stringify([s.nflags, g?.target?.id, g?.prompt, g?.objective, s.enemies, s.scene]);
      if (psig !== progSig) { progSig = psig; progT = now; }
      const inScene = s.scene || g?.phase === 'scene';
      if (inScene) progT = now;   // scenes play on their own; the clock counts only player-facing time
      if (now - progT > DEAD_END_S) {
        res.failed = 'dead end'; res.step = g?.target?.id ?? g?.phase ?? null;
        res.prompt = g?.prompt ?? null; res.objective = g?.objective ?? null;
        // diagnostics for the report only (read after the run has already failed; never an input)
        res.diag = await page.evaluate(() => {
          const G = window.__GAME__, c = G.ctx, p = c.player?.pos, gt = c.story?.guideTarget?.(), w = c.actors?.get?.('wobble_knight')?.pos;
          const r = (v) => (v == null ? null : Math.round(v * 100) / 100);
          return { player: p && [r(p.x), r(p.z)], target: gt && { id: gt.id, x: r(gt.x), z: r(gt.z), arriveR: gt.arriveR, textKey: gt.textKey },
            dist: gt && p ? r(Math.hypot(p.x - gt.x, p.z - gt.z)) : null, guide: G.guide(),
            bar: (() => { const e = document.querySelector('.ui-abilitybar, .ability-bar, .ui-abilities'); if (!e) return null; const q = e.getBoundingClientRect(); return [q.left, q.top, q.width, q.height].map(Math.round); })(), orders: (() => { try { return G.orders?.(); } catch { return null; } })(), pstate: c.player?.stateName ?? null, mode: G.game?.mode ?? null, wobble: w && [r(w.x), r(w.z)], wobbleDist: w && p ? r(Math.hypot(p.x - w.x, p.z - w.z)) : null };
        }).catch(() => null);
        break;
      }
      const ready = now - sigT >= REACT_S;

      // ---- §10.10 #3: the way is shown within 1.0 s (non-scene time) of each onboarding step start
      const onboardingPhase = g && ['practice', 'prologue', 'onboard'].includes(g.phase);
      const tid = onboardingPhase && !inScene ? g.target?.id ?? null : null;
      if (tid && tid !== stepId) {
        stepId = tid;
        step = { id: tid, at: +el.toFixed(1), shownAfter: null, ok: false, badgeOnly: false, open: 0 };
        res.steps.push(step);
      }
      if (step && !step.ok && !inScene && tid === step.id) {
        if (showsWay(g, W, H)) { step.ok = true; step.shownAfter = +step.open.toFixed(2); }
        else if (g.badge) step.badgeOnly = true;
        step.open += Math.max(0, now - (step._t ?? now));
      }
      if (step) step._t = now;
      if (touch && g && !inScene) for (const p of g.prints ?? []) if (p?.lit && Number.isFinite(p.w) && p.w > 0) res.minPrintW = Math.min(res.minPrintW ?? Infinity, p.w);
      // ---- §10.10 #4 / #5: nothing of the guide in a scene; the skip chip within 0.5 s of a skippable scene start
      if (s.hp != null && lastHp != null && s.hp < lastHp && !inScene) { if (now - hitT > 4) res.hitFights++; hitT = now; }
      lastHp = s.hp;
      // fix round 2: a scene that already ended keeps its length (the old code left `sc` set after the end, so the next
      // scene's start overwrote it with the whole gap: CS-02 read 33 s and CS-01b 41 s, the time to the next scene)
      if (s.scene && sc && sc.len == null && s.sceneId && s.sceneId !== sc.id) { sc.len = +(now - sc.at).toFixed(1); sc = null; wasScene = false; }
      if (sc && sc.len != null && !s.scene) sc = null;
      if (s.scene && !wasScene) { sc = { id: s.sceneId, canSkip: s.canSkip, kind: s.sceneKind, at: now, chipAfter: null, len: null }; res.scenes.push(sc); }
      if (s.scene && sc) {
        if (sc.chipAfter == null && g?.skipChip) sc.chipAfter = +(now - sc.at).toFixed(2);
        if (now - sc.at > SCENE_GRACE_S && guideDrawn(g) && res.sceneTrail.length < 20) res.sceneTrail.push({ scene: sc.id, t: +(now - sc.at).toFixed(1), edge: !!g.edge, badge: !!g.badge, lit: (g.prints ?? []).filter((p) => p.lit).length });
      }
      if (!s.scene && wasScene && sc) { sc.len = +(now - sc.at).toFixed(1); sc = null; }
      wasScene = s.scene;
      if (portrait && res.steps.length > PORTRAIT_STEPS) { res.portraitStop = true; break; }

      // a menu she opened by accident (e.g. a Lantern Stone's): close it like a player would (Esc / the Close button)
      if (s.mode === 'menu' && g?.phase !== 'title' && now - (lastKeyT.menu ?? -9) > 1.5) {
        if (!res.menus) res.menus = [];
        if (res.menus.length < 10) res.menus.push({ at: +el.toFixed(1), step: g?.target?.id ?? null });
        await page.waitForTimeout(REACT_S * 1000);
        const closed = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^\s*(Close|Back|Resume)\s*$/i.test(x.textContent) && x.getBoundingClientRect().width > 0); if (b) { b.click(); return true; } return false; });
        if (!closed) await page.keyboard.press('Escape');
        lastKeyT.menu = now; progT = now; res.actions++; log.push([el.toFixed(1), 'menu:close']);
        await page.waitForTimeout(100);
        continue;
      }
      if (ready && g) {
        // 1) skip chip (skip runs only)
        if (skip && g.skipChip && now - lastSkipT > 2.5) {
          const c = { x: g.skipChip.x + g.skipChip.w / 2, y: g.skipChip.y + g.skipChip.h / 2 };
          if (touch) await touchHold(c.x, c.y, 1200);
          else { await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.waitForTimeout(1200); await page.mouse.up(); }
          lastSkipT = now; res.actions++; log.push([el.toFixed(1), 'skip']);
        } else {
          const text = `${g.prompt ?? ''} ${g.objective ?? ''}`;
          const lblDev = touch ? 'touch' : device;   // portrait runs are touch runs (🛡 / ⚔ labels)
          const named = namedActions(g.prompt, lblDev).size ? namedActions(g.prompt, lblDev) : namedActions(g.objective, lblDev);
          const hitFight = !has('--strict') && now - hitT < 4 && !inScene;
          const fight = (isFightPrompt(g.prompt, g.objective) || hitFight) && !inScene;
          let mv = moveTarget(g, W, H);
          if (mv && touch && mv.src !== 'badge') {
            // what is under each candidate (a visual check a player makes): skip points a button / panel covers
            const c = moveCandidates(g, W, H);
            const i = await page.evaluate((pts) => pts.findIndex((q) => document.elementFromPoint(q.x, q.y)?.tagName === 'CANVAS'), c.map((q) => ({ x: q.x, y: q.y })));
            if (i > 0) mv = c[i];
          }
          if (mv) lastAim = { x: mv.x, y: mv.y, id: g.target?.id };
          // 2) fight: swing toward the badge (else the centre) while a fight prompt is shown
          if (fight && (hitFight || !mv || mv.src !== 'print' || Math.hypot(mv.x - W / 2, mv.y - H * 0.48) < 160) && now - lastAtkT > 0.35) {
            const aim = g.ring ? { x: g.ring.sx, y: g.ring.sy } : g.badge ? { x: g.badge.sx, y: g.badge.sy } : { x: W / 2, y: H * 0.42 };
            // a line that says to hold Attack ("Hold [Attack] till it shines", Mochi's cracked latch): a charged swing
            const holdAtk = !hitFight && named.has('attack') && wantsHold(text);
            if (touch) { const b = await btnBox('attack'); if (b) { if (holdAtk) await touchHold(b.x, b.y, HOLD_ATTACK_MS); else await tapXY(b.x, b.y); } }
            else if (holdAtk) { await page.mouse.move(aim.x, aim.y); await page.mouse.down({ button: 'left' }); await page.waitForTimeout(HOLD_ATTACK_MS); await page.mouse.up({ button: 'left' }); }
            else await page.mouse.click(aim.x, aim.y, { button: 'left' });
            if (holdAtk) log.push([el.toFixed(1), 'attack:hold']);
            lastAtkT = now; res.actions++;
          } else if (mv && !inScene && now - lastMoveT > 1.0) {
            // 3) follow the trail
            if (touch) await tapXY(mv.x, mv.y); else await page.mouse.click(mv.x, mv.y, { button: 'right' });
            lastMoveT = now; res.actions++; log.push([el.toFixed(1), `move:${mv.src}`]);
          }
          // 3b) guess when stuck: 6 s without progress, nothing named, nothing of the guide shown (she has arrived)
          if (!has('--strict') && !inScene && !named.size && !fight && now - progT > 6 && now - lastGuessT > 1.2 && g.target && !moveTarget(g, W, H)) {
            const n = res.guesses.length;
            if (!res.guesses.some((x) => x.id === g.target.id)) res.guesses.push({ id: g.target.id, at: +el.toFixed(1), text: text.slice(0, 80) });
            if (n % 2 === 0 || touch) {
              if (touch) { const b = await btnBox('interact'); if (b) await tapXY(b.x, b.y); } else await page.keyboard.press('KeyE');
            }
            // aim at the badge, else where the trail last pointed for this step (the target as she arrived), else ahead
            const aim = g.ring ? { x: g.ring.sx, y: g.ring.sy } : g.badge ? { x: g.badge.sx, y: g.badge.sy } : lastAim?.id === g.target.id ? lastAim : { x: W / 2, y: H * 0.42 };
            for (let k = 0; k < 3; k++) {
              if (touch) { const b = await btnBox('attack'); if (b) await tapXY(b.x, b.y); } else await page.mouse.click(aim.x, aim.y, { button: 'left' });
              await page.waitForTimeout(250);
            }
            lastGuessT = now; res.actions++; log.push([el.toFixed(1), 'guess']);
          }
          // 4) the other named keys / buttons
          for (const a of named) {
            if (a === 'attack' || a === 'move') continue;
            const hold = a === 'guard' && wantsHold(text);
            // Parry ("Tap Space when you see the shield!"): a player times the tap to the shield telegraph over Sir Wobble,
            // which guide() does not expose yet (handoff in requests/tokentails-tt3-q1.md). Until it does, this one probe
            // reads whether that telegraph is on screen (Wobble's wind-up near its end) — a visual cue, never a position.
            if (a === 'guard' && !hold && /shield|parry/i.test(text)) {
              if (now - (lastKeyT[a] ?? -9) < 0.8) continue;
              const cue = await page.evaluate(() => new Promise((ok) => {
                const w = window.__GAME__.ctx.actors?.get?.('wobble_knight'), t0 = performance.now();
                const tick = () => { if (!w || performance.now() - t0 > 4000) return ok(false); if (w.phase === 'windup' && w.phaseT >= (w.atk?.windup ?? 0.9) - 0.11) return ok(true); requestAnimationFrame(tick); };
                tick();
              }));
              if (cue) {
                if (touch) { const bb = await btnBox('guard'); if (bb) await touchHold(bb.x, bb.y, 220); }
                else { await page.keyboard.down('Space'); await page.waitForTimeout(220); await page.keyboard.up('Space'); }
                res.actions++; log.push([el.toFixed(1), 'key:parry']);
              }
              lastKeyT[a] = now;
              continue;
            }
            const gap = a === 'guard' && !hold ? 0.4 : 1.5;
            if (now - (lastKeyT[a] ?? -9) < gap) continue;
            if (touch) {
              const b = a === 'confirm' ? { x: W / 2, y: H * 0.7 } : await btnBox(a);
              if (b) { if (hold) await touchHold(b.x, b.y, 1200); else await tapXY(b.x, b.y); }
            } else if (ACTION_CODE[a]) {
              if (hold) { await page.keyboard.down(ACTION_CODE[a]); await page.waitForTimeout(1200); await page.keyboard.up(ACTION_CODE[a]); }
              else await page.keyboard.press(ACTION_CODE[a]);
            }
            lastKeyT[a] = now; res.actions++; log.push([el.toFixed(1), `key:${a}`]);
          }
        }
      }
      await page.waitForTimeout(100);
    }
    const B = (await snap()).B ?? { deaths: [], clears: [] };
    res.deaths = B.deaths.length;
    const ffAt = res.firstFight != null ? res.firstFight + t0 : null;
    if (ffAt != null) {
      const clr = B.clears.find((c) => c >= ffAt) ?? Infinity;
      res.firstFightDeaths = B.deaths.filter((d) => d >= ffAt && d <= clr).length;
    }
    res.sceneTime = +sceneTime.toFixed(1);
  } catch (e) {
    res.failed = `error: ${String(e?.message ?? e).split('\n')[0]}`;
  }
  if (res.failed) {
    fs.mkdirSync(OUT, { recursive: true });
    res.shot = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: res.shot }).catch(() => { res.shot = null; });
  }
  res.log = log.slice(-40);
  await context.close().catch(() => {});
  for (const st of res.steps) delete st._t;
  if (res.steps.length > (portrait ? PORTRAIT_STEPS : Infinity)) res.steps.length = PORTRAIT_STEPS;
  const f = (v) => (v == null ? '–' : v.toFixed(1));
  console.log(`[bot] ${name}: firstFight ${f(res.firstFight)} s, done ${f(res.done)} s, deaths ${res.deaths} (first fight ${res.firstFightDeaths})${res.failed ? `  FAIL ${res.failed} @ ${res.step}` : ''}`);
  return res;
}

// ------------------------------------------------------------------ matrix
function report(runs) {
  const rows = [];
  for (const device of DEVICES) for (const skip of SKIPS) {
    const rs = runs.filter((r) => r.device === device && r.skip === skip);
    if (!rs.length) continue;
    const ff = median(rs.map((r) => r.firstFight)), dn = median(rs.map((r) => r.done));
    const ffLim = skip ? LIMITS.firstFight.skip : LIMITS.firstFight[device];
    const fails = rs.filter((r) => r.failed);
    const ffDeaths = rs.reduce((n, r) => n + r.firstFightDeaths, 0);
    const pass = !fails.length && ff != null && ff <= ffLim && ffDeaths === 0 && (skip || (dn != null && dn <= LIMITS.done));
    rows.push({ device, skip, runs: rs.length, firstFightMedian: ff, firstFightLimit: ffLim, doneMedian: dn, doneLimit: skip ? null : LIMITS.done,
      deaths: rs.reduce((n, r) => n + r.deaths, 0), firstFightDeaths: ffDeaths, failures: fails.map((r) => `${r.name}: ${r.failed} @ ${r.step}`), pass });
  }
  const f = (v) => (v == null ? '–' : `${v.toFixed(1)} s`);
  const md = ['| Viewport | Skip | Runs | Play → firstFight (median) | Limit | Play → done (median) | Limit | Deaths (first fight) | Result |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.device === 'mouse' ? '1280×720 mouse' : '844×390 touch'} | ${r.skip ? 'yes' : 'no'} | ${r.runs} | ${f(r.firstFightMedian)} | ${r.firstFightLimit} s | ${f(r.doneMedian)} | ${r.doneLimit ? `${r.doneLimit} s` : '–'} | ${r.deaths} (${r.firstFightDeaths}) | ${r.pass ? 'pass' : `FAIL${r.failures.length ? `: ${r.failures.join('; ')}` : ''}`} |`)].join('\n');
  return { rows, md };
}

/** §10.10 #3–#5 summary over every run. */
function checksReport(runs) {
  const late = [], drawn = [], noChip = [], sceneLens = {};
  let minW = null;
  for (const r of runs) {
    for (const st of r.steps ?? []) if (!st.ok || st.shownAfter > STEP_SHOW_S) late.push(`${r.name}:${st.id}${st.ok ? ` ${st.shownAfter}s` : st.badgeOnly ? ' (badge only)' : ' (never)'}`);
    for (const d of r.sceneTrail ?? []) drawn.push(`${r.name}:${d.scene}@${d.t}s`);
    for (const c of r.scenes ?? []) {
      if (c.canSkip && c.id !== 'cs00' && c.kind !== 'ambient' && (c.chipAfter == null || c.chipAfter > SCENE_GRACE_S) && !r.skip) noChip.push(`${r.name}:${c.id}${c.chipAfter == null ? ' (never)' : ` ${c.chipAfter}s`}`);
      if (c.len != null && !r.skip) (sceneLens[c.id ?? '?'] ??= []).push(c.len);
    }
    if (r.device === 'touch' && r.minPrintW != null) minW = Math.min(minW ?? Infinity, r.minPrintW);
  }
  const lens = Object.fromEntries(Object.entries(sceneLens).map(([k, v]) => [k, median(v)]));
  const sum = { stepsLate: late, guideInScene: drawn, skipChipLate: noChip, minPrintW844: minW, sceneMedianLen: lens };
  const pass = !late.length && !drawn.length && !noChip.length && (minW == null || minW >= PRINT_MIN_PX);
  const md = [
    `- Way shown within ${STEP_SHOW_S} s of each step (≥3 lit prints or edge arrow): ${late.length ? `MISS ${late.length}: ${late.slice(0, 30).join(', ')}` : 'pass'}`,
    `- Smallest lit print at 844×390: ${minW == null ? '–' : `${minW} px`} (limit ${PRINT_MIN_PX} px)`,
    `- Guide drawn in a scene (after ${SCENE_GRACE_S} s): ${drawn.length ? `FAIL ${drawn.slice(0, 20).join(', ')}` : 'none'}`,
    `- Skip chip within ${SCENE_GRACE_S} s of skippable scene starts: ${noChip.length ? `MISS ${noChip.slice(0, 20).join(', ')}` : 'pass'}`,
    `- Scene lengths (median, game s, no-skip): ${Object.entries(lens).map(([k, v]) => `${k} ${v?.toFixed(1)}`).join(', ') || '–'}`,
  ].join('\n');
  return { sum, pass, md };
}

async function main() {
  let server = null, base = opt('--url');
  if (!base) {
    if (!fs.existsSync(path.join(ROOT, 'dist-test', 'index.html'))) { console.error('[bot] dist-test/ missing: run `npm run build:test` first'); process.exit(1); }
    const { preview } = await import('vite');
    server = await preview({ root: ROOT, build: { outDir: 'dist-test' }, preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
    base = `http://localhost:${PORT}/`;
  }
  if (!base.endsWith('/')) base += '/';
  const browser = await chromium.launch({ headless: !has('--headed'), args: GPU_ARGS });
  const jobs = [];
  for (const device of DEVICES) for (const skip of SKIPS) for (const seed of SEEDS) jobs.push({ device, skip, seed });
  if (!has('--no-portrait') && DEVICES.includes('touch')) jobs.push({ device: 'portrait', skip: false, seed: SEEDS[0] });
  const runs = [];
  try {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, async () => {
      while (i < jobs.length) { const j = jobs[i++]; runs.push(await oneRun(browser, base, j)); }
    }));
  } finally {
    await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  }
  const { rows, md: md0 } = report(runs);
  const checks = checksReport(runs);
  const md = `${md0}\n\n${checks.md}`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'onboarding-bot.json'), JSON.stringify({ at: new Date().toISOString(), react: REACT_S, deadEnd: DEAD_END_S, rows, checks: checks.sum, runs }, null, 2));
  fs.writeFileSync(path.join(OUT, 'onboarding-bot.md'), `${md}\n`);
  console.log(`\n${md}\n\n[bot] wrote ${path.relative(ROOT, path.join(OUT, 'onboarding-bot.json'))} and .md`);
  process.exit(rows.every((r) => r.pass) && checks.pass ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
