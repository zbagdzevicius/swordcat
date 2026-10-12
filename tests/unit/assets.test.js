// tests/unit/assets.test.js  (owner: core) — U15 + loader rules (§18.1, §18.4): manifests exist on disk, every
// literal asset path in src/ is in a manifest, MODEL_FIT is valid, prune keeps the right files, fit maths.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { MODEL_FIT, LEVEL_IDS } from '../../src/core/config.js';
import { fitToHeight, measure, resolveFit, extentOf, findNode } from '../../src/core/Assets.js';
import { normalizeAssetPath, normalizeManifest, levelAssets, TIERS } from '../../src/core/manifests.js';
import { collectManifests, computeKeep, norm } from '../../scripts/prune-assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = path.join(ROOT, 'public', 'assets');
const ASSET_LITERAL = /['"`]((?:models|audio|textures|fonts)\/[^'"`\s${}]+?\.(?:glb|gltf|ogg|mp3|wav|png|jpe?g|webp|hdr|ttf|otf|woff2?))['"`]/g;

function srcFiles(dir = path.join(ROOT, 'src'), out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) srcFiles(p, out); else if (/\.(js|mjs|css)$/.test(p)) out.push(p);
  }
  return out;
}

test('U15: every manifest path exists under public/assets/', async () => {
  const manifests = await collectManifests();
  assert.ok(Object.keys(manifests).length >= 13, 'every area has an assets.manifest.js');
  const missing = [];
  for (const [area, list] of Object.entries(manifests)) for (const p of list) if (!fs.existsSync(path.join(PUBLIC, p))) missing.push(`${area}: ${p}`);
  assert.deepEqual(missing, [], 'manifest paths missing on disk:\n' + missing.join('\n'));
});

test('U15: every literal asset path in src/ appears in a manifest', async () => {
  const manifests = await collectManifests();
  const all = new Set(Object.values(manifests).flat());
  const unlisted = [];
  for (const f of srcFiles()) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(ASSET_LITERAL)) {
      const p = norm(m[1]);
      if (!all.has(p)) unlisted.push(`${path.relative(ROOT, f)}: ${p}`);
    }
  }
  assert.deepEqual([...new Set(unlisted)], [], 'asset paths not in any src/<area>/assets.manifest.js:\n' + unlisted.join('\n'));
});

test('manifest `levels` subsets use real level ids (or "*") and are listed in the default export', async () => {
  for (const dir of fs.readdirSync(path.join(ROOT, 'src'))) {
    const f = path.join(ROOT, 'src', dir, 'assets.manifest.js');
    if (!fs.existsSync(f)) continue;
    const mod = await import(pathToFileURL(f).href);
    const m = normalizeManifest(dir, mod);
    for (const [k, tiers] of Object.entries(m.tiers)) {
      assert.ok(k === '*' || k === 'title' || LEVEL_IDS.includes(k), `${dir}: unknown level key "${k}"`);
      for (const [tier, list] of Object.entries(tiers)) {
        assert.ok(TIERS.includes(tier), `${dir}: levels.${k} unknown tier ${tier}`);
        for (const p of list) assert.ok(m.all.includes(p), `${dir}: levels.${k}.${tier} path ${p} not in the default export`);
      }
    }
  }
});

test('§18.1 MODEL_FIT: files exist, axes valid, targets positive', () => {
  for (const [p, f] of Object.entries(MODEL_FIT)) {
    assert.ok(fs.existsSync(path.join(PUBLIC, p)), `${p} missing`);
    assert.ok(['x', 'y', 'z', 'max'].includes(f.axis), `${p}: axis ${f.axis}`);
    assert.ok(f.target > 0, `${p}: target`);
    assert.equal(typeof f.yaw, 'number', `${p}: yaw`);
    for (const v of Object.values(f.uses ?? {})) assert.ok(v > 0, `${p}: uses`);
  }
});

test('resolveFit accepts number, {h}, {x}, {max}, role names, ranges and falls back to MODEL_FIT', () => {
  const knight = 'models/characters/kaykit/Knight.glb';
  assert.deepEqual(pick(resolveFit(knight)), { axis: 'y', target: 1.25 });
  assert.deepEqual(pick(resolveFit(knight, 'brutus')), { axis: 'y', target: 1.9 });
  assert.deepEqual(pick(resolveFit(knight, 3)), { axis: 'y', target: 3 });
  assert.deepEqual(pick(resolveFit('models/x.glb', { x: 1.2 })), { axis: 'x', target: 1.2 });
  assert.deepEqual(pick(resolveFit('models/x.glb', { max: 0.5 })), { axis: 'max', target: 0.5 });
  assert.deepEqual(pick(resolveFit('models/x.glb', { h: [2, 4] }, () => 0.5)), { axis: 'y', target: 3 });
  assert.equal(resolveFit('models/creatures/animals/Husky.glb').axis, 'z');
  assert.equal(resolveFit('models/cats/Cat_Blocky.glb').target, 1.0);
  function pick(f) { return { axis: f.axis, target: f.target }; }
});

test('fitToHeight / measure: uniform scale to the target, invisible and excluded nodes ignored', () => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1)); body.position.y = 2; g.add(body);
  const sword = new THREE.Mesh(new THREE.BoxGeometry(0.2, 10, 0.2)); sword.name = '2H_Sword'; g.add(sword);
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(50, 50, 50)); hidden.visible = false; g.add(hidden);
  const s = fitToHeight(g, 1.0, 'y', { exclude: ['2H_Sword'] });
  assert.ok(Math.abs(s - 0.25) < 1e-6, `scale ${s}`);
  const box = measure(g, { exclude: ['2H_Sword'] });
  assert.ok(Math.abs(extentOf(box, 'y') - 1) < 1e-6);
  assert.ok(Math.abs(extentOf(box, 'max') - 1) < 1e-6);
  assert.ok(Math.abs(extentOf(box, 'x') - 0.5) < 1e-6);
  // ×100 node scales (verified on Rat / Cat_Blocky / Crown) are just more scale
  const deep = new THREE.Group(); const arm = new THREE.Group(); arm.scale.setScalar(100); deep.add(arm);
  arm.add(new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.0059, 0.01)));
  fitToHeight(deep, 0.8);
  assert.ok(Math.abs(extentOf(measure(deep), 'y') - 0.8) < 1e-6);
});

test('findNode accepts raw glTF names and three\'s sanitised names (handslot.r → handslotr)', () => {
  const root = new THREE.Group(), bone = new THREE.Bone(); bone.name = THREE.PropertyBinding.sanitizeNodeName('handslot.r'); root.add(bone);
  assert.equal(findNode(root, 'handslot.r'), bone);
  assert.equal(findNode(root, 'handslotr'), bone);
  assert.equal(findNode(root, 'nope'), null);
});

test('prune (§18.4): keeps manifest files, sibling Textures/, external URIs and licences; drops the rest', () => {
  const files = ['models/env/castle/wall.glb', 'models/env/castle/Textures/colormap.png', 'models/env/castle/tower.glb',
    'models/a/b.gltf', 'models/a/b.bin', 'models/a/tex/c.png', 'audio/x.ogg', 'audio/y.ogg', 'fonts/Fredoka.ttf', 'fonts/licenses/OFL-Fredoka.txt',
    'LICENSES.md', 'ASSETS.md', 'licenses/kenney.txt'];
  const keep = computeKeep(files, ['models/env/castle/wall.glb', 'models/a/b.gltf', 'audio/x.ogg', 'fonts/Fredoka.ttf', 'models/missing.glb'],
    (rel) => (rel === 'models/a/b.gltf' ? ['b.bin', 'tex/c.png'] : []));
  assert.deepEqual([...keep].sort(), ['LICENSES.md', 'audio/x.ogg', 'fonts/Fredoka.ttf', 'fonts/licenses/OFL-Fredoka.txt', 'licenses/kenney.txt',
    'models/a/b.bin', 'models/a/b.gltf', 'models/a/tex/c.png', 'models/env/castle/Textures/colormap.png', 'models/env/castle/wall.glb'].sort());
});

test('manifest path normalisation and per-level union', () => {
  assert.equal(normalizeAssetPath('/assets/models/a.glb'), 'models/a.glb');
  assert.equal(normalizeAssetPath('public/assets/audio/b.ogg'), 'audio/b.ogg');
  assert.equal(normalizeAssetPath('models\\c.glb'), 'models/c.glb');
  const ms = [normalizeManifest('a', { default: ['m/1.glb', 'm/2.glb'], levels: { meadow: ['m/1.glb'], '*': ['m/2.glb'] } }),
    normalizeManifest('b', { default: ['m/3.glb'], levels: { forest: ['m/3.glb'] } })];
  assert.deepEqual(levelAssets('meadow', ms).sort(), ['m/1.glb', 'm/2.glb']);
  assert.deepEqual(levelAssets('forest', ms).sort(), ['m/2.glb', 'm/3.glb']);
});

test('PERF §10.3 manifest tiers: object form {p0, p1, p2}, title key, array = p0; levelAssets by tier', () => {
  const ms = [normalizeManifest('a', { default: ['m/1.glb', 'm/2.glb', 'm/4.glb', 'm/5.glb'], levels: { meadow: { p0: ['m/1.glb'], p1: ['m/4.glb'], p2: ['m/5.glb'] }, '*': { p0: ['m/2.glb'] }, title: ['m/5.glb'] } }),
    normalizeManifest('b', { default: ['m/3.glb'], levels: { meadow: ['m/3.glb'] } })];
  assert.deepEqual(levelAssets('meadow', ms).sort(), ['m/1.glb', 'm/2.glb', 'm/3.glb'], 'p0 + legacy arrays + * p0');
  assert.deepEqual(levelAssets('meadow', ms, 'p1'), ['m/4.glb']);
  assert.deepEqual(levelAssets('meadow', ms, 'all').sort(), ['m/1.glb', 'm/2.glb', 'm/3.glb', 'm/4.glb', 'm/5.glb']);
  assert.deepEqual(levelAssets('title', ms), ['m/5.glb'], 'title has no "*"');
  assert.deepEqual(ms[0].levels.meadow, ['m/1.glb'], '`levels` keeps the p0 list for old readers');
});

test('PERF §10.3 tier budgets: title <= 1.2 MB, p0 <= 4 MB per level, "*" p0 <= 0.4 MB (tiered manifests gate; legacy arrays report)', async () => {
  const mods = [];
  for (const dir of fs.readdirSync(path.join(ROOT, 'src'))) {
    const f = path.join(ROOT, 'src', dir, 'assets.manifest.js');
    if (fs.existsSync(f)) mods.push(normalizeManifest(dir, await import(pathToFileURL(f).href)));
  }
  const size = (p) => { try { return fs.statSync(path.join(PUBLIC, p)).size; } catch { return 0; } };
  const MB = 1048576, sum = (list) => list.reduce((a, p) => a + size(p), 0) / MB;
  // only areas that declared tiers (object form) are gated; array-form manifests are the legacy "everything is p0"
  const tiered = mods.map((m) => ({ ...m, tiers: Object.fromEntries(Object.entries(m.tiers).filter(([k]) => !Array.isArray(m.levels[k]) || m.tiers[k].p1 || m.tiers[k].p2 || k === 'title')) }));
  const title = sum(levelAssets('title', tiered));
  assert.ok(title <= 1.2, `title tier ${title.toFixed(2)} MB > 1.2 MB`);
  const star = new Set(); for (const m of tiered) for (const p of m.tiers['*']?.p0 ?? []) star.add(p);
  if ([...star].length && tiered.some((m) => m.tiers['*']?.p2)) assert.ok(sum([...star]) <= 0.4, `"*" p0 ${sum([...star]).toFixed(2)} MB > 0.4 MB`);
  for (const id of LEVEL_IDS) {
    const gated = tiered.filter((m) => m.tiers[id]?.p1 || m.tiers[id]?.p2);
    if (!gated.length) continue;
    const p0 = sum(levelAssets(id, gated, 'p0'));
    assert.ok(p0 <= 4, `${id} p0 ${p0.toFixed(2)} MB > 4 MB`);
  }
});

test('PERF §10.2 bundle guard: chunk groups summed and gated against their gzip budgets', async () => {
  const os = await import('node:os');
  const { checkBundle, BUDGETS } = await import('../../scripts/bundle-budget.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-bundle-'));
  fs.mkdirSync(path.join(dir, 'bundle'));
  const rnd = (n) => { let s = ''; let x = 1; for (let i = 0; i < n; i++) { x = (x * 48271) % 2147483647; s += String.fromCharCode(33 + (x % 90)); } return s; };
  fs.writeFileSync(path.join(dir, 'bundle', 'boot-abc.js'), rnd(1000));
  fs.writeFileSync(path.join(dir, 'bundle', 'meadow-abc.js'), rnd(40000));
  fs.writeFileSync(path.join(dir, 'bundle', 'index-abc.js'), 'x');
  const r = checkBundle(dir);
  assert.ok(r.rows.find((x) => x.group === 'boot').ok);
  const lvl = r.rows.find((x) => x.group === 'level');
  assert.ok(lvl && !lvl.ok && lvl.gate, 'a 40 KB-random level chunk is over its 15 KB gz budget');
  assert.equal(r.fail, true); assert.equal(r.unmatched.length, 1);
  assert.ok(BUDGETS.find((b) => b.name === 'three').kb === 215);
  fs.rmSync(dir, { recursive: true, force: true });
});
