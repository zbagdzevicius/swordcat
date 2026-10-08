// tests/smoke/characters.mjs  (owner: characters) — the procedural cast in the running game (GAME_DESIGN §3, §18.3,
// §19.10 M1; research/art.md §2–§7):
//   characters:r1     the player's Swordcat against the R1 checklist (bow on the LEFT ear, eyes ≈ 0.09 H, pauldrons ≥ head
//                     width, cape V-frame behind her, sword ≈ her height, ginger with a cream bib), the scene-driven
//                     character env map, MEME_LOOP + full-body screenshots at prologue night and meadow day
//   characters:cast   the M1 cast spawned through the real services: Pearl, Whiskerbottom, Marmalade, Mochi, the six
//                     squires, a caged lost kitten, the CS-02 hyena with Pearl's cage, Cacklejaw and Pilfer
//   characters:props  cutscene props (milk cup, lantern, spoon, letter, pot helm) in her paws + world props and cages
//   characters:holy   setHoly ladder on the hero (aura hull, blade charge), fur quality switch with core QUALITY
// Screenshots → tests/shots/characters/*.png. Works against the dev server and the bundled game (no /src imports:
// the library is reached through any kitten, `root.userData.kitten.constructor.lib`).
import fs from 'node:fs';
import path from 'node:path';

const dir = (t) => fs.mkdirSync(path.join(t.shotsDir, 'characters'), { recursive: true });

/** Poll a page predicate (via t.G) until truthy or the timeout; returns the last value. */
async function until(t, fn, arg, ms = 10000, every = 150) {
  const end = Date.now() + ms;
  let v = await t.G(fn, arg);
  while (!v && Date.now() < end) { await t.wait(every); v = await t.G(fn, arg); }
  return v;
}

/** Put the camera on a static shot in Swordcat's local frame (+Z = her facing, +X = her left). */
const camShot = (t, pos, look, fov = 32, frames = 40) => t.G(async ([p, l, f, n]) => {
  const g = window.__GAME__;
  g.ctx.cam.shot({ pos: p, look: l, fov: f, anchor: 'swordcat' });
  await g.waitFrames(n);
}, [pos, look, fov, frames]);

/** Freeze gameplay for staging: scripted player in `pose`, cutscene mode (AI and input idle), god on. */
const stage = (t, pose = 'vigil') => t.G(async (ps) => {
  const g = window.__GAME__, ctx = g.ctx, p = ctx.player;
  g.god(true);
  p.setScripted(true); p.pose(ps);
  ctx.game.setMode('cutscene');
  await g.waitFrames(5);
}, pose);

const unstage = (t) => t.G(async () => {
  const g = window.__GAME__, ctx = g.ctx, p = ctx.player;
  p.object3d.visible = true;
  p.setScripted(false); p.pose('idle');
  ctx.game.setMode('play'); ctx.cam.mode('follow', { blend: false });
  await g.waitFrames(3);
});

export default [
  {
    name: 'characters:r1', order: 30, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      dir(t);
      const ok = await until(t, () => !!window.__GAME__.ctx.player?.model?.k, null, 15000);
      if (!t.assert(ok, 'the player renders the characters Swordcat (player.model.k = buildKitten)')) return;
      await stage(t, 'vigil');
      await t.G(() => window.__GAME__.waitFrames(40));
      const m = await t.G(() => {
        const g = window.__GAME__, THREE = g.THREE, ctx = g.ctx, k = ctx.player.model.k;
        k.root.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(k.root.matrixWorld).invert();
        const loc = (o) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
        const box = (geo) => { geo.computeBoundingBox(); return geo.boundingBox; };
        const bow = k.bow ? loc(k.bow) : null;
        const headS = k.rig.head.getWorldScale(new THREE.Vector3()).x / k.root.getWorldScale(new THREE.Vector3()).x;
        const eb = box(k.eyes.eyes[0].eye.geometry), eye = (eb.max.x - eb.min.x) * headS;
        // pauldron line (kit vertices skinned to the chest joint) vs skull width (head fur base surface)
        const pos = k.kitMesh.geometry.attributes.position, si = k.kitMesh.geometry.attributes.skinIndex;
        const chestIdx = k.rig.bones.indexOf(k.rig.chest);
        let minX = Infinity, maxX = -Infinity;
        for (let i = 0; i < pos.count; i++) if (si.getX(i) === chestIdx) { const x = pos.getX(i); if (x < minX) minX = x; if (x > maxX) maxX = x; }
        const hb = box(k.headFur.mesh.geometry), skullW = (hb.max.x - hb.min.x) * headS;
        const sword = k.sword ? loc(k.sword.tip).distanceTo(loc(k.sword.pommel)) : 0;
        const cb = k.cape ? box(k.cape.geo) : null;
        const hsl = (hex) => { const c = new THREE.Color(hex), o = {}; c.getHSL(o); return o; };
        const coat = k.cfg.coat, base = hsl(coat.base), bib = hsl(coat.bib ?? coat.cream);
        return {
          bow: bow && bow.toArray(), bowParent: k.bow?.parent?.name, eye, shoulderW: maxX - minX, skullW, sword,
          cape: k.cape ? { visible: k.cape.mesh.visible, maxZ: cb.max.z, topW: k.cape.d.topW, botW: k.cape.d.botW, style: k.capeStyle } : null,
          baseH: base.h, baseS: base.s, baseL: base.l, bibL: bib.l,
          envMap: !!k.kitMat.envMap, envColors: !!k.constructor.lib?.characterEnvColors?.(),
          shells: k.headFur.shells, furBlended: !!k.furMat?.transparent, calls: k.drawCalls(), pose: k.poseName,
        };
      });
      t.log(`R1: bow ${m.bow?.map((v) => v.toFixed(2))} on ${m.bowParent}; eye ${m.eye.toFixed(3)} H; pauldrons ${m.shoulderW.toFixed(3)} vs skull ${m.skullW.toFixed(3)}; sword ${m.sword.toFixed(2)} H; cape ${JSON.stringify(m.cape)}; calls ${m.calls}; shells ${m.shells}`);
      t.assert(m.bow && m.bow[0] > 0.04 && m.bow[1] > 0.8 && m.bow[1] < 1.08 && m.bowParent === 'earL', `R1 bow on her LEFT ear (local ${m.bow})`);
      t.assert(m.eye > 0.08 && m.eye < 0.1, `R1 eyes ≈ 0.09 H (got ${m.eye.toFixed(3)})`);
      t.assert(m.shoulderW >= m.skullW, `R1 pauldrons ≥ head width (${m.shoulderW.toFixed(3)} vs ${m.skullW.toFixed(3)})`);
      t.assert(m.sword > 0.92 && m.sword < 1.08, `R1 sword ≈ her height (${m.sword.toFixed(3)} H)`);
      t.assert(m.cape && m.cape.visible && m.cape.botW > m.cape.topW, 'R1 cape V-frame (flares toward the hem)');
      t.assert(m.cape && m.cape.maxZ < 0.12, `cape hangs behind her (max local z ${m.cape?.maxZ.toFixed(3)})`);
      t.assert(m.baseH > 0.04 && m.baseH < 0.11 && m.baseS > 0.4 && m.bibL > m.baseL, 'R1 ginger coat with a lighter cream bib');
      t.assert(m.envMap && m.envColors, 'character env map built from the live scene lights (polished plate)');
      t.assert(m.shells > 0 && m.furBlended, `shell fur on (${m.shells} shells, soft-blended)`);
      t.assert(m.calls <= 24, `hero draw calls ${m.calls} (budget 24)`);

      // ---- prologue night (meadow before prologue.done): Meme Cam framing in Vigil, then full body
      await t.G(async () => { const g = window.__GAME__; g.ctx.cam.preset('MEME_LOOP', 'swordcat'); await g.waitFrames(50); });
      await t.shot('characters/r1-meme-vigil-night');
      await t.blankCheck('r1 meme night');
      await camShot(t, [0, 0.62, 2.7], [0, 0.5, 0], 32);
      await t.shot('characters/r1-front-night');
      // ---- meadow day (the chapter-1 look)
      await t.G(async () => { const g = window.__GAME__; g.ctx.env.preset('meadow_day', 0); await g.waitFrames(45); });
      await t.shot('characters/r1-front-day');
      await camShot(t, [-1.6, 0.55, 1.9], [0, 0.55, 0], 32);
      await t.shot('characters/r1-three-quarter-day');
      await camShot(t, [0.6, 0.85, -2.2], [0, 0.5, 0], 36);
      await t.shot('characters/r1-back-day');
      const capeBack = await t.G(() => { const k = window.__GAME__.ctx.player.model.k; k.cape.geo.computeBoundingBox(); return k.cape.geo.boundingBox.min.z; });
      t.assert(capeBack < -0.12, `cape drapes down her back (min local z ${capeBack.toFixed(3)})`);
      // the meme pose: Oath in MEME_LOOP (sword vertical before her face)
      await t.G(async () => { const g = window.__GAME__, p = g.ctx.player; p.pose('oath'); g.ctx.cam.preset('MEME_LOOP', 'swordcat'); await g.waitFrames(60); });
      await t.shot('characters/r1-meme-oath-day');
      const oath = await t.G(() => {
        const g = window.__GAME__, k = g.ctx.player.model.k, THREE = g.THREE;
        k.root.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(k.root.matrixWorld).invert();
        const tip = k.sword.tip.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
        const guard = k.sword.grip.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
        return { tip: tip.toArray(), grip: guard.toArray() };
      });
      t.assert(oath.tip[1] > 1.2 && oath.tip[0] < 0, `oath: blade up past her head on her right (tip ${oath.tip.map((v) => v.toFixed(2))})`);
      await unstage(t);
      // gameplay distance (follow camera): the fur must read as a soft ginger ball, not noise
      await t.G(() => window.__GAME__.waitFrames(45));
      await t.shot('characters/r1-follow-day');
      // the real Meme Cam trigger (player + camera): the hero cape cross-fades to the looping sway
      await t.G(async () => { const g = window.__GAME__; g.idle(16); await g.waitFrames(150); });
      const meme = await t.G(() => { const g = window.__GAME__, k = g.ctx.player.model.k; return { cam: g.ctx.cam.modeName, capeW: k.cape?.w ?? null, memeT: g.ctx.cam.memeT }; });
      t.log(`meme cam: camera ${meme.cam}, cape sway weight ${meme.capeW}, loop t ${meme.memeT?.toFixed?.(2)}`);
      if (meme.cam === 'meme') {
        t.assert(meme.capeW > 0.95, `Meme Cam: hero cape on the looping sway (w ${meme.capeW})`);
        await t.shot('characters/r1-memecam-day');
        await t.blankCheck('r1 memecam');
      } else t.warn('Meme Cam did not engage (player/camera area); cape sway not checked');
    },
  },
  {
    name: 'characters:cast', order: 31, level: 'meadow', spawn: 'start', timeout: 200000,
    async run(t) {
      dir(t);
      await stage(t, 'vigil');
      await t.G(async () => { const g = window.__GAME__; g.ctx.env.preset('meadow_day', 0); g.ctx.player.object3d.visible = false; await g.waitFrames(5); });
      // spawn the cast in her local frame (z ahead, x to her left), facing her
      const spawned = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, p = ctx.player;
        const f = p.facing, P = p.pos, out = { npcs: [], enemies: [], errors: [] };
        const at = (x, z) => new THREE.Vector3(P.x + x * Math.cos(f) + z * Math.sin(f), 0, P.z - x * Math.sin(f) + z * Math.cos(f));
        const face = f + Math.PI;
        const npc = (id, x, z, pose) => {
          try { const a = ctx.companions.spawnNpc(id, at(x, z), face); if (pose) a.pose?.(pose); out.npcs.push(id); } catch (e) { out.errors.push(`${id}: ${e.message}`); }
        };
        // court + companions (row 1, 3.2 m ahead)
        npc('pearl', 1.5, 3.2); npc('whiskerbottom', 0.5, 3.4); npc('marmalade', -0.6, 3.4); npc('mochi', -1.6, 3.2);
        // squires at the height chart (row 2, 6.2 m ahead) + a caged lost kitten
        for (let i = 0; i < 6; i++) npc('squire_' + (i + 1), 2.6 - i * 0.95, 6.2);
        try { ctx.companions.spawnKitten('biscuit', at(-3.4, 6.0), 'cage', { facing: face }); out.npcs.push('biscuit'); } catch (e) { out.errors.push('biscuit: ' + e.message); }
        // CS-02 villains (row 3, 10 m ahead): a hyena raider carrying Pearl's cage, Cacklejaw, Pilfer
        const foe = (type, x, z, opts) => {
          try { const e = ctx.enemies.spawn(type, at(x, z), { facing: face, scripted: true, ai: false, ...opts }); out.enemies.push(e?.def?.id ?? type); } catch (e) { out.errors.push(`${type}: ${e.message}`); }
        };
        foe('hyena', 1.6, 10, { id: 'smoke_hyena', cage: 'pearl', word: 'HATER' });
        foe('cacklejaw', -0.2, 10.6, { id: 'cacklejaw' });
        foe('pilfer', -2.0, 10, { id: 'pilfer' });
        return out;
      });
      t.log(`cast: ${spawned.npcs.join(', ')} | ${spawned.enemies.join(', ')}${spawned.errors.length ? ' | errors: ' + spawned.errors.join('; ') : ''}`);
      t.assert(!spawned.errors.length, `cast spawns without errors (${spawned.errors.join('; ')})`);
      // every cat is a buildKitten; the beasts wear our heads and plates (their GLBs load async)
      const ready = await until(t, () => {
        const ctx = window.__GAME__.ctx;
        const names = new Set();
        ctx.scene.traverse((o) => { if (o.name) names.add(o.name.split(':')[0] + ':' + (o.name.split(':')[1] ?? '')); });
        const has = (n) => names.has(n);
        const cats = ['pearl', 'whiskerbottom', 'marmalade', 'mochi', 'squire_1', 'squire_6', 'biscuit'].every((id) => has('kitten:' + id));
        let heads = 0, plates = 0;
        ctx.scene.traverse((o) => { if (o.name?.startsWith('beastHead:')) heads++; if (o.name?.startsWith('plate:')) plates++; });
        return cats && heads >= 3 && plates >= 3 ? { heads, plates, cage: has('cage:carry') || has('cage:cart') || has('cage:hanging') || has('cage:kennel') } : null;
      }, null, 20000);
      t.assert(!!ready, 'all cats are buildKitten roots and 3 beasts wear beast heads + breastplate words');
      if (ready) t.assert(ready.cage, 'cages built (caged lost kitten / Pearl\'s carried cage)');
      await t.G(() => window.__GAME__.waitFrames(30));
      await camShot(t, [0, 0.95, 0.4], [0, 0.55, 3.3], 40);
      await t.shot('characters/cast-court');
      await t.blankCheck('cast court');
      await camShot(t, [0, 1.25, 2.6], [-0.4, 0.45, 6.2], 42);
      await t.shot('characters/cast-squires');
      await camShot(t, [0, 1.45, 5.6], [0, 0.95, 10.2], 40);
      await t.shot('characters/cast-cs02');
      await camShot(t, [1.6, 1.0, 8.2], [1.6, 0.85, 10], 36);
      await t.shot('characters/cast-hyena-close');
      const st = await t.state();
      t.log(`cast scene: ${st.calls} calls, ${(st.tris / 1000).toFixed(0)}k tris`);
      await unstage(t);
    },
  },
  {
    name: 'characters:props', order: 32, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      dir(t);
      await stage(t, 'sip');
      const r = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, p = ctx.player, k = p.model.k, lib = k.constructor.lib;
        ctx.env.preset('meadow_day', 0);
        p.prop('milk_cup', true);                                 // ScriptedActor prop → player → kitten.setProp
        const inPaw = !!k.props.milk_cup?.parent;
        // world props + every cage style on a shelf 1.6 m ahead
        const shelf = new THREE.Group(); shelf.name = 'smoke:props';
        const f = p.facing; shelf.position.copy(p.pos); shelf.rotation.y = f;
        const items = ['lantern', 'spoon', 'letter', 'pot_helm', 'colander', 'milk_bottle', 'signpost', 'post_bag', 'soup_bowl', 'jester_hat', 'postmaster_hat', 'cot'];
        const built = [];
        items.forEach((n, i) => {
          const o = lib.buildProp(n, n === 'lantern' ? { light: true } : {});
          if (!o) return;
          o.position.set(1.7 - (i % 6) * 0.68, n === 'jester_hat' || n === 'postmaster_hat' ? 0.05 : 0, 1.6 + Math.floor(i / 6) * 1.1);
          o.rotation.y = Math.PI;
          shelf.add(o); built.push(n);
        });
        ['carry', 'hanging', 'cart', 'kennel'].forEach((style, i) => {
          const c = lib.buildCage({ style, ribbon: style === 'carry' });
          c.position.set(1.6 - i * 1.05, 0, 3.6); c.rotation.y = Math.PI; c.userData.setOpen?.(i === 3 ? 1 : 0);
          shelf.add(c); built.push('cage:' + style);
        });
        ctx.scene.add(shelf);
        await g.waitFrames(30);
        return { inPaw, built, names: lib.PROP_NAMES.length };
      });
      t.assert(r.inPaw, 'prop("milk_cup") puts the cup in her paw (ScriptedActor → kitten.setProp)');
      t.assert(r.built.length >= 14, `props and cages build (${r.built.join(', ')})`);
      await t.G(async () => { const g = window.__GAME__; g.ctx.cam.preset('MEME_LOOP', 'swordcat'); await g.waitFrames(40); });
      await t.shot('characters/props-sip');
      await camShot(t, [0, 1.3, -0.6], [0, 0.35, 2.6], 46);
      await t.shot('characters/props-shelf');
      await t.blankCheck('props');
      await t.G(() => {
        const ctx = window.__GAME__.ctx, k = ctx.player.model.k;
        ctx.player.prop('milk_cup', false);
        const s = ctx.scene.getObjectByName('smoke:props');
        s?.removeFromParent();
        s?.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
        return !k.props.milk_cup?.parent;
      });
      await unstage(t);
    },
  },
  {
    name: 'characters:holy', order: 33, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      dir(t);
      await stage(t, 'oath');
      const r = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, k = ctx.player.model.k;
        ctx.env.preset('meadow_day', 0);
        ctx.cam.preset('MEME_LOOP', 'swordcat');
        await g.waitFrames(30);
        k.setHoly(1);
        await g.waitFrames(20);
        const aura = k.auraMeshes?.every((m) => m.visible) ?? false;
        const fur = k.furMat?.uniforms.uHoly.value ?? 0;
        return { aura, fur, charge: k.holy };
      });
      t.assert(r.aura && r.fur > 0.9, 'setHoly(1): aura hull + gold fur rim');
      await t.shot('characters/holy-oath');
      await t.blankCheck('holy');
      const q = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, k = ctx.player.model.k;
        k.setHoly(0);
        const out = {};
        for (const name of ['low', 'high', 'med']) {
          g.quality(name);
          await g.waitFrames(3);
          out[name] = { hero: k.headFur.shells, want: ctx.config.QUALITY[name].furShells };
        }
        return out;
      });
      t.log(`fur shells per quality: ${JSON.stringify(q)}`);
      t.assert(['low', 'high', 'med'].every((n) => q[n].hero === q[n].want), 'core QUALITY.furShells drives the hero fur shells');
      await unstage(t);
    },
  },
];
