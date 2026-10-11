// research/next/tools/toon_probe.mjs — DESIGN PROBE ONLY (does not modify src/).
// Boots the dev game on its own port, frames each level with the CONTROLS_SPEC §2.1 iso camera, measures, then
// applies the art_0.md toon recipe IN THE PAGE (ShaderChunk patch + warm Env preset + Neutral tone mapping +
// inverted-hull outlines on actors) and measures again. Screenshots → research/next/shots/.
// Usage: (SMOKE_NOHMR=1 npx vite --port 5391 --strictPort) then: node research/next/tools/toon_probe.mjs [levels...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.PROBE_URL || 'http://localhost:5391/';
const OUT = 'research/next/shots';
const LEVELS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const levels = LEVELS.length ? LEVELS : ['meadow', 'forest', 'town'];
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

// art_0.md §2 palette (warm cartoon), per level: ground (Terrain.GROUND), grass (Grass.GRASS_COLORS), env preset.
const TOON = {
  meadow: { ground: { root: '#3F7F35', mid: '#5FA243', dry: '#B9C35E', path: '#E6C590', pathDark: '#C9A270', soil: '#B07A4E', mud: '#8A5C3C', field: '#D9B95A' },
    grass: { root: '#3A7E36', tip: '#A5D85E', dry: '#E6CB66' },
    env: { fogColor: '#F7E6C4', fogDensity: 0.018, fogLow: '#F0D6A8', skyTop: '#8FCBF2', hemiSky: '#C4D9FF', hemiGround: '#C9A46A', hemi: 1.3,
      sunColor: '#FFE7C2', sun: 2.4, sunElev: 0.85, sunAz: -1.2, grade: 'none', wind: 0.6, env: 0.25 } },
  forest: { ground: { root: '#2E6438', mid: '#4C8A40', dry: '#9AAE52', path: '#CDA373', pathDark: '#A87C52', soil: '#8A5E3C', mud: '#6E4A30', field: '#7FA048' },
    grass: { root: '#2C6A3A', tip: '#86C65C', dry: '#C8C060' },
    env: { fogColor: '#D8EBC8', fogDensity: 0.022, fogLow: '#BFDDB0', skyTop: '#9AD4E8', hemiSky: '#B9D8F5', hemiGround: '#8C7A4A', hemi: 1.3,
      sunColor: '#FFE2A8', sun: 2.3, sunElev: 0.9, sunAz: -1.0, grade: 'none', wind: 0.4, env: 0.25 } },
  town: { ground: { root: '#5A9A46', mid: '#7DB453', dry: '#D2C77A', path: '#EBD5A8', pathDark: '#C9AE84', soil: '#B98A5E', mud: '#9A6E4A', field: '#E0C070' },
    grass: { root: '#4E9440', tip: '#B6DE6C', dry: '#E8CF7A' },
    env: { fogColor: '#FBE0C0', fogDensity: 0.016, fogLow: '#F4CFA4', skyTop: '#9CC8F0', hemiSky: '#CBD3FF', hemiGround: '#D2A070', hemi: 1.25,
      sunColor: '#FFD9A6', sun: 2.6, sunElev: 0.6, sunAz: -1.3, grade: 'none', wind: 0.4, env: 0.25 } },
};
const results = [];
for (const lvl of levels) {
  await page.goto(`${URL}?test=1&seed=1`, { timeout: 180000 });
  await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 120000 });
  await page.evaluate(async (id) => {
    const G = window.__GAME__; G.god(true); G.skipDialog?.();
    await G.loadLevel(id); await G.waitFrames(30); G.skipDialog?.();
    const { ctx, THREE } = G;
    const DAY = { meadow: 'meadow_day', forest: 'forest_day', town: 'town_occupied', gate: 'gate_dusk' };
    ctx.env.preset(DAY[id] ?? 'meadow_day', 0);
    // ---- iso camera (CONTROLS_SPEC §2.1: fov 38, d 13, pitch 51.3°, yaw π = camera south looking +Z) ----
    const cam = ctx.camera, gl = ctx.renderer.getContext(), px = new Uint8Array(4);
    const orig = ctx.postfx.render.bind(ctx.postfx);
    const P = 51.3 * Math.PI / 180, D = 13, f = new THREE.Vector3();
    window.__PROBE__ = { timing: false, ms: [] };
    ctx.postfx.render = (dt) => {
      f.copy(ctx.player.object3d?.position ?? ctx.player.pos); f.y += 0.6; f.z += 0.8;
      cam.fov = 38; cam.near = 0.3; cam.far = 90; cam.updateProjectionMatrix();
      cam.position.set(f.x, f.y + D * Math.sin(P), f.z - D * Math.cos(P)); cam.lookAt(f);
      const t0 = performance.now();
      orig(dt);
      if (window.__PROBE__.timing) { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); window.__PROBE__.ms.push(performance.now() - t0); }
    };
  }, lvl);

  const measure = async (tag) => {
    await page.evaluate(() => window.__GAME__.waitFrames(40));
    const m = await page.evaluate(async () => {
      const G = window.__GAME__, P = window.__PROBE__;
      const f0 = G.frame, t0 = performance.now();
      await new Promise((r) => setTimeout(r, 2000));
      const fps = (G.frame - f0) / ((performance.now() - t0) / 1000);
      P.ms = []; P.timing = true; await G.waitFrames(90); P.timing = false;
      const ms = P.ms.slice().sort((a, b) => a - b);
      const s = G.state(), info = G.ctx.renderer.info;
      return { fps: +fps.toFixed(1), renderMsMed: +ms[ms.length >> 1].toFixed(2), renderMsP90: +ms[(ms.length * 0.9) | 0].toFixed(2),
        calls: s.calls, frameCalls: s.frameCalls, tris: s.tris, programs: info.programs?.length ?? null, quality: s.quality };
    });
    await page.screenshot({ path: `${OUT}/${lvl}_${tag}.png` });
    results.push({ level: lvl, tag, ...m });
    console.log(lvl, tag, JSON.stringify(m));
  };

  await measure('base');

  // ---- apply the art_0.md recipe in-page ----
  await page.evaluate((tp) => { window.__TOON_PAL__ = tp; }, { id: lvl, ...TOON[lvl] });
  await page.evaluate(async () => {
    const G = window.__GAME__, { ctx, THREE } = G, C = THREE.ShaderChunk;
    // 1. Toon ramp + cel shadow, global (every Lambert/Standard/Physical program, incl. ones with onBeforeCompile patches).
    const RAMP = `
#define TOON_GRADE 1
float toonRamp(float d){ return smoothstep(0.0, 0.07, d) * mix(0.86, 1.0, smoothstep(0.42, 0.50, d)); }
float toonShadow(float s){ return mix(0.0, 1.0, smoothstep(0.38, 0.62, s)); }
vec3 toonGrade(vec3 c){ float l = dot(c, vec3(0.2126,0.7152,0.0722)); c = mix(vec3(l), c, 1.18); return c; }
`;
    C.lights_pars_begin = RAMP + C.lights_pars_begin;
    const DOT = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
    const TOON = 'float dotNL = toonRamp( dot( geometryNormal, directLight.direction ) );';
    C.lights_lambert_pars_fragment = C.lights_lambert_pars_fragment.replace(DOT, TOON);
    C.lights_physical_pars_fragment = C.lights_physical_pars_fragment.replace(DOT, TOON);
    C.lights_fragment_begin = C.lights_fragment_begin.replace(
      '? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;',
      '? toonShadow( getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) ) : 1.0;');
    C.opaque_fragment = C.opaque_fragment.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
      '#ifdef TOON_GRADE\n outgoingLight = toonGrade(outgoingLight);\n#endif\ngl_FragColor = vec4( outgoingLight, diffuseColor.a );');
    // 2. Warm cartoon light + warm haze (art_0.md §3 meadow_day values)
    const mod = await import('/src/world/Env.js');
    const T = await import('/src/world/Terrain.js'), GR = await import('/src/world/Grass.js');
    const TP = window.__TOON_PAL__;
    Object.assign(T.GROUND[TP.id] ?? {}, TP.ground); Object.assign(GR.GRASS_COLORS[TP.id] ?? {}, TP.grass);
    mod.ENV_PRESETS.toon_probe = TP.env;
    window.__PROBE__.reload = true;
    ctx.renderer.toneMapping = THREE.NeutralToneMapping; ctx.renderer.toneMappingExposure = 1.0;
    // 3. Inverted-hull outline on actors' opaque non-fur meshes (one hull per mesh; shares geometry).
    const hullMat = new THREE.MeshBasicMaterial({ color: '#4A2A1E', side: THREE.BackSide, fog: true });
    hullMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n{ vec4 vp = modelViewMatrix * vec4(position,1.0); transformed += normalize(normal) * (0.012 + 0.0016 * -vp.z); }'); };
    hullMat.customProgramCacheKey = () => 'toonHull'; window.__HULLMAT__ = hullMat;
    let hulls = 0;
    for (const a of ctx.actors.list ?? ctx.actors.all?.() ?? []) {
      const root = a.object3d; if (!root) continue;
      const add = [];
      root.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.toonHull) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!m || m.transparent || m.isShaderMaterial || !o.geometry?.attributes?.normal) return;
        if (o.geometry.attributes.position.count < 24) return;
        add.push(o);
      });
      for (const o of add) { const h = new THREE.Mesh(o.geometry, hullMat); h.userData.toonHull = true; h.castShadow = false; h.receiveShadow = false; o.add(h); hulls++; }
    }
    window.__PROBE__.hulls = hulls;
    // recompile every material with the patched chunks
    ctx.scene.traverse((o) => { if (!o.material) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true; });
  });
  await page.evaluate(async (id) => { const G = window.__GAME__; await G.loadLevel(id); await G.waitFrames(30); G.skipDialog?.();
    G.ctx.env.preset('toon_probe', 0); }, lvl);
  // hulls must be (re)added after the reload: run the hull pass again
  await page.evaluate(() => {
    const { ctx, THREE } = window.__GAME__;
    const hullMat = window.__HULLMAT__; let hulls = 0;
    for (const a of ctx.actors.list) { const root = a.object3d; if (!root) continue; const add = [];
      root.traverse((o) => { if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.toonHull) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!m || m.transparent || m.isShaderMaterial || !o.geometry?.attributes?.normal || o.geometry.attributes.position.count < 24) return;
        if ((o.children || []).some((c) => c.userData.toonHull)) return; add.push(o); });
      for (const o of add) { const h = new THREE.Mesh(o.geometry, hullMat); h.userData.toonHull = true; o.add(h); hulls++; } }
    window.__PROBE__.hulls = hulls;
  });
  const hulls = await page.evaluate(() => window.__PROBE__.hulls);
  console.log(lvl, 'hulls', hulls);
  await measure('toon');
  await page.evaluate(() => window.__GAME__.quality('low'));
  await measure('toon_low');
}
fs.writeFileSync(`${OUT}/probe_results.json`, JSON.stringify({ results, errs: errs.slice(0, 20) }, null, 2));
if (errs.length) console.log('page errors:', errs.slice(0, 10));
await browser.close();
