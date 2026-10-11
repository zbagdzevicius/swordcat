// perf_1 measurement: per level, render-cost ablation under the classic camera and an iso pose (CONTROLS_SPEC §2.1:
// fov 38, d 13 m, pitch 51.3°, near 0.3, far 90). Synchronous timed renders (gl readPixels 1px = GPU sync).
// Usage: node research/next/tools/perf1_measure.mjs [url] [gpu=d3d11]
import { chromium } from 'playwright';
const URL = process.argv[2] ?? 'http://localhost:5802/';
const GPU = process.argv[3] ?? 'default';
const ARGS = { d3d11: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'], default: ['--enable-gpu', '--ignore-gpu-blocklist'] }[GPU];
const LEVELS = (process.env.LEVELS ?? 'meadow,forest,town,gate').split(',');
const W = +(process.env.W ?? 1920), H = +(process.env.H ?? 1080);

const browser = await chromium.launch({ headless: true, args: ARGS });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${URL}?test=1&seed=1`, { timeout: 180000 });
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 120000 });
const gpu = await page.evaluate(() => { const gl = window.__GAME__.ctx.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
console.log('GPU', gpu, `${W}x${H}`);

for (const id of LEVELS) {
  await page.evaluate(async (id) => { await window.__GAME__.loadLevel(id); }, id);
  await page.evaluate(() => window.__GAME__.waitFrames(90));
  const r = await page.evaluate(async () => {
    const G = window.__GAME__, { ctx, THREE } = G, R = ctx.renderer, gl = R.getContext(), pf = ctx.postfx;
    G.setMode('play');
    const px = new Uint8Array(4);
    const cam = ctx.camera, saved = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov, near: cam.near, far: cam.far };
    const pp = ctx.player.pos.clone();
    const poseIso = () => {
      const d = 13, pitch = 51.3 * Math.PI / 180, yaw = Math.PI;
      const f = pp.clone().add(new THREE.Vector3(0, 0.6, 0));
      cam.fov = 38; cam.near = 0.3; cam.far = 90; cam.updateProjectionMatrix();
      cam.position.set(f.x + Math.sin(yaw) * Math.cos(pitch) * d, f.y + Math.sin(pitch) * d, f.z + Math.cos(yaw) * Math.cos(pitch) * d);
      cam.lookAt(f); cam.updateMatrixWorld(true);
    };
    const poseClassic = () => { cam.position.copy(saved.p); cam.quaternion.copy(saved.q); cam.fov = saved.fov; cam.near = saved.near; cam.far = saved.far; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); };
    const sun = ctx.env?.sunLight;
    const time = (fn, n = 40) => {
      for (let i = 0; i < 5; i++) { fn(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      const ts = [];
      for (let i = 0; i < n; i++) { const t0 = performance.now(); fn(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); }
      ts.sort((a, b) => a - b); return +ts[n >> 1].toFixed(2);
    };
    const info = R.info.render;
    const stat = (fn) => { const c0 = info.calls, t0 = info.triangles; fn(); return { calls: info.calls - c0, tris: info.triangles - t0 }; };
    const full = () => pf.render(1 / 60);
    const sceneOnly = () => R.render(ctx.scene, cam);
    const withShadows = (on, fn) => () => { const a = R.shadowMap.enabled, b = sun?.castShadow; R.shadowMap.enabled = on; if (sun) sun.castShadow = on; R.shadowMap.needsUpdate = true; fn(); R.shadowMap.enabled = a; if (sun) sun.castShadow = b; };
    // breakdown of visible draws (frustum test per object, like the renderer)
    const breakdown = () => {
      const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      const cats = {}; const add = (k, n = 1, tris = 0) => { const c = cats[k] ??= { draws: 0, tris: 0 }; c.draws += n; c.tris += tris; };
      ctx.scene.traverseVisible((o) => {
        if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
        if (o.frustumCulled && o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if (!fr.intersectsObject(o)) return; }
        const mats = Array.isArray(o.material) ? o.material.length : 1;
        const g = o.geometry, idx = g?.index ? g.index.count : g?.attributes?.position?.count ?? 0;
        const inst = o.isInstancedMesh ? o.count : (g?.instanceCount && g.instanceCount !== Infinity ? g.instanceCount : 1);
        const tris = (idx / 3) * inst;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        let k = o.isSkinnedMesh ? 'skinned' : o.isBatchedMesh ? 'batched' : o.isInstancedMesh ? 'instanced' : 'mesh';
        const n = (o.name + ' ' + (o.parent?.name ?? '')).toLowerCase();
        if (/fur|shell/.test(n) || m?.userData?.fur || m?.name?.toLowerCase?.().includes('fur')) k = 'fur';
        else if (/grass|wheat|flower/.test(n)) k = 'grass';
        else if (m?.transparent) k += '+transp';
        add(k + ':' + (m?.type ?? '?'), mats, tris);
      });
      return cats;
    };
    const out = { level: G.levelId, programs: R.info.programs?.length, geos: R.info.memory.geometries, tex: R.info.memory.textures };
    for (const [name, pose] of [['classic', poseClassic], ['iso', poseIso]]) {
      pose();
      out[name] = {
        stat: stat(full), statNoShadow: stat(withShadows(false, sceneOnly)),
        msFull: time(full), msNoPost: time(sceneOnly), msNoPostNoShadow: time(withShadows(false, sceneOnly)),
        breakdown: breakdown(),
      };
    }
    // low preset in iso
    const prevQ = pf.qualityName; pf.setQuality('low'); poseIso();
    for (let i = 0; i < 3; i++) pf.render(1 / 60);
    out.isoLow = { stat: stat(full), ms: time(full), dpr: R.getPixelRatio() };
    pf.setQuality(prevQ); poseClassic();
    return out;
  });
  console.log(JSON.stringify(r));
}
await browser.close();
