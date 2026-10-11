// art_1: approximate the CONTROLS_SPEC iso view (13 m, 51.3 deg pitch, FOV 38) and screenshot hero + enemies.
import { chromium } from 'playwright';
const url = (process.argv[2] || 'http://localhost:5391/') + '?test=1&seed=1';
const outDir = process.argv[3] || '.';
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(url, { timeout: 180000 });
await p.waitForFunction(() => window.__GAME__?.ready, null, { timeout: 180000 });
await p.evaluate(async () => {
  const G = window.__GAME__, { ctx, THREE } = G; G.god(true);
  try { G.story.skip(); } catch (e) {} await G.waitFrames(30); G.setMode('play'); await G.waitFrames(30);
  const pp = ctx.player.pos;
  for (const [t, dx, dz] of [['rat_pike', 2.5, 2.5], ['rat_xbow', -2.5, 3], ['crow', 1.5, -2]]) { try { G.spawn(t, pp.x + dx, pp.z + dz); } catch (e) {} }
  for (const e of ctx.enemies.list) { e.update = () => {}; if (e.ai) e.ai = null; }
  await G.waitFrames(30);
  const cam = ctx.cam.camera; const f = pp.clone().add(new THREE.Vector3(0, 0.6, 0));
  const pitch = 51.3 * Math.PI / 180, d = 13;
  window.__pin = () => { cam.fov = 38; cam.updateProjectionMatrix(); cam.position.set(f.x, f.y + Math.sin(pitch) * d, f.z - Math.cos(pitch) * d); cam.lookAt(f); cam.updateMatrixWorld(); };
  const R = ctx.renderer, r0 = R.render.bind(R); R.render = (sc, c) => { if (c === cam) window.__pin(); return r0(sc, c); };
  if (ctx.postfx?.composer) { const c0 = ctx.postfx.composer.render.bind(ctx.postfx.composer); ctx.postfx.composer.render = (...a) => { window.__pin(); return c0(...a); }; }
  if (ctx.postfx?.render) { const p0 = ctx.postfx.render.bind(ctx.postfx); ctx.postfx.render = (...a) => { window.__pin(); return p0(...a); }; }
  await G.waitFrames(20);
});
await p.screenshot({ path: outDir + '/art1_iso_13m.png' });
await p.evaluate(async () => { const { ctx, THREE } = window.__GAME__; window.__pin = ((old) => () => { old(); const c = ctx.cam.camera; c.zoom = 2.5; c.updateProjectionMatrix(); })(window.__pin); await window.__GAME__.waitFrames(10); });
await p.screenshot({ path: outDir + '/art1_iso_13m_zoom3.png' });
await b.close();
