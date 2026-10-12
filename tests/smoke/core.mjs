// tests/smoke/core.mjs  (owner: core) — §19.9 smoke blocks 1, 2, 6 and 9 (9 = the harness's global error
// check), core contracts (ctx shape, modes, MODEL_FIT ±10% (R3), GPU leaks) and the CONTROLS_SPEC §6.1 input layer
// driven by real DOM events: WASD screen-relative moves, RMB click-to-move and LMB swings through the real pick path,
// the pointer model, Ctrl+RMB queueing, wheel zoom, no pointer lock / Esc pauses directly, presets + input:scheme,
// the 24 px/s idle threshold, and phones (hasTouch + isMobile 390×844 and 844×390): real touchscreen taps → tap
// orders, the floating joystick, haptics. Screenshots: tests/shots/core/.
const LEVEL_IDS = ['meadow', 'forest', 'town', 'gate', 'bog', 'keep'];
const CTX_KEYS = ['game', 'bus', 'config', 'renderer', 'scene', 'camera', 'input', 'assets', 'actors', 'state', 'rng',
  'physics', 'combat', 'cam', 'player', 'enemies', 'companions', 'levels', 'env', 'objectives', 'strings', 'fx', 'audio',
  'story', 'ui', 'save', 'postfx', 'quality', 'params'];

const pos = async (t) => (await t.state()).player.pos;
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
/** Poll `fn` in the page until truthy (or `ms` passes); returns the last value. */
async function until(t, fn, arg, ms = 6000) {
  const t0 = Date.now();
  let v = await t.G(fn, arg);
  while (!v && Date.now() - t0 < ms) { await t.wait(100); v = await t.G(fn, arg); }
  return v;
}
/**
 * WA §2.3a frame targets (binding; core.W4). luma [min, max], dark max, black max (fraction), R − B [min, max],
 * fog HSV sat min. Each row is measured at the level's start spawn with the preset applied instantly.
 */
export const WARM_ROWS = [
  { preset: 'meadow_morning', level: 'meadow', band: { luma: [0.52, 0.62], dark: 0.06, black: 0.005, rb: [0.08, 0.16], fogSat: 0.15 } },
  { preset: 'meadow_day', level: 'meadow', band: { luma: [0.52, 0.60], dark: 0.06, black: 0.005, rb: [0.08, 0.14], fogSat: 0.15 } },
  { preset: 'meadow_evening', level: 'meadow', band: { luma: [0.48, 0.58], dark: 0.08, black: 0.005, rb: [0.12, 0.20], fogSat: 0.18 } },
  { preset: 'meadow_giggle', level: 'meadow', band: { luma: [0.44, 1], dark: 0.10, black: 0.005, rb: [-0.02, 1], fogSat: 0.15 } },
  { preset: 'meadow_night', level: 'meadow', band: { luma: [0.36, 1], dark: 0.15, black: 0.005, rb: [-0.06, 1], fogSat: 0.25 } },
  { preset: 'sky_night', level: 'meadow', band: { luma: [0.36, 1], dark: 0.15, black: 0.005, rb: [-0.06, 1], fogSat: 0.25 } },
  { preset: 'ending_gold', level: 'meadow', band: { luma: [0.55, 0.65], dark: 0.05, black: 0.005, rb: [0.12, 0.20], fogSat: 0.18 } },
  { preset: 'forest_day', level: 'forest', band: { luma: [0.48, 0.58], dark: 0.08, black: 0.005, rb: [0.06, 0.14], fogSat: 0.12 } },
  { preset: 'forest_twilight', level: 'forest', band: { luma: [0.36, 1], dark: 0.15, black: 0.005, rb: [0, 1], fogSat: 0.25 } },
  { preset: 'town_occupied', level: 'town', band: { luma: [0.50, 0.60], dark: 0.06, black: 0.005, rb: [0.08, 0.16], fogSat: 0.15 } },
  { preset: 'hub_gold', level: 'town', band: { luma: [0.50, 0.60], dark: 0.06, black: 0.005, rb: [0.08, 0.16], fogSat: 0.15 } },
  { preset: 'hub_hush', level: 'town', band: { luma: [0.44, 1], dark: 0.10, black: 0.005, rb: [-0.02, 1], fogSat: 0.12 } },
  { preset: 'gate_dusk', level: 'gate', band: { luma: [0.50, 0.58], dark: 0.08, black: 0.005, rb: [0.10, 0.16], fogSat: 0.18 } },
  { preset: 'bog_dusk', level: 'bog', band: { luma: [0.40, 1], dark: 0.12, black: 0.005, rb: [-0.04, 1], fogSat: 0.15 } },
  { preset: 'keep_twilight', level: 'keep', band: { luma: [0.36, 1], dark: 0.15, black: 0.005, rb: [0, 1], fogSat: 0.20 } },
  { preset: 'keep_cellar', level: 'keep', band: { luma: [0.38, 1], dark: 0.12, black: 0.005, rb: [0.04, 1], fogSat: 0.20 } },
  { preset: 'keep_storm', level: 'keep', band: { luma: [0.34, 1], dark: 0.18, black: 0.01, rb: [0, 1], fogSat: 0.12 } },
];

/** The WA §2.3a metrics of a frameStats() result that miss their band (empty = pass). */
export function warmFailures(s, b) {
  const f = [];
  if (!(s.luma >= b.luma[0] && s.luma <= b.luma[1])) f.push(`luma ${s.luma.toFixed(3)} ∉ [${b.luma}]`);
  if (!(s.dark <= b.dark)) f.push(`dark ${(s.dark * 100).toFixed(1)} % > ${b.dark * 100} %`);
  if (!(s.black < b.black)) f.push(`black ${(s.black * 100).toFixed(2)} % ≥ ${b.black * 100} %`);
  if (!(s.warmth >= b.rb[0] && s.warmth <= b.rb[1])) f.push(`R−B ${s.warmth.toFixed(3)} ∉ [${b.rb}]`);
  if (s.fogSat != null && !(s.fogSat >= b.fogSat)) f.push(`fog sat ${s.fogSat.toFixed(2)} < ${b.fogSat}`);
  return f;
}

/** CSS px of world (x, z) on the main page. */
const screenOf = (t, x, z) => t.G(([a, b]) => window.__GAME__.screen(a, b), [x, z]);

export default [
  {
    name: 'core:boot', order: 0, level: null,
    async run(t) {
      const s = await t.G((keys) => {
        const g = window.__GAME__, c = g.ctx, missing = keys.filter((k) => c[k] == null);
        return { missing, level: g.levelId, mode: g.mode, events: [...g.events], ready: g.ready,
          iso: c.input.iso, lock: c.input.pointerLockEnabled, preset: c.input.preset, cam: c.params.cam ?? null,
          api: ['takeClick', 'addTap', 'addZoom', 'consumeZoom', 'setVirtualAim', 'haptic'].filter((k) => typeof c.input[k] !== 'function'),
          hooks: ['click', 'tapAt', 'aimAt', 'order', 'fogAt', 'screen'].filter((k) => typeof g[k] !== 'function'),
          camIso: g.cam.iso?.() ?? null };
      }, CTX_KEYS);
      t.assert(s.missing.length === 0, `ctx missing: ${s.missing.join(', ')}`);
      t.assert(s.level === 'meadow', `boot level is ${s.level}, expected meadow`);
      t.assert(s.events.includes('game:ready') && s.events.includes('level:loaded'), 'game:ready / level:loaded not in __GAME__.events');
      t.assert(s.iso && !s.lock, `iso controls by default, no pointer lock (iso ${s.iso}, lock ${s.lock})`);
      t.assert(s.preset === 'hybrid', `default preset hybrid (got ${s.preset})`);
      t.assert(s.api.length === 0, `ctx.input missing §6.1 API: ${s.api.join(', ')}`);
      t.assert(s.hooks.length === 0, `__GAME__ missing §12 core 5 hooks: ${s.hooks.join(', ')}`);
      t.assert(!!s.camIso && Number.isFinite(s.camIso.dist), '__GAME__.cam.iso() returns the framing');
      t.log(`boot mode=${s.mode} cam=${s.cam ?? 'iso'} yaw=${s.camIso?.yaw?.toFixed(2)} d=${s.camIso?.dist?.toFixed(1)} catPx=${s.camIso?.catPx?.toFixed(1)}`);
    },
  },
  {
    // S1 (PERF C3/C6/C11, ART §3.1–3.2, K1): play renders straight to an antialiased canvas with Neutral tone mapping,
    // no post chain on Low / Med, the toon chunks patched, shader checks on under ?test, and a warm (never grey) clear.
    name: 'core:render', order: 1, level: 'meadow', spawn: 'start',
    async run(t) {
      const r = await t.G(() => {
        const g = window.__GAME__, c = g.ctx, R = c.renderer, T = g.THREE, attrs = R.getContext().getContextAttributes();
        const bg = c.scene.background?.isColor ? '#' + c.scene.background.getHexString() : null;
        const p = g.perf();
        return { aa: attrs.antialias, tm: R.toneMapping === T.NeutralToneMapping, checks: R.debug.checkShaderErrors,
          toon: /toonRamp/.test(T.ShaderChunk.lights_pars_begin), chain: !!c.postfx.chain, composer: c.postfx.composer,
          active: c.postfx.composerActive, q: c.postfx.qualityName, bg, path: p.path, stage: p.stage, calls: p.calls,
          splash: !!document.getElementById('splash') && !document.getElementById('splash').classList.contains('out'),
          marks: performance.getEntriesByName('play').length + performance.getEntriesByName('title').length };
      });
      t.assert(r.aa, 'canvas antialias is off (X1: on for every tier)');
      t.assert(r.tm, 'tone mapping is not Neutral (K1)');
      t.assert(r.checks === true, 'checkShaderErrors must stay on under ?test (PERF §3.2)');
      t.assert(r.toon, 'toon chunks not installed before the first compile');
      t.assert(r.q === 'high' || (!r.chain && !r.active && r.composer == null), `a post chain exists in play on ${r.q} (K1)`);
      t.assert(r.path === 'canvas', `render path ${r.path} in play (want canvas)`);
      t.assert(!r.splash, 'the warm splash still covers the game after boot');
      t.assert(r.marks >= 1, 'no performance.mark title / play');
      t.assert(r.bg && r.bg !== '#b7c0c3', `scene background ${r.bg} (never the old grey)`);
      t.log(`render: aa ${r.aa}, Neutral ${r.tm}, path ${r.path}, q ${r.q}, bg ${r.bg}, calls ${r.calls} [${r.stage}]`);
    },
  },
  {
    // WASD is screen-relative (W = screen-up = +Z at yaw π), RMB = a move order (real mouse events), LMB = swing
    name: 'core:move', order: 10, level: 'meadow', spawn: 'start',
    async run(t) {
      const { page } = t;
      const yaw = await t.G(() => window.__GAME__.cam.iso().yaw);
      const p0 = await pos(t);
      await t.hold('KeyW', 1200);
      await t.frames(3);
      const p1 = await pos(t);
      const moved = dist2(p0, p1);
      t.assert(moved >= 1, `player did not move with W (${moved.toFixed(2)} m)`);
      // screen-up = away from the lens: the ground direction (−sin yaw, −cos yaw)… = +Z at yaw π
      const up = [-Math.sin(yaw), -Math.cos(yaw)];
      const along = ((p1[0] - p0[0]) * up[0] + (p1[2] - p0[2]) * up[1]) / Math.max(moved, 1e-6);
      t.assert(along > 0.8, `W walks screen-up (cos ${along.toFixed(2)} to the screen-up ground direction at yaw ${yaw.toFixed(2)})`);
      await t.shot('core/01-wasd');

      // RMB on the ground: a real right click at the projected point → a move order → she arrives
      const goal = [p1[0] - 1.5, p1[2] + 3];
      const s = await screenOf(t, goal[0], goal[1]);
      t.assert(!!s && s.x > 0 && s.y > 0, `goal projects on screen (${JSON.stringify(s)})`);
      await t.clearEvents();
      await page.mouse.move(Math.round(s.x), Math.round(s.y));
      await page.mouse.down({ button: 'right' }); await t.wait(60); await page.mouse.up({ button: 'right' });
      const order = await until(t, () => window.__GAME__.lastEvent('player:order'), null, 3000);
      t.assert(!!order && order.kind === 'move' && order.valid !== false, `RMB issues a move order (${JSON.stringify(order && { kind: order.kind, valid: order.valid })})`);
      await t.wait(250);
      await t.shot('core/02-rmb-order');
      const arrived = await until(t, (g) => { const p = window.__GAME__.ctx.player.pos; return Math.hypot(p.x - g[0], p.z - g[1]) < 0.8; }, goal, 8000);
      const p2 = await pos(t);
      t.assert(!!arrived, `RMB move order arrives (${dist2(p2, [goal[0], 0, goal[1]]).toFixed(2)} m off)`);

      // LMB = attack toward the cursor: three real left clicks = the 3-hit combo (and no pointer lock is taken)
      const aim = await screenOf(t, p2[0] + 2, p2[2]);
      await page.mouse.move(Math.round(aim.x), Math.round(aim.y));
      await t.clearEvents();
      for (let i = 0; i < 3; i++) { await page.mouse.down({ button: 'left' }); await t.wait(50); await page.mouse.up({ button: 'left' }); await t.wait(230); }
      await t.wait(600);
      const swings = (await t.events()).filter((e) => e === 'player:swing').length;
      t.assert(swings >= 3, `3-hit combo with LMB: expected ≥ 3 player:swing, got ${swings}`);
      t.assert(!(await page.evaluate(() => !!document.pointerLockElement)), 'LMB must not capture the mouse in iso (C2)');
      const face = await t.G(() => window.__GAME__.ctx.player.facing ?? window.__GAME__.ctx.player.yaw ?? null);
      if (face != null) t.assert(Math.abs(Math.sin(face) - 1) < 0.35, `she swings toward the cursor (+X; facing ${face.toFixed(2)})`);
      // J still swings (alias)
      await t.clearEvents(); await t.wait(500);
      await t.tap('KeyJ', 1);
      await t.wait(300);
      t.assert((await t.events()).includes('player:swing'), 'J still attacks (alias)');
      await t.shot('core/03-lmb-combo');
      t.log(`W ${moved.toFixed(2)} m (cos ${along.toFixed(2)}), RMB order ok ${!!arrived}, LMB swings ${swings}`);
    },
  },
  {
    name: 'core:modes', order: 11, level: 'meadow', spawn: 'start',
    async run(t) {
      await t.setMode('cutscene');
      const a = await pos(t);
      await t.hold('KeyW', 500);
      const b = await pos(t);
      t.assert(dist2(a, b) < 0.05, 'player moved during mode "cutscene" (non-scripted actors must freeze)');
      await t.setMode('menu');
      await t.setMode('play');
      const ev = await t.events();
      t.assert(ev.includes('game:mode') && ev.includes('game:pause'), 'game:mode / game:pause not emitted');
      await t.hold('KeyW', 400);
      const c = await pos(t);
      t.assert(dist2(b, c) > 0.3, 'player did not move after returning to mode "play"');
    },
  },
  {
    // §6.1: no pointer lock in iso; Esc pauses directly (no lock-loss dance); the look is swallowed (C2)
    name: 'core:esc', order: 12, level: 'meadow', spawn: 'start',
    async run(t) {
      const { page } = t;
      await page.mouse.move(640, 360);
      await page.mouse.down({ button: 'left' }); await page.mouse.up({ button: 'left' });
      await t.frames(4);
      t.assert(!(await page.evaluate(() => !!document.pointerLockElement)), 'a click in play does not request pointer lock');
      for (let i = 1; i <= 8; i++) await page.mouse.move(640 + i * 30, 360 - i * 10);
      const look = await t.G(() => ({ ...window.__GAME__.ctx.input.consumeLook() }));
      t.assert(look.x === 0 && look.y === 0, `consumeLook() is zero in iso (${JSON.stringify(look)})`);
      await t.clearEvents();
      await t.tap('Escape');
      const paused = await until(t, () => window.__GAME__.ctx.game.mode === 'menu' && !!window.__GAME__.ctx.ui.menus?.paused, null, 3000);
      t.assert(!!paused, 'Esc opens the pause menu directly');
      const ev = await t.events();
      t.assert(ev.includes('game:pause') && !ev.includes('input:pointerLock'), 'game:pause, and no input:pointerLock churn');
      await t.shot('core/04-esc-pause');
      await t.G(() => window.__GAME__.ctx.ui.resume());
      const back = await until(t, () => window.__GAME__.ctx.game.mode === 'play', null, 3000);
      t.assert(!!back, 'resume returns to play');
      t.assert(!(await page.evaluate(() => !!document.pointerLockElement)), 'resume does not capture the mouse');
    },
  },
  {
    // the §6.1 pointer model, Ctrl+RMB queueing, the wheel zoom and the 24 px/s idle threshold
    name: 'core:pointer', order: 13, level: 'meadow', spawn: 'start',
    async run(t) {
      const { page } = t;
      const vp = page.viewportSize();
      await page.mouse.move(Math.round(vp.width / 2), Math.round(vp.height / 2));
      await page.mouse.move(Math.round(vp.width / 2) + 2, Math.round(vp.height / 2));
      const P = await t.G(() => { const p = window.__GAME__.ctx.input.pointer; return { ...p, cg: window.__GAME__.ctx.cam.cursorValid ?? null }; });
      t.assert(P.inside && Math.abs(P.ndcX) < 0.05 && Math.abs(P.ndcY) < 0.05, `pointer at the centre: ndc (${P.ndcX.toFixed(3)}, ${P.ndcY.toFixed(3)}) inside ${P.inside}`);
      t.assert(P.x === Math.round(vp.width / 2) + 2, `pointer.x in CSS px (${P.x})`);

      // Ctrl+RMB queues behind the current order
      const p0 = await pos(t);
      const a = await screenOf(t, p0[0], p0[2] + 5), b = await screenOf(t, p0[0] + 3, p0[2] + 5);
      await t.clearEvents();
      await page.mouse.move(Math.round(a.x), Math.round(a.y));
      await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
      await t.wait(150);
      await page.keyboard.down('ControlLeft');
      await page.mouse.move(Math.round(b.x), Math.round(b.y));
      await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
      await page.keyboard.up('ControlLeft');
      const q = await until(t, () => { const e = window.__GAME__.lastEvent('player:order'); return e && e.queued ? e : null; }, null, 2000);
      t.assert(!!q, 'Ctrl+RMB queues an order (player:order queued: true)');
      await t.wait(300);
      await t.shot('core/05-queued');
      // the picker may snap the clicked point to the nearest walkable cell: walk to where the queued order points
      const qp = await t.G(() => { const o = window.__GAME__.ctx.player.orders; const q = o.queue?.[o.queue.length - 1] ?? o.point; return q ? [q.x, q.z] : null; });
      const end = await until(t, ([g]) => { const o = window.__GAME__.ctx.player.orders, p = window.__GAME__.ctx.player.pos; return !o.kind && !o.queue.length && Math.hypot(p.x - g[0], p.z - g[1]) < 0.9; }, [qp], 10000);
      const pe = await pos(t);
      t.assert(!!qp && !!end, `she walks the queued leg too (at ${pe[0].toFixed(1)}, ${pe[2].toFixed(1)}; queued ${JSON.stringify(qp)})`);

      // the wheel zooms (no target switching in iso) and emits camera:zoom
      const z0 = await t.G(() => window.__GAME__.cam.iso().zoom);
      await t.clearEvents();
      await page.mouse.move(Math.round(vp.width / 2), Math.round(vp.height / 2));
      await page.mouse.wheel(0, 120); await t.frames(6);
      await page.mouse.wheel(0, 120); await t.frames(6);
      const z1 = await t.G(() => window.__GAME__.cam.iso().zoom);
      const zev = await t.lastEvent('camera:zoom');
      t.assert(!!zev && Math.abs(z1 - z0) > 0.05, `wheel zooms (mul ${z0.toFixed(2)} → ${z1.toFixed(2)}; camera:zoom ${JSON.stringify(zev)})`);
      t.assert(!(await t.events()).includes('target:changed'), 'the wheel no longer switches targets');
      await t.shot('core/06-wheel-zoom');
      await t.G(() => window.__GAME__.cam.zoom(1));

      // a resting hand (≈ 8 px/s drift) never counts as activity; a real move does
      await t.wait(300);
      const i0 = await t.G(() => window.__GAME__.ctx.input.idleTime);
      let x = Math.round(vp.width / 2);
      for (let k = 0; k < 12; k++) { x += 1; await page.mouse.move(x, Math.round(vp.height / 2)); await t.wait(125); }
      const i1 = await t.G(() => window.__GAME__.ctx.input.idleTime);
      t.assert(i1 > i0 + 1.0, `slow drift keeps idling (idle ${i0.toFixed(2)} → ${i1.toFixed(2)} s)`);
      for (let k = 1; k <= 6; k++) await page.mouse.move(x + k * 40, Math.round(vp.height / 2) - k * 15);
      await t.frames(3);
      const i2 = await t.G(() => window.__GAME__.ctx.input.idleTime);
      t.assert(i2 < 0.2, `a real mouse move resets idle (${i2.toFixed(2)} s)`);
      t.log(`zoom ${z0.toFixed(2)}→${z1.toFixed(2)}, idle drift ${i0.toFixed(2)}→${i1.toFixed(2)}, after move ${i2.toFixed(2)}`);
    },
  },
  {
    // §6.2 presets: Settings → Controls swaps the table live (input:scheme); moba turns WASD off; rebinding wins
    name: 'core:presets', order: 14, level: 'meadow', spawn: 'start',
    async run(t) {
      const setPreset = (name) => t.G((n) => { const c = window.__GAME__.ctx; c.state.settings.controlPreset = n; c.bus.emit('settings:changed', { key: 'controlPreset', value: n }); return c.input.preset; }, name);
      try {
        await t.clearEvents();
        t.assert((await setPreset('moba')) === 'moba', 'moba preset applied');
        t.assert((await t.events()).includes('input:scheme'), 'input:scheme fires on a preset change');
        const a = await pos(t);
        await t.hold('KeyW', 500);
        const b = await pos(t);
        t.assert(dist2(a, b) < 0.1, `moba: W does not move her (${dist2(a, b).toFixed(2)} m)`);
        const bind = await t.G(() => ({ a: window.__GAME__.ctx.input.codesFor('attackMove'), s: window.__GAME__.ctx.input.codesFor('stop') }));
        t.assert(bind.a.includes('KeyA') && bind.s.includes('KeyS'), `moba: A = attack-move, S = stop (${JSON.stringify(bind)})`);
        await setPreset('diablo');
        t.assert(await t.G(() => window.__GAME__.ctx.input.lmbMoves && window.__GAME__.ctx.input.codesFor('move').includes('Mouse0')), 'diablo: LMB moves');
        // a rebinding on top of the preset: jump on G
        await setPreset('hybrid');
        await t.G(() => { const c = window.__GAME__.ctx; c.state.settings.bindings = { jump: ['KeyG'] }; c.bus.emit('settings:changed', { key: 'bindings', value: c.state.settings.bindings }); });
        await t.clearEvents();
        await t.tap('KeyG'); await t.wait(250);
        t.assert((await t.events()).includes('player:jump'), 'rebinding: G jumps');
      } finally {
        await t.G(() => { const c = window.__GAME__.ctx; c.state.settings.bindings = {}; c.state.settings.controlPreset = 'hybrid'; c.bus.emit('settings:changed', { key: 'controlPreset', value: 'hybrid' }); });
      }
      await t.wait(400);
      await t.clearEvents();
      await t.tap('KeyF'); await t.wait(250);
      t.assert((await t.events()).includes('player:jump'), 'hybrid: F jumps (C1)');
      await t.wait(700);
      await t.clearEvents();
      await t.page.keyboard.down('Space'); await t.wait(300);
      const guard = await t.G(() => window.__GAME__.ctx.input.down('guard'));
      await t.page.keyboard.up('Space');
      t.assert(guard && !(await t.events()).includes('player:jump'), 'hybrid: Space = the Stand, not jump (C1)');
    },
  },
  {
    // phones: a real touchscreen session per orientation (hasTouch + isMobile)
    name: 'core:touch', order: 15, level: null, timeout: 420000,
    async run(t) {
      for (const [w, h, tag] of [[390, 844, 'portrait'], [844, 390, 'landscape']]) {
        const s = await t.viewport(w, h, { touch: true });
        try {
          await s.page.touchscreen.tap(Math.round(w * 0.62), Math.round(h * 0.35));     // first touch → device 'touch'
          await s.G(() => { const g = window.__GAME__; g.story.skip?.(); g.setMode('play'); g.god(true); g.ctx.ui.touch?.enable?.(true); g.ctx.player.orders?.clear?.('smoke'); });
          await s.page.waitForTimeout(400);
          const s0 = await s.G(() => { const c = window.__GAME__.ctx; return { dev: c.input.device, lock: c.input.pointerLockEnabled, iso: window.__GAME__.cam.iso(), cluster: document.querySelectorAll('.touch-cluster .tbtn:not(.is-hidden)').length }; });
          t.log(`${tag}: device ${s0.dev}, d ${s0.iso.dist.toFixed(1)}, fov ${s0.iso.fov}, catPx ${s0.iso.catPx.toFixed(1)}, cluster ${s0.cluster}`);
          t.assert(s0.dev === 'touch', `${tag}: the first touch makes the device 'touch' (${s0.dev})`);
          t.assert(!s0.lock, `${tag}: no pointer lock`);
          t.assert(s0.iso.catPx >= (tag === 'portrait' ? 28 : 30) - 0.5, `${tag}: she stays ≥ ${tag === 'portrait' ? 28 : 30} px tall (${s0.iso.catPx.toFixed(1)})`);
          await s.shot(`core/touch-${tag}-01`);

          // a real tap on the ground ahead: input.addTap → a 'tap' click → a move order → she arrives
          const p0 = await s.G(() => window.__GAME__.ctx.player.pos.toArray());
          const goal = [p0[0] + 1.2, p0[2] + 3.2];
          await s.G(() => window.__GAME__.clearEvents());
          const tp = await s.tapAt(goal[0], goal[1]);
          t.assert(!!tp, `${tag}: the goal projects on screen`);
          let order = null;
          for (let k = 0; k < 30 && !order; k++) { await s.page.waitForTimeout(100); order = await s.G(() => window.__GAME__.lastEvent('player:order')); }
          t.assert(!!order && order.kind === 'move', `${tag}: a ground tap issues a move order (${JSON.stringify(order && { kind: order.kind, valid: order.valid })})`);
          let arrived = false;
          for (let k = 0; k < 80 && !arrived; k++) { await s.page.waitForTimeout(100); arrived = await s.G((g) => { const p = window.__GAME__.ctx.player.pos; return Math.hypot(p.x - g[0], p.z - g[1]) < 0.9; }, goal); }
          t.assert(arrived, `${tag}: tap-to-move arrives`);
          await s.shot(`core/touch-${tag}-02-tap-move`);

          // the floating joystick (left zone): drag up → she walks screen-up, and the stick overrides any order
          const sx = Math.round(w * 0.18), sy = Math.round(h * 0.86);
          const p1 = await s.G(() => window.__GAME__.ctx.player.pos.toArray());
          const down = await s.touch('pointerdown', sx, sy);
          for (let k = 1; k <= 6; k++) await s.touch('pointermove', sx, sy - k * 12);
          await s.page.waitForTimeout(900);
          const mv = await s.G(() => ({ ...window.__GAME__.ctx.input.virtualMove }));
          await s.shot(`core/touch-${tag}-03-stick`);
          await s.touch('pointerup', sx, sy - 72);
          const p2 = await s.G(() => window.__GAME__.ctx.player.pos.toArray());
          t.assert(mv.y > 0.5, `${tag}: the joystick drives input.virtualMove (y ${mv.y?.toFixed?.(2)}; down on ${down})`);
          t.assert(p2[2] - p1[2] > 1.0, `${tag}: the joystick walks her up-screen (Δz ${(p2[2] - p1[2]).toFixed(2)})`);
          const rest = await s.G(() => ({ ...window.__GAME__.ctx.input.virtualMove }));
          t.assert(rest.x === 0 && rest.y === 0, `${tag}: releasing the stick stops her input`);

          // §10.6 haptics on a phone: a parry buzzes navigator.vibrate with the parry pattern
          const vib = await s.G(() => {
            const c = window.__GAME__.ctx, calls = [];
            const prev = navigator.vibrate;
            navigator.vibrate = (p) => { calls.push(p); return true; };
            try { c.bus.emit('player:parry', { gold: false }); c.bus.emit('player:order', { kind: 'move', valid: false }); } finally { navigator.vibrate = prev; }
            return { calls, want: [c.config.HAPTICS?.parry ?? null, c.config.HAPTICS?.orderRejected ?? null] };
          });
          t.assert(vib.calls.length === 2 && JSON.stringify(vib.calls) === JSON.stringify(vib.want), `${tag}: haptics vibrate on parry / rejected order (${JSON.stringify(vib)})`);
        } finally { await s.close(); }
      }
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
        await t.shot(`core/lvl-${id}`);
        await t.blankCheck(`lvl-${id}`);
        t.log(`${id}: calls ${s.calls} tris ${s.tris} q=${s.quality}`);
        if (s.calls > 150) t.warn(`${id}: draw calls ${s.calls} over the Med budget (150)`);
      }
      await t.loadLevel('meadow', 'start');
    },
  },
  {
    // core.W4 (WA §2.3a): one frame per preset row; mean luma, dark % (< 0.2), black % (< 0.06), R − B and the fog's
    // HSV saturation, all on a 64 × 36 readback with actors excluded. A row outside its band may not ship; the fix is
    // preset data (world Env), never a post pass. Screenshots: tests/shots/core/warm-<preset>.png.
    name: 'art:warm', order: 63, level: null, timeout: 600000,
    async run(t) {
      let last = null;
      for (const row of WARM_ROWS) {
        if (row.level !== last) {
          await t.loadLevel(row.level, 'start');
          await t.G(() => { const g = window.__GAME__; g.story.skip?.(); g.skipDialog?.(); g.setMode('play'); g.god(true); });
          last = row.level;
        }
        const ok = await t.G((p) => { const e = window.__GAME__.ctx.env; e.preset(p, 0); return e.presetName; }, row.preset);
        await t.frames(30);
        const s = await t.G(() => window.__GAME__.art.frameStats({ exclude: 'actors' }));
        await t.shot(`core/warm-${row.preset}`);
        const b = row.band, tag = `${row.preset} (${row.level})`;
        const fails = warmFailures(s, b);
        t.log(`${tag}${ok !== row.preset ? ` [env reports ${ok}]` : ''}: luma ${s.luma.toFixed(3)} dark ${(s.dark * 100).toFixed(1)}% black ${(s.black * 100).toFixed(2)}% R−B ${s.warmth.toFixed(3)} fogSat ${s.fogSat?.toFixed(2)}${fails.length ? '  ✗ ' + fails.join('; ') : '  ✓'}`);
        for (const f of fails) t.fail(`art:warm ${tag}: ${f}`);
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
