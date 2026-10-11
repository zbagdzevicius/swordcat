// research/next/tools/tri_budget.mjs — DESIGN PROBE: top triangle / draw contributors for a level in the iso frame.
// Usage: PROBE_URL=http://localhost:<port>/ node research/next/tools/tri_budget.mjs meadow
import { chromium } from 'playwright';
const URL = process.env.PROBE_URL || 'http://localhost:5617/';
const lvl = process.argv[2] || 'meadow';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${URL}?test=1&seed=1`, { timeout: 180000 });
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 120000 });
const out = await page.evaluate(async (id) => {
  const G = window.__GAME__, { ctx, THREE } = G; G.god(true);
  await G.loadLevel(id); await G.waitFrames(30);
  const cam = ctx.camera, f = (ctx.player.object3d?.position ?? ctx.player.pos).clone(); f.y += 0.6; f.z += 0.8;
  const P = 51.3 * Math.PI / 180; cam.fov = 38; cam.near = 0.3; cam.far = 90; cam.updateProjectionMatrix();
  cam.position.set(f.x, f.y + 13 * Math.sin(P), f.z - 13 * Math.cos(P)); cam.lookAt(f); cam.updateMatrixWorld();
  const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const rows = new Map();
  ctx.scene.traverseVisible((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    if (o.frustumCulled && o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const s = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld); if (!o.isInstancedMesh && !fr.intersectsSphere(s)) return; }
    const g = o.geometry; const n = g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
    const inst = o.isInstancedMesh ? o.count : (g.isInstancedBufferGeometry ? g.instanceCount : 1);
    const tri = n * (Number.isFinite(inst) ? inst : 1);
    let k = o.name || o.parent?.name || o.material?.type || '?'; k = k.replace(/[0-9]+/g, '#');
    const r = rows.get(k) ?? { k, tris: 0, draws: 0, mat: Array.isArray(o.material) ? 'multi' : o.material?.type }; r.tris += tri; r.draws++; rows.set(k, r);
  });
  return [...rows.values()].sort((a, b) => b.tris - a.tris).slice(0, 18).map((r) => ({ ...r, tris: Math.round(r.tris) }));
}, lvl);
console.log(JSON.stringify(out, null, 0).replace(/},{/g, '},\n{'));
await browser.close();
