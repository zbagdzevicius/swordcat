// Unit tests for src/characters (node --test). Pure geometry / math; no DOM or WebGL needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import * as C from '../../src/characters/index.js';
import manifest from '../../src/characters/assets.manifest.js';
import { EventBus } from '../../src/core/EventBus.js';
import { Actor } from '../../src/core/Actor.js';
import { ScriptedActorMixin } from '../../src/core/ScriptedActor.js';
import { E } from '../../src/core/events.js';
import { QUALITY, ENEMIES } from '../../src/core/config.js';

const v = () => new THREE.Vector3();
const worldPos = (o) => { o.updateWorldMatrix(true, false); return o.getWorldPosition(v()); };

test('every named cat from GAME_DESIGN §3 has a config', () => {
  const named = ['swordcat', 'pearl', 'marmalade', 'snowpaw', 'whiskerbottom', 'mochi', 'sage', 'clover', 'tofu', 'earlgrey', 'pip', 'snoozalot'];
  for (const id of named) assert.ok(C.CATS[id], `missing config ${id}`);
  assert.equal(C.OLD_KNIGHT_IDS.length, 7, 'seven old knights (the other seat-holders)');
  assert.ok(C.OLD_KNIGHT_IDS.includes('snoozalot'));
  assert.equal(C.KITTEN_IDS.length, 18);
  assert.equal(new Set(C.KITTEN_IDS).size, 18);
  assert.deepEqual(C.LOST_KITTENS.meadow, ['biscuit', 'noodle', 'button']);
  assert.deepEqual(C.LOST_KITTENS.keep, ['bean', 'crumpet', 'dumpling']);
  assert.equal(C.SQUIRE_IDS.length, 6);
  for (const id of [...C.KITTEN_IDS, ...C.SQUIRE_IDS, 'villager_42']) assert.ok(C.catConfig(id), `catConfig(${id})`);
});

test('villager and lost-kitten configs are deterministic per seed', () => {
  assert.deepEqual(C.villagerConfig(7), C.villagerConfig(7));
  assert.deepEqual(C.lostKittenConfig('biscuit'), C.lostKittenConfig('biscuit'));
  assert.notDeepEqual(C.villagerConfig(7).coat, C.villagerConfig(8).coat === C.villagerConfig(7).coat ? null : C.villagerConfig(8).coat);
  assert.equal(C.lostKittenConfig('noodle').tier, 'lite');
});

let swordcat = null;
const getSwordcat = () => (swordcat ||= C.buildKitten(C.swordcatConfig({ cape: 'red' })));

test('buildKitten returns the frozen contract {root, rig, setPose, setHoly, setExpression}', () => {
  const k = getSwordcat();
  assert.ok(k.root instanceof THREE.Object3D);
  for (const fn of ['setPose', 'setHoly', 'setExpression', 'update', 'emote', 'setProp', 'setCape', 'setSword']) assert.equal(typeof k[fn], 'function', fn);
  const r = k.rig;
  for (const j of ['root', 'body', 'hips', 'chest', 'head', 'earL', 'earR', 'shoulderL', 'elbowL', 'pawL', 'shoulderR', 'elbowR', 'pawR',
    'thighL', 'kneeL', 'footL', 'thighR', 'kneeR', 'footR', 'swordHand', 'swordSocket', 'capeAnchor', 'armL', 'armR', 'legL', 'legR']) assert.ok(r[j], `rig.${j}`);
  assert.equal(r.tail.length, 6);
  assert.equal(r.swordHand, r.pawR);
  for (const n of C.BONE_NAMES) assert.ok(r.joints[n] instanceof THREE.Bone, n);
});

test('HARD RULE: Swordcat wears a pink bow on her LEFT ear (+X)', () => {
  for (const cape of ['cream', 'red', 'memeWhite']) assert.equal(C.swordcatConfig({ cape }).bow.color, C.PAL.bow);
  const k = getSwordcat();
  assert.ok(k.bow, 'bow built');
  assert.equal(k.bow.parent, k.rig.earL, 'bow is parented to the left ear joint');
  k.setPose('vigil', { blend: 0 }); k.update(1 / 60);
  const p = worldPos(k.bow);
  assert.ok(p.x > 0.05, `bow on the cat's left (+X), got x=${p.x.toFixed(3)}`);
  assert.ok(p.y > 0.85 && p.y < 1.0, `bow at the ear base, got y=${p.y.toFixed(3)}`);
});

test('proportions follow ART_WARM §6.3 (head ~0.46 H, eyes ~0.12 H, total height unchanged, sword ~1 H)', () => {
  const k = getSwordcat();
  k.setPose('idle', { blend: 0 }); k.update(1 / 60);
  // eye diameter (head space × the head scale)
  const eye = k.eyes.eyes[0].eye; eye.geometry.computeBoundingBox();
  const eb = eye.geometry.boundingBox, eyeD = (eb.max.x - eb.min.x) * k.headScale;
  assert.ok(eyeD > 0.11 && eyeD < 0.14, `eye diameter ${eyeD.toFixed(3)} H`);
  assert.equal(k.headScale, C.PROPORTIONS.head.hero);
  // head: chin fur bottom to ear tips
  const headBox = new THREE.Box3().setFromObject(k.headFur.mesh);
  const earTip = worldPos(k.rig.earL).y + 0.1 * k.headScale;
  const headH = Math.max(earTip, headBox.max.y) - headBox.min.y;
  assert.ok(headH > 0.4 && headH < 0.55, `head height ${headH.toFixed(3)}`);
  // total height unchanged (ears ~1.0 H): the neck shortens instead of her growing taller
  const top = worldPos(k.rig.earL).y + 0.13 * k.headScale;   // ear tip ≈ the ear joint + its cone
  assert.ok(top > 0.92 && top < 1.06, `ear tips at ${top.toFixed(3)} H`);
  const legacy = C.buildKitten({ ...C.swordcatConfig(), proportions: 'legacy' });
  assert.equal(legacy.headScale, 1); assert.equal(legacy.bodyDrop, 0);
  legacy.dispose();
  // sword length ~1.0
  const sw = C.buildSword('borrowed'); const sb = new THREE.Box3().setFromObject(sw.blade).union(new THREE.Box3().setFromObject(sw.hilt));
  const len = sb.max.y - sb.min.y; assert.ok(len > 0.95 && len < 1.05, `sword length ${len.toFixed(3)}`);
  // pauldrons at least as wide as the head
  const chestMeshBox = new THREE.Box3();
  const pos = k.kitMesh.geometry.attributes.position, si = k.kitMesh.geometry.attributes.skinIndex;
  const chestIdx = C.BONE_NAMES.indexOf('chest');
  for (let i = 0; i < pos.count; i++) if (si.getX(i) === chestIdx) chestMeshBox.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, i));
  const shoulderW = chestMeshBox.max.x - chestMeshBox.min.x;
  const headGeo = k.headFur.mesh.geometry; headGeo.computeBoundingBox();
  const skullW = headGeo.boundingBox.max.x - headGeo.boundingBox.min.x; // base surface (fur adds ~2x0.045)
  assert.ok(shoulderW >= skullW, `pauldrons ${shoulderW.toFixed(3)} >= head ${skullW.toFixed(3)}`);
});

test('all contract poses resolve; Vigil puts both paws on the pommel, Oath raises the blade', () => {
  const k = getSwordcat();
  for (const name of C.POSE_NAMES) { k.setPose(name, { blend: 0 }); k.update(1 / 60); }
  for (const name of ['ready', 'guard', 'cheer', 'hug', 'selfie_sit']) { k.setPose(name, { blend: 0.2 }); k.update(0.3); }
  k.setPose('vigil', { blend: 0 }); k.update(1 / 60);
  k.root.updateMatrixWorld(true);
  const pommel = worldPos(k.sword.pommel), tip = worldPos(k.sword.tip);
  // (ART §6.3 proportions: the torso sits k.bodyDrop lower, and the root-space pose targets follow it)
  assert.ok(pommel.y > 0.44 + k.bodyDrop && pommel.y < 0.56 + k.bodyDrop, `vigil pommel height ${pommel.y.toFixed(3)}`);
  assert.ok(tip.y < pommel.y - 0.5, 'vigil: point down');
  const pawC = (side) => { const p = k.rig['paw' + side]; return new THREE.Vector3(...C.ARM.pawCentre).applyMatrix4(p.matrixWorld); };
  assert.ok(pawC('R').distanceTo(pommel) < 0.07, `right paw on the pommel (${pawC('R').distanceTo(pommel).toFixed(3)})`);
  assert.ok(pawC('L').distanceTo(worldPos(k.sword.grip)) < 0.07, 'left paw on the grip');
  k.setPose('oath', { blend: 0 }); k.update(1 / 60); k.root.updateMatrixWorld(true);
  assert.ok(worldPos(k.sword.tip).y > 1.2, 'oath: blade raised above her head');
  k.setPose('selfie', { blend: 0 }); k.update(1 / 60);
  assert.equal(k.sword.group.parent, k.root, 'selfie: sword stuck in the ground (root mode)');
  k.setPose('idle', { blend: 0 }); k.update(1 / 60);
  assert.equal(k.sword.group.parent, k.rig.swordSocket);
});

test('two-bone IK reaches reachable targets', () => {
  const qS = new THREE.Quaternion(), qE = new THREE.Quaternion();
  const S = new THREE.Vector3(0.13, 0.15, 0), T = new THREE.Vector3(0.02, 0.05, 0.14);
  const err = C.solveTwoBone(S, T, 0.115, 0.11, new THREE.Vector3(1, -0.5, -0.5), qS, qE);
  assert.equal(err, 0);
  const elbow = new THREE.Vector3(0, -0.115, 0).applyQuaternion(qS).add(S);
  const wrist = new THREE.Vector3(0, -0.11, 0).applyQuaternion(qE).applyQuaternion(qS).add(elbow);
  assert.ok(wrist.distanceTo(T) < 1e-3, `wrist error ${wrist.distanceTo(T)}`);
});

test('setHoly drives fur, armour, aura and blade; expressions and emotes are safe', () => {
  const k = getSwordcat();
  k.setHoly(1);
  assert.equal(k.furMat.uniforms.uHoly.value, 1);
  assert.ok(k.sword.bladeMat.emissiveIntensity > 1);
  assert.ok(k.auraMeshes.every((m) => m.visible));
  k.setHoly(0);
  assert.ok(k.auraMeshes.every((m) => !m.visible));
  for (const e of Object.keys(C.EXPRESSIONS)) k.setExpression(e);
  for (const e of ['earsFlat', 'tailPuff', 'blink', 'nod', 'shake', 'meow', 'sneeze', 'bowBounce']) k.emote(e);
  k.update(0.1); k.update(0.5);
  k.setExpression('worried');
});

test('props attach and detach; every prop and cage builds', () => {
  const k = getSwordcat();
  for (const p of ['milk_cup', 'lantern', 'spoon', 'letter', 'pot_helm']) { k.setProp(p, true); k.update(1 / 60); assert.ok(k.props[p].parent, p); k.setProp(p, false); assert.equal(k.props[p].parent, null); }
  k.setProp('letter', true, { at: 'belt' }); assert.equal(k.props.letter.parent, k.rig.hips); k.setProp('letter', false);
  for (const name of C.PROP_NAMES) assert.ok(C.buildProp(name), name);
  for (const style of ['carry', 'hanging', 'cart', 'kennel']) {
    const cage = C.buildCage({ style, ribbon: style === 'carry' });
    cage.userData.setOpen(1); assert.ok(cage.userData.door.rotation.y < -1);
  }
});

test('cape: verlet cloth stays pinned, hangs and keeps its constraints; sway cross-fade works', () => {
  const sim = new C.ClothSim();
  const pin = new THREE.Vector3();
  for (let c = 0; c < sim.C; c++) { C.drapePoint(c / (sim.C - 1), 0, sim.d, pin); sim.pins[c * 3] = pin.x; sim.pins[c * 3 + 1] = pin.y; sim.pins[c * 3 + 2] = pin.z; }
  for (let i = 0; i < 180; i++) sim.step(1 / 60, { x: 0.5, y: 0, z: -0.5 });
  for (let c = 0; c < sim.C; c++) assert.ok(Math.abs(sim.p[c * 3 + 1] - sim.pins[c * 3 + 1]) < 1e-6, 'top row pinned');
  const bottomY = sim.p[(sim.N - 5) * 3 + 1];
  assert.ok(bottomY < 0.25, `hem hangs down (${bottomY.toFixed(3)})`);
  for (let j = 0; j < sim.cons.length; j += 4) {
    if (sim.cons[j + 3] < 1 || (sim.pinned[sim.cons[j]] && sim.pinned[sim.cons[j + 1]])) continue;
    const a = sim.cons[j] * 3, b = sim.cons[j + 1] * 3;
    const d = Math.hypot(sim.p[a] - sim.p[b], sim.p[a + 1] - sim.p[b + 1], sim.p[a + 2] - sim.p[b + 2]);
    assert.ok(Math.abs(d - sim.cons[j + 2]) / sim.cons[j + 2] < 0.15, 'structural constraint holds');
  }
  const k = getSwordcat();
  k.setCapeMode('sway', { blend: 0.3, period: 3.8 }); for (let i = 0; i < 30; i++) k.update(1 / 60);
  assert.equal(k.cape.w, 1);
  k.setCapeMode('verlet', { blend: 0.6 }); for (let i = 0; i < 60; i++) k.update(1 / 60);
  assert.equal(k.cape.w, 0);
  k.setCape('cream'); assert.equal(k.capeStyle, 'cream');
});

test('fur quality switch updates live kittens', () => {
  const k = getSwordcat();
  assert.equal(C.shellsFor('hero'), 16);
  C.setFurQuality('low'); assert.equal(k.headFur.shells, C.FUR_QUALITY.low.hero);
  C.setFurQuality('off'); assert.equal(k.headFur.shells, 0); assert.equal(k.headFur.mesh.count, 1);
  C.setFurQuality('med'); assert.equal(k.headFur.shells, 16);
});

test('every named cat builds (lite and full tiers) with a small draw-call count', () => {
  for (const id of Object.keys(C.CATS)) {
    const k = C.buildKitten(C.CATS[id]);
    k.setPose('idle', { blend: 0 }); k.update(1 / 60);
    const calls = k.drawCalls();
    assert.ok(calls <= (k.lite ? 6 : 26), `${id}: ${calls} draw calls`);
    k.dispose();
  }
  const kitten = C.buildKitten(C.lostKittenConfig('biscuit')); kitten.update(1 / 60);
  assert.ok(kitten.lite && kitten.drawCalls() <= 4, 'lost kitten is lite');
  kitten.dispose();
});

test('beast heads: presets build, expressions animate, attach hides the KayKit head', () => {
  for (const p of ['hyena', 'pug', 'bulldog']) {
    const h = C.buildBeastHead(p, { size: 1.2, mane: true, chippedEar: 'left', scar: true, eyepatch: true, hornedHelm: true });
    for (const e of ['neutral', 'sneer', 'angry', 'laugh', 'sad', 'surprised']) { h.setExpression(e); h.update(0.05); }
    const b = new THREE.Box3().setFromObject(h.root); assert.ok(b.max.y - b.min.y > 0.8, `${p} size`);
  }
  // fake KayKit rig: head bone + head mesh
  const model = new THREE.Group(); const bone = new THREE.Bone(); bone.name = 'head'; bone.position.set(0, 1.24, 0); model.add(bone);
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(1.08, 1.05, 1.0).translate(0, 1.66, 0.03)); headMesh.name = 'Barbarian_Head'; model.add(headMesh);
  const chest = new THREE.Bone(); chest.name = 'chest'; chest.position.set(0, 0.97, 0); model.add(chest);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.96, 0.72).translate(0, 0.86, 0)); body.name = 'Barbarian_Body'; model.add(body);
  const head = C.attachBeastHead(model, 'hyena', { mane: true });
  assert.ok(head && head.root.parent === bone);
  assert.equal(headMesh.visible, false);
  const plate = C.attachPlate(model, 'GRUMP', { seed: 3 });
  assert.ok(plate && plate.parent === chest);
  assert.ok(C.PLATE_WORDS.includes('GRUMP') && C.PLATE_WORDS.includes('SNACK SNATCHER'));
});

test('sword skins build and track charge / valor glow', () => {
  for (const skin of ['borrowed', 'twig', 'fishbone', 'baguette', 'dawnblade']) {
    const s = C.buildSword(skin);
    s.setValorGlow(1); assert.ok(s.bladeMat.emissiveIntensity >= 0.6 - 1e-6, skin);
    s.setCharge(1); assert.ok(s.bladeMat.emissiveIntensity > 1, skin);
    s.dispose();
  }
});

test('asset manifest paths exist', () => {
  assert.ok(!manifest.some((f) => /Cinzel|Uncial|MedievalSharp/.test(f)), 'K9: no medieval faces');
  for (const p of manifest) assert.ok(fs.existsSync(path.join('public/assets', p)), p);
});

// ------------------------------------------------------------------ M1: in-game glue

class TestActor extends ScriptedActorMixin(Actor) {}

/** Minimal ctx for the characters glue (bus + a Game stand-in). Built locally so this suite does not import the
 *  other areas' systems (their files change under parallel work). */
function miniCtx() {
  return {
    bus: new EventBus(), quality: QUALITY.med, renderer: null, env: null, actors: null, levels: null,
    game: { mode: 'play', hitstopT: 0, frameCount: 0, realTime: 0, loop: { timeScale: 1 } },
  };
}

test('cape hangs BEHIND her even when the kitten spawns far from the origin (teleport-shift regression)', () => {
  const k = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  const holder = new THREE.Group(); holder.position.set(-4, 0, -58); holder.add(k.root);
  for (let i = 0; i < 40; i++) k.update(1 / 60, { wind: new THREE.Vector3(0.2, 0, 0.2) });
  const pos = k.cape.geo.attributes.position, C9 = k.cape.d.cols, R = k.cape.d.rows;
  for (let r = 3; r < R; r++) {
    const z = pos.getZ(k.cape.vertexIndex(Math.floor(C9 / 2), r));
    assert.ok(z < -0.08, `cape centre row ${r} hangs behind (local z ${z.toFixed(3)})`);
  }
  // a tail wind (blowing toward her face) must not wrap the cape forward either
  const k2 = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  for (let i = 0; i < 120; i++) k2.update(1 / 60, { wind: new THREE.Vector3(0, 0, 0.6) });
  const p2 = k2.cape.geo.attributes.position;
  assert.ok(p2.getZ(k2.cape.vertexIndex(4, k2.cape.d.rows - 1)) < -0.05, 'hem stays behind in a tail wind');
  k.dispose(); k2.dispose();
});

test('runtime: core QUALITY presets drive close-up / iso shells, tufts, outline tier; E.QUALITY switches them live', () => {
  // close-up counts = furShellsClose (kittens ×0.6), iso play counts = furShellsIso / kittenShellsIso (ART §6.1, X8)
  assert.deepEqual(C.furShellsForPreset(QUALITY.med), { hero: QUALITY.med.furShellsClose, kitten: Math.round(QUALITY.med.furShellsClose * 0.6), npc: 0 });
  assert.deepEqual(C.furIsoForPreset(QUALITY.high), { hero: QUALITY.high.furShellsIso, kitten: QUALITY.high.kittenShellsIso, npc: 0 });
  const ctx = miniCtx();
  ctx.quality = QUALITY.high;
  const st = C.initCharacters(ctx);
  assert.ok(st && C.initCharacters(ctx) === st, 'idempotent per ctx');
  assert.equal(C.shellsFor('hero'), QUALITY.high.furShellsClose);
  assert.equal(C.CHAR_Q.outline, QUALITY.high.outline); assert.equal(C.CHAR_Q.tufts, true); assert.equal(C.CHAR_Q.playLod, true);
  const k = C.buildKitten(C.swordcatConfig());           // tools LOD ('full'): always "close"
  ctx.bus.emit(E.QUALITY, { name: 'low', preset: QUALITY.low });
  assert.equal(k.headFur.shells, QUALITY.low.furShellsClose);
  assert.equal(C.CHAR_Q.tufts, false, 'Low: no tuft cards');
  ctx.bus.emit(E.QUALITY, { name: 'med', preset: QUALITY.med });
  assert.equal(k.headFur.shells, QUALITY.med.furShellsClose);
  // a play-LOD cat draws the iso count (0) with the fur base merged into the body draw
  const p = C.buildKitten(C.swordcatConfig(), { lod: 'play' });
  assert.equal(p.headFur.mesh.visible, false); assert.equal(p.kitMesh.geometry, p._playGeo);
  // PERF H4: a play cat bakes no hidden tail shells at spawn (was 16 copies, ~1.4 MB / ~20 ms per cat)
  const tg = p.tailFur.mesh.geometry, src = p.tailFur._src;
  assert.equal(p.tailFur.bakedShells, 0);
  assert.equal(tg.index.count, src.index.count, 'play tail fur = the base surface only');
  assert.equal(tg.attributes.position.count, src.attributes.position.count);
  assert.ok(p.prepareCloseUp(), 'idle-time close-up set');
  assert.equal(p.tailFur.bakedShells, QUALITY.med.furShellsClose, 'close-up copies reserved in idle time');
  assert.equal(p.tailFur.mesh.visible, false, 'still hidden in iso play');
  const baked = p.tailFur.mesh.geometry;
  p.setCloseUp(true); assert.equal(p.headFur.shells, QUALITY.med.furShellsClose); assert.ok(p.headFur.mesh.visible);
  assert.equal(p.tailFur.mesh.geometry, baked, 'no re-bake on the close-up frame');
  assert.equal(p.tailFur.shells, QUALITY.med.furShellsClose);
  assert.equal(p.tailFur.mesh.geometry.drawRange.count, p.tailFur.idxPerShell * (QUALITY.med.furShellsClose + 1));
  p.setCloseUp(false); assert.equal(p.tailFur.mesh.visible, false);
  p.dispose();
  // a kitten-tier play cat (Pearl / companions) likewise
  const q = C.buildKitten(C.CATS.mochi, { lod: 'play' });
  assert.equal(q.tailFur.bakedShells, 0);
  q.setCloseUp(true); assert.equal(q.tailFur.shells, C.shellsFor('kitten')); assert.equal(q.tailFur.bakedShells, C.shellsFor('kitten'));
  q.dispose();
  // visual dt: frozen in hitstop and the pause menu, scaled by slow motion
  ctx.game.loop = { timeScale: 0.5 };
  assert.equal(C.visualDt(ctx, 0.02), 0.01);
  ctx.game.hitstopT = 0.1; assert.equal(C.visualDt(ctx, 0.02), 0); ctx.game.hitstopT = 0;
  ctx.game.mode = 'menu'; assert.equal(C.visualDt(ctx, 0.02), 0); ctx.game.mode = 'play';
  st.dispose(); k.dispose();
});

test('Low quality: lighter cat meshes (charDetail) and shell fur baked only as far as it is drawn', () => {
  const tris = (k) => k.kitMesh.geometry.index.count / 3;
  const ctx = miniCtx();
  ctx.quality = QUALITY.low;
  const st = C.initCharacters(ctx);
  assert.equal(C.charDetail(), QUALITY.low.charDetail);
  const lo = C.buildKitten(C.swordcatConfig()), loMochi = C.buildKitten(C.CATS.mochi);
  // Low bakes only what Low draws: the close-up count (8), not MAX_SHELLS + 1 copies
  assert.equal(lo.tailFur.allocatedShells, QUALITY.low.furShellsClose);
  assert.equal(lo.tailFur.mesh.geometry.index.count, lo.tailFur.idxPerShell * (QUALITY.low.furShellsClose + 1));
  ctx.bus.emit(E.QUALITY, { name: 'med', preset: QUALITY.med });
  assert.equal(C.charDetail(), 1);
  const hi = C.buildKitten(C.swordcatConfig()), hiMochi = C.buildKitten(C.CATS.mochi);
  assert.ok(tris(lo) < tris(hi) * 0.5, `Low hero kit mesh ${tris(lo)} vs ${tris(hi)}`);
  assert.ok(tris(loMochi) < tris(hiMochi) * 0.6, `Low Mochi kit mesh ${tris(loMochi)} vs ${tris(hiMochi)}`);
  assert.ok(lo.headFur.mesh.geometry.index.count < hi.headFur.mesh.geometry.index.count * 0.5, 'Low head fur is lighter');
  // raising the quality re-bakes the Low-built tail on demand: the shells really draw
  assert.equal(lo.tailFur.shells, QUALITY.med.furShellsClose);
  assert.equal(lo.tailFur.allocatedShells, QUALITY.med.furShellsClose, 're-baked to what Med draws, not MAX_SHELLS');
  assert.equal(lo.tailFur.mesh.geometry.drawRange.count, lo.tailFur.idxPerShell * (QUALITY.med.furShellsClose + 1));
  assert.ok(lo.tailFur.mesh.geometry.index.count >= lo.tailFur.idxPerShell * (QUALITY.med.furShellsClose + 1));
  // Med builds bake what Med draws (16 + base), not the Ultra maximum
  assert.equal(hi.tailFur.allocatedShells, QUALITY.med.furShellsClose);
  for (const k of [lo, loMochi, hi, hiMochi]) k.dispose();
  st.dispose(); C.setCharDetail(1);
});

test('KittenView binds a kitten to an Actor: parenting, ScriptedActor hooks, Meme Cam cape, hitstop', () => {
  const ctx = miniCtx();
  const actor = new TestActor(ctx, { faction: 'player' }); actor.tags.add('player');
  const view = new C.KittenView(ctx, C.swordcatConfig({ cape: 'cream' }), { actor });
  assert.equal(view.root.parent, actor.object3d);
  view.bindScripted();
  actor.pose('kneel'); assert.equal(view.kitten.poseName, 'kneel');
  actor.prop('milk_cup', true); assert.ok(view.kitten.props.milk_cup.parent);
  actor.prop('milk_cup', false); assert.equal(view.kitten.props.milk_cup.parent, null);
  actor.emote('earsFlat'); assert.ok(view.kitten.emotes.earsFlat > 0);
  actor.vel.set(3, 0, 0); actor.onGround = true;
  view.render(1 / 60); view.render(1 / 60);
  assert.ok(view.kitten.drag.x < 0, 'fur drag trails the actor velocity');
  ctx.bus.emit(E.MEME_CAM, { on: true });
  for (let i = 0; i < 30; i++) view.render(1 / 60);
  assert.equal(view.kitten.cape.w, 1, 'Meme Cam: cape on the looping sway');
  ctx.bus.emit(E.MEME_CAM, { on: false });
  for (let i = 0; i < 60; i++) view.render(1 / 60);
  assert.equal(view.kitten.cape.w, 0, 'back to verlet');
  const t0 = view.kitten.time; ctx.game.hitstopT = 0.2; view.render(1 / 60);
  assert.equal(view.kitten.time, t0, 'hitstop freezes the visual clock');
  ctx.game.hitstopT = 0;
  // by id; companions do not follow the Meme Cam
  const npc = new C.KittenView(ctx, 'mochi', { actor: new TestActor(ctx) });
  assert.equal(npc.kitten.cfg.id, 'mochi');
  assert.throws(() => new C.KittenView(ctx, 'nobody'));
  view.dispose(); npc.dispose();
  assert.equal(view.root.parent, null);
});

test('K6: no PBR in play: kit / lids / bow / cape / blade are WarmToon or matcap, eyes unlit, no PMREM users', () => {
  const k = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  assert.equal(k.kitMat.type, 'MeshToonMaterial');
  assert.equal(k.kitMat.customProgramCacheKey(), 'sc-toon-v2');
  assert.equal(k.kitMatInst.type, 'MeshToonMaterial');
  assert.notEqual(k.kitMat, k.kitMatInst, 'per mesh kind: skinned and instanced never share one material (H3)');
  assert.equal(k.kitMatInst.userData.uniforms, k.kitMat.userData.uniforms, 'one holy / flash / highlight value');
  assert.ok(k.eyes.eyeMeshes[0].material.userData.fxBasic, 'eyes: unlit (the fx basic module, PERF §1.2)');
  let bowMat = null; k.bow.traverse((o) => { if (o.isMesh && !bowMat) bowMat = o.material; });
  assert.equal(bowMat.type, 'MeshToonMaterial');
  assert.equal(k.cape.mesh.material.type, 'MeshToonMaterial');
  // PERF §1.2: the steel blade is the shared sc-toon program (rmse.y = 1 shades it with the steel matcap in-draw)
  assert.equal(k.sword.bladeMat.type, 'MeshToonMaterial');
  assert.equal(k.sword.bladeMat.customProgramCacheKey(), 'sc-toon-v2');
  assert.equal(bowMat.customProgramCacheKey(), 'sc-toon-v2', 'the bow too (self-light / top glow are uniforms)');
  assert.ok(k.sword.blade.geometry.attributes.rmse.getY(0) > 0.9, 'steel rmse on the blade');
  let pbr = 0;
  k.root.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m?.isMeshStandardMaterial) pbr++; });
  assert.equal(pbr, 0, 'no Standard / Physical material on her');
  assert.equal(C.envMapUsers(), 0, 'the character PMREM is never rebuilt in play');
  for (const m of [k.kitMat, k.cape.mesh.material, bowMat]) assert.equal(m.dithering, true, 'X3 dithering');
  k.dispose();
});

test('WarmToon library: softRamp, per-kind toonLib, pooled per-actor materials, steel matcap, metal', () => {
  const r = C.softRamp();
  assert.equal(r.image.width, 4); assert.deepEqual([...r.image.data.filter((_, i) => i % 4 === 0)], C.TOON.ramp);
  assert.equal(C.makeToonMaterial().customProgramCacheKey(), 'sc-toon-v2');
  const plain = C.toonLib('plain'), skinned = C.toonLib('skinned');
  assert.notEqual(plain, skinned); assert.equal(C.toonLib('plain'), plain); assert.equal(C.kitMaterial(), plain);
  assert.ok(C.isSharedKit(plain));
  const a = C.getToonMaterial('rat_pike:skinned');
  a.userData.uniforms.uFlash.value = 0.35;
  C.releaseToonMaterial(a);
  const b = C.getToonMaterial('rat_pike:skinned');
  assert.equal(a, b, 'the pool hands the same material back (no compile, no clone on hit)');
  assert.equal(b.userData.uniforms.uFlash.value, 0, 'reset on reuse');
  const m = C.makeMetalMaterial({ emissive: true });
  assert.ok(m.isMeshMatcapMaterial && m.matcap === C.steelMatcap());
  assert.ok(m.userData.uniforms.uEmissive);
  C.setToonRim('#FFEEDD', 0.5); assert.equal(C.TOON_ENV.uRimK.value, 0.5);
  C.setToonRim(C.TOON.rim, C.TOON.rimK);
});

/** A tiny stand-in for a fitted KayKit clone: head/chest/hand bones + head/body meshes, scaled like fitToHeight. */
function fakeKayKit(scale = 0.6) {
  const model = new THREE.Group(); model.scale.setScalar(scale);
  const hips = new THREE.Bone(); hips.name = 'hips'; hips.position.set(0, 0.8, 0); model.add(hips);
  const chest = new THREE.Bone(); chest.name = 'chest'; chest.position.set(0, 0.17, 0); hips.add(chest);
  const head = new THREE.Bone(); head.name = 'head'; head.position.set(0, 0.27, 0); chest.add(head);
  for (const s of ['l', 'r']) { const h = new THREE.Bone(); h.name = 'handslot' + s; h.position.set(s === 'l' ? 0.6 : -0.6, 0.0, 0.1); chest.add(h); }
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(1.08, 1.05, 1.0).translate(0, 1.66, 0.03)); headMesh.name = 'Barbarian_Head'; model.add(headMesh);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.96, 0.72).translate(0, 0.86, 0)); body.name = 'Barbarian_Body'; model.add(body);
  return { model, head, chest, headMesh };
}

test('dressBeast: hyena head + config plate word, carried cage on the hand slot (scale-compensated), silhouette', () => {
  const { model, head, chest, headMesh } = fakeKayKit(0.6);
  const d = C.dressBeast(model, 'hyena', { seed: 4 });
  assert.ok(d.head && d.head.root.parent === head, 'beast head on bone head');
  assert.equal(headMesh.visible, false, 'KayKit head hidden');
  assert.ok(ENEMIES.hyena.plateWords.includes(d.word), `word ${d.word} from ENEMIES.hyena.plateWords`);
  assert.ok(d.plate && d.plate.parent === chest);
  assert.equal(C.dressBeast(fakeKayKit().model, 'hyena', { seed: 4 }).word, d.word, 'word is deterministic per seed');
  assert.equal(C.dressBeast(fakeKayKit().model, 'stealer').word, 'SNACK SNATCHER');
  assert.equal(C.dressBeast(fakeKayKit().model, 'cacklejaw').word, 'GRUMP-IN-CHIEF');
  assert.equal(C.dressBeast(fakeKayKit().model, 'pug').plate, null, 'pugs wear no word plate');
  const cage = d.hold('cage', 'l', { ribbon: true });
  assert.ok(cage && cage.parent.name === 'handslotl', 'cage held on handslot.l');
  model.updateMatrixWorld(true);
  const ws = new THREE.Vector3(); cage.getWorldScale(ws);
  assert.ok(Math.abs(ws.x - 1) < 1e-6, `cage keeps metre scale under a fitted model (x${ws.x.toFixed(3)})`);
  d.setExpression('laugh'); d.update(0.1);
  const restore = C.silhouette(model, '#101012');
  let flat = 0; model.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) flat++; });
  assert.ok(flat > 4, 'silhouette replaced the materials');
  restore();
  model.traverse((o) => { if (o.isMesh && o.name === 'beastSkull') assert.ok(!o.material.isMeshBasicMaterial, 'restored'); });
  d.dispose();
  assert.equal(d.head.root.parent, null);
});

test('cagedKitten: kitten fits inside the cage, door opens, release hands over a KittenView', () => {
  for (const style of ['carry', 'hanging', 'cart', 'kennel']) {
    const c = C.cagedKitten(null, style === 'carry' ? 'pearl' : 'mochi', { style, ribbon: style === 'carry' });
    c.render(1 / 60);
    c.root.updateMatrixWorld(true);
    const kb = new THREE.Box3().setFromObject(c.kitten.kitMesh), H = c.cage.userData.size?.[1] ?? 0.95;
    assert.ok(kb.max.y < H + 0.05, `${style}: kitten (${kb.max.y.toFixed(2)}) fits under the roof (${H})`);
    c.setOpen(1);
    const v = c.release();
    assert.ok(v instanceof C.KittenView && v.root.parent === null);
    v.dispose(); c.dispose();
  }
});

test('character env map follows the LIVE scene lights, lifted to the readability floors (night still reads silver)', () => {
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  // meadow_night-like lights: dim bluish hemisphere, weak moon
  const hemi = new THREE.HemisphereLight('#9FB0C8', '#2A3024', 0.7), sun = new THREE.DirectionalLight('#BFD3FF', 0.6);
  const night = C.envColorsFromLights(hemi, sun, { color: new THREE.Color('#8C97A6') });
  assert.ok(lum(night.top) >= C.CHAR_ENV.minTop - 1e-6, `sky reflection lifted (${lum(night.top).toFixed(3)})`);
  assert.ok(lum(night.horizon) >= C.CHAR_ENV.minHorizon - 1e-6, 'horizon lifted');
  assert.ok(lum(night.box) >= C.CHAR_ENV.minBox - 1e-6, 'softbox highlight lifted');
  assert.ok(night.top.b > night.top.r, 'the lift keeps the hue (moonlit blue)');
  assert.ok(lum(night.ground) < 0.1, 'ground stays dark: the contrast under the pauldron domes');
  // bright day: untouched by the floors
  const day = C.envColorsFromLights(new THREE.HemisphereLight('#D5DDE3', '#4A5230', 1.1), new THREE.DirectionalLight('#FFF2E0', 1.4), { color: new THREE.Color('#B7C0C3') });
  assert.ok(lum(day.top) > C.CHAR_ENV.minTop);
  // no hemisphere light (look-dev scenes): art.md's overcast defaults
  const none = C.envColorsFromLights(null, null, null);
  assert.equal('#' + none.top.getHexString(), C.CHAR_ENV.fallback.top.toLowerCase());
  // without a renderer nothing is built; noteRender ignores non-scenes; a kitten mesh reports its renderer + scene
  C.resetCharacterEnv();
  assert.equal(C.envTick(), false);
  C.noteRender({}, { isScene: false });
  assert.equal(C.envTick(), false);
  const k = C.buildKitten(C.CATS.pearl);
  assert.equal(k.kitMesh.onBeforeRender, C.noteRender, 'every kitten reports who draws it');
  assert.equal(C.getCharacterEnvMap(), null);
  k.dispose(); C.resetCharacterEnv();
});

test('cape never wraps in front of her: 180° snap re-drapes, a spin keeps the cloth behind the body plane', () => {
  const k = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  const holder = new THREE.Group(); holder.add(k.root);
  for (let i = 0; i < 30; i++) k.update(1 / 60);
  const maxLocalZ = () => {
    k.root.updateMatrixWorld(true);
    const inv = k.root.matrixWorld.clone().invert(), p = k.cape.sim.p, v = new THREE.Vector3();
    let m = -Infinity;
    for (let i = k.cape.d.cols; i < k.cape.sim.N; i++) { v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).applyMatrix4(inv); m = Math.max(m, v.z); }
    return m;
  };
  const limit = C.CAPE_FRONT.margin + C.CAPE_FRONT.marginLow + 0.02;
  assert.ok(maxLocalZ() < limit, 'hangs behind at rest');
  holder.rotation.y = Math.PI;                   // spawn facing applied after the first frame
  for (let i = 0; i < 3; i++) k.update(1 / 60);
  assert.ok(maxLocalZ() < limit, `180° facing snap: still behind (${maxLocalZ().toFixed(3)})`);
  for (let i = 0; i < 90; i++) { holder.rotation.y += 0.35; k.update(1 / 60, { velocity: new THREE.Vector3(2, 0, 0) }); }  // a full-circle spin
  assert.ok(maxLocalZ() < limit + 0.01, `spin: the plane keeps the cloth behind (${maxLocalZ().toFixed(3)})`);
  // visual folds open toward the hem (top row flat)
  assert.ok(Math.abs(C.capeFold(0.3, 0)) < 1e-12, 'top row flat');
  let fold = 0; for (let u = 0; u <= 1; u += 0.05) fold = Math.max(fold, Math.abs(C.capeFold(u, 1)));
  assert.ok(fold > 0.015, `folds at the hem (${fold.toFixed(3)})`);
  k.dispose();
});

test('soft shell fur: blended shells drawn bib → tail → head, tufts and whiskers after; seeded visual randomness', () => {
  const k = C.buildKitten(C.swordcatConfig());
  assert.ok(k.furMat.transparent && k.furMat.depthWrite && !k.furMat.alphaToCoverage, 'alpha-blended shells with depth writes');
  assert.ok(k.bibFur.mesh.renderOrder < k.headFur.mesh.renderOrder && k.tailFur.mesh.renderOrder < k.headFur.mesh.renderOrder);
  assert.ok(k.tuftMesh.renderOrder > k.headFur.mesh.renderOrder, 'tufts blend over the fur');
  assert.ok(k.root.getObjectByName('whiskers').renderOrder > k.headFur.mesh.renderOrder);
  assert.equal(k.furMat.uniforms.uCells.value, C.STRANDS.cells);
  const tex = C.makeStrandTexture(64, 12, 3);
  let covered = 0;
  for (let i = 0; i < 64 * 64; i++) if (tex.image.data[i * 4 + 1] > 0) covered++;
  assert.ok(covered > 64 * 64 * 0.4, `strands cover the root layer (${covered})`);
  // same cat id → same idle phase / blinks (deterministic screenshots), different ids differ
  const a = C.buildKitten(C.CATS.mochi), b = C.buildKitten(C.CATS.mochi), c = C.buildKitten(C.CATS.pearl);
  assert.equal(a.time, b.time); assert.equal(a.eyes.nextBlink, b.eyes.nextBlink); assert.notEqual(a.time, c.time);
  // the pink bow keeps a touch of self-light (recognition cue #1 in fog and at night)
  assert.ok(C.BOW_SELF_LIGHT > 0 && C.BOW_SELF_LIGHT < 0.5);
  for (const x of [k, a, b, c]) x.dispose();
});

test('Kitten.lib: the library is reachable from any built kitten (smoke tests against the bundled game)', () => {
  const k = C.buildKitten(C.CATS.pearl);
  const lib = k.root.userData.kitten.constructor.lib;
  for (const fn of ['buildKitten', 'buildProp', 'buildCage', 'buildBeastHead', 'buildPlate', 'catConfig', 'cagedKitten', 'characterEnvColors', 'getCharacterEnvMap']) assert.equal(typeof lib[fn], 'function', fn);
  assert.ok(lib.PROP_NAMES.includes('milk_cup') && lib.CATS.swordcat && lib.SQUIRE_IDS.length === 6);
  k.dispose();
});

test('cape render grid: Catmull-Rom up from the 9 x 13 sim, folds + baked fold shade, pinned neckline', () => {
  const k = C.buildKitten(C.swordcatConfig({ cape: 'cream' }));
  const holder = new THREE.Group(); holder.add(k.root);
  for (let i = 0; i < 20; i++) k.update(1 / 60);
  const cape = k.cape, d = cape.d;
  assert.equal(cape.rc, (d.cols - 1) * d.resX + 1); assert.equal(cape.rr, (d.rows - 1) * d.resY + 1);
  assert.ok(cape.rc >= 25 && cape.rr >= 25, `render grid ${cape.rc} x ${cape.rr} (folds need more than 9 columns)`);
  const pos = cape.geo.attributes.position, ao = cape.geo.attributes.capeAO;
  assert.equal(pos.count, cape.rc * cape.rr); assert.equal(ao.count, pos.count);
  let aoMin = 1, aoMax = 0;
  for (let i = 0; i < ao.count; i++) { aoMin = Math.min(aoMin, ao.getX(i)); aoMax = Math.max(aoMax, ao.getX(i)); }
  assert.ok(aoMin < 0.75 && aoMax >= 1, `fold valleys shaded (${aoMin.toFixed(2)}..${aoMax.toFixed(2)})`);
  // the render grid passes through the sim particles (top row = the pins), plus the fold offset
  k.root.updateMatrixWorld(true);
  const inv = k.root.matrixWorld.clone().invert(), v = new THREE.Vector3();
  for (const [c, r] of [[0, 0], [4, 0], [8, 0], [4, 6], [2, 12]]) {
    const i = r * d.cols + c;
    v.set(cape.sim.p[i * 3], cape.sim.p[i * 3 + 1], cape.sim.p[i * 3 + 2]).applyMatrix4(inv);
    const vi = cape.vertexIndex(c, r), u = c / (d.cols - 1), vv = r / (d.rows - 1);
    assert.ok(Math.abs(pos.getX(vi) - v.x) < 1e-3, `x at sim (${c},${r})`);
    assert.ok(Math.abs(pos.getY(vi) - (v.y + C.capeHem(u, vv, d))) < 1e-3, `y at sim (${c},${r})`);
    assert.ok(Math.abs(pos.getZ(vi) - (v.z + C.capeFold(u, vv, d))) < 1e-3, `z at sim (${c},${r})`);
  }
  // folds between the sim columns: depth along the hem row turns over several times (a 9-column grid alone can't)
  let turns = 0, prev = 0;
  for (let c = 1; c < cape.rc; c++) {
    const dz = pos.getZ((cape.rr - 1) * cape.rc + c) - pos.getZ((cape.rr - 1) * cape.rc + c - 1);
    if (prev && Math.sign(dz) !== Math.sign(prev)) turns++;
    prev = dz;
  }
  assert.ok(turns >= 5, `hem folds (${turns} turns)`);
  // neckline: the middle of the top edge rides higher than the shoulder corners
  assert.ok(C.drapePoint(0.5, 0).y > C.drapePoint(0, 0).y + 0.01, 'neckline arc');
  // NPC sway capes use the same fine grid + fold shade
  const pearl = C.buildKitten(C.CATS.pearl);
  assert.ok(pearl.swayCape && pearl.swayCape.geometry.attributes.capeAO, 'NPC cape: fine grid with fold shade');
  assert.equal(pearl.swayCape.geometry.attributes.position.count, cape.rc * cape.rr);
  k.dispose(); pearl.dispose();
});

test('cape after a teleport + turn of the PARENT (level load / respawn): pins follow the new transform at once', () => {
  const k = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  const actor = new THREE.Group(); const scene = new THREE.Group(); scene.add(actor); actor.add(k.root);
  for (let i = 0; i < 30; i++) k.update(1 / 60);
  // the actor moves and turns 180° this frame; nobody has updated its matrixWorld yet (requests/player.md)
  actor.position.set(12, 0, -40); actor.rotation.y = Math.PI;
  k.update(1 / 60);
  actor.updateMatrixWorld(true);
  const inv = k.root.matrixWorld.clone().invert(), p = k.cape.sim.p, v = new THREE.Vector3();
  let maxZ = -Infinity, far = 0;
  for (let i = k.cape.d.cols; i < k.cape.sim.N; i++) {
    v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).applyMatrix4(inv);
    maxZ = Math.max(maxZ, v.z); far = Math.max(far, Math.hypot(v.x, v.z));
  }
  assert.ok(maxZ < C.CAPE_FRONT.margin + C.CAPE_FRONT.marginLow + 0.02, `cloth behind her after the turn (max local z ${maxZ.toFixed(3)})`);
  assert.ok(far < 0.8, `cloth came along with the teleport (max local distance ${far.toFixed(2)})`);
  k.dispose();
});

test('ears clear the head fluff (ref2: big wide-set ears well above the fur); bow at the left ear base', () => {
  const k = C.buildKitten(C.swordcatConfig());
  k.setPose('idle', { blend: 0 }); k.update(1 / 60); k.root.updateMatrixWorld(true);
  const furLen = C.swordcatConfig().fur.len * 1.15;   // longest crown fur (headFurMask)
  // ear tip: the highest skin vertex skinned to earL (kitten space = bind space here). Full-detail ears are shell fur
  // (the skinned fur part shared with the tail): only its base layer (aShell 0) is the ear surface.
  const earIdx = C.BONE_NAMES.indexOf('earL');
  const tip = new THREE.Vector3(0, -Infinity, 0), p = new THREE.Vector3();
  for (const g of [k.kitMesh.geometry, k.tailFur?.mesh.geometry].filter(Boolean)) {
    const pos = g.attributes.position, si = g.attributes.skinIndex, sh = g.attributes.aShell;
    for (let i = 0; i < pos.count; i++) if (si.getX(i) === earIdx && (!sh || sh.getX(i) === 0) && pos.getY(i) > tip.y) tip.fromBufferAttribute(pos, i);
  }
  // fur surface: head fur base vertices (head space → kitten space) + the fur length
  const hp = k.headFur.mesh.geometry.attributes.position, hm = k.rig.head.matrixWorld;
  let crown = -Infinity, below = -Infinity;
  for (let i = 0; i < hp.count; i++) {
    p.fromBufferAttribute(hp, i).applyMatrix4(hm);
    crown = Math.max(crown, p.y);
    if (Math.abs(p.x - tip.x) < 0.015) below = Math.max(below, p.y);
  }
  crown += furLen; below += furLen;
  assert.ok(tip.y > crown + 0.015, `ear tips above the crown fluff (${(tip.y - crown).toFixed(3)} H)`);
  assert.ok(tip.y - below > 0.07, `ears stand ${(tip.y - below).toFixed(3)} H clear of the fur under them (ref2 ~0.08 H)`);
  assert.ok(tip.y > 0.97 && tip.y < 1.06, `ear tips at ~1 H (${tip.y.toFixed(3)})`);
  // the bow still sits at the base of her LEFT ear
  const bow = worldPos(k.bow); assert.ok(bow.x > 0.05 && bow.y > 0.85 && bow.y < 1.0);
  k.dispose();
});

test("props: 'name@mount' suffix through the plain prop(name, on) hook; CS-01 helmet on the head, then in her paw", () => {
  const k = C.buildKitten(C.swordcatConfig());
  assert.ok(C.PROP_NAMES.includes('helmet'));
  k.setProp('helmet', true);
  assert.equal(k.props.helmet.parent, k.rig.head, 'worn: on the head joint');
  k.setPose('idle', { blend: 0 }); k.update(1 / 60);
  // it covers her eyes (the gag): the rim sits below the eye line, the dome above the ear tips
  const helm = new THREE.Box3().setFromObject(k.props.helmet), eye = worldPos(k.eyes.eyes[0].eye);
  assert.ok(helm.min.y < eye.y && helm.max.y > 1.0, `helm ${helm.min.y.toFixed(2)}..${helm.max.y.toFixed(2)} vs eyes ${eye.y.toFixed(2)}`);
  const obj = k.props.helmet;
  k.setProp('helmet@paw', true);
  assert.equal(k.props.helmet, obj, 'same object, new mount');
  assert.equal(obj.parent, k.rig.pawL);
  assert.equal(k.props['helmet@paw'], undefined);
  k.setProp('helmet', false); assert.equal(obj.parent, null);
  k.setProp('letter@belt', true); assert.equal(k.props.letter.parent, k.rig.hips, 'CS-06 letter on the belt');
  assert.ok(C.buildProp('helmet@paw')?.name === 'helmet', 'buildProp ignores the mount suffix');
  k.dispose();
});

test('cape: no armour / leg pokes through the cloth in the standing, combat and kneeling poses', () => {
  for (const pose of ['vigil', 'idle', 'ready', 'kneel']) {
    const k = C.buildKitten(C.swordcatConfig());
    const holder = new THREE.Group(); holder.add(k.root);
    k.setPose(pose, { blend: 0 });
    for (let i = 0; i < 120; i++) k.update(1 / 60);
    k.root.updateMatrixWorld(true);
    const cp = k.cape.geo.attributes.position, km = k.kitMesh, kp = km.geometry.attributes.position;
    const v = new THREE.Vector3();
    let worst = 0;
    for (let i = 0; i < kp.count; i++) {
      km.getVertexPosition(i, v);
      if (v.z > -0.04) continue;
      let best = 1e9, bz = 0;
      for (let j = 0; j < cp.count; j++) { const dx = cp.getX(j) - v.x, dy = cp.getY(j) - v.y, d = dx * dx + dy * dy; if (d < best) { best = d; bz = cp.getZ(j); } }
      if (best < 0.012 * 0.012) worst = Math.max(worst, bz - v.z);
    }
    assert.ok(worst < 0.006, `${pose}: kit pokes ${(worst * 100).toFixed(1)} cm through the cape`);
    k.dispose();
  }
});

test('cape: a kitten running at a low frame rate (12 fps) keeps her cape trailing (pins slide through the sub-steps, no bunching)', () => {
  const k = C.buildKitten(C.swordcatConfig());
  const parent = new THREE.Group(); parent.add(k.root);
  k.setPose('ready', { blend: 0 });
  const vel = new THREE.Vector3(0, 0, 5.5), dt = 1 / 12;
  for (let i = 0; i < 20; i++) k.update(1 / 60, { velocity: new THREE.Vector3() });
  for (let i = 0; i < 60; i++) { parent.position.addScaledVector(vel, dt); k.update(dt, { velocity: vel }); }
  // rows in kitten space: monotonic downward / backward, and the cloth keeps most of its length (a bunched cape
  // collapses to the neckline height)
  const sim = k.cape.sim, inv = k.root.matrixWorld.clone().invert(), P = new THREE.Vector3();
  const row = (r) => { let y = 0, z = 0; for (let c = 0; c < sim.C; c++) { const i = (r * sim.C + c) * 3; P.set(sim.p[i], sim.p[i + 1], sim.p[i + 2]).applyMatrix4(inv); y += P.y; z += P.z; } return { y: y / sim.C, z: z / sim.C }; };
  const top = row(0), mid = row(6), hem = row(sim.R - 1);
  assert.ok(top.y - hem.y > 0.15, `hem hangs well below the neckline (${(top.y - hem.y).toFixed(3)})`);
  assert.ok(mid.y < top.y && hem.y < mid.y, 'rows hang in order');
  assert.ok(hem.z < top.z - 0.08, `the hem trails behind her (${(hem.z - top.z).toFixed(3)})`);
  k.dispose();
});

test('Swordcat cape is narrower than the pauldron line; dark coats get a tighter fur fringe', () => {
  assert.ok(C.swordcatConfig().capeDims.topW < 0.25 && C.swordcatConfig().capeDims.botW <= 0.45);
  const mochi = C.buildKitten(C.CATS.mochi), ginger = C.buildKitten(C.swordcatConfig());
  assert.ok(mochi.furMat.uniforms.uFringe.value < 1 && mochi.furMat.uniforms.uEdgeStart.value < ginger.furMat.uniforms.uEdgeStart.value);
  assert.equal(ginger.furMat.uniforms.uFringe.value, 1);
  mochi.dispose(); ginger.dispose();
});

test('dispose frees every geometry, the per-kitten materials and the bone texture', () => {
  const k = C.buildKitten(C.swordcatConfig());
  k.update(1 / 60);
  const geos = new Set(), mats = new Set();
  k.root.traverse((o) => { if (o.geometry) geos.add(o.geometry); });
  for (const m of [k.auraMat, k.furMat, k.furMatBaked, k.kitMat]) if (m) mats.add(m);
  const freed = new Set();
  for (const g of geos) g.addEventListener('dispose', () => freed.add(g));
  for (const m of mats) m.addEventListener('dispose', () => freed.add(m));
  let skel = false; const sd = k.skeleton.dispose.bind(k.skeleton); k.skeleton.dispose = () => { skel = true; sd(); };
  k.dispose();
  for (const name of ['whiskers', 'shadowProxy', 'aura', 'kitBody', 'tufts', 'furTail', 'furHead', 'cape']) {
    let found = false;
    k.root.traverse((o) => { if (o.name === name && o.geometry) { found = true; assert.ok(freed.has(o.geometry), `${name} geometry disposed`); } });
    assert.ok(found, `${name} present`);
  }
  for (const m of mats) assert.ok(freed.has(m), 'per-kitten material disposed');
  assert.ok(skel, 'skeleton (bone texture) disposed');
});

test('cape never folds over her head: Tumble roll (body flips over) and a deep hunch keep the cloth behind the neckline', () => {
  const k = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  const J = k.rig.joints, ax = new THREE.Vector3(1, 0, 0), piv = new THREE.Vector3(0, 0.42, 0), q = new THREE.Quaternion(), v = new THREE.Vector3();
  const E = (x) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, 0, 0));
  assert.ok(k.rig.bodyBind, 'rig exposes the body bind matrix');
  const overNeck = () => {
    k.root.updateMatrixWorld(true);
    const toBind = new THREE.Matrix4().multiplyMatrices(k.rig.chestBind, J.chest.matrixWorld.clone().invert());
    const p = k.cape.sim.p, d = k.cape.d; let m = -Infinity;
    for (let i = d.cols; i < k.cape.sim.N; i++) {
      v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).applyMatrix4(toBind);
      m = Math.max(m, ((v.y - d.anchorY) + C.CAPE_NECK.tilt * (v.z - d.anchorZ)) / Math.hypot(1, C.CAPE_NECK.tilt));
    }
    return m;
  };
  for (let i = 0; i < 60; i++) k.update(1 / 60);
  // the player's Tumble: a full forward roll of the body joint about a mid-height pivot in 0.4 s while dashing
  let worst = -Infinity;
  for (let t = 0; t < 0.7; t += 1 / 60) {
    k.animate(1 / 60);
    if (t < 0.4) {
      const u = t / 0.4, th = Math.PI * 2 * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, u / 0.9))), tuck = Math.sin(u * Math.PI);
      J.chest.quaternion.multiply(E(0.5 * tuck)); J.head.quaternion.multiply(E(0.45 * tuck));
      q.setFromAxisAngle(ax, th); J.body.quaternion.premultiply(q);
      J.body.position.sub(piv).applyQuaternion(q).add(piv); J.body.position.y += 0.3 * Math.sin(th * 0.5);
    }
    k.root.position.z += 6 / 60;
    k.simulate(1 / 60, { velocity: new THREE.Vector3(0, 0, 6) });
    worst = Math.max(worst, overNeck());
  }
  assert.ok(worst < C.CAPE_NECK.margin + 0.02, `roll: cloth stays off her head (${worst.toFixed(3)})`);
  // a deep forward hunch held for a while (chest pitched past horizontal)
  for (let i = 0; i < 90; i++) { k.animate(1 / 60); J.chest.quaternion.multiply(E(Math.min(1, i / 20) * 2.2)); k.simulate(1 / 60); }
  assert.ok(overNeck() < C.CAPE_NECK.margin + 0.02, `hunch: cloth stays off her head (${overNeck().toFixed(3)})`);
  k.dispose();
});

test('tuft cards: toon-lit alpha-test cut-outs in one pass (no sorting, no re-resolve); 32 hero / 20 kitten crossed pairs', async () => {
  const { tuftMaterial } = await import('../../src/characters/materials.js');
  const m = tuftMaterial();
  assert.equal(m.side, THREE.DoubleSide);
  assert.equal(m.type, 'MeshToonMaterial');
  assert.ok(!m.transparent && m.depthWrite && m.alphaTest === C.TUFT.alphaTest);
  assert.equal(m.forceSinglePass, true, 'DoubleSide without forceSinglePass draws twice and flips needsUpdate every draw');
  assert.notEqual(tuftMaterial('plain'), m, 'per mesh kind');
  const hero = C.buildKitten(C.swordcatConfig());
  assert.equal(hero.tuftMesh.userData.cards, 32);
  assert.equal(hero.tuftMesh.geometry.index.count / 3, 32 * 4, 'crossed pair of quads = 4 tris each (128 tris, 1 draw)');
  const mochi = C.buildKitten(C.CATS.mochi);
  assert.equal(mochi.tuftMesh.userData.cards, 20);
  C.setCharQuality({ tufts: false });
  const low = C.buildKitten(C.swordcatConfig());
  assert.equal(low.tuftMesh, undefined, 'Low: no tuft cards');
  C.setCharQuality({ tufts: true });
  for (const k of [hero, mochi, low]) k.dispose();
});

// ================================================================== M2 (Acts I–II)

test('M2: hub residents and the Spoon Brigade resolve through catConfig (cheap tier, activity pose / props)', () => {
  for (const id of C.KITTEN_IDS) {
    const hub = C.catConfig('hub_' + id), sp = C.catConfig('spoon_' + id);
    assert.ok(hub && sp, id);
    assert.equal(hub.tier, 'lite'); assert.equal(sp.tier, 'lite');
    assert.equal(hub.id, 'hub_' + id); assert.equal(sp.id, 'spoon_' + id);
    assert.ok(C.HUB_ACTIVITY[id], `§12.5 activity for ${id}`);
    assert.equal(hub.pose, C.HUB_ACTIVITY[id].pose);
    assert.equal(sp.pose, 'spoonReady');
    assert.ok(sp.props.some((p) => p.startsWith('spoon')) && sp.props.some((p) => p === 'pot_helm' || p === 'colander'));
    assert.deepEqual(hub.coat, C.lostKittenConfig(id).coat, 'same coat as the lost kitten (they are the same cats)');
  }
  assert.equal(C.catConfig('spoon:tater:1').props[0], 'colander');
  assert.equal(C.catConfig('hub:juniper').props[0], 'book@upsidedown');
  assert.equal(C.catConfig('spoon_nobody'), null);
  assert.equal(C.catConfig(42), null);
});

test('M2: every activity pose and prop named in HUB_ACTIVITY exists', () => {
  const poses = new Set([...C.POSE_NAMES, ...C.EXTRA_POSE_NAMES]);
  for (const [id, a] of Object.entries(C.HUB_ACTIVITY)) {
    assert.ok(poses.has(a.pose) && C.POSES[a.pose], `${id}: pose ${a.pose}`);
    if (a.prop) assert.ok(C.PROP_NAMES.includes(a.prop.split('@')[0]), `${id}: prop ${a.prop}`);
    for (const w of a.world ?? []) assert.ok(C.PROP_NAMES.includes(w), `${id}: world prop ${w}`);
  }
  for (const n of C.EXTRA_POSE_NAMES) assert.ok(C.POSES[n], n);
});

test('M2: Sage, Clover, Tofu, Earl Grey, Pip and Marmalade build with their silhouette props', () => {
  const want = { sage: ['hood', 'shortBow', 'quiver'], clover: ['coif', 'bellCollar', 'flowerStaff'], tofu: ['apron'], earlgrey: ['wizardHat', 'glasses', 'floatingBook'], pip: ['scarf', 'dagger'], marmalade: ['plumedHelm', 'eyepatch'] };
  for (const [id, acc] of Object.entries(want)) {
    const ids = C.CATS[id].accessories.map((a) => (typeof a === 'string' ? a : a.id));
    for (const a of acc) assert.ok(ids.includes(a), `${id} wears ${a}`);
    const k = C.buildKitten(C.CATS[id]);
    assert.equal(k.root.name, 'kitten:' + id);
    assert.ok(k.drawCalls() <= 16, `${id}: ${k.drawCalls()} draw calls`);
    k.dispose();
  }
});

test('M2: the hood / coif shell opens toward the face (eyes uncovered) and covers crown + back', async () => {
  const { hoodShellGeometry } = await import('../../src/characters/Accessories.js');
  for (const o of [{ radii: [0.212, 0.188, 0.198], center: [0, 0.172, -0.014], face: [0, -0.32, 1], open: 1.08, thetaEnd: Math.PI * 0.74 },
    { radii: [0.208, 0.186, 0.194], center: [0, 0.168, -0.01], face: [0, -0.38, 1], open: 1.12, thetaEnd: Math.PI * 0.72 }]) {
    const g = hoodShellGeometry(o);
    const p = g.geo.attributes.position, idx = g.geo.index.array;
    const a = v(), b = v(), c = v();
    for (let i = 0; i < idx.length; i += 3) {
      a.fromBufferAttribute(p, idx[i]); b.fromBufferAttribute(p, idx[i + 1]); c.fromBufferAttribute(p, idx[i + 2]);
      const m = a.add(b).add(c).divideScalar(3);
      const overEyes = m.z > 0.1 && Math.abs(m.y - 0.158) < 0.05 && Math.abs(m.x) < 0.11;   // eyes at (±0.074, 0.158, 0.118)
      assert.ok(!overEyes, `shell triangle over the eyes at ${m.toArray().map((x) => x.toFixed(3))}`);
    }
    let top = false, back = false;
    for (let i = 0; i < p.count; i++) { if (p.getY(i) > 0.35) top = true; if (p.getZ(i) < -0.18) back = true; }
    assert.ok(top && back, 'covers the crown and the back of the head');
    assert.ok(g.rim.length > 16, 'a rim curve frames the face');
  }
});

test('M2: Spoon Brigade / hub cats are cheap (sheen fur, few draw calls); the spoon is in the right fist', () => {
  for (const id of ['spoon_tater', 'spoon_mittens', 'hub_biscuit', 'hub_pickles']) {
    const k = C.buildKitten(C.catConfig(id));
    assert.ok(k.lite, `${id} lite`);
    assert.ok(k.drawCalls() <= 7, `${id}: ${k.drawCalls()} calls`);
    if (id.startsWith('spoon')) {
      assert.equal(k.props.spoon?.parent, k.rig.pawR, 'spoon in the right paw');
      assert.equal(k.poseName, 'spoonReady');
    }
    k.dispose();
  }
});

test('M2: wave / throw emotes animate the right arm and settle back', () => {
  const k = C.buildKitten(C.catConfig('spoon_tater'));
  k.update(0.016);
  const rest = k.rig.shoulderR.quaternion.clone();
  k.emote('throw');
  let maxDev = 0;
  for (let i = 0; i < 40; i++) { k.update(1 / 60); maxDev = Math.max(maxDev, k.rig.shoulderR.quaternion.angleTo(rest)); }
  assert.ok(maxDev > 1.0, `throw winds the arm up (${maxDev.toFixed(2)} rad)`);
  assert.ok(k.rig.shoulderR.quaternion.angleTo(rest) < 0.15, 'throw settles back into the stance');
  assert.ok(C.EMOTE_RELEASE.throw > 0 && C.EMOTE_RELEASE.throw < 1 && C.EMOTE_DUR.throw > 0);
  k.emote('wave');
  k.update(0.3);
  assert.ok(k.emotes.wave > 0);
  k.dispose();
});

test('M2: new props build as cheap meshes with mounts; cheese gear follows the §11.2 sizes', () => {
  for (const n of ['book', 'fishing_rod', 'bread_basket', 'teacup', 'hammer', 'butterfly', 'feathered_hat', 'cheese_shield', 'cheese_wheel', 'cheese_wheel_giant', 'cheese_wedge']) {
    assert.ok(C.PROP_NAMES.includes(n), n);
    const o = C.buildProp(n);
    assert.ok(o?.isObject3D, n);
    let meshes = 0; o.traverse((c) => { if (c.isMesh) meshes++; });
    assert.ok(meshes >= 1 && meshes <= 3, `${n}: ${meshes} meshes`);
  }
  const sh = C.buildProp('cheese_shield'); sh.geometry.computeBoundingBox();
  const bs = sh.geometry.boundingBox;
  assert.ok(Math.abs((bs.max.x - bs.min.x) / 2 - 0.45) < 0.03, 'cheese shield r 0.45');
  const gw = C.buildProp('cheese_wheel_giant');
  assert.equal(gw.userData.radius, 0.8); assert.equal(gw.userData.width, 0.6);
  const before = gw.rotation.x; gw.userData.roll(0.8); assert.ok(Math.abs(gw.rotation.x - before - 1) < 1e-9, 'rolls one radian per radius travelled');
  const col = sh.geometry.attributes.color; let mn = 9, mx = 0;
  for (let i = 0; i < col.count; i++) { mn = Math.min(mn, col.getX(i)); mx = Math.max(mx, col.getX(i)); }
  assert.ok(mx - mn > 0.2, 'cheese holes / rind shading');
  const hat = C.buildProp('feathered_hat', { size: 0.84 }); hat.geometry.computeBoundingBox();
  assert.ok(hat.geometry.boundingBox.max.x - hat.geometry.boundingBox.min.x > 0.7, 'feathered hat scales with size');
  const k = C.buildKitten(C.CATS.earlgrey);
  k.setProp('book@upsidedown', true);
  assert.equal(k.props.book.parent, k.rig.pawL);
  assert.ok(Math.abs(k.props.book.rotation.z - Math.PI) < 1e-6);
  k.dispose();
});

test('M2: all 7 sword skins and 7 capes (§13.4 / §13.5); the bow stays pink on the left ear', () => {
  assert.deepEqual([...C.SWORD_SKINS], ['borrowed', 'twig', 'fishbone', 'baguette', 'diamond', 'toobig', 'dawnblade']);
  const k = C.buildKitten(C.swordcatConfig({ cape: 'cream' }));
  for (const s of C.SWORD_SKINS) { k.setSword(s); assert.equal(k.sword.skin, s); }
  k.setSword('dawnblade');
  assert.ok(k.sword.sparkles?.isPoints, 'Dawnblade has sparkles');
  assert.equal(k.sword.sparkles.geometry.attributes.position.count, 20, '20 sparkles (§13.4)');
  assert.ok(k.sword.bladeMat.emissiveIntensity > 1, 'permanent gold emissive');
  // §13.3 / §13.5 hues, with the ART §2.6 lifts (red) and WA §3.3 (Meme White → cream + pink hem; no near-black capes)
  const spec = { red: '#D9323F', memeWhite: '#FFF3E2', blue: '#3F6FB5', green: '#5E7F3E', midnight: '#3A3F5E', gold: '#D9B26A' };
  assert.equal(C.CAPES.memeWhite.hem.toUpperCase(), '#FF9EC0');
  for (const id of ['cream', ...Object.keys(spec)]) {
    assert.ok(C.CAPES[id], id);
    if (spec[id]) assert.equal(C.CAPES[id].color.toUpperCase(), spec[id], `${id} colour per §13.3/§13.5`);
    k.setCape(id);
    assert.equal(k.capeStyle, id);
    assert.equal(k.bow.parent, k.rig.earL);
    assert.ok(k.bow.visible);
  }
  assert.equal(C.swordcatConfig({ cape: 'red' }).bow.color, C.PAL.bow);
  k.dispose();
});

/** A fake GLB sword: wide guard at y 0, blade along `dir` (±1), grip on the other side. */
function fakeSword(dir, blade = 0.7, grip = 0.2) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, blade, 0.02).translate(0, dir * blade / 2, 0)));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.04)));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, grip, 0.03).translate(0, -dir * grip / 2, 0)));
  return g;
}

test('M2: GLB sword skins mount at their own crossguard and auto-orient (tip up)', () => {
  const sw = C.buildSword('diamond', { model: fakeSword(-1) });      // built tip-DOWN: exercises the auto flip
  sw.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sw.group.getObjectByName('swordModel'));
  assert.ok(box.max.y > 0.6, `blade points up (max y ${box.max.y.toFixed(2)})`);
  assert.ok(box.min.y > -0.3 && box.min.y < -0.05, `grip hangs below the origin (min y ${box.min.y.toFixed(2)})`);
  assert.ok(Math.abs(sw.tip.position.y - box.max.y) < 0.05, 'tip anchor at the model tip (trail / hit point)');
});

test('M2: Even More Too Big drags its tip on the ground instead of sinking into it', () => {
  const k = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  k.setSword({ skin: 'toobig', model: fakeSword(1, 1.2, 0.3) });
  k.setPose('idle', { blend: 0 });
  for (let i = 0; i < 3; i++) k.update(1 / 60);
  k.root.updateMatrixWorld(true);
  const tip = k.sword.tip.getWorldPosition(v());
  assert.ok(tip.y >= 0 && tip.y < 0.05, `tip on the ground (y ${tip.y.toFixed(3)})`);
  k.dispose();
});

test('M2: shader warm-up shows hidden aura / streak with an empty draw range for one frame, then restores', () => {
  const k = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  const objs = k.warmObjects();
  assert.ok(objs.length >= 3, 'aura head + body + blade streak');
  assert.ok(objs.every((o) => !o.visible));
  assert.equal(k.warmBegin(), objs.length);
  assert.ok(objs.every((o) => o.visible && o.geometry.drawRange.count === 0 && !o.frustumCulled));
  assert.equal(k.warmBegin(), 0, 'idempotent until warmEnd');
  k.warmEnd();
  assert.ok(objs.every((o) => !o.visible && o.geometry.drawRange.count === Infinity));
  k.warmBegin(); k.setHoly(1); k.warmEnd();
  assert.ok(k.auraMeshes.every((m) => m.visible) && k.sword.streak.visible, 'holy turned on during the warm frame survives the restore');
  assert.equal(k.warmups, 2);
  k.dispose();
});

test('M2: KittenView warms after build / level load / quality change, only when a frame hook can restore it', () => {
  const bus = new EventBus();
  const hooks = new Set();
  const ctx = { bus, game: { frameCount: 0, addFrameHook: (fn) => { hooks.add(fn); return () => hooks.delete(fn); }, hitstopT: 0, mode: 'play' } };
  const view = new C.KittenView(ctx, C.swordcatConfig({ cape: 'red' }));
  const frame = () => { ctx.game.frameCount++; view.render(1 / 60); for (const h of hooks) h(1 / 60); };
  frame(); frame(); frame();
  assert.equal(view.kitten.warmups, 2, 'two warm frames after build');
  assert.ok(view.kitten.auraMeshes.every((m) => !m.visible), 'restored after the frame');
  bus.emit(E.LEVEL_LOADED, { id: 'meadow' });
  frame(); frame(); frame();
  assert.equal(view.kitten.warmups, 4);
  view.dispose();
  assert.equal(hooks.size, 0, 'frame hook removed on dispose');
  const tool = new C.KittenView(null, 'mochi');
  tool.render(1 / 60);
  assert.ok(!tool.kitten.warmups, 'no ctx / frame hook: never warms');
  tool.dispose();
});

test('M2: fur distance LOD — full shells in close-ups, fewer at the follow camera, none past ~8 m', () => {
  const L = C.Kitten.lib.FUR_LOD;
  assert.ok(L.far <= 8.5 && L.near < 3.6 && L.min >= 1);
  const k = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  k.setFurShells(16);
  const cam = new THREE.PerspectiveCamera();
  const at = (d) => { cam.position.set(0, 0.8, d); cam.updateMatrixWorld(); k.root.updateMatrixWorld(true); k.headFur._lod(cam); return k.headFur._lodN; };
  assert.equal(at(1.5), 16);
  const follow = at(3.6);
  assert.ok(follow < 16 && follow >= 10, `follow camera ${follow}`);
  assert.equal(at(9), 0);
  k.dispose();
});

// ---------------------------------------------------------------- controls rework (research/CONTROLS_SPEC.md §3, §7.4, §12)

const resetView = () => { C.FUR_VIEW.focusOn = false; C.FUR_VIEW.camDist = 0; C.FUR_VIEW.focus.set(0, 0, 0); C.TOP_VIEW.value = 0; };
const proxyBounds = (p) => {
  p.parent.updateMatrixWorld(true); p.skeleton.update();
  const box = new THREE.Box3(), q = v();
  for (let i = 0; i < p.geometry.attributes.position.count; i++) { p.getVertexPosition(i, q); box.expandByPoint(q.applyMatrix4(p.matrixWorld)); }
  return box;
};

test('controls: x-ray silhouette proxy — one hidden skinned draw that covers body, ears, bow (LEFT) and sword', () => {
  const k = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  const scene = new THREE.Scene(); scene.add(k.root);
  const p = k.getSilhouetteProxy();
  assert.ok(p?.isSkinnedMesh, 'a SkinnedMesh');
  assert.equal(p.parent, k.root, 'parented to the kitten root');
  assert.equal(p.visible, false, 'hidden until the camera shows it');
  assert.equal(p.castShadow, false);
  assert.equal(p.material.depthFunc, THREE.GreaterDepth, 'draws only where something is in front');
  assert.equal(p.material.depthWrite, false);
  assert.equal(p.material.userData.uniforms.uFogK.value, 0, 'unfogged (the flat program in x-ray mode, PERF §1.2)');
  assert.ok(Math.abs(p.material.opacity - C.XRAY.alpha) < 1e-6 && C.XRAY.alpha === 0.55 && C.XRAY.color === '#FFE4EC');
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0.5, 5), new THREE.Vector3(0, 0, -1));
  const hits = []; p.raycast(ray, hits); assert.equal(hits.length, 0, 'never raycast (camera picking)');
  const names = p.skeleton.bones.map((b) => b.name);
  for (const n of ['bow', 'blade', 'furHead', 'chest', 'hips', 'earL', 'earR']) assert.ok(names.includes(n), `proxy follows ${n}`);
  for (const n of ['cape', 'aura', 'holyStreak', 'blob', 'shadowProxy', 'tufts']) assert.ok(!names.includes(n), `no ${n} in the proxy`);
  const box = proxyBounds(p);
  const bow = new THREE.Box3().setFromObject(k.bow, true), blade = new THREE.Box3().setFromObject(k.sword.blade, true);
  assert.ok(box.containsBox(bow.clone().expandByScalar(-0.01)), 'covers the bow');
  assert.ok(bow.getCenter(v()).x > 0, 'bow on the LEFT ear (+X)');
  assert.ok(box.max.y >= blade.max.y - 0.03 && box.min.y <= blade.min.y + 0.03, 'covers the sword');
  assert.ok(box.max.y < 1.2 && box.max.y > 0.95, `proxy height ${box.max.y.toFixed(2)}`);
  // rebuilt in place after a sword swap (the camera keeps its handle)
  const anchors0 = p.skeleton.bones.length;
  k.setSword(null);
  assert.equal(k.getSilhouetteProxy(), p, 'same mesh object');
  assert.ok(!p.skeleton.bones.some((b) => b.name === 'blade') && p.skeleton.bones.length < anchors0, 'no blade without a sword');
  k.setSword('borrowed');
  assert.ok(k.getSilhouetteProxy().skeleton.bones.some((b) => b.name === 'blade'));
  k.dispose();
  assert.equal(p.parent, null, 'disposed with the kitten');
});

test('controls: proxy collapses a hidden or detached rigid part on the next draw', () => {
  const k = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  const p = k.getSilhouetteProxy();
  k.root.updateMatrixWorld(true); p.skeleton.update();
  const bi = p.skeleton.bones.findIndex((b) => b.name === 'blade');
  const M = p.skeleton.boneMatrices;
  assert.ok(M.slice(bi * 16, bi * 16 + 16).some((x) => x !== 0));
  k.sword.group.visible = false;
  p.onBeforeRender();
  assert.ok(M.slice(bi * 16, bi * 16 + 16).every((x) => x === 0), 'hidden sword draws nothing');
  k.sword.group.visible = true;
  p.skeleton.update(); p.onBeforeRender();
  assert.ok(M.slice(bi * 16, bi * 16 + 16).some((x) => x !== 0), 'shown again');
  k.dispose();
});

test('controls: generic proxy for a skinned beast + rigid helmet (one skeleton, one draw)', () => {
  const root = new THREE.Group(); root.name = 'beast';
  const b0 = new THREE.Bone(), b1 = new THREE.Bone(); b0.name = 'Body'; b1.name = 'Head'; b1.position.y = 1; b0.add(b1); root.add(b0);
  root.updateMatrixWorld(true);
  const geo = new THREE.CylinderGeometry(0.3, 0.3, 2, 8, 4).translate(0, 1, 0);
  const n = geo.attributes.position.count, si = [], sw = [];
  for (let i = 0; i < n; i++) { si.push(geo.attributes.position.getY(i) > 1 ? 1 : 0, 0, 0, 0); sw.push(1, 0, 0, 0); }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const body = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial()); root.add(body);
  body.bind(new THREE.Skeleton([b0, b1]));
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshStandardMaterial()); helm.name = 'Knight_Helmet'; helm.position.y = 0.9; b1.add(helm);
  const fx = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial()); fx.name = 'shadowDecal'; root.add(fx);
  const actor = { object3d: root, visual: root };
  const p = C.getSilhouetteProxy(actor);
  assert.ok(p?.isSkinnedMesh && p.parent === root);
  assert.equal(C.getSilhouetteProxy(actor), p, 'cached');
  assert.deepEqual(p.skeleton.bones.map((b) => b.name).sort(), ['Body', 'Head', 'Knight_Helmet'].sort());
  const box = proxyBounds(p);
  assert.ok(box.min.y < 0.05 && box.max.y > 2.1 && box.max.x < 0.5, `fits the beast (${box.min.y.toFixed(2)}..${box.max.y.toFixed(2)})`);
  assert.ok(Math.abs(p.material.opacity - C.XRAY.enemyAlpha) < 1e-6, 'enemies at 0.45');
  C.setXray(actor, true, { color: '#FF6A3D' });
  assert.ok(p.visible && p.material.color.getHexString() === 'ff6a3d', 'telegraph tint');
  C.setXray(actor, false);
  assert.equal(p.visible, false);
  root.updateMatrixWorld(true); p.skeleton.update();
  const hi = p.skeleton.bones.indexOf(helm);
  helm.removeFromParent(); p.onBeforeRender();
  assert.ok(p.skeleton.boneMatrices.slice(hi * 16, hi * 16 + 16).every((x) => x === 0), 'a dropped helmet collapses');
});

test('controls: setHighlight — kitten rim uniform (own material clone) and emissive on other models', () => {
  const k = C.buildKitten(C.catConfig('mochi'));
  const shared = k.kitMat;
  assert.equal(C.setHighlight({ object3d: k.root }, '#FFFFFF', 1), true);
  if (shared === C.kitMaterial()) assert.notEqual(k.kitMat, shared, 'shared kit material cloned for this cat only');
  assert.equal(k.kitMesh.material, k.kitMat);
  const u = k.kitMat.userData.uniforms.uHighlight.value;
  assert.ok(Math.abs(u.r - C.HIGHLIGHT.gain) < 1e-6);
  if (k.furMat) assert.ok(k.furMat.uniforms.uHighlight.value.r > 0.4, 'fur rim too');
  assert.equal(C.kitMaterial().userData.uniforms.uHighlight.value.r, 0, 'the shared material is untouched');
  C.setHighlight(k.root, null);
  assert.equal(u.r, 0);
  assert.equal(k.highlight, null);
  k.dispose();
  const mat = new THREE.MeshStandardMaterial({ emissive: '#101010' });
  const a = new THREE.Mesh(new THREE.BoxGeometry(), mat), b = new THREE.Mesh(new THREE.BoxGeometry(), mat);
  const g = new THREE.Group(); g.add(a);
  C.setHighlight(g, '#FF6A3D', 1);
  assert.notEqual(a.material, mat, 'cloned');
  assert.ok(a.material.userData.assetOwned, 'freed by disposeInstance');
  assert.equal(b.material, mat, 'other instances keep the shared material');
  assert.ok(a.material.emissive.r > mat.emissive.r + 0.2);
  C.setHighlight(g, null);
  assert.ok(Math.abs(a.material.emissive.r - mat.emissive.r) < 1e-6, 'restored');
});

test('controls: helmet tops take a contrasting top colour (one clone per material)', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#8A8D90' });
  const g = new THREE.Group();
  const h1 = new THREE.Mesh(new THREE.SphereGeometry(), mat); h1.name = 'kettleHelm';
  const h2 = new THREE.Mesh(new THREE.SphereGeometry(), mat); h2.name = 'Knight_Helmet';
  const body = new THREE.Mesh(new THREE.BoxGeometry(), mat); body.name = 'torso';
  g.add(h1, h2, body);
  assert.equal(C.topTint(g), 2);
  assert.equal(h1.material, h2.material, 'one clone per (material, colour)');
  assert.equal(body.material, mat);
  const sh = { uniforms: {}, vertexShader: '#include <common>', fragmentShader: '#include <common>\n#include <normal_fragment_maps>' };
  h1.material.onBeforeCompile(sh);
  assert.ok(sh.uniforms.uTopColor && /uTopColor/.test(sh.fragmentShader) && /viewMatrix/.test(sh.fragmentShader));
  assert.ok(/sc-top-v1/.test(h1.material.customProgramCacheKey()));
});

test('controls: helmet top tint on per-instance (enemy-owned) materials patches in place', () => {
  const mk = () => { const m = new THREE.MeshStandardMaterial({ color: '#8A8D90' }); m.userData.enemyOwned = true; return m; };
  const fogHook = (sh) => { sh.fragmentShader += '\n// fog'; };
  const a = mk(); a.onBeforeCompile = fogHook;
  const b = mk();
  const g1 = new THREE.Group(); const h1 = new THREE.Mesh(new THREE.SphereGeometry(), a); h1.name = 'kettleHelm'; g1.add(h1);
  const g2 = new THREE.Group(); const h2 = new THREE.Mesh(new THREE.SphereGeometry(), b); h2.name = 'kettleHelm'; g2.add(h2);
  assert.equal(C.topTint(g1), 1);
  assert.equal(C.topTint(g2), 1);
  assert.equal(h1.material, a, 'same per-instance material (flash / dispose still see it)');
  assert.equal(h2.material, b);
  assert.ok(a.userData.enemyOwned && a.userData.topTint, 'owner flag kept');
  assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey(), 'pack shares one program');
  const sh = { uniforms: {}, vertexShader: '#include <common>', fragmentShader: '#include <common>\n#include <normal_fragment_maps>' };
  a.onBeforeCompile(sh);
  assert.ok(sh.uniforms.uTopColor && /\/\/ fog/.test(sh.fragmentShader), 'chains the existing hook');
  assert.equal(C.topTint(g1), 1); assert.equal(h1.material, a, 'idempotent');
  assert.equal(C.topTint(null), 0);
  // forced per-instance on an untagged material
  const c = new THREE.MeshStandardMaterial(); const g3 = new THREE.Group(); const h3 = new THREE.Mesh(new THREE.SphereGeometry(), c); h3.name = 'hat'; g3.add(h3);
  C.topTint(g3, undefined, { perInstance: true });
  assert.equal(h3.material, c);
});

test('controls: fur LOD keyed to cam.focus — hero shells only in close-ups (heroLens 0, X8), others drop a tier past 12 m', () => {
  resetView();
  const lens = new THREE.Vector3(0, 10, -8), at = new THREE.Vector3(0, 0.8, 0);
  assert.equal(C.furLodShells('hero', 16, at, lens), 0, 'lens rule (classic, cutscenes) unchanged');
  C.FUR_VIEW.focusOn = true; C.FUR_VIEW.focus.set(0, 0, 0); C.FUR_VIEW.camDist = 13;
  assert.equal(C.FUR_LOD_ISO.heroLens, 0);
  assert.equal(C.furLodShells('hero', 16, at, lens), 0, 'iso play: no hero shells (close-ups only)');
  assert.equal(C.furLodShells('hero', 16, at, new THREE.Vector3(0, 30, -30)), 0, 'past 25 m: base layer');
  const npc = Math.min(10, C.shellsFor('npc'));
  assert.equal(C.furLodShells('kitten', 10, new THREE.Vector3(2, 0.5, 0), lens), npc, 'one tier down at d 13 > 12');
  C.FUR_VIEW.camDist = 10;
  assert.equal(C.furLodShells('kitten', 10, new THREE.Vector3(2, 0.5, 0), lens), 10, 'full near the focus at d 10');
  const mid = C.furLodShells('kitten', 10, new THREE.Vector3(9, 0.5, 0), lens);
  assert.ok(mid > 0 && mid < 10, `ramps with the focus distance (${mid})`);
  assert.equal(C.furLodShells('kitten', 10, new THREE.Vector3(20, 0.5, 0), lens), 0, 'far from the focus: base layer');
  resetView();
});

test('controls: updateReadability — iso detection, classic fallback, top-view factor from the lens distance', () => {
  resetView();
  const camera = new THREE.PerspectiveCamera();
  const focus = new THREE.Vector3(5, 0, 5);
  const ctx = { camera, cam: { focus, modeName: 'follow' }, params: {}, player: { object3d: new THREE.Object3D() } };
  camera.position.set(5, 10, -3);
  let r = C.updateReadability(ctx);
  assert.ok(r.iso && C.FUR_VIEW.focusOn && C.FUR_VIEW.focus.equals(focus));
  assert.equal(C.TOP_VIEW.value, 1, 'readability on at ~13 m');
  camera.position.set(5, 6, 1.5);
  C.updateReadability(ctx); assert.equal(C.TOP_VIEW.value, 0, 'zoomed in: the close-up look');
  ctx.cam.modeName = 'meme';
  camera.position.set(5, 10, -3);
  r = C.updateReadability(ctx); assert.ok(!r.iso && !C.FUR_VIEW.focusOn, 'Meme Cam / cutscenes: lens rule');
  ctx.cam.modeName = 'follow'; ctx.params.cam = 'classic';
  r = C.updateReadability(ctx); assert.ok(!r.iso && C.TOP_VIEW.value === 0, '?cam=classic keeps the old look');
  r = C.updateReadability({ camera, cam: { modeName: 'follow' }, params: {} });
  assert.ok(!r.iso, 'no cam.focus yet: lens rule');
  assert.equal(C.topViewFactor(3.6), 0); assert.equal(C.topViewFactor(9), 0); assert.equal(C.topViewFactor(10.5), 1);
  resetView();
});

test('controls: readability from above — bow ×1.25 on the LEFT ear, ears ×1.1, cape trim + bow glow uniforms', () => {
  resetView();
  const k = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  const ws = (o) => { k.root.updateMatrixWorld(true); return o.getWorldScale(v()).x; };
  const bow0 = ws(k.bow), ear0 = ws(k.rig.earL);
  C.TOP_VIEW.value = 1;
  k.simulate(1 / 60);
  assert.ok(Math.abs(ws(k.bow) / bow0 - C.READABILITY.bowScale) < 1e-4, 'bow ×1.25 (world)');
  assert.ok(Math.abs(ws(k.rig.earL) / ear0 - C.READABILITY.earScale) < 1e-4, 'ears ×1.1');
  assert.equal(k.bow.parent, k.rig.earL, 'still on the LEFT ear');
  assert.ok(worldPos(k.bow).x > 0);
  C.TOP_VIEW.value = 0;
  k.simulate(1 / 60);
  assert.ok(Math.abs(ws(k.bow) / bow0 - 1) < 1e-6 && Math.abs(ws(k.rig.earL) / ear0 - 1) < 1e-6, 'close-up look restored');
  const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <emissivemap_fragment>\n#include <color_fragment>\n#include <opaque_fragment>' };
  C.bowMaterial().onBeforeCompile(sh);
  assert.equal(sh.uniforms.uTopView, C.TOP_VIEW);
  // PERF §1.2: the bow is the shared sc-toon program; its self-light and the +0.08 from above are uniforms
  assert.ok(/uSelfLight \+ uTopGlow \* uTopView/.test(sh.fragmentShader), 'self-light + top glow × the top-view factor');
  assert.equal(sh.uniforms.uTopGlow.value, C.READABILITY.bowGlow, 'bow +0.08 self-light from above');
  assert.equal(sh.uniforms.uSelfLight.value, C.BOW_SELF_LIGHT ?? 0.22, 'the satin self-light');
  const cape = C.capeMaterial('red');
  assert.equal(cape.userData.uniforms.uTopView, C.TOP_VIEW);
  assert.ok(Math.abs(cape.userData.uniforms.uTrimV.value * C.CAPE_DEFAULTS.len - 0.02) < 1e-6, '2 cm trim');
  k.dispose();
  resetView();
});

test('controls: ringAnchor sits on the ground under the body', () => {
  const k = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  const holder = new THREE.Group(); holder.position.set(3, 1.5, -2); holder.add(k.root);
  const r = C.ringAnchor({ object3d: holder });
  assert.ok(Math.abs(r.pos.y - 1.5) < 1e-6, 'at the feet');
  assert.ok(Math.hypot(r.pos.x - 3, r.pos.z + 2) < 0.2, 'under the hips');
  assert.ok(r.radius > 0.25 && r.radius < 0.5);
  k.dispose();
});

// ------------------------------------------------------------------ Phase W (IMPLEMENTATION_PLAN characters.W1–W5) + S4 / H7

/** ctx with an iso camera rig stand-in (cam.focus + modeName) so updateReadability sees the gameplay view. */
function isoCtx(mode = 'follow') {
  const ctx = miniCtx();
  ctx.camera = new THREE.PerspectiveCamera(); ctx.camera.position.set(0, 10, -8);
  ctx.cam = { focus: new THREE.Vector3(0, 0, 0), modeName: mode };
  ctx.params = {};
  return ctx;
}
const frames = (ctx, view, n, dt = 1 / 60) => { for (let i = 0; i < n; i++) { ctx.game.frameCount++; view.render(dt); } };

test('WA characters.W1: hero pop-out 1.12 in follow, 1.0 in a cutscene (0.3 s blend); companions 1.08; hitbox untouched', () => {
  resetView();
  const ctx = isoCtx('follow');
  const actor = new TestActor(ctx, { faction: 'player' }); actor.tags.add('player');
  const view = new C.KittenView(ctx, C.swordcatConfig(), { actor, glance: false });
  const base = view.root.scale.x;
  frames(ctx, view, 2);
  assert.ok(view.playScale > 1 && view.playScale < 1.12, `blending (${view.playScale.toFixed(3)})`);
  frames(ctx, view, 30);
  assert.ok(Math.abs(view.playScale - 1.12) < 1e-9, 'follow: x1.12 after the 0.3 s blend');
  assert.ok(Math.abs(view.root.scale.x - base * 1.12) < 1e-9, 'visual root scaled');
  assert.equal(actor.object3d.scale.x, 1, 'the actor (hitbox / MODEL_FIT owner) keeps scale 1');
  assert.equal(view.root.userData.perfCat, 'hero');
  ctx.cam.modeName = 'cutscene';
  frames(ctx, view, 30);
  assert.equal(view.playScale, 1, 'cutscene: 1.0');
  assert.equal(view.root.scale.x, base);
  const ca = new TestActor(ctx); ca.tags.add('companion');
  const comp = new C.KittenView(ctx, 'mochi', { actor: ca });
  ctx.cam.modeName = 'follow';
  frames(ctx, comp, 40);
  assert.ok(Math.abs(comp.playScale - 1.08) < 1e-9, 'companions x1.08');
  assert.equal(comp.root.userData.perfCat, 'companions');
  const npc = new C.KittenView(ctx, 'tofu', { actor: new TestActor(ctx) });
  frames(ctx, npc, 40);
  assert.equal(npc.playScale, 1, 'residents keep their size');
  view.dispose(); comp.dispose(); npc.dispose(); resetView();
});

test('WA characters.W1: bow grows x1.4 at a lens >= 12 m (on top of the x1.25 top view), always on the LEFT ear', () => {
  resetView();
  const k = C.buildKitten(C.swordcatConfig());
  const bowScale = () => { k.update(1 / 60); return k.bow.scale.x; };
  const camera = new THREE.PerspectiveCamera(), focus = new THREE.Vector3();
  const ctx = { camera, cam: { focus, modeName: 'follow' }, params: {} };
  camera.position.set(0, 8.4, -6);   // ~10.3 m: top view on, far not yet
  C.updateReadability(ctx); const mid = bowScale();
  camera.position.set(0, 11, -9);    // ~14.2 m
  C.updateReadability(ctx); const far = bowScale();
  assert.ok(far > mid, `${mid} < ${far}`);
  assert.ok(Math.abs(far / mid - C.READABILITY.bowScaleFar / C.READABILITY.bowScale) < 0.02, `far bow x${(far / mid).toFixed(3)} over the top view`);
  assert.equal(k.bow.parent, k.rig.earL);
  k.dispose(); resetView();
});

test('WA characters.W2: cheer / groom / twirl / boop / pawBump are poses with finite bone targets and their emotes settle', () => {
  for (const n of C.WARM_POSE_NAMES) assert.ok(C.POSE_NAMES.includes(n), `${n} in POSE_NAMES`);
  const k = C.buildKitten(C.swordcatConfig());
  k.setExpression('happy', true); k.update(1 / 60);            // the poses smile (lower lids show): same baseline
  const draws0 = k.debugFeatures().draws;
  for (const n of C.WARM_POSE_NAMES) {
    k.setPose(n, { blend: 0 }); k.emote(n);
    for (let i = 0; i < 20; i++) k.update(1 / 60);
    for (const b of C.BONE_NAMES) {
      const j = k.rig.joints[b]; const q = j.quaternion, p = j.position;
      assert.ok([q.x, q.y, q.z, q.w, p.x, p.y, p.z].every(Number.isFinite), `${n}: ${b} finite`);
    }
    for (let i = 0; i < 120; i++) k.update(1 / 60);
    assert.equal(k.emotes[n], 0, `${n} emote finished`);
  }
  assert.equal(k.debugFeatures().draws, draws0, 'no new draws from the poses');
  k.dispose();
});

test('WA characters.W3: Meme White cape is cream #FFF3E2 with a pink hem; the practice tunic keeps her sword visible', () => {
  assert.equal(C.CAPES.memeWhite.color, '#FFF3E2');
  assert.ok(C.CAPES.memeWhite.hem, 'pink hem stripe');
  const k = C.buildKitten(C.CATS.swordcat_tunic_sword);
  assert.ok(k.sword, 'practice outfit carries the sword');
  let vis = true; for (let p = k.sword.group; p; p = p.parent) vis = vis && p.visible;
  assert.ok(vis && k.sword.group.parent, 'sword mesh visible in the practice outfit');
  let hasBlade = false; k.sword.group.traverseVisible((o) => { if (o.isMesh) hasBlade = true; });
  assert.ok(hasBlade);
  assert.ok(k.cfg.accessories.some((a) => a && a.id === 'tunic'), 'still the practice tunic, not the plate');
  assert.equal(C.CATS.swordcat_tunic.sword, null, 'the plain tunic still has none (CS scenes)');
  k.dispose();
});

test('WA characters.W4: plate bakes both words in one texture; flip moves offset.y only, 0 canvas work after spawn', () => {
  let ctxCalls = 0;
  // a do-anything 2D context: every property / call returns itself (gradients, measureText, ...)
  const store = {};
  const fake2d = new Proxy(function () {}, { get: (t, p) => (p in store ? store[p] : p === 'width' ? 10 : fake2d), set: (t, p, v) => { store[p] = v; return true; }, apply: () => fake2d });
  const had = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { ctxCalls++; return fake2d; } };
  try {
    const { model } = fakeKayKit(0.6);
    const d = C.dressBeast(model, 'hyena', { seed: 2 });
    assert.ok(d.friendWord, 'index-paired friend word');
    const tex = d.plate.userData.texture;
    assert.ok(tex && tex.repeat.y === 0.5, 'two rows in one texture');
    const y0 = tex.offset.y, calls = ctxCalls, ver = tex.version;
    assert.equal(d.flipPlate(), true);
    assert.notEqual(tex.offset.y, y0, 'friend row via offset.y');
    assert.equal(d.plate.userData.texture, tex, 'same texture');
    assert.equal(d.plate.getObjectByName('plateWord').material.map, tex, 'same material map');
    assert.equal(ctxCalls, calls, 'no canvas work on flip');
    assert.equal(tex.version, ver, 'no re-upload');
    d.flipPlate(false); assert.equal(tex.offset.y, y0);
    d.dispose();
  } finally { globalThis.OffscreenCanvas = had; }
});

test('WA characters.W5: Squeakybone tint / Big Squeaky Bone mallet / Sir Sacky / Sir Wobble cost one draw each; draws unchanged', () => {
  for (const n of C.WARM_PROP_NAMES) {
    assert.ok(C.PROP_NAMES.includes(n), n);
    const p = C.buildProp(n);
    let meshes = 0; p.traverse((o) => { if (o.isMesh) meshes++; });
    assert.equal(meshes, 1, `${n}: one draw`);
  }
  // the mallet's red rubber knobs (WA26)
  const mallet = C.buildProp('big_squeaky_bone'), col = mallet.geometry.attributes.color;
  const knob = new THREE.Color(C.WARM_LOOKS.squeakyKnob);
  let knobs = 0; for (let i = 0; i < col.count; i++) if (Math.abs(col.getX(i) - knob.r) < 0.02 && Math.abs(col.getY(i) - knob.g) < 0.02) knobs++;
  assert.ok(knobs > 50, 'red rubber knobs');
  // Barkus: the mallet replaces the GLB weapon one for one (draw count unchanged)
  const count = (root) => { let n = 0; root.traverseVisible((o) => { if (o.isMesh) n++; }); return n; };
  assert.equal(C.BEAST_LOOKS.barkus.weapon, 'big_squeaky_bone');
  const a = fakeKayKit(0.6), b = fakeKayKit(0.6);
  const da = C.dressBeast(a.model, 'barkus'), db = C.dressBeast(b.model, 'barkus');
  da.hold(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1)), 'r');      // the old claymore stand-in
  db.hold(C.BEAST_LOOKS.barkus.weapon, 'r');
  assert.equal(count(b.model), count(a.model), 'barkus draws unchanged');
  // Squeakybone: shared tinted twins (0 new meshes, one clone per source material for every spawn)
  const sk = fakeKayKit(0.6).model, sk2 = fakeKayKit(0.6).model;
  const shared = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  for (const m of [sk, sk2]) m.traverse((o) => { if (o.isMesh) o.material = shared; });
  const before = count(sk);
  const restore = C.squeakyLook(sk); C.squeakyLook(sk2);
  assert.equal(count(sk), before, 'bonehead draws unchanged');
  const mA = sk.getObjectByName('Barbarian_Body').material, mB = sk2.getObjectByName('Barbarian_Body').material;
  assert.equal(mA, mB, 'one tinted twin shared by every Squeakybone');
  assert.equal('#' + mA.color.getHexString(), C.WARM_LOOKS.squeakyBone.toLowerCase());
  restore(); assert.equal(sk.getObjectByName('Barbarian_Body').material, shared);
  da.dispose(); db.dispose();
});

test('S4 ART §6.5 Squash: volume-preserving spring settles, clamps, survives a long frame', () => {
  const s = new C.Squash();
  s.kick(C.SQUASH.jumpKick);
  let peak = 0; for (let i = 0; i < 10; i++) peak = Math.max(peak, s.update(1 / 60) - 1);
  assert.ok(peak > 0.02 && peak <= C.SQUASH.clamp + 1e-9, `stretch ${peak}`);
  for (let i = 0; i < 120; i++) s.update(1 / 60);
  assert.ok(Math.abs(s.x) < 1e-3, 'settled');
  s.kick(-50); s.update(0.3);
  assert.ok(s.x >= -C.SQUASH.clamp - 1e-9 && Number.isFinite(s.x), 'clamped through a 0.3 s hitch');
});

test('S4 PERF §4.3 setActivity: tier 2 animates every 4th frame with the summed dt, tier 3 freezes, 0 restores', () => {
  const k = C.buildKitten(C.swordcatConfig());
  assert.equal(C.setActivity(k, 2), true); assert.equal(k.activity, 2);
  k.setActivity(0); k.setActivity(2);
  const got = []; for (let i = 0; i < 8; i++) got.push(k.activityDt(0.01));
  assert.deepEqual(got.map((d) => +d.toFixed(3)), [0, 0, 0, 0.04, 0, 0, 0, 0.04]);
  k.setActivity(3); assert.equal(k.activityDt(0.01), 0);
  k.setActivity(0); assert.equal(k.activityDt(0.01), 0.01);
  k.setActivity(1); assert.equal(k.activityDt(0.01), 0.01, 'tier 1 keeps the clock (cape sways in the shader)');
  k.dispose();
});

test('S4 debugFeatures + outline hull: play LOD hero <= 9 draws (X10 interim), outline is one extra draw, toggles', () => {
  const k = C.buildKitten(C.swordcatConfig({ cape: 'red' }), { lod: 'play' });
  k.blob.visible = false;                                         // in play fx.blobs owns her contact blob (player hides it)
  const f = k.debugFeatures();
  for (const key of ['draws', 'tris', 'shells', 'tufts', 'outline', 'lod', 'activity', 'merged']) assert.ok(key in f, key);
  assert.equal(f.lod, 'play');
  k.setOutline(true, { px: 2 });
  const g = k.debugFeatures();
  assert.equal(g.outline, true); assert.equal(g.draws, f.draws + 1, 'outline = one draw');
  // body+fur+armour 1, bow 1, eyes / lids / brows 3, blade + hilt 2, cape 1, tufts 1, shadow-pass proxy 1, hull 1 = 11;
  // ART X10's interim 9 (bow in the body draw, one eye draw) and end state 6 come with the hero bake (PERF H7 / L3)
  assert.ok(g.draws <= 11, `hero draws ${g.draws}`);
  k.setOutline(false); assert.equal(k.debugFeatures().outline, false);
  k.dispose();
});

test('PERF H7 bakeSkinned: skinned + rigid parts (under a MODEL_FIT scale) land where the unbaked parts do, at any pose', () => {
  const root = new THREE.Group(); root.scale.setScalar(0.6); root.position.set(3, 0, -2);
  const b0 = new THREE.Bone(); b0.name = 'hips'; const b1 = new THREE.Bone(); b1.name = 'arm'; b1.position.set(0, 1, 0); b0.add(b1);
  root.add(b0); root.updateMatrixWorld(true);
  const skel = new THREE.Skeleton([b0, b1]);
  // a skinned part with a non-identity bind matrix
  const g = new THREE.BoxGeometry(0.4, 1.6, 0.4, 1, 4, 1); g.translate(0, 0.8, 0);
  const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i); si[i * 4] = 0; si[i * 4 + 1] = 1; sw[i * 4] = 1 - y / 1.6; sw[i * 4 + 1] = y / 1.6; }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  const body = new THREE.SkinnedMesh(g, new THREE.MeshLambertMaterial({ color: '#ff8800' }));
  body.position.set(0.1, 0, 0); root.add(body); root.updateMatrixWorld(true); body.bind(skel);
  // a rigid prop on the arm bone, and one part that must stay separate (different inverses)
  const prop = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), new THREE.MeshLambertMaterial({ color: '#00ff00' }));
  prop.position.set(0.3, 0.2, 0); prop.rotation.set(0.3, 0.5, 0); b1.add(prop);
  const odd = new THREE.SkinnedMesh(g.clone(), new THREE.MeshLambertMaterial());
  root.add(odd);
  const oddSkel = new THREE.Skeleton([b0, b1], [new THREE.Matrix4().makeTranslation(1, 0, 0), new THREE.Matrix4()]);
  odd.bind(oddSkel, new THREE.Matrix4());
  // pose it, then bake (the math is pose-independent)
  b0.rotation.set(0, 0.4, 0.2); b1.rotation.set(0.7, 0, -0.5); root.updateMatrixWorld(true);
  const pick = (mesh, i) => {
    const p = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
    if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, p);
    return p.applyMatrix4(mesh.matrixWorld);
  };
  const pn = prop.geometry.attributes.position.count;
  const { mesh, baked, separate } = C.bakeSkinned(root, skel, new THREE.MeshLambertMaterial({ vertexColors: true }));
  assert.equal(baked.length, 2); assert.ok(baked.includes(body) && baked.includes(prop));
  assert.equal(separate.length, 1); assert.equal(separate[0], odd);
  const off = baked.indexOf(prop) === 0 ? pn : 0, poff = baked.indexOf(prop) === 0 ? 0 : n;   // merge order = traversal order
  root.add(mesh);
  for (const rot of [[0.4, 0.2, 0.7, -0.5], [-0.3, 0.9, 0.1, 1.2]]) {
    b0.rotation.set(0, rot[0], rot[1]); b1.rotation.set(rot[2], 0, rot[3]); root.updateMatrixWorld(true);
    for (let i = 0; i < n; i++) { const got = pick(mesh, off + i), want = pick(body, i); assert.ok(got.distanceTo(want) < 1e-4, `body ${i}: ${got.toArray()} vs ${want.toArray()}`); }
    for (let i = 0; i < pn; i++) { const got = pick(mesh, poff + i), want = pick(prop, i); assert.ok(got.distanceTo(want) < 1e-4, `prop ${i}: ${got.toArray()} vs ${want.toArray()}`); }
  }
  // vertex colour carries the material colour; aTexMix 0 for untextured parts
  const c = mesh.geometry.attributes.color, m = mesh.geometry.attributes.aTexMix;
  assert.ok(Math.abs(c.getX(off) - body.material.color.r) < 1e-6 && m.getX(off) === 0);
  assert.ok(Math.abs(c.getY(poff) - prop.material.color.g) < 1e-6);
  assert.equal(mesh.castShadow, false);
  assert.ok(C.sameInverses(skel, skel) && !C.sameInverses(oddSkel, skel));
});

test('render-safety: no matcap / basic material carries an `emissive` (three would write a uniform its program lacks)', () => {
  const k = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  k.setHoly(1); k.update(1 / 60);
  const bad = [];
  k.root.traverse((o) => {
    if (!o.material) return;
    for (const m of [].concat(o.material)) if ((m.isMeshMatcapMaterial || m.isMeshBasicMaterial) && m.emissive) bad.push(`${o.name}:${m.type}`);
  });
  for (const skin of ['borrowed', 'dawnblade', 'twig']) { const s = C.buildSword(skin); if (s.bladeMat.isMeshMatcapMaterial && s.bladeMat.emissive) bad.push(skin); s.dispose(); }
  assert.deepEqual(bad, []);
  k.dispose();
});

test('hero readability: warm-rim floor 0.40 on her own materials only; the gameplay tunic outfits keep the sword', () => {
  assert.equal(C.READABILITY.heroRim, 0.4);
  const k = C.buildKitten(C.swordcatConfig());
  assert.equal(k.rimFloor, 0.4);
  assert.equal(k.kitMat.userData.uniforms.uRimMin.value, 0.4, 'body toon rim floor');
  let blade = 0; k.sword.group.traverse((o) => { if (o.material?.userData?.uniforms?.uRimMin?.value === 0.4) blade++; });
  assert.ok(blade > 0, 'blade metal rim floor');
  assert.ok(k.furMat.uniforms.uRimStrength.value >= 0.4, 'fur rim ≥ 0.40');
  assert.equal(C.toonLib('plain').userData.uniforms.uRimMin.value, 0, 'shared kit untouched');
  // a re-equipped sword gets the floor too
  k.setSword('borrowed');
  blade = 0; k.sword.group.traverse((o) => { if (o.material?.userData?.uniforms?.uRimMin?.value === 0.4) blade++; });
  assert.ok(blade > 0, 'new sword keeps the rim floor');
  const m = C.buildKitten(C.CATS.mochi);
  assert.equal(m.rimFloor, 0);
  assert.equal(m.kitMat.userData.uniforms?.uRimMin?.value ?? 0, 0, 'companions keep the env rim');
  // SwordcatModel builds the tunic looks as swordcatConfig({ armour: false, bow }) — both must carry the sword
  for (const bow of [false, true]) {
    const cfg = C.swordcatConfig({ armour: false, bow });
    assert.equal(cfg.sword, 'borrowed', `tunic (bow ${bow}) carries the sword`);
    assert.ok(cfg.accessories.some((a) => a?.id === 'tunic'));
  }
  k.dispose(); m.dispose();
});

test('hero idle = restUp: the blade stands upright at her right side above her ears; long skins keep the cane idle', () => {
  for (const armour of [true, false]) {
    const k = C.buildKitten(C.swordcatConfig({ armour }));
    k.setPose('idle', { blend: 0 }); for (let i = 0; i < 3; i++) k.update(1 / 60); k.root.updateMatrixWorld(true);
    assert.equal(k.poseName, 'idle', 'callers still see idle');
    assert.equal(k._to.name, 'restUp');
    const tip = k.sword.tip.getWorldPosition(new THREE.Vector3()), grip = k.sword.grip.getWorldPosition(new THREE.Vector3());
    assert.ok(tip.y > 1.05, `tip above the ear line (${tip.y.toFixed(2)} H)`);
    assert.ok(tip.x < -0.2, 'beside her right side, not behind her body');
    assert.ok(k.rig.joints.pawR.getWorldPosition(new THREE.Vector3()).distanceTo(grip) < 0.06, 'right paw on the grip');
    k.setSword({ skin: 'toobig', model: new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.05)), modelLength: 1.6 });
    assert.equal(k._to.name, 'idle', 'long skin: cane idle (tip drag)');
    k.dispose();
  }
  const m = C.buildKitten(C.CATS.marmalade);
  m.setPose('idle', { blend: 0 });
  assert.equal(m._to.name, 'idle', 'other sword cats keep the contract idle');
  m.dispose();
});

test('cape perf LOD (PERF §9.1): grid normals, coarse iso grid, 2 sub-steps, sim paused off screen, no proxy draw', () => {
  // grid normals agree with three's computeVertexNormals on a simulated, folded cape (same winding)
  const kf = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  new THREE.Group().add(kf.root);
  for (let i = 0; i < 30; i++) kf.update(1 / 60, { wind: new THREE.Vector3(0.3, 0, 0.1) });
  const g = kf.cape.geo, ref = g.clone(); ref.computeVertexNormals();
  let worst = 1;
  for (let i = 0; i < g.attributes.normal.count; i++) {
    const a = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, i), b = new THREE.Vector3().fromBufferAttribute(ref.attributes.normal, i);
    worst = Math.min(worst, a.dot(b));
  }
  assert.ok(worst > 0.5, `grid normals face the same way as computeVertexNormals (worst dot ${worst.toFixed(2)})`);
  ref.dispose();
  assert.equal(C.CAPE_DEFAULTS.iterations, 3);
  // at most 2 sub-steps per frame, however long the frame
  const sim = new C.ClothSim();
  assert.equal(sim.advance(0.25, null), 2);
  // iso play: 17 x 13 render grid; a close-up swaps to the full grid and back (pointer swap, same mesh)
  const k = C.buildKitten(C.swordcatConfig({ cape: 'red' }), { lod: 'play' });
  new THREE.Group().add(k.root);
  k.update(1 / 60);
  const d = k.cape.d;
  assert.equal(k.cape.rc, (d.cols - 1) * d.playResX + 1); assert.equal(k.cape.rr, (d.rows - 1) * d.playResY + 1);
  assert.equal(k.cape.rc * k.cape.rr, 221, 'iso grid is 221 vertices');
  assert.equal(k.cape.mesh.geometry, k.cape.geo);
  k.setCloseUp(true);
  assert.equal(k.cape.rc, (d.cols - 1) * d.resX + 1); assert.equal(k.cape.mesh.geometry.attributes.position.count, k.cape.rc * k.cape.rr);
  k.update(1 / 60);
  const inv = k.root.matrixWorld.clone().invert(), p = new THREE.Vector3();
  p.set(k.cape.sim.p[4 * 3], k.cape.sim.p[4 * 3 + 1], k.cape.sim.p[4 * 3 + 2]).applyMatrix4(inv);
  assert.ok(Math.abs(k.cape.geo.attributes.position.getX(k.cape.vertexIndex(4, 0)) - p.x) < 1e-3, 'close grid written after the swap');
  k.setCloseUp(false);
  assert.equal(k.cape.rc, 17);
  // the merged play body casts: the shell-fur shadow proxy is hidden in iso play, back in close-ups
  assert.equal(k.shadowProxy.visible, false, 'no shadow-proxy draw in iso play');
  k.setCloseUp(true); assert.equal(k.shadowProxy.visible, true); k.setCloseUp(false);
  // activity tier >= 1: sway, cloth paused (particles untouched); back to 0 re-seeds and simulates again
  k.setActivity(1); k.update(1 / 60); k.update(1 / 60);
  assert.equal(k.cape.simPaused, true);
  const before = Float32Array.from(k.cape.sim.p);
  k.root.position.x += 0.3; k.update(1 / 60);
  assert.deepEqual(Array.from(k.cape.sim.p), Array.from(before), 'no cloth steps while paused');
  k.setActivity(0); k.update(1 / 60);
  assert.equal(k.cape.simPaused, false);
  assert.notDeepEqual(Array.from(k.cape.sim.p), Array.from(before), 'cloth re-seeded and stepping again');
  k.dispose(); kf.dispose();
});

test('close-up fur fringe (story 10c / 11c): outer shells fade edge-on and thin near the lens; cheek ruff shortened', () => {
  const k = C.buildKitten(C.CATS.sage);
  const u = k.furMat.uniforms;
  assert.equal(u.uCloseRange.value.x, C.FUR_CLOSE.near); assert.equal(u.uCloseRange.value.y, C.FUR_CLOSE.far);
  assert.ok(C.FUR_CLOSE.near > 0 && C.FUR_CLOSE.far > C.FUR_CLOSE.near && C.FUR_CLOSE.far < 6, 'gameplay (iso lens 9-18 m) is never affected');
  assert.ok(u.uCloseEdge.value >= u.uEdgeFade.value && u.uCloseThin.value > 0 && u.uCloseThin.value < 1);
  assert.ok(k.furMatBaked.uniforms.uCloseThin, 'the baked (tail) material too');
  assert.match(k.furMat.fragmentShader, /uCloseRange/);
  assert.ok(C.headFurMask(new THREE.Vector3(0.12, 0.08, 0.02), 'cheek')[1] <= 1.2, 'cheek ruff length');
  // the warm cream rim (never a blue-grey tint)
  const rc = u.uRimColor.value; assert.ok(rc.r >= rc.g && rc.g >= rc.b, 'warm rim');
  // warm fill: the sky / hemisphere fill keeps its brightness but takes the warm cream hue (no blue-grey haze)
  const wf = u.uWarmFill.value; assert.ok(wf.r > wf.g && wf.g > wf.b && u.uWarmFillK.value > 0 && u.uWarmFillK.value <= 1);
  assert.match(k.furMat.fragmentShader, /uWarmFillK/);
  // under the hood the cheek ruffs shrink (they stuck out past it as a grey disc over her muzzle)
  const bare = C.buildKitten({ ...C.CATS.sage, accessories: C.CATS.sage.accessories.filter((a) => (a.id ?? a) !== 'hood') });
  const w = (kk) => { const g = kk.headFur.mesh.geometry; g.computeBoundingBox(); return g.boundingBox.max.x - g.boundingBox.min.x; };
  assert.ok(w(k) < w(bare) - 0.01, `hooded head fur ${w(k).toFixed(3)} vs bare ${w(bare).toFixed(3)}`);
  bare.dispose();
  k.dispose();
});

// ------------------------------------------------------------------ Token Tails look (docs/TOKENTAILS-PLAN.md §2.1–§2.4)
test('Token Tails: Clementine is ivory with crimson two-catchlight eyes, a royal red gold-trimmed cape, a coin crest and the pink LEFT-ear bow', () => {
  const cfg = C.swordcatConfig();
  assert.equal(cfg.coat.base, C.PAL.furIvory);
  assert.equal(cfg.coat.light, C.PAL.furIvoryLight);
  assert.equal(cfg.coat.deep, C.PAL.furIvoryShade);
  assert.equal(cfg.coat.pattern, 'solid', 'no tabby stripes');
  assert.ok(!cfg.coat.stripe, 'stripe weight 0');
  assert.equal(cfg.earInner, C.PAL.earInnerSalmon);
  assert.equal(cfg.eyes.outer, C.PAL.irisCrimson);
  assert.equal(cfg.eyes.ring, C.PAL.irisCrimsonDeep);
  assert.equal(cfg.eyes.catchlights, 2);
  assert.equal(cfg.cape.style, 'red', 'royal red from the start');
  assert.equal(C.CAPES.red.hem.toUpperCase(), C.PAL.trimGold.toUpperCase(), 'gold trim on the red cape');
  assert.equal(cfg.outfit.crest, 'ttCoin');
  assert.equal(cfg.bow.color, C.PAL.bow);
  assert.equal(C.PAL.bow.toUpperCase(), '#FF9EC0', 'the pink bow is unchanged');
  for (const id of ['swordcat', 'swordcat_red', 'swordcat_tunic_bow', 'swordcat_tunic_sword']) {
    assert.equal(C.CATS[id].coat.base, C.PAL.furIvory, id);
    assert.equal(C.CATS[id].bow.color, C.PAL.bow, id);
  }
  // the ginger keys stay for the other cats
  assert.equal(C.PAL.furGinger, '#E89A55');
  const k = C.buildKitten(cfg);
  assert.ok(k.bow, 'bow built');
  assert.equal(k.bow.parent, k.rig.earL, 'bow on the LEFT ear joint');
  k.dispose();
});

test('Token Tails: the two-catchlight eye texture is its own cache entry', () => {
  const had = globalThis.OffscreenCanvas;
  const fake2d = new Proxy(function () {}, { get: (t, p) => (p === 'width' ? 10 : fake2d), set: () => true, apply: () => fake2d });
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return fake2d; } };
  try {
    const a = C.makeEyeTexture({ outer: '#B3212F', catchlights: 2 }), b = C.makeEyeTexture({ outer: '#B3212F' });
    if (a && b) { assert.notEqual(a, b); assert.equal(a.userData.catchlights, 2); assert.equal(b.userData.catchlights, 3); }
  } finally { globalThis.OffscreenCanvas = had; }
});

test('Token Tails: tokentails_cat is ivory, crimson-eyed, unclothed, holds the gold coin and has NO bow', () => {
  const cfg = C.CATS.tokentails_cat;
  assert.ok(cfg, 'exported in CATS');
  assert.equal(C.catConfig('tokentails_cat'), cfg);
  assert.equal(cfg.bow, null, 'the bow is Clementine\'s alone');
  assert.equal(cfg.coat.base, C.PAL.furIvory);
  assert.equal(cfg.coat.pattern, 'solid');
  assert.equal(cfg.eyes.outer, C.PAL.irisCrimson);
  assert.equal(cfg.earInner, C.PAL.earInnerSalmon);
  assert.ok(!cfg.cape && !cfg.sword && !cfg.outfit?.armour && !(cfg.accessories ?? []).length, 'no clothing');
  assert.deepEqual(cfg.props, ['tt_coin']);
  assert.ok(C.PROP_NAMES.includes('tt_coin'));
  const k = C.buildKitten(cfg);
  assert.equal(k.bow, null);
  assert.ok(k.props.tt_coin, 'coin in paw');
  assert.equal(k.props.tt_coin.parent, k.rig.joints.pawL);
  // no brow capsules (they read as two grey smudges on the ivory forehead) and no ink hull (a dark hood behind the head)
  assert.equal(k.eyes.browMesh, null, 'no brows');
  assert.equal(cfg.outline, false, 'no outline hull');
  const hero = C.buildKitten(C.SWORDCAT);
  assert.ok(hero.eyes.browMesh, 'Clementine keeps her brows (expressions)');
  hero.dispose();
  k.dispose();
});

test('Pearl wears a LILAC bow: pink stays Clementine\'s alone', () => {
  const pb = new THREE.Color(C.CATS.pearl.bow.color), hb = new THREE.Color(C.PAL.bow), hsl = {}, hh = {};
  pb.getHSL(hsl); hb.getHSL(hh);
  assert.ok(hsl.h > 0.7 && hsl.h < 0.8, `Pearl's bow hue is lilac (${(hsl.h * 360).toFixed(0)}°)`);
  assert.ok(Math.abs(hsl.h - hh.h) > 0.1, 'clearly not the hero pink');
});

test('Token Tails: the plate is crested with the coin; friendly plate words (no HATER / POST / STEALER)', () => {
  const plain = C.buildKitten({ ...C.swordcatConfig(), outfit: { armour: 'plate' } }), crest = C.buildKitten(C.swordcatConfig());
  const verts = (k) => k.kitMesh.geometry.attributes.position.count;
  assert.ok(verts(crest) > verts(plain), 'crest adds kit geometry (no extra draw)');
  plain.dispose(); crest.dispose();
  const words = [...C.PLATE_WORDS, ...Object.keys(C.FRIEND_WORDS), ...Object.values(C.FRIEND_WORDS), ...ENEMIES.hyena.plateWords,
    ...ENEMIES.hyena.plateWordsFriend, ...ENEMIES.stealer.plateWords, ...ENEMIES.stealer.plateWordsFriend];
  for (const w of words) assert.ok(!/HATER|POST|STEALER/.test(w), w);
  for (const w of ['GRUMP', 'SNACK SNATCHER', 'GRUMP-IN-CHIEF', 'GRUMBLER', 'NAYSAYER', 'SCOFFER', 'SNEERER', 'SPOILER']) assert.ok(C.PLATE_WORDS.includes(w), w);
  assert.equal(C.FRIEND_WORDS['GRUMP-IN-CHIEF'], 'CHEER-IN-CHIEF');
  assert.equal(C.FRIEND_WORDS['SNACK SNATCHER'], 'SNACK SHARER');
});

test('Token Tails outline: the tight hull proxy fits ear cones, uses the sword\'s own triangles, leaves the bow out; thin maroon ink', async () => {
  const { silhouetteParts, coneMatrix } = await import('../../src/characters/Readability.js');
  const { OUTLINE } = await import('../../src/characters/Outline.js');
  const k = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  const loose = silhouetteParts(k.root, { skeleton: k.skeleton, margin: 0.002, furMargin: 0.01 });
  const tight = silhouetteParts(k.root, { skeleton: k.skeleton, margin: 0.002, furMargin: 0.01, tight: true });
  const name = (r, p) => { const a = r.anchors[p.anchor].obj; return a.name || a.parent?.name || ''; };
  const ears = tight.parts.filter((p) => /^ear[LR]$/.test(name(tight, p)));
  assert.equal(ears.length, 2); assert.ok(ears.every((p) => p.shape === 'cone'));
  assert.ok(loose.parts.filter((p) => /^ear[LR]$/.test(name(loose, p))).every((p) => p.shape === 'ellipsoid'), 'the x-ray proxy is unchanged');
  assert.ok(!tight.parts.some((p) => /^bow/.test(name(tight, p))), 'no hull around the bow');
  assert.ok(loose.parts.some((p) => /^bow/.test(name(loose, p))));
  assert.ok(tight.parts.some((p) => p.shape === 'mesh'), 'small rigid parts use their own triangles');
  // a cone fitted to a box of points spans it (+ margin)
  const m = coneMatrix([-1, 0, -0.5, 1, 2, 0.5, 0, 1, 0], 0.1);
  const e = m.elements;
  assert.ok(Math.abs(e[0] - 1.1) < 1e-9 && Math.abs(e[5] - 1.1) < 1e-9 && Math.abs(e[10] - 0.6) < 1e-9 && Math.abs(e[13] - 1) < 1e-9);
  assert.ok(OUTLINE.px.hero <= 1.5 && OUTLINE.px.hero >= 1.2);
  assert.notEqual(OUTLINE.hero.toUpperCase(), '#5A2A1A');
});
