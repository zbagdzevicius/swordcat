// tests/unit/tt4.test.js — TT4 fix pass (visual critic round 1, controls round 1, verify round 1): lite kittens' round
// pupils and bare-skin ink hull, the coin's spawn in front of her paw, the Ribbon Twirl rotor bow and the Stand's block
// pose, the pad Meow on the D-pad, the device-named chest lines, the touch sword keycap, the landscape herFrame pad.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as C from '../../src/characters/index.js';
import { liteEyeGeometry, LITE_EYE, LIMB_FUR } from '../../src/characters/KittenBuilder.js';
import { buildOutline, OUTLINE } from '../../src/characters/Outline.js';
import { POSES, EXTRA_POSE_NAMES } from '../../src/characters/Poses.js';
import { EXPRESSIONS } from '../../src/characters/Eyes.js';
import { TRICK_POSE, BROW_MIN_DEG } from '../../src/player/SwordcatModel.js';
import { TRICKS } from '../../src/player/tricks/tuning.js';
import { CoinToss } from '../../src/player/tricks/CoinToss.js';
import { INPUT, CAMERA } from '../../src/core/config.js';
import { actionGlyph, glyphify, keyCapInner } from '../../src/ui/text.js';
import { ONBOARDING_STRINGS } from '../../src/story/strings.onboarding.js';
import { SafeFrame } from '../../src/camera/SafeFrame.js';
import { BARN_GUIDE } from '../../src/story/StoryManager.js';
import { fakeCtx } from './_fakeCtx.mjs';

test('TT4: the lite eye is a lathe with paired rings on the pupil and iris edges, facing out, its pole looking down +Z', () => {
  const g = liteEyeGeometry(1, 12);
  const P = g.attributes.position, I = g.index.array;
  const radii = new Set();
  for (let i = 0; i < P.count; i++) if (P.getZ(i) > 0) radii.add(+Math.hypot(P.getX(i), P.getY(i)).toFixed(3));
  for (const d of [LITE_EYE.pupil - 0.025, LITE_EYE.pupil + 0.025, LITE_EYE.iris - 0.02, LITE_EYE.iris + 0.02]) {
    assert.ok([...radii].some((r) => Math.abs(r - d) < 2e-3), `a ring at ${d}`);
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  let inward = 0;
  for (let t = 0; t < I.length; t += 3) {
    a.fromBufferAttribute(P, I[t]); b.fromBufferAttribute(P, I[t + 1]); c.fromBufferAttribute(P, I[t + 2]);
    n.crossVectors(b.clone().sub(a), c.clone().sub(a));
    if (n.lengthSq() > 1e-12 && n.dot(a.add(b).add(c)) < 0) inward++;
  }
  assert.equal(inward, 0, 'every face points out of the eye');
  g.computeBoundingBox();
  assert.ok(Math.abs(g.boundingBox.max.z - 1) < 1e-6 && Math.abs(g.boundingBox.min.z + 1) < 1e-6);
});

test('TT4: a named Pink Paw kitten (lite) is inked from its own skinned body; a full-detail cat keeps the fitted shapes', () => {
  const k = C.buildKitten(C.lostKittenConfig('pickles')); k.update(1 / 60);
  assert.ok(k.lite);
  const hull = buildOutline(k, { skeleton: k.skeleton });
  assert.ok(hull, 'a hull');
  const body = k.kitMesh.geometry.attributes.position.count;
  assert.ok(hull.geometry.attributes.position.count >= body, `the hull carries the body's ${body} vertices`);
  const w = hull.geometry.attributes.skinWeight;
  let multi = 0;
  for (let i = 0; i < w.count; i++) if (w.getY(i) > 0) multi++;
  assert.ok(multi > 0, 'blended skin weights (the tail bends smoothly, no per-bone capsules)');
  assert.ok(hull.material.polygonOffset && hull.material.polygonOffsetFactor === OUTLINE.bareOffset[0], 'pushed back in depth under the tunic');
});

test('TT4: the Token Tails Cat\'s arms and legs get short shell fur (no bare tubes)', () => {
  const tt = C.tokentailsCatConfig();
  assert.equal(tt.furLimbs, true);
  assert.ok(LIMB_FUR > 0 && LIMB_FUR < 1);
  const k = C.buildKitten(tt); k.update(1 / 60);
  const furTail = k.tailFur?._src ?? k.tailFur?.mesh?.geometry;
  const plain = C.buildKitten({ ...tt, furLimbs: false }); plain.update(1 / 60);
  const plainTail = plain.tailFur?._src ?? plain.tailFur?.mesh?.geometry;
  assert.ok(furTail && plainTail && furTail.attributes.position.count > plainTail.attributes.position.count, 'the limb shells ride the ear / tail fur part');
});

test('TT4: Clem\'s tail curls out to her left, slimmer, with shorter fur', () => {
  const c = C.swordcatConfig();
  assert.ok(c.tail.curve.at(-1)[0] > 0.15, 'the tip sits out to her left side, not over the cape');
  assert.ok(c.tail.thick < 0.95 && c.tail.fur < 1.75);
});

test('TT4: the coin leaves her paw in front of her and still turns 8 m out', () => {
  const ctx = fakeCtx(); const p = ctx.player; p.pos.set(0, 0, 0); ctx.physics = null;
  const coin = new CoinToss(ctx, p);
  coin.throw(0, 1);
  assert.ok(Math.abs(coin.origin.z - TRICKS.coin.spawnFwd) < 1e-9 && coin.origin.x === 0, 'origin in front of her');
  let far = 0;
  for (let t = 0; t < 1 && coin.active; t += 1 / 60) { coin.update(1 / 60); far = Math.max(far, coin.pos.z); }
  assert.ok(Math.abs(far - TRICKS.coin.range) < 0.05, `apex ${far}`);
});

test('TT4: the twirl rotor bow sits on her crown; the Stand shows the flat-blade block pose', () => {
  assert.ok(TRICK_POSE.rotor.at[1] > 0.3 && TRICK_POSE.rotor.scale > 1 && TRICK_POSE.bodySpin > 0);
  assert.ok(EXTRA_POSE_NAMES.includes('block') && POSES.block);
  const sw = POSES.block.sword;
  assert.equal(sw.mode, 'hand');
  assert.ok(Math.abs(sw.dir[0]) > 0.9 && Math.abs(sw.dir[1]) < 0.3, 'the blade lies across her');
  assert.ok(POSES.block.arms.L.paw && POSES.block.arms.R.grip != null, 'both paws on it');
});

test('TT4: wave and boop keep the sword in her right paw (never stood up beside her); the cheer fist clears her head', () => {
  for (const n of ['wave', 'boop']) assert.equal(POSES[n].sword.mode, 'hand', n);
  const g = POSES.cheer.sword.guard;
  assert.ok(Math.hypot(g[0], g[1] - 0.62) > 0.32, `cheer grip ${g} outside the head`);
});

test('TT4: story brows only for faces with a clear brow angle; the slow blink is the happy squint', () => {
  assert.ok(Math.abs(EXPRESSIONS.happy.brow[0]) < BROW_MIN_DEG && Math.abs(EXPRESSIONS.neutral.brow[0]) < BROW_MIN_DEG);
  for (const x of ['worried', 'sad', 'angry', 'grumpy']) assert.ok(Math.abs(EXPRESSIONS[x].brow[0]) >= BROW_MIN_DEG, x);
  assert.ok(C.swordcatConfig().eyes.lash < 1, 'a finer lash line');
});

test('TT4: the pad Meow is D-pad ↓; L3 held peeks and shows the ranges; glyphs follow', () => {
  assert.deepEqual(INPUT.pad.meow, [13]);
  assert.deepEqual(INPUT.pad.peek, [10]); assert.deepEqual(INPUT.pad.ranges, [10]);
  assert.equal(actionGlyph('meow', 'pad'), 'D-pad ↓');
  assert.match(actionGlyph('peek', 'pad'), /L3/);
  const used = new Map();
  for (const [a, codes] of Object.entries(INPUT.pad)) for (const c of codes) if (!/^nav|confirm|back$/.test(a)) (used.get(c) ?? used.set(c, []).get(c)).push(a);
  assert.deepEqual(used.get(13).filter((a) => !['meow'].includes(a)), [], 'D-pad ↓ does only Meow in play');
});

test('TT4: the chest lines name the open button on touch and pad; the touch sword keycap is an icon', () => {
  for (const k of ['onb.chest.pad', 'onb.chest.touch', 'onb.chest.near', 'onb.chest.near.touch']) assert.match(ONBOARDING_STRINGS[k], /\[Interact\]/, k);
  assert.match(glyphify('Open the chest! [Interact]', 'pad'), />Y</);
  assert.match(glyphify('Tap the chest or [Interact] to open it!', 'touch'), />!</);
  const sw = keyCapInner('⚔');
  assert.match(sw, /<svg class="ico-sword"/); assert.match(sw, /ui-key-a11y">⚔</);
  assert.equal(keyCapInner('E'), 'E');
  assert.ok(BARN_GUIDE.delay >= 2, 'the Suit Up bubble waits for the 2 s "Yard clear!" bark');
});

test('TT4: landscape herFrame keeps her ring above the ability bar (herBottomPad); portrait unchanged', () => {
  const F = CAMERA.iso.frame;
  assert.ok(F.herBottomPad > 0);
  const land = new SafeFrame().rebuild(1280, 720, null, [{ x: 330, y: 620, w: 620, h: 100, kind: 'bar' }], false);
  assert.ok(land.herFrameCalm.y1 <= land.core.y1 - F.herBottomPad + 1e-9, 'calm walking: raised bottom');
  assert.ok(land.herFrame.y1 > land.herFrameCalm.y1, 'fights keep the full frame');
  const port = new SafeFrame().rebuild(390, 844, null, [], true);
  assert.equal(port.herFrameCalm.y1, port.herFrame.y1, 'portrait unchanged');
  assert.ok(CAMERA.iso.portraitWidth < 9, 'portrait shows her bigger');
});
