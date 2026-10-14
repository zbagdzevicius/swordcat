// tests/unit/levelload.test.js  (owner: core) — F6 level-load order and failure path, F7 CPU release filter, the
// recovery panels (core/recovery.js) and the vite:preloadError reload guard. Stubs only: no WebGL, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LevelManager, LEVELS, cpuReleaseSkip, sharedGeometries, occluderMeshes, CPU_RELEASE, isModuleImportError } from '../../src/world/LevelManager.js';
import { EventBus } from '../../src/core/EventBus.js';
import { E } from '../../src/core/events.js';
import {
  RECOVERY_TEXT, recoveryText, recoveryId, showRecovery, hideRecovery, shouldReloadOnPreloadError, PRELOAD_RELOAD_KEY,
  PRELOAD_RELOAD_WINDOW, installPreloadErrorReload,
} from '../../src/core/recovery.js';

// ------------------------------------------------------------------ a tiny DOM (only what recovery.js uses)
function fakeDocument() {
  const byId = new Map();
  const mk = (tag) => {
    const el = {
      tagName: tag.toUpperCase(), children: [], style: {}, attrs: {}, listeners: {}, textContent: '', parent: null, _id: '',
      get id() { return this._id; }, set id(v) { this._id = v; byId.set(v, this); },
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
      append(...c) { for (const x of c) { x.parent = this; this.children.push(x); } }, appendChild(c) { this.append(c); return c; },
      addEventListener(t, f) { (this.listeners[t] ??= []).push(f); },
      focus() { doc.activeElement = this; },
      remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; if (byId.get(this._id) === this) byId.delete(this._id); },
      fire(t) { for (const f of this.listeners[t] ?? []) f({ preventDefault() {}, stopPropagation() {} }); },
      find(pred) { if (pred(this)) return this; for (const c of this.children) { const r = c.find(pred); if (r) return r; } return null; },
    };
    return el;
  };
  const doc = { body: mk('body'), activeElement: null, createElement: mk, getElementById: (id) => byId.get(id) ?? null };
  return doc;
}

// ------------------------------------------------------------------ a stub ctx + level modules
function stubLevel(id, log) {
  const root = new THREE.Group(); root.name = id;
  return {
    id, root, spawns: { start: { pos: new THREE.Vector3(), facing: 0 } }, groups: {}, arenas: [],
    activate() { log.push(`activate:${id}`); }, dispose() { log.push(`dispose:${id}`); },
  };
}

function stubCtx(log) {
  const bus = new EventBus();
  for (const ev of [E.LEVEL_LOADING, E.LEVEL_UNLOAD, E.LEVEL_LOADED]) bus.on(ev, (p) => log.push(`${ev}:${p?.id ?? ''}`));
  return {
    bus, scene: new THREE.Scene(), params: { test: true }, strings: null,
    assets: {
      preloadLevel: (id, tier) => { log.push(`preload:${id}:${tier}`); return Promise.resolve(); },
      _cancelRelease: () => log.push('cancelRelease'),
    },
    physics: { setLevel: (l) => log.push(`physics:${l?.id ?? null}`) },
    ui: { loading: (on) => log.push(`veil:${on}`) },
    state: null, player: null, env: null, enemies: null, fx: null, renderer: null, camera: null,
  };
}

/** Swap LEVELS[id] for the test, restore after. */
async function withLevels(map, fn) {
  const saved = {};
  for (const k of Object.keys(map)) { saved[k] = LEVELS[k]; LEVELS[k] = map[k]; }
  try { return await fn(); } finally { Object.assign(LEVELS, saved); }
}

test('F6: the next level is imported and preloaded BEFORE the old one is unloaded', async () => {
  const log = [];
  const ctx = stubCtx(log);
  const lm = new LevelManager(ctx); ctx.levels = lm;
  const mod = (id) => () => { log.push(`import:${id}`); return Promise.resolve({ default: { build: async () => { log.push(`build:${id}`); return stubLevel(id, log); } } }); };
  await withLevels({ meadow: mod('meadow'), forest: mod('forest') }, async () => {
    assert.equal(lm.requests, 0);
    await lm.load('meadow');
    log.length = 0;
    const lv = await lm.load('forest');
    assert.equal(lm.requests, 2, 'every load() request is counted (Cutscene end blocks use it to drop a stale load)');
    assert.equal(lv?.id, 'forest'); assert.equal(lm.current.id, 'forest');
    const at = (s) => { const i = log.indexOf(s); assert.ok(i >= 0, `${s} logged: ${log.join(' ')}`); return i; };
    assert.ok(at('import:forest') < at('level:loading:forest'), 'import before level:loading');
    assert.ok(at('preload:forest:p0') < at('level:unload:meadow'), 'p0 preload before the unload');
    assert.ok(at('level:unload:meadow') < at('dispose:meadow'));
    assert.ok(at('dispose:meadow') < at('build:forest'), 'old level gone before the new build');
    assert.ok(at('build:forest') < at('level:loaded:forest'));
    assert.equal(log.at(-1), 'veil:false', 'veil lifted last');
    assert.ok(at('cancelRelease') < at('preload:forest:p0'), 'the previous level cache release cannot race the preload');
  });
});

test('F6: an import / preload failure keeps the old level, lifts the veil and shows Retry, which re-queues the load', async () => {
  const log = [];
  const ctx = stubCtx(log);
  const lm = new LevelManager(ctx); ctx.levels = lm;
  const doc = fakeDocument();
  const prevDoc = globalThis.document;
  globalThis.document = doc;
  const warn = console.warn; console.warn = () => {};
  let fail = true;
  const ok = (id) => () => Promise.resolve({ default: { build: async () => stubLevel(id, log) } });
  try {
    await withLevels({ meadow: ok('meadow'), forest: () => (fail ? Promise.reject(new Error('preload: HTTP 503 env/tree.glb')) : ok('forest')()) }, async () => {
      await lm.load('meadow');
      const meadow = lm.current;
      log.length = 0;
      const res = await lm.load('forest');
      assert.equal(res, null, 'resolves null, never rejects');
      assert.equal(lm.current, meadow, 'old level kept');
      assert.equal(lm.loading, false);
      assert.ok(!log.includes('dispose:meadow') && !log.some((l) => l.startsWith('level:loading') || l.startsWith('level:unload')), `no teardown: ${log.join(' ')}`);
      assert.equal(log.at(-1), 'veil:false');
      assert.equal(lm.lastError?.stage, 'fetch');
      const panel = doc.getElementById(recoveryId('level'));
      assert.ok(panel, 'Retry panel shown');
      assert.equal(panel.getAttribute('role'), 'alertdialog');
      const btn = panel.find((n) => n.tagName === 'BUTTON');
      assert.equal(btn.textContent, RECOVERY_TEXT.level.action);
      assert.equal(doc.activeElement, btn, 'the button takes focus');
      // Retry → load re-queued; this time it works and the panel is gone
      fail = false;
      btn.fire('click');
      await lm._queue;
      assert.equal(lm.current.id, 'forest');
      assert.equal(doc.getElementById(recoveryId('level')), null);
      assert.ok(log.includes('dispose:meadow'));
    });
    // a failed build (old level already gone) shows the same panel
    await withLevels({ town: () => Promise.resolve({ default: { build: async () => { throw new Error('boom'); } } }) }, async () => {
      assert.equal(await lm.load('town'), null);
      assert.equal(lm.lastError?.stage, 'build');
      assert.ok(doc.getElementById(recoveryId('level')));
      assert.equal(lm.loading, false);
    });
    // a failed module import cannot be retried in this page (the browser caches it): Retry saves and reloads
    let reloads = 0, saved = null;
    lm._reload = () => { reloads++; };
    ctx.save = { save: (r) => { saved = r; } };
    await withLevels({ gate: () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: http://x/bundle/gate-abc.js')) }, async () => {
      assert.equal(await lm.load('gate'), null);
      doc.getElementById(recoveryId('level')).find((n) => n.tagName === 'BUTTON').fire('click');
      assert.equal(reloads, 1); assert.equal(saved, 'retry');
    });
    assert.equal(isModuleImportError('Importing a module script failed.'), true);
    assert.equal(isModuleImportError('error loading dynamically imported module: x'), true);
    assert.equal(isModuleImportError('HTTP 503'), false);
    // an unknown id is still a programming error
    await assert.rejects(lm.load('nowhere'), /unknown level/);
  } finally { globalThis.document = prevDoc; console.warn = warn; }
});

test('F5 / F6: recovery text uses string keys when present, English otherwise; panels are replaced, not stacked', () => {
  assert.deepEqual(recoveryText('context', null), RECOVERY_TEXT.context);
  assert.equal(RECOVERY_TEXT.context.action, 'Tap to continue');
  const strings = { has: (k) => k === 'recovery.level.action', t: () => 'Bandyti dar' };
  assert.equal(recoveryText('level', strings).action, 'Bandyti dar');
  assert.equal(recoveryText('level', strings).title, RECOVERY_TEXT.level.title);
  assert.deepEqual(recoveryText('nope', null), RECOVERY_TEXT.boot);
  assert.equal(recoveryId('boot'), 'boot-error');
  const doc = fakeDocument();
  let n = 0;
  showRecovery('context', { doc, onAction: () => n++ });
  showRecovery('context', { doc, onAction: () => n++ });
  assert.equal(doc.body.children.length, 1, 'replaced');
  const panel = doc.getElementById('recovery-context');
  panel.fire('pointerup'); panel.fire('pointerup');
  assert.equal(n, 1, 'one action per panel');
  assert.match(panel.style.cssText, /#0B0820/i, 'night background');
  hideRecovery('context', doc);
  assert.equal(doc.body.children.length, 0);
  assert.equal(showRecovery('boot', { doc: null }), null, 'no DOM → no panel, no throw');
});

test('F6: vite:preloadError reloads once per window (sessionStorage guard; blocked storage never loops)', () => {
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(shouldReloadOnPreloadError(st, 1000), true);
  assert.equal(mem.get(PRELOAD_RELOAD_KEY), '1000');
  assert.equal(shouldReloadOnPreloadError(st, 1000 + PRELOAD_RELOAD_WINDOW - 1), false, 'second failure: Retry panel instead');
  assert.equal(shouldReloadOnPreloadError(st, 1000 + PRELOAD_RELOAD_WINDOW + 1), true, 'a later redeploy may reload again');
  assert.equal(shouldReloadOnPreloadError({ getItem() { throw new Error('denied'); }, setItem() {} }), false);
  assert.equal(shouldReloadOnPreloadError(null), false);
  // the window handler
  const listeners = {}; let reloads = 0;
  const win = { addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: (t) => { delete listeners[t]; }, sessionStorage: { getItem: () => null, setItem() {} }, location: { reload: () => reloads++ } };
  const warn = console.warn; console.warn = () => {};
  try {
    const off = installPreloadErrorReload(win);
    let prevented = false;
    listeners['vite:preloadError']({ preventDefault: () => { prevented = true; } });
    assert.equal(reloads, 1); assert.equal(prevented, true);
    off(); assert.equal(listeners['vite:preloadError'], undefined);
  } finally { console.warn = warn; }
});

test('F7: CPU release skips shared, small, batched, occluder, fade-tagged and position-aliased geometry', () => {
  const big = () => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(CPU_RELEASE.minVerts * 3), 3))
    .setAttribute('normal', new THREE.BufferAttribute(new Float32Array(CPU_RELEASE.minVerts * 3), 3));
  const mat = new THREE.MeshBasicMaterial();
  const plain = new THREE.Mesh(big(), mat);
  assert.equal(cpuReleaseSkip(plain), false, 'a big level-unique mesh is released');
  assert.equal(cpuReleaseSkip(new THREE.Mesh(new THREE.BoxGeometry(), mat)), true, 'small geometry stays');
  const shared = new THREE.Mesh(big(), mat);
  assert.equal(cpuReleaseSkip(shared, new Set([shared.geometry])), true, 'asset-cache template');
  const occ = new THREE.Mesh(big(), mat);
  assert.equal(cpuReleaseSkip(occ, new Set(), new Set([occ])), true, 'camera occluder');
  const fade = new THREE.Mesh(big(), mat); fade.userData.camFade = true;
  assert.equal(cpuReleaseSkip(fade), true, 'fade-tagged');
  const noFade = new THREE.Mesh(big(), mat); noFade.userData.camFade = false;
  assert.equal(cpuReleaseSkip(noFade), false, 'camFade false = never registered');
  const alias = new THREE.Mesh(big(), mat); alias.geometry.attributes.normal = alias.geometry.attributes.position;
  assert.equal(cpuReleaseSkip(alias), true, 'normal aliases position (uber)');
  const inst = new THREE.InstancedMesh(big(), mat, 2);
  assert.equal(cpuReleaseSkip(inst), true);
  assert.equal(cpuReleaseSkip(new THREE.Group()), false, 'not a mesh');
  // shared geometries come from settled gltf cache entries only
  const tpl = new THREE.Mesh(big(), mat), scene = new THREE.Group(); scene.add(tpl);
  const vals = new Map([['gltf:env/tree.glb', { scene }], ['tex:a.png', {}], ['bin:x', new ArrayBuffer(4)]]);
  assert.deepEqual([...sharedGeometries({ _values: vals })], [tpl.geometry]);
  assert.equal(sharedGeometries(null).size, 0);
  // occluder parts read defensively from the camera
  const cam = { _fader: { units: [{ parts: [{ mesh: occ, rayGeo: occ.geometry }] }] } };
  assert.ok(occluderMeshes(cam).has(occ)); assert.ok(occluderMeshes(cam).has(occ.geometry));
  assert.equal(occluderMeshes(null).size, 0);
  assert.deepEqual([...occluderMeshes({ occluderMeshes: () => [plain] })], [plain], 'a public camera API wins when it exists');
});

test('F7: LevelManager marks the level, releases the rest and re-flags uploaded attributes', () => {
  const lm = new LevelManager({ assets: { _values: new Map() }, cam: null, params: {} });
  const root = new THREE.Group();
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(CPU_RELEASE.minVerts * 3), 3))
    .setAttribute('uv', new THREE.BufferAttribute(new Float32Array(CPU_RELEASE.minVerts * 2), 2));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial()); root.add(m);
  const small = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); root.add(small);
  const v0 = geo.attributes.uv.version;
  assert.equal(lm._releaseCpu({ root }), 1, 'only the big mesh uv (position kept)');
  assert.equal(small.userData.keepCpu, true);
  assert.equal(geo.attributes.uv.version, v0 + 1, 'needsUpdate: the next upload drops the array');
  assert.equal(geo.attributes.position.version, 0, 'positions stay for raycasts and physics');
  geo.attributes.uv.onUploadCallback();
  assert.equal(geo.attributes.uv.array, null);
  assert.ok(geo.attributes.position.array);
  assert.equal(new LevelManager({ params: { keepCpu: true } })._releaseCpu({ root: new THREE.Group() }), 0);
});
