// tests/smoke/core.mjs  (owner: core) — §19.9 smoke blocks 1, 2, 6 and 9 (9 = the harness's global error
// check) plus core contracts: ctx shape, modes, MODEL_FIT ±10% (R3).
const LEVEL_IDS = ['meadow', 'forest', 'town', 'gate', 'bog', 'keep'];
const CTX_KEYS = ['game', 'bus', 'config', 'renderer', 'scene', 'camera', 'input', 'assets', 'actors', 'state', 'rng',
  'physics', 'combat', 'cam', 'player', 'enemies', 'companions', 'levels', 'env', 'objectives', 'strings', 'fx', 'audio',
  'story', 'ui', 'save', 'postfx', 'quality', 'params'];

export default [
  {
    name: 'core:boot', order: 0, level: null,
    async run(t) {
      const s = await t.G((keys) => {
        const g = window.__GAME__, missing = keys.filter((k) => g.ctx[k] == null);
        return { missing, level: g.levelId, mode: g.mode, events: [...g.events], ready: g.ready };
      }, CTX_KEYS);
      t.assert(s.missing.length === 0, `ctx missing: ${s.missing.join(', ')}`);
      t.assert(s.level === 'meadow', `boot level is ${s.level}, expected meadow`);
      t.assert(s.events.includes('game:ready') && s.events.includes('level:loaded'), 'game:ready / level:loaded not in __GAME__.events');
      t.log(`boot mode=${s.mode}`);
    },
  },
  {
    name: 'core:move', order: 10, level: 'meadow', spawn: 'start',
    async run(t) {
      const p0 = (await t.state()).player.pos;
      await t.hold('KeyW', 1200);
      await t.frames(3);
      const p1 = (await t.state()).player.pos;
      const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
      t.assert(moved >= 1, `player did not move with W (${moved.toFixed(2)} m)`);
      await t.clearEvents();
      await t.tap('KeyJ', 3, 250);                                                   // the 3-hit combo
      await t.wait(700);
      const swings = (await t.events()).filter((e) => e === 'player:swing').length;
      t.assert(swings >= 3, `3-hit combo: expected ≥ 3 player:swing, got ${swings}`);
      await t.shot('01-move');
      t.log(`moved ${moved.toFixed(2)} m, swings ${swings}`);
    },
  },
  {
    name: 'core:modes', order: 11, level: 'meadow', spawn: 'start',
    async run(t) {
      await t.setMode('cutscene');
      const a = (await t.state()).player.pos;
      await t.hold('KeyW', 500);
      const b = (await t.state()).player.pos;
      t.assert(Math.hypot(b[0] - a[0], b[2] - a[2]) < 0.05, 'player moved during mode "cutscene" (non-scripted actors must freeze)');
      await t.setMode('menu');
      await t.setMode('play');
      const ev = await t.events();
      t.assert(ev.includes('game:mode') && ev.includes('game:pause'), 'game:mode / game:pause not emitted');
      await t.hold('KeyW', 400);
      const c = (await t.state()).player.pos;
      t.assert(Math.hypot(c[0] - b[0], c[2] - b[2]) > 0.3, 'player did not move after returning to mode "play"');
    },
  },
  {
    // Esc during mouse capture: browsers spend it on releasing the lock, so losing the lock mid-play must pause;
    // Resume re-captures. ?test turns pointer lock off, so this block switches it on for its own run.
    name: 'core:pointerlock', order: 12, level: 'meadow', spawn: 'start',
    async run(t) {
      const { page } = t;
      await t.G(() => { const i = window.__GAME__.ctx.input; i.pointerLockEnabled = true; i.device = 'kbm'; });
      await page.mouse.click(640, 360);
      try { await page.waitForFunction(() => !!document.pointerLockElement, null, { timeout: 3000 }); }
      catch { t.warn('pointer lock not granted in this browser — exercising the handler directly'); }
      const locked = await page.evaluate(() => !!document.pointerLockElement);
      await t.clearEvents();
      if (locked) await page.evaluate(() => document.exitPointerLock());   // what the browser does on Esc
      else await t.G(() => { const i = window.__GAME__.ctx.input; i._onPointerLockChange(true); i._onPointerLockChange(false); });
      await t.frames(6);
      const s = await t.G(() => ({ mode: window.__GAME__.ctx.game.mode, paused: !!window.__GAME__.ctx.ui.menus?.paused }));
      t.assert(s.mode === 'menu' && s.paused, `lock lost mid-play did not open the pause menu (mode=${s.mode}, paused=${s.paused})`);
      const ev = await t.events();
      t.assert(ev.includes('input:pointerLock') && ev.includes('game:pause'), 'input:pointerLock / game:pause not emitted');
      await t.shot('02-lock-pause');
      // a real click on Resume (user gesture) returns to play and asks for the lock again
      const resumed = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => x.offsetParent && /resume/i.test(x.textContent));
        if (!b) return false; b.click(); return true;
      });
      if (!resumed) await t.G(() => window.__GAME__.ctx.ui.resume());
      await t.frames(6);
      const r = await t.G(() => ({ mode: window.__GAME__.ctx.game.mode }));
      t.assert(r.mode === 'play', `resume left mode=${r.mode}`);
      if (locked) {
        let relocked = true;
        try { await page.waitForFunction(() => !!document.pointerLockElement, null, { timeout: 3000 }); } catch { relocked = false; }
        if (!relocked) t.warn('Resume did not re-capture the mouse (browser re-lock cooldown?)');
        t.log(`pointer lock: granted, pause on loss ok, relock after resume ${relocked}`);
        await page.evaluate(() => document.exitPointerLock());
        await t.frames(4);
        if ((await t.G(() => window.__GAME__.ctx.game.mode)) === 'menu') await t.G(() => window.__GAME__.ctx.ui.resume());
      }
      await t.G(() => { window.__GAME__.ctx.input.pointerLockEnabled = false; });
    },
  },
  {
    // GPU resources must not grow across level reloads (long sessions crashed the renderer). Budgets are loose:
    // shared caches (assets, materials) may warm on the first pass, so only growth after a warm-up round counts.
    name: 'core:leaks', order: 62, level: null, timeout: 240000,
    async run(t) {
      const mem = () => t.G(() => {
        const m = window.__GAME__.ctx.renderer.info.memory, pm = performance.memory;
        return { geo: m.geometries, tex: m.textures, heap: pm ? Math.round(pm.usedJSHeapSize / 1048576) : null };
      });
      const round = async () => { for (const id of ['forest', 'meadow']) { await t.loadLevel(id, 'start'); await t.frames(10); } return mem(); };
      await t.loadLevel('meadow', 'start'); await t.frames(10);
      const warm = await round();
      const r1 = await round(), r2 = await round();
      t.log(`meadow after reloads: geo ${warm.geo}→${r1.geo}→${r2.geo}, tex ${warm.tex}→${r1.tex}→${r2.tex}, heap MB ${warm.heap}→${r1.heap}→${r2.heap}`);
      const LIMIT = { geo: 20, tex: 4 };
      for (const k of ['geo', 'tex']) {
        const grow = r2[k] - warm[k];
        t.assert(grow <= LIMIT[k], `${k === 'geo' ? 'geometries' : 'textures'} grew by ${grow} over 2 meadow↔forest reloads (limit ${LIMIT[k]}): something is not disposed on level unload`);
      }
    },
  },
  {
    name: 'core:levels', order: 60, level: null, timeout: 120000,
    async run(t) {
      for (const id of LEVEL_IDS) {
        await t.loadLevel(id, 'start');
        await t.frames(10);
        const s = await t.state();
        t.assert(s.levelId === id, `loadLevel(${id}) left levelId=${s.levelId}`);
        await t.shot(`lvl-${id}`);
        await t.blankCheck(`lvl-${id}`);
        t.log(`${id}: calls ${s.calls} tris ${s.tris} q=${s.quality}`);
        if (s.calls > 150) t.warn(`${id}: draw calls ${s.calls} over the Med budget (150)`);
      }
      await t.loadLevel('meadow', 'start');
    },
  },
  {
    name: 'core:fit', order: 61, level: null, timeout: 120000,
    async run(t) {
      const paths = await t.G(() => window.__GAME__.modelFitPaths());
      for (const p of paths) {
        const r = await t.G((x) => window.__GAME__.measureFit(x), p);
        if (!(r.ratio >= 0.9 && r.ratio <= 1.1)) t.fail(`MODEL_FIT ${p}: ${r.axis} extent ${r.extent.toFixed(3)} vs target ${r.target} (×${r.ratio.toFixed(2)})`);
        if (Math.abs(r.minY) > 0.02) t.fail(`MODEL_FIT ${p}: feet not grounded (min y ${r.minY.toFixed(3)})`);
      }
      t.log(`${paths.length} models within ±10% of MODEL_FIT`);
    },
  },
];
