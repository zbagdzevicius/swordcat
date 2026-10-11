// perf_1 ablation: iso pose, scene-only render (no post, shadows on as configured), hide one category at a time.
// Reports median ms with a GPU sync (readPixels 1px) and the CPU-only submit time (no sync).
import { chromium } from 'playwright';
const URL = process.argv[2] ?? 'http://localhost:5802/';
const LEVELS = (process.env.LEVELS ?? 'meadow,gate').split(',');
const W = +(process.env.W ?? 1920), H = +(process.env.H ?? 1080);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(`${URL}?test=1&seed=1`, { timeout: 180000 });
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 120000 });
for (const id of LEVELS) {
  await page.evaluate(async (id) => { await window.__GAME__.loadLevel(id); }, id);
  await page.evaluate(() => window.__GAME__.waitFrames(90));
  const r = await page.evaluate(() => {
    const G = window.__GAME__, { ctx, THREE } = G, R = ctx.renderer, gl = R.getContext(), cam = ctx.camera;
    const px = new Uint8Array(4), pp = ctx.player.pos.clone();
    const d = 13, pitch = 51.3 * Math.PI / 180, f = pp.clone().add(new THREE.Vector3(0, 0.6, 0));
    cam.fov = 38; cam.near = 0.3; cam.far = 90; cam.updateProjectionMatrix();
    cam.position.set(f.x, f.y + Math.sin(pitch) * d, f.z - Math.cos(pitch) * d); cam.lookAt(f); cam.updateMatrixWorld(true);
    const sun = ctx.env?.sunLight;
    const run = (n = 30) => {
      for (let i = 0; i < 4; i++) { R.render(ctx.scene, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      const a = [], c = [];
      for (let i = 0; i < n; i++) { const t0 = performance.now(); R.render(ctx.scene, cam); const t1 = performance.now(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); a.push(performance.now() - t0); c.push(t1 - t0); }
      a.sort((x, y) => x - y); c.sort((x, y) => x - y); return { ms: +a[n >> 1].toFixed(1), cpu: +c[n >> 1].toFixed(1), calls: R.info.render.calls };
    };
    const hide = (pred) => { const list = []; ctx.scene.traverse((o) => { if (o.visible && pred(o)) { o.visible = false; list.push(o); } }); return () => list.forEach((o) => { o.visible = true; }); };
    const nm = (o) => (o.name + ' ' + (o.parent?.name ?? '')).toLowerCase();
    const mat = (o) => (Array.isArray(o.material) ? o.material[0] : o.material);
    const out = { level: G.levelId };
    out.base = run();
    let u;
    u = hide((o) => o.isMesh && (/fur|shell/.test(nm(o)) || mat(o)?.userData?.fur)); out.noFur = run(); u();
    u = hide((o) => o.isMesh && /grass|wheat|flower/.test(nm(o))); out.noGrass = run(); u();
    u = hide((o) => o.isSkinnedMesh); out.noSkinned = run(); u();
    u = hide((o) => o.isMesh && mat(o)?.type === 'MeshPhysicalMaterial'); out.noPhysical = run(); u();
    { const a = R.shadowMap.enabled; R.shadowMap.enabled = false; if (sun) sun.castShadow = false; out.noShadow = run(); R.shadowMap.enabled = a; if (sun) sun.castShadow = true; }
    // all-in "toon target" approximation: no fur, no shadows map, no physical
    { const u1 = hide((o) => o.isMesh && (/fur|shell/.test(nm(o)) || mat(o)?.userData?.fur)); const a = R.shadowMap.enabled; R.shadowMap.enabled = false; if (sun) sun.castShadow = false; out.noFurNoShadow = run(); R.shadowMap.enabled = a; if (sun) sun.castShadow = true; u1(); }
    // material census
    const mats = new Map(); ctx.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) mats.set(m.type, (mats.get(m.type) ?? 0) + 1); });
    out.matTypes = Object.fromEntries(mats); out.programs = R.info.programs.length;
    out.shadowCasters = 0; ctx.scene.traverse((o) => { if (o.castShadow && o.visible && (o.isMesh)) out.shadowCasters++; });
    return out;
  });
  console.log(JSON.stringify(r));
}
await browser.close();
