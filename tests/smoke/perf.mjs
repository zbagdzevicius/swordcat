// tests/smoke/perf.mjs  (owner: core) — PERF_SPEC §14.2 smoke gates (C2), run only with SMOKE_PERF=1:
//   SMOKE_PERF=1 SMOKE_URL=http://localhost:5301/ SMOKE_ONLY=perf node tests/smoke.mjs
// Count gates (programs, compiles, re-resolves, draws, steps, pool misses, composer, dyn-res viewport) FAIL now on any
// machine. Timing gates print REPORT until PERF §14.4's idle-machine baseline sets thresholds; a failed calibration
// (§14.1: 2000 Math.sqrt ≤ 10 µs, median of 50) prints INVALID for them (never pass, never fail).
// Without SMOKE_PERF=1 every block logs "skipped" and costs nothing (level: null), except `perf:programs`: the
// programs-per-level budget is a hard gate for every preset on every run (low / med / high × meadow + gate).
import fs from 'node:fs';
import path from 'node:path';

const ON = process.env.SMOKE_PERF === '1';
const DIR = 'perf';

/** IMPLEMENTATION_PLAN §5 + PERF §14.3 (scene draws End column; frame calls per stage). */
const SCENES = [
  { id: 'meadow start', level: 'meadow', spawn: 'start' },
  { id: 'forest', level: 'forest', spawn: 'start' },
  { id: 'town', level: 'town', spawn: 'start' },
  { id: 'gate', level: 'gate', spawn: 'start' },
];

const skip = (t) => { if (!ON) { t.log('skipped (SMOKE_PERF=1 runs the PERF §14.2 gates)'); return true; } return false; };

/** §14.1 calibration in the page: median of 50 runs of 2000 Math.sqrt ≤ 10 µs, else timing gates are INVALID. */
async function calibrate(t) {
  const us = await t.page.evaluate(() => {
    const runs = [];
    let sink = 0;
    for (let r = 0; r < 50; r++) { const a = performance.now(); for (let i = 0; i < 2000; i++) sink += Math.sqrt(i + r); runs.push((performance.now() - a) * 1000); }
    window.__sink = sink;
    runs.sort((x, y) => x - y);
    return runs[25];
  });
  return { us, valid: us <= 10 };
}

/** Timing verdict: REPORT (no baseline yet) or INVALID (failed calibration). */
const timing = (cal, label, value) => `${cal.valid ? 'REPORT' : 'INVALID'} ${label} ${value}`;

async function settle(t, level, spawn = 'start', frames = 60) {
  await t.loadLevel(level, spawn);
  await t.G(() => { const g = window.__GAME__; g.story.skip?.(); g.skipDialog?.(); g.setMode('play'); g.god(true); });
  await t.frames(frames);
}

const perf = (t) => t.G(() => window.__GAME__.perf());

/**
 * PERF §5 memory gate: JS heap in play (performance.memory.usedJSHeapSize, which counts ArrayBuffer backing stores)
 * after a forced GC ≤ budget.heapMB of the active tier. Machine-independent, so it FAILs now (not REPORT). The dev
 * server adds a few MB of module records; the gate applies to it unchanged.
 */
async function heapGate(t, label) {
  let cdp = null;
  try { cdp = await t.page.context().newCDPSession(t.page); await cdp.send('HeapProfiler.collectGarbage'); }
  catch { /* non-Chromium: measure without a GC */ } finally { await cdp?.detach().catch(() => {}); }
  const r = await t.G(() => { const p = window.__GAME__.perf(); return { heapMB: p.heapMB, budget: p.budget.heapMB, q: p.quality }; });
  if (r.heapMB == null) { t.log(`perf:heap ${label}: performance.memory unavailable`); return; }
  t.log(`perf:heap ${label} (${r.q}): ${r.heapMB.toFixed(0)} MB (budget ${r.budget} MB)`);
  t.assert(r.heapMB <= r.budget, `perf:heap ${label} (${r.q}): JS heap ${r.heapMB.toFixed(0)} MB > ${r.budget} MB (PERF §5)`);
}

/** Frame intervals (ms) of the next n rendered frames, measured in the page. */
const frameTimes = (t, n) => t.page.evaluate((k) => new Promise((res) => {
  const g = window.__GAME__.game, out = []; let last = performance.now();
  const off = g.addFrameHook(() => { const now = performance.now(); out.push(now - last); last = now; if (out.length >= k) { off(); res(out); } });
}), n);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] ?? 0; };

export default [
  {
    // PERF §1.2 "programs per level (fresh page)" as a HARD gate for EVERY preset (not just the page's own): each
    // (preset, level) boots a fresh page at `?quality=<preset>&level=<level>`, settles 90 frames in play and asserts
    // renderer.info.programs ≤ QUALITY[preset].programs (+ programsCinematic on High). Always on (no SMOKE_PERF):
    // low / med / high × meadow and gate by default; SMOKE_PERF=1 checks all four M2 levels.
    name: 'perf:programs', order: 80, level: null, timeout: 1200000,
    async run(t) {
      const url = new URL(t.page.url()), base = url.origin + url.pathname;
      const scenes = ON ? SCENES : SCENES.filter((s) => s.level === 'meadow' || s.level === 'gate');
      for (const preset of ['low', 'med', 'high']) {
        for (const s of scenes) {
          const pg = await t.page.context().browser().newPage({ viewport: { width: 1280, height: 720 } });
          const errs = [];
          pg.on('pageerror', (e) => errs.push(e.message));
          try {
            await pg.goto(`${base}?test=1&seed=1&quality=${preset}&level=${s.level}`, { timeout: 180000 });
            await pg.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 180000 });
            const r = await pg.evaluate(async () => {
              const g = window.__GAME__;
              g.story?.skip?.(); g.skipDialog?.(); g.setMode('play'); g.god(true);
              await g.waitFrames(90);
              const q = g.ctx.quality;
              return { programs: g.ctx.renderer.info.programs.length, cap: (q.programs ?? 40) + (q.cinematic ? (q.programsCinematic ?? 0) : 0), id: q.id };
            });
            t.log(`${preset} ${s.id}: programs ${r.programs} / ${r.cap} (${r.id})`);
            t.assert(r.id === preset, `perf:programs: asked for ${preset}, the page runs ${r.id}`);
            t.assert(r.programs <= r.cap, `perf:programs ${preset} ${s.id}: ${r.programs} > ${r.cap}`);
            for (const e of errs) t.fail(`perf:programs ${preset} ${s.id}: pageerror ${e}`);
          } finally {
            await pg.close().catch(() => {});
          }
        }
      }
    },
  },
  {
    name: 'perf:no-compile', order: 81, level: null, timeout: 300000,
    async run(t) {
      if (skip(t)) return;
      await settle(t, 'meadow', 'start', 90);
      const p0 = (await perf(t)).programs;
      // scripted play: enemies of the level, a Holy charge, a lantern / Golden Hour attempt, a close-up cutscene beat
      await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos; const L = ['rat_pike', 'rat_pike', 'rat_xbow', 'crow', 'rat_pike', 'rat_xbow'];
        L.forEach((type, i) => { const a = i / L.length * Math.PI * 2; g.spawn(type, p.x + Math.cos(a) * 7, p.z + Math.sin(a) * 7); }); });
      await t.wait(4000);
      await t.G(() => { const g = window.__GAME__; g.player.setShards?.(1); g.player.setValor?.(100); });
      await t.hold('KeyJ', 2200);
      await t.tap('KeyV', 1, 100);
      await t.wait(3000);
      await t.G(() => { const g = window.__GAME__; g.ctx.cam?.setCloseUp?.(true); g.ctx.postfx.setCinematic(true); });
      await t.frames(30);
      await t.G(() => { const g = window.__GAME__; g.ctx.postfx.setCinematic(false); g.ctx.cam?.setCloseUp?.(false); });
      await t.frames(60);
      const p1 = (await perf(t)).programs;
      t.log(`programs ${p0} → ${p1}`);
      t.assert(p1 <= p0, `perf:no-compile: ${p1 - p0} program(s) compiled during play`);
    },
  },
  {
    name: 'perf:reresolve', order: 82, level: null, timeout: 300000,
    async run(t) {
      if (skip(t)) return;
      // a private page whose three has a counter in setProgram's needsProgramChange branch (nothing on disk changes)
      const page = await t.browser.newPage({ viewport: { width: 1280, height: 720 } });
      let patched = false;
      await page.route(/(three\.module-[^/]*|\.vite\/deps\/three|three-[A-Za-z0-9_-]+)\.js/, async (route) => {
        const resp = await route.fetch();
        let body = await resp.text();
        const a = body.indexOf('let needsProgramChange = false;');
        if (a > 0 && body.includes('if (needsProgramChange === true) {')) {
          body = body.replace('if (needsProgramChange === true) {', 'if (needsProgramChange === true) { window.__reresolve = (window.__reresolve || 0) + (window.__reresolveOn ? 1 : 0);');
          patched = true;
        }
        await route.fulfill({ response: resp, body, headers: { ...resp.headers(), 'content-length': String(Buffer.byteLength(body)) } });
      });
      try {
        await page.goto(`${t.base}?test=1&seed=1&mute=1&level=meadow&spawn=start`, { timeout: 180000 });
        await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 180000 });
        await page.evaluate(() => { const g = window.__GAME__; g.story.skip(); g.setMode('play'); g.god(true); });
        await page.waitForTimeout(2000);
        if (!patched) { t.log('INVALID perf:reresolve: the served three build has no needsProgramChange branch to patch'); return; }
        const count = (n) => page.evaluate((k) => new Promise((res) => { const g = window.__GAME__.game; window.__reresolve = 0; window.__reresolveOn = true;
          const end = g.frameCount + k; const off = g.addFrameHook(() => { if (g.frameCount >= end) { off(); window.__reresolveOn = false; res(window.__reresolve); } }); }), n);
        const idle = await count(60);
        await page.evaluate(() => { const g = window.__GAME__, p = g.ctx.player.pos; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.spawn(i % 3 ? 'rat_pike' : 'rat_xbow', p.x + Math.cos(a) * 6, p.z + Math.sin(a) * 6); } });
        await page.waitForTimeout(1500);
        const combat = await count(300);
        t.log(`re-resolves: idle ${idle} / 60 frames, combat ${combat} / 300 frames`);
        t.assert(idle === 0 && combat === 0, `perf:reresolve: ${idle} idle + ${combat} combat program re-resolves (want 0)`);
      } finally { await page.close(); }
    },
  },
  {
    name: 'perf:draws', order: 83, level: null, timeout: 600000,
    async run(t) {
      if (skip(t)) return;
      fs.mkdirSync(path.join(t.shotsDir, DIR), { recursive: true });
      for (const s of SCENES) {
        await settle(t, s.level, s.spawn);
        const p = await perf(t);
        const b = p.budget;
        const cap = b.frameCalls ?? b.sceneCalls;
        const calls = b.frameCalls != null ? p.calls : p.sceneCalls;
        t.log(`${s.id} [${p.stage} ${p.quality}]: frame calls ${p.calls}, scene ${p.sceneCalls} / ${cap}, tris ${(p.sceneTris / 1000).toFixed(1)}k, byCat ${JSON.stringify(p.byCat)}`);
        t.assert(calls <= cap, `perf:draws ${s.id}: ${calls} calls > ${cap} (${p.stage})`);
        if (b.tris != null) t.assert(p.sceneTris <= b.tris, `perf:draws ${s.id}: ${p.sceneTris} tris > ${b.tris}`);
      }
    },
  },
  {
    name: 'perf:shadow', order: 84, level: null, timeout: 180000,
    async run(t) {
      if (skip(t)) return;
      await settle(t, 'meadow');
      const res = await t.page.evaluate(() => new Promise((res) => {
        const g = window.__GAME__, game = g.game; let n = 0, zero = 0;
        g.order('move', [g.ctx.player.pos.x + 20, g.ctx.player.pos.z]);
        const off = game.addFrameHook(() => { n++; if (game.perf.shadowCalls === 0) zero++; if (n >= 300) { off(); res({ n, zero }); } });
      }));
      const ratio = res.zero / Math.max(1, res.n);
      const stage = (await perf(t)).stage;
      // stage 2 (cached statics map) is the End state; before it, report only
      const msg = `shadow draws 0 on ${(ratio * 100).toFixed(0)} % of ${res.n} frames`;
      if (stage === 'End') t.assert(ratio >= 0.95, `perf:shadow: ${msg} (want ≥ 95 %)`); else t.log(`REPORT ${msg} (gates at stage End)`);
    },
  },
  {
    name: 'perf:spawn', order: 85, level: null, timeout: 180000,
    async run(t) {
      if (skip(t)) return;
      const cal = await calibrate(t);
      await settle(t, 'meadow');
      await t.G(() => window.__GAME__.perf.reset());
      const before = await frameTimes(t, 60);
      const afterP = frameTimes(t, 30);
      await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.spawn(i % 3 ? 'rat_pike' : 'rat_xbow', p.x + Math.cos(a) * 8, p.z + Math.sin(a) * 8); } });
      const after = await afterP;
      const worst = Math.max(...after), med = median(before);
      const misses = (await perf(t)).poolMisses;
      t.log(timing(cal, 'perf:spawn worst/median', `${worst.toFixed(1)} / ${med.toFixed(1)} ms (want ≤ 1.5×)`));
      t.assert(misses === 0, `perf:spawn: ${misses} VisualPool misses during the wave`);
    },
  },
  {
    name: 'perf:alloc', order: 86, level: null, timeout: 240000,
    async run(t) {
      if (skip(t)) return;
      await settle(t, 'meadow');
      const cdp = await t.page.context().newCDPSession(t.page);
      const sample = async (frames) => {
        await cdp.send('HeapProfiler.enable');
        await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096 });
        const t0 = Date.now(); const f0 = await t.G(() => window.__GAME__.frame);
        await t.frames(frames);
        const { profile } = await cdp.send('HeapProfiler.stopSampling');
        const sec = (Date.now() - t0) / 1000, nf = (await t.G(() => window.__GAME__.frame)) - f0;
        let game = 0, total = 0; const byFn = new Map();
        const walk = (n) => {
          const self = n.selfSize ?? 0; total += self;
          const url = n.callFrame?.url ?? '';
          if (/\/src\//.test(url)) { game += self; const k = `${n.callFrame.functionName || '(anon)'} ${url.replace(/.*\/src\//, 'src/')}:${n.callFrame.lineNumber + 1}`; byFn.set(k, (byFn.get(k) ?? 0) + self); }
          for (const c of n.children ?? []) walk(c);
        };
        walk(profile.head);
        const top = [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 5);
        return { gameKBs: game / 1024 / sec, totalKBf: total / 1024 / Math.max(1, nf), topKBs: top.map(([k, v]) => [k, +(v / 1024 / sec).toFixed(1)]) };
      };
      const idle = await sample(300);
      await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.spawn('rat_pike', p.x + Math.cos(a) * 7, p.z + Math.sin(a) * 7); } });
      const fight = await sample(300);
      await cdp.detach();
      for (const [label, r] of [['idle', idle], ['fight', fight]]) {
        t.log(`${label}: game ${r.gameKBs.toFixed(0)} KB/s, total ${r.totalKBf.toFixed(1)} KB/frame, top ${JSON.stringify(r.topKBs)}`);
        t.assert(r.gameKBs <= 512, `perf:alloc ${label}: game code ${r.gameKBs.toFixed(0)} KB/s > 512`);
        t.assert(r.totalKBf <= 32, `perf:alloc ${label}: ${r.totalKBf.toFixed(1)} KB/frame > 32`);
        t.assert(!r.topKBs.length || r.topKBs[0][1] <= 128, `perf:alloc ${label}: ${r.topKBs[0]?.[0]} ${r.topKBs[0]?.[1]} KB/s > 128`);
      }
    },
  },
  {
    name: 'perf:audio-unlock', order: 87, level: null, timeout: 180000, reload: true,
    async run(t) {
      if (skip(t)) return;
      await settle(t, 'meadow', 'start', 30);
      const lt0 = (await perf(t)).longTasks;
      await t.tap('KeyW', 1, 120);
      await t.wait(1000);
      const lt1 = (await perf(t)).longTasks;
      t.log(`long tasks in the 1 s after the first key press: ${lt1 - lt0}`);
      t.assert(lt1 - lt0 === 0, `perf:audio-unlock: ${lt1 - lt0} long task(s) > 50 ms after the first press`);
    },
  },
  {
    name: 'perf:steps', order: 88, level: null, timeout: 180000,
    async run(t) {
      if (skip(t)) return;
      await settle(t, 'meadow');
      const cdp = await t.page.context().newCDPSession(t.page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      try {
        await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.spawn('rat_pike', p.x + Math.cos(a) * 6, p.z + Math.sin(a) * 6); } });
        await t.G(() => window.__GAME__.perf.reset());
        await t.wait(5000);
        const p = await perf(t);
        const cap = p.quality === 'low' ? 3 : 4;
        t.log(`4× CPU: steps avg ${p.steps.avg.toFixed(2)} max ${p.steps.max} (cap ${cap}), cap hits ${p.steps.capHits}`);
        t.assert(p.steps.max <= cap, `perf:steps: ${p.steps.max} steps in one frame > ${cap}`);
      } finally { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await cdp.detach(); }
    },
  },
  {
    name: 'perf:dynres-step', order: 89, level: null, timeout: 180000,
    async run(t) {
      if (skip(t)) return;
      const cal = await calibrate(t);
      await settle(t, 'meadow');
      await t.G(() => { const g = window.__GAME__; g.order('move', [g.ctx.player.pos.x + 25, g.ctx.player.pos.z + 5]); });
      const steps = [0.85, 0.7, 0.85, 1.0];
      let worstRatio = 0;
      for (const s of steps) {
        const before = await frameTimes(t, 60);
        const after = frameTimes(t, 3);
        const r = await t.G((v) => window.__GAME__.perf.setScale(v), s);
        const a = await after;
        worstRatio = Math.max(worstRatio, Math.max(...a) / Math.max(1e-3, median(before)));
        t.assert(r.viewport[0] === r.buffer[0] && r.viewport[1] === r.buffer[1], `perf:dynres-step: uViewport ${r.viewport} ≠ drawing buffer ${r.buffer} at s ${s}`);
        t.log(`s ${r.scale.toFixed(2)} dpr ${r.dpr.toFixed(3)} buffer ${r.buffer.join('×')}`);
      }
      t.log(timing(cal, 'perf:dynres-step worst frame / median', `${worstRatio.toFixed(2)} (want ≤ 1.5)`));
      await t.G(() => window.__GAME__.perf.setScale(1));
    },
  },
  {
    name: 'perf:composer', order: 90, level: null, timeout: 300000,
    async run(t) {
      if (skip(t)) return;
      for (const q of ['low', 'med', 'high']) {
        await t.G((n) => window.__GAME__.quality(n), q);
        await settle(t, 'meadow', 'start', 30);
        // High prewarms the cinematic variants under the veil (LevelManager → postfx.prewarmCinematic); do it here too
        await t.G(() => window.__GAME__.ctx.postfx.prewarmCinematic());
        await t.frames(5);
        const before = await t.G(() => ({ programs: window.__GAME__.ctx.renderer.info.programs.length, chain: !!window.__GAME__.ctx.postfx.chain }));
        const seen = await t.page.evaluate(() => new Promise((res) => {
          const g = window.__GAME__, game = g.game, pf = g.ctx.postfx; let on = 0, n = 0;
          pf.setCinematic(true, { dur: 0.3 });
          const off = game.addFrameHook(() => {
            n++; if (pf.composerActive) on++;
            if (n === 40) pf.setCinematic(false, { dur: 0.3 });
            if (n >= 90) { off(); res({ on, n, after: pf.composerActive }); }
          });
        }));
        const after = await t.G(() => ({ programs: window.__GAME__.ctx.renderer.info.programs.length, chain: !!window.__GAME__.ctx.postfx.chain }));
        t.log(`${q}: composer on ${seen.on}/${seen.n} frames, after ${seen.after}, programs ${before.programs} → ${after.programs}, chain ${after.chain}`);
        if (q === 'high') {
          t.assert(seen.on >= 30 && !seen.after, `perf:composer high: on ${seen.on} frames, after hand-back ${seen.after}`);
        } else {
          t.assert(seen.on === 0 && !after.chain, `perf:composer ${q}: a post chain ran (${seen.on} frames, chain ${after.chain})`);
        }
        t.assert(after.programs <= before.programs, `perf:composer ${q}: ${after.programs - before.programs} program(s) compiled by the cinematic`);
      }
      await t.G(() => window.__GAME__.quality('med'));
    },
  },
  {
    name: 'perf:frame', order: 91, level: null, timeout: 180000,
    async run(t) {
      if (skip(t)) return;
      const cal = await calibrate(t);
      await settle(t, 'meadow', 'start', 120);
      await t.G(() => window.__GAME__.perf.reset());
      await t.frames(600);
      const idle = await perf(t);
      await heapGate(t, 'meadow idle');
      await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.spawn('rat_pike', p.x + Math.cos(a) * 7, p.z + Math.sin(a) * 7); } });
      await t.frames(120);
      await t.G(() => window.__GAME__.perf.reset());
      await t.frames(600);
      const fight = await perf(t);
      for (const [label, p] of [['idle', idle], ['8-rat fight', fight]]) {
        t.log(timing(cal, `perf:frame ${label}`, `p50 ${p.frame.p50.toFixed(1)} p99 ${p.frame.p99.toFixed(1)} ms, cpu ${p.cpu.total.toFixed(2)} ms (sim ${p.cpu.sim.toFixed(2)}, render ${p.cpu.render.toFixed(2)}, submit ${p.cpu.submit.toFixed(2)}), gpu ${p.gpuMs?.toFixed(2) ?? 'n/a'} ms, s ${p.scale}`));
      }
      t.log(`calibration ${cal.us.toFixed(1)} µs (${cal.valid ? 'valid' : 'INVALID: machine busy'})`);
    },
  },
  {
    name: 'perf:boot', order: 92, level: null, timeout: 120000,
    async run(t) {
      if (skip(t)) return;
      const cal = await calibrate(t);
      const m = await t.page.evaluate(() => {
        const get = (n) => performance.getEntriesByName(n)[0]?.startTime ?? null;
        return { paint: get('first-contentful-paint'), title: get('title'), play: get('play') };
      });
      t.log(timing(cal, 'perf:boot', `T_paint ${m.paint?.toFixed(0)} ms, T_title ${m.title?.toFixed(0) ?? '-'} ms, T_play ${m.play?.toFixed(0) ?? '-'} ms (dev server: startup gates need the private build, PERF §14.1)`));
      t.assert(m.paint != null, 'perf:boot: no first-contentful-paint entry');
    },
  },
];
