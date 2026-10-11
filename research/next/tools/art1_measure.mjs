// art_1 measurement: per-character draw calls, material kinds, frame time with/without fur shells.
// Usage: node research/next/tools/art1_measure.mjs http://localhost:5391/
import { chromium } from 'playwright';
const url = (process.argv[2] || 'http://localhost:5391/') + '?test=1&seed=1';
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(url);
await p.waitForFunction(() => window.__GAME__?.ready, null, { timeout: 180000 });
const out = await p.evaluate(async () => {
  const G = window.__GAME__, { ctx } = G;
  G.god(true); try { G.story.skip(); } catch (e) {} await G.waitFrames(30); try { G.setMode("play"); } catch (e) {} await G.waitFrames(60);
  const pp = ctx.player.pos;
  for (const [t, dx, dz] of [['rat_pike', 3, 3], ['rat_pike', -3, 3], ['rat_xbow', 0, 5], ['crow', 2, -3]]) { try { G.spawn(t, pp.x + dx, pp.z + dz); } catch (e) {} }
  await G.waitFrames(90);
  const stat = (root) => { const r = { meshes: 0, inst: 0, skinned: 0, tris: 0, mats: {} };
    root.traverseVisible((o) => { if (!o.isMesh && !o.isLine && !o.isLineSegments) return; r.meshes++; if (o.isInstancedMesh) r.inst++; if (o.isSkinnedMesh) r.skinned++;
      const g = o.geometry; const n = g.index ? g.index.count / 3 : (g.attributes.position?.count || 0) / 3; r.tris += Math.round(n * (o.isInstancedMesh ? o.count : 1));
      for (const m of [].concat(o.material)) r.mats[m.type] = (r.mats[m.type] || 0) + 1; }); return r; };
  const playerRoot = ctx.player.view?.root || ctx.player.model?.root || ctx.player.root || ctx.player.object3d || ctx.player.mesh;
  const res = { cam: { pos: ctx.cam?.camera?.position?.toArray?.() ?? ctx.camera?.position?.toArray?.(), mode: ctx.cam?.modeName ?? null } };
  res.mode = G.mode; res.camDist = ctx.cam?.camera ? ctx.cam.camera.position.distanceTo(ctx.player.pos) : null; res.player = playerRoot ? stat(playerRoot) : 'no root (' + Object.keys(ctx.player).slice(0, 40).join(',') + ')';
  res.enemies = (ctx.enemies.list || []).map((e) => ({ type: e.def?.id || e.type, ...stat(e.root || e.object3d || e.group) }));
  const time = async (n = 150) => { const t = []; let last = performance.now();
    await new Promise((res2) => { let k = 0; const f = () => { const now = performance.now(); t.push(now - last); last = now; if (++k < n) requestAnimationFrame(f); else res2(); }; requestAnimationFrame(f); });
    t.sort((a, b) => a - b); return { med: +t[n >> 1].toFixed(2), p90: +t[(n * 0.9) | 0].toFixed(2) }; };
  res.base = { ...G.state(), t: await time() };
  // GPU-ish cost of the player alone
  if (playerRoot) { playerRoot.visible = false; await G.waitFrames(5); res.noPlayer = { calls: G.state().calls, tris: G.state().tris, t: await time() }; playerRoot.visible = true; }
  for (const e of ctx.enemies.list || []) { const r = e.root || e.object3d || e.group; if (r) r.visible = false; }
  await G.waitFrames(5); res.noEnemies = { calls: G.state().calls, t: await time() };
  for (const e of ctx.enemies.list || []) { const r = e.root || e.object3d || e.group; if (r) r.visible = true; }
  // fur shells forced off / ultra
  const fur = await import('/src/characters/Fur.js');
  fur.setFurQuality('off'); await G.waitFrames(5); res.furOff = { ...G.state(), t: await time() };
  fur.setFurQuality('ultra'); fur.FUR_LOD.far = 1e9; fur.FUR_LOD.near = 1e9; await G.waitFrames(5); res.furUltraNoLod = { ...G.state(), t: await time() };
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
