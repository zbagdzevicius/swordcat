// tests/smoke/characters.mjs  (owner: characters) — the procedural cast in the running game (GAME_DESIGN §3, §18.3,
// §19.10 M1; research/art.md §2–§7):
//   characters:r1     the player's Swordcat against the R1 checklist (bow on the LEFT ear, eyes ≈ 0.09 H, pauldrons ≥ head
//                     width, cape V-frame behind her, sword ≈ her height, ginger with a cream bib), the scene-driven
//                     character env map, MEME_LOOP + full-body screenshots at prologue night and meadow day
//   characters:cast   the M1 cast spawned through the real services: Pearl, Whiskerbottom, Marmalade, Mochi, the six
//                     squires, a caged lost kitten, the CS-02 hyena with Pearl's cage, Cacklejaw and Pilfer
//   characters:props  cutscene props (milk cup, lantern, spoon, letter, pot helm, CS-01 helmet) in her paws / on her head
//                     + world props and cages
//   characters:holy   setHoly ladder on the hero (aura hull, blade charge), fur quality switch with core QUALITY
// M2 (§19.10 Acts I–II):
//   characters:m2cast Sage, Clover, Mochi, Tofu, Earl Grey, Pip, Marmalade, hub residents (activity poses / props) and the
//                     Spoon Brigade (lite tier, pot helms, spoon throw) spawned through companions.spawnNpc
//   characters:skins  the 7 sword skins (§13.4; GLB skins fitted by core, the claymore tip drags on the ground) and the 7
//                     capes (§13.5) on the hero, the bow staying pink on her left ear
//   characters:warm   the hero's shader warm-up (no program compiles on the first Holy charge) and the fur distance LOD
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
    name: 'characters:r1', order: 30, level: 'meadow', spawn: 'start', timeout: 300000,
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
        const ao = k.cape?.geo.attributes.capeAO;
        let aoMin = 1; if (ao) for (let i = 0; i < ao.count; i++) aoMin = Math.min(aoMin, ao.getX(i));
        const hsl = (hex) => { const c = new THREE.Color(hex), o = {}; c.getHSL(o); return o; };
        const coat = k.cfg.coat, base = hsl(coat.base), bib = hsl(coat.bib ?? coat.cream);
        return {
          bow: bow && bow.toArray(), bowParent: k.bow?.parent?.name, eye, shoulderW: maxX - minX, skullW, sword,
          cape: k.cape ? { visible: k.cape.mesh.visible, maxZ: cb.max.z, topW: k.cape.d.topW, botW: k.cape.d.botW, style: k.capeStyle, grid: [k.cape.rc, k.cape.rr], aoMin } : null,
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
      t.assert(m.cape && m.cape.grid[0] >= 25 && m.cape.aoMin < 0.8, `cape renders soft folds (grid ${m.cape?.grid}, fold shade ${m.cape?.aoMin?.toFixed(2)})`);
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
    name: 'characters:cast', order: 31, level: 'meadow', spawn: 'start', timeout: 300000,
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
    name: 'characters:props', order: 32, level: 'meadow', spawn: 'start', timeout: 240000,
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
        const items = ['lantern', 'spoon', 'letter', 'pot_helm', 'colander', 'milk_bottle', 'signpost', 'post_bag', 'soup_bowl', 'jester_hat', 'postmaster_hat', 'cot', 'helmet'];
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
          c.position.set(1.6 - i * 1.05, 0, 4.9); c.rotation.y = Math.PI; c.userData.setOpen?.(i === 3 ? 1 : 0);
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
      // CS-01 shot 7: the too-big helm slides over her eyes, then she holds it ('helmet@paw' through the plain prop())
      const helm = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, p = ctx.player, k = p.model.k;
        p.prop('milk_cup', false); p.pose('idle');
        p.prop('helmet', true);
        ctx.cam.preset('MEME_LOOP', 'swordcat');
        await g.waitFrames(40);
        const worn = k.props.helmet?.parent?.name;
        return { worn };
      });
      t.assert(helm.worn === 'head', `prop('helmet') sits on her head (${helm.worn})`);
      await t.shot('characters/props-helmet-worn');
      const held = await t.G(async () => {
        const g = window.__GAME__, p = g.ctx.player, k = p.model.k;
        p.prop('helmet@paw', true);
        await g.waitFrames(30);
        const r = k.props.helmet?.parent?.name;
        p.prop('helmet', false);
        return { r, gone: !k.props.helmet?.parent };
      });
      t.assert(held.r === 'pawL' && held.gone, `prop('helmet@paw') moves it to her paw, prop('helmet', false) removes it (${held.r})`);
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
    name: 'characters:holy', order: 33, level: 'meadow', spawn: 'start', timeout: 180000,
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
  // ================================================================== M2 (Acts I–II)
  {
    name: 'characters:m2cast', order: 34, level: 'meadow', spawn: 'start', timeout: 300000,
    async run(t) {
      dir(t);
      await stage(t, 'vigil');
      await t.G(async () => { const g = window.__GAME__; g.ctx.env.preset('meadow_day', 0); g.ctx.player.object3d.visible = false; await g.waitFrames(5); });
      const ids = {
        companions: ['sage', 'clover', 'mochi'], service: ['tofu', 'earlgrey', 'pip', 'marmalade'],
        hub: ['hub_waffles', 'hub_juniper', 'hub_biscuit', 'hub_pickles'], spoons: ['spoon_tater', 'spoon_mittens', 'spoon_socks', 'spoon_bean'],
      };
      const spawned = await t.G((I) => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, p = ctx.player;
        const f = p.facing, P = p.pos, out = { ok: [], errors: [] };
        const at = (x, z) => new THREE.Vector3(P.x + x * Math.cos(f) + z * Math.sin(f), 0, P.z - x * Math.sin(f) + z * Math.cos(f));
        const face = f + Math.PI;
        const row = (list, z, gap) => list.forEach((id, i) => {
          try { ctx.companions.spawnNpc(id, at((list.length - 1) / 2 * gap - i * gap, z), face); out.ok.push(id); } catch (e) { out.errors.push(`${id}: ${e.message}`); }
        });
        row([...I.companions, ...I.service], 3.4, 0.82);
        row(I.hub, 6.4, 0.9);
        row(I.spoons, 8.6, 0.75);
        return out;
      }, ids);
      t.log(`m2 cast: ${spawned.ok.join(', ')}${spawned.errors.length ? ' | errors: ' + spawned.errors.join('; ') : ''}`);
      t.assert(!spawned.errors.length, `M2 cast spawns without errors (${spawned.errors.join('; ')})`);
      const all = [...ids.companions, ...ids.service, ...ids.hub, ...ids.spoons];
      const info = await until(t, (list) => {
        const ctx = window.__GAME__.ctx, found = {};
        ctx.scene.traverse((o) => { if (o.name?.startsWith('kitten:') && o.userData.kitten) found[o.name.slice(7)] = o.userData.kitten; });
        if (!list.every((id) => found[id])) return null;
        const r = {};
        for (const id of list) {
          const k = found[id];
          const names = new Set(); k.root.traverse((o) => names.add(o.name));
          r[id] = { tier: k.tier, lite: k.lite, calls: k.drawCalls(), pose: k.poseName, props: Object.keys(k.props).filter((n) => k.props[n].parent), names: [...names].filter(Boolean).slice(0, 60) };
        }
        return r;
      }, all, 20000);
      if (!t.assert(!!info, 'every M2 cat is a buildKitten root (named, hub and Spoon Brigade ids resolve through catConfig)')) return;
      // hub residents and the brigade are the cheap tier with their activity pose / props
      t.assert(ids.spoons.every((id) => info[id].lite && info[id].pose === 'spoonReady' && info[id].props.includes('spoon')),
        `Spoon Brigade: lite tier (sheen fur), spoonReady stance, spoon in paw (${ids.spoons.map((id) => `${id}:${info[id].tier}/${info[id].pose}/${info[id].props}`).join(' ')})`);
      t.assert(ids.spoons.every((id) => info[id].props.includes('pot_helm') || info[id].props.includes('colander')), 'Spoon Brigade wear pot helms / colanders');
      t.assert(info.hub_waffles.pose === 'wave' && info.hub_juniper.pose === 'read' && info.hub_biscuit.pose === 'fish' && info.hub_biscuit.props.includes('fishing_rod'),
        `hub kittens take their §12.5 activity (${['hub_waffles', 'hub_juniper', 'hub_biscuit'].map((id) => `${id}:${info[id].pose}/${info[id].props}`).join(' ')})`);
      t.assert([...ids.hub, ...ids.spoons].every((id) => info[id].calls <= 7), `lite cats stay cheap (${[...ids.hub, ...ids.spoons].map((id) => info[id].calls).join(',')} calls)`);
      t.assert(['sage', 'clover', 'tofu', 'earlgrey', 'pip'].every((id) => info[id].tier === 'kitten' && !info[id].lite), 'companions + service kittens use the companion fur tier');
      await t.G(() => window.__GAME__.waitFrames(30));
      await camShot(t, [0, 0.82, 0.9], [0, 0.5, 3.4], 44);
      await t.shot('characters/m2-companions', { freeze: true });
      await t.blankCheck('m2 companions');
      await camShot(t, [-1.6, 0.75, 1.9], [-1.2, 0.5, 3.4], 36);
      await t.shot('characters/m2-service', { freeze: true });
      await camShot(t, [0, 1.0, 3.9], [0, 0.35, 6.4], 40);
      await t.shot('characters/m2-hub', { freeze: true });
      // the brigade lobs spoons together (emote 'throw'), captured at the wind-up
      await t.G(async () => {
        const g = window.__GAME__;
        g.ctx.scene.traverse((o) => { if (o.name?.startsWith('kitten:spoon_')) o.userData.kitten.emote('throw'); });
        await g.waitFrames(9);
      });
      await camShot(t, [0, 0.9, 6.6], [0, 0.45, 8.6], 40, 2);
      await t.shot('characters/m2-spoons', { freeze: true });
      // Mochi readability (STATUS M1: too dark): his coat must still read lighter than pure black under day light
      const mochi = await t.G(() => {
        let k = null; window.__GAME__.ctx.scene.traverse((o) => { if (o.name === 'kitten:mochi') k = o.userData.kitten; });
        const u = k?.furMat?.uniforms;
        return u ? { sheen: u.uSheen?.value ?? 0, amb: u.uAmbMul?.value ?? 0 } : null;
      });
      t.log(`mochi fur: ${JSON.stringify(mochi)}`);
      t.assert(mochi && mochi.sheen > 0, 'Mochi gets the dark-coat sky sheen');
      const st = await t.state();
      t.log(`M2 cast scene: ${st.calls} calls, ${(st.tris / 1000).toFixed(0)}k tris`);
      await unstage(t);
    },
  },
  {
    name: 'characters:skins', order: 35, level: 'meadow', spawn: 'start', timeout: 300000,
    async run(t) {
      dir(t);
      await stage(t, 'vigil');
      // a line-up of all 7 sword skins (§13.4) on companion-tier Swordcats next to her; the GLB skins load through core
      const r = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, p = ctx.player, lib = p.model.k.constructor.lib;
        ctx.env.preset('meadow_day', 0);
        const grp = new THREE.Group(); grp.name = 'smoke:skins';
        grp.position.copy(p.pos); grp.rotation.y = p.facing; ctx.scene.add(grp);
        const glb = {};
        for (const [id, path, fit] of [['diamond', 'models/weapons/quaternius/Sword_Diamond.glb', 1.0], ['toobig', 'models/weapons/quaternius/Claymore.glb', 'toobig']]) {
          try { glb[id] = (await ctx.assets.model(path, { fit })).root; } catch (e) { glb[id] = null; }
        }
        const cats = [];
        lib.SWORD_SKINS.forEach((skin, i) => {
          const cfg = { ...lib.CATS.swordcat_red, id: 'skin_' + skin, tier: 'kitten' };
          const k = lib.buildKitten(cfg);
          k.setSword(glb[skin] ? { skin, model: glb[skin].clone(true) } : skin);
          k.setPose(i === 5 ? 'idle' : 'vigil', { blend: 0 });
          k.root.position.set(2.6 - i * 0.86, 0, 2.4); k.root.rotation.y = Math.PI;
          grp.add(k.root); cats.push(k);
        });
        const off = ctx.game.addFrameHook((dt) => { for (const k of cats) k.update(Math.min(dt, 0.05), { frameId: ctx.game.frameCount }); });
        grp.userData.off = off; grp.userData.cats = cats;
        await g.waitFrames(20);
        const out = {};
        for (const k of cats) {
          k.root.updateMatrixWorld(true);
          const inv = new THREE.Matrix4().copy(k.root.matrixWorld).invert();
          const tip = k.sword.tip.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
          out[k.sword.skin] = { tipY: +tip.y.toFixed(3), len: k.sword.length, sparkles: !!k.sword.sparkles, glb: !!k.sword.group.getObjectByName('swordModel') };
        }
        return out;
      });
      t.log(`sword skins: ${JSON.stringify(r)}`);
      t.assert(Object.keys(r).length === 7, 'all 7 sword skins build');
      t.assert(r.diamond?.glb && r.toobig?.glb, 'Diamond Sword and Even More Too Big mount their fitted GLBs');
      t.assert(r.toobig && r.toobig.tipY >= 0 && r.toobig.tipY < 0.06, `Even More Too Big: the tip drags ON the ground (tip y ${r.toobig?.tipY})`);
      t.assert(r.dawnblade?.sparkles, 'Dawnblade carries its 20 sparkles');
      await camShot(t, [0, 0.85, 0.2], [0, 0.45, 2.4], 50);
      await t.shot('characters/skins-swords', { freeze: true });
      await t.blankCheck('skins');
      // the 7 capes (§13.5) on the hero herself; the bow stays pink on her LEFT ear through every swap (hard rule)
      const capes = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, k = ctx.player.model.k, lib = k.constructor.lib;
        const s = ctx.scene.getObjectByName('smoke:skins');
        if (s) { s.userData.off?.(); for (const c of s.userData.cats) c.dispose(); s.removeFromParent(); }
        const out = [];
        for (const id of ['cream', 'red', 'memeWhite', 'blue', 'green', 'midnight', 'gold']) {
          k.setCape(id);
          await g.waitFrames(4);
          const col = k.cape?.mesh.material.uniforms?.uColor?.value ?? k.cape?.mesh.material.color;
          out.push({ id, style: k.capeStyle, color: col ? '#' + col.getHexString() : null, bowParent: k.bow?.parent?.name, bowVisible: !!k.bow?.visible, bowHex: k.cfg.bow?.color });
        }
        k.setCape('red');
        return { out, want: Object.fromEntries(Object.entries(lib.CAPES).map(([key, v]) => [key, v.color.toLowerCase()])) };
      });
      t.log(`capes: ${capes.out.map((c) => `${c.id}=${c.color}`).join(' ')}`);
      t.assert(capes.out.every((c) => c.style === c.id), 'every §13.5 cape equips on the hero');
      t.assert(capes.out.every((c) => c.bowParent === 'earL' && c.bowVisible && /F2A2B8/i.test(c.bowHex)), 'the bow stays pink on her LEFT ear with every cape');
      await t.G(async () => { const g = window.__GAME__; g.ctx.cam.shot({ pos: [0.7, 0.9, -2.2], look: [0, 0.5, 0], fov: 36, anchor: 'swordcat' }); await g.waitFrames(40); });
      await t.shot('characters/skins-cape-red', { freeze: true });
      await t.G(async () => { const g = window.__GAME__, ctx = g.ctx; ctx.player.model._applyCosmetics?.(true); await g.waitFrames(3); });
      await unstage(t);
    },
  },
  {
    name: 'characters:warm', order: 36, level: 'meadow', spawn: 'start', timeout: 180000,
    async run(t) {
      // requests/fx.md + player.md: the first Holy charge / Golden Hour must not compile characters programs mid-fight
      await t.G(() => window.__GAME__.waitFrames(30));
      const r = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, k = ctx.player.model.k;
        const progs = () => ctx.renderer.info.programs?.length ?? -1;
        const before = progs();
        const aura0 = k.auraMeshes.every((m) => !m.visible);
        k.setHoly(1);
        await g.waitFrames(3);
        const after = progs();
        k.setHoly(0);
        await g.waitFrames(2);
        const aura1 = k.auraMeshes.every((m) => !m.visible) && !k.sword.streak.visible;
        return { before, after, warmups: k.warmups ?? 0, aura0, aura1 };
      });
      t.log(`warm-up: ${r.warmups} warm frames; programs ${r.before} → ${r.after} on the first Holy charge`);
      t.assert(r.warmups >= 1, 'the hero rig ran its shader warm-up frame');
      t.assert(r.before > 0 && r.after === r.before, `first Holy charge compiles no new program (${r.before} → ${r.after})`);
      t.assert(r.aura0 && r.aura1, 'warm-up leaves the aura hull and streak hidden at holy 0');
      // fur LOD (requests/world.md): fewer hero shells at the follow distance, none past ~8 m
      const lod = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, k = ctx.player.model.k, lib = k.constructor.lib;
        await g.waitFrames(5);
        const d = ctx.camera.position.distanceTo(k.headFur.mesh.getWorldPosition(new g.THREE.Vector3()));
        return { d: +d.toFixed(2), n: k.headFur._lodN, shells: k.headFur.shells, far: lib.FUR_LOD.far };
      });
      t.log(`fur LOD at ${lod.d} m: ${lod.n}/${lod.shells} shells (off past ${lod.far} m)`);
      if (lod.shells > 0) t.assert(lod.n > 0 && lod.n <= lod.shells, 'hero fur draws a distance-LOD shell count');
      const st = await t.state();
      t.log(`meadow follow view: ${st.calls} calls / ${(st.tris / 1000).toFixed(0)}k tris (scene), frame ${st.frameCalls} / ${(st.frameTris / 1000).toFixed(0)}k`);
    },
  },
];
