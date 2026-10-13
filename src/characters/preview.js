// Characters preview page (dev only; not part of the game bundle). Serves the R1 look-dev loop:
// http://localhost:5201/src/characters/preview.html?view=vigil|meme|holy|mochi|pearl|hyena|lineup|poses|props|kittens
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import * as C from './index.js';

const params = new URLSearchParams(location.search);
const view = params.get('view') || 'vigil';
const W = +(params.get('w') || innerWidth), H = +(params.get('h') || innerHeight);
const hud = document.getElementById('hud');
if (params.has('nohud')) hud.style.display = 'none';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;   // ART §3.1: the game renders with Neutral
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOG = '#B7C0C3';
scene.fog = new THREE.FogExp2(FOG, 0.045);
scene.background = new THREE.Color(FOG);

// ---- overcast env (art.md §4.1)
function makeOvercastEnv({ top = '#E3E9EE', horizon = '#B9C2C4', ground = '#3E4A26' } = {}) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(top) }, hor: { value: new THREE.Color(horizon) }, gnd: { value: new THREE.Color(ground) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top, hor, gnd; varying vec3 vP; void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(hor, top, pow(y, 0.6)) : mix(hor, gnd, pow(-y, 0.35)); gl_FragColor = vec4(c, 1.0); }',
  })));
  const box = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4), side: THREE.DoubleSide }));
  box.position.set(-3, 7, 4); box.lookAt(0, 0, 0); s.add(box);
  const pm = new THREE.PMREMGenerator(renderer); const env = pm.fromScene(s, 0.02).texture; pm.dispose();
  return env;
}
scene.environment = makeOvercastEnv();

// ---- sky dome with horizon = fog colour
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#C3CCD3') }, hor: { value: new THREE.Color(FOG) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top, hor; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(hor, top, smoothstep(0.0, 0.6, vP.y)), 1.0); }',
  }));
  sky.name = 'sky'; scene.add(sky);
}

// ---- lights (art.md §9.1)
const hemi = new THREE.HemisphereLight('#D5DDE3', '#4A5230', 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight('#FFF2E0', 1.4);
sun.position.set(-3, 6, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 6; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 20 });
scene.add(sun);

// ---- ground + grass
{
  const g = new THREE.Mesh(new THREE.PlaneGeometry(200, 200, 1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#262E12', roughness: 1 }));
  g.receiveShadow = true; g.name = 'ground'; scene.add(g);
  const bladeH = 0.12, bladeW = 0.012;
  const geo = new THREE.PlaneGeometry(bladeW, bladeH, 1, 4).translate(0, bladeH / 2, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) / bladeH; p.setX(i, p.getX(i) * (1 - t * 0.85)); p.setZ(i, t * t * 0.03); }
  const count = 140000, size = 12;
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uRoot: { value: new THREE.Color('#2A3314') }, uTip: { value: new THREE.Color('#6E7B40') }, uDry: { value: new THREE.Color('#9C9A5E') }, uSky: { value: new THREE.Color('#D5DDE3') }, uSun: { value: new THREE.Color('#FFF2E0') } }]),
    vertexShader: `uniform float uTime; attribute float aTint; varying float vH, vTint;
      #include <fog_pars_vertex>
      void main(){ float h = clamp(position.y / ${bladeH.toFixed(2)}, 0.0, 1.0);
        vec4 root = modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0);
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        float bend = (sin(uTime * 1.3 + root.x * 0.7 + root.z * 0.4) * 0.5 + 0.6) * 0.5 * h * h;
        wp.xz += vec2(0.8, 0.6) * bend * 0.2;
        vH = h; vTint = aTint; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 uRoot, uTip, uDry, uSky, uSun; varying float vH, vTint;
      #include <common>
      #include <fog_pars_fragment>
      void main(){ vec3 tip = mix(uTip, uDry, smoothstep(0.8, 1.0, vTint));
        vec3 c = mix(uRoot, tip, pow(max(vH, 0.0), 1.3)) * mix(0.85, 1.1, fract(vTint * 7.31));
        c *= uSky * 0.55 + uSun * (0.35 + 0.35 * vH);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const grass = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const tint = new Float32Array(count);
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rnd()) * size, a = rnd() * Math.PI * 2;
    v.set(Math.cos(a) * r, 0, Math.sin(a) * r - 2);
    q.setFromEuler(e.set((rnd() - 0.5) * 0.3, rnd() * 6.283, (rnd() - 0.5) * 0.3));
    grass.setMatrixAt(i, m.compose(v, q, s.set(1, 0.5 + rnd() * 0.9, 1))); tint[i] = rnd();
  }
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 1));
  grass.frustumCulled = false; grass.name = 'grass';
  scene.add(grass);
  scene.userData.grassMat = mat;
}

// ---- camera + post
const camera = new THREE.PerspectiveCamera(35, W / H, 0.03, 200);
const rt = new THREE.WebGLRenderTarget(W * renderer.getPixelRatio(), H * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: params.has('nomsaa') ? 0 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.55, 0.6, 0.85);
if (!params.has('nobloom')) composer.addPass(bloom);
const vig = new ShaderPass(VignetteShader); vig.uniforms.offset.value = 0.95; vig.uniforms.darkness.value = 1.15;
if (!params.has('novig')) composer.addPass(vig);
composer.addPass(new OutputPass());

// ---- holy helpers for the preview (fx owns these in game: sparkles + point light)
function makeSparkles(count = 160, color = '#FFF1C4') {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), ph = new Float32Array(count), sz = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos.set([(Math.random() - 0.5) * 1.4, Math.random() * 1.2, (Math.random() - 0.5) * 1.0], i * 3); ph[i] = Math.random(); sz[i] = 0.6 + Math.random(); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uI: { value: 1 }, uColor: { value: new THREE.Color(color) }, uPR: { value: renderer.getPixelRatio() } },
    vertexShader: `uniform float uTime, uPR; attribute float aPhase, aSize; varying float vA;
      void main(){ vec3 p = position; float life = fract(uTime * 0.18 + aPhase);
        p.y += life * 1.2; p.x += sin(uTime * 0.7 + aPhase * 6.28) * 0.06; p.z += cos(uTime * 0.6 + aPhase * 9.0) * 0.06;
        float tw = 0.55 + 0.45 * sin(uTime * (3.0 + aPhase * 5.0) + aPhase * 40.0); vA = sin(life * 3.14159) * tw;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = aSize * uPR * 36.0 / -mv.z * (0.6 + 0.4 * tw); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI; varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float core = pow(smoothstep(0.5, 0.0, d), 3.0);
        float star = max(0.0, 1.0 - abs(c.x) * 16.0) * smoothstep(0.5, 0.0, abs(c.y)) + max(0.0, 1.0 - abs(c.y) * 16.0) * smoothstep(0.5, 0.0, abs(c.x));
        float a = (core + star * 0.5) * vA * uI; gl_FragColor = vec4(uColor * a * 3.0, 1.0); }` });
  return new THREE.Points(g, m);
}

// ---- scene content per view
const kittens = [];
const tickers = [];
const setCam = (pos, look, fov) => { camera.position.set(...pos); camera.lookAt(new THREE.Vector3(...look)); if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); } };
const add = (cfg, pos = [0, 0, 0], yaw = 0, pose = null, o = {}) => {
  const k = C.buildKitten(cfg);
  k.root.position.set(...pos); k.root.rotation.y = yaw;
  scene.add(k.root);
  if (pose) k.setPose(pose, { blend: 0 });
  if (o.expr) k.setExpression(o.expr, true);
  if (params.has('noblink') && k.eyes) k.eyes.autoBlink = false;
  for (const [key, u] of [['tiling', 'uTiling'], ['density', 'uDensityBoost'], ['rootdark', 'uRootDark'], ['comb', 'uComb'], ['furlen', 'uFurLen'], ['rim', 'uRimStrength'], ['amb', 'uAmbMul'], ['sunmul', 'uSunMul'], ['stretch', 'uStretch']]) {
    if (params.has(key) && k.furMat) { k.furMat.uniforms[u].value = +params.get(key); k.furMatBaked.uniforms[u].value = +params.get(key); }
  }
  if (params.has('shells')) k.setFurShells(+params.get('shells'));
  kittens.push(k);
  return k;
};

async function loadGLB(path) {
  const loader = new GLTFLoader();
  return loader.loadAsync(C.assetUrl(path));
}

async function setup() {
  switch (view) {
    case 'vigil': {
      add(C.swordcatConfig({ cape: params.get('cape') || 'red' }), [0, 0, 0], 0, 'vigil');
      setCam([0.0, 0.62, 3.1], [0, 0.56, 0], 30);
      break;
    }
    case 'vigil34': {
      add(C.swordcatConfig({ cape: params.get('cape') || 'red' }), [0, 0, 0], 0.5, 'vigil');
      setCam([0.0, 0.45, 2.4], [0, 0.5, 0], 30);
      break;
    }
    case 'torso': {
      add(C.swordcatConfig({ cape: 'red' }), [0, 0, 0], 0, params.get('pose') || 'vigil');
      setCam([0.0, 0.45, 1.5], [0, 0.4, 0], 32);
      break;
    }
    case 'side': {
      add(C.swordcatConfig({ cape: 'red' }), [0, 0, 0], Math.PI / 2 * (params.get('flip') ? -1 : 1), params.get('pose') || 'vigil');
      setCam([0.0, 0.55, 2.6], [0, 0.5, 0], 32);
      break;
    }
    case 'pose': {
      const k = add(C.swordcatConfig({ cape: 'red' }), [0, 0, 0], +(params.get('yaw') || 0.45), params.get('pose') || 'vigil');
      for (const pr of (params.get('props') || '').split(',').filter(Boolean)) k.setProp(pr, true);
      setCam([0.0, 0.62, 2.2], [0, 0.42, 0], 32);
      break;
    }
    case 'face34': {
      add(C.swordcatConfig({ cape: 'red' }), [0, 0, 0], 0.55, 'vigil');
      setCam([0.0, 0.8, 1.0], [0, 0.76, 0], 30);
      break;
    }
    case 'face': {
      add(C.swordcatConfig({ cape: 'red' }), [0, 0, 0], 0, 'vigil');
      setCam([0.0, 0.78, 0.9], [0, 0.76, 0], 30);
      break;
    }
    case 'meme': {
      const k = add(C.swordcatConfig({ cape: params.get('cape') || 'red' }), [0, 0, 0], 0, 'oath');
      k.setCapeMode('sway', { blend: 0 }); k.cape.windMul = 1.6;
      setCam([0.06, 0.70, 1.15], [0.03, 0.82, 0], 32);
      break;
    }
    case 'holy': {
      const k = add(C.swordcatConfig({ cape: 'red' }), [0, 0, 0], 0, 'oath');
      k.setHoly(1);
      const sp = makeSparkles(160); sp.position.set(0, 0.1, 0.1); scene.add(sp); tickers.push((t) => { sp.material.uniforms.uTime.value = t; });
      const pl = new THREE.PointLight('#FFD38A', 0.6, 3, 2); pl.position.set(-0.2, 0.95, 0.55); scene.add(pl);
      bloom.strength = 0.85; bloom.threshold = 0.82; bloom.radius = 0.35;
      scene.fog.color.set('#969FB0'); scene.background.set('#969FB0');
      setCam([0.05, 0.8, 1.55], [-0.04, 0.9, 0], 34);
      break;
    }
    case 'back': {
      // gameplay follow view (behind, slightly above); ?pose=run&cape=cream
      const k = add(C.swordcatConfig({ cape: params.get('cape') || 'cream' }), [0, 0, 0], +(params.get('yaw') || 0), params.get('pose') || 'idle');
      // ?roll: the player's Tumble (body flips over a mid-height pivot, 0.4 s every 1 s); ?hunch=<rad>: chest pitched
      // forward; ?freeze=<frame>: stop animating there (screenshots of a mid-roll frame)
      if (params.has('roll') || params.has('hunch')) {
        const J = k.rig.joints, ax = new THREE.Vector3(1, 0, 0), piv = new THREE.Vector3(0, 0.42, 0), q = new THREE.Quaternion();
        const E = (x) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, 0, 0));
        const anim = k.animate.bind(k); let rt = 0;
        k.animate = (dt, o) => {
          anim(dt, o); rt += dt;
          if (params.has('hunch')) J.chest.quaternion.multiply(E(+params.get('hunch') * Math.min(1, rt / 0.4)));
          const u = (rt % 1) / 0.4;
          if (params.has('roll') && rt > 0.5 && u < 1) {
            const th = Math.PI * 2 * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, u / 0.9))), tuck = Math.sin(u * Math.PI);
            J.chest.quaternion.multiply(E(0.5 * tuck)); J.head.quaternion.multiply(E(0.45 * tuck));
            q.setFromAxisAngle(ax, th); J.body.quaternion.premultiply(q);
            J.body.position.sub(piv).applyQuaternion(q).add(piv); J.body.position.y += 0.3 * Math.sin(th * 0.5);
          }
          return k;
        };
      }
      if (params.has('run')) { tickers.push((t, dt) => { k.root.position.z += dt * +params.get('run'); camera.position.z = k.root.position.z - 3.2; camera.lookAt(0, 0.55, k.root.position.z); }); }
      setCam([0.0, 1.35, -3.2], [0, 0.55, 0], 45);
      break;
    }
    case 'mochi': {
      add(C.CATS.mochi, [0, 0, 0], 0.35, 'idle');
      setCam([0.2, 0.5, 2.3], [0, 0.45, 0], 32);
      break;
    }
    case 'pearl': {
      add(C.CATS.pearl, [0, 0, 0], 0.3, 'idle');
      setCam([0.15, 0.45, 2.0], [0, 0.4, 0], 32);
      break;
    }
    case 'lineup': {
      const ids = (params.get('ids') || 'swordcat_red,pearl,mochi,sage,clover,earlgrey,pip,tofu,marmalade,snowpaw,whiskerbottom').split(',');
      ids.forEach((id, i) => add(C.catConfig(id), [(i - (ids.length - 1) / 2) * 0.85, 0, 0], 0, 'idle'));
      setCam([0, 0.75, ids.length * 0.95 + 1.5], [0, 0.5, 0], 35);
      break;
    }
    case 'kittens': {
      const ids = C.KITTEN_IDS;
      ids.forEach((id, i) => add(C.lostKittenConfig(id), [((i % 9) - 4) * 0.7, 0, -Math.floor(i / 9) * 1.0], 0, 'idle'));
      setCam([0, 1.2, 5.2], [0, 0.35, -0.5], 40);
      break;
    }
    case 'poses': {
      const names = ['vigil', 'oath', 'sip', 'selfie', 'faint', 'kneel', 'sit', 'sleep', 'idle', 'ready'];
      names.forEach((n, i) => {
        const k = add(C.swordcatConfig({ cape: 'red' }), [((i % 5) - 2) * 1.0, 0, -Math.floor(i / 5) * 1.3], 0, n);
        if (n === 'sip' || n === 'selfie') k.setProp('milk_cup', true);
      });
      setCam([0, 1.5, 4.6], [0, 0.35, -0.6], 42);
      break;
    }
    case 'props': {
      const names = ['milk_cup', 'lantern', 'spoon', 'letter', 'pot_helm', 'milk_bottle', 'colander', 'post_bag', 'soup_bowl'];
      names.forEach((n, i) => { const p = C.buildProp(n, { light: n === 'lantern' }); p.position.set((i - 4) * 0.28, n === 'lantern' ? 0.25 : 0.05, 0); scene.add(p); });
      const c1 = C.buildCage({ style: 'carry', ribbon: true }); c1.position.set(-1.2, 0, -1.2); scene.add(c1);
      const c2 = C.buildCage({ style: 'hanging' }); c2.position.set(0, 0, -1.4); scene.add(c2); c2.userData.setOpen(0.6);
      const c3 = C.buildCage({ style: 'kennel' }); c3.position.set(1.3, 0, -1.3); scene.add(c3);
      const sp = C.buildProp('signpost'); sp.position.set(2.2, 0, -0.8); scene.add(sp);
      setCam([0, 1.1, 3.0], [0, 0.3, -0.6], 40);
      break;
    }
    case 'hyena': {
      const gltf = await loadGLB('models/characters/kaykit/Barbarian.glb');
      const words = ['HATER', 'GRUMBLER', 'POST STEALER'];
      for (let i = 0; i < 3; i++) {
        const model = cloneSkinned(gltf.scene);
        const box = new THREE.Box3().setFromObject(model); const s = 1.35 / (box.max.y - box.min.y);
        model.scale.setScalar(s);
        model.position.set((i - 1) * 1.1, 0, 0);
        model.rotation.y = [0.25, -0.75, -0.1][i];
        for (const n of ['Barbarian_Hat', '1H_Axe', '1H_Axe_Offhand', '2H_Axe', 'Mug', 'Barbarian_Round_Shield']) { const o = model.getObjectByName(n); if (o) o.visible = false; }
        model.traverse((c) => { if (c.isMesh) c.castShadow = true; });
        scene.add(model); model.updateMatrixWorld(true);
        const head = C.attachBeastHead(model, 'hyena', { headNode: 'Barbarian_Head', mane: true, chippedEar: i === 1 ? 'left' : null });
        if (head) { head.setExpression(i === 2 ? 'laugh' : 'sneer'); tickers.push((t, dt) => head.update(dt)); }
        C.attachPlate(model, words[i], { seed: i + 1 });
        if (i === 1) {
          const mixer = new THREE.AnimationMixer(model); const clip = gltf.animations.find((a) => a.name === 'Idle');
          if (clip) mixer.clipAction(clip).play(); tickers.push((t, dt) => mixer.update(dt));
        }
      }
      setCam([0, 1.05, 3.3], [0, 0.9, 0], 35);
      break;
    }
    case 'plates': {
      ['HATER', 'GRUMBLER', 'POST STEALER', 'HATER-IN-CHIEF'].forEach((w, i) => {
        const pl = C.buildPlate(w, { seed: i + 1, style: i === 3 ? 'black' : 'rusty' });
        pl.scale.setScalar(0.5); pl.position.set((i - 1.5) * 0.6, 0.5, 0); scene.add(pl);
      });
      setCam([0, 0.55, 1.8], [0, 0.5, 0], 40);
      break;
    }
    case 'beasts': {
      const heads = ['hyena', 'pug', 'bulldog'];
      heads.forEach((p, i) => {
        const h = C.buildBeastHead(p, { size: 0.55, jowls: true, underbite: true, eyepatch: true, hornedHelm: true, mane: true, scar: true });
        h.root.position.set((i - 1) * 0.8, 0.6, 0); h.root.rotation.y = (i - 1) * -0.3; scene.add(h.root);
        h.setExpression(i === 0 ? 'laugh' : 'angry'); tickers.push((t, dt) => h.update(dt));
      });
      setCam([0, 0.75, 2.4], [0, 0.6, 0], 35);
      break;
    }
    case 'skins': {   // the 7 sword skins (GAME_DESIGN §13.4) on Swordcat in Vigil (?pose=idle for the dragging claymore)
      const pose = params.get('pose') || 'vigil';
      const glb = {};
      for (const [id, path] of [['diamond', 'models/weapons/quaternius/Sword_Diamond.glb'], ['toobig', 'models/weapons/quaternius/Claymore.glb']]) glb[id] = (await loadGLB(path)).scene;
      C.SWORD_SKINS.forEach((skin, i) => {
        const k = add(C.swordcatConfig({ cape: 'red' }), [(i - 3) * 0.95, 0, 0], 0, pose);
        k.setSword(glb[skin] ? { skin, model: glb[skin].clone(true) } : skin);
      });
      setCam([0, 0.75, 6.4], [0, 0.5, 0], 38);
      break;
    }
    case 'capes': {   // the 7 capes (§13.5) from behind; the bow stays pink on every one
      const ids = ['cream', 'red', 'memeWhite', 'blue', 'green', 'midnight', 'gold'];
      ids.forEach((cape, i) => add(C.swordcatConfig({ cape }), [(i - 3) * 0.95, 0, 0], Math.PI + 0.35, 'idle'));
      setCam([0, 0.8, 6.4], [0, 0.5, 0], 38);
      break;
    }
    case 'm2cast': {  // M2 cast (Acts I–II)
      const ids = (params.get('ids') || 'sage,clover,tofu,earlgrey,pip,marmalade').split(',');
      ids.forEach((id, i) => add(C.catConfig(id), [(i - (ids.length - 1) / 2) * 0.9, 0, 0], 0, params.get('pose') || 'idle'));
      setCam([0, 0.62, 3.2 + ids.length * 0.45], [0, 0.45, 0], 36);
      break;
    }
    case 'm2poses': {  // M2 activity poses: Sage aims, Clover heals, Waffles waves, Juniper reads, Biscuit fishes, a spoon kitten
      const rows = [
        [C.CATS.sage, 'aim', []], [C.CATS.clover, 'heal', []], [C.hubKittenConfig('waffles'), null, []],
        [C.hubKittenConfig('juniper'), null, []], [C.hubKittenConfig('biscuit'), null, []], [C.spoonBrigadeConfig('tater', 0), null, []],
        [C.spoonBrigadeConfig('mittens', 1), null, []],
      ];
      rows.forEach(([cfg, pose], i) => { const k = add(cfg, [(i - 3) * 0.85, 0, 0], i === 0 ? -0.6 : 0, pose); if (cfg.id?.startsWith('spoon_') && i === 6) tickers.push((t) => { if (Math.floor(t * 60) % 120 === 0) k.emote('throw'); }); });
      setCam([0, 0.7, 5.6], [0, 0.42, 0], 38);
      break;
    }
    case 'm2props': {  // M2 props: hub activity props + Grizzlechop's gear
      const names = ['book', 'fishing_rod', 'bread_basket', 'teacup', 'hammer', 'butterfly', 'feathered_hat', 'cheese_shield', 'cheese_wheel', 'cheese_wedge'];
      names.forEach((n, i) => {
        const p = C.buildProp(n); const x = (i % 5 - 2) * 0.55, z = -Math.floor(i / 5) * 0.9;
        p.position.set(x, n === 'butterfly' ? 0.35 : n === 'cheese_shield' || n === 'cheese_wheel' ? 0.46 : n === 'feathered_hat' ? 0.25 : 0.02, z);
        if (n === 'cheese_wheel') p.rotation.y = 0.6;
        scene.add(p); if (p.userData.update) tickers.push((t, dt) => p.userData.update(dt));
      });
      const g = C.buildProp('cheese_wheel_giant'); g.position.set(1.9, 0.8, -1.9); g.rotation.y = 0.5; scene.add(g);
      setCam([0, 1.2, 2.6], [0, 0.25, -0.6], 42);
      break;
    }
    default: add(C.SWORDCAT, [0, 0, 0], 0, 'vigil'); setCam([0, 0.5, 2.5], [0, 0.5, 0], 30);
  }
}

function applyCamOverride() {
  const f = (k) => params.has(k) ? params.get(k).split(',').map(Number) : null;
  const pos = f('campos'), look = f('camlook');
  if (pos) setCam(pos, look || [0, 0.5, 0], params.has('camfov') ? +params.get('camfov') : null);
}
function applyHide() {
  const hide = (params.get('hide') || '').split(',').filter(Boolean);
  if (!hide.length) return;
  scene.traverse((o) => { if (hide.some((h) => o.name.startsWith(h))) o.visible = false; });
}
let t = 0, frame = 0;
const clock = new THREE.Timer(); clock.connect(document);
window.__PREVIEW__ = { ready: false, frame: 0, kittens, scene, renderer };
function tick(ts) {
  clock.update(ts);
  const dt = params.has('fixed') ? 1 / 60 : Math.min(clock.getDelta(), 1 / 30);
  t += dt; frame++;
  renderer.info.reset();
  scene.userData.grassMat.uniforms.uTime.value = t;
  if (!(params.has('freeze') && frame > +params.get('freeze'))) for (const k of kittens) k.update(dt, { frameId: frame });
  for (const f of tickers) f(t, dt);
  if (params.has('nopost')) renderer.render(scene, camera); else composer.render();
  const info = renderer.info.render;
  if (frame % 10 === 0) hud.textContent = `${view}  calls ${info.calls}  tris ${info.triangles}  fps~${(1 / Math.max(dt, 1e-3)).toFixed(0)}`;
  window.__PREVIEW__.frame = frame;
  window.__PREVIEW__.calls = info.calls; window.__PREVIEW__.tris = info.triangles;
  if (frame === 90) window.__PREVIEW__.ready = true;
  requestAnimationFrame(tick);
}
renderer.info.autoReset = false;
setup().then(() => { applyCamOverride(); applyHide(); requestAnimationFrame(tick); }).catch((e) => { console.error(e); hud.textContent = 'ERROR ' + e.message; window.__PREVIEW__.error = String(e.stack || e); });
