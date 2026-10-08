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

test('proportions follow art.md §2.1 (head ~0.38-0.40 H, eyes ~0.09 H, sword ~1 H)', () => {
  const k = getSwordcat();
  k.setPose('idle', { blend: 0 }); k.update(1 / 60);
  // eye diameter
  const eye = k.eyes.eyes[0].eye; eye.geometry.computeBoundingBox();
  const eb = eye.geometry.boundingBox; assert.ok(Math.abs((eb.max.x - eb.min.x) - 0.09) < 0.005, 'eye diameter 0.09 H');
  // head: chin fur bottom to ear tips
  const headBox = new THREE.Box3().setFromObject(k.headFur.mesh);
  const earTip = worldPos(k.rig.earL).y + 0.1;
  const headH = Math.max(earTip, headBox.max.y) - headBox.min.y;
  assert.ok(headH > 0.33 && headH < 0.46, `head height ${headH.toFixed(3)}`);
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
  assert.ok(pommel.y > 0.44 && pommel.y < 0.56, `vigil pommel height ${pommel.y.toFixed(3)}`);
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
  for (let c = 0; c < sim.C; c++) { sim.pins[c * 3] = (c / 8 - 0.5) * 0.38; sim.pins[c * 3 + 1] = 0.6; sim.pins[c * 3 + 2] = -0.1; }
  for (let i = 0; i < 180; i++) sim.step(1 / 60, { x: 0.5, y: 0, z: -0.5 });
  for (let c = 0; c < sim.C; c++) assert.ok(Math.abs(sim.p[c * 3 + 1] - 0.6) < 1e-6, 'top row pinned');
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
  const plate = C.attachPlate(model, 'HATER', { seed: 3 });
  assert.ok(plate && plate.parent === chest);
  assert.ok(C.PLATE_WORDS.includes('HATER') && C.PLATE_WORDS.includes('POST STEALER'));
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
    const z = pos.getZ(r * C9 + Math.floor(C9 / 2));
    assert.ok(z < -0.08, `cape centre row ${r} hangs behind (local z ${z.toFixed(3)})`);
  }
  // a tail wind (blowing toward her face) must not wrap the cape forward either
  const k2 = C.buildKitten(C.swordcatConfig({ cape: 'red' }));
  for (let i = 0; i < 120; i++) k2.update(1 / 60, { wind: new THREE.Vector3(0, 0, 0.6) });
  const p2 = k2.cape.geo.attributes.position;
  assert.ok(p2.getZ((k2.cape.d.rows - 1) * C9 + 4) < -0.05, 'hem stays behind in a tail wind');
  k.dispose(); k2.dispose();
});

test('runtime: core QUALITY presets drive fur shells; E.QUALITY switches them live', () => {
  assert.deepEqual(C.furShellsForPreset(QUALITY.med), { hero: QUALITY.med.furShells, kitten: QUALITY.med.kittenShells, npc: 0 });
  const ctx = miniCtx();
  ctx.quality = QUALITY.high;
  const st = C.initCharacters(ctx);
  assert.ok(st && C.initCharacters(ctx) === st, 'idempotent per ctx');
  assert.equal(C.shellsFor('hero'), QUALITY.high.furShells);
  const k = C.buildKitten(C.swordcatConfig());
  ctx.bus.emit(E.QUALITY, { name: 'low', preset: QUALITY.low });
  assert.equal(k.headFur.shells, QUALITY.low.furShells);
  ctx.bus.emit(E.QUALITY, { name: 'med', preset: QUALITY.med });
  assert.equal(k.headFur.shells, QUALITY.med.furShells);
  // visual dt: frozen in hitstop and the pause menu, scaled by slow motion
  ctx.game.loop = { timeScale: 0.5 };
  assert.equal(C.visualDt(ctx, 0.02), 0.01);
  ctx.game.hitstopT = 0.1; assert.equal(C.visualDt(ctx, 0.02), 0); ctx.game.hitstopT = 0;
  ctx.game.mode = 'menu'; assert.equal(C.visualDt(ctx, 0.02), 0); ctx.game.mode = 'play';
  st.dispose(); k.dispose();
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

test('character env map is applied to every lit material we own', () => {
  const tex = new THREE.Texture();
  const k = C.buildKitten(C.CATS.pearl);
  C.setCharacterEnvMap(tex);
  assert.equal(k.kitMat.envMap, tex);
  assert.equal(C.kitMaterial().envMap, tex);
  C.setCharacterEnvMap(null);
  assert.equal(k.kitMat.envMap, null);
  k.dispose();
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
  assert.equal(C.dressBeast(fakeKayKit().model, 'stealer').word, 'POST STEALER');
  assert.equal(C.dressBeast(fakeKayKit().model, 'cacklejaw').word, 'HATER-IN-CHIEF');
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
